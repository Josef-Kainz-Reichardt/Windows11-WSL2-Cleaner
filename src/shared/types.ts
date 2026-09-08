// Shared type-only contracts between main, preload and renderer.
// No runtime dependencies here (no zod etc.) so this stays safe to import from the renderer bundle.

export type CheckCategory =
  | 'wsl-build-artifacts'
  | 'wsl-package-caches'
  | 'wsl-system-sudo'
  | 'docker'
  | 'windows-cache'
  | 'windows-system'
  | 'vhdx-compaction'

export type CheckPlatform = 'windows' | 'wsl'

export interface CheckDefinition {
  id: string
  name: string
  category: CheckCategory
  platform: CheckPlatform
  requiresSudo: boolean
  requiresRancherRunning?: boolean
  requiresWslShutdown?: boolean
  /** Destructive-enough that clean() asks for an extra explicit confirmation
   * beyond the normal enabled-checkbox (see checks/windows/installerCleanup/confirm.ts). */
  requiresConfirmation?: boolean
  description: string
  /** cleaner.sh case-statement id, when it differs from `id` — lets several
   * CheckDefinitions (e.g. one per WSL distro) share the same script behavior
   * while keeping app-level ids unique. Defaults to `id` when unset. */
  scriptId?: string
}

export interface ScanResult {
  checkId: string
  /** null = not estimable ahead of time (e.g. DISM component cleanup) */
  bytesReclaimable: number | null
  itemCount?: number
  details?: string
  scannedAt: number
  error?: string
}

export interface CleanResult {
  checkId: string
  bytesFreed: number
  dryRun: boolean
  log: string[]
  error?: string
}

export type CheckStatus = 'unknown' | 'scanning' | 'scanned' | 'running' | 'done' | 'error' | 'skipped'

export interface CheckRuntimeState {
  checkId: string
  status: CheckStatus
  lastScan?: ScanResult
  lastClean?: CleanResult
}

export interface WslDistroInfo {
  name: string
  isDefault: boolean
  wslVersion: 1 | 2
  state: string
  /** Whether `bash` actually runs in this distro. False for Rancher Desktop's
   * internal utility VMs (e.g. "rancher-desktop-data"), which are minimal and
   * often can't exec bash — bash-script-based checks must skip those. */
  bashCapable: boolean
}

export interface VhdxInfo {
  label: string
  path: string
}

export interface MachineProfile {
  wslDistros: WslDistroInfo[]
  defaultLinuxUser: Record<string, string>
  projectRoots: string[]
  rancherDesktop: { installed: boolean; rdctlPath?: string }
  vhdxPaths: VhdxInfo[]
  adobeTempPath?: string
  thunderbirdProfilesPath?: string
  jetbrainsWindowsCachePath?: string
  uvCacheWindowsPath?: string
  detectedAt: number
}

export interface DiskOverviewCategory {
  key: string
  label: string
  bytes: number
  color?: string
  children?: DiskOverviewCategory[]
}

export interface DiskOverview {
  driveLetter: string
  totalBytes: number
  usedBytes: number
  freeBytes: number
  categories: DiskOverviewCategory[]
  /** Every direct child of the drive root with its recursive size — the flat
   * listing shown by the folder explorer, computed as part of the same scan
   * (reusing totals already measured for the categories above) so it's
   * available immediately, without a separate on-demand step. */
  rootFolders: DiskOverviewCategory[]
  computedAt: number
}

export interface RunOptions {
  dryRun: boolean
}

/** User-configurable app settings, persisted in config store (not the sudo password). */
export interface AppSettings {
  /** Extra top-level folder names under $HOME to scan for build artifacts, on top of the built-in defaults. */
  extraProjectRootNames: string[]
  /** Check ids excluded from "Alles bereinigen" (still scannable/cleanable individually). */
  disabledCheckIds: string[]
  /** Where orphaned Windows Installer cache files get zipped before deletion. Must be set
   * before "win-installer-orphans" can actually clean (scanning works without it). */
  installerQuarantineDir: string | null
  /** Age (days) after which a quarantine ZIP is considered safe to delete. */
  installerQuarantineRetentionDays: number
  /** If true, "win-installer-quarantine-purge" runs as part of "Alles bereinigen";
   * otherwise it only runs when triggered individually ("jetzt löschen"). */
  installerQuarantineAutoDelete: boolean
}

