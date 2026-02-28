import os from 'node:os'
import path from 'node:path'

import { loggerService } from '@logger'
import { PluginInstaller } from '@main/services/agents/plugins/PluginInstaller'
import { pluginService } from '@main/services/agents/plugins/PluginService'
import { getDataPath, getResourcePath } from '@main/utils'
import { findAllSkillDirectories, parseSkillMetadata } from '@main/utils/markdownParser'
import type {
  AgentEntity,
  CreateAgentRequest,
  CreateAgentResponse,
  GetAgentResponse,
  InstalledPlugin,
  ListOptions,
  UpdateAgentRequest,
  UpdateAgentResponse
} from '@types'
import { AgentBaseSchema, BuiltinMCPServerNames } from '@types'
import { asc, count, desc, eq } from 'drizzle-orm'
import { app } from 'electron'
import * as fs from 'fs'

import { BaseService } from '../BaseService'
import { type AgentRow, agentsTable, type InsertAgentRow } from '../database/schema'
import type { AgentModelField } from '../errors'

const logger = loggerService.withContext('AgentService')

// System agent constants
export const TURBO_AGENT_ID = 'agent_turbo_system'

export class AgentService extends BaseService {
  private static instance: AgentService | null = null
  private readonly modelFields: AgentModelField[] = ['model', 'plan_model', 'small_model']
  private readonly installer = new PluginInstaller()

