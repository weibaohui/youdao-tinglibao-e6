/*
 * e6_debug_server —— 有道听力宝 E6 远程调试服务
 *
 * 在设备上跑一个小 HTTP 服务，让任何能访问到它的浏览器/脚本都能：
 *   截图、点击、滑动、长按、看日志、看状态 —— 全都不用插 USB 线。
 *
 * 接口：
 *   GET  /                 调试控制面板（网页：看屏幕 + 点屏幕）
 *   GET  /shot.png         当前屏幕截图（240x320 PNG）
 *   GET  /tap?x=&y=        点击（也接受 POST）
 *   GET  /swipe?x1=&y1=&x2=&y2=&ms=
 *   GET  /long?x=&y=&ms=
 *   GET  /logs?what=app|sound|err&n=50
 *   GET  /status           JSON 状态
 *   GET  /healthz          存活探测
 *
 * 环境变量：
 *   PORT       监听端口，默认 8080
 *   E6_TOKEN   若设置，则所有接口都需要 ?token=xxx 或 X-E6-Token 头
 *   TAP_BIN    触摸注入器路径，默认 /userdisk/e6_tap
 *
 * 触摸注入走 /userdisk/e6_tap（直写 /dev/input/event3）；
 * 截图走 miniapp_cli capture（官方 DRM/KMS 路径）。
 */
package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

const (
	screenW = 240
	screenH = 320
)

//go:embed index.html
var indexHTML []byte

var (
	tapBin  = envOr("TAP_BIN", "/userdisk/e6_tap")
	token   = os.Getenv("E6_TOKEN")
	port    = envOr("PORT", "8080")
	logPath = "/userdata/applog/YD_PEN_APP.log"
	sndPath = "/userdata/applog/SoundPlayer.log"
)

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// ---------- 底层动作 ----------

// capture 抓一张屏幕快照，返回 PNG 字节
func capture() ([]byte, error) {
	tmp := fmt.Sprintf("/tmp/e6_dbg_%d.png", time.Now().UnixNano())
	defer os.Remove(tmp)

	out, err := exec.Command("miniapp_cli", "capture", tmp).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("capture 失败: %v (%s)", err, strings.TrimSpace(string(out)))
	}
	data, err := os.ReadFile(tmp)
	if err != nil {
		return nil, fmt.Errorf("读取截图失败: %v", err)
	}
	return data, nil
}

// touch 调用 e6_tap 做手势
func touch(args ...string) error {
	cmd := exec.Command(tapBin, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("e6_tap %v 失败: %v (%s)", args, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func tailFile(path string, n int) string {
	if n <= 0 {
		n = 50
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "读取 " + path + " 失败: " + err.Error()
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return strings.Join(lines, "\n")
}

// ---------- HTTP 处理 ----------

func authorized(r *http.Request) bool {
	if token == "" {
		return true
	}
	if r.Header.Get("X-E6-Token") == token {
		return true
	}
	return r.URL.Query().Get("token") == token
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func numParam(r *http.Request, name string, def int) int {
	v := r.URL.Query().Get(name)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func handleShot(w http.ResponseWriter, r *http.Request) {
	data, err := capture()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

func handleTap(w http.ResponseWriter, r *http.Request) {
	x := numParam(r, "x", -1)
	y := numParam(r, "y", -1)
	if x < 0 || x >= screenW || y < 0 || y >= screenH {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("坐标越界: (%d,%d)，合法范围 0<=x<%d, 0<=y<%d", x, y, screenW, screenH),
		})
		return
	}
	if err := touch("tap", strconv.Itoa(x), strconv.Itoa(y)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "action": "tap", "x": x, "y": y})
}

func handleSwipe(w http.ResponseWriter, r *http.Request) {
	x1 := numParam(r, "x1", -1)
	y1 := numParam(r, "y1", -1)
	x2 := numParam(r, "x2", -1)
	y2 := numParam(r, "y2", -1)
	ms := numParam(r, "ms", 400)
	for _, p := range [][2]int{{x1, y1}, {x2, y2}} {
		if p[0] < 0 || p[0] >= screenW || p[1] < 0 || p[1] >= screenH {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": fmt.Sprintf("坐标越界: (%d,%d)，合法范围 0<=x<%d, 0<=y<%d", p[0], p[1], screenW, screenH),
			})
			return
		}
	}
	if err := touch("swipe", strconv.Itoa(x1), strconv.Itoa(y1), strconv.Itoa(x2), strconv.Itoa(y2), strconv.Itoa(ms)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "action": "swipe", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "ms": ms})
}

func handleLong(w http.ResponseWriter, r *http.Request) {
	x := numParam(r, "x", -1)
	y := numParam(r, "y", -1)
	ms := numParam(r, "ms", 800)
	if x < 0 || x >= screenW || y < 0 || y >= screenH {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("坐标越界: (%d,%d)，合法范围 0<=x<%d, 0<=y<%d", x, y, screenW, screenH),
		})
		return
	}
	if err := touch("long", strconv.Itoa(x), strconv.Itoa(y), strconv.Itoa(ms)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "action": "long", "x": x, "y": y, "ms": ms})
}

