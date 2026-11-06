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
    fun zip(sources: List<File>, dest: File, base: File?, exclude: List<String> = emptyList(), progress: (Int) -> Unit = {}): Int {
        dest.parentFile?.mkdirs()
        var count = 0
        ZipOutputStream(BufferedOutputStream(FileOutputStream(dest), 1 shl 16)).use { zos ->
            zos.setLevel(6)
            val buf = ByteArray(1 shl 16)
            fun add(f: File, root: File) {
                if (isLink(f)) return
                if (f !in sources && skipped(f.name, exclude)) return
                val rel = f.relativeTo(root).path.replace(File.separatorChar, '/')
                if (f.isDirectory) {
                    if (rel.isNotEmpty()) {
                        zos.putNextEntry(ZipEntry("$rel/").also { it.time = f.lastModified() })
                        zos.closeEntry()
                    }
                    f.listFiles()?.sortedBy { it.name }?.forEach { add(it, root) }
                } else if (f.isFile) {
                    if (f.canonicalPath == dest.canonicalPath) return
                    zos.putNextEntry(ZipEntry(rel).also { it.time = f.lastModified() })
                    FileInputStream(f).use { ins ->
                        while (true) {
                            val n = ins.read(buf)
                            if (n < 0) break
                            zos.write(buf, 0, n)
                        }
                    }
                    zos.closeEntry()
                    if (++count % 100 == 0) progress(count)
                }
            }
            for (s in sources) add(s, base ?: (s.parentFile ?: s))
        }
        progress(count)
        return count
    }

    fun unzip(zip: File, dest: File, progress: (Int) -> Unit = {}): Int {
        dest.mkdirs()
        val rootCanon = dest.canonicalFile
        var count = 0
        ZipFile(zip).use { zf ->
            val buf = ByteArray(1 shl 16)
            val entries = zf.entries()
            while (entries.hasMoreElements()) {
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
                    if (++count % 100 == 0) progress(count)
                }
            }
        }
        progress(count)
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
