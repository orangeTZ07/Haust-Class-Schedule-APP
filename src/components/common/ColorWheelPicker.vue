<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTheme } from "@/composables/useTheme";
import { contrastColor, hexToHsv, hsvToHex, parseHex, pushRecent, type Hsv } from "@/utils/color";
import {
  SQUARE_HALF,
  hitZone,
  hueFromPoint,
  ringHandle,
  squareHandle,
  svFromPoint,
  type WheelPoint,
  type WheelZone,
} from "@/utils/colorWheel";

// Bottom sheet for picking one colour: a hue ring, a saturation/value square inside it, the
// old and new colour side by side, a hex field, theme and recent swatches.
//
// It never writes the colour anywhere itself. While the user drags it emits `preview` (at most
// once per frame) and the owner decides how to show that; `confirm` carries the final "#rrggbb",
// and `cancel` means "put the original back". Closing the sheet any other way (tapping the dim
// area, Esc, being unmounted) counts as cancel, so a preview can never be left behind.
//
// The wheel is Pointer Events on one element with `touch-action: none`, like the image
// cropper, so touch and mouse behave the same and the page never scrolls under a finger.

const props = defineProps<{
  show: boolean;
  /// The colour being edited, "#rrggbb". Read when the sheet opens.
  color: string;
  title?: string;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  preview: [hex: string];
  confirm: [hex: string];
  cancel: [];
}>();

const RECENT_KEY = "course-mngr-recent-colors";
const RECENT_MAX = 8;

const { themeConfig, isDark } = useTheme();

const original = ref("#000000");
/// The working colour. HSV, not hex: converting to hex on every move would round, and dragging
/// down to black (or left to white) would throw the hue away.
const hsv = ref<Hsv>({ h: 0, s: 0, v: 0 });
const hexText = ref("#000000");
const recents = ref<string[]>([]);
const dragging = ref<WheelZone | null>(null);
const wheelEl = ref<HTMLElement | null>(null);

const current = computed(() => hsvToHex(hsv.value));
const hueColor = computed(() => hsvToHex({ h: hsv.value.h, s: 1, v: 1 }));
const changed = computed(() => current.value !== original.value);

