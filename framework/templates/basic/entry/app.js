/*
 * 有道听力宝 E6 (YDLE6 / Hermes) · e6app 应用入口
 *
 * Falcon 入口契约（真机验证，详见 docs/MINIAPP_DEV.md）：
 *   1) 继承 $falcon.App 声明 App 类
 *   2) onLaunch 里 super 之后 useDefaultBasePageClass(MyBasePage)
 *   3) App 类赋给 $falcon.__AppClazz 并带静态 meta
 * 页面由 __loadModuleDefault 按模块名动态加载（./<name>.js）。
 */
class MyBasePage extends $falcon.Page {
  beforeVueInstantiate() {
    console.warn('[e6app] beforeVueInstantiate');
  }
}

class AppClazz extends $falcon.App {
  onLaunch(options) {
    super.onLaunch(options);
    console.warn('[e6app] App onLaunch');
    $falcon.useDefaultBasePageClass(MyBasePage);
    /* $falcon 只注入给入口模块 —— 暴露到 globalThis 供页面模块使用
       （页面里 typeof $falcon === 'undefined'，真机实测 2026-11-02） */
    globalThis.$E6 = $falcon;
  }
}

AppClazz.meta = {
  name: '{{APPNAME}}',
  version: '1.0.0',
  isSingleJsBundle: true
};

$falcon.__AppClazz = AppClazz;

$falcon.__loadModuleDefault = async function (fileName) {
  console.warn('[e6app] __loadModuleDefault', fileName);
  const mod = await import('./' + fileName + '.js');
  return mod.default;
};
