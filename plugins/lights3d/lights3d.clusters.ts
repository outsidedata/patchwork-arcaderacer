// lights3d's clusters: the frame cut into cells (`grid` across and up, `slices` along the view, each slice the same
// ratio deeper than the one before), each light (a lamp or a rectangle: `lights3d.lights.ts`, `reachOf`)
// put in every cell its sphere of reach meets, and each cell's run of
// light numbers written into one list with a texture of where each run starts (step 4 of `lights3d.plugin.ts`).
import type * as THREE from 'three'
import { ROW } from './lights3d.glsl.ts'
import { reachOf, room, type Ctx, type Light } from './lights3d.lights.ts'

export function makeClusters(ctx: Ctx) {
  // The cells as boxes in view space, six numbers a cell, made again when the camera's projection,
  // near, far or the grid changes.
  let boxes = new Float32Array(0)
  let shape = ''
  // A light and a cell it reaches, two numbers a pair, grown as a frame needs.
  let pairs = new Int32Array(0)
  let counts = new Uint32Array(ctx.me.cells)

  // The cells' boxes for this camera, made again when its projection or the grid changed.
  function cellBoxes(camera: THREE.Camera, near: number, far: number) {
    const g = ctx.uniforms.uLights3dGrid.value as THREE.Vector3
    const p = camera.projectionMatrix.elements
    const ortho = !!(camera as THREE.OrthographicCamera).isOrthographicCamera
    const key = `${p.join()}|${near}|${far}|${g.x},${g.y},${g.z}|${ortho}`
    if (key === shape) return
    shape = key
    const nx = g.x, ny = g.y, nz = g.z
    boxes = new Float32Array(nx * ny * nz * 6)
    // a view-space x or y at depth d, from a ndc coordinate on the axis whose scale is s and offset o
    const at = (ndc: number, d: number, s: number, o: number) => (ortho ? (ndc - o) / s : (d * (ndc + o)) / s)
    for (let z = 0; z < nz; z++) {
      const dn = near * Math.pow(far / near, z / nz), df = near * Math.pow(far / near, (z + 1) / nz)
      for (let y = 0; y < ny; y++) {
        const y0 = (y / ny) * 2 - 1, y1 = ((y + 1) / ny) * 2 - 1
        for (let x = 0; x < nx; x++) {
          const x0 = (x / nx) * 2 - 1, x1 = ((x + 1) / nx) * 2 - 1
          const xs = [at(x0, dn, p[0], ortho ? p[12] : p[8]), at(x0, df, p[0], ortho ? p[12] : p[8]), at(x1, dn, p[0], ortho ? p[12] : p[8]), at(x1, df, p[0], ortho ? p[12] : p[8])]
          const ys = [at(y0, dn, p[5], ortho ? p[13] : p[9]), at(y0, df, p[5], ortho ? p[13] : p[9]), at(y1, dn, p[5], ortho ? p[13] : p[9]), at(y1, df, p[5], ortho ? p[13] : p[9])]
          const c = ((z * ny + y) * nx + x) * 6
          boxes[c] = Math.min(...xs); boxes[c + 1] = Math.min(...ys); boxes[c + 2] = -df
          boxes[c + 3] = Math.max(...xs); boxes[c + 4] = Math.max(...ys); boxes[c + 5] = -dn
        }
      }
    }
  }

  // Every light of `found` put in the cells it reaches, and the runs, the list and the frame's numbers written.
  function cluster(camera: THREE.Camera, found: Light[], width: number, height: number) {
    const b = ctx.built, T = b.T, me = ctx.me
    const cam = camera as THREE.PerspectiveCamera
    const near = cam.near, far = cam.far
    const n = found.length
    const view = camera.matrixWorldInverse
    const v = new T.Vector3()
    const g = ctx.uniforms.uLights3dGrid.value as THREE.Vector3
    const nx = g.x, ny = g.y, nz = g.z
    cellBoxes(camera, near, far)
    const p = camera.projectionMatrix.elements
    const ortho = !!(camera as THREE.OrthographicCamera).isOrthographicCamera
    const logScale = nz / Math.log(far / near)
    const sliceOf = (d: number) => Math.min(nz - 1, Math.max(0, Math.floor(Math.log(Math.max(d, near) / near) * logScale)))
    // the least and most ndc of view-space x or y from x0 to x1 over depths [da, db], whatever the sign
    // of the projection's scale s: a cube camera's faces are drawn through a field of view of -90°,
    // which turns the screen over, and its least and most change places
    const span = (x0: number, x1: number, da: number, db: number, s: number, o: number): [number, number] => {
      const at = ortho ? [s * x0 + o, s * x1 + o] : [(s * x0) / da - o, (s * x0) / db - o, (s * x1) / da - o, (s * x1) / db - o]
      return [Math.min(...at), Math.max(...at)]
    }
    const tile = (u: number, cells: number) => Math.min(cells - 1, Math.max(0, Math.floor(((u + 1) / 2) * cells)))
    counts.fill(0)
    let pairCount = 0
    const pair = (cell: number, k: number) => {
      if (pairs.length < (pairCount + 1) * 2) { const grown = new Int32Array(Math.max(1024, pairs.length * 2)); grown.set(pairs); pairs = grown }
      pairs[pairCount * 2] = cell
      pairs[pairCount * 2 + 1] = k
      pairCount++
      counts[cell]++
    }
    for (let k = 0; k < n; k++) {
      const light = found[k]
      v.setFromMatrixPosition(light.matrixWorld).applyMatrix4(view)
      const r = reachOf(ctx, light)
      const dMin = -v.z - r, dMax = -v.z + r
      if (dMax < near || dMin > far) continue
      const da = Math.max(dMin, near), db = Math.min(dMax, far)
      const z0 = sliceOf(da), z1 = sliceOf(db)
      let x0 = 0, x1 = nx - 1, y0 = 0, y1 = ny - 1
      if (r !== Infinity) {
        const [ux0, ux1] = span(v.x - r, v.x + r, da, db, p[0], ortho ? p[12] : p[8])
        const [uy0, uy1] = span(v.y - r, v.y + r, da, db, p[5], ortho ? p[13] : p[9])
        x0 = tile(ux0, nx); x1 = tile(ux1, nx)
        y0 = tile(uy0, ny); y1 = tile(uy1, ny)
      }
      const r2 = r * r
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cell = (z * ny + y) * nx + x
        if (r !== Infinity) {
          const o = cell * 6
          const ex = v.x - Math.max(boxes[o], Math.min(v.x, boxes[o + 3]))
          const ey = v.y - Math.max(boxes[o + 1], Math.min(v.y, boxes[o + 4]))
          const ez = v.z - Math.max(boxes[o + 2], Math.min(v.z, boxes[o + 5]))
          if (ex * ex + ey * ey + ez * ez > r2) continue
        }
        pair(cell, k)
      }
    }
    // each cell's run: where it starts in the list, and how long it is
    const cd = b.cells.image.data as Float32Array
    let start = 0
    for (let cell = 0; cell < me.cells; cell++) {
      cd[cell * 2] = start
      cd[cell * 2 + 1] = counts[cell]
      start += counts[cell]
    }
    b.cells.needsUpdate = true
    me.entries = pairCount
    const index = room(ctx, 'index', 'uLights3dIndex', Math.max(1, Math.ceil(pairCount / ROW)))
    const id = index.image.data as Float32Array
    const fill = counts
    fill.fill(0)
    for (let q = 0; q < pairCount; q++) {
      const cell = pairs[q * 2]
      id[cd[cell * 2] + fill[cell]++] = pairs[q * 2 + 1]
    }
    index.needsUpdate = true
    ctx.uniforms.uLights3dScreen.value.set(width, height)
    ctx.uniforms.uLights3dNear.value = near
    ctx.uniforms.uLights3dScale.value = logScale
  }

  return { cluster }
}
