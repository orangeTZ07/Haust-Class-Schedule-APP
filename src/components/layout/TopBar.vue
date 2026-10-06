<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronDown, ChevronLeft, ChevronRight, Menu, Trash2 } from "@lucide/vue";
import { useToday } from "@/composables/useToday";

const props = defineProps<{
  showTrashTarget?: boolean;
  trashTargetActive?: boolean;
  currentWeek: number;
  totalWeeks: number;
}>();

const emit = defineEmits<{
  toggleSidebar: [];
  changeWeek: [week: number];
}>();

const { actualWeek } = useToday();

const topBarRef = ref<HTMLElement | null>(null);
const weekLabelRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const weekPickerOpen = ref(false);
const popoverStyle = ref<Record<string, string>>({});

const weekOptions = computed(() => {
  return Array.from({ length: props.totalWeeks }, (_, index) => index + 1);
});

/// The week the calendar says it is, if it is one the picker can reach. Beyond the last week (the
/// semester is over) or before the first there is nothing to jump to, so the markers stay away.
const realWeek = computed(() => {
  const week = actualWeek.value;
  return week !== null && week >= 1 && week <= props.totalWeeks ? week : null;
});

const viewingRealWeek = computed(() => realWeek.value !== null && realWeek.value === props.currentWeek);

/// Which way 本周 lies from the week on screen, so the chip's arrow points at it.
const realWeekIsAhead = computed(() => realWeek.value !== null && realWeek.value > props.currentWeek);

const handleToggle = () => {
  weekPickerOpen.value = false;
  emit("toggleSidebar");
};

const changeWeek = (week: number) => {
  emit("changeWeek", week);
  weekPickerOpen.value = false;
};

const jumpToRealWeek = () => {
  if (realWeek.value !== null) emit("changeWeek", realWeek.value);
};

/// The popover lives in <body>, outside the bar. Inside it, the bar's own backdrop-filter made the
/// bar the backdrop root for the popover, so the blur stopped at the bar's edge and the part hanging
/// over the timetable was only translucent, with the grid lines showing through. That is also why
/// it has to be placed by hand: position: fixed from the trigger's box, kept inside the screen.
const placePopover = () => {
  const trigger = weekLabelRef.value;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const margin = 16;
  const width = Math.min(260, viewportWidth - margin * 2);
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), viewportWidth - width - margin);
  const top = rect.bottom + 8;

  popoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `min(260px, calc(100dvh - ${top}px - ${margin}px - var(--safe-bottom)))`,
    // Grow out of the button rather than out of the popover's own middle.
    transformOrigin: `${rect.left + rect.width / 2 - left}px 0`,
  };
};

const toggleWeekPicker = async () => {
  if (weekPickerOpen.value) {
    weekPickerOpen.value = false;
    return;
  }

  placePopover();
  weekPickerOpen.value = true;

  // With more than twenty weeks the list scrolls; start with the week on screen in view.
  await nextTick();
  popoverRef.value?.querySelector(".week-option.active")?.scrollIntoView({ block: "nearest" });
};

/// Pressing anywhere outside the bar and the popover closes it. pointerdown rather than click: the
/// edge swipe that opens the drawer never produces a click, and the popover used to stay floating
/// over it.
const handleOutsidePress = (event: PointerEvent) => {
  if (!weekPickerOpen.value) return;
  const target = event.target;
  if (target instanceof Node && (topBarRef.value?.contains(target) || popoverRef.value?.contains(target))) return;
  weekPickerOpen.value = false;
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") weekPickerOpen.value = false;
};

const closePicker = () => {
  weekPickerOpen.value = false;
};

watch(() => props.showTrashTarget, (visible) => {
  if (visible) {
    weekPickerOpen.value = false;
  }
});

onMounted(() => {
  document.addEventListener("pointerdown", handleOutsidePress, true);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", closePicker);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleOutsidePress, true);
  document.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("resize", closePicker);
});
</script>

