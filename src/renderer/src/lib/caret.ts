import type { RichText } from '@shared/types'
import { htmlToRichText } from './richtext'

export function selectionIn(el: HTMLElement): Range | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  return el.contains(r.startContainer) ? r : null
}

/** Character offset of the caret (selection start) from the beginning of el. */
export function getCaretOffset(el: HTMLElement): number {
  const r = selectionIn(el)
  if (!r) return 0
  const pre = document.createRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.startContainer, r.startOffset)
  return pre.toString().length
}

export function setCaret(el: HTMLElement, pos: 'start' | 'end' | number): void {
  el.focus({ preventScroll: true })
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  if (pos === 'start' || pos === 0) {
    range.selectNodeContents(el)
    range.collapse(true)
  } else if (pos === 'end') {
    range.selectNodeContents(el)
    range.collapse(false)
  } else {
    let remaining = pos
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node: Node | null = walker.nextNode()
    let placed = false
    while (node) {
      const len = node.textContent?.length ?? 0
      if (remaining <= len) {
        range.setStart(node, remaining)
        range.collapse(true)
        placed = true
        break
      }
      remaining -= len
      node = walker.nextNode()
    }
    if (!placed) {
      range.selectNodeContents(el)
      range.collapse(false)
    }
  }
  sel.removeAllRanges()
  sel.addRange(range)
  ;(el.closest('[data-block-id]') ?? el).scrollIntoView({ block: 'nearest' })
}

export function isCaretAtStart(el: HTMLElement): boolean {
  const r = selectionIn(el)
  return !!r && r.collapsed && getCaretOffset(el) === 0
}

export function isCaretAtEnd(el: HTMLElement): boolean {
  const r = selectionIn(el)
  return !!r && r.collapsed && getCaretOffset(el) === (el.textContent?.length ?? 0)
}

function caretRect(el: HTMLElement): DOMRect | null {
  const r = selectionIn(el)
  if (!r) return null
  const rects = r.getClientRects()
  if (rects.length) return rects[0]!
  // Collapsed ranges in empty nodes have no rects; fall back to a temporary marker.
  const marker = document.createElement('span')
  marker.textContent = '​'
  const clone = r.cloneRange()
  clone.insertNode(marker)
  const rect = marker.getBoundingClientRect()
  marker.remove()
  el.normalize()
  return rect
}

export function caretOnFirstLine(el: HTMLElement): boolean {
  const rect = caretRect(el)
  if (!rect) return true
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
  return rect.top - el.getBoundingClientRect().top < lh * 0.8
}

export function caretOnLastLine(el: HTMLElement): boolean {
  const rect = caretRect(el)
  if (!rect) return true
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
  return el.getBoundingClientRect().bottom - rect.bottom < lh * 0.8
}

export function caretClientRect(): DOMRect | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  const rects = r.getClientRects()
  if (rects.length) return rects[0]!
  const node = r.startContainer instanceof HTMLElement ? r.startContainer : r.startContainer.parentElement
  return node?.getBoundingClientRect() ?? null
}

/** Split el's content at the caret into [before, after] rich text (selection is deleted first). */
export function splitAtCaret(el: HTMLElement): [RichText, RichText] {
  const r = selectionIn(el)
  if (!r) return [htmlToRichText(el), []]
  if (!r.collapsed) r.deleteContents()
  const before = document.createRange()
  before.selectNodeContents(el)
  before.setEnd(r.startContainer, r.startOffset)
  const after = document.createRange()
  after.selectNodeContents(el)
  after.setStart(r.startContainer, r.startOffset)
  const a = document.createElement('div')
  a.appendChild(before.cloneContents())
  const b = document.createElement('div')
  b.appendChild(after.cloneContents())
  return [htmlToRichText(a), htmlToRichText(b)]
}
