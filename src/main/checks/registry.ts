import type { CheckDefinition, MachineProfile } from '@shared/types'
import type { CheckEntry } from './types'
import { makeWslCheck } from './wsl/genericWslCheck'
import type { DistroTarget } from './wsl/genericWslCheck'
import { winUserTempCheck, winSystemTempCheck } from './windows/tempFiles'
import { winAdobeTempCheck } from './windows/adobeTemp'
import { winUvCacheCheck } from './windows/uvCacheWindows'
import { winThunderbirdCheck } from './windows/thunderbird'
import { winJetbrainsCheck } from './windows/jetbrainsWindows'
import { winRecycleBinCheck } from './windows/recycleBin'
import { winDismCheck } from './windows/dism'
import { winUpdateCacheCheck } from './windows/windowsUpdateCache'
import { winInstallerOrphansCheck } from './windows/installerCleanup/orphans'
import { winInstallerQuarantinePurgeCheck } from './windows/installerCleanup/quarantinePurge'
import { makeVhdxCheck } from './vhdx/vhdxCompact'

// --- WSL build artifacts (docs/hd-laptop/wsl/clean-target-dirs.sh) -----------

const wslBuildDefinitions: CheckDefinition[] = [
  {
    id: 'wsl-build-rust-target',
    name: 'Rust target/-Verzeichnisse',
    category: 'wsl-build-artifacts',
    platform: 'wsl',
    requiresSudo: false,
    description: 'target/-Ordner neben einer Cargo.toml.'
  },
  {
    id: 'wsl-build-maven-target',
    name: 'Maven target/-Verzeichnisse',
    category: 'wsl-build-artifacts',
    platform: 'wsl',
    requiresSudo: false,
    description: 'target/-Ordner neben einer pom.xml.'
  },
  {
    id: 'wsl-build-node-modules',
    name: 'node_modules/-Verzeichnisse',
    category: 'wsl-build-artifacts',
    platform: 'wsl',
    requiresSudo: false,
    description: 'node_modules/-Ordner neben einer package.json.'
  },
  {
    id: 'wsl-build-gradle-build',
    name: 'Gradle build/-Verzeichnisse',
    category: 'wsl-build-artifacts',
    platform: 'wsl',
    requiresSudo: false,
    description: 'build/-Ordner neben build.gradle(.kts).'
  },
  {
    id: 'wsl-build-gradle-cache',
    name: 'Projekt-lokale .gradle-Caches',
    category: 'wsl-build-artifacts',
    platform: 'wsl',
    requiresSudo: false,
    description: '.gradle/-Ordner neben build.gradle(.kts) oder settings.gradle(.kts).'
  },
  {
    id: 'wsl-build-js-dist',
    name: 'JS dist/-Ordner (>10MB)',
    category: 'wsl-build-artifacts',
    platform: 'wsl',
    requiresSudo: false,
    description: 'dist/-Ordner neben package.json, nur wenn größer als 10MB (vermeidet False-Positives).'
  }
]

// --- WSL package/IDE caches (docs/hd-laptop/wsl/clean-caches.sh + cleanup.sh) --

