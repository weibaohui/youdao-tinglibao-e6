# 俄罗斯方块（e6app 示例应用 · appid 8090906000000004）

e6app 框架的第一个游戏示例 —— 同时也是**框架能力验证应用**：
Vue SFC、自定义组件（棋盘/预览/按钮）、定时器重力循环、物理按键注册、触屏事件全链路。

![真机截图](../../docs/images/e6_tetris.png)

## 操作

| 输入 | 动作 |
| :--- | :--- |
| **棋盘手势 左滑 / 右滑** | 左移 / 右移 |
| **棋盘手势 下滑** | 硬降（+2 分/行） |
| **棋盘手势 上滑 / 点按** | 顺时针旋转（带踢墙） |
| 物理键 上一首/下一首/播放/Home | 组件信号注册（前台拦截，不劫持系统键） |

规则：标准 7 种方块 + 7-bag 随机、软降每 640ms（随消行加速至 280ms）、
消行计分 100/300/500/800、硬降 2 分/行、堆到顶 = 游戏结束（按任意操作键重开）。

## 构建部署

```bash
framework/bin/e6app build framework/examples/tetris
framework/bin/e6app run   framework/examples/tetris
```

## 物理按键 —— 已打通（2026-11-03 最终结论）

**上一首=左移、下一首=右移、播放=硬降、Home=旋转**，全部真机生效。

正确用法（缺一不可，每条都是踩坑换来的）：

1. **构造器大小写双兜底**：`buttonEventModule.ButtonEvent || buttonEventModule.buttonEvent`
   —— 模块导出键在不同加载时机只枚举出一个（keys 时而 `ButtonEvent` 时而
   `buttonEvent`，应为同一绑定的两个别名），单写一种会间歇性
   `TypeError: not a function`。
2. **订阅 = JQSignal 属性赋值**（箭头函数）：
   `be.backButtonClick = (a) => {...}` —— E6 实例没有 S7 的 `.on()`；
   `.connect()`、方法名约定（组件定义 `backButtonClick()`）也都不触发。
3. **必须 `setButtonEventReady(true)`**：声明接管后，prev/home 不再触发
   系统「返回导航」/桌面循环 —— 游戏不会被误退出。

曾经的死路（留档）：S7 文档照抄 `ButtonEvent` 大写构造 → not a function；
`.on()` → not a function；属性赋值后未验证前台状态的轮次造成"不触发"假象。
NetEase 能响应播放键是因为其私有 so 在原生层注册了媒体会话
（YDALAPI::MediaPlayer::MediaList），与 buttonEvent 是两条独立通路。

## 实现要点（框架契约的活样本）

- 棋盘/预览为**命令式 render 组件**（同模块内定义，循环构建 vnode 树），
  避免模板 v-for 在 jsfm 上的不确定性；
- 重力循环用**递归 setTimeout**（jsfm 原子级支持），不用 setInterval；
- 每次状态变更整体替换 `board`/`cur` 引用触发重渲染（Vue2 数组下标赋值不响应）；
- 旋转态由基础矩阵运行时生成（4 态预计算），碰撞检测 + 5 组踢墙偏移。
