#!/usr/bin/env node
/*
 * 有道听力宝 E6 (YDLE6) · GLM 用量 App · 纯 JS 加密实现自检
 *
 * 把 miniapp/glm_usage_app/index.js 里的 SHA-256 / HMAC-SHA256 / base64url
 * 抽出来，和 Node 内置 crypto 逐字节对拍（含 UTF-8 代理对边界）。
 *
 * 为什么要这个：E6 上没有 openssl / base64 命令，crypto 模块也只有 md5sum，
 * 所以 JWT 签名必须靠这段手写的纯 JS 实现 —— 它一旦算错，
 * 智谱服务端会直接拒签，而设备上没有别的手段能发现这件事。
 *
 * 用法:
 *   node tools/glm_crypto_selftest.mjs
 *   node tools/glm_crypto_selftest.mjs --key 'xxxxxxxx.yyyyyyyy'   # 附带真实 Key 的 JWT 对拍
 *
 * ⚠ 仓库里**不能**出现真实凭据：默认用占位 Key；
 *   真要拿自己的 Key 跑，请在命令行临时传 --key，别写进文件。
 *
 * 退出码 0 = 全部通过；1 = 有用例失败。
 */
import { createHmac, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'miniapp', 'glm_usage_app', 'index.js');

/* ---- 从 index.js 里切出加密实现 ---- */
const src = readFileSync(SRC, 'utf8');
const begin = src.indexOf('const SHA_K = [');
const end = src.indexOf('/* ============================== 小工具');
if (begin < 0 || end < 0) {
  console.error('✗ 无法在 index.js 里定位加密实现段落（SHA_K .. 小工具）');
  process.exit(1);
}
const cryptoSrc = src.slice(begin, end);

/* eslint-disable no-eval */
const mod = await import(
  'data:text/javascript;base64,' +
  Buffer.from(cryptoSrc + '\nexport { sha256Bytes, hmacSha256, b64url, strBytes, makeApiJwt };')
    .toString('base64')
);

/* ---- 参考实现 ---- */
const refB64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const refSha256 = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest();
const refHmac = (key, msg) => createHmac('sha256', Buffer.from(key, 'utf8')).update(Buffer.from(msg, 'utf8')).digest();

/* ---- 用例：填充边界(55/56/63/64/65)、密钥长度边界、UTF-8 多字节/代理对 ---- */
const cases = [
  ['', ''],
  ['a', 'a'],
  ['key', 'The quick brown fox jumps over the lazy dog'],
  ['k'.repeat(55), 'msg'],
  ['k'.repeat(56), 'msg'],
  ['k'.repeat(63), 'msg'],
  ['k'.repeat(64), 'msg'],
  ['k'.repeat(65), 'msg'],
  ['k'.repeat(100), 'x'.repeat(200)],
  ['秘密密钥-中文-utf8', '中文消息测试 🎯'],
  ['pbe', 'a'.repeat(55)],
  ['pbe', 'a'.repeat(56)],
  ['pbe', 'a'.repeat(63)],
  ['pbe', 'a'.repeat(64)],
  ['pbe', 'a'.repeat(65)],
  ['😀'.repeat(3), '🎯'.repeat(5)]
];

let fail = 0;
for (const [k, m] of cases) {
  const mineHmac = Buffer.from(mod.hmacSha256(k, m));
  const refH = refHmac(k, m);
  const mineSha = Buffer.from(mod.sha256Bytes(mod.strBytes(m)));
  const refS = refSha256(m);
  const okHmac = mineHmac.toString('hex') === refH.toString('hex');
  const okSha = mineSha.toString('hex') === refS.toString('hex');
  const okB64 = mod.b64url(mineHmac) === refB64url(refH);
  if (!okHmac || !okSha || !okB64) {
    fail++;
    console.error(`✗ FAIL key=${JSON.stringify(k.slice(0, 16))} msg=${JSON.stringify(m.slice(0, 16))} ` +
      `hmac=${okHmac} sha=${okSha} b64=${okB64}`);
  }
}
console.log(`向量用例 ${cases.length} 条，失败 ${fail} 条`);

/* ---- JWT 端到端：和 Node crypto 独立算出来的 token 逐字符比对 ----
   默认用一个**明显是假的**占位 Key（<id>.<secret>）。
   要拿真实 Key 验证就显式传 --key 'xxxxxxxx.yyyyyyyy'，
   但**不要**把真实 Key 写进仓库 —— 仓库里不能有任何凭据。 */
const FAKE_KEY = '0123456789abcdef0123456789abcdef.TEST_ONLY_secret_TEST_ONLY_secret';
const keyArgIdx = process.argv.indexOf('--key');
const apiKey = keyArgIdx > 0 && process.argv[keyArgIdx + 1]
  ? process.argv[keyArgIdx + 1]
  : FAKE_KEY;
const dot = apiKey.indexOf('.');
if (dot > 0) {
  const keyId = apiKey.slice(0, dot);
  const secret = apiKey.slice(dot + 1);
  const now = Math.floor(Date.now() / 1000);
  const h = refB64url(Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })));
  const p = refB64url(Buffer.from(JSON.stringify({ api_key: keyId, exp: now + 3600, timestamp: now })));
  const si = h + '.' + p;
  const refJwt = si + '.' + refB64url(refHmac(secret, si));
  const mineJwt = mod.makeApiJwt(apiKey);
  if (mineJwt === refJwt) {
    console.log('JWT 端到端对拍：一致 ✓');
  } else {
    fail++;
    console.error('✗ JWT 与 Node crypto 不一致');
    console.error('  mine:', mineJwt);
    console.error('  ref :', refJwt);
  }
}

if (fail) {
  console.error(`\n自检失败：${fail} 项`);
  process.exit(1);
}
console.log('全部通过 ✓');
