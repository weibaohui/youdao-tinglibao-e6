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

# 从 arp 表里按 MAC 找 IP（可能不止一个：设备可能同时持有 STA 与热点两个地址）
e6_arp_ips() {
  arp -a 2>/dev/null | awk -v mac="$E6_MAC" '
    tolower($4) == mac { gsub(/[()]/, "", $2); print $2 }' | sort -u
}

# 从 arp 表里按 MAC 找 IP（单个）
e6_arp_lookup() {
  e6_arp_ips | head -1
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

# 实机验证：目标真的能跑 adb shell 吗（防 LAN 里其他设备占了 5555 的误判）
e6_adb_ok() {
  local target="$1"
  case "$target" in
    *:5555) adb connect "$target" >/dev/null 2>&1 ;;
  esac
  adb -s "$target" shell echo ok 2>/dev/null | grep -q ok
}

# ADB 目标（USB 序列号 或 IP:5555）
e6_resolve_device() {
  if [ -n "${E6_ADB:-}" ]; then echo "$E6_ADB"; return 0; fi
  if [ -n "${E6_DEVICE:-}" ]; then echo "$E6_DEVICE"; return 0; fi
  if adb devices 2>/dev/null | grep -q "^${E6_USB_SERIAL}[[:space:]]"; then
    echo "$E6_USB_SERIAL"; return 0
  fi
  # 已连接的无线目标优先（之前 connect 过且还活着就直接用）
  local already
  already="$(adb devices 2>/dev/null | awk '/:5555[[:space:]]+device$/{print $1}')"
  local t
  for t in $already; do
    if e6_adb_ok "$t"; then echo "$t"; return 0; fi
  done
  local ips ip first=""
  ips="$(e6_arp_ips)"
  [ -z "$ips" ] && { e6_warm_arp; ips="$(e6_arp_ips)"; }
  [ -z "$ips" ] && { echo ""; return 1; }
  # 设备可能同时持有多个 IP；候选必须通过 nc + adb 实机双重验证
  while read -r ip; do
    [ -z "$ip" ] && continue
    [ -z "$first" ] && first="$ip"
    if nc -z -G 1 "$ip" 5555 >/dev/null 2>&1 && e6_adb_ok "${ip}:5555"; then
      echo "${ip}:5555"; return 0
    fi
  done <<EOF
$ips
EOF
  # 都没开 5555，返回第一个（连不上时脚本会给出提示）
  echo "${first}:5555"
  return 0
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  e6_resolve_device
fi
