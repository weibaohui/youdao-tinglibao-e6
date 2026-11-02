#!/bin/sh
#
# 有道听力宝 E6 —— 开机自启钩子
#
# 固件的 /etc/init.d/S99_run_test_scripts 会在开机时执行本文件
# （前提：/userdisk/skip_re/skip_login.sh 存在）。/userdisk 是 ext4 持久分区，
# 这就是"永久生效"的落点 —— **不需要重刷固件、不碰 boot 分区的 RSA 签名**。
#
# 做五件事：
#   1) ADB 永久免密（bind-mount 一个恒成功的鉴权脚本覆盖只读 rootfs 的原脚本）
#   2) ADB 永久监听 TCP 5555（手动拉起 adbd，绕开屏幕上的开关）
#   3) 启动 sshd（公钥登录）
#   4) 重建 sshd 需要的 /var/empty、/run/sshd（这两个在 tmpfs 上，重启会没）
#   5) 拉起看门狗（守护 sshd / adbd，掉了自动补）
#
# ⚠️ 这台机器的 busybox **没有 pgrep / pkill**；
#    而且用 `ps | grep "xxx"` 判断进程会被**调用方自己的 cmdline**误匹配，
#    所以这里一律用 **PID 文件 + kill -0** 和**端口探测**。

LOG=/userdisk/ssh/boot.log
mkdir -p /userdisk/ssh /run
exec >>"$LOG" 2>&1

echo "=== $(date '+%F %T') E6 boot hook 开始 ==="

pid_alive() {
    [ -f "$1" ] || return 1
    kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null
}

port_open() {
    netstat -tln 2>/dev/null | grep -q ":$1 "
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

# ---------- 3) 启动 sshd（以 22 端口为准） ----------
if [ -f /userdisk/ssh/sshd_config ]; then
    if port_open 22; then
        echo "sshd 已在运行（22 端口在监听）"
    else
        /usr/sbin/sshd -f /userdisk/ssh/sshd_config -E /userdisk/ssh/sshd.log
        echo "sshd 启动完成"
    fi
else
    echo "缺少 /userdisk/ssh/sshd_config，跳过 sshd"
fi

# ---------- 4) 拉起 adbd 并监听 TCP 5555（无线 ADB） ----------
if port_open 5555; then
    echo "adbd 已在运行（5555 端口在监听）"
elif [ -x /userdisk/ssh/start_adbd.sh ]; then
    setsid /userdisk/ssh/start_adbd.sh >/dev/null 2>&1 &
    sleep 3
    if port_open 5555; then
        echo "adbd 已拉起"
    else
        echo "adbd 拉起失败"
    fi
else
    echo "缺少 /userdisk/ssh/start_adbd.sh"
fi

# ---------- 5) 拉起 HTTP 调试服务（截图 / 点击 / 日志 的网页接口） ----------
if [ -x /userdisk/e6_debug_server ]; then
    if port_open 8080; then
        echo "调试服务已在运行（8080 端口在监听）"
    else
        setsid /userdisk/e6_debug_server >/userdisk/ssh/debug_server.log 2>&1 &
        sleep 2
        if port_open 8080; then
            echo "调试服务已启动（http://$(ip -4 addr show wlan0 2>/dev/null | grep -oE 'inet [0-9.]+' | head -1 | cut -d' ' -f2):8080/）"
        else
            echo "调试服务启动失败"
        fi
    fi
else
    echo "缺少 /userdisk/e6_debug_server，跳过 HTTP 调试服务"
fi

# ---------- 6) 拉起看门狗 ----------
if [ -x /userdisk/ssh/watchdog.sh ]; then
    if pid_alive /run/e6_watchdog.pid; then
        echo "watchdog 已在运行"
    else
        setsid /userdisk/ssh/watchdog.sh >/dev/null 2>&1 &
        sleep 1
        pid_alive /run/e6_watchdog.pid && echo "watchdog 已拉起" || echo "watchdog 拉起失败"
    fi
else
    echo "缺少 /userdisk/ssh/watchdog.sh"
fi

echo "=== $(date '+%F %T') E6 boot hook 结束 ==="
