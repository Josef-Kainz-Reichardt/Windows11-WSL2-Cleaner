import { randomUUID } from 'node:crypto'
import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '@shared/types'
import type { RancherAction, RancherConfirmAnswer, RancherConfirmRequest } from '@shared/types'

const pending = new Map<string, (proceed: boolean) => void>()

/** Remembered answer per action for the rest of this run (reset on every app start = "current session"). */
const sessionDecision: Partial<Record<RancherAction, boolean>> = {}

export function registerRancherConfirmHandler(): void {
  ipcMain.handle(IPC.rancherConfirmAnswer, (_event, answer: RancherConfirmAnswer) => {
    if (answer.suppressSession) sessionDecision[answer.action] = answer.proceed
    const resolve = pending.get(answer.requestId)
    if (resolve) {
      pending.delete(answer.requestId)
      resolve(answer.proceed)
    }
    return { ok: true }
  })
}

/**
 * Asks the user (via the renderer) whether Rancher Desktop may be started/stopped now.
 * Skips the round-trip once the user has suppressed this action for the session.
 */
export async function confirmRancherAction(action: RancherAction, reason: string): Promise<boolean> {
  if (action in sessionDecision) return sessionDecision[action]!

  const windows = BrowserWindow.getAllWindows()
  if (windows.length === 0) return true // headless/no UI to ask — don't block

  const requestId = randomUUID()
  const answered = new Promise<boolean>((resolve) => pending.set(requestId, resolve))
  const request: RancherConfirmRequest = { requestId, action, reason }
  for (const win of windows) win.webContents.send(IPC.eventRancherConfirmRequest, request)
  return answered
}
