/*
 * e6keyed —— 俄罗斯方块物理键守护（E6 专用）
 *
 * 原理：EVIOCGRAB 独占 /dev/input/event2（物理键事件节点），把按键翻译成
 * 动作写入 /tmp/e6keys.buf（每行一个动作），游戏 JS 每 150ms 轮询读取并清空。
 * 抓占期间 prev/home/next/play 不再到达系统（不会误退游戏）；守护退出后
 * 独占自动释放，系统按键恢复正常。
 *
 * 生命周期：由游戏通过 process.exec 拉起；靠 /tmp/e6keys.heartbeat 心跳文件
 * 存活（游戏每 150ms 触碰一次）；心跳停超 12 秒自动退出，还原系统按键。
 *
 * 按键映射（设备树 linux,code 实测）：
 *   158 KEY_BACK(上一首)   → left
 *   159 KEY_FORWARD(下一首) → right
 *   139 KEY_MENU(Home/录音) → rotate
 *   207 KEY_PLAY(播放/暂停) → drop
 *   长按左/右产生 EVKEY repeat(value=2) → 持续左右移动
 */
package main

import (
	"fmt"
	"log"
	"os"
	"syscall"
	"time"
	"unsafe"
)

const (
	bufPath     = "/tmp/e6keys.buf"
	heartPath   = "/tmp/e6keys.heartbeat"
	pidPath     = "/tmp/e6keyed.pid"
	eviocgrab   = 0x40044590
	heartPeriod = 5 * time.Second
	heartStale  = 12 * time.Second
)

type inEvent struct {
	Sec, Usec int32
	Type      uint16
	Code      uint16
	Value     int32
}

func actionFor(code uint16, val int32) string {
	if val == 1 {
		switch code {
		case 158:
			return "left"
		case 159:
			return "right"
		case 139:
			return "rotate"
		case 207:
			return "drop"
		}
	}
	if val == 2 { /* 长按重复：仅左右移动 */
		switch code {
		case 158:
			return "left"
		case 159:
			return "right"
		}
	}
	return ""
}

func anotherInstance() bool {
	pid, err := os.ReadFile(pidPath)
	if err != nil {
		return false
	}
	var p int
	_, _ = fmt.Sscanf(string(pid), "%d", &p)
	if p <= 0 {
		return false
	}
	_, err = os.Stat("/proc/" + itoa(p) + "/cmdline")
	return err == nil
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var b [12]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

func main() {
	log.SetFlags(0)
	/* 自守护化：首次调用（无标记环境变量）时以独立会话重新拉起自己，
	   并把标准流脱离父进程的管道 —— 否则 process.exec 会一直等管道 EOF。
	   子进程设置 E6KEYED_DETACHED=1 后直接跳过本分支。 */
	if os.Getenv("E6KEYED_DETACHED") == "" {
		devnull, err1 := os.OpenFile("/dev/null", os.O_RDWR, 0)
		logf, err2 := os.OpenFile("/tmp/e6keyed.log", os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err1 == nil && err2 == nil {
			attr := &os.ProcAttr{
				Files: []*os.File{devnull, logf, logf},
				Env:   append(os.Environ(), "E6KEYED_DETACHED=1"),
				Sys:   &syscall.SysProcAttr{Setsid: true},
			}
			proc, err := os.StartProcess(os.Args[0], os.Args, attr)
			if err == nil {
				proc.Release()
				os.Exit(0)
			}
			log.Println("detach fail:", err)
		}
		log.Println("fallthrough without detach:", err1, err2)
	}
	if anotherInstance() {
		log.Println("already running, exit")
		return
	}
	_ = os.WriteFile(pidPath, []byte(itoa(os.Getpid())), 0644)
	defer os.Remove(pidPath)

	f, err := os.OpenFile("/dev/input/event2", os.O_RDONLY, 0)
	if err != nil {
		log.Println("open event2:", err)
		return
	}
	defer f.Close()

	/* 独占抓取：守护存活期间，物理键只属于游戏 */
	const sysIoctl = 183 /* SYS_IOCTL arm */
	ret, _, eno := syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), eviocgrab, 1)
	if int64(ret) == -1 {
		log.Println("EVIOCGRAB EBUSY? errno=", eno, "（降级为共享读取：系统仍会响应这些键）")
	} else {
		log.Println("grabbed event2")
	}

	bufF, err := os.OpenFile(bufPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Println("open buf:", err)
		return
	}
	defer bufF.Close()

	_ = os.WriteFile(heartPath, []byte("1"), 0644)
	start := time.Now()
	go func() {
		for {
			time.Sleep(2 * time.Second)
			st, err := os.Stat(heartPath)
			/* 心跳只由游戏轮询写（守护启动时写一次初值）：
			   游戏 150ms 一轮，停更 12 秒 = 游戏已退出 → 守护自退 */
			if err != nil || time.Since(st.ModTime()) > heartStale {
				if time.Since(start) > heartStale {
					log.Println("no game heartbeat, exit")
					os.Exit(0)
				}
			}
		}
	}()

	ev := inEvent{}
	evb := (*[16]byte)(unsafe.Pointer(&ev))[:]
	for {
		n, err := f.Read(evb)
		if err != nil || n != 16 {
			continue
		}
		if ev.Type == 1 { /* EV_KEY */
			act := actionFor(ev.Code, ev.Value)
			if act != "" {
				bufF.WriteString(act + "\n")
			}
		}
	}
}
