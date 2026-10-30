import { useSyncExternalStore } from 'react'

export interface MiniStore<T> {
  get(): T
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void
  subscribe(fn: () => void): () => void
  use<R>(selector: (s: T) => R): R
}

/** Minimal Zustand-style store. Selectors must return stable references (primitives or stored objects). */
export function createStore<T extends object>(initial: T): MiniStore<T> {
  let state = initial
  const listeners = new Set<() => void>()
  const store: MiniStore<T> = {
    get: () => state,
    set: (patch) => {
      const p = typeof patch === 'function' ? patch(state) : patch
      state = { ...state, ...p }
      for (const fn of listeners) fn()
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    use: (selector) => useSyncExternalStore(store.subscribe, () => selector(state))
  }
  return store
}
