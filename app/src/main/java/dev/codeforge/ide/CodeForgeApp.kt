package dev.codeforge.ide

import android.app.Application
import android.os.Build
import android.webkit.WebView
import dev.codeforge.ide.core.CrashRecorder
import dev.codeforge.ide.core.LinuxEnv
import dev.codeforge.ide.core.Paths

class CodeForgeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val proc = CrashRecorder.processName(this)
        val isMain = proc == packageName
        // The isolated preview window runs in its own process, which needs its own WebView data directory.
        if (!isMain && Build.VERSION.SDK_INT >= 28) {
            try { WebView.setDataDirectorySuffix(proc.substringAfter(':', "aux")) } catch (_: Throwable) {}
        }
        CrashRecorder.install(this)
        Paths.init(this)
        if (isMain) {
            Thread { try { LinuxEnv.prepare() } catch (_: Throwable) {} }.start()
            Thread { try { CrashRecorder.scanPreviousExits() } catch (_: Throwable) {} }.start()
        }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_LOW) CrashRecorder.crumb("trimMemory level=$level ${CrashRecorder.memoryLine()}")
    }
}
