// swift-tools-version:5.5

import PackageDescription

// Structure copied from tauri-apps/plugins-workspace plugins/notification/ios/Package.swift. Three
// names here are not free to change:
//  - the library product must equal the Cargo package name: swift-rs links it as
//    `static=<CARGO_PKG_NAME>`;
//  - the `Tauri` dependency path is where tauri-plugin's build script copies the iOS API
//    (`<plugin>/.tauri/tauri-api`, next to this ios/ directory);
//  - `iOS(.v13)` has to stay at or below bundle.iOS.minimumSystemVersion in tauri.ios.conf.json.
let package = Package(
  name: "tauri-plugin-reminder",
  platforms: [
    .macOS(.v10_13),
    .iOS(.v13),
  ],
  products: [
    .library(
      name: "tauri-plugin-reminder",
      type: .static,
      targets: ["tauri-plugin-reminder"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-reminder",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
