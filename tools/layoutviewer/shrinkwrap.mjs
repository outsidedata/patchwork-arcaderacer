// The muscles shrink-wrapped into one smooth skin, as the layout viewer previews them.
//
//  1. Voxelize: a cell is solid when its centre is inside any muscle's spindle (the ellipse of its rings,
//     lerped along each segment, and the rounded cap past each end, as the viewer draws the spindle).
//  2. Close (morphological closing by a ball of radius `fill`): dilate the solid by `fill`, then erode the
//     result by `fill`. Every gap, step and crease narrower than the ball is filled with a round fillet, and
//     nothing is made fatter than it was. Both are exact Euclidean distance transforms (Felzenszwalb and
//     Huttenlocher, "Distance Transforms of Sampled Functions", 2012), so the surface of the closed solid is
//     the level set `fill - distance to outside the dilated solid = 0`, a true distance and so smooth.
//  3. Soften: a Gaussian blur of that field, `soften` metres wide, which takes out the steps the solid cells
//     leave on the parts the closing does not touch.
//  4. Mesh: marching cubes over that field, one shared vertex per crossed grid edge.
//  5. Smooth: Taubin's λ|μ smoothing ("A Signal Processing Approach to Fair Surface Design", 1995), which
//     takes out the voxel steps without shrinking the surface the way plain Laplacian smoothing does.
//
// shrinkwrap(bodies, { fill, cell, smooth, soften }) → { positions, normals, index, grid, ms }
//   bodies: one array of rings per muscle, a ring { c, side, up: [x, y, z], w, h } (half width along side,
//   half height along up); fill, cell and soften in metres; smooth the number of Taubin passes.
import { edgeTable, triTable } from 'three/examples/jsm/objects/MarchingCubes.js'

const INF = 1e20

// Each segment of a muscle, ready for the inside test.
const segments = (body) => {
  const out = []
  const last = body.length - 2
  for (let i = 0; i <= last; i++) {
    const a = body[i], b = body[i + 1]
    const s = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]]
    const len2 = s[0] * s[0] + s[1] * s[1] + s[2] * s[2]
    if (len2 === 0) continue
    // A tendon of 0 closes the spindle's end to a point; a tenth of a millimetre keeps the ellipse finite there.
    const capA = i === 0 ? Math.max(1e-4, (a.w + a.h) / 6) : 0
    const capB = i === last ? Math.max(1e-4, (b.w + b.h) / 6) : 0
    out.push({ a, b, s, len2, len: Math.sqrt(len2), capA, capB })
  }
  return out
}

// Whether a point is inside a muscle: inside the ellipse of the ring at its place along some segment, or,
// past either end of the muscle, inside the half ellipsoid of the cap there.
const inside = (segs, px, py, pz) => {
  for (const { a, b, s, len2, len, capA, capB } of segs) {
    const ox = px - a.c[0], oy = py - a.c[1], oz = pz - a.c[2]
    let t = (ox * s[0] + oy * s[1] + oz * s[2]) / len2
    let axial = 0
    if (t < 0) { if (!capA) continue; axial = (t * len) / capA; t = 0 }
    if (t > 1) { if (!capB) continue; axial = ((t - 1) * len) / capB; t = 1 }
    const lx = ox - s[0] * t, ly = oy - s[1] * t, lz = oz - s[2] * t
    const sdx = a.side[0] + (b.side[0] - a.side[0]) * t, sdy = a.side[1] + (b.side[1] - a.side[1]) * t, sdz = a.side[2] + (b.side[2] - a.side[2]) * t
    const udx = a.up[0] + (b.up[0] - a.up[0]) * t, udy = a.up[1] + (b.up[1] - a.up[1]) * t, udz = a.up[2] + (b.up[2] - a.up[2]) * t
    const w = Math.max(1e-4, a.w + (b.w - a.w) * t)
    const h = Math.max(1e-4, a.h + (b.h - a.h) * t)
    const x = (lx * sdx + ly * sdy + lz * sdz) / w / Math.hypot(sdx, sdy, sdz)
    const y = (lx * udx + ly * udy + lz * udz) / h / Math.hypot(udx, udy, udz)
    if (x * x + y * y + axial * axial <= 1) return true
  }
  return false
}

