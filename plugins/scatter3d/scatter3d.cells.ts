// scatter3d's cells placed and bedded: the arithmetic scatter3d's browser half (`scatter3d.plugin.ts`,
// whose header says how a cell is bedded) runs on the page, and a land's worker runs as a task
// (terrain3d's `task`), so a cell placed in either is the same instance to the bit.
//
// `bed(cell, stand, ground)` is a placed cell's instance matrix: its model at `size`, yawed, tilted
// `lean` of the way to the ground's plane and sunk, from the row's `stand`, `{ foot, edge, lean }`.
// `take(pack, stand, i, j, ground)` is cell (i, j) placed and bedded: `{ cell, m }`, both undefined
// for a refused cell.
//
// `task(ground, { pack, stands, cells })` is the task: every cell of `cells`, `[i, j]` each, placed
// and bedded on `ground`, handed back as `{ out: { cells, m }, transfer }`: `cells` each cell or
// undefined, and `m` their matrices, 16 floats a cell in order, zeros for a refused one.
import * as THREE from 'three'
import { place, type Cell, type Ground, type Pack } from './scatter3d.sim.ts'

export type Stand = { foot: number; edge: number; lean: number }

const up = new THREE.Vector3(0, 1, 0)

export function bed(c: Cell, stand: Stand, ground: Ground): Float32Array {
  const { foot, edge, lean } = stand
  const f = foot * c.size
  let a = 0, bx = 0, bz = 0
  if (f > 0) {
    let sx = 0, sz = 0
    for (let k = 0; k < 8; k++) {
      const dx = f * Math.cos((k * Math.PI) / 4), dz = f * Math.sin((k * Math.PI) / 4)
      const h = ground.height(c.x + dx, c.z + dz)
      a += h
      sx += h * dx
      sz += h * dz
    }
    // Eight points evenly round a circle: Σdx² = Σdz² = 4f² and Σdx·dz = 0.
    a /= 8
    bx = sx / (4 * f * f)
    bz = sz / (4 * f * f)
  } else a = ground.height(c.x, c.z)
  const tilt = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(-bx, 1, -bz).normalize()), lean)
  const rho = (foot + lean * (edge - foot)) * c.size
  const down = Math.atan2(-bz, -bx)
  const p = new THREE.Vector3()
  let gap = -Infinity
  for (let k = 0; k < 8; k++) {
    const th = down + (k * Math.PI) / 4
    p.set(rho * Math.cos(th), 0, rho * Math.sin(th)).applyQuaternion(tilt)
    gap = Math.max(gap, a + p.y - ground.height(c.x + p.x, c.z + p.z))
  }
  const q = tilt.multiply(new THREE.Quaternion().setFromAxisAngle(up, c.yaw))
  return Float32Array.from(new THREE.Matrix4().compose(new THREE.Vector3(c.x, a - gap, c.z), q, new THREE.Vector3(c.size, c.size, c.size)).elements)
}

export function take(pack: Pack, stands: Record<string, Stand>, i: number, j: number, ground: Ground) {
  const cell = place(pack, i, j, ground)
  return { cell, m: cell && bed(cell, stands[cell.row], ground) }
}

export function task(ground: Ground, input: { pack: Pack; stands: Record<string, Stand>; cells: number[][] }) {
  const { pack, stands, cells } = input
  const out = { cells: [] as (Cell | undefined)[], m: new Float32Array(16 * cells.length) }
  cells.forEach(([i, j], n) => {
    const t = take(pack, stands, i, j, ground)
    out.cells.push(t.cell)
    if (t.m) out.m.set(t.m, 16 * n)
  })
  return { out, transfer: [out.m.buffer] }
}
