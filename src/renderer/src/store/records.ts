import { useSyncExternalStore } from 'react'
import type { AnyRecord, Block, Collection, CollectionView, ID, RecordMap, RecordWrite, Space, TableName } from '@shared/types'

type Key = `${TableName}:${ID}`

interface UndoEntry {
  before: Map<Key, AnyRecord | null>
  after: Map<Key, AnyRecord | null>
  mergeKey?: string
  time: number
  focus?: ID
}

export interface Tx {
  get<T extends TableName>(table: T, id: ID): RecordMap[T][ID] | undefined
  set<T extends TableName>(table: T, record: RecordMap[T][ID]): void
  update<T extends TableName>(table: T, id: ID, patch: Partial<RecordMap[T][ID]>): void
  remove(table: TableName, id: ID): void
}

export interface TransactOptions {
  /** Consecutive transactions with the same key within MERGE_WINDOW_MS collapse into one undo step. */
  mergeKey?: string
  skipUndo?: boolean
  focus?: ID
}

const MERGE_WINDOW_MS = 1200
const UNDO_LIMIT = 300

/**
 * Renderer-side record cache with optimistic transactions, analogous to Notion's RecordStore +
 * TransactionQueue: writes are applied locally first, batched, and submitted to the main process.
 */
class RecordCache {
  records: RecordMap = { block: {}, collection: {}, collection_view: {}, space: {} }
  version = 0
  private listeners = new Set<() => void>()
  private undoStack: UndoEntry[] = []
  private redoStack: UndoEntry[] = []
  private outbox = new Map<Key, RecordWrite>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private derivedCache = new Map<string, { version: number; value: unknown }>()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    this.version++
    for (const fn of this.listeners) fn()
  }

  hydrate(records: RecordMap): void {
    this.records = { ...records, block: records.block ?? {}, collection: records.collection ?? {}, collection_view: records.collection_view ?? {}, space: records.space ?? {} }
    this.emit()
  }

  get<T extends TableName>(table: T, id: ID | undefined): RecordMap[T][ID] | undefined {
    if (!id) return undefined
    return this.records[table][id] as RecordMap[T][ID] | undefined
  }

  block(id: ID | undefined): Block | undefined {
    return this.get('block', id)
  }

  private rawSet(key: Key, value: AnyRecord | null): void {
    const [table, id] = key.split(/:(.+)/) as [TableName, ID]
    const t = this.records[table] as Record<ID, AnyRecord>
    // Copy-on-write table objects so selectors on whole tables notice changes.
    const next = { ...t }
    if (value === null) delete next[id]
    else next[id] = value
    ;(this.records as unknown as Record<TableName, Record<ID, AnyRecord>>)[table] = next
    this.outbox.set(key, { table, id, value })
  }

  transact(fn: (tx: Tx) => void, opts: TransactOptions = {}): void {
    const before = new Map<Key, AnyRecord | null>()
    const after = new Map<Key, AnyRecord | null>()
    const now = Date.now()
    const track = (key: Key, value: AnyRecord | null): void => {
      if (!before.has(key)) {
        const [table, id] = key.split(/:(.+)/) as [TableName, ID]
        before.set(key, (this.records[table][id] as AnyRecord | undefined) ?? null)
      }
      after.set(key, value)
      this.rawSet(key, value)
    }
    const tx: Tx = {
      get: (table, id) => this.records[table][id] as never,
      set: (table, record) => track(`${table}:${(record as AnyRecord).id}`, record as AnyRecord),
      update: (table, id, patch) => {
        const cur = this.records[table][id] as AnyRecord | undefined
        if (!cur) return
        const next = { ...cur, ...patch, version: (cur.version ?? 0) + 1 } as AnyRecord
        if (table === 'block') (next as Block).last_edited_time = now
        track(`${table}:${id}`, next)
      },
      remove: (table, id) => track(`${table}:${id}`, null)
    }
    fn(tx)
    if (after.size === 0) return
    if (!opts.skipUndo) {
      const last = this.undoStack[this.undoStack.length - 1]
      if (last && opts.mergeKey && last.mergeKey === opts.mergeKey && now - last.time < MERGE_WINDOW_MS) {
        for (const [k, v] of before) if (!last.before.has(k)) last.before.set(k, v)
        for (const [k, v] of after) last.after.set(k, v)
        last.time = now
      } else {
        this.undoStack.push({ before, after, mergeKey: opts.mergeKey, time: now, focus: opts.focus })
        if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
      }
      this.redoStack = []
    }
    this.scheduleFlush()
    this.emit()
  }

  private applyEntry(values: Map<Key, AnyRecord | null>): void {
    for (const [k, v] of values) this.rawSet(k, v)
    this.scheduleFlush()
    this.emit()
  }

  undo(): ID | undefined {
    const entry = this.undoStack.pop()
    if (!entry) return
    this.applyEntry(entry.before)
    this.redoStack.push(entry)
    return entry.focus
  }

  redo(): ID | undefined {
    const entry = this.redoStack.pop()
    if (!entry) return
    this.applyEntry(entry.after)
    this.undoStack.push(entry)
    return entry.focus
  }

  /** Writes from another window: apply without touching undo history or echoing back. */
  applyRemote(writes: RecordWrite[]): void {
    for (const w of writes) {
      const t = { ...(this.records[w.table] as Record<ID, AnyRecord>) }
      if (w.value === null) delete t[w.id]
      else t[w.id] = w.value
      ;(this.records as unknown as Record<TableName, Record<ID, AnyRecord>>)[w.table] = t
    }
    this.emit()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.flush(), 60)
  }

  flush(): void {
    this.flushTimer = null
    if (!this.outbox.size) return
    const writes = [...this.outbox.values()]
    this.outbox.clear()
    window.noosion?.transact(writes).catch((err) => console.error('[transact] failed', err))
  }

  /** Memoize a derived value until the next record change. */
  derived<T>(key: string, compute: () => T): T {
    const hit = this.derivedCache.get(key)
    if (hit && hit.version === this.version) return hit.value as T
    const value = compute()
    this.derivedCache.set(key, { version: this.version, value })
    return value
  }
}

export const db = new RecordCache()
// Expose for debugging in DevTools.
if (typeof window !== 'undefined') (window as unknown as { __noosionDb: RecordCache }).__noosionDb = db

export function useRecord<T extends TableName>(table: T, id: ID | undefined): RecordMap[T][ID] | undefined {
  return useSyncExternalStore(db.subscribe, () => (id ? (db.records[table][id] as RecordMap[T][ID]) : undefined))
}

export const useBlock = (id: ID | undefined): Block | undefined => useRecord('block', id)
export const useCollection = (id: ID | undefined): Collection | undefined => useRecord('collection', id)
export const useView = (id: ID | undefined): CollectionView | undefined => useRecord('collection_view', id)

/** Re-render on any record change; use with db.derived() for computed lists. */
export function useDbVersion(): number {
  return useSyncExternalStore(db.subscribe, () => db.version)
}

export function useSpace(): Space | undefined {
  return useSyncExternalStore(db.subscribe, () => Object.values(db.records.space)[0])
}
