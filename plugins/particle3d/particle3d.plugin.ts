// The browser half of particle3d: the page's ledger of live effects, each effect's particles, and
// their drawing. An effect is spawned at a point with a lifetime, and this plugin runs it from then
// until its last particle is gone; whoever spawned it does nothing more.
//
// Two things spawn one. A rule, through `emit` in `particle3d.sim.ts`: the entry is on the ledger
// row, and this half takes it the first frame it sees it, at the age it has on the row, and while
// the row still holds it follows the `at`, `dir`, `to` and `life` the rule may have written there.
// Anything in the page — an actor, a local actor, another plugin — through this half's `emit`,
// which hands the effect back: writing its `at`, `dir` or `to` moves it, writing its `life` stops it.
// Its rolls come from `seed` when the spawn gives one, so pages that emit one effect with one seed
// draw the same particles, and from `Math.random` when it gives none. `has(name)` says whether the
// effects file has an effect of that name, false until the file has been read; this half asks the
// loader for it in its `tick`, before any actor ticks, so an actor can ask.
//
// The space is the world's, in metres: y is up, and a direction is a vector [x, y, z], so [0, 1, 0]
// is straight up.
//
// The effects are in a data file, the entry of the scene's `loader` catalogue that
// `world.particle3d.effects` names, which this half reads off the scene (the ledger row goes to every seat
// every step, so neither the file nor its name is on the row). It holds `cap`, the most
// particles this page draws at once, past which new ones are dropped; `alphaTest`, 0 when left out;
// for effects drawn from sheets, `ppm`, pixels of a sheet per metre; and `effects`, each a list of
// layers. A layer `{ "effect": name }` stands for every layer of that effect, so effects are built
// out of effects, and `{ "effect": name, "at": [x, y, z] }` for every layer of it thrown from x, y,
// z metres off the point. Every other layer is an emitter, in metres and seconds:
//
//   n        [min, max] particles a burst, 1 when left out. One burst at the effect's start, and
//   every    one more this many seconds after each, while the effect's life lasts.
//   after    the seconds into the effect its first burst is thrown, 0 when left out; `every` counts
//            on from it.
//   life     [min, max] seconds a particle lives; with `lasts` instead, it lives until its effect's
//            life is over, however long that turns out to be: the body of a round carried with its
//            point (`follow`) for as long as the round flies. A layer has one or the other.
//   skip     a particle starts up to this many seconds into its life, so a burst's frames are not all
//            in step.
//   sheet    a loader sheet, and `clip` a clip of it, whose frames play evenly over a particle's
//            life, each its whole frame / `ppm` metres, its pixels where the sheet trimmed them
//            from, filtered as the sheet says; with `play` they play at the sheet's own times for
//            them from its birth instead, round again or held on the last as the clip says. Without
//            one a particle is a flat square one metre on a side.
//   size     [min, max] times that, 1 when left out; `grow` times the size at birth is its size at death.
//   dir      the direction it is thrown along, else the spawn's `dir`; `spread` the most radians off
//            it; no `spread` throws it any way at all. `speed` [min, max] metres a second.
//   jitter   [x, y, z] metres a particle starts off the point, per axis, the difference of two rolls.
//   box      [x0, y0, z0, x1, y1, z1] metres off the point: a particle starts at a point rolled
//            evenly in it, so a box whose corners are one point starts every particle there.
//   g        metres a second² down, negative rising; `drag` the fraction of its speed shed a second;
//            `pull` metres a second² toward the point it was thrown from, negative away.
//   pace     [[seconds, k], ...] in order: from that many seconds into its life on, it goes k times
//            as far a step as its speed says, so one that slows in steps and stops is [[t, 0.5],
//            [t2, 0]]; 1 before the first.
//   follow   it keeps its place about the effect's point as the point moves, where without it a
//            particle is left where it was thrown.
//   flips    [[seconds, x, y], ...] in order: from that many seconds into its life on it is
//            mirrored across when x is 1 and upside down when y is 1, in its frame's own place, as
//            a sprite's tiles are flipped; neither before the first.
//   tint     its colour, else the spawn's, else white; `tint1` the colour it has cooled to at death,
//            each an sRGB number as a three.js material's colour is.
//   gain     times its colour's light, 1 when left out: above 1 a particle is brighter than white,
//            light a renderer that blooms (render3d's `bloom`) spills round it, as a flash's is.
//   a0, a1   its opacity at birth and at death, 1 when left out; `fade` the seconds before its death
//            over which it goes from the one to the other, holding `a0` until then, its whole life
//            when left out.
//   spin     the most radians a second it turns, either way, from a turn it was rolled at birth;
//            without it a particle stands upright.
//   origin   the point of a particle, as fractions of its width from the left and of its height from
//            the top, that is on its place: the anchor of its frame when left out, or the middle of
//            a square; [0.5, 1] stands it there, so one that comes to rest on a floor sits on it.
//   add      drawn adding its light; `stretch` turned along the way it is going, with its head on
//            its place (`origin` [1, 0.5] unless it gives one); `face` turned along the effect's `dir`.
//   beam     drawn from the effect's point to its `to`, as long as the gap between them and as thick
//            as its frame at its size, turned about its length to face the camera, wherever the
//            effect is moved: a beam or a tracer that reaches its target. An effect with a beam is
//            spawned with a `to`.
//   light    { intensity, distance, decay }: each particle carries a real point light where it is
//            drawn, of its colour as it cools, `intensity` times its opacity as it fades, reaching
//            `distance` metres times the effect's `scale`, falling off by `decay` as three's own
//            point lights do. A spell's sparks light the ground and the caster round them. The scene
//            lists `lights3d`, which draws every one of them, and particle3d throws when it does not.
//
// A field the file has that is none of these throws, naming it, the first frame the file is read and
// the first frame after it is written; so does a `dir`, `jitter`, `box` or `at` of the wrong count of
// numbers, a layer with both a `life` and `lasts` or neither, and a field of `world.particle3d` that is
// not `effects` or `hold`.
//
// A spawn, a rule's entry or what a page's `emit` is handed, is the effect's point `at` and:
//
//   life     the seconds it goes on emitting; left out, 0, one burst.
//   dir      the direction a layer that gives none throws along.
//   to       a second point of the world, where its beams end and where it lands.
//   tint     the colour of a layer that gives none.
//   scale    the effect's size: times every length of its layers, a particle's size and its speed,
//            its jitter, its box, its g and its pull, so an effect scaled up goes as far in its
//            sizes as it did before; its lives, drags and paces are times, not lengths, and stay.
//   floor    the height its particles come to rest at.
//   from     the id of the row the effect comes from: while this page's rows hold that row, the
//            effect goes on whatever its `life`, its point that row's `pos` when the row has one;
//            the frame they no longer do, its life is over. A smoulder on a wreck for as long as it
//            lies, a trail on a comet, a glow on an item on the floor.
//   fly      how fast its point is carried from `at` to `to`, in the world's units a second; its
//            `life` is the time that takes.
//   land     effects thrown at its `to`, or at its point when it has none, the frame its life is
//            over: each `{ "effect": name }` and the spawn it is thrown with. Where a round lands,
//            what a wreck leaves when it goes. Each rolls from its `seed`, else from a roll of the
//            effect it lands from, so every page that draws the one draws the same others.
//
// A particle's rolls come from a generator seeded with the ledger entry's id, in the same order on
// every page, so every page draws the same particles; a page that first sees an entry late rolls the
// bursts it missed and ages their particles to now, as a page that saw it from the start has them.
//
// Every particle is a quad facing the camera, and all the particles on one page of one sheet and of
// one blend are one mesh whose buffers are written every frame: one draw for all of them. That is done in
// `afterTick`, after every actor has ticked, so the quads face the camera the seat's own actor moved
// this frame, and so this plugin is listed before `render3d`, whose `afterTick` draws; listed after
// it, every particle would be drawn facing last frame's camera, and that throws. A sheet the loader
// has not handed over yet draws nothing. Each frame moves every effect one step of the scene's `dt`.
// A mesh whose sheet or effects file the editor has written since it was made draws with the new
// page and `alphaTest` from the next frame, and the effects file written (the loader's `onWritten`)
// makes every running effect read its layers again, its particles too, so they draw as it now says.
// `close` frees every mesh; the sheets are the loader's and stay.
import type { Plugins } from '#engine/browser.ts'
import { seeded, type Die } from '#engine/engine.ts'
import { play, type Frame } from '#plugins/loader/loader.sim.ts'
import { flight, type Entry, type Land, type Spawn } from './particle3d.sim.ts'

