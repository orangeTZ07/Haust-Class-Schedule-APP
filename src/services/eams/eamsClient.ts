// 从教务系统把课表整个取回来：CAS 登录 → SSO → 取请求参数 → 拉课表 → 解析成可导入的备份。
//
// 这个文件不直接发请求、也不直接加密 —— 两件事都从 `EamsDeps` 注入进来。原因是可验证性：
// 本地测试时注入"回放真实抓下来的响应"的假网络，就能把**整条链路**跑一遍并断言结果，
// 不需要学校、不需要你的密码、不需要手机。
//
// 而这条链路上每一环的坑，今天都踩过一次：
//   * 连不上（没开 aTrust）被误报成密码错  → 所以第一步先单独探连通性，给出的提示完全不同
//   * 漏了 currentMenu 导致永远弹回登录页  → 登录部分在 casLogin 里已按页面字段动态取
//   * semester.id 写死会换回一个没有线索的 500 → 所以三个参数一律从课表页现场解析
//   * 报错只说"密码不对"把排查带偏        → 所以每一类失败都单独归类
import {
  CookieJar,
  casLogin,
  formatTrace,
  pageTitle,
  type EamsDeps,
  type EamsHttp,
  type TraceEntry
} from "./casLogin";
import { extractCoursePageParams, parseCourseTable, rowsToBackup, type Backup, type ConvertReport } from "./courseTableParser";

/// 教务系统主机。实测这个「旧」域名才是活的 EAMS；学校通知里说的新域名只暴露 aTrust 网关。
export const JWC_HOST = "jwgl.haust.edu.cn";
const JWC_BASE = `https://${JWC_HOST}/eams`;

export type SyncFailureKind =
  | "unreachable"
  | "login"
  | "session"
  | "params"
  | "course-table"
  | "empty"
  | "unknown";

export interface SyncSuccess {
  ok: true;
  backup: Backup;
  report: ConvertReport;
}

export interface SyncFailure {
  ok: false;
  kind: SyncFailureKind;
  /// 给用户看的一句话，必须说清是哪一类问题。
  message: string;
  detail?: string;
}

export type SyncResult = SyncSuccess | SyncFailure;

