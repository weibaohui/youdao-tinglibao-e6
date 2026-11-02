#!/usr/bin/env bash
#
# 有道听力宝 E6 (YDLE6) · MiniApp 一键构建 / 部署 / 验证
#
#   ./build_miniapp.sh                 # 默认用 miniapp/e6_demo_app
#   ./build_miniapp.sh <app_dir>       # 构建指定工程
#   E6_ADB=LE62200008802358 ./build_miniapp.sh   # 走 USB 通道
#
# 流程：qjsc 编译 → 打包 .amr → adb push → miniapp_cli install → start
#       → miniapp_cli capture 抓屏 → 拉取截图 → 打印应用日志
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"

APP_DIR="${1:-$REPO/miniapp/e6_demo_app}"
# ★ 自动解析 ADB 目标：USB 优先，否则按 MAC 找当前 WiFi IP（换 WiFi 也不会失效）
# shellcheck source=../tools/e6_device.sh
source "$REPO/tools/e6_device.sh"
DEVICE="$(e6_resolve_device)"
[ -z "$DEVICE" ] && DEVICE="192.168.0.109:5555"   # 兜底：实在解析不出来时的旧默认
export E6_ADB="$DEVICE"                            # 让 build_amr.py 用同一个目标
SHOT="${SHOT:-/tmp/e6_miniapp.png}"
LOG="${LOG:-/userdata/applog/YD_PEN_APP.log}"

APPID="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['appid'])" "$APP_DIR/manifest.json")"
mkdir -p "$REPO/miniapp/build"
AMR="$REPO/miniapp/build/${APPID}.amr"

echo "==> AppID   : $APPID"
echo "==> Device  : $DEVICE"
echo "==> Source  : $APP_DIR"

echo "==> [1/5] 编译并打包"
python3 "$REPO/miniapp/host_tools/build_amr.py" "$APP_DIR" -o "$AMR"

echo "==> [2/5] 推送到设备"
adb -s "$DEVICE" push "$AMR" "/tmp/${APPID}.amr" >/dev/null

echo "==> [3/5] 安装"
adb -s "$DEVICE" shell "miniapp_cli install /tmp/${APPID}.amr"

echo "==> [4/5] 启动"
adb -s "$DEVICE" shell "miniapp_cli start $APPID"
sleep 4

echo "==> [5/5] 抓屏取证"
# ★ E6 的 adbd 不透传 shell 退出码，所以不能靠 $? 判断成败，改看 stdout 里的 ret 字段。
CAP_OUT="$(adb -s "$DEVICE" shell "miniapp_cli capture $SHOT")"
echo "$CAP_OUT" | grep -q '"ret": 0' || { echo "✗ 截图失败: $CAP_OUT" >&2; exit 1; }
adb -s "$DEVICE" pull "$SHOT" "$SHOT" >/dev/null
SHOT_SIZE="$(wc -c < "$SHOT" | tr -d ' ')"
echo "    截图已保存: $SHOT ($SHOT_SIZE B)"
# ★ 318 字节 = 纯黑 PNG = app 没渲染出来（黑屏），不是抓屏坏了。
if [ "$SHOT_SIZE" = "318" ]; then
  echo "    ⚠️ 318 B = 纯黑，应用没有渲染出来，请查下面的错误日志" >&2
fi

echo
echo "==> 应用日志（最近 25 条）"
adb -s "$DEVICE" shell "grep \"console($APPID)\" $LOG | tail -25"

echo
echo "==> 最近错误"
adb -s "$DEVICE" shell "grep -n 'ReferenceError\|TypeError\|SyntaxError' $LOG | tail -5" || true

echo
echo "完成。"
