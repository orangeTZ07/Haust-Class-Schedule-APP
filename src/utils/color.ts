// Colour conversions for the theme colour picker: HEX <-> RGB <-> HSV, plus a few helpers.
//
// Kept free of DOM so scripts/test-color.mjs can run it. HSV is the picker's working space
// (hue ring + saturation/value square), and the theme stores "#rrggbb" strings, so a wrong
// conversion would silently store a slightly different colour than the one the user chose.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/// h in degrees [0, 360), s and v in [0, 1].
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/// "#rgb", "#rrggbb" or either without the "#", any case, surrounding spaces ignored, to the
/// canonical "#rrggbb" (lower case). null for anything else.
export const parseHex = (input: string): string | null => {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  let digits = match[1].toLowerCase();
  if (digits.length === 3) digits = [...digits].map((c) => c + c).join("");
  return `#${digits}`;
};

export const hexToRgb = (hex: string): Rgb | null => {
  const canonical = parseHex(hex);
  if (!canonical) return null;
  const n = parseInt(canonical.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const channel = (value: number) =>
  Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");

export const rgbToHex = ({ r, g, b }: Rgb) => `#${channel(r)}${channel(g)}${channel(b)}`;

export const rgbToHsv = ({ r, g, b }: Rgb): Hsv => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const delta = max - Math.min(rn, gn, bn);

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
};

/// Channels come back as floats; only `rgbToHex` rounds, so converting back and forth never
/// accumulates rounding error while a picker keeps its state in HSV.
export const hsvToRgb = ({ h, s, v }: Hsv): Rgb => {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  const sector = Math.floor(hue / 60);
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector % 6];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
};

export const hsvToHex = (hsv: Hsv) => rgbToHex(hsvToRgb(hsv));

export const hexToHsv = (hex: string): Hsv | null => {
  const rgb = hexToRgb(hex);
  return rgb && rgbToHsv(rgb);
};

/// Black or white, whichever reads better on `hex` (WCAG relative luminance).
export const contrastColor = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#000000";
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
  return luminance > 0.179 ? "#000000" : "#ffffff";
};

/// A most-recent-first list of colours: `hex` goes to the front, an earlier copy of it is
/// dropped, anything that is not a colour is ignored, and the list is cut to `max`.
export const pushRecent = (list: readonly string[], hex: string, max = 8): string[] => {
  const canonical = parseHex(hex);
  if (!canonical) return list.slice(0, max);
  return [canonical, ...list.filter((item) => parseHex(item) !== canonical)].slice(0, max);
};
