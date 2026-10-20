// land: the country round arcaderacer's circuit, made from the scene's `world.seed` and its course file
// (`world.course`): the height of the ground at any point, and where everything that stands on it
// goes. Like the track it is a pure function of the seed and the numbers, made once per process for
// each pair, carried by no row; its browser half, `land.plugin.ts`, draws it. Nothing in it moves or
// is touched by a car: the cars meet only the road and its walls (the drive plugin).
//
// The road's corridor is the road, its walls and a `skirt` either side of them. The ground is not
// drawn inside the corridor: the browser half draws the walls and the skirt from each wall to the
// ground, so the ground never pokes through the road and the road is never buried. Beyond the skirt
// the ground eases from the road's own level to the open country over `blend`.
//
// The course's `land`, in metres:
//   size, cell       the ground is a square `size` across, centred on the circuit, cut in squares of
//                    `cell`.
//   hills            { height, scale, octaves }: the open country, the sum of `octaves` layers of
//                    smooth noise, each half as tall and twice as fine as the last, the first `height`
//                    tall and `scale` across.
//   skirt            the width of the corridor beyond each wall.
//   under            how far under the road's edge the ground at the corridor lies.
//   blend            beyond the corridor, the ground eases from the road's level to the country's.
//   rim              over the last `rim` before the square's edge the country settles to level 0.
//   clearance        where the road runs more than this over the ground (a bridge), the ground under
//                    it is drawn as open country, not left to the corridor (`cut`).
//   mountain         { height, reach }: over each `tunnel` the country rises into a mountain, `height`
//                    over the tunnel's highest road along it, falling away to nothing `reach` from it.
//   water            { level, floor, reach }: round each `bridge` the country falls to the sea bed
//                    `floor`, under the sea at `level`, reaching `reach` from the bridge.
// Along an `underground` the road's own level is taken as it was before it dipped, so the street
// stays where it was and the road runs below it. Along a bridge or a tunnel the road's level is not
// the ground's at all: the ground there is the country's, the sea bed under the one and the mountain
// over the other.
//
// What stands on it:
//   things           a list of { name, count, clear, size: [least, most] }: `count` of each scattered
//                    over the square, none within `clear` of the corridor, under the water or on
//                    another thing's spot; each `size` tall.
//   blocks           { cell, fill: [least, most], clear, height: [least, most], middle, chance,
//                    shrink?, least? }: city blocks on a grid of `cell`, each square taken by one
//                    building with `chance`, its footprint `fill` of the square each way, `height` tall,
//                    the tallest nearer the middle (`middle`, how many times taller there than at the
//                    edge), none within `clear` of the corridor, in the water or within a landmark's
//                    `clear` of it. With `shrink`, a list of scales, a block that crowds the corridor is
//                    cut back across x, across z or both, each by one of them, held to each corner of
//                    its footprint in turn, before it is dropped, and kept at the largest that clears
//                    it and is `least` across or more: so the blocks crowd up to the road and stand
//                    back only where they must.
//   frontage         { setback, depth, runs: [least, most], street, step }: the buildings that line
//                    the road, as runs of street front on both sides of it, each a line `setback`
//                    beyond the corridor sampled every `step` metres along the circuit, rolled
//                    `runs` long and broken by a side street `street` wide. A run stops early where
//                    its line, or a point `depth` behind it, would stand within `setback` of the
//                    corridor (where the circuit comes back near itself), in the water, within a
//                    landmark's `clear` or by a tunnel or a bridge; a run shorter than `runs[0]` is
//                    dropped.
//   along            a list of { name, every, out, sides, straight? }: one each side of `sides` (−1
//                    left, 1 right) every `every` metres along the circuit, `out` beyond the wall; with
//                    `straight`, only where the road turns less than that (1/m). None on a bridge or
//                    in a tunnel.
//   landmarks        a list of { name, angle, distance, ... }: one each, `distance` from the middle of
//                    the circuit at `angle` turns round from +z, moved out until it is `clear` of the
//                    corridor; the rest of the entry is the look's.
//
// `landOf(course, seed)` hands back `{ track, middle, height(x, z), edge(x, z), things, blocks,
// fronts, along, landmarks }`: `height` the ground's level; `edge` how far a point is outside the
// corridor (below 0 inside it); `cut(x, z)` whether the ground there is left to the corridor's
// drawing, inside the corridor where the road is not `clearance` over it; `things` by name, each
// `{ x, y, z, yaw, size }`; `blocks` each `{ x, z, y, w, d, h }`, its footprint `w` across x and `d`
// across z, standing on `y`; `fronts` each `{ side, points }`, a run of street front on the `side`
// of the road (as `along`'s), its line's points `[x, z]` ordered so that the road lies toward
// (−dz, dx) of their direction (dx, dz): a building whose front runs along them faces the road;
// `along` by name, each `{ x, y, z, yaw, side, s }`, `yaw` the road's there; `landmarks` each its
// entry with `x`, `y`, `z`.
import { seeded } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { build, inside, locate, sample, type Spec as TrackSpec, type Track } from '../track/track.sim.ts'

