<template>
  <div class="page">
    <div class="header">
      <text :style="{color:'#ffffff',fontSize:'13px',fontWeight:'bold'}">收音机</text>
      <text :style="{color:'#8b949e',fontSize:'11px'}">{{ idx + 1 }}/{{ total }}</text>
    </div>

    <div class="main" @touchstart="onTS" @touchend="onTE">
      <text :style="{color:'#e3b341',fontSize:'10px'}">{{ stateText }}</text>
      <text :style="{color:'#ffffff',fontSize:'19px',fontWeight:'bold',marginTop:'10px'}">{{ stName }}</text>
      <text :style="{color:'#8b949e',fontSize:'9px',marginTop:'6px'}">{{ stUrl }}</text>

      <div class="wave">
        <div :style="barStyle(0)"></div>
        <div :style="barStyle(1)"></div>
        <div :style="barStyle(2)"></div>
        <div :style="barStyle(3)"></div>
        <div :style="barStyle(4)"></div>
        <div :style="barStyle(5)"></div>
        <div :style="barStyle(6)"></div>
      </div>

      <text :style="{color:'#58a6ff',fontSize:'9px',marginTop:'16px'}">上一首/下一首 或 左右滑 = 切台</text>
      <text :style="{color:'#58a6ff',fontSize:'9px',marginTop:'4px'}">播放键 或 点按 = 停止/播放</text>
    </div>
  </div>
</template>

