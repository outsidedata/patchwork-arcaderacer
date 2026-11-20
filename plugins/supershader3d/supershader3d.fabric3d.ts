// supershader3d's mod for fabric3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.fabric3d.mods: { behaviors: [..., 'supershader3d'] }` draws a fabric in a material of the scene's looks
// file, with the scene's one shader, as solids' `paint` draws one in a colour.
//
// `behaviors()` delivers the drawing `look`: `{ material }`, the name of a material of the looks file. The fabric
// is drawn once the looks have landed, in a new material of the draw call that draws it, dressed with fabric3d's
// own surface, which moves each vertex (`surfaced`), every vertex's `lookId` the material's number. The looks read
// each vertex's place as the fabric was cut, so a weave stays on the cloth as it folds. A look that is not
// `{ material }` throws; a material the looks file has not is never drawn. supershader3d is listed before fabric3d.
import type { Plugins } from '#engine/browser.ts'
import type { Behavior } from '#plugins/fabric3d/fabric3d.plugin.ts'

const look: Behavior = {
  check(data: { material?: unknown }, what) {
    if (!data || typeof data !== 'object' || typeof data.material !== 'string' || !data.material) throw new Error(`${what} is ${JSON.stringify(data)}, and a fabric's look is { material }, the name of a material of the scene's looks`)
    for (const k of Object.keys(data)) if (k !== 'material') throw new Error(`${what} has ${k}, and a fabric's look is { material }`)
  },
  material(data: { material: string }, { plugins }: { plugins: Plugins }) {
    const s = plugins.supershader3d
    const id = s.idOf(data.material), call = s.callOf(data.material)
    if (id === undefined || call === undefined) return undefined
    return { dress: surface => s.surfaced(call, surface), vertex: { lookId: id } }
  },
}

export const behaviors = (): Record<string, Behavior> => ({ look })