export interface LogEvent {
  checkId: string
  level: 'info' | 'warn' | 'error'
  message: string
  at: number
}

export interface ProgressEvent {
  checkId: string
  status: CheckStatus
  message?: string
}

export interface RancherStatusEvent {
  state: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
  message?: string
}

export type RancherAction = 'start' | 'stop'

/** Sent main -> renderer before actually starting/stopping Rancher Desktop, so the user can confirm. */
export interface RancherConfirmRequest {
  requestId: string
  action: RancherAction
  reason: string
}

/** Sent renderer -> main in response to a RancherConfirmRequest. */
export interface RancherConfirmAnswer {
  requestId: string
  action: RancherAction
  proceed: boolean
  /** If true, this answer is remembered for every further request of the same action for the rest of this run. */
  suppressSession: boolean
}

/** Sent main -> renderer before actually zipping+deleting orphaned Installer cache
 * files, so the user can confirm. Unlike Rancher's confirm this defaults to NOT
 * proceeding when there's no window to ask (headless) — this action is harder to
 * reason your way out of than starting/stopping Rancher. */
export interface InstallerConfirmRequest {
  requestId: string
  reason: string
  fileCount: number
  bytes: number
}

/** Sent renderer -> main in response to an InstallerConfirmRequest. */
export interface InstallerConfirmAnswer {
  requestId: string
  proceed: boolean
  /** If true, remembered for every further request for the rest of this run. */
  suppressSession: boolean
}

export interface DismProgressEvent {
  percent: number
}

export interface DiskOverviewProgressEvent {
  completed: number
  total: number
  /** What's being measured right now, e.g. "Windows\WinSxS". */
  label: string
}

export interface SudoPasswordResult {
  ok: boolean
  error?: string
}

export interface UpdateCheckResult {
  status: 'update-available' | 'up-to-date' | 'error'
  version?: string
  error?: string
}

export interface UpdateDownloadedEvent {
  version: string
}

/** Shape of the `window.api` bridge exposed by preload/index.ts via contextBridge. */
export interface ApiBridge {
  app: {
    getVersion(): Promise<string>
  }
  updates: {
    check(): Promise<UpdateCheckResult>
    /** Quits and installs an already-downloaded update (see events.onUpdateDownloaded). */
    install(): Promise<void>
  }
  checks: {
    list(): Promise<CheckDefinition[]>
    scan(checkId: string): Promise<ScanResult>
    clean(checkId: string, opts: RunOptions): Promise<CleanResult>
    scanAll(): Promise<ScanResult[]>
    cleanAll(opts: RunOptions): Promise<CleanResult[]>
  }
  disk: {
    getOverview(): Promise<DiskOverview | null>
    refreshOverview(): Promise<DiskOverview>
    /** On-demand drill-down: sizes every child of the given folder path. Pass
     * the drive root (e.g. "C:\\") to start exploring. */
    listFolderChildren(path: string): Promise<DiskOverviewCategory[]>
  }
  rancher: {
    confirmAnswer(answer: RancherConfirmAnswer): Promise<{ ok: boolean }>
  }
  installerCleanup: {
    confirmAnswer(answer: InstallerConfirmAnswer): Promise<{ ok: boolean }>
  }
  profile: {
    get(): Promise<MachineProfile>
    refresh(): Promise<MachineProfile>
  }
  settings: {
    get(): Promise<AppSettings>
    setExtraProjectRootNames(names: string[]): Promise<AppSettings>
    setCheckDisabled(checkId: string, disabled: boolean): Promise<AppSettings>
    setCategoryDisabled(category: CheckCategory, disabled: boolean): Promise<AppSettings>
    /** Opens a native folder-picker; returns null if the user cancels. */
    pickInstallerQuarantineDir(): Promise<string | null>
    setInstallerQuarantineDir(dir: string | null): Promise<AppSettings>
    setInstallerQuarantineRetentionDays(days: number): Promise<AppSettings>
    setInstallerQuarantineAutoDelete(enabled: boolean): Promise<AppSettings>
  }
  secrets: {
    setSudoPassword(password: string): Promise<{ ok: boolean }>
    hasSudoPassword(): Promise<boolean>
    clearSudoPassword(): Promise<{ ok: boolean }>
  }
  report: {
    /** Opens a native "Save as" dialog and writes `content` to the chosen path. */
    saveToFile(content: string, suggestedName: string): Promise<{ ok: boolean; path?: string; error?: string }>
  }
  events: {
    onCheckLog(cb: (e: LogEvent) => void): () => void
    onCheckStatus(cb: (e: ProgressEvent) => void): () => void
    onRancherStatus(cb: (e: RancherStatusEvent) => void): () => void
    onRancherConfirmRequest(cb: (e: RancherConfirmRequest) => void): () => void
    onInstallerConfirmRequest(cb: (e: InstallerConfirmRequest) => void): () => void
    onDismProgress(cb: (e: DismProgressEvent) => void): () => void
    onDiskOverviewProgress(cb: (e: DiskOverviewProgressEvent) => void): () => void
    onUpdateDownloaded(cb: (e: UpdateDownloadedEvent) => void): () => void
  }
}

