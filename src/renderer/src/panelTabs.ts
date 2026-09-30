export const CONTROL_TABS = ['chat', 'voice', 'ai', 'character'] as const

export type ControlTab = typeof CONTROL_TABS[number]

export const ACTIVE_TAB_STORAGE_KEY = 'control-panel.active-tab'

interface TabStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function parseControlTab(value: unknown): ControlTab {
  return typeof value === 'string'
    && (CONTROL_TABS as readonly string[]).includes(value)
    ? value as ControlTab
    : 'chat'
}

export function loadControlTab(storage: TabStorage | null = window.localStorage): ControlTab {
  if (!storage) return 'chat'
  try {
    return parseControlTab(storage.getItem(ACTIVE_TAB_STORAGE_KEY))
  } catch {
    return 'chat'
  }
}

export function saveControlTab(storage: TabStorage | null, tab: ControlTab): void {
  if (!storage) return
  try {
    storage.setItem(ACTIVE_TAB_STORAGE_KEY, tab)
  } catch {
    return
  }
}
