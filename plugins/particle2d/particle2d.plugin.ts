// The browser half of particle2d: the page's ledger of live effects in render2d's world, each
// effect's particles, and their drawing. An effect is spawned at a point with a lifetime, and this
// plugin runs it from then until its last particle is gone; whoever spawned it does nothing more.
//
// Two things spawn one. A rule, through `emit` in `particle2d.sim.ts`: the entry is on the ledger
// row, and this half takes it the first frame it sees it, at the age it has on the row, and while
// the row still holds it follows the `at`, `dir`, `to` and `life` the rule may have written there.
// Anything in the page — an actor, a local actor, another plugin — through this half's `emit`,
// which hands the effect back: writing its `at`, `dir` or `to` moves it, writing its `life` stops it.
// Its rolls come from `seed` when the spawn gives one, so pages that emit one effect with one seed
// draw the same particles, and from `Math.random` when it gives none. `has(name)` says whether the
// effects file has an effect of that name, false until the file has been read; this half asks the
// loader for it in its `tick`, before any actor ticks, so an actor can ask.
//
// An effect's point, `at`, is a point of the world, [x, y] or [x, y, h] (`plugins/render2d`), and
// its particles are thrown from where render2d draws that point. From there every length, speed and
// pull is in the stage's pixels, as it looks on the screen: x grows to the right and y down, and a
// direction is a vector [x, y], so [0, -1] is straight up the screen.
//
// The effects are in a data file, the entry of the scene's `loader` catalogue that
// `world.particle2d.effects` names, which this half reads off the scene (the ledger row goes to every seat
// every step, so neither the file nor its name is on the row). It holds `cap`, the most
// particles this page draws at once, past which new ones are dropped; `layer`, the render2d layer
// an effect's particles are drawn on, unless its spawn names another (below); for effects drawn
// from sheets, `ppm`, pixels of a sheet per pixel of
// the stage; and `effects`, each a list of layers. A layer `{ "effect": name }` stands
// for every layer of that effect, so effects are built out of effects, and `{ "effect": name,
// "at": [x, y] }` for every layer of it thrown from x, y pixels off the point. Every other layer is
// an emitter, in the stage's pixels and seconds:
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
//            life, each its whole frame / `ppm` pixels, filtered as the sheet says; with `play`
//            they play at the sheet's own times for them from its birth instead, round again or
//            held on the last as the clip says. Without one a particle is a flat square one pixel
//            on a side.
//   size     [min, max] times that, 1 when left out; `grow` times the size at birth is its size at death.
//   dir      the direction it is thrown along, else the spawn's `dir`; `spread` the most radians off
//            it either way; no `spread` throws it any way at all. `speed` [min, max] pixels a second.
//   jitter   [x, y] pixels a particle starts off the point, per axis, the difference of two rolls.
//   box      [left, top, right, bottom] pixels off the point: a particle starts at a point rolled
//            evenly in it, so a box whose corners are one point starts every particle there.
//   g        pixels a second² down the stage (y growing), negative rising; `drag` the fraction of
//            its speed shed a second; `pull` pixels a second² toward the point it was thrown from,
//            negative away.
//   pace     [[seconds, k], ...] in order: from that many seconds into its life on, it goes k times
//            as far a step as its speed says, so one that slows in steps and stops is [[t, 0.5],
//            [t2, 0]]; 1 before the first.
//   follow   it keeps its place about the effect's point as the point moves, where without it a
//            particle is left where it was thrown.
//   flips    [[seconds, x, y], ...] in order: from that many seconds into its life on it is
//            mirrored across when x is 1 and upside down when y is 1, in its frame's own place, as
//            a sprite's tiles are flipped; neither before the first.
//   tint     its colour, else the spawn's, else white; `tint1` the colour it has cooled to at death,
//            each an sRGB number as a PixiJS tint is.
//   gain     times its colour's light, 1 when left out. The stage draws nothing brighter than
//            white, so here a gain above 1 brightens each of the colour's channels as far as white.
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
//   beam     drawn from the effect's point to its `to`, as long as the gap between them on the stage
//            and as thick as its frame at its size, turned along it, wherever the effect is moved:
//            a beam or a tracer that reaches its target. An effect with a beam is spawned with a `to`.
//
// A field the file has that is none of these throws, naming it, the first frame the file is read and
// the first frame after it is written; so does a `dir`, `jitter`, `box` or `at` of the wrong count of
// numbers, a layer with both a `life` and `lasts` or neither, and a field of `world.particle2d` that is
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
//   floor    the height its particles come to rest at: none goes further down the stage than the
//            point `floor` above the ground under the effect's point is drawn, so `floor` 0 is the
//            ground itself.
//   from     the id of the row the effect comes from: while this page's rows hold that row, the
//            effect goes on whatever its `life`, its point that row's `pos` when the row has one;
//            the frame they no longer do, its life is over. A smoulder on a wreck for as long as it
//            lies, a trail on a comet, a glow on an item on the floor.
//   fly      how fast its point is carried from `at` to `to`, in the world's units a second; its
//            `life` is the time that takes.
//   land     effects thrown at its `to`, or at its point when it has none, the frame its life is
//            over: each `{ "effect": name }` and the spawn it is thrown with. Where a round lands,
//            what a wreck leaves when it goes. Each rolls from its `seed`, else from a roll of the
//            effect it lands from, so every page that draws the one draws the same others. Each is
//            drawn on the layer the one it lands from is, unless its own spawn names another.
//   layer    the render2d layer its particles are drawn on, in place of the effects file's: air
//            that fills the canvas drawn over the world, say, where the file's effects stand in it.
//
// A particle drawn from a sheet of pixel art is drawn on whole pixels. A particle's rolls come from a
// generator seeded with the ledger entry's id, in the same order on every page, so every page draws
// the same particles; a page that first sees an entry late rolls the bursts it missed and ages their
// particles to now, as a page that saw it from the start has them.
//
// Every particle is a sprite, taken from a pool this plugin keeps and given back when it dies, in two
// containers on its effect's render2d layer: the ones drawn normally, then the ones that add their
// light over them. On a layer that does not sort, every effect drawn there shares the layer's two, so
// each is one batch per sheet. On one that sorts, each effect has two of its own, in a container
// drawn in the order of the depth of the effect's point, as render2d sorts a thing standing there:
// a burst behind a wall is drawn under the wall and one before it over it, however far up the
// screen its particles fly. Of an effect and a thing at one depth, the effect is drawn over, half a
// stage pixel of depth after it, more than sprite2d's ties and less than any two places apart: an
// impact on a monster over the monster. The effect's container follows its point, and goes when the
// effect does. That is done in `afterTick`, after every actor has ticked, and so this plugin is
// listed before `render2d`, whose `afterTick` draws; listed after it, every particle would be
// drawn a frame late, and that throws.
// A sheet the loader has not handed over yet draws nothing. Each frame moves every effect one step
// of the scene's `dt`. The effects file written by the editor (the loader's `onWritten`), the
// effects that draw on its `layer` move to its new one on the next frame, and every running effect
// reads its layers again, its particles too, so they draw as it now says. `close` frees every sprite,
// container and frame; the sheets are the loader's and stay.
import type { Plugins } from '#engine/browser.ts'
import { seeded, type Die } from '#engine/engine.ts'
import { play } from '#plugins/loader/loader.sim.ts'
import { flight, type Entry, type Land, type Spawn } from './particle2d.sim.ts'

