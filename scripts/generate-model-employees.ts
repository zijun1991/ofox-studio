/**
 * 生成模型员工配置脚本
 *
 * 从本地 API Server 获取 Ofox 模型列表，生成模型员工的配置
 * 只选择支持 anthropic 协议的模型，每个厂商最多选 3 个有代表性的模型
 *
 * 使用前请确保：
 * 1. 应用正在运行
 * 2. 已登录 Ofox 账号
 * 3. API Server 已启用（默认端口 23333）
 *
 * 使用方法：
 *   pnpm tsx scripts/generate-model-employees.ts
 *
 * 或指定 API Key：
 *   API_SERVER_API_KEY=your-key pnpm tsx scripts/generate-model-employees.ts
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as readline from 'readline'
import { v4 as uuidv4 } from 'uuid'

const ROOT_DIR = path.resolve(__dirname, '..')
const OUTPUT_PATH = path.join(ROOT_DIR, 'resources/data/model-employees-anthropic.json')

// API Server 配置
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://127.0.0.1:23333'
let API_KEY = process.env.API_SERVER_API_KEY || ''

// 从用户输入获取 API Key
async function getApiKey(): Promise<string> {
  if (API_KEY) {
    return API_KEY
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question('🔑 请输入 API Server API Key (在设置 -> API Server 中查看): ', (ans) => {
      rl.close()
      resolve(ans.trim())
    })
  })

  if (!answer) {
    throw new Error('API Key 是必需的')
  }

  return answer
}

// ============ 类型定义 ============

interface ModelCapability {
  type: string
  isUserSelected?: boolean
}

interface ModelPricing {
  input_per_million_tokens: number
  output_per_million_tokens: number
  currencySymbol?: string
}

interface Model {
  id: string
  provider: string
  name: string
  group: string
  owned_by?: string
  description?: string
  endpoint_type: string
  capabilities?: ModelCapability[]
  pricing?: ModelPricing
  providerName: string
}

interface ApiModelsResponse {
  object: string
  data: Model[]
}

enum EducationLevel {
  HIGH_SCHOOL = 'high_school',
  UNDERGRADUATE = 'undergraduate',
  MASTER = 'master',
  PHD = 'phd'
}

interface ModelEmployee {
  id: string
  name: string
  description: string
  soul?: string
  model: Model
  educationLevel: EducationLevel
  createdAt: number
  updatedAt: number
}

interface ModelEmployeeConfig {
  version: string
  exportedAt: string
  employees: Omit<ModelEmployee, 'id' | 'createdAt' | 'updatedAt'>[]
  educationLevelOrder: EducationLevel[]
}

// ============ 工具函数 ============

/**
 * 从 API Server 获取所有模型
 */
async function fetchModels(): Promise<Model[]> {
  console.log(`📡 正在从 ${API_SERVER_URL} 获取模型列表...`)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`
  }

  const response = await fetch(`${API_SERVER_URL}/v1/models`, {
    method: 'GET',
    headers
  })

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}`)
  }

  const data: ApiModelsResponse = await response.json()
  console.log(`✅ 成功获取 ${data.data.length} 个模型`)

  return data.data
}

/**
 * 筛选支持 anthropic 协议的 Ofox 模型
 */
function filterAnthropicModels(models: Model[]): Model[] {
  return models.filter((model) => {
    // 筛选 Ofox provider 的 anthropic 协议模型
    const isOfoxProvider = model.provider === 'ofox-anthropic'
    const isAnthropicEndpoint = model.endpoint_type === 'anthropic'
    return isOfoxProvider && isAnthropicEndpoint
  })
}

/**
 * 计算模型能力得分（用于学历等级分配）
 */
function calculateModelScore(model: Model): number {
  let score = 0

  // 价格权重 (40%)
  const inputPrice = model.pricing?.input_per_million_tokens || 0
  score += Math.min(inputPrice / 100, 40) // 最高 40 分

  // 能力权重 (40%)
  const capabilities = model.capabilities || []
  const capabilityTypes = new Set(capabilities.map((c) => c.type))

  if (capabilityTypes.has('reasoning')) score += 15
  if (capabilityTypes.has('vision')) score += 10
  if (capabilityTypes.has('function_calling')) score += 10
  if (capabilityTypes.has('web_search')) score += 5

  // 知名度权重 (20%)
  const series = model.group?.toLowerCase() || ''
  const name = model.name.toLowerCase()

  if (series.includes('opus') || series.includes('claude-opus') || name.includes('opus')) {
    score += 20
  } else if (series.includes('sonnet') || series.includes('claude-sonnet') || name.includes('sonnet')) {
    score += 15
  } else if (series.includes('haiku') || series.includes('claude-haiku') || name.includes('haiku')) {
    score += 10
  } else if (series.includes('pro') || series.includes('large')) {
    score += 12
  } else if (series.includes('medium')) {
    score += 8
  } else if (series.includes('flash') || series.includes('lite')) {
    score += 6
  } else if (series.includes('micro') || series.includes('small')) {
    score += 4
  }

  return score
}

