// gpgpu3d on a page with no renderer, handed shapes3d's shapes and walker's bodies: what it packs for the
// GPU each frame, read off the texture it hands every shader, and what each plugin that reads it meets.
// What its GLSL answers is seen on the GPU, in demo_gpuparticle3d's bounce scene.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { gpgpu3d } from './gpgpu3d.plugin.ts'

const shapes3d = { kinds: { crate: { shape: { box: { size: [2, 1, 2] } } }, post: { shape: { cylinder: { radius: 0.5, height: 3 } } } } }
const walker = { kinds: { dog: { radius: 0.3, height: 0.7 } } }
const rows = [
  { id: 1, kind: 'crate', data: { pos: [0, 0, 0], yaw: 0.5 } },
  { id: 2, kind: 'post', data: { pos: [8, 0, 0], yaw: 0 } },
  { id: 3, kind: 'crate', data: { pos: [100, 0, 0], yaw: 0 } },
  { id: 4, kind: 'dog', data: { pos: [1, 0, 4] } },
]

const page = async (own: Record<string, unknown>) => {
  const world = { shapes3d, walker, gpgpu3d: { reach: 20, ...own } }
  await prepare({}, [], world)
  const camera = new THREE.PerspectiveCamera()
  const plugins: any = { wire: { n: 1, scene: { plugins: ['gpgpu3d', 'render3d'], world, prefabs: { engine: { dt: 1 / 60 } } }, rows }, render3d: { THREE, camera } }
  const me = gpgpu3d()
  return { plugins, me, camera }
}

test('the things within reach of the camera are held on the GPU, each its word and its numbers; a plugin meets the things of those the scene names for it, and every thing when it names none', async () => {
  const p = await page({ mods: { things: ['shapes3d', 'walker'], behaviors: ['shapes3d'] }, meets: { grass3d: ['walker'] } })
  const all = p.me.shader(p.plugins, 'gpuparticle3d'), grass = p.me.shader(p.plugins, 'grass3d')
  p.me.afterTick(p.plugins)
  // a thing is four texels: its word and its speed, then its numbers. box is the first word shapes3d
  // delivers and cylinder the fourth
  const held = (n: number) => Array.from(all.uniforms.gpThings.value.image.data.slice(0, n * 16) as Float32Array)
  expect(held(3)).toEqual([
    0, 0, 0, 0, 0, 0, 0, 2, 1, 2, 0.5, 0, 0, 0, 0, 0,
    3, 0, 0, 0, 8, 0, 0, 0.5, 3, 0, 0, 0, 0, 0, 0, 0,
    3, 0, 0, 0, 1, 0, 4, 0.3, 0.7, 0, 0, 0, 0, 0, 0, 0,
  ].map(Math.fround))
  // every thing for the one, the walking body alone for the other: the things after shapes3d's two
  expect([all.uniforms.gpCount.value, all.uniforms.gpSpan.value]).toEqual([3, [0, 2, 2, 1]])
  expect([grass.uniforms.gpCount.value, grass.uniforms.gpSpan.value]).toEqual([1, [2, 1]])
  expect(grass.things()).toEqual([{ cylinder: { pos: [1, 0, 4], radius: 0.3, height: 0.7 } }])
  // flown to the far crate, it is the one thing held
  p.camera.position.set(100, 5, 0)
  p.me.afterTick(p.plugins)
  expect([all.uniforms.gpCount.value, grass.uniforms.gpCount.value]).toEqual([1, 0])
  expect(held(1).slice(4, 11)).toEqual([100, 0, 0, 2, 1, 2, 0])
})

test('a program is compiled once under its name, and hands back the clock it reads, which every frame sets', async () => {
  const p = await page({ mods: { things: [], behaviors: [] } })
  const sheet = { nodes: [{ id: 't', op: 'time' as const, rate: 1 }], out: { now: 't' } }
  const a = p.me.program(p.plugins, 'clock', sheet), b = p.me.program(p.plugins, 'clock', sheet)
  expect(b).toBe(a)
  expect(a.outs).toEqual({ now: 'gpclockOut_now' })
  expect(Object.keys(a.uniforms)).toEqual(['gpTime'])
  p.plugins.wire.n = 61
  p.me.afterTick(p.plugins)
  expect(a.uniforms.gpTime.value).toBeCloseTo(61 / 60)
  // a program that is wrong says so as the reader's own, naming the program
  expect(() => p.me.program(p.plugins, 'clock', { nodes: [{ id: 'x', op: 'none' }], out: { now: 'x' } }, undefined, 'grass3d meadow')).toThrow('grass3d meadow node 0 (x) is of the op "none"')
})

test('a scene that names who hands things and not who delivers their words is told the word', async () => {
  const p = await page({ mods: { things: ['shapes3d'] } })
  expect(() => p.me.afterTick(p.plugins)).toThrow('gpgpu3d has no behavior for thing 0, of the word box: no plugin world.gpgpu3d.mods.behaviors names delivers it')
})
