package dev.codeforge.ide.core

/** Thin JNI wrapper around forkpty-style process creation (see src/main/cpp/pty.c). */
object Pty {
    /** Why the native library could not be loaded (null = loaded). A failed load used to surface only as
     *  "dev.codeforge.ide.core.Pty" (NoClassDefFoundError on every later use); now terminals report the real reason. */
    @Volatile var loadError: String? = null
        private set

    init {
        try { System.loadLibrary("cfpty") }
        catch (e: Throwable) { loadError = e.message ?: e.toString() }
    }

    /** Throws a readable error when the library is missing; call before any external function. */
    fun ensureLoaded() {
        loadError?.let { throw IllegalStateException("Terminal library failed to load: $it") }
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
