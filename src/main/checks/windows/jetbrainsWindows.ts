import fs from 'node:fs'
import path from 'node:path'
import type { CheckEntry } from '../types'
import { folderSizeBytes } from './folderSize'

const DEFINITION = {
  id: 'win-jetbrains-cache',
  name: 'JetBrains Cache (Windows)',
  category: 'windows-cache' as const,
  platform: 'windows' as const,
  requiresSudo: false,
  description: 'caches/index/log/tmp je IDE-Installationsordner unter %LOCALAPPDATA%\\JetBrains (wird beim nächsten Start neu aufgebaut).'
}

const SUBFOLDERS = ['caches', 'index', 'log', 'tmp']

function listIdeDirs(root: string): string[] {
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(root, e.name))
}

export const winJetbrainsCheck: CheckEntry = {
  definition: DEFINITION,
  isApplicable: (profile) => !!profile.jetbrainsWindowsCachePath,
  handlers: {
    async scan(ctx) {
      const root = ctx.profile.jetbrainsWindowsCachePath
      if (!root) {
        return { checkId: DEFINITION.id, bytesReclaimable: null, scannedAt: Date.now(), error: 'JetBrains cache not found' }
      }
      let total = 0
      for (const ideDir of listIdeDirs(root)) {
        for (const sub of SUBFOLDERS) {
          total += await folderSizeBytes(path.join(ideDir, sub))
        }
      }
      return { checkId: DEFINITION.id, bytesReclaimable: total, scannedAt: Date.now() }
    },
    async clean(ctx, opts) {
      const root = ctx.profile.jetbrainsWindowsCachePath
      if (!root) {
        return { checkId: DEFINITION.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: 'JetBrains cache not found' }
      }
      const log: string[] = []
      let freed = 0
      for (const ideDir of listIdeDirs(root)) {
        for (const sub of SUBFOLDERS) {
          const target = path.join(ideDir, sub)
          const before = await folderSizeBytes(target)
          if (before === 0) continue
          if (opts.dryRun) {
            freed += before
            log.push(`dry-run: would clear ${target} (~${before} bytes)`)
            continue
          }
          try {
            fs.rmSync(target, { recursive: true, force: true })
            freed += before
            log.push(`cleared ${target}`)
          } catch (err) {
            // e.g. EPERM because the IDE that owns this cache is currently running —
            // skip it and keep clearing the other IDE folders instead of aborting.
            log.push(`skipped ${target}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
      }
      return { checkId: DEFINITION.id, bytesFreed: freed, dryRun: opts.dryRun, log }
    }
  }
}
