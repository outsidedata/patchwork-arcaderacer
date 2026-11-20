// ui3d handed the plugins it stands on, in node: render3d's THREE, its camera and its overlay, and a
// canvas 800 by 600 at the page's corner; the page's listeners kept and fired by hand. Each frame is
// ui3d's tick, the actor's shows, then ui3d's afterTick, as a client runs them; the overlay's camera is
// the main camera, as render3d's `follow` puts it each frame.
import { afterEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { keyCode } from '#plugins/player/player.plugin.ts'
import { ui3d, type Look } from './ui3d.plugin.ts'

const listeners: { type: string; f: (e: any) => void }[] = []
vi.stubGlobal('addEventListener', (type: string, f: (e: any) => void) => listeners.push({ type, f }))
vi.stubGlobal('removeEventListener', (type: string, f: (e: any) => void) => {
  const k = listeners.findIndex(l => l.type === type && l.f === f)
  if (k >= 0) listeners.splice(k, 1)
})
const fire = (type: string, e: object) => { for (const l of listeners.filter(l => l.type === type)) l.f(e) }
const press = (name: string) => {
  let stopped = false
  fire('keydown', { key: name, code: keyCode(name), repeat: false, preventDefault() { stopped = true } })
  return stopped
}

const W = 800, H = 600
const KEYS = { next: ['ArrowRight', 'ArrowDown'], previous: ['ArrowLeft', 'ArrowUp'], press: 'Enter' }

function rig(world: Record<string, unknown> = {}, plugins = ['ui3d', 'render3d']) {
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
  const parent = { style: { cursor: '' } }
  const canvas = { parentElement: parent, getBoundingClientRect: () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H }) }
  const overlay = { scene: new THREE.Scene(), camera }
  const p = {
    wire: { scene: { plugins, world: { ui3d: { overlay: [0.1, 200], keys: KEYS }, ...world } }, rows: [], n: 0 },
    render3d: { THREE, camera, overlay, canvas },
  } as any
  const u = ui3d()
  p.ui3d = u
  // one frame: ui3d's tick, the actor's shows, ui3d's afterTick
  const frame = (shows: () => void = () => {}) => {
    camera.updateMatrixWorld()
    u.tick(p)
    shows()
    u.afterTick(p)
  }
  return { p, u, frame, camera, overlay, parent }
}

// A word: a box `w` wide and 1 tall.
const slab = (w = 2) => new THREE.Mesh(new THREE.BoxGeometry(w, 1, 0.2), new THREE.MeshStandardMaterial({ name: 'face', color: '#808080' }))
// Where a point in the camera's frame lands on the canvas.
const onScreen = (camera: THREE.Camera, at: number[]) => {
  const v = new THREE.Vector3().fromArray(at).applyMatrix4(camera.matrixWorld).project(camera)
  return { clientX: ((v.x + 1) / 2) * W, clientY: ((1 - v.y) / 2) * H }
}

afterEach(() => { listeners.splice(0) })

test('a thing is put in the overlay where its look places it in the camera\'s frame, and taken out the first frame nobody shows it', () => {
  const { u, frame, camera, overlay } = rig()
  camera.position.set(5, 2, 0)
  camera.rotation.set(0, Math.PI / 2, 0)
  const a = slab()
  frame(() => u.show('a', () => a, { at: [1, 0, -10], scale: 2 }))
  const holder = overlay.scene.getObjectByName('a')!
  expect(holder.children).toContain(a)
  const want = new THREE.Vector3(1, 0, -10).applyQuaternion(camera.quaternion).add(camera.position)
  expect(holder.position.distanceTo(want)).toBeLessThan(1e-9)
  expect(holder.quaternion.angleTo(camera.quaternion)).toBeLessThan(1e-9)
  expect(holder.scale.x).toBe(2)
  // shown twice in a frame throws
  expect(() => frame(() => { u.show('a', () => a, { at: [0, 0, -10] }); u.show('a', () => a, { at: [0, 0, -10] }) })).toThrow('ui3d showed a twice in one frame')
  frame()
  expect(overlay.scene.getObjectByName('a')).toBeUndefined()
  expect(a.parent).toBeNull()
})

