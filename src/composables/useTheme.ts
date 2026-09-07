import { ref, computed, watch } from "vue";

export type ThemeMode = "light" | "dark";

export interface ThemeConfig {
  mode: ThemeMode;
  cardOpacity: number;
  cardBorderWidth: number;
  cardBorderColor: string;
  cardBorderRadius: number;
  gridLineColor: string;
  gridLineOpacity: number;
  headerBgColor: string;
  headerTextColor: string;
  bodyTextColor: string;
  bgColor: string;
  bgImage: string;
  bgImageOpacity: number;
  bgBlur: number;
  hideIcons?: boolean;
  flatStyle?: boolean;
}

// 极简白 (亮色)
const pureMinimalistPreset: ThemeConfig = {
  mode: "light",
  cardOpacity: 10,
  cardBorderWidth: 1,
  cardBorderColor: "#e5e7eb",
  cardBorderRadius: 4,
  gridLineColor: "#f3f4f6",
  gridLineOpacity: 100,
  headerBgColor: "#ffffff",
  headerTextColor: "#111827",
  bodyTextColor: "#374151",
  bgColor: "#ffffff",
  bgImage: "",
  bgImageOpacity: 0,
  bgBlur: 0,
  hideIcons: true,
  flatStyle: true,
};

// 极简黑 (暗色)
const darkMinimalistPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 10,
  cardBorderWidth: 1,
  cardBorderColor: "#262626",
  cardBorderRadius: 4,
  gridLineColor: "#171717",
  gridLineOpacity: 100,
  headerBgColor: "#000000",
  headerTextColor: "#ffffff",
  bodyTextColor: "#a3a3a3",
  bgColor: "#000000",
  bgImage: "",
  bgImageOpacity: 0,
  bgBlur: 0,
  hideIcons: true,
  flatStyle: true,
};

// Vant 蓝预设
const vantBluePreset: ThemeConfig = {
  mode: "light",
  cardOpacity: 30,
  cardBorderWidth: 1,
  cardBorderColor: "#d0d0d0",
  cardBorderRadius: 6,
  gridLineColor: "#e8e8e8",
  gridLineOpacity: 100,
  headerBgColor: "#1989fa",
  headerTextColor: "#ffffff",
  bodyTextColor: "#333333",
  bgColor: "#ffffff",
  bgImage: "",
  bgImageOpacity: 30,
  bgBlur: 0,
};

// Catppuccin Latte 预设（默认）
const catppuccinLattePreset: ThemeConfig = {
  mode: "light",
  cardOpacity: 30,
  cardBorderWidth: 1,
  cardBorderColor: "#bcc0cc",
  cardBorderRadius: 8,
  gridLineColor: "#ccd0da",
  gridLineOpacity: 100,
  headerBgColor: "#e6e9ef",
  headerTextColor: "#4c4f69",
  bodyTextColor: "#4c4f69",
  bgColor: "#eff1f5",
  bgImage: "",
  bgImageOpacity: 30,
  bgBlur: 0,
};

// Macaron (亮色) - 粉嫩马卡龙
const macaronPreset: ThemeConfig = {
  mode: "light",
  cardOpacity: 40,
  cardBorderWidth: 0,
  cardBorderColor: "#fce7f3",
  cardBorderRadius: 12,
  gridLineColor: "#fce7f3",
  gridLineOpacity: 100,
  headerBgColor: "#fdf2f8",
  headerTextColor: "#db2777",
  bodyTextColor: "#831843",
  bgColor: "#fdf2f8",
  bgImage: "",
  bgImageOpacity: 30,
  bgBlur: 0,
};

// Nordic (亮色) - 清新北欧蓝
const nordicPreset: ThemeConfig = {
  mode: "light",
  cardOpacity: 35,
  cardBorderWidth: 1,
  cardBorderColor: "#d1d5db",
  cardBorderRadius: 10,
  gridLineColor: "#e5e7eb",
  gridLineOpacity: 100,
  headerBgColor: "#f3f4f6",
  headerTextColor: "#1f2937",
  bodyTextColor: "#374151",
  bgColor: "#f9fafb",
  bgImage: "",
  bgImageOpacity: 30,
  bgBlur: 0,
};

// Sakura (亮色) - 樱花粉
const sakuraPreset: ThemeConfig = {
  mode: "light",
  cardOpacity: 40,
  cardBorderWidth: 1,
  cardBorderColor: "#fecaca",
  cardBorderRadius: 12,
  gridLineColor: "#fee2e2",
  gridLineOpacity: 100,
  headerBgColor: "#fff1f2",
  headerTextColor: "#e11d48",
  bodyTextColor: "#9f1239",
  bgColor: "#fff1f2",
  bgImage: "",
  bgImageOpacity: 30,
  bgBlur: 0,
};

// Deep Sea (暗色) - 深海蓝
const deepSeaPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 25,
  cardBorderWidth: 1,
  cardBorderColor: "#1e3a8a",
  cardBorderRadius: 8,
  gridLineColor: "#1e293b",
  gridLineOpacity: 100,
  headerBgColor: "#0f172a",
  headerTextColor: "#38bdf8",
  bodyTextColor: "#94a3b8",
  bgColor: "#020617",
  bgImage: "",
  bgImageOpacity: 20,
  bgBlur: 0,
};

