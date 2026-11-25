package com.homerun.clarity.notification

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
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
        promise.resolve(hasNotificationListenerAccess())
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
    fun isBatteryOptimizationIgnored(promise: Promise) {
        promise.resolve(checkBatteryOptimizationIgnored())
    }

    @ReactMethod
    fun openBatteryOptimizationSettings(promise: Promise) {
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (_: Exception) {
            try {
                val fallbackIntent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(fallbackIntent)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("BATTERY_SETTINGS_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getListenerHealth(promise: Promise) {
        try {
            val granted = hasNotificationListenerAccess()
            val batteryIgnored = checkBatteryOptimizationIgnored()
            val snapshot = NotificationListenerBridge.getHealthSnapshot(reactContext.applicationContext)
            val map = Arguments.fromBundle(snapshot)
            map.putBoolean("isPermissionGranted", granted)
            map.putBoolean("isBatteryOptimizationIgnored", batteryIgnored)
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_HEALTH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun requestRebind(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && hasNotificationListenerAccess()) {
                NotificationListenerService.requestRebind(
                    ComponentName(reactContext, ClarityNotificationListenerService::class.java)
                )
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun drainPendingNotifications(promise: Promise) {
        try {
            val list = NotificationListenerBridge.drainPendingNotifications(reactContext.applicationContext)
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

    private fun hasNotificationListenerAccess(): Boolean {
        return try {
            val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
            enabledPackages.contains(reactContext.packageName)
        } catch (_: Exception) {
            false
        }
    }

    private fun checkBatteryOptimizationIgnored(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true
        }
        return try {
            val powerManager = reactContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
            powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) ?: false
        } catch (_: Exception) {
            false
        }
    }
}
