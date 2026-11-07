const PATH = '/userdisk/radio_settings.json';
const DURATIONS = [15, 30, 60, 90];

function save(state) {
  const value = JSON.stringify({
    randomMode: !!state.randomMode,
    sleepUntil: state._sleepUntil || 0,
    sleepMinutes: state._sleepMinutes || 0
  }).replace(/'/g, '\\u0027');
  if (state._radioSettingsIO) state._radioSettingsIO.save(PATH, value);
}

function updateTimer(state, until) {
  state._sleepUntil = until;
  if (state._sleepTimer) clearTimeout(state._sleepTimer);
  const tick = function () {
    const left = Math.max(0, state._sleepUntil - Date.now());
    state.sleepLabel = left ? Math.ceil(left / 60000) + ' 分钟后关闭' : '';
    if (!left) {
      state._sleepUntil = 0;
      state._sleepTimer = null;
      state._playRequestId = (state._playRequestId || 0) + 1;
      state.stopAll();
      state.playing = false;
      state.stateText = '定时结束';
      state.stateColor = '#8b949e';
      save(state);
      return;
    }
    state._sleepTimer = setTimeout(tick, Math.min(30000, left));
  };
  tick();
}

export default {
  async load(io) {
    try {
      return JSON.parse(String(await io.load(PATH) || '{}'));
    } catch (e) { return {}; }
  },
  apply(state, settings) {
    state.randomMode = !!settings.randomMode;
    state._sleepMinutes = settings.sleepMinutes || 0;
    if (settings.sleepUntil > Date.now()) updateTimer(state, settings.sleepUntil);
  },
  toggleRandom(state) {
    state.randomMode = !state.randomMode;
    save(state);
  },
  cycleSleep(state) {
    const current = state._sleepMinutes || 0;
    const next = DURATIONS[(DURATIONS.indexOf(current) + 1) % DURATIONS.length];
    state._sleepMinutes = next;
    updateTimer(state, Date.now() + next * 60000);
    save(state);
  },
  cancelSleep(state) {
    if (state._sleepTimer) clearTimeout(state._sleepTimer);
    state._sleepTimer = null;
    state._sleepUntil = 0;
    state._sleepMinutes = 0;
    state.sleepLabel = '';
    save(state);
  }
};
