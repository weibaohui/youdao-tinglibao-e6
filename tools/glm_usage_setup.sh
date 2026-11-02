#!/usr/bin/env bash
#
# 有道听力宝 E6 (YDLE6) · GLM 用量查询 App · 配置下发脚本
#
# 把 API Key（必填）与「机构/项目上下文」写进设备：
#   /userdisk/glm_usage/config.json   —— API Key + 一次性发现凭据（root 600）
#   /userdisk/glm_usage/state.json    —— 已发现的机构上下文 + 当前选中项
#
# 用法:
#   ./glm_usage_setup.sh --api-key <智谱APIKey>
#   ./glm_usage_setup.sh --api-key <智谱APIKey> --jwt <网页端JWT>
#        # 用网页端 JWT 发现账号下的全部机构/项目（一次性，用完 App 自动清除）
#   ./glm_usage_setup.sh --api-key <智谱APIKey> \
#        --ctx "团队编程套餐项目|org-XXXX|proj-YYYY|2" \
#        --ctx "默认项目|org-ZZZZ|proj-WWWW|1"
#        # 手工下发多个机构/项目（推荐：JWT 会过期，手填一次管半年）
#
# ★ 网页端 JWT 获取方法（一次性，App 用完自动从配置清除，不会落盘复用）:
#     电脑浏览器登录 https://bigmodel.cn → F12 → Network → 刷新页面
#     → 找 getCustomerInfo 请求 → Request Headers
#     → 复制 Authorization: Bearer 后面那一长串
#
# ★ ctx 字段:  名称 | organizationId | projectId | projectType(可选，1=个人 2=团队编程套餐)
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=e6_device.sh
source "$HERE/e6_device.sh"

REMOTE_DIR=/userdisk/glm_usage
REMOTE_CFG=$REMOTE_DIR/config.json
REMOTE_STATE=$REMOTE_DIR/state.json

API_KEY=""
JWT=""
ORG=""
PROJECT=""
NAME=""
CTX_RAW=""      # 换行分隔的 --ctx 列表（避开 bash 3.2 的数组展开坑）

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key) API_KEY="$2"; shift 2 ;;
    --jwt)     JWT="$2"; shift 2 ;;
    --org)     ORG="$2"; shift 2 ;;
    --project) PROJECT="$2"; shift 2 ;;
    --name)    NAME="$2"; shift 2 ;;
    --ctx)     CTX_RAW="$CTX_RAW$2
"; shift 2 ;;
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

# 把 --ctx 解析成结构化列表（走环境变量传参，macOS 自带 bash 3.2 不用数组）
PARSED_CTX="$(GLM_CTX_RAW="$CTX_RAW" python3 - <<'PY'
import json, os
out = []
for raw in os.environ.get('GLM_CTX_RAW', '').splitlines():
    raw = raw.strip()
    if not raw:
        continue
    parts = [p.strip() for p in raw.split('|')]
    if len(parts) < 3:
        sys_exit = '✗ --ctx 格式应为 名称|orgId|projectId[|ptype]，收到: %s' % raw
        raise SystemExit(sys_exit)
    name, org, proj = parts[0], parts[1], parts[2]
    ptype = parts[3] if len(parts) > 3 and parts[3] else '0'
    score = (100 if ptype == '2' else 0) + (8 if proj else 0)
    out.append({'org': org, 'proj': proj, 'name': name,
                'ptype': int(ptype) if ptype.isdigit() else 0, 'score': score})
print(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
PY
)"

CTX_COUNT="$(GLM_CTX_RAW="$CTX_RAW" python3 -c "
import os
print(len([l for l in os.environ.get('GLM_CTX_RAW','').splitlines() if l.strip()]))")"

if [[ -z "$JWT" && "$CTX_COUNT" == "0" && ( -z "$ORG" || -z "$PROJECT" ) ]]; then
  echo "⚠ 未提供 --jwt / --ctx / --org+--project：App 只能查询默认上下文（团队套餐查不到）" >&2
fi

DEVICE="$(e6_resolve_device)"
[[ -z "$DEVICE" ]] && { echo "✗ 找不到 E6 设备（USB 或局域网）" >&2; exit 1; }
echo "==> 设备: $DEVICE"

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
TMP_CFG="$(mktemp /tmp/glm_cfg.XXXXXX.json)"
printf '%s\n' "$CFG_JSON" > "$TMP_CFG"
adb -s "$DEVICE" push "$TMP_CFG" "$REMOTE_CFG" >/dev/null
rm -f "$TMP_CFG"

# 权限收紧：只有 root 可读（里面有 API Key）
adb -s "$DEVICE" shell "chmod 600 $REMOTE_CFG"

# 手工 ctx 列表 -> 直接写 state.json，App 启动即用，不依赖会过期的 JWT
if [[ "$CTX_COUNT" != "0" ]]; then
  echo "==> 写入设备 ${REMOTE_STATE}（$CTX_COUNT 个机构上下文）"
  STATE_JSON="$(python3 - "$PARSED_CTX" <<'PY'
import json, sys
ctxs = json.loads(sys.argv[1])
# 默认选中团队编程套餐（ptype=2）；没有就选第一个
active = 0
for i, c in enumerate(ctxs):
    if c.get('ptype') == 2:
        active = i
        break
print(json.dumps({'contexts': ctxs, 'active': active}, ensure_ascii=False, separators=(',', ':')))
PY
)"
  TMP_STATE="$(mktemp /tmp/glm_state.XXXXXX.json)"
  printf '%s\n' "$STATE_JSON" > "$TMP_STATE"
  adb -s "$DEVICE" push "$TMP_STATE" "$REMOTE_STATE" >/dev/null
  rm -f "$TMP_STATE"
  adb -s "$DEVICE" shell "chmod 644 $REMOTE_STATE"
fi

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
echo "顶部胶囊可以在多个机构/项目之间点击切换。"
