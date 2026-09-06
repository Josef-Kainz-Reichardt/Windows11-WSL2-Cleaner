import { useEffect, useState } from 'react'
import type { RancherConfirmRequest } from '@shared/types'
import { api } from '../api/rendererApi'

const ACTION_LABEL: Record<RancherConfirmRequest['action'], string> = {
  start: 'Rancher Desktop starten',
  stop: 'Rancher Desktop stoppen'
}

export function RancherConfirmDialog(): JSX.Element | null {
  const [queue, setQueue] = useState<RancherConfirmRequest[]>([])
  const [suppress, setSuppress] = useState(false)

  useEffect(
    () => api.events.onRancherConfirmRequest((req) => setQueue((q) => [...q, req])),
    []
  )

  const current = queue[0]
  if (!current) return null

  async function answer(proceed: boolean): Promise<void> {
    await api.rancher.confirmAnswer({
      requestId: current.requestId,
      action: current.action,
      proceed,
      suppressSession: suppress
    })
    setSuppress(false)
    setQueue((q) => q.slice(1))
  }

  return (
    <div className="confirm-overlay">
      <div className="confirm-modal">
        <h3>{ACTION_LABEL[current.action]}?</h3>
        <p>{current.reason}</p>
        <label className="confirm-modal__suppress">
          <input type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} />
          Für diese Sitzung nicht mehr fragen
        </label>
        <div className="confirm-modal__actions">
          <button className="btn btn--primary" onClick={() => answer(true)}>
            Ja
          </button>
          <button className="btn btn--ghost" onClick={() => answer(false)}>
            Nein
          </button>
        </div>
      </div>
    </div>
  )
}
