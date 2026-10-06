// Geometry of the colour wheel: a hue ring with a saturation/value square inside it.
//
// All coordinates are fractions of the wheel's box (0..1, origin top-left), so the maths does
// not care how big the wheel is drawn and the component can position handles in percent.

export interface WheelPoint {
  x: number;
  y: number;
}

/// Outer edge of the ring is the box edge; the ring is this thick.
export const RING_OUTER = 0.5;
export const RING_INNER = 0.365;
/// Half the side of the square. Its corners sit at 0.24 * sqrt(2) = 0.339 from the centre,
/// which leaves a small gap inside the ring's inner edge (0.365).
export const SQUARE_HALF = 0.24;

export type WheelZone = "ring" | "square";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/// Which part a press at (x, y) belongs to, with a little slack so a fat finger just outside
/// the ring still grabs it. The ring's inner slack stays below the square's corner distance,
/// so a press on a corner of the square is never taken for the ring.
export const hitZone = (x: number, y: number): WheelZone | null => {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const r = Math.hypot(dx, dy);
  if (r >= RING_INNER - 0.012 && r <= RING_OUTER + 0.03) return "ring";
  const reach = SQUARE_HALF + 0.02;
  if (Math.abs(dx) <= reach && Math.abs(dy) <= reach) return "square";
  return null;
};

/// Hue in degrees for a point on the ring: 0 at the top, increasing clockwise.
export const hueFromPoint = (x: number, y: number) => {
  const deg = (Math.atan2(x - 0.5, 0.5 - y) * 180) / Math.PI;
  return (deg + 360) % 360;
};

/// Saturation grows to the right, value grows upwards; a point outside the square is pulled
/// onto its edge, so dragging past it keeps tracking the nearest value.
export const svFromPoint = (x: number, y: number) => {
  const side = SQUARE_HALF * 2;
  return {
    s: clamp01((x - (0.5 - SQUARE_HALF)) / side),
    v: clamp01(1 - (y - (0.5 - SQUARE_HALF)) / side),
  };
};

/// Where the hue handle sits: the middle of the ring at `hue`.
export const ringHandle = (hue: number): WheelPoint => {
  const rad = (hue * Math.PI) / 180;
  const r = (RING_OUTER + RING_INNER) / 2;
  return { x: 0.5 + r * Math.sin(rad), y: 0.5 - r * Math.cos(rad) };
};

/// Where the saturation/value handle sits.
export const squareHandle = (s: number, v: number): WheelPoint => ({
  x: 0.5 - SQUARE_HALF + s * SQUARE_HALF * 2,
  y: 0.5 - SQUARE_HALF + (1 - v) * SQUARE_HALF * 2,
});
