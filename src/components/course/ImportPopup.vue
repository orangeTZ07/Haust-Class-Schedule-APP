<script setup lang="ts">
import { ref, computed } from "vue";
import { showToast } from "vant";
import { useCourses } from "@/composables/useCourses";
import { useLearningPlan } from "@/composables/useLearningPlan";
import { useTheme } from "@/composables/useTheme";
import { Copy, X, Check, ChevronDown, ChevronUp, HelpCircle, RefreshCcw, Plus, CalendarDays } from '@lucide/vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { importFromCsv, importFromSemesterCsv, currentWeek } = useCourses();
const { preference, hasPreference } = useLearningPlan();
const { cssVariables, isDark } = useTheme();

const csvInput = ref("");
const showGuide = ref(false);
const isOverwrite = ref(true);
const importKind = ref<"weekly" | "semester">("weekly");

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
const cardTitle = computed(() => importKind.value === "weekly" ? `AI 按周导入 · 第 ${currentWeek.value} 周` : "AI 按学期导入");
const pastePlaceholder = computed(() => importKind.value === "weekly" ? "在此粘贴按周 CSV..." : "在此粘贴按学期 CSV...");

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
    emit("update:show", false);
  } else {
    showToast({ message: result.message, type: "fail" });
  }
};
</script>

<template>
  <van-popup
    :show="props.show"
    @update:show="val => emit('update:show', val)"
    round
    position="center"
    class="custom-import-popup"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.2)' }"
  >
    <div class="minimal-import-card" :class="{ 'is-dark': isDark }">
      <button class="minimal-close-btn haptics" @click="emit('update:show', false)">
        <X :size="16" />
      </button>

      <div class="card-title">{{ cardTitle }}</div>
      <div v-if="importKind === 'weekly'" class="week-target-note">导入结果会写入当前周覆盖层</div>
      <div v-if="hasPreference" class="week-target-note">
        已附加自定义学习计划：{{ preference.extraLearningContent || "未填额外学习内容" }} / {{ preference.desiredWorkload || "未填学习负荷" }}
      </div>
      
      <div class="card-sections">
        <div class="import-kind-selector">
          <button
            class="kind-option haptics"
            :class="{ active: importKind === 'weekly' }"
            @click="importKind = 'weekly'"
          >
            <CalendarDays :size="14" />
            <span>按周</span>
          </button>
          <button
            class="kind-option haptics"
            :class="{ active: importKind === 'semester' }"
            @click="importKind = 'semester'"
          >
            <CalendarDays :size="14" />
            <span>按学期</span>
          </button>
        </div>

        <div class="main-step">
          <div class="step-label">
            <span class="dot"></span>
            <span>1. 复制给 AI 的指令</span>
            <button class="mini-copy-btn haptics" @click="copyPrompt">
              <Copy :size="12" style="margin-right: 4px;" />复制
            </button>
          </div>
          <div class="inset-box prompt-preview">
            <pre>{{ activePrompt }}</pre>
          </div>
        </div>

        <div class="guide-toggle haptics" @click="showGuide = !showGuide">
          <HelpCircle :size="14" style="margin-right: 4px; opacity: 0.5;" />
          <span>{{ showGuide ? '收起说明' : '如何使用？' }}</span>
          <component :is="showGuide ? ChevronUp : ChevronDown" :size="14" style="margin-left: 2px;" />
        </div>

        <transition name="fade-slide">
          <div v-if="showGuide" class="detailed-guide">
            <div class="guide-item">2. 把指令和课程截图一起发送给 AI</div>
            <div class="guide-item">3. 复制 AI 的回复结果(CSV)贴到下方</div>
          </div>
        </transition>

        <div class="main-step">
          <div class="step-label">
            <span class="dot"></span>
            <span>2. 粘贴结果</span>
          </div>
          <div class="inset-box">
            <van-field
              v-model="csvInput"
              type="textarea"
              :placeholder="pastePlaceholder"
              :border="false"
              rows="3"
              class="theme-aware-field"
            />
          </div>
        </div>

        <!-- 导入模式选择 -->
        <div class="mode-section">
          <div class="import-mode-selector">
            <div 
              class="mode-option" 
              :class="{ active: isOverwrite }" 
              @click="isOverwrite = true"
            >
              <RefreshCcw :size="14" class="mode-icon" />
              <span>覆盖现有</span>
            </div>
            <div 
              class="mode-option" 
              :class="{ active: !isOverwrite }" 
              @click="isOverwrite = false"
            >
              <Plus :size="14" class="mode-icon" />
              <span>追加导入</span>
            </div>
          </div>
          <div class="mode-help">
            {{ modeHelpText }}
          </div>
        </div>
      </div>

      <div class="minimal-actions">
        <button class="minimal-primary-btn haptics" @click="handleImport">
          <Check :size="18" style="margin-right: 6px;" />
          同步到课表
        </button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.custom-import-popup {
  width: 85%;
  max-width: 340px;
  background: color-mix(in srgb, var(--theme-bg-color) 85%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.minimal-import-card { padding: 32px 20px 20px; color: var(--theme-body-text); }

.minimal-close-btn {
  position: absolute; top: 12px; right: 12px; width: 24px; height: 24px; border-radius: 6px; border: none;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  color: var(--theme-body-text); opacity: 0.6;
}

.card-title { font-size: 17px; font-weight: 600; margin-bottom: 24px; color: var(--theme-header-text); }

.week-target-note {
  margin-top: -16px;
  margin-bottom: 16px;
  font-size: 12px;
  opacity: 0.68;
}

.card-sections { display: flex; flex-direction: column; gap: 14px; }

.import-kind-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  border-radius: 8px;
}

.kind-option {
  min-width: 0;
  height: 34px;
  border: none;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  color: var(--theme-body-text);
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
}

.kind-option.active {
  background: var(--theme-header-bg);
  color: var(--theme-header-text);
  opacity: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.main-step { display: flex; flex-direction: column; gap: 8px; }

.step-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; }

.dot { width: 4px; height: 4px; background: var(--color-primary); border-radius: 50%; }

.mini-copy-btn {
  margin-left: auto; border: none; font-size: 11px; padding: 4px 10px; border-radius: 6px; font-weight: 600;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent); color: var(--color-primary);
}

