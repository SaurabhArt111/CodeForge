package dev.codeforge.ide.core

import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * HTTP client used by the web UI (no CORS), git, extension marketplace, AI providers and downloads.
 * Header values may contain {{secret:NAME}} / {{basic:USER:NAME}} placeholders resolved from [SecretStore].
 */
object Net {
    const val UA = "CodeForge/8.0 (Android; +https://github.com/codeforge)"

    class Response(val status: Int, val statusText: String, val headers: Map<String, String>, val url: String, val stream: InputStream?)

    private val live = ConcurrentHashMap<String, HttpURLConnection>()

    /** Opens a connection, sends the body, follows up to 8 redirects. Caller must close [Response.stream]. */
    fun open(
        url: String, method: String, headers: Map<String, String>, body: ByteArray?,
        connectTimeoutMs: Int = 20_000, readTimeoutMs: Int = 60_000, trackId: String? = null,
        identityEncoding: Boolean = false
    ): Response {
        var current = url
        var m = method.uppercase()
        var payload = body
        for (hop in 0..8) {
            val conn = URL(current).openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = connectTimeoutMs
            conn.readTimeout = readTimeoutMs
            conn.requestMethod = m
            conn.setRequestProperty("User-Agent", UA)
            if (identityEncoding) conn.setRequestProperty("Accept-Encoding", "identity")
            for ((k, v) in headers) conn.setRequestProperty(k, SecretStore.expand(v))
            if (trackId != null) live[trackId] = conn
            if (payload != null && m != "GET" && m != "HEAD") {
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(payload.size)
                conn.outputStream.use { it.write(payload!!) }
            }
            val code = conn.responseCode
            if (code in intArrayOf(301, 302, 303, 307, 308) && hop < 8) {
                val loc = conn.getHeaderField("Location")
                if (loc != null) {
                    current = URL(URL(current), loc).toString()
                    if (code == 303 || ((code == 301 || code == 302) && m == "POST")) { m = "GET"; payload = null }
                    conn.disconnect()
                    continue
                }
            }
            val hdrs = LinkedHashMap<String, String>()
            for ((k, v) in conn.headerFields) if (k != null) hdrs[k.lowercase()] = v.joinToString(", ")
            val stream = if (code >= 400) conn.errorStream else conn.inputStream
            return Response(code, conn.responseMessage ?: "", hdrs, current, stream)
        }
        throw IOException("Too many redirects")
    }

    fun abort(id: String) {
        live.remove(id)?.disconnect()
    }

    fun release(id: String?) {
        if (id != null) live.remove(id)
    }

    fun request(
        url: String, method: String, headers: Map<String, String>, body: ByteArray?, timeoutMs: Int
    ): Pair<Response, ByteArray> {
        val r = open(url, method, headers, body, 20_000, timeoutMs)
        val out = ByteArrayOutputStream()
        r.stream?.use { ins ->
            val buf = ByteArray(1 shl 15)
            while (true) {
                val n = ins.read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
                if (out.size() > 96 * 1024 * 1024) throw IOException("Response too large")
            }
        }
        return Pair(r, out.toByteArray())
    }

    fun getText(url: String): String {
        val (r, b) = request(url, "GET", emptyMap(), null, 30_000)
        if (r.status !in 200..299) throw IOException("HTTP ${r.status} for $url")
        return String(b, Charsets.UTF_8)
    }

    fun download(url: String, dest: File, headers: Map<String, String>, job: String? = null, progress: (Long, Long) -> Unit) {
        Jobs.check(job)
        val r = open(url, "GET", headers, null, 20_000, 60_000, trackId = job)
        if (r.status !in 200..299) { r.stream?.close(); release(job); throw IOException("HTTP ${r.status} for $url") }
        val total = r.headers["content-length"]?.toLongOrNull() ?: -1L
        dest.parentFile?.mkdirs()
        var done = 0L
        var last = 0L
        var ok = false
        try {
            r.stream!!.use { ins ->
                FileOutputStream(dest).use { out ->
                    val buf = ByteArray(1 shl 16)
                    while (true) {
                        val n = try { ins.read(buf) } catch (e: IOException) { if (Jobs.isCancelled(job)) throw java.util.concurrent.CancellationException("Cancelled"); throw e }
                        if (n < 0) break
                        out.write(buf, 0, n)
                        done += n
                        val now = System.currentTimeMillis()
                        if (now - last > 150) { last = now; Jobs.check(job); progress(done, total) }
                    }
                }
            }
            ok = true
        } finally {
            release(job)
            if (!ok) dest.delete()      // never leave a half-downloaded file behind
        }
        progress(done, if (total > 0) total else done)
    }

    fun b64(bytes: ByteArray, len: Int = bytes.size): String = Base64.encodeToString(bytes, 0, len, Base64.NO_WRAP)
}
