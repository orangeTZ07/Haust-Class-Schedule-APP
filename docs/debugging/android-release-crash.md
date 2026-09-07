# Android Release 闪退排障手册

本文用于处理这类问题：debug APK 正常运行，但签名后的 release APK 安装后启动即闪退。适用于本项目的 Tauri 2 + Android 构建链路，也可作为类似 Android/Tauri 项目的排障模板。

## 核心原则

不要先猜代码。先建立一个可重复反馈环：

1. 安装 release APK。
2. 清空 logcat。
3. 启动 app。
4. 抓 logcat、进程状态、dropbox crash。
5. 改一个变量后重复验证。

只有这个闭环能稳定区分“修好了”和“只是这次没看到错误”。

## 标准反馈环

包名当前为 `com.coursemngr.courseapp`。

```bash
adb install -r path/to/release.apk
adb logcat -c
adb shell monkey -p com.coursemngr.courseapp -c android.intent.category.LAUNCHER 1
adb shell pidof com.coursemngr.courseapp
adb logcat -d -v threadtime
adb shell dumpsys dropbox --print data_app_native_crash
```

判断标准：

- `pidof` 有 PID，说明进程仍在。
- logcat 无 `FATAL EXCEPTION`、无 `AndroidRuntime` 崩溃栈、无 Rust panic/native abort。
- dropbox 最新 `data_app_native_crash` 时间没有新增本次启动后的条目。

## 这次事故的特征

普通 logcat 里不一定有 Java `FATAL EXCEPTION`。真正的证据在 dropbox：

```text
Process: com.coursemngr.courseapp
signal 6 (SIGABRT)
Abort message: 'called `Result::unwrap()` on an `Err` value: JavaException'
backtrace includes:
com.coursemngr.courseapp.WryActivity.onCreate
com.coursemngr.courseapp.MainActivity.onCreate
```

这个形态说明 Java 层异常发生在 Tauri/Wry Android 启动期间，然后被 Rust/JNI 边界包装成 `JavaException`，最终 `unwrap()` 触发 native abort。不要只看 Java 异常日志，因为它可能被 JNI 边界吞掉，最终只留下 native crash。

## 优先假设

按这个顺序排查：

1. Release R8/minify 破坏了 JNI、注解或反射路径。
2. Java/JDK 版本不兼容导致构建产物异常或构建失败。
3. release 与 debug 的 manifest、权限、WebView、插件初始化路径不同。
4. 签名或包名变更导致安装、数据迁移、权限状态异常。
5. 原生库 ABI 或打包路径错误。

本项目这次确认是第 1 项：release minify 开启后，Tauri Android 启动链路在 `WryActivity.onCreate` 崩溃。

## 本项目修复

Tauri 生成的 Android 工程位于 `src-tauri/gen/android/`，该目录被 `.gitignore` 忽略，不能直接把 `build.gradle.kts` 的改动当作长期修复。

长期修复是：

- `src-tauri/tauri.conf.json` 的 `beforeBuildCommand` 会运行 `scripts/patch-android-release-build.mjs`。
- `scripts/patch-android-release-build.mjs` 会把 `src-tauri/gen/android/app/build.gradle.kts` 里 release build type 的 `isMinifyEnabled` 改成 `false`。

构建前可手动确认：

```bash
node scripts/patch-android-release-build.mjs
rg -n 'getByName\("release"\)|isMinifyEnabled' src-tauri/gen/android/app/build.gradle.kts
```

release block 应该是：

```kotlin
getByName("release") {
    isMinifyEnabled = false
    proguardFiles(...)
}
```

## Java/JDK 注意事项

不要用 Java 26 构建本项目 Android 包。已见失败形态：

```text
A problem occurred configuring project ':buildSrc'.
> 26.0.2
Caused by: java.lang.IllegalArgumentException: 26.0.2
```

使用 Android Studio 自带 JBR 21：

```bash
JAVA_HOME=/opt/android-studio/jbr PATH=/opt/android-studio/jbr/bin:$PATH npx tauri android build --apk
```

如果只想快速验证连接的 arm64 手机：

```bash
JAVA_HOME=/opt/android-studio/jbr PATH=/opt/android-studio/jbr/bin:$PATH npx tauri android build --apk --target aarch64
```

## 签名与安装

release APK 默认可能是 unsigned：

```text
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

测试时可以用临时 keystore 签名：

```bash
keytool -genkeypair -v \
  -keystore /tmp/course_mngr_test.jks \
  -storepass android \
  -keypass android \
  -alias course-mngr-test \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=course-mngr-test, OU=Debug, O=Local, L=Shanghai, ST=Shanghai, C=CN"

/home/orgarchorg/Android/Sdk/build-tools/36.1.0/apksigner sign \
  --ks /tmp/course_mngr_test.jks \
  --ks-pass pass:android \
  --key-pass pass:android \
  --ks-key-alias course-mngr-test \
  --out /tmp/course-mngr-release-test.apk \
  src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

如果安装时报签名不一致：

```text
INSTALL_FAILED_UPDATE_INCOMPATIBLE
Existing package ... signatures do not match newer version
```

说明手机上已有同包名但不同签名的 app。测试机可卸载后重装：

```bash
adb uninstall com.coursemngr.courseapp
adb install /tmp/course-mngr-release-test.apk
```

注意：卸载会清掉该测试机上的 app 本地数据。正式发布必须使用正式 keystore，不要用临时测试 key。

## 如果关闭 minify 后仍闪退

继续用反馈环做二分，不要同时改多个变量：

1. 保持 `isMinifyEnabled = false`。
2. 临时把 Rust release 改成更易诊断：

```toml
[profile.release]
panic = "unwind"
strip = false
```

3. 重新构建、签名、安装、启动，重新抓 dropbox。
4. 如果仍是 `WryActivity.onCreate`，逐个禁用 Tauri 插件初始化，找出触发 JavaException 的插件。
5. 如果变成普通 `FATAL EXCEPTION`，优先修 Java/manifest/权限问题。

诊断结束后，如果不是必须保留符号，应恢复体积优化：

```toml
panic = "abort"
strip = true
```

## 结论模板

排障完成后记录这四项：

- 复现命令：安装、启动、抓日志的完整命令。
- 崩溃签名：关键 abort message 或 Java exception。
- 单变量验证：改了什么，启动结果如何。
- 固化位置：修复写在哪个可跟踪文件里，而不是只改了 `src-tauri/gen/`。

本次结论：

- 崩溃签名是 `Result::unwrap()` on `JavaException`，栈在 `WryActivity.onCreate`。
- 单变量验证为关闭 release minify 后 release APK 可启动。
- 固化位置为 `scripts/patch-android-release-build.mjs` 和 `src-tauri/tauri.conf.json`。
