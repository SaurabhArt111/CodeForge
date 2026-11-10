package dev.codeforge.ide

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import dev.codeforge.ide.core.CrashRecorder

/**
 * Isolated preview window. Runs in its own process (":preview"), so a page that exhausts memory, hangs the GPU or
 * crashes its renderer can never take the editor, the terminals or the dev servers down with it.
 * It has NO bridge to the IDE: it is a plain browser view with a console, reload and "open in browser".
 * Live reload keeps working because the page itself carries the live-server client script.
 */
class PreviewActivity : Activity() {
    private var web: WebView? = null
    private lateinit var holder: FrameLayout
    private lateinit var urlView: TextView
    private lateinit var progress: ProgressBar
    private lateinit var consoleScroll: ScrollView
    private lateinit var consoleText: TextView
    private lateinit var consoleBtn: TextView
    private lateinit var crashBanner: LinearLayout
    private lateinit var backBtn: TextView
    private lateinit var fwdBtn: TextView
    private var currentUrl = ""
    private var errors = 0
    private val lines = ArrayDeque<String>()
    private var fileChooser: ValueCallback<Array<Uri>>? = null

    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrashRecorder.crumb("preview window created")
        window.statusBarColor = BG
        window.navigationBarColor = BG
        buildUi()
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private val triedHosts = HashSet<String>()

    private fun handle(i: Intent?) {
        val url = i?.getStringExtra(EXTRA_URL) ?: return
        currentUrl = url
        title = i.getStringExtra(EXTRA_TITLE) ?: "Preview"
        triedHosts.clear()
        errors = 0; lines.clear(); consoleText.text = ""; updateConsoleBtn()
        crashBanner.visibility = View.GONE
        ensureWeb().loadUrl(url)
    }

