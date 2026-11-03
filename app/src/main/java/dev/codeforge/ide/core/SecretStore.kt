package dev.codeforge.ide.core

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** API keys / tokens, encrypted at rest with a hardware-backed AndroidKeyStore AES-GCM key. */
object SecretStore {
    private const val ALIAS = "codeforge_secrets_v1"
    private val file: File get() = File(Paths.data, "secrets.json")
    private val lock = Any()

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    private fun load(): JSONObject = try { JSONObject(file.readText()) } catch (_: Exception) { JSONObject() }

    fun set(name: String, value: String) = synchronized(lock) {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val enc = c.doFinal(value.toByteArray(Charsets.UTF_8))
        val o = load()
        o.put(name, Base64.encodeToString(c.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(enc, Base64.NO_WRAP))
        file.writeText(o.toString())
        file.setReadable(false, false); file.setReadable(true, true)
    }

    fun get(name: String): String? = synchronized(lock) {
        val s = load().optString(name, "")
        if (s.isEmpty()) return null
        return try {
            val (iv, ct) = s.split(":", limit = 2)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            String(c.doFinal(Base64.decode(ct, Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (_: Exception) { null }
    }

    fun has(name: String): Boolean = synchronized(lock) { load().has(name) }

    fun delete(name: String) = synchronized(lock) {
        val o = load()
        o.remove(name)
        file.writeText(o.toString())
    }

    fun names(): List<String> = synchronized(lock) { load().keys().asSequence().toList() }

    /**
     * Expands {{secret:NAME}} and {{basic:USER:NAME}} so that JS never has to hold tokens.
     */
    fun expand(s: String): String {
        if (!s.contains("{{")) return s
        var out = Regex("""\{\{secret:([A-Za-z0-9_.\-]+)\}\}""").replace(s) { m -> get(m.groupValues[1]) ?: "" }
        out = Regex("""\{\{basic:([^:}]+):([A-Za-z0-9_.\-]+)\}\}""").replace(out) { m ->
            val v = get(m.groupValues[2]) ?: ""
            Base64.encodeToString("${m.groupValues[1]}:$v".toByteArray(Charsets.UTF_8), Base64.NO_WRAP)
        }
        return out
    }
}
