import type { CheckDefinition, ScanResult, CleanResult, RunOptions, MachineProfile, AppSettings } from '@shared/types'

export type LogSink = (level: 'info' | 'warn' | 'error', message: string) => void

export interface CheckContext {
  profile: MachineProfile
  wslDistro?: string
  wslUser?: string
  sudoPassword?: string | null
  settings: AppSettings
}

export interface CheckHandlers {
  scan(ctx: CheckContext, onLog: LogSink): Promise<ScanResult>
  clean(ctx: CheckContext, opts: RunOptions, onLog: LogSink): Promise<CleanResult>
}

export interface CheckEntry {
  definition: CheckDefinition
  handlers: CheckHandlers
  /** False if this check doesn't apply on the current machine (e.g. adobeTemp folder missing). */
  isApplicable(profile: MachineProfile): boolean
}
