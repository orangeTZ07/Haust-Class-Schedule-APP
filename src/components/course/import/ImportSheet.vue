<script setup lang="ts">
import { ref, watch } from "vue";
import { showToast } from "vant";
import { DownloadCloud, FolderOpen, History, Sparkles, X } from "@lucide/vue";

import { useCourses } from "@/composables/useCourses";
import { useTheme } from "@/composables/useTheme";
import { confirmAction } from "@/utils/confirm";
import SegmentedControl from "./SegmentedControl.vue";
import EamsSyncSection from "./EamsSyncSection.vue";
import FileImportSection from "./FileImportSection.vue";
import AiImportSection from "./AiImportSection.vue";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { hasImportSnapshot, restoreImportSnapshot } = useCourses();
const { cssVariables } = useTheme();

type ImportMethod = "eams" | "file" | "ai";

/// 教务系统同步排第一，也是每次打开时默认选中的那个。刻意不记住上次的选择：这是最省事的一条路，
/// 不该因为某次走了别的办法，下次还得手动切回来。
const method = ref<ImportMethod>("eams");

const methodOptions = [
  { value: "eams" as const, label: "教务同步", icon: DownloadCloud, badge: "推荐" },
  { value: "file" as const, label: "选文件", icon: FolderOpen },
  { value: "ai" as const, label: "AI 识别", icon: Sparkles },
];

watch(() => props.show, (open) => {
  if (open) method.value = "eams";
});

const close = () => emit("update:show", false);

/// Puts the timetable data back to how it was right after the last import.
///
/// Kept separate from 重置课表视图 on purpose: that one only moves the view and is harmless, while
/// this discards everything added or edited since the import. One button cannot be both, and
/// hiding a destructive action behind the word "reset" is how people lose work.
///
/// It lives in this sheet, at the bottom, because it is the other half of importing: the snapshot
/// it restores is the one the last import took.
const restoreImportedTimetable = async () => {
  if (!hasImportSnapshot.value) {
    showToast("还没有可恢复的导入记录，需要先导入一次课表");
    return;
  }
  const confirmed = await confirmAction({
    title: "恢复到上次导入时的课表？",
    message: "导入之后新增、修改或删除的课程都会被覆盖，且无法撤销。",
    confirmText: "恢复",
    danger: true,
  });
  if (!confirmed) return;

  const result = await restoreImportSnapshot();
  showToast({ message: result.message, type: result.success ? "success" : "fail" });
};
</script>

<template>
  <van-popup
    :show="props.show"
    position="bottom"
    round
    class="import-sheet"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.25)' }"
    @update:show="emit('update:show', $event)"
  >
    <!-- The edge swipe that opens the sidebar listens on the whole home view. Inside the sheet a
         sideways drag (selecting text, scrolling the prompt box) must not start it. -->
    <div class="sheet" @touchstart.stop>
      <header class="sheet-head">
        <h2 class="sheet-title">导入课表</h2>
        <button class="close-btn" aria-label="关闭" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="sheet-tabs">
        <SegmentedControl v-model="method" :options="methodOptions" />
      </div>

      <div class="sheet-body">
        <!-- v-show rather than v-if: switching tabs must not throw away what was typed. -->
        <EamsSyncSection v-show="method === 'eams'" @use-file="method = 'file'" />
        <FileImportSection v-show="method === 'file'" />
        <AiImportSection v-show="method === 'ai'" @close="close" />
      </div>

      <footer class="sheet-foot">
        <button class="restore-btn" :class="{ 'is-empty': !hasImportSnapshot }" @click="restoreImportedTimetable">
          <History :size="15" />
          <span>恢复到上次导入时的课表</span>
        </button>
      </footer>
    </div>
  </van-popup>
</template>

<style scoped>
.import-sheet {
  /* A fixed height, so the sheet does not jump when a shorter tab is selected. */
  height: 88%;
  max-height: 88%;
  overflow: hidden;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--theme-bg-color) 94%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 12px 20px;
}

.sheet-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--theme-body-text);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
  opacity: 0.7;
}

.sheet-tabs {
  padding: 0 16px 12px;
}

.sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 20px;
}

.sheet-foot {
  padding: 8px 16px;
  padding-bottom: calc(8px + var(--safe-bottom));
  border-top: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

.restore-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--theme-body-text);
  font-size: 13px;
  opacity: 0.7;
}

.restore-btn:active {
  background: color-mix(in srgb, var(--theme-body-text) 8%, transparent);
}

/* Still tappable (it explains why there is nothing to restore), just visibly out of play. */
.restore-btn.is-empty {
  opacity: 0.35;
}
</style>
