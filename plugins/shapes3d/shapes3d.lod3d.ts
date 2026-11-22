// shapes3d's mod for lod3d (`addons/scenemanager`'s mods): every shape and every point of shapes3d's as
// surfaces lod3d's layers stand on, under shapes3d's own words.
//
// `world.lod3d.mods`: `surfaces: ['shapes3d']` (`surfaces(w)`, read once a truth and again after a `move`),
// `seen: ['shapes3d']` (`seen(plugins)`, the
// same off this page's rows, its `version` moving when one moves, and `worker`, this module, which lod3d's
// workers load and hold nothing for), `behaviors: ['shapes3d']`.
//
// Each shape is one surface for each of its parts, named by its kind, `{ <word>: { …its shape, part } }`:
//   box         `top`, `bottom`, `+x`, `-x`, `+z`, `-z`, each facing out
//   cylinder    `wall` (u metres round it, v up it), `top`, `bottom`
//   plane       `face`, up its slope;  hyperplane  `face`, facing its own up
// and each point of a kind's `points` (`shapes3d.motion3d.ts`), every row's, named `<kind>.<point>`, in the
// world as motion3d's `spaces` places it, facing its `normal` turned with its row, or up:
//   point  one place;  line, spline  u metres along it (a spline as shapes3d draws it, `drawn`);
//   plane  its face
// A layer keeps to some parts with a rule on `up`: tops above 0.7, walls between ±0.3.
import { Euler, Vector3 } from 'three'
import type { Row, W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Box, Seen, Spot, Surface } from '#plugins/lod3d/lod3d.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { moves, rotate, shapes, type Kind } from './shapes3d.sim.ts'
import { drawn } from './shapes3d.kinematics3d.ts'

type V = number[]
// A part: its (u, v) rect, the spot at each (u, v), and the box [x0, y0, z0, x1, y1, z1] round it.
type Part = { rect: number[]; at(u: number, v: number): Spot | undefined; box: number[] }

const UP = [0, 1, 0]
const add = (a: V, b: V, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
const unitOf = (a: V) => { const l = math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l] }
const boxOf = (pts: V[], pad: number) => [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])) - pad).concat([0, 1, 2].map(k => Math.max(...pts.map(p => p[k])) + pad))

function flat(mid: V, U: V, Vv: V, a: number, b: number, normal: V): Part {
  const at = (u: number, v: number) => (u < 0 || v < 0 || u > a || v > b ? undefined : { p: add(add(mid, U, u - a / 2), Vv, v - b / 2), normal })
  return { rect: [0, 0, a, b], at, box: boxOf([at(0, 0)!.p, at(a, 0)!.p, at(0, b)!.p, at(a, b)!.p], 0) }
}
function disc(mid: V, r: number, normal: V): Part {
  return { rect: [0, 0, 2 * r, 2 * r], at: (u, v) => (math.hypot(u - r, v - r) > r ? undefined : { p: [mid[0] + u - r, mid[1], mid[2] + v - r], normal }), box: boxOf([add(mid, [-r, 0, -r]), add(mid, [r, 0, r])], 0) }
}
function curve(pts: V[], normal: V): Part {
  const at = [0]
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]))
  const len = at[at.length - 1]
  return {
    rect: [0, 0, len, 0],
    at(u) {
      if (u < 0 || u > len) return undefined
      let i = 0
      while (i < pts.length - 2 && at[i + 1] < u) i++
      const d = at[i + 1] - at[i], f = d > 0 ? (u - at[i]) / d : 0
      return { p: [0, 1, 2].map(k => pts[i][k] + (pts[i + 1][k] - pts[i][k]) * f), normal }
    },
    box: boxOf(pts, 0),
  }
}

