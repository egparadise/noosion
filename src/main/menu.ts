import { Menu, type BaseWindow, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { ShellCommand } from '@shared/types'

type Locale = 'ko' | 'en'

const L = {
  file: { ko: '파일', en: 'File' },
  newTab: { ko: '새 탭', en: 'New Tab' },
  newWindow: { ko: '새 창', en: 'New Window' },
  newPage: { ko: '새 페이지', en: 'New Page' },
  closeTab: { ko: '탭 닫기', en: 'Close Tab' },
  closeWindow: { ko: '창 닫기', en: 'Close Window' },
  reopenTab: { ko: '마지막으로 닫은 탭 다시 열기', en: 'Reopen Last Closed Tab' },
  importMd: { ko: 'Markdown 가져오기…', en: 'Import Markdown…' },
  exportMd: { ko: '현재 페이지를 Markdown으로 내보내기…', en: 'Export Page as Markdown…' },
  backup: { ko: '워크스페이스 백업 내보내기…', en: 'Export Workspace Backup…' },
  restore: { ko: '백업에서 복원…', en: 'Restore from Backup…' },
  print: { ko: '인쇄…', en: 'Print…' },
  quit: { ko: '종료', en: 'Exit' },
  edit: { ko: '편집', en: 'Edit' },
  undo: { ko: '실행 취소', en: 'Undo' },
  redo: { ko: '다시 실행', en: 'Redo' },
  cut: { ko: '잘라내기', en: 'Cut' },
  copy: { ko: '복사', en: 'Copy' },
  paste: { ko: '붙여넣기', en: 'Paste' },
  pastePlain: { ko: '서식 없이 붙여넣기', en: 'Paste and Match Style' },
  selectAll: { ko: '모두 선택', en: 'Select All' },
  copyLink: { ko: '현재 페이지 링크 복사', en: 'Copy Link to Current Page' },
  copyTitle: { ko: '현재 페이지 이름 복사', en: 'Copy Name of Current Page' },
  search: { ko: '검색', en: 'Search' },
  view: { ko: '보기', en: 'View' },
  reload: { ko: '새로고침', en: 'Reload' },
  forceReload: { ko: '강제 새로고침', en: 'Force Reload' },
  sidebar: { ko: '사이드바 표시/숨기기', en: 'Show/Hide Sidebar' },
  actual: { ko: '실제 크기', en: 'Actual Size' },
  zoomIn: { ko: '확대', en: 'Zoom In' },
  zoomOut: { ko: '축소', en: 'Zoom Out' },
  fullscreen: { ko: '전체 화면 전환', en: 'Toggle Full Screen' },
  devtools: { ko: '개발자 도구', en: 'Toggle Developer Tools' },
  history: { ko: '기록', en: 'History' },
  back: { ko: '뒤로', en: 'Back' },
  forward: { ko: '앞으로', en: 'Forward' },
  window: { ko: '창', en: 'Window' },
  minimize: { ko: '최소화', en: 'Minimize' },
  nextTab: { ko: '다음 탭 보기', en: 'Show Next Tab' },
  prevTab: { ko: '이전 탭 보기', en: 'Show Previous Tab' },
  help: { ko: '도움말', en: 'Help' },
  settings: { ko: '설정…', en: 'Settings…' },
  showData: { ko: '데이터 폴더 열기', en: 'Show Data Folder' },
  reset: { ko: '모든 로컬 데이터 초기화 및 삭제', en: 'Reset & Erase All Local Data' },
  about: { ko: 'Noosion 정보', en: 'About Noosion' }
} satisfies Record<string, Record<Locale, string>>

export interface MenuActions {
  send(win: BrowserWindow | undefined, cmd: ShellCommand): void
  newWindow(): void
  importMarkdown(win: BrowserWindow | undefined): void
  exportBackup(win: BrowserWindow | undefined): void
  restoreBackup(win: BrowserWindow | undefined): void
  showDataFolder(): void
  resetData(win: BrowserWindow | undefined): void
  about(win: BrowserWindow | undefined): void
  quit(): void
}

export function buildMenu(locale: Locale, a: MenuActions): Menu {
  const t = (k: keyof typeof L) => L[k][locale]
  const cmd =
    (c: ShellCommand) =>
    (_: unknown, win: BaseWindow | undefined): void =>
      a.send(win as BrowserWindow | undefined, c)

  const template: MenuItemConstructorOptions[] = [
    {
      label: t('file'),
      submenu: [
        { label: t('newTab'), accelerator: 'CmdOrCtrl+T', click: cmd({ type: 'new-tab' }), registerAccelerator: false },
        { label: t('newWindow'), accelerator: 'CmdOrCtrl+Shift+N', click: () => a.newWindow() },
        { label: t('newPage'), accelerator: 'CmdOrCtrl+N', click: cmd({ type: 'new-page' }), registerAccelerator: false },
        { type: 'separator' },
        { label: t('closeTab'), accelerator: 'CmdOrCtrl+W', click: cmd({ type: 'close-tab' }), registerAccelerator: false },
        { label: t('closeWindow'), accelerator: 'CmdOrCtrl+Shift+W', role: 'close' },
        { label: t('reopenTab'), accelerator: 'CmdOrCtrl+Shift+T', click: cmd({ type: 'reopen-closed-tab' }), registerAccelerator: false },
        { type: 'separator' },
        { label: t('importMd'), click: (_, w) => a.importMarkdown(w as BrowserWindow) },
        { label: t('exportMd'), click: cmd({ type: 'export-markdown' }), registerAccelerator: false },
        { label: t('backup'), click: (_, w) => a.exportBackup(w as BrowserWindow) },
        { label: t('restore'), click: (_, w) => a.restoreBackup(w as BrowserWindow) },
        { type: 'separator' },
        { label: t('print'), accelerator: 'CmdOrCtrl+Shift+P', click: cmd({ type: 'print' }), registerAccelerator: false },
        { type: 'separator' },
        { label: t('settings'), accelerator: 'CmdOrCtrl+,', click: cmd({ type: 'open-settings' }), registerAccelerator: false },
        { label: t('quit'), accelerator: 'CmdOrCtrl+Q', click: () => a.quit() }
      ]
    },
    {
      label: t('edit'),
      submenu: [
        { label: t('undo'), accelerator: 'CmdOrCtrl+Z', click: cmd({ type: 'undo' }), registerAccelerator: false },
        { label: t('redo'), accelerator: 'CmdOrCtrl+Shift+Z', click: cmd({ type: 'redo' }), registerAccelerator: false },
        { type: 'separator' },
        { label: t('cut'), role: 'cut' },
        { label: t('copy'), role: 'copy' },
        { label: t('paste'), role: 'paste' },
        { label: t('pastePlain'), accelerator: 'CmdOrCtrl+Shift+V', role: 'pasteAndMatchStyle' },
        { label: t('selectAll'), role: 'selectAll' },
        { type: 'separator' },
        { label: t('copyLink'), accelerator: 'CmdOrCtrl+L', click: cmd({ type: 'copy-link' }), registerAccelerator: false },
        { label: t('copyTitle'), accelerator: 'CmdOrCtrl+Alt+L', click: cmd({ type: 'copy-title' }), registerAccelerator: false },
        { label: t('search'), accelerator: 'CmdOrCtrl+P', click: cmd({ type: 'quick-search' }), registerAccelerator: false }
      ]
    },
    {
      label: t('view'),
      submenu: [
        { label: t('reload'), accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: t('forceReload'), accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { label: t('sidebar'), accelerator: 'CmdOrCtrl+\\', click: cmd({ type: 'toggle-sidebar' }), registerAccelerator: false },
        { type: 'separator' },
        { label: t('actual'), accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: t('zoomIn'), accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: t('zoomIn'), accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn', visible: false },
        { label: t('zoomOut'), accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: t('fullscreen'), role: 'togglefullscreen' },
        { label: t('devtools'), accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' }
      ]
    },
    {
      label: t('history'),
      submenu: [
        { label: t('back'), accelerator: 'CmdOrCtrl+[', click: cmd({ type: 'back' }), registerAccelerator: false },
        { label: t('forward'), accelerator: 'CmdOrCtrl+]', click: cmd({ type: 'forward' }), registerAccelerator: false },
      ]
    },
    {
      label: t('window'),
      submenu: [
        { label: t('minimize'), role: 'minimize' },
        { label: t('nextTab'), accelerator: 'Ctrl+Tab', click: cmd({ type: 'next-tab' }), registerAccelerator: false },
        { label: t('prevTab'), accelerator: 'Ctrl+Shift+Tab', click: cmd({ type: 'prev-tab' }), registerAccelerator: false }
      ]
    },
    {
      label: t('help'),
      submenu: [
        { label: t('showData'), click: () => a.showDataFolder() },
        { label: t('reset'), click: (_, w) => a.resetData(w as BrowserWindow) },
        { type: 'separator' },
        { label: t('about'), click: (_, w) => a.about(w as BrowserWindow) }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}
