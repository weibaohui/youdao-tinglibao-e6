/*
 * e6_vplay —— 有道听力宝 E6 硬件级高性能音视频播放器
 *
 * 智能交互与防误触体系 (Smart Touch & Palm Rejection)：
 * 1. 物理音量键防误触保护 (Volume Key Protection)：
 *    监听 /dev/input/event2 (gpio-keys)，当用户按侧边音量+/音量-键时，
 *    自动锁定 1.5 秒防误触保护期，屏蔽握持或侧边施力挤压屏幕边缘导致的误退。
 * 2. 屏幕边缘掌压与握持过滤 (Palm & Edge Rejection)：
 *    过滤 X < 35 或 X > 205 的边缘握持区域，仅响应屏幕中央的明确意图点击。
 * 3. 异步中断解耦 (Instant Teardown)：
 *    触发退出时立即杀掉 ffmpeg，管道瞬间 EOF，全套 DRM 双缓冲与 Master 干净回收。
 */
package main

import (
	"crypto/tls"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"
)

const (
	drmCard    = "/dev/dri/card0"
	tsDevice   = "/dev/input/event3" // hyn_ts
	keysDevice = "/dev/input/event2" // gpio-keys (volume keys)
	ffmpegBin  = "/usr/bin/ffmpeg"
	pidFile    = "/userdisk/e6_vplay.pid"
	fw         = 240
	fh         = 320
	uaDesktop  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

// Linux DRM ioctl codes for 32-bit ARM (Rockchip RV1106)
const (
	DRM_IOCTL_SET_MASTER        = 0x0000641e
	DRM_IOCTL_DROP_MASTER       = 0x0000641f
	DRM_IOCTL_GET_CRTC          = 0xc06864a1
	DRM_IOCTL_SET_CRTC          = 0xc06864a2
	DRM_IOCTL_MODE_CREATE_DUMB  = 0xc02064b2
	DRM_IOCTL_MODE_MAP_DUMB     = 0xc01064b3
	DRM_IOCTL_MODE_DESTROY_DUMB = 0xc00464b4
	DRM_IOCTL_MODE_ADDFB        = 0xc01c64ae
	DRM_IOCTL_MODE_RMFB         = 0xc00464af
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

type DumbBuffer struct {
	Handle uint32
	FbId   uint32
	Pitch  uint32
	Size   uint64
	Mmap   []byte
}

var (
	flagBVID     = flag.String("bvid", "", "B 站 BV 号")
	flagCID      = flag.String("cid", "", "cid（可选）")
	flagVideoURL = flag.String("video-url", "", "DASH 视频流 URL")
	flagAudioURL = flag.String("audio-url", "", "DASH 音频流 URL")
	flagFPS      = flag.Int("fps", 20, "目标帧率 (默认 20fps)")
	flagMaxSec   = flag.Int("max-sec", 1800, "最长播放秒数")
	flagFit      = flag.String("fit", "fit", "缩放方式：fit(保持比例留黑边) / cover(裁切填满)")
	flagVol      = flag.Float64("vol", -1.0, "播放音量 (0.0 - 1.0，默认 -1 读取系统音量配置)")
	flagMute     = flag.Bool("mute", false, "静音模式")
)

func logf(format string, a ...interface{}) {
	fmt.Printf("[e6_vplay] "+format+"\n", a...)
}

func needsReferer(u string) bool {
	if strings.Contains(u, "mcdn.bilivideo.cn") || strings.Contains(u, ":8082/") {
		return false
	}
	return true
}

/* ---------------------------------------------------------------- B 站接口解析（备用） */

type apiResp struct {
	Code int    `json:"code"`
	Msg  string `json:"message"`
	Data struct {
		Cid  int64 `json:"cid"`
		Dash struct {
			Video []struct {
				ID        int64    `json:"id"`
				Codecs    string   `json:"codecs"`
				BaseURL   string   `json:"baseUrl"`
				BackupURL []string `json:"backupUrl"`
			} `json:"video"`
			Audio []struct {
				ID        int64    `json:"id"`
				BaseURL   string   `json:"baseUrl"`
				BackupURL []string `json:"backupUrl"`
			} `json:"audio"`
		} `json:"dash"`
	} `json:"data"`
}

func pickBestMediaURL(baseURL string, backupURLs []string) string {
	candidates := append([]string{baseURL}, backupURLs...)
	for _, u := range candidates {
		if u != "" && !strings.Contains(u, "mcdn.bilivideo") && !strings.Contains(u, ":8082") {
			return u
		}
	}
	if baseURL != "" {
		return baseURL
	}
	if len(backupURLs) > 0 {
		return backupURLs[0]
	}
	return ""
}

func insecureTLS() *tls.Config {
	return &tls.Config{InsecureSkipVerify: true}
}

func resolveBilibiliStream(bvid, cid string) (vURL, aURL string, err error) {
	client := &http.Client{
		Timeout:   10 * time.Second,
		Transport: &http.Transport{TLSClientConfig: insecureTLS()},
	}
	reqH := http.Header{}
	reqH.Set("User-Agent", uaDesktop)
	reqH.Set("Referer", "https://www.bilibili.com/")
	reqH.Set("Origin", "https://www.bilibili.com")
	reqH.Set("Accept-Encoding", "identity")

	resp, err := client.Get("https://api.bilibili.com/x/frontend/finger/spi")
	if err == nil {
		var spi struct {
			Data struct {
				B3 string `json:"b_3"`
				B4 string `json:"b_4"`
			} `json:"data"`
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if json.Unmarshal(b, &spi) == nil && spi.Data.B3 != "" {
			reqH.Set("Cookie", "buvid3="+spi.Data.B3+"; buvid4="+spi.Data.B4)
		}
	}

	if cid == "" {
		req, _ := http.NewRequest("GET", "https://api.bilibili.com/x/web-interface/view?bvid="+bvid, nil)
		req.Header = reqH
		r, err := client.Do(req)
		if err != nil {
			return "", "", fmt.Errorf("view: %w", err)
		}
		var v apiResp
		body, _ := io.ReadAll(r.Body)
		r.Body.Close()
		json.Unmarshal(body, &v)
		if v.Code != 0 || v.Data.Cid == 0 {
			return "", "", fmt.Errorf("view failed: %d %s", v.Code, v.Msg)
		}
		cid = strconv.FormatInt(v.Data.Cid, 10)
	}

	u := fmt.Sprintf("https://api.bilibili.com/x/player/playurl?bvid=%s&cid=%s&fnval=16&fourk=1", bvid, cid)
	req, _ := http.NewRequest("GET", u, nil)
	req.Header = reqH
	r, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("playurl: %w", err)
	}
	var p apiResp
	body, _ := io.ReadAll(r.Body)
	r.Body.Close()
	json.Unmarshal(body, &p)
	if p.Code != 0 {
		return "", "", fmt.Errorf("playurl error: %d %s", p.Code, p.Msg)
	}

	var bestV string
	for _, v := range p.Data.Dash.Video {
		if strings.HasPrefix(v.Codecs, "avc1") {
			if v.ID == 16 || bestV == "" {
				bestV = pickBestMediaURL(v.BaseURL, v.BackupURL)
				if v.ID == 16 {
					break
				}
			}
		}
	}
	if bestV == "" && len(p.Data.Dash.Video) > 0 {
		lastV := p.Data.Dash.Video[len(p.Data.Dash.Video)-1]
		bestV = pickBestMediaURL(lastV.BaseURL, lastV.BackupURL)
	}

	var bestA string
	for _, a := range p.Data.Dash.Audio {
		if a.ID == 30216 || bestA == "" {
			bestA = pickBestMediaURL(a.BaseURL, a.BackupURL)
			if a.ID == 30216 {
				break
			}
		}
	}
	if bestA == "" && len(p.Data.Dash.Audio) > 0 {
		firstA := p.Data.Dash.Audio[0]
		bestA = pickBestMediaURL(firstA.BaseURL, firstA.BackupURL)
	}

	return bestV, bestA, nil
}

/* ---------------------------------------------------------------- DRM 原生显示与资源销毁 (Dispose) */

func createDumbBuffer(f *os.File, width, height uint32) (*DumbBuffer, error) {
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

	return &DumbBuffer{
		Handle: createDumb.Handle,
		FbId:   addFb.FbId,
		Pitch:  createDumb.Pitch,
		Size:   createDumb.Size,
		Mmap:   mmapBuf,
	}, nil
}

func destroyDumbBuffer(f *os.File, buf *DumbBuffer) {
	if buf == nil {
		return
	}
	if buf.Mmap != nil {
		syscall.Munmap(buf.Mmap)
		buf.Mmap = nil
	}
	if buf.FbId != 0 {
		syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_MODE_RMFB), uintptr(buf.FbId))
	}
	if buf.Handle != 0 {
		destroyDumb := struct{ Handle uint32 }{Handle: buf.Handle}
		syscall.Syscall(syscall.SYS_IOCTL, f.Fd(), uintptr(DRM_IOCTL_MODE_DESTROY_DUMB), uintptr(unsafe.Pointer(&destroyDumb)))
	}
}

