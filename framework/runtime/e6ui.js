/*
 * e6ui —— e6app 框架运行时层（组件库 + JSAPI 包装）
 *
 * 这是一个「扁平单模块」，随应用一起打进包根目录（e6ui.js → e6ui.js.bin），
 * 页面用 `import UI from './e6ui.js'` 引用 —— Falcon 原生模块加载器会从包目录
 * 解析相对路径（双回退：先 .js.bin 字节码、后 .js 源码），与官方应用 82 个
 * 模块的加载方式一致。
 *
 * 语法限制：QuickJS 20200705，用 ES2017 子集（const/let/箭头/模板串/async 均可；
 * 不要用 ?. 与 ??）。样式只用内联 style 对象（73 项白名单，见 docs/MINIAPP_DEV.md）。
 *
 * 组件均为 Vue2 对象（props + render(h)），在页面 <script> 里注册进 components
 * 后即可在 <template> 用 <nav-bar> 这类标签。
 */

import http from 'http';
import process from 'process';
import soundPlayerModule from 'soundPlayer';

/* ============================ 常量与工具 ============================ */

const COLORS = {
  bg: '#0d1117',
  panel: '#161b22',
  line: '#30363d',
  fg: '#c9d1d9',
  dim: '#8b949e',
  accent: '#58a6ff',
  ok: '#3fb950',
  warn: '#d29922',
  err: '#f85149',
  headerBg: '#1f2a44'
};

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function formatTime(d) {
  d = d || new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

/* ============================ HTTP（axios 风格） ============================ */
/*
 * E6 内建 http 模块唯一可用形状（真机实测）：
 *   http.request({url, method, headers, timeout}) -> {status, body, headers}
 * GET 已真机验证；POST 形状在 E6 上未验证，标注为实验性。
 */

async function httpGet(url, opts) {
  opts = opts || {};
  const res = await http.request({
    url: url,
    method: 'GET',
    headers: Object.assign({
      'Accept': 'application/json',
      'User-Agent': 'e6app/0.2'   /* 不少 API（如 api.github.com）缺 UA 直接 403 */
    }, opts.headers || {}),
    timeout: opts.timeout || 15000
  });
  return normalize(res, opts);
}

async function httpPost(url, data, opts) {
  opts = opts || {};
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  const headers = Object.assign({
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }, opts.headers || {});
  /* 实验性：E6 上 body 键名未经证实，data/body 双发提高命中率 */
  const req = {
    url: url, method: 'POST', headers: headers,
    timeout: opts.timeout || 15000
  };
  req.data = body; req.body = body;
  const res = await http.request(req);
  return normalize(res, opts);
}

function normalize(res, opts) {
  const out = {
    status: (res && res.status) || 0,
    body: String((res && res.body) || ''),
    headers: (res && res.headers) || {},
    ok: false,
    json: null
  };
  out.ok = out.status >= 200 && out.status < 300;
  if (!opts || opts.json !== false) {
    try { out.json = JSON.parse(out.body); } catch (e) { /* 非 JSON 保持 null */ }
  }
  return out;
}

/* ============================ Storage（文件持久化） ============================ */
/*
 * 基于 process.exec 的 cat/echo（真机稳定的 argv 形式），JSON 落盘。
 * 值里不能有单引号（写入侧已转义为 JSON 字符串，JSON.stringify 会把 '
 * 原样保留 —— 所以约定：save 前调用方保证不含 '；框架字符串均安全）。
 */
function Storage(name) {
  this.path = '/userdisk/e6app_data/' + (name || 'app') + '.json';
  this.cache = null;
}

Storage.prototype._read = async function () {
  try {
    const r = await process.exec('sh', ['-c', 'cat ' + this.path + ' 2>/dev/null'], { timeout: 8000 });
    const t = String((r && r.stdout) || '').trim();
    return t ? JSON.parse(t) : {};
  } catch (e) { return {}; }
};

Storage.prototype._write = async function (obj) {
  try {
    await process.exec('sh', ['-c', 'mkdir -p /userdisk/e6app_data'], { timeout: 8000 });
    const s = JSON.stringify(obj).replace(/'/g, '\\u0027');
    await process.exec('sh', ['-c', "echo '" + s + "' > " + this.path], { timeout: 8000 });
    return true;
  } catch (e) {
    console.warn('[e6ui] storage write fail', e);
    return false;
  }
};

Storage.prototype.get = async function (key, fallback) {
  if (!this.cache) this.cache = await this._read();
  const v = this.cache[key];
  return v === undefined ? fallback : v;
};

Storage.prototype.set = async function (key, value) {
  if (!this.cache) this.cache = await this._read();
  this.cache[key] = value;
  return await this._write(this.cache);
};

/* ============================ Sound ============================ */

function bytesToBase64(bytes) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += T[b0 >> 2];
    out += T[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += T[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += T[b2 & 63];
  }
  return out;
}

/* 分块读文件转 base64（process.exec stdout 约 4KB 截断，必须分块） */
async function fileToBase64(path) {
  const parts = [];
  for (let k = 0; k < 128; k++) {
    const cmd = 'dd if=' + path + ' bs=1024 skip=' + k + ' count=1 2>/dev/null | xxd -p -c 0';
    const r = await process.exec('sh', ['-c', cmd], { timeout: 10000 });
    const hex = String((r && r.stdout) || '').replace(/\s+/g, '');
    if (!hex) break;
    parts.push(hex);
    if (hex.length < 2048) break;
  }
  const bytes = [];
  const hex = parts.join('');
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytesToBase64(bytes);
}

async function playWav(name) {
  /* name 可以是绝对路径，也可以是 assets/ 下的文件名（自动在包目录里找，
     A/B 槽位会轮换所以不能写死路径） */
  let path = name;
  if (name.charAt(0) !== '/') {
    const cmd = "find /userdisk/secondary/miniapp/data/mini_app/pkg -path '*assets/" + name + "' 2>/dev/null | head -1";
    const r = await process.exec('sh', ['-c', cmd], { timeout: 10000 });
    path = String((r && r.stdout) || '').trim();
    if (!path) throw new Error('assets 里找不到 ' + name);
  }
  const b64 = await fileToBase64(path);
  const sp = new soundPlayerModule.SoundPlayer();
  return sp.playBase64(b64, 0, 1.0, false, 0);
}

/* ============================ 组件库 ============================ */
/*
 * ★ 事件约定（2026-11-02 真机实测）：
 * 函数类型的 props（:on-tap="fn"）在 Falcon 的 Vue 变体里不通，
 * 必须用标准 $emit + 父模板 @tap 监听 —— 组件一律 this.$emit('tap')。
 */

/* 顶栏：标题 + 可选返回（@back 事件，页面里一般给 $page.finish） */
const NavBar = {
  props: { title: { type: String }, back: { type: Boolean } },
  render(h) {
    const kids = [h('text', {
      style: { color: '#ffffff', fontSize: '15px', fontWeight: 'bold' }
    }, this.title)];
    if (this.back) {
      kids.unshift(h('text', {
        style: { color: '#ffffff', fontSize: '16px', width: '26px' },
        on: { click: () => this.$emit('back') }
      }, '‹'));
    }
    return h('div', {
      style: {
        height: '34px', backgroundColor: COLORS.headerBg,
        flexDirection: 'row', alignItems: 'center', paddingLeft: '10px'
      }
    }, kids);
  }
};

/* 列表行：左标题、右值 + 可选箭头，整行可点（@tap） */
const Cell = {
  props: {
    title: { type: String }, value: { type: String }, arrow: { type: Boolean }
  },
  render(h) {
    const kids = [h('text', {
      style: { color: COLORS.fg, fontSize: '13px', flex: 1 }
    }, String(this.title || ''))];
    if (this.value !== undefined && this.value !== null && this.value !== '') {
      kids.push(h('text', {
        style: { color: COLORS.dim, fontSize: '12px', marginRight: this.arrow ? '4px' : '0px' }
      }, String(this.value)));
    }
    if (this.arrow) {
      kids.push(h('text', { style: { color: COLORS.dim, fontSize: '14px' } }, '>'));
    }
    return h('div', {
      style: {
        height: '40px', flexDirection: 'row', alignItems: 'center',
        paddingLeft: '12px', paddingRight: '12px',
        backgroundColor: COLORS.panel, borderRadius: '8px', marginTop: '6px'
      },
      on: { click: () => this.$emit('tap') }
    }, kids);
  }
};

/* 按钮：primary / ghost 两种（@tap） */
const Btn = {
  props: { text: { type: String }, type: { type: String } },
  render(h) {
    const primary = this.type !== 'ghost';
    return h('div', {
      style: {
        flex: 1, height: '34px',
        backgroundColor: primary ? '#2f6feb' : COLORS.panel,
        borderRadius: '8px', justifyContent: 'center', alignItems: 'center'
      },
      on: { click: () => this.$emit('tap') }
    }, [
      h('text', {
        style: { color: primary ? '#ffffff' : COLORS.accent, fontSize: '13px' }
      }, this.text)
    ]);
  }
};

/* 卡片容器（带标题，默认插槽） */
const Card = {
  props: { title: { type: String } },
  render(h) {
    const kids = [];
    if (this.title) {
      kids.push(h('text', {
        style: { color: COLORS.dim, fontSize: '11px', marginBottom: '4px' }
      }, this.title));
    }
    if (this.$slots && this.$slots.default) {
      const slot = this.$slots.default;
      for (let i = 0; i < slot.length; i++) {
        if (slot[i]) kids.push(slot[i]);
      }
    }
    return h('div', {
      style: {
        backgroundColor: COLORS.panel, borderRadius: '10px',
        paddingLeft: '10px', paddingRight: '10px', paddingTop: '8px',
        paddingBottom: '8px', marginTop: '8px'
      }
    }, kids);
  }
};

/* 底部状态栏：文本 + 可选刷新按钮（@refresh） */
const StatusFooter = {
  props: { text: { type: String }, error: { type: Boolean }, busy: { type: Boolean }, refreshable: { type: Boolean } },
  render(h) {
    return h('div', {
      style: {
        height: '32px', backgroundColor: COLORS.panel,
        flexDirection: 'row', alignItems: 'center', paddingLeft: '10px', paddingRight: '8px'
      }
    }, [
      h('text', {
        style: {
          color: this.error ? COLORS.err : COLORS.dim, fontSize: '10px',
          flex: 1, lines: 1, textOverflow: 'ellipsis'
        }
      }, this.text),
      this.refreshable ? h('div', {
        style: {
          width: '48px', height: '22px', backgroundColor: '#21262d',
          borderRadius: '11px', justifyContent: 'center', alignItems: 'center'
        },
        on: { click: () => this.$emit('refresh') }
      }, [h('text', { style: { color: COLORS.accent, fontSize: '11px' } }, this.busy ? '…' : '刷新')]) : null
    ]);
  }
};

/* 汇总导出：命名导出 + 默认对象（页面 `import UI from './e6ui.js'`） */
const e6ui = {
  colors: COLORS,
  formatTime: formatTime,
  http: { get: httpGet, post: httpPost },
  Storage: Storage,
  sound: { playWav: playWav, fileToBase64: fileToBase64 },
  NavBar: NavBar,
  Cell: Cell,
  Btn: Btn,
  Card: Card,
  StatusFooter: StatusFooter
};

export { COLORS, formatTime, httpGet, httpPost, Storage, playWav, fileToBase64,
         NavBar, Cell, Btn, Card, StatusFooter };
export default e6ui;
