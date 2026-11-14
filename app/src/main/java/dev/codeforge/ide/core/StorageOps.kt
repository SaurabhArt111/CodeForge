package dev.codeforge.ide.core

import android.os.StatFs
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CancellationException

/**
 * Storage accounting and cleanup for everything CodeForge keeps in its private data folder (`/data/data/<pkg>`).
 *
 * Android's "Storage usage → Data" number is the sum of that whole folder, which for CodeForge is dominated by
 *   - the Alpine root filesystem and the packages installed in it,
 *   - the Linux home (it is bind-mounted as /root, so ~/.npm, ~/.npm-global, ~/.cache, ~/.cargo … live in the workspace),
 *   - node_modules folders inside projects, and copies made by "Import folder" / "Open ZIP",
 *   - leftovers of exports and transfers.
 * One walk over the tree sorts every file into exactly one category (sizes are real disk usage: allocated blocks, symlinks never followed).
 */
object StorageOps {
    /** Categories that may be cleared in bulk. Everything else is only reported (or deleted item by item). */
    private val CLEANABLE = setOf("cache-pkg", "cache-home", "cache-app", "tmp", "leftovers", "exports", "node-modules", "ai", "crashes")

    private class Acc {
        val bytes = HashMap<String, Long>()
        val files = HashMap<String, Long>()
        val nodeModules = ArrayList<String>()
        var totalFiles = 0L
        var totalBytes = 0L
        fun add(cat: String, b: Long, isFile: Boolean) {
            bytes[cat] = (bytes[cat] ?: 0L) + b
            if (isFile) files[cat] = (files[cat] ?: 0L) + 1
            totalBytes += b
            if (isFile) totalFiles++
        }
    }

    private val dataRoot: File get() = Paths.files.parentFile ?: Paths.files
    private val home: String get() = Paths.home.path
    private val rootfs: String get() = Paths.rootfs.path
    private val cf: String get() = Paths.data.path
    private val envDir: String get() = Paths.env.path

    private fun isExportFile(f: File): Boolean {
        val n = f.name.lowercase()
        return (n.endsWith(".zip") || n.endsWith(".cfbundle") || n.endsWith(".tar.gz") || n.endsWith(".tgz")) && f.isFile
    }

    /** Category of [f] given the category of the folder it is in. null = same as the parent. */
    private fun classify(f: File, parent: String): String? {
        val p = f.path
        val name = f.name
        val parentPath = f.parent ?: ""
        return when {
            p == rootfs -> "linux-system"
            p == "$rootfs/var/cache" -> "cache-pkg"
            p == "$rootfs/tmp" || p == "$envDir/tmp" -> "tmp"
            p == "$home/.npm" -> "cache-pkg"
            p == "$home/.cache" || p == "$home/.node-gyp" -> "cache-home"
            p == "$home/.cf-share" -> "leftovers"
            parentPath == home -> when {
                name == "imported" -> "imported"
                name == "inbox" -> "inbox"
                name.startsWith(".") -> "linux-user"
                isExportFile(f) -> "exports"
                else -> "projects"
            }
            parentPath == "$home/imported" && isExportFile(f) -> "exports"
            name == "node_modules" && (parent == "projects" || parent == "imported" || parent == "inbox") -> "node-modules"
            parentPath == Paths.files.path -> when (name) {
                "home" -> "projects"
                "rootfs-download.tar.gz" -> "leftovers"
                "crashes" -> "crashes"
                else -> "app-data"
            }
            parentPath == dataRoot.path -> when (name) {
                "files" -> "app-data"
                "cache", "code_cache" -> "cache-app"
                "app_webview" -> "webview"
                else -> "app-data"
            }
            parentPath == cf -> when {
                name == "extensions" -> "extensions"
                name == "plugins" -> "plugins"
                name == "ai" -> "ai"
                name == "transfer-stage" || name == "transfer-in" || name == "incoming" || name == "export-tmp" -> "leftovers"
                (name.endsWith(".cfbundle") || name.endsWith(".zip")) && f.isFile -> "leftovers"
                else -> "app-data"
            }
            parentPath == "$cf/extensions" && (name.startsWith(".tmp-") || name.startsWith(".dl-")) -> "leftovers"
            else -> null
        }
    }