type Range = [number, number]
type V2 = [number, number]
export type Emitter = {
  n?: Range; every?: number; after?: number; life?: Range; lasts?: boolean; skip?: number
  sheet?: string; clip?: string; play?: boolean
  size?: Range; grow?: number
  dir?: number[]; spread?: number; speed?: Range; jitter?: number[]; box?: number[]
  g?: number; drag?: number; pull?: number; pace?: number[][]; follow?: boolean
  tint?: number; tint1?: number; gain?: number; a0?: number; a1?: number; fade?: number
  spin?: number; origin?: [number, number]; add?: boolean; stretch?: boolean; face?: boolean; beam?: boolean; flips?: number[][]
}
export type Layer = Emitter | { effect: string; at?: number[] }
export type Effects = { cap: number; layer: string; ppm?: number; effects: Record<string, Layer[]> }

// Every field an emitter may have, in the order the header gives them; the fields of an `{ effect }`
// layer; the fields of the file; and the count of numbers each field that is a point or a box has.
export const FIELDS = [
  'n', 'every', 'after', 'life', 'lasts', 'skip', 'sheet', 'clip', 'play', 'size', 'grow', 'dir', 'spread', 'speed', 'jitter', 'box',
  'g', 'drag', 'pull', 'pace', 'follow', 'flips', 'tint', 'tint1', 'gain', 'a0', 'a1', 'fade', 'spin', 'origin', 'add', 'stretch', 'face', 'beam',
] as const satisfies readonly (keyof Emitter)[]
export const REF = ['effect', 'at'] as const
export const FILE = ['cap', 'layer', 'ppm', 'effects'] as const satisfies readonly (keyof Effects)[]
export const WORLD = ['effects', 'hold'] as const
const COUNTS: Record<string, number> = { dir: 2, jitter: 2, box: 4, at: 2 }

