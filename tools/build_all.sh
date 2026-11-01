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

echo "=========================================="
echo "🎉 全部编译完成！"
echo "=========================================="
