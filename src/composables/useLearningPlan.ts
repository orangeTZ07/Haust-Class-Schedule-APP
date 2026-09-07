import { computed, readonly, ref } from "vue";
import {
  getDefaultLearningPlanPreference,
  loadLearningPlanPreference,
  saveLearningPlanPreference,
  type LearningPlanPreference
} from "@/services/learningPlanService";

const preference = ref<LearningPlanPreference>(loadLearningPlanPreference());

function applyPreference(nextPreference: LearningPlanPreference) {
  preference.value = saveLearningPlanPreference(nextPreference);
}

export function useLearningPlan() {
  const hasPreference = computed(() => {
    return Boolean(
      preference.value.extraLearningContent.trim() ||
      preference.value.desiredWorkload.trim()
    );
  });

  const resetPreference = () => {
    applyPreference(getDefaultLearningPlanPreference());
  };

  const updatePreference = (nextPreference: LearningPlanPreference) => {
    applyPreference(nextPreference);
  };

  return {
    preference: readonly(preference),
    hasPreference,
    updatePreference,
    resetPreference
  };
}
