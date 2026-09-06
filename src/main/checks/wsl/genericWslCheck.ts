import type { CheckDefinition, MachineProfile } from '@shared/types'
import type { CheckEntry, CheckContext } from '../types'
import { scanCheck, cleanCheck, type WslRunContext } from './wslRunner'

/** Fixed distro/user to target instead of the app's single default WSL distro
 * (e.g. for a check generated once per registered distro, such as fstrim). */
export interface DistroTarget {
  distro: string
  user: string
}

function resolveWslRunContext(ctx: CheckContext, target?: DistroTarget): WslRunContext {
  const distro = target?.distro ?? ctx.wslDistro
  const user = target?.user ?? ctx.wslUser
  if (!distro || !user) {
    throw new Error('no WSL distro/user resolved for this machine')
  }
  return {
    distro,
    user,
    projectRoots: ctx.profile.projectRoots,
    sudoPassword: ctx.sudoPassword
  }
}

/**
 * Every WSL-side check shares the exact same Node-side plumbing (spawn wsl.exe,
 * parse NDJSON) — the actual per-check behavior lives in cleaner.sh's case
 * statement. This factory avoids ~20 near-identical wrapper files.
 */
export function makeWslCheck(
  definition: CheckDefinition,
  isApplicable: (profile: MachineProfile) => boolean = () => true,
  target?: DistroTarget
): CheckEntry {
  return {
    definition,
    isApplicable,
    handlers: {
      async scan(ctx, onLog) {
        try {
          const runCtx = resolveWslRunContext(ctx, target)
          return await scanCheck(definition, runCtx, onLog)
        } catch (err) {
          return {
            checkId: definition.id,
            bytesReclaimable: null,
            scannedAt: Date.now(),
            error: (err as Error).message
          }
        }
      },
      async clean(ctx, opts, onLog) {
        try {
          const runCtx = resolveWslRunContext(ctx, target)
          return await cleanCheck(definition, runCtx, opts, onLog)
        } catch (err) {
          return { checkId: definition.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: (err as Error).message }
        }
      }
    }
  }
}
