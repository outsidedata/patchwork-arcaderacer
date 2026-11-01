// shapes3d's mod for solids (`addons/scenemanager`'s mods), the page's. A scene with `world.solids.mods: {
// models: 'shapes3d' }` has solids draw every row of a shapes3d kind whose entry gives a `look` as a
// plain shape of its numbers.
//
// `models(plugins)` is, for each such kind, a solids model of one node and one paint, the look's
// `colour` and `roughness`, and its `map` laid at its `scale` when it names one (a texture entry of the
// loader's catalogue, `scale` metres to a span of it: solids' Paints), its part by its word (`drawn`):
// a cylinder a prism of the look's `sides`
// sides, each standing `radius` from its middle, and `height` tall; a box a loft `x` across, `z` long and `y` tall; a plane
// a slab the look's `thick` metres deep under its surface, `x` across and as long as its surface runs
// over its `z` on the ground, tilted up along its length by its `tilt`; a hyperplane a slab the look's
// `thick` metres deep under its face, `x` across and `z` long; each standing on its row's `pos`, which
// solids turns by the row's `yaw`, or a hyperplane's by its `rot`. A cylinder's look with no `sides`,
// and a plane's or a hyperplane's with no `thick`, throws, naming the kind.
import type { Plugins } from '#engine/browser.ts'
import type { Model, Part } from '#plugins/solids/solids.plugin.ts'
import { wordOf, type Kind } from './shapes3d.sim.ts'

// Each word's part, from its kind's numbers and look.
const drawn: Record<string, (n: any, look: NonNullable<Kind['look']>, kind: string) => Part> = {
  // Its sides stand `radius` from its middle, on the cylinder a shot meets: its corners out past it.
  cylinder(n, look, kind) {
    if (look.sides === undefined) throw new Error(`shapes3d kind ${kind} is drawn as a cylinder, and its look gives no sides`)
    const corner = n.radius / Math.cos(Math.PI / look.sides)
    return { node: 'body', paint: 'look', prism: { axis: 'y', from: 0, to: n.height, at: [0, 0], r: [corner, corner], sides: look.sides } }
  },
  box: n => ({ node: 'body', paint: 'look', loft: { axis: 'y', from: 0, to: n.size[1], a: [0, 0, n.size[0] / 2, n.size[2] / 2] } }),
  // Turned about x by −tilt, so its far end rises; its length on the slope is its run over cos tilt.
  plane(n, look, kind) {
    if (look.thick === undefined) throw new Error(`shapes3d kind ${kind} is drawn as a plane, and its look gives no thick`)
    const tilt = n.tilt ?? 0
    return { node: 'body', paint: 'look', loft: { axis: 'y', from: -look.thick, to: 0, a: [0, 0, n.size[0] / 2, n.size[1] / 2 / Math.cos(tilt)] }, frame: { turn: [-tilt, 0] } }
  },
  hyperplane(n, look, kind) {
    if (look.thick === undefined) throw new Error(`shapes3d kind ${kind} is drawn as a hyperplane, and its look gives no thick`)
    return { node: 'body', paint: 'look', loft: { axis: 'y', from: -look.thick, to: 0, a: [0, 0, n.size[0] / 2, n.size[1] / 2] } }
  },
}

export function models(plugins: Plugins): Record<string, Model> {
  const kinds = (plugins.wire.scene.world?.shapes3d?.kinds ?? {}) as Record<string, Kind>
  const out: Record<string, Model> = {}
  for (const [kind, k] of Object.entries(kinds)) {
    if (!k.look) continue
    const { word } = wordOf(kind, k)
    const { colour, roughness, map, scale } = k.look
    const paints = { look: { colour, ...(roughness === undefined ? {} : { roughness }), ...(map === undefined ? {} : { map, scale }) } }
    out[kind] = { paints, nodes: { body: { at: [0, 0, 0] } }, parts: [drawn[word](k.shape[word], k.look, kind)] }
  }
  return out
}
