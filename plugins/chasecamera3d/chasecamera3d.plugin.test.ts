// chasecamera3d on scenes this test writes. The camera law on a render3d with no canvas, handed the
// rows the test writes, with the plugins ticked in the scene's order as a client ticks them: where the
// eye is and what it looks at for a spread of looks, the pivot a look's `side` moves right, the claim,
// the frames it leaves the camera alone and the order it must be listed in. Then a scene booted under a manager, with a page on it through
// the loopback as `index.html` has, whose body walks at a constant speed and whose actor calls
// `follow` in its setup: the camera render3d draws with on the first frame, and on every frame after.
// Node has no WebGL, so that page's renderer is a stand-in for three's WebGLRenderer that keeps where
// the camera stood and looked each time it was asked to draw.
import { afterAll, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, scene as child, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { chasecamera3d, type Followed } from './chasecamera3d.plugin.ts'

type Drawn = { pos: number[]; dir: number[] }
const gpu = vi.hoisted(() => ({ drawn: [] as { pos: number[]; dir: number[] }[] }))

vi.mock('three', async importOriginal => {
  const three = await importOriginal<typeof import('three')>()
  class WebGLRenderer {
    shadowMap = { enabled: false, type: three.PCFShadowMap as number }
    setSize() {}
    setPixelRatio() {}
    render(_scene: unknown, camera: THREE.Camera) {
      gpu.drawn.push({ pos: camera.getWorldPosition(new three.Vector3()).toArray(), dir: camera.getWorldDirection(new three.Vector3()).toArray() })
    }
    dispose() {}
    forceContextLoss() {}
  }
  return { ...three, WebGLRenderer }
})

const W = 640, H = 360
// The prefab camera stands far off and looks elsewhere, so a frame drawn from it is told apart.
const CAMERA = { fov: 62, near: 0.15, far: 9000, at: [500, 400, 300], look: [0, 0, 0] }

// The camera law, written out: the pivot is `pos` raised by `lift`, and the eye is `dist` from it
// along (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch).
const law = ({ pos, lift, look: { yaw, pitch, dist } }: Followed) => {
  const pivot = [pos[0], pos[1] + lift, pos[2]]
  const off = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]
  return { pivot, eye: pivot.map((p, i) => p + dist * off[i]) }
}
const close = (got: number[], want: number[], digits = 12) => got.forEach((g, i) => expect(g).toBeCloseTo(want[i], digits))

// A page's plugins with render3d and chasecamera3d in `order`, and the rows the test writes. `frame`
// ticks each listed plugin that exists here in the order listed, as a client does.
const page = (order = ['render3d', 'chasecamera3d'], prefab: unknown = { camera: CAMERA }) => {
  const rows: Row[] = []
  const chase = chasecamera3d()
  const plugins: any = {
    wire: { scene: { plugins: order, prefabs: { engine: { width: W, height: H }, ...(prefab ? { render3d: prefab } : {}) } }, rows },
    chasecamera3d: chase,
    ...(order.includes('render3d') ? { render3d: render3d() } : {}),
  }
  const frame = () => { for (const name of order) plugins[name]?.tick?.(plugins) }
  const body = (data: Followed, id = 7) => {
    rows.splice(0, rows.length, { id, kind: 'body', data })
    return rows[0]
  }
  return { plugins, chase, frame, body, camera: () => plugins.render3d.camera as THREE.PerspectiveCamera }
}

// ---------------------------------------------------------------- the law

test('the eye and the point it looks at are the camera law of the row, at every yaw, pitch and distance, with world up', () => {
  const { chase, frame, body, camera } = page()
  frame()
  chase.follow(7)
  const yaws = [0, 0.9, Math.PI / 2, -2.4, Math.PI, 5.1]
  const pitches = [-0.4, 0, 0.35, 1.2]
  const dists = [0.5, 6, 40]
  let n = 0
  for (const yaw of yaws) for (const pitch of pitches) for (const dist of dists) {
    const data: Followed = { pos: [12.5 - n, 3.25 + n / 7, -40 + 2 * n], lift: 1.1 + n / 50, look: { yaw, pitch, dist } }
    body(data)
    // Something else turned the camera's up away since the last frame.
    camera().up.set(0.4, 0.3, 0.87)
    frame()
    const { pivot, eye } = law(data)
    close(camera().position.toArray(), eye)
    const seen = chase.eye()
    close(seen.pos, eye)
    // The camera looks straight at the pivot: its −z is the unit line from the eye to the pivot.
    close(seen.dir, pivot.map((p, i) => (p - eye[i]) / dist))
    // With world up there is no roll: the camera's right is level, and its up leans no way down.
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera().quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera().quaternion)
    expect(right.y).toBeCloseTo(0, 12)
    expect(up.y).toBeGreaterThan(0)
    n++
  }
})

