// instances3d's mod for gpuparticle3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.gpuparticle3d.mods: { behaviors: [..., 'instances3d'] }` has every gpuparticle3d layer that gives
// `mesh` drawn as instanced meshes, one instance a particle, in place of quads, as instances3d's particle3d mod
// draws particle3d's (`instances3d.particle3d.ts`), with the same numbers:
//
//   { "n": [8, 12], "life": [2, 3], "speed": [6, 10], "g": 9.8, "spin": 8, "bounce": 0.3,
//     "mesh": { "rows": ["a", "b", "c"], "seed": 4, "look": { "shape": { "detail": 1, "lumpy": [0.7, 0.4], "squash": 0.8 }, "colour": "#3b3632", "lods": [0], "shadow": 30, "leaf": 0 } } }
//
// `mesh` is `{ rows, look, seed? }`: `look` an instances3d look (`instances3d.sim.ts`), `rows` the rows of it
// the particles are drawn as, each particle one of them by its pick, and `seed` the boulders' seed (0).
// `behaviors()` is `{ mesh }`, gpuparticle3d's Drawer for that word. Every particle is on the GPU, so its
// Drawing is an Instances placed on the GPU (`instances3d.plugin.ts`, a spec's `gpu`): each row handed the
// slots of the particles drawn as it, each instance at its particle's place, turned by its spin about the
// line square to its way and up, at its size now, all read in the vertex shader from gpuparticle3d's
// textures. instances3d is listed in the scene, before render3d.
import type { Drawer, View } from '#plugins/gpuparticle3d/gpuparticle3d.plugin.ts'
import { check, type Look } from './instances3d.sim.ts'
import type { Instances } from './instances3d.plugin.ts'

type Mesh = { rows: string[]; look: Look; seed?: number }

// Each instance from its particle: where it is, its turn, its size now; nothing for a slot whose particle has
// gone before the CPU has let it go.
const PLACE = /* glsl */ `
void inPlace( float slot, out vec3 at, out vec4 rot, out float size ) {
  P q = load( int( slot ) );
  at = vec3( 0.0 ); rot = vec4( 0.0, 0.0, 0.0, 1.0 ); size = 0.0;
  if ( !used( q ) || !alive( q ) ) return;
  at = place( q );
  vec3 side = length( q.v.xz ) > 1e-9 ? normalize( vec3( -q.v.z, 0.0, q.v.x ) ) : vec3( 1.0, 0.0, 0.0 );
  float h = q.rot / 2.0;
  rot = vec4( side * sin( h ), cos( h ) );
  size = sized( q );
}
`

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
        const uniforms: Record<string, { value: unknown }> = {
          tableTex: { value: null }, effectsTex: { value: null }, liveTex: { value: null },
          sA: { value: null }, sB: { value: null }, sC: { value: null }, sD: { value: null }, sR: { value: null },
          S: { value: 1 },
        }
        let it: Instances | undefined
        let made: string | undefined // the prelude the Instances was made with
        let placed: View['particles'] | undefined // the list its rows were last placed from
        return {
          frame(view: View) {
            // made the first frame its look has loaded, and again should the prelude it reads by change
            if (!it || made !== view.prelude) {
              it?.dispose()
              it = plugins.instances3d.instances(plugins, {
                name, rows: data.rows, seed: data.seed ?? 0, shells: [Infinity], look: data.look,
                gpu: { uniforms, glsl: `${view.prelude.replace(/precision [^;]*;/g, '')}\n${PLACE}` },
              })
              placed = undefined
              if (!it) return
              made = view.prelude
              it.show()
            }
            uniforms.tableTex.value = view.table
            uniforms.effectsTex.value = view.effects
            uniforms.liveTex.value = view.live
            uniforms.sA.value = view.state.A
            uniforms.sB.value = view.state.B
            uniforms.sC.value = view.state.C
            uniforms.sD.value = view.state.D
            uniforms.sR.value = view.state.R
            uniforms.S.value = view.S
            // the rows placed again only when the list is a new one: gpuparticle3d hands the same list while
            // no particle of it was thrown or died
            if (placed !== view.particles) {
              placed = view.particles
              const rows = data.rows.map(() => [] as number[])
              for (const p of view.particles) rows[Math.min(data.rows.length - 1, Math.floor(p.pick * data.rows.length))].push(p.slot)
              data.rows.forEach((row, i) => it!.place(row, rows[i]))
            }
            it.frame([])
          },
          dispose: () => it?.dispose(),
        }
      },
    },
  }
}
