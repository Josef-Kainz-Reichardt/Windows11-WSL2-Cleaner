import { useState } from 'react'
import { api } from '../api/rendererApi'
import { useChecksStore } from '../state/checksStore'

export function SudoPasswordDialog(): JSX.Element {
  const hasSudoPassword = useChecksStore((s) => s.hasSudoPassword)
  const refreshHasSudoPassword = useChecksStore((s) => s.refreshHasSudoPassword)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(): Promise<void> {
    if (!password) return
    setBusy(true)
    setError(null)
    try {
      await api.secrets.setSudoPassword(password)
      setPassword('')
      setOpen(false)
      await refreshHasSudoPassword()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function clear(): Promise<void> {
    setBusy(true)
    try {
      await api.secrets.clearSudoPassword()
      await refreshHasSudoPassword()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sudo-dialog">
      <button className="btn btn--ghost" onClick={() => setOpen((v) => !v)}>
        {hasSudoPassword ? '🔒 sudo-Passwort gespeichert' : '🔓 sudo-Passwort hinterlegen'}
      </button>
      {open && (
        <div className="sudo-dialog__panel">
          <p>
            Wird verschlüsselt (Windows DPAPI, an dieses Benutzerkonto gebunden) gespeichert und für WSL-sudo-Befehle
            verwendet, damit es nicht bei jedem Lauf erneut eingegeben werden muss.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="WSL-Sudo-Passwort"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
          <div className="sudo-dialog__actions">
            <button className="btn btn--primary" onClick={submit} disabled={busy || !password}>
              Speichern
            </button>
            {hasSudoPassword && (
              <button className="btn btn--ghost" onClick={clear} disabled={busy}>
                Löschen
              </button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}
    </div>
  )
}