    private fun walk(root: File, rootCat: String, acc: Acc, job: String?, tick: (Long, Long) -> Unit) {
        val stack = ArrayList<Pair<File, String>>()
        stack.add(Pair(root, rootCat))
        var last = 0L
        var n = 0
        while (stack.isNotEmpty()) {
            val (f, cat) = stack.removeAt(stack.size - 1)
            if (++n % 512 == 0) {
                Jobs.check(job)
                val now = System.currentTimeMillis()
                if (now - last > 400) { last = now; tick(acc.totalFiles, acc.totalBytes) }
            }
            val st = try { Os.lstat(f.path) } catch (_: ErrnoException) { continue }
            val isDir = OsConstants.S_ISDIR(st.st_mode)
            acc.add(cat, st.st_blocks * 512L, !isDir)
            if (isDir) {
                val names = f.list() ?: continue
                for (nm in names) {
                    val c = File(f, nm)
                    val cc = classify(c, cat)
                    if (cc == "node-modules" && cat != "node-modules") acc.nodeModules.add(c.path)
                    stack.add(Pair(c, cc ?: cat))
                }
            }
        }
    }

    /** Full scan → per-category bytes / file counts, device free space. */
    fun scan(job: String? = null, tick: (Long, Long) -> Unit = { _, _ -> }): JSONObject {
        val acc = Acc()
        walk(dataRoot, "app-data", acc, job, tick)
        tick(acc.totalFiles, acc.totalBytes)
        val cats = JSONArray()
        for (id in acc.bytes.keys.sorted()) cats.put(JSONObject().put("id", id).put("bytes", acc.bytes[id] ?: 0L).put("files", acc.files[id] ?: 0L).put("cleanable", id in CLEANABLE))
        val sf = try { StatFs(Paths.files.path) } catch (_: Throwable) { null }
        return JSONObject().put("cats", cats).put("total", acc.totalBytes).put("files", acc.totalFiles)
            .put("device", JSONObject().put("free", sf?.availableBytes ?: 0L).put("total", sf?.totalBytes ?: 0L))
            .put("nodeModules", JSONArray(acc.nodeModules)).put("at", System.currentTimeMillis())
    }

    private fun sizeCat(root: File, cat: String, job: String? = null): Pair<Long, Long> {
        val acc = Acc()
        walk(root, cat, acc, job) { _, _ -> }
        return Pair(acc.bytes[cat] ?: 0L, acc.files[cat] ?: 0L)
    }

    private fun kids(dir: String, filter: (File) -> Boolean = { true }): List<File> = File(dir).listFiles()?.filter(filter) ?: emptyList()

    private fun findNodeModules(job: String? = null): List<File> {
        val out = ArrayList<File>()
        fun scan(dir: File, depth: Int) {
            if (depth > 8) return
            Jobs.check(job)
            for (c in dir.listFiles() ?: return) {
                if (!c.isDirectory || java.nio.file.Files.isSymbolicLink(c.toPath())) continue
                if (c.name == "node_modules") { out.add(c); continue }
                if (c.name == ".git") continue
                scan(c, depth + 1)
            }
        }
        for (top in File(home).listFiles() ?: emptyArray()) {
            if (top.name.startsWith(".") || !top.isDirectory || java.nio.file.Files.isSymbolicLink(top.toPath())) continue
            if (top.name == "node_modules") out.add(top) else scan(top, 0)
        }
        return out
    }

    private fun roots(id: String, job: String? = null): List<File> = when (id) {
        "projects" -> kids(home) { classify(it, "projects") == "projects" }
        "imported" -> kids("$home/imported") { !isExportFile(it) }
        "inbox" -> kids("$home/inbox")
        "node-modules" -> findNodeModules(job)
        "linux-system" -> kids(rootfs)
        "linux-user" -> kids(home) { it.name.startsWith(".") && classify(it, "projects") == "linux-user" }
        "cache-pkg" -> listOf(File("$home/.npm"), File("$rootfs/var/cache")).filter { it.exists() }
        "cache-home" -> listOf(File("$home/.cache"), File("$home/.node-gyp")).filter { it.exists() }
        "tmp" -> kids("$rootfs/tmp") + kids("$envDir/tmp")
        "leftovers" -> (listOf(File(Paths.files, "rootfs-download.tar.gz"), File("$home/.cf-share")) +
            kids(cf) { classify(it, "app-data") == "leftovers" } + kids("$cf/extensions") { it.name.startsWith(".tmp-") || it.name.startsWith(".dl-") }).filter { it.exists() }
        "exports" -> kids(home) { isExportFile(it) } + kids("$home/imported") { isExportFile(it) }
        "extensions" -> kids("$cf/extensions") { !it.name.startsWith(".tmp-") && !it.name.startsWith(".dl-") }
        "plugins" -> kids("$cf/plugins")
        "ai" -> kids("$cf/ai")
        "crashes" -> kids(Paths.files.path + "/crashes")
        "cache-app" -> kids(dataRoot.path + "/cache") + kids(dataRoot.path + "/code_cache")
        "webview" -> kids(dataRoot.path + "/app_webview")
        "app-data" -> kids(cf) { classify(it, "app-data") == "app-data" } + kids(envDir) { it.name != "tmp" }
        else -> emptyList()
    }