test('look.side moves the pivot side metres to the right of the way yaw looks, the camera\'s own right, and the eye with it', () => {
  const { chase, frame, body, camera } = page()
  frame()
  chase.follow(7)
  let n = 0
  for (const yaw of [0, 0.9, Math.PI / 2, -2.4, Math.PI]) for (const pitch of [-0.3, 0, 0.6]) for (const side of [0.6, -0.45, 2]) {
    const look = { yaw, pitch, dist: 4 + n / 10 }
    const plain: Followed = { pos: [3 - n, 1.5, 2 * n], lift: 1.4, look }
    body({ ...plain, look: { ...look, side } })
    frame()
    const { pivot, eye } = law(plain)
    const right = [-Math.cos(yaw), 0, Math.sin(yaw)]
    const moved = pivot.map((p, i) => p + side * right[i])
    close(camera().position.toArray(), eye.map((e, i) => e + side * right[i]))
    close(chase.eye().dir, moved.map((p, i) => (p - camera().position.getComponent(i)) / look.dist))
    // Right of the view: the camera's right is the way the pivot moved.
    close(new THREE.Vector3(1, 0, 0).applyQuaternion(camera().quaternion).toArray(), right)
    n++
  }
})

test('a row with no side is placed as one with side 0', () => {
  const { chase, frame, body, camera } = page()
  frame()
  chase.follow(7)
  const look = { yaw: 1.1, pitch: 0.25, dist: 5 }
  body({ pos: [4, 2, -6], lift: 1.6, look })
  frame()
  const without = [camera().position.toArray(), camera().quaternion.toArray()]
  close(without[0], law({ pos: [4, 2, -6], lift: 1.6, look }).eye)
  body({ pos: [4, 2, -6], lift: 1.6, look: { ...look, side: 0 } })
  camera().position.set(0, 0, 0)
  frame()
  expect([camera().position.toArray(), camera().quaternion.toArray()]).toEqual(without)
})

test('eye() is where render3d\'s camera stands and its world −z, whoever placed it, and throws before the first tick', () => {
  const { chase, frame, camera } = page()
  expect(() => chase.eye()).toThrow('chasecamera3d has no camera to read')
  frame()
  close(chase.eye().pos, CAMERA.at)
  camera().position.set(1, 2, 3)
  camera().lookAt(1, 2, 13)
  close(chase.eye().pos, [1, 2, 3])
  close(chase.eye().dir, [0, 0, 1])
})

// ---------------------------------------------------------------- when it places nothing

test('it places nothing before `follow`, or on a frame whose rows lack the followed row', () => {
  const { chase, frame, body, camera } = page()
  const data: Followed = { pos: [4, 0, 4], lift: 1.5, look: { yaw: 0.3, pitch: 0.2, dist: 5 } }
  body(data)
  frame()
  frame()
  close(camera().position.toArray(), CAMERA.at)
  chase.follow(8)
  frame()
  close(camera().position.toArray(), CAMERA.at)
  chase.follow(7)
  frame()
  close(camera().position.toArray(), law(data).eye)
})

test('it stays still while another owner holds the claim, and is back on the row the frame they let go', () => {
  const { plugins, chase, frame, body, camera } = page()
  chase.follow(7)
  const at = (x: number): Followed => ({ pos: [x, 2, -x], lift: 1.6, look: { yaw: 1, pitch: 0.25, dist: 7 } })
  body(at(0))
  frame()
  close(camera().position.toArray(), law(at(0)).eye)
  const cutscene = {}
  expect(plugins.render3d.claim(cutscene)).toBe(true)
  // The cutscene places its shot; chasecamera3d leaves it where it is while the row walks on.
  camera().position.set(-9, 30, 11)
  camera().lookAt(0, 0, 0)
  const held = [camera().position.toArray(), camera().quaternion.toArray()]
  for (const x of [1, 2, 3]) {
    body(at(x))
    frame()
    expect([camera().position.toArray(), camera().quaternion.toArray()]).toEqual(held)
  }
  plugins.render3d.release(cutscene)
  body(at(4))
  frame()
  close(camera().position.toArray(), law(at(4)).eye)
})

