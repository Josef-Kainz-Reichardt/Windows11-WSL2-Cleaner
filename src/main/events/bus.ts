import { EventEmitter } from 'node:events'
import type { DismProgressEvent, RancherStatusEvent, LogEvent, ProgressEvent } from '@shared/types'

/** Process-wide event bus. IPC registration subscribes to these and forwards to the renderer. */
class AppEventBus extends EventEmitter {}
export const appEvents = new AppEventBus()

export const EVENTS = {
  dismProgress: 'dism:progress',
  rancherStatus: 'rancher:statusChanged',
  checkLog: 'checks:log',
  checkStatus: 'checks:statusChanged'
} as const

export function emitDismProgress(payload: DismProgressEvent): void {
  appEvents.emit(EVENTS.dismProgress, payload)
}

export function emitRancherStatus(payload: RancherStatusEvent): void {
  appEvents.emit(EVENTS.rancherStatus, payload)
}

export function emitCheckLog(payload: LogEvent): void {
  appEvents.emit(EVENTS.checkLog, payload)
}

export function emitCheckStatus(payload: ProgressEvent): void {
  appEvents.emit(EVENTS.checkStatus, payload)
}
