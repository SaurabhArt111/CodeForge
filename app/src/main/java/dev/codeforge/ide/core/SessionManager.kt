package dev.codeforge.ide.core

import dev.codeforge.ide.service.SessionService
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** Process-wide registry of terminal sessions; survives Activity recreation. */
object SessionManager {
    private val sessions = ConcurrentHashMap<String, TermSession>()
    private val counter = AtomicInteger(1)

    fun create(
        title: String?, launch: LinuxEnv.Launch, rows: Int, cols: Int, listener: TermSession.Listener
    ): TermSession {
        val id = "t" + counter.getAndIncrement()
        val s = TermSession(id, title ?: "bash", launch, rows, cols, listener)
        sessions[id] = s
        SessionService.sync()
        return s
    }

    fun get(id: String): TermSession? = sessions[id]
    fun all(): List<TermSession> = sessions.values.sortedBy { it.id.substring(1).toIntOrNull() ?: 0 }
    fun aliveCount(): Int = sessions.values.count { it.alive }

    fun remove(id: String) {
        sessions.remove(id)
        SessionService.sync()
    }

    fun killAll() {
        sessions.values.forEach { it.kill() }
    }
}
