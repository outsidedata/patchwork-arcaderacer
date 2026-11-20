// instances3d's mod for particle3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.particle3d.mods: { behaviors: [..., 'instances3d'] }` has every particle3d layer that gives
// `mesh` drawn as instanced meshes, one instance a particle, in place of quads:
//
//   { "n": [8, 12], "life": [2, 3], "speed": [6, 10], "g": 9.8, "spin": 8, "bounce": 0.3,
//     "mesh": { "rows": ["a", "b", "c"], "seed": 4, "look": { "shape": { "detail": 1, "lumpy": [0.7, 0.4], "squash": 0.8 }, "colour": "#3b3632", "lods": [0], "shadow": 30, "leaf": 0 } } }
//
// `mesh` is `{ rows, look, seed? }`: `look` an instances3d look (`instances3d.sim.ts`: an asset, a shape or
// a word, drawn in one shell), `rows` the rows of it the particles are drawn as, each particle one of
// them by its `pick`, and `seed` the boulders' seed (0). `behaviors()` is `{ mesh }`, particle3d's Drawer
// for that word: its Drawing is an Instances (`plugins.instances3d.instances`) cleared and filled again
// each frame with every particle where it is, turned and sized as it is. instances3d is listed in the
// scene, before render3d.
import type { Drawer } from '#plugins/particle3d/particle3d.plugin.ts'
import { check, type Look } from './instances3d.sim.ts'
import type { Instances } from './instances3d.plugin.ts'

type Mesh = { rows: string[]; look: Look; seed?: number }

export function behaviors(): Record<string, Drawer> {
  return {
    mesh: {
      check(data: Mesh, what, world) {
        if (typeof data !== 'object' || data === null) throw new Error(`${what} ${JSON.stringify(data)} is not { rows, look, seed? }`)
        for (const k of Object.keys(data)) if (!['rows', 'look', 'seed'].includes(k)) throw new Error(`${what} has ${k}, and a mesh is { rows, look, seed? }`)
        if (!(Array.isArray(data.rows) && data.rows.length > 0 && data.rows.every(r => typeof r === 'string'))) throw new Error(`${what} rows ${JSON.stringify(data.rows)} are not a list of the look's rows`)
        if (data.seed !== undefined && !Number.isInteger(data.seed)) throw new Error(`${what} seed ${data.seed} is not a whole number`)
        check(data.look, 1, `${what} look`, world)
      },
      draw(data: Mesh, { plugins, name }) {
        if (!plugins.instances3d) throw new Error(`${name} draws a mesh through instances3d, which this scene does not list`)
        const it: Instances | undefined = plugins.instances3d.instances(plugins, { name, rows: data.rows, seed: data.seed ?? 0, shells: [Infinity], look: data.look })
        if (!it) return undefined
        it.show()
        return {
          put(list) {
            it.clear()
            it.add(list.map(p => ({ row: data.rows[Math.min(data.rows.length - 1, Math.floor(p.pick * data.rows.length))], at: p.at, rot: p.rot, size: p.size })), 0)
            it.frame([])
          },
          dispose: () => it.dispose(),
        }
      },
    },
  }
}