func handleLogs(w http.ResponseWriter, r *http.Request) {
	what := r.URL.Query().Get("what")
	n := numParam(r, "n", 50)
	var content string
	switch what {
	case "sound":
		content = tailFile(sndPath, n)
	case "err":
		content = filterErrors(tailFile(logPath, 2000), n)
	default:
		content = filterConsole(tailFile(logPath, 2000), n)
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(content))
}

func filterConsole(s string, n int) string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, n)
	for i := len(lines) - 1; i >= 0 && len(out) < n; i-- {
		if strings.Contains(lines[i], "console(") {
			out = append([]string{lines[i]}, out...)
		}
	}
	return strings.Join(out, "\n")
}

func filterErrors(s string, n int) string {
	lines := strings.Split(s, "\n")
	out := make([]string, 0, n)
	for i := len(lines) - 1; i >= 0 && len(out) < n; i-- {
		if strings.Contains(lines[i], "ReferenceError") ||
			strings.Contains(lines[i], "TypeError") ||
			strings.Contains(lines[i], "SyntaxError") {
			out = append([]string{lines[i]}, out...)
		}
	}
	return strings.Join(out, "\n")
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	host, _ := os.Hostname()
	out, _ := exec.Command("uptime").Output()
	ipOut, _ := exec.Command("sh", "-c", "ip -4 addr show wlan0 | grep -oE 'inet [0-9.]+' | cut -d' ' -f2").Output()
	ips := strings.Fields(string(ipOut))

	writeJSON(w, http.StatusOK, map[string]any{
		"hostname": host,
		"uptime":   strings.TrimSpace(string(out)),
		"ips":      ips,
		"screen":   []int{screenW, screenH},
		"tap_bin":  tapBin,
		"token_on": token != "",
		"time":     time.Now().Format("2006-01-02 15:04:05"),
	})
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/shot.png", handleShot)
	mux.HandleFunc("/tap", handleTap)
	mux.HandleFunc("/swipe", handleSwipe)
	mux.HandleFunc("/long", handleLong)
	mux.HandleFunc("/logs", handleLogs)
	mux.HandleFunc("/status", handleStatus)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		page := indexHTML
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(page)
	})

	// 统一鉴权 + 日志
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !authorized(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要 token"})
			return
		}
		start := time.Now()
		mux.ServeHTTP(w, r)
		fmt.Printf("%s %s %v\n", r.Method, r.URL.RequestURI(), time.Since(start))
	})

	fmt.Printf("E6 调试服务启动: http://0.0.0.0:%s/\n", port)
	if token != "" {
		fmt.Println("已启用 token 鉴权")
	}
	if err := http.ListenAndServe("0.0.0.0:"+port, handler); err != nil {
		fmt.Println("服务退出:", err)
		os.Exit(1)
	}
}
