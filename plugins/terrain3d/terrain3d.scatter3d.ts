// terrain3d's mod for scatter3d (`addons/scenemanager`'s mods): both halves of scatter3d stand their
// instances on terrain3d's land, so a trunk a rule asks about stands where a seat sees it.
//
// `ground(w)`, for a scene with `world.scatter3d.mods: { ground: 'terrain3d' }`, is the server half's
// `Ground`: `heightAt`, `paintAt`'s cover, `ramp` over the land record, the land's own `rules`, which
// know its biomes, and its `edits`.
//
// `land(plugins)`, for a scene with `world.scatter3d.mods: { land: 'terrain3d' }`, is the land as this
// page has it, terrain3d's browser half's `ground`, which answers the same five over the client's own
// land, and `rings()`, the reach of each of terrain3d's rings, finest first, which scatter3d's packs
// draw their LODs on: undefined until its field has loaded. terrain3d makes it, and every new land under it, in
// its own `afterTick`, where scatter3d's browser half reads it.
import type { W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from '#plugins/scatter3d/scatter3d.sim.ts'
import type { Ground as Land } from './terrain3d.plugin.ts'
import { edits, heightAt, paintAt, ramp } from './terrain3d.sim.ts'

export const ground = (w: W): Ground => ({
  height: (x, z) => heightAt(w, x, z),
  cover: (x, z) => paintAt(w, x, z).cover,
  ramp: (rule, x, z) => ramp(w, rule, x, z),
  rules: (list, what) => edits(w).land.rules(list, what),
  edits: () => edits(w),
})

export const land = (plugins: Plugins): Land | undefined => plugins.terrain3d.ground
