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

/// 伪装成浏览器。
///
/// **这是实测逼出来的，不是洁癖。** 同一个地址：手机浏览器打开正常（200），而 app 用 Rust 客户端
/// 请求拿到的是 **403 且正文为空**。空正文的 403 不是 Java 应用会给出的回复（它拒绝时会返回自己的
/// 错误页），那是网关/防火墙在按客户端指纹拒绝。
///
/// 所以这里补齐浏览器会发的头。注意 `User-Agent` 属于 fetch 规范的「禁止的请求头」，插件默认会
/// **静默丢弃** —— 因此 Cargo 里同时打开了 `unsafe-headers` 特性，否则这两行代码等于没写。
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

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
        // 调用方指定的头优先。`Origin: ""` 是**有意为之**：插件源码里写明
        // "In case empty origin is passed, remove it"（需 unsafe-headers 特性，已开启）——
        // 因为浏览器直接打开页面时根本不发 Origin，而插件默认会补一个。
        headers: { ...BROWSER_HEADERS, ...(init?.headers ?? {}) } as Record<string, string>,
        // 跳转交给调用方决定：不传就跟随（正常流程），传 0 就自己逐跳走（诊断）。
        ...(init?.maxRedirections === undefined ? {} : { maxRedirections: init.maxRedirections }),
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
