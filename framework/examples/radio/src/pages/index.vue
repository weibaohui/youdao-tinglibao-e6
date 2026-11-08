<template>
  <div class="page">
    <!-- ================= 设置界面 ================= -->
    <div v-if="settingsOpen" class="settings-fullpage">
      <div class="settings-header">
        <text class="settings-title">收听设置</text>
        <text class="settings-close" @click="closeSettings">完成</text>
      </div>
      <div class="hairline"></div>
      <scroller class="settings-scroller">
        <!-- 频谱效果 -->
        <div class="settings-section">
          <text class="settings-label">频谱效果</text>
          <div class="setting-row" @click="cycleVizStyle">
            <text class="setting-name">显示样式</text>
            <text class="setting-value">{{ vizStyles[vizStyle] }} ›</text>
          </div>
          <div class="setting-row" @click="cycleColorTheme">
            <text class="setting-name">色彩方案</text>
            <text class="setting-value">{{ colorThemeName() }} ›</text>
          </div>
          <div class="color-presets">
            <div v-for="t in colorThemes" :key="t.key" class="color-preset" :style="colorPresetStyle(t.key)" @click="setColorTheme(t.key)">
              <text :style="{color: colorTheme === t.key ? '#ffffff' : '#8b949e', fontSize:'10px', fontWeight: colorTheme === t.key ? 'bold' : 'normal'}">{{ t.name }}</text>
            </div>
          </div>
          <div class="setting-row" @click="cycleSpecMode">
            <text class="setting-name">律动模式</text>
            <text class="setting-value">{{ specMode === 'real' ? '随音乐律动' : '模拟动画' }} ›</text>
          </div>
          <div class="spec-mode-presets">
            <div class="spec-mode-preset" :style="specModeBtnStyle('real')" @click="setSpecMode('real')">
              <text :style="specModeTextStyle('real')">随音乐律动</text>
            </div>
            <div class="spec-mode-preset" :style="specModeBtnStyle('sim')" @click="setSpecMode('sim')">
              <text :style="specModeTextStyle('sim')">模拟动画</text>
            </div>
          </div>
        </div>

        <!-- 音量 -->
        <div class="settings-section volume-section">
          <text class="settings-label">音量</text>
          <div class="volume-value-row">
            <div class="volume-step" @click="adjustVolumeBy(-1)"><text class="volume-step-text">−</text></div>
            <div class="volume-number-wrap"><text class="volume-number">{{ volumeLevel }}</text><text class="volume-unit">/ 100</text></div>
            <div class="volume-step" @click="adjustVolumeBy(1)"><text class="volume-step-text">＋</text></div>
          </div>
          <div class="volume-presets">
            <div v-for="level in volumePresets" :key="level" class="volume-preset" :style="volumePresetStyle(level)" @click="setVolumeLevel(level)">
              <text :style="{color: volumeLevel === level ? '#ffffff' : '#8b949e', fontSize:'10px', fontWeight: volumeLevel === level ? 'bold' : 'normal'}">{{ level }}</text>
            </div>
          </div>
        </div>

        <!-- 播放模式与随机范围 -->
        <div class="settings-section">
          <text class="settings-label">播放模式</text>
          <div class="setting-row" @click="toggleRandom">
            <text class="setting-name">随机切台</text>
            <text class="setting-value">{{ randomMode ? '开启' : '关闭' }}</text>
          </div>
          <div v-if="randomMode" class="setting-row" @click="cycleRandomScope">
            <text class="setting-name">随机范围</text>
            <text class="setting-value">{{ randomScopeLabel() }} ›</text>
          </div>
          <div v-if="randomMode" class="scope-presets">
            <div v-for="s in randomScopes" :key="s.key" class="scope-preset"
                 :style="randomScopeStyle(s.key)" @click="setRandomScope(s.key)">
              <text :style="randomScopeTextStyle(s.key)">{{ s.name }}</text>
            </div>
          </div>
        </div>

        <!-- 睡眠定时 -->
        <div class="settings-section">
          <text class="settings-label">睡眠定时</text>
          <div class="setting-row" @click="cycleSleep">
            <text class="setting-name">{{ sleepLabel || '关闭' }}</text>
            <text class="setting-value">{{ sleepLabel ? '更改' : '设置' }}</text>
          </div>
          <div v-if="sleepLabel" class="setting-row" @click="cancelSleep">
            <text class="setting-name">取消定时</text>
            <text class="setting-value">×</text>
          </div>
        </div>
      </scroller>
    </div>

    <!-- ================= 主界面 (统一播放界面) ================= -->
    <div v-else-if="view==='main'" class="fillcol">
      <!-- 顶栏：标题 + 收藏/列表/设置/退出 -->
      <div class="topbar">
        <text class="topbar-title">网络收音机</text>
        <div class="topbar-right">
          <div class="top-action favorite-action" @click="toggleFavCurrent">
            <text :style="{color: isFavCurrent() ? '#e3b341' : '#8b949e', fontSize:'15px'}">{{ isFavCurrent() ? '★' : '☆' }}</text>
          </div>
          <div class="top-action text-action" @click="openList"><text class="top-action-text">列表</text></div>
          <div class="top-action text-action settings-action" @click="openSettings"><text class="top-action-text settings-action-text">设置</text></div>
          <div class="top-action close-action" @click="exitApp"><text class="close-action-text">×</text></div>
        </div>
      </div>
      <div class="hairline"></div>

      <!-- 状态指示行（左：播放状态，中：音量，右：模式与台数） -->
      <div class="statusrow">
        <div class="status-badge" @click="toggle" :style="{backgroundColor: playing ? '#132e1b' : '#1c2128', borderColor: playing ? '#238636' : (stateColor === '#d29922' ? '#9e6a03' : '#30363d')}">
          <div :style="{width:'6px',height:'6px',borderRadius:'3px',backgroundColor: playing ? '#3fb950' : stateColor,marginRight:'4px'}"></div>
          <text v-if="playing" class="status-text" :style="{color:'#3fb950',fontSize:'10px',fontWeight:'bold'}">播放中</text>
          <text v-else class="status-text" :style="{color:stateColor,fontSize:'10px',fontWeight:'bold'}">{{ stateText }}</text>
        </div>
        <div class="status-vol" @click="openQuickVol">
          <text class="status-vol-text">{{ volumeLevel }}</text>
        </div>
        <div class="status-actions">
          <div v-if="randomMode" class="random-badge" @click="cycleRandomScope">
            <text class="random-badge-txt">随 {{ randomScopeLabel() }}</text>
          </div>
          <text :style="{color: '#8b949e', fontSize:'11px', marginRight:'8px'}">#{{ currentStation ? currentStation.id : 1 }} · {{ totalStationsText() }}</text>
        </div>
      </div>

      <!-- 大台名与分类小标签 -->
      <div class="stname-wrap">
        <text class="stname-big">{{ stName }}</text>
        <div class="st-tags-row">
          <text v-if="currentStation && (currentStation.province || currentStation.country)" class="st-badge st-badge-loc">{{ currentStation.province || currentStation.country }}</text>
          <text v-if="currentStation && currentStation.genre" class="st-badge st-badge-genre">{{ currentStation.genre }}</text>
          <text v-if="currentStation && currentStation.fmt" class="st-badge st-badge-fmt">{{ currentStation.fmt }}</text>
        </div>
      </div>

      <!-- 宽幅频谱区（单击播/停，双击切换律动效果，左右滑动切台） -->
      <div class="specwrap" @click="onSpecClick" @touchstart="onMainTS" @touchend="onMainTE">
        <div v-if="vizStyle===0" class="specB">
          <div v-for="i in colIdx" :key="i" class="specB-col">
            <div class="specB-up"><div :style="upStyleB(i)"></div></div>
            <div class="specB-dn"><div :style="dnStyleB(i)"></div></div>
          </div>
        </div>
        <div v-else-if="vizStyle===1" class="specB-classic">
          <div v-for="i in colIdx" :key="i" class="specB-classic-col"><div :style="classicStyleB(i)"></div></div>
        </div>
        <div v-else-if="vizStyle===2" class="specB-dots">
          <div v-for="i in colIdx" :key="i" class="specB-dots-col">
            <div v-for="s in segIdx" :key="s" :style="dotStyleB(i, s)"></div>
          </div>
        </div>
        <div v-else-if="vizStyle===3" class="specB-classic">
          <div v-for="i in colIdx" :key="i" class="specB-classic-col">
            <div class="peakcol">
              <div :style="peakStyleB(i)"></div>
              <div :style="classicStyleB(i)"></div>
            </div>
          </div>
        </div>
        <div v-else-if="vizStyle===4" class="specB-wave">
          <div v-for="i in colIdx" :key="i" class="specB-col">
            <div class="specB-up"><div :style="waveUpStyle(i)"></div></div>
            <div class="specB-dn"><div :style="dnStyleB(i)"></div></div>
          </div>
        </div>
        <div v-else-if="vizStyle===5" class="specB-radial">
          <div class="radial-center"></div>
          <div v-for="i in colIdx" :key="i" class="radial-col" :style="radialColStyle(i)">
            <div v-for="s in radialSegIdx" :key="s" :style="radialDotStyle(i, s)"></div>
          </div>
        </div>
        <div v-else-if="vizStyle===6" class="specB-fall">
          <div v-for="r in fallRowIdx" :key="r" class="fall-row">
            <div v-for="i in colIdx" :key="i" class="fall-col">
              <div v-for="s in fallSegIdx" :key="s" :style="fallDotStyle(i, r, s)"></div>
            </div>
          </div>
        </div>
        <div v-else-if="vizStyle===7" class="specB-classic">
          <div v-for="i in colIdx" :key="i" class="specB-classic-col">
            <div class="partcol">
              <div v-for="s in partSegIdx" :key="s" :style="partDotStyle(i, s)"></div>
              <div :style="classicStyleB(i)"></div>
            </div>
          </div>
        </div>
        <!-- 样式 8：横向专业分贝仪表（dBFS 峰值电平表） -->
        <div v-else class="specB-dbmeter">
          <div class="dbm-card">
            <div class="dbm-scale">
              <text v-for="m in dbmMarks" :key="m.d"
                    :class="['dbm-mark', m.is0 ? 'dbm-mark-0' : '']"
                    :style="m.r ? {right: m.r} : {left: m.l}">{{ m.d }}</text>
            </div>
            <div class="dbm-ticks">
              <div v-for="m in dbmMarks" :key="m.d"
                   :class="['dbm-tick-line', m.is0 ? 'dbm-tick-0' : '']"
                   :style="m.tr ? {right: m.tr} : {left: m.tl}"></div>
            </div>

            <div class="dbm-bars-wrap">
              <div class="dbm-channel">
                <div class="dbm-track-bg">
                  <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-dark-' + s]"></div>
                </div>
                <div class="dbm-fill-clip" :style="{width: getDbmFillL()}">
                  <div class="dbm-lit-inner">
                    <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-lit-' + s]"></div>
                  </div>
                </div>
                <div class="dbm-peak-line" :style="{left: getDbmPeakLeftL(), opacity: getDbmPeakOpL()}"></div>
              </div>

              <div class="dbm-channel">
                <div class="dbm-track-bg">
                  <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-dark-' + s]"></div>
                </div>
                <div class="dbm-fill-clip" :style="{width: getDbmFillR()}">
                  <div class="dbm-lit-inner">
                    <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-lit-' + s]"></div>
                  </div>
                </div>
                <div class="dbm-peak-line" :style="{left: getDbmPeakLeftR(), opacity: getDbmPeakOpR()}"></div>
              </div>
            </div>

            <div class="dbm-footer">
              <text class="dbm-ch-lbl">CH 1/2 · L/R</text>
              <text class="dbm-unit-lbl">dBFS PEAK</text>
            </div>
          </div>
        </div>
      </div>

      <!-- 上下台导轨卡片（点按直接切台） -->
      <div class="tuner-card">
        <div class="tuner-item" @click="cut(-1)">
          <text class="tuner-tag">▲</text>
          <text class="tuner-name">{{ dialPrevName || '上一台' }}</text>
        </div>
        <div class="tuner-div"></div>
        <div class="tuner-item" @click="cut(1)">
          <text class="tuner-tag">▼</text>
          <text class="tuner-name">{{ dialNextName || '下一台' }}</text>
        </div>
      </div>

      <!-- 快速音量设置弹窗 -->
      <div v-if="quickVolOpen" class="quick-vol-mask" @click="closeQuickVol">
        <div class="quick-vol-card" @click="onCardClick">
          <div class="quick-vol-header">
            <text class="quick-vol-title">快速音量</text>
            <div class="quick-vol-cur-wrap">
              <text class="quick-vol-cur-num">{{ volumeLevel }}</text>
              <text class="quick-vol-cur-unit">/100</text>
            </div>
            <div class="quick-vol-close" @click="closeQuickVol">
              <text class="quick-vol-close-txt">×</text>
            </div>
          </div>

          <div class="quick-vol-stepper">
            <div class="quick-step-btn" @click="adjustVolumeBy(-1)"><text class="quick-step-txt">−</text></div>
            <text class="quick-step-hint">点击数字快速设定 0-10</text>
            <div class="quick-step-btn" @click="adjustVolumeBy(1)"><text class="quick-step-txt">＋</text></div>
          </div>

          <div class="quick-vol-grid">
            <div class="quick-vol-btn" :style="quickVolBtnStyle(1)" @click="selectQuickVol(1)"><text :style="quickVolTextStyle(1)">1</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(2)" @click="selectQuickVol(2)"><text :style="quickVolTextStyle(2)">2</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(3)" @click="selectQuickVol(3)"><text :style="quickVolTextStyle(3)">3</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(4)" @click="selectQuickVol(4)"><text :style="quickVolTextStyle(4)">4</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(5)" @click="selectQuickVol(5)"><text :style="quickVolTextStyle(5)">5</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(6)" @click="selectQuickVol(6)"><text :style="quickVolTextStyle(6)">6</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(7)" @click="selectQuickVol(7)"><text :style="quickVolTextStyle(7)">7</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(8)" @click="selectQuickVol(8)"><text :style="quickVolTextStyle(8)">8</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(0)" @click="selectQuickVol(0)"><text :style="quickVolTextStyle(0)">静音</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(9)" @click="selectQuickVol(9)"><text :style="quickVolTextStyle(9)">9</text></div>
            <div class="quick-vol-btn" :style="quickVolBtnStyle(10)" @click="selectQuickVol(10)"><text :style="quickVolTextStyle(10)">10</text></div>
            <div class="quick-vol-btn quick-vol-done" @click="closeQuickVol"><text class="quick-vol-done-txt">关闭</text></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= 列表界面 (三大专区 + 二级精选 + 原汁原味行布局) ================= -->
    <div v-else class="fillcol">
      <!-- 列表顶栏 -->
      <div class="topbar">
        <div class="topbar-right">
          <div class="hotzone" @click="closeList"><text :style="{color:'#79c0ff',fontSize:'16px'}">‹</text></div>
          <text :style="{color:'#e6edf3',fontSize:'13px',fontWeight:'bold'}">电台列表</text>
        </div>
        <text :style="{color:'#8b949e',fontSize:'10px',marginRight:'12px'}">{{ totalCount }} 台</text>
      </div>
      <div class="hairline"></div>

      <!-- 一级大分类 Tab 栏 (宽阔舒适，清晰明了) -->
      <div class="scope-tabbar">
        <div :style="scopeTabStyle('cn')" @click="setScope('cn')">
          <text :style="scopeTabTextStyle('cn')">国内 {{ counts.cn }}</text>
        </div>
        <div :style="scopeTabStyle('intl')" @click="setScope('intl')">
          <text :style="scopeTabTextStyle('intl')">国际 {{ counts.intl }}</text>
        </div>
        <div :style="scopeTabStyle('fav')" @click="setScope('fav')">
          <text :style="scopeTabTextStyle('fav')">★收藏 {{ counts.fav }}</text>
        </div>
      </div>

      <!-- 二级细分选择条 (国内：全部/国家级/省份/题材/搜；国际：全部/英语听力/流行/古典/搜) -->
      <div class="filter-subbar">
        <div v-if="activeScope === 'cn'" class="filter-pills-row">
          <div :style="pillStyle(isCnAllSelected())" @click="resetCnFilters"><text :style="pillTextStyle(isCnAllSelected())">全部</text></div>
          <div :style="pillStyle(selectedProv === '国家级')" @click="selectQuickProv('国家级')"><text :style="pillTextStyle(selectedProv === '国家级')">国家台</text></div>
          <div :style="pillStyle(selectedProv !== '全部' && selectedProv !== '国家级')" @click="openProvModal">
            <text :style="pillTextStyle(selectedProv !== '全部' && selectedProv !== '国家级')">{{ selectedProv !== '全部' && selectedProv !== '国家级' ? selectedProv : '省份▼' }}</text>
          </div>
          <div :style="pillStyle(selectedGenre !== '全部')" @click="openGenreModal">
            <text :style="pillTextStyle(selectedGenre !== '全部')">{{ selectedGenre !== '全部' ? selectedGenre : '题材▼' }}</text>
          </div>
          <div :style="pillStyle(searching || kw)" @click="toggleSearchBox">
            <text :style="pillTextStyle(searching || kw)">{{ kw ? '搜:有' : '搜' }}</text>
          </div>
        </div>

        <div v-else-if="activeScope === 'intl'" class="filter-pills-row">
          <div :style="pillStyle(selectedGenre === '全部')" @click="selectIntlGenre('全部')"><text :style="pillTextStyle(selectedGenre === '全部')">全部</text></div>
          <div :style="pillStyle(selectedGenre === '英语听力')" @click="selectIntlGenre('英语听力')"><text :style="pillTextStyle(selectedGenre === '英语听力')">英语听力</text></div>
          <div :style="pillStyle(selectedGenre === '流行音乐')" @click="selectIntlGenre('流行音乐')"><text :style="pillTextStyle(selectedGenre === '流行音乐')">欧美流行</text></div>
          <div :style="pillStyle(selectedGenre === '古典' || selectedGenre === '爵士')" @click="selectIntlGenre('古典')"><text :style="pillTextStyle(selectedGenre === '古典' || selectedGenre === '爵士')">古典/爵士</text></div>
          <div :style="pillStyle(searching || kw)" @click="toggleSearchBox">
            <text :style="pillTextStyle(searching || kw)">{{ kw ? '搜:有' : '搜' }}</text>
          </div>
        </div>

        <div v-else class="filter-pills-row">
          <div :style="pillStyle(true)"><text :style="pillTextStyle(true)">全部我的收藏 ({{ counts.fav }} 台)</text></div>
          <div :style="pillStyle(searching || kw)" @click="toggleSearchBox">
            <text :style="pillTextStyle(searching || kw)">{{ kw ? '搜:有' : '搜' }}</text>
          </div>
        </div>
      </div>

      <!-- 搜索栏 (仅当用户点击「搜」或存在搜索关键词时动态展开，不挤压列表高度) -->
      <div v-if="searching || kw" class="searchrow">
        <div class="search-active-row">
          <input ref="searchInput" class="searchbox" placeholder="搜索台名/省市/题材" :value="kw" @input="onKw" @blur="onSearchBlur" />
          <div class="search-cancel" @click="cancelSearch">
            <text class="search-cancel-txt">取消</text>
          </div>
        </div>
      </div>

      <!-- 电台列表分页内容 (每页 5 行，延续经典版式，蓝字 HLS/AAC 徽标 + 星标) -->
      <div class="pagebox" @touchstart="onPageTS" @touchend="onPageTE">
        <div v-for="it in pagedStations" :key="it.id" class="lrow">
          <div class="lrow-main" @click="playStationObj(it)">
            <text :style="{color:'#484f58',fontSize:'10px',width:'28px'}">{{ it.id }}</text>
            <text :style="currentStation && it.id === currentStation.id ? rs : rn">{{ it.name }}</text>
          </div>
          <!-- 格式标签 (HLS / AAC / MP3) -->
          <text v-if="it.fmt" :style="{color:'#79c0ff',fontSize:'9px',marginRight:'6px'}">{{ it.fmt }}</text>
          <!-- 收藏星标 -->
          <div class="lrow-star" @click="toggleFavStation(it)">
            <text :style="{color: it.is_fav ? '#e3b341' : '#484f58', fontSize:'15px'}">{{ it.is_fav ? '★' : '☆' }}</text>
          </div>
        </div>
        <div v-if="pagedStations.length === 0" class="lempty">
          <text :style="{color:'#8b949e',fontSize:'12px'}">{{ activeScope === 'fav' ? '暂无收藏' : '无结果' }}</text>
        </div>
      </div>

      <!-- 分页控制栏 -->
      <div class="pagebar" v-if="totalCount > 0">
        <div class="pgbtn" @click="turnPage(-1)"><text :style="{color: pg > 0 ? '#79c0ff' : '#484f58', fontSize:'16px'}">▲</text></div>
        <text :style="{color:'#8b949e',fontSize:'11px'}">{{ pg + 1 }} / {{ totalPages }}</text>
        <div class="pgbtn" @click="turnPage(1)"><text :style="{color: pg < totalPages - 1 ? '#79c0ff' : '#484f58', fontSize:'16px'}">▼</text></div>
      </div>

      <!-- 题材选择弹窗 -->
      <div v-if="genreModalOpen" class="modal-mask" @click="closeModals">
        <div class="modal-card" @click="onCardClick">
          <div class="modal-header">
            <text class="modal-title">选择电台题材</text>
            <div class="modal-close" @click="closeModals"><text class="modal-close-txt">×</text></div>
          </div>
          <div class="modal-grid">
            <div v-for="g in genresList" :key="g.code" class="modal-chip"
                 :style="{backgroundColor: selectedGenre === g.code ? '#1f6feb' : '#21262d'}"
                 @click="selectGenre(g.code)">
              <text :style="{color: selectedGenre === g.code ? '#ffffff' : '#c9d1d9', fontSize:'11px'}">{{ g.name }}</text>
            </div>
          </div>
        </div>
      </div>

      <!-- 省份选择弹窗 -->
      <div v-if="provModalOpen" class="modal-mask" @click="closeModals">
        <div class="modal-card modal-card-tall" @click="onCardClick">
          <div class="modal-header">
            <text class="modal-title">选择省市地区</text>
            <div class="modal-close" @click="closeModals"><text class="modal-close-txt">×</text></div>
          </div>
          <scroller class="modal-scroller">
            <div class="modal-grid">
              <div v-for="p in provincesList" :key="p.code" class="modal-chip"
                   :style="{backgroundColor: selectedProv === p.code ? '#1f6feb' : '#21262d'}"
                   @click="selectProv(p.code)">
                <text :style="{color: selectedProv === p.code ? '#ffffff' : '#c9d1d9', fontSize:'11px'}">{{ p.name }}</text>
              </div>
            </div>
          </scroller>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import buttonEventModule from 'buttonEvent';
