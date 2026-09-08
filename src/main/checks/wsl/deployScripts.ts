import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getWslScriptsDir } from '@main/util/resourcePaths'
import { execWslDistro } from '@main/util/wslExec'

const REMOTE_DIR = '.cache/windows11wsl2cleaner/scripts'
const BASE64_CHUNK_SIZE = 8000

function hashContent(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

/** CRLF line endings break bash inside WSL ("$'\r': command not found") — normalize
 * regardless of how the local file ended up with them (editor, git config, packaging). */
function readNormalized(abs: string): Buffer {
  return Buffer.from(fs.readFileSync(abs, 'utf8').replace(/\r\n/g, '\n'), 'utf8')
}

interface LocalFile {
  rel: string
  abs: string
}

function collectLocalFiles(root: string, rel = ''): LocalFile[] {
  const absDir = path.join(root, rel)
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  let out: LocalFile[] = []
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      out = out.concat(collectLocalFiles(root, relPath))
    } else {
      out.push({ rel: relPath, abs: path.join(absDir, e.name) })
    }
  }
  return out
}

function uncScriptsDir(distro: string, user: string): string {
  return `\\\\wsl.localhost\\${distro}\\home\\${user}\\${REMOTE_DIR.replace(/\//g, '\\')}`
}

/** Primary path: WSL2 exposes its filesystem as a UNC share, so we can just fs.writeFileSync into it. */
async function deployViaUnc(distro: string, user: string): Promise<boolean> {
  const uncDir = uncScriptsDir(distro, user)
  try {
    fs.mkdirSync(uncDir, { recursive: true })
  } catch {
    return false
  }

  try {
    const localRoot = getWslScriptsDir()
    const files = collectLocalFiles(localRoot)
    for (const f of files) {
      const content = readNormalized(f.abs)
      const destPath = path.join(uncDir, f.rel.split('/').join(path.sep))
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      let needsWrite = true
      try {
        const existing = fs.readFileSync(destPath)
        needsWrite = hashContent(existing) !== hashContent(content)
      } catch {
        needsWrite = true
      }
      if (needsWrite) fs.writeFileSync(destPath, content)
    }
    return true
  } catch {
    return false
  }
}

/** Fallback for the rare case the UNC share isn't ready yet right after a cold WSL start. */
async function deployViaBase64(distro: string, user: string): Promise<boolean> {
  const localRoot = getWslScriptsDir()
  const files = collectLocalFiles(localRoot)
  const remoteDir = `$HOME/${REMOTE_DIR}`

  const mkdirRes = await execWslDistro(distro, user, ['bash', '-lc', `mkdir -p "${remoteDir}"`])
  if (mkdirRes.code !== 0) return false

  for (const f of files) {
    const content = readNormalized(f.abs)
    const b64 = content.toString('base64')
    const destPath = `${remoteDir}/${f.rel}`
    const parentMkdir = `mkdir -p "$(dirname "${destPath}")"`
    const truncate = `: > "${destPath}"`
    const init = await execWslDistro(distro, user, ['bash', '-lc', `${parentMkdir} && ${truncate}`])
    if (init.code !== 0) return false

    for (let i = 0; i < b64.length; i += BASE64_CHUNK_SIZE) {
      const chunk = b64.slice(i, i + BASE64_CHUNK_SIZE)
      const append = `printf '%s' '${chunk}' | base64 -d >> "${destPath}"`
      const res = await execWslDistro(distro, user, ['bash', '-lc', append], 60_000)
      if (res.code !== 0) return false
    }
  }
  return true
}

/** Ensures the bundled cleaner scripts are present (and up to date) inside the given distro. */
export async function deployWslScripts(distro: string, user: string): Promise<void> {
  const uncOk = await deployViaUnc(distro, user)
  if (uncOk) return
  const b64Ok = await deployViaBase64(distro, user)
  if (!b64Ok) {
    throw new Error(`Failed to deploy WSL helper scripts to distro "${distro}"`)
  }
}

export function remoteCleanerScriptPath(): string {
  return `$HOME/${REMOTE_DIR}/cleaner.sh`
}
