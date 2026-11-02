#!/bin/sh
#
# 有道听力宝 E6 —— 开机自启钩子
#
# 固件的 /etc/init.d/S99_run_test_scripts 会在开机时执行本文件
# （前提：/userdisk/skip_re/skip_login.sh 存在）。/userdisk 是 ext4 持久分区，
# 这就是"永久生效"的落点 —— **不需要重刷固件、不碰 boot 分区的 RSA 签名**。
#
# 做四件事：
#   1) ADB 永久免密（bind-mount 一个恒成功的鉴权脚本覆盖只读 rootfs 的原脚本）
#   2) ADB 永久监听 TCP 5555（手动拉起 adbd，绕开屏幕上的开关）
#   3) 启动 sshd（公钥登录）
#   4) 重建 sshd 需要的 /var/empty、/run/sshd（这两个在 tmpfs 上，重启会没）
#
# ⚠️ 这台机器的 busybox **没有 pgrep**，一律用 ps|grep 判断进程是否在跑。
# ⚠️ 这台机器的 adbd **不透传 shell 退出码**，判断成败要看 stdout 内容。

LOG=/userdisk/ssh/boot.log
mkdir -p /userdisk/ssh
exec >>"$LOG" 2>&1

echo "=== $(date '+%F %T') E6 boot hook 开始 ==="

# 进程存活判断（无 pgrep 的安全写法）
alive() {
    ps | grep -v grep | grep -q "$1"
}

# ---------- 1) ADB 鉴权：bind-mount 一个永远放行的脚本 ----------
if ! grep -q "恒成功" /usr/bin/adbd_auth.sh 2>/dev/null; then
    mount --bind /userdisk/ssh/adbd_auth.sh /usr/bin/adbd_auth.sh 2>/dev/null \
        && echo "adbd_auth.sh bind-mount OK" \
        || echo "adbd_auth.sh bind-mount 失败"
else
    echo "adbd_auth.sh 已是自定义版本"
fi
# 老机制的标记文件也一并创建，双保险
touch /tmp/.adb_auth_verified 2>/dev/null

# ---------- 2) sshd 依赖目录（/var、/run 是 tmpfs，重启后需重建） ----------
mkdir -p /var/empty /run/sshd
chmod 755 /var/empty /run/sshd

# ---------- 3) 启动 sshd ----------
if [ -f /userdisk/ssh/sshd_config ]; then
    if alive "sshd -f /userdisk/ssh/sshd_config"; then
        echo "sshd 已在运行"
    else
        /usr/sbin/sshd -f /userdisk/ssh/sshd_config -E /userdisk/ssh/sshd.log
        echo "sshd 启动完成"
    fi
else
    echo "缺少 /userdisk/ssh/sshd_config，跳过 sshd"
fi

# ---------- 4) 拉起 adbd 并监听 TCP 5555（无线 ADB） ----------
if alive "/usr/bin/adbd"; then
    echo "adbd 已在运行"
elif [ -x /userdisk/ssh/start_adbd.sh ]; then
    setsid /userdisk/ssh/start_adbd.sh >/dev/null 2>&1 &
    sleep 3
    if alive "/usr/bin/adbd"; then
        echo "adbd 已拉起"
    else
        echo "adbd 拉起失败"
    fi
else
    echo "缺少 /userdisk/ssh/start_adbd.sh"
fi

echo "=== $(date '+%F %T') E6 boot hook 结束 ==="
