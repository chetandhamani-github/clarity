package com.homerun.clarity.notification

import android.app.Notification
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class ClarityNotificationListenerService : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val packageName = sbn.packageName ?: return

        // Filter: only inspect notifications from financial/banking/UPI apps
        if (!AllowedPackages.isAllowed(packageName)) {
            return
        }

        val appName = AllowedPackages.getAppName(packageName) ?: packageName
        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim() ?: ""
        val postTime = sbn.postTime

        if (title.isEmpty() && text.isEmpty() && bigText.isEmpty()) {
            return
        }

        val notificationId = "notif_${sbn.id}_${postTime}"

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

        NotificationListenerBridge.onNotificationPosted(bundle)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // Not used for financial transaction capture
    }
}

