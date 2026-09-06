import { create } from 'zustand'
import type { DiskOverview, DiskOverviewProgressEvent } from '@shared/types'
import { api } from '../api/rendererApi'

interface DiskOverviewState {
  overview: DiskOverview | null
  loading: boolean
  /** Progress of the current refresh's measurement steps, null when idle or before the first step lands. */
  overviewProgress: DiskOverviewProgressEvent | null
  /** Loads the persisted overview from disk, if any, without triggering a (slow) recompute. */
  load(): Promise<void>
  refresh(): Promise<void>
}

// Module-level, not store state: tracks an in-flight refresh so a second
// caller (e.g. a duplicate effect run, or a fast double-click before the
// button's `disabled` re-render lands) joins the same run instead of kicking
// off a second concurrent disk scan that fights the first one for I/O and
// stomps on its progress state.
let inFlightRefresh: Promise<void> | null = null

export const useDiskOverviewStore = create<DiskOverviewState>((set) => ({
  overview: null,
  loading: false,
  overviewProgress: null,
  async load() {
    const overview = await api.disk.getOverview()
    if (overview) set({ overview })
  },
  async refresh() {
    if (inFlightRefresh) return inFlightRefresh
    inFlightRefresh = (async () => {
      set({ loading: true, overviewProgress: null })
      const unsubscribe = api.events.onDiskOverviewProgress((p) => set({ overviewProgress: p }))
      try {
        const overview = await api.disk.refreshOverview()
        set({ overview })
      } finally {
        unsubscribe()
        set({ loading: false, overviewProgress: null })
        inFlightRefresh = null
      }
    })()
    return inFlightRefresh
  }
}))
