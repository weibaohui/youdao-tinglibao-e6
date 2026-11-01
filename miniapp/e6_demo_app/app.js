/*
 * 有道听力宝 E6 (YDLE6 / Hermes) · MiniApp 应用入口
 *
 * ★★★ Falcon 入口契约（实测 + 官方字节码反汇编双重确认）★★★
 *
 * Falcon 用 QuickJS 的 ES Module 模式（qjsc -m）编译 app.js / index.js，
 * 模块作用域是隔离的，**全局不存在 App()/Page() 这两个注入函数**。
 * 写成小程序风格的 `App({...})` 会在启动瞬间抛：
 *     ReferenceError: 'App' is not defined
 *     TypeError: not a function at launchApp (jsfm-nvue.js:4807)
 *
 * 正确契约（三步，缺一不可）：
 *
 *   1) 继承 $falcon.App 声明 App 类
 *   2) 在 onLaunch 里 super.onLaunch(options) 之后调用
 *      $falcon.useDefaultBasePageClass(MyBasePage) 注册默认页面基类
 *      （框架要求该类必须继承 $falcon.Page，否则抛
 *       "DefauBasePageClass must extend from $falcon.App"）
 *   3) 把 App 类赋值给 $falcon.__AppClazz，并补上静态属性 meta
 *      （框架 launchApp 会执行 Object.assign(this.$app.$meta, this.$_appInfo)，
 *        meta 缺失会抛 "TypeError: cannot convert to object"）
 *
 * $falcon 是框架实例（globalThis.$_Falcon），是全局对象，不能 import：
 *     ReferenceError: could not load module filename '$falcon'
 */

class MyBasePage extends $falcon.Page {
  /* 页面实例化前的钩子：需要预置页面级状态时在这里做 */
  beforeVueInstantiate() {
    console.warn('[E6Demo] beforeVueInstantiate');
  }
}

class AppClazz extends $falcon.App {
  onLaunch(options) {
    /* 必须先调 super：基类在这里完成 $_appInfo 等初始化 */
    super.onLaunch(options);
    console.warn('[E6Demo] App onLaunch', JSON.stringify(options));

    /* 注册默认页面基类。框架用它包装 index.js 导出的组件对象 */
    $falcon.useDefaultBasePageClass(MyBasePage);
  }

  onShow() {
    super.onShow();
    console.warn('[E6Demo] App onShow');
  }

  onHide() {
    super.onHide();
  }

  onDestroy() {
    super.onDestroy();
  }
}

/* 静态 meta：框架 launchApp 会拿它做 Object.assign，缺省会直接崩 */
AppClazz.meta = {
  name: 'E6能力秀',
  version: '1.0.0',
  isSingleJsBundle: true
};

/* 框架在 launchApp 后从 $falcon.__AppClazz 取 App 类并 new 出来 */
$falcon.__AppClazz = AppClazz;

/*
 * 页面模块动态加载器。框架 loadPage() 会调用 wxInstance.__loadModuleDefault(pageName)，
 * 返回值必须是 Page 类（或组件对象），框架据此决定是 new PageClass 还是套 BasePage。
 * pageName 由框架传入，这里做 './' + name + '.js' 的相对路径解析。
 */
$falcon.__loadModuleDefault = async function (fileName) {
  console.warn('[E6Demo] __loadModuleDefault', fileName);
  const mod = await import('./' + fileName + '.js');
  return mod.default;
};
