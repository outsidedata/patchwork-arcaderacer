// supershader3d's mod for hair3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.hair3d.mods: { looks: 'supershader3d' }` draws a hair that names a `look`, a material of the scene's looks
// file, with the scene's one shader in place of the hair's own colours: `looks(plugins)` is `{ idOf(name),
// material(name, surface) }`, the material's number, which hair3d writes on every vertex of a strand as `lookId`,
// and a new material of the draw call that draws it, dressed with hair3d's surface, which shapes each strand
// (`surfaced`); each undefined for a name the file does not hold, or while the file has not landed, so hair3d
// waits to grow the hair. supershader3d is listed before hair3d.
import type { Plugins } from '#engine/browser.ts'
import type { Looks } from '#plugins/hair3d/hair3d.sim.ts'

export const looks: Looks = (plugins: Plugins) => {
  const s = plugins.supershader3d
  return {
    idOf: name => s.idOf(name),
    material: (name, surface) => { const call = s.callOf(name); return call === undefined ? undefined : s.surfaced(call, surface) },
  }
}
