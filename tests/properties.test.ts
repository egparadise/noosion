import { describe, expect, it } from 'vitest'
import { evaluateFormula, formatNumber, matchesFilter, queryRows } from '../src/renderer/src/lib/properties'
import type { Block, Collection, CollectionView } from '../src/shared/types'

const coll: Collection = {
  id: 'c1',
  space_id: 's',
  version: 1,
  name: [['Tasks']],
  parent_id: 'b',
  parent_table: 'block',
  alive: true,
  schema: {
    title: { name: 'Name', type: 'title' },
    pts: { name: 'Points', type: 'number' },
    done: { name: 'Done', type: 'checkbox' },
    st: {
      name: 'Status',
      type: 'status',
      options: [
        { id: 'o1', value: 'Todo', color: 'gray' },
        { id: 'o2', value: 'Doing', color: 'blue' },
        { id: 'o3', value: 'Done', color: 'green' }
      ]
    }
  }
}

function row(id: string, title: string, props: Record<string, unknown>): Block {
  return {
    id,
    type: 'page',
    space_id: 's',
    version: 1,
    properties: { title: [[title]], ...props },
    content: [],
    format: {},
    parent_id: 'c1',
    parent_table: 'collection',
    alive: true,
    created_time: 0,
    last_edited_time: 0
  }
}

const rows = [row('r1', 'Write spec', { pts: 3, st: 'o2' }), row('r2', 'Ship', { pts: 8, done: true, st: 'o3' }), row('r3', 'Plan', { st: 'o1' })]

function view(query2: CollectionView['query2']): CollectionView {
  return { id: 'v', space_id: 's', version: 1, type: 'table', name: 'T', parent_id: 'b', alive: true, format: {}, query2 }
}

describe('formula', () => {
  it('evaluates arithmetic and precedence', () => {
    expect(evaluateFormula('1 + 2 * 3', rows[0]!, coll)).toBe(7)
    expect(evaluateFormula('(1 + 2) * 3', rows[0]!, coll)).toBe(9)
    expect(evaluateFormula('round(10 / 3, 2)', rows[0]!, coll)).toBe(3.33)
  })

  it('reads properties', () => {
    expect(evaluateFormula('prop("Points") * 2', rows[1]!, coll)).toBe(16)
    expect(evaluateFormula('if(prop("Done"), "✓", "…")', rows[1]!, coll)).toBe('✓')
    expect(evaluateFormula('concat(prop("Name"), " / ", prop("Status"))', rows[0]!, coll)).toBe('Write spec / Doing')
    expect(evaluateFormula('prop("Points") > 5 ? "big" : "small"', rows[0]!, coll)).toBe('small')
  })

  it('reports errors instead of throwing', () => {
    expect(String(evaluateFormula('prop("Nope")', rows[0]!, coll))).toMatch(/^⚠/)
    expect(String(evaluateFormula('foo(1)', rows[0]!, coll))).toMatch(/^⚠/)
    expect(String(evaluateFormula('1 +', rows[0]!, coll))).toMatch(/^⚠/)
  })
})

describe('filters & sorts', () => {
  it('filters by status and checkbox', () => {
    expect(matchesFilter(rows[0]!, { property: 'st', operator: 'is', value: 'doing' }, coll)).toBe(true)
    expect(matchesFilter(rows[2]!, { property: 'done', operator: 'unchecked' }, coll)).toBe(true)
    expect(matchesFilter(rows[2]!, { property: 'pts', operator: 'is_empty' }, coll)).toBe(true)
  })

  it('queries with and/or, sort and search', () => {
    const and = queryRows(rows, view({ filter: [{ property: 'pts', operator: 'gt', value: '1' }], sort: [{ property: 'pts', direction: 'descending' }] }), coll)
    expect(and.map((r) => r.id)).toEqual(['r2', 'r1'])
    const or = queryRows(rows, view({ filter_operator: 'or', filter: [{ property: 'st', operator: 'is', value: 'todo' }, { property: 'done', operator: 'checked' }] }), coll)
    expect(or.map((r) => r.id).sort()).toEqual(['r2', 'r3'])
    expect(queryRows(rows, view({}), coll, 'ship').map((r) => r.id)).toEqual(['r2'])
  })

  it('formats numbers', () => {
    expect(formatNumber(1234.5, 'comma')).toMatch(/1,234\.5/)
    expect(formatNumber(0.25, 'percent')).toMatch(/25/)
  })
})
