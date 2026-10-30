import type { Block, BlockType, ID, RichText } from '@shared/types'
import { db } from '../store/records'
import {
  createDatabase,
  createPage,
  deleteBlock,
  duplicateBlock,
  indent,
  insertAfter,
  insertColumns,
  insertSimpleTable,
  isPage,
  makeBlock,
  moveUpDown,
  outdent,
  pageOf,
  setTitle,
  TEXT_TYPES,
  turnInto,
  addView
} from '../store/ops'
import { navigate, requestFocus, ui } from '../store/ui'
import { caretClientRect, caretOnFirstLine, caretOnLastLine, getCaretOffset, isCaretAtEnd, isCaretAtStart, selectionIn, splitAtCaret } from '../lib/caret'
import { concatRichText, plainText, removeRange, sliceRichText } from '../lib/richtext'
import { buildBlocks, parseMarkdown } from '../lib/markdown'
import { closeSlash, filterSlashItems, slash, type SlashItem } from './editorState'
import { openInlineLink } from './inlineToolbarState'

const LIST_TYPES: BlockType[] = ['bulleted_list', 'numbered_list', 'to_do', 'toggle']
const EDITABLE_TYPES: BlockType[] = [...TEXT_TYPES, 'code', 'equation']

/** Depth-first order of editable blocks as they appear on screen. */
export function visibleOrder(rootId: ID): ID[] {
  const out: ID[] = []
  const visit = (id: ID): void => {
    const b = db.block(id)
    if (!b?.alive) return
    if (EDITABLE_TYPES.includes(b.type)) out.push(id)
    if (isPage(b) && id !== rootId) return
    if (b.type === 'collection_view' || b.type === 'table') return
    if (b.type === 'toggle' && !b.format.toggle_open) return
    b.content.forEach(visit)
  }
  visit(rootId)
  return out
}

function neighbour(id: ID, dir: -1 | 1): ID | undefined {
  const page = pageOf(id)
  if (!page) return
  const order = visibleOrder(page)
  const i = order.indexOf(id)
  return i < 0 ? undefined : order[i + dir]
}

function focusTitle(id: ID): void {
  const page = pageOf(id)
  if (page) requestFocus(`title:${page}`, 'end')
}

/** Commands shared by the keyboard handler and the block menu. */
const TURN_INTO_KEYS: Record<string, BlockType> = {
  '0': 'text', '1': 'header', '2': 'sub_header', '3': 'sub_sub_header', '4': 'to_do',
  '5': 'bulleted_list', '6': 'numbered_list', '7': 'toggle', '8': 'code', '9': 'page'
}