<script>
import buttonEventModule from 'buttonEvent';
import soundPlayerModule from 'soundPlayer';
import process from 'process';
const STATIONS = [
  { n: "北京文艺广播", u: "https://lhttp.qtfm.cn/live/333/64k.mp3" },
  { n: "北京音乐广播", u: "https://lhttp.qtfm.cn/live/332/64k.mp3" },
  { n: "新疆汉语新闻广", u: "https://lhttp-hw.qtfm.cn/live/1902/64k.mp3" },
  { n: "涿州综合广播年", u: "https://lhttp.qtfm.cn/live/5021381/64k.mp3" },
  { n: "上海东广新闻资", u: "http://lhttp.qingting.fm/live/275/64k.mp3" },
  { n: "上海交通广播", u: "http://lhttp.qingting.fm/live/266/64k.mp3" },
  { n: "上海交通广播 FM1", u: "https://lhttp-hw.qtfm.cn/live/266/64k.mp3" },
  { n: "上海天气台", u: "https://lhttp.qtfm.cn/live/20500176/64k.mp3" },
  { n: "上海戏剧曲艺广", u: "https://lhttp-hw.qtfm.cn/live/269/64k.mp3" },
  { n: "上海新闻广播 FM9", u: "https://lhttp-hw.qtfm.cn/live/270/64k.mp3" },
  { n: "上海流行音乐广", u: "https://lhttp-hw.qtfm.cn/live/274/64k.mp3" },
  { n: "上海第一财经广", u: "https://lhttp-hw.qtfm.cn/live/276/64k.mp3" },
  { n: "上海经典金曲广", u: "https://lhttp-hw.qtfm.cn/live/273/64k.mp3" },
  { n: "上海经典音乐广", u: "https://lhttp-hw.qtfm.cn/live/267/64k.mp3" },
  { n: "上海长三角之声", u: "https://lhttp-hw.qtfm.cn/live/275/64k.mp3" },
  { n: "浦东综合广播", u: "https://lhttp-hw.qtfm.cn/live/21355/64k.mp3" },
  { n: "天津经济广播", u: "https://lhttp-hw.qtfm.cn/live/15318227/64k.mp3" },
  { n: "大足综合广播", u: "https://lhttp-hw.qtfm.cn/live/20211676/64k.mp3" },
  { n: "巴南综合广播", u: "https://lhttp.qtfm.cn/live/5022385/64k.mp3" },
  { n: "永川之声100.7", u: "https://lhttp.qtfm.cn/live/20210236/64k.mp3" },
  { n: "綦江综合广播", u: "https://lhttp.qtfm.cn/live/20500201/64k.mp3" },
  { n: "重庆都市广播", u: "https://lhttp.qtfm.cn/live/1502/64k.mp3" },
  { n: "FM98.6城市音乐广", u: "https://lhttp.qingting.fm/live/20500196/64k.mp3" },
  { n: "唐山交通文艺广", u: "https://lhttp.qtfm.cn/live/1659/64k.mp3" },
  { n: "唐山经济广播", u: "https://lhttp.qtfm.cn/live/15318431/64k.mp3" },
  { n: "崇礼综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500100/64k.mp3" },
  { n: "廊坊戏曲广播飞", u: "http://lhttp.qingting.fm/live/20211678/64k.mp3" },
  { n: "成安综合广播久", u: "https://lhttp-hw.qtfm.cn/live/20211694/64k.mp3" },
  { n: "承德综合广播", u: "https://lhttp.qtfm.cn/live/20500052/64k.mp3" },
  { n: "抗大之声", u: "https://lhttp-hw.qtfm.cn/live/20500096/64k.mp3" },
  { n: "曲阳融媒FM90.4", u: "https://lhttp-hw.qtfm.cn/live/20500219/64k.mp3" },
  { n: "秦皇岛交通广播", u: "http://lhttp.qingting.fm/live/20849/64k.mp3" },
  { n: "秦皇岛体育广播", u: "https://lhttp-hw.qtfm.cn/live/20835/64k.mp3" },
  { n: "肥乡广播电视台", u: "https://lhttp-hw.qtfm.cn/live/20500104/64k.mp3" },
  { n: "衡水文艺广播", u: "https://lhttp.qtfm.cn/live/5021857/64k.mp3" },
  { n: "辛集综合广播", u: "https://lhttp.qtfm.cn/live/5021959/64k.mp3" },
  { n: "邯郸交通广播", u: "https://lhttp.qtfm.cn/live/3950/64k.mp3" },
  { n: "邯郸新闻综合广", u: "https://lhttp.qtfm.cn/live/5072/64k.mp3" },
  { n: "邯郸音乐广播", u: "https://lhttp.qtfm.cn/live/4601/64k.mp3" },
  { n: "高阳县怀旧金曲9", u: "http://lhttp.qingting.fm/live/5021555/64k.mp3?" },
  { n: "鹿泉区FM87.3犀牛", u: "https://lhttp-hw.qtfm.cn/live/20211668/64k.mp3" },
  { n: "吕梁综合广播", u: "https://lhttp-hw.qtfm.cn/live/4020/64k.mp3" },
  { n: "垣曲人民广播电", u: "https://lhttp.qingting.fm/live/20500090/64k.mp3" },
  { n: "太原交通广播", u: "https://lhttp-hw.qtfm.cn/live/4900/64k.mp3" },
  { n: "山西广播电视台", u: "http://lhttp.qingting.fm/live/5022511/64k.mp3" },
  { n: "左云县摩天102", u: "https://lhttp.qtfm.cn/live/20212394/64k.mp3" },
  { n: "运城文艺广播", u: "https://lhttp-hw.qtfm.cn/live/1191/64k.mp3" },
  { n: "长治综合广播", u: "https://lhttp.qtfm.cn/live/5021874/64k.mp3" },
  { n: "乌海综合广播", u: "http://lhttp.qingting.fm/live/15318706/64k.mp3" },
  { n: "内蒙古交通之声", u: "https://lhttp-hw.qtfm.cn/live/1884/64k.mp3" },
  { n: "内蒙古农村牧区", u: "https://lhttp-hw.qtfm.cn/live/1888/64k.mp3" },
  { n: "内蒙古文艺之声", u: "http://lhttp.qingting.fm/live/1886/64k.mp3" },
  { n: "内蒙古蒙语广播", u: "https://lhttp-hw.qtfm.cn/live/1882/64k.mp3" },
  { n: "包头蒙语广播", u: "https://lhttp.qingting.fm/live/1891/64k.mp3" },
  { n: "呼和浩特交通广", u: "https://lhttp-hw.qtfm.cn/live/5021545/64k.mp3" },
  { n: "呼和浩特综合广", u: "https://lhttp.qingting.fm/live/5021543/64k.mp3" },
  { n: "巴彦淖尔综合广", u: "https://lhttp.qtfm.cn/live/1893/64k.mp3" },
  { n: "赤峰蒙语广播", u: "https://lhttp-hw.qtfm.cn/live/1897/64k.mp3" },
  { n: "鄂尔多斯蒙语综", u: "http://lhttp.qingting.fm/live/20348/64k.mp3" },
  { n: "DLR-5 大连音乐广", u: "https://lhttp.qingting.fm/live/1084/64k.mp3" },
  { n: "东港新东港广播", u: "https://lhttp-hw.qtfm.cn/live/5022186/64k.mp3" },
  { n: "凌源综合广播", u: "https://lhttp-hw.qtfm.cn/live/15318298/64k.mp3" },
  { n: "朝阳县人民广播", u: "http://lhttp.qingting.fm/live/20212211/64k.mp3" },
  { n: "桓仁电台", u: "https://lhttp-hw.qtfm.cn/live/5022699/64k.mp3" },
  { n: "绥中综合广播", u: "http://lhttp.qingting.fm/live/20211705/64k.mp3" },
  { n: "辽宁之声", u: "https://lhttp.qingting.fm/live/1103/64k.mp3?app_id=web" },
  { n: "辽宁广播电视台", u: "http://lhttp.qingting.fm/live/1102/64k.mp3" },
  { n: "辽宁经典音乐广", u: "https://lhttp-hw.qtfm.cn/live/20021/64k.mp3" },
  { n: "四平综合广播", u: "https://lhttp-hw.qtfm.cn/live/15318197/64k.mp3" },
  { n: "延吉交通之声", u: "https://lhttp-hw.qtfm.cn/live/15318331/64k.mp3" },
  { n: "松原交通文艺广", u: "https://lhttp-hw.qtfm.cn/live/20212256/64k.mp3" },
  { n: "松原大众生活", u: "https://lhttp.qtfm.cn/live/5082/64k.mp3" },
  { n: "松原新闻综合广", u: "https://lhttp-hw.qtfm.cn/live/5079/64k.mp3" },
  { n: "长春经济广播", u: "https://lhttp.qtfm.cn/live/4850/64k.mp3" },
  { n: "大庆综合广播", u: "https://lhttp.qtfm.cn/live/20500060/64k.mp3" },
  { n: "牡丹江交通广播", u: "https://lhttp.qtfm.cn/live/5022354/64k.mp3" },
  { n: "黑龙江新闻广播", u: "https://lhttp.qtfm.cn/live/4974/64k.mp3" },
  { n: "黑龙江音乐广播", u: "https://lhttp.qtfm.cn/live/4969/64k.mp3" },
  { n: "FM102.4 靖江广播", u: "https://lhttp-hw.qtfm.cn/live/15318120/64k.mp3" },
  { n: "东海综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500220/64k.mp3" },
  { n: "南通交通广播", u: "https://lhttp.qtfm.cn/live/5021533/64k.mp3" },
  { n: "南通经济广播", u: "https://lhttp.qtfm.cn/live/21327/64k.mp3" },
  { n: "吴江综合广播", u: "https://lhttp.qtfm.cn/live/5022050/64k.mp3" },
  { n: "太仓综合广播", u: "https://lhttp-hw.qtfm.cn/live/20207759/64k.mp3" },
  { n: "常州新闻综合广", u: "https://lhttp.qtfm.cn/live/2798/64k.mp3" },
  { n: "常熟市融媒体中", u: "https://lhttp-hw.qtfm.cn/live/2791/64k.mp3" },
  { n: "张家港综合广播", u: "https://lhttp.qtfm.cn/live/5021877/64k.mp3" },
  { n: "扬州江都广播", u: "https://lhttp-hw.qtfm.cn/live/5022636/64k.mp3" },
  { n: "江宁人民广播电", u: "http://lhttp.qingting.fm/live/20500075/64k.mp3" },
  { n: "江苏经典流行音", u: "https://lhttp.qtfm.cn/live/4938/64k.mp3" },
  { n: "沛县综合广播", u: "https://lhttp.qtfm.cn/live/20500173/64k.mp3" },
  { n: "海门新闻综合广", u: "https://lhttp-hw.qtfm.cn/live/5022640/64k.mp3" },
  { n: "淮安经济广播", u: "https://lhttp.qtfm.cn/live/4587/64k.mp3" },
  { n: "盐城农村广播经", u: "https://lhttp.qtfm.cn/live/20332/64k.mp3" },
  { n: "盱眙综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500051/64k.mp3" },
  { n: "苏州儿童广播", u: "http://lhttp.qingting.fm/live/2807/64k.mp3" },
  { n: "赣榆综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500216/64k.mp3" },
  { n: "邳州人民广播电", u: "http://lhttp.qingting.fm/live/2809/64k.mp3" },
  { n: "镇江交通广播", u: "https://lhttp-hw.qtfm.cn/live/3985/64k.mp3" },
  { n: "镇江文艺广播", u: "https://lhttp-hw.qtfm.cn/live/4605/64k.mp3" },
  { n: "FM105平阳电台", u: "https://lhttp-hw.qtfm.cn/live/5022624/64k.mp3" },
  { n: "FM97 舟山交通音", u: "https://lhttp.qingting.fm/live/1161/64k.mp3" },
  { n: "义乌新闻", u: "https://lhttp.qtfm.cn/live/20537/64k.mp3" },
  { n: "台州交通广播", u: "https://lhttp.qingting.fm/live/1146/64k.mp3" },
  { n: "嘉兴交通经济广", u: "https://lhttp-hw.qtfm.cn/live/1135/64k.mp3" },
  { n: "嘉兴对农广播 FM8", u: "https://lhttp-hw.qtfm.cn/live/1136/64k.mp3" },
  { n: "嘉兴综合广播 FN1", u: "https://lhttp-hw.qtfm.cn/live/1154/64k.mp3" },
  { n: "天台人民广播电", u: "https://lhttp.qingting.fm/live/5022200/64k.mp3" },
  { n: "宁波经济广播", u: "https://lhttp.qtfm.cn/live/1152/64k.mp3" },
  { n: "宁海新闻综合广", u: "https://lhttp-hw.qtfm.cn/live/5022406/64k.mp3" },
  { n: "杭州交通经济广", u: "https://lhttp.qtfm.cn/live/1133/64k.mp3" },
  { n: "杭州城市资讯广", u: "https://lhttp-hw.qtfm.cn/live/15318146/64k.mp3" },
  { n: "杭州市广播电视", u: "https://lhttp.qtfm.cn/live/1163/64k.mp3" },
  { n: "浦江人民广播电", u: "https://lhttp-hw.qtfm.cn/live/5021924/64k.mp3" },
  { n: "海宁大潮之声🌊", u: "https://lhttp.qtfm.cn/live/5022556/64k.mp3" },
  { n: "温岭1036温岭人", u: "http://lhttp.qingting.fm/live/4567/64k.mp3" },
  { n: "温州之声", u: "http://lhttp.qingting.fm/live/1155/64k.mp3" },
  { n: "温州经济生活广", u: "http://lhttp.qingting.fm/live/1157/64k.mp3" },
  { n: "湖州经济广播", u: "https://lhttp.qtfm.cn/live/2812/64k.mp3" },
  { n: "玉环综合广播", u: "https://lhttp-hw.qtfm.cn/live/20212390/64k.mp3" },
  { n: "衢州交通广播", u: "http://lhttp.qingting.fm/live/20442/64k.mp3" },
  { n: "镇海104.7 Nice FM", u: "https://lhttp-hw.qtfm.cn/live/20033/64k.mp3" },
  { n: "合肥交通信息广", u: "https://lhttp-hw.qtfm.cn/live/1960/64k.mp3" },
  { n: "天长综合频率", u: "https://lhttp-hw.qtfm.cn/live/4854/64k.mp3" },
  { n: "太和广播电视台", u: "https://lhttp-hw.qtfm.cn/live/15318579/64k.mp3" },
  { n: "安庆综合广播", u: "https://lhttp.qingting.fm/live/1965/64k.mp3" },
  { n: "安徽农村广播", u: "https://lhttp.qtfm.cn/live/1950/64k.mp3" },
  { n: "安徽戏曲广播", u: "https://lhttp.qtfm.cn/live/1952/64k.mp3" },
  { n: "安徽旅游广播", u: "https://lhttp.qtfm.cn/live/15318219/64k.mp3" },
  { n: "安徽经济广播", u: "https://lhttp.qtfm.cn/live/4916/64k.mp3" },
  { n: "宿州综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022399/64k.mp3" },
  { n: "怀远人民广播电", u: "https://lhttp-hw.qtfm.cn/live/5021993/64k.mp3" },
  { n: "阜阳交通广播", u: "https://lhttp.qtfm.cn/live/1971/64k.mp3" },
  { n: "阜阳综合广播", u: "https://lhttp.qtfm.cn/live/1970/64k.mp3" },
  { n: "三明综合广播", u: "https://lhttp.qtfm.cn/live/5022100/64k.mp3" },
  { n: "云霄综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500106/64k.mp3" },
  { n: "南安市广播电视", u: "https://lhttp-hw.qtfm.cn/live/5021731/64k.mp3" },
  { n: "南平综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022065/64k.mp3" },
  { n: "厦门经济交通广", u: "http://lhttp.qingting.fm/live/1738/64k.mp3" },
  { n: "尤溪综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022498/64k.mp3" },
  { n: "福建新闻综合广", u: "https://lhttp.qtfm.cn/live/1731/64k.mp3" },
  { n: "福建都市生活广", u: "https://lhttp.qtfm.cn/live/1736/64k.mp3" },
  { n: "诏安广播电视台", u: "https://lhttp-hw.qtfm.cn/live/20500186/64k.mp3" },
  { n: "闽侯综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500236/64k.mp3" },
  { n: "景德镇综合广播", u: "https://lhttp.qtfm.cn/live/5022025/64k.mp3" },
  { n: "江西广播电视台", u: "http://lhttp.qingting.fm/live/1802/64k.mp3" },
  { n: "江西故事广播", u: "https://lhttp.qtfm.cn/live/20500092/64k.mp3" },
  { n: "江西财经广播", u: "https://lhttp.qtfm.cn/live/5021665/64k.mp3" },
  { n: "赣州综合广播", u: "https://lhttp.qingting.fm/live/20266/64k.mp3" },
  { n: "长春少儿与老年", u: "https://lhttp.qtfm.cn/live/4984/64k.mp3" },
  { n: "中文课程朗读", u: "https://stream.zeno.fm/rnxvrexlnajvv" },
  { n: "临沂文艺广播", u: "https://lhttp.qtfm.cn/live/3995/64k.mp3" },
  { n: "城阳综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022537/64k.mp3" },
  { n: "威海交通广播FM10", u: "https://lhttp-hw.qtfm.cn/live/20671/64k.mp3" },
  { n: "威海音乐广播FM90", u: "https://lhttp-hw.qtfm.cn/live/15318612/64k.mp3" },
  { n: "寿光广播电视台", u: "https://lhttp.qtfm.cn/live/20500211/64k.mp3" },
  { n: "山东文艺广播", u: "https://lhttp.qtfm.cn/live/20238/64k.mp3" },
  { n: "山东经济广播", u: "https://lhttp.qtfm.cn/live/20236/64k.mp3" },
  { n: "成武综合广播", u: "https://lhttp-hw.qtfm.cn/live/20211637/64k.mp3" },
  { n: "无棣广播", u: "https://lhttp-hw.qtfm.cn/live/5022198/64k.mp3" },
  { n: "枣庄交通文艺广", u: "https://lhttp.qtfm.cn/live/1688/64k.mp3" },
  { n: "梁山广播电视台", u: "https://lhttp-hw.qtfm.cn/live/20500235/64k.mp3" },
  { n: "济南故事广播", u: "https://lhttp.qtfm.cn/live/1672/64k.mp3" },
  { n: "济南文艺广播", u: "http://lhttp.qingting.fm/live/1670/64k.mp3" },
  { n: "济南经济广播", u: "https://lhttp.qtfm.cn/live/1668/64k.mp3" },
  { n: "济南音乐广播", u: "https://lhttp.qtfm.cn/live/1671/64k.mp3" },
  { n: "济宁生活广播", u: "https://lhttp-hw.qtfm.cn/live/4008/64k.mp3" },
  { n: "滨城广播电视台", u: "https://lhttp.qtfm.cn/live/20500168/64k.mp3" },
  { n: "潍坊交通广播", u: "https://lhttp.qtfm.cn/live/4014/64k.mp3" },
  { n: "潍坊市潍城区 FM1", u: "https://lhttp.qtfm.cn/live/20211696/64k.mp3" },
  { n: "潍坊新闻广播", u: "https://lhttp.qtfm.cn/live/20320/64k.mp3" },
  { n: "潍坊新闻广播88.1", u: "https://lhttp.qtfm.cn/live/15318631/64k.mp3" },
  { n: "烟台交通广播", u: "https://lhttp.qtfm.cn/live/1684/64k.mp3" },
  { n: "牡丹之声", u: "https://lhttp.qtfm.cn/live/15318316/64k.mp3" },
  { n: "章丘广播电视台", u: "https://lhttp.qtfm.cn/live/20212207/64k.mp3" },
  { n: "聊城交通广播", u: "https://lhttp.qtfm.cn/live/5022263/64k.mp3" },
  { n: "聊城综合广播", u: "https://lhttp.qtfm.cn/live/5022264/64k.mp3" },
  { n: "蓬莱广播电视台", u: "https://lhttp.qtfm.cn/live/20500112/64k.mp3" },
  { n: "阳信广播电视台", u: "https://lhttp.qtfm.cn/live/5021991/64k.mp3" },
  { n: "青岛FM9.26", u: "https://lhttp.qtfm.cn/live/20176/64k.mp3" },
  { n: "兰考综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500167/64k.mp3" },
  { n: "南阳交通音乐广", u: "https://lhttp.qingting.fm/live/1212/64k.mp3" },
  { n: "卧龙区台", u: "https://lhttp.qtfm.cn/live/20500113/64k.mp3" },
  { n: "周口综合广播", u: "https://lhttp.qtfm.cn/live/20212215/64k.mp3" },
  { n: "安阳综合新闻广", u: "https://lhttp-hw.qtfm.cn/live/15318224/64k.mp3" },
  { n: "宛城都市音乐广", u: "https://lhttp.qingting.fm/live/5022725/64k.mp3" },
  { n: "平顶山交通广播", u: "https://lhttp.qtfm.cn/live/5022421/64k.mp3" },
  { n: "平顶山综合广播", u: "https://lhttp.qtfm.cn/live/5022420/64k.mp3" },
  { n: "开封综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022653/64k.mp3" },
  { n: "新乡综合广播", u: "https://lhttp.qtfm.cn/live/1228/64k.mp3" },
  { n: "河南星河音乐广", u: "http://lhttp.qingting.fm/live/20210755/64k.mp3" },
  { n: "洛阳交通广播", u: "http://lhttp.qingting.fm/live/1227/64k.mp3" },
  { n: "洛阳综合广播", u: "http://lhttp.qingting.fm/live/1225/64k.mp3" },
  { n: "漯河交通广播mp3", u: "https://lhttp-hw.qtfm.cn/live/5022452/64k.mp3" },
  { n: "焦作新闻综合广", u: "https://lhttp-hw.qtfm.cn/live/5022557/64k.mp3" },
  { n: "祥符广播919", u: "https://lhttp.qtfm.cn/live/20500156/64k.mp3" },
  { n: "许昌交通广播", u: "http://lhttp.qingting.fm/live/5022095/64k.mp3" },
  { n: "许昌综合广播", u: "https://lhttp.qtfm.cn/live/5022092/64k.mp3" },
  { n: "辉县人民广播电", u: "http://lhttp.qingting.fm/live/20207782/64k.mp3" },
  { n: "邓州综合广播", u: "https://lhttp.qtfm.cn/live/20500198/64k.mp3" },
  { n: "郑州文体旅游广", u: "https://lhttp.qtfm.cn/live/1222/64k.mp3" },
  { n: "郑州新闻综合广", u: "https://lhttp.qtfm.cn/live/1220/64k.mp3" },
  { n: "郑州经济生活广", u: "https://lhttp.qtfm.cn/live/1221/64k.mp3" },
  { n: "项城广播-国风", u: "https://lhttp-hw.qtfm.cn/live/20210757/64k.mp3" },
  { n: "鹤壁综合广播", u: "https://lhttp.qtfm.cn/live/5022055/64k.mp3" },
  { n: "云梦综合台", u: "https://lhttp.qtfm.cn/live/20500204/64k.mp3" },
  { n: "咸宁交通音乐广", u: "https://lhttp-hw.qtfm.cn/live/5068/64k.mp3" },
  { n: "咸宁综合广播", u: "https://lhttp-hw.qtfm.cn/live/5067/64k.mp3" },
  { n: "团风县广播电视", u: "https://lhttp.qtfm.cn/live/20500189/64k.mp3" },
  { n: "天门综合广播", u: "https://lhttp.qtfm.cn/live/20500199/64k.mp3" },
  { n: "孝感综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022064/64k.mp3" },
  { n: "应城市融媒体中", u: "https://lhttp-hw.qtfm.cn/live/20500227/64k.mp3" },
  { n: "湖北经典音乐广", u: "https://lhttp.qtfm.cn/live/1296/64k.mp3" },
  { n: "荆州交通广播", u: "https://lhttp.qtfm.cn/live/1312/64k.mp3" },
  { n: "荆门综合广播", u: "https://lhttp-hw.qtfm.cn/live/20211577/64k.mp3" },
  { n: "长江水上安全信", u: "https://lhttp-hw.qtfm.cn/live/5021868/64k.mp3" },
  { n: "娄底综合广播", u: "https://lhttp.qtfm.cn/live/21213/64k.mp3" },
  { n: "岳阳经济广播", u: "https://lhttp-hw.qtfm.cn/live/5022391/64k.mp3" },
  { n: "株洲交通广播", u: "https://lhttp-hw.qtfm.cn/live/3971/64k.mp3" },
  { n: "南方生活广播", u: "https://lhttp.qtfm.cn/live/468/64k.mp3" },
  { n: "广东交通之声", u: "https://lhttp.qtfm.cn/live/1262/64k.mp3" },
  { n: "江门综合广播", u: "https://lhttp-hw.qtfm.cn/live/1282/64k.mp3" },
  { n: "深圳交通广播 FM1", u: "https://lhttp.qtfm.cn/live/1286/64k.mp3" },
  { n: "深圳私家车广播", u: "https://lhttp.qtfm.cn/live/1273/64k.mp3" },
  { n: "湛江廉江广播", u: "https://lhttp-hw.qtfm.cn/live/20211578/64k.mp3" },
  { n: "湾区音乐台_鹤", u: "https://lhttp-hw.qtfm.cn/live/20500163/64k.mp3" },
  { n: "澄海电台FM100.5", u: "https://lhttp-hw.qtfm.cn/live/5022439/64k.mp3" },
  { n: "阳江综合广播", u: "https://lhttp.qtfm.cn/live/15318429/64k.mp3" },
  { n: "顺德音乐之声", u: "https://lhttp.qtfm.cn/live/20500150/64k.mp3" },
  { n: "北部湾之声 The Vo", u: "https://lhttp-hw.qtfm.cn/live/1757/64k.mp3" },
  { n: "广西文艺广播 FM9", u: "https://lhttp-hw.qtfm.cn/live/4875/64k.mp3" },
  { n: "广西综合广播", u: "https://lhttp-hw.qtfm.cn/live/1753/64k.mp3" },
  { n: "桂林旅游音乐广", u: "https://lhttp-hw.qtfm.cn/live/1760/64k.mp3" },
  { n: "桂林综合广播", u: "https://lhttp-hw.qtfm.cn/live/1759/64k.mp3" },
  { n: "贺州综合广播", u: "https://lhttp.qtfm.cn/live/5043/64k.mp3" },
  { n: "三亚旅游之声103.", u: "http://lhttp.qingting.fm/live/15318203/64k.mp3" },
  { n: "海口音乐广播", u: "https://lhttp-hw.qtfm.cn/live/20010/64k.mp3" },
  { n: "中江县年代音乐9", u: "https://lhttp.qtfm.cn/live/20500148/64k.mp3" },
  { n: "仁寿人民广播电", u: "https://lhttp-hw.qtfm.cn/live/5021453/64k.mp3" },
  { n: "德阳综合广播", u: "https://lhttp-hw.qtfm.cn/live/4987/64k.mp3" },
  { n: "成都文化休闲广", u: "https://lhttp-hw.qtfm.cn/live/4892/64k.mp3" },
  { n: "成都经济广播", u: "https://lhttp-hw.qtfm.cn/live/1121/64k.mp3" },
  { n: "眉山交通音乐广", u: "https://lhttp.qtfm.cn/live/20207781/64k.mp3" },
  { n: "眉山综合广播", u: "https://lhttp-hw.qtfm.cn/live/4027/64k.mp3" },
  { n: "绵竹综合广播", u: "https://lhttp.qingting.fm/live/15318098/64k.mp3" },
  { n: "绵阳综合广播", u: "https://lhttp.qtfm.cn/live/4024/64k.mp3" },
  { n: "苍溪人民广播电", u: "https://lhttp-hw.qtfm.cn/live/20500228/64k.mp3" },
  { n: "遂宁交通旅游广", u: "http://lhttp.qingting.fm/live/20180/64k.mp3" },
  { n: "阿坝安多藏语综", u: "https://lhttp-hw.qtfm.cn/live/20500234/64k.mp3" },
  { n: "六盘水综合广播", u: "https://lhttp.qingting.fm/live/20211616/64k.mp3" },
  { n: "安顺综合广播", u: "http://lhttp.qingting.fm/live/5022203/64k.mp3" },
  { n: "桐梓电台 综合", u: "https://lhttp-hw.qtfm.cn/live/20212410/64k.mp3" },
  { n: "贵州经济广播", u: "https://lhttp.qtfm.cn/live/20065/64k.mp3" },
  { n: "贵阳综合广播", u: "https://lhttp.qtfm.cn/live/1773/64k.mp3" },
  { n: "云南民族广播", u: "https://lhttp.qtfm.cn/live/1933/64k.mp3" },
  { n: "云南经济广播", u: "https://lhttp.qtfm.cn/live/1927/64k.mp3" },
  { n: "巧家新闻综合广", u: "https://lhttp-hw.qtfm.cn/live/20211704/64k.mp3" },
  { n: "弥勒人民广播电", u: "https://lhttp.qingting.fm/live/5022531/64k.mp3" },
  { n: "德宏综合广播", u: "https://lhttp.qingting.fm/live/5021849/64k.mp3" },
  { n: "昆明汽车广播", u: "https://lhttp.qtfm.cn/live/1936/64k.mp3" },
  { n: "昆明综合广播", u: "https://lhttp.qtfm.cn/live/1934/64k.mp3" },
  { n: "昆明老年广播", u: "https://lhttp-hw.qtfm.cn/live/1937/64k.mp3" },
  { n: "昭通交通旅游广", u: "http://lhttp.qingting.fm/live/21247/64k.mp3" },
  { n: "普洱综合广播", u: "http://lhttp.qingting.fm/live/1938/64k.mp3" },
  { n: "玉溪新闻综合广", u: "http://lhttp.qingting.fm/live/5022031/64k.mp3" },
  { n: "红河综合广播", u: "https://lhttp-hw.qtfm.cn/live/4033/64k.mp3" },
  { n: "拉萨综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022138/64k.mp3" },
  { n: "唐诗电台", u: "https://lhttp-hw.qtfm.cn/live/1603/64k.mp3" },
  { n: "安康综合广播", u: "http://lhttp.qingting.fm/live/5021861/64k.mp3" },
  { n: "渭南综合广播", u: "https://lhttp.qingting.fm/live/5022388/64k.mp3" },
  { n: "陕西农村广播", u: "https://lhttp.qtfm.cn/live/1602/64k.mp3" },
  { n: "陕西经济广播唐", u: "https://lhttp-hw.qtfm.cn/live/1603/64k.mp3" },
  { n: "陕西青少广播好", u: "https://lhttp.qtfm.cn/live/4885/64k.mp3" },
  { n: "陕西音乐广播", u: "https://lhttp.qtfm.cn/live/4873/64k.mp3" },
  { n: "韩城综合广播", u: "https://lhttp-hw.qtfm.cn/live/15318413/64k.mp3" },
  { n: "天水交通广播频", u: "https://lhttp.qtfm.cn/live/20211613/64k.mp3" },
  { n: "天水综合频道", u: "https://lhttp.qtfm.cn/live/20460/64k.mp3" },
  { n: "张掖新闻综合广", u: "http://lhttp.qingting.fm/live/5022096/64k.mp3" },
  { n: "肃州广播电视台F", u: "https://lhttp-hw.qtfm.cn/live/15318602/64k.mp3" },
  { n: "西宁交通文艺广", u: "http://lhttp.qingting.fm/live/5022283/64k.mp3" },
  { n: "青海经济广播", u: "https://lhttp-hw.qtfm.cn/live/5008/64k.mp3" },
  { n: "宁夏交通广播", u: "https://lhttp.qtfm.cn/live/1840/64k.mp3" },
  { n: "宁夏音乐广播", u: "https://lhttp.qtfm.cn/live/15318294/64k.mp3" },
  { n: "石嘴山综合广播", u: "https://lhttp-hw.qtfm.cn/live/5022563/64k.mp3" },
  { n: "五师人民广播电", u: "https://lhttp.qtfm.cn/live/20207772/64k.mp3" },
  { n: "兵团八师石河子", u: "https://lhttp-hw.qtfm.cn/live/20500118/64k.mp3" },
  { n: "兵团四师可克达", u: "https://lhttp-hw.qtfm.cn/live/20500054/64k.mp3" },
  { n: "巴音郭楞汉语综", u: "https://lhttp-hw.qtfm.cn/live/5022108/64k.mp3?" },
  { n: "新疆交通广播", u: "https://lhttp.qtfm.cn/live/1910/64k.mp3" },
  { n: "新疆维语文艺广", u: "https://lhttp.qtfm.cn/live/20639/64k.mp3" },
  { n: "新疆蒙语广播", u: "https://lhttp.qtfm.cn/live/1903/64k.mp3" },
  { n: "昌吉交通广播", u: "https://lhttp.qtfm.cn/live/20440/64k.mp3" },
  { n: "昌吉综合广播", u: "https://lhttp.qtfm.cn/live/20440/64k.mp3" },
  { n: "第三师图木舒克", u: "https://lhttp.qtfm.cn/live/20500135/64k.mp3" },
  { n: "轮台之声", u: "https://lhttp-hw.qtfm.cn/live/20500099/64k.mp3" },
  { n: "阿克苏维语综合", u: "https://lhttp-hw.qtfm.cn/live/15318551/64k.mp3" },
  { n: "50首经典古典音", u: "https://lhttp-hw.qtfm.cn/live/5022308/64k.mp3" },
  { n: "891线上音乐台", u: "https://live.fm891.net/96k.aac" },
  { n: "AsiaFM 亚洲热歌", u: "http://hot.asiafm.net:8000/asiafm" },
  { n: "AsiaFM 亚洲粤语台", u: "https://lhttp.qtfm.cn/live/15318569/64k.mp3" },
  { n: "Auto FM汽车联播网", u: "https://lhttp.qtfm.cn/live/15318569/64k.mp3" },
  { n: "FM104.1北岳之声", u: "https://lhttp-hw.qtfm.cn/live/20212209/64k.mp3" },
  { n: "三门峡交通文艺", u: "https://stream.zeno.fm/cmbjv6tml6fuv" },
  { n: "主内真生命-英语", u: "https://stream.tligradio.org/listen/english/radio.mp3" },
  { n: "信仰广播一套", u: "https://lhttp.qtfm.cn/live/5021977/64k.mp3" },
  { n: "信阳广播二套", u: "https://lhttp.qtfm.cn/live/15318156/64k.mp3" },
  { n: "动听音乐台", u: "https://lhttp-hw.qtfm.cn/live/5022107/64k.mp3" },
  { n: "动感调频FM94.3", u: "https://lhttp-hw.qtfm.cn/live/20500064/64k.mp3" },
  { n: "北海交通音乐广", u: "https://lhttp.qtfm.cn/live/20211621/64k.mp3" },
  { n: "吕梁交通广播", u: "https://lhttp-hw.qtfm.cn/live/4899/64k.mp3" },
  { n: "固镇人民广播电", u: "https://lhttp-hw.qtfm.cn/live/20500125/64k.mp3" },
  { n: "国际新闻", u: "https://lhttp.qtfm.cn/live/20500172/64k.mp3" },
  { n: "士兵突击FM", u: "https://stream.zeno.fm/vs4zinqldp2vv" },
  { n: "安阳市广播电视", u: "https://lhttp-hw.qtfm.cn/live/2138/64k.mp3" },
  { n: "定州融媒体中心", u: "https://lhttp-hw.qtfm.cn/live/20211638/64k.mp3" },
  { n: "宝鸡交通旅游广", u: "https://lhttp-hw.qtfm.cn/live/15318128/64k.mp3" },
  { n: "宝鸡综合广播", u: "https://lhttp-hw.qtfm.cn/live/15318125/64k.mp3" },
  { n: "山亭声动970", u: "https://lhttp-hw.qtfm.cn/live/20500047/64k.mp3" },
  { n: "庆云县融媒体中", u: "https://lhttp-hw.qtfm.cn/live/5022403/64k.mp3" },
  { n: "开平电台 飞扬956", u: "https://lhttp-hw.qtfm.cn/live/5037/64k.mp3" },
  { n: "张家口综合广播", u: "https://lhttp-hw.qtfm.cn/live/15318285/64k.mp3" },
  { n: "抚州交通音乐广", u: "https://lhttp-hw.qtfm.cn/live/20500015/64k.mp3" },
  { n: "故事广播-阿基", u: "https://lhttp.qtfm.cn/live/20500182/64k.mp3" },
  { n: "新余经济交通广", u: "https://lhttp-hw.qtfm.cn/live/20093/64k.mp3" },
  { n: "星空电台 STAR RADI", u: "https://lhttp-hw.qtfm.cn/live/5022379/64k.mp3" },
  { n: "昭通乌蒙之声新", u: "https://lhttp-hw.qtfm.cn/live/21249/64k.mp3" },
  { n: "柳州综合广播", u: "https://lhttp-hw.qtfm.cn/live/21043/64k.mp3" },
  { n: "梁平融媒体中心", u: "https://lhttp-hw.qtfm.cn/live/20211646/64k.mp3" },
  { n: "江陵广播电视台", u: "https://lhttp-hw.qtfm.cn/live/20500203/64k.mp3" },
  { n: "海南旅游广播", u: "https://lhttp.qtfm.cn/live/1862/64k.mp3" },
  { n: "涞水县流行音乐", u: "https://lhttp-hw.qtfm.cn/live/20211620/64k.mp3" },
  { n: "淮北交通广播", u: "https://lhttp-hw.qtfm.cn/live/20211647/64k.mp3" },
  { n: "湘乡广播电台龙", u: "https://lhttp-hw.qtfm.cn/live/15318180/64k.mp3" },
  { n: "滕州广播电视台", u: "https://lhttp-hw.qtfm.cn/live/5022611/64k.mp3" },
  { n: "磁县融媒综合广", u: "https://lhttp-hw.qtfm.cn/live/20500116/64k.mp3" },
  { n: "襄州综合广播", u: "https://lhttp-hw.qtfm.cn/live/20500108/64k.mp3" },
  { n: "霸州市融媒体中", u: "https://lhttp-hw.qtfm.cn/live/20211658/64k.mp3" },
  { n: "黑龙江老年少儿", u: "https://lhttp-hw.qtfm.cn/live/4972/64k.mp3" },
  { n: "黔西南综合广播", u: "https://lhttp-hw.qtfm.cn/live/5045/64k.mp3" }
];

