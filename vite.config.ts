import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // 不要监听 src-tauri。cargo 在编译时会不断往 target/ 里写文件，而 Vite 的监听器会撞上
    // 正在被写入的 .dll / .pdb，拿到 EBUSY 之后整个 dev server 直接退出：
    //
    //   errno: -4082, syscall: 'watch', code: 'EBUSY',
    //   path: '...\\src-tauri\\target\\debug\\deps\\phf_macros-....dll'
    //   Error The "beforeDevCommand" terminated with a non-zero status code.
    //
    // 于是 tauri dev 在「第一次构建」时必定失败 —— 因为那时 target/ 正被大量写入。
    // 这一行在 Tauri 官方的 create-tauri-app Vue 模板里本来就有，本仓库漏了。
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
