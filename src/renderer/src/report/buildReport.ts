import type { CheckDefinition, CleanResult, DiskOverview, DiskOverviewCategory, ScanResult } from '@shared/types'
import { formatBytes } from '../formatBytes'
import { translateCategoryLabel, translateCheckDescription, translateCheckName } from './translateEn'

function categoryRows(categories: DiskOverviewCategory[], depth = 0): string[] {
  const rows: string[] = []
  for (const c of [...categories].sort((a, b) => b.bytes - a.bytes)) {
    if (c.bytes <= 0) continue
    rows.push(`${'  '.repeat(depth)}- ${translateCategoryLabel(c)}: ${formatBytes(c.bytes)}`)
    if (c.children) rows.push(...categoryRows(c.children, depth + 1))
  }
  return rows
}

/** Builds a plain-text/Markdown report of the current disk overview, meant to
 * be pasted into an AI chat (or any text tool) for a cleanup analysis — so it
 * favors self-explanatory labels and an explicit closing prompt over a
 * compact machine format. Report output is English by request, independent of
 * the app's own UI (which stays German per CLAUDE.md) — see translateEn.ts. */
export function buildReport(
  overview: DiskOverview,
  definitions: CheckDefinition[],
  scanResults: Record<string, ScanResult>,
  disabledCheckIds: string[],
  cleanResults: Record<string, CleanResult> = {}
): string {
  const lines: string[] = []
  const now = new Date()

  lines.push('# WSL2 Cleaner – Storage Report')
  lines.push(`Generated on ${now.toLocaleString('en-US')}`)
  lines.push('')
  lines.push(`## Drive ${overview.driveLetter}`)
  lines.push(`- Total: ${formatBytes(overview.totalBytes)}`)
  lines.push(`- Used: ${formatBytes(overview.usedBytes)}`)
  lines.push(`- Free: ${formatBytes(overview.freeBytes)}`)
  lines.push('')

  lines.push('## Storage Breakdown (Categories)')
  lines.push(...categoryRows(overview.categories))
  lines.push('')

  const checkRows = definitions
    .map((d) => ({ def: d, result: scanResults[d.id] }))
    .filter((r) => (r.result?.bytesReclaimable ?? 0) > 0)
    .sort((a, b) => (b.result?.bytesReclaimable ?? 0) - (a.result?.bytesReclaimable ?? 0))

  if (checkRows.length > 0) {
    lines.push('## Cleanable Checks (WSL2 Cleaner)')
    lines.push('| Check | Size | Enabled | Details |')
    lines.push('|---|---|---|---|')
    for (const { def, result } of checkRows) {
      const enabled = disabledCheckIds.includes(def.id) ? 'no' : 'yes'
      const details = (result?.details ?? translateCheckDescription(def)).replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| ${translateCheckName(def)} | ${formatBytes(result?.bytesReclaimable ?? 0)} | ${enabled} | ${details} |`)
    }
    lines.push('')
  }

  const cleanedRows = definitions.filter((d) => cleanResults[d.id] !== undefined)
  if (cleanedRows.length > 0) {
    lines.push('## Recent Clean Run Results')
    lines.push(
      'Results from the last time each check was actually run in this session (not persisted across app restarts). ' +
        'Failures, partial skips (e.g. a file locked by another running app), and log output here are strong signals ' +
        'for follow-up — a check that keeps failing on the same file, or a "0 bytes freed" on a check that reported a ' +
        'large estimate, points at something worth investigating beyond a simple re-run:'
    )
    for (const d of cleanedRows) {
      const result = cleanResults[d.id]
      const parts = [`${translateCheckName(d)}: freed ${formatBytes(result.bytesFreed)}${result.dryRun ? ' (dry run)' : ''}`]
      if (result.error) parts.push(`error: ${result.error}`)
      const logLines = result.log.filter((l) => l.trim().length > 0)
      if (logLines.length > 0) {
        const shown = logLines.slice(-15)
        const omitted = logLines.length - shown.length
        const logText = shown.join(' | ')
        parts.push(`log${omitted > 0 ? ` (last ${shown.length} of ${logLines.length})` : ''}: ${logText}`)
      }
      lines.push(`- ${parts.join(' — ').replace(/\n/g, ' ')}`)
    }
    lines.push('')
  }

  if (overview.rootFolders.length > 0) {
    lines.push(`## Folder List ${overview.driveLetter}\\ (top level, sorted descending)`)
    lines.push('| Folder/File | Size |')
    lines.push('|---|---|')
    for (const f of [...overview.rootFolders].sort((a, b) => b.bytes - a.bytes)) {
      lines.push(`| ${f.label} | ${formatBytes(f.bytes)} |`)
    }
    lines.push('')
  }

  const neverScanned = definitions.filter((d) => scanResults[d.id] === undefined)
  const notEstimable = definitions.filter((d) => scanResults[d.id]?.bytesReclaimable === null)

  if (notEstimable.length > 0) {
    lines.push('## Checks without a size estimate ahead of time')
    lines.push(
      'For these checks, scanning deliberately returns no byte count — this is a technical limitation (e.g. a dynamic ' +
        'VHDX or WinSxS cannot reliably report reclaimable space ahead of time), not a tool bug. The actual savings only ' +
        'show up after running the check, via a before/after comparison. Re-scanning will not change that:'
    )
    for (const d of notEstimable) {
      lines.push(`- ${translateCheckName(d)}: ${translateCheckDescription(d)}`)
    }
    lines.push('')
  }

  if (neverScanned.length > 0) {
    lines.push('## Never-scanned checks')
    lines.push('No scan result exists yet for these checks — size unknown until scanned once in the tool:')
    for (const d of neverScanned) {
      lines.push(`- ${translateCheckName(d)}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(
    '**Note for AI analysis:** This is a storage report for a Windows machine running WSL2, generated by the ' +
      '"WSL2 Cleaner" tool. Categories whose name ends in "(manual review needed, no automatic check)" are not covered ' +
      'by any tool check — deleting anything there would need to be reviewed/done manually. The indented sub-items ' +
      'under each category are a drilldown of the largest subfolders/accounts (folded into "N more entries" past the ' +
      'top 10). Please analyze this breakdown for where the most space can be freed with the least risk, and propose ' +
      'concrete, prioritized next steps — split into "automated via WSL2 Cleaner" (see the Cleanable Checks table) and ' +
      '"manual, based on the drilldown data" (e.g. specific large subfolders under Programs/Rest of user ' +
      'profile/Other user accounts). If a "Recent Clean Run Results" section is present, also flag any errors or ' +
      'suspicious log entries there (e.g. files that could not be deleted) as their own follow-up item.'
  )

  return lines.join('\n')
}
