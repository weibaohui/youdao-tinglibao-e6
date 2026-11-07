/*
 * 有道听力宝 E6 (YDLE6 / Hermes) · 小电视（B站）应用入口
 *
 * Falcon 入口契约（真机验证，详见 docs/MINIAPP_DEV.md）：
 *   1) 继承 $falcon.App 声明 App 类
 *   2) onLaunch 里 super 之后 useDefaultBasePageClass(MyBasePage)
 *   3) App 类赋给 $falcon.__AppClazz 并带静态 meta
 * 页面由 __loadModuleDefault 按模块名动态加载（./<name>.js）。
 */
class MyBasePage extends $falcon.Page {
  beforeVueInstantiate() {
    console.warn('[bili] beforeVueInstantiate');
  }
}

class AppClazz extends $falcon.App {
  onLaunch(options) {
    super.onLaunch(options);
    console.warn('[bili] App onLaunch');
    $falcon.useDefaultBasePageClass(MyBasePage);
    globalThis.$E6 = $falcon;
  }
}

AppClazz.meta = {
  name: '小电视',
  version: '0.1.0',
  isSingleJsBundle: true
};

$falcon.__AppClazz = AppClazz;

$falcon.__loadModuleDefault = async function (fileName) {
  console.warn('[bili] __loadModuleDefault', fileName);
  const mod = await import('./' + fileName + '.js');
  return mod.default;
};
