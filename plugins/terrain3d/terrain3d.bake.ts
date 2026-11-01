// terrain3d's baked rings: the ground's look rendered once into textures round the camera, so ground
// past `near` reads one baked texel instead of working out every ground layer each frame
// (`terrain3d.plugin.ts`, Baked rings). Nothing here knows a game; the plugin, or a plugin drawing
// terrain3d's rings itself (a globe), hands it the meshes to bake and the camera's ground point.
//
// `world.terrain3d.bake`:
//   rings   sides in metres, finest first, each a square centred near the camera. Each is `res`² texels.
//   res     texels a side of every ring.
//   near, far  metres from the camera over which the ground fades from live to baked.
//   cliff   ground whose normal's y is below this stays live at every distance: a bake straight down has
//           nothing for a steep face.
//   band    the share of a ring's side over which a point fades from it to the next coarser, before its
//           finished square ends, so a ring's edge, and the stale texels past it, are never drawn.
//   budget  thousands of texels baked a frame, at least one tile.
//
// Every ring is two layers of one texture array, `2i` its albedo and `2i + 1` its normal, so the
// ground binds one more map however many rings there are. The albedo is written as c^(1/2.2) into
// eight bits and read back as its 2.2nd power, so the darks keep their steps; the normal is the
// normal-mapped normal the look lights, in the ground's frame, as n·0.5 + 0.5.
//
// A ring is addressed by its ground point wrapped on its side: texel column i holds x in [i·t,
// (i + 1)·t) and row j holds −z in [j·t, (j + 1)·t), t = side / res, as a camera straight down sees
// the ground, so the bake turns no triangle over, whatever the ring's middle, so a texel once baked stays put while the
// ring moves. A ring's middle snaps to an eighth of its side; when it moves, only the strips the new
// square holds and the old did not are baked, cut into tiles of `TILE`² texels, finest ring first,
// until the frame's budget is spent. `valid` is the square of finished texels the look may read. On a
// move it shrinks to what the two squares share, and grows as each strip is finished, so it is always
// a rectangle and a half-baked strip is never read. A tile is baked only once the meshes handed over
// cover it (`cover`); until then it waits. The shader reads a point relative to the ring's middle,
// with the middle's own place on the wrap worked out here in doubles, so a far ground point keeps
// its texel.
//
// A tile is baked by drawing each mesh with the ground's own material, `tdBake` set to the tile: the
// material's vertex places each vertex by its ground point, x and z, onto the tile, and its fragment
// draws the albedo (tdDebug 9) or the normal (tdDebug 10) of the look, unlit, worked out live.
import type * as THREE from 'three'
import type { Layout } from './terrain3d.rings.ts'

export type BakeSettings = { rings: number[]; res: number; near: number; far: number; cliff: number; band: number; budget: number }

// The tile's side in texels.
const TILE = 512

type Rect = number[]
type Ring = { side: number; t: number; at: number[] | undefined; valid: Rect | undefined; queue: { rect: Rect; tiles: Rect[] }[] }

const inter = (a: Rect, b: Rect): Rect | undefined => {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
  return r[0] < r[2] && r[1] < r[3] ? r : undefined
}
const bbox = (a: Rect, b: Rect) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
// W less V (V inside W) as strips, in an order where each finished strip leaves V and the strips before
// it a rectangle: the two along z within V's x span first, then the two whole height along x.
function strips(W: Rect, V: Rect | undefined): Rect[] {
  if (!V) return [W]
  const out: Rect[] = []
  if (V[1] > W[1]) out.push([V[0], W[1], V[2], V[1]])
  if (W[3] > V[3]) out.push([V[0], V[3], V[2], W[3]])
  if (V[0] > W[0]) out.push([W[0], W[1], V[0], W[3]])
  if (W[2] > V[2]) out.push([V[2], W[1], W[2], W[3]])
  return out
}
function tiles(rect: Rect, t: number): Rect[] {
  const out: Rect[] = [], step = TILE * t
  for (let z = rect[1]; z < rect[3]; z += step) for (let x = rect[0]; x < rect[2]; x += step) out.push([x, z, Math.min(x + step, rect[2]), Math.min(z + step, rect[3])])
  return out
}
// A run of texel indices [a, b) cut where it crosses a multiple of n, so each piece is one run of the
// wrapped texture.
function seams(a: number, b: number, n: number): number[][] {
  const out: number[][] = []
  while (a < b) { const e = Math.min(b, (Math.floor(a / n) + 1) * n); out.push([a, e]); a = e }
  return out
}
const wrap = (v: number, n: number) => ((v % n) + n) % n
const within = (r: Rect, c: Rect) => r[0] >= c[0] && r[1] >= c[1] && r[2] <= c[2] && r[3] <= c[3]

