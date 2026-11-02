# 截图与触摸注入 —— 有道听力宝 E6 真机自动化

> 本文所有命令与结论均在 **有道听力宝 E6（YDLE6 / Hermes，RK3326/RV1106，2.83″ 240×320 彩屏）**
> 真机上实测通过，附事件流与像素级 diff 双重证据。

---

## 0. 前置条件

```bash
# 两条 ADB 通道，任选其一；推荐 USB（TCP 通道在设备深睡时会断）
D=192.168.0.109:5555          # TCP
U=LE62200008802358            # USB 序列号

adb devices                   # 确认在线
adb -s $D shell 'id'          # 应当看到 uid=0(root)
```

### 0.1 ⚠️ 换 WiFi 后 IP 会变，别写死

E6 用 DHCP，换个 WiFi 或重启后租约就变了（实测 `192.168.0.109` → `192.168.0.201`）。
仓库提供了自动解析（**USB 优先，否则按 MAC 找当前 IP**）：

```bash
source tools/e6_device.sh
D="$(e6_resolve_device)"      # → 192.168.0.201:5555 或 LE62200008802358
IP="$(e6_resolve_ip)"         # → 192.168.0.201
```

`tools/e6_ui.sh`、`tools/connect_wifi.sh`、`miniapp/build_miniapp.sh`
都已经接上这个解析器，**不用再改脚本里的 IP**。

想知道设备当前 IP，又没有 USB 时，按 MAC 查 ARP 表即可：

```bash
arp -a | grep -i 64:82:14:fb:c1:13      # E6 的 WiFi MAC
```

（ARP 表里没有就先 `ping` 扫一遍本网段把表填上，脚本 `e6_warm_arp` 就是干这个的。）

> ⚠️ **E6 会同时持有两个 IP**（实测 `192.168.0.201` 和 `192.168.0.202`，MAC 都是 `64:82:14:fb:c1:13`，
> 两个都 ping 得通、9307 都开着）——大概率一个是连路由器的 STA 地址，另一个是它自己开的热点地址。
> `e6_resolve_device` 会遍历所有匹配 IP，**优先选 5555 开着的那一个**。

### 0.2 设备端不需要装任何东西

截图走系统自带的 `miniapp_cli`，触摸注入用本仓库自带的
`src/tap/e6_tap`（静态编译的 ARM 二进制，直接写 `/dev/input/event3`）。

### 0.3 无线通道：设备侧必须开着 ADB 网络调试

**换 WiFi 之后 `adb tcpip 5555` 通常会失效**（重启或换网后 adbd 不再监听 5555）。

实测对 `192.168.0.201` 做**全端口扫描（1–65535）**，只有 **9307** 开着：

| 端口 | 状态 | 说明 |
|---|---|---|
| 5555 / 5556 / 5037 | closed | adbd 没在 TCP 上监听 → 无线连不上 |
| 9307 | **open** | 有道自己的 WebSocket 服务，但**是 stub**：任何合法 JSON 文本帧都回 `{"id":<回显>,"result":{}}`，非法 JSON 无响应，二进制回 `not text msg`。**死路，别浪费时间。** |

所以纯无线要能连，前提是设备侧 ADB 网络调试是开的。插一次 USB 开一下即可：

```bash
adb -s LE62200008802358 tcpip 5555
adb connect 192.168.0.201:5555
```

之后可以拔掉线，全程无线（`tools/e6_device.sh` 会自动跟上新的 IP）。

---

## 1. 截图

### 1.1 唯一可靠的官方方式

```bash
adb -s $D shell 'miniapp_cli capture /tmp/shot.png'     # → capture: {"ret": 0}
adb -s $D pull /tmp/shot.png ./shot.png
```

产出是 **240×320 的 PNG**（与屏幕逻辑分辨率一一对应），抓的是 DRM/KMS 显示层，
因此**能抓到 launcher 桌面**，不局限于某个 app 内部。

### 1.2 黑屏判别：318 字节 = 没渲染，不是抓屏失败

| PNG 大小 | 含义 |
|---|---|
| **318 B** | 纯黑图 → **app 没渲染出来**（黑屏 / 加载失败 / 模块加载报错） |
| ~1.7 KB | 有文字（简单页面） |
| **18–30 KB** | 正常渲染（官方 app 对照截图 24 KB） |

> 这个 318 字节是**判黑屏最快的办法**：抓完先 `ls -l` 看大小，比肉眼读图快得多。

### 1.3 `captureFB` 在本机固件上不可用

```bash
adb -s $D shell 'miniapp_cli captureFB /tmp/fb.png'
# → captureFB: {"ret": -1}     且 /tmp/fb.png 根本不会被创建
```

`captureFB`（抓 fbdev）在 E6 当前固件上返回 `ret:-1`，**不要依赖它**。
统一用 `capture`。

