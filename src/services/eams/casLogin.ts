// 教务系统的 CAS 统一身份认证 —— 登录流程本身。
//
// 这个文件刻意**不直接发请求**，而是把网络和密码加密都从外面注入进来。原因是可验证性：
//
//   * 应用里跑的时候，网络用官方的 http 插件、加密走一条 Rust 命令；
//   * 我在这里做测试的时候，注入一个假的网络层，就能**用真实抓下来的登录页**验证解析逻辑，
//     完全不需要你的密码、也不需要连上学校。
//
// 如果把这两件事焊死在这个文件里，那这段逻辑就只能等装到手机上才能验证 —— 而今天已经证明，
// 那种"先猜、装上去、发现不对、再猜"的循环代价很高。

export interface EamsResponse {
  status: number;
  /// 最终 URL（跟随跳转之后）。判断登录成功与否靠它。
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface EamsHttp {
  request(
    url: string,
    init?: { method?: string; body?: string; headers?: Record<string, string> }
  ): Promise<EamsResponse>;
}

export interface EamsDeps {
  http: EamsHttp;
  /// 把密码加密成 CAS 要求的 `__RSA__<base64>` 形式。
  /// 应用里由 Rust 用学校公钥做 PKCS#1 v1.5；测试里注入一个假实现。
  encryptPassword(password: string, publicKeyPem: string): Promise<string>;
}

export const CAS_URL = "https://cas.haust.edu.cn/cas/login";
export const CAS_PUBLIC_KEY_URL = "https://cas.haust.edu.cn/cas/jwt/publicKey";
/// CAS 登录成功后要跳回的统一门户。它同时是判断"成功"的锚点。
export const CAS_SERVICE = "https://i.haust.edu.cn/";

export interface CasLoginForm {
  action: string;
  /// **页面上实际存在的全部字段**，原样照搬。
  fields: Record<string, string>;
  /// 页面上出现过的所有 execution 取值（去重）。
  ///
  /// 真页面上三套登录方式用的是**同一个** execution（实测），所以取哪个都一样。但只要它们哪天
  /// 变得不同，取错就必然登录失败、而且失败原因会指向"密码错"这种误导方向 —— 所以把它记下来，
  /// 失败时如实告诉用户，而不是替它挑一个了事。
  executionCandidates: string[];
}

/// cookie 必须自己管。
///
/// Tauri 的 http 插件底层是 reqwest，默认**不保存 cookie** —— 而 CAS 登录恰恰依赖
/// JSESSIONID 在"取登录页 → 提交表单"之间保持同一个会话。不自己带，第二次请求就是另一个
/// 会话，服务端看不到 execution 对应的上下文，只会把你弹回登录页。
export class CookieJar {
  private readonly store = new Map<string, string>();

  absorb(response: EamsResponse): void {
    const raw = response.headers["set-cookie"] ?? response.headers["Set-Cookie"] ?? "";
    raw.split(/,(?=[^;]+=)/).forEach((piece) => {
      const pair = piece.split(";")[0].trim();
      const index = pair.indexOf("=");
      if (index > 0) this.store.set(pair.slice(0, index), pair.slice(index + 1));
    });
  }

