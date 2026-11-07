<template>
  <div class="page">
    <!-- ================= 顶栏：小电视 + 三个 Tab ================= -->
    <div class="topbar">
      <text class="brand">小电视</text>
      <div class="tabs">
        <div v-for="t in TABS" :key="t.k" class="tab" @click="switchTab(t.k)"
             :style="tab === t.k ? tabOn : tabOff">
          <text :style="tab === t.k ? tabTxtOn : tabTxtOff">{{ t.n }}</text>
        </div>
      </div>
    </div>
    <div class="hairline"></div>

    <!-- ================= 搜索行（仅「搜索」页） ================= -->
    <div v-if="tab === 'search'" class="searchrow">
      <input class="searchbox" placeholder="搜索视频标题" @input="onKw" />
      <text class="hint">输入后自动搜索</text>
    </div>

    <!-- ================= 列表 ================= -->
    <scroller class="pagebox">
      <div v-for="(it, i) in list" :key="it.bvid" class="lrow" @click="play(it)">
        <text class="rank" :style="it.bvid === curBvid ? rankOn : rankOff">{{ i + 1 }}</text>
        <!-- 封面：远程图（B 站图床），验证 image 组件能加载 http(s) 远程图 -->
        <image v-if="it.cover" class="cover" :src="it.cover" mode="aspectFill" />
        <div class="lrow-main">
          <text class="lt" :style="it.bvid === curBvid ? titleOn : titleOff">{{ it.title }}</text>
          <text class="ls">{{ it.owner }} · {{ it.dur }} · {{ it.play }}</text>
        </div>
        <text v-if="it.bvid === curBvid" class="playing">▶</text>
      </div>
      <div v-if="list.length === 0" class="lempty">
        <text :style="{ color: '#6e7681', fontSize: '12px' }">{{ emptyText }}</text>
      </div>
    </scroller>

    <!-- ================= 底栏：状态 + 静音开关 + 停止 ================= -->
    <div class="pagebar">
      <text class="status" :style="{ color: statusColor }">{{ status }}</text>
      <div class="stopbtn" @click="toggleMute">
        <text class="stopbtn-t" :style="{ color: isMuted ? '#f85149' : '#3fb950' }">{{ isMuted ? '静音' : '声音' }}</text>
      </div>
      <div class="stopbtn" @click="stop"><text class="stopbtn-t">停止</text></div>
    </div>

    <!-- ================= 播放遮罩层（播放时吸收全屏点击，防止底层列表被穿透触发） ================= -->
    <div v-if="curBvid" class="play-overlay"></div>
  </div>
</template>

<script>
/*
 * 小电视 —— 网易有道听力宝 E6 上的 B 站客户端
 *
 * 播放链路（全部在设备上，不依赖任何外部服务器）：
 *   ① 音频：App 自己调 B 站 playurl 拿 DASH 音轨 → soundPlayer.playOnlineAudio 直拉 m4s
 *   ② 画面：把同一条 playurl 里的视频轨交给设备端原生播放器 /userdisk/e6_vplay
 *           （它用设备自带 ffmpeg 解码，再经固件的 hal-drmshow 直接写 DRM 屏）
 *
 * 为什么画面要另起一个原生进程：
 *   Falcon 框架没有 video 组件（libfalcon.so 里没有 "video" 字符串），
 *   小程序无法自己解码上屏；而 DRM master 被 miniapp 宿主占着，
 *   只有「宿主之外的独立进程 + drmModeSetCrtc」才能把画面怼到屏上。
 *   实测：e6_vplay 稳定 10fps，点一下屏幕即退出，界面自动交还 App。
 *
 * 关键约束：
 *   · console 只有 warn/error 会进 /userdata/applog/YD_PEN_APP.log
 *   · http.request 只支持 {url, method, headers, timeout} 这一种形状
 *   · B 站请求头：要么全裸 UA，要么全套浏览器头 + buvid3 指纹，半套必 412
 */
import http from 'http';
import process from 'process';
import soundPlayerModule from 'soundPlayer';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const API = 'https://api.bilibili.com';
const PLAYER = '/userdisk/e6_vplay';      /* 设备端原生播放器（src/e6_vplay/） */
const PLAYER_LOG = '/userdisk/vplay.log';

