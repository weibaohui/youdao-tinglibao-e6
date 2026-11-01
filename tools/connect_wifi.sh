#!/bin/bash
# 自动通过 Wi-Fi 连接有道听力宝 E6

DEVICE_IP="${1:-192.168.0.109}"
PORT="5555"

echo "📡 正在尝试通过 Wi-Fi 无线 ADB 连接听力宝: $DEVICE_IP:$PORT ..."
adb connect "$DEVICE_IP:$PORT"
adb devices