// Forest (暗色) - 丛林绿
const forestPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 25,
  cardBorderWidth: 1,
  cardBorderColor: "#064e3b",
  cardBorderRadius: 8,
  gridLineColor: "#065f46",
  gridLineOpacity: 100,
  headerBgColor: "#022c22",
  headerTextColor: "#34d399",
  bodyTextColor: "#6ee7b7",
  bgColor: "#011c16",
  bgImage: "",
  bgImageOpacity: 20,
  bgBlur: 0,
};

// Cyberpunk (暗色)
const cyberpunkPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 30,
  cardBorderWidth: 1,
  cardBorderColor: "#f0abfc",
  cardBorderRadius: 4,
  gridLineColor: "#701a75",
  gridLineOpacity: 100,
  headerBgColor: "#2e1065",
  headerTextColor: "#f0abfc",
  bodyTextColor: "#e879f9",
  bgColor: "#0f172a",
  bgImage: "",
  bgImageOpacity: 20,
  bgBlur: 0,
};

// Nord (暗色) - 北欧极光
const nordDarkPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 25,
  cardBorderWidth: 1,
  cardBorderColor: "#4c566a",
  cardBorderRadius: 8,
  gridLineColor: "#3b4252",
  gridLineOpacity: 100,
  headerBgColor: "#2e3440",
  headerTextColor: "#88c0d0",
  bodyTextColor: "#d8dee9",
  bgColor: "#2e3440",
  bgImage: "",
  bgImageOpacity: 0,
  bgBlur: 0,
};

// Dracula (暗色) - 经典德古拉
const draculaPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 30,
  cardBorderWidth: 1,
  cardBorderColor: "#6272a4",
  cardBorderRadius: 8,
  gridLineColor: "#44475a",
  gridLineOpacity: 100,
  headerBgColor: "#282a36",
  headerTextColor: "#bd93f9",
  bodyTextColor: "#f8f8f2",
  bgColor: "#282a36",
  bgImage: "",
  bgImageOpacity: 0,
  bgBlur: 0,
};

// Gruvbox (暗色) - 复古怀旧
const gruvboxDarkPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 30,
  cardBorderWidth: 1,
  cardBorderColor: "#504945",
  cardBorderRadius: 6,
  gridLineColor: "#3c3836",
  gridLineOpacity: 100,
  headerBgColor: "#282828",
  headerTextColor: "#ebdbb2",
  bodyTextColor: "#bdae93",
  bgColor: "#282828",
  bgImage: "",
  bgImageOpacity: 0,
  bgBlur: 0,
};

// Solarized Light (亮色)
const solarizedLightPreset: ThemeConfig = {
  mode: "light",
  cardOpacity: 25,
  cardBorderWidth: 1,
  cardBorderColor: "#93a1a1",
  cardBorderRadius: 4,
  gridLineColor: "#eee8d5",
  gridLineOpacity: 100,
  headerBgColor: "#fdf6e3",
  headerTextColor: "#586e75",
  bodyTextColor: "#657b83",
  bgColor: "#fdf6e3",
  bgImage: "",
  bgImageOpacity: 0,
  bgBlur: 0,
};

// 默认亮色预设
const lightPreset = catppuccinLattePreset;

// Catppuccin Mocha 预设（暗色）
const darkPreset: ThemeConfig = {
  mode: "dark",
  cardOpacity: 20,
  cardBorderWidth: 1,
  cardBorderColor: "#45475a",
  cardBorderRadius: 8,
  gridLineColor: "#313244",
  gridLineOpacity: 100,
  headerBgColor: "#181825",
  headerTextColor: "#cdd6f4",
  bodyTextColor: "#cdd6f4",
  bgColor: "#1e1e2e",
  bgImage: "",
  bgImageOpacity: 20,
  bgBlur: 0,
};

const themeConfig = ref<ThemeConfig>({ ...lightPreset });

const STORAGE_KEY = "course-mngr-theme";

function loadFromStorage(): ThemeConfig | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return null;
}

