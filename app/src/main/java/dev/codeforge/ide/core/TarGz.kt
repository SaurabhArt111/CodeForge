package dev.codeforge.ide.core

import android.system.ErrnoException
import android.system.Os
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.zip.GZIPInputStream

/**
 * Minimal tar(.gz) extractor: ustar + GNU long names + pax headers, symlinks, hard links (copied), modes.
 * Needed for the Alpine root filesystem (symlinks and exec bits matter) and for "Extract here" in the explorer.
 */
object TarGz {
    /**
     * @param trusted true for the checksum-verified rootfs: absolute symlinks are legal there and
     *                parent canonicalisation is skipped (those links point inside the guest root).
     */
    fun extract(archive: File, dest: File, trusted: Boolean, progress: (Int) -> Unit = {}) {
        dest.mkdirs()
        val raw = BufferedInputStream(FileInputStream(archive), 1 shl 16)
        val isGz = run {
            raw.mark(4)
            val a = raw.read()
            val b = raw.read()
            raw.reset()
            a == 0x1f && b == 0x8b
        }
        val ins: InputStream = if (isGz) GZIPInputStream(raw, 1 shl 16) else raw
        ins.use { extractStream(it, dest, trusted, progress) }
    }

    private fun readFully(ins: InputStream, buf: ByteArray, len: Int): Boolean {
        var off = 0
        while (off < len) {
            val n = ins.read(buf, off, len - off)
            if (n < 0) return off != 0 && throw IOException("Unexpected end of tar archive")
            off += n
        }
        return true
    }

    private fun skipFully(ins: InputStream, n: Long) {
        var left = n
        val tmp = ByteArray(8192)
        while (left > 0) {
            val r = ins.read(tmp, 0, minOf(left, tmp.size.toLong()).toInt())
            if (r < 0) throw IOException("Unexpected end of tar archive")
            left -= r
        }
    }

    private fun str(b: ByteArray, off: Int, len: Int): String {
        var end = off
        while (end < off + len && b[end].toInt() != 0) end++
        return String(b, off, end - off, Charsets.UTF_8)
    }

    private fun octal(b: ByteArray, off: Int, len: Int): Long {
        // GNU base-256 for huge sizes
        if (b[off].toInt() and 0x80 != 0) {
            var v = 0L
            for (i in 1 until len) v = (v shl 8) or (b[off + i].toLong() and 0xff)
            return v
        }
        var v = 0L
        var i = off
        while (i < off + len && (b[i].toInt() == 0x20 || b[i].toInt() == 0)) i++
        while (i < off + len && b[i] >= '0'.code.toByte() && b[i] <= '7'.code.toByte()) {
            v = (v shl 3) + (b[i] - '0'.code.toByte())
            i++
        }
        return v
    }

    private fun readBlockText(ins: InputStream, size: Long): String {
        val data = ByteArray(size.toInt())
        var off = 0
        while (off < data.size) {
            val n = ins.read(data, off, data.size - off)
            if (n < 0) throw IOException("Unexpected end of tar archive")
            off += n
        }
        val pad = (512 - (size % 512)) % 512
        skipFully(ins, pad)
        return String(data, Charsets.UTF_8).trimEnd('\u0000', '\n')
    }

    private fun parsePax(text: String): Map<String, String> {
        val out = HashMap<String, String>()
        var i = 0
        while (i < text.length) {
            val sp = text.indexOf(' ', i)
            if (sp < 0) break
            val len = text.substring(i, sp).toIntOrNull() ?: break
            val rec = text.substring(sp + 1, minOf(i + len, text.length)).trimEnd('\n')
            val eq = rec.indexOf('=')
            if (eq > 0) out[rec.substring(0, eq)] = rec.substring(eq + 1)
            i += len
            if (len <= 0) break
        }
        return out
    }

    private fun safeRelative(name: String): String? {
        val parts = name.split('/').filter { it.isNotEmpty() && it != "." }
        if (parts.any { it == ".." }) return null
        return parts.joinToString("/").ifEmpty { null }
    }

