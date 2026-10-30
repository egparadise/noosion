import type { BlockType, ID } from '@shared/types'
import { createStore } from '../store/createStore'
import type { Anchor } from '../components/Popover'
import type { DropPosition } from '../store/ops'

export interface SlashState {
  blockId: ID | null
  /** Offset of the "/" character in the block text. */
  start: number
  query: string
  index: number
  anchor: Anchor
}

export const slash = createStore<SlashState>({ blockId: null, start: 0, query: '', index: 0, anchor: { x: 0, y: 0 } })

export function closeSlash(): void {
  if (slash.get().blockId) slash.set({ blockId: null, query: '', index: 0 })
}

export const drag = createStore<{ dragging: ID | null; target: ID | null; pos: DropPosition | null }>({
  dragging: null,
  target: null,
  pos: null
})

export const BLOCK_DRAG_MIME = 'application/x-noosion-block'

export interface SlashItem {
  id: string
  type?: BlockType
  ko: string
  en: string
  descKo: string
  descEn: string
  icon: string
  keywords: string
  group: 'basic' | 'media' | 'database' | 'layout'
}

export const SLASH_ITEMS: SlashItem[] = [
  { id: 'text', type: 'text', ko: '텍스트', en: 'Text', descKo: '일반 텍스트로 작성을 시작하세요.', descEn: 'Just start writing with plain text.', icon: 'Aa', keywords: 'text plain paragraph 텍스트 본문', group: 'basic' },
  { id: 'page', type: 'page', ko: '페이지', en: 'Page', descKo: '이 페이지 안에 하위 페이지를 만드세요.', descEn: 'Embed a sub-page inside this page.', icon: '📄', keywords: 'page subpage 페이지', group: 'basic' },
  { id: 'to_do', type: 'to_do', ko: '할 일 목록', en: 'To-do list', descKo: '할 일 목록으로 작업을 추적하세요.', descEn: 'Track tasks with a to-do list.', icon: '☑', keywords: 'todo task checkbox 할일 체크', group: 'basic' },
  { id: 'header', type: 'header', ko: '제목 1', en: 'Heading 1', descKo: '섹션 제목(대)', descEn: 'Big section heading.', icon: 'H1', keywords: 'h1 heading title 제목 헤딩', group: 'basic' },
  { id: 'sub_header', type: 'sub_header', ko: '제목 2', en: 'Heading 2', descKo: '섹션 제목(중)', descEn: 'Medium section heading.', icon: 'H2', keywords: 'h2 heading subtitle 제목', group: 'basic' },
  { id: 'sub_sub_header', type: 'sub_sub_header', ko: '제목 3', en: 'Heading 3', descKo: '섹션 제목(소)', descEn: 'Small section heading.', icon: 'H3', keywords: 'h3 heading 제목', group: 'basic' },
  { id: 'table', type: 'table', ko: '표', en: 'Table', descKo: '페이지에 간단한 표를 추가하세요.', descEn: 'Add a simple table.', icon: '▦', keywords: 'table grid 표 테이블', group: 'basic' },
  { id: 'bulleted_list', type: 'bulleted_list', ko: '글머리 기호 목록', en: 'Bulleted list', descKo: '간단한 글머리 기호 목록', descEn: 'Create a simple bulleted list.', icon: '•', keywords: 'bullet list ul 목록 글머리', group: 'basic' },
  { id: 'numbered_list', type: 'numbered_list', ko: '번호 매기기 목록', en: 'Numbered list', descKo: '번호가 매겨진 목록', descEn: 'Create a list with numbering.', icon: '1.', keywords: 'numbered ordered list ol 번호 목록', group: 'basic' },
  { id: 'toggle', type: 'toggle', ko: '토글 목록', en: 'Toggle list', descKo: '내용을 접고 펼칠 수 있습니다.', descEn: 'Toggles can hide and show content.', icon: '▸', keywords: 'toggle collapse 토글 접기', group: 'basic' },
  { id: 'quote', type: 'quote', ko: '인용', en: 'Quote', descKo: '인용문을 작성하세요.', descEn: 'Capture a quote.', icon: '❝', keywords: 'quote blockquote 인용', group: 'basic' },
  { id: 'divider', type: 'divider', ko: '구분선', en: 'Divider', descKo: '블록을 시각적으로 나눕니다.', descEn: 'Visually divide blocks.', icon: '—', keywords: 'divider hr line 구분선 선', group: 'basic' },
  { id: 'callout', type: 'callout', ko: '콜아웃', en: 'Callout', descKo: '눈에 띄는 글을 작성하세요.', descEn: 'Make writing stand out.', icon: '💡', keywords: 'callout note info 콜아웃 강조', group: 'basic' },
  { id: 'code', type: 'code', ko: '코드', en: 'Code', descKo: '코드 스니펫을 작성하세요.', descEn: 'Capture a code snippet.', icon: '</>', keywords: 'code snippet 코드', group: 'basic' },
  { id: 'equation', type: 'equation', ko: '수식 블록', en: 'Block equation', descKo: 'LaTeX 수식을 표시합니다.', descEn: 'Display a LaTeX equation.', icon: 'TeX', keywords: 'equation math latex 수식', group: 'basic' },
  { id: 'image', type: 'image', ko: '이미지', en: 'Image', descKo: '업로드하거나 링크로 삽입하세요.', descEn: 'Upload or embed with a link.', icon: '🖼', keywords: 'image picture photo 이미지 사진', group: 'media' },
  { id: 'bookmark', type: 'bookmark', ko: '웹 북마크', en: 'Web bookmark', descKo: '링크를 시각적 북마크로 저장', descEn: 'Save a link as a visual bookmark.', icon: '🔖', keywords: 'bookmark link url 북마크 링크', group: 'media' },
  { id: 'db_inline', type: 'collection_view', ko: '데이터베이스 - 인라인', en: 'Database - Inline', descKo: '이 페이지 안에 데이터베이스를 추가합니다.', descEn: 'Add a database inside this page.', icon: '🗃', keywords: 'database table inline db 데이터베이스 표', group: 'database' },
  { id: 'db_page', type: 'collection_view_page', ko: '데이터베이스 - 전체 페이지', en: 'Database - Full page', descKo: '데이터베이스를 하위 페이지로 추가합니다.', descEn: 'Add a database as a sub-page.', icon: '🗂', keywords: 'database page full db 데이터베이스', group: 'database' },
  { id: 'db_board', ko: '보드 보기', en: 'Board view', descKo: '칸반 보드 데이터베이스', descEn: 'Kanban board database.', icon: '▥', keywords: 'board kanban 보드 칸반', group: 'database' },
  { id: 'db_calendar', ko: '캘린더 보기', en: 'Calendar view', descKo: '캘린더 데이터베이스', descEn: 'Calendar database.', icon: '📅', keywords: 'calendar 캘린더 달력', group: 'database' },
  { id: 'col2', ko: '2개의 열', en: '2 columns', descKo: '블록을 2개의 열로 배치', descEn: 'Create 2 columns of blocks.', icon: '⫴', keywords: 'columns 2 열 컬럼', group: 'layout' },
  { id: 'col3', ko: '3개의 열', en: '3 columns', descKo: '블록을 3개의 열로 배치', descEn: 'Create 3 columns of blocks.', icon: '⫼', keywords: 'columns 3 열 컬럼', group: 'layout' }
]

export function filterSlashItems(q: string): SlashItem[] {
  const query = q.trim().toLowerCase()
  if (!query) return SLASH_ITEMS
  return SLASH_ITEMS.filter(
    (it) => it.ko.toLowerCase().includes(query) || it.en.toLowerCase().includes(query) || it.keywords.toLowerCase().includes(query)
  )
}

export const TURN_INTO_TYPES: BlockType[] = [
  'text',
  'page',
  'to_do',
  'header',
  'sub_header',
  'sub_sub_header',
  'bulleted_list',
  'numbered_list',
  'toggle',
  'code',
  'quote',
  'callout'
]

export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export const COLOR_NAMES: Record<string, { ko: string; en: string }> = {
  gray: { ko: '회색', en: 'Gray' },
  brown: { ko: '갈색', en: 'Brown' },
  orange: { ko: '주황색', en: 'Orange' },
  yellow: { ko: '노란색', en: 'Yellow' },
  green: { ko: '초록색', en: 'Green' },
  blue: { ko: '파란색', en: 'Blue' },
  purple: { ko: '보라색', en: 'Purple' },
  pink: { ko: '분홍색', en: 'Pink' },
  red: { ko: '빨간색', en: 'Red' }
}
