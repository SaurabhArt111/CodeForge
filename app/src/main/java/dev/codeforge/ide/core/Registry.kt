package dev.codeforge.ide.core

import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.URLEncoder
import java.security.MessageDigest

/**
 * Downloads the root filesystem of an official container image (debian, ubuntu …) straight from a
 * container registry, without Docker. Uses the standard registry v2 API with anonymous bearer tokens,
 * picks the image for this CPU, verifies every layer's SHA-256 digest and unpacks the layers in order.
 * Several registries mirror the official images, so if one is down or rate-limited the next is tried.
 */
object Registry {
    /** base URL to repository-path prefix for official images */
    private val SOURCES = listOf(
        "https://registry-1.docker.io" to "library/",
        "https://public.ecr.aws" to "docker/library/",
        "https://mirror.gcr.io" to "library/"
    )

    private const val ACCEPT = "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, " +
        "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json"

    /** Platform names used by registries for our CPU (architecture, variant) */
    private fun platform(arch: String): Pair<String, String?> = when (arch) {
        "aarch64" -> "arm64" to null
        "armv7" -> "arm" to "v7"
        "x86_64" -> "amd64" to null
        else -> throw IllegalStateException("Unsupported CPU architecture: $arch")
    }

    private class Session(val base: String, val repo: String) {
        var token: String? = null

        fun headers(accept: String? = null): Map<String, String> {
            val h = LinkedHashMap<String, String>()
            token?.let { h["Authorization"] = "Bearer $it" }
            accept?.let { h["Accept"] = it }
            return h
        }

        /** GET with the anonymous token dance: on 401, read WWW-Authenticate, fetch a token, retry once. */
        fun getJson(path: String, accept: String): JSONObject {
            for (attempt in 0..1) {
                val (r, body) = Net.request("$base/v2/$repo/$path", "GET", headers(accept), null, 30_000)
                if (r.status == 401 && attempt == 0 && token == null) { authenticate(r.headers["www-authenticate"]); continue }
                if (r.status !in 200..299) throw IOException("HTTP ${r.status} from ${base.substringAfter("://")}")
                return JSONObject(String(body, Charsets.UTF_8))
            }
            throw IOException("Not authorised by ${base.substringAfter("://")}")
        }

        fun authenticate(header: String?) {
            if (header == null || !header.startsWith("Bearer", true)) throw IOException("Registry did not offer anonymous access")
            val params = Regex("(\\w+)=\"([^\"]*)\"").findAll(header).associate { it.groupValues[1] to it.groupValues[2] }
            val realm = params["realm"] ?: throw IOException("Registry did not say where to get a token")
            val q = listOfNotNull(
                params["service"]?.let { "service=" + URLEncoder.encode(it, "UTF-8") },
                "scope=" + URLEncoder.encode(params["scope"] ?: "repository:$repo:pull", "UTF-8")
            ).joinToString("&")
            val json = JSONObject(Net.getText("$realm?$q"))
            token = json.optString("token").ifEmpty { json.optString("access_token") }.ifEmpty { throw IOException("Empty registry token") }
        }
    }

    /**
     * Pulls [image]:[tag] for [arch] into [dest] (which must be empty).
     * progress(stage, done, total, message), stage is "download" | "verify" | "extract".
     */
    fun pull(image: String, tag: String, arch: String, dest: File, job: String?, progress: (String, Long, Long, String) -> Unit) {
        val (wantArch, wantVariant) = platform(arch)
        var lastError: Exception? = null
        for ((base, prefix) in SOURCES) {
            val host = base.substringAfter("://")
            try {
                Jobs.check(job)
                val s = Session(base, prefix + image)
                progress("download", 0, 0, "Looking up $image:$tag on $host…")
                var manifest = s.getJson("manifests/$tag", ACCEPT)
                if (manifest.has("manifests")) {          // multi-platform index: pick ours
                    val list = manifest.getJSONArray("manifests")
                    var digest: String? = null
                    for (i in 0 until list.length()) {
                        val m = list.getJSONObject(i); val p = m.optJSONObject("platform") ?: continue
                        if (p.optString("os") != "linux" || p.optString("architecture") != wantArch) continue
                        val v = p.optString("variant", "")
                        if (wantVariant != null && v.isNotEmpty() && v != wantVariant) continue
                        digest = m.getString("digest"); break
                    }
                    digest ?: throw IllegalStateException("$image:$tag has no build for $wantArch${wantVariant?.let { "/$it" } ?: ""}")
                    manifest = s.getJson("manifests/$digest", ACCEPT)
                }
                val layers = manifest.optJSONArray("layers") ?: throw IOException("Unexpected manifest from $host")
                val total = (0 until layers.length()).sumOf { layers.getJSONObject(it).optLong("size", 0) }
                var before = 0L
                dest.mkdirs()
                for (i in 0 until layers.length()) {
                    val layer = layers.getJSONObject(i)
                    val type = layer.optString("mediaType")
                    if (!type.contains("gzip") && !type.endsWith(".tar")) throw IOException("Unsupported layer format: $type")
                    val digest = layer.getString("digest")
                    val tmp = File(Paths.files, "rootfs-download.tar.gz")
                    val label = "$image $tag" + if (layers.length() > 1) " (part ${i + 1} of ${layers.length()})" else ""
                    try {
                        Net.download("$base/v2/${s.repo}/blobs/$digest", tmp, s.headers(), job) { d, _ -> progress("download", before + d, total, label) }
                        progress("verify", 0, 0, "Verifying checksum…")
                        val md = MessageDigest.getInstance("SHA-256")
                        tmp.inputStream().use { ins -> val b = ByteArray(1 shl 16); while (true) { val n = ins.read(b); if (n < 0) break; md.update(b, 0, n) } }
                        val got = "sha256:" + md.digest().joinToString("") { "%02x".format(it) }
                        if (!got.equals(digest, true)) throw IOException("Checksum mismatch for $label")
                        progress("extract", 0, 0, "Extracting $label…")
                        TarGz.extract(tmp, dest, trusted = true) { n -> Jobs.check(job); progress("extract", n.toLong(), 0, "$n files") }
                        applyWhiteouts(dest)
                    } finally { tmp.delete() }
                    before += layer.optLong("size", 0)
                }
                return
            } catch (e: java.util.concurrent.CancellationException) {
                throw e
            } catch (e: Exception) {
                lastError = e
                LinuxEnv.deleteTree(dest)       // start the next source from a clean folder
            }
        }
        throw lastError ?: IOException("Download failed")
    }

    /** OCI whiteouts: ".wh.NAME" deletes NAME from earlier layers (opaque-folder markers are only removed; official base images have one layer). */
    private fun applyWhiteouts(dir: File) {
        val kids = dir.listFiles() ?: return
        for (f in kids) {
            val n = f.name
            when {
                n == ".wh..wh..opq" -> f.delete()
                n.startsWith(".wh.") -> { LinuxEnv.deleteTree(File(dir, n.removePrefix(".wh."))); f.delete() }
                f.isDirectory && !java.nio.file.Files.isSymbolicLink(f.toPath()) -> applyWhiteouts(f)
            }
        }
    }
}
