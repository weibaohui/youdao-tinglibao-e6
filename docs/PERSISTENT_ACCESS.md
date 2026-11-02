# 永久免密 ADB + SSH —— 有道听力宝 E6

> 让 E6 **重启后依然**可以无线 ADB 登录、直接 SSH 进去，
> **不用再碰屏幕上的「设置 → 法律监管」开关，也不用每次插 USB 线**。
>
> 全部实测通过：设备重启后 **16 秒** SSH(22) 与 ADB(5555) 一起自动恢复。

---

## 0. 效果

| 能力 | 重启前 | 重启后 |
|---|---|---|
| 无线 ADB (5555) | 要插 USB 手动开开关 + 每次输口令 | **自动起来，零口令** |
| SSH (22) | 没有 | **自动起来，公钥登录** |
| root shell | 要口令 | 随时直接进 |

前提：设备已经能通过 ADB 拿到 root shell（见 [`ROOT_GUIDE.md`](ROOT_GUIDE.md)）。

---

## 1. 一键安装

```bash
cd youdao-tinglibao-e6
./tools/e6_ssh_setup.sh                       # 自动找设备
./tools/e6_ssh_setup.sh 192.168.0.201:5555    # 或指定
```

装完直接用：

```bash
ssh -i ~/.ssh/e6_ed25519 root@192.168.0.201    # SSH
adb connect 192.168.0.201:5555                 # 无线 ADB（零口令）
```

IP 会变，用仓库的解析器（USB 优先，否则按 MAC 查）：

```bash
source tools/e6_device.sh
D="$(e6_resolve_device)"     # → 192.168.0.201:5555 或 LE62200008802358
```

---

## 2. 它是怎么做到的（关键原理）

### 2.1 落点：`/userdisk` 上的固件自带钩子

固件的 `/etc/init.d/S99_run_test_scripts` 里写着：

```sh
[ -f /userdisk/skip_re/skip_login.sh ] || exit 0
start() {
    printf "Starting test script: skip_login.sh "
    /userdisk/skip_re/skip_login.sh &
    echo "done"
}
```

也就是说：**只要 `/userdisk/skip_re/skip_login.sh` 存在，开机就会被执行**。
`/userdisk` 是 ext4 持久分区（`/dev/mmcblk0p11`），内容重启不丢。

> 这是厂商留在固件里的 QA 钩子（"skip_re" = skip regression）。
> 我们只是借用它当开机自启入口 —— **不需要重刷固件、不碰 boot 分区的 RSA 签名**。

### 2.2 免密 ADB：`mount --bind` 覆盖只读 rootfs 里的鉴权脚本

设备 rootfs 是 **EROFS 只读**（`/dev/mmcblk0p8 on / type erofs (ro,...)`），
`mount -o remount,rw /` 无效。但 **bind-mount 可以运行时覆盖单个文件**：

```sh
mount --bind /userdisk/ssh/adbd_auth.sh /usr/bin/adbd_auth.sh
```

原来的 `/usr/bin/adbd_auth.sh` 长这样：

```sh
VERIFIED=/tmp/.adb_auth_verified
if [ -f "$VERIFIED" ]; then
    echo "success."
    exit
fi
for i in $(seq 1 3); do
    read -p "$(hostname -s)'s password: " PASSWD
    if [ "$(echo $PASSWD | md5sum)" = "054bda46d56c8496e14e81d78f5a3c27  -" ]; then
        echo "success."
        touch $VERIFIED
        exit
    fi
    echo "password incorrect!"
done
false
```

（`054bda46...` 是 `md5("ydpen2026")` —— rootfs 已被热补丁改过，明文口令就是 `ydpen2026`。）

我们覆盖成一个**恒成功**的版本：

```sh
#!/bin/sh
echo "success."
exit 0
```

### 2.3 adbd 的 TCP 监听：`ADB_TCP_PORT=5555`

adbd 是 AOSP `android-tools-4.2.2` 编译的，厂商在
`/etc/profile.d/adbd_tcp_port.sh` 里写死了：

```sh
export ADB_TCP_PORT=5555
```

但**屏幕上的开关关着时，开机根本没人拉起 adbd**。

而且 **`adb tcpip 5555`（宿主机命令）在这台机器上是陷阱**：
它让 adbd 自杀重启，但本机 `inittab` 里**没有 adbd 的 respawn 条目**：

```
::respawn:-/bin/login          ← 只有这个（busybox login）
```

实测 `adb tcpip 5555` 之后：**USB 和 5555 同时消失**，只能靠物理操作救回来。

正确做法是自己按正确的环境变量拉起：

```sh
export SN=LE62200008802358 MTP_READ_ONLY=FALSE user_debug=31 SLOT=_a
export ADBD_SHELL=/bin/sh ADB_TCP_PORT=5555
export PATH=/bin:/sbin:/usr/bin:/usr/sbin LD_LIBRARY_PATH=/lib:/usr/lib
/usr/bin/adbd
```

### 2.4 SSH：设备自带 OpenSSH 8.8p1 和 dropbear 2022.82

**不用编译任何东西** —— 设备里已经有：

```
/usr/sbin/sshd        OpenSSH_8.8p1, OpenSSL 1.1.1l
/usr/sbin/dropbear    Dropbear v2022.82
```

