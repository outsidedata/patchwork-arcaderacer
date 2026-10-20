// The server half of volley2d: bullets in a flat world, none of them a row. A rule fires a volley,
// one entry on the ledger row naming a pattern, where it was fired, which way and by whom; every
// bullet of it is then a closed-form function of the volley's age, so the server tests it against
// what it may hit and every page draws it (`volley2d.plugin.ts`) from the same few numbers, and a
// hundred bullets on the screen cost a packet the entries that fired them.
//
// The one row of this kind is the ledger. Its prefab is `next`, the id the next entry gets; `live`,
// the entries; and `frame`, the world point the frame's origin stands on. A field of the row that is
// none of the three throws, naming it, in its `before`. Bullets fly in the frame: a bullet's place
// in the world is the frame's point plus its place in the frame, so a rule that scrolls the view
// moves the frame with it (`move`) and every bullet in the air is carried along, as a shooter's
// bullets are carried with the screen. The fixed numbers are `world.volley2d`: `patterns`, the name
// in the scene's `loader` catalogue of the data file that holds every pattern; `bounds`, [left, top,
// right, bottom] in the frame, outside which a bullet is gone; and `layer`, the render2d layer the
// browser half draws a bullet on when its pattern names none.
//
// An angle is in radians from the world's x toward its y: in a world whose y grows down the screen,
// π/2 is straight down and a growing angle turns clockwise on the screen.
//
// The patterns file holds `patterns`, each a list of layers. A layer `{ "pattern": name }` stands for
// every layer of that pattern, fired from `at` [x, y] off the volley's point, turned by `dir`, and
// `after` seconds later, each 0 when left out, so patterns are built out of patterns. Every other
// layer is an emitter, in the world's units and seconds:
//
//   n        bullets a burst, 1 when left out, fanned evenly across `spread` radians about the aim,
//            or, with `ring`, evenly round the whole turn, the first on the aim.
//   bursts   how many bursts, 1 when left out, `every` seconds apart, the first `after` seconds into
//            the volley; each burst's aim turned `turn` radians more than the last's, so a volley of
//            many bursts that turn is a spiral.
//   offset   radians added to the volley's aim for this layer, so one layer can fire behind another.
//   from     [x, y] off the volley's point the layer's bullets start from, not turned by the aim.
//   speed    its speed at its start; `accel` added to it every second, held between `min` and
//            `max` once it reaches either; `curve` radians its heading turns every second.
//   life     the seconds a bullet flies before it is gone, however far it is from the bounds.
//   radius   how near a bullet's centre must come to what it may hit to hit it; `damage` what it
//            deals, 1 when left out.
//   sheet    the loader sheet a bullet is drawn from, and `clip` its clip, frame 0; with `orient`,
//            the frame is turned so its down lies along the bullet's heading; `layer` the render2d
//            layer it is drawn on, else `world.volley2d.layer`.
//
// Every bullet a volley can ever fire is numbered, layer by layer, burst by burst, bullet by bullet
// (`shots`), and the entry keeps the numbers of those that are `gone`, hit or out of the bounds, and
// of those that have `grazed` something. Each step, in `before`, every entry is aged, every bullet
// that has flown out of the bounds or past its life is gone, and an entry with every burst fired and
// every bullet gone leaves the row.
//
// `fire(w, pattern, at, dir, side)` adds an entry for a volley fired from the world point `at`
// toward `dir` by `side`, a name the game gives each side that shoots, and hands it back. `move(w,
// to)` sets the frame's point. `strike(w, side, targets)` hits what the bullets of `side` meet:
// each target a circle `{ id, pos, r }` in the world, with a `graze` radius for one that grazes; a
// bullet whose centre comes within `r` and its own radius of a target's centre is gone, and one
// within `graze` more that is not yet gone and has not grazed before grazes. It hands back every hit
// `{ id, damage, entry, k, pos }` and every graze `{ id, entry, k, pos }`, and the rule that asked
// does what a hit does. `clear(w, side)` takes every bullet of that side out of the air, handing back
// where each was: a bomb. `points(shots, entry, frame)` is every bullet of an entry in the air at its
// age, `{ k, pos, heading, shot }`, which the browser half draws and a playtester reads. `ahead` is a
// bullet's place a time after its entry's age, for a playtester that looks ahead.
import type { Kind, W } from '#engine/engine.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Emitter = {
  n?: number; spread?: number; ring?: boolean; bursts?: number; every?: number; after?: number; turn?: number
  offset?: number; from?: [number, number]; speed?: number; accel?: number; min?: number; max?: number; curve?: number
  life?: number; radius?: number; damage?: number; sheet?: string; clip?: string; orient?: boolean; layer?: string
}
export type Layer = Emitter | { pattern: string; at?: [number, number]; dir?: number; after?: number }
export type Patterns = { patterns: Record<string, Layer[]> }
// One bullet a volley fires: when, from where off the volley's point and at what angle off its aim,
// and how it flies.
export type Shot = {
  t0: number; from: [number, number]; angle: number; speed: number; accel: number; min: number; max: number
  curve: number; life: number; radius: number; damage: number; sheet?: string; clip?: string; orient: boolean; layer?: string
}
export type Entry = { id: number; pattern: string; side: string; at: [number, number]; dir: number; age: number; gone: number[]; grazed: number[] }
export type Point = { k: number; pos: [number, number]; heading: number; shot: Shot }
export type Target = { id: number; pos: number[]; r: number; graze?: number }
export type Hit = { id: number; damage: number; entry: number; k: number; pos: [number, number] }
export type Graze = { id: number; entry: number; k: number; pos: [number, number] }