// ---------------------------------------------------------------- the order

test('its tick throws when it is listed before render3d, or with no render3d camera', () => {
  const run = (order: string[], prefab?: unknown) => () => page(order, prefab === undefined ? { camera: CAMERA } : prefab).frame()
  expect(run(['chasecamera3d', 'render3d'])).toThrow('chasecamera3d is listed before render3d')
  expect(run(['chasecamera3d'])).toThrow('the scene does not list render3d')
  expect(run(['render3d', 'chasecamera3d'], null)).toThrow('the scene gives no render3d prefab')
  expect(run(['render3d', 'chasecamera3d'])).not.toThrow()
})

// ---------------------------------------------------------------- a booted scene

// One scene under a manager: a body whose rule walks it at `vel` metres a second, and whose actor
// follows it from its setup, as a game's player actor does. The page's plugins are the scene's.
const DT = 1 / 60
const body: Followed & { vel: number[] } = { pos: [3, 1, -2], vel: [4, -0.5, -1.5], lift: 1.6, look: { yaw: 0.7, pitch: 0.3, dist: 6 } }
const field: Scene = {
  world: {},
  plugins: ['scenemanager', 'render3d', 'chasecamera3d'],
  seats: 1,
  prefabs: { engine: { dt: DT, width: W, height: H }, scenemanager: { out: {} }, render3d: { camera: CAMERA }, body },
  actors: [{ is: 'scenemanager' }, { is: 'body' }],
}
const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { field: { file: 'field.scene.json', suspend: false } }, dt: DT, entry: 'field', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const dir = mkdtempSync(join(tmpdir(), 'chasecamera3d-'))
afterAll(() => rmSync(dir, { recursive: true }))
writeFileSync(join(dir, 'field.scene.json'), JSON.stringify(field))
writeFileSync(join(dir, 'field.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './field.scene.json' with { type: 'json' }
export const sim = {
  scenemanager,
  body: { tick(me, dt) { me.data.pos = me.data.pos.map((p, i) => p + me.data.vel[i] * dt) } },
}
export const scene = file
`)
writeFileSync(join(dir, 'body.client.ts'), `export function setup(row, plugins) { plugins.chasecamera3d.follow(row.id) }
export function tick() {}
export function remove() {}
`)

const booted = async () => {
  const home = pathToFileURL(dir + '/').href
  const truth = boot(structuredClone(top), { scenemanager })
  await load(truth, home)
  const canvas = { style: {} as Record<string, string>, remove() {} }
  const tab = view(link(loopback(accept(manager(truth)))), top, home, me => me.plugins.render3d.mount(canvas))
  gpu.drawn.length = 0
  // One step of the truth, then the page's frame; what the frame drew, and the body as its rows hold it.
  const frame = async (): Promise<{ drawn: Drawn; body: Followed }> => {
    truth.step(DT)
    await tab.frame()
    return { drawn: gpu.drawn[gpu.drawn.length - 1], body: tab.client!.rows.find(r => r.kind === 'body')!.data as Followed }
  }
  return { truth, tab, frame, server: () => child(manager(truth), 'field') }
}

test('frame 1, the one render3d makes its prefab camera on, is drawn by the camera law', async () => {
  const { frame } = await booted()
  const first = await frame()
  expect(gpu.drawn).toHaveLength(1)
  const { pivot, eye } = law(first.body)
  close(first.drawn.pos, eye)
  close(first.drawn.dir, pivot.map((p, i) => (p - eye[i]) / body.look.dist))
})

test('a body walking at a constant speed moves the camera by exactly the body\'s step each step', async () => {
  const { frame, server } = await booted()
  let last = await frame()
  for (let k = 0; k < 120; k++) {
    const now = await frame()
    const step = now.body.pos.map((p, i) => p - last.body.pos[i])
    close(step, body.vel.map(v => v * DT), 9)
    close(now.drawn.pos.map((p, i) => p - last.drawn.pos[i]), step, 9)
    close(now.drawn.dir, last.drawn.dir, 12)
    close(now.drawn.pos, law(now.body).eye)
    last = now
  }
  // The page drew the rows the server has.
  expect(last.body.pos).toEqual(server().rows.find(r => r.kind === 'body')!.data.pos)
})
