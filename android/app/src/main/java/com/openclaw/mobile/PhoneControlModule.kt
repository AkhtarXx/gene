package com.openclaw.mobile

import android.app.AlertDialog
import android.app.KeyguardManager
import android.content.Intent
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.modules.core.DeviceEventManagerModule

class PhoneControlModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private var armDialog: AlertDialog? = null
  private var armPromise: Promise? = null
  private val stopped: () -> Unit = {
    if (context.hasActiveReactInstance()) context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("PhoneControlStopped", null)
  }
  init { context.addLifecycleEventListener(this); PhoneControlService.onStopped = stopped }
  private fun cancelArm() {
    val dialog = armDialog; armDialog = null
    val promise = armPromise; armPromise = null
    dialog?.dismiss(); promise?.resolve(false)
  }
  override fun onHostResume() {}
  override fun onHostPause() { cancelArm() }
  override fun onHostDestroy() { cancelArm(); PhoneControlService.current?.stop() }
  override fun getName() = "PhoneControl"
  private fun run(promise: Promise, action: () -> Unit) {
    UiThreadUtil.runOnUiThread {
      try { action() } catch (error: Exception) {
        if (BuildConfig.DEBUG) android.util.Log.w("PhoneControl", error.message?.takeIf { it.matches(Regex("[a-z_]{1,64}")) } ?: "control_unavailable")
        promise.reject("PHONE_CONTROL", "Control unavailable, stale screen or app not allowed.")
      }
    }
  }
  private fun service() = PhoneControlService.current ?: error("enable_accessibility_first")
  @ReactMethod fun status(promise: Promise) = run(promise) {
    promise.resolve(Arguments.createMap().apply {
      putBoolean("available", true); putBoolean("enabled", PhoneControlService.current != null)
      putBoolean("armed", PhoneControlService.current?.active == true)
      putArray("packages", Arguments.fromList(PhoneControlService.current?.selectedPackages() ?: emptyList<String>()))
    })
  }
  @ReactMethod fun openSettings(promise: Promise) = run(promise) {
    context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); promise.resolve(null)
  }
  @ReactMethod fun arm(packages: ReadableArray, promise: Promise) = run(promise) {
    check(armPromise == null) { "enable_review_pending" }
    val activity = currentActivity ?: error("foreground_required")
    check(activity.hasWindowFocus()) { "foreground_required" }
    val control = service(); val revision = control.revision
    val selected = packages.toArrayList().map { it as? String ?: error("invalid_package") }.toSet()
    check(selected.isNotEmpty() && selected.size <= 8 && selected.all {
      it.matches(Regex("[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+")) &&
        it !in setOf(context.packageName, "com.android.systemui", "com.android.permissioncontroller", "com.google.android.permissioncontroller", "com.android.packageinstaller", "com.google.android.packageinstaller")
    }) { "invalid_packages" }
    armPromise = promise
    val dialog = AlertDialog.Builder(activity).setTitle("Allow personal phone control?")
      .setMessage("For 10 minutes Gene can read visible text and request taps, typing, scrolling and Back in:\n\n${selected.joinToString("\n")}\n\nScreen content stays on this device. Every change needs Allow once, including Send. Password screens are blocked. Use the floating STOP button to end access.")
      .setNegativeButton("Cancel") { _, _ -> cancelArm() }
      .setPositiveButton("Enable for 10 minutes") { _, _ ->
        if (armPromise !== promise) return@setPositiveButton
        armPromise = null; armDialog = null
        try {
          check(currentActivity === activity && !activity.isFinishing && !activity.isDestroyed &&
            context.lifecycleState == com.facebook.react.common.LifecycleState.RESUMED &&
            !(context.getSystemService(android.content.Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked &&
            PhoneControlService.current === control && control.revision == revision)
          control.arm(selected); promise.resolve(true)
        } catch (_: Exception) { promise.reject("PHONE_CONTROL", "Enable cancelled or service unavailable.") }
      }.setOnCancelListener { cancelArm() }.create()
    armDialog = dialog
    try { dialog.show() } catch (e: Exception) { cancelArm(); throw e }
  }
  @ReactMethod fun stop(promise: Promise) = run(promise) { cancelArm(); PhoneControlService.current?.stop(); promise.resolve(null) }
  @ReactMethod fun cancel(promise: Promise) = run(promise) { cancelArm(); PhoneControlService.current?.cancelPending(); promise.resolve(null) }
  @ReactMethod fun read(promise: Promise) = run(promise) { promise.resolve(service().read()) }
  @ReactMethod fun act(screen: String, node: String, action: String, text: String, promise: Promise) = run(promise) {
    service().act(screen, node, action, text) { promise.resolve(it) }
  }
  @ReactMethod fun launch(pkg: String, promise: Promise) = run(promise) { service().launch(pkg) { promise.resolve(it) } }
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    UiThreadUtil.runOnUiThread {
      cancelArm(); PhoneControlService.current?.stop()
      if (PhoneControlService.onStopped === stopped) PhoneControlService.onStopped = null
    }
    super.invalidate()
  }
}

class PhoneControlPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(PhoneControlModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
