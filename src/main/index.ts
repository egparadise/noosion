import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  shell,
  Tray,
  type MenuItemConstructorOptions
} from 'electron'
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { RecordStore } from './store'
import { buildMenu } from './menu'
import type { PersistedData, RecordMap, RecordWrite, SessionState, Settings, ShellCommand } from '@shared/types'

const PROTOCOL = 'noosion'
const FILE_SCHEME = 'noosion-file'
const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024

protocol.registerSchemesAsPrivileged([
  { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

// Isolated profile for development / automated smoke tests.
if (process.env.NOOSION_USER_DATA) app.setPath('userData', process.env.NOOSION_USER_DATA)

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Only the installed build claims the noosion:// scheme (dev runs would point it at electron.exe).
if (app.isPackaged && !process.env.NOOSION_USER_DATA) app.setAsDefaultProtocolClient(PROTOCOL)

let store: RecordStore
let tray: Tray | null = null
let quitting = false
const windows = new Set<BrowserWindow>()
let primaryWindow: BrowserWindow | null = null
/** Commands that arrived before a renderer finished loading (deep links, .md files on launch). */
const pendingCommands = new Map<number, ShellCommand[]>()
const readyWindows = new Set<number>()

function iconPath(): string {
  return join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'resources', 'icon.png')
}

function themeColors(): { color: string; symbolColor: string } {
  const theme = store.settings.theme
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  return dark ? { color: '#202020', symbolColor: '#e6e6e6' } : { color: '#f7f7f5', symbolColor: '#37352f' }
}

function send(win: BrowserWindow | undefined | null, cmd: ShellCommand): void {
  const target = win && !win.isDestroyed() ? win : BrowserWindow.getFocusedWindow() ?? primaryWindow
  if (!target) return
  if (!readyWindows.has(target.webContents.id)) {
    const q = pendingCommands.get(target.webContents.id) ?? []
    q.push(cmd)
    pendingCommands.set(target.webContents.id, q)
    return
  }
  target.webContents.send('shell:command', cmd)
}

function createWindow(opts: { primary?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'Noosion',
    icon: iconPath(),
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...themeColors(), height: 38 },
    backgroundColor: themeColors().color,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: store.settings.spellcheck
    }
  })
  windows.add(win)
  if (opts.primary || !primaryWindow) primaryWindow = win
  const wcId = win.webContents.id

  win.once('ready-to-show', () => win.show())
  win.on('close', (e) => {
    if (!quitting && store.settings.keepInBackground && win === primaryWindow && windows.size === 1) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    windows.delete(win)
    readyWindows.delete(wcId)
    pendingCommands.delete(wcId)
    if (primaryWindow === win) primaryWindow = [...windows][0] ?? null
  })

  // External links open in the default browser; never navigate the app window away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
    }
  })

  // Spellcheck-aware context menu (Notion: notion:context-menu / replace-misspelling / add-to-dictionary).
  win.webContents.on('context-menu', (_e, params) => {
    const items: MenuItemConstructorOptions[] = []
    for (const s of params.dictionarySuggestions.slice(0, 6)) {
      items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) })
    }
    if (params.misspelledWord) {
      items.push({
        label: store.settings.locale === 'ko' ? '사전에 추가' : 'Add to Dictionary',
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
    }
    if (items.length) items.push({ type: 'separator' })
    if (params.linkURL && /^https?:/i.test(params.linkURL)) {
      items.push({ label: store.settings.locale === 'ko' ? '링크 복사' : 'Copy Link', click: () => clipboard.writeText(params.linkURL) })
    }
    if (params.isEditable || params.selectionText) {
      items.push(
        { role: 'cut', enabled: params.editFlags.canCut },
        { role: 'copy', enabled: params.editFlags.canCopy },
        { role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll' }
      )
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })

  // Crash watchdog (Notion: crashWatchdog.dialog.*)
  win.webContents.on('render-process-gone', async (_e, details) => {
    if (details.reason === 'clean-exit') return
    const ko = store.settings.locale === 'ko'
    const { response } = await dialog.showMessageBox(win, {
      type: 'error',
      title: ko ? '문제가 발생했습니다' : 'Something went wrong',
      message: ko ? '화면을 표시하는 중 문제가 발생했습니다.' : 'Something went wrong while displaying this window.',
      detail: `Reason: ${details.reason}\nExit code: ${details.exitCode}`,
      buttons: ko ? ['다시 불러오기', '창 닫기', '앱 재시작'] : ['Reload', 'Close Window', 'Restart Noosion']
    })
    if (response === 0) win.webContents.reload()
    else if (response === 1) win.destroy()
    else {
      app.relaunch()
      app.exit(0)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function showPrimary(): BrowserWindow {
  const win = primaryWindow ?? createWindow({ primary: true })
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  return win
}

/** Handles noosion://page/<id> deep links and .md files passed on the command line. */
function handleArgv(argv: string[], win?: BrowserWindow): void {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith(`${PROTOCOL}://`)) {
      const m = /^noosion:\/\/(?:page\/)?([0-9a-f-]{8,})/i.exec(arg)
      if (m) send(win ?? showPrimary(), { type: 'navigate', pageId: m[1] })
    } else if (/\.(md|markdown)$/i.test(arg) && existsSync(arg)) {
      const md = readMarkdown(arg, win)
      if (md) send(win ?? showPrimary(), { type: 'import-markdown', ...md })
    }
  }
}

function readMarkdown(file: string, win?: BrowserWindow | null): { name: string; content: string } | null {
  const ko = store.settings.locale === 'ko'
  try {
    if (statSync(file).size > MAX_MARKDOWN_BYTES) {
      dialog.showMessageBox(win ?? undefined!, {
        type: 'warning',
        message: ko ? `“${basename(file)}” 파일을 열 수 없습니다` : `Couldn’t open “${basename(file)}”`,
        detail: ko ? '파일이 너무 큽니다 (최대 5MB).' : 'This file is too large to open (5 MB max).'
      })
      return null
    }
    return { name: basename(file, extname(file)), content: readFileSync(file, 'utf8') }
  } catch {
    return null
  }
}

function applyMenu(): void {
  Menu.setApplicationMenu(
    buildMenu(store.settings.locale, {
      send,
      newWindow: () => createWindow(),
      importMarkdown: async (win) => {
        const r = await dialog.showOpenDialog(win ?? undefined!, {
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
        })
        for (const f of r.filePaths.slice(0, 20)) {
          const md = readMarkdown(f, win)
          if (md) send(win, { type: 'import-markdown', ...md })
        }
      },
      exportBackup: async (win) => {
        store.flush()
        const r = await dialog.showSaveDialog(win ?? undefined!, {
          defaultPath: `noosion-backup-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: 'JSON', extensions: ['json'] }]
        })
        if (r.filePath) copyFileSync(store.file, r.filePath)
      },
      restoreBackup: async (win) => {
        const ko = store.settings.locale === 'ko'
        const r = await dialog.showOpenDialog(win ?? undefined!, { filters: [{ name: 'JSON', extensions: ['json'] }] })
        if (!r.filePaths[0]) return
        try {
          const parsed = JSON.parse(readFileSync(r.filePaths[0], 'utf8')) as PersistedData
          if (!parsed.records?.block) throw new Error('invalid backup')
          const { response } = await dialog.showMessageBox(win ?? undefined!, {
            type: 'warning',
            buttons: ko ? ['복원', '취소'] : ['Restore', 'Cancel'],
            message: ko ? '현재 워크스페이스를 백업 내용으로 바꿀까요?' : 'Replace the current workspace with this backup?'
          })
          if (response !== 0) return
          store.replaceRecords(parsed.records)
          for (const w of windows) w.webContents.reload()
        } catch (err) {
          dialog.showErrorBox('Noosion', String(err))
        }
      },
      showDataFolder: () => shell.openPath(store.dir),
      resetData: async (win) => {
        const ko = store.settings.locale === 'ko'
        const { response } = await dialog.showMessageBox(win ?? undefined!, {
          type: 'warning',
          buttons: ko ? ['모든 로컬 데이터 초기화', '취소'] : ['Reset all local data', 'Cancel'],
          defaultId: 1,
          message: ko ? '모든 로컬 데이터를 초기화하고 삭제합니다' : 'Resetting and erasing all local data',
          detail: ko
            ? '페이지, 데이터베이스, 첨부 파일, 설정이 모두 삭제됩니다. 되돌릴 수 없습니다.'
            : 'This deletes all pages, databases, attachments and settings. This cannot be undone.'
        })
        if (response !== 0) return
        quitting = true
        store.eraseAll()
        app.relaunch()
        app.exit(0)
      },
      about: (win) =>
        dialog.showMessageBox(win ?? undefined!, {
          title: 'Noosion',
          message: `Noosion ${app.getVersion()}`,
          detail: `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}\nLocal-first workspace.\nhttps://github.com/egparadise/noosion`,
          icon: nativeImage.createFromPath(iconPath())
        }),
      quit: () => {
        quitting = true
        app.quit()
      }
    })
  )
}

function applyTray(): void {
  if (tray) return
  tray = new Tray(nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }))
  tray.setToolTip('Noosion')
  tray.on('click', () => showPrimary())
  const ko = () => store.settings.locale === 'ko'
  const rebuild = (): void => {
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: ko() ? 'Noosion 열기' : 'Open Noosion', click: () => showPrimary() },
        { label: ko() ? '빠른 검색' : 'Quick Search', click: () => send(showPrimary(), { type: 'quick-search' }) },
        { type: 'separator' },
        {
          label: ko() ? '백그라운드에서 계속 실행' : 'Keep in Background',
          type: 'checkbox',
          checked: store.settings.keepInBackground,
          click: (i) => updateSettings({ keepInBackground: i.checked })
        },
        {
          label: ko() ? '로그인 시 Noosion 열기' : 'Open Noosion at Login',
          type: 'checkbox',
          checked: store.settings.openAtLogin,
          click: (i) => updateSettings({ openAtLogin: i.checked })
        },
        { type: 'separator' },
        {
          label: ko() ? 'Noosion 종료' : 'Quit Noosion',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
  }
  rebuild()
  trayRebuild = rebuild
}
let trayRebuild: () => void = () => {}

function applyGlobalShortcut(): void {
  globalShortcut.unregisterAll()
  const s = store.settings
  if (!s.globalShortcutEnabled || !s.globalShortcut) return
  try {
    globalShortcut.register(s.globalShortcut, () => {
      const win = primaryWindow
      if (win && win.isVisible() && win.isFocused()) win.hide()
      else send(showPrimary(), { type: 'quick-search' })
    })
  } catch (err) {
    console.warn('[shortcut] failed to register', s.globalShortcut, err)
  }
}

function updateSettings(patch: Partial<Settings>): Settings {
  const prev = store.settings
  const next = store.setSettings(patch)
  if (patch.locale && patch.locale !== prev.locale) {
    applyMenu()
    trayRebuild()
  }
  if (patch.theme) {
    nativeTheme.themeSource = next.theme
    for (const w of windows) w.setTitleBarOverlay?.({ ...themeColors(), height: 38 })
  }
  if (patch.spellcheck !== undefined) {
    for (const w of windows) w.webContents.session.setSpellCheckerEnabled(next.spellcheck)
  }
  if (patch.openAtLogin !== undefined && app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.openAtLogin })
  if (patch.globalShortcut !== undefined || patch.globalShortcutEnabled !== undefined) applyGlobalShortcut()
  trayRebuild()
  for (const w of windows) w.webContents.send('settings:changed', next)
  return next
}