export function handleBlockKeyDown(e: React.KeyboardEvent<HTMLDivElement>, el: HTMLDivElement, id: ID): void {
  const b = db.block(id)
  if (!b) return
  const mod = e.ctrlKey || e.metaKey

  // Slash menu navigation takes priority.
  const s = slash.get()
  if (s.blockId === id) {
    const items = filterSlashItems(s.query)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = items.length || 1
      slash.set({ index: (s.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n })
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const item = items[s.index]
      if (item) applySlashItem(item)
      else closeSlash()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeSlash()
      return
    }
  }

  if (mod && e.altKey && TURN_INTO_KEYS[e.key]) {
    e.preventDefault()
    const type = TURN_INTO_KEYS[e.key]!
    if (type === 'page') turnInto(id, 'page')
    else {
      turnInto(id, type)
      requestFocus(id, getCaretOffset(el))
    }
    return
  }

  if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    const copy = duplicateBlock(id)
    if (copy) requestFocus(copy, 'end')
    return
  }
  if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault()
    moveUpDown(id, e.key === 'ArrowUp' ? -1 : 1)
    requestFocus(id, getCaretOffset(el))
    return
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    document.execCommand('strikeThrough')
    return
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    toggleInlineCode(el)
    return
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openInlineLink()
    return
  }
  if (mod && e.key === 'Enter') {
    e.preventDefault()
    if (b.type === 'to_do') db.transact((tx) => tx.update('block', id, { properties: { ...b.properties, checked: !b.properties.checked } }))
    if (b.type === 'toggle') db.transact((tx) => tx.update('block', id, { format: { ...b.format, toggle_open: !b.format.toggle_open } }))
    return
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    if (b.type === 'code') {
      e.preventDefault()
      document.execCommand('insertText', false, '\n')
      return
    }
    e.preventDefault()
    splitBlock(el, b)
    return
  }
  if (e.key === 'Enter' && e.shiftKey && b.type !== 'code') {
    e.preventDefault()
    document.execCommand('insertLineBreak')
    return
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    if (b.type === 'code') {
      document.execCommand('insertText', false, '  ')
      return
    }
    const offset = getCaretOffset(el)
    if (e.shiftKey ? outdent(id) : indent(id)) requestFocus(id, offset)
    return
  }

  const range = selectionIn(el)
  const collapsed = !!range?.collapsed

  if (e.key === 'Backspace' && collapsed && isCaretAtStart(el)) {
    e.preventDefault()
    mergeBackward(b)
    return
  }
  if (e.key === 'Delete' && collapsed && isCaretAtEnd(el)) {
    const next = neighbour(id, 1)
    const nb = db.block(next)
    if (nb && nb.type !== 'code') {
      e.preventDefault()
      const offset = plainText(b.properties.title).length
      mergeInto(b, nb)
      requestFocus(id, offset)
    }
    return
  }

  if (e.key === 'ArrowUp' && !e.shiftKey && caretOnFirstLine(el)) {
    const prev = neighbour(id, -1)
    e.preventDefault()
    if (prev) requestFocus(prev, 'end')
    else focusTitle(id)
    return
  }
  if (e.key === 'ArrowDown' && !e.shiftKey && caretOnLastLine(el)) {
    const next = neighbour(id, 1)
    if (next) {
      e.preventDefault()
      requestFocus(next, 'start')
    }
    return
  }
  if (e.key === 'ArrowLeft' && !e.shiftKey && collapsed && isCaretAtStart(el)) {
    const prev = neighbour(id, -1)
    if (prev) {
      e.preventDefault()
      requestFocus(prev, 'end')
    }
    return
  }
  if (e.key === 'ArrowRight' && !e.shiftKey && collapsed && isCaretAtEnd(el)) {
    const next = neighbour(id, 1)
    if (next) {
      e.preventDefault()
      requestFocus(next, 'start')
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    el.blur()
    ui.set({ selectedBlocks: [id] })
  }
}

function splitBlock(el: HTMLDivElement, b: Block): void {
  const [before, after] = splitAtCaret(el)
  const empty = !plainText(before) && !plainText(after)
  // Enter on an empty list item ends the list (outdent first when nested).
  if (empty && LIST_TYPES.includes(b.type)) {
    if (!outdent(b.id)) turnInto(b.id, 'text')
    requestFocus(b.id, 'start')
    return
  }
  if (empty && (b.type === 'quote' || b.type === 'callout')) {
    turnInto(b.id, 'text')
    requestFocus(b.id, 'start')
    return
  }
  const continues = LIST_TYPES.includes(b.type) || b.type === 'quote' ? b.type : 'text'
  const nb = makeBlock(continues, b.parent_id, b.parent_table, { properties: { title: after } })
  const intoChildren = b.content.length > 0 && (b.type !== 'toggle' || b.format.toggle_open) && !isPage(b)
  db.transact(
    (tx) => {
      tx.update('block', b.id, { properties: { ...b.properties, title: before } })
      if (intoChildren) {
        nb.parent_id = b.id
        tx.set('block', nb)
        tx.update('block', b.id, { content: [nb.id, ...b.content] })
      } else {
        tx.set('block', nb)
        const parent = b.parent_table === 'space' ? null : tx.get('block', b.parent_id)
        if (parent) {
          const list = [...parent.content]
          list.splice(list.indexOf(b.id) + 1, 0, nb.id)
          tx.update('block', parent.id, { content: list })
        }
      }
    },
    { focus: b.id }
  )
  requestFocus(nb.id, 'start')
}

function mergeInto(target: Block, source: Block): void {
  db.transact(
    (tx) => {
      const t = tx.get('block', target.id)!
      tx.update('block', target.id, { properties: { ...t.properties, title: concatRichText(t.properties.title, source.properties.title) } })
      // Lift the removed block's children into its place.
      const parent = tx.get('block', source.parent_id)
      if (parent) {
        const list = [...parent.content]
        list.splice(list.indexOf(source.id), 1, ...source.content)
        tx.update('block', parent.id, { content: list })
        for (const c of source.content) tx.update('block', c, { parent_id: parent.id })
      }
      tx.update('block', source.id, { alive: false, content: [] })
    },
    { focus: target.id }
  )
}