### 1.4 抓 launcher 桌面

`capture` 对桌面同样有效，用于验证"图标是否安装/卸载成功"：

```bash
adb -s $D shell 'miniapp_cli capture /tmp/desktop.png'
```

### 1.5 像素级 A/B diff（验收的硬判据）

肉眼判断"变了没"不可靠。用 `tools/pngdiff.py` 做逐像素比对：

```bash
python3 tools/pngdiff.py before.png after.png
# 输出:
#   size (240, 320)
#   差异像素数: 927
#   差异区域 x: 15 - 223  y: 193 - 215
```

`差异像素数 == 0` → 画面**完全没变**（点击没生效 / 注入失败）；
`> 0` 且能框出一个矩形区域 → 该区域就是这次操作造成的**唯一变化**，
可以用来反推按钮的真实像素位置。

---

## 2. 触摸注入（点击界面）

### 2.1 为什么不能用 `input` / `sendevent`

设备 busybox 里**没有** `input`、`sendevent`、`getevent`，只有一个**只读**的 `evtest`：

```bash
adb -s $D shell 'which input sendevent getevent evtest'
# → (无输出) /usr/bin/evtest
```

所以 `adb shell input tap 190 297` 是一条**空操作**，shell 返回 0 却什么也没发生。
**曾经因为这个误以为"点偏了"，实际是根本没点。** 不要在这个前提上做任何坐标推断。

### 2.2 触摸设备与坐标系

```bash
adb -s $D shell 'ls -l /dev/input/'
# event0 = rtc_alarm
# event1 = power-keys
# event2 = gpio-keys
# event3 = hyn_ts          ← 触摸屏，就是它
# event4 = Typec_Headphone
```

`evtest` 读出的轴范围：

```
ABS_MT_SLOT        Max 0        ← 单点触控
ABS_MT_POSITION_X  Min 0 Max 240
ABS_MT_POSITION_Y  Min 0 Max 320
ABS_MT_TRACKING_ID Min 0 Max 65535
ABS_MT_TOUCH_MAJOR Min 0 Max 255
Properties: INPUT_PROP_DIRECT
```

**关键结论：触摸坐标 == 240×320 逻辑坐标，无旋转、无缩放、无偏移。**
（与 `/etc/miniapp/resources/cfg.json` 里的 `tp_direction=0 / tp_xoffset=0 / tp_yoffset=0` 一致。）

→ 也就是说，**你在截图上量到的像素坐标，可以直接拿去点击**，1:1 对应。

### 2.3 `e6_tap`：本仓库自带的注入器

源码 `src/tap/main.go`（纯 Go，无依赖，静态编译）。核心逻辑：

- 打开 `/dev/input/event3`（`O_WRONLY`）
- 构造 Linux `struct input_event`（32 位：`timeval` 8B + `u16 type` + `u16 code` + `s32 value`），
  小端写入
- MT protocol B 序列：
  ```
  ABS_MT_SLOT=0 → ABS_MT_TRACKING_ID=1 → ABS_MT_TOUCH_MAJOR=8
  → ABS_MT_POSITION_X=x → ABS_MT_POSITION_Y=y → SYN_REPORT
  ...（松手）
  → ABS_MT_TOUCH_MAJOR=0 → ABS_MT_TRACKING_ID=-1 → SYN_REPORT
  ```

### 2.4 编译与部署

```bash
cd src/tap
./build.sh                       # CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build
ls -lh e6_tap                   # ≈1.6 MB，ELF 32-bit ARM，静态链接

adb -s $D push src/tap/e6_tap /userdisk/e6_tap
adb -s $D shell 'chmod +x /userdisk/e6_tap'
```

> 仓库里**已内置编译好的 `src/tap/e6_tap`**，不想装 Go 也能直接 push 使用。
> `/userdisk/` 是设备上的可写持久分区，重启不丢。

### 2.5 命令形状

```bash
adb -s $D shell '/userdisk/e6_tap tap   <x> <y>'                    # 单击
adb -s $D shell '/userdisk/e6_tap swipe <x1> <y1> <x2> <y2> [ms]'   # 滑动（默认 400ms，24 个中间点）
adb -s $D shell '/userdisk/e6_tap long  <x> <y> [ms]'               # 长按（默认 800ms）
adb -s $D shell '/userdisk/e6_tap drag  <x1> <y1> <x2> <y2> [ms]'   # 按住拖动
```

坐标越界会直接报错退出（`x>=0 && x<240 && y>=0 && y<320`）。

### 2.6 内核事件流（实测抓包证据）

用只读的 `evtest` 同时监听，验证工具真的写进了内核：

```bash
adb -s $D shell 'evtest /dev/input/event3 > /tmp/ev.txt 2>&1 & sleep 1; /userdisk/e6_tap tap 100 120; sleep 1; kill %1'
adb -s $D shell 'grep "^Event" /tmp/ev.txt'
```

