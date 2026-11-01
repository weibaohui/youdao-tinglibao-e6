package main

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
	"unsafe"
)

// Linux DRM ioctl codes for 32-bit ARM (Rockchip RV1106)
const (
	DRM_IOCTL_SET_MASTER        = 0x0000641e
	DRM_IOCTL_DROP_MASTER       = 0x0000641f
	DRM_IOCTL_GET_CRTC          = 0xc06864a1
	DRM_IOCTL_SET_CRTC          = 0xc06864a2
	DRM_IOCTL_MODE_CREATE_DUMB   = 0xc02064b2
	DRM_IOCTL_MODE_MAP_DUMB     = 0xc01064b3
	DRM_IOCTL_MODE_DESTROY_DUMB = 0xc00464b4
	DRM_IOCTL_MODE_ADDFB        = 0xc01c64ae
	DRM_IOCTL_MODE_RMFB         = 0xc00464af
	EVIOCGRAB                   = 0x40044590 // Linux input exclusive grab ioctl
)

type drmModeCreateDumb struct {
	Height uint32
	Width  uint32
	Bpp    uint32
	Flags  uint32
	Handle uint32
	Pitch  uint32
	Size   uint64
}

type drmModeMapDumb struct {
	Handle uint32
	Pad    uint32
	Offset uint64
}

type drmModeAddFb struct {
	FbId   uint32
	Width  uint32
	Height uint32
	Pitch  uint32
	Bpp    uint32
	Depth  uint32
	Handle uint32
}

type drmModeCrtc struct {
	SetConnectorsPtr uint64
	CountConnectors  uint32
	CrtcId           uint32
	FbId             uint32
	X                uint32
	Y                uint32
	GammaSize        uint32
	ModeValid        uint32
	Mode             [68]byte
}

// 8x8 font
var font8x8 = map[rune][8]byte{
	'H': {0x66, 0x66, 0x66, 0x7E, 0x66, 0x66, 0x66, 0x00},
	'E': {0x7E, 0x60, 0x60, 0x7C, 0x60, 0x60, 0x7E, 0x00},
	'L': {0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x7E, 0x00},
	'O': {0x3C, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00},
	'W': {0x63, 0x63, 0x63, 0x6B, 0x7F, 0x77, 0x63, 0x00},
	'R': {0x7C, 0x66, 0x66, 0x7C, 0x6E, 0x67, 0x63, 0x00},
	'D': {0x78, 0x6C, 0x66, 0x66, 0x66, 0x6C, 0x78, 0x00},
	'!': {0x18, 0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x00},
	'Y': {0x66, 0x66, 0x66, 0x3C, 0x18, 0x18, 0x18, 0x00},
	'U': {0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00},
	'A': {0x3C, 0x66, 0x66, 0x7E, 0x66, 0x66, 0x66, 0x00},
	'6': {0x3C, 0x66, 0x60, 0x7C, 0x66, 0x66, 0x3C, 0x00},
	'T': {0x7E, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x00},
	':': {0x00, 0x18, 0x18, 0x00, 0x00, 0x18, 0x18, 0x00},
	' ': {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00},
	'V': {0x66, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x18, 0x00},
	'1': {0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x7E, 0x00},
	'0': {0x3C, 0x66, 0x6E, 0x76, 0x66, 0x66, 0x3C, 0x00},
	'P': {0x7C, 0x66, 0x66, 0x7C, 0x60, 0x60, 0x60, 0x00},
	'X': {0x66, 0x66, 0x3C, 0x18, 0x3C, 0x66, 0x66, 0x00},
	'2': {0x3C, 0x66, 0x06, 0x1C, 0x30, 0x60, 0x7E, 0x00},
	'4': {0x0C, 0x1C, 0x3C, 0x6C, 0x7E, 0x0C, 0x0C, 0x00},
	'3': {0x3C, 0x66, 0x06, 0x1C, 0x06, 0x66, 0x3C, 0x00},
	'5': {0x7E, 0x60, 0x7C, 0x06, 0x06, 0x66, 0x3C, 0x00},
	'7': {0x7E, 0x06, 0x0C, 0x18, 0x30, 0x30, 0x30, 0x00},
	'8': {0x3C, 0x66, 0x66, 0x3C, 0x66, 0x66, 0x3C, 0x00},
	'9': {0x3C, 0x66, 0x66, 0x3E, 0x06, 0x66, 0x3C, 0x00},
	'S': {0x3C, 0x66, 0x60, 0x3C, 0x06, 0x66, 0x3C, 0x00},
	'C': {0x3C, 0x66, 0x60, 0x60, 0x60, 0x66, 0x3C, 0x00},
	'N': {0x66, 0x76, 0x7E, 0x7E, 0x6E, 0x66, 0x66, 0x00},
	'B': {0x7C, 0x66, 0x66, 0x7C, 0x66, 0x66, 0x7C, 0x00},
	'F': {0x7E, 0x60, 0x60, 0x7C, 0x60, 0x60, 0x60, 0x00},
	'M': {0x63, 0x77, 0x7F, 0x6B, 0x63, 0x63, 0x63, 0x00},
	'I': {0x3C, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3C, 0x00},
	'G': {0x3C, 0x66, 0x60, 0x6E, 0x66, 0x66, 0x3C, 0x00},
	'-': {0x00, 0x00, 0x00, 0x7E, 0x00, 0x00, 0x00, 0x00},
	'*': {0x00, 0x66, 0x3C, 0xFF, 0x3C, 0x66, 0x00, 0x00},
	'[': {0x3C, 0x30, 0x30, 0x30, 0x30, 0x30, 0x3C, 0x00},
	']': {0x3C, 0x0C, 0x0C, 0x0C, 0x0C, 0x0C, 0x3C, 0x00},
}

