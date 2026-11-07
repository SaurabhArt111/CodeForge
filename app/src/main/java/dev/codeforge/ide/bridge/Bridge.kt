package dev.codeforge.ide.bridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.storage.StorageManager
import android.util.Base64
import android.widget.Toast
import androidx.webkit.JavaScriptReplyProxy
import dev.codeforge.ide.BuildConfig
import dev.codeforge.ide.core.Auth
import dev.codeforge.ide.core.CrashRecorder
import dev.codeforge.ide.core.FsOps
import dev.codeforge.ide.core.GitHubAuth
import dev.codeforge.ide.core.LinuxEnv
import dev.codeforge.ide.core.LiveServers
import dev.codeforge.ide.core.Net
import dev.codeforge.ide.core.Paths
import dev.codeforge.ide.core.Saf
import dev.codeforge.ide.core.SecretStore
import dev.codeforge.ide.core.SessionManager
import dev.codeforge.ide.core.TarGz
import dev.codeforge.ide.core.TermSession
import dev.codeforge.ide.core.TextSearch
import dev.codeforge.ide.core.ZipTools
import dev.codeforge.ide.service.SessionService
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * JSON-RPC style bridge between the web IDE and native code.
 *  JS  -> native : {"id":1,"m":"fs.list","a":[...]}
 *  native -> JS  : {"id":1,"ok":true,"r":...}  or  {"id":1,"ok":false,"e":"message"}
 *  native -> JS  : {"ev":"term.data","d":{...}}  (events)
 * Only the app's own origin can reach this object (WebMessageListener origin rules), never preview iframes.
 */
object Bridge {
    /** Things only an Activity can do. */
    interface Host {
        fun pick(kind: String, args: JSONObject): JSONObject?
        fun hasAllFiles(): Boolean
        fun requestAllFiles()
        fun setSystemBars(color: Int, lightIcons: Boolean)
        fun keepAwake(on: Boolean)
        fun openUrl(url: String)
        fun share(args: JSONObject)
        fun finishApp()
        /** Leaves the app to the recents list (like the Home button) without stopping anything. */
        fun moveToBack()
        /** Shows the system biometric / device-credential prompt and blocks until it finishes. {ok, cancelled?, error?, unsupported?} */
        fun authenticate(title: String, subtitle: String): JSONObject
        fun authStatus(): JSONObject
        fun setSecure(on: Boolean)
        /** Opens [url] in the isolated preview window (separate process). */
        fun openPreview(url: String, title: String)
    }

    @Volatile var host: Host? = null
    @Volatile var pendingIntent: JSONObject? = null
    /** Set by MainActivity when the WebView had to be rebuilt after its renderer died; the UI reads it once on start. */
    @Volatile var recovery: JSONObject? = null
    /** False while the activity is paused: the WebView is frozen then, so terminal output is not streamed into it. */
    @Volatile var uiActive = false
        private set
    val fsToken: String = UUID.randomUUID().toString().replace("-", "")

    @Volatile private var reply: JavaScriptReplyProxy? = null
    private val main = Handler(Looper.getMainLooper())
    private val pool = Executors.newCachedThreadPool()
    private val flusher = Executors.newSingleThreadScheduledExecutor()
    private val searchCancel = ConcurrentHashMap<String, Boolean>()

    fun onMessage(text: String, proxy: JavaScriptReplyProxy) {
        reply = proxy
        pool.execute { dispatch(text) }
    }

    fun emit(ev: String, data: JSONObject) {
        post(JSONObject().put("ev", ev).put("d", data).toString())
    }

    private fun post(s: String) {
        val r = reply ?: return
        main.post { try { r.postMessage(s) } catch (_: Throwable) {} }
    }

    private fun dispatch(text: String) {
        val req = try { JSONObject(text) } catch (_: Exception) { return }
        val id = req.optInt("id", -1)
        val res = JSONObject().put("id", id)
        try {
            val r = call(req.optString("m"), req.optJSONArray("a") ?: JSONArray())
            res.put("ok", true).put("r", r ?: JSONObject.NULL)
        } catch (e: Throwable) {
            res.put("ok", false).put("e", e.message ?: e.javaClass.simpleName)
        }
        post(res.toString())
    }

    // ------------------------------------------------------------------ helpers

