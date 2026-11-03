/*
 * libjsapi_e6keys.so —— E6 物理键 JS 模块（里程碑 1：加载验证版）
 *
 * 目标：证明框架会加载应用包 libs/ 下的 .so（constructor 写日志即证明）。
 * 后续里程碑在此骨架上接入 event2 读取 + QuickJS C API。
 *
 * 依赖策略：只用 ARMv7 裸系统调用（SVC #0），零 libc/零 QuickJS 链接依赖，
 *   JS 侧函数注册用 dlsym(RTLD_DEFAULT) 在运行时解析宿主进程里的 QuickJS 符号。
 */
typedef unsigned int u32;
typedef int s32;

/* ARMv7 裸系统调用封装 */
static long sys3(long n, long a, long b, long c) {
    register long r0 __asm__("r0") = n;
    register long r1 __asm__("r1") = a;
    register long r2 __asm__("r2") = b;
    register long r3 __asm__("r3") = c;
    __asm__ volatile ("svc #0" : "+r"(r0) : "r"(r1), "r"(r2), "r"(r3) : "memory");
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
    long fd = sys3(SYS_OPEN, (long)"/tmp/e6keys_loaded.log", 0x401 /*O_WRONLY|O_APPEND*/, 0644);
    if (fd >= 0) {
        sys3(SYS_WRITE, fd, (long)msg, slen(msg));
        sys3(SYS_CLOSE, fd, 0, 0);
    }
}

__attribute__((constructor))
static void e6keys_ctor(void) {
    logline("e6keys so loaded (ctor)\n");
}

/* 标准 QuickJS 原生模块入口（M2 接入实际逻辑） */
void *js_init_module(void *ctx, const char *name) {
    logline("js_init_module called\n");
    return 0;
}
