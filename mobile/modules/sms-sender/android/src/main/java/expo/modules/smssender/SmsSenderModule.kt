package expo.modules.smssender

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Sends SMS silently (no system composer) straight from the app. This is the
 * only way to reach trusted contacts with no internet: SMS rides the cellular
 * network the device already has. Requires the restricted SEND_SMS permission.
 *
 * Each recipient is dispatched independently so one bad number cannot stop the
 * rest — an offline SOS must reach everyone it can.
 */
class SmsSenderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsSender")

    /** True when the device has a cellular radio that can send SMS. */
    Function("isSmsCapable") { isTelephonyCapable() }

    /** True when SEND_SMS has been granted at runtime. */
    Function("hasPermission") { isSmsGranted() }

    /**
     * Sends `message` to every address and resolves with a per-recipient
     * result. Never rejects for permission or capability problems — the caller
     * decides whether to fall back to the system composer.
     */
    AsyncFunction("send") { addresses: List<String>, message: String ->
      val granted = isSmsGranted()
      val manager = if (granted) resolveManager() else null

      addresses.map { address ->
        when {
          !granted -> smsResult(address, false, 0, "permission_denied")
          manager == null -> smsResult(address, false, 0, "no_sms_service")
          else -> try {
            val parts = manager.divideMessage(message)
            manager.sendMultipartTextMessage(address, null, parts, null, null)
            smsResult(address, true, parts.size, null)
          } catch (e: Exception) {
            smsResult(address, false, 0, e.message ?: e.javaClass.simpleName)
          }
        }
      }
    }
  }

  private fun contextOrNull(): Context? = appContext.reactContext

  private fun isSmsGranted(): Boolean {
    val context = contextOrNull() ?: return false
    return ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun isTelephonyCapable(): Boolean {
    val context = contextOrNull() ?: return false
    return context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)
  }

  private fun resolveManager(): SmsManager? {
    val context = contextOrNull() ?: return null
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(SmsManager::class.java)
      } else {
        @Suppress("DEPRECATION")
        SmsManager.getDefault()
      }
    } catch (e: Exception) {
      null
    }
  }

  private fun smsResult(
    address: String,
    ok: Boolean,
    parts: Int,
    error: String?,
  ): Map<String, Any?> =
    mapOf("address" to address, "ok" to ok, "parts" to parts, "error" to error)
}
