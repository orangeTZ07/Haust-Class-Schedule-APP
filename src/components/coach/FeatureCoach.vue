<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X } from "@lucide/vue";
import {
  chooseAnchorIndex,
  COACH_CUE_LABEL,
  courseBlockAnchorState,
  emptyCellAnchorState,
  placeBubble,
  type CoachPresentation,
  type Insets,
  type Rect
} from "@/utils/featureCoach";

const props = defineProps<{
  step: CoachPresentation | null;
  /// cue: the feature is off the home screen, point at the way in.
  /// spotlight: point at the feature itself.
  phase: "cue" | "spotlight";
  isLast?: boolean;
}>();

const emit = defineEmits<{
  next: [];
  skip: [];
  close: [];
  followCue: [];
  /// The step has nowhere honest to point (no empty cell). Do not mark it seen.
  unanchored: [];
}>();

const bubbleRef = ref<HTMLElement | null>(null);
const bubbleStyle = ref<Record<string, string>>({});
const ringStyle = ref<Record<string, string>>({});
const ringVisible = ref(false);
const placed = ref(false);

let frame = 0;
let reportedMissing = false;

const readInsets = (): Insets => {
  const style = getComputedStyle(document.documentElement);
  const px = (name: string) => {
    const value = parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? value : 0;
  };
  return {
    top: px("--safe-top"),
    right: px("--safe-right"),
    bottom: px("--safe-bottom"),
    left: px("--safe-left")
  };
};

const asRect = (dom: DOMRect): Rect => ({
  top: dom.top,
  left: dom.left,
  width: dom.width,
  height: dom.height
});

const onScreen = (rect: DOMRect) => rect.width > 0 && rect.right > 8 && rect.bottom > 8 && rect.left < window.innerWidth - 8;

/// Empty cells that are actually free. A course that starts higher and spans this period
/// does not get the attribute, so the bubble cannot land on a filled slot.
const emptyCellAnchor = (): Rect | null => {
  const body = document.querySelector(".week-grid .body");
  const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-coach-empty='true']"));
  if (!body || cells.length === 0) return null;
  const view = asRect(body.getBoundingClientRect());
  const rects = cells.map(cell => cell.getBoundingClientRect());
  const index = chooseAnchorIndex(rects.map(asRect), view);
  if (index < 0) return null;
  const rect = rects[index];
  if (!onScreen(rect)) {
    cells[index].scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  return asRect(cells[index].getBoundingClientRect());
};

const courseBlockAnchor = (): Rect | null => {
  const body = document.querySelector(".week-grid .body");
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>("[data-coach-course='true']:not(.orbit-card)")
  );
  if (!body || blocks.length === 0) return null;
  const view = asRect(body.getBoundingClientRect());
  const rects = blocks.map(block => block.getBoundingClientRect());
  const index = chooseAnchorIndex(rects.map(asRect), view);
  if (index < 0) return null;
  const rect = rects[index];
  if (!onScreen(rect)) {
    blocks[index].scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  return asRect(blocks[index].getBoundingClientRect());
};

const menuAnchor = (): Rect | null => {
  const el = document.querySelector<HTMLElement>("[data-coach='menu']");
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return onScreen(rect) ? asRect(rect) : null;
};

const queryAnchor = (selector: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(selector);

const visibleRect = (el: HTMLElement | null): Rect | null => {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return onScreen(rect) ? asRect(rect) : null;
};

const revealAnchor = (el: HTMLElement | null): Rect | null => {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (!onScreen(rect)) {
    el.scrollIntoView({ block: "center", inline: "nearest" });
  }
  return visibleRect(el);
};

const unionAnchors = (nodes: HTMLElement[]): Rect | null => {
  if (nodes.length === 0) return null;
  for (const node of nodes) {
    if (!onScreen(node.getBoundingClientRect())) {
      node.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }
  const rects = nodes.map(node => node.getBoundingClientRect()).filter(onScreen);
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map(rect => rect.left));
  const top = Math.min(...rects.map(rect => rect.top));
  const right = Math.max(...rects.map(rect => rect.right));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  return { left, top, width: right - left, height: bottom - top };
};

const appearanceAnchor = (): Rect | null => revealAnchor(queryAnchor("[data-coach='appearance']"));

const periodTimingAnchor = (): Rect | null => {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-coach='period-timing']"));
  if (nodes.length === 0) return null;
  return unionAnchors(nodes);
};

const anchorFor = (step: CoachPresentation): Rect | null => {
  if (step.target === "empty-cell") return emptyCellAnchor();
  if (step.target === "course-block") return courseBlockAnchor();
  if (step.target === "import" && props.phase === "spotlight") return visibleRect(queryAnchor("[data-coach='import']"));
  if (step.target === "appearance" && props.phase === "spotlight") return appearanceAnchor();
  if (step.target === "period-timing" && props.phase === "spotlight") return periodTimingAnchor();
  // Off-home steps start at the menu button. Keep that anchor while the drawer is still sliding.
  return menuAnchor();
};

