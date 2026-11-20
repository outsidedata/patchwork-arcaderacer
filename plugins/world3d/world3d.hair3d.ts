// world3d's mod for hair3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.hair3d.mods: { skins: [..., 'world3d'], behaviors: [..., 'render3d'] }` grows the hair the place's kit things
// grow (the place's `hairs` part, `world3d.sim.ts`) on the place as world3d draws it, carried as its clips and joints
// move it.
//
// `skins(plugins)` is world3d's wearers (`world3d.plugin.ts`, The hair): once the place is built, one, `world3d`, of
// the kind `world3d`, its skins each part that grows hair as `{ skinned }`, the word render3d's mod delivers
// (`render3d.hair3d.ts`). The hairs file lists the kind `world3d` with the hairs the place grows, each hair's `on.meshes`
// matching its parts by their names, `<row> <part>`.
import type { Plugins } from '#engine/browser.ts'
import type { Wearer } from '#plugins/hair3d/hair3d.sim.ts'

export const skins = (plugins: Plugins): Wearer[] => plugins.world3d.wearers()
