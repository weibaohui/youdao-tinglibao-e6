<template>
  <div class="page">
    <div class="header">
      <text :style="{color:'#ffffff',fontSize:'13px',fontWeight:'bold'}">贪吃蛇</text>
      <text :style="{color:'#8b949e',fontSize:'11px'}">分 {{ score }} · 最高 {{ high }} · 长 {{ bodyLen }}</text>
    </div>

    <div class="main">
      <my-board :snake="snake" :food="food" :over="over" :paused="paused"></my-board>

      <div class="panel">
        <text :style="{color:'#8b949e',fontSize:'10px'}">速度</text>
        <text :style="{color:'#e3b341',fontSize:'12px'}">{{ speedMs }}ms</text>
        <text :style="{color:'#58a6ff',fontSize:'9px',marginTop:'10px'}">上一首=左转</text>
        <text :style="{color:'#58a6ff',fontSize:'9px'}">下一首=右转</text>
        <text :style="{color:'#58a6ff',fontSize:'9px'}">Home=暂停</text>
        <text :style="{color:'#58a6ff',fontSize:'9px'}">播放=重开</text>
      </div>
    </div>

    <div class="footer">
      <text :style="{color:(over ? '#f85149' : (paused ? '#e3b341' : '#8b949e')),fontSize:'10px'}">{{ statusText }}</text>
    </div>
  </div>
</template>

<script>
import UI from './e6ui.js';
import buttonEventModule from 'buttonEvent';

const COLS = 14, ROWS = 16, CELL = 16;

/* 蛇身凸块：身体绿、头亮绿；食物红凸块；空格凹槽 —— 与俄罗斯方块同一套质感 */
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t2 = pct < 0 ? 0 : 255, q = Math.abs(pct) / 100;
  r = Math.round((t2 - r) * q + r);
  g = Math.round((t2 - g) * q + g);
  b = Math.round((t2 - b) * q + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function bevelStyle(st, color) {
  st.backgroundColor = color;
  st.borderTopWidth = '2px';    st.borderTopColor = shade(color, 55);
  st.borderLeftWidth = '2px';   st.borderLeftColor = shade(color, 30);
  st.borderBottomWidth = '2px'; st.borderBottomColor = shade(color, -40);
  st.borderRightWidth = '2px';  st.borderRightColor = shade(color, -20);
  st.borderTopStyle = 'solid'; st.borderLeftStyle = 'solid';
  st.borderBottomStyle = 'solid'; st.borderRightStyle = 'solid';
  return st;
}
function slotStyle(st) {
  st.backgroundColor = '#10151d';
  st.borderTopWidth = '1px';    st.borderTopColor = '#0a0e14';
  st.borderLeftWidth = '1px';   st.borderLeftColor = '#0a0e14';
  st.borderBottomWidth = '1px'; st.borderBottomColor = '#222b38';
  st.borderRightWidth = '1px';  st.borderRightColor = '#222b38';
  st.borderTopStyle = 'solid'; st.borderLeftStyle = 'solid';
  st.borderBottomStyle = 'solid'; st.borderRightStyle = 'solid';
  return st;
}

const GREEN = '#3fb950', HEAD = '#7ee787', RED = '#ef2029';

const MyBoard = {
  props: { snake: Array, food: Object, over: Boolean, paused: Boolean },
  render(h) {
    const lookup = {};
    for (let i = 0; i < this.snake.length; i++) {
      lookup[this.snake[i][1] + ':' + this.snake[i][0]] = (i === 0) ? HEAD : GREEN;
    }
    if (this.food && this.food.x >= 0) lookup[this.food.y + ':' + this.food.x] = RED;

    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const line = [];
      for (let c = 0; c < COLS; c++) {
        const key = r + ':' + c;
        let st = { width: CELL + 'px', height: CELL + 'px' };
        if (lookup[key]) bevelStyle(st, lookup[key]);
        else slotStyle(st);
        line.push(h('div', { style: st }));
      }
      rows.push(h('div', { style: { flexDirection: 'row' } }, line));
    }
    const kids = [h('div', { style: { flexDirection: 'column' } }, rows)];
    if (this.over || this.paused) {
      kids.push(h('div', { style: {
        position: 'absolute', top: '100px', left: '0px', width: (COLS * CELL) + 'px',
        justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1117'
      } }, [
        h('text', { style: { color: this.over ? '#f85149' : '#e3b341', fontSize: '14px', fontWeight: 'bold' } },
          this.over ? '游戏结束' : '已暂停'),
        h('text', { style: { color: '#8b949e', fontSize: '10px', marginTop: '4px' } },
          this.over ? '按 Home 重开' : 'Home 继续')
      ]));
    }
    return h('div', { style: {
      width: (COLS * CELL + 4) + 'px', height: (ROWS * CELL + 4) + 'px',
      borderWidth: '2px', borderColor: '#3d4451', borderStyle: 'solid',
      backgroundColor: '#0d1117'
    } }, kids);
  }
};

