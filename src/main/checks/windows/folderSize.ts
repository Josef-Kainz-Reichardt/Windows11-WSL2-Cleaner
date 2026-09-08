import { execFile, type ExecFileException } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DUMMY_DEST = path.join(os.tmpdir(), 'windows11wsl2cleaner-robocopy-dummy')
const FOLDER_SIZE_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Measures a folder's total size via `robocopy /L` (list-only, no files
 * touched) instead of `Get-ChildItem -Recurse | Measure-Object`, which is
 * dramatically slower on deep trees such as node_modules or IDE caches.
 * Robocopy's exit code is a bitmask where values 0-7 all mean success —
 * it is not a pass/fail code, so it is intentionally ignored here.
 */
export function folderSizeBytes(targetPath: string): Promise<number> {
  return new Promise((resolve) => {
    if (!fs.existsSync(targetPath)) {
      resolve(0)
      return
    }
    execFile(
      'robocopy.exe',
      [targetPath, DUMMY_DEST, '/L', '/E', '/XJ', '/NFL', '/NDL', '/NJH', '/BYTES', '/R:0', '/W:0'],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: FOLDER_SIZE_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if ((error as ExecFileException | null)?.killed) {
          console.error(`folderSizeBytes: robocopy timed out after ${FOLDER_SIZE_TIMEOUT_MS}ms scanning "${targetPath}"`)
        }
        const line = stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.startsWith('Bytes'))
        if (!line) {
          console.error(
            `folderSizeBytes: no "Bytes" summary line for "${targetPath}" — ` +
              `error=${error ? `${(error as NodeJS.ErrnoException).code ?? ''} ${error.message}` : 'none'} ` +
              `stderr=${stderr ? stderr.trim().slice(0, 500) : 'none'} ` +
              `stdout=${stdout ? stdout.trim().slice(0, 500) : 'empty'}`
          )
          resolve(0)
          return
        }
        const parts = line.split(/\s+/)
        const bytes = Number(parts[2])
        resolve(Number.isFinite(bytes) ? bytes : 0)
      }
    )
  })
}

/** Deletes everything inside a folder but keeps the folder itself. */
export function clearFolderContents(targetPath: string): { deleted: number; failed: number } {
  let deleted = 0
  let failed = 0
  if (!fs.existsSync(targetPath)) return { deleted, failed }
  for (const entry of fs.readdirSync(targetPath)) {
    const full = path.join(targetPath, entry)
    try {
      fs.rmSync(full, { recursive: true, force: true })
      deleted++
    } catch {
      failed++
    }
  }
  return { deleted, failed }
}
