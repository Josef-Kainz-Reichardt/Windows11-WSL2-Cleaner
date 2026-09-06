import Store from 'electron-store'
import type { AppSettings, DiskOverview, MachineProfile, ScanResult } from '@shared/types'

interface StoreSchema {
  machineProfile: MachineProfile | null
  lastScanResults: Record<string, ScanResult>
  diskOverview: DiskOverview | null
  settings: AppSettings
}

// Deliberately separate from secrets/sudoPassword.ts — this file is plain
// JSON on disk and must never hold the sudo password.
const store = new Store<StoreSchema>({
  name: 'config',
  defaults: {
    machineProfile: null,
    lastScanResults: {},
    diskOverview: null,
    settings: {
      extraProjectRootNames: [],
      disabledCheckIds: [],
      installerQuarantineDir: null,
      installerQuarantineRetentionDays: 30,
      installerQuarantineAutoDelete: false
    }
  }
})

export function getStoredProfile(): MachineProfile | null {
  return store.get('machineProfile')
}

export function setStoredProfile(profile: MachineProfile): void {
  store.set('machineProfile', profile)
}

export function getLastScanResults(): Record<string, ScanResult> {
  return store.get('lastScanResults')
}

export function setLastScanResult(result: ScanResult): void {
  const all = store.get('lastScanResults')
  all[result.checkId] = result
  store.set('lastScanResults', all)
}

export function getStoredDiskOverview(): DiskOverview | null {
  return store.get('diskOverview')
}

export function setStoredDiskOverview(overview: DiskOverview): void {
  store.set('diskOverview', overview)
}

export function getStoredSettings(): AppSettings {
  return store.get('settings')
}

export function setStoredSettings(settings: AppSettings): void {
  store.set('settings', settings)
}
