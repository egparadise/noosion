import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ID, RichText } from '@shared/types'
import { htmlToRichText, plainText, richTextToHtml } from '../lib/richtext'
import { getCaretOffset, setCaret } from '../lib/caret'
import { registerEditable } from '../store/ui'

export interface EditableProps {
  /** Focus registry key (block id, or `title:<pageId>` for page titles). */
  focusId: ID
  value: RichText | undefined
  onChange: (rt: RichText, el: HTMLDivElement) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => void
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>, el: HTMLDivElement) => void
  onFocus?: () => void
  onBlur?: () => void
  placeholder?: string
  /** Show the placeholder even when unfocused (headings, titles). */
  placeholderAlways?: boolean
  className?: string
  /** Plain-text mode (code blocks): no inline formatting, newlines preserved. */
  plain?: boolean
  readOnly?: boolean
  spellCheck?: boolean
}

function escapePlain(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Uncontrolled contentEditable bound to rich text. The DOM is only rewritten when the value changes
 * from outside (undo, remote window, markdown shortcut); our own edits round-trip without a reset,
 * which keeps the caret and IME composition intact.
 */
export function Editable(props: EditableProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const lastValue = useRef<RichText | undefined | null>(null)
  const composing = useRef(false)
  const propsRef = useRef(props)
  propsRef.current = props

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || props.value === lastValue.current) return
    lastValue.current = props.value
    const html = props.plain ? escapePlain(plainText(props.value)) : richTextToHtml(props.value)
    if (el.innerHTML === html) return
    const focused = document.activeElement === el
    const offset = focused ? getCaretOffset(el) : 0
    el.innerHTML = html
    if (focused) setCaret(el, Math.min(offset, el.textContent?.length ?? 0))
  }, [props.value, props.plain])

  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { __applyCaret?: (p: 'start' | 'end' | number) => void }) | null
    if (!el) return
    el.__applyCaret = (p) => setCaret(el, p)
    const unregister = registerEditable(props.focusId, el)
    // Undo/redo is handled by the record store, never by contentEditable's own history.
    const beforeInput = (e: InputEvent): void => {
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') e.preventDefault()
    }
    el.addEventListener('beforeinput', beforeInput)
    return () => {
      unregister()
      el.removeEventListener('beforeinput', beforeInput)
    }
  }, [props.focusId])

  const emit = (): void => {
    const el = ref.current
    if (!el || composing.current) return
    if (!el.textContent && el.innerHTML !== '' && !el.querySelector('img')) el.innerHTML = ''
    const rt: RichText = propsRef.current.plain ? (el.textContent ? [[el.textContent]] : []) : htmlToRichText(el)
    lastValue.current = rt
    propsRef.current.onChange(rt, el)
  }

  return (
    <div
      ref={ref}
      className={`editable ${props.className ?? ''} ${props.placeholderAlways ? 'ph-always' : ''}`}
      contentEditable={!props.readOnly}
      suppressContentEditableWarning
      spellCheck={props.spellCheck ?? !props.plain}
      data-placeholder={props.placeholder}
      onInput={emit}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={() => {
        composing.current = false
        emit()
      }}
      onKeyDown={(e) => {
        if (composing.current || e.nativeEvent.isComposing) return
        props.onKeyDown?.(e, ref.current!)
      }}
      onPaste={(e) => {
        if (props.onPaste) props.onPaste(e, ref.current!)
        if (e.defaultPrevented) return
        // Strip foreign formatting: paste as plain text.
        e.preventDefault()
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
      }}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    />
  )
}
