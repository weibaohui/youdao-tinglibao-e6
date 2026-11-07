# 有道听力宝 E6 · 「小电视」B 站客户端 —— 可行性研究 + 实现

> 日期：**2026-11-06**，全部结论在 **YDLE6 真机**上实测。
> 一句话：**能做，而且能"真·在设备上播放"** —— 画面是设备自己 ffmpeg 解码 + 直接写 DRM 屏，
> 声音是设备自己直拉 B 站 DASH 音轨，**全程不经过任何外部服务器**。
>
> 配套：PoC App `framework/examples/bili/`（appid `8090906000000009`）
> 设备端原生播放器 `src/e6_vplay/`（`/userdisk/e6_vplay`）

---

## 0. 结论速览

| 能力 | 结论 | 证据 |
| :--- | :--- | :--- |
| 热门 / 排行榜 / 搜索 | ✅ 免登录可用 | 真机拉回 30 / 100 / 17 条 |
| 播放声音 | ✅ 免登录可用 | SoundPlayer `openOutputDevice success` + `m_srcNbSamples==1920` |
| **播放画面（真）** | ✅ **设备自己解码 + DRM 上屏** | 真机屏幕出画，6–10fps，逐帧重启 `hal-drmshow` 实测 52ms/帧 |
| 退出画面后回到 App | ✅ 框架自动收回显示 | 杀掉播放器后屏幕自动回到小电视界面 |
| 设备端原生解码 H.264 | ✅ 固件自带 ffmpeg 4.4.1 | 设备端 60 帧 / 3.7s（≈27fps 解码能力） |
| 小程序内部原生播视频 | ❌ 不可能 | `libfalcon.so` / `jsfm-nvue.js.bin` 里没有 "video" 字符串 |
| 弹幕 | ⚠️ 可行但要纯 JS inflate | 接口恒返回 raw deflate |
| 扫码登录（收藏/推荐/1080P+） | ⚠️ 接口已验证，未接 | passport 扫码接口通 |

---

## 1. 架构：两条链路，各走各的

```
                          ┌──────────── 小电视 App（Falcon / QuickJS）────────────┐
                          │  ① http 调 B 站接口 → 热门/排行/搜索/详情/playurl      │
                          │  ② 声音：dash.audio[].baseUrl → soundPlayer           │
                          │                    .playOnlineAudio(url)               │
                          └──────────────────────────┬───────────────────────────┘
                                                     │ ③ dash.video[].baseUrl
                                                     ▼
   ┌────────────── 设备端原生进程 e6_vplay（Go，纯静态 ARM）──────────────┐
   │  ffmpeg（设备自带 4.4.1，-tls_verify 0）→ 解 H.264 → scale 240×320   │
   │        └─► BMP 帧序列 /tmp/e6vplay/f_*.bmp                            │
   │  显示循环：取最新帧 → hal-drmshow（固件自带，有道显示 HAL + libdrm）  │
   │        └─► drmModeAddFB + drmModeSetCrtc → 直接写 DPI-1 屏（240×320） │
   │  点一下屏幕 → 退出 → 框架自动收回显示，App 界面回来                    │
   └──────────────────────────────────────────────────────────────────────┘
```

**为什么画面必须另起进程**：Falcon 小程序没有 `video` 组件，解码出的帧无处可送；
而 DRM master 虽然被 `miniapp` 宿主占着，**独立进程照样能 `drmModeSetCrtc` 接管 CRTC**
（实测有效，宿主不会来抢）。

---

## 2. 设备侧能力实测（这是"真播放"成立的基础）

### 2.1 固件自带的东西（之前完全没用到）

| 东西 | 位置 | 关键事实 |
| :--- | :--- | :--- |
| **ffmpeg 4.4.1** | `/usr/bin/ffmpeg` | 带 libdrm / swscale / openssl；`-tls_verify 0`（设备 `/etc/ssl/certs` 是空的）；**H.264 是软解**（无 rkvdec/omx） |
| **hal-drmshow** | `/usr/bin/hal-drmshow` | 有道显示 HAL + libdrm；吃 **JPEG 或 BMP**，按 240×320 建缓冲，`drmModeAddFB` + `drmModeSetCrtc` 直上屏；**一次性加载**（循环里只 SetCrtc+sleep，不重读文件） |
| **librga / libdrm** | `/usr/lib/` | RGA 硬件缩放、DRM 库 |
| DRM 面板 | `/sys/class/drm/card0-DPI-1` | connected，mode `240x320`，enabled |
| HAL 库 | `libydhal_base/comm/devices.so` | 有道自己的显示/设备 HAL |
| ~~GStreamer~~ | `/usr/bin/video_play_by_gst.sh` | **脚本在但 gst-launch-1.0 不存在**（是别的 SKU 的遗留），不能用 |
| ~~weston~~ | — | 没在跑；显示栈是 `miniapp` 宿主自己做 DRM |

