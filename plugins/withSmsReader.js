const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function nativeModuleSource(packageName) {
  return `package ${packageName}.sms

import android.provider.Telephony
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import java.util.ArrayList

class SmsReaderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SmsReader"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun getSms(options: ReadableMap?, promise: Promise) {
        try {
            val limit = if (options != null && options.hasKey("limit")) {
                options.getInt("limit").coerceAtLeast(1)
            } else {
                500
            }
            val offset = if (options != null && options.hasKey("offset")) {
                options.getInt("offset").coerceAtLeast(0)
            } else {
                0
            }
            val sinceTimestamp = if (options != null && options.hasKey("sinceTimestamp")) {
                options.getDouble("sinceTimestamp").toLong()
            } else {
                null
            }
            val startDate = if (options != null && options.hasKey("startDate")) {
                options.getDouble("startDate").toLong()
            } else {
                null
            }
            val endDate = if (options != null && options.hasKey("endDate")) {
                options.getDouble("endDate").toLong()
            } else {
                null
            }
            val addressFilter = if (options != null && options.hasKey("address")) {
                options.getString("address")
            } else {
                null
            }

            val selectionParts = ArrayList<String>()
            val selectionArgs = ArrayList<String>()

            if (sinceTimestamp != null) {
                selectionParts.add("\${Telephony.Sms.DATE} >= ?")
                selectionArgs.add(sinceTimestamp.toString())
            }
            if (startDate != null) {
                selectionParts.add("${Telephony.Sms.DATE} >= ?")
                selectionArgs.add(startDate.toString())
            }
            if (endDate != null) {
                selectionParts.add("\${Telephony.Sms.DATE} <= ?")
                selectionArgs.add(endDate.toString())
            }
            if (!addressFilter.isNullOrEmpty()) {
                selectionParts.add("\${Telephony.Sms.ADDRESS} LIKE ?")
                selectionArgs.add("%\\$addressFilter%")
            }

            val selection = if (selectionParts.isNotEmpty()) {
                selectionParts.joinToString(" AND ")
            } else {
                null
            }
            val args = if (selectionArgs.isNotEmpty()) selectionArgs.toTypedArray() else null
            val sortOrder = "\${Telephony.Sms.DATE} DESC"

            val cursor = reactContext.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                arrayOf(
                    Telephony.Sms._ID,
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE,
                    Telephony.Sms.DATE_SENT,
                    Telephony.Sms.READ
                ),
                selection,
                args,
                sortOrder
            )

            val smsList = Arguments.createArray()
            cursor?.use {
                val idColumn = it.getColumnIndexOrThrow(Telephony.Sms._ID)
                val addressColumn = it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val bodyColumn = it.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val dateColumn = it.getColumnIndexOrThrow(Telephony.Sms.DATE)
                val dateSentColumn = it.getColumnIndex(Telephony.Sms.DATE_SENT)
                val readColumn = it.getColumnIndex(Telephony.Sms.READ)

                if (it.moveToPosition(offset)) {
                    var count = 0
                    do {
                        val message = Arguments.createMap()
                        message.putString("id", it.getString(idColumn))
                        message.putString("address", it.getString(addressColumn) ?: "")
                        message.putString("body", it.getString(bodyColumn) ?: "")
                        message.putDouble("date", it.getLong(dateColumn).toDouble())
                        if (dateSentColumn >= 0 && !it.isNull(dateSentColumn)) {
                            message.putDouble("dateSent", it.getLong(dateSentColumn).toDouble())
                        }
                        if (readColumn >= 0 && !it.isNull(readColumn)) {
                            message.putInt("read", it.getInt(readColumn))
                        }
                        smsList.pushMap(message)
                        count++
                    } while (count < limit && it.moveToNext())
                }
            }

            promise.resolve(smsList)
        } catch (error: Exception) {
            promise.reject("SMS_READ_ERROR", error.message, error)
        }
    }

    @ReactMethod
    fun getSmsSince(timestamp: Double, limit: Int, promise: Promise) {
        val options = Arguments.createMap()
        options.putDouble("sinceTimestamp", timestamp)
        if (limit > 0) {
            options.putInt("limit", limit)
        }
        getSms(options, promise)
    }
}
`;
}

function nativePackageSource(packageName) {
  return `package ${packageName}.sms

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SmsReaderPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(SmsReaderModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
`;
}

function registerPackage(mainApplication, packageName) {
  const importLine = `import ${packageName}.sms.SmsReaderPackage`;
  let contents = mainApplication;

  if (!contents.includes(importLine)) {
    contents = contents.replace(
      '\nclass MainApplication',
      '\n' + importLine + '\n\nclass MainApplication'
    );
  }

  const packageRegistration = '          add(SmsReaderPackage())';
  if (!contents.includes(packageRegistration)) {
    contents = contents.replace(
      '        PackageList(this).packages.apply {',
      '        PackageList(this).packages.apply {\n' + packageRegistration
    );
  }

  return contents;
}

module.exports = function withSmsReader(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageName = modConfig.android.package;
      if (!packageName) {
        throw new Error('Android package is required to install SmsReader.');
      }

      const packageDirectory = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.')
      );
      const smsDirectory = path.join(packageDirectory, 'sms');
      const mainApplicationPath = path.join(packageDirectory, 'MainApplication.kt');

      fs.mkdirSync(smsDirectory, { recursive: true });
      fs.writeFileSync(
        path.join(smsDirectory, 'SmsReaderModule.kt'),
        nativeModuleSource(packageName)
      );
      fs.writeFileSync(
        path.join(smsDirectory, 'SmsReaderPackage.kt'),
        nativePackageSource(packageName)
      );

      const mainApplication = fs.readFileSync(mainApplicationPath, 'utf8');
      fs.writeFileSync(
        mainApplicationPath,
        registerPackage(mainApplication, packageName)
      );

      return modConfig;
    },
  ]);
};

module.exports.nativeModuleSource = nativeModuleSource;
module.exports.nativePackageSource = nativePackageSource;
module.exports.registerPackage = registerPackage;
