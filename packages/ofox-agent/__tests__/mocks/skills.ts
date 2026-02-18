/**
 * Mock Skills for testing
 */

import type { SkillDefinition } from '../../src/skills/SkillLoader'

/**
 * 简单测试 Skill
 */
export const mockSimpleSkill: SkillDefinition = {
  name: 'test-skill',
  description: 'A test skill for unit testing',
  instructions: 'This is the instruction content for the test skill.'
}

/**
 * 完整测试 Skill
 */
export const mockFullSkill: SkillDefinition = {
  name: 'full-skill',
  description: 'A full skill with all fields',
  version: '1.0.0',
  author: 'Test Author',
  instructions: `# Full Skill Instructions

This skill demonstrates all possible fields.

## Guidelines
1. Always be helpful
2. Never harm anyone`,
  constraints: ['Do not harm anyone', 'Always be truthful'],
  tools: ['read_file', 'write_file'],
  examples: [
    { input: 'Read the config file', output: 'Successfully read config.json' },
    { input: 'Write a log entry', output: 'Successfully wrote to app.log' }
  ]
}

/**
 * 多个测试 Skills
 */
export const mockMultipleSkills: SkillDefinition[] = [
  mockSimpleSkill,
  mockFullSkill,
  {
    name: 'third-skill',
    description: 'Another skill',
    instructions: 'Third skill instructions'
  }
]

/**
 * 创建自定义测试 Skill
 */
export function createMockSkill(overrides?: Partial<SkillDefinition>): SkillDefinition {
  return {
    name: 'custom-skill',
    description: 'Custom skill description',
    instructions: 'Custom skill instructions',
    ...overrides
  }
}

/**
 * 有效 SKILL.md 内容 (YAML frontmatter + Markdown)
 */
export const validSkillMarkdown = `---
name: yaml-skill
description: Skill from YAML frontmatter
version: 1.0.0
constraints:
  - Be helpful
  - Be safe
tools:
  - read_file
examples:
  - input: Test input
    output: Test output
---

# Skill Instructions

This is the markdown content that serves as instructions.

## More Details
Additional instruction content.`

/**
 * 无效 SKILL.md 内容 (缺少 name)
 */
export const invalidSkillMissingName = `---
description: Missing name field
---

Instructions content.`

/**
 * 无效 SKILL.md 内容 (缺少 description)
 */
export const invalidSkillMissingDescription = `---
name: missing-description
---

Instructions content.`

/**
 * 无效 SKILL.md 内容 (缺少 frontmatter)
 */
export const invalidSkillNoFrontmatter = `Just some markdown content without YAML frontmatter.`

/**
 * 无效 SKILL.md 内容 (无效 YAML)
 */
export const invalidSkillInvalidYaml = `---
name: [invalid yaml
description: broken
---

Instructions content.`