// The squared distance transform of one line of samples, in place (Felzenszwalb and Huttenlocher).
const line = (f, n, d, v, z) => {
  let k = 0
  v[0] = 0
  z[0] = -INF
  z[1] = INF
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = INF
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

// The Euclidean distance, in cells, from every cell to the nearest cell where `seed` is 1.
const distance = (seed, nx, ny, nz) => {
  const g = new Float64Array(nx * ny * nz)
  for (let i = 0; i < g.length; i++) g[i] = seed[i] ? 0 : INF
  const n = Math.max(nx, ny, nz)
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  for (let zz = 0; zz < nz; zz++) for (let y = 0; y < ny; y++) {
    const o = (zz * ny + y) * nx
    for (let x = 0; x < nx; x++) f[x] = g[o + x]
    line(f, nx, d, v, z)
    for (let x = 0; x < nx; x++) g[o + x] = d[x]
  }
  for (let zz = 0; zz < nz; zz++) for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) f[y] = g[(zz * ny + y) * nx + x]
    line(f, ny, d, v, z)
    for (let y = 0; y < ny; y++) g[(zz * ny + y) * nx + x] = d[y]
  }
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    for (let zz = 0; zz < nz; zz++) f[zz] = g[(zz * ny + y) * nx + x]
    line(f, nz, d, v, z)
    for (let zz = 0; zz < nz; zz++) g[(zz * ny + y) * nx + x] = d[zz]
  }
  const out = new Float32Array(g.length)
  for (let i = 0; i < g.length; i++) out[i] = Math.sqrt(g[i])
  return out
}

// Bourke's corners and edges, as three's edgeTable and triTable number them.
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
const EDGE = [[0, 1], [1, 2], [3, 2], [0, 3], [4, 5], [5, 6], [7, 6], [4, 7], [0, 4], [1, 5], [2, 6], [3, 7]]

// Marching cubes where `field` < 0 is inside.
const march = (field, nx, ny, nz, lo, cell) => {
  const pos = [], idx = []
  const made = new Map()
  const at = (x, y, z) => field[(z * ny + y) * nx + x]
  const vertex = (x, y, z, e) => {
    const [ca, cb] = EDGE[e]
    const ax = x + CORNER[ca][0], ay = y + CORNER[ca][1], az = z + CORNER[ca][2]
    const bx = x + CORNER[cb][0], by = y + CORNER[cb][1], bz = z + CORNER[cb][2]
    const key = ((az * ny + ay) * nx + ax) * 3 + (bx !== ax ? 0 : by !== ay ? 1 : 2)
    let v = made.get(key)
    if (v !== undefined) return v
    const fa = at(ax, ay, az), fb = at(bx, by, bz)
    const t = fa / (fa - fb)
    pos.push(lo[0] + (ax + (bx - ax) * t) * cell, lo[1] + (ay + (by - ay) * t) * cell, lo[2] + (az + (bz - az) * t) * cell)
    v = pos.length / 3 - 1
    made.set(key, v)
    return v
  }
  for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
    let cube = 0
    for (let c = 0; c < 8; c++) if (at(x + CORNER[c][0], y + CORNER[c][1], z + CORNER[c][2]) < 0) cube |= 1 << c
    if (edgeTable[cube] === 0) continue
    for (let i = cube * 16; triTable[i] !== -1; i += 3) {
      // The tables wind each triangle clockwise seen from outside; swapped so its front faces out.
      idx.push(vertex(x, y, z, triTable[i]), vertex(x, y, z, triTable[i + 2]), vertex(x, y, z, triTable[i + 1]))
    }
  }
  return { positions: new Float32Array(pos), index: new Uint32Array(idx) }
}

// Taubin's λ|μ smoothing over the mesh's edges, each vertex moved toward the mean of its neighbours by λ,
// then away by μ.
const taubin = (positions, index, passes, lambda = 0.5, mu = -0.53) => {
  const n = positions.length / 3
  const sets = Array.from({ length: n }, () => new Set())
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2]
    sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b)
  }
  const start = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + sets[i].size
  const near = new Int32Array(start[n])
  for (let i = 0; i < n; i++) { let k = start[i]; for (const j of sets[i]) near[k++] = j }
  const next = new Float32Array(positions.length)
  const step = (by) => {
    for (let i = 0; i < n; i++) {
      const count = start[i + 1] - start[i]
      if (!count) { next[i * 3] = positions[i * 3]; next[i * 3 + 1] = positions[i * 3 + 1]; next[i * 3 + 2] = positions[i * 3 + 2]; continue }
      let sx = 0, sy = 0, sz = 0
      for (let k = start[i]; k < start[i + 1]; k++) { const j = near[k] * 3; sx += positions[j]; sy += positions[j + 1]; sz += positions[j + 2] }
      next[i * 3] = positions[i * 3] + by * (sx / count - positions[i * 3])
      next[i * 3 + 1] = positions[i * 3 + 1] + by * (sy / count - positions[i * 3 + 1])
      next[i * 3 + 2] = positions[i * 3 + 2] + by * (sz / count - positions[i * 3 + 2])
    }
    positions.set(next)
  }
  for (let p = 0; p < passes; p++) { step(lambda); step(mu) }
}

