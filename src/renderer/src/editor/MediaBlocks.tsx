import { useEffect, useRef, useState } from 'react'
import type { Block, RichText } from '@shared/types'
import { db, useDbVersion } from '../store/records'
import { deleteBlock, makeBlock, newId, setFormat, setProperty, setTitle } from '../store/ops'
import { Editable } from './Editable'
import { handleBlockKeyDown } from './commands'
import { anchorOf, Popover, type Anchor } from '../components/Popover'
import { useT } from '../lib/i18n'
import { plainText } from '../lib/richtext'
import { toast } from '../store/ui'

// ---------- Image ----------

export function ImageBlock({ b, readOnly }: { b: Block; readOnly?: boolean }): JSX.Element {
  const t = useT()
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [url, setUrl] = useState('')
  const [tab, setTab] = useState<'upload' | 'link'>('upload')
  const src = b.properties.source
  const ref = useRef<HTMLDivElement>(null)
  const autoOpened = useRef(false)

  useEffect(() => {
    // Freshly inserted image blocks open the picker immediately (Notion behaviour).
    if (!src && !readOnly && !autoOpened.current && Date.now() - b.created_time < 3000) {
      autoOpened.current = true
      setAnchor(anchorOf(ref.current))
    }
  }, [src, readOnly, b.created_time])

  if (!src) {
    return (
      <div ref={ref} className="media-placeholder" onClick={(e) => !readOnly && setAnchor(anchorOf(e.currentTarget))}>
        🖼 {t('uploadImage')} / {t('embedLink')}
        {anchor && (
          <Popover anchor={anchor} onClose={() => setAnchor(null)} width={420}>
            <div className="media-picker">
              <div className="tabs-row">
                <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>{t('uploadImage')}</button>
                <button className={tab === 'link' ? 'active' : ''} onClick={() => setTab('link')}>{t('embedLink')}</button>
              </div>
              {tab === 'upload' ? (
                <button
                  className="btn-primary wide"
                  onClick={async () => {
                    const picked = await window.noosion.pickImage()
                    if (picked) setProperty(b.id, 'source', picked)
                    setAnchor(null)
                  }}
                >
                  {t('uploadImage')}
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (url.trim()) setProperty(b.id, 'source', url.trim())
                    setAnchor(null)
                  }}
                >
                  <input autoFocus className="input wide" placeholder={t('pasteUrl')} value={url} onChange={(e) => setUrl(e.target.value)} />
                  <button className="btn-primary wide" type="submit">{t('embedLink')}</button>
                </form>
              )}
            </div>
          </Popover>
        )}
      </div>
    )
  }

  const width = b.format.block_width
  const startResize = (e: React.MouseEvent, side: 1 | -1): void => {
    e.preventDefault()
    const img = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    const startX = e.clientX
    const startW = img.width
    const move = (ev: MouseEvent): void => {
      const w = Math.max(80, startW + side * (ev.clientX - startX) * 2)
      ;(e.target as HTMLElement).parentElement!.style.width = `${w}px`
    }
    const up = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      setFormat(b.id, { block_width: Math.max(80, Math.round(startW + side * (ev.clientX - startX) * 2)) })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <figure className="image-block">
      <div className="image-frame" style={{ width: width ? `${width}px` : undefined }}>
        <img src={src} alt={plainText(b.properties.caption)} draggable={false} />
        {!readOnly && <span className="resize-handle left" onMouseDown={(e) => startResize(e, -1)} />}
        {!readOnly && <span className="resize-handle right" onMouseDown={(e) => startResize(e, 1)} />}
      </div>
      <Editable
        focusId={`caption:${b.id}`}
        className="caption"
        value={b.properties.caption}
        readOnly={readOnly}
        placeholder={t('default') === '기본' ? '캡션 추가' : 'Add a caption'}
        onChange={(rt) => setProperty(b.id, 'caption', rt, `caption:${b.id}`)}
      />
    </figure>
  )
}

// ---------- Bookmark ----------

export function BookmarkBlock({ b, readOnly }: { b: Block; readOnly?: boolean }): JSX.Element {
  const t = useT()
  const [url, setUrl] = useState('')
  const src = b.properties.source

  useEffect(() => {
    if (!src || b.format.bookmark_title !== undefined) return
    let cancelled = false
    window.noosion.linkPreview(src).then((meta) => {
      if (cancelled) return
      setFormat(b.id, { bookmark_title: meta?.title || src, bookmark_description: meta?.description ?? '' })
    })
    return () => {
      cancelled = true
    }
  }, [src, b.id, b.format.bookmark_title])

  if (!src) {
    return (
      <form
        className="media-placeholder bookmark-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim()) setProperty(b.id, 'source', /^https?:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`)
        }}
      >
        <span>🔖</span>
        <input className="input" disabled={readOnly} autoFocus placeholder={t('pasteBookmark')} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn-primary" type="submit">{t('createBookmark')}</button>
      </form>
    )
  }
  let host = src
  try {
    host = new URL(src).host
  } catch {
    /* keep raw */
  }
  return (
    <a className="bookmark" href={src} onClick={(e) => { e.preventDefault(); window.noosion.openExternal(src) }}>
      <div className="bookmark-text">
        <div className="bookmark-title">{b.format.bookmark_title || src}</div>
        {b.format.bookmark_description && <div className="bookmark-desc">{b.format.bookmark_description}</div>}
        <div className="bookmark-url">
          <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
          {src}
        </div>
      </div>
    </a>
  )
}

