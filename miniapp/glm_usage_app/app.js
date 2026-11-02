/*
 * 有道听力宝 E6 (YDLE6 / Hermes) · GLM 用量查询 · 应用入口
 *
 * 入口契约与 e6_demo_app 完全一致（实测 + 官方字节码反汇编双重确认）：
 *   1) 继承 $falcon.App 声明 App 类
 *   2) onLaunch 里 super 之后 useDefaultBasePageClass(MyBasePage)
 *   3) App 类赋给 $falcon.__AppClazz 并带静态 meta
 *
 * $falcon 是全局对象（globalThis.$_Falcon），不能 import。
 */

class MyBasePage extends $falcon.Page {
  beforeVueInstantiate() {
    console.warn('[GlmUsage] beforeVueInstantiate');
  }
}

class AppClazz extends $falcon.App {
  onLaunch(options) {
    super.onLaunch(options);
    console.warn('[GlmUsage] App onLaunch', JSON.stringify(options));
    $falcon.useDefaultBasePageClass(MyBasePage);
  }

  onShow() {
    super.onShow();
  }

  onHide() {
    super.onHide();
  }

  onDestroy() {
    super.onDestroy();
  }
}

AppClazz.meta = {
  name: 'GLM用量',
  version: '1.0.0',
  isSingleJsBundle: true
};

$falcon.__AppClazz = AppClazz;

$falcon.__loadModuleDefault = async function (fileName) {
  console.warn('[GlmUsage] __loadModuleDefault', fileName);
  const mod = await import('./' + fileName + '.js');
  return mod.default;
};