// What `emit` hands back. `at`, `dir`, `to` and `life` may be written; `age` is read.
export type Effect = { readonly name: string; at: number[]; dir?: number[]; to?: number[]; life: number; readonly age: number }

type Live = Effect & {
  age: number; tint?: number; scale: number; floor?: number; die: Die
  from?: number; fly?: number; land?: Land[]; landed: boolean
  layers?: Emitter[]; bursts: number[] // per layer, how many of its bursts have been fired
  parts: number; server?: number
  layer?: string // the render2d layer its spawn names, else the file's
  own?: Pair & { box: any } // its two containers, in one of its own, on a layer that sorts
}
// A layer's or an effect's two containers: the particles drawn normally, then those adding their light.
type Pair = { under: any; over: any }

// Of an effect and a thing at one depth on a sorted layer, how much further the effect is drawn.
const AFTER = 0.5
type Part = {
  fx: Live; layer: Emitter; p: V2; v: V2; o: V2; floor?: number
  age: number; life: number; lasts?: number; s0: number; s1: number; rot: number; spin: number; sprite?: any
}

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
// A colour times `gain`, each channel as far as white.
const brighten = (c: number, gain: number) => {
  if (gain === 1) return c
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * gain)) << s
  return ch(16) | ch(8) | ch(0)
}
const mix = (a: number, b: number, k: number) => {
  const c = (s: number) => {
    const x = (a >> s) & 255, y = (b >> s) & 255
    return Math.round(x + (y - x) * k) << s
  }
  return c(16) | c(8) | c(0)
}

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

// Throws for the first field of the file, of an effect's layer, or of `world.particle2d` that this plugin
// does not read, and for a point or a box of the wrong count of numbers.
export function check(file: Effects, own: Record<string, unknown>) {
  for (const k of Object.keys(own)) if (!(WORLD as readonly string[]).includes(k)) throw new Error(`world.particle2d has ${k}, which particle2d does not know`)
  for (const k of Object.keys(file)) if (!(FILE as readonly string[]).includes(k)) throw new Error(`particle2d's effects file has ${k}, which particle2d does not know`)
  for (const [name, layers] of Object.entries(file.effects)) {
    layers.forEach((l, i) => {
      const known: readonly string[] = 'effect' in l ? REF : FIELDS
      if (!('effect' in l) && !l.life === !l.lasts) throw new Error(`particle2d effect ${name} layer ${i} ${l.life ? 'has a life and lasts' : 'has no life and does not last'}, and it has one or the other`)
      for (const [k, v] of Object.entries(l)) {
        if (!known.includes(k)) throw new Error(`particle2d effect ${name} layer ${i} has ${k}, which particle2d does not know`)
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`particle2d effect ${name} layer ${i} has a ${k} of ${JSON.stringify(v)}, and particle2d reads ${COUNTS[k]} numbers`)
      }
    })
  }
}

// Every layer an effect stands for, its `{ effect }` layers opened out, in order, each thrown from
// its `at` off the point: its box moved by it, or a box of that one point for a layer with none.
function flatten(effects: Record<string, Layer[]>, name: string, path: string[] = []): Emitter[] {
  if (path.includes(name)) throw new Error(`particle2d effect ${name} is made of itself: ${[...path, name].join(' > ')}`)
  const layers = effects[name]
  if (!layers) throw new Error(path.length ? `particle2d effect ${path[path.length - 1]} names ${name}, which there is none of` : `particle2d has no effect ${name}`)
  return layers.flatMap(l => {
    if (!('effect' in l)) return [l]
    const inner = flatten(effects, l.effect, [...path, name])
    if (!l.at) return inner
    const [x, y] = l.at
    return inner.map(e => {
      const [x0, y0, x1, y1] = e.box ?? [0, 0, 0, 0]
      return { ...e, box: [x0 + x, y0 + y, x1 + x, y1 + y] }
    })
  })
}

