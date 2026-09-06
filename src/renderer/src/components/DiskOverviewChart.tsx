import { useEffect, useMemo, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import type { DiskOverview } from '@shared/types'
import { formatBytes } from '../formatBytes'
import { FolderExplorer } from './FolderExplorer'

interface Props {
  overview: DiskOverview | null
  loading: boolean
}

const COLORS: Record<string, string> = {
  'user-files': '#4C8DFF',
  programs: '#8E6CFF',
  os: '#5B6B7C',
  wsl2: '#25B79D',
  'cleanup-relevant': '#F5A623',
  'hidden-system': '#C77DFF',
  'profile-rest': '#3DB4E0',
  'program-data': '#7C8CA6',
  'other-users': '#E077A8',
  other: '#D8DEE4'
}

export function DiskOverviewChart({ overview, loading }: Props): JSX.Element {
  // Only the very first paint should play the pie's grow-in animation — every
  // later refresh reuses the same chart instance, and re-animating it on each
  // update reads as "the chart keeps re-rendering" rather than "data changed".
  const hasAnimatedOnce = useRef(false)
  useEffect(() => {
    if (overview) hasAnimatedOnce.current = true
  }, [overview])

  const option = useMemo(() => {
    if (!overview) return null

    const innerData = overview.categories
      .filter((c) => c.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .map((c) => ({
        name: c.label,
        value: c.bytes,
        itemStyle: { color: COLORS[c.key] ?? '#999' }
      }))

    const cleanupRelevant = overview.categories.find((c) => c.key === 'cleanup-relevant')
    const outerData = (cleanupRelevant?.children ?? [])
      .filter((child) => child.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .map((child) => ({ name: child.label, value: child.bytes }))

    // Stack two legends (one per ring) with a small heading above each, positioned in px
    // so their heights (driven by item count) never overlap. Each legend caps its own
    // height (via top+bottom) and scrolls internally past that — a fixed number of
    // cleanup checks can otherwise exceed CHART_HEIGHT and force ECharts into an
    // uncontrolled multi-column auto-layout that truncates every label.
    const headingStyle = { fill: '#aab2bd', fontSize: 11, fontWeight: 'bold' as const }
    const legendLeft = '58%'
    const rowHeight = 20
    const legendMaxRows = 6
    const heading1Top = 4
    const legend1Top = heading1Top + 18
    const legend1Height = Math.min(innerData.length, legendMaxRows) * rowHeight
    const heading2Top = legend1Top + legend1Height + 28
    const legend2Top = heading2Top + 18
    const legend2Height = Math.min(outerData.length, legendMaxRows) * rowHeight
    // Pinning both `left` AND `right` (instead of `left`+`width`) forces
    // ECharts to size both legend boxes to the exact same span regardless of
    // each one's own content width — with only `width` set, a legend whose
    // longest label is shorter than the declared width shrinks back to its
    // natural content size, so the two page-turner rows ("‹ n/m ›") still
    // centered at different x offsets depending on each legend's own labels.
    const scrollLegendCommon = {
      type: 'scroll' as const,
      orient: 'vertical' as const,
      left: legendLeft,
      right: '4%',
      textStyle: { fontSize: 11, color: '#e6e9ee' },
      inactiveColor: '#5b6472',
      pageIconSize: 9,
      pageIconColor: '#6b7480',
      pageIconInactiveColor: '#3a4250',
      pageTextStyle: { color: '#6b7480', fontSize: 10 },
      pageButtonItemGap: 4
    }

    return {
      animation: !hasAnimatedOnce.current,
      tooltip: {
        trigger: 'item',
        formatter: (params: { seriesName: string; name: string; value: number; percent: number }) =>
          `<strong>${params.seriesName}</strong><br/>${params.name}<br/>${formatBytes(params.value)} (${params.percent}%)`
      },
      graphic: [
        { type: 'text', left: legendLeft, top: heading1Top, style: { text: 'Innerer Ring — Gesamtbelegung', ...headingStyle } },
        ...(outerData.length > 0
          ? [{ type: 'text', left: legendLeft, top: heading2Top, style: { text: 'Äußerer Ring — bereinigbar (Detail)', ...headingStyle } }]
          : [])
      ],
      legend: [
        {
          ...scrollLegendCommon,
          data: innerData.map((d) => d.name),
          top: legend1Top,
          height: legend1Height
        },
        ...(outerData.length > 0
          ? [
              {
                ...scrollLegendCommon,
                data: outerData.map((d) => d.name),
                top: legend2Top,
                height: legend2Height
              }
            ]
          : [])
      ],
      series: [
        {
          name: 'Gesamtbelegung',
          type: 'pie',
          center: ['28%', '50%'],
          radius: ['0%', '45%'],
          label: { show: false },
          data: innerData
        },
        {
          name: 'Bereinigbar (Detail)',
          type: 'pie',
          center: ['28%', '50%'],
          radius: ['55%', '75%'],
          label: { show: false },
          data: outerData
        }
      ]
    }
  }, [overview])

  return (
    <div className="disk-overview">
      <div className="disk-overview__summary">
        {overview ? (
          <>
            <strong>{overview.driveLetter}</strong> — {formatBytes(overview.usedBytes)} belegt von{' '}
            {formatBytes(overview.totalBytes)} ({formatBytes(overview.freeBytes)} frei)
          </>
        ) : (
          <span>Noch keine Daten — auf „Aktualisieren" klicken.</span>
        )}
        {loading && <span className="disk-overview__loading"> Aktualisiere…</span>}
      </div>
      {option && (
        <ReactECharts option={option} style={{ height: 360 }} notMerge lazyUpdate />
      )}
      {overview && <FolderExplorer driveLetter={overview.driveLetter} root={overview.rootFolders ?? []} loading={loading} />}
    </div>
  )
}