function partOf(word: string, d: any): Part {
  if (word === 'box') {
    const c = math.cos(d.yaw), n = math.sin(d.yaw), X = [c, 0, -n], Z = [n, 0, c], [sx, sy, sz] = d.size, mid = add(d.pos, UP, sy / 2), neg = (a: V) => a.map(v => -v)
    switch (d.part) {
      case 'top': return flat(add(d.pos, UP, sy), X, Z, sx, sz, UP)
      case 'bottom': return flat(d.pos, X, Z, sx, sz, [0, -1, 0])
      case '+x': return flat(add(mid, X, sx / 2), Z, UP, sz, sy, X)
      case '-x': return flat(add(mid, X, -sx / 2), Z, UP, sz, sy, neg(X))
      case '+z': return flat(add(mid, Z, sz / 2), X, UP, sx, sy, Z)
      default: return flat(add(mid, Z, -sz / 2), X, UP, sx, sy, neg(Z))
    }
  }
  if (word === 'cylinder') {
    const r = d.radius
    if (d.part === 'top') return disc(add(d.pos, UP, d.height), r, UP)
    if (d.part === 'bottom') return disc(d.pos, r, [0, -1, 0])
    return {
      rect: [0, 0, 2 * Math.PI * r, d.height],
      at: (u, v) => { if (u < 0 || v < 0 || v > d.height) return undefined; const th = u / r, a = math.sin(th), b = math.cos(th); return { p: [d.pos[0] + r * a, d.pos[1] + v, d.pos[2] + r * b], normal: [a, 0, b] } },
      box: boxOf([add(d.pos, [-r, 0, -r]), add(d.pos, [r, d.height, r])], 0),
    }
  }
  if (word === 'plane') {
    if (d.at) return flat(d.at, d.u, d.v, d.size[0], d.size[1], d.normal ?? unitOf([d.v[1] * d.u[2] - d.v[2] * d.u[1], d.v[2] * d.u[0] - d.v[0] * d.u[2], d.v[0] * d.u[1] - d.v[1] * d.u[0]]))
    const c = math.cos(d.yaw), n = math.sin(d.yaw), t = math.atan(d.slope), ct = math.cos(t), st = math.sin(t), Z = [n, 0, c]
    return flat(d.pos, [c, 0, -n], [Z[0] * ct, st, Z[2] * ct], d.size[0], d.size[1] / ct, [-Z[0] * st, ct, -Z[2] * st])
  }
  if (word === 'hyperplane') return flat(d.pos, rotate(d.rot, [1, 0, 0]), rotate(d.rot, [0, 0, 1]), d.size[0], d.size[1], rotate(d.rot, UP))
  if (word === 'point') return { rect: [0, 0, 0, 0], at: () => ({ p: d.at, normal: d.normal ?? UP }), box: boxOf([d.at], 0) }
  if (word === 'line') return curve([d.from, d.to], d.normal ?? UP)
  return curve(drawn({ points: d.points }).pts, d.normal ?? UP)
}

// Each surface's part, made once for each surface object a mod hands.
const parts = new WeakMap<object, Part>()
const meets = (b: number[], box: Box) => [0, 1, 2].every(k => b[k + 3] >= box.min[k] && b[k] <= box.max[k])

function word(name: string): Behavior {
  const part = (d: object) => parts.get(d) ?? (parts.set(d, partOf(name, d)), parts.get(d)!)
  return {
    span: (d, box) => (meets(part(d).box, box) ? part(d).rect : undefined),
    spot: (d, u, v) => part(d).at(u, v),
  }
}

export const behaviors = (): Record<string, Behavior> =>
  Object.fromEntries(['box', 'cylinder', 'plane', 'hyperplane', 'point', 'line', 'spline'].map(w => [w, word(w)]))

const toWorld = (row: Row, p: V) => {
  const yaw = row.data.yaw ?? 0, c = math.cos(yaw), s = math.sin(yaw), [x, y, z] = row.data.pos
  return [x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c]
}
const dirToWorld = (row: Row, d: V) => {
  const yaw = row.data.yaw ?? 0, c = math.cos(yaw), s = math.sin(yaw)
  return unitOf([d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c])
}

