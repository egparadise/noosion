import { useState } from 'react'
import type { Block, Collection, ID, PropertySchema, SelectOption } from '@shared/types'
import { navigate, ui } from '../store/ui'
import { newId, randomColor, setProperty, setTitle, updateSchema } from '../store/ops'
import { anchorOf, Popover, type Anchor } from '../components/Popover'
import { formatNumber, formatPropertyValue, propertyValue, type DateValue } from '../lib/properties'
import { fromPlain, plainText } from '../lib/richtext'
import { useT } from '../lib/i18n'
import { COLORS, COLOR_NAMES } from '../editor/editorState'

export function Tag({ option, onRemove }: { option: SelectOption; onRemove?: () => void }): JSX.Element {
  return (
    <span className={`tag tag-${option.color}`}>
      {option.value}
      {onRemove && (
        <button className="tag-x" onClick={(e) => { e.stopPropagation(); onRemove() }}>×</button>
      )}
    </span>
  )
}

function SelectEditor({ row, propId, schema, coll }: { row: Block; propId: ID; schema: PropertySchema; coll: Collection }): JSX.Element {
  const t = useT()
  const locale = ui.use((s) => s.settings.locale)
  const [q, setQ] = useState('')
  const [editOpt, setEditOpt] = useState<{ id: ID; anchor: Anchor } | null>(null)
  const multi = schema.type === 'multi_select'
  const options = schema.options ?? []
  const raw = row.properties[propId]
  const selected: ID[] = multi ? (Array.isArray(raw) ? (raw as ID[]) : []) : raw ? [raw as ID] : []
  const filtered = options.filter((o) => o.value.toLowerCase().includes(q.toLowerCase()))
  const exact = options.find((o) => o.value === q.trim())

  const choose = (id: ID): void => {
    if (multi) setProperty(row.id, propId, selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
    else setProperty(row.id, propId, selected[0] === id ? null : id)
  }
  const create = (): void => {
    const value = q.trim()
    if (!value) return
    const opt: SelectOption = { id: newId().slice(0, 8), value, color: randomColor() }
    updateSchema(coll.id, propId, { options: [...options, opt] })
    setProperty(row.id, propId, multi ? [...selected, opt.id] : opt.id)
    setQ('')
  }
  const editing = options.find((o) => o.id === editOpt?.id)

  return (
    <div className="select-editor">
      <div className="select-current">
        {selected.map((id) => {
          const o = options.find((x) => x.id === id)
          return o ? <Tag key={id} option={o} onRemove={() => choose(id)} /> : null
        })}
        <input
          autoFocus
          value={q}
          placeholder={selected.length ? '' : t('selectOrCreate')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (exact) choose(exact.id)
              else if (filtered.length === 1 && q) choose(filtered[0]!.id)
              else create()
            }
            if (e.key === 'Backspace' && !q && selected.length) choose(selected[selected.length - 1]!)
          }}
        />
      </div>
      <div className="menu-title">{t('selectOrCreate')}</div>
      {filtered.map((o) => (
        <div key={o.id} className="menu-item" onClick={() => choose(o.id)}>
          <Tag option={o} />
          <span className="spacer" />
          {selected.includes(o.id) && <span>✓</span>}
          <button className="btn-ghost small" onClick={(e) => { e.stopPropagation(); setEditOpt({ id: o.id, anchor: anchorOf(e.currentTarget, 'right') }) }}>⋯</button>
        </div>
      ))}
      {q.trim() && !exact && (
        <div className="menu-item" onClick={create}>
          {t('create')} <Tag option={{ id: 'new', value: q.trim(), color: 'gray' }} />
        </div>
      )}
      {editing && editOpt && (
        <Popover anchor={editOpt.anchor} onClose={() => setEditOpt(null)} width={220}>
          <div className="menu">
            <input
              className="input wide"
              defaultValue={editing.value}
              onBlur={(e) => updateSchema(coll.id, propId, { options: options.map((o) => (o.id === editing.id ? { ...o, value: e.target.value || o.value } : o)) })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <div
              className="menu-item danger"
              onClick={() => {
                updateSchema(coll.id, propId, { options: options.filter((o) => o.id !== editing.id) })
                setEditOpt(null)
              }}
            >
              🗑 {t('delete')}
            </div>
            <div className="menu-sep" />
            <div className="menu-title">{t('color')}</div>
            {COLORS.map((c) => (
              <div key={c} className="menu-item" onClick={() => updateSchema(coll.id, propId, { options: options.map((o) => (o.id === editing.id ? { ...o, color: c } : o)) })}>
                <span className={`color-chip tag-${c}`} /> {COLOR_NAMES[c]![locale]}
                <span className="spacer" />
                {editing.color === c && '✓'}
              </div>
            ))}
          </div>
        </Popover>
      )}
    </div>
  )
}