func drawChar(buf []byte, pitch, w, h, x, y int, r rune, scale int, c uint32) {
	bitmap, ok := font8x8[r]
	if !ok {
		bitmap = font8x8[' ']
	}
	for row := 0; row < 8; row++ {
		b := bitmap[row]
		for col := 0; col < 8; col++ {
			if (b & (1 << (7 - col))) != 0 {
				for dy := 0; dy < scale; dy++ {
					for dx := 0; dx < scale; dx++ {
						px := x + col*scale + dx
						py := y + row*scale + dy
						if px >= 0 && px < w && py >= 0 && py < h {
							idx := py*pitch + px*4
							binary.LittleEndian.PutUint32(buf[idx:idx+4], c)
						}
					}
				}
			}
		}
	}
}

func drawString(buf []byte, pitch, w, h, x, y int, str string, scale int, c uint32) {
	for i, r := range str {
		drawChar(buf, pitch, w, h, x+i*8*scale, y, r, scale, c)
	}
}

type Buffer struct {
	Handle uint32
	FbId   uint32
	Pitch  uint32
	Size   uint64
	Mmap   []byte
}

func createBuffer(f *os.File, width, height uint32) (*Buffer, error) {
	createDumb := drmModeCreateDumb{
		Width:  width,
		Height: height,
		Bpp:    32,
	}
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_MODE_CREATE_DUMB), uintptr(unsafe.Pointer(&createDumb)))
	if errno != 0 {
		return nil, fmt.Errorf("create dumb failed: %v", errno)
	}

	addFb := drmModeAddFb{
		Width:  width,
		Height: height,
		Pitch:  createDumb.Pitch,
		Bpp:    32,
		Depth:  24,
		Handle: createDumb.Handle,
	}
	_, _, errno = syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_MODE_ADDFB), uintptr(unsafe.Pointer(&addFb)))
	if errno != 0 {
		return nil, fmt.Errorf("add fb failed: %v", errno)
	}

	mapDumb := drmModeMapDumb{
		Handle: createDumb.Handle,
	}
	_, _, errno = syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_MODE_MAP_DUMB), uintptr(unsafe.Pointer(&mapDumb)))
	if errno != 0 {
		return nil, fmt.Errorf("map dumb failed: %v", errno)
	}

	mmapBuf, err := syscall.Mmap(int(f.Fd()), int64(mapDumb.Offset), int(createDumb.Size), syscall.PROT_READ|syscall.PROT_WRITE, syscall.MAP_SHARED)
	if err != nil {
		return nil, fmt.Errorf("mmap failed: %v", err)
	}

	return &Buffer{
		Handle: createDumb.Handle,
		FbId:   addFb.FbId,
		Pitch:  createDumb.Pitch,
		Size:   createDumb.Size,
		Mmap:   mmapBuf,
	}, nil
}

