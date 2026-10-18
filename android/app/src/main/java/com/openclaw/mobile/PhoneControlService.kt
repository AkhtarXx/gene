package com.openclaw.mobile

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.graphics.Color
import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

/** Personal APK only. No event text is collected and nothing is persisted. */
class PhoneControlService : AccessibilityService() {
  companion object {
    var current: PhoneControlService? = null; private set
    var onStopped: (() -> Unit)? = null
  }
  private val main = Handler(Looper.getMainLooper())
  private var allowed = emptySet<String>()
  private var deadline = 0L
  private var stopView: View? = null
  private var review: View? = null
  private var pending: ((String) -> Unit)? = null
  private var snapshotId = ""
  var revision = 0L; private set
  private var requestId = ""
  private var effectDispatched = false
  private var snapshotHash = ""
  private var nodes = emptyMap<String, String>()
  private val expire = Runnable { stop() }
  private val reviewTimeout = Runnable { finish("denied") }
  private val wm get() = getSystemService(WINDOW_SERVICE) as WindowManager
  val active get() = deadline > SystemClock.elapsedRealtime() && allowed.isNotEmpty()
  fun selectedPackages(): List<String> = if (active) allowed.sorted() else emptyList()

  override fun onServiceConnected() { current = this }
  override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* On-demand reads only. */ }
  override fun onInterrupt() { stop() }
  override fun onDestroy() { stop(); if (current === this) current = null; super.onDestroy() }

  fun arm(packages: Set<String>) {
    stop()
    allowed = packages
    deadline = SystemClock.elapsedRealtime() + 10 * 60_000
    try {
      stopView = Button(this).apply {
        text = "STOP Gene"
        setTextColor(Color.WHITE); setBackgroundColor(Color.rgb(160, 24, 40))
        setOnClickListener { stop() }
      }
      wm.addView(stopView, params(Gravity.TOP or Gravity.END))
      main.postDelayed(expire, 10 * 60_000)
    } catch (e: Exception) { stop(); throw e }
  }

  fun stop() {
    val wasActive = deadline != 0L || allowed.isNotEmpty()
    revision++
    deadline = 0; allowed = emptySet(); invalidate()
    main.removeCallbacks(expire)
    finish("stopped")
    stopView?.let { try { wm.removeView(it) } catch (_: Exception) {} }
    stopView = null
    if (wasActive) onStopped?.invoke()
  }

  fun cancelPending() { revision++; finish("cancelled"); invalidate() }
  private fun invalidate() { snapshotId = ""; snapshotHash = ""; nodes = emptyMap() }
  private fun unlocked() = !(getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
  private fun foregroundRoot(): AccessibilityNodeInfo {
    val visible = windows
    try {
      for (window in visible.filter { it.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY }) {
        val overlay = window.root ?: error("unknown_overlay")
        try { check(overlay.packageName?.toString() == packageName) { "foreign_overlay" } }
        finally { release(overlay) }
      }
      check(visible.none { it.isActive && it.type == AccessibilityWindowInfo.TYPE_SYSTEM }) { "system_window_active" }
      val app = visible.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_APPLICATION && (it.isActive || it.isFocused) }
        ?: error("screen_unavailable")
      return app.root ?: error("screen_unavailable")
    } finally {
      if (android.os.Build.VERSION.SDK_INT < 33) {
        @Suppress("DEPRECATION")
        visible.forEach { it.recycle() }
      }
    }
  }
  private fun root(): AccessibilityNodeInfo {
    check(active && unlocked()) { "control_disabled_or_locked" }
    val root = foregroundRoot()
    if (!root.refresh() || root.packageName?.toString() !in allowed) { release(root); error("app_not_allowed_or_stale") }
    return root
  }

  @Suppress("DEPRECATION")
  private fun release(node: AccessibilityNodeInfo) { if (android.os.Build.VERSION.SDK_INT < 33) node.recycle() }
  private fun signature(node: AccessibilityNodeInfo): String {
    val rect = Rect(); node.getBoundsInScreen(rect)
    val strings = listOf(node.packageName, node.viewIdResourceName, node.className, node.text, node.contentDescription)
      .map { check((it?.length ?: 0) <= 2048) { "screen_text_too_large" }; it?.toString() }
    return JSONArray(strings + listOf(rect.toShortString(), node.isEnabled, node.isEditable,
      node.isClickable, node.isScrollable, node.isPassword, node.isVisibleToUser,
      node.windowId, node.isChecked, node.isSelected, node.isFocused)).toString()
  }

  /** Bound the scan, suppress passwords and fail closed on incomplete trees. */
  private fun scan(root: AccessibilityNodeInfo, visit: (AccessibilityNodeInfo, String) -> Unit): String {
    val digest = MessageDigest.getInstance("SHA-256")
    var count = 0
    var characters = 0
    fun walk(node: AccessibilityNodeInfo, path: String, depth: Int) {
      check(++count <= 400 && depth <= 35) { "screen_too_complex" }
      check(!node.isVisibleToUser || !node.isPassword) { "protected_input_screen" }
      val data = JSONArray(listOf(path, signature(node))).toString()
      characters += data.length; check(characters <= 128_000) { "screen_text_too_large" }
      digest.update(data.toByteArray(Charsets.UTF_8))
      if (node.isVisibleToUser) visit(node, path)
      for (i in 0 until node.childCount) {
        val child = node.getChild(i) ?: error("incomplete_screen")
        try { walk(child, "$path.$i", depth + 1) } finally { release(child) }
      }
    }
    walk(root, "0", 0)
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  fun read(): String {
    check(pending == null) { "review_pending" }
    invalidate()
    val root = root()
    try {
      val result = JSONArray()
      val handles = mutableMapOf<String, String>()
      val hash = scan(root) { node, path ->
        if (result.length() < 20 && (node.isClickable || node.isEditable || node.isScrollable ||
            !node.text.isNullOrBlank() || !node.contentDescription.isNullOrBlank())) {
          handles[path] = signature(node)
          result.put(JSONObject().put("id", path)
            .put("text", (node.text ?: node.contentDescription ?: "").toString().take(80))
            .put("click", node.isClickable && node.isEnabled)
            .put("edit", node.isEditable && node.isEnabled).put("scroll", node.isScrollable))
        }
      }
      snapshotId = UUID.randomUUID().toString(); snapshotHash = hash; nodes = handles
      val payload = JSONObject().put("package", root.packageName).put("screen", snapshotId)
        .put("nodes", result).put("limit", 20)
      // The agent bounds tool results at 3000 chars. Preserve valid JSON and
      // complete node IDs instead of letting that boundary cut a screen in half.
      while (payload.toString().length > 2800 && result.length() > 0) {
        handles.remove(result.getJSONObject(result.length() - 1).getString("id"))
        result.remove(result.length() - 1)
      }
      return payload.toString()
    } finally { release(root) }
  }

  private fun find(root: AccessibilityNodeInfo, path: String): AccessibilityNodeInfo {
    check(path.matches(Regex("0(\\.[0-9]+){0,35}"))) { "invalid_node" }
    var node = AccessibilityNodeInfo.obtain(root)
    try {
      for (part in path.split('.').drop(1)) {
        val child = node.getChild(part.toInt()) ?: error("stale_screen")
        release(node); node = child
      }
      return node
    } catch (e: Exception) { release(node); throw e }
  }

  fun act(screen: String, id: String, action: String, value: String, done: (String) -> Unit) {
    check(pending == null) { "review_pending" }
    check(screen.isNotEmpty() && screen == snapshotId) { "stale_screen" }
    check(action in setOf("tap", "type", "scroll_forward", "scroll_backward", "back")) { "invalid_action" }
    check(value.length <= 2000) { "text_too_long" }
    val root = root()
    try {
      check(scan(root) { _, _ -> } == snapshotHash) { "stale_screen" }
      val pkg = root.packageName.toString()
      val target = if (action == "back") "Android Back" else {
        check(nodes.containsKey(id)) { "unknown_node" }
        val node = find(root, id)
        try {
          check(node.refresh() && node.isVisibleToUser && node.isEnabled && !node.isPassword && signature(node) == nodes[id]) { "stale_target" }
          when (action) {
            "tap" -> check(node.isClickable) { "not_clickable" }
            "type" -> check(node.isEditable) { "not_editable" }
            else -> check(node.isScrollable) { "not_scrollable" }
          }
          (node.text ?: node.contentDescription ?: node.viewIdResourceName ?: node.className).toString().take(300)
        } finally { release(node) }
      }
      approve("App: $pkg\nAction: $action\nTarget: $target\n${if (action == "type") "Replace text with:\n$value" else ""}\n\nA tap may send, delete or purchase. Check the app behind this panel.", done) {
        check(screen == snapshotId) { "stale_screen" }
        val live = root()
        try {
          check(live.packageName.toString() == pkg && scan(live) { _, _ -> } == snapshotHash) { "stale_screen" }
          val ok = if (action == "back") performGlobalAction(GLOBAL_ACTION_BACK) else {
            val node = find(live, id)
            try {
              check(node.refresh() && node.isVisibleToUser && node.isEnabled && !node.isPassword && signature(node) == nodes[id]) { "stale_target" }
              when (action) {
                "tap" -> { check(node.isClickable); node.performAction(AccessibilityNodeInfo.ACTION_CLICK) }
                "type" -> { check(node.isEditable); node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply {
                  putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
                }) }
                "scroll_forward" -> { check(node.isScrollable); node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) }
                else -> { check(node.isScrollable); node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) }
              }
            } finally { release(node) }
          }
          invalidate()
          if (ok) "action_dispatched_verify_screen" else "action_not_supported"
        } finally { release(live) }
      }
    } finally { release(root) }
  }

  fun launch(pkg: String, done: (String) -> Unit) {
    check(active && unlocked() && pkg in allowed) { "app_not_allowed_or_disabled" }
    val intent = packageManager.getLaunchIntentForPackage(pkg) ?: error("app_not_installed")
    approve("Open app: $pkg", done, pkg) {
      check(active && unlocked() && pkg in allowed) { "control_disabled" }
      invalidate(); startActivity(intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK))
      "app_opened_verify_screen"
    }
  }

  private fun params(gravity: Int) = WindowManager.LayoutParams(
    WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
    android.graphics.PixelFormat.TRANSLUCENT
  ).apply { this.gravity = gravity }

  private fun approve(message: String, done: (String) -> Unit, launchTarget: String? = null, execute: () -> String) {
    check(active && pending == null) { "control_disabled_or_busy" }
    pending = done
    effectDispatched = false
    val token = UUID.randomUUID().toString(); requestId = token
    val panel = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; setPadding(24, 20, 24, 20)
      setBackgroundColor(Color.rgb(25, 29, 40))
      addView(ScrollView(this@PhoneControlService).apply {
        addView(TextView(this@PhoneControlService).apply {
          text = "Gene · Review action\n\n$message"; textSize = 16f; setTextColor(Color.WHITE)
        })
      }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 350))
      addView(Button(this@PhoneControlService).apply { text = "Deny"; setOnClickListener { finish("denied") } })
      addView(Button(this@PhoneControlService).apply {
        text = "Allow once"; setOnClickListener {
          if (requestId != token || pending == null || !active) return@setOnClickListener
          // Remove the panel before querying the underlying app. Never reuse a
          // detached/stale node; revalidate package + full bounded tree.
          review?.let { try { wm.removeView(it) } catch (_: Exception) {} }; review = null
          val result = try { execute() } catch (_: Exception) { "stale_or_unavailable" }
          effectDispatched = result == "action_dispatched_verify_screen" || result == "app_opened_verify_screen"
          if (launchTarget != null && result == "app_opened_verify_screen") waitForApp(launchTarget, token, 20)
          else finish(result)
        }
      })
    }
    review = panel
    try {
      wm.addView(panel, params(Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply {
        width = resources.displayMetrics.widthPixels - 32
      })
      main.postDelayed(reviewTimeout, 60_000)
    } catch (e: Exception) { finish("review_unavailable"); throw e }
  }

  private fun waitForApp(pkg: String, token: String, attempts: Int) {
    if (requestId != token || pending == null) return
    if (!active || !unlocked()) { finish("stopped"); return }
    val ready = try {
      val root = foregroundRoot()
      try { root.refresh() && root.packageName?.toString() == pkg } finally { release(root) }
    } catch (_: Exception) { false }
    if (ready) { finish("app_opened_verify_screen"); return }
    if (attempts == 0) { finish("app_open_requested_verify_screen"); return }
    // Android transitions asynchronously; native polling continues while RN
    // timers are paused in the background. STOP invalidates the request token.
    main.postDelayed({ waitForApp(pkg, token, attempts - 1) }, 100)
  }

  private fun finish(result: String) {
    requestId = ""
    main.removeCallbacks(reviewTimeout)
    review?.let { try { wm.removeView(it) } catch (_: Exception) {} }; review = null
    val callback = pending; pending = null
    val receipt = if (effectDispatched && result != "app_opened_verify_screen" && result != "action_dispatched_verify_screen") "app_open_requested_verify_screen" else result
    effectDispatched = false
    callback?.invoke(JSONObject().put("status", receipt).toString())
  }
}
