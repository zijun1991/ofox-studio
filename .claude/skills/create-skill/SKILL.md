---
name: create-skill
description: Step-by-step guide for creating a new project-level skill. Use when asked to create, add, or register a new skill in this repository.
---

# Create a Project-Level Skill

本指南描述了在本仓库中创建一个新的项目级 skill 的完整流程。

## 目录结构

```
.agents/skills/           ← skill 源文件（提交到 git）
  public-skills.txt       ← 公开 skill 名称列表（每行一个，按字母序排列）
  .gitignore              ← 由 pnpm skills:sync 自动生成，不要手动编辑
  <skill-name>/
    SKILL.md              ← skill 定义文件

.claude/skills/           ← 由 pnpm skills:sync 自动同步，不要手动编辑
  .gitignore              ← 由 pnpm skills:sync 自动生成
  <skill-name>/
    SKILL.md              ← 从 .agents/skills/ 复制而来
```

## 创建步骤

### 1. 编写 SKILL.md

在 `.agents/skills/<skill-name>/SKILL.md` 创建文件。文件必须以 YAML front matter 开头：

```markdown
---
name: <skill-name>
description: <一句话描述 skill 的用途和触发条件>
---

# <Skill 标题>

<正文内容：规则、工作流、参考信息等>
```

**命名规则**：
- 目录名使用 kebab-case（如 `plan-inbox`、`channel-architecture`）
- `name` 字段必须与目录名完全一致
- `description` 应说明 skill 的用途以及 AI 助手什么时候应该使用它

**内容指导**：
- 参考类 skill（如架构指南）：包含数据流图、关键文件索引、类型定义、常量表
- 流程类 skill（如 PR 创建）：包含步骤说明、命令示例、模板
- 管理类 skill（如计划收集箱）：包含规则、文件格式、工作流

### 2. 注册到 public-skills.txt

编辑 `.agents/skills/public-skills.txt`，添加新 skill 名称。**保持按字母序排列**。

```
channel-architecture
create-skill          ← 新增
gh-create-pr
plan-inbox
turbo-architecture
```

### 3. 运行同步

```bash
pnpm skills:sync
```

此命令会：
- 将 `.agents/skills/<skill-name>/SKILL.md` 复制到 `.claude/skills/<skill-name>/SKILL.md`
- 更新 `.agents/skills/.gitignore` 和 `.claude/skills/.gitignore`（白名单机制）

### 4. 验证

```bash
pnpm skills:check
```

检查项：
- `.gitignore` 文件与 `public-skills.txt` 一致
- `.claude/skills/` 中的 SKILL.md 内容与 `.agents/skills/` 中的完全相同
- git 中跟踪的 skill 文件均在白名单内

### 5. Git Add

同步和验证通过后，必须将以下文件加入 git 暂存区：

```bash
git add \
  .agents/skills/<skill-name>/SKILL.md \
  .agents/skills/public-skills.txt \
  .agents/skills/.gitignore \
  .claude/skills/<skill-name>/SKILL.md \
  .claude/skills/.gitignore
```

**这一步是必须的**——skill 文件受 `.gitignore` 白名单机制管理，如果不执行 `git add`，新创建的 skill 不会被 git 跟踪，也无法提交到仓库。

## 同步机制说明

- `.agents/skills/` 是 skill 的唯一源（source of truth）
- `.claude/skills/` 是自动生成的镜像，Claude Code 从这里读取 skill
- `pnpm skills:sync` 通过文件复制保持两端一致（跨平台兼容，不使用 symlink）
- `.gitignore` 采用白名单模式：默认忽略所有内容，仅放行 `public-skills.txt` 中列出的 skill

## 注意事项

- 不要手动编辑 `.claude/skills/` 下的任何文件
- 不要手动编辑 `.agents/skills/.gitignore` 或 `.claude/skills/.gitignore`
- 修改 SKILL.md 内容后必须重新运行 `pnpm skills:sync`
- 运行 `pnpm skills:check` 可以在 CI 中作为门禁检查
