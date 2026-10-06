<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useBackClose } from "@/composables/useBackClose";
import {
  MAX_ZOOM,
  clamp,
  clampView,
  coverScale,
  cropRect,
  cropToDataUrl,
  drawPreview,
  initialView,
  loadImage,
  pinchView,
  refitView,
  softView,
  unsoftView,
  zoomAround,
  type CropView,
  type Point,
  type Size,
} from "@/utils/image";

// Full-screen "drag to frame the background" page. It opens as soon as `file` is set and ends
// with exactly one of `confirm` (the finished data URL) or `cancel`.
//
// The frame has the screen's aspect ratio and the home view paints the background with
// `background-size: cover`, so whatever is inside the frame here is what the home screen shows.
//
// Gestures are driven by Pointer Events and only ever write `transform` straight to the canvas
// (no Vue re-render per move, no layout), so dragging stays on the compositor.

const props = defineProps<{
  file: File | null;
}>();

const emit = defineEmits<{
  confirm: [dataUrl: string];
  cancel: [];
}>();

const FRAME_MARGIN = 16;
/// A press is a tap if it is short and barely moved; two taps close together reset the view.
const TAP_MS = 300;
const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_SLOP = 32;
/// Safety net for the rebound if `transitionend` never fires (display:none, reduced motion).
const SETTLE_FALLBACK_MS = 800;

const open = ref(false);
const phase = ref<"loading" | "ready" | "error">("loading");
const busy = ref(false);
const gesturing = ref(false);
const errorText = ref("");
const frameBox = ref({ left: 0, top: 0, width: 0, height: 0 });

const rootEl = ref<HTMLElement | null>(null);
const headerEl = ref<HTMLElement | null>(null);
const footerEl = ref<HTMLElement | null>(null);
const stageEl = ref<HTMLElement | null>(null);
const imageEl = ref<HTMLCanvasElement | null>(null);

const frameStyle = computed(() => ({
  left: `${frameBox.value.left}px`,
  top: `${frameBox.value.top}px`,
  width: `${frameBox.value.width}px`,
  height: `${frameBox.value.height}px`,
}));

// Everything below is touched on every pointer move, so it stays out of Vue's reactivity.
let source: HTMLImageElement | null = null;
let imageSize: Size = { width: 1, height: 1 };
let frame: Size = { width: 1, height: 1 };
/// Scale at which the image just covers the frame. The canvas element is laid out at that size
/// and zoom is a transform on top of it.
let cover = 1;
/// What the fingers have asked for. May overshoot the legal range; never drawn directly.
let raw: CropView | null = null;
/// What is on screen.
let shown: CropView | null = null;
let session = 0;
let objectUrl = "";
let settling = false;
let settleTimer = 0;
let gridTimer = 0;
let lastTap: (Point & { time: number }) | null = null;
let press: (Point & { time: number }) | null = null;
let last = { mid: { x: 0, y: 0 }, dist: 0 };
const pointers = new Map<number, Point>();

