# 有道听力宝 E6 · MiniApp（Falcon / QuickJS）应用开发完全指南

> 本文所有结论均在 **YDLE6 真机**上实测取得，并用官方固件里的 `jsfm-nvue.js.bin`
> 与官方 app 字节码**反汇编交叉验证**。不是推测，是踩坑记录。

---

## 0. 30 秒速查（先抄这段）

```bash
# 构建 + 部署 + 启动 + 抓屏 + 打印日志（一条龙）
cd miniapp && ./build_miniapp.sh
```

`app.js`（入口）必须长这样：

```javascript
class MyBasePage extends $falcon.Page {}                       // ① 页面基类

class AppClazz extends $falcon.App {                           // ② App 类
  onLaunch(options) {
    super.onLaunch(options);                                    // ③ 必须先 super
    $falcon.useDefaultBasePageClass(MyBasePage);                // ④ 注册页面基类
  }
}
AppClazz.meta = { name: 'x', version: '1.0.0', isSingleJsBundle: true };  // ⑤ 静态 meta
$falcon.__AppClazz = AppClazz;                                  // ⑥ 交出 App 类
$falcon.__loadModuleDefault = async function (name) {           // ⑦ 页面加载器
  const mod = await import('./' + name + '.js');
  return mod.default;
};
```

`index.js`（页面）导出**组件对象**（不是 Page 子类）：

```javascript
export default {
  data() { return { msg: 'hello' }; },
  methods: { go() { /* ... */ } },
  render(h) { return h('div', { style: { width: '240px', height: '320px' } }, [
    h('text', { style: { color: '#fff', fontSize: '16px' } }, this.msg)
  ]); }
};
```

---

## 1. 这台机器到底是什么

| 项目 | 事实 |
| :--- | :--- |
| 型号 | 网易有道听力宝 E6（YDLE6），内部代号 **Hermes** |
| SoC | Rockchip **RV1106**（ARM Cortex-A7 32bit），另有 RK3326 版 |
| 系统 | **不是 Android**。Buildroot + uClibc-ng，Linux 5.10.160 `armv7l` |
| 运行时 | 自研 **Falcon** 引擎（`/usr/lib/libfalcon.so`）+ **QuickJS 2020-07-05** |
| 屏幕 | 2.83″ **240×320 彩色 TFT**（不是墨水屏！），竖屏 |
| 视口 | `/etc/miniapp/resources/cfg.json` → `"screen": {"width":240,"height":320}` |
| 应用形态 | **MiniApp**（`.amr` 包），不是 APK；装在 `/userdisk/secondary/miniapp/data/mini_app/pkg/<appid>/` |
| 调试 | ADB root shell；`miniapp_cli` 提供 install / start / capture / uninstall |

> ⚠️ 因为不是 Android，`fastboot`、卡刷、装 APK、`.dex` 这些路全部不成立。

---

## 2. ★ 入口契约：三个致命坑

Falcon 用 `qjsc -m`（ES Module 模式）编译，**模块作用域隔离**，
全局**不存在** `App()` / `Page()` 这两个小程序式注入函数。

### 坑 1：写成 `App({...})` → 启动即崩

```
ReferenceError: 'App' is not defined
    at <anonymous> (app.js:2)
TypeError: not a function
    at launchApp (jsfm-nvue.js:4807)
```

### 坑 2：漏掉 `useDefaultBasePageClass` → App 起得来，但页面全黑

框架 `launchApp` 反汇编（`/etc/miniapp/resources/framework/jsfm-nvue.js.bin`）：

```javascript
// jsfm-nvue.js:4806
this.$app = new this.__AppClazz();
this.$app.$falcon = this;
this.$app.$meta  = this.__AppClazz.meta;
this.$app.$meta  = Object.assign(this.$app.$meta, this.$_appInfo);  // 4810
delete this.$_appInfo;
delete this.__AppClazz.meta;
this._performAppLifeCycle('onLaunch', options || {}, 'launch');
```

官方 app 的 `onLaunch` 反汇编（真实字节码）：

```javascript
onLaunch(options) {
  super.onLaunch(options);
  $falcon.useDefaultBasePageClass(MyBasePage);   // ← 缺这一步 = 黑屏
}
```

`useDefaultBasePageClass` 会校验 `BasePageClass.prototype instanceof Page`，
传错会抛 `DefauBasePageClass must extend from $falcon.App`。

### 坑 3：漏掉静态 `meta` → `Object.assign(undefined, ...)` 崩溃

```javascript
// jsfm-nvue.js:4810
this.$app.$meta = Object.assign(this.$app.$meta, this.$_appInfo);
//                                          ^^^^^^^^^^^^^^^ undefined
// => TypeError: cannot convert to object
```

`AppClazz.meta` 至少要是个对象：`{ name, version, isSingleJsBundle }`。