  static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService()
    }
    return AgentService.instance
  }

  /**
   * Ensure the Turbo (Speedy Mode) system agent exists
   * Called on app startup to create the default system agent
   */
  async ensureTurboAgentExists(): Promise<void> {
    const existing = await this.getAgent(TURBO_AGENT_ID)

    if (existing) {
      // Migration: Ensure all default MCPs exist in Turbo Agent
      const defaultMCPs = [
        BuiltinMCPServerNames.scheduler,
        BuiltinMCPServerNames.fetch,
        BuiltinMCPServerNames.webview,
        BuiltinMCPServerNames.llm
      ]
      const currentMcps: string[] = Array.isArray(existing.mcps) ? existing.mcps : []
      const missingMcps = defaultMCPs.filter((m) => !currentMcps.includes(m))
      if (missingMcps.length > 0) {
        const updatedMcps = [...currentMcps, ...missingMcps]
        logger.info('Migrating Turbo Agent: Adding missing default MCPs', { missingMcps })
        const database = await this.getDatabase()
        await database
          .update(agentsTable)
          .set({
            mcps: JSON.stringify(updatedMcps),
            updated_at: new Date().toISOString()
          })
          .where(eq(agentsTable.id, TURBO_AGENT_ID))
        logger.info('Turbo Agent migrated successfully')
      }

      // Migration: Ensure Turbo Agent has default permission_mode
      const currentConfig = (existing.configuration as Record<string, unknown>) || {}
      if (!currentConfig.permission_mode) {
        const updatedConfig = { ...currentConfig, permission_mode: 'bypassPermissions' }
        logger.info('Migrating Turbo Agent: Setting default permission_mode to bypassPermissions')
        const db = await this.getDatabase()
        await db
          .update(agentsTable)
          .set({
            configuration: JSON.stringify(updatedConfig),
            updated_at: new Date().toISOString()
          })
          .where(eq(agentsTable.id, TURBO_AGENT_ID))
      }

      // Initialize preset skills for existing agent (installs new skills if any)
      const workdir = existing.accessible_paths?.[0]
      if (workdir) {
        await this.initializePresetSkills(workdir)
      }
      return
    }

    logger.info('Creating Turbo agent for Speedy Mode')

    const defaultPath = path.join(os.homedir(), 'Documents', 'Ofox Claw')
    const now = new Date().toISOString()

    const insertData: InsertAgentRow = {
      id: TURBO_AGENT_ID,
      type: 'claude-code',
      name: '极速模式',
      description: '快速响应的极速助手，适用于简单任务',
      instructions: 'You are a fast and efficient assistant.',
      model: '', // User will configure
      accessible_paths: JSON.stringify(this.ensurePathsExist([defaultPath])),
      mcps: JSON.stringify([
        BuiltinMCPServerNames.scheduler,
        BuiltinMCPServerNames.fetch,
        BuiltinMCPServerNames.webview,
        BuiltinMCPServerNames.llm
      ]),
      configuration: JSON.stringify({ permission_mode: 'bypassPermissions' }),
      is_system: true,
      created_at: now,
      updated_at: now
    }

    const database = await this.getDatabase()
    await database.insert(agentsTable).values(insertData)
    logger.info('Turbo agent created successfully')

    // Initialize preset skills for the new Turbo agent
    await this.initializePresetSkills(defaultPath)
  }

  /**
   * Initialize preset skills from resources/preset-skills directory
   * This copies bundled skills to the agent's workspace on first run
   */
  private async initializePresetSkills(workdir: string): Promise<void> {
    const presetSkillsPath = app.isPackaged
      ? path.join(getResourcePath(), 'preset-skills')
      : path.join(app.getAppPath(), 'resources', 'preset-skills')

    // Check if preset-skills directory exists
    try {
      await fs.promises.access(presetSkillsPath, fs.constants.R_OK)
    } catch {
      logger.debug('Preset skills directory not found, skipping initialization', { presetSkillsPath })
      return
    }

    // Find all skill directories
    const skillDirs = await findAllSkillDirectories(presetSkillsPath, presetSkillsPath)
    if (skillDirs.length === 0) {
      logger.debug('No preset skills found', { presetSkillsPath })
      return
    }

    const targetSkillsPath = path.join(workdir, '.claude', 'skills')
    const claudePath = path.join(workdir, '.claude')
    const cachePath = path.join(claudePath, 'plugins.json')

    // Ensure .claude/skills directory exists
    await fs.promises.mkdir(targetSkillsPath, { recursive: true })

    const installedPlugins: InstalledPlugin[] = []

    for (const { folderPath, sourcePath } of skillDirs) {
      const skillName = path.basename(folderPath)
      const destPath = path.join(targetSkillsPath, skillName)

      // Skip if already installed
      try {
        await fs.promises.access(destPath, fs.constants.R_OK)
        logger.debug('Preset skill already exists, skipping', { skillName, destPath })
        continue
      } catch {
        // Skill doesn't exist, proceed with installation
      }

      try {
        // Parse skill metadata
        const metadata = await parseSkillMetadata(folderPath, sourcePath, 'skills')

        // Install skill using PluginInstaller
        await this.installer.installSkill(TURBO_AGENT_ID, folderPath, destPath)

        // Create installed plugin entry
        const installedPlugin: InstalledPlugin = {
          filename: metadata.filename,
          type: 'skill',
          metadata: {
            ...metadata,
            installedAt: Date.now()
          }
        }
        installedPlugins.push(installedPlugin)

        logger.info('Preset skill installed', { skillName, destPath })
      } catch (error) {
        logger.warn('Failed to install preset skill', {
          skillName,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // Update plugins cache if any skills were installed
    if (installedPlugins.length > 0) {
      await this.updatePluginsCache(claudePath, cachePath, installedPlugins)
      logger.info('Preset skills initialization completed', {
        count: installedPlugins.length,
        skills: installedPlugins.map((p) => p.filename)
      })
    }
  }

  /**
   * Update the plugins.json cache file with installed preset skills
   */
  private async updatePluginsCache(
    claudePath: string,
    cachePath: string,
    newPlugins: InstalledPlugin[]
  ): Promise<void> {
    let existingPlugins: InstalledPlugin[] = []
    let version = 1

    // Read existing cache if it exists
    try {
      const content = await fs.promises.readFile(cachePath, 'utf-8')
      const data = JSON.parse(content)
      existingPlugins = data.plugins || []
      version = data.version || 1
    } catch {
      // Cache doesn't exist or is invalid, start fresh
    }

    // Merge new plugins with existing (avoid duplicates by filename + type)
    const pluginMap = new Map<string, InstalledPlugin>()
    for (const plugin of existingPlugins) {
      const key = `${plugin.type}:${plugin.filename}`
      pluginMap.set(key, plugin)
    }
    for (const plugin of newPlugins) {
      const key = `${plugin.type}:${plugin.filename}`
      if (!pluginMap.has(key)) {
        pluginMap.set(key, plugin)
      }
    }

    const cacheData = {
      version,
      lastUpdated: Date.now(),
      plugins: Array.from(pluginMap.values())
    }

    await fs.promises.mkdir(claudePath, { recursive: true })
    await fs.promises.writeFile(cachePath, JSON.stringify(cacheData, null, 2), 'utf-8')
  }

  // Agent Methods
  async createAgent(req: CreateAgentRequest & { id?: string; is_system?: boolean }): Promise<CreateAgentResponse> {
    const id = req.id || `agent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    const now = new Date().toISOString()

    if (!req.accessible_paths || req.accessible_paths.length === 0) {
      const defaultPath = path.join(getDataPath(), 'agents', id)
      req.accessible_paths = [defaultPath]
    }

    if (req.accessible_paths !== undefined) {
      req.accessible_paths = this.ensurePathsExist(req.accessible_paths)
    }

    // Add default MCP Servers for all agents
    const defaultMCPs = [
      BuiltinMCPServerNames.scheduler,
      BuiltinMCPServerNames.fetch,
      BuiltinMCPServerNames.webview,
      BuiltinMCPServerNames.llm
    ]
    if (!req.mcps) {
      req.mcps = []
    }
    for (const mcp of defaultMCPs) {
      if (!req.mcps.includes(mcp)) {
        req.mcps.push(mcp)
      }
    }

    await this.validateAgentModels(req.type, {
      model: req.model,
      plan_model: req.plan_model,
      small_model: req.small_model
    })

    const serializedReq = this.serializeJsonFields(req)

    const insertData: InsertAgentRow = {
      id,
      type: req.type,
      name: req.name || 'New Agent',
      description: req.description,
      instructions: req.instructions || 'You are a helpful assistant.',
      model: req.model,
      plan_model: req.plan_model,
      small_model: req.small_model,
      configuration: serializedReq.configuration,
      accessible_paths: serializedReq.accessible_paths,
      mcps: serializedReq.mcps,
      is_system: req.is_system ?? false,
      created_at: now,
      updated_at: now
    }

    const database = await this.getDatabase()
    await database.insert(agentsTable).values(insertData)
    const result = await database.select().from(agentsTable).where(eq(agentsTable.id, id)).limit(1)
    if (!result[0]) {
      throw new Error('Failed to create agent')
    }

    const agent = this.deserializeJsonFields(result[0]) as AgentEntity
    return agent
  }

  async getAgent(id: string): Promise<GetAgentResponse | null> {
    const database = await this.getDatabase()
    const result = await database.select().from(agentsTable).where(eq(agentsTable.id, id)).limit(1)

    if (!result[0]) {
      return null
    }

    const agent = this.deserializeJsonFields(result[0]) as GetAgentResponse
    const { tools, legacyIdMap } = await this.listMcpTools(agent.type, agent.mcps)
    agent.tools = tools
    agent.allowed_tools = this.normalizeAllowedTools(agent.allowed_tools, agent.tools, legacyIdMap)

    // Load installed_plugins from cache file instead of database
    const workdir = agent.accessible_paths?.[0]
    if (workdir) {
      try {
        agent.installed_plugins = await pluginService.listInstalledFromCache(workdir)
      } catch (error) {
        // Log error but don't fail the request
        logger.warn(`Failed to load installed plugins for agent ${id}`, {
          workdir,
          error: error instanceof Error ? error.message : String(error)
        })
        agent.installed_plugins = []
      }
    } else {
      agent.installed_plugins = []
    }

    return agent
  }

  async listAgents(options: ListOptions = {}): Promise<{ agents: AgentEntity[]; total: number }> {
    // Build query with pagination
    const database = await this.getDatabase()
    const totalResult = await database.select({ count: count() }).from(agentsTable)

    const sortBy = options.sortBy || 'created_at'
    const orderBy = options.orderBy || 'desc'

    const sortField = agentsTable[sortBy]
    const orderFn = orderBy === 'asc' ? asc : desc

    const baseQuery = database.select().from(agentsTable).orderBy(orderFn(sortField))

    const result =
      options.limit !== undefined
        ? options.offset !== undefined
          ? await baseQuery.limit(options.limit).offset(options.offset)
          : await baseQuery.limit(options.limit)
        : await baseQuery

    const agents = result.map((row) => this.deserializeJsonFields(row)) as GetAgentResponse[]

    for (const agent of agents) {
      const { tools, legacyIdMap } = await this.listMcpTools(agent.type, agent.mcps)
      agent.tools = tools
      agent.allowed_tools = this.normalizeAllowedTools(agent.allowed_tools, agent.tools, legacyIdMap)
    }

    return { agents, total: totalResult[0].count }
  }

  async updateAgent(
    id: string,
    updates: UpdateAgentRequest,
    options: { replace?: boolean } = {}
  ): Promise<UpdateAgentResponse | null> {
    // Check if agent exists
    const existing = await this.getAgent(id)
    if (!existing) {
      return null
    }

    const now = new Date().toISOString()

    if (updates.accessible_paths !== undefined) {
      updates.accessible_paths = this.ensurePathsExist(updates.accessible_paths)
    }

    const modelUpdates: Partial<Record<AgentModelField, string | undefined>> = {}
    for (const field of this.modelFields) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        modelUpdates[field] = updates[field as keyof UpdateAgentRequest] as string | undefined
      }
    }

    if (Object.keys(modelUpdates).length > 0) {
      await this.validateAgentModels(existing.type, modelUpdates)
    }

    const serializedUpdates = this.serializeJsonFields(updates)

    const updateData: Partial<AgentRow> = {
      updated_at: now
    }
    const replaceableFields = Object.keys(AgentBaseSchema.shape) as (keyof AgentRow)[]
    const shouldReplace = options.replace ?? false

    for (const field of replaceableFields) {
      if (shouldReplace || Object.prototype.hasOwnProperty.call(serializedUpdates, field)) {
        if (Object.prototype.hasOwnProperty.call(serializedUpdates, field)) {
          const value = serializedUpdates[field as keyof typeof serializedUpdates]
          ;(updateData as Record<string, unknown>)[field] = value ?? null
        } else if (shouldReplace) {
          ;(updateData as Record<string, unknown>)[field] = null
        }
      }
    }

    const database = await this.getDatabase()
    await database.update(agentsTable).set(updateData).where(eq(agentsTable.id, id))
    return await this.getAgent(id)
  }

  async deleteAgent(id: string): Promise<boolean> {
    // Check if this is a system agent
    const agent = await this.getAgent(id)
    if (agent?.is_system) {
      throw new Error('Cannot delete system agent')
    }

    const database = await this.getDatabase()
    const result = await database.delete(agentsTable).where(eq(agentsTable.id, id))

    return result.rowsAffected > 0
  }

  async agentExists(id: string): Promise<boolean> {
    const database = await this.getDatabase()
    const result = await database
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.id, id))
      .limit(1)

    return result.length > 0
  }
}

export const agentService = AgentService.getInstance()
