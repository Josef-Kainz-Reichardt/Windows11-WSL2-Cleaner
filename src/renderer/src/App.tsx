import { useEffect } from 'react'
import { useChecksStore } from './state/checksStore'
import { useDiskOverviewStore } from './state/diskOverviewStore'
import { DiskOverviewChart } from './components/DiskOverviewChart'
import { CheckList } from './components/CheckList'
import { CleanAllButton } from './components/CleanAllButton'
import { RefreshButton } from './components/RefreshButton'
import { ReportButton } from './components/ReportButton'
import { SudoPasswordDialog } from './components/SudoPasswordDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { RancherConfirmDialog } from './components/RancherConfirmDialog'
import { InstallerCleanupConfirmDialog } from './components/InstallerCleanupConfirmDialog'
import { ProgressBar } from './components/ProgressBar'
import { formatBytes } from './formatBytes'

const SETTLED_STATUSES = new Set(['scanned', 'done', 'error', 'skipped'])

export function App(): JSX.Element {
  const load = useChecksStore((s) => s.load)
  const definitions = useChecksStore((s) => s.definitions)
  const statuses = useChecksStore((s) => s.statuses)
  const scanResults = useChecksStore((s) => s.scanResults)
  const cleanResults = useChecksStore((s) => s.cleanResults)
  const disabledCheckIds = useChecksStore((s) => s.settings.disabledCheckIds)
  const running = useChecksStore((s) => s.running)
  const scanAll = useChecksStore((s) => s.scanAll)
  const cleanAll = useChecksStore((s) => s.cleanAll)

  const overview = useDiskOverviewStore((s) => s.overview)
  const overviewLoading = useDiskOverviewStore((s) => s.loading)
  const loadOverview = useDiskOverviewStore((s) => s.load)
  const refreshOverview = useDiskOverviewStore((s) => s.refresh)
  const overviewProgress = useDiskOverviewStore((s) => s.overviewProgress)

  async function handleRefresh(): Promise<void> {
    await scanAll()
    await refreshOverview()
  }

  async function handleCleanAll(): Promise<void> {
    await cleanAll()
    await refreshOverview()
  }

  // On startup: paint instantly from the persisted overview, then kick off a real refresh in the background.
  // React.StrictMode (dev only) mounts this effect twice in a row; without the
  // `cancelled` guard both mounts would fire their own full scanAll+refresh,
  // running the (very expensive) disk measurement twice concurrently — which
  // looks like the progress bar restarting from 0 partway through and doubles
  // how long it actually takes.
  useEffect(() => {
    let cancelled = false
    async function init(): Promise<void> {
      await load()
      await loadOverview()
      if (cancelled) return
      await handleRefresh()
    }
    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showProgress = running || overviewLoading
  const settledCount = definitions.filter((d) => SETTLED_STATUSES.has(statuses[d.id] ?? 'unknown')).length
  const checksProgressValue = definitions.length > 0 ? (settledCount / definitions.length) * 100 : 0
  // Two sequential phases (checks scan, then disk-overview measurement) share one bar:
  // definite % while either phase reports real progress, indeterminate only in the gap
  // before the overview phase's first measurement step lands.
  const overviewProgressValue = overviewProgress ? (overviewProgress.completed / overviewProgress.total) * 100 : 0
  const progressValue = running ? checksProgressValue : overviewProgressValue
  const progressIndeterminate = !running && !overviewProgress

  // Status line under the bar: what's happening right now, so a long single
  // step (e.g. a big folder) doesn't look like the app hung.
  const activeCheck = definitions.find((d) => statuses[d.id] === 'scanning' || statuses[d.id] === 'running')
  const progressStatusLabel = running
    ? activeCheck
      ? `Prüfe: ${activeCheck.name}`
      : 'Bereite Prüfung vor…'
    : overviewProgress
      ? `Scanne: ${overviewProgress.label ?? '…'}`
      : overviewLoading
        ? 'Bereite Analyse vor…'
        : null

  // What "Alles bereinigen" would actually reclaim: only enabled checks, only
  // checks with a known (positive) estimate — mirrors buildOverview.ts's logic.
  const totalReclaimableBytes = definitions.reduce((sum, d) => {
    if (disabledCheckIds.includes(d.id)) return sum
    const bytes = scanResults[d.id]?.bytesReclaimable
    return typeof bytes === 'number' && bytes > 0 ? sum + bytes : sum
  }, 0)

  return (
    <div className="app">
      <header className="app__header">
        <h1>WSL2 Cleaner</h1>
        <div className="app__header-actions">
          <SettingsDialog />
          <SudoPasswordDialog />
        </div>
      </header>

      {showProgress && (
        <>
          <ProgressBar value={progressValue} indeterminate={progressIndeterminate} />
          {progressStatusLabel && (
            <div className="progress-status">
              <span className="spinner" /> {progressStatusLabel}
            </div>
          )}
        </>
      )}

      <DiskOverviewChart overview={overview} loading={overviewLoading} />

      <div className="toolbar">
        <RefreshButton onClick={handleRefresh} loading={running || overviewLoading} />
        <CleanAllButton onClick={handleCleanAll} running={running} />
        <ReportButton
          overview={overview}
          definitions={definitions}
          scanResults={scanResults}
          disabledCheckIds={disabledCheckIds}
          cleanResults={cleanResults}
        />
        <span className="toolbar__total">
          insgesamt bereinigbar: <strong>{formatBytes(totalReclaimableBytes)}</strong>
        </span>
      </div>

      <CheckList />
      <RancherConfirmDialog />
      <InstallerCleanupConfirmDialog />
    </div>
  )
}