import soundPlayerModule from 'soundPlayer';
import volumeModule from 'volume';
import process from 'process';
import RadioSettings from './radio_settings.js';
import radioDb from './radio_db.js';

const PAGE_SIZE = 5;
const ROW_NAME = { color: '#e6edf3', fontSize: '13px', fontWeight: 'normal', flex: 1, lines: 1, textOverflow: 'ellipsis' };
const ROW_NAME_SEL = { color: '#79c0ff', fontSize: '13px', fontWeight: 'bold', flex: 1, lines: 1, textOverflow: 'ellipsis' };

export default {
  data() {
    return {
      totalCount: 1903,
      totalPages: 381,
      pg: 0,
      currentStation: null,
      stName: '收音机加载中…',
      dialPrevName: '',
      dialNextName: '',
      pagedStations: [],

      // 统计数据
      counts: { all: 2105, cn: 1903, intl: 202, fav: 0 },

      // 播放状态与声谱
      playing: false,
      stateText: '按播放键开始收听',
      stateColor: '#8b949e',
      spec: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      peak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      view: 'main',

      // 随机播放与范围
      randomMode: false,
      randomScope: 'cn', // 'cn'(仅国内), 'intl'(仅国际), 'all'(全库), 'fav'(仅收藏)
      randomScopes: [
        { key: 'cn', name: '国内电台' },
        { key: 'intl', name: '国际广播' },
        { key: 'all', name: '全库随机' },
        { key: 'fav', name: '我的收藏' }
      ],

      volumeLevel: 50,
      volumePresets: [0, 20, 40, 60, 80, 100],
      sleepLabel: '',
      settingsOpen: false,
      quickVolOpen: false,
      genreModalOpen: false,
      provModalOpen: false,

      // 分类与筛选
      activeScope: 'cn', // 默认展示国内 1903 台
      selectedGenre: '全部',
      selectedProv: '全部',
      genresList: [],
      provincesList: [],
      kw: '',
      searching: false,

      // 频谱样式与主题
      vizStyle: 8,
      specMode: 'real', // 'real': 随音乐律动, 'sim': 模拟动画
      vizStyles: ['双向镜像', '经典柱状', 'LED点阵', '峰值山峰', '动感波峰', '环形雷达', '瀑布流', '粒子散落', '分贝电平'],
      dbmValL: 0, dbmValR: 0, dbmPeakL: 0, dbmPeakR: 0,
      dbmMarks: [
        { d: '-60', l: '0px', tl: '7px' },
        { d: '-36', l: '40px', tl: '48px' },
        { d: '-24', l: '82px', tl: '90px' },
        { d: '-18', l: '120px', tl: '128px' },
        { d: '-12', l: '154px', tl: '162px' },
        { d: '-6', l: '178px', tl: '184px' },
        { d: '0', r: '2px', tr: '5px', is0: true }
      ],
      dbmSecs: ['green', 'yellow', 'red'],
      colorTheme: 'rainbow',
      colorThemes: [
        { key: 'rainbow', name: '彩色' },
        { key: 'mono', name: '灰白' },
        { key: 'random', name: '随机' },
        { key: 'cyber', name: '赛博' },
        { key: 'amber', name: '琥珀' }
      ],
      colIdx: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      radialSegIdx: [3,2,1,0],
      fallRowIdx: [0,1,2,3],
      fallSegIdx: [3,2,1,0],
      partSegIdx: [3,2,1,0],
      segIdx: [10,9,8,7,6,5,4,3,2,1,0],
      rn: ROW_NAME,
      rs: ROW_NAME_SEL
    };
  },

  created() {
    this.initApp();
    this.startWaveLoop();
  },

  beforeDestroy() {
    this.cleanup();
  },

  destroyed() {
    this.cleanup();
  },

  methods: {
    cleanup() {
      if (this._specClickTimer) clearTimeout(this._specClickTimer);
      if (this._wave) clearInterval(this._wave);
      if (this._specPoll) clearInterval(this._specPoll);
      try { RadioSettings.flush(this); } catch (e) {}
      this.stopAll();
    },

    async initApp() {
      const self = this;
      this._sp = new soundPlayerModule.SoundPlayer();
      this._masterVolume = 50;
      this._volumeRestored = false;
      this._specHist = [];

      // 1. 启动轻量音频能量探针
      try {
        process.exec('sh', ['-c', 'ps | grep -v grep | grep -q e6_sound_meter || (start-stop-daemon -S -b -x /userdisk/e6_sound_meter || nohup /userdisk/e6_sound_meter </dev/null >/dev/null 2>&1 &)']);
      } catch (e) {}

      // 2. 初始化硬件音量
      try {
        this._volume = new volumeModule.Volume();
        if (this._volume.callBackVolumeValue && this._volume.callBackVolumeValue.on) {
          this._volume.callBackVolumeValue.on(function (v) {
            const n = Number(v);
            if (isNaN(n) || n < 0 || n > 100) return;
            if (!self._volumeRestored) return;
            self._masterVolume = n;
            self.volumeLevel = n;
            RadioSettings.setVolume(self, n);
          });
        }
      } catch (e) { this._volume = null; }

      // 3. 确保 SQLite 就绪并加载分类与准确电台总数
      await radioDb.ensureDatabase();
      try {
        const catData = await radioDb.getCategories();
        this.provincesList = catData.provinces;
        this.genresList = catData.genres;
        if (catData.counts) this.counts = catData.counts;
      } catch (e) {
        console.warn('[radio] load categories error:', e);
      }

      // 4. 构建配置 IO 并恢复设置 (含 randomScope)
      const io = {
        async readFile(path, timeout) {
          try {
            const r = await process.exec('cat', [path], { timeout: timeout || 3000 });
            return (r && r.stdout) || '';
          } catch (e) { return ''; }
        },
        async writeFile(path, content, timeout) {
          try {
            const safe = String(content).replace(/'/g, "'\\''");
            const r = await process.exec('sh', ['-c', "echo '" + safe + "' > " + path], { timeout: timeout || 3000 });
            return r && r.code === 0;
          } catch (e) { return false; }
        }
      };
      this._radioSettingsIO = io;

      try {
        const cfg = await RadioSettings.load(io);
        RadioSettings.apply(this, cfg);
        if (cfg.randomScope) this.randomScope = cfg.randomScope;
      } catch (e) {
        console.warn('[radio] load config error:', e);
      }

      // 5. 绑定物理按键与频谱轮询
      this.bindPhysicalKeys();
      this.startSpectrumPolling();

      // 6. 从 SQLite 加载上次收听电台
      let lastId = 1;
      try {
        const savedIdStr = await radioDb.getConfig('last_station_id', '1');
        lastId = parseInt(savedIdStr, 10) || 1;
      } catch (e) {}

      let st = await radioDb.getStationById(lastId);
      if (!st) st = await radioDb.getStationById(1);
      if (st) {
        this.currentStation = st;
        this.stName = st.name;
        this.updateTunerNeighbors();
      }

      // 7. 预先刷新一次列表数据并起播
      await this.refreshStations();
      this.startPlayback();
    },

    bindPhysicalKeys() {
      const self = this;
      try {
        const Ctor = buttonEventModule.ButtonEvent || buttonEventModule.buttonEvent;
        const be = new Ctor();
        this._be = be;
        if (be.setButtonEventReady) be.setButtonEventReady(true);

        const onBack = () => {
          if (self.settingsOpen) { self.closeSettings(); return; }
          if (self.genreModalOpen || self.provModalOpen) { self.closeModals(); return; }
          if (self.view === 'list') {
            if (self.pg > 0) { self.turnPage(-1); } else { self.view = 'main'; }
            return;
          }
          self.cut(-1);
        };
        const onForward = () => {
          if (self.view === 'list') { self.turnPage(1); return; }
          self.cut(1);
        };
        const onPlay = () => { self.toggle(); };

        const bindSig = (sig, fn) => {
          if (!sig) return;
          if (typeof sig.on === 'function') sig.on(fn);
          else if (typeof sig.connect === 'function') sig.connect(fn);
        };

        bindSig(be.backButtonClick, onBack);
        bindSig(be.forwardButtonClick, onForward);
        bindSig(be.playButtonClick, onPlay);

        const adjustVolume = (direction) => {
          const newVol = Math.max(0, Math.min(100, self.volumeLevel + direction * 5));
          self.setVolumeLevel(newVol);
        };
        bindSig(be.volumeUpButtonClick, () => adjustVolume(1));
        bindSig(be.volumeDownButtonClick, () => adjustVolume(-1));
      } catch (e) {
        console.warn('[radio] bindPhysicalKeys error:', e);
      }
    },

    // 刷新电台列表（异步查询 SQLite）
    async refreshStations(resetPage = false) {
      if (resetPage) this.pg = 0;
      const filter = this.getCurrentFilter();
      filter.offset = this.pg * PAGE_SIZE;
      filter.limit = PAGE_SIZE;
      filter.kw = this.kw;

      try {
        const res = await radioDb.getStations(filter);
        this.totalCount = res.total;
        this.pagedStations = res.items;
        this.totalPages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
        if (this.pg >= this.totalPages) this.pg = Math.max(0, this.totalPages - 1);
      } catch (e) {
        console.warn('[radio] refreshStations error:', e);
      }
    },

    getCurrentFilter() {
      const f = { scope: this.activeScope };
      if (this.selectedGenre && this.selectedGenre !== '全部') f.genre = this.selectedGenre;
      if (this.selectedProv && this.selectedProv !== '全部') f.province = this.selectedProv;
      return f;
    },

    async updateTunerNeighbors() {
      if (!this.currentStation) return;
      const filter = this.getCurrentFilter();
      try {
        const prevSt = await radioDb.getNeighborStation(this.currentStation.id, -1, filter);
        const nextSt = await radioDb.getNeighborStation(this.currentStation.id, 1, filter);
        this.dialPrevName = prevSt ? prevSt.name : '';
        this.dialNextName = nextSt ? nextSt.name : '';
      } catch (e) {}
    },

    // 播放指定电台对象
    async playStationObj(st) {
      if (!st) return;
      this.currentStation = st;
      this.stName = st.name;
      this.view = 'main';
      this.searching = false;
      this.closeModals();

      radioDb.setConfig('last_station_id', String(st.id));
      if (this.colorTheme === 'random') this.applyColorLut('random');

      await this.startPlayback();
      this.updateTunerNeighbors();

      const stationId = st.id;
      setTimeout(() => {
        if (!this.currentStation || this.currentStation.id !== stationId || this.view !== 'main' || this.settingsOpen) return;
        this.startPlayback();
      }, 2000);
    },

    // 上一台 / 下一台切台
    async cut(direction) {
      let target = null;
      if (this.randomMode) {
        // 核心亮点：按用户指定的随机范围进行精准切台
        const curId = this.currentStation ? this.currentStation.id : 0;
        target = await radioDb.getRandomStation(this.randomScope, curId);
      } else {
        const filter = this.getCurrentFilter();
        const currentId = this.currentStation ? this.currentStation.id : 1;
        target = await radioDb.getNeighborStation(currentId, direction, filter);
      }
      if (target) {
        this.playStationObj(target);
      }
    },

    // 随机范围管理
    randomScopeLabel() {
      const map = {
        'cn': '国内',
        'intl': '国际',
        'all': '全库',
        'fav': '收藏'
      };
      return map[this.randomScope] || '国内';
    },

    cycleRandomScope() {
      const next = RadioSettings.cycleRandomScope(this);
      this.randomScope = next;
    },

    setRandomScope(scopeKey) {
      this.randomScope = scopeKey;
      RadioSettings.setRandomScope(this, scopeKey);
    },

    randomScopeStyle(scopeKey) {
      const active = this.randomScope === scopeKey;
      return {
        flex: 1, height: '28px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: active ? '#1f6feb' : '#161b22',
        borderRadius: '6px', marginRight: scopeKey !== 'fav' ? '4px' : '0'
      };
    },

    randomScopeTextStyle(scopeKey) {
      const active = this.randomScope === scopeKey;
      return {
        color: active ? '#ffffff' : '#8b949e',
        fontSize: '10px',
        fontWeight: active ? 'bold' : 'normal'
      };
    },

    totalStationsText() {
      if (this.randomMode) {
        if (this.randomScope === 'cn') return '国内 ' + this.counts.cn;
        if (this.randomScope === 'intl') return '国际 ' + this.counts.intl;
        if (this.randomScope === 'fav') return '收藏 ' + this.counts.fav;
        return '全库 ' + this.counts.all;
      }
      if (this.activeScope === 'cn') return '国内 ' + this.counts.cn;
      if (this.activeScope === 'intl') return '国际 ' + this.counts.intl;
      if (this.activeScope === 'fav') return '收藏 ' + this.counts.fav;
      return '全库 ' + this.counts.all;
    },

    // 收藏管理
    async toggleFavCurrent() {
      if (!this.currentStation) return;
      await radioDb.toggleFav(this.currentStation.id);
      this.currentStation.is_fav = this.currentStation.is_fav ? 0 : 1;
      this.counts.fav = await radioDb.getFavCount();
      this.refreshStations();
    },

    isFavCurrent() {
      return !!(this.currentStation && this.currentStation.is_fav);
    },

    async toggleFavStation(st) {
      if (!st) return;
      await radioDb.toggleFav(st.id);
      st.is_fav = st.is_fav ? 0 : 1;
      if (this.currentStation && this.currentStation.id === st.id) {
        this.currentStation.is_fav = st.is_fav;
      }
      this.counts.fav = await radioDb.getFavCount();
      if (this.activeScope === 'fav' && !st.is_fav) {
        this.refreshStations();
      }
    },

    // 一级大专区切换
    setScope(scope) {
      this.activeScope = scope;
      this.selectedGenre = '全部';
      this.selectedProv = '全部';
      this.refreshStations(true);
    },

    scopeTabStyle(scope) {
      const active = this.activeScope === scope;
      return {
        flex: 1, height: '30px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: active ? '#1f6feb' : '#161b22',
        borderRadius: '15px', marginLeft: '3px', marginRight: '3px'
      };
    },

    scopeTabTextStyle(scope) {
      const active = this.activeScope === scope;
      return {
        color: active ? '#ffffff' : '#8b949e',
        fontSize: '12px',
        fontWeight: active ? 'bold' : 'normal'
      };
    },

    // 二级筛选条交互
    isCnAllSelected() {
      return this.selectedProv === '全部' && this.selectedGenre === '全部';
    },

    resetCnFilters() {
      this.selectedProv = '全部';
      this.selectedGenre = '全部';
      this.refreshStations(true);
    },

    selectQuickProv(p) {
      this.selectedProv = this.selectedProv === p ? '全部' : p;
      this.refreshStations(true);
    },

    selectIntlGenre(g) {
      this.selectedGenre = g;
      this.refreshStations(true);
    },

    pillStyle(selected) {
      return {
        height: '20px', paddingLeft: '5px', paddingRight: '5px',
        borderRadius: '10px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: selected ? '#238636' : '#21262d',
        marginRight: '3px'
      };
    },

    pillTextStyle(selected) {
      return {
        color: selected ? '#ffffff' : '#c9d1d9',
        fontSize: '10px',
        fontWeight: selected ? 'bold' : 'normal'
      };
    },

    openGenreModal() { this.genreModalOpen = true; },
    openProvModal() { this.provModalOpen = true; },
    closeModals() {
      this.genreModalOpen = false;
      this.provModalOpen = false;
    },

    selectGenre(genreCode) {
      this.selectedGenre = genreCode;
      this.closeModals();
      this.refreshStations(true);
    },

    selectProv(provCode) {
      this.selectedProv = provCode;
      this.closeModals();
      this.refreshStations(true);
    },

    // 搜索
    toggleSearchBox() {
      if (this.searching || this.kw) {
        this.cancelSearch();
      } else {
        this.startSearch();
      }
    },

    startSearch() {
      this.searching = true;
      const self = this;
      setTimeout(() => {
        try { if (self.$refs.searchInput && self.$refs.searchInput.focus) self.$refs.searchInput.focus(); } catch (e) {}
      }, 60);
    },

    cancelSearch() {
      this.kw = '';
      this.searching = false;
      this.refreshStations(true);
      try { if (this.$refs.searchInput && this.$refs.searchInput.blur) this.$refs.searchInput.blur(); } catch (e) {}
    },

    onKw(e) {
      this.kw = e && e.value !== undefined ? String(e.value) : '';
      this.refreshStations(true);
    },

    onSearchBlur() {
      if (!this.kw) this.searching = false;
    },

    // 分页
    turnPage(delta) {
      const np = this.pg + delta;
      if (np < 0 || np >= this.totalPages) return;
      this.pg = np;
      this.refreshStations();
    },

    onPageTS(e) {
      const p = this.posOf(e);
      this._sy = p.y; this._sx = p.x;
    },

    onPageTE(e) {
      const p = this.posOf(e);
      const dy = p.y - (this._sy || 0), dx = p.x - (this._sx || 0);
      if (Math.abs(dy) < 30 || Math.abs(dy) < Math.abs(dx)) return;
      this.turnPage(dy < 0 ? 1 : -1);
    },

    posOf(e) {
      try {
        const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
        return { x: Number(t.pageX !== undefined ? t.pageX : t.x) || 0,
                 y: Number(t.pageY !== undefined ? t.pageY : t.y) || 0 };
      } catch (err) { return { x: 0, y: 0 }; }
    },

    // 音频拉流核心逻辑
    async ensureSoundPlayer() {
      for (let i = 0; i < 12; i++) {
        try {
          const r = await process.exec('sh', ['-c', 'ps | grep -c [S]oundPlayer'], { timeout: 5000 });
          if (parseInt(String((r && r.stdout) || '').trim(), 10) > 0) return true;
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return false;
    },

    async startPlayback() {
      const requestId = (this._playRequestId || 0) + 1;
      this._playRequestId = requestId;
      this.stopAll();
      this.playing = false;
      this.stateText = '连接中…';
      this.stateColor = '#d29922';
      await new Promise(resolve => setTimeout(resolve, 200));
      if (requestId !== this._playRequestId) return;
      await this.ensureSoundPlayer();
      if (requestId !== this._playRequestId) return;
      this.playCurrent(requestId);
    },

    toggle() {
      if (this.playing) {
        this._playRequestId = (this._playRequestId || 0) + 1;
        this.stopAll();
        this.playing = false;
        this.stateText = '已暂停';
        this.stateColor = '#8b949e';
      } else {
        this.startPlayback();
      }
    },

    stopAll() {
      const sp = this._sp;
      try { if (sp.quickStop) sp.quickStop(); }
      catch (e) { try { if (sp.stop) sp.stop(); } catch (e2) {} }
      process.exec('sh', ['-c', 'rm -f /tmp/e6_audio.url /tmp/e6_spec.raw']);
    },

    playCurrent(requestId) {
      if (!this.currentStation) return;
      const sp = this._sp;
      const url = this.currentStation.url;
      try {
        const r = sp.playOnlineAudio(url);
        console.warn('[radio] playOnlineAudio(url) ret:', r, url);
        if (requestId !== this._playRequestId) return;
        this.playing = true;
        this.stateText = '播放请求已发送';
        this.stateColor = '#3fb950';
        process.exec('sh', ['-c', 'echo "' + url + '" > /tmp/e6_audio.url']);
      } catch (e1) {
        try {
          const r2 = sp.playOnlineAudio({ url: url });
          if (requestId !== this._playRequestId) return;
          this.playing = true;
          this.stateText = '播放请求已发送';
          this.stateColor = '#3fb950';
          process.exec('sh', ['-c', 'echo "' + url + '" > /tmp/e6_audio.url']);
        } catch (e2) {
          if (requestId !== this._playRequestId) return;
          this.playing = false;
          this.stateText = '播放失败 ' + String(e1).slice(0, 14);
          this.stateColor = '#f85149';
          process.exec('sh', ['-c', 'rm -f /tmp/e6_audio.url /tmp/e6_spec.raw']);
        }
      }
    },

    // 视图切换
    openList() {
      this.view = 'list';
      this.refreshStations();
    },
    closeList() { this.view = 'main'; },
    openSettings() { this.settingsOpen = true; },
    closeSettings() { this.settingsOpen = false; },
    openQuickVol() { this.quickVolOpen = true; },
    closeQuickVol() { this.quickVolOpen = false; },
    onCardClick(e) { if (e && e.stopPropagation) e.stopPropagation(); },

    selectQuickVol(v) {
      this.setVolumeLevel(v);
      this.quickVolOpen = false;
    },

    quickVolBtnStyle(val) {
      const active = this.volumeLevel === val;
      return {
        width: '46px', height: '32px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: active ? '#1f6feb' : '#21262d',
        borderRadius: '6px', marginBottom: '6px',
        borderWidth: active ? '1px' : '0px', borderColor: '#79c0ff'
      };
    },

    quickVolTextStyle(val) {
      const active = this.volumeLevel === val;
      return {
        color: active ? '#ffffff' : '#c9d1d9',
        fontSize: val === 0 ? '11px' : '13px',
        fontWeight: active ? 'bold' : 'normal'
      };
    },

    setVolumeLevel(value) {
      const target = Math.max(0, Math.min(100, Number(value) || 0));
      this._masterVolume = target;
      this.volumeLevel = target;
      try { if (this._volume) this._volume.setVolume(target); } catch (e) {}
      RadioSettings.setVolume(this, target);
    },

    adjustVolumeBy(delta) { this.setVolumeLevel(this.volumeLevel + delta); },
    volumePresetStyle(level) {
      return {
        flex: 1, height: '30px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: this.volumeLevel === level ? '#1f6feb' : '#161b22',
        borderRadius: '6px', marginRight: level < 100 ? '4px' : '0'
      };
    },

    toggleRandom() { RadioSettings.toggleRandom(this); },
    cycleSleep() { RadioSettings.cycleSleep(this); },
    cancelSleep() { RadioSettings.cancelSleep(this); },
    cycleVizStyle() { RadioSettings.cycleVizStyle(this); },

    // 频谱电平仪表
    getDbmFillL() { return Math.min(100, Math.max(2, Math.round((this.dbmValL || 0) * 100))) + '%'; },
    getDbmFillR() { return Math.min(100, Math.max(2, Math.round((this.dbmValR || 0) * 100))) + '%'; },
    getDbmPeakLeftL() { return Math.min(194, Math.max(0, Math.round((this.dbmPeakL || 0) * 198))) + 'px'; },
    getDbmPeakLeftR() { return Math.min(194, Math.max(0, Math.round((this.dbmPeakR || 0) * 198))) + 'px'; },
    getDbmPeakOpL() { return this.playing && this.dbmPeakL > 0.05 ? 1 : 0; },
    getDbmPeakOpR() { return this.playing && this.dbmPeakR > 0.05 ? 1 : 0; },

    colorThemeName() {
      for (let i = 0; i < this.colorThemes.length; i++) {
        if (this.colorThemes[i].key === this.colorTheme) return this.colorThemes[i].name;
      }
      return '彩色';
    },

    cycleColorTheme() {
      const keys = ['rainbow', 'mono', 'random', 'cyber', 'amber'];
      const curIdx = keys.indexOf(this.colorTheme);
      const nextKey = keys[(curIdx + 1) % keys.length];
      this.setColorTheme(nextKey);
    },

    setColorTheme(key, skipSave) {
      this.colorTheme = key;
      this.applyColorLut(key);
      if (!skipSave) RadioSettings.setColorTheme(this, key);
    },

    colorPresetStyle(key) {
      const sel = this.colorTheme === key;
      return {
        flex: 1, height: '28px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: sel ? '#1f6feb' : '#161b22',
        borderRadius: '6px', marginRight: key !== 'amber' ? '4px' : '0'
      };
    },

    setSpecMode(mode) {
      this.specMode = mode === 'sim' ? 'sim' : 'real';
      RadioSettings.setSpecMode(this, this.specMode);
    },

    cycleSpecMode() {
      const next = RadioSettings.cycleSpecMode(this);
      this.specMode = next;
    },

    specModeBtnStyle(mode) {
      const active = this.specMode === mode;
      return {
        flex: 1, height: '30px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: active ? '#1f6feb' : '#161b22',
        borderRadius: '6px', marginRight: mode === 'real' ? '6px' : '0'
      };
    },

    specModeTextStyle(mode) {
      const active = this.specMode === mode;
      return {
        color: active ? '#ffffff' : '#8b949e',
        fontSize: '11px',
        fontWeight: active ? 'bold' : 'normal'
      };
    },

    applyColorLut(themeKey) {
      const lut = [];
      const lutRgb = [];
      const to2 = function (n) { return ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2); };

      if (themeKey === 'mono') {
        for (let k = 0; k < 16; k++) {
          const v = Math.round(180 + (k / 15) * 65);
          lut.push('#' + to2(v) + to2(v) + to2(v));
          lutRgb.push([v, v, v]);
        }
      } else if (themeKey === 'random') {
        const baseHue = Math.floor(Math.random() * 360);
        for (let k = 0; k < 16; k++) {
          const h = (baseHue + k * 137.5) % 360;
          const s = 0.85, v = 0.95;
          const c = v * (1 - s), f = h / 60 % 1, x = v * (1 - s * f), y = v * (1 - s * (1 - f));
          let rgb;
          switch (Math.floor(h / 60) % 6) {
            case 0: rgb = [v, y, c]; break; case 1: rgb = [x, v, c]; break;
            case 2: rgb = [c, v, y]; break; case 3: rgb = [c, x, v]; break;
            case 4: rgb = [y, c, v]; break; default: rgb = [v, c, x]; break;
          }
          lut.push('#' + to2(rgb[0] * 255) + to2(rgb[1] * 255) + to2(rgb[2] * 255));
          lutRgb.push([Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)]);
        }
      } else if (themeKey === 'cyber') {
        for (let k = 0; k < 16; k++) {
          const t = k / 15;
          const r = Math.round(0 + t * 224);
          const g = Math.round(229 - t * 165);
          const b = Math.round(255 - t * 4);
          lut.push('#' + to2(r) + to2(g) + to2(b));
          lutRgb.push([r, g, b]);
        }
      } else if (themeKey === 'amber') {
        for (let k = 0; k < 16; k++) {
          const t = k / 15;
          const r = 255;
          const g = Math.round(200 - t * 90);
          const b = Math.round(50 - t * 30);
          lut.push('#' + to2(r) + to2(g) + to2(b));
          lutRgb.push([r, g, b]);
        }
      } else {
        for (let k = 0; k < 16; k++) {
          const h = (210 + k * 20) % 360, s = 0.85, v = 0.95;
          const c = v * (1 - s), f = h / 60 % 1, x = v * (1 - s * f), y = v * (1 - s * (1 - f));
          let rgb;
          switch (Math.floor(h / 60) % 6) {
            case 0: rgb = [v, y, c]; break; case 1: rgb = [x, v, c]; break;
            case 2: rgb = [c, v, y]; break; case 3: rgb = [c, x, v]; break;
            case 4: rgb = [y, c, v]; break; default: rgb = [v, c, x]; break;
          }
          lut.push('#' + to2(rgb[0] * 255) + to2(rgb[1] * 255) + to2(rgb[2] * 255));
          lutRgb.push([Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)]);
        }
      }
      this._lut = lut;
      this._lutRgb = lutRgb;
    },

    onSpecClick() {
      if (this._swiped) { this._swiped = false; return; }
      const now = Date.now();
      const diff = now - (this._lastSpecTap || 0);
      this._lastSpecTap = now;

      if (diff > 0 && diff < 450) {
        if (this._specClickTimer) { clearTimeout(this._specClickTimer); this._specClickTimer = null; }
        RadioSettings.cycleVizStyle(this);
        return;
      }

      if (this._specClickTimer) clearTimeout(this._specClickTimer);
      const self = this;
      this._specClickTimer = setTimeout(function () {
        self._specClickTimer = null;
        self.toggle();
      }, 400);
    },

    upStyleB(i) {
      const v = this.spec[i];
      return {
        width: '9px', height: (4 + Math.round(v * 76)) + 'px',
        backgroundColor: this.playing ? this._lut[i] : '#2b3e50',
        borderTopLeftRadius: '3px', borderTopRightRadius: '3px'
      };
    },
    dnStyleB(i) {
      const v = this.spec[i];
      return {
        width: '9px', height: (2 + Math.round(v * 30)) + 'px',
        backgroundColor: this.playing ? this._lut[i] : '#2b3e50',
        borderBottomLeftRadius: '2px', borderBottomRightRadius: '2px'
      };
    },
    classicStyleB(i) {
      const v = this.spec[i];
      return {
        width: '9px', height: (4 + Math.round(v * 104)) + 'px',
        backgroundColor: this.playing ? this._lut[i] : '#2b3e50',
        borderTopLeftRadius: '3px', borderTopRightRadius: '3px'
      };
    },
    dotStyleB(i, s) {
      const lit = s < Math.round(this.spec[i] * 11);
      return {
        width: '9px', height: '6px', borderRadius: '1px',
        backgroundColor: lit ? (this.playing ? this._lut[i] : '#2b3e50') : '#161b22',
        marginBottom: '2px'
      };
    },
    peakStyleB(i) {
      const p = this.peak[i];
      return {
        width: '9px', height: '2px', backgroundColor: this.playing ? '#ffffff' : '#2b3e50',
        marginBottom: (Math.max(0, Math.round((p - this.spec[i]) * 104))) + 'px'
      };
    },
    waveUpStyle(i) {
      const v = this.spec[i];
      return {
        width: '9px', height: (4 + Math.round(v * 88)) + 'px',
        backgroundColor: this.playing ? this._lut[i] : '#2b3e50',
        borderTopLeftRadius: '4px', borderTopRightRadius: '4px'
      };
    },
    radialColStyle(i) {
      const rad = (i / 16) * 2 * Math.PI - Math.PI / 2;
      const r = 58;
      const cx = 80 + r * Math.cos(rad) - 7;
      const cy = 80 + r * Math.sin(rad) - 7;
      return { position: 'absolute', left: cx + 'px', top: cy + 'px' };
    },
    radialDotStyle(i, s) {
      const lit = s < Math.round(this.spec[i] * 4);
      return {
        width: '4px', height: '4px', borderRadius: '2px',
        backgroundColor: lit ? (this.playing ? this._lut[i] : '#2b3e50') : '#161b22',
        margin: '1px'
      };
    },
    fallDotStyle(i, r, s) {
      const v = this.spec[i];
      const lit = s < Math.round(v * 4);
      const dim = [1, 0.75, 0.5, 0.3][r];
      let bg = '#161b22';
      if (lit) {
        if (!this.playing) bg = '#2b3e50';
        else {
          const c = this._lutRgb ? this._lutRgb[i] : null;
          if (c) bg = 'rgb(' + Math.round(c[0] * dim) + ',' + Math.round(c[1] * dim) + ',' + Math.round(c[2] * dim) + ')';
          else bg = this._lut[i];
        }
      }
      return { width: '9px', height: '9px', borderRadius: '2px', backgroundColor: bg };
    },
    partDotStyle(i, s) {
      const lit = s < Math.round(this.spec[i] * 4);
      return {
        width: '4px', height: '4px', borderRadius: '2px',
        backgroundColor: lit ? (this.playing ? this._lut[i] : '#2b3e50') : '#161b22',
        marginBottom: '3px'
      };
    },

    // 手势
    onMainTS(e) {
      const p = this.posOf(e);
      this._msx = p.x; this._msy = p.y;
      this._swiped = false;
    },
    onMainTE(e) {
      const p = this.posOf(e);
      const dx = p.x - (this._msx || 0);
      const dy = p.y - (this._msy || 0);
      if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
        this._swiped = true;
        if (this._specClickTimer) { clearTimeout(this._specClickTimer); this._specClickTimer = null; }
        this.cut(dx < 0 ? 1 : -1);
      }
    },

    exitApp() {
      this._playRequestId = (this._playRequestId || 0) + 1;
      this.stopAll();
      try { RadioSettings.flush(this); } catch (e) {}
      process.exec('sh', ['-c', 'killall e6_sound_meter 2>/dev/null; rm -f /tmp/e6keys.mode /tmp/e6keyed.pid /tmp/e6_audio.url /tmp/e6_spec.raw /tmp/e6_audio_gain']);
      if (this.$page && this.$page.finish) this.$page.finish();
    },

    // 频谱轮询：精准解析 e6_sound_meter 输出的逗号分隔实时能量
    startSpectrumPolling() {
      const self = this;
      this._specPoll = setInterval(async () => {
        try {
          if (!self.playing) return;
          const res = await process.exec('cat', ['/tmp/e6_spec.raw'], { timeout: 120 });
          if (res && res.code === 0 && res.stdout) {
            const raw = res.stdout.trim();
            // 兼容逗号、空格分割
            const parts = raw.split(/[, \t\r\n]+/);
            if (parts.length >= 16) {
              const vals = [];
              for (let i = 0; i < 16; i++) {
                vals.push(Math.max(0.04, Math.min(0.96, parseFloat(parts[i]) || 0)));
              }
              self._realSpec = vals;

              // 当处于「随音乐律动」模式时，从真实频段能量映射分贝电平表
              if (self.specMode === 'real') {
                let sumL = 0, sumR = 0;
                for (let i = 0; i < 8; i++) sumL += vals[i];
                for (let i = 8; i < 16; i++) sumR += vals[i];
                const l = Math.min(0.98, Math.max(0.06, (sumL / 8) * 1.25));
                const r = Math.min(0.98, Math.max(0.06, (sumR / 8) * 1.25));
                self.dbmValL = l;
                self.dbmValR = r;
                self.dbmPeakL = Math.max(l, (self.dbmPeakL || 0) * 0.94);
                self.dbmPeakR = Math.max(r, (self.dbmPeakR || 0) * 0.94);
              }
            }
          }
        } catch (e) {}
      }, 120);
    },

    startWaveLoop() {
      const self = this;
      this.applyColorLut(this.colorTheme);
      this._wave = setInterval(() => {
        const next = [];
        const isReal = self.specMode === 'real' && self._realSpec && self._realSpec.length >= 16;
        const now = Date.now();
        const t = now / 140;
        const beat = (Math.sin(t * 1.8) > 0.6) ? 0.24 : 0;

        for (let i = 0; i < 16; i++) {
          let target = 0.04;
          if (self.playing) {
            if (isReal) {
              // 模式 A：随音乐律动 —— 消费来自 e6_sound_meter 的真实音频频段能量
              target = self._realSpec[i] || 0.05;
            } else {
              // 模式 B：模拟动画 —— 动感 HiFi 音乐起伏算法（多频叠加 + 动态节拍脉冲）
              const w1 = Math.sin(t * 0.85 + i * 0.42);
              const w2 = Math.cos(t * 1.25 - i * 0.35);
              const flutter = Math.sin(now / 70 + i * 1.7) * 0.09;
              target = Math.max(0.06, Math.min(0.92, (w1 * 0.28 + w2 * 0.22 + 0.40 + beat + flutter)));
            }
          }
          const cur = self.spec[i] || 0;
          // 响应平滑插值：升快降慢，更加灵动生动
          const factor = target > cur ? 0.65 : 0.40;
          next.push(cur * (1 - factor) + target * factor);
        }
        self.spec = next;

        // 模拟模式下分贝电平表的动态更新
        if (self.playing) {
          if (!isReal) {
            const simL = Math.min(0.96, Math.max(0.08, 0.46 + Math.sin(t * 0.9) * 0.32 + beat));
            const simR = Math.min(0.96, Math.max(0.08, 0.44 + Math.cos(t * 1.1) * 0.32 + beat));
            self.dbmValL = simL;
            self.dbmValR = simR;
            self.dbmPeakL = Math.max(simL, (self.dbmPeakL || 0) * 0.93);
            self.dbmPeakR = Math.max(simR, (self.dbmPeakR || 0) * 0.93);
          }
        } else {
          self.dbmValL = 0;
          self.dbmValR = 0;
          self.dbmPeakL = 0;
          self.dbmPeakR = 0;
        }

        const peak = [];
        for (let i = 0; i < 16; i++) {
          const p = self.peak[i] || 0;
          peak.push(Math.max(next[i], p * 0.88));
        }
        self.peak = peak;
      }, 70);
    }
  }
};
</script>

