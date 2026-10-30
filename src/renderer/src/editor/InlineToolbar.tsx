import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { inlineToolbar } from './inlineToolbarState'
import { COLORS, COLOR_NAMES } from './editorState'
import { ui } from '../store/ui'
import { useT } from '../lib/i18n'

function activeEditable(): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const node = sel.getRangeAt(0).commonAncestorContainer
  const el = (node instanceof HTMLElement ? node : node.parentElement)?.closest('.editable') as HTMLElement | null
  if (!el || el.classList.contains('plain') || el.getAttribute('contenteditable') !== 'true') return null
  return el
}

function commit(el: HTMLElement | null): void {
  el?.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Floating formatting toolbar shown over a text selection (Notion's inline menu). */
export function InlineToolbar(): JSX.Element | null {
  const t = useT()
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mode, setMode] = useState<'main' | 'link' | 'color'>('main')
  const [url, setUrl] = useState('')
  const savedRange = useRef<Range | null>(null)
  const editableRef = useRef<HTMLElement | null>(null)
  const linkMode = inlineToolbar.use((s) => s.linkMode)
  const locale = ui.use((s) => s.settings.locale)

  useEffect(() => {
    const onSel = (): void => {
      if (mode === 'link') return
      const el = activeEditable()
      if (!el) {
        setRect(null)
        setMode('main')
        return
      }
      editableRef.current = el
      const r = window.getSelection()!.getRangeAt(0)
      savedRange.current = r.cloneRange()
      setRect(r.getBoundingClientRect())
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [mode])

  useEffect(() => {
    if (linkMode && activeEditable()) {
      savedRange.current = window.getSelection()!.getRangeAt(0).cloneRange()
      editableRef.current = activeEditable()
      setRect(savedRange.current.getBoundingClientRect())
      setUrl('')
      setMode('link')
    }
  }, [linkMode])

  if (!rect) return null

  const exec = (cmd: string): void => {
    document.execCommand(cmd)
    commit(editableRef.current)
    setRect(window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).getBoundingClientRect() : null)
  }

  const restore = (): Range | null => {
    const r = savedRange.current
    if (!r) return null
    const sel = window.getSelection()!
    sel.removeAllRanges()
    sel.addRange(r)
    return r
  }

  const wrapCode = (): void => {
    const r = restore()
    if (!r) return
    const code = document.createElement('code')
    code.appendChild(r.extractContents())
    r.insertNode(code)
    commit(editableRef.current)
  }

  const applyColor = (color: string | null): void => {
    const r = restore()
    if (!r) return
    const frag = r.extractContents()
    frag.querySelectorAll('span[data-color]').forEach((s) => s.removeAttribute('data-color'))
    if (color) {
      const span = document.createElement('span')
      span.dataset.color = color
      span.appendChild(frag)
      r.insertNode(span)
    } else r.insertNode(frag)
    commit(editableRef.current)
    setMode('main')
  }

  const applyLink = (): void => {
    const r = restore()
    if (!r) return
    if (url.trim()) document.execCommand('createLink', false, /^[a-z]+:/i.test(url) ? url.trim() : `https://${url.trim()}`)
    else document.execCommand('unlink')
    commit(editableRef.current)
    setMode('main')
    setRect(null)
  }

  const top = Math.max(8, rect.top - 44)
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 360))

  return createPortal(
    <div className="inline-toolbar" style={{ top, left }} onMouseDown={(e) => mode !== 'link' && e.preventDefault()}>
      {mode === 'main' && (
        <>
          <button title="Ctrl+B" onClick={() => exec('bold')}><b>B</b></button>
          <button title="Ctrl+I" onClick={() => exec('italic')}><i>i</i></button>
          <button title="Ctrl+U" onClick={() => exec('underline')}><u>U</u></button>
          <button title="Ctrl+Shift+S" onClick={() => exec('strikeThrough')}><s>S</s></button>
          <button title="Ctrl+E" onClick={wrapCode} className="mono">{'</>'}</button>
          <button title="Ctrl+K" onClick={() => { setUrl(''); setMode('link') }}>🔗</button>
          <button onClick={() => setMode('color')}>A ▾</button>
        </>
      )}
      {mode === 'link' && (
        <input
          autoFocus
          className="inline-link-input"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyLink() }
            if (e.key === 'Escape') { setMode('main'); setRect(null) }
          }}
          onBlur={() => { setMode('main'); setRect(null) }}
        />
      )}
      {mode === 'color' && (
        <div className="inline-colors">
          <div className="menu-title">{t('textColor')}</div>
          <button onClick={() => applyColor(null)}>{t('default')}</button>
          {COLORS.map((c) => (
            <button key={c} onClick={() => applyColor(c)}><span className={`color-chip text-${c}`}>A</span>{COLOR_NAMES[c]![locale]}</button>
          ))}
          <div className="menu-title">{t('background')}</div>
          {COLORS.map((c) => (
            <button key={c + 'bg'} onClick={() => applyColor(`${c}_background`)}><span className={`color-chip bg-${c}`}>A</span>{COLOR_NAMES[c]![locale]}</button>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
