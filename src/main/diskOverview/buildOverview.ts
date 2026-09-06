import fs from 'node:fs'
import path from 'node:path'
import { folderSizeBytes } from '@main/checks/windows/folderSize'
import { freeBytes, totalBytes } from '@main/util/diskFree'
import { runPowerShell } from '@main/util/powershell'
import type { CheckEntry } from '@main/checks/types'
import type { DiskOverview, DiskOverviewCategory, MachineProfile, ScanResult } from '@shared/types'

const USER_FOLDER_NAMES = ['Pictures', 'Videos', 'Documents', 'Music', 'Downloads', 'Desktop']

interface ChildEntry {
  name: string
  full: string
  isDir: boolean
}

function listChildrenSafe(dirPath: string): ChildEntry[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.map((e) => ({ name: e.name, full: path.join(dirPath, e.name), isDir: e.isDirectory() }))
}

function statSizeSafe(targetPath: string): number {
  try {
    return fs.statSync(targetPath).size
  } catch {
    return 0
  }
}

/** Runs `fn` over `items` with at most `limit` in flight at once — caps how
 * many robocopy.exe processes we spawn concurrently when a tree gets split
 * into many per-child measurements. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker(): Promise<void> {
    for (;;) {
      const current = nextIndex++
      if (current >= items.length) return
      results[current] = await fn(items[current])
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

type Step = <T>(label: string, p: Promise<T>) => Promise<T>

interface MeasuredChildren {
  total: number
  children: DiskOverviewCategory[]
}

/** Caps a breakdown to its `max` largest entries, folding the remainder into
 * one "Weitere N Einträge" row — keeps the report readable (and small) for
 * trees with dozens of children (e.g. C:\Windows, %APPDATA%\Roaming) without
 * losing the largest, most actionable individual offenders. */
function capChildren(children: DiskOverviewCategory[], max = 10): DiskOverviewCategory[] {
  const sorted = children.filter((c) => c.bytes > 0).sort((a, b) => b.bytes - a.bytes)
  if (sorted.length <= max) return sorted
  const top = sorted.slice(0, max)
  const restBytes = sorted.slice(max).reduce((a, c) => a + c.bytes, 0)
  const restCount = sorted.length - max
  return restBytes > 0 ? [...top, { key: 'rest', label: `Weitere ${restCount} Einträge`, bytes: restBytes }] : top
}

/** Sizes each child individually (through `step`, for per-child progress
 * reporting) and sums the result — turns one slow monolithic scan of a big
 * tree into many small, independently-reportable ones. Keeps the per-child
 * sizes so callers can surface a drilldown instead of just a total.
 * `cap: false` returns the raw per-child list uncapped, for callers that
 * still need to filter/recombine entries before applying capChildren themselves. */
async function measureChildren(
  children: ChildEntry[],
  labelPrefix: string,
  step: Step,
  cap = true
): Promise<MeasuredChildren> {
  const sizes = await mapWithConcurrency(children, 6, (c) =>
    step(`${labelPrefix}${c.name}`, c.isDir ? folderSizeBytes(c.full) : Promise.resolve(statSizeSafe(c.full)))
  )
  const total = sizes.reduce((a, b) => a + b, 0)
  const childCategories = children.map((c, i) => ({ key: c.full, label: c.name, bytes: sizes[i] }))
  return { total, children: cap ? capChildren(childCategories) : childCategories }
}

async function userFilesBytes(): Promise<number> {
  const home = process.env.USERPROFILE
  if (!home) return 0
  const sizes = await Promise.all(USER_FOLDER_NAMES.map((name) => folderSizeBytes(path.join(home, name))))
  return sizes.reduce((a, b) => a + b, 0)
}

interface ProgramsBytes {
  total: number
  programFiles: number
  programFilesX86: number
  children: DiskOverviewCategory[]
}

/** `localAppData` is the full, uncapped per-child breakdown of %LOCALAPPDATA%
 * (measured once up front) — reused here instead of re-walking that tree, and
 * combined with Program Files/(x86) into one "what's actually installed" drilldown.
 * JetBrains/uv subfolders are excluded since they already have their own
 * dedicated check and slice in the "Bereinigbar" ring, and `vhdxEntries`
 * (already-measured VHDX file sizes, physically nested under LocalAppData —
 * e.g. the Store Ubuntu distro's ext4.vhdx under LocalAppData\Packages\...) is
 * subtracted from whichever top-level child folder contains each one, since
 * those bytes are already reported under the "WSL2" category. Without this,
 * the same multi-GB VHDX file would be counted twice — once as "WSL2", once
 * as part of "Packages"/"rancher-desktop" under "Programme". */
