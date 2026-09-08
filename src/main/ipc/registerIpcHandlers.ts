import { ipcMain, BrowserWindow, dialog, app } from 'electron'
import fs from 'node:fs'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/types'
import type {
  RunOptions,
  DismProgressEvent,
  RancherStatusEvent,
  LogEvent,
  ProgressEvent,
  CheckCategory,
  UpdateDownloadedEvent
} from '@shared/types'
import type { CheckContext, LogSink } from '@main/checks/types'
import { safeScan, safeClean } from '@main/checks/safeRun'
import {
  getChecks,
  findCheck,
  buildCheckContext,
  refreshProfile,
  getProfile,
  getScanResults,
  recordScanResult,
  setStatus,
  getSettings,
  setExtraProjectRootNames,
  setCheckDisabled,
  setCategoryDisabled,
  setInstallerQuarantineDir,
  setInstallerQuarantineRetentionDays,
  setInstallerQuarantineAutoDelete
} from '@main/state/appState'
import { buildDiskOverview } from '@main/diskOverview/buildOverview'
import { listFolderChildren } from '@main/diskOverview/analyzeOther'
import { getStoredDiskOverview, setStoredDiskOverview } from '@main/config/store'
import { setSudoPassword, hasSudoPassword, clearSudoPassword } from '@main/secrets/sudoPassword'
import { runCleanAll } from '@main/orchestrator/cleanAll'
import { startRancherDesktop } from '@main/rancherDesktop/rdctl'
import { appEvents, EVENTS, emitCheckLog, emitCheckStatus } from '@main/events/bus'
import { checkForUpdatesManually } from '@main/updater/checkForUpdates'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function logSinkFor(checkId: string): LogSink {
  return (level, message) => emitCheckLog({ checkId, level, message, at: Date.now() })
}

/** Auto-starts Rancher Desktop first if this check needs it and it isn't up yet (asks for confirmation, see rancherDesktop/confirm.ts). */
async function ensureRancherIfNeeded(requiresRancherRunning: boolean | undefined, ctx: CheckContext): Promise<void> {
  if (!requiresRancherRunning || !ctx.wslDistro || !ctx.wslUser) return
  await startRancherDesktop(ctx.profile, ctx.wslDistro, ctx.wslUser, 180_000)
}

