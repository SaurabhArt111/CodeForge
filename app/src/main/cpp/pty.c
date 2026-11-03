/*
 * PTY helper for CodeForge.
 * Adapted from the Termux terminal-emulator JNI (termux.c), (c) Termux contributors, Apache License 2.0
 * https://github.com/termux/termux-app/blob/master/terminal-emulator/src/main/jni/termux.c
 */
#include <dirent.h>
#include <fcntl.h>
#include <jni.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#define CF_UNUSED(x) x __attribute__((__unused__))

static int throw_runtime_exception(JNIEnv *env, char const *message) {
    jclass exClass = (*env)->FindClass(env, "java/lang/RuntimeException");
    (*env)->ThrowNew(env, exClass, message);
    return -1;
}

static int create_subprocess(JNIEnv *env, char const *cmd, char const *cwd, char *const argv[],
                             char **envp, int *pProcessId, jint rows, jint columns) {
    int ptm = open("/dev/ptmx", O_RDWR | O_CLOEXEC);
    if (ptm < 0) return throw_runtime_exception(env, "Cannot open /dev/ptmx");

    char devname[64];
    if (grantpt(ptm) || unlockpt(ptm) || ptsname_r(ptm, devname, sizeof(devname))) {
        close(ptm);
        return throw_runtime_exception(env, "Cannot grantpt()/unlockpt()/ptsname_r() on /dev/ptmx");
    }

    /* UTF-8 mode on, software flow control off (so Ctrl+S does not freeze the display). */
    struct termios tios;
    tcgetattr(ptm, &tios);
    tios.c_iflag |= IUTF8;
    tios.c_iflag &= ~(IXON | IXOFF);
    tcsetattr(ptm, TCSANOW, &tios);

    struct winsize sz = {.ws_row = (unsigned short) rows, .ws_col = (unsigned short) columns,
            .ws_xpixel = 0, .ws_ypixel = 0};
    ioctl(ptm, TIOCSWINSZ, &sz);

    pid_t pid = fork();
    if (pid < 0) {
        close(ptm);
        return throw_runtime_exception(env, "Fork failed");
    } else if (pid > 0) {
        *pProcessId = (int) pid;
        return ptm;
    } else {
        /* Child: clear signals the Android runtime may have blocked. */
        sigset_t signals_to_unblock;
        sigfillset(&signals_to_unblock);
        sigprocmask(SIG_UNBLOCK, &signals_to_unblock, 0);

        close(ptm);
        setsid();

        int pts = open(devname, O_RDWR);
        if (pts < 0) _exit(1);
        ioctl(pts, TIOCSCTTY, 0);

        dup2(pts, 0);
        dup2(pts, 1);
        dup2(pts, 2);

        DIR *self_dir = opendir("/proc/self/fd");
        if (self_dir != NULL) {
            int self_dir_fd = dirfd(self_dir);
            struct dirent *entry;
            while ((entry = readdir(self_dir)) != NULL) {
                int fd = atoi(entry->d_name);
                if (fd > 2 && fd != self_dir_fd) close(fd);
            }
            closedir(self_dir);
        }

        clearenv();
        if (envp) for (; *envp; ++envp) putenv(*envp);

        if (chdir(cwd) != 0) {
            perror("chdir");
            fflush(stderr);
        }
        execvp(cmd, argv);
        perror("exec");
        _exit(1);
    }
}

static char **to_c_array(JNIEnv *env, jobjectArray arr) {
    jsize size = arr ? (*env)->GetArrayLength(env, arr) : 0;
    if (size <= 0) return NULL;
    char **out = (char **) calloc((size_t) size + 1, sizeof(char *));
    if (!out) return NULL;
    for (jsize i = 0; i < size; ++i) {
        jstring s = (jstring) (*env)->GetObjectArrayElement(env, arr, i);
        char const *utf = (*env)->GetStringUTFChars(env, s, NULL);
        out[i] = utf ? strdup(utf) : strdup("");
        if (utf) (*env)->ReleaseStringUTFChars(env, s, utf);
        (*env)->DeleteLocalRef(env, s);
    }
    out[size] = NULL;
    return out;
}

static void free_c_array(char **a) {
    if (!a) return;
    for (char **t = a; *t; ++t) free(*t);
    free(a);
}

JNIEXPORT jint JNICALL
Java_dev_codeforge_ide_core_Pty_createSubprocess(JNIEnv *env, jclass CF_UNUSED(clazz), jstring cmd,
                                                 jstring cwd, jobjectArray args, jobjectArray envVars,
                                                 jintArray processIdArray, jint rows, jint columns) {
    char **argv = to_c_array(env, args);
    char **envp = to_c_array(env, envVars);
    int procId = 0;
    char const *cmd_cwd = (*env)->GetStringUTFChars(env, cwd, NULL);
    char const *cmd_utf8 = (*env)->GetStringUTFChars(env, cmd, NULL);
    int ptm = create_subprocess(env, cmd_utf8, cmd_cwd, argv, envp, &procId, rows, columns);
    (*env)->ReleaseStringUTFChars(env, cwd, cmd_cwd);
    (*env)->ReleaseStringUTFChars(env, cmd, cmd_utf8);
    free_c_array(argv);
    free_c_array(envp);

    jint *pProcId = (*env)->GetIntArrayElements(env, processIdArray, NULL);
    if (pProcId) {
        pProcId[0] = procId;
        (*env)->ReleaseIntArrayElements(env, processIdArray, pProcId, 0);
    }
    return ptm;
}

JNIEXPORT void JNICALL
Java_dev_codeforge_ide_core_Pty_setWindowSize(JNIEnv *CF_UNUSED(env), jclass CF_UNUSED(clazz), jint fd,
                                              jint rows, jint cols) {
    struct winsize sz = {.ws_row = (unsigned short) rows, .ws_col = (unsigned short) cols,
            .ws_xpixel = 0, .ws_ypixel = 0};
    ioctl(fd, TIOCSWINSZ, &sz);
}

JNIEXPORT jint JNICALL
Java_dev_codeforge_ide_core_Pty_waitFor(JNIEnv *CF_UNUSED(env), jclass CF_UNUSED(clazz), jint pid) {
    int status;
    if (waitpid(pid, &status, 0) < 0) return -1;
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return -WTERMSIG(status);
    return 0;
}
