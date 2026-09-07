import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const buildGradlePath = resolve(
  "src-tauri/gen/android/app/build.gradle.kts",
);

if (!existsSync(buildGradlePath)) {
  console.warn(
    `[android-release-patch] ${buildGradlePath} not found; run "npx tauri android init" before Android release builds.`,
  );
  process.exit(0);
}

const source = readFileSync(buildGradlePath, "utf8");
const releaseBlockMatch = source.match(/getByName\("release"\)\s*\{[\s\S]*?^\s*\}/m);

if (!releaseBlockMatch) {
  console.error(
    `[android-release-patch] Could not find the release block in ${buildGradlePath}.`,
  );
  process.exit(1);
}

const releaseBlock = releaseBlockMatch[0];

if (/isMinifyEnabled\s*=\s*false/.test(releaseBlock)) {
  console.log("[android-release-patch] Android release minify is already disabled.");
  process.exit(0);
}

const patched = source.replace(
  /(getByName\("release"\)\s*\{[\s\S]*?)isMinifyEnabled\s*=\s*true/,
  `$1// Tauri Android startup uses JNI/reflection paths that currently break when R8 minifies release builds.\n            isMinifyEnabled = false`,
);

if (patched === source) {
  console.error(
    `[android-release-patch] Could not find the release minify setting in ${buildGradlePath}.`,
  );
  process.exit(1);
}

writeFileSync(buildGradlePath, patched);
console.log("[android-release-patch] Disabled Android release minify.");
