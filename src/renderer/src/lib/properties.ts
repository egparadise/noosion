import type { Block, Collection, CollectionView, ID, PropertySchema, PropertyType, RichText, ViewFilter } from '@shared/types'
import { plainText } from './richtext'

export const PROPERTY_TYPES: Array<{ type: PropertyType; ko: string; en: string; icon: string }> = [
  { type: 'text', ko: '텍스트', en: 'Text', icon: '≡' },
  { type: 'number', ko: '숫자', en: 'Number', icon: '#' },
  { type: 'select', ko: '선택', en: 'Select', icon: '⌄' },
  { type: 'multi_select', ko: '다중 선택', en: 'Multi-select', icon: '☰' },
  { type: 'status', ko: '상태', en: 'Status', icon: '◔' },
  { type: 'date', ko: '날짜', en: 'Date', icon: '▦' },
  { type: 'checkbox', ko: '체크박스', en: 'Checkbox', icon: '☑' },
  { type: 'person', ko: '사람', en: 'Person', icon: '👤' },
  { type: 'url', ko: 'URL', en: 'URL', icon: '🔗' },
  { type: 'email', ko: '이메일', en: 'Email', icon: '@' },
  { type: 'phone_number', ko: '전화번호', en: 'Phone', icon: '☏' },
  { type: 'formula', ko: '수식', en: 'Formula', icon: 'Σ' },
  { type: 'created_time', ko: '생성 일시', en: 'Created time', icon: '◷' },
  { type: 'last_edited_time', ko: '최종 편집 일시', en: 'Last edited time', icon: '◷' }
]

export function propertyIcon(type: PropertyType): string {
  if (type === 'title') return 'Aa'
  return PROPERTY_TYPES.find((p) => p.type === type)?.icon ?? '≡'
}

export interface DateValue {
  start: string
  end?: string
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Typed value of a property, used by filters, sorts and formulas. */
export function propertyValue(row: Block, propId: ID, schema: PropertySchema, coll?: Collection): unknown {
  switch (schema.type) {
    case 'title':
      return plainText(row.properties.title)
    case 'created_time':
      return row.created_time
    case 'last_edited_time':
      return row.last_edited_time
    case 'formula':
      return coll ? evaluateFormula(schema.formula ?? '', row, coll) : ''
    default:
      return row.properties[propId]
  }
}

export function formatPropertyValue(row: Block, propId: ID, schema: PropertySchema, coll?: Collection): string {
  const v = propertyValue(row, propId, schema, coll)
  if (v === undefined || v === null || v === '') return ''
  switch (schema.type) {
    case 'select':
    case 'status':
      return schema.options?.find((o) => o.id === v)?.value ?? ''
    case 'multi_select':
      return (Array.isArray(v) ? v : [])
        .map((id) => schema.options?.find((o) => o.id === id)?.value)
        .filter(Boolean)
        .join(', ')
    case 'date': {
      const d = v as DateValue
      return d.end ? `${d.start} → ${d.end}` : d.start
    }
    case 'checkbox':
      return v ? '✓' : ''
    case 'created_time':
    case 'last_edited_time':
      return fmtDate(v as number)
    case 'number':
      return formatNumber(v as number, schema.number_format)
    case 'text':
      return typeof v === 'string' ? v : plainText(v as RichText)
    default:
      return String(v)
  }
}

export function formatNumber(n: number, format?: PropertySchema['number_format']): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return ''
  switch (format) {
    case 'comma':
      return n.toLocaleString()
    case 'percent':
      return `${(n * 100).toLocaleString()}%`
    case 'won':
      return `₩${n.toLocaleString()}`
    case 'dollar':
      return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    default:
      return String(n)
  }
}

// ---------- Filters & sorts (collection_view.query2) ----------

export function matchesFilter(row: Block, f: ViewFilter, coll: Collection): boolean {
  const schema = coll.schema[f.property]
  if (!schema) return true
  const raw = propertyValue(row, f.property, schema, coll)
  const text = formatPropertyValue(row, f.property, schema, coll).toLowerCase()
  const val = (f.value ?? '').toLowerCase()
  switch (f.operator) {
    case 'is_empty':
      return text === ''
    case 'is_not_empty':
      return text !== ''
    case 'checked':
      return !!raw
    case 'unchecked':
      return !raw
    case 'contains':
      return text.includes(val)
    case 'does_not_contain':
      return !text.includes(val)
    case 'is':
      return schema.type === 'multi_select' ? text.split(', ').includes(val) : text === val
    case 'is_not':
      return text !== val
    case 'gt':
    case 'lt': {
      const a = schema.type === 'date' ? (raw as DateValue | undefined)?.start ?? '' : Number(raw)
      const b = schema.type === 'date' ? f.value ?? '' : Number(f.value)
      return f.operator === 'gt' ? a > b : a < b
    }
    default:
      return true
  }
}

