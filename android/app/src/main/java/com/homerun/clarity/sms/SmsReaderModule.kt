package com.homerun.clarity.sms

import android.provider.Telephony
import com.facebook.react.bridge.*
import java.util.ArrayList

class SmsReaderModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "SmsReader"
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(true)
    }

    @ReactMethod
    fun getSms(options: ReadableMap?, promise: Promise) {
        try {
            val limit = if (options != null && options.hasKey("limit")) options.getInt("limit").coerceAtLeast(1) else 500
            val offset = if (options != null && options.hasKey("offset")) options.getInt("offset").coerceAtLeast(0) else 0
            val sinceTimestamp = if (options != null && options.hasKey("sinceTimestamp")) options.getDouble("sinceTimestamp").toLong() else null
            val startDate = if (options != null && options.hasKey("startDate")) options.getDouble("startDate").toLong() else null
            val endDate = if (options != null && options.hasKey("endDate")) options.getDouble("endDate").toLong() else null
            val addressFilter = if (options != null && options.hasKey("address")) options.getString("address") else null

            val selectionParts = ArrayList<String>()
            val selectionArgs = ArrayList<String>()

            if (sinceTimestamp != null) {
                selectionParts.add("${Telephony.Sms.DATE} >= ?")
                selectionArgs.add(sinceTimestamp.toString())
            }
            if (startDate != null) {
                selectionParts.add("${Telephony.Sms.DATE} >= ?")
                selectionArgs.add(startDate.toString())
            }
            if (endDate != null) {
                selectionParts.add("${Telephony.Sms.DATE} <= ?")
                selectionArgs.add(endDate.toString())
            }
            if (!addressFilter.isNullOrEmpty()) {
                selectionParts.add("${Telephony.Sms.ADDRESS} LIKE ?")
                selectionArgs.add("%$addressFilter%")
            }

            val selection = if (selectionParts.isNotEmpty()) selectionParts.joinToString(" AND ") else null
            val args = if (selectionArgs.isNotEmpty()) selectionArgs.toTypedArray() else null
            val sortOrder = "${Telephony.Sms.DATE} DESC"

            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.DATE_SENT,
                Telephony.Sms.READ
            )

            val cursor = reactContext.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI,
                projection,
                selection,
                args,
                sortOrder
            )

            val smsList = Arguments.createArray()

            cursor?.use {
                val idCol = it.getColumnIndexOrThrow(Telephony.Sms._ID)
                val addrCol = it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
                val bodyCol = it.getColumnIndexOrThrow(Telephony.Sms.BODY)
                val dateCol = it.getColumnIndexOrThrow(Telephony.Sms.DATE)
                val dateSentCol = it.getColumnIndex(Telephony.Sms.DATE_SENT)
                val readCol = it.getColumnIndex(Telephony.Sms.READ)

                if (it.moveToPosition(offset)) {
                    var count = 0
                    do {
                        val map = Arguments.createMap()
                        map.putString("id", it.getString(idCol))
                        map.putString("address", it.getString(addrCol) ?: "")
                        map.putString("body", it.getString(bodyCol) ?: "")
                        map.putDouble("date", it.getLong(dateCol).toDouble())
                        if (dateSentCol >= 0 && !it.isNull(dateSentCol)) {
                            map.putDouble("dateSent", it.getLong(dateSentCol).toDouble())
                        }
                        if (readCol >= 0 && !it.isNull(readCol)) {
                            map.putInt("read", it.getInt(readCol))
                        }
                        smsList.pushMap(map)
                        count++
                    } while (count < limit && it.moveToNext())
                }
            }

            promise.resolve(smsList)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", e.message, e)
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
