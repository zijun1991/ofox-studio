/**
 * SkillExecutor 测试
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { SkillExecutor } from '../../src/skills/SkillExecutor'
import type { SkillDefinition } from '../../src/skills/SkillLoader'
import { mockFullSkill, mockSimpleSkill } from '../mocks/skills'

describe('SkillExecutor', () => {
  let executor: SkillExecutor

  beforeEach(() => {
    executor = new SkillExecutor()
  })

  describe('buildSkillPrompt', () => {
    it('应包含 Skill 名称和描述', () => {
      const prompt = executor.buildSkillPrompt(mockSimpleSkill, 'test input')

      expect(prompt).toContain('# Skill: test-skill')
      expect(prompt).toContain('A test skill for unit testing')
    })

    it('应包含指令内容', () => {
      const prompt = executor.buildSkillPrompt(mockFullSkill, 'test input')

      expect(prompt).toContain('## Instructions')
      expect(prompt).toContain('# Full Skill Instructions')
    })

    it('应包含约束条件', () => {
      const prompt = executor.buildSkillPrompt(mockFullSkill, 'test input')

      expect(prompt).toContain('## Constraints')
      expect(prompt).toContain('- Do not harm anyone')
      expect(prompt).toContain('- Always be truthful')
    })

    it('无约束条件时应省略约束部分', () => {
      const prompt = executor.buildSkillPrompt(mockSimpleSkill, 'test input')

      expect(prompt).not.toContain('## Constraints')
    })

    it('应包含工具要求', () => {
      const prompt = executor.buildSkillPrompt(mockFullSkill, 'test input')

      expect(prompt).toContain('## Required Tools')
      expect(prompt).toContain('- read_file')
      expect(prompt).toContain('- write_file')
    })

    it('无工具要求时应省略工具部分', () => {
      const prompt = executor.buildSkillPrompt(mockSimpleSkill, 'test input')

      expect(prompt).not.toContain('## Required Tools')
    })

    it('应包含示例', () => {
      const prompt = executor.buildSkillPrompt(mockFullSkill, 'test input')

      expect(prompt).toContain('## Examples')
      expect(prompt).toContain('**Input:** Read the config file')
      expect(prompt).toContain('**Output:** Successfully read config.json')
    })

    it('无示例时应省略示例部分', () => {
      const prompt = executor.buildSkillPrompt(mockSimpleSkill, 'test input')

      expect(prompt).not.toContain('## Examples')
    })

    it('应包含用户输入', () => {
      const prompt = executor.buildSkillPrompt(mockSimpleSkill, 'My custom input')

      expect(prompt).toContain('## User Input')
      expect(prompt).toContain('My custom input')
    })

    it('完整技能应包含所有部分', () => {
      const prompt = executor.buildSkillPrompt(mockFullSkill, 'user request')

      expect(prompt).toContain('# Skill: full-skill')
      expect(prompt).toContain('A full skill with all fields')
      expect(prompt).toContain('## Instructions')
      expect(prompt).toContain('## Constraints')
      expect(prompt).toContain('## Required Tools')
      expect(prompt).toContain('## Examples')
      expect(prompt).toContain('## User Input')
    })
  })

  describe('execute', () => {
    it('应返回构建好的提示词', async () => {
      const context = {
        sessionId: 'test-session',
        args: 'Test arguments'
      }

      const result = await executor.execute(mockSimpleSkill, context)

      expect(result).toContain('# Skill: test-skill')
      expect(result).toContain('Test arguments')
    })
  })

  describe('buildSystemPromptAddition', () => {
    it('应正确构建单个 Skill 的系统提示词', () => {
      const addition = executor.buildSystemPromptAddition(mockFullSkill)

      expect(addition).toContain('## Skill: full-skill')
      expect(addition).toContain('A full skill with all fields')
      expect(addition).toContain('# Full Skill Instructions')
    })

    it('应包含约束条件', () => {
      const addition = executor.buildSystemPromptAddition(mockFullSkill)

      expect(addition).toContain('### Constraints')
      expect(addition).toContain('- Do not harm anyone')
    })

    it('无约束条件时应省略约束部分', () => {
      const addition = executor.buildSystemPromptAddition(mockSimpleSkill)

      expect(addition).not.toContain('### Constraints')
    })
  })

  describe('buildSystemPromptAdditions', () => {
    it('应正确批量构建系统提示词', () => {
      const skills: SkillDefinition[] = [mockSimpleSkill, mockFullSkill]

      const additions = executor.buildSystemPromptAdditions(skills)

      expect(additions).toContain('## Skill: test-skill')
      expect(additions).toContain('## Skill: full-skill')
    })

    it('空数组应返回空字符串', () => {
      const additions = executor.buildSystemPromptAdditions([])

      expect(additions).toBe('')
    })

    it('每个 Skill 之间应有分隔', () => {
      const skills: SkillDefinition[] = [mockSimpleSkill, mockFullSkill]

      const additions = executor.buildSystemPromptAdditions(skills)

      // 验证两个 Skill 都被包含且正确分隔
      const firstIndex = additions.indexOf('## Skill: test-skill')
      const secondIndex = additions.indexOf('## Skill: full-skill')

      expect(firstIndex).toBeGreaterThan(-1)
      expect(secondIndex).toBeGreaterThan(-1)
      expect(secondIndex).toBeGreaterThan(firstIndex)
    })
  })
})
