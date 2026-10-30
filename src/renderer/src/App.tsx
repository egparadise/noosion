import { useEffect, useState } from 'react'
import type { ShellCommand } from '@shared/types'
import { db, useDbVersion } from './store/records'
import { createPage, deleteBlock, duplicateBlock, ensureWorkspace, pageTitle } from './store/ops'
import {
  closeTab,
  currentPageId,
  goBack,
  goForward,
  HOME,
  navigate,
  openTab,
  reopenClosedTab,
  requestFocus,
  restoreSession,
  sessionSnapshot,
  switchTab,
  switchTabIndex,
  toast,
  ui
} from './store/ui'
import { TabBar } from './components/TabBar'
import { Sidebar } from './components/Sidebar'
import { PageView, copyPageLink, exportPageMarkdown } from './components/PageView'
import { Home } from './components/Home'
import { QuickSearch } from './components/QuickSearch'
import { SettingsModal } from './components/SettingsModal'
import { SlashMenu } from './editor/SlashMenu'
import { InlineToolbar } from './editor/InlineToolbar'
import { importMarkdownAsPage } from './lib/markdown'
import { t } from './lib/i18n'

function isTextInput(el: Element | null): boolean {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
}

function undoRedo(redo: boolean): void {
  if (isTextInput(document.activeElement)) {
    document.execCommand(redo ? 'redo' : 'undo')
    return
  }
  const focus = redo ? db.redo() : db.undo()
  if (focus && db.block(focus)?.alive) requestFocus(focus, 'end')
}

export function runCommand(cmd: ShellCommand): void {
  const s = ui.get()
  switch (cmd.type) {
    case 'new-tab':
      openTab()
      ui.set({ searchOpen: true, searchNewTab: false })
      break
    case 'close-tab': closeTab(); break
    case 'reopen-closed-tab': reopenClosedTab(); break
    case 'next-tab': switchTab(1); break
    case 'prev-tab': switchTab(-1); break
    case 'tab-index': switchTabIndex(cmd.index); break
    case 'back': goBack(); break
    case 'forward': goForward(); break
    case 'toggle-sidebar': ui.set({ sidebarOpen: !s.sidebarOpen }); break
    case 'quick-search': ui.set({ searchOpen: !s.searchOpen, searchNewTab: false }); break
    case 'new-page': {
      const id = createPage(null)
      navigate(id)
      setTimeout(() => requestFocus(`title:${id}`, 'start'), 30)
      break
    }
    case 'open-settings': ui.set({ settingsOpen: true }); break
    case 'copy-link': {
      const id = currentPageId()
      if (id !== HOME) copyPageLink(id)
      break
    }
    case 'copy-title': {
      const id = currentPageId()
      if (id !== HOME) {
        navigator.clipboard.writeText(pageTitle(db.block(id)))
        toast(t('titleCopied'))
      }
      break
    }
    case 'navigate':
      if (db.block(cmd.pageId)) navigate(cmd.pageId)
      break
    case 'undo': undoRedo(false); break
    case 'redo': undoRedo(true); break
    case 'import-markdown': {
      navigate(importMarkdownAsPage(cmd.name, cmd.content))
      toast(t('imported'))
      break
    }
    case 'export-markdown': {
      const id = currentPageId()
      if (id !== HOME) exportPageMarkdown(id)
      break
    }
    case 'print': window.noosion.print(); break
  }
}

