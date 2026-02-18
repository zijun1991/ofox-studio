/**
 * Skill 执行器
 * 将 Skill 指令注入到对话中
 */

import type { SkillDefinition } from './SkillLoader'

/**
 * Skill 执行上下文
 */
export interface SkillExecutionContext {
  /** 会话 ID */
  sessionId: string
  /** 用户传入的参数 */
  args: string
}

/**
 * Skill 执行器
 */
export class SkillExecutor {
  /**
   * 构建 Skill 提示词
   * 将 Skill 指令转换为可注入的消息
   */
  buildSkillPrompt(skill: SkillDefinition, args: string): string {
    let prompt = `# Skill: ${skill.name}\n\n`
    prompt += `${skill.description}\n\n`

    // 添加指令
    prompt += `## Instructions\n\n${skill.instructions}\n\n`

    // 添加约束
    if (skill.constraints && skill.constraints.length > 0) {
      prompt += `## Constraints\n\n`
      prompt += skill.constraints.map((c) => `- ${c}`).join('\n')
      prompt += '\n\n'
    }

    // 添加所需工具
    if (skill.tools && skill.tools.length > 0) {
      prompt += `## Required Tools\n\n`
      prompt += skill.tools.map((t) => `- ${t}`).join('\n')
      prompt += '\n\n'
    }

    // 添加示例
    if (skill.examples && skill.examples.length > 0) {
      prompt += `## Examples\n\n`
      for (const example of skill.examples) {
        prompt += `**Input:** ${example.input}\n`
        prompt += `**Output:** ${example.output}\n\n`
      }
    }

    // 添加用户输入
    prompt += `## User Input\n\n${args}`

    return prompt
  }

  /**
   * 执行 Skill
   * 返回构建好的提示词，由 Agent 调用 LLM
   */
  async execute(skill: SkillDefinition, context: SkillExecutionContext): Promise<string> {
    return this.buildSkillPrompt(skill, context.args)
  }

  /**
   * 构建 Skill 系统提示词
   * 用于将 Skill 注入到 Agent 的系统提示词中
   */
  buildSystemPromptAddition(skill: SkillDefinition): string {
    let addition = `\n\n## Skill: ${skill.name}\n\n`
    addition += `${skill.description}\n\n`
    addition += skill.instructions

    if (skill.constraints && skill.constraints.length > 0) {
      addition += '\n\n### Constraints\n'
      addition += skill.constraints.map((c) => `- ${c}`).join('\n')
    }

    return addition
  }

  /**
   * 批量构建系统提示词附加
   */
  buildSystemPromptAdditions(skills: SkillDefinition[]): string {
    return skills.map((s) => this.buildSystemPromptAddition(s)).join('\n')
  }
}
