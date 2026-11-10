package dev.codeforge.ide.core

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.app.Application
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Process
import dev.codeforge.ide.BuildConfig
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.ArrayDeque
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Local crash / diagnostics recorder. Nothing leaves the device.
 *
 *  - uncaught exceptions on any thread (main and :preview process) are written to disk *before* the process dies
 *  - kills that no handler can see (low-memory kill, SIGKILL, native crash, ANR) are recovered on the next launch from
 *    [ApplicationExitInfo] (Android 11+), together with the breadcrumb trail the previous run left behind
 *  - WebView renderer deaths, JS errors and terminal events are reported by the activities / the web UI
 *
 * Reports are small JSON files in files/crashes/. The UI lists them under Settings → Diagnostics.
 */
object CrashRecorder {
    private lateinit var app: Application
    private lateinit var dir: File
    private var procName = "main"
    private var procTag = "main"
    private var installed = false
    private val startedAt = System.currentTimeMillis()
    private val ts = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    private val crumbs = ArrayDeque<String>()
    private val io = Executors.newSingleThreadExecutor { r -> Thread(r, "cf-crash-io").also { it.isDaemon = true } }
    private var crumbFile: File? = null
    private var crumbBytes = 0L
    @Volatile var foreground = false
    @Volatile private var previousCrumbs: List<String> = emptyList()

    const val MAX_REPORTS = 60
    private const val MAX_CRUMBS = 160

    fun processName(c: Context): String {
        if (Build.VERSION.SDK_INT >= 28) return Application.getProcessName()
        return try { File("/proc/self/cmdline").readText().trim('\u0000', ' ') } catch (_: Throwable) { c.packageName }
    }