### 2.2 逐帧显示的开销

```bash
# 设备实测：启动 hal-drmshow 显示一张图再杀掉，20 次
time sh -c 'i=0; while [ $i -lt 20 ]; do hal-drmshow /userdisk/test.jpg & p=$!; sleep 0.03; kill $p; i=$((i+1)); done'
# real 0m1.05s  →  ≈52ms/帧  →  上限 ≈19fps
```

实测端到端稳定 **6–10fps**（240×320）。

### 2.3 显示的交还

- 播放器进程退出后，**框架界面自动回到屏幕**（不需要播放器自己恢复 CRTC）；
- 所以交互是：**点一下屏幕 = 退出播放器 = 回到 App 列表**。

---

## 3. B 站接口实测矩阵

全部 Mac + E6 真机实测（2026-11-06）。

| 接口 | 免登录 | 备注 |
| :--- | :--- | :--- |
| `GET /x/web-interface/popular?ps=30&pn=1` | ✅ | 列表项**自带 `cid`**、封面 `pic`、秒数 `duration`、`stat.view` |
| `GET /x/web-interface/ranking/v2?rid=0&type=all` | ✅ | 同上，100 条 |
| `GET /x/web-interface/search/type?search_type=video&keyword=` | ✅* | **必须** buvid3 cookie + 全套浏览器头，否则 412 |
| `GET /x/web-interface/view?bvid=` | ✅ | 拿 `cid`（搜索结果没有 cid 时才需要） |
| `GET /x/player/playurl?bvid=&cid=&fnval=16` | ✅ | DASH；`dash.audio[]` 音轨、`dash.video[]` 视频轨 |
| `GET /x/frontend/finger/spi` | ✅ | 拿 `buvid3`/`buvid4`，**匿名可取**，绕 412 的钥匙 |
| `GET /x/web-interface/nav` | ⚠️ | `-101 未登录`，但仍带 `wbi_img` |
| `GET /x/audio/**`（音频区） | ❌ | B 站已下线，**全部 404** |
| `passport.../qrcode/generate` + `/poll` | ✅ | 未扫返回 `86101`，扫成功在 `data.url` 回 SESSDATA |

> **音频区没了** → 内容形态是 **UGC 视频的音轨/画面**，做不成传统音乐播放器。

### 3.1 请求头配方（能不能用的关键）

| 请求头组合 | 结果 |
| :--- | :--- |
| 只带 `User-Agent` | `view`/`playurl`/`popular` ✅；`search` ❌ 412 |
| **半套头**（UA + Referer，缺 Accept/Accept-Language/Origin/指纹） | `view` ❌ **必 412**（HTTP 412 + HTML 页） |
| **全套浏览器头 + buvid3/buvid4 cookie** | 全部 ✅ 200 |

App 统一用这一套：

```
User-Agent: <桌面 Chrome UA>
Referer: https://www.bilibili.com/
Origin: https://www.bilibili.com
Accept: application/json, text/plain, */*
Accept-Language: zh-CN,zh;q=0.9
Accept-Encoding: identity        ← 关键：强制明文 JSON
sec-ch-ua / sec-fetch-site / sec-fetch-mode / sec-fetch-dest
Cookie: buvid3=…; buvid4=…
```

其它实测细节：

- **UA 会被封**：`okhttp/4.9.3` → `-352`；`python-requests/2.32` → 412；
  框架默认的 `e6app/0.2` 侥幸能用，但建议覆盖成浏览器 UA。
- **`Accept-Encoding: identity` 必须显式发**（B 站默认按请求头回 gzip，设备解压能力未验证）。
- **播放地址 API 不吃 Referer**：`playurl` 免 Referer 直接 200。

### 3.2 音频：为什么只能走 DASH

| 取法 | URL | 设备端可行性 |
| :--- | :--- | :--- |
| `fnval=16` → `dash.audio[].baseUrl` | `https://*.mcdn.bilivideo.cn:8082/….m4s`（`mp4a.40.2` AAC/fMP4，129kbps） | ✅ **裸请求头就能拉**，真机 `playOnlineAudio` 正常出声 |
| `fnval=1` → `durl[].url` | `https://upos-sz-*.bilivideo.com/….mp4`（整段，650MB） | ❌ **无 Referer 直接 403**，设备没法给原生播放器加头 |

