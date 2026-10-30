import { useState } from 'react'
import type { Collection, CollectionView, FilterOperator, ID, PropertySchema, PropertyType, ViewFilter, ViewSort, ViewType } from '@shared/types'
import { db, useBlock, useCollection, useDbVersion } from '../store/records'
import { addProperty, addRow, addView, collectionRows, removeView, updateCollection, updateSchema, updateView } from '../store/ops'
import { navigate, ui } from '../store/ui'
import { Editable } from '../editor/Editable'
import { anchorOf, Menu, MenuPopover, Popover, type Anchor, type MenuItem } from '../components/Popover'
import { useT } from '../lib/i18n'
import { orderedProperties, PROPERTY_TYPES, propertyIcon, queryRows } from '../lib/properties'
import { BoardView, CalendarView, GalleryView, ListView, TableView, TimelineView } from './Views'

const VIEW_TYPES: Array<{ type: ViewType; icon: string; ko: string; en: string }> = [
  { type: 'table', icon: '▦', ko: '표', en: 'Table' },
  { type: 'board', icon: '▥', ko: '보드', en: 'Board' },
  { type: 'list', icon: '☰', ko: '리스트', en: 'List' },
  { type: 'gallery', icon: '▩', ko: '갤러리', en: 'Gallery' },
  { type: 'calendar', icon: '📅', ko: '캘린더', en: 'Calendar' },
  { type: 'timeline', icon: '⟿', ko: '타임라인', en: 'Timeline' }
]

const activeViews = new Map<ID, ID>()

export interface ViewProps {
  blockId: ID
  coll: Collection
  view: CollectionView
  rows: ReturnType<typeof collectionRows>
  readOnly?: boolean
}

