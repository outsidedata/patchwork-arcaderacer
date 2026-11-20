// The kit cars measured, for their car files (`cars/<car>.json`): run from the repo root,
// `node --experimental-strip-types games/arcaderacer/assets/kit.measure.ts`. For every piece glb `kit.make.ts`
// wrote (`<car>/<piece>.kit.glb`), read as supershader3d reads it (`unpack`), it prints the box round its
// vertices, [min] and [max] in metres in the glb's own axes, and each bone of its skin with its place.
import fs from 'node:fs'
import path from 'node:path'
import { unpack } from '#plugins/supershader3d/supershader3d.glb.ts'

const here = import.meta.dirname
const cars = Object.keys(JSON.parse(fs.readFileSync(path.join(here, 'cars.kit.json'), 'utf8')))
const r = (v: number) => Math.round(v * 1000) / 1000
for (const car of cars) {
  for (const file of fs.readdirSync(path.join(here, car)).filter(f => f.endsWith('.kit.glb')).sort()) {
    const u = await unpack(new Uint8Array(fs.readFileSync(path.join(here, car, file))))
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const m of u.meshes) {
      const p = m.inputs.position
      for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]) }
    }
    console.log(`${car}/${file} min ${lo.map(r).join(' ')} max ${hi.map(r).join(' ')}`)
    const bones = u.skin?.bones ?? []
    // a bone's place in the glb's own axes: its translation turned and moved by every bone above it
    const turn = (q: number[], v: number[]) => {
      const [x, y, z, w] = q
      const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0])
      return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
    }
    const mul = (a: number[], b: number[]) => [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
    const world = (k: number): { p: number[]; q: number[] } => {
      const b = bones[k]
      if (b.parent < 0) return { p: b.translation, q: b.rotation }
      const up = world(b.parent)
      const t = turn(up.q, b.translation)
      return { p: [up.p[0] + t[0], up.p[1] + t[1], up.p[2] + t[2]], q: mul(up.q, b.rotation) }
    }
    bones.forEach((b, k) => { if (/axle$|corner|wheel|steer$/.test(b.name)) console.log(`  bone ${b.name} at ${world(k).p.map(r).join(' ')}`) })
  }
}
