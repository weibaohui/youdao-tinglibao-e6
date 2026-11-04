/*
 * e6keys 探测版（M2 前哨）—— 验证：
 *   1. constructor 在 dlopen 时触发（写 /tmp/e6keys_probe.log）
 *   2. dlsym(RTLD_DEFAULT) 能解析宿主进程的 QuickJS C API 符号
 *   3. js_init_module 被 JQ 加载器调用（写第二行日志）
 * 全部走 ARMv7 裸 SVC 系统调用（零 libc 依赖），dlsym 为 undefined
 * 引用（加载时由宿主进程全局符号空间解析 —— NetEase so 同机制实证）。
 */
typedef unsigned int u32;
typedef int s32;
typedef unsigned long ul;

/* ---- ARMv7 裸 SVC ---- */
static long sys3(long n, long a, long b, long c) {
    register long r0 __asm__("r0") = n;
    register long r1 __asm__("r1") = a;
    register long r2 __asm__("r2") = b;
    register long r3 __asm__("r3") = c;
    __asm__ volatile ("svc #0" : "+r"(r0) : "r"(r1), "r"(r2), "r"(r3) : "memory");
    return r0;
}
static long sys2(long n, long a, long b) {
    register long r0 __asm__("r0") = n;
    register long r1 __asm__("r1") = a;
    register long r2 __asm__("r2") = b;
    __asm__ volatile ("svc #0" : "+r"(r0) : "r"(r1), "r"(r2) : "memory");
    return r0;
}
#define SYS_EXIT 1
#define SYS_READ 3
#define SYS_WRITE 4
#define SYS_OPEN 5
#define SYS_CLOSE 6

static long slen(const char *s) {
    long n = 0;
    while (s[n]) n++;
    return n;
}

static void logline(const char *msg) {
    long fd = sys3(SYS_OPEN, (long)"/tmp/e6keys_probe.log", 0x441, 0644);
    if (fd >= 0) {
        sys3(SYS_WRITE, fd, (long)msg, slen(msg));
        sys3(SYS_CLOSE, fd, 0, 0);
    }
}

/* dlsym —— undefined 引用，加载时由宿主进程解析 */
extern void *dlsym(void *handle, const char *symbol);
/* RTLD_DEFAULT = 0 */
static void *g_JS_NewCModule;
static void *g_JS_AddModuleExport;
static void *g_JS_SetModuleExport;
static void *g_JS_NewCFunction;
static void *g_JS_NewStringLen;
static void *g_JS_GetContextOpaque;
static void *g_JS_SetContextOpaque;

__attribute__((constructor))
static void e6keys_ctor(void) {
    logline("probe ctor: loaded\n");
    g_JS_NewCModule = dlsym(0, "JS_NewCModule");
    g_JS_AddModuleExport = dlsym(0, "JS_AddModuleExport");
    g_JS_SetModuleExport = dlsym(0, "JS_SetModuleExport");
    g_JS_NewCFunction = dlsym(0, "JS_NewCFunction");
    g_JS_NewStringLen = dlsym(0, "JS_NewStringLen");
    g_JS_GetContextOpaque = dlsym(0, "JS_GetContextOpaque");
    g_JS_SetContextOpaque = dlsym(0, "JS_SetContextOpaque");
    logline("probe ctor: dlsym done\n");
}

void *js_init_module(void *ctx, const char *name) {
    /* 逐符号验证 + 结果写日志（M2 判定） */
    char buf[8];
    buf[0] = 'N'; buf[1] = 'C'; buf[2] = ':';
    buf[3] = g_JS_NewCModule ? 'Y' : 'n';
    buf[4] = ' '; buf[5] = 'A'; buf[6] = 'E'; buf[7] = ':';
    logline(buf);
    logline(g_JS_AddModuleExport ? "AE:Y " : "AE:n ");
    logline(g_JS_SetModuleExport ? "SE:Y\n" : "SE:n\n");
    logline("NCfn:"); logline(g_JS_NewCFunction ? "Y\n" : "n\n");
    logline("NSL:"); logline(g_JS_NewStringLen ? "Y\n" : "n\n");
    logline("GCO:"); logline(g_JS_GetContextOpaque ? "Y\n" : "n\n");
    logline("SCO:"); logline(g_JS_SetContextOpaque ? "Y\n" : "n\n");
    logline("name:"); logline(name ? name : "(null)");
    logline("\nprobe done\n");
    return 0;
}
