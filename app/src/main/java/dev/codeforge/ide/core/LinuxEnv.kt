package dev.codeforge.ide.core

import android.system.ErrnoException
import android.system.Os
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest

/**
 * Builds process launch specs (plain Android shell or Linux through proot) and installs root filesystems.
 * Several Linux systems can be installed side by side (Alpine, Debian, Ubuntu); one is active at a time and
 * is what every terminal, task and agent command uses. They all share /root (the workspace).
 */
object LinuxEnv {
    data class Distro(val id: String, val name: String, val pm: String, val size: String, val image: String?, val tag: String?)

    val DISTROS = listOf(
        Distro("alpine", "Alpine Linux", "apk", "~4 MB", null, null),
        Distro("debian", "Debian 12 (bookworm)", "apt", "~30 MB", "debian", "bookworm-slim"),
        Distro("ubuntu", "Ubuntu 24.04 LTS", "apt", "~30 MB", "ubuntu", "24.04")
    )

    fun distro(id: String): Distro = DISTROS.firstOrNull { it.id == id } ?: throw IllegalArgumentException("Unknown Linux system: $id")

    /** Alpine keeps its old location so existing installs keep working. */
    fun dirOf(id: String): File = if (id == "alpine") File(Paths.files, "rootfs") else File(Paths.files, "distros/$id")

    private fun activeFile() = File(Paths.files, "distros/active")

    fun readActive(): String = try { activeFile().readText().trim().takeIf { t -> DISTROS.any { it.id == t } } } catch (_: Exception) { null } ?: "alpine"

    val active: String get() = readActive()

    /** Makes [id] the system every new terminal uses. */
    fun select(id: String) {
        distro(id)
        if (!installed(id)) throw IllegalStateException("${distro(id).name} is not installed")
        activeFile().parentFile?.mkdirs(); activeFile().writeText(id)
        Paths.rootfs = dirOf(id)
    }

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

    fun installed(): Boolean = installed(active)

    fun installed(id: String): Boolean {
        val d = dirOf(id)
        return if (id == "alpine") File(d, "bin/busybox").exists() && File(d, "etc/alpine-release").exists()
        else File(d, "etc/os-release").exists() && File(d, ".codeforge-ready").exists()
    }

    fun version(): String? = version(active)

    fun version(id: String): String? = try {
        val d = dirOf(id)
        if (id == "alpine") File(d, "etc/alpine-release").readText().trim()
        else File(d, "etc/os-release").readLines().firstOrNull { it.startsWith("PRETTY_NAME=") }?.substringAfter("=")?.trim('"')
    } catch (_: Exception) { null }

    /** Set once setup-linux.sh has run inside that system (Alpine also honours the older marker in the workspace). */
    fun setupDone(): Boolean = setupDone(active)

    fun setupDone(id: String): Boolean = File(dirOf(id), "etc/codeforge-setup-done").exists() ||
        (id == "alpine" && File(Paths.home, ".codeforge-setup-done").exists())

    /** Copies launcher scripts out of the APK so the shell can read them. */
    fun prepare() {
        for (name in listOf("start-linux.sh", "setup-linux.sh", "host.rc", "node-patch.js", "cf.sh", "pkg.sh")) {
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
            m["CF_DISTRO"] = active
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
        if (wantLinux && !installed()) throw IllegalStateException("${distro(active).name} is not installed yet")
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

    /**
     * Installs [id] (default: the active system) and makes it active.
     * progress(stage, done, total, message) , stage is "download" | "verify" | "extract" | "configure".
     */
    fun install(job: String? = null, id: String = active, progress: (String, Long, Long, String) -> Unit) {
        val d = distro(id)
        if (d.image != null) { installImage(d, job, progress); return }
        installAlpine(job, progress)
        select("alpine")
    }

    private fun installImage(d: Distro, job: String?, progress: (String, Long, Long, String) -> Unit) {
        val arch = arch() ?: throw IllegalStateException("Unsupported CPU architecture: ${Paths.abi}")
        val dir = dirOf(d.id)
        deleteTree(dir)
        var done = false
        try {
            Registry.pull(d.image!!, d.tag!!, arch, dir, job, progress)
            progress("configure", 0, 0, "Configuring ${d.name}…")
            configure(dir)
            // apt cannot drop to its "_apt" user inside proot; downloads then fail with "setgroups" errors
            File(dir, "etc/apt/apt.conf.d").mkdirs()
            File(dir, "etc/apt/apt.conf.d/99codeforge").writeText(
                "APT::Sandbox::User \"root\";\nAcquire::Retries \"3\";\nAPT::Install-Recommends \"false\";\nDpkg::Use-Pty \"0\";\n")
            File(dir, ".codeforge-ready").writeText(System.currentTimeMillis().toString())
            done = true
        } finally { if (!done) deleteTree(dir) }
        select(d.id)
        progress("configure", 1, 1, "Done")
    }

    private fun configure(root: File) {
        for (sub in listOf("tmp", "root", "proc", "sys", "dev", "run", "etc/profile.d", "usr/local/bin")) File(root, sub).mkdirs()
        try { Os.chmod(File(root, "tmp").path, 0x3ff) } catch (_: ErrnoException) {}
        val resolv = File(root, "etc/resolv.conf")
        if (isLinkFile(resolv)) resolv.delete()
        resolv.writeText("nameserver 1.1.1.1\nnameserver 8.8.8.8\n")
        File(root, "etc/hosts").writeText("127.0.0.1 localhost codeforge\n::1 localhost\n")
        File(root, "etc/hostname").writeText("codeforge\n")
        prepare()
    }

    private fun isLinkFile(f: File) = try { java.nio.file.Files.isSymbolicLink(f.toPath()) } catch (_: Exception) { false }

    private fun installAlpine(job: String?, progress: (String, Long, Long, String) -> Unit) {
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
                Net.download("$base/$file", tmp, emptyMap(), job) { done, total -> progress("download", done, total, file) }
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
            } catch (e: java.util.concurrent.CancellationException) {
                tmp.delete(); throw e
            } catch (e: Exception) {
                lastError = e
            }
        }
        if (!ok) { tmp.delete(); throw (lastError ?: IllegalStateException("Download failed")) }

        progress("extract", 0, 0, "Extracting root filesystem…")
        val root = dirOf("alpine")
        deleteTree(root)
        root.mkdirs()
        var extracted = false
        try { TarGz.extract(tmp, root, trusted = true) { n -> Jobs.check(job); progress("extract", n.toLong(), 0, "$n files") }; extracted = true }
        finally { tmp.delete(); if (!extracted) deleteTree(root) }   // no half-extracted system left behind       // the 4 MB archive is not needed any more, even when extracting failed

        progress("configure", 0, 0, "Configuring…")
        configure(root)
        progress("configure", 1, 1, "Done")
    }

    /** Removes [id] (default: the active system). If it was active, another installed system becomes active. */
    fun reset(id: String = active) {
        distro(id)
        deleteTree(dirOf(id))
        if (id == "alpine") File(Paths.home, ".codeforge-setup-done").delete()
        if (id == active) {
            val next = DISTROS.firstOrNull { installed(it.id) }?.id ?: "alpine"
            activeFile().parentFile?.mkdirs(); activeFile().writeText(next)
            Paths.rootfs = dirOf(next)
        }
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
