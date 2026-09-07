<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { showToast } from "vant";
import { ArrowLeft, BookOpenText, Clock3, RotateCcw, Save } from "@lucide/vue";
import { useLearningPlan } from "@/composables/useLearningPlan";
import { useTheme } from "@/composables/useTheme";

const router = useRouter();
const { preference, updatePreference, resetPreference } = useLearningPlan();
const { cssVariables } = useTheme();

const extraLearningContent = ref(preference.value.extraLearningContent);
const desiredWorkload = ref(preference.value.desiredWorkload);

const hasChanges = computed(() => {
  return extraLearningContent.value.trim() !== preference.value.extraLearningContent ||
    desiredWorkload.value.trim() !== preference.value.desiredWorkload;
});

const goBack = () => {
  router.back();
};

const savePreference = () => {
  updatePreference({
    extraLearningContent: extraLearningContent.value,
    desiredWorkload: desiredWorkload.value
  });
  extraLearningContent.value = preference.value.extraLearningContent;
  desiredWorkload.value = preference.value.desiredWorkload;
  showToast({ message: "学习计划已保存", type: "success" });
};

const clearPreference = () => {
  resetPreference();
  extraLearningContent.value = "";
  desiredWorkload.value = "";
  showToast({ message: "已清空额外学习要求", type: "success" });
};
</script>

<template>
  <div class="learning-plan-view" :style="cssVariables">
    <div class="page-header">
      <button class="icon-button" @click="goBack" aria-label="返回">
        <ArrowLeft :size="18" />
      </button>
      <div class="header-copy">
        <h1>自定义学习计划</h1>
        <p>告诉 AI 你还想补充什么内容，以及一周想投入多少学习量。</p>
      </div>
    </div>

    <div class="page-body">
      <section class="form-section">
        <div class="section-heading">
          <BookOpenText :size="16" />
          <span>额外学习内容</span>
        </div>
        <van-field
          v-model="extraLearningContent"
          type="textarea"
          rows="6"
          autosize
          maxlength="400"
          show-word-limit
          placeholder="例如：每周加入 2 次算法题训练，保留英语阅读时间，并预留复习操作系统和数据库。"
          class="theme-field"
        />
      </section>

      <section class="form-section">
        <div class="section-heading">
          <Clock3 :size="16" />
          <span>期望学习负荷</span>
        </div>
        <van-field
          v-model="desiredWorkload"
          type="textarea"
          rows="4"
          autosize
          maxlength="240"
          show-word-limit
          placeholder="例如：工作日每天额外学习 1.5 小时，周末最多安排半天，避免连续晚间学习。"
          class="theme-field"
        />
      </section>

      <section class="preview-section">
        <div class="preview-label">当前会附加到 AI 导入提示词中的内容</div>
        <div class="preview-box">
          <p v-if="preference.extraLearningContent || preference.desiredWorkload">
            <strong>额外学习内容：</strong>{{ preference.extraLearningContent || "未填写" }}
          </p>
          <p v-if="preference.extraLearningContent || preference.desiredWorkload">
            <strong>期望学习负荷：</strong>{{ preference.desiredWorkload || "未填写" }}
          </p>
          <p v-else>暂未保存额外要求，AI 导入提示词将只包含课表提取说明。</p>
        </div>
      </section>
    </div>

    <div class="page-actions">
      <button class="secondary-button" @click="clearPreference">
        <RotateCcw :size="16" />
        <span>清空</span>
      </button>
      <button class="primary-button" :disabled="!hasChanges" @click="savePreference">
        <Save :size="16" />
        <span>保存</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.learning-plan-view {
  min-height: 100vh;
  padding: 20px 16px 24px;
  padding-top: calc(20px + env(safe-area-inset-top, 0px));
  background: var(--theme-bg-color);
  color: var(--theme-body-text);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.icon-button {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-bg-color) 84%, transparent);
  color: var(--theme-header-text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-copy h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  color: var(--theme-header-text);
}

.header-copy p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.75;
}

.page-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-section,
.preview-section {
  padding: 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--theme-bg-color) 88%, var(--theme-body-text) 4%);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-header-text);
}

.preview-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--theme-header-text);
}

.preview-box {
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.85;
  white-space: pre-wrap;
}

.preview-box p {
  margin: 0 0 8px;
}

.preview-box p:last-child {
  margin-bottom: 0;
}

.page-actions {
  margin-top: auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.primary-button,
.secondary-button {
  height: 42px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 12%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}

.primary-button {
  background: var(--theme-header-bg);
  color: var(--theme-header-text);
}

.primary-button:disabled {
  opacity: 0.5;
}

.secondary-button {
  background: transparent;
  color: var(--theme-body-text);
}

:deep(.theme-field .van-cell) {
  padding: 0;
  background: transparent;
}

:deep(.theme-field .van-field__control) {
  color: var(--theme-body-text);
  font-size: 13px;
  line-height: 1.6;
}

:deep(.theme-field .van-field__word-limit) {
  color: color-mix(in srgb, var(--theme-body-text) 58%, transparent);
}

:deep(.theme-field .van-field__control::placeholder) {
  color: color-mix(in srgb, var(--theme-body-text) 48%, transparent);
}
</style>
