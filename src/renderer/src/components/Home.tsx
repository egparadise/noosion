import type { Block } from '@shared/types'
import { db, useDbVersion, useSpace } from '../store/records'
import { createPage, pageTitle } from '../store/ops'
import { navigate, ui } from '../store/ui'
import { relativeTime, useT } from '../lib/i18n'

function Card({ b }: { b: Block }): JSX.Element {
  const t = useT()
  const cover = b.format.page_cover
  return (
    <div className="home-card" onClick={(e) => navigate(b.id, { newTab: e.ctrlKey || e.metaKey })}>
      <div className="home-card-cover" style={cover ? { backgroundImage: cover.startsWith('linear') ? cover : `url("${cover}")` } : undefined} />
      <div className="home-card-icon">{b.format.page_icon ?? (b.type === 'collection_view_page' ? '🗂' : '📄')}</div>
      <div className="home-card-title">{pageTitle(b) || t('untitled')}</div>
      <div className="home-card-time muted small">{relativeTime(b.last_edited_time)}</div>
    </div>
  )
}

export function Home(): JSX.Element {
  const t = useT()
  useDbVersion()
  const space = useSpace()
  const recent = ui.use((s) => s.recent)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('goodMorning') : hour < 18 ? t('goodAfternoon') : t('goodEvening')
  const recentBlocks = recent.map((id) => db.block(id)).filter((b): b is Block => !!b?.alive).slice(0, 8)
  const top = (space?.pages ?? []).map((id) => db.block(id)).filter((b): b is Block => !!b?.alive)
  const shown = recentBlocks.length ? recentBlocks : top.slice(0, 8)

  return (
    <div className="page-scroll">
      <div className="home">
        <h1 className="home-greeting">{greeting}</h1>
        <div className="section-title">◷ {t('recentlyVisited')}</div>
        <div className="home-cards">
          {shown.map((b) => (
            <Card key={b.id} b={b} />
          ))}
          <div className="home-card new" onClick={() => navigate(createPage(null))}>
            <div className="home-card-cover" />
            <div className="home-card-title">＋ {t('newPage')}</div>
          </div>
        </div>
        <div className="section-title">📚 {t('allPages')}</div>
        <div className="home-list">
          {top.map((b) => (
            <div key={b.id} className="home-list-row" onClick={(e) => navigate(b.id, { newTab: e.ctrlKey || e.metaKey })}>
              <span>{b.format.page_icon ?? '📄'}</span>
              <span className="home-list-title">{pageTitle(b) || t('untitled')}</span>
              <span className="spacer" />
              <span className="muted small">{relativeTime(b.last_edited_time)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