/** Renderer-level shortcuts (the menu shows them but does not register them; see main/menu.ts). */
function onGlobalKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing) return
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  const run = (cmd: ShellCommand): void => {
    e.preventDefault()
    runCommand(cmd)
  }
  if (mod && !e.shiftKey && !e.altKey && (key === 'p' || key === 'k') && !(key === 'k' && document.activeElement?.closest('.editable'))) return run({ type: 'quick-search' })
  if (mod && !e.shiftKey && key === 't') return run({ type: 'new-tab' })
  if (mod && !e.shiftKey && key === 'w') return run({ type: 'close-tab' })
  if (mod && e.shiftKey && key === 't') return run({ type: 'reopen-closed-tab' })
  if (e.ctrlKey && e.key === 'Tab') return run({ type: e.shiftKey ? 'prev-tab' : 'next-tab' })
  if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) return run({ type: 'tab-index', index: e.key === '9' ? -1 : Number(e.key) - 1 })
  if ((mod && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')) return run({ type: 'back' })
  if ((mod && e.key === ']') || (e.altKey && e.key === 'ArrowRight')) return run({ type: 'forward' })
  if (mod && e.key === '\\') return run({ type: 'toggle-sidebar' })
  if (mod && !e.shiftKey && key === 'n') return run({ type: 'new-page' })
  if (mod && key === 'z') return run({ type: e.shiftKey ? 'redo' : 'undo' })
  if (mod && !e.shiftKey && key === 'y') return run({ type: 'redo' })
  if (mod && !e.shiftKey && e.altKey && key === 'l') return run({ type: 'copy-title' })
  if (mod && !e.shiftKey && !e.altKey && key === 'l') return run({ type: 'copy-link' })
  if (mod && e.key === ',') return run({ type: 'open-settings' })
  if (mod && e.shiftKey && key === 'p') return run({ type: 'print' })

  // Block selection (Esc on a block, or clicking its handle)
  const selected = ui.get().selectedBlocks
  if (selected.length && !document.activeElement?.closest('.editable') && !isTextInput(document.activeElement)) {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      selected.forEach(deleteBlock)
      ui.set({ selectedBlocks: [] })
    } else if (e.key === 'Escape') {
      ui.set({ selectedBlocks: [] })
    } else if (mod && key === 'd') {
      e.preventDefault()
      selected.forEach((id) => duplicateBlock(id))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      requestFocus(selected[0]!, 'end')
      ui.set({ selectedBlocks: [] })
    }
  }
}

function applyTheme(theme: 'system' | 'light' | 'dark'): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  useDbVersion()
  const tabs = ui.use((s) => s.tabs)
  const activeTabId = ui.use((s) => s.activeTabId)
  const sidebarOpen = ui.use((s) => s.sidebarOpen)
  const sidebarWidth = ui.use((s) => s.sidebarWidth)
  const theme = ui.use((s) => s.settings.theme)
  const locale = ui.use((s) => s.settings.locale)
  const toastMsg = ui.use((s) => s.toast)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await window.noosion.load()
      if (cancelled) return
      db.hydrate(data.records)
      ui.set({ settings: data.settings })
      ensureWorkspace(data.settings.locale)
      if (await window.noosion.isPrimaryWindow()) restoreSession(data.session, (id) => !!db.block(id)?.alive)
      if (currentPageId() === HOME && !data.session) {
        const first = Object.values(db.records.space)[0]?.pages[0]
        if (first) navigate(first)
      }
      setReady(true)
      window.noosion.ready()
    })()
    const offCmd = window.noosion.onCommand(runCommand)
    const offRemote = window.noosion.onRemoteWrites((w) => db.applyRemote(w))
    const offSettings = window.noosion.onSettingsChanged((settings) => ui.set({ settings }))
    window.addEventListener('keydown', onGlobalKeyDown)
    const flush = (): void => {
      db.flush()
      window.noosion.saveSession(sessionSnapshot())
    }
    window.addEventListener('beforeunload', flush)
    return () => {
      cancelled = true
      offCmd()
      offRemote()
      offSettings()
      window.removeEventListener('keydown', onGlobalKeyDown)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

  // Persist tab session (debounced).
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => window.noosion.saveSession(sessionSnapshot()), 500)
    return () => clearTimeout(id)
  }, [ready, tabs, activeTabId, sidebarOpen, sidebarWidth])

  useEffect(() => {
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = (): void => applyTheme(ui.get().settings.theme)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const pageId = currentPageId()
  useEffect(() => {
    if (!ready) return
    window.noosion.setTitle(pageId === HOME ? t('home') : pageTitle(db.block(pageId)) || t('untitled'))
  })

  if (!ready) return <div className="splash" />

  return (
    <div className="app">
      {sidebarOpen && <Sidebar />}
      <div className="main">
        <TabBar />
        <main className="content" key={`${activeTabId}:${pageId}`}>
          {pageId === HOME ? <Home /> : <PageView pageId={pageId} />}
        </main>
      </div>
      <QuickSearch />
      <SettingsModal />
      <SlashMenu />
      <InlineToolbar />
      {toastMsg && <div className="toast" key={toastMsg.id}>{toastMsg.text}</div>}
    </div>
  )
}
