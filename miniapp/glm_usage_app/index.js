/*
 * 有道听力宝 E6 (YDLE6 / Hermes) · GLM 用量查询页
 *
 * 智谱 BigModel 套餐额度监控（与 Metalio E-Ink4 / Kindle 版同一套接口契约）：
 *   ① 发现机构/项目  GET https://bigmodel.cn/api/biz/customer/getCustomerInfo
 *      —— Authorization: Bearer <网页端 JWT>（一次性，用完即从配置里清除，不落盘复用）
 *   ② 查额度          GET https://open.bigmodel.cn/api/monitor/usage/quota/limit?type=2
 *      —— Authorization: <由 API Key 现算的 HS256 JWT>
 *         + bigmodel-organization / bigmodel-project 请求头
 *   ③ 查重置次数      GET https://open.bigmodel.cn/api/biz/customer-package-reset/list?targetType=TEAM
 *
 * 运行时能力（E6 实测形状，见 docs/MINIAPP_DEV.md）：
 *   http.request({url, method, headers, timeout}) -> {status, body, headers}
 *   process.exec('sh', ['-c', cmd], {timeout}) -> {code, stdout, stderr}
 *
 * ★ E6 没有 fs 模块、没有 base64/openssl 命令：
 *   - 配置/状态持久化用 process.exec cat/echo 到 /userdisk/glm_usage/
 *   - API JWT 的 HMAC-SHA256 用下面的纯 JS 实现（输入均为 ASCII）
 *
 * ★ console 只有 warn/error 有效，调试必须用 console.warn。
 */

import http from 'http';
import process from 'process';

/* ============================== 常量 ============================== */

const CONFIG_PATH = '/userdisk/glm_usage/config.json';
const STATE_PATH = '/userdisk/glm_usage/state.json';

const URL_CUSTOMER =
  'https://bigmodel.cn/api/biz/customer/getCustomerInfo';
const URL_QUOTA =
  'https://open.bigmodel.cn/api/monitor/usage/quota/limit?type=2';
const URL_RESETS =
  'https://open.bigmodel.cn/api/biz/customer-package-reset/list?targetType=TEAM';

const REFRESH_INTERVAL_MS = 60 * 1000;

/* ====================== 纯 JS SHA-256 / HMAC / base64url ====================== */

const SHA_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/* 字符串 -> 字节数组（UTF-8；本项目内实际全是 ASCII） */
function strBytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 128) {
      out.push(c);
    } else if (c < 2048) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

