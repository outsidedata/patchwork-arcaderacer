// supershader3d's mod for solids (`addons/scenemanager`'s mods), the page's. A scene with
// `world.solids.mods: { looks: 'supershader3d' }` has solids draw a paint `{ look: <name> }` with the
// scene's one shader: `looks(plugins)` is `{ material(name), idOf(name) }`, the material of the draw
// call that draws the material `name` of the looks file, and its number, which solids writes on every
// vertex of the paint's parts as `lookId`; each undefined for a name the file does not hold, or while
// the file has not landed, so solids waits to draw the row. supershader3d is listed before solids,
// which solids checks with `ahead`.
import type { Plugins } from '#engine/browser.ts'
import type { Looks } from '#plugins/solids/solids.plugin.ts'

export function looks(plugins: Plugins): Looks {
  const s = plugins.supershader3d
  return {
    material: (name: string) => { const call = s.callOf(name); return call === undefined ? undefined : s.material(call) },
    idOf: (name: string) => s.idOf(name),
  }
}
