// lod3d: instances placed round the camera by level of detail, by layers that compose like particle3d's
// effects. A layer places things on surfaces, or round the instances of another layer: a tree, and the
// ferns under it, and the stones round the ferns. Every surface comes from a mod, and so does every way an
// instance is drawn; lod3d knows no ground and draws nothing itself, and with no mod named it throws. This
// half is what the page and the server both read.
//
// `world.lod3d`:
//   mods       surfaces  the server's: `surfaces(w)` → Surface[], the same list while its surfaces stand
//                        and a new one when any changes, so what is kept of them is kept by the list
//              seen      the page's: `seen(plugins)` → `{ surfaces, version, shown?, worker? }`, or undefined
//                        while that plugin has none yet; `version` moves when any of its surfaces moves;
//                        `prepared` `[x, z]`, a place the camera is about to jump to, whose tiles the
//                        browser half works ahead (its header, Prepared places);
//                        `worker` `{ url, held? }`, the module lod3d's workers load to answer its surfaces
//                        (the browser half's Workers): its `behaviors()` the same as the mod's, and its
//                        `worker(held)`, where it gives one, what its behaviors read there, made once a
//                        version from `held`, which a worker is sent as structured data
//              behaviors `behaviors()` → `{ <word>: Behavior | Drawer }`: the geometry of a surface of each
//                        word, and what draws a layer that gives each word
//              hollows   the page's boxes nothing is drawn inside (the browser half's header)
//   rings      metres, nearest first: shell k of a layer reaches out to `rings[k]`
//   budget hollows  the browser half's (its header)
//   layers     name to a layer, or to `{ use: [<layer>, …], on? }`: those layers under `<name>/<used>`,
//              each on this `on` when it gives one, one on a sibling of the use on that sibling's copy. A
//              layer a use names is drawn only through it.
// A layer:
//   on         surface names (as their mods name them), or one layer's name: then it stands round each of
//              that layer's instances, on the same surface
//   rows       name to `{ weight?, solid?, tall?, sink? }`: `weight` how often it is picked (1); `solid`,
//              `tall` read by the mods that walk round it (`lod3d.walker.ts`); `sink` the row's own, in
//              place of the layer's
//   cell       its tile's side in metres
//   seed       its hashes' seed
//   spacing    metres between its cells over a surface, one try a cell
//   count ring on a layer: `count` tries round each instance, each `ring` [inner, outer] metres out, times
//              that instance's size, set evenly round it and shaken by `jitter` (0 even, 1 anywhere)
//   density    the share of tries kept, times the surface's `keep` there
//   rules      `[{ q, lo, hi }]`, each a ramp the keep is multiplied by: `up` the normal's y, `height` the
//              foot's y, any other asked of the surface's own `ramp`
//   clearing   metres across x and z from the world's origin inside which no foot is kept (0)
//   size       [base, spread]: base + h·spread, times the parent's size on a layer
//   spin       the share of a turn it is spun about its up (1);  lean  0 upright, 1 along the normal (the
//              row's own, off its model, where it gives none);  sink  [base, spread], the share of its
//              height pushed in;  vary  how far its grey strays from 1
//   <word>     every other field is a word a Drawer is delivered for, its value that Drawer's numbers: how
//              the layer's instances are drawn (`{ "mesh": { … } }`, `plugins/instances3d`). A layer gives
//              one word or more, each drawn over the same instances; it is held out to the ring of the
//              most shells any of them draws.
//
// A Behavior, for a surface of its word, its numbers and `ask` (`{ w }` on the server, `{ plugins }` on the
// page, `{ worker }` in a worker of lod3d's, `worker` what each `seen` plugin's `worker(held)` made there, by
// that plugin's name):
//   span(shape, box, ask)    [u0, v0, u1, v1], the part of its own (u, v) whose points may lie in the world
//                            box `{ min, max }`, or undefined
//   spot(shape, u, v, ask)   `{ p, normal, keep?, ramp? }` at (u, v), or undefined off it
//   check?(shape, rules, what, ask)  throws a sentence naming `what` and a rule it cannot answer
//
// A Drawer, for a layer that gives its word, its numbers `look`:
//   check(look, rings, what, world)  throws a sentence naming `what` and the number that is wrong
//   shells(look)              how many of `rings` it draws, nearest first
//   draw(look, made)          the page's: a Drawing of the layer, or undefined while what it needs has not
//                             come (a model loading); `made` is `{ name, layer, rings, plugins, hollows?,
//                             slots }`, `hollows` the most boxes it is handed each frame when the scene names
//                             any, `slots` each shell's count of tiles, (2R + 1)² − (2r + 1)², R its reach in
//                             tiles and r the one inside it's
// A Drawing:
//   arrive(things, shell)     draws a tile's instances in that shell; hands back what `leave` is handed
//   leave(drawn)              takes them out again
//   frame(hollows)            once a frame after the tiles have moved: the boxes nothing is drawn inside,
//                             `{ at, rot, half }`, nearest the camera first
//   show()                    puts what it draws on the scene, and everything it makes after
//   stale()                   whether its own numbers have changed since it was made
//   dispose()                 lets go of everything it made
//
// `tile(name, layers, i, j, surfaces, behaviors, ask, kept?)` is the instances of a layer whose foot is in
// tile (i, j), [i·cell, (i+1)·cell) across x and z, the same every time; `kept` a map that holds the tiles
// a layer round another asks of its parent. `tiles({ name, layers, tiles, surfaces }, behaviors, ask)` is
// `tile` of each `[i, j]` of `tiles` in turn, sharing one `kept`: what a worker of lod3d's runs.
// `rootsOf(name, layers)` is the surface names a layer's tiles read, through every layer it stands round.
// `layersOf`, `check`, `geometry` as named.
import type { W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import * as math from '#plugins/math/math.sim.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

export type Ask = { w?: W; plugins?: Plugins; worker?: Record<string, unknown> }
export type Box = { min: number[]; max: number[] }
export type Rule = { q: string; lo: number; hi: number }
export type Spot = { p: number[]; normal: number[]; keep?: number; ramp?(rule: Rule): number }
export type Surface = { name: string; id: string; shape: Record<string, unknown> }
export type Seen = { surfaces: Surface[]; version: string; shown?: boolean; prepared?: number[]; worker?: { url: string; held?: unknown } }
// A batch of tiles of one layer: the layers as `layersOf` opens them, the tiles `[i, j]`, and the surfaces
// they stand on.
export type Tiles = { name: string; layers: Record<string, Layer>; tiles: [number, number][]; surfaces: Surface[] }
export type Behavior = {
  span(shape: any, box: Box, ask: Ask): number[] | undefined
  spot(shape: any, u: number, v: number, ask: Ask): Spot | undefined
  check?(shape: any, rules: Rule[], what: string, ask: Ask): void
}
export type Hollow = { at: number[]; rot: number[]; half: number[] }
export type Made = { name: string; layer: Layer; rings: number[]; plugins: Plugins; hollows?: number; slots: number[] }
export type Drawing = {
  arrive(things: Thing[], shell: number): unknown
  leave(drawn: unknown): void
  frame(hollows: Hollow[]): void
  show(): void
  stale(): boolean
  dispose(): void
}
export type Drawer = {
  check(look: any, rings: number[], what: string, world: Record<string, any>): void
  shells(look: any): number
  draw(look: any, made: Made): Drawing | undefined
}
export type Behaviors = Record<string, Behavior | Drawer>
export type Layer = {
  on: string[]
  rows: Record<string, { weight?: number; solid?: number; tall?: number; sink?: [number, number] }>
  cell: number; seed: number; spacing?: number; count?: number; ring?: [number, number]; jitter?: number
  density: number; rules?: Rule[]; clearing?: number; size: [number, number]; spin?: number; lean?: number; sink?: [number, number]; vary?: number
  [word: string]: unknown
}
export type Use = { use: string[]; on?: string[] }
export type Lod3d = { mods?: Record<string, string | string[]>; rings: number[]; budget: number; hollows?: number; layers: Record<string, Layer | Use> }
// An instance: its row, foot, normal, size, spin, grey, sink, and where on which surface it stands.
export type Thing = { row: string; at: number[]; normal: number[]; size: number; spin: number; tint: number; sink: number; surface: string; u: number; v: number }

// A layer's own fields; every other is a word a Drawer is delivered for.
const PLACE = new Set(['on', 'rows', 'cell', 'seed', 'spacing', 'count', 'ring', 'jitter', 'density', 'rules', 'clearing', 'size', 'spin', 'lean', 'sink', 'vary'])

export function named<F extends (...args: any[]) => any>(world: Record<string, any>, key: 'surfaces' | 'seen' | 'behaviors'): F[] {
  const got = modsOf<F>(world, 'lod3d', key)
  if (!got.length) throw new Error(`lod3d stands nothing on nothing, and world.lod3d.mods.${key} names no plugin`)
  return got
}
export const behaviorsOf = (world: Record<string, any>): Behaviors =>
  Object.assign({}, ...named<() => Behaviors>(world, 'behaviors').map(f => f()))
export const geometry = (w: W) => ({ surfaces: named<(w: W) => Surface[]>(w.world, 'surfaces').flatMap(f => f(w)), behaviors: behaviorsOf(w.world) })

const isDrawer = (b: Behavior | Drawer): b is Drawer => (b as Drawer).draw !== undefined

function behaviorOf(s: Surface, behaviors: Behaviors) {
  const word = Object.keys(s.shape)[0]
  const b = behaviors[word]
  if (!b || isDrawer(b)) throw new Error(`lod3d has no behavior for ${s.name}, of the word ${word}: no plugin world.lod3d.mods.behaviors names delivers it`)
  return { data: s.shape[word], b }
}

// Each word a layer gives, with the Drawer delivered for it and its numbers.
export function drawersOf(l: Layer, behaviors: Behaviors, what: string): { word: string; drawer: Drawer; look: unknown }[] {
  const words = Object.keys(l).filter(k => !PLACE.has(k))
  if (!words.length) throw new Error(`${what} draws nothing: it gives no word a plugin world.lod3d.mods.behaviors names draws`)
  return words.map(word => {
    const b = behaviors[word]
    if (!b || !isDrawer(b)) throw new Error(`${what} gives ${word}, which is no field of a layer and which no plugin world.lod3d.mods.behaviors names draws`)
    return { word, drawer: b, look: l[word] }
  })
}
// How many of `rings` a layer is held out to: the most shells any of its words draws.
export const reachOf = (l: Layer, behaviors: Behaviors, what: string) => Math.max(...drawersOf(l, behaviors, what).map(d => d.drawer.shells(d.look)))

const isUse = (l: Layer | Use): l is Use => (l as Use).use !== undefined

export function layersOf(s: Lod3d): Record<string, Layer> {
  const out: Record<string, Layer> = {}
  const used = new Set(Object.values(s.layers).flatMap(l => (isUse(l) ? l.use : [])))
  const open = (at: string, l: Layer | Use, on: string[] | undefined, siblings: Set<string>, prefix: string, seen: string[]) => {
    if (!isUse(l)) {
      const round = l.on.some(n => siblings.has(n))
      out[at] = { ...l, on: round ? l.on.map(n => (siblings.has(n) ? `${prefix}/${n}` : n)) : on ?? l.on }
      return
    }
    if (!(Array.isArray(l.use) && l.use.length > 0)) throw new Error(`lod3d layer ${at} uses no layers`)
    for (const u of l.use) {
      if (seen.includes(u)) throw new Error(`lod3d layer ${seen[0]} uses itself through ${[...seen.slice(1), u].join(', ')}`)
      if (!s.layers[u]) throw new Error(`lod3d layer ${at} uses ${u}, which is no layer`)
      open(`${at}/${u}`, s.layers[u], l.on ?? on, new Set(l.use), at, [...seen, u])
    }
  }
  for (const [name, l] of Object.entries(s.layers)) if (!used.has(name)) open(name, l, undefined, new Set(), name, [name])
  return out
}

export function check(s: Lod3d, surfaces: Surface[], behaviors: Behaviors, ask: Ask) {
  if (!(Array.isArray(s.rings) && s.rings.length > 0 && s.rings.every((r, k) => r > (k ? s.rings[k - 1] : 0)))) throw new Error(`lod3d rings ${JSON.stringify(s.rings)} are not metres, each beyond the one before`)
  const layers = layersOf(s)
  for (const [name, l] of Object.entries(layers)) {
    const what = `lod3d layer ${name}`
    if (!(Array.isArray(l.on) && l.on.length > 0)) throw new Error(`${what} stands on nothing`)
    for (const d of drawersOf(l, behaviors, what)) d.drawer.check(d.look, s.rings, `${what}'s ${d.word}`, ask.w?.world ?? ask.plugins!.wire.scene.world!)
    if (!(l.cell > 0)) throw new Error(`${what} cell ${l.cell} is not above 0`)
    if (!Number.isInteger(l.seed)) throw new Error(`${what} seed ${l.seed} is not a whole number`)
    if (!(l.density >= 0 && l.density <= 1)) throw new Error(`${what} density ${l.density} is not a share from 0 to 1`)
    if (!(l.size?.length === 2 && l.size[0] > 0 && l.size[1] >= 0)) throw new Error(`${what} size ${JSON.stringify(l.size)} is not [base above 0, spread]`)
    if (l.clearing !== undefined && !(l.clearing >= 0)) throw new Error(`${what} clearing ${l.clearing} is not metres of at least 0`)
    const sinks: [string, unknown][] = [['', l.sink], ...Object.entries(l.rows).map(([row, r]): [string, unknown] => [` row ${row}`, r.sink])]
    for (const [at, sink] of sinks) {
      if (sink !== undefined && !(Array.isArray(sink) && sink.length === 2 && sink.every(v => Number.isFinite(v) && v >= 0)))
        throw new Error(`${what}${at} sink ${JSON.stringify(sink)} is not [base, spread], two shares of its height of at least 0`)
    }
    const parent = l.on.length === 1 ? layers[l.on[0]] : undefined
    if (parent) {
      if (!(Number.isInteger(l.count) && l.count! > 0)) throw new Error(`${what} stands round ${l.on[0]} and gives no count above 0`)
      if (!(l.ring && l.ring[0] >= 0 && l.ring[1] >= l.ring[0])) throw new Error(`${what} ring ${JSON.stringify(l.ring)} is not [inner, outer]`)
      continue
    }
    if (l.on.some(n => layers[n])) throw new Error(`${what} stands round a layer and on something else: a layer stands on surfaces, or round one layer`)
    if (!(l.spacing! > 0)) throw new Error(`${what} spacing ${l.spacing} is not above 0 metres`)
    const asked = (l.rules ?? []).filter(r => r.q !== 'up' && r.q !== 'height')
    for (const sf of surfaces) if (l.on.includes(sf.name)) { const { data, b } = behaviorOf(sf, behaviors); b.check?.(data, asked, what, ask) }
  }
}

function hash(i: number, j: number, seed: number): number {
  let h = Math.imul(i | 0, 0x3c6ef372) ^ Math.imul(j | 0, 0x7feb352d) ^ Math.imul(seed | 0, 0x846ca68b)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
function textHash(s: string): number {
  let h = 0x811c9dc5
  for (let n = 0; n < s.length; n++) h = Math.imul(h ^ s.charCodeAt(n), 0x01000193)
  return h >>> 0
}
const shapeOf = (v: number, lo: number, hi: number) => (lo === hi ? (v >= lo ? 1 : 0) : Math.max(0, Math.min(1, (v - lo) / (hi - lo))))

// A try at (u, v) on a surface, with its own rolls: an instance, or undefined where it is not kept.
function attempt(l: Layer, s: Surface, b: Behavior, data: unknown, u: number, v: number, h: (k: number) => number, scale: number, ask: Ask): Thing | undefined {
  const spot = b.spot(data, u, v, ask)
  if (!spot) return undefined
  if (l.clearing && math.hypot(spot.p[0], spot.p[2]) < l.clearing) return undefined
  let keep = l.density * (spot.keep ?? 1)
  for (const r of l.rules ?? []) {
    if (!(h(0) < keep)) return undefined
    const value = r.q === 'up' ? spot.normal[1] : r.q === 'height' ? spot.p[1] : undefined
    keep *= value === undefined ? spot.ramp!(r) : shapeOf(value, r.lo, r.hi)
  }
  if (!(h(0) < keep)) return undefined
  const rows = Object.entries(l.rows), total = rows.reduce((a, [, r]) => a + (r.weight ?? 1), 0)
  let pick = h(5) * total
  const row = rows.find(([, r]) => (pick -= r.weight ?? 1) < 0)?.[0]
  if (row === undefined) return undefined
  const sunk = l.rows[row].sink ?? l.sink
  return {
    row, at: spot.p, normal: spot.normal, surface: s.id, u, v,
    size: (l.size[0] + h(6) * l.size[1]) * scale,
    spin: 2 * Math.PI * h(3) * (l.spin ?? 1),
    tint: 1 + (l.vary ?? 0) * (2 * h(4) - 1),
    sink: sunk ? sunk[0] + h(7) * sunk[1] : 0,
  }
}

// A list of surfaces by name, made once for each list handed, so a tile reads only the surfaces its layer
// stands on, in the list's order, as a walk of the whole list would meet them.
const named_ = new WeakMap<Surface[], Map<string, number[]>>()
function on(surfaces: Surface[], names: string[]): Surface[] {
  let m = named_.get(surfaces)
  if (!m) {
    m = new Map()
    surfaces.forEach((s, n) => {
      const list = m!.get(s.name)
      if (list) list.push(n)
      else m!.set(s.name, [n])
    })
    named_.set(surfaces, m)
  }
  const at = [...new Set(names)].flatMap(name => m!.get(name) ?? [])
  if (names.length > 1) at.sort((a, b) => a - b)
  return at.map(n => surfaces[n])
}

// A list of surfaces by id, made once for each list handed.
const ided = new WeakMap<Surface[], Map<string, Surface>>()
function idsOf(surfaces: Surface[]): Map<string, Surface> {
  let m = ided.get(surfaces)
  if (!m) ided.set(surfaces, (m = new Map(surfaces.map(s => [s.id, s]))))
  return m
}

export function tile(name: string, layers: Record<string, Layer>, i: number, j: number, surfaces: Surface[], behaviors: Behaviors, ask: Ask, kept = new Map<string, Thing[]>()): Thing[] {
  const key = `${name} ${i} ${j}`
  const had = kept.get(key)
  if (had) return had
  const l = layers[name]
  const x0 = i * l.cell, z0 = j * l.cell, x1 = x0 + l.cell, z1 = z0 + l.cell
  const inside = (p: number[]) => p[0] >= x0 && p[0] < x1 && p[2] >= z0 && p[2] < z1
  const out: Thing[] = []
  const parent = layers[l.on[0]]
  if (parent && l.on.length === 1) {
    // Round each instance of the parent whose ring may reach this tile.
    const g = l.ring![1] * (parent.size[0] + parent.size[1])
    const byId = idsOf(surfaces)
    for (let pj = Math.floor((z0 - g) / parent.cell); pj <= Math.floor((z1 + g) / parent.cell); pj++) {
      for (let pi = Math.floor((x0 - g) / parent.cell); pi <= Math.floor((x1 + g) / parent.cell); pi++) {
        tile(l.on[0], layers, pi, pj, surfaces, behaviors, ask, kept).forEach((par, n) => {
          const s = byId.get(par.surface)!
          const { data, b } = behaviorOf(s, behaviors)
          const seed = hash(pi, pj, (l.seed ^ n) | 0)
          // The set's turn about its parent, so no two parents' sets line up.
          const turn = hash(seed, -1, 0) / 4294967296
          for (let k = 0; k < l.count!; k++) {
            const h = (m: number) => hash(seed, k, m) / 4294967296
            const th = 2 * Math.PI * (turn + (k + 0.5 + (l.jitter ?? 0) * (h(1) - 0.5) * l.count!) / l.count!)
            const r = (l.ring![0] + h(2) * (l.ring![1] - l.ring![0])) * par.size
            const t = attempt(l, s, b, data, par.u + r * math.cos(th), par.v + r * math.sin(th), h, par.size, ask)
            if (t && inside(t.at)) out.push(t)
          }
        })
      }
    }
  } else {
    const box = { min: [x0, -Infinity, z0], max: [x1, Infinity, z1] }
    for (const s of on(surfaces, l.on)) {
      const { data, b } = behaviorOf(s, behaviors)
      const span = b.span(data, box, ask)
      if (!span) continue
      const sp = l.spacing!, seed = (l.seed ^ textHash(s.id)) | 0
      // An axis of no length (a curve across, a point either way) is one try, at its place.
      const flatU = span[0] === span[2], flatV = span[1] === span[3]
      for (let cj = Math.floor(span[1] / sp); cj <= (flatV ? Math.floor(span[1] / sp) : Math.floor(span[3] / sp)); cj++) {
        for (let ci = Math.floor(span[0] / sp); ci <= (flatU ? Math.floor(span[0] / sp) : Math.floor(span[2] / sp)); ci++) {
          const h = (m: number) => hash(ci, cj, seed + m) / 4294967296
          const u = flatU ? span[0] : (ci + h(1)) * sp, v = flatV ? span[1] : (cj + h(2)) * sp
          if (u < span[0] || u > span[2] || v < span[1] || v > span[3]) continue
          const t = attempt(l, s, b, data, u, v, h, 1, ask)
          if (t && inside(t.at)) out.push(t)
        }
      }
    }
  }
  kept.set(key, out)
  return out
}

export function tiles(input: Tiles, behaviors: Behaviors, ask: Ask): Thing[][] {
  const kept = new Map<string, Thing[]>()
  return input.tiles.map(([i, j]) => tile(input.name, input.layers, i, j, input.surfaces, behaviors, ask, kept))
}

export function rootsOf(name: string, layers: Record<string, Layer>): string[] {
  const l = layers[name]
  return l.on.length === 1 && layers[l.on[0]] ? rootsOf(l.on[0], layers) : l.on
}
