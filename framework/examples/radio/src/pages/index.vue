<template>
  <div class="page">
    <div v-if="settingsOpen" class="settings-fullpage">
      <div class="settings-header"><text class="settings-title">收听设置</text><text class="settings-close" @click="closeSettings">完成</text></div>
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

        <!-- 播放模式 -->
        <div class="settings-section">
          <text class="settings-label">播放模式</text>
          <div class="setting-row" @click="toggleRandom">
            <text class="setting-name">随机切台</text>
            <text class="setting-value">{{ randomMode ? '开启' : '关闭' }}</text>
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
      <!-- 顶栏：标题 + 收藏/列表/退出 -->
      <div class="topbar">
        <text class="topbar-title">网络收音机</text>
        <div class="topbar-right">
          <div class="top-action favorite-action" @click="toggleFav(idx)"><text :style="{color: isFav(idx) ? '#e3b341' : '#8b949e', fontSize:'15px'}">{{ isFav(idx) ? '★' : '☆' }}</text></div>
          <div class="top-action text-action" @click="openList"><text class="top-action-text">列表</text></div>
          <div class="top-action text-action settings-action" @click="openSettings"><text class="top-action-text settings-action-text">设置</text></div>
          <div class="top-action close-action" @click="exitApp"><text class="close-action-text">×</text></div>
        </div>
      </div>
      <div class="hairline"></div>

      <!-- 状态指示行（左：播放状态，中：音量，右：台号序号） -->
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
          <text :style="{color: randomMode ? '#e3b341' : '#8b949e',fontSize:'11px',marginRight:'8px'}">{{ randomMode ? '随机 · ' : '' }}{{ idx + 1 }} / {{ total }}</text>
        </div>
      </div>

      <!-- 大台名 -->
      <div class="stname-wrap">
        <text class="stname-big">{{ stName }}</text>
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
            <!-- 顶部刻度数字行 -->
            <div class="dbm-scale">
              <text v-for="m in dbmMarks" :key="m.d"
                    :class="['dbm-mark', m.is0 ? 'dbm-mark-0' : '']"
                    :style="m.r ? {right: m.r} : {left: m.l}">{{ m.d }}</text>
            </div>
            <!-- 刻度线行 -->
            <div class="dbm-ticks">
              <div v-for="m in dbmMarks" :key="m.d"
                   :class="['dbm-tick-line', m.is0 ? 'dbm-tick-0' : '']"
                   :style="m.tr ? {right: m.tr} : {left: m.tl}"></div>
            </div>

            <!-- 主电平表槽（L 与 R 双声道并排横柱，三段式发光） -->
            <div class="dbm-bars-wrap">
              <!-- L 声道横柱 -->
              <div class="dbm-channel">
                <!-- 暗色底轨（绿、黄、红三段） -->
                <div class="dbm-track-bg">
                  <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-dark-' + s]"></div>
                </div>
                <!-- 动态发光填充轨（由能量宽度剪裁） -->
                <div class="dbm-fill-clip" :style="{width: getDbmFillL()}">
                  <div class="dbm-lit-inner">
                    <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-lit-' + s]"></div>
                  </div>
                </div>
                <!-- 瞬时白色峰值游标针 -->
                <div class="dbm-peak-line" :style="{left: getDbmPeakLeftL(), opacity: getDbmPeakOpL()}"></div>
              </div>

              <!-- R 声道横柱 -->
              <div class="dbm-channel">
                <!-- 暗色底轨 -->
                <div class="dbm-track-bg">
                  <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-dark-' + s]"></div>
                </div>
                <!-- 动态发光填充轨 -->
                <div class="dbm-fill-clip" :style="{width: getDbmFillR()}">
                  <div class="dbm-lit-inner">
                    <div v-for="s in dbmSecs" :key="s" :class="['dbm-sec', 'dbm-lit-' + s]"></div>
                  </div>
                </div>
                <!-- 瞬时白色峰值游标针 -->
                <div class="dbm-peak-line" :style="{left: getDbmPeakLeftR(), opacity: getDbmPeakOpR()}"></div>
              </div>
            </div>

            <!-- 底部声道标识与单位 -->
            <div class="dbm-footer">
              <text class="dbm-ch-lbl">CH 1/2 · L/R</text>
              <text class="dbm-unit-lbl">dBFS PEAK</text>
            </div>
          </div>
        </div>
      </div>

      <!-- 上下台导轨卡片（紧凑雅致，点按直接切台） -->
      <div class="tuner-card">
        <div class="tuner-item" @click="cut(-1)">
          <text class="tuner-tag">▲</text>
          <text class="tuner-name">{{ dialName(-1) }}</text>
        </div>
        <div class="tuner-div"></div>
        <div class="tuner-item" @click="cut(1)">
          <text class="tuner-tag">▼</text>
          <text class="tuner-name">{{ dialName(1) }}</text>
        </div>
      </div>

      <!-- 0-10 快速音量设置浮层小窗口 -->
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

          <!-- 步进微调 -->
          <div class="quick-vol-stepper">
            <div class="quick-step-btn" @click="adjustVolumeBy(-1)">
              <text class="quick-step-txt">−</text>
            </div>
            <text class="quick-step-hint">点击数字快速设定 0-10</text>
            <div class="quick-step-btn" @click="adjustVolumeBy(1)">
              <text class="quick-step-txt">＋</text>
            </div>
          </div>

          <!-- 0-10 快捷网格 (3行4列：1-4, 5-8, 静音-9-10-完成) -->
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

    <!-- ================= 列表界面 ================= -->
    <div v-else class="fillcol">
      <div class="topbar">
        <div class="topbar-right">
          <div class="hotzone" @click="closeList"><text :style="{color:'#79c0ff',fontSize:'16px'}">‹</text></div>
          <text :style="{color:'#e6edf3',fontSize:'13px',fontWeight:'bold'}">电台列表</text>
        </div>
        <text :style="{color:'#8b949e',fontSize:'10px',marginRight:'12px'}">{{ listItems().length }} 台</text>
      </div>
      <div class="hairline"></div>

      <div class="tabbar">
        <div :style="tabStyle('all')" @click="setTab('all')"><text :style="tabTextStyle('all')">全部 {{ total }}</text></div>
        <div :style="tabStyle('fav')" @click="setTab('fav')"><text :style="tabTextStyle('fav')">收藏 {{ favCount() }}</text></div>
      </div>

      <div class="searchrow">
        <!-- 未激活搜索时仅渲染普通卡片，DOM 无 input 节点，物理按键绝不会被系统 focusSearch 误判劫持 -->
        <div v-if="!searching && !kw" class="search-fake" @click="startSearch">
          <text class="search-fake-txt">搜索</text>
        </div>
        <!-- 仅当用户手动点击搜索框时才挂载原生 input 并激活输入 -->
        <div v-else class="search-active-row">
          <input ref="searchInput" class="searchbox" placeholder="搜索" :value="kw" @input="onKw" @blur="onSearchBlur" />
          <div class="search-cancel" @click="cancelSearch">
            <text class="search-cancel-txt">取消</text>
          </div>
        </div>
      </div>

      <div class="pagebox" @touchstart="onPageTS" @touchend="onPageTE">
        <div v-for="it in pageItems()" :key="it.gi" class="lrow">
          <div class="lrow-main" @click="playStation(it.gi)">
            <text :style="{color:'#484f58',fontSize:'10px',width:'26px'}">{{ it.gi + 1 }}</text>
            <text :style="it.gi === idx ? rs : rn">{{ it.n }}</text>
          </div>
          <text v-if="it.fmt" :style="{color:'#79c0ff',fontSize:'9px',marginRight:'6px'}">{{ it.fmt }}</text>
          <div class="lrow-star" @click="toggleFav(it.gi)"><text :style="{color: it.fav ? '#e3b341' : '#484f58', fontSize:'15px'}">{{ it.fav ? '★' : '☆' }}</text></div>
        </div>
        <div v-if="listItems().length===0" class="lempty">
          <text :style="{color:'#8b949e',fontSize:'12px'}">{{ tab==='fav' ? '暂无收藏' : '无结果' }}</text>
        </div>
      </div>
      <div class="pagebar" v-if="listItems().length > 0">
        <div class="pgbtn" @click="turnPage(-1)"><text :style="{color: pg>0 ? '#79c0ff' : '#484f58', fontSize:'16px'}">▲</text></div>
        <text :style="{color:'#8b949e',fontSize:'11px'}">{{ pg + 1 }} / {{ pageCount() }}</text>
        <div class="pgbtn" @click="turnPage(1)"><text :style="{color: pg < pageCount()-1 ? '#79c0ff' : '#484f58', fontSize:'16px'}">▼</text></div>
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
const STATIONS = [
  { n: "北京文艺广播", u: "https://lhttp.qtfm.cn/live/333/64k.mp3" },
  { n: "北京音乐广播", u: "https://lhttp.qtfm.cn/live/332/64k.mp3" },
  { n: "新疆新闻广播FM96.1", u: "https://lhttp.qtfm.cn/live/1902/64k.mp3" },
  { n: "959年代音乐怀旧好声音", u: "https://lhttp.qtfm.cn/live/5021381/64k.mp3" },
  { n: "上海东广新闻资", u: "http://lhttp.qingting.fm/live/275/64k.mp3" },
  { n: "上海交通广播", u: "http://lhttp.qingting.fm/live/266/64k.mp3" },
  { n: "上海交通广播 FM1", u: "https://lhttp.qtfm.cn/live/266/64k.mp3" },
  { n: "上海天气台", u: "https://lhttp.qtfm.cn/live/20500176/64k.mp3" },
  { n: "上海戏曲广播", u: "https://lhttp.qtfm.cn/live/269/64k.mp3" },
  { n: "上海新闻广播", u: "https://lhttp.qtfm.cn/live/270/64k.mp3" },
  { n: "上海动感101", u: "https://lhttp.qtfm.cn/live/274/64k.mp3" },
  { n: "第一财经广播", u: "https://lhttp.qtfm.cn/live/276/64k.mp3" },
  { n: "上海流行音乐LoveRadio", u: "https://lhttp.qtfm.cn/live/273/64k.mp3" },
  { n: "上海经典947", u: "https://lhttp.qtfm.cn/live/267/64k.mp3" },
  { n: "上海长三角之声", u: "https://lhttp.qtfm.cn/live/275/64k.mp3" },
  { n: "东上海之声FM106.5", u: "https://lhttp.qtfm.cn/live/21355/64k.mp3" },
  { n: "FM98.9三门峡交通文艺广播", u: "https://lhttp.qtfm.cn/live/15318227/64k.mp3" },
  { n: "大足人民广播电台", u: "https://lhttp.qtfm.cn/live/20211676/64k.mp3" },
  { n: "重庆巴渝之声", u: "https://lhttp.qtfm.cn/live/5022385/64k.mp3" },
  { n: "100.7重庆永川之声", u: "https://lhttp.qtfm.cn/live/20210236/64k.mp3" },
  { n: "綦江综合广播", u: "https://lhttp.qtfm.cn/live/20500201/64k.mp3" },
  { n: "938重庆私家车广播", u: "https://lhttp.qtfm.cn/live/1502/64k.mp3" },
  { n: "FM98.6邢台信都融媒广播", u: "https://lhttp.qingting.fm/live/20500196/64k.mp3" },
  { n: "唐山交通文艺", u: "https://lhttp.qtfm.cn/live/1659/64k.mp3" },
  { n: "唐山经济生活广播", u: "https://lhttp.qtfm.cn/live/15318431/64k.mp3" },
  { n: "崇礼综合广播", u: "https://lhttp.qtfm.cn/live/20500100/64k.mp3" },
  { n: "廊坊飞扬105", u: "http://lhttp.qingting.fm/live/20211678/64k.mp3" },
  { n: "久久金曲 FM99.9", u: "https://lhttp.qtfm.cn/live/20211694/64k.mp3" },
  { n: "承德综合广播", u: "https://lhttp.qtfm.cn/live/20500052/64k.mp3" },
  { n: "FM106.2邢台信都融媒广播", u: "https://lhttp.qtfm.cn/live/20500096/64k.mp3" },
  { n: "曲阳融媒FM90.4", u: "https://lhttp.qtfm.cn/live/20500219/64k.mp3" },
  { n: "秦皇岛交通广播", u: "http://lhttp.qingting.fm/live/20849/64k.mp3" },
  { n: "秦皇岛音乐广播", u: "https://lhttp.qtfm.cn/live/20835/64k.mp3" },
  { n: "肥乡人民广播电台", u: "https://lhttp.qtfm.cn/live/20500104/64k.mp3" },
  { n: "衡水湖城之声961", u: "https://lhttp.qtfm.cn/live/5021857/64k.mp3" },
  { n: "辛集融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/5021959/64k.mp3" },
  { n: "邯郸交通广播", u: "https://lhttp.qtfm.cn/live/3950/64k.mp3" },
  { n: "邯郸新闻综合广播", u: "https://lhttp.qtfm.cn/live/5072/64k.mp3" },
  { n: "邯郸音乐广播", u: "https://lhttp.qtfm.cn/live/4601/64k.mp3" },
  { n: "怀旧金曲964", u: "http://lhttp.qingting.fm/live/5021555/64k.mp3?" },
  { n: "鹿泉融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20211668/64k.mp3" },
  { n: "吕梁综合广播", u: "https://lhttp.qtfm.cn/live/4020/64k.mp3" },
  { n: "FM88.7垣曲人民 广播电台", u: "https://lhttp.qingting.fm/live/20500090/64k.mp3" },
  { n: "FM107太原交通广播", u: "https://lhttp.qtfm.cn/live/4900/64k.mp3" },
  { n: "山西故事广播", u: "http://lhttp.qingting.fm/live/5022511/64k.mp3" },
  { n: "摩天102", u: "https://lhttp.qtfm.cn/live/20212394/64k.mp3" },
  { n: "运城文艺广播", u: "https://lhttp.qtfm.cn/live/1191/64k.mp3" },
  { n: "长治综合广播", u: "https://lhttp.qtfm.cn/live/5021874/64k.mp3" },
  { n: "乌海综合广播", u: "http://lhttp.qingting.fm/live/15318706/64k.mp3" },
  { n: "内蒙古交通之声", u: "https://lhttp.qtfm.cn/live/1884/64k.mp3" },
  { n: "内蒙古绿野之声广播", u: "https://lhttp.qtfm.cn/live/1888/64k.mp3" },
  { n: "内蒙古音乐之声", u: "http://lhttp.qingting.fm/live/1886/64k.mp3" },
  { n: "内蒙古蒙古语广播", u: "https://lhttp.qtfm.cn/live/1882/64k.mp3" },
  { n: "包头FM105.9", u: "https://lhttp.qingting.fm/live/1891/64k.mp3" },
  { n: "呼和浩特交通广播", u: "https://lhttp.qtfm.cn/live/5021545/64k.mp3" },
  { n: "呼和浩特综合广播", u: "https://lhttp.qingting.fm/live/5021543/64k.mp3" },
  { n: "巴彦淖尔广播电视台 综合广播", u: "https://lhttp.qtfm.cn/live/1893/64k.mp3" },
  { n: "赤峰蒙古语综合广播", u: "https://lhttp.qtfm.cn/live/1897/64k.mp3" },
  { n: "鄂尔多斯蒙语综合广播", u: "http://lhttp.qingting.fm/live/20348/64k.mp3" },
  { n: "大连1067", u: "https://lhttp.qingting.fm/live/1084/64k.mp3" },
  { n: "东港融媒综合广播", u: "https://lhttp.qtfm.cn/live/5022186/64k.mp3" },
  { n: "凌源广播电台", u: "https://lhttp.qtfm.cn/live/15318298/64k.mp3" },
  { n: "朝阳县人民广播电台FM104", u: "http://lhttp.qingting.fm/live/20212211/64k.mp3" },
  { n: "桓仁广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5022699/64k.mp3" },
  { n: "绥中综合广播", u: "http://lhttp.qingting.fm/live/20211705/64k.mp3" },
  { n: "辽宁综合广播——辽宁之声", u: "https://lhttp.qingting.fm/live/1103/64k.mp3?app_id=web" },
  { n: "沈阳生活广播", u: "http://lhttp.qingting.fm/live/1102/64k.mp3" },
  { n: "辽宁经典音乐广播", u: "https://lhttp.qtfm.cn/live/20021/64k.mp3" },
  { n: "四平综合广播", u: "https://lhttp.qtfm.cn/live/15318197/64k.mp3" },
  { n: "延吉交通之声", u: "https://lhttp.qtfm.cn/live/15318331/64k.mp3" },
  { n: "松原交通文艺广播", u: "https://lhttp.qtfm.cn/live/20212256/64k.mp3" },
  { n: "松原大众生活广播", u: "https://lhttp.qtfm.cn/live/5082/64k.mp3" },
  { n: "松原新闻综合广播", u: "https://lhttp.qtfm.cn/live/5079/64k.mp3" },
  { n: "长春广播电视台 FM88.0", u: "https://lhttp.qtfm.cn/live/4850/64k.mp3" },
  { n: "大庆综合广播", u: "https://lhttp.qtfm.cn/live/20500060/64k.mp3" },
  { n: "牡丹江交通广播", u: "https://lhttp.qtfm.cn/live/5022354/64k.mp3" },
  { n: "龙广新闻台", u: "https://lhttp.qtfm.cn/live/4974/64k.mp3" },
  { n: "黑龙江音乐广播", u: "https://lhttp.qtfm.cn/live/4969/64k.mp3" },
  { n: "靖江交通音乐广播", u: "https://lhttp.qtfm.cn/live/15318120/64k.mp3" },
  { n: "东海994", u: "https://lhttp.qtfm.cn/live/20500220/64k.mp3" },
  { n: "南通交通广播", u: "https://lhttp.qtfm.cn/live/5021533/64k.mp3" },
  { n: "南通私家车广播", u: "https://lhttp.qtfm.cn/live/21327/64k.mp3" },
  { n: "FM89.1吴江综合广播", u: "https://lhttp.qtfm.cn/live/5022050/64k.mp3" },
  { n: "太仓人民广播电台", u: "https://lhttp.qtfm.cn/live/20207759/64k.mp3" },
  { n: "常州新闻广播", u: "https://lhttp.qtfm.cn/live/2798/64k.mp3" },
  { n: "常熟广播声动1008", u: "https://lhttp.qtfm.cn/live/2791/64k.mp3" },
  { n: "张家港市融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/5021877/64k.mp3" },
  { n: "扬州电台江都广播", u: "https://lhttp.qtfm.cn/live/5022636/64k.mp3" },
  { n: "宁听FM885", u: "http://lhttp.qingting.fm/live/20500075/64k.mp3" },
  { n: "江苏经典流行音乐", u: "https://lhttp.qtfm.cn/live/4938/64k.mp3" },
  { n: "沛县综合广播", u: "https://lhttp.qtfm.cn/live/20500173/64k.mp3" },
  { n: "海门人民广播电台", u: "https://lhttp.qtfm.cn/live/5022640/64k.mp3" },
  { n: "淮安经济生活", u: "https://lhttp.qtfm.cn/live/4587/64k.mp3" },
  { n: "盐城广播FM88.2", u: "https://lhttp.qtfm.cn/live/20332/64k.mp3" },
  { n: "盱眙县融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20500051/64k.mp3" },
  { n: "苏州儿童广播", u: "http://lhttp.qingting.fm/live/2807/64k.mp3" },
  { n: "赣榆区融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20500216/64k.mp3" },
  { n: "邳州人民广播电台", u: "http://lhttp.qingting.fm/live/2809/64k.mp3" },
  { n: "FM88.8镇江交通广播", u: "https://lhttp.qtfm.cn/live/3985/64k.mp3" },
  { n: "FM96.3镇江文艺广播", u: "https://lhttp.qtfm.cn/live/4605/64k.mp3" },
  { n: "FM105平阳电台", u: "https://lhttp.qtfm.cn/live/5022624/64k.mp3" },
  { n: "FM97 舟山交通音乐广播", u: "https://lhttp.qingting.fm/live/1161/64k.mp3" },
  { n: "义乌新闻广播", u: "https://lhttp.qtfm.cn/live/20537/64k.mp3" },
  { n: "台州交通广播", u: "https://lhttp.qingting.fm/live/1146/64k.mp3" },
  { n: "嘉兴交通广播", u: "https://lhttp.qtfm.cn/live/1135/64k.mp3" },
  { n: "嘉兴音乐广播", u: "https://lhttp.qtfm.cn/live/1136/64k.mp3" },
  { n: "嘉兴综合广播", u: "https://lhttp.qtfm.cn/live/1154/64k.mp3" },
  { n: "天台电台FM91.1", u: "https://lhttp.qingting.fm/live/5022200/64k.mp3" },
  { n: "宁波经济广播", u: "https://lhttp.qtfm.cn/live/1152/64k.mp3" },
  { n: "FM989宁海新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022406/64k.mp3" },
  { n: "杭州交通91.8电台", u: "https://lhttp.qtfm.cn/live/1133/64k.mp3" },
  { n: "杭州FM90.7", u: "https://lhttp.qtfm.cn/live/15318146/64k.mp3" },
  { n: "西湖之声", u: "https://lhttp.qtfm.cn/live/1163/64k.mp3" },
  { n: "浦江人民广播电台", u: "https://lhttp.qtfm.cn/live/5021924/64k.mp3" },
  { n: "FM96大潮之声", u: "https://lhttp.qtfm.cn/live/5022556/64k.mp3" },
  { n: "温岭1036电台", u: "http://lhttp.qingting.fm/live/4567/64k.mp3" },
  { n: "温州新闻广播", u: "http://lhttp.qingting.fm/live/1155/64k.mp3" },
  { n: "温州经济广播", u: "http://lhttp.qingting.fm/live/1157/64k.mp3" },
  { n: "FM103.5湖州经济广播", u: "https://lhttp.qtfm.cn/live/2812/64k.mp3" },
  { n: "玉环广播电台", u: "https://lhttp.qtfm.cn/live/20212390/64k.mp3" },
  { n: "衢州交通音乐广播", u: "http://lhttp.qingting.fm/live/20442/64k.mp3" },
  { n: "1047 Nice FM", u: "https://lhttp.qtfm.cn/live/20033/64k.mp3" },
  { n: "合肥交通广播", u: "https://lhttp.qtfm.cn/live/1960/64k.mp3" },
  { n: "天长人民广播电台", u: "https://lhttp.qtfm.cn/live/4854/64k.mp3" },
  { n: "太和县广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/15318579/64k.mp3" },
  { n: "安庆综合广播", u: "https://lhttp.qingting.fm/live/1965/64k.mp3" },
  { n: "安徽农村广播", u: "https://lhttp.qtfm.cn/live/1950/64k.mp3" },
  { n: "安徽戏曲广播", u: "https://lhttp.qtfm.cn/live/1952/64k.mp3" },
  { n: "安徽旅游广播高速之声", u: "https://lhttp.qtfm.cn/live/15318219/64k.mp3" },
  { n: "安徽经济广播", u: "https://lhttp.qtfm.cn/live/4916/64k.mp3" },
  { n: "宿州综合广播", u: "https://lhttp.qtfm.cn/live/5022399/64k.mp3" },
  { n: "怀远之声", u: "https://lhttp.qtfm.cn/live/5021993/64k.mp3" },
  { n: "阜阳交通广播", u: "https://lhttp.qtfm.cn/live/1971/64k.mp3" },
  { n: "阜阳综合广播", u: "https://lhttp.qtfm.cn/live/1970/64k.mp3" },
  { n: "三明新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022100/64k.mp3" },
  { n: "云霄人民广播电台", u: "https://lhttp.qtfm.cn/live/20500106/64k.mp3" },
  { n: "FM881南安广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5021731/64k.mp3" },
  { n: "南平广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5022065/64k.mp3" },
  { n: "厦门交通旅游广播", u: "http://lhttp.qingting.fm/live/1738/64k.mp3" },
  { n: "尤溪1066", u: "https://lhttp.qtfm.cn/live/5022498/64k.mp3" },
  { n: "福建新闻广播", u: "https://lhttp.qtfm.cn/live/1731/64k.mp3" },
  { n: "福建987私家车广播", u: "https://lhttp.qtfm.cn/live/1736/64k.mp3" },
  { n: "诏安广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20500186/64k.mp3" },
  { n: "闽侯广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20500236/64k.mp3" },
  { n: "景德镇新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022025/64k.mp3" },
  { n: "江西音乐广播", u: "http://lhttp.qingting.fm/live/1802/64k.mp3" },
  { n: "江西潮台969", u: "https://lhttp.qtfm.cn/live/20500092/64k.mp3" },
  { n: "江西财经广播（成功992）", u: "https://lhttp.qtfm.cn/live/5021665/64k.mp3" },
  { n: "赣州综合广播", u: "https://lhttp.qingting.fm/live/20266/64k.mp3" },
  { n: "1063城市生活广播", u: "https://lhttp.qtfm.cn/live/4984/64k.mp3" },
  { n: "中文课程朗读", u: "https://stream.zeno.fm/rnxvrexlnajvv" },
  { n: "都市101经济广播", u: "https://lhttp.qtfm.cn/live/3995/64k.mp3" },
  { n: "城阳940", u: "https://lhttp.qtfm.cn/live/5022537/64k.mp3" },
  { n: "威海交通广播", u: "https://lhttp.qtfm.cn/live/20671/64k.mp3" },
  { n: "FM90.7威海音乐广播", u: "https://lhttp.qtfm.cn/live/15318612/64k.mp3" },
  { n: "寿光市融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20500211/64k.mp3" },
  { n: "山东文艺广播", u: "https://lhttp.qtfm.cn/live/20238/64k.mp3" },
  { n: "山东经济广播", u: "https://lhttp.qtfm.cn/live/20236/64k.mp3" },
  { n: "成武人民广播电台", u: "https://lhttp.qtfm.cn/live/20211637/64k.mp3" },
  { n: "无棣人民广播电台", u: "https://lhttp.qtfm.cn/live/5022198/64k.mp3" },
  { n: "枣庄交通文艺广播", u: "https://lhttp.qtfm.cn/live/1688/64k.mp3" },
  { n: "梁山广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20500235/64k.mp3" },
  { n: "济南故事广播", u: "https://lhttp.qtfm.cn/live/1672/64k.mp3" },
  { n: "936私家车广播", u: "http://lhttp.qingting.fm/live/1670/64k.mp3" },
  { n: "济南经济广播", u: "https://lhttp.qtfm.cn/live/1668/64k.mp3" },
  { n: "济南音乐广播FM88.7", u: "https://lhttp.qtfm.cn/live/1671/64k.mp3" },
  { n: "FM107济宁生活广播", u: "https://lhttp.qtfm.cn/live/4008/64k.mp3" },
  { n: "滨城综合广播", u: "https://lhttp.qtfm.cn/live/20500168/64k.mp3" },
  { n: "FM107潍坊交通广播", u: "https://lhttp.qtfm.cn/live/4014/64k.mp3" },
  { n: "潍坊1008城市之声", u: "https://lhttp.qtfm.cn/live/20211696/64k.mp3" },
  { n: "潍坊新闻广播", u: "https://lhttp.qtfm.cn/live/20320/64k.mp3" },
  { n: "FM88.1潍坊音乐广播", u: "https://lhttp.qtfm.cn/live/15318631/64k.mp3" },
  { n: "烟台交通广播FM103", u: "https://lhttp.qtfm.cn/live/1684/64k.mp3" },
  { n: "牡丹之声手机广播", u: "https://lhttp.qtfm.cn/live/15318316/64k.mp3" },
  { n: "章丘之声", u: "https://lhttp.qtfm.cn/live/20212207/64k.mp3" },
  { n: "聊城交通广播", u: "https://lhttp.qtfm.cn/live/5022263/64k.mp3" },
  { n: "聊城综合广播", u: "https://lhttp.qtfm.cn/live/5022264/64k.mp3" },
  { n: "仙境之声", u: "https://lhttp.qtfm.cn/live/20500112/64k.mp3" },
  { n: "阳信人民广播电台", u: "https://lhttp.qtfm.cn/live/5021991/64k.mp3" },
  { n: "FM92.6 综合广播", u: "https://lhttp.qtfm.cn/live/20176/64k.mp3" },
  { n: "兰考人民广播电台", u: "https://lhttp.qtfm.cn/live/20500167/64k.mp3" },
  { n: "南阳交通广播", u: "https://lhttp.qingting.fm/live/1212/64k.mp3" },
  { n: "卧龙综合广播", u: "https://lhttp.qtfm.cn/live/20500113/64k.mp3" },
  { n: "周口综合广播", u: "https://lhttp.qtfm.cn/live/20212215/64k.mp3" },
  { n: "安阳新闻应急广播", u: "https://lhttp.qtfm.cn/live/15318224/64k.mp3" },
  { n: "南阳好朋友892汽车音乐电台", u: "https://lhttp.qingting.fm/live/5022725/64k.mp3" },
  { n: "平顶山交通广播", u: "https://lhttp.qtfm.cn/live/5022421/64k.mp3" },
  { n: "平顶山新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022420/64k.mp3" },
  { n: "开封综合广播", u: "https://lhttp.qtfm.cn/live/5022653/64k.mp3" },
  { n: "991新乡综合广播", u: "https://lhttp.qtfm.cn/live/1228/64k.mp3" },
  { n: "星河音乐", u: "http://lhttp.qingting.fm/live/20210755/64k.mp3" },
  { n: "洛阳交通广播", u: "http://lhttp.qingting.fm/live/1227/64k.mp3" },
  { n: "洛阳综合广播", u: "http://lhttp.qingting.fm/live/1225/64k.mp3" },
  { n: "漯河交通广播", u: "https://lhttp.qtfm.cn/live/5022452/64k.mp3" },
  { n: "焦作新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022557/64k.mp3" },
  { n: "开封祥符广播919", u: "https://lhttp.qtfm.cn/live/20500156/64k.mp3" },
  { n: "许昌广播电视台交通广播FM92.6", u: "http://lhttp.qingting.fm/live/5022095/64k.mp3" },
  { n: "许昌广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5022092/64k.mp3" },
  { n: "经典916", u: "http://lhttp.qingting.fm/live/20207782/64k.mp3" },
  { n: "邓州广播电台", u: "https://lhttp.qtfm.cn/live/20500198/64k.mp3" },
  { n: "FM91.8郑州私家车广播", u: "https://lhttp.qtfm.cn/live/1222/64k.mp3" },
  { n: "郑州新闻广播", u: "https://lhttp.qtfm.cn/live/1220/64k.mp3" },
  { n: "郑州经济广播", u: "https://lhttp.qtfm.cn/live/1221/64k.mp3" },
  { n: "FM105.9项城人民广播电台", u: "https://lhttp.qtfm.cn/live/20210757/64k.mp3" },
  { n: "鹤壁综合广播", u: "https://lhttp.qtfm.cn/live/5022055/64k.mp3" },
  { n: "云梦综合广播", u: "https://lhttp.qtfm.cn/live/20500204/64k.mp3" },
  { n: "咸宁交通广播", u: "https://lhttp.qtfm.cn/live/5068/64k.mp3" },
  { n: "咸宁综合广播", u: "https://lhttp.qtfm.cn/live/5067/64k.mp3" },
  { n: "团风综合广播", u: "https://lhttp.qtfm.cn/live/20500189/64k.mp3" },
  { n: "天门人民广播电台", u: "https://lhttp.qtfm.cn/live/20500199/64k.mp3" },
  { n: "孝感新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022064/64k.mp3" },
  { n: "FM92.2应城市融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20500227/64k.mp3" },
  { n: "湖北经典音乐广播", u: "https://lhttp.qtfm.cn/live/1296/64k.mp3" },
  { n: "荆州广播电视台90.1汽车广播", u: "https://lhttp.qtfm.cn/live/1312/64k.mp3" },
  { n: "荆门综合广播", u: "https://lhttp.qtfm.cn/live/20211577/64k.mp3" },
  { n: "长江之声", u: "https://lhttp.qtfm.cn/live/5021868/64k.mp3" },
  { n: "娄底综合广播", u: "https://lhttp.qtfm.cn/live/21213/64k.mp3" },
  { n: "Easy Fm", u: "https://lhttp.qtfm.cn/live/5022391/64k.mp3" },
  { n: "株洲交通广播", u: "https://lhttp.qtfm.cn/live/3971/64k.mp3" },
  { n: "广东南方生活广播", u: "https://lhttp.qtfm.cn/live/468/64k.mp3" },
  { n: "广东交通之声", u: "https://lhttp.qtfm.cn/live/1262/64k.mp3" },
  { n: "江门人民广播电台综合广播", u: "https://lhttp.qtfm.cn/live/1282/64k.mp3" },
  { n: "鹤山电台", u: "https://lhttp.qtfm.cn/live/1286/64k.mp3" },
  { n: "深圳生活广播", u: "https://lhttp.qtfm.cn/live/1273/64k.mp3" },
  { n: "廉江人民广播电台", u: "https://lhttp.qtfm.cn/live/20211578/64k.mp3" },
  { n: "湾区音乐台", u: "https://lhttp.qtfm.cn/live/20500163/64k.mp3" },
  { n: "澄海人民广播电台", u: "https://lhttp.qtfm.cn/live/5022439/64k.mp3" },
  { n: "阳江综合资讯广播", u: "https://lhttp.qtfm.cn/live/15318429/64k.mp3" },
  { n: "顺德音乐之声", u: "https://lhttp.qtfm.cn/live/20500150/64k.mp3" },
  { n: "广西北部湾之声", u: "https://lhttp.qtfm.cn/live/1757/64k.mp3" },
  { n: "FM950广西音乐台", u: "https://lhttp.qtfm.cn/live/4875/64k.mp3" },
  { n: "广西电台新闻910", u: "https://lhttp.qtfm.cn/live/1753/64k.mp3" },
  { n: "桂林飞扬调频", u: "https://lhttp.qtfm.cn/live/1760/64k.mp3" },
  { n: "桂林新闻综合广播", u: "https://lhttp.qtfm.cn/live/1759/64k.mp3" },
  { n: "畅听882（贺州广播电视台综合广播）", u: "https://lhttp.qtfm.cn/live/5043/64k.mp3" },
  { n: "三亚之声", u: "http://lhttp.qingting.fm/live/15318203/64k.mp3" },
  { n: "海口音乐广播", u: "https://lhttp.qtfm.cn/live/20010/64k.mp3" },
  { n: "中江综合广播994", u: "https://lhttp.qtfm.cn/live/20500148/64k.mp3" },
  { n: "仁寿人民广播电台", u: "https://lhttp.qtfm.cn/live/5021453/64k.mp3" },
  { n: "德阳综合广播", u: "https://lhttp.qtfm.cn/live/4987/64k.mp3" },
  { n: "成都电台FM946", u: "https://lhttp.qtfm.cn/live/4892/64k.mp3" },
  { n: "成都经济广播", u: "https://lhttp.qtfm.cn/live/1121/64k.mp3" },
  { n: "眉山交通音乐广播", u: "https://lhttp.qtfm.cn/live/20207781/64k.mp3" },
  { n: "眉山综合广播", u: "https://lhttp.qtfm.cn/live/4027/64k.mp3" },
  { n: "绵竹人民广播电台", u: "https://lhttp.qingting.fm/live/15318098/64k.mp3" },
  { n: "绵阳新闻广播", u: "https://lhttp.qtfm.cn/live/4024/64k.mp3" },
  { n: "苍溪人民广播电台", u: "https://lhttp.qtfm.cn/live/20500228/64k.mp3" },
  { n: "遂宁交通旅游台", u: "http://lhttp.qingting.fm/live/20180/64k.mp3" },
  { n: "阿坝州综合广播", u: "https://lhttp.qtfm.cn/live/20500234/64k.mp3" },
  { n: "六盘水广播电视台综合广播", u: "https://lhttp.qingting.fm/live/20211616/64k.mp3" },
  { n: "安顺综合广播FM105.9", u: "http://lhttp.qingting.fm/live/5022203/64k.mp3" },
  { n: "桐梓人民广播电台—娄山之声", u: "https://lhttp.qtfm.cn/live/20212410/64k.mp3" },
  { n: "贵州经济广播", u: "https://lhttp.qtfm.cn/live/20065/64k.mp3" },
  { n: "贵阳综合广播", u: "https://lhttp.qtfm.cn/live/1773/64k.mp3" },
  { n: "云南民族广播", u: "https://lhttp.qtfm.cn/live/1933/64k.mp3" },
  { n: "云南私家车电台", u: "https://lhttp.qtfm.cn/live/1927/64k.mp3" },
  { n: "巧家人民广播电台——白鹤之声", u: "https://lhttp.qtfm.cn/live/20211704/64k.mp3" },
  { n: "弥勒广播电视台综合广播", u: "https://lhttp.qingting.fm/live/5022531/64k.mp3" },
  { n: "德宏广播电视台综合广播", u: "https://lhttp.qingting.fm/live/5021849/64k.mp3" },
  { n: "FM954汽车音乐广播", u: "https://lhttp.qtfm.cn/live/1936/64k.mp3" },
  { n: "FM1008新闻综合广播", u: "https://lhttp.qtfm.cn/live/1934/64k.mp3" },
  { n: "FM105城市资讯", u: "https://lhttp.qtfm.cn/live/1937/64k.mp3" },
  { n: "昭通交通旅游广", u: "http://lhttp.qingting.fm/live/21247/64k.mp3" },
  { n: "普洱市广播电视台综合广播", u: "http://lhttp.qingting.fm/live/1938/64k.mp3" },
  { n: "玉溪新闻综合广播FM102.4", u: "http://lhttp.qingting.fm/live/5022031/64k.mp3" },
  { n: "红河之声", u: "https://lhttp.qtfm.cn/live/4033/64k.mp3" },
  { n: "拉萨人民广播电台914", u: "https://lhttp.qtfm.cn/live/5022138/64k.mp3" },
  { n: "唐诗电台", u: "https://lhttp.qtfm.cn/live/1603/64k.mp3" },
  { n: "安康综合广播", u: "http://lhttp.qingting.fm/live/5021861/64k.mp3" },
  { n: "渭南广播FM102.6", u: "https://lhttp.qingting.fm/live/5022388/64k.mp3" },
  { n: "陕西农村广播", u: "https://lhttp.qtfm.cn/live/1602/64k.mp3" },
  { n: "陕西经济广播唐", u: "https://lhttp.qtfm.cn/live/1603/64k.mp3" },
  { n: "陕西青少广播·1055青春有我", u: "https://lhttp.qtfm.cn/live/4885/64k.mp3" },
  { n: "陕西音乐广播", u: "https://lhttp.qtfm.cn/live/4873/64k.mp3" },
  { n: "韩城综合广播", u: "https://lhttp.qtfm.cn/live/15318413/64k.mp3" },
  { n: "天水交通广播FM91.9", u: "https://lhttp.qtfm.cn/live/20211613/64k.mp3" },
  { n: "天水综合广播", u: "https://lhttp.qtfm.cn/live/20460/64k.mp3" },
  { n: "张掖新闻综合广播", u: "http://lhttp.qingting.fm/live/5022096/64k.mp3" },
  { n: "FM106.6综合广播", u: "https://lhttp.qtfm.cn/live/15318602/64k.mp3" },
  { n: "FM104.3西宁交通文艺广播", u: "http://lhttp.qingting.fm/live/5022283/64k.mp3" },
  { n: "青海经济生活广播", u: "https://lhttp.qtfm.cn/live/5008/64k.mp3" },
  { n: "宁夏交通广播", u: "https://lhttp.qtfm.cn/live/1840/64k.mp3" },
  { n: "宁夏音乐广播", u: "https://lhttp.qtfm.cn/live/15318294/64k.mp3" },
  { n: "石嘴山综合广播", u: "https://lhttp.qtfm.cn/live/5022563/64k.mp3" },
  { n: "FM100.6 双河综合广播", u: "https://lhttp.qtfm.cn/live/20207772/64k.mp3" },
  { n: "石河子广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20500118/64k.mp3" },
  { n: "伊犁之声FM89.7", u: "https://lhttp.qtfm.cn/live/20500054/64k.mp3" },
  { n: "巴音郭楞广播电视台FM966综合广播", u: "https://lhttp.qtfm.cn/live/5022108/64k.mp3?" },
  { n: "新疆交通广播", u: "https://lhttp.qtfm.cn/live/1910/64k.mp3" },
  { n: "新疆电台维语交通文艺广播", u: "https://lhttp.qtfm.cn/live/20639/64k.mp3" },
  { n: "新疆蒙古语广播", u: "https://lhttp.qtfm.cn/live/1903/64k.mp3" },
  { n: "昌吉交通广播", u: "https://lhttp.qtfm.cn/live/20440/64k.mp3" },
  { n: "昌吉综合广播", u: "https://lhttp.qtfm.cn/live/20440/64k.mp3" },
  { n: "第三师图木舒克市人民广播电台", u: "https://lhttp.qtfm.cn/live/20500135/64k.mp3" },
  { n: "轮台之声", u: "https://lhttp.qtfm.cn/live/20500099/64k.mp3" },
  { n: "阿克苏维语综合广播FM101.6", u: "https://lhttp.qtfm.cn/live/15318551/64k.mp3" },
  { n: "50首经典古典音乐", u: "https://lhttp.qtfm.cn/live/5022308/64k.mp3" },
  { n: "891线上音乐台", u: "https://live.fm891.net/96k.aac" },
  { n: "AsiaFM 亚洲热歌", u: "http://hot.asiafm.net:8000/asiafm" },
  { n: "AsiaFM 亚洲粤语台", u: "https://lhttp.qtfm.cn/live/15318569/64k.mp3" },
  { n: "Auto FM汽车联播网", u: "https://lhttp.qtfm.cn/live/15318569/64k.mp3" },
  { n: "FM104.1北岳之声", u: "https://lhttp.qtfm.cn/live/20212209/64k.mp3" },
  { n: "三门峡交通文艺", u: "https://stream.zeno.fm/cmbjv6tml6fuv" },
  { n: "主内真生命-英语", u: "https://stream.tligradio.org/listen/english/radio.mp3" },
  { n: "声动890信阳综合广播", u: "https://lhttp.qtfm.cn/live/5021977/64k.mp3" },
  { n: "FM99.6信阳交通广播", u: "https://lhttp.qtfm.cn/live/15318156/64k.mp3" },
  { n: "动听音乐台", u: "https://lhttp.qtfm.cn/live/5022107/64k.mp3" },
  { n: "FM94.3综合广播", u: "https://lhttp.qtfm.cn/live/20500064/64k.mp3" },
  { n: "北海交通音乐广播", u: "https://lhttp.qtfm.cn/live/20211621/64k.mp3" },
  { n: "吕梁交通广播", u: "https://lhttp.qtfm.cn/live/4899/64k.mp3" },
  { n: "固镇人民广播电台", u: "https://lhttp.qtfm.cn/live/20500125/64k.mp3" },
  { n: "国际新闻", u: "https://lhttp.qtfm.cn/live/20500172/64k.mp3" },
  { n: "士兵突击FM", u: "https://stream.zeno.fm/vs4zinqldp2vv" },
  { n: "安阳交通广播", u: "https://lhttp.qtfm.cn/live/2138/64k.mp3" },
  { n: "定州融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20211638/64k.mp3" },
  { n: "宝鸡交通旅游", u: "https://lhttp.qtfm.cn/live/15318128/64k.mp3" },
  { n: "宝鸡综合广播", u: "https://lhttp.qtfm.cn/live/15318125/64k.mp3" },
  { n: "声动970", u: "https://lhttp.qtfm.cn/live/20500047/64k.mp3" },
  { n: "庆云融媒综合广播", u: "https://lhttp.qtfm.cn/live/5022403/64k.mp3" },
  { n: "开平广播电台", u: "https://lhttp.qtfm.cn/live/5037/64k.mp3" },
  { n: "张家口1074综合广播", u: "https://lhttp.qtfm.cn/live/15318285/64k.mp3" },
  { n: "抚州交通音乐广播", u: "https://lhttp.qtfm.cn/live/20500015/64k.mp3" },
  { n: "阿基米德故事会", u: "https://lhttp.qtfm.cn/live/20500182/64k.mp3" },
  { n: "新余交通广播", u: "https://lhttp.qtfm.cn/live/20093/64k.mp3" },
  { n: "西江之声", u: "https://lhttp.qtfm.cn/live/5022379/64k.mp3" },
  { n: "昭通新闻综合广播", u: "https://lhttp.qtfm.cn/live/21249/64k.mp3" },
  { n: "柳州综合广播", u: "https://lhttp.qtfm.cn/live/21043/64k.mp3" },
  { n: "梁平之声", u: "https://lhttp.qtfm.cn/live/20211646/64k.mp3" },
  { n: "江陵综合广播", u: "https://lhttp.qtfm.cn/live/20500203/64k.mp3" },
  { n: "海南旅游广播•国际旅游岛之声", u: "https://lhttp.qtfm.cn/live/1862/64k.mp3" },
  { n: "流行音乐广播999正青春", u: "https://lhttp.qtfm.cn/live/20211620/64k.mp3" },
  { n: "淮北交通广播", u: "https://lhttp.qtfm.cn/live/20211647/64k.mp3" },
  { n: "湘乡广播电台龙城之声", u: "https://lhttp.qtfm.cn/live/15318180/64k.mp3" },
  { n: "滕州广播电视台FM99.8", u: "https://lhttp.qtfm.cn/live/5022611/64k.mp3" },
  { n: "磁县融媒综合广播", u: "https://lhttp.qtfm.cn/live/20500116/64k.mp3" },
  { n: "都市965汽车音乐广播", u: "https://lhttp.qtfm.cn/live/20500108/64k.mp3" },
  { n: "FM93.0霸州汽车音乐广播", u: "https://lhttp.qtfm.cn/live/20211658/64k.mp3" },
  { n: "黑龙江老年少儿广播", u: "https://lhttp.qtfm.cn/live/4972/64k.mp3" },
  { n: "黔西南FM107.9综合广播", u: "https://lhttp.qtfm.cn/live/5045/64k.mp3" },
  { n: "北京交通广播", u: "https://lhttp.qtfm.cn/live/336/64k.mp3" },
  { n: "北京新闻广播", u: "https://lhttp.qtfm.cn/live/339/64k.mp3" },
  { n: "北京城市广播", u: "https://lhttp.qtfm.cn/live/345/64k.mp3" },
  { n: "广东城市之声", u: "https://lhttp.qtfm.cn/live/469/64k.mp3" },
  { n: "广东广播电视台珠江之声", u: "https://lhttp.qtfm.cn/live/470/64k.mp3" },
  { n: "广东广播电视台文体广播", u: "https://lhttp.qtfm.cn/live/471/64k.mp3" },
  { n: "重庆音乐广播", u: "https://lhttp.qtfm.cn/live/647/64k.mp3" },
  { n: "哈尔滨经济广播", u: "https://lhttp.qtfm.cn/live/837/64k.mp3" },
  { n: "哈尔滨交通广播", u: "https://lhttp.qtfm.cn/live/838/64k.mp3" },
  { n: "哈尔滨音乐广播", u: "https://lhttp.qtfm.cn/live/839/64k.mp3" },
  { n: "大连体育广播", u: "https://lhttp.qtfm.cn/live/1085/64k.mp3" },
  { n: "大连都市广播", u: "https://lhttp.qtfm.cn/live/1086/64k.mp3" },
  { n: "大连新闻广播", u: "https://lhttp.qtfm.cn/live/1089/64k.mp3" },
  { n: "沈阳都市广播", u: "https://lhttp.qtfm.cn/live/1099/64k.mp3" },
  { n: "沈阳交通广播FM98.6", u: "https://lhttp.qtfm.cn/live/1101/64k.mp3" },
  { n: "四川岷江音乐广播", u: "https://lhttp.qtfm.cn/live/1110/64k.mp3" },
  { n: "四川城市之音", u: "https://lhttp.qtfm.cn/live/1111/64k.mp3" },
  { n: "四川民族频率", u: "https://lhttp.qtfm.cn/live/1115/64k.mp3" },
  { n: "乐山综合广播FM102.8", u: "https://lhttp.qtfm.cn/live/1122/64k.mp3" },
  { n: "宁波新闻综合广播", u: "https://lhttp.qtfm.cn/live/1138/64k.mp3" },
  { n: "宁波交通广播", u: "https://lhttp.qtfm.cn/live/1140/64k.mp3" },
  { n: "宁波音乐广播私家车986", u: "https://lhttp.qtfm.cn/live/1142/64k.mp3" },
  { n: "瑞安人民广播", u: "https://lhttp.qtfm.cn/live/1143/64k.mp3" },
  { n: "台州音乐广播", u: "https://lhttp.qtfm.cn/live/1144/64k.mp3" },
  { n: "台州新闻综合", u: "https://lhttp.qtfm.cn/live/1145/64k.mp3" },
  { n: "1003温州音乐之声", u: "https://lhttp.qtfm.cn/live/1149/64k.mp3" },
  { n: "1008可乐台", u: "https://lhttp.qtfm.cn/live/1153/64k.mp3" },
  { n: "温州交通广播", u: "https://lhttp.qtfm.cn/live/1156/64k.mp3" },
  { n: "FM93.8", u: "https://lhttp.qtfm.cn/live/1158/64k.mp3" },
  { n: "FM998 舟山新闻综合广播", u: "https://lhttp.qtfm.cn/live/1160/64k.mp3" },
  { n: "FM1026太原音乐广播", u: "https://lhttp.qtfm.cn/live/1185/64k.mp3" },
  { n: "山西农村广播", u: "https://lhttp.qtfm.cn/live/1186/64k.mp3" },
  { n: "晋城新闻综合广播FM1072", u: "https://lhttp.qtfm.cn/live/1188/64k.mp3" },
  { n: "晋城交通广播", u: "https://lhttp.qtfm.cn/live/1189/64k.mp3" },
  { n: "运城综合广播", u: "https://lhttp.qtfm.cn/live/1190/64k.mp3" },
  { n: "郑州交通广播", u: "https://lhttp.qtfm.cn/live/1211/64k.mp3" },
  { n: "1042南阳新闻广播", u: "https://lhttp.qtfm.cn/live/1213/64k.mp3" },
  { n: "开封交通旅游广播", u: "https://lhttp.qtfm.cn/live/1214/64k.mp3" },
  { n: "怀旧好声音", u: "https://lhttp.qtfm.cn/live/1223/64k.mp3" },
  { n: "洛阳音乐广播", u: "https://lhttp.qtfm.cn/live/1226/64k.mp3" },
  { n: "1077新乡交通广播", u: "https://lhttp.qtfm.cn/live/1229/64k.mp3" },
  { n: "濮阳交通广播", u: "https://lhttp.qtfm.cn/live/1233/64k.mp3" },
  { n: "广东新闻广播", u: "https://lhttp.qtfm.cn/live/1254/64k.mp3" },
  { n: "梅州广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/1257/64k.mp3" },
  { n: "广东珠江经济电台", u: "https://lhttp.qtfm.cn/live/1259/64k.mp3" },
  { n: "广东音乐之声", u: "https://lhttp.qtfm.cn/live/1260/64k.mp3" },
  { n: "花都广播电台", u: "https://lhttp.qtfm.cn/live/1263/64k.mp3" },
  { n: "深圳先锋898", u: "https://lhttp.qtfm.cn/live/1270/64k.mp3" },
  { n: "深圳飞扬971", u: "https://lhttp.qtfm.cn/live/1271/64k.mp3" },
  { n: "深圳交通频率", u: "https://lhttp.qtfm.cn/live/1272/64k.mp3" },
  { n: "珠海电台先锋951", u: "https://lhttp.qtfm.cn/live/1274/64k.mp3" },
  { n: "珠海电台交通875", u: "https://lhttp.qtfm.cn/live/1275/64k.mp3" },
  { n: "中山电台新锐967", u: "https://lhttp.qtfm.cn/live/1277/64k.mp3" },
  { n: "中山电台快乐888", u: "https://lhttp.qtfm.cn/live/1278/64k.mp3" },
  { n: "江门旅游之声", u: "https://lhttp.qtfm.cn/live/1283/64k.mp3" },
  { n: "遂溪人民广播电台", u: "https://lhttp.qtfm.cn/live/1284/64k.mp3" },
  { n: "楚天交通广播", u: "https://lhttp.qtfm.cn/live/1291/64k.mp3" },
  { n: "湖北经济广播", u: "https://lhttp.qtfm.cn/live/1295/64k.mp3" },
  { n: "武汉经典音乐广播", u: "https://lhttp.qtfm.cn/live/1297/64k.mp3" },
  { n: "黄冈新闻综合广播", u: "https://lhttp.qtfm.cn/live/1301/64k.mp3" },
  { n: "湖北之声", u: "https://lhttp.qtfm.cn/live/1303/64k.mp3" },
  { n: "襄阳之声", u: "https://lhttp.qtfm.cn/live/1307/64k.mp3" },
  { n: "襄阳交通音乐广播", u: "https://lhttp.qtfm.cn/live/1308/64k.mp3" },
  { n: "重庆之声", u: "https://lhttp.qtfm.cn/live/1498/64k.mp3" },
  { n: "重庆交通广播", u: "https://lhttp.qtfm.cn/live/1500/64k.mp3" },
  { n: "陕西新闻广播", u: "https://lhttp.qtfm.cn/live/1600/64k.mp3" },
  { n: "陕西交通广播", u: "https://lhttp.qtfm.cn/live/1601/64k.mp3" },
  { n: "西安新闻广播", u: "https://lhttp.qtfm.cn/live/1610/64k.mp3" },
  { n: "西安交通广播", u: "https://lhttp.qtfm.cn/live/1611/64k.mp3" },
  { n: "西安音乐广播", u: "https://lhttp.qtfm.cn/live/1612/64k.mp3" },
  { n: "河北新闻广播", u: "https://lhttp.qtfm.cn/live/1644/64k.mp3" },
  { n: "河北故事广播", u: "https://lhttp.qtfm.cn/live/1645/64k.mp3" },
  { n: "河北交通广播", u: "https://lhttp.qtfm.cn/live/1646/64k.mp3" },
  { n: "河北音乐广播", u: "https://lhttp.qtfm.cn/live/1649/64k.mp3" },
  { n: "河北农民广播", u: "https://lhttp.qtfm.cn/live/1650/64k.mp3" },
  { n: "河北旅游文化广播", u: "https://lhttp.qtfm.cn/live/1651/64k.mp3" },
  { n: "石家庄新闻广播", u: "https://lhttp.qtfm.cn/live/1652/64k.mp3" },
  { n: "石家庄音乐广播", u: "https://lhttp.qtfm.cn/live/1654/64k.mp3" },
  { n: "石家庄交通广播", u: "https://lhttp.qtfm.cn/live/1655/64k.mp3" },
  { n: "唐山新闻综合", u: "https://lhttp.qtfm.cn/live/1657/64k.mp3" },
  { n: "唐山小说娱乐广播", u: "https://lhttp.qtfm.cn/live/1660/64k.mp3" },
  { n: "山东音乐广播", u: "https://lhttp.qtfm.cn/live/1665/64k.mp3" },
  { n: "济南新闻广播", u: "https://lhttp.qtfm.cn/live/1667/64k.mp3" },
  { n: "济南交通广播", u: "https://lhttp.qtfm.cn/live/1669/64k.mp3" },
  { n: "青岛新闻广播", u: "https://lhttp.qtfm.cn/live/1673/64k.mp3" },
  { n: "青岛经济广播", u: "https://lhttp.qtfm.cn/live/1674/64k.mp3" },
  { n: "青岛交通广播", u: "https://lhttp.qtfm.cn/live/1676/64k.mp3" },
  { n: "青岛音乐体育广播", u: "https://lhttp.qtfm.cn/live/1677/64k.mp3" },
  { n: "淄博综合广播", u: "https://lhttp.qtfm.cn/live/1678/64k.mp3" },
  { n: "淄博私家车广播  FM106.7", u: "https://lhttp.qtfm.cn/live/1679/64k.mp3" },
  { n: "淄博交通音乐广播", u: "https://lhttp.qtfm.cn/live/1680/64k.mp3" },
  { n: "烟台综合广播FM101", u: "https://lhttp.qtfm.cn/live/1682/64k.mp3" },
  { n: "烟台音乐广播FM105.9", u: "https://lhttp.qtfm.cn/live/1683/64k.mp3" },
  { n: "枣庄综合广播", u: "https://lhttp.qtfm.cn/live/1686/64k.mp3" },
  { n: "枣庄经济生活广播", u: "https://lhttp.qtfm.cn/live/1687/64k.mp3" },
  { n: "动感955", u: "https://lhttp.qtfm.cn/live/1689/64k.mp3" },
  { n: "福建经济广播", u: "https://lhttp.qtfm.cn/live/1732/64k.mp3" },
  { n: "福建交通广播", u: "https://lhttp.qtfm.cn/live/1733/64k.mp3" },
  { n: "厦门综合广播", u: "https://lhttp.qtfm.cn/live/1737/64k.mp3" },
  { n: "厦门音乐广播", u: "https://lhttp.qtfm.cn/live/1739/64k.mp3" },
  { n: "漳州人民广播电台综合广播", u: "https://lhttp.qtfm.cn/live/1742/64k.mp3" },
  { n: "漳州人民广播电台交通广播", u: "https://lhttp.qtfm.cn/live/1743/64k.mp3" },
  { n: "海峡之声广播电台", u: "https://lhttp.qtfm.cn/live/1744/64k.mp3" },
  { n: "广西970女主播电台", u: "https://lhttp.qtfm.cn/live/1754/64k.mp3" },
  { n: "广西私家车930", u: "https://lhttp.qtfm.cn/live/1756/64k.mp3" },
  { n: "广西交通台", u: "https://lhttp.qtfm.cn/live/1758/64k.mp3" },
  { n: "978玉林城市电台", u: "https://lhttp.qtfm.cn/live/1762/64k.mp3" },
  { n: "南昌交通广播", u: "https://lhttp.qtfm.cn/live/1804/64k.mp3" },
  { n: "江西新闻广播", u: "https://lhttp.qtfm.cn/live/1809/64k.mp3" },
  { n: "江西交通广播", u: "https://lhttp.qtfm.cn/live/1811/64k.mp3" },
  { n: "吉林市交通台 FM939", u: "https://lhttp.qtfm.cn/live/1819/64k.mp3" },
  { n: "吉林市广播电视台经济广播", u: "https://lhttp.qtfm.cn/live/1823/64k.mp3" },
  { n: "吉林音乐广播", u: "https://lhttp.qtfm.cn/live/1831/64k.mp3" },
  { n: "海南新闻广播", u: "https://lhttp.qtfm.cn/live/1861/64k.mp3" },
  { n: "内蒙古新闻综合广播", u: "https://lhttp.qtfm.cn/live/1883/64k.mp3" },
  { n: "FM94.9包头综合广播", u: "https://lhttp.qtfm.cn/live/1889/64k.mp3" },
  { n: "包头交通广播", u: "https://lhttp.qtfm.cn/live/1890/64k.mp3" },
  { n: "包头汽车音乐广播", u: "https://lhttp.qtfm.cn/live/1892/64k.mp3" },
  { n: "巴彦淖尔文艺生活广播", u: "https://lhttp.qtfm.cn/live/1894/64k.mp3" },
  { n: "巴彦淖尔交通广播", u: "https://lhttp.qtfm.cn/live/1895/64k.mp3" },
  { n: "赤峰综合广播", u: "https://lhttp.qtfm.cn/live/1896/64k.mp3" },
  { n: "赤峰1024", u: "https://lhttp.qtfm.cn/live/1898/64k.mp3" },
  { n: "赤峰交通广播", u: "https://lhttp.qtfm.cn/live/1899/64k.mp3" },
  { n: "新疆哈萨克语广播", u: "https://lhttp.qtfm.cn/live/1908/64k.mp3" },
  { n: "新疆929文化旅游广播", u: "https://lhttp.qtfm.cn/live/1909/64k.mp3" },
  { n: "乌鲁木齐新闻广播", u: "https://lhttp.qtfm.cn/live/1918/64k.mp3" },
  { n: "乌鲁木齐974交通广播", u: "https://lhttp.qtfm.cn/live/1919/64k.mp3" },
  { n: "乌鲁木齐旅游音乐", u: "https://lhttp.qtfm.cn/live/1920/64k.mp3" },
  { n: "乌鲁木齐维吾尔语广播", u: "https://lhttp.qtfm.cn/live/1923/64k.mp3" },
  { n: "云南新闻广播", u: "https://lhttp.qtfm.cn/live/1926/64k.mp3" },
  { n: "云南交通之声", u: "https://lhttp.qtfm.cn/live/1928/64k.mp3" },
  { n: "云南音乐广播", u: "https://lhttp.qtfm.cn/live/1929/64k.mp3" },
  { n: "大理电台苍洱调频", u: "https://lhttp.qtfm.cn/live/1940/64k.mp3" },
  { n: "安徽音乐广播", u: "https://lhttp.qtfm.cn/live/1947/64k.mp3" },
  { n: "安徽生活广播", u: "https://lhttp.qtfm.cn/live/1948/64k.mp3" },
  { n: "安徽交通广播", u: "https://lhttp.qtfm.cn/live/1949/64k.mp3" },
  { n: "安徽老年广播", u: "https://lhttp.qtfm.cn/live/1951/64k.mp3" },
  { n: "合肥文旅广播", u: "https://lhttp.qtfm.cn/live/1961/64k.mp3" },
  { n: "安庆交通音乐广播", u: "https://lhttp.qtfm.cn/live/1966/64k.mp3" },
  { n: "黄山新闻综合广播", u: "https://lhttp.qtfm.cn/live/1968/64k.mp3" },
  { n: "黄山交通旅游广播", u: "https://lhttp.qtfm.cn/live/1969/64k.mp3" },
  { n: "合肥文艺广播", u: "https://lhttp.qtfm.cn/live/1975/64k.mp3" },
  { n: "安阳1008音乐广播", u: "https://lhttp.qtfm.cn/live/2123/64k.mp3" },
  { n: "FM106.8柯桥人民广播电台", u: "https://lhttp.qtfm.cn/live/2422/64k.mp3" },
  { n: "连云港交通广播", u: "https://lhttp.qtfm.cn/live/2775/64k.mp3" },
  { n: "AM1161无锡新闻综合广播", u: "https://lhttp.qtfm.cn/live/2776/64k.mp3" },
  { n: "FM93.7无锡新闻综合广播", u: "https://lhttp.qtfm.cn/live/2777/64k.mp3" },
  { n: "无锡经济广播", u: "https://lhttp.qtfm.cn/live/2778/64k.mp3" },
  { n: "无锡音乐广播", u: "https://lhttp.qtfm.cn/live/2779/64k.mp3" },
  { n: "无锡交通广播", u: "https://lhttp.qtfm.cn/live/2780/64k.mp3" },
  { n: "无锡梁溪之声", u: "https://lhttp.qtfm.cn/live/2782/64k.mp3" },
  { n: "澎湃907", u: "https://lhttp.qtfm.cn/live/2789/64k.mp3" },
  { n: "常熟新闻广播", u: "https://lhttp.qtfm.cn/live/2792/64k.mp3" },
  { n: "常州经济广播", u: "https://lhttp.qtfm.cn/live/2794/64k.mp3" },
  { n: "常州交通广播", u: "https://lhttp.qtfm.cn/live/2796/64k.mp3" },
  { n: "常州音乐广播", u: "https://lhttp.qtfm.cn/live/2799/64k.mp3" },
  { n: "苏州生活广播", u: "https://lhttp.qtfm.cn/live/2801/64k.mp3" },
  { n: "苏州音乐广播", u: "https://lhttp.qtfm.cn/live/2803/64k.mp3" },
  { n: "扬州交通广播", u: "https://lhttp.qtfm.cn/live/2804/64k.mp3" },
  { n: "扬州YESFM949", u: "https://lhttp.qtfm.cn/live/2805/64k.mp3" },
  { n: "苏州交通广播", u: "https://lhttp.qtfm.cn/live/2806/64k.mp3" },
  { n: "苏州新闻广播", u: "https://lhttp.qtfm.cn/live/2808/64k.mp3" },
  { n: "FM105湖州之声", u: "https://lhttp.qtfm.cn/live/2810/64k.mp3" },
  { n: "湖州交通文艺广播", u: "https://lhttp.qtfm.cn/live/2811/64k.mp3" },
  { n: "福州人民广播电台左海之声", u: "https://lhttp.qtfm.cn/live/3937/64k.mp3" },
  { n: "甘肃交通广播", u: "https://lhttp.qtfm.cn/live/3939/64k.mp3" },
  { n: "甘肃农村广播", u: "https://lhttp.qtfm.cn/live/3941/64k.mp3" },
  { n: "畅行951", u: "https://lhttp.qtfm.cn/live/3948/64k.mp3" },
  { n: "邯郸都市生活广播", u: "https://lhttp.qtfm.cn/live/3951/64k.mp3" },
  { n: "沧州交通广播", u: "https://lhttp.qtfm.cn/live/3954/64k.mp3" },
  { n: "黄石交通广播", u: "https://lhttp.qtfm.cn/live/3964/64k.mp3" },
  { n: "1061长沙交通广播", u: "https://lhttp.qtfm.cn/live/3967/64k.mp3" },
  { n: "吉林经济广播FM95.3AM846", u: "https://lhttp.qtfm.cn/live/3976/64k.mp3" },
  { n: "吉林乡村广播", u: "https://lhttp.qtfm.cn/live/3977/64k.mp3" },
  { n: "吉林资讯广播", u: "https://lhttp.qtfm.cn/live/3978/64k.mp3" },
  { n: "宜兴交通台", u: "https://lhttp.qtfm.cn/live/3982/64k.mp3" },
  { n: "FM104镇江综合广播", u: "https://lhttp.qtfm.cn/live/3984/64k.mp3" },
  { n: "临沂综合广播", u: "https://lhttp.qtfm.cn/live/3992/64k.mp3" },
  { n: "临沂交通旅游广播", u: "https://lhttp.qtfm.cn/live/3993/64k.mp3" },
  { n: "财富932私家车广播", u: "https://lhttp.qtfm.cn/live/3994/64k.mp3" },
  { n: "大连交通广播", u: "https://lhttp.qtfm.cn/live/3997/64k.mp3" },
  { n: "日照交通生活广播", u: "https://lhttp.qtfm.cn/live/4005/64k.mp3" },
  { n: "临沂音乐广播", u: "https://lhttp.qtfm.cn/live/4017/64k.mp3" },
  { n: "FM1044太原经济广播", u: "https://lhttp.qtfm.cn/live/4018/64k.mp3" },
  { n: "金山区广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/4022/64k.mp3" },
  { n: "绵阳交通广播", u: "https://lhttp.qtfm.cn/live/4026/64k.mp3" },
  { n: "楚雄综合广播", u: "https://lhttp.qtfm.cn/live/4030/64k.mp3" },
  { n: "西双版纳民族语广播FM90.6", u: "https://lhttp.qtfm.cn/live/4036/64k.mp3" },
  { n: "江苏交通广播", u: "https://lhttp.qtfm.cn/live/4054/64k.mp3" },
  { n: "长沙FM101.7城市之声", u: "https://lhttp.qtfm.cn/live/4237/64k.mp3" },
  { n: "浙江之声", u: "https://lhttp.qtfm.cn/live/4518/64k.mp3" },
  { n: "浙江经济广播", u: "https://lhttp.qtfm.cn/live/4519/64k.mp3" },
  { n: "浙江FM99.6", u: "https://lhttp.qtfm.cn/live/4521/64k.mp3" },
  { n: "FM93浙江交通之声", u: "https://lhttp.qtfm.cn/live/4522/64k.mp3" },
  { n: "FM104.5旅游之声", u: "https://lhttp.qtfm.cn/live/4524/64k.mp3" },
  { n: "开封私家车音乐广播", u: "https://lhttp.qtfm.cn/live/4569/64k.mp3" },
  { n: "蚌埠交通文艺广播", u: "https://lhttp.qtfm.cn/live/4577/64k.mp3" },
  { n: "亚洲音乐成都FM96.5", u: "https://lhttp.qtfm.cn/live/4581/64k.mp3" },
  { n: "淮安交通文艺", u: "https://lhttp.qtfm.cn/live/4586/64k.mp3" },
  { n: "淮安FM104.2", u: "https://lhttp.qtfm.cn/live/4588/64k.mp3" },
  { n: "淮安新闻综合", u: "https://lhttp.qtfm.cn/live/4589/64k.mp3" },
  { n: "潮州交通音乐广播", u: "https://lhttp.qtfm.cn/live/4594/64k.mp3" },
  { n: "潮州戏曲广播", u: "https://lhttp.qtfm.cn/live/4595/64k.mp3" },
  { n: "潮州综合频率", u: "https://lhttp.qtfm.cn/live/4596/64k.mp3" },
  { n: "武汉交通广播", u: "https://lhttp.qtfm.cn/live/4665/64k.mp3" },
  { n: "怀集音乐之声", u: "https://lhttp.qtfm.cn/live/4804/64k.mp3" },
  { n: "投资传媒（股市广播）", u: "https://lhttp.qtfm.cn/live/4847/64k.mp3" },
  { n: "广州新闻电台", u: "https://lhttp.qtfm.cn/live/4848/64k.mp3" },
  { n: "乐山音乐交通广播FM100.5", u: "https://lhttp.qtfm.cn/live/4864/64k.mp3" },
  { n: "潍坊982广播电台", u: "https://lhttp.qtfm.cn/live/4865/64k.mp3" },
  { n: "浙江音乐调频", u: "https://lhttp.qtfm.cn/live/4866/64k.mp3" },
  { n: "河北生活广播", u: "https://lhttp.qtfm.cn/live/4867/64k.mp3" },
  { n: "河北文艺广播", u: "https://lhttp.qtfm.cn/live/4868/64k.mp3" },
  { n: "唐山音乐广播", u: "https://lhttp.qtfm.cn/live/4871/64k.mp3" },
  { n: "FM105.0长沙新闻广播", u: "https://lhttp.qtfm.cn/live/4877/64k.mp3" },
  { n: "海南音乐广播", u: "https://lhttp.qtfm.cn/live/4878/64k.mp3" },
  { n: "湖南交通频道", u: "https://lhttp.qtfm.cn/live/4879/64k.mp3" },
  { n: "四川交通广播FM101.7", u: "https://lhttp.qtfm.cn/live/4886/64k.mp3" },
  { n: "成都交通文艺广播FM91.4", u: "https://lhttp.qtfm.cn/live/4891/64k.mp3" },
  { n: "成都新闻广播", u: "https://lhttp.qtfm.cn/live/4897/64k.mp3" },
  { n: "FM101.8济宁综合广播", u: "https://lhttp.qtfm.cn/live/4901/64k.mp3" },
  { n: "攀枝花综合广播", u: "https://lhttp.qtfm.cn/live/4904/64k.mp3" },
  { n: "攀枝花交通音乐广播", u: "https://lhttp.qtfm.cn/live/4905/64k.mp3" },
  { n: "四川新闻广播FM106.1", u: "https://lhttp.qtfm.cn/live/4906/64k.mp3" },
  { n: "海南交通广播", u: "https://lhttp.qtfm.cn/live/4911/64k.mp3" },
  { n: "乐享音乐", u: "https://lhttp.qtfm.cn/live/4913/64k.mp3" },
  { n: "清晨音乐台", u: "https://lhttp.qtfm.cn/live/4915/64k.mp3" },
  { n: "听梦想FM", u: "https://lhttp.qtfm.cn/live/4917/64k.mp3" },
  { n: "安徽综合广播", u: "https://lhttp.qtfm.cn/live/4919/64k.mp3" },
  { n: "郑州音乐广播", u: "https://lhttp.qtfm.cn/live/4921/64k.mp3" },
  { n: "徐州新闻综合广播", u: "https://lhttp.qtfm.cn/live/4922/64k.mp3" },
  { n: "徐州音乐广播FM91.9", u: "https://lhttp.qtfm.cn/live/4923/64k.mp3" },
  { n: "徐州交通广播", u: "https://lhttp.qtfm.cn/live/4924/64k.mp3" },
  { n: "FM102.2亲子智慧电台", u: "https://lhttp.qtfm.cn/live/4930/64k.mp3" },
  { n: "山西音乐广播", u: "https://lhttp.qtfm.cn/live/4932/64k.mp3" },
  { n: "江苏音乐广播PlayFM897", u: "https://lhttp.qtfm.cn/live/4936/64k.mp3" },
  { n: "湖南金鹰955电台", u: "https://lhttp.qtfm.cn/live/4937/64k.mp3" },
  { n: "FM94.5赣州交通音乐广播", u: "https://lhttp.qtfm.cn/live/4942/64k.mp3" },
  { n: "江苏新闻广播", u: "https://lhttp.qtfm.cn/live/4944/64k.mp3" },
  { n: "吉林交通广播", u: "https://lhttp.qtfm.cn/live/4945/64k.mp3" },
  { n: "吉林健康娱乐广播", u: "https://lhttp.qtfm.cn/live/4952/64k.mp3" },
  { n: "吉林新闻综合广播", u: "https://lhttp.qtfm.cn/live/4953/64k.mp3" },
  { n: "广州交通广播", u: "https://lhttp.qtfm.cn/live/4955/64k.mp3" },
  { n: "FM95.2青岛故事广播", u: "https://lhttp.qtfm.cn/live/4956/64k.mp3" },
  { n: "南京音乐广播", u: "https://lhttp.qtfm.cn/live/4963/64k.mp3" },
  { n: "长春交通之声", u: "https://lhttp.qtfm.cn/live/4967/64k.mp3" },
  { n: "龙广都市女性台", u: "https://lhttp.qtfm.cn/live/4968/64k.mp3" },
  { n: "黑龙江生活广播", u: "https://lhttp.qtfm.cn/live/4970/64k.mp3" },
  { n: "黑龙江交通广播", u: "https://lhttp.qtfm.cn/live/4973/64k.mp3" },
  { n: "黑龙江高校广播", u: "https://lhttp.qtfm.cn/live/4976/64k.mp3" },
  { n: "89.3芒果音乐台", u: "https://lhttp.qtfm.cn/live/4979/64k.mp3" },
  { n: "萤火虫网络电台", u: "https://lhttp.qtfm.cn/live/4998/64k.mp3" },
  { n: "扬州新闻广播", u: "https://lhttp.qtfm.cn/live/5000/64k.mp3" },
  { n: "宿迁交通广播", u: "https://lhttp.qtfm.cn/live/5004/64k.mp3" },
  { n: "宿豫人民广播电台", u: "https://lhttp.qtfm.cn/live/5005/64k.mp3" },
  { n: "青海交通音乐", u: "https://lhttp.qtfm.cn/live/5009/64k.mp3" },
  { n: "长春新闻广播", u: "https://lhttp.qtfm.cn/live/5013/64k.mp3" },
  { n: "惠州综合广播FM100", u: "https://lhttp.qtfm.cn/live/5016/64k.mp3" },
  { n: "宣城广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5022/64k.mp3" },
  { n: "宣城交通1061", u: "https://lhttp.qtfm.cn/live/5023/64k.mp3" },
  { n: "福州新闻广播", u: "https://lhttp.qtfm.cn/live/5025/64k.mp3" },
  { n: "福州交通之声", u: "https://lhttp.qtfm.cn/live/5026/64k.mp3" },
  { n: "芜湖交通经济广播", u: "https://lhttp.qtfm.cn/live/5027/64k.mp3" },
  { n: "芜湖音乐故事广播", u: "https://lhttp.qtfm.cn/live/5028/64k.mp3" },
  { n: "芜湖综合广播", u: "https://lhttp.qtfm.cn/live/5029/64k.mp3" },
  { n: "钦州新闻综合广播", u: "https://lhttp.qtfm.cn/live/5042/64k.mp3" },
  { n: "黔西南FM88.3交通旅游广播", u: "https://lhttp.qtfm.cn/live/5046/64k.mp3" },
  { n: "FM93.6绍兴综合广播", u: "https://lhttp.qtfm.cn/live/5052/64k.mp3" },
  { n: "FM94.1绍兴交通广播", u: "https://lhttp.qtfm.cn/live/5053/64k.mp3" },
  { n: "FM103.5绍兴音乐广播", u: "https://lhttp.qtfm.cn/live/5054/64k.mp3" },
  { n: "江苏新闻综合广播", u: "https://lhttp.qtfm.cn/live/5055/64k.mp3" },
  { n: "997金陵之声", u: "https://lhttp.qtfm.cn/live/5056/64k.mp3" },
  { n: "襄阳文化教育广播", u: "https://lhttp.qtfm.cn/live/5057/64k.mp3" },
  { n: "新会人民广播电台", u: "https://lhttp.qtfm.cn/live/5061/64k.mp3" },
  { n: "Tiktok网络电台", u: "https://lhttp.qtfm.cn/live/5062/64k.mp3" },
  { n: "公安人民广播电台", u: "https://lhttp.qtfm.cn/live/5063/64k.mp3" },
  { n: "白山交通广播FM950", u: "https://lhttp.qtfm.cn/live/5083/64k.mp3" },
  { n: "天津滨海100.5", u: "https://lhttp.qtfm.cn/live/20003/64k.mp3" },
  { n: "96.4临安人民广播电台", u: "https://lhttp.qtfm.cn/live/20005/64k.mp3" },
  { n: "FM912太原综合广播", u: "https://lhttp.qtfm.cn/live/20006/64k.mp3" },
  { n: "880山西交通广播", u: "https://lhttp.qtfm.cn/live/20007/64k.mp3" },
  { n: "江苏故事广播", u: "https://lhttp.qtfm.cn/live/20012/64k.mp3" },
  { n: "江苏文艺广播", u: "https://lhttp.qtfm.cn/live/20013/64k.mp3" },
  { n: "江苏健康广播", u: "https://lhttp.qtfm.cn/live/20014/64k.mp3" },
  { n: "江苏财经广播", u: "https://lhttp.qtfm.cn/live/20015/64k.mp3" },
  { n: "辽宁乡村广播", u: "https://lhttp.qtfm.cn/live/20018/64k.mp3" },
  { n: "辽宁经济广播", u: "https://lhttp.qtfm.cn/live/20019/64k.mp3" },
  { n: "沈阳之声", u: "https://lhttp.qtfm.cn/live/20024/64k.mp3" },
  { n: "辽宁交通广播FM97.5", u: "https://lhttp.qtfm.cn/live/20025/64k.mp3" },
  { n: "郁南音乐台", u: "https://lhttp.qtfm.cn/live/20026/64k.mp3" },
  { n: "贵州交通广播", u: "https://lhttp.qtfm.cn/live/20057/64k.mp3" },
  { n: "贵州广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20063/64k.mp3" },
  { n: "贵州FM91.6音乐广播", u: "https://lhttp.qtfm.cn/live/20067/64k.mp3" },
  { n: "AsiaFM 亚洲天空台", u: "https://lhttp.qtfm.cn/live/20071/64k.mp3" },
  { n: "哈尔滨广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20077/64k.mp3" },
  { n: "哈尔滨文艺广播", u: "https://lhttp.qtfm.cn/live/20083/64k.mp3" },
  { n: "济宁交通广播", u: "https://lhttp.qtfm.cn/live/20087/64k.mp3" },
  { n: "中国校园之声", u: "https://lhttp.qtfm.cn/live/20091/64k.mp3" },
  { n: "江西旅游广播FM97.4", u: "https://lhttp.qtfm.cn/live/20133/64k.mp3" },
  { n: "东营交通音乐广播FM98.4", u: "https://lhttp.qtfm.cn/live/20142/64k.mp3" },
  { n: "东营综合广播", u: "https://lhttp.qtfm.cn/live/20144/64k.mp3" },
  { n: "邵阳综合广播", u: "https://lhttp.qtfm.cn/live/20148/64k.mp3" },
  { n: "886武进之声", u: "https://lhttp.qtfm.cn/live/20150/64k.mp3" },
  { n: "蚌埠新闻综合广播", u: "https://lhttp.qtfm.cn/live/20154/64k.mp3" },
  { n: "龙岗广播FM99.1", u: "https://lhttp.qtfm.cn/live/20160/64k.mp3" },
  { n: "FM104.8 保定民生广播", u: "https://lhttp.qtfm.cn/live/20168/64k.mp3" },
  { n: "新余新闻广播", u: "https://lhttp.qtfm.cn/live/20178/64k.mp3" },
  { n: "遂宁新闻综合台", u: "https://lhttp.qtfm.cn/live/20182/64k.mp3" },
  { n: "广州汽车音乐电台", u: "https://lhttp.qtfm.cn/live/20192/64k.mp3" },
  { n: "广州GZFM88.0", u: "https://lhttp.qtfm.cn/live/20194/64k.mp3" },
  { n: "武汉新闻广播", u: "https://lhttp.qtfm.cn/live/20198/64k.mp3" },
  { n: "武汉经济广播", u: "https://lhttp.qtfm.cn/live/20200/64k.mp3" },
  { n: "乐清人民广播电台", u: "https://lhttp.qtfm.cn/live/20204/64k.mp3" },
  { n: "濮阳FM1053快乐调频", u: "https://lhttp.qtfm.cn/live/20206/64k.mp3" },
  { n: "山东广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20234/64k.mp3" },
  { n: "山东经典音乐广播", u: "https://lhttp.qtfm.cn/live/20240/64k.mp3" },
  { n: "FM99.7 益阳电台综合频道", u: "https://lhttp.qtfm.cn/live/20314/64k.mp3" },
  { n: "延边广播朝鲜语综合频率", u: "https://lhttp.qtfm.cn/live/20324/64k.mp3" },
  { n: "盐城交通广播", u: "https://lhttp.qtfm.cn/live/20326/64k.mp3" },
  { n: "FM98.8 盐城综合广播", u: "https://lhttp.qtfm.cn/live/20330/64k.mp3" },
  { n: "十堰综合广播", u: "https://lhttp.qtfm.cn/live/20338/64k.mp3" },
  { n: "十堰交通音乐广播", u: "https://lhttp.qtfm.cn/live/20342/64k.mp3" },
  { n: "FM896鄂尔多斯之声", u: "https://lhttp.qtfm.cn/live/20350/64k.mp3" },
  { n: "鄂尔多斯交通文体广播", u: "https://lhttp.qtfm.cn/live/20352/64k.mp3" },
  { n: "南宁990新闻台", u: "https://lhttp.qtfm.cn/live/20358/64k.mp3" },
  { n: "衢州新闻综合广播", u: "https://lhttp.qtfm.cn/live/20444/64k.mp3" },
  { n: "三亚天涯之声", u: "https://lhttp.qtfm.cn/live/20450/64k.mp3" },
  { n: "山西健康之声", u: "https://lhttp.qtfm.cn/live/20470/64k.mp3" },
  { n: "FM101.5山西文艺广播", u: "https://lhttp.qtfm.cn/live/20485/64k.mp3" },
  { n: "吉林旅游广播", u: "https://lhttp.qtfm.cn/live/20487/64k.mp3" },
  { n: "郴州综合广播", u: "https://lhttp.qtfm.cn/live/20489/64k.mp3" },
  { n: "山西综合广播FM904", u: "https://lhttp.qtfm.cn/live/20491/64k.mp3" },
  { n: "958电台山西经济广播", u: "https://lhttp.qtfm.cn/live/20501/64k.mp3" },
  { n: "杭州华语之声", u: "https://lhttp.qtfm.cn/live/20505/64k.mp3" },
  { n: "娄底交通广播", u: "https://lhttp.qtfm.cn/live/20507/64k.mp3" },
  { n: "FM93.1滨州交通音乐广播", u: "https://lhttp.qtfm.cn/live/20519/64k.mp3" },
  { n: "四川南部新闻综合广播", u: "https://lhttp.qtfm.cn/live/20525/64k.mp3" },
  { n: "自贡文化旅游广播", u: "https://lhttp.qtfm.cn/live/20529/64k.mp3" },
  { n: "义乌交通广播", u: "https://lhttp.qtfm.cn/live/20533/64k.mp3" },
  { n: "宜昌交通广播", u: "https://lhttp.qtfm.cn/live/20563/64k.mp3" },
  { n: "宜昌新闻综合广播", u: "https://lhttp.qtfm.cn/live/20565/64k.mp3" },
  { n: "宜昌音乐广播", u: "https://lhttp.qtfm.cn/live/20567/64k.mp3" },
  { n: "FM99.10柳州交通广播", u: "https://lhttp.qtfm.cn/live/20571/64k.mp3" },
  { n: "如东新闻综合广播", u: "https://lhttp.qtfm.cn/live/20579/64k.mp3" },
  { n: "湛江广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20617/64k.mp3" },
  { n: "威海新闻电台", u: "https://lhttp.qtfm.cn/live/20669/64k.mp3" },
  { n: "江油人民广播电台", u: "https://lhttp.qtfm.cn/live/20673/64k.mp3" },
  { n: "贵港金曲1019", u: "https://lhttp.qtfm.cn/live/20697/64k.mp3" },
  { n: "恩平FM97.7", u: "https://lhttp.qtfm.cn/live/20701/64k.mp3" },
  { n: "龙岩电台综合广播", u: "https://lhttp.qtfm.cn/live/20709/64k.mp3" },
  { n: "朝阳新闻综合广播", u: "https://lhttp.qtfm.cn/live/20715/64k.mp3" },
  { n: "朝阳交通广播", u: "https://lhttp.qtfm.cn/live/20719/64k.mp3" },
  { n: "遵义综合广播", u: "https://lhttp.qtfm.cn/live/20741/64k.mp3" },
  { n: "南宁1074交通台", u: "https://lhttp.qtfm.cn/live/20767/64k.mp3" },
  { n: "焦作交通旅游广播", u: "https://lhttp.qtfm.cn/live/20805/64k.mp3" },
  { n: "即墨融媒综合广播", u: "https://lhttp.qtfm.cn/live/20807/64k.mp3" },
  { n: "潍坊933经济广播", u: "https://lhttp.qtfm.cn/live/20839/64k.mp3" },
  { n: "FM88.6长沙音乐广播", u: "https://lhttp.qtfm.cn/live/20847/64k.mp3" },
  { n: "随州综合广播", u: "https://lhttp.qtfm.cn/live/20853/64k.mp3" },
  { n: "秦皇岛新闻综合广播", u: "https://lhttp.qtfm.cn/live/20855/64k.mp3" },
  { n: "秦皇岛1038私家车广播", u: "https://lhttp.qtfm.cn/live/20859/64k.mp3" },
  { n: "北海新闻综合广播", u: "https://lhttp.qtfm.cn/live/20861/64k.mp3" },
  { n: "1028郴州交通旅游广播", u: "https://lhttp.qtfm.cn/live/20867/64k.mp3" },
  { n: "内蒙古草原之声广播", u: "https://lhttp.qtfm.cn/live/20973/64k.mp3" },
  { n: "岳阳交通广播", u: "https://lhttp.qtfm.cn/live/20987/64k.mp3" },
  { n: "岳阳新闻综合广播", u: "https://lhttp.qtfm.cn/live/20989/64k.mp3" },
  { n: "新疆990音乐广播", u: "https://lhttp.qtfm.cn/live/21001/64k.mp3" },
  { n: "鄂州广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/21025/64k.mp3" },
  { n: "随州交通经济广播", u: "https://lhttp.qtfm.cn/live/21027/64k.mp3" },
  { n: "东阳城市广播", u: "https://lhttp.qtfm.cn/live/21181/64k.mp3" },
  { n: "南充交通音乐广播FM91.5", u: "https://lhttp.qtfm.cn/live/21231/64k.mp3" },
  { n: "海南民生广播", u: "https://lhttp.qtfm.cn/live/21243/64k.mp3" },
  { n: "宿迁汽车音乐台", u: "https://lhttp.qtfm.cn/live/21265/64k.mp3" },
  { n: "FM104.2湘潭交通广播", u: "https://lhttp.qtfm.cn/live/21269/64k.mp3" },
  { n: "南通音乐广播", u: "https://lhttp.qtfm.cn/live/21275/64k.mp3" },
  { n: "南通新闻广播", u: "https://lhttp.qtfm.cn/live/21277/64k.mp3" },
  { n: "铜陵新闻综合广播", u: "https://lhttp.qtfm.cn/live/21303/64k.mp3" },
  { n: "铜陵交通生活广播", u: "https://lhttp.qtfm.cn/live/21305/64k.mp3" },
  { n: "广安交通旅游广播", u: "https://lhttp.qtfm.cn/live/21309/64k.mp3" },
  { n: "105.7滨州文艺音乐广播", u: "https://lhttp.qtfm.cn/live/21341/64k.mp3" },
  { n: "南充综合广播FM100.4", u: "https://lhttp.qtfm.cn/live/21357/64k.mp3" },
  { n: "滨州综合广播", u: "https://lhttp.qtfm.cn/live/5021395/64k.mp3" },
  { n: "慈溪经典车电台", u: "https://lhttp.qtfm.cn/live/5021401/64k.mp3" },
  { n: "濮阳好音乐1023", u: "https://lhttp.qtfm.cn/live/5021461/64k.mp3" },
  { n: "张家口旅游广播", u: "https://lhttp.qtfm.cn/live/5021507/64k.mp3" },
  { n: "惠州音乐广播", u: "https://lhttp.qtfm.cn/live/5021523/64k.mp3" },
  { n: "泸州新闻广播", u: "https://lhttp.qtfm.cn/live/5021557/64k.mp3" },
  { n: "泸州交通广播", u: "https://lhttp.qtfm.cn/live/5021559/64k.mp3" },
  { n: "泸州音乐广播", u: "https://lhttp.qtfm.cn/live/5021565/64k.mp3" },
  { n: "蒙自广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5021599/64k.mp3" },
  { n: "文山交通广播", u: "https://lhttp.qtfm.cn/live/5021637/64k.mp3" },
  { n: "西双版纳综合广播FM101.4", u: "https://lhttp.qtfm.cn/live/5021709/64k.mp3" },
  { n: "北京大兴人民广播电台FM986", u: "https://lhttp.qtfm.cn/live/5021739/64k.mp3" },
  { n: "晋城音乐广播魅力1021", u: "https://lhttp.qtfm.cn/live/5021761/64k.mp3" },
  { n: "桐乡之声", u: "https://lhttp.qtfm.cn/live/5021791/64k.mp3" },
  { n: "张家口986音乐广播", u: "https://lhttp.qtfm.cn/live/5021801/64k.mp3" },
  { n: "保定1058飞扬调频汽车音乐广播", u: "https://lhttp.qtfm.cn/live/5021803/64k.mp3" },
  { n: "德宏民语综合广播", u: "https://lhttp.qtfm.cn/live/5021850/64k.mp3" },
  { n: "长治交通广播", u: "https://lhttp.qtfm.cn/live/5021851/64k.mp3" },
  { n: "FM106.8常德鼎广电台", u: "https://lhttp.qtfm.cn/live/5021860/64k.mp3" },
  { n: "安康交通广播", u: "https://lhttp.qtfm.cn/live/5021862/64k.mp3" },
  { n: "七星关综合广播", u: "https://lhttp.qtfm.cn/live/5021866/64k.mp3" },
  { n: "南康交通广播", u: "https://lhttp.qtfm.cn/live/5021869/64k.mp3" },
  { n: "沧州新闻广播", u: "https://lhttp.qtfm.cn/live/5021901/64k.mp3" },
  { n: "沧州音乐广播FM103.6", u: "https://lhttp.qtfm.cn/live/5021902/64k.mp3" },
  { n: "自强之声", u: "https://lhttp.qtfm.cn/live/5021905/64k.mp3" },
  { n: "内江综合广播", u: "https://lhttp.qtfm.cn/live/5021907/64k.mp3" },
  { n: "FM101仙居融媒体广播", u: "https://lhttp.qtfm.cn/live/5021908/64k.mp3" },
  { n: "张家口交通广播", u: "https://lhttp.qtfm.cn/live/5021910/64k.mp3" },
  { n: "AsiaFM 亚洲经典台", u: "https://lhttp.qtfm.cn/live/5021912/64k.mp3" },
  { n: "沧州1058汽车音乐广播", u: "https://lhttp.qtfm.cn/live/5021914/64k.mp3" },
  { n: "九江交通广播", u: "https://lhttp.qtfm.cn/live/5021918/64k.mp3" },
  { n: "快乐903私家车广播", u: "https://lhttp.qtfm.cn/live/5021919/64k.mp3" },
  { n: "商丘交通1007", u: "https://lhttp.qtfm.cn/live/5021932/64k.mp3" },
  { n: "德阳旌阳电台", u: "https://lhttp.qtfm.cn/live/5021933/64k.mp3" },
  { n: "衡水交通广播925", u: "https://lhttp.qtfm.cn/live/5021940/64k.mp3" },
  { n: "客都之声 FM103.9", u: "https://lhttp.qtfm.cn/live/5021942/64k.mp3" },
  { n: "淮安车生活广播", u: "https://lhttp.qtfm.cn/live/5021970/64k.mp3" },
  { n: "魅力FM1008", u: "https://lhttp.qtfm.cn/live/5021975/64k.mp3" },
  { n: "天井湖之声FM1024", u: "https://lhttp.qtfm.cn/live/5021979/64k.mp3" },
  { n: "FM882 成都故事广播", u: "https://lhttp.qtfm.cn/live/5022004/64k.mp3" },
  { n: "FM101.8海口综合广播", u: "https://lhttp.qtfm.cn/live/5022015/64k.mp3" },
  { n: "辽宁资讯广播fm90.6大连分台", u: "https://lhttp.qtfm.cn/live/5022018/64k.mp3" },
  { n: "郏县886", u: "https://lhttp.qtfm.cn/live/5022022/64k.mp3" },
  { n: "辽阳交通文艺广播", u: "https://lhttp.qtfm.cn/live/5022030/64k.mp3" },
  { n: "FM106.5德清之声", u: "https://lhttp.qtfm.cn/live/5022033/64k.mp3" },
  { n: "FM104.8鹰潭新闻综合频率", u: "https://lhttp.qtfm.cn/live/5022035/64k.mp3" },
  { n: "FM103.2鹰潭交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022036/64k.mp3" },
  { n: "年代965经典音乐广播", u: "https://lhttp.qtfm.cn/live/5022038/64k.mp3" },
  { n: "衡水综合广播", u: "https://lhttp.qtfm.cn/live/5022040/64k.mp3" },
  { n: "凯里人民广播电台", u: "https://lhttp.qtfm.cn/live/5022045/64k.mp3" },
  { n: "1052LoveRadio", u: "https://lhttp.qtfm.cn/live/5022061/64k.mp3" },
  { n: "FM904台山人民广播电台", u: "https://lhttp.qtfm.cn/live/5022062/64k.mp3" },
  { n: "孝感交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022063/64k.mp3" },
  { n: "怀化电台综合广播", u: "https://lhttp.qtfm.cn/live/5022069/64k.mp3" },
  { n: "怀化交通广播", u: "https://lhttp.qtfm.cn/live/5022070/64k.mp3" },
  { n: "武穴人民广播电台", u: "https://lhttp.qtfm.cn/live/5022071/64k.mp3" },
  { n: "韶关综合广播", u: "https://lhttp.qtfm.cn/live/5022074/64k.mp3" },
  { n: "长沙925电台", u: "https://lhttp.qtfm.cn/live/5022076/64k.mp3" },
  { n: "登封综合广播", u: "https://lhttp.qtfm.cn/live/5022077/64k.mp3" },
  { n: "交通954", u: "https://lhttp.qtfm.cn/live/5022079/64k.mp3" },
  { n: "鹤壁交通广播FM99.4", u: "https://lhttp.qtfm.cn/live/5022089/64k.mp3" },
  { n: "FM91.1邹平人民广播电台", u: "https://lhttp.qtfm.cn/live/5022097/64k.mp3" },
  { n: "巴音郭楞广播电视台1077交通文艺广播", u: "https://lhttp.qtfm.cn/live/5022104/64k.mp3" },
  { n: "德阳经济生活广播", u: "https://lhttp.qtfm.cn/live/5022110/64k.mp3" },
  { n: "驻马店综合广播", u: "https://lhttp.qtfm.cn/live/5022118/64k.mp3" },
  { n: "驻马店交通广播", u: "https://lhttp.qtfm.cn/live/5022119/64k.mp3" },
  { n: "三门峡综合广播", u: "https://lhttp.qtfm.cn/live/5022134/64k.mp3" },
  { n: "安溪人民广播电台", u: "https://lhttp.qtfm.cn/live/5022135/64k.mp3" },
  { n: "济源新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022142/64k.mp3" },
  { n: "凉山综合广播", u: "https://lhttp.qtfm.cn/live/5022143/64k.mp3" },
  { n: "延吉综合广播（朝鲜语）", u: "https://lhttp.qtfm.cn/live/5022144/64k.mp3" },
  { n: "蕲春人民广播电台", u: "https://lhttp.qtfm.cn/live/5022252/64k.mp3" },
  { n: "聊城经济广播", u: "https://lhttp.qtfm.cn/live/5022262/64k.mp3" },
  { n: "黄梅之声", u: "https://lhttp.qtfm.cn/live/5022280/64k.mp3" },
  { n: "西宁新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022282/64k.mp3" },
  { n: "黔东南综合广播FM89.8", u: "https://lhttp.qtfm.cn/live/5022285/64k.mp3" },
  { n: "琼海人民广播电台", u: "https://lhttp.qtfm.cn/live/5022287/64k.mp3" },
  { n: "FM97.3太湖之声", u: "https://lhttp.qtfm.cn/live/5022311/64k.mp3" },
  { n: "FM97.4济南都市广播", u: "https://lhttp.qtfm.cn/live/5022333/64k.mp3" },
  { n: "冰城1026哈尔滨古典音乐广播", u: "https://lhttp.qtfm.cn/live/5022338/64k.mp3" },
  { n: "曹县融媒体中心综合广播FM93.3", u: "https://lhttp.qtfm.cn/live/5022340/64k.mp3" },
  { n: "上海沸点100音乐广播", u: "https://lhttp.qtfm.cn/live/5022341/64k.mp3" },
  { n: "威宁阳光945", u: "https://lhttp.qtfm.cn/live/5022342/64k.mp3" },
  { n: "富顺人民广播电台", u: "https://lhttp.qtfm.cn/live/5022355/64k.mp3" },
  { n: "泉州刺桐之声", u: "https://lhttp.qtfm.cn/live/5022360/64k.mp3" },
  { n: "池州综合广播", u: "https://lhttp.qtfm.cn/live/5022373/64k.mp3" },
  { n: "盐城音乐广播", u: "https://lhttp.qtfm.cn/live/5022380/64k.mp3" },
  { n: "FM898汽车音乐广播", u: "https://lhttp.qtfm.cn/live/5022382/64k.mp3" },
  { n: "开远广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5022383/64k.mp3" },
  { n: "渭南广播FM90.9", u: "https://lhttp.qtfm.cn/live/5022389/64k.mp3" },
  { n: "英德电台", u: "https://lhttp.qtfm.cn/live/5022392/64k.mp3" },
  { n: "达州综合广播", u: "https://lhttp.qtfm.cn/live/5022394/64k.mp3" },
  { n: "大同交通广播", u: "https://lhttp.qtfm.cn/live/5022396/64k.mp3" },
  { n: "FM100.7咸阳人民广播电台", u: "https://lhttp.qtfm.cn/live/5022397/64k.mp3" },
  { n: "宿州交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022400/64k.mp3" },
  { n: "AsiaFM 亚洲音乐台", u: "https://lhttp.qtfm.cn/live/5022405/64k.mp3" },
  { n: "平定综合广播FM101.1", u: "https://lhttp.qtfm.cn/live/5022407/64k.mp3" },
  { n: "993萍乡新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022409/64k.mp3" },
  { n: "兵团882综合广播", u: "https://lhttp.qtfm.cn/live/5022410/64k.mp3" },
  { n: '安岳人民广播电台"柠都之声"FM98.0', u: "https://lhttp.qtfm.cn/live/5022417/64k.mp3" },
  { n: "牡丹江综合广播", u: "https://lhttp.qtfm.cn/live/5022434/64k.mp3" },
  { n: "FM89.8临海人民广播电台", u: "https://lhttp.qtfm.cn/live/5022437/64k.mp3" },
  { n: "1046延边旅游生活广播", u: "https://lhttp.qtfm.cn/live/5022438/64k.mp3" },
  { n: "保定新闻广播", u: "https://lhttp.qtfm.cn/live/5022440/64k.mp3" },
  { n: "云浮电台综合广播", u: "https://lhttp.qtfm.cn/live/5022442/64k.mp3" },
  { n: "商丘新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022443/64k.mp3" },
  { n: "保山广播电视台FM98.7综合广播", u: "https://lhttp.qtfm.cn/live/5022446/64k.mp3" },
  { n: "辽阳综合广播", u: "https://lhttp.qtfm.cn/live/5022447/64k.mp3" },
  { n: "宝应人民广播电台", u: "https://lhttp.qtfm.cn/live/5022457/64k.mp3" },
  { n: "京津冀之声", u: "https://lhttp.qtfm.cn/live/5022463/64k.mp3" },
  { n: "四平交通文艺台", u: "https://lhttp.qtfm.cn/live/5022465/64k.mp3" },
  { n: "任丘融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/5022470/64k.mp3" },
  { n: "FM97.0庄河融媒广播", u: "https://lhttp.qtfm.cn/live/5022473/64k.mp3" },
  { n: "武安融媒综合广播", u: "https://lhttp.qtfm.cn/live/5022474/64k.mp3" },
  { n: "厦门892集美广播", u: "https://lhttp.qtfm.cn/live/5022479/64k.mp3" },
  { n: "诸暨人民广播电台", u: "https://lhttp.qtfm.cn/live/5022482/64k.mp3" },
  { n: "邢台爱在104", u: "https://lhttp.qtfm.cn/live/5022484/64k.mp3" },
  { n: "延边新闻广播", u: "https://lhttp.qtfm.cn/live/5022488/64k.mp3" },
  { n: "自强健康", u: "https://lhttp.qtfm.cn/live/5022491/64k.mp3" },
  { n: "新疆兵团第十三师调频广播", u: "https://lhttp.qtfm.cn/live/5022506/64k.mp3" },
  { n: "FM105.6", u: "https://lhttp.qtfm.cn/live/5022520/64k.mp3" },
  { n: "阿拉善综合广播", u: "https://lhttp.qtfm.cn/live/5022521/64k.mp3" },
  { n: "兰溪电台FM90.8", u: "https://lhttp.qtfm.cn/live/5022526/64k.mp3" },
  { n: "普宁人民广播电台", u: "https://lhttp.qtfm.cn/live/5022527/64k.mp3" },
  { n: "新民人民广播电台", u: "https://lhttp.qtfm.cn/live/5022535/64k.mp3" },
  { n: "梨树电台北方交通之声", u: "https://lhttp.qtfm.cn/live/5022538/64k.mp3" },
  { n: "德宏交通旅游广播", u: "https://lhttp.qtfm.cn/live/5022548/64k.mp3" },
  { n: "巩义融媒", u: "https://lhttp.qtfm.cn/live/5022551/64k.mp3" },
  { n: "阿拉善蒙语综合广播", u: "https://lhttp.qtfm.cn/live/5022555/64k.mp3" },
  { n: "永康人民广播电台", u: "https://lhttp.qtfm.cn/live/5022570/64k.mp3" },
  { n: "阜阳经济广播", u: "https://lhttp.qtfm.cn/live/5022571/64k.mp3" },
  { n: "广元综合广播", u: "https://lhttp.qtfm.cn/live/5022580/64k.mp3" },
  { n: "广元交通旅游广播", u: "https://lhttp.qtfm.cn/live/5022581/64k.mp3" },
  { n: "献县人民广播电台", u: "https://lhttp.qtfm.cn/live/5022603/64k.mp3" },
  { n: "南部交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022604/64k.mp3" },
  { n: "伊犁FM99.5察布查尔", u: "https://lhttp.qtfm.cn/live/5022610/64k.mp3" },
  { n: "甘肃新闻综合广播", u: "https://lhttp.qtfm.cn/live/5022622/64k.mp3" },
  { n: "怀来人民广播电台 FM95.4", u: "https://lhttp.qtfm.cn/live/5022643/64k.mp3" },
  { n: "红安人民广播电台", u: "https://lhttp.qtfm.cn/live/5022646/64k.mp3" },
  { n: "赣北之声FM94.2", u: "https://lhttp.qtfm.cn/live/5022648/64k.mp3" },
  { n: "汝州人民广播电台", u: "https://lhttp.qtfm.cn/live/5022650/64k.mp3" },
  { n: "漳浦广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/5022658/64k.mp3" },
  { n: "漯河综合广播", u: "https://lhttp.qtfm.cn/live/5022660/64k.mp3" },
  { n: "包河之声电台", u: "https://lhttp.qtfm.cn/live/5022668/64k.mp3" },
  { n: "黄岩电台", u: "https://lhttp.qtfm.cn/live/5022671/64k.mp3" },
  { n: "伊犁维吾尔语综合广播", u: "https://lhttp.qtfm.cn/live/5022688/64k.mp3" },
  { n: "伊犁交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022689/64k.mp3" },
  { n: "伊犁哈萨克语综合广播", u: "https://lhttp.qtfm.cn/live/5022692/64k.mp3" },
  { n: "毕节交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022712/64k.mp3" },
  { n: "魅力FM1064城市生活音乐广播", u: "https://lhttp.qtfm.cn/live/5022716/64k.mp3" },
  { n: "恩施电台新闻综合频率", u: "https://lhttp.qtfm.cn/live/5022718/64k.mp3" },
  { n: "恩施电台交通音乐频率", u: "https://lhttp.qtfm.cn/live/5022719/64k.mp3" },
  { n: "九江新闻综合900红调频", u: "https://lhttp.qtfm.cn/live/5022729/64k.mp3" },
  { n: "FM106.9海城综合广播", u: "https://lhttp.qtfm.cn/live/15318107/64k.mp3" },
  { n: "FM88.1 益阳电台交通频道", u: "https://lhttp.qtfm.cn/live/15318153/64k.mp3" },
  { n: "承德旅游生活广播", u: "https://lhttp.qtfm.cn/live/15318158/64k.mp3" },
  { n: "徐州经典音乐FM942", u: "https://lhttp.qtfm.cn/live/15318160/64k.mp3" },
  { n: "阳泉交通广播", u: "https://lhttp.qtfm.cn/live/15318165/64k.mp3" },
  { n: "怒江广播电视台广播综合频率", u: "https://lhttp.qtfm.cn/live/15318176/64k.mp3" },
  { n: "FM104.7澧县广播电台", u: "https://lhttp.qtfm.cn/live/15318178/64k.mp3" },
  { n: "仪征人民广播电台 FM94.3", u: "https://lhttp.qtfm.cn/live/15318182/64k.mp3" },
  { n: "泉州904交通之声", u: "https://lhttp.qtfm.cn/live/15318189/64k.mp3" },
  { n: "520电台-520星恋情感电台", u: "https://lhttp.qtfm.cn/live/15318191/64k.mp3" },
  { n: "金荔枝经典流行音乐", u: "https://lhttp.qtfm.cn/live/15318194/64k.mp3" },
  { n: "习水新闻综合广播FM908", u: "https://lhttp.qtfm.cn/live/15318201/64k.mp3" },
  { n: "FM105.6 常德综合广播", u: "https://lhttp.qtfm.cn/live/15318208/64k.mp3" },
  { n: "FM97.1常德交通广播", u: "https://lhttp.qtfm.cn/live/15318209/64k.mp3" },
  { n: "976承德交通文艺广播", u: "https://lhttp.qtfm.cn/live/15318216/64k.mp3" },
  { n: "1022永嘉人民广播电台", u: "https://lhttp.qtfm.cn/live/15318231/64k.mp3" },
  { n: "CBS 파워라디오 [Music FM]", u: "https://lhttp.qtfm.cn/live/15318233/64k.mp3" },
  { n: "邢台经济生活广播", u: "https://lhttp.qtfm.cn/live/15318265/64k.mp3" },
  { n: "AI潮流音乐台", u: "https://lhttp.qtfm.cn/live/15318300/64k.mp3" },
  { n: "大连1043", u: "https://lhttp.qtfm.cn/live/15318307/64k.mp3" },
  { n: "欢乐调频", u: "https://lhttp.qtfm.cn/live/15318317/64k.mp3" },
  { n: "建平广播电视台", u: "https://lhttp.qtfm.cn/live/15318332/64k.mp3" },
  { n: "项城936", u: "https://lhttp.qtfm.cn/live/15318335/64k.mp3" },
  { n: "AsiaFM HD音乐台", u: "https://lhttp.qtfm.cn/live/15318341/64k.mp3" },
  { n: "泉州广播电视台889新闻综合广播", u: "https://lhttp.qtfm.cn/live/15318346/64k.mp3" },
  { n: "FM954龙游电台", u: "https://lhttp.qtfm.cn/live/15318359/64k.mp3" },
  { n: "佛冈电台", u: "https://lhttp.qtfm.cn/live/15318379/64k.mp3" },
  { n: "衡阳交通经济广播", u: "https://lhttp.qtfm.cn/live/15318385/64k.mp3" },
  { n: "衡阳综合广播", u: "https://lhttp.qtfm.cn/live/15318386/64k.mp3" },
  { n: "永安广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/15318388/64k.mp3" },
  { n: "淮安经典992", u: "https://lhttp.qtfm.cn/live/15318398/64k.mp3" },
  { n: "重庆南川97.0", u: "https://lhttp.qtfm.cn/live/15318405/64k.mp3" },
  { n: "珠海斗门电台", u: "https://lhttp.qtfm.cn/live/15318432/64k.mp3" },
  { n: "金湖人民广播电台", u: "https://lhttp.qtfm.cn/live/15318464/64k.mp3" },
  { n: "万盛融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/15318480/64k.mp3" },
  { n: "邢台交通音乐广播", u: "https://lhttp.qtfm.cn/live/15318481/64k.mp3" },
  { n: "河间市融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/15318503/64k.mp3" },
  { n: "监利人民广播电台", u: "https://lhttp.qtfm.cn/live/15318507/64k.mp3" },
  { n: "声音控电台", u: "https://lhttp.qtfm.cn/live/15318519/64k.mp3" },
  { n: "动听913（宣化区融媒体中心综合广播）", u: "https://lhttp.qtfm.cn/live/15318538/64k.mp3" },
  { n: "三台人民广播电台", u: "https://lhttp.qtfm.cn/live/15318544/64k.mp3" },
  { n: "孝昌964电台", u: "https://lhttp.qtfm.cn/live/15318546/64k.mp3" },
  { n: "FM88.2湘潭新闻综合广播", u: "https://lhttp.qtfm.cn/live/15318549/64k.mp3" },
  { n: "阿克苏汉语综合广播FM94", u: "https://lhttp.qtfm.cn/live/15318550/64k.mp3" },
  { n: "阳泉综合广播", u: "https://lhttp.qtfm.cn/live/15318568/64k.mp3" },
  { n: "蒙阴人民广播电台", u: "https://lhttp.qtfm.cn/live/15318571/64k.mp3" },
  { n: "三门广播电台", u: "https://lhttp.qtfm.cn/live/15318638/64k.mp3" },
  { n: "长垣综合广播FM95.7", u: "https://lhttp.qtfm.cn/live/15318663/64k.mp3" },
  { n: "FM88.7 清远综合广播", u: "https://lhttp.qtfm.cn/live/15318668/64k.mp3" },
  { n: "化州人民广播电台", u: "https://lhttp.qtfm.cn/live/15318689/64k.mp3" },
  { n: "FM99.6宜章县广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/15318691/64k.mp3" },
  { n: "从化广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/15318698/64k.mp3" },
  { n: "FM893周口交通广播", u: "https://lhttp.qtfm.cn/live/15318700/64k.mp3" },
  { n: "欧美音乐88.7", u: "https://lhttp.qtfm.cn/live/15318703/64k.mp3" },
  { n: "乌海交通音乐广播", u: "https://lhttp.qtfm.cn/live/15318704/64k.mp3" },
  { n: "FM96.1邹城之声", u: "https://lhttp.qtfm.cn/live/20207732/64k.mp3" },
  { n: "如皋汽车广播", u: "https://lhttp.qtfm.cn/live/20207734/64k.mp3" },
  { n: "濮阳新闻广播", u: "https://lhttp.qtfm.cn/live/20207739/64k.mp3" },
  { n: "大理综合广播", u: "https://lhttp.qtfm.cn/live/20207747/64k.mp3" },
  { n: "979丹阳之声", u: "https://lhttp.qtfm.cn/live/20207749/64k.mp3" },
  { n: "阜宁人民广播", u: "https://lhttp.qtfm.cn/live/20207753/64k.mp3" },
  { n: "四川之声981", u: "https://lhttp.qtfm.cn/live/20207767/64k.mp3" },
  { n: "成都龙泉人民广播电台FM93.3", u: "https://lhttp.qtfm.cn/live/20207769/64k.mp3" },
  { n: "怀旧金曲广播", u: "https://lhttp.qtfm.cn/live/20207773/64k.mp3" },
  { n: "黄冈交通音乐广播", u: "https://lhttp.qtfm.cn/live/20207776/64k.mp3" },
  { n: "南江人民广播电台", u: "https://lhttp.qtfm.cn/live/20207778/64k.mp3" },
  { n: "滨海1029", u: "https://lhttp.qtfm.cn/live/20207779/64k.mp3" },
  { n: "托峰明珠交通音乐", u: "https://lhttp.qtfm.cn/live/20207780/64k.mp3" },
  { n: "自贡综合广播", u: "https://lhttp.qtfm.cn/live/20207784/64k.mp3" },
  { n: "FM963界首之声（界首新闻综合广播）", u: "https://lhttp.qtfm.cn/live/20207785/64k.mp3" },
  { n: "亳州新闻综合广播", u: "https://lhttp.qtfm.cn/live/20207787/64k.mp3" },
  { n: "TOP Radio 安阳881", u: "https://lhttp.qtfm.cn/live/20209339/64k.mp3" },
  { n: "巴中交通旅游广播", u: "https://lhttp.qtfm.cn/live/20209340/64k.mp3" },
  { n: "巴中新闻综合广播", u: "https://lhttp.qtfm.cn/live/20210239/64k.mp3" },
  { n: "镇雄新闻综合广播", u: "https://lhttp.qtfm.cn/live/20210752/64k.mp3" },
  { n: "洛阳城市993", u: "https://lhttp.qtfm.cn/live/20211321/64k.mp3" },
  { n: "仙桃人民广播电台", u: "https://lhttp.qtfm.cn/live/20211562/64k.mp3" },
  { n: "玉溪交通旅游广播FM87.7", u: "https://lhttp.qtfm.cn/live/20211563/64k.mp3" },
  { n: "辉南综合广播", u: "https://lhttp.qtfm.cn/live/20211566/64k.mp3" },
  { n: "经典983电台", u: "https://lhttp.qtfm.cn/live/20211575/64k.mp3" },
  { n: "东营生活广播", u: "https://lhttp.qtfm.cn/live/20211580/64k.mp3" },
  { n: "通州人民广播电台", u: "https://lhttp.qtfm.cn/live/20211586/64k.mp3" },
  { n: "双流FM1009空港之声", u: "https://lhttp.qtfm.cn/live/20211587/64k.mp3" },
  { n: "淄川1055广播", u: "https://lhttp.qtfm.cn/live/20211598/64k.mp3" },
  { n: "新兴电台", u: "https://lhttp.qtfm.cn/live/20211602/64k.mp3" },
  { n: "林州广播电台", u: "https://lhttp.qtfm.cn/live/20211604/64k.mp3" },
  { n: "铜仁新闻综合广播", u: "https://lhttp.qtfm.cn/live/20211615/64k.mp3" },
  { n: "1079音乐有话说", u: "https://lhttp.qtfm.cn/live/20211619/64k.mp3" },
  { n: "苏州戏曲广播", u: "https://lhttp.qtfm.cn/live/20211622/64k.mp3" },
  { n: "徐州广播FM105", u: "https://lhttp.qtfm.cn/live/20211623/64k.mp3" },
  { n: "邢台综合广播", u: "https://lhttp.qtfm.cn/live/20211628/64k.mp3" },
  { n: "FM96.7", u: "https://lhttp.qtfm.cn/live/20211632/64k.mp3" },
  { n: "吴川人民广播电台", u: "https://lhttp.qtfm.cn/live/20211643/64k.mp3" },
  { n: "胶州875", u: "https://lhttp.qtfm.cn/live/20211644/64k.mp3" },
  { n: "淮北综合广播", u: "https://lhttp.qtfm.cn/live/20211648/64k.mp3" },
  { n: "阳泉最爱音乐台", u: "https://lhttp.qtfm.cn/live/20211652/64k.mp3" },
  { n: "吉林市音乐广播", u: "https://lhttp.qtfm.cn/live/20211679/64k.mp3" },
  { n: "经典流行音乐动感904", u: "https://lhttp.qtfm.cn/live/20211680/64k.mp3" },
  { n: "成都年代音乐怀旧好声音", u: "https://lhttp.qtfm.cn/live/20211686/64k.mp3" },
  { n: "大同经济文艺广播", u: "https://lhttp.qtfm.cn/live/20211689/64k.mp3" },
  { n: "大同广播电视台新闻综合广播", u: "https://lhttp.qtfm.cn/live/20211690/64k.mp3" },
  { n: "重庆嘉陵之声FM88.7", u: "https://lhttp.qtfm.cn/live/20211692/64k.mp3" },
  { n: "芒果5G（原和鸣）", u: "https://lhttp.qtfm.cn/live/20211693/64k.mp3" },
  { n: "太原老年之声广播", u: "https://lhttp.qtfm.cn/live/20211701/64k.mp3" },
  { n: "增城电台FM89.0", u: "https://lhttp.qtfm.cn/live/20211702/64k.mp3" },
  { n: "第二师融媒体中心综合广播FM88.5", u: "https://lhttp.qtfm.cn/live/20211703/64k.mp3" },
  { n: "西昌人民广播电台", u: "https://lhttp.qtfm.cn/live/20211706/64k.mp3" },
  { n: "大丰FM95.1", u: "https://lhttp.qtfm.cn/live/20211708/64k.mp3" },
  { n: "伊犁汉语综合广播", u: "https://lhttp.qtfm.cn/live/20211711/64k.mp3" },
  { n: "青春调频 FM105.4", u: "https://lhttp.qtfm.cn/live/20212203/64k.mp3" },
  { n: "临淄人民广播电台", u: "https://lhttp.qtfm.cn/live/20212204/64k.mp3" },
  { n: "九江文化旅游广播", u: "https://lhttp.qtfm.cn/live/20212210/64k.mp3" },
  { n: "FM92.4安丘924", u: "https://lhttp.qtfm.cn/live/20212216/64k.mp3" },
  { n: "经典FM1008", u: "https://lhttp.qtfm.cn/live/20212227/64k.mp3" },
  { n: "定西交通广播", u: "https://lhttp.qtfm.cn/live/20212230/64k.mp3" },
  { n: "冰城融媒体电台", u: "https://lhttp.qtfm.cn/live/20212259/64k.mp3" },
  { n: "经典音乐 FM90.5", u: "https://lhttp.qtfm.cn/live/20212269/64k.mp3" },
  { n: "菏泽新闻广播", u: "https://lhttp.qtfm.cn/live/20212293/64k.mp3" },
  { n: "菏泽交通广播", u: "https://lhttp.qtfm.cn/live/20212294/64k.mp3" },
  { n: "中国交通网络应急广播", u: "https://lhttp.qtfm.cn/live/20212320/64k.mp3" },
  { n: "合肥新闻综合广播", u: "https://lhttp.qtfm.cn/live/20212380/64k.mp3" },
  { n: "公主岭交通之声", u: "https://lhttp.qtfm.cn/live/20212386/64k.mp3" },
  { n: "麻辣966", u: "https://lhttp.qtfm.cn/live/20212393/64k.mp3" },
  { n: "正阳综合广播", u: "https://lhttp.qtfm.cn/live/20212397/64k.mp3" },
  { n: "FM97.4广汉市广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20212405/64k.mp3" },
  { n: "魏县鸭梨音乐广播", u: "https://lhttp.qtfm.cn/live/20212412/64k.mp3" },
  { n: "普兰店FM90.8", u: "https://lhttp.qtfm.cn/live/20212414/64k.mp3" },
  { n: "高密955", u: "https://lhttp.qtfm.cn/live/20212417/64k.mp3" },
  { n: "亳州交通音乐广播", u: "https://lhttp.qtfm.cn/live/20212419/64k.mp3" },
  { n: "新昌人民广播电台", u: "https://lhttp.qtfm.cn/live/20212423/64k.mp3" },
  { n: "库尔勒1053梨城之声", u: "https://lhttp.qtfm.cn/live/20212425/64k.mp3" },
  { n: "崂山921", u: "https://lhttp.qtfm.cn/live/20212426/64k.mp3" },
  { n: "番禺电台畅快1017", u: "https://lhttp.qtfm.cn/live/20212427/64k.mp3" },
  { n: "普洱市广播电视台交通广播", u: "https://lhttp.qtfm.cn/live/20212429/64k.mp3" },
  { n: "靖州综合广播", u: "https://lhttp.qtfm.cn/live/20500011/64k.mp3" },
  { n: "阆中人民广播电台", u: "https://lhttp.qtfm.cn/live/20500020/64k.mp3" },
  { n: "晋小爱公益之声", u: "https://lhttp.qtfm.cn/live/20500021/64k.mp3" },
  { n: "光山90.1", u: "https://lhttp.qtfm.cn/live/20500029/64k.mp3" },
  { n: "塔城人民广播电台汉语综合广播", u: "https://lhttp.qtfm.cn/live/20500031/64k.mp3" },
  { n: "临朐广播电视台FM102.3", u: "https://lhttp.qtfm.cn/live/20500033/64k.mp3" },
  { n: "彬州之声", u: "https://lhttp.qtfm.cn/live/20500035/64k.mp3" },
  { n: "广饶人民广播电台FM103.9", u: "https://lhttp.qtfm.cn/live/20500036/64k.mp3" },
  { n: "织金人民广播电台综合广播", u: "https://lhttp.qtfm.cn/live/20500037/64k.mp3" },
  { n: "卷卷猫电台", u: "https://lhttp.qtfm.cn/live/20500038/64k.mp3" },
  { n: "颍上FM962", u: "https://lhttp.qtfm.cn/live/20500039/64k.mp3" },
  { n: "阿克苏市1029", u: "https://lhttp.qtfm.cn/live/20500041/64k.mp3" },
  { n: "大兴安岭综合广播", u: "https://lhttp.qtfm.cn/live/20500057/64k.mp3" },
  { n: "邵阳经济广播", u: "https://lhttp.qtfm.cn/live/20500058/64k.mp3" },
  { n: "大庆交通广播", u: "https://lhttp.qtfm.cn/live/20500061/64k.mp3" },
  { n: "年代音乐1022", u: "https://lhttp.qtfm.cn/live/20500066/64k.mp3" },
  { n: "兴仁人民广播电台", u: "https://lhttp.qtfm.cn/live/20500077/64k.mp3" },
  { n: "金乡之声", u: "https://lhttp.qtfm.cn/live/20500085/64k.mp3" },
  { n: "桃江人民广播电台", u: "https://lhttp.qtfm.cn/live/20500086/64k.mp3" },
  { n: "鸡西交通广播", u: "https://lhttp.qtfm.cn/live/20500087/64k.mp3" },
  { n: "茂名综合广播", u: "https://lhttp.qtfm.cn/live/20500088/64k.mp3" },
  { n: "鸡西综合广播", u: "https://lhttp.qtfm.cn/live/20500089/64k.mp3" },
  { n: "瓦房店广播电视台新闻综合广播", u: "https://lhttp.qtfm.cn/live/20500094/64k.mp3" },
  { n: "兵团七师综合广播", u: "https://lhttp.qtfm.cn/live/20500095/64k.mp3" },
  { n: "经典音乐广播FM94.8", u: "https://lhttp.qtfm.cn/live/20500097/64k.mp3" },
  { n: "威远综合广播", u: "https://lhttp.qtfm.cn/live/20500102/64k.mp3" },
  { n: "兴义之声", u: "https://lhttp.qtfm.cn/live/20500110/64k.mp3" },
  { n: "河北综合广播", u: "https://lhttp.qtfm.cn/live/20500111/64k.mp3" },
  { n: "梅河口人民广播电台城市之声", u: "https://lhttp.qtfm.cn/live/20500115/64k.mp3" },
  { n: "黑山人民广播电台", u: "https://lhttp.qtfm.cn/live/20500119/64k.mp3" },
  { n: "通化交通文艺广播", u: "https://lhttp.qtfm.cn/live/20500120/64k.mp3" },
  { n: "奎屯市融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20500121/64k.mp3" },
  { n: "东源广播电台", u: "https://lhttp.qtfm.cn/live/20500124/64k.mp3" },
  { n: "昆山人民广播电台", u: "https://lhttp.qtfm.cn/live/20500128/64k.mp3" },
  { n: "FM99.2岳阳县综合广播", u: "https://lhttp.qtfm.cn/live/20500129/64k.mp3" },
  { n: "周村区广播电视台", u: "https://lhttp.qtfm.cn/live/20500132/64k.mp3" },
  { n: "南乐融媒广播", u: "https://lhttp.qtfm.cn/live/20500136/64k.mp3" },
  { n: "汽车音乐广播FM942", u: "https://lhttp.qtfm.cn/live/20500137/64k.mp3" },
  { n: "利津广播电视台FM106.2", u: "https://lhttp.qtfm.cn/live/20500138/64k.mp3" },
  { n: "中国华艺广播公司", u: "https://lhttp.qtfm.cn/live/20500139/64k.mp3" },
  { n: "乐享1007", u: "https://lhttp.qtfm.cn/live/20500141/64k.mp3" },
  { n: "新密人民广播电台", u: "https://lhttp.qtfm.cn/live/20500144/64k.mp3" },
  { n: "塔城市广播电视台FM104.2", u: "https://lhttp.qtfm.cn/live/20500145/64k.mp3" },
  { n: "两广之声音乐台", u: "https://lhttp.qtfm.cn/live/20500149/64k.mp3" },
  { n: "CityFM城市音乐台", u: "https://lhttp.qtfm.cn/live/20500153/64k.mp3" },
  { n: "伊通人民广播电台", u: "https://lhttp.qtfm.cn/live/20500154/64k.mp3" },
  { n: "鱼佬音乐坊", u: "https://lhttp.qtfm.cn/live/20500158/64k.mp3" },
  { n: "成都FM96.5", u: "https://lhttp.qtfm.cn/live/20500159/64k.mp3" },
  { n: "年代音乐FM88.9", u: "https://lhttp.qtfm.cn/live/20500160/64k.mp3" },
  { n: "Radio Impetus 心动电台", u: "https://lhttp.qtfm.cn/live/20500161/64k.mp3" },
  { n: "泊头人民广播电台", u: "https://lhttp.qtfm.cn/live/20500164/64k.mp3" },
  { n: "新闻听天下", u: "https://lhttp.qtfm.cn/live/20500169/64k.mp3" },
  { n: "海上财经", u: "https://lhttp.qtfm.cn/live/20500170/64k.mp3" },
  { n: "体坛速听", u: "https://lhttp.qtfm.cn/live/20500171/64k.mp3" },
  { n: "科技情报站", u: "https://lhttp.qtfm.cn/live/20500175/64k.mp3" },
  { n: "听·越剧", u: "https://lhttp.qtfm.cn/live/20500178/64k.mp3" },
  { n: "海浪电台", u: "https://lhttp.qtfm.cn/live/20500180/64k.mp3" },
  { n: "古典音乐厅", u: "https://lhttp.qtfm.cn/live/20500181/64k.mp3" },
  { n: "肃宁融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20500183/64k.mp3" },
  { n: "萧山人民广播电台", u: "https://lhttp.qtfm.cn/live/20500184/64k.mp3" },
  { n: "云梦音乐台", u: "https://lhttp.qtfm.cn/live/20500187/64k.mp3" },
  { n: "呼图壁人民广播电台", u: "https://lhttp.qtfm.cn/live/20500188/64k.mp3" },
  { n: "睢宁县融媒体中心综合广播 FM93.1", u: "https://lhttp.qtfm.cn/live/20500191/64k.mp3" },
  { n: "FM963景县融媒综合广播", u: "https://lhttp.qtfm.cn/live/20500192/64k.mp3" },
  { n: "FM928历城音乐广播", u: "https://lhttp.qtfm.cn/live/20500194/64k.mp3" },
  { n: "年代995", u: "https://lhttp.qtfm.cn/live/20500202/64k.mp3" },
  { n: "汤阴融媒综合广播", u: "https://lhttp.qtfm.cn/live/20500205/64k.mp3" },
  { n: "蓬安综合广播", u: "https://lhttp.qtfm.cn/live/20500206/64k.mp3" },
  { n: "AsiaFM 亚洲热歌台", u: "https://lhttp.qtfm.cn/live/20500208/64k.mp3" },
  { n: "FM96.0 阿拉尔人民广播电台新闻综合广播", u: "https://lhttp.qtfm.cn/live/20500209/64k.mp3" },
  { n: "禹州广播电视台 FM93.4", u: "https://lhttp.qtfm.cn/live/20500210/64k.mp3" },
  { n: "大庆音乐广播", u: "https://lhttp.qtfm.cn/live/20500212/64k.mp3" },
  { n: "肇庆高新区广播", u: "https://lhttp.qtfm.cn/live/20500213/64k.mp3" },
  { n: "兴宁市融媒体中心综合广播", u: "https://lhttp.qtfm.cn/live/20500218/64k.mp3" },
  { n: "新声905", u: "https://lhttp.qtfm.cn/live/20500221/64k.mp3" },
  { n: "经典913", u: "https://lhttp.qtfm.cn/live/20500222/64k.mp3" },
  { n: "FM107.9", u: "https://lhttp.qtfm.cn/live/20500225/64k.mp3" },
  { n: "抚州新闻综合广播", u: "https://lhttp.qtfm.cn/live/20500226/64k.mp3" },
  { n: "榆树广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20500231/64k.mp3" },
  { n: "健康电台", u: "https://lhttp.qtfm.cn/live/20500232/64k.mp3" },
  { n: "Live Radio海口生活广播", u: "https://lhttp.qtfm.cn/live/20500233/64k.mp3" },
  { n: "万宁综合广播", u: "https://lhttp.qtfm.cn/live/20500237/64k.mp3" },
  { n: "深州综合频率FM106.9", u: "https://lhttp.qtfm.cn/live/20500238/64k.mp3" },
  { n: "FM93.7 濉溪县广播电视台综合广播", u: "https://lhttp.qtfm.cn/live/20500240/64k.mp3" },
  { n: "新野融媒", u: "https://lhttp.qtfm.cn/live/20500242/64k.mp3" },
  { n: "凤凰卫视资讯台", u: "http://playtv-live.ifeng.com/live/06OLEEWQKN4_audio.m3u8" },
  { n: "凤凰卫视资讯台", u: "http://playtv-live.ifeng.com/live/06OLEEWQKN4_audio.m3u8" },
  { n: "CNR-1 中国之声", u: "https://lhttp.qtfm.cn/live/15318317/64k.mp3" },
  { n: "CNR-2 经济之声", u: "http://ngcdn002.cnr.cn/live/jjzs/index.m3u8" },
  { n: "500首华语经典", u: "https://lhttp.qtfm.cn/live/5022308/64k.mp3" },
  { n: "臺北電台", u: "https://stream.ginnet.cloud/live0130lo-yfyo/_definst_/fm/playlist.m3u8" },
  { n: "Classical 古典音樂台 FM 97.7", u: "http://59.120.88.155:8000/live.mp3" },
  { n: "CRI中文环球广播·CRI chinese service", u: "http://sk.cri.cn/hyhq.m3u8" },
  { n: "CCTV-4中文国际伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv4_2.m3u8" },
  { n: "雨声轻音乐", u: "https://stream.zeno.fm/689zc32y4x8uv" },
  { n: "德云社相声合集", u: "https://stream.zeno.fm/yqawwmweq8mtv" },
  { n: "天籁之音 - 经典正流行", u: "http://play-radio-stream3.hndt.com/now/WUBA5hW2/chunklist.m3u8" },
  { n: "AisaFM亚洲粤语台", u: "https://live.ximalaya.com/radio-first-page-app/live/999/64.m3u8?transcode=ts" },
  { n: "新闻联播", u: "https://rfienchinois64k.ice.infomaniak.ch//rfienchinois-64.mp3" },
  { n: "CCTV-2财经伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv2_2.m3u8" },
  { n: "安徽小说评书广播", u: "https://lhttp.qtfm.cn/live/1951/64k.mp3" },
  { n: "怀旧音乐广播", u: "https://live.ximalaya.com/radio-first-page-app/live/2629/64.m3u8" },
  { n: "BBN 中文", u: "https://streams.radiomast.io/ce298b32-8776-4192-9900-092f44b63e7f" },
  { n: "CCTV-15音乐伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv15_2.m3u8" },
  { n: "臺北電台AM", u: "https://stream.ginnet.cloud/live0130lo-yfyo/_definst_/am/playlist.m3u8" },
  { n: "美国中文电台-旧金山", u: "http://radiokest.serverroom.us:6670/;?type=http&nocache=3295" },
  { n: "星岛中文电台国语广播", u: "http://nap.casthost.net:8759/;?icy=http" },
  { n: "正聲廣播電台FM104", u: "https://flv.ccdntech.com/live/_definst_/mp4:vod117_Live/live1/chunklist_w872521607.m3u8" },
  { n: "CCTV-8电视剧伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv8_2.m3u8" },
  { n: "深圳新闻广播", u: "http://lhttp.qingting.fm/live/1270/64k.mp3" },
  { n: "美国中文电台-西雅图", u: "http://kxparadio.serverroom.us:5852/stream.mp3" },
  { n: "CCTV-5体育伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv5_2.m3u8" },
  { n: "CCTV-12社会与法伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv12_2.m3u8" },
  { n: "香港普通话台", u: "https://rthkradiopth-live.akamaized.net/hls/live/2040082/radiopth/master.m3u8" },
  { n: "天籁之音 - Hi-Fi Radio", u: "http://play-radio-stream3.hndt.com/now/JxkyN5mR/chunklist.m3u8" },
  { n: "城市廣播網•台南知音", u: "http://fm971.cityfm.tw:8080/971.mp3" },
  { n: "广东股市广播", u: "https://lhttp.qtfm.cn/live/4847/64k.mp3" },
  { n: "CCTV-4中文国际美洲伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctvamerica_2.m3u8" },
  { n: "正聲廣播公司", u: "https://flv.ccdntech.com/live/_definst_/mp4:vod117_Live/live1/playlist.m3u8" },
  { n: "CCTV-3综艺伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv3_2.m3u8" },
  { n: "CCTV-10科教伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv10_2.m3u8" },
  { n: "AsiaFM HD音樂臺", u: "http://asiafm.hk:8000/asiahd" },
  { n: "CNR-3 音乐之声", u: "https://ngcdn001.cnr.cn/live/yyzs/index.m3u8" },
  { n: "CRI劲曲调频 HIT FM（成都）", u: "http://lhttp.qingting.fm/live/15318703/64k.mp3" },
  { n: "环球资讯", u: "http://sk.cri.cn/905.m3u8" },
  { n: "Anison动漫音乐台", u: "http://pool.anison.fm:9000/AniSonFM(320)?" },
  { n: "全澳华语广播华厦之声", u: "http://46.4.40.246:8059/stream" },
  { n: "台北流行音樂廣播", u: "http://202.39.43.67:1935/live/RA000080/chunklist.m3u8" },
  { n: "台北古典廣播", u: "https://stream.zeno.fm/w66d3dp6ynhvv" },
  { n: "格莱美音乐台", u: "http://play-radio-stream3.hndt.com/now/yorSd1X2/chunklist.m3u8" },
  { n: "CCTV-5+体育赛事伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv5plus_2.m3u8" },
  { n: "天籁之音 - 国风", u: "http://play-radio-stream3.hndt.com/now/UzPxbRaT/chunklist.m3u8" },
  { n: "佳音經典音樂網", u: "https://stream.ginnet.cloud/live0119lo-p4rb/_definst_/classic/playlist.m3u8" },
  { n: "美国之音", u: "https://stream.zeno.fm/u87dfeeyk2zuv" },
  { n: "Music of China 中国音乐", u: "https://vip.wongsong.cn/proxy/wongsong/stream-mp3-WongSong" },
  { n: "东方卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/dongfang_2.m3u8" },
  { n: "北京BTV新闻伴音", u: "https://wstvcpudali.v.myalicdn.com/wstvcpud/udrmbtv9_1/index.m3u8?adapt=0&BR=audio" },
  { n: "广州新闻资讯广播", u: "http://lhttp.qingting.fm/live/4848/64k.mp3" },
  { n: "CCTV-4中文国际欧洲伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctveurope_2.m3u8" },
  { n: "CCTV-11戏曲伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv11_2.m3u8" },
  { n: "新西兰中文广播电台 FM90.6 Radio Chinese", u: "https://s26.myradiostream.com:20274/listen.mp3" },
  { n: "CMG环球资讯广播", u: "https://sk.cri.cn/905.m3u8" },
  { n: "中廣新聞網", u: "https://n03.rcs.revma.com/78fm9wyy2tzuv" },
  { n: "塞浦路斯中文广播", u: "https://cdn.istoikona.com/ccnradio/ccnradio/icecast.audio" },
  { n: "佳音電台", u: "https://stream.ginnet.cloud/live0119lo-p4rb/_definst_/fm909/playlist.m3u8" },
  { n: "自由亚洲", u: "https://stream-283.surfernetwork.com/ub3pfplpqbktv?zt=eyJhbGciOiJIUzI1NiJ9.eyJzdHJlYW0iOiJ1YjNwZnBscHFia3R2IiwiaG9zdCI6InN0cmVhbS0yODMuc3VyZmVybmV0d29yay5jb20iLCJ0bSI6ZmFsc2UsInJ0dGwiOjUsImp0aSI6IkdMemVxdUpNUkppQkxXbWtQdjl0S1EiLCJpYXQiOjE3OTM0OTQ0NTksImV4cCI6MTc5MzQ5NDUxOX0.z8x-0gpimRdqZOMgtNdU6uELjHsMpTr1tJwwh8HEuDU" },
  { n: "MY FM全国音乐频道·广州", u: "http://lhttp.qingting.fm/live/20194/64k.mp3" },
  { n: "河南戏曲广播", u: "https://stream.hndt.com/live/yule/playlist.m3u8" },
  { n: "民本電台-2", u: "https://streamak0134.akamaized.net/live0134lh-5gst/_definst_/am855/chunklist.m3u8" },
  { n: "Fred Film Radio(中文)", u: "https://s10.webradio-hosting.com/proxy/fredradiocn/stream" },
  { n: "警察廣播電台 - 台北台", u: "http://stream.pbs.gov.tw:1935/live/TPS/playlist.m3u8" },
  { n: "郑州人民广播电台 新闻广播", u: "http://lhttp.qingting.fm/live/1220/64k.mp3" },
  { n: "漢聲調頻", u: "http://202.39.43.67:1935/live/RA000076/chunklist.m3u8" },
  { n: "CCTV农业节目伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv17_2.m3u8" },
  { n: "台中城市廣播", u: "http://fm901.cityfm.tw:8080/901.mp3" },
  { n: "Big B Radio亚洲音乐台", u: "https://antares.dribbcast.com/proxy/apop?mp=/s" },
  { n: "CRI世界华声", u: "http://sk.cri.cn/hxfh.m3u8" },
  { n: "华夏之声China FM·西班牙马德里FM92.9", u: "https://radioserver12.profesionalhosting.com/proxy/pkg152387/stream" },
  { n: "第一财经电视伴音", u: "http://a1live.livecdn.yicai.com/live/radio_tv.m3u8" },
  { n: "WKDM 纽约华语广播国语台", u: "https://video1.getstreamhosting.com:8292/stream?.mp3" },
  { n: "牽手之聲網路台", u: "http://us3.internet-radio.com:8232/stream" },
  { n: "民本電台-1", u: "https://streamak0134.akamaized.net/live0134lh-5gst/_definst_/am1296/chunklist.m3u8" },
  { n: "深圳音乐广播", u: "https://lhttp.qtfm.cn/live/1271/64k.mp3" },
  { n: "北京古典音乐广播", u: "https://stream.zeno.fm/qa9punk6ynhvv" },
  { n: "REPLAY NEWS - 中文 每5分钟播报一次新闻的电台", u: "https://replaynewszh.ice.infomaniak.ch/replaynewszh-128.mp3" },
  { n: "人人電台 好事聯播網FM98.9", u: "http://202.39.43.67:1935/live/RA000013/chunklist.m3u8" },
  { n: "上海音乐广播", u: "http://lhttp.qingting.fm/live/273/64k.mp3" },
  { n: "广东南粤之声", u: "https://lhttp.qtfm.cn/live/470/64k.mp3" },
  { n: "北京卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/btv1_2.m3u8" },
  { n: "桃園GO GO104.3", u: "https://stream.ginnet.cloud/live0119lo-p4rb/_definst_/fm1043/chunklist_w1108784103.m3u8" },
  { n: "CCTV-少儿伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv14_2.m3u8" },
  { n: "心灵音乐馆", u: "http://stream3.hndt.com/now/AFqvb0VX/playlist.m3u8" },
  { n: "九八新聞台", u: "https://n17a-eu.rcs.revma.com/pntx1639ntzuv" },
  { n: "大自然的声音", u: "https://stream.zeno.fm/5wtp1dkamdluv" },
  { n: "警察廣播電台 - 全國治安交通網", u: "http://stream.pbs.gov.tw:1935/live/mp3:PBS/playlist.m3u8" },
  { n: "辽宁卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/liaoning_2.m3u8" },
  { n: "好事聯播網 高雄港都", u: "http://202.39.43.67:1935/live/RA000012/chunklist.m3u8" },
  { n: "夜愿电台Nightwish Radio", u: "https://stream.zeno.fm/98wt67yfky8uv" },
  { n: "CCTV奥林匹克伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv16_2.m3u8" },
  { n: "一个个人私用的歌单", u: "https://stream.zeno.fm/rzsc1h2izunuv" },
  { n: "CCTV-1综合伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8" },
  { n: "民谣·蓝调", u: "http://stream3.hndt.com/now/XWfN89gh/playlist.m3u8" },
  { n: "和谐铁路之声", u: "https://stream.zeno.fm/gzsk9r47sc9uv" },
  { n: "蒙古之声", u: "https://api.xmgspace.me/api/vom-latest/" },
  { n: "华夏之声China FM·意大利罗马FM89.5", u: "https://radioserver12.profesionalhosting.com/proxy/pkg152492/stream" },
  { n: "人间卫视", u: "https://5ddce30eb4b55.streamlock.net/bltvhd/bltv1/chunklist_w511254805.m3u8" },
  { n: "KVTO AM1400 FM93.7 旧金山湾区中文电台", u: "https://us2.maindigitalstream.com/ssl/KVTO" },
  { n: "Needs Radio 全球華語廣播網", u: "https://cdn280.ccdntech.com/live-http/_definst_/vod280_Live/needs/chunklist.m3u8" },
  { n: "休息音乐🎶", u: "https://az1.mediacp.eu/listen/airport-lounge-radio/radio.mp3" },
  { n: "合肥故事广播", u: "http://lhttp.qingting.fm/live/1961/64k.mp3" },
  { n: "第一财经（一财官网线路）", u: "https://a1live.livecdn.yicai.com/live/yicai_radio.m3u8" },
  { n: "台海之聲", u: "https://satellitepull.cnr.cn/live/wxzhzs/playlist.m3u8?wsSession=c650605f64c6488d38b66982-174761774475052&wsIPSercert=270c8446fe14303f2433a2f164ccd9e5" },
  { n: "苏州都市音乐广播", u: "http://lhttp.qingting.fm/live/2803/64k.mp3" },
  { n: "恐怖在線（周一至周五23:11）", u: "https://acast01.kolorboxlab.com/radio/8010/radio.mp3" },
  { n: "经济之声", u: "https://ngcdn002.cnr.cn/live/jjzs/index.m3u8" },
  { n: "鹤山人民广播电台", u: "http://ls.qingting.fm/live/1286.m3u8" },
  { n: "漢聲中波", u: "http://202.39.43.67:1935/live/RA000074/chunklist.m3u8" },
  { n: "四川音乐广播", u: "https://lhttp.qtfm.cn/live/1110/64k.mp3" },
  { n: "BTV生活伴音", u: "https://wstvcpudali.v.myalicdn.com/wstvcpud/udrmbtv7_1/index.m3u8?adapt=0&BR=audio" },
  { n: "广州经济交通广播", u: "http://lhttp.qingting.fm/live/4955/64k.mp3" },
  { n: "复兴电台（测试）", u: "http://202.39.43.67:1935/live/RA000024/chunklist.m3u8" },
  { n: "ZENO FM 良友同行频道", u: "https://stream.zeno.fm/2uvcyzjw38ivv" },
  { n: "BTV文艺伴音", u: "https://wstvcpudali.v.myalicdn.com/wstvcpud/udrmbtv2_1/index.m3u8?adapt=0&BR=audio" },
  { n: "V家电台·Vocaloid Radio", u: "http://curiosity.shoutca.st:8019/stream" },
  { n: "广州市番禺区广播电台", u: "https://lhttp.qtfm.cn/live/20212427/64k.mp3" },
  { n: "安徽卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/anhui_2.m3u8" },
  { n: "Russian Chinese Music Radio 俄中音乐台", u: "https://stream.zeno.fm/txtltqtgns3vv" },
  { n: "KBS韩国国际广播电台", u: "https://api.xmgspace.me/api/kbs-stream/" },
  { n: "加拿大中文电台FM94.7", u: "https://5b2959fe11444.streamlock.net/radio/fm947.stream/playlist.m3u8" },
  { n: "山东交通广播", u: "http://audiolive302.iqilu.com/sdradioJiaotong/sdradio05/playlist.m3u8" },
  { n: "BTV财经伴音", u: "https://wstvcpudali.v.myalicdn.com/wstvcpud/udrmbtv5_1/index.m3u8?adapt=0&BR=audio" },
  { n: "大富ラジオ", u: "https://stream.zeno.fm/oaxp6mswcqltv" },
  { n: "CNR-9 文艺之声", u: "http://satellitepull.cnr.cn/live/wxwyzs/playlist.m3u8?wsSession=d8b4488aebb72eb396f72a83-174705706427289&wsIPSercert=29f90b67755e3a4646651f7aa8eb5fd6" },
  { n: "中廣音樂網", u: "https://n03.rcs.revma.com/ndk05tyy2tzuv" },
  { n: "山东卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/shandong_2.m3u8" },
  { n: "河南交通广播", u: "https://stream.hndt.com/live/jiaotong/playlist.m3u8" },
  { n: "河南网络经典FM", u: "http://stream3.hndt.com/now/C5NvUpwy/playlist.m3u8" },
  { n: "BTV科教伴音", u: "https://wstvcpudali.v.myalicdn.com/wstvcpud/udrmbtv3_1/index.m3u8?adapt=0&BR=audio" },
  { n: "天津卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/tianjin_2.m3u8" },
  { n: "Eight无限 FM", u: "https://stream.rcs.revma.com/qp0xrd9mtd3vv" },
  { n: "河南音乐广播", u: "https://stream.hndt.com/live/yinyue/playlist.m3u8" },
  { n: "辽宁经典流行音乐广播", u: "http://lhttp.qingting.fm/live/20021/64k.mp3" },
  { n: "上海浦东FM100.1新娱乐广播", u: "http://lhttp.qingting.fm/live/5022341/64k.mp3" },
  { n: "中廣流行網", u: "https://n03.rcs.revma.com/aw9uqyxy2tzuv" },
  { n: "生命之光广播电台", u: "https://stream.radiojar.com/z3ctv2zxm2zuv.m4a" },
  { n: "衡水交通评书广播", u: "https://lhttp.qtfm.cn/live/5021940/64k.mp3" },
  { n: "中国宣泄情感摇滚", u: "https://stream.zeno.fm/epio7gie1y7uv" },
  { n: "四川卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/sichuan_2.m3u8" },
  { n: "华藏净宗弘化网净空老法师", u: "https://vod.amtb.de/liveedge/_definst_/smil:livetv.smil/chunklist_b828000.m3u8" },
  { n: "幻想乡电台Gensokyo Radio", u: "https://stream.gensokyoradio.net/3" },
  { n: "CNR-10 老年之声", u: "http://satellitepull.cnr.cn/live/wxlnzs/playlist.m3u8?wsSession=b560e2b8d5c24aef0be2a5c7-174709253203252&wsIPSercert=29f90b67755e3a4646651f7aa8eb5fd6" },
  { n: "白猿道广播电台", u: "https://stream.zeno.fm/5uyxq85zm7zuv" },
  { n: "CCTV-6电影频道伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv6_2.m3u8" },
  { n: "湖北卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/hubei_2.m3u8" },
  { n: "湖南金鹰之声", u: "http://a.live.hnradio.com/jypd/radio120k_jypd.m3u8?auth_key=1588751199-0-0-e412c6c15ca2bf1ad6f0833c2bd73bb2" },
  { n: "河北经济广播（故事广播）", u: "https://radio.pull.hebtv.com/live/hebjj.m3u8" },
  { n: "塞浦路斯CCN欧洲中国平台", u: "https://cdn.istoikona.com/ccnrtv/live/playlist.m3u8" },
  { n: "警察廣播電臺 - 全國治安交通網 FM 104.9", u: "https://stream.pbs.gov.tw/live/PBS/playlist.m3u8" },
  { n: "警察廣播電台 - 台中台", u: "http://stream.pbs.gov.tw:1935/live/TCS/playlist.m3u8" },
  { n: "安丘924(FM92.4)", u: "http://lhttp.qingting.fm/live/20212216/64k.mp3" },
  { n: "深圳音樂廣播", u: "http://ls.qingting.fm/live/1271.m3u8" },
  { n: "深圳综艺广播", u: "http://lhttp.qingting.fm/live/1271/64k.mp3" },
  { n: "海峽之聲廣播電台", u: "http://ls.qingting.fm/live/1744.m3u8" },
  { n: "沧州长书文艺广播", u: "https://lhttp.qingting.fm/live/5021902/64k.mp3" },
  { n: "河北汽车音乐台", u: "https://radio.pull.hebtv.com/live/hebqcyy.m3u8" },
  { n: "世新廣播電台-1", u: "https://stream.ginnet.cloud/live0115lo-89xv/_definst_/fm881/playlist.m3u8" },
  { n: "CETV-1伴音", u: "https://piccpndali.v.myalicdn.com/audio/cetv1_2.m3u8" },
  { n: "中国药科大学广播电台", u: "https://stream.zeno.fm/fk6yq08hx38uv" },
  { n: "华藏净宗弘化网多元文化台", u: "https://js1.amtb.cn/liveedge/_definst_/education/playlist.m3u8" },
  { n: "他她说：EP.3 读本书吧《百岁人生》", u: "https://media.xyzcdn.net/nnkLT7Qx1QNOjB362KOst5vwjYzl.mp3" },
  { n: "湖南音乐之声", u: "http://a.live.hnradio.com/yypd/radio120k_yypd.m3u8?auth_key=1588751172-0-0-d97b858279c1c86650172b9913ea4af2" },
  { n: "河南天籁之音", u: "http://stream.hndt.com/live/gudian/playlist.m3u8" },
  { n: "河南新闻广播", u: "https://stream.hndt.com/live/xinwen/playlist.m3u8" },
  { n: "深圳龙岗频道", u: "http://lhttp.qingting.fm/live/20160/64k.mp3" },
  { n: "华藏净宗弘化网悟道法师", u: "https://js1.amtb.cn/liveedge/_definst_/wdmaster/chunklist.m3u8" },
  { n: "中國華藝廣播公司 AM873", u: "https://lhttp.qtfm.cn/live/20500139/64k.mp3" },
  { n: "Fred Film Radio - 普通话", u: "https://s10.webradio-hosting.com/proxy/fredradiocn/stream/;" },
  { n: "天津静海区广播电台", u: "http://lhttp.qingting.fm/live/20212227/64k.mp3" },
  { n: "成都潮台", u: "https://live.ximalaya.com/radio-first-page-app/live/2781/64.m3u8" },
  { n: "新竹好聽廣播電台", u: "http://202.39.43.67:1935/live/RA000124/chunklist.m3u8" },
  { n: "CNR-15 中国交通广播", u: "https://ngcdn002.cnr.cn/live/gsgljtgb/index.m3u8" },
  { n: "河北旅游广播Hopei Travel Radio", u: "http://ls.qingting.fm/live/1651.m3u8" },
  { n: "台灣廣播 台北一台", u: "http://test.taiwan-radio.tw:8000/TP.AM1323" },
  { n: "大连音乐广播", u: "http://lhttp.qingting.fm/live/1084/64k.mp3" },
  { n: "中国之声", u: "https://ngcdn001.cnr.cn/live/zgzs/index.m3u8" },
  { n: "CETV-2伴音", u: "https://piccpndali.v.myalicdn.com/audio/cetv2_2.m3u8" },
  { n: "有线新闻台", u: "http://cm61-10-2-143.hkcable.com.hk/live_freedirect/freehd209_h.live/playlist.m3u8" },
  { n: "华藏净宗弘化网网络念佛堂", u: "https://vod.amtb.de/liveedge/_definst_/smil:amtb.smil/chunklist_b828000.m3u8" },
  { n: "哈尔滨电视台 影视频道", u: "http://stream.hrbtv.net/yspd/playlist.m3u8" },
  { n: "哈尔滨电视台 新闻综合频道", u: "http://stream.hrbtv.net/xwzh/playlist.m3u8" },
  { n: "有线直播新闻台", u: "http://cm61-10-2-143.hkcable.com.hk/live_freedirect/hd110_h.live/playlist.m3u8" },
  { n: "CCTV-9纪录伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv9_2.m3u8" },
  { n: "圣大解脱经", u: "https://stream.zeno.fm/qu29gyku968uv" },
  { n: "Bridge Radio - 华语 HITS", u: "https://das-edge11-live365-dal03.cdnstream.com/a57743_2" },
  { n: "CETV-3伴音", u: "https://piccpndali.v.myalicdn.com/audio/cetv3_2.m3u8" },
  { n: "花都人民广播电台", u: "https://lhttp.qingting.fm/live/1263/64k.mp3" },
  { n: "青海卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/qinghai_2.m3u8" },
  { n: "飛碟聯播網 飛碟電台", u: "https://n10.rcs.revma.com/em90w4aeewzuv" },
  { n: "山东体育休闲广播（2）", u: "http://audiolive302.iqilu.com/sdradioTiyu/sdradio08/playlist.m3u8" },
  { n: "韩国音乐台", u: "https://stream.zeno.fm/r0tbse9jnbptv" },
  { n: "贵州卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/guizhou_2.m3u8" },
  { n: "舞迷心窍", u: "http://stream3.hndt.com/now/WBhgSD3A/playlist.m3u8" },
  { n: "廊坊交通长书广播", u: "http://lhttp.qingting.fm/live/3948/64k.mp3" },
  { n: "AsiaFM 亞洲電台", u: "https://n13.rcs.revma.com/xpgtqc74hv8uv" },
  { n: "全国党员干部现代远程教育", u: "https://12371wbndks.v.kcdnvip.com/12371wbnd/dangyuanwang_2/index.m3u8" },
  { n: "好事聯播網 蓮花電台", u: "http://202.39.43.67:1935/live/RA000011/chunklist.m3u8" },
  { n: "广西交通广播", u: "https://stream.bbrtv.com:10443/hls/scGbVLJGR/scGbVLJGR_live.m3u8" },
  { n: "珠海交通875·环保经济广播", u: "http://lhttp.qingting.fm/live/1275/64k.mp3" },
  { n: "广东珠江之声", u: "http://ls.qingting.fm/live/470.m3u8" },
  { n: "长沙品味音乐广播", u: "http://lhttp.qingting.fm/live/4930/64k.mp3" },
  { n: "CETV-4伴音", u: "https://piccpndali.v.myalicdn.com/audio/cetv4_2.m3u8" },
  { n: "测试3", u: "https://piccpndali.v.myalicdn.com/audio/xianggangweishi_2.m3u8" },
  { n: "CAS美国经典艺术展播", u: "https://classicarts.akamaized.net/hls/live/1024257/CAS/master_480p30.m3u8" },
  { n: "增城人民广播电台", u: "http://lhttp.qingting.fm/live/20211702/64k.mp3" },
  { n: "湖南卫视伴音", u: "http://satellitepull.cnr.cn/live/wx32hunws/playlist.m3u8?wsSession=5047841c34cc76f1a161d1fe-174718229204467&wsIPSercert=29f90b67755e3a4646651f7aa8eb5fd6" },
  { n: "辽宁都市广播", u: "https://lhttp.qtfm.cn/live/1099/64k.mp3?app" },
  { n: "CCTV-13 新闻（伴音）", u: "https://piccpndali.v.myalicdn.com/audio/cctv13_2.m3u8" },
  { n: "江苏金陵之声", u: "http://lzlive.vojs.cn/Hd2hIgM/92/live.m3u8?" },
  { n: "崂山921  听见好时光", u: "http://lhttp.qingting.fm/live/20212426/64k.mp3" },
  { n: "铜山县人民广播电台FM94.2", u: "http://lhttp.qingting.fm/live/15318160/64k.mp3" },
  { n: "新竹勞工之聲", u: "http://202.39.43.67:1935/live/RA000101/chunklist.m3u8" },
  { n: "河南网络广播·摇滚天空台", u: "http://stream3.hndt.com/now/SXJtR4M4/playlist.m3u8" },
  { n: "郑州人民广播电台 音乐广播", u: "http://lhttp.qingting.fm/live/4921/64k.mp3" },
  { n: "Heart FM冰城102.6·哈尔滨古典音乐广播", u: "https://stream.hrbtv.net/gdpl/playlist.m3u8" },
  { n: "伊犁维语广播", u: "http://lhttp.qingting.fm/live/5022688/64k.mp3" },
  { n: "沈阳新闻广播", u: "http://lhttp.qingting.fm/live/20024/64k.mp3" },
  { n: "深圳生活廣播", u: "http://ls.qingting.fm/live/1273.m3u8" },
  { n: "CNR-16 中国乡村之声", u: "http://satellitepull.cnr.cn/live/wxxczs/playlist.m3u8?wsSession=91f6d734b85656e7f586e4ea-174708860424584&wsIPSercert=29f90b67755e3a4646651f7aa8eb5fd6" },
  { n: "兵团之声", u: "https://lhttp.qtfm.cn/live/5022410/64k.mp3" },
  { n: "泉州交通广播", u: "https://lhttp.qingting.fm/live/15318189/64k.mp3" },
  { n: "苏州交通经济广播", u: "http://lhttp.qingting.fm/live/2806/64k.mp3" },
  { n: "警察廣播電臺 - 臺北分臺 FM 94.3", u: "https://stream.pbs.gov.tw/live/TPS/playlist.m3u8" },
  { n: "Phate Radio 飛特電台 - anime, games and pop", u: "https://phate.io/listen" },
  { n: "China Radio-5 少儿频道", u: "https://lhttp.qtfm.cn/live/20500038/64k.mp3?" },
  { n: "河北私家车广播", u: "http://ls.qingting.fm/live/4868.m3u8" },
  { n: "青岛老年广播", u: "http://lhttp.qingting.fm/live/4956/64k.mp3" },
  { n: "B&B RADIO 幫幫廣播網", u: "https://cdn280.ccdntech.com/live-http/_definst_/vod280_Live/bb/playlist.m3u8" },
  { n: "M Radio 全國廣播", u: "https://n03.rcs.revma.com/044q61ha7a0uv" },
  { n: "Bridge Radio - 华语 HITS （2）", u: "https://das-edge14-live365-dal02.cdnstream.com/a57743_2" },
  { n: "佛山南海广播", u: "https://radiopull.radiofoshan.com.cn/live/1400820947_BSID_42_audio.m3u8" },
  { n: "電台測試2", u: "http://125.227.87.206:8000/SuperUS" },
  { n: "台灣廣播 中興台", u: "http://test.taiwan-radio.tw:8000/NT.AM963" },
  { n: "CCTV-7国防军事伴音", u: "https://piccpndali.v.myalicdn.com/audio/cctv7_2.m3u8" },
  { n: "湖南交通广播", u: "http://a.live.hnradio.com/jtpd/radio120k_jtpd.m3u8?auth_key=1588751155-0-0-301d7e28868eff70a72edf5e4569b546" },
  { n: "飛揚調頻FM89.5", u: "https://n13.rcs.revma.com/e0tdah74hv8uv" },
  { n: "河南影视广播", u: "https://stream.hndt.com/live/yingshi/playlist.m3u8" },
  { n: "1766線上電臺-百家知識", u: "http://livestream.1766.today:1768/live1.mp3" },
  { n: "河南教育广播", u: "https://stream.hndt.com/live/jiaoyu/playlist.m3u8" },
  { n: "广东卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/guangdong_2.m3u8" },
  { n: "Ai Radio TAIWAN 台灣AI電台", u: "https://n10.rcs.revma.com/h4ta80hbqwuvv" },
  { n: "主內真生命", u: "https://stream.tligradio.org/listen/chinese/radio.mp3" },
  { n: "乌鲁木齐维语广播", u: "https://lhttp.qtfm.cn/live/1923/64k.mp3" },
  { n: "深圳龙岗星光991", u: "https://lhttp.qingting.fm/live/20160/64k.mp3" },
  { n: "滨海文艺广播", u: "http://traffic.jbh.tjbh.com/live/FM101.7/playlist.m3u8" },
  { n: "世新廣播電台-2", u: "https://stream.ginnet.cloud/live0115lo-89xv/_definst_/am729/playlist.m3u8" },
  { n: "勝利之聲AM756", u: "http://test.taiwan-radio.tw:8000/PH.AM756" },
  { n: "千里之外", u: "https://cd-live-stream.news.cctvplus.com/live/smil:CHANNEL1.smil/playlist.m3u8" },
  { n: "曹县人民广播电台", u: "http://lhttp.qingting.fm/live/5022340/64k.mp3" },
  { n: "河南网络格莱美音乐台 Grammy Radio", u: "http://stream3.hndt.com/now/yorSd1X2/playlist.m3u8" },
  { n: "广州青少年广播", u: "http://live.xmcdn.com/live/259/64.m3u8" },
  { n: "开封音乐广播", u: "http://lhttp.qingting.fm/live/4569/64k.mp3" },
  { n: "河南网络广播·爵士FM", u: "http://stream3.hndt.com/now/p16uWRAi/playlist.m3u8" },
  { n: "金堂人民广播电台", u: "http://lhttp.qingting.fm/live/20211686/64k.mp3" },
  { n: "神州之聲", u: "https://satellitepull.cnr.cn/live/wxszzs/playlist.m3u8?wsSession=d966c1f28016a758d88ba0c2-174761731342853&wsIPSercert=270c8446fe14303f2433a2f164ccd9e5" },
  { n: "哈尔滨电视台 都市资讯频道", u: "http://stream.hrbtv.net/zxpd/playlist.m3u8" },
  { n: "扬中人民广播电台", u: "http://live.xmcdn.com/live/2645/64.m3u8" },
  { n: "浙江民生资讯广播", u: "http://ali-m-l.cztv.com/channels/lantian/fm996/128k.m3u8" },
  { n: "台灣廣播 台中台", u: "http://test.taiwan-radio.tw:8000/TC.AM774" },
  { n: "廊坊戏曲广播·飞扬105", u: "http://lhttp.qingting.fm/live/20211678/64k.mp3" },
  { n: "我的音乐分享", u: "https://stream.zeno.fm/fgbm7mgdjucvv" },
  { n: "AsiaFM 亞太電台", u: "https://n13.rcs.revma.com/kydend74hv8uv" },
  { n: "南方之音", u: "http://43.254.16.40:8000/KS.FM89.3" },
  { n: "台灣廣播 台北二台", u: "http://test.taiwan-radio.tw:8000/TP.AM1188" },
  { n: "江西文艺音乐广播", u: "https://lhttp.qtfm.cn/live/1802/64k.mp3" },
  { n: "青岛音乐•体育广播", u: "http://lhttp.qingting.fm/live/1677/64k.mp3" },
  { n: "河南网络动感音乐台", u: "http://stream3.hndt.com/now/ufjjbZxV/playlist.m3u8" },
  { n: "黑龙江卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/heilongjiang_2.m3u8" },
  { n: "桂林飞扬频率", u: "http://lhttp.qingting.fm/live/1760/64k.mp3" },
  { n: "辽宁生活广播", u: "https://lhttp.qtfm.cn/live/1102/64k.mp3?app" },
  { n: "黔东南交通广播", u: "http://lhttp.qingting.fm/live/5022285/64k.mp3" },
  { n: "涞水县怀旧音乐广播895", u: "https://lhttp.qtfm.cn/live/20211619/64k.mp3" },
  { n: "江夏女主播电台", u: "http://lhttp.qingting.fm/live/5022716/64k.mp3" },
  { n: "黑龙江都市·女性广播", u: "https://lhttp.qtfm.cn/live/4968/64k.mp3" },
  { n: "哈尔滨电视台 娱乐频道", u: "http://stream.hrbtv.net/ylpd/playlist.m3u8" },
  { n: "大兴区人民广播电台", u: "http://lhttp.qingting.fm/live/5021739/64k.mp3" },
  { n: "海口交通广播", u: "http://lhttp.qingting.fm/live/5022079/64k.mp3?" },
  { n: "滨海音乐广播", u: "http://traffic.jbh.tjbh.com/live/FM100.5/playlist.m3u8" },
  { n: "南昌交通音乐广播", u: "https://lhttp.qtfm.cn/live/1804/64k.mp3" },
  { n: "福建东南卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/dongnan_2.m3u8" },
  { n: "深圳交通廣播", u: "https://lhttp.qtfm.cn/live/1272/64k.mp3" },
  { n: "哈尔滨电视台 生活频道", u: "http://stream.hrbtv.net/shpd/playlist.m3u8" },
  { n: "福建海峡之声", u: "https://lhttp.qtfm.cn/live/1744/64k.mp3" },
  { n: "嘉義之音", u: "http://test.taiwan-radio.tw:8000/CY.FM91.3" },
  { n: "中国风的歌曲", u: "https://stream.zeno.fm/ftaareifzcyvv" },
  { n: "斗门人民广播电台", u: "http://lhttp.qingting.fm/live/15318432/64k.mp3" },
  { n: "有线财经资讯台", u: "http://cm61-10-2-143.hkcable.com.hk/live_freedirect/freehd208_h.live/playlist.m3u8" },
  { n: "江西综合新闻广播", u: "https://lhttp.qtfm.cn/live/1809/64k.mp3" },
  { n: "河南旅游广播", u: "https://stream.hndt.com/live/sijiache/playlist.m3u8" },
  { n: "桂林城市之声", u: "http://lhttp.qingting.fm/live/1759/64k.mp3" },
  { n: "恩平人民广播电台", u: "https://lhttp.qingting.fm/live/20701/64k.mp3" },
  { n: "长沙市望城区人民广播电台", u: "http://lhttp.qingting.fm/live/5022076/64k.mp3" },
  { n: "CNR-7 粵港澳大灣區之聲", u: "https://satellitepull.cnr.cn/live/wxhxzs/playlist.m3u8?wsSession=a919bd0baf31a1a6f3966f08-174761752612586&wsIPSercert=270c8446fe14303f2433a2f164ccd9e5" },
  { n: "河南网络广播·安全百科网络台", u: "http://stream3.hndt.com/now/4pcovD2L/playlist.m3u8" },
  { n: "河南信息广播", u: "https://stream.hndt.com/live/leling/playlist.m3u8" },
  { n: "AC878 澳洲华语FM电台", u: "https://stream4.rcast.net/71937/#?.mp3" },
  { n: "信阳平桥广播", u: "https://lhttp.qingting.fm/live/15318156/64k.mp3" },
  { n: "光山人民广播电台", u: "http://lhttp.qingting.fm/live/20500029/64k.mp3" },
  { n: "大愛網路電台", u: "http://test.taiwan-radio.tw:8000/DaAiRadio" },
  { n: "警察廣播電臺 - 高雄分臺 FM 93.1", u: "https://stream.pbs.gov.tw/live/KSS/playlist.m3u8" },
  { n: "香港電台第七台 普通话台", u: "https://rthkradiopth-live.akamaized.net/hls/live/2040082/radiopth/index_64_a.m3u8" },
  { n: "涿州人民广播电台", u: "http://lhttp.qingting.fm/live/20211619/64k.mp3" },
  { n: "桃園先聲廣播AM774", u: "http://test.taiwan-radio.tw:8000/TY.AM774" },
  { n: "80后音悦台", u: "https://live.ximalaya.com/radio-first-page-app/live/2684/64.m3u8?transcode=ts" },
  { n: "福州左海之声", u: "http://lhttp.qingting.fm/live/3937/64k.mp3" },
  { n: "青岛胶州广播", u: "http://lhttp.qingting.fm/live/20211644/64k.mp3" },
  { n: "好家庭廣播電台（Classical 台中古典音樂台）", u: "http://test.taiwan-radio.tw:8000/TC.FM97.7" },
  { n: "南宁故事广播", u: "https://hls.nntv.cn/nnradio/895_24.m3u8" },
  { n: "正聲台北調幅台 AM819", u: "http://test.taiwan-radio.tw:8000/TP.AM819" },
  { n: "179白陽經典", u: "https://stream.zeno.fm/v5169mx3cm8uv" },
  { n: "唐山曹妃甸之声", u: "https://lhttp.qtfm.cn/live/1660/64k.mp3" },
  { n: "宜昌都市生活广播", u: "https://lhttp.qingting.fm/live/20567/64k.mp3" },
  { n: "武安人民广播电台", u: "http://lhttp.qingting.fm/live/5022474/64k.mp3" },
  { n: "新聲廣播FM99.3", u: "http://test.taiwan-radio.tw:8000/HC.FM99.3" },
  { n: "广西经济广播", u: "https://stream.bbrtv.com:10443/hls/wrr24LJGR/wrr24LJGR_live.m3u8" },
  { n: "炫舞时代ol", u: "https://stream.zeno.fm/hdeerqmfakhvv" },
  { n: "郑州人民广播电台 交通广播", u: "http://lhttp.qingting.fm/live/1211/64k.mp3" },
  { n: "高阳人民广播电台", u: "http://lhttp.qingting.fm/live/5021555/64k.mp3" },
  { n: "良友电台友音乐频道", u: "https://c25.radioboss.fm:8334/stream" },
  { n: "沧州交通音乐广播", u: "https://lhttp.qingting.fm/live/3954/64k.mp3" },
  { n: "勝利之聲台南2台AM1188", u: "http://test.taiwan-radio.tw:8000/TN.AM1188" },
  { n: "安庆农村广播", u: "https://lhttp.qingting.fm/live/1966/64k.mp3" },
  { n: "新疆文化旅游广播", u: "https://lhttp.qtfm.cn/live/1909/64k.mp3" },
  { n: "辽宁音乐广播", u: "https://lhttp.qtfm.cn/live/1101/64k.mp3?app" },
  { n: "郑州人民广播电台 文化娱乐广播", u: "http://lhttp.qingting.fm/live/1222/64k.mp3" },
  { n: "郾城人民广播电台", u: "http://lhttp.qingting.fm/live/15318300/64k.mp3" },
  { n: "都會聲音FM99.7", u: "http://test.taiwan-radio.tw:8000/TN.FM99.7" },
  { n: "雲端新廣播", u: "http://test.taiwan-radio.tw:8000/KS.FM99.5" },
  { n: "临沂经济广播", u: "https://lhttp.qtfm.cn/live/3994/64k.mp3" },
  { n: "孟村回族自治县人民广播电台", u: "http://lhttp.qingting.fm/live/5021914/64k.mp3" },
  { n: "广西经济广播 970女主播电台", u: "https://lhttp.qtfm.cn/live/1754/64k.mp3" },
  { n: "庄河人民广播电台", u: "http://lhttp.qingting.fm/live/5022473/64k.mp3" },
  { n: "河南警广之声", u: "http://stream3.hndt.com/now/prIgXGFo/playlist.m3u8" },
  { n: "石狮人民广播电台", u: "http://live.xmcdn.com/live/2730/64.m3u8" },
  { n: "邯郸交通音乐广播", u: "https://lhttp.qingting.fm/live/3950/64k.mp3" },
  { n: "南宁交通音乐广播", u: "https://lhttp.qtfm.cn/live/20767/64k.mp3" },
  { n: "永年人民广播电台", u: "http://lhttp.qingting.fm/live/20212203/64k.mp3" },
  { n: "贵州音乐广播", u: "https://lhttp.qtfm.cn/live/20067/64k.mp3" },
  { n: "金山人民广播电台", u: "https://lhttp.qingting.fm/live/4022/64k.mp3" },
  { n: "濁水溪FM90.1", u: "http://test.taiwan-radio.tw:8000/YL.FM90.1" },
  { n: "察布查尔人民广播电台", u: "https://lhttp.qingting.fm/live/5022610/64k.mp3" },
  { n: "海南国际旅游岛之声", u: "http://lhttp.qingting.fm/live/1862/64k.mp3" },
  { n: "郑州人民广播电台 经济广播", u: "http://lhttp.qingting.fm/live/1221/64k.mp3" },
  { n: "農鄉廣播電台", u: "http://test.taiwan-radio.tw:8000/YL.FM106.3" },
  { n: "T-Radio旅游广播104", u: "https://stream.zeno.fm/4x3gkv9zsy8uv" },
  { n: "故城人民广播电台", u: "http://lhttp.qingting.fm/live/20212269/64k.mp3" },
  { n: "河南少儿广播", u: "https://lhttp.qtfm.cn/live/20500038/64k.mp3" },
  { n: "清苑区105.8飞扬调频", u: "http://lhttp.qingting.fm/live/5021803/64k.mp3?" },
  { n: "都江堰935爱旅游", u: "https://lhttp.qtfm.cn/live/20207773/64k.mp3" },
  { n: "台南建國廣播公司", u: "http://test.taiwan-radio.tw:8000/TN.AM801" },
  { n: "保定新闻频道", u: "https://lhttp.qtfm.cn/live/5022440/64k.mp3" },
  { n: "河南卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/henan_2.m3u8" },
  { n: "天聲AM1314", u: "http://test.taiwan-radio.tw:8000/ML.AM1314" },
  { n: "警察廣播電台 - 花蓮台", u: "http://stream.pbs.gov.tw:1935/live/HLS/playlist.m3u8" },
  { n: "伊犁文艺交通广播", u: "https://lhttp.qtfm.cn/live/5022689/64k.mp3" },
  { n: "大连少儿广播", u: "http://ls.qingting.fm/live/1084.m3u8" },
  { n: "广汉人民广播电台", u: "https://lhttp.qingting.fm/live/20212405/64k.mp3" },
  { n: "广西教育广播", u: "https://stream.bbrtv.com:10443/hls/I7LJVL1Gg/I7LJVL1Gg_live.m3u8" },
  { n: "开封交通广播", u: "http://lhttp.qingting.fm/live/1214/64k.mp3" },
  { n: "测试7", u: "http://www.dalitv.com.tw:4568/live/dali/index.m3u8" },
  { n: "邢台新闻广播", u: "http://lhttp.qingting.fm/live/20211628/64k.mp3" },
  { n: "邯郸经济文艺广播", u: "https://lhttp.qingting.fm/live/4601/64k.mp3" },
  { n: "MCBS 銘傳廣播電台", u: "http://radio.mcu.edu.tw:8080/radio?1747274117052" },
  { n: "台灣廣播 松嶺台", u: "http://test.taiwan-radio.tw:8000/NT.AM630" },
  { n: "登封人民广播电台", u: "https://lhttp.qingting.fm/live/5022077/64k.mp3" },
  { n: "监利电台Jianli National Radio", u: "https://lhttp.qtfm.cn/live/15318507/64k.mp3" },
  { n: "重庆卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/chongqing_2.m3u8" },
  { n: "青岛文艺广播", u: "http://video10.qtv.com.cn/zhibosjcgb/manifest.m3u8" },
  { n: "環宇廣播電台", u: "https://n06.rcs.revma.com/srn5f9kmwxhvv" },
  { n: "任丘人民广播电台", u: "http://lhttp.qingting.fm/live/5022470/64k.mp3" },
  { n: "南京交通广播", u: "http://hls.njgb.com/live_hls/2/playlist.m3u8" },
  { n: "魏县人民广播电台", u: "http://lhttp.qingting.fm/live/20212412/64k.mp3" },
  { n: "保定交通频道", u: "https://lhttp.qtfm.cn/live/20168/64k.mp3" },
  { n: "台山五邑旅游频道", u: "https://lhttp.qingting.fm/live/5022062/64k.mp3" },
  { n: "新安县乐享1007", u: "https://lhttp.qtfm.cn/live/20500141/64k.mp3" },
  { n: "江西卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/jiangxi_2.m3u8" },
  { n: "清苑人民广播电台", u: "http://lhttp.qingting.fm/live/5021803/64k.mp3" },
  { n: "菏泽音乐广播", u: "http://live.hznet.tv:1935/live/live918/32k/tzwj_video.m3u8" },
  { n: "黔东南州凯里广播电台", u: "https://lhttp.qtfm.cn/live/5022045/64k.mp3" },
  { n: "彰化花園廣播電台", u: "http://test.taiwan-radio.tw:8000/CH.FM88.7" },
  { n: "河南戏曲网络广播", u: "http://stream.hndt.com/live/wangluoxiqu/playlist.m3u8" },
  { n: "济宁交通文艺广播", u: "https://lhttp.qtfm.cn/live/20087/64k.mp3" },
  { n: "绍兴戏曲广播", u: "http://live.shaoxing.com.cn/audio/s10001-xq3/index.m3u8" },
  { n: "Radio Italia Cina TV 意大利中国电台电视频道", u: "https://585b674743bbb.streamlock.net/9054/9054/playlist.m3u8" },
  { n: "勝利之聲台南1台AM774", u: "http://test.taiwan-radio.tw:8000/TN.AM774" },
  { n: "燕聲AM1044", u: "http://test.taiwan-radio.tw:8000/HL.AM1044" },
  { n: "河南农村广播", u: "https://stream.hndt.com/live/nongcun/playlist.m3u8" },
  { n: "漳州交通广播", u: "http://lhttp.qingting.fm/live/1743/64k.mp3" },
  { n: "瓦房店人民广播电台", u: "http://lhttp.qingting.fm/live/20500094/64k.mp3" },
  { n: "每日廣播公司SAKURA RADIO", u: "http://test.taiwan-radio.tw:8000/TC.FM98.7" },
  { n: "高雄港都廣播", u: "https://n10.rcs.revma.com/q2m07dc59duvv" },
  { n: "云南卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/yunnan_2.m3u8" },
  { n: "沈阳新民广播FM103.9", u: "http://lhttp.qingting.fm/live/5022535/64k.mp3" },
  { n: "黄石经济广播", u: "https://lhttp.qingting.fm/live/3964/64k.mp3" },
  { n: "鼎城人民广播电台", u: "https://lhttp.qingting.fm/live/5021860/64k.mp3" },
  { n: "内蒙古卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/neimenggu_2.m3u8" },
  { n: "南乐县广播节目", u: "https://lhttp.qtfm.cn/live/20500136/64k.mp3" },
  { n: "山西卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/shan1xi_2.m3u8" },
  { n: "桐乡人民广播电台", u: "http://lhttp.qingting.fm/live/5021791/64k.mp3" },
  { n: "邢台交通•音乐广播", u: "http://lhttp.qingting.fm/live/15318481/64k.mp3" },
  { n: "良友电台同行频道", u: "https://c23.radioboss.fm/stream/194" },
  { n: "警察廣播電台 - 宜蘭台", u: "http://stream.pbs.gov.tw:1935/live/ELS/playlist.m3u8" },
  { n: "上海麗都廣播電台 1940's Shanghai Vintage Jazz Shidaiqu Radio", u: "https://radio.nitro-server.uk/listen/1940sshanghaioldtimesmusicradio/radio.mp3" },
  { n: "栾城人民广播电台", u: "http://lhttp.qingting.fm/live/5022038/64k.mp3" },
  { n: "福州音乐广播", u: "http://live.zohi.tv/audio/s10001-FM893/index.m3u8" },
  { n: "郴州交通广播", u: "https://lhttp.qingting.fm/live/20867/64k.mp3" },
  { n: "珠海綜合廣播", u: "https://lhttp.qtfm.cn/live/1274/64k.mp3" },
  { n: "乌鲁木齐交通广播", u: "https://lhttp.qtfm.cn/live/1919/64k.mp3" },
  { n: "四川民族广播", u: "https://lhttp.qtfm.cn/live/1115/64k.mp3" },
  { n: "淮安农村广播", u: "https://lhttp.qingting.fm/live/4588/64k.mp3" },
  { n: "达州交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022395/64k.mp3" },
  { n: "珠海環保經濟廣播", u: "https://lhttp.qtfm.cn/live/1275/64k.mp3" },
  { n: "南京体育广播", u: "http://live.xmcdn.com/live/88/64.m3u8" },
  { n: "南部新闻综合·南部人民广播电台", u: "https://lhttp.qingting.fm/live/20525/64k.mp3" },
  { n: "吉林市交通广播", u: "http://lhttp.qingting.fm/live/1819/64k.mp3" },
  { n: "扬州经济音乐广播", u: "https://lhttp.qingting.fm/live/2805/64k.mp3" },
  { n: "泊头市广播电视台广播节目", u: "https://lhttp.qtfm.cn/live/20500164/64k.mp3" },
  { n: "邢台生活广播", u: "http://lhttp.qingting.fm/live/15318265/64k.mp3" },
  { n: "天聲AM1215", u: "http://test.taiwan-radio.tw:8000/ML.AM1215" },
  { n: "双流人民广播电台", u: "https://lhttp.qingting.fm/live/20211587/64k.mp3" },
  { n: "广东珠江经济台", u: "https://lhttp.qtfm.cn/live/1259/64k.mp3" },
  { n: "新疆卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/xinjiang_2.m3u8" },
  { n: "甘肃卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/gansu_2.m3u8" },
  { n: "盐城经济生活广播", u: "https://lhttp.qtfm.cn/live/20326/64k.mp3" },
  { n: "青岛音乐·体育广播", u: "http://video10.qtv.com.cn/zhiboytgb/manifest.m3u8" },
  { n: "七星关人民广播电台", u: "https://lhttp.qingting.fm/live/5021866/64k.mp3" },
  { n: "义安电台", u: "https://lhttp.qingting.fm/live/5021979/64k.mp3" },
  { n: "伊犁哈语广播", u: "https://lhttp.qingting.fm/live/5022692/64k.mp3" },
  { n: "即墨人民广播电台", u: "https://lhttp.qingting.fm/live/20807/64k.mp3" },
  { n: "大丰人民广播电台", u: "https://lhttp.qingting.fm/live/20211708/64k.mp3" },
  { n: "巴音郭楞交通广播", u: "https://lhttp.qingting.fm/live/5022104/64k.mp3" },
  { n: "广西教育广播 私家车930", u: "https://lhttp.qtfm.cn/live/1756/64k.mp3" },
  { n: "香港電台第三台", u: "https://rthkradio2-live.akamaized.net/hls/live/2040078/radio2/index_64_a.m3u8" },
  { n: "FM99.1大连都市之声广播", u: "https://lhttp.qtfm.cn/live/1086/64k.mp3" },
  { n: "南康广播电台", u: "https://lhttp.qtfm.cn/live/5021869/64k.mp3" },
  { n: "思奥电台 Live", u: "https://stream.zeno.fm/dx5ycbq2vc9uv" },
  { n: "遵义交通文艺广播", u: "https://lhttp.qingting.fm/live/20741/64k.mp3" },
  { n: "彰化關懷電台", u: "http://test.taiwan-radio.tw:8000/CH.FM91.1" },
  { n: "临朐人民广播电台", u: "https://lhttp.qingting.fm/live/20500033/64k.mp3" },
  { n: "听云相声台", u: "https://m.tyradio.uk/tyxs.mp3" },
  { n: "定陶人民广播电台", u: "http://lhttp.qingting.fm/live/20211680/64k.mp3" },
  { n: "宜兴交通广播", u: "http://lhttp.qingting.fm/live/3982/64k.mp3" },
  { n: "崇州人民广播电台", u: "http://lhttp.qingting.fm/live/20500066/64k.mp3" },
  { n: "林州人民广播电台", u: "http://lhttp.qingting.fm/live/20211604/64k.mp3" },
  { n: "湖南潇湘之声", u: "http://a.live.hnradio.com/zxpd/radio120k_zxpd.m3u8?auth_key=1588751208-0-0-3440555a157a45fdcbdb7840504278c5" },
  { n: "牡丹广播电视台", u: "http://lhttp.qingting.fm/live/15318316/64k.mp3" },
  { n: "衢州新闻广播", u: "http://lhttp.qingting.fm/live/20444/64k.mp3" },
  { n: "益世廣播電台", u: "http://210.209.16.1:1935/YSLive/YSLive/playlist.m3u8" },
  { n: "警察廣播電臺 - 臺中分臺 FM 94.5", u: "https://stream.pbs.gov.tw/live/TCS/playlist.m3u8" },
  { n: "高雄廣播電台", u: "https://n13.rcs.revma.com/pet2dvug1bkvv" },
  { n: "宿迁新农村广播", u: "https://lhttp.qingting.fm/live/21265/64k.mp3" },
  { n: "开远人民广播电台", u: "https://lhttp.qingting.fm/live/5022383/64k.mp3" },
  { n: "新疆哈语广播", u: "https://lhttp.qtfm.cn/live/1908/64k.mp3" },
  { n: "昆明城市管理广播", u: "https://lhttp.qtfm.cn/live/1936/64k.mp3" },
  { n: "江西信息交通广播", u: "https://lhttp.qtfm.cn/live/1811/64k.mp3" },
  { n: "潍坊经济广播", u: "https://lhttp.qtfm.cn/live/20839/64k.mp3" },
  { n: "获嘉人民广播电台", u: "http://lhttp.qingting.fm/live/5021919/64k.mp3" },
  { n: "黑山县广播电视台广播节目", u: "https://lhttp.qtfm.cn/live/20500119/64k.mp3" },
  { n: "内江交通广播", u: "https://www.scnj.tv/hls_njtv/live/jtgb.m3u8" },
  { n: "听云评书台", u: "https://m.tyradio.uk/typs.mp3" },
  { n: "宁夏卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/ningxia_2.m3u8" },
  { n: "寒亭人民广播电台", u: "https://lhttp.qingting.fm/live/4865/64k.mp3" },
  { n: "张家口综艺广播", u: "https://lhttp.qtfm.cn/live/5021910/64k.mp3" },
  { n: "苏家屯区盛京FM105.6", u: "https://lhttp.qtfm.cn/live/5022520/64k.mp3" },
  { n: "蒙阴广播", u: "https://lhttp.qtfm.cn/live/15318571/64k.mp3" },
  { n: "陕西卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/shan3xi_2.m3u8" },
  { n: "電聲電台", u: "http://test.taiwan-radio.tw:8000/TN.AM1071" },
  { n: "云南国际广播 Yunnan International Radio", u: "https://gbw.ynradio.cn/radio/gjgb.stream/playlist.m3u8" },
  { n: "南京经济广播", u: "http://live.xmcdn.com/live/69/64.m3u8" },
  { n: "安溪FM946茶频率", u: "https://lhttp.qtfm.cn/live/5022135/64k.mp3" },
  { n: "浦东文艺生活广播 城市沸点FM100.1", u: "https://lhttp.qtfm.cn/live/5022341/64k.mp3" },
  { n: "牟平广播电视台", u: "https://lhttp.qtfm.cn/live/5022382/64k.mp3" },
  { n: "盐城农村广播·经典882", u: "https://lhttp.qtfm.cn/live/20332/64k.mp3" },
  { n: "红安县电台", u: "https://lhttp.qtfm.cn/live/5022646/64k.mp3" },
  { n: "缙云广播", u: "http://l.cztvcloud.com/channels/lantian/SXjinyunaud/128k.m3u8" },
  { n: "腹股沟第三方他还会", u: "https://turkmedya-live.ercdn.net/tv4/tv4_720p.m3u8" },
  { n: "燕聲AM1242", u: "http://test.taiwan-radio.tw:8000/HL.AM1242" },
  { n: "苗栗客家文化廣播電台", u: "http://test.taiwan-radio.tw:8000/ML.FM91.7" },
  { n: "資悠網路廣播實驗電台", u: "http://test.taiwan-radio.tw:8000/GUIDECast.AH" },
  { n: "KRadio 若望三電台", u: "https://stream.zeno.fm/4uih7z8lxj9uv" },
  { n: "广西卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/guangxi_2.m3u8" },
  { n: "枣庄交通·文艺广播", u: "https://lhttp.qtfm.cn/live/1688/64k.mp3" },
  { n: "枣庄音乐·人文广播", u: "https://lhttp.qtfm.cn/live/1689/64k.mp3" },
  { n: "西藏卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/xizang_2.m3u8" },
  { n: "张家口农业经济广播", u: "https://lhttp.qtfm.cn/live/5021507/64k.mp3" },
  { n: "江西时尚广播", u: "http://lhttp.qingting.fm/live/20500092/64k.mp3" },
  { n: "河南经济广播", u: "https://stream.hndt.com/live/jingji/playlist.m3u8" },
  { n: "海南卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/travel_2.m3u8" },
  { n: "湖南经济广播", u: "http://a.live.hnradio.com/jjpd/radio120k_jjpd.m3u8?auth_key=1588751229-0-0-7c55dcf57fcd18b3e892c53cad357be4" },
  { n: "甘南藏语广播", u: "http://pili-live-hls.hfmt.net/gntv/gnzygb.m3u8" },
  { n: "嘉義北回廣播電台", u: "http://test.taiwan-radio.tw:8000/CY.FM91.7" },
  { n: "DLR-5 大连少儿广播", u: "https://lhttp.qtfm.cn/live/5022506/64k.mp3" },
  { n: "IC之音竹科廣播", u: "http://n01a-eu.rcs.revma.com/7mnq8rt7k5zuv" },
  { n: "先聲廣播電台 (基北桃竹苗)", u: "http://43.254.16.40:8000/TY.AM774" },
  { n: "漁業廣播電台", u: "http://n03.rcs.revma.com/mk0c5vq122hvv" },
  { n: "警察廣播電臺 - 新竹分臺 AM 1512", u: "https://stream.pbs.gov.tw/live/SCS/playlist.m3u8" },
  { n: "济源广播电台FM102.0", u: "https://lhttp.qingting.fm/live/5022142/64k.mp3" },
  { n: "香港電台第六台", u: "https://rthkradiocnrhk-live.akamaized.net/hls/live/2046111/radiocnrhk/index_64_a.m3u8" },
  { n: "军事新闻", u: "https://rscdn.ajmide.com/r_3124/nglive_3124.m3u8" },
  { n: "普洱交通广播", u: "http://lhttp.qingting.fm/live/20212429/64k.mp3" },
  { n: "辽源交通文艺广播", u: "http://stream9.jlntv.cn/lyjtgb/playlist.m3u8" },
  { n: "网络念佛堂", u: "https://js1.hwadzan.info/liveedge/_definst_/smil:amtb.smil/playlist.m3u8" },
  { n: "警察廣播電臺 - 臺南分臺 AM 1314", u: "https://stream.pbs.gov.tw/live/TNS/playlist.m3u8" },
  { n: "南通生活广播", u: "https://lhttp.qtfm.cn/live/21275/64k.mp3" },
  { n: "盘锦交通文艺广播", u: "http://live.xmcdn.com/live/350/64.m3u8" },
  { n: "人人廣播電台", u: "https://n01.rcs.revma.com/fkdywbc59duvv" },
  { n: "徐州农村广播（蜻蜓FM）", u: "https://lhttp.qtfm.cn/live/20211623/64k.mp3" },
  { n: "绵阳交通音乐广播", u: "https://lhttp.qtfm.cn/live/4026/64k.mp3" },
  { n: "肇庆高新之声", u: "https://lhttp.qtfm.cn/live/20500213/64k.mp3" },
  { n: "长春城市生活广播", u: "http://ls.qingting.fm/live/4984.m3u8" },
  { n: "CETV早期教育广播", u: "https://stream.zeno.fm/qefuzz74kfhvv" },
  { n: "悬疑电台", u: "https://rscdn.ajmide.com/r_3143/nglive_3143.m3u8" },
  { n: "深圳宝安湾区之声", u: "https://live.ximalaya.com/radio-first-page-app/live/2912/64.m3u8?transcode=ts" },
  { n: "澎湃907   江阴人民广播电台", u: "https://lhttp.qtfm.cn/live/2789/64k.mp3" },
  { n: "蒙自市广播电台", u: "https://lhttp.qtfm.cn/live/5021599/64k.mp3" },
  { n: "贵州故事广播", u: "http://satellitepull.cnr.cn/live/wx32gzgsgb/playlist.m3u8?wsSession=d8b4488aebb72eb396f72a83-174701428079898&wsIPSercert=5bb043949891952939522be8c9bd5410" },
  { n: "幸福105 徐州农村广播", u: "http://stream3.huaihai.tv/aac_gbfm105/playlist.m3u8" },
  { n: "恩施交通音乐广播", u: "https://lhttp.qtfm.cn/live/5022719/64k.mp3" },
  { n: "河北卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/hebei_2.m3u8" },
  { n: "洛阳文艺广播", u: "https://lhttp.qtfm.cn/live/20211321/64k.mp3" },
  { n: "連花廣播電台", u: "https://n05.rcs.revma.com/vh0xgcc59duvv" },
  { n: "禹州人民广播电台 调频FM93.4", u: "http://live.ximalaya.com/radio-first-page-app/live/2866/24.m3u8" },
  { n: "CNR-8 民族之声 조선어방송  ", u: "https://satellitepull.cnr.cn/live/wxmzzs/playlist.m3u8?wsSession=a919bd0baf31a1a6f3966f08-174761703245334&wsIPSercert=270c8446fe14303f2433a2f164ccd9e5" },
  { n: "南部交通音乐·南部人民广播电台", u: "https://lhttp.qingting.fm/live/5022604/64k.mp3" },
  { n: "历史档案", u: "https://rscdn.ajmide.com/r_3179/nglive_3179.m3u8" },
  { n: "台海新闻", u: "https://rscdn.ajmide.com/r_3133/nglive_3133.m3u8" },
  { n: "吉林卫视伴音", u: "https://piccpndali.v.myalicdn.com/audio/jilin_2.m3u8" },
  { n: "吉林经济广播 老年频率", u: "https://live-jlr.jlntv.cn/live/fm953.m3u8" },
  { n: "湖南金鹰955|Hunan", u: "https://rscdn.ajmide.com/r_1700/nglive_1700.m3u8" },
  { n: "黄山旅游广播", u: "https://lhttp.qtfm.cn/live/1969/64k.mp3" },
  { n: "Sao.FM 思奥FM", u: "https://stream.zeno.fm/98nz8aq2vc9uv" },
  { n: "东莞畅享1075", u: "https://stream.sun0769.com/dgrtv1/mp4tv11/index.m3u8?channel=1&t=1768649828&ttl=3600&key=6b0bf8d7f487b09d77d33797b44714c0" },
  { n: "呼图壁县5G智慧电台", u: "https://lhttp.qtfm.cn/live/20500188/64k.mp3" },
  { n: "秦皇岛旅游经济广播", u: "http://lhttp.qingting.fm/live/20859/64k.mp3" },
  { n: "高雄廣播電台AM1089", u: "https://n05.rcs.revma.com/4r99rt1g1bkvv" },
  { n: "CRI HIT FM 广州（停播）", u: "http://satellitepull.cnr.cn/live/wxhitfm/playlist.m3u8?wsSession=5047841c34cc76f1a161d1fe-174718013932472&wsIPSercert=29f90b67755e3a4646651f7aa8eb5fd6" },
  { n: "少爷生活", u: "https://lhttp.qtfm.cn/live/15318332/64k.mp3" },
  { n: "阳泉经济广播", u: "http://lhttp.qingting.fm/live/20211652/64k.mp3" },
  { n: "龙游人民广播电台FM95.4", u: "https://lhttp.qtfm.cn/live/15318359/64k.mp3" },
  { n: "东莞阳光1008", u: "https://stream.sun0769.com/dgrtv1/mp4tv10/index.m3u8?channel=1&t=1768649559&ttl=3600&key=df76a29809948793e0b4642b3e4cd26d" },
  { n: "大连都市之声", u: "http://live.ximalaya.com/radio-first-page-app/live/2819/64.m3u8" },
  { n: "梨树北方交通之声(2)", u: "http://stream3.jlntv.cn/lsgb/playlist.m3u8" },
  { n: "每日经济新闻AI电视", u: "http://swiftplay.hxkjmedia.com/tv/yytestW.m3u8" },
  { n: "听云音乐台", u: "https://m.tyradio.uk/radio.mp3" },
  { n: "大连少儿广播 FM106.7", u: "https://lhttp.qtfm.cn/live/1084/64k.mp3" },
  { n: "朋克音乐台", u: "https://stream.zeno.fm/y99cwikkky8tv" },
  { n: "永吉县人民广播电台(2)", u: "http://stream9.jlntv.cn/yongjigb/playlist.m3u8" },
  { n: "盘锦经济生活广播", u: "http://live.xmcdn.com/live/2696/64.m3u8" },
  { n: "警察廣播電臺 - 臺東分臺 FM 94.3", u: "https://stream.pbs.gov.tw/live/TTS/playlist.m3u8" },
  { n: "警察廣播電臺 - 花蓮分臺 FM 94.3", u: "https://stream.pbs.gov.tw/live/HLS/playlist.m3u8" },
  { n: "春天的风", u: "https://radio.pull.hebtv.com/live/hebxw.m3u8" },
  { n: "万猫屋 (Ms. Dress)", u: "https://streetcatpull.hellobike.com/live/4154701567245307824_0.m3u8" },
  { n: "宜昌音乐生活广播", u: "https://liveplay.ycrmt.cn/fm/qct.m3u8" },
  { n: "辽宁高速广播网", u: "http://living.muzhifm.com/muzhifm/liaoning_switch_bj.m3u8?auth_key=1853376769-0-0-7a0c30952f06f850e64bd8ebe1eec9ce" },
  { n: "高密广播电视台", u: "https://lhttp.qtfm.cn/live/20212417/64k.mp3" },
  { n: "悟道法师讲经台", u: "https://v.hwadzan.info/liveedge/_definst_/smil:wdmaster.smil/playlist.m3u8" },
  { n: "临淄广播·公信971", u: "https://lhttp.qtfm.cn/live/20212204/64k.mp3" },
  { n: "扬州邗江广播FM96.7", u: "https://lhttp.qtfm.cn/live/20211632/64k.mp3" },
  { n: "榆林生活资讯广播", u: "https://hplayer1.juyun.tv/camera/115986128.m3u8" },
  { n: "社会新闻", u: "https://rscdn.ajmide.com/r_3098/nglive_3098.m3u8" },
  { n: "加拿大中文电台FM88.9", u: "https://5b2959fe11444.streamlock.net/radio/fm889.stream/playlist.m3u8" },
  { n: "警察廣播電臺 - 宜蘭分臺 FM 101.3", u: "https://stream.pbs.gov.tw/live/ELS/playlist.m3u8" },
  { n: "临沂音乐科教广播", u: "https://lhttp.qtfm.cn/live/4017/64k.mp3" },
  { n: "咸阳音乐广播", u: "https://hplayer1.juyun.tv/camera/63973146.m3u8" },
  { n: "桃江电台", u: "https://lhttp.qtfm.cn/live/20500086/64k.mp3" },
  { n: "河北经济广播 高清", u: "https://satellitepull.cnr.cn/live/wxhebjjgb/playlist.m3u8?wsSession=a919bd0baf31a1a6f3966f08-174814197009714&wsIPSercert=302e928c9e06924943d63c021170d763" },
  { n: "泗水广播电视台", u: "http://live.ximalaya.com/radio-first-page-app/live/2775/64.m3u8" },
  { n: "濮阳县FM1053快乐调频", u: "https://lhttp.qtfm.cn/live/20206/64k.mp3" },
  { n: "西藏汉语广播", u: "http://satellitepull.cnr.cn/live/wxxzhygb/playlist.m3u8?wsSession=d8b4488aebb72eb396f72a83-174700937926481&wsIPSercert=5bb043949891952939522be8c9bd5410" },
  { n: "馒头说·历史的温度", u: "https://rscdn.ajmide.com/r_3172/nglive_3172.m3u8" },
  { n: "黑龙江朝语广播", u: "https://satellitepull.cnr.cn/live/wx32hljcygb/playlist.m3u8?wsSession=a919bd0baf31a1a6f3966f08-174778330216034&wsIPSercert=2683acdad9e689f89519c7ec3f7e218b" },
  { n: "龙泉驿区龙泉人民广播电台", u: "https://lhttp.qingting.fm/live/20207769/64k.mp3?app_id=web" },
  { n: "主播读经典", u: "https://rscdn.ajmide.com/r_3169/nglive_3169.m3u8" },
  { n: "商丘交通广播", u: "https://lhttp.qingting.fm/live/5021932/64k.mp3" },
  { n: "大理市电台苍洱调频", u: "https://lhttp.qtfm.cn/live/1940/64k.mp3" },
  { n: "美以袭击伊朗最新资讯", u: "https://rscdn.ajmide.com/r_3848/nglive_3848.m3u8" },
  { n: "Universal Health Radio (中文)", u: "https://radio.universalhealthradio.org/uhr-zh.mp3" },
  { n: "唐县经典913", u: "https://lhttp.qtfm.cn/live/20500222/64k.mp3" },
  { n: "幸福956 大连新城乡广播", u: "http://ls.qingting.fm/live/1089.m3u8" },
  { n: "新疆音乐广播", u: "https://live.ximalaya.com/radio-first-page-app/live/1364/64.m3u8?transcode=ts" },
  { n: "三时系念", u: "https://v.hwadzan.info/liveedge/_definst_/smil:sanshi_720p.smil/playlist.m3u8" },
  { n: "双溪法会", u: "https://v.hwadzan.info/liveedge/_definst_/smil:sx.smil/playlist.m3u8" },
  { n: "东方购物", u: "http://ocj2.kksmg.com/ocj2/ocj2.m3u8" },
  { n: "潍坊音乐文旅广播", u: "https://lhttp.qtfm.cn/live/15318631/64k.mp3" },
  { n: "华藏多元文化台", u: "https://v.hwadzan.info/liveedge/_definst_/education/playlist.m3u8" },
  { n: "山海屯青少年之聲", u: "https://n02.rcs.revma.com/zr7xzec59duvv" },
  { n: "佛山顺德广播", u: "https://radiopull.radiofoshan.com.cn/live/1400820947_BSID_44_audio.m3u8" },
  { n: "听云戏曲台", u: "https://m.tyradio.uk/tyxq.mp3" },
  { n: "延边旅游广播", u: "https://lhttp.qtfm.cn/live/5022438/64k.mp3" },
  { n: "贝多芬电台", u: "https://rscdn.ajmide.com/r_3145/nglive_3145.m3u8" },
  { n: "80后音悦台·河南网络电台", u: "https://play-radio-stream3.hndt.com/now/SFZeH2cb/chunklist.m3u8" },
  { n: "佛山电台真爱946", u: "https://radiopull.radiofoshan.com.cn/live/1400389414_BSID_46_audio.m3u8" },
  { n: "兴仁广播", u: "https://lhttp.qtfm.cn/live/20500077/64k.mp3" },
  { n: "兴宁电台", u: "https://lhttp.qtfm.cn/live/20500218/64k.mp3" },
  { n: "好学电台", u: "https://rscdn.ajmide.com/r_3844/nglive_3844.m3u8" },
  { n: "黑龙江老年·少儿广播", u: "https://lhttp.qtfm.cn/live/4972/64k.mp3" },
  { n: "大连长海之声FM91.7", u: "https://live.ximalaya.com/radio-first-page-app/live/2882/64.m3u8?transcode=ts" },
  { n: "宿州交通广播", u: "http://live.ahsz.tv/audio/s10001-jtgb/index.m3u8" },
  { n: "星球重启水吧歌单", u: "https://stream.zeno.fm/by5n9vuubphvv" },
  { n: "泸州交通音乐广播", u: "https://lhttp.qtfm.cn/live/5021559/64k.mp3" },
  { n: "淄川广播电视台", u: "https://lhttp.qtfm.cn/live/20211598/64k.mp3" },
  { n: "滁州旅游交通广播", u: "https://live.ximalaya.com/radio-first-page-app/live/174/64.m3u8?transcode=ts" },
  { n: "东源电台 FM101.5", u: "https://lhttp.qtfm.cn/live/20500124/64k.mp3" },
  { n: "巴赫电台", u: "https://rscdn.ajmide.com/r_3146/nglive_3146.m3u8" },
  { n: "广东文体广播", u: "https://lhttp.qtfm.cn/live/471/64k.mp3" },
  { n: "广西旅游广播", u: "http://ls.qingting.fm/live/1753.m3u8" },
  { n: "蝠声文艺频道", u: "http://fm.fsaxgb.com/radio/fsgb1.m3u8" },
  { n: "BIGCOWFM大牛网络电台 | 马来西亚中文网络电台", u: "https://a.tunzilla.com/http://onairnow.ddns.net:8000/chinese.mp3" },
  { n: "CHMB FM1320华侨之声网络音乐台", u: "https://stream.radiojar.com/60sqadqu97zuv.mp3" },
  { n: "曾文溪廣播電台", u: "https://n09.rcs.revma.com/9ssfduqkr0hvv" },
  { n: "1分钟推理", u: "https://rscdn.ajmide.com/r_3183/nglive_3183.m3u8" },
  { n: "北京延庆之声", u: "https://videoplaynew.yanqingrmzx.com/yq/gb.m3u8" },
  { n: "北京顺义区广播FM92.9", u: "https://livesy.chinamcache.com/live/gb01.m3u8" },
  { n: "呼伦贝尔蒙语广播", u: "https://satellitepull.cnr.cn/live/wx32nmghlbemygb/playlist.m3u8?wsSession=c650605f64c6488d38b66982-174814238782426&wsIPSercert=302e928c9e06924943d63c021170d763" },
  { n: "安阳县Top Radio 88.1", u: "https://lhttp.qtfm.cn/live/20209339/64k.mp3" },
  { n: "广东新闻台", u: "https://satellitepull.cnr.cn/live/wxgdxwgb/playlist.m3u8" },
  { n: "百色音乐广播 FM87.6", u: "https://vod.bsyjrb.cn/live/82c95bdd98f2.m3u8" },
  { n: "营口音乐之声", u: "http://live.ximalaya.com/radio-first-page-app/live/2863/64.m3u8" },
  { n: "947爱乐厅·中国现场", u: "https://rscdn.ajmide.com/r_3829/nglive_3829.m3u8" },
  { n: "上虞广播-2", u: "https://l.cztvcloud.com/channels/lantian/SXshangyu2/720p.m3u8" },
  { n: "优优宝贝广播", u: "https://stream.zeno.fm/de26yhn9yy8uv" },
  { n: "呼伦贝尔汉语广播", u: "https://satellitepull.cnr.cn/live/wx32nmghlbehygb/playlist.m3u8?wsSession=d966c1f28016a758d88ba0c2-174814248595620&wsIPSercert=302e928c9e06924943d63c021170d763" },
  { n: "夏河电视台汉藏双语综合频道", u: "http://play.kankanlive.com/live/1711956137852982.m3u8" },
  { n: "安康交通旅游音乐广播", u: "https://lhttp.qtfm.cn/live/5021862/64k.mp3" },
  { n: "玛曲电视台", u: "https://play.kankanlive.com/live/1711955176432990.m3u8" },
  { n: "甘肃人民广播电台农村广播", u: "https://lhttp.qtfm.cn/live/3941/64k.mp3" },
  { n: "盘山电台FM93.9", u: "http://live.ximalaya.com/radio-first-page-app/live/1069/64.m3u8" },
  { n: "美食电台", u: "https://rscdn.ajmide.com/r_3107/nglive_3107.m3u8" },
  { n: "西藏藏语广播", u: "http://satellitepull.cnr.cn/live/wxxzzygb/playlist.m3u8?wsSession=51c2a224185caba966715acd-174700996678387&wsIPSercert=5bb043949891952939522be8c9bd5410" },
  { n: "讲座精选", u: "https://rscdn.ajmide.com/r_3170/nglive_3170.m3u8" },
  { n: "黔西南旅游广播", u: "https://lhttp.qtfm.cn/live/5046/64k.mp3" },
  { n: "CNR-15 中国交通广播（辽宁）", u: "https://radio.0472.org/?id=1367" },
  { n: "VOK 库尔勒梨城之声 FM105.3", u: "https://lhttp.qtfm.cn/live/20212425/64k.mp3" },
  { n: "上海纪实频道《文化中国》广播版", u: "https://rscdn.ajmide.com/r_3171/nglive_3171.m3u8" },
  { n: "佛山电台FM92.4交通广播", u: "https://radiopull.radiofoshan.com.cn/live/1400389414_BSID_42_audio.m3u8" },
  { n: "包头城乡广播", u: "https://lhttp.qtfm.cn/live/1892/64k.mp3" },
  { n: "听·京剧", u: "https://rscdn.ajmide.com/r_3106/nglive_3106.m3u8" },
  { n: "听·黄梅戏", u: "https://rscdn.ajmide.com/r_3114/nglive_3114.m3u8" },
  { n: "嘉峪关交通广播", u: "https://play.kankanlive.com/live/1677655747873919.m3u8" },
  { n: "宁夏新闻广播", u: "http://satellitepull.cnr.cn/live/wxnxxwgb/playlist.m3u8?wsSession=d8b4488aebb72eb396f72a83-174701144043039&wsIPSercert=5bb043949891952939522be8c9bd5410" },
  { n: "广元旅游广播", u: "https://m3u8.channel.dzsm.com/nmip-media/audiolive/audio101760/playlist.m3u8" },
  { n: "广饶广播电视台", u: "https://lhttp.qtfm.cn/live/20500036/64k.mp3" },
  { n: "延边朝鲜语文艺生活广播 문예생활방송", u: "https://srs.iybtv.cn/audio/FM1023/index.m3u8" },
  { n: "彬州市人民广播电台", u: "https://live.ximalaya.com/radio-first-page-app/live/2675/64.m3u8?transcode=ts" },
  { n: "彬州市人民广播电台 mp3", u: "https://lhttp.qtfm.cn/live/20500035/64k.mp3" },
  { n: "德兴之声国际广播 DeXing International", u: "http://player4.juyun.tv/camera/158562106.m3u8?" },
  { n: "榆林交通文艺广播", u: "https://hplayer1.juyun.tv/camera/115978148.m3u8" },
  { n: "汉川少儿广播", u: "https://stream.zeno.fm/6pa9cwlcb98vv" },
  { n: "泸州对农经济生活广播", u: "https://lhttp.qtfm.cn/live/5021565/64k.mp3" },
  { n: "淮阴区FM100.6淮安车生活", u: "https://lhttp.qtfm.cn/live/5021970/64k.mp3" },
  { n: "铜仁交通旅游广播", u: "https://lhttp.qingting.fm/live/20211615/64k.mp3" },
  { n: "锦州经济广播", u: "https://srs.beijihainews.com.cn/video/jjgb/index.m3u8" },
  { n: "青海安多藏语广播", u: "http://satellitepull.cnr.cn/live/wx32qhzygb/playlist.m3u8?wsSession=1c983a4091d3a5f8a963629b-174701116820119&wsIPSercert=5bb043949891952939522be8c9bd5410" },
  { n: "项城936 项城综艺交通广播", u: "https://lhttp.qtfm.cn/live/15318335/64k.mp3" },
  { n: "清丰融媒广播 濮阳经典调频1038", u: "https://lhttp.qingting.fm/live/5021461/64k.mp3" },
  { n: "盐城滨海广播", u: "https://lhttp.qtfm.cn/live/20207779/64k.mp3" },
  { n: "莫扎特电台", u: "https://rscdn.ajmide.com/r_3147/nglive_3147.m3u8" },
  { n: "西藏康巴话广播", u: "http://satellitepull.cnr.cn/live/wxxzzykbfy/playlist.m3u8?wsSession=6136affdc49091afe49e248f-174701006672980&wsIPSercert=5bb043949891952939522be8c9bd5410" },
  { n: "锡林郭勒汉语广播", u: "https://satellitepull.cnr.cn/live/wx32nmgxlglhygb/playlist.m3u8?wsSession=d966c1f28016a758d88ba0c2-174779662031724&wsIPSercert=2683acdad9e689f89519c7ec3f7e218b" },
  { n: "CNR-15 中国交通广播长三角频率", u: "https://rscdn.ajmide.com/r_2919/nglive_2919.m3u8" },
  { n: "OnFM 最舒服歌曲", u: "https://cn.onfm.org/audio/stream" },
  { n: "上虞广播-3", u: "https://l.cztvcloud.com/channels/lantian/SXshangyuaud/128k.m3u8" },
  { n: "之江记录", u: "https://ali-m-l.cztv.com/channels/lantian/channel012/1080p.m3u8" },
  { n: "大连普兰店广播", u: "https://lhttp.qtfm.cn/live/20212414/64k.mp3" },
  { n: "宣城交通文艺广播", u: "https://lhttp.qtfm.cn/live/5023/64k.mp3" },
  { n: "怀化交通文艺广播", u: "https://lhttp.qtfm.cn/live/5022070/64k.mp3" },
  { n: "滨州文艺广播", u: "https://lhttp.qtfm.cn/live/21341/64k.mp3" },
  { n: "蛤蜊讲故事", u: "https://rscdn.ajmide.com/r_2951/nglive_2951.m3u8" },
  { n: "通辽交通文艺广播", u: "https://video.tongliaowang.com:2443/live/cid5.m3u8" },
  { n: "金川乡村频道", u: "http://live.jinchuanrmt.com:90/live/jcxc.m3u8" },
  { n: "鸟鸣电台", u: "https://rscdn.ajmide.com/r_3165/nglive_3165.m3u8" },
  { n: "947爱乐厅·欧洲现场", u: "https://rscdn.ajmide.com/r_3830/nglive_3830.m3u8" },
  { n: "CGTN Documentary TV audio 伴音", u: "https://hlspackager.akamaized.net/live/DB/CGTN_DOCUMENTARY/HLS/CGTN_DOCUMENTARY-mp4a_128000_eng=20000.m3u8" },
  { n: "FM104.7 澧县人民广播电台", u: "https://lhttp.qtfm.cn/live/15318178/64k.mp3" },
  { n: "伊春第一套广播", u: "https://liveplaysr.dbw.cn/lsdream/lYKK5cb/2000/live.m3u8" },
  { n: "伊春第二套广播", u: "https://liveplaysr.dbw.cn/lsdream/nktcdk0/2000/live.m3u8" },
  { n: "兴义市广播电视台", u: "https://lhttp.qtfm.cn/live/20500110/64k.mp3" },
  { n: "宁德交通旅游广播", u: "https://live.0593tv.cn/live/1x71vlpybkk5.m3u8" },
  { n: "山东维语都市广播", u: "https://lhttp.qtfm.cn/live/20211680/64k.mp3" },
  { n: "昌黎广播 FM97.8", u: "https://jwcdnqx.hebyun.com.cn/live/clxrmtzxzhgb/1500k/tzwj_video.m3u8" },
  { n: "津南之声", u: "http://play.jinnantv.top/live/JNTV2.m3u8" },
  { n: "浙江城市之声", u: "http://ali-m-l.cztv.com/channels/lantian/fm107/128k.m3u8" },
  { n: "湖南音乐之声广播 芒果音乐台", u: "https://lhttp.qtfm.cn/live/4979/64k.mp3" },
  { n: "营口交通文艺广播", u: "http://live.ximalaya.com/radio-first-page-app/live/2862/64.m3u8" },
  { n: "越夜越动听", u: "https://rscdn.ajmide.com/r_3184/nglive_3184.m3u8" },
  { n: "雷声电台", u: "https://rscdn.ajmide.com/r_3163/nglive_3163.m3u8" },
  { n: "CNR-15 中国交通广播河北", u: "https://rscdn.ajmide.com/r_1968/nglive_1968.m3u8" },
  { n: "FM98.3如皋人民广播电台", u: "https://lhttp.qtfm.cn/live/20207734/64k.mp3" },
  { n: "东方音乐电台 THMR", u: "https://radio.yunmoan.cn/radio/touhou/320k" },
  { n: "中国·汤阴 FM90.5", u: "https://lhttp.qtfm.cn/live/20500205/64k.mp3" },
  { n: "临汾交通文艺广播", u: "https://live.ximalaya.com/radio-first-page-app/live/2515/64.m3u8?transcode=ts" },
  { n: "北仑电台", u: "https://lhttp.qingting.fm/live/1153/64k.mp3" },
  { n: "听·昆曲", u: "https://rscdn.ajmide.com/r_3115/nglive_3115.m3u8" },
  { n: "四平交通文艺广播", u: "https://lhttp.qtfm.cn/live/5022465/64k.mp3" },
  { n: "平湖广播 FM90.6（直播间视频流）", u: "http://l.cztvcloud.com/channels/lantian/SXpinghu4/720p.m3u8" },
  { n: "延边交通文艺广播", u: "https://srs.iyb983.cn/audio/FM1059/index.m3u8" },
  { n: "收音机无信号雪花音", u: "https://rscdn.ajmide.com/r_208/nglive_208.m3u8" },
  { n: "晋江电视台", u: "https://live.ijjnews.com/jjtv/sd/live.m3u8" },
  { n: "江门新会电台 mp3", u: "https://lhttp.qtfm.cn/live/5061/64k.mp3" },
  { n: "流水潺潺", u: "https://rscdn.ajmide.com/r_3141/nglive_3141.m3u8" },
  { n: "爱上海 LIVE 24", u: "https://bp-resource-dfl.bestv.cn/148/3/video.m3u8" },
  { n: "蝠声综合频道", u: "https://live.ximalaya.com/radio-first-page-app/live/1428/64.m3u8?transcode=ts" },
  { n: "鄂尔多斯文体交通广播", u: "https://live.nxw.org.cn/lsdream/H2qFv3M/1000/live.m3u8" },
  { n: "锦州交通广播", u: "https://srs.beijihainews.com.cn/video/jtgb/index.m3u8" },
  { n: "锦州教育频道", u: "http://srs.beijihainews.com.cn/video/jinzhou2/index.m3u8" },
  { n: "风声电台", u: "https://rscdn.ajmide.com/r_3164/nglive_3164.m3u8" },
  { n: "Radi.fm 中文古典音乐", u: "https://live.radi.fm/live/stn%3A5a8b2c0eb17b4d64/index.m3u8" },
  { n: "Universal Health Radio (粵語)", u: "https://radio.universalhealthradio.org/uhr-yue.mp3" },
  { n: "CHTV百姓健康频道", u: "https://p2hs.vzan.com/1532537644/njyq869272051046520219/live.m3u8" },
  { n: "上虞广播-1", u: "https://l.cztvcloud.com/channels/lantian/SXshangyu1/720p.m3u8" },
  { n: "丽水龙泉广播", u: "http://l.cztvcloud.com/channels/lantian/SXlongquanaud/128k.m3u8" },
  { n: "延安交通音乐广播", u: "https://srs.yanews.cn/audio/FM98-7/index.m3u8" },
  { n: "新疆维语交通文艺广播", u: "https://live.ximalaya.com/radio-first-page-app/live/1834/64.m3u8?transcode=ts" },
  { n: "杭州音乐时尚广播", u: "https://live.xmcdn.com/live/1845/64.m3u8" },
  { n: "梨树北方交通之声", u: "https://lhttp.qtfm.cn/live/5022538/64k.mp3" },
  { n: "永康电台FM106.6", u: "https://lhttp.qtfm.cn/live/5022570/64k.mp3" },
  { n: "江门新会电台", u: "https://live.ximalaya.com/radio-first-page-app/live/2916/64.m3u8?transcode=ts" },
  { n: "浙江新闻频道", u: "http://ali-vl.cztv.com/channels/lantian/channel007/360p.m3u8" },
  { n: "西安交通旅游广播", u: "https://lhttp.qtfm.cn/live/1611/64k.mp3" },
  { n: "锦州新闻广播", u: "https://srs.beijihainews.com.cn/video/FM927/index.m3u8" },
  { n: "音乐剧剧场", u: "https://rscdn.ajmide.com/r_3148/nglive_3148.m3u8" },
  { n: "音乐家推荐", u: "https://rscdn.ajmide.com/r_3832/nglive_3832.m3u8" },
  { n: "1766 網路廣播電台 - 音樂頻道-民俗風 Folk", u: "https://n05-eu.rcs.revma.com/q2m07dc59duvv" },
  { n: "Footprint Radio Broadcast Ministry 美蹤廣播電台", u: "https://cast6.my-control-panel.com/proxy/footprint/stream" },
  { n: "CNR-15 中国交通广播甘肃", u: "https://rscdn.ajmide.com/r_2865/nglive_2865.m3u8" },
  { n: "三门人民广播电台", u: "http://lhttp.qingting.fm/live/15318638/64k.mp3" },
  { n: "临汾音乐广播", u: "https://live.ximalaya.com/radio-first-page-app/live/2516/64.m3u8?transcode=ts" },
  { n: "余姚广播", u: "http://l.cztvcloud.com/channels/lantian/SXyuyaoaud/128k.m3u8" },
  { n: "兰州交通音乐广播", u: "https://liveplus.lzr.com.cn/aac_jtyy/HD/live.m3u8" },
  { n: "历城广播电视台", u: "https://live.ximalaya.com/radio-first-page-app/live/2903/64.m3u8?transcode=ts" },
  { n: "听·沪剧", u: "https://rscdn.ajmide.com/r_3103/nglive_3103.m3u8" },
  { n: "嘉兴新闻广播", u: "http://lhttp.qingting.fm/live/1154/64k.mp3" },
  { n: "平凉交通广播", u: "https://play.kankanlive.com/live/1694762955080949.m3u8" },
  { n: "普陀广播", u: "http://l.cztvcloud.com/channels/lantian/SXputuoaud/128k.m3u8" },
  { n: "浙江新闻广播", u: "http://ali-m-l.cztv.com/channels/lantian/fm988/128k.m3u8" },
  { n: "赤峰农村牧区广播", u: "https://lhttp.qtfm.cn/live/1898/64k.mp3" },
  { n: "通化大众生活广播", u: "http://stream4.jlntv.cn/aac_thjt/playlist.m3u8" },
  { n: "铁岭电视台新闻综合频道", u: "https://live-play-tlrb.newaircloud.com/tlrb/3dc36395-a7a3-4855-9bd6-8d223cf9ac30.m3u8" },
  { n: "锡林郭勒蒙语广播", u: "https://satellitepull.cnr.cn/live/wx32nmgxlglmygb/playlist.m3u8?wsSession=d966c1f28016a758d88ba0c2-174779643946624&wsIPSercert=2683acdad9e689f89519c7ec3f7e218b" },
  { n: "长沙Big Radio 快乐886", u: "http://lhttp.qingting.fm/live/20847/64k.mp3" },
  { n: "雅安交通旅游广播", u: "https://play.yunxya.com/audiolive/whsh.m3u8" },
  { n: "青岛FM96.4 CGTN Radio", u: "https://rscdn.ajmide.com/r_49/nglive_49.m3u8" },
  { n: "Alian96.3 原住民族廣播電台", u: "https://streamipcfapp.akamaized.net/live2/_definst_/fm963/playlist.m3u8" },
  { n: "东盟电视台", u: "https://stream.tvasean.com/live/test/hls.m3u8" },
  { n: "CGTN TV audio 伴音", u: "https://hlspackager.akamaized.net/live/DB/CGTN_ENGLISH/HLS/CGTN_ENGLISH-mp4a_128000_eng=20000.m3u8" },
  { n: "兰州生活文艺广播", u: "https://liveplus.lzr.com.cn/aac_shwy/HD/live.m3u8" },
  { n: "兰溪人民广播电台", u: "http://l.cztvcloud.com/channels/lantian/SXlanxiaud/128k.m3u8" },
  { n: "内蒙古城乡生活广播", u: "http://lhttp.qingting.fm/live/1888/64k.mp3" },
  { n: "内蒙古城乡生活广播（视频直播线路）", u: "http://play1-qk.nmtv.cn/live/1902718general.m3u8" },
  { n: "开化广播", u: "http://l.cztvcloud.com/channels/lantian/SXkaihuaaud/128k.m3u8" },
  { n: "新疆柯尔克孜语广播", u: "http://satellitepull.cnr.cn/live/wxxjkygb/playlist.m3u8?wsSession=e155c0d7812904556cc22af2-174709889276127&wsIPSercert=29f90b67755e3a4646651f7aa8eb5fd6" },
  { n: "新疆柯语广播", u: "https://live.ximalaya.com/radio-first-page-app/live/1692/64.m3u8?transcode=ts" },
  { n: "江山市广播电视台广播节目", u: "http://play-sh.quklive.com/live/1621846880977914.m3u8" },
  { n: "河美靖远930", u: "https://live.ximalaya.com/radio-first-page-app/live/2646/64.m3u8?transcode=ts" },
  { n: "金融青年电台", u: "https://rscdn.ajmide.com/r_3836/nglive_3836.m3u8" },
  { n: "阳光悦读智听电台", u: "https://rscdn.ajmide.com/r_3853/nglive_3853.m3u8" },
  { n: "雨声电台", u: "https://rscdn.ajmide.com/r_3140/nglive_3140.m3u8" },
  { n: "君弘廣播電台｜君弘保健室", u: "https://junhongradio.com/listen/junhong/radio.mp3" },
  { n: "輔大之聲 Voice of FJU FM88.5", u: "http://fjuvoice885.fju.edu.tw:8000/fjuvoice885.mp3" },
  { n: "天水音乐文艺广播", u: "http://play.kankanlive.com/live/1735268150305110.m3u8" },
  { n: "宜春交通音乐广播 FM87.9", u: "https://liveds-yc.newsyc.com/fmb/sd/live.m3u8" },
  { n: "宿州文艺广播", u: "https://lhttp.qtfm.cn/live/5022400/64k.mp3" },
  { n: "嵊泗广播", u: "http://l.cztvcloud.com/channels/lantian/SXshengsiaud/128k.m3u8" },
  { n: "德惠广播", u: "http://stream11.jlntv.cn/aac_dehuigb/sd/live.m3u8" },
  { n: "慈溪人民广播电台", u: "https://lhttp.qingting.fm/live/5021401/64k.mp3" },
  { n: "抚松广播", u: "http://stream7.jlntv.cn/aac_fsgb/sd/live.m3u8" },
  { n: "敦煌之声", u: "https://play.kankanlive.com/live/1698383289889932.m3u8" },
  { n: "文成广播", u: "http://l.cztvcloud.com/channels/lantian/SXwenchengaud/128k.m3u8" },
  { n: "松阳广播", u: "http://l.cztvcloud.com/channels/lantian/SXsongyangaud/128k.m3u8" },
  { n: "火声电台", u: "https://rscdn.ajmide.com/r_3161/nglive_3161.m3u8" },
  { n: "爵士乐", u: "https://ec3.yesstreaming.net:3455/stream" },
  { n: "锦州综合频道", u: "https://srs.beijihainews.com.cn/video/jinzhou1/index.m3u8" },
  { n: "键盘之舞", u: "https://rscdn.ajmide.com/r_3149/nglive_3149.m3u8" },
  { n: "长三角公共卫生网络电台", u: "https://rscdn.ajmide.com/r_3142/nglive_3142.m3u8" },
  { n: "雪声电台", u: "https://rscdn.ajmide.com/r_3162/nglive_3162.m3u8" },
  { n: "颍上广播电视台FM96.2", u: "https://lhttp.qtfm.cn/live/20500039/64k.mp3" },
  { n: "DukeBox Radio中国站 惠灵顿国际学校中国校区电台", u: "https://stream1.themediasite.co.uk:7006/stream" },
  { n: "云和广播", u: "http://l.cztvcloud.com/channels/lantian/SXyunheaud/128k.m3u8" },
  { n: "克拉玛依音乐广播 FM97.1", u: "https://live-news.kelamayi.com.cn/hls/k971/index.m3u8" },
  { n: "庆元广播", u: "http://l.cztvcloud.com/channels/lantian/SXqingyuanaud/128k.m3u8" },
  { n: "张家口城市生活广播", u: "https://rscdn.ajmide.com/r_1806/nglive_1806.m3u8" },
  { n: "抚顺音乐广播", u: "https://rscdn.ajmide.com/r_1801/nglive_1801.m3u8" },
  { n: "武义广播FM87.7", u: "http://l.cztvcloud.com/channels/lantian/SXwuyiaud/128k.m3u8" },
  { n: "洞头广播", u: "http://l.cztvcloud.com/channels/lantian/SXdongtouaud/128k.m3u8" },
  { n: "海口旅游交通广播", u: "https://live2.hkbtv.cn/live/fm954.m3u8" },
  { n: "温州对农广播", u: "http://lhttp.qingting.fm/live/1158/64k.mp3" },
  { n: "温州私家车音乐广播", u: "http://lhttp.qingting.fm/live/1149/64k.mp3" },
  { n: "益阳交通广播", u: "https://lhttp.qtfm.cn/live/15318153/64k.mp3" },
  { n: "连云港新农村广播", u: "https://rscdn.ajmide.com/r_2482/nglive_2482.m3u8" },
  { n: "长沙城市之声", u: "http://lhttp.qingting.fm/live/4237/64k.mp3" },
  { n: "青田广播", u: "http://l.cztvcloud.com/channels/lantian/SXqingtianaud/128k.m3u8" },
  { n: "马鞍山生活故事广播", u: "https://rscdn.ajmide.com/r_139/nglive_139.m3u8" },
  { n: "丽水交通音乐广播", u: "https://rscdn.ajmide.com/r_2869/nglive_2869.m3u8" },
  { n: "乐游广播", u: "https://rscdn.ajmide.com/r_3834/nglive_3834.m3u8" },
  { n: "大连老友之声广播", u: "https://livepull.dlrm.cn/dlrm/0f7ecdf4-629d-458a-ab20-bfdb6618cec3.m3u8?txSecret=f211e4ab812934736a9f6f9f5bc16db120c49ee0a75220fed3db295ea1ca8fa5&txTime=8FAFDD5C" },
  { n: "安阳音乐生活广播", u: "https://lhttp.qtfm.cn/live/2123/64k.mp3" },
  { n: "抚顺经济交通广播", u: "https://rscdn.ajmide.com/r_1798/nglive_1798.m3u8" },
  { n: "榆林生活资讯", u: "https://cb31e2526da6f06f5ceb3048d5a98912.livehwc4.com/hplayer1.juyun.tv/camera/115986128.m3u8?sub_m3u8=true&edge_slice=true&user_session_id=5ca63976d6141ee4ed1886f51c99e944" },
  { n: "温岭1036·温岭人民广播电台", u: "http://lhttp.qingting.fm/live/4567/64k.mp3" },
  { n: "苍南广播", u: "http://l.cztvcloud.com/channels/lantian/SXcangnanaud/128k.m3u8" },
  { n: "衢江广播", u: "http://l.cztvcloud.com/channels/lantian/SXqujiangaud/128k.m3u8" },
  { n: "西藏交通文旅广播", u: "http://satellitepull.cnr.cn/live/wxxzdsshgb/playlist.m3u8?wsSession=51c2a224185caba966715acd-174700953160318&wsIPSercert=5bb043949891952939522be8c9bd5410" },
  { n: "金华交通音乐广播", u: "https://rscdn.ajmide.com/r_1345/nglive_1345.m3u8" },
  { n: "金华对农广播", u: "https://rscdn.ajmide.com/r_1348/nglive_1348.m3u8" },
  { n: "钦州音乐广播", u: "https://stream.gxqzxw.com/aac_audio889/playlist.m3u8" },
  { n: "银川交通音乐广播", u: "https://rscdn.ajmide.com/r_1199/nglive_1199.m3u8" },
  { n: "银川都市经济广播", u: "https://rscdn.ajmide.com/r_1284/nglive_1284.m3u8" },
  { n: "马鞍山交通音乐广播", u: "https://rscdn.ajmide.com/r_2212/nglive_2212.m3u8" },
];