func destroyBuffer(f *os.File, buf *Buffer) {
	syscall.Munmap(buf.Mmap)
	syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_MODE_RMFB), uintptr(buf.FbId))
	destroyDumb := struct{ Handle uint32 }{Handle: buf.Handle}
	syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_MODE_DESTROY_DUMB), uintptr(unsafe.Pointer(&destroyDumb)))
}

func main() {
	fmt.Println("🚀 启动 60FPS 双缓冲无闪烁原生图形程序 (有道听力宝 E6)...")

	// 1. Open DRM card0
	f, err := os.OpenFile("/dev/dri/card0", os.O_RDWR, 0)
	if err != nil {
		fmt.Printf("无法打开 /dev/dri/card0: %v\n", err)
		return
	}
	defer f.Close()

	syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_SET_MASTER), 0)

	// 2. Query original CRTC
	var crtc drmModeCrtc
	crtc.CrtcId = 66
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_GET_CRTC), uintptr(unsafe.Pointer(&crtc)))
	if errno != 0 {
		fmt.Printf("获取 CRTC 失败: %v\n", errno)
		return
	}

	width := uint32(240)
	height := uint32(320)

	// 3. Create Hardware Double Buffers
	buf0, err := createBuffer(f, width, height)
	if err != nil {
		fmt.Printf("创建 FB0 失败: %v\n", err)
		return
	}
	defer destroyBuffer(f, buf0)

	buf1, err := createBuffer(f, width, height)
	if err != nil {
		fmt.Printf("创建 FB1 失败: %v\n", err)
		return
	}
	defer destroyBuffer(f, buf1)

	// 4. Set initial CRTC
	connectors := [1]uint32{70}
	newCrtc := crtc
	newCrtc.FbId = buf0.FbId
	newCrtc.CountConnectors = 1
	newCrtc.SetConnectorsPtr = uint64(uintptr(unsafe.Pointer(&connectors[0])))
	syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&newCrtc)))

	// 5. Pre-render Static Background Layer
	pitch := int(buf0.Pitch)
	w := int(width)
	h := int(height)
	staticLayer := make([]byte, buf0.Size)

	// Background gradient
	for y := 0; y < h; y++ {
		r := uint32(12 + (y*20)/h)
		g := uint32(24 + (y*50)/h)
		b := uint32(70 + (y*100)/h)
		pixelColor := (r << 16) | (g << 8) | b
		for x := 0; x < w; x++ {
			idx := y*pitch + x*4
			binary.LittleEndian.PutUint32(staticLayer[idx:idx+4], pixelColor)
		}
	}

	// White Card
	cardX1, cardY1 := 12, 20
	cardX2, cardY2 := w-12, h-20
	cardBg := uint32(0xFFFFFF)
	for cy := cardY1; cy < cardY2; cy++ {
		for cx := cardX1; cx < cardX2; cx++ {
			idx := cy*pitch + cx*4
			binary.LittleEndian.PutUint32(staticLayer[idx:idx+4], cardBg)
		}
	}

	// Top Banner
	bannerBg := uint32(0x1B6CA8)
	for cy := cardY1; cy < cardY1+42; cy++ {
		for cx := cardX1; cx < cardX2; cx++ {
			idx := cy*pitch + cx*4
			binary.LittleEndian.PutUint32(staticLayer[idx:idx+4], bannerBg)
		}
	}

	// Static Text Labels
	drawString(staticLayer, pitch, w, h, 24, 32, "* HELLO WORLD *", 2, 0xFFFFFF)
	drawString(staticLayer, pitch, w, h, 40, 75, "YOUDAO E6", 2, 0x1B6CA8)
	drawString(staticLayer, pitch, w, h, 48, 102, "ROOTED!", 2, 0x27AE60)

	drawString(staticLayer, pitch, w, h, 22, 138, "ARM CORTEX-A7 1.2G", 1, 0x333333)
	drawString(staticLayer, pitch, w, h, 28, 158, "240X320 DPI LCD", 1, 0x555555)
	drawString(staticLayer, pitch, w, h, 30, 178, "LINUX 5.10 UCLIBC", 1, 0x777777)
	drawString(staticLayer, pitch, w, h, 32, 198, "60FPS NO FLICKER", 1, 0x2980B9)
	drawString(staticLayer, pitch, w, h, 24, 275, "TAP SCREEN TO EXIT", 1, 0x888888)

	copy(buf0.Mmap, staticLayer)
	copy(buf1.Mmap, staticLayer)

	// 6. Touch Screen Exclusive Grab (EVIOCGRAB)
	// Isolates touch events from miniapp to prevent ghost clicks when returning
	touchChan := make(chan struct{}, 1)
	tsFile, err := os.Open("/dev/input/event3")
	if err == nil {
		defer tsFile.Close()
		// Grab touch screen exclusively
		syscall.Syscall(syscall.SYS_IOCTL, tsFile.Fd(), uintptr(EVIOCGRAB), 1)
		defer syscall.Syscall(syscall.SYS_IOCTL, tsFile.Fd(), uintptr(EVIOCGRAB), 0)

		go func() {
			buf := make([]byte, 64)
			for {
				n, err := tsFile.Read(buf)
				if err != nil {
					return
				}
				if n >= 16 {
					touchChan <- struct{}{}
					return
				}
			}
		}()
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// 7. Smooth 60FPS Animation Loop
	buffers := []*Buffer{buf0, buf1}
	currentBufIdx := 0

	barX := 0
	barDir := 3
	barWidth := 36
	barMinX := cardX1 + 10
	barMaxX := cardX2 - 10 - barWidth

	ticker := time.NewTicker(16 * time.Millisecond) // ~60 FPS
	defer ticker.Stop()

	startTime := time.Now()
	fmt.Println("✅ 界面渲染中：点击屏幕或等待 15 秒返回桌面...")

loop:
	for {
		select {
		case <-sigChan:
			fmt.Println("\n收到退出信号...")
			break loop
		case <-touchChan:
			fmt.Println("\n🎉 检测到屏幕触摸点击！正在安全退出...")
			// Sleep 250ms while still holding EVIOCGRAB so finger lift-off completes
			time.Sleep(250 * time.Millisecond)
			break loop
		case t := <-ticker.C:
			if t.Sub(startTime) > 15*time.Second {
				fmt.Println("\n演示时间到，返回桌面...")
				break loop
			}

			// Render to Back Buffer
			backBuf := buffers[1-currentBufIdx]
			copy(backBuf.Mmap, staticLayer)

			barX += barDir
			if barX > (barMaxX-barMinX) || barX < 0 {
				barDir = -barDir
			}

			barY := 230
			barColor := uint32(0xE74C3C)
			curX := barMinX + barX
			for by := barY; by < barY+10; by++ {
				for bx := curX; bx < curX+barWidth; bx++ {
					idx := by*pitch + bx*4
					binary.LittleEndian.PutUint32(backBuf.Mmap[idx:idx+4], barColor)
				}
			}

			// Swap Buffers via CRTC
			flipCrtc := crtc
			flipCrtc.FbId = backBuf.FbId
			flipCrtc.CountConnectors = 1
			flipCrtc.SetConnectorsPtr = uint64(uintptr(unsafe.Pointer(&connectors[0])))
			syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&flipCrtc)))

			currentBufIdx = 1 - currentBufIdx
		}
	}

	// 8. Restore original screen
	syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&crtc)))
	syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_DROP_MASTER), 0)
	fmt.Println("✅ 原厂系统桌面已恢复！")
}