async function programsBytes(
  profile: MachineProfile,
  localAppData: MeasuredChildren,
  vhdxEntries: DiskOverviewCategory[]
): Promise<ProgramsBytes> {
  const programFiles = await folderSizeBytes('C:\\Program Files')
  const programFilesX86 = await folderSizeBytes('C:\\Program Files (x86)')

  const vhdxBytesByChildKey = new Map<string, number>()
  for (const v of vhdxEntries) {
    const owner = localAppData.children.find((c) => v.key.toLowerCase().startsWith(`${c.key.toLowerCase()}${path.sep}`))
    if (owner) vhdxBytesByChildKey.set(owner.key, (vhdxBytesByChildKey.get(owner.key) ?? 0) + v.bytes)
  }
  const vhdxBytesTotal = vhdxEntries.reduce((a, v) => a + v.bytes, 0)
  const localAppDataAdjusted = localAppData.children.map((c) => {
    const vhdxBytes = vhdxBytesByChildKey.get(c.key)
    return vhdxBytes ? { ...c, bytes: Math.max(0, c.bytes - vhdxBytes) } : c
  })

  const excludeKeys = new Set(
    [profile.jetbrainsWindowsCachePath, profile.uvCacheWindowsPath ? path.dirname(profile.uvCacheWindowsPath) : undefined]
      .filter((p): p is string => Boolean(p))
      .map((p) => p.toLowerCase())
  )
  const alreadyCounted = localAppData.children
    .filter((c) => excludeKeys.has(c.key.toLowerCase()))
    .reduce((a, c) => a + c.bytes, 0)
  const localAppDataRest = Math.max(0, localAppData.total - alreadyCounted - vhdxBytesTotal)
  const total = programFiles + programFilesX86 + localAppDataRest

  const children = capChildren([
    { key: 'C:\\Program Files', label: 'Program Files', bytes: programFiles },
    { key: 'C:\\Program Files (x86)', label: 'Program Files (x86)', bytes: programFilesX86 },
    ...localAppDataAdjusted.filter((c) => !excludeKeys.has(c.key.toLowerCase()))
  ])
  return { total, programFiles, programFilesX86, children }
}

/** Plans the "everything else under the user profile" measurement as a flat
 * list of per-child tasks instead of scanning the whole home directory a
 * second time and subtracting what's already counted — that diff approach
 * re-walked gigabytes already covered by userFilesBytes()/the LocalAppData breakdown
 * for no reason, and was the single slowest step in the whole overview.
 * AppData\Local is skipped (already measured); AppData's other children
 * (Roaming, LocalLow, …) and every other top-level home entry become tasks. */
function planProfileRestChildren(home: string): ChildEntry[] {
  const skipTopLevel = new Set(USER_FOLDER_NAMES.map((n) => n.toLowerCase()))
  const tasks: ChildEntry[] = []
  for (const entry of listChildrenSafe(home)) {
    if (skipTopLevel.has(entry.name.toLowerCase())) continue
    if (entry.isDir && entry.name.toLowerCase() === 'appdata') {
      for (const child of listChildrenSafe(entry.full)) {
        if (child.name.toLowerCase() === 'local') continue
        tasks.push(child)
      }
      continue
    }
    tasks.push(entry)
  }
  return tasks
}

/** Sums every other account's profile folder under C:\Users — relevant on
 * shared machines. Skips junction-style pseudo-profiles (Default, Public, …). */
async function otherUserProfilesBytes(): Promise<MeasuredChildren> {
  const usersRoot = 'C:\\Users'
  const currentUser = path.basename(process.env.USERPROFILE ?? '')
  const SKIP = new Set(['Public', 'Default', 'Default User', 'All Users', currentUser])

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(usersRoot, { withFileTypes: true })
  } catch {
    return { total: 0, children: [] }
  }

  const accounts = entries.filter((e) => e.isDirectory() && !e.isSymbolicLink() && !SKIP.has(e.name))
  const sizes = await Promise.all(accounts.map((e) => folderSizeBytes(path.join(usersRoot, e.name))))
  const total = sizes.reduce((a, b) => a + b, 0)
  const children = capChildren(accounts.map((e, i) => ({ key: path.join(usersRoot, e.name), label: e.name, bytes: sizes[i] })))
  return { total, children }
}

/** Per-VHDX breakdown — this is the tool's own compaction target, so unlike
 * the other "everything else" categories it's worth showing uncapped: there
 * are only ever a handful of VHDX files (one per distro/Rancher volume). */