test('the pointer selects the thing it comes onto, the selection stays when it comes off, keys move it and Enter presses it', () => {
  const { u, frame, camera, parent } = rig()
  const things = [slab(), slab(), slab()]
  const at = [[-4, 0, -10], [0, 0, -10], [4, 0, -10]]
  const shows = () => things.forEach((t, i) => u.show(`w.${i}`, () => t, { at: at[i], select: true }))
  frame(shows)
  // the first thing is selected first
  expect(u.selected()).toBe('w.0')
  // the pointer onto the third: it is selected the next frame, and the cursor is the pointer's
  fire('pointermove', onScreen(camera, at[2]))
  frame(shows)
  expect(u.selected()).toBe('w.2')
  expect(parent.style.cursor).toBe('pointer')
  // off every thing: the selection stays
  fire('pointermove', onScreen(camera, [0, 3, -10]))
  frame(shows)
  expect(u.selected()).toBe('w.2')
  expect(parent.style.cursor).toBe('')
  // the keys move it one along, stopping at either end, and their default is cancelled
  expect(press('ArrowLeft')).toBe(true)
  frame(shows)
  expect(u.selected()).toBe('w.1')
  press('ArrowUp')
  press('ArrowLeft')
  frame(shows)
  expect(u.selected()).toBe('w.0')
  press('ArrowRight')
  frame(shows)
  expect(u.selected()).toBe('w.1')
  // the pointer resting on a thing does not take the selection back from a key
  fire('pointermove', onScreen(camera, at[1]))
  frame(shows)
  press('ArrowRight')
  frame(shows)
  frame(shows)
  expect(u.selected()).toBe('w.2')
  // Enter presses the selected thing, for that frame alone
  press('Enter')
  frame(shows)
  expect(u.pressed()).toBe('w.2')
  frame(shows)
  expect(u.pressed()).toBeUndefined()
})

test('a press and a release of the pointer over one thing press it; over two, or nothing, press nothing', () => {
  const { u, frame, camera } = rig()
  const things = [slab(), slab()]
  const at = [[-3, 0, -10], [3, 0, -10]]
  const shows = () => things.forEach((t, i) => u.show(`w.${i}`, () => t, { at: at[i], select: true }))
  frame(shows)
  fire('pointerdown', onScreen(camera, at[1]))
  fire('pointerup', onScreen(camera, at[1]))
  frame(shows)
  expect(u.pressed()).toBe('w.1')
  expect(u.selected()).toBe('w.1')
  fire('pointerdown', onScreen(camera, at[0]))
  fire('pointerup', onScreen(camera, at[1]))
  frame(shows)
  expect(u.pressed()).toBeUndefined()
  fire('pointerdown', onScreen(camera, [0, 4, -10]))
  fire('pointerup', onScreen(camera, [0, 4, -10]))
  frame(shows)
  expect(u.pressed()).toBeUndefined()
})

test('the hit box moves with the holder and keeps its size when grow sizes the object; a hidden thing is never hit', () => {
  const { u, frame, camera, parent } = rig()
  const t = slab(2)
  const other = slab(2)
  let hidden = false
  const shows = () => {
    u.show('t', () => t, { at: [0, 0, -10], select: true, grow: { scale: 3 } })
    u.show('o', () => other, { at: [0, -3, -10], select: true })
    other.visible = !hidden
  }
  // the selected thing grows to three times its size
  frame(shows)
  expect(u.selected()).toBe('t')
  expect(t.scale.x).toBe(3)
  // 2.5 m right of its middle is on the grown word and outside its two-metre box: nothing is hit
  fire('pointermove', onScreen(camera, [2.5, 0, -10]))
  frame(shows)
  expect(parent.style.cursor).toBe('')
  fire('pointermove', onScreen(camera, [0.8, 0, -10]))
  frame(shows)
  expect(parent.style.cursor).toBe('pointer')
  // the other thing hidden: the pointer over it hits nothing, and the selection stays
  hidden = true
  frame(shows)
  fire('pointermove', onScreen(camera, [0, -3, -10]))
  frame(shows)
  expect(u.selected()).toBe('t')
  expect(parent.style.cursor).toBe('')
  // drawn again under the resting pointer: it is hit, and selected
  hidden = false
  frame(shows)
  frame(shows)
  expect(u.selected()).toBe('o')
})

