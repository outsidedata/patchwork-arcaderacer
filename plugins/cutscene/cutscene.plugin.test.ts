// The browser half of the cutscene on a scene this test writes and boots: a loader holding the cue
// file, the cutscene row, a mark and two rows of a `body` kind that moves and turns at a rate and
// honours the cast contract. Each frame the page is handed a copy of the truth's rows, as a packet
// carries them, and ticks its plugins in the scene's order as a client does: render3d with no canvas,
// the cutscene, chasecamera3d following the hero, and ui with no page. The camera is read off
// render3d, and the pose is worked out again here through three's own lookAt, slerp and smoothstep of
// the rows the page was handed. The scene is level at height 0, naming no `land`, but in the test of
// the ground, whose page reads the `world` of a scene the scenemanager loads, `stage`, which names
// terrain3d's `land` in `world.cutscene.mods`, so `prepare` has loaded that mod; the page is handed a
// terrain3d of its own whose `ground` the mod hands on.
import { afterAll, afterEach, expect, test } from 'vitest'
import * as THREE from 'three'
import type * as PIXI from 'pixi.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Kind, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { land } from '#plugins/terrain3d/terrain3d.cutscene.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { chasecamera3d } from '#plugins/chasecamera3d/chasecamera3d.plugin.ts'
import { ui } from '#plugins/ui/ui.plugin.ts'
import { cutscene as sim, level, mark } from './cutscene.sim.ts'
import { cutscene } from './cutscene.plugin.ts'

const DT = 1 / 60
const W = 640, H = 360
const CAMERA = { fov: 62, near: 0.15, far: 9000, at: [500, 400, 300], look: [0, 0, 0] }
const TREMOR = [[1, 31], [0.6, 47], [0.3, 23]]
const UI = {
  panels: {
    'cutscene.top': { anchor: 'top', size: [W, 60] },
    'cutscene.bottom': { anchor: 'bottom', size: [W, 60] },
    'cutscene.veil': { anchor: 'center', size: [W, H], layer: 1 },
    'cutscene.line': { anchor: 'bottom', at: [0, -70], size: [W, 40], layer: 2 },
  },
  styles: { 'cutscene.bars': { color: 0 }, 'cutscene.veil': { color: 1052688 }, 'cutscene.line': { fontSize: 22, fill: 16777215 } },
}

// A body moves at `vel` and turns at `spin` in its tick; its advance is that step, and its go moves
// nothing, since no seat is here.
const move = (me: Row, dt: number) => {
  me.data.pos = me.data.pos.map((p: number, i: number) => p + me.data.vel[i] * dt)
  me.data.yaw += me.data.spin * dt
}
const body: Kind = { tick: move, acts: { advance(me, _w, _s, dt: number) { move(me, dt) }, go() {} } }

const FILE = {
  end: 4, auto: true, reach: 1.4, stop: 0.2, head: 1.5, fov: 45, pace: 1.4, limit: 20,
  cast: { hero: { kind: 'body', name: 'hero' }, other: { kind: 'body', name: 'other' } },
  cues: [
    { at: 0, do: 'shot', name: 'wide', pos: [0, 12, -14], look: 'spot', over: 0 },
    { at: 0, do: 'bars', on: true, over: 1 },
    { at: 0, do: 'fade', to: 1, over: 0 },
    { at: 0.2, do: 'fade', to: 0, over: 1 },
    { at: 0.3, do: 'say', who: 'other', text: 'Rise.', for: 1 },
    { at: 0.5, do: 'shot', name: 'behind', pos: [0.5, 2, -4], look: 'other', follows: 'hero', frame: 'body', over: 2, fov: 70 },
    { at: 1, do: 'shake', over: 1, amp: 0.5 },
    { at: 3, do: 'shot', name: 'over', pos: [-1, 3, 2], look: 'hero', follows: 'other', over: 0 },
    { at: 3.2, do: 'fade', to: 1, over: 0.5 },
  ],
}
written('test/cutscene/page.json', JSON.stringify(FILE))