### 坑 4：`$falcon` 是全局，不能 import

```javascript
import { App } from '$falcon';
// => ReferenceError: could not load module filename '$falcon'
```

`$falcon` 就是框架实例（`globalThis.$_Falcon`），直接用即可。

### 页面导出：组件对象 vs Page 子类

框架 `loadPage` → `__loadPage`（`jsfm-nvue.js:4891`）反汇编：

```javascript
const isPageClass = pageMods.prototype instanceof Page;
if (isPageClass) {
  page = new pageMods();          // 导出的是 Page 子类 → 框架自己 new
} else {
  page = new options.Page();       // 导出的是组件对象 → 用注册的 BasePage 包装
  page._component      = pageMods;
  page._component_only = true;
}
```

**E6 上推荐导出组件对象**（范式 A）：框架用你在 `app.js` 里注册的
`MyBasePage` 当壳，把组件的 `render(h)` 挂进原生视图树。

---

## 3. ★ console 只有 warn / error 有效

实测：

```javascript
console.log('x');     // ❌ 静默丢弃，日志里什么都没有
console.info('x');    // ❌ 同样丢弃
console.debug('x');   // ❌ 同样丢弃
console.warn('x');    // ✅ (console(<appid>).warn.0): x
console.error('x');   // ✅ (console(<appid>).error.0): x
```

**调试必须用 `console.warn`**。这是 E6 上最容易浪费时间的一个坑
（表现为"代码明明执行了却没有任何日志"）。

---

## 4. 四大能力写法（全部真机实测通过）

### ① 写界面

视口 **240×320 竖屏**。组件是 Vue 2 风格对象，`render(h)` 返回虚拟节点树。

```javascript
export default {
  data() { return { msg: 'E6 能力秀' }; },
  created() { console.warn('[App] created'); },
  methods: {
    onTap() { this.msg = 'tapped'; }     // 改 this 上的字段即触发重渲染
  },
  render(h) {
    return h('div', {
      style: {
        width: '240px', height: '320px',
        backgroundColor: '#0d1117',
        flexDirection: 'column'          // Yoga Flexbox，默认就是 column
      }
    }, [
      h('text', { style: { color: '#ffffff', fontSize: '16px' } }, this.msg),
      h('div', { style: { flex: 1, backgroundColor: '#2f6feb' }, on: { click: this.onTap } }, [
        h('text', { style: { color: '#ffffff', fontSize: '14px' } }, '点我')
      ])
    ]);
  }
};
```

**可用原生标签**（`libfalcon.so` 的 `JQuick::ComponentRegistry`，19 个）：
`div` `text` `image` `image-frame` `gif` `scroller` `slider` `seekbar`
`input` `textarea` `canvas` `qrcode` `richtext` `lottie` `hole` `modal`
`latex` `ocr-preview` `surface`

**样式只有 73 项白名单**：禁止 `calc()`、`display:grid`、`white-space`、
`aspectRatio`（填 0 会 Yoga 除零崩溃）。文本省略用 `<text>` 的
`lines: 1` + `text-overflow: ellipsis`。

**取尺寸**：`/etc/miniapp/resources/cfg.json` 是权威来源，别猜。

### ② 上网

QuickJS 是纯净内核，**没有** `fetch` / `XMLHttpRequest` / `WebSocket`。
必须用内建 `http` 模块，且**只有对象参数这一种形状可用**（实测穷举）：

```javascript
import http from 'http';

const res = await http.request({
  url: 'http://www.baidu.com',
  method: 'GET',
  timeout: 8000
});
// res = { status: 200, body: '...', headers: {...} }
```

实测结果：

| 写法 | 结果 |
| :--- | :--- |
| `http.request({url, method, timeout})` | ✅ `status=200`，body 731779 字节 |
| `http.request({url, method}, cb)` | ✅ 同上（回调被忽略） |
| `http.request('http://...')` | ❌ `Error: Error` |
| `http.request(url, {method})` | ❌ `Error: Error` |

其他可用网络模块：`httpbridge`（带有道 OpenAPI 签名）、`net`（裸 TCP）。

### ③ 写文件

**E6 没有 `fs` 模块**（S7 Pro 有，两者模块集不同，别照抄）。
用 `process` 模块调 shell：

```javascript
import process from 'process';

const r = await process.exec('sh', ['-c', 'echo hello > /userdisk/e6_demo/hello.txt'], { timeout: 10000 });
// r = { code: 0, signal: null, stdout: '...', stderr: '...' }
```

**只有 `exec(cmd, argsArray, opts)` 这一种形状可用**（实测穷举）：