export function DatabaseView({ blockId, inline }: { blockId: ID; inline: boolean }): JSX.Element | null {
  useDbVersion()
  const t = useT()
  const locale = ui.use((s) => s.settings.locale)
  const b = useBlock(blockId)
  const coll = useCollection(b?.collection_id)
  const [, force] = useState(0)
  const [menu, setMenu] = useState<{ kind: 'addView' | 'view' | 'filter' | 'sort' | 'props'; anchor: Anchor; viewId?: ID } | null>(null)
  const [search, setSearch] = useState<string | null>(null)
  if (!b || !coll) return null
  const views = (b.view_ids ?? []).map((v) => db.get('collection_view', v)).filter((v): v is CollectionView => !!v?.alive)
  if (!views.length) return null
  const activeId = activeViews.get(blockId)
  const view = views.find((v) => v.id === activeId) ?? views[0]!
  const rows = queryRows(collectionRows(coll.id), view, coll, search ?? '')
  const readOnly = !!b.format.block_locked
  const setActive = (id: ID): void => {
    activeViews.set(blockId, id)
    force((x) => x + 1)
  }
  const filters = view.query2.filter ?? []
  const sorts = view.query2.sort ?? []

  return (
    <div className={`database ${inline ? 'inline' : 'full'}`} contentEditable={false}>
      {inline && (
        <div className="db-title-row">
          <Editable
            focusId={`dbtitle:${coll.id}`}
            className="db-title"
            value={coll.name}
            placeholder={t('untitled')}
            placeholderAlways
            onChange={(rt) => updateCollection(coll.id, { name: rt })}
          />
          <button className="btn-ghost small" title={t('open')} onClick={() => navigate(blockId)}>↗</button>
        </div>
      )}
      <div className="db-toolbar">
        <div className="db-views">
          {views.map((v) => (
            <button
              key={v.id}
              className={`db-view-tab ${v.id === view.id ? 'active' : ''}`}
              onClick={(e) => (v.id === view.id ? setMenu({ kind: 'view', anchor: anchorOf(e.currentTarget), viewId: v.id }) : setActive(v.id))}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ kind: 'view', anchor: anchorOf(e.currentTarget), viewId: v.id }) }}
            >
              {VIEW_TYPES.find((x) => x.type === v.type)?.icon} {v.name}
            </button>
          ))}
          <button className="btn-ghost small" title={t('addView')} onClick={(e) => setMenu({ kind: 'addView', anchor: anchorOf(e.currentTarget) })}>+</button>
        </div>
        <div className="db-actions">
          <button className={`btn-ghost small ${filters.length ? 'accent' : ''}`} onClick={(e) => setMenu({ kind: 'filter', anchor: anchorOf(e.currentTarget) })}>
            {t('filter')}{filters.length ? ` ${filters.length}` : ''}
          </button>
          <button className={`btn-ghost small ${sorts.length ? 'accent' : ''}`} onClick={(e) => setMenu({ kind: 'sort', anchor: anchorOf(e.currentTarget) })}>
            {t('sort')}{sorts.length ? ` ${sorts.length}` : ''}
          </button>
          <button className="btn-ghost small" onClick={(e) => setMenu({ kind: 'props', anchor: anchorOf(e.currentTarget) })}>{t('property')}</button>
          {search === null ? (
            <button className="btn-ghost small" onClick={() => setSearch('')}>🔍</button>
          ) : (
            <input className="db-search" autoFocus placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => !search && setSearch(null)} />
          )}
          {!readOnly && (
            <button className="btn-primary small" onClick={() => navigate(addRow(coll.id))}>{t('newRow')}</button>
          )}
        </div>
      </div>

      {view.type === 'table' && <TableView blockId={blockId} coll={coll} view={view} rows={rows} readOnly={readOnly} />}
      {view.type === 'board' && <BoardView blockId={blockId} coll={coll} view={view} rows={rows} readOnly={readOnly} />}
      {view.type === 'list' && <ListView blockId={blockId} coll={coll} view={view} rows={rows} readOnly={readOnly} />}
      {view.type === 'gallery' && <GalleryView blockId={blockId} coll={coll} view={view} rows={rows} readOnly={readOnly} />}
      {view.type === 'calendar' && <CalendarView blockId={blockId} coll={coll} view={view} rows={rows} readOnly={readOnly} />}
      {view.type === 'timeline' && <TimelineView blockId={blockId} coll={coll} view={view} rows={rows} readOnly={readOnly} />}

      {menu?.kind === 'addView' && (
        <MenuPopover
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
          items={VIEW_TYPES.map((vt) => ({
            label: locale === 'ko' ? vt.ko : vt.en,
            icon: vt.icon,
            onClick: () => setActive(addView(blockId, vt.type, locale === 'ko' ? vt.ko : vt.en))
          }))}
        />
      )}
      {menu?.kind === 'view' && menu.viewId && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={240}>
          <div className="menu">
            <input
              className="input wide"
              defaultValue={db.get('collection_view', menu.viewId)?.name}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              onBlur={(e) => e.target.value && updateView(menu.viewId!, { name: e.target.value })}
            />
            <Menu
              onClose={() => setMenu(null)}
              items={[
                ...VIEW_TYPES.map((vt) => ({
                  label: locale === 'ko' ? vt.ko : vt.en,
                  icon: vt.icon,
                  checked: db.get('collection_view', menu.viewId!)?.type === vt.type,
                  onClick: () => updateView(menu.viewId!, { type: vt.type })
                })),
                { separator: true, label: '' },
                { label: t('wrapCells'), checked: !!view.format.wrap, onClick: () => updateView(view.id, { format: { ...view.format, wrap: !view.format.wrap } }) },
                { label: t('deleteView'), icon: '🗑', danger: true, disabled: views.length <= 1, onClick: () => removeView(blockId, menu.viewId!) }
              ]}
            />
          </div>
        </Popover>
      )}
      {menu?.kind === 'filter' && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={460}>
          <FilterEditor coll={coll} view={view} />
        </Popover>
      )}
      {menu?.kind === 'sort' && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={360}>
          <SortEditor coll={coll} view={view} />
        </Popover>
      )}
      {menu?.kind === 'props' && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={260}>
          <PropertiesEditor coll={coll} view={view} />
        </Popover>
      )}
    </div>
  )
}