export default {
  data() {
    return {
      tab: 'hot',
      list: [],
      status: '启动中…',
      statusColor: '#8b949e',
      kw: '',
      curBvid: '',
      curCid: 0,
      curTitle: '',
      buvid3: '',
      buvid4: '',
      searchTimer: null,
      videoOn: true,          /* 是否同时起原生播放器出画面 */
      isMuted: false,         /* 默认开启温和音量 (15%)，不震耳 */
      playerReady: false,     /* /userdisk/e6_vplay 是否存在 */
      TABS: [
        { k: 'hot', n: '热门' },
        { k: 'rank', n: '排行' },
        { k: 'search', n: '搜索' }
      ],
      tabOn: {
        backgroundColor: '#fb7299', paddingTop: '3px', paddingBottom: '3px',
        paddingLeft: '8px', paddingRight: '8px', borderRadius: '8px', marginRight: '4px'
      },
      tabOff: {
        backgroundColor: '#161b22', paddingTop: '3px', paddingBottom: '3px',
        paddingLeft: '8px', paddingRight: '8px', borderRadius: '8px', marginRight: '4px'
      },
      tabTxtOn: { color: '#ffffff', fontSize: '11px' },
      tabTxtOff: { color: '#8b949e', fontSize: '11px' },
      rankOn: { color: '#fb7299', fontSize: '10px', width: '18px' },
      rankOff: { color: '#484f58', fontSize: '10px', width: '18px' },
      titleOn: { color: '#fb7299', fontSize: '12px', lines: 1, textOverflow: 'ellipsis' },
      titleOff: { color: '#e6edf3', fontSize: '12px', lines: 1, textOverflow: 'ellipsis' }
    };
  },

  created() {
    this._sp = new soundPlayerModule.SoundPlayer();
    console.warn('[bili] created');
    this.checkPlayer();
    this.boot();
  },

  methods: {
    emptyText() {
      if (this.status && this.status.indexOf('失败') >= 0) return '加载失败，点「热门」重试';
      if (this.tab === 'search' && !this.kw) return '输入关键词开始搜索';
      return '加载中…';
    },

    /* ---------- 底层请求 ---------- */
    headers() {
      /* 请求头组合是 B 站风控的关键（2026-11-06 实测）：
           · 只带 UA                  → view/playurl/popular 正常，search 412
           · 半套头（UA+Referer 之类）→ view 必 412
           · 全套浏览器头 + buvid3   → 全部 200
         所以这里统一用「全套 + 指纹 cookie」，不要精简。 */
      const h = {
        'User-Agent': UA,
        'Referer': 'https://www.bilibili.com/',
        'Origin': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        /* 关键：B 站会按 Accept-Encoding 回 gzip，设备 http 模块解压能力未验证，
           直接声明 identity 强制明文 JSON */
        'Accept-Encoding': 'identity',
        'sec-ch-ua': '"Chromium";v="126"',
        'sec-fetch-site': 'same-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty'
      };
      if (this.buvid3) {
        h['Cookie'] = 'buvid3=' + this.buvid3 + (this.buvid4 ? '; buvid4=' + this.buvid4 : '');
      }
      return h;
    },

    async apiGet(url) {
      try {
        const res = await http.request({
          url: url,
          method: 'GET',
          headers: this.headers(),
          timeout: 15000
        });
        console.warn('[bili] GET', url, 'status=', res && res.status);
        if (!res || res.status !== 200) {
          return { code: -1, message: 'HTTP ' + (res ? res.status : 'null') };
        }
        return JSON.parse(res.body);
      } catch (e) {
        console.error('[bili] GET 异常', url, String(e));
        return { code: -1, message: String(e) };
      }
    },

    /* probeMedia：发一个 Range 请求探测媒体地址是否真能拉（200/206 算通）。
       ⚠️ 只带 UA、不带 Referer —— 要模拟 soundPlayer 的真实请求条件，
          因为 soundPlayer 加不了请求头，带 Referer 探通了它照样 403。 */
    async probeMedia(url) {
      try {
        const res = await http.request({
          url: url,
          method: 'GET',
          headers: {
            'User-Agent': UA,
            'Range': 'bytes=0-2047',
            'Accept-Encoding': 'identity'
          },
          timeout: 12000
        });
        const ok = res && (res.status === 200 || res.status === 206);
        console.warn('[bili] 探测', url.slice(0, 55), '→', res && res.status, ok ? 'OK' : 'FAIL');
        return ok;
      } catch (e) {
        console.warn('[bili] 探测异常', url.slice(0, 55), String(e));
        return false;
      }
    },

    /* ---------- 音频服务就绪检查 ----------
       ⚠️ playOnlineAudio 依赖设备上的 SoundPlayer 服务进程，而它是**按需拉起**的：
       刚启动 App 就直接播，服务要 2~3 秒后才起来 → 那次请求直接丢掉 → 没声音
       （实测：playOnlineAudio 返回了 uuid，但 SoundPlayer 日志里连 openAudioFile 都没有）。
       所以播之前先确认进程在。 */
    async ensureSoundPlayer() {
      for (let i = 0; i < 12; i++) {
        try {
          const r = await process.exec('sh', ['-c', 'ps | grep -c [S]oundPlayer'], { timeout: 5000 });
          const n = parseInt(String((r && r.stdout) || '').trim(), 10);
          if (n > 0) {
            console.warn('[bili] SoundPlayer 就绪', n);
            return true;
          }
        } catch (e) { /* 忽略，继续等 */ }
        console.warn('[bili] 等 SoundPlayer 起来…', i);
        await this.sleep(500);
      }
      console.warn('[bili] SoundPlayer 没起来，继续试播');
      return false;
    },

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    /* ---------- 启动：先拿 buvid3 指纹，再拉列表 ---------- */
    async boot() {
      this.setStatus('获取指纹…', '#8b949e');
      const spi = await this.apiGet(API + '/x/frontend/finger/spi');
      if (spi && spi.code === 0 && spi.data) {
        this.buvid3 = spi.data.b_3 || '';
        this.buvid4 = spi.data.b_4 || '';
        console.warn('[bili] buvid3 ok', this.buvid3.slice(0, 12));
      } else {
        console.warn('[bili] buvid3 失败，继续裸请求', JSON.stringify(spi).slice(0, 120));
      }
      await this.loadList();
      /* 预热音频服务：SoundPlayer 是按需拉起的，起播要 2~3 秒，
         提前拉起来，用户点视频时就不用等 */
      try { this._sp.stop(); } catch (e) { /* 忽略 */ }
      await this.ensureSoundPlayer();
      await this.autoPlayIfRequested();
    },

    /* ---------- 自动播放（调试用） ----------
       设备上放一个 /userdisk/bili_autoplay 文件，内容写 BV 号，App 启动后自动播它。
       用途：自动化验证"点开即播放"整条链路（触屏注入的点击进不了框架手势层，
       没法用注入点击驱动 App）。文件不存在就是正常行为，不影响正常使用。 */
    async autoPlayIfRequested() {
      try {
        /* ⚠️ 别在 process.exec 的命令里加 `2>/dev/null` 之类的重定向：
           实测加了之后 stdout 会变空（框架对命令串做了自己的拆解）。 */
        const r = await process.exec('sh', ['-c', 'cat /userdisk/bili_autoplay'], { timeout: 6000 });
        const bv = String((r && r.stdout) || '').trim().split(/\s+/)[0] || '';
        if (bv.indexOf('BV') !== 0) return;
        console.warn('[bili] 自动播放', bv);
        this.setStatus('自动播放 ' + bv, '#e3b341');
        const hit = this.list.filter(x => x && x.bvid === bv)[0];
        await this.play(hit || { bvid: bv, title: bv, cover: '', owner: '', dur: '', play: '' });
      } catch (e) {
        console.warn('[bili] 自动播放检查失败', String(e));
      }
    },

    /* ---------- 列表 ---------- */
    async loadList() {
      this.setStatus('加载中…', '#8b949e');
      let url = '';
      if (this.tab === 'hot') {
        url = API + '/x/web-interface/popular?ps=30&pn=1';
      } else if (this.tab === 'rank') {
        url = API + '/x/web-interface/ranking/v2?rid=0&type=all';
      } else {
        if (!this.kw) { this.list = []; this.setStatus('输入关键词开始搜索', '#6e7681'); return; }
        url = API + '/x/web-interface/search/type?search_type=video&keyword=' +
              encodeURIComponent(this.kw) + '&page=1';
      }

      const j = await this.apiGet(url);
      if (!j || j.code !== 0) {
        this.list = [];
        this.setStatus('加载失败 ' + ((j && j.message) || '未知'), '#f85149');
        console.warn('[bili] 列表失败', j && j.code, j && j.message);
        return;
      }

      const raw = (j.data && (j.data.list || j.data.result)) || [];
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const v = raw[i];
        if (!v || !v.bvid) continue;
        out.push({
          bvid: v.bvid,
          cid: v.cid || 0,          /* popular/ranking 自带 cid；搜索结果没有，要再查 view */
          title: String(v.title || '').replace(/<[^>]+>/g, ''),
          cover: v.pic ? String(v.pic).replace(/^http:/, 'https:') : '',
          owner: (v.owner && v.owner.name) || (v.author || ''),
          dur: this.fmtDur(v.duration),
          play: this.fmtNum(v.stat ? v.stat.view : v.play)
        });
      }
      this.list = out;
      this.setStatus(out.length + ' 条', '#3fb950');
      console.warn('[bili] 列表 ok', out.length);
    },

    /* ---------- 播放：画面+声音统一由硬件加速播放器接管 ---------- */
    async play(it) {
      if (!it || !it.bvid) return;
      if (this._launching) {
        console.warn('[bili] 正在启动中，忽略重复点击');
        return;
      }
      if (this.curBvid) {
        console.warn('[bili] 正在播放中，点击退出播放并返回列表');
        await this.stop();
        return;
      }
      this._launching = true;
      this.setStatus('解析中…', '#e3b341');
      try {
        let cid = it.cid || 0;
        if (!cid) {
          const v = await this.apiGet(API + '/x/web-interface/view?bvid=' + it.bvid);
          if (!v || v.code !== 0 || !v.data || !v.data.cid) {
            this.setStatus('取视频信息失败 ' + ((v && v.message) || ''), '#f85149');
            console.warn('[bili] view 失败', v && v.code, v && v.message);
            return;
          }
          cid = v.data.cid;
        }
        console.warn('[bili] cid=', cid);

        const p = await this.apiGet(
          API + '/x/player/playurl?bvid=' + it.bvid + '&cid=' + cid + '&fnval=16&fourk=1');
        if (!p || p.code !== 0 || !p.data || !p.data.dash) {
          this.setStatus('取播放地址失败', '#f85149');
          console.warn('[bili] playurl 失败', p && p.code, p && p.message);
          return;
        }

        /* 挑选 360P (id 16) avc1 视频轨：RV1106 解码帧率高达 37fps，最流畅 */
        const vids = p.data.dash.video || [];
        let vpick = null;
        for (let i = 0; i < vids.length; i++) {
          const v = vids[i];
          if (v && v.baseUrl && v.codecs && v.codecs.indexOf('avc1') === 0) {
            if (v.id === 16 || !vpick) {
              vpick = v;
              if (v.id === 16) break;
            }
          }
        }
        if (!vpick && vids.length) vpick = vids[0];

        /* 挑选 64k (id 30216) 音频轨 */
        const audios = p.data.dash.audio || [];
        let apick = null;
        for (let i = 0; i < audios.length; i++) {
          const a = audios[i];
          if (a && a.baseUrl) {
            if (a.id === 30216 || !apick) {
              apick = a;
              if (a.id === 30216) break;
            }
          }
        }
        if (!apick && audios.length) apick = audios[0];

        /* CDN 节点优选：优先使用稳定可靠的官方 UPOS CDN，坚决避开易连接超时的 P2P mcdn 节点 */
        const pickMediaUrl = (track) => {
          if (!track) return '';
          const list = [track.baseUrl].concat(track.backupUrl || track.backup_url || []).filter(Boolean);
          for (let i = 0; i < list.length; i++) {
            const u = list[i];
            if (u.indexOf('mcdn.bilivideo') === -1 && u.indexOf(':8082') === -1) {
              return u;
            }
          }
          return list[0] || '';
        };

        const vurl = pickMediaUrl(vpick);
        const aurl = pickMediaUrl(apick);

        this.stopAll();
        await this.killNativePlayer();
        this.curBvid = it.bvid;
        this.curCid = cid;
        this.curTitle = it.title;

        if (this.videoOn && vurl) {
          /* 画面+声音统一由设备原生播放器 e6_vplay 驱动：
             ffmpeg 同步音视频时钟 + ALSA 直通硬件声卡 + DRM 双缓冲直上屏 */
          const started = await this.startNativePlayer(vurl, aurl);
          if (started) {
            this.setStatus('▶ 画面+声音 · 点屏幕退出', '#fb7299');
            this.watchPlayerExit();
            return;
          }
        }

        /* 仅声音模式：走系统的 SoundPlayer */
        if (aurl) {
          await this.ensureSoundPlayer();
          try {
            this._sp.playOnlineAudio(aurl);
          } catch (e) {
            this._sp.playOnlineAudio({ url: aurl });
          }
          this.setStatus('▶ 仅声音 · ' + it.title, '#3fb950');
        } else {
          this.setStatus('该视频无可用音轨', '#f85149');
        }
      } catch (e) {
        console.error('[bili] play 异常', String(e));
        this.setStatus('播放异常', '#f85149');
      } finally {
        this._launching = false;
      }
    },

    /* ---------- 设备端原生播放器 ---------- */
    async checkPlayer() {
      try {
        const r = await process.exec('sh', ['-c', 'test -x ' + PLAYER + ' && echo __OK__'], { timeout: 8000 });
        const ok = String(r.stdout || '').indexOf('__OK__') >= 0;
        this.playerReady = ok;
        console.warn('[bili] 原生播放器', ok ? '就绪' : '缺失（将只出声）');
      } catch (e) {
        this.playerReady = false;
        console.warn('[bili] 查播放器失败', String(e));
      }
    },

    async startNativePlayer(videoUrl, audioUrl) {
      if (!this.playerReady) {
        console.warn('[bili] 没有 e6_vplay，跳过画面');
        return false;
      }
      let cmd = "nohup " + PLAYER + " --video-url '" + videoUrl + "'";
      if (audioUrl) {
        cmd += " --audio-url '" + audioUrl + "'";
      }
      if (this.isMuted) {
        cmd += " --mute";
      }
      cmd += " --fps 20 > " + PLAYER_LOG + " 2>&1 &";
      try {
        await process.exec('sh', ['-c', cmd], { timeout: 8000 });
        console.warn('[bili] 原生播放器已启动, mute=', this.isMuted);
        return true;
      } catch (e) {
        console.error('[bili] 原生播放器启动失败', String(e));
        this.setStatus('画面启动失败', '#f85149');
        return false;
      }
    },

    async killNativePlayer() {
      const cmd = 'killall -TERM e6_vplay 2>/dev/null; usleep 80000; killall -9 e6_vplay 2>/dev/null; killall -9 ffmpeg 2>/dev/null; exit 0';
      try {
        await process.exec('sh', ['-c', cmd], { timeout: 8000 });
        console.warn('[bili] 原生播放器已停止');
      } catch (e) {
        console.warn('[bili] 停播放器失败', String(e));
      }
    },

    async watchPlayerExit() {
      if (this._watching) return;
      this._watching = true;
      try {
        await this.sleep(2000);
        for (let i = 0; i < 3600; i++) {
          await this.sleep(1000);
          try {
            const r = await process.exec('sh', ['-c', 'ps | grep -c [e]6_vplay'], { timeout: 3000 });
            const count = parseInt(String((r && r.stdout) || '').trim(), 10);
            if (count === 0) {
              console.warn('[bili] 播放器已退出，刷新状态');
              this.curBvid = '';
              this.curCid = 0;
              this.curTitle = '';
              this.setStatus('已返回列表', '#8b949e');
              break;
            }
          } catch (e) {
            break;
          }
        }
      } finally {
        this._watching = false;
      }
    },

    toggleMute() {
      this.isMuted = !this.isMuted;
      this.setStatus(this.isMuted ? '已开启静音模式' : '已开启声音 (跟随系统音量)', '#8b949e');
      console.warn('[bili] 静音开关', this.isMuted);
    },

    stopAll() {
      const ms = ['quickStop', 'stop'];
      for (let i = 0; i < ms.length; i++) {
        try { if (this._sp[ms[i]]) this._sp[ms[i]](); } catch (e) { /* ignore */ }
      }
    },

    async stop() {
      this.stopAll();
      await this.killNativePlayer();
      this.curBvid = '';
      this.curCid = 0;
      this.curTitle = '';
      this.setStatus('已返回列表', '#8b949e');
    },

    /* ---------- Tab / 搜索 ---------- */
    switchTab(k) {
      if (this.tab === k) return;
      this.tab = k;
      console.warn('[bili] switchTab', k);
      if (k === 'search' && !this.kw) {
        this.list = [];
        this.setStatus('输入关键词开始搜索', '#6e7681');
        return;
      }
      this.loadList();
    },

    onKw(e) {
      this.kw = (e && e.value !== undefined) ? String(e.value) : '';
      if (this.searchTimer) { try { clearTimeout(this.searchTimer); } catch (e) { /* ignore */ } }
      this.searchTimer = setTimeout(() => {
        if (this.kw) this.loadList();
      }, 900);
    },

    /* ---------- 小工具 ---------- */
    setStatus(t, c) {
      this.status = t;
      this.statusColor = c || '#8b949e';
    },

    fmtDur(sec) {
      /* popular/ranking 给秒数，search 给 "10:35" 字符串，两种都要认 */
      if (typeof sec === 'string' && sec.indexOf(':') >= 0) return sec;
      if (!sec && sec !== 0) return '--:--';
      const s = Math.floor(sec / 1);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      const p = (n) => (n < 10 ? '0' + n : '' + n);
      return (h > 0 ? h + ':' : '') + p(m) + ':' + p(ss);
    },

    fmtNum(n) {
      if (!n && n !== 0) return '-';
      if (n >= 10000) return (n / 10000).toFixed(1) + '万';
      return '' + n;
    }
  }
};
</script>

