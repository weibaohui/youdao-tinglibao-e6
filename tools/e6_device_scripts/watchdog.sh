#!/bin/sh
#
# 有道听力宝 E6 —— 服务看门狗
#
# 由开机钩子 /userdisk/skip_re/skip_login.sh 拉起，后台常驻。
# 只做"缺失才补"的事，**绝不乱杀进程**。
#
# 守两样：
#   1) sshd（端口 22）—— 端口不监听就重新拉起
#   2) adbd（端口 5555）—— 端口不监听就重新拉起（必要时先回收僵尸 adbd）
#
# 场景：用户在设备上打开「设置 → 法律监管」ADB 开关时，框架可能自己拉一个 adbd，
#       抢不到 5555 就退出；或框架 killall adbd 把我们的也带走。看门狗负责兜底。
#
# ⚠️ 这台机器的 busybox **没有 pgrep / pkill**，
#    而且用 `ps | grep "xxx"` 判断进程会被**调用方自己的 cmdline**误匹配
#    （adb shell '... watchdog.sh ...' 的命令行里就含这个名字）——
#    所以这里一律用 **PID 文件 + kill -0** 和**端口探测**，不做字符串匹配。
#
INTERVAL=30
LOG=/userdisk/ssh/watchdog.log

mkdir -p /userdisk/ssh /run
exec >>"$LOG" 2>&1
echo $$ > /run/e6_watchdog.pid
echo "=== $(date '+%F %T') watchdog 启动 (pid $$) ==="

# PID 文件里的进程还活着吗
pid_alive() {
    [ -f "$1" ] || return 1
    kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null
}

# 端口在监听吗
port_open() {
    netstat -tln 2>/dev/null | grep -q ":$1 "
}

# 精确找出 adbd 的 PID（只认命令行**恰好**是 /usr/bin/adbd 的那些，
# 避免匹配到调用方自己命令行里出现的路径）
adbd_pids() {
    ps | awk '$NF=="/usr/bin/adbd"{print $1}'
}

while true; do
    sleep "$INTERVAL"

    # ---- sshd：以 22 端口为准 ----
    if ! port_open 22; then
        mkdir -p /var/empty /run/sshd 2>/dev/null
        chmod 755 /var/empty /run/sshd 2>/dev/null
        /usr/sbin/sshd -f /userdisk/ssh/sshd_config -E /userdisk/ssh/sshd.log
        echo "$(date '+%F %T') sshd 已重新拉起"
    fi

    # ---- adbd：以 5555 端口为准 ----
    if ! port_open 5555; then
        # 先回收所有还活着的 adbd（可能占着端口但不监听），再重拉
        for p in $(adbd_pids); do
            kill "$p" 2>/dev/null
        done
        sleep 1
        setsid /userdisk/ssh/start_adbd.sh >/dev/null 2>&1 &
        echo "$(date '+%F %T') adbd 已重新拉起"
    fi
done
