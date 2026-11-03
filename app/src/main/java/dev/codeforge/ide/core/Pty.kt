package dev.codeforge.ide.core

/** Thin JNI wrapper around forkpty-style process creation (see src/main/cpp/pty.c). */
object Pty {
    init {
        System.loadLibrary("cfpty")
    }

    /** Returns the master fd. [processId] receives the child's pid in element 0. */
    @JvmStatic
    external fun createSubprocess(
        cmd: String, cwd: String, args: Array<String>?, env: Array<String>?,
        processId: IntArray, rows: Int, cols: Int
    ): Int

    @JvmStatic
    external fun setWindowSize(fd: Int, rows: Int, cols: Int)

    @JvmStatic
    external fun waitFor(pid: Int): Int
}