<style scoped>
/* 深色主题，配色取 B 站粉 #fb7299 */
.page { width: 240px; height: 320px; background-color: #0d1117; flex-direction: column; }
.topbar {
  height: 34px; flex-direction: row; align-items: center;
  padding-left: 10px; padding-right: 10px;
}
.brand { color: #fb7299; font-size: 15px; font-weight: bold; margin-right: 10px; }
.tabs { flex: 1; flex-direction: row; justify-content: flex-end; align-items: center; }
.hairline { height: 1px; background-color: #21262d; }

.searchrow { flex-direction: row; align-items: center; margin-top: 8px; padding-left: 8px; padding-right: 8px; }
.searchbox {
  flex: 1; height: 30px; background-color: #161b22; color: #ffffff;
  font-size: 13px; border-radius: 6px; padding-left: 8px;
}
.hint { color: #484f58; font-size: 9px; margin-left: 6px; }

.pagebox { flex: 1; margin-top: 4px; }
.lrow {
  flex-direction: row; align-items: center;
  border-bottom-width: 1px; border-bottom-color: #161b22;
  padding-left: 10px; padding-right: 10px; padding-top: 5px; padding-bottom: 5px;
}
.lrow-main { flex: 1; flex-direction: column; }
.cover {
  width: 44px; height: 33px; margin-right: 6px;
  border-radius: 3px; background-color: #161b22;
}
.lt { font-size: 12px; }
.ls { color: #6e7681; font-size: 10px; margin-top: 2px; }
.playing { color: #fb7299; font-size: 11px; margin-left: 4px; }
.lempty { height: 80px; justify-content: center; align-items: center; }

.pagebar {
  height: 30px; flex-direction: row; align-items: center;
  padding-left: 10px; padding-right: 10px; border-top-width: 1px; border-top-color: #21262d;
}
.status { flex: 1; font-size: 11px; lines: 1; text-overflow: ellipsis; }
.stopbtn {
  width: 46px; height: 22px; border-radius: 6px; background-color: #21262d;
  justify-content: center; align-items: center;
}
.stopbtn-t { color: #e6edf3; font-size: 11px; }
.stopbtn + .stopbtn { margin-left: 6px; }
.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 240px;
  height: 320px;
}
</style>