function sortKey(row: Block, propId: ID, schema: PropertySchema, coll: Collection): string | number {
  const v = propertyValue(row, propId, schema, coll)
  if (schema.type === 'number' || schema.type === 'created_time' || schema.type === 'last_edited_time') return Number(v ?? -Infinity)
  if (schema.type === 'checkbox') return v ? 1 : 0
  if (schema.type === 'date') return (v as DateValue | undefined)?.start ?? ''
  if (schema.type === 'select' || schema.type === 'status') {
    const idx = schema.options?.findIndex((o) => o.id === v) ?? -1
    return idx < 0 ? 9999 : idx
  }
  return formatPropertyValue(row, propId, schema, coll).toLowerCase()
}

export function queryRows(rows: Block[], view: CollectionView, coll: Collection, search = ''): Block[] {
  let out = rows
  const filters = view.query2.filter ?? []
  if (filters.length) {
    const any = view.query2.filter_operator === 'or'
    out = out.filter((r) => (any ? filters.some((f) => matchesFilter(r, f, coll)) : filters.every((f) => matchesFilter(r, f, coll))))
  }
  if (search) {
    const q = search.toLowerCase()
    out = out.filter((r) => plainText(r.properties.title).toLowerCase().includes(q))
  }
  const sorts = (view.query2.sort ?? []).filter((s) => coll.schema[s.property])
  if (sorts.length) {
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const schema = coll.schema[s.property]!
        const ka = sortKey(a, s.property, schema, coll)
        const kb = sortKey(b, s.property, schema, coll)
        if (ka < kb) return s.direction === 'ascending' ? -1 : 1
        if (ka > kb) return s.direction === 'ascending' ? 1 : -1
      }
      return 0
    })
  } else if (view.page_sort?.length) {
    const order = new Map(view.page_sort.map((id, i) => [id, i]))
    out = [...out].sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
  }
  return out
}

export function orderedProperties(coll: Collection, view: CollectionView): Array<{ id: ID; schema: PropertySchema; visible: boolean; width?: number }> {
  const known = view.format.table_properties ?? []
  const ids = Object.keys(coll.schema)
  const ordered = [
    ...known.filter((p) => coll.schema[p.property]),
    ...ids.filter((id) => !known.some((p) => p.property === id)).map((id) => ({ property: id, visible: true }))
  ]
  // Title always first.
  ordered.sort((a, b) => (a.property === 'title' ? -1 : b.property === 'title' ? 1 : 0))
  return ordered.map((p) => ({ id: p.property, schema: coll.schema[p.property]!, visible: p.visible, width: (p as { width?: number }).width }))
}

// ---------- Formula (subset of Notion formula language) ----------

type Value = number | string | boolean | null

class FormulaError extends Error {}

