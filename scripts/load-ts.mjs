// 让命令行脚本能直接加载 src/ 下的 TypeScript 模块。
//
// 为什么要这样：解析逻辑只有一份（src/services/eams/courseTableParser.ts），应用和命令行跑的是
// 同一份代码。如果为了脚本方便再抄一份 .mjs，两份实现迟早漂移 —— 而漂移出来的课表错误是最难
// 发现的那种（课表看着正常，但排在了错的日子）。
//
// 用 esbuild 把它打成临时 ESM 再 import。esbuild 已经是 vite 的依赖，不需要新增任何东西。

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

export async function loadTs(entryPath) {
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    logLevel: "silent"
  });

  const dir = mkdtempSync(join(tmpdir(), "eams-ts-"));
  const file = join(dir, "module.mjs");
  writeFileSync(file, result.outputFiles[0].text, "utf8");

  return import(pathToFileURL(file).href);
}
