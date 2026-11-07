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


def draw_bili(d: ImageDraw.ImageDraw) -> None:
    """小电视：双天线 + 粉色机身 + 深色屏幕 + 「22 33」式笑脸。

    B 站粉 #fb7299 做机身，屏幕用 App 自己的背景色 #0d1117，
    眼睛画成两道圆弧（模仿小电视的经典表情）。
    """
    pink = _c("fb7299")
    pink_dark = _c("c9416b")
    dark = _c("0d1117")
    gray = _c("8b949e")

    # 天线：两根从机身顶角伸出，末端小球
    d.line([(56 * S, 76 * S), (40 * S, 52 * S)], fill=gray, width=3 * S)
    d.ellipse([36 * S, 48 * S, 44 * S, 56 * S], fill=pink)
    d.line([(100 * S, 76 * S), (116 * S, 52 * S)], fill=gray, width=3 * S)
    d.ellipse([112 * S, 48 * S, 120 * S, 56 * S], fill=pink)

    # 机身
    d.rounded_rectangle(
        [24 * S, 74 * S, 132 * S, 140 * S], radius=10 * S, fill=pink,
        outline=pink_dark, width=2 * S,
    )

    # 屏幕
    d.rounded_rectangle(
        [36 * S, 84 * S, 120 * S, 126 * S], radius=6 * S, fill=dark,
        outline=pink_dark, width=2 * S,
    )

    # 眼睛：两段圆弧，像「⌒ ⌒」的经典小电视表情
    d.arc([48 * S, 94 * S, 66 * S, 116 * S], start=200, end=340, fill=pink, width=4 * S)
    d.arc([90 * S, 94 * S, 108 * S, 116 * S], start=200, end=340, fill=pink, width=4 * S)

    # 腿
    d.line([(56 * S, 140 * S), (50 * S, 148 * S)], fill=pink_dark, width=4 * S)
    d.line([(100 * S, 140 * S), (106 * S, 148 * S)], fill=pink_dark, width=4 * S)


# ---------------------------------------------------------------------- 主体
ICONS = {
    "radio": ("收音机", draw_radio, _c("f2d28b")),
    "bili": ("小电视", draw_bili, _c("fb7299")),
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
    out = args.out or os.path.join(root, "framework", "examples", args.name, "app_icon.png")
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
