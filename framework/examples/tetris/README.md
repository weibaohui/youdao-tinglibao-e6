# 俄罗斯方块（e6app 示例应用 · appid 8090906000000004）

e6app 框架的第一个游戏示例 —— 同时也是**框架能力验证应用**：
Vue SFC、自定义组件（棋盘/预览/按钮）、定时器重力循环、物理按键注册、触屏事件全链路。

![真机截图](../../docs/images/e6_tetris.png)

## 操作

| 输入 | 动作 |
| :--- | :--- |
| 屏幕按钮 左 / 右 | 移动 |
| 屏幕按钮 转 | 顺时针旋转（带踢墙） |
| 屏幕按钮 落 | 硬降（+2 分/行） |
| 物理键 prev / next / home / play | **4.7.5 固件被系统消费，应用收不到**（见下） |

规则：标准 7 种方块 + 7-bag 随机、软降每 640ms（随消行加速至 280ms）、
消行计分 100/300/500/800、硬降 2 分/行、堆到顶 = 游戏结束（按任意操作键重开）。

## 构建部署

```bash
framework/bin/e6app build framework/examples/tetris
framework/bin/e6app run   framework/examples/tetris
```

## 物理按键的真机结论（重要，2026-11-02 实测）

目标映射（上一首=左移、下一首=右移、播放=坠落、Home=变形）**在 4.7.5 固件上不可行**：

1. `buttonEvent` 模块存在且可实例化，但导出为**小写** `buttonEvent`
   （S7 Pro 文档写 `ButtonEvent`）；实例只有 3 个方法：
   `setButtonEventReady` / `softButtonEvent` / `emitBottomSwipeBackEvent`
   —— **没有 S7 的 `.on(event, cb)`**。
2. 按键信号是 JQSignal 属性（`backButtonClick` 等），但对属性赋函数、
   `.connect()`、方法名约定（组件上定义 `backButtonClick()`）**全部不触发**。
3. 系统层直接消费：prev(158)=返回导航（**会把应用直接关掉**）、home(139)=桌面循环、
   next(159)/play(207)=静默吞掉。注入后事件既不到应用 JS，也不留日志。

→ 触屏按钮为唯一可靠输入。物理键若要接管，需要更深层的输入子系统改造
（如 /dev/input 层面的 remap 守护），超出本框架范围。

## 实现要点（框架契约的活样本）

- 棋盘/预览为**命令式 render 组件**（同模块内定义，循环构建 vnode 树），
  避免模板 v-for 在 jsfm 上的不确定性；
- 重力循环用**递归 setTimeout**（jsfm 原子级支持），不用 setInterval；
- 每次状态变更整体替换 `board`/`cur` 引用触发重渲染（Vue2 数组下标赋值不响应）；
- 旋转态由基础矩阵运行时生成（4 态预计算），碰撞检测 + 5 组踢墙偏移。
