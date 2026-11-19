package com.homerun.clarity.notification

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NotificationListenerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        NotificationListenerBridge.setReactContext(reactContext)
    }

    override fun getName(): String = "NotificationListener"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun isPermissionGranted(promise: Promise) {
        try {
            val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
            val isGranted = enabledPackages.contains(reactContext.packageName)
            promise.resolve(isGranted)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_PERMISSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun drainPendingNotifications(promise: Promise) {
        try {
            val list = NotificationListenerBridge.drainPendingNotifications()
            val array = Arguments.createArray()
            for (bundle in list) {
                array.pushMap(Arguments.fromBundle(bundle))
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_DRAIN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // NativeEventEmitter requirement
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // NativeEventEmitter requirement
    }

    override fun invalidate() {
        super.invalidate()
        NotificationListenerBridge.setReactContext(null)
    }
}