const OPERATORS: Array<{ op: FilterOperator; ko: string; en: string; types?: PropertyType[]; noValue?: boolean }> = [
  { op: 'contains', ko: '포함', en: 'contains' },
  { op: 'does_not_contain', ko: '포함하지 않음', en: 'does not contain' },
  { op: 'is', ko: '같음', en: 'is' },
  { op: 'is_not', ko: '같지 않음', en: 'is not' },
  { op: 'gt', ko: '보다 큼/이후', en: '> / after', types: ['number', 'date', 'created_time', 'last_edited_time'] },
  { op: 'lt', ko: '보다 작음/이전', en: '< / before', types: ['number', 'date', 'created_time', 'last_edited_time'] },
  { op: 'checked', ko: '체크됨', en: 'is checked', types: ['checkbox'], noValue: true },
  { op: 'unchecked', ko: '체크 안 됨', en: 'is unchecked', types: ['checkbox'], noValue: true },
  { op: 'is_empty', ko: '비어 있음', en: 'is empty', noValue: true },
  { op: 'is_not_empty', ko: '비어 있지 않음', en: 'is not empty', noValue: true }
]

function FilterEditor({ coll, view }: { coll: Collection; view: CollectionView }): JSX.Element {
  const t = useT()
  const locale = ui.use((s) => s.settings.locale)
  const filters = view.query2.filter ?? []
  const set = (next: ViewFilter[], op = view.query2.filter_operator): void =>
    updateView(view.id, { query2: { ...view.query2, filter: next, filter_operator: op } })
  return (
    <div className="menu filter-editor">
      {filters.map((f, i) => {
        const schema = coll.schema[f.property]
        const ops = OPERATORS.filter((o) => !o.types || (schema && o.types.includes(schema.type)))
        return (
          <div key={i} className="filter-row">
            {i === 0 ? (
              <span className="filter-join">{t('where')}</span>
            ) : (
              <select className="filter-join" value={view.query2.filter_operator ?? 'and'} disabled={i > 1} onChange={(e) => set(filters, e.target.value as 'and' | 'or')}>
                <option value="and">{t('and')}</option>
                <option value="or">{t('or')}</option>
              </select>
            )}
            <select value={f.property} onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)))}>
              {Object.entries(coll.schema).map(([id, s]) => (
                <option key={id} value={id}>{s.name}</option>
              ))}
            </select>
            <select value={f.operator} onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, operator: e.target.value as FilterOperator } : x)))}>
              {ops.map((o) => (
                <option key={o.op} value={o.op}>{locale === 'ko' ? o.ko : o.en}</option>
              ))}
            </select>
            {!OPERATORS.find((o) => o.op === f.operator)?.noValue && (
              <input
                className="input"
                type={schema?.type === 'date' ? 'date' : schema?.type === 'number' ? 'number' : 'text'}
                value={f.value ?? ''}
                onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
              />
            )}
            <button className="btn-ghost small" onClick={() => set(filters.filter((_, j) => j !== i))}>×</button>
          </div>
        )
      })}
      <div className="menu-item" onClick={() => set([...filters, { property: 'title', operator: 'contains', value: '' }])}>+ {t('addFilter')}</div>
    </div>
  )
}

function SortEditor({ coll, view }: { coll: Collection; view: CollectionView }): JSX.Element {
  const t = useT()
  const sorts = view.query2.sort ?? []
  const set = (next: ViewSort[]): void => updateView(view.id, { query2: { ...view.query2, sort: next } })
  return (
    <div className="menu">
      {sorts.map((s, i) => (
        <div key={i} className="filter-row">
          <select value={s.property} onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)))}>
            {Object.entries(coll.schema).map(([id, sc]) => (
              <option key={id} value={id}>{sc.name}</option>
            ))}
          </select>
          <select value={s.direction} onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, direction: e.target.value as ViewSort['direction'] } : x)))}>
            <option value="ascending">{t('ascending')}</option>
            <option value="descending">{t('descending')}</option>
          </select>
          <button className="btn-ghost small" onClick={() => set(sorts.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="menu-item" onClick={() => set([...sorts, { property: 'title', direction: 'ascending' }])}>+ {t('addSort')}</div>
    </div>
  )
}