/* 核心色彩修复逻辑：使用色彩偏移算法 */
.inset-box {
  background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 5%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 10px;
  overflow: hidden;
}

.prompt-preview { padding: 10px; }
.prompt-preview pre { margin: 0; font-size: 11px; max-height: 45px; overflow-y: auto; opacity: 0.4; line-height: 1.5; }

.guide-toggle { display: flex; align-items: center; justify-content: center; font-size: 12px; opacity: 0.5; padding: 4px 0; cursor: pointer; }

.detailed-guide { background: color-mix(in srgb, var(--theme-bg-color), var(--theme-body-text) 3%); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }

.guide-item { font-size: 11px; opacity: 0.6; padding-left: 12px; position: relative; }
.guide-item::before { content: "•"; position: absolute; left: 0; color: var(--color-primary); }

/* 强力透明化：彻底修复纯白问题 */
.theme-aware-field {
  padding: 8px 12px;
  background: transparent !important;
}

:deep(.van-field) {
  background: transparent !important;
}

:deep(.van-field__control) {
  background: transparent !important;
  color: var(--theme-body-text) !important;
  font-size: 13px;
}

:deep(.van-field__control::placeholder) {
  color: var(--theme-body-text);
  opacity: 0.3;
}

.import-mode-selector {
  display: flex;
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  border-radius: 8px;
  padding: 3px;
  gap: 3px;
}

.mode-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 0;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0.6;
}

.mode-option.active {
  background: var(--theme-header-bg);
  color: var(--theme-header-text);
  opacity: 1;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.mode-icon {
  opacity: 0.8;
}

.mode-help {
  font-size: 11px;
  padding: 6px 10px;
  opacity: 0.7;
  line-height: 1.5;
  background: color-mix(in srgb, var(--theme-body-text) 5%, transparent);
  border-radius: 6px;
  color: var(--theme-body-text);
}

.minimal-actions { margin-top: 26px; }

.minimal-primary-btn {
  width: 100%; height: 44px; border-radius: 10px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center;
  background: var(--theme-header-bg); color: var(--theme-header-text);
  border: 1px solid color-mix(in srgb, var(--theme-header-text) 10%, transparent);
}

.haptics:active { transform: scale(0.98); opacity: 0.8; }
pre::-webkit-scrollbar { width: 0; }
</style>
