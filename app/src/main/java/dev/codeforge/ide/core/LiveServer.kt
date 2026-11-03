package dev.codeforge.ide.core

import dev.codeforge.ide.service.SessionService
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

/**
 * A small static dev server with live reload (Server-Sent Events), CSS hot-swap, SPA fallback and
 * console/error forwarding to the IDE's preview panel. Pure JDK sockets: no node needed.
 */
class LiveServer(
    val root: File,
    requestedPort: Int,
    val spa: Boolean,
    val lan: Boolean,
    private val log: (String) -> Unit
) {
    val port: Int
    private val server: ServerSocket
    private val clients = CopyOnWriteArrayList<OutputStream>()
    private val pool = Executors.newCachedThreadPool()
    private val rootCanon = root.canonicalFile
    @Volatile private var running = true

    init {
        val addr = InetAddress.getByName(if (lan) "0.0.0.0" else "127.0.0.1")
        var s: ServerSocket? = null
        if (requestedPort > 0) {
            for (p in requestedPort..requestedPort + 30) {
                try { s = ServerSocket(p, 64, addr); break } catch (_: IOException) {}
            }
        }
        server = s ?: ServerSocket(0, 64, addr)
        port = server.localPort
        Thread({ acceptLoop() }, "live-accept-$port").also { it.isDaemon = true; it.start() }
        Thread({ watchLoop() }, "live-watch-$port").also { it.isDaemon = true; it.start() }
        Thread({ pingLoop() }, "live-ping-$port").also { it.isDaemon = true; it.start() }
    }

    fun stop() {
        running = false
        try { server.close() } catch (_: IOException) {}
        for (c in clients) try { c.close() } catch (_: IOException) {}
        clients.clear()
        pool.shutdownNow()
    }

    fun broadcast(event: String, data: String) {
        val msg = "event: $event\ndata: ${data.replace("\n", " ")}\n\n".toByteArray()
        for (c in clients) {
            try { synchronized(c) { c.write(msg); c.flush() } } catch (_: IOException) { clients.remove(c) }
        }
    }

    fun clientCount(): Int = clients.size

    // ---------------------------------------------------------------- accept / handle

    private fun acceptLoop() {
        while (running) {
            try {
                val sock = server.accept()
                pool.execute { try { handle(sock) } catch (_: Throwable) { try { sock.close() } catch (_: IOException) {} } }
            } catch (_: IOException) {
                if (!running) return
            }
        }
    }

    private fun readLine(ins: BufferedInputStream): String? {
        val sb = ByteArrayOutputStream()
        while (true) {
            val b = ins.read()
            if (b < 0) return if (sb.size() == 0) null else sb.toString("UTF-8")
            if (b == '\n'.code) break
            if (b != '\r'.code) sb.write(b)
            if (sb.size() > 16384) throw IOException("header too long")
        }
        return sb.toString("UTF-8")
    }

    private fun handle(sock: Socket) {
        sock.soTimeout = 30_000
        val ins = BufferedInputStream(sock.getInputStream())
        val out = BufferedOutputStream(sock.getOutputStream())
        val reqLine = readLine(ins) ?: run { sock.close(); return }
        val parts = reqLine.split(" ")
        if (parts.size < 2) { sock.close(); return }
        val method = parts[0].uppercase()
        val target = parts[1]
        val headers = HashMap<String, String>()
        while (true) {
            val l = readLine(ins) ?: break
            if (l.isEmpty()) break
            val i = l.indexOf(':')
            if (i > 0) headers[l.substring(0, i).trim().lowercase()] = l.substring(i + 1).trim()
        }
        val rawPath = target.substringBefore('?').substringBefore('#')
        val path = try { URLDecoder.decode(rawPath.replace("+", "%2B"), "UTF-8") } catch (_: Exception) { rawPath }

        if (method == "OPTIONS") { respond(out, 204, "No Content", "text/plain", ByteArray(0), method); out.flush(); sock.close(); return }
        if (method != "GET" && method != "HEAD") {
            respond(out, 405, "Method Not Allowed", "text/plain", "Only GET is supported by the static server".toByteArray(), method)
            out.flush(); sock.close(); return
        }

        if (path == "/__cf_live.js") {
            respond(out, 200, "OK", "text/javascript; charset=utf-8", CLIENT_JS.toByteArray(), method)
            out.flush(); sock.close(); return
        }
        if (path == "/__cf_live") {
            sock.soTimeout = 0
            out.write(
                ("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n" +
                    "Connection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\nretry: 1500\n: connected\n\n").toByteArray()
            )
            out.flush()
            clients.add(out)
            try { while (ins.read() >= 0) { /* wait for the client to go away */ } } catch (_: IOException) {}
            clients.remove(out)
            try { sock.close() } catch (_: IOException) {}
            return
        }

        var file = File(root, path.trimStart('/')).canonicalFile
        val inside = file.path == rootCanon.path || file.path.startsWith(rootCanon.path + File.separator)
        if (!inside) {
            respond(out, 403, "Forbidden", "text/plain", "Forbidden".toByteArray(), method)
            log("$method $path 403"); out.flush(); sock.close(); return
        }

        if (file.isDirectory) {
            if (!path.endsWith("/")) {
                out.write(("HTTP/1.1 301 Moved Permanently\r\nLocation: $rawPath/\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").toByteArray())
                out.flush(); sock.close(); log("$method $path 301"); return
            }
            val idx = listOf("index.html", "index.htm").map { File(file, it) }.firstOrNull { it.isFile }
            if (idx != null) file = idx else {
                val html = listing(file, path)
                respond(out, 200, "OK", "text/html; charset=utf-8", inject(html).toByteArray(), method)
                log("$method $path 200 (listing)"); out.flush(); sock.close(); return
            }
        }
        if (!file.isFile && spa && !path.substringAfterLast('/').contains('.')) {
            val idx = File(root, "index.html")
            if (idx.isFile) file = idx
        }
        if (!file.isFile) {
            val body = "<!doctype html><meta charset=utf-8><title>404</title><body style=\"font:14px system-ui;padding:2em\"><h2>404 – Not found</h2><p>${esc(path)}</p>"
            respond(out, 404, "Not Found", "text/html; charset=utf-8", inject(body).toByteArray(), method)
            log("$method $path 404"); out.flush(); sock.close(); return
        }

        val mime = mimeOf(file.name)
        if (mime.startsWith("text/html")) {
            val html = inject(file.readText())
            respond(out, 200, "OK", "text/html; charset=utf-8", html.toByteArray(), method)
        } else {
            sendFile(out, file, mime, headers["range"], method)
        }
        log("$method $path 200")
        out.flush()
        sock.close()
    }

    private fun sendFile(out: OutputStream, file: File, mime: String, range: String?, method: String) {
        val len = file.length()
        var start = 0L
        var end = len - 1
        var status = 200
        if (range != null && range.startsWith("bytes=")) {
            val r = range.removePrefix("bytes=").split("-")
            val a = r.getOrNull(0)?.toLongOrNull()
            val b = r.getOrNull(1)?.toLongOrNull()
            if (a != null) { start = a; if (b != null) end = minOf(b, len - 1) }
            else if (b != null) { start = maxOf(0, len - b) }
            if (start in 0..end) status = 206 else { start = 0; end = len - 1 }
        }
        val count = if (len == 0L) 0 else end - start + 1
        val sb = StringBuilder()
        sb.append(if (status == 206) "HTTP/1.1 206 Partial Content\r\n" else "HTTP/1.1 200 OK\r\n")
        sb.append("Content-Type: $mime\r\nContent-Length: $count\r\nAccept-Ranges: bytes\r\n")
        if (status == 206) sb.append("Content-Range: bytes $start-$end/$len\r\n")
        sb.append("Cache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n")
        out.write(sb.toString().toByteArray())
        if (method == "HEAD" || count == 0L) return
        RandomAccessFile(file, "r").use { raf ->
            raf.seek(start)
            val buf = ByteArray(1 shl 16)
            var left = count
            while (left > 0) {
                val n = raf.read(buf, 0, minOf(buf.size.toLong(), left).toInt())
                if (n < 0) break
                out.write(buf, 0, n)
                left -= n
            }
        }
    }

    private fun respond(out: OutputStream, code: Int, text: String, mime: String, body: ByteArray, method: String) {
        val head = "HTTP/1.1 $code $text\r\nContent-Type: $mime\r\nContent-Length: ${body.size}\r\n" +
            "Cache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n"
        out.write(head.toByteArray())
        if (method != "HEAD") out.write(body)
    }

    private val headRe = Regex("<head(\\s[^>]*)?>", RegexOption.IGNORE_CASE)
    private val htmlRe = Regex("<html(\\s[^>]*)?>", RegexOption.IGNORE_CASE)
    private val doctypeRe = Regex("<!doctype[^>]*>", RegexOption.IGNORE_CASE)

    /** Injected as early as possible (right after <head>) so console output of inline scripts is captured too. */
    private fun inject(html: String): String {
        val tag = "<script src=\"/__cf_live.js\"></script>"
        val at = (headRe.find(html) ?: htmlRe.find(html) ?: doctypeRe.find(html))?.range?.last?.plus(1) ?: 0
        return html.substring(0, at) + tag + html.substring(at)
    }

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun listing(dir: File, path: String): String {
        val sb = StringBuilder("<!doctype html><meta charset=utf-8><meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Index of ${esc(path)}</title>")
        sb.append("<style>body{font:14px system-ui,sans-serif;margin:0;padding:1em 1.4em;background:#1e1e1e;color:#ddd}a{color:#4fc1ff;text-decoration:none}li{padding:.35em 0;list-style:none}ul{padding:0}h3{font-weight:500}</style>")
        sb.append("<h3>Index of ${esc(path)}</h3><ul>")
        if (path != "/") sb.append("<li><a href=\"../\">../</a></li>")
        val kids = dir.listFiles()?.sortedWith(compareBy({ !it.isDirectory }, { it.name.lowercase() })) ?: emptyList()
        for (k in kids) {
            val n = k.name + if (k.isDirectory) "/" else ""
            sb.append("<li><a href=\"${esc(java.net.URLEncoder.encode(n, "UTF-8").replace("+", "%20").replace("%2F", "/"))}\">${esc(n)}</a></li>")
        }
        return sb.append("</ul>").toString()
    }

    // ---------------------------------------------------------------- watching / keep-alive

    private fun pingLoop() {
        while (running) {
            try { Thread.sleep(20_000) } catch (_: InterruptedException) { return }
            for (c in clients) {
                try { synchronized(c) { c.write(": ping\n\n".toByteArray()); c.flush() } } catch (_: IOException) { clients.remove(c) }
            }
        }
    }

    private val skipDirs = setOf("node_modules", ".git", ".cache", ".gradle", "__pycache__")

    private fun snapshot(): HashMap<String, Long> {
        val m = HashMap<String, Long>()
        fun walk(d: File, depth: Int) {
            if (m.size > 6000 || depth > 12) return
            val kids = d.listFiles() ?: return
            for (k in kids) {
                if (k.isDirectory) { if (k.name !in skipDirs) walk(k, depth + 1) }
                else m[k.path] = k.lastModified() xor (k.length() shl 20)
            }
        }
        walk(root, 0)
        return m
    }

    private fun watchLoop() {
        var prev = snapshot()
        while (running) {
            try { Thread.sleep(700) } catch (_: InterruptedException) { return }
            if (clients.isEmpty()) { prev = snapshot(); continue }
            val cur = snapshot()
            val changed = ArrayList<String>()
            for ((p, v) in cur) if (prev[p] != v) changed.add(p)
            for (p in prev.keys) if (!cur.containsKey(p)) changed.add(p)
            prev = cur
            if (changed.isNotEmpty()) {
                try { Thread.sleep(120) } catch (_: InterruptedException) { return }
                val cssOnly = changed.all { it.endsWith(".css") }
                broadcast(if (cssOnly) "css" else "reload", changed.first())
            }
        }
    }

    companion object {
        fun mimeOf(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
            "html", "htm" -> "text/html; charset=utf-8"
            "css" -> "text/css; charset=utf-8"
            "js", "mjs", "cjs" -> "text/javascript; charset=utf-8"
            "json", "map" -> "application/json; charset=utf-8"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "avif" -> "image/avif"
            "ico" -> "image/x-icon"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            "ttf" -> "font/ttf"
            "otf" -> "font/otf"
            "wasm" -> "application/wasm"
            "mp4" -> "video/mp4"
            "webm" -> "video/webm"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "ogg" -> "audio/ogg"
            "pdf" -> "application/pdf"
            "xml" -> "application/xml; charset=utf-8"
            "txt", "md", "log", "ts", "tsx", "jsx", "py", "java", "kt", "c", "h", "cpp", "go", "rs", "sh", "yml", "yaml", "toml" -> "text/plain; charset=utf-8"
            "zip" -> "application/zip"
            else -> "application/octet-stream"
        }

        fun lanAddress(): String? = try {
            NetworkInterface.getNetworkInterfaces().toList().filter { it.isUp && !it.isLoopback }
                .flatMap { it.inetAddresses.toList() }.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
        } catch (_: Exception) { null }

        // Injected into every served HTML page. Forwards console output / errors / navigation to the IDE (via postMessage),
        // reloads the page on file changes and hot-swaps stylesheets without a full reload.
        const val CLIENT_JS = """(function(){
if(window.__cfLive)return;window.__cfLive=true;
function post(m){try{m.__cf=1;parent.postMessage(m,'*');}catch(e){}}
function fmt(x){try{if(typeof x==='string')return x;if(x instanceof Error)return x.stack||x.message;return JSON.stringify(x);}catch(e){return String(x);}}
['log','info','warn','error','debug'].forEach(function(k){var o=console[k];console[k]=function(){var a=Array.prototype.slice.call(arguments).map(fmt);post({type:'console',level:k,args:a});return o.apply(console,arguments);};});
window.addEventListener('error',function(e){post({type:'console',level:'error',args:[e.message+' ('+String(e.filename||'').split('/').pop()+':'+e.lineno+')']});});
window.addEventListener('unhandledrejection',function(e){var r=e.reason;post({type:'console',level:'error',args:['Unhandled promise rejection: '+(r&&(r.stack||r.message)||r)]});});
function nav(){post({type:'nav',url:location.href,title:document.title});}
window.addEventListener('load',nav);window.addEventListener('popstate',nav);window.addEventListener('hashchange',nav);
try{var es=new EventSource('/__cf_live');
es.addEventListener('reload',function(){location.reload();});
es.addEventListener('css',function(){document.querySelectorAll('link[rel=stylesheet]').forEach(function(l){var u=new URL(l.href,location.href);if(u.origin!==location.origin)return;u.searchParams.set('_cf',Date.now());l.href=u.toString();});});
}catch(e){}
})();"""
    }
}

