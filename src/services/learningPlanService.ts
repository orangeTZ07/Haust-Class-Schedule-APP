export interface LearningPlanPreference {
  extraLearningContent: string;
  desiredWorkload: string;
}

const STORAGE_KEY = "course-mngr-learning-plan-preference";

const defaultPreference: LearningPlanPreference = {
  extraLearningContent: "",
  desiredWorkload: ""
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function loadLearningPlanPreference(): LearningPlanPreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaultPreference };
    }

    const parsed = JSON.parse(raw) as Partial<LearningPlanPreference>;
    return {
      extraLearningContent: normalizeString(parsed.extraLearningContent),
      desiredWorkload: normalizeString(parsed.desiredWorkload)
    };
  } catch (error) {
    console.error("Failed to load learning plan preference", error);
    return { ...defaultPreference };
  }
}

export function saveLearningPlanPreference(preference: LearningPlanPreference): LearningPlanPreference {
  const normalized = {
    extraLearningContent: normalizeString(preference.extraLearningContent),
    desiredWorkload: normalizeString(preference.desiredWorkload)
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function getDefaultLearningPlanPreference(): LearningPlanPreference {
  return { ...defaultPreference };
}
