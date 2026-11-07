#!/usr/bin/env node
/*
 * bili_frame_server —— 把 B 站视频解码成 240×320 JPEG 帧，供 E6 端「小电视」显示画面
 *
 * 为什么需要它：
 *   E6 的 Falcon 框架 **没有 video 组件**（libfalcon.so / jsfm-nvue.js.bin 里
 *   完全没有 "video" 这个字符串，19 个原生组件里只有 image-frame 这种 GIF/APNG 播放器），
 *   所以设备端不可能原生解码并上屏视频。
 *   但 image 组件能加载远程图片 —— 于是把「解码」搬到服务端：
 *   服务端 ffmpeg 拉 DASH 视频轨 → 缩到 240×320 → 循环给设备吐 JPEG，
 *   设备端用一个 <image> 每 ~120ms 换一次 src，就得到一个低帧率「小电视画面」。
 *
 * 用法：
 *   node tools/bili_frame_server.mjs --bvid BV1SpxR6KE8w --cid 43335288477 --port 8099
 *   node tools/bili_frame_server.mjs --bvid BVxxx --cid xxx --fps 8 --url http://0.0.0.0:8099
 *
 * 接口：
 *   GET /frame.jpg?seq=N   → 当前帧（seq 只为破缓存）
 *   GET /info.json         → { fps, width, height, alive, frames, src }
 *   GET /healthz           → { ok: true }
 *
 * 只监听局域网，且**不做任何鉴权** —— 它会把 B 站视频重新编码后转发出去，
 * 别直接暴露到公网。
 */
import http from 'node:http';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const BVID = opt('bvid', '');
const CID = opt('cid', '');
const PORT = parseInt(opt('port', '8099'), 10);
const FPS = parseInt(opt('fps', '8'), 10);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const API = 'https://api.bilibili.com';

const state = {
  frame: null,          // 最新一帧 JPEG（Buffer）
  frames: 0,            // 已吐帧数
  alive: false,
  src: '',              // 实际拉流的视频 URL
  width: 240,
  height: 320,
  error: '',
  startedAt: 0,
  ff: null,
  bvid: BVID,
  cid: CID,
};

function log(...a) { console.log('[frame-server]', ...a); }

/* ---------------- 解析 DASH 视频轨 ---------------- */
async function resolveVideoUrl(bvidIn, cidIn) {
  const bvid = bvidIn || BVID;
  if (!bvid) throw new Error('需要 --bvid');
  let cid = cidIn || CID;
  if (!cid) {
    const v = await (await fetch(`${API}/x/web-interface/view?bvid=${bvid}`,
      { headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' } })).json();
    if (!v || v.code !== 0 || !v.data) throw new Error('view 失败: ' + (v && v.message));
    cid = v.data.cid;
    log('cid =', cid);
  }
  const p = await (await fetch(
    `${API}/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16&fourk=1`,
    { headers: { 'User-Agent': UA, 'Accept-Encoding': 'identity' } })).json();
  if (!p || p.code !== 0 || !p.data || !p.data.dash || !p.data.dash.video) {
    throw new Error('playurl 失败: ' + (p && p.message));
  }
  const tracks = p.data.dash.video;
  /* 优先 H.264（avc1）—— ffmpeg 解码最快；退而求其次取任何一条 */
  const avc = tracks.find((t) => t.codecs && t.codecs.startsWith('avc1'));
  const pick = avc || tracks[0];
  log(`视频轨 ${tracks.length} 条 → 选 id=${pick.id} codec=${pick.codecs} ${pick.width}x${pick.height} bw=${pick.bandwidth}`);
  return pick.baseUrl;
}

/* ---------------- ffmpeg 拉流 → JPEG 帧 ---------------- */
function startFfmpeg(url) {
  const ff = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '2',
    '-stream_loop', '-1',          /* 循环播，画面持续更新 */
    '-i', url,
    '-vf', `scale=${state.width}:${state.height}`,
    '-r', String(FPS),
    '-q:v', '6',
    '-f', 'image2pipe', '-vcodec', 'mjpeg', '-',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let buf = Buffer.alloc(0);
  ff.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    /* MJPEG 流：按 SOI(FFD8) / EOI(FFD9) 切帧 */
    for (;;) {
      const s = buf.indexOf(Buffer.from([0xff, 0xd8]));
      if (s < 0) { buf = buf.slice(-2); return; }
      const e = buf.indexOf(Buffer.from([0xff, 0xd9]), s + 2);
      if (e < 0) return;
      state.frame = buf.slice(s, e + 2);
      state.frames++;
      buf = buf.slice(e + 2);
      if (!state.alive) {
        state.alive = true;
        state.startedAt = Date.now();
        log(`首帧到达 (${state.frame.length} B) → http://0.0.0.0:${PORT}/frame.jpg`);
      }
    }
  });
  ff.stderr.on('data', (d) => {
    const s = String(d).trim();
    if (s) { state.error = s; log('ffmpeg:', s.slice(0, 200)); }
  });
  ff.on('close', (code) => { state.alive = false; log('ffmpeg 退出', code); });
  state.ff = ff;
  return ff;
}

/* ---------------- HTTP ---------------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (u.pathname === '/info.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({
      fps: FPS, width: state.width, height: state.height,
      alive: state.alive, frames: state.frames,
      bytes: state.frame ? state.frame.length : 0,
      src: state.src, error: state.error,
      bvid: state.bvid, cid: state.cid,
    }));
  }
  if (u.pathname === '/frame.jpg') {
    if (!state.frame) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      return res.end('no frame yet');
    }
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': state.frame.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });
    return res.end(state.frame);
  }
  /* 切换正在转码的视频：GET /set?bvid=XXX&cid=YYY */
  if (u.pathname === '/set') {
    const bvid = u.searchParams.get('bvid') || '';
    const cid = u.searchParams.get('cid') || '';
    if (!bvid) { res.writeHead(400); return res.end('need bvid'); }
    try {
      if (state.ff) { try { state.ff.kill('SIGKILL'); } catch (e) { /* ignore */ } }
      state.ff = null; state.frame = null; state.frames = 0; state.alive = false;
      state.bvid = bvid; state.cid = cid;
      const url = await resolveVideoUrl(bvid, cid);
      state.src = url;
      state.ff = startFfmpeg(url);
      log('切换视频 →', bvid, cid);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, bvid, cid }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '0.0.0.0', async () => {
  log(`监听 0.0.0.0:${PORT} (fps=${FPS} ${state.width}x${state.height})`);
  try {
    const url = await resolveVideoUrl();
    state.src = url;
    startFfmpeg(url);
  } catch (e) {
    state.error = String(e);
    log('启动失败:', e.message);
  }
});
