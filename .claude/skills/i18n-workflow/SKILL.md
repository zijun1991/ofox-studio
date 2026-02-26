---
name: i18n-workflow
description: Reference guide for the internationalization (i18n) workflow. Use when adding/modifying translation keys, creating new locale files, running translation scripts, fixing i18n lint errors, or any task involving locale files and the translation pipeline.
---

# i18n Workflow Reference

## Overview

The project uses **i18next** + **react-i18next** for internationalization. Translation files are JSON-based, with a base locale as the source of truth. Auto-translation uses an OpenAI-compatible API (Qwen Plus via Aliyun DashScope) to translate strings marked with `[to be translated]`.

Supported languages: **11 total**

| Category | Locales | Location |
|----------|---------|----------|
| Manually maintained | `en-us`, `zh-cn`, `zh-tw` | `src/renderer/src/i18n/locales/` |
| Auto-translated | `de-de`, `el-gr`, `es-es`, `fr-fr`, `ja-jp`, `pt-pt`, `ro-ro`, `ru-ru` | `src/renderer/src/i18n/translate/` |

---

## Directory Structure

```
src/renderer/src/i18n/
├── index.ts                    # i18next initialization & language detection
├── label.ts                    # Dynamic label mappings (providers, themes, etc.)
├── locales/
│   ├── en-us.json              # Base locale (source of truth)
│   ├── zh-cn.json              # Simplified Chinese (manual)
│   └── zh-tw.json              # Traditional Chinese (manual)
└── translate/
    ├── README.md               # Auto-translation notes
    ├── de-de.json              # German
    ├── el-gr.json              # Greek
    ├── es-es.json              # Spanish
    ├── fr-fr.json              # French
    ├── ja-jp.json              # Japanese
    ├── pt-pt.json              # Portuguese
    ├── ro-ro.json              # Romanian
    └── ru-ru.json              # Russian

scripts/
├── sync-i18n.ts                # Structure sync script
├── check-i18n.ts               # Validation script
├── auto-translate-i18n.ts      # Auto-translation engine
├── check-hardcoded-strings.ts  # Hardcoded string detector
└── update-languages.ts         # Language list updater
```

---

## Commands Reference

| Command | Purpose | Requires `.env` | Notes |
|---------|---------|:---:|-------|
| `pnpm i18n:sync` | Sync all locale files to match base locale structure | Yes | Adds `[to be translated]:` prefix for missing keys, removes extra keys, sorts alphabetically |
| `pnpm i18n:translate` | Auto-translate strings with `[to be translated]` marker | Yes | Uses Qwen Plus API; requires `TRANSLATION_API_KEY` |
| `pnpm i18n:all` | Run sync + translate in sequence | Yes | Shortcut for `pnpm i18n:sync && pnpm i18n:translate` |
| `pnpm i18n:check` | Validate all translation files | Yes | Checks structure, sorting, duplicates; runs as part of `pnpm lint` |
| `pnpm i18n:hardcoded` | Detect hardcoded strings in source code | No | Scans for strings that should use i18n keys |
| `pnpm i18n:hardcoded:strict` | Strict mode hardcoded string detection | No | Sets `I18N_STRICT=true` for stricter rules |
| `pnpm i18n:crud get <key>` | Read a single key value | No | `--all` for all locales, `--locale` for specific |
| `pnpm i18n:crud set <key> <value>` | Update a key value | No | `--locale` to target specific locale |
| `pnpm i18n:crud add <key> <value>` | Add new key + sync to all locales | No | `--no-sync` to skip syncing |
| `pnpm i18n:crud delete <key>` | Delete a key from locale files | No | `--locale` for single locale, default all |
| `pnpm i18n:crud list [pattern]` | List keys by prefix | No | `--depth` to limit nesting depth |
| `pnpm i18n:crud search <query>` | Search keys or values | No | `--in-values` to search value content |

**Dependency chain**: `i18n:sync` must run before `i18n:translate` (sync creates the `[to be translated]` markers that translate consumes).

---

## Standard Workflow

### Adding new translation keys

