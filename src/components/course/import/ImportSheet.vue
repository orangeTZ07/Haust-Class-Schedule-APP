<script setup lang="ts">
import { ref, watch } from "vue";
import { DownloadCloud, FolderOpen, Sparkles, X } from "@lucide/vue";

import { useTheme } from "@/composables/useTheme";
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

const { cssVariables } = useTheme();

type ImportMethod = "eams" | "file" | "ai";

/// 教务系统同步排第一，也是每次打开时默认选中的那个。刻意不记住上次的选择：这是最省事的一条路，
/// 不该因为某次走了别的办法，下次还得手动切回来。
const method = ref<ImportMethod>("eams");

/// Whether 教务同步 and 选文件 replace the current timetable instead of importing into a new one.
/// Shared by both tabs, so it lives here, and it is switched off again every time the sheet opens:
/// the default has to be the choice that destroys nothing, whatever the last import did.
const overwrite = ref(false);

const methodOptions = [
  { value: "eams" as const, label: "教务同步", icon: DownloadCloud, badge: "推荐" },
  { value: "file" as const, label: "选文件", icon: FolderOpen },
  { value: "ai" as const, label: "AI 识别", icon: Sparkles },
];

watch(() => props.show, (open) => {
  if (open) {
    method.value = "eams";
    overwrite.value = false;
  }
});

const close = () => emit("update:show", false);
</script>

<template>
  <van-popup
    :show="props.show"
    position="bottom"
    round
    class="app-popup app-popup--sheet import-sheet"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.25)' }"
    @update:show="emit('update:show', $event)"
  >
    <!-- The edge swipe that opens the sidebar listens on the whole home view. Inside the sheet a
         sideways drag (selecting text, scrolling the prompt box) must not start it. -->
    <div class="sheet" @touchstart.stop>
      <div class="app-sheet-handle" />

      <header class="sheet-head">
        <h2 class="sheet-title">导入课表</h2>
        <button class="app-popup-close" aria-label="关闭" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="sheet-tabs">
        <SegmentedControl v-model="method" :options="methodOptions" />
      </div>

      <div class="sheet-body">
        <!-- v-show rather than v-if: switching tabs must not throw away what was typed. -->
        <EamsSyncSection v-show="method === 'eams'" :overwrite="overwrite" @use-file="method = 'file'" @close="close" />
        <FileImportSection v-show="method === 'file'" :overwrite="overwrite" @close="close" />
        <AiImportSection v-show="method === 'ai'" @close="close" />
      </div>

      <!-- AI 识别 has its own 新课表 / 追加 switch, so this one is only for the other two tabs. -->
      <footer v-if="method !== 'ai'" class="sheet-foot">
        <button
          type="button"
          class="overwrite-row"
          role="switch"
          :aria-checked="overwrite"
          @click="overwrite = !overwrite"
        >
          <span class="overwrite-text">
            <span class="overwrite-title">覆盖当前课表</span>
            <span class="overwrite-sub" :class="{ 'is-on': overwrite }">
              {{ overwrite ? "会清空当前课表再导入，导入前会再确认一次" : "关闭时导入为新课表，原来的课表不受影响" }}
            </span>
          </span>
          <span class="switch" :class="{ on: overwrite }" aria-hidden="true">
            <span class="switch-thumb" />
          </span>
        </button>
      </footer>

      <!-- The bottom system bar, so nothing sits under the gesture bar or the navigation buttons. -->
      <div class="app-sheet-safe" />
    </div>
  </van-popup>
</template>

<style scoped>
.import-sheet {
  /* A fixed height, so the sheet does not jump when a shorter tab is selected. */
  height: 88%;
  max-height: 88%;
  overflow: hidden;
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
  padding: 12px 16px 12px 20px;
}

.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--theme-body-text);
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
  border-top: 1px solid color-mix(in srgb, var(--theme-body-text) 10%, transparent);
}

/* A quiet secondary option, not a second main action: it sits in the footer, away from the filled
   button in the tab, and stays off unless the user turns it on. */
.overwrite-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 4px;
  border: none;
  border-radius: 12px;
  background: transparent;
  text-align: left;
  color: var(--theme-body-text);
}

/* A full-width row sinks less than a button. */
.overwrite-row:active {
  transform: scale(0.98);
}

.overwrite-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.overwrite-title {
  font-size: 14px;
  font-weight: 600;
}

.overwrite-sub {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.6;
}

/* Turned on, it says in plain words that something will be lost. */
.overwrite-sub.is-on {
  color: var(--color-danger);
  opacity: 1;
}

.switch {
  position: relative;
  flex-shrink: 0;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-body-text) 18%, transparent);
  transition: background-color var(--dur-base) ease-out;
}

.switch.on {
  background: var(--color-danger);
}

/* The thumb travels on the spring (transform only), so flipping it has a little overshoot. */
.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  transition: transform var(--dur-slow) var(--ease-spring);
}

.switch.on .switch-thumb {
  transform: translateX(18px);
}
</style>
