#!/usr/bin/env python3
"""
Youdao Dictionary Pen E6 (YDLE6) - Automated AMR Packaging & Compilation Tool
Standard pipeline for building, verifying, and packaging custom MiniApps for the Falcon runtime.

The toolchain is shared with the S7 Pro family, but the E6 device set differs:
  - E6 HAS   : http, process, soundPlayer, storage, system, device, display, sqlite3, util, crypto
  - E6 LACKS : fs, file, volume, batteryInfo, buttonEvent, brightness, clipboard, vibrator
Importing a module the device does not provide aborts the whole module load
("ReferenceError: could not load module filename '<name>'"), so only import
what the E6 actually ships.
"""

import os
import sys
import json
import hashlib
import zipfile
import argparse
import subprocess
import re
from pathlib import Path

# Built-in C modules provided natively by the Falcon runtime.
# Only modules actually present on the E6 are listed; the compiler merely needs
# the names so it does not try to resolve them as local files.
FALCON_BUILTIN_MODULES = {
    "wifi", "soundPlayer", "device", "kv", "network", "system",
    "prompt", "media", "audio", "display", "storage",
    "bluetooth", "record", "tts", "ocr",
    "path", "zip", "sqlite3", "util", "http", "crypto", "miniapp",
    "net", "process", "events", "$service_proxy"
}

def get_qjsc_compiler():
    script_dir = Path(__file__).resolve().parent
    qjsc_path = script_dir / "qjsc"
    if not qjsc_path.exists():
        raise FileNotFoundError(f"QuickJS compiler (qjsc) not found at: {qjsc_path}")
    return str(qjsc_path)

def extract_imported_modules(js_code):
    """
    Find module names in 'import ... from "mod"' and 'export ... from "mod"'.
    """
    import_pattern = re.compile(r'''(?:import|export)\s+(?:.*?from\s+)?['"]([^'"]+)['"]''')
    modules = set()
    for match in import_pattern.finditer(js_code):
        mod_name = match.group(1)
        # Only take external modules, ignore relative paths starting with . or /
        if not mod_name.startswith(('.', '/')):
            modules.add(mod_name)
    return modules

def compile_js_to_bin(qjsc_bin, js_path, output_bin_path, extra_modules=None):
    """
    Compiles a JavaScript file into QuickJS 2020-07-05 ES Module bytecode (.js.bin).
    Guarantees:
      - Byte 0 is strictly 0x01 (BC_VERSION).
      - Module tag 0x0f (BC_TAG_MODULE) is generated via -m.
      - External runtime modules are declared via -M without resolving local files.
    """
    with open(js_path, "r", encoding="utf-8", errors="replace") as f:
        js_content = f.read()

    detected_modules = extract_imported_modules(js_content)
    all_modules = set(detected_modules)
    all_modules.update(FALCON_BUILTIN_MODULES)
    if extra_modules:
        all_modules.update(extra_modules)

    tmp_c_path = os.path.abspath(output_bin_path + ".tmp.c")
    js_dir = os.path.dirname(os.path.abspath(js_path))
    rel_js = os.path.basename(js_path)

    cmd = [os.path.abspath(qjsc_bin), "-m"]
    for mod in sorted(all_modules):
        cmd.extend(["-M", mod])
    cmd.extend(["-c", "-o", tmp_c_path, rel_js])

    res = subprocess.run(cmd, cwd=js_dir, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"qjsc compilation failed for '{js_path}':\n{res.stderr.strip()}")

    with open(tmp_c_path, "r", encoding="utf-8") as f:
        c_code = f.read()

    if os.path.exists(tmp_c_path):
        os.remove(tmp_c_path)

    # Find the specific C array corresponding to the target module being compiled.
    # When rel_js imports other local modules, qjsc emits bytecode for dependencies first,
    # and the target module's array (prefixed or suffixed with module name) is emitted last.
    matches = re.findall(r"const uint8_t ([^\[]+)\[\d+\] = \{([^}]+)\};", c_code, re.DOTALL)
    if not matches:
        raise ValueError(f"Could not extract bytecode array from qjsc output for '{js_path}'")

    # Target array is the last array in the generated C file (the root module being compiled)
    target_var_name, raw_hex = matches[-1]
    byte_vals = [int(x.strip(), 16) for x in raw_hex.split(",") if x.strip()]
    bin_data = bytes(byte_vals)

    # Invariant verification: byte 0 must be 0x01
    assert bin_data[0] == 0x01, f"Bytecode invariant violation: header byte is {hex(bin_data[0])}, expected 0x01"

    with open(output_bin_path, "wb") as f:
        f.write(bin_data)

    return len(bin_data)

def calculate_file_hash_and_size(file_path):
    h = hashlib.md5()
    size = 0
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
            size += len(chunk)
    return h.hexdigest(), size

