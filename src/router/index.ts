import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import CourseListView from "../views/CourseListView.vue";
import CourseTablesView from "../views/CourseTablesView.vue";
import SettingsView from "../views/SettingsView.vue";
import StyleSettings from "../views/settings/StyleSettings.vue";
import PresetSettings from "../views/settings/PresetSettings.vue";

const routes = [
  { path: "/", name: "home", component: HomeView },
  { path: "/courses", name: "courses", component: CourseListView },
  { path: "/tables", name: "tables", component: CourseTablesView },
  { path: "/settings", name: "settings", component: SettingsView },
  { path: "/style", name: "style", component: StyleSettings },
  { path: "/style/presets", name: "presets", component: PresetSettings },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
