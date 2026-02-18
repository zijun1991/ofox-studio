/**
 * SkillLoader 测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SkillLoader } from '../../src/skills/SkillLoader'
import {
  invalidSkillInvalidYaml,
  invalidSkillMissingDescription,
  invalidSkillMissingName,
  invalidSkillNoFrontmatter,
  validSkillMarkdown
} from '../mocks/skills'

describe('SkillLoader', () => {
  let loader: SkillLoader

  beforeEach(() => {
    loader = new SkillLoader()
    loader.clearCache()
  })

  describe('parseSkillMarkdown', () => {
    // 通过 loadSkill 间接测试 parseSkillMarkdown

    it('应正确解析有效的 YAML frontmatter', async () => {
      // 创建临时文件来测试解析
      const tempPath = `/tmp/test-skill-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      const skillDir = path.join(tempPath, 'test-skill')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), validSkillMarkdown)

      const testLoader = new SkillLoader({ skillsPath: tempPath })
      const skill = await testLoader.loadSkill('test-skill')

      expect(skill).not.toBeNull()
      expect(skill?.name).toBe('yaml-skill')
      expect(skill?.description).toBe('Skill from YAML frontmatter')
      expect(skill?.version).toBe('1.0.0')
      expect(skill?.constraints).toContain('Be helpful')
      expect(skill?.tools).toContain('read_file')
      expect(skill?.instructions).toContain('# Skill Instructions')

      // 清理
      await fs.rm(tempPath, { recursive: true, force: true })
    })

    it('缺少 name 应返回 null', async () => {
      const tempPath = `/tmp/test-skill-invalid-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      const skillDir = path.join(tempPath, 'invalid-skill')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), invalidSkillMissingName)

      const testLoader = new SkillLoader({ skillsPath: tempPath })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const skill = await testLoader.loadSkill('invalid-skill')

      expect(skill).toBeNull()

      warnSpy.mockRestore()
      await fs.rm(tempPath, { recursive: true, force: true })
    })

    it('缺少 description 应返回 null', async () => {
      const tempPath = `/tmp/test-skill-invalid2-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      const skillDir = path.join(tempPath, 'invalid-skill2')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), invalidSkillMissingDescription)

      const testLoader = new SkillLoader({ skillsPath: tempPath })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const skill = await testLoader.loadSkill('invalid-skill2')

      expect(skill).toBeNull()

      warnSpy.mockRestore()
      await fs.rm(tempPath, { recursive: true, force: true })
    })

    it('缺少 frontmatter 应返回 null', async () => {
      const tempPath = `/tmp/test-skill-no-fm-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      const skillDir = path.join(tempPath, 'no-fm-skill')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), invalidSkillNoFrontmatter)

      const testLoader = new SkillLoader({ skillsPath: tempPath })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const skill = await testLoader.loadSkill('no-fm-skill')

      expect(skill).toBeNull()

      warnSpy.mockRestore()
      await fs.rm(tempPath, { recursive: true, force: true })
    })

    it('无效 YAML 应返回 null', async () => {
      const tempPath = `/tmp/test-skill-invalid-yaml-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      const skillDir = path.join(tempPath, 'invalid-yaml-skill')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), invalidSkillInvalidYaml)

      const testLoader = new SkillLoader({ skillsPath: tempPath })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const skill = await testLoader.loadSkill('invalid-yaml-skill')

      expect(skill).toBeNull()

      warnSpy.mockRestore()
      await fs.rm(tempPath, { recursive: true, force: true })
    })
  })

  describe('缓存', () => {
    it('应正确缓存已加载的 Skill', async () => {
      const tempPath = `/tmp/test-skill-cache-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      const skillDir = path.join(tempPath, 'cached-skill')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), validSkillMarkdown)

      const testLoader = new SkillLoader({ skillsPath: tempPath })

      const skill1 = await testLoader.loadSkill('cached-skill')
      const skill2 = await testLoader.loadSkill('cached-skill')

      expect(skill1).toBe(skill2) // 应该是同一个对象引用

      await fs.rm(tempPath, { recursive: true, force: true })
    })

    it('应正确清除缓存', () => {
      loader.clearCache()

      // 使用 getSkill 测试缓存被清除
      const skill = loader.getSkill('any-skill')
      expect(skill).toBeUndefined()
    })
  })

  describe('getSkill', () => {
    it('应返回缓存中的 Skill', async () => {
      const tempPath = `/tmp/test-skill-get-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      const skillDir = path.join(tempPath, 'get-skill')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), validSkillMarkdown)

      const testLoader = new SkillLoader({ skillsPath: tempPath })
      await testLoader.loadSkill('get-skill')

      const cached = testLoader.getSkill('get-skill')
      expect(cached).toBeDefined()
      expect(cached?.name).toBe('yaml-skill')

      await fs.rm(tempPath, { recursive: true, force: true })
    })

    it('未加载的 Skill 应返回 undefined', () => {
      const skill = loader.getSkill('not-loaded')
      expect(skill).toBeUndefined()
    })
  })

  describe('getAllSkills', () => {
    it('应返回所有已加载的 Skills', async () => {
      // 使用唯一的路径名
      const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const tempPath = `/tmp/test-skill-all-${uniqueId}`
      const fs = await import('fs/promises')
      const path = await import('path')

      // 创建多个 skill 目录，目录名和 YAML name 保持一致避免缓存 key 冲突
      const skill1Name = `skill-one-${uniqueId}`
      const skill2Name = `skill-two-${uniqueId}`
      const skill1Dir = path.join(tempPath, skill1Name)
      const skill2Dir = path.join(tempPath, skill2Name)
      await fs.mkdir(skill1Dir, { recursive: true })
      await fs.mkdir(skill2Dir, { recursive: true })

      // YAML name 与目录名一致
      const skill1Content = `---
name: ${skill1Name}
description: First skill
---
Instructions 1`
      const skill2Content = `---
name: ${skill2Name}
description: Second skill
---
Instructions 2`

      await fs.writeFile(path.join(skill1Dir, 'SKILL.md'), skill1Content)
      await fs.writeFile(path.join(skill2Dir, 'SKILL.md'), skill2Content)

      // 创建新的 loader 实例
      const testLoader = new SkillLoader({ skillsPath: tempPath })
      await testLoader.loadAllSkills()

      const allSkills = testLoader.getAllSkills()
      expect(allSkills.size).toBe(2)
      expect(allSkills.has(skill1Name)).toBe(true)
      expect(allSkills.has(skill2Name)).toBe(true)

      await fs.rm(tempPath, { recursive: true, force: true })
    })
  })

  describe('loadAllSkills', () => {
    it('应跳过以点开头的目录', async () => {
      const tempPath = `/tmp/test-skill-hidden-${Date.now()}`
      const fs = await import('fs/promises')
      const path = await import('path')

      // 创建普通和隐藏目录
      const normalDir = path.join(tempPath, 'normal-skill')
      const hiddenDir = path.join(tempPath, '.hidden-skill')
      await fs.mkdir(normalDir, { recursive: true })
      await fs.mkdir(hiddenDir, { recursive: true })

      const normalContent = `---
name: normal-skill
description: Normal skill
---
Instructions`
      await fs.writeFile(path.join(normalDir, 'SKILL.md'), normalContent)
      await fs.writeFile(path.join(hiddenDir, 'SKILL.md'), normalContent)

      const testLoader = new SkillLoader({ skillsPath: tempPath })
      await testLoader.loadAllSkills()

      const allSkills = testLoader.getAllSkills()
      expect(allSkills.size).toBe(1)
      expect(allSkills.has('normal-skill')).toBe(true)

      await fs.rm(tempPath, { recursive: true, force: true })
    })

    it('目录不存在时不应抛出错误', async () => {
      const testLoader = new SkillLoader({ skillsPath: '/non/existent/path' })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(testLoader.loadAllSkills()).resolves.not.toThrow()

      warnSpy.mockRestore()
    })
  })
})
