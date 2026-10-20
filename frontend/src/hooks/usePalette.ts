import { useMemo } from 'react'

import { useStore } from '/src/stores'
import useSettingsStore from '/src/stores/settingsStore'
import { Color, darken, luminance, toHexRGBA } from '/src/utils/color'
import { createPalette } from '/src/utils/colormap'

export const usePalette = (steps: number) => {
  const colormap = useStore(useSettingsStore, state => state.colormap)

  return useMemo(() =>
    createPalette((colormap === undefined || colormap === 'crabfit') ? [[0, [247, 158, 0, 0]], [1, [247, 158, 0, 255]]] : colormap, steps)
      .map(([r, g, b, a]): Color => [r, g, b, a / 255])
      .map(c => {
        const highlight = darken(c, luminance(c) > .5 ? 1 : -1)
        highlight[3] += .3
        return {
          string: toHexRGBA(c),
          highlight: toHexRGBA(highlight),
        }
      }),
  [steps, colormap])
}
