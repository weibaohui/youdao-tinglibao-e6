# GLM 用量查询（MiniApp · AppID 8090906000000002）

在听力宝 E6 的 240×320 屏幕上查看智谱 BigModel 套餐额度：
**5 小时窗口 / 本周额度** 的用量百分比、进度条、重置时间与剩余 Tokens，
多机构/项目一键切换。与 Metalio E-Ink4 墨水屏版、Kindle 版
（`kindle-koreader-app`）同源的接口契约 —— 这是第三块屏。

<p align="center">
  <img src="../images/e6_glm_usage.png" width="240" alt="GLM 用量真机截图">
  &nbsp;&nbsp;
  <img src="../images/e6_glm_desktop.png" width="240" alt="桌面图标">
</p>

> 左：应用主界面（默认上下文，暂无套餐数据时的显示）。
> 右：桌面 —— 左下角「GLM用量」图标，与官方应用并列，点击即用。

## 界面

- 顶部标题栏：应用名 + 套餐等级标签（接口返回 `level` 时显示）
- 上下文胶囊行（多机构/项目时出现）：点击切换，选中项蓝底白字
- 两张卡片：
  - **5 小时窗口**：百分比大字 + 进度条（绿→黄→红 分档）+ 剩余 Tokens + 重置时间
  - **本周额度**：同构
- 元信息行：MCP 请求次数、5h/周重置剩余次数（有则显示）
- 底部状态栏：更新时间 / 错误原因 + 「刷新」按钮
- 每 60 秒自动刷新一次

## 配置（本机不落 Key 进应用包）

配置放设备 `/userdisk/glm_usage/config.json`（权限 600），
由 [`tools/glm_usage_setup.sh`](../tools/glm_usage_setup.sh) 下发：

```bash
# 只配 API Key（个人版套餐 / 默认上下文够用）
./tools/glm_usage_setup.sh --api-key 'xxxxxxxx.yyyyyyyy'

# 团队套餐：加一次性网页 JWT，自动发现全部机构/项目
./tools/glm_usage_setup.sh --api-key 'xxxxxxxx.yyyyyyyy' --jwt 'eyJhbGci...'
```

三条上下文获取路径（按优先级）：

1. **`--jwt`（推荐）**：浏览器登录 [bigmodel.cn](https://bigmodel.cn) → F12 → Network
   → 任选 `getCustomerInfo`/`quota/limit` 请求 → Request Headers →
   复制 `Authorization: Bearer ` 后面的整串。**一次性**：App 发现成功后
   自动把所有机构/项目存进 `/userdisk/glm_usage/state.json` 并从配置里清除
   JWT（与墨水屏版同一策略，Token 不落盘复用）。
2. **`--org` + `--project`**：从 DevTools 里直接抓 `bigmodel-organization` /
   `bigmodel-project` 两个请求头的值手填（JWT 懒得抓时用）。
3. **兜底**：都没配时查默认上下文（个人版套餐直接出数；团队版会提示去配）。

下发新配置后**不用重启 App**，点「刷新」即重新读配置生效。

## 接口契约（三块屏同源）

| 用途 | 端点 | 鉴权 |
| :--- | :--- | :--- |
| 发现机构/项目 | `GET bigmodel.cn/api/biz/customer/getCustomerInfo` | `Bearer <网页JWT>`（一次性） |
| 查额度 | `GET open.bigmodel.cn/api/monitor/usage/quota/limit?type=2` | API JWT + `bigmodel-organization` / `bigmodel-project` 头 |
| 查重置次数 | `GET open.bigmodel.cn/api/biz/customer-package-reset/list?targetType=TEAM` | 同上 |

额度接口要的 `Authorization` **不是 API Key 本身**，而是由 `<id>.<secret>`
现算的短时效 HS256 JWT（`{"api_key","exp","timestamp"}` 声明，
1 小时有效期）。E6 上没有 openssl/base64 命令、也没有可用的 JS crypto
模块形状，所以 `index.js` 内置了一套**纯 JS 的 SHA-256 + HMAC-SHA256 +
base64url**（约 120 行），已用 Node `crypto` 对拍过多组边界向量
（55/56/63/64/65 字节填充边界、64B/100B 密钥、签名可逆向验证）。

响应解析要点（与墨水屏版一致）：

- `limits[]` 里 `TOKENS_LIMIT`/`CREDIT_LIMIT` 是两个窗口，
  **`nextResetTime` 更早的那个是 5 小时窗**，另一个是周窗；
- `TIME_LIMIT` 是 MCP 请求次数（`currentValue`/`usage`）；
- `percentage` 为已用百分比，`remaining` 为剩余 Tokens；
- 重置次数取 `fiveHourResets`/`weekResets` 里 `available != false` 的计数；
- 重置时间按 **UTC+8** 展示（额度控制台面向中国区）。

## 工程与构建

```text
miniapp/glm_usage_app/
├── manifest.json      # appid 8090906000000002 + 桌面图标注册（addDesktop）
├── app.js             # Falcon 入口契约（同 e6_demo_app）
├── index.js           # 全部逻辑：加密 / 接口 / 状态 / 界面（单文件）
└── app_icon.png       # 156×160 桌面图标（与墨水屏版同图）
```

```bash
cd miniapp && ./build_miniapp.sh glm_usage_app
# 一键：qjsc 编译 → .amr 打包 → adb 部署 → 启动 → 截图 → 打印日志
```

真机验证记录（2026-11-02，固件 4.7.5）：

- HTTPS + 自定义请求头在 E6 `http` 模块可用（S7 Pro 手册与本地实测互相印证）；
- 纯 JS JWT 被智谱服务端接受（`refresh ok=true`，HTTP 200 `操作成功`）；
- 桌面图标注册并显示，图标 → 详情页 → 打开 → 自动查询全链路走通；
- 过期 JWT 的错误提示正确渲染（`Web Token 已过期/无效，请重新抓取`），
  且不影响兜底上下文继续查询；
- 点「刷新」按钮 → 重读配置 → 重新查询（换 JWT 不用重启 App）。

## 安全说明

- API Key 只存在设备 `/userdisk/glm_usage/config.json`（600 权限），
  **不进应用包、不进仓库**；App 界面不展示 Key。
- 网页 JWT 一次性使用，发现成功即从配置清除，不会留副本。
- 卸载：`adb shell miniapp_cli uninstall 8090906000000002`，
  再 `adb shell rm -rf /userdisk/glm_usage` 清掉配置与状态。
