import { Brain, Code, FileSearch, Folder, Languages, NotepadText, Palette } from 'lucide-react'

/**
 * 内置工具配置
 * 这些工具是应用内置的功能入口，点击后跳转到对应页面
 */
export interface BuiltinTool {
  id: string
  name: string
  nameKey: string // i18n key
  path: string // 路由路径
  icon: typeof FileSearch // Lucide icon 组件
  bgColor: string // 渐变背景色
}

/**
 * 内置工具列表
 * 包含知识库、绘画、翻译、文件、笔记、代码工具
 */
export const BUILTIN_TOOLS: BuiltinTool[] = [
  {
    id: 'expert',
    name: '专家模式',
    nameKey: 'landing.enterExpertMode',
    path: '/expert',
    icon: Brain,
    bgColor: 'linear-gradient(135deg, #8B5CF6, #A78BFA)' // 紫色，代表智能和专业
  },
  {
    id: 'knowledge',
    name: '知识库',
    nameKey: 'title.knowledge',
    path: '/knowledge',
    icon: FileSearch,
    bgColor: 'linear-gradient(135deg, #10B981, #34D399)' // 翠绿色，代表生长和知识
  },
  {
    id: 'paintings',
    name: '绘画',
    nameKey: 'title.paintings',
    path: '/paintings', // 实际路径会在渲染时补充 provider
    icon: Palette,
    bgColor: 'linear-gradient(135deg, #EC4899, #F472B6)' // 活力粉色，代表创造力和艺术
  },
  {
    id: 'translate',
    name: '翻译',
    nameKey: 'title.translate',
    path: '/translate',
    icon: Languages,
    bgColor: 'linear-gradient(135deg, #06B6D4, #0EA5E9)' // 明亮的青蓝色，代表沟通和流畅
  },
  {
    id: 'files',
    name: '文件',
    nameKey: 'title.files',
    path: '/files',
    icon: Folder,
    bgColor: 'linear-gradient(135deg, #F59E0B, #FBBF24)' // 金色，代表资源和重要性
  },
  {
    id: 'notes',
    name: '笔记',
    nameKey: 'title.notes',
    path: '/notes',
    icon: NotepadText,
    bgColor: 'linear-gradient(135deg, #F97316, #FB923C)' // 橙色，代表活力和清晰思路
  },
  {
    id: 'code',
    name: '代码工具',
    nameKey: 'title.code',
    path: '/code',
    icon: Code,
    bgColor: 'linear-gradient(135deg, #1F2937, #374151)' // 高级暗黑色，代表专业和技术
  }
]