def build_amr_package(src_dir, output_amr_path, generate_cert=True, extra_external_modules=None):
    """
    Assembles a complete .amr package ready for installation on the S7 Pro.
    1. Prepares file staging.
    2. Compiles all .js files to .js.bin with module tags.
    3. Populates manifest.json cert table with exact size and MD5.
    4. Bundles everything into a clean ZIP archive named .amr.
    """
    src_path = Path(src_dir).resolve()
    manifest_file = src_path / "manifest.json"

    if not manifest_file.exists():
        raise FileNotFoundError(f"manifest.json missing in project root: {manifest_file}")

    with open(manifest_file, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    qjsc_bin = get_qjsc_compiler()
    compiled_bins = []

    # 1. Compile all .js files in the project to .js.bin
    for root, _, files in os.walk(src_path):
        for f in files:
            if f.endswith(".js"):
                full_js = os.path.join(root, f)
                bin_name = f + ".bin"
                full_bin = os.path.join(root, bin_name)
                print(f"[Compiling] {os.path.relpath(full_js, src_path)} -> {bin_name}")
                compile_js_to_bin(qjsc_bin, full_js, full_bin, extra_external_modules)
                compiled_bins.append(full_bin)

    # 2. Build cert map
    cert_map = {}
    if generate_cert:
        for root, _, files in os.walk(src_path):
            for f in files:
                rel_path = os.path.relpath(os.path.join(root, f), src_path)
                # Manifest itself, output packages, and temporary files are never in the cert table
                if rel_path == "manifest.json" or f.endswith(".amr") or f.endswith(".tmp.c") or f.endswith(".c") or f == ".DS_Store":
                    continue
                # Do not include original .js source files if .js.bin is deployed
                if f.endswith(".js") and os.path.exists(os.path.join(root, f + ".bin")):
                    continue

                full_file_path = os.path.join(root, f)
                file_md5, file_size = calculate_file_hash_and_size(full_file_path)
                # Falcon PMS cert map uses forward slash paths
                normalized_rel_path = rel_path.replace("\\", "/")
                cert_map[normalized_rel_path] = {
                    "size": file_size,
                    "md5": file_md5
                }
        manifest["cert"] = cert_map
        print(f"[Cert Table] Generated {len(cert_map)} file signatures.")
    else:
        manifest["cert"] = {}
        print("[Cert Table] Left empty (Falcon PMS skips verification when cert is empty).")

    # 3. Create AMR bundle (ZIP format)
    output_path = Path(output_amr_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # Write modified manifest.json
        manifest_data = json.dumps(manifest, indent=2, ensure_ascii=False).encode("utf-8")
        zf.writestr("manifest.json", manifest_data)

        # Write all files
        for root, _, files in os.walk(src_path):
            for f in files:
                if f == "manifest.json" or f.endswith(".amr") or f.endswith(".tmp.c") or f.endswith(".c") or f == ".DS_Store":
                    continue
                # Skip source .js if compiled .js.bin exists
                if f.endswith(".js") and os.path.exists(os.path.join(root, f + ".bin")):
                    continue
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, src_path).replace("\\", "/")
                zf.write(full_path, arcname=rel_path)

    print(f"[Success] Successfully built AMR package: {output_path} ({os.path.getsize(output_path)} bytes)")
    return str(output_path)

def main():
    parser = argparse.ArgumentParser(description="Youdao E6 MiniApp AMR Builder")
    parser.add_argument("src_dir", help="MiniApp source directory containing manifest.json")
    parser.add_argument("-o", "--output", help="Output .amr file path (default: <appid>.amr)")
    parser.add_argument("--no-cert", action="store_true", help="Leave manifest cert table empty")
    parser.add_argument("-M", "--module", action="append", default=[], help="Declare external C/runtime module for qjsc")
    parser.add_argument("--deploy", action="store_true", help="Push and install onto the E6 over ADB")
    parser.add_argument("--start", action="store_true", help="Start application immediately after installation")
    parser.add_argument("--device", default=os.environ.get("E6_ADB", ""),
                        help="ADB target serial (USB serial or TCP host:port); 空=自动解析")
    args = parser.parse_args()

    manifest_path = Path(args.src_dir) / "manifest.json"
    if not manifest_path.exists():
        print(f"Error: manifest.json not found in {args.src_dir}", file=sys.stderr)
        sys.exit(1)

    with open(manifest_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    appid = meta.get("appid", "app")

    output_file = args.output if args.output else f"{appid}.amr"
    amr_path = build_amr_package(
        args.src_dir,
        output_file,
        generate_cert=not args.no_cert,
        extra_external_modules=args.module
    )

    if args.deploy:
        dev = args.device
        if not dev:
            # 自动解析：USB 优先，否则按 MAC 找当前 WiFi IP
            resolver = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools", "e6_device.sh")
            try:
                out = subprocess.run(["bash", "-c", f"source {resolver} && e6_resolve_device"],
                                     capture_output=True, text=True, timeout=120)
                dev = out.stdout.strip()
            except Exception:
                dev = ""
        if not dev:
            print("找不到 E6 的 ADB 目标（请用 --device 指定，或设置 E6_ADB 环境变量）", file=sys.stderr)
            sys.exit(1)
        remote_amr = f"/tmp/{os.path.basename(amr_path)}"

        print(f"[Deploy] adb push {amr_path} -> {dev}:{remote_amr}")
        r = subprocess.run(["adb", "-s", dev, "push", amr_path, remote_amr], capture_output=True, text=True)
        if r.returncode != 0:
            print(f"adb push failed: {r.stderr.strip()}", file=sys.stderr)
            sys.exit(1)

        print(f"[Deploy] miniapp_cli install {remote_amr}")
        install_res = subprocess.run(["adb", "-s", dev, "shell", f"miniapp_cli install {remote_amr}"],
                                     capture_output=True, text=True)
        print(install_res.stdout.strip())
        if '"ret": 0' not in install_res.stdout:
            print(f"install failed: {install_res.stdout.strip()} {install_res.stderr.strip()}", file=sys.stderr)
            sys.exit(1)

        if args.start:
            print(f"[Deploy] miniapp_cli start {appid}")
            start_res = subprocess.run(["adb", "-s", dev, "shell", f"miniapp_cli start {appid}"],
                                       capture_output=True, text=True)
            print(start_res.stdout.strip())

if __name__ == "__main__":
    main()