/* ---------------------------------------------------------------- 清理历史孤儿进程 */

func cleanupProcesses() {
	b, err := os.ReadFile(pidFile)
	if err == nil {
		oldPid, err := strconv.Atoi(strings.TrimSpace(string(b)))
		if err == nil && oldPid != os.Getpid() {
			syscall.Kill(oldPid, syscall.SIGTERM)
			time.Sleep(80 * time.Millisecond)
			syscall.Kill(oldPid, syscall.SIGKILL)
			logf("停止旧播放器 pid=%d", oldPid)
		}
		os.Remove(pidFile)
	}
	exec.Command("sh", "-c", "killall hal-drmshow 2>/dev/null; killall ffmpeg 2>/dev/null || true").Run()
	time.Sleep(50 * time.Millisecond)

	out, err := exec.Command("sh", "-c", "ls -l /proc/*/fd/* 2>/dev/null | grep /dev/snd/pcmC0D0p").Output()
	if err == nil && len(out) > 0 {
		for _, line := range strings.Split(string(out), "\n") {
			if strings.Contains(line, "/proc/") {
				parts := strings.Split(line, "/")
				if len(parts) >= 3 {
					if pid, err := strconv.Atoi(parts[2]); err == nil && pid > 1 {
						syscall.Kill(pid, syscall.SIGKILL)
						logf("释放占用的声卡进程 pid=%d", pid)
					}
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
}

/* ---------------------------------------------------------------- 系统音量与 ALSA Softvol 状态控制 */

const sysConfigFile = "/userdata/cfg/sys_config.conf"

func getSystemSpkVolume() int {
	data, err := os.ReadFile(sysConfigFile)
	if err != nil {
		return 20 // 默认 20% 温和音量
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "spk_volume=") {
			valStr := strings.TrimPrefix(line, "spk_volume=")
			if v, err := strconv.Atoi(valStr); err == nil {
				if v < 0 {
					return 0
				}
				if v > 100 {
					return 100
				}
				return v
			}
		}
	}
	return 20
}

func saveSystemSpkVolume(vol int) {
	if vol < 0 {
		vol = 0
	} else if vol > 100 {
		vol = 100
	}
	data, err := os.ReadFile(sysConfigFile)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	found := false
	for i, line := range lines {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "spk_volume=") {
			lines[i] = fmt.Sprintf("spk_volume=%d", vol)
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, fmt.Sprintf("spk_volume=%d", vol))
	}
	os.WriteFile(sysConfigFile, []byte(strings.Join(lines, "\n")), 0o644)
}

func setSystemVolume(volPercent int) {
	if volPercent < 0 {
		volPercent = 0
	} else if volPercent > 100 {
		volPercent = 100
	}
	if volPercent == 0 {
		exec.Command("tinymix", "-D", "0", "set", "4", "0").Run() // 彻底静音，关闭喇叭功放
		exec.Command("tinymix", "-D", "0", "set", "29", "0").Run()
		exec.Command("tinymix", "-D", "0", "set", "31", "0", "0").Run()
	} else {
		exec.Command("tinymix", "-D", "0", "set", "4", "1").Run() // 开启功放
		// 1. 设置真实硬件 DAC LINEOUT 音量 (Control 29: range 0..30)
		// 最高限制到 24/30，留足模拟动态余量，绝不破音或炸音
		lineoutVal := (volPercent * 24) / 100
		if lineoutVal < 1 {
			lineoutVal = 1
		}
		// 2. 设置 Master Playback Volume (Control 31: range 0..255)
		masterVal := (volPercent * 180) / 100
		exec.Command("tinymix", "-D", "0", "set", "29", strconv.Itoa(lineoutVal)).Run()
		exec.Command("tinymix", "-D", "0", "set", "31", strconv.Itoa(masterVal), strconv.Itoa(masterVal)).Run()
	}

	// 3. 持久化写回系统配置文件
	saveSystemSpkVolume(volPercent)
}

func drawBackButton(buf []byte) {
	// 绘制左上角半透明返回胶囊背景 (x: 8..52, y: 8..30)
	for y := 8; y <= 30; y++ {
		rowOffset := y * fw * 4
		for x := 8; x <= 52; x++ {
			p := rowOffset + x*4
			buf[p] = buf[p] / 2
			buf[p+1] = buf[p+1] / 2
			buf[p+2] = buf[p+2] / 2
		}
	}
	// 绘制白色 "<" 箭头 (中心点在 x=20, y=19)
	for d := 0; d <= 6; d++ {
		y1 := 19 - d
		y2 := 19 + d
		x := 20 + d
		for w := 0; w < 2; w++ {
			if y1 >= 8 && x+w <= 52 {
				p1 := (y1*fw + x + w) * 4
				buf[p1] = 0xff
				buf[p1+1] = 0xff
				buf[p1+2] = 0xff
			}
			if y2 <= 30 && x+w <= 52 {
				p2 := (y2*fw + x + w) * 4
				buf[p2] = 0xff
				buf[p2+1] = 0xff
				buf[p2+2] = 0xff
			}
		}
	}
	// 绘制白色小横线 (x: 30..46, y: 17..18, y: 21..22)
	for x := 30; x <= 46; x++ {
		p1 := (17*fw + x) * 4
		buf[p1] = 0xee
		buf[p1+1] = 0xee
		buf[p1+2] = 0xee
		p2 := (21*fw + x) * 4
		buf[p2] = 0xee
		buf[p2+1] = 0xee
		buf[p2+2] = 0xee
	}
}

func drawPauseOverlay(buf []byte) {
	// 屏幕中央半透明暗框 (x: 75..165, y: 120..200)
	for y := 120; y <= 200; y++ {
		rowOffset := y * fw * 4
		for x := 75; x <= 165; x++ {
			p := rowOffset + x*4
			buf[p] = buf[p] / 4
			buf[p+1] = buf[p+1] / 4
			buf[p+2] = buf[p+2] / 4
			if y == 120 || y == 200 || x == 75 || x == 165 {
				buf[p] = 0xaa
				buf[p+1] = 0xaa
				buf[p+2] = 0xaa
			}
		}
	}
	// 两根 B 站粉色竖条 (BGR: 0x99, 0x72, 0xFB)
	// 竖条 1: x: 96..108, y: 138..182
	// 竖条 2: x: 132..144, y: 138..182
	for y := 138; y <= 182; y++ {
		rowOffset := y * fw * 4
		for x := 96; x <= 108; x++ {
			p := rowOffset + x*4
			buf[p] = 0x99
			buf[p+1] = 0x72
			buf[p+2] = 0xFB
		}
		for x := 132; x <= 144; x++ {
			p := rowOffset + x*4
			buf[p] = 0x99
			buf[p+1] = 0x72
			buf[p+2] = 0xFB
		}
	}
}

func drawPlayIndicator(buf []byte) {
	// 屏幕中央半透明暗框 (x: 85..155, y: 130..190)
	for y := 130; y <= 190; y++ {
		rowOffset := y * fw * 4
		for x := 85; x <= 155; x++ {
			p := rowOffset + x*4
			buf[p] = buf[p] / 3
			buf[p+1] = buf[p+1] / 3
			buf[p+2] = buf[p+2] / 3
		}
	}
	// 绘制粉色播放三角 ▶ (中心点在 120, 160)
	for y := 145; y <= 175; y++ {
		dy := y - 160
		if dy < 0 {
			dy = -dy
		}
		maxX := 135 - dy
		rowOffset := y * fw * 4
		for x := 105; x <= maxX; x++ {
			p := rowOffset + x*4
			buf[p] = 0x99
			buf[p+1] = 0x72
			buf[p+2] = 0xFB
		}
	}
}

func drawOSD(buf []byte, volIdx int) {
	const (
		startX = 40
		endX   = 200
		startY = 14
		endY   = 24
	)
	if volIdx < 0 {
		volIdx = 0
	} else if volIdx > 10 {
		volIdx = 10
	}
	filledW := ((endX - startX) * volIdx) / 10

	for y := startY; y <= endY; y++ {
		rowOffset := y * fw * 4
		for x := startX; x <= endX; x++ {
			pixelOffset := rowOffset + x*4
			if y == startY || y == endY || x == startX || x == endX {
				// 边框：浅灰
				buf[pixelOffset] = 0x88
				buf[pixelOffset+1] = 0x88
				buf[pixelOffset+2] = 0x88
			} else if x <= startX+filledW {
				// 进度条：B 站粉色 (R: 0xFB, G: 0x72, B: 0x99)
				buf[pixelOffset] = 0x99
				buf[pixelOffset+1] = 0x72
				buf[pixelOffset+2] = 0xFB
			} else {
				// 背景：深灰
				buf[pixelOffset] = 0x22
				buf[pixelOffset+1] = 0x22
				buf[pixelOffset+2] = 0x22
			}
		}
	}
}

func main() {
	flag.Parse()

	videoURL := *flagVideoURL
	audioURL := *flagAudioURL

	if videoURL == "" && *flagBVID != "" {
		var err error
		logf("从 B 站解析流地址 BV=%s ...", *flagBVID)
		videoURL, audioURL, err = resolveBilibiliStream(*flagBVID, *flagCID)
		if err != nil {
			fmt.Fprintf(os.Stderr, "解析失败: %v\n", err)
			os.Exit(1)
		}
	}

	if videoURL == "" {
		fmt.Println("用法: e6_vplay --video-url <url> [--audio-url <url>] [--vol 0.15] [--fps 20]")
		os.Exit(2)
	}

	cleanupProcesses()
	os.WriteFile(pidFile, []byte(strconv.Itoa(os.Getpid())), 0o644)
	defer os.Remove(pidFile)

	// 1. 初始化 DRM KMS
	drmFile, err := os.OpenFile(drmCard, os.O_RDWR, 0)
	if err != nil {
		fmt.Fprintf(os.Stderr, "打开 DRM %s 失败: %v\n", drmCard, err)
		os.Exit(1)
	}
	defer drmFile.Close()

	syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_SET_MASTER), 0)

	// 2. 读取原始桌面 CRTC
	var origCrtc drmModeCrtc
	origCrtc.CrtcId = 66
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_GET_CRTC), uintptr(unsafe.Pointer(&origCrtc)))
	if errno != 0 {
		fmt.Fprintf(os.Stderr, "获取 CRTC 失败: %v\n", errno)
		os.Exit(1)
	}

	// 3. 创建硬件双 Dumb Buffer
	buf0, err := createDumbBuffer(drmFile, fw, fh)
	if err != nil {
		time.Sleep(150 * time.Millisecond)
		buf0, err = createDumbBuffer(drmFile, fw, fh)
		if err != nil {
			fmt.Fprintf(os.Stderr, "创建 FB0 失败: %v\n", err)
			return
		}
	}
	defer destroyDumbBuffer(drmFile, buf0)

	buf1, err := createDumbBuffer(drmFile, fw, fh)
	if err != nil {
		time.Sleep(150 * time.Millisecond)
		buf1, err = createDumbBuffer(drmFile, fw, fh)
		if err != nil {
			fmt.Fprintf(os.Stderr, "创建 FB1 失败: %v\n", err)
			return
		}
	}
	defer destroyDumbBuffer(drmFile, buf1)

	for i := range buf0.Mmap {
		buf0.Mmap[i] = 0
	}
	for i := range buf1.Mmap {
		buf1.Mmap[i] = 0
	}

	connectors := [1]uint32{70}
	currentCrtc := origCrtc
	currentCrtc.FbId = buf0.FbId
	currentCrtc.CountConnectors = 1
	currentCrtc.SetConnectorsPtr = uint64(uintptr(unsafe.Pointer(&connectors[0])))
	syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&currentCrtc)))

	defer func() {
		syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&origCrtc)))
		syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_DROP_MASTER), 0)
		logf("已完整回收显存与 DRM Master，恢复系统桌面")
	}()

	// 4. 音量键与触屏防误触监听系统
	sysVol := getSystemSpkVolume()
	var curVolPercent int = sysVol
	if *flagMute {
		curVolPercent = 0
	} else if *flagVol >= 0.0 && *flagVol <= 1.0 {
		curVolPercent = int(*flagVol*100 + 0.5)
	}

	if curVolPercent < 0 {
		curVolPercent = 0
	} else if curVolPercent > 100 {
		curVolPercent = 100
	}

	// 离散为 0..10 档位
	var curVolLevel int32 = int32((curVolPercent + 5) / 10)
	if curVolLevel < 0 {
		curVolLevel = 0
	} else if curVolLevel > 10 {
		curVolLevel = 10
	}
	var osdUntilNano int64

	// 初始化真实硬件 DAC LINEOUT 音量，严格遵照系统配置，绝不炸音
	initVol := int(curVolLevel * 10)
	setSystemVolume(initVol)
	logf("初始化音量: 系统配置=%d%%, 实际应用=%d%% (DAC LINEOUT val=%d/30, mute=%v)",
		sysVol, initVol, (initVol*30)/100, *flagMute)

	// 退出时保存最后调整的音量，并恢复系统音量
	defer func() {
		finalVol := int(atomic.LoadInt32(&curVolLevel) * 10)
		setSystemVolume(finalVol)
		logf("退出播放器: 已恢复系统音量 %d%%", finalVol)
	}()

	// 共享原子时间戳：在音量键按下后 1.5 秒内，强行屏蔽任何触屏判定
	var suppressTouchUntilNano int64
	startTime := time.Now()
	// 起播前 2 秒为启动保护期，防止从列表点击进入时的残留抬手触发退出
	initialGrace := startTime.Add(2 * time.Second).UnixNano()
	atomic.StoreInt64(&suppressTouchUntilNano, initialGrace)

	touchChan := make(chan struct{}, 1)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// 5. 提前组装 FFmpeg 统一解码与音画同步管线
	var args []string
	args = append(args, "-y", "-hide_banner", "-loglevel", "error", "-tls_verify", "0")

	if needsReferer(videoURL) {
		args = append(args, "-headers", "Referer: https://www.bilibili.com/\r\nUser-Agent: "+uaDesktop+"\r\n")
	}
	args = append(args, "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "2", "-i", videoURL)

	hasAudio := audioURL != ""
	if hasAudio {
		if needsReferer(audioURL) {
			args = append(args, "-headers", "Referer: https://www.bilibili.com/\r\nUser-Agent: "+uaDesktop+"\r\n")
		}
		args = append(args, "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "2", "-i", audioURL)
	}

	vf := fmt.Sprintf("fps=%d,scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:black,setsar=1", *flagFPS, fw, fh, fw, fh)
	if *flagFit == "cover" {
		vf = fmt.Sprintf("fps=%d,scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1", *flagFPS, fw, fh, fw, fh)
	}
	args = append(args, "-map", "0:v", "-vf", vf, "-pix_fmt", "bgr0", "-f", "rawvideo", "-")

	if hasAudio && !*flagMute {
		args = append(args, "-map", "1:a", "-af", "volume=0.20", "-ac", "2", "-ar", "48000", "-f", "alsa", "hw:0,0")
	} else {
		args = append(args, "-an")
	}

	logf("启动 ffmpeg 音画同步管线 (fps=%d, 初始等级=%d/10)...", *flagFPS, curVolLevel)
	cmd := exec.Command(ffmpegBin, args...)
	cmd.Stderr = os.Stderr
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "创建视频管道失败: %v\n", err)
		return
	}

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "启动解码器失败: %v\n", err)
		return
	}

	// 播放控制状态变量 (方案 A: 轻触中央暂停/继续，轻触左上角退出)
	var isPaused int32 = 0
	var playIndicatorUntilNano int64 = 0

	// 监听物理按键 (/dev/input/event2 - gpio-keys)
	go func() {
		kf, err := os.Open(keysDevice)
		if err != nil {
			logf("打开按键设备 %s 失败: %v", keysDevice, err)
			return
		}
		defer kf.Close()

		// 独占 gpio-keys 设备，彻底阻止 miniapp 捕获音量键并弹出系统 Toast 抢占 DRM 画面导致屏幕跳动
		const EVIOCGRAB = 0x40044590
		_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, kf.Fd(), uintptr(EVIOCGRAB), 1)
		if errno != 0 {
			logf("警告: EVIOCGRAB 独占按键失败 errno=%v", errno)
		} else {
			logf("成功独占物理按键设备 %s (屏蔽系统 Toast 干扰)", keysDevice)
			defer syscall.Syscall(syscall.SYS_IOCTL, kf.Fd(), uintptr(EVIOCGRAB), 0)
		}

		const evSize = 16
		kbuf := make([]byte, evSize*4)
		for {
			n, err := kf.Read(kbuf)
			if err != nil {
				return
			}
			for i := 0; i+evSize <= n; i += evSize {
				typ := binary.LittleEndian.Uint16(kbuf[i+8 : i+10])
				code := binary.LittleEndian.Uint16(kbuf[i+10 : i+12])
				val := int32(binary.LittleEndian.Uint32(kbuf[i+12 : i+16]))
				if typ == 1 { // EV_KEY
					if code == 115 && val == 1 { // KEY_VOLUMEUP
						v := atomic.AddInt32(&curVolLevel, 1)
						if v > 10 {
							atomic.StoreInt32(&curVolLevel, 10)
							v = 10
						}
						go setSystemVolume(int(v * 10))
						atomic.StoreInt64(&osdUntilNano, time.Now().Add(1800*time.Millisecond).UnixNano())
						logf("音量调大 -> 等级 %d/10 (%d%%, DAC val=%d/30)", v, v*10, (int(v)*10*30)/100)

						lockUntil := time.Now().Add(1500 * time.Millisecond).UnixNano()
						atomic.StoreInt64(&suppressTouchUntilNano, lockUntil)
					} else if code == 114 && val == 1 { // KEY_VOLUMEDOWN
						v := atomic.AddInt32(&curVolLevel, -1)
						if v < 0 {
							atomic.StoreInt32(&curVolLevel, 0)
							v = 0
						}
						go setSystemVolume(int(v * 10))
						atomic.StoreInt64(&osdUntilNano, time.Now().Add(1800*time.Millisecond).UnixNano())
						logf("音量调小 -> 等级 %d/10 (%d%%, DAC val=%d/30)", v, v*10, (int(v)*10*30)/100)

						lockUntil := time.Now().Add(1500 * time.Millisecond).UnixNano()
						atomic.StoreInt64(&suppressTouchUntilNano, lockUntil)
					} else if (code == 114 || code == 115 || code == 207) && val == 0 { // 按键抬起
						lockUntil := time.Now().Add(1000 * time.Millisecond).UnixNano()
						atomic.StoreInt64(&suppressTouchUntilNano, lockUntil)
					} else if code == 158 && val == 1 { // KEY_BACK
						logf("检测到物理返回键 (KEY_BACK) -> 触发退出")
						select {
						case touchChan <- struct{}{}:
						default:
						}
						return
					}
				}
			}
		}
	}()

	// 监听触屏 (/dev/input/event3 - hyn_ts)，带掌压与边缘握持过滤
	go func() {
		tsFile, err := os.Open(tsDevice)
		if err != nil {
			logf("打开触屏设备 %s 失败: %v", tsDevice, err)
			return
		}
		defer tsFile.Close()

		const evSize = 16
		buf := make([]byte, evSize*8)
		var curX, curY int32 = -1, -1
		var isFingerDown bool = false
		var newDownInThisFrame bool = false

		for {
			n, err := tsFile.Read(buf)
			if err != nil {
				return
			}

			for i := 0; i+evSize <= n; i += evSize {
				typ := binary.LittleEndian.Uint16(buf[i+8 : i+10])
				code := binary.LittleEndian.Uint16(buf[i+10 : i+12])
				val := int32(binary.LittleEndian.Uint32(buf[i+12 : i+16]))

				if typ == 3 { // EV_ABS
					if code == 53 { // ABS_MT_POSITION_X
						curX = val
					} else if code == 54 { // ABS_MT_POSITION_Y
						curY = val
					} else if code == 57 { // ABS_MT_TRACKING_ID
						if val >= 0 {
							isFingerDown = true
							newDownInThisFrame = true
						} else {
							isFingerDown = false
							newDownInThisFrame = false
						}
					}
				} else if typ == 0 && code == 0 { // EV_SYN / SYN_REPORT
					if newDownInThisFrame && isFingerDown {
						newDownInThisFrame = false

						suppressUntil := atomic.LoadInt64(&suppressTouchUntilNano)
						now := time.Now().UnixNano()
						if now < suppressUntil {
							logf("防误触保护期内 (剩余 %d ms)，忽略触屏 (x=%d, y=%d)", (suppressUntil-now)/1e6, curX, curY)
							continue
						}

						// 1. 点击左上角返回区域 (x <= 70 && y <= 60) -> 退出播放返回列表
						if curX <= 70 && curY <= 60 {
							logf("点击左上角返回按钮 (x=%d, y=%d) -> 触发退出", curX, curY)
							select {
							case touchChan <- struct{}{}:
							default:
							}
							return
						}

						// 2. 屏幕边缘掌压与握持过滤：左右保留 35px 余量，上下保留 35px 余量
						if curX < 35 || curX > 205 || curY < 35 || curY > 285 {
							logf("过滤边缘/握持触摸 (x=%d, y=%d)，忽略", curX, curY)
							continue
						}

						// 3. 点击屏幕中央核心区域 -> 切换 暂停 / 继续 (方案 A)
						if atomic.LoadInt32(&isPaused) == 0 {
							atomic.StoreInt32(&isPaused, 1)
							if cmd != nil && cmd.Process != nil {
								syscall.Kill(cmd.Process.Pid, syscall.SIGSTOP)
							}
							logf("▶ 点击屏幕中央 -> 暂停播放 (PAUSE)")
						} else {
							atomic.StoreInt32(&isPaused, 0)
							if cmd != nil && cmd.Process != nil {
								syscall.Kill(cmd.Process.Pid, syscall.SIGCONT)
							}
							atomic.StoreInt64(&playIndicatorUntilNano, time.Now().Add(600*time.Millisecond).UnixNano())
							logf("▶ 点击屏幕中央 -> 继续播放 (RESUME)")
						}
					}
				}
			}
		}
	}()

	exitDone := make(chan struct{})
	go func() {
		select {
		case <-sigChan:
			logf("收到终止信号 -> 停止子进程")
		case <-touchChan:
			logf("退出信号命中 -> 停止子进程")
		case <-exitDone:
			return
		}
		if cmd.Process != nil {
			cmd.Process.Kill()
		}
	}()

	defer func() {
		close(exitDone)
		if cmd.Process != nil {
			cmd.Process.Kill()
			cmd.Wait()
		}
	}()

	// 6. 主渲染循环
	buffers := []*DumbBuffer{buf0, buf1}
	currentBufIdx := 0
	frameBytes := fw * fh * 4
	frameCount := 0
	deadline := time.Now().Add(time.Duration(*flagMaxSec) * time.Second)

	logf("▶ 画面正在渲染，轻触中央暂停/继续，轻触左上角退出...")

	for {
		if time.Now().After(deadline) {
			logf("到达时长上限")
			break
		}

		// 处理暂停状态：定格画面，绘制暂停 OSD，等待恢复或退出
		if atomic.LoadInt32(&isPaused) == 1 {
			currBuf := buffers[currentBufIdx]
			drawPauseOverlay(currBuf.Mmap)
			drawBackButton(currBuf.Mmap)
			if time.Now().UnixNano() < atomic.LoadInt64(&osdUntilNano) {
				drawOSD(currBuf.Mmap, int(atomic.LoadInt32(&curVolLevel)))
			}
			flipCrtc := origCrtc
			flipCrtc.FbId = currBuf.FbId
			flipCrtc.CountConnectors = 1
			flipCrtc.SetConnectorsPtr = uint64(uintptr(unsafe.Pointer(&connectors[0])))
			syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&flipCrtc)))

			for atomic.LoadInt32(&isPaused) == 1 {
				select {
				case <-sigChan:
					return
				case <-touchChan:
					return
				default:
				}
				time.Sleep(50 * time.Millisecond)
				// 暂停期间如果按了音量键，刷新 OSD 音量条
				if time.Now().UnixNano() < atomic.LoadInt64(&osdUntilNano) {
					drawPauseOverlay(currBuf.Mmap)
					drawBackButton(currBuf.Mmap)
					drawOSD(currBuf.Mmap, int(atomic.LoadInt32(&curVolLevel)))
					syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&flipCrtc)))
				}
			}
			// 退出暂停后继续正常流读取
			continue
		}

		backBuf := buffers[1-currentBufIdx]

		_, err := io.ReadFull(stdoutPipe, backBuf.Mmap[:frameBytes])
		if err != nil {
			logf("视频流结束: %v", err)
			break
		}

		// 常驻绘制左上角返回按钮
		drawBackButton(backBuf.Mmap)

		// 恢复播放时绘制短促的 ▶ 水印 (600ms)
		if time.Now().UnixNano() < atomic.LoadInt64(&playIndicatorUntilNano) {
			drawPlayIndicator(backBuf.Mmap)
		}

		// 音量条 OSD
		if time.Now().UnixNano() < atomic.LoadInt64(&osdUntilNano) {
			drawOSD(backBuf.Mmap, int(atomic.LoadInt32(&curVolLevel)))
		}

		flipCrtc := origCrtc
		flipCrtc.FbId = backBuf.FbId
		flipCrtc.CountConnectors = 1
		flipCrtc.SetConnectorsPtr = uint64(uintptr(unsafe.Pointer(&connectors[0])))
		syscall.Syscall(syscall.SYS_IOCTL, drmFile.Fd(), uintptr(DRM_IOCTL_SET_CRTC), uintptr(unsafe.Pointer(&flipCrtc)))

		currentBufIdx = 1 - currentBufIdx
		frameCount++
		if frameCount%60 == 0 {
			logf("已流畅播放 %d 帧", frameCount)
		}
	}
}
