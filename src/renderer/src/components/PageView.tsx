import { useState } from 'react'
import type { Block, Collection, ID } from '@shared/types'
import { db, useBlock, useCollection, useDbVersion, useSpace } from '../store/records'
import {
  addProperty,
  breadcrumbs,
  duplicateBlock,
  insertChild,
  pageTitle,
  restorePage,
  setFormat,
  setTitle,
  toggleFavorite,
  trashPage,
  updateCollection
} from '../store/ops'
import { navigate, requestFocus, toast, ui } from '../store/ui'
import { Editable } from '../editor/Editable'
import { BlockChildren, isEmptyBlock } from '../editor/BlockView'
import { DatabaseView, PropertyHeaderMenu } from '../database/DatabaseView'
import { PropertyCell } from '../database/PropertyCell'
import { anchorOf, MenuPopover, Popover, type Anchor, type MenuItem } from './Popover'
import { EmojiPicker } from './EmojiPicker'
import { relativeTime, t as tr, useT } from '../lib/i18n'
import { plainText } from '../lib/richtext'
import { orderedProperties, propertyIcon } from '../lib/properties'
import { pageToMarkdown } from '../lib/markdown'

const COVERS = [
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
  'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)',
  'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)'
]

function coverStyle(cover: string): React.CSSProperties {
  return cover.startsWith('linear-gradient') ? { backgroundImage: cover } : { backgroundImage: `url("${cover}")` }
}

export function copyPageLink(id: ID): void {
  navigator.clipboard.writeText(`noosion://page/${id}`)
  toast(tr('linkCopied'))
}

export async function exportPageMarkdown(id: ID): Promise<void> {
  const ok = await window.noosion.saveText(`${pageTitle(db.block(id)) || 'Untitled'}.md`, pageToMarkdown(id))
  if (ok) toast(tr('exported'))
}