function DateEditor({ row, propId }: { row: Block; propId: ID }): JSX.Element {
  const t = useT()
  const v = (row.properties[propId] as DateValue | undefined) ?? { start: '' }
  const [hasEnd, setHasEnd] = useState(!!v.end)
  const set = (patch: Partial<DateValue>): void => {
    const next = { ...v, ...patch }
    setProperty(row.id, propId, next.start ? next : null)
  }
  return (
    <div className="date-editor">
      <input type="date" className="input wide" value={v.start} onChange={(e) => set({ start: e.target.value })} autoFocus />
      {hasEnd && <input type="date" className="input wide" value={v.end ?? ''} onChange={(e) => set({ end: e.target.value || undefined })} />}
      <label className="menu-item">
        <input
          type="checkbox"
          checked={hasEnd}
          onChange={(e) => {
            setHasEnd(e.target.checked)
            if (!e.target.checked) set({ end: undefined })
          }}
        />
        {t('endDate')}
      </label>
      <div className="row-gap">
        <button className="btn-ghost small" onClick={() => set({ start: new Date().toISOString().slice(0, 10) })}>{t('today')}</button>
        <button className="btn-ghost small" onClick={() => setProperty(row.id, propId, null)}>{t('clear')}</button>
      </div>
    </div>
  )
}

/** Displays and edits one property value. Used by table cells, board cards and page property rows. */
export function PropertyCell({
  row,
  propId,
  schema,
  coll,
  readOnly,
  variant = 'cell'
}: {
  row: Block
  propId: ID
  schema: PropertySchema
  coll: Collection
  readOnly?: boolean
  variant?: 'cell' | 'page' | 'card'
}): JSX.Element {
  const t = useT()
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [inlineEdit, setInlineEdit] = useState(false)
  const value = propertyValue(row, propId, schema, coll)
  const close = (): void => setAnchor(null)
  const open = (e: React.MouseEvent): void => {
    if (!readOnly) setAnchor(anchorOf(e.currentTarget))
  }
  const empty = <span className="prop-empty">{variant === 'page' ? t('empty') : ''}</span>

  switch (schema.type) {
    case 'title':
      if (inlineEdit) {
        return (
          <input
            autoFocus
            className="cell-input"
            defaultValue={plainText(row.properties.title)}
            onBlur={(e) => { setTitle(row.id, fromPlain(e.target.value)); setInlineEdit(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
          />
        )
      }
      return (
        <div className="cell-title" onClick={() => !readOnly && setInlineEdit(true)}>
          <span className="cell-title-icon">{row.format.page_icon ?? '📄'}</span>
          <span className="cell-title-text">{plainText(row.properties.title) || <span className="muted">{t('untitled')}</span>}</span>
          <button className="cell-open" onClick={(e) => { e.stopPropagation(); navigate(row.id, { newTab: e.ctrlKey || e.metaKey }) }}>
            {t('open')}
          </button>
        </div>
      )
    case 'checkbox':
      return (
        <div className="cell-check">
          <input type="checkbox" checked={!!value} disabled={readOnly} onChange={(e) => setProperty(row.id, propId, e.target.checked)} />
        </div>
      )
    case 'select':
    case 'status':
    case 'multi_select': {
      const ids: ID[] = schema.type === 'multi_select' ? (Array.isArray(value) ? (value as ID[]) : []) : value ? [value as ID] : []
      const opts = ids.map((id) => schema.options?.find((o) => o.id === id)).filter((o): o is SelectOption => !!o)
      return (
        <div className="cell-tags" onClick={open}>
          {opts.length ? opts.map((o) => <Tag key={o.id} option={o} />) : empty}
          {anchor && (
            <Popover anchor={anchor} onClose={close} width={280}>
              <SelectEditor row={row} propId={propId} schema={schema} coll={coll} />
            </Popover>
          )}
        </div>
      )
    }
    case 'date':
      return (
        <div className="cell-text" onClick={open}>
          {formatPropertyValue(row, propId, schema, coll) || empty}
          {anchor && (
            <Popover anchor={anchor} onClose={close} width={250}>
              <DateEditor row={row} propId={propId} />
            </Popover>
          )}
        </div>
      )
    case 'formula':
    case 'created_time':
    case 'last_edited_time':
      return <div className="cell-text readonly">{formatPropertyValue(row, propId, schema, coll) || empty}</div>
    default: {
      const text = schema.type === 'number' ? formatNumber(value as number, schema.number_format) : (value as string | undefined) ?? ''
      if (inlineEdit) {
        return (
          <input
            autoFocus
            className="cell-input"
            type={schema.type === 'number' ? 'number' : 'text'}
            defaultValue={schema.type === 'number' ? (value as number | undefined) ?? '' : text}
            onBlur={(e) => {
              const v = e.target.value
              setProperty(row.id, propId, schema.type === 'number' ? (v === '' ? null : Number(v)) : v)
              setInlineEdit(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
          />
        )
      }
      const link = schema.type === 'url' ? text : schema.type === 'email' ? `mailto:${text}` : schema.type === 'phone_number' ? `tel:${text}` : null
      return (
        <div className={`cell-text ${schema.type === 'number' ? 'num' : ''}`} onClick={() => !readOnly && setInlineEdit(true)}>
          {text ? (
            link ? (
              <a href={link} onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.noosion.openExternal(/^https?:/.test(link) || link.includes(':') ? link : `https://${link}`) }}>
                {text}
              </a>
            ) : (
              text
            )
          ) : (
            empty
          )}
        </div>
      )
    }
  }
}
