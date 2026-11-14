package dev.codeforge.ide.core

import android.app.DownloadManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import dev.codeforge.ide.MainActivity
import dev.codeforge.ide.R
import dev.codeforge.ide.service.SessionService
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CancellationException

/**
 * Background tasks (downloads, compressing, cleaning …) that must keep going, and keep the user informed, while the app is not on screen.
 *
 *  - While at least one task runs the foreground service ([SessionService]) is kept alive, so Android does not kill the process.
 *  - Every task has an ongoing progress notification; when it ends a normal notification says what happened.
 *  - The web UI starts / ends tasks (`jobs.begin`, `jobs.end`); native operations that take a `job` id report progress themselves,
 *    because the WebView is frozen while the app is in the background.
 *  - [cancel] flags the task; long loops call [check] and stop with a [CancellationException].
 */
object Jobs {
    private const val CH_PROGRESS = "cf_jobs"
    private const val CH_DONE = "cf_jobs_done"

    private class Job(val id: String, var title: String) {
        @Volatile var text: String = ""
        @Volatile var done: Long = 0
        @Volatile var total: Long = -1
        @Volatile var lastNotify: Long = 0
        @Volatile var cancelled = false
        val nid: Int get() = 6000 + (id.hashCode() and 0x3ff)
    }

    /** Set by the activity: called when the last task ended (so a WebView that was kept running for it can be paused again). */
    @Volatile var onIdle: (() -> Unit)? = null

    private val jobs = ConcurrentHashMap<String, Job>()
    private val cancelledEarly = ConcurrentHashMap.newKeySet<String>()   // cancel() arrived before begin()

    private val nm: NotificationManager get() = Paths.app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun count(): Int = jobs.size
    fun titles(): List<String> = jobs.values.map { it.title }

    private fun ensureChannels() {
        if (nm.getNotificationChannel(CH_PROGRESS) == null)
            nm.createNotificationChannel(NotificationChannel(CH_PROGRESS, "Background tasks", NotificationManager.IMPORTANCE_LOW))
        if (nm.getNotificationChannel(CH_DONE) == null)
            nm.createNotificationChannel(NotificationChannel(CH_DONE, "Finished tasks", NotificationManager.IMPORTANCE_DEFAULT))
    }

    private fun openApp(c: Context): PendingIntent = PendingIntent.getActivity(
        c, 0, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    fun begin(id: String, title: String, text: String = "") {
        val j = Job(id, title).also { it.text = text }
        if (cancelledEarly.remove(id)) j.cancelled = true
        jobs[id] = j
        SessionService.sync()
        post(j, force = true)
    }

    /** Native progress. [total] <= 0 = unknown size (indeterminate bar). Throttled to ~2 notification updates a second. */
    fun update(id: String, text: String? = null, done: Long = -1, total: Long = -1) {
        val j = jobs[id] ?: return
        if (text != null) j.text = text
        if (done >= 0) j.done = done
        j.total = total
        post(j, force = false)
    }

    private fun post(j: Job, force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - j.lastNotify < 500) return
        j.lastNotify = now
        try {
            ensureChannels()
            val c = Paths.app
            val b = Notification.Builder(c, CH_PROGRESS)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(j.title)
                .setContentText(j.text)
                .setContentIntent(openApp(c))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
            if (j.total > 0) b.setProgress(100, ((j.done * 100) / j.total).toInt().coerceIn(0, 100), false) else b.setProgress(0, 0, true)
            nm.notify(j.nid, b.build())
        } catch (_: Throwable) { /* notifications are best effort */ }
    }

    /**
     * Ends a task. [openDownloads] makes the notification open the system Downloads app (for "Saved to Downloads").
     * Nothing is posted when [silent] (the UI is in front and shows its own toast).
     */
    fun end(id: String, ok: Boolean, text: String, openDownloads: Boolean = false, silent: Boolean = false) {
        val j = jobs.remove(id)
        cancelledEarly.remove(id)
        try {
            nm.cancel(j?.nid ?: (6000 + (id.hashCode() and 0x3ff)))
            if (j != null && !silent && !j.cancelled) {
                ensureChannels()
                val c = Paths.app
                val pi = if (openDownloads) PendingIntent.getActivity(c, 1, Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) else openApp(c)
                nm.notify(j.nid + 1000, Notification.Builder(c, CH_DONE)
                    .setSmallIcon(R.drawable.ic_stat_notify)
                    .setContentTitle(if (ok) j.title else j.title + " – failed")
                    .setContentText(text)
                    .setContentIntent(pi)
                    .setAutoCancel(true).build())
            }
        } catch (_: Throwable) { }
        SessionService.sync()
        if (jobs.isEmpty()) try { onIdle?.invoke() } catch (_: Throwable) {}
    }

    fun cancel(id: String) {
        val j = jobs[id]
        if (j != null) j.cancelled = true else cancelledEarly.add(id)
        Net.abort(id)
    }

    fun isCancelled(id: String?): Boolean = id != null && (jobs[id]?.cancelled == true || cancelledEarly.contains(id))

    /** Call inside loops: throws when the user cancelled the task. */
    fun check(id: String?) {
        if (isCancelled(id)) throw CancellationException("Cancelled")
    }
}