function registerIpc(): void {
  ipcMain.handle('db:load', () => store.snapshot())
  ipcMain.handle('db:transact', (e, writes: RecordWrite[]) => {
    store.applyWrites(writes)
    for (const w of windows) if (w.webContents.id !== e.sender.id) w.webContents.send('db:remote-writes', writes)
  })
  ipcMain.handle('db:replace', (_e, records: RecordMap) => store.replaceRecords(records))
  ipcMain.handle('session:save', (e, session: SessionState) => {
    if (primaryWindow && e.sender.id === primaryWindow.webContents.id) store.setSession(session)
  })
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => updateSettings(patch))
  ipcMain.on('shell:ready', (e) => {
    readyWindows.add(e.sender.id)
    for (const cmd of pendingCommands.get(e.sender.id) ?? []) e.sender.send('shell:command', cmd)
    pendingCommands.delete(e.sender.id)
  })
  ipcMain.on('shell:set-title', (e, title: string) => {
    BrowserWindow.fromWebContents(e.sender)?.setTitle(title ? `${title} — Noosion` : 'Noosion')
  })
  ipcMain.handle('shell:is-primary', (e) => primaryWindow?.webContents.id === e.sender.id)
  ipcMain.handle('shell:print', (e) => e.sender.print({}))
  ipcMain.handle('shell:open-external', (_e, url: string) => {
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url)
  })

  ipcMain.handle('files:pick-image', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }]
    })
    if (!r.filePaths[0]) return null
    const name = `${randomUUID()}${extname(r.filePaths[0]).toLowerCase()}`
    copyFileSync(r.filePaths[0], join(store.filesDir, name))
    return `${FILE_SCHEME}://files/${name}`
  })
  ipcMain.handle('files:save-bytes', (_e, bytes: Uint8Array, ext: string) => {
    const safeExt = /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : 'png'
    const name = `${randomUUID()}.${safeExt}`
    writeFileSync(join(store.filesDir, name), Buffer.from(bytes))
    return `${FILE_SCHEME}://files/${name}`
  })
  ipcMain.handle('files:open-markdown', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
    return r.filePaths.slice(0, 20).map((f) => readMarkdown(f, win)).filter(Boolean)
  })
  ipcMain.handle('files:save-text', async (e, suggestedName: string, content: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: suggestedName.replace(/[\\/:*?"<>|]/g, '_'),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (!r.filePath) return false
    writeFileSync(r.filePath, content, 'utf8')
    return true
  })

  // Bookmark previews: fetch <title> / og:description from the main process (no CORS).
  ipcMain.handle('net:link-preview', async (_e, url: string) => {
    if (!/^https?:\/\//i.test(url)) return null
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 8000)
      const res = await net.fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 Noosion' } })
      clearTimeout(timer)
      const html = (await res.text()).slice(0, 300_000)
      const meta = (name: string) =>
        new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html)?.[1] ??
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i').exec(html)?.[1]
      const title = meta('og:title') ?? /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]
      return { title: title?.trim() ?? '', description: (meta('og:description') ?? meta('description') ?? '').trim() }
    } catch {
      return null
    }
  })
}

app.on('second-instance', (_e, argv) => {
  const win = showPrimary()
  handleArgv(argv, win)
})

app.on('open-url', (e, url) => {
  e.preventDefault()
  handleArgv(['', url])
})

app.whenReady().then(() => {
  store = new RecordStore()
  nativeTheme.themeSource = store.settings.theme
  nativeTheme.on('updated', () => {
    for (const w of windows) w.setTitleBarOverlay?.({ ...themeColors(), height: 38 })
  })

  protocol.handle(FILE_SCHEME, (req) => {
    const name = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '')
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return new Response('Bad path', { status: 400 })
    return net.fetch(pathToFileURL(join(store.filesDir, name)).toString())
  })

  registerIpc()
  applyMenu()
  applyTray()
  applyGlobalShortcut()
  const win = createWindow({ primary: true })
  handleArgv(process.argv, win)

  app.on('activate', () => {
    if (windows.size === 0) createWindow({ primary: true })
  })
})

app.on('before-quit', () => {
  quitting = true
  store?.flush()
})

app.on('will-quit', () => globalShortcut.unregisterAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
