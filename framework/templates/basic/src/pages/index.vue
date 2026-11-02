<template>
  <div class="page">
    <nav-bar title="框架演示" :back="true" @back="exitApp"></nav-bar>

    <div class="content">
      <card title="HTTP + Storage">
        <cell title="GitHub Zen" :value="quote" @tap="refresh"></cell>
        <cell title="上次刷新" :value="lastTime"></cell>
      </card>

      <card title="提示">
        <cell title="点底部刷新或本行拉取 quote" @tap="refresh"></cell>
      </card>

      <div class="btn-row">
        <btn text="刷新" @tap="refresh"></btn>
        <btn text="提示音" type="ghost" @tap="chime"></btn>
      </div>
    </div>

    <status-footer :text="status" :error="isErr" :busy="busy" :refreshable="true" @refresh="refresh"></status-footer>
  </div>
</template>

<script>
import UI from './e6ui.js';

export default {
  components: {
    'nav-bar': UI.NavBar,
    'cell': UI.Cell,
    'btn': UI.Btn,
    'card': UI.Card,
    'status-footer': UI.StatusFooter
  },

  data() {
    return {
      quote: '点我拉取',
      lastTime: '从未',
      status: '就绪',
      isErr: false,
      busy: false
    };
  },

  created() {
    const store = new UI.Storage('basic_demo');
    const self = this;
    store.get('lastRefresh', '').then(function (t) {
      if (t) self.lastTime = t;
    });
  },

  methods: {
    exitApp() {
      /* 返回键：关掉最后一页 = 退出应用 */
      if (this.$page && this.$page.finish) this.$page.finish();
    },

    openAbout() {
      /* 导航到第二个页面。$E6 = 框架实例（入口 app.js 挂到 globalThis） */
      const f = globalThis.$E6;
      if (f && f.navToPage) {
        f.navToPage('about');
        this.status = 'navToPage about';
      } else {
        this.status = 'navToPage 不可用';
        this.isErr = true;
      }
    },

    async refresh() {
      if (this.busy) return;
      this.busy = true;
      this.isErr = false;
      this.status = '请求中…';
      try {
        const res = await UI.http.get('https://api.github.com/zen', { timeout: 12000 });
        if (res.ok) {
          this.quote = res.body.slice(0, 42) || '(空)';
          this.status = '已更新 ' + UI.formatTime();
          const store = new UI.Storage('basic_demo');
          this.lastTime = UI.formatTime();
          await store.set('lastRefresh', this.lastTime);
        } else {
          this.quote = 'HTTP ' + res.status;
          this.status = 'HTTP ' + res.status;
          this.isErr = true;
        }
      } catch (e) {
        this.status = '失败: ' + String(e).slice(0, 30);
        this.isErr = true;
      }
      this.busy = false;
    },

    async chime() {
      try {
        await UI.sound.playWav('chime.wav');
        this.status = '已播放提示音';
      } catch (e) {
        this.status = '音频失败: ' + String(e).slice(0, 24);
        this.isErr = true;
      }
    }
  }
};
</script>

<style scoped>
.page { background-color: #0d1117; }
.btn-row { flex-direction: row; margin-top: 8px; }
</style>