主机密钥也现成：`/etc/ssh/ssh_host_{ed25519,rsa,ecdsa,dsa}_key`。

唯一的问题：`root` 的 home 是 `/root`，在只读 rootfs 里，
没法放 `authorized_keys`。解法是让 sshd 去**可写分区**找公钥：

```
AuthorizedKeysFile /userdisk/ssh/authorized_keys
```

`root` 在 `/etc/shadow` 里的条目**没有被锁定**（是真实的 `$5$` SHA-256 哈希），
所以**公钥登录可以直接用**，不需要改 shadow、不需要设密码。

另外 sshd 需要 privsep 目录 `/var/empty`（`/etc/passwd` 里 sshd 用户的 home），
它在 tmpfs 上，重启会没 —— 由开机钩子重建。

---

## 3. 部署清单

| 设备路径 | 作用 |
|---|---|
| `/userdisk/ssh/adbd_auth.sh` | 恒成功的 ADB 鉴权脚本（bind-mount 覆盖只读那份） |
| `/userdisk/ssh/sshd_config` | sshd 配置（`AuthorizedKeysFile` 指向可写分区） |
| `/userdisk/ssh/authorized_keys` | 你的公钥 |
| `/userdisk/ssh/start_adbd.sh` | 带 `ADB_TCP_PORT=5555` 拉起 adbd |
| `/userdisk/ssh/boot.log` | 开机钩子日志 |
| `/userdisk/skip_re/skip_login.sh` | **开机钩子本体**（固件自带调用点） |

仓库里的对应源文件：`tools/e6_device_scripts/`。

---

## 4. 验证

### 4.1 重启验证（最硬的一条）

```bash
ssh root@<ip> 'sync; reboot'
# 然后盯着看
for i in $(seq 1 40); do
  sleep 8
  ip=$(arp -a | awk 'tolower($4)=="64:82:14:fb:c1:13" {gsub(/[()]/,"",$2); print $2}' | head -1)
  nc -z -G 1 $ip 22    && s22=22✓ || s22=22✗
  nc -z -G 1 $ip 5555  && s55=5555✓ || s55=5555✗
  echo "[$((i*8))s] IP=$ip ssh=$s22 adb=$s55"
done
```

实测输出：

```
[8s]  IP=192.168.0.201 ssh=22✗ adb=5555✗
[16s] IP=192.168.0.201 ssh=22✓ adb=5555✓     ← 16 秒全部自动恢复
```

### 4.2 功能验证

```bash
adb connect 192.168.0.201:5555
adb -s 192.168.0.201:5555 shell 'id'      # uid=0(root) gid=0(root)  ← 零口令
adb -s 192.168.0.201:5555 shell 'miniapp_cli capture /tmp/x.png'
ssh -i ~/.ssh/e6_ed25519 root@192.168.0.201 'id'   # uid=0(root) gid=0(root)
```

### 4.3 开机日志

```bash
adb -s 192.168.0.201:5555 shell 'cat /userdisk/ssh/boot.log'
```

```
=== 2026-11-02 10:27:50 E6 boot hook 开始 ===
adbd_auth.sh bind-mount OK
sshd 启动完成
adbd 已拉起
=== 2026-11-02 10:27:54 E6 boot hook 结束 ===
```

---

## 5. 卸载

```bash
ssh root@<ip> '
  umount /usr/bin/adbd_auth.sh              # 恢复原来的鉴权脚本
  rm -f /userdisk/skip_re/skip_login.sh     # 删掉开机钩子
  pkill -f "sshd -f /userdisk/ssh/sshd_config"
'
```

---

## 6. 这台机器的其他怪癖（都会让脚本静默出错）

| 坑 | 现象 | 对策 |
|---|---|---|
| **adbd 不透传 shell 退出码** | `adb shell false` 也返回 0 | 判断成败看 stdout 内容 |
| **`adb shell 'cat > f'` 转发 stdin 会挂死** | 命令永不返回 | 传文件一律用 `adb push` |
| **busybox 没有 `pgrep`** | `pgrep: not found` | 用 `ps \| grep -v grep \| grep -q` |
| **busybox `ps` 不支持 `-o`** | `ps: invalid option -- o` | 用 `ps` 默认输出 |
| **rootfs 是 EROFS 只读** | `remount,rw` 无效 | `mount --bind` 覆盖单个文件 |
| **adbd 自杀后没人重启** | `adb tcpip` 后设备彻底失联 | 手动带 `ADB_TCP_PORT` 拉起 |
| **9307 是 WebSocket stub** | 任何 JSON 都回 `{"id":<回显>,"result":{}}` | 死路，别浪费时间 |
| **E6 不响应 ICMP** | ping 不通但 ARP 通 | 用 ARP + 端口探测判活 |

---

## 7. 相关文档

- [`ROOT_GUIDE.md`](ROOT_GUIDE.md) —— root 提权与 EROFS 哈希热补丁
- [`SCREENSHOT_AND_INPUT.md`](SCREENSHOT_AND_INPUT.md) —— 截图与触摸注入
- [`MINIAPP_DEV.md`](MINIAPP_DEV.md) —— Falcon 轻应用开发