// ---------- Code ----------

const LANGUAGES = ['plain', 'bash', 'c', 'cpp', 'csharp', 'css', 'go', 'html', 'java', 'javascript', 'json', 'kotlin', 'markdown', 'python', 'rust', 'sql', 'swift', 'typescript', 'yaml']

export function CodeBlock({ b, readOnly }: { b: Block; readOnly?: boolean }): JSX.Element {
  return (
    <div className={`code-block ${b.format.code_wrap === false ? 'nowrap' : ''}`}>
      <div className="code-head" contentEditable={false}>
        <select value={b.format.code_language ?? 'plain'} disabled={readOnly} onChange={(e) => setFormat(b.id, { code_language: e.target.value })}>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn-ghost small" onClick={() => setFormat(b.id, { code_wrap: b.format.code_wrap === false })}>
          ↩ Wrap
        </button>
        <button
          className="btn-ghost small"
          onClick={() => {
            navigator.clipboard.writeText(plainText(b.properties.title))
            toast('Copied')
          }}
        >
          Copy
        </button>
      </div>
      <Editable
        focusId={b.id}
        plain
        className="plain code-text"
        value={b.properties.title}
        readOnly={readOnly}
        onChange={(rt) => setTitle(b.id, rt)}
        onKeyDown={(e, el) => handleBlockKeyDown(e, el, b.id)}
      />
    </div>
  )
}

export function EquationBlock({ b, readOnly }: { b: Block; readOnly?: boolean }): JSX.Element {
  return (
    <div className="equation-block">
      <span className="equation-label" contentEditable={false}>TeX</span>
      <Editable
        focusId={b.id}
        plain
        className="plain equation-text"
        value={b.properties.title}
        readOnly={readOnly}
        placeholder="E = mc^2"
        placeholderAlways
        onChange={(rt) => setTitle(b.id, rt)}
        onKeyDown={(e, el) => handleBlockKeyDown(e, el, b.id)}
      />
    </div>
  )
}

// ---------- Simple table (table / table_row blocks) ----------

export function TableBlock({ b, readOnly }: { b: Block; readOnly?: boolean }): JSX.Element {
  useDbVersion()
  const cols = b.format.table_block_column_order ?? []
  const rows = b.content.map((id) => db.block(id)).filter((r): r is Block => !!r?.alive)
  const header = b.format.table_block_column_header !== false

  const addRow = (): void => {
    const row = makeBlock('table_row', b.id, 'block')
    db.transact((tx) => {
      tx.set('block', row)
      tx.update('block', b.id, { content: [...b.content, row.id] })
    })
  }
  const addCol = (): void => setFormat(b.id, { table_block_column_order: [...cols, newId().slice(0, 8)] })
  const removeRow = (id: string): void => {
    if (rows.length <= 1) return deleteBlock(b.id)
    deleteBlock(id)
  }
  const removeCol = (c: string): void => {
    if (cols.length <= 1) return deleteBlock(b.id)
    setFormat(b.id, { table_block_column_order: cols.filter((x) => x !== c) })
  }

  return (
    <div className="simple-table-wrap" contentEditable={false}>
      <table className={`simple-table ${header ? 'with-header' : ''}`}>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id}>
              {cols.map((c) => (
                <td key={c}>
                  <Editable
                    focusId={`${r.id}:${c}`}
                    value={r.properties[c] as RichText | undefined}
                    readOnly={readOnly}
                    onChange={(rt) => setProperty(r.id, c, rt, `cell:${r.id}:${c}`)}
                  />
                  {!readOnly && ri === 0 && (
                    <button className="table-x col" title="Delete column" onClick={() => removeCol(c)}>×</button>
                  )}
                </td>
              ))}
              {!readOnly && (
                <td className="table-row-tools">
                  <button className="table-x" title="Delete row" onClick={() => removeRow(r.id)}>×</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <div className="table-tools">
          <button className="btn-ghost small" onClick={addRow}>+ Row</button>
          <button className="btn-ghost small" onClick={addCol}>+ Column</button>
          <label className="small muted">
            <input type="checkbox" checked={header} onChange={(e) => setFormat(b.id, { table_block_column_header: e.target.checked })} /> Header
          </label>
        </div>
      )}
    </div>
  )
}
