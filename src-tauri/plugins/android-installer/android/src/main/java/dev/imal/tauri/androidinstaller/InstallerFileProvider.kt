package dev.imal.tauri.androidinstaller

import androidx.core.content.FileProvider

/**
 * Distinct FileProvider subclass so this plugin's `<provider>` does not collide
 * with one the host app already declares. Android's manifest merger keys
 * providers by `android:name`, not by authority.
 */
class InstallerFileProvider : FileProvider()