<style scoped>
.page { width: 240px; height: 320px; background-color: #0b0e14; flex-direction: column; }
.settings-fullpage { width: 240px; height: 320px; padding-left: 12px; padding-right: 12px; background-color: #0b0e14; flex-direction: column; }
.settings-header { height: 40px; flex-direction: row; align-items: center; justify-content: space-between; }
.settings-title { color: #ffffff; font-size: 15px; font-weight: bold; }
.settings-close { color: #79c0ff; font-size: 12px; padding: 6px; }
.settings-section { margin-top: 10px; }
.volume-section { margin-top: 10px; }
.fillcol { flex: 1; flex-direction: column; }
.hairline { height: 1px; background-color: #21262d; }

.topbar {
  height: 34px; flex-direction: row; align-items: center;
  justify-content: space-between; padding-left: 10px; padding-right: 6px;
}
.topbar-title { color: #e6edf3; font-size: 13px; font-weight: bold; }
.topbar-right { flex-direction: row; align-items: center; }
.top-action { height: 26px; margin-left: 4px; justify-content: center; align-items: center; }
.favorite-action { width: 26px; }
.text-action {
  min-width: 32px; padding-left: 5px; padding-right: 5px;
  background-color: #161b22; border-radius: 6px;
}
.settings-action { border-width: 1px; border-color: #30363d; background-color: #1c2128; }
.top-action-text { color: #79c0ff; font-size: 11px; }
.settings-action-text { color: #e6edf3; font-weight: bold; }
.close-action { width: 22px; }
.close-action-text { color: #8b949e; font-size: 15px; }
.hotzone { width: 28px; height: 28px; justify-content: center; align-items: center; }

.statusrow {
  margin-top: 4px; height: 18px;
  position: relative; flex-direction: row; align-items: center;
}
.status-badge {
  position: absolute; left: 10px; top: 0px;
  flex-direction: row; align-items: center;
  width: 52px; padding-left: 6px; padding-right: 6px; height: 18px;
  border-radius: 9px; border-width: 1px;
}
.status-text { width: 36px; lines: 1; text-overflow: ellipsis; }
.status-vol {
  position: absolute; left: 68px; top: 0px;
  width: 30px; height: 18px;
  flex-direction: row; align-items: center; justify-content: center;
  background-color: #161b22; border-radius: 9px; border-width: 1px; border-color: #30363d;
}
.status-vol-text { color: #c9d1d9; font-size: 9px; font-weight: bold; }
.status-actions {
  position: absolute; right: 10px; top: 0px;
  height: 18px; flex-direction: row; align-items: center; justify-content: flex-end;
}
.random-badge {
  background-color: #382c0b; border-radius: 4px;
  padding-left: 4px; padding-right: 4px; height: 16px;
  justify-content: center; align-items: center; margin-right: 6px;
}
.random-badge-txt { color: #e3b341; font-size: 9px; font-weight: bold; }

.stname-wrap {
  min-height: 44px; justify-content: center; align-items: center;
  padding-left: 8px; padding-right: 8px; margin-top: 3px;
}
.stname-big {
  color: #ffffff; font-size: 16px; font-weight: bold;
  text-align: center; lines: 1; text-overflow: ellipsis;
}
.st-tags-row {
  flex-direction: row; align-items: center; justify-content: center;
  margin-top: 2px;
}
.st-badge {
  font-size: 9px; padding-left: 4px; padding-right: 4px;
  padding-top: 1px; padding-bottom: 1px; border-radius: 3px;
  margin-left: 2px; margin-right: 2px;
}
.st-badge-loc { color: #79c0ff; background-color: #1f354f; }
.st-badge-genre { color: #56d364; background-color: #12331c; }
.st-badge-fmt { color: #79c0ff; background-color: #162a3d; }

.specwrap { flex: 1; justify-content: center; }
.specB { flex-direction: row; justify-content: space-between; padding-left: 8px; padding-right: 8px; }
.specB-col { width: 14px; align-items: center; }
.specB-up { height: 80px; justify-content: flex-end; }
.specB-dn { height: 32px; }
.specB-classic { flex-direction: row; justify-content: space-between; align-items: flex-end; padding-left: 8px; padding-right: 8px; height: 112px; }
.specB-classic-col { width: 14px; height: 112px; align-items: center; justify-content: flex-end; }
.specB-dots { flex-direction: row; justify-content: space-between; padding-left: 8px; padding-right: 8px; }
.specB-dots-col { width: 14px; height: 108px; align-items: center; justify-content: space-between; }
.specB-wave { flex-direction: row; justify-content: space-between; padding-left: 8px; padding-right: 8px; }
.peakcol { align-items: center; justify-content: flex-end; }

.specB-radial { width: 160px; height: 160px; margin-left: 40px; position: relative; }
.radial-center { position: absolute; left: 60px; top: 60px; width: 40px; height: 40px; border-radius: 20px; background-color: #161b22; }
.radial-col { width: 14px; height: 14px; justify-content: center; align-items: center; }
.specB-fall { flex-direction: column; }
.fall-row { flex-direction: row; justify-content: space-between; padding-left: 8px; padding-right: 8px; height: 26px; }
.fall-col { width: 14px; height: 26px; align-items: center; justify-content: space-between; }
.partcol { align-items: center; justify-content: flex-end; }

.tuner-card {
  margin-left: 10px; margin-right: 10px; margin-bottom: 8px;
  background-color: #12161f; border-width: 1px; border-color: #21262d;
  border-radius: 8px; padding-left: 8px; padding-right: 8px;
}
.tuner-item { height: 20px; flex-direction: row; align-items: center; }
.tuner-tag { color: #79c0ff; font-size: 10px; width: 18px; font-weight: bold; }
.tuner-name { color: #8b949e; font-size: 10px; flex: 1; lines: 1; text-overflow: ellipsis; }
.tuner-div { height: 1px; background-color: #1c2128; }

/* 列表大专区与二级细分 */
.scope-tabbar {
  flex-direction: row; margin-top: 4px; padding-left: 6px; padding-right: 6px;
}
.filter-subbar {
  margin-top: 3px; height: 22px; padding-left: 6px; padding-right: 6px;
}
.filter-pills-row {
  flex-direction: row; align-items: center;
}
.searchrow { margin-top: 3px; padding-left: 6px; padding-right: 6px; }
.search-active-row { flex-direction: row; align-items: center; }
.searchbox {
  flex: 1; height: 24px; background-color: #161b22; color: #ffffff;
  font-size: 11px; border-radius: 6px; padding-left: 8px;
  border-width: 1px; border-color: #1f6feb;
}
.search-cancel { width: 34px; height: 24px; justify-content: center; align-items: center; }
.search-cancel-txt { color: #79c0ff; font-size: 11px; }

.pagebox { flex: 1; margin-top: 2px; }
.lrow {
  flex-direction: row; align-items: center; height: 35px;
  border-bottom-width: 1px; border-bottom-color: #21262d;
}
.lrow-main { flex: 1; flex-direction: row; align-items: center; height: 35px; padding-left: 8px; }
.lrow-star { width: 34px; height: 35px; justify-content: center; align-items: center; }
.lempty { height: 80px; justify-content: center; align-items: center; }
.pagebar { height: 24px; flex-direction: row; align-items: center; justify-content: center; margin-bottom: 2px; }
.pgbtn { width: 44px; height: 24px; justify-content: center; align-items: center; }

/* 弹窗遮罩与选择器 */
.modal-mask {
  position: absolute; top: 0; left: 0;
  width: 240px; height: 320px;
  background-color: rgba(0, 0, 0, 0.78);
  justify-content: center; align-items: center;
  z-index: 200;
}
.modal-card {
  width: 220px; background-color: #161b22;
  border-width: 1px; border-color: #30363d;
  border-radius: 8px; padding: 10px;
}
.modal-card-tall { height: 260px; }
.modal-header {
  height: 26px; flex-direction: row; align-items: center;
  justify-content: space-between; margin-bottom: 8px;
}
.modal-title { color: #ffffff; font-size: 12px; font-weight: bold; }
.modal-close { width: 22px; height: 22px; justify-content: center; align-items: center; }
.modal-close-txt { color: #8b949e; font-size: 16px; }
.modal-scroller { flex: 1; }
.modal-grid { flex-direction: row; flex-wrap: wrap; justify-content: space-between; }
.modal-chip {
  padding-left: 6px; padding-right: 6px; height: 26px;
  border-radius: 5px; margin-bottom: 6px;
  justify-content: center; align-items: center;
  min-width: 60px;
}

/* 随机范围选择条与律动模式选择条 */
.scope-presets { flex-direction: row; align-items: center; margin-top: 5px; }
.scope-preset { justify-content: center; align-items: center; }
.spec-mode-presets { flex-direction: row; align-items: center; margin-top: 5px; }
.spec-mode-preset { justify-content: center; align-items: center; }

/* 快速音量弹窗 */
.quick-vol-mask {
  position: absolute; top: 0; left: 0;
  width: 240px; height: 320px;
  background-color: rgba(0, 0, 0, 0.72);
  justify-content: center; align-items: center; z-index: 100;
}
.quick-vol-card {
  width: 218px; background-color: #161b22;
  border-width: 1px; border-color: #30363d;
  border-radius: 10px; padding: 10px;
}
.quick-vol-header { height: 28px; flex-direction: row; align-items: center; justify-content: space-between; }
.quick-vol-title { color: #ffffff; font-size: 13px; font-weight: bold; }
.quick-vol-cur-wrap { flex-direction: row; align-items: baseline; }
.quick-vol-cur-num { color: #79c0ff; font-size: 16px; font-weight: bold; }
.quick-vol-cur-unit { color: #8b949e; font-size: 10px; margin-left: 2px; }
.quick-vol-close { width: 24px; height: 24px; justify-content: center; align-items: center; }
.quick-vol-close-txt { color: #8b949e; font-size: 16px; }
.quick-vol-stepper {
  height: 30px; flex-direction: row; align-items: center; justify-content: space-between;
  margin-top: 6px; margin-bottom: 8px; background-color: #0d1117;
  border-radius: 6px; padding-left: 4px; padding-right: 4px;
}
.quick-step-btn { width: 28px; height: 24px; justify-content: center; align-items: center; background-color: #21262d; border-radius: 4px; }
.quick-step-txt { color: #79c0ff; font-size: 16px; font-weight: bold; }
.quick-step-hint { color: #8b949e; font-size: 10px; }
.quick-vol-grid { flex-direction: row; flex-wrap: wrap; justify-content: space-between; }
.quick-vol-btn { width: 46px; height: 32px; justify-content: center; align-items: center; margin-bottom: 6px; border-radius: 6px; }
.quick-vol-done { background-color: #238636; }
.quick-vol-done-txt { color: #ffffff; font-size: 11px; font-weight: bold; }

/* 横向分贝电平表 */
.specB-dbmeter { width: 240px; height: 112px; justify-content: center; align-items: center; }
.dbm-card {
  width: 216px; background-color: #11141a; border-width: 1px; border-color: #21262d;
  border-radius: 10px; padding-left: 8px; padding-right: 8px; padding-top: 6px; padding-bottom: 6px;
  flex-direction: column;
}
.dbm-scale { width: 200px; height: 14px; position: relative; }
.dbm-mark { position: absolute; top: 0px; color: #8b949e; font-size: 8px; }
.dbm-mark-0 { color: #da3633; font-weight: bold; }
.dbm-ticks { width: 200px; height: 6px; position: relative; margin-top: 1px; margin-bottom: 2px; }
.dbm-tick-line { position: absolute; top: 0px; width: 1px; height: 5px; background-color: #30363d; }
.dbm-tick-0 { background-color: #da3633; }
.dbm-bars-wrap {
  width: 200px; height: 22px; background-color: #0b0e14; border-radius: 4px;
  border-width: 1px; border-color: #30363d; padding: 2px; justify-content: space-between;
}
.dbm-channel { width: 194px; height: 7px; position: relative; border-radius: 2px; overflow: hidden; background-color: #161b22; }
.dbm-track-bg { width: 194px; height: 7px; position: absolute; left: 0; top: 0; flex-direction: row; }
.dbm-fill-clip { height: 7px; position: absolute; left: 0; top: 0; overflow: hidden; }
.dbm-lit-inner { width: 194px; height: 7px; flex-direction: row; }
.dbm-sec { height: 7px; }
.dbm-dark-green { width: 132px; background-color: #0a2712; }
.dbm-dark-yellow { width: 34px; background-color: #332400; }
.dbm-dark-red { width: 28px; background-color: #3b0d0e; }
.dbm-lit-green { width: 132px; background-color: #238636; }
.dbm-lit-yellow { width: 34px; background-color: #d29922; }
.dbm-lit-red { width: 28px; background-color: #f85149; }
.dbm-peak-line { position: absolute; top: 0px; width: 2px; height: 7px; background-color: #ffffff; border-radius: 1px; }
.dbm-footer { width: 200px; height: 14px; flex-direction: row; align-items: center; justify-content: space-between; margin-top: 4px; }
.dbm-ch-lbl { color: #484f58; font-size: 8px; font-weight: bold; }
.dbm-unit-lbl { color: #79c0ff; font-size: 8px; font-weight: bold; }

.setting-row { height: 38px; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 10px; padding-right: 10px; background-color: #161b22; border-radius: 6px; margin-top: 4px; }
.setting-name { color: #e6edf3; font-size: 12px; }
.setting-value { color: #3fb950; font-size: 12px; }
.settings-label { color: #79c0ff; font-size: 11px; margin-top: 10px; margin-bottom: 4px; }
.volume-value-row { height: 36px; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 8px; padding-right: 8px; background-color: #161b22; border-radius: 6px; }
.volume-step { width: 36px; height: 30px; justify-content: center; align-items: center; background-color: #21262d; border-radius: 6px; }
.volume-step-text { color: #e6edf3; font-size: 17px; font-weight: bold; }
.volume-number { color: #ffffff; font-size: 16px; font-weight: bold; }
.volume-number-wrap { flex-direction: row; align-items: baseline; }
.volume-unit { color: #8b949e; font-size: 10px; font-weight: normal; }
.volume-presets { flex-direction: row; align-items: center; margin-top: 5px; }
.volume-preset { justify-content: center; align-items: center; }
.settings-scroller { flex: 1; padding-bottom: 24px; }
.color-presets { flex-direction: row; align-items: center; margin-top: 6px; }
.color-preset { justify-content: center; align-items: center; }
</style>
