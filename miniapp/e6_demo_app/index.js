/*
 * 有道听力宝 E6 (YDLE6 / Hermes) · 四合一能力演示页
 *
 * 演示四件事，全部在这台机器上真跑（截图 + 日志双重取证）：
 *   ① 写界面 —— Falcon 的 Vue 风格组件对象 + render(h) 虚拟节点树
 *                视口 240x320 竖屏（/etc/miniapp/resources/cfg.json 确认）
 *   ② 上网   —— 内建 http 模块（不是浏览器 fetch/XHR，QuickJS 没有那些）
 *                唯一可用形状： http.request({url, method, timeout}) -> {status, body, headers}
 *   ③ 写文件 —— 内建 process 模块（E6 没有 fs 模块）
 *                唯一可用形状： process.exec(cmd, argsArray, opts) -> {code, signal, stdout, stderr}
 *   ④ 发声音 —— 内建 soundPlayer 模块（tinyalsa 直开 PCM，绕过系统播放器独占）
 *                new soundPlayerModule.SoundPlayer().playBase64(b64, 0, 1.0, false, 0)
 *
 * ★ console 陷阱：Falcon 只转发 console.warn / console.error，
 *   console.log / info / debug 全部被静默丢弃。调试必须用 warn。
 *
 * ★ 页面导出契约：index.js 导出的是「组件对象」（不是 Page 子类）。
 *   框架用 app.js 里 useDefaultBasePageClass 注册的基类去包装它。
 *   若导出 Page 子类，则由框架自己 new，组件的 render 不会被调用。
 */

import http from 'http';
import process from 'process';
import soundPlayerModule from 'soundPlayer';

const APPID = '8090906000000001';
const PKG_ROOT = '/userdisk/secondary/miniapp/data/mini_app/pkg/' + APPID;
const DEMO_DIR = '/userdisk/e6_demo';

/*
 * 设备上**没有** base64 / openssl 命令（只有 xxd / hexdump / od）。
 * soundPlayer.playBase64() 要的是 base64，所以这里在 JS 侧做 hex -> base64 转换。
 */
function hexToBase64(hex) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = bytes.length > i + 1;
    const has2 = bytes.length > i + 2;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += T.charAt(b0 >> 2);
    out += T.charAt(((b0 & 3) << 4) | (b1 >> 4));
    out += has1 ? T.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=';
    out += has2 ? T.charAt(b2 & 63) : '=';
  }
  return out;
}

/*
 * ★ process.exec 的 stdout 有上限（实测约 4KB），一次读大文件会被静默截断，
 *   导致 ffmpeg 解码失败（avformat_open_input failure）。
 *   所以按块读：dd bs=1024 skip=K count=1 | xxd -p -c 0
 */
async function fileToBase64(path, chunkBytes) {
  const parts = [];
  const step = chunkBytes || 1024;
  for (let k = 0; k < 64; k++) {
    const cmd = 'dd if=' + path + ' bs=' + step + ' skip=' + k + ' count=1 2>/dev/null | xxd -p -c 0';
    const r = await process.exec('sh', ['-c', cmd], { timeout: 10000 });
    const hex = String((r && r.stdout) || '').replace(/\s+/g, '');
    if (!hex) break;
    parts.push(hex);
    if (hex.length < step * 2) break;   // 读到了最后一块
  }
  return hexToBase64(parts.join(''));
}

