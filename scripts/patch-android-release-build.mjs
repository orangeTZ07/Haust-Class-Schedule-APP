import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Tauri's Android startup path goes through JNI/reflection that R8 breaks, so a release build
// with minification on installs and then native-aborts in WryActivity.onCreate. This script
// turns minification off in the generated Gradle project before the build.
//
// Every way it can fail to do that job is a hard error. An earlier revision printed a warning
// and exited 0 when the generated file was missing, which reported success while leaving
// minify enabled -- producing exactly the APK this script exists to prevent, with nothing in
// the log to suggest it. Failing here is strictly better: a red build is cheaper than a
// release that crashes on launch.

const buildGradlePath = resolve("src-tauri/gen/android/app/build.gradle.kts");

if (!existsSync(buildGradlePath)) {
  console.error(
    `[android-release-patch] FATAL: ${buildGradlePath} does not exist, so release minification\n` +
    `  cannot be disabled and the resulting APK would abort on launch.\n` +
    `  Run "npx tauri android init" before an Android release build.`,
  );
  process.exit(1);
}

const source = readFileSync(buildGradlePath, "utf8");
const releaseBlockMatch = source.match(/getByName\("release"\)\s*\{[\s\S]*?^\s*\}/m);

if (!releaseBlockMatch) {
  console.error(
    `[android-release-patch] FATAL: no release block found in ${buildGradlePath}.\n` +
    `  The generated project has changed shape; update this script rather than skipping it.`,
  );
  process.exit(1);
}

if (/isMinifyEnabled\s*=\s*false/.test(releaseBlockMatch[0])) {
  console.log("[android-release-patch] Android release minify is already disabled.");
  process.exit(0);
}

const patched = source.replace(
  /(getByName\("release"\)\s*\{[\s\S]*?)isMinifyEnabled\s*=\s*true/,
  `$1// Tauri Android startup uses JNI/reflection paths that currently break when R8 minifies release builds.\n            isMinifyEnabled = false`,
);

if (patched === source) {
  console.error(
    `[android-release-patch] FATAL: cannot find the release minify setting in ${buildGradlePath}.\n` +
    `  Expected "isMinifyEnabled = true" inside the release block and did not find it.`,
  );
  process.exit(1);
}

// Confirm against the patched text before writing anything, so a regex that matched the wrong
// block cannot half-apply and leave a build that still minifies.
const verifyMatch = patched.match(/getByName\("release"\)\s*\{[\s\S]*?^\s*\}/m);
if (!verifyMatch || /isMinifyEnabled\s*=\s*true/.test(verifyMatch[0])) {
  console.error(
    `[android-release-patch] FATAL: the release block still enables minification after patching.\n` +
    `  Refusing to write a build config that would produce a crashing release APK.`,
  );
  process.exit(1);
}

writeFileSync(buildGradlePath, patched);
console.log("[android-release-patch] Disabled Android release minify.");
