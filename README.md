# 网易有道听力宝 E6 (YDLE6 / Rockchip RV1106) 玩机与自制开发指南

<p align="center">
  <img src="custom_app/app_icon.png" width="96" height="96" alt="Icon">
</p>

<p align="center">
  <b>永久 Root 提权 · 绕过签名校验 · Linux DRM 60FPS 双缓冲图形开发 · 原生桌面图标集成</b>
</p>

---

## 📖 项目简介

网易有道听力宝 E6（Model: YDLE6）搭载 **瑞芯微 Rockchip RV1106** 主控芯片（ARM Cortex-A7 32-bit，1.2GHz），配备 2.83 英寸 240×320 DPI LCD 屏幕、电容触摸屏，以及高达 **32GB Samsung eMMC 存储**。

官方固件基于 Linux 5.10 与定制的 QuickJS `miniapp` 图形引擎。本项目完整记录了：
1. **逆向分析与永久 Root 提权**：在 U-Boot 严格校验 Kernel RSA-2048 签名的情况下，通过 `rootfs_a` EROFS 镜像热补丁成功绕过 ADB 密码鉴权，取得永久最高 `root` 权限；
2. **Linux DRM/KMS 60FPS 原生图形开发**：无需 X11 / Wayland，基于 Linux 原生 DRM Dumb Buffer 与硬件换页（CRTC Flip），实现了 **真正无撕裂、无闪烁的 60FPS 平滑图形界面**；
3. **电容触摸屏防误触独占方案**：使用 Linux 内核 `EVIOCGRAB` 机制独占接管触摸屏，杜绝了返回桌面时的幽灵点击现象；
4. **原生桌面图标无缝集成**：无需替换或破坏原厂任何内置功能（如网易云音乐），通过轻应用包热注册在系统桌面上生成独立图标入口，点击即可唤醒自定义原生程序。

---

## 🛠️ 硬件与系统信息

| 项目 | 参数 | 说明 |
| :--- | :--- | :--- |
| **主控芯片** | Rockchip RV1106 | ARM Cortex-A7 @ 1.2GHz，支持 NEON/VFPv4 |
| **系统架构** | Linux 5.10.160 (`armv7l`) | C 库为 uClibc-ng，极适合静态编译 |
| **内部存储** | 32GB Samsung eMMC | `/userdisk` 分区可用空间整整 **22.8 GB** |
| **屏幕规格** | 240 × 320 DPI RGB LCD | 驱动节点 `/dev/dri/card0` (Connector ID: 70, CRTC ID: 66) |
| **触摸芯片** | hyn_ts 电容触控 | 输入事件节点 `/dev/input/event3` |
| **调试接口** | USB-C ADB & Wi-Fi 无线调试 | 端口 5555 |

---

## 📂 仓库目录结构

```text
youdao-tinglibao-e6/
├── README.md               # 项目主文档
├── docs/                   # 核心原理解析
│   ├── HARDWARE.md         # 硬件架构、引脚定义与 eMMC 分区表
│   └── ROOT_GUIDE.md       # Root 提权与 EROFS 哈希热补丁全教程
├── src/                    # 原生自制程序源码
│   ├── hello_screen/       # 60FPS DRM 无闪烁双缓冲图形程序 (Go 实现)
│   ├── launcher_watcher/   # 原生桌面应用点击事件捕获与唤醒守护进程
│   └── web_server/         # 极轻量级板载 Web 文件/管理服务器
├── custom_app/             # 桌面自制应用模板 (独立 AppID 注册包与图标)
│   ├── manifest.json       # 轻应用元数据与 SHA/MD5 校验
│   └── app_icon.png        # 桌面图标文件 (102x94)
└── tools/                  # 常用开发脚本
    ├── build_all.sh        # 一键交叉编译所有组件
    ├── connect_wifi.sh     # Wi-Fi ADB 无线连接脚本
    └── push_and_run.sh     # 一键推送 ARM 二进制到设备运行
```

---

## 🚀 快速上手

### 1. 编译全套原生组件 (使用 Go 交叉编译)

Go 语言天然自带跨平台交叉编译支持，无需在宿主机安装复杂的 GCC 工具链：

```bash
# 进入 tools 目录并一键编译：
bash tools/build_all.sh
```

编译产物会自动生成在各源码目录下（均为纯静态 ARMv7 二进制）。

### 2. 通过无线 Wi-Fi 连接听力宝

确保听力宝与电脑处于同一局域网（例如手机热点或家庭路由器）：

```bash
bash tools/connect_wifi.sh 192.168.0.109
```

连接成功后，运行 `adb shell` 即可直接进入无密码的最高 `root` 终端！

### 3. 一键推送并运行 60FPS 屏幕演示

```bash
bash tools/push_and_run.sh src/hello_screen/hello_screen
```

---

## 💡 核心图形技术与突破点

### 1. 彻底解决屏幕刷新跳动与闪烁 (Hardware Double Buffering)
- 初代 Demo 采用单显存缓冲直接写像素，由于 DPI LCD 扫描并发执行，肉眼能看到每帧逐像素被擦除又重画的跳变；
- **优化方案**：在 DRM 层开辟两个 Dumb Buffer（`buf0` 与 `buf1`），后台离屏渲染，绘制完成后调用 `DRM_IOCTL_SET_CRTC` 瞬间硬件换页；静态底色与卡片仅在内存中预渲染一次，达成稳定 60 FPS 丝滑运动！

### 2. 独占触摸解决退出时的“幽灵点击” (`EVIOCGRAB`)
- 当挂起 `miniapp` 运行自制图形界面时，若直接使用触摸退出，手指抬起时产生的触摸事件会残留在 Linux 输入子系统的消息队列中；
- 当恢复 `miniapp` 时，桌面会立即读取该残留点击，误开下层的其他应用；
- **优化方案**：在 `hello_screen` 中对 `/dev/input/event3` 发送 `ioctl(fd, EVIOCGRAB, 1)`。独占接管后，内核不再向其他任何应用派发触摸事件；退出时等待指尖抬起再释放独占，彻底杜绝误触。

---

## ⚠️ 免责声明与安全警告

1. 本项目仅供嵌入式 Linux 技术学习与个人折腾研究，请勿用于非法用途；
2. 听力宝的 `boot_a` 分区受 RSA-2048 严格签名保护，**千万不要直接烧写修改过的 boot 镜像**，否则将导致签名失效变砖；
3. 进行任何底层写块操作前，强烈建议使用 `dd` 对设备完整分区进行离线备份。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。欢迎大家提 Issue 和 PR，一起将有道听力宝 E6 打造成超便携的 Linux 墨水屏/小屏极客玩具！
