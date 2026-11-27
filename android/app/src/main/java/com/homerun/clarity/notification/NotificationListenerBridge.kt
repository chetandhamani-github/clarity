package com.homerun.clarity.notification

import android.content.Context
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

object NotificationListenerBridge {
    private const val PREFS_NAME = "clarity_notification_bridge_prefs"
    private const val KEY_PENDING_JSON = "pending_notifications_json"
    private const val KEY_LISTENER_CONNECTED = "listener_connected"
    private const val KEY_LAST_CONNECTED_AT = "last_connected_at"
    private const val KEY_LAST_DISCONNECTED_AT = "last_disconnected_at"
    private const val KEY_LAST_EVENT_AT = "last_event_at"
    private const val KEY_LAST_EVENT_APP = "last_event_app"
    private const val MAX_BUFFER_SIZE = 200
    private const val MAX_RECENT_IDS = 250

    @Volatile
    private var reactContext: ReactApplicationContext? = null

    @Volatile
    private var appContext: Context? = null

    @Volatile
    private var isJsListenerReady: Boolean = false

    @Volatile
    private var isServiceCurrentlyBound: Boolean = false

    private val lock = Any()
    private val listenerLock = Any()
    private val recentIds = LinkedHashSet<String>()
    private var activeJsListeners: Int = 0

    fun init(context: Context?) {
        if (context != null) {
            appContext = context.applicationContext
        }
    }

    fun setReactContext(context: ReactApplicationContext?) {
        this.reactContext = context
        if (context != null) {
            this.appContext = context.applicationContext
        } else {
            this.isJsListenerReady = false
            synchronized(listenerLock) {
                activeJsListeners = 0
            }
        }
    }

    fun setJsListenerReady(ready: Boolean) {
        this.isJsListenerReady = ready
    }

    fun addJsListener(eventName: String) {
        if (eventName == "onNotificationReceived") {
            synchronized(listenerLock) {
                activeJsListeners += 1
            }
        }
    }

    fun removeJsListeners(count: Int) {
        synchronized(listenerLock) {
            activeJsListeners = maxOf(0, activeJsListeners - maxOf(0, count))
        }
    }

    private fun hasActiveJsListeners(): Boolean {
        synchronized(listenerLock) {
            return activeJsListeners > 0
        }
    }

    fun getLastDisconnectOrConnectWindow(context: Context?): Pair<Long, Long> {
        val ctx = context?.applicationContext ?: appContext ?: return (0L to 0L)
        val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getLong(KEY_LAST_CONNECTED_AT, 0L) to prefs.getLong(KEY_LAST_DISCONNECTED_AT, 0L)
    }

    fun recordListenerConnected(context: Context?, connected: Boolean) {
        isServiceCurrentlyBound = connected
        val ctx = context?.applicationContext ?: appContext ?: return
        val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis().toDouble()
        prefs.edit().apply {
            putBoolean(KEY_LISTENER_CONNECTED, connected)
            if (connected) {
                putLong(KEY_LAST_CONNECTED_AT, now.toLong())
            } else {
                putLong(KEY_LAST_DISCONNECTED_AT, now.toLong())
            }
        }.apply()
    }

    fun clearLocalState(context: Context? = null) {
        init(context)
        synchronized(lock) {
            recentIds.clear()
            val ctx = appContext ?: return
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .remove(KEY_PENDING_JSON)
                .remove(KEY_LAST_EVENT_AT)
                .remove(KEY_LAST_EVENT_APP)
                .apply()
        }
    }

    fun getHealthSnapshot(context: Context?, hasPermission: Boolean = true): Bundle {
        val ctx = context?.applicationContext ?: appContext
        val snapshot = Bundle()
        if (ctx == null) {
            snapshot.putBoolean("isServiceConnected", false)
            snapshot.putInt("pendingCount", 0)
            return snapshot
        }

        synchronized(lock) {
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_PENDING_JSON, null)
            val pendingCount = try {
                if (raw.isNullOrEmpty()) 0 else JSONArray(raw).length()
            } catch (_: Exception) {
                0
            }

            snapshot.putBoolean("isServiceConnected", hasPermission && isServiceCurrentlyBound)
            snapshot.putInt("pendingCount", pendingCount)

            val lastConnectedAt = prefs.getLong(KEY_LAST_CONNECTED_AT, 0L)
            if (lastConnectedAt > 0L) {
                snapshot.putDouble("lastConnectedAt", lastConnectedAt.toDouble())
            }

            val lastDisconnectedAt = prefs.getLong(KEY_LAST_DISCONNECTED_AT, 0L)
            if (lastDisconnectedAt > 0L) {
                snapshot.putDouble("lastDisconnectedAt", lastDisconnectedAt.toDouble())
            }

            val lastEventAt = prefs.getLong(KEY_LAST_EVENT_AT, 0L)
            if (lastEventAt > 0L) {
                snapshot.putDouble("lastEventAt", lastEventAt.toDouble())
            }

            val lastEventApp = prefs.getString(KEY_LAST_EVENT_APP, null)
            if (!lastEventApp.isNullOrEmpty()) {
                snapshot.putString("lastEventApp", lastEventApp)
            }
        }

