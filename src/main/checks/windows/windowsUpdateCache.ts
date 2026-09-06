import fs from 'node:fs'
import type { CheckEntry } from '../types'
import { folderSizeBytes, clearFolderContents } from './folderSize'
import { runPowerShell } from '@main/util/powershell'

const TARGET = 'C:\\Windows\\SoftwareDistribution\\Download'

const DEFINITION = {
  id: 'win-update-cache',
  name: 'Windows Update Cache',
  category: 'windows-system' as const,
  platform: 'windows' as const,
  requiresSudo: false,
  description:
    'SoftwareDistribution\\Download: zwischengespeicherte Update-Downloads. Wird von Windows Update bei Bedarf automatisch neu befüllt. wuauserv/bits werden für den Löschvorgang kurz gestoppt und danach wieder gestartet.'
}

export const winUpdateCacheCheck: CheckEntry = {
  definition: DEFINITION,
  isApplicable: () => fs.existsSync(TARGET),
  handlers: {
    async scan() {
      const bytes = await folderSizeBytes(TARGET)
      return { checkId: DEFINITION.id, bytesReclaimable: bytes, scannedAt: Date.now() }
    },
    async clean(_ctx, opts) {
      const before = await folderSizeBytes(TARGET)
      if (opts.dryRun) {
        return {
          checkId: DEFINITION.id,
          bytesFreed: before,
          dryRun: true,
          log: [`dry-run: would stop wuauserv/bits, clear ${TARGET} (~${before} bytes), then restart services`]
        }
      }
      await runPowerShell('Stop-Service -Name wuauserv,bits -Force -ErrorAction SilentlyContinue')
      const { deleted, failed } = clearFolderContents(TARGET)
      await runPowerShell('Start-Service -Name wuauserv,bits -ErrorAction SilentlyContinue')
      const after = await folderSizeBytes(TARGET)
      const freed = Math.max(0, before - after)
      return {
        checkId: DEFINITION.id,
        bytesFreed: freed,
        dryRun: false,
        log: [`cleared ${deleted} item(s) in ${TARGET}${failed ? `, ${failed} failed` : ''}`]
      }
    }
  }
}
