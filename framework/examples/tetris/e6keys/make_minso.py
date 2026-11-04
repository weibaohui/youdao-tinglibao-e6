#!/usr/bin/env python3
"""make_minso.py —— 手工构造 ARM ELF .so（零依赖，uClibc dlopen 兼容）"""
import struct

def elf_hash(name):
    h = 0
    for c in name:
        h = ((h << 4) + c) & 0xFFFFFFFF
        g = h & 0xF0000000
        if g:
            h ^= g >> 24
        h &= (~g) & 0xFFFFFFFF
    return h

# ================= 常量 =================
TEXT_OFF = 0x74
PATH = b"/tmp/e6keys_loaded.log\x00"
MSG = b"e6keys loaded\n\x00"
SONAME = b"libjsapi_e6keys.so\x00"

# ================= 布局（先算偏移再生成数据） =================
TEXT_SIZE = 60  # 15 条指令 × 4B
TEXT_END = TEXT_OFF + TEXT_SIZE  # 0xB0

PATH_OFF = TEXT_END
MSG_OFF = PATH_OFF + len(PATH)
HASH_OFF = (MSG_OFF + len(MSG) + 3) & ~3
DYNSYM_OFF = HASH_OFF + 12
DYNSTR_OFF = DYNSYM_OFF + 32
DYN_OFF = (DYNSTR_OFF + 38 + 3) & ~3
FILE_SIZE = DYN_OFF + 40  # dynamic 8 entries × 8B + some margin

# ================= dynstr =================
dynstr = b"\x00js_init_module\x00" + SONAME
off_js_init = 1
off_soname = 1 + len(b"js_init_module\x00")

# ================= dynsym =================
# Entry0 = null; Entry1 = js_init_module (GLOBAL FUNC)
dynsym = struct.pack("<IIIIHH", 0, 0, 0, 0, 0, 0)
dynsym += struct.pack("<IIIBBH",
    off_js_init,  # st_name = 1
    TEXT_OFF,          # st_value = constructor 起始
    0,                 # st_size
    0x12,              # st_info = GLOBAL | FUNC
    0,                 # st_other
    1,                 # st_shndx
)

# ================= SysV hash =================
h = elf_hash(b"js_init_module")
nbucket, nchain = 1, 2
hash_blob = struct.pack("<II", nbucket, nchain)
hash_blob += struct.pack("<I", 1)        # bucket[0] → sym 1
hash_blob += struct.pack("<III", 0, 0, 0) # chain[0..2]

# ================= ARM text（ADR 回填在布局确定后） =================
# 15 条指令占位
text_words = [0] * 15
# ADR 回填（PC = insn_addr + 8）
def set_adr(idx, target):
    off = target - (TEXT_OFF + idx * 4 + 8)
    text_words[idx] = 0xE28F0000 | (off & 0xFFF)

# path 字符串紧跟 .text（15*4=60 → path @ 0xB0）
# 但 text_words 的 ADR 编码需要 PATH_OFF 绝对地址
# PATH_OFF = 0xB0（在 hash 前面的区域）
# 实际上：我们把 PATH 放在 TEXT 之后紧跟的位置

# 正式指令：
# [0] mov r7,#5
# [1] adr r0,path
# [2] mov r1,#0x400
# [3] orr r1,r1,#0x41
# [4] mov r2,#0x1A4
# [5] svc 0
# [6] mov r4,r0
# [7] adr r1,msg
# [8] mov r2,#15
# [9] mov r7,#4
# [10] svc 0
# [11] mov r7,#6
# [12] svc 0
# [13] mov r0,#0
# [14] bx lr

# 回填 ADR：
# insn[1] adr r0, path → PATH_OFF
# insn[7] adr r1, msg → MSG_OFF
# ADR 编码：ADD r0, pc, #offset（正向）
# pc = TEXT_OFF + idx*4 + 8
set_adr(1, PATH_OFF)
set_adr(7, MSG_OFF)

# 正式指令（含其他指令）
text_words[0] = 0xE3A07005
text_words[2] = 0xE3A10B01
text_words[3] = 0xE3811041
text_words[4] = 0xE3A20F69
text_words[5] = 0xEF000000
text_words[6] = 0xE1A04000
text_words[8] = 0xE3A2000F
text_words[9] = 0xE3A07004
text_words[10] = 0xEF000000
text_words[11] = 0xE3A07006
text_words[12] = 0xEF000000
text_words[13] = 0xE3A00000
text_words[14] = 0xE1A0F00E

text = b"".join(struct.pack("<I", w) for w in text_words)

# ================= 组装 =================
FILE_SIZE = DYN_OFF + 64  # 预留空间
blob = bytearray(FILE_SIZE)

# .text
blob[TEXT_OFF:TEXT_OFF+TEXT_SIZE] = text
# path 字符串
blob[PATH_OFF:PATH_OFF+len(PATH)] = PATH
# msg
blob[MSG_OFF:MSG_OFF+len(MSG)] = MSG
# hash
blob[HASH_OFF:HASH_OFF+12] = hash_blob
# dynsym
blob[DYNSYM_OFF:DYNSYM_OFF+32] = dynsym
# dynstr
blob[DYNSTR_OFF:DYNSTR_OFF+len(dynstr)] = dynstr

# dynamic 表
dyn_data = [
    (4, HASH_OFF),      # DT_HASH
    (5, DYNSTR_OFF),    # DT_STRTAB
    (6, DYNSYM_OFF),    # DT_SYMTAB
    (10, len(dynstr)),  # DT_STRSZ
    (11, 16),           # DT_SYMENT
    (14, off_soname),   # DT_SONAME
    (12, TEXT_OFF),     # DT_INIT
    (0, 0),             # DT_NULL
]
for i, (t, v) in enumerate(dyn_data):
    blob[DYN_OFF + i*8:DYN_OFF + i*8 + 8] = struct.pack("<II", t, v)

# ELF header
eh = struct.pack(
    "<4sBBBBB7xHHIIIIIHHHHHH",
    b"\x7fELF", 1, 1, 1, 0, 0,
    3, 40, 1, 0,
    52, 0, 0x05000000,
    52, 32, 2, 40, 0, 0,
)
blob[0:52] = eh

# Program headers
ph1 = struct.pack("<IIIIIIII", 1, 0, 0, 0, FILE_SIZE, FILE_SIZE, 5, 0x1000)
ph2 = struct.pack("<IIIIIIII", 2, DYN_OFF, DYN_OFF, 64, 64, 6, 0, 0x1000)
blob[52:84] = ph1
blob[84:116] = ph2

open("libjsapi_e6keys.so", "wb").write(bytes(blob))
print(f"OK {FILE_SIZE}B text@{TEXT_OFF:#x} path@{PATH_OFF:#x} hash@{HASH_OFF:#x} dynsym@{DYNSYM_OFF:#x} dynstr@{DYNSTR_OFF:#x} dyn@{DYN_OFF:#x}")
