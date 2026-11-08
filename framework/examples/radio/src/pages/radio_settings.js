const CONFIG_PATH = '/userdisk/radio_config.json';
const LEGACY_SETTINGS_PATH = '/userdisk/radio_settings.json';
const LEGACY_VOL_PATH = '/userdisk/radio_volume.txt';
const LEGACY_LAST_PATH = '/userdisk/radio_last.txt';
const LEGACY_FAV_PATH = '/userdisk/radio_fav.txt';

const DURATIONS = [15, 30, 60, 90];

let _io = null;
let _saveTimer = null;
let _lastState = null;

function doSaveNow(state) {
  if (!_io || !state) return;
  const favKeys = [];
  if (state.favs) {
    for (const k in state.favs) {
      if (state.favs[k]) {
        const num = parseInt(k, 10);
        if (!isNaN(num)) favKeys.push(num);
      }
    }
  }
  favKeys.sort(function (a, b) { return a - b; });

  const cfg = {
    idx: typeof state.idx === 'number' ? state.idx : 0,
    volume: typeof state.volumeLevel === 'number' ? state.volumeLevel : 50,
    favs: favKeys,
    vizStyle: typeof state.vizStyle === 'number' ? state.vizStyle : 8,
    colorTheme: state.colorTheme || 'rainbow',
    randomMode: !!state.randomMode,
    sleepMinutes: state._sleepMinutes || 0,
    sleepUntil: state._sleepUntil || 0
  };

  const jsonStr = JSON.stringify(cfg);
  console.warn('[radio_settings] doSaveNow: ' + jsonStr);

  // 1. 主配置文件（统一 JSON）
  _io.writeFile(CONFIG_PATH, jsonStr);

  // 2. 兼容性多文件同步（供系统其他模块或旧脚本读取）
  const legacySettings = JSON.stringify({
    randomMode: cfg.randomMode,
    vizStyle: cfg.vizStyle,
    colorTheme: cfg.colorTheme,
    sleepUntil: cfg.sleepUntil,
    sleepMinutes: cfg.sleepMinutes
  });
  _io.writeFile(LEGACY_SETTINGS_PATH, legacySettings);
  _io.writeFile(LEGACY_VOL_PATH, String(cfg.volume));
  _io.writeFile(LEGACY_LAST_PATH, String(cfg.idx));
  _io.writeFile(LEGACY_FAV_PATH, favKeys.join(','));
}

function scheduleSave(state) {
  _lastState = state;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function () {
    _saveTimer = null;
    doSaveNow(_lastState);
  }, 120);
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
      doSaveNow(state);
      return;
    }
    state._sleepTimer = setTimeout(tick, Math.min(30000, left));
  };
  tick();
}

