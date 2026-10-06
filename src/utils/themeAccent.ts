/// Picks the colour the "live" markers are painted with (today's column, the current week, the main
/// buttons) and the colour to put on top of it.
///
/// Why this is computed rather than read from one preset field. Looking at the presets:
///   - header-text is the closest thing to an accent (pink on Macaron, sky blue on Deep Sea) but it is
///     white on the Vant preset, whose page background is white too;
///   - the card border is the accent on the neon dark presets and a pale grey on every light one, which
///     is how today's header ended up fainter than the other days;
///   - body-text always reads on the page, but is a flat dark grey on most light presets.
/// So take the first of header-text, header-bg, body-text that has real contrast against the page,
/// which keeps the preset's own flavour wherever it has one. Custom colours from the style editor go
/// through the same path.

interface AccentSource {
  bgColor: string;
  headerBgColor: string;
  headerTextColor: string;
  bodyTextColor: string;
}

export interface Accent {
  accent: string;
  onAccent: string;
}

/// 3:1 is the WCAG bar for graphical objects and large text; a filled chip is both.
const MIN_ACCENT_CONTRAST = 3;
/// Lettering on the chip is bold and short ("周三", "本周"), so the same large-text bar applies. It is also
/// what lets white stay on the Vant blue, where it reads as the brand colour.
const MIN_LABEL_CONTRAST = 3;

const parseHex = (value: string): [number, number, number] | null => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim());
  if (!match) return null;
  const hex = match[1].length === 3
    ? match[1].split("").map(char => char + char).join("")
    : match[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
};

const luminance = ([r, g, b]: [number, number, number]) => {
  const channel = (value: number) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (first: string, second: string): number => {
  const a = parseHex(first);
  const b = parseHex(second);
  // Colours the parser does not understand (rgb(), named colours) count as unusable, so the caller
  // falls through to the next candidate instead of trusting a number it could not compute.
  if (!a || !b) return 0;
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
};

export function pickAccent(source: AccentSource): Accent {
  const candidates = [source.headerTextColor, source.headerBgColor, source.bodyTextColor];
  const accent = candidates.find(color => contrast(color, source.bgColor) >= MIN_ACCENT_CONTRAST)
    ?? source.bodyTextColor;

  // The page colour is the nicest lettering (it makes the chip look cut out of the page), then
  // white, then near-black.
  const letterings = [source.bgColor, "#ffffff", "#111111"];
  const onAccent = letterings.find(color => contrast(color, accent) >= MIN_LABEL_CONTRAST)
    ?? letterings.reduce((best, color) => (contrast(color, accent) > contrast(best, accent) ? color : best));

  return { accent, onAccent };
}
