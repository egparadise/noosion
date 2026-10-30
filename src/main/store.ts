import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  type PersistedData,
  type RecordMap,
  type RecordWrite,
  type SessionState,
  type Settings
} from '@shared/types'

const SCHEMA_VERSION = 1
const SAVE_DELAY_MS = 400

function emptyRecords(): RecordMap {
  return { block: {}, collection: {}, collection_view: {}, space: {} }
}

/**
 * Local-first record store. Plays the role of Notion's "Sqlite Server" utility process:
 * the main process owns the canonical copy, renderers submit transactions, and writes are
 * flushed atomically (write temp file + rename) with a rotating backup taken at startup.
 */
export class RecordStore {
  readonly dir = app.getPath('userData')
  readonly file = join(this.dir, 'noosion-data.json')
  readonly filesDir = join(this.dir, 'files')
  private data: PersistedData
  private saveTimer: NodeJS.Timeout | null = null

  constructor() {
    mkdirSync(this.filesDir, { recursive: true })
    this.data = this.load()
  }

  private load(): PersistedData {
    const fallback: PersistedData = {
      schemaVersion: SCHEMA_VERSION,
      records: emptyRecords(),
      settings: { ...DEFAULT_SETTINGS },
      session: null
    }
    for (const candidate of [this.file, this.file + '.bak']) {
      if (!existsSync(candidate)) continue
      try {
        const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as PersistedData
        if (candidate === this.file) copyFileSync(this.file, this.file + '.bak')
        return {
          schemaVersion: SCHEMA_VERSION,
          records: { ...emptyRecords(), ...parsed.records },
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          session: parsed.session ?? null
        }
      } catch (err) {
        console.error(`[store] failed to read ${candidate}`, err)
      }
    }
    return fallback
  }

  snapshot(): PersistedData {
    return this.data
  }

  get settings(): Settings {
    return this.data.settings
  }

  applyWrites(writes: RecordWrite[]): void {
    for (const w of writes) {
      const table = this.data.records[w.table] as Record<string, unknown>
      if (w.value === null) delete table[w.id]
      else table[w.id] = w.value
    }
    this.scheduleSave()
  }

  replaceRecords(records: RecordMap): void {
    this.data.records = { ...emptyRecords(), ...records }
    this.flush()
  }

  setSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.scheduleSave()
    return this.data.settings
  }

  setSession(session: SessionState): void {
    this.data.session = session
    this.scheduleSave()
  }

  scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS)
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(this.data))
    renameSync(tmp, this.file)
  }

  /** Help ▸ Reset & Erase All Local Data */
  eraseAll(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    for (const f of [this.file, this.file + '.bak', this.file + '.tmp']) rmSync(f, { force: true })
    rmSync(this.filesDir, { recursive: true, force: true })
  }
}
