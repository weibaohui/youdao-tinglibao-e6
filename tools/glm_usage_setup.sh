#!/usr/bin/env bash
#
# 有道听力宝 E6 (YDLE6) · GLM 用量查询 App · 配置下发脚本
#
# 把 API Key（必填）与「发现凭据」（二选一）写进设备的
#   /userdisk/glm_usage/config.json
#
# 用法:
#   ./glm_usage_setup.sh --api-key <智谱APIKey>
#   ./glm_usage_setup.sh --api-key <智谱APIKey> --jwt <网页端JWT>        # 自动发现全部机构/项目
#   ./glm_usage_setup.sh --api-key <智谱APIKey> --org <orgId> --project <projectId> [--name 显示名]
#
# ★ Web JWT 获取方法（一次性，App 用完自动从配置清除，不会落盘复用）:
#     电脑浏览器登录 https://bigmodel.cn → F12 → Network → 刷新页面
#     → 找 getCustomerInfo 或 quota/limit 请求 → Request Headers
#     → 复制 Authorization: Bearer 后面那一长串
#   或者直接从 DevTools 里抓 bigmodel-organization / bigmodel-project
#   两个头的值，用 --org/--project 手填（无需 JWT）。
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e6_device.sh
source "$HERE/e6_device.sh"

REMOTE_DIR=/userdisk/glm_usage
REMOTE_CFG=$REMOTE_DIR/config.json

API_KEY=""
JWT=""
ORG=""
PROJECT=""
NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key) API_KEY="$2"; shift 2 ;;
    --jwt)     JWT="$2"; shift 2 ;;
    --org)     ORG="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --name)    NAME="$2"; shift 2 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知参数: $1（--help 看用法）" >&2; exit 1 ;;
  esac
done

if [[ -z "$API_KEY" ]]; then
  echo "✗ 缺少 --api-key（智谱开放平台 API Key，形如 xxxxxxxx.yyyyyyyy）" >&2
  exit 1
fi
if [[ "$API_KEY" != *.* ]]; then
  echo "✗ API Key 格式不像智谱的 <id>.<secret>" >&2
  exit 1
fi
if [[ -z "$JWT" && ( -z "$ORG" || -z "$PROJECT" ) ]]; then
  echo "⚠ 未提供 --jwt 或 --org/--project：App 只能查询默认上下文（团队套餐可能查不到）" >&2
fi

DEVICE="$(e6_resolve_device)"
[[ -z "$DEVICE" ]] && { echo "✗ 找不到 E6 设备（USB 或局域网）" >&2; exit 1; }
echo "==> 设备: $DEVICE"

# 清洗：值里不允许出现单引号（App 侧用单引号包 JSON 落盘）
clean() { printf '%s' "$1" | tr -d "'"; }

# 生成配置 JSON（值已在 shell 层清洗过单引号）
CFG_JSON="$(python3 - "$API_KEY" "$JWT" "$ORG" "$PROJECT" "$NAME" <<'PY'
import json, sys
api_key, jwt, org, project, name = sys.argv[1:6]
print(json.dumps({
    "api_key": api_key,
    "jwt_token": jwt,
    "org": org,
    "project": project,
    "name": name,
}, ensure_ascii=False, separators=(",", ":")))
PY
)"

echo "==> 写入设备 $REMOTE_CFG"
adb -s "$DEVICE" shell "mkdir -p $REMOTE_DIR"
TMP_CFG=$(mktemp /tmp/glm_cfg.XXXXXX.json)
printf '%s\n' "$CFG_JSON" > "$TMP_CFG"
adb -s "$DEVICE" push "$TMP_CFG" "$REMOTE_CFG" >/dev/null
rm -f "$TMP_CFG"

# 权限收紧：只有 root 可读（里面有 API Key）
adb -s "$DEVICE" shell "chmod 600 $REMOTE_CFG"

echo "==> 当前配置（脱敏）:"
python3 - "$CFG_JSON" <<'PY'
import json, sys
c = json.loads(sys.argv[1])
def mask(k):
    return (k[:5] + "..." + k[-4:]) if len(k) > 12 else "***"
print("    api_key  :", mask(c["api_key"]))
print("    jwt_token:", ("已下发（一次性，发现成功后自动清除）" if c["jwt_token"] else "无"))
print("    org      :", c["org"] or "无")
print("    project  :", c["project"] or "无")
PY

echo
echo "完成。在设备桌面点「GLM用量」图标，或:"
echo "  adb -s $DEVICE shell miniapp_cli start 8090906000000002"
echo "App 内点「刷新」会重新读本配置（换 JWT 不用重启 App）。"