function Topbar({ page }: { page: Block }): JSX.Element {
  const t = useT()
  useDbVersion()
  const space = useSpace()
  const [menu, setMenu] = useState<Anchor | null>(null)
  const crumbs = breadcrumbs(page.id)
  const fav = !!space?.bookmarked_pages.includes(page.id)
  const words = countWords(page)
  const items: MenuItem[] = [
    {
      label: t('font'),
      icon: 'Aa',
      submenu: (['default', 'serif', 'mono'] as const).map((f) => ({
        label: f === 'default' ? t('default') : f === 'serif' ? 'Serif' : 'Mono',
        checked: (page.format.page_font ?? 'default') === f,
        onClick: () => setFormat(page.id, { page_font: f })
      }))
    },
    { label: t('smallText'), icon: 'ᴀ', checked: !!page.format.page_small_text, onClick: () => setFormat(page.id, { page_small_text: !page.format.page_small_text }) },
    { label: t('fullWidth'), icon: '↔', checked: !!page.format.page_full_width, onClick: () => setFormat(page.id, { page_full_width: !page.format.page_full_width }) },
    { label: t('lockPage'), icon: '🔒', checked: !!page.format.block_locked, onClick: () => setFormat(page.id, { block_locked: !page.format.block_locked }) },
    { separator: true, label: '' },
    { label: fav ? t('removeFromFavorites') : t('addToFavorites'), icon: '☆', onClick: () => toggleFavorite(page.id) },
    { label: t('copyLink'), icon: '🔗', hint: 'Ctrl+L', onClick: () => copyPageLink(page.id) },
    { label: t('duplicate'), icon: '⧉', disabled: page.parent_table === 'collection', onClick: () => { const c = duplicateBlock(page.id); if (c) navigate(c) } },
    { label: t('exportMd'), icon: '⇩', onClick: () => exportPageMarkdown(page.id) },
    { separator: true, label: '' },
    { label: t('moveToTrash'), icon: '🗑', danger: true, onClick: () => { trashPage(page.id); toast(t('movedToTrash')) } }
  ]
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((id, i) => {
          const b = db.block(id)
          return (
            <span key={id} className="crumb-wrap">
              {i > 0 && <span className="crumb-sep">/</span>}
              <button className="crumb" onClick={() => navigate(id)}>
                <span>{b?.format.page_icon ?? (b?.type === 'collection_view_page' ? '🗂' : '📄')}</span>
                <span className="crumb-title">{pageTitle(b) || t('untitled')}</span>
              </button>
            </span>
          )
        })}
        {page.format.block_locked && <span className="lock-badge">🔒 {t('locked')}</span>}
      </div>
      <div className="topbar-actions">
        <span className="muted small" title={new Date(page.last_edited_time).toLocaleString()}>
          {t('edited')} {relativeTime(page.last_edited_time)} · {words} {t('words')}
        </span>
        <button className={`btn-ghost ${fav ? 'fav' : ''}`} title={fav ? t('removeFromFavorites') : t('addToFavorites')} onClick={() => toggleFavorite(page.id)}>
          {fav ? '★' : '☆'}
        </button>
        <button className="btn-ghost" onClick={(e) => setMenu(anchorOf(e.currentTarget))}>⋯</button>
      </div>
      {menu && <MenuPopover anchor={{ ...menu, x: menu.x - 180 }} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function countWords(page: Block): number {
  let n = 0
  const visit = (id: ID): void => {
    const b = db.block(id)
    if (!b?.alive || (b.id !== page.id && (b.type === 'page' || b.type === 'collection_view_page'))) return
    n += plainText(b.properties.title).split(/\s+/).filter(Boolean).length
    b.content.forEach(visit)
  }
  page.content.forEach(visit)
  return n
}

function PageProperties({ page, coll }: { page: Block; coll: Collection }): JSX.Element {
  const t = useT()
  useDbVersion()
  const [header, setHeader] = useState<{ id: ID; anchor: Anchor } | null>(null)
  const parentBlock = db.block(coll.parent_id)
  const view = db.get('collection_view', parentBlock?.view_ids?.[0])
  const props = view ? orderedProperties(coll, view) : Object.entries(coll.schema).map(([id, schema]) => ({ id, schema, visible: true }))
  const readOnly = !!page.format.block_locked
  return (
    <div className="page-props">
      {props
        .filter((p) => p.id !== 'title')
        .map((p) => (
          <div key={p.id} className="page-prop-row">
            <button className="page-prop-name" onClick={(e) => view && setHeader({ id: p.id, anchor: anchorOf(e.currentTarget) })}>
              <span className="th-icon">{propertyIcon(p.schema.type)}</span> {p.schema.name}
            </button>
            <div className="page-prop-value">
              <PropertyCell row={page} propId={p.id} schema={p.schema} coll={coll} readOnly={readOnly} variant="page" />
            </div>
          </div>
        ))}
      {!readOnly && (
        <button className="btn-ghost small muted" onClick={() => addProperty(coll.id, { name: t('property'), type: 'text' })}>
          + {t('addProperty')}
        </button>
      )}
      {header && view && <PropertyHeaderMenu coll={coll} view={view} propId={header.id} anchor={header.anchor} onClose={() => setHeader(null)} />}
    </div>
  )
}

export function PageView({ pageId }: { pageId: ID }): JSX.Element {
  const t = useT()
  const page = useBlock(pageId)
  const dbColl = useCollection(page?.type === 'collection_view_page' ? page.collection_id : undefined)
  const rowColl = useCollection(page?.parent_table === 'collection' ? page.parent_id : undefined)
  const [iconPicker, setIconPicker] = useState<Anchor | null>(null)
  const [coverPicker, setCoverPicker] = useState<Anchor | null>(null)

  if (!page) return <div className="page-missing">{t('noResults')}</div>
  if (!page.alive) {
    return (
      <div className="page-missing">
        <p>🗑 {t('movedToTrash')}</p>
        <button className="btn-primary" onClick={() => restorePage(page.id)}>{t('restore')}</button>
      </div>
    )
  }

  const locked = !!page.format.block_locked
  const isDb = page.type === 'collection_view_page'
  const title = isDb ? dbColl?.name : page.properties.title
  const cover = page.format.page_cover
  const icon = page.format.page_icon

  const focusFirst = (): void => {
    const first = page.content.find((c) => db.block(c)?.alive)
    const fb = db.block(first)
    if (fb && (fb.type === 'text' || fb.type.includes('header') || fb.type.endsWith('list') || fb.type === 'to_do')) requestFocus(fb.id, 'start')
    else requestFocus(insertChild(page.id, 'text', 0), 'start')
  }

  const clickTail = (): void => {
    if (locked || isDb) return
    const lastId = [...page.content].reverse().find((c) => db.block(c)?.alive)
    const last = db.block(lastId)
    if (last && isEmptyBlock(last)) requestFocus(last.id, 'start')
    else requestFocus(insertChild(page.id, 'text'), 'start')
  }

  return (
    <div className="page-scroll">
      <Topbar page={page} />
      {cover && (
        <div className="cover" style={{ ...coverStyle(cover), backgroundPositionY: `${page.format.page_cover_position ?? 50}%` }}>
          {!locked && (
            <div className="cover-actions">
              <button onClick={(e) => setCoverPicker(anchorOf(e.currentTarget))}>{t('changeCover')}</button>
              <button onClick={() => setFormat(page.id, { page_cover: undefined })}>{t('removeCover')}</button>
            </div>
          )}
        </div>
      )}
      <div className={`page ${page.format.page_full_width ? 'full' : ''} ${page.format.page_small_text ? 'small' : ''} font-${page.format.page_font ?? 'default'} ${cover ? 'has-cover' : ''}`}>
        {icon && (
          <button className="page-icon" disabled={locked} onClick={(e) => setIconPicker(anchorOf(e.currentTarget))}>
            {icon}
          </button>
        )}
        {!locked && (
          <div className="page-controls">
            {!icon && <button className="btn-ghost small" onClick={(e) => setIconPicker(anchorOf(e.currentTarget))}>☺ {t('addIcon')}</button>}
            {!cover && (
              <button className="btn-ghost small" onClick={() => setFormat(page.id, { page_cover: COVERS[Math.floor(Math.random() * COVERS.length)] })}>
                🖼 {t('addCover')}
              </button>
            )}
          </div>
        )}
        <Editable
          focusId={`title:${page.id}`}
          className="page-title"
          value={title}
          readOnly={locked}
          placeholder={t('untitled')}
          placeholderAlways
          onChange={(rt) => (isDb && dbColl ? updateCollection(dbColl.id, { name: rt }) : setTitle(page.id, rt))}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === 'ArrowDown') && !isDb) {
              e.preventDefault()
              focusFirst()
            }
          }}
          onPaste={(e) => {
            e.preventDefault()
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n/g, ' '))
          }}
        />
        {rowColl && <PageProperties page={page} coll={rowColl} />}
        {isDb ? (
          <DatabaseView blockId={page.id} inline={false} />
        ) : (
          <div className="page-content">
            <BlockChildren ids={page.content} depth={0} readOnly={locked} />
          </div>
        )}
        <div className="page-tail" onClick={clickTail} />
      </div>
      {iconPicker && (
        <Popover anchor={iconPicker} onClose={() => setIconPicker(null)} width={340}>
          <EmojiPicker
            onPick={(e) => {
              setFormat(page.id, { page_icon: e })
              setIconPicker(null)
            }}
            onRemove={() => {
              setFormat(page.id, { page_icon: undefined })
              setIconPicker(null)
            }}
          />
        </Popover>
      )}
      {coverPicker && (
        <Popover anchor={coverPicker} onClose={() => setCoverPicker(null)} width={380}>
          <div className="cover-picker">
            {COVERS.map((c) => (
              <button key={c} className="cover-swatch" style={{ backgroundImage: c }} onClick={() => { setFormat(page.id, { page_cover: c }); setCoverPicker(null) }} />
            ))}
            <button
              className="btn-primary wide"
              onClick={async () => {
                const url = await window.noosion.pickImage()
                if (url) setFormat(page.id, { page_cover: url })
                setCoverPicker(null)
              }}
            >
              {t('uploadImage')}
            </button>
            <label className="small muted wide">
              Position
              <input type="range" min={0} max={100} value={page.format.page_cover_position ?? 50} onChange={(e) => setFormat(page.id, { page_cover_position: Number(e.target.value) })} />
            </label>
          </div>
        </Popover>
      )}
    </div>
  )
}
