import { KEYBOARD_INSET_VAR, keyboardInsetFrom } from "@/utils/keyboardInset";

/// 把"被软键盘挡住的高度"写进 --kb-inset，底部面板据此整体上移（读它的地方见 popups.css 与
/// ImportSheet.vue）。判据和为什么不写 interactive-widget 都在 utils/keyboardInset.ts 里。
///
/// 模块级副作用，由 main.ts 引一次就够。没有 visualViewport 时什么都不做：桌面浏览器和旧
/// WebView 里键盘本来就不盖住页面，凭空写一个偏移反而会让面板浮起来。
let installed = false;

export function installKeyboardInset(): void {
  if (installed) return;
  if (typeof window === "undefined" || !window.visualViewport) return;
  installed = true;

  const viewport = window.visualViewport;
  /// 只在数值真的变化时写：键盘动画期间 resize 每帧都触发，每帧写一次 CSS 变量会让面板跟着抖。
  let last = -1;

  const apply = () => {
    const inset = keyboardInsetFrom({
      innerHeight: window.innerHeight,
      viewportHeight: viewport.height,
      viewportOffsetTop: viewport.offsetTop
    });
    if (inset === last) return;
    last = inset;
    document.documentElement.style.setProperty(KEYBOARD_INSET_VAR, `${inset}px`);
  };

  viewport.addEventListener("resize", apply);
  // 键盘弹起/收起时 offsetTop 也会变，只盯 resize 会漏掉一部分机型与输入法。
  viewport.addEventListener("scroll", apply);
  // 横竖屏切换后视觉视口要重新量一次，不能等下一次键盘事件。
  window.addEventListener("orientationchange", apply);

  apply();
}
