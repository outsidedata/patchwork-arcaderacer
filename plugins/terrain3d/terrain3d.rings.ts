// terrain3d's rings as arrays: the arithmetic of a ring's mesh, which terrain3d's browser half
// (`terrain3d.plugin.ts`, whose header says what a ring is, its grid, its seams and what a vertex
// carries) and its workers (`terrain3d.worker.ts`) both run, so a ring built in either is the same
// floats. Nothing here draws: it takes a land and hands back arrays.
//
// `layoutOf(rings)` is `world.terrain3d.rings` in lattice units, and throws for a set that can leave a
// hole. `slotsOf(field)` is where each value the ground carries goes. `build(land, layout, slots, k, C,
// hole, seabed)` is ring k's mesh, middle C and the finer ring's middle `hole`, as units of work, run in
// order; once every unit has run, `pos`, `nor`, `grid` and `index` are the ring's. `finish(b)` runs the
// units left, and `arrays(b)` is what of a finished build a mesh is made from, `{ k, C, hole, N, pos,
// nor, grid, index }`, every array's buffer listed in `transfer`, so a worker hands them over without a
// copy.
//
// What the ground carries. The values the look reads off the land record (`Slots`) are not on the
// vertices but in `grid`, one texel a grid point of the ring, (N + 1)² of them, four values a texel,
// `attributes` texels deep: value s of grid point (i, j) is grid[((⌊s/4⌋·(N + 1) + j)·(N + 1) + i)·4 +
// s mod 4]. The look reads it by ground position, blended between the four grid points round it, so a
// field carries as many values as it likes. A grid point on the ring's outer edge, but the outermost
// ring's, carries the coarser ring's values blended along its edge, as its height is lifted onto its
// chord, so both rings give the same values along the seam.
import { shape, type Field, type Land, type Rule } from './terrain3d.sim.ts'
import { perPixel, type GroundLayer } from './terrain3d.warp.ts'

// A ring in lattice units: its cell, its snap, its half width.
export type Ring = { m: number; s: number; H: number; reach: number }
export type Layout = { c0: number; rings: Ring[] }
// Where each value the ground carries goes, four to a texel: each surface's by name, each ground
// layer's (undefined for one with no carried rule), and each biome's share, in the program's order,
// which the biome view draws; `attributes` is how many texels deep a ring's grid is.
export type Slots = { surfaces: Record<string, number>; masks: (number | undefined)[]; biomes: number[]; attributes: number }
export type Build = {
  k: number; C: number[]; hole: number[] | undefined; N: number; x0: number; z0: number
  vid: Int32Array; hs: Float64Array; seam: Map<string, number>; count: number
  pos: Float32Array; nor: Float32Array; grid: Float32Array; index: number[] | Uint32Array
  units: (() => void)[]; next: number
}
// What of a finished build a mesh is made from.
export type Arrays = { k: number; C: number[]; hole: number[] | undefined; N: number; pos: Float32Array; nor: Float32Array; grid: Float32Array; index: Uint32Array }

// The rules of a ground layer a vertex carries: all but height and slope, which the GPU works out per
// pixel. The first layer covers everything and carries none.
export const vertexRules = (l: GroundLayer, k: number) => (k === 0 ? [] : (l.where ?? []).filter(r => !perPixel(r)))

// The names of field `f`'s biomes, in its program's order.
export const biomeNames = (f: Field): string[] => ((f.program.nodes.find(n => n.op === 'biomes')?.list ?? []) as { name: string }[]).map(b => b.name)

// What a vertex carries for field `f`.
export function slotsOf(f: Field): Slots {
  let n = 0
  const surfaces = Object.fromEntries(Object.keys(f.surfaces ?? {}).map(name => [name, n++]))
  const masks = f.ground.layers.map((l, k) => (vertexRules(l, k).length ? n++ : undefined))
  const biomes = biomeNames(f).map(() => n++)
  return { surfaces, masks, biomes, attributes: Math.ceil(n / 4) }
}

