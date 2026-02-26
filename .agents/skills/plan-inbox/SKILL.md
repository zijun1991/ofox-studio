---
name: plan-inbox
description: Manage the plan/ directory as an inbox for unexecuted implementation plans. Use when creating, reviewing, or completing plans to ensure proper lifecycle management.
---

# Plan Inbox Management

`plan/` 目录是未实施计划的收集箱，不纳入版本控制。

## 规则

1. **新计划归档于此**：当创建实现方案但暂不执行时，将计划文档保存到 `plan/` 目录。
2. **文件命名**：使用 kebab-case，简明描述计划内容，如 `scheduler-concurrency-queue.md`。
3. **计划实施后必须移除**：当某个计划被完整实施（代码已提交）后，必须从 `plan/` 目录中删除对应文件。
4. **不纳入 Git**：`plan/` 已在 `.gitignore` 中，不要尝试 `git add` 其中的文件。

## 计划文档格式

每个计划文档应包含以下章节：

```
# <计划标题>

## Context
为什么需要这个变更，解决什么问题。

## 修改文件
列出需要修改的文件路径。

## 实现方案
具体的代码变更，包含代码片段和 diff。

## 行为变化
修改前后的对比表格（可选）。

## 验证方式
如何确认实施正确。
```

## 工作流

### 创建计划
```bash
# 在 plan/ 下创建新计划
# 文件名 = kebab-case 描述 + .md
plan/my-feature-name.md
```

### 查看待办计划
```bash
ls plan/
```

### 实施计划后清理
当计划对应的代码变更已提交到仓库后：
```bash
rm plan/<plan-name>.md
```
