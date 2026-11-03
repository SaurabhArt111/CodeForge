package dev.codeforge.ide.core

import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.charset.Charset

/** Real file-system operations for the editor, explorer and git layer (all paths are absolute). */
object FsOps {
    private fun f(path: String): File {
        require(path.startsWith("/")) { "Path must be absolute: $path" }
        return File(path)
    }

    private fun kind(mode: Int): String = when {
        OsConstants.S_ISDIR(mode) -> "d"
        OsConstants.S_ISREG(mode) -> "f"
        OsConstants.S_ISLNK(mode) -> "l"
        else -> "o"
    }

    fun statJson(path: String, follow: Boolean): JSONObject? {
        return try {
            val st = if (follow) Os.stat(path) else Os.lstat(path)
            JSONObject()
                .put("t", kind(st.st_mode))
                .put("s", st.st_size)
                .put("m", st.st_mtime * 1000)
                .put("p", st.st_mode and 0xfff)
                .put("u", st.st_uid)
        } catch (e: ErrnoException) {
            null
        }
    }

    fun list(path: String): JSONArray {
        val dir = f(path)
        val names = dir.list() ?: throw IOException(
            if (!dir.exists()) "No such directory: $path" else "Cannot read directory (permission denied?): $path"
        )
        val out = JSONArray()
        for (n in names) {
            val p = File(dir, n).path
            try {
                val l = Os.lstat(p)
                val o = JSONObject().put("n", n).put("t", kind(l.st_mode)).put("s", l.st_size)
                    .put("m", l.st_mtime * 1000).put("p", l.st_mode and 0xfff)
                if (OsConstants.S_ISLNK(l.st_mode)) {
                    try {
                        val t = Os.stat(p)
                        o.put("ld", OsConstants.S_ISDIR(t.st_mode))
                        o.put("s", t.st_size)
                    } catch (_: ErrnoException) {
                        o.put("broken", true)
                    }
                }
                out.put(o)
            } catch (_: ErrnoException) {
                out.put(JSONObject().put("n", n).put("t", "o").put("s", 0).put("m", 0).put("p", 0))
            }
        }
        return out
    }

    /** Reads a text file. Returns {binary:true} when it looks binary, {tooLarge:true} above [maxBytes]. */
    fun readText(path: String, maxBytes: Long, encoding: String?): JSONObject {
        val file = f(path)
        if (!file.exists()) throw IOException("No such file: $path")
        if (file.isDirectory) throw IOException("Is a directory: $path")
        val size = file.length()
        val res = JSONObject().put("size", size).put("mtime", file.lastModified())
        if (size > maxBytes) return res.put("tooLarge", true)
        val bytes = file.readBytes()
        val probe = minOf(bytes.size, 8000)
        for (i in 0 until probe) if (bytes[i].toInt() == 0) return res.put("binary", true)
        var off = 0
        var bom = false
        if (bytes.size >= 3 && bytes[0] == 0xEF.toByte() && bytes[1] == 0xBB.toByte() && bytes[2] == 0xBF.toByte()) {
            off = 3; bom = true
        }
        val cs = try { Charset.forName(encoding ?: "UTF-8") } catch (_: Exception) { Charsets.UTF_8 }
        return res.put("text", String(bytes, off, bytes.size - off, cs)).put("bom", bom)
    }

    fun readB64(path: String, offset: Long, length: Long): String {
        val file = f(path)
        if (!file.isFile) throw IOException("No such file: $path")
        RandomAccessFile(file, "r").use { raf ->
            val total = raf.length()
            val start = minOf(offset.coerceAtLeast(0), total)
            val n = if (length < 0) total - start else minOf(length, total - start)
            require(n <= 64L * 1024 * 1024) { "Read too large" }
            val buf = ByteArray(n.toInt())
            raf.seek(start)
            raf.readFully(buf)
            return Base64.encodeToString(buf, Base64.NO_WRAP)
        }
    }