// Each vertex's normal: the sum of its triangles' area-weighted normals.
const normalsOf = (positions, index) => {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const k of [a, b, c]) { normals[k] += nx; normals[k + 1] += ny; normals[k + 2] += nz }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l
  }
  return normals
}

// A separable Gaussian blur of the field, sigma in cells, in place: the level-set filter that takes the voxel
// steps out of a field grown from solid cells (as OpenVDB's LevelSetFilter::gaussian does).
const blur = (field, nx, ny, nz, sigma) => {
  if (sigma <= 0) return
  const radius = Math.ceil(sigma * 3)
  const kernel = new Float32Array(radius * 2 + 1)
  let total = 0
  for (let k = -radius; k <= radius; k++) total += kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma))
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total
  const n = Math.max(nx, ny, nz)
  const from = new Float32Array(n)
  // One axis: `count` samples `stride` apart from each start.
  const pass = (count, stride, starts) => {
    for (const s of starts) {
      for (let i = 0; i < count; i++) from[i] = field[s + i * stride]
      for (let i = 0; i < count; i++) {
        let v = 0
        for (let k = -radius; k <= radius; k++) v += kernel[k + radius] * from[Math.min(count - 1, Math.max(0, i + k))]
        field[s + i * stride] = v
      }
    }
  }
  const starts = (a, b, f) => { const out = []; for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) out.push(f(i, j)); return out }
  pass(nx, 1, starts(ny, nz, (y, z) => (z * ny + y) * nx))
  pass(ny, nx, starts(nx, nz, (x, z) => z * ny * nx + x))
  pass(nz, nx * ny, starts(nx, ny, (x, y) => y * nx + x))
}

export const shrinkwrap = (bodies, { fill, cell, smooth, soften }) => {
  const started = performance.now()
  const lo = [INF, INF, INF], hi = [-INF, -INF, -INF]
  const muscles = bodies.map((body) => {
    const blo = [INF, INF, INF], bhi = [-INF, -INF, -INF]
    for (const r of body) {
      const m = Math.max(r.w, r.h, (r.w + r.h) / 6)
      for (let k = 0; k < 3; k++) { blo[k] = Math.min(blo[k], r.c[k] - m); bhi[k] = Math.max(bhi[k], r.c[k] + m) }
    }
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], blo[k]); hi[k] = Math.max(hi[k], bhi[k]) }
    return { segs: segments(body), blo, bhi }
  })
  // Room round the solid for the dilation, and a cell more so the surface never meets the grid's edge.
  const pad = fill + 3 * soften + 2 * cell
  for (let k = 0; k < 3; k++) { lo[k] -= pad; hi[k] += pad }
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1, ny = Math.ceil((hi[1] - lo[1]) / cell) + 1, nz = Math.ceil((hi[2] - lo[2]) / cell) + 1
  const solid = new Uint8Array(nx * ny * nz)
  for (const { segs, blo, bhi } of muscles) {
    const x0 = Math.floor((blo[0] - lo[0]) / cell), x1 = Math.ceil((bhi[0] - lo[0]) / cell)
    const y0 = Math.floor((blo[1] - lo[1]) / cell), y1 = Math.ceil((bhi[1] - lo[1]) / cell)
    const z0 = Math.floor((blo[2] - lo[2]) / cell), z1 = Math.ceil((bhi[2] - lo[2]) / cell)
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (z * ny + y) * nx + x
      if (!solid[i] && inside(segs, lo[0] + x * cell, lo[1] + y * cell, lo[2] + z * cell)) solid[i] = 1
    }
  }
  const voxelized = performance.now()
  // Dilate: every cell within `fill` of the solid.
  const r = fill / cell
  const toSolid = distance(solid, nx, ny, nz)
  const outsideDilated = new Uint8Array(solid.length)
  for (let i = 0; i < solid.length; i++) outsideDilated[i] = toSolid[i] > r ? 1 : 0
  // Erode: the closed solid is every cell more than `fill` from outside the dilated one.
  const toOutside = distance(outsideDilated, nx, ny, nz)
  const field = new Float32Array(solid.length)
  for (let i = 0; i < field.length; i++) field[i] = r - toOutside[i]
  blur(field, nx, ny, nz, soften / cell)
  const closed = performance.now()
  const { positions, index } = march(field, nx, ny, nz, lo, cell)
  const marched = performance.now()
  taubin(positions, index, smooth)
  const normals = normalsOf(positions, index)
  const done = performance.now()
  return {
    positions, normals, index, grid: [nx, ny, nz],
    ms: { voxelize: voxelized - started, close: closed - voxelized, march: marched - closed, smooth: done - marched, all: done - started },
  }
}
