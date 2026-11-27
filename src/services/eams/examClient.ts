import { casLogin, CookieJar, type EamsDeps } from "./casLogin";
import { JWC_HOST, probeReachability, type SyncFailure } from "./eamsClient";
import { isExamLandingPage, parseExamTable, type ExamSnapshot } from "./examParser";

const EAMS = `https://${JWC_HOST}/eams`;
const EXAM_PAGE = `${EAMS}/stdExamTable.action`;

export type ExamSyncResult = { ok: true; snapshot: ExamSnapshot } | SyncFailure;

export interface FetchExamsOptions {
  /// 教务同步先取课表、紧接着取考试安排：课表那一步已经确认过连得上，这里不必再探一次。
  skipReachabilityProbe?: boolean;
}

export const fetchExams = async (
  deps: EamsDeps,
  username: string,
  password: string,
  options: FetchExamsOptions = {}
): Promise<ExamSyncResult> => {
  if (!options.skipReachabilityProbe) {
    const reachable = await probeReachability(deps.http);
    if (!reachable.ok) return reachable;
  }

  // The http plugin keeps the school session in its own cookie store, so CAS may go straight to the
  // portal without a form. Credentials are only needed once CAS asks for an encrypted password.
  const missingCredentials = new Error("请输入学号和密码。");
  try {
    const login = await casLogin({
      ...deps,
      encryptPassword: async (secret, key) => {
        if (!username || !password) throw missingCredentials;
        const encrypted = await deps.encryptPassword(secret, key);
        if (!encrypted) throw new Error("登录密码加密失败，请重试。");
        return encrypted;
      }
    }, new CookieJar(), username, password);
    if (!login.ok) {
      return {
        ok: false,
        kind: "login",
        message: login.reason ?? "登录失败。",
        detail: login.detail,
        wrongCredentials: login.wrongCredentials
      };
    }
  } catch (error) {
    if (error === missingCredentials) return { ok: false, kind: "login", message: missingCredentials.message };
    throw error;
  }

  await deps.http.request(`${EAMS}/sso/login.action`);
  const page = await deps.http.request(EXAM_PAGE, { headers: { Referer: `${EAMS}/homeExt.action` } });
  if (page.status >= 400 || !isExamLandingPage(page.body)) {
    return { ok: false, kind: "session", message: `无法打开考试安排页面（HTTP ${page.status}）。` };
  }

  // Opening “我的考试” selects the current semester in EAMS. The page then loads its
  // scheduled-exam table with this separate XHR in the same session.
  const response = await deps.http.request(`${EAMS}/stdExamTable!examTable.action?_=${Date.now()}`, {
    headers: { Referer: EXAM_PAGE, "X-Requested-With": "XMLHttpRequest" }
  });
  if (response.status >= 400) return { ok: false, kind: "unknown", message: `获取考试安排失败（HTTP ${response.status}）。` };
  const exams = parseExamTable(response.body);
  if (!exams) return { ok: false, kind: "unknown", message: "无法识别考试安排页面。" };

  return { ok: true, snapshot: { syncedAt: new Date().toISOString(), exams } };
};