function sha256Bytes(msg) {
  const len = msg.length;
  const bitLenHi = Math.floor(len / 536870912);
  const bitLenLo = (len << 3) >>> 0;

  const p = msg.slice();
  p.push(0x80);
  while (p.length % 64 !== 56) p.push(0);
  p.push(
    (bitLenHi >>> 24) & 255, (bitLenHi >>> 16) & 255,
    (bitLenHi >>> 8) & 255, bitLenHi & 255,
    (bitLenLo >>> 24) & 255, (bitLenLo >>> 16) & 255,
    (bitLenLo >>> 8) & 255, bitLenLo & 255
  );

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array(64);

  for (let block = 0; block < p.length; block += 64) {
    for (let i = 0; i < 16; i++) {
      const j = block + i * 4;
      w[i] = ((p[j] << 24) | (p[j + 1] << 16) | (p[j + 2] << 8) | p[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }

  const out = [];
  const hs = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < hs.length; i++) {
    out.push((hs[i] >>> 24) & 255, (hs[i] >>> 16) & 255, (hs[i] >>> 8) & 255, hs[i] & 255);
  }
  return out;
}

function hmacSha256(keyStr, msgStr) {
  let key = strBytes(keyStr);
  if (key.length > 64) key = sha256Bytes(key);
  const ipad = [];
  const opad = [];
  for (let i = 0; i < 64; i++) {
    const b = i < key.length ? key[i] : 0;
    ipad.push(b ^ 0x36);
    opad.push(b ^ 0x5c);
  }
  const inner = sha256Bytes(ipad.concat(strBytes(msgStr)));
  return sha256Bytes(opad.concat(inner));
}

/* base64url，无填充（JWT 标准） */
function b64url(bytes) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
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

/*
 * BigModel 监控接口要的是「由 <id>.<secret> API Key 现算的短时效 HS256 JWT」，
 * 不是 API Key 本身 —— 与墨水屏 / Kindle 版同一套签名逻辑。
 */
function makeApiJwt(apiKey) {
  const dot = apiKey.indexOf('.');
  if (dot <= 0 || dot + 1 >= apiKey.length) return apiKey;

  const keyId = apiKey.slice(0, dot);
  const secret = apiKey.slice(dot + 1);
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(strBytes('{"alg":"HS256","sign_type":"SIGN"}'));
  const payload = b64url(strBytes(
    '{"api_key":"' + keyId + '","exp":' + (now + 3600) + ',"timestamp":' + now + '}'
  ));
  const input = header + '.' + payload;
  return input + '.' + b64url(hmacSha256(secret, input));
}

/* ============================== 小工具 ============================== */

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/* 配额控制台面向中国区，重置时间一律按 UTC+8 展示（与墨水屏版一致） */
function fmtResetMs(ms) {
  if (!ms || ms <= 0) return '--';
  const d = new Date(ms + 8 * 3600 * 1000);
  return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日 ' +
    pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
}

function fmtTokens(n) {
  if (n === null || n === undefined || n < 0) return '--';
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return '' + n;
}

function fmtNow() {
  const d = new Date();
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

async function readJsonFile(path) {
  try {
    const r = await process.exec('sh', ['-c', 'cat ' + path + ' 2>/dev/null'], { timeout: 8000 });
    const t = String((r && r.stdout) || '').trim();
    return t ? safeJson(t) : null;
  } catch (e) {
    console.warn('[GlmUsage] readJsonFile fail', path, e);
    return null;
  }
}

/* 写入的 JSON 由本 App / 配置脚本生成，值里不会有单引号（下发脚本已清洗） */
async function writeJsonFile(path, obj) {
  try {
    const s = JSON.stringify(obj);
    const r = await process.exec('sh', ['-c', "echo '" + s + "' > " + path], { timeout: 8000 });
    return r && r.code === 0;
  } catch (e) {
    console.warn('[GlmUsage] writeJsonFile fail', path, e);
    return false;
  }
}

/* ============================== BigModel API ============================== */

async function apiGet(url, headers) {
  const res = await http.request({
    url: url,
    method: 'GET',
    headers: headers,
    timeout: 15000
  });
  return {
    status: (res && res.status) || 0,
    body: String((res && res.body) || '')
  };
}

/*
 * 一次性发现所有机构/项目（用网页端 JWT）。
 * 返回 { contexts: [...], error: '' }
 * context = { org, proj, name, ptype }
 */
async function discoverContexts(webJwt) {
  let r;
  try {
    r = await apiGet(URL_CUSTOMER, {
      'Authorization': 'Bearer ' + webJwt,
      'Accept': 'application/json'
    });
  } catch (e) {
    return { contexts: [], error: '网络错误: ' + String(e).slice(0, 40) };
  }

  const j = safeJson(r.body);
  if (!j || j.code !== 200) {
    const msg = j && j.msg ? String(j.msg) : 'HTTP ' + r.status;
    const expired = /过期|无效|401|403/.test(msg);
    return {
      contexts: [],
      error: (expired ? 'Web Token 已过期/无效，请重新抓取；' : '') + msg
    };
  }

  const contexts = [];
  const data = j.data || {};
  const orgs = data.organizations || [];
  for (let i = 0; i < orgs.length; i++) {
    const org = orgs[i] || {};
    const orgId = String(org.organizationId || '');
    if (!orgId) continue;
    const orgName = String(org.organizationName || orgId);
    const projects = org.projects || [];
    for (let k = 0; k < projects.length; k++) {
      const p = projects[k] || {};
      const projId = String(p.projectId || '');
      if (!projId) continue;
      contexts.push({
        org: orgId,
        proj: projId,
        name: String(p.projectName || orgName),
        ptype: p.projectType === undefined ? 0 : Number(p.projectType),
        score: (p.projectType === 2 ? 100 : 0) +
               (p.isDefault ? 8 : 0) + (org.isDefault ? 4 : 0) +
               (String(org.role || '') === 'owner' ? 1 : 0)
      });
    }
  }
  return { contexts: contexts, error: '' };
}

/*
 * 拉取单个上下文的用量。
 * 返回 usage = { ok, level, w5:{pct,rem,reset}, wk:{pct,rem,reset},
 *                mcp:{used,total}, r5, rw, err }
 */
async function fetchUsage(apiKey, ctx) {
  const out = {
    ok: false, level: '', err: '',
    w5: { pct: -1, rem: -1, reset: 0 },
    wk: { pct: -1, rem: -1, reset: 0 },
    mcp: { used: -1, total: -1 },
    r5: -1, rw: -1
  };
  const headers = {
    'Authorization': makeApiJwt(apiKey),
    'Accept': 'application/json'
  };
  if (ctx && ctx.org) headers['bigmodel-organization'] = ctx.org;
  if (ctx && ctx.proj) headers['bigmodel-project'] = ctx.proj;

  /* ② 额度 */
  let r;
  try {
    r = await apiGet(URL_QUOTA, headers);
  } catch (e) {
    out.err = '网络错误: ' + String(e).slice(0, 40);
    return out;
  }
  const j = safeJson(r.body);
  if (!j) {
    out.err = '响应格式错误 (HTTP ' + r.status + ')';
    return out;
  }
  if (j.code !== 200) {
    const msg = String(j.msg || ('HTTP ' + r.status));
    out.err = (j.code === 401 || j.code === 403 || j.code === 1001)
      ? 'API Key 无效或未授权: ' + msg
      : msg;
    return out;
  }

  const data = j.data || {};
  if (typeof data.level === 'string') out.level = data.level;

  const limits = data.limits || [];
  const windows = [];
  for (let i = 0; i < limits.length; i++) {
    const it = limits[i] || {};
    const type = String(it.type || '');
    if (type === 'TIME_LIMIT') {
      out.mcp.used = it.currentValue === undefined ? -1 : Number(it.currentValue);
      out.mcp.total = it.usage === undefined ? -1 : Number(it.usage);
      continue;
    }
    if (type !== 'TOKENS_LIMIT' && type !== 'CREDIT_LIMIT') continue;
    windows.push({
      reset: it.nextResetTime === undefined ? 0 : Number(it.nextResetTime),
      pct: it.percentage === undefined ? -1 : Number(it.percentage),
      rem: it.remaining === undefined ? -1 : Number(it.remaining)
    });
  }
  /* nextResetTime 更早的窗口就是 5 小时窗（与墨水屏版同一判据） */
  if (windows.length > 0) {
    windows.sort(function (a, b) { return (a.reset || Infinity) - (b.reset || Infinity); });
    out.w5 = windows[0];
    if (windows.length > 1) out.wk = windows[1];
    else out.wk = windows[0];
  }

  /* ③ 重置次数（可选数据，失败不影响主显示） */
  for (let attempt = 0; attempt < 2; attempt++) {
    let rr;
    try {
      rr = await apiGet(URL_RESETS, headers);
    } catch (e) {
      break;
    }
    const jr = safeJson(rr.body);
    if (jr && jr.code === 200 && jr.data) {
      out.r5 = countAvailable(jr.data.fiveHourResets);
      out.rw = countAvailable(jr.data.weekResets);
      break;
    }
    await sleep(400);
  }

  out.ok = true;
  return out;
}

function countAvailable(arr) {
  if (!arr) return -1;
  let n = 0;
  for (let i = 0; i < arr.length; i++) {
    const it = arr[i] || {};
    if (it.available === undefined || it.available === true) n++;
  }
  return n;
}

function sleep(ms) {
  return new Promise(function (resolve) {
    if (typeof setTimeout === 'function') setTimeout(resolve, ms);
    else resolve();
  });
}

/* ============================== 页面组件 ============================== */

export default {
  data() {
    return {
      apiKey: '',           /* 只存在内存里，不展示 */
      level: '',
      ctxNames: [],
      active: 0,
      /* contexts 完整列表只放内存 */
      w5: { pct: -1, rem: -1, reset: 0 },
      wk: { pct: -1, rem: -1, reset: 0 },
      mcpUsed: -1,
      mcpTotal: -1,
      r5: -1,
      rw: -1,
      status: '启动中…',
      statusErr: false,
      updatedAt: '',
      busy: false,
      hasData: false
    };
  },

  created() {
    console.warn('[GlmUsage] page created');
    const self = this;
    this._contexts = [];
    this._timer = null;
    this.boot();

    if (typeof setInterval === 'function') {
      this._timer = setInterval(function () {
        if (!self.busy) self.refresh(false);
      }, REFRESH_INTERVAL_MS);
    }
  },

  methods: {
    setStatus(text, isErr) {
      this.status = text;
      this.statusErr = !!isErr;
    },

    async boot() {
      this.setStatus('读取配置…');
      await this.reloadConfig();
      await this.ensureContexts();
      await this.refresh(true);
    },

    /* 配置文件由 tools/glm_usage_setup.sh 下发到 /userdisk/glm_usage/config.json */
    async reloadConfig() {
      const cfg = await readJsonFile(CONFIG_PATH);
      this._config = cfg || {};
      const key = String(this._config.api_key || '');
      this.apiKey = key;
      if (!key) {
        this.setStatus('未配置 API Key（先运行 tools/glm_usage_setup.sh）', true);
        return false;
      }
      return true;
    },

    /*
     * 上下文来源优先级：
     *   1) 配置里的一次性 Web JWT  -> 发现全部机构/项目（成功后从配置里清除）
     *   2) 上次保存的 state.json
     *   3) 配置里手填的 org/project（DevTools 抓包路径）
     */
    async ensureContexts() {
      if (!this.apiKey) return;

      const cfg = this._config || {};
      const jwt = String(cfg.jwt_token || '').trim();

      if (jwt) {
        this.setStatus('正在发现机构/项目…');
        this._triedJwt = jwt;
        const disc = await discoverContexts(jwt);
        if (disc.contexts.length > 0) {
          this._triedJwt = '';
          this._contexts = disc.contexts;
          /* 默认选中：coding plan (ptype=2) + 默认项目/机构 优先 */
          let best = 0;
          for (let i = 1; i < this._contexts.length; i++) {
            if (this._contexts[i].score > this._contexts[best].score) best = i;
          }
          this.active = best;
          this.ctxNames = this._contexts.map(function (c) { return c.name; });
          await writeJsonFile(STATE_PATH, { contexts: this._contexts, active: this.active });
          /* 一次性 Web JWT 用完即清，不落盘复用（与墨水屏版同一策略） */
          cfg.jwt_token = '';
          await writeJsonFile(CONFIG_PATH, cfg);
          console.warn('[GlmUsage] discovered ' + this._contexts.length + ' contexts');
          return;
        }
        this.setStatus('发现失败: ' + disc.error, true);
      }

      if (this._contexts.length > 0) return;

      /* 手填 org/project 的兜底路径 */
      const org = String(cfg.org || '').trim();
      const proj = String(cfg.project || '').trim();
      if (org && proj) {
        this._contexts = [{ org: org, proj: proj, name: String(cfg.name || '默认项目'), ptype: 0 }];
        this.active = 0;
        this.ctxNames = [this._contexts[0].name];
        await writeJsonFile(STATE_PATH, { contexts: this._contexts, active: 0 });
        return;
      }

      const st = await readJsonFile(STATE_PATH);
      if (st && st.contexts && st.contexts.length > 0) {
        this._contexts = st.contexts;
        this.active = Math.min(Math.max(0, st.active || 0), this._contexts.length - 1);
        this.ctxNames = this._contexts.map(function (c) { return c.name; });
        return;
      }

      /* 兜底：不带 org/project 头查默认上下文（个人版套餐即可出数；
         团队套餐查不到时界面会提示去配 --jwt / --org） */
      this._contexts = [{ org: '', proj: '', name: '默认上下文', ptype: 0 }];
      this.active = 0;
      this.ctxNames = ['默认上下文'];
      this.setStatus('未配置机构/项目，查询默认上下文（团队套餐需 --jwt 或 --org/--project）', true);
    },

    async refresh(manual) {
      if (this.busy) return;
      if (!this.apiKey) {
        this.setStatus('未配置 API Key（先运行 tools/glm_usage_setup.sh）', true);
        return;
      }

      /* 手动刷新 = 重读配置：刚下发新 JWT / org 时不重启 App 直接生效。
         同一个 JWT 只尝试一次发现（失败别每次点刷新都打一遍过期接口） */
      if (manual) {
        await this.reloadConfig();
        if (!this.apiKey) {
          this.setStatus('未配置 API Key（先运行 tools/glm_usage_setup.sh）', true);
          return;
        }
        const jwt = String((this._config || {}).jwt_token || '').trim();
        if (jwt && jwt !== this._triedJwt) {
          await this.ensureContexts();
        }
      }
      if (this._contexts.length === 0) return;

      this.busy = true;
      this.setStatus('正在查询…');
      const ctx = this._contexts[this.active] || this._contexts[0];

      const usage = await fetchUsage(this.apiKey, ctx);
      this.busy = false;

      if (usage.ok) {
        this.level = usage.level;
        this.w5 = usage.w5;
        this.wk = usage.wk;
        this.mcpUsed = usage.mcp.used;
        this.mcpTotal = usage.mcp.total;
        this.r5 = usage.r5;
        this.rw = usage.rw;
        this.hasData = true;
        this.updatedAt = fmtNow();
        this.setStatus('已更新 ' + this.updatedAt, false);
      } else {
        this.setStatus(usage.err || '查询失败', true);
        if (/API Key 无效/.test(usage.err || '')) this.hasData = false;
      }
      console.warn('[GlmUsage] refresh ok=' + usage.ok + ' err=' + (usage.err || ''));
    },

    onSelectContext(i) {
      if (i === this.active || this.busy) return;
      this.active = i;
      writeJsonFile(STATE_PATH, { contexts: this._contexts, active: i });
      this.refresh(false);
    },

    onRefresh() {
      this.refresh(true);
    },

    /* 进度条颜色按使用率分档 */
    barColor(pct) {
      if (pct < 0) return '#30363d';
      if (pct >= 90) return '#f85149';
      if (pct >= 70) return '#d29922';
      return '#3fb950';
    }
  },

  render(h) {
    const self = this;

    /* ------- 上下文胶囊 ------- */
    const pills = [];
    if (this.ctxNames.length > 1) {
      for (let i = 0; i < this.ctxNames.length; i++) {
        const sel = i === this.active;
        pills.push(h('div', {
          style: {
            flex: 1,
            height: '24px',
            marginLeft: i === 0 ? '0px' : '6px',
            backgroundColor: sel ? '#1f6feb' : '#21262d',
            borderRadius: '12px',
            justifyContent: 'center',
            alignItems: 'center'
          },
          on: { click: (function (idx) { return function () { self.onSelectContext(idx); }; })(i) }
        }, [
          h('text', {
            style: {
              color: sel ? '#ffffff' : '#8b949e',
              fontSize: '10px',
              lines: 1,
              textOverflow: 'ellipsis',
              paddingLeft: '4px',
              paddingRight: '4px'
            }
          }, this.ctxNames[i])
        ]));
      }
    }

    /* ------- 用量卡片 ------- */
    const barInner = 200;   /* 卡片内容宽：240 - 2*10(外边) - 2*10(内边) */
    const card = (title, w) => {
      const pct = w && w.pct >= 0 ? Math.min(100, Math.round(w.pct)) : -1;
      const fillW = pct < 0 ? 0 : Math.max(3, Math.round(barInner * pct / 100));
      const pctColor = pct < 0 ? '#8b949e' : self.barColor(pct);
      const sub = pct < 0
        ? '暂无套餐数据'
        : '剩 ' + fmtTokens(w.rem) + (w.rem >= 10000 ? ' Tok' : ' Tok') +
          ' · ' + fmtResetMs(w.reset) + ' 重置';
      return h('div', {
        style: {
          height: '86px',
          backgroundColor: '#161b22',
          borderRadius: '10px',
          paddingLeft: '10px',
          paddingRight: '10px',
          paddingTop: '8px',
          marginTop: '8px'
        }
      }, [
        h('div', { style: { flexDirection: 'row', alignItems: 'center' } }, [
          h('text', { style: { color: '#8b949e', fontSize: '12px', flex: 1 } }, title),
          h('text', { style: { color: pctColor, fontSize: '20px', fontWeight: 'bold' } },
            pct < 0 ? '--' : pct + '%')
        ]),
        h('div', {
          style: {
            width: barInner + 'px',
            height: '10px',
            backgroundColor: '#21262d',
            borderRadius: '5px',
            marginTop: '8px'
          }
        }, [
          h('div', {
            style: {
              width: fillW + 'px',
              height: '10px',
              backgroundColor: pct < 0 ? '#30363d' : self.barColor(pct),
              borderRadius: '5px'
            }
          })
        ]),
        h('text', { style: { color: '#8b949e', fontSize: '10px', marginTop: '8px' } }, sub)
      ]);
    };

    /* ------- MCP / 重置次数行 ------- */
    const metaBits = [];
    if (this.mcpTotal > 0) {
      metaBits.push('MCP ' + this.mcpUsed + '/' + this.mcpTotal);
    }
    if (this.r5 >= 0 || this.rw >= 0) {
      metaBits.push('重置 5h×' + (this.r5 < 0 ? '-' : this.r5) +
                    ' 周×' + (this.rw < 0 ? '-' : this.rw));
    }
    const metaRow = metaBits.length > 0
      ? h('text', {
          style: { color: '#8b949e', fontSize: '10px', marginTop: '10px', paddingLeft: '4px' }
        }, metaBits.join('   ·   '))
      : null;

    /* ------- 主布局 ------- */
    const contentKids = [];
    if (pills.length > 0) {
      contentKids.push(h('div', { style: { flexDirection: 'row', marginTop: '2px' } }, pills));
    }
    contentKids.push(card('5 小时窗口', this.w5));
    contentKids.push(card('本周额度', this.wk));
    if (metaRow) contentKids.push(metaRow);

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
          height: '34px',
          backgroundColor: '#1f2a44',
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: '10px',
          paddingRight: '10px'
        }
      }, [
        h('text', { style: { color: '#ffffff', fontSize: '15px', fontWeight: 'bold' } }, 'GLM 用量'),
        h('div', { style: { flex: 1 } }),
        this.level
          ? h('div', {
              style: {
                backgroundColor: '#2ea043',
                borderRadius: '8px',
                paddingLeft: '8px',
                paddingRight: '8px',
                height: '18px',
                justifyContent: 'center',
                alignItems: 'center'
              }
            }, [
              h('text', { style: { color: '#ffffff', fontSize: '10px' } }, '套餐 ' + this.level)
            ])
          : null
      ]),

      /* 内容区 */
      h('div', {
        style: {
          flex: 1,
          paddingLeft: '10px',
          paddingRight: '10px',
          paddingTop: '6px',
          flexDirection: 'column'
        }
      }, contentKids),

      /* 状态栏 + 刷新 */
      h('div', {
        style: {
          height: '32px',
          backgroundColor: '#161b22',
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: '10px',
          paddingRight: '8px'
        }
      }, [
        h('text', {
          style: {
            color: this.statusErr ? '#f85149' : '#8b949e',
            fontSize: '10px',
            flex: 1,
            lines: 1,
            textOverflow: 'ellipsis'
          }
        }, this.status),
        h('div', {
          style: {
            width: '48px',
            height: '22px',
            backgroundColor: this.busy ? '#388bfd26' : '#21262d',
            borderRadius: '11px',
            justifyContent: 'center',
            alignItems: 'center'
          },
          on: { click: function () { self.onRefresh(); } }
        }, [
          h('text', { style: { color: '#58a6ff', fontSize: '11px' } }, this.busy ? '…' : '刷新')
        ])
      ])
    ]);
  }
};