// Throws for bake settings the rings can never cover: the coarsest baked ring's square, its middle half
// a snap from the camera, has to lie inside the coarsest mesh ring's, whose middle is half its own snap
// from the camera.
export function checkBake(b: BakeSettings, layout: Layout) {
  if (!b.rings?.length) throw new Error('terrain3d bake has no rings')
  b.rings.forEach((s, i) => {
    if (!(s > 0)) throw new Error(`terrain3d bake ring ${i} side ${s} is not above 0`)
    if (i > 0 && !(s > b.rings[i - 1])) throw new Error(`terrain3d bake ring ${i} side ${s} is not wider than ring ${i - 1}'s ${b.rings[i - 1]}`)
  })
  if (!(Number.isInteger(b.res) && b.res >= TILE)) throw new Error(`terrain3d bake res ${b.res} is not a whole number of at least ${TILE}`)
  if (!(b.far > b.near)) throw new Error(`terrain3d bake far ${b.far} is not beyond near ${b.near}`)
  if (!(b.band > 0 && b.band < 0.5)) throw new Error(`terrain3d bake band ${b.band} is not between 0 and 0.5`)
  if (!(b.budget > 0)) throw new Error(`terrain3d bake budget ${b.budget} is not above 0`)
  const outer = layout.rings[layout.rings.length - 1]
  const reach = (outer.H - outer.s / 2) * layout.c0
  const side = b.rings[b.rings.length - 1]
  if (side / 2 + side / 16 > reach) throw new Error(`terrain3d bake ring ${b.rings.length - 1} is ${side} m a side, which reaches past the ground the rings draw: its side may be at most ${Math.floor((reach * 16) / 9)} m`)
}

// The look's uniforms the baker fills: the array, each ring's middle with its place on the wrap, its
// finished square relative to its middle, and its side.
export function bakeUniforms(three: typeof import('three'), b: BakeSettings): Record<string, THREE.IUniform> {
  return {
    tdRing: { value: null },
    tdRingA: { value: b.rings.map(() => new three.Vector4()) },
    tdRingV: { value: b.rings.map(() => new three.Vector4(1, 1, -1, -1)) },
    tdRingS: { value: [...b.rings] },
    tdBakeOn: { value: 0 },
    tdBakeRect: { value: new three.Vector4(0, 0, 1, 1) },
  }
}

export type Baker = {
  // A frame: the rings follow the camera's ground point (x, z) and bake what of them `meshes` cover,
  // `cover` the square [x0, z0, x1, z1] those meshes draw, into the look whose uniforms are `u`, once
  // `ready` (every map of the look has landed).
  // A ring whose texel is `fine` metres or wider bakes from the layers' small copies, which are that
  // fine already (`terrain3d.plugin.ts`, Near maps).
  update(meshes: THREE.Mesh[], x: number, z: number, cover: Rect, u: Record<string, THREE.IUniform>, ready: boolean, fine: number): void
  // Every ring forgets its bake, as for a new look or land; nothing is read until it is baked again.
  reset(): void
  // Per ring: side, middle, finished square and tiles left.
  state(): { side: number; at: number[] | undefined; valid: Rect | undefined; left: number }[]
  close(): void
}

