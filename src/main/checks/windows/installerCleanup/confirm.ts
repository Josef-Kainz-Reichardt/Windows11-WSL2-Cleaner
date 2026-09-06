import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/types'
import type { InstallerConfirmAnswer, InstallerConfirmRequest } from '@shared/types'

const pending = new Map<string, (proceed: boolean) => void>()
let suppressedForSession = false

export function registerInstallerConfirmHandler(): void {
  ipcMain.handle(IPC.installerCleanupConfirmAnswer, (_event, answer: InstallerConfirmAnswer) => {
    if (answer.suppressSession) suppressedForSession = true
    const resolve = pending.get(answer.requestId)
    if (resolve) {
      pending.delete(answer.requestId)
      resolve(answer.proceed)
    }
    return { ok: true }
  })
}

/**
 * Asks the user (via the renderer) whether orphaned Installer cache files may be
 * zipped and deleted now. Unlike confirmRancherAction, a headless run (no window
 * to ask) defaults to NOT proceeding — this touches live Windows Installer state
 * for potentially unrelated software, so silence should mean "don't", not "do".
 */
export async function confirmInstallerCleanup(reason: string, fileCount: number, bytes: number): Promise<boolean> {
  if (suppressedForSession) return true

  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return false

  const requestId = randomUUID()
  const answered = new Promise<boolean>((resolve) => pending.set(requestId, resolve))
  const request: InstallerConfirmRequest = { requestId, reason, fileCount, bytes }
  for (const win of windows) win.webContents.send(IPC.eventInstallerConfirmRequest, request)
  return answered
}
