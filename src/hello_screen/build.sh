#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "🔨 正在为 Rockchip RV1106 (ARMv7) 编译 hello_screen..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-s -w" -o hello_screen main.go
echo "✅ 编译完成: $DIR/hello_screen"
ls -lh hello_screen
