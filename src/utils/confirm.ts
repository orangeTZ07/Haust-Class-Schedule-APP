import { showConfirmDialog } from "vant";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /// The action throws data away: the confirm button is drawn in the danger colour.
  danger?: boolean;
}

/// Themed replacement for the browser's `confirm()`.
///
/// The native box ignores the theme, cannot be styled, and on the Android webview looks like it
/// belongs to a different app. Resolves true on 确定 and false on 取消 / back / tap outside, so call
/// sites read like the `if (!confirm(...)) return` they replace.
export async function confirmAction(options: ConfirmOptions): Promise<boolean> {
  try {
    await showConfirmDialog({
      title: options.title,
      message: options.message,
      confirmButtonText: options.confirmText ?? "确定",
      cancelButtonText: options.cancelText ?? "取消",
      className: options.danger ? "theme-confirm-dialog is-danger" : "theme-confirm-dialog",
    });
    return true;
  } catch {
    // Vant rejects the promise on cancel.
    return false;
  }
}