export type Course = {
  track: TrackSpec
  land: {
    size: number; cell: number; hills: { height: number; scale: number; octaves: number }
    skirt: number; under: number; blend: number; rim: number; clearance: number
    mountain?: { height: number; reach: number }
    water?: { level: number; floor: number; reach: number }
  }
  things?: { name: string; count: number; clear: number; size: number[] }[]
  blocks?: { cell: number; fill: number[]; clear: number; height: number[]; middle: number; chance: number; shrink?: number[]; least?: number }
  frontage?: { setback: number; depth: number; runs: number[]; street: number; step: number }
  along?: { name: string; every: number; out: number; sides: number[]; straight?: number }[]
  landmarks?: ({ name: string; angle: number; distance: number; clear: number } & Record<string, unknown>)[]
}

export type Thing = { x: number; y: number; z: number; yaw: number; size: number }
export type Block = { x: number; y: number; z: number; w: number; d: number; h: number }
export type Beside = { x: number; y: number; z: number; yaw: number; side: number; s: number }
export type Front = { side: number; points: [number, number][] }
export type Land = {
  track: Track
  middle: [number, number]
  height(x: number, z: number): number
  edge(x: number, z: number): number
  cut(x: number, z: number): boolean
  things: Record<string, Thing[]>
  blocks: Block[]
  fronts: Front[]
  along: Record<string, Beside[]>
  landmarks: ({ name: string; x: number; y: number; z: number } & Record<string, unknown>)[]
}

const ease = (k: number) => {
  const c = Math.max(0, Math.min(1, k))
  return c * c * (3 - 2 * c)
}

// Smooth value noise on a lattice of `seed`'s rolls, 0 to 1.
function noise(seed: number) {
  const N = 256
  const die = seeded(seed)
  const table = Float64Array.from({ length: N * N }, () => die())
  const at = (i: number, j: number) => table[(((i % N) + N) % N) * N + (((j % N) + N) % N)]
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x: number, z: number) => {
    const i = Math.floor(x), j = Math.floor(z)
    const u = smooth(x - i), v = smooth(z - j)
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u
    return a + (b - a) * v
  }
}

// The nearest circuit sample to a point, from a grid of buckets over the samples, or −1 when none is
// within `reach`.
function nearness(t: Track, reach: number) {
  const buckets = new Map<string, number[]>()
  const key = (a: number, b: number) => `${a},${b}`
  for (let i = 0; i < t.n; i++) {
    const k = key(Math.floor(t.x[i] / reach), Math.floor(t.z[i] / reach))
    const list = buckets.get(k)
    if (list) list.push(i)
    else buckets.set(k, [i])
  }
  return (x: number, z: number): number => {
    const cx = Math.floor(x / reach), cz = Math.floor(z / reach)
    let best = -1, least = reach * reach
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const i of buckets.get(key(cx + a, cz + b)) ?? []) {
        const d = math.pow(t.x[i] - x, 2) + math.pow(t.z[i] - z, 2)
        if (d <= least) [least, best] = [d, i]
      }
    }
    return best
  }
}

// The least distance from (x, z) to the centre line along a feature's stretch.
function toStretch(t: Track, s0: number, s1: number, x: number, z: number) {
  let least = Infinity
  for (let s = s0; s <= s1; s += t.step * 2) {
    const c = sample(t, s)
    least = Math.min(least, math.hypot(c.x - x, c.z - z))
  }
  return least
}

const made = new WeakMap<object, Map<number, Land>>()

