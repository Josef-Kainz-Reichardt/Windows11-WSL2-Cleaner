import { spawn } from 'node:child_process'
import type { CheckEntry } from '../types'
import { freeBytes } from '@main/util/diskFree'
import { emitDismProgress } from '@main/events/bus'

const DEFINITION = {
  id: 'win-dism-component-cleanup',
  name: 'DISM Component Cleanup',
  category: 'windows-system' as const,
  platform: 'windows' as const,
  requiresSudo: false,
  description:
    'Entfernt alte Windows-Update-Komponenten (WinSxS-Bereinigung). Kann mehrere Minuten dauern; Größe ist vorab nicht verlässlich schätzbar.'
}

const PERCENT_RE = /\[=*\s*(\d+(?:\.\d+)?)%\s*=*\]/g

function runDism(args: string[]): Promise<{ code: number; log: string[] }> {
  return new Promise((resolve) => {
    const child = spawn('dism.exe', args, { windowsHide: true })
    const log: string[] = []
    let buf = ''

    const handleChunk = (chunk: Buffer): void => {
      buf += chunk.toString('utf8')
      let lastPercent: number | null = null
      let match: RegExpExecArray | null
      PERCENT_RE.lastIndex = 0
      while ((match = PERCENT_RE.exec(buf)) !== null) {
        lastPercent = Number(match[1])
      }
      if (lastPercent !== null) emitDismProgress({ percent: lastPercent })
      // Keep buffer from growing unbounded across a multi-minute run.
      if (buf.length > 8192) buf = buf.slice(-2048)
    }

    child.stdout.on('data', handleChunk)
    child.stderr.on('data', (d: Buffer) => log.push(d.toString('utf8')))
    child.on('close', (code) => resolve({ code: code ?? 1, log }))
    child.on('error', () => resolve({ code: 1, log: ['failed to start dism.exe'] }))
  })
}

export const winDismCheck: CheckEntry = {
  definition: DEFINITION,
  isApplicable: () => true,
  handlers: {
    async scan() {
      return { checkId: DEFINITION.id, bytesReclaimable: null, scannedAt: Date.now() }
    },
    async clean(_ctx, opts) {
      if (opts.dryRun) {
        return {
          checkId: DEFINITION.id,
          bytesFreed: 0,
          dryRun: true,
          log: ['dry-run: would run dism.exe /Online /Cleanup-Image /StartComponentCleanup /ResetBase']
        }
      }
      const before = freeBytes('C:\\')
      const { code, log } = await runDism(['/Online', '/Cleanup-Image', '/StartComponentCleanup', '/ResetBase'])
      const after = freeBytes('C:\\')
      const freed = Math.max(0, after - before)
      return {
        checkId: DEFINITION.id,
        bytesFreed: freed,
        dryRun: false,
        log,
        error: code !== 0 ? `dism.exe exited with code ${code}` : undefined
      }
    }
  }
}