    private fun JSONArray.str(i: Int): String = getString(i)
    private fun JSONArray.obj(i: Int): JSONObject = optJSONObject(i) ?: JSONObject()
    private fun JSONObject.strList(k: String): List<String> {
        val a = optJSONArray(k) ?: return emptyList()
        return (0 until a.length()).map { a.getString(it) }
    }
    private fun JSONObject.headerMap(k: String): Map<String, String> {
        val h = optJSONObject(k) ?: return emptyMap()
        val m = LinkedHashMap<String, String>()
        for (key in h.keys()) m[key] = h.optString(key)
        return m
    }

    private fun hasAllFiles(): Boolean = host?.hasAllFiles() ?: false

    // ------------------------------------------------------------------ terminal output coalescing

    private class Pending { val buf = ByteArrayOutputStream(); var scheduled = false }
    private val pending = ConcurrentHashMap<String, Pending>()

    private val missed = ConcurrentHashMap.newKeySet<String>()

    /** Called by MainActivity on resume / pause. */
    fun setUiActive(active: Boolean) {
        uiActive = active
        CrashRecorder.foreground = active
        for (s in SessionManager.all()) { s.throttling = active; s.resetFlow() }
        if (active) {
            // output produced while the WebView was frozen was kept in each session's replay buffer: ask the terminals to resync
            for (id in missed.toList()) { missed.remove(id); emit("term.resync", JSONObject().put("id", id)) }
        }
    }

    private fun flush(id: String) {
        val p = pending[id] ?: return
        val bytes = synchronized(p) { p.scheduled = false; val b = p.buf.toByteArray(); p.buf.reset(); b }
        if (!uiActive) { missed.add(id); return }
        var off = 0
        while (off < bytes.size) {
            val n = minOf(64 * 1024, bytes.size - off)
            emit("term.data", JSONObject().put("id", id).put("b64", Net.b64(bytes.copyOfRange(off, off + n))))
            off += n
        }
    }

    private val termListener = object : TermSession.Listener {
        override fun onOutput(s: TermSession, data: ByteArray, len: Int) {
            val p = pending.getOrPut(s.id) { Pending() }
            synchronized(p) {
                p.buf.write(data, 0, len)
                if (!p.scheduled) {
                    p.scheduled = true
                    flusher.schedule({ try { flush(s.id) } catch (_: Throwable) {} }, 16, TimeUnit.MILLISECONDS)
                }
            }
        }

        override fun onExit(s: TermSession, code: Int) {
            flush(s.id)
            emit("term.exit", JSONObject().put("id", s.id).put("code", code))
            SessionService.sync()
        }
    }

    private fun termInfo(s: TermSession) = JSONObject().put("id", s.id).put("pid", s.pid).put("title", s.title)
        .put("alive", s.alive).put("exit", if (s.alive) JSONObject.NULL else s.exitCode)
        .put("mode", s.mode).put("cwd", s.cwd)

    // ------------------------------------------------------------------ dispatcher

