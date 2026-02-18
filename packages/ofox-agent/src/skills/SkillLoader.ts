/**
 * Skill 加载器
 * 从 .agents/skills/ 目录加载 Skill 定义
 */

import fs from 'fs/promises'
import path from 'path'
import yaml from 'yaml'

/**
 * Skill 定义
 */
export interface SkillDefinition {
  /** Skill 名称 */
  name: string
  /** Skill 描述 */
  description: string
  /** 版本 */
  version?: string
  /** 作者 */
  author?: string
  /** Markdown 指令内容 */
  instructions: string
  /** 约束条件 */
  constraints?: string[]
  /** 所需工具 */
  tools?: string[]
  /** 示例 */
  examples?: Array<{ input: string; output: string }>
}

/**
 * Skill 加载器配置
 */
export interface SkillLoaderConfig {
  /** Skills 目录路径 */
  skillsPath: string
}

/**
 * 默认 Skills 路径
 */
const DEFAULT_SKILLS_PATH = '.agents/skills'

/**
 * Skill 加载器
 */
export class SkillLoader {
  private skillsPath: string
  private skillsCache: Map<string, SkillDefinition> = new Map()
  private loaded = false

  constructor(config?: Partial<SkillLoaderConfig>) {
    this.skillsPath = config?.skillsPath || DEFAULT_SKILLS_PATH
  }

  /**
   * 加载单个 Skill
   */
  async loadSkill(skillName: string): Promise<SkillDefinition | null> {
    // 检查缓存
    if (this.skillsCache.has(skillName)) {
      return this.skillsCache.get(skillName)!
    }

    const skillPath = path.join(this.skillsPath, skillName, 'SKILL.md')

    try {
      const content = await fs.readFile(skillPath, 'utf-8')
      const skill = this.parseSkillMarkdown(content)

      if (skill) {
        this.skillsCache.set(skillName, skill)
      }

      return skill
    } catch (error) {
      console.warn(`Failed to load skill: ${skillName}`, error)
      return null
    }
  }

  /**
   * 加载所有 Skills
   */
  async loadAllSkills(): Promise<Map<string, SkillDefinition>> {
    if (this.loaded) {
      return this.skillsCache
    }

    try {
      const entries = await fs.readdir(this.skillsPath, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const skill = await this.loadSkill(entry.name)
          if (skill) {
            this.skillsCache.set(skill.name, skill)
          }
        }
      }

      this.loaded = true
    } catch (error) {
      console.warn('Failed to load skills directory:', error)
    }

    return this.skillsCache
  }

  /**
   * 获取已加载的 Skill
   */
  getSkill(name: string): SkillDefinition | undefined {
    return this.skillsCache.get(name)
  }

  /**
   * 获取所有已加载的 Skills
   */
  getAllSkills(): Map<string, SkillDefinition> {
    return this.skillsCache
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.skillsCache.clear()
    this.loaded = false
  }

  /**
   * 解析 Skill Markdown 文件
   */
  private parseSkillMarkdown(content: string): SkillDefinition | null {
    // 匹配 YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)

    if (!frontmatterMatch) {
      console.warn('Invalid skill format: missing frontmatter')
      return null
    }

    try {
      const frontmatter = yaml.parse(frontmatterMatch[1])
      const instructions = frontmatterMatch[2].trim()

      // 验证必需字段
      if (!frontmatter.name || !frontmatter.description) {
        console.warn('Invalid skill: missing name or description')
        return null
      }

      return {
        name: frontmatter.name,
        description: frontmatter.description,
        version: frontmatter.version,
        author: frontmatter.author,
        instructions,
        constraints: frontmatter.constraints,
        tools: frontmatter.tools,
        examples: frontmatter.examples
      }
    } catch (error) {
      console.warn('Failed to parse skill frontmatter:', error)
      return null
    }
  }
}
