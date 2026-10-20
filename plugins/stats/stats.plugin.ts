// stats: three.js's own stats panel (`three/addons/libs/stats.module.js`, the one in every three.js
// demo), the frames a second the page draws, the milliseconds between two of them, and, in Chrome,
// the megabytes of heap. It has no row, no numbers and no server half. A click on the panel shows
// the next of them.
//
// The page mounts it as it mounts the canvases: `mount(parent)` names where the panel goes, and the
// first `afterTick` after it puts the panel there, fixed at the window's top left over everything,
// and starts its clock; each `afterTick` from then counts a frame. So the first frame it counts is a
// whole one, never the stretch between `mount` and the end of the frame it came in. A scene lists it
// after the plugins that draw, so a frame is counted once it is drawn. `close` takes the panel off
// the page: each scene's client has its own, which starts counting afresh.
import Stats from 'three/addons/libs/stats.module.js'

export function stats() {
  let parent: HTMLElement | undefined
  let panel: Stats | undefined
  return {
    mount(into: HTMLElement) { parent = into },
    afterTick() {
      if (panel) return panel.update()
      if (!parent) return
      panel = new Stats()
      parent.appendChild(panel.dom)
    },
    close() { panel?.dom.remove() },
  }
}