<template>
  <div ref="topBarRef" class="top-bar" :class="{ 'is-trash-visible': showTrashTarget }">
    <div class="left">
      <div class="menu-btn" @click="handleToggle">
        <Menu :size="22" />
      </div>
      <span class="title">课程表</span>
    </div>

    <div class="week-switcher" aria-label="切换周目">
      <button
        ref="weekLabelRef"
        type="button"
        class="week-label"
        :class="{ active: weekPickerOpen }"
        :aria-expanded="weekPickerOpen"
        @click="toggleWeekPicker"
      >
        第 {{ currentWeek }} 周
        <ChevronDown :size="14" class="week-label-icon" :class="{ active: weekPickerOpen }" />
      </button>

      <!-- Beside the label, not inside it, and absolutely placed: the label has to stay centred in
           the bar whether or not a chip is showing. -->
      <div class="week-chip-slot">
        <transition name="week-chip" mode="out-in">
          <span v-if="viewingRealWeek" key="now" class="week-chip is-tag">本周</span>
          <button
            v-else-if="realWeek !== null"
            key="back"
            type="button"
            class="week-chip is-action"
            @click="jumpToRealWeek"
          >
            <ChevronLeft v-if="!realWeekIsAhead" :size="12" />
            <span>回到本周</span>
            <ChevronRight v-if="realWeekIsAhead" :size="12" />
          </button>
        </transition>
      </div>
    </div>

    <transition name="trash-pop">
      <div
        v-if="showTrashTarget"
        class="trash-target"
        :class="{ 'is-active': trashTargetActive }"
        data-trash-target="schedule-delete"
        aria-label="拖到这里删除课段"
      >
        <Trash2 :size="18" />
      </div>
    </transition>

    <Teleport to="body">
      <transition name="week-picker">
        <div v-if="weekPickerOpen" ref="popoverRef" class="week-picker-popover" :style="popoverStyle">
          <button
            v-for="week in weekOptions"
            :key="week"
            type="button"
            class="week-option"
            :class="{ active: week === currentWeek, 'is-real': week === realWeek }"
            :aria-current="week === realWeek ? 'date' : undefined"
            @click="changeWeek(week)"
          >
            <span>第 {{ week }} 周</span>
            <span v-if="week === realWeek" class="week-option-tag">本周</span>
          </button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  /* env(safe-area-inset-top) comes back as 0 inside the Android WebView, so the bar sat 12px
     from the screen edge and its controls ended up underneath the status bar, where the
     system swallows the tap -- 第几周 and the menu were awkward or impossible to hit. The
     floor keeps them reachable; max() still honours a real inset when one is reported. */
  padding-top: calc(12px + max(var(--safe-top), 26px));
  background: color-mix(in srgb, var(--theme-header-bg) 85%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 50%, transparent);
  position: sticky;
  top: 0;
  z-index: 50;
  transition: background-color var(--dur-slow) ease;
}

.top-bar.is-trash-visible {
  z-index: 260;
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.menu-btn {
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  color: var(--theme-header-text);
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--dur-base) var(--ease-spring),
    background-color var(--dur-fast) ease-out;
}

@media (hover: hover) {
  .menu-btn:hover {
    background: color-mix(in srgb, var(--theme-header-text) 10%, transparent);
    transform: scale(1.05);
  }
}

.menu-btn:active {
  transform: scale(var(--press-scale));
  transition-duration: 90ms, var(--dur-fast);
  transition-timing-function: ease-out;
}

.title {
  font-size: 18px;
  font-weight: 700;
  color: var(--theme-header-text);
}

.week-switcher {
  position: absolute;
  left: 50%;
  top: calc(12px + max(var(--safe-top), 26px));
  transform: translateX(-50%);
  height: 34px;
  display: flex;
  align-items: center;
}

.week-label {
  min-width: 0;
  height: 30px;
  border: none;
  border-radius: 7px;
  color: var(--theme-header-text);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  background: transparent;
  cursor: pointer;
  transition:
    transform var(--dur-base) var(--ease-spring),
    background-color var(--dur-fast) ease-out;
}

.week-label.active {
  background: color-mix(in srgb, var(--theme-header-text) 8%, transparent);
}

.week-label-icon {
  opacity: 0.7;
  transition: transform var(--dur-base) var(--ease-spring);
}

.week-label-icon.active {
  transform: rotate(180deg);
}

/* ---- 本周 chip ---- */

.week-chip-slot {
  position: absolute;
  left: 100%;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding-left: 4px;
}

