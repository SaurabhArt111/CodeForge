package dev.codeforge.ide.core

import android.content.ContentValues
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

/**
 * Saves a file into the device's public **Downloads** folder, the place every file manager and browser looks in.
 *  - Android 10+: MediaStore (no permission needed; a name that already exists becomes "name (1).zip").
 *  - Android 8–9: writes into the Downloads folder directly (needs the storage permission the app already asks for).
 * Throws [SecurityException] when neither is possible, so the UI can fall back to the system "Save as" picker.
 */
object Downloads {
    fun mimeFor(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "zip" -> "application/zip"
        "cfbundle" -> "application/zip"
        "gz", "tgz" -> "application/gzip"
        "json" -> "application/json"
        "txt", "log", "md" -> "text/plain"
        else -> "application/octet-stream"
    }

    fun save(src: File, displayName: String, mime: String?, progress: (Long, Long) -> Unit): JSONObject {
        val ctx = Paths.app
        val total = src.length()
        val name = displayName.replace('/', '_').replace('\u0000', '_').ifBlank { src.name }
        val type = mime?.takeIf { it.isNotBlank() } ?: mimeFor(name)
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, type)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val resolver = ctx.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw SecurityException("Could not create a file in Downloads")
            try {
                resolver.openOutputStream(uri, "w")!!.use { out -> copy(src, out, total, progress) }
                resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            } catch (e: Throwable) {
                try { resolver.delete(uri, null, null) } catch (_: Throwable) {}
                throw e
            }
            val finalName = try {
                resolver.query(uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
            } catch (_: Throwable) { null } ?: name
            return JSONObject().put("name", finalName).put("path", "Download/$finalName").put("uri", uri.toString()).put("size", total)
        }
        // Android 8–9
        if (ctx.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED)
            throw SecurityException("Storage permission is needed to write to Downloads")
        @Suppress("DEPRECATION")
        val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        dir.mkdirs()
        var dest = File(dir, name)
        var i = 1
        val base = name.substringBeforeLast('.', name)
        val ext = name.substringAfterLast('.', "").let { if (it.isEmpty()) "" else ".$it" }
        while (dest.exists()) dest = File(dir, "$base (${i++})$ext")
        try {
            FileOutputStream(dest).use { out -> copy(src, out, total, progress) }
        } catch (e: Throwable) { dest.delete(); throw e }
        MediaScannerConnection.scanFile(ctx, arrayOf(dest.path), arrayOf(type), null)
        return JSONObject().put("name", dest.name).put("path", "Download/${dest.name}").put("uri", "file://${dest.path}").put("size", total)
    }

    private fun copy(src: File, out: java.io.OutputStream, total: Long, progress: (Long, Long) -> Unit) {
        FileInputStream(src).use { ins ->
            val buf = ByteArray(1 shl 16)
            var done = 0L
            var last = 0L
            while (true) {
                val n = ins.read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
                done += n
                val now = System.currentTimeMillis()
                if (now - last > 150) { last = now; progress(done, total) }
            }
            out.flush()
            progress(done, total)
        }
        if (total > 0 && src.length() != total) throw IOException("The file changed while it was being copied")
    }
}