    private fun call(m: String, a: JSONArray): Any? = when (m) {
        // ---------------- system
        "sys.info" -> sysInfo()
        "sys.hasAllFiles" -> hasAllFiles()
        "sys.requestAllFiles" -> { host?.requestAllFiles(); true }
        "sys.openUrl" -> { host?.openUrl(a.str(0)); true }
        "sys.share" -> { host?.share(a.obj(0)); true }
        "sys.takeIntent" -> { val p = pendingIntent; pendingIntent = null; p }
        "sys.clipboardGet" -> clipboardGet()
        "sys.clipboardSet" -> { clipboardSet(a.str(0)); true }
        "sys.notify" -> { notify(a.obj(0)); true }
        "sys.vibrate" -> { vibrate(a.optLong(0, 20)); true }
        "sys.toast" -> { val t = a.str(0); main.post { Toast.makeText(Paths.app, t, Toast.LENGTH_SHORT).show() }; true }
        "sys.keepAwake" -> { host?.keepAwake(a.optBoolean(0)); true }
        "sys.setStatusBar" -> { host?.setSystemBars(Color.parseColor(a.str(0)), a.optBoolean(1, false)); true }
        "sys.storageRoots" -> storageRoots()
        "sys.pickFile" -> host?.pick("file", a.obj(0))
        "sys.pickFolder" -> host?.pick("folder", a.obj(0))
        "sys.createFile" -> host?.pick("create", a.obj(0))
        "sys.importUri" -> importUri(a.str(0), a.str(1))
        "sys.importTree" -> importTree(a.str(0), a.str(1))
        "sys.exportFile" -> { Saf.exportFile(File(a.str(0)), Uri.parse(a.str(1))); true }
        "sys.exportTree" -> exportTree(a.str(0), a.str(1), a.optJSONArray(2)?.let { ar -> (0 until ar.length()).map { ar.getString(it) } } ?: emptyList())
        "sys.moveToBack" -> { host?.moveToBack(); true }
        "sys.exit" -> { SessionManager.killAll(); LiveServers.stopAll(); host?.finishApp(); true }

        // ---------------- files
        "fs.token" -> fsToken
        "fs.list" -> FsOps.list(a.str(0))
        "fs.stat" -> FsOps.statJson(a.str(0), true) ?: JSONObject.NULL
        "fs.lstat" -> FsOps.statJson(a.str(0), false) ?: JSONObject.NULL
        "fs.exists" -> FsOps.statJson(a.str(0), false) != null
        "fs.readText" -> a.obj(1).let { FsOps.readText(a.str(0), it.optLong("max", 12L * 1024 * 1024), it.optString("encoding", "").ifEmpty { null }) }
        "fs.readB64" -> FsOps.readB64(a.str(0), a.optLong(1, 0), a.optLong(2, -1))
        "fs.writeText" -> a.obj(2).let { FsOps.writeText(a.str(0), a.str(1), it.optBoolean("bom"), it.optString("encoding", "").ifEmpty { null }); true }
        "fs.writeB64" -> { FsOps.writeB64(a.str(0), a.str(1), a.optBoolean(2, false)); true }
        "fs.mkdir" -> { FsOps.mkdir(a.str(0)); true }
        "fs.rm" -> { FsOps.rm(a.str(0)); true }
        "fs.rename" -> { FsOps.rename(a.str(0), a.str(1)); true }
        "fs.copy" -> { FsOps.copy(a.str(0), a.str(1)); true }
        "fs.symlink" -> { FsOps.symlink(a.str(0), a.str(1)); true }
        "fs.readlink" -> FsOps.readlink(a.str(0))
        "fs.chmod" -> { FsOps.chmod(a.str(0), a.getInt(1)); true }
        "fs.realpath" -> FsOps.realpath(a.str(0))
        "fs.tree" -> a.obj(1).let {
            FsOps.tree(a.str(0), it.strList("ignore").toSet().ifEmpty { setOf(".git", "node_modules") }, it.optInt("max", 30000))
        }

        // ---------------- search
        "search.text" -> searchText(a.obj(0))
        "search.cancel" -> { searchCancel[a.str(0)] = true; true }

        // ---------------- archives
        "archive.zip" -> a.obj(0).let { o ->
            val n = ZipTools.zip(o.strList("src").map { File(it) }, File(o.getString("dest")), o.optString("base", "").ifEmpty { null }?.let { File(it) }, o.strList("exclude")) { c ->
                emit("archive.progress", JSONObject().put("count", c))
            }
            JSONObject().put("count", n)
        }
        "archive.unzip" -> a.obj(0).let { o ->
            val n = ZipTools.unzip(File(o.getString("src")), File(o.getString("dest"))) { c ->
                emit("archive.progress", JSONObject().put("count", c))
            }
            JSONObject().put("count", n)
        }
        "archive.listZip" -> ZipTools.list(File(a.str(0)))
        "archive.untar" -> a.obj(0).let { o ->
            TarGz.extract(File(o.getString("src")), File(o.getString("dest")), trusted = false) { c ->
                emit("archive.progress", JSONObject().put("count", c))
            }
            true
        }

        // ---------------- network
        "net.request" -> netRequest(a.obj(0))
        "net.stream" -> { netStream(a.obj(0)); true }
        "net.abort" -> { Net.abort(a.str(0)); true }
        "net.download" -> netDownload(a.obj(0))

        // ---------------- secrets
        "secret.set" -> { SecretStore.set(a.str(0), a.str(1)); true }
        "secret.has" -> SecretStore.has(a.str(0))
        "secret.delete" -> { SecretStore.delete(a.str(0)); true }
        "secret.names" -> JSONArray(SecretStore.names())
        // Reading a stored key back (to show / copy it) needs a live unlock token from a PIN or biometric check.
        "secret.reveal" -> { if (!Auth.tokenValid(a.optString(1, ""))) throw SecurityException("Authentication required"); SecretStore.get(a.str(0)) ?: throw IllegalStateException("No such key") }
        "secret.mask" -> SecretStore.get(a.str(0))?.let { v -> if (v.length <= 8) "•".repeat(v.length) else v.take(3) + "•".repeat(minOf(24, v.length - 7)) + v.takeLast(4) }
        // ---- PIN / biometrics
        "auth.status" -> JSONObject(Auth.status().toString()).also { st -> (host?.authStatus() ?: JSONObject()).let { b -> for (k in b.keys()) st.put(k, b.get(k)) } }
        "auth.biometric" -> {
            val r = host?.authenticate(a.obj(0).optString("title", "Unlock CodeForge"), a.obj(0).optString("subtitle", "")) ?: JSONObject().put("ok", false).put("unsupported", true)
            if (r.optBoolean("ok")) r.put("token", Auth.issueToken())
            r
        }
        "auth.verifyPin" -> Auth.verifyPin(a.str(0))
        "auth.setPin" -> Auth.setPin(a.str(0), a.optString(1, "").ifEmpty { null })
        "auth.clearPin" -> Auth.clearPin(a.str(0))
        "auth.valid" -> Auth.tokenValid(a.optString(0, ""))
        "sys.setSecure" -> { host?.setSecure(a.optBoolean(0, false)); true }
        "auth.lock" -> { Auth.revoke(); true }

        // ---------------- crash recorder / diagnostics / isolated preview
        "crash.list" -> CrashRecorder.list()
        "crash.unseen" -> CrashRecorder.unseen()
        "crash.read" -> CrashRecorder.read(a.str(0)) ?: JSONObject.NULL
        "crash.delete" -> { CrashRecorder.delete(a.str(0)); true }
        "crash.clear" -> { CrashRecorder.clear(); true }
        "crash.seen" -> { CrashRecorder.markSeen(if (a.isNull(0)) null else (0 until a.getJSONArray(0).length()).map { a.getJSONArray(0).getString(it) }); true }
        "crash.report" -> a.obj(0).let { o ->
            CrashRecorder.record(o.optString("kind", "js-error").take(24), o.optString("title", "Error"), o.optString("detail", ""), o.optBoolean("fatal", false), withLogcat = o.optBoolean("logcat", false))
        }
        "crash.crumbs" -> { val arr = a.optJSONArray(0); if (arr != null) for (i in 0 until minOf(arr.length(), 50)) CrashRecorder.crumb("ui " + arr.getString(i)); true }
        "crash.bundle" -> CrashRecorder.bundle(if (a.isNull(0)) null else (0 until a.getJSONArray(0).length()).map { a.getJSONArray(0).getString(it) })
        "crash.diagnostics" -> CrashRecorder.diagnostics()
        "crash.takeRecovery" -> { val r = recovery; recovery = null; r ?: JSONObject.NULL }
        "crash.testNative" -> { CrashRecorder.record("test", "Test report", "Created from Settings → Diagnostics.\n" + CrashRecorder.memoryLine(), false, withLogcat = true); true }
        "preview.open" -> a.obj(0).let { o -> host?.openPreview(o.getString("url"), o.optString("title", "Preview")); true }

        // ---------------- github
        "github.deviceStart" -> GitHubAuth.deviceStart(a.str(0).ifBlank { BuildConfig.GITHUB_CLIENT_ID }, a.optString(1, "repo read:user user:email workflow gist read:org"))
        "github.devicePoll" -> GitHubAuth.devicePoll(a.str(0).ifBlank { BuildConfig.GITHUB_CLIENT_ID }, a.str(1))
        "github.signedIn" -> GitHubAuth.signedIn()
        "github.user" -> GitHubAuth.user()
        "github.signOut" -> { GitHubAuth.signOut(); true }
        "github.configureGit" -> GitHubAuth.configureTerminalGit(a.optString(0, "").ifEmpty { null }, a.optString(1, "").ifEmpty { null }, a.str(2))

        // ---------------- live server
        "live.start" -> a.obj(0).let { o ->
            val s = LiveServers.start(File(o.getString("root")), o.optInt("port", 5500), o.optBoolean("spa"), o.optBoolean("lan")) { port, line ->
                emit("live.log", JSONObject().put("port", port).put("line", line))
            }
            JSONObject().put("port", s.port).put("url", "http://127.0.0.1:${s.port}/")
                .put("lanUrl", if (s.lan) dev.codeforge.ide.core.LiveServer.lanAddress()?.let { "http://$it:${s.port}/" } else null)
        }
        "live.stop" -> { LiveServers.stop(a.getInt(0)); true }
        "live.list" -> LiveServers.list()
        "live.reload" -> { LiveServers.reload(if (a.isNull(0)) null else a.optInt(0), a.optString(1, "").ifEmpty { null }); true }

        // ---------------- terminals
        "term.create" -> termCreate(a.obj(0))
        "term.write" -> { SessionManager.get(a.str(0))?.write(Base64.decode(a.str(1), Base64.DEFAULT)); true }
        "term.resize" -> { SessionManager.get(a.str(0))?.resize(a.getInt(1), a.getInt(2)); true }
        "term.kill" -> { SessionManager.get(a.str(0))?.kill(); true }
        "term.close" -> { SessionManager.get(a.str(0))?.let { if (it.alive) it.kill() }; SessionManager.remove(a.str(0)); pending.remove(a.str(0)); true }
        "term.list" -> JSONArray().also { arr -> SessionManager.all().forEach { arr.put(termInfo(it)) } }
        "term.attach" -> SessionManager.get(a.str(0))?.let { s ->
            s.resetFlow()
            termInfo(s).put("b64", Net.b64(s.replay.snapshot()))
        } ?: JSONObject.NULL
        "term.ack" -> { SessionManager.get(a.str(0))?.ack(a.optLong(1, 0)); true }
        "term.rename" -> { SessionManager.get(a.str(0))?.title = a.str(1); true }

        // ---------------- linux environment
        "env.status" -> envStatus()
        "env.install" -> { LinuxEnv.install { stage, done, total, msg ->
            emit("env.progress", JSONObject().put("stage", stage).put("done", done).put("total", total).put("msg", msg))
        }; envStatus() }
        "env.reset" -> { SessionManager.killAll(); LinuxEnv.reset(); envStatus() }
        "proc.exec" -> procExec(a.obj(0))

        else -> throw IllegalArgumentException("Unknown bridge method: $m")
    }

