import { useState } from 'react'
import type { CheckDefinition } from '@shared/types'
import { useChecksStore } from '../state/checksStore'
import { formatBytes } from '../formatBytes'

interface Props {
  definition: CheckDefinition
}

const STATUS_LABEL: Record<string, string> = {
  unknown: '—',
  scanning: 'prüft…',
  scanned: 'geprüft',
  running: 'läuft…',
  done: 'fertig',
  error: 'Fehler',
  skipped: 'übersprungen'
}

export function CheckListItem({ definition }: Props): JSX.Element {
  const [logOpen, setLogOpen] = useState(false)
  const status = useChecksStore((s) => s.statuses[definition.id] ?? 'unknown')
  const scanResult = useChecksStore((s) => s.scanResults[definition.id])
  const cleanResult = useChecksStore((s) => s.cleanResults[definition.id])
  const logs = useChecksStore((s) => s.logs[definition.id] ?? [])
  const hasSudoPassword = useChecksStore((s) => s.hasSudoPassword)
  const scanOne = useChecksStore((s) => s.scanOne)
  const cleanOne = useChecksStore((s) => s.cleanOne)
  const running = useChecksStore((s) => s.running)
  const disabled = useChecksStore((s) => s.settings.disabledCheckIds.includes(definition.id))
  const setCheckDisabled = useChecksStore((s) => s.setCheckDisabled)

  const bytes = cleanResult ? cleanResult.bytesFreed : scanResult?.bytesReclaimable
  const sudoBlocked = definition.requiresSudo && !hasSudoPassword
  const errorMsg = scanResult?.error ?? cleanResult?.error
  // `running` covers a scan-all/clean-all/other row's clean in progress — only
  // this row's own live status (scanning/running) is otherwise visible here,
  // so without it every other row's buttons stayed clickable during a batch run.
  const busy = status === 'scanning' || status === 'running' || running

  return (
    <li className={`check-item check-item--${status}${disabled ? ' check-item--disabled' : ''}`}>
      <div className="check-item__main">
        <input
          type="checkbox"
          className="check-item__toggle"
          checked={!disabled}
          title="Bei „Alles bereinigen“ berücksichtigen"
          onChange={(e) => setCheckDisabled(definition.id, !e.target.checked)}
        />
        <div className="check-item__name" title={definition.description}>
          {definition.name}
          {definition.requiresSudo && <span className="badge badge--sudo">sudo</span>}
        </div>
        <div className="check-item__bytes">{formatBytes(bytes ?? null)}</div>
        <div className="check-item__status">{STATUS_LABEL[status] ?? status}</div>
        <div className="check-item__actions">
          <button className="btn btn--small" onClick={() => scanOne(definition.id)} disabled={busy}>
            Prüfen
          </button>
          <button
            className="btn btn--small btn--primary"
            onClick={() => cleanOne(definition.id)}
            disabled={busy || sudoBlocked}
            title={sudoBlocked ? 'sudo-Passwort erst hinterlegen' : undefined}
          >
            Bereinigen
          </button>
          {logs.length > 0 && (
            <button className="btn btn--small btn--ghost" onClick={() => setLogOpen((v) => !v)}>
              Log
            </button>
          )}
        </div>
      </div>
      {errorMsg && <div className="check-item__error">{errorMsg}</div>}
      {logOpen && (
        <pre className="check-item__log">{logs.join('\n')}</pre>
      )}
    </li>
  )
}
