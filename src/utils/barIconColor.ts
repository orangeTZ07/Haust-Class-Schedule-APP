/// Decides whether the status / navigation bar should draw dark or light icons from the colour
/// behind them. Pure functions, no DOM: scripts/test-bar-icon-color.mjs loads this file directly.
///
/// Why not just follow the light / dark mode: the mode says nothing about the colour that is
/// actually under the bar. "Vant 经典" is a light-mode theme with a blue header and white header
/// text; dark icons on that blue are barely visible. What matters is how bright the pixel behind
/// the icon is.

export interface Rgba {
  /// 0-255
  r: number;
  g: number;
  b: number;
  /// 0-1
  a: number;
}

/// Above this relative luminance the background counts as light and gets dark icons.
///
/// 0.5 rather than the WCAG contrast crossover (about 0.18, where black and white text have equal
/// contrast): at 0.18 a mid-tone brand blue such as #1989fa would flip to black icons, which is
/// technically a little more contrast and looks wrong next to the white header text the theme uses
/// on it. Icons go dark only when the background is plainly light.
export const LIGHT_BACKGROUND_LUMINANCE = 0.5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/// One channel of an rgb() / rgba() colour: a number 0-255, or a percentage.
function parseChannel(token: string): number | null {
  const percent = /^([+-]?\d*\.?\d+)%$/.exec(token);
  if (percent) return clamp((Number(percent[1]) / 100) * 255, 0, 255);
  if (/^[+-]?\d*\.?\d+$/.test(token)) return clamp(Number(token), 0, 255);
  return null;
}

/// The alpha of rgba(): a number 0-1, or a percentage.
function parseAlpha(token: string): number | null {
  const percent = /^([+-]?\d*\.?\d+)%$/.exec(token);
  if (percent) return clamp(Number(percent[1]) / 100, 0, 1);
  if (/^[+-]?\d*\.?\d+$/.test(token)) return clamp(Number(token), 0, 1);
  return null;
}

/// Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(r, g, b)` and `rgba(r, g, b, a)`, including
/// the space-separated `rgb(r g b / a)` form. Anything else -- named colours, hsl(), var(...), an
/// empty string -- is not guessed at and gives null.
export function parseColor(input: unknown): Rgba | null {
  if (typeof input !== "string") return null;
  const text = input.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = digits
        .split("")
        .map((digit) => digit + digit)
        .join("");
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1
    };
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(text);
  if (fn) {
    const tokens = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (tokens.length !== 3 && tokens.length !== 4) return null;
    const [r, g, b] = tokens.slice(0, 3).map(parseChannel);
    const a = tokens.length === 4 ? parseAlpha(tokens[3]) : 1;
    if (r === null || g === null || b === null || a === null) return null;
    return { r, g, b, a };
  }

  return null;
}

/// WCAG 2.x relative luminance, 0 (black) to 1 (white). Alpha is ignored here; flatten() first.
export function relativeLuminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/// Composites a colour over an opaque backdrop, the way the screen would show it.
export function flatten(color: Rgba, backdrop: Rgba): Rgba {
  const mix = (top: number, bottom: number) => top * color.a + bottom * (1 - color.a);
  return { r: mix(color.r, backdrop.r), g: mix(color.g, backdrop.g), b: mix(color.b, backdrop.b), a: 1 };
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/// Whether a bar drawn over `background` should use dark icons.
///
/// - `background`: the colour behind the bar, as a CSS colour string.
/// - `fallback`: the answer when `background` cannot be parsed (the caller passes "is the theme
///   light", so an unparseable colour degrades to the old light / dark-mode behaviour).
/// - `behind`: what shows through a translucent `background`. Defaults to white; only consulted
///   when `background` has alpha below 1.
export function wantsDarkIcons(background: unknown, fallback: boolean, behind?: unknown): boolean {
  const color = parseColor(background);
  if (!color) return fallback;

  let visible = color;
  if (color.a < 1) {
    const backdrop = parseColor(behind) ?? WHITE;
    // The backdrop itself might be translucent; it can only land on white, there is nothing below.
    visible = flatten(color, backdrop.a < 1 ? flatten(backdrop, WHITE) : backdrop);
  }
  return relativeLuminance(visible) > LIGHT_BACKGROUND_LUMINANCE;
}