const percent = (p: WheelPoint) => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` });
const hueHandleStyle = computed(() => ({
  ...percent(ringHandle(hsv.value.h)),
  background: hueColor.value,
}));
const svHandleStyle = computed(() => ({
  ...percent(squareHandle(hsv.value.s, hsv.value.v)),
  background: current.value,
}));
const squareStyle = {
  left: `${(0.5 - SQUARE_HALF) * 100}%`,
  top: `${(0.5 - SQUARE_HALF) * 100}%`,
  width: `${SQUARE_HALF * 200}%`,
  height: `${SQUARE_HALF * 200}%`,
};

/// The colours the current theme is made of, without duplicates. The theme is not touched
/// while the sheet is open (the owner previews outside it), so this list is stable.
const themeSwatches = computed(() => {
  const c = themeConfig.value;
  const all = [c.bgColor, c.headerBgColor, c.headerTextColor, c.bodyTextColor, c.gridLineColor, c.cardBorderColor]
    .map(parseHex)
    .filter((hex): hex is string => !!hex);
  return [...new Set(all)];
});

/// Typed text that is long enough to be a colour but is not one, e.g. "#12345g".
const hexInvalid = computed(() => {
  const text = hexText.value.trim();
  const full = text.startsWith("#") ? 7 : 6;
  return text.length >= full && !parseHex(text);
});

const loadRecents = (): string[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .map((item) => (typeof item === "string" ? parseHex(item) : null))
      .filter((hex): hex is string => !!hex)
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
};

const saveRecents = (list: string[]) => {
  recents.value = list;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked: the list just lives for this session
  }
};

// ---- session ----

/// True from opening until confirm/cancel has been emitted.
let active = false;
let previewFrame = 0;
let dragId = -1;
let dragRect: DOMRect | null = null;

const schedulePreview = () => {
  if (!active || previewFrame) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = 0;
    if (active) emit("preview", current.value);
  });
};

const applyHsv = (next: Hsv, syncText = true) => {
  hsv.value = next;
  if (syncText) hexText.value = hsvToHex(next);
  schedulePreview();
};

/// Hex to HSV for a colour the user picked or typed. A gray has no hue of its own, so the
/// hue stays where it was and the ring handle does not jump to red.
const hsvFromHex = (hex: string): Hsv | null => {
  const next = hexToHsv(hex);
  if (!next) return null;
  if (next.s === 0 || next.v === 0) next.h = hsv.value.h;
  return next;
};

const begin = () => {
  original.value = parseHex(props.color) ?? "#000000";
  hsv.value = hexToHsv(original.value) ?? { h: 0, s: 0, v: 0 };
  hexText.value = original.value;
  recents.value = loadRecents();
  dragging.value = null;
  dragId = -1;
  active = true;
};

const finish = () => {
  active = false;
  cancelAnimationFrame(previewFrame);
  previewFrame = 0;
};

const confirm = () => {
  if (!active) return;
  const hex = current.value;
  finish();
  if (hex !== original.value) saveRecents(pushRecent(recents.value, hex));
  emit("confirm", hex);
  emit("update:show", false);
};

const cancel = () => {
  if (!active) return;
  finish();
  emit("cancel");
  emit("update:show", false);
};

watch(
  () => props.show,
  (open) => {
    if (open) begin();
    else cancel();
  },
  { immediate: true },
);

const onPopupShow = (value: boolean) => {
  if (!value) cancel();
};

const onKeydown = (e: KeyboardEvent) => {
  if (props.show && e.key === "Escape") cancel();
};

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  cancel();
});

// ---- wheel gestures ----

const fractionOf = (e: PointerEvent): WheelPoint => ({
  x: (e.clientX - dragRect!.left) / dragRect!.width,
  y: (e.clientY - dragRect!.top) / dragRect!.height,
});

const applyPoint = (zone: WheelZone, p: WheelPoint) => {
  if (zone === "ring") {
    applyHsv({ ...hsv.value, h: hueFromPoint(p.x, p.y) });
  } else {
    const { s, v } = svFromPoint(p.x, p.y);
    applyHsv({ ...hsv.value, s, v });
  }
};

const onWheelDown = (e: PointerEvent) => {
  const el = wheelEl.value;
  if (!el || dragId !== -1) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  // The sheet does not move while a finger is on the wheel, so the box is measured once.
  dragRect = el.getBoundingClientRect();
  const p = fractionOf(e);
  const zone = hitZone(p.x, p.y);
  if (!zone) return;
  dragId = e.pointerId;
  dragging.value = zone;
  el.setPointerCapture(e.pointerId);
  applyPoint(zone, p);
};

const onWheelMove = (e: PointerEvent) => {
  if (e.pointerId !== dragId || !dragging.value) return;
  applyPoint(dragging.value, fractionOf(e));
};

const onWheelEnd = (e: PointerEvent) => {
  if (e.pointerId !== dragId) return;
  dragId = -1;
  dragging.value = null;
};

// ---- hex field and swatches ----

/// Typing applies the colour as soon as six digits are there. Three-digit shorthand waits for
/// Enter or leaving the field: "#123" is a valid colour on the way to typing "#123456", and
/// flashing it in between would be noise.
const onHexInput = (e: Event) => {
  hexText.value = (e.target as HTMLInputElement).value;
  if (!/^#?[0-9a-f]{6}$/i.test(hexText.value.trim())) return;
  const hex = parseHex(hexText.value);
  const next = hex && hex !== current.value ? hsvFromHex(hex) : null;
  if (next) applyHsv(next, false);
};

/// Leaving the field settles it: a valid colour (shorthand included) is applied, anything
/// else is dropped and the field shows the colour as it actually is.
const onHexBlur = () => {
  const hex = parseHex(hexText.value);
  const next = hex && hex !== current.value ? hsvFromHex(hex) : null;
  if (next) applyHsv(next);
  else hexText.value = current.value;
};

const pick = (hex: string) => {
  const next = hsvFromHex(hex);
  if (next) applyHsv(next);
};
</script>

<template>
  <van-popup
    :show="props.show"
    position="bottom"
    round
    teleport="body"
    class="color-sheet"
    :class="{ 'is-dark': isDark }"
    :overlay-style="{ backgroundColor: 'rgba(0, 0, 0, 0.18)' }"
    @update:show="onPopupShow"
  >
    <div class="sheet">
      <header class="sheet-head">
        <h2 class="sheet-title">{{ props.title || "选择颜色" }}</h2>
      </header>

      <div
        ref="wheelEl"
        class="wheel"
        :class="{ 'is-dragging-ring': dragging === 'ring', 'is-dragging-square': dragging === 'square' }"
        @pointerdown="onWheelDown"
        @pointermove="onWheelMove"
        @pointerup="onWheelEnd"
        @pointercancel="onWheelEnd"
        @lostpointercapture="onWheelEnd"
        @contextmenu.prevent
      >
        <div class="ring" />
        <div class="square" :style="[squareStyle, { '--hue': hueColor }]" />
        <span class="handle ring-handle" :style="hueHandleStyle" />
        <span class="handle square-handle" :style="svHandleStyle" />
      </div>

      <div class="value-row">
        <div class="compare" :class="{ 'is-changed': changed }">
          <button
            type="button"
            class="compare-half old"
            :style="{ background: original, color: contrastColor(original) }"
            :disabled="!changed"
            aria-label="恢复原来的颜色"
            @click="pick(original)"
          >
            原色
          </button>
          <div class="compare-half new" :style="{ background: current, color: contrastColor(current) }">新色</div>
        </div>
        <input
          class="hex-input"
          :class="{ 'is-invalid': hexInvalid }"
          :value="hexText"
          type="text"
          inputmode="text"
          maxlength="9"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-label="十六进制颜色"
          @input="onHexInput"
          @blur="onHexBlur"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
      </div>

      <div class="swatches">
        <div class="swatch-line">
          <span class="swatch-label">主题色</span>
          <div class="swatch-row">
            <button
              v-for="hex in themeSwatches"
              :key="hex"
              type="button"
              class="swatch"
              :class="{ 'is-active': hex === current }"
              :style="{ background: hex }"
              :aria-label="hex"
              @click="pick(hex)"
            />
          </div>
        </div>

        <div v-if="recents.length" class="swatch-line">
          <span class="swatch-label">最近用过</span>
          <div class="swatch-row">
            <button
              v-for="hex in recents"
              :key="hex"
              type="button"
              class="swatch"
              :class="{ 'is-active': hex === current }"
              :style="{ background: hex }"
              :aria-label="hex"
              @click="pick(hex)"
            />
          </div>
        </div>
      </div>

      <footer class="sheet-foot">
        <button type="button" class="btn ghost" @click="cancel">取消</button>
        <button type="button" class="btn primary" @click="confirm">确定</button>
      </footer>
    </div>
  </van-popup>
</template>

<style scoped>
.color-sheet {
  /* Same motion tokens (with fallbacks) as the image cropper. */
  --c-ease-spring: var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  --c-ease-smooth: var(--ease-smooth, cubic-bezier(0.22, 1, 0.36, 1));
  --c-dur-fast: var(--dur-fast, 180ms);
  --c-dur-base: var(--dur-base, 300ms);

  /* The sheet keeps its own palette, picked by light/dark mode only. The colours being edited
     (page background, text) change under the user's finger, and a sheet built from them could
     turn unreadable halfway through a drag. */
  --cs-bg: #ffffff;
  --cs-text: #1f2328;
  --cs-muted: rgba(31, 35, 40, 0.55);
  --cs-line: rgba(0, 0, 0, 0.1);
  --cs-field: rgba(0, 0, 0, 0.05);

  --van-popup-background: var(--cs-bg);
  /* Vant resolves its own transition at :root, so the slide has to be set here. */
  --van-popup-transition: transform var(--c-dur-base);
  --van-ease-out: var(--c-ease-smooth);

  color: var(--cs-text);
  overflow: hidden;
  /* Wide windows (desktop) get a sheet of phone width in the middle instead of one stretched
     across the screen. */
  width: min(100%, 520px);
  left: 0;
  right: 0;
  margin: 0 auto;
  /* The dim behind is light and unblurred on purpose (see overlay-style): the page behind
     must stay readable, it is where the live preview shows. So the sheet draws its own edge. */
  border-top: 1px solid var(--cs-line);
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
}

.color-sheet.is-dark {
  --cs-bg: #1b1b1f;
  --cs-text: #f2f2f3;
  --cs-muted: rgba(242, 242, 243, 0.55);
  --cs-line: rgba(255, 255, 255, 0.14);
  --cs-field: rgba(255, 255, 255, 0.08);
}

.sheet {
  padding: 4px 20px calc(14px + env(safe-area-inset-bottom, 0px));
}

.sheet-head {
  padding: 14px 0 10px;
  text-align: center;
}

.sheet-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

/* ---- wheel ---- */

.wheel {
  position: relative;
  /* As large as fits, but on a short screen the wheel shrinks first so the sheet stays around
     70% of the height and the page behind keeps showing the preview. 270px is everything in
     the sheet that is not the wheel. */
  width: max(170px, min(300px, calc(100vw - 80px), calc(72vh - 270px)));
  width: max(170px, min(300px, calc(100vw - 80px), calc(72dvh - 270px)));
  aspect-ratio: 1;
  margin: 0 auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: crosshair;
}

/* Hue ring: a conic gradient with the middle cut out. 73% of the radius is where the ring's
   inner edge sits (RING_INNER / RING_OUTER in utils/colorWheel.ts). */
.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    hsl(0, 100%, 50%),
    hsl(60, 100%, 50%),
    hsl(120, 100%, 50%),
    hsl(180, 100%, 50%),
    hsl(240, 100%, 50%),
    hsl(300, 100%, 50%),
    hsl(360, 100%, 50%)
  );
  -webkit-mask: radial-gradient(farthest-side, transparent 72.9%, #000 73%);
  mask: radial-gradient(farthest-side, transparent 72.9%, #000 73%);
}

/* Saturation left to right, value bottom to top, over the current hue. */
.square {
  position: absolute;
  border-radius: 8px;
  background:
    linear-gradient(to top, #000, rgba(0, 0, 0, 0)),
    linear-gradient(to right, #fff, var(--hue));
  box-shadow: 0 0 0 1px var(--cs-line);
}

/* Handles only animate their size: moving them must follow the finger with no lag. */
.handle {
  position: absolute;
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  border: 3px solid #fff;
  border-radius: 50%;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.25),
    0 2px 6px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  transition: transform var(--c-dur-fast) var(--c-ease-spring);
}

.wheel.is-dragging-ring .ring-handle,
.wheel.is-dragging-square .square-handle {
  transform: scale(1.3);
}

/* ---- old / new, hex ---- */

.value-row {
  display: flex;
  gap: 12px;
  margin-top: 14px;
}

.compare {
  display: flex;
  flex: none;
  width: 132px;
  height: 44px;
  overflow: hidden;
  border-radius: 12px;
  box-shadow: 0 0 0 1px var(--cs-line);
}

.compare-half {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  appearance: none;
  transition: background-color var(--c-dur-fast) ease;
}

.compare-half.old {
  cursor: pointer;
}

.compare-half.old:disabled {
  cursor: default;
}

.hex-input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  outline: none;
  background: var(--cs-field);
  color: var(--cs-text);
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 15px;
  letter-spacing: 0.5px;
  transition: border-color var(--c-dur-fast) ease;
}

.hex-input:focus {
  border-color: var(--color-primary, #1989fa);
}

.hex-input.is-invalid {
  border-color: #ee0a24;
}

/* ---- swatches ---- */

.swatches {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.swatch-line {
  display: flex;
  align-items: center;
  gap: 12px;
}

.swatch-label {
  flex: none;
  width: 52px;
  font-size: 12px;
  color: var(--cs-muted);
}

.swatch-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.swatch {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--cs-line);
  appearance: none;
  cursor: pointer;
  transition:
    transform var(--c-dur-fast) var(--c-ease-spring),
    box-shadow var(--c-dur-fast) ease;
}

.swatch:active {
  transform: scale(0.88);
}

.swatch.is-active {
  box-shadow:
    inset 0 0 0 1px var(--cs-line),
    0 0 0 2px var(--cs-bg),
    0 0 0 4px var(--color-primary, #1989fa);
}

/* ---- footer ---- */

.sheet-foot {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.btn {
  flex: 1;
  height: 46px;
  border: 0;
  border-radius: 23px;
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  color: var(--cs-text);
  cursor: pointer;
  appearance: none;
  transition: transform var(--c-dur-fast) var(--c-ease-smooth);
}

.btn:active {
  transform: scale(0.97);
}

.btn.ghost {
  background: var(--cs-field);
}

.btn.primary {
  flex: 1.4;
  background: var(--color-primary, #1989fa);
  color: #fff;
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .handle,
  .swatch,
  .btn {
    transition: none;
  }
}
</style>
