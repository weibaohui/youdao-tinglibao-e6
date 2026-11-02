#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH=$PATH:/usr/local/go/bin:/opt/homebrew/bin

echo "=========================================="
echo "🚀 开始交叉编译有道听力宝 E6 所有原生组件"
echo "=========================================="

echo "1. 编译 hello_screen (DRM 60FPS 双缓冲)..."
cd "$DIR/src/hello_screen"
bash build.sh

echo "2. 编译 launcher_watcher (桌面事件监听器)..."
cd "$DIR/src/launcher_watcher"
bash build.sh

echo "3. 编译 web_server (板载轻量 Web 仪表盘)..."
cd "$DIR/src/web_server"
bash build.sh

echo "4. 编译 tap (触摸屏注入器 e6_tap)..."
cd "$DIR/src/tap"
bash build.sh

echo "5. 编译 e6_debug_server (HTTP 远程调试服务)..."
cd "$DIR/src/e6_debug_server"
bash build.sh

echo "=========================================="
echo "🎉 全部编译完成！"
echo "=========================================="
echo
echo "提示：'./tools/e6_ssh_setup.sh' 可把 SSH + 免密 ADB + 调试服务一次性装到设备上。"
