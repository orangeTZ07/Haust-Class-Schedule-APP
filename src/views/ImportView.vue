<script setup lang="ts">
import { ref } from "vue";
import { showToast, showConfirmDialog } from "vant";
import { useCourses } from "@/composables/useCourses";

const { importFromCsv, clearAll } = useCourses();

const showImportPopup = ref(false);
const csvInput = ref("");

// 适配 CSV 解析算法的提示词
const aiPrompt = `请按照以下 CSV 格式输出我的课表数据，不要包含任何多余的解释文字，直接输出 CSV 内容：

格式：
星期,开始节,结束节,课程名称,上课地点

示例：
周一,1,2,高等数学A(2),开元公教1-101
周五,3,4,数据结构A,"开元工科2-613"`;

const copyPrompt = async () => {
  try {
    await navigator.clipboard.writeText(aiPrompt);
    showToast({ message: "提示词已复制", type: "success" });
  } catch (e) {
    showToast({ message: "复制失败，请手动选择复制", type: "fail" });
  }
};

const handleImport = async () => {
  if (!csvInput.value.trim()) {
    showToast("请输入 CSV 数据");
    return;
  }

  const result = await importFromCsv(csvInput.value);
  if (result.success) {
    showToast({ message: result.message, type: "success" });
    csvInput.value = "";
    showImportPopup.value = false;
  } else {
    showToast({ message: result.message, type: "fail" });
  }
};

const handleClear = () => {
  showConfirmDialog({
    title: "确认清空",
    message: "确定要清空所有课程数据吗？此操作不可恢复。",
  })
    .then(async () => {
      await clearAll();
      showToast("已清空所有课程数据");
    })
    .catch(() => {
      // on cancel
    });
};
</script>

<template>
  <div class="import-view">
    <div class="main-actions">
      <div class="page-title">课表数据管理</div>
      <p class="page-desc">通过 AI 生成的 CSV 数据快速填充你的课表</p>
      
      <van-button type="primary" block icon="plus" @click="showImportPopup = true" class="action-btn">
        导入课表 (CSV)
      </van-button>
      
      <van-button type="danger" block plain icon="delete-o" @click="handleClear" class="action-btn">
        清空现有课程
      </van-button>
    </div>

    <!-- 导入弹窗卡片 -->
    <van-popup
      v-model:show="showImportPopup"
      round
      position="center"
      class="import-popup"
    >
      <div class="import-card">
        <div class="card-header">导入课程</div>
        
        <div class="card-body">
          <!-- 提示词部分 -->
          <div class="section">
            <div class="section-title">
              <span>1. 复制 AI 提示词</span>
              <van-button size="mini" type="primary" plain @click="copyPrompt">复制</van-button>
            </div>
            <div class="scroll-box prompt-box">
              <pre>{{ aiPrompt }}</pre>
            </div>
            <div class="hint">将此提示词发给 AI（如 ChatGPT/Claude）并附带你的原始课表。</div>
          </div>

          <!-- 输入部分 -->
          <div class="section">
            <div class="section-title">2. 粘贴 CSV 数据</div>
            <div class="scroll-box input-box">
              <van-field
                v-model="csvInput"
                type="textarea"
                placeholder="在此粘贴 AI 输出的 CSV 内容..."
                :border="false"
                rows="4"
              />
            </div>
          </div>
        </div>

        <div class="card-footer">
          <van-button block type="primary" @click="handleImport">立即导入</van-button>
          <van-button block plain @click="showImportPopup = false" style="margin-top: 8px">取消</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.import-view {
  padding: 40px 20px;
  padding-top: calc(40px + env(safe-area-inset-top, 0px));
}

.page-title {
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 8px;
  color: #323233;
}

.page-desc {
  font-size: 14px;
  color: #969799;
  margin-bottom: 32px;
}

.action-btn {
  margin-bottom: 16px;
  height: 50px;
  font-size: 16px;
}

.import-popup {
  width: 90%;
  max-width: 400px;
  max-height: 85vh;
}

.import-card {
  display: flex;
  flex-direction: column;
  background: #fff;
  height: 100%;
}

.card-header {
  padding: 16px;
  font-size: 18px;
  font-weight: bold;
  text-align: center;
  border-bottom: 1px solid #f2f3f5;
}

.card-body {
  padding: 16px;
  overflow-y: auto;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  color: #323233;
  margin-bottom: 8px;
}

.scroll-box {
  border: 1px solid #ebedf0;
  border-radius: 8px;
  background: #f7f8fa;
  max-height: 160px;
  overflow-y: auto;
}

.prompt-box {
  padding: 12px;
}

.prompt-box pre {
  margin: 0;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #646566;
  line-height: 1.5;
}

.hint {
  font-size: 11px;
  color: #969799;
  margin-top: 6px;
}

.input-box {
  background: #fff;
}

.card-footer {
  padding: 16px;
  border-top: 1px solid #f2f3f5;
}

:deep(.van-field__control) {
  font-size: 13px;
  line-height: 1.5;
}
</style>