function PropertiesEditor({ coll, view }: { coll: Collection; view: CollectionView }): JSX.Element {
  const t = useT()
  const props = orderedProperties(coll, view)
  const toggle = (id: ID): void => {
    updateView(view.id, {
      format: { ...view.format, table_properties: props.map((p) => ({ property: p.id, visible: p.id === id ? !p.visible : p.visible, width: p.width })) }
    })
  }
  return (
    <div className="menu">
      {props.map((p) => (
        <label key={p.id} className="menu-item">
          <span className="menu-icon">{propertyIcon(p.schema.type)}</span>
          <span className="menu-label">{p.schema.name}</span>
          <input type="checkbox" checked={p.visible} disabled={p.id === 'title'} onChange={() => toggle(p.id)} />
        </label>
      ))}
      <div className="menu-sep" />
      <div className="menu-item" onClick={() => addProperty(coll.id, { name: t('property'), type: 'text' })}>+ {t('addProperty')}</div>
    </div>
  )
}

/** Header menu for a property column: rename, change type, formula, sort, hide, delete. */
export function PropertyHeaderMenu({ coll, view, propId, onClose, anchor }: { coll: Collection; view: CollectionView; propId: ID; onClose: () => void; anchor: Anchor }): JSX.Element {
  const t = useT()
  const locale = ui.use((s) => s.settings.locale)
  const schema = coll.schema[propId]!
  const isTitle = propId === 'title'
  const items: MenuItem[] = [
    {
      label: t('type'),
      icon: propertyIcon(schema.type),
      disabled: isTitle,
      submenu: PROPERTY_TYPES.map((pt) => ({
        label: locale === 'ko' ? pt.ko : pt.en,
        icon: pt.icon,
        checked: schema.type === pt.type,
        onClick: () => updateSchema(coll.id, propId, { type: pt.type, options: schema.options ?? (['select', 'multi_select', 'status'].includes(pt.type) ? [] : undefined) })
      }))
    },
    { label: t('ascending'), icon: '↑', onClick: () => updateView(view.id, { query2: { ...view.query2, sort: [{ property: propId, direction: 'ascending' }] } }) },
    { label: t('descending'), icon: '↓', onClick: () => updateView(view.id, { query2: { ...view.query2, sort: [{ property: propId, direction: 'descending' }] } }) },
    { label: t('filter'), icon: '⏷', onClick: () => updateView(view.id, { query2: { ...view.query2, filter: [...(view.query2.filter ?? []), { property: propId, operator: 'contains', value: '' }] } }) },
    {
      label: t('hide'),
      icon: '👁',
      disabled: isTitle,
      onClick: () => {
        const props = orderedProperties(coll, view)
        updateView(view.id, { format: { ...view.format, table_properties: props.map((p) => ({ property: p.id, visible: p.id === propId ? false : p.visible, width: p.width })) } })
      }
    },
    { label: t('deleteProperty'), icon: '🗑', danger: true, disabled: isTitle, onClick: () => updateSchema(coll.id, propId, null) }
  ]
  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div className="menu">
        <input
          className="input wide"
          autoFocus
          defaultValue={schema.name}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onBlur={(e) => e.target.value && e.target.value !== schema.name && updateSchema(coll.id, propId, { name: e.target.value })}
        />
        {schema.type === 'formula' && (
          <>
            <div className="menu-title">{t('editFormula')}</div>
            <textarea
              className="input wide formula-input"
              defaultValue={schema.formula ?? ''}
              placeholder={'prop("Price") * 2'}
              onBlur={(e) => updateSchema(coll.id, propId, { formula: e.target.value })}
            />
          </>
        )}
        {schema.type === 'number' && (
          <select className="input wide" value={schema.number_format ?? 'number'} onChange={(e) => updateSchema(coll.id, propId, { number_format: e.target.value as PropertySchema['number_format'] })}>
            <option value="number">123</option>
            <option value="comma">1,234</option>
            <option value="percent">%</option>
            <option value="won">₩</option>
            <option value="dollar">$</option>
          </select>
        )}
        <Menu items={items} onClose={onClose} />
      </div>
    </Popover>
  )
}
