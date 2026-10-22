// The server half of scatter3d: where every tree, grass clump and boulder stands, as a pure function
// of its cell, and the solid ones a body walks round. The browser half (`scatter3d.plugin.ts`) draws
// the same cells from the same functions, so the trunk a body walks round is the trunk a seat sees.
//
// It has no row: nothing of it changes while the game runs. Its numbers are the scene's
// `world.scatter3d`, which a child scene inherits from the manager's (`addons/scenemanager`), so
// both halves read one set of numbers:
//   mods      `{ ground, land }`, the plugins whose mods hand the server half and the browser half the
//             ground they place on (`addons/scenemanager`'s mods; terrain3d's is
//             `terrain3d.scatter3d.ts`): `ground` this half's (`placed`), `land` the browser half's
//             (its header).
//   cutout coverage budget  the browser half's card numbers and its placing budget (its header).
//   hollows   the most boxes the browser half clears at once, with a `hollows` mod (its header).
//   remember  how many cells the server keeps for each truth: past it, the one asked for longest
//             ago goes first, and it is placed again, the same, when it is asked for again.
//   packs     name to a pack:
//     asset | shape  the loader `model` whose meshes are the pack's rows, or a boulder shape
//                    `{ detail, lumpy, squash }`; a pack has exactly one of them.
//     colour surface a shape pack's colour and its optional surface (the browser half's header).
//     rows           name to `{ weight, solid?, tall? }`: a mesh row of the model, or a variant of
//                    the shape. `solid` makes each instance a circle `solid·size` metres round for
//                    `solids`, and `tall` how high that solid stands over the ground, `tall·size`
//                    metres, for what asks along a line (hitscan3d); a solid with no `tall` stands
//                    without end.
//     cell           metres: the pack is a grid of square cells this wide, at most one instance each.
//     seed           the pack's hashes' seed.
//     lods           the LOD the browser half draws on each of its land's rings, finest ring first; the
//                    pack is drawn out to the ring of its last (its header).
//     shadow leaf    the browser half's shadows and card normals (its header).
//     density        the share of cells kept on open ground.
//     rules          `[{ q, lo, hi }]` over the land record, each a ramp the keep is multiplied by.
//     biomes         optional, biome name to a weight: the keep is multiplied by Σ weight·share, each
//                    share the land record's `biome:<name>`, so a pack grows at its weight in each
//                    biome it names, none in one it leaves out, and thins out across their borders.
//     clearing       metres from the origin inside which no cell is kept.
//     size           [base, spread]: an instance's scale.
//     vary           how far an instance's grey tint strays from 1.
//
// The ground is handed in, never imported: `{ height, cover, ramp, rules, edits }`, terrain3d's
// heightAt, its paint's cover, a rule's ramp over its land record, its rule check, and what of the
// ground has changed. On the server it is the one `mods.ground` names, terrain3d's functions over the
// truth's `w`: `height: (x, z) => heightAt(w, x, z)`, `cover: (x, z) => paintAt(w, x, z).cover`,
// `ramp: (rule, x, z) => ramp(w, rule, x, z)`, `rules`, and `edits: () => edits(w)`; in the browser
// the one `mods.land` names, terrain3d's browser half's `ground` itself. So neither half imports
// terrain3d, and the ramp is terrain3d's one shape.
//
// The cell is the identity. Cell (i, j) of a pack covers [i·cell, (i+1)·cell) across x and the same
// across z, and hₖ is `unit(i, j, seed + k)`, a hash of the three as a fraction in [0, 1):
//   the point  x = (i + h₁)·cell, z = (j + h₂)·cell: jittered over the whole cell;
//   the keep   none within `clearing` metres of the origin; otherwise kept when
//              h₀ < density·cover(x, z)·Π ramp(rule, x, z)·Σ weight·share (with `biomes`), so ground
//              whose cover is 0, a road,
//              keeps nothing, and an inverted ramp (lo > hi) on height is a treeline;
//   the yaw    2π·h₃;
//   the tint   1 + vary·(2·h₄ − 1), a grey;
//   the row    the first row, in the order `rows` lists them, whose running sum of weights passes
//              h₅·(the sum of every weight), so a row of weight 0 is never drawn;
//   the size   base + h₆·spread, so the spread is the same at any density.
// `place(pack, i, j, ground)` is the cell's instance `{ i, j, x, z, row, size, yaw, tint }`, or
// undefined when the cell is refused.
//
// `solids(w, x, z, r, ground)` is `{ x, z, radius, tall? }` for every kept instance of a row with
// `solid` whose circle reaches within r of (x, z): its centre within r + solid·size; `tall` is
// tall·size when the row gives one. It reads its numbers off
// the truth's `world.scatter3d`, and remembers each truth's cells, refused ones too, up to `remember`
// of them, the oldest placed forgotten first. It checks those numbers and starts over when the truth's
// `world.scatter3d` is another object, and it reads the ground's `edits()` on every question: a new
// land drops every cell, and a layer whose version moved drops each cell whose square meets that
// layer's rect.
//
// `placed(w)` is the ground `world.scatter3d.mods.ground` names (`terrain3d.scatter3d.ts`), for the
// mods that place instances on the server (`scatter3d.walker.ts`, `scatter3d.hitscan3d.ts`,
// `scatter3d.box3d.ts`); it throws when the scene names none.
//
// Each pack is checked when its numbers are read: its rules through the ground's `rules`, which
// throws naming a rule whose `q` is no key of the land record, and its cell, lods, weights and
// asset or shape here, each throwing a sentence that names the pack.
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'

