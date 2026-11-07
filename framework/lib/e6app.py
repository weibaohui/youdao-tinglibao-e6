#!/usr/bin/env python3
"""
e6app —— 有道听力宝 E6 Falcon MiniApp 开发框架 CLI

    e6app create <目录> [--name 名字] [--appid ID]   从模板创建应用工程
    e6app build  <目录>                              编译 → 打包 .amr
    e6app run    <目录>                              build + 装机 + 启动 + 截图
    e6app dev    <目录>                              监听源文件，变更即 run（WiFi 热重载）

流水线：Vue SFC / JS → qjsc 字节码 → cert 签名 → .amr → adb → 模拟器截图取证
依赖：node（SFC 编译）、miniapp/host_tools（qjsc + build_amr.py）、tools/e6_device.sh
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

FRAMEWORK = Path(__file__).resolve().parent.parent      # framework/
REPO = FRAMEWORK.parent                                  # 仓库根
HOST_TOOLS = REPO / "miniapp" / "host_tools"
DEVICE_SH = REPO / "tools" / "e6_device.sh"
NODE = "node"


def die(msg, code=1):
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(code)


def sh(cmd, **kw):
    """跑命令并透传输出；check=True 时失败即退出"""
    return subprocess.run(cmd, **kw)


def sh_out(cmd) -> str:
    r = subprocess.run(cmd, capture_output=True, text=True)
    return (r.stdout or "").strip()


def resolve_device() -> str:
    out = sh_out(["bash", "-c", f"source {DEVICE_SH} && e6_resolve_device"])
    if not out:
        die("找不到 E6 设备（USB 或局域网都不行）")
    return out


# ---------------------------------------------------------------- create

def cmd_create(args):
    proj = Path(args.dir).resolve()
    if proj.exists() and any(proj.iterdir()):
        die(f"目录已存在且非空: {proj}")
    name = args.name or proj.name
    appid = args.appid or ("80909060%08d" % (int(time.time()) % 100_000_000))

    tmpl = FRAMEWORK / "templates" / "basic"
    shutil.copytree(tmpl, proj)

    # 渲染占位符
    manifest = proj / "manifest.json"
    m = manifest.read_text(encoding="utf-8").replace("{{APPNAME}}", name).replace("{{APPID}}", appid)
    manifest.write_text(m, encoding="utf-8")
    entry = proj / "entry" / "app.js"
    entry.write_text(entry.read_text(encoding="utf-8").replace("{{APPNAME}}", name), encoding="utf-8")

    # 模板素材：图标 + 提示音（来自仓库现成素材）
    icon_src = REPO / "miniapp" / "glm_usage_app" / "app_icon.png"
    if icon_src.exists():
        shutil.copy(icon_src, proj / "app_icon.png")
    wav_src = REPO / "miniapp" / "e6_demo_app" / "assets" / "beep.wav"
    if wav_src.exists():
        (proj / "assets").mkdir(exist_ok=True)
        shutil.copy(wav_src, proj / "assets" / "chime.wav")

    print(f"✓ 工程已创建: {proj}")
    print(f"  appName = {name}")
    print(f"  appid   = {appid}")
    print("下一步:")
    print(f"  e6app run {args.dir}")


# ---------------------------------------------------------------- build

import re as _re

def inline_ui_runtime(page_text: str, runtime_src: str) -> str:
    """
    把 e6ui 运行时内联进页面模块（Falcon jsfm 每模块独立 Vue 构造器，
    跨模块组件的 $emit 事件不通 —— 2026-11-02 真机实测；同模块内一切正常）。
    运行时包进 IIFE 隔离命名，内建模块 import 提升到文件头。
    """
    body = _re.sub(r"^import .*$", "", runtime_src, flags=_re.M)
    body = _re.sub(r"export \{[^}]*\};", "", body)
    body = _re.sub(r"export default e6ui;", "", body)
    prelude = ("import http from 'http';\n"
               "import process from 'process';\n"
               "import soundPlayerModule from 'soundPlayer';\n"
               "const UI = (function(){\n")
    page_text = page_text.replace("import UI from './e6ui.js';", "")
    return prelude + body + "\nreturn e6ui;\n})();" + page_text


def compile_sfcs(proj: Path, staging: Path):
    """src/pages/*.vue → staging/<name>.js（并内联运行时层）"""
    pages = sorted((proj / "src" / "pages").glob("*.vue"))
    if not pages:
        die("src/pages/ 下没有 .vue 页面")
    runtime_src = (FRAMEWORK / "runtime" / "e6ui.js").read_text(encoding="utf-8")
    for vue in pages:
        out = staging / (vue.stem + ".js")
        r = sh([NODE, str(FRAMEWORK / "lib" / "sfc_compiler.js"),
                str(vue), str(out), "--rel-path", vue.name])
        if r.returncode != 0:
            die(f"SFC 编译失败: {vue.name}\n{r.stdout}{r.stderr}")
        if "import UI from './e6ui.js'" in out.read_text(encoding="utf-8"):
            out.write_text(inline_ui_runtime(out.read_text(encoding="utf-8"), runtime_src),
                           encoding="utf-8")
            print(f"  [inline] e6ui 运行时已内联进 {vue.stem}.js")
    # Plain ES modules in src/pages/ are compiled as separate QuickJS modules. Keep
    # page behavior (settings, data access, helpers) out of large SFC files.
    for module in sorted((proj / "src" / "pages").glob("*.js")):
        out = staging / module.name
        shutil.copy(module, out)
        print(f"  [module] {module.name}")
    return [p.stem for p in pages]


def cmd_build(args):
    proj = Path(args.dir).resolve()
    manifest_p = proj / "manifest.json"
    if not manifest_p.exists():
        die(f"不是 e6app 工程（缺 manifest.json）: {proj}")
    meta = json.loads(manifest_p.read_text(encoding="utf-8"))
    appid = meta["appid"]

    staging = proj / ".e6build" / appid
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)

    # 1) 页面 SFC
    pages = compile_sfcs(proj, staging)

    # 2) 入口（运行时层已内联进各页面模块，不再单独打包）
    shutil.copy(proj / "entry" / "app.js", staging / "app.js")

    # 3) 图标 / 资源 / manifest
    icon = proj / "app_icon.png"
    if icon.exists():
        shutil.copy(icon, staging / "app_icon.png")
    assets = proj / "assets"
    if assets.exists():
        shutil.copytree(assets, staging / "assets")
    libs = proj / "libs"
    if libs.exists():
        shutil.copytree(libs, staging / "libs")
    shutil.copy(manifest_p, staging / "manifest.json")

    # 4) qjsc 编译 + cert 签名 + .amr 打包（复用 miniapp/host_tools）
    dist = proj / "dist"
    dist.mkdir(exist_ok=True)
    amr = dist / f"{appid}.amr"
    r = sh(["python3", "-I", str(HOST_TOOLS / "build_amr.py"), str(staging), "-o", str(amr)])
    if r.returncode != 0:
        die("打包失败（见上）")

    print(f"✓ 页面: {', '.join(pages)}")
    print(f"✓ 产物: {amr} ({amr.stat().st_size} B)")
    return amr


# ---------------------------------------------------------------- run / deploy

def deploy_and_run(proj: Path, appid: str, amr: Path, want_logs=True):
    device = resolve_device()
    tap_bin = "/userdisk/e6_tap"
    print(f"→ 设备: {device}")

    # ① 盲点左上角返回箭头：若同 appid 的旧实例还驻留前台，$page.finish 让它自退
    #    （框架应用 NavBar 固定在左上角；若前台是桌面，这点是 tab 栏，无害）
    sh(["adb", "-s", device, "shell", f"{tap_bin} tap 13 17"], capture_output=True, text=True)
    time.sleep(1.5)

    r = sh(["adb", "-s", device, "push", str(amr), f"/tmp/{appid}.amr"], capture_output=True, text=True)
    if r.returncode != 0:
        die(f"push 失败: {r.stderr}")

    r = sh(["adb", "-s", device, "shell", f"miniapp_cli install /tmp/{appid}.amr"],
           capture_output=True, text=True)
    if '"ret": 0' not in (r.stdout or ""):
        die(f"install 失败: {r.stdout} {r.stderr}")
    print("✓ 已安装")

    # ② 卸载式重装防旧实例驻留：进程常驻时 start 只会把旧字节码实例调到前台
    #    （2026-11-02 实测）。先卸再装，保证 start 拉起的是新包的新实例。
    sh(["adb", "-s", device, "shell", f"miniapp_cli uninstall {appid}"],
       capture_output=True, text=True)
    r = sh(["adb", "-s", device, "shell", f"miniapp_cli install /tmp/{appid}.amr"],
           capture_output=True, text=True)
    if '"ret": 0' not in (r.stdout or ""):
        die(f"reinstall 失败: {r.stdout} {r.stderr}")

    sh(["adb", "-s", device, "shell", f"miniapp_cli start {appid}"], capture_output=True, text=True)
    print("✓ 已启动")
    time.sleep(2)
    # 固件怪癖（2026-11-02 实测）：窗口栈被占用时 start 只拉起进程不切前台，
    # 注入一次 Home 键（KEY_MENU 139）即可把新启的应用顶到前台。
    sh(["adb", "-s", device, "shell", f"{tap_bin} key home"], capture_output=True, text=True)
    time.sleep(2)

    shot_remote = "/tmp/e6app_shot.png"
    r = sh(["adb", "-s", device, "shell", f"miniapp_cli capture {shot_remote}"],
           capture_output=True, text=True)
    if '"ret": 0' not in (r.stdout or ""):
        die(f"截图失败: {r.stdout}")
    shots = proj / ".e6build" / "shots"
    shots.mkdir(parents=True, exist_ok=True)
    local = shots / f"{time.strftime('%H%M%S')}.png"
    sh(["adb", "-s", device, "pull", shot_remote, str(local)], capture_output=True)
    size = local.stat().st_size
    mark = "（318B = 纯黑，没渲染！）" if size == 318 else ""
    print(f"✓ 截图: {local} ({size} B) {mark}")

    if want_logs:
        logs = sh_out(["adb", "-s", device, "shell",
                       f"grep 'console({appid})' /userdata/applog/YD_PEN_APP.log | tail -8"])
        if logs:
            print("── 应用日志 ──")
            print(logs)
    return local


def cmd_run(args):
    amr = cmd_build(args)
    proj = Path(args.dir).resolve()
    appid = json.loads((proj / "manifest.json").read_text(encoding="utf-8"))["appid"]
    deploy_and_run(proj, appid, amr)


# ---------------------------------------------------------------- dev

def snapshot(proj: Path) -> str:
    """对参与编译的文件集合算指纹（路径+mtime+size）"""
    h = hashlib.sha1()
    roots = [proj / "src", proj / "entry", proj / "assets",
             FRAMEWORK / "runtime", proj / "app_icon.png", proj / "manifest.json"]
    for root in roots:
        if root.is_file():
            st = root.stat()
            h.update(f"{root}:{st.st_mtime_ns}:{st.st_size}".encode())
        elif root.is_dir():
            for p in sorted(root.rglob("*")):
                if p.is_file():
                    st = p.stat()
                    h.update(f"{p}:{st.st_mtime_ns}:{st.st_size}".encode())
    return h.hexdigest()


def cmd_dev(args):
    proj = Path(args.dir).resolve()
    appid = json.loads((proj / "manifest.json").read_text(encoding="utf-8"))["appid"]
    print(f"e6app dev 监听中（{proj.name}）—— 存盘即重编译部署，Ctrl+C 退出")
    last = None
    n = 0
    while True:
        try:
            cur = snapshot(proj)
            if cur == last:
                time.sleep(1)
                continue
            first = last is None
            last = cur
            if first:
                print("[dev] 初始构建…")
            else:
                print(f"\n[dev] 检测到变更 #{n}")
            try:
                amr = cmd_build(args)
                deploy_and_run(proj, appid, amr, want_logs=True)
                n += 1
            except SystemExit:
                print("[dev] 构建失败，改完文件会自动重试")
                time.sleep(1)
            except Exception as e:
                print(f"[dev] 异常: {e}")
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[dev] 退出")
            return


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(prog="e6app", description="E6 Falcon MiniApp 开发框架")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("create", help="从模板创建应用工程")
    p.add_argument("dir")
    p.add_argument("--name", help="应用名（默认取目录名）")
    p.add_argument("--appid", help="16 位 appid（默认自动生成）")

    for name in ("build", "run", "dev"):
        p = sub.add_parser(name, help={ "build": "编译打包 .amr",
                                        "run": "build + 装机 + 启动 + 截图",
                                        "dev": "监听热重载" }[name])
        p.add_argument("dir")

    args = ap.parse_args()
    if args.cmd == "create":
        cmd_create(args)
    elif args.cmd == "build":
        cmd_build(args)
    elif args.cmd == "run":
        cmd_run(args)
    elif args.cmd == "dev":
        cmd_dev(args)


if __name__ == "__main__":
    main()