**tap**：

```
type 3 (EV_ABS), code 57 (ABS_MT_TRACKING_ID),  value 1
type 3 (EV_ABS), code 48 (ABS_MT_TOUCH_MAJOR),  value 8
type 3 (EV_ABS), code 53 (ABS_MT_POSITION_X),   value 100
type 3 (EV_ABS), code 54 (ABS_MT_POSITION_Y),   value 120
-------------- SYN_REPORT ------------
type 3 (EV_ABS), code 48 (ABS_MT_TOUCH_MAJOR),  value 0
type 3 (EV_ABS), code 57 (ABS_MT_TRACKING_ID),  value -1
-------------- SYN_REPORT ------------
```

**swipe**：按下 → 24 个中间移动点（每个一次 `X/Y + SYN`）→ 抬起，共 **80 条事件**。

**long**：`down` 与 `up` 的时间戳相差 **801 ms**（指定 800ms），即按下状态真实维持了 800ms。

### 2.7 ⚠️ 陷阱：内核会丢弃"值没变化"的 ABS 事件

在**同一个坐标**连点两次，第二次的事件流里**看不到 `POSITION_X/Y`**：

```
# 第一次点 (177,295) 之后再点 (177,295)：
type 3 (EV_ABS), code 57 (ABS_MT_TRACKING_ID), value 1
type 3 (EV_ABS), code 48 (ABS_MT_TOUCH_MAJOR), value 8
-------------- SYN_REPORT ------------          ← 没有 X/Y！
```

原因是 Linux input core 的 `input_abs_set_val()`：ABS 轴的**新值等于旧值**时，
该事件直接被内核丢弃（不往下发）。

**这不影响点击正确性**：框架在 `SYN_REPORT` 时读取的是**当前 ABS 轴状态**（缓存值），
而不是"本帧变化过的轴"。所以坐标仍能正确送达。
但**别把"事件流里没有 X/Y"误读成"没点上"**——这是本机最容易被误判的一点。

### 2.8 坐标标定方法

因为截图坐标与触摸坐标 1:1 对应，最可靠的做法是**反推**而不是估算：

1. `capture` 抓一张当前界面的图
2. 用 `tools/pngdiff.py` 做 A/B diff，**差异矩形的边界就是被点击区域的像素范围**
3. 取矩形中心作为下一次点击坐标

实测例子（本仓库的 miniapp 演示页）：

```bash
python3 tools/pngdiff.py v_before.png v_after.png
#   差异像素数: 927
#   差异区域 x: 15 - 223  y: 193 - 215
```

由 `src/tap/main.go` 的布局（按钮行 `paddingLeft/Right=10`，两按钮 `flex:1`，间距 8px，
行高 50px 贴底）可算出按钮中心 ≈ `(177, 295)`，与 diff 结果完全吻合。

---

## 3. 日志取证

Falcon 只转发 `console.warn` / `console.error`（`console.log`/`info`/`debug` 被静默丢弃），
所以**所有可观测行为都要从系统日志里捞**：

```bash
# MiniApp 自己的日志
adb -s $D shell "grep 'console(8090906000000001)' /userdata/applog/YD_PEN_APP.log"

# JS 报错
adb -s $D shell "grep -n 'ReferenceError\|TypeError\|SyntaxError' /userdata/applog/YD_PEN_APP.log | tail -5"

# 声音是否真的开了 PCM（关键：光看 JS 没报错不算数）
adb -s $D shell "grep 'openOutputDevice' /userdata/applog/SoundPlayer.log | tail"
adb -s $D shell "tail -6 /userdata/applog/SoundPlayer.log"
#   → [YAudioOutput] [closeOutput] close success : 0
```

### 3.3 ⚠️ 设备 adbd **不透传 shell 退出码**

```bash
adb -s $D shell 'false'; echo "退出码=$?"     # → 退出码=0   （正常 adb 应该是 1）
adb -s $D shell 'ls /userdisk/nope'; echo $?  # → 退出码=0   （文件明明不存在）
```

这台机器的 adbd 不把远程命令的退出状态回传给本地。
**后果**：任何 `adb shell cmd && next` 或 `if ! adb shell cmd; then` 的判断都会**永远为真**。

正确做法是**看 stdout 的内容**：

```bash
# ❌ 错误（永远认为"存在"）
if adb shell "test -x /userdisk/e6_tap"; then ...; fi

# ✅ 正确：用 stdout 标记
if [ "$(adb shell 'test -x /userdisk/e6_tap && echo __OK__' | tr -d '\r\n')" = "__OK__" ]; then ...; fi
```

同理，`miniapp_cli capture` 也不能靠退出码判断，要看它打印的 `{"ret": 0}`。

---

