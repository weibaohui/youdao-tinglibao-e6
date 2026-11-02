#!/bin/bash
#
# e6_device —— 自动解析当前可用的「有道听力宝 E6」ADB 目标
#
# 为什么需要它：E6 换 WiFi / 重启后 DHCP 租约会变（192.168.0.109 → 192.168.0.201 …），
# 脚本里写死 IP 迟早失效。这里按优先级自动挑一个能用的通道：
#
#   1. 环境变量 E6_ADB / E6_DEVICE（显式指定，最高优先）
#   2. USB 通道（序列号 LE62200008802358）—— 插着线就用它，最稳，不受 WiFi 影响
#   3. 按 MAC 64:82:14:fb:c1:13 在 ARP 表里找当前 IP，拼成 IP:5555
#      找不到就先用 ping 扫一遍本机所在网段把 ARP 表填上再找
#
# 用法：
#   source tools/e6_device.sh
#   D="$(e6_resolve_device)"        # 打印 ADB 目标（可能是 USB 序列号 或 IP:5555）
#   IP="$(e6_resolve_ip)"           # 只打印当前 IP
#   e6_resolve_ip 失败返回非 0
#
E6_USB_SERIAL="${E6_USB_SERIAL:-LE62200008802358}"
E6_MAC="${E6_MAC:-64:82:14:fb:c1:13}"

# 从 arp 表里按 MAC 找 IP
e6_arp_lookup() {
  arp -a 2>/dev/null | awk -v mac="$E6_MAC" '
    tolower($4) == mac { gsub(/[()]/, "", $2); print $2; exit }'
}

# ping 扫本机所在网段，把 ARP 表填满（ARP 不会自动发现邻居）
e6_warm_arp() {
  local ip subnet
  ip="$(ipconfig getifaddr en0 2>/dev/null)"
  [ -z "$ip" ] && ip="$(ipconfig getifaddr en1 2>/dev/null)"
  [ -z "$ip" ] && return 0
  subnet="${ip%.*}"
  seq 1 254 | xargs -P 64 -I{} sh -c "ping -c1 -W 300 ${subnet}.{} >/dev/null 2>&1" 2>/dev/null
  return 0
}

# 当前 IP（找不到返回非 0）
e6_resolve_ip() {
  local ip
  ip="$(e6_arp_lookup)"
  if [ -z "$ip" ]; then
    e6_warm_arp
    ip="$(e6_arp_lookup)"
  fi
  [ -z "$ip" ] && return 1
  echo "$ip"
  return 0
}

# ADB 目标（USB 序列号 或 IP:5555）
e6_resolve_device() {
  if [ -n "${E6_ADB:-}" ]; then echo "$E6_ADB"; return 0; fi
  if [ -n "${E6_DEVICE:-}" ]; then echo "$E6_DEVICE"; return 0; fi
  if adb devices 2>/dev/null | grep -q "^${E6_USB_SERIAL}[[:space:]]"; then
    echo "$E6_USB_SERIAL"; return 0
  fi
  local ip
  if ip="$(e6_resolve_ip)"; then
    echo "${ip}:5555"; return 0
  fi
  echo ""
  return 1
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  e6_resolve_device
fi
