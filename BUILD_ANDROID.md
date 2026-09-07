# Android 构建说明

本项目使用 Tauri 2.0 进行跨平台开发，构建 Android 应用需要配置好 Android 开发环境（SDK, NDK, Rust target 等）。

## 环境要求
1. **Rust**: 已安装并添加了 Android 目标 (例如 `aarch64-linux-android`)。
2. **Android SDK & NDK**: 建议通过 Android Studio 安装。
3. **Java (JDK)**: 推荐使用 Android Studio 自带的 JBR 21。不要使用 Java 26，当前 Kotlin/Gradle 会因版本字符串 `26.0.2` 配置失败。
4. **Tauri CLI**: 已通过 `npm install -D @tauri-apps/cli` 安装。

## 构建步骤

### 1. 检查环境变量
确保以下路径正确（在当前环境中已自动识别）：
- `ANDROID_HOME`: Android SDK 路径
- `NDK_HOME`: NDK 路径

### 2. 执行构建命令
在项目根目录下运行以下命令以构建生产模式（Release）的 APK：

```bash
npx tauri android build
```

如果系统默认 Java 不是 Android Studio JBR，可以显式指定：

```bash
JAVA_HOME=/opt/android-studio/jbr PATH=/opt/android-studio/jbr/bin:$PATH npx tauri android build --apk
```

构建时会自动运行 `scripts/patch-android-release-build.mjs`，禁用生成工程中的 Android release minify。当前 Tauri Android 启动链路依赖 JNI/反射，开启 R8 minify 会导致签名 release 包在 `WryActivity.onCreate` 阶段触发 `JavaException` 并 native abort。

### 3. 构建产物位置
构建成功后，生成的 APK 文件通常位于：
`src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk`
(注：根据配置不同，文件名和路径可能略有差异)。

## 常见问题
- **TypeScript 错误**: 构建前会自动运行 `npm run build` (vite build)，如果代码中有 TS 错误会导致构建失败。
- **证书签名**: 默认生成的 APK 是未签名的 (`unsigned`)，如需发布到应用市场，需进行签名配置。
- **Release 安装后闪退**: 先确认 `beforeBuildCommand` 已执行 `scripts/patch-android-release-build.mjs`。若 `src-tauri/gen/android/app/build.gradle.kts` 中 release 的 `isMinifyEnabled` 又变回 `true`，重新运行构建命令让脚本修正。
