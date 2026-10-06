// 课表拖动只跟正在抓的那一条课段走。别的卡片必须拿到同一个零偏移，
// 不能因为每次渲染都 new 一个 {x:0,y:0} 而带动画或误当成自己在被拖。

export const DRAG_ZERO = Object.freeze({ x: 0, y: 0 });

export interface DragOffsetState {
  scheduleId: number;
  offsetX: number;
  offsetY: number;
  hasMoved: boolean;
}

export const isDraggingSchedule = (
  drag: DragOffsetState | null | undefined,
  scheduleId: number
): boolean =>
  !!drag && drag.scheduleId === scheduleId && drag.hasMoved;

export const offsetForSchedule = (
  drag: DragOffsetState | null | undefined,
  scheduleId: number
): { readonly x: number; readonly y: number } => {
  if (!drag || drag.scheduleId !== scheduleId) return DRAG_ZERO;
  return { x: drag.offsetX, y: drag.offsetY };
};
