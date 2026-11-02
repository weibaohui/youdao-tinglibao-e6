#!/bin/sh
#
# 拉起 adbd，并让它额外监听 TCP 5555（无线 ADB）。
#
# 为什么不用 `adb tcpip 5555`（宿主机命令）：
#   那条命令让 adbd 自杀重启，但本机 inittab 里**没有 adbd 的 respawn 条目**
#   （只有 `::respawn:-/bin/login`），adbd 起来后没人再拉它 —— 实测直接失联，
#   USB 和 TCP 端口会同时消失，只能靠物理操作救回来。
#   这里改为按正确的环境变量手动拉起。
#
# 环境变量来源：
#   SN / SLOT          —— /etc/profile.d/bootenv.sh 从 /proc/cmdline 取
#   ADB_TCP_PORT       —— /etc/profile.d/adbd_tcp_port.sh 固定为 5555
#   其余               —— 照抄原厂 adbd 进程的环境
#
export USER=root
export LD_LIBRARY_PATH=/lib:/usr/lib
export HOME=/
export SN=LE62200008802358
export MTP_READ_ONLY=FALSE
export user_debug=31
export SLOT=_a
export TERM=vt102
export PATH=/bin:/sbin:/usr/bin:/usr/sbin
export XDG_RUNTIME_DIR=/var/run
export ADBD_SHELL=/bin/sh
export SHELL=/bin/sh
export LC_ALL=zh_CN.utf8
export PWD=/oem/YoudaoDictPen/output
export ADB_TCP_PORT=${ADB_TCP_PORT:-5555}

/usr/bin/adbd
