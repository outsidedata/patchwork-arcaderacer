// render3d's stage, on a client this test puts together from render3d and a plugin of its own and
// draws into a test stage, with no game view. A module the test runner imports keeps no `?row=` in
// its call stack, so what an actor draws is picked here on drawings this test adds as an actor would.
import { render, screen, within } from '@testing-library/react'
import * as THREE from 'three'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { drawn } from '#editor/drawn.ts'
import { editor, stage } from '#editor/test/editor.ts'
import type { Plugins } from '#engine/browser.ts'
import { render3d as extension } from './render3d.extension.tsx'
import { Shadows, Tone } from './render3d.components.tsx'
import { render3d, shadowings, tones } from './render3d.plugin.ts'
import { eye, near } from './render3d.extension.harness.ts'

let undo = () => {}
beforeEach(() => { undo = drawn() })
afterEach(() => undo())

// A client of render3d, of `painter`, a plugin listed first that notes where the camera is when its
// `afterTick` runs, and of `mover`, listed between them, with the stage the extension makes for it.
async function made() {
  const { ed } = await editor()
  ed.use('render3d', extension)
  const r = render3d()
  const seen: number[][] = []
  const painter = { afterTick() { seen.push(r.camera!.position.toArray()) } }
  // A plugin between the first afterTick and render3d's that moves the camera while `moves` is on.
  const mover = { moves: false, afterTick() { if (mover.moves) r.camera!.position.set(9, 9, 9) } }
  const scene = { plugins: ['painter', 'mover', 'render3d'], prefabs: { engine: { width: 200, height: 100 }, render3d: { camera: { fov: 60, near: 0.1, far: 500, at: [0, 5, 10], look: [0, 0, 0] } } } }
  const plugins = { wire: { rows: [], scene }, painter, mover, render3d: r } as unknown as Plugins
  const canvas = stage().appendChild(document.createElement('canvas'))
  canvas.width = 200
  canvas.height = 100
  r.mount(canvas)
  const st = ed.providers[0].provider(plugins)!
  // One frame as the client runs it: the plugins' ticks, an actor that places the camera, then the
  // plugins' afterTicks in order.
  const frame = () => {
    r.tick(plugins)
    r.camera!.position.set(3, 1, 3)
    r.camera!.lookAt(0, 0, 0)
    painter.afterTick()
    mover.afterTick()
    r.afterTick()
  }
  return { ed, r, st, frame, seen, plugins, mover }
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the orbit takes the camera no earlier than render3d\'s first tick, places it before the first afterTick and before the draw, and Play gives it back where it took it', async () => {
  const { r, st, frame, seen, mover } = await made()
  st.orbit!.drive(true)
  expect(r.claimed()).toBeUndefined()
  frame()
  expect(r.claimed()).toEqual({ editor: 'orbit' })
  const pose = st.orbit!.pose()!
  // It starts from the view the camera had, the actor's: with nothing drawn in the middle of it, it
  // turns about a point 10 ahead.
  near(eye(pose), [3, 1, 3])
  expect(pose.dist).toBe(10)
  near(pose.pivot, new THREE.Vector3(-3, -1, -3).normalize().multiplyScalar(10).add(new THREE.Vector3(3, 1, 3)).toArray())
  st.orbit!.turn(40, -20)
  mover.moves = true
  frame()
  mover.moves = false
  const now = eye(st.orbit!.pose()!)
  near(seen.at(-1)!, now)
  near(r.camera!.position.toArray(), now)
  // The camera looks at the pivot, its up +y.
  const dir = r.camera!.getWorldDirection(new THREE.Vector3())
  near(dir.toArray(), new THREE.Vector3().fromArray(st.orbit!.pose()!.pivot).sub(r.camera!.position).normalize().toArray())
  st.orbit!.drive(false)
  expect(r.claimed()).toBeUndefined()
  near(r.camera!.position.toArray(), [3, 1, 3])
  frame()
  near(seen.at(-1)!, [3, 1, 3])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the orbit\'s first pivot is the first thing drawn in the middle of the view: the ground far above y = 0, the wall down a corridor', async () => {
  // Land at y = 500 under a camera 100 above it looking down at 45 degrees.
  const high = await made()
  const land = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2))
  land.position.y = 500
  high.r.scene.add(land)
  high.r.tick(high.plugins)
  const drop = () => { high.r.camera!.position.set(0, 600, 100); high.r.camera!.lookAt(0, 500, 0) }
  high.frame = () => { drop(); high.plugins.painter.afterTick(); high.r.afterTick() }
  drop()
  high.st.orbit!.drive(true)
  high.frame()
  const up = high.st.orbit!.pose()!
  near(up.pivot, [0, 500, 0])
  expect(up.dist).toBeCloseTo(Math.hypot(100, 100), 6)
  // A corridor: walls either side and one across it, the camera looking along it at eye height.
  const hall = await made()
  for (const [x, z, w, d] of [[-2, -10, 0.2, 30], [2, -10, 0.2, 30], [0, -7, 4, 0.2]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 4, d))
    wall.position.set(x, 2, z + (d === 0.2 ? 0.1 : 0))
    hall.r.scene.add(wall)
  }
  hall.r.tick(hall.plugins)
  const gaze = () => { hall.r.camera!.position.set(0, 1.6, 0); hall.r.camera!.lookAt(0, 1.6, -1) }
  hall.frame = () => { gaze(); hall.plugins.painter.afterTick(); hall.r.afterTick() }
  gaze()
  hall.st.orbit!.drive(true)
  hall.frame()
  const down = hall.st.orbit!.pose()!
  // The wall across is 0.2 thick, its near face 6.8 ahead.
  near(down.pivot, [0, 1.6, -6.8])
  expect(down.dist).toBeCloseTo(6.8, 6)
  // A sky dome about the camera, drawn behind everything and writing no depth, and a wall past the
  // camera's far: neither is a place to turn about, so the point ahead is.
  const sky = await made()
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 8), new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false }))
  const far = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 1))
  far.position.set(0, 1.6, -600)
  sky.r.scene.add(dome, far)
  sky.r.tick(sky.plugins)
  const level = () => { sky.r.camera!.position.set(0, 1.6, 0); sky.r.camera!.lookAt(0, 1.6, -1) }
  sky.frame = () => { level(); sky.plugins.painter.afterTick(); sky.r.afterTick() }
  level()
  sky.st.orbit!.drive(true)
  sky.frame()
  expect(sky.st.orbit!.pose()!.dist).toBe(10)
  near(sky.st.orbit!.pose()!.pivot, [0, 1.6, -10])
  // Nothing drawn and a camera whose near is far: the point ahead is four times `near` away.
  const bare = await made()
  bare.r.tick(bare.plugins)
  bare.r.camera!.near = 5
  bare.st.orbit!.drive(true)
  bare.frame()
  expect(bare.st.orbit!.pose()!.dist).toBe(20)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('driven, the orbit takes the camera from whoever holds it at once, and let go it leaves the camera free for them to claim again', async () => {
  const { r, st, frame } = await made()
  frame()
  r.claim('cutscene')
  st.orbit!.put({ pivot: [1, 0, 1], yaw: 0, pitch: 0.5, dist: 10 })
  st.orbit!.drive(true)
  expect(r.claimed()).toEqual({ editor: 'orbit' })
  expect(r.claim('cutscene')).toBe(false)
  frame()
  expect(r.claimed()).toEqual({ editor: 'orbit' })
  near(r.camera!.position.toArray(), [1, 10 * Math.sin(0.5), 1 - 10 * Math.cos(0.5)])
  st.orbit!.drive(false)
  expect(r.claimed()).toBeUndefined()
  expect(r.claim('cutscene')).toBe(true)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('turning, panning, zooming and framing move the pose, and the camera sits on it rigidly', async () => {
  const { r, st, frame } = await made()
  st.orbit!.put({ pivot: [1, 0, 1], yaw: 0, pitch: 0.5, dist: 10 })
  st.orbit!.drive(true)
  frame()
  near(r.camera!.position.toArray(), eye({ pivot: [1, 0, 1], yaw: 0, pitch: 0.5, dist: 10 }))
  st.orbit!.turn(100, 0)
  expect(st.orbit!.pose()!.yaw).toBeCloseTo(-0.5)
  st.orbit!.turn(0, 1e6)
  expect(st.orbit!.pose()!.pitch).toBeLessThan(Math.PI / 2)
  st.orbit!.zoom(-1000)
  expect(st.orbit!.pose()!.dist).toBeLessThan(10)
  const before = st.orbit!.pose()!.pivot
  st.orbit!.pan(50, 0)
  // Dragging right moves the pivot to the camera's left.
  const right = new THREE.Vector3().setFromMatrixColumn(r.camera!.matrixWorld, 0)
  expect(new THREE.Vector3().fromArray(st.orbit!.pose()!.pivot).sub(new THREE.Vector3().fromArray(before)).dot(right)).toBeLessThan(0)
  near(r.camera!.position.toArray(), eye(st.orbit!.pose()!))
  // Framing a row looks at the middle of what it draws.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1))
  ball.position.set(20, 2, -4)
  new Function('f', 'f()\n//# sourceURL=http://localhost/games/fake/ball.client.ts?row=7')(() => r.scene.add(ball))
  r.scene.updateMatrixWorld()
  st.orbit!.frame(7)
  near(st.orbit!.pose()!.pivot, [20, 2, -4])
  frame()
  const b = st.bounds(7)!
  expect(b[0] + b[2] / 2).toBeCloseTo(100, 0)
  expect(b[1] + b[3] / 2).toBeCloseTo(50, 0)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the overlay is drawn after the game, over it, with no clear and no tone mapping, and is never picked', async () => {
  const { r, st, frame } = await made()
  const draws: { scene: THREE.Object3D; autoClear: boolean; tone: THREE.ToneMapping }[] = []
  frame()
  const renderer = r.renderer!
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const render = renderer.render.bind(renderer)
  renderer.render = (scene, camera) => { draws.push({ scene, autoClear: renderer.autoClear, tone: renderer.toneMapping }); render(scene, camera) }
  frame()
  // Nothing in the overlay: nothing more is drawn.
  expect(draws.map(d => d.scene)).toEqual([r.scene])
  const overlay = st.overlay as THREE.Scene
  expect(overlay).toBeInstanceOf(THREE.Scene)
  const ring = new THREE.Mesh(new THREE.SphereGeometry(100))
  overlay.add(ring)
  draws.length = 0
  frame()
  expect(draws.map(d => [d.scene === r.scene ? 'game' : d.scene === overlay ? 'overlay' : '?', d.autoClear, d.tone])).toEqual([
    ['game', true, THREE.ACESFilmicToneMapping],
    ['overlay', false, THREE.NoToneMapping],
  ])
  expect(renderer.autoClear).toBe(true)
  expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
  // A ball the overlay's sphere is around is what a press at the middle picks, with the point hit.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1))
  new Function('f', 'f()\n//# sourceURL=http://localhost/games/fake/ball.client.ts?row=3')(() => r.scene.add(ball))
  r.scene.updateMatrixWorld()
  st.orbit!.put({ pivot: [0, 0, 0], yaw: 0, pitch: 0, dist: 10 })
  st.orbit!.drive(true)
  frame()
  const hit = st.pick(100, 50)!
  expect(hit.id).toBe(3)
  near(hit.point, [0, 0, -1])
  expect(st.pick(2, 2)).toBeUndefined()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('ray, ground and plane are the line through a canvas point and where it meets a level; render3d\'s placer moves `pos` in every scene that names render3d', async () => {
  const { ed, st, frame } = await made()
  st.orbit!.put({ pivot: [0, 0, 0], yaw: 0, pitch: Math.PI / 4, dist: Math.SQRT2 * 10 })
  st.orbit!.drive(true)
  frame()
  const ray = st.ray(100, 50)!
  near(ray.origin, [0, 10, -10])
  near(ray.dir, [0, -Math.SQRT1_2, Math.SQRT1_2])
  near(st.ground(100, 50)!, [0, 0, 0])
  near(st.plane(100, 50, [7, 2, 7])!, [0, 2, -2])
  const placer = ed.drawnPlacers.find(p => p.renderer === 'render3d')!.placer
  expect(placer.axes).toEqual(['x', 'y', 'z'])
  expect(placer.at({ pos: [1, 2, 3] })).toEqual([1, 2, 3])
  expect(placer.at({ pos: [1, 2] })).toBeUndefined()
  expect(placer.to({ pos: [1, 2, 3] }, [4, 5, 6])).toEqual({ pos: [4, 5, 6] })
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the fov is a slider from 10 to 120, the background a colour, tone and shadows selects', async () => {
  const { ed } = await made()
  expect(['camera.fov', 'background', 'tone', 'shadows'].map(k => ed.typeOf('render3d', k.split('.')))).toEqual(['render3d.fov', 'color', 'render3d.tone', 'render3d.shadows'])
  expect(['render3d.fov', 'render3d.tone', 'render3d.shadows'].every(t => ed.fields.has(t))).toBe(true)
  const Fov = ed.fields.get('render3d.fov')!.component
  render(<Fov value={50} onChange={() => {}} at={[]} owner={{}} label="fov" />)
  const slider = screen.getByRole('slider', { name: 'fov' })
  expect([slider.getAttribute('min'), slider.getAttribute('max'), slider.getAttribute('step')]).toEqual(['10', '120', '1'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the tone and shadows selects offer the values render3d takes, as the plugin lists them', () => {
  render(<><Tone value="aces" onChange={() => {}} at={[]} owner={{}} label="tone" /><Shadows value="soft" onChange={() => {}} at={[]} owner={{}} label="shadows" /></>)
  const options = (name: string) => within(screen.getByRole('combobox', { name })).getAllByRole('option').map(o => o.textContent)
  expect(options('tone')).toEqual(tones)
  expect(options('shadows')).toEqual(shadowings)
  expect(shadowings).toEqual(['soft', 'hard', 'none'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a mark is a line and a dot on each world point in the overlay, a point of two numbers on the ground, until it is taken away', async () => {
  const { st } = await made()
  const overlay = st.overlay as THREE.Scene
  const off = st.mark([[0, 0], [1, 2, 3]], 0x00ff00)
  const [line, dots] = overlay.children as [THREE.Line, THREE.Points]
  expect([line, dots].map(o => o.type)).toEqual(['Line', 'Points'])
  expect([...line.geometry.getAttribute('position').array]).toEqual([0, 0, 0, 1, 2, 3])
  expect((line.material as THREE.LineBasicMaterial).color.getHex()).toBe(0x00ff00)
  off()
  expect(overlay.children).toEqual([])
  off()
})
