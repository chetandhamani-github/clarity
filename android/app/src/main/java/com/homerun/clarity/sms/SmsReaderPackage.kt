package com.homerun.clarity.sms

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager
import java.util.ArrayList

class SmsReaderPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        val modules = ArrayList<NativeModule>()
        modules.add(SmsReaderModule(reactContext))
        return modules
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<View, ReactShadowNode<*>>> {
        return emptyList()
    }
}
