// Framing maths and JPEG export for the background-image cropper.
//
// The maths is kept free of DOM on purpose: a wrong zoom centre or a wrong clamp raises no
// error, the picture just drifts under the finger, and that can only be caught by asserting
// numbers. Everything above `loadImage` can be run (and is tested) in plain node; the gesture
// wiring itself lives in components/common/ImageCropper.vue.

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point, Size {}

/// Where the image sits inside the crop frame: a source pixel `p` lands at `p * scale + (x, y)`
/// in frame pixels, the origin being the frame's top-left corner.
export interface CropView {
  scale: number;
  x: number;
  y: number;
}

/// How far past "cover" the user may zoom in.
export const MAX_ZOOM = 5;
/// The home screen draws the background with `background-size: cover`, so a 1080-wide image is
/// already denser than any phone screen needs; going wider only costs localStorage.
export const BG_MAX_WIDTH = 1080;
/// The theme (with the image inlined as a data URL) is one localStorage item and the quota is
/// about 5MB per origin, so the JPEG itself is held to 1MB.
export const BG_MAX_BYTES = 1_000_000;
/// Longest side of the on-screen preview. Dragging a 12MP photo as a texture stutters on phones.
export const PREVIEW_MAX_SIDE = 2560;

export const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/// Smallest scale at which the image still covers the whole frame.
export const coverScale = (image: Size, frame: Size) =>
  Math.max(frame.width / image.width, frame.height / image.height);

/// Cover, centred: what the user sees first and what "reset" returns to.
export const initialView = (image: Size, frame: Size): CropView => {
  const scale = coverScale(image, frame);
  return {
    scale,
    x: (frame.width - image.width * scale) / 2,
    y: (frame.height - image.height * scale) / 2,
  };
};

/// The nearest legal view: zoom within [cover, cover * MAX_ZOOM] and no gap between the image
/// and any frame edge.
export const clampView = (view: CropView, image: Size, frame: Size): CropView => {
  const min = coverScale(image, frame);
  const scale = clamp(view.scale, min, min * MAX_ZOOM);
  return {
    scale,
    x: clamp(view.x, frame.width - image.width * scale, 0),
    y: clamp(view.y, frame.height - image.height * scale, 0),
  };
};

/// Scale by `factor` while the image point under `centre` stays under it.
/// With q = (centre - offset) / scale the point's source coordinate, the new offset has to
/// satisfy q * (scale * factor) + offset' = centre, which gives the line below.
export const zoomAround = (view: CropView, factor: number, centre: Point): CropView => ({
  scale: view.scale * factor,
  x: centre.x - (centre.x - view.x) * factor,
  y: centre.y - (centre.y - view.y) * factor,
});

/// One step of a two-finger gesture: the point that was under the old midpoint `from` ends up
/// under the new midpoint `to`, scaled by `factor` (new distance / old distance). Panning and
/// zooming fall out of the same line, so the fingers never slip on the picture.
/// `limits` caps the resulting scale; the factor is shrunk to fit so the anchor still holds.
export const pinchView = (
  view: CropView,
  from: Point,
  to: Point,
  factor: number,
  limits?: { min: number; max: number },
): CropView => {
  const f = limits ? clamp(view.scale * factor, limits.min, limits.max) / view.scale : factor;
  return {
    scale: view.scale * f,
    x: to.x - (from.x - view.x) * f,
    y: to.y - (from.y - view.y) * f,
  };
};

/// Past an edge the picture follows the finger with growing resistance instead of stopping
/// dead (the `c = 0.55` curve UIScrollView uses). `span` is the most it can ever stretch.
const stretch = (over: number, span: number) => span * (1 - 1 / ((over * 0.55) / span + 1));

export const rubberBand = (value: number, lo: number, hi: number, span: number) => {
  if (value > hi) return hi + stretch(value - hi, span);
  if (value < lo) return lo - stretch(lo - value, span);
  return value;
};

/// Same idea for zoom, as a ratio to the limit: slope 0.6 at the limit, flattening out at 0.8x
/// below the minimum and 1.25x above the maximum.
export const rubberScale = (scale: number, min: number, max: number) => {
  if (scale < min) return min * (0.8 + 0.2 * Math.exp(-3 * (1 - scale / min)));
  if (scale > max) return max * (1 + 0.25 * (1 - Math.exp(-2.4 * (scale / max - 1))));
  return scale;
};

/// What to draw for a finger-driven (unconstrained) view `raw`: the same view inside the legal
/// range, a damped one outside it. Keeping `raw` separate and stateless-mapping it each frame
/// is what lets the picture follow the finger back out of an overshoot without drifting;
/// clamping the already-damped view on every event would shrink the overshoot each time.
/// While the scale is being damped the frame centre is the anchor, because the fingers' anchor
/// no longer maps to a single point.
export const softView = (raw: CropView, image: Size, frame: Size): CropView => {
  const min = coverScale(image, frame);
  const scale = rubberScale(raw.scale, min, min * MAX_ZOOM);
  const k = scale / raw.scale;
  const cx = frame.width / 2;
  const cy = frame.height / 2;
  return {
    scale,
    x: rubberBand(cx - (cx - raw.x) * k, frame.width - image.width * scale, 0, frame.width * 0.25),
    y: rubberBand(cy - (cy - raw.y) * k, frame.height - image.height * scale, 0, frame.height * 0.25),
  };
};

