// shapes3d's mod for particle3d, named by the scene's `world.particle3d.mods.solids`: particles of a
// layer with a `bounce` bounce off shapes3d's shapes. The test hands particle3d a page of its own, as
// particle3d's own test does: its rows are a crate (a box 2 m on a side, its top 1 m up) and a post (a
// cylinder), and its effects file a ball dropped onto the crate and one thrown at the post.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { particle3d, type Effects } from '#plugins/particle3d/particle3d.plugin.ts'
import { solids } from './shapes3d.particle3d.ts'

const DT = 1 / 60
const effects: Effects = {
  cap: 50,
  effects: {
    drop: [{ life: [3, 3], g: 10, bounce: 0.5 }],
    through: [{ life: [3, 3], g: 10 }],
    side: [{ life: [3, 3], dir: [1, 0, 0], spread: 0, speed: [6, 6], bounce: 1 }],
  },
}
const world = {
  shapes3d: { kinds: { crate: { shape: { box: { size: [2, 1, 2] } } }, post: { shape: { cylinder: { radius: 0.5, height: 3 } } } } },
  particle3d: { effects: 'effects', hold: 0.1, mods: { solids: ['shapes3d'] } },
}
const rows = [
  { id: 1, kind: 'crate', data: { pos: [0, 0, 0], yaw: 0 } },
  { id: 2, kind: 'post', data: { pos: [8, 0, 0], yaw: 0 } },
]

const page = async () => {
  await prepare({}, [], world)
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 0, 10)
  const plugins: any = {
    wire: { scene: { plugins: ['loader', 'particle3d', 'render3d'], world, prefabs: { engine: { dt: DT } } }, rows },
    render3d: { THREE, scene: new THREE.Scene(), camera },
    loader: { on: (_: string, f: (it: Effects) => void) => f(effects), onWritten: () => {}, get: () => undefined, load: () => {} },
  }
  const me = particle3d()
  return { plugins, me, frame: () => me.afterTick(plugins) }
}
// The one particle's place, read back out of its quad: the middle of its four corners.
const at = (plugins: any) => {
  const mesh = plugins.render3d.scene.children.find((o: any) => o.isMesh)
  const p = mesh.geometry.attributes.position.array
  return [0, 1, 2].map(k => (p[k] + p[3 + k] + p[6 + k] + p[9 + k]) / 4)
}

test('a line meets the crate\'s top and the post\'s side where they stand, the normal facing out; one that misses meets nothing', async () => {
  const { plugins } = await page()
  const meet = solids(plugins)
  const top = meet([0.3, 3, 0.2], [0, -1, 0], 5)!
  expect(top.t).toBeCloseTo(2, 9)
  expect(top.normal[1]).toBeCloseTo(1, 9)
  const post = meet([0, 1, 0.1], [1, 0, 0], 20)!
  // the crate's own +x side, 1 m out, comes first
  expect(post.t).toBeCloseTo(1, 9)
  const past = meet([2, 1, 0], [1, 0, 0], 20)!
  expect(past.t).toBeCloseTo(5.5, 9)
  expect(past.normal).toEqual([-1, 0, 0])
  expect(meet([0, 3, 5], [0, -1, 0], 5)).toBeUndefined()
})

test('a particle that bounces lands on the crate and goes back up with half its fall, again and again lower; one that does not falls through', async () => {
  const p = await page()
  p.me.emit('drop', [0, 3, 0])
  const ys: number[] = []
  for (let f = 0; f < 120; f++) { p.frame(); ys.push(at(p.plugins)[1]) }
  expect(Math.min(...ys)).toBeGreaterThan(1 - 1e-3)
  // it falls 2 m to the top, at about 6.3 m/s, and rises again to about a quarter of that height
  // the frame it first goes back up
  const low = ys.findIndex((y, i) => ys[i + 1] > y)
  expect(ys[low]).toBeLessThan(1.15)
  const peak = Math.max(...ys.slice(low, low + 40))
  expect(peak).toBeGreaterThan(1.4)
  expect(peak).toBeLessThan(1.6)
  const q = await page()
  q.me.emit('through', [0, 3, 0])
  for (let f = 0; f < 60; f++) q.frame()
  expect(at(q.plugins)[1]).toBeLessThan(0)
})

test('a particle thrown at the post comes back off it at the speed it went, mirrored', async () => {
  const p = await page()
  p.me.emit('side', [3, 2, 0])
  const xs: number[] = []
  for (let f = 0; f < 60; f++) { p.frame(); xs.push(at(p.plugins)[0]) }
  // 4.5 m to the post's side at 6 m/s, 0.75 s, then back the way it came; drawn the frame it is
  // thrown, so frame n has gone n - 1 steps
  expect(Math.max(...xs)).toBeLessThanOrEqual(7.5 + 1e-3)
  expect(Math.max(...xs)).toBeGreaterThan(7.4)
  expect(xs[59]).toBeCloseTo(7.5 - 6 * (59 * DT - 0.75), 3)
})
