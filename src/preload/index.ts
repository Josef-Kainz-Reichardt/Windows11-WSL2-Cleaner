import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type {
  CheckDefinition,
  CheckCategory,
  ScanResult,
  CleanResult,
  RunOptions,
  MachineProfile,
  DiskOverview,
  AppSettings,
  LogEvent,
  ProgressEvent,
  RancherStatusEvent,
  RancherConfirmRequest,
  RancherConfirmAnswer,
  InstallerConfirmRequest,
  InstallerConfirmAnswer,
  DismProgressEvent,
  DiskOverviewCategory,
  DiskOverviewProgressEvent,
  ApiBridge
} from '@shared/types'

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: ApiBridge = {
  checks: {
    list: (): Promise<CheckDefinition[]> => ipcRenderer.invoke(IPC.checksList),
    scan: (checkId: string): Promise<ScanResult> => ipcRenderer.invoke(IPC.checksScan, checkId),
    clean: (checkId: string, opts: RunOptions): Promise<CleanResult> => ipcRenderer.invoke(IPC.checksClean, checkId, opts),
    scanAll: (): Promise<ScanResult[]> => ipcRenderer.invoke(IPC.checksScanAll),
    cleanAll: (opts: RunOptions): Promise<CleanResult[]> => ipcRenderer.invoke(IPC.checksCleanAll, opts)
  },
  disk: {
    getOverview: (): Promise<DiskOverview | null> => ipcRenderer.invoke(IPC.diskGetOverview),
    refreshOverview: (): Promise<DiskOverview> => ipcRenderer.invoke(IPC.diskRefreshOverview),
    listFolderChildren: (path: string): Promise<DiskOverviewCategory[]> =>
      ipcRenderer.invoke(IPC.diskListFolderChildren, path)
  },
  profile: {
    get: (): Promise<MachineProfile> => ipcRenderer.invoke(IPC.profileGet),
    refresh: (): Promise<MachineProfile> => ipcRenderer.invoke(IPC.profileRefresh)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    setExtraProjectRootNames: (names: string[]): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSetExtraProjectRootNames, names),
    setCheckDisabled: (checkId: string, disabled: boolean): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSetCheckDisabled, checkId, disabled),
    setCategoryDisabled: (category: CheckCategory, disabled: boolean): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSetCategoryDisabled, category, disabled),
    pickInstallerQuarantineDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.settingsPickInstallerQuarantineDir),
    setInstallerQuarantineDir: (dir: string | null): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSetInstallerQuarantineDir, dir),
    setInstallerQuarantineRetentionDays: (days: number): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSetInstallerQuarantineRetentionDays, days),
    setInstallerQuarantineAutoDelete: (enabled: boolean): Promise<AppSettings> =>
      ipcRenderer.invoke(IPC.settingsSetInstallerQuarantineAutoDelete, enabled)
  },
  secrets: {
    setSudoPassword: (password: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.secretsSetSudoPassword, password),
    hasSudoPassword: (): Promise<boolean> => ipcRenderer.invoke(IPC.secretsHasSudoPassword),
    clearSudoPassword: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.secretsClearSudoPassword)
  },
  report: {
    saveToFile: (content: string, suggestedName: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.reportSaveToFile, content, suggestedName)
  },
  rancher: {
    confirmAnswer: (answer: RancherConfirmAnswer): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.rancherConfirmAnswer, answer)
  },
  installerCleanup: {
    confirmAnswer: (answer: InstallerConfirmAnswer): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.installerCleanupConfirmAnswer, answer)
  },
  events: {
    onCheckLog: (cb: (e: LogEvent) => void): (() => void) => on(IPC.eventChecksLog, cb),
    onCheckStatus: (cb: (e: ProgressEvent) => void): (() => void) => on(IPC.eventChecksStatusChanged, cb),
    onRancherStatus: (cb: (e: RancherStatusEvent) => void): (() => void) => on(IPC.eventRancherStatusChanged, cb),
    onRancherConfirmRequest: (cb: (e: RancherConfirmRequest) => void): (() => void) =>
      on(IPC.eventRancherConfirmRequest, cb),
    onInstallerConfirmRequest: (cb: (e: InstallerConfirmRequest) => void): (() => void) =>
      on(IPC.eventInstallerConfirmRequest, cb),
    onDismProgress: (cb: (e: DismProgressEvent) => void): (() => void) => on(IPC.eventDismProgress, cb),
    onDiskOverviewProgress: (cb: (e: DiskOverviewProgressEvent) => void): (() => void) =>
      on(IPC.eventDiskOverviewProgress, cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
