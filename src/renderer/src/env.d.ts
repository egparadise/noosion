/// <reference types="vite/client" />
import type { NoosionApi } from '../../preload'

declare global {
  interface Window {
    noosion: NoosionApi
  }
}

export {}
