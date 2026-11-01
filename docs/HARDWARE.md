# 有道听力宝 E6 (YDLE6) 硬件与系统架构全景

## 1. 硬件规格

| 组件 | 规格参数 | 备注 |
| :--- | :--- | :--- |
| **SoC** | **Rockchip RV1106** | 单核 ARM Cortex-A7 @ 1.2GHz，内置 0.5TOPs NPU |
| **架构** | ARMv7l (32-bit `armhf`) | 支持 NEON & VFPv4 硬浮点 |
| **系统内存** | 128MB / 256MB DDR3 (内置封装) | 极度精简高效 |
| **内置存储** | **32GB Samsung eMMC 5.1** (`mmcblk0`) | 空间极其宽裕，用户可用 >22GB |
| **屏幕规格** | **2.83 英寸 DPI LCD 屏幕** | 分辨率 **240 × 320**，XRGB8888 色彩模式 |
| **触摸芯片** | **hyn_ts** (I2C) | 节点 `/dev/input/event3`，支持电容多点触控 |
| **图形子系统**| **Linux DRM/KMS** (`/dev/dri/card0`) | 无 X11 / Wayland，原生 Dumb Buffer 硬件翻页 |
| **无线连接** | Wi-Fi 2.4G + Bluetooth 4.2 (BLE) | 支持 ADB 无线调试与网络传输 |
| **音频输出** | 独立大音腔扬声器 + Type-C 数字音频 | ALSA 架构 (`hw:0,0`) |

---

## 2. eMMC 分区表结构 (`/dev/mmcblk0`)

听力宝 E6 使用标准的 Rockchip Parameter 分区方案：

```text
CMDLINE: mtdparts=rk29xxnand:
0x00002000@0x00002000(uboot),           # LBA 8192 (4MB)
0x00002000@0x00004000(trust),           # LBA 16384 (4MB)
0x00010000@0x00006000(boot_a),          # LBA 24576 (32MB) FIT Image (RSA-2048 签名)
0x00010000@0x00016000(boot_b),          # LBA 90112 (32MB)
0x00010000@0x00026000(recovery),        # LBA 155648 (32MB)
0x00014000@0x00036000(misc),            # LBA 221184 (40MB)
0x00002000@0x0004A000(baseparamer),     # LBA 303104 (4MB)
0x00002000@0x0004C000(resource),        # LBA 311296 (4MB)
0x00134000@0x00042000(rootfs_a),        # LBA 270336 (~617MB) EROFS 只读文件系统 (无签名校验)
0x00134000@0x00176000(rootfs_b),        # LBA 1531904 (~617MB)
0x00040000@0x002AA000(oem),             # LBA 2793472 (128MB)
0x00080000@0x002EA000(userdata),        # LBA 3055616 (256MB) ext4 可读写配置
-@0x0036A000(userdisk)                  # LBA 3581952 (~23GB) ext4 海量用户存储
```

---

## 3. 核心发现与设计关键

1. **U-Boot FIT Image 签名锁定**：
   - `boot_a` 分区内的 Kernel 与 FDT 经由 RSA-2048 严格验签，**严禁直接修改 boot 分区**，否则将直接导致校验失败红灯黑屏。
2. **RootFS EROFS 无验签漏洞**：
   - 固件在引导阶段并没有对 `rootfs_a` 进行块级别的强制签名验签！
   - 只要保持 EROFS 结构对齐，直接修改 `rootfs_a` 镜像并刷入，即可无缝提权！
3. **DRM 独占与分时复用**：
   - 听力宝的桌面 UI 基于定制的 QuickJS `miniapp`，直接独占持有 `/dev/dri/card0`；
   - 自定义程序启动时，通过 `killall -STOP miniapp` 释放 DRM 主控权；
   - 自定义程序退出后，通过 `killall -CONT miniapp` 瞬间恢复原厂桌面，两者互不破坏。
