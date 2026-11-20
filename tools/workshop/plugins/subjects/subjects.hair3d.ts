// subjects' mod for hair3d (`addons/scenemanager`'s mods). The hair workshop's stage names it,
// `world.hair3d.mods: { skins: ['subjects'], behaviors: ['render3d'] }`, so hair3d grows the hair being
// tuned on the test subject shown.
//
// `skins(plugins)` is the subject as hair3d's one wearer: its id `subject`, its kind the subject's name,
// its skin its three SkinnedMesh under the word `skinned`, which `render3d.hair3d.ts` delivers.
import type { Plugins } from '#engine/browser.ts'
import type { Wearer } from '#plugins/hair3d/hair3d.sim.ts'

export const skins = (plugins: Plugins): Wearer[] => plugins.subjects.wearers()