export type Rule = { q: string; lo: number; hi: number }
export type Shape = { detail: number; lumpy: [number, number]; squash: number }
export type RockSurface = {
  broad: number; fine: number; lift: number; range: number; mix: [number, number]
  moss: { from: number; to: number; amount: number; up: [number, number]; colour: string }; bump: number; rough: number
}
export type Pack = {
  asset?: string; shape?: Shape; colour?: string; surface?: RockSurface
  rows: Record<string, { weight: number; solid?: number; tall?: number }>
  cell: number; seed: number; lods: number[]; shadow: number; leaf: number
  density: number; rules: Rule[]; biomes?: Record<string, number>; clearing: number; size: [number, number]; vary: number
}
export type Scatter = { mods?: { ground?: string; land?: string; hollows?: string | string[] }; hollows?: number; cutout: number; coverage: number; budget: number; remember: number; packs: Record<string, Pack> }
export type Edits = { land: object; layers: { version: number; rect: number[] }[] }
export type Ground = {
  height(x: number, z: number): number
  cover(x: number, z: number): number
  ramp(rule: Rule, x: number, z: number): number
  rules(list: Rule[], what: string): Rule[]
  edits(): Edits
  // The page's land alone: whether the land itself is on the scene yet, which the browser half keeps
  // its instances off the scene until, so the land and what stands on it arrive together; and the
  // place the land has prepared, `[x, z]`, or undefined, whose cells the browser half places ahead.
  shown?(): boolean
  prepared?(): number[] | undefined
  // The page's land alone: the reach of each of its rings in metres, finest first, the rings the browser
  // half draws each pack's LODs on.
  rings?(): number[]
  // The page's land alone, when it has workers: the module at `url`'s `task(ground, input)` run on the
  // land in one, its output handed back; undefined where it has none.
  task?(url: string, input: unknown): Promise<unknown> | undefined
}
export type Cell = { i: number; j: number; x: number; z: number; row: string; size: number; yaw: number; tint: number }
export type Solid = { x: number; z: number; radius: number; tall?: number }

