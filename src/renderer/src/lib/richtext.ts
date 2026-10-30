import type { Decoration, RichText } from '@shared/types'

// Notion stores inline text as decorated segments: [["plain"], ["bold", [["b"]]], ["link", [["a", url]]]].
// The editor works with contentEditable HTML, so we convert in both directions.

export const TEXT_COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const

export function plainText(rt: RichText | undefined): string {
  if (!rt) return ''
  return rt.map((s) => s[0]).join('')
}

export function fromPlain(text: string): RichText {
  return text ? [[text]] : []
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function safeUrl(url: string): string {
  return /^(https?:|mailto:|tel:|noosion:|#)/i.test(url) ? url : `https://${url}`
}

export function richTextToHtml(rt: RichText | undefined): string {
  if (!rt) return ''
  return rt
    .map(([text, decos]) => {
      let html = escapeHtml(text).replace(/\n/g, '<br>')
      if (!decos?.length) return html
      const get = (k: string) => decos.find((d) => d[0] === k)
      if (get('c')) html = `<code>${html}</code>`
      if (get('b')) html = `<b>${html}</b>`
      if (get('i')) html = `<i>${html}</i>`
      if (get('_')) html = `<u>${html}</u>`
      if (get('s')) html = `<s>${html}</s>`
      const h = get('h')
      if (h?.[1]) html = `<span data-color="${escapeHtml(h[1])}">${html}</span>`
      const a = get('a')
      if (a?.[1]) html = `<a href="${escapeHtml(safeUrl(a[1]))}">${html}</a>`
      return html
    })
    .join('')
}

function sameDecos(a: Decoration[] | undefined, b: Decoration[] | undefined): boolean {
  const ka = (a ?? []).map((d) => d.join('\u0000')).sort().join('|')
  const kb = (b ?? []).map((d) => d.join('\u0000')).sort().join('|')
  return ka === kb
}

/** Append a segment, merging with the previous one when decorations match. */
function push(out: RichText, text: string, decos: Decoration[]): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && sameDecos(last[1], decos)) {
    last[0] += text
    return
  }
  out.push(decos.length ? [text, decos.map((d) => [...d] as Decoration)] : [text])
}

export function htmlToRichText(root: Node): RichText {
  const out: RichText = []
  const walk = (node: Node, decos: Decoration[]): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(out, (node.textContent ?? '').replace(/​/g, ''), decos)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName
    if (tag === 'BR') {
      // A trailing <br> is only a contentEditable placeholder.
      if (el.nextSibling || el.parentNode !== root) push(out, '\n', decos)
      return
    }
    const next = [...decos]
    const add = (d: Decoration): void => {
      const i = next.findIndex((x) => x[0] === d[0])
      if (i >= 0) next.splice(i, 1)
      next.push(d)
    }
    if (tag === 'B' || tag === 'STRONG' || el.style.fontWeight === 'bold' || Number(el.style.fontWeight) >= 600) add(['b'])
    if (tag === 'I' || tag === 'EM' || el.style.fontStyle === 'italic') add(['i'])
    if (tag === 'U' || el.style.textDecoration.includes('underline')) add(['_'])
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || el.style.textDecoration.includes('line-through')) add(['s'])
    if (tag === 'CODE') add(['c'])
    if (tag === 'A' && el.getAttribute('href')) add(['a', el.getAttribute('href')!])
    if (el.dataset.color) add(['h', el.dataset.color])
    const isBlock = tag === 'DIV' || tag === 'P'
    if (isBlock && out.length && el.previousSibling) push(out, '\n', decos)
    el.childNodes.forEach((c) => walk(c, next))
  }
  root.childNodes.forEach((c) => walk(c, []))
  return out
}

export function richTextEquals(a: RichText | undefined, b: RichText | undefined): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}

export function concatRichText(a: RichText | undefined, b: RichText | undefined): RichText {
  const out: RichText = []
  for (const seg of [...(a ?? []), ...(b ?? [])]) push(out, seg[0], (seg[1] ?? []) as Decoration[])
  return out
}

/** Characters [from, to) of rich text, preserving decorations. */
export function sliceRichText(rt: RichText | undefined, from: number, to = Infinity): RichText {
  const out: RichText = []
  let pos = 0
  for (const [text, decos] of rt ?? []) {
    const start = Math.max(from - pos, 0)
    const end = Math.min(to - pos, text.length)
    if (end > start) push(out, text.slice(start, end), (decos ?? []) as Decoration[])
    pos += text.length
  }
  return out
}

export function removeRange(rt: RichText | undefined, from: number, to: number): RichText {
  return concatRichText(sliceRichText(rt, 0, from), sliceRichText(rt, to))
}

/** Parse inline Markdown (**b**, *i*, ~~s~~, `c`, [t](u)) into decorated segments. */
export function inlineMarkdownToRichText(src: string): RichText {
  const out: RichText = []
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*]+)\*|_([^_]+)_|<u>(.+?)<\/u>)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m.index > last) push(out, src.slice(last, m.index), [])
    if (m[2] ?? m[3]) push(out, (m[2] ?? m[3])!, [['b']])
    else if (m[4]) push(out, m[4], [['s']])
    else if (m[5]) push(out, m[5], [['c']])
    else if (m[6]) push(out, m[6], [['a', m[7]!]])
    else if (m[8] ?? m[9]) push(out, (m[8] ?? m[9])!, [['i']])
    else if (m[10]) push(out, m[10], [['_']])
    last = m.index + m[0].length
  }
  if (last < src.length) push(out, src.slice(last), [])
  return out
}

export function richTextToMarkdown(rt: RichText | undefined): string {
  if (!rt) return ''
  return rt
    .map(([text, decos]) => {
      let s = text
      if (!decos?.length) return s
      const has = (k: string) => decos.find((d) => d[0] === k)
      if (has('c')) s = '`' + s + '`'
      if (has('b')) s = `**${s}**`
      if (has('i')) s = `*${s}*`
      if (has('s')) s = `~~${s}~~`
      if (has('_')) s = `<u>${s}</u>`
      const a = has('a')
      if (a?.[1]) s = `[${s}](${a[1]})`
      return s
    })
    .join('')
}
