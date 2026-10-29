/// 启动屏（index.html 里的 #app-splash）的退场逻辑。
///
/// 启动屏是纯 HTML/CSS：它在 Vue 挂载之前就已经画好了，所以"什么时候撤掉它"必须在 JS 里单独决定。
/// 规则三条：
///   1. 至少显示 MIN_VISIBLE_MS —— 数据库本来就快时（本地 SQLite、空课表）不能让启动屏闪一下；
///   2. 撤的时候先淡出（FADE_MS），淡完把节点整个删掉，别留一层透明节点挡住点击；
///   3. 系统开了"减少动态效果"就跳过淡出，直接删。
///
/// 最多等 MAX_SPLASH_MS：数据读失败或卡住时也必须进得了 App，不能把人锁在启动屏上。

const SPLASH_ID = "app-splash";

/** 最短可见时间：低于这个值启动屏会闪一下，反而像卡顿。 */
export const MIN_VISIBLE_MS = 900;

/** 淡出时长，必须和 index.html 里 #app-splash 的 transition 保持一致。 */
export const FADE_MS = 320;

/** 兜底：数据迟迟不就绪也不能一直卡在启动屏。 */
export const MAX_SPLASH_MS = 6000;

/**
 * 淡出并移除启动屏。重复调用是安全的（节点已经没了就什么都不做）。
 *
 * @param elapsed 从"启动屏出现"到现在的毫秒数，默认用 performance.now()。
 *               传入更大的值可以让"最短可见时间"立刻满足（测试里用来跳过等待）。
 */
export function hideAppSplash(elapsed: number = performance.now()): void {
  if (typeof document === "undefined") return;
  if (!document.getElementById(SPLASH_ID)) return;

  const remain = Math.max(0, MIN_VISIBLE_MS - elapsed);
  window.setTimeout(() => {
    const node = document.getElementById(SPLASH_ID);
    if (!node) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion) {
      node.remove();
      return;
    }

    node.classList.add("is-leaving");
    window.setTimeout(() => node.remove(), FADE_MS);
  }, remain);
}