    /** Biggest entries of a category, largest first. */
    fun items(id: String, limit: Int, job: String? = null): JSONArray {
        val out = ArrayList<JSONObject>()
        for (r in roots(id, job)) {
            Jobs.check(job)
            val (b, n) = sizeCat(r, id, job)
            val st = try { Os.lstat(r.path) } catch (_: ErrnoException) { null }
            out.add(JSONObject().put("path", r.path).put("name", r.name).put("bytes", b).put("files", n)
                .put("dir", st?.let { OsConstants.S_ISDIR(it.st_mode) } ?: false).put("mtime", (st?.st_mtime ?: 0L) * 1000))
        }
        out.sortByDescending { it.optLong("bytes") }
        return JSONArray(out.take(limit.coerceIn(1, 500)))
    }

    // ---------------------------------------------------------------- deleting

    private fun rmTree(f: File) {
        val st = try { Os.lstat(f.path) } catch (_: ErrnoException) { return }
        if (OsConstants.S_ISDIR(st.st_mode)) {
            try { Os.chmod(f.path, 0x1c0) } catch (_: ErrnoException) {}   // 0700: read-only folders from package managers
            f.list()?.forEach { rmTree(File(f, it)) }
        }
        f.delete()
    }

    private fun protectedRoot(f: File): Boolean {
        val p = f.path.trimEnd('/')
        return p == dataRoot.path || p == Paths.files.path || p == home || p == cf || p == envDir || p == rootfs ||
            p == "$cf/extensions" || p == "$cf/plugins" || p.length < 10 || p.contains("/../")
    }

    /** Deletes one file or folder inside CodeForge's private storage. Returns the bytes freed. */
    fun deletePath(path: String): Long {
        val f = File(path)
        require(path.startsWith("/")) { "Path must be absolute" }
        if (!(f.path + "/").startsWith(dataRoot.path + "/")) throw SecurityException("Not inside CodeForge's storage")
        if (protectedRoot(f)) throw SecurityException("This folder cannot be deleted from here")
        val st = try { Os.lstat(f.path) } catch (_: ErrnoException) { return 0L }
        val size = if (OsConstants.S_ISDIR(st.st_mode)) walkAll(f) else st.st_blocks * 512L
        rmTree(f)
        return size
    }

    private fun walkAll(f: File): Long {
        val acc = Acc()
        walk(f, "x", acc, null) { _, _ -> }
        return acc.totalBytes
    }

    /** Clears the given categories (only those marked cleanable). Returns {freed, cleaned:[ids], errors:[…]}. */
    fun clean(ids: List<String>, job: String? = null, progress: (String, Long) -> Unit = { _, _ -> }): JSONObject {
        var freed = 0L
        val cleaned = JSONArray()
        val errors = JSONArray()
        for (id in ids) {
            if (id !in CLEANABLE) { errors.put("$id cannot be cleared in bulk"); continue }
            if (id == "tmp" && SessionManager.aliveCount() > 0) { errors.put("Close your terminals first – they use the temporary files"); continue }
            try {
                Jobs.check(job)
                val rs = roots(id, job)
                for ((i, r) in rs.withIndex()) {
                    Jobs.check(job)
                    progress(id, freed)
                    val (b, _) = sizeCat(r, id, job)
                    if (protectedRoot(r)) { r.listFiles()?.forEach { rmTree(it) } } else rmTree(r)
                    freed += b
                    if (i % 4 == 0) progress(id, freed)
                }
                // folders other code expects to exist
                when (id) {
                    "tmp" -> { File("$rootfs/tmp").takeIf { Paths.rootfs.exists() }?.let { it.mkdirs(); try { Os.chmod(it.path, 0x3ff) } catch (_: ErrnoException) {} }; File("$envDir/tmp").mkdirs() }
                    "cache-pkg" -> if (Paths.rootfs.exists()) File("$rootfs/var/cache").mkdirs()
                    "crashes" -> File(Paths.files, "crashes").mkdirs()
                    "cache-app" -> {}
                }
                cleaned.put(id)
            } catch (e: CancellationException) { throw e
            } catch (e: Throwable) { errors.put("$id: ${e.message ?: e.javaClass.simpleName}") }
        }
        return JSONObject().put("freed", freed).put("cleaned", cleaned).put("errors", errors)
    }
}
