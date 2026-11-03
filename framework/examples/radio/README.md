# 收音机（e6app 示例应用 · appid 8090906000000007）

网络收音机：内置 **339 个电台**（蜻蜓 FM 合作流，数据源自 Metalio E-Ink4
radio_catalog），覆盖全国各省交通/音乐/新闻广播。扬声器和在线流播放真机验证通过。

![真机截图](../../docs/images/e6_radio.png)

## 操作

| 输入 | 动作 |
| :--- | :--- |
| **手势 左右滑** | 切台（切台自动开始播放） |
| **手势 点按棋盘** | 停止 / 播放切换 |
| 物理键 播放/暂停 | 停止 / 播放切换（实验性：仅部分键可达） |
| 物理键 上一首 / 下一首 | 切台（实验性：可达性待完善） |

## 实现

- 播放：固件 `soundPlayer.playOnlineAudio(url)` 直接拉流（ICECAST mp3 直播流）
- 339 台数据编译期内嵌页面（约 28KB 源码），无跨模块 import
- 物理键经 e6keyed 守护 → /tmp/e6keys.buf → 200ms 轮询

## 构建

```bash
framework/bin/e6app build framework/examples/radio
framework/bin/e6app run   framework/examples/radio
```
