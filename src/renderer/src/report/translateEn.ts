import type { CheckDefinition, DiskOverviewCategory } from '@shared/types'

/** English text for the report only. The app's actual UI (chart legend, check
 * list, buttons) stays German per CLAUDE.md — these dictionaries translate a
 * copy of the same strings for buildReport.ts without touching the German
 * source of truth (CheckDefinition.name/description, DiskOverviewCategory.label
 * built in src/main). Keyed by the stable `key`/`id` fields, not the German
 * text itself, so this doesn't silently go stale if the German wording changes. */

const CATEGORY_LABELS_EN: Record<string, string> = {
  'user-files': 'User files',
  programs: 'Programs (manual review needed, no automatic check)',
  os: 'Operating system',
  wsl2: 'WSL2 (OS + applications)',
  'cleanup-relevant': 'Cleanable (all checks)',
  'hidden-system': 'Hibernation / paging / restore points',
  hiberfil: 'Hibernation (hiberfil.sys)',
  pagefile: 'Paging file (pagefile.sys)',
  'shadow-copies': 'Restore points (shadow copies)',
  'profile-rest': 'Rest of user profile (OneDrive, roaming AppData, …)',
  'program-data': 'ProgramData',
  'other-users': 'Other user accounts (manual review needed, no automatic check)',
  other: 'Other'
}

const CHECK_TEXT_EN: Record<string, { name: string; description: string }> = {
  'wsl-build-rust-target': { name: 'Rust target/ directories', description: 'target/ folders next to a Cargo.toml.' },
  'wsl-build-maven-target': { name: 'Maven target/ directories', description: 'target/ folders next to a pom.xml.' },
  'wsl-build-node-modules': {
    name: 'node_modules/ directories',
    description: 'node_modules/ folders next to a package.json.'
  },
  'wsl-build-gradle-build': { name: 'Gradle build/ directories', description: 'build/ folders next to build.gradle(.kts).' },
  'wsl-build-gradle-cache': {
    name: 'Project-local .gradle caches',
    description: '.gradle/ folders next to build.gradle(.kts) or settings.gradle(.kts).'
  },
  'wsl-build-js-dist': {
    name: 'JS dist/ folders (>10MB)',
    description: 'dist/ folders next to package.json, only if larger than 10MB (avoids false positives).'
  },
  'wsl-cache-yarn': { name: 'Yarn cache', description: '~/.cache/yarn via yarn cache clean.' },
  'wsl-cache-npm': { name: 'npm cache', description: '~/.npm via npm cache clean --force.' },
  'wsl-cache-pnpm-store': { name: 'pnpm store', description: '~/.local/share/pnpm via pnpm store prune.' },
  'wsl-cache-cypress-old': { name: 'Old Cypress versions', description: '~/.cache/Cypress, keeps only the newest version.' },
  'wsl-cache-jetbrains-old': {
    name: 'Old JetBrains caches (WSL)',
    description: '~/.cache/JetBrains, keeps the current year / RemoteDev / acp-agents.'
  },
  'wsl-cache-maven-snapshots': {
    name: 'Maven SNAPSHOT + metadata',
    description: '~/.m2/repository: *SNAPSHOT* folders, *.lastUpdated, _remote.repositories.'
  },
  'wsl-toolchain-rust-old': { name: 'Old Rust toolchains', description: 'rustup toolchains other than stable/nightly/default.' },
  'wsl-cache-pip': { name: 'pip cache', description: '~/.cache/pip.' },
  'wsl-cache-bun': { name: 'Bun install cache', description: '~/.bun/install/cache.' },
  'wsl-cache-cargo-registry': { name: 'Cargo registry cache', description: '~/.cargo/registry/{cache,src}.' },
  'wsl-cache-uv': { name: 'uv cache (WSL)', description: '~/.cache/uv via uv cache clean.' },
  'wsl-cache-misc-dotcache': {
    name: 'Other ~/.cache leftovers',
    description: 'Everything in ~/.cache except the already dedicated subfolders.'
  },
  'wsl-trash': { name: 'Trash (WSL)', description: '~/.local/share/Trash.' },
  'wsl-thumbnails': { name: 'Thumbnail cache (WSL)', description: '~/.thumbnails.' },
  'wsl-docker-prune': {
    name: 'Docker system + builder prune',
    description: 'docker system prune --all --force --volumes + docker builder prune --all --force.'
  },
  'wsl-sudo-system-cleanup': {
    name: 'APT / journal / snap cleanup',
    description: 'apt-get autoremove/autoclean/clean, journalctl --vacuum-time=3d, old snap revisions.'
  },
  'win-adobe-temp': {
    name: 'Adobe temp (C:\\adobeTemp)',
    description: 'Temporary render/cache files from Adobe applications, only if the folder exists.'
  },
  'win-dism-component-cleanup': {
    name: 'DISM component cleanup',
    description:
      'Removes old Windows Update components (WinSxS cleanup). Can take several minutes; size cannot be reliably estimated ahead of time.'
  },
  'win-jetbrains-cache': {
    name: 'JetBrains cache (Windows)',
    description: 'caches/index/log/tmp per IDE install folder under %LOCALAPPDATA%\\JetBrains (rebuilt on next start).'
  },
  'win-recycle-bin': { name: 'Recycle bin', description: 'Empty the Windows recycle bin.' },
  'win-user-temp': { name: 'Windows user temp (%TEMP%)', description: 'Temporary files in the user profile (%TEMP%).' },
  'win-system-temp': {
    name: 'Windows system temp (C:\\Windows\\Temp)',
    description: 'Temporary files of the operating system.'
  },
  'win-thunderbird-cache': {
    name: 'Thunderbird cache & index',
    description: 'cache2/startupCache and *.msf index files per Thunderbird profile (rebuilt automatically).'
  },
  'win-uv-cache': {
    name: 'uv cache (Windows)',
    description: 'Cache of the native Windows uv (Python package manager), separate from the WSL uv cache.'
  },
  'win-update-cache': {
    name: 'Windows Update cache',
    description:
      'SoftwareDistribution\\Download: cached update downloads. Automatically refilled by Windows Update as needed. wuauserv/bits are briefly stopped for the deletion and restarted afterwards.'
  },
  'win-installer-orphans': {
    name: 'Orphaned Windows Installer cache files',
    description:
      'Detects .msi/.msp under C:\\Windows\\Installer no longer referenced by any installed software (registry cross-check) and moves them into a timestamped subfolder under the configured quarantine folder. Riskier than other checks: a false positive can block repair/uninstall of unrelated software, possibly not noticed for months. Requires a quarantine folder to be configured first.'
  },
  'win-installer-quarantine-purge': {
    name: 'Clean up Installer quarantine',
    description:
      'Deletes quarantine subfolders (see "Orphaned Windows Installer cache files") older than the configured retention period. Only runs automatically as part of "Clean all" if auto-delete is enabled in settings — otherwise only when triggered individually.'
  }
}

