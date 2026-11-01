package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
)

func getOutput(cmd string, args ...string) string {
	out, err := exec.Command(cmd, args...).Output()
	if err != nil {
		return "N/A"
	}
	return strings.TrimSpace(string(out))
}

func main() {
	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		hostname, _ := os.Hostname()
		uptime := getOutput("uptime")
		uname := getOutput("uname", "-a")
		df := getOutput("df", "-h", "/userdisk", "/userdata")
		temp := getOutput("cat", "/sys/class/thermal/thermal_zone0/temp")

		html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Youdao Tinglibao E6 Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
        .card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); }
        h1 { color: #38bdf8; margin-top: 0; }
        h2 { color: #94a3b8; font-size: 16px; border-bottom: 1px solid #334155; padding-bottom: 8px; }
        pre { background: #0f172a; padding: 12px; border-radius: 8px; overflow-x: auto; color: #a5f3fc; }
        .badge { display: inline-block; background: #0284c7; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <h1>🚀 有道听力宝 E6 (YDLE6)</h1>
        <p><span class="badge">ROOTED</span> <strong>SoC:</strong> Rockchip RV1106 (ARM Cortex-A7) | <strong>Host:</strong> %s</p>
    </div>
    <div class="card">
        <h2>系统信息 (Kernel & Uptime)</h2>
        <pre>%s&#10;%s</pre>
    </div>
    <div class="card">
        <h2>核心温度</h2>
        <pre>CPU Temp: %s mC</pre>
    </div>
    <div class="card">
        <h2>存储分区空间 (Disk Usage)</h2>
        <pre>%s</pre>
    </div>
</body>
</html>`, hostname, uname, uptime, temp, df)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
	})

	fmt.Printf("🌐 有道听力宝 E6 Web Dashboard 运行于 http://0.0.0.0:%s\n", port)
	http.ListenAndServe(":"+port, nil)
}
