// 软键盘挡住多高 —— 纯函数，命令行可测（scripts/test-keyboard-inset.mjs）。
//
// 为什么需要它：index.html 的 viewport 没写 interactive-widget 时，按规范默认是 resizes-visual
// —— 键盘只压"视觉视口"，布局视口（vh / dvh / %）一动不动。而这个 App 又是 edge-to-edge
// （system-bars 插件把窗口设成 decorFitsSystemWindows(false)），系统不再为键盘缩小窗口，原生
// 那边也只测量 systemBars()（IME 明确不在内，见 SystemBarsPlugin.kt 的 measure()）。
//
// 三条加在一起：键盘弹起时，所有按布局视口定位的底部面板，下半截留在键盘后面；面板内部滚动区的
// "布局高度"也没变，可滚动余量已经用尽 —— 于是面板纹丝不动，末尾的按钮永远滑不上来
// （导入课表里的「开始同步」就是这么被挡住的）。
//
// 被视觉视口压掉的那部分，就是键盘占掉的那部分。

/// 小于这个高度不算键盘：地址栏收放和取整都会抖出几像素，照着它动面板反而会跳。
export const MIN_KEYBOARD_PX = 40;

/// 写到 <html> 上的 CSS 变量名。底部面板在自己的样式里读它。
export const KEYBOARD_INSET_VAR = "--kb-inset";

export interface ViewportMetrics {
  /// window.innerHeight：布局视口高度
  innerHeight: number;
  /// window.visualViewport.height：真正能看见的那块高度
  viewportHeight: number;
  /// window.visualViewport.offsetTop：视觉视口相对布局视口被顶掉的部分
  viewportOffsetTop: number;
}

/// 键盘挡住的高度（CSS 像素，取整）；不足 MIN_KEYBOARD_PX、或数值不是数时一律返回 0。
export const keyboardInsetFrom = ({ innerHeight, viewportHeight, viewportOffsetTop }: ViewportMetrics): number => {
  if (![innerHeight, viewportHeight, viewportOffsetTop].every((value) => Number.isFinite(value))) return 0;

  const covered = innerHeight - viewportHeight - viewportOffsetTop;
  if (!Number.isFinite(covered) || covered < MIN_KEYBOARD_PX) return 0;

  return Math.round(covered);
};
