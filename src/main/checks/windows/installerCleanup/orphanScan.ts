import { runPowerShell } from '@main/util/powershell'

export interface OrphanFile {
  path: string
  size: number
}

const INSTALLER_DIR = 'C:\\Windows\\Installer'

// Cross-references every *.msi/*.msp cached under C:\Windows\Installer against
// the registry's record of which packages/patches are still installed
// (LocalPackage values under UserData\<SID>\Products\*\InstallProperties and
// UserData\<SID>\Patches\*, for every SID — not just the local machine SID,
// since per-user installs are recorded under the user's own SID). Anything in
// the folder that no such value points at is an orphan: Windows Installer no
// longer knows the file exists, so it's safe to remove *unless* the registry
// query itself missed something (multi-user redirection edge cases) — hence
// this only ever reports candidates, never deletes on its own.
const SCAN_SCRIPT = `
$installerDir = '${INSTALLER_DIR}'
$referenced = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
$root = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Installer\\UserData'
if (Test-Path $root) {
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
        $sidKey = $_.PSPath
        foreach ($sub in @('Products', 'Patches')) {
            $subKey = Join-Path $sidKey $sub
            if (-not (Test-Path $subKey)) { continue }
            Get-ChildItem $subKey -ErrorAction SilentlyContinue | ForEach-Object {
                $itemKey = $_.PSPath
                $propsKey = if ($sub -eq 'Products') { Join-Path $itemKey 'InstallProperties' } else { $itemKey }
                $lp = (Get-ItemProperty -Path $propsKey -Name LocalPackage -ErrorAction SilentlyContinue).LocalPackage
                if ($lp) { [void]$referenced.Add([System.IO.Path]::GetFileName($lp)) }
            }
        }
    }
}
$orphans = Get-ChildItem -LiteralPath $installerDir -File -ErrorAction SilentlyContinue |
    Where-Object { ($_.Extension -eq '.msi' -or $_.Extension -eq '.msp') -and -not $referenced.Contains($_.Name) } |
    ForEach-Object { [PSCustomObject]@{ path = $_.FullName; size = $_.Length } }
@($orphans) | ConvertTo-Json -Compress -Depth 3
`

export async function findOrphanInstallerFiles(): Promise<OrphanFile[]> {
  const { stdout } = await runPowerShell(SCAN_SCRIPT)
  const trimmed = stdout.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((o): o is { path: unknown; size: unknown } => !!o && typeof o === 'object')
      .map((o) => ({ path: String(o.path), size: Number(o.size) || 0 }))
  } catch {
    return []
  }
}
