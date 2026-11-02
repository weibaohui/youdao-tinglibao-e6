<template>
  <div class="page">
    <nav-bar title="关于 e6app" :back="true" @back="goBack"></nav-bar>

    <div class="content">
      <card title="这是什么">
        <cell title="e6app 框架验证应用"></cell>
        <cell title="Vue SFC → QuickJS 字节码"></cell>
      </card>
      <card title="技术栈">
        <cell title="Falcon MiniApp + QuickJS"></cell>
        <cell title="Yoga 布局 + Skia 渲染"></cell>
      </card>
    </div>

    <status-footer :text="status"></status-footer>
  </div>
</template>

<script>
import UI from './e6ui.js';

export default {
  components: {
    'nav-bar': UI.NavBar,
    'cell': UI.Cell,
    'card': UI.Card,
    'status-footer': UI.StatusFooter
  },

  data() {
    return { status: '第二页（navToPage 打开）' };
  },

  methods: {
    goBack() {
      if (this.$page && this.$page.finish) this.$page.finish();
    }
  }
};
</script>

<style scoped>
.page {
  background-color: #0d1117;
}
</style>