/**
 * 根据模型得分分配学历等级
 */
function getEducationLevel(model: Model): EducationLevel {
  const score = calculateModelScore(model)

  if (score >= 55) return EducationLevel.PHD
  if (score >= 40) return EducationLevel.MASTER
  if (score >= 25) return EducationLevel.UNDERGRADUATE
  return EducationLevel.HIGH_SCHOOL
}

/**
 * 生成简短中文名称
 * 根据真实配置的风格，使用简短的中文昵称
 */
function generateChineseName(model: Model): string {
  const group = model.group?.toLowerCase() || ''
  const name = model.name.toLowerCase()

  // Anthropic Claude 系列
  if (group.includes('claude-opus') || name.includes('opus')) {
    return 'opus'
  }
  if (group.includes('claude-sonnet') || name.includes('sonnet')) {
    return 'sonnet'
  }
  if (group.includes('claude-haiku') || name.includes('haiku')) {
    return 'haiku'
  }

  // Amazon Nova 系列
  if (group.includes('nova') || name.includes('nova')) {
    if (name.includes('pro')) return 'nova-pro'
    if (name.includes('lite')) return 'nova-lite'
    if (name.includes('micro')) return 'nova-micro'
    return 'nova'
  }

  // Google Gemini 系列
  if (group.includes('gemini') || name.includes('gemini')) {
    if (name.includes('pro')) return 'gemini-pro'
    if (name.includes('flash')) return 'gemini-flash'
    return 'gemini'
  }

  // Mistral 系列
  if (group.includes('mistral') || name.includes('mistral')) {
    if (name.includes('large')) return 'mistral-large'
    if (name.includes('medium')) return 'mistral-medium'
    if (name.includes('small')) return 'mistral-small'
  }

  // 其他厂商
  const ownedBy = model.owned_by?.toLowerCase() || ''
  const vendorNames: Record<string, string> = {
    anthropic: 'claude',
    amazon: 'aws',
    google: 'gcp',
    mistral: 'mistral',
    zhipu: 'glm',
    minimax: 'minimax',
    deepseek: 'deepseek'
  }
  return vendorNames[ownedBy] || ownedBy.substring(0, 6) || 'ai'
}

/**
 * 生成描述
 */
function generateDescription(educationLevel: EducationLevel): string {
  const levelDescriptions: Record<EducationLevel, string> = {
    [EducationLevel.PHD]: '这是一个能干活的顶级员工',
    [EducationLevel.MASTER]: '这是一个能干活的高级员工',
    [EducationLevel.UNDERGRADUATE]: '这是一个能干活的中级员工',
    [EducationLevel.HIGH_SCHOOL]: '这是一个能干活的初级员工'
  }

  return levelDescriptions[educationLevel]
}

/**
 * 生成灵魂提示词
 */
function generateSoulPrompt(model: Model): string {
  const basePrompt = `你是一个专业、高效的AI助手，基于 ${model.name} 模型。`

  const capabilityPrompts: string[] = []
  const capabilities = model.capabilities || []
  const capabilityTypes = new Set(capabilities.map((c) => c.type))

  if (capabilityTypes.has('reasoning')) {
    capabilityPrompts.push('你擅长深入分析和复杂推理，能够提供逻辑严密的解决方案。')
  }

  if (capabilityTypes.has('vision')) {
    capabilityPrompts.push('你具备强大的视觉理解能力，可以准确描述和分析图像内容。')
  }

  if (capabilityTypes.has('function_calling')) {
    capabilityPrompts.push('你熟练掌握各种工具的使用，能够通过调用外部工具来完成任务。')
  }

  if (capabilityTypes.has('web_search')) {
    capabilityPrompts.push('你可以主动搜索网络信息，获取最新的数据和资讯。')
  }

  const personalityPrompts = [
    '你的回答应该：',
    '- 准确、专业，同时保持友好和耐心',
    '- 结构清晰，重点突出',
    '- 根据问题的复杂程度调整回答的详细程度',
    '- 在不确定时诚实说明，而不是编造信息'
  ]

  return [basePrompt, ...capabilityPrompts, ...personalityPrompts].join('\n\n')
}

// ============ 主函数 ============