        return snapshot
    }

    fun onNotificationPosted(context: Context?, notificationData: Bundle) {
        init(context)
        val id = notificationData.getString("id") ?: return
        val appName = notificationData.getString("appName") ?: notificationData.getString("packageName") ?: ""
        val postTime = notificationData.getDouble("postTime").toLong()

        synchronized(lock) {
            if (recentIds.contains(id)) {
                return
            }
            if (recentIds.size >= MAX_RECENT_IDS) {
                val iterator = recentIds.iterator()
                if (iterator.hasNext()) {
                    iterator.next()
                    iterator.remove()
                }
            }
            recentIds.add(id)
            recordLastEventLocked(appName, if (postTime > 0L) postTime else System.currentTimeMillis())
        }

        // Persist durably before emitting so notifications are never lost if JS is killed or paused
        persistToBuffer(notificationData)

        val ctx = reactContext
        if (ctx != null && ctx.hasActiveReactInstance() && hasActiveJsListeners() && isJsListenerReady) {
            try {
                val map = Arguments.fromBundle(notificationData)
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onNotificationReceived", map)
            } catch (_: Exception) {
                // Remains safely in durable buffer until processed & acked
            }
        }
    }

    fun peekPendingNotifications(context: Context? = null): List<Bundle> {
        init(context)
        val ctx = appContext ?: return emptyList()

        synchronized(lock) {
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_PENDING_JSON, null) ?: return emptyList()
            if (raw.isEmpty()) return emptyList()

            return try {
                val array = JSONArray(raw)
                val list = ArrayList<Bundle>(array.length())
                for (i in 0 until array.length()) {
                    val obj = array.optJSONObject(i) ?: continue
                    list.add(jsonToBundle(obj))
                }
                list
            } catch (_: Exception) {
                emptyList()
            }
        }
    }

    fun ackPendingNotifications(context: Context? = null, processedIds: Set<String>) {
        if (processedIds.isEmpty()) return
        init(context)
        val ctx = appContext ?: return

        synchronized(lock) {
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_PENDING_JSON, null) ?: return
            if (raw.isEmpty()) return

            try {
                val array = JSONArray(raw)
                val remaining = JSONArray()
                for (i in 0 until array.length()) {
                    val item = array.optJSONObject(i) ?: continue
                    val itemId = item.optString("id", "")
                    if (!processedIds.contains(itemId)) {
                        remaining.put(item)
                    }
                }
                if (remaining.length() == 0) {
                    prefs.edit().remove(KEY_PENDING_JSON).apply()
                } else {
                    prefs.edit().putString(KEY_PENDING_JSON, remaining.toString()).apply()
                }
            } catch (_: Exception) {
                // Ignore malformed JSON
            }
        }
    }

    fun drainPendingNotifications(context: Context? = null): List<Bundle> {
        init(context)
        val ctx = appContext ?: return emptyList()

        synchronized(lock) {
            val list = peekPendingNotifications(ctx)
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().remove(KEY_PENDING_JSON).apply()
            return list
        }
    }

    private fun recordLastEventLocked(appName: String, timestamp: Long) {
        val ctx = appContext ?: return
        val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putLong(KEY_LAST_EVENT_AT, timestamp)
            .putString(KEY_LAST_EVENT_APP, appName)
            .apply()
    }

    private fun persistToBuffer(notificationData: Bundle) {
        val ctx = appContext ?: return
        val id = notificationData.getString("id") ?: return

        synchronized(lock) {
            val prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val existingRaw = prefs.getString(KEY_PENDING_JSON, null)
            val array = try {
                if (existingRaw.isNullOrEmpty()) JSONArray() else JSONArray(existingRaw)
            } catch (_: Exception) {
                JSONArray()
            }

            for (i in 0 until array.length()) {
                if (array.optJSONObject(i)?.optString("id") == id) {
                    return
                }
            }

            val updated = JSONArray()
            val startIndex = if (array.length() >= MAX_BUFFER_SIZE) {
                array.length() - MAX_BUFFER_SIZE + 1
            } else {
                0
            }
            for (i in startIndex until array.length()) {
                val item = array.optJSONObject(i)
                if (item != null) {
                    updated.put(item)
                }
            }
            updated.put(bundleToJson(notificationData))

            prefs.edit().putString(KEY_PENDING_JSON, updated.toString()).apply()
        }
    }

    private fun bundleToJson(bundle: Bundle): JSONObject {
        return JSONObject().apply {
            put("id", bundle.getString("id") ?: "")
            put("packageName", bundle.getString("packageName") ?: "")
            put("appName", bundle.getString("appName") ?: "")
            put("title", bundle.getString("title") ?: "")
            put("text", bundle.getString("text") ?: "")
            put("bigText", bundle.getString("bigText") ?: "")
            put("subText", bundle.getString("subText") ?: "")
            put("postTime", bundle.getDouble("postTime"))
        }
    }

    private fun jsonToBundle(obj: JSONObject): Bundle {
        return Bundle().apply {
            putString("id", obj.optString("id", ""))
            putString("packageName", obj.optString("packageName", ""))
            putString("appName", obj.optString("appName", ""))
            putString("title", obj.optString("title", ""))
            putString("text", obj.optString("text", ""))
            putString("bigText", obj.optString("bigText", ""))
            putString("subText", obj.optString("subText", ""))
            putDouble("postTime", obj.optDouble("postTime", System.currentTimeMillis().toDouble()))
        }
    }
}
