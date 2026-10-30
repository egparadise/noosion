import type { Block, BlockType, ID, RichText } from '@shared/types'
import { db } from '../store/records'
import { collectionRows, makeBlock, newId, pageTitle, spaceId } from '../store/ops'
import { formatPropertyValue } from './properties'
import { inlineMarkdownToRichText, plainText, richTextToMarkdown } from './richtext'

// ---------- Export ----------

export function pageToMarkdown(pageId: ID): string {
  const page = db.block(pageId)
  if (!page) return ''
  const out: string[] = [`# ${pageTitle(page) || 'Untitled'}`, '']
  if (page.parent_table === 'collection') {
    const coll = db.get('collection', page.parent_id)
    for (const [pid, schema] of Object.entries(coll?.schema ?? {})) {
      if (pid === 'title') continue
      const v = formatPropertyValue(page, pid, schema)
      if (v) out.push(`${schema.name}: ${v}`)
    }
    out.push('')
  }
  if (page.type === 'collection_view_page') out.push(databaseToMarkdown(page), '')
  writeChildren(page.content, 0, out)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

function databaseToMarkdown(b: Block): string {
  const coll = db.get('collection', b.collection_id)
  if (!coll) return ''
  const props = Object.entries(coll.schema).sort(([a], [b2]) => (a === 'title' ? -1 : b2 === 'title' ? 1 : 0))
  const rows = collectionRows(coll.id)
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const lines = [
    `| ${props.map(([, s]) => esc(s.name)).join(' | ')} |`,
    `| ${props.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${props.map(([pid, s]) => esc(formatPropertyValue(r, pid, s))).join(' | ')} |`)
  ]
  return `**${plainText(coll.name)}**\n\n${lines.join('\n')}`
}

function writeChildren(ids: ID[], depth: number, out: string[]): void {
  let n = 0
  for (const id of ids) {
    const b = db.block(id)
    if (!b?.alive) continue
    n = b.type === 'numbered_list' ? n + 1 : 0
    writeBlock(b, depth, out, n)
  }
}

function writeBlock(b: Block, depth: number, out: string[], num: number): void {
  const pad = '    '.repeat(depth)
  const text = richTextToMarkdown(b.properties.title)
  let childDepth = depth + 1
  switch (b.type) {
    case 'header': out.push(`${pad}# ${text}`, ''); break
    case 'sub_header': out.push(`${pad}## ${text}`, ''); break
    case 'sub_sub_header': out.push(`${pad}### ${text}`, ''); break
    case 'bulleted_list': out.push(`${pad}- ${text}`); break
    case 'numbered_list': out.push(`${pad}${num}. ${text}`); break
    case 'to_do': out.push(`${pad}- [${b.properties.checked ? 'x' : ' '}] ${text}`); break
    case 'toggle': out.push(`${pad}- ${text}`); break
    case 'quote': out.push(`${pad}> ${text}`, ''); break
    case 'callout': out.push(`${pad}> ${b.format.callout_icon ?? '💡'} ${text}`, ''); break
    case 'divider': out.push(`${pad}---`, ''); break
    case 'code':
      out.push(`${pad}\`\`\`${b.format.code_language ?? ''}`, ...plainText(b.properties.title).split('\n').map((l) => pad + l), `${pad}\`\`\``, '')
      break
    case 'equation': out.push(`${pad}$$${plainText(b.properties.title)}$$`, ''); break
    case 'image': out.push(`${pad}![${plainText(b.properties.caption)}](${b.properties.source ?? ''})`, ''); break
    case 'bookmark': out.push(`${pad}[${b.format.bookmark_title || b.properties.source}](${b.properties.source ?? ''})`, ''); break
    case 'page':
    case 'collection_view_page':
      out.push(`${pad}[${pageTitle(b) || 'Untitled'}](noosion://page/${b.id})`, '')
      return
    case 'collection_view': out.push(databaseToMarkdown(b), ''); return
    case 'table': {
      const cols = b.format.table_block_column_order ?? []
      const rows = b.content.map((r) => db.block(r)).filter((r): r is Block => !!r?.alive)
      rows.forEach((r, i) => {
        out.push(`${pad}| ${cols.map((c) => richTextToMarkdown(r.properties[c] as RichText)).join(' | ')} |`)
        if (i === 0) out.push(`${pad}| ${cols.map(() => '---').join(' | ')} |`)
      })
      out.push('')
      return
    }
    case 'column_list':
    case 'column':
      childDepth = depth
      break
    default:
      out.push(`${pad}${text}`, '')
  }
  writeChildren(b.content, childDepth, out)
}

// ---------- Import ----------

