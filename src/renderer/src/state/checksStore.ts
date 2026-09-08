import { create } from 'zustand'
import type {
  AppSettings,
  CheckCategory,
  CheckDefinition,
  CheckStatus,
  ScanResult,
  CleanResult,
  UpdateCheckResult
} from '@shared/types'
import { api } from '../api/rendererApi'

interface ChecksState {
  definitions: CheckDefinition[]
  statuses: Record<string, CheckStatus>
  scanResults: Record<string, ScanResult>
  cleanResults: Record<string, CleanResult>
  logs: Record<string, string[]>
  running: boolean
  hasSudoPassword: boolean
  settings: AppSettings
  appVersion: string
  updateChecking: boolean
  updateCheckResult: UpdateCheckResult | null
  /** Version of an update that finished downloading and is ready to install, if any. */
  updateReadyVersion: string | null

  load(): Promise<void>
  checkForUpdates(): Promise<void>
  installUpdate(): Promise<void>
  scanOne(checkId: string): Promise<void>
  cleanOne(checkId: string): Promise<void>
  scanAll(): Promise<void>
  cleanAll(): Promise<void>
  refreshHasSudoPassword(): Promise<void>
  setCheckDisabled(checkId: string, disabled: boolean): Promise<void>
  setCategoryDisabled(category: CheckCategory, disabled: boolean): Promise<void>
  setExtraProjectRootNames(names: string[]): Promise<void>
  pickInstallerQuarantineDir(): Promise<string | null>
  setInstallerQuarantineDir(dir: string | null): Promise<void>
  setInstallerQuarantineRetentionDays(days: number): Promise<void>
  setInstallerQuarantineAutoDelete(enabled: boolean): Promise<void>
}

function appendLog(state: ChecksState, checkId: string, line: string): Record<string, string[]> {
  const existing = state.logs[checkId] ?? []
  return { ...state.logs, [checkId]: [...existing.slice(-199), line] }
}

export const useChecksStore = create<ChecksState>((set, get) => ({
  definitions: [],
  statuses: {},
  scanResults: {},
  cleanResults: {},
  logs: {},
  running: false,
  hasSudoPassword: false,
  settings: {
    extraProjectRootNames: [],
    disabledCheckIds: [],
    installerQuarantineDir: null,
    installerQuarantineRetentionDays: 30,
    installerQuarantineAutoDelete: false
  },
  appVersion: '',
  updateChecking: false,
  updateCheckResult: null,
  updateReadyVersion: null,

  async load() {
    const [definitions, settings, appVersion] = await Promise.all([
      api.checks.list(),
      api.settings.get(),
      api.app.getVersion()
    ])
    set({ definitions, settings, appVersion })
    await get().refreshHasSudoPassword()

    api.events.onCheckStatus(({ checkId, status }) => {
      set((s) => ({ statuses: { ...s.statuses, [checkId]: status } }))
    })
    api.events.onCheckLog(({ checkId, level, message }) => {
      set((s) => ({ logs: appendLog(s, checkId, `[${level}] ${message}`) }))
    })
    api.events.onUpdateDownloaded(({ version }) => {
      set({ updateReadyVersion: version })
    })
  },

  async scanOne(checkId) {
    const result = await api.checks.scan(checkId)
    set((s) => ({ scanResults: { ...s.scanResults, [checkId]: result } }))
  },

  async cleanOne(checkId) {
    set({ running: true })
    try {
      const result = await api.checks.clean(checkId, { dryRun: false })
      set((s) => ({ cleanResults: { ...s.cleanResults, [checkId]: result } }))
      // Re-scan just this one check so its byte estimate (and the "insgesamt
      // bereinigbar" total, which reads scanResults) reflects what's actually
      // left — a full scanAll()/refreshOverview() here would re-measure every
      // other check/the whole drive for no reason.
      const scanResult = await api.checks.scan(checkId)
      set((s) => ({ scanResults: { ...s.scanResults, [checkId]: scanResult } }))
    } finally {
      set({ running: false })
    }
  },

  async scanAll() {
    set((s) => ({
      running: true,
      statuses: Object.fromEntries(s.definitions.map((d) => [d.id, 'unknown' as CheckStatus]))
    }))
    try {
      const results = await api.checks.scanAll()
      set((s) => {
        const scanResults = { ...s.scanResults }
        for (const r of results) scanResults[r.checkId] = r
        return { scanResults }
      })
    } finally {
      set({ running: false })
    }
  },

  async cleanAll() {
    set((s) => ({
      running: true,
      statuses: Object.fromEntries(s.definitions.map((d) => [d.id, 'unknown' as CheckStatus]))
    }))
    try {
      const results = await api.checks.cleanAll({ dryRun: false })
      set((s) => {
        const cleanResults = { ...s.cleanResults }
        for (const r of results) cleanResults[r.checkId] = r
        return { cleanResults }
      })
      // Batch-clean just touched every enabled check — re-scan all of them so
      // scanResults (and the "insgesamt bereinigbar" total, which reads
      // scanResults, not cleanResults) reflect what's actually left instead
      // of the stale pre-clean estimates.
      await get().scanAll()
    } finally {
      set({ running: false })
    }
  },

  async refreshHasSudoPassword() {
    const has = await api.secrets.hasSudoPassword()
    set({ hasSudoPassword: has })
  },

  async checkForUpdates() {
    set({ updateChecking: true, updateCheckResult: null })
    try {
      const result = await api.updates.check()
      set({ updateCheckResult: result })
    } finally {
      set({ updateChecking: false })
    }
  },

  async installUpdate() {
    await api.updates.install()
  },

  async setCheckDisabled(checkId, disabled) {
    const settings = await api.settings.setCheckDisabled(checkId, disabled)
    set({ settings })
  },

  async setCategoryDisabled(category, disabled) {
    const settings = await api.settings.setCategoryDisabled(category, disabled)
    set({ settings })
  },

  async setExtraProjectRootNames(names) {
    const settings = await api.settings.setExtraProjectRootNames(names)
    set({ settings })
  },

  async pickInstallerQuarantineDir() {
    return api.settings.pickInstallerQuarantineDir()
  },

  async setInstallerQuarantineDir(dir) {
    const settings = await api.settings.setInstallerQuarantineDir(dir)
    set({ settings })
  },

  async setInstallerQuarantineRetentionDays(days) {
    const settings = await api.settings.setInstallerQuarantineRetentionDays(days)
    set({ settings })
  },

  async setInstallerQuarantineAutoDelete(enabled) {
    const settings = await api.settings.setInstallerQuarantineAutoDelete(enabled)
    set({ settings })
  }
}))
