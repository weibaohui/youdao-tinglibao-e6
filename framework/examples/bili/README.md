# 小电视（B 站）—— e6app 示例应用 · appid 8090906000000009

网易有道听力宝 E6 上的 B 站客户端：**浏览热门/排行/搜索 → 点视频 → 设备自己解码播放画面+声音**。

> 全程在设备上完成，**不需要任何外部服务器**。
> 可行性研究与全部实测记录见 [`docs/BILIBILI_CLIENT.md`](../../../docs/BILIBILI_CLIENT.md)。

## 操作

| 输入 | 动作 |
| :--- | :--- |
| 点顶栏 **热门 / 排行 / 搜索** | 切换数据源（全部免登录） |
| 点列表某一条 | **画面 + 声音**一起播（画面由设备端原生播放器接管屏幕） |
| 点搜索框 | 调起系统输入法，输完自动搜（防抖 900ms） |
| **点一下屏幕** | 退出画面，界面自动回到列表（声音继续） |
| 底栏 **有画面 / 仅声音** | 切换是否起原生播放器（只想要声音时关掉） |
| 底栏 **停止** | 停声音 + 杀掉播放器 |

## 画面是怎么出来的

Falcon 框架**没有 `video` 组件**（`libfalcon.so` 里根本没有 "video" 字符串），
小程序自己解不了码、也送不上屏。所以画面交给一个**设备端原生进程**
[`src/e6_vplay/`](../../../src/e6_vplay/)：

```
设备自带 ffmpeg 4.4.1  ──► 拉 B 站 DASH 视频轨，H.264 解码 + scale 240×320
     └─► BMP 帧序列 /tmp/e6vplay/f_*.bmp
          └─► hal-drmshow（固件自带，走有道显示 HAL + libdrm）
               └─► drmModeAddFB + drmModeSetCrtc → 直接写 DPI-1 屏（240×320）
```

- 实测 **6–10fps**（瓶颈是「每帧重启一次 `hal-drmshow`」的 52ms 开销）；
- 点屏幕即退出，**框架界面自动收回**；
- 声音是另一条路：App 自己调 `playurl` 拿 DASH 音轨 → `soundPlayer.playOnlineAudio` 直拉 m4s（免 Referer）。

## 部署（画面需要先装原生播放器）

```bash
# 1) 播放器推上设备
adb -s <E6_IP>:5555 push src/e6_vplay/e6_vplay /userdisk/e6_vplay
adb -s <E6_IP>:5555 shell chmod +x /userdisk/e6_vplay

# 2) 编译打包 + 装机
framework/bin/e6app build framework/examples/bili
adb -s <E6_IP>:5555 push framework/examples/bili/dist/8090906000000009.amr /tmp/bili.amr
adb -s <E6_IP>:5555 shell 'miniapp_cli install /tmp/bili.amr'
adb -s <E6_IP>:5555 shell 'miniapp_cli start 8090906000000009'
```

没装 `/userdisk/e6_vplay` 也能用 —— App 会自动降级成"仅声音"。

## 实现要点

- **请求头是命门**：B 站风控对头很敏感 —— 要么只带 UA，要么**全套浏览器头 + buvid3 指纹 cookie**，
  半套（只加个 Referer）会让 `view` 必 412。代码里统一走 `headers()`。
- **`Accept-Encoding: identity` 必须显式发**，否则回 gzip，设备解压能力未验证。
- **声音只取 DASH 音轨**（`fnval=16` → `dash.audio[].baseUrl`）：它**不需要 Referer**；
  而 durl 的整段 mp4 无 Referer 直接 403，设备又没法给原生播放器加头。
- **画面轨挑 `avc1`**（H.264），设备是软解，HEVC 会吃力。
- **CDN 会偶发 403**（同一 URL 10 次里最多挂 1 次）→ 依次回退 `backupUrl[]`。
- 列表接口（热门/排行）**自带 `cid`**，省一次 `view` 请求；只有搜索结果才需要查 `view`。
- 搜索结果的 `duration` 是字符串 `"10:35"`，热门/排行是秒数 → 两种都要认。
- 调试日志一律用 `console.warn`（E6 只记录 warn/error）。

## 已知限制

- 音频区（`/x/audio/**`）已被 B 站下线，只能播**视频的音轨+画面**。
- 画面 6–10fps，且要占着屏幕（App 界面被盖住），点屏幕才回得来。
- 弹幕接口恒返回 deflate 压缩，未实现解压（见可行性文档 §3.4）。
- 匿名访问最高 720P、且看不到收藏/推荐（需要扫码登录，未接）。
