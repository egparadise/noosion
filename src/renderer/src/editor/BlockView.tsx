import { memo, useState } from 'react'
import type { Block, BlockType, ID } from '@shared/types'
import { useBlock, useDbVersion, db } from '../store/records'
import {
  deleteBlock,
  duplicateBlock,
  insertAfter,
  insertChild,
  moveBlock,
  pageTitle,
  setFormat,
  setProperty,
  turnInto,
  type DropPosition
} from '../store/ops'
import { navigate, requestFocus, ui } from '../store/ui'
import { Editable } from './Editable'
import { handleBlockChange, handleBlockKeyDown, handleBlockPaste } from './commands'
import { BLOCK_DRAG_MIME, COLORS, COLOR_NAMES, drag, slash, TURN_INTO_TYPES, SLASH_ITEMS } from './editorState'
import { anchorOf, MenuPopover, Popover, type Anchor, type MenuItem } from '../components/Popover'
import { EmojiPicker } from '../components/EmojiPicker'
import { useT } from '../lib/i18n'
import { plainText } from '../lib/richtext'
import { caretClientRect } from '../lib/caret'
import { ImageBlock, BookmarkBlock, CodeBlock, TableBlock, EquationBlock } from './MediaBlocks'
import { DatabaseView } from '../database/DatabaseView'

export function BlockChildren({ ids, depth, readOnly }: { ids: ID[]; depth: number; readOnly?: boolean }): JSX.Element {
  // Subscribe to all changes so list numbering follows sibling type changes; BlockView is memoized.
  useDbVersion()
  let n = 0
  return (
    <>
      {ids.map((id) => {
        const b = db.block(id)
        if (!b?.alive) return null
        n = b.type === 'numbered_list' ? n + 1 : 0
        return <BlockView key={id} id={id} depth={depth} number={n} readOnly={readOnly} />
      })}
    </>
  )
}

const BULLETS = ['•', '◦', '▪']

function placeholderFor(type: BlockType, t: ReturnType<typeof useT>): string {
  switch (type) {
    case 'header': return t('heading1')
    case 'sub_header': return t('heading2')
    case 'sub_sub_header': return t('heading3')
    case 'bulleted_list':
    case 'numbered_list': return t('listItem')
    case 'to_do': return t('todo')
    case 'toggle': return t('toggle')
    case 'quote': return t('quote')
    case 'callout': return t('emptyCallout')
    default: return t('typeSlash')
  }
}

function useBlockMenu(b: Block): MenuItem[] {
  const t = useT()
  const locale = ui.use((s) => s.settings.locale)
  const typeLabel = (type: BlockType): string => {
    const item = SLASH_ITEMS.find((s) => s.type === type)
    return item ? (locale === 'ko' ? item.ko : item.en) : type
  }
  return [
    { label: t('delete'), icon: '🗑', hint: 'Del', onClick: () => deleteBlock(b.id) },
    { label: t('duplicate'), icon: '⧉', hint: 'Ctrl+D', onClick: () => duplicateBlock(b.id) },
    {
      label: t('turnInto'),
      icon: '↻',
      submenu: TURN_INTO_TYPES.map((type) => ({ label: typeLabel(type), checked: b.type === type, onClick: () => turnInto(b.id, type) }))
    },
    {
      label: t('color'),
      icon: '🎨',
      submenu: [
        { label: t('default'), onClick: () => setFormat(b.id, { block_color: undefined }) },
        ...COLORS.map((c) => ({ label: `${t('textColor')} · ${COLOR_NAMES[c]![locale]}`, icon: <span className={`color-chip text-${c}`}>A</span>, onClick: () => setFormat(b.id, { block_color: c }) })),
        ...COLORS.map((c) => ({ label: `${t('background')} · ${COLOR_NAMES[c]![locale]}`, icon: <span className={`color-chip bg-${c}`}>A</span>, onClick: () => setFormat(b.id, { block_color: `${c}_background` }) }))
      ]
    }
  ]
}

