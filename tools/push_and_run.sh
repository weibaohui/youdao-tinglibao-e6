#!/bin/bash
# 一键推送 ARM 二进制文件到听力宝 /userdisk/ 并执行

if [ -z "$1" ]; then
    echo "用法: $0 <二进制可执行文件路径>"
    exit 1
fi

BIN_FILE="$1"
BIN_NAME=$(basename "$BIN_FILE")

echo "📦 正在推送 $BIN_NAME 到听力宝 /userdisk/ ..."
adb push "$BIN_FILE" "/userdisk/$BIN_NAME"
adb shell "chmod +x /userdisk/$BIN_NAME"

echo "🚀 正在运行 /userdisk/$BIN_NAME ..."
adb shell "/userdisk/$BIN_NAME"