const paint = (view: CropView) => {
  shown = view;
  const el = imageEl.value;
  if (!el) return;
  el.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale / cover})`;
};

const sameView = (a: CropView, b: CropView) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.scale / b.scale - 1) < 1e-4;

/// Fit the frame between the header and the footer, centred, with the screen's aspect ratio.
/// Runs as soon as the page opens, so the empty frame (and its "loading" text) is already in
/// place while the picture decodes. Returns the previous frame size.
const layoutFrame = (): Size | null => {
  const root = rootEl.value;
  const header = headerEl.value;
  const footer = footerEl.value;
  if (!root || !header || !footer) return null;

  const rootRect = root.getBoundingClientRect();
  const top = header.getBoundingClientRect().bottom - rootRect.top;
  const bottom = footer.getBoundingClientRect().top - rootRect.top;
  const availW = Math.max(80, rootRect.width - FRAME_MARGIN * 2);
  const availH = Math.max(80, bottom - top - FRAME_MARGIN * 2);
  const aspect = window.innerWidth / window.innerHeight;
  // Whole pixels, centred on whole pixels. A frame at x = 49.5 gets its border snapped to 50
  // while the picture inside it is placed at 49.5, which is half a pixel of drift between
  // what is shown and what is exported. The aspect error from rounding is under 0.2%.
  let width = Math.floor(Math.min(availW, availH * aspect));
  if ((rootRect.width - width) % 2) width -= 1;
  const height = Math.round(width / aspect);

  const previous = frame;
  frame = { width, height };
  frameBox.value = {
    left: Math.round((rootRect.width - width) / 2),
    top: Math.round(top + FRAME_MARGIN + (availH - height) / 2),
    width,
    height,
  };
  return previous;
};

/// Place the picture in the frame. Runs when the picture is ready and on every resize.
const layout = () => {
  const previous = layoutFrame();
  const canvas = imageEl.value;
  if (!previous || !canvas || !source) return;

  cover = coverScale(imageSize, frame);
  canvas.style.width = `${imageSize.width * cover}px`;
  canvas.style.height = `${imageSize.height * cover}px`;

  const view = shown ? refitView(shown, imageSize, previous, frame) : initialView(imageSize, frame);
  endSettle();
  raw = view;
  paint(view);
};

const endSettle = () => {
  settling = false;
  window.clearTimeout(settleTimer);
  imageEl.value?.classList.remove("is-settling");
};

/// Glide to `target` with a CSS transition (so the curve comes from the shared motion tokens).
const animateTo = (target: CropView) => {
  const el = imageEl.value;
  if (!el || !shown) return;
  if (sameView(target, shown)) {
    raw = shown;
    return;
  }
  settling = true;
  el.classList.add("is-settling");
  raw = target;
  paint(target);
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(endSettle, SETTLE_FALLBACK_MS);
};

/// A finger landed while a rebound was still running: stop where it currently is, so the
/// picture does not jump to the end of the animation under the finger.
const freezeSettle = () => {
  const el = imageEl.value;
  if (!settling || !el) return;
  const m = new DOMMatrix(getComputedStyle(el).transform);
  endSettle();
  paint({ scale: m.a * cover, x: m.e, y: m.f });
};

const settle = () => {
  if (!shown) return;
  animateTo(clampView(shown, imageSize, frame));
};

const resetView = () => {
  if (phase.value !== "ready" || busy.value) return;
  freezeSettle();
  animateTo(initialView(imageSize, frame));
};

const setGesturing = (value: boolean) => {
  window.clearTimeout(gridTimer);
  gesturing.value = value;
};

/// Wheel has no "release", so the grid just fades out shortly after the last tick.
const flashGrid = () => {
  setGesturing(true);
  gridTimer = window.setTimeout(() => (gesturing.value = false), 500);
};

const framePoint = (e: { clientX: number; clientY: number }): Point => ({
  x: e.clientX - frameBox.value.left,
  y: e.clientY - frameBox.value.top,
});

/// Midpoint and distance of the first two pointers (distance 0 when there is only one).
const measure = () => {
  const [a, b] = [...pointers.values()];
  if (!b) return { mid: a, dist: 0 };
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
};

/// Restart the gesture from what is on screen. Done whenever the number of fingers changes, so
/// lifting one finger of a pinch carries on as a pan without a jump. `raw` has to be the view
/// that `softView` draws as `shown`, which differs from `shown` while overshooting.
const rebase = () => {
  raw = shown && unsoftView(shown, imageSize, frame);
  last = measure();
};

const onPointerDown = (e: PointerEvent) => {
  if (phase.value !== "ready" || busy.value || !shown) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;
  freezeSettle();
  stageEl.value?.setPointerCapture(e.pointerId);
  const p = framePoint(e);
  pointers.set(e.pointerId, p);
  press = pointers.size === 1 ? { ...p, time: e.timeStamp } : null;
  rebase();
  setGesturing(true);
};

const onPointerMove = (e: PointerEvent) => {
  if (!pointers.has(e.pointerId) || !raw) return;
  pointers.set(e.pointerId, framePoint(e));
  const now = measure();
  if (press && Math.hypot(now.mid.x - press.x, now.mid.y - press.y) > TAP_SLOP) press = null;

  if (pointers.size >= 2 && last.dist > 0 && now.dist > 0) {
    const min = cover;
    // The raw view may overshoot, but not without bound, or the finger would have to travel
    // the whole overshoot again to get the picture moving back.
    raw = pinchView(raw, last.mid, now.mid, now.dist / last.dist, {
      min: min * 0.5,
      max: min * MAX_ZOOM * 2,
    });
  } else {
    raw = { ...raw, x: raw.x + now.mid.x - last.mid.x, y: raw.y + now.mid.y - last.mid.y };
  }
  last = now;
  paint(softView(raw, imageSize, frame));
};

const onPointerEnd = (e: PointerEvent) => {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size > 0) {
    rebase();
    return;
  }
  setGesturing(false);

  const tap = e.type === "pointerup" && press && e.timeStamp - press.time < TAP_MS ? press : null;
  press = null;
  if (tap) {
    const again =
      lastTap &&
      e.timeStamp - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < DOUBLE_TAP_SLOP;
    lastTap = again ? null : { x: tap.x, y: tap.y, time: e.timeStamp };
    if (again) {
      resetView();
      return;
    }
  } else {
    lastTap = null;
  }
  settle();
};

const onWheel = (e: WheelEvent) => {
  if (phase.value !== "ready" || busy.value || !shown) return;
  freezeSettle();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  // ctrl+wheel is a trackpad pinch and arrives in much smaller steps.
  const step = -e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015);
  const scale = clamp(shown.scale * Math.exp(step), cover, cover * MAX_ZOOM);
  const next = zoomAround(shown, scale / shown.scale, framePoint(e));
  raw = clampView(next, imageSize, frame);
  paint(raw);
  flashGrid();
};

const onImageTransitionEnd = (e: TransitionEvent) => {
  if (e.propertyName === "transform") endSettle();
};

const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

let scrollLocked = false;
let savedOverflow: [string, string] = ["", ""];

const lockScroll = () => {
  if (scrollLocked) return;
  scrollLocked = true;
  savedOverflow = [document.documentElement.style.overflow, document.body.style.overflow];
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
};

const unlockScroll = () => {
  if (!scrollLocked) return;
  scrollLocked = false;
  document.documentElement.style.overflow = savedOverflow[0];
  document.body.style.overflow = savedOverflow[1];
};

const reset = () => {
  session++;
  window.clearTimeout(settleTimer);
  window.clearTimeout(gridTimer);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = "";
  source = null;
  raw = null;
  shown = null;
  settling = false;
  lastTap = null;
  press = null;
  pointers.clear();
  phase.value = "loading";
  busy.value = false;
  gesturing.value = false;
  errorText.value = "";
};

/// The back key closes the page like 取消 instead of leaving /style behind it.
const backClose = useBackClose(() => {
  // Not while the export is running: it finishes first (and then closes the page itself).
  if (busy.value) return false;
  cancel();
});

const start = async (file: File) => {
  reset();
  const mine = session;
  open.value = true;
  lockScroll();
  backClose.push();

  try {
    await nextTick();
    if (mine !== session) return;
    layoutFrame();
    objectUrl = URL.createObjectURL(file);
    const img = await loadImage(objectUrl);
    if (mine !== session) return;
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
    await nextTick();
    if (mine !== session || !imageEl.value) return;

    source = img;
    imageSize = { width: img.naturalWidth, height: img.naturalHeight };
    drawPreview(img, imageEl.value);
    layout();
    phase.value = "ready";
  } catch {
    if (mine !== session) return;
    source = null;
    errorText.value = "这张图片读不出来，换一张试试";
    phase.value = "error";
  }
};

const close = () => {
  open.value = false;
  backClose.release();
};

// Runs once the fade-out has finished (or on unmount), so the picture is not torn down while
// it is still visible.
const cleanup = () => {
  reset();
  unlockScroll();
};

const cancel = () => {
  if (busy.value) return;
  emit("cancel");
  close();
};

const confirm = async () => {
  if (phase.value !== "ready" || busy.value || !source || !shown) return;
  errorText.value = "";
  busy.value = true;
  // Let the button show "处理中" before the synchronous canvas work blocks the thread.
  await nextPaint();
  try {
    const view = clampView(shown, imageSize, frame);
    const rect = cropRect(view, imageSize, frame);
    // Read pixels from the original image, never from the shrunken preview, or the result
    // would be soft.
    const out = cropToDataUrl(source, rect, frame.width / frame.height);
    emit("confirm", out.dataUrl);
    close();
  } catch {
    errorText.value = "裁剪失败了，请再试一次";
    busy.value = false;
  }
};

const onKeydown = (e: KeyboardEvent) => {
  if (open.value && e.key === "Escape") cancel();
};

watch(
  () => props.file,
  (file) => {
    if (file) void start(file);
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("resize", layout);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", layout);
  window.removeEventListener("keydown", onKeydown);
  cleanup();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="cropper" @after-leave="cleanup">
      <div
        v-if="open"
        ref="rootEl"
        class="cropper"
        :class="{ 'is-ready': phase === 'ready', 'is-gesturing': gesturing }"
        role="dialog"
        aria-modal="true"
        aria-label="调整背景位置"
      >
        <!-- 手势面：铺满整个屏幕，图片拖到框外的部分也能抓住 -->
        <div
          ref="stageEl"
          class="cropper-stage"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerEnd"
          @pointercancel="onPointerEnd"
          @lostpointercapture="onPointerEnd"
          @wheel.prevent="onWheel"
          @contextmenu.prevent
        >
          <div class="cropper-frame" :style="frameStyle">
            <!-- 进场动画放在外层，避免和手势写的 transform 打架 -->
            <div class="cropper-pan">
              <canvas ref="imageEl" class="cropper-image" @transitionend="onImageTransitionEnd" />
            </div>
            <div class="cropper-mask" />
            <div class="cropper-grid">
              <i /><i /><i /><i />
            </div>
            <span class="corner tl" /><span class="corner tr" />
            <span class="corner bl" /><span class="corner br" />
          </div>

          <div v-if="phase !== 'ready'" class="cropper-status">
            <template v-if="phase === 'loading'">
              <span class="spinner" />
              <span>正在读取图片…</span>
            </template>
            <span v-else>{{ errorText }}</span>
          </div>
        </div>

        <header ref="headerEl" class="cropper-header">
          <div class="title">调整背景位置</div>
          <div class="hint" :class="{ 'is-error': phase === 'ready' && errorText }">
            {{ phase === "ready" && errorText ? errorText : "拖动和双指缩放，框内就是背景显示的范围" }}
          </div>
        </header>

        <footer ref="footerEl" class="cropper-footer">
          <button class="btn ghost" type="button" :disabled="busy" @click="cancel">取消</button>
          <button
            class="btn ghost"
            type="button"
            :disabled="phase !== 'ready' || busy"
            @click="resetView"
          >
            重置
          </button>
          <button
            class="btn primary"
            type="button"
            :disabled="phase !== 'ready' || busy"
            @click="confirm"
          >
            {{ busy ? "处理中…" : "完成" }}
          </button>
        </footer>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cropper {
  /* The shared motion tokens are defined elsewhere; the fallbacks keep this page animating
     the same way until (and unless) they exist. */
  --c-ease-spring: var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  --c-ease-smooth: var(--ease-smooth, cubic-bezier(0.22, 1, 0.36, 1));
  --c-dur-fast: var(--dur-fast, 180ms);
  --c-dur-base: var(--dur-base, 300ms);
  --c-dur-slow: var(--dur-slow, 460ms);

  position: fixed;
  inset: 0;
  /* Above Vant popups (they count up from 2000). */
  z-index: 2500;
  overflow: hidden;
  /* Fixed dark on purpose: the picture is easier to judge on a neutral dark surround, and it
     is the same under every theme. */
  background: #0c0c0e;
  color: #fff;
  overscroll-behavior: contain;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.cropper-enter-active {
  transition: opacity var(--c-dur-base) var(--c-ease-smooth);
}

.cropper-leave-active {
  transition: opacity var(--c-dur-fast) ease;
}

.cropper-enter-from,
.cropper-leave-to {
  opacity: 0;
}

.cropper-stage {
  position: absolute;
  inset: 0;
  z-index: 1;
  touch-action: none;
  cursor: grab;
}

.cropper-stage:active {
  cursor: grabbing;
}

.cropper-frame {
  position: absolute;
}

.cropper-pan {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: scale(0.94);
  transition:
    opacity var(--c-dur-base) var(--c-ease-smooth),
    transform var(--c-dur-slow) var(--c-ease-spring);
}

.cropper.is-ready .cropper-pan {
  opacity: 1;
  transform: none;
}

.cropper-image {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
  transform-origin: 0 0;
  pointer-events: none;
  /* No transition here: following a finger must never lag. The rebound opts in below. */
}

.cropper-image.is-settling {
  transition: transform var(--c-dur-slow) var(--c-ease-smooth);
}

/* The dimmed surround is a huge shadow outside the frame, so the picture stays visible
   (darkened) where it extends past the frame; the inset line is the frame's border. */
.cropper-mask {
  position: absolute;
  inset: 0;
  border-radius: 4px;
  box-shadow:
    0 0 0 100vmax rgba(0, 0, 0, 0.62),
    inset 0 0 0 1px rgba(255, 255, 255, 0.85);
  pointer-events: none;
}

.cropper-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--c-dur-slow) var(--c-ease-smooth) 0.12s;
}

.cropper.is-gesturing .cropper-grid {
  opacity: 1;
  transition-delay: 0s;
  transition-duration: var(--c-dur-fast);
}

.cropper-grid i {
  position: absolute;
  background: rgba(255, 255, 255, 0.45);
}

.cropper-grid i:nth-child(1),
.cropper-grid i:nth-child(2) {
  top: 0;
  bottom: 0;
  width: 1px;
}

.cropper-grid i:nth-child(3),
.cropper-grid i:nth-child(4) {
  left: 0;
  right: 0;
  height: 1px;
}

.cropper-grid i:nth-child(1) { left: 33.333%; }
.cropper-grid i:nth-child(2) { left: 66.666%; }
.cropper-grid i:nth-child(3) { top: 33.333%; }
.cropper-grid i:nth-child(4) { top: 66.666%; }

.corner {
  position: absolute;
  width: 18px;
  height: 18px;
  pointer-events: none;
  border: 0 solid #fff;
}

.corner.tl { left: -2px; top: -2px; border-left-width: 3px; border-top-width: 3px; border-top-left-radius: 5px; }
.corner.tr { right: -2px; top: -2px; border-right-width: 3px; border-top-width: 3px; border-top-right-radius: 5px; }
.corner.bl { left: -2px; bottom: -2px; border-left-width: 3px; border-bottom-width: 3px; border-bottom-left-radius: 5px; }
.corner.br { right: -2px; bottom: -2px; border-right-width: 3px; border-bottom-width: 3px; border-bottom-right-radius: 5px; }

.cropper-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
  pointer-events: none;
}

.spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  animation: cropper-spin 0.8s linear infinite;
}

@keyframes cropper-spin {
  to { transform: rotate(360deg); }
}

/* Header and footer sit above the gesture surface but let it through; only the buttons
   take events. */
.cropper-header,
.cropper-footer {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 3;
  pointer-events: none;
}

.cropper-header {
  top: 0;
  text-align: center;
  /* --safe-top is the real status bar height where the app provides it. */
  padding: calc(10px + var(--safe-top, env(safe-area-inset-top, 0px))) 24px 10px;
}

.cropper-header .title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
  /* The picture runs under the header; keep the text readable over a bright one. */
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
}

.cropper-header .hint {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
}

.cropper-header .hint.is-error {
  color: #ff8a80;
}

.cropper-footer {
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 12px 20px calc(16px + var(--safe-bottom, env(safe-area-inset-bottom, 0px)));
}

.btn {
  flex: 1;
  max-width: 200px;
  height: 46px;
  border: 0;
  border-radius: 23px;
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  appearance: none;
  transition:
    transform var(--c-dur-fast) var(--c-ease-smooth),
    opacity var(--c-dur-fast) ease,
    background-color var(--c-dur-fast) ease;
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn.ghost {
  border: 1px solid rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.04);
}

.btn.ghost:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
}

/* White on the fixed dark page: calm, and independent of any theme accent. */
.btn.primary {
  flex: 1.4;
  max-width: 280px;
  background: #fff;
  color: #111;
  font-weight: 600;
}

.btn.primary:active:not(:disabled) {
  background: #e6e6e6;
}

/* Reduced motion drops the zoom-in on entry. The rebound stays, only shorter: it is the
   answer to the user's own drag, and without it the picture would just jump. */
@media (prefers-reduced-motion: reduce) {
  .cropper-pan {
    transform: none;
  }

  .cropper-image.is-settling {
    transition-duration: var(--c-dur-fast);
  }
}
</style>