const FIELDS = ['next', 'live', 'frame']

// Every bullet of a pattern, numbered, made once per name for each read of the file: a file the
// editor writes is refilled in place with a new `patterns`, so a new read is a new key.
const made = new WeakMap<object, Map<string, Shot[]>>()

export function shots(file: Patterns, name: string, seen: string[] = []): Shot[] {
  let byName = made.get(file.patterns)
  if (!byName) made.set(file.patterns, (byName = new Map()))
  const have = byName.get(name)
  if (have) return have
  if (seen.includes(name)) throw new Error(`volley2d pattern ${name} is built out of itself: ${[...seen, name].join(' > ')}`)
  const layers = file.patterns[name]
  if (!layers) throw new Error(`volley2d has no pattern ${name}`)
  const out: Shot[] = []
  for (const layer of layers) {
    if ('pattern' in layer) {
      const [ax, ay] = layer.at ?? [0, 0]
      for (const s of shots(file, layer.pattern, [...seen, name]))
        out.push({ ...s, t0: s.t0 + (layer.after ?? 0), from: [s.from[0] + ax, s.from[1] + ay], angle: s.angle + (layer.dir ?? 0) })
      continue
    }
    const n = layer.n ?? 1
    const spread = layer.spread ?? 0
    const fan = (i: number) => (layer.ring ? (2 * Math.PI * i) / n : n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0)
    for (let b = 0; b < (layer.bursts ?? 1); b++)
      for (let i = 0; i < n; i++)
        out.push({
          t0: (layer.after ?? 0) + b * (layer.every ?? 0),
          from: layer.from ?? [0, 0],
          angle: (layer.offset ?? 0) + b * (layer.turn ?? 0) + fan(i),
          speed: layer.speed ?? 0, accel: layer.accel ?? 0, min: layer.min ?? -Infinity, max: layer.max ?? Infinity,
          curve: layer.curve ?? 0, life: layer.life ?? Infinity, radius: layer.radius ?? 0, damage: layer.damage ?? 1,
          sheet: layer.sheet, clip: layer.clip, orient: layer.orient ?? false, layer: layer.layer,
        })
  }
  byName.set(name, out)
  return out
}

// How far a shot has gone along x and y, s seconds after its start, heading from θ.
function flown(shot: Shot, θ: number, s: number): [number, number, number] {
  const v0 = Math.min(shot.max, Math.max(shot.min, shot.speed))
  const a = shot.accel
  // The time its speed reaches the bound it is heading for, after which it holds.
  const bound = a > 0 ? shot.max : a < 0 ? shot.min : v0
  const t1 = a === 0 || !Number.isFinite(bound) ? Infinity : Math.max(0, (bound - v0) / a)
  const ω = shot.curve
  const leg = (c0: number, acc: number, u0: number, u1: number): [number, number] => {
    if (u1 <= u0) return [0, 0]
    if (ω === 0) {
      const d = c0 * (u1 - u0) + (acc * (u1 * u1 - u0 * u0)) / 2 - acc * u0 * (u1 - u0)
      return [d * math.cos(θ), d * math.sin(θ)]
    }
    // ∫ (c0 + acc (u - u0)) e^{i(θ + ωu)} du, as the antiderivative F(u1) − F(u0)
    const F = (u: number): [number, number] => {
      const c = c0 + acc * (u - u0), φ = θ + ω * u
      return [(c * math.sin(φ)) / ω + (acc * math.cos(φ)) / (ω * ω), (-c * math.cos(φ)) / ω + (acc * math.sin(φ)) / (ω * ω)]
    }
    const [x1, y1] = F(u1), [x0, y0] = F(u0)
    return [x1 - x0, y1 - y0]
  }
  const first = leg(v0, a, 0, Math.min(s, t1))
  const then = leg(v0 + a * t1, 0, t1, s)
  const speed = s <= t1 ? v0 + a * s : v0 + a * t1
  return [first[0] + then[0], first[1] + then[1], θ + ω * s + (speed < 0 ? Math.PI : 0)]
}

