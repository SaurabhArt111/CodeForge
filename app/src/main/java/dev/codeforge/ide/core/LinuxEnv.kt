package dev.codeforge.ide.core

import android.system.ErrnoException
import android.system.Os
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/** Builds process launch specs (plain Android shell or Alpine Linux through proot) and installs the rootfs. */
object LinuxEnv {
    data class Launch(
        val cmd: String,
        val args: List<String>,
        val env: List<String>,
        val cwd: String,
        val mode: String // "host" | "linux"
    )

    private const val GUEST_PATH =
        "/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/system/bin:/system/xbin"

    fun arch(): String? = when (Paths.abi) {
        "arm64-v8a" -> "aarch64"
        "armeabi-v7a" -> "armv7"
        "x86_64" -> "x86_64"
        else -> null
    }

    fun installed(): Boolean = File(Paths.rootfs, "bin/busybox").exists() && File(Paths.rootfs, "etc/alpine-release").exists()

    fun version(): String? = try { File(Paths.rootfs, "etc/alpine-release").readText().trim() } catch (_: Exception) { null }

    fun setupDone(): Boolean = File(Paths.home, ".codeforge-setup-done").exists()

    /** Copies launcher scripts out of the APK so the shell can read them. */
    fun prepare() {
        for (name in listOf("start-linux.sh", "setup-linux.sh", "host.rc", "node-patch.js")) {
            val out = File(Paths.env, name)
            Paths.app.assets.open("env/$name").use { ins -> FileOutputStream(out).use { ins.copyTo(it) } }
            out.setReadable(true, false)
        }
        File(Paths.env, "tmp").mkdirs()
    }

    private fun baseEnv(guest: Boolean, extra: Map<String, String>): MutableList<String> {
        val m = LinkedHashMap<String, String>()
        m["TERM"] = "xterm-256color"
        m["COLORTERM"] = "truecolor"
        m["LANG"] = "en_US.UTF-8"
        m["CODEFORGE"] = "1"
        m["CODEFORGE_HOME"] = Paths.home.path
        LiveServer.lanAddress()?.let { m["CF_LAN_IP"] = it }   // used by the guest's os.networkInterfaces() shim
        val tz = java.util.TimeZone.getDefault().id
        m["ANDROID_TZ"] = tz
        m["TZ"] = tz
        if (guest) {
            m["HOME"] = "/root"
            m["USER"] = "root"
            m["LOGNAME"] = "root"
            m["SHELL"] = "/bin/bash"
            m["TMPDIR"] = "/tmp"
            m["PATH"] = GUEST_PATH
            m["CF_NATIVE_DIR"] = Paths.nativeDir.path
            m["CF_ENV"] = Paths.env.path
            m["CF_ROOTFS"] = Paths.rootfs.path
            m["CF_HOME"] = Paths.home.path
        } else {
            m["HOME"] = Paths.home.path
            m["SHELL"] = "/system/bin/sh"
            m["TMPDIR"] = File(Paths.env, "tmp").path
            m["PATH"] = "/system/bin:/system/xbin:" + File(Paths.env, "bin").path
            m["ENV"] = File(Paths.env, "host.rc").path
        }
        m.putAll(extra)
        return m.entries.map { "${it.key}=${it.value}" }.toMutableList()
    }

    /**
     * @param mode "auto" (Linux when installed, else Android shell) | "host" | "linux"
     * @param command null for an interactive login shell
     */
    fun launch(mode: String, cwd: String?, command: List<String>?, extraEnv: Map<String, String> = emptyMap()): Launch {
        val wantLinux = when (mode) {
            "linux" -> true
            "host" -> false
            else -> installed()
        }
        if (wantLinux && !installed()) throw IllegalStateException("Linux environment is not installed yet")
        prepare()
        val dir = (cwd?.takeIf { File(it).isDirectory } ?: Paths.home.path)
        return if (wantLinux) {
            val args = mutableListOf("sh", File(Paths.env, "start-linux.sh").path, "--cwd", dir)
            if (command != null) { args.add("--"); args.addAll(command) }
            Launch("/system/bin/sh", args, baseEnv(true, extraEnv), dir, "linux")
        } else {
            val args = mutableListOf("sh")
            if (command != null) { args.add("-c"); args.add(command.joinToString(" ") { shellQuote(it) }) }
            Launch("/system/bin/sh", args, baseEnv(false, extraEnv), dir, "host")
        }
    }

