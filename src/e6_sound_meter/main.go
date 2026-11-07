package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
)

const (
	urlFile  = "/tmp/e6_audio.url"
	specFile = "/tmp/e6_spec.raw"
	gainFile = "/tmp/e6_audio_gain"
)

var (
	curGain   atomic.Value
	curHigh   atomic.Value
	activeGen int64
)

func main() {
	curGain.Store(0.15)
	curHigh.Store(0.10)

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		_ = os.Remove(specFile)
		_ = os.Remove(gainFile)
		os.Exit(0)
	}()

	// 专门的输出循环：每 120ms 更新一次 /tmp/e6_spec.raw
	go specOutputLoop()

	var lastURL string
	var stopStream chan struct{}

	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		data, err := os.ReadFile(urlFile)
		curURL := strings.TrimSpace(string(data))
		if err != nil || curURL == "" {
			if stopStream != nil {
				close(stopStream)
				stopStream = nil
				lastURL = ""
				curGain.Store(0.0)
				curHigh.Store(0.0)
			}
			continue
		}

		if curURL != lastURL {
			if stopStream != nil {
				close(stopStream)
			}
			lastURL = curURL
			stopStream = make(chan struct{})
			gen := atomic.AddInt64(&activeGen, 1)
			go processStream(curURL, stopStream, gen)
		}
	}
}

func specOutputLoop() {
	ticker := time.NewTicker(120 * time.Millisecond)
	defer ticker.Stop()

	var prevCols [16]float64
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	var phase float64

	for range ticker.C {
		rawG, _ := curGain.Load().(float64)
		rawH, _ := curHigh.Load().(float64)
		phase += 0.35
		if phase > 6.283 {
			phase -= 6.283
		}

		if rawG < 0.03 {
			// 静音/无数据时平缓下落
			for k := 0; k < 16; k++ {
				prevCols[k] = math.Max(0.05, prevCols[k]*0.75)
			}
		} else {
			// 根据真实音频能量驱动 16 根柱子
			for k := 0; k < 16; k++ {
				t := float64(k) / 15.0
				// 低频由主能量驱动，高频由高频特征主导
				bandEnergy := (1.0-t)*rawG*1.3 + t*rawH*1.4
				// 各自的自然律动相位
				wave := math.Sin(phase*1.5 + float64(k)*0.45)
				flutter := (wave*0.15 + 0.85) * (0.9 + r.Float64()*0.2)
				target := bandEnergy * flutter
				target = math.Max(0.08, math.Min(0.96, target))

				// 响应速度：低频升快降慢，高频更敏捷
				if target > prevCols[k] {
					prevCols[k] = prevCols[k]*0.2 + target*0.8
				} else {
					prevCols[k] = prevCols[k]*0.65 + target*0.35
				}
			}
		}

		vals := make([]string, 16)
		for k := 0; k < 16; k++ {
			vals[k] = fmt.Sprintf("%.2f", prevCols[k])
		}
		_ = os.WriteFile(specFile, []byte(strings.Join(vals, ",")), 0644)
		_ = os.WriteFile(gainFile, []byte(fmt.Sprintf("%.2f", rawG)), 0644)
	}
}

func processStream(streamURL string, stop <-chan struct{}, gen int64) {
	log.Printf("[sound_meter] Starting stream: %s", streamURL)
	tr := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ResponseHeaderTimeout: 5 * time.Second,
	}
	client := &http.Client{
		Transport: tr,
		Timeout:   0,
	}

	for {
		if atomic.LoadInt64(&activeGen) != gen {
			return
		}
		select {
		case <-stop:
			return
		default:
		}

		req, err := http.NewRequest("GET", streamURL, nil)
		if err != nil {
			return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
		req.Header.Set("Icy-MetaData", "0")

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("[sound_meter] HTTP req err: %v", err)
			select {
			case <-stop:
				return
			case <-time.After(1 * time.Second):
				continue
			}
		}

		log.Printf("[sound_meter] Stream connected, HTTP %d", resp.StatusCode)
		closed := make(chan struct{})
		go func() {
			select {
			case <-stop:
				_ = resp.Body.Close()
			case <-closed:
			}
		}()

		buf := make([]byte, 2048)

		for {
			if atomic.LoadInt64(&activeGen) != gen {
				close(closed)
				_ = resp.Body.Close()
				return
			}
			select {
			case <-stop:
				close(closed)
				_ = resp.Body.Close()
				return
			default:
			}

			n, err := resp.Body.Read(buf)
			if n > 64 {
				var mp3Gain float64
				var foundHeader bool

				// 1. 扫描 MP3 裸流 Side Information global_gain
				for i := 0; i < n-36; i++ {
					if buf[i] == 0xFF && (buf[i+1]&0xE0) == 0xE0 {
						side := buf[i+4 : i+36]
						bits := (uint64(side[0]) << 40) | (uint64(side[1]) << 32) |
							(uint64(side[2]) << 24) | (uint64(side[3]) << 16) |
							(uint64(side[4]) << 8) | uint64(side[5])
						gainRaw := float64((bits >> 7) & 0xFF)
						if gainRaw > 10 && gainRaw < 220 {
							g := (gainRaw - 24.0) / 58.0
							if g < 0 {
								g = 0
							} else if g > 1 {
								g = 1
							}
							mp3Gain = g
							foundHeader = true
							break
						}
					}
				}

				// 2. 超轻量字节差分熵能量（万能兜底，AAC/MP3/高低码率通用，仅几十微秒）
				var sumDiff float64
				var zeroCross int
				for j := 1; j < n; j++ {
					d := math.Abs(float64(buf[j]) - float64(buf[j-1]))
					sumDiff += d
					if (buf[j] < 128 && buf[j-1] >= 128) || (buf[j] >= 128 && buf[j-1] < 128) {
						zeroCross++
					}
				}
				entropyEnergy := sumDiff / float64(n*85.0)
				if entropyEnergy > 1.0 {
					entropyEnergy = 1.0
				}
				highRatio := float64(zeroCross) / (float64(n) * 0.5)
				if highRatio > 1.0 {
					highRatio = 1.0
				}

				var finalGain float64
				if foundHeader && mp3Gain > 0.05 {
					finalGain = mp3Gain*0.6 + entropyEnergy*0.4
				} else {
					finalGain = entropyEnergy
				}

				oldG, _ := curGain.Load().(float64)
				curGain.Store(oldG*0.35 + finalGain*0.65)

				oldH, _ := curHigh.Load().(float64)
				curHigh.Store(oldH*0.35 + highRatio*0.65)
			}

			if err != nil {
				close(closed)
				_ = resp.Body.Close()
				break
			}
		}

		select {
		case <-stop:
			return
		case <-time.After(500 * time.Millisecond):
		}
	}
}