    override fun onStart() { super.onStart(); web?.onResume() }
    override fun onStop() { web?.onPause(); super.onStop() }
    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        CrashRecorder.crumb("preview trimMemory level=$level ${CrashRecorder.memoryLine()}")
    }

    override fun onDestroy() {
        destroyWeb()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val w = web
        if (w != null && w.canGoBack()) w.goBack() else finish()
    }

    // ------------------------------------------------------------------ UI

    private fun btn(label: String, desc: String, onClick: () -> Unit) = TextView(this).apply {
        text = label; contentDescription = desc
        setTextColor(FG); setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f); gravity = Gravity.CENTER
        minWidth = dp(44); minHeight = dp(44)
        setPadding(dp(6), 0, dp(6), 0)
        setOnClickListener { onClick() }
        isClickable = true
        isFocusable = true
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(BG) }

        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setBackgroundColor(BAR); setPadding(dp(4), 0, dp(4), 0) }
        backBtn = btn("‹", "Back") { web?.takeIf { it.canGoBack() }?.goBack() }
        fwdBtn = btn("›", "Forward") { web?.takeIf { it.canGoForward() }?.goForward() }
        val reload = btn("⟳", "Reload") { crashBanner.visibility = View.GONE; ensureWeb().reload() }
        urlView = TextView(this).apply {
            setTextColor(MUTED); setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f); typeface = Typeface.MONOSPACE
            maxLines = 1; ellipsize = TextUtils.TruncateAt.START; setPadding(dp(8), 0, dp(8), 0)
            setBackgroundColor(INPUT)
            gravity = Gravity.CENTER_VERTICAL
        }
        consoleBtn = btn("Console", "Toggle console") { toggleConsole() }.apply { setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f) }
        val browser = btn("↗", "Open in browser") {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(web?.url ?: currentUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        }
        val close = btn("✕", "Close preview") { finish() }
        bar.addView(close); bar.addView(backBtn); bar.addView(fwdBtn); bar.addView(reload)
        bar.addView(urlView, LinearLayout.LayoutParams(0, dp(34), 1f).apply { setMargins(dp(4), 0, dp(4), 0) })
        bar.addView(consoleBtn); bar.addView(browser)
        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)))

        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; visibility = View.INVISIBLE }
        root.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))

        holder = FrameLayout(this)
        root.addView(holder, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        consoleText = TextView(this).apply { setTextColor(FG); setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f); typeface = Typeface.MONOSPACE; setPadding(dp(8), dp(4), dp(8), dp(4)); setTextIsSelectable(true) }
        consoleScroll = ScrollView(this).apply { setBackgroundColor(0xEE1A1A1A.toInt()); visibility = View.GONE; addView(consoleText) }
        root.addView(consoleScroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 0f).apply { })

        crashBanner = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setBackgroundColor(BG); visibility = View.GONE; setPadding(dp(24), dp(24), dp(24), dp(24))
            addView(TextView(this@PreviewActivity).apply { text = "This page crashed"; setTextColor(FG); setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f); gravity = Gravity.CENTER })
            addView(TextView(this@PreviewActivity).apply {
                text = "The preview ran out of memory or its renderer stopped. The editor is unaffected.\nHeavy WebGL / canvas pages are the usual cause: lower the resolution or particle count."
                setTextColor(MUTED); setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f); gravity = Gravity.CENTER; setPadding(0, dp(8), 0, dp(16))
            })
            addView(btn("Reload page", "Reload") { crashBanner.visibility = View.GONE; ensureWeb().loadUrl(currentUrl) }.apply { setBackgroundColor(ACCENT); setPadding(dp(18), 0, dp(18), 0) })
        }
        setContentView(root)
        holder.addView(crashBanner, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun toggleConsole() {
        val show = consoleScroll.visibility != View.VISIBLE
        consoleScroll.visibility = if (show) View.VISIBLE else View.GONE
        (consoleScroll.layoutParams as LinearLayout.LayoutParams).apply { height = if (show) dp(220) else 0; weight = 0f }
        consoleScroll.requestLayout()
        if (show) consoleScroll.post { consoleScroll.fullScroll(View.FOCUS_DOWN) }
    }

    private fun updateConsoleBtn() { consoleBtn.text = if (errors > 0) "Console ($errors)" else "Console"; consoleBtn.setTextColor(if (errors > 0) 0xFFF85149.toInt() else FG) }

    private fun log(level: String, msg: String) {
        val line = (if (level == "ERROR") "✖ " else if (level == "WARNING") "⚠ " else "› ") + msg.take(1500)
        lines.addLast(line)
        while (lines.size > 300) lines.removeFirst()   // never grow without bound
        if (level == "ERROR") { errors++; updateConsoleBtn() }
        if (consoleScroll.visibility == View.VISIBLE) {
            consoleText.text = lines.joinToString("\n")
            consoleScroll.post { consoleScroll.fullScroll(View.FOCUS_DOWN) }
        }
    }

    // ------------------------------------------------------------------ WebView

    private fun ensureWeb(): WebView = web ?: createWeb().also { web = it }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWeb(): WebView {
        val w = WebView(this)
        w.setBackgroundColor(Color.WHITE)
        with(w.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_NO_CACHE
            setSupportZoom(true); builtInZoomControls = true; displayZoomControls = false
            useWideViewPort = true; loadWithOverviewMode = true
            userAgentString = userAgentString + " CodeForgePreview/" + BuildConfig.VERSION_NAME
        }
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.scheme == "http" || u.scheme == "https" || u.scheme == "about" || u.scheme == "blob" || u.scheme == "data") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: ActivityNotFoundException) {}
                return true
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE; progress.progress = 5
                urlView.text = url ?: ""
                errors = 0; updateConsoleBtn()
                CrashRecorder.crumb("preview load ${url?.take(120)}")
            }
            override fun onPageFinished(view: WebView, url: String?) {
                progress.visibility = View.INVISIBLE
                urlView.text = url ?: ""
                backBtn.alpha = if (view.canGoBack()) 1f else .35f; fwdBtn.alpha = if (view.canGoForward()) 1f else .35f
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                // "localhost", "127.0.0.1" and "[::1]" are different sockets: a dev server that listens on only one of them refuses the others.
                // Try the other two before giving up.
                val host = request.url.host ?: ""
                if (error.errorCode == WebViewClient.ERROR_CONNECT && host in LOOPBACK) {
                    triedHosts.add(host)
                    val next = LOOPBACK.firstOrNull { it !in triedHosts }
                    if (next != null) {
                        val port = if (request.url.port > 0) ":${request.url.port}" else ""
                        val u = request.url.buildUpon().encodedAuthority(next + port).build().toString()
                        CrashRecorder.crumb("preview retry ${host} -> ${next}")
                        view.post { view.loadUrl(u) }
                        return
                    }
                }
                val shown = currentUrl.ifEmpty { request.url.toString() }
                val html = "<meta name=viewport content='width=device-width,initial-scale=1'><body style=\"font:15px system-ui;background:#1e1e1e;color:#ddd;padding:28px\"><h3>Can't reach the page</h3>" +
                    "<p>${error.description}</p><p style='color:#999'>${shown}</p>" +
                    "<p>Nothing is listening on that address. Start the server again in CodeForge (Run, or <code>npm run dev</code> in the terminal), then " +
                    "<a style='color:#4fc1ff' href=\"${shown}\">try again</a>.</p>"
                view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
            }
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // Renderer died (OOM kill or crash). Record it, throw the view away, offer a reload — the IDE process is untouched.
                CrashRecorder.record("preview-renderer", if (detail.didCrash()) "Preview renderer crashed" else "Preview renderer killed (memory)",
                    "url=$currentUrl\ndidCrash=${detail.didCrash()}\n${CrashRecorder.memoryLine()}", fatal = false, withLogcat = true)
                runOnUiThread {
                    destroyWeb()
                    crashBanner.visibility = View.VISIBLE
                    crashBanner.bringToFront()
                }
                return true
            }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) { progress.progress = newProgress }
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                log(m.messageLevel().name, "${m.message()}  (${m.sourceId().substringAfterLast('/')}:${m.lineNumber()})")
                return true
            }
            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileChooser?.onReceiveValue(null); fileChooser = cb
                return try { startActivityForResult(params.createIntent(), REQ_FILE); true } catch (_: ActivityNotFoundException) { fileChooser = null; false }
            }
        }
        w.setDownloadListener { url, _, _, _, _ ->
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) {}
        }
        holder.addView(w, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return w
    }

    private fun destroyWeb() {
        val w = web ?: return
        web = null
        try { (w.parent as? ViewGroup)?.removeView(w); w.stopLoading(); w.destroy() } catch (_: Throwable) {}
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) {
            val cb = fileChooser; fileChooser = null
            cb?.onReceiveValue(if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null)
        }
    }

    companion object {
        private val LOOPBACK = listOf("localhost", "127.0.0.1", "[::1]")
        const val EXTRA_URL = "url"
        const val EXTRA_TITLE = "title"
        private const val REQ_FILE = 4201
        private const val BG = 0xFF1E1E1E.toInt()
        private const val BAR = 0xFF252526.toInt()
        private const val INPUT = 0xFF313131.toInt()
        private const val FG = 0xFFDDDDDD.toInt()
        private const val MUTED = 0xFF9D9D9D.toInt()
        private const val ACCENT = 0xFF007ACC.toInt()
    }
}
