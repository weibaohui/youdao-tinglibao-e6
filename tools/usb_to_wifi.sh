#!/bin/bash
#
# usb_to_wifi —— 插上 USB 后一键切换到无线 ADB
#
#   ./tools/usb_to_wifi.sh            # 自动找 USB 设备
#   ./tools/usb_to_wifi.sh <serial>   # 指定 USB 序列号
#
# 流程：
#   1) 等 USB 设备被枚举出来（设备侧要先打开 ADB 开关，见下方提示）
#   2) 先从设备自己读出 WiFi IP（比 ARP 猜更准）
#   3) adb tcpip 5555 让 adbd 开始监听 TCP
#   4) adb connect <ip>:5555 并验证 shell 真的通
#
# ⚠️ 注意：设备侧「设置 → 法律监管」连击文本 5 次打开的 ADB 开关是**每次开机都要重开**的，
#    换 WiFi / 重启后 adbd 也不再监听 5555，需要重新走一遍这个流程。
#
set -e

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./e6_device.sh
source "$HERE/e6_device.sh"

SERIAL="${1:-$E6_USB_SERIAL}"
PORT=5555

echo "==> [1/4] 等待 USB 设备 $SERIAL ..."
for i in $(seq 1 30); do
  if adb devices 2>/dev/null | grep -q "^${SERIAL}[[:space:]]"; then
    break
  fi
  [ "$i" = "1" ] && cat <<'TXT'

  没看到设备。USB 线是好的（macOS 已经枚举到 DictPen / Netease），
  但设备**没有暴露任何 USB 功能接口** —— 说明设备侧的 ADB 开关没开。

  请在 E6 屏幕上操作：
      设置 → 法律监管 → 连击那段文本 5 次  → 打开 ADB 开关
  打开后设备会立刻被 adb 枚举，本脚本会自动继续。

TXT
  sleep 2
done

if ! adb devices 2>/dev/null | grep -q "^${SERIAL}[[:space:]]"; then
  echo "✗ 仍未枚举到 $SERIAL（设备侧 ADB 开关没开？）" >&2
  exit 1
fi
echo "    ✓ 已连接"

echo "==> [2/4] 从设备读取当前 IP"
DEV_IP="$(adb -s "$SERIAL" shell 'ip -4 addr show 2>/dev/null | grep -oE "inet [0-9.]+" | cut -d" " -f2' 2>/dev/null | tr -d '\r' | head -1)"
if [ -z "$DEV_IP" ]; then
  DEV_IP="$(adb -s "$SERIAL" shell 'ifconfig 2>/dev/null | grep -oE "inet addr:[0-9.]+" | cut -d: -f2' 2>/dev/null | tr -d '\r' | head -1)"
fi
if [ -z "$DEV_IP" ]; then
  # 退回到按 MAC 查 ARP
  DEV_IP="$(e6_resolve_ip || true)"
fi
[ -z "$DEV_IP" ] && { echo "✗ 读不到设备 IP" >&2; exit 1; }
echo "    ✓ $DEV_IP"

echo "==> [3/4] adb tcpip $PORT"
adb -s "$SERIAL" tcpip "$PORT" || true
sleep 3

echo "==> [4/4] 无线连接 $DEV_IP:$PORT"
adb connect "$DEV_IP:$PORT"
sleep 2

if ! adb devices | grep -q "^${DEV_IP}:${PORT}[[:space:]]"; then
  echo "✗ 无线连接失败" >&2
  exit 1
fi

echo
echo "✓ 无线 ADB 就绪：${DEV_IP}:${PORT}"
adb -s "${DEV_IP}:${PORT}" shell 'id' | tr -d '\r'
echo
echo "现在可以拔掉 USB 线了。之后用："
echo "    adb -s ${DEV_IP}:${PORT} <命令>"
echo "    $HERE/e6_ui.sh shot out.png        # 截图"
echo "    $HERE/e6_ui.sh tap 177 295        # 点击"