export default {
  data() {
    return {
      rows: [
        { tag: '①', label: '界面', state: '运行中', color: '#7ee787' },
        { tag: '②', label: '联网', state: '待测', color: '#79c0ff' },
        { tag: '③', label: '文件', state: '待测', color: '#d2a8ff' },
        { tag: '④', label: '声音', state: '待测', color: '#ffa657' }
      ],
      detail: '启动即自动自测',
      busy: false
    };
  },

  created() {
    console.warn('[E6Demo] Page created');
    this.runAll();
  },

  methods: {
    setState(idx, text, color) {
      this.rows[idx].state = text;
      if (color) this.rows[idx].color = color;
    },

    /* ① 界面：能走到这里并且画面显示出来，本身就是通过 */
    testUI() {
      this.setState(0, '✓ 240x320 竖屏', '#7ee787');
      console.warn('[E6Demo] UI ok');
    },

    /* ② 上网：内建 http 模块，唯一可用形状是对象参数 */
    async testNet() {
      this.setState(1, '请求中…');
      try {
        const res = await http.request({
          url: 'http://www.baidu.com',
          method: 'GET',
          timeout: 8000
        });
        const body = String((res && res.body) || '');
        this.setState(1, '✓ HTTP ' + res.status + ' (' + body.length + 'B)', '#79c0ff');
        this.detail = 'http.status=' + res.status;
        console.warn('[E6Demo] net ok status=' + res.status + ' len=' + body.length);
      } catch (e) {
        this.setState(1, '✗ ' + String(e).slice(0, 18), '#f85149');
        console.warn('[E6Demo] net fail', e);
      }
    },

    /* ③ 写文件：E6 没有 fs 模块，用 process.exec 调 shell */
    async testFile() {
      this.setState(2, '写入中…');
      try {
        const cmd =
          'mkdir -p ' + DEMO_DIR +
          ' && echo "hello from E6 miniapp" > ' + DEMO_DIR + '/hello.txt' +
          ' && cat ' + DEMO_DIR + '/hello.txt';
        const r = await process.exec('sh', ['-c', cmd], { timeout: 10000 });
        const out = String((r && r.stdout) || '');
        const ok = r && r.code === 0 && out.indexOf('hello from E6 miniapp') >= 0;
        this.setState(2, ok ? '✓ 已写并读回 hello.txt' : '✗ code=' + (r && r.code), '#d2a8ff');
        this.detail = 'file=' + DEMO_DIR + '/hello.txt';
        console.warn('[E6Demo] file ok=' + ok + ' out=' + out.trim());
      } catch (e) {
        this.setState(2, '✗ ' + String(e).slice(0, 18), '#f85149');
        console.warn('[E6Demo] file fail', e);
      }
    },

    /* ④ 发声音：soundPlayer 模块走 tinyalsa 直开 PCM */
    async testSound() {
      this.setState(3, '播放中…');
      try {
        /* 把 app 自带的 assets/beep.wav 取出并转成 base64，交给 playBase64。
           这样声音数据随 app 分发，不依赖设备上预先存在的文件。
           注意 A/B 槽位（a/ b/）会轮换，所以用 find 定位而不是写死路径。 */
        const locate = await process.exec('sh', ['-c',
          'find ' + PKG_ROOT + ' -name beep.wav 2>/dev/null | head -1'], { timeout: 10000 });
        const wavPath = String((locate && locate.stdout) || '').trim();
        if (!wavPath) {
          this.setState(3, '✗ 找不到 beep.wav', '#f85149');
          console.warn('[E6Demo] sound: beep.wav not found');
          return;
        }
        const b64 = await fileToBase64(wavPath, 1024);
        const sound = new soundPlayerModule.SoundPlayer();
        const uuid = sound.playBase64(b64, 0, 1.0, false, 0);
        this.setState(3, '✓ 已播放 (' + b64.length + 'B b64)', '#ffa657');
        this.detail = 'sound.uuid=' + uuid;
        console.warn('[E6Demo] sound ok uuid=' + uuid + ' path=' + wavPath + ' b64len=' + b64.length);
      } catch (e) {
        this.setState(3, '✗ ' + String(e).slice(0, 18), '#f85149');
        console.warn('[E6Demo] sound fail', e);
      }
    },

    async runAll() {
      if (this.busy) return;
      this.busy = true;
      this.testUI();
      await this.testNet();
      await this.testFile();
      await this.testSound();
      this.busy = false;
      this.detail = '自测完成';
      console.warn('[E6Demo] all tests done');
    },

    onRetest() {
      this.runAll();
    },

    onBeep() {
      this.testSound();
    }
  },

  render(h) {
    const self = this;

    const row = (r) => h('div', {
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        height: '34px'
      }
    }, [
      h('text', { style: { color: '#6b8cff', fontSize: '14px', width: '18px' } }, r.tag),
      h('text', { style: { color: '#c9d1d9', fontSize: '13px', width: '34px' } }, r.label),
      h('text', { style: { color: r.color, fontSize: '12px', flex: 1 } }, r.state)
    ]);

    const btn = (label, color, handler, mr) => h('div', {
      style: {
        flex: 1,
        height: '36px',
        backgroundColor: color,
        borderRadius: '6px',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: mr
      },
      on: { click: handler }
    }, [
      h('text', { style: { color: '#ffffff', fontSize: '14px' } }, label)
    ]);

    const kids = [];
    for (let i = 0; i < self.rows.length; i++) {
      kids.push(row(self.rows[i]));
    }

    return h('div', {
      style: {
        width: '240px',
        height: '320px',
        backgroundColor: '#0d1117',
        flexDirection: 'column'
      }
    }, [
      /* 标题栏 */
      h('div', {
        style: {
          height: '36px',
          backgroundColor: '#1f2a44',
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: '10px'
        }
      }, [
        h('text', { style: { color: '#ffffff', fontSize: '15px', fontWeight: 'bold' } }, 'E6 能力秀'),
        h('text', { style: { color: '#7d90c0', fontSize: '10px', marginLeft: '8px' } }, 'YDLE6 miniapp')
      ]),

      /* 四项能力 */
      h('div', {
        style: {
          flex: 1,
          paddingLeft: '10px',
          paddingRight: '10px',
          paddingTop: '10px',
          flexDirection: 'column'
        }
      }, kids.concat([
        h('text', { style: { color: '#5a5a66', fontSize: '10px', marginTop: '8px' } }, self.detail)
      ])),

      /* 按钮区 */
      h('div', {
        style: {
          height: '50px',
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: '10px',
          paddingRight: '10px'
        }
      }, [
        btn('重新测试', '#2f6feb', function () { self.onRetest(); }, '8px'),
        btn('响一声', '#d1600d', function () { self.onBeep(); }, '0')
      ])
    ]);
  }
};
