// grounds' mod for grass3d (`addons/scenemanager`'s mods): the land the grass stands on in the grass
// workshop. The workshop's stage names it, `world.grass3d.mods: { land: 'grounds' }`, with grounds listed
// before grass3d, as a game's scene names terrain3d.
//
// `land(plugins)` is the test ground shown, undefined until grounds has drawn it: its `ground` (`height`,
// no ground past the field's edge; `cover`, 0 on a bare patch; no rule answered), `version`, which moves
// when another ground is shown, `cell`, the field's, the lattice the ground is drawn through, so a blade
// stands on the triangle that is drawn, and `worker`, this module with the ground's numbers, for grass3d's
// workers.
//   worker(held)   in a worker of grass3d's (`grass3d.worker.ts`): the same ground, made from those numbers,
//                  so a block filled there is the page's to the bit.
import type { Plugins } from '#engine/browser.ts'
import type { Ground, Land } from '#plugins/grass3d/grass3d.sim.ts'
import { groundOf, type Field, type Test } from './grounds.sim.ts'

// This module, which grass3d's workers load to answer the land.
const HERE = new URL('./grounds.grass3d.ts', import.meta.url).href

export type Held = { test: Test; field: Field }

export const land = (plugins: Plugins): Land | undefined => {
  const shown = plugins.grounds.land() as { ground: Ground; version: string; cell: number; held: Held } | undefined
  return shown && { ground: shown.ground, version: shown.version, cell: shown.cell, shown: true, worker: { url: HERE, held: shown.held } }
}

export const worker = (held: Held): Ground => groundOf(held.test, held.field)
