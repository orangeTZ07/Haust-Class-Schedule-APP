<script setup lang="ts">
import { ref, watch } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { showToast } from "vant";
import { ChevronDown, Copy, DownloadCloud, Info, LifeBuoy, Loader2, Stethoscope } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { fetchTimetable, JWC_HOST, type SyncFailure } from "@/services/eams/eamsClient";
import { clearSavedPassword, readCredentials, saveCredentials } from "@/services/eams/credentialStorage";
import { fetchExams, type ExamSyncResult } from "@/services/eams/examClient";
import { saveExamSnapshot } from "@/services/eams/examStorage";
import type { EamsDeps } from "@/services/eams/casLogin";
import { formatMatrix, runDiagnosticMatrix } from "@/services/eams/diagnose";
import { createTauriHttp } from "@/services/eams/tauriHttp";
import { encryptPasswordWithKey } from "@/services/eams/rsaEncrypt";
import { launchApp } from "@/services/androidInstaller";
import { describeError } from "@/utils/describeError";
import ImportNotice from "./ImportNotice.vue";
import { useConfirmReplace } from "./confirmReplace";
import { importDateLabel, newTableToast, periodOverflowNotice, skippedNotice, type ImportOutcome } from "./importTable";
import "./importShared.css";

const emit = defineEmits<{
  /// Asked when the sync went through and left nothing the user has to read.
  close: [];
}>();

const props = defineProps<{
  /// Replace the current timetable instead of importing into a new one.
  overwrite: boolean;
}>();

const { activeCourseTableId, periodConfig, ensureStorageReady, importFromJsonBackup, importAsNewCourseTable } = useCourses();
const confirmReplace = useConfirmReplace();

const savedCredentials = readCredentials();
const username = ref(savedCredentials?.username ?? "");
const rememberPassword = ref(savedCredentials?.rememberPassword ?? false);
const password = ref(rememberPassword.value ? savedCredentials?.password ?? "" : "");
// 取消勾选（包括下面因为学号或密码不对而自动取消）时立刻删掉已存的密码，学号留着。
watch(rememberPassword, (remember) => {
  if (!remember) clearSavedPassword();
});
const syncing = ref(false);
const syncDependencies = (): EamsDeps => ({
  http: createTauriHttp(),
  encryptPassword: async (pw, key) => encryptPasswordWithKey(pw, key) ?? ""
});

/// 面板上方的提示：失败的原因，或同步成功但仍需用户处理的提醒。每条只有一句话。
const message = ref("");
const messageKind = ref<"ok" | "err" | "info">("info");
/// 失败时服务端给出的诊断信息（请求链路、状态码、正文片段）。默认收起：给用户看的是一句原因，
/// 排查用的细节点开才铺出来，并且可以一键复制发给开发者。
const failureDetail = ref("");
const showDetail = ref(false);

const showMessage = (kind: "ok" | "err" | "info", text: string, detail = "") => {
  messageKind.value = kind;
  message.value = text;
  failureDetail.value = detail;
  showDetail.value = false;
};

const diagnosing = ref(false);
const diagnoseText = ref("");
/// Folded away by default: most people never need it, and it is the part that made the old panel
/// look like a debugging screen.
const showTrouble = ref(false);

const CREDIT_URL = "https://github.com/LinJX1210";
/// 学校 aTrust 的服务器地址：在 aTrust 里填这个，「复制」按钮复制的也是它。
const VPN_HOST = "vpn.haust.edu.cn";
/// aTrust 在 Android 上的包名（各应用商店都是这一个）。
const ATRUST_PACKAGE = "com.sangfor.atrust";
/// 手机上没有 aTrust 时去的页面：学校信息化办公室的 aTrust 下载安装说明。
const ATRUST_HELP_URL = "https://metic.haust.edu.cn/info/1010/1972.htm";

const openCredit = () => {
  openUrl(CREDIT_URL).catch(() => {
    window.open(CREDIT_URL, "_blank", "noopener");
  });
};

const openAtrustHelp = () => {
  openUrl(ATRUST_HELP_URL).catch(() => {
    const opened = window.open(ATRUST_HELP_URL, "_blank", "noopener");
    if (!opened) showToast({ message: "无法打开 aTrust 安装说明，请在浏览器中访问 metic.haust.edu.cn", type: "fail" });
  });
};

