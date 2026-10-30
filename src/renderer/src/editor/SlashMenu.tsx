import { useEffect, useRef } from 'react'
import { applySlashItem } from './commands'
import { closeSlash, filterSlashItems, slash } from './editorState'
import { Popover } from '../components/Popover'
import { ui } from '../store/ui'

const GROUPS = {
  basic: { ko: '기본 블록', en: 'Basic blocks' },
  media: { ko: '미디어', en: 'Media' },
  database: { ko: '데이터베이스', en: 'Database' },
  layout: { ko: '레이아웃', en: 'Layout' }
}

export function SlashMenu(): JSX.Element | null {
  const blockId = slash.use((s) => s.blockId)
  const query = slash.use((s) => s.query)
  const index = slash.use((s) => s.index)
  const anchor = slash.use((s) => s.anchor)
  const locale = ui.use((s) => s.settings.locale)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('.slash-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!blockId) return null
  const items = filterSlashItems(query)
  if (!items.length && query.length > 3) {
    closeSlash()
    return null
  }
  let lastGroup = ''
  return (
    <Popover anchor={anchor} onClose={closeSlash} width={320}>
      <div className="slash-menu" ref={listRef}>
        {!items.length && <div className="menu-empty">{locale === 'ko' ? '결과 없음' : 'No results'}</div>}
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? GROUPS[it.group][locale] : null
          lastGroup = it.group
          return (
            <div key={it.id}>
              {header && <div className="menu-title">{header}</div>}
              <div
                className={`slash-item ${i === index ? 'active' : ''}`}
                onMouseEnter={() => slash.set({ index: i })}
                onMouseDown={(e) => {
                  e.preventDefault()
                  applySlashItem(it)
                }}
              >
                <span className="slash-icon">{it.icon}</span>
                <span className="slash-text">
                  <span className="slash-label">{locale === 'ko' ? it.ko : it.en}</span>
                  <span className="slash-desc">{locale === 'ko' ? it.descKo : it.descEn}</span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Popover>
  )
}