/// Inverses of the two curves above, for a value as drawn. Needed when a gesture is re-based
/// mid-way (one of two fingers lifts, a finger lands during a rebound): the new unconstrained
/// view must be one that `softView` maps back to exactly what is on screen. Starting from the
/// drawn view itself would apply the damping a second time and make the picture creep.
const unstretch = (drawn: number, span: number) => {
  const d = Math.min(drawn, span * 0.98);
  return (span * d) / ((span - d) * 0.55);
};

const unrubberBand = (value: number, lo: number, hi: number, span: number) => {
  if (value > hi) return hi + unstretch(value - hi, span);
  if (value < lo) return lo - unstretch(lo - value, span);
  return value;
};

const unrubberScale = (scale: number, min: number, max: number) => {
  if (scale < min) {
    const w = Math.max((scale / min - 0.8) / 0.2, 1e-3);
    return min * (1 + Math.log(w) / 3);
  }
  if (scale > max) {
    const u = Math.min((scale / max - 1) / 0.25, 0.98);
    return max * (1 - Math.log(1 - u) / 2.4);
  }
  return scale;
};

/// `softView`'s inverse: the unconstrained view that is drawn as `drawn`.
export const unsoftView = (drawn: CropView, image: Size, frame: Size): CropView => {
  const min = coverScale(image, frame);
  const scale = unrubberScale(drawn.scale, min, min * MAX_ZOOM);
  const k = drawn.scale / scale;
  const cx = frame.width / 2;
  const cy = frame.height / 2;
  const x = unrubberBand(drawn.x, frame.width - image.width * drawn.scale, 0, frame.width * 0.25);
  const y = unrubberBand(drawn.y, frame.height - image.height * drawn.scale, 0, frame.height * 0.25);
  return { scale, x: cx - (cx - x) / k, y: cy - (cy - y) / k };
};

/// The frame was resized (rotation, window resize): keep the same relative zoom and the same
/// source point at the frame's centre, then clamp for the new frame.
export const refitView = (view: CropView, image: Size, from: Size, to: Size): CropView => {
  const zoom = view.scale / coverScale(image, from);
  const scale = coverScale(image, to) * zoom;
  const cx = (from.width / 2 - view.x) / view.scale;
  const cy = (from.height / 2 - view.y) / view.scale;
  return clampView(
    { scale, x: to.width / 2 - cx * scale, y: to.height / 2 - cy * scale },
    image,
    to,
  );
};

/// The part of the *source* image inside the frame, in source pixels.
export const cropRect = (view: CropView, image: Size, frame: Size): Rect => {
  const width = Math.min(image.width, frame.width / view.scale);
  const height = Math.min(image.height, frame.height / view.scale);
  return {
    x: clamp(-view.x / view.scale, 0, image.width - width),
    y: clamp(-view.y / view.scale, 0, image.height - height),
    width,
    height,
  };
};

/// Byte length of the binary behind a base64 data URL.
export const dataUrlBytes = (dataUrl: string) => {
  const payload = dataUrl.length - dataUrl.indexOf(",") - 1;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return (payload / 4) * 3 - padding;
};

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });

const fillWhite = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  // JPEG has no alpha; without this a transparent PNG would turn black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
};

/// Draw `image` into `canvas`, shrunk so its longest side is at most `maxSide`. The cropper
/// moves this small copy around; the export always reads the original.
export const drawPreview = (
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  maxSide = PREVIEW_MAX_SIDE,
) => {
  const k = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  fillWhite(ctx, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
};

export interface CropOutput {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  quality: number;
}

/// Width factor and JPEG quality to try, best first. Quality drops before resolution because
/// the home screen blurs/fades this image anyway, so a few JPEG artefacts cost less than a
/// smaller picture. At most eight encodes, which is still well under a second on a phone.
const ATTEMPTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0.8],
  [1, 0.7],
  [1, 0.6],
  [0.85, 0.7],
  [0.85, 0.6],
  [0.7, 0.6],
  [0.7, 0.5],
  [0.55, 0.5],
];

/// Cut `rect` (source pixels) out of the *original* image and encode it as JPEG: at most
/// `maxWidth` wide, never upscaled past the source's own pixels, `aspect` (width / height)
/// preserved, and at most `maxBytes` of JPEG. If nothing fits, the smallest attempt is returned.
export const cropToDataUrl = (
  image: CanvasImageSource,
  rect: Rect,
  aspect: number,
  { maxWidth = BG_MAX_WIDTH, maxBytes = BG_MAX_BYTES } = {},
): CropOutput => {
  const baseWidth = Math.max(1, Math.min(maxWidth, Math.round(rect.width)));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  let out: CropOutput | null = null;
  let drawnWidth = 0;
  for (const [shrink, quality] of ATTEMPTS) {
    const width = Math.max(1, Math.round(baseWidth * shrink));
    if (width !== drawnWidth) {
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(width / aspect));
      fillWhite(ctx, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
      drawnWidth = width;
    }
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    out = { dataUrl, width: canvas.width, height: canvas.height, bytes: dataUrlBytes(dataUrl), quality };
    if (out.bytes <= maxBytes) break;
  }
  // toDataURL answers "data:," instead of throwing when the canvas is too big for the platform.
  if (!out?.dataUrl.startsWith("data:image/jpeg")) throw new Error("jpeg encode failed");
  return out;
};
