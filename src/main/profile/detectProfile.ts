import fs from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import { execWsl, execWslDistro } from '@main/util/wslExec'
import type { MachineProfile, WslDistroInfo, VhdxInfo } from '@shared/types'

const CANDIDATE_PROJECT_ROOTS = ['work', 'projects', 'src', 'dev', 'code', 'repos', 'git', 'source', 'workspace']
const RDCTL_PATH = 'C:\\Program Files\\Rancher Desktop\\resources\\resources\\win32\\bin\\rdctl.exe'

async function listDistros(): Promise<WslDistroInfo[]> {
  const res = await execWsl(['-l', '-v'])
  const lines = res.stdout
    .split(/\r?\n/)
    .map((l) => l.replace(/\u0000/g, ''))
    .filter((l) => l.trim().length > 0)

  const distros: WslDistroInfo[] = []
  for (const line of lines) {
    if (/^\s*NAME\s+STATE\s+VERSION/i.test(line)) continue
    const isDefault = line.trimStart().startsWith('*')
    const cleaned = line.replace('*', ' ').trim()
    const parts = cleaned.split(/\s+/)
    if (parts.length < 3) continue
    const version = parts[parts.length - 1]
    const state = parts[parts.length - 2]
    const name = parts.slice(0, parts.length - 2).join(' ')
    if (!name) continue
    distros.push({ name, isDefault, wslVersion: version === '1' ? 1 : 2, state, bashCapable: false })
  }
  return distros
}

async function detectDefaultUser(distro: string): Promise<string | undefined> {
  const res = await execWslDistro(distro, undefined, ['whoami'])
  const user = res.stdout.trim().split(/\r?\n/).pop()?.trim()
  return user && res.code === 0 ? user : undefined
}

/** Rancher Desktop's internal utility distros ("rancher-desktop", "rancher-desktop-data")
 * are minimal VMs that often can't exec bash (e.g. "/bin/sh: bash: Permission denied") —
 * probe instead of assuming, so any such distro is excluded from bash-script-based checks. */
async function detectBashCapable(distro: string, user: string): Promise<boolean> {
  const res = await execWslDistro(distro, user, ['bash', '-c', 'true'], 10_000)
  return res.code === 0
}

async function detectProjectRoots(distro: string, user: string, candidateNames: string[]): Promise<string[]> {
  const script = candidateNames.map((d) => `[ -d "$HOME/${d}" ] && echo "$HOME/${d}"`).join('; ')
  const res = await execWslDistro(distro, user, ['bash', '-lc', script])
  return res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

function findVhdxPaths(): VhdxInfo[] {
  const localAppData = process.env.LOCALAPPDATA ?? ''
  if (!localAppData) return []

  const patterns = [
    { label: 'Rancher Desktop distro-data', glob: 'rancher-desktop/distro-data/ext4.vhdx' },
    { label: 'Rancher Desktop distro', glob: 'rancher-desktop/distro/ext4.vhdx' },
    { label: 'Ubuntu (Store app)', glob: 'Packages/CanonicalGroupLimited.*/LocalState/ext4.vhdx' }
  ]

  const results: VhdxInfo[] = []
  for (const p of patterns) {
    const matches = fg.sync(p.glob, { cwd: localAppData, absolute: true, onlyFiles: true })
    for (const m of matches) {
      results.push({ label: p.label, path: path.normalize(m) })
    }
  }
  return results
}

export async function detectMachineProfile(extraProjectRootNames: string[] = []): Promise<MachineProfile> {
  const wslDistros = await listDistros()
  const candidateNames = [...CANDIDATE_PROJECT_ROOTS, ...extraProjectRootNames]

  const defaultLinuxUser: Record<string, string> = {}
  const projectRootsSet = new Set<string>()

  for (const distro of wslDistros) {
    const user = await detectDefaultUser(distro.name)
    if (!user) continue
    defaultLinuxUser[distro.name] = user
    distro.bashCapable = await detectBashCapable(distro.name, user)
    if (distro.bashCapable) {
      const roots = await detectProjectRoots(distro.name, user, candidateNames)
      roots.forEach((r) => projectRootsSet.add(r))
    }
  }

  const rdctlInstalled = fs.existsSync(RDCTL_PATH)
  const adobeTempPath = fs.existsSync('C:\\adobeTemp') ? 'C:\\adobeTemp' : undefined

  const appData = process.env.APPDATA ?? ''
  const localAppData = process.env.LOCALAPPDATA ?? ''

  const thunderbirdProfilesPath = appData
    ? maybeExisting(path.join(appData, 'Thunderbird', 'Profiles'))
    : undefined
  const jetbrainsWindowsCachePath = localAppData
    ? maybeExisting(path.join(localAppData, 'JetBrains'))
    : undefined
  const uvCacheWindowsPath = localAppData ? maybeExisting(path.join(localAppData, 'uv', 'cache')) : undefined

  return {
    wslDistros,
    defaultLinuxUser,
    projectRoots: Array.from(projectRootsSet),
    rancherDesktop: { installed: rdctlInstalled, rdctlPath: rdctlInstalled ? RDCTL_PATH : undefined },
    vhdxPaths: findVhdxPaths(),
    adobeTempPath,
    thunderbirdProfilesPath,
    jetbrainsWindowsCachePath,
    uvCacheWindowsPath,
    detectedAt: Date.now()
  }
}

function maybeExisting(p: string): string | undefined {
  return fs.existsSync(p) ? p : undefined
}

/** The distro/user pair the app should use for WSL checks by default. */
export function pickDefaultDistro(profile: MachineProfile): { distro: string; user: string } | null {
  const preferred = profile.wslDistros.find((d) => d.isDefault) ?? profile.wslDistros[0]
  if (!preferred) return null
  const user = profile.defaultLinuxUser[preferred.name]
  if (!user) return null
  return { distro: preferred.name, user }
}
