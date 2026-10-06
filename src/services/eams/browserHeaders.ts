// 发请求时带的头。**单独成文件是为了可测试** —— tauriHttp.ts 引用了 Tauri 插件，在 Node 里加载
// 不了，把常量放在那里就等于"改错了也没人拦"。
//
// 这里的每一项都是被实测逼出来的，不是照抄浏览器：
//
// 1. `Origin: ""` —— **本次问题的根因，有设备实测数据**。
//    Tauri 的 http 插件默认会自动补一个 Origin（内容是 webview 的 origin），而浏览器直接打开一个
//    地址时**根本不发这个头**。教务系统前面的网关据此拒绝，返回的是**空正文的 403**。
//    实测（同一台手机、同一网络、逐跳记录）：
//        · 带 Origin      → 第 1 跳 HTTP 403
//        · 不发 Origin    → 第 1 跳 302 → 第 2 跳 200（拿到「河南科技大学教学管理系统」）
//    插件源码里写明用法："In case empty origin is passed, remove it" —— 需要 unsafe-headers
//    特性（已在 Cargo.toml 打开），否则这个空串会被当成"什么都没有"而补回默认值。
//
// 2. `User-Agent` —— fetch 规范里的「禁止的请求头」，插件默认**静默丢弃**。
//    同样需要 unsafe-headers 才发得出去。
//
// **不要加 `Accept-Encoding`。** 我试过：加了 gzip/deflate/br 之后拿回来的是压缩后的二进制，
// 而插件不会替你解压，正文直接变成乱码。既然 B 方案（只移除 Origin）已经能通，就不要引入这个。
export const BROWSER_HEADERS: Record<string, string> = {
  // 让插件移除 Origin：空串是插件约定的"删掉这个头"的写法。
  Origin: "",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};