export function registerIpcHandlers(): void {
  appEvents.on(EVENTS.dismProgress, (p: DismProgressEvent) => broadcast(IPC.eventDismProgress, p))
  appEvents.on(EVENTS.rancherStatus, (p: RancherStatusEvent) => broadcast(IPC.eventRancherStatusChanged, p))
  appEvents.on(EVENTS.checkLog, (p: LogEvent) => broadcast(IPC.eventChecksLog, p))
  appEvents.on(EVENTS.checkStatus, (p: ProgressEvent) => broadcast(IPC.eventChecksStatusChanged, p))
  appEvents.on(EVENTS.updateDownloaded, (p: UpdateDownloadedEvent) => broadcast(IPC.eventUpdateDownloaded, p))

  ipcMain.handle(IPC.checksList, () => getChecks().map((c) => c.definition))

  ipcMain.handle(IPC.checksScan, async (_event, checkId: string) => {
    const entry = findCheck(checkId)
    if (!entry) throw new Error(`unknown check: ${checkId}`)
    setStatus(checkId, 'scanning')
    emitCheckStatus({ checkId, status: 'scanning' })
    const ctx = buildCheckContext()
    await ensureRancherIfNeeded(entry.definition.requiresRancherRunning, ctx)
    const result = await safeScan(entry, ctx, logSinkFor(checkId))
    recordScanResult(result)
    const status = result.error ? 'error' : 'scanned'
    setStatus(checkId, status)
    emitCheckStatus({ checkId, status })
    return result
  })

  ipcMain.handle(IPC.checksClean, async (_event, checkId: string, opts: RunOptions) => {
    const entry = findCheck(checkId)
    if (!entry) throw new Error(`unknown check: ${checkId}`)
    setStatus(checkId, 'running')
    emitCheckStatus({ checkId, status: 'running' })
    const ctx = buildCheckContext()
    await ensureRancherIfNeeded(entry.definition.requiresRancherRunning, ctx)
    const result = await safeClean(entry, ctx, opts, logSinkFor(checkId))
    const status = result.error ? 'error' : 'done'
    setStatus(checkId, status)
    emitCheckStatus({ checkId, status })
    return result
  })

  ipcMain.handle(IPC.checksScanAll, async () => {
    const results = []
    for (const entry of getChecks()) {
      const checkId = entry.definition.id
      setStatus(checkId, 'scanning')
      emitCheckStatus({ checkId, status: 'scanning' })
      const ctx = buildCheckContext()
      await ensureRancherIfNeeded(entry.definition.requiresRancherRunning, ctx)
      const result = await safeScan(entry, ctx, logSinkFor(checkId))
      recordScanResult(result)
      const status = result.error ? 'error' : 'scanned'
      setStatus(checkId, status)
      emitCheckStatus({ checkId, status })
      results.push(result)
    }
    return results
  })

  ipcMain.handle(IPC.checksCleanAll, async (_event, opts: RunOptions) => {
    return runCleanAll(
      opts,
      (checkId, level, message) => emitCheckLog({ checkId, level, message, at: Date.now() }),
      (checkId, status) => {
        setStatus(checkId, status)
        emitCheckStatus({ checkId, status })
      }
    )
  })

  ipcMain.handle(IPC.diskGetOverview, () => getStoredDiskOverview())

  ipcMain.handle(IPC.diskRefreshOverview, async () => {
    const overview = await buildDiskOverview(getProfile(), getChecks(), getScanResults(), 'C:', (completed, total, label) => {
      broadcast(IPC.eventDiskOverviewProgress, { completed, total, label })
    })
    setStoredDiskOverview(overview)
    return overview
  })

  ipcMain.handle(IPC.diskListFolderChildren, (_event, path: string) => listFolderChildren(path))

  ipcMain.handle(IPC.profileGet, () => getProfile())
  ipcMain.handle(IPC.profileRefresh, () => refreshProfile())

  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSetExtraProjectRootNames, (_event, names: string[]) => setExtraProjectRootNames(names))
  ipcMain.handle(IPC.settingsSetCheckDisabled, (_event, checkId: string, disabled: boolean) =>
    setCheckDisabled(checkId, disabled)
  )
  ipcMain.handle(IPC.settingsSetCategoryDisabled, (_event, category: CheckCategory, disabled: boolean) =>
    setCategoryDisabled(category, disabled)
  )
  ipcMain.handle(IPC.settingsPickInstallerQuarantineDir, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    return canceled || filePaths.length === 0 ? null : filePaths[0]
  })
  ipcMain.handle(IPC.settingsSetInstallerQuarantineDir, (_event, dir: string | null) => setInstallerQuarantineDir(dir))
  ipcMain.handle(IPC.settingsSetInstallerQuarantineRetentionDays, (_event, days: number) =>
    setInstallerQuarantineRetentionDays(days)
  )
  ipcMain.handle(IPC.settingsSetInstallerQuarantineAutoDelete, (_event, enabled: boolean) =>
    setInstallerQuarantineAutoDelete(enabled)
  )

  ipcMain.handle(IPC.reportSaveToFile, async (event, content: string, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.SaveDialogOptions = {
      defaultPath: suggestedName,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Textdatei', extensions: ['txt'] }
      ]
    }
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)
    if (canceled || !filePath) return { ok: false }
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { ok: true, path: filePath }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.secretsSetSudoPassword, (_event, password: string) => {
    setSudoPassword(password)
    return { ok: true }
  })
  ipcMain.handle(IPC.secretsHasSudoPassword, () => hasSudoPassword())
  ipcMain.handle(IPC.secretsClearSudoPassword, () => {
    clearSudoPassword()
    return { ok: true }
  })

  ipcMain.handle(IPC.appGetVersion, () => app.getVersion())
  ipcMain.handle(IPC.updatesCheckForUpdates, () => checkForUpdatesManually())
  ipcMain.handle(IPC.updatesInstall, () => {
    autoUpdater.quitAndInstall()
  })
}
