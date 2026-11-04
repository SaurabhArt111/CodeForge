package dev.codeforge.ide.core

import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * App-level PIN + short-lived unlock tokens.
 *  - The PIN is never stored: only a salted PBKDF2-HMAC-SHA256 hash (150k iterations) in `lock.json`.
 *  - Wrong attempts are counted persistently and cause an escalating lockout (30 s, 60 s, 2 min …), so the
 *    PIN can't be brute forced by restarting the app.
 *  - A successful PIN or biometric check yields an unlock token valid for [TOKEN_MS]; sensitive calls
 *    (secret.reveal, secret.export) require a live token. Tokens only exist in memory.
 */
object Auth {
    private const val TOKEN_MS = 90_000L
    private const val ITER = 150_000
    private val file: File get() = File(Paths.data, "lock.json")
    private val lock = Any()
    private val tokens = ConcurrentHashMap<String, Long>()
    private val rnd = SecureRandom()

    private fun load(): JSONObject = try { JSONObject(file.readText()) } catch (_: Exception) { JSONObject() }
    private fun save(o: JSONObject) { file.writeText(o.toString()); file.setReadable(false, false); file.setReadable(true, true) }

    private fun hash(pin: String, salt: ByteArray, iter: Int): ByteArray =
        SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(PBEKeySpec(pin.toCharArray(), salt, iter, 256)).encoded

    fun pinSet(): Boolean = synchronized(lock) { load().has("hash") }

    fun issueToken(): String {
        val now = System.currentTimeMillis()
        tokens.entries.removeIf { it.value < now }
        val b = ByteArray(24); rnd.nextBytes(b)
        val t = Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
        tokens[t] = now + TOKEN_MS
        return t
    }

    fun tokenValid(t: String?): Boolean {
        if (t.isNullOrEmpty()) return false
        val exp = tokens[t] ?: return false
        if (exp < System.currentTimeMillis()) { tokens.remove(t); return false }
        return true
    }

    fun revoke() { tokens.clear() }

    fun status(): JSONObject = synchronized(lock) {
        val o = load()
        JSONObject().put("pinSet", o.has("hash")).put("lockedMs", lockedMs(o)).put("failures", o.optInt("fails", 0))
    }

    private fun lockedMs(o: JSONObject): Long = maxOf(0L, o.optLong("until", 0L) - System.currentTimeMillis())

    /** @return the new state: {ok, token?, lockedMs, remaining} */
    fun verifyPin(pin: String): JSONObject = synchronized(lock) {
        val o = load()
        if (!o.has("hash")) return JSONObject().put("ok", false).put("error", "No PIN is set")
        val wait = lockedMs(o)
        if (wait > 0) return JSONObject().put("ok", false).put("lockedMs", wait)
        val salt = Base64.decode(o.getString("salt"), Base64.NO_WRAP)
        val want = Base64.decode(o.getString("hash"), Base64.NO_WRAP)
        val got = hash(pin, salt, o.optInt("iter", ITER))
        if (MessageDigest.isEqual(want, got)) {
            o.put("fails", 0).put("until", 0); save(o)
            return JSONObject().put("ok", true).put("token", issueToken())
        }
        val fails = o.optInt("fails", 0) + 1
        o.put("fails", fails)
        var lockMs = 0L
        if (fails >= 5) { lockMs = 30_000L shl minOf(fails - 5, 6); o.put("until", System.currentTimeMillis() + lockMs) }
        save(o)
        JSONObject().put("ok", false).put("lockedMs", lockMs).put("remaining", maxOf(0, 5 - fails))
    }

    /** Sets or changes the PIN. When one is already set, [old] must verify. */
    fun setPin(new: String, old: String?): JSONObject = synchronized(lock) {
        if (new.length < 4 || new.length > 32) return JSONObject().put("ok", false).put("error", "PIN must be 4–32 characters")
        if (load().has("hash")) {
            val v = verifyPin(old ?: "")
            if (!v.optBoolean("ok")) return v
        }
        val salt = ByteArray(16); rnd.nextBytes(salt)
        val o = JSONObject().put("salt", Base64.encodeToString(salt, Base64.NO_WRAP)).put("iter", ITER)
            .put("hash", Base64.encodeToString(hash(new, salt, ITER), Base64.NO_WRAP)).put("fails", 0).put("until", 0)
        save(o)
        JSONObject().put("ok", true).put("token", issueToken())
    }

    fun clearPin(pin: String): JSONObject = synchronized(lock) {
        val v = verifyPin(pin)
        if (!v.optBoolean("ok")) return v
        file.delete(); JSONObject().put("ok", true)
    }
}
