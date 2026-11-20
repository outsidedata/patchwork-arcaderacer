// particle3d's mod for lod3d (`addons/scenemanager`'s mods). A scene with `world.lod3d.mods: { behaviors:
// [..., 'particle3d'] }` has every lod3d layer that gives `emitter` run a particle3d effect on each of its
// instances while lod3d holds it near enough:
//
//   "fireflies": { "on": ["firs"], "rows": { "glow": {} }, ..., "emitter": { "effect": "fireflies", "at": [0, 1, 0] } }
//
// `behaviors()` is `{ emitter }`, lod3d's Drawer for that word. Its numbers:
//   effect   the effect of particle3d's effects file each instance runs
//   at       [x, y, z] metres off the instance's foot, times its size; [0, 0, 0] when left out
//   scale    times the instance's size, the effect's `scale`; 1 when left out
//   shells   how many of lod3d's rings it runs out to, nearest first; 1 when left out
// Each instance's effect runs from the frame its tile arrives in a shell it runs in until the frame it
// leaves every shell it runs in (moving between two of them, it runs on), seeded by where it stands so every page throws the same particles there; it is thrown nothing
// until lod3d shows its layers. A layer's Drawing is held once particle3d has read its effects file and
// it holds the effect. particle3d is listed in the scene, before render3d.
import type { Drawer, Thing } from '#plugins/lod3d/lod3d.sim.ts'
import type { Effect } from './particle3d.plugin.ts'

export type Emitter = { effect: string; at?: number[]; scale?: number; shells?: number }

// A whole number from where an instance stands, the same on every page.
function seedOf(at: number[]): number {
  let h = 0x811c9dc5
  for (const v of at) h = Math.imul(h ^ Math.round(v * 1000), 0x01000193)
  return h >>> 0
}

function check(look: Emitter, rings: number[], what: string) {
  if (typeof look !== 'object' || look === null) throw new Error(`${what} ${JSON.stringify(look)} is not an emitter's numbers`)
  if (typeof look.effect !== 'string') throw new Error(`${what} names no effect`)
  if (look.at !== undefined && !(Array.isArray(look.at) && look.at.length === 3 && look.at.every(Number.isFinite))) throw new Error(`${what} at ${JSON.stringify(look.at)} is not [x, y, z] metres`)
  if (look.scale !== undefined && !(look.scale > 0)) throw new Error(`${what} scale ${look.scale} is not above 0`)
  const shells = look.shells ?? 1
  if (!(Number.isInteger(shells) && shells >= 1 && shells <= rings.length)) throw new Error(`${what} shells ${look.shells} is not a whole number of up to ${rings.length} rings`)
}

export function behaviors(): Record<string, Drawer> {
  return {
    emitter: {
      check,
      shells: (look: Emitter) => look.shells ?? 1,
      draw(look: Emitter, made) {
        const p = made.plugins.particle3d
        if (!p) throw new Error(`lod3d layer ${made.name} runs an emitter through particle3d, which this scene does not list`)
        if (!p.has(look.effect)) return undefined
        const shells = look.shells ?? 1
        const off = look.at ?? [0, 0, 0]
        let shown = false
        // Each tile's instances, and their effects once shown.
        const held = new Map<Thing[], Effect[]>()
        const start = (things: Thing[]): Effect[] => things.map(t => {
          const at = [0, 1, 2].map(i => t.at[i] + off[i] * t.size)
          return p.emit(look.effect, at, { life: Infinity, scale: (look.scale ?? 1) * t.size, seed: seedOf(t.at) }) as Effect
        })
        const stop = (fx: Effect[]) => { for (const e of fx) e.life = e.age }
        // A tile that leaves and arrives again in one frame (moving from shell to shell) keeps its
        // effects running; one that has not arrived again by `frame` stops them.
        const leaving = new Map<Thing[], Effect[]>()
        return {
          arrive(things, shell) {
            if (shell >= shells) return undefined
            const kept = leaving.get(things)
            leaving.delete(things)
            held.set(things, kept ?? (shown ? start(things) : []))
            return things
          },
          leave(drawn) {
            if (!drawn) return
            leaving.set(drawn as Thing[], held.get(drawn as Thing[]) ?? [])
            held.delete(drawn as Thing[])
          },
          frame() {
            for (const fx of leaving.values()) stop(fx)
            leaving.clear()
          },
          show() {
            if (shown) return
            shown = true
            for (const things of held.keys()) held.set(things, start(things))
          },
          stale: () => false,
          dispose() {
            for (const fx of [...held.values(), ...leaving.values()]) stop(fx)
            held.clear()
            leaving.clear()
          },
        }
      },
    },
  }
}