function BlockHandle({ b, readOnly }: { b: Block; readOnly?: boolean }): JSX.Element | null {
  const [menu, setMenu] = useState<Anchor | null>(null)
  const items = useBlockMenu(b)
  if (readOnly) return null
  return (
    <div className="block-handle" contentEditable={false}>
      <button
        className="handle-btn"
        title="+"
        onClick={() => {
          const nid = insertAfter(b.id, 'text', { properties: { title: [['/']] } })
          requestFocus(nid, 'end')
          setTimeout(() => {
            const rect = caretClientRect()
            slash.set({ blockId: nid, start: 0, query: '', index: 0, anchor: { x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 6, h: 32 } })
          }, 40)
        }}
      >
        +
      </button>
      <button
        className="handle-btn drag"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(BLOCK_DRAG_MIME, b.id)
          e.dataTransfer.effectAllowed = 'move'
          const row = (e.currentTarget as HTMLElement).closest('.block')
          if (row) e.dataTransfer.setDragImage(row, 20, 12)
          drag.set({ dragging: b.id })
        }}
        onDragEnd={() => drag.set({ dragging: null, target: null, pos: null })}
        onClick={(e) => {
          ui.set({ selectedBlocks: [b.id] })
          setMenu(anchorOf(e.currentTarget))
        }}
      >
        ⋮⋮
      </button>
      {menu && <MenuPopover anchor={menu} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}

function PageLink({ b }: { b: Block }): JSX.Element {
  const t = useT()
  const icon = b.format.page_icon ?? (b.type === 'collection_view_page' ? '🗂' : '📄')
  return (
    <div
      className="page-link"
      onClick={(e) => navigate(b.id, { newTab: e.ctrlKey || e.metaKey || e.button === 1 })}
      onAuxClick={(e) => e.button === 1 && navigate(b.id, { newTab: true, background: true })}
    >
      <span className="page-link-icon">{icon}</span>
      <span className="page-link-title">{pageTitle(b) || t('untitled')}</span>
    </div>
  )
}

function CalloutIcon({ b, readOnly }: { b: Block; readOnly?: boolean }): JSX.Element {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  return (
    <>
      <button className="callout-icon" contentEditable={false} disabled={readOnly} onClick={(e) => setAnchor(anchorOf(e.currentTarget))}>
        {b.format.callout_icon ?? '💡'}
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={340}>
          <EmojiPicker
            onPick={(emoji) => {
              setFormat(b.id, { callout_icon: emoji })
              setAnchor(null)
            }}
          />
        </Popover>
      )}
    </>
  )
}

function dropPosition(e: React.DragEvent, el: HTMLElement): DropPosition {
  const r = el.getBoundingClientRect()
  return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
}

