/*
 * e6_tap —— 有道听力宝 E6 触摸屏注入工具
 *
 * 为什么需要它：
 *   设备上**没有** `input` / `sendevent` / `getevent` 命令
 *   （busybox 只带了一个只读的 `evtest`），所以 adb shell 里没法模拟点击。
 *   本工具直接打开 /dev/input/event3（hyn_ts 电容触摸屏）写入 MT 协议事件。
 *
 * 坐标系统（实测自 /dev/input/event3 的 evtest 输出）：
 *   ABS_MT_POSITION_X : Min 0, Max 240
 *   ABS_MT_POSITION_Y : Min 0, Max 320
 *   ABS_MT_SLOT       : Max 0（单点触控）
 *   与屏幕 240x320 逻辑坐标一一对应，无旋转、无偏移（cfg.json 的
 *   tp_direction=0 / tp_xoffset=0 / tp_yoffset=0 也是这么写的）。
 *
 * 用法：
 *   e6_tap tap  <x> <y>          单击
 *   e6_tap swipe <x1> <y1> <x2> <y2> [ms]
 *   e6_tap long  <x> <y> [ms]    长按
 *   e6_tap drag  <x1> <y1> <x2> <y2> [ms]   按住拖动（带中间移动点）
 */
package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"strconv"
	"syscall"
	"time"
	"unsafe"
)

// Linux 32-bit struct input_event:
//   struct timeval time;  /* 8 bytes: sec + usec, each int32 */
//   __u16 type; __u16 code; __s32 value;
type inputEvent struct {
	Time  syscall.Timeval
	Type  uint16
	Code  uint16
	Value int32
}

const (
	evSyn  = 0x00
	evAbs  = 0x03
	synRep = 0x00

	absMTSlot      = 0x2f // 47
	absMTTouchMaj  = 0x30 // 48
	absMTPositionX = 0x35 // 53
	absMTPositionY = 0x36 // 54
	absMTTrackingI = 0x39 // 57

	touchDevice = "/dev/input/event3"

	screenW = 240
	screenH = 320
)

var fd *os.File

func emit(typ, code uint16, val int32) {
	ev := inputEvent{
		Time:  syscall.Timeval{},
		Type:  typ,
		Code:  code,
		Value: val,
	}
	buf := make([]byte, unsafe.Sizeof(ev))
	binary.LittleEndian.PutUint32(buf[0:4], uint32(ev.Time.Sec))
	binary.LittleEndian.PutUint32(buf[4:8], uint32(ev.Time.Usec))
	binary.LittleEndian.PutUint16(buf[8:10], ev.Type)
	binary.LittleEndian.PutUint16(buf[10:12], ev.Code)
	binary.LittleEndian.PutUint32(buf[12:16], uint32(ev.Value))
	if _, err := fd.Write(buf); err != nil {
		fmt.Fprintf(os.Stderr, "write event failed: %v\n", err)
		os.Exit(1)
	}
}

func sync() { emit(evSyn, synRep, 0) }

// beginTouch 按下：分配 slot、分配 tracking id、报坐标
func beginTouch(x, y int32) {
	emit(evAbs, absMTSlot, 0)
	emit(evAbs, absMTTrackingI, 1)
	emit(evAbs, absMTTouchMaj, 8)
	emit(evAbs, absMTPositionX, x)
	emit(evAbs, absMTPositionY, y)
	sync()
}

// moveTo 移动到新坐标（不松手）
func moveTo(x, y int32) {
	emit(evAbs, absMTPositionX, x)
	emit(evAbs, absMTPositionY, y)
	sync()
}

// endTouch 松开：tracking id 置 -1 表示该 slot 抬起
func endTouch() {
	emit(evAbs, absMTTrackingI, -1)
	emit(evAbs, absMTTouchMaj, 0)
	sync()
}

func checkRange(x, y int) {
	if x < 0 || x >= screenW || y < 0 || y >= screenH {
		fmt.Fprintf(os.Stderr, "坐标越界: (%d,%d) 超出 %dx%d\n", x, y, screenW, screenH)
		os.Exit(2)
	}
}

func openTouch() {
	var err error
	fd, err = os.OpenFile(touchDevice, os.O_WRONLY, 0)
	if err != nil {
		fmt.Fprintf(os.Stderr, "打开 %s 失败: %v (需要 root)\n", touchDevice, err)
		os.Exit(1)
	}
}

func atoi(s string) int {
	v, err := strconv.Atoi(s)
	if err != nil {
		fmt.Fprintf(os.Stderr, "非法数字: %q\n", s)
		os.Exit(2)
	}
	return v
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("用法:")
		fmt.Println("  e6_tap tap   <x> <y>")
		fmt.Println("  e6_tap swipe <x1> <y1> <x2> <y2> [ms]")
		fmt.Println("  e6_tap long  <x> <y> [ms]")
		fmt.Println("  e6_tap drag  <x1> <y1> <x2> <y2> [ms]")
		os.Exit(2)
	}
	cmd := os.Args[1]
	openTouch()
	defer fd.Close()

	switch cmd {
	case "tap":
		if len(os.Args) < 4 {
			fmt.Println("用法: e6_tap tap <x> <y>")
			os.Exit(2)
		}
		x, y := atoi(os.Args[2]), atoi(os.Args[3])
		checkRange(x, y)
		beginTouch(int32(x), int32(y))
		time.Sleep(60 * time.Millisecond)
		endTouch()
		time.Sleep(40 * time.Millisecond)
		fmt.Printf("tap %d %d\n", x, y)

	case "long":
		if len(os.Args) < 4 {
			fmt.Println("用法: e6_tap long <x> <y> [ms]")
			os.Exit(2)
		}
		x, y := atoi(os.Args[2]), atoi(os.Args[3])
		dur := 800
		if len(os.Args) > 4 {
			dur = atoi(os.Args[4])
		}
		checkRange(x, y)
		beginTouch(int32(x), int32(y))
		time.Sleep(time.Duration(dur) * time.Millisecond)
		endTouch()
		time.Sleep(40 * time.Millisecond)
		fmt.Printf("long %d %d %dms\n", x, y, dur)

	case "swipe", "drag":
		if len(os.Args) < 6 {
			fmt.Printf("用法: e6_tap %s <x1> <y1> <x2> <y2> [ms]\n", cmd)
			os.Exit(2)
		}
		x1, y1 := atoi(os.Args[2]), atoi(os.Args[3])
		x2, y2 := atoi(os.Args[4]), atoi(os.Args[5])
		dur := 400
		if len(os.Args) > 6 {
			dur = atoi(os.Args[6])
		}
		checkRange(x1, y1)
		checkRange(x2, y2)

		steps := 24
		interval := time.Duration(dur) * time.Millisecond / time.Duration(steps)
		if interval <= 0 {
			interval = time.Millisecond
		}
		beginTouch(int32(x1), int32(y1))
		for i := 1; i <= steps; i++ {
			x := int32(x1 + (x2-x1)*i/steps)
			y := int32(y1 + (y2-y1)*i/steps)
			moveTo(x, y)
			time.Sleep(interval)
		}
		endTouch()
		time.Sleep(40 * time.Millisecond)
		fmt.Printf("%s %d %d -> %d %d (%dms)\n", cmd, x1, y1, x2, y2, dur)

	default:
		fmt.Fprintf(os.Stderr, "未知命令: %s\n", cmd)
		os.Exit(2)
	}
}