/* header-text, not the accent: on the Vant preset the bar itself is the accent colour, and a chip
   in the accent would disappear into it. header-text is the one colour guaranteed to read here. */
.week-chip {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  color: var(--theme-header-text);
  transform-origin: left center;
}

.week-chip.is-action {
  padding: 0 6px;
  background: color-mix(in srgb, var(--theme-header-text) 14%, transparent);
  cursor: pointer;
}

.week-chip.is-tag {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-header-text) 32%, transparent);
  opacity: 0.85;
}

.week-chip-enter-active {
  transition:
    transform var(--dur-slow) var(--ease-spring),
    opacity var(--dur-fast) ease-out;
}

.week-chip-leave-active {
  transition:
    transform var(--dur-fast) var(--ease-exit),
    opacity var(--dur-fast) var(--ease-exit);
}

.week-chip-enter-from,
.week-chip-leave-to {
  opacity: 0;
  transform: translateX(-6px) scale(0.8);
}

/* ---- week picker ---- */

/* Rendered into <body> (see the script), so none of the bar's own stacking or filter applies and
   the blur sees the real timetable behind it. */
.week-picker-popover {
  position: fixed;
  z-index: 120;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  padding: 10px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 12%, transparent);
  background: color-mix(in srgb, var(--theme-bg-color) 80%, transparent);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.16),
    0 2px 8px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  will-change: transform, opacity;
}

/* Without backdrop-filter a translucent panel is just a dirty one, so fall back to solid. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .week-picker-popover {
    background: var(--theme-bg-color);
  }
}

.week-option {
  min-width: 0;
  height: 36px;
  border: none;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: color-mix(in srgb, var(--theme-body-text) 7%, transparent);
  color: var(--theme-body-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
}

/* The real week, when it is not the one selected: outlined in the accent with its own label, so
   "where I am" and "where today is" never look alike. */
.week-option.is-real {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-accent) 55%, transparent);
}

.week-option.active {
  background: var(--theme-accent);
  color: var(--theme-on-accent);
  box-shadow: none;
}

.week-option-tag {
  font-size: 9px;
  font-weight: 700;
  color: var(--theme-accent);
}

.week-option.active .week-option-tag {
  color: var(--theme-on-accent);
  opacity: 0.8;
}

.week-picker-enter-active {
  transition:
    transform var(--dur-slow) var(--ease-spring),
    opacity var(--dur-fast) ease-out;
}

.week-picker-leave-active {
  transition:
    transform var(--dur-fast) var(--ease-exit),
    opacity var(--dur-fast) var(--ease-exit);
}

.week-picker-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(-6px);
}

.week-picker-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* ---- trash target ---- */

.trash-target {
  /* 36px was a small target for a finger and it is also the visual promise the drop test
     keeps (see TRASH_TARGET_SLOP in WeekGrid.vue). */
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--theme-grid-line-color) 40%, transparent);
  background: color-mix(in srgb, var(--theme-header-bg) 74%, transparent);
  color: color-mix(in srgb, var(--theme-header-text) 82%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition:
    transform var(--dur-base) var(--ease-spring),
    color var(--dur-fast) ease-out,
    border-color var(--dur-fast) ease-out,
    background-color var(--dur-fast) ease-out;
}

/* Bigger and bouncier than a plain press: this is the "let go here and it is gone" cue. */
.trash-target.is-active {
  transform: scale(1.12);
  color: #ee0a24;
  border-color: color-mix(in srgb, #ee0a24 68%, transparent);
  background: color-mix(in srgb, #ee0a24 14%, var(--theme-header-bg));
  box-shadow:
    0 0 0 4px color-mix(in srgb, #ee0a24 10%, transparent),
    0 8px 18px rgba(238, 10, 36, 0.16);
}

.trash-pop-enter-active {
  transition:
    transform var(--dur-slow) var(--ease-spring),
    opacity var(--dur-fast) ease-out;
}

.trash-pop-leave-active {
  transition:
    transform var(--dur-fast) var(--ease-exit),
    opacity var(--dur-fast) var(--ease-exit);
}

.trash-pop-enter-from,
.trash-pop-leave-to {
  opacity: 0;
  transform: scale(0.6);
}
</style>
