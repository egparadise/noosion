// Record model mirroring the Notion local cache schema (block / collection / collection_view / space).
// See docs/ANALYSIS.md §6 for the source of these shapes.

export type ID = string

/** Rich text decoration: ["b"], ["i"], ["_"], ["s"], ["c"], ["a", url], ["h", color] */
export type Decoration = [string] | [string, string]
export type RichText = Array<[string] | [string, Decoration[]]>

export type BlockType =
  | 'page'
  | 'text'
  | 'header'
  | 'sub_header'
  | 'sub_sub_header'
  | 'bulleted_list'
  | 'numbered_list'
  | 'to_do'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'code'
  | 'image'
  | 'bookmark'
  | 'equation'
  | 'column_list'
  | 'column'
  | 'table'
  | 'table_row'
  | 'collection_view'
  | 'collection_view_page'

export type ParentTable = 'block' | 'space' | 'collection'

export interface BlockFormat {
  block_color?: string
  page_icon?: string
  page_cover?: string
  page_cover_position?: number
  page_full_width?: boolean
  page_small_text?: boolean
  page_font?: 'default' | 'serif' | 'mono'
  block_locked?: boolean
  toggle_open?: boolean
  code_language?: string
  code_wrap?: boolean
  callout_icon?: string
  column_ratio?: number
  block_width?: number
  table_block_column_order?: ID[]
  table_block_column_header?: boolean
  bookmark_title?: string
  bookmark_description?: string
}

export interface Block {
  id: ID
  type: BlockType
  space_id: ID
  version: number
  properties: { title?: RichText; checked?: boolean; source?: string; caption?: RichText; [key: string]: unknown }
  content: ID[]
  format: BlockFormat
  parent_id: ID
  parent_table: ParentTable
  alive: boolean
  created_time: number
  last_edited_time: number
  collection_id?: ID
  view_ids?: ID[]
  moved_to_trash_time?: number
  is_template?: boolean
}

export type PropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'status'
  | 'date'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone_number'
  | 'person'
  | 'formula'
  | 'created_time'
  | 'last_edited_time'

export interface SelectOption {
  id: ID
  value: string
  color: string
}

export interface PropertySchema {
  name: string
  type: PropertyType
  options?: SelectOption[]
  number_format?: 'number' | 'comma' | 'percent' | 'won' | 'dollar'
  formula?: string
}

export interface Collection {
  id: ID
  space_id: ID
  version: number
  name: RichText
  icon?: string
  schema: Record<ID, PropertySchema>
  parent_id: ID
  parent_table: 'block'
  alive: boolean
}

export type ViewType = 'table' | 'board' | 'list' | 'gallery' | 'calendar' | 'timeline'

export type FilterOperator =
  | 'contains'
  | 'does_not_contain'
  | 'is'
  | 'is_not'
  | 'is_empty'
  | 'is_not_empty'
  | 'gt'
  | 'lt'
  | 'checked'
  | 'unchecked'

export interface ViewFilter {
  property: ID
  operator: FilterOperator
  value?: string
}

export interface ViewSort {
  property: ID
  direction: 'ascending' | 'descending'
}

export interface CollectionView {
  id: ID
  space_id: ID
  version: number
  type: ViewType
  name: string
  parent_id: ID
  alive: boolean
  format: {
    table_properties?: Array<{ property: ID; visible: boolean; width?: number }>
    board_columns_by?: ID
    calendar_by?: ID
    timeline_by?: ID
    gallery_cover?: 'none' | 'page_cover' | 'page_content'
    wrap?: boolean
  }
  query2: { filter?: ViewFilter[]; filter_operator?: 'and' | 'or'; sort?: ViewSort[] }
  page_sort?: ID[]
}

export interface Space {
  id: ID
  version: number
  name: string
  icon?: string
  pages: ID[]
  /** space_view.bookmarked_pages */
  bookmarked_pages: ID[]
}

export interface RecordMap {
  block: Record<ID, Block>
  collection: Record<ID, Collection>
  collection_view: Record<ID, CollectionView>
  space: Record<ID, Space>
}

export type TableName = keyof RecordMap
export type AnyRecord = Block | Collection | CollectionView | Space

/** Notion-style transaction: a batch of record writes persisted atomically. */
export interface RecordWrite {
  table: TableName
  id: ID
  value: AnyRecord | null
}

export interface Transaction {
  id: ID
  timestamp: number
  writes: RecordWrite[]
}

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  locale: 'ko' | 'en'
  spellcheck: boolean
  keepInBackground: boolean
  openAtLogin: boolean
  globalShortcut: string
  globalShortcutEnabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  locale: 'ko',
  spellcheck: true,
  keepInBackground: false,
  openAtLogin: false,
  globalShortcut: 'CommandOrControl+Shift+K',
  globalShortcutEnabled: true
}

export interface TabState {
  id: ID
  history: ID[]
  index: number
  pinned?: boolean
}

export interface SessionState {
  tabs: TabState[]
  activeTabId: ID | null
  sidebarOpen: boolean
  sidebarWidth: number
  closedTabs: TabState[]
}

export interface PersistedData {
  schemaVersion: number
  records: RecordMap
  settings: Settings
  session: SessionState | null
}

/** Commands sent from the main process (menus, shortcuts, deep links) to the renderer. */
export type ShellCommand =
  | { type: 'new-tab' }
  | { type: 'close-tab' }
  | { type: 'reopen-closed-tab' }
  | { type: 'next-tab' }
  | { type: 'prev-tab' }
  | { type: 'tab-index'; index: number }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'toggle-sidebar' }
  | { type: 'quick-search' }
  | { type: 'new-page' }
  | { type: 'open-settings' }
  | { type: 'copy-link' }
  | { type: 'copy-title' }
  | { type: 'navigate'; pageId: ID }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'import-markdown'; name: string; content: string }
  | { type: 'export-markdown' }
  | { type: 'print' }
