#!/usr/bin/env python3
"""
make_minso.py —— 手工构造 ARM ELF 共享库 libjsapi_e6keys.so
零 libc 依赖（纯 SVC 裸调用），uClibc dlopen 完全兼容的最简 ET_DYN。

布局（vaddr 从 0 起，PT_LOAD 覆盖整个文件）：
  0x0000 ELF header (52B)
  0x0034 Phdr PT_LOAD (32B)
  0x0054 Phdr PT_DYNAMIC (32B)
  0x0074 .text
  .rodata / .hash / .dynsym / .dynstr / .dynamic
"""
import struct

# ---------------- ARM 机器码 ----------------
# constructor（DT_INIT）：open 日志 → write → close → 返回
# js_init_module：返回 NULL（M1 占位，M2 接入 QuickJS C API）
insns = [
    ("mov r7, #5",        0xE3A07005),   # SYS_open
    ("adr r0, path",      None),         # ADD r0, pc, #off_path（打包时回填）
    ("mov r1, #0x400",    0xE3A10B01),   # O_WRONLY
    ("orr r1, r1, #0x41", 0xE3811041),   # | O_CREAT|O_APPEND = 0x441
    ("mov r2, #0x100",    0xE3A20C01),
    ("orr r2, r2, #0xA4", 0xE38200A4),   # mode 0644 = 0x1A4
    ("svc 0",             0xEF000000),
    ("mov r4, r0",        0xE1A04000),   # fd → r4
    ("adr r1, msg",       None),         # 打包时回填
    ("mov r2, #17",       0xE3A20011),
    ("mov r7, #4",        0xE3A07004),   # SYS_write
    ("svc 0",             0xEF000000),
    ("mov r7, #6",        0xE3A07006),   # SYS_close
    ("svc 0",             0xEF000000),
    ("mov pc, lr",        0xE1A0F00E),   # 返回
    ("mov r0, #0",        0xE3A00000),   # js_init_module：返回 NULL
    ("bx lr",             0xE12FFF11),
]

TEXT_OFF = 0x74
PATH = b"/tmp/e6keys_loaded.log\x00"
MSG = b"e6keys so loaded\n\x00"

text_len = 4 * len(insns)
path_off = TEXT_OFF + text_len
msg_off = path_off + len(PATH)

# ADR 回填（ADD rX, pc, #imm12）：PC = 指令地址 + 8
def adr(insn_off, target):
    off = target - (insn_off + 8)
    assert 0 <= off < 4096, f"adr offset {off:#x} out of range"
    return 0xE28F0000 | off

# insns 里 adr 的指令位置：索引 1（adr r0）与索引 8（adr r1）
insn_addrs = [TEXT_OFF + 4 * i for i in range(len(insns))]
code_words = []
pc = TEXT_OFF
for i, (name, w) in enumerate(insns):
    if w is None:
        if name == "adr r0, path":
            w = adr(insn_addrs[1], path_off)
        elif name == "adr r1, msg":
            w = adr(insn_addrs[8], msg_off)
    code_words.append(w)
    pc += 4

text = b"".join(struct.pack("<I", w) for w in code_words)
rodata = PATH + MSG

js_init_off = TEXT_OFF + 14 * 4  # 第 15 条指令：mov r0,#0（返回 NULL 的 M1 占位）

# ---------------- dynstr / dynsym / SysV hash ----------------
def elf_hash(name: bytes) -> int:
    h = 0
    for c in name:
        h = (h << 4) + c
        g = h & 0xF0
        if g:
            h ^= g >> 24
        h &= 0xFFFFFF
    return h

soname_blob = b"libjsapi_e6keys.so\x00"
dynstr = b"\x00js_init_module\x00" + soname_blob
off_js_init_module = 1
off_soname = 1 + len(b"js_init_module\x00")

nbucket, nchain = 1, 2
# SysV：bucket[0] = 首个符号索引；chain[i] = 同 bucket 下一个符号索引（0=尾）
hash_blob = struct.pack("<II", nbucket, nchain)
hash_blob += struct.pack("<I", 1)            # bucket[0] → 符号 1
hash_blob += struct.pack("<III", 0, 0, 0)    # chain[0..2]

