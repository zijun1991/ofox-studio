import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'

import { sortedObjectByKeys } from './sort'

const VERSION = '1.0.0'

const localesDir = path.join(__dirname, '../src/renderer/src/i18n/locales')
const translateDir = path.join(__dirname, '../src/renderer/src/i18n/translate')
const baseLocale = 'en-us'

type I18NValue = string | { [key: string]: I18NValue }
type I18N = { [key: string]: I18NValue }

interface LocaleFile {
  locale: string
  filePath: string
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function getAllLocaleFiles(): LocaleFile[] {
  const files: LocaleFile[] = []
  for (const dir of [localesDir, translateDir]) {
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      files.push({
        locale: file.replace('.json', ''),
        filePath: path.join(dir, file)
      })
    }
  }
  return files
}

function readLocaleFile(filePath: string): I18N {
  const content = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(content) as I18N
}

function writeLocaleFile(filePath: string, data: I18N): void {
  const sorted = sortedObjectByKeys(data) as I18N
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8')
}

function getNestedValue(obj: I18N, keyPath: string): I18NValue | undefined {
  const parts = keyPath.split('.')
  let current: I18NValue = obj
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as I18N)[part]
    if (current === undefined) return undefined
  }
  return current
}

function setNestedValue(obj: I18N, keyPath: string, value: I18NValue): void {
  const parts = keyPath.split('.')
  let current: I18N = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {}
    }
    current = current[part] as I18N
  }
  current[parts[parts.length - 1]] = value
}

function deleteNestedValue(obj: I18N, keyPath: string): boolean {
  const parts = keyPath.split('.')
  const parents: { obj: I18N; key: string }[] = []
  let current: I18N = obj

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (typeof current[part] !== 'object' || current[part] === null) {
      return false
    }
    parents.push({ obj: current, key: part })
    current = current[part] as I18N
  }

  const lastKey = parts[parts.length - 1]
  if (!(lastKey in current)) return false
  delete current[lastKey]

  // Clean up empty parent objects
  for (let i = parents.length - 1; i >= 0; i--) {
    const { obj: parentObj, key } = parents[i]
    if (Object.keys(parentObj[key] as I18N).length === 0) {
      delete parentObj[key]
    } else {
      break
    }
  }
  return true
}

