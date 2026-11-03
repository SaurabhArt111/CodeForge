package dev.codeforge.ide.core

import org.json.JSONObject
import java.io.File
import java.net.URLEncoder

/**
 * GitHub sign-in using the OAuth *Device Flow* (RFC 8628): no client secret and no redirect URI are needed,
 * which is exactly what a native app wants. The access token is stored only in [SecretStore].
 */
object GitHubAuth {
    const val TOKEN_KEY = "github.token"

    private fun form(vararg kv: Pair<String, String>): ByteArray =
        kv.joinToString("&") { URLEncoder.encode(it.first, "UTF-8") + "=" + URLEncoder.encode(it.second, "UTF-8") }
            .toByteArray(Charsets.UTF_8)

    private fun postJson(url: String, body: ByteArray): JSONObject {
        val (r, b) = Net.request(
            url, "POST",
            mapOf("Accept" to "application/json", "Content-Type" to "application/x-www-form-urlencoded"),
            body, 30_000
        )
        val text = String(b, Charsets.UTF_8)
        return try { JSONObject(text) } catch (_: Exception) { throw IllegalStateException("GitHub answered HTTP ${r.status}: ${text.take(200)}") }
    }

    fun deviceStart(clientId: String, scope: String): JSONObject {
        require(clientId.isNotBlank()) { "No GitHub OAuth client id configured" }
        val o = postJson("https://github.com/login/device/code", form("client_id" to clientId, "scope" to scope))
        if (o.has("error")) throw IllegalStateException(o.optString("error_description", o.optString("error")))
        return o
    }

    /** status: pending | slow_down | ok | expired | denied | error */
    fun devicePoll(clientId: String, deviceCode: String): JSONObject {
        val o = postJson(
            "https://github.com/login/oauth/access_token",
            form(
                "client_id" to clientId, "device_code" to deviceCode,
                "grant_type" to "urn:ietf:params:oauth:grant-type:device_code"
            )
        )
        val token = o.optString("access_token", "")
        if (token.isNotEmpty()) {
            SecretStore.set(TOKEN_KEY, token)
            return JSONObject().put("status", "ok").put("scope", o.optString("scope", ""))
        }
        return when (val err = o.optString("error", "error")) {
            "authorization_pending" -> JSONObject().put("status", "pending")
            "slow_down" -> JSONObject().put("status", "slow_down").put("interval", o.optInt("interval", 10))
            "expired_token" -> JSONObject().put("status", "expired")
            "access_denied" -> JSONObject().put("status", "denied")
            else -> JSONObject().put("status", "error").put("message", o.optString("error_description", err))
        }
    }

    fun signedIn(): Boolean = SecretStore.has(TOKEN_KEY)

    fun user(): JSONObject {
        val token = SecretStore.get(TOKEN_KEY) ?: throw IllegalStateException("Not signed in")
        val (r, b) = Net.request(
            "https://api.github.com/user", "GET",
            mapOf(
                "Authorization" to "Bearer $token", "Accept" to "application/vnd.github+json",
                "X-GitHub-Api-Version" to "2022-11-28"
            ), null, 30_000
        )
        if (r.status == 401) { SecretStore.delete(TOKEN_KEY); throw IllegalStateException("Token rejected by GitHub (signed out)") }
        val o = JSONObject(String(b, Charsets.UTF_8))
        o.put("scopes", r.headers["x-oauth-scopes"] ?: "")
        return o
    }

    fun signOut() {
        SecretStore.delete(TOKEN_KEY)
        val cred = File(Paths.home, ".git-credentials")
        if (cred.exists()) {
            val kept = cred.readLines().filterNot { it.contains("@github.com") }
            cred.writeText(kept.joinToString("\n") + if (kept.isEmpty()) "" else "\n")
        }
    }

    /** Opt-in: lets the terminal's own `git` use the signed-in account (plain-text file inside app-private storage). */
    fun configureTerminalGit(name: String?, email: String?, login: String): Boolean {
        val token = SecretStore.get(TOKEN_KEY) ?: return false
        val cred = File(Paths.home, ".git-credentials")
        val kept = if (cred.exists()) cred.readLines().filterNot { it.contains("@github.com") } else emptyList()
        cred.writeText((kept + "https://${URLEncoder.encode(login, "UTF-8")}:$token@github.com").joinToString("\n") + "\n")
        cred.setReadable(false, false); cred.setReadable(true, true)
        val cfg = File(Paths.home, ".gitconfig")
        val existing = if (cfg.exists()) cfg.readText() else ""
        val sb = StringBuilder(existing)
        if (!existing.contains("helper = store")) sb.append("\n[credential]\n\thelper = store\n")
        if (!name.isNullOrBlank() && !existing.contains("[user]")) {
            sb.append("\n[user]\n\tname = $name\n")
            if (!email.isNullOrBlank()) sb.append("\temail = $email\n")
        }
        cfg.writeText(sb.toString())
        return true
    }
}