function saveToStorage(config: ThemeConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

const saved = loadFromStorage();
if (saved) {
  Object.assign(themeConfig.value, saved);
}

function buildCssVariables(config: ThemeConfig) {
  return {
    "--theme-bg-color": config.bgColor,
    "--theme-card-opacity": config.cardOpacity / 100,
    "--theme-card-border-width": `${config.cardBorderWidth}px`,
    "--theme-card-border-color": config.cardBorderColor,
    "--theme-card-border-radius": `${config.cardBorderRadius}px`,
    "--theme-grid-line-color": config.gridLineColor,
    "--theme-grid-line-opacity": config.gridLineOpacity / 100,
    "--theme-header-bg": config.headerBgColor,
    "--theme-header-text": config.headerTextColor,
    "--theme-body-text": config.bodyTextColor,
    "--theme-bg-image": config.bgImage ? `url(${config.bgImage})` : "none",
    "--theme-bg-image-opacity": config.bgImageOpacity / 100,
    "--theme-bg-blur": `${config.bgBlur}px`,
  };
}

function syncRootCssVariables(config: ThemeConfig) {
  if (typeof document === "undefined") return;

  Object.entries(buildCssVariables(config)).forEach(([name, value]) => {
    document.documentElement.style.setProperty(name, String(value));
  });
}

syncRootCssVariables(themeConfig.value);

// 预设列表
export interface PresetInfo {
  id: string;
  name: string;
  preset: ThemeConfig;
  color: string;
}

export const presetList: PresetInfo[] = [
  {
    id: "pure-minimalist",
    name: "极简白 (亮)",
    preset: pureMinimalistPreset,
    color: "#ffffff"
  },
  {
    id: "dark-minimalist",
    name: "极简黑 (暗)",
    preset: darkMinimalistPreset,
    color: "#000000"
  },
  {
    id: "catppuccin-latte",
    name: "默认亮色",
    preset: catppuccinLattePreset,
    color: "#eff1f5"
  },
  {
    id: "macaron",
    name: "柔和马卡龙 (亮)",
    preset: macaronPreset,
    color: "#fdf2f8"
  },
  {
    id: "nordic",
    name: "清新北欧 (亮)",
    preset: nordicPreset,
    color: "#f9fafb"
  },
  {
    id: "sakura",
    name: "浪漫樱花 (亮)",
    preset: sakuraPreset,
    color: "#fff1f2"
  },
  {
    id: "vant-blue",
    name: "Vant 经典",
    preset: vantBluePreset,
    color: "#1989fa"
  },
  {
    id: "catppuccin-mocha",
    name: "默认暗色",
    preset: darkPreset,
    color: "#1e1e2e"
  },
  {
    id: "deep-sea",
    name: "幽蓝深海 (暗)",
    preset: deepSeaPreset,
    color: "#020617"
  },
  {
    id: "forest",
    name: "静谧丛林 (暗)",
    preset: forestPreset,
    color: "#011c16"
  },
  {
    id: "cyberpunk",
    name: "霓虹极客 (暗)",
    preset: cyberpunkPreset,
    color: "#0f172a"
  },
  {
    id: "nord-dark",
    name: "北欧极地 (暗)",
    preset: nordDarkPreset,
    color: "#2e3440"
  },
  {
    id: "dracula",
    name: "德古拉 (暗)",
    preset: draculaPreset,
    color: "#282a36"
  },
  {
    id: "gruvbox-dark",
    name: "复古怀旧 (暗)",
    preset: gruvboxDarkPreset,
    color: "#282828"
  },
  {
    id: "solarized-light",
    name: "柔和日光 (亮)",
    preset: solarizedLightPreset,
    color: "#fdf6e3"
  }
];

export function useTheme() {
  const isDark = computed(() => themeConfig.value.mode === "dark");

  const cssVariables = computed(() => {
    return buildCssVariables(themeConfig.value);
  });

  const toggleMode = () => {
    themeConfig.value.mode = isDark.value ? "light" : "dark";
    if (isDark.value) {
      applyPreset(darkPreset);
    } else {
      applyPreset(lightPreset);
    }
  };

  const applyPreset = (preset: ThemeConfig) => {
    const { bgImage, bgImageOpacity, bgBlur } = themeConfig.value;
    Object.assign(themeConfig.value, { 
      ...preset, 
      mode: themeConfig.value.mode,
      bgImage,
      bgImageOpacity,
      bgBlur
    });
    saveToStorage(themeConfig.value);
  };

  const applyLightPreset = () => applyPreset(lightPreset);
  const applyDarkPreset = () => applyPreset(darkPreset);
  const applyVantBluePreset = () => applyPreset(vantBluePreset);
  const applyCatppuccinLattePreset = () => applyPreset(catppuccinLattePreset);

  const applyPresetById = (id: string) => {
    const preset = presetList.find(p => p.id === id);
    if (preset) {
      applyPreset(preset.preset);
    }
  };

  const currentPresetId = computed(() => {
    const current = presetList.find(p => 
      p.preset.bgColor === themeConfig.value.bgColor &&
      p.preset.headerBgColor === themeConfig.value.headerBgColor
    );
    return current?.id || "catppuccin-latte";
  });

  const updateConfig = (key: keyof ThemeConfig, value: any) => {
    (themeConfig.value as any)[key] = value;
    saveToStorage(themeConfig.value);
  };

  const setBgImage = (dataUrl: string) => {
    themeConfig.value.bgImage = dataUrl;
    saveToStorage(themeConfig.value);
  };

  const clearBgImage = () => {
    themeConfig.value.bgImage = "";
    saveToStorage(themeConfig.value);
  };

  watch(themeConfig, () => {
    saveToStorage(themeConfig.value);
    syncRootCssVariables(themeConfig.value);
  }, { deep: true });

  return {
    themeConfig,
    isDark,
    cssVariables,
    currentPresetId,
    toggleMode,
    applyLightPreset,
    applyDarkPreset,
    applyVantBluePreset,
    applyCatppuccinLattePreset,
    applyPresetById,
    updateConfig,
    setBgImage,
    clearBgImage,
  };
}
