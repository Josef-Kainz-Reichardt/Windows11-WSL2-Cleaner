import fs from 'node:fs'
import path from 'node:path'
import type { CheckEntry } from '../../types'
import { findOrphanInstallerFiles } from './orphanScan'
import { confirmInstallerCleanup } from './confirm'

export const QUARANTINE_FOLDER_PREFIX = 'installer-quarantine-'

const DEFINITION = {
  id: 'win-installer-orphans',
  name: 'Verwaiste Windows-Installer-Cache-Dateien',
  category: 'windows-system' as const,
  platform: 'windows' as const,
  requiresSudo: false,
  requiresConfirmation: true,
  description:
    'Erkennt .msi/.msp in C:\\Windows\\Installer, die laut Registry von keiner installierten Software mehr referenziert werden, und verschiebt sie in einen Zeitstempel-Unterordner im konfigurierten Quarantäne-Ordner. Riskanter als andere Checks: eine falsch erkannte Datei kann Reparatur/Deinstallation der (unbeteiligten) Software, die sie referenziert, erst Monate später sichtbar verhindern. Quarantäne-Ordner muss vorher in den Einstellungen gesetzt werden.'
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Copy-then-delete instead of fs.renameSync: the quarantine folder is very
 * often on a different drive than C:\Windows\Installer (that's the whole
 * point — moving space pressure off C:), and rename() fails cross-volume
 * (EXDEV) on Windows just like on Unix. */
function moveToQuarantine(files: { path: string; size: number }[], destDir: string): { freed: number; failures: string[] } {
  let freed = 0
  const failures: string[] = []
  for (const f of files) {
    const dest = path.join(destDir, path.basename(f.path))
    try {
      fs.copyFileSync(f.path, dest)
    } catch (err) {
      failures.push(`${f.path}: Kopieren fehlgeschlagen (${err instanceof Error ? err.message : String(err)})`)
      continue
    }
    try {
      fs.unlinkSync(f.path)
      freed += f.size
    } catch (err) {
      // Copied but original still there — no space freed, but nothing lost either.
      failures.push(`${f.path}: kopiert, Original konnte nicht gelöscht werden (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  return { freed, failures }
}

export const winInstallerOrphansCheck: CheckEntry = {
  definition: DEFINITION,
  isApplicable: () => fs.existsSync('C:\\Windows\\Installer'),
  handlers: {
    async scan() {
      const orphans = await findOrphanInstallerFiles()
      const bytes = orphans.reduce((sum, o) => sum + o.size, 0)
      return {
        checkId: DEFINITION.id,
        bytesReclaimable: bytes,
        itemCount: orphans.length,
        details: `${orphans.length} verwaiste Datei(en) gefunden`,
        scannedAt: Date.now()
      }
    },

    async clean(ctx, opts, onLog) {
      const quarantineDir = ctx.settings.installerQuarantineDir
      if (!quarantineDir) {
        return {
          checkId: DEFINITION.id,
          bytesFreed: 0,
          dryRun: opts.dryRun,
          log: [],
          error: 'Kein Quarantäne-Ordner konfiguriert (siehe Einstellungen).'
        }
      }

      // Re-scan instead of trusting a stale scan result — installer state can
      // change between scan and clean (e.g. a Windows Update ran in between).
      const orphans = await findOrphanInstallerFiles()
      if (orphans.length === 0) {
        return { checkId: DEFINITION.id, bytesFreed: 0, dryRun: opts.dryRun, log: ['keine verwaisten Dateien gefunden'] }
      }
      const totalBytes = orphans.reduce((sum, o) => sum + o.size, 0)

      if (opts.dryRun) {
        return {
          checkId: DEFINITION.id,
          bytesFreed: totalBytes,
          dryRun: true,
          log: [`dry-run: würde ${orphans.length} Datei(en) (~${formatMb(totalBytes)}) nach ${quarantineDir} verschieben`]
        }
      }

      const proceed = await confirmInstallerCleanup(
        `${orphans.length} verwaiste Installer-Cache-Datei(en) (~${formatMb(totalBytes)}) gefunden. ` +
          `Nach "${quarantineDir}" verschieben und Originale löschen?`,
        orphans.length,
        totalBytes
      )
      if (!proceed) {
        return { checkId: DEFINITION.id, bytesFreed: 0, dryRun: false, log: [], error: 'Durch Nutzer abgelehnt' }
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const destDir = path.join(quarantineDir, `${QUARANTINE_FOLDER_PREFIX}${stamp}`)
      try {
        fs.mkdirSync(destDir, { recursive: true })
      } catch (err) {
        return {
          checkId: DEFINITION.id,
          bytesFreed: 0,
          dryRun: false,
          log: [],
          error: `Quarantäne-Ordner konnte nicht angelegt werden: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      const { freed, failures } = moveToQuarantine(orphans, destDir)
      const movedCount = orphans.length - failures.length

      onLog(
        'info',
        `${movedCount}/${orphans.length} Datei(en) verschoben nach ${destDir}${failures.length ? `, ${failures.length} fehlgeschlagen` : ''}`
      )

      return {
        checkId: DEFINITION.id,
        bytesFreed: freed,
        dryRun: false,
        log: [
          `verschoben nach: ${destDir}`,
          `${movedCount}/${orphans.length} Datei(en) verschoben`,
          ...failures
        ]
      }
    }
  }
}