/// 优先用系统接口直接拉起手机上的 aTrust；没装、拉不起来，或这个平台没有这个接口（比如 iOS），
/// 就去安装说明页。拉起失败和「没装」一样处理，所以这里吞掉异常。
const openAtrust = async () => {
  let launched = false;
  try {
    launched = await launchApp(ATRUST_PACKAGE);
  } catch {
    // 落到下面的安装说明页。
  }
  if (!launched) openAtrustHelp();
};

/// Clipboard API 在部分 WebView 里会拒绝，选区复制是同一套按钮的退路。
const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 落到下面的选区复制。
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "0";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
};

const copyVpnHost = async () => {
  const ok = await copyText(VPN_HOST);
  showToast(
    ok
      ? { message: `已复制 ${VPN_HOST}`, type: "success" }
      : { message: "复制失败", type: "fail" }
  );
};

const copyFailureDetail = async () => {
  const ok = await copyText(`${message.value}\n\n${failureDetail.value}`);
  showToast(ok ? { message: "已复制诊断信息", type: "success" } : { message: "复制失败", type: "fail" });
};

/// 网络诊断矩阵。
///
/// 起因是 issue #8 里 orangeTZ07 的指正，而且他说得对：我上一版传的 `redirect: "manual"`
/// **不是插件的参数**，插件静默忽略它、自己跟完了跳转 —— 于是我看到的 403 是**最后一跳**的结果，
/// 却被标成了"第 1 跳"，还据此下了结论。标签错了，结论就跟着错。
///
/// 现在每个变体都用 `maxRedirections: 0` 真正关掉自动跳转，由我们逐跳走、每跳留痕。
/// 三个变体之间只差一个变量，这样"差别出在哪"才有意义。
const diagnose = async () => {
  if (diagnosing.value) return;
  diagnosing.value = true;
  diagnoseText.value = "正在诊断，请稍候…";
  try {
    const results = await runDiagnosticMatrix(
      createTauriHttp(),
      `https://${JWC_HOST}/eams/login.action`,
      (text) => {
        diagnoseText.value = text;
      }
    );
    diagnoseText.value = formatMatrix(results);
  } catch (error) {
    diagnoseText.value = `诊断失败：${describeError(error)}`;
  } finally {
    diagnosing.value = false;
  }
};

/// 同步结果出来后按登录这一步的成败处理已存的登录信息。
///   * 学校明确说学号或密码不对：取消勾选，watch 会删掉已存的密码；
///   * 连不上或其它登录失败（验证码、锁定、认不出原因）：已存的不动；
///   * 成功，或失败发生在登录之后：记下学号，勾了「记住密码」再记密码。
const rememberLogin = (result: { ok: true } | SyncFailure, account: string, secret: string) => {
  if (!result.ok && result.wrongCredentials) {
    rememberPassword.value = false;
    return;
  }
  if (!result.ok && (result.kind === "unreachable" || result.kind === "login")) return;
  if (account && secret) saveCredentials(account, secret, rememberPassword.value);
};

/// 课表写入之后，在同一个登录会话里取考试安排，存到刚写入的那张课表上。
/// 取不到不算同步失败：课表已经到手，考试安排只作为一条提醒报出来。
const syncExamsInto = async (tableId: number, account: string, secret: string): Promise<ExamSyncResult> => {
  try {
    const result = await fetchExams(syncDependencies(), account, secret, { skipReachabilityProbe: true });
    if (result.ok) saveExamSnapshot(tableId, result.snapshot);
    return result;
  } catch (error) {
    return { ok: false, kind: "unknown", message: describeError(error) };
  }
};

