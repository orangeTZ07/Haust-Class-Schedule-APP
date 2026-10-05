<script setup lang="ts">
import { ref } from "vue";
import { showToast } from "vant";
import { DownloadCloud, FolderOpen, Loader2 } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { fetchTimetable, type SyncResult } from "@/services/eams/eamsClient";
import { createTauriHttp } from "@/services/eams/tauriHttp";
import { encryptPasswordWithKey } from "@/services/eams/rsaEncrypt";
import { parseBackupFile } from "@/utils/backupFile";
import { describeError } from "@/utils/describeError";

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
const fileInput = ref<HTMLInputElement | null>(null);

/// 从文件导入。
///
/// 用浏览器原生的 <input type="file">，**不引入任何新插件** —— 手机 webview 会弹系统文件选择器，
/// 而 FileReader/text() 直接给出文件内容，不需要 plugin-fs、不需要改权限、不需要碰 Rust。
///
/// 这条路的唯一价值在于：**它完全不碰教务系统的网络**。自动同步那边已经确认卡在网络层
/// （403 空正文、第一跳就被拒，而同一个地址浏览器和微信都正常），而这条路不经过那条通道，
/// 所以它一定能用。
const onFilePicked = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 清空，否则连着选同一个文件第二次不会触发 change
  input.value = "";
  if (!file) return;

  busy.value = true;
  messageKind.value = "info";
  message.value = `正在读取 ${file.name}…`;

  try {
    const result = parseBackupFile(await file.text());
    if (!result.ok) {
      messageKind.value = "err";
      message.value = `这个文件用不了：${result.error}`;
      return;
    }

    const restored = await importFromJsonBackup(result.text!);
    if (!restored.success) {
      messageKind.value = "err";
      message.value = `文件读到了，但写入课表失败：${restored.message}`;
      return;
    }

    messageKind.value = "ok";
    message.value = `导入完成：${result.courses} 门课程、${result.schedules} 条日程。（来自 ${file.name}）`;
    showToast("课表已从文件导入");
  } catch (error) {
    messageKind.value = "err";
    message.value = `读取文件出错：${describeError(error)}`;
  } finally {
    busy.value = false;
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
      const detail = result.detail ? `\n\n诊断信息（请把这部分发给我）：\n${result.detail}` : "";
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
          <span>导入课表</span>
        </div>
        <button class="close" @click="close">关闭</button>
      </div>

      <div class="body">
        <!-- 结果放在最上面：两种方式共用一处显示，而且不用滚动就能看到 -->
        <div v-if="message" class="message" :class="messageKind">{{ message }}</div>

        <!-- 方式一：选文件。放在前面，因为它不需要网络，是最稳的那条 -->
        <div class="section-title">
          方式一 · 选文件导入
          <span class="tag ok">不需要网络</span>
        </div>
        <div class="hint">
          把电脑上生成的 <code>backup.json</code> 传到手机（微信发给自己也行），然后点下面的按钮选中它。
        </div>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".json,application/json"
          @change="onFilePicked"
        />
        <button class="file-btn haptics" :disabled="busy" @click="fileInput?.click()">
          <FolderOpen :size="16" />
          <span>选择课表文件</span>
        </button>

        <!-- 方式二：自动同步。需要能连上教务系统 -->
        <div class="section-title">
          方式二 · 从教务系统同步
          <span class="tag warn">需要先连 aTrust</span>
        </div>
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

        <div class="note">
          <div>· <strong>方式一</strong>不需要任何网络设置，只要文件在手机上就能导入。</div>
          <div>· <strong>方式二</strong>需要手机能连上教务系统（先打开 aTrust 并连接，或连校园网）。</div>
          <div>· 两种方式都会<strong>整体替换</strong>当前课表，导入前请确认。</div>
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
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.section-title:first-of-type { margin-top: 4px; }
.tag {
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 400;
  border-radius: 4px;
}
.tag.ok { background: #e8f5e9; color: #1b5e20; }
.tag.warn { background: #fff8e1; color: #e65100; }
/* 原生文件框藏起来，改用按钮触发 —— 它在各机型上的默认样式差异很大，而且很占位置 */
.file-input { display: none; }
.file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--primary-color, #1989fa);
  background: transparent;
  border: 1px solid var(--primary-color, #1989fa);
  border-radius: 8px;
}
.file-btn:disabled { opacity: 0.6; }
</style>
