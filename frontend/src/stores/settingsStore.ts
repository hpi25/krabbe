import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { MapKey } from '/src/utils/colormap'

type TimeFormat = '12h' | '24h'
type Theme = 'System' | 'Light' | 'Dark'
/** Preference: highest total score, Availability: most people available */
export type HighlightMode = 'Off' | 'Preference' | 'Availability'

interface SettingsStore {
  /** 0: Sunday, 1: Monday */
  weekStart: 0 | 1
  timeFormat: TimeFormat
  theme: Theme
  highlight: HighlightMode
  colormap: 'crabfit' | MapKey

  setWeekStart: (weekStart: 0 | 1) => void
  setTimeFormat: (timeFormat: TimeFormat) => void
  setTheme: (theme: Theme) => void
  setHighlight: (highlight: HighlightMode) => void
  setColormap: (colormap: 'crabfit' | MapKey) => void
}

const useSettingsStore = create<SettingsStore>()(persist(
  set => ({
    weekStart: 1,
    timeFormat: '24h',
    theme: 'System',
    highlight: 'Preference',
    colormap: 'crabfit',

    setWeekStart: weekStart => set({ weekStart }),
    setTimeFormat: timeFormat => set({ timeFormat }),
    setTheme: theme => set({ theme }),
    setHighlight: highlight => set({ highlight }),
    setColormap: colormap => set({ colormap }),
  }),
  {
    name: 'crabfit-settings',
    version: 1,
    migrate: (persisted, version) => {
      const state = persisted as Omit<SettingsStore, 'highlight'> & { highlight: boolean | HighlightMode }
      // v0 stored highlight as a boolean
      if (version === 0 && typeof state.highlight === 'boolean') {
        state.highlight = state.highlight ? 'Preference' : 'Off'
      }
      return state as SettingsStore
    },
  },
))

export default useSettingsStore