    fun install(application: Application) {
        if (installed) return
        installed = true
        app = application
        dir = File(application.filesDir, "crashes").also { it.mkdirs() }
        procName = processName(application)
        procTag = procName.substringAfter(':', "main")
        crumbFile = File(dir, ".crumbs-$procTag.log")
        // the previous run's trail (read BEFORE we start a fresh one)
        previousCrumbs = try { crumbFile!!.takeIf { it.isFile }?.readLines()?.takeLast(MAX_CRUMBS) ?: emptyList() } catch (_: Throwable) { emptyList() }
        try { crumbFile!!.writeText("") } catch (_: Throwable) {}
        crumb("process start $procName pid=${Process.myPid()} v${BuildConfig.VERSION_NAME}")

        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val oom = e is OutOfMemoryError
                record(
                    kind = "crash",
                    title = (if (oom) "Out of memory" else e.javaClass.simpleName) + ": " + (e.message ?: "").take(140),
                    detail = "Thread: ${t.name}\n\n" + stackOf(e),
                    fatal = true, withLogcat = !oom, sync = true
                )
            } catch (_: Throwable) { /* never let the recorder break the real crash path */ }
            previous?.uncaughtException(t, e)
        }
    }

    // ------------------------------------------------------------------ breadcrumbs

    fun crumb(msg: String) {
        val line = ts.format(Date()) + " " + msg.take(300).replace('\n', ' ')
        synchronized(crumbs) {
            crumbs.addLast(line)
            while (crumbs.size > MAX_CRUMBS) crumbs.removeFirst()
        }
        val f = crumbFile ?: return
        io.execute {
            try {
                if (crumbBytes > 64 * 1024) {
                    val keep = synchronized(crumbs) { crumbs.toList() }
                    f.writeText(keep.joinToString("\n") + "\n"); crumbBytes = f.length()
                } else {
                    f.appendText(line + "\n"); crumbBytes += line.length + 1
                }
            } catch (_: Throwable) {}
        }
    }

    fun memoryLine(): String {
        val rt = Runtime.getRuntime()
        val heap = (rt.totalMemory() - rt.freeMemory()) shr 20
        val max = rt.maxMemory() shr 20
        val native = Debug.getNativeHeapAllocatedSize() shr 20
        var avail = -1L; var low = false
        try {
            val am = app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val mi = ActivityManager.MemoryInfo(); am.getMemoryInfo(mi)
            avail = mi.availMem shr 20; low = mi.lowMemory
        } catch (_: Throwable) {}
        return "mem heap=${heap}/${max}MB native=${native}MB sysAvail=${avail}MB lowMem=$low"
    }

    // ------------------------------------------------------------------ reports

    private fun stackOf(e: Throwable): String { val sw = StringWriter(); e.printStackTrace(PrintWriter(sw)); return sw.toString().take(20000) }

    private fun logcatTail(): String = try {
        val pb = ProcessBuilder("logcat", "-d", "-t", "160", "--pid=${Process.myPid()}", "-v", "threadtime").redirectErrorStream(true)
        val p = pb.start()
        val out = StringBuilder()
        val th = Thread { try { p.inputStream.bufferedReader().useLines { s -> s.forEach { if (out.length < 24000) out.append(it).append('\n') } } } catch (_: Throwable) {} }
        th.isDaemon = true; th.start(); th.join(1500)
        try { p.destroy() } catch (_: Throwable) {}
        out.toString()
    } catch (_: Throwable) { "" }

    private fun webViewVersion(): String = try {
        if (Build.VERSION.SDK_INT >= 26) android.webkit.WebView.getCurrentWebViewPackage()?.let { it.packageName + " " + it.versionName } ?: "?" else "?"
    } catch (_: Throwable) { "?" }

    fun record(
        kind: String, title: String, detail: String, fatal: Boolean,
        withLogcat: Boolean = false, sync: Boolean = false, atTime: Long = System.currentTimeMillis(), extraCrumbs: List<String>? = null,
        process: String = procName
    ): String {
        val id = "%013d-%s-%04x".format(atTime, kind.replace(Regex("[^a-z0-9-]"), ""), (Math.random() * 65535).toInt())
        val trail = extraCrumbs ?: synchronized(crumbs) { crumbs.toList() }
        val mem = if (extraCrumbs == null) memoryLine().removePrefix("mem ") else null
        val fg = foreground
        val up = (System.currentTimeMillis() - startedAt) / 1000
        val pid = Process.myPid()
        val job = Runnable {
            try {
                val sb = StringBuilder()
                sb.append("CodeForge report\n")
                sb.append("Time:     ").append(SimpleDateFormat("yyyy-MM-dd HH:mm:ss Z", Locale.US).format(Date(atTime))).append('\n')
                sb.append("Kind:     ").append(kind).append(if (fatal) "  (app stopped)" else "").append('\n')
                sb.append("App:      ").append(BuildConfig.APPLICATION_ID).append(' ').append(BuildConfig.VERSION_NAME).append('\n')
                sb.append("Device:   ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL).append(" · Android ").append(Build.VERSION.RELEASE)
                    .append(" (SDK ").append(Build.VERSION.SDK_INT).append(") · ").append(Build.SUPPORTED_ABIS.firstOrNull()).append('\n')
                sb.append("WebView:  ").append(webViewVersion()).append('\n')
                sb.append("Process:  ").append(process).append(" pid=").append(pid).append(" up ").append(up).append("s").append(if (fg) " · foreground" else " · background").append('\n')
                if (mem != null) sb.append("Memory:   ").append(mem).append('\n')
                sb.append("\n== ").append(title).append(" ==\n").append(detail.take(30000)).append("\n")
                if (trail.isNotEmpty()) sb.append("\n-- breadcrumbs (oldest first) --\n").append(trail.joinToString("\n")).append('\n')
                if (withLogcat) { val lc = logcatTail(); if (lc.isNotBlank()) sb.append("\n-- logcat (tail) --\n").append(lc) }
                val o = JSONObject().put("id", id).put("ts", atTime).put("kind", kind).put("title", title.take(200)).put("fatal", fatal)
                    .put("process", process).put("seen", false).put("text", sb.toString())
                File(dir, "$id.json").writeText(o.toString()); prune()
            } catch (_: Throwable) {}
        }
        if (sync) job.run() else io.execute(job)
        return id
    }

    private fun prune() {
        val all = dir.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name } ?: return
        if (all.size > MAX_REPORTS) all.take(all.size - MAX_REPORTS).forEach { it.delete() }
    }

    private fun meta(o: JSONObject) = JSONObject().put("id", o.optString("id")).put("ts", o.optLong("ts")).put("kind", o.optString("kind"))
        .put("title", o.optString("title")).put("fatal", o.optBoolean("fatal")).put("process", o.optString("process")).put("seen", o.optBoolean("seen"))
        .put("size", o.optString("text").length)

    private fun files(): List<File> = dir.listFiles { f -> f.name.endsWith(".json") }?.sortedByDescending { it.name } ?: emptyList()
    private fun load(f: File): JSONObject? = try { JSONObject(f.readText()) } catch (_: Throwable) { null }

    fun list(): JSONArray { val a = JSONArray(); for (f in files()) load(f)?.let { a.put(meta(it)) }; return a }
    fun unseen(): JSONArray { val a = JSONArray(); for (f in files()) load(f)?.let { if (!it.optBoolean("seen")) a.put(meta(it)) }; return a }
    fun read(id: String): JSONObject? = files().firstOrNull { it.name == "$id.json" }?.let { load(it) }
    fun delete(id: String) { File(dir, "$id.json").takeIf { it.parentFile == dir }?.delete() }
    fun clear() { files().forEach { it.delete() } }
    fun markSeen(ids: List<String>?) {
        for (f in files()) {
            if (ids != null && f.name.removeSuffix(".json") !in ids) continue
            val o = load(f) ?: continue
            if (!o.optBoolean("seen")) try { f.writeText(o.put("seen", true).toString()) } catch (_: Throwable) {}
        }
    }
    fun bundle(ids: List<String>?): String {
        val sb = StringBuilder()
        for (f in files().reversed()) {
            val o = load(f) ?: continue
            if (ids != null && o.optString("id") !in ids) continue
            sb.append("=".repeat(60)).append('\n').append(o.optString("text")).append("\n\n")
        }
        return sb.toString().ifEmpty { "No reports." }
    }

    /** Short text for "Copy diagnostics": device + memory + latest breadcrumbs. */
    fun diagnostics(): String {
        val trail = synchronized(crumbs) { crumbs.toList() }
        return "CodeForge ${BuildConfig.VERSION_NAME}\n${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}) · ${Build.SUPPORTED_ABIS.firstOrNull()}\n" +
            "WebView ${webViewVersion()}\n${memoryLine()}\n\n-- breadcrumbs --\n" + trail.takeLast(60).joinToString("\n")
    }

    // ------------------------------------------------------------------ previous-run exits (Android 11+)

    private fun reasonName(r: Int) = when (r) {
        ApplicationExitInfo.REASON_ANR -> "anr"
        ApplicationExitInfo.REASON_CRASH -> "crash"
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "native-crash"
        ApplicationExitInfo.REASON_LOW_MEMORY -> "low-memory"
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "resource-limit"
        ApplicationExitInfo.REASON_SIGNALED -> "killed"
        ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "init-failure"
        ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dependency-died"
        ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "permission-change"
        ApplicationExitInfo.REASON_OTHER -> "other"
        else -> "exit-$r"
    }

    private fun reasonHint(i: ApplicationExitInfo, fg: Boolean): String = when (i.reason) {
        ApplicationExitInfo.REASON_LOW_MEMORY -> "Android ran out of memory and stopped the process" + if (fg) " while CodeForge was in use." else " while CodeForge was in the background."
        ApplicationExitInfo.REASON_SIGNALED -> if (i.status == 9) "The process received SIGKILL" + (if (fg) " while in the foreground , typically a low-memory kill or the OS' phantom-process limit (Android 12+ kills too many child processes such as node/proot)." else " while in the background (normal Android memory management; terminals stop with it).")
            else "The process was stopped by signal ${i.status}."
        ApplicationExitInfo.REASON_CRASH_NATIVE -> "A native (C/C++) crash: PTY/proot code or the WebView's own native code."
        ApplicationExitInfo.REASON_ANR -> "The app stopped responding (ANR)."
        ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "Android stopped the process for using too many resources."
        ApplicationExitInfo.REASON_CRASH -> "Uncaught exception."
        else -> ""
    }

    /** Call once per launch from the main process (background thread). Returns how many new reports were written. */
    fun scanPreviousExits(): Int {
        if (Build.VERSION.SDK_INT < 30) return 0
        var n = 0
        try {
            val prefs = app.getSharedPreferences("crash", Context.MODE_PRIVATE)
            val seen = prefs.getLong("exitSeen", 0L)
            val am = app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val infos = am.getHistoricalProcessExitReasons(app.packageName, 0, 12).filter { it.timestamp > seen }.sortedBy { it.timestamp }
            val existing = files().mapNotNull { load(it) }
            for (i in infos) {
                val r = i.reason
                if (r == ApplicationExitInfo.REASON_EXIT_SELF || r == ApplicationExitInfo.REASON_USER_REQUESTED || r == ApplicationExitInfo.REASON_USER_STOPPED ||
                    r == ApplicationExitInfo.REASON_FREEZER) continue
                val pname = i.processName ?: app.packageName
                val isPreview = pname.endsWith(":preview")
                val fg = i.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
                // already recorded by the uncaught-exception handler
                if (r == ApplicationExitInfo.REASON_CRASH && existing.any { it.optString("kind") == "crash" && Math.abs(it.optLong("ts") - i.timestamp) < 20_000 }) continue
                // a cached preview process being reclaimed is normal housekeeping
                if (isPreview && !fg) continue
                val kind = reasonName(r)
                val title = "Process ${pname.substringAfter(':', "main")} ended: $kind" + if (fg) "" else " (in background)"
                val sb = StringBuilder()
                sb.append(reasonHint(i, fg)).append("\n\n")
                sb.append("reason=").append(kind).append(" status=").append(i.status).append(" importance=").append(i.importance).append(if (fg) " (foreground)" else " (background/cached)").append('\n')
                sb.append("pss=").append(i.pss).append("KB rss=").append(i.rss).append("KB\n")
                if (!i.description.isNullOrBlank()) sb.append("description: ").append(i.description).append('\n')
                if (r == ApplicationExitInfo.REASON_ANR) try { i.traceInputStream?.bufferedReader()?.use { sb.append("\n-- ANR trace (head) --\n").append(it.readText().take(6000)) } } catch (_: Throwable) {}
                val trail = if (isPreview) emptyList() else previousCrumbs
                record(kind = kind, title = title, detail = sb.toString(), fatal = fg || r == ApplicationExitInfo.REASON_CRASH_NATIVE || r == ApplicationExitInfo.REASON_ANR,
                    atTime = i.timestamp, extraCrumbs = trail, process = pname, sync = true)
                n++
            }
            if (infos.isNotEmpty()) prefs.edit().putLong("exitSeen", infos.maxOf { it.timestamp }).apply()
        } catch (_: Throwable) {}
        return n
    }
}
