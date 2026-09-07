# UI 架构与设计说明

本项目采用了基于 **Vue 3 + Vite + Tauri** 的现代化移动端/桌面端混合架构。UI 设计风格强调“玻璃拟态 (Glassmorphism)”与“极简主义”，通过深度定制的主题系统提供极高的视觉自由度。

## 核心设计理念
1. **动态主题化**: 通过 `useTheme` 状态管理，将所有关键视觉属性（颜色、不透明度、圆角、边框）映射为 CSS 全局变量（如 `--theme-bg-color`），实现一键切换预设。
2. **沉浸式体验**: 采用全屏布局，支持自定义背景图、背景模糊（Blur）及毛玻璃效果（Backdrop Filter），使课程表在不同背景下均保持良好的可读性与美感。
3. **流畅交互**: 组件（如 `CourseBlock`）大量使用 CSS Transition 与 `cubic-bezier` 曲线，确保在移动端拥有类原生的丝滑手感。

## 关键组件说明
### 1. 课程表现系统 (`src/components/timetable/`)
- **WeekGrid.vue**: 核心布局容器，利用 CSS Grid 实现时间轴与日期列的交叉对齐。
- **CourseBlock.vue**: 核心交互单元。支持动态跨行显示（`span`），并集成了“原地放大”功能，通过 `z-index` 延迟回收技术解决了重叠与叠影问题。

### 2. 布局系统 (`src/components/layout/`)
- **TopBar.vue**: 承载导航与全局操作。
- **SideBar.vue**: 抽屉式菜单，提供功能入口。
- **TabBar.vue**: 底部常驻导航（如果存在）。

### 3. 主题系统 (`src/composables/useTheme.ts`)
- 定义了 `ThemeConfig` 接口，涵盖模式（亮/暗）、卡片透明度、网格线透明度等 10+ 个维度。
- 提供 `presetList` 预设列表（如：极简白、深海、樱花、德古拉等）。

## 样式规范
- **变量化**: 严禁在组件内写死颜色，必须引用 `variables.css` 或 `useTheme` 提供的变量。
- **混合色应用**: 广泛使用 CSS `color-mix()` 函数，根据主题色自动推导边框色与高亮色。
- **自适应**: 布局适配不同屏幕比例，特别针对 Android 端的沉浸式状态栏进行了考量。
