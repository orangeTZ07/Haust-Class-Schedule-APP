<script setup lang="ts">
import { ref } from "vue";
import { showToast } from "vant";
import { ChevronDown, DownloadCloud, Info, LifeBuoy, Loader2, Stethoscope } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { fetchTimetable, JWC_HOST, type SyncResult } from "@/services/eams/eamsClient";
import { formatMatrix, runDiagnosticMatrix } from "@/services/eams/diagnose";
import { createTauriHttp } from "@/services/eams/tauriHttp";
import { encryptPasswordWithKey } from "@/services/eams/rsaEncrypt";
import { describeError } from "@/utils/describeError";
import ImportNotice from "./ImportNotice.vue";
import { useConfirmReplace } from "./confirmReplace";
import "./importShared.css";

const emit = defineEmits<{
  /// The 连不上 hint points at the file route, which needs no network at all.
  "use-file": [];
}>();

const { importFromJsonBackup } = useCourses();
const confirmReplace = useConfirmReplace();

const username = ref("");
const password = ref("");
const busy = ref(false);
const message = ref("");
const messageKind = ref<"ok" | "err" | "info">("info");
const diagnosing = ref(false);
const diagnoseText = ref("");
/// Folded away by default: most people never need it, and it is the part that made the old panel
/// look like a debugging screen.
const showTrouble = ref(false);

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
  diagnoseText.value = "正在逐个变体测试，请稍候…";
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
    diagnoseText.value = `诊断本身出错了：${describeError(error)}`;
  } finally {
    diagnosing.value = false;
  }
};

/// 失败信息按原因分类显示。
///
/// 这一条不是装饰：今天那次失败，脚本把所有情况都说成"学号或密码不对"，而真实原因是缺字段和验证码，
/// 结果拿着一个正确密码反复确认。所以每一类都必须说人话、并且说清该做什么。
const describeFailure = (result: SyncResult & { ok: false }): string => {
  switch (result.kind) {
    case "unreachable":
      return result.message; // 已经写明"请先打开 aTrust"
    case "login":
      return `登录失败：${result.message}`;
    case "session":
      return `登录成功，但教务系统不认这个会话：${result.message}`;
    case "params":
      return `课表页面结构变了：${result.message}`;
    case "course-table":
      return `拉取课表失败：${result.message}`;
    case "empty":
      return result.message;
    default:
      return result.message;
  }
};

const sync = async () => {
  if (busy.value) return;

  if (!username.value.trim() || !password.value) {
    messageKind.value = "err";
    message.value = "请先填学号和密码。";
    return;
  }

  // Asked up front rather than after the fetch: the sync ends in a whole-timetable replacement, and
  // a prompt that shows up after the wait is one the user is no longer expecting.
  if (!(await confirmReplace("教务同步"))) return;

  busy.value = true;
  messageKind.value = "info";
  message.value = "正在连接教务系统…";

  try {
    const result = await fetchTimetable(
      { http: createTauriHttp(), encryptPassword: async (pw, key) => encryptPasswordWithKey(pw, key) ?? "" },
      username.value.trim(),
      password.value
    );

    if (!result.ok) {
      messageKind.value = "err";
      // **把诊断信息一起显示出来。** 之前只显示 message，detail 被丢掉了 —— 而真正有用的是
      // detail：服务端的原话、HTTP 状态、最终地址。第一版的归类还把一个"页面里存在验证码变量"
      // 误判成"需要验证码"，于是用户照着错误提示试了三种办法都没用。信息必须完整地给出来。
      const detail = result.detail ? `\n\n诊断信息（请把这部分发给开发者）：\n${result.detail}` : "";
      message.value = describeFailure(result) + detail;
      return;
    }

    // 复用已有的恢复逻辑：它已经过测试，会处理按周覆盖层、单双周、ID 重映射等。
    const restored = await importFromJsonBackup(JSON.stringify(result.backup));
    if (!restored.success) {
      messageKind.value = "err";
      message.value = `课表已取到，但写入失败：${restored.message}`;
      return;
    }

    messageKind.value = "ok";
    const extra = result.report.maxPeriod > 10
      ? `\n注意：你的课表排到第 ${result.report.maxPeriod} 节，请到 设置 → 网格设置 把节数调到至少 ${result.report.maxPeriod}，否则晚上的课不会显示。`
      : "";
    message.value = `同步完成：${result.report.courses} 门课程、${result.report.schedules} 条日程。${extra}`;
    password.value = "";
    showToast("课表已同步");
  } catch (error) {
    messageKind.value = "err";
    // 这里以前写成 (error as Error).message —— 而 Tauri 拒绝时给的是错误值本身，对字符串错误
    // 取 .message 会得到 undefined，把真实原因吞掉（踩过一次）。describeError 专门处理这个。
    message.value = `同步出错：${describeError(error)}`;
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="eams-section">
    <!-- 结果放在最上面：不用滚动就能看到 -->
    <ImportNotice v-if="message" :kind="messageKind">{{ message }}</ImportNotice>

    <div class="imp-card">
      <div class="imp-card-head">
        <span class="imp-card-title">从教务系统同步</span>
      </div>

      <p class="imp-hint">
        用学校统一身份认证的账号密码登录，直接把课表取回来。密码只在这次同步时用一次，
        <strong>不会保存到手机上</strong>。
      </p>

      <div class="atrust">
        <Info :size="15" class="atrust-icon" />
        <span>需要手机能连上教务系统：先打开 aTrust 并连接，或连校园网。</span>
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
          placeholder="请输入密码"
          @keyup.enter="sync"
        />
      </label>

      <button class="imp-primary-btn" :disabled="busy" @click="sync">
        <Loader2 v-if="busy" :size="18" class="imp-spin" />
        <DownloadCloud v-else :size="18" />
        <span>{{ busy ? "同步中…" : "开始同步" }}</span>
      </button>

      <p class="imp-hint small">同步会<strong>整体替换</strong>当前课表，导入前请确认。</p>
    </div>

    <div class="trouble">
      <button class="trouble-toggle" :aria-expanded="showTrouble" @click="showTrouble = !showTrouble">
        <LifeBuoy :size="15" />
        <span>连不上？</span>
        <ChevronDown :size="15" class="chevron" :class="{ open: showTrouble }" />
      </button>

      <div v-if="showTrouble" class="trouble-body">
        <ul class="trouble-list">
          <li>确认 aTrust 已经显示「已连接」，再重新点「开始同步」。</li>
          <li>
            手机一直连不上教务系统时，可以改用
            <button class="link-btn" @click="emit('use-file')">选文件导入</button>，不需要任何网络。
          </li>
          <li>还是不行，点下面的「网络诊断」，把结果发给开发者。</li>
        </ul>

        <button class="imp-secondary-btn" :disabled="diagnosing" @click="diagnose">
          <Loader2 v-if="diagnosing" :size="16" class="imp-spin" />
          <Stethoscope v-else :size="16" />
          <span>{{ diagnosing ? "诊断中…" : "网络诊断" }}</span>
        </button>

        <pre v-if="diagnoseText" class="diag-out">{{ diagnoseText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eams-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.imp-hint.small {
  font-size: 12px;
  text-align: center;
  opacity: 0.6;
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

.link-btn {
  padding: 0;
  border: none;
  background: none;
  font-size: inherit;
  font-weight: 600;
  color: var(--theme-body-text);
  text-decoration: underline;
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