/// 先单独探一次连通性。
///
/// 这一步存在的唯一理由：**"连不上"和"密码错"必须给出不同的提示**。否则用户会像今天那样，
/// 拿着一个正确密码反复确认半天，而真正的问题只是 aTrust 没连上。
export const probeReachability = async (http: EamsHttp): Promise<{ ok: true } | SyncFailure> => {
  try {
    // **不跟随跳转**，把每一跳单独看清楚。
    //
    // 为什么：真服务器对 /eams/login.action 返回 302 跳到 /eams/loginExt.action;jsessionid=...，
    // 而 app 拿到的是 403 且正文为空。浏览器和微信走同一条路却是 200 —— 所以嫌疑落在"跟随跳转"
    // 这一步上：要么跳转后的地址被拒，要么跳转过程中丢了东西。
    //
    // 与其猜，不如把跳转关掉，把每一跳的状态码和 Location 都摆出来。这样"谁拒的、在哪一跳拒的"
    // 就是明摆的事实，不需要再推理。
    const first = await http.request(`${JWC_BASE}/login.action`, { redirect: "manual" });

    const lines = [
      `第 1 跳：HTTP ${first.status}  ${JWC_BASE}/login.action`,
      `  标题「${pageTitle(first.body)}」`,
      first.headers.location ? `  Location → ${first.headers.location}` : "  （没有 Location，说明没有跳转）"
    ];

    // 拿不到 2xx/3xx 才算真失败；3xx 说明服务器愿意继续，是好事。
    if (first.status >= 400) {
      const snippet = first.body.replace(/\s+/g, " ").trim().slice(0, 200);
      lines.push(`  正文开头 → ${snippet || "(空)"}`);
      lines.push(`  Set-Cookie → ${first.headers["set-cookie"] ? "有" : "没有"}`);
      return {
        ok: false,
        kind: "unreachable",
        message:
          `教务系统的登录页直接返回了 HTTP ${first.status}（没有跳转、正文为空）——` +
          `而手机浏览器和微信打开同一个地址都是正常的。请把下面的诊断发我。`,
        detail: lines.join("\n")
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      kind: "unreachable",
      message: `连不上教务系统（${JWC_HOST}）。请先打开手机上的 aTrust 并连接，或连到校园网后重试。`,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
};

/// 完整同步。deps 由调用方决定用真实网络还是回放。
export const fetchTimetable = async (
  deps: EamsDeps,
  username: string,
  password: string
): Promise<SyncResult> => {
  const reachable = await probeReachability(deps.http);
  if (!reachable.ok) return reachable;

  const jar = new CookieJar();

  // 每一步的地址、状态码、标题都记下来，失败时附在诊断里。
  // 加它的原因：第一版只报告正文片段，于是"这个页面到底是从哪来的"完全看不出来 —— 直到用户
  // 截图里偶然出现标题「河南科技大学」，才发现请求拿到的根本不是 CAS 登录页，而是学校门户。
  const trace: TraceEntry[] = [];
  /// 非 2xx 时把正文开头也记下来 —— 403 的正文会说明是谁拒的（aTrust 还是教务系统）。
  const snippetOf = (body: string, status: number) =>
    status >= 400 ? body.replace(/\s+/g, " ").trim().slice(0, 160) : undefined;
  const withTrace = (failure: SyncFailure): SyncFailure => ({
    ...failure,
    detail: [failure.detail, formatTrace(trace)].filter(Boolean).join("\n\n")
  });

  // ---- 1. CAS 登录 ----
  const login = await casLogin(deps, jar, username, password, trace);
  if (!login.ok) {
    return withTrace({
      ok: false,
      kind: "login",
      message: login.reason ?? "登录失败",
      detail: login.detail
    });
  }

  // 不手动传 Cookie 头：Tauri 的 http 插件按 fetch 规范把它列为「禁止的请求头」并静默丢弃，
  // 写了也是无用功。会话由插件的 cookie 罐（Cargo 默认特性 cookies）维持。

  // ---- 2. SSO 进教务系统 ----
  const ssoUrl = `${JWC_BASE}/sso/login.action`;
  const sso = await deps.http.request(ssoUrl);
  jar.absorb(sso);
  trace.push({ step: "SSO 进教务系统", url: ssoUrl, status: sso.status, finalUrl: sso.url, title: pageTitle(sso.body), snippet: snippetOf(sso.body, sso.status) });
  // **这一步失败不再中止整个流程。**
  //
  // 实测：浏览器能正常打开教务系统，但 app 直接请求 sso/login.action 会拿到 403 且没有跳转。
  // 而这一步本来就不是必需的 —— 浏览器并不"访问"它，浏览器是直接打开课表页的。我当初把它写死
  // 成必经步骤，是照着 Python 脚本抄的，而 Python 能过只是因为它恰好带了别的上下文。
  //
  // 所以这里改成：403 记下来、继续往下走，让课表页自己去判断。真正决定成败的是课表页 ——
  // 如果它也拿不到，失败信息里会同时包含这一步和下一步，两边的状态都看得见。
  if (sso.status >= 400) {
    trace.push({
      step: "SSO 返回非 2xx，按非必需步骤处理，继续尝试课表页",
      url: ssoUrl,
      status: sso.status,
      finalUrl: sso.url,
      title: ""
    });
  }

  // ---- 3. 取课表页，并从页面里解析出请求参数 ----
  const coursePageUrl = `${JWC_BASE}/courseTableForStd.action`;
  const coursePage = await deps.http.request(coursePageUrl);
  jar.absorb(coursePage);
  trace.push({
    step: "取课表页",
    url: coursePageUrl,
    status: coursePage.status,
    finalUrl: coursePage.url,
    title: pageTitle(coursePage.body)
  });

  const params = extractCoursePageParams(coursePage.body);
  if (!params) {
    // 不拿空值硬发请求 —— 那只会换回一个看不懂的 500（今天已经这样绕过一圈）。
    return withTrace({
      ok: false,
      kind: "params",
      message: "课表页面里找不到必要的请求参数（可能拿到的是登录页或别的页面）。",
      detail: `页面标题「${pageTitle(coursePage.body)}」，长度 ${coursePage.body.length}`
    });
  }

  // ---- 4. 拉课表 ----
  const body = new URLSearchParams({
    ignoreHead: "1",
    "setting.kind": "std",
    startWeek: "",
    "project.id": params.projectId,
    "semester.id": params.semesterId,
    ids: params.ids
  }).toString();

  const tableUrl = `${JWC_BASE}/courseTableForStd!courseTable.action`;
  const table = await deps.http.request(tableUrl, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  jar.absorb(table);
  trace.push({
    step: "拉取课表",
    url: tableUrl,
    status: table.status,
    finalUrl: table.url,
    title: pageTitle(table.body)
  });

  if (table.status >= 400) {
    return withTrace({
      ok: false,
      kind: "course-table",
      message: `教务系统返回 HTTP ${table.status}，没能取到课表。`,
      detail: table.body.slice(0, 400)
    });
  }

  // ---- 5. 解析 ----
  const { rows, problems } = parseCourseTable(table.body);
  if (!rows.length) {
    return withTrace({
      ok: false,
      kind: "empty",
      message: "课表是空的 —— 可能这个学期的课还没排，或者拿到的不是课表页面。",
      detail: problems.join("；") || `页面标题「${pageTitle(table.body)}」，长度 ${table.body.length}`
    });
  }

  const { backup, report } = rowsToBackup(rows);
  return { ok: true, backup, report };
};