export function evaluateFormula(src: string, row: Block, coll: Collection): Value {
  if (!src.trim()) return ''
  try {
    const tokens = tokenize(src)
    let pos = 0
    const peek = () => tokens[pos]
    const next = () => tokens[pos++]
    const expect = (v: string) => {
      if (next()?.v !== v) throw new FormulaError(`Expected ${v}`)
    }
    const num = (x: Value): number => (typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : Number(x) || 0)
    const str = (x: Value): string => (x === null ? '' : String(x))

    const prop = (name: string): Value => {
      const entry = Object.entries(coll.schema).find(([, s]) => s.name === name)
      if (!entry) throw new FormulaError(`Unknown property ${name}`)
      const [id, schema] = entry
      if (schema.type === 'formula') return '' // avoid recursion
      const v = propertyValue(row, id, schema, coll)
      if (schema.type === 'number') return typeof v === 'number' ? v : null
      if (schema.type === 'checkbox') return !!v
      return formatPropertyValue(row, id, schema, coll)
    }

    const fns: Record<string, (args: Value[]) => Value> = {
      concat: (a) => a.map(str).join(''),
      length: (a) => str(a[0] ?? '').length,
      round: (a) => Math.round(num(a[0] ?? 0) * 10 ** num(a[1] ?? 0)) / 10 ** num(a[1] ?? 0),
      floor: (a) => Math.floor(num(a[0] ?? 0)),
      ceil: (a) => Math.ceil(num(a[0] ?? 0)),
      abs: (a) => Math.abs(num(a[0] ?? 0)),
      min: (a) => Math.min(...a.map(num)),
      max: (a) => Math.max(...a.map(num)),
      sqrt: (a) => Math.sqrt(num(a[0] ?? 0)),
      toNumber: (a) => num(a[0] ?? 0),
      format: (a) => str(a[0] ?? ''),
      upper: (a) => str(a[0] ?? '').toUpperCase(),
      lower: (a) => str(a[0] ?? '').toLowerCase(),
      contains: (a) => str(a[0] ?? '').includes(str(a[1] ?? '')),
      replaceAll: (a) => str(a[0] ?? '').split(str(a[1] ?? '')).join(str(a[2] ?? '')),
      empty: (a) => a[0] === null || a[0] === '' || a[0] === 0 || a[0] === false,
      not: (a) => !a[0],
      and: (a) => a.every(Boolean),
      or: (a) => a.some(Boolean),
      now: () => new Date().toISOString().slice(0, 16).replace('T', ' '),
      today: () => new Date().toISOString().slice(0, 10),
      dateBetween: (a) => {
        const d1 = new Date(str(a[0] ?? '')).getTime()
        const d2 = new Date(str(a[1] ?? '')).getTime()
        const unit = str(a[2] ?? 'days')
        const ms = { minutes: 6e4, hours: 36e5, days: 864e5, weeks: 6048e5 }[unit] ?? 864e5
        return Math.floor((d1 - d2) / ms)
      }
    }

    const primary = (): Value => {
      const t = next()
      if (!t) throw new FormulaError('Unexpected end')
      if (t.k === 'num') return Number(t.v)
      if (t.k === 'str') return t.v
      if (t.v === '(') {
        const v = expr()
        expect(')')
        return v
      }
      if (t.v === '-') return -num(primary())
      if (t.v === '!') return !primary()
      if (t.k === 'id') {
        if (t.v === 'true') return true
        if (t.v === 'false') return false
        if (peek()?.v === '(') {
          next()
          const args: Value[] = []
          if (t.v === 'if') {
            const c = expr()
            expect(',')
            const a = expr()
            expect(',')
            const b = expr()
            expect(')')
            return c ? a : b
          }
          while (peek() && peek()!.v !== ')') {
            args.push(expr())
            if (peek()?.v === ',') next()
          }
          expect(')')
          if (t.v === 'prop') return prop(str(args[0] ?? ''))
          const fn = fns[t.v]
          if (!fn) throw new FormulaError(`Unknown function ${t.v}`)
          return fn(args)
        }
      }
      throw new FormulaError(`Unexpected ${t.v}`)
    }
    const binary = (ops: string[], sub: () => Value, apply: (op: string, a: Value, b: Value) => Value) => (): Value => {
      let left = sub()
      while (peek() && ops.includes(peek()!.v)) {
        const op = next()!.v
        left = apply(op, left, sub())
      }
      return left
    }
    const mul = binary(['*', '/', '%'], primary, (op, a, b) =>
      op === '*' ? num(a) * num(b) : op === '/' ? num(a) / num(b) : num(a) % num(b)
    )
    const add = binary(['+', '-'], mul, (op, a, b) =>
      op === '+' ? (typeof a === 'string' || typeof b === 'string' ? str(a) + str(b) : num(a) + num(b)) : num(a) - num(b)
    )
    const cmp = binary(['>', '<', '>=', '<=', '==', '!='], add, (op, a, b) => {
      switch (op) {
        case '>': return (a as number) > (b as number)
        case '<': return (a as number) < (b as number)
        case '>=': return (a as number) >= (b as number)
        case '<=': return (a as number) <= (b as number)
        case '==': return a === b
        default: return a !== b
      }
    })
    const logic = binary(['&&', '||', 'and', 'or'], cmp, (op, a, b) => (op === '&&' || op === 'and' ? !!a && !!b : !!a || !!b))
    function expr(): Value {
      const c = logic()
      if (peek()?.v === '?') {
        next()
        const a = expr()
        expect(':')
        const b = expr()
        return c ? a : b
      }
      return c
    }
    const result = expr()
    if (pos < tokens.length) throw new FormulaError('Unexpected trailing input')
    return typeof result === 'number' && !Number.isFinite(result) ? '' : result
  } catch (err) {
    return err instanceof FormulaError ? `⚠ ${err.message}` : '⚠ error'
  }
}

function tokenize(src: string): Array<{ k: 'num' | 'str' | 'id' | 'op'; v: string }> {
  const out: Array<{ k: 'num' | 'str' | 'id' | 'op'; v: string }> = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!
      out.push({ k: 'num', v: m[0] }); i += m[0].length; continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== c) { s += src[j] === '\\' ? src[++j] : src[j]; j++ }
      out.push({ k: 'str', v: s }); i = j + 1; continue
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      out.push({ k: 'id', v: m[0] }); i += m[0].length; continue
    }
    const two = src.slice(i, i + 2)
    if (['>=', '<=', '==', '!=', '&&', '||'].includes(two)) { out.push({ k: 'op', v: two }); i += 2; continue }
    if ('+-*/%()<>,!?:'.includes(c)) { out.push({ k: 'op', v: c }); i++; continue }
    throw new FormulaError(`Unexpected character ${c}`)
  }
  return out
}
