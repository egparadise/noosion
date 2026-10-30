import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { PersistedData, RecordMap, RecordWrite, SessionState, Settings, ShellCommand } from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/** The single bridge exposed to the renderer (Notion's equivalent is window.__electronApi). */
const api = {
  platform: process.platform,
  load: (): Promise<PersistedData> => ipcRenderer.invoke('db:load'),
  transact: (writes: RecordWrite[]): Promise<void> => ipcRenderer.invoke('db:transact', writes),
  replaceRecords: (records: RecordMap): Promise<void> => ipcRenderer.invoke('db:replace', records),
  onRemoteWrites: (cb: (writes: RecordWrite[]) => void) => subscribe('db:remote-writes', cb),
  saveSession: (s: SessionState): Promise<void> => ipcRenderer.invoke('session:save', s),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:update', patch),
  onSettingsChanged: (cb: (s: Settings) => void) => subscribe('settings:changed', cb),
  onCommand: (cb: (cmd: ShellCommand) => void) => subscribe('shell:command', cb),
  ready: (): void => ipcRenderer.send('shell:ready'),
  isPrimaryWindow: (): Promise<boolean> => ipcRenderer.invoke('shell:is-primary'),
  setTitle: (title: string): void => ipcRenderer.send('shell:set-title', title),
  print: (): Promise<void> => ipcRenderer.invoke('shell:print'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('files:pick-image'),
  saveBytes: (bytes: Uint8Array, ext: string): Promise<string> => ipcRenderer.invoke('files:save-bytes', bytes, ext),
  saveText: (name: string, content: string): Promise<boolean> => ipcRenderer.invoke('files:save-text', name, content),
  openMarkdown: (): Promise<Array<{ name: string; content: string }>> => ipcRenderer.invoke('files:open-markdown'),
  linkPreview: (url: string): Promise<{ title: string; description: string } | null> =>
    ipcRenderer.invoke('net:link-preview', url)
}

export type NoosionApi = typeof api

contextBridge.exposeInMainWorld('noosion', api)
