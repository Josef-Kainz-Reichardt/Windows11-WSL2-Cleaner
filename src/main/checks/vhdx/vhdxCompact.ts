import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import type { CheckEntry } from '../types'
import type { CheckDefinition, VhdxInfo } from '@shared/types'

function diskpartCompact(vhdxPath: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const script = [`select vdisk file="${vhdxPath}"`, 'attach vdisk readonly', 'compact vdisk', 'detach vdisk', 'exit'].join(
      '\r\n'
    )
    const tmpFile = path.join(os.tmpdir(), `wsl2cleaner-diskpart-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`)
    fs.writeFileSync(tmpFile, script, 'ascii')
    // diskpart writes its console output in the OEM codepage (e.g. cp850 on a
    // German Windows), which mangles umlauts when decoded as UTF-8 ("f�r",
    // "Datenträger" -> "Datentr�ger"). Switching the console to UTF-8 first
    // (chcp 65001) makes diskpart emit UTF-8 bytes so the default decode works.
    // windowsVerbatimArguments is required here: without it, Node re-quotes
    // this whole string as a single argv element on top of our own quotes
    // around tmpFile, corrupting the command line cmd.exe actually sees —
    // which is exactly what made diskpart report "Skriptdatei konnte nicht
    // geöffnet werden" (it never received the real path) once this was added.
    execFile(
      'cmd.exe',
      ['/d', '/c', `chcp 65001>nul && diskpart.exe /s "${tmpFile}"`],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024, windowsVerbatimArguments: true },
      (error, stdout) => {
        try {
          fs.rmSync(tmpFile, { force: true })
        } catch {
          /* best effort cleanup */
        }
        resolve({ code: error ? 1 : 0, output: stdout?.toString() ?? '' })
      }
    )
  })
}

/**
 * Success is judged by comparing the file size before/after — diskpart does
 * not return a reliable pass/fail exit code for "no size change" cases
 * (already compact, or fstrim didn't run beforehand).
 */
export function makeVhdxCheck(info: VhdxInfo, id: string): CheckEntry {
  const definition: CheckDefinition = {
    id,
    name: `VHDX kompaktieren: ${info.label}`,
    category: 'vhdx-compaction',
    platform: 'windows',
    requiresSudo: false,
    requiresWslShutdown: true,
    description: `Verkleinert die virtuelle Festplatte "${info.label}" (${info.path}) per diskpart compact. Setzt vollständig heruntergefahrenes WSL/Rancher Desktop voraus.`
  }

  return {
    definition,
    isApplicable: () => fs.existsSync(info.path),
    handlers: {
      async scan() {
        if (!fs.existsSync(info.path)) {
          return { checkId: id, bytesReclaimable: null, scannedAt: Date.now(), error: 'VHDX not found' }
        }
        const size = fs.statSync(info.path).size
        return {
          checkId: id,
          bytesReclaimable: null,
          scannedAt: Date.now(),
          details: `current file size ~${size} bytes; actual savings only known after compacting`
        }
      },
      async clean(_ctx, opts) {
        if (!fs.existsSync(info.path)) {
          return { checkId: id, bytesFreed: 0, dryRun: opts.dryRun, log: [], error: 'VHDX not found' }
        }
        const before = fs.statSync(info.path).size
        if (opts.dryRun) {
          return {
            checkId: id,
            bytesFreed: 0,
            dryRun: true,
            log: [`dry-run: would compact ${info.path} (currently ${before} bytes)`]
          }
        }
        const { code, output } = await diskpartCompact(info.path)
        const after = fs.existsSync(info.path) ? fs.statSync(info.path).size : before
        const freed = Math.max(0, before - after)
        return {
          checkId: id,
          bytesFreed: freed,
          dryRun: false,
          log: [output],
          error: freed === 0 && code !== 0 ? `diskpart exited with code ${code}` : undefined
        }
      }
    }
  }
}
