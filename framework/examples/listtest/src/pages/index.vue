<template>
  <div class="page">
    <div class="hdr"><text class="hdrtxt">v-for + scroller + input 测试</text></div>
    <input class="kw" placeholder="输入关键字" @input="onInput" />
    <scroller class="list">
      <div v-for="(s, i) in items" :key="i" class="row" @click="onRow(i)">
        <text class="rowtxt">{{ i }} - {{ s }}</text>
      </div>
    </scroller>
    <div class="ftr"><text class="ftrtxt">{{ msg }}</text></div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      msg: 'init',
      items: []
    };
  },
  created() {
    const arr = [];
    console.warn("[lt] gen start "+Date.now()); for (let i = 0; i < 2500; i++) arr.push('测试电台名称第' + i + '号');
    this.items = arr; console.warn("[lt] data set "+Date.now());
    console.warn('[listtest] created, items=' + arr.length);
  },
  methods: {
    onRow(i) {
      this.msg = 'clicked row ' + i;
      console.warn('[listtest] row click ' + i);
    },
    onInput(e) {
      this.msg = 'input: ' + JSON.stringify(e).slice(0, 60);
      console.warn('[listtest] input event ' + JSON.stringify(e).slice(0, 120));
    }
  }
};
</script>

<style scoped>
.page { width: 240px; height: 320px; background-color: #0b0e14; flex-direction: column; }
.hdr { height: 28px; justify-content: center; align-items: center; background-color: #161b22; }
.hdrtxt { color: #79c0ff; font-size: 13px; }
.kw { height: 30px; margin: 6px; padding-left: 8px; background-color: #161b22; color: #ffffff; font-size: 13px; border-radius: 6px; }
.list { flex: 1; margin: 6px; background-color: #11151c; border-radius: 6px; }
.row { height: 30px; justify-content: center; padding-left: 10px; border-bottom-width: 1px; border-bottom-color: #21262d; }
.rowtxt { color: #e6edf3; font-size: 13px; }
.ftr { height: 26px; justify-content: center; align-items: center; }
.ftrtxt { color: #3fb950; font-size: 12px; }
</style>