/* 方向：0=上 1=右 2=下 3=左；prev=左转(dir-1) next=右转(dir+1) */
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export default {
  components: { 'my-board': MyBoard },

  data() {
    return {
      snake: [[5, 8], [4, 8], [3, 8]],
      food: { x: 10, y: 8 },
      dir: 1,              /* 1=右 */
      score: 0,
      high: 0,
      bodyLen: 3,
      speedMs: 200,
      over: false,
      paused: false,
      statusText: 'Home=暂停 · 播放=重开'
    };
  },

  created() {
    const hs = new UI.Storage('snake_high');
    const self = this;
    hs.get('high', 0).then(function (v) { if (v > 0) { self.high = v; self.statusText = '最高 ' + v; } });

    /* 物理键桥（与俄罗斯方块同一 e6keyed 守护） */
    try {
      process.exec('sh', ['-c',
        'P=$(find /userdisk/secondary/miniapp/data/mini_app/pkg/8090906000000006 -name e6keyed 2>/dev/null | head -1); ' +
        '[ -n "$P" ] && cp "$P" /tmp/e6keyed && chmod 755 /tmp/e6keyed; ' +
        'kill $(cat /tmp/e6keyed.pid 2>/dev/null) 2>/dev/null; ' +
        'rm -f /tmp/e6keyed.pid /tmp/e6keys.buf /tmp/e6keys.heartbeat; ' +
        'nohup /tmp/e6keyed >/dev/null 2>&1 </dev/null &'], { timeout: 8000 });
    } catch (e) { console.warn('[snake] 守护拉起失败 ' + e); }

    /* E6 导出键大小写随加载时机变化，双兜底 */
    const Ctor = buttonEventModule.ButtonEvent || buttonEventModule.buttonEvent;
    const be = new Ctor();
    be.setButtonEventReady(true);
    be.backButtonClick = function () { self.onKey('left'); };
    be.forwardButtonClick = function () { self.onKey('right'); };
    be.homeButtonClick = function () { self.onKey('home'); };
    be.playButtonClick = function () { self.onKey('play'); };

    this.keysLoop();
    this.loop();
  },

  methods: {
    onKey(k) {
      if (k === 'left') this.turn(-1);
      else if (k === 'right') this.turn(1);
      else if (k === 'home') {
        if (this.over) this.reset();
        else {
          this.paused = !this.paused;
          this.statusText = this.paused ? '已暂停 · Home 继续' : '继续!';
        }
      } else if (k === 'play') {
        if (this.over) this.reset();
      }
    },

    keysLoop() {
      const self = this;
      const tick = function () {
        process.exec('sh', ['-c',
          'PID=$(cat /tmp/e6keyed.pid 2>/dev/null); ' +
          'if [ -z "$PID" ] || [ ! -d /proc/$PID ]; then ' +
          'P=$(find /userdisk/secondary/miniapp/data/mini_app/pkg/8090906000000006 -name e6keyed 2>/dev/null | head -1); ' +
          '[ -n "$P" ] && cp "$P" /tmp/e6keyed && chmod 755 /tmp/e6keyed; rm -f /tmp/e6keyed.pid; ' +
          'nohup /tmp/e6keyed >/dev/null 2>&1 </dev/null & fi; ' +
          'cat /tmp/e6keys.buf 2>/dev/null; : > /tmp/e6keys.buf; echo 1 > /tmp/e6keys.heartbeat'],
          { timeout: 4000 }).then(function (r) {
            const out = String((r && r.stdout) || '');
            if (out) {
              const acts = out.trim().split(String.fromCharCode(10));
              for (let i = 0; i < acts.length; i++) self.onKey(acts[i]);
            }
            setTimeout(tick, 150);
          }).catch(function () { setTimeout(tick, 300); });
      };
      tick();
    },

    turn(d) {
      if (this.over) return;
      /* dir+1=右转(顺时针) dir+3=左转(逆时针)；禁止 180° 掉头 */
      const nd = (this.dir + (d < 0 ? 3 : 1)) % 4;
      if ((nd + 2) % 4 !== this.dir) this._nextDir = nd;
    },

    reset() {
      this.snake = [[5, 8], [4, 8], [3, 8]];
      this.food = { x: 10, y: 8 };
      this.dir = 1;
      this.score = 0;
      this.over = false;
      this.paused = false;
      this.speedMs = 200;
      this.statusText = 'Home=暂停 · 播放=重开';
      this.spawnFood();
      this.loop();
    },

    spawnFood() {
      const occupied = {};
      for (let i = 0; i < this.snake.length; i++) {
        occupied[this.snake[i][1] + ':' + this.snake[i][0]] = true;
      }
      let tries = 0;
      while (tries < 500) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        if (!occupied[y + ':' + x]) { this.food = { x: x, y: y }; return; }
        tries++;
      }
    },

    step() {
      if (this.over || this.paused) return;
      if (this._nextDir !== undefined && this._nextDir !== null) {
        this.dir = this._nextDir;
        this._nextDir = null;
      }
      const head = this.snake[0];
      const nx = head[0] + DX[this.dir];
      const ny = head[1] + DY[this.dir];
      /* 撞墙 / 撞自己 */
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { this.gameOver(); return; }
      for (let i = 0; i < this.snake.length - 1; i++) {
        if (this.snake[i][0] === nx && this.snake[i][1] === ny) { this.gameOver(); return; }
      }
      const ate = (nx === this.food.x && ny === this.food.y);
      const ns = this.snake.map(function (s) { return s.slice(); });
      ns.unshift([nx, ny]);
      if (ate) {
        this.score += 10;
        if (this.score > this.high) {
          this.high = this.score;
          const hs = new UI.Storage('snake_high');
          hs.set('high', this.high);
        }
        this.speedMs = Math.max(100, 200 - Math.floor(this.score / 50) * 10);
        this.spawnFood();
      } else {
        ns.pop();
      }
      this.snake = ns;
      this.bodyLen = ns.length;
    },

    gameOver() {
      this.over = true;
      this.statusText = '游戏结束 · 播放键重开';
      if (this._timer) clearTimeout(this._timer);
    },

    loop() {
      const self = this;
      this._timer = setTimeout(function () {
        if (!self.over && !self.paused) self.step();
        self._timer = setTimeout(function () { self.loop(); }, self.speedMs);
      }, this.speedMs);
    }
  }
};
</script>

<style scoped>
.page { background-color: #0d1117; }
.header {
  height: 22px; flex-direction: row; align-items: center;
  padding-left: 10px; padding-right: 10px; justify-content: space-between;
}
.main { flex-direction: row; padding-left: 7px; padding-top: 4px; }
.panel { padding-left: 8px; padding-top: 4px; width: 72px; }
.footer { height: 20px; padding-left: 10px; padding-top: 4px; }
</style>
