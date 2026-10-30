import { useState } from 'react'
import type { TabState } from '@shared/types'
import { db, useDbVersion } from '../store/records'
import { pageTitle } from '../store/ops'
import { closeOtherTabs, closeTab, duplicateTab, goBack, goForward, HOME, moveTab, openTab, reopenClosedTab, togglePinTab, ui } from '../store/ui'
import { MenuPopover, type Anchor } from './Popover'
import { useT } from '../lib/i18n'
import { copyPageLink } from './PageView'

const TAB_MIME = 'application/x-noosion-tab'

function tabInfo(tab: TabState, t: ReturnType<typeof useT>): { icon: string; title: string } {
  const id = tab.history[tab.index] ?? HOME
  if (id === HOME) return { icon: '🏠', title: t('home') }
  const b = db.block(id)
  if (!b) return { icon: '📄', title: t('untitled') }
  return { icon: b.format.page_icon ?? (b.type === 'collection_view_page' ? '🗂' : '📄'), title: pageTitle(b) || t('untitled') }
}

export function TabBar(): JSX.Element {
  const t = useT()
  useDbVersion()
  const tabs = ui.use((s) => s.tabs)
  const activeTabId = ui.use((s) => s.activeTabId)
  const sidebarOpen = ui.use((s) => s.sidebarOpen)
  const closed = ui.use((s) => s.closedTabs.length)
  const [menu, setMenu] = useState<{ tab: TabState; anchor: Anchor } | null>(null)
  const active = tabs.find((x) => x.id === activeTabId)
  const platform = window.noosion?.platform

  return (
    <div className={`tabbar ${platform === 'darwin' ? 'mac' : ''}`}>
      {!sidebarOpen && (
        <button className="tb-btn" title={`${t('toggleSidebar')} (Ctrl+\\)`} onClick={() => ui.set({ sidebarOpen: true })}>☰</button>
      )}
      <button className="tb-btn" title={`${t('back')} (Ctrl+[)`} disabled={!active || active.index === 0} onClick={goBack}>‹</button>
      <button className="tb-btn" title={`${t('forward')} (Ctrl+])`} disabled={!active || active.index >= active.history.length - 1} onClick={goForward}>›</button>
      <div className="tabs" onDoubleClick={(e) => e.target === e.currentTarget && openTab()}>
        {tabs.map((tab, i) => {
          const info = tabInfo(tab, t)
          return (
            <div
              key={tab.id}
              className={`tab ${tab.id === activeTabId ? 'active' : ''} ${tab.pinned ? 'pinned' : ''}`}
              title={info.title}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(TAB_MIME, tab.id)}
              onDragOver={(e) => e.dataTransfer.types.includes(TAB_MIME) && e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(TAB_MIME)
                if (id) moveTab(id, i)
              }}
              onMouseDown={(e) => {
                if (e.button === 0) ui.set({ activeTabId: tab.id })
              }}
              onAuxClick={(e) => {
                if (e.button === 1) closeTab(tab.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ tab, anchor: { x: e.clientX, y: e.clientY } })
              }}
            >
              <span className="tab-icon">{info.icon}</span>
              {!tab.pinned && <span className="tab-title">{info.title}</span>}
              {!tab.pinned && (
                <button
                  className="tab-close"
                  title={`${t('closeTab')} (Ctrl+W)`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => closeTab(tab.id)}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
        <button className="tb-btn new-tab" title={`${t('newTab')} (Ctrl+T)`} onClick={() => openTab()}>+</button>
      </div>
      <div className="titlebar-spacer" />
      {menu && (
        <MenuPopover
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={[
            { label: t('newTab'), hint: 'Ctrl+T', onClick: () => openTab() },
            { label: t('duplicateTab'), onClick: () => duplicateTab(menu.tab.id) },
            { label: menu.tab.pinned ? t('unpinTab') : t('pinTab'), onClick: () => togglePinTab(menu.tab.id) },
            {
              label: t('copyLink'),
              disabled: (menu.tab.history[menu.tab.index] ?? HOME) === HOME,
              onClick: () => copyPageLink(menu.tab.history[menu.tab.index]!)
            },
            { separator: true, label: '' },
            { label: t('closeTab'), hint: 'Ctrl+W', onClick: () => closeTab(menu.tab.id) },
            { label: t('closeOthers'), onClick: () => closeOtherTabs(menu.tab.id, 'others') },
            { label: t('closeLeft'), onClick: () => closeOtherTabs(menu.tab.id, 'left') },
            { label: t('closeRight'), onClick: () => closeOtherTabs(menu.tab.id, 'right') },
            { label: t('reopenTab'), hint: 'Ctrl+Shift+T', disabled: !closed, onClick: reopenClosedTab }
          ]}
        />
      )}
    </div>
  )
}
