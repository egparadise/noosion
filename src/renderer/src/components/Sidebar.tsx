import { useState } from 'react'
import type { ID } from '@shared/types'
import { db, useBlock, useDbVersion, useSpace } from '../store/records'
import { childPages, createPage, deleteForever, duplicateBlock, moveBlock, pageTitle, restorePage, toggleFavorite, trashedPages, trashPage, type DropPosition } from '../store/ops'
import { currentPageId, HOME, navigate, toast, ui } from '../store/ui'
import { BLOCK_DRAG_MIME } from '../editor/editorState'
import { anchorOf, MenuPopover, Popover, type Anchor } from './Popover'
import { useT } from '../lib/i18n'
import { importMarkdownAsPage } from '../lib/markdown'
import { copyPageLink } from './PageView'

const expanded = new Set<ID>()

function TreeItem({ id, depth, activeId }: { id: ID; depth: number; activeId: ID }): JSX.Element | null {
  const t = useT()
  const b = useBlock(id)
  const space = useSpace()
  const [, force] = useState(0)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const [drop, setDrop] = useState<DropPosition | null>(null)
  if (!b?.alive) return null
  const open = expanded.has(id)
  const kids = childPages(id)
  const fav = !!space?.bookmarked_pages.includes(id)
  const toggle = (): void => {
    if (open) expanded.delete(id)
    else expanded.add(id)
    force((x) => x + 1)
  }
  const pos = (e: React.DragEvent): DropPosition => {
    const r = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - r.top
    return y < r.height * 0.25 ? 'before' : y > r.height * 0.75 ? 'after' : 'inside'
  }
  return (
    <>
      <div
        className={`tree-item ${activeId === id ? 'active' : ''} ${drop ? `drop-${drop}` : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable
        onDragStart={(e) => e.dataTransfer.setData(BLOCK_DRAG_MIME, id)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(BLOCK_DRAG_MIME)) return
          e.preventDefault()
          setDrop(pos(e))
        }}
        onDragLeave={() => setDrop(null)}
        onDrop={(e) => {
          const src = e.dataTransfer.getData(BLOCK_DRAG_MIME)
          setDrop(null)
          if (!src || src === id) return
          e.preventDefault()
          const p = pos(e)
          moveBlock(src, id, p)
          if (p === 'inside') expanded.add(id)
        }}
        onClick={(e) => navigate(id, { newTab: e.ctrlKey || e.metaKey })}
        onAuxClick={(e) => e.button === 1 && navigate(id, { newTab: true, background: true })}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <button className={`tree-arrow ${open ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); toggle() }}>▶</button>
        <span className="tree-icon">{b.format.page_icon ?? (b.type === 'collection_view_page' ? '🗂' : '📄')}</span>
        <span className="tree-title">{pageTitle(b) || t('untitled')}</span>
        <span className="tree-actions">
          <button title="⋯" onClick={(e) => { e.stopPropagation(); setMenu(anchorOf(e.currentTarget)) }}>⋯</button>
          {b.type === 'page' && (
            <button
              title={t('addPage')}
              onClick={(e) => {
                e.stopPropagation()
                expanded.add(id)
                navigate(createPage(id))
              }}
            >
              +
            </button>
          )}
        </span>
      </div>
      {open &&
        (kids.length ? (
          kids.map((k) => <TreeItem key={k} id={k} depth={depth + 1} activeId={activeId} />)
        ) : (
          <div className="tree-empty" style={{ paddingLeft: 30 + depth * 14 }}>{t('noPagesInside')}</div>
        ))}
      {menu && (
        <MenuPopover
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[
            { label: fav ? t('removeFromFavorites') : t('addToFavorites'), icon: '☆', onClick: () => toggleFavorite(id) },
            { label: t('openInNewTab'), icon: '⧉', onClick: () => navigate(id, { newTab: true }) },
            { label: t('copyLink'), icon: '🔗', onClick: () => copyPageLink(id) },
            { label: t('duplicate'), icon: '⎘', onClick: () => duplicateBlock(id) },
            { separator: true, label: '' },
            { label: t('moveToTrash'), icon: '🗑', danger: true, onClick: () => { trashPage(id); toast(t('movedToTrash')) } }
          ]}
        />
      )}
    </>
  )
}

function TrashPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT()
  useDbVersion()
  const [q, setQ] = useState('')
  const items = trashedPages().filter((b) => pageTitle(b).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="trash-panel">
      <input className="input wide" autoFocus placeholder={t('filterPages')} value={q} onChange={(e) => setQ(e.target.value)} />
      {!items.length && <div className="menu-empty">{t('trashEmpty')}</div>}
      {items.map((b) => (
        <div key={b.id} className="menu-item" onClick={() => { navigate(b.id); onClose() }}>
          <span className="menu-icon">{b.format.page_icon ?? '📄'}</span>
          <span className="menu-label">{pageTitle(b) || t('untitled')}</span>
          <button className="btn-ghost small" title={t('restore')} onClick={(e) => { e.stopPropagation(); restorePage(b.id) }}>↺</button>
          <button className="btn-ghost small" title={t('deleteForever')} onClick={(e) => { e.stopPropagation(); deleteForever(b.id) }}>🗑</button>
        </div>
      ))}
    </div>
  )
}

export function Sidebar(): JSX.Element {
  const t = useT()
  useDbVersion()
  const space = useSpace()
  const width = ui.use((s) => s.sidebarWidth)
  const tabs = ui.use((s) => s.tabs)
  const activeTabId = ui.use((s) => s.activeTabId)
  void tabs
  void activeTabId
  const activeId = currentPageId()
  const [trash, setTrash] = useState<Anchor | null>(null)
  const favs = (space?.bookmarked_pages ?? []).filter((id) => db.block(id)?.alive)
  const pages = (space?.pages ?? []).filter((id) => db.block(id)?.alive)

  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const move = (ev: MouseEvent): void => ui.set({ sidebarWidth: Math.max(200, Math.min(480, ev.clientX)) })
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-head">
        <button className="workspace" onClick={() => ui.set({ settingsOpen: true })}>
          <span className="workspace-icon">{space?.icon ?? '🌿'}</span>
          <span className="workspace-name">{space?.name}</span>
        </button>
        <button className="btn-ghost" title={`${t('toggleSidebar')} (Ctrl+\\)`} onClick={() => ui.set({ sidebarOpen: false })}>«</button>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-item" onClick={() => ui.set({ searchOpen: true, searchNewTab: false })}>
          <span className="nav-icon">🔍</span> {t('search')} <span className="nav-hint">Ctrl+P</span>
        </div>
        <div className={`nav-item ${activeId === HOME ? 'active' : ''}`} onClick={() => navigate(HOME)}>
          <span className="nav-icon">🏠</span> {t('home')}
        </div>
        <div className="nav-item" onClick={() => ui.set({ settingsOpen: true })}>
          <span className="nav-icon">⚙</span> {t('settings')}
        </div>
        <div className="nav-item" onClick={() => navigate(createPage(null))}>
          <span className="nav-icon">✎</span> {t('newPage')} <span className="nav-hint">Ctrl+N</span>
        </div>
      </nav>
      <div className="sidebar-scroll">
        {favs.length > 0 && (
          <section>
            <div className="section-title">{t('favorites')}</div>
            {favs.map((id) => (
              <TreeItem key={`fav-${id}`} id={id} depth={0} activeId={activeId} />
            ))}
          </section>
        )}
        <section>
          <div className="section-title">
            {t('private')}
            <button className="section-add" title={t('addPage')} onClick={() => navigate(createPage(null))}>+</button>
          </div>
          {pages.map((id) => (
            <TreeItem key={id} id={id} depth={0} activeId={activeId} />
          ))}
          <div className="nav-item muted" onClick={() => navigate(createPage(null))}>
            <span className="nav-icon">+</span> {t('addPage')}
          </div>
        </section>
      </div>
      <div className="sidebar-foot">
        <div
          className="nav-item"
          onClick={async () => {
            const files = await window.noosion.openMarkdown()
            let last: ID | undefined
            for (const f of files) last = importMarkdownAsPage(f.name, f.content)
            if (last) {
              navigate(last)
              toast(t('imported'))
            }
          }}
        >
          <span className="nav-icon">⇪</span> {t('import')}
        </div>
        <div className="nav-item" onClick={(e) => setTrash(anchorOf(e.currentTarget))}>
          <span className="nav-icon">🗑</span> {t('trash')}
        </div>
      </div>
      <div className="sidebar-resizer" onMouseDown={startResize} />
      {trash && (
        <Popover anchor={{ x: trash.x + width - 20, y: trash.y - 300 }} onClose={() => setTrash(null)} width={380}>
          <TrashPanel onClose={() => setTrash(null)} />
        </Popover>
      )}
    </aside>
  )
}
