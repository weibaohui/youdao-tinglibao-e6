#!/bin/sh
#
# 有道听力宝 E6 —— 自定义 adbd 鉴权脚本：**恒成功**
#
# 用法（由 tools/e6_ssh_setup.sh 部署，开机钩子负责 bind-mount）：
#     mount --bind /userdisk/ssh/adbd_auth.sh /usr/bin/adbd_auth.sh
#
# 原理：设备 rootfs 是 EROFS 只读，原来的 /usr/bin/adbd_auth.sh 每次连接都要口令。
#       但 bind-mount 可以在运行时覆盖它 —— 这就是"永久免密 ADB"的落点，
#       而且**不需要重刷固件、不动 boot 分区的 RSA 签名**。
#
# 原脚本逻辑（供对照）：
#     VERIFIED=/tmp/.adb_auth_verified
#     if [ -f "$VERIFIED" ]; then echo "success."; exit; fi
#     for i in $(seq 1 3); do
#         read -p "$(hostname -s)'s password: " PASSWD
#         if [ "$(echo $PASSWD | md5sum)" = "054bda46d56c8496e14e81d78f5a3c27  -" ]; then
#             echo "success."; touch $VERIFIED; exit
#         fi
#         echo "password incorrect!"
#     done
#     false
#
echo "success."
exit 0
