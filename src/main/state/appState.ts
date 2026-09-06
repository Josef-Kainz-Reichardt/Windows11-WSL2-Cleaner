import type { AppSettings, CheckCategory, MachineProfile, CheckStatus, ScanResult } from '@shared/types'
import type { CheckEntry, CheckContext } from '@main/checks/types'
import { buildRegistry } from '@main/checks/registry'
import { detectMachineProfile, pickDefaultDistro } from '@main/profile/detectProfile'
import {
  getStoredProfile,
  setStoredProfile,
  getLastScanResults,
  setLastScanResult,
  getStoredSettings,
  setStoredSettings
} from '@main/config/store'
import { getSudoPasswordPlain } from '@main/secrets/sudoPassword'

interface AppState {
  profile: MachineProfile | null
  checks: CheckEntry[]
  statuses: Record<string, CheckStatus>
  defaultWsl: { distro: string; user: string } | null
  settings: AppSettings
}

const state: AppState = {
  profile: null,
  checks: [],
  statuses: {},
  defaultWsl: null,
  settings: {
    extraProjectRootNames: [],
    disabledCheckIds: [],
    installerQuarantineDir: null,
    installerQuarantineRetentionDays: 30,
    installerQuarantineAutoDelete: false
  }
}

function applyProfile(profile: MachineProfile): void {
  state.profile = profile
  state.checks = buildRegistry(profile)
  state.defaultWsl = pickDefaultDistro(profile)
  for (const c of state.checks) {
    if (!(c.definition.id in state.statuses)) state.statuses[c.definition.id] = 'unknown'
  }
}

export async function initAppState(): Promise<void> {
  state.settings = getStoredSettings()
  let profile = getStoredProfile()
  // A profile cached before the `bashCapable` field existed has it `undefined`
  // on every distro — re-detect once rather than silently dropping every
  // per-distro fstrim check until the user happens to hit "refresh".
  const isStale = !profile || profile.wslDistros.some((d) => typeof d.bashCapable !== 'boolean')
  if (isStale) {
    profile = await detectMachineProfile(state.settings.extraProjectRootNames)
    setStoredProfile(profile)
  }
  applyProfile(profile!)
}

export async function refreshProfile(): Promise<MachineProfile> {
  const profile = await detectMachineProfile(state.settings.extraProjectRootNames)
  setStoredProfile(profile)
  applyProfile(profile)
  return profile
}

export function getProfile(): MachineProfile {
  if (!state.profile) throw new Error('app state not initialized — call initAppState() first')
  return state.profile
}

export function getChecks(): CheckEntry[] {
  return state.checks
}

export function findCheck(id: string): CheckEntry | undefined {
  return state.checks.find((c) => c.definition.id === id)
}

export function getDefaultWsl(): { distro: string; user: string } | null {
  return state.defaultWsl
}

export function setStatus(id: string, status: CheckStatus): void {
  state.statuses[id] = status
}

export function getStatus(id: string): CheckStatus {
  return state.statuses[id] ?? 'unknown'
}

export function getAllStatuses(): Record<string, CheckStatus> {
  return { ...state.statuses }
}

export function buildCheckContext(): CheckContext {
  return {
    profile: getProfile(),
    wslDistro: state.defaultWsl?.distro,
    wslUser: state.defaultWsl?.user,
    sudoPassword: getSudoPasswordPlain(),
    settings: state.settings
  }
}

export function recordScanResult(result: ScanResult): void {
  setLastScanResult(result)
}

export function getScanResults(): Record<string, ScanResult> {
  return getLastScanResults()
}

export function getSettings(): AppSettings {
  return state.settings
}

export function isCheckDisabled(checkId: string): boolean {
  return state.settings.disabledCheckIds.includes(checkId)
}

function persistSettings(): void {
  setStoredSettings(state.settings)
}

export async function setExtraProjectRootNames(names: string[]): Promise<AppSettings> {
  state.settings = { ...state.settings, extraProjectRootNames: names }
  persistSettings()
  await refreshProfile()
  return state.settings
}

export function setCheckDisabled(checkId: string, disabled: boolean): AppSettings {
  const set = new Set(state.settings.disabledCheckIds)
  if (disabled) set.add(checkId)
  else set.delete(checkId)
  state.settings = { ...state.settings, disabledCheckIds: [...set] }
  persistSettings()
  return state.settings
}

export function setCategoryDisabled(category: CheckCategory, disabled: boolean): AppSettings {
  const set = new Set(state.settings.disabledCheckIds)
  for (const c of state.checks) {
    if (c.definition.category !== category) continue
    if (disabled) set.add(c.definition.id)
    else set.delete(c.definition.id)
  }
  state.settings = { ...state.settings, disabledCheckIds: [...set] }
  persistSettings()
  return state.settings
}

export function setInstallerQuarantineDir(dir: string | null): AppSettings {
  state.settings = { ...state.settings, installerQuarantineDir: dir }
  persistSettings()
  return state.settings
}

export function setInstallerQuarantineRetentionDays(days: number): AppSettings {
  state.settings = { ...state.settings, installerQuarantineRetentionDays: Math.max(1, Math.round(days)) }
  persistSettings()
  return state.settings
}

export function setInstallerQuarantineAutoDelete(enabled: boolean): AppSettings {
  state.settings = { ...state.settings, installerQuarantineAutoDelete: enabled }
  persistSettings()
  return state.settings
}