export function baker(three: typeof import('three'), renderer: THREE.WebGLRenderer, b: BakeSettings): Baker {
  const N = b.res
  const rings: Ring[] = b.rings.map(side => ({ side, t: side / N, at: undefined, valid: undefined, queue: [] }))
  const rt = new three.WebGLArrayRenderTarget(N, N, 2 * rings.length, {
    depthBuffer: false, generateMipmaps: true, minFilter: three.LinearMipmapLinearFilter, magFilter: three.LinearFilter,
  })
  rt.texture.wrapS = rt.texture.wrapT = three.RepeatWrapping
  rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  rt.texture.colorSpace = three.NoColorSpace
  renderer.initRenderTarget(rt)
  rt.texture.generateMipmaps = false
  const gl = renderer.getContext() as WebGL2RenderingContext
  // A camera straight down: the material's vertex ignores where it puts things, but its normals and
  // slope are worked out against its view, which has to be a real one.
  const eye = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  eye.position.set(0, 1, 0)
  eye.up.set(0, 0, -1)
  eye.lookAt(0, 0, 0)
  eye.updateMatrixWorld()
  let shown: Record<string, THREE.IUniform> | undefined

  const mips = () => {
    renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, (renderer.properties.get(rt.texture) as { __webglTexture: WebGLTexture }).__webglTexture)
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
    renderer.state.unbindTexture()
  }

  const retarget = (r: Ring, cx: number, cz: number) => {
    r.at = [cx, cz]
    const h = r.side / 2, W = [cx - h, cz - h, cx + h, cz + h]
    r.valid = r.valid && inter(r.valid, W)
    r.queue = strips(W, r.valid).map(rect => ({ rect, tiles: tiles(rect, r.t) }))
  }

  // One tile of ring i: up to four runs of the wrapped texture, each drawn over exactly its texels.
  function bake(i: number, [x0, z0, x1, z1]: Rect, meshes: THREE.Mesh[], u: Record<string, THREE.IUniform>) {
    const r = rings[i], t = r.t
    // texel column i holds x in [i·t, (i + 1)·t), row j holds −z in [j·t, (j + 1)·t): the ground as a
    // camera straight down sees it, so no triangle is turned over
    const i0 = Math.round(x0 / t), i1 = Math.round(x1 / t), j0 = Math.round(-z1 / t), j1 = Math.round(-z0 / t)
    const rect = u.tdBakeRect.value as THREE.Vector4
    for (const [a, c] of seams(i0, i1, N)) {
      for (const [d, e] of seams(j0, j1, N)) {
        rect.set(((a + c) / 2) * t, -((d + e) / 2) * t, ((c - a) * t) / 2, ((e - d) * t) / 2)
        rt.viewport.set(wrap(a, N), wrap(d, N), c - a, e - d)
        rt.scissor.copy(rt.viewport)
        rt.scissorTest = true
        for (const [layer, view] of [[2 * i, 9], [2 * i + 1, 10]]) {
          u.tdDebug.value = view
          renderer.setRenderTarget(rt, layer)
          for (const m of meshes) renderer.render(m, eye)
        }
      }
    }
    return (i1 - i0) * (j1 - j0)
  }

  // The look's uniforms: what each ring holds and where.
  function hand(u: Record<string, THREE.IUniform>) {
    u.tdRing.value = rt.texture
    rings.forEach((r, i) => {
      const A = (u.tdRingA.value as THREE.Vector4[])[i], V = (u.tdRingV.value as THREE.Vector4[])[i]
      if (!r.at || !r.valid) { A.set(0, 0, 0, 0); V.set(1, 1, -1, -1); return }
      A.set(r.at[0], r.at[1], wrap(r.at[0] / r.side, 1), wrap(-r.at[1] / r.side, 1))
      V.set(r.valid[0] - r.at[0], r.valid[1] - r.at[1], r.valid[2] - r.at[0], r.valid[3] - r.at[1])
    })
  }

  return {
    update(meshes, x, z, cover, u, ready, fine) {
      if (u !== shown) {
        // A new look: what was baked was the old one's.
        if (shown) this.reset()
        shown = u
      }
      for (const r of rings) {
        const snap = r.side / 8
        const cx = Math.round(x / snap) * snap + 0, cz = Math.round(z / snap) * snap + 0
        if (!r.at || r.at[0] !== cx || r.at[1] !== cz) retarget(r, cx, cz)
      }
      if (ready && meshes.length && rings.some(r => r.queue.length)) {
        const was = { target: renderer.getRenderTarget(), clear: renderer.autoClear, debug: u.tdDebug.value, culled: meshes.map(m => m.frustumCulled), shadows: renderer.shadowMap.autoUpdate }
        renderer.autoClear = false
        renderer.shadowMap.autoUpdate = false
        for (const m of meshes) m.frustumCulled = false
        u.tdBakeOn.value = 1
        u.tdRing.value = null
        let budget = b.budget * 1024, touched = false
        try {
          outer: for (let i = 0; i < rings.length; i++) {
            const r = rings[i]
            while (r.queue.length) {
              const job = r.queue[0]
              while (job.tiles.length) {
                if (budget <= 0) break outer
                // a tile the meshes do not reach yet waits, and so does everything after it
                if (!within(job.tiles[0], cover)) break outer
                u.tdSmallOnly.value = r.t >= fine ? 1 : 0
                budget -= bake(i, job.tiles.shift()!, meshes, u)
                touched = true
              }
              r.valid = r.valid ? bbox(r.valid, job.rect) : job.rect
              r.queue.shift()
            }
          }
        } finally {
          rt.scissorTest = false
          rt.viewport.set(0, 0, N, N)
          rt.scissor.copy(rt.viewport)
          renderer.setRenderTarget(was.target)
          renderer.autoClear = was.clear
          renderer.shadowMap.autoUpdate = was.shadows
          u.tdSmallOnly.value = 0
          meshes.forEach((m, k) => { m.frustumCulled = was.culled[k] })
          u.tdDebug.value = was.debug
          u.tdBakeOn.value = 0
        }
        if (touched) mips()
      }
      hand(u)
    },
    reset() {
      for (const r of rings) { r.at = undefined; r.valid = undefined; r.queue = [] }
    },
    state: () => rings.map(r => ({ side: r.side, at: r.at, valid: r.valid, left: r.queue.reduce((n, q) => n + q.tiles.length, 0) })),
    close() { rt.dispose() },
  }
}
