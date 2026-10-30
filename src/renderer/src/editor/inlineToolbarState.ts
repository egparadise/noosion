import { createStore } from '../store/createStore'

export const inlineToolbar = createStore<{ linkMode: number }>({ linkMode: 0 })

/** Ctrl+K: ask the floating toolbar to open its link input for the current selection. */
export function openInlineLink(): void {
  inlineToolbar.set({ linkMode: Date.now() })
}