// Where bullet k of an entry is at age t, in the world, and which way it heads; undefined before it
// is fired and after its life.
export function ahead(shot: Shot, entry: Entry, frame: number[], t: number): { pos: [number, number]; heading: number } | undefined {
  const s = t - shot.t0
  if (s < 0 || s > shot.life) return undefined
  const [dx, dy, heading] = flown(shot, entry.dir + shot.angle, s)
  return { pos: [frame[0] + entry.at[0] + shot.from[0] + dx, frame[1] + entry.at[1] + shot.from[1] + dy], heading }
}

export function points(list: Shot[], entry: Entry, frame: number[]): Point[] {
  const gone = new Set(entry.gone)
  const out: Point[] = []
  list.forEach((shot, k) => {
    if (gone.has(k)) return
    const p = ahead(shot, entry, frame, entry.age)
    if (p) out.push({ k, pos: p.pos, heading: p.heading, shot })
  })
  return out
}

const ledgerOf = (w: W) => {
  const rows = w.all('volley2d')
  if (rows.length !== 1) throw new Error(`volley2d needs one ledger row, and the scene has ${rows.length}`)
  return rows[0].data
}

const fileOf = (w: W): Patterns => json(w, w.world.volley2d.patterns)

export const volley2d: Kind = {
  before(me, dt, w) {
    const d = me.data
    for (const k of Object.keys(d)) if (!FIELDS.includes(k)) throw new Error(`the volley2d prefab has ${k}, which volley2d does not know`)
    const file = fileOf(w)
    const [l, t, r, b] = w.world.volley2d.bounds as number[]
    d.live = (d.live as Entry[]).filter(e => {
      e.age += dt
      const list = shots(file, e.pattern)
      const gone = new Set(e.gone)
      list.forEach((shot, k) => {
        if (gone.has(k) || e.age < shot.t0) return
        const p = ahead(shot, e, [0, 0], e.age)
        if (!p || p.pos[0] < l || p.pos[0] > r || p.pos[1] < t || p.pos[1] > b) gone.add(k)
      })
      e.gone = [...gone].sort((x, y) => x - y)
      return e.gone.length < list.length
    })
  },
}

export function fire(w: W, pattern: string, at: number[], dir: number, side: string): Entry {
  const ledger = ledgerOf(w)
  shots(fileOf(w), pattern)
  const entry: Entry = { id: ledger.next++, pattern, side, at: [at[0] - ledger.frame[0], at[1] - ledger.frame[1]], dir, age: 0, gone: [], grazed: [] }
  ledger.live.push(entry)
  return entry
}

export function move(w: W, to: number[]) {
  ledgerOf(w).frame = [to[0], to[1]]
}

export function strike(w: W, side: string, targets: Target[]): { hits: Hit[]; grazes: Graze[] } {
  const ledger = ledgerOf(w), file = fileOf(w)
  const hits: Hit[] = [], grazes: Graze[] = []
  for (const e of ledger.live as Entry[]) {
    if (e.side !== side) continue
    for (const p of points(shots(file, e.pattern), e, ledger.frame)) {
      for (const t of targets) {
        const d = math.hypot(p.pos[0] - t.pos[0], p.pos[1] - t.pos[1])
        if (d <= t.r + p.shot.radius) {
          e.gone.push(p.k)
          hits.push({ id: t.id, damage: p.shot.damage, entry: e.id, k: p.k, pos: p.pos })
          break
        }
        if (t.graze !== undefined && d <= t.r + t.graze + p.shot.radius && !e.grazed.includes(p.k)) {
          e.grazed.push(p.k)
          grazes.push({ id: t.id, entry: e.id, k: p.k, pos: p.pos })
        }
      }
    }
    e.gone.sort((x, y) => x - y)
  }
  return { hits, grazes }
}

export function clear(w: W, side: string): [number, number][] {
  const ledger = ledgerOf(w), file = fileOf(w)
  const out: [number, number][] = []
  for (const e of ledger.live as Entry[]) {
    if (e.side !== side) continue
    for (const p of points(shots(file, e.pattern), e, ledger.frame)) {
      e.gone.push(p.k)
      out.push(p.pos)
    }
    e.gone.sort((x, y) => x - y)
  }
  return out
}
