# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated & screens
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Nitro Modules & MMKV (JNI & reflection)
-keep class com.margelo.nitro.** { *; }
-keep class com.tencent.mmkv.** { *; }

# Expo modules (SQLite, SecureStore, etc.)
-keep class expo.modules.sqlite.** { *; }
-keep class expo.modules.securestore.** { *; }
-keep class expo.modules.localauthentication.** { *; }

# Google Sign-In
-keep class com.google.android.gms.auth.api.signin.** { *; }
-keep class com.reactnativegooglesignin.** { *; }

# Custom Clarity Native Modules (e.g. SmsReader)
-keep class com.homerun.clarity.sms.** { *; }
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    @com.facebook.react.bridge.ReactMethod *;
}

# General suppressions for harmless missing class warnings
-dontwarn com.facebook.react.**
-dontwarn expo.modules.**
