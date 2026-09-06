import type { CleanResult, RunOptions, ScanResult } from '@shared/types'
import type { CheckContext, CheckEntry, LogSink } from './types'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Wraps a check's scan()/clean() handler so a thrown exception (a locked
 * file held open by another app, a missing binary, ...) turns into a normal
 * error result instead of crashing the whole scan-all/clean-all run — per
 * CLAUDE.md, an individual check failure must never abort the rest of the batch. */
export async function safeScan(entry: CheckEntry, ctx: CheckContext, onLog: LogSink): Promise<ScanResult> {
  try {
    return await entry.handlers.scan(ctx, onLog)
  } catch (err) {
    return { checkId: entry.definition.id, bytesReclaimable: null, scannedAt: Date.now(), error: errorMessage(err) }
  }
}

export async function safeClean(entry: CheckEntry, ctx: CheckContext, opts: RunOptions, onLog: LogSink): Promise<CleanResult> {
  try {
    return await entry.handlers.clean(ctx, opts, onLog)
  } catch (err) {
    return { checkId: entry.definition.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: errorMessage(err) }
  }
}
