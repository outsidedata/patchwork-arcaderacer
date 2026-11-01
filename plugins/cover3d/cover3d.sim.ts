// cover3d: where a body can stand out of a threat's sight behind the solids standing on the ground.
// It has a server half only: a rule asks it, and nothing is drawn.
//
// The solids are asked of other plugins through mods (`addons/scenemanager`), the ones
// `world.cover3d.mods.solids` names, one plugin or a list, each one's solids taken: `(w, x, z, r) →
// Shape[]`, every solid that may reach within r of (x, z), as shapes (Shapes, below)
// (`scatter3d.cover3d.ts`, `shapes3d.cover3d.ts`). cover3d has no row and no numbers of its own: a rule
// hands every number with the question.
//
// Shapes. cover3d never knows what a solid is: it asks each for a spot by its behavior, a table from a
// word to `(shape, at, threat, { reach, radius, low }) → { at, tall } | undefined`, the place a body
// `radius` wide stands behind a thing of that word, hidden from `threat`, or undefined when the thing
// is under `low` tall or its middle is more than `reach` from `at`. A solid names its word by the key
// its numbers sit under. cover3d's own word:
//   cylinder  `{ pos, radius, height? }`, upright, its foot's middle at `pos`, `height` tall, without
//             end when it has none: its spot is the point on the line from `threat` through its
//             middle, past it by its radius and the body's, so the body stands against its far side.
// More words come from the plugins `world.cover3d.mods.behaviors` names, each exporting `behaviors()`,
// `{ <word>: <behavior> }`, laid over cover3d's own in the list's order: a word one delivers takes the
// place of cover3d's own of that word, and a later one's takes the place of an earlier one's. The
// plugin that hands cover3d solids of a word delivers that word's behavior (`plugins/shapes3d`'s
// `box`). A solid of a word none of them has throws naming it. One fallback is kept, `fromBare`: a solid
// handed bare, `{ x, z, radius, tall? }`, as providers written before solids had words hand them, is
// the upright cylinder it always was. Nothing past `fromBare` reads a bare solid.
//
// `spots(w, at, threat, { reach, radius, low })` is every place within `reach` metres of `at` that a
// solid hides from `threat`, nearest to `at` first: for each solid at least `low` metres tall whose
// middle is within `reach`, its behavior's spot. Each is `{ at: [x, z], tall, far }`, `tall` the
// solid's height and `far` the metres from `at`. The line from the threat to a spot passes through the
// solid, so a line from the threat at any height under `tall` over the ground meets the solid first;
// the ground between is not asked. `at` and `threat` are [x, z].
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

// A solid handed bare (`fromBare`).
export type Solid = { x: number; z: number; radius: number; tall?: number }
// A solid: its numbers under its word (Shapes, above).
export type Worded = { [word: string]: any }
export type Spot = { at: number[]; tall: number; far: number }
export type Ask = { reach: number; radius: number; low: number }
// A word's behavior: the spot behind a thing of that word, hidden from `threat`.
export type Behavior = (shape: any, at: number[], threat: number[], ask: Ask) => { at: number[]; tall: number } | undefined
type Solids = (w: W, x: number, z: number, r: number) => (Solid | Worded)[]

// cover3d's own word (Shapes, above).
/** @deprecated LEGACY, being phased out: a plugin keeps no words of its own; every word is delivered by the plugin that brings things of it (`world.cover3d.mods.behaviors`). */
export const base: Record<string, Behavior> = {
  cylinder(c, at, threat, ask) {
    const tall = c.height ?? Infinity
    if (tall < ask.low || math.hypot(c.pos[0] - at[0], c.pos[2] - at[1]) > ask.reach) return undefined
    const dx = c.pos[0] - threat[0], dz = c.pos[2] - threat[1], l = math.hypot(dx, dz)
    if (l === 0) return undefined
    const off = c.radius + ask.radius
    return { at: [c.pos[0] + (dx / l) * off, c.pos[2] + (dz / l) * off], tall }
  },
}

// Every behavior the scene has: cover3d's own, and over them each mod's in the order they are named;
// made once per scene's `world`, whose mods never change.
const made = new WeakMap<object, Record<string, Behavior>>()
function behaviorsOf(world: object): Record<string, Behavior> {
  let all = made.get(world)
  if (!all) {
    all = { ...base }
    for (const m of modsOf<() => Record<string, Behavior>>(world, 'cover3d', 'behaviors')) Object.assign(all, m())
    made.set(world, all)
  }
  return all
}

// The one fallback: a solid handed bare, `{ x, z, radius, tall? }`, as providers written before solids
// had words hand them, is the upright cylinder it always was. Nothing past this reads a bare solid.
/** @deprecated LEGACY, being phased out: a provider hands worded solids and delivers their words' behaviors; a bare solid is the old way. */
function fromBare(s: Solid | Worded): Worded {
  if (!('x' in s && 'radius' in s)) return s
  const bare = s as Solid
  return { cylinder: { pos: [bare.x, 0, bare.z], radius: bare.radius, height: bare.tall } }
}

export function spots(w: W, at: number[], threat: number[], opts: Ask): Spot[] {
  const solids = modsOf<Solids>(w.world, 'cover3d', 'solids')
  if (!solids.length) throw new Error('cover3d is asked for cover, and the scene names no world.cover3d.mods.solids')
  const all = behaviorsOf(w.world)
  const out: Spot[] = []
  for (const of of solids) {
    for (const solid of of(w, at[0], at[1], opts.reach)) {
      const s = fromBare(solid)
      const word = Object.keys(s)[0]
      const behavior = all[word]
      if (!behavior) throw new Error(`cover3d has no behavior for a solid of the word ${word}: no plugin world.cover3d.mods.behaviors names delivers it`)
      const spot = behavior(s[word], at, threat, opts)
      if (spot) out.push({ ...spot, far: math.hypot(spot.at[0] - at[0], spot.at[1] - at[1]) })
    }
  }
  return out.sort((a, b) => a.far - b.far)
}