export default {
  data() {
    return {
      STATIONS: STATIONS,
      total: STATIONS.length,
      idx: 0,
      stName: STATIONS[0].n,
      stUrl: STATIONS[0].u.slice(0, 34),
      playing: false,
      stateText: '按播放键开始收听',
      bars: [0, 0, 0, 0, 0, 0, 0]
    };
  },

  created() {
    const self = this;
    this._sp = new soundPlayerModule.SoundPlayer();

    try {
      process.exec('sh', ['-c',
        'P=$(find /userdisk/secondary/miniapp/data/mini_app/pkg/8090906000000007 -name e6keyed 2>/dev/null | head -1); ' +
        '[ -n "$P" ] && cp "$P" /tmp/e6keyed && chmod 755 /tmp/e6keyed; rm -f /tmp/e6keyed.pid; ' +
        'nohup /tmp/e6keyed >/dev/null 2>&1 </dev/null &'], { timeout: 8000 });
    } catch (e) { console.warn('[radio] keys daemon fail ' + e); }

    const Ctor = buttonEventModule.ButtonEvent || buttonEventModule.buttonEvent;
    const be = new Ctor();
    be.setButtonEventReady(true);
    be.backButtonClick = function () { self.cut(-1); };
    be.forwardButtonClick = function () { self.cut(1); };
    be.playButtonClick = function () { self.toggle(); };
    be.homeButtonClick = function () { self.toggle(); };

    this.keysLoop();
    this._wave = setInterval(function () {
      if (!self.playing) { self.bars = [0, 0, 0, 0, 0, 0, 0]; return; }
      const nb = [];
      for (let i = 0; i < 7; i++) nb.push(3 + Math.floor(Math.random() * 13));
      self.bars = nb;
    }, 180);
  },

  methods: {
    barStyle(i) {
      return {
        width: '5px', height: (4 + this.bars[i]) + 'px', marginRight: '4px',
        backgroundColor: this.playing ? '#3fb950' : '#30363d', borderRadius: '2px'
      };
    },

    cut(d) {
      const n = this.STATIONS.length;
      this.idx = (this.idx + d + n) % n;
      const st = this.STATIONS[this.idx];
      this.stName = st.n;
      this.stUrl = st.u.slice(0, 34);
      this.playing = true;
      this.stateText = '切台…';
      this.playCurrent();
    },

    toggle() {
      if (this.playing) {
        this.stopAll();
        this.playing = false;
        this.stateText = '已停止';
      } else {
        this.playing = true;
        this.stateText = '连接电台…';
        this.playCurrent();
      }
    },

    stopAll() {
      const sp = this._sp;
      const ms = ['quickStop', 'stop'];
      for (let i = 0; i < ms.length; i++) {
        try { if (sp[ms[i]]) sp[ms[i]](); } catch (e) { /* ignore */ }
      }
    },

    playCurrent() {
      const sp = this._sp;
      const url = this.STATIONS[this.idx].u;
      try {
        sp.playOnlineAudio(url);
        this.stateText = '正在播放';
      } catch (e1) {
        try {
          sp.playOnlineAudio({ url: url });
          this.stateText = '正在播放';
        } catch (e2) {
          this.stateText = '播放失败 ' + String(e1).slice(0, 14);
        }
      }
    },

    posOf(e) {
      try {
        const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e;
        return { x: Number(t.pageX !== undefined ? t.pageX : t.x) || 0,
                 y: Number(t.pageY !== undefined ? t.pageY : t.y) || 0 };
      } catch (err) { return { x: 0, y: 0 }; }
    },
    onTS(e) {
      const p2 = this.posOf(e);
      this._sx = p2.x; this._sy = p2.y;
    },
    onTE(e) {
      const p2 = this.posOf(e);
      const dx = p2.x - (this._sx || 0), dy = p2.y - (this._sy || 0);
      const TH = 30;
      if (Math.abs(dx) < TH && Math.abs(dy) < TH) { this.toggle(); return; }
      if (Math.abs(dx) >= Math.abs(dy)) this.cut(dx < 0 ? -1 : 1);
    },

    keysLoop() {
      const self = this;
      const tick = function () {
        process.exec('sh', ['-c',
          'PID=$(cat /tmp/e6keyed.pid 2>/dev/null); ' +
          'if [ -z "$PID" ] || [ ! -d /proc/$PID ]; then ' +
          'P=$(find /userdisk/secondary/miniapp/data/mini_app/pkg/8090906000000007 -name e6keyed 2>/dev/null | head -1); ' +
          '[ -n "$P" ] && cp "$P" /tmp/e6keyed && chmod 755 /tmp/e6keyed; rm -f /tmp/e6keyed.pid; ' +
          'nohup /tmp/e6keyed >/dev/null 2>&1 </dev/null & fi; ' +
          'cat /tmp/e6keys.buf 2>/dev/null; : > /tmp/e6keys.buf; echo 1 > /tmp/e6keys.heartbeat'],
          { timeout: 4000 }).then(function (r) {
            const out = String((r && r.stdout) || '');
            if (out) {
              const acts = out.trim().split(String.fromCharCode(10));
              for (let i = 0; i < acts.length; i++) {
                const a = acts[i];
                if (a === 'left') self.cut(-1);
                else if (a === 'right') self.cut(1);
                else if (a === 'rotate' || a === 'drop') self.toggle();
              }
            }
            setTimeout(tick, 200);
          }).catch(function () { setTimeout(tick, 400); });
      };
      tick();
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
.main { padding: 10px; }
.wave { flex-direction: row; align-items: flex-end; margin-top: 14px; height: 18px; }
</style>