/** Registry of running servers. */
object LiveServers {
    private val servers = java.util.concurrent.ConcurrentHashMap<Int, LiveServer>()

    fun start(root: File, port: Int, spa: Boolean, lan: Boolean, log: (Int, String) -> Unit): LiveServer {
        // Re-use a server already serving this root.
        servers.values.firstOrNull { it.root.canonicalPath == root.canonicalPath && it.spa == spa && it.lan == lan }?.let { return it }
        var ref: LiveServer? = null
        val s = LiveServer(root, port, spa, lan) { line -> log(ref?.port ?: 0, line) }
        ref = s
        servers[s.port] = s
        SessionService.sync()
        return s
    }

    fun stop(port: Int) {
        servers.remove(port)?.stop()
        SessionService.sync()
    }

    fun stopAll() {
        servers.values.forEach { it.stop() }
        servers.clear()
        SessionService.sync()
    }

    fun count(): Int = servers.size

    fun reload(port: Int?, path: String?) {
        val targets = if (port != null) listOfNotNull(servers[port]) else servers.values.toList()
        val css = path?.endsWith(".css") == true
        targets.forEach { it.broadcast(if (css) "css" else "reload", path ?: "") }
    }

    fun list(): JSONArray {
        val a = JSONArray()
        for (s in servers.values.sortedBy { it.port }) {
            a.put(
                JSONObject().put("port", s.port).put("root", s.root.path).put("spa", s.spa).put("lan", s.lan)
                    .put("clients", s.clientCount()).put("url", "http://127.0.0.1:${s.port}/")
                    .put("lanUrl", if (s.lan) LiveServer.lanAddress()?.let { "http://$it:${s.port}/" } else null)
            )
        }
        return a
    }
}
