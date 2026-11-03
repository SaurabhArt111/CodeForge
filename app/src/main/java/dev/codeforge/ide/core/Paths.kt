package dev.codeforge.ide.core

import android.content.Context
import android.os.Build
import android.os.Environment
import java.io.File

/** All well-known locations used by the app. Call [init] once from Application.onCreate. */
object Paths {
    lateinit var app: Context
    lateinit var files: File       // /data/data/<pkg>/files
    lateinit var home: File        // default workspace + $HOME of the terminal ("/root" inside Linux)
    lateinit var env: File         // launcher scripts, proot temp dir
    lateinit var data: File        // settings, extensions, plugins, caches
    lateinit var rootfs: File      // Alpine Linux root filesystem
    lateinit var nativeDir: File   // directory holding libproot*.so (executable)

    fun init(c: Context) {
        app = c.applicationContext
        files = c.filesDir
        home = File(files, "home").also { it.mkdirs() }
        env = File(files, "env").also { it.mkdirs() }
        data = File(files, "cf").also { it.mkdirs() }
        rootfs = File(files, "rootfs")
        nativeDir = File(c.applicationInfo.nativeLibraryDir)
        File(env, "tmp").mkdirs()
        File(env, "bin").mkdirs()
        File(data, "extensions").mkdirs()
        File(data, "plugins").mkdirs()
    }

    val abi: String get() = Build.SUPPORTED_ABIS.firstOrNull() ?: "arm64-v8a"

    /** Public folder visible in every file manager (needs "All files access" on Android 11+). */
    fun sharedRoot(): File = File(Environment.getExternalStorageDirectory(), "CodeForge")
}
