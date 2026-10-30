import { useState } from 'react'
import { useT } from '../lib/i18n'

const EMOJIS: Array<[string, string]> = [
  ['📄', 'page document'], ['📝', 'memo note'], ['📚', 'books library'], ['📖', 'book read'], ['📌', 'pin'], ['📎', 'clip'],
  ['📅', 'calendar date'], ['🗓️', 'calendar plan'], ['✅', 'check done'], ['☑️', 'checkbox todo'], ['⭐', 'star'], ['🌟', 'glow star'],
  ['💡', 'idea bulb'], ['🔥', 'fire hot'], ['🚀', 'rocket launch'], ['🎯', 'target goal'], ['🏆', 'trophy'], ['🎉', 'party'],
  ['💼', 'work briefcase'], ['📊', 'chart bar'], ['📈', 'chart up'], ['📉', 'chart down'], ['🗂️', 'folder index'], ['📁', 'folder'],
  ['🧠', 'brain think'], ['💬', 'chat comment'], ['📣', 'announce'], ['🔔', 'bell'], ['🔒', 'lock'], ['🔑', 'key'],
  ['⚙️', 'gear settings'], ['🛠️', 'tools'], ['🧪', 'test lab'], ['🔬', 'research'], ['💻', 'laptop code'], ['🖥️', 'desktop'],
  ['📱', 'phone mobile'], ['🌐', 'web globe'], ['🧭', 'compass'], ['🗺️', 'map'], ['🏠', 'home house'], ['🏢', 'office'],
  ['✈️', 'travel plane'], ['🚗', 'car'], ['☕', 'coffee'], ['🍎', 'apple'], ['🍕', 'pizza food'], ['🎵', 'music'],
  ['🎨', 'art design'], ['📷', 'camera photo'], ['🎬', 'movie film'], ['🎮', 'game'], ['⚽', 'sport ball'], ['🏃', 'run'],
  ['❤️', 'heart love'], ['💙', 'blue heart'], ['💚', 'green heart'], ['💛', 'yellow heart'], ['💜', 'purple heart'], ['🖤', 'black heart'],
  ['😀', 'smile happy'], ['😎', 'cool'], ['🤔', 'think'], ['😴', 'sleep'], ['🥳', 'celebrate'], ['🙏', 'thanks'],
  ['👋', 'wave hello'], ['👍', 'thumbs up'], ['👀', 'eyes look'], ['💪', 'strong'], ['🤝', 'deal handshake'], ['👥', 'team people'],
  ['🌿', 'leaf plant'], ['🌱', 'seedling grow'], ['🌳', 'tree'], ['🌸', 'flower'], ['🌙', 'moon night'], ['☀️', 'sun'],
  ['⚡', 'bolt energy'], ['🌈', 'rainbow'], ['❄️', 'snow'], ['🌊', 'wave sea'], ['🐶', 'dog'], ['🐱', 'cat'],
  ['💰', 'money'], ['💳', 'card pay'], ['🧾', 'receipt'], ['📦', 'package box'], ['🛒', 'cart shop'], ['🎁', 'gift'],
  ['❓', 'question'], ['❗', 'important'], ['⚠️', 'warning'], ['🚧', 'construction wip'], ['♻️', 'recycle'], ['🔗', 'link']
]

export function EmojiPicker({ onPick, onRemove }: { onPick: (e: string) => void; onRemove?: () => void }): JSX.Element {
  const t = useT()
  const [q, setQ] = useState('')
  const list = q ? EMOJIS.filter(([e, k]) => k.includes(q.toLowerCase()) || e === q) : EMOJIS
  return (
    <div className="emoji-picker">
      <div className="emoji-head">
        <input autoFocus placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost" onClick={() => onPick(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]![0])}>
          {t('random')}
        </button>
        {onRemove && (
          <button className="btn-ghost" onClick={onRemove}>
            {t('removeIcon')}
          </button>
        )}
      </div>
      <div className="emoji-grid">
        {list.map(([e]) => (
          <button key={e} className="emoji-cell" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