function wsl2Bytes(profile: MachineProfile): MeasuredChildren {
  const children: DiskOverviewCategory[] = []
  let total = 0
  for (const v of profile.vhdxPaths) {
    try {
      const bytes = fs.statSync(v.path).size
      total += bytes
      children.push({ key: v.path, label: v.label, bytes })
    } catch {
      /* file may have been removed since profile detection */
    }
  }
  return { total, children: children.sort((a, b) => b.bytes - a.bytes) }
}

/** Shadow-copy (restore point) storage — read via WMI/CIM, not folder access,
 * since "System Volume Information" is SYSTEM-ACL-only even for an elevated admin. */
async function shadowCopyBytes(): Promise<number> {
  const { stdout } = await runPowerShell(
    '(Get-CimInstance -ClassName Win32_ShadowStorage | Measure-Object -Property AllocatedSpace -Sum).Sum'
  )
  const bytes = Number(stdout.trim())
  return Number.isFinite(bytes) ? bytes : 0
}

/** Informational only — no cleanup handlers here (disabling hibernation/pagefile
 * or deleting restore points needs an explicit, separate user decision). */
async function hiddenSystemCategory(): Promise<DiskOverviewCategory> {
  const hiberfil = statSizeSafe('C:\\hiberfil.sys')
  const pagefile = statSizeSafe('C:\\pagefile.sys')
  const shadowCopies = await shadowCopyBytes()
  return {
    key: 'hidden-system',
    label: 'Ruhezustand / Auslagerung / Wiederherstellungspunkte',
    bytes: hiberfil + pagefile + shadowCopies,
    children: [
      { key: 'hiberfil', label: 'Ruhezustand (hiberfil.sys)', bytes: hiberfil },
      { key: 'pagefile', label: 'Auslagerungsdatei (pagefile.sys)', bytes: pagefile },
      { key: 'shadow-copies', label: 'Wiederherstellungspunkte (Schattenkopien)', bytes: shadowCopies }
    ]
  }
}

// Only excluded on the drive root itself — noise that's either ACL-protected
// or already visible via hiddenSystemCategory().
const ROOT_SKIP = new Set(['pagefile.sys', 'hiberfil.sys', 'system volume information'])

/** Lists every direct child of the drive root with its recursive size, reusing
 * totals already computed above (Windows, Program Files, ProgramData, Users)
 * instead of re-walking those huge trees a second time — only the small,
 * not-otherwise-measured root entries (stray files, odd top-level folders)
 * get a fresh folderSizeBytes() call here. */
async function buildRootFolders(drivePath: string, known: Record<string, number>): Promise<DiskOverviewCategory[]> {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(drivePath, { withFileTypes: true })
  } catch {
    return []
  }
  const results: DiskOverviewCategory[] = []
  for (const entry of entries) {
    const lower = entry.name.toLowerCase()
    if (ROOT_SKIP.has(lower)) continue
    const full = path.join(drivePath, entry.name)
    const bytes = lower in known ? known[lower] : entry.isDirectory() ? await folderSizeBytes(full) : statSizeSafe(full)
    if (bytes > 0) results.push({ key: full, label: entry.name, bytes })
  }
  return results.sort((a, b) => b.bytes - a.bytes)
}

function cleanupRelevantCategory(checks: CheckEntry[], lastScanResults: Record<string, ScanResult>): DiskOverviewCategory {
  const children: DiskOverviewCategory[] = []
  let total = 0
  for (const entry of checks) {
    const result = lastScanResults[entry.definition.id]
    const bytes = result?.bytesReclaimable ?? 0
    if (bytes > 0) total += bytes
    children.push({ key: entry.definition.id, label: entry.definition.name, bytes })
  }
  return { key: 'cleanup-relevant', label: 'Bereinigbar (alle Checks)', bytes: total, children }
}

