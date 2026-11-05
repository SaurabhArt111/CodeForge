package dev.codeforge.ide.core

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import android.os.Debug
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

/**
 * Crash recorder. Persists a plain-text report for every
 *  - uncaught native-side (JVM) exception on any thread,
 *  - WebView renderer crash / kill,
 *  - error forwarded from the web UI (window.onerror / unhandledrejection),
 *  - abnormal process exit of a previous run (OOM-kill, native crash, ANR) on Android 11+.
 * Reports live in <data>/crash and are viewable from Settings ▸ Crash reports.
 */
object CrashLog {
    private const val MAX_REPORTS = 40
    private const val MAX_CRUMBS = 80
    private val crumbs = ArrayDeque<String>()
    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
    @Volatile private var installed = false

    private fun dir(): File = File(Paths.data, "crash").also { it.mkdirs() }

    /** Cheap in-memory trail of what the app was doing; attached to every report. */
    fun crumb(msg: String) {
        synchronized(crumbs) {
            if (crumbs.size >= MAX_CRUMBS) crumbs.removeFirst()
            crumbs.addLast("${stamp.format(Date())} $msg")
        }
    }

    fun install(ctx: Context) {
        if (installed) return
        installed = true
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try { record("native", "Uncaught ${e.javaClass.simpleName} on ${t.name}", stack(e)) } catch (_: Throwable) {}
            if (prev != null) prev.uncaughtException(t, e) else { android.os.Process.killProcess(android.os.Process.myPid()); System.exit(10) }
        }
        crumb("process start v${BuildConfig.VERSION_NAME}")
        try { harvestExitReasons(ctx) } catch (_: Throwable) {}
    }

    private fun stack(e: Throwable): String {
        val sw = StringWriter(); e.printStackTrace(PrintWriter(sw)); return sw.toString()
    }

    /** Android 11+: ask the OS why previous processes died; record the abnormal ones once. */
    private fun harvestExitReasons(ctx: Context) {
        if (Build.VERSION.SDK_INT < 30) return
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val seenFile = File(dir(), ".exit-seen")
        val seen = try { seenFile.readText().trim().toLong() } catch (_: Throwable) { 0L }
        var newest = seen
        for (i in am.getHistoricalProcessExitReasons(ctx.packageName, 0, 8)) {
            if (i.timestamp <= seen) continue
            if (i.timestamp > newest) newest = i.timestamp
            val why = when (i.reason) {
                ApplicationExitInfo.REASON_CRASH -> "Java crash"
                ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash"
                ApplicationExitInfo.REASON_ANR -> "ANR (app not responding)"
                ApplicationExitInfo.REASON_LOW_MEMORY -> "Killed: low memory"
                ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "Killed: excessive resource usage"
                ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "Initialization failure"
                ApplicationExitInfo.REASON_SIGNALED -> "Killed by signal"
                else -> null
            } ?: continue
            if (i.processName != ctx.packageName) continue
            val body = StringBuilder()
            body.append("Reason: $why\nDescription: ${i.description}\nStatus: ${i.status}\nImportance: ${i.importance}\n")
            body.append("PSS: ${i.pss} kB  RSS: ${i.rss} kB\nExit time: ${stamp.format(Date(i.timestamp))}\n")
            try { i.traceInputStream?.use { body.append("\n--- trace ---\n").append(it.readBytes().toString(Charsets.UTF_8).take(12000)) } } catch (_: Throwable) {}
            write("exit", why, body.toString(), i.timestamp)
        }
        if (newest > seen) try { seenFile.writeText(newest.toString()) } catch (_: Throwable) {}
    }

    fun record(kind: String, title: String, detail: String): String = write(kind, title, detail, System.currentTimeMillis())

    @Synchronized
    private fun write(kind: String, title: String, detail: String, ts: Long): String {
        val id = "${SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.US).format(Date(ts))}-$kind"
        val sb = StringBuilder()
        sb.append("CodeForge crash report\n")
        sb.append("Kind:    $kind\nTitle:   $title\nTime:    ${stamp.format(Date(ts))}\n")
        sb.append("App:     ${BuildConfig.VERSION_NAME} (${BuildConfig.APPLICATION_ID})\n")
        sb.append("Device:  ${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}), ${Paths.abi}\n")
        val rt = Runtime.getRuntime()
        sb.append("Memory:  heap ${(rt.totalMemory() - rt.freeMemory()) shr 20}/${rt.maxMemory() shr 20} MB, native ${Debug.getNativeHeapAllocatedSize() shr 20} MB, threads ${Thread.activeCount()}\n")
        try {
            val mi = ActivityManager.MemoryInfo()
            (Paths.app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(mi)
            sb.append("System:  free ${mi.availMem shr 20} MB, low=${mi.lowMemory}\n")
        } catch (_: Throwable) {}
        sb.append("\n--- detail ---\n").append(detail.take(60000)).append("\n")
        sb.append("\n--- recent activity ---\n")
        synchronized(crumbs) { for (c in crumbs) sb.append(c).append('\n') }
        File(dir(), "$id.txt").writeText(sb.toString())
        prune()
        return id
    }

    private fun prune() {
        val all = dir().listFiles { f -> f.name.endsWith(".txt") }?.sortedBy { it.name } ?: return
        if (all.size > MAX_REPORTS) all.take(all.size - MAX_REPORTS).forEach { it.delete() }
    }

    fun list(): JSONArray {
        val seen = lastSeen()
        val out = JSONArray()
        val files = dir().listFiles { f -> f.name.endsWith(".txt") }?.sortedByDescending { it.name } ?: return out
        for (f in files) {
            val head = try { f.bufferedReader().useLines { it.take(4).toList() } } catch (_: Throwable) { emptyList() }
            fun field(k: String) = head.firstOrNull { it.startsWith(k) }?.substringAfter(':')?.trim() ?: ""
            out.put(JSONObject().put("id", f.nameWithoutExtension).put("kind", field("Kind")).put("title", field("Title"))
                .put("time", field("Time")).put("ts", f.lastModified()).put("size", f.length()).put("unseen", f.lastModified() > seen))
        }
        return out
    }

    fun read(id: String): String {
        val f = File(dir(), safe(id) + ".txt")
        return if (f.exists()) f.readText() else ""
    }

    fun delete(id: String): Boolean = File(dir(), safe(id) + ".txt").delete()

    fun clear(): Int {
        var n = 0
        dir().listFiles { f -> f.name.endsWith(".txt") }?.forEach { if (it.delete()) n++ }
        return n
    }

    fun path(id: String): String = File(dir(), safe(id) + ".txt").path

    private fun safe(id: String) = id.replace(Regex("[^A-Za-z0-9._-]"), "")

    private fun lastSeen(): Long = try { File(dir(), ".seen").readText().trim().toLong() } catch (_: Throwable) { 0L }
    fun markSeen() { try { File(dir(), ".seen").writeText(System.currentTimeMillis().toString()) } catch (_: Throwable) {} }
    fun unseenCount(): Int { val s = lastSeen(); return dir().listFiles { f -> f.name.endsWith(".txt") && f.lastModified() > s }?.size ?: 0 }
}
