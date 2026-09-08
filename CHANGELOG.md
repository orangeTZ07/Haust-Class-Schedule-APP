# Changelog

本文件记录项目对用户有意义的变更。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 怎么用（给协作者）

1. **平时**：合并进 `main` 的有感变更，写进最上面的 `[Unreleased]`。
2. **发版时**：
   - 把 `[Unreleased]` 里的条目剪到新版本节，例如 `## [0.2.0] - 2026-09-08`
   - 清空后留一个空的 `[Unreleased]`
   - 同步改 `package.json` / `src-tauri/tauri.conf.json` 的 `version`
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