const measure = () => {
  const step = props.step;
  if (!step) {
    placed.value = false;
    ringVisible.value = false;
    return;
  }

  if (step.target === "empty-cell" || step.target === "course-block") {
    const gridCells = document.querySelectorAll(".week-grid .cell[data-day][data-period]").length;
    const state = step.target === "empty-cell"
      ? emptyCellAnchorState(gridCells, document.querySelectorAll("[data-coach-empty='true']").length)
      : courseBlockAnchorState(
        gridCells,
        document.querySelectorAll("[data-coach-course='true']:not(.orbit-card)").length
      );
    if (state === "waiting") return;
    if (state === "missing") {
      // Week is painted but this step has nowhere honest to point. Skip it for this week/data.
      if (!reportedMissing) {
        reportedMissing = true;
        emit("unanchored");
      }
      return;
    }
  }

  const anchor = anchorFor(step);
  if (!anchor) {
    // Menu / import: the drawer may still be sliding. Keep measuring; do not loop a skip.
    return;
  }
  const bubble = bubbleRef.value;
  const preferred = {
    width: Math.min(280, window.innerWidth - 32),
    height: bubble?.offsetHeight || 168
  };
  const placement = placeBubble(
    anchor,
    { width: window.innerWidth, height: window.innerHeight },
    readInsets(),
    preferred
  );
  bubbleStyle.value = {
    top: `${placement.top}px`,
    left: `${placement.left}px`,
    width: `${placement.width}px`
  };
  ringStyle.value = {
    top: `${anchor.top - 4}px`,
    left: `${anchor.left - 4}px`,
    width: `${anchor.width + 8}px`,
    height: `${anchor.height + 8}px`
  };
  ringVisible.value = true;
  placed.value = true;
};

const tick = () => {
  measure();
  frame = window.requestAnimationFrame(tick);
};

const onKey = (event: KeyboardEvent) => {
  if (event.key === "Escape" && props.step) emit("close");
};

watch(() => [props.step?.id, props.phase], () => {
  reportedMissing = false;
  placed.value = false;
});

onMounted(() => {
  document.addEventListener("keydown", onKey);
  frame = window.requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKey);
  if (frame) window.cancelAnimationFrame(frame);
});
</script>

<template>
  <div v-if="step" class="coach-root">
    <div v-if="ringVisible" class="coach-ring" :style="ringStyle" />
    <div
      ref="bubbleRef"
      class="coach-bubble"
      :class="{ 'is-placed': placed }"
      :style="bubbleStyle"
      role="dialog"
      aria-modal="false"
      :aria-label="step.title"
    >
      <button type="button" class="coach-close" aria-label="关闭" @click="emit('close')">
        <X :size="16" />
      </button>
      <p class="coach-title">{{ step.title }}</p>
      <p class="coach-body">
        <strong v-if="step.prefixNew">新功能</strong>{{ step.prefixNew ? " " : "" }}{{ step.body }}
      </p>
      <div class="coach-actions">
        <button type="button" class="coach-skip" @click="emit('skip')">跳过</button>
        <button
          v-if="step.offHome && phase === 'cue'"
          type="button"
          class="coach-next"
          @click="emit('followCue')"
        >
          {{ COACH_CUE_LABEL }}
        </button>
        <button v-else type="button" class="coach-next" @click="emit('next')">
          {{ isLast ? "知道了" : "下一步" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.coach-root {
  position: fixed;
  inset: 0;
  z-index: 240;
  pointer-events: none;
}

.coach-ring {
  position: fixed;
  border-radius: 12px;
  border: 2px solid var(--theme-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--theme-accent) 28%, var(--theme-bg-color));
  pointer-events: none;
}

/* Solid theme fill, not a translucent wash: custom backgrounds and dark themes have to
   stay readable. The border is what separates the card from a page of the same colour. */
.coach-bubble {
  position: fixed;
  padding: 16px 16px 14px;
  border-radius: 16px;
  color: var(--theme-body-text);
  background: var(--theme-bg-color);
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 22%, var(--theme-bg-color));
  box-shadow:
    0 18px 40px color-mix(in srgb, var(--theme-body-text) 18%, transparent),
    0 2px 8px color-mix(in srgb, var(--theme-body-text) 10%, transparent);
  opacity: 0;
  pointer-events: none;
}

.coach-bubble.is-placed {
  opacity: 1;
  pointer-events: auto;
}

.coach-close {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 9px;
  color: var(--theme-body-text);
  background: color-mix(in srgb, var(--theme-body-text) 8%, var(--theme-bg-color));
}

.coach-title {
  margin: 0 28px 6px 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--theme-body-text);
}

.coach-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--theme-body-text);
}

.coach-body strong {
  font-weight: 800;
}

.coach-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.coach-skip,
.coach-next {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--theme-body-text) 16%, var(--theme-bg-color));
  font-family: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.coach-skip {
  color: var(--theme-body-text);
  background: var(--theme-bg-color);
}

.coach-next {
  flex: 1 1 auto;
  color: var(--theme-on-accent);
  background: var(--theme-accent);
  border-color: var(--theme-accent);
  font-weight: 700;
  line-height: 1.3;
  white-space: normal;
}
</style>
