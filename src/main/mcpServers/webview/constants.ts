export const MAX_WEBVIEWS = 10
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
export const DEFAULT_VIEWPORT = { width: 1280, height: 800 }
export const SCREENSHOT_INTERVAL_MS = 500

export const ALLOWED_CDP_DOMAINS = [
  'Page',
  'Runtime',
  'DOM',
  'Network',
  'Input',
  'Storage',
  'Emulation',
  'Target',
  'Console',
  'Performance',
  'Overlay',
  'Fetch',
  'CSS',
  'Log'
]

export const BLOCKED_CDP_DOMAINS = [
  'Security',
  'SystemInfo',
  'Browser',
  'Debugger',
  'HeapProfiler',
  'Profiler',
  'Inspector'
]
