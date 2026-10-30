import { useState } from 'react'
import type { Block, ID, SelectOption } from '@shared/types'
import { db } from '../store/records'
import { addProperty, addRow, newId, randomColor, setProperty, updateSchema, updateView } from '../store/ops'
import { navigate, ui } from '../store/ui'
import { anchorOf, type Anchor } from '../components/Popover'
import { useT } from '../lib/i18n'
import { orderedProperties, propertyIcon, type DateValue } from '../lib/properties'
import { plainText } from '../lib/richtext'
import { PropertyCell, Tag } from './PropertyCell'
import { PropertyHeaderMenu, type ViewProps } from './DatabaseView'

const ROW_MIME = 'application/x-noosion-row'

function RowTitle({ row }: { row: Block }): JSX.Element {
  const t = useT()
  return (
    <span className="row-title">
      <span>{row.format.page_icon ?? '📄'}</span> {plainText(row.properties.title) || <span className="muted">{t('untitled')}</span>}
    </span>
  )
}

function visibleProps(props: ViewProps): ReturnType<typeof orderedProperties> {
  return orderedProperties(props.coll, props.view).filter((p) => p.visible && p.id !== 'title')
}

function NewRowButton({ onClick }: { onClick: () => void }): JSX.Element {
  const t = useT()
  return (
    <div className="db-new-row" onClick={onClick}>
      + {t('newRow')}
    </div>
  )
}

// ---------- Table ----------

export function TableView(props: ViewProps): JSX.Element {
  const { coll, view, rows, readOnly } = props
  const t = useT()
  const [header, setHeader] = useState<{ id: ID; anchor: Anchor } | null>(null)
  const cols = orderedProperties(coll, view).filter((p) => p.visible)

  const startResize = (e: React.MouseEvent, propId: ID, startW: number): void => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const th = (e.currentTarget as HTMLElement).parentElement!
    const move = (ev: MouseEvent): void => {
      th.style.width = `${Math.max(80, startW + ev.clientX - startX)}px`
    }
    const up = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      const width = Math.max(80, startW + ev.clientX - startX)
      const all = orderedProperties(coll, view)
      updateView(view.id, { format: { ...view.format, table_properties: all.map((p) => ({ property: p.id, visible: p.visible, width: p.id === propId ? width : p.width })) } })
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <div className="db-table-wrap">
      <table className={`db-table ${view.format.wrap ? 'wrap' : ''}`}>
        <thead>
          <tr>
            {cols.map((c) => {
              const w = c.width ?? (c.id === 'title' ? 280 : 180)
              return (
                <th key={c.id} style={{ width: w }} onClick={(e) => !readOnly && setHeader({ id: c.id, anchor: anchorOf(e.currentTarget) })}>
                  <span className="th-icon">{propertyIcon(c.schema.type)}</span> {c.schema.name}
                  <span className="col-resize" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => startResize(e, c.id, w)} />
                </th>
              )
            })}
            {!readOnly && (
              <th className="th-add" onClick={() => addProperty(coll.id, { name: t('property'), type: 'text' })}>+</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {cols.map((c) => (
                <td key={c.id}>
                  <PropertyCell row={r} propId={c.id} schema={c.schema} coll={coll} readOnly={readOnly} />
                </td>
              ))}
              {!readOnly && <td />}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && <NewRowButton onClick={() => addRow(coll.id)} />}
      <div className="db-footer">{t('count')} {rows.length}</div>
      {header && <PropertyHeaderMenu coll={coll} view={view} propId={header.id} anchor={header.anchor} onClose={() => setHeader(null)} />}
    </div>
  )
}

// ---------- Board ----------

