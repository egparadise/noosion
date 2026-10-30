import { useEffect, useMemo, useState } from 'react'
import type { Block, ID } from '@shared/types'
import { db } from '../store/records'
import { breadcrumbs, createPage, isPage, pageOf, pageTitle } from '../store/ops'
import { navigate, ui } from '../store/ui'
import { useT } from '../lib/i18n'
import { plainText } from '../lib/richtext'

interface Result {
  id: ID
  title: string
  icon: string
  path: string
  snippet?: string
  score: number
}

function icon(b: Block): string {
  return b.format.page_icon ?? (b.type === 'collection_view_page' ? '🗂' : '📄')
}

function pathOf(id: ID): string {
  return breadcrumbs(id)
    .slice(0, -1)
    .map((p) => pageTitle(db.block(p)))
    .filter(Boolean)
    .join(' / ')
}

/** Title + full-text search over all live pages (Notion: Quick Find / Command Search). */
function search(q: string): Result[] {
  const query = q.trim().toLowerCase()
  const results = new Map<ID, Result>()
  for (const b of Object.values(db.records.block)) {
    if (!b.alive) continue
    if (isPage(b)) {
      const title = pageTitle(b)
      const lt = title.toLowerCase()
      if (lt.includes(query)) {
        results.set(b.id, { id: b.id, title, icon: icon(b), path: pathOf(b.id), score: lt.startsWith(query) ? 3 : 2 })
      }
    } else if (b.properties.title) {
      const text = plainText(b.properties.title)
      const idx = text.toLowerCase().indexOf(query)
      if (idx < 0) continue
      const pid = pageOf(b.id)
      const page = db.block(pid)
      if (!pid || !page?.alive || results.has(pid)) continue
      const start = Math.max(0, idx - 30)
      results.set(pid, {
        id: pid,
        title: pageTitle(page),
        icon: icon(page),
        path: pathOf(pid),
        snippet: (start > 0 ? '…' : '') + text.slice(start, idx + query.length + 60),
        score: 1
      })
    }
  }
  return [...results.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 50)
}

export function QuickSearch(): JSX.Element | null {
  const t = useT()
  const open = ui.use((s) => s.searchOpen)
  const newTab = ui.use((s) => s.searchNewTab)
  const recent = ui.use((s) => s.recent)
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (open) {
      setQ('')
      setIndex(0)
    }
  }, [open])

  const results = useMemo<Result[]>(() => {
    if (!open) return []
    if (!q.trim()) {
      return recent
        .map((id) => db.block(id))
        .filter((b): b is Block => !!b?.alive)
        .slice(0, 12)
        .map((b) => ({ id: b.id, title: pageTitle(b), icon: icon(b), path: pathOf(b.id), score: 0 }))
    }
    return search(q)
  }, [q, open, recent])

  if (!open) return null
  const close = (): void => ui.set({ searchOpen: false })
  const choose = (r: Result | undefined, inNewTab = newTab): void => {
    close()
    if (r) navigate(r.id, { newTab: inNewTab })
    else if (q.trim()) navigate(createPage(null, { title: q.trim() }), { newTab: inNewTab })
  }
  const total = results.length + (q.trim() ? 1 : 0)

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="search-modal" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="search-input"
          placeholder={t('searchPlaceholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(i + 1, total - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(i - 1, 0))
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              choose(results[index], e.ctrlKey || e.metaKey || newTab)
            }
          }}
        />
        <div className="search-results">
          {!q.trim() && results.length > 0 && <div className="menu-title">{t('recentPages')}</div>}
          {q.trim() && !results.length && <div className="menu-empty">{t('noResults')}</div>}
          {results.map((r, i) => (
            <div key={r.id} className={`search-result ${i === index ? 'active' : ''}`} onMouseEnter={() => setIndex(i)} onClick={(e) => choose(r, e.ctrlKey || e.metaKey || newTab)}>
              <span className="search-icon">{r.icon}</span>
              <span className="search-text">
                <span className="search-title">{r.title || t('untitled')}</span>
                {r.path && <span className="search-path">{r.path}</span>}
                {r.snippet && <span className="search-snippet">{r.snippet}</span>}
              </span>
            </div>
          ))}
          {q.trim() && (
            <div className={`search-result ${index === results.length ? 'active' : ''}`} onMouseEnter={() => setIndex(results.length)} onClick={() => choose(undefined)}>
              <span className="search-icon">＋</span>
              <span className="search-text">
                <span className="search-title">
                  {t('createPageNamed')} “{q.trim()}”
                </span>
              </span>
            </div>
          )}
        </div>
        <div className="search-foot muted small">↑↓ · Enter · Ctrl+Enter {t('openInNewTab')} · Esc</div>
      </div>
    </div>
  )
}
