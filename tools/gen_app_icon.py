#!/usr/bin/env python3
"""
有道听力宝 E6 · 桌面图标生成器 (house style)

复刻 framework/examples/snake/app_icon.png 的版式规范：
  · 画布 156×160，四角外透明
  · 圆角矩形 radius=14，填充 #0d1117，2px 描边 #3d4451
  · 顶部一行中文标题（PingFang SC Semibold）
  · 标题下方一枚与 App 主题对应的矢量图形

用法：
  python3 tools/gen_app_icon.py radio            # 生成 radio 图标
  python3 tools/gen_app_icon.py radio --preview  # 同时在 docs/images/ 留一份预览

之所以要带中文：E6 桌面图标只有 156×160，缩到桌面实际尺寸后纯图形极易认错
（历史上 radio 的图标就误用了 tetris 的「方块」图标），标题字是最直接的标识。
"""
from __future__ import annotations

import argparse
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- 房屋风格常量
CANVAS_W, CANVAS_H = 156, 160
RADIUS = 14
BG = (13, 17, 23, 255)        # #0d1117
BORDER = (61, 68, 81, 255)    # #3d4451
TITLE_Y = 14                  # 标题顶部
TITLE_SIZE = 34

S = 4  # 超采样倍数，最后 LANCZOS 缩回


def _pingfang(size: int) -> ImageFont.FreeTypeFont:
    """PingFang SC Semibold（找不到就退到 Hiragino Sans GB）。"""
    cands = glob.glob(
        "/System/Library/AssetsV2/com_apple_MobileAsset_Font8/*/AssetData/PingFang.ttc"
    )
    for path in cands:
        for idx in range(12):
            try:
                f = ImageFont.truetype(path, size, index=idx)
            except Exception:
                continue
            if f.getname()[0] == "PingFang SC" and f.getname()[1] == "Semibold":
                return f
    for path in ("/System/Library/Fonts/Hiragino Sans GB.ttc",):
        if os.path.exists(path):
            return ImageFont.truetype(path, size, index=1)
    raise RuntimeError("找不到可用的中文字体")


def _c(hexstr: str, a: int = 255) -> tuple[int, int, int, int]:
    hexstr = hexstr.lstrip("#")
    return (int(hexstr[0:2], 16), int(hexstr[2:4], 16), int(hexstr[4:6], 16), a)


def _title(d: ImageDraw.ImageDraw, text: str, color) -> None:
    font = _pingfang(TITLE_SIZE * S)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (CANVAS_W * S - tw) / 2 - bbox[0]
    y = TITLE_Y * S - bbox[1]
    d.text((x, y), text, font=font, fill=color)


# ------------------------------------------------------------------ 各 App 图形
def draw_radio(d: ImageDraw.ImageDraw) -> None:
    """经典收音机：斜天线 + 机身 + 喇叭 + 调谐刻度盘 + 旋钮。

    配色取自收音机 App 自身的 UI 调色板：
    琥珀 #e3b341（状态色）+ 蓝 #58a6ff（提示色）+ 灰 #8b949e（次要文字）。
    """
    amber = _c("e3b341")
    amber_dark = _c("a97b26")
    blue = _c("58a6ff")
    cream = _c("f4ecd8")
    gray = _c("8b949e")
    dark = _c("1b2028")

    # 天线：从机身右上角斜向左上伸出，末端小球
    d.line([(110 * S, 86 * S), (140 * S, 56 * S)], fill=gray, width=3 * S)
    d.ellipse([136 * S, 52 * S, 144 * S, 60 * S], fill=amber)

    # 机身
    d.rounded_rectangle(
        [24 * S, 80 * S, 132 * S, 146 * S], radius=12 * S, fill=amber,
        outline=amber_dark, width=2 * S,
    )

    # 喇叭：深色圆盘 + 网格
    cx, cy, r = 60 * S, 112 * S, 24 * S
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dark, outline=amber_dark, width=2 * S)
    for i in range(-3, 4):
        off = i * 7 * S
        half = int((r * r - off * off) ** 0.5) - 2 * S
        if half <= 0:
            continue
        d.line([(cx - half, cy + off), (cx + half, cy + off)], fill=gray, width=1 * S)

    # 调谐刻度盘（蓝色小窗 + 红色指针）
    d.rounded_rectangle(
        [94 * S, 88 * S, 124 * S, 106 * S], radius=3 * S, fill=blue,
        outline=amber_dark, width=2 * S,
    )
    d.line([(99 * S, 99 * S), (119 * S, 99 * S)], fill=cream, width=1 * S)
    d.line([(108 * S, 91 * S), (108 * S, 103 * S)], fill=_c("ef4444"), width=2 * S)

    # 旋钮
    kx, ky, kr = 109 * S, 124 * S, 10 * S
    d.ellipse([kx - kr, ky - kr, kx + kr, ky + kr], fill=dark, outline=cream, width=2 * S)
    d.line([(kx, ky), (kx + 6 * S, ky - 5 * S)], fill=amber, width=2 * S)


