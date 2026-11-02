#!/bin/bash
#
# adb_root —— 在 E6 上以 root 执行命令（自动完成 adbd 认证）
#
#   ./tools/adb_root.sh "id"
#   ./tools/adb_root.sh "cat /proc/version"
#   ./tools/adb_root.sh                      # 进交互式 root shell
#
# E6 的 adbd 每次新建连接都要认证，提示
#   login with "adb shell auth" to continue.
# 正确姿势是**先单独跑一次 auth 把口令喂进去，紧接着再执行命令**，
# 之后这一段时间内后续连接就都放行了。
#
# 口令默认 ydpen2026（rootfs 已被热补丁改成这个明文哈希），
# 可用环境变量 E6_ADB_PASSWORD 覆盖。
#
set -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./e6_device.sh
source "$HERE/e6_device.sh"

SERIAL="${E6_ADB:-$E6_USB_SERIAL}"
PASS="${E6_ADB_PASSWORD:-ydpen2026}"

# USB 优先：查 USB 序列号在不在
if adb devices 2>/dev/null | grep -q "^${E6_USB_SERIAL}[[:space:]]"; then
  SERIAL="$E6_USB_SERIAL"
elif [ -n "${E6_ADB:-}" ]; then
  SERIAL="$E6_ADB"
else
  RESOLVED="$(e6_resolve_device || true)"
  [ -z "$RESOLVED" ] && { echo "✗ 找不到 E6" >&2; exit 1; }
  SERIAL="$RESOLVED"
fi

# 探测是否已经认证（root shell 能跑就说明已放行）
probe="$(adb -s "$SERIAL" shell 'id -u' 2>/dev/null | tr -d '\r\n ')"
if [ "$probe" != "0" ]; then
  printf '%s\n' "$PASS" | adb -s "$SERIAL" shell auth >/dev/null 2>&1 || true
  sleep 0.5
fi

if [ $# -eq 0 ]; then
  exec adb -s "$SERIAL" shell
else
  adb -s "$SERIAL" shell "$*"
fi