function mergeBackward(b: Block): void {
  if (b.type !== 'text' && TEXT_TYPES.includes(b.type)) {
    turnInto(b.id, 'text')
    requestFocus(b.id, 'start')
    return
  }
  const parent = db.block(b.parent_id)
  if (b.parent_table === 'block' && parent && !isPage(parent) && parent.type !== 'column' && parent.content[parent.content.length - 1] === b.id && outdent(b.id)) {
    requestFocus(b.id, 'start')
    return
  }
  const prevId = neighbour(b.id, -1)
  const prev = db.block(prevId)
  if (!prev || prev.type === 'code' || prev.type === 'equation') {
    if (!plainText(b.properties.title) && prev) {
      deleteBlock(b.id)
      requestFocus(prev.id, 'end')
    } else if (!prev) focusTitle(b.id)
    return
  }
  const offset = plainText(prev.properties.title).length
  mergeInto(prev, b)
  requestFocus(prev.id, offset)
}

function toggleInlineCode(el: HTMLDivElement): void {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  const range = sel.getRangeAt(0)
  const existing = (range.commonAncestorContainer.parentElement as HTMLElement | null)?.closest('code')
  if (existing && el.contains(existing)) {
    existing.replaceWith(...Array.from(existing.childNodes))
  } else {
    const code = document.createElement('code')
    code.appendChild(range.extractContents())
    range.insertNode(code)
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// ---------- Text change hooks: markdown shortcuts & slash detection ----------

const MD_SHORTCUTS: Array<[RegExp, BlockType]> = [
  [/^#\s$/, 'header'],
  [/^##\s$/, 'sub_header'],
  [/^###\s$/, 'sub_sub_header'],
  [/^[-*+]\s$/, 'bulleted_list'],
  [/^1[.)]\s$/, 'numbered_list'],
  [/^\[\s?\]\s$/, 'to_do'],
  [/^>\s$/, 'toggle'],
  [/^["“]\s$/, 'quote'],
  [/^```$/, 'code']
]

export function handleBlockChange(id: ID, rt: RichText, el: HTMLDivElement): void {
  const b = db.block(id)
  if (!b) return
  const text = plainText(rt)
  const caret = getCaretOffset(el)

  if (b.type === 'text' || b.type === 'bulleted_list' || b.type === 'numbered_list') {
    const head = text.slice(0, caret)
    for (const [re, type] of MD_SHORTCUTS) {
      if (re.test(head) && (b.type === 'text' || type !== b.type)) {
        const rest = sliceRichText(rt, head.length)
        db.transact((tx) => tx.update('block', id, { type, properties: { ...b.properties, title: rest }, format: type === 'code' ? { ...b.format, code_language: 'plain' } : b.format }), { focus: id })
        requestFocus(id, 'start')
        return
      }
    }
    if (b.type === 'text' && text === '---') {
      db.transact((tx) => tx.update('block', id, { type: 'divider', properties: { ...b.properties, title: [] } }), { focus: id })
      const nb = insertAfter(id, 'text')
      requestFocus(nb, 'start')
      return
    }
  }

  setTitle(id, rt)

  // Slash menu tracking
  const s = slash.get()
  if (s.blockId === id) {
    if (caret <= s.start || text[s.start] !== '/') closeSlash()
    else {
      const query = text.slice(s.start + 1, caret)
      if (/\s{2}|\n/.test(query) || query.length > 30) closeSlash()
      else slash.set({ query, index: 0 })
    }
  } else if (b.type !== 'code' && text[caret - 1] === '/' && (caret === 1 || /\s/.test(text[caret - 2] ?? ''))) {
    const rect = caretClientRect()
    slash.set({ blockId: id, start: caret - 1, query: '', index: 0, anchor: { x: rect?.left ?? 0, y: (rect?.bottom ?? 0) + 6, h: (rect?.height ?? 20) + 12 } })
  }
}

export function applySlashItem(item: SlashItem): void {
  const s = slash.get()
  const id = s.blockId
  closeSlash()
  if (!id) return
  const b = db.block(id)
  if (!b) return
  const rt = removeRange(b.properties.title, s.start, s.start + 1 + s.query.length)
  const empty = !plainText(rt)
  const locale = ui.get().settings.locale
  const page = pageOf(id)
  db.transact((tx) => tx.update('block', id, { properties: { ...b.properties, title: rt } }), { focus: id })

  // Target: reuse the current block when it became empty, otherwise insert after it.
  const target = (type: BlockType): ID => {
    if (empty) {
      turnInto(id, type)
      return id
    }
    return insertAfter(id, type)
  }

  switch (item.id) {
    case 'page': {
      if (!page) return
      const parentId = b.parent_table === 'block' ? b.parent_id : page
      const pid = createPage(parentId, { afterId: id })
      if (empty) deleteBlock(id)
      navigate(pid)
      setTimeout(() => requestFocus(`title:${pid}`, 'start'), 50)
      return
    }
    case 'db_inline':
    case 'db_page':
    case 'db_board':
    case 'db_calendar': {
      if (!page) return
      const parentId = b.parent_table === 'block' ? b.parent_id : page
      const inline = item.id !== 'db_page'
      const dbId = createDatabase(parentId, { inline, afterId: id, locale, replaceId: empty ? id : undefined })
      if (item.id === 'db_board' || item.id === 'db_calendar') {
        const blk = db.block(dbId)!
        const type = item.id === 'db_board' ? 'board' : 'calendar'
        const vid = addView(dbId, type, locale === 'ko' ? (type === 'board' ? '보드' : '캘린더') : type === 'board' ? 'Board' : 'Calendar')
        db.transact((tx) => tx.update('block', dbId, { view_ids: [vid, ...(blk.view_ids ?? [])] }))
      }
      if (!inline) navigate(dbId)
      return
    }
    case 'col2':
    case 'col3': {
      const first = insertColumns(id, item.id === 'col2' ? 2 : 3)
      if (empty) deleteBlock(id)
      if (first) requestFocus(first, 'start')
      return
    }
    case 'table': {
      insertSimpleTable(id)
      if (empty) deleteBlock(id)
      return
    }
    case 'divider': {
      const did = target('divider')
      const nb = insertAfter(did, 'text')
      requestFocus(nb, 'start')
      return
    }
    default: {
      const type = item.type!
      const tid = target(type)
      if (type === 'code') {
        const blk = db.block(tid)!
        db.transact((tx) => tx.update('block', tid, { format: { ...blk.format, code_language: 'plain' } }))
      }
      if (type === 'image' || type === 'bookmark') return
      requestFocus(tid, empty ? s.start : 'start')
    }
  }
}

// ---------- Paste ----------

export function handleBlockPaste(e: React.ClipboardEvent<HTMLDivElement>, el: HTMLDivElement, id: ID): void {
  const b = db.block(id)
  if (!b) return
  const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
  if (file) {
    e.preventDefault()
    file.arrayBuffer().then(async (buf) => {
      const url = await window.noosion.saveBytes(new Uint8Array(buf), file.type.split('/')[1] ?? 'png')
      const target = plainText(b.properties.title) ? insertAfter(id, 'image') : id
      db.transact((tx) => {
        const cur = tx.get('block', target)!
        tx.update('block', target, { type: 'image', properties: { ...cur.properties, source: url } })
      })
    })
    return
  }
  const text = e.clipboardData.getData('text/plain')
  if (b.type === 'code') {
    e.preventDefault()
    document.execCommand('insertText', false, text)
    return
  }
  // A bare URL pasted into an empty block becomes a bookmark.
  if (/^https?:\/\/\S+$/.test(text.trim()) && !plainText(b.properties.title)) {
    e.preventDefault()
    const url = text.trim()
    if (/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url)) {
      db.transact((tx) => tx.update('block', id, { type: 'image', properties: { ...b.properties, source: url } }))
    } else {
      db.transact((tx) => tx.update('block', id, { type: 'bookmark', properties: { ...b.properties, source: url } }))
    }
    return
  }
  // Multi-line text is parsed as Markdown into separate blocks.
  if (text.includes('\n')) {
    e.preventDefault()
    const parsed = parseMarkdown(text)
    const blocks = parsed.title ? [{ type: 'header' as BlockType, title: [[parsed.title]] as RichText, children: [] }, ...parsed.blocks] : parsed.blocks
    const parent = db.block(b.parent_id)
    if (!parent) return
    let lastId = id
    db.transact((tx) => {
      const ids = buildBlocks(blocks, b.parent_id, (nb) => tx.set('block', nb))
      const list = [...tx.get('block', parent.id)!.content]
      const replace = !plainText(b.properties.title)
      list.splice(list.indexOf(id) + (replace ? 0 : 1), replace ? 1 : 0, ...ids)
      tx.update('block', parent.id, { content: list })
      if (replace) tx.update('block', id, { alive: false })
      lastId = ids[ids.length - 1] ?? id
    })
    requestFocus(lastId, 'end')
  }
}
