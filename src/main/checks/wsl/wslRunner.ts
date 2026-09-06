import { spawn } from 'node:child_process'
import readline from 'node:readline'
import stripAnsi from 'strip-ansi'
import { deployWslScripts, remoteCleanerScriptPath } from './deployScripts'
import { parseNdjsonLine, isResultLine, isLogLine } from '@main/util/ndjson'
import { redact } from '@main/util/redact'
import type { CheckDefinition, ScanResult, CleanResult, RunOptions } from '@shared/types'
import type { LogSink } from '../types'

export interface WslRunContext {
  distro: string
  user: string
  projectRoots: string[]
  /** Decrypted sudo password, if the app has one stored. Only read for requiresSudo checks. */
  sudoPassword?: string | null
}

interface RawCheckResult {
  bytes: number | null
  ok: boolean
  message?: string
}

function runCleanerScript(
  check: CheckDefinition,
  mode: 'scan' | 'clean',
  ctx: WslRunContext,
  opts: RunOptions,
  onLog: LogSink
): Promise<{ result: RawCheckResult; log: string[] }> {
  const args = ['-d', ctx.distro, '-u', ctx.user, '--', 'bash', remoteCleanerScriptPath(), check.scriptId ?? check.id, mode]
  if (opts.dryRun) args.push('--dry-run')

  // WSL does NOT inherit the host process environment by default — only
  // variables named in WSLENV get forwarded into the guest.
  const env = {
    ...process.env,
    WSLENV: 'PROJECT_ROOTS',
    PROJECT_ROOTS: ctx.projectRoots.join(':')
  }

  return new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', args, { windowsHide: true, env })
    const log: string[] = []
    let settled: RawCheckResult | null = null
    let stderrBuf = ''

    const record = (level: 'info' | 'warn' | 'error', message: string): void => {
      const clean = redact(message)
      log.push(`[${level}] ${clean}`)
      onLog(level, clean)
    }

    const rl = readline.createInterface({ input: child.stdout })
    rl.on('line', (raw) => {
      const parsed = parseNdjsonLine(raw)
      if (!parsed) {
        if (raw.trim()) record('info', raw)
        return
      }
      if (isLogLine(parsed)) {
        record(parsed.level, parsed.message)
      } else if (isResultLine(parsed)) {
        settled = { bytes: parsed.bytes, ok: parsed.ok, message: parsed.message }
      }
    })

    child.stderr.on('data', (d: Buffer) => {
      stderrBuf += d.toString('utf8')
    })

    child.on('error', (err) => reject(err))

    child.on('close', (code) => {
      const stderrClean = stripAnsi(stderrBuf).trim()
      if (stderrClean) record('warn', stderrClean)
      if (settled) {
        resolve({ result: settled, log })
      } else {
        resolve({
          result: { bytes: null, ok: false, message: `check produced no result (exit code ${code})` },
          log
        })
      }
    })

    if (check.requiresSudo && ctx.sudoPassword) {
      child.stdin.write(`${ctx.sudoPassword}\n`)
    }
    child.stdin.end()
  })
}

export async function scanCheck(
  check: CheckDefinition,
  ctx: WslRunContext,
  onLog: LogSink = () => {}
): Promise<ScanResult> {
  try {
    if (check.requiresSudo && !ctx.sudoPassword) {
      return {
        checkId: check.id,
        bytesReclaimable: null,
        scannedAt: Date.now(),
        error: 'sudo password not set'
      }
    }
    await deployWslScripts(ctx.distro, ctx.user)
    const { result } = await runCleanerScript(check, 'scan', ctx, { dryRun: false }, onLog)
    return {
      checkId: check.id,
      bytesReclaimable: result.ok ? result.bytes : null,
      scannedAt: Date.now(),
      error: result.ok ? undefined : result.message
    }
  } catch (err) {
    return {
      checkId: check.id,
      bytesReclaimable: null,
      scannedAt: Date.now(),
      error: (err as Error).message
    }
  }
}

export async function cleanCheck(
  check: CheckDefinition,
  ctx: WslRunContext,
  opts: RunOptions,
  onLog: LogSink = () => {}
): Promise<CleanResult> {
  try {
    if (check.requiresSudo && !ctx.sudoPassword) {
      return { checkId: check.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: 'sudo password not set' }
    }
    await deployWslScripts(ctx.distro, ctx.user)
    const { result, log } = await runCleanerScript(check, 'clean', ctx, opts, onLog)
    return {
      checkId: check.id,
      bytesFreed: result.ok && typeof result.bytes === 'number' ? result.bytes : 0,
      dryRun: opts.dryRun,
      log,
      error: result.ok ? undefined : result.message
    }
  } catch (err) {
    return { checkId: check.id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: (err as Error).message }
  }
}
