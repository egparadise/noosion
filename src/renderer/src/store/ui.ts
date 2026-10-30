import type { ID, SessionState, Settings, TabState } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { createStore } from './createStore'
import { newId } from './ops'

export const HOME = 'home'

export interface UIState {
  tabs: TabState[]
  activeTabId: ID
  closedTabs: TabState[]
  sidebarOpen: boolean
  sidebarWidth: number
  settings: Settings
  searchOpen: boolean
  searchNewTab: boolean
  settingsOpen: boolean
  trashOpen: boolean
  selectedBlocks: ID[]
  recent: ID[]
  toast: { id: number; text: string } | null
}

const firstTab: TabState = { id: newId(), history: [HOME], index: 0 }

export const ui = createStore<UIState>({
  tabs: [firstTab],
  activeTabId: firstTab.id,
  closedTabs: [],
  sidebarOpen: true,
  sidebarWidth: 260,
  settings: DEFAULT_SETTINGS,
  searchOpen: false,
  searchNewTab: false,
  settingsOpen: false,
  trashOpen: false,
  selectedBlocks: [],
  recent: [],
  toast: null
})

export function activeTab(): TabState {
  const s = ui.get()
  return s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0]!
}

export function currentPageId(): ID {
  const t = activeTab()
  return t.history[t.index] ?? HOME
}

function updateTab(id: ID, fn: (t: TabState) => TabState): void {
  ui.set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? fn(t) : t)) }))
}

function remember(pageId: ID): void {
  if (pageId === HOME) return
  ui.set((s) => ({ recent: [pageId, ...s.recent.filter((r) => r !== pageId)].slice(0, 30) }))
}

/** Navigate the active tab (pushes onto its history like a browser). */
export function navigate(pageId: ID, opts: { newTab?: boolean; background?: boolean } = {}): void {
  if (opts.newTab) {
    openTab(pageId, opts.background)
    return
  }
  const tab = activeTab()
  if (tab.history[tab.index] === pageId) return
  updateTab(tab.id, (t) => {
    const history = [...t.history.slice(0, t.index + 1), pageId].slice(-100)
    return { ...t, history, index: history.length - 1 }
  })
  ui.set({ selectedBlocks: [] })
  remember(pageId)
}

export function openTab(pageId: ID = HOME, background = false): void {
  const tab: TabState = { id: newId(), history: [pageId], index: 0 }
  ui.set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === s.activeTabId)
    const tabs = [...s.tabs]
    tabs.splice(idx + 1, 0, tab)
    return { tabs, activeTabId: background ? s.activeTabId : tab.id }
  })
  remember(pageId)
}

export function closeTab(id: ID = ui.get().activeTabId): void {
  const s = ui.get()
  const idx = s.tabs.findIndex((t) => t.id === id)
  if (idx < 0) return
  const closed = s.tabs[idx]!
  let tabs = s.tabs.filter((t) => t.id !== id)
  if (!tabs.length) tabs = [{ id: newId(), history: [HOME], index: 0 }]
  const activeTabId = s.activeTabId === id ? tabs[Math.min(idx, tabs.length - 1)]!.id : s.activeTabId
  ui.set({ tabs, activeTabId, closedTabs: [closed, ...s.closedTabs].slice(0, 20) })
}

export function closeOtherTabs(id: ID, which: 'others' | 'right' | 'left' = 'others'): void {
  const s = ui.get()
  const idx = s.tabs.findIndex((t) => t.id === id)
  const keep = s.tabs.filter((t, i) => t.pinned || i === idx || (which === 'right' && i < idx) || (which === 'left' && i > idx))
  const closed = s.tabs.filter((t) => !keep.includes(t))
  ui.set({ tabs: keep, activeTabId: id, closedTabs: [...closed, ...s.closedTabs].slice(0, 20) })
}

export function reopenClosedTab(): void {
  const s = ui.get()
  const [tab, ...rest] = s.closedTabs
  if (!tab) return
  const restored = { ...tab, id: newId(), pinned: false }
  ui.set({ tabs: [...s.tabs, restored], activeTabId: restored.id, closedTabs: rest })
}

