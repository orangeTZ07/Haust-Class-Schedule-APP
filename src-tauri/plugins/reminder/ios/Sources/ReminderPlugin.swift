import Foundation
import Tauri
import UserNotifications

/// Arguments for setReminder. The keys are the camelCase names the Rust side serialises
/// (SetReminderArgs is `rename_all = "camelCase"`), so the property names here are the wire format.
struct SetReminderArgs: Decodable {
  let courseScheduleId: Int64
  /// Epoch milliseconds, the same unit the Android side takes.
  let triggerAt: Int64
  let title: String?
  let body: String?
}

struct CancelReminderArgs: Decodable {
  let courseScheduleId: Int64
}

struct BatteryStatus: Encodable {
  let isIgnoring: Bool
}

/// Prefix of every request identifier this plugin creates. It is also how the delegate below tells
/// our notifications apart from anyone else's.
private let identifierPrefix = "course-reminder-"

private func identifier(for courseScheduleId: Int64) -> String {
  return "\(identifierPrefix)\(courseScheduleId)"
}

/// Shows our reminders while the app is in the foreground and keeps other notifications working.
///
/// UNUserNotificationCenter has exactly one delegate, and tauri-plugin-notification (which this app
/// also loads) installs its own. That delegate cannot be left in charge of our notifications:
/// NotificationHandler.toActiveNotification force-unwraps `notificationsMap[identifier]!`, and the
/// map only holds notifications that plugin itself sent during this run. Any other notification
/// that is presented in the foreground or tapped -- ours included -- traps the app.
///
/// So this delegate answers for requests carrying our prefix and forwards everything else to
/// whichever delegate was installed before it.
final class ReminderNotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
  private let lock = NSLock()
  private var previous: UNUserNotificationCenterDelegate?

  /// Puts this object in as the center's delegate, remembering the one it replaces. Safe to call
  /// repeatedly: it is called again on every setReminder because plugin load order decides who
  /// installs last, and a delegate installed by a plugin that loads after ours would otherwise
  /// silently take our notifications back.
  func install() {
    let center = UNUserNotificationCenter.current()
    lock.lock()
    defer { lock.unlock() }
    if center.delegate !== self {
      previous = center.delegate
      center.delegate = self
    }
  }

  private func forwardTarget() -> UNUserNotificationCenterDelegate? {
    lock.lock()
    defer { lock.unlock() }
    return previous
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    if notification.request.identifier.hasPrefix(identifierPrefix) {
      // A class reminder is only useful if it is seen, foreground or not.
      var options: UNNotificationPresentationOptions = [.sound]
      if #available(iOS 14.0, *) {
        options.formUnion([.banner, .list])
      } else {
        options.formUnion(.alert)
      }
      completionHandler(options)
      return
    }

    if let target = forwardTarget(),
      target.responds(
        to: #selector(
          UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:)
        ))
    {
      target.userNotificationCenter?(
        center, willPresent: notification, withCompletionHandler: completionHandler)
    } else {
      completionHandler([])
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    // Tapping our notification just opens the app, which the system already does.
    if response.notification.request.identifier.hasPrefix(identifierPrefix) {
      completionHandler()
      return
    }

    if let target = forwardTarget(),
      target.responds(
        to: #selector(
          UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:)
        ))
    {
      target.userNotificationCenter?(
        center, didReceive: response, withCompletionHandler: completionHandler)
    } else {
      completionHandler()
    }
  }
}

/// Commands are dispatched by name: Rust's run_mobile_plugin("setReminder", ...) becomes the
/// selector `setReminder:error:` for a throwing method (see PluginManager.invoke in the Tauri iOS
/// API), so the method names here are the same camelCase ones ReminderPlugin.kt uses.
class ReminderPlugin: Plugin {
  private let notificationDelegate = ReminderNotificationDelegate()

  override init() {
    super.init()
    notificationDelegate.install()
  }

  @objc public func setReminder(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetReminderArgs.self)

    let fireDate = Date(timeIntervalSince1970: TimeInterval(args.triggerAt) / 1000)
    let interval = fireDate.timeIntervalSinceNow
    // UNTimeIntervalNotificationTrigger raises an exception for an interval of zero or less, so a
    // moment that has already passed has to be turned away before it gets that far.
    guard interval > 1 else {
      invoke.reject("提醒时间已经过去了")
      return
    }

    let content = UNMutableNotificationContent()
    content.title = args.title ?? "课程提醒"
    content.body = args.body ?? "即将上课"
    content.sound = .default
    content.threadIdentifier = "course-reminder"

    // A time interval from now rather than calendar components: it names one absolute moment, the
    // same as the epoch value Android takes, and it is what the official notification plugin uses
    // for Schedule.at (handleScheduledNotification in plugins/notification/ios/Sources).
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
    let request = UNNotificationRequest(
      identifier: identifier(for: args.courseScheduleId), content: content, trigger: trigger)

    notificationDelegate.install()

    // A request whose identifier is already pending replaces it, which is the same "one alarm per
    // schedule" behaviour the Android side gets from its PendingIntent request code.
    UNUserNotificationCenter.current().add(request) { error in
      if let error = error {
        invoke.reject(error.localizedDescription)
      } else {
        invoke.resolve()
      }
    }
  }

  @objc public func cancelReminder(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(CancelReminderArgs.self)
    // Pending only, like AlarmManager.cancel: a reminder that already fired stays in the
    // notification center until the user clears it.
    UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [
      identifier(for: args.courseScheduleId)
    ])
    invoke.resolve()
  }

  /// iOS has no per-app battery optimisation to opt out of. Answering "already exempt" is what
  /// keeps the settings page from showing its whitelist hint.
  @objc public func checkBatteryOptimization(_ invoke: Invoke) {
    invoke.resolve(BatteryStatus(isIgnoring: true))
  }

  @objc public func openBatterySettings(_ invoke: Invoke) {
    invoke.reject("iOS 没有电池优化白名单，无需设置")
  }
}

@_cdecl("init_plugin_reminder")
func initPlugin() -> Plugin {
  return ReminderPlugin()
}
