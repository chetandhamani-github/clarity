package com.homerun.clarity.notification

import android.app.Notification
import android.content.ComponentName
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.security.MessageDigest

class ClarityNotificationListenerService : NotificationListenerService() {

    override fun onCreate() {
        super.onCreate()
        NotificationListenerBridge.init(applicationContext)
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        NotificationListenerBridge.recordListenerConnected(applicationContext, true)
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        NotificationListenerBridge.recordListenerConnected(applicationContext, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                requestRebind(ComponentName(this, ClarityNotificationListenerService::class.java))
            } catch (_: Exception) {
                // Rebind best-effort only
            }
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val packageName = sbn.packageName ?: return

        // Filter: only inspect notifications from financial/banking/UPI apps
        if (!AllowedPackages.isAllowed(packageName)) {
            return
        }

        val notification = sbn.notification ?: return
        val flags = notification.flags

        // Drop ongoing foreground-service banners and group summary notifications
        if (sbn.isOngoing ||
            (flags and Notification.FLAG_ONGOING_EVENT) != 0 ||
            (flags and Notification.FLAG_GROUP_SUMMARY) != 0
        ) {
            return
        }

        val extras = notification.extras ?: return
        val appName = AllowedPackages.getAppName(packageName) ?: packageName

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        var text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim() ?: ""

        if (text.isEmpty() && bigText.isEmpty()) {
            val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
            if (lines != null && lines.isNotEmpty()) {
                text = lines.mapNotNull { it?.toString()?.trim() }
                    .filter { it.isNotEmpty() }
                    .joinToString(" | ")
            }
        }

        if (title.isEmpty() && text.isEmpty() && bigText.isEmpty()) {
            return
        }

        if (isMaskedPlaceholder(title, text, bigText)) {
            return
        }

        val postTime = sbn.postTime
        val notificationId = buildStableId(packageName, title, text, bigText, postTime)

        val bundle = Bundle().apply {
            putString("id", notificationId)
            putString("packageName", packageName)
            putString("appName", appName)
            putString("title", title)
            putString("text", text)
            putString("bigText", bigText)
            putString("subText", subText)
            putDouble("postTime", postTime.toDouble())
        }

        NotificationListenerBridge.onNotificationPosted(applicationContext, bundle)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // Not used for financial transaction capture
    }

    private fun isMaskedPlaceholder(title: String, text: String, bigText: String): Boolean {
        val combined = "$title $text $bigText".lowercase().trim()
        if (combined.isEmpty()) return true
        if (combined.contains("sensitive notification content hidden") ||
            combined.contains("contents hidden")
        ) {
            return true
        }
        return false
    }

    private fun buildStableId(
        packageName: String,
        title: String,
        text: String,
        bigText: String,
        postTime: Long
    ): String {
        val bucket = postTime / 120_000L
        val raw = "$packageName|${title.lowercase()}|${text.lowercase()}|${bigText.lowercase()}|$bucket"
        return try {
            val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
            val hex = digest.take(10).joinToString("") { "%02x".format(it) }
            "notif_$hex"
        } catch (_: Exception) {
            "notif_${raw.hashCode()}_$bucket"
        }
    }
}
