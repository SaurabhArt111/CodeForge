package dev.codeforge.ide.core

import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

object ZipTools {
    private fun isLink(f: File): Boolean = try {
        java.nio.file.Files.isSymbolicLink(f.toPath())
    } catch (_: Exception) { false }

    /** Name patterns that are skipped anywhere in the tree: exact names ("node_modules"), "*.log" or "build*". */
    fun skipped(name: String, patterns: List<String>): Boolean = patterns.any { p ->
        when {
            p.startsWith("*") -> name.endsWith(p.substring(1))
            p.endsWith("*") -> name.startsWith(p.dropLast(1))
            else -> name == p
        }
    }

    /** Zips [sources]; entry names are relative to [base] (defaults to each source's parent). [exclude] = name patterns left out. */
    fun zip(sources: List<File>, dest: File, base: File?, exclude: List<String> = emptyList(), job: String? = null, progress: (Int, Int) -> Unit = { _, _ -> }): Int =
        zipEntries(sources.map { Pair(it, it.relativeTo(base ?: (it.parentFile ?: it)).path.replace(File.separatorChar, '/')) }, dest, exclude, job, progress)

    /**
     * Zips each (file or folder, name inside the archive) pair, so two folders can be packed under chosen names without copying them first.
     * [progress] gets (files done, files in total); the total comes from a quick pre-walk so the UI can show a real percentage.
     * Stops with CancellationException when [job] is cancelled and then removes the half-written archive.
     */
    fun zipEntries(entries: List<Pair<File, String>>, dest: File, exclude: List<String> = emptyList(), job: String? = null, progress: (Int, Int) -> Unit = { _, _ -> }): Int {
        dest.parentFile?.mkdirs()
        val roots = entries.map { it.first }
        val destCanon = try { dest.canonicalPath } catch (_: Exception) { dest.path }
        fun countIn(f: File, top: Boolean): Int {
            if (isLink(f)) return 0
            if (!top && skipped(f.name, exclude)) return 0
            if (f.isFile) return if (f.canonicalPath == destCanon) 0 else 1
            var n = 0
            f.listFiles()?.forEach { n += countIn(it, false) }
            return n
        }
        val total = try { entries.sumOf { countIn(it.first, true) } } catch (_: Exception) { 0 }
        var count = 0
        var ok = false
        try {
            ZipOutputStream(BufferedOutputStream(FileOutputStream(dest), 1 shl 16)).use { zos ->
                zos.setLevel(6)
                val buf = ByteArray(1 shl 16)
                fun add(f: File, rel: String, top: Boolean) {
                    if (isLink(f)) return
                    if (!top && skipped(f.name, exclude)) return
                    if (f.isDirectory) {
                        if (rel.isNotEmpty()) {
                            zos.putNextEntry(ZipEntry("$rel/").also { it.time = f.lastModified() })
                            zos.closeEntry()
                        }
                        f.listFiles()?.sortedBy { it.name }?.forEach { add(it, if (rel.isEmpty()) it.name else rel + "/" + it.name, false) }
                    } else if (f.isFile) {
                        if (f.canonicalPath == destCanon) return
                        Jobs.check(job)
                        zos.putNextEntry(ZipEntry(rel).also { it.time = f.lastModified() })
                        FileInputStream(f).use { ins ->
                            while (true) {
                                val n = ins.read(buf)
                                if (n < 0) break
                                zos.write(buf, 0, n)
                            }
                        }
                        zos.closeEntry()
                        if (++count % 50 == 0) progress(count, total)
                    }
                }
                for ((f, name) in entries) add(f, name, true)
            }
            ok = true
        } finally {
            if (!ok) dest.delete()
        }
        progress(count, total)
        return count
    }

    fun unzip(zip: File, dest: File, job: String? = null, progress: (Int, Int) -> Unit = { _, _ -> }): Int {
        dest.mkdirs()
        val rootCanon = dest.canonicalFile
        var count = 0
        ZipFile(zip).use { zf ->
            val buf = ByteArray(1 shl 16)
            val total = zf.size()
            val entries = zf.entries()
            while (entries.hasMoreElements()) {
                Jobs.check(job)
                val e = entries.nextElement()
                val out = File(dest, e.name)
                val canon = out.canonicalFile
                if (canon != rootCanon && !canon.path.startsWith(rootCanon.path + File.separator)) {
                    throw IOException("Blocked unsafe path in archive: ${e.name}")
                }
                if (e.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    zf.getInputStream(e).use { ins ->
                        FileOutputStream(out).use { fos ->
                            while (true) {
                                val n = ins.read(buf)
                                if (n < 0) break
                                fos.write(buf, 0, n)
                            }
                        }
                    }
                    if (e.time > 0) out.setLastModified(e.time)
                    // Scripts inside archives are usually meant to be runnable.
                    if (e.name.endsWith(".sh")) out.setExecutable(true, false)
                    if (++count % 100 == 0) progress(count, total)
                }
            }
            progress(count, total)
        }
        return count
    }

    fun list(zip: File): JSONArray {
        val arr = JSONArray()
        ZipFile(zip).use { zf ->
            val es = zf.entries()
            while (es.hasMoreElements()) {
                val e = es.nextElement()
                arr.put(JSONObject().put("name", e.name).put("size", e.size).put("dir", e.isDirectory))
            }
        }
        return arr
    }
}
