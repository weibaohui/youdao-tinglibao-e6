# HTTP 远程调试接口 —— 有道听力宝 E6

> 在设备上跑一个 HTTP 服务，**任何能访问到它的浏览器、脚本或 AI Agent 都能
> 截图、点击、滑手势、按物理键、看日志** —— 等于一台远程操纵的"云模拟器"。
> 全程不用插 USB 线、不用开 ADB、不用 SSH。

配合 [`PERSISTENT_ACCESS.md`](PERSISTENT_ACCESS.md) 的开机钩子，**重启后自动起来**。

---

## 1. 快速开始

```bash
# 装（会一并编译并部署服务）
./tools/e6_ssh_setup.sh

# 打开面板
open http://192.168.0.201:8080/
```

> IP 会变，用仓库的解析器：
> ```bash
> source tools/e6_device.sh && e6_resolve_ip
> ```

---

## 2. Web 模拟器：人和 AI 都能操作界面

打开 `http://<ip>:8080/` 得到的面板就是一台**远程模拟器**，能力覆盖设备上
几乎所有输入：

- **实时屏幕**（1.5s 自动刷新）：点画面任意位置 = 注入一次点击（坐标自动换算，带准星）；
- **手势卡片**：上/下滑、左/右滑预设（距离、时长可调），走 `/swipe` 单指路径；
- **物理按键卡片**：电源（含长按）、音量±、播放/暂停、上一首/下一首、Home/录音，
  内核级 `EV_KEY` 注入，与实体按键完全同路；
- **手动坐标**：X/Y + 点击/长按/滑动，画任意路径；
- **日志面板**：app / sound / error 三类日志一键加载。

### AI Agent 操作闭环

面板背后的纯 HTTP 接口对 AI 同样开放 —— **看屏 → 定位 → 操作 → 验证** 四步
全部可编程，这就是"AI 可以操作界面上的元素"的完整含义：

```bash
IP=192.168.0.202

# ① 看屏：抓当前画面，AI 读图定位元素（坐标 1:1，截图上量到的像素就是点击坐标）
curl http://$IP:8080/shot.png -o now.png

# ② 操作：点击 / 滑动 / 物理键（元素在截图上的像素坐标直接可用）
curl "http://$IP:8080/tap?x=208&y=305"                       # 点"刷新"按钮
curl "http://$IP:8080/swipe?x1=120&y1=240&x2=120&y2=70"      # 上滑看更多
curl "http://$IP:8080/key?name=home"                          # Home/录音键

# ③ 验证：再抓一张对比，或拉应用日志确认行为
curl http://$IP:8080/shot.png -o after.png
curl "http://$IP:8080/logs?what=app&n=20"
```

本仓库的开发过程就是这套闭环的实际用例：GLM 用量 App 的桌面图标定位、
进入应用、点刷新、验证查询结果，全部由 AI 通过这几个接口远程完成（真机取证
截图见 [`GLM_USAGE.md`](GLM_USAGE.md)）。

**给 AI 的三个判据**（也是给人的）：

1. 截图坐标与触摸坐标 **1:1 对应**（240×320，无旋转无偏移），
   图上量到的元素位置可直接作为 `tap` 参数；
2. **熄屏时 `/shot.png` 是随机彩噪**（不是黑屏！），先 `tap` 一下点亮再抓；
   纯黑 PNG 恰好 **318 字节** = 应用没渲染；
3. 触屏是**单点**（无多点），捏合/双指手势硬件上做不到。

### 操作接口清单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | **调试面板网页**（看屏幕 + 点屏幕 + 手势 + 物理键） |
| GET | `/shot.png` | 当前屏幕截图（240×320 PNG） |
| GET/POST | `/tap?x=&y=` | 点击，坐标范围 0≤x<240、0≤y<320 |
| GET/POST | `/swipe?x1=&y1=&x2=&y2=&ms=` | 滑动（默认 400ms） |
| GET/POST | `/long?x=&y=&ms=` | 长按（默认 800ms） |
| GET/POST | `/key?name=&ms=` | **物理按键注入**（默认 80ms 按住；见下表） |
| GET | `/logs?what=app\|sound\|err&n=50` | 日志尾部 |
| GET | `/status` | JSON 状态（主机名、IP、uptime、分辨率） |
| GET | `/healthz` | 存活探测 |

命令行用法：

```bash
IP=192.168.0.201

curl http://$IP:8080/shot.png -o shot.png
curl "http://$IP:8080/tap?x=177&y=295"
curl "http://$IP:8080/swipe?x1=200&y1=60&x2=40&y2=240&ms=400"
curl "http://$IP:8080/long?x=120&y=200&ms=1000"
curl "http://$IP:8080/key?name=vol_up"
curl "http://$IP:8080/key?name=power&ms=900"    # 长按电源
curl "http://$IP:8080/logs?what=app&n=30"
curl http://$IP:8080/status | jq .
```

### 面板手势与按键的语义

- 手势卡片箭头 = **翻阅方向**：⬆️ 回看上方内容、⬇️ 看下方内容、
  ⬅️ 翻到左边一页、➡️ 翻到右边一页（内容跟手，注入的是反方向拖拽）。
  注意：桌面首页是一条**纵向长 Feed**（顶栏 Tab 随滚动高亮，不是横向分页器），
  横向快拂会被启动器自己映射成纵向惯性滚动 —— 这是启动器行为，不是注入方向问题；
- 物理按键 `name` 对照见下表。

### 物理按键对照表（keycode 实测）