    private fun extractStream(ins: InputStream, dest: File, trusted: Boolean, progress: (Int) -> Unit) {
        val header = ByteArray(512)
        var longName: String? = null
        var longLink: String? = null
        var pax: Map<String, String> = emptyMap()
        var count = 0
        val rootCanon = dest.canonicalFile
        val copyBuf = ByteArray(1 shl 16)

        while (true) {
            if (!readFully(ins, header, 512)) break
            if (header.all { it.toInt() == 0 }) break // end-of-archive marker

            var name = str(header, 0, 100)
            val prefix = str(header, 345, 155)
            val magic = str(header, 257, 5)
            if (magic == "ustar" && prefix.isNotEmpty()) name = "$prefix/$name"
            var size = octal(header, 124, 12)
            val mode = octal(header, 100, 8).toInt() and 0xfff
            val type = header[156].toInt().toChar()
            var linkName = str(header, 157, 100)

            when (type) {
                'L' -> { longName = readBlockText(ins, size); continue }
                'K' -> { longLink = readBlockText(ins, size); continue }
                'x' -> { pax = parsePax(readBlockText(ins, size)); continue }
                'g' -> { skipFully(ins, size + (512 - size % 512) % 512); continue }
            }
            pax["path"]?.let { name = it }
            pax["linkpath"]?.let { linkName = it }
            pax["size"]?.toLongOrNull()?.let { size = it }
            longName?.let { name = it }
            longLink?.let { linkName = it }
            longName = null; longLink = null; pax = emptyMap()

            val rel = safeRelative(name)
            val padding = (512 - size % 512) % 512
            if (rel == null) { skipFully(ins, size + padding); continue }
            val out = File(dest, rel)
            if (!trusted) {
                val parentCanon = (out.parentFile ?: dest).canonicalFile
                if (parentCanon != rootCanon && !parentCanon.path.startsWith(rootCanon.path + File.separator)) {
                    skipFully(ins, size + padding); continue
                }
            }

            when (type) {
                '5' -> {
                    out.mkdirs()
                    try { Os.chmod(out.path, mode or 0x1c0) } catch (_: ErrnoException) {}
                }
                '0', '\u0000', '7' -> {
                    out.parentFile?.mkdirs()
                    if (out.exists() || isLink(out)) out.delete()
                    FileOutputStream(out).use { fos ->
                        var left = size
                        while (left > 0) {
                            val n = ins.read(copyBuf, 0, minOf(left, copyBuf.size.toLong()).toInt())
                            if (n < 0) throw IOException("Unexpected end of tar archive")
                            fos.write(copyBuf, 0, n)
                            left -= n
                        }
                    }
                    skipFully(ins, padding)
                    try { Os.chmod(out.path, if (mode == 0) 0x1a4 else mode) } catch (_: ErrnoException) {}
                }
                '2' -> {
                    out.parentFile?.mkdirs()
                    if (out.exists() || isLink(out)) out.delete()
                    if (!trusted && linkName.startsWith("/")) { /* refuse absolute links from untrusted archives */ }
                    else try { Os.symlink(linkName, out.path) } catch (_: ErrnoException) {}
                    skipFully(ins, size + padding)
                }
                '1' -> {
                    // hard link: copy the already-extracted target
                    val target = safeRelative(linkName)?.let { File(dest, it) }
                    out.parentFile?.mkdirs()
                    if (target != null && target.isFile) {
                        if (out.exists() || isLink(out)) out.delete()
                        target.copyTo(out, overwrite = true)
                        try { Os.chmod(out.path, mode) } catch (_: ErrnoException) {}
                    }
                    skipFully(ins, size + padding)
                }
                else -> skipFully(ins, size + padding) // devices, fifos, etc.
            }
            if (++count % 200 == 0) progress(count)
        }
        progress(count)
    }

    private fun isLink(f: File): Boolean = try {
        java.nio.file.Files.isSymbolicLink(f.toPath())
    } catch (_: Exception) { false }
}
