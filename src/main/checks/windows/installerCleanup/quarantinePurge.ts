import fs from 'node:fs'
import path from 'node:path'
import type { CheckContext, CheckEntry } from '../../types'
import { folderSizeBytes } from '../folderSize'
import { QUARANTINE_FOLDER_PREFIX } from './orphans'

const DEFINITION = {
  id: 'win-installer-quarantine-purge',
  name: 'Installer-Quarantäne aufräumen',
  category: 'windows-system' as const,
  platform: 'windows' as const,
  requiresSudo: false,
  description:
    'Löscht Unterordner aus dem Installer-Quarantäne-Ordner (siehe "Verwaiste Windows-Installer-Cache-Dateien"), die älter als die konfigurierte Aufbewahrungsfrist sind. Läuft nur dann automatisch bei "Alles bereinigen" mit, wenn Auto-Löschen in den Einstellungen aktiviert ist — sonst nur, wenn dieser Check einzeln angestoßen wird.'
}

interface QuarantineFolder {
  path: string
}

function listExpiredFolders(ctx: CheckContext): QuarantineFolder[] {
  const dir = ctx.settings.installerQuarantineDir
  if (!dir || !fs.existsSync(dir)) return []
  const cutoff = Date.now() - ctx.settings.installerQuarantineRetentionDays * 24 * 60 * 60 * 1000
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(QUARANTINE_FOLDER_PREFIX))
    .map((e) => path.join(dir, e.name))
    .filter((p) => {
      try {
        return fs.statSync(p).mtimeMs < cutoff
      } catch {
        return false
      }
    })
    .map((p) => ({ path: p }))
}

export const winInstallerQuarantinePurgeCheck: CheckEntry = {
  definition: DEFINITION,
  isApplicable: () => true,
  handlers: {
    async scan(ctx) {
      if (!ctx.settings.installerQuarantineDir) {
        return { checkId: DEFINITION.id, bytesReclaimable: 0, scannedAt: Date.now(), details: 'kein Quarantäne-Ordner konfiguriert' }
      }
      const expired = listExpiredFolders(ctx)
      let bytes = 0
      for (const f of expired) bytes += await folderSizeBytes(f.path)
      return {
        checkId: DEFINITION.id,
        bytesReclaimable: bytes,
        itemCount: expired.length,
        details: `${expired.length} Ordner älter als ${ctx.settings.installerQuarantineRetentionDays} Tage`,
        scannedAt: Date.now()
      }
    },

    async clean(ctx, opts) {
      if (!ctx.settings.installerQuarantineDir) {
        return { checkId: DEFINITION.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: 'kein Quarantäne-Ordner konfiguriert' }
      }
      const expired = listExpiredFolders(ctx)
      if (expired.length === 0) {
        return { checkId: DEFINITION.id, bytesFreed: 0, dryRun: opts.dryRun, log: ['keine abgelaufenen Ordner'] }
      }

      if (opts.dryRun) {
        let bytes = 0
        for (const f of expired) bytes += await folderSizeBytes(f.path)
        return {
          checkId: DEFINITION.id,
          bytesFreed: bytes,
          dryRun: true,
          log: [`dry-run: würde ${expired.length} Ordner löschen`]
        }
      }

      let freed = 0
      let failed = 0
      for (const f of expired) {
        const size = await folderSizeBytes(f.path)
        try {
          fs.rmSync(f.path, { recursive: true, force: true })
          freed += size
        } catch {
          failed++
        }
      }

      return {
        checkId: DEFINITION.id,
        bytesFreed: freed,
        dryRun: false,
        log: [`${expired.length - failed}/${expired.length} Ordner gelöscht${failed ? `, ${failed} fehlgeschlagen` : ''}`]
      }
    }
  }
}