/* ponytail: 列表热路径预计算——格式徽标/行样式只算一次；此前每行每次渲染跑 2 个正则+建 2 个样式对象，1908 行时是搜索卡顿的主源 */
const _RE_HLS = /\.m3u8(\?|$)/i, _RE_AAC = /\.aacp?(\?|$)/i, _RE_OGG = /\.ogg(\?|$)/i;
const FMT = STATIONS.map(function (st) {
  if (_RE_HLS.test(st.u)) return 'HLS';
  if (_RE_AAC.test(st.u)) return 'AAC';
  if (_RE_OGG.test(st.u)) return 'OGG';
  return '';
});
/* ponytail: 分页常数=一屏行数（34px 行高×5 行恰好填满 240×320 列表页内容区） */
const PAGE = 5;
const ROW_NAME = { color: '#e6edf3', fontSize: '13px', fontWeight: 'normal', flex: 1, lines: 1, textOverflow: 'ellipsis' };
const ROW_NAME_SEL = { color: '#79c0ff', fontSize: '13px', fontWeight: 'bold', flex: 1, lines: 1, textOverflow: 'ellipsis' };

export default {
  data() {
    return {
      STATIONS: STATIONS,
      total: STATIONS.length,
      idx: 0,
      stName: STATIONS[0].n,
      playing: false,
      stateText: '按播放键开始收听',
      stateColor: '#8b949e',
      spec: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      peak: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      view: 'main',
      randomMode: false,
      volumeLevel: 50,
      volumePresets: [0, 20, 40, 60, 80, 100],
      sleepLabel: '',
      settingsOpen: false,
      quickVolOpen: false,
      tab: 'all',
      kw: '',
      favs: {},
      vizStyle: 0,
      vizStyles: ['双向镜像', '经典柱状', 'LED点阵', '峰值山峰', '动感波峰', '环形雷达', '瀑布流', '粒子散落', '分贝电平'],
      dbmValL: 0,
      dbmValR: 0,
      dbmPeakL: 0,
      dbmPeakR: 0,
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
      rs: ROW_NAME_SEL,
      searching: false,
      pg: 0
    };
  },

  created() {
    const self = this;
    this._sp = new soundPlayerModule.SoundPlayer();
    this._masterVolume = 50;
    this._volumeRestored = false;
    // 启动 2 号方案轻量音频能量探针
    try {
      process.exec('sh', ['-c', 'ps | grep -v grep | grep -q e6_sound_meter || (start-stop-daemon -S -b -x /userdisk/e6_sound_meter || nohup /userdisk/e6_sound_meter </dev/null >/dev/null 2>&1 &)']);
    } catch (e) {}
    try {
      this._volume = new volumeModule.Volume();
      if (this._volume.callBackVolumeValue && this._volume.callBackVolumeValue.on) {
        this._volume.callBackVolumeValue.on(function (v) {
          const n = Number(v);
          if (isNaN(n) || n < 0 || n > 100) return;
          self._masterVolume = n;
          self.volumeLevel = n;
          if (!self._volumeRestored) {
            self._volumeRestored = true;
            process.exec('sh', ['-c', 'cat /userdisk/radio_volume.txt 2>/dev/null'], { timeout: 2000 }).then(function (r) {
              const saved = parseInt(String((r && r.stdout) || '').trim(), 10);
              if (!isNaN(saved) && saved >= 0 && saved <= 100 && self._volume) {
                self._masterVolume = saved;
                self.volumeLevel = saved;
                self._volume.setVolume(saved);
              }
            }).catch(function () {});
          }
        });
      }
      this._volume.getVolume();
    } catch (e) { this._volume = null; }
    this._radioSettingsIO = {
      load: async function (path) {
        const result = await process.exec('sh', ['-c', 'cat ' + path + ' 2>/dev/null'], { timeout: 3000 });
        return result && result.stdout;
      },
      save: function (path, value) {
        const request = process.exec('sh', ['-c', "echo '" + value + "' > " + path]);
        if (request && request.catch) request.catch(function () {});
      }
    };
    RadioSettings.load(this._radioSettingsIO).then(function (settings) { RadioSettings.apply(self, settings); });
    this._rows = null; this._rowsSig = ''; this._favSeq = 0;  // listItems 记忆化（非响应式）

    this.applyColorLut(this.colorTheme || 'rainbow');
    this._specHist = [];   // 瀑布历史帧（每帧 unshift 当前 spec，保留 3 帧）

    /* 读收藏（/userdisk/radio_fav.txt，逗号分隔的台号） */
    try {
      console.warn('[radio] loadFavs start');
      const pr = process.exec('sh', ['-c', 'cat /userdisk/radio_fav.txt 2>/dev/null'], { timeout: 5000 });
      if (pr && pr.then) pr.then(function (r) {
        const f = {};
        const out = r && r.stdout ? String(r.stdout) : '';
        console.warn('[radio] favs raw: [' + out + ']');
        const parts = out.replace(/\s+/g, '').split(',');
        for (let i = 0; i < parts.length; i++) {
          const v = parseInt(parts[i], 10);
          if (!isNaN(v) && v >= 0 && v < STATIONS.length) f[v] = true;
        }
        self.favs = f;
        self._favSeq = (self._favSeq || 0) + 1;  // 失效列表缓存
      }, function (rej) { console.warn('[radio] loadFavs rejected: ' + rej); });
      else console.warn('[radio] loadFavs no promise: ' + typeof pr);
    } catch (e) { console.warn('[radio] loadFavs err: ' + e); }

    /* 读上次收听的电台；等按需启动的 SoundPlayer 就绪后再开始拉流。 */
    try {
      const prLast = process.exec('sh', ['-c', 'cat /userdisk/radio_last.txt 2>/dev/null'], { timeout: 3000 });
      if (prLast && prLast.then) {
        prLast.then(function (r) {
          const out = r && r.stdout ? String(r.stdout).trim() : '';
          const lastIdx = parseInt(out, 10);
          if (!isNaN(lastIdx) && lastIdx >= 0 && lastIdx < STATIONS.length) {
            self.idx = lastIdx;
            self.stName = STATIONS[lastIdx].n;
          }
          self.startPlayback();
        }, function () {
          self.startPlayback();
        });
      } else {
        self.startPlayback();
      }
    } catch (e) {
      self.startPlayback();
    }

    try {
      const Ctor = buttonEventModule.ButtonEvent || buttonEventModule.buttonEvent;
      const be = new Ctor();
      this._be = be;
      if (be.setButtonEventReady) be.setButtonEventReady(true);

      const onBack = () => {
        console.warn('[radio] 物理按键触发: 上一首 (Back)');
        if (self.settingsOpen) { self.closeSettings(); return; }
        if (self.view === 'list') {
          if (self.pg > 0) { self.turnPage(-1); } else { self.view = 'main'; }
          return;
        }
        self.cut(-1);
      };
      const onForward = () => {
        console.warn('[radio] 物理按键触发: 下一首 (Forward)');
        if (self.view === 'list') { self.turnPage(1); return; }
        self.cut(1);
      };
      const onPlay = () => {
        console.warn('[radio] 物理按键触发: 播放/暂停 (Play/Home)');
        self.toggle();
      };

      const bindSig = (sig, fn) => {
        if (!sig) return;
        if (typeof sig.on === 'function') {
          sig.on(fn);
        } else if (typeof sig.connect === 'function') {
          sig.connect(fn);
        }
      };

      bindSig(be.backButtonClick, onBack);
      bindSig(be.forwardButtonClick, onForward);
      bindSig(be.playButtonClick, onPlay);
      const adjustVolume = (direction) => {
        const current = this._masterVolume;
        const target = Math.max(0, Math.min(100, current + direction));
        try { if (this._volume) this._volume.setVolume(target); } catch (e) {}
        this._masterVolume = target;
        this.volumeLevel = target;
        process.exec('sh', ['-c', 'echo ' + target + ' > /userdisk/radio_volume.txt']);
      };
      bindSig(be.volumeUpButtonClick, () => adjustVolume(1));
      bindSig(be.volumeDownButtonClick, () => adjustVolume(-1));
      console.warn('[radio] 物理按键(上一首/下一首/播放暂停)监听就绪');
    } catch (e) {
      console.warn('[radio] buttonEvent 注册异常: ' + e);
    }

    // 2 号方案：轮询真实音频帧能量文件 /tmp/e6_spec.raw
    this._realSpec = null;
    this._lastRealSpecTime = 0;
    this._specPoll = setInterval(function () {
      if (self.view !== 'main' || self.settingsOpen || !self.playing) return;
      process.exec('sh', ['-c', 'cat /tmp/e6_spec.raw 2>/dev/null'], { timeout: 300 }).then(function (r) {
        const out = (r && r.stdout) ? String(r.stdout).trim() : '';
        if (out) {
          const parts = out.split(',');
          if (parts.length === 16) {
            const vals = [];
            for (let k = 0; k < 16; k++) {
              vals.push(parseFloat(parts[k]) || 0.08);
            }
            self._realSpec = vals;
            self._lastRealSpecTime = Date.now();
          }
        }
      }).catch(function () {});
    }, 120);

    this._wave = setInterval(function () {
      if (self.view !== 'main' || self.settingsOpen) return;
      const cur = self.spec;
      if (!self.playing) {
        // 暂停时保持微波底纹，界面始终活泼美观且结构完全统一
        const rst = [];
        const rst2 = [];
        const t = Date.now() / 600;
        for (let i = 0; i < 16; i++) {
          const calm = 0.08 + Math.sin(t + i * 0.45) * 0.035;
          rst.push(calm);
          rst2.push(calm);
        }
        self.spec = rst;
        self.peak = rst2;
        return;
      }

      // 2 号方案真实音频随动：优先消费来自网络流的瞬时真实频带能量
      const isRealFresh = self._realSpec && (Date.now() - (self._lastRealSpecTime || 0) < 800);
      const next = [];
      for (let i = 0; i < 16; i++) {
        let target;
        if (isRealFresh) {
          target = self._realSpec[i];
        } else {
          const r = Math.random();
          target = r * r;
        }
        next.push(target > cur[i] ? (cur[i] * 0.25 + target * 0.75) : cur[i] * 0.84);
      }
      // 相邻平滑：有机律动
      const sm = [];
      for (let j = 0; j < 16; j++) {
        const l = j > 0 ? next[j - 1] : next[j];
        const r2 = j < 15 ? next[j + 1] : next[j];
        sm.push((l + 2 * next[j] + r2) / 4);
      }
      self.spec = sm;
      // 瀑布历史：unshift 当前帧，保留最近 3 帧
      self._specHist.unshift(sm.slice());
      if (self._specHist.length > 3) self._specHist.length = 3;
      // 峰值：只升不降（命中新高即顶），每帧缓降 0.025
      const pk = [];
      for (let k2 = 0; k2 < 16; k2++) {
        const p0 = self.peak[k2] || 0;
        pk.push(sm[k2] > p0 ? sm[k2] : Math.max(0, p0 - 0.025));
      }
      self.peak = pk;

      // 分贝仪表（dBFS Peak Meter）：动态 100% 内分布，起伏丰富，绝不顶天
      let eL = 0, eR = 0;
      for (let k = 0; k < 8; k++) eL += (sm[k] || 0);
      for (let k = 8; k < 16; k++) eR += (sm[k] || 0);
      const rawAvgL = eL / 8;
      const rawAvgR = eR / 8;

      if (!self.playing) {
        self.dbmValL = 0;
        self.dbmValR = 0;
        self.dbmPeakL = Math.max(0, (self.dbmPeakL || 0) - 0.04);
        self.dbmPeakR = Math.max(0, (self.dbmPeakR || 0) - 0.04);
      } else {
        // 对数分贝曲线 (-60dB 到 0dB)，常规在 35% ~ 75% 绿黄区域浮动，强重音/高潮冲击 85%~92% 红区，绝不顶死
        const dbL = Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(0.0005, rawAvgL))));
        const dbR = Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(0.0005, rawAvgR))));
        // 映射到 0.06 ~ 0.92 的动态区间
        const normL = Math.max(0.06, Math.min(0.92, (dbL + 46) / 48));
        const normR = Math.max(0.06, Math.min(0.92, (dbR + 46) / 48));

        self.dbmValL = normL;
        self.dbmValR = normR;
        self.dbmPeakL = normL > (self.dbmPeakL || 0) ? normL : Math.max(0, (self.dbmPeakL || 0) - 0.02);
        self.dbmPeakR = normR > (self.dbmPeakR || 0) ? normR : Math.max(0, (self.dbmPeakR || 0) - 0.02);
      }
    }, 120);
  },

  beforeDestroy() {
    if (this._specClickTimer) clearTimeout(this._specClickTimer);
    if (this._wave) clearInterval(this._wave);
    if (this._specPoll) clearInterval(this._specPoll);
    this.stopAll();
  },

  destroyed() {
    if (this._specClickTimer) clearTimeout(this._specClickTimer);
    if (this._wave) clearInterval(this._wave);
    if (this._specPoll) clearInterval(this._specPoll);
    this.stopAll();
  },

  methods: {
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
        width: '46px',
        height: '32px',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: active ? '#1f6feb' : '#21262d',
        borderRadius: '6px',
        marginBottom: '6px',
        borderWidth: active ? '1px' : '0px',
        borderColor: '#79c0ff'
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
      process.exec('sh', ['-c', 'echo ' + target + ' > /userdisk/radio_volume.txt']);
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
    /* 律动控件点击（单击播/停，双击切换律动动效） */
    onSpecClick() {
      if (this._swiped) {
        this._swiped = false;
        return;
      }
      const now = Date.now();
      const diff = now - (this._lastSpecTap || 0);
      this._lastSpecTap = now;

      if (diff > 0 && diff < 450) {
        if (this._specClickTimer) {
          clearTimeout(this._specClickTimer);
          this._specClickTimer = null;
        }
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

    /* 宽幅镜像频谱（B 方案）：上柱 80px 容器，下柱 32px，列宽 9px（16 列细致版） */
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

    /* 经典单边上柱（B 宽幅） */
    classicStyleB(i) {
      const v = this.spec[i];
      return {
        width: '9px', height: (4 + Math.round(v * 104)) + 'px',
        backgroundColor: this.playing ? this._lut[i] : '#2b3e50',
        borderTopLeftRadius: '3px', borderTopRightRadius: '3px'
      };
    },

    /* LED 点阵（B 宽幅）：每列 11 段（segIdx 顶 10 到底 0），段高 9px，点亮数 = round(v*11) */
    dotStyleB(i, s) {
      const lit = s < Math.round(this.spec[i] * 11);
      return {
        width: '9px', height: '9px', borderRadius: '2px',
        backgroundColor: lit ? (this.playing ? this._lut[i] : '#2b3e50') : '#161b22'
      };
    },

    /* 山峰（经典+峰帽）：柱体同经典，顶部挂一颗缓降的峰值点 */
    peakStyleB(i) {
      const p = this.peak[i];
      return {
        width: '9px', height: '4px', borderRadius: '2px',
        backgroundColor: this.playing ? this._lut[i] : '#2b3e50',
        marginBottom: (2 + Math.round(p * 104)) + 'px'
      };
    },

    /* 波峰（镜像加强版）：上柱用峰值驱动（比瞬时高、缓降），下柱保持瞬时镜像，
       视觉上是"主峰持久、倒影灵动"的双层律动 */
    waveUpStyle(i) {
      const v = Math.max(this.spec[i], this.peak[i]);
      return {
        width: '9px', height: (4 + Math.round(v * 76)) + 'px',
        backgroundColor: this.playing ? this._lut[i] : '#2b3e50',
        borderTopLeftRadius: '3px', borderTopRightRadius: '3px'
      };
    },

    /* 圆环：16 列绝对定位均布一圈，每列 4 段从内向外点亮 */
    radialColStyle(i) {
      const cx = 80, cy = 80, r = 62;
      const a = (i / 16) * 2 * Math.PI - Math.PI / 2;   // 从顶部开始顺时针
      const x = cx + r * Math.cos(a) - 7;   // 列宽 14，半宽 7
      const y = cy + r * Math.sin(a) - 7;
      return { position: 'absolute', left: x + 'px', top: y + 'px' };
    },

    radialDotStyle(i, s) {
      const lit = s < Math.round(this.spec[i] * 4);
      return {
        width: '10px', height: '10px', borderRadius: '5px',
        backgroundColor: lit ? (this.playing ? this._lut[i] : '#2b3e50') : '#161b22'
      };
    },

    /* 瀑布：4 行历史（row0 最新），亮度按行递减 */
    fallDotStyle(i, r, s) {
      const hist = r === 0 ? this.spec : (this._specHist && this._specHist[r - 1]) || [];
      const v = hist[i] || 0;
      const lit = s < Math.round(v * 4);
      const dim = [1, 0.75, 0.5, 0.3][r];
      let bg = '#161b22';
      if (lit) {
        if (!this.playing) {
          bg = '#2b3e50';
        } else {
          const c = this._lutRgb ? this._lutRgb[i] : null;
          if (c) {
            bg = 'rgb(' + Math.round(c[0] * dim) + ',' + Math.round(c[1] * dim) + ',' + Math.round(c[2] * dim) + ')';
          } else {
            bg = this._lut[i];
          }
        }
      }
      return { width: '9px', height: '9px', borderRadius: '2px', backgroundColor: bg };
    },

    /* 粒子：柱顶撒 0-4 颗小点，点亮数 = round(v*4) */
    partDotStyle(i, s) {
      const lit = s < Math.round(this.spec[i] * 4);
      return {
        width: '4px', height: '4px', borderRadius: '2px',
        backgroundColor: lit ? (this.playing ? this._lut[i] : '#2b3e50') : '#161b22',
        marginBottom: '3px'
      };
    },

    /* 列表页 */
    openList() {
      console.warn('[radio] openList hit, view=', this.view);
      this.kw = '';
      this.pg = 0;
      this.searching = false;
      this.view = 'list';
    },

    closeList() {
      this.searching = false;
      this.view = 'main';
    },

    startSearch() {
      this.searching = true;
      const self = this;
      setTimeout(function () {
        try {
          if (self.$refs.searchInput && self.$refs.searchInput.focus) {
            self.$refs.searchInput.focus();
          }
        } catch (e) { /* ignore */ }
      }, 60);
    },

    cancelSearch() {
      this.kw = '';
      this.searching = false;
      this.pg = 0;
      try {
        if (this.$refs.searchInput && this.$refs.searchInput.blur) {
          this.$refs.searchInput.blur();
        }
      } catch (e) { /* ignore */ }
    },

    onSearchBlur() {
      if (!this.kw) {
        this.searching = false;
      }
    },

    setTab(t) { this.tab = t; this.pg = 0; },

    onKw(e) {
      this.kw = e && e.value !== undefined ? String(e.value) : '';
      this.pg = 0;
    },

    /* 分页：每页 PAGE 行；页面数据从记忆化结果切片 */
    pageCount() {
      return Math.max(1, Math.ceil(this.listItems().length / PAGE));
    },
    pageItems() {
      const all = this.listItems();
      const pages = Math.max(1, Math.ceil(all.length / PAGE));
      if (this.pg >= pages) this.pg = pages - 1;   // 过滤/取消收藏后页码收敛
      if (this.pg < 0) this.pg = 0;
      const s = this.pg * PAGE;
      return all.slice(s, s + PAGE);
    },
    turnPage(d) {
      const pages = Math.max(1, Math.ceil(this.listItems().length / PAGE));
      const np = this.pg + d;
      if (np < 0 || np >= pages) return;
      this.pg = np;
    },
    /* 上下滑动翻页（手势阈值 30px，沿用 snake/tetris 的触点取法） */
    onPageTS(e) {
      const p2 = this.posOf(e);
      this._sy = p2.y; this._sx = p2.x;
    },
    onPageTE(e) {
      const p2 = this.posOf(e);
      const dy = p2.y - (this._sy || 0), dx = p2.x - (this._sx || 0);
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

    listItems() {
      /* 记忆化：模板 3 处调用共享一次计算；sig 覆盖 kw/tab/收藏变化 */
      const kw = this.kw ? String(this.kw) : '';
      const sig = this.tab + '\u0001' + kw + '\u0001' + (this._favSeq || 0);
      if (sig === this._rowsSig && this._rows) return this._rows;
      const favOnly = this.tab === 'fav';
      const out = [];
      for (let i = 0; i < this.STATIONS.length; i++) {
        if (favOnly && !this.favs[i]) continue;
        if (kw && this.STATIONS[i].n.indexOf(kw) < 0 && String(i + 1).indexOf(kw) < 0) continue;
        out.push({ gi: i, n: this.STATIONS[i].n, fmt: FMT[i], fav: !!this.favs[i] });
      }
      this._rowsSig = sig;
      this._rows = out;
      return out;
    },

    async playStation(gi) {
      this.idx = gi;
      this.stName = this.STATIONS[gi].n;
      this.saveLastStation(this.idx);
      if (this.colorTheme === 'random') this.applyColorLut('random');
      await this.startPlayback();
      this.searching = false;
      this.view = 'main';

      // ★★★【核心安全机制：切台/播放二次安全重试与补发拉流】★★★
      // 警示：以后绝对不可擅自删除此段逻辑！
      // 原因：列表点选切台同样需要 2000ms 安全补发保障弱网与旧连接释放间隙的起播成功率。
      // 严格保证：此处纯粹只调用 this.startPlayback() 重新拉流，绝不触碰任何硬件音量或修改音量状态！
      const stationIndex = this.idx;
      setTimeout(() => {
        if (this.idx !== stationIndex || this.view !== 'main' || this.settingsOpen) return;
        console.warn('[radio] 列表切台后安全补发一次拉流请求', stationIndex + 1, this.STATIONS[stationIndex].u);
        this.startPlayback();
      }, 2000);
    },

    saveLastStation(idx) {
      try {
        const p = process.exec('sh', ['-c', 'echo "' + idx + '" > /userdisk/radio_last.txt']);
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* ignore */ }
    },

    onMainTS(e) {
      const p = this.posOf(e);
      this._msx = p.x;
      this._msy = p.y;
      this._swiped = false;
    },

    onMainTE(e) {
      const p = this.posOf(e);
      const dx = p.x - (this._msx || 0);
      const dy = p.y - (this._msy || 0);
      if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
        this._swiped = true;
        if (this._specClickTimer) {
          clearTimeout(this._specClickTimer);
          this._specClickTimer = null;
        }
        this.cut(dx < 0 ? 1 : -1);
      }
    },

    tabStyle(t) {
      return {
        flex: 1, height: '30px', justifyContent: 'center', alignItems: 'center',
        backgroundColor: this.tab === t ? '#1f6feb' : '#161b22',
        borderRadius: '15px', marginLeft: '4px', marginRight: '4px'
      };
    },

    tabTextStyle(t) {
      return {
        color: this.tab === t ? '#ffffff' : '#8b949e',
        fontSize: '12px',
        fontWeight: this.tab === t ? 'bold' : 'normal'
      };
    },

    /* 收藏：整体替换 favs 引用触发重渲染，落盘 /userdisk/radio_fav.txt */
    isFav(gi) { return !!this.favs[gi]; },  // 主界面顶栏 ☆ 仍用下标判；列表行走 it.fav

    favCount() {
      let c = 0;
      for (const k in this.favs) { if (this.favs[k]) c++; }
      return c;
    },

    toggleFav(gi) {
      const f = {};
      for (const k in this.favs) { if (this.favs[k]) f[k] = true; }
      if (f[gi]) delete f[gi]; else f[gi] = true;
      this.favs = f;
      this._favSeq = (this._favSeq || 0) + 1;  // 失效列表缓存
      try {
        const keys = [];
        for (const k2 in f) keys.push(k2);
        const p = process.exec('sh', ['-c', 'echo "' + keys.join(',') + '" > /userdisk/radio_fav.txt']);
        if (p && p.catch) p.catch(function () { /* 落盘失败不影响内存态 */ });
      } catch (e) { /* ignore */ }
    },

    /* 电台转盘：offset 相对当前台（±1 为相邻台，供提示文字用） */
    dialName(off) {
      const n = this.STATIONS.length;
      return this.STATIONS[(this.idx + off + n) % n].n;
    },

    exitApp() {
      /* 退出：关后台进程 + 删模式文件（守护立即释放按键）+ 关页 */
      this._playRequestId = (this._playRequestId || 0) + 1;
      this.stopAll();
      process.exec('sh', ['-c', 'killall e6_sound_meter 2>/dev/null; rm -f /tmp/e6keys.mode /tmp/e6keyed.pid /tmp/e6_audio.url /tmp/e6_spec.raw /tmp/e6_audio_gain']);
      if (this.$page && this.$page.finish) this.$page.finish();
    },

    cut(d) {
      const n = this.STATIONS.length;
      if (this.randomMode) {
        if (n < 2) return;
        let next = this.idx;
        while (next === this.idx) next = Math.floor(Math.random() * n);
        this.idx = next;
      } else {
        this.idx = (this.idx + d + n) % n;
      }
      if (this.colorTheme === 'random') this.applyColorLut('random');
      const st = this.STATIONS[this.idx];
      this.stName = st.n;
      console.warn('[radio] 切台到', this.idx + 1, st.n, st.u);
      this.saveLastStation(this.idx);
      this.startPlayback();

      // ★★★【核心安全机制：切台/播放二次安全重试与补发拉流】★★★
      // 警示：以后绝对不可擅自删除此段逻辑！
      // 原因：RV1106 底层 SoundPlayer 在连续快速切台或网络流握手偶发超时时，
      // 首次拉流可能因旧连接尚未完全断开而无声。延时 2000ms 补发一次拉流请求，
      // 能极大提高弱网/切台的起播成功率。
      // 严格保证：此处纯粹只调用 this.startPlayback() 重新拉流，绝不触碰任何硬件音量或修改音量状态！
      const stationIndex = this.idx;
      setTimeout(() => {
        if (this.idx !== stationIndex || this.view !== 'main' || this.settingsOpen) return;
        console.warn('[radio] 切台后安全补发一次拉流请求', stationIndex + 1, this.STATIONS[stationIndex].u);
        this.startPlayback();
      }, 2000);
    },

    async ensureSoundPlayer() {
      for (let i = 0; i < 12; i++) {
        try {
          const r = await process.exec('sh', ['-c', 'ps | grep -c [S]oundPlayer'], { timeout: 5000 });
          if (parseInt(String((r && r.stdout) || '').trim(), 10) > 0) return true;
        } catch (e) { /* 继续等待按需启动的系统播放器 */ }
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
      catch (e) { try { if (sp.stop) sp.stop(); } catch (e2) { /* ignore */ } }
      process.exec('sh', ['-c', 'rm -f /tmp/e6_audio.url /tmp/e6_spec.raw']);
    },

    playCurrent(requestId) {
      const sp = this._sp;
      const url = this.STATIONS[this.idx].u;
      try {
        const r = sp.playOnlineAudio(url);
        console.warn('[radio] playOnlineAudio(url) ret:', r, url);  // 诊断：原生静默 no-op 时留痕
        if (requestId !== this._playRequestId) return;
        this.playing = true;
        this.stateText = '播放请求已发送';
        this.stateColor = '#3fb950';
        process.exec('sh', ['-c', 'echo "' + url + '" > /tmp/e6_audio.url']);
      } catch (e1) {
        try {
          const r2 = sp.playOnlineAudio({ url: url });
          console.warn('[radio] playOnlineAudio(obj) ret:', r2, url);
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
    }
  }
};
</script>

<style scoped>
/* 深色全屏 + 彩虹频谱（布局骨架参考墨水屏收音机，配色为暗色炫彩） */
.page { width: 240px; height: 320px; background-color: #0b0e14; flex-direction: column; }
.settings-fullpage { width: 240px; height: 320px; min-height: 320px; padding-left: 12px; padding-right: 12px; background-color: #0b0e14; flex-direction: column; }
.settings-header { height: 40px; flex-direction: row; align-items: center; justify-content: space-between; }
.settings-title { color: #ffffff; font-size: 15px; font-weight: bold; }
.settings-close { color: #79c0ff; font-size: 12px; padding: 6px; }
.settings-section { margin-top: 10px; }
.volume-section { margin-top: 10px; }
.fillcol { flex: 1; flex-direction: column; }
.hairline { height: 1px; background-color: #21262d; }

.topbar {
  height: 34px; flex-direction: row; align-items: center;
  justify-content: space-between; padding-left: 12px; padding-right: 7px;
}
.topbar-title { color: #e6edf3; font-size: 13px; font-weight: bold; }
.topbar-right { flex-direction: row; align-items: center; }
.top-action {
  height: 26px; margin-left: 4px;
  justify-content: center; align-items: center;
}
.favorite-action { width: 28px; }
.text-action {
  min-width: 35px; padding-left: 5px; padding-right: 5px;
  background-color: #161b22; border-radius: 6px;
}
.settings-action { border-width: 1px; border-color: #30363d; background-color: #1c2128; }
.top-action-text { color: #79c0ff; font-size: 11px; }
.settings-action-text { color: #e6edf3; font-weight: bold; }
.close-action { width: 25px; }
.close-action-text { color: #8b949e; font-size: 15px; }
.hotzone {
  width: 30px; height: 30px; margin-left: 6px;
  justify-content: center; align-items: center;
}

.statusrow {
  margin-top: 7px; height: 20px;
  position: relative; flex-direction: row; align-items: center;
}
.status-badge {
  position: absolute; left: 12px; top: 1px;
  flex-direction: row; align-items: center;
  width: 54px; min-width: 0; flex-shrink: 0;
  padding-left: 8px; padding-right: 9px; height: 18px;
  border-radius: 9px; border-width: 1px;
}
.status-text { width: 36px; min-width: 0; lines: 1; text-overflow: ellipsis; }
.status-vol {
  position: absolute; left: 74px; top: 1px;
  width: 34px; height: 18px;
  flex-direction: row; align-items: center; justify-content: center;
  background-color: #161b22; border-radius: 9px; border-width: 1px; border-color: #30363d;
}
.status-vol-text {
  color: #c9d1d9; font-size: 10px; font-weight: bold;
}
.status-actions {
  position: absolute; right: 12px; top: 1px;
  height: 18px; flex-direction: row; align-items: center; justify-content: flex-end;
}
.settings-shortcut { width: 34px; height: 22px; justify-content: center; align-items: center; background-color: #161b22; border-radius: 5px; }

.stname-wrap {
  min-height: 42px; justify-content: center; align-items: center;
  padding-left: 12px; padding-right: 12px; margin-top: 4px;
}
.stname-big {
  color: #ffffff; font-size: 18px; font-weight: bold;
  text-align: center; lines: 2; text-overflow: ellipsis;
}

/* 宽幅频谱区：居中占用核心高度 */
.specwrap { flex: 1; justify-content: center; }
.specB {
  flex-direction: row; justify-content: space-between;
  padding-left: 8px; padding-right: 8px;
}
.specB-col { width: 14px; align-items: center; }
.specB-up { height: 80px; justify-content: flex-end; }
.specB-dn { height: 32px; }
.specB-classic {
  flex-direction: row; justify-content: space-between; align-items: flex-end;
  padding-left: 8px; padding-right: 8px; height: 112px;
}
.specB-classic-col { width: 14px; height: 112px; align-items: center; justify-content: flex-end; }
.specB-dots {
  flex-direction: row; justify-content: space-between;
  padding-left: 8px; padding-right: 8px;
}
.specB-dots-col { width: 14px; height: 108px; align-items: center; justify-content: space-between; }
.specB-wave { flex-direction: row; justify-content: space-between; padding-left: 8px; padding-right: 8px; }
.peakcol { align-items: center; justify-content: flex-end; }

/* 圆环：160×160 容器居中，16 列绝对定位均布 */
.specB-radial {
  width: 160px; height: 160px; margin-left: 40px;
  position: relative;
}
.radial-center {
  position: absolute; left: 60px; top: 60px;
  width: 40px; height: 40px; border-radius: 20px;
  background-color: #161b22;
}
.radial-col {
  width: 14px; height: 14px; justify-content: center; align-items: center;
}

/* 瀑布：4 行历史，每行 16 列 */
.specB-fall { flex-direction: column; }
.fall-row {
  flex-direction: row; justify-content: space-between;
  padding-left: 8px; padding-right: 8px; height: 28px;
}
.fall-col { width: 14px; align-items: center; justify-content: space-between; }

/* 粒子：柱顶 4 颗小点 + 经典柱 */
.partcol { align-items: center; justify-content: flex-end; }

/* 上下台导轨卡片 */
.tuner-card {
  margin-left: 12px; margin-right: 12px; margin-bottom: 12px;
  background-color: #12161f; border-width: 1px; border-color: #21262d;
  border-radius: 8px; padding-left: 8px; padding-right: 8px;
}
.tuner-item {
  height: 22px; flex-direction: row; align-items: center;
}
.tuner-tag {
  color: #79c0ff; font-size: 11px; width: 20px; font-weight: bold;
}
.tuner-name {
  color: #8b949e; font-size: 11px; flex: 1; lines: 1; text-overflow: ellipsis;
}
.tuner-div {
  height: 1px; background-color: #1c2128;
}

/* 列表页 */
.tabbar { flex-direction: row; margin-top: 8px; padding-left: 8px; padding-right: 8px; }
.searchrow { margin-top: 8px; padding-left: 8px; padding-right: 8px; }
.search-fake {
  height: 30px; background-color: #161b22;
  border-radius: 6px; padding-left: 10px; padding-right: 10px;
  flex-direction: row; align-items: center; justify-content: center;
  border-width: 1px; border-color: #21262d;
}
.search-fake-txt {
  color: #6e7681; font-size: 13px;
}
.search-active-row {
  flex-direction: row; align-items: center;
}
.searchbox {
  flex: 1; height: 30px; background-color: #161b22; color: #ffffff;
  font-size: 13px; border-radius: 6px; padding-left: 8px;
  border-width: 1px; border-color: #1f6feb;
}
.search-cancel {
  width: 44px; height: 30px; justify-content: center; align-items: center;
}
.search-cancel-txt {
  color: #79c0ff; font-size: 13px;
}
.pagebox { flex: 1; margin-top: 6px; }
.lrow {
  flex-direction: row; align-items: center; height: 34px;
  border-bottom-width: 1px; border-bottom-color: #21262d;
}
.lrow-main { flex: 1; flex-direction: row; align-items: center; height: 34px; padding-left: 12px; }
.lrow-star { width: 36px; height: 34px; justify-content: center; align-items: center; }
.lempty { height: 60px; justify-content: center; align-items: center; }
.pagebar { height: 28px; flex-direction: row; align-items: center; justify-content: center; margin-bottom: 4px; }
.pgbtn { width: 44px; height: 28px; justify-content: center; align-items: center; }
.settings-label { color: #79c0ff; font-size: 11px; margin-top: 10px; margin-bottom: 4px; }
.setting-row { height: 38px; flex-direction: row; align-items: center; justify-content: space-between; padding-left: 10px; padding-right: 10px; background-color: #161b22; border-radius: 6px; margin-top: 4px; }
.setting-name { color: #e6edf3; font-size: 12px; }
.setting-value { color: #3fb950; font-size: 12px; }
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

/* 0-10 快速音量设置弹窗 */
.quick-vol-mask {
  position: absolute;
  top: 0; left: 0;
  width: 240px; height: 320px;
  background-color: rgba(0, 0, 0, 0.72);
  justify-content: center;
  align-items: center;
  z-index: 100;
}
.quick-vol-card {
  width: 218px;
  background-color: #161b22;
  border-width: 1px;
  border-color: #30363d;
  border-radius: 10px;
  padding: 10px;
}
.quick-vol-header {
  height: 28px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.quick-vol-title {
  color: #ffffff;
  font-size: 13px;
  font-weight: bold;
}
.quick-vol-cur-wrap {
  flex-direction: row;
  align-items: baseline;
}
.quick-vol-cur-num {
  color: #79c0ff;
  font-size: 16px;
  font-weight: bold;
}
.quick-vol-cur-unit {
  color: #8b949e;
  font-size: 10px;
  margin-left: 2px;
}
.quick-vol-close {
  width: 24px;
  height: 24px;
  justify-content: center;
  align-items: center;
}
.quick-vol-close-txt {
  color: #8b949e;
  font-size: 16px;
}
.quick-vol-stepper {
  height: 30px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  margin-bottom: 8px;
  background-color: #0d1117;
  border-radius: 6px;
  padding-left: 4px;
  padding-right: 4px;
}
.quick-step-btn {
  width: 28px;
  height: 24px;
  justify-content: center;
  align-items: center;
  background-color: #21262d;
  border-radius: 4px;
}
.quick-step-txt {
  color: #79c0ff;
  font-size: 16px;
  font-weight: bold;
}
.quick-step-hint {
  color: #8b949e;
  font-size: 10px;
}
.quick-vol-grid {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
}
.quick-vol-btn {
  width: 46px;
  height: 32px;
  justify-content: center;
  align-items: center;
  margin-bottom: 6px;
  border-radius: 6px;
}
.quick-vol-done {
  background-color: #238636;
}
.quick-vol-done-txt {
  color: #ffffff;
  font-size: 11px;
  font-weight: bold;
}

/* 横向专业分贝仪表（dBFS 峰值电平表） */
.specB-dbmeter {
  width: 240px;
  height: 112px;
  justify-content: center;
  align-items: center;
}
.dbm-card {
  width: 216px;
  background-color: #11141a;
  border-width: 1px;
  border-color: #21262d;
  border-radius: 10px;
  padding-left: 8px;
  padding-right: 8px;
  padding-top: 6px;
  padding-bottom: 6px;
  flex-direction: column;
}
.dbm-scale {
  width: 200px;
  height: 14px;
  position: relative;
}
.dbm-mark {
  position: absolute;
  top: 0px;
  color: #8b949e;
  font-size: 8px;
  font-weight: normal;
}
.dbm-mark-0 {
  color: #da3633;
  font-weight: bold;
}
.dbm-ticks {
  width: 200px;
  height: 6px;
  position: relative;
  margin-top: 1px;
  margin-bottom: 2px;
}
.dbm-tick-line {
  position: absolute;
  top: 0px;
  width: 1px;
  height: 5px;
  background-color: #30363d;
}
.dbm-tick-0 {
  background-color: #da3633;
}
.dbm-bars-wrap {
  width: 200px;
  height: 22px;
  background-color: #0b0e14;
  border-radius: 4px;
  border-width: 1px;
  border-color: #30363d;
  padding: 2px;
  justify-content: space-between;
}
.dbm-channel {
  width: 194px;
  height: 7px;
  position: relative;
  border-radius: 2px;
  overflow: hidden;
  background-color: #161b22;
}
.dbm-track-bg {
  width: 194px;
  height: 7px;
  position: absolute;
  left: 0; top: 0;
  flex-direction: row;
}
.dbm-fill-clip {
  height: 7px;
  position: absolute;
  left: 0; top: 0;
  overflow: hidden;
}
.dbm-lit-inner {
  width: 194px;
  height: 7px;
  flex-direction: row;
}
.dbm-sec { height: 7px; }
.dbm-dark-green { width: 132px; background-color: #0a2712; }
.dbm-dark-yellow { width: 34px; background-color: #332400; }
.dbm-dark-red { width: 28px; background-color: #3b0d0e; }
.dbm-lit-green { width: 132px; background-color: #238636; }
.dbm-lit-yellow { width: 34px; background-color: #d29922; }
.dbm-lit-red { width: 28px; background-color: #f85149; }
.dbm-peak-line {
  position: absolute;
  top: 0px;
  width: 2px;
  height: 7px;
  background-color: #ffffff;
  border-radius: 1px;
}
.dbm-footer {
  width: 200px;
  height: 14px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}
.dbm-ch-lbl {
  color: #484f58;
  font-size: 8px;
  font-weight: bold;
}
.dbm-unit-lbl {
  color: #79c0ff;
  font-size: 8px;
  font-weight: bold;
}


</style>