  header(): string {
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

/// 从 CAS 登录页里读出**提交密码登录所需的字段**。
///
/// 刻意不写死字段名。这个页面被重写过：原来只是"学号 + 密码"两个框，现在是三套并存的登录方式
/// （drcom / 用户名密码 / 免密扫码），每套都有自己的 execution / _eventId / currentMenu。
///
/// 写死字段的代价今天已经付过一次：漏了 currentMenu，服务端不知道要用哪套登录方式，于是永远
/// 弹回登录页 —— 而报错只说"学号或密码不对"，让人反复去确认一个并没有写错的密码。
///
/// 但**按 <form> 切分也不可靠**：这个页面是 Vue 渲染的，三套表单的 <input> 平铺在同一层，
/// 并不各自包在自己的 <form> 里。实测按边界切会混出一组自相矛盾的字段 —— currentMenu=1（drcom 的）
/// 配 _eventId=submit（密码的）。那比漏字段更难发现。
///
/// 所以这里不猜结构：
///   1. 收齐页面上所有 input（同名取第一个非空值）；
///   2. **明确**把 _eventId 置为 submit、currentMenu 置为 2 —— 我们要的就是"用户名密码"那一套。
///      这两个值不是从页面读出来的，而是我们的选择，所以就该写死，并且写清为什么。
///
/// 多带字段发给服务端是无害的（不认识就忽略）；少带才会出问题。
export const PASSWORD_LOGIN_EVENT_ID = "submit";
export const PASSWORD_LOGIN_MENU = "2";

export const parseCasLoginForm = (html: string): CasLoginForm | null => {
  const fields: Record<string, string> = {};
  const executions: string[] = [];

  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = input[0];
    const name = (tag.match(/name=["']([^"']*)["']/i) || [, ""])[1];
    if (!name) continue;
    const value = (tag.match(/value=["']([^"']*)["']/i) || [, ""])[1];
    // 同名取第一个非空值。
    if (!(name in fields) || (!fields[name] && value)) fields[name] = value;
    if (name === "execution" && value) executions.push(value);
  }

  // 认不出这是登录页时不要硬凑一个表单出来。
  if (!("execution" in fields) || !("username" in fields)) return null;

  fields["_eventId"] = PASSWORD_LOGIN_EVENT_ID;
  fields["currentMenu"] = PASSWORD_LOGIN_MENU;
  // 验证码这一栏留空：如果学校确实要求验证码，那这次登录会被拒，并由 classifyLoginFailure
  // 明确告诉用户"需要验证码"，而不是含糊地说密码不对。
  if (!("captcha" in fields)) fields["captcha"] = "";

  const action = (html.match(/<form\b[^>]*action=["']([^"']*)["']/i) || [, ""])[1];
  return { action, fields, executionCandidates: [...new Set(executions)] };
};

/// 读出学校的 RSA 公钥。
export const fetchPublicKey = async (deps: EamsDeps, jar: CookieJar): Promise<string> => {
  const response = await deps.http.request(CAS_PUBLIC_KEY_URL);
  jar.absorb(response);
  const key = response.body.trim();
  if (!key) throw new Error("学校没有返回 RSA 公钥（CAS 公钥地址返回空）");
  return key;
};

export interface LoginResult {
  ok: boolean;
  /// 失败时给用户看的一句话 —— 必须能区分原因，否则等于没报错。
  reason?: string;
  /// 失败时附上服务端的原文，便于继续追。
  detail?: string;
}

/// 失败原因的归类。
///
/// **这是这个文件里最值钱的一段。** 今天那次失败，脚本把所有情况都说成"学号或密码不对"，
/// 而真实原因是缺字段 + 验证码，全被这句错误的话带偏了。分类清楚，问题就能一次定位。
export const classifyLoginFailure = (html: string, finalUrl: string): LoginResult => {
  const text = html.replace(/\s+/g, " ");

  const firstMatch = (patterns: Array<[RegExp, string]>): string => {
    for (const [re, label] of patterns) {
      if (re.test(text)) return label;
    }
    return "";
  };

  const captcha = firstMatch([
    [/__captchaImgUrl\s*=\s*["']?(?!["';])\S/, "页面要求输入验证码"],
    [/验证码错误|请输入验证码/, "页面提示验证码错误"]
  ]);
  if (captcha) {
    return {
      ok: false,
      reason: "学校要求验证码，脚本无法自动通过。请先在浏览器里成功登录一次，再回来重试。",
      detail: captcha
    };
  }

  const locked = firstMatch([
    [/账号.{0,6}锁定|账户.{0,6}锁定/, "页面提示账号被锁定"],
    [/失败次数过多|尝试次数过多/, "页面提示尝试次数过多"]
  ]);
  if (locked) {
    return {
      ok: false,
      reason: "登录失败次数过多，账号可能被暂时锁定。请先在浏览器里登录一次。",
      detail: locked
    };
  }

  const badCredential = firstMatch([
    [/用户名或密码(?:错误|不正确)/, "页面提示用户名或密码错误"],
    [/密码(?:错误|不正确)/, "页面提示密码错误"],
    [/账号或密码(?:错误|不正确)/, "页面提示账号或密码错误"]
  ]);
  if (badCredential) {
    return { ok: false, reason: "学号或密码不对（学校明确这么提示的）。", detail: badCredential };
  }

  // 没有可识别的提示。这种情况必须老实说"不知道"，而不是挑一个可能性最大的说法 ——
  // 猜一个原因比不猜更糟，因为它会把排查引到错误的方向。
  const snippet = text.slice(0, 300);
  return {
    ok: false,
    reason: `登录被拒绝，但学校没有给出可识别的原因（仍停在 ${finalUrl}）。`,
    detail: snippet
  };
};

/// 完整的 CAS 登录。成功返回 true，失败返回可读的原因。
export const casLogin = async (
  deps: EamsDeps,
  jar: CookieJar,
  username: string,
  password: string
): Promise<LoginResult> => {
  const loginUrl = `${CAS_URL}?service=${encodeURIComponent(CAS_SERVICE)}`;

  const page = await deps.http.request(loginUrl, { headers: { Cookie: jar.header() } });
  jar.absorb(page);

  const form = parseCasLoginForm(page.body);
  if (!form) {
    return {
      ok: false,
      reason: "登录页里找不到用户名密码表单，页面结构可能又变了。",
      detail: page.body.slice(0, 300)
    };
  }

  const publicKey = await fetchPublicKey(deps, jar);
  const encrypted = await deps.encryptPassword(password, publicKey);

  // 页面上读到的字段全部照搬，只覆盖这两个 —— 这样学校加字段不会漏。
  const body = new URLSearchParams({ ...form.fields, username, password: encrypted }).toString();

  const result = await deps.http.request(loginUrl, {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header()
    }
  });
  jar.absorb(result);

  // 成功与否看最终落在哪：回到统一门户即为成功；仍在 cas/login 即失败。
  const landedOnPortal = result.url.includes("i.haust.edu.cn") && !/cas\/login/i.test(result.url);
  if (landedOnPortal) return { ok: true };

  const failure = classifyLoginFailure(result.body, result.url);
  // 如果页面上原本就有多个不同的 execution，那么"取错 token"也是失败的一种可能，
  // 必须说出来 —— 否则用户会去反复确认一个没写错的密码。
  if (form.executionCandidates.length > 1) {
    failure.detail = `${failure.detail ?? ""}\n页面里有 ${form.executionCandidates.length} 个不同的 execution，登录可能取错了那一个。`;
  }
  return failure;
};
