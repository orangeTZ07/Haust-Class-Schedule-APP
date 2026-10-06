<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { BookMarked, CalendarDays, Check, ChevronRight, Copy, Plus, RefreshCcw } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { useLearningPlan } from "@/composables/useLearningPlan";
import SegmentedControl from "./SegmentedControl.vue";
import "./importShared.css";

const emit = defineEmits<{
  /// Asked when the import went through, or when the user leaves for the learning-plan page.
  close: [];
}>();

const router = useRouter();
const { importFromCsv, importFromSemesterCsv, currentWeek } = useCourses();
const { preference, hasPreference } = useLearningPlan();

const csvInput = ref("");
const isOverwrite = ref(true);
const importKind = ref<"weekly" | "semester">("weekly");

const kindOptions = [
  { value: "weekly" as const, label: "按周", icon: CalendarDays },
  { value: "semester" as const, label: "按学期", icon: CalendarDays },
];

const modeOptions = [
  { value: "overwrite", label: "覆盖现有", icon: RefreshCcw },
  { value: "append", label: "追加导入", icon: Plus },
];

/// SegmentedControl speaks in strings; the rest of this file wants the boolean.
const importMode = computed({
  get: () => (isOverwrite.value ? "overwrite" : "append"),
  set: (value: string) => {
    isOverwrite.value = value === "overwrite";
  }
});

const modeHelpText = computed(() => {
  if (importKind.value === "weekly") {
    if (isOverwrite.value) {
      return `覆盖导入会重写第 ${currentWeek.value} 周的覆盖层，学期基础课表会保留。`;
    }
    return `追加导入会把新课程叠加到第 ${currentWeek.value} 周，不会清掉学期基础课表。`;
  }

  if (isOverwrite.value) {
    return "覆盖导入会清空当前课表数据，再写入新的学期基础课表。";
  }
  return "追加导入会在现有学期基础课表上继续增加课程。";
});

const weeklyPrompt = [
  "你是一个专业的结构化数据提取专家。请读取我提供的单周课表图片，提取其中当前这一周实际生效的所有课程信息，并严格按照 CSV 格式输出。",
  "",
  "输出格式要求：",
  "表头定义：必须严格使用以下 5 个字段作为第一行：",
  "星期,开始节,结束节,课程名称,上课地点",
  "",
  "畸形数据与特殊情况处理（严格遵守）：",
  "1. 包含逗号的字段防注入：如果上课地点、课程名称等任何字段内部本身包含英文逗号或换行符，必须使用英文双引号将该字段的全部内容包裹起来。例如：\"开元工科2号楼（613, 611）\"。",
  "2. 数据缺失处理：如果某门课没有标注上课地点或某些信息缺失，请将该字段留空，但必须保留分隔用的逗号。例如：周三,7,8,体育(2),。",
  "3. 节次跨度合并：一门课通常会占据两个或多个节次，请将其合并为一条记录，准确提取其开始节和结束节。",
  "4. 去除无关换行：在同一个格子里为了排版而产生的换行，请在提取时合并为单行文本。",
  "",
  "输出限制：",
  "请仅在代码块内输出 CSV 数据。",
  "不要输出任何问候语、解释说明、或处理过程。我只需要纯粹的 CSV 数据以便于代码直接解析。"
].join("\n");

const semesterPrompt = [
  "你是一个专业的结构化数据提取专家。请读取我提供的整学期课表图片或文字，提取其中的所有课程信息，并严格按照 CSV 格式输出。",
  "",
  "输出格式要求：",
  "表头定义：必须严格使用以下 8 个字段作为第一行：",
  "星期,开始节,结束节,课程名称,上课地点,开始周,结束周,单双周",
  "",
  "周次处理（严格遵守）：",
  "1. 如果课程标注了“第3-16周”“3-16周”“3到16周”，请输出开始周为 3，结束周为 16。",
  "2. 如果课程只有“第8周”或“8周”，开始周和结束周都输出 8。",
  "3. 如果课程标注“单周”，单双周输出“单”；如果标注“双周”，单双周输出“双”；没有单双周限制时输出“全部”。",
  "4. 如果原课表没有写周次范围，请默认开始周为 1，结束周为 20，单双周为“全部”。",
  "",
  "畸形数据与特殊情况处理（严格遵守）：",
  "1. 包含逗号的字段防注入：如果上课地点、课程名称等任何字段内部本身包含英文逗号或换行符，必须使用英文双引号将该字段的全部内容包裹起来。例如：\"开元工科2号楼（613, 611）\"。",
  "2. 数据缺失处理：如果某门课没有标注上课地点，请将该字段留空，但必须保留分隔用的逗号。例如：周三,7,8,体育(2),,1,16,全部。",
  "3. 节次跨度合并：一门课通常会占据两个或多个节次，请将其合并为一条记录，准确提取其开始节和结束节。",
  "4. 同一门课如果在不同星期、不同节次或不同周次上课，请拆成多条记录。",
  "",
  "输出限制：",
  "请仅在代码块内输出 CSV 数据。",
  "不要输出任何问候语、解释说明、或处理过程。我只需要纯粹的 CSV 数据以便于代码直接解析。"
].join("\n");

