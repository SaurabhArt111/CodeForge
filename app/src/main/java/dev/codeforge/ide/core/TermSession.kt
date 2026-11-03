package dev.codeforge.ide.core

import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

/** One interactive PTY-backed process (a terminal tab). */
class TermSession(
    val id: String,
    var title: String,
    val spec: LinuxEnv.Launch,
    rows: Int,
    cols: Int,
    private val listener: Listener
) {
    interface Listener {
        fun onOutput(s: TermSession, data: ByteArray, len: Int)
        fun onExit(s: TermSession, code: Int)
    }

    val pid: Int
    val replay = RingBuffer(512 * 1024)
    @Volatile var alive = true
    @Volatile var exitCode = 0
    val mode: String get() = spec.mode
    val cwd: String get() = spec.cwd

    private val pfd: ParcelFileDescriptor
    private val input: FileInputStream
    private val output: FileOutputStream
    private val reader: Thread

    init {
        val pidArr = IntArray(1)
        val fd = Pty.createSubprocess(
            spec.cmd, spec.cwd, spec.args.toTypedArray(), spec.env.toTypedArray(), pidArr, rows, cols
        )
        pid = pidArr[0]
        pfd = ParcelFileDescriptor.adoptFd(fd)
        input = FileInputStream(pfd.fileDescriptor)
        output = FileOutputStream(pfd.fileDescriptor)

        reader = Thread({
            val buf = ByteArray(16384)
            try {
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    replay.write(buf, 0, n)
                    listener.onOutput(this, buf, n)
                }
            } catch (_: IOException) {
                // EIO when the slave side closes: normal at exit
            }
        }, "pty-read-$id").also { it.isDaemon = true; it.start() }

        Thread({
            val code = Pty.waitFor(pid)
            exitCode = code
            try { reader.join(800) } catch (_: InterruptedException) {}
            alive = false
            try { pfd.close() } catch (_: IOException) {}
            listener.onExit(this, code)
        }, "pty-wait-$id").also { it.isDaemon = true; it.start() }
    }

    fun write(data: ByteArray) {
        if (!alive) return
        synchronized(output) {
            try {
                output.write(data)
                output.flush()
            } catch (_: IOException) {
            }
        }
    }

    fun resize(rows: Int, cols: Int) {
        if (!alive) return
        try { Pty.setWindowSize(pfd.fd, rows, cols) } catch (_: Throwable) {}
    }

    fun kill() {
        if (!alive) return
        try {
            Os.kill(-pid, OsConstants.SIGHUP)
            Os.kill(-pid, OsConstants.SIGTERM)
        } catch (_: ErrnoException) {
        }
        Thread({
            try { Thread.sleep(1500) } catch (_: InterruptedException) {}
            if (alive) try { Os.kill(-pid, OsConstants.SIGKILL) } catch (_: ErrnoException) {}
        }, "pty-kill-$id").also { it.isDaemon = true; it.start() }
    }
}
