import { execFile } from 'node:child_process'

/**
 * wsl.exe emits UTF-16LE (with a BOM) when its stdout is redirected instead
 * of attached to a console — a long-standing quirk. Detect and decode
 * accordingly; fall back to UTF-8 for anything else.
 */
export function decodeWslOutput(buf: Buffer): string {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le', 2)
  }
  // Heuristic: UTF-16LE ASCII text has a NUL byte after every ASCII char.
  if (buf.length >= 4 && buf[1] === 0x00 && buf[3] === 0x00) {
    return buf.toString('utf16le')
  }
  return buf.toString('utf8')
}

export interface WslExecResult {
  stdout: string
  stderr: string
  code: number
}

/** Runs `wsl.exe <args>` and returns decoded stdout/stderr. Never throws on non-zero exit. */
export function execWsl(args: string[], timeoutMs = 30_000): Promise<WslExecResult> {
  return new Promise((resolve) => {
    execFile(
      'wsl.exe',
      args,
      { encoding: 'buffer', timeout: timeoutMs, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout: decodeWslOutput(stdout),
          stderr: decodeWslOutput(stderr),
          code: error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0
        })
      }
    )
  })
}

export function execWslDistro(
  distro: string,
  user: string | undefined,
  command: string[],
  timeoutMs = 30_000
): Promise<WslExecResult> {
  const args = ['-d', distro]
  if (user) args.push('-u', user)
  args.push('--', ...command)
  return execWsl(args, timeoutMs)
}
