package dev.codeforge.ide.core

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.regex.Pattern

/** Native "Find in Files": fast recursive search that skips binaries, huge files and ignored folders. */
object TextSearch {
    private val defaultIgnore = setOf(".git", "node_modules", ".hg", ".svn", ".gradle", "__pycache__", ".idea", ".next", ".cache")

    private fun globToRegex(glob: String): Regex {
        val sb = StringBuilder()
        var i = 0
        while (i < glob.length) {
            val c = glob[i]
            when (c) {
                '*' -> if (i + 1 < glob.length && glob[i + 1] == '*') { sb.append(".*"); i++ } else sb.append("[^/]*")
                '?' -> sb.append("[^/]")
                '.', '(', ')', '+', '|', '^', '$', '@', '%', '{', '}', '[', ']', '\\' -> sb.append('\\').append(c)
                else -> sb.append(c)
            }
            i++
        }
        return Regex(sb.toString())
    }

    fun search(
        root: String, query: String, regex: Boolean, caseSensitive: Boolean, wholeWord: Boolean,
        include: List<String>, exclude: List<String>, maxResults: Int, cancelled: () -> Boolean
    ): JSONObject {
        require(query.isNotEmpty()) { "Empty query" }
        var src = if (regex) query else Pattern.quote(query)
        if (wholeWord) src = "\\b(?:$src)\\b"
        val flags = (if (caseSensitive) 0 else Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE) or Pattern.MULTILINE
        val pat = Pattern.compile(src, flags)
        val inc = include.filter { it.isNotBlank() }.map { globToRegex(it.trim()) }
        val exc = exclude.filter { it.isNotBlank() }.map { globToRegex(it.trim()) }
        val results = JSONArray()
        var filesWithHits = 0
        var scanned = 0
        var truncated = false
        val base = File(root)

        fun matchesAny(list: List<Regex>, rel: String, name: String) = list.any { it.matches(rel) || it.matches(name) }

        fun walk(dir: File, prefix: String) {
            if (truncated || cancelled()) return
            val kids = dir.listFiles() ?: return
            kids.sortBy { it.name }
            for (k in kids) {
                if (truncated || cancelled()) return
                val rel = if (prefix.isEmpty()) k.name else "$prefix/${k.name}"
                if (k.isDirectory) {
                    if (k.name in defaultIgnore) continue
                    if (java.nio.file.Files.isSymbolicLink(k.toPath())) continue
                    if (exc.isNotEmpty() && matchesAny(exc, rel, k.name)) continue
                    walk(k, rel)
                    continue
                }
                if (!k.isFile || k.length() > 2_000_000L) continue
                if (inc.isNotEmpty() && !matchesAny(inc, rel, k.name)) continue
                if (exc.isNotEmpty() && matchesAny(exc, rel, k.name)) continue
                val bytes = try { k.readBytes() } catch (_: Exception) { continue }
                var binary = false
                for (i in 0 until minOf(bytes.size, 4000)) if (bytes[i].toInt() == 0) { binary = true; break }
                if (binary) continue
                scanned++
                val text = String(bytes, Charsets.UTF_8)
                var hit = false
                var lineNo = 0
                var lineStart = 0
                while (lineStart <= text.length) {
                    var lineEnd = text.indexOf('\n', lineStart)
                    if (lineEnd < 0) lineEnd = text.length
                    lineNo++
                    var line = text.substring(lineStart, lineEnd)
                    if (line.endsWith("\r")) line = line.dropLast(1)
                    val m = pat.matcher(line)
                    while (m.find()) {
                        if (m.end() == m.start()) continue // skip empty matches (find() advances by itself)
                        hit = true
                        val shown = if (line.length > 300) line.substring(maxOf(0, m.start() - 100), minOf(line.length, m.start() + 200)) else line
                        val shift = if (line.length > 300) maxOf(0, m.start() - 100) else 0
                        results.put(
                            JSONObject().put("path", k.path).put("rel", rel).put("line", lineNo)
                                .put("col", m.start() - shift + 1).put("len", m.end() - m.start()).put("text", shown)
                        )
                        if (results.length() >= maxResults) { truncated = true; break }
                    }
                    if (hit && truncated) break
                    if (lineEnd >= text.length) break
                    lineStart = lineEnd + 1
                }
                if (hit) filesWithHits++
            }
        }
        walk(base, "")
        return JSONObject().put("results", results).put("files", filesWithHits).put("scanned", scanned).put("truncated", truncated)
    }
}
