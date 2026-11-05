<template>
  <div class="page">
    <div class="hdr"><text class="hdrtxt">格式探针</text></div>
    <div class="row" @click="play(0)"><text class="rt">1 MP3 北京音乐广播</text></div>
    <div class="row" @click="play(1)"><text class="rt">2 AAC+ YES933</text></div>
    <div class="row" @click="play(2)"><text class="rt">2 HLS CNR经济之声</text></div>
    <div class="row" @click="stop"><text class="rt">■ 停止</text></div>
    <div class="st"><text class="stt">{{ msg }}</text></div>
  </div>
</template>

<script>
import soundPlayerModule from 'soundPlayer';
const URLS = [
  'https://lhttp.qtfm.cn/live/332/64k.mp3',
  'https://streams.radiomast.io/ce298b32-8776-4192-9900-092f44b63e7f',
  'http://asiafm.hk:8000/asiahd'
];
export default {
  data() { return { msg: 'idle' }; },
  created() { this._sp = new soundPlayerModule.SoundPlayer(); },
  methods: {
    play(i) {
      const self = this;
      this.msg = 'loading ' + i;
      console.warn('[fmtprobe] play ' + i + ' ' + URLS[i]);
      try {
        this._sp.playOnlineAudio(URLS[i]);
        this.msg = 'called play ' + i;
      } catch (e) {
        this.msg = 'ERR ' + String(e).slice(0, 40);
        console.warn('[fmtprobe] err ' + String(e));
      }
    },
    stop() {
      const sp = this._sp;
      try { if (sp.quickStop) sp.quickStop(); } catch (e) {}
      try { if (sp.stop) sp.stop(); } catch (e) {}
      this.msg = 'stopped';
    }
  }
};
</script>

<style scoped>
.page { width: 240px; height: 320px; background-color: #0b0e14; flex-direction: column; }
.hdr { height: 30px; justify-content: center; align-items: center; }
.hdrtxt { color: #79c0ff; font-size: 14px; }
.row { height: 44px; margin: 6px; justify-content: center; padding-left: 10px; background-color: #161b22; border-radius: 8px; }
.rt { color: #e6edf3; font-size: 13px; }
.st { margin: 10px; padding: 8px; }
.stt { color: #3fb950; font-size: 11px; }
</style>