- 三档音轨 `30216`≈64k / `30232`≈132k / `30280`≈192k，**id 越小码率越低**（PoC 挑 30216）。
- 每条音轨带 **2 个 `backupUrl`** → CDN 偶发 403（同一 URL 10 次最多挂 1 次）时可回退。
- 音轨 URL 带 `deadline`，**约 1 小时过期**，长时间挂着的 App 要定期重取。
- 番剧/付费/直播的 `dash.audio` 可能为空 → UI 要提示"该视频没有可用音轨"。

⚠️ **两个必须处理的坑**（实测踩过，都会表现为"点了没声音"）：

1. **CDN 域名每次请求随机分配**：`baseUrl` 这次可能是 `*.mcdn.bilivideo.cn:8082`（裸头可拉），
   下次就是 `upos-sz-*.bilivideo.com`（无 Referer 一律 403）。
   → 播放前用 `http.request` 发一个 `Range: bytes=0-2047` 探测，**只挑 200/206 的那个**再播。
   ⚠️ 探测时**只能带 UA、不能带 Referer**（`soundPlayer` 加不了请求头，带 Referer 探通了它照样 403）。
2. **SoundPlayer 服务是"按需拉起"的**：App 刚启动就播，服务要 2–3 秒后才起来，
   那次 `playOnlineAudio` 请求直接丢掉（返回了 uuid，但日志里连 `openAudioFile` 都没有）。
   → 播之前先 `ps | grep -c [S]oundPlayer` 确认进程在（App 启动时顺手 `stop()` 预热更好）。

### 3.3 视频轨：原生播放器要的那条

- `dash.video[]` 里优先挑 **`avc1`**（H.264，ffmpeg 软解最快；`hvc1`/HEVC 也行但慢）；
- 匿名最高 720P，`dash.video` 的带宽 ~200–500kbps，设备端解 240×320 没问题。

⚠️ **视频轨的 CDN 域名同样是随机分配的**，而且**视频和音频的分配是独立的**：

| 域名形态 | 裸头能不能拉 | 备注 |
| :--- | :--- | :--- |
| `*.mcdn.bilivideo.cn:8082` | ✅ 200 | 稳定 |
| `upos-sz-*.bilivideo.com` | ❌ 403 | `access denied`，必须带 `Referer` |

→ 原生播放器（Go）拿到 `baseUrl` + 所有 `backupUrl` 后**逐个 Range 探测**，
挑第一个 200/206 的；同时给 ffmpeg 带上 `-headers "Referer: https://www.bilibili.com/"`，
这样 upos 域名也能兜住。App 侧则**不要**把 URL 传给播放器，只传 `--bvid/--cid`，
让播放器自己解析、自己挑能拉的那个。

### 3.4 弹幕（v2 再说）

- `comment.bilibili.com/<cid>.xml` 与 `/x/v1/dm/list.so` 都返回**纯 XML**，
  但**服务端恒定 `Content-Encoding: deflate`（raw deflate，magic `8c fd`）**，`identity` 也不给明文；
- 设备没有 zlib 解压 → 要么塞一份纯 JS inflate（150–250 行），要么服务端解压后转发；
- `/x/v2/dm/web/seg.so` 是 protobuf，更难。**结论：弹幕要等解压方案，排到 v2。**

---

## 4. 代码与复现

```text
framework/examples/bili/         小电视 App（Falcon / Vue SFC）
├── src/pages/index.vue           列表 + 声音(DASH) + 拉起原生播放器出画面
└── README.md

src/e6_vplay/                    设备端原生播放器（Go，纯静态 ARM，无 cgo）
├── main.go                       ffmpeg 解码 → JPEG 帧 → hal-drmshow 逐帧上屏
└── e6_vplay                      已编译（6.3MB，GOARM=7）

tools/bili_frame_server.mjs       （早期方案）Mac 端抽帧 —— 已被原生播放器取代，保留作参考
```

### 4.1 跑起来

```bash
# 1) 把原生播放器推上设备
adb -s <E6_IP>:5555 push src/e6_vplay/e6_vplay /userdisk/e6_vplay
adb -s <E6_IP>:5555 shell chmod +x /userdisk/e6_vplay

# 2) 编译打包 + 装机 App
framework/bin/e6app build framework/examples/bili
adb -s <E6_IP>:5555 push framework/examples/bili/dist/8090906000000009.amr /tmp/bili.amr
adb -s <E6_IP>:5555 shell 'miniapp_cli install /tmp/bili.amr'
adb -s <E6_IP>:5555 shell 'miniapp_cli start 8090906000000009'

# 3) 单独试播放器（不经过 App）
adb -s <E6_IP>:5555 shell '/userdisk/e6_vplay --bvid BV1SpxR6KE8w --cid 43335288477 --fps 12'

# 4) 看日志
adb -s <E6_IP>:5555 shell 'grep "console(8090906000000009)" /userdata/applog/YD_PEN_APP.log'
adb -s <E6_IP>:5555 shell 'tail -20 /userdisk/vplay.log'
adb -s <E6_IP>:5555 shell 'grep -E "openOutputDevice|m_srcNbSamples" /userdata/applog/SoundPlayer.log'
```