const FSTRIM_TIMER_NAME_RE = /^fstrim\.timer \((.+)\)$/
const FSTRIM_NAME_RE = /^fstrim \/ \((.+)\)$/
const VHDX_NAME_RE = /^VHDX kompaktieren: (.+)$/
const FSTRIM_TIMER_DESC_RE =
  /^Aktiviert periodisches TRIM in Distro "(.+)", damit sie auch zwischen manuellen Bereinigungen schrumpfbar bleibt\. Setzt aktives systemd voraus, sonst nur Hinweis\.$/
const FSTRIM_DESC_RE =
  /^Gibt freigegebene Blöcke der Distro "(.+)" an den Windows-Host zurück \(Voraussetzung für effektive VHDX-Kompaktierung dieser Distro\)\.$/
const VHDX_DESC_RE =
  /^Verkleinert die virtuelle Festplatte "(.+)" \((.+)\) per diskpart compact\. Setzt vollständig heruntergefahrenes WSL\/Rancher Desktop voraus\.$/

function translateCheckLabel(id: string, name: string): string {
  const known = CHECK_TEXT_EN[id]
  if (known) return known.name
  const timer = FSTRIM_TIMER_NAME_RE.exec(name)
  if (timer) return `fstrim.timer (${timer[1]})`
  const fstrim = FSTRIM_NAME_RE.exec(name)
  if (fstrim) return `fstrim / (${fstrim[1]})`
  const vhdx = VHDX_NAME_RE.exec(name)
  if (vhdx) return `Compact VHDX: ${vhdx[1]}`
  return name
}

/** Real folder/account names (e.g. "Packages", "kainz", ".claude") fall
 * through unchanged. The "cleanup-relevant" category's children are keyed by
 * check id with the check's (German) name as label — same dictionary as
 * translateCheckName below, just addressed by id+label instead of a full
 * CheckDefinition. */
export function translateCategoryLabel(category: DiskOverviewCategory): string {
  const known = CATEGORY_LABELS_EN[category.key]
  if (known) return known
  if (category.key === 'rest') {
    const match = /^Weitere (\d+) Einträge$/.exec(category.label)
    if (match) return `${match[1]} more entries`
  }
  return translateCheckLabel(category.key, category.label)
}

/** These three (fstrim, fstrim.timer, VHDX compaction) are built per-distro /
 * per-vdisk at runtime (registry.ts / vhdxCompact.ts), so there's no fixed id
 * to key a dictionary on — translate the fixed template and re-splice in the
 * distro name / VHDX label / path, which are proper nouns and stay as-is. */
export function translateCheckName(def: CheckDefinition): string {
  return translateCheckLabel(def.id, def.name)
}

export function translateCheckDescription(def: CheckDefinition): string {
  const known = CHECK_TEXT_EN[def.id]
  if (known) return known.description
  const timer = FSTRIM_TIMER_DESC_RE.exec(def.description)
  if (timer) {
    return `Enables periodic TRIM in distro "${timer[1]}" so it stays shrinkable between manual cleanups. Requires active systemd, otherwise this is just a note.`
  }
  const fstrim = FSTRIM_DESC_RE.exec(def.description)
  if (fstrim) {
    return `Returns freed blocks of distro "${fstrim[1]}" to the Windows host (prerequisite for effective VHDX compaction of this distro).`
  }
  const vhdx = VHDX_DESC_RE.exec(def.description)
  if (vhdx) {
    return `Shrinks the virtual disk "${vhdx[1]}" (${vhdx[2]}) via diskpart compact. Requires WSL/Rancher Desktop to be fully shut down.`
  }
  return def.description
}
