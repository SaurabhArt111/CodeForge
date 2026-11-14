package dev.codeforge.ide

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Process

/**
 * Invisible helper that lives in its own process (`:restart`) so it survives the death of the main process:
 * it kills the old CodeForge process, then starts CodeForge again from a clean state ("restart the app").
 */
class RestartActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pid = intent.getIntExtra(EXTRA_PID, -1)
        val launch = packageManager.getLaunchIntentForPackage(packageName)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        if (pid > 0 && pid != Process.myPid()) Process.killProcess(pid)
        if (launch != null) startActivity(launch)
        finish()
        Process.killProcess(Process.myPid())
    }

    companion object { const val EXTRA_PID = "pid" }
}
