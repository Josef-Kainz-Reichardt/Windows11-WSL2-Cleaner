import type { CheckEntry } from '../types'
import { runPowerShell } from '@main/util/powershell'

const DEFINITION = {
  id: 'win-recycle-bin',
  name: 'Papierkorb',
  category: 'windows-system' as const,
  platform: 'windows' as const,
  requiresSudo: false,
  description: 'Windows-Papierkorb leeren.'
}

// The Recycle Bin has no fs-level representation — it's purely a Shell
// namespace concept, so this is the one place besides close-main-window.ps1
// where a PowerShell one-liner is unavoidable (no Node/robocopy equivalent).
const SIZE_SCRIPT =
  '$ns = (New-Object -ComObject Shell.Application).Namespace(10); ' +
  '$sum = 0; ' +
  'foreach ($item in $ns.Items()) { $sum += [int64]$item.ExtendedProperty("System.Size") }; ' +
  'Write-Output $sum'

async function recycleBinSize(): Promise<number> {
  const { stdout } = await runPowerShell(SIZE_SCRIPT)
  const bytes = Number(stdout.trim())
  return Number.isFinite(bytes) ? bytes : 0
}

export const winRecycleBinCheck: CheckEntry = {
  definition: DEFINITION,
  isApplicable: () => true,
  handlers: {
    async scan() {
      const bytes = await recycleBinSize()
      return { checkId: DEFINITION.id, bytesReclaimable: bytes, scannedAt: Date.now() }
    },
    async clean(_ctx, opts) {
      const before = await recycleBinSize()
      if (opts.dryRun) {
        return {
          checkId: DEFINITION.id,
          bytesFreed: before,
          dryRun: true,
          log: [`dry-run: would empty Recycle Bin (~${before} bytes)`]
        }
      }
      const { code } = await runPowerShell('Clear-RecycleBin -Force -ErrorAction SilentlyContinue')
      const after = await recycleBinSize()
      const freed = Math.max(0, before - after)
      const failed = code !== 0 && freed === 0 && before > 0
      return {
        checkId: DEFINITION.id,
        bytesFreed: freed,
        dryRun: false,
        log: [failed ? `Clear-RecycleBin lief durch, Papierkorb aber unverändert (~${before} bytes)` : `Papierkorb geleert (${freed} bytes)`],
        error: failed ? 'Clear-RecycleBin may have failed' : undefined
      }
    }
  }
}
