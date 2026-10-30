import { useState } from 'react'
import type { Settings } from '@shared/types'
import { db, useSpace } from '../store/records'
import { ui } from '../store/ui'
import { useT } from '../lib/i18n'
import { EmojiPicker } from './EmojiPicker'
import { anchorOf, Popover, type Anchor } from './Popover'

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  ui.set((s) => ({ settings: { ...s.settings, ...patch } }))
  await window.noosion?.updateSettings(patch)
}

export function SettingsModal(): JSX.Element | null {
  const t = useT()
  const open = ui.use((s) => s.settingsOpen)
  const settings = ui.use((s) => s.settings)
  const space = useSpace()
  const [section, setSection] = useState<'general' | 'desktop' | 'workspace' | 'about'>('general')
  const [iconPicker, setIconPicker] = useState<Anchor | null>(null)
  const [recording, setRecording] = useState(false)
  if (!open) return null
  const close = (): void => ui.set({ settingsOpen: false })

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="settings-modal" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && !recording && close()}>
        <nav className="settings-nav">
          <div className="section-title">{t('settings')}</div>
          {(['general', 'desktop', 'workspace', 'about'] as const).map((s) => (
            <div key={s} className={`nav-item ${section === s ? 'active' : ''}`} onClick={() => setSection(s)}>
              {s === 'general' ? t('general') : s === 'desktop' ? t('desktopApp') : s === 'workspace' ? t('workspace') : t('about')}
            </div>
          ))}
        </nav>
        <div className="settings-body">
          <button className="btn-ghost settings-close" onClick={close}>×</button>
          {section === 'general' && (
            <>
              <h2>{t('general')}</h2>
              <div className="setting-row">
                <span>{t('theme')}</span>
                <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as Settings['theme'] })}>
                  <option value="system">{t('system')}</option>
                  <option value="light">{t('light')}</option>
                  <option value="dark">{t('dark')}</option>
                </select>
              </div>
              <div className="setting-row">
                <span>{t('language')}</span>
                <select value={settings.locale} onChange={(e) => updateSettings({ locale: e.target.value as Settings['locale'] })}>
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
              </div>
            </>
          )}
          {section === 'desktop' && (
            <>
              <h2>{t('desktopApp')}</h2>
              <label className="setting-row">
                <span>{t('spellcheck')}</span>
                <input type="checkbox" checked={settings.spellcheck} onChange={(e) => updateSettings({ spellcheck: e.target.checked })} />
              </label>
              <label className="setting-row">
                <span>{t('keepInBackground')}</span>
                <input type="checkbox" checked={settings.keepInBackground} onChange={(e) => updateSettings({ keepInBackground: e.target.checked })} />
              </label>
              <label className="setting-row">
                <span>{t('openAtLogin')}</span>
                <input type="checkbox" checked={settings.openAtLogin} onChange={(e) => updateSettings({ openAtLogin: e.target.checked })} />
              </label>
              <div className="setting-row">
                <span>{t('globalShortcut')}</span>
                <span className="row-gap">
                  <input type="checkbox" checked={settings.globalShortcutEnabled} onChange={(e) => updateSettings({ globalShortcutEnabled: e.target.checked })} />
                  <input
                    className={`input shortcut-input ${recording ? 'recording' : ''}`}
                    readOnly
                    value={recording ? '…' : settings.globalShortcut.replace('CommandOrControl', 'Ctrl')}
                    onFocus={() => setRecording(true)}
                    onBlur={() => setRecording(false)}
                    onKeyDown={(e) => {
                      e.preventDefault()
                      if (e.key === 'Escape') return (e.target as HTMLInputElement).blur()
                      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
                      const parts = [e.ctrlKey || e.metaKey ? 'CommandOrControl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean)
                      if (!parts.length) return
                      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
                      updateSettings({ globalShortcut: [...parts, key].join('+') })
                      ;(e.target as HTMLInputElement).blur()
                    }}
                  />
                </span>
              </div>
              <p className="muted small">{t('dataHint')}</p>
            </>
          )}
          {section === 'workspace' && space && (
            <>
              <h2>{t('workspace')}</h2>
              <div className="setting-row">
                <span>{t('workspaceName')}</span>
                <span className="row-gap">
                  <button className="btn-ghost workspace-icon-btn" onClick={(e) => setIconPicker(anchorOf(e.currentTarget))}>{space.icon ?? '🌿'}</button>
                  <input
                    className="input"
                    defaultValue={space.name}
                    onBlur={(e) => e.target.value && db.transact((tx) => tx.update('space', space.id, { name: e.target.value }))}
                  />
                </span>
              </div>
              <p className="muted small">
                {Object.values(db.records.block).filter((b) => b.alive).length} blocks · {Object.keys(db.records.collection).length} databases
              </p>
              {iconPicker && (
                <Popover anchor={iconPicker} onClose={() => setIconPicker(null)} width={340}>
                  <EmojiPicker onPick={(e) => { db.transact((tx) => tx.update('space', space.id, { icon: e })); setIconPicker(null) }} />
                </Popover>
              )}
            </>
          )}
          {section === 'about' && (
            <>
              <h2>Noosion</h2>
              <p>Local-first, Notion-style workspace — Electron + React.</p>
              <p className="muted small">https://github.com/egparadise/noosion</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
