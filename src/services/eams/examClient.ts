import { casLogin, CookieJar, type EamsDeps } from "./casLogin";
import { JWC_HOST, probeReachability } from "./eamsClient";
import { isExamLandingPage, parseExamTable, type ExamSnapshot } from "./examParser";

const EAMS = `https://${JWC_HOST}/eams`;
const EXAM_PAGE = `${EAMS}/stdExamTable.action`;

type ExamSyncResult = { ok: true; snapshot: ExamSnapshot } | { ok: false; message: string };

export const fetchExams = async (
  deps: EamsDeps,
  username: string,
  password: string
): Promise<ExamSyncResult> => {
  const reachable = await probeReachability(deps.http);
  if (!reachable.ok) return { ok: false, message: reachable.message };

  // An existing school session can take CAS straight to the portal. Only require
  // credentials if CAS presents a login form and needs a password for submission.
  const missingCredentials = new Error("请填写「我i科大」的学号和密码后再同步考试。");
  try {
    const login = await casLogin({
      ...deps,
      encryptPassword: async (secret, key) => {
        if (!username || !password) throw missingCredentials;
        const encrypted = await deps.encryptPassword(secret, key);
        if (!encrypted) throw new Error("学校登录公钥无法用于加密，请重试。");
        return encrypted;
      }
    }, new CookieJar(), username, password);
    if (!login.ok) return { ok: false, message: login.reason ?? "学校登录失败。" };
  } catch (error) {
    if (error === missingCredentials) return { ok: false, message: missingCredentials.message };
    throw error;
  }

  await deps.http.request(`${EAMS}/sso/login.action`);
  const page = await deps.http.request(EXAM_PAGE, { headers: { Referer: `${EAMS}/homeExt.action` } });
  if (page.status >= 400 || !isExamLandingPage(page.body)) {
    return { ok: false, message: `未取得考试页面（HTTP ${page.status}），请确认教务登录状态。` };
  }

  // Opening “我的考试” selects the current semester in EAMS. The page then loads its
  // scheduled-exam table with this separate XHR in the same session.
  const response = await deps.http.request(`${EAMS}/stdExamTable!examTable.action?_=${Date.now()}`, {
    headers: { Referer: EXAM_PAGE, "X-Requested-With": "XMLHttpRequest" }
  });
  if (response.status >= 400) return { ok: false, message: `考试查询返回 HTTP ${response.status}。` };
  const exams = parseExamTable(response.body);
  if (!exams) return { ok: false, message: "没有识别到完整的考试安排，请检查教务页面后重试。" };

  return { ok: true, snapshot: { syncedAt: new Date().toISOString(), exams } };
};