function pointOf(kind: string, name: string, row: Row, p: Record<string, any>): Record<string, unknown> {
  const [w] = Object.keys(p)
  const n = p[w]
  const normal = n.normal ? { normal: dirToWorld(row, n.normal) } : {}
  if (w === 'point') return { point: { at: toWorld(row, n.at), ...normal } }
  if (w === 'line') return { line: { from: toWorld(row, n.from), to: toWorld(row, n.to), ...normal } }
  if (w === 'spline') return { spline: { points: n.points.map((q: V) => toWorld(row, q)), ...normal } }
  if (w === 'plane') {
    const [yaw, pitch, roll] = (n.turn ?? [0, 0, 0]).map((v: number) => (v * Math.PI) / 180)
    const e = new Euler(pitch, (row.data.yaw ?? 0) + yaw, roll, 'YXZ')
    const u = new Vector3(1, 0, 0).applyEuler(e), v = new Vector3(0, 0, 1).applyEuler(e)
    return { plane: { at: toWorld(row, n.at), u: [u.x, u.y, u.z], v: [v.x, v.y, v.z], size: n.size, ...normal } }
  }
  throw new Error(`shapes3d kind ${kind}'s point ${name} is a ${w}, which is none of point, line, spline, plane`)
}

const PARTS: Record<string, string[]> = { box: ['top', 'bottom', '+x', '-x', '+z', '-z'], cylinder: ['wall', 'top', 'bottom'], plane: ['face'], hyperplane: ['face'] }

// A truth's surfaces, read once and again only after a `move`, as the walker mod reads its shapes, so
// lod3d is handed the same list while they stand.
const kept = new WeakMap<object, { moves: number; surfaces: Surface[] }>()

export function surfaces(w: W): Surface[] {
  const k = kept.get(w.world)
  if (k && k.moves === moves(w)) return k.surfaces
  const out = read(w)
  kept.set(w.world, { moves: moves(w), surfaces: out })
  return out
}

function read(w: W): Surface[] {
  const out: Surface[] = []
  for (const p of shapes(w)) for (const part of PARTS[p.word]) out.push({ name: p.kind, id: `${p.kind}#${p.id}.${part}`, shape: { [p.word]: { ...p.shape[p.word], part } } })
  for (const [kind, k] of Object.entries((w.world.shapes3d?.kinds ?? {}) as Record<string, Kind>)) {
    for (const row of w.all(kind)) for (const [name, p] of Object.entries(k.points ?? {})) out.push({ name: `${kind}.${name}`, id: `${kind}#${row.id}.${name}`, shape: pointOf(kind, name, row, p) })
  }
  return out
}

// The page's surfaces, made again only when its shapes' rows have changed: `version` is every one's id
// and place, and the same version hands back the same surfaces.
const shown = new WeakMap<object, { version: string; surfaces: Surface[] }>()

export function seen(plugins: Plugins): Seen {
  const world = plugins.wire.scene.world!
  const kinds = new Set(Object.keys((world.shapes3d?.kinds ?? {}) as Record<string, Kind>))
  const byKind = new Map<string, Row[]>()
  for (const r of plugins.wire.rows) {
    if (!kinds.has(r.kind)) continue
    const list = byKind.get(r.kind)
    if (list) list.push(r)
    else byKind.set(r.kind, [r])
  }
  const version = ''
  const was = shown.get(world)
  if (was && was.version === version) return { surfaces: was.surfaces, version, worker: WORKER }
  const reader = { world, all: (kind: string) => byKind.get(kind) ?? [] } as unknown as W
  const surfaces = read(reader)
  shown.set(world, { version, surfaces })
  return { surfaces, version, worker: WORKER }
}

// What lod3d's workers load to answer these surfaces: this module, whose behaviors read nothing but each
// surface's own shape, so a worker holds nothing for them. It names its own file as a `new URL`, so the
// static site's bundle (`scripts/bundle.ts`) finds it as a task of a worker and writes it as a file.
const WORKER = { url: new URL('./shapes3d.lod3d.ts', import.meta.url).href }
