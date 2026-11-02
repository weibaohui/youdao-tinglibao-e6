<template>
  <div class="page">
    <div class="header">
      <text :style="{color:'#ffffff',fontSize:'13px',fontWeight:'bold'}">俄罗斯方块</text>
      <text :style="{color:'#8b949e',fontSize:'11px'}">分数: {{ score }}  行: {{ lines }}</text>
    </div>

    <div class="main">
      <my-board :board="board" :cur="cur" :over="over"></my-board>

      <div class="panel">
        <text :style="{color:'#8b949e',fontSize:'10px'}">下一个</text>
        <my-next :type="nextType"></my-next>
        <text :style="{color:'#58a6ff',fontSize:'9px',marginTop:'8px'}">上一首←</text>
        <text :style="{color:'#58a6ff',fontSize:'9px'}">下一首→</text>
        <text :style="{color:'#58a6ff',fontSize:'9px'}">Home=转</text>
        <text :style="{color:'#58a6ff',fontSize:'9px'}">播放=落</text>
        <text :style="{color:'#f85149',fontSize:'8px'}">{{ dbg }}</text>
      </div>
    </div>

    <div class="btns">
      <btn-key text="左" @tap="shift(-1)"></btn-key>
      <btn-key text="右" @tap="shift(1)"></btn-key>
      <btn-key text="转" @tap="rotate"></btn-key>
      <btn-key text="落" @tap="hardDrop"></btn-key>
    </div>
  </div>
</template>

<script>
import buttonEventModule from 'buttonEvent';

/* ---------- 形状定义：每种方块的基础矩阵，旋转态运行时生成 ---------- */
const COLS = 10, ROWS = 17, CELL = 13;
const BASE = {
  I: { m: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], c: '#31c7ef' },
  O: { m: [[1,1],[1,1]], c: '#f7d308' },
  T: { m: [[0,1,0],[1,1,1],[0,0,0]], c: '#ad4d9c' },
  S: { m: [[0,1,1],[1,1,0],[0,0,0]], c: '#42b642' },
  Z: { m: [[1,1,0],[0,1,1],[0,0,0]], c: '#ef2029' },
  J: { m: [[1,0,0],[1,1,1],[0,0,0]], c: '#5a65ad' },
  L: { m: [[0,0,1],[1,1,1],[0,0,0]], c: '#e35b02' }
};
const TYPES = ['I','O','T','S','Z','J','L'];

/* 预生成 4 个旋转态的坐标列表 */
const SHAPES = {};
TYPES.forEach(function (t) {
  let m = BASE[t].m;
  const rots = [];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    for (let y = 0; y < m.length; y++) {
      for (let x = 0; x < m[y].length; x++) {
        if (m[y][x]) cells.push([x, y]);
      }
    }
    rots.push(cells);
    /* 顺时针旋转矩阵 */
    const nm = [];
    for (let x = 0; x < m[0].length; x++) {
      const row = [];
      for (let y = m.length - 1; y >= 0; y--) row.push(m[y][x]);
      nm.push(row);
    }
    m = nm;
  }
  SHAPES[t] = { rots: rots, color: BASE[t].c };
});

/* ---------- 棋盘组件（命令式渲染，同模块保证事件/性能） ---------- */
const MyBoard = {
  props: { board: Array, cur: Object, over: Boolean },
  render(h) {
    const shp = SHAPES[this.cur.t];
    const cells = shp.rots[this.cur.r];
    const overlay = {};
    for (let i = 0; i < cells.length; i++) {
      const cx = this.cur.x + cells[i][0];
      const cy = this.cur.y + cells[i][1];
      overlay[cy + ':' + cx] = true;
    }
    const rows = [];
    for (let r = 0; r < ROWS; r++) {
      const line = [];
      for (let c = 0; c < COLS; c++) {
        let color = '#1a2030';
        if (this.board[r] && this.board[r][c]) color = this.board[r][c];
        if (!this.over && overlay[r + ':' + c]) color = shp.color;
        line.push(h('div', { style: { width: CELL + 'px', height: CELL + 'px', backgroundColor: color } }));
      }
      rows.push(h('div', { style: { flexDirection: 'row' } }, line));
    }
    if (this.over) {
      rows.push(h('div', { style: {
        position: 'absolute', top: '70px', left: '0px', width: '130px',
        justifyContent: 'center', alignItems: 'center'
      } }, [
        h('text', { style: { color: '#f85149', fontSize: '14px', fontWeight: 'bold' } }, '游戏结束'),
        h('text', { style: { color: '#8b949e', fontSize: '10px', marginTop: '4px' } }, '点左下「重开」')
      ]));
    }
    return h('div', { style: {
      width: (COLS * CELL) + 'px', height: (ROWS * CELL) + 'px',
      backgroundColor: '#11151c', borderRadius: '4px'
    } }, rows);
  }
};

