<script setup lang="ts">
import { ref } from "vue";
import { showToast } from "vant";
import { FolderOpen, Loader2 } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { parseBackupFile } from "@/utils/backupFile";
import { describeError } from "@/utils/describeError";
import ImportNotice from "./ImportNotice.vue";
import { useConfirmReplace } from "./confirmReplace";
import { newTableNotice, tableNameFromFile, type ImportOutcome } from "./importTable";
import "./importShared.css";

const props = defineProps<{
  /// Replace the current timetable instead of importing into a new one.
  overwrite: boolean;
}>();

const { importFromJsonBackup, importAsNewCourseTable } = useCourses();
const confirmReplace = useConfirmReplace();

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

    // Overwriting asks first, and only after the file has proved readable, so a bad file is
    // reported as such instead of first being asked whether to replace the timetable with it.
    // Importing as a new table destroys nothing, so it never asks.
    if (props.overwrite && !(await confirmReplace(`导入「${file.name}」`))) {
      messageKind.value = "info";
      message.value = "已取消，课表没有改动。";
      return;
    }

    const imported: ImportOutcome = props.overwrite
      ? await importFromJsonBackup(result.text!)
      : await importAsNewCourseTable(tableNameFromFile(file.name), () => importFromJsonBackup(result.text!));
    if (!imported.success) {
      messageKind.value = "err";
      message.value = `文件读到了，但写入课表失败：${imported.message}`;
      return;
    }

    messageKind.value = "ok";
    const summary = `导入完成：${result.courses} 门课程、${result.schedules} 条日程。（来自 ${file.name}）`;
    message.value = imported.tableName
      ? `${summary}\n${newTableNotice(imported.tableName)}`
      : `${summary}\n已覆盖当前课表。`;
    showToast(imported.tableName ? "已导入为新课表" : "已覆盖当前课表");
  } catch (error) {
    messageKind.value = "err";
    message.value = `读取文件出错：${describeError(error)}`;
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
      <button class="app-btn app-btn--primary" :disabled="busy" @click="fileInput?.click()">
        <Loader2 v-if="busy" :size="18" class="imp-spin" />
        <FolderOpen v-else :size="18" />
        <span>选择课表文件</span>
      </button>
    </div>

    <p class="imp-hint note">
      备份里的课程、课段、按周覆盖层和单双周设置都会带过来。默认导入为一个新课表，原来的课表不受影响。
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
