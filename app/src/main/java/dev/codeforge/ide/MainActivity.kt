package dev.codeforge.ide

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.KeyguardManager
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.CancellationSignal
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.codeforge.ide.bridge.Bridge
import dev.codeforge.ide.core.CrashRecorder
import dev.codeforge.ide.core.FsOps
import dev.codeforge.ide.core.Paths
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

/**
 * Hosts the CodeForge web IDE in a WebView. The UI is served from the APK over https://appassets.androidplatform.net/
 * and can talk to native code only through the origin-restricted [Bridge] (never from preview iframes).
 */
class MainActivity : Activity(), Bridge.Host {
    private lateinit var web: WebView
    private var pick: Pair<String, CompletableFuture<JSONObject?>>? = null
    private var fileChooser: ValueCallback<Array<Uri>>? = null
    private val ui = android.os.Handler(android.os.Looper.getMainLooper())
    private val heartbeat = object : Runnable {
        override fun run() { CrashRecorder.crumb(CrashRecorder.memoryLine()); ui.postDelayed(this, 30_000) }
    }

    // ------------------------------------------------------------------ lifecycle

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Paths.init(this)
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            setContentView(TextView(this).apply {
                setPadding(48, 96, 48, 48)
                setTextColor(0xFFDDDDDD.toInt())
                setBackgroundColor(0xFF1E1E1E.toInt())
                text = "CodeForge needs a newer Android System WebView.\n\nPlease update \"Android System WebView\" and \"Google Chrome\" from the Play Store, then reopen the app."
            })
            return
        }
        Bridge.host = this
        CrashRecorder.crumb("MainActivity.onCreate" + if (savedInstanceState != null) " (restored)" else "")
        buildWebView()
        setContentView(web)
        requestNotificationPermission()
        handleIntent(intent)
        web.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.onResume()
            Bridge.setUiActive(true)
            Bridge.emit("app.resume", JSONObject().put("allFiles", hasAllFiles()))
        }
        CrashRecorder.foreground = true
        CrashRecorder.crumb("resume")
        ui.removeCallbacks(heartbeat); ui.postDelayed(heartbeat, 30_000)
    }

    override fun onPause() {
        if (::web.isInitialized) { Bridge.emit("app.pause", JSONObject()); web.onPause(); Bridge.setUiActive(false) }
        CrashRecorder.crumb("pause")
        ui.removeCallbacks(heartbeat)
        super.onPause()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        // Memory is getting short: let the UI drop the inline preview and other heavy things BEFORE Android kills the process.
        if (level >= TRIM_MEMORY_RUNNING_LOW && ::web.isInitialized) {
            CrashRecorder.crumb("trimMemory level=$level ${CrashRecorder.memoryLine()}")
            Bridge.emit("app.memory", JSONObject().put("level", level))
        }
    }

    override fun onLowMemory() {
        super.onLowMemory()
        CrashRecorder.crumb("onLowMemory ${CrashRecorder.memoryLine()}")
        if (::web.isInitialized) Bridge.emit("app.memory", JSONObject().put("level", 15))
    }

    override fun onDestroy() {
        if (Bridge.host === this) Bridge.host = null
        if (::web.isInitialized) {
            (web.parent as? ViewGroup)?.removeView(web)
            web.destroy()
        }
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (!::web.isInitialized) { super.onBackPressed(); return }
        web.evaluateJavascript("(window.__cfBack && window.__cfBack()) === true") { r ->
            if (r != "true") moveTaskToBack(true)
        }
    }

    // ------------------------------------------------------------------ WebView

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView() {
        web = WebView(this)
        web.setBackgroundColor(0xFF1E1E1E.toInt())
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW // IDE (https) embeds http://127.0.0.1 previews
            setSupportZoom(false)
            builtInZoomControls = false
            textZoom = 100
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = userAgentString + " CodeForge/" + BuildConfig.VERSION_NAME
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/__fs__/", WebViewAssetLoader.PathHandler { path -> serveFile(path) })
            .addPathHandler("/", WebViewAssetLoader.PathHandler { path -> serveAsset(path) })
            .build()

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                if (request.isForMainFrame) { openUrl(request.url.toString()); return true }
                return false
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
            }

            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                // The WebView's renderer crashed or was killed for memory. Without this override the whole app would die.
                // Rebuild the view instead; terminals, dev servers and files are untouched.
                val crashed = detail.didCrash()
                CrashRecorder.record("renderer", if (crashed) "Editor view crashed (WebView renderer)" else "Editor view killed to free memory",
                    "didCrash=$crashed\n" + CrashRecorder.memoryLine(), fatal = false, withLogcat = true)
                Bridge.recovery = JSONObject().put("kind", "renderer").put("crashed", crashed).put("at", System.currentTimeMillis())
                runOnUiThread { try { recreate() } catch (_: Throwable) { } }
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                android.util.Log.d("CodeForgeWeb", "${m.sourceId()}:${m.lineNumber()} ${m.message()}")
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }

            override fun onShowFileChooser(
                view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                fileChooser?.onReceiveValue(null)
                fileChooser = cb
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE_CHOOSER)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileChooser = null
                    false
                }
            }
        }

        // The ONLY door to native code. Allowed origin = the IDE's own origin; iframes from other origins never see it.
        WebViewCompat.addWebMessageListener(
            web, "CFNative", setOf("https://appassets.androidplatform.net")
        ) { _, message, _, isMainFrame, replyProxy ->
            if (isMainFrame) {
                val text = message.data
                if (text != null) Bridge.onMessage(text, replyProxy)
            }
        }
    }

    private fun serveAsset(path: String): WebResourceResponse? {
        val rel = (if (path.isEmpty() || path.endsWith("/")) path + "index.html" else path).substringBefore('?')
        if (rel.contains("..")) return notFound()
        return try {
            val ins = assets.open("www/$rel")
            val mime = mimeOf(rel)
            WebResourceResponse(mime, if (mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript")) "utf-8" else null, ins)
        } catch (_: Exception) {
            notFound()
        }
    }

    /** /__fs__/<token>/<absolute path>: raw file bytes for images, media and downloads shown inside the IDE. */
    private fun serveFile(path: String): WebResourceResponse? {
        val slash = path.indexOf('/')
        if (slash < 0 || path.substring(0, slash) != Bridge.fsToken) return notFound()
        val abs = "/" + java.net.URLDecoder.decode(path.substring(slash + 1).replace("+", "%2B"), "UTF-8").trimStart('/')
        val f = File(abs)
        if (!f.isFile) return notFound()
        return try {
            WebResourceResponse(dev.codeforge.ide.core.LiveServer.mimeOf(f.name).substringBefore(';'), null, 200, "OK",
                mapOf("Cache-Control" to "no-store", "Content-Length" to f.length().toString()), FileInputStream(f))
        } catch (_: Exception) { notFound() }
    }

    private fun notFound() = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))

    private fun mimeOf(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "html", "htm" -> "text/html"
        "js", "mjs" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "gif" -> "image/gif"
        "webp" -> "image/webp"
        "ico" -> "image/x-icon"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "ttf" -> "font/ttf"
        "wasm" -> "application/wasm"
        "txt", "md" -> "text/plain"
        else -> "application/octet-stream"
    }

    // ------------------------------------------------------------------ intents ("Open with CodeForge")

    private fun handleIntent(i: Intent?) {
        if (i == null) return
        val uri: Uri? = when (i.action) {
            Intent.ACTION_VIEW -> i.data
            Intent.ACTION_SEND -> if (Build.VERSION.SDK_INT >= 33) i.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
                                  else @Suppress("DEPRECATION") i.getParcelableExtra(Intent.EXTRA_STREAM)
            else -> null
        }
        if (uri == null) return
        val name = if (uri.scheme == "file") File(uri.path ?: "").name else dev.codeforge.ide.core.Saf.displayName(uri) ?: "file"
        val o = JSONObject().put("uri", uri.toString()).put("name", name).put("mime", i.type ?: contentResolver.getType(uri) ?: "")
        if (uri.scheme == "file") o.put("path", uri.path)
        Bridge.pendingIntent = o
        Bridge.emit("app.intent", o)
    }

    // ------------------------------------------------------------------ Bridge.Host

    override fun pick(kind: String, args: JSONObject): JSONObject? {
        val fut = CompletableFuture<JSONObject?>()
        runOnUiThread {
            try {
                val intent = when (kind) {
                    "file" -> Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        val mimes = args.optJSONArray("mimes")
                        if (mimes != null && mimes.length() > 0) putExtra(Intent.EXTRA_MIME_TYPES, Array(mimes.length()) { mimes.getString(it) })
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, args.optBoolean("multiple", false))
                    }
                    "folder" -> Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
                    }
                    else -> Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = args.optString("mime", "application/octet-stream")
                        putExtra(Intent.EXTRA_TITLE, args.optString("name", "file"))
                    }
                }
                pick?.second?.complete(null)
                pick = Pair(kind, fut)
                startActivityForResult(intent, REQ_PICK)
            } catch (e: Exception) {
                fut.completeExceptionally(e)
            }
        }
        return fut.get(20, TimeUnit.MINUTES)
    }

    // ------------------------------------------------------------------ biometrics / device credential
    override fun authStatus(): JSONObject {
        var bio = false; var cred = false
        try {
            val km = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
            cred = km.isDeviceSecure
            bio = when {
                Build.VERSION.SDK_INT >= 30 -> getSystemService(BiometricManager::class.java).canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS
                Build.VERSION.SDK_INT == 29 -> getSystemService(BiometricManager::class.java).canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS || cred
                Build.VERSION.SDK_INT == 28 -> packageManager.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)
                else -> false
            }
        } catch (_: Throwable) { }
        return JSONObject().put("biometric", bio).put("deviceSecure", cred).put("sdk", Build.VERSION.SDK_INT)
    }

    override fun authenticate(title: String, subtitle: String): JSONObject {
        if (Build.VERSION.SDK_INT < 28) return JSONObject().put("ok", false).put("unsupported", true)
        val fut = CompletableFuture<JSONObject>()
        runOnUiThread {
            try {
                val cancel = CancellationSignal()
                val b = BiometricPrompt.Builder(this).setTitle(title)
                if (subtitle.isNotEmpty()) b.setSubtitle(subtitle)
                if (Build.VERSION.SDK_INT >= 30) {
                    b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                } else {
                    b.setNegativeButton("Use PIN", mainExecutor) { _, _ -> fut.complete(JSONObject().put("ok", false).put("cancelled", true)) }
                }
                b.build().authenticate(cancel, mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult?) { fut.complete(JSONObject().put("ok", true)) }
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                        // 10 = user cancelled, 13 = negative button, 5 = cancelled by system
                        val cancelled = errorCode == 10 || errorCode == 13 || errorCode == 5
                        fut.complete(JSONObject().put("ok", false).put("cancelled", cancelled).put("error", errString?.toString() ?: "error $errorCode"))
                    }
                })
            } catch (e: Throwable) { fut.complete(JSONObject().put("ok", false).put("error", e.message ?: "biometric prompt failed")) }
        }
        return try { fut.get(2, TimeUnit.MINUTES) } catch (e: Exception) { JSONObject().put("ok", false).put("cancelled", true) }
    }

    /** Hides app content in the recent-apps switcher and blocks screenshots / screen recording. */
    override fun setSecure(on: Boolean) {
        runOnUiThread {
            if (on) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    override fun hasAllFiles(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    override fun requestAllFiles() {
        runOnUiThread {
            if (Build.VERSION.SDK_INT >= 30) {
                try {
                    startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
                } catch (_: Exception) {
                    startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                }
            } else {
                requestPermissions(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_STORAGE)
            }
        }
    }

    override fun setSystemBars(color: Int, lightIcons: Boolean) {
        runOnUiThread {
            window.statusBarColor = color
            window.navigationBarColor = color
            if (Build.VERSION.SDK_INT >= 30) {
                val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                window.insetsController?.setSystemBarsAppearance(if (lightIcons) mask else 0, mask)
            } else {
                @Suppress("DEPRECATION")
                window.decorView.systemUiVisibility = if (lightIcons) {
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or (if (Build.VERSION.SDK_INT >= 26) View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR else 0)
                } else 0
            }
            if (::web.isInitialized) web.setBackgroundColor(color)
        }
    }

    override fun keepAwake(on: Boolean) {
        runOnUiThread {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    override fun openPreview(url: String, title: String) {
        runOnUiThread {
            try {
                val i = Intent(this, PreviewActivity::class.java).putExtra(PreviewActivity.EXTRA_URL, url).putExtra(PreviewActivity.EXTRA_TITLE, title)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT)
                CrashRecorder.crumb("open isolated preview ${url.take(100)}")
                startActivity(i)
            } catch (e: Throwable) {
                CrashRecorder.crumb("open isolated preview failed: ${e.message}")
            }
        }
    }

    override fun openUrl(url: String) {
        runOnUiThread {
            val uri = Uri.parse(url)
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) {
                // no default browser set (or it refused): let the user pick, and as a last resort show the page in the built-in preview window
                try { startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW, uri), "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                catch (_: Exception) { openPreview(url, "Preview") }
            }
        }
    }

    override fun share(args: JSONObject) {
        runOnUiThread {
            try {
                val i = Intent(Intent.ACTION_SEND)
                val path = args.optString("path", "")
                if (path.isNotEmpty()) {
                    var f = File(path)
                    val home = Paths.home.canonicalPath
                    if (!f.canonicalPath.startsWith(home + File.separator)) {
                        // The documents provider only serves the workspace, so stage outside files there.
                        val staged = File(Paths.home, ".cf-share/${f.name}")
                        staged.parentFile?.mkdirs()
                        f.copyTo(staged, overwrite = true)
                        f = staged
                    }
                    val uri = DocumentsContract.buildDocumentUri("$packageName.documents", f.path)
                    i.putExtra(Intent.EXTRA_STREAM, uri)
                    i.clipData = ClipData.newRawUri(f.name, uri)
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    i.type = args.optString("mime", "").ifEmpty { dev.codeforge.ide.core.LiveServer.mimeOf(f.name).substringBefore(';') }
                } else {
                    i.type = "text/plain"
                    i.putExtra(Intent.EXTRA_TEXT, args.optString("text", ""))
                }
                startActivity(Intent.createChooser(i, args.optString("title", "Share")))
            } catch (_: Exception) {}
        }
    }

    override fun finishApp() {
        runOnUiThread { finishAndRemoveTask() }
    }

    override fun moveToBack() {
        runOnUiThread { moveTaskToBack(true) }
    }

    // ------------------------------------------------------------------ results & permissions

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        when (requestCode) {
            REQ_FILE_CHOOSER -> {
                val cb = fileChooser
                fileChooser = null
                cb?.onReceiveValue(if (resultCode == RESULT_OK) android.webkit.WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null)
            }
            REQ_PICK -> {
                val p = pick ?: return
                pick = null
                if (resultCode != RESULT_OK || data == null) { p.second.complete(null); return }
                try {
                    when (p.first) {
                        "folder" -> {
                            val uri = data.data!!
                            try {
                                contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                            } catch (_: Exception) {}
                            val docId = DocumentsContract.getTreeDocumentId(uri)
                            p.second.complete(JSONObject().put("uri", uri.toString()).put("name", docId.substringAfterLast(':').substringAfterLast('/').ifEmpty { "folder" }))
                        }
                        "create" -> {
                            val uri = data.data!!
                            p.second.complete(JSONObject().put("uri", uri.toString()).put("name", dev.codeforge.ide.core.Saf.displayName(uri) ?: ""))
                        }
                        else -> {
                            val uris = ArrayList<Uri>()
                            data.clipData?.let { cd -> for (k in 0 until cd.itemCount) uris.add(cd.getItemAt(k).uri) }
                            if (uris.isEmpty()) data.data?.let { uris.add(it) }
                            val arr = JSONArray()
                            for (u in uris) {
                                arr.put(JSONObject().put("uri", u.toString()).put("name", dev.codeforge.ide.core.Saf.displayName(u) ?: "file")
                                    .put("size", dev.codeforge.ide.core.Saf.size(u)).put("mime", contentResolver.getType(u) ?: ""))
                            }
                            p.second.complete(JSONObject().put("files", arr))
                        }
                    }
                } catch (e: Exception) {
                    p.second.completeExceptionally(e)
                }
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_STORAGE && ::web.isInitialized) Bridge.emit("app.resume", JSONObject().put("allFiles", hasAllFiles()))
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        }
    }

    companion object {
        private const val REQ_PICK = 4101
        private const val REQ_FILE_CHOOSER = 4102
        private const val REQ_STORAGE = 4103
        private const val REQ_NOTIF = 4104
    }
}
