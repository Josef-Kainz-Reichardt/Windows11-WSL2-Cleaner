import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from 'electron-log/main'
import type { UpdateCheckResult } from '@shared/types'

/** Manual "check for updates" trigger (Settings button), distinct from the
 * silent checkForUpdatesAndNotify() call on app start — this one resolves
 * with a result so the UI can show it inline instead of relying on the OS
 * notification. */
export async function checkForUpdatesManually(): Promise<UpdateCheckResult> {
  if (!app.isPackaged) {
    return { status: 'error', error: 'Nur in der installierten Version verfügbar' }
  }

  autoUpdater.logger = log

  return new Promise((resolve) => {
    const cleanup = (): void => {
      autoUpdater.removeListener('update-available', onAvailable)
      autoUpdater.removeListener('update-not-available', onNotAvailable)
      autoUpdater.removeListener('error', onError)
    }
    const onAvailable = (info: { version: string }): void => {
      cleanup()
      resolve({ status: 'update-available', version: info.version })
    }
    const onNotAvailable = (): void => {
      cleanup()
      resolve({ status: 'up-to-date' })
    }
    const onError = (err: Error): void => {
      cleanup()
      resolve({ status: 'error', error: err.message })
    }

    autoUpdater.once('update-available', onAvailable)
    autoUpdater.once('update-not-available', onNotAvailable)
    autoUpdater.once('error', onError)

    autoUpdater.checkForUpdates().catch((err) => {
      cleanup()
      resolve({ status: 'error', error: (err as Error).message })
    })
  })
}
