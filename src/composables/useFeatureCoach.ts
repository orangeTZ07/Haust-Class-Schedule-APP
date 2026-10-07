import { computed, ref } from "vue";
import {
  addSeenStepIds,
  autoCoachQueue,
  firstSettingsCoachIndex,
  isSettingsCoachTarget,
  manualCoachQueue,
  type CoachPresentation
} from "@/utils/featureCoach";

const coachMode = ref<"auto" | "manual" | null>(null);
const coachQueue = ref<CoachPresentation[]>([]);
const coachIndex = ref(0);
const coachPhase = ref<"cue" | "spotlight">("spotlight");

const coachStep = computed(() => coachQueue.value[coachIndex.value] ?? null);
const coachIsLast = computed(
  () => coachQueue.value.length > 0 && coachIndex.value >= coachQueue.value.length - 1
);

const hideOverlay = () => {
  coachMode.value = null;
  coachQueue.value = [];
  coachIndex.value = 0;
  coachPhase.value = "spotlight";
};

const startQueue = (mode: "auto" | "manual", steps: CoachPresentation[], startIndex = 0) => {
  if (steps.length === 0) {
    hideOverlay();
    return;
  }
  const index = Math.min(Math.max(startIndex, 0), steps.length - 1);
  coachMode.value = mode;
  coachQueue.value = steps;
  coachIndex.value = index;
  const step = steps[index];
  coachPhase.value = step.offHome ? "cue" : "spotlight";
};

const markCurrentSeen = () => {
  if (coachMode.value !== "auto") return;
  const id = coachStep.value?.id;
  if (id) addSeenStepIds(localStorage, [id]);
};

/// Auto tour. No-ops while an overlay is already up, so leaving settings does not restart
/// the current step. Deferred steps stay unseen.
const startAutoCoach = (options: Parameters<typeof autoCoachQueue>[0]) => {
  if (coachMode.value) return;
  startQueue("auto", autoCoachQueue(options));
};

/// Full tutorial from the home hamburger. Does not clear the seen-id record.
const startManualCoach = () => {
  startQueue("manual", manualCoachQueue());
};

/// 操作指南 while already on /settings: jump to 外观 in spotlight, no home-cue loop.
const startManualCoachFromSettings = () => {
  const steps = manualCoachQueue();
  startQueue("manual", steps, firstSettingsCoachIndex(steps));
  coachPhase.value = "spotlight";
};

/// Skip / close / Escape. On settings the overlay goes away and seen ids stay as they were.
/// On home, remaining queued steps are marked seen so the tour does not keep coming back.
const dismissCoach = (onSettings: boolean) => {
  if (!onSettings && coachMode.value === "auto") {
    addSeenStepIds(localStorage, coachQueue.value.map(step => step.id));
  }
  hideOverlay();
};

/// 下一步 / 知道了. Already on settings: the next settings step only moves the spotlight.
const advanceCoach = (onSettings: boolean) => {
  markCurrentSeen();
  if (coachIndex.value < coachQueue.value.length - 1) {
    coachIndex.value += 1;
    const step = coachQueue.value[coachIndex.value];
    if (isSettingsCoachTarget(step.target) && onSettings) {
      coachPhase.value = "spotlight";
    } else {
      coachPhase.value = step.offHome ? "cue" : "spotlight";
    }
    return;
  }
  hideOverlay();
};

const followCoachCue = () => {
  coachPhase.value = "spotlight";
};

const dropCurrentStep = () => {
  const next = coachQueue.value.filter((_, index) => index !== coachIndex.value);
  coachQueue.value = next;
  if (next.length === 0) {
    hideOverlay();
    return;
  }
  if (coachIndex.value >= next.length) coachIndex.value = next.length - 1;
  const step = next[coachIndex.value];
  coachPhase.value = step.offHome ? "cue" : "spotlight";
};

export const useFeatureCoach = () => ({
  coachMode,
  coachQueue,
  coachIndex,
  coachPhase,
  coachStep,
  coachIsLast,
  startAutoCoach,
  startManualCoach,
  startManualCoachFromSettings,
  dismissCoach,
  advanceCoach,
  followCoachCue,
  dropCurrentStep,
  hideOverlay
});
