import { execFile } from 'node:child_process'

/** Runs a PowerShell one-liner, non-interactively, with no profile loaded. */
export function runPowerShell(script: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        resolve({ code: error ? 1 : 0, stdout: stdout.toString() })
      }
    )
  })
}
