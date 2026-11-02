#!/bin/bash
#
# 自动通过 Wi-Fi 连接有道听力宝 E6
#
#   ./connect_wifi.sh                 # 自动找设备（USB 优先，否则按 MAC 找当前 IP）
#   ./connect_wifi.sh 192.168.0.201   # 指定 IP
#
# 说明：E6 换 WiFi / 重启后 DHCP 租约会变，这里按 MAC 自动跟随；
# 但**前提是设备侧的 ADB-TCP(5555) 是开的**，否则网络通也连不上。
#
set -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./e6_device.sh
source "$HERE/e6_device.sh"

PORT=5555

if [ -n "${1:-}" ]; then
  TARGET="$1:$PORT"
else
  RESOLVED="$(e6_resolve_device)"
  case "$RESOLVED" in
    *:*) TARGET="$RESOLVED" ;;              # 已经是 IP:端口
    "")   echo "✗ 找不到 E6（请确认设备和电脑在同一个 WiFi 下）" >&2; exit 1 ;;
    *)   TARGET="$RESOLVED:$PORT" ;;        # USB 序列号，无需 connect
  esac
fi

if [ "${TARGET##*:}" != "$PORT" ]; then
  # 解析出来的是 USB 序列号，直接用 USB
  echo "📡 使用 USB 通道: $TARGET"
  adb devices
  exit 0
fi

IP="${TARGET%%:*}"

echo "📡 正在尝试通过 Wi-Fi 无线 ADB 连接听力宝: $TARGET ..."
adb connect "$TARGET"
adb devices

if ! adb devices | grep -q "^${TARGET}[[:space:]]"; then
  echo
  echo "⚠️  连不上。两种常见原因："
  echo "   1) 设备侧没开 ADB 网络调试（5555 未监听）——插一次 USB 后执行："
  echo "        adb -s $E6_USB_SERIAL tcpip 5555"
  echo "        adb connect $IP:5555"
  echo "   2) 设备与电脑不在同一网段，或路由器开了 AP 隔离"
  exit 1
fi