/** IPC channel name constants shared by main (handlers) and preload (bridge). */
export const IPC = {
  appGetVersion: 'app:getVersion',
  updatesCheckForUpdates: 'updates:checkForUpdates',
  updatesInstall: 'updates:install',
  checksList: 'checks:list',
  checksScan: 'checks:scan',
  checksClean: 'checks:clean',
  checksScanAll: 'checks:scanAll',
  checksCleanAll: 'checks:cleanAll',
  diskGetOverview: 'disk:getOverview',
  diskRefreshOverview: 'disk:refreshOverview',
  diskListFolderChildren: 'disk:listFolderChildren',
  profileGet: 'profile:get',
  profileRefresh: 'profile:refresh',
  settingsGet: 'settings:get',
  settingsSetExtraProjectRootNames: 'settings:setExtraProjectRootNames',
  settingsSetCheckDisabled: 'settings:setCheckDisabled',
  settingsSetCategoryDisabled: 'settings:setCategoryDisabled',
  settingsPickInstallerQuarantineDir: 'settings:pickInstallerQuarantineDir',
  settingsSetInstallerQuarantineDir: 'settings:setInstallerQuarantineDir',
  settingsSetInstallerQuarantineRetentionDays: 'settings:setInstallerQuarantineRetentionDays',
  settingsSetInstallerQuarantineAutoDelete: 'settings:setInstallerQuarantineAutoDelete',
  secretsSetSudoPassword: 'secrets:setSudoPassword',
  secretsHasSudoPassword: 'secrets:hasSudoPassword',
  secretsClearSudoPassword: 'secrets:clearSudoPassword',
  reportSaveToFile: 'report:saveToFile',
  rancherConfirmAnswer: 'rancher:confirmAnswer',
  installerCleanupConfirmAnswer: 'installerCleanup:confirmAnswer',
  // events (main -> renderer)
  eventChecksStatusChanged: 'checks:statusChanged',
  eventChecksLog: 'checks:log',
  eventRancherStatusChanged: 'rancher:statusChanged',
  eventRancherConfirmRequest: 'rancher:confirmRequest',
  eventInstallerConfirmRequest: 'installerCleanup:confirmRequest',
  eventDismProgress: 'dism:progress',
  eventDiskOverviewProgress: 'disk:overviewProgress',
  eventUpdateDownloaded: 'updates:downloaded'
} as const