来源：设备树 `linux,code` 属性 + 真人按键事件流对拍（2026-11-02）。
注入走 `e6_tap key <name>`（直写对应 `/dev/input/eventX`，EV_KEY press/release，
与实体按键**完全同路**——框架的 `YButtonEventModule` 收到的事件与真按无差别）：

| `name` | 实体按键 | keycode | 内核键名 | event 节点 |
| :--- | :--- | :--- | :--- | :--- |
| `power` | 电源 | 116 | KEY_POWER | event1 |
| `vol_up` | 音量+ | 115 | KEY_VOLUMEUP | event2 |
| `vol_down` | 音量− | 114 | KEY_VOLUMEDOWN | event2 |
| `play` | 播放/暂停 | 207 | KEY_PLAY | event2 |
| `next` | 下一首 | 159 | KEY_FORWARD | event2 |
| `prev` | 上一首 | 158 | KEY_BACK | event2 |
| `home` / `menu` | **Home/录音键** | 139 | KEY_MENU | event2 |

真机响应验证：音量键 → `onVolumeUpButtonClick` + 音量值变化；
电源键 → `屏幕熄灭` / `屏幕点亮计时器`；
Home 键 → `onHomeButtonClick`（录音类应用用它触发录音）。
播放/上一首/下一首的事件到达框架，应用级行为取决于当前播放器状态。

命令行等价：`adb shell /userdisk/e6_tap key vol_up`，或任意键值
`adb shell /userdisk/e6_tap evkey event2 139`。

---

这个面板在**调试 MiniApp 布局**时特别顺手：改一行代码 → 重新编译部署 →
浏览器里点一下就能看到效果，不用反复插拔 USB。

---

## 4. 实现要点

### 4.1 截图

走官方的 `miniapp_cli capture`（DRM/KMS 路径），在设备本地执行后直接读文件：

```go
exec.Command("miniapp_cli", "capture", tmp).CombinedOutput()
```

> ⚠️ `captureFB` 在本机固件上返回 `ret:-1` 且不生成文件，**不要用**。
> ⚠️ 纯黑 PNG 恰好 **318 字节** = app 没渲染，不是抓屏失败。

### 4.2 点击

复用仓库里的 `src/tap/e6_tap`（直写 `/dev/input/event3` 的 ARM 注入器）：

```go
exec.Command(tapBin, "tap", "177", "295")
```

**坐标 == 屏幕像素，1:1 对应**（无旋转无偏移），所以截图上量到的像素可以直接用。

### 4.3 日志

直接读 `/userdata/applog/YD_PEN_APP.log` 和 `SoundPlayer.log` 的尾部。
注意 Falcon **只转发 `console.warn` / `console.error`**，`console.log` 全部被丢弃。

### 4.4 鉴权（可选）

服务默认**不鉴权**，方便局域网内直接用。如果环境不完全可信，启动时加 token：

```sh
E6_TOKEN=你的token /userdisk/e6_debug_server
```

之后所有请求都要带 `?token=xxx` 或 `X-E6-Token: xxx` 头。
面板页面同理：`http://<ip>:8080/?token=你的token`。

> 提醒：这个服务能向设备注入任意触摸，等价于**完整的远程输入控制**。
> 公网或公共 WiFi 下务必开 token。

---

## 5. 自动拉起

服务由开机钩子 `/userdisk/skip_re/skip_login.sh` 拉起，看门狗每 30 秒检查一次 8080 端口，
掉了自动补。日志：

```bash
adb -s 192.168.0.201:5555 shell 'tail -5 /userdisk/ssh/boot.log'
adb -s 192.168.0.201:5555 shell 'tail -5 /userdisk/ssh/watchdog.log'
adb -s 192.168.0.201:5555 shell 'tail -5 /userdisk/ssh/debug_server.log'
```

端口一览：

```
0.0.0.0:22     SSH
0.0.0.0:5555   无线 ADB（零口令）
0.0.0.0:8080   HTTP 调试服务
0.0.0.0:9307   有道自带的 WebSocket（stub，死路）
```

---

## 6. 源码

```
src/e6_debug_server/
├── main.go        HTTP 服务（Go，静态编译成 ARM 二进制）
├── index.html     调试面板页面（go:embed 内嵌）
└── build.sh       GOOS=linux GOARCH=arm GOARM=7 交叉编译
```

设备上落在 `/userdisk/e6_debug_server`（约 5.7 MB）。
改完代码后：

```bash
cd src/e6_debug_server && ./build.sh
adb -s <ip>:5555 push e6_debug_server /userdisk/e6_debug_server
adb -s <ip>:5555 shell 'chmod +x /userdisk/e6_debug_server; kill $(lsof -t /userdisk/e6_debug_server 2>/dev/null)'
adb -s <ip>:5555 shell 'setsid /userdisk/e6_debug_server >/userdisk/ssh/debug_server.log 2>&1 &'
```

（设备上没有 `lsof`，直接 `kill` 掉 8080 的监听进程即可，看门狗也会在 30 秒内自动补回。）

---

## 7. 三个通道怎么选

| 场景 | 推荐 |
|---|---|
| 快速看一眼屏幕 | `/shot.png` + `curl` |
| 交互式调 MiniApp 布局 | 浏览器开 `/` 面板，直接点 |
| 要 root shell / 装包 / 看系统 | SSH（`~/bin/e6`）或无线 ADB |
| 写自动化脚本 | 无线 ADB（`adb -s <ip>:5555`）最顺手 |

三条通道**互不依赖**：SSH 挂了看门狗会拉起来，HTTP 挂了也一样，
adb 掉了也有 SSH 兜底。