    private fun writeBytes(path: String, writer: (FileOutputStream) -> Unit) {
        val target = f(path)
        target.parentFile?.mkdirs()
        val isLink = try { OsConstants.S_ISLNK(Os.lstat(path).st_mode) } catch (_: ErrnoException) { false }
        if (isLink || !target.exists()) {
            FileOutputStream(target).use { writer(it); it.fd.sync() }
            return
        }
        val mode = try { Os.stat(path).st_mode and 0xfff } catch (_: ErrnoException) { 0x1a4 }
        val tmp = File(target.parentFile, ".${target.name}.cf-tmp")
        try {
            FileOutputStream(tmp).use { writer(it); it.fd.sync() }
            try { Os.chmod(tmp.path, mode) } catch (_: ErrnoException) {}
            if (!tmp.renameTo(target)) {
                // some FUSE volumes refuse rename-over; fall back to in-place write
                FileOutputStream(target).use { out -> tmp.inputStream().use { it.copyTo(out) } }
                tmp.delete()
            }
        } finally {
            if (tmp.exists()) tmp.delete()
        }
    }

    fun writeText(path: String, text: String, bom: Boolean, encoding: String?) {
        val cs = try { Charset.forName(encoding ?: "UTF-8") } catch (_: Exception) { Charsets.UTF_8 }
        writeBytes(path) { out ->
            if (bom) out.write(byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()))
            out.write(text.toByteArray(cs))
        }
    }

    fun writeB64(path: String, b64: String, append: Boolean) {
        val data = Base64.decode(b64, Base64.DEFAULT)
        if (append) {
            val target = f(path)
            target.parentFile?.mkdirs()
            FileOutputStream(target, true).use { it.write(data) }
        } else writeBytes(path) { it.write(data) }
    }

    fun mkdir(path: String) {
        val d = f(path)
        if (d.isDirectory) return
        if (!d.mkdirs() && !d.isDirectory) throw IOException("Cannot create directory: $path")
    }

    fun rm(path: String) {
        val file = f(path)
        require(file.path != "/" && file.path.length > 8) { "Refusing to delete $path" }
        LinuxEnv.deleteTree(file)
        if (file.exists()) throw IOException("Could not delete: $path")
    }

    fun rename(from: String, to: String) {
        val src = f(from)
        val dst = f(to)
        if (dst.exists()) throw IOException("Already exists: ${dst.name}")
        dst.parentFile?.mkdirs()
        if (!src.renameTo(dst)) {
            copy(from, to)
            rm(from)
        }
    }

    fun copy(from: String, to: String) {
        val src = f(from)
        val dst = f(to)
        require(!(dst.absolutePath + "/").startsWith(src.absolutePath + "/")) { "Cannot copy a folder into itself" }
        copyRec(src, dst)
    }

    private fun copyRec(src: File, dst: File) {
        val st = Os.lstat(src.path)
        when {
            OsConstants.S_ISLNK(st.st_mode) -> {
                val target = Os.readlink(src.path)
                if (dst.exists()) dst.delete()
                Os.symlink(target, dst.path)
            }
            OsConstants.S_ISDIR(st.st_mode) -> {
                dst.mkdirs()
                src.listFiles()?.forEach { copyRec(it, File(dst, it.name)) }
            }
            else -> {
                dst.parentFile?.mkdirs()
                FileInputStream(src).use { i -> FileOutputStream(dst).use { o -> i.copyTo(o, 1 shl 16) } }
                try { Os.chmod(dst.path, st.st_mode and 0xfff) } catch (_: ErrnoException) {}
                dst.setLastModified(src.lastModified())
            }
        }
    }

    fun symlink(target: String, path: String) {
        f(path).parentFile?.mkdirs()
        Os.symlink(target, path)
    }

    fun readlink(path: String): String = Os.readlink(path)
    fun chmod(path: String, mode: Int) = Os.chmod(path, mode)
    fun realpath(path: String): String = f(path).canonicalPath

    /**
     * Flat list of relative file paths under [root] for Quick Open. Skips heavy directories.
     */
    fun tree(root: String, ignore: Set<String>, max: Int): JSONObject {
        val base = f(root)
        val out = JSONArray()
        var truncated = false
        fun walk(dir: File, prefix: String) {
            if (truncated) return
            val kids = dir.listFiles() ?: return
            for (k in kids) {
                if (truncated) return
                val rel = if (prefix.isEmpty()) k.name else "$prefix/${k.name}"
                val isLink = try { OsConstants.S_ISLNK(Os.lstat(k.path).st_mode) } catch (_: ErrnoException) { false }
                if (k.isDirectory) {
                    if (k.name in ignore || isLink) continue
                    walk(k, rel)
                } else {
                    out.put(rel)
                    if (out.length() >= max) { truncated = true; return }
                }
            }
        }
        walk(base, "")
        return JSONObject().put("files", out).put("truncated", truncated)
    }
}
