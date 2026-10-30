import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface Anchor {
  x: number
  y: number
  /** Height of the anchor element, so the popover can flip above it when there is no room below. */
  h?: number
}

export function anchorOf(el: Element | null | undefined, align: 'below' | 'right' = 'below'): Anchor {
  const r = el?.getBoundingClientRect()
  if (!r) return { x: 0, y: 0 }
  return align === 'right' ? { x: r.right + 4, y: r.top, h: 0 } : { x: r.left, y: r.bottom + 4, h: r.height + 8 }
}

export function Popover({
  anchor,
  onClose,
  children,
  width,
  className = ''
}: {
  anchor: Anchor
  onClose: () => void
  children: ReactNode
  width?: number
  className?: string
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let left = Math.min(anchor.x, window.innerWidth - r.width - 8)
    let top = anchor.y
    if (top + r.height > window.innerHeight - 8) {
      const above = anchor.y - (anchor.h ?? 0) - r.height
      top = above > 8 ? above : Math.max(8, window.innerHeight - r.height - 8)
    }
    left = Math.max(8, left)
    setPos({ left, top })
  }, [anchor.x, anchor.y, anchor.h])

  useEffect(() => {
    const down = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // Defer so the click that opened the popover doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('mousedown', down), 0)
    document.addEventListener('keydown', key, true)
    return () => {
      clearTimeout(id)
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  return createPortal(
    <div ref={ref} className={`popover ${className}`} style={{ left: pos.left, top: pos.top, width }} onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  hint?: string
  danger?: boolean
  checked?: boolean
  disabled?: boolean
  onClick?: () => void
  submenu?: MenuItem[]
  separator?: boolean
}

export function Menu({ items, onClose }: { items: MenuItem[]; onClose: () => void }): JSX.Element {
  const [sub, setSub] = useState<{ index: number; anchor: Anchor } | null>(null)
  return (
    <div className="menu">
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div
            key={i}
            className={`menu-item ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}`}
            onMouseEnter={(e) => setSub(it.submenu ? { index: i, anchor: anchorOf(e.currentTarget, 'right') } : null)}
            onClick={() => {
              if (it.disabled || it.submenu) return
              it.onClick?.()
              onClose()
            }}
          >
            <span className="menu-icon">{it.icon}</span>
            <span className="menu-label">{it.label}</span>
            {it.checked !== undefined && <span className="menu-check">{it.checked ? '✓' : ''}</span>}
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {it.submenu && <span className="menu-hint">›</span>}
          </div>
        )
      )}
      {sub && items[sub.index]?.submenu && (
        <Popover anchor={sub.anchor} onClose={() => setSub(null)}>
          <Menu items={items[sub.index]!.submenu!} onClose={onClose} />
        </Popover>
      )}
    </div>
  )
}

/** Convenience: a popover containing a menu. */
export function MenuPopover({ anchor, items, onClose, width = 240 }: { anchor: Anchor; items: MenuItem[]; onClose: () => void; width?: number }): JSX.Element {
  return (
    <Popover anchor={anchor} onClose={onClose} width={width}>
      <Menu items={items} onClose={onClose} />
    </Popover>
  )
}
