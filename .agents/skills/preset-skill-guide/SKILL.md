---
name: preset-skill-guide
description: 指导如何将 skill 添加到 resources/preset-skills 目录，使其随应用打包分发并在首次启动时自动安装到用户的 Turbo Agent。当被要求添加预设 skill、内置 skill、或向 preset-skills 添加内容时使用。
---

# 创建 Preset Skill（预设 Skill）

本指南描述了如何创建随应用打包分发的 preset skill。Preset skill 在用户首次启动应用时自动安装到 Turbo Agent 的 `.claude/skills/` 目录。

## Preset Skill 与 Project Skill 的区别

| 特性 | Project Skill | Preset Skill |
|------|---------------|--------------|
| 源目录 | `.agents/skills/` | `resources/preset-skills/` |
| 目标用户 | 开发者（本仓库贡献者） | 终端用户（应用使用者） |
| 安装方式 | `pnpm skills:sync` 手动同步 | 应用启动时自动安装 |
| 注册机制 | `public-skills.txt` + `.gitignore` 白名单 | 无需注册，放入目录即可 |
| 运行环境 | Claude Code（开发时） | Turbo Agent（用户使用时） |

## 目录结构

```
resources/preset-skills/
  <skill-name>/
    SKILL.md        <- 必需，skill 定义文件
    [其他文件]       <- 可选，整个目录会被递归复制
```

## 创建步骤

### 1. 创建 Skill 目录

在 `resources/preset-skills/` 下创建目录：

```bash
mkdir -p resources/preset-skills/<skill-name>
```

**命名规则**：
- 使用 kebab-case，仅允许字母、数字、连字符、下划线
- **不允许点号**（`.`），否则不会被 `findAllSkillDirectories()` 识别
- 目录名将作为安装后的 skill 目录名

### 2. 编写 SKILL.md

在 `resources/preset-skills/<skill-name>/SKILL.md` 创建文件。文件必须以 YAML frontmatter 开头：

```markdown
---
name: <skill-name>
description: <描述 skill 用途和触发条件>
---

# <Skill 标题>

<正文内容>
```

**Frontmatter 字段**：
- `name`（必需）— 必须与目录名完全一致
- `description`（必需）— 说明 skill 用途，以及 AI 什么时候应该使用此 skill
- `tools`（可选）— skill 使用的工具列表
- `tags`（可选）— 分类标签
- `version`（可选）— 版本号
- `author`（可选）— 作者信息

**Description 编写要点**：
- 包含触发关键词（用户说什么时使用此 skill）
- 如果依赖特定 MCP server，在 description 中明确提及

**正文结构建议**：
1. 适用场景 — 什么时候使用此 skill
2. 执行流程 — 分步骤说明具体操作
3. 工具参考 — 涉及的 MCP 工具及用法
4. 高级场景 — 可选，进阶用法
5. 注意事项 — 限制条件和常见问题

### 3. 验证

开发模式下重启应用，检查：

1. Turbo Agent 的 `.claude/skills/` 目录中是否出现新 skill 目录
2. `.claude/plugins.json` 中是否有对应条目

## 运行时行为

### 构建打包

`electron-builder.yml` 中的 `asarUnpack: resources/**` 确保 `resources/preset-skills/` 在打包时被解包到 asar 外，运行时可直接通过文件系统访问。

### 启动安装

`AgentService.initializePresetSkills()` 负责自动安装（`src/main/services/agents/services/AgentService.ts:120-197`）：

1. 定位 preset-skills 目录（打包环境用 `getResourcePath()`，开发环境用 `app.getAppPath()/resources`）
2. 调用 `findAllSkillDirectories()` 扫描所有合法 skill 目录
3. 对每个 skill：
   - 如果目标路径 `.claude/skills/<skill-name>/` **已存在则跳过**（不覆盖用户修改）
   - 否则调用 `PluginInstaller.installSkill()` 递归复制整个目录
4. 安装完成后更新 `.claude/plugins.json` 元数据缓存

### 重要限制

- **不会自动更新**：已安装的 skill 不会被覆盖。如需强制更新，用户必须手动删除 `.claude/skills/<skill-name>/` 目录后重启应用
- **不需要注册到 `public-skills.txt`**：那是 project skill 的同步机制
- **不需要运行 `pnpm skills:sync`**：preset skill 有独立的安装路径

## 现有 Preset Skill 参考

按复杂度递增排列：

| Skill | 说明 | 参考价值 |
|-------|------|----------|
| `test-echo` | 最简示例，仅含基础 SKILL.md | 了解最小结构 |
| `find-skills` | 使用外部 CLI (`npx skills`) | 了解如何引用外部工具 |
| `image-review` | 中文 skill，调用多模态 LLM | 了解 `@ofox/llm` MCP server 用法 |
| `web-screenshot` | 完整示例，依赖 `@ofox/webview` MCP server | 了解复杂 skill 的组织方式 |

## 完整示例

以下是一个依赖 MCP server 的 preset skill 模板：

```markdown
---
name: my-new-skill
description: 一句话描述用途和触发条件。当用户说"xxx"或"yyy"时使用。依赖 @ofox/xxx MCP server。
---

# Skill 标题

使用 `@ofox/xxx` MCP 服务器完成 xxx 功能。

## 适用场景

- 用户要求"xxx"
- 用户需要 yyy

## 执行流程

### 第 1 步：准备

描述准备工作...

### 第 2 步：执行

描述核心操作，包含工具调用示例：

\```
tool_name({ param1: "value1", param2: "value2" })
\```

### 第 3 步：输出结果

描述如何呈现结果给用户...

## 工具参考

| 工具 | 来源 | 用途 |
|------|------|------|
| `tool_name` | `@ofox/xxx` | 做什么 |

## 注意事项

- 限制条件 1
- 限制条件 2
```
