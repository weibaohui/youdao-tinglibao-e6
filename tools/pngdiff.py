#!/usr/bin/env python3
"""
pngdiff —— 逐像素比对两张 PNG，用于「操作有没有真的生效」的硬判据。

用法：
    python3 tools/pngdiff.py before.png after.png
    python3 tools/pngdiff.py before.png after.png --quiet   # 只输出差异像素数

输出示例：
    size (240, 320)
    before vs after 差异像素数: 927
      差异区域 x: 15 - 223  y: 193 - 215

退出码：
    0 = 有差异（画面变了）
    1 = 完全相同（画面没变）

依赖：Pillow。若没有，pip install Pillow
"""

import sys
import warnings

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("需要 Pillow：pip3 install Pillow\n")
    sys.exit(2)

warnings.filterwarnings("ignore", category=DeprecationWarning)


def pixels(img):
    """Pillow 新版用 get_flattened_data()，旧版用 getdata()。"""
    getter = getattr(img, "get_flattened_data", None) or img.getdata
    return list(getter())


def main(argv):
    if len(argv) < 3:
        sys.stderr.write(__doc__)
        return 2

    quiet = "--quiet" in argv[3:]
    a_path, b_path = argv[1], argv[2]

    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")

    if a.size != b.size:
        print("尺寸不同: %s vs %s" % (a.size, b.size))
        return 0

    if not quiet:
        print("size %s" % (a.size,))

    pa = pixels(a)
    pb = pixels(b)

    diff_idx = [i for i, (x, y) in enumerate(zip(pa, pb)) if x != y]
    n = len(diff_idx)

    if not quiet:
        print("差异像素数: %d / %d" % (n, len(pa)))

    if n:
        w = a.size[0]
        xs = [i % w for i in diff_idx]
        ys = [i // w for i in diff_idx]
        if not quiet:
            print("  差异区域 x: %d - %d  y: %d - %d" % (min(xs), max(xs), min(ys), max(ys)))
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