export const BlockView = memo(function BlockView({ id, depth, number, readOnly }: { id: ID; depth: number; number: number; readOnly?: boolean }): JSX.Element | null {
  const b = useBlock(id)
  const t = useT()
  const selected = ui.use((s) => s.selectedBlocks.includes(id))
  const dropPos = drag.use((s) => (s.target === id ? s.pos : null))
  if (!b || !b.alive) return null

  const color = b.format.block_color
  const colorClass = color ? (color.endsWith('_background') ? `bg-${color.replace('_background', '')}` : `text-${color}`) : ''
  const editable = (extra: { className?: string; placeholderAlways?: boolean } = {}) => (
    <Editable
      focusId={id}
      value={b.properties.title}
      readOnly={readOnly}
      className={extra.className}
      placeholder={placeholderFor(b.type, t)}
      placeholderAlways={extra.placeholderAlways}
      onChange={(rt, el) => handleBlockChange(id, rt, el)}
      onKeyDown={(e, el) => handleBlockKeyDown(e, el, id)}
      onPaste={(e, el) => handleBlockPaste(e, el, id)}
      onFocus={() => ui.get().selectedBlocks.length && ui.set({ selectedBlocks: [] })}
    />
  )

  let body: JSX.Element
  let children = b.content.length > 0
  switch (b.type) {
    case 'text':
      body = editable()
      break
    case 'header':
    case 'sub_header':
    case 'sub_sub_header':
      body = editable({ className: `h-${b.type}`, placeholderAlways: false })
      children = false
      break
    case 'bulleted_list':
      body = (
        <div className="list-row">
          <span className="list-marker" contentEditable={false}>{BULLETS[depth % 3]}</span>
          {editable()}
        </div>
      )
      break
    case 'numbered_list':
      body = (
        <div className="list-row">
          <span className="list-marker num" contentEditable={false}>{`${number}.`}</span>
          {editable()}
        </div>
      )
      break
    case 'to_do':
      body = (
        <div className={`list-row todo ${b.properties.checked ? 'checked' : ''}`}>
          <span className="list-marker" contentEditable={false}>
            <input type="checkbox" checked={!!b.properties.checked} disabled={readOnly} onChange={(e) => setProperty(id, 'checked', e.target.checked)} />
          </span>
          {editable()}
        </div>
      )
      break
    case 'toggle': {
      const open = !!b.format.toggle_open
      body = (
        <div className="list-row">
          <button className={`toggle-arrow ${open ? 'open' : ''}`} contentEditable={false} onClick={() => setFormat(id, { toggle_open: !open })}>
            ▶
          </button>
          {editable()}
        </div>
      )
      children = open
      break
    }
    case 'quote':
      body = <div className="quote">{editable()}</div>
      break
    case 'callout':
      body = (
        <div className={`callout ${color ? '' : 'bg-gray'}`}>
          <CalloutIcon b={b} readOnly={readOnly} />
          <div className="callout-body">
            {editable()}
            {b.content.length > 0 && <BlockChildren ids={b.content} depth={depth + 1} readOnly={readOnly} />}
          </div>
        </div>
      )
      children = false
      break
    case 'divider':
      body = <div className="divider" onClick={() => ui.set({ selectedBlocks: [id] })}><hr /></div>
      children = false
      break
    case 'code':
      body = <CodeBlock b={b} readOnly={readOnly} />
      children = false
      break
    case 'equation':
      body = <EquationBlock b={b} readOnly={readOnly} />
      children = false
      break
    case 'image':
      body = <ImageBlock b={b} readOnly={readOnly} />
      children = false
      break
    case 'bookmark':
      body = <BookmarkBlock b={b} readOnly={readOnly} />
      children = false
      break
    case 'page':
    case 'collection_view_page':
      body = <PageLink b={b} />
      children = false
      break
    case 'collection_view':
      body = <DatabaseView blockId={id} inline />
      children = false
      break
    case 'table':
      body = <TableBlock b={b} readOnly={readOnly} />
      children = false
      break
    case 'column_list':
      body = (
        <div className="column-list">
          {b.content.map((cid) => {
            const col = db.block(cid)
            if (!col?.alive) return null
            return (
              <div key={cid} className="column" style={{ flex: col.format.column_ratio ?? 1 }}>
                <BlockChildren ids={col.content} depth={0} readOnly={readOnly} />
                {!readOnly && (
                  <div className="column-tail" onClick={() => requestFocus(insertChild(cid, 'text'), 'start')} />
                )}
              </div>
            )
          })}
        </div>
      )
      children = false
      break
    default:
      body = editable()
  }

  return (
    <div
      className={`block block-${b.type} ${selected ? 'selected' : ''} ${dropPos ? `drop-${dropPos}` : ''}`}
      data-block-id={id}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(BLOCK_DRAG_MIME)) return
        e.preventDefault()
        e.stopPropagation()
        const pos = dropPosition(e, e.currentTarget)
        const s = drag.get()
        if (s.target !== id || s.pos !== pos) drag.set({ target: id, pos })
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node) && drag.get().target === id) drag.set({ target: null, pos: null })
      }}
      onDrop={(e) => {
        const src = e.dataTransfer.getData(BLOCK_DRAG_MIME)
        if (!src) return
        e.preventDefault()
        e.stopPropagation()
        moveBlock(src, id, dropPosition(e, e.currentTarget))
        drag.set({ dragging: null, target: null, pos: null })
      }}
    >
      <div className={`block-main ${colorClass}`}>
        <BlockHandle b={b} readOnly={readOnly} />
        {body}
      </div>
      {children && b.content.length > 0 && (
        <div className="block-children">
          <BlockChildren ids={b.content} depth={depth + 1} readOnly={readOnly} />
        </div>
      )}
      {b.type === 'toggle' && b.format.toggle_open && b.content.length === 0 && !readOnly && (
        <div className="block-children">
          <div className="toggle-empty" onClick={() => requestFocus(insertChild(id, 'text'), 'start')}>
            {ui.get().settings.locale === 'ko' ? '빈 토글입니다. 클릭하거나 블록을 끌어와서 추가하세요.' : 'Empty toggle. Click or drop blocks inside.'}
          </div>
        </div>
      )}
    </div>
  )
})

export function isEmptyBlock(b: Block | undefined): boolean {
  return !!b && b.type === 'text' && !plainText(b.properties.title) && b.content.length === 0
}