// One integer hash of a cell and a seed, mixed with Math.imul: a whole number 0 … 2³² − 1.
export function hash(i: number, j: number, seed: number): number {
  let h = Math.imul(i | 0, 0x3c6ef372) ^ Math.imul(j | 0, 0x7feb352d) ^ Math.imul(seed | 0, 0x846ca68b)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
export const unit = (i: number, j: number, seed: number) => hash(i, j, seed) / 4294967296

// A pack's biomes as a rule on each one's share, with its weight.
const made = new WeakMap<Record<string, number>, [Rule, number][]>()
const biomeRules = (biomes: Record<string, number>) => {
  let got = made.get(biomes)
  if (!got) made.set(biomes, (got = Object.entries(biomes).map(([name, weight]) => [{ q: `biome:${name}`, lo: 0, hi: 1 }, weight])))
  return got
}

export function place(pack: Pack, i: number, j: number, ground: Ground): Cell | undefined {
  const { cell, seed } = pack
  const x = (i + unit(i, j, seed + 1)) * cell, z = (j + unit(i, j, seed + 2)) * cell
  if (math.hypot(x, z) < pack.clearing) return undefined
  // The ramps only ever lower the keep, so a cell is refused the moment it falls under h₀.
  const h0 = unit(i, j, seed)
  let keep = pack.density * ground.cover(x, z)
  if (!(h0 < keep)) return undefined
  for (const rule of pack.rules) {
    keep *= ground.ramp(rule, x, z)
    if (!(h0 < keep)) return undefined
  }
  if (pack.biomes) {
    let w = 0
    for (const [rule, weight] of biomeRules(pack.biomes)) w += weight * ground.ramp(rule, x, z)
    keep *= w
    if (!(h0 < keep)) return undefined
  }
  const rows = Object.entries(pack.rows)
  const pick = unit(i, j, seed + 5) * rows.reduce((s, [, r]) => s + r.weight, 0)
  let sum = 0
  const row = rows.find(([, r]) => (sum += r.weight) > pick)?.[0]
  if (row === undefined) return undefined
  return {
    i, j, x, z, row,
    size: pack.size[0] + unit(i, j, seed + 6) * pack.size[1],
    yaw: 2 * Math.PI * unit(i, j, seed + 3),
    tint: 1 + pack.vary * (2 * unit(i, j, seed + 4) - 1),
  }
}

// Throws a sentence naming the first number of `world.scatter3d` that cannot be held.
export function check(s: Scatter, ground: Ground) {
  if (!(Number.isInteger(s.remember) && s.remember > 0)) throw new Error(`scatter3d remember ${s.remember} is not a whole number above 0`)
  for (const [name, p] of Object.entries(s.packs)) {
    const what = `scatter3d pack ${name}`
    if (p.asset !== undefined && p.shape !== undefined) throw new Error(`${what} has both an asset and a shape`)
    if (p.asset === undefined && p.shape === undefined) throw new Error(`${what} has neither an asset nor a shape`)
    if (p.shape !== undefined && p.colour === undefined) throw new Error(`${what} has a shape and no colour`)
    if (!(p.cell > 0)) throw new Error(`${what} cell ${p.cell} is not above 0`)
    if (!(p.lods.length > 0 && p.lods.every(l => Number.isInteger(l) && l >= 0))) throw new Error(`${what} lods ${p.lods.join(', ')} are not a LOD, a whole number of at least 0, for each land ring it is drawn on`)
    for (const [row, r] of Object.entries(p.rows)) if (!(r.weight >= 0)) throw new Error(`${what} row ${row} weighs ${r.weight}`)
    for (const [row, r] of Object.entries(p.rows)) if (r.tall !== undefined && !(r.tall > 0)) throw new Error(`${what} row ${row} stands ${r.tall} tall`)
    ground.rules(p.rules, what)
    if (p.biomes) ground.rules(biomeRules(p.biomes).map(([rule]) => rule), `${what} biomes`)
  }
}

// The solid instances of `packs` whose circle reaches within r of (x, z), each cell asked of `cellOf`.
// How far past r a pack's solid instance may stand, each pack's worked out once: undefined for a pack
// with no solid row drawn.
const margins = new WeakMap<Pack, number | undefined>()
const marginOf = (pack: Pack) => {
  if (margins.has(pack)) return margins.get(pack)
  const solid = Object.values(pack.rows).filter(row => row.solid !== undefined && row.weight > 0)
  const m = solid.length ? Math.max(...solid.map(row => row.solid!)) * (pack.size[0] + pack.size[1]) : undefined
  margins.set(pack, m)
  return m
}

export function solidsOver(packs: Record<string, Pack>, cellOf: (name: string, pack: Pack, i: number, j: number) => Cell | undefined, x: number, z: number, r: number): Solid[] {
  const out: Solid[] = []
  for (const name in packs) {
    const pack = packs[name]
    const margin = marginOf(pack)
    if (margin === undefined) continue
    const R = r + margin
    const i0 = Math.floor((x - R) / pack.cell), i1 = Math.floor((x + R) / pack.cell)
    const j0 = Math.floor((z - R) / pack.cell), j1 = Math.floor((z + R) / pack.cell)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = cellOf(name, pack, i, j)
        const row = c && pack.rows[c.row]
        if (!c || row?.solid === undefined) continue
        const radius = row.solid * c.size
        if (math.hypot(c.x - x, c.z - z) <= r + radius) out.push(row.tall === undefined ? { x: c.x, z: c.z, radius } : { x: c.x, z: c.z, radius, tall: row.tall * c.size })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------- each truth's cells

type Memo = { scatter: Scatter; packs: Map<string, number>; land: object | undefined; versions: number[]; cells: Map<number, { cell: Cell | undefined; square: number[] }> }
const memos = new WeakMap<W, Memo>()

const meets = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

// A cell's key: its pack's place in `packs`, then i and j, each offset to whole numbers below 2²¹.
const keyOf = (pack: number, i: number, j: number) => (pack * 2097152 + (i + 1048576)) * 2097152 + (j + 1048576)

function memoOf(w: W, s: Scatter, ground: Ground): Memo {
  let m = memos.get(w)
  if (!m || m.scatter !== s) {
    check(s, ground)
    m = { scatter: s, packs: new Map(Object.keys(s.packs).map((name, k) => [name, k])), land: undefined, versions: [], cells: new Map() }
    memos.set(w, m)
  }
  const e = ground.edits()
  if (e.land !== m.land) {
    m.cells.clear()
    m.land = e.land
    m.versions = e.layers.map(l => l.version)
    return m
  }
  e.layers.forEach((l, k) => {
    if (l.version === m.versions[k]) return
    m.versions[k] = l.version
    for (const [key, c] of m.cells) if (meets(c.square, l.rect)) m.cells.delete(key)
  })
  return m
}

// The ground the scene's `world.scatter3d.mods.ground` gives the server half, for a rule that asks
// where the instances stand: the mods for walker and hitscan3d place on it.
export function placed(w: W): Ground {
  const ground = mod<(w: W) => Ground>(w.world, 'scatter3d', 'ground')
  if (!ground) throw new Error('scatter3d is asked where its instances stand, and the scene names no world.scatter3d.mods.ground')
  return ground(w)
}

export function solids(w: W, x: number, z: number, r: number, ground: Ground): Solid[] {
  const s = w.world.scatter3d as Scatter
  const { cells, packs } = memoOf(w, s, ground)
  return solidsOver(s.packs, (name, pack, i, j) => {
    const key = keyOf(packs.get(name)!, i, j)
    const had = cells.get(key)
    if (had) return had.cell
    const cell = place(pack, i, j, ground)
    cells.set(key, { cell, square: [i * pack.cell, j * pack.cell, (i + 1) * pack.cell, (j + 1) * pack.cell] })
    if (cells.size > s.remember) cells.delete(cells.keys().next().value!)
    return cell
  }, x, z, r)
}
