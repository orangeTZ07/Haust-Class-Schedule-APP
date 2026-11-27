<script setup lang="ts">
import { ref, watch } from "vue";
import { DownloadCloud, Sparkles, X } from "@lucide/vue";

import { useTheme } from "@/composables/useTheme";
import SegmentedControl from "./SegmentedControl.vue";
import EamsSyncSection from "./EamsSyncSection.vue";
import AiImportSection from "./AiImportSection.vue";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
}>();

const { cssVariables } = useTheme();

type ImportMethod = "eams" | "ai";

/// 教务系统同步排第一，也是每次打开时默认选中的那个。刻意不记住上次的选择：这是最省事的一条路，
/// 不该因为某次走了别的办法，下次还得手动切回来。
const method = ref<ImportMethod>("eams");

/// Whether 教务同步 replaces the current timetable instead of importing into a new one.
/// It is switched off again every time the sheet opens:
/// the default has to be the choice that destroys nothing, whatever the last import did.
const overwrite = ref(false);

const methodOptions = [
  { value: "eams" as const, label: "教务同步", icon: DownloadCloud, badge: "推荐" },
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
  <!-- lock-scroll 关掉，滚动交给 .sheet-body 自己（overscroll-behavior: contain 挡住滚动链）。
       vant 的锁滚动在 document 上记录 touchstart，再在 touchmove 里判断「滚到头了没」：
         * 以前这里有 @touchstart.stop，document 收不到 touchstart，起点一直是旧值，面板在顶部时
           往上滑也会被判成往下滑而 preventDefault —— 打开面板常常完全滑不动（issue #53）；
         * 即使起点正确，手指落在输入框、提示词预览这类内层滚动区上时，vant 只看内层，内层到头就
           拦掉，外层面板也跟着滑不动。
       面板后面是 100dvh、overflow: hidden 的主页，遮罩自己也拦 touchmove，没有可以漏出去的滚动。
       侧栏的边缘滑动监听在 .home-view 上，而面板 teleport 到了 body，触摸事件本来就到不了那里。 -->
  <van-popup
    :show="props.show"
    position="bottom"
    round
    teleport="body"
    :lock-scroll="false"
    class="app-popup app-popup--sheet import-sheet"
    :style="cssVariables"
    :overlay-style="{ backdropFilter: 'blur(5px)', backgroundColor: 'rgba(0,0,0,0.25)' }"
    @update:show="emit('update:show', $event)"
  >
    <div class="sheet">
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
        <EamsSyncSection v-show="method === 'eams'" :overwrite="overwrite" @close="close" />
        <AiImportSection v-show="method === 'ai'" @close="close" />
      </div>

      <!-- AI 识别 has its own 新课表 / 追加 switch, so this one is only for 教务同步. -->
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
              {{ overwrite ? "将清空当前课表后导入，导入前需确认" : "导入为新课表，不影响现有课表" }}
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
  /* 键盘弹起时高度也要跟着让出去：bottom 已经上移，高度不减的话头部（连关闭按钮）会被顶出屏幕。
     键盘一收，--kb-inset 回到 0，这里就又等于 88%。 */
  max-height: min(88%, calc(100% - var(--kb-inset, 0px)));
  overflow: hidden;
  /* 从标题、页签、底部开关这些不滚动的地方起手拖动时，不要带出系统的回弹或边缘光晕。 */
  overscroll-behavior: none;
}

/* 键盘弹起时面板本来就矮了一截，「覆盖当前课表」开关又不是输入时要用的：先收起来，把高度留给
   正在填写的表单。键盘一收就回来。 */
:global(.kb-open .import-sheet .sheet-foot) {
  display: none;
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
