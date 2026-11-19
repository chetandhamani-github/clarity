package com.homerun.clarity.notification

import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.ArrayList

object NotificationListenerBridge {
    @Volatile
    private var reactContext: ReactApplicationContext? = null
    private val pendingBuffer = ArrayList<Bundle>()
    private const val MAX_BUFFER_SIZE = 50

    fun setReactContext(context: ReactApplicationContext?) {
        this.reactContext = context
    }

    fun onNotificationPosted(notificationData: Bundle) {
        val ctx = reactContext
        if (ctx != null && ctx.hasActiveReactInstance()) {
            try {
                val map = Arguments.fromBundle(notificationData)
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    ?.emit("onNotificationReceived", map)
                return
            } catch (_: Exception) {
                // If emit fails, fall through to buffer
            }
        }

        // React context not initialized or inactive: buffer for retrieval upon startup
        synchronized(pendingBuffer) {
            if (pendingBuffer.size >= MAX_BUFFER_SIZE) {
                pendingBuffer.removeAt(0)
            }
            pendingBuffer.add(notificationData)
        }
    }

    fun drainPendingNotifications(): List<Bundle> {
        synchronized(pendingBuffer) {
            val list = ArrayList(pendingBuffer)
            pendingBuffer.clear()
            return list
        }
    }
}

