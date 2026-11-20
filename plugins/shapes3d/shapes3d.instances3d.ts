// shapes3d's mod for instances3d (`addons/scenemanager`'s mods), the page's. A scene with
//
//   "instances3d": { "mods": { "instances": ["shapes3d"], "behaviors": ["shapes3d"] },
//                    "kinds": { "wall": { "form": {}, "colour": "#9a8f80", "map": "brick", "scale": 2, "flat": true, "lods": [0], "shadow": 1, "leaf": 0 } } }
//
// has every row of a shapes3d kind instances3d names drawn as one instance of that kind's shape, where its
// row stands: the same shapes solids draws through `shapes3d.solids.ts`, so a game picks either.
//
// `instances(plugins)` is `{ kind, at, rot }` for every row this page has of a kind `world.shapes3d.kinds`
// lists: its `pos`, and its `rot` where it carries one (a hyperplane), else its `yaw` about up.
// `behaviors()` is `{ form }`: the geometry of a look that gives `form` is its row's kind's shape, by its
// word: a cylinder a prism of `form.sides` sides, each standing `radius` from its middle, `height` tall; a
// box `x` across, `z` long and `y` tall; a plane a slab `form.thick` metres deep under its surface, `x`
// across and as long as its surface runs over its `z` on the ground, tilted up along its length by its
// `tilt`; a hyperplane a slab `form.thick` deep under its face, `x` across and `z` long; each standing on
// its foot. A cylinder with no `sides`, a plane or hyperplane with no `thick`, and a kind shapes3d does not
// list throw, naming the kind.
import type { Row, W } from '#engine/engine.ts'
import type { Plugins, Wire } from '#engine/browser.ts'
import type { Geometry, Tools } from '#plugins/instances3d/instances3d.sim.ts'
import type { Placed } from '#plugins/instances3d/instances3d.plugin.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { shapes, wordOf, type Kind } from './shapes3d.sim.ts'

type Form = { sides?: number; thick?: number }

export function instances(plugins: Plugins): Placed[] {
  const wire = plugins.wire
  const w = {
    world: wire.scene.world ?? {},
    all: (kind: string) => wire.rows.filter(r => r.kind === kind),
    get: (id: number) => wire.rows.find(r => r.id === id),
    find: (kind: string, pred: (r: Row) => boolean = () => true) => wire.rows.find(r => r.kind === kind && pred(r)),
  } as unknown as W
  return shapes(w).map(p => {
    const s = p.shape[p.word]
    return { kind: p.kind, at: s.pos, rot: s.rot ?? [0, Math.sin((s.yaw ?? 0) / 2), 0, Math.cos((s.yaw ?? 0) / 2)] }
  })
}

// Each word's geometry, from its kind's numbers and the look's form.
const drawn: Record<string, (n: any, form: Form, kind: string, tools: Tools) => ReturnType<Tools['convex']>> = {
  // Its sides stand `radius` from its middle, its corners out past it, a corner every 2π/sides from half a
  // side round +x, as solids' prism stands them.
  cylinder(n, form, kind, { THREE }) {
    if (form.sides === undefined) throw new Error(`shapes3d kind ${kind} is drawn as a cylinder, and its form gives no sides`)
    const corner = n.radius / Math.cos(Math.PI / form.sides)
    return new THREE.CylinderGeometry(corner, corner, n.height, form.sides, 1, false, Math.PI / 2 - Math.PI / form.sides).translate(0, n.height / 2, 0)
  },
  box: (n, _form, _kind, { THREE }) => new THREE.BoxGeometry(n.size[0], n.size[1], n.size[2]).translate(0, n.size[1] / 2, 0),
  // Turned about x by −tilt, so its far end rises; its length on the slope is its run over cos tilt.
  plane(n, form, kind, { THREE }) {
    if (form.thick === undefined) throw new Error(`shapes3d kind ${kind} is drawn as a plane, and its form gives no thick`)
    const tilt = n.tilt ?? 0
    return new THREE.BoxGeometry(n.size[0], form.thick, n.size[1] / Math.cos(tilt)).translate(0, -form.thick / 2, 0).rotateX(-tilt)
  },
  hyperplane(n, form, kind, { THREE }) {
    if (form.thick === undefined) throw new Error(`shapes3d kind ${kind} is drawn as a hyperplane, and its form gives no thick`)
    return new THREE.BoxGeometry(n.size[0], form.thick, n.size[1]).translate(0, -form.thick / 2, 0)
  },
}

export function behaviors(): Record<string, Geometry> {
  return {
    form: {
      parts(form: Form, kind, tools, world) {
        const files = ((world.shapes3d?.shapes ?? []) as string[]).map(name => (json({ scene: { world } } as unknown as Wire, name) as { kinds: Record<string, Kind> }).kinds)
        const k = [(world.shapes3d?.kinds ?? {}) as Record<string, Kind>, ...files].find(ks => ks[kind])?.[kind]
        if (!k) throw new Error(`instances3d draws ${kind}'s form, and world.shapes3d.kinds lists no ${kind}`)
        const { word } = wordOf(kind, k)
        return [{ geometry: drawn[word](k.shape[word], form, kind, tools) }]
      },
    },
  }
}