// The scene's `world.cutscene`.
const numbers = () => ({ script: 'script', kinds: ['body'], settle: 4, tremor: TREMOR })

const boots = (file = 'page', height = (_w: unknown, _x: number, _z: number) => 0) => {
  const scene: Scene = {
    world: { cutscene: numbers(), loader: { assets: { script: { type: 'json', url: `test/cutscene/${file}.json`, preload: true } } } },
    prefabs: {
      loader: {},
      cutscene: {},
      mark: { name: '', at: [0, 0] },
      body: { name: '', pos: [0, 0, 0], vel: [0, 0, 0], yaw: 0, spin: 0, lift: 1.6, look: { yaw: 0.4, pitch: 0.3, dist: 6 }, direct: null },
    },
    actors: [
      { is: 'loader' },
      { is: 'cutscene' },
      { is: 'mark', name: 'spot', at: [2, 0.5, 6] },
      { is: 'body', name: 'hero', pos: [1, 0, 2], vel: [0.8, 0, 1.2], yaw: 0.3, spin: 0.7 },
      { is: 'body', name: 'other', pos: [4, 0.2, 9], vel: [-0.5, 0, 0.1] },
    ],
  }
  return boot(scene, { loader, cutscene: sim(height), mark, body })
}

// A manager and its one child, `stage`, whose `world.cutscene` names terrain3d's `land`, written where
// `load` finds them; `staged()` is the child's `world` once the scenemanager has loaded it.
const TOP: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { stage: { file: 'stage.scene.json', suspend: false } }, dt: DT, entry: 'stage', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const dir = mkdtempSync(join(tmpdir(), 'cutscene-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
writeFileSync(join(dir, 'stage.scene.json'), JSON.stringify({
  world: { cutscene: { ...numbers(), mods: { land: 'terrain3d' } } },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
}))
writeFileSync(join(dir, 'stage.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './stage.scene.json' with { type: 'json' }
export const sim = { scenemanager }
export const scene = file
`)
const staged = async () => (await load(boot(structuredClone(TOP), { scenemanager }), pathToFileURL(dir + '/').href)).get('stage')!.world

// A page whose plugins are `order`, of a scene whose `world` is `world`, handed rows each frame.
const pages: { close(): void }[] = []
afterEach(() => { for (const p of pages.splice(0)) p.close() })
const page = (order = ['render3d', 'cutscene', 'chasecamera3d', 'ui'], prefabs: Record<string, unknown> = { render3d: { camera: CAMERA } }, world: Record<string, unknown> = { cutscene: numbers() }) => {
  const made: Record<string, () => any> = { render3d, cutscene, chasecamera3d, ui }
  const wire = { scene: { plugins: order, world: { ui: UI, ...world }, prefabs: { engine: { width: W, height: H }, ...prefabs } }, rows: [] as Row[] }
  const plugins: any = { wire }
  for (const name of order) if (made[name]) plugins[name] = made[name]()
  pages.push({ close: () => { for (const name of [...order].reverse()) plugins[name]?.close?.(plugins) } })
  const frame = (rows?: Row[]) => {
    if (rows) wire.rows = rows
    for (const name of order) plugins[name]?.tick?.(plugins)
    for (const name of order) plugins[name]?.afterTick?.(plugins)
  }
  return { plugins, frame, camera: () => plugins.render3d.camera as THREE.PerspectiveCamera }
}
// The truth's rows as a packet carries them.
const sent = (t: Truth) => structuredClone(t.rows)
const cs = (rows: Row[]) => rows.find(r => r.kind === 'cutscene')!.data
const named = (rows: Row[], name: string) => rows.find(r => r.data.name === name)!.data

// ---------------------------------------------------------------- the pose, worked out with three

const UP = new THREE.Vector3(0, 1, 0)
const aim = (eye: number[], at: number[]) =>
  new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...eye), new THREE.Vector3(...at), UP))
type Want = { pos: number[]; quat: THREE.Quaternion; fov: number }
// The view a shot's `to` is, from the rows.
function viewOf(to: any, rows: Row[]): Want {
  const head = (p: number[]) => [p[0], p[1] + to.head, p[2]]
  const spot = (t: any) => (Array.isArray(t) ? t : t === 'spot' ? [2, 0.5, 6] : head(named(rows, t === 'hero' ? 'hero' : 'other').pos))
  let pos: number[]
  if (to.follows) {
    const b = named(rows, to.follows === 'hero' ? 'hero' : 'other')
    const [x, y, z] = to.pos
    // The body's own axes: z its forward (sin yaw, cos yaw), x its left (cos yaw, −sin yaw), y up.
    const fwd = [Math.sin(b.yaw), 0, Math.cos(b.yaw)], left = [Math.cos(b.yaw), 0, -Math.sin(b.yaw)]
    pos = to.frame === 'body' ? b.pos.map((p: number, i: number) => p + x * left[i] + (i === 1 ? y : 0) + z * fwd[i]) : [b.pos[0] + x, b.pos[1] + y, b.pos[2] + z]
  } else pos = spot(to.pos)
  return { pos, quat: aim(pos, spot(to.look)), fov: to.fov }
}
function want(rows: Row[]): Want {
  const d = cs(rows)
  const to = viewOf(d.shot.to, rows)
  let got = to
  const k = (d.e - d.shot.at) / d.shot.over
  if (d.shot.from && k < 1) {
    const s = k * k * (3 - 2 * k), f = d.shot.from
    got = {
      pos: f.pos.map((p: number, i: number) => p + (to.pos[i] - p) * s),
      quat: new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(...f.quat), to.quat, s),
      fov: f.fov + (to.fov - f.fov) * s,
    }
  }
  const sh = d.shake, j = sh ? (d.e - sh.at) / sh.over : 1
  const shake = j < 1 ? [Math.sin(31 * d.e), 0.6 * Math.sin(47 * d.e), 0.3 * Math.sin(23 * d.e)].map(v => sh.amp * (1 - j) * v) : [0, 0, 0]
  return { ...got, pos: got.pos.map((p, i) => p + shake[i]) }
}
const close = (got: number[], w: number[], digits = 10) => got.forEach((g, i) => expect(g).toBeCloseTo(w[i], digits))
const same = (camera: THREE.PerspectiveCamera, w: Want) => {
  close(camera.position.toArray(), w.pos)
  expect(Math.abs(camera.quaternion.dot(w.quat))).toBeCloseTo(1, 10)
  expect(camera.fov).toBeCloseTo(w.fov, 10)
  // The projection was made again for the fov.
  const fresh = new THREE.PerspectiveCamera(camera.fov, W / H, CAMERA.near, CAMERA.far)
  close(camera.projectionMatrix.toArray(), fresh.projectionMatrix.toArray())
}

test('the camera is a pure function of the cutscene row and the cast rows: a cut, then a dolly on e onto a follow in the body\'s frame, with a shake', () => {
  const t = boots()
  const { frame, camera } = page()
  let dollied = 0, shook = 0
  let followed = 0
  for (let n = 0; n < 230; n++) {
    t.step(DT)
    const rows = sent(t)
    frame(rows)
    const d = cs(rows)
    same(camera(), want(rows))
    if (d.shot.from && d.e - d.shot.at < d.shot.over) dollied++
    if (d.shake && d.e - d.shake.at < d.shake.over) shook++
    if (d.shot.to.follows === 'other') followed++
  }
  expect(dollied).toBeGreaterThan(100)
  expect(shook).toBeGreaterThan(50)
  // The last shot follows the other body in the world's axes.
  expect(followed).toBeGreaterThan(40)
})

test('with terrain3d\'s land named, a point and a mark stand on its height as it is now; nothing is placed while it has no ground, and a scene that lists no terrain3d throws', async () => {
  const world = await staged()
  expect(mod(world, 'cutscene', 'land')).toBe(land)
  // The slope the server's rule and the page both stand on, raised by `lift` as a brush raises it.
  let lift = 0
  const height = (x: number, z: number) => 0.3 * x - 0.2 * z + lift
  const t = boots('page', (_w, x, z) => height(x, z))
  const { plugins, frame, camera } = page(['render3d', 'terrain3d', 'cutscene', 'chasecamera3d', 'ui'], undefined, world)
  plugins.terrain3d = { ground: undefined as undefined | { height: typeof height } }
  t.step(DT)
  // No ground yet: the shot places nothing, and the camera is render3d's prefab's.
  frame(sent(t))
  expect(camera().position.toArray()).toEqual(CAMERA.at)
  plugins.terrain3d.ground = { height }
  frame(sent(t))
  // The wide shot stands 12 m over the ground at (0, −14), looking at the mark 0.5 m over it at (2, 6).
  const eye = [0, height(0, -14) + 12, -14]
  close(camera().position.toArray(), eye)
  expect(Math.abs(camera().quaternion.dot(aim(eye, [2, height(2, 6) + 0.5, 6])))).toBeCloseTo(1, 10)
  // The ground raised 4 m: the camera rises with it.
  lift = 4
  frame(sent(t))
  expect(camera().position.y).toBeCloseTo(eye[1] + 4, 10)
  // terrain3d's land named in a scene that lists no terrain3d: the mod has no browser half to read,
  // and the scene is told so.
  const other = page(['render3d', 'cutscene', 'chasecamera3d', 'ui'], undefined, world)
  expect(() => other.frame(sent(t))).toThrow('cutscene\'s land is terrain3d\'s, which this scene does not list')
})

test('follows and look-ats are read again every frame from the rows, and a frame with the same rows draws the same camera', () => {
  const t = boots()
  const { frame, camera } = page()
  for (let n = 0; n < 200; n++) t.step(DT)
  const rows = sent(t)
  frame(rows)
  const was = camera().position.toArray()
  frame(rows)
  expect(camera().position.toArray()).toEqual(was)
  // The hero moved and turned, and nothing else changed: the camera went with it.
  const moved = structuredClone(rows)
  const hero = named(moved, 'hero')
  hero.pos = [hero.pos[0] + 1, hero.pos[1], hero.pos[2] - 2]
  hero.yaw += 0.5
  named(moved, 'other').pos[1] += 3
  frame(moved)
  expect(camera().position.toArray()).not.toEqual(was)
  same(camera(), want(moved))
  // A frame whose rows lack a member the shot names places nothing.
  const placed = camera().position.toArray()
  frame(moved.filter(r => r.data.name !== 'hero'))
  expect(camera().position.toArray()).toEqual(placed)
})

test('the first frame of a seat that arrives during a shot is drawn from the shot, over render3d\'s prefab camera', () => {
  const t = boots()
  for (let n = 0; n < 90; n++) t.step(DT)
  const { frame, camera } = page()
  frame(sent(t))
  same(camera(), want(sent(t)))
})

test('it claims the camera while a shot runs, keeps off it while another holds it, and at done gives it back with its fov to chasecamera3d the same frame', () => {
  const t = boots()
  const { plugins, frame, camera } = page()
  plugins.chasecamera3d.follow(t.rows.find(r => r.data.name === 'hero')!.id)
  // Before the scene starts nobody holds it and the chase camera places it.
  frame(sent(t))
  expect(plugins.render3d.claimed()).toBe(undefined)
  expect(camera().fov).toBe(62)
  t.step(DT)
  frame(sent(t))
  expect(plugins.render3d.claimed()).toBe(plugins.cutscene)
  expect(camera().fov).toBe(45)
  // Another driver: the cutscene lets it be.
  plugins.render3d.release(plugins.cutscene)
  plugins.render3d.claim('orbit')
  camera().position.set(7, 7, 7)
  t.step(DT)
  frame(sent(t))
  expect(camera().position.toArray()).toEqual([7, 7, 7])
  plugins.render3d.release('orbit')
  let rows = sent(t)
  while (!cs(rows).done) {
    t.step(DT)
    rows = sent(t)
    frame(rows)
    if (!cs(rows).done) expect(plugins.render3d.claimed()).toBe(plugins.cutscene)
  }
  expect(plugins.render3d.claimed()).toBe(undefined)
  expect(camera().fov).toBe(62)
  const fresh = new THREE.PerspectiveCamera(62, W / H, CAMERA.near, CAMERA.far)
  close(camera().projectionMatrix.toArray(), fresh.projectionMatrix.toArray())
  // chasecamera3d, listed after it, placed the camera on this frame: no frame is left on the shot.
  const hero = named(rows, 'hero'), look = hero.look
  const pivot = [hero.pos[0], hero.pos[1] + hero.lift, hero.pos[2]]
  close(camera().position.toArray(), [pivot[0] - look.dist * Math.sin(look.yaw) * Math.cos(look.pitch), pivot[1] + look.dist * Math.sin(look.pitch), pivot[2] - look.dist * Math.cos(look.yaw) * Math.cos(look.pitch)])
})

test('a driver that holds the camera keeps it through a shot, the shot takes it again the first free frame, and a scene ending under another driver gives its fov back once the camera is free', () => {
  const t = boots()
  const { plugins, frame, camera } = page()
  plugins.chasecamera3d.follow(t.rows.find(r => r.data.name === 'hero')!.id)
  t.step(DT)
  frame(sent(t))
  expect(plugins.render3d.claimed()).toBe(plugins.cutscene)
  // The orbit takes it, as the editor's does: from whoever holds it.
  const orbit = { editor: 'orbit' }
  plugins.render3d.release(plugins.render3d.claimed())
  plugins.render3d.claim(orbit)
  camera().position.set(7, 7, 7)
  camera().fov = 30
  for (let n = 0; n < 5; n++) {
    t.step(DT)
    frame(sent(t))
  }
  expect(plugins.render3d.claimed()).toBe(orbit)
  expect(camera().position.toArray()).toEqual([7, 7, 7])
  expect(camera().fov).toBe(30)
  // Let go: the shot's the next frame.
  plugins.render3d.release(orbit)
  t.step(DT)
  let rows = sent(t)
  frame(rows)
  expect(plugins.render3d.claimed()).toBe(plugins.cutscene)
  same(camera(), want(rows))
  // Taken again, and the scene ends under it: the fov stays the orbit's until the camera is free.
  plugins.render3d.release(plugins.cutscene)
  plugins.render3d.claim(orbit)
  camera().fov = 30
  while (!cs(rows).done) {
    t.step(DT)
    rows = sent(t)
    frame(rows)
  }
  frame(rows)
  expect(plugins.render3d.claimed()).toBe(orbit)
  expect(camera().fov).toBe(30)
  plugins.render3d.release(orbit)
  frame(rows)
  expect(plugins.render3d.claimed()).toBeUndefined()
  expect(camera().fov).toBe(62)
})

test('a scene skipped mid-shot releases the camera on the frame it arrives done', () => {
  const t = boots()
  const { plugins, frame } = page()
  for (let n = 0; n < 30; n++) { t.step(DT); frame(sent(t)) }
  expect(plugins.render3d.claimed()).toBe(plugins.cutscene)
  t.inbox(t.open(), { seq: 1, n: t.n, id: t.rows.find(r => r.kind === 'cutscene')!.id, action: 'skip', args: [] })
  t.step(DT)
  frame(sent(t))
  expect(cs(sent(t)).done).toBe(true)
  expect(plugins.render3d.claimed()).toBe(undefined)
})

// ---------------------------------------------------------------- the panels

// What each panel shows: the Graphics or Text on it.
const on = (plugins: any, panel: string) => plugins.ui.panel(panel).children as PIXI.Container[]

test('bars, the veil and the line are ui panels drawn from the row: bars of the panel\'s height from the edge, the veil at the fade, and who: text', () => {
  const t = boots()
  const { plugins, frame } = page()
  frame(sent(t))
  for (const p of Object.keys(UI.panels)) expect(on(plugins, p), p).toHaveLength(0)
  for (let n = 0; n < 30; n++) t.step(DT)
  let rows = sent(t)
  frame(rows)
  const d = cs(rows)
  // Half a second into a one-second ramp of the bars, 0.3 s into a one-second fade from black.
  const bars = (d.e - d.bars.at) / d.bars.over, fade = 1 - (d.e - d.fade.at) / d.fade.over
  const [top] = on(plugins, 'cutscene.top') as PIXI.Graphics[], [bottom] = on(plugins, 'cutscene.bottom') as PIXI.Graphics[]
  const tb = top.getLocalBounds(), bb = bottom.getLocalBounds()
  close([tb.x, tb.y, tb.width, tb.height], [0, 0, W, bars * 60], 6)
  close([bb.x, bb.y, bb.width, bb.height], [0, 60 - bars * 60, W, bars * 60], 6)
  const [veil] = on(plugins, 'cutscene.veil') as PIXI.Graphics[]
  expect(veil.alpha).toBeCloseTo(fade, 12)
  const vb = veil.getLocalBounds()
  close([vb.x, vb.y, vb.width, vb.height], [0, 0, W, H], 6)
  const [line] = on(plugins, 'cutscene.line') as PIXI.Text[]
  expect(line.text).toBe('other: Rise.')
  close([line.x, line.y, line.anchor.x, line.anchor.y], [W / 2, 20, 0.5, 0.5])
  expect(line.style.fontSize).toBe(22)
  // The fade has gone and the line with it: the veil and the line are no longer shown.
  for (let n = 0; n < 60; n++) t.step(DT)
  rows = sent(t)
  frame(rows)
  expect(on(plugins, 'cutscene.veil')).toHaveLength(0)
  expect(on(plugins, 'cutscene.line')).toHaveLength(0)
  expect(on(plugins, 'cutscene.top')).toHaveLength(1)
  // It ends at black with the bars in; once it is done nothing is shown.
  while (!cs(rows).done) { t.step(DT); rows = sent(t) }
  expect(level(cs(rows).fade, cs(rows).e)).toBe(1)
  expect(level(cs(rows).bars, cs(rows).e)).toBe(1)
  frame(rows)
  for (const p of Object.keys(UI.panels)) expect(on(plugins, p), p).toHaveLength(0)
})

test('a scene that shows no bars, veil or line needs no ui, and one that shows them throws without it', () => {
  written('test/cutscene/bare.json', JSON.stringify({ ...FILE, cues: [FILE.cues[0], FILE.cues[5]] }))
  const bare = boots('bare')
  const { frame } = page(['render3d', 'cutscene'], { render3d: { camera: CAMERA } })
  for (let n = 0; n < 60; n++) { bare.step(DT); frame(sent(bare)) }
  const t = boots()
  const without = page(['render3d', 'cutscene'], { render3d: { camera: CAMERA } })
  t.step(DT)
  expect(() => without.frame(sent(t))).toThrow('the cutscene shows bars, a veil or a line on ui\'s panels, and the scene lists no ui')
})

// ---------------------------------------------------------------- the order and eye

test('its tick throws when it is listed before render3d, after chasecamera3d or after ui', () => {
  const t = boots()
  t.step(DT)
  const run = (order: string[]) => () => page(order).frame(sent(t))
  expect(run(['cutscene', 'render3d'])).toThrow('the cutscene is listed before render3d')
  expect(run(['render3d', 'chasecamera3d', 'cutscene'])).toThrow('the cutscene is listed after chasecamera3d')
  expect(run(['render3d', 'ui', 'cutscene'])).toThrow('the cutscene is listed after ui')
  expect(run(['cutscene'])).toThrow('the cutscene places render3d\'s camera, and the scene lists no render3d')
  expect(run(['render3d', 'cutscene', 'chasecamera3d', 'ui'])).not.toThrow()
})

test('eye() is where render3d\'s camera stands and its world −z, and throws before the first tick', () => {
  const t = boots()
  const { plugins, frame, camera } = page()
  expect(() => plugins.cutscene.eye()).toThrow('the cutscene has no camera to read')
  t.step(DT)
  frame(sent(t))
  close(plugins.cutscene.eye().pos, camera().position.toArray())
  close(plugins.cutscene.eye().dir, new THREE.Vector3(0, 0, -1).applyQuaternion(camera().quaternion).toArray())
})