async function main() {
  console.log('🤖 开始生成模型员工配置...\n')

  // 获取 API Key
  if (!API_KEY) {
    API_KEY = await getApiKey()
  }

  // 1. 从 API Server 获取所有模型
  const allModels = await fetchModels()

  // 2. 筛选支持 anthropic 协议的 Ofox 模型
  const anthropicModels = filterAnthropicModels(allModels)
  console.log(`📊 共找到 ${anthropicModels.length} 个支持 anthropic 协议的 Ofox 模型\n`)

  if (anthropicModels.length === 0) {
    console.error('❌ 没有找到符合条件的模型，请确保：')
    console.error('   1. 应用正在运行')
    console.error('   2. 已登录 Ofox 账号')
    console.error('   3. Ofox 模型已同步')
    process.exit(1)
  }

  // 3. 按厂商分组并选择代表性模型（每个厂商最多 3 个）
  const modelsByVendor = new Map<string, Model[]>()
  for (const model of anthropicModels) {
    const vendor = model.owned_by || 'unknown'
    if (!modelsByVendor.has(vendor)) {
      modelsByVendor.set(vendor, [])
    }
    modelsByVendor.get(vendor)!.push(model)
  }

  // 按系列名称排序（opus > sonnet > haiku, pro > lite > micro, large > medium > small）
  const seriesPriority: Record<string, number> = {
    'claude-opus': 100,
    'claude-sonnet': 90,
    'claude-haiku': 80,
    nova: 70,
    gemini: 60,
    mistral: 50
  }

  // 排序并取每个厂商的前 3 个
  const selectedModels: Model[] = []
  for (const [vendor, models] of Array.from(modelsByVendor.entries())) {
    const sorted = models.sort((a, b) => {
      // 优先按系列名称排序
      const aGroup = a.group?.toLowerCase() || ''
      const bGroup = b.group?.toLowerCase() || ''
      let aPriority = 0
      let bPriority = 0

      for (const [series, priority] of Object.entries(seriesPriority)) {
        if (aGroup.includes(series)) aPriority = Math.max(aPriority, priority)
        if (bGroup.includes(series)) bPriority = Math.max(bPriority, priority)
      }

      if (aPriority !== bPriority) {
        return bPriority - aPriority
      }

      // 其次按价格排序（贵的优先）
      const aPrice = a.pricing?.input_per_million_tokens || 0
      const bPrice = b.pricing?.input_per_million_tokens || 0
      return bPrice - aPrice
    })

    selectedModels.push(...sorted.slice(0, 3))
    console.log(`  ✓ ${vendor}: 选择了 ${Math.min(3, sorted.length)} 个模型`)
  }

  console.log(`\n🎯 共选择了 ${selectedModels.length} 个代表性模型\n`)

  // 4. 生成模型员工配置
  const now = Date.now()
  const employees: ModelEmployee[] = []

  for (const model of selectedModels) {
    const educationLevel = getEducationLevel(model)

    const employee: ModelEmployee = {
      id: uuidv4(),
      name: generateChineseName(model),
      description: generateDescription(educationLevel),
      soul: generateSoulPrompt(model),
      model,
      educationLevel,
      createdAt: now,
      updatedAt: now
    }

    employees.push(employee)
    console.log(`  ✨ ${employee.name}`)
    console.log(`     学历: ${educationLevel}`)
    console.log(`     模型: ${model.id}`)
    console.log('')
  }

  // 5. 构建配置文件
  const config: ModelEmployeeConfig = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    employees: employees.map(({ id, createdAt, updatedAt, ...rest }) => rest),
    educationLevelOrder: [
      EducationLevel.HIGH_SCHOOL,
      EducationLevel.UNDERGRADUATE,
      EducationLevel.MASTER,
      EducationLevel.PHD
    ]
  }

  // 6. 写入文件
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(config, null, 2), 'utf-8')

  console.log(`\n✅ 配置文件已生成: ${path.relative(ROOT_DIR, OUTPUT_PATH)}`)
  console.log(`   - 员工数量: ${config.employees.length}`)
  console.log(`   - 厂商数量: ${modelsByVendor.size}`)
  console.log(`   - PHD: ${config.employees.filter((e) => e.educationLevel === EducationLevel.PHD).length}`)
  console.log(`   - MASTER: ${config.employees.filter((e) => e.educationLevel === EducationLevel.MASTER).length}`)
  console.log(
    `   - UNDERGRADUATE: ${config.employees.filter((e) => e.educationLevel === EducationLevel.UNDERGRADUATE).length}`
  )
  console.log(
    `   - HIGH_SCHOOL: ${config.employees.filter((e) => e.educationLevel === EducationLevel.HIGH_SCHOOL).length}`
  )
}

main().catch((error) => {
  console.error('❌ 生成失败:', error)
  process.exit(1)
})