# dynsym：Entry0 null；Entry1 js_init_module（GLOBAL FUNC，SHN_ABS）
STT_FUNC, SHN_ABS, STB_GLOBAL = 2, 0xFFF1, 1
dynsym = struct.pack("<IIIIHH", 0, 0, 0, 0, 0, 0)
dynsym += struct.pack(
    "<IIIBBH",
    1,                             # st_name → dynstr 偏移 1
    js_init_off,                   # st_value
    0,                             # st_size
    (STB_GLOBAL << 4) | STT_FUNC,  # st_info
    0,                             # st_other
    SHN_ABS,                       # st_shndx
)

# ---------------- .dynamic ----------------
DT_NULL, DT_HASH, DT_STRTAB, DT_SYMTAB, DT_STRSZ, DT_SYMENT, DT_SONAME, DT_INIT = \
    0, 4, 5, 6, 10, 11, 14, 12

dyn_entries = [
    (DT_SONAME, off_soname),
    (DT_HASH, 0),       # hash_off 占位
    (DT_STRTAB, 0),     # dynstr_off 占位
    (DT_SYMTAB, 0),     # dynsym_off 占位
    (DT_STRSZ, 0),
    (DT_SYMENT, 16),
    (DT_INIT, 0),       # init_off 占位
    (DT_NULL, 0),
]
dyn_blob = b"".join(struct.pack("<II", t, v) for t, v in dyn_entries)
dyn_len = len(dyn_blob)

# ---------------- 布局与偏移 ----------------
eh_size, ph_size = 52, 32
text_off = 0x74
rodata_off = text_off + len(text)
hash_off = rodata_off + len(rodata)
hash_len = len(hash_blob)
dynsym_off = (hash_off + hash_len + 3) & ~3
dynsym_len = len(dynsym)
dynstr_off = dynsym_off + dynsym_len
dynstr_len = len(dynstr)
dyn_off = (dynstr_off + dynstr_len + 3) & ~3
dyn_len = len(dyn_blob)
file_end = dyn_off + dyn_len

# 回填占位（dynamic 表在 blob 末尾，此时各段偏移已知）
patch = dict(dyn_entries)
blob = bytearray(file_end)

def put(off, data):
    blob[off:off + len(data)] = data

put(text_off, text)
put(rodata_off, rodata)
put(hash_off, hash_blob)
put(dynsym_off, dynsym)
put(dynstr_off, dynstr)
# 修 dynamic 表里的占位
for tag, val in [(DT_SONAME, off_soname), (DT_HASH, hash_off), (DT_STRTAB, dynstr_off),
                 (DT_SYMTAB, dynsym_off), (DT_STRSZ, len(dynstr)), (DT_SYMENT, 16),
                 (DT_INIT, TEXT_OFF), (DT_NULL, 0)]:
    ent_off = dyn_off + 8 * [e[0] for e in dyn_entries].index(tag) if tag != DT_NULL else dyn_off + 8 * (len(dyn_entries) - 1)
    blob[ent_off:ent_off + 8] = struct.pack("<II", tag, val)

# ---------------- ELF header ----------------
eh = struct.pack(
    "<4sBBBBB7xHHIIIIIHHHHHH",
    b"\x7fELF", 1, 1, 1, 0, 0,
    3,          # ET_DYN
    40,         # EM_ARM
    1,          # version
    0,          # entry
    eh_size,    # phoff
    0,          # shoff（无 section headers，dlopen 只需 program headers）
    0x05000000, # flags: EABI v5, soft-float
    eh_size, ph_size, 2, 40, 0, 0,
)

# ---------------- Program headers ----------------
def phdr(ptype, off, vaddr, filesz, memsz, flags):
    return struct.pack("<IIIIIIII", ptype, off, vaddr, vaddr, filesz, memsz, flags, 0x1000)

ph = phdr(1, 0, 0, file_end, file_end, 5)                 # PT_LOAD R+X（整文件）
ph += phdr(2, dyn_off, dyn_off, dyn_len, dyn_len, 6)      # PT_DYNAMIC RW

blob[0:eh_size] = eh
blob[eh_size:eh_size + 64] = ph

open("libjsapi_e6keys.so", "wb").write(bytes(blob))
print(f"libjsapi_e6keys.so: {len(blob)} B, DT_INIT@{TEXT_OFF:#x}, dyn@{dyn_off:#x}")