| 写法 | 结果 |
| :--- | :--- |
| `process.exec('echo', ['hi'], {timeout})` | ✅ `{code:0, stdout:'hi\r\n'}` |
| `process.exec('echo', ['hi'])` | ✅ |
| `process.exec('echo hi')` | ❌ 整串被当成文件名 → `code=127` |

注意：**命令是 argv 数组，不是 shell 字符串**。要管道/重定向就自己 `sh -c`。

可写区：`/userdisk`（22.8 GB）、`/userdata`。
代码目录 `/userdisk/secondary/miniapp/data/mini_app/pkg/<appid>/<slot>/` 只读，别往里写。

设备上**没有** `base64` / `openssl` / `python` 命令，
只有 `xxd` / `hexdump` / `od` / `awk` / `dd` / `tr`。

#### ★ `process.exec` 的 stdout 有约 4KB 上限（静默截断）

这是写文件/读二进制时最容易中招的坑。一次性读一个 9644 字节的文件，
只会拿到 3962 个 hex 字符（≈1981 字节），**不报错**，但下游拿到的是残缺数据：

```
[E6Demo] sound ok ... hexlen=3962 b64len=2644      ← 看起来成功，其实被截断
SoundPlayer: avformat_open_input failure            ← 真正的失败点在这里
```

**解法：分块读。**

```javascript
for (let k = 0; k < 64; k++) {
  const cmd = 'dd if=' + path + ' bs=1024 skip=' + k + ' count=1 2>/dev/null | xxd -p -c 0';
  const r = await process.exec('sh', ['-c', cmd], { timeout: 10000 });
  const hex = String(r.stdout || '').replace(/\s+/g, '');
  if (!hex) break;                       // 读完了
  parts.push(hex);
  if (hex.length < 1024 * 2) break;      // 最后一块
}
```

（shell 层本身没有截断——`sh -c 'head -c 100000 /dev/zero'` 能完整输出 100000 字节。
上限在 Falcon 的 `JSProcess::exec` 内部。）

### ④ 发声音

E6 的 `soundPlayer` 模块在**核心库**里（`/etc/miniapp/jsapis/libjsapi_export_core.so`
导出 `soundPlayer_module_init`），不需要每个 app 自带 `.so`。

```javascript
import soundPlayerModule from 'soundPlayer';

const sound = new soundPlayerModule.SoundPlayer();
const uuid = sound.playBase64(base64Audio, 0, 1.0, false, 0);   // ← 推荐
```

原型方法（实测）：
`play` `stop` `quickStop` `playFile` `playBase64` `playOnlineAudio`
`playTts` `playMediaSection` `setPlayTTSParam` `switchTtsAutoPronType`

**E6 发声的三个关键事实**：

1. **`playBase64` 可靠，`playFile` 对本地路径不可靠。**
   `playBase64` 会让系统播放器把数据落成 `/tmp/tmpSaveRealSoundA.mp3` 再解码播放；
   `playFile('/userdisk/...')` 只返回 uuid，不触发实际解码。
   注意：落盘后缀是 `.mp3`，但 ffmpeg 是按**内容**探测格式的，
   所以传 WAV 数据也能正常解码 —— 但**数据必须完整**，否则 `avformat_open_input failure`。
2. **声卡是独占的。** ALSA 只有一路 DAC，系统 `SoundPlayer`
   （`/oem/YoudaoDictPen/output/SoundPlayer`）占着 PCM 时，
   `hal-audio-write` 会报 `failed to open PCM!`。
   反之系统播放器空闲时 `hal-audio-write` 退出码为 0，可直接写声卡。
3. **输出格式是 48kHz / 双声道 / 16bit。** 设备端 `SoundPlayer.log` 实测：
   ```
   [playMedia] paramDataJson={"fileName":"/tmp/tmpSaveRealSoundA.mp3"}
   [openAudioFile] fileName==/tmp/tmpSaveRealSoundA.mp3
   [openOutputDevice] m_audioDevice.channels=2 m_audioDevice.rate=48000
   [openOutputDevice] open=======success====m_bIsCloseOutput==1
   [openOutputDevice] =m_srcNbSamples==640        ← 真的喂了 640 个采样点给声卡
   [closeOutput] close success : 0
   ```
   16kHz 单声道也能播，系统会重采样。

**应用自带音频**（推荐，零外部依赖）：把 wav 放进 `assets/`，
运行时用 `process.exec` 分块取（注意 A/B 槽位 `a/` `b/` 会轮换，用 `find` 定位）：

```javascript
const locate = await process.exec('sh', ['-c',
  'find /userdisk/secondary/miniapp/data/mini_app/pkg/' + APPID +
  ' -name beep.wav 2>/dev/null | head -1'], { timeout: 10000 });
const b64 = await fileToBase64(locate.stdout.trim(), 1024);   // 见上面的分块读
const sound = new soundPlayerModule.SoundPlayer();
sound.playBase64(b64, 0, 1.0, false, 0);
```

