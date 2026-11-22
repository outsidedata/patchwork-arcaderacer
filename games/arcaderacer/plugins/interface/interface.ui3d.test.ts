// The interface's words for ui3d, as the title scene loads them: its `world.ui3d.mods.behaviors` names
// the interface (and particle3d), and the interface's `behaviors()` hands ui3d `word`, `reveal`, `sway`,
// `spin` and `fade`, each run here on a thing in a camera's frame as ui3d runs it.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Behaviors, Placed } from '#plugins/ui3d/ui3d.plugin.ts'
import { sim } from '../../arcaderacer.sim.ts'
import file from '../../arcaderacer.scene.json' with { type: 'json' }

const base = new URL('../../', import.meta.url).href

// A thing at the camera's frame's origin, `age` seconds after it was first shown, the camera turned a
// quarter round its upright.
function thing(age: number): Placed {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const holder = new THREE.Group()
  holder.quaternion.copy(q)
  const object = new THREE.Object3D()
  holder.add(object)
  return { key: 'k', holder, object, selected: false, chosen: false, age, camera: { p: new THREE.Vector3(), q }, T: THREE, plugins: {} as never }
}

test('the title delivers the interface\'s reveal, sway and spin to ui3d, and each moves the thing as its numbers say', async () => {
  const truth = boot(structuredClone(file) as Scene, sim)
  const scenes = await load(truth, base)
  const world = scenes.get('title')!.world
  const all = modsOf<() => Behaviors>(world, 'ui3d', 'behaviors')
  expect(all.length).toBe(2)
  const { reveal, sway, spin, word, fade } = all[0]()
  expect(Object.keys(all[0]()).sort()).toEqual(['fade', 'reveal', 'spin', 'sway', 'word'])

  // word: the copy of the model shows the node alone, its faces and sides each a material of its own
  const model = new THREE.Group()
  const node = (name: string) => {
    const n = new THREE.Group()
    n.name = name
    n.position.set(4, 0, 0)
    n.add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial({ name: 'face' }), new THREE.MeshStandardMaterial({ name: 'side' })]))
    model.add(n)
    return n
  }
  const name = node('name'), other = node('tokyo')
  const worded = thing(0)
  worded.holder.remove(worded.object)
  worded.object = model
  const F = { colour: '#ff0000', metalness: 1, roughness: 0.1, env: 1 }
  const E = { sky: '#4f7fc4', horizon: '#e8eef6', ground: '#1a1416', band: '#ffffff', width: 0.12, size: 50 }
  word({ node: 'name', face: F, side: { ...F, colour: '#00ff00' }, env: E }, worded)
  expect([name.visible, other.visible]).toEqual([true, false])
  expect(name.position.length()).toBe(0)
  const [face, side] = (name.children[0] as THREE.Mesh).material as THREE.MeshPhysicalMaterial[]
  expect([face.name, face.color.getHexString(), side.name, side.color.getHexString()]).toEqual(['face', 'ff0000', 'side', '00ff00'])
  // made once: the next frame leaves it as it is
  word({ node: 'name', face: F, side: F, env: E }, worded)
  expect(((name.children[0] as THREE.Mesh).material as THREE.Material[])[0]).toBe(face)

  // reveal: hidden until `after`, then in from `from` in the camera's frame, turned `turn` that unwinds
  const R = { after: 1, seconds: 2, from: [0, -3, -10], turn: 0.5 }
  const early = thing(0.5)
  reveal(R, early)
  expect(early.holder.visible).toBe(false)
  const start = thing(1 + 1e-9)
  reveal(R, start)
  expect(start.holder.visible).toBe(true)
  const from = new THREE.Vector3(0, -3, -10).applyQuaternion(start.camera.q)
  expect(start.holder.position.distanceTo(from)).toBeLessThan(1e-6)
  const half = thing(2)
  reveal(R, half)
  expect(half.holder.position.length()).toBeCloseTo(from.length() * 0.5 ** 3, 6)
  const done = thing(3)
  reveal(R, done)
  expect(done.holder.position.length()).toBe(0)
  expect(done.holder.quaternion.angleTo(done.camera.q)).toBeLessThan(1e-9)
  expect(start.holder.quaternion.angleTo(start.camera.q)).toBeCloseTo(0.5, 6)

  // sway: still until `after`, then a sine of each of yaw, pitch and roll
  const S = { yaw: [0.1, 1], pitch: [0, 1], roll: [0, 1], phase: -0.7, after: 2 }
  const still = thing(1)
  sway(S, still)
  expect(still.holder.quaternion.angleTo(still.camera.q)).toBeLessThan(1e-9)
  const swung = thing(2 + Math.PI / 2)
  sway(S, swung)
  expect(swung.holder.quaternion.angleTo(swung.camera.q)).toBeCloseTo(0.1, 6)

  // spin: the object alone turns `rate` radians a second; the holder, and the hit box in it, do not
  const spun = thing(2)
  spin({ rate: 0.25 }, spun)
  expect(spun.object.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0.5, 6)
  expect(spun.holder.quaternion.angleTo(spun.camera.q)).toBeLessThan(1e-9)

  // fade: each material's opacity times how far along the fade is: none until `after`, all of it once `seconds` are done
  const veiled = (age: number) => {
    const it = thing(age)
    it.object = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 }))
    fade({ after: 1, seconds: 2 }, it)
    return ((it.object as THREE.Mesh).material as THREE.Material).opacity
  }
  expect(veiled(0.5)).toBe(0)
  expect(veiled(2)).toBeCloseTo(0.6 * (1 - 0.5 ** 3), 6)
  expect(veiled(3)).toBeCloseTo(0.6, 6)
  expect(veiled(30)).toBeCloseTo(0.6, 6)
})
