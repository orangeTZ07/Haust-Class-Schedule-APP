<script setup lang="ts">
import { ref } from "vue";
import { showToast } from "vant";
import { Check, FolderOpen, Loader2 } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { parseBackupFile } from "@/utils/backupFile";
import { describeError } from "@/utils/describeError";
import ImportNotice from "./ImportNotice.vue";
import "./importShared.css";

const { importFromJsonBackup } = useCourses();

const busy = ref(false);
const message = ref("");
const messageKind = ref<"ok" | "err" | "info">("info");
const fileInput = ref<HTMLInputElement | null>(null);
const jsonInput = ref("");

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

/// 粘贴 JSON 备份恢复：和选文件是同一件事的另一种送达方式（比如备份是从聊天软件里复制出来的）。
const restoreFromPaste = async () => {
  if (busy.value) return;

  if (!jsonInput.value.trim()) {
    showToast("内容不能为空");
    return;
  }

  // The restore replaces everything and there is no undo, so say so while the user can still
  // back out -- rather than letting them find out afterwards.
  if (!confirm("恢复备份会清空当前课程表，再写入备份内容，此操作无法撤销。确定继续？")) {
    return;
  }

  busy.value = true;
  try {
    const result = await importFromJsonBackup(jsonInput.value);
    if (result.success) {
      messageKind.value = "ok";
      message.value = result.message;
      jsonInput.value = "";
      showToast({ message: "课表已恢复", type: "success" });
    } else {
      messageKind.value = "err";
      message.value = result.message;
    }
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <div class="file-section">
    <ImportNotice v-if="message" :kind="messageKind">{{ message }}</ImportNotice>

    <div class="imp-card">
      <div class="imp-card-head">
        <span class="imp-card-title">选文件导入</span>
        <span class="imp-tag ok">不需要网络</span>
      </div>

      <p class="imp-hint">
        把电脑上生成的 <code>backup.json</code> 传到手机（微信发给自己也行），然后点下面的按钮选中它。
      </p>

      <!-- 原生文件框藏起来，改用按钮触发 —— 它在各机型上的默认样式差异很大，而且很占位置 -->
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".json,application/json"
        @change="onFilePicked"
      />
      <button class="imp-primary-btn" :disabled="busy" @click="fileInput?.click()">
        <Loader2 v-if="busy" :size="18" class="imp-spin" />
        <FolderOpen v-else :size="18" />
        <span>选择课表文件</span>
      </button>
    </div>

    <div class="imp-card">
      <div class="imp-card-head">
        <span class="imp-card-title">或者粘贴备份内容</span>
      </div>

      <textarea
        v-model="jsonInput"
        class="imp-textarea"
        rows="4"
        placeholder="在此粘贴「完整 JSON」备份内容..."
      />

      <button class="imp-secondary-btn" :disabled="busy" @click="restoreFromPaste">
        <Check :size="16" />
        <span>确认恢复</span>
      </button>
    </div>

    <p class="imp-hint note">
      恢复备份会用备份内容<strong>整体替换</strong>当前课程表的课程与课段，包含按周覆盖层与单双周设置。
      原数据不再保留，且无法撤销。
    </p>
  </div>
</template>

<style scoped>
.file-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.file-input {
  display: none;
}

.note {
  padding: 0 4px;
  font-size: 12px;
  opacity: 0.6;
}
</style>