// The chord of a coarse edge from hA to hB, t fine cells along it of m: one arithmetic for both rings.
export const chord = (hA: number, hB: number, t: number, m: number) => (t === 0 ? hA : t === m ? hB : hA + (hB - hA) * (t / m))

// The rings of `world.terrain3d` in lattice units, and the lattice unit; throws for a set that can leave a hole.
export function layoutOf(rings: { reach: number; seg: number }[]): Layout {
  if (!rings?.length) throw new Error('terrain3d has no rings')
  const c0 = (2 * rings[0].reach) / rings[0].seg
  const m: number[] = []
  rings.forEach((r, k) => { m.push(k === 0 ? 1 : Math.max(1, Math.round((2 * r.reach) / r.seg / (m[k - 1] * c0))) * m[k - 1]) })
  const out = rings.map((r, k) => {
    const M = m[k + 1] ?? m[k]
    return { m: m[k], s: Math.max(1, Math.round(r.reach / 8 / (c0 * M))) * M, H: Math.ceil(r.reach / (c0 * M)) * M, reach: r.reach }
  })
  for (let k = 1; k < out.length; k++) {
    const need = out[k - 1].H + (out[k].s + out[k - 1].s) / 2 + out[k].m
    if (out[k].H < need) throw new Error(`terrain3d ring ${k} reaches ${out[k].reach} m, which can leave ring ${k - 1}'s hole uncovered: it needs a reach of at least ${need * c0} m`)
  }
  return { c0, rings: out }
}

// Every unit of a build not run yet, run.
export function finish(b: Build) {
  while (b.next < b.units.length) b.units[b.next++]()
}

// A finished build's arrays, and their buffers to hand over.
export function arrays(b: Build): { out: Arrays; transfer: ArrayBuffer[] } {
  const index = b.index instanceof Uint32Array ? b.index : Uint32Array.from(b.index)
  const out = { k: b.k, C: b.C, hole: b.hole, N: b.N, pos: b.pos, nor: b.nor, grid: b.grid, index }
  return { out, transfer: [b.pos.buffer, b.nor.buffer, b.grid.buffer, index.buffer] as ArrayBuffer[] }
}