type Range = [number, number]
type V3 = [number, number, number]
export type Emitter = {
  n?: Range; every?: number; after?: number; life?: Range; lasts?: boolean; skip?: number
  sheet?: string; clip?: string; play?: boolean
  size?: Range; grow?: number
  dir?: number[]; spread?: number; speed?: Range; jitter?: number[]; box?: number[]
  g?: number; drag?: number; pull?: number; pace?: number[][]; follow?: boolean
  tint?: number; tint1?: number; gain?: number; a0?: number; a1?: number; fade?: number
  spin?: number; origin?: [number, number]; add?: boolean; stretch?: boolean; face?: boolean; beam?: boolean; flips?: number[][]
  light?: { intensity: number; distance: number; decay: number }
}
export type Layer = Emitter | { effect: string; at?: number[] }
export type Effects = { cap: number; alphaTest?: number; ppm?: number; effects: Record<string, Layer[]> }

// Every field an emitter may have, in the order the header gives them; the fields of an `{ effect }`
// layer; the fields of the file; and the count of numbers each field that is a point or a box has.
export const FIELDS = [
  'n', 'every', 'after', 'life', 'lasts', 'skip', 'sheet', 'clip', 'play', 'size', 'grow', 'dir', 'spread', 'speed', 'jitter', 'box',
  'g', 'drag', 'pull', 'pace', 'follow', 'flips', 'tint', 'tint1', 'gain', 'a0', 'a1', 'fade', 'spin', 'origin', 'add', 'stretch', 'face', 'beam',
  'light',
] as const satisfies readonly (keyof Emitter)[]
export const REF = ['effect', 'at'] as const
export const FILE = ['cap', 'alphaTest', 'ppm', 'effects'] as const satisfies readonly (keyof Effects)[]
export const WORLD = ['effects', 'hold'] as const
const COUNTS: Record<string, number> = { dir: 3, jitter: 3, box: 6, at: 3 }