/// 一次同步拿回课表和考试安排。以前是「同步课表」「同步考试」两个按钮、两次登录，而考试安排
/// 存到「当前课表」上 —— 先点同步考试、再点同步课表，考试就挂在了旧课表上（issue #51）。
const sync = async () => {
  if (syncing.value) return;

  const account = username.value.trim();
  const secret = password.value;
  if (!account || !secret) {
    showMessage("err", "请输入学号和密码。");
    return;
  }

  // 读一次就定下来：同步要等好几秒，期间拨动底部开关不能让一次「新课表」同步变成没确认过的覆盖。
  const overwrite = props.overwrite;

  // 上次读库失败时，「当前课表」和课程数都不可信：确认框会以为是空表而跳过。先重读，读不到就不同步。
  if (!(await ensureStorageReady())) {
    showMessage("err", "本地课表数据库暂时无法打开，请重启应用后重试。");
    return;
  }

  // Only overwriting asks, and it asks up front rather than after the fetch: a prompt that shows up
  // after the wait is one the user is no longer expecting. A new table destroys nothing.
  if (overwrite && !(await confirmReplace("教务同步"))) return;

  syncing.value = true;
  showMessage("info", "");

  try {
    const result = await fetchTimetable(syncDependencies(), account, secret);
    rememberLogin(result, account, secret);

    if (!result.ok) {
      // 只给一句原因；服务端原话、HTTP 状态、最终地址收在「诊断信息」里，点开可看、可复制。
      showMessage("err", result.message, result.detail ?? "");
      return;
    }

    // 复用已有的备份导入逻辑：它已经过测试，会处理按周覆盖层、单双周、ID 重映射等。
    // 新课表在取到数据之后才建，所以网络失败不会留下空课表。
    const backupJson = JSON.stringify(result.backup);
    const targetTableId = activeCourseTableId.value;
    const imported: ImportOutcome = overwrite
      ? await importFromJsonBackup(backupJson)
      : await importAsNewCourseTable(`教务同步 ${importDateLabel()}`, () => importFromJsonBackup(backupJson));
    if (!imported.success) {
      showMessage("err", `课表保存失败：${imported.message}`);
      return;
    }

    // 考试安排存到刚写入课表的那张表：新课表用导入返回的编号，覆盖则是同步开始时的当前课表。
    const exams = await syncExamsInto(imported.tableId ?? targetTableId, account, secret);
    if (!rememberPassword.value) password.value = "";

    const examCount = exams.ok ? exams.snapshot.exams.length : 0;
    const summary =
      (imported.tableName ? newTableToast(imported.tableName) : "已更新当前课表") +
      (examCount ? `，含 ${examCount} 场考试` : "");

    // 只有需要用户处理的事才留在面板上；其余情况一句 toast 足够，面板直接收起。
    const warnings = [
      periodOverflowNotice(result.report.maxPeriod, periodConfig.value.periods.length),
      skippedNotice(imported.skipped),
      exams.ok ? "" : `考试安排获取失败：${exams.message}`
    ].filter(Boolean);

    if (warnings.length === 0) {
      showMessage("info", "");
      showToast(summary);
      emit("close");
      return;
    }

    // 考试安排取不到时，把它的诊断信息也收进「诊断信息」，方便复制给开发者。
    showMessage("info", [`${summary}。`, ...warnings].join("\n"), exams.ok ? "" : exams.detail ?? "");
  } catch (error) {
    // 这里以前写成 (error as Error).message —— 而 Tauri 拒绝时给的是错误值本身，对字符串错误
    // 取 .message 会得到 undefined，把真实原因吞掉（踩过一次）。describeError 专门处理这个。
    showMessage("err", `同步失败：${describeError(error)}`);
  } finally {
    syncing.value = false;
  }
};
</script>

