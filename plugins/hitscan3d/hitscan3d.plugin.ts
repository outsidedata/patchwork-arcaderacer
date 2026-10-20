// The browser half of hitscan3d: what a page's shot names as the step it was aimed at. The server
// half (`hitscan3d.sim.ts`) puts the bodies back where they stood on that step.
//
// `seen()` is the `n` of the `hitscan3d` row in the packet this page draws the bodies from, which a
// game's player actor sends with each shot; undefined in a scene with no `hitscan3d` row, or before
// the first packet has brought it.
import type { Plugins } from '#engine/browser.ts'

export function hitscan3d() {
  let wire: Plugins['wire'] | undefined
  return {
    tick(plugins: Plugins) { wire = plugins.wire },
    seen(): number | undefined {
      return wire?.rows.find(r => r.kind === 'hitscan3d')?.data.n
    },
  }
}