// What `emit` hands back. `at`, `dir`, `to` and `life` may be written; `age` is read.
export type Effect = { readonly name: string; at: number[]; dir?: number[]; to?: number[]; life: number; readonly age: number }

type Live = Effect & {
  age: number; tint?: number; scale: number; floor?: number; die: Die
  from?: number; fly?: number; land?: Land[]; landed: boolean
  layers?: Emitter[]; bursts: number[] // per layer, how many of its bursts have been fired
  parts: number; server?: number
}
type Part = {
  fx: Live; layer: Emitter; p: V3; v: V3; o: V3
  age: number; life: number; lasts?: number; s0: number; s1: number; rot: number; spin: number
}
type Group = { mesh: any; capacity: number }

const lerp = (r: Range | undefined, u: number, fallback: number) => (r ? r[0] + (r[1] - r[0]) * u : fallback)
// Of a list of [seconds, ...] in order, the last entry whose seconds a particle `age` old has reached.
const reached = (list: number[][] | undefined, age: number) => {
  let got: number[] | undefined
  for (const e of list ?? []) {
    if (e[0] > age + 1e-9) break
    got = e
  }
  return got
}
const mix = (a: number, b: number, k: number) => {
  const c = (s: number) => {
    const x = (a >> s) & 255, y = (b >> s) & 255
    return Math.round(x + (y - x) * k) << s
  }
  return c(16) | c(8) | c(0)
}
const unit = (a: number[]): V3 => {
  const l = Math.hypot(a[0], a[1], a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

// The seconds a particle lives: its `life`, or for one that lasts, until its effect's life is over.
const span = (q: Part) => (q.lasts === undefined ? q.life : q.fx.life - q.lasts)
// Whether a particle has life left. An age is a sum of steps, which falls short of a whole number
// of them by a rounding, so a particle living n steps is gone after its nth.
const alive = (q: Part) => q.age < span(q) - 1e-9
// Where an effect's point is: its `at`, or for one that flies, carried from there toward its `to`.
const point = (fx: Live): number[] => {
  if (fx.fly === undefined) return fx.at
  const k = fx.life > 0 ? Math.min(1, fx.age / fx.life) : 1
  return [0, 1, 2].slice(0, Math.max(fx.at.length, fx.to!.length)).map(i => (fx.at[i] ?? 0) + ((fx.to![i] ?? 0) - (fx.at[i] ?? 0)) * k)
}

// Throws for the first field of the file, of an effect's layer, or of `world.particle3d` that this plugin
// does not read, and for a point or a box of the wrong count of numbers.
export function check(file: Effects, own: Record<string, unknown>) {
  for (const k of Object.keys(own)) if (!(WORLD as readonly string[]).includes(k)) throw new Error(`world.particle3d has ${k}, which particle3d does not know`)
  for (const k of Object.keys(file)) if (!(FILE as readonly string[]).includes(k)) throw new Error(`particle3d's effects file has ${k}, which particle3d does not know`)
  for (const [name, layers] of Object.entries(file.effects)) {
    layers.forEach((l, i) => {
      const known: readonly string[] = 'effect' in l ? REF : FIELDS
      if (!('effect' in l) && !l.life === !l.lasts) throw new Error(`particle3d effect ${name} layer ${i} ${l.life ? 'has a life and lasts' : 'has no life and does not last'}, and it has one or the other`)
      for (const [k, v] of Object.entries(l)) {
        if (!known.includes(k)) throw new Error(`particle3d effect ${name} layer ${i} has ${k}, which particle3d does not know`)
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`particle3d effect ${name} layer ${i} has a ${k} of ${JSON.stringify(v)}, and particle3d reads ${COUNTS[k]} numbers`)
        if (k === 'light' && !(v && typeof v === 'object' && ['intensity', 'distance', 'decay'].every(n => typeof (v as any)[n] === 'number' && (v as any)[n] >= 0) && Object.keys(v).length === 3))
          throw new Error(`particle3d effect ${name} layer ${i} has a light of ${JSON.stringify(v)}, and particle3d reads { intensity, distance, decay }, each 0 or more`)
      }
    })
  }
}

// Every layer an effect stands for, its `{ effect }` layers opened out, in order, each thrown from
// its `at` off the point: its box moved by it, or a box of that one point for a layer with none.
function flatten(effects: Record<string, Layer[]>, name: string, path: string[] = []): Emitter[] {
  if (path.includes(name)) throw new Error(`particle3d effect ${name} is made of itself: ${[...path, name].join(' > ')}`)
  const layers = effects[name]
  if (!layers) throw new Error(path.length ? `particle3d effect ${path[path.length - 1]} names ${name}, which there is none of` : `particle3d has no effect ${name}`)
  return layers.flatMap(l => {
    if (!('effect' in l)) return [l]
    const inner = flatten(effects, l.effect, [...path, name])
    if (!l.at) return inner
    const [x, y, z] = l.at
    return inner.map(e => {
      const [x0, y0, z0, x1, y1, z1] = e.box ?? [0, 0, 0, 0, 0, 0]
      return { ...e, box: [x0 + x, y0 + y, z0 + z, x1 + x, y1 + y, z1 + z] }
    })
  })
}

export function particle3d() {
  let ledger: Live[] = []
  let fresh = new Set<Live>() // spawned since the last frame, so starting at the age it was given
  const seen = new Set<number>() // the server entries this page has taken
  let file: Effects | undefined
  let unchecked = true // the file has been read or written since it was last checked
  let asked = false
  let stale = false // the effects file has been written since the running effects read their layers
  let checked = false
  let parts: Part[] = []
  const groups = new Map<string, Group>()
  // The point light each lit particle carries, and the lights let go of, hidden, for the next to take.
  const lit = new Map<Part, any>()
  const spare: any[] = []

  const spawn = (name: string, at: number[], s: Spawn, seed: number, server?: number): Live => {
    const fx: Live = {
      name, at: [...at], dir: s.dir ? [...s.dir] : undefined, to: s.to ? [...s.to] : undefined, life: s.life ?? 0, age: 0,
      tint: s.tint, scale: s.scale ?? 1, floor: s.floor, die: seeded(seed), bursts: [], parts: 0, server,
      from: s.from, fly: s.fly, land: s.land && structuredClone(s.land), landed: false,
    }
    if (fx.from !== undefined) fx.life = Infinity
    if (fx.fly !== undefined) fx.life = flight(name, fx.at, fx.to, fx.fly)
    ledger.push(fx)
    fresh.add(fx)
    return fx
  }

  // An effect from a row that has gone: its life is over now, and one that has thrown nothing yet is
  // gone with it.
  const end = (fx: Live) => {
    fx.from = undefined
    fx.life = fx.age
    if (!fx.layers) ledger = ledger.filter(f => f !== fx)
  }

  // The effects an effect throws where it lands, the frame its life is over: each thrown this frame,
  // one step older the next.
  const land = (fx: Live) => {
    if (!fx.land || fx.landed || fx.age < fx.life - 1e-9) return
    fx.landed = true
    const at = fx.to ?? point(fx)
    for (const { effect, seed, ...s } of fx.land) fresh.delete(spawn(effect, at, s, seed ?? Math.floor(fx.die() * 2 ** 32)))
  }

  // One step of a particle's motion.
  const move = (q: Part, dt: number) => {
    const { layer: l, p, v, o } = q
    if (l.drag) {
      const f = Math.max(0, 1 - l.drag * dt)
      v[0] *= f; v[1] *= f; v[2] *= f
    }
    if (l.pull) {
      const d = [o[0] - p[0], o[1] - p[1], o[2] - p[2]]
      const len = Math.hypot(d[0], d[1], d[2])
      if (len > 0) for (let i = 0; i < 3; i++) v[i] += (d[i] / len) * l.pull * q.fx.scale * dt
    }
    if (l.g) v[1] -= l.g * q.fx.scale * dt
    const k = l.pace ? (reached(l.pace, q.age)?.[1] ?? 1) : 1
    for (let i = 0; i < 3; i++) p[i] += v[i] * dt * k
    const floor = q.fx.floor
    if (floor !== undefined && p[1] < floor) {
      p[1] = floor
      if (v[1] < 0) v[1] = 0
    }
    q.rot += q.spin * dt
    q.age += dt
  }

  // A unit direction for a particle of this layer, off `die`.
  const aim = (fx: Live, l: Emitter): V3 => {
    const u = fx.die(), w = fx.die()
    const d = l.dir ?? fx.dir
    if (l.spread === undefined) {
      const y = 2 * u - 1, r = Math.sqrt(1 - y * y), a = 2 * Math.PI * w
      return [r * Math.cos(a), y, r * Math.sin(a)]
    }
    if (!d) throw new Error(`a particle3d layer of ${fx.name} has a spread and no dir, and neither has its spawn`)
    const z = unit(d)
    // Two unit vectors square to z and to each other.
    const x = unit(cross(Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], z))
    const y = cross(z, x)
    const cos = 1 - u * (1 - Math.cos(l.spread)), sin = Math.sqrt(1 - cos * cos), a = 2 * Math.PI * w
    return [0, 1, 2].map(i => z[i] * cos + (x[i] * Math.cos(a) + y[i] * Math.sin(a)) * sin) as V3
  }

  // One burst of a layer, thrown at `t` seconds into the effect and aged to the effect's age now.
  const burst = (fx: Live, l: Emitter, t: number, dt: number, cap: number) => {
    const at = point(fx)
    const n = Math.round(lerp(l.n, fx.die(), 1))
    for (let i = 0; i < n; i++) {
      const dir = aim(fx, l)
      const speed = lerp(l.speed, fx.die(), 0) * fx.scale
      const life = lerp(l.life, fx.die(), 0)
      const skip = (l.skip ?? 0) * fx.die()
      const size = lerp(l.size, fx.die(), 1) * fx.scale
      const j = l.jitter ?? [0, 0, 0]
      const p: V3 = [0, 1, 2].map(k => at[k] + (fx.die() - fx.die()) * j[k] * fx.scale) as V3
      const spin = l.spin ? (fx.die() * 2 - 1) * l.spin : 0
      const rot = l.spin ? fx.die() * 2 * Math.PI : 0
      if (l.box) for (let k = 0; k < 3; k++) p[k] += (l.box[k] + (l.box[k + 3] - l.box[k]) * fx.die()) * fx.scale
      if (parts.length >= cap) continue
      const q: Part = {
        fx, layer: l, p, v: [dir[0] * speed, dir[1] * speed, dir[2] * speed], o: [at[0], at[1], at[2]],
        age: skip, life, lasts: l.lasts ? t - skip : undefined, s0: size, s1: size * (l.grow ?? 1), rot, spin,
      }
      for (let left = fx.age - t; left > 1e-9 && alive(q); left -= dt) move(q, Math.min(dt, left))
      if (!alive(q)) continue
      parts.push(q)
      fx.parts++
    }
  }

  // Fires every burst of the effect due at its age now, in time order and layer order, which is
  // the order every page rolls them in.
  const fire = (fx: Live, dt: number, cap: number) => {
    const due: [number, number][] = []
    fx.layers!.forEach((l, i) => {
      for (;;) {
        const k = fx.bursts[i]
        const t = (l.after ?? 0) + k * (l.every ?? 0)
        if (k > 0 && (!l.every || t >= fx.life)) break
        if (t > fx.age + 1e-9) break
        due.push([t, i])
        fx.bursts[i]++
      }
    })
    due.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (const [t, i] of due) burst(fx, fx.layers![i], t, dt, cap)
  }

  // The effects file written again: a running effect's layers are read again from it, each of its
  // particles following its layer's new numbers from then on, and a layer it did not have before
  // firing the bursts it would have fired by now, as a page that first sees the effect late does.
  const relayer = (fx: Live) => {
    const next = flatten(file!.effects, fx.name)
    for (const q of parts) if (q.fx === fx) q.layer = next[fx.layers!.indexOf(q.layer)] ?? q.layer
    fx.bursts = next.map((_, i) => fx.bursts[i] ?? 0)
    fx.layers = next
  }

  // Whether a layer has another burst to come: its first, or one more `every` before the effect's
  // life is over.
  const more = (fx: Live) => fx.layers!.some((l, i) => fx.bursts[i] === 0 || (!!l.every && (l.after ?? 0) + fx.bursts[i] * l.every < fx.life))

  // A mesh's material: `map`, a page of a sheet, or none for flat squares.
  const material = (plugins: Plugins, map: any, add: boolean) => {
    const { THREE } = plugins.render3d
    return new THREE.MeshBasicMaterial({
      map, vertexColors: true, transparent: true, depthWrite: false, alphaTest: file!.alphaTest ?? 0,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
  }

  // The mesh of a page of a sheet and a blend, with room for `count` quads. Its material is made
  // again when the page or the file's `alphaTest` it was made with is no longer the one there is: a
  // sheet or the effects file written again.
  const group = (plugins: Plugins, key: string, sheet: string | undefined, page: number, add: boolean, count: number): Group => {
    const { THREE, scene } = plugins.render3d
    const map = sheet ? plugins.loader.get(sheet).pages[page] : null
    let g = groups.get(key)
    if (!g) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material(plugins, map, add))
      mesh.frustumCulled = false
      scene.add(mesh)
      groups.set(key, (g = { mesh, capacity: 0 }))
    }
    if (g.mesh.material.map !== map || g.mesh.material.alphaTest !== (file!.alphaTest ?? 0)) {
      g.mesh.material.dispose()
      g.mesh.material = material(plugins, map, add)
    }
    if (count > g.capacity) {
      const capacity = Math.max(count, g.capacity * 2, 16)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 12), 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(capacity * 8), 2))
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 16), 4))
      const index = new Uint32Array(capacity * 6)
      for (let i = 0; i < capacity; i++) index.set([4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3], 6 * i)
      geometry.setIndex(new THREE.BufferAttribute(index, 1))
      g.mesh.geometry.dispose()
      g.mesh.geometry = geometry
      g.capacity = capacity
    }
    return g
  }

  const ppm = () => {
    if (!file!.ppm) throw new Error('particle3d draws an effect from a sheet, and its effects file gives no ppm')
    return file!.ppm
  }

  // The light a lit particle carries, at its place, of its colour and opacity this frame.
  const shine = (plugins: Plugins, q: Part, at: number[], colour: any, a: number) => {
    const L = q.layer.light!
    let light = lit.get(q)
    if (!light) {
      light = spare.pop()
      if (!light) {
        light = new plugins.render3d.THREE.PointLight()
        plugins.render3d.scene.add(light)
      }
      lit.set(q, light)
    }
    light.visible = true
    light.position.set(at[0], at[1], at[2])
    light.color.copy(colour)
    light.intensity = L.intensity * a
    light.distance = L.distance * q.fx.scale
    light.decay = L.decay
  }

  // Writes every particle of each mesh into its buffers, as quads facing the camera, and puts each lit
  // particle's light on it; a light whose particle is gone, or not drawn this frame, is hidden and
  // kept for the next.
  const draw = (plugins: Plugins) => {
    const shone = new Set<Part>()
    quadsOf(plugins, shone)
    for (const [q, light] of lit) {
      if (shone.has(q)) continue
      light.visible = false
      lit.delete(q)
      spare.push(light)
    }
  }

  const quadsOf = (plugins: Plugins, shone: Set<Part>) => {
    for (const g of groups.values()) g.mesh.geometry.setDrawRange(0, 0)
    if (!parts.length) return
    const { THREE, camera } = plugins.render3d
    // A colour in the file is sRGB, as a three.js material's is; the buffer's are linear.
    const colour = new THREE.Color()
    if (!camera) throw new Error('particle3d has particles to draw and render3d has no camera')
    camera.updateMatrixWorld()
    const e = camera.matrixWorld.elements
    const R = unit([e[0], e[1], e[2]]), U = unit([e[4], e[5], e[6]]), B = unit([e[8], e[9], e[10]])
    // Each particle's frame now, and the mesh of its page and its blend; a particle whose sheet the
    // loader has not handed over yet draws nothing.
    const byKey = new Map<string, { sheet?: string; page: number; add: boolean; list: { q: Part; f?: Frame; uv?: number[] }[] }>()
    for (const q of parts) {
      if (!alive(q)) continue
      const l = q.layer, k = q.age / span(q)
      let f: Frame | undefined, uv: number[] | undefined
      if (l.sheet) {
        const sheet = plugins.loader.get(l.sheet)
        if (!sheet) {
          plugins.loader.load(l.sheet)
          continue
        }
        const run = sheet.data.clips[l.clip!]?.runs[0]
        if (!run) throw new Error(`particle3d draws clip ${l.clip} of ${l.sheet}, which it does not have`)
        const i = l.play ? play(sheet.data, l.clip!, 0, 0, q.age + 1e-9)[0] : Math.min(run.length - 1, Math.floor(k * run.length))
        f = sheet.frameOf(l.clip, 0, i)
        uv = sheet.uv(f!.id)
      }
      const key = JSON.stringify([l.sheet ?? null, f?.page ?? 0, !!l.add])
      let it = byKey.get(key)
      if (!it) byKey.set(key, (it = { sheet: l.sheet, page: f?.page ?? 0, add: !!l.add, list: [] }))
      it.list.push({ q, f, uv })
    }
    for (const [key, { sheet, page, add, list }] of byKey) {
      const g = group(plugins, key, sheet, page, add, list.length)
      const geometry = g.mesh.geometry
      const pos = geometry.attributes.position.array, uv = geometry.attributes.uv.array, col = geometry.attributes.color.array
      list.forEach(({ q, f, uv: box }, n) => {
        const l = q.layer, k = q.age / span(q)
        const size = q.s0 + (q.s1 - q.s0) * k
        let w = (f ? f.size[0] / ppm() : 1) * size
        const h = (f ? f.size[1] / ppm() : 1) * size
        // Where the quad's place is, and its right and up.
        let at: number[] = q.p, r: number[], u: number[]
        let [ox, oy] = l.origin ?? (l.stretch ? [1, 0.5] : f ? [f.anchor[0] / f.size[0], f.anchor[1] / f.size[1]] : [0.5, 0.5])
        if (l.follow) at = [0, 1, 2].map(i => q.p[i] + point(q.fx)[i] - q.o[i])
        if (l.beam) {
          if (!q.fx.to) throw new Error(`particle3d effect ${q.fx.name} has a beam and was spawned with no to`)
          const from = point(q.fx), gap = [0, 1, 2].map(i => q.fx.to![i] - from[i])
          w = Math.hypot(gap[0], gap[1], gap[2])
          at = from
          r = w ? unit(gap) : R
          const side = cross(B, r)
          u = Math.hypot(...side) > 1e-9 ? unit(side) : U
          ;[ox, oy] = [0, 0.5]
        } else {
          let turn = q.rot
          const along = l.stretch ? q.v : l.face ? (l.dir ?? q.fx.dir) : undefined
          if (along) {
            const x = along[0] * R[0] + along[1] * R[1] + along[2] * R[2], y = along[0] * U[0] + along[1] * U[1] + along[2] * U[2]
            if (x || y) turn = Math.atan2(y, x)
          }
          const cos = Math.cos(turn), sin = Math.sin(turn)
          r = [0, 1, 2].map(i => cos * R[i] + sin * U[i])
          u = [0, 1, 2].map(i => -sin * R[i] + cos * U[i])
        }
        // The quad spans the pixels the sheet kept, where they were in the whole frame, mirrored
        // across or upside down in the frame's own place.
        const flip = reached(l.flips, q.age)
        const fx = !!flip?.[1], fy = !!flip?.[2]
        let [tx, ty, tw, th] = f ? [f.trim[0] / f.size[0], f.trim[1] / f.size[1], f.trim[2] / f.size[0], f.trim[3] / f.size[1]] : [0, 0, 1, 1]
        if (fx) tx = 1 - tx - tw
        if (fy) ty = 1 - ty - th
        const left = (tx - ox) * w, right = (tx + tw - ox) * w, bottom = (oy - ty - th) * h, top = (oy - ty) * h
        const corners = [[left, bottom], [right, bottom], [right, top], [left, top]]
        corners.forEach(([x, y], v) => {
          for (let i = 0; i < 3; i++) pos[12 * n + 3 * v + i] = at[i] + x * r[i] + y * u[i]
        })
        // The picture's corners, top left, top right, bottom left, bottom right, onto the quad's
        // bottom left, bottom right, top right and top left, swapped side for side or top for bottom
        // when it is flipped.
        const c = box ?? [0, 1, 1, 1, 0, 0, 1, 0]
        const corner = (right: boolean, top: boolean) => {
          const i = 2 * ((top !== fy ? 0 : 2) + (right !== fx ? 1 : 0))
          return [c[i], c[i + 1]]
        }
        uv.set([...corner(false, false), ...corner(true, false), ...corner(true, true), ...corner(false, true)], 8 * n)
        const from = l.tint ?? q.fx.tint ?? 0xffffff
        const rgb = l.tint1 === undefined ? from : mix(from, l.tint1, k)
        const fading = l.fade === undefined ? k : Math.max(0, 1 - (span(q) - q.age) / l.fade)
        const a = (l.a0 ?? 1) + ((l.a1 ?? 1) - (l.a0 ?? 1)) * fading
        colour.setHex(rgb)
        if (l.light) {
          shine(plugins, q, at, colour, a)
          shone.add(q)
        }
        colour.multiplyScalar(l.gain ?? 1)
        const rgba = [colour.r, colour.g, colour.b, a]
        for (let v = 0; v < 4; v++) col.set(rgba, 16 * n + 4 * v)
      })
      geometry.attributes.position.needsUpdate = geometry.attributes.uv.needsUpdate = geometry.attributes.color.needsUpdate = true
      geometry.setDrawRange(0, list.length * 6)
    }
  }

  // `world.particle3d`, once the order of the plugins has been checked and the loader asked for the file.
  const setup = (plugins: Plugins) => {
    const { scene } = plugins.wire
    const own = scene.world?.particle3d
    if (!own) throw new Error('the scene names particle3d but gives no world.particle3d')
    if (!checked) {
      checked = true
      const order = scene.plugins!
      if (order.indexOf('render3d') < order.indexOf('particle3d'))
        throw new Error('particle3d is listed after render3d, which would draw every particle before it is turned')
    }
    if (!asked) {
      if (!plugins.loader) throw new Error('particle3d reads its effects through loader, which this scene does not name')
      asked = true
      plugins.loader.on(own.effects, (it: Effects) => { file = it; unchecked = true })
      plugins.loader.onWritten(own.effects, () => { stale = unchecked = true })
    }
    return own
  }

  return {
    // A page's own effect, from this frame on, its rolls seeded with `seed` when it is given.
    emit(effect: string, at: number[], s: Spawn & { seed?: number } = {}): Effect {
      return spawn(effect, at, s, s.seed ?? Math.floor(Math.random() * 2 ** 32))
    },
    // Whether the effects file has an effect of this name; false until it has been read.
    has(effect: string): boolean { return !!file && effect in file.effects },
    // The ledger: every effect this page is running.
    get effects(): readonly Effect[] { return ledger },
    get count() { return parts.length },
    // Asks the loader for the effects file before the actors tick, so `has` answers them.
    tick(plugins: Plugins) { setup(plugins) },
    afterTick(plugins: Plugins) {
      const { scene } = plugins.wire
      const own = setup(plugins)
      const dt = scene.prefabs.engine?.dt
      if (!dt) throw new Error('scene has no engine prefab with dt')

      for (const q of parts) move(q, dt)
      parts = parts.filter(q => {
        if (alive(q)) return true
        q.fx.parts--
        return false
      })
      for (const fx of ledger) if (!fresh.has(fx)) fx.age += dt

      const row = plugins.wire.rows.find(r => r.kind === 'particle3d')
      const live: Entry[] = row?.data.live ?? []
      for (const e of live) {
        if (seen.has(e.id)) {
          const fx = ledger.find(f => f.server === e.id)
          if (fx) {
            fx.at = [...e.at]
            fx.dir = e.dir && [...e.dir]
            fx.to = e.to && [...e.to]
            if (e.from === undefined && fx.fly === undefined) {
              fx.from = undefined
              fx.life = e.life
            }
          }
          continue
        }
        seen.add(e.id)
        spawn(e.effect, e.at, e, e.id, e.id).age = e.age
      }
      for (const id of seen) {
        if (live.some(e => e.id === id)) continue
        seen.delete(id)
        // An entry from a row, gone from the ledger row before this page saw it end, ends here.
        const fx = ledger.find(f => f.server === id && f.from !== undefined)
        if (fx) end(fx)
      }
      fresh = new Set()
      for (const fx of ledger) {
        if (fx.from !== undefined) {
          const from = plugins.wire.rows.find(r => r.id === fx.from)
          if (!from) end(fx)
          else if (Array.isArray(from.data.pos)) fx.at = [...from.data.pos]
        }
        if (fx.fly !== undefined) fx.life = flight(fx.name, fx.at, fx.to, fx.fly)
      }

      if (!file) return
      if (unchecked) {
        unchecked = false
        check(file, own)
        const lights = Object.entries(file.effects).find(([, layers]) => layers.some(l => 'light' in l))
        if (lights && !scene.plugins!.includes('lights3d')) throw new Error(`particle3d effect ${lights[0]} gives its particles light, and the scene does not list lights3d to draw them`)
      }
      if (stale) {
        stale = false
        for (const fx of ledger) if (fx.layers) relayer(fx)
      }
      for (const fx of ledger) {
        if (!fx.layers) {
          fx.layers = flatten(file.effects, fx.name)
          fx.bursts = fx.layers.map(() => 0)
        }
        fire(fx, dt, file.cap)
        land(fx)
      }
      ledger = ledger.filter(fx => fx.parts > 0 || more(fx) || (!!fx.land && !fx.landed))
      draw(plugins)
    },
    close(plugins: Plugins) {
      for (const g of groups.values()) {
        plugins.render3d.scene.remove(g.mesh)
        g.mesh.geometry.dispose()
        g.mesh.material.dispose()
      }
      groups.clear()
      for (const light of [...lit.values(), ...spare]) {
        plugins.render3d.scene.remove(light)
        light.dispose()
      }
      lit.clear()
      spare.length = 0
      ledger = []
      parts = []
    },
  }
}
