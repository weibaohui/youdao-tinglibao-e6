# E6 MiniApp（Falcon / QuickJS）开发套件

听力宝的系统应用（网易云音乐、百度网盘、官方输入法……）全都是 **Falcon MiniApp**：
QuickJS 2020-07-05 跑 ES Module，Vue 2 风格组件描述界面，Yoga 负责 Flexbox 布局，
Skia 2D 负责光栅化，最后落到 DRM/KMS 合成上屏。

这套目录让你能在这台机器上写出**自己的**应用，而不是只能用 Go 直接怼 DRM。

> 完整契约、可用 API 形状、踩坑清单见 **[../docs/MINIAPP_DEV.md](../docs/MINIAPP_DEV.md)**。

---

## 一键跑通

```bash
./build_miniapp.sh                          # 默认构建 e6_demo_app
E6_ADB=LE62200008802358 ./build_miniapp.sh  # 走 USB 通道
./build_miniapp.sh /path/to/your_app        # 构建指定工程
```

脚本依次完成：

1. `qjsc -m` 编译 `app.js` / `index.js` → QuickJS 字节码
2. 计算每个文件的 MD5 写进 `manifest.json` 的 `cert` 表
3. 打包成 `.amr`（本质是 ZIP）
4. `adb push` + `miniapp_cli install` + `miniapp_cli start`
5. `miniapp_cli capture` 抓一张 240×320 真机截图
6. 打印应用日志与最近的错误

---

## 目录

```text
miniapp/
├── build_miniapp.sh       # 一键构建/部署/验证
├── e6_demo_app.amr        # 构建产物（可直接 install）
├── e6_demo_app/
│   ├── app.js             # 入口：App 类 + 页面基类注册 + 页面动态加载器
│   ├── index.js           # 根页面组件：四合一能力自测
│   ├── manifest.json      # 应用清单
│   ├── app_icon.png       # 桌面图标（156×160）
│   └── assets/beep.wav    # 应用自带音频（16kHz 单声道 880Hz 0.3s）
└── host_tools/
    ├── qjsc               # QuickJS 编译器（macOS arm64 二进制）
    ├── build_amr.py       # .amr 打包 + adb 部署
    └── compile_js_bin.py  # 单文件字节码编译
```

---

## 演示应用做了什么

`e6_demo_app` 启动即自测，把四项能力的结果直接渲染到屏幕上：

| 能力 | 实现 | 实测结果 |
| :--- | :--- | :--- |
| ① 界面 | Falcon 组件对象 + `render(h)` | 240×320 竖屏正常渲染 |
| ② 联网 | `http.request({url,method,timeout})` | `HTTP 200`（baidu，731 KB） |
| ③ 文件 | `process.exec('sh', ['-c', ...])` | `/userdisk/e6_demo/hello.txt` 写后读回 |
| ④ 声音 | `new SoundPlayer().playBase64(b64, ...)` | 系统播放器 `openOutputDevice success` |

---

## 三个最容易踩的坑（详见开发指南）

1. **不能写 `App({...})`** —— Falcon 没有注入全局函数，必须
   `class X extends $falcon.App` + `$falcon.__AppClazz = X`。
2. **`console.log` 全部被丢弃** —— 调试只能用 `console.warn` / `console.error`。
3. **E6 没有 `fs` 模块** —— 写文件请用 `process.exec` 调 shell。

---

## 许可

与仓库主工程一致，MIT。