def draw_glm(d: ImageDraw.ImageDraw) -> None:
    """GLM 用量：赛博监控终端 + 环形额度表盘 + 智谱 AI 核心星芒 + 三档动态用量条。

    配色取自智谱 AI / GLM 品牌调色板：
    电光青 #38bdf8 + 智谱蓝 #1f6feb + 活力绿 #3fb950 + 能量紫 #a371f7。
    """
    import math

    # 赛博监控终端机身（复刻 radio/bili 的卡片规范）
    d.rounded_rectangle(
        [24 * S, 72 * S, 132 * S, 142 * S], radius=10 * S,
        fill=_c("161b22"), outline=_c("38bdf8"), width=2 * S,
    )

    # 深色液晶屏幕内框
    d.rounded_rectangle(
        [28 * S, 76 * S, 128 * S, 138 * S], radius=7 * S,
        fill=_c("0d1117"), outline=_c("21262d"), width=1 * S,
    )

    # 左侧：环形额度表盘 (Gauge)
    gcx, gcy, gr = 53 * S, 107 * S, 20 * S
    # 底轨
    d.arc([gcx - gr, gcy - gr, gcx + gr, gcy + gr], start=135, end=405, fill=_c("21262d"), width=4 * S)
    # 活跃额度弧 (75% 进度)
    d.arc([gcx - gr, gcy - gr, gcx + gr, gcy + gr], start=135, end=345, fill=_c("38bdf8"), width=4 * S)
    # 进度端点高亮小光球
    rad = math.radians(345)
    cap_x = gcx + gr * math.cos(rad)
    cap_y = gcy + gr * math.sin(rad)
    d.ellipse([cap_x - 2.5 * S, cap_y - 2.5 * S, cap_x + 2.5 * S, cap_y + 2.5 * S], fill=_c("ffffff"))

    # 表盘中心：智谱 AI 星芒 (4 尖菱形星芒)
    sp_len, sp_w = 8 * S, 2.5 * S
    d.polygon([(gcx, gcy - sp_len), (gcx + sp_w, gcy), (gcx, gcy + sp_len), (gcx - sp_w, gcy)], fill=_c("60a5fa"))
    d.polygon([(gcx - sp_len, gcy), (gcx, gcy + sp_w), (gcx + sp_len, gcy), (gcx, gcy - sp_w)], fill=_c("38bdf8"))
    d.ellipse([gcx - 1.5 * S, gcy - 1.5 * S, gcx + 1.5 * S, gcy + 1.5 * S], fill=_c("ffffff"))

    # 右侧：三档用量进度胶囊 (5h / 周额度 / Tokens)
    bx, bw, bh = 83 * S, 39 * S, 6 * S
    # 1. 5h 额度 (电光青)
    by1 = 87 * S
    d.ellipse([bx - 6 * S, by1 + 1.5 * S, bx - 3 * S, by1 + 4.5 * S], fill=_c("38bdf8"))
    d.rounded_rectangle([bx, by1, bx + bw, by1 + bh], radius=3 * S, fill=_c("161b22"), outline=_c("30363d"), width=1 * S)
    d.rounded_rectangle([bx, by1, bx + bw * 0.78, by1 + bh], radius=3 * S, fill=_c("38bdf8"))

    # 2. 周额度 (健康绿)
    by2 = 103 * S
    d.ellipse([bx - 6 * S, by2 + 1.5 * S, bx - 3 * S, by2 + 4.5 * S], fill=_c("3fb950"))
    d.rounded_rectangle([bx, by2, bx + bw, by2 + bh], radius=3 * S, fill=_c("161b22"), outline=_c("30363d"), width=1 * S)
    d.rounded_rectangle([bx, by2, bx + bw * 0.55, by2 + bh], radius=3 * S, fill=_c("3fb950"))

    # 3. 累计消耗 (能量紫)
    by3 = 119 * S
    d.ellipse([bx - 6 * S, by3 + 1.5 * S, bx - 3 * S, by3 + 4.5 * S], fill=_c("a371f7"))
    d.rounded_rectangle([bx, by3, bx + bw, by3 + bh], radius=3 * S, fill=_c("161b22"), outline=_c("30363d"), width=1 * S)
    d.rounded_rectangle([bx, by3, bx + bw * 0.90, by3 + bh], radius=3 * S, fill=_c("a371f7"))

    # 底部支架脚
    d.line([(44 * S, 142 * S), (40 * S, 147 * S)], fill=_c("1f6feb"), width=3 * S)
    d.line([(112 * S, 142 * S), (116 * S, 147 * S)], fill=_c("1f6feb"), width=3 * S)


# ---------------------------------------------------------------------- 主体
ICONS = {
    "radio": ("收音机", draw_radio, _c("f2d28b")),
    "glm": ("GLM", draw_glm, _c("38bdf8")),
}


def generate(name: str) -> Image.Image:
    if name not in ICONS:
        raise SystemExit(f"未知图标 {name}，可选: {', '.join(ICONS)}")
    title, drawer, tcolor = ICONS[name]

    big = Image.new("RGBA", (CANVAS_W * S, CANVAS_H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    d.rounded_rectangle(
        [0, 0, CANVAS_W * S - 1, CANVAS_H * S - 1],
        radius=RADIUS * S, fill=BG, outline=BORDER, width=2 * S,
    )
    _title(d, title, tcolor)
    drawer(d)
    return big.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help=f"图标名: {', '.join(ICONS)}")
    ap.add_argument("--out", help="输出 PNG 路径")
    ap.add_argument("--preview", action="store_true", help="同时写一份到 docs/images/")
    args = ap.parse_args()

    img = generate(args.name)

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    defaults = {
        "glm": os.path.join(root, "miniapp", "glm_usage_app", "app_icon.png"),
    }
    out = args.out or defaults.get(args.name) or os.path.join(root, "framework", "examples", args.name, "app_icon.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print(f"✅ 已生成 {out}  ({img.size[0]}×{img.size[1]})")

    if args.preview:
        prev = os.path.join(root, "docs", "images", f"icon_{args.name}.png")
        img.save(prev)
        print(f"✅ 预览 {prev}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