const wslCacheDefinitions: CheckDefinition[] = [
  { id: 'wsl-cache-yarn', name: 'Yarn Cache', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.cache/yarn via yarn cache clean.' },
  { id: 'wsl-cache-npm', name: 'npm Cache', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.npm via npm cache clean --force.' },
  { id: 'wsl-cache-pnpm-store', name: 'pnpm Store', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.local/share/pnpm via pnpm store prune.' },
  { id: 'wsl-cache-cypress-old', name: 'Alte Cypress-Versionen', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.cache/Cypress, behält nur die neueste Version.' },
  { id: 'wsl-cache-jetbrains-old', name: 'Alte JetBrains-Caches (WSL)', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.cache/JetBrains, behält aktuelles Jahr / RemoteDev / acp-agents.' },
  { id: 'wsl-cache-maven-snapshots', name: 'Maven SNAPSHOT + Metadaten', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.m2/repository: *SNAPSHOT*-Ordner, *.lastUpdated, _remote.repositories.' },
  { id: 'wsl-toolchain-rust-old', name: 'Alte Rust-Toolchains', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: 'rustup-Toolchains außer stable/nightly/default.' },
  { id: 'wsl-cache-pip', name: 'pip Cache', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.cache/pip.' },
  { id: 'wsl-cache-bun', name: 'Bun Install-Cache', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.bun/install/cache.' },
  { id: 'wsl-cache-cargo-registry', name: 'Cargo Registry Cache', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.cargo/registry/{cache,src}.' },
  { id: 'wsl-cache-uv', name: 'uv Cache (WSL)', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.cache/uv via uv cache clean.' },
  { id: 'wsl-cache-misc-dotcache', name: 'Sonstige ~/.cache-Reste', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: 'Alles in ~/.cache außer den bereits dediziert erfassten Unterordnern.' },
  { id: 'wsl-trash', name: 'Papierkorb (WSL)', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.local/share/Trash.' },
  { id: 'wsl-thumbnails', name: 'Thumbnail-Cache (WSL)', category: 'wsl-package-caches', platform: 'wsl', requiresSudo: false, description: '~/.thumbnails.' }
]

// --- WSL docker / system (sudo) ------------------------------------------------

const wslSystemDefinitions: CheckDefinition[] = [
  {
    id: 'wsl-docker-prune',
    name: 'Docker system + builder prune',
    category: 'docker',
    platform: 'wsl',
    requiresSudo: false,
    requiresRancherRunning: true,
    description: 'docker system prune --all --force --volumes + docker builder prune --all --force.'
  },
  {
    id: 'wsl-sudo-system-cleanup',
    name: 'APT / Journal / Snap Cleanup',
    category: 'wsl-system-sudo',
    platform: 'wsl',
    requiresSudo: true,
    description: 'apt-get autoremove/autoclean/clean, journalctl --vacuum-time=3d, alte Snap-Revisionen.'
  }
]

function distroSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

// --- fstrim / fstrim.timer: one pair PER registered WSL distro ----------------
// A single "default distro" isn't enough here — Rancher Desktop keeps its
// container/image data in its own separate WSL distro(s) (e.g. "rancher-desktop",
// "rancher-desktop-data"), each with its own VHDX. TRIM has to run *inside* the
// distro that owns the blocks being freed, so every distro we have credentials
// for gets its own check pair. cleaner.sh only knows the fixed ids "wsl-fstrim" /
// "wsl-fstrim-timer" (see scriptId), so behavior stays identical to before —
// just replicated per distro. Distros without systemd (Rancher's minimal VMs)
// degrade gracefully: check_fstrim_timer reports a no-op instead of erroring.
function buildFstrimChecksForAllDistros(profile: MachineProfile): CheckEntry[] {
  const entries: CheckEntry[] = []
  for (const d of profile.wslDistros) {
    const user = profile.defaultLinuxUser[d.name]
    if (!user || !d.bashCapable) continue
    const slug = distroSlug(d.name)
    const target: DistroTarget = { distro: d.name, user }

    entries.push(
      makeWslCheck(
        {
          id: `wsl-fstrim-${slug}`,
          scriptId: 'wsl-fstrim',
          name: `fstrim / (${d.name})`,
          category: 'wsl-system-sudo',
          platform: 'wsl',
          requiresSudo: true,
          description: `Gibt freigegebene Blöcke der Distro "${d.name}" an den Windows-Host zurück (Voraussetzung für effektive VHDX-Kompaktierung dieser Distro).`
        },
        () => true,
        target
      )
    )
    entries.push(
      makeWslCheck(
        {
          id: `wsl-fstrim-timer-${slug}`,
          scriptId: 'wsl-fstrim-timer',
          name: `fstrim.timer (${d.name})`,
          category: 'wsl-system-sudo',
          platform: 'wsl',
          requiresSudo: true,
          description: `Aktiviert periodisches TRIM in Distro "${d.name}", damit sie auch zwischen manuellen Bereinigungen schrumpfbar bleibt. Setzt aktives systemd voraus, sonst nur Hinweis.`
        },
        () => true,
        target
      )
    )
  }
  return entries
}

function buildWslChecks(profile: MachineProfile): CheckEntry[] {
  const base = [...wslBuildDefinitions, ...wslCacheDefinitions, ...wslSystemDefinitions].map((def) => makeWslCheck(def))
  return [...base, ...buildFstrimChecksForAllDistros(profile)]
}

// --- Windows-side checks --------------------------------------------------------

function buildWindowsChecks(): CheckEntry[] {
  return [
    winUserTempCheck,
    winSystemTempCheck,
    winAdobeTempCheck,
    winUvCacheCheck,
    winThunderbirdCheck,
    winJetbrainsCheck,
    winRecycleBinCheck,
    winDismCheck,
    winUpdateCacheCheck,
    winInstallerOrphansCheck,
    winInstallerQuarantinePurgeCheck
  ]
}

// --- VHDX compaction (dynamic: depends on what the profile discovered) --------

const VHDX_LABEL_TO_ID: Record<string, string> = {
  'Rancher Desktop distro-data': 'vhdx-rancher-distro-data',
  'Rancher Desktop distro': 'vhdx-rancher-distro',
  'Ubuntu (Store app)': 'vhdx-ubuntu-store'
}

function vhdxIdForLabel(label: string, index: number): string {
  return VHDX_LABEL_TO_ID[label] ?? `vhdx-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`
}

function buildVhdxChecks(profile: MachineProfile): CheckEntry[] {
  return profile.vhdxPaths.map((info, i) => makeVhdxCheck(info, vhdxIdForLabel(info.label, i)))
}

/** Builds the full, machine-specific check list. Call again after profile:refresh. */
export function buildRegistry(profile: MachineProfile): CheckEntry[] {
  const all = [...buildWslChecks(profile), ...buildWindowsChecks(), ...buildVhdxChecks(profile)]
  return all.filter((entry) => entry.isApplicable(profile))
}
