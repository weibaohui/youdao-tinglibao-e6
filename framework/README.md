# e6app —— 有道听力宝 E6 Falcon MiniApp 开发框架

用 **Vue 单文件组件（SFC）** 开发 E6 的 Falcon MiniApp：写 `.vue` → 一条命令编译成
QuickJS 字节码 → 打包 `.amr` → 装机启动 → 自动截图取证。热重监听模式下**存盘即上屏**。

```bash
# 0) 一次性安装编译依赖（framework/ 目录下）
cd framework && npm install

# 1) 从模板创建工程
framework/bin/e6app create ~/e6apps/myapp --name 我的应用

# 2) 开发（存盘自动重编译 + 部署 + 截图）
framework/bin/e6app dev ~/e6apps/myapp

# 3) 发布产物
framework/bin/e6app build ~/e6apps/myapp   # → dist/<appid>.amr
```

## 流水线

```text
src/pages/*.vue ──sfc_compiler.js──▶ 页面.js ─┐
runtime/e6ui.js ──(内联进每个页面)────────────┤
entry/app.js ────────────────────────────────┤
manifest.json / assets / app_icon.png ───────┘
        │  build_amr.py（qjsc 编译 + cert MD5 签名 + zip）
        ▼
    dist/<appid>.amr ──adb──▶ 设备 ──▶ miniapp_cli start ──▶ capture 截图
```

## 在模板工程里写页面

`src/pages/index.vue`（单页；多页打包支持但**页间导航 API 见"已知限制"**）：

```vue
<template>
  <div class="page">
    <nav-bar title="标题" :back="true" @back="exit"></nav-bar>
    <card title="示例">
      <cell title="拉取" :value="quote" @tap="refresh"></cell>
    </card>
    <btn text="刷新" @tap="refresh"></btn>
  </div>
</template>

<script>
import UI from './e6ui.js';   /* 构建时自动内联进本页面模块 */

export default {
  components: { 'nav-bar': UI.NavBar, 'card': UI.Card,
                'cell': UI.Cell, 'btn': UI.Btn },
  data() { return { quote: '' }; },
  methods: {
    async refresh() {
      const res = await UI.http.get('https://api.example.com/x');
      if (res.ok) this.quote = res.body;
    },
    exit() { if (this.$page && this.$page.finish) this.$page.finish(); }
  }
};
</script>

<style scoped>
.page { background-color: #0d1117; }   /* weex-styler 转 jsonStyle，实验性 */
</style>
```

## runtime/e6ui.js 组件与 API

| 组件 | props | 事件 | 说明 |
| :--- | :--- | :--- | :--- |
| `NavBar` | title, back | `@back` | 顶栏 |
| `Cell` | title, value, arrow | `@tap` | 列表行 |
| `Btn` | text, type(primary/ghost) | `@tap` | 按钮 |
| `Card` | title（默认插槽） | — | 卡片容器 |
| `StatusFooter` | text, error, busy, refreshable | `@refresh` | 底部状态栏 |

| API | 说明 |
| :--- | :--- |
| `UI.http.get(url, {headers, timeout})` | axios 风格，自动解析 JSON；默认带 User-Agent |
| `UI.http.post(url, data, opts)` | **实验性**（E6 的 POST 形状未验证） |
| `new UI.Storage(name)` | `.get(k, fallback)` / `.set(k, v)`，JSON 落盘 `/userdisk/e6app_data/` |
| `UI.sound.playWav(name)` | 播放应用 assets/ 里的音频（自动定位 A/B 槽位） |
| `UI.colors` / `UI.formatTime` | 主题色板 / 时间格式化 |

## 真机验证过的契约（2026-11-02，固件 4.7.5）

- **事件必须 `$emit`**：自定义组件在 `render` 里 `this.$emit('tap')`，父模板 `@tap` 监听。
  **函数类型 props（`:on-tap="fn"` 不通**。
- **组件必须与页面同模块**：跨模块组件渲染正常但 `$emit` 断路（jsfm 每模块独立
  Vue 构造器）。框架构建时自动把 `runtime/e6ui.js` 内联进每个页面模块，页面照常
  `import UI from './e6ui.js'` 即可，无感。
- class + `<style scoped>` 可用（weex-styler → jsonStyle，jsfm 按类名合并）；
  拿不准时用内联 `:style` 对象（camelCase，73 项白名单见 `docs/MINIAPP_DEV.md`）。
- 页面实例上可用：`this.$page.finish()`（关页）、`this.$falcon`（框架实例）。
- **多页导航 API 未定**：jsfm 原型里有 `loadPage`，但参数形状不明且**错误调用会
  崩掉整个 miniapp 宿主**（实测）。v0.2 模板为单页；多页打包本身没问题。
- 部署怪癖：同 appid 的旧实例**卸载也杀不死**，`miniapp_cli start` 只会把旧实例
  调到前台 —— `e6app run` 已内置处理（盲点返回箭头使其自退 + 卸载式重装）。
  若截图仍是桌面，用 Web 模拟器（`docs/REMOTE_DEBUG.md`）点桌面图标启动。
- 触屏单点，无捏合；截图熄屏时是彩噪（先 tap 点亮）。

## 致谢

SFC 编译器改编自
[cubelikeplayDaniel/youdao-dictpen-s7pro-guide](https://github.com/cubelikeplayDaniel/youdao-dictpen-s7pro-guide)
的 `falcon_vue_compiler.js`（MIT）；模块加载机制逆向参考其
`docs/falcon_quickjs_module_loader_and_bytecode_protocol.md`。Falcon 本身是
Weex 系（jsfm/nvue）架构，SFC 语义与
[uni-app nvue](https://en.uniapp.dcloud.io/tutorial/nvue-outline.html) 同源。
