import { onBeforeUnmount } from "vue";

// Lets the back key (Android's, or a browser's back button) close a full-screen overlay instead
// of leaving the page behind it.
//
// The overlay pushes one history entry when it opens. Back then pops that entry, which fires
// `popstate`, and `onBack` closes the overlay: the page underneath never moves. When the overlay
// is closed any other way (a button, Esc) the entry is popped again with `release`, so a
// 完成 followed by back leaves the page in one step, not two.
//
// The entry has the same URL and a copy of the current `history.state`, so vue-router (hash
// mode) sees a pop to the route it is already on: it re-resolves the same route, nothing is
// remounted, and the page keeps its state.

let nextId = 0;
const MARK = "__overlay";

export function useBackClose(onBack: () => boolean | void) {
  const id = ++nextId;
  /// Our entry is on top of the history stack.
  let pushed = false;
  /// `popstate` events that `release` caused itself and must not treat as a back press.
  let ignore = 0;

  const push = () => {
    if (pushed) return;
    window.history.pushState({ ...window.history.state, [MARK]: id }, "", window.location.href);
    pushed = true;
  };

  /// Closing without the back key: take our entry off the stack again.
  const release = () => {
    if (!pushed) return;
    pushed = false;
    ignore += 1;
    window.history.back();
  };

  const onPopState = () => {
    if (ignore > 0) {
      ignore -= 1;
      return;
    }
    if (!pushed) return;
    pushed = false;
    // The overlay may refuse (it is busy); the entry then goes back on the stack.
    if (onBack() === false) push();
  };

  window.addEventListener("popstate", onPopState);
  onBeforeUnmount(() => {
    window.removeEventListener("popstate", onPopState);
    // Torn down while open, e.g. by a navigation: only pop if the entry is still the top one.
    // After a router push the top entry is a different one, and going back would undo it.
    if (pushed && window.history.state?.[MARK] === id) release();
    pushed = false;
  });

  return { push, release };
}
