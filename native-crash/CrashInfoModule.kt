package com.ardagnl.aramayonetim

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CrashInfoModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "CrashInfo"

  @ReactMethod
  fun consumeNativeCrash(promise: Promise) {
    try {
      val prefs = reactApplicationContext.getSharedPreferences("ays_diagnostics", Context.MODE_PRIVATE)
      val crash = prefs.getString("native_crash", null)
      if (crash != null) prefs.edit().remove("native_crash").commit()
      promise.resolve(crash)
    } catch (error: Exception) {
      promise.reject("CRASH_READ_FAILED", error)
    }
  }
}
