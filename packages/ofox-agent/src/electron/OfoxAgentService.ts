/**
 * OfoxAgent Electron 服务
 * 管理 Agent 实例的生命周期，数据持久化到 Ofox Claw 数据目录
 */

import { app } from 'electron'

import { OfoxAgent, type OfoxAgentConfig } from '../core/OfoxAgent'
import type { StreamChunk } from '../types/message'

/**
 * OfoxAgent Electron 服务
 */
class OfoxAgentService {
  private static instance: OfoxAgentService | null = null
  private agents: Map<string, OfoxAgent> = new Map()

  private constructor() {
    // 注册清理处理器
    app.on('will-quit', () => {
      this.cleanup().catch((err) => {
        console.error('OfoxAgent cleanup error:', err)
      })
    })
  }

  /**
   * 获取单例实例
   */
  static getInstance(): OfoxAgentService {
    if (!OfoxAgentService.instance) {
      OfoxAgentService.instance = new OfoxAgentService()
    }
    return OfoxAgentService.instance
  }

  /**
   * 创建或获取 Agent 实例
   * 数据库文件存储在 {userData}/Data/OfoxAgent/{agentId}.db
   */
  async getAgent(agentId: string, config: OfoxAgentConfig): Promise<OfoxAgent> {
    if (this.agents.has(agentId)) {
      return this.agents.get(agentId)!
    }

    const agent = new OfoxAgent(`${agentId}.db`, config)
    await agent.initialize()

    this.agents.set(agentId, agent)
    return agent
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId)
  }

  /**
   * 移除 Agent 实例
   */
  async removeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (agent) {
      await agent.cleanup()
      this.agents.delete(agentId)
    }
  }

  /**
   * 快捷聊天方法
   */
  async chat(agentId: string, sessionId: string, content: string, config: OfoxAgentConfig): Promise<string> {
    const agent = await this.getAgent(agentId, config)
    return agent.chat(sessionId, content)
  }

  /**
   * 快捷流式聊天方法
   */
  async *chatStream(
    agentId: string,
    sessionId: string,
    content: string,
    config: OfoxAgentConfig
  ): AsyncIterable<StreamChunk> {
    const agent = await this.getAgent(agentId, config)
    yield* agent.chatStream(sessionId, content)
  }

  /**
   * 执行 Skill
   */
  async executeSkill(
    agentId: string,
    sessionId: string,
    skillName: string,
    args: string,
    config: OfoxAgentConfig
  ): Promise<string> {
    const agent = await this.getAgent(agentId, config)
    return agent.executeSkill(sessionId, skillName, args)
  }

  /**
   * 获取会话历史
   */
  async getSessionHistory(
    agentId: string,
    sessionId: string,
    config: OfoxAgentConfig,
    limit?: number
  ): Promise<{ id: string; role: string; content: string | unknown; createdAt: string }[]> {
    const agent = await this.getAgent(agentId, config)
    const messages = await agent.getSessionHistory(sessionId, limit)
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt
    }))
  }

  /**
   * 清除会话
   */
  async clearSession(agentId: string, sessionId: string, config: OfoxAgentConfig): Promise<void> {
    const agent = await this.getAgent(agentId, config)
    return agent.clearSession(sessionId)
  }

  /**
   * 清理所有 Agent 资源
   */
  async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.agents.values()).map((agent) =>
      agent.cleanup().catch((err) => console.error('Agent cleanup error:', err))
    )
    await Promise.all(cleanupPromises)
    this.agents.clear()
  }

  /**
   * 获取所有 Agent ID
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys())
  }

  /**
   * 获取 Agent 数量
   */
  getAgentCount(): number {
    return this.agents.size
  }
}

// 导出单例
export const ofoxAgentService = OfoxAgentService.getInstance()
export { OfoxAgentService }
