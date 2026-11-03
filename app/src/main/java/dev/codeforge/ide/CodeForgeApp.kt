package dev.codeforge.ide

import android.app.Application
import dev.codeforge.ide.core.LinuxEnv
import dev.codeforge.ide.core.Paths

class CodeForgeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Paths.init(this)
        Thread { try { LinuxEnv.prepare() } catch (_: Throwable) {} }.start()
    }
}
