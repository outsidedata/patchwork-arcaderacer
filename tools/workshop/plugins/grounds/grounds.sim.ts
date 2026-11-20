// The arithmetic of the grass workshop's test grounds, with no page in it: what `grounds.plugin.ts` draws,
// what `grounds.grass3d.ts` hands grass3d as its land, on the page and in grass3d's workers, and where the
// thing that treads the grass stands. A worker loads this file, so it imports nothing by a `#` name.
//
// A field is a square of ground `size` metres a side about the origin, its lattice points `cell` metres
// apart; past its edge there is no ground, and no grass.
//
// A test ground:
//   hills   waves, each `{ toward, length, height }`: the ground rises and falls `height` metres either way,
//           once every `length` metres along the way `toward` degrees clockwise from north (0 toward −z, 90
//           toward +x), every wave added. None is flat ground.
//   bare    `{ scale, below, edge }`: a noise from 0 to 1 in patches `scale` metres across; the ground is
//           bare where the noise is under `below`, and the grass comes in over `edge` of the noise round
//           it. A `below` and an `edge` of 0 is grass everywhere.
//
// A treader is what treads the grass: its parts, carried round a circle.
//   parts   each `{ at: [across, up, ahead], cylinder: { radius, height } }`, an upright cylinder whose
//           foot's middle is `at`, or `{ at, box: { half: [across, up, ahead] } }`, a box whose middle is
//           `at`. `at` is metres in the treader's own frame; `up` is over the ground under the part.
//   circle  metres, the radius of the circle it goes round the middle of the field; 0 stands it there
//   speed   metres a second it goes round
import type { Ground, Rule } from '#plugins/grass3d/grass3d.sim.ts'
import type { Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'

export type Hill = { toward: number; length: number; height: number }
export type Bare = { scale: number; below: number; edge: number }
export type Test = { hills: Hill[]; bare: Bare }
export type Field = { size: number; cell: number }
export type Part =
  | { at: [number, number, number]; cylinder: { radius: number; height: number } }
  | { at: [number, number, number]; box: { half: [number, number, number] } }
export type Treader = { parts: Part[]; circle: number; speed: number }

// The height of no ground, as terrain3d's erased ground answers.
export const NOWHERE = -1e9

// Lattice points from the field's middle to its edge.
export const half = (f: Field) => Math.round(f.size / 2 / f.cell)

export function heightOf(t: Test, x: number, z: number): number {
  let h = 0
  for (const w of t.hills) {
    const a = (w.toward * Math.PI) / 180
    h += w.height * Math.sin((2 * Math.PI * (x * Math.sin(a) - z * Math.cos(a))) / w.length)
  }
  return h
}

// A roll from 0 to 1 of a lattice point, and value noise from 0 to 1, a cell a unit.
function roll(i: number, j: number): number {
  let h = Math.imul(i, 0x9e3779b1) ^ Math.imul(j, 0x85ebca77)
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d)
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
function noise(x: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(z)
  const fx = x - i, fz = z - j
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz)
  const a = roll(i, j), b = roll(i + 1, j), c = roll(i, j + 1), d = roll(i + 1, j + 1)
  return a + (b - a) * ux + (c + (d - c) * ux - (a + (b - a) * ux)) * uz
}

// The share of the ground at (x, z) that is grass, from 0 on a bare patch to 1.
export function coverOf(t: Test, x: number, z: number): number {
  const n = noise(x / t.bare.scale, z / t.bare.scale)
  if (t.bare.edge <= 0) return n >= t.bare.below ? 1 : 0
  return Math.max(0, Math.min(1, (n - t.bare.below) / t.bare.edge + 0.5))
}

// The test ground as grass3d's land answers it. It answers no rule: the workshop grows each grass with
// none, since where a grass grows in the game is the game's land's to say.
export function groundOf(t: Test, f: Field): Ground {
  const edge = half(f) * f.cell + 1e-6
  const none = (what: string): never => { throw new Error(`${what}: a test ground of the grass workshop answers no rule`) }
  return {
    height: (x, z) => (Math.abs(x) > edge || Math.abs(z) > edge ? NOWHERE : heightOf(t, x, z)),
    cover: (x, z) => coverOf(t, x, z),
    ramp: (r: Rule) => none(`the rule ${r.q}`),
    rules: (list, what) => (list.length ? none(what) : list),
  }
}

// Where the treader's middle is `seconds` in, [x, z]: on its circle, from (circle, 0) round toward +z.
export function middleOf(t: Treader, seconds: number): [number, number] {
  const turned = t.circle > 0 ? (t.speed * seconds) / t.circle : 0
  return [t.circle * Math.cos(turned), t.circle * Math.sin(turned)]
}

// The treader `seconds` in, part by part, as the things gpgpu3d holds: each cylinder `{ cylinder: { pos,
// radius, height } }` (shapes3d's word), each box `{ hyperbox: { at, rot, half } }` (box3dvehicle's),
// standing on the ground under it and turned the way the treader goes. A part off the field is undefined.
export function treading(t: Treader, height: (x: number, z: number) => number, seconds: number): (Thing | undefined)[] {
  const turned = t.circle > 0 ? (t.speed * seconds) / t.circle : 0
  const out = [Math.cos(turned), Math.sin(turned)], ahead = [-Math.sin(turned), Math.cos(turned)]
  const yaw = Math.atan2(ahead[0], ahead[1])
  const rot = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
  return t.parts.map(p => {
    const x = t.circle * out[0] + out[0] * p.at[0] + ahead[0] * p.at[2]
    const z = t.circle * out[1] + out[1] * p.at[0] + ahead[1] * p.at[2]
    const y = height(x, z)
    if (y <= NOWHERE / 10) return undefined
    return 'cylinder' in p
      ? { cylinder: { pos: [x, y + p.at[1], z], radius: p.cylinder.radius, height: p.cylinder.height } }
      : { hyperbox: { at: [x, y + p.at[1], z], rot, half: p.box.half } }
  })
}