export function landOf(course: Course, seed: number): Land {
  const bySeed = made.get(course) ?? new Map<number, Land>()
  made.set(course, bySeed)
  const had = bySeed.get(seed)
  if (had) return had
  const t = build(course.track, seed)
  const L = course.land
  const xs = Array.from(t.x), zs = Array.from(t.z)
  const middle: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2]
  const half = L.size / 2
  const rough = noise(seed ^ 0x51a7)
  const tunnels = t.features.filter(f => f.kind === 'tunnel')
  const bridges = t.features.filter(f => f.kind === 'bridge')
  // the open country: hills, settling at the rim, a mountain over each tunnel, the sea round a bridge
  const country = (x: number, z: number) => {
    let h = 0, amp = L.hills.height, scale = L.hills.scale
    for (let o = 0; o < L.hills.octaves; o++) {
      h += amp * (rough(x / scale + o * 17.3, z / scale - o * 9.1) - 0.5)
      amp /= 2
      scale /= 2
    }
    h *= ease((half - Math.max(Math.abs(x - middle[0]), Math.abs(z - middle[1]))) / L.rim)
    if (L.mountain) for (const p of tunnels) {
      const rise = p.deck + L.mountain.height * ease(1 - toStretch(t, p.s0, p.s1, x, z) / L.mountain.reach)
      h = Math.max(h, rise)
    }
    if (L.water) for (const p of bridges) {
      const w = ease(1 - toStretch(t, p.s0 - p.ramp, p.s1 + p.ramp, x, z) / L.water.reach)
      h += (L.water.floor - h) * w
    }
    return h
  }
  const reach = t.walls + L.skirt + L.blend
  const near = nearness(t, reach)
  // where a point is against the road: how far outside the corridor, and the road's own level there
  const against = (x: number, z: number): { out: number; level: number; bridge: number; road: number } => {
    const i = near(x, z)
    if (i < 0) return { out: Infinity, level: 0, bridge: 0, road: 0 }
    const at = locate(t, x, z, i)
    const side = Math.max(-t.walls, Math.min(t.walls, at.side))
    const c = sample(t, at.s)
    const road = c.y - side * c.slope
    let level = road - L.under, bridge = 0
    for (const p of t.features) {
      const w = inside(p, at.s, t.length)
      if (!w) continue
      if (p.kind === 'underground') level -= p.deck * w
      // over a bridge the ground is the sea bed's, over a tunnel the mountain's: the country's own
      if (p.kind === 'bridge' || p.kind === 'tunnel') bridge = Math.max(bridge, w)
    }
    return { out: Math.abs(at.side) - t.walls - L.skirt, level, bridge, road }
  }
  const height = (x: number, z: number) => {
    const wild = country(x, z)
    const { out, level, bridge } = against(x, z)
    if (out === Infinity) return wild
    const ref = level + (wild - level) * bridge
    return ref + (wild - ref) * ease(out / L.blend)
  }
  const edge = (x: number, z: number) => against(x, z).out
  // whether the ground at a point is the corridor's to draw: inside it, where the road is not high
  // over the ground (a bridge's ground is open country, drawn)
  const cut = (x: number, z: number) => {
    const a = against(x, z)
    return a.out < 0 && a.road - height(x, z) < L.clearance
  }
  const wet = (x: number, z: number) => !!L.water && bridges.length > 0 && height(x, z) < L.water.level + 0.5

  // scattered things, each on a spot of its own
  const die = seeded(seed ^ 0x7ee5)
  const taken = new Set<string>()
  const things: Record<string, Thing[]> = {}
  for (const spec of course.things ?? []) {
    const list: Thing[] = []
    for (let k = 0; list.length < spec.count && k < spec.count * 20; k++) {
      const x = middle[0] + (die() - 0.5) * L.size * 0.96, z = middle[1] + (die() - 0.5) * L.size * 0.96
      const yaw = die() * Math.PI * 2, size = spec.size[0] + (spec.size[1] - spec.size[0]) * die()
      const spot = `${Math.round(x / 3)},${Math.round(z / 3)}`
      if (taken.has(spot) || edge(x, z) < spec.clear || wet(x, z)) continue
      taken.add(spot)
      list.push({ x, y: height(x, z), z, yaw, size })
    }
    things[spec.name] = list
  }
  // landmarks, each out of the corridor's way
  const landmarks = (course.landmarks ?? []).map(m => {
    const a = m.angle * Math.PI * 2
    let r = m.distance, x = middle[0] + math.sin(a) * r, z = middle[1] + math.cos(a) * r
    while ((edge(x, z) < m.clear || wet(x, z)) && r < m.distance + L.size) {
      r += 10
      x = middle[0] + math.sin(a) * r
      z = middle[1] + math.cos(a) * r
    }
    return { ...m, x, y: height(x, z), z }
  })
  // the runs of street front along the road
  const fronts: Front[] = []
  if (course.frontage) {
    const F = course.frontage
    const roll = seeded(seed ^ 0xf407)
    const off = t.walls + L.skirt + F.setback
    const span = () => F.runs[0] + (F.runs[1] - F.runs[0]) * roll()
    const near = (x: number, z: number) => landmarks.some(m => math.hypot(x - m.x, z - m.z) < m.clear)
    for (const way of [-1, 1]) {
      let run: [number, number][] = [], length = 0, target = span(), street = 0
      const close = () => {
        if (length >= F.runs[0]) fronts.push({ side: way, points: way === 1 ? run.reverse() : run })
        run = []
        length = 0
        target = span()
      }
      // the line's point at s, and whether a front may stand there
      const line = (s: number) => {
        const c = sample(t, s)
        const at = (o: number): [number, number] => [c.x - math.cos(c.yaw) * way * o, c.z + math.sin(c.yaw) * way * o]
        const [x, z] = at(off), [bx, bz] = at(off + F.depth)
        const over = t.features.some(p => (p.kind === 'tunnel' || p.kind === 'bridge') && inside(p, s, t.length) > 0)
        return { x, z, ok: !over && edge(x, z) >= F.setback - 0.5 && edge(bx, bz) >= F.setback - 0.5 && !wet(x, z) && !near(x, z) && !near(bx, bz) }
      }
      // round the circuit once from a place no front may stand, so no run is cut where the circuit
      // closes; where fronts may stand all the way round, from the line with a side street there
      const steps = Math.floor(t.length / F.step)
      let first = 0
      while (first < steps && line(first * F.step).ok) first++
      if (first === steps) {
        first = 0
        street = F.street
      }
      for (let k = 0; k < steps; k++) {
        const s = ((first + k) % steps) * F.step
        const { x, z, ok } = line(s)
        if (street > 0) {
          street -= F.step
          continue
        }
        if (!ok) {
          close()
          continue
        }
        if (run.length) length += math.hypot(x - run[run.length - 1][0], z - run[run.length - 1][1])
        run.push([x, z])
        if (length >= target) {
          close()
          street = F.street
        }
      }
      close()
    }
  }
  // city blocks on a grid, clear of the corridor, the water and the landmarks
  const blocks: Block[] = []
  if (course.blocks) {
    const B = course.blocks
    const cells = Math.floor(L.size / B.cell)
    const cornersOf = (x: number, z: number, w: number, d: number) => [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2], [x, z]]
    const clear = (x: number, z: number, w: number, d: number) => cornersOf(x, z, w, d).every(([a, b]) => edge(a, b) >= B.clear && !wet(a, b))
      && landmarks.every(m => Math.max(Math.abs(x - m.x) - w / 2, Math.abs(z - m.z) - d / 2, 0) >= m.clear)
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
      if (die() > B.chance) continue
      const fw = B.fill[0] + (B.fill[1] - B.fill[0]) * die(), fd = B.fill[0] + (B.fill[1] - B.fill[0]) * die()
      let x = middle[0] - half + (i + 0.5) * B.cell, z = middle[1] - half + (j + 0.5) * B.cell
      let w = B.cell * fw, d = B.cell * fd
      if (!clear(x, z, w, d)) {
        // cut back across x, across z or both, each by one of the scales, held to one corner of the
        // footprint: the largest that clears it and is `least` or more across is kept
        const scales = [1, ...(B.shrink ?? [])]
        const sizes = scales.flatMap(kw => scales.map(kd => [w * kw, d * kd]))
          .filter(([cw, cd]) => (cw < w || cd < d) && Math.min(cw, cd) >= (B.least ?? 0))
          .sort((a, b) => b[0] * b[1] - a[0] * a[1])
        let fit: [number, number, number, number] | undefined
        for (const [cw, cd] of sizes) {
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const cx = x + sx * (w - cw) / 2, cz = z + sz * (d - cd) / 2
            if (clear(cx, cz, cw, cd)) {
              fit = [cx, cz, cw, cd]
              break
            }
          }
          if (fit) break
        }
        if (!fit) continue
        ;[x, z, w, d] = fit
      }
      const centre = 1 - Math.min(1, math.hypot(x - middle[0], z - middle[1]) / half)
      const tall = (B.height[0] + (B.height[1] - B.height[0]) * math.pow(die(), 2)) * (1 + (B.middle - 1) * centre)
      blocks.push({ x, y: Math.min(...cornersOf(x, z, w, d).map(([a, b]) => height(a, b))), z, w, d, h: tall })
    }
  }
  // things along the road
  const along: Record<string, Beside[]> = {}
  for (const spec of course.along ?? []) {
    const list: Beside[] = []
    for (let s = spec.every / 2; s < t.length; s += spec.every) {
      if (t.features.some(p => p.kind !== 'underground' && inside(p, s, t.length) > 0)) continue
      if (t.features.some(p => p.kind === 'underground' && inside(p, s, t.length) === 1)) continue
      const c = sample(t, s)
      if (spec.straight !== undefined && Math.abs(c.curve) > spec.straight) continue
      for (const way of spec.sides) {
        const side = way * (t.walls + spec.out)
        const x = c.x - math.cos(c.yaw) * side, z = c.z + math.sin(c.yaw) * side
        list.push({ x, y: height(x, z), z, yaw: c.yaw, side: way, s })
      }
    }
    along[spec.name] = list
  }
  const land: Land = { track: t, middle, height, edge, cut, things, blocks, fronts, along, landmarks }
  bySeed.set(seed, land)
  return land
}