### 4.2 播放器参数

```
e6_vplay <video_url>             # 直接给 DASH 视频 URL
e6_vplay --bvid BVxxx [--cid N]  # 自己调 B 站接口解析（免登录，自带 buvid3 指纹）
--fps 12      目标帧率（默认 12，实测 6–10）
--max-sec 1800 最长播放时长
```

- 单实例：`/tmp/e6vplay.pid` 做锁，新实例会踢掉旧实例（App 侧清理失败时的兜底）；
- 退出：点一下屏幕 / Ctrl-C / 视频播完 / 到时长上限；
- 退出时自动收掉自己的 ffmpeg 与 hal-drmshow 子进程。

---

## 5. 真机验证记录（2026-11-06，固件 4.7.5，Hermes V10）

| # | 验证项 | 结果 | 证据 |
| :--- | :--- | :--- | :--- |
| 1 | App 启动 / 渲染 | ✅ | 截图：顶栏 + 三 Tab + 列表 30 条 |
| 2 | `finger/spi` 取 buvid3 | ✅ | 日志 `[bili] buvid3 ok 31B188E0-7FA` |
| 3 | `popular` 拉列表 | ✅ | 日志 `[bili] 列表 ok 30` |
| 4 | 封面远程图 | ✅ | 截图：每行缩略图都渲染出来了 |
| 5 | `view` → `cid` | ✅ | 日志 `cid=43335288477` |
| 6 | `playurl` → 音轨 | ✅ | 日志 `playOnlineAudio 候选 0 https://….m4s` |
| 7 | **声音真出声** | ✅ | `openAudioFile fileName==https://….m4s` → `openOutputDevice … success` → `m_srcNbSamples==1920` |
| 8 | 设备 ffmpeg 拉 B 站视频 | ✅ | 设备端 `ffmpeg -tls_verify 0 -i <dash url>` 解出 240×320 帧，60 帧/3.7s |
| 9 | **DRM 接管上屏** | ✅ | `hal-drmshow` 推测试图，屏幕真的变成该图（用户目视确认） |
| 10 | 播放器退出后界面自动回来 | ✅ | 杀掉播放器，屏幕自动回到小电视界面（用户目视确认） |
| 11 | **App 内点视频 → 出画面+声音** | ✅ | 日志 `原生播放器已启动` + 屏幕出画 + 声卡在喂数据 |
| 12 | 帧率 | ✅ | 10 秒 60–100 帧 ≈ 6–10fps |

---

## 6. 待办 / 风险

| 项 | 状态 | 备注 |
| :--- | :--- | :--- |
| 扫码登录（SESSDATA） | 未接 | 接口已验证；有了才能用收藏/推荐/稍后再看/1080P |
| WBI 签名 | 未接 | 目前不签名也能用，但搜索稳定性依赖 buvid3 |
| 弹幕 | 阻塞在 deflate | 需要纯 JS inflate 或服务端解压 |
| 进度条 / 断点续播 | 未做 | 音轨是单文件、支持 Range，可存秒数再 seek |
| 播放器进程常驻 | 未做 | 现在是「点视频起播放器，点屏幕退出」；没做后台常驻和通知 |
| 帧率 | 6–10fps | 受限于「每帧重启 hal-drmshow」的 52ms 开销；想更快得自己写 DRM 播放器（纯 Go 调 ioctl） |
| H.264 软解 | 是 | RV1106 的 VPU 没被 ffmpeg 用上（无 rkvdec）；854×384 尚可，更高分辨率吃力 |
| B 站接口稳定性 | 随时可能变 | 音频区已被下线，风控规则也会变 |
| 播放器安装 | 手动 push | `/userdisk/e6_vplay` 需要随 App 一起分发（可以塞进 .amr 的 assets，装机时展开） |

---

## 7. 相关文档

- `docs/MINIAPP_DEV.md` —— Falcon 框架能力与踩坑（组件清单、`http` 模块形状、console 只认 warn/error…）
- `docs/SCREENSHOT_AND_INPUT.md` —— 抓屏与触摸注入（`e6_tap`）
- `docs/GLM_USAGE.md` —— 另一条真机 HTTPS + 自定义头的实战记录
- `framework/examples/bili/README.md` —— PoC 操作说明