function flattenKeys(obj: I18NValue, prefix = ''): string[] {
  const keys: string[] = []
  if (typeof obj !== 'object' || obj === null) return keys
  for (const key of Object.keys(obj as I18N)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    const value = (obj as I18N)[key]
    if (typeof value === 'object' && value !== null) {
      keys.push(...flattenKeys(value, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

function findLocaleFile(locale: string): LocaleFile | undefined {
  return getAllLocaleFiles().find((f) => f.locale === locale)
}

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2))
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function handleGet(key: string, options: { locale?: string; all?: boolean }): void {
  if (options.all) {
    const values: Record<string, I18NValue | null> = {}
    for (const { locale, filePath } of getAllLocaleFiles()) {
      const data = readLocaleFile(filePath)
      const val = getNestedValue(data, key)
      values[locale] = val === undefined ? null : val
    }
    output({ key, values })
  } else {
    const locale = options.locale || baseLocale
    const file = findLocaleFile(locale)
    if (!file) {
      output({ key, locale, error: `Locale "${locale}" not found` })
      process.exit(1)
    }
    const data = readLocaleFile(file.filePath)
    const value = getNestedValue(data, key)
    if (value === undefined) {
      output({ key, locale, value: null, exists: false })
    } else {
      output({ key, locale, value })
    }
  }
}

function handleSet(key: string, value: string, options: { locale?: string }): void {
  const locale = options.locale || baseLocale
  const file = findLocaleFile(locale)
  if (!file) {
    output({ action: 'set', key, locale, success: false, error: `Locale "${locale}" not found` })
    process.exit(1)
  }
  const data = readLocaleFile(file.filePath)
  setNestedValue(data, key, value)
  writeLocaleFile(file.filePath, data)
  output({ action: 'set', key, locale, value, success: true })
}

function handleDelete(key: string, options: { locale?: string }): void {
  if (options.locale) {
    const file = findLocaleFile(options.locale)
    if (!file) {
      output({
        action: 'delete',
        key,
        locale: options.locale,
        success: false,
        error: `Locale "${options.locale}" not found`
      })
      process.exit(1)
    }
    const data = readLocaleFile(file.filePath)
    const deleted = deleteNestedValue(data, key)
    if (deleted) {
      writeLocaleFile(file.filePath, data)
    }
    output({
      action: 'delete',
      key,
      locale: options.locale,
      success: deleted,
      warning: deleted ? undefined : `Key "${key}" not found in ${options.locale}`
    })
  } else {
    const results: { locale: string; deleted: boolean }[] = []
    for (const { locale, filePath } of getAllLocaleFiles()) {
      const data = readLocaleFile(filePath)
      const deleted = deleteNestedValue(data, key)
      if (deleted) {
        writeLocaleFile(filePath, data)
      }
      results.push({ locale, deleted })
    }
    output({ action: 'delete', key, success: true, results })
  }
}

function handleAdd(key: string, value: string, options: { sync?: boolean }): void {
  const baseFile = findLocaleFile(baseLocale)
  if (!baseFile) {
    output({ action: 'add', key, success: false, error: `Base locale "${baseLocale}" not found` })
    process.exit(1)
  }

  const baseData = readLocaleFile(baseFile.filePath)
  const existing = getNestedValue(baseData, key)
  if (existing !== undefined) {
    output({ action: 'add', key, success: false, error: `Key "${key}" already exists. Use "set" to update it.` })
    process.exit(1)
  }

  setNestedValue(baseData, key, value)
  writeLocaleFile(baseFile.filePath, baseData)

  const synced: string[] = []
  const shouldSync = options.sync !== false
  if (shouldSync) {
    for (const { locale, filePath } of getAllLocaleFiles()) {
      if (locale === baseLocale) continue
      const data = readLocaleFile(filePath)
      setNestedValue(data, key, `[to be translated]:${value}`)
      writeLocaleFile(filePath, data)
      synced.push(locale)
    }
  }

  output({ action: 'add', key, value, success: true, synced })
}

function handleList(pattern?: string, options: { depth?: string } = {}): void {
  const baseFile = findLocaleFile(baseLocale)
  if (!baseFile) {
    output({ error: `Base locale "${baseLocale}" not found` })
    process.exit(1)
  }

  const baseData = readLocaleFile(baseFile.filePath)
  const maxDepth = options.depth ? parseInt(options.depth, 10) : undefined

  let target: I18NValue
  if (pattern) {
    const val = getNestedValue(baseData, pattern)
    if (val === undefined) {
      output({ pattern, keys: [], count: 0, error: `Pattern "${pattern}" not found` })
      return
    }
    if (typeof val === 'string') {
      output({ pattern, type: 'string', value: val })
      return
    }
    target = val
  } else {
    target = baseData
  }

  interface KeyInfo {
    key: string
    type: 'string' | 'object'
    children?: number
    value?: string
  }

  function collectKeys(obj: I18NValue, prefix: string, currentDepth: number): KeyInfo[] {
    if (typeof obj !== 'object' || obj === null) return []
    const result: KeyInfo[] = []
    for (const key of Object.keys(obj as I18N)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      const val = (obj as I18N)[key]
      if (typeof val === 'object' && val !== null) {
        const childCount = Object.keys(val).length
        result.push({ key: fullKey, type: 'object', children: childCount })
        if (maxDepth === undefined || currentDepth < maxDepth) {
          result.push(...collectKeys(val, fullKey, currentDepth + 1))
        }
      } else {
        result.push({ key: fullKey, type: 'string', value: val as string })
      }
    }
    return result
  }

  const keys = collectKeys(target, pattern || '', 1)
  output({ pattern: pattern || null, keys, count: keys.length })
}

function handleSearch(query: string, options: { inValues?: boolean; locale?: string }): void {
  const locale = options.locale || baseLocale
  const file = findLocaleFile(locale)
  if (!file) {
    output({ query, error: `Locale "${locale}" not found` })
    process.exit(1)
  }

  const data = readLocaleFile(file.filePath)
  const allKeys = flattenKeys(data)
  const lowerQuery = query.toLowerCase()

  interface SearchResult {
    key: string
    value: I18NValue | undefined
  }

  const results: SearchResult[] = []
  for (const key of allKeys) {
    const value = getNestedValue(data, key)
    if (options.inValues) {
      if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
        results.push({ key, value })
      }
    } else {
      if (key.toLowerCase().includes(lowerQuery)) {
        results.push({ key, value })
      }
    }
  }

  output({ query, locale, results, count: results.length })
}

// ---------------------------------------------------------------------------
// CLI definition
// ---------------------------------------------------------------------------

const program = new Command()

program.name('i18n-crud').description('i18n single-key CRUD operations for locale JSON files').version(VERSION)

program
  .command('get <key>')
  .description('Read the value of a translation key')
  .option('-l, --locale <locale>', 'Target locale (default: en-us)')
  .option('-a, --all', 'Show value across all locales')
  .action((key: string, opts) => handleGet(key, opts))

program
  .command('set <key> <value>')
  .description('Set or update a translation key value')
  .option('-l, --locale <locale>', 'Target locale (default: en-us)')
  .action((key: string, value: string, opts) => handleSet(key, value, opts))

program
  .command('delete <key>')
  .description('Delete a translation key')
  .option('-l, --locale <locale>', 'Delete from specific locale only (default: all locales)')
  .action((key: string, opts) => handleDelete(key, opts))

program
  .command('add <key> <value>')
  .description('Add a new key to base locale and sync to all others')
  .option('--no-sync', 'Skip syncing to other locales')
  .action((key: string, value: string, opts) => handleAdd(key, value, opts))

program
  .command('list [pattern]')
  .description('List translation keys (optionally filtered by prefix)')
  .option('-d, --depth <n>', 'Limit output depth')
  .action((pattern: string | undefined, opts) => handleList(pattern, opts))

program
  .command('search <query>')
  .description('Search translation keys or values')
  .option('--in-values', 'Search in values instead of key paths')
  .option('-l, --locale <locale>', 'Target locale (default: en-us)')
  .action((query: string, opts) => handleSearch(query, opts))

program.parse()