/* ---------- 下一个预览 ---------- */
const MyNext = {
  props: { type: String },
  render(h) {
    const shp = SHAPES[this.type] || SHAPES.I;
    const rows = [];
    for (let r = 0; r < 4; r++) {
      const line = [];
      for (let c = 0; c < 4; c++) line.push(h('div', { style: { width: '10px', height: '10px' } }));
      rows.push(h('div', { style: { flexDirection: 'row' } }, line));
    }
    for (let i = 0; i < shp.rots[0].length; i++) {
      const x = shp.rots[0][i][0], y = shp.rots[0][i][1];
      rows[y][x] = h('div', { style: { width: '10px', height: '10px', backgroundColor: shp.color } });
    }
    return h('div', { style: { marginTop: '4px' } }, rows);
  }
};

/* ---------- 触屏按钮（物理按键的屏幕镜像） ---------- */
const BtnKey = {
  props: { text: String },
  render(h) {
    return h('div', {
      style: {
        flex: 1, height: '36px', marginRight: '5px',
        backgroundColor: '#21262d', borderRadius: '8px',
        justifyContent: 'center', alignItems: 'center'
      },
      on: { click: () => this.$emit('tap') }
    }, [h('text', { style: { color: '#c9d1d9', fontSize: '14px' } }, this.text)]);
  }
};

function emptyBoard() {
  const b = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) row.push(0);
    b.push(row);
  }
  return b;
}