export function particle2d() {
  let ledger: Live[] = []
  let fresh = new Set<Live>() // spawned since the last frame, so starting at the age it was given
  const seen = new Set<number>() // the server entries this page has taken
  let file: Effects | undefined
  let unchecked = true // the file has been read or written since it was last checked
  let asked = false
  let stale = false // the effects file has been written since the running effects read their layers
  let checked = false
  let parts: Part[] = []
  const shared = new Map<string, Pair>() // on each layer that does not sort, the two every effect there shares
  const pool: any[] = []

  const spawn = (name: string, at: number[], s: Spawn, seed: number, server?: number): Live => {
    const fx: Live = {
      name, at: [...at], dir: s.dir ? [...s.dir] : undefined, to: s.to ? [...s.to] : undefined, life: s.life ?? 0, age: 0,
      tint: s.tint, scale: s.scale ?? 1, floor: s.floor, die: seeded(seed), bursts: [], parts: 0, server,
      from: s.from, fly: s.fly, land: s.land && structuredClone(s.land), landed: false, layer: s.layer,
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
    for (const { effect, seed, ...s } of fx.land) fresh.delete(spawn(effect, at, { layer: fx.layer, ...s }, seed ?? Math.floor(fx.die() * 2 ** 32)))
  }

  // One step of a particle's motion.
  const move = (q: Part, dt: number) => {
    const { layer: l, p, v, o } = q
    if (l.drag) {
      const f = Math.max(0, 1 - l.drag * dt)
      v[0] *= f; v[1] *= f
    }
    if (l.pull) {
      const d = [o[0] - p[0], o[1] - p[1]]
      const len = Math.hypot(d[0], d[1])
      if (len > 0) for (let i = 0; i < 2; i++) v[i] += (d[i] / len) * l.pull * q.fx.scale * dt
    }
    if (l.g) v[1] += l.g * q.fx.scale * dt
    const k = l.pace ? (reached(l.pace, q.age)?.[1] ?? 1) : 1
    p[0] += v[0] * dt * k
    p[1] += v[1] * dt * k
    if (q.floor !== undefined && p[1] > q.floor) {
      p[1] = q.floor
      if (v[1] > 0) v[1] = 0
    }
    q.rot += q.spin * dt
    q.age += dt
  }

  // A unit direction for a particle of this layer, off `die`.
  const aim = (fx: Live, l: Emitter): V2 => {
    const u = fx.die()
    const d = l.dir ?? fx.dir
    if (l.spread === undefined) return [Math.cos(2 * Math.PI * u), Math.sin(2 * Math.PI * u)]
    if (!d) throw new Error(`a particle2d layer of ${fx.name} has a spread and no dir, and neither has its spawn`)
    const a = Math.atan2(d[1], d[0]) + (2 * u - 1) * l.spread
    return [Math.cos(a), Math.sin(a)]
  }

  // One burst of a layer, thrown at `t` seconds into the effect from where render2d draws its point,
  // and aged to the effect's age now.
  const burst = (plugins: Plugins, fx: Live, l: Emitter, t: number, dt: number, cap: number) => {
    const { place } = plugins.render2d
    const at = point(fx)
    const [ox, oy] = place(at)
    const floor = fx.floor === undefined ? undefined : place([at[0], at[1], fx.floor])[1]
    const n = Math.round(lerp(l.n, fx.die(), 1))
    for (let i = 0; i < n; i++) {
      const dir = aim(fx, l)
      const speed = lerp(l.speed, fx.die(), 0) * fx.scale
      const life = lerp(l.life, fx.die(), 0)
      const skip = (l.skip ?? 0) * fx.die()
      const size = lerp(l.size, fx.die(), 1) * fx.scale
      const j = l.jitter ?? [0, 0]
      const p: V2 = [ox + (fx.die() - fx.die()) * j[0] * fx.scale, oy + (fx.die() - fx.die()) * j[1] * fx.scale]
      const spin = l.spin ? (fx.die() * 2 - 1) * l.spin : 0
      const rot = l.spin ? fx.die() * 2 * Math.PI : 0
      if (l.box) {
        const [x0, y0, x1, y1] = l.box
        p[0] += (x0 + (x1 - x0) * fx.die()) * fx.scale
        p[1] += (y0 + (y1 - y0) * fx.die()) * fx.scale
      }
      if (parts.length >= cap) continue
      const q: Part = {
        fx, layer: l, p, v: [dir[0] * speed, dir[1] * speed], o: [ox, oy], floor,
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
  const fire = (plugins: Plugins, fx: Live, dt: number, cap: number) => {
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
    for (const [t, i] of due) burst(plugins, fx, fx.layers![i], t, dt, cap)
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

  const ppm = () => {
    if (!file!.ppm) throw new Error('particle2d draws an effect from a sheet, and its effects file gives no ppm')
    return file!.ppm
  }

  // The frame a layer's particle shows now, its texture and its size and anchor, or undefined while
  // the loader has not handed its sheet over; a flat square for a layer with none.
  const frame = (plugins: Plugins, q: Part) => {
    const { PIXI } = plugins.render2d
    const l = q.layer
    if (!l.sheet) return { texture: PIXI.Texture.WHITE, size: [1, 1], anchor: [0.5, 0.5], nearest: false }
    const sheet = plugins.loader.get(l.sheet)
    if (!sheet) {
      plugins.loader.load(l.sheet)
      return undefined
    }
    const run = sheet.data.clips[l.clip!]?.runs[0]
    if (!run) throw new Error(`particle2d draws clip ${l.clip} of ${l.sheet}, which it does not have`)
    const i = l.play ? play(sheet.data, l.clip!, 0, 0, q.age + 1e-9)[0] : Math.min(run.length - 1, Math.floor((q.age / span(q)) * run.length))
    const f = sheet.frameOf(l.clip, 0, i)
    const [w, h] = f.size
    return { texture: sheet.texture(f.id), size: [w / ppm(), h / ppm()], anchor: [f.anchor[0] / w, f.anchor[1] / h], nearest: sheet.data.nearest }
  }

  const give = (q: Part) => {
    if (!q.sprite) return
    q.sprite.removeFromParent()
    pool.push(q.sprite)
    q.sprite = undefined
  }

  // An effect's own containers gone, what is left in them given back first.
  const unbox = (fx: Live) => {
    if (!fx.own) return
    for (const q of parts) if (q.fx === fx) give(q)
    fx.own.box.destroy({ children: true })
    fx.own = undefined
  }

  // The two containers an effect's particles go in this frame: on a layer that sorts, its own, at
  // the depth of its point; on any other, the layer's, which every effect drawn there shares.
  const pairOf = (plugins: Plugins, fx: Live): Pair => {
    const { PIXI, layer, depth } = plugins.render2d
    const name = fx.layer ?? file!.layer, on = layer(name)
    if (on.sortableChildren) {
      if (!fx.own) {
        const own = { box: new PIXI.Container(), under: new PIXI.Container(), over: new PIXI.Container() }
        own.box.addChild(own.under, own.over)
        fx.own = own
      }
      if (fx.own.box.parent !== on) on.addChild(fx.own.box)
      fx.own.box.zIndex = depth(point(fx)) + AFTER
      return fx.own
    }
    unbox(fx)
    let pair = shared.get(name)
    if (!pair) shared.set(name, (pair = { under: new PIXI.Container(), over: new PIXI.Container() }))
    if (pair.under.parent !== on) on.addChild(pair.under, pair.over)
    return pair
  }

  // Puts every particle's sprite where the particle is, as it looks at its age now.
  const draw = (plugins: Plugins) => {
    const { PIXI } = plugins.render2d
    const pairs = new Map<Live, Pair>()
    for (const q of parts) if (!pairs.has(q.fx)) pairs.set(q.fx, pairOf(plugins, q.fx))
    for (const q of parts) {
      const l = q.layer, k = q.age / span(q)
      const f = !alive(q) ? undefined : frame(plugins, q)
      if (!f) {
        give(q)
        continue
      }
      q.sprite ??= pool.pop() ?? new PIXI.Sprite()
      const pair = pairs.get(q.fx)!, into = l.add ? pair.over : pair.under
      if (q.sprite.parent !== into) into.addChild(q.sprite)
      const s = q.sprite
      const size = q.s0 + (q.s1 - q.s0) * k
      s.texture = f.texture
      s.blendMode = l.add ? 'add' : 'normal'
      const flip = reached(l.flips, q.age)
      const [ax, ay] = l.origin ?? (l.stretch ? [1, 0.5] : f.anchor)
      s.anchor.set(flip?.[1] ? 1 - ax : ax, flip?.[2] ? 1 - ay : ay)
      let [x, y] = q.p
      if (l.follow) {
        const [nx, ny] = plugins.render2d.place(point(q.fx))
        x += nx - q.o[0]
        y += ny - q.o[1]
      }
      s.position.set(f.nearest ? Math.round(x) : x, f.nearest ? Math.round(y) : y)
      s.roundPixels = f.nearest
      s.width = f.size[0] * size
      s.height = f.size[1] * size
      s.scale.set(Math.abs(s.scale.x) * (flip?.[1] ? -1 : 1), Math.abs(s.scale.y) * (flip?.[2] ? -1 : 1))
      let turn = q.rot
      const along = l.stretch ? q.v : l.face ? (l.dir ?? q.fx.dir) : undefined
      if (along && (along[0] || along[1])) turn = Math.atan2(along[1], along[0])
      if (l.beam) {
        if (!q.fx.to) throw new Error(`particle2d effect ${q.fx.name} has a beam and was spawned with no to`)
        const [x0, y0] = plugins.render2d.place(point(q.fx)), [x1, y1] = plugins.render2d.place(q.fx.to)
        s.anchor.set(0, 0.5)
        s.position.set(x0, y0)
        s.width = Math.hypot(x1 - x0, y1 - y0)
        turn = Math.atan2(y1 - y0, x1 - x0)
      }
      s.rotation = turn
      const from = l.tint ?? q.fx.tint ?? 0xffffff
      s.tint = brighten(l.tint1 === undefined ? from : mix(from, l.tint1, k), l.gain ?? 1)
      const fading = l.fade === undefined ? k : Math.max(0, 1 - (span(q) - q.age) / l.fade)
      s.alpha = (l.a0 ?? 1) + ((l.a1 ?? 1) - (l.a0 ?? 1)) * fading
    }
    // A layer's shared two, once no effect draws there, off it.
    const using = new Set(pairs.values())
    for (const [name, pair] of shared) if (!using.has(pair)) {
      pair.under.destroy()
      pair.over.destroy()
      shared.delete(name)
    }
  }

  // `world.particle2d`, once the order of the plugins has been checked and the loader asked for the file.
  const setup = (plugins: Plugins) => {
    const { scene } = plugins.wire
    const own = scene.world?.particle2d
    if (!own) throw new Error('the scene names particle2d but gives no world.particle2d')
    if (!checked) {
      checked = true
      const order = scene.plugins!
      if (order.indexOf('render2d') < order.indexOf('particle2d'))
        throw new Error('particle2d is listed after render2d, which would draw every particle a frame late')
    }
    if (!asked) {
      if (!plugins.loader) throw new Error('particle2d reads its effects through loader, which this scene does not name')
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
        give(q)
        return false
      })
      for (const fx of ledger) if (!fresh.has(fx)) fx.age += dt

      const row = plugins.wire.rows.find(r => r.kind === 'particle2d')
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
        fire(plugins, fx, dt, file.cap)
        land(fx)
      }
      const going = ledger.filter(fx => !(fx.parts > 0 || more(fx) || (!!fx.land && !fx.landed)))
      for (const fx of going) unbox(fx)
      ledger = ledger.filter(fx => !going.includes(fx))
      draw(plugins)
    },
    close() {
      for (const q of parts) give(q)
      for (const fx of ledger) unbox(fx)
      for (const s of pool) s.destroy()
      for (const { under, over } of shared.values()) { under.destroy(); over.destroy() }
      pool.length = 0
      shared.clear()
      ledger = []
      parts = []
    },
  }
}
