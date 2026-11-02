#!/bin/bash
#
# e6_ssh_setup —— 一次性给 E6 装好「永久免密 ADB + SSH」，重启后自动生效
#
#   ./tools/e6_ssh_setup.sh                       # 用当前 adb 能连上的设备
#   ./tools/e6_ssh_setup.sh 192.168.0.201:5555    # 指定目标
#
# 做了什么（全部落在可写分区 /userdisk，不动只读 rootfs、不刷固件）：
#   1) /userdisk/ssh/adbd_auth.sh     —— 恒成功的 ADB 鉴权脚本
#      用 mount --bind 覆盖 /usr/bin/adbd_auth.sh，让 adbd 每次连接都直接放行
#   2) /userdisk/ssh/sshd_config      —— OpenSSH 配置（复用系统自带主机密钥）
#   3) /userdisk/ssh/authorized_keys  —— 你的公钥
#   4) /userdisk/ssh/start_adbd.sh    —— 手动拉起带 ADB_TCP_PORT=5555 的 adbd
#   5) /userdisk/ssh/watchdog.sh      —— 看门狗：sshd / adbd 掉了自动补
#   6) /userdisk/skip_re/skip_login.sh—— 开机钩子（固件自带调用点）
#
# 原理：固件的 /etc/init.d/S99_run_test_scripts 会执行 /userdisk/skip_re/skip_login.sh，
#       而 /userdisk 是 ext4 持久分区 —— 这就是"永久"的落点。
#
# ⚠️ 必须用 adb push 传文件：**本机 `adb shell 'cat > file'` 转发 stdin 会挂死**
#    （adb 的 shell 服务拿不到 EOF），别用 heredoc 管道。
#
set -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$HERE/e6_device_scripts"
# shellcheck source=./e6_device.sh
source "$HERE/e6_device.sh"

TARGET="${1:-$(e6_resolve_device || true)}"
[ -z "$TARGET" ] && { echo "✗ 找不到 E6（先让 adb 连上设备）" >&2; exit 1; }

SSH_KEY="${E6_SSH_KEY:-$HOME/.ssh/e6_ed25519}"
if [ ! -f "$SSH_KEY" ]; then
  echo "▸ 生成 SSH 密钥对 $SSH_KEY"
  ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" -C "e6-root@youdao-dictpen"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$SSH_KEY.pub" "$TMP/authorized_keys"

echo "▸ 目标设备: $TARGET"
echo "▸ 公钥: $(cat "$SSH_KEY.pub")"
echo

adb_s() { adb -s "$TARGET" shell "$@"; }
adb_p() { adb -s "$TARGET" push "$1" "$2" >/dev/null; }

echo "==> [1/6] 准备目录"
adb_s 'mkdir -p /userdisk/ssh /userdisk/skip_re; chmod 700 /userdisk/ssh' >/dev/null

echo "==> [2/6] 部署 ADB 鉴权脚本（恒成功）"
adb_p "$SCRIPTS/adbd_auth.sh" /userdisk/ssh/adbd_auth.sh
adb_s 'chmod +x /userdisk/ssh/adbd_auth.sh' >/dev/null

echo "==> [3/6] 部署 sshd 配置与公钥"
adb_p "$SCRIPTS/sshd_config" /userdisk/ssh/sshd_config
adb_p "$TMP/authorized_keys"      /userdisk/ssh/authorized_keys
adb_s 'chmod 600 /userdisk/ssh/sshd_config /userdisk/ssh/authorized_keys' >/dev/null

echo "==> [4/6] 部署 adbd 启动脚本、开机钩子与看门狗"
adb_p "$SCRIPTS/start_adbd.sh" /userdisk/ssh/start_adbd.sh
adb_p "$SCRIPTS/watchdog.sh"  /userdisk/ssh/watchdog.sh
adb_p "$SCRIPTS/skip_login.sh" /userdisk/skip_re/skip_login.sh
adb_s 'chmod +x /userdisk/ssh/start_adbd.sh /userdisk/ssh/watchdog.sh /userdisk/skip_re/skip_login.sh' >/dev/null

echo "==> [5/6] 部署触摸注入器与 HTTP 调试服务"
# 触摸注入器（点击/滑动/长按的底层工具）
if [ -f "$HERE/../src/tap/e6_tap" ]; then
  adb_p "$HERE/../src/tap/e6_tap" /userdisk/e6_tap
  adb_s 'chmod +x /userdisk/e6_tap' >/dev/null
elif ! adb_s 'test -x /userdisk/e6_tap' >/dev/null 2>&1; then
  echo "  ⚠️ 没有 src/tap/e6_tap，设备上也没有 —— 点击功能不可用" >&2
  echo "     可先跑: (cd src/tap && ./build.sh)" >&2
fi

# HTTP 调试服务（截图 / 点击 / 日志）
DBG_BIN="$HERE/../src/e6_debug_server/e6_debug_server"
if [ ! -f "$DBG_BIN" ]; then
  echo "  · 正在编译 HTTP 调试服务..."
  (cd "$HERE/../src/e6_debug_server" && ./build.sh) >/dev/null
fi
if [ -f "$DBG_BIN" ]; then
  adb_p "$DBG_BIN" /userdisk/e6_debug_server
  adb_s 'chmod +x /userdisk/e6_debug_server' >/dev/null
else
  echo "  ⚠️ HTTP 调试服务编译失败，跳过" >&2
fi

echo "==> [6/6] 立即生效"
adb_s '/userdisk/skip_re/skip_login.sh' >/dev/null 2>&1 || true
sleep 3
adb_s 'ls -l /userdisk/ssh/ /userdisk/skip_re/' | tr -d '\r'

IP="$(echo "$TARGET" | sed 's/:.*//')"
echo
echo "✅ 装好了。现在可以："
echo "   ssh -i $SSH_KEY root@$IP            # 直接登进去"
echo "   adb connect $IP:5555                 # 无线 ADB（零口令）"
echo "   重启后依然有效（开机钩子会自动恢复）"
echo
echo "   想彻底卸掉："
echo "     ssh root@$IP 'umount /usr/bin/adbd_auth.sh; rm -f /userdisk/skip_re/skip_login.sh'"
