// 把 Tauri 的 http 插件适配成登录流程需要的形状。
//
// 这个文件是**唯一**知道 Tauri 存在的地方 —— 其余逻辑只认一个 `EamsHttp` 接口，
// 所以它们能在本地用"回放真实响应"的方式测试，不需要手机、不需要学校。
//
// 关于 cookie：浏览器的 fetch 禁止 JS 读取 Set-Cookie，但 Tauri 的请求发生在 Rust 侧，
// 响应头是原样传回来的，所以这里能读到。CAS 登录要求会话在"取登录页 → 提交表单"之间保持，
// 而插件本身不维护 cookie 存储，所以由调用方（casLogin 里的 CookieJar）显式带着。
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import type { EamsHttp, EamsResponse } from "./casLogin";

/// 请求超时。教务系统在校外走 aTrust 隧道，慢是常态，但也不能无限等。
const TIMEOUT_MS = 30000;

const headersToObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    // 多个同名头（典型是 Set-Cookie）会被 Headers 用 ", " 合并。CookieJar 能处理这种形态，
    // 所以这里原样收集即可，不要丢掉。
    out[key.toLowerCase()] = out[key.toLowerCase()] ? `${out[key.toLowerCase()]}, ${value}` : value;
  });
  return out;
};

export const createTauriHttp = (): EamsHttp => ({
  request: async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await tauriFetch(url, {
        method: init?.method ?? "GET",
        body: init?.body,
        headers: init?.headers,
        // 手动跟随跳转，好在成功判断里拿到最终 URL；这里保持自动跟随但把 URL 读回来。
        redirect: "follow",
        signal: controller.signal
      });

      const body = await response.text();
      return {
        status: response.status,
        url: response.url || url,
        headers: headersToObject(response.headers),
        body
      } satisfies EamsResponse;
    } catch (error) {
      // 把"连不上"和"服务器拒绝"分开 —— 前者要提示用户开 aTrust，后者是另一回事。
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`无法连接 ${new URL(url).host}：${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
});
