import { useEffect, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function choosePicker(): Promise<void> {
    const dir = await pickInstallerQuarantineDir()
    if (dir) await setInstallerQuarantineDir(dir)
  }

  // Local textarea state only tracks the store while the panel is open, so a
  // background profile refresh (which doesn't change these names) can't clobber
  // an in-progress edit.
  useEffect(() => {
    if (open) {
      setText(extraProjectRootNames.join('\n'))
      setSaved(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
    try {
      await setExtraProjectRootNames(names)
      setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-dialog">
      <button className="btn btn--ghost" onClick={() => setOpen((v) => !v)}>
        ⚙️ Einstellungen
      </button>
      {open && (
        <div className="settings-dialog__panel">
          <h4>Zusätzliche Projekt-Root-Namen</h4>
          <p>
            Ordnernamen direkt unter $HOME, die zusätzlich zu den eingebauten Standards (work, projects, src, dev, code,
            repos, git, source, workspace) nach Build-Artefakten durchsucht werden. Einer pro Zeile oder mit Komma
            getrennt.
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
          <div className="settings-dialog__actions">
            <button className="btn btn--primary" onClick={submit} disabled={busy}>
              Speichern
            </button>
            {saved && <span className="settings-dialog__saved">Gespeichert — Profil wird neu erkannt…</span>}
          </div>

          <h4>Installer-Quarantäne</h4>
          <p>
            Ordner, in den verwaiste <code>C:\Windows\Installer</code>-Dateien verschoben werden (Check "Verwaiste
            Windows-Installer-Cache-Dateien"), je Lauf in einen eigenen Zeitstempel-Unterordner. Für echten Platzgewinn
            am besten ein anderes Laufwerk als C: wählen, sonst wird nur umsortiert statt freigegeben.
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
        </div>
      )}
    </div>
  )
}