```
1. Add key to en-us.json (base locale)
2. Add key to zh-cn.json and zh-tw.json (manual translations)
3. Run: pnpm i18n:sync
   → Adds [to be translated]:original text to all other locale files
4. Run: pnpm i18n:translate
   → Auto-translates marked strings via API
5. Run: pnpm i18n:check
   → Validates structure consistency
```

Or use the combined command after step 2:

```bash
pnpm i18n:all    # sync + translate
```

### Before committing

```bash
pnpm i18n:check    # Runs automatically as part of pnpm lint
```

If `i18n:check` fails, run `pnpm i18n:sync` first, then retry.

---

## Environment Variables

Required in `.env` for translation commands:

| Variable | Purpose | Used by |
|----------|---------|---------|
| `TRANSLATION_API_KEY` | API key for Qwen Plus (Aliyun DashScope) | `i18n:translate` |
| `TRANSLATION_BASE_LOCALE` | Override base locale (default: `en-us`) | `i18n:sync` |
| `BASE_LOCALE` | Override base locale for check (default: `zh-cn`) | `i18n:check` |
| `I18N_STRICT` | Enable strict mode for hardcoded string check | `i18n:hardcoded:strict` |

Translation API configuration (hardcoded in `scripts/auto-translate-i18n.ts`):

```
BASE_URL: https://dashscope.aliyuncs.com/compatible-mode/v1/
MODEL: qwen-plus-latest
MAX_CONCURRENT_TRANSLATIONS: 5
TRANSLATION_DELAY_MS: 500
```

---

## Locale File Structure

All locale files use flat or nested JSON with alphabetically sorted keys:

```json
{
  "common": {
    "cancel": "Cancel",
    "confirm": "Confirm",
    "save": "Save"
  },
  "settings": {
    "general": {
      "language": "Language",
      "theme": "Theme"
    }
  }
}
```

**Rules:**
- Keys must be sorted alphabetically at every nesting level
- All locale files must have the exact same key structure as the base locale
- No duplicate keys allowed
- Auto-translated files use `[to be translated]:` prefix for untranslated strings

### Using translations in code

```typescript
import { useTranslation } from 'react-i18next'

const { t } = useTranslation()
t('common.cancel')           // Simple key
t('settings.general.language') // Nested key
```

### Dynamic labels (`label.ts`)

For runtime-computed labels (provider names, theme modes, etc.), use the getter functions in `label.ts`:

```typescript
import { getProviderLabel, getThemeModeLabel } from '@renderer/i18n/label'

getProviderLabel(providerId)    // Returns translated provider name
getThemeModeLabel('dark')       // Returns translated theme mode
```

---

## Key Files Index

| File | Purpose |
|------|---------|
| `src/renderer/src/i18n/index.ts` | i18next init, language detection, resource loading |
| `src/renderer/src/i18n/label.ts` | Dynamic label mappings (20+ getter functions) |
| `src/renderer/src/i18n/locales/en-us.json` | Base locale (source of truth) |
| `src/renderer/src/i18n/locales/zh-cn.json` | Simplified Chinese (manual) |
| `src/renderer/src/i18n/locales/zh-tw.json` | Traditional Chinese (manual) |
| `src/renderer/src/i18n/translate/*.json` | Auto-translated locale files |
| `scripts/sync-i18n.ts` | Structure sync: adds missing keys, removes extras, sorts |
| `scripts/check-i18n.ts` | Validation: structure, sorting, duplicates |
| `scripts/auto-translate-i18n.ts` | Auto-translation engine (Qwen Plus API) |
| `scripts/check-hardcoded-strings.ts` | Detects hardcoded UI strings |
| `scripts/update-languages.ts` | Updates language list in app config |

---

## Common Tasks

### Add a new translation key

1. Add the key to `src/renderer/src/i18n/locales/en-us.json`
2. Add corresponding translations to `zh-cn.json` and `zh-tw.json`
3. Run `pnpm i18n:all` to sync and auto-translate other locales
4. Verify with `pnpm i18n:check`

### Fix i18n lint errors

```bash
pnpm i18n:sync      # Fix structure mismatches and sorting
pnpm i18n:check     # Verify fix
```

Common causes: unsorted keys, missing keys in non-base locales, extra keys not in base.

### Add a new language

