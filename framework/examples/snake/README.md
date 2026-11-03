# 贪吃蛇（e6app 示例应用 · appid 8090906000000006）

e6app 第二个游戏示例：14×16 网格、NES bevel 凸块质感、物理键 + 手势双操作。

![真机截图](../../docs/images/e6_snake.png)

## 操作

| 输入 | 动作 |
| :--- | :--- |
| **手势 上/下/左/右滑** | 蛇转向对应方向（绝对方向，自动禁反向） |
| **棋盘点按** | 暂停 / 继续 |
| **物理键 上一首 / 下一首** | 左转 / 右转（相对转向） |
| **物理键 Home** | 暂停 / 继续（游戏结束时=重开） |
| **物理键 播放** | 游戏结束时=重开 |

规则：撞墙/撞自己结束；食物 +10 分；速度随分数 200→100ms；最高分持久化。

## 构建

```bash
framework/bin/e6app build framework/examples/snake
framework/bin/e6app run   framework/examples/snake
```