const learningPlanPrompt = computed(() => {
  if (!hasPreference.value) {
    return "";
  }

  const lines = ["", "补充上下文（不要改变 CSV 格式要求，仅作为学习安排偏好备注）："];
  if (preference.value.extraLearningContent) {
    lines.push(`- 额外学习内容：${preference.value.extraLearningContent}`);
  }
  if (preference.value.desiredWorkload) {
    lines.push(`- 期望学习负荷：${preference.value.desiredWorkload}`);
  }
  lines.push("输出时仍然只返回课表 CSV，不要新增字段，不要添加解释。");
  return lines.join("\n");
});

const activePrompt = computed(() => {
  const basePrompt = importKind.value === "weekly" ? weeklyPrompt : semesterPrompt;
  return `${basePrompt}${learningPlanPrompt.value}`;
});

const pastePlaceholder = computed(() =>
  importKind.value === "weekly" ? "在此粘贴按周 CSV..." : "在此粘贴按学期 CSV..."
);

const planSummary = computed(() => {
  if (!hasPreference.value) {
    return "补充你的学习安排，会一起写进给 AI 的指令";
  }
  return `已附加：${preference.value.extraLearningContent || "未填额外学习内容"} / ${preference.value.desiredWorkload || "未填学习负荷"}`;
});

const openLearningPlan = () => {
  emit("close");
  router.push("/learning-plan");
};

const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(activePrompt.value);
    showToast({ message: "复制成功", type: "success", position: "bottom" });
  } catch (e) {
    showToast({ message: "复制失败", type: "fail" });
  }
};

const handleImport = async () => {
  if (!csvInput.value.trim()) {
    showToast("内容不能为空");
    return;
  }

  const result = importKind.value === "weekly"
    ? await importFromCsv(csvInput.value, isOverwrite.value)
    : await importFromSemesterCsv(csvInput.value, isOverwrite.value);

  if (result.success) {
    showToast({ message: result.message, type: "success" });
    csvInput.value = "";
    emit("close");
  } else {
    showToast({ message: result.message, type: "fail" });
  }
};
</script>

<template>
  <div class="ai-section">
    <SegmentedControl v-model="importKind" :options="kindOptions" compact />

    <p v-if="importKind === 'weekly'" class="imp-hint note">
      按周导入的结果会写入第 {{ currentWeek }} 周的覆盖层。
    </p>

    <div class="imp-card">
      <div class="step">
        <div class="step-label">
          <span class="step-num">1</span>
          <span>复制给 AI 的指令</span>
          <button class="copy-btn" @click="copyPrompt">
            <Copy :size="12" />
            <span>复制</span>
          </button>
        </div>
        <div class="prompt-preview">
          <pre>{{ activePrompt }}</pre>
        </div>
        <button class="plan-row" @click="openLearningPlan">
          <BookMarked :size="16" class="plan-icon" />
          <span class="plan-text">
            <span class="plan-title">自定义学习计划（可选）</span>
            <span class="plan-sub">{{ planSummary }}</span>
          </span>
          <ChevronRight :size="16" class="plan-arrow" />
        </button>
      </div>

      <div class="step">
        <div class="step-label">
          <span class="step-num">2</span>
          <span>把指令和课程截图一起发给 AI</span>
        </div>
      </div>

      <div class="step">
        <div class="step-label">
          <span class="step-num">3</span>
          <span>粘贴 AI 回复的结果（CSV）</span>
        </div>
        <textarea v-model="csvInput" class="imp-textarea" rows="4" :placeholder="pastePlaceholder" />
      </div>
    </div>

    <div class="mode-block">
      <SegmentedControl v-model="importMode" :options="modeOptions" compact />
      <p class="mode-help">{{ modeHelpText }}</p>
    </div>

    <button class="imp-primary-btn" @click="handleImport">
      <Check :size="18" />
      <span>导入到课表</span>
    </button>
  </div>
</template>

<style scoped>
.ai-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.note {
  margin-top: -6px;
  padding: 0 4px;
  font-size: 12px;
}

.step {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-body-text);
}

.step-num {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  border-radius: 50%;
  color: var(--theme-bg-color);
  background: var(--theme-body-text);
}

.copy-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.copy-btn:active {
  opacity: 0.7;
}

.prompt-preview {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.prompt-preview pre {
  margin: 0;
  max-height: 64px;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
  color: var(--theme-body-text);
  opacity: 0.55;
}

.prompt-preview pre::-webkit-scrollbar {
  width: 0;
}

.plan-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  border: 1px dashed color-mix(in srgb, var(--theme-body-text) 22%, transparent);
  border-radius: 10px;
  background: transparent;
  color: var(--theme-body-text);
}

.plan-row:active {
  background: color-mix(in srgb, var(--theme-body-text) 6%, transparent);
}

.plan-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.plan-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plan-title {
  font-size: 13px;
  font-weight: 600;
}

.plan-sub {
  font-size: 11px;
  line-height: 1.5;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-arrow {
  flex-shrink: 0;
  opacity: 0.35;
}

.mode-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-help {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--theme-body-text);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  opacity: 0.75;
}
</style>