export function BoardView(props: ViewProps): JSX.Element {
  const { coll, view, rows, readOnly } = props
  const t = useT()
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const groupable = Object.entries(coll.schema).filter(([, s]) => s.type === 'select' || s.type === 'status')
  const groupBy = view.format.board_columns_by && coll.schema[view.format.board_columns_by] ? view.format.board_columns_by : groupable[0]?.[0]
  if (!groupBy) {
    return (
      <div className="db-empty">
        <button className="btn-ghost" onClick={() => updateView(view.id, { format: { ...view.format, board_columns_by: addProperty(coll.id, { name: t('groupBy'), type: 'select', options: [] }) } })}>
          + {t('addProperty')} ({t('groupBy')})
        </button>
      </div>
    )
  }
  const schema = coll.schema[groupBy]!
  const groups: Array<{ id: string; option?: SelectOption }> = [{ id: '__none' }, ...(schema.options ?? []).map((o) => ({ id: o.id, option: o }))]
  const props2 = visibleProps(props)

  return (
    <div className="board">
      <div className="board-groupby">
        {t('groupBy')}:{' '}
        <select value={groupBy} onChange={(e) => updateView(view.id, { format: { ...view.format, board_columns_by: e.target.value } })}>
          {groupable.map(([id, s]) => (
            <option key={id} value={id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="board-columns">
        {groups.map((g) => {
          const items = rows.filter((r) => (g.id === '__none' ? !r.properties[groupBy] || !schema.options?.some((o) => o.id === r.properties[groupBy]) : r.properties[groupBy] === g.id))
          if (g.id === '__none' && !items.length) return null
          return (
            <div
              key={g.id}
              className={`board-column ${dragOver === g.id ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(ROW_MIME)) return
                e.preventDefault()
                setDragOver(g.id)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                const rid = e.dataTransfer.getData(ROW_MIME)
                setDragOver(null)
                if (rid) setProperty(rid, groupBy, g.id === '__none' ? null : g.id)
              }}
            >
              <div className="board-column-head">
                {g.option ? <Tag option={g.option} /> : <span className="muted">{t('noValue')}</span>}
                <span className="muted small">{items.length}</span>
              </div>
              {items.map((r) => (
                <div
                  key={r.id}
                  className="board-card"
                  draggable={!readOnly}
                  onDragStart={(e) => e.dataTransfer.setData(ROW_MIME, r.id)}
                  onClick={(e) => navigate(r.id, { newTab: e.ctrlKey || e.metaKey })}
                >
                  <div className="card-title"><RowTitle row={r} /></div>
                  {props2.map((p) => (
                    <div key={p.id} className="card-prop" onClick={(e) => e.stopPropagation()}>
                      <PropertyCell row={r} propId={p.id} schema={p.schema} coll={coll} readOnly={readOnly} variant="card" />
                    </div>
                  ))}
                </div>
              ))}
              {!readOnly && <NewRowButton onClick={() => addRow(coll.id, g.id === '__none' ? {} : { [groupBy]: g.id })} />}
            </div>
          )
        })}
        {!readOnly && (
          <div className="board-column add">
            {addingGroup ? (
              <input
                className="input wide"
                autoFocus
                placeholder={t('addGroup')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur()
                }}
                onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name) updateSchema(coll.id, groupBy, { options: [...(schema.options ?? []), { id: newId().slice(0, 8), value: name, color: randomColor() }] })
                  setAddingGroup(false)
                }}
              />
            ) : (
              <button className="btn-ghost" onClick={() => setAddingGroup(true)}>
                + {t('addGroup')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- List ----------

export function ListView(props: ViewProps): JSX.Element {
  const { coll, rows, readOnly } = props
  const props2 = visibleProps(props)
  return (
    <div className="db-list">
      {rows.map((r) => (
        <div key={r.id} className="db-list-row" onClick={(e) => navigate(r.id, { newTab: e.ctrlKey || e.metaKey })}>
          <RowTitle row={r} />
          <span className="spacer" />
          {props2.map((p) => (
            <span key={p.id} className="db-list-prop" onClick={(e) => e.stopPropagation()}>
              <PropertyCell row={r} propId={p.id} schema={p.schema} coll={coll} readOnly={readOnly} variant="card" />
            </span>
          ))}
        </div>
      ))}
      {!readOnly && <NewRowButton onClick={() => addRow(coll.id)} />}
    </div>
  )
}

// ---------- Gallery ----------

function coverOf(row: Block): string | undefined {
  if (row.format.page_cover) return row.format.page_cover
  for (const id of row.content) {
    const b = db.block(id)
    if (b?.alive && b.type === 'image' && b.properties.source) return b.properties.source
  }
  return undefined
}

export function GalleryView(props: ViewProps): JSX.Element {
  const { coll, rows, readOnly } = props
  const props2 = visibleProps(props)
  return (
    <div className="gallery">
      {rows.map((r) => {
        const cover = coverOf(r)
        return (
          <div key={r.id} className="gallery-card" onClick={(e) => navigate(r.id, { newTab: e.ctrlKey || e.metaKey })}>
            <div className="gallery-cover" style={cover ? { backgroundImage: cover.startsWith('linear') ? cover : `url("${cover}")` } : undefined}>
              {!cover && <span className="gallery-cover-text">{plainText(db.block(r.content[0])?.properties.title).slice(0, 120)}</span>}
            </div>
            <div className="gallery-body">
              <div className="card-title"><RowTitle row={r} /></div>
              {props2.map((p) => (
                <div key={p.id} className="card-prop" onClick={(e) => e.stopPropagation()}>
                  <PropertyCell row={r} propId={p.id} schema={p.schema} coll={coll} readOnly={readOnly} variant="card" />
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {!readOnly && (
        <div className="gallery-card add" onClick={() => addRow(coll.id)}>
          +
        </div>
      )}
    </div>
  )
}

// ---------- Calendar ----------

const pad = (n: number): string => String(n).padStart(2, '0')
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (s: string, n: number): string => {
  const d = new Date(`${s}T00:00:00`)
  d.setDate(d.getDate() + n)
  return iso(d)
}
const dayDiff = (a: string, b: string): number => Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 864e5)

function useDateProperty(props: ViewProps, key: 'calendar_by' | 'timeline_by'): ID | undefined {
  const { coll, view } = props
  const chosen = view.format[key]
  if (chosen && coll.schema[chosen]?.type === 'date') return chosen
  return Object.entries(coll.schema).find(([, s]) => s.type === 'date')?.[0]
}

function DatePropMissing({ props, keyName }: { props: ViewProps; keyName: 'calendar_by' | 'timeline_by' }): JSX.Element {
  const t = useT()
  return (
    <div className="db-empty">
      <button
        className="btn-ghost"
        onClick={() => {
          const id = addProperty(props.coll.id, { name: t('dateProperty'), type: 'date' })
          updateView(props.view.id, { format: { ...props.view.format, [keyName]: id } })
        }}
      >
        + {t('dateProperty')}
      </button>
    </div>
  )
}

export function CalendarView(props: ViewProps): JSX.Element {
  const { coll, rows, readOnly } = props
  const t = useT()
  const locale = ui.use((s) => s.settings.locale)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const prop = useDateProperty(props, 'calendar_by')
  if (!prop) return <DatePropMissing props={props} keyName="calendar_by" />

  const first = new Date(month)
  first.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first)
    d.setDate(first.getDate() + i)
    return iso(d)
  })
  const today = iso(new Date())
  const byDay = new Map<string, Block[]>()
  for (const r of rows) {
    const v = r.properties[prop] as DateValue | undefined
    if (!v?.start) continue
    const span = v.end ? Math.min(dayDiff(v.end, v.start), 62) : 0
    for (let i = 0; i <= span; i++) {
      const k = addDays(v.start, i)
      byDay.set(k, [...(byDay.get(k) ?? []), r])
    }
  }
  const weekdays = locale === 'ko' ? ['일', '월', '화', '수', '목', '금', '토'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const label = month.toLocaleDateString(locale === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long' })

  return (
    <div className="calendar">
      <div className="calendar-head">
        <strong>{label}</strong>
        <span className="spacer" />
        <select value={prop} onChange={(e) => updateView(props.view.id, { format: { ...props.view.format, calendar_by: e.target.value } })}>
          {Object.entries(coll.schema).filter(([, s]) => s.type === 'date').map(([id, s]) => (
            <option key={id} value={id}>{s.name}</option>
          ))}
        </select>
        <button className="btn-ghost small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <button className="btn-ghost small" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{t('today')}</button>
        <button className="btn-ghost small" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="calendar-grid">
        {weekdays.map((w) => (
          <div key={w} className="calendar-weekday">{w}</div>
        ))}
        {days.map((d) => (
          <div
            key={d}
            className={`calendar-day ${d.slice(0, 7) !== iso(month).slice(0, 7) ? 'other' : ''} ${d === today ? 'today' : ''}`}
            onDragOver={(e) => e.dataTransfer.types.includes(ROW_MIME) && e.preventDefault()}
            onDrop={(e) => {
              const rid = e.dataTransfer.getData(ROW_MIME)
              const row = db.block(rid)
              if (!row) return
              const v = row.properties[prop] as DateValue | undefined
              const len = v?.end ? dayDiff(v.end, v.start) : 0
              setProperty(rid, prop, len ? { start: d, end: addDays(d, len) } : { start: d })
            }}
          >
            <div className="calendar-day-head">
              <span>{Number(d.slice(8))}</span>
              {!readOnly && (
                <button className="calendar-add" onClick={() => navigate(addRow(coll.id, { [prop]: { start: d } }))}>+</button>
              )}
            </div>
            {(byDay.get(d) ?? []).map((r) => (
              <div key={r.id} className="calendar-item" draggable={!readOnly} onDragStart={(e) => e.dataTransfer.setData(ROW_MIME, r.id)} onClick={(e) => navigate(r.id, { newTab: e.ctrlKey || e.metaKey })}>
                <RowTitle row={r} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Timeline ----------

const DAY_W = 36

export function TimelineView(props: ViewProps): JSX.Element {
  const { coll, rows, readOnly } = props
  const t = useT()
  const [start, setStart] = useState(() => addDays(iso(new Date()), -7))
  const prop = useDateProperty(props, 'timeline_by')
  if (!prop) return <DatePropMissing props={props} keyName="timeline_by" />
  const total = 42
  const days = Array.from({ length: total }, (_, i) => addDays(start, i))
  const today = iso(new Date())

  const dragBar = (e: React.MouseEvent, row: Block, mode: 'move' | 'end'): void => {
    if (readOnly) return
    e.preventDefault()
    e.stopPropagation()
    const v = row.properties[prop] as DateValue
    const startX = e.clientX
    const bar = e.currentTarget.closest('.timeline-bar') as HTMLElement
    const origLeft = bar.offsetLeft
    const origWidth = bar.offsetWidth
    let delta = 0
    const move = (ev: MouseEvent): void => {
      delta = Math.round((ev.clientX - startX) / DAY_W)
      if (mode === 'move') bar.style.left = `${origLeft + delta * DAY_W}px`
      else bar.style.width = `${Math.max(DAY_W, origWidth + delta * DAY_W)}px`
    }
    const up = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      if (!delta) {
        if (mode === 'move') navigate(row.id)
        return
      }
      const end = v.end ?? v.start
      if (mode === 'move') setProperty(row.id, prop, { start: addDays(v.start, delta), end: v.end ? addDays(end, delta) : undefined })
      else {
        const newEnd = addDays(end, delta)
        setProperty(row.id, prop, dayDiff(newEnd, v.start) > 0 ? { start: v.start, end: newEnd } : { start: v.start })
      }
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <div className="timeline">
      <div className="calendar-head">
        <span className="spacer" />
        <button className="btn-ghost small" onClick={() => setStart(addDays(start, -14))}>‹</button>
        <button className="btn-ghost small" onClick={() => setStart(addDays(today, -7))}>{t('today')}</button>
        <button className="btn-ghost small" onClick={() => setStart(addDays(start, 14))}>›</button>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-inner" style={{ width: total * DAY_W }}>
          <div className="timeline-days">
            {days.map((d) => (
              <div key={d} className={`timeline-day ${d === today ? 'today' : ''} ${d.endsWith('-01') ? 'month-start' : ''}`} style={{ width: DAY_W }}>
                {d.endsWith('-01') || d === start ? <span className="timeline-month">{d.slice(0, 7)}</span> : null}
                {Number(d.slice(8))}
              </div>
            ))}
          </div>
          {rows.map((r) => {
            const v = r.properties[prop] as DateValue | undefined
            if (!v?.start) {
              return (
                <div key={r.id} className="timeline-row">
                  <button className="timeline-unscheduled" disabled={readOnly} onClick={() => setProperty(r.id, prop, { start: today })}>
                    <RowTitle row={r} />
                  </button>
                </div>
              )
            }
            const offset = dayDiff(v.start, start)
            const len = (v.end ? dayDiff(v.end, v.start) : 0) + 1
            return (
              <div key={r.id} className="timeline-row">
                <div className="timeline-bar" style={{ left: offset * DAY_W, width: len * DAY_W - 4 }} onMouseDown={(e) => dragBar(e, r, 'move')}>
                  <RowTitle row={r} />
                  <span className="timeline-bar-end" onMouseDown={(e) => dragBar(e, r, 'end')} />
                </div>
              </div>
            )
          })}
          {days.indexOf(today) >= 0 && <div className="timeline-today" style={{ left: days.indexOf(today) * DAY_W + DAY_W / 2 }} />}
        </div>
      </div>
      {!readOnly && <NewRowButton onClick={() => addRow(coll.id, { [prop]: { start: today } })} />}
    </div>
  )
}