    fun shellQuote(s: String): String = "'" + s.replace("'", "'\\''") + "'"

    // ------------------------------------------------------------------ rootfs installation

    private fun parseRelease(yaml: String): Pair<String, String?>? {
        var cur = HashMap<String, String>()
        val items = ArrayList<Map<String, String>>()
        for (raw in yaml.lines()) {
            val line = raw.trimEnd()
            if (line.startsWith("-")) {
                if (cur.isNotEmpty()) items.add(cur)
                cur = HashMap()
                continue
            }
            val idx = line.indexOf(':')
            if (idx > 0 && line.startsWith(" ")) cur[line.substring(0, idx).trim()] = line.substring(idx + 1).trim().trim('"')
        }
        if (cur.isNotEmpty()) items.add(cur)
        val hit = items.firstOrNull { it["flavor"] == "alpine-minirootfs" } ?: return null
        val file = hit["file"] ?: return null
        return Pair(file, hit["sha256"])
    }

    private val mirrors = listOf(
        "https://dl-cdn.alpinelinux.org/alpine",
        "https://mirrors.edge.kernel.org/alpine",
        "https://uk.alpinelinux.org/alpine"
    )

    /** progress(stage, done, total, message) — stage is "download" | "verify" | "extract" | "configure". */
    fun install(progress: (String, Long, Long, String) -> Unit) {
        val arch = arch() ?: throw IllegalStateException("Unsupported CPU architecture: ${Paths.abi}")
        var lastError: Exception? = null
        val tmp = File(Paths.files, "rootfs-download.tar.gz")
        var ok = false
        for (mirror in mirrors) {
            try {
                val base = "$mirror/latest-stable/releases/$arch"
                progress("download", 0, 0, "Looking up latest Alpine release…")
                val yaml = Net.getText("$base/latest-releases.yaml")
                val (file, sha) = parseRelease(yaml) ?: throw IllegalStateException("No minirootfs listed for $arch")
                progress("download", 0, 0, "Downloading $file")
                Net.download("$base/$file", tmp, emptyMap()) { done, total -> progress("download", done, total, file) }
                if (sha != null) {
                    progress("verify", 0, 0, "Verifying checksum…")
                    val md = MessageDigest.getInstance("SHA-256")
                    tmp.inputStream().use { ins ->
                        val b = ByteArray(1 shl 16)
                        while (true) { val n = ins.read(b); if (n < 0) break; md.update(b, 0, n) }
                    }
                    val got = md.digest().joinToString("") { "%02x".format(it) }
                    if (!got.equals(sha, ignoreCase = true)) throw IllegalStateException("Checksum mismatch for $file")
                }
                ok = true
                break
            } catch (e: Exception) {
                lastError = e
            }
        }
        if (!ok) throw (lastError ?: IllegalStateException("Download failed"))

        progress("extract", 0, 0, "Extracting root filesystem…")
        deleteTree(Paths.rootfs)
        Paths.rootfs.mkdirs()
        TarGz.extract(tmp, Paths.rootfs, trusted = true) { n -> progress("extract", n.toLong(), 0, "$n files") }
        tmp.delete()

        progress("configure", 0, 0, "Configuring…")
        for (d in listOf("tmp", "root", "proc", "sys", "dev", "run", "etc/profile.d", "usr/local/bin")) File(Paths.rootfs, d).mkdirs()
        try { Os.chmod(File(Paths.rootfs, "tmp").path, 0x3ff) } catch (_: ErrnoException) {}
        File(Paths.rootfs, "etc/resolv.conf").writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\n")
        File(Paths.rootfs, "etc/hosts").writeText("127.0.0.1 localhost\n::1 localhost\n")
        File(Paths.rootfs, "etc/hostname").writeText("codeforge\n")
        prepare()
        progress("configure", 1, 1, "Done")
    }

    fun reset() {
        deleteTree(Paths.rootfs)
        File(Paths.home, ".codeforge-setup-done").delete()
    }

    fun deleteTree(f: File) {
        try {
            val st = Os.lstat(f.path)
            if (android.system.OsConstants.S_ISLNK(st.st_mode) || !android.system.OsConstants.S_ISDIR(st.st_mode)) {
                f.delete()
                return
            }
        } catch (_: ErrnoException) {
            return
        }
        f.listFiles()?.forEach { deleteTree(it) }
        f.delete()
    }
}
