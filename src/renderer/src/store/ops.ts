import type {
  Block,
  BlockFormat,
  BlockType,
  Collection,
  CollectionView,
  ID,
  ParentTable,
  PropertySchema,
  RichText,
  Space,
  ViewType
} from '@shared/types'
import { db, type Tx } from './records'
import { fromPlain, plainText } from '../lib/richtext'

export const newId = (): ID => crypto.randomUUID()

export const PAGE_TYPES: BlockType[] = ['page', 'collection_view_page']
export const TEXT_TYPES: BlockType[] = [
  'text',
  'header',
  'sub_header',
  'sub_sub_header',
  'bulleted_list',
  'numbered_list',
  'to_do',
  'toggle',
  'quote',
  'callout'
]
/** Types that may hold nested child blocks (indent target). */
export const NESTABLE_TYPES: BlockType[] = ['text', 'bulleted_list', 'numbered_list', 'to_do', 'toggle', 'quote', 'callout', 'page']

export function spaceId(): ID {
  return Object.keys(db.records.space)[0] ?? ''
}

export function makeBlock(type: BlockType, parentId: ID, parentTable: ParentTable, extra: Partial<Block> = {}): Block {
  const now = Date.now()
  return {
    id: newId(),
    type,
    space_id: spaceId(),
    version: 1,
    properties: {},
    content: [],
    format: {},
    parent_id: parentId,
    parent_table: parentTable,
    alive: true,
    created_time: now,
    last_edited_time: now,
    ...extra
  }
}

// ---------- Queries ----------

export function isPage(b: Block | undefined): boolean {
  return !!b && PAGE_TYPES.includes(b.type)
}

export function pageTitle(b: Block | undefined): string {
  if (!b) return ''
  if (b.type === 'collection_view_page' && b.collection_id) {
    return plainText(db.get('collection', b.collection_id)?.name)
  }
  return plainText(b.properties.title)
}

/** Nearest ancestor (or self) that is a page. */
export function pageOf(id: ID): ID | undefined {
  let b = db.block(id)
  while (b) {
    if (isPage(b)) return b.id
    if (b.parent_table === 'collection') return undefined
    b = db.block(b.parent_id)
  }
  return undefined
}

/** Page ancestors from the workspace root down to (and including) the page itself. */
export function breadcrumbs(pageId: ID): ID[] {
  const out: ID[] = []
  let cur = db.block(pageId)
  while (cur) {
    if (isPage(cur)) out.unshift(cur.id)
    if (cur.parent_table === 'space') break
    if (cur.parent_table === 'collection') {
      const coll = db.get('collection', cur.parent_id)
      cur = coll ? db.block(coll.parent_id) : undefined
    } else cur = db.block(cur.parent_id)
  }
  return out
}

export function childPages(id: ID): ID[] {
  const b = db.block(id)
  if (!b) return []
  return b.content.filter((c) => {
    const child = db.block(c)
    return child?.alive && isPage(child)
  })
}