export function duplicateTab(id: ID): void {
  const t = ui.get().tabs.find((x) => x.id === id)
  if (t) openTab(t.history[t.index])
}

export function togglePinTab(id: ID): void {
  ui.set((s) => {
    const tabs = s.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t))
    // Pinned tabs live at the start of the strip.
    return { tabs: [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)] }
  })
}

export function moveTab(id: ID, toIndex: number): void {
  ui.set((s) => {
    const tabs = [...s.tabs]
    const from = tabs.findIndex((t) => t.id === id)
    if (from < 0) return {}
    const [t] = tabs.splice(from, 1)
    tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, t!)
    return { tabs }
  })
}

export function switchTab(delta: number): void {
  const s = ui.get()
  const idx = s.tabs.findIndex((t) => t.id === s.activeTabId)
  const next = s.tabs[(idx + delta + s.tabs.length) % s.tabs.length]
  if (next) ui.set({ activeTabId: next.id })
}

export function switchTabIndex(i: number): void {
  const s = ui.get()
  const t = i < 0 ? s.tabs[s.tabs.length - 1] : s.tabs[i]
  if (t) ui.set({ activeTabId: t.id })
}

export function goBack(): void {
  const t = activeTab()
  if (t.index > 0) updateTab(t.id, (x) => ({ ...x, index: x.index - 1 }))
}

export function goForward(): void {
  const t = activeTab()
  if (t.index < t.history.length - 1) updateTab(t.id, (x) => ({ ...x, index: x.index + 1 }))
}

export function toast(text: string): void {
  const id = Date.now()
  ui.set({ toast: { id, text } })
  setTimeout(() => {
    if (ui.get().toast?.id === id) ui.set({ toast: null })
  }, 2600)
}

export function sessionSnapshot(): SessionState {
  const s = ui.get()
  return {
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    sidebarOpen: s.sidebarOpen,
    sidebarWidth: s.sidebarWidth,
    closedTabs: s.closedTabs.slice(0, 10)
  }
}

export function restoreSession(session: SessionState | null, alive: (id: ID) => boolean): void {
  if (!session || !session.tabs?.length) return
  const tabs = session.tabs
    .map((t) => {
      const history = t.history.filter((h) => h === HOME || alive(h))
      return history.length ? { ...t, history, index: Math.min(t.index, history.length - 1) } : null
    })
    .filter((t): t is TabState => !!t)
  if (!tabs.length) return
  ui.set({
    tabs,
    activeTabId: tabs.some((t) => t.id === session.activeTabId) ? session.activeTabId! : tabs[0]!.id,
    sidebarOpen: session.sidebarOpen,
    sidebarWidth: session.sidebarWidth || 260,
    closedTabs: session.closedTabs ?? []
  })
}

// ---------- Focus management for the block editor ----------

type CaretPos = 'start' | 'end' | number
const editables = new Map<ID, HTMLElement & { __applyCaret?: (p: CaretPos) => void }>()
let pendingFocus: { id: ID; pos: CaretPos } | null = null

export function registerEditable(id: ID, el: HTMLElement & { __applyCaret?: (p: CaretPos) => void }): () => void {
  editables.set(id, el)
  if (pendingFocus?.id === id) {
    const p = pendingFocus.pos
    pendingFocus = null
    requestAnimationFrame(() => el.__applyCaret?.(p))
  }
  return () => {
    if (editables.get(id) === el) editables.delete(id)
  }
}

export function requestFocus(id: ID, pos: CaretPos = 'end'): void {
  pendingFocus = { id, pos }
  requestAnimationFrame(() => {
    const el = editables.get(id)
    if (el && pendingFocus?.id === id) {
      pendingFocus = null
      el.__applyCaret?.(pos)
    }
  })
}

export function editableFor(id: ID): HTMLElement | undefined {
  return editables.get(id)
}
