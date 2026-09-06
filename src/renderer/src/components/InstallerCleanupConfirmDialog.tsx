import { useEffect, useState } from 'react'
import type { InstallerConfirmRequest } from '@shared/types'
import { api } from '../api/rendererApi'

export function InstallerCleanupConfirmDialog(): JSX.Element | null {
  const [queue, setQueue] = useState<InstallerConfirmRequest[]>([])
  const [suppress, setSuppress] = useState(false)

  useEffect(
    () => api.events.onInstallerConfirmRequest((req) => setQueue((q) => [...q, req])),
    []
  )

  const current = queue[0]
  if (!current) return null

  async function answer(proceed: boolean): Promise<void> {
    await api.installerCleanup.confirmAnswer({
      requestId: current.requestId,
      proceed,
      suppressSession: suppress
    })
    setSuppress(false)
    setQueue((q) => q.slice(1))
  }

  return (
    <div className="confirm-overlay">
      <div className="confirm-modal">
        <h3>⚠️ Windows-Installer-Cache bereinigen?</h3>
        <p>{current.reason}</p>
        <p>
          Falsch erkannte Dateien können die spätere Reparatur oder Deinstallation unbeteiligter Software verhindern —
          das fällt möglicherweise erst Monate später auf. Die Originale werden vorher in einen Zeitstempel-Ordner
          verschoben, nicht sofort gelöscht.
        </p>
        <label className="confirm-modal__suppress">
          <input type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
          Für diese Sitzung nicht mehr fragen
        </label>
        <div className="confirm-modal__actions">
          <button className="btn btn--primary" onClick={() => answer(true)}>
            Ja, bereinigen
          </button>
          <button className="btn btn--ghost" onClick={() => answer(false)}>
            Nein
          </button>
        </div>
      </div>
    </div>
  )
}
