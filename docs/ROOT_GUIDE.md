# 有道听力宝 E6 永久 ROOT 与免密提权实操教程

本教程记录了针对网易有道听力宝 E6（型号 YDLE6 / Hermes 板型）从分析到完整 Root 提权的全过程。

---

## 1. 突破口：ADB 鉴权机制逆向

在系统设置关于本机菜单中连续点击版本号/法律信息 5 次，可临时开启 USB 调试端口。但每次建立连接时，系统会弹出密码提示：
```text
YoudaoE6-358's password:
```
早期的默认口令（如 `CherryYoudao`）已在新版固件中失效。

通过分析只读系统分区 `rootfs_a` 中的鉴权脚本 `/usr/bin/adbd_auth.sh`，发现系统使用 MD5 对输入的密码进行校验：
```bash
PASS_HASH="24f192481770c0978c713cf2d41394e6"
INPUT_HASH=$(echo -n "$1" | md5sum | awk '{print $1}')
if [ "$INPUT_HASH" = "$PASS_HASH" ]; then
    exit 0
fi
```

---

## 2. 提权方案：EROFS 镜像哈希热补丁

由于 U-Boot 校验了 `boot` 分区的 RSA 签名，但**没有校验 rootfs 的签名**，因此我们可以通过原地替换 MD5 哈希字符串的方式，将密码修改为已知口令。

### 已知可控哈希对：
- 原始哈希：`24f192481770c0978c713cf2d41394e6`
- 替换哈希：`054bda46d56c8496e14e81d78f5a3c27` （对应密码明文：`ydpen2026`）

两串 MD5 的长度均为 32 字节，进行二进制替换不会改变 EROFS 文件系统的文件大小和 inode 结构！

---

## 3. 刷入步骤

### 步骤 1：进入 Rockchip 刷机模式（Loader 模式）
1. 将听力宝完全关机；
2. 长按【音量加键】不放；
3. 插入 USB-C 数据线连接电脑；
4. 电脑端使用 `rkdeveloptool ld` 检查，出现：
   ```text
   DevNo=1	Vid=0x2207,Pid=0x110c,LocationID=...	Loader
   ```

### 步骤 2：生成并刷入 Patch 镜像
在电脑端使用十六进制替换工具或 sed 替换官方 rootfs 镜像中的哈希：
```bash
# 生成补丁镜像
sed 's/24f192481770c0978c713cf2d41394e6/054bda46d56c8496e14e81d78f5a3c27/g' rootfs_official.img > rootfs_patched.img

# 通过 rkdeveloptool 刷入 rootfs_a 分区 (LBA 270336)
rkdeveloptool wl 270336 rootfs_patched.img

# 重启设备
rkdeveloptool rd
```

### 步骤 3：登录与提权验证
设备开机后，在系统设置中点开 ADB，使用密码 `ydpen2026` 认证：
```bash
adb shell
# 输入密码：ydpen2026
# 查看权限：
id
# uid=0(root) gid=0(root)
```
永久 ROOT 达成！