export default {
  components: {
    'my-board': MyBoard,
    'my-next': MyNext,
    'btn-key': BtnKey
  },

  data() {
    return {
      board: emptyBoard(),
      cur: { t: 'I', r: 0, x: 3, y: 0 },
      nextType: 'T',
      score: 0,
      lines: 0,
      over: false,
      dbg: '-'
    };
  },

  created() {
    try {
      /* E6 导出为小写 buttonEvent（S7 Pro 文档写的是 ButtonEvent），
         且实例没有 .on() —— 事件以 JQSignal 属性暴露，回调 = 直接给属性赋函数 */
      const Ctor = buttonEventModule.ButtonEvent || buttonEventModule.buttonEvent;
      const be = new Ctor();
      const self = this;
      be.setButtonEventReady(true);
      /* JQSignal 属性赋值式注册：给信号属性直接赋回调 */
      be.playButtonClick = function (a, b, c) {
        console.warn('[tetris] ARGS [' + String(a).slice(0, 30) + '][' + String(b).slice(0, 20) + '][' + String(c).slice(0, 20) + ']');
      };
      this.dbg = 'assigned';
      /* 事件回调 = 组件上的同名方法（见 methods）：backButtonClick 等。
         HaasUI 桌面的 this.homeButtonRelease 泄露了这一约定。 */
      self._be = be;
      console.warn('[tetris] 物理按键监听就绪（signal 属性式）');
    } catch (e) {
      this.dbg = String(e).slice(0, 30);
    }
    this.nextType = this.randType();
    this.spawn();
    this.nextType = this.randType();
    this.spawn();
    this.loop();
  },

  methods: {
    /* ===== 物理按键（框架按信号名回调组件方法） ===== */
    backButtonClick() { console.warn('[tetris] KEY prev'); this.shift(-1); },
    forwardButtonClick() { console.warn('[tetris] KEY next'); this.shift(1); },
    homeButtonClick() { console.warn('[tetris] KEY home'); this.rotate(); },
    playButtonClick() { console.warn('[tetris] KEY play'); this.hardDrop(); },
    volumeUpButtonClick() { console.warn('[tetris] KEY volup'); this.shift(1); },
    volumeDownButtonClick() { console.warn('[tetris] KEY voldown'); this.shift(-1); },
    randType() {
      return TYPES[Math.floor(Math.random() * TYPES.length)];
    },

    collides(t, r, x, y) {
      const cells = SHAPES[t].rots[r];
      for (let i = 0; i < cells.length; i++) {
        const cx = x + cells[i][0], cy = y + cells[i][1];
        if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
        if (cy >= 0 && this.board[cy][cx]) return true;
      }
      return false;
    },

    spawn() {
      if (!this._bag || !this._bag.length) {
        this._bag = TYPES.slice();
        for (let i = this._bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const tmp = this._bag[i]; this._bag[i] = this._bag[j]; this._bag[j] = tmp;
        }
      }
      const t = this.nextType || this.randType();
      this.nextType = this.randType();
      this.cur = { t: t, r: 0, x: 3, y: 0 };
      if (this.collides(t, 0, 3, 0)) {
        this.over = true;
        if (this._timer) clearTimeout(this._timer);
      }
    },

    merge() {
      const shp = SHAPES[this.cur.t];
      const cells = shp.rots[this.cur.r];
      const b = this.board.map(function (row) { return row.slice(); });
      for (let i = 0; i < cells.length; i++) {
        const cx = this.cur.x + cells[i][0], cy = this.cur.y + cells[i][1];
        if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) b[cy][cx] = shp.color;
      }
      /* 消行 */
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        let full = true;
        for (let c = 0; c < COLS; c++) { if (!b[r][c]) { full = false; break; } }
        if (full) {
          b.splice(r, 1);
          const newRow = [];
          for (let c = 0; c < COLS; c++) newRow.push(0);
          b.unshift(newRow);
          cleared++;
          r++;
        }
      }
      if (cleared) {
        const table = [0, 100, 300, 500, 800];
        this.score += table[cleared];
        this.lines += cleared;
      }
      this.board = b;
    },

    reset() {
      if (this._timer) clearTimeout(this._timer);
      this.board = emptyBoard();
      this.score = 0;
      this.lines = 0;
      this.over = false;
      this.nextType = this.randType();
      this.spawn();
      this.loop();
    },

    shift(dir) {
      if (this.over) { this.reset(); return; }
      if (!this.collides(this.cur.t, this.cur.r, this.cur.x + dir, this.cur.y)) {
        this.cur = { t: this.cur.t, r: this.cur.r, x: this.cur.x + dir, y: this.cur.y };
      }
    },

    rotate() {
      if (this.over) { this.reset(); return; }
      const nr = (this.cur.r + 1) % 4;
      const kicks = [0, -1, 1, -2, 2];
      for (let i = 0; i < kicks.length; i++) {
        if (!this.collides(this.cur.t, nr, this.cur.x + kicks[i], this.cur.y)) {
          this.cur = { t: this.cur.t, r: nr, x: this.cur.x + kicks[i], y: this.cur.y };
          return;
        }
      }
    },

    stepDown() {
      if (!this.collides(this.cur.t, this.cur.r, this.cur.x, this.cur.y + 1)) {
        this.cur = { t: this.cur.t, r: this.cur.r, x: this.cur.x, y: this.cur.y + 1 };
        return false;
      }
      this.merge();
      this.spawn();
      return true;
    },

    hardDrop() {
      if (this.over) { this.reset(); return; }
      let n = 0;
      while (!this.collides(this.cur.t, this.cur.r, this.cur.x, this.cur.y + 1)) {
        this.cur = { t: this.cur.t, r: this.cur.r, x: this.cur.x, y: this.cur.y + 1 };
        n++;
      }
      this.score += n * 2;
      this.merge();
      this.spawn();
    },

    loop() {
      const self = this;
      this._timer = setTimeout(function () {
        if (self.over) return;
        self.stepDown();
        const speed = Math.max(280, 640 - self.lines * 24);
        self._timer = setTimeout(function () { self.loop(); }, speed);
      }, 500);
    }
  }
};
</script>

<style scoped>
.page { background-color: #0d1117; }
.header {
  height: 24px; flex-direction: row; align-items: center;
  padding-left: 10px; padding-right: 10px; justify-content: space-between;
}
.main { flex-direction: row; padding-left: 8px; padding-top: 4px; }
.panel { padding-left: 10px; padding-top: 4px; width: 90px; }
.btns { flex-direction: row; padding-left: 8px; padding-right: 3px; margin-top: 8px; }
</style>
