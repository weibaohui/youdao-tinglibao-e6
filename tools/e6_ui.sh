#!/bin/bash
#
# e6_ui —— 有道听力宝 E6 的界面自动化小工具
#
#   截图（miniapp_cli capture）/ 点击 / 滑动 / 长按 / 日志 / 像素级 diff
#
# 用法：
#   ./tools/e6_ui.sh [-d DEVICE] <command> [args...]
#
#   -d DEVICE   adb 设备号，默认 192.168.0.109:5555（可用 USB 序列号覆盖）
#
#   shot  <out.png>              截屏并 pull 到本地
#   tap   <x> <y>                点击
#   swipe <x1> <y1> <x2> <y2> [ms]
#   long  <x> <y> [ms]
#   log   app|sound|err          看日志
#   diff  <a.png> <b.png>        像素级 diff（差异像素为 0 时退出码 1）
#   verify <a.png> <b.png>       一键 A/B 判定，输出 PASS / FAIL
#
# 详见 docs/SCREENSHOT_AND_INPUT.md
#
set -e

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SELF_DIR/.." && pwd)"

# ★ 自动解析 ADB 目标：USB 优先，否则按 MAC 找当前 WiFi IP（换 WiFi 也不会失效）
# shellcheck source=./e6_device.sh
source "$REPO_DIR/tools/e6_device.sh"

DEVICE="$(e6_resolve_device)"
[ -z "$DEVICE" ] && DEVICE="192.168.0.109:5555"   # 兜底：实在解析不出来时的旧默认
TAP_BIN="/userdisk/e6_tap"

while [ $# -gt 0 ]; do
  case "$1" in
    -d) DEVICE="$2"; shift 2 ;;
    *)  break ;;
  esac
done

adb_() { adb -s "$DEVICE" "$@"; }

need_tap() {
  # ★ 注意：E6 的 adbd **不透传 shell 退出码**（adb shell false 也返回 0），
  #   所以不能用 `if ! adb shell test -x ...` 判断，改用 stdout 标记。
  if [ "$(adb_ shell "test -x $TAP_BIN && echo __OK__" 2>/dev/null | tr -d '\r\n')" = "__OK__" ]; then
    return 0
  fi
  local src
  src="$REPO_DIR/src/tap/e6_tap"
  echo "▸ 部署 $TAP_BIN ..." >&2
  adb_ push "$src" "$TAP_BIN" >/dev/null
  adb_ shell "chmod +x $TAP_BIN" >/dev/null
}

cmd="${1:-help}"; shift || true

case "$cmd" in
  shot)
    out="${1:-/tmp/e6_shot.png}"
    remote="/tmp/e6_shot_$$.png"
    adb_ shell "miniapp_cli capture $remote" | grep -q '"ret": 0' \
      || { echo "✗ 截图失败" >&2; exit 1; }
    adb_ pull "$remote" "$out" >/dev/null
    adb_ shell "rm -f $remote" >/dev/null 2>&1 || true
    sz=$(wc -c < "$out" | tr -d ' ')
    echo "✓ $out ($sz B)"
    if [ "$sz" = "318" ]; then
      echo "  ⚠️ 318 B = 纯黑，app 没有渲染出来（不是抓屏坏了）" >&2
    fi
    ;;

  tap|swipe|long|drag)
    need_tap
    adb_ shell "$TAP_BIN $cmd $*"
    ;;

  log)
    what="${1:-app}"
    case "$what" in
      app)   adb_ shell "grep 'console(' /userdata/applog/YD_PEN_APP.log | tail -40" ;;
      sound) adb_ shell "tail -20 /userdata/applog/SoundPlayer.log" ;;
      err)   adb_ shell "grep -n 'ReferenceError\|TypeError\|SyntaxError' /userdata/applog/YD_PEN_APP.log | tail -10" ;;
      *)     adb_ shell "tail -40 /userdata/applog/YD_PEN_APP.log" ;;
    esac
    ;;

  diff)
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    python3 "$root/tools/pngdiff.py" "$@"
    ;;

  verify)
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    if python3 "$root/tools/pngdiff.py" "$1" "$2" >/tmp/e6_diff_out.txt 2>&1; then
      cat /tmp/e6_diff_out.txt
      echo "PASS —— 画面发生了变化，操作生效"
    else
      cat /tmp/e6_diff_out.txt
      echo "FAIL —— 两张图完全一致，操作没有生效"
      exit 1
    fi
    ;;

  *)
    cat <<'USAGE'
e6_ui —— 有道听力宝 E6 的界面自动化小工具

  截图（miniapp_cli capture）/ 点击 / 滑动 / 长按 / 日志 / 像素级 diff

用法：
  ./tools/e6_ui.sh [-d DEVICE] <command> [args...]

  -d DEVICE   adb 设备号，默认 192.168.0.109:5555（可用 USB 序列号覆盖）

  shot  <out.png>              截屏并 pull 到本地
  tap   <x> <y>                点击
  swipe <x1> <y1> <x2> <y2> [ms]
  long  <x> <y> [ms]
  log   app|sound|err          看日志
  diff  <a.png> <b.png>        像素级 diff（差异像素为 0 时退出码 1）
  verify <a.png> <b.png>       一键 A/B 判定，输出 PASS / FAIL

详见 docs/SCREENSHOT_AND_INPUT.md
USAGE
    ;;
esac
