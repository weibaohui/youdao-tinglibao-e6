#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "🔨 正在为 Rockchip RV1106 (ARMv7) 编译 launcher_watcher..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-s -w" -o launcher_watcher main.go
echo "✅ 编译完成: $DIR/launcher_watcher"
ls -lh launcher_watcher