1. Create the locale JSON file in the appropriate directory:
   - Manual: `src/renderer/src/i18n/locales/{lang-region}.json`
   - Auto-translated: `src/renderer/src/i18n/translate/{lang-region}.json`
2. Import and register the locale in `src/renderer/src/i18n/index.ts` (add to `resources` and `dayjsLocaleMap`)
3. If auto-translated, add the language config to `scripts/auto-translate-i18n.ts`
4. Run `pnpm i18n:sync` to populate the new file with base locale structure
5. Run `pnpm i18n:translate` if it's an auto-translated language

### Remove a translation key

1. Remove the key from `en-us.json`
2. Run `pnpm i18n:sync` — this removes the key from all other locale files automatically

### Check for hardcoded strings

```bash
pnpm i18n:hardcoded          # Normal mode
pnpm i18n:hardcoded:strict   # Strict mode
```

Review the output and replace hardcoded strings with `t('key')` calls.

---

## Build Integration

`pnpm lint` includes `i18n:check` as part of its pipeline:

```
pnpm lint → oxlint → eslint → typecheck → i18n:check → format:check
```

This ensures translation consistency is validated before every build and CI run. If `i18n:check` fails during `pnpm lint`, run `pnpm i18n:sync` first, then retry.

---

## Language Detection

```typescript
// src/renderer/src/i18n/index.ts
getLanguage()     // localStorage.language || navigator.language || 'en-US'
getLanguageCode() // language.split('-')[0]  (e.g., 'en', 'zh', 'ja')
```

Default fallback language: `en-US`

---

## CRUD Tool (Single-Key Operations)

The `pnpm i18n:crud` CLI provides precise, single-key CRUD operations on locale JSON files. **Prefer this tool over directly editing locale JSON files** — it avoids reading/writing entire 220KB files and ensures correct sorting and structure.

All output is structured JSON for easy AI parsing.

### When to Use

- Adding, modifying, or deleting individual translation keys
- Checking the value of a key across locales
- Browsing the key structure without reading large files
- Searching for keys or values

### Commands

#### `get` — Read a key value

```bash
pnpm i18n:crud get common.cancel                  # Read from en-us (default)
pnpm i18n:crud get common.cancel --locale zh-cn    # Read from specific locale
pnpm i18n:crud get common.cancel --all             # Read from all locales
```

#### `set` — Update a key value

```bash
pnpm i18n:crud set common.cancel "Cancel"                  # Update in en-us
pnpm i18n:crud set common.cancel "Abbrechen" --locale de-de  # Update in specific locale
```

#### `add` — Add new key with sync

```bash
pnpm i18n:crud add feature.new.title "New Feature"    # Add to en-us + sync all
pnpm i18n:crud add feature.new.title "New Feature" --no-sync  # Add to en-us only
```

Adds the key to `en-us.json` and syncs to all other locales with `[to be translated]:<value>` prefix. Errors if the key already exists (use `set` instead).

#### `delete` — Delete a key

```bash
pnpm i18n:crud delete test.key               # Delete from ALL locales
pnpm i18n:crud delete test.key --locale en-us  # Delete from specific locale only
```

#### `list` — Browse key structure

```bash
pnpm i18n:crud list                   # List top-level keys
pnpm i18n:crud list agent             # List keys under "agent" prefix
pnpm i18n:crud list agent --depth 1   # Limit to 1 level deep
```

#### `search` — Search keys or values

```bash
pnpm i18n:crud search cancel                           # Search in key paths
pnpm i18n:crud search "Cancel" --in-values             # Search in values
pnpm i18n:crud search "Cancel" --in-values --locale zh-cn  # Search in specific locale
```

### Recommended AI Workflow

| Task | Command |
|------|---------|
| Add a new translation key | `pnpm i18n:crud add <key> <value>` |
| Update an existing key | `pnpm i18n:crud set <key> <value> [--locale]` |
| Delete a key | `pnpm i18n:crud delete <key>` |
| Check a key value | `pnpm i18n:crud get <key> [--all]` |
| Browse structure | `pnpm i18n:crud list [pattern]` |
| Find a key | `pnpm i18n:crud search <query>` |
