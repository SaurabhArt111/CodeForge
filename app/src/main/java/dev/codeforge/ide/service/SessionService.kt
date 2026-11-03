package dev.codeforge.ide.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import dev.codeforge.ide.MainActivity
import dev.codeforge.ide.R
import dev.codeforge.ide.core.LiveServers
import dev.codeforge.ide.core.Paths
import dev.codeforge.ide.core.SessionManager

/** Foreground service: keeps terminals, `npm run dev` servers and the live server running in the background. */
class SessionService : Service() {
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_ALL) {
            SessionManager.killAll()
            LiveServers.stopAll()
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }
        ensureChannel(this)
        val n = buildNotification(this)
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
            else startForeground(NOTIF_ID, n)
        } catch (_: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (wake == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "codeforge:sessions").also { it.setReferenceCounted(false); it.acquire(6 * 60 * 60 * 1000L) }
        }
        return START_NOT_STICKY
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    }

    override fun onDestroy() {
        try { wake?.release() } catch (_: Exception) {}
        wake = null
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP_ALL = "dev.codeforge.ide.STOP_ALL"
        private const val CHANNEL = "cf_sessions"
        private const val NOTIF_ID = 4201

        private fun ensureChannel(c: Context) {
            val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(CHANNEL, c.getString(R.string.notif_channel_name), NotificationManager.IMPORTANCE_LOW)
                )
            }
        }

        private fun buildNotification(c: Context): Notification {
            val terms = SessionManager.aliveCount()
            val servers = LiveServers.count()
            val text = buildString {
                append(if (terms == 1) "1 terminal" else "$terms terminals")
                if (servers > 0) append(" · ").append(if (servers == 1) "1 server" else "$servers servers")
            }
            val open = PendingIntent.getActivity(
                c, 0, Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val stop = PendingIntent.getService(
                c, 1, Intent(c, SessionService::class.java).setAction(ACTION_STOP_ALL),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            return Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(c.getString(R.string.notif_title))
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .addAction(Notification.Action.Builder(null, c.getString(R.string.notif_stop_all), stop).build())
                .build()
        }

        /** Start / refresh / stop the service according to what is currently running. */
        fun sync() {
            val c = try { Paths.app } catch (_: Throwable) { return }
            val active = SessionManager.aliveCount() > 0 || LiveServers.count() > 0
            try {
                if (active) {
                    val i = Intent(c, SessionService::class.java)
                    c.startForegroundService(i)
                    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    ensureChannel(c)
                    nm.notify(NOTIF_ID, buildNotification(c))
                } else {
                    c.stopService(Intent(c, SessionService::class.java))
                }
            } catch (_: Exception) {
                // Background-start restrictions: sessions still run while the app is visible.
            }
        }
    }
}