    // ------------------------------------------------------------------ implementations

    private fun sysInfo(): JSONObject {
        val ctx = Paths.app
        return JSONObject()
            .put("version", BuildConfig.VERSION_NAME)
            .put("pkg", ctx.packageName)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("abi", Paths.abi)
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("githubClientId", BuildConfig.GITHUB_CLIENT_ID)
            .put("allFiles", hasAllFiles())
            .put("features", JSONObject().put("isolatedPreview", true).put("crashRecorder", true).put("termFlow", true))
            .put("paths", JSONObject()
                .put("home", Paths.home.path).put("files", Paths.files.path).put("data", Paths.data.path)
                .put("env", Paths.env.path).put("rootfs", Paths.rootfs.path).put("native", Paths.nativeDir.path)
                .put("shared", Paths.sharedRoot().path)
                .put("extensions", File(Paths.data, "extensions").path).put("plugins", File(Paths.data, "plugins").path))
            .put("linux", envStatus())
    }

    private fun envStatus(): JSONObject = JSONObject()
        .put("installed", LinuxEnv.installed()).put("version", LinuxEnv.version() ?: JSONObject.NULL)
        .put("arch", LinuxEnv.arch() ?: JSONObject.NULL).put("setupDone", LinuxEnv.setupDone())
        .put("supported", LinuxEnv.arch() != null)