---

## 5. 可用模块清单（E6 实测）

| 模块 | E6 | 说明 |
| :--- | :---: | :--- |
| `http` | ✅ | `request({url,method,timeout})` → `{status,body,headers}` |
| `process` | ✅ | `exec(cmd,args,opts)` → `{code,signal,stdout,stderr}` |
| `soundPlayer` | ✅ | `new SoundPlayer()` → `playBase64` 等 |
| `storage` | ✅ | 键值持久化，`getStorage` / `setStorage` |
| `device` `display` `system` `sqlite3` `util` `crypto` `miniapp` `network` | ✅ | 核心能力 |
| `wifi` `volume` `brightness` `systemInfo` `buttonEvent` `gsensor` `bluetooth` `headSetInfo` | ✅ | 在 `libjsapi_export_core.so` 里 |
| `fs` `file` `path` `zip` | ❌ | **E6 没有**，写文件请用 `process` |
| `clipboard` `vibrator` `battery` `batteryInfo` | ❌ | E6 没有 |

> 导入设备上不存在的模块会让**整个模块加载失败**（黑屏），不是只少一个功能。

---

## 6. 工程结构与打包

```text
my_app/
├── manifest.json      # 应用清单 + MD5 签名表（cert）
├── app.js             # 入口：App 类 + 页面基类注册 + __loadModuleDefault
├── index.js           # 根页面组件
├── app_icon.png       # 156×160 桌面图标
└── assets/            # 图片/音频等静态资源
```

打包产物 `.amr` **就是个 ZIP**：

```text
manifest.json
app.js.bin          # QuickJS 字节码，第 0 字节必须是 0x01
index.js.bin
app_icon.png
assets/beep.wav
```

编译命令（`miniapp/host_tools/qjsc` 是 macOS arm64 版）：

```bash
./qjsc -m -M http -M process -M soundPlayer -c -o out.c index.js
```

- `-m` **必须有**：ES Module 模式，否则运行时找不到入口
- `-M <mod>`：声明内建模块，避免 qjsc 报 `Module not found`

`manifest.json` 关键字段：

```json
{
  "appid": "8090906000000001",
  "icon": "app_icon.png",
  "quickjs": { "version": "20200705", "bigNum": false },
  "props": {
    "supportUnInstall": true,
    "addDesktop": {
      "apollo_platform": true,
      "y08_platform": true,
      "hermes_platform": true
    },
    "Icons": { "theme-hermes": "app_icon.png", "theme-apollo": "app_icon.png" }
  }
}
```

桌面卡片需要 `apollo_platform` + `y08_platform` + `hermes_platform` 同时为 `true`，
否则安装成功但桌面不显示图标。

---

## 7. 部署与验证（真机命令）

```bash
D=192.168.0.109:5555        # 或 USB 序列号

adb -s $D push e6_demo_app.amr /tmp/e6_demo_app.amr
adb -s $D shell 'miniapp_cli install /tmp/e6_demo_app.amr'   # → {"appid":"...","ret":0}
adb -s $D shell 'miniapp_cli start 8090906000000001'         # → {"ret":0}
adb -s $D shell 'miniapp_cli capture /tmp/shot.png'          # 抓屏（240x320 PNG）
adb -s $D pull /tmp/shot.png /tmp/shot.png

# 日志（只有 warn/error 级别）
adb -s $D shell 'grep "console(8090906000000001)" /userdata/applog/YD_PEN_APP.log'

# 声音是否真的播出（PCM 是否打开）
adb -s $D shell 'grep "openOutputDevice" /userdata/applog/SoundPlayer.log | tail'

# 卸载（清理桌面图标）
adb -s $D shell 'miniapp_cli uninstall 8090906000000001'
```

> ⚠️ `miniapp_cli capture` 抓到的是**当前屏幕**。如果画面全黑（318 字节的纯黑 PNG），
> 说明 app 没渲染，不是截图机制坏了 —— 用官方 app 对照即可区分。

---

## 8. 参考

- 框架源码（反汇编对象）：设备上 `/etc/miniapp/resources/framework/jsfm-nvue.js.bin`
- 官方 app 字节码：设备上 `/userdisk/secondary/miniapp/data/mini_app/pkg/<官方appid>/<slot>/app.js.bin`
- 视口配置：`/etc/miniapp/resources/cfg.json`
- 桌面注册表：`/etc/miniapp/resources/local_packages.json`
- Falcon 全生态教程：<https://github.com/cubelikeplayDaniel/youdao-dictpen-s7pro-guide>
  （`docs/falcon_miniapp_pitfalls_and_failure_prevention.md` 与本文互为印证；
   该仓库面向 S7 Pro，视口 1020×240，E6 是 240×320）
