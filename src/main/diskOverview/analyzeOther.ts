import fs from 'node:fs'
import path from 'node:path'
import { folderSizeBytes } from '@main/checks/windows/folderSize'
import type { DiskOverviewCategory } from '@shared/types'

// Only excluded on the drive root itself: not "already covered by a category"
// (that assumption turned out to hide the real answer — see below), just
// noise that's either ACL-protected or already visible via hiddenSystem.
const ROOT_SKIP = new Set(['pagefile.sys', 'hiberfil.sys', 'system volume information'])

function statSizeSafe(targetPath: string): number {
  try {
    return fs.statSync(targetPath).size
  } catch {
    return 0
  }
}

function isDriveRoot(targetPath: string): boolean {
  return /^[A-Za-z]:\\?$/.test(targetPath)
}

/** Sizes every child of `targetPath` — a generic one-level drill-down used to
 * explore where disk space actually goes. Excluding whole top-level folders
 * (Windows, Users, ProgramData, …) as "already counted elsewhere" turned out
 * to hide the real culprit, since buildOverview's per-folder measurements can
 * themselves undercount (ACL-protected subtrees, long paths, reparse points).
 * So instead of a one-shot diff, this lets the user recursively expand any
 * folder, including those, to find the actual big consumer. Run on demand
 * only (not on every refresh) since a full folder scan is slow. */
export async function listFolderChildren(targetPath: string): Promise<DiskOverviewCategory[]> {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(targetPath, { withFileTypes: true })
  } catch {
    return []
  }

  const skipRoot = isDriveRoot(targetPath)
  const results: DiskOverviewCategory[] = []
  for (const entry of entries) {
    if (skipRoot && ROOT_SKIP.has(entry.name.toLowerCase())) continue
    const full = path.join(targetPath, entry.name)
    const bytes = entry.isDirectory() ? await folderSizeBytes(full) : statSizeSafe(full)
    if (bytes > 0) results.push({ key: full, label: entry.name, bytes })
  }
  return results.sort((a, b) => b.bytes - a.bytes)
}