// Ring k's rebuild as units of work.
export function build(l: Land, layout: Layout, sl: Slots, k: number, C: number[], hole: number[] | undefined, seabed: boolean): Build {
  const { c0, rings } = layout
  const r = rings[k], m = r.m, N = (2 * r.H) / m
  const x0 = C[0] - r.H, z0 = C[1] - r.H
  const last = k === rings.length - 1
  const mc = last ? 0 : rings[k + 1].m
  const inner = hole ? rings[k - 1] : undefined
  const hx0 = hole ? (hole[0] - inner!.H - x0) / m : 0, hx1 = hole ? hx0 + (2 * inner!.H) / m : 0
  const hz0 = hole ? (hole[1] - inner!.H - z0) / m : 0, hz1 = hole ? hz0 + (2 * inner!.H) / m : 0
  const mf = inner?.m ?? 1, mm = m / mf
  const drawnAt = seabed ? l.raw : l.height
  const drawn = (Lx: number, Lz: number) => drawnAt(Lx * c0, Lz * c0)
  const skirt = Math.max(l.field.program.hscale, 40)
  const b: Build = {
    k, C, hole, N, x0, z0, vid: new Int32Array((N + 1) * (N + 1)).fill(-1), hs: new Float64Array((N + 1) * (N + 1)).fill(NaN),
    seam: new Map(), count: 0, pos: new Float32Array(0), nor: new Float32Array(0), grid: new Float32Array(4 * sl.attributes * (N + 1) * (N + 1)), index: [], units: [], next: 0,
  }
  const index = b.index as number[]
  const grounds = l.field.ground.layers
  const biomes = biomeNames(l.field)
  const surfaces = Object.keys(l.field.surfaces ?? {})
  const at = (i: number, j: number) => j * (N + 1) + i
  const inHole = (i: number, j: number) => !!hole && i > hx0 && i < hx1 && j > hz0 && j < hz1
  const edge = (i: number, j: number) => i === 0 || j === 0 || i === N || j === N
  // The unlifted height at grid point (i, j), inside the grid or out of it.
  const hAt = (i: number, j: number) => {
    if (i >= 0 && j >= 0 && i <= N && j <= N) {
      const p = at(i, j)
      if (Number.isNaN(b.hs[p])) b.hs[p] = drawn(x0 + i * m, z0 + j * m)
      return b.hs[p]
    }
    return drawn(x0 + i * m, z0 + j * m)
  }
  // What the ground carries at (x, z) (`Slots`), value s into out[s].
  const S = 4 * sl.attributes
  const valuesAt = (x: number, z: number, out: Float64Array) => {
    const rec = l.record(x, z)
    const ramps = (list: Rule[]) => list.reduce((p, rule) => p * shape(rec.read(rule.q), rule.lo, rule.hi), 1)
    const paint = l.paint(x, z)
    for (const name of surfaces) out[sl.surfaces[name]] = paint.surface === name ? paint.weight : 0
    grounds.forEach((g, k) => { if (sl.masks[k] !== undefined) out[sl.masks[k]!] = ramps(vertexRules(g, k)) })
    biomes.forEach((name, j) => { out[sl.biomes[j]] = rec.read(`biome:${name}`) })
  }
  const va = new Float64Array(S), vb = new Float64Array(S)
  // Grid point (i, j)'s values, at lattice point (Lx, Lz); on the outer edge of a ring with a coarser
  // one outside it, the coarser ring's values at the edge's two coarse points, blended along it.
  const carry = (i: number, j: number, Lx: number, Lz: number) => {
    if (!S) return
    if (!last && edge(i, j)) {
      const alongZ = i === 0 || i === N
      const L = alongZ ? Lz : Lx
      const A = Math.floor(L / mc) * mc
      if (alongZ) { valuesAt(Lx * c0, A * c0, va); valuesAt(Lx * c0, (A + mc) * c0, vb) } else { valuesAt(A * c0, Lz * c0, va); valuesAt((A + mc) * c0, Lz * c0, vb) }
      const t = (L - A) / m, steps = mc / m
      for (let s = 0; s < S; s++) va[s] = chord(va[s], vb[s], t, steps)
    } else valuesAt(Lx * c0, Lz * c0, va)
    for (let s = 0; s < S; s++) b.grid[(((s >> 2) * (N + 1) + j) * (N + 1) + i) * 4 + (s & 3)] = va[s]
  }
  const normal = (v: number, l0: number, r0: number, d0: number, u0: number, step: number) => {
    const nx = l0 - r0, ny = 2 * step, nz = d0 - u0, len = Math.hypot(nx, ny, nz)
    if (len > 0) { b.nor[3 * v] = nx / len; b.nor[3 * v + 1] = ny / len; b.nor[3 * v + 2] = nz / len } else b.nor[3 * v + 1] = 1
  }
  // A seam vertex's key, by its lattice place.
  const place = (Lx: number, Lz: number) => `${Lx},${Lz}`
  // Each coarse edge of the hole: its two grid ends, from low to high, and the grid step along it.
  const holeEdges = () => {
    const out: [number, number, number, number][] = []
    for (let i = hx0; i < hx1; i++) { out.push([i, hz0, i + 1, hz0]); out.push([i, hz1, i + 1, hz1]) }
    for (let j = hz0; j < hz1; j++) { out.push([hx0, j, hx0, j + 1]); out.push([hx1, j, hx1, j + 1]) }
    return out
  }
  const tri = (a: number, c: number, d: number) => {
    const p = b.pos
    const cross = (p[3 * c + 2] - p[3 * a + 2]) * (p[3 * d] - p[3 * a]) - (p[3 * c] - p[3 * a]) * (p[3 * d + 2] - p[3 * a + 2])
    if (cross > 0) index.push(a, c, d)
    else index.push(a, d, c)
  }
  const boundary: number[] = [] // the grid indices round the outer edge, in order, for the skirt

  // The layout: which grid points are drawn, and where each vertex goes.
  b.units.push(() => {
    let n = 0
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) if (!inHole(i, j)) b.vid[at(i, j)] = n++
    const seams = hole && mm > 1 ? 4 * (hx1 - hx0) * (mm - 1) : 0
    for (let i = 0; i < N; i++) boundary.push(at(i, 0))
    for (let j = 0; j < N; j++) boundary.push(at(N, j))
    for (let i = N; i > 0; i--) boundary.push(at(i, N))
    for (let j = N; j > 0; j--) boundary.push(at(0, j))
    b.count = n + seams + (last ? boundary.length : 0)
    b.pos = new Float32Array(3 * b.count)
    b.nor = new Float32Array(3 * b.count)
  })
  // Heights and what each vertex carries, a row at a time; an outer edge lifted onto the coarser
  // ring's chord.
  for (let j = 0; j <= N; j++) {
    b.units.push(() => {
      for (let i = 0; i <= N; i++) {
        const v = b.vid[at(i, j)]
        if (v < 0) continue
        const Lx = x0 + i * m, Lz = z0 + j * m
        let y = hAt(i, j)
        if (!last && edge(i, j)) {
          const alongZ = i === 0 || i === N
          const L = alongZ ? Lz : Lx
          const A = Math.floor(L / mc) * mc
          const hA = alongZ ? drawn(Lx, A) : drawn(A, Lz), hB = alongZ ? drawn(Lx, A + mc) : drawn(A + mc, Lz)
          y = chord(hA, hB, (L - A) / m, mc / m)
        }
        b.pos[3 * v] = Lx * c0
        b.pos[3 * v + 1] = y
        b.pos[3 * v + 2] = Lz * c0
        carry(i, j, Lx, Lz)
      }
    })
  }
  // Normals, a row at a time, from the unlifted heights a cell either side; on the hole's edge a
  // fine cell either side, as the finer ring takes them there.
  const rim = (i: number, j: number) =>
    !!hole && (((i === hx0 || i === hx1) && j >= hz0 && j <= hz1) || ((j === hz0 || j === hz1) && i >= hx0 && i <= hx1))
  for (let j = 0; j <= N; j++) {
    b.units.push(() => {
      for (let i = 0; i <= N; i++) {
        const v = b.vid[at(i, j)]
        if (v < 0) continue
        if (rim(i, j)) {
          const Lx = x0 + i * m, Lz = z0 + j * m
          normal(v, drawn(Lx - mf, Lz), drawn(Lx + mf, Lz), drawn(Lx, Lz - mf), drawn(Lx, Lz + mf), mf * c0)
        } else normal(v, hAt(i - 1, j), hAt(i + 1, j), hAt(i, j - 1), hAt(i, j + 1), m * c0)
      }
    })
  }
  // The seam vertices along the hole, on the chord between the grid points they lie between, and
  // the outermost ring's skirt.
  b.units.push(() => {
    let v = b.count - (last ? boundary.length : 0) - (hole && mm > 1 ? 4 * (hx1 - hx0) * (mm - 1) : 0)
    if (hole && mm > 1) {
      for (const [i0, j0, i1, j1] of holeEdges()) {
        const hA = hAt(i0, j0), hB = hAt(i1, j1)
        for (let t = 1; t < mm; t++) {
          const Lx = x0 + i0 * m + (i1 - i0) * t * mf, Lz = z0 + j0 * m + (j1 - j0) * t * mf
          b.pos[3 * v] = Lx * c0
          b.pos[3 * v + 1] = chord(hA, hB, t, mm)
          b.pos[3 * v + 2] = Lz * c0
          const s = mf * c0
          normal(v, drawn(Lx - mf, Lz), drawn(Lx + mf, Lz), drawn(Lx, Lz - mf), drawn(Lx, Lz + mf), s)
          b.seam.set(place(Lx, Lz), v++)
        }
      }
    }
    if (!last) return
    const cx = C[0] * c0, cz = C[1] * c0
    const first = v
    for (const p of boundary) {
      const u = b.vid[p]
      b.pos[3 * v] = b.pos[3 * u]
      b.pos[3 * v + 1] = b.pos[3 * u + 1] - skirt
      b.pos[3 * v + 2] = b.pos[3 * u + 2]
      const ox = b.pos[3 * u] - cx, oz = b.pos[3 * u + 2] - cz, len = Math.hypot(ox, oz)
      b.nor[3 * v] = len > 0 ? ox / len : 0
      b.nor[3 * v + 2] = len > 0 ? oz / len : 0
      b.nor[3 * v + 1] = len > 0 ? 0 : 1
      v++
    }
    // Each skirt quad, turned to face out from the ring's middle.
    const face = (a: number, c: number, d: number) => {
      const p = b.pos
      const ux = p[3 * c] - p[3 * a], uy = p[3 * c + 1] - p[3 * a + 1], uz = p[3 * c + 2] - p[3 * a + 2]
      const wx = p[3 * d] - p[3 * a], wy = p[3 * d + 1] - p[3 * a + 1], wz = p[3 * d + 2] - p[3 * a + 2]
      const nx = uy * wz - uz * wy, nz = ux * wy - uy * wx
      if (nx * (p[3 * a] - cx) + nz * (p[3 * a + 2] - cz) > 0) index.push(a, c, d)
      else index.push(a, d, c)
    }
    for (let n = 0; n < boundary.length; n++) {
      const P = b.vid[boundary[n]], Q = b.vid[boundary[(n + 1) % boundary.length]]
      const P1 = first + n, Q1 = first + ((n + 1) % boundary.length)
      face(P, Q, P1)
      face(Q, Q1, P1)
    }
  })
  // Triangles, a row of cells at a time: two to a cell, or a fan through the seam where a cell
  // borders the hole.
  for (let j = 0; j < N; j++) {
    b.units.push(() => {
      const vid = (i: number, jj: number) => b.vid[at(i, jj)]
      const fan = (C0: number[], A: number[], B: number[], D0: number[]) => {
        const c = vid(C0[0], C0[1]), d = vid(D0[0], D0[1]), a = vid(A[0], A[1]), bb = vid(B[0], B[1])
        const di = B[0] - A[0], dj = B[1] - A[1]
        let prev = a
        for (let t = 1; t <= mm; t++) {
          const cur = t === mm ? bb : b.seam.get(place(x0 + A[0] * m + di * t * mf, z0 + A[1] * m + dj * t * mf))!
          tri(c, prev, cur)
          prev = cur
        }
        tri(c, bb, d)
      }
      for (let i = 0; i < N; i++) {
        if (hole && i >= hx0 && i < hx1 && j >= hz0 && j < hz1) continue
        if (hole && j >= hz0 && j < hz1 && i === hx0 - 1) { fan([i, j], [hx0, j], [hx0, j + 1], [i, j + 1]); continue }
        if (hole && j >= hz0 && j < hz1 && i === hx1) { fan([i + 1, j], [hx1, j], [hx1, j + 1], [i + 1, j + 1]); continue }
        if (hole && i >= hx0 && i < hx1 && j === hz0 - 1) { fan([i, j], [i, hz0], [i + 1, hz0], [i + 1, j]); continue }
        if (hole && i >= hx0 && i < hx1 && j === hz1) { fan([i, j + 1], [i, hz1], [i + 1, hz1], [i + 1, j + 1]); continue }
        const a = vid(i, j), c = vid(i + 1, j), d = vid(i + 1, j + 1), e = vid(i, j + 1)
        tri(a, c, d)
        tri(a, d, e)
      }
    })
  }
  return b
}