export default {
  async load(io) {
    _io = io;
    console.warn('[radio_settings] 开始读取完整配置...');

    // 1. 优先读取主配置文件 /userdisk/radio_config.json
    try {
      const raw = await io.readFile(CONFIG_PATH, 3000);
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw.trim());
        if (parsed && typeof parsed === 'object') {
          console.warn('[radio_settings] 成功加载主配置 radio_config.json: ' + raw.trim());
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[radio_settings] 读取主配置异常，尝试兼容加载旧版文件: ' + e);
    }

    // 2. 兼容兜底：如果主配置文件尚不存在，依次读取 4 个旧版独立文件
    console.warn('[radio_settings] 主配置不存在，尝试从独立持久化文件恢复...');
    const legacy = {
      idx: 0,
      volume: 50,
      favs: [],
      vizStyle: 8,
      colorTheme: 'rainbow',
      randomMode: false,
      sleepMinutes: 0,
      sleepUntil: 0
    };

    // 读上次电台
    try {
      const lOut = await io.readFile(LEGACY_LAST_PATH, 2000);
      const lIdx = parseInt(String(lOut).trim(), 10);
      if (!isNaN(lIdx) && lIdx >= 0) legacy.idx = lIdx;
    } catch (e) {}

    // 读音量
    try {
      const vOut = await io.readFile(LEGACY_VOL_PATH, 2000);
      const vol = parseInt(String(vOut).trim(), 10);
      if (!isNaN(vol) && vol >= 0 && vol <= 100) legacy.volume = vol;
    } catch (e) {}

    // 读收藏
    try {
      const fOut = await io.readFile(LEGACY_FAV_PATH, 2000);
      if (fOut && fOut.trim()) {
        const parts = fOut.replace(/\s+/g, '').split(',');
        for (let i = 0; i < parts.length; i++) {
          const fn = parseInt(parts[i], 10);
          if (!isNaN(fn) && fn >= 0) legacy.favs.push(fn);
        }
      }
    } catch (e) {}

    // 读通用设置
    try {
      const sOut = await io.readFile(LEGACY_SETTINGS_PATH, 2000);
      if (sOut && sOut.trim()) {
        const sObj = JSON.parse(sOut.trim());
        if (typeof sObj.vizStyle === 'number') legacy.vizStyle = sObj.vizStyle;
        if (sObj.colorTheme) legacy.colorTheme = sObj.colorTheme;
        if (typeof sObj.randomMode === 'boolean') legacy.randomMode = sObj.randomMode;
        if (sObj.sleepMinutes) legacy.sleepMinutes = sObj.sleepMinutes;
        if (sObj.sleepUntil) legacy.sleepUntil = sObj.sleepUntil;
      }
    } catch (e) {}

    console.warn('[radio_settings] 从旧版独立文件恢复配置完成: ' + JSON.stringify(legacy));
    return legacy;
  },

  apply(state, config) {
    if (!config || typeof config !== 'object') return;

    // 1. 电台索引
    if (typeof config.idx === 'number' && config.idx >= 0 && state.STATIONS && config.idx < state.STATIONS.length) {
      state.idx = config.idx;
      state.stName = state.STATIONS[config.idx].n;
    }

    // 2. 音量
    if (typeof config.volume === 'number' && config.volume >= 0 && config.volume <= 100) {
      state._masterVolume = config.volume;
      state.volumeLevel = config.volume;
      state._volumeRestored = true;
      try {
        if (state._volume && state._volume.setVolume) {
          state._volume.setVolume(config.volume);
        }
      } catch (e) {}
    }

    // 3. 收藏列表
    if (Array.isArray(config.favs)) {
      const fMap = {};
      for (let i = 0; i < config.favs.length; i++) {
        fMap[config.favs[i]] = true;
      }
      state.favs = fMap;
      state._favSeq = (state._favSeq || 0) + 1;
    }

    // 4. 频谱样式与色彩
    if (typeof config.vizStyle === 'number' && config.vizStyle >= 0 && config.vizStyle <= 8) {
      state.vizStyle = config.vizStyle;
    }
    if (config.colorTheme) {
      state.colorTheme = config.colorTheme;
      if (typeof state.applyColorLut === 'function') {
        state.applyColorLut(config.colorTheme);
      }
    }

    // 5. 随机模式与定时
    state.randomMode = !!config.randomMode;
    state._sleepMinutes = config.sleepMinutes || 0;
    if (config.sleepUntil > Date.now()) {
      updateTimer(state, config.sleepUntil);
    }

    // 写入一次确立 radio_config.json
    doSaveNow(state);
  },

  flush(state) {
    if (_saveTimer) {
      clearTimeout(_saveTimer);
      _saveTimer = null;
    }
    doSaveNow(state);
  },

  save(state) {
    scheduleSave(state);
  },

  setStation(state, idx) {
    state.idx = idx;
    scheduleSave(state);
  },

  setVolume(state, volume) {
    state.volumeLevel = volume;
    state._masterVolume = volume;
    scheduleSave(state);
  },

  setFavs(state, favs) {
    state.favs = favs;
    scheduleSave(state);
  },

  setVizStyle(state, styleIdx) {
    state.vizStyle = styleIdx % 9;
    scheduleSave(state);
  },

  cycleVizStyle(state) {
    state.vizStyle = (state.vizStyle + 1) % 9;
    scheduleSave(state);
  },

  setColorTheme(state, themeKey) {
    state.colorTheme = themeKey;
    scheduleSave(state);
  },

  toggleRandom(state) {
    state.randomMode = !state.randomMode;
    scheduleSave(state);
  },

  cycleSleep(state) {
    const current = state._sleepMinutes || 0;
    const next = DURATIONS[(DURATIONS.indexOf(current) + 1) % DURATIONS.length];
    state._sleepMinutes = next;
    updateTimer(state, Date.now() + next * 60000);
    scheduleSave(state);
  },

  cancelSleep(state) {
    if (state._sleepTimer) clearTimeout(state._sleepTimer);
    state._sleepTimer = null;
    state._sleepUntil = 0;
    state._sleepMinutes = 0;
    state.sleepLabel = '';
    scheduleSave(state);
  }
};
