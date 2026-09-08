import { useEffect, useState } from 'react'
import { api } from '../api/rendererApi'
import { useChecksStore } from '../state/checksStore'

export function SettingsDialog(): JSX.Element {
  const extraProjectRootNames = useChecksStore((s) => s.settings.extraProjectRootNames)
  const setExtraProjectRootNames = useChecksStore((s) => s.setExtraProjectRootNames)
  const installerQuarantineDir = useChecksStore((s) => s.settings.installerQuarantineDir)
  const installerQuarantineRetentionDays = useChecksStore((s) => s.settings.installerQuarantineRetentionDays)
  const installerQuarantineAutoDelete = useChecksStore((s) => s.settings.installerQuarantineAutoDelete)
  const pickInstallerQuarantineDir = useChecksStore((s) => s.pickInstallerQuarantineDir)
  const setInstallerQuarantineDir = useChecksStore((s) => s.setInstallerQuarantineDir)
  const setInstallerQuarantineRetentionDays = useChecksStore((s) => s.setInstallerQuarantineRetentionDays)
  const setInstallerQuarantineAutoDelete = useChecksStore((s) => s.setInstallerQuarantineAutoDelete)
  const appVersion = useChecksStore((s) => s.appVersion)
  const updateChecking = useChecksStore((s) => s.updateChecking)
  const updateCheckResult = useChecksStore((s) => s.updateCheckResult)
  const updateReadyVersion = useChecksStore((s) => s.updateReadyVersion)
  const checkForUpdates = useChecksStore((s) => s.checkForUpdates)
  const installUpdate = useChecksStore((s) => s.installUpdate)
  const hasSudoPassword = useChecksStore((s) => s.hasSudoPassword)
  const refreshHasSudoPassword = useChecksStore((s) => s.refreshHasSudoPassword)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sudoPassword, setSudoPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choosePicker(): Promise<void> {
    const dir = await pickInstallerQuarantineDir()
    if (dir) await setInstallerQuarantineDir(dir)
  }

  // Local textarea/password state only tracks the store while the modal is
  // open, so a background profile refresh can't clobber an in-progress edit.
  useEffect(() => {
    if (open) {
      setText(extraProjectRootNames.join('\n'))
      setSudoPassword('')
      setSaved(false)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close(): void {
    setOpen(false)
  }

  async function submit(): Promise<void> {
    const names = Array.from(
      new Set(
        text
          .split(/[\n,]/)
          .map((n) => n.trim())
          .filter((n) => n.length > 0)
      )
    )
    setBusy(true)
    setError(null)
    try {
      await setExtraProjectRootNames(names)
      if (sudoPassword) {
        await api.secrets.setSudoPassword(sudoPassword)
        setSudoPassword('')
        await refreshHasSudoPassword()
      }
      setSaved(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function clearSudoPassword(): Promise<void> {
    setBusy(true)
    try {
      await api.secrets.clearSudoPassword()
      await refreshHasSudoPassword()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn btn--ghost" onClick={() => setOpen(true)}>
        ⚙️ Einstellungen
      </button>
      {open && (
        <div className="confirm-overlay" onClick={close}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal__header">
              <h3>Einstellungen</h3>
              <button className="settings-modal__close" onClick={close} aria-label="Schließen">
                ✕
              </button>
            </div>

            <div className="settings-modal__body">
              <h4>Version</h4>
              <p>Windows11-WSL2-Cleaner {appVersion || '…'}</p>
              <div className="settings-dialog__actions">
                {updateReadyVersion ? (
                  <>
                    <button className="btn btn--primary" onClick={installUpdate}>
                      Jetzt installieren und neu starten
                    </button>
                    <span className="settings-dialog__saved">
                      Update {updateReadyVersion} heruntergeladen
                    </span>
                  </>
                ) : (
                  <>
                    <button className="btn btn--ghost" onClick={checkForUpdates} disabled={updateChecking}>
                      {updateChecking ? 'Suche…' : 'Nach Updates suchen'}
                    </button>
                    {updateCheckResult && (
                      <span className="settings-dialog__saved">
                        {updateCheckResult.status === 'update-available' &&
                          `Update ${updateCheckResult.version} wird im Hintergrund heruntergeladen…`}
                        {updateCheckResult.status === 'up-to-date' && 'Aktuelle Version ist installiert'}
                        {updateCheckResult.status === 'error' && `Fehler: ${updateCheckResult.error}`}
                      </span>
                    )}
                  </>
                )}
              </div>

              <h4>Zusätzliche Projekt-Root-Namen</h4>
              <p>
                Ordnernamen direkt unter $HOME, die zusätzlich zu den eingebauten Standards (work, projects, src, dev,
                code, repos, git, source, workspace) nach Build-Artefakten durchsucht werden. Einer pro Zeile oder mit
                Komma getrennt.
              </p>
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setSaved(false)
                }}
                rows={4}
                placeholder="z.B. code&#10;repos"
              />

              <h4>Installer-Quarantäne</h4>
              <p>
                Ordner, in den verwaiste <code>C:\Windows\Installer</code>-Dateien verschoben werden (Check "Verwaiste
                Windows-Installer-Cache-Dateien"), je Lauf in einen eigenen Zeitstempel-Unterordner. Für echten
                Platzgewinn am besten ein anderes Laufwerk als C: wählen, sonst wird nur umsortiert statt freigegeben.
              </p>
              <div className="settings-dialog__row">
                <input type="text" value={installerQuarantineDir ?? ''} readOnly placeholder="nicht konfiguriert" />
                <button className="btn btn--ghost" onClick={choosePicker}>
                  Ordner wählen…
                </button>
              </div>

              <label className="settings-dialog__row">
                Aufbewahrung (Tage) bevor ein Archiv als löschbar gilt:
                <input
                  type="number"
                  min={1}
                  value={installerQuarantineRetentionDays}
                  onChange={(e) => setInstallerQuarantineRetentionDays(Number(e.target.value) || 1)}
                />
              </label>

              <label className="settings-dialog__row">
                <input
                  type="checkbox"
                  checked={installerQuarantineAutoDelete}
                  onChange={(e) => setInstallerQuarantineAutoDelete(e.target.checked)}
                />
                Abgelaufene Archive automatisch bei "Alles bereinigen" löschen (sonst nur manuell über den Check
                "Installer-Quarantäne aufräumen")
              </label>

              <h4>WSL-Sudo-Passwort</h4>
              <p>
                Wird verschlüsselt (Windows DPAPI, an dieses Benutzerkonto gebunden) gespeichert und für WSL-sudo-Befehle
                verwendet, damit es nicht bei jedem Lauf erneut eingegeben werden muss.
                {hasSudoPassword ? ' Aktuell gespeichert: 🔒 ja.' : ' Aktuell gespeichert: 🔓 nein.'}
              </p>
              <div className="settings-dialog__row">
                <input
                  type="password"
                  value={sudoPassword}
                  onChange={(e) => {
                    setSudoPassword(e.target.value)
                    setSaved(false)
                  }}
                  placeholder={hasSudoPassword ? 'neues Passwort setzen…' : 'WSL-Sudo-Passwort'}
                />
                {hasSudoPassword && (
                  <button className="btn btn--ghost" onClick={clearSudoPassword} disabled={busy}>
                    Löschen
                  </button>
                )}
              </div>
            </div>

            <div className="settings-modal__footer">
              <button className="btn btn--primary" onClick={submit} disabled={busy}>
                Speichern
              </button>
              {saved && <span className="settings-dialog__saved">Gespeichert — Profil wird neu erkannt…</span>}
              {error && <span className="error-text">{error}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
