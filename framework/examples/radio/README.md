# 收音机（e6app 示例应用 · appid 8090906000000007）

网络收音机：内置 **1904 个电台条目**（蜻蜓 FM 等公开流，覆盖全国各省交通、音乐与新闻广播）。
设备屏幕为 240×320；支持收藏、搜索、分页、手势切台、音量实时显示，以及 8 种频谱样式与 5 套色彩方案（彩色、灰白、随机颜色等）。

![真机截图](../../docs/images/e6_radio.png)

## 操作

| 输入 | 动作 |
| :--- | :--- |
| **手势 左右滑** | 切台（切台自动开始播放） |
| **手势 点按棋盘** | 停止 / 播放切换 |
| 物理键 播放/暂停 | 停止 / 播放切换（实验性：仅部分键可达） |
| 物理键 上一首 / 下一首 | 切台（实验性：可达性待完善） |

## 实现

- 播放：固件 `soundPlayer.playOnlineAudio(url)` 直接拉流；启动时等待按需启动的 SoundPlayer 服务
- 1904 台数据编译期内嵌页面；列表只渲染当前 5 台分页数据
- 频谱动画以 160ms 间隔更新，避免过密响应式重绘
- 物理键经 e6keyed 守护 → /tmp/e6keys.buf → 200ms 轮询

## 构建

```bash
framework/bin/e6app build framework/examples/radio
framework/bin/e6app run   framework/examples/radio
```