export async function buildDiskOverview(
  profile: MachineProfile,
  checks: CheckEntry[],
  lastScanResults: Record<string, ScanResult>,
  driveLetter = 'C:',
  onProgress?: (completed: number, total: number, label: string) => void
): Promise<DiskOverview> {
  const drivePath = `${driveLetter}\\`
  const total = totalBytes(drivePath)
  const free = freeBytes(drivePath)
  const used = Math.max(0, total - free)

  const home = process.env.USERPROFILE
  // C:\Windows and "whatever's left of the user profile" are, by far, the two
  // slowest trees to measure — split each into per-child tasks so progress
  // ticks continuously through them instead of one multi-minute silent step.
  // Falls back to a single step if a tree can't even be listed.
  const windowsChildren = listChildrenSafe('C:\\Windows')
  const profileRestChildren = home ? planProfileRestChildren(home) : []
  const localAppDataChildren = process.env.LOCALAPPDATA ? listChildrenSafe(process.env.LOCALAPPDATA) : []

  const totalSteps =
    Math.max(1, localAppDataChildren.length) +
    1 /* user files */ +
    1 /* programs */ +
    Math.max(1, windowsChildren.length) +
    1 /* hidden system */ +
    (home ? Math.max(1, profileRestChildren.length) : 0) +
    1 /* other users */ +
    1 /* program data */ +
    1 /* root folder listing */

  // Emits the label as soon as a task STARTS, not when it finishes — a single
  // child (e.g. WinSxS) can itself take a long time, and the point of the
  // status line is showing that something is happening right now, not just
  // counting completions.
  let completedSteps = 0
  const step: Step = (label, promise) => {
    onProgress?.(completedSteps, totalSteps, label)
    return promise.then((value) => {
      completedSteps++
      return value
    })
  }

  const localAppDataPromise: Promise<MeasuredChildren> =
    localAppDataChildren.length > 0
      ? measureChildren(localAppDataChildren, 'LocalAppData\\', step, false)
      : step('Lokale AppData (Caches)', Promise.resolve({ total: 0, children: [] }))
  const localAppData = await localAppDataPromise
  const wsl2 = wsl2Bytes(profile)

  const osPromise: Promise<MeasuredChildren> =
    windowsChildren.length > 0
      ? measureChildren(windowsChildren, 'Windows\\', step)
      : step('Windows (gesamt)', folderSizeBytes('C:\\Windows')).then((total) => ({ total, children: [] }))

  const [userFiles, programs, os, cleanupRelevant, hiddenSystem] = await Promise.all([
    step('Benutzerdateien (Bilder, Videos, Dokumente, …)', userFilesBytes()),
    step('Programme (Program Files)', programsBytes(profile, localAppData, wsl2.children)),
    osPromise,
    Promise.resolve(cleanupRelevantCategory(checks, lastScanResults)),
    step('Systemdaten (Ruhezustand/Auslagerung/Wiederherstellungspunkte)', hiddenSystemCategory())
  ])

  const profileRestPromise: Promise<MeasuredChildren> = !home
    ? Promise.resolve({ total: 0, children: [] })
    : profileRestChildren.length > 0
      ? measureChildren(profileRestChildren, 'Profil\\', step)
      : step('Übriges Benutzerprofil', Promise.resolve({ total: 0, children: [] }))

  const [profileRest, otherUsers, programData] = await Promise.all([
    profileRestPromise,
    step('Andere Benutzerkonten', otherUserProfilesBytes()),
    step('ProgramData', folderSizeBytes('C:\\ProgramData'))
  ])

  const known =
    userFiles +
    programs.total +
    os.total +
    wsl2.total +
    cleanupRelevant.bytes +
    hiddenSystem.bytes +
    profileRest.total +
    otherUsers.total +
    programData
  const other = Math.max(0, used - known)

  const categories: DiskOverviewCategory[] = [
    { key: 'user-files', label: 'Benutzerdateien', bytes: userFiles },
    { key: 'programs', label: 'Programme (manuelle Prüfung nötig, kein automatischer Check)', bytes: programs.total, children: programs.children },
    { key: 'os', label: 'Betriebssystem', bytes: os.total, children: os.children },
    { key: 'wsl2', label: 'WSL2 (Betriebssystem + Anwendungen)', bytes: wsl2.total, children: wsl2.children },
    cleanupRelevant,
    hiddenSystem,
    {
      key: 'profile-rest',
      label: 'Übriges Benutzerprofil (OneDrive, Roaming AppData, …)',
      bytes: profileRest.total,
      children: profileRest.children
    },
    { key: 'program-data', label: 'ProgramData', bytes: programData },
    {
      key: 'other-users',
      label: 'Andere Benutzerkonten (manuelle Prüfung nötig, kein automatischer Check)',
      bytes: otherUsers.total,
      children: otherUsers.children
    },
    { key: 'other', label: 'Sonstiges', bytes: other }
  ]

  // Reuse totals already measured above for the root entries they correspond
  // to, instead of re-walking Windows/Program Files/ProgramData/Users a
  // second time through robocopy.
  const knownRootBytes: Record<string, number> = {
    windows: os.total,
    'program files': programs.programFiles,
    'program files (x86)': programs.programFilesX86,
    programdata: programData,
    users: localAppData.total + userFiles + profileRest.total + otherUsers.total
  }
  const rootFolders = await step('Speicherplatz erkunden (Ordnerliste)', buildRootFolders(drivePath, knownRootBytes))

  return {
    driveLetter,
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    categories,
    rootFolders,
    computedAt: Date.now()
  }
}
