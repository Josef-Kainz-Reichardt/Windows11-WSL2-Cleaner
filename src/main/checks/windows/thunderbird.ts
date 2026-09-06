import fs from 'node:fs'
import path from 'node:path'
import type { CheckEntry } from '../types'
import { folderSizeBytes } from './folderSize'

const DEFINITION = {
  id: 'win-thunderbird-cache',
  name: 'Thunderbird Cache & Index',
  category: 'windows-cache' as const,
  platform: 'windows' as const,
  requiresSudo: false,
  description: 'cache2/startupCache und *.msf-Indexdateien je Thunderbird-Profil (werden automatisch neu aufgebaut).'
}

function listProfileDirs(profilesRoot: string): string[] {
  if (!fs.existsSync(profilesRoot)) return []
  return fs
    .readdirSync(profilesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(profilesRoot, e.name))
}

function findMsfFiles(profileDir: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.isFile() && e.name.toLowerCase().endsWith('.msf')) out.push(full)
    }
  }
  walk(profileDir)
  return out
}

export const winThunderbirdCheck: CheckEntry = {
  definition: DEFINITION,
  isApplicable: (profile) => !!profile.thunderbirdProfilesPath,
  handlers: {
    async scan(ctx) {
      const root = ctx.profile.thunderbirdProfilesPath
      if (!root) {
        return { checkId: DEFINITION.id, bytesReclaimable: null, scannedAt: Date.now(), error: 'Thunderbird profiles not found' }
      }
      let total = 0
      for (const profileDir of listProfileDirs(root)) {
        total += await folderSizeBytes(path.join(profileDir, 'cache2'))
        total += await folderSizeBytes(path.join(profileDir, 'startupCache'))
        for (const msf of findMsfFiles(profileDir)) {
          try {
            total += fs.statSync(msf).size
          } catch {
            /* file may have been removed concurrently by Thunderbird itself */
          }
        }
      }
      return { checkId: DEFINITION.id, bytesReclaimable: total, scannedAt: Date.now() }
    },
    async clean(ctx, opts) {
      const root = ctx.profile.thunderbirdProfilesPath
      if (!root) {
        return { checkId: DEFINITION.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: 'Thunderbird profiles not found' }
      }
      const log: string[] = []
      let freed = 0
      for (const profileDir of listProfileDirs(root)) {
        for (const sub of ['cache2', 'startupCache']) {
          const target = path.join(profileDir, sub)
          const before = await folderSizeBytes(target)
          if (before === 0) continue
          if (opts.dryRun) {
            freed += before
            log.push(`dry-run: would clear ${target} (~${before} bytes)`)
            continue
          }
          fs.rmSync(target, { recursive: true, force: true })
          freed += before
          log.push(`cleared ${target}`)
        }
        const msfFiles = findMsfFiles(profileDir)
        let msfBytes = 0
        for (const msf of msfFiles) {
          try {
            msfBytes += fs.statSync(msf).size
            if (!opts.dryRun) fs.rmSync(msf, { force: true })
          } catch {
            /* ignore */
          }
        }
        if (msfFiles.length) {
          freed += msfBytes
          log.push(
            `${opts.dryRun ? 'dry-run: would remove' : 'removed'} ${msfFiles.length} *.msf index file(s) in ${profileDir}`
          )
        }
      }
      return { checkId: DEFINITION.id, bytesFreed: freed, dryRun: opts.dryRun, log }
    }
  }
}
