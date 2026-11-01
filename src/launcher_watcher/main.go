package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const (
	IN_ACCESS = 0x00000001
	IN_OPEN   = 0x00000020
	IN_ISDIR  = 0x40000000
)

func main() {
	watchDir := "/userdisk/secondary/miniapp/data/mini_app/pkg/8888888888888888/a"
	fmt.Printf("🔍 启动独立图标监听器，目标目录: %s\n", watchDir)

	fd, err := syscall.InotifyInit()
	if err != nil {
		fmt.Printf("InotifyInit err: %v\n", err)
		return
	}
	defer syscall.Close(fd)

	wd, err := syscall.InotifyAddWatch(fd, watchDir, IN_OPEN|IN_ACCESS)
	if err != nil {
		fmt.Printf("InotifyAddWatch err: %v\n", err)
		return
	}
	defer syscall.InotifyRmWatch(fd, uint32(wd))

	fmt.Println("✅ 独立应用【Hello World】监听器就绪！等待屏幕点击...")

	buf := make([]byte, 4096)
	var lastTrigger time.Time

	for {
		n, err := syscall.Read(fd, buf)
		if err != nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		if n > 0 && time.Since(lastTrigger) > 5*time.Second {
			lastTrigger = time.Now()
			fmt.Println("\n🎉 点击了【Hello World】图标！立即切换到 DRM 原生彩色画面...")

			// 1. Pause miniapp to yield DRM card0
			exec.Command("killall", "-STOP", "miniapp").Run()
			time.Sleep(100 * time.Millisecond)

			// 2. Run our DRM graphical program
			cmd := exec.Command("/userdisk/hello_screen")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			cmd.Run()

			// 3. Settle delay to ensure touch release is completely done
			time.Sleep(300 * time.Millisecond)

			// 4. Resume miniapp to restore desktop
			exec.Command("killall", "-CONT", "miniapp").Run()
			fmt.Println("✅ 演示结束，桌面恢复。等待下一次点击...")
		}
	}
}