test('glow and dim change the materials for the frame, and the game\'s own colours stand the frame after', () => {
  const { u, frame, p } = rig()
  const a = slab(), b = slab()
  const look =(at: number[]): Look => ({ at, select: true, glow: { colour: '#ff0000', power: 0.5, materials: ['face'] }, dim: { by: 0.5 } })
  const shows = () => {
    u.show('a', () => a, look([-3, 0, -10]))
    u.show('b', () => b, look([3, 0, -10]))
  }
  frame(shows)
  const grey = new THREE.Color('#808080').r
  // a is selected: it glows, b is dimmed
  expect(a.material.emissive.r).toBeCloseTo(0.5, 6)
  expect(a.material.color.r).toBeCloseTo(grey, 6)
  expect(b.material.emissive.r).toBe(0)
  expect(b.material.color.r).toBeCloseTo(grey * 0.5, 6)
  // the next tick puts them back as they were before the words ran
  p.ui3d.tick(p)
  expect(a.material.emissive.r).toBe(0)
  expect(b.material.color.r).toBeCloseTo(grey, 6)
  // the game sets b's colour itself: its own colour, dimmed, and the frame after its own again
  b.material.color.set('#ffffff')
  shows()
  p.ui3d.afterTick(p)
  expect(b.material.color.r).toBeCloseTo(0.5, 6)
  p.ui3d.tick(p)
  expect(b.material.color.r).toBe(1)
  // nothing can be selected: no word glows or dims
  frame(() => {
    u.show('a', () => a, { ...look([-3, 0, -10]), select: false })
    u.show('b', () => b, { ...look([3, 0, -10]), select: false })
  })
  expect(u.selected()).toBeUndefined()
  expect(a.material.emissive.r).toBe(0)
  expect(b.material.color.r).toBe(1)
})

test('a look by name is the looks file\'s, its thing a copy of its model with materials of its own, shown once the file and the model have landed', () => {
  const { u, frame, p, overlay } = rig({ ui3d: { overlay: [0.1, 200], keys: KEYS, looks: 'looks' } })
  const file: Record<string, unknown> = { title: { model: 'name', at: [0, 1, -10], scale: 2 }, bare: { at: [0, 0, -10] } }
  const model = slab()
  const landed = new Set<string>()
  const asked: string[] = []
  p.loader = {
    ready: (n: string) => landed.has(n),
    load: (n: string) => { asked.push(n); return Promise.resolve() },
    get: (n: string) => (n === 'looks' ? file : undefined),
    model: (n: string) => { expect(n).toBe('name'); return { scene: model.clone() } },
  }
  // neither landed: nothing is shown, and the loader is asked for the file
  frame(() => expect(u.show('t', 'title')).toBeUndefined())
  expect(asked).toEqual(['looks'])
  expect(u.look('title')).toBeUndefined()
  // the file landed, the model not: asked for the model
  landed.add('looks')
  frame(() => expect(u.show('t', 'title')).toBeUndefined())
  expect(asked).toEqual(['looks', 'looks', 'name'])
  expect(u.look('title')).toBe(file.title)
  // both landed: shown where the look places it, with materials of its own
  landed.add('name')
  let shown: THREE.Object3D | undefined
  frame(() => { shown = u.show('t', 'title') })
  const holder = overlay.scene.getObjectByName('t')!
  expect(holder.children).toEqual([shown])
  expect(holder.scale.x).toBe(2)
  expect((shown as THREE.Mesh).material).not.toBe(model.material)
  // the file written: the look as it now is, from the next frame
  file.title = { model: 'name', at: [0, 1, -10], scale: 3 }
  frame(() => u.show('t', 'title'))
  expect(holder.scale.x).toBe(3)
  // a game's own thing shown in a look of the file
  const own = slab()
  frame(() => u.show('o', () => own, 'bare'))
  expect(overlay.scene.getObjectByName('o')!.children).toEqual([own])
  // a name the file has none of, and a look with no model shown by name, throw
  expect(() => frame(() => u.show('x', 'nope'))).toThrow("ui3d's looks file looks has no look nope: its looks are title, bare")
  expect(() => frame(() => u.show('x', 'bare'))).toThrow('ui3d shows x as the look bare, which gives no model')
})

test('a look asked for by name in a scene with no world.ui3d.looks throws', () => {
  const { u, frame } = rig()
  expect(() => frame(() => u.show('t', 'title'))).toThrow('ui3d is asked for a look by name, and the scene gives no world.ui3d.looks')
})

test('a word nothing delivers throws, naming the thing and the word', () => {
  const { u, frame } = rig()
  expect(() => frame(() => u.show('a', () => slab(), { at: [0, 0, -10], wobble: {} }))).toThrow('ui3d has no behavior for a, of the word wobble: no plugin world.ui3d.mods.behaviors names delivers it')
})

test('ui3d listed after render3d throws', () => {
  const { u, frame } = rig({}, ['render3d', 'ui3d'])
  expect(() => frame(() => u.show('a', () => slab(), { at: [0, 0, -10] }))).toThrow('ui3d is listed after render3d')
})