## 4. 一体化脚本 `tools/e6_ui.sh`

把截图 / 点击 / 滑动 / 长按 / 日志包成一条命令：

```bash
./tools/e6_ui.sh shot  out.png                 # 截图并 pull 回来
./tools/e6_ui.sh tap   177 295                 # 点击
./tools/e6_ui.sh swipe 200 60 40 240           # 滑动
./tools/e6_ui.sh long  60 200 800             # 长按
./tools/e6_ui.sh log   app                     # 看 miniapp 日志
./tools/e6_ui.sh log   sound                   # 看声音日志
./tools/e6_ui.sh diff  a.png b.png             # 像素级 diff
./tools/e6_ui.sh verify before.png after.png   # 一键 A/B 判定

# 指定通道
./tools/e6_ui.sh -d LE62200008802358 shot out.png
```

`verify` 子命令会自己判定：差异像素为 0 → **FAIL（操作没生效）**；
否则打印差异区域并返回 0 → **PASS**。

---

## 5. 完整验收案例（点击真的生效）

在 E6 的 miniapp 演示页上，"响一声"按钮点击一次会走
`onBeep()` → `playBase64()` → `this.detail = 'sound.uuid=' + uuid`。

**A/B 对照组实测**：

```bash
D=192.168.0.109:5555
adb -s $D shell 'miniapp_cli start 8090906000000001'
sleep 8
adb -s $D shell 'miniapp_cli capture /tmp/v_before.png' && adb -s $D pull /tmp/v_before.png .

# 对照组：点中性空白区 (200,225)
adb -s $D shell '/userdisk/e6_tap tap 200 225'; sleep 2
adb -s $D shell 'miniapp_cli capture /tmp/v_neutral.png' && adb -s $D pull /tmp/v_neutral.png .

# 实验组：点"响一声"按钮中心 (177,295)
adb -s $D shell '/userdisk/e6_tap tap 177 295'; sleep 3
adb -s $D shell 'miniapp_cli capture /tmp/v_after.png' && adb -s $D pull /tmp/v_after.png .
```

结果：

```
MD5 v_before.png  = 68e6c53deacba35073f8d2601682a60f
MD5 v_neutral.png = 68e6c53deacba35073f8d2601682a60f   ← 与 before 完全一致（对照组没反应）
MD5 v_after.png   = 6b5ce0a85f1897f1e9d39bf2b588aba4   ← 变了

像素 diff:
  before vs neutral  差异像素数: 0      ← 中性区点击确实什么都没发生
  before vs after    差异像素数: 927
                      差异区域 x: 15-223  y: 193-215   ← 就是详情文本行
```

同时系统日志里出现了新的 uuid（每次点击新生成）：

```
[YFfmpegPrivate] deInnitPcmResample==end
[YAudioOutput]  closeOutput ... close success : 0
```

**结论：对照组零变化、实验组精准变化、声音 PCM 真实打开并关闭 → 触摸注入确认生效。**

---

## 6. 坑清单（都是实测踩出来的）

| 坑 | 现象 | 对策 |
|---|---|---|
| 换 WiFi 后 IP 变了 | 脚本写死的 `192.168.0.109` 连不上 | 用 `tools/e6_device.sh` 自动解析（按 MAC 找） |
| 设备无 `input`/`sendevent` | `input tap` 返回 0 但毫无反应 | 用 `e6_tap` 写 `/dev/input/event3` |
| 内核丢弃重复 ABS 值 | 同坐标连点，事件流里没有 X/Y | 正常现象，框架读的是轴缓存值 |
| **adbd 不透传退出码** | `adb shell false` 也返回 0，`&&` 判断全失效 | 看 stdout 标记（`&& echo __OK__`） |
| `captureFB` 返回 `ret:-1` | 文件根本不生成 | 用 `capture` |
| 318 字节 PNG | 以为是抓屏坏，其实是 app 没渲染 | 拿大小当黑屏判据 |
| `miniapp_cli` 没有 `stop` 子命令 | `stop` 打印用法列表 | 重复 `start` 即可重启 |
| `process.exec` stdout ~4KB 截断 | 读二进制静默被切 | `dd bs=1024 skip=K count=1 \| xxd -p -c 0` 分块读 |
| `console.log` 被丢弃 | 调试没输出 | 一律用 `console.warn` |
| TCP 通道偶发 `Error connect` | 设备深睡/连接竞争 | 加 `sleep`，或改用 USB 通道 |

---

## 7. 相关文档

- [`MINIAPP_DEV.md`](MINIAPP_DEV.md) —— Falcon MiniApp 入口契约、模块清单、四大能力
- [`ROOT_GUIDE.md`](ROOT_GUIDE.md) —— 永久 root 方案
- [`HARDWARE.md`](HARDWARE.md) —— 硬件规格与分区表
