# Changelog

本文件记录项目对用户有意义的变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 怎么用（给协作者）

1. **平时**：合并进 `main` 的有感变更，写进最上面的 `[Unreleased]`。
2. **发版时**：
   - 把 `[Unreleased]` 里的条目剪到新版本节，例如 `## [0.2.0] - 2026-09-08`
   - 清空后留一个空的 `[Unreleased]`
   - 同步改 `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` 的 `version`
   - 提交后打 tag：`git tag v0.2.0 && git push origin v0.2.0`
   - Release 工作流会自动把 `## [0.2.0]` 这一节填进 GitHub Release 正文（找不到对应节会失败）
3. **写什么**：用用户能看懂的一句话；别写「重构 xxx 文件」这种实现细节。
4. **分类**（有内容才写，空的整节删掉）：
   - `Added` 新功能
   - `Changed` 已有行为变化
   - `Deprecated` 即将移除
   - `Removed` 已移除
   - `Fixed` 缺陷修复
   - `Security` 安全相关

**本文件是 Release 说明的唯一来源。** tag 名 `v0.2.0` 必须能对应到 `## [0.2.0]`。

## [Unreleased]

## [0.2.0] - 2026-10-06

### Added

- 教务系统在线同步：支持输入学号与密码直接从河南科技大学教务系统同步课表到应用
- 离线课表文件导入：支持直接选取本地 JSON 备份文件导入课表，无需联网
- iOS 平台支持：新增 iOS 构建配置与 GitHub Actions 自动化打包工作流

### Fixed

- 修复 Android 端上课提醒因底层参数解析失败而未实际生效的问题
- 修复设置页中提醒失败时将错误原因误显示为「undefined」的问题
- 修复导入备份后执行「恢复课表数据」反而会清空最新课表的问题
- 修复教务系统网关拦截 403 导致无法连接的问题

## [0.1.1] - 2026-10-03

### Added

- 点击课表格子空白处即可添加课程
- 侧栏支持左缘滑动打开、拖动跟手与滑动关闭
- 侧栏「重置课表视图」：恢复缩放与滚动位置
- 侧栏「恢复课表数据」：回到最近一次导入时的课表快照（需确认）
- 脚本将教务爬虫 JSON 转为应用可导入的备份格式

### Fixed

- Android 上在课程块区域无法正常上下滑动课表
- 课程块与节次网格对齐不准
- 顶部周次选择与菜单在部分机型上被状态栏挡住
- 拖拽删除课程时目标区域过小、不易命中
- 侧栏手势与拖课程、双指缩放冲突，以及菜单项偶尔点不动
- 「重置视图」未恢复课表区域的纵向滚动
- GitHub Release 页面附带应用图标

## [0.1.0] - 2026-09-08

### Added

- 基于 Vue 3 + Tauri 的河南科技大学课程表应用（Android）
- 周视图课程表，支持课程块展示与交互
- 课程导入 / 导出
- 待办与学习计划
- 上课提醒（含 Android 相关能力）
- 主题、背景、网格等个性化设置
- 面向新手的 README 与协作说明
- GitHub Actions 安卓纯 CI（合入 `main` 前验证可编译）
- 基于 `v*` 标签自动构建 APK 并发布 GitHub Release