<template>
  <div class="eams-section">
    <!-- 结果放在最上面：不用滚动就能看到 -->
    <ImportNotice v-if="message" :kind="messageKind">{{ message }}</ImportNotice>

    <div v-if="message && failureDetail" class="detail">
      <div class="detail-bar">
        <button
          type="button"
          class="detail-toggle"
          :aria-expanded="showDetail"
          @click="showDetail = !showDetail"
        >
          <span>诊断信息</span>
          <ChevronDown :size="15" class="chevron" :class="{ open: showDetail }" />
        </button>
        <button type="button" class="detail-copy" @click="copyFailureDetail">
          <Copy :size="13" aria-hidden="true" />
          <span>复制</span>
        </button>
      </div>
      <pre v-if="showDetail" class="diag-out">{{ failureDetail }}</pre>
    </div>

    <div class="imp-card">
      <div class="imp-card-head">
        <span class="imp-card-title">教务系统同步</span>
      </div>

      <p class="imp-hint">使用「我i科大」账号登录，同步本学期课表与考试安排。</p>

      <div class="atrust">
        <Info :size="15" class="atrust-icon" />
        <p class="atrust-text">
          校外使用需先连接 aTrust，或接入校园网。
          <button type="button" class="atrust-jump" @click="openAtrust">打开 aTrust</button>
          <button type="button" class="atrust-copy" :aria-label="`复制 ${VPN_HOST}`" @click="copyVpnHost">
            <span class="atrust-host">{{ VPN_HOST }}</span>
            <Copy :size="13" aria-hidden="true" />
            <span>复制</span>
          </button>
        </p>
      </div>

      <label>
        <span class="imp-label">学号</span>
        <input
          v-model="username"
          class="imp-input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="请输入学号"
        />
      </label>

      <label>
        <span class="imp-label">密码</span>
        <input
          v-model="password"
          class="imp-input"
          type="password"
          autocomplete="off"
          placeholder="请输入「我i科大」登录密码"
          @keyup.enter="sync"
        />
      </label>

      <div class="remember">
        <van-checkbox v-model="rememberPassword" shape="square" icon-size="16px">记住密码</van-checkbox>
        <span class="remember-note">仅保存在本机</span>
      </div>

      <button class="app-btn app-btn--primary" :disabled="syncing" @click="sync">
        <Loader2 v-if="syncing" :size="18" class="imp-spin" />
        <DownloadCloud v-else :size="18" />
        <span>{{ syncing ? "正在同步…" : "同步课表与考试" }}</span>
      </button>
    </div>

    <div class="trouble">
      <button class="trouble-toggle" :aria-expanded="showTrouble" @click="showTrouble = !showTrouble">
        <LifeBuoy :size="15" />
        <span>连接问题</span>
        <ChevronDown :size="15" class="chevron" :class="{ open: showTrouble }" />
      </button>

      <div v-if="showTrouble" class="trouble-body">
        <ul class="trouble-list">
          <li>请确认 aTrust 显示「已连接」后重试。</li>
          <li>仍无法连接时，可改用「AI 识别」导入课表。</li>
          <li>如需协助，请运行网络诊断并将结果反馈给开发者。</li>
        </ul>

        <button class="app-btn app-btn--outline" :disabled="diagnosing" @click="diagnose">
          <Loader2 v-if="diagnosing" :size="16" class="imp-spin" />
          <Stethoscope v-else :size="16" />
          <span>{{ diagnosing ? "正在诊断…" : "网络诊断" }}</span>
        </button>

        <pre v-if="diagnoseText" class="diag-out">{{ diagnoseText }}</pre>
      </div>
    </div>

    <footer class="eams-footer">
      <p class="eams-credit">
        教务同步原型：
        <button type="button" class="eams-credit-link" @click="openCredit">@LinJX1210</button>
      </p>
    </footer>
  </div>
</template>

<style scoped>
.eams-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.remember {
  --van-checkbox-label-color: var(--theme-body-text);
  --van-checkbox-checked-icon-color: var(--theme-accent);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 13px;
}

.remember-note {
  font-size: 12px;
  color: var(--theme-body-text);
  opacity: 0.6;
}

.eams-footer {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--theme-body-text) 8%, transparent);
}

.eams-credit {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  color: var(--theme-body-text);
  opacity: 0.55;
}

.eams-credit-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--theme-accent);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.atrust {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--theme-body-text);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-warning) 16%, transparent);
}

.atrust-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-warning);
}

.atrust-text {
  margin: 0;
  min-width: 0;
}

.atrust-jump,
.atrust-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 2px 6px;
  padding: 1px 8px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 48%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-bg-color) 78%, transparent);
  color: var(--theme-body-text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  vertical-align: middle;
  cursor: pointer;
}

.atrust-jump {
  color: var(--theme-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.atrust-host {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 600;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: -6px;
}

.detail-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-toggle,
.trouble-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 4px;
  border: none;
  background: transparent;
  color: var(--theme-body-text);
  font-size: 13px;
  opacity: 0.7;
}

.detail-toggle {
  flex: 1;
  width: auto;
}

.detail-copy {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.chevron {
  margin-left: auto;
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
}

.trouble-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--theme-body-text) 4%, transparent);
}

.trouble-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  list-style: disc;
  color: var(--theme-body-text);
  opacity: 0.8;
}

.trouble-list li + li {
  margin-top: 6px;
}

/* 诊断输出是等宽文本，必须能横向滚动 —— 里面的 URL 很长，换行会把地址截断得没法看 */
.diag-out {
  margin: 0;
  padding: 10px;
  max-height: 40vh;
  overflow: auto;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre;
  color: var(--theme-body-text);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 6%);
  user-select: text;
  -webkit-user-select: text;
}
</style>
