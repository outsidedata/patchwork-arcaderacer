// terrain3d's mod for lod3d (`addons/scenemanager`'s mods): the land as a surface lod3d's layers stand on,
// named `land`, of the word `land`, whose (u, v) is the world's (x, z).
//
// `world.lod3d.mods`: `surfaces: ['terrain3d']` (`surfaces(w)`), `seen: ['terrain3d']` (`seen(plugins)`, the
// land as this page has it, its `version` moving with a new land and every stroke, `shown` once its rings
// are on the scene, `prepared` the place `prepare` holds, `[x, z]`, while it holds one (`lod3d.terrain3d.ts`
// holds the place until lod3d's share of it is done), and `worker`, this module with the land's field and unsaved strokes, for lod3d's
// workers; undefined until it has a land), `behaviors: ['terrain3d']` (`land`):
//   span   the box's square across x and z
//   spot   at (x, height, z), its normal the land's up from its height NORMAL metres either side, `keep`
//          its paint's cover (a road keeps none), `ramp` a rule over the land record
//   check  the land's own check of every rule
//
// In a worker of lod3d's (`lod3d.worker.ts`), `worker(held)` makes the land from the field and unsaved
// strokes `seen` handed, once a version, and `land` reads it: the same land and the same arithmetic as the
// page and the server, so a tile worked there is the same to the bit.
import type { W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Ask, Behavior, Seen, Surface } from '#plugins/lod3d/lod3d.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { edits, heightAt, land as landOf, paintAt, ramp, type Field, type Land, type Rule, type Stroke } from './terrain3d.sim.ts'

const NORMAL = 0.5
const LAND: Surface = { name: 'land', id: 'land', shape: { land: {} } }
// This module, which lod3d's workers load to answer the land. It names its own file as a `new URL`, so
// the static site's bundle (`scripts/bundle.ts`) finds it as a task of a worker and writes it as a file.
const HERE = new URL('./terrain3d.lod3d.ts', import.meta.url).href

const LANDS: Surface[] = [LAND]
export const surfaces = (_w: W): Surface[] => LANDS

const ids = new WeakMap<object, number>()
let next = 0
const idOf = (o: object) => ids.get(o) ?? (ids.set(o, next++), next - 1)

// What a worker makes the land from: the field and each layer's unsaved stroke.
export type Held = { field: Field; unsaved: (Stroke | undefined)[] }

export function seen(plugins: Plugins): Seen | undefined {
  const ground = plugins.terrain3d?.ground
  if (!ground) return undefined
  const e = ground.edits()
  const l = e.land as Land
  const held: Held = { field: l.field, unsaved: (l.field.layers ?? []).map((_, k) => l.unsaved(k)) }
  return {
    surfaces: [LAND],
    version: `${idOf(e.land)} ${e.layers.map((x: { version: number }) => x.version).join(' ')}`,
    shown: ground.shown(),
    ...(ground.prepared() && { prepared: ground.prepared() }),
    worker: { url: HERE, held },
  }
}

type Q = { height(x: number, z: number): number; cover(x: number, z: number): number; ramp(r: Rule, x: number, z: number): number; rules(list: Rule[], what: string): Rule[] }

// The land in a worker of lod3d's, made from what `seen` handed.
export function worker(held: Held): Q {
  const l = landOf(held.field, { unsaved: k => held.unsaved[k] })
  return { height: (x, z) => l.height(x, z), cover: (x, z) => l.paint(x, z).cover, ramp: (r, x, z) => l.ramp(r, x, z), rules: (list, what) => l.rules(list, what) }
}

function q(ask: Ask): Q {
  if (ask.worker) return ask.worker.terrain3d as Q
  if (!ask.w) return ask.plugins!.terrain3d.ground
  const w = ask.w
  return { height: (x, z) => heightAt(w, x, z), cover: (x, z) => paintAt(w, x, z).cover, ramp: (r, x, z) => ramp(w, r, x, z), rules: (list, what) => edits(w).land.rules(list, what) }
}

const land: Behavior = {
  span: (_d, box) => [box.min[0], box.min[2], box.max[0], box.max[2]],
  spot(_d, x, z, ask) {
    const g = q(ask)
    const dx = (g.height(x + NORMAL, z) - g.height(x - NORMAL, z)) / (2 * NORMAL), dz = (g.height(x, z + NORMAL) - g.height(x, z - NORMAL)) / (2 * NORMAL)
    const n = math.hypot(dx, 1, dz)
    return { p: [x, g.height(x, z), z], normal: [-dx / n, 1 / n, -dz / n], keep: g.cover(x, z), ramp: r => g.ramp(r, x, z) }
  },
  check: (_d, rules, what, ask) => { q(ask).rules(rules, what) },
}

export const behaviors = (): Record<string, Behavior> => ({ land })