    private fun clipboardGet(): String {
        val cm = Paths.app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        return cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(Paths.app)?.toString() ?: ""
    }

    private fun clipboardSet(t: String) {
        val cm = Paths.app.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("CodeForge", t))
    }

    @Suppress("DEPRECATION")
    private fun vibrate(ms: Long) {
        val v = Paths.app.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        v.vibrate(VibrationEffect.createOneShot(ms.coerceIn(1, 500), VibrationEffect.DEFAULT_AMPLITUDE))
    }

    private fun notify(o: JSONObject) {
        val nm = Paths.app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel("cf_misc") == null)
            nm.createNotificationChannel(NotificationChannel("cf_misc", "CodeForge notifications", NotificationManager.IMPORTANCE_DEFAULT))
        val n = android.app.Notification.Builder(Paths.app, "cf_misc")
            .setSmallIcon(dev.codeforge.ide.R.drawable.ic_stat_notify)
            .setContentTitle(o.optString("title", "CodeForge"))
            .setContentText(o.optString("text", ""))
            .setAutoCancel(true).build()
        nm.notify(o.optInt("id", (System.currentTimeMillis() % 100000).toInt()) + 5000, n)
    }

    private fun storageRoots(): JSONArray {
        val arr = JSONArray()
        fun add(id: String, label: String, f: File?, removable: Boolean = false) {
            if (f == null || !f.exists()) return
            arr.put(JSONObject().put("id", id).put("label", label).put("path", f.path)
                .put("free", f.usableSpace).put("total", f.totalSpace).put("removable", removable))
        }
        add("workspace", "Workspace (app storage)", Paths.home)
        if (hasAllFiles()) {
            val shared = Paths.sharedRoot()
            if (!shared.exists()) shared.mkdirs()
            add("shared", "CodeForge (shared folder)", shared)
            add("internal", "Internal storage", Environment.getExternalStorageDirectory())
            add("downloads", "Downloads", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS))
            add("documents", "Documents", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS))
        } else {
            add("appshared", "App folder (no permission needed)", Paths.app.getExternalFilesDir(null))
        }
        try {
            val sm = Paths.app.getSystemService(Context.STORAGE_SERVICE) as StorageManager
            for (v in sm.storageVolumes) {
                if (v.isPrimary || v.state != Environment.MEDIA_MOUNTED) continue
                val dir = if (Build.VERSION.SDK_INT >= 30) v.directory else null
                add("vol-" + (v.uuid ?: v.getDescription(Paths.app)), v.getDescription(Paths.app), dir, true)
            }
        } catch (_: Exception) {}
        return arr
    }

    private fun uniqueDest(dir: File, name: String): File {
        var f = File(dir, name)
        var i = 2
        val base = name.substringBeforeLast('.', name)
        val ext = name.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }
        while (f.exists()) f = File(dir, "$base ($i)$ext").also { i++ }
        return f
    }

    private fun importUri(uriStr: String, destPath: String): JSONObject {
        val uri = Uri.parse(uriStr)
        val dest = File(destPath)
        val target = if (dest.isDirectory) uniqueDest(dest, Saf.displayName(uri) ?: "imported") else dest
        Saf.importFile(uri, target)
        return JSONObject().put("path", target.path).put("size", target.length())
    }

    private fun importTree(uriStr: String, destPath: String): JSONObject {
        val n = Saf.importTree(Uri.parse(uriStr), File(destPath)) { c -> emit("archive.progress", JSONObject().put("count", c)) }
        return JSONObject().put("count", n).put("path", destPath)
    }

    private fun exportTree(srcDir: String, treeUri: String, exclude: List<String> = emptyList()): JSONObject {
        val n = Saf.exportTree(File(srcDir), Uri.parse(treeUri), exclude) { c -> emit("archive.progress", JSONObject().put("count", c)) }
        return JSONObject().put("count", n)
    }

    private fun searchText(o: JSONObject): JSONObject {
        val id = o.optString("id", "")
        searchCancel.remove(id)
        try {
            return TextSearch.search(
                o.getString("root"), o.getString("query"), o.optBoolean("regex"), o.optBoolean("caseSensitive"),
                o.optBoolean("wholeWord"), o.strList("include"), o.strList("exclude"), o.optInt("max", 3000)
            ) { searchCancel[id] == true }
        } finally {
            searchCancel.remove(id)
        }
    }

    private fun bodyOf(o: JSONObject): ByteArray? = when {
        o.has("bodyB64") -> Base64.decode(o.getString("bodyB64"), Base64.DEFAULT)
        o.has("body") && !o.isNull("body") -> o.getString("body").toByteArray(Charsets.UTF_8)
        else -> null
    }

    private fun netRequest(o: JSONObject): JSONObject {
        val (r, bytes) = Net.request(o.getString("url"), o.optString("method", "GET"), o.headerMap("headers"), bodyOf(o), o.optInt("timeoutMs", 60_000))
        val res = JSONObject().put("status", r.status).put("statusText", r.statusText).put("url", r.url)
        val h = JSONObject()
        for ((k, v) in r.headers) h.put(k, v)
        res.put("headers", h)
        if (o.optString("as", "text") == "b64") res.put("b64", Net.b64(bytes)) else res.put("text", String(bytes, Charsets.UTF_8))
        return res
    }

    private fun netStream(o: JSONObject) {
        val id = o.getString("id")
        pool.execute {
            try {
                val r = Net.open(
                    o.getString("url"), o.optString("method", "GET"), o.headerMap("headers"), bodyOf(o),
                    20_000, o.optInt("timeoutMs", 10 * 60_000), id, identityEncoding = true
                )
                val h = JSONObject()
                for ((k, v) in r.headers) h.put(k, v)
                emit("net.head", JSONObject().put("id", id).put("status", r.status).put("statusText", r.statusText).put("url", r.url).put("headers", h))
                r.stream?.use { ins ->
                    val buf = ByteArray(16 * 1024)
                    while (true) {
                        val n = ins.read(buf)
                        if (n < 0) break
                        if (n > 0) emit("net.chunk", JSONObject().put("id", id).put("b64", Net.b64(buf, n)))
                    }
                }
                emit("net.end", JSONObject().put("id", id))
            } catch (e: Throwable) {
                emit("net.error", JSONObject().put("id", id).put("message", e.message ?: e.javaClass.simpleName))
            } finally {
                Net.release(id)
            }
        }
    }

    private fun netDownload(o: JSONObject): JSONObject {
        val id = o.optString("id", "dl")
        val dest = File(o.getString("dest"))
        Net.download(o.getString("url"), dest, o.headerMap("headers")) { done, total ->
            emit("net.progress", JSONObject().put("id", id).put("done", done).put("total", total))
        }
        return JSONObject().put("path", dest.path).put("size", dest.length())
    }

    private fun termCreate(o: JSONObject): JSONObject {
        val cmd = o.optJSONArray("command")?.let { arr -> (0 until arr.length()).map { arr.getString(it) } }
        val extra = LinkedHashMap<String, String>()
        o.optJSONObject("env")?.let { e -> for (k in e.keys()) extra[k] = e.optString(k) }
        val launch = LinuxEnv.launch(o.optString("mode", "auto"), o.optString("cwd", "").ifEmpty { null }, cmd, extra)
        val s = SessionManager.create(o.optString("title", "").ifEmpty { null }, launch, o.optInt("rows", 24), o.optInt("cols", 80), termListener)
        return termInfo(s)
    }

    private fun procExec(o: JSONObject): JSONObject {
        val cmd: List<String> = o.optJSONArray("command")?.let { arr -> (0 until arr.length()).map { arr.getString(it) } }
            ?: listOf("/bin/sh", "-c", o.getString("line"))
        val extra = LinkedHashMap<String, String>()
        o.optJSONObject("env")?.let { e -> for (k in e.keys()) extra[k] = e.optString(k) }
        val l = LinuxEnv.launch(o.optString("mode", "auto"), o.optString("cwd", "").ifEmpty { null }, cmd, extra)
        val pb = ProcessBuilder(listOf(l.cmd) + l.args.drop(1))
        pb.directory(File(l.cwd))
        pb.redirectErrorStream(true)
        val env = pb.environment()
        env.clear()
        for (kv in l.env) { val i = kv.indexOf('='); if (i > 0) env[kv.substring(0, i)] = kv.substring(i + 1) }
        val p = pb.start()
        val out = ByteArrayOutputStream()
        val reader = Thread {
            val buf = ByteArray(8192)
            try {
                while (true) {
                    val n = p.inputStream.read(buf)
                    if (n < 0) break
                    if (out.size() < 1_000_000) synchronized(out) { out.write(buf, 0, n) }
                }
            } catch (_: Exception) {}
        }
        reader.start()
        val timeout = o.optLong("timeoutMs", 120_000)
        val done = p.waitFor(timeout, TimeUnit.MILLISECONDS)
        if (!done) { p.destroyForcibly(); }
        reader.join(1000)
        val text = synchronized(out) { String(out.toByteArray(), Charsets.UTF_8) }
        return JSONObject().put("code", if (done) p.exitValue() else -1).put("out", text).put("timedOut", !done)
    }
}
