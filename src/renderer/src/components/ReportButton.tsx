import { useState } from 'react'
import type { CheckDefinition, CleanResult, DiskOverview, ScanResult } from '@shared/types'
import { api } from '../api/rendererApi'
import { buildReport } from '../report/buildReport'

interface Props {
  overview: DiskOverview | null
  definitions: CheckDefinition[]
  scanResults: Record<string, ScanResult>
  disabledCheckIds: string[]
  cleanResults: Record<string, CleanResult>
  logs: Record<string, string[]>
}

export function ReportButton({ overview, definitions, scanResults, disabledCheckIds, cleanResults, logs }: Props): JSX.Element | null {
  const [feedback, setFeedback] = useState<string | null>(null)

  if (!overview) return null

  function showFeedback(text: string): void {
    setFeedback(text)
    setTimeout(() => setFeedback(null), 2500)
  }

  async function handleCopy(): Promise<void> {
    const report = buildReport(overview!, definitions, scanResults, disabledCheckIds, cleanResults, logs)
    await navigator.clipboard.writeText(report)
    showFeedback('In Zwischenablage kopiert')
  }

  async function handleSave(): Promise<void> {
    const report = buildReport(overview!, definitions, scanResults, disabledCheckIds, cleanResults, logs)
    const suggestedName = `storage-report-${new Date().toISOString().slice(0, 10)}.md`
    const result = await api.report.saveToFile(report, suggestedName)
    if (result.ok) showFeedback(`Gespeichert: ${result.path}`)
    else if (result.error) showFeedback(`Fehler: ${result.error}`)
  }

  return (
    <div className="report-button">
      <button className="btn btn--ghost btn--small" onClick={handleCopy} title="Bericht als Text in die Zwischenablage kopieren">
        📋 Bericht kopieren
      </button>
      <button className="btn btn--ghost btn--small" onClick={handleSave} title="Bericht als Datei speichern">
        💾 Bericht speichern
      </button>
      {feedback && <span className="report-button__feedback">{feedback}</span>}
    </div>
  )
}