interface ParsedBlock {
  type: BlockType
  title: RichText
  checked?: boolean
  language?: string
  source?: string
  rows?: string[][]
  children: ParsedBlock[]
}

export function parseMarkdown(md: string): { title?: string; blocks: ParsedBlock[] } {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const root: ParsedBlock[] = []
  const stack: Array<{ indent: number; block: ParsedBlock }> = []
  let title: string | undefined
  let i = 0
  const push = (b: ParsedBlock, indent: number, nestable: boolean): void => {
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const parent = stack[stack.length - 1]
    ;(parent ? parent.block.children : root).push(b)
    if (nestable) stack.push({ indent, block: b })
  }
  while (i < lines.length) {
    const raw = lines[i]!
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, '    ').length
    const line = raw.trim()
    i++
    if (!line) {
      stack.length = 0
      continue
    }
    const fence = /^```(\w*)/.exec(line)
    if (fence) {
      const code: string[] = []
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) code.push(lines[i++]!)
      i++
      push({ type: 'code', title: [[code.join('\n')]], language: fence[1] || 'plain', children: [] }, indent, false)
      continue
    }
    if (/^\|.*\|$/.test(line)) {
      const rows: string[][] = []
      let l = line
      for (;;) {
        if (!/^\|\s*:?-{2,}/.test(l)) rows.push(l.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|')))
        if (i >= lines.length || !/^\|.*\|$/.test(lines[i]!.trim())) break
        l = lines[i++]!.trim()
      }
      push({ type: 'table', title: [], rows, children: [] }, indent, false)
      continue
    }
    let m: RegExpExecArray | null
    if (!title && !root.length && (m = /^#\s+(.*)$/.exec(line))) {
      title = m[1]!
      continue
    }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      const type: BlockType = m[1]!.length === 1 ? 'header' : m[1]!.length === 2 ? 'sub_header' : 'sub_sub_header'
      push({ type, title: inlineMarkdownToRichText(m[2]!), children: [] }, indent, false)
    } else if ((m = /^[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line))) {
      push({ type: 'to_do', title: inlineMarkdownToRichText(m[2]!), checked: m[1] !== ' ', children: [] }, indent, true)
    } else if ((m = /^[-*+]\s+(.*)$/.exec(line))) {
      push({ type: 'bulleted_list', title: inlineMarkdownToRichText(m[1]!), children: [] }, indent, true)
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      push({ type: 'numbered_list', title: inlineMarkdownToRichText(m[1]!), children: [] }, indent, true)
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      push({ type: 'quote', title: inlineMarkdownToRichText(m[1]!), children: [] }, indent, false)
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      push({ type: 'divider', title: [], children: [] }, indent, false)
    } else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line))) {
      push({ type: 'image', title: [], source: m[2], children: [] }, indent, false)
    } else if ((m = /^\$\$(.+)\$\$$/.exec(line))) {
      push({ type: 'equation', title: [[m[1]!]], children: [] }, indent, false)
    } else {
      push({ type: 'text', title: inlineMarkdownToRichText(line), children: [] }, indent, true)
    }
  }
  return { title, blocks: root }
}

/** Materialise parsed Markdown as blocks under parentId. Returns created top-level ids (not attached). */
export function buildBlocks(parsed: ParsedBlock[], parentId: ID, set: (b: Block) => void): ID[] {
  return parsed.map((p) => {
    const b = makeBlock(p.type, parentId, 'block', { properties: { title: p.title } })
    if (p.checked) b.properties.checked = true
    if (p.language) b.format.code_language = p.language
    if (p.source) b.properties.source = p.source
    if (p.type === 'table' && p.rows) {
      const width = Math.max(...p.rows.map((r) => r.length))
      const cols = Array.from({ length: width }, () => newId().slice(0, 8))
      b.format = { table_block_column_order: cols, table_block_column_header: true }
      b.content = p.rows.map((r) => {
        const row = makeBlock('table_row', b.id, 'block')
        cols.forEach((c, ci) => (row.properties[c] = inlineMarkdownToRichText(r[ci] ?? '')))
        set(row)
        return row.id
      })
    } else {
      b.content = buildBlocks(p.children, b.id, set)
    }
    set(b)
    return b.id
  })
}

export function importMarkdownAsPage(name: string, md: string): ID {
  const parsed = parseMarkdown(md)
  const sid = spaceId()
  const page = makeBlock('page', sid, 'space', { properties: { title: [[parsed.title ?? name]] } })
  db.transact((tx) => {
    page.content = buildBlocks(parsed.blocks, page.id, (b) => tx.set('block', b))
    tx.set('block', page)
    const space = tx.get('space', sid)!
    tx.update('space', sid, { pages: [...space.pages, page.id] })
  })
  return page.id
}
