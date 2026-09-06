import type { CheckDefinition, MachineProfile } from '@shared/types'
import type { CheckEntry } from '../types'
import { folderSizeBytes, clearFolderContents } from './folderSize'

/** Factory for the common "measure a folder, then clear its contents" Windows check. */
export function makeSimpleFolderCheck(
  definition: CheckDefinition,
  pathResolver: (profile: MachineProfile) => string | undefined,
  isApplicable: (profile: MachineProfile) => boolean = (p) => !!pathResolver(p)
): CheckEntry {
  return {
    definition,
    isApplicable,
    handlers: {
      async scan(ctx) {
        const target = pathResolver(ctx.profile)
        if (!target) {
          return { checkId: definition.id, bytesReclaimable: null, scannedAt: Date.now(), error: 'path not found' }
        }
        const bytes = await folderSizeBytes(target)
        return { checkId: definition.id, bytesReclaimable: bytes, scannedAt: Date.now() }
      },
      async clean(ctx, opts) {
        const target = pathResolver(ctx.profile)
        if (!target) {
          return { checkId: definition.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: 'path not found' }
        }
        const before = await folderSizeBytes(target)
        if (opts.dryRun) {
          return {
            checkId: definition.id,
            bytesFreed: before,
            dryRun: true,
            log: [`dry-run: would clear ${target} (~${before} bytes)`]
          }
        }
        const { deleted, failed } = clearFolderContents(target)
        const after = await folderSizeBytes(target)
        const freed = Math.max(0, before - after)
        return {
          checkId: definition.id,
          bytesFreed: freed,
          dryRun: false,
          log: [`cleared ${deleted} item(s) in ${target}${failed ? `, ${failed} failed` : ''}`]
        }
      }
    }
  }
}
