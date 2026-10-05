<script setup lang="ts">
import { ref } from "vue";
import { showToast } from "vant";
import { DownloadCloud, Loader2 } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { fetchTimetable, type SyncResult } from "@/services/eams/eamsClient";
import { createTauriHttp } from "@/services/eams/tauriHttp";
import { encryptPasswordWithKey } from "@/services/eams/rsaEncrypt";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { importFromJsonBackup } = useCourses();

const username = ref("");
const password = ref("");
const busy = ref(false);
const message = ref("");
const messageKind = ref<"ok" | "err" | "info">("info");

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
      message.value = describeFailure(result);
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
    // 这里以前很可能写成 (error as Error).message —— 而 Tauri 拒绝时给的是错误值本身，
    // 对字符串错误取 .message 会得到 undefined，把真实原因吞掉（今天就这样被坑过一次）。
    message.value = `同步出错：${typeof error === "string" ? error : (error as Error)?.message ?? String(error)}`;
  } finally {
    busy.value = false;
  }
};

const close = () => emit("update:show", false);
</script>

<template>
  <van-popup
    :show="props.show"
    position="bottom"
    round
    :style="{ height: '78%' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="eams-sync">
      <div class="head">
        <div class="title">
          <DownloadCloud :size="18" />
          <span>从教务系统同步</span>
        </div>
        <button class="close" @click="close">关闭</button>
      </div>

      <div class="body">
        <div class="hint">
          用学校统一身份认证的账号密码登录，直接把课表取回来。密码只在这次同步时用一次，
          <strong>不会保存到手机上</strong>。
        </div>

        <label class="field">
          <span class="label">学号</span>
          <input v-model="username" class="input" type="text" inputmode="numeric" placeholder="请输入学号" />
        </label>

        <label class="field">
          <span class="label">密码</span>
          <input v-model="password" class="input" type="password" placeholder="请输入密码" @keyup.enter="sync" />
        </label>

        <button class="sync haptics" :disabled="busy" @click="sync">
          <Loader2 v-if="busy" :size="16" class="spin" />
          <DownloadCloud v-else :size="16" />
          <span>{{ busy ? "同步中…" : "开始同步" }}</span>
        </button>

        <div v-if="message" class="message" :class="messageKind">{{ message }}</div>

        <div class="note">
          <div>· 需要手机能连上教务系统：<strong>先打开 aTrust 并连接</strong>，或连到校园网。</div>
          <div>· 同步会<strong>整体替换</strong>当前课表，导入前请确认。</div>
          <div>· 如果学校要求验证码，请先在浏览器里成功登录一次再回来。</div>
        </div>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.eams-sync {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border-color, #eee);
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}
.close {
  border: none;
  background: transparent;
  color: var(--text-color-3, #969799);
  font-size: 14px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
}
.hint {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color-2, #646566);
  margin-bottom: 16px;
}
.field {
  display: block;
  margin-bottom: 14px;
}
.label {
  display: block;
  font-size: 13px;
  color: var(--text-color-2, #646566);
  margin-bottom: 6px;
}
.input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 16px;
  border: 1px solid var(--border-color, #dcdee0);
  border-radius: 8px;
  background: var(--input-bg, #fff);
  color: inherit;
}
.sync {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  margin-top: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  background: var(--primary-color, #1989fa);
  border: none;
  border-radius: 8px;
}
.sync:disabled {
  opacity: 0.6;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.message {
  margin-top: 14px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  border-radius: 8px;
  white-space: pre-wrap;
}
.message.ok { background: #e8f5e9; color: #1b5e20; }
.message.err { background: #fdecea; color: #b71c1c; }
.message.info { background: #e3f2fd; color: #0d47a1; }
.note {
  margin-top: 18px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-color-3, #969799);
}
</style>