export function collectionRows(collectionId: ID): Block[] {
  const index = db.derived('rowsByCollection', () => {
    const map = new Map<ID, Block[]>()
    for (const b of Object.values(db.records.block)) {
      if (b.parent_table !== 'collection' || !b.alive) continue
      const list = map.get(b.parent_id) ?? []
      list.push(b)
      map.set(b.parent_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.created_time - b.created_time)
    return map
  })
  return index.get(collectionId) ?? []
}

export function trashedPages(): Block[] {
  return db.derived('trash', () =>
    Object.values(db.records.block)
      .filter((b) => !b.alive && b.moved_to_trash_time && (isPage(b) || b.parent_table === 'collection'))
      .sort((a, b) => (b.moved_to_trash_time ?? 0) - (a.moved_to_trash_time ?? 0))
  )
}

function siblingsOf(tx: Tx, b: Block): { list: ID[]; owner: 'block' | 'space'; ownerId: ID } | null {
  if (b.parent_table === 'space') {
    const s = tx.get('space', b.parent_id)
    return s ? { list: s.pages, owner: 'space', ownerId: s.id } : null
  }
  if (b.parent_table === 'block') {
    const p = tx.get('block', b.parent_id)
    return p ? { list: p.content, owner: 'block', ownerId: p.id } : null
  }
  return null
}

function setSiblings(tx: Tx, owner: 'block' | 'space', ownerId: ID, list: ID[]): void {
  if (owner === 'space') tx.update('space', ownerId, { pages: list } as Partial<Space>)
  else tx.update('block', ownerId, { content: list })
}

function detach(tx: Tx, b: Block): void {
  const sib = siblingsOf(tx, b)
  if (sib) setSiblings(tx, sib.owner, sib.ownerId, sib.list.filter((x) => x !== b.id))
}

function attach(tx: Tx, id: ID, owner: 'block' | 'space', ownerId: ID, index?: number): void {
  const list =
    owner === 'space' ? [...(tx.get('space', ownerId)?.pages ?? [])] : [...(tx.get('block', ownerId)?.content ?? [])]
  const filtered = list.filter((x) => x !== id)
  filtered.splice(index === undefined ? filtered.length : Math.max(0, Math.min(index, filtered.length)), 0, id)
  setSiblings(tx, owner, ownerId, filtered)
}

// ---------- Workspace bootstrap ----------

export function ensureWorkspace(locale: 'ko' | 'en'): void {
  if (Object.keys(db.records.space).length) return
  const ko = locale === 'ko'
  const space: Space = {
    id: newId(),
    version: 1,
    name: ko ? '내 워크스페이스' : 'My Workspace',
    icon: '🌿',
    pages: [],
    bookmarked_pages: []
  }
  db.transact(
    (tx) => {
      tx.set('space', space)
      const page = makeBlock('page', space.id, 'space', {
        space_id: space.id,
        properties: { title: fromPlain(ko ? 'Noosion 시작하기' : 'Getting Started with Noosion') },
        format: { page_icon: '👋' }
      })
      const lines: Array<[BlockType, string, Partial<Block>?]> = ko
        ? [
            ['callout', 'Noosion은 Notion과 같은 방식의 로컬 우선 워크스페이스입니다. 모든 데이터는 이 PC에 저장됩니다.', { format: { callout_icon: '💡', block_color: 'gray_background' } }],
            ['header', '기본 사용법'],
            ['to_do', '아무 곳이나 클릭해서 입력을 시작하세요'],
            ['to_do', '"/" 를 입력하면 블록 메뉴가 열립니다 (제목, 할 일, 표, 데이터베이스 …)'],
            ['to_do', '"# ", "- ", "1. ", "[] ", "> " 같은 Markdown 단축 입력을 지원합니다'],
            ['to_do', '블록 왼쪽의 ⋮⋮ 핸들을 드래그해서 순서를 바꾸세요'],
            ['to_do', 'Tab / Shift+Tab 으로 들여쓰기, Ctrl+Z 로 실행 취소'],
            ['sub_header', '단축키'],
            ['bulleted_list', 'Ctrl+P : 빠른 검색 · Ctrl+T : 새 탭 · Ctrl+W : 탭 닫기 · Ctrl+Shift+T : 닫은 탭 다시 열기'],
            ['bulleted_list', 'Ctrl+\\ : 사이드바 · Ctrl+[ / ] : 뒤로/앞으로 · Ctrl+N : 새 페이지'],
            ['bulleted_list', '텍스트를 선택하면 서식 도구 모음이 나타납니다 (Ctrl+B, I, U, E, K)'],
            ['toggle', '토글 블록 — 클릭해서 펼치기'],
            ['quote', '좋은 도구는 생각을 정리하게 해 줍니다.'],
            ['divider', ''],
            ['text', '아래 데이터베이스와 하위 페이지를 열어 보세요.']
          ]
        : [
            ['callout', 'Noosion is a local-first, Notion-style workspace. All data stays on this computer.', { format: { callout_icon: '💡', block_color: 'gray_background' } }],
            ['header', 'The basics'],
            ['to_do', 'Click anywhere and just start typing'],
            ['to_do', 'Type "/" to open the block menu (headings, to-dos, tables, databases …)'],
            ['to_do', 'Markdown shortcuts such as "# ", "- ", "1. ", "[] ", "> " work too'],
            ['to_do', 'Drag the ⋮⋮ handle left of a block to reorder it'],
            ['to_do', 'Tab / Shift+Tab to indent, Ctrl+Z to undo'],
            ['sub_header', 'Shortcuts'],
            ['bulleted_list', 'Ctrl+P search · Ctrl+T new tab · Ctrl+W close tab · Ctrl+Shift+T reopen tab'],
            ['bulleted_list', 'Ctrl+\\ sidebar · Ctrl+[ / ] back/forward · Ctrl+N new page'],
            ['bulleted_list', 'Select text to show the formatting toolbar (Ctrl+B, I, U, E, K)'],
            ['toggle', 'Toggle block — click to expand'],
            ['quote', 'Good tools help you think clearly.'],
            ['divider', ''],
            ['text', 'Open the database and sub-page below.']
          ]
      const children: ID[] = []
      for (const [type, text, extra] of lines) {
        const b = makeBlock(type, page.id, 'block', { space_id: space.id, properties: { title: fromPlain(text) }, ...extra })
        if (type === 'toggle') {
          const inner = makeBlock('text', b.id, 'block', {
            space_id: space.id,
            properties: { title: fromPlain(ko ? '토글 안에 원하는 내용을 넣을 수 있습니다.' : 'Put anything inside a toggle.') }
          })
          tx.set('block', inner)
          b.content = [inner.id]
        }
        tx.set('block', b)
        children.push(b.id)
      }
      tx.set('block', { ...page, content: children })
      tx.set('space', { ...space, pages: [page.id] })
    },
    { skipUndo: true }
  )
  const page = db.get('space', space.id)!.pages[0]!
  createDatabase(page, { inline: true, title: ko ? '할 일 목록' : 'Task list', sample: true, locale })
  createPage(page, { title: ko ? '하위 페이지 예시' : 'Example sub-page', icon: '📄' })
}

// ---------- Pages ----------

export function createPage(parentId: ID | null, opts: { title?: string; icon?: string; afterId?: ID } = {}): ID {
  const sid = spaceId()
  const b = makeBlock('page', parentId ?? sid, parentId ? 'block' : 'space', {
    properties: { title: fromPlain(opts.title ?? '') },
    format: opts.icon ? { page_icon: opts.icon } : {}
  })
  db.transact((tx) => {
    tx.set('block', b)
    if (parentId) {
      const parent = tx.get('block', parentId)
      const idx = opts.afterId && parent ? parent.content.indexOf(opts.afterId) + 1 : undefined
      attach(tx, b.id, 'block', parentId, idx || undefined)
    } else attach(tx, b.id, 'space', sid)
  })
  return b.id
}

export function trashPage(id: ID): void {
  db.transact((tx) => {
    const b = tx.get('block', id)
    if (!b) return
    tx.update('block', id, { alive: false, moved_to_trash_time: Date.now() })
    const s = tx.get('space', spaceId())
    if (s?.bookmarked_pages.includes(id)) {
      tx.update('space', s.id, { bookmarked_pages: s.bookmarked_pages.filter((x) => x !== id) })
    }
  })
}

export function restorePage(id: ID): void {
  db.transact((tx) => {
    const b = tx.get('block', id)
    if (!b) return
    tx.update('block', id, { alive: true, moved_to_trash_time: undefined })
    const parentAlive =
      b.parent_table === 'space' ||
      (b.parent_table === 'block' && tx.get('block', b.parent_id)?.alive) ||
      (b.parent_table === 'collection' && tx.get('collection', b.parent_id)?.alive)
    if (!parentAlive) {
      // Parent is gone: restore to the workspace root.
      detach(tx, b)
      tx.update('block', id, { parent_id: spaceId(), parent_table: 'space' })
      attach(tx, id, 'space', spaceId())
    } else if (b.parent_table !== 'collection') {
      const sib = siblingsOf(tx, b)
      if (sib && !sib.list.includes(id)) attach(tx, id, sib.owner, sib.ownerId)
    }
  })
}

export function deleteForever(id: ID): void {
  db.transact((tx) => {
    const visit = (bid: ID): void => {
      const b = tx.get('block', bid)
      if (!b) return
      b.content.forEach(visit)
      if (b.collection_id) {
        for (const r of collectionRows(b.collection_id)) visit(r.id)
        for (const v of b.view_ids ?? []) tx.remove('collection_view', v)
        tx.remove('collection', b.collection_id)
      }
      tx.remove('block', bid)
    }
    const b = tx.get('block', id)
    if (b) detach(tx, b)
    visit(id)
  })
}

export function toggleFavorite(id: ID): void {
  const s = db.get('space', spaceId())
  if (!s) return
  const has = s.bookmarked_pages.includes(id)
  db.transact((tx) =>
    tx.update('space', s.id, {
      bookmarked_pages: has ? s.bookmarked_pages.filter((x) => x !== id) : [...s.bookmarked_pages, id]
    })
  )
}

// ---------- Blocks ----------

export function updateBlock(id: ID, patch: Partial<Block>, mergeKey?: string): void {
  db.transact((tx) => tx.update('block', id, patch), { mergeKey, focus: id })
}

export function setTitle(id: ID, title: RichText): void {
  const b = db.block(id)
  if (!b) return
  db.transact((tx) => tx.update('block', id, { properties: { ...b.properties, title } }), {
    mergeKey: `title:${id}`,
    focus: id
  })
}

export function setFormat(id: ID, patch: Partial<BlockFormat>): void {
  const b = db.block(id)
  if (!b) return
  db.transact((tx) => tx.update('block', id, { format: { ...b.format, ...patch } }), { focus: id })
}

export function setProperty(id: ID, key: string, value: unknown, mergeKey?: string): void {
  const b = db.block(id)
  if (!b) return
  db.transact((tx) => tx.update('block', id, { properties: { ...b.properties, [key]: value } }), { mergeKey, focus: id })
}

/** Insert a new block after `afterId` (same parent). Returns the new id. */
export function insertAfter(afterId: ID, type: BlockType, extra: Partial<Block> = {}): ID {
  const after = db.block(afterId)
  if (!after) return ''
  const b = makeBlock(type, after.parent_id, after.parent_table, extra)
  db.transact(
    (tx) => {
      tx.set('block', b)
      const sib = siblingsOf(tx, after)
      if (sib) attach(tx, b.id, sib.owner, sib.ownerId, sib.list.indexOf(afterId) + 1)
    },
    { focus: afterId }
  )
  return b.id
}

export function insertChild(parentId: ID, type: BlockType, index?: number, extra: Partial<Block> = {}): ID {
  const b = makeBlock(type, parentId, 'block', extra)
  db.transact((tx) => {
    tx.set('block', b)
    attach(tx, b.id, 'block', parentId, index)
  })
  return b.id
}

export function deleteBlock(id: ID): void {
  db.transact(
    (tx) => {
      const b = tx.get('block', id)
      if (!b) return
      detach(tx, b)
      tx.update('block', id, { alive: false })
    },
    { focus: id }
  )
}

export function turnInto(id: ID, type: BlockType): void {
  const b = db.block(id)
  if (!b || b.type === type) return
  if (type === 'page') {
    db.transact((tx) => tx.update('block', id, { type: 'page' }))
    return
  }
  const format = { ...b.format }
  if (type === 'callout' && !format.callout_icon) format.callout_icon = '💡'
  db.transact((tx) => tx.update('block', id, { type, format }), { focus: id })
}

export type DropPosition = 'before' | 'after' | 'inside'

export function moveBlock(id: ID, targetId: ID, pos: DropPosition): void {
  if (id === targetId) return
  // Refuse to move a block into its own subtree.
  let cur = db.block(targetId)
  while (cur && cur.parent_table === 'block') {
    if (cur.id === id) return
    cur = db.block(cur.parent_id)
  }
  db.transact((tx) => {
    const b = tx.get('block', id)
    const target = tx.get('block', targetId)
    if (!b || !target) return
    detach(tx, b)
    if (pos === 'inside') {
      tx.update('block', id, { parent_id: target.id, parent_table: 'block' })
      attach(tx, id, 'block', target.id)
      return
    }
    const fresh = tx.get('block', targetId)!
    const sib = siblingsOf(tx, fresh)
    if (!sib) return
    tx.update('block', id, { parent_id: fresh.parent_id, parent_table: fresh.parent_table })
    const idx = sib.list.indexOf(targetId)
    attach(tx, id, sib.owner, sib.ownerId, pos === 'before' ? idx : idx + 1)
  })
}

export function moveUpDown(id: ID, dir: -1 | 1): void {
  const b = db.block(id)
  if (!b) return
  db.transact(
    (tx) => {
      const sib = siblingsOf(tx, b)
      if (!sib) return
      const i = sib.list.indexOf(id)
      const j = i + dir
      if (j < 0 || j >= sib.list.length) return
      const list = [...sib.list]
      ;[list[i], list[j]] = [list[j]!, list[i]!]
      setSiblings(tx, sib.owner, sib.ownerId, list)
    },
    { focus: id }
  )
}

/** Tab: become the last child of the previous sibling. */
export function indent(id: ID): boolean {
  const b = db.block(id)
  if (!b || b.parent_table !== 'block') return false
  const parent = db.block(b.parent_id)
  if (!parent) return false
  const idx = parent.content.indexOf(id)
  const prev = db.block(parent.content[idx - 1])
  if (!prev || !NESTABLE_TYPES.includes(prev.type) || prev.type === 'page') return false
  db.transact(
    (tx) => {
      detach(tx, b)
      tx.update('block', id, { parent_id: prev.id })
      attach(tx, id, 'block', prev.id)
      if (prev.type === 'toggle') tx.update('block', prev.id, { format: { ...prev.format, toggle_open: true } })
    },
    { focus: id }
  )
  return true
}

/** Shift+Tab: move after the parent; following siblings become this block's children (Notion behaviour). */
export function outdent(id: ID): boolean {
  const b = db.block(id)
  if (!b || b.parent_table !== 'block') return false
  const parent = db.block(b.parent_id)
  if (!parent || isPage(parent) || parent.type === 'column' || parent.parent_table !== 'block') return false
  const grand = db.block(parent.parent_id)
  if (!grand) return false
  db.transact(
    (tx) => {
      const idx = parent.content.indexOf(id)
      const following = parent.content.slice(idx + 1)
      tx.update('block', parent.id, { content: parent.content.slice(0, idx) })
      for (const f of following) tx.update('block', f, { parent_id: id })
      tx.update('block', id, { parent_id: grand.id, content: [...b.content, ...following] })
      attach(tx, id, 'block', grand.id, grand.content.indexOf(parent.id) + 1)
    },
    { focus: id }
  )
  return true
}

export function duplicateBlock(id: ID): ID | undefined {
  const src = db.block(id)
  if (!src) return
  let rootCopy = ''
  db.transact((tx) => {
    const copy = (bid: ID, parentId: ID, parentTable: Block['parent_table']): ID => {
      const b = tx.get('block', bid)!
      const nb: Block = { ...b, id: newId(), parent_id: parentId, parent_table: parentTable, content: [], created_time: Date.now(), last_edited_time: Date.now(), version: 1 }
      nb.content = b.content.filter((c) => tx.get('block', c)?.alive).map((c) => copy(c, nb.id, 'block'))
      tx.set('block', nb)
      return nb.id
    }
    rootCopy = copy(id, src.parent_id, src.parent_table)
    if (src.parent_table === 'block' || src.parent_table === 'space') {
      const sib = siblingsOf(tx, src)
      if (sib) attach(tx, rootCopy, sib.owner, sib.ownerId, sib.list.indexOf(id) + 1)
    }
  })
  return rootCopy
}

/** Create a 2-or-3 column layout after a block. */
export function insertColumns(afterId: ID, count: number): ID | undefined {
  const after = db.block(afterId)
  if (!after) return
  const list = makeBlock('column_list', after.parent_id, after.parent_table)
  let firstText: ID | undefined
  db.transact((tx) => {
    for (let i = 0; i < count; i++) {
      const col = makeBlock('column', list.id, 'block', { format: { column_ratio: 1 / count } })
      const text = makeBlock('text', col.id, 'block')
      firstText ??= text.id
      col.content = [text.id]
      list.content.push(col.id)
      tx.set('block', text)
      tx.set('block', col)
    }
    tx.set('block', list)
    const sib = siblingsOf(tx, after)
    if (sib) attach(tx, list.id, sib.owner, sib.ownerId, sib.list.indexOf(afterId) + 1)
  })
  return firstText
}

export function insertSimpleTable(afterId: ID, rows = 3, cols = 3): ID {
  const after = db.block(afterId)
  if (!after) return ''
  const table = makeBlock('table', after.parent_id, after.parent_table)
  const colIds = Array.from({ length: cols }, () => newId().slice(0, 8))
  table.format = { table_block_column_order: colIds, table_block_column_header: true }
  db.transact((tx) => {
    for (let r = 0; r < rows; r++) {
      const row = makeBlock('table_row', table.id, 'block')
      tx.set('block', row)
      table.content.push(row.id)
    }
    tx.set('block', table)
    const sib = siblingsOf(tx, after)
    if (sib) attach(tx, table.id, sib.owner, sib.ownerId, sib.list.indexOf(afterId) + 1)
  })
  return table.id
}

// ---------- Databases ----------

const SELECT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']
export const randomColor = (): string => SELECT_COLORS[Math.floor(Math.random() * SELECT_COLORS.length)]!

export function createDatabase(
  parentId: ID,
  opts: { inline: boolean; afterId?: ID; title?: string; sample?: boolean; locale?: 'ko' | 'en'; replaceId?: ID }
): ID {
  const ko = (opts.locale ?? 'ko') === 'ko'
  const blockType: BlockType = opts.inline ? 'collection_view' : 'collection_view_page'
  const blk = makeBlock(blockType, parentId, 'block')
  const statusOptions = [
    { id: newId().slice(0, 8), value: ko ? '시작 전' : 'Not started', color: 'gray' },
    { id: newId().slice(0, 8), value: ko ? '진행 중' : 'In progress', color: 'blue' },
    { id: newId().slice(0, 8), value: ko ? '완료' : 'Done', color: 'green' }
  ]
  const schema: Record<ID, PropertySchema> = {
    title: { name: ko ? '이름' : 'Name', type: 'title' },
    stat: { name: ko ? '상태' : 'Status', type: 'status', options: statusOptions },
    date: { name: ko ? '날짜' : 'Date', type: 'date' },
    tags: { name: ko ? '태그' : 'Tags', type: 'multi_select', options: [] }
  }
  const coll: Collection = {
    id: newId(),
    space_id: spaceId(),
    version: 1,
    name: fromPlain(opts.title ?? (ko ? '데이터베이스' : 'Database')),
    schema,
    parent_id: blk.id,
    parent_table: 'block',
    alive: true
  }
  const view: CollectionView = {
    id: newId(),
    space_id: spaceId(),
    version: 1,
    type: 'table',
    name: ko ? '표' : 'Table',
    parent_id: blk.id,
    alive: true,
    format: {},
    query2: {}
  }
  blk.collection_id = coll.id
  blk.view_ids = [view.id]
  db.transact((tx) => {
    tx.set('collection', coll)
    tx.set('collection_view', view)
    tx.set('block', blk)
    if (opts.replaceId) {
      const old = tx.get('block', opts.replaceId)
      if (old) {
        const sib = siblingsOf(tx, old)
        if (sib) {
          tx.update('block', blk.id, { parent_id: old.parent_id, parent_table: old.parent_table })
          setSiblings(tx, sib.owner, sib.ownerId, sib.list.map((x) => (x === old.id ? blk.id : x)))
          tx.update('block', old.id, { alive: false })
        }
      }
    } else {
      const parent = tx.get('block', parentId)
      const idx = opts.afterId && parent ? parent.content.indexOf(opts.afterId) + 1 : undefined
      attach(tx, blk.id, 'block', parentId, idx || undefined)
    }
    const rows = opts.sample
      ? ko
        ? ['분석 노트 정리', 'Noosion 기능 둘러보기', '첫 페이지 작성하기']
        : ['Write analysis notes', 'Explore Noosion', 'Create your first page']
      : ['', '', '']
    rows.forEach((name, i) => {
      const row = makeBlock('page', coll.id, 'collection', {
        created_time: Date.now() + i,
        properties: {
          title: fromPlain(name),
          ...(opts.sample ? { stat: statusOptions[i % 3]!.id, date: { start: new Date(Date.now() + i * 86400000).toISOString().slice(0, 10) } } : {})
        }
      })
      tx.set('block', row)
    })
  })
  return blk.id
}

export function addRow(collectionId: ID, props: Record<string, unknown> = {}): ID {
  const row = makeBlock('page', collectionId, 'collection', { properties: { title: [], ...props } })
  db.transact((tx) => tx.set('block', row))
  return row.id
}

export function updateCollection(id: ID, patch: Partial<Collection>): void {
  db.transact((tx) => tx.update('collection', id, patch))
}

export function updateSchema(collectionId: ID, propId: ID, patch: Partial<PropertySchema> | null): void {
  const c = db.get('collection', collectionId)
  if (!c) return
  const schema = { ...c.schema }
  if (patch === null) delete schema[propId]
  else schema[propId] = { ...schema[propId]!, ...patch }
  db.transact((tx) => tx.update('collection', collectionId, { schema }))
}

export function addProperty(collectionId: ID, schema: PropertySchema): ID {
  const id = newId().slice(0, 8)
  updateSchema(collectionId, id, schema)
  return id
}

export function updateView(id: ID, patch: Partial<CollectionView>): void {
  db.transact((tx) => tx.update('collection_view', id, patch))
}

export function addView(blockId: ID, type: ViewType, name: string): ID {
  const b = db.block(blockId)
  if (!b) return ''
  const v: CollectionView = {
    id: newId(),
    space_id: spaceId(),
    version: 1,
    type,
    name,
    parent_id: blockId,
    alive: true,
    format: {},
    query2: {}
  }
  db.transact((tx) => {
    tx.set('collection_view', v)
    tx.update('block', blockId, { view_ids: [...(b.view_ids ?? []), v.id] })
  })
  return v.id
}

export function removeView(blockId: ID, viewId: ID): void {
  const b = db.block(blockId)
  if (!b || (b.view_ids ?? []).length <= 1) return
  db.transact((tx) => {
    tx.update('block', blockId, { view_ids: (b.view_ids ?? []).filter((v) => v !== viewId) })
    tx.update('collection_view', viewId, { alive: false })
  })
}
