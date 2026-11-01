#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "🔨 正在为 Rockchip RV1106 (ARMv7) 编译 e6_tap..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-s -w" -o e6_tap main.go
echo "✅ 编译完成: $DIR/e6_tap"
ls -lh e6_tap
