---
name: timetable-compact-zoom-ui
description: Preserve project-specific rules for the timetable grid's compact week layout, transparent cell backgrounds, touch pinch horizontal zoom, and mobile horizontal-scroll fallback. Use when changing WeekGrid.vue, HomeView.vue, timetable column sizing, grid density, touch zoom, or timetable background transparency.
---

# Timetable Compact Zoom UI

## Scope

Use this skill for UI-density and layout work in:

- `src/components/timetable/WeekGrid.vue`
- `src/components/timetable/CourseBlock.vue`
- `src/views/HomeView.vue`

This complements `timetable-card-coding`: use that skill for conflict-group behavior, floating cards, drag persistence, and coordinate math. Use this skill when the change is primarily about compact display, table columns, background transparency, or touch zoom.

## Current UI Model

The timetable should default to a compact full-week view: Monday through Sunday must fit within normal phone widths without horizontal scrolling. Horizontal scrolling is a fallback for extremely narrow screens and for user-initiated zoom.

`WeekGrid.vue` owns the actual grid width. It uses a CSS variable such as `--week-grid-min-width` and `min-width: max(100%, var(--week-grid-min-width))`. The minimum unzoomed width should stay compact, around `360px`, so a `390px` mobile viewport can show all seven days.

The outer `.grid-container` in `HomeView.vue` owns horizontal overflow. It should allow `overflow-x: auto` while preserving vertical timetable scrolling inside `.body`.

## Pinch Zoom Rules

Implement horizontal pinch zoom by changing layout width, not by applying `transform: scale()`.

- Track two-touch horizontal distance with `Math.abs(touches[0].clientX - touches[1].clientX)`.
- Keep `gridZoom` clamped, currently from `1` to about `2.2`.
- Derive `--week-grid-min-width` from `MIN_GRID_WIDTH * gridZoom`.
- Keep the lower bound at `1` so the table returns to compact full-week mode.
- Do not scale the grid with CSS transforms; transforms break visual size assumptions and can make drag hit-testing and conflict floating-frame measurements misleading.

## Compact Grid Rules

- Keep the time column narrow, around `44px`.
- Use `repeat(7, minmax(0, 1fr))` for day columns in compact mode.
- Prefer smaller header/time padding over increasing the grid minimum width.
- Keep row height stable at `50px` unless the course-card measurement logic is updated with it.
- Preserve today highlighting, but keep it subtle enough that it does not dominate course cards.

## Background Transparency Rules

Cells must not become opaque. This app supports themed backgrounds and glass-like styling, so grid section colors should be transparent overlays.

Use transparent mixes such as:

```css
background: color-mix(in srgb, #4dabf7 4%, transparent);
```

Avoid mixing section backgrounds with `var(--theme-bg-color)` for ordinary cells, because that fills each cell with an opaque theme color and hides the page background.

Drop-target backgrounds may be stronger, but should only apply during drag and should still respect the theme.

## Course Card Density Rules

Course cards can use course color as a visual cue through a subtle background, border, and left accent strip. Conflict cards should remain visibly red-tinted and may use a compact numeric badge.

Keep compact cards readable under narrow columns:

- Use small padding changes before increasing column width.
- Prefer `line-clamp` for names and `white-space: nowrap` for location.
- Watch for conflict badges stealing too much width on mobile.
- If card text becomes one-character-per-line in a normal phone viewport, the grid is too wide or the card content is too large.

## Verification Checklist

Run `npm run build`.

Use browser checks for:

- `390px` mobile viewport shows Monday through Sunday without default horizontal overflow.
- Extremely narrow viewport or pinch zoom produces horizontal scroll through `.grid-container`.
- Two-finger horizontal pinch increases grid width; pinching back returns to compact mode.
- Cells keep transparent section tinting; background images or theme background remain visible.
- Conflict cards and normal cards still render at the measured grid size.
- Drag hit-testing still finds `.cell[data-day][data-period]`.
