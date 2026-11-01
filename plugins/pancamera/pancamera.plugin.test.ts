// The spectator's camera, driven through the plugins it works with: render2d, whose camera it
// moves, and player, whose bind table it reads keys and the wheel through, bound as a seat's actor
// binds it. No canvas is mounted, so nothing is drawn; render2d's canvas is a stand-in with a box on
// the page half the canvas's size, as a canvas drawn smaller than its pixels is. The ground is the
// stage itself, so a way on the screen is the same way through the world.
//
// Node has no page. This one keeps every listener bound for each event, so a test can hand an event
// to all of them, as a page does, and every event can have its default cancelled, which `cancelled`
// counts by type. The page's clock moves only as the tests move it.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { player } from '#plugins/player/player.plugin.ts'
import { pancamera, type Table } from './pancamera.plugin.ts'

const on = new Map<string, Set<(e: any) => void>>()
const cancelled = new Map<string, number>()
;(globalThis as any).addEventListener = (type: string, f: (e: any) => void) => {
  if (!on.has(type)) on.set(type, new Set())
  on.get(type)!.add(f)
}
;(globalThis as any).removeEventListener = (type: string, f: (e: any) => void) => { on.get(type)?.delete(f) }
const page = { pointerLockElement: null as unknown, exitPointerLock() { page.pointerLockElement = null } }
;(globalThis as any).document = page
const fire = (type: string, e: object = {}) => {
  for (const f of on.get(type) ?? []) f({ preventDefault() { cancelled.set(type, (cancelled.get(type) ?? 0) + 1) }, ...e })
}

let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

const flat = { ground: [[1, 0], [0, 1]], up: [0, -1], zoom: 1, look: [50, 40], layers: ['things'] }
const cam: Table = {
  speed: 50,
  edge: 20,
  keys: { left: ['ArrowLeft', 'a'], right: ['ArrowRight', 'd'], up: ['ArrowUp', 'w'], down: ['ArrowDown', 's'] },
  zooms: [0.5, 0.75, 1, 1.5, 2, 3],
  notch: 100,
  bounds: [[0, 0], [100, 80]],
  look: [30, 20],
}
// The canvas is 960 by 600 of its own pixels, laid on the page at (100, 50) and 480 by 300, so a
// client pixel is two of the canvas's.
const canvas = { width: 960, height: 600, style: {}, getBoundingClientRect: () => ({ left: 100, top: 50, width: 480, height: 300 }) }
const client = (x: number, y: number) => ({ clientX: 100 + x / 2, clientY: 50 + y / 2 })

const open: (() => void)[] = []
beforeEach(() => { page.pointerLockElement = null; cancelled.clear() })
afterEach(() => { for (const close of open.splice(0)) close() })

// A client's plugins in the scene's order; `frame` moves the page's clock `ms` and ticks them in that
// order, as a frame does; `bind` binds the camera's table, as the seat's actor does in its setup.
function made(table: Table | null = cam, render: object | null = flat, order = ['player', 'render2d', 'pancamera']) {
  const r = render2d(), p = player(), c = pancamera()
  const scene = { plugins: order, world: { render2d: render, pancamera: table }, seats: 1, actors: [], prefabs: { engine: { dt: 1 / 30, width: 960, height: 600 } } }
  const plugins: any = { wire: { n: 0, ack: 0, rows: [], home: 'file:///nowhere/', scene, send: () => 0 }, render2d: r, player: p, pancamera: c }
  r.canvas = canvas as any
  const frame = async (ms = 100) => {
    clock += ms
    for (const name of order) await plugins[name].tick(plugins)
  }
  open.push(() => { c.close(); p.close() })
  return { render2d: r, player: p, pancamera: c, plugins, frame, bind: () => p.bind(c.binds(plugins)) }
}

test('it looks first at its table\'s look, inside its bounds, and the first frame moves nothing', async () => {
  const { render2d, frame, bind } = made()
  bind()
  fire('keydown', { key: 'd' })
  await frame()
  expect(render2d.camera().look).toEqual([30, 20])
  const outside = made({ ...cam, look: [140, -5] })
  await outside.frame()
  expect(outside.render2d.camera().look).toEqual([100, 0])
})

test('without a look of its own it looks first at render2d\'s', async () => {
  const { render2d, frame } = made({ ...cam, look: undefined })
  await frame()
  expect(render2d.camera().look).toEqual([50, 40])
})

test('a held key pans that way on the screen at speed for the time since the last frame, and its browser default is cancelled', async () => {
  const { render2d, frame, bind } = made()
  bind()
  await frame()
  fire('keydown', { key: 'd' })
  await frame(100)
  expect(render2d.camera().look).toEqual([35, 20])
  await frame(200)
  expect(render2d.camera().look).toEqual([45, 20])
  fire('keyup', { key: 'd' })
  fire('keydown', { key: 'ArrowUp' })
  await frame(100)
  expect(render2d.camera().look).toEqual([45, 15])
  // Two ways at once is a corner, at the one speed.
  fire('keydown', { key: 'a' })
  await frame(100)
  const [x, y] = render2d.camera().look
  expect(x).toBeCloseTo(45 - 5 * Math.SQRT1_2)
  expect(y).toBeCloseTo(15 - 5 * Math.SQRT1_2)
  // Left and right together cancel.
  fire('keydown', { key: 'ArrowRight' })
  await frame(100)
  expect(render2d.camera().look[0]).toBeCloseTo(x)
  expect(render2d.camera().look[1]).toBeCloseTo(y - 5)
  for (const key of ['a', 'ArrowRight', 'ArrowUp']) fire('keyup', { key })
  await frame(100)
  expect(render2d.camera().look[0]).toBeCloseTo(x)
  expect(render2d.camera().look[1]).toBeCloseTo(y - 5)
  expect(cancelled.get('keydown')).toBe(4)
})

test('with no table holding the camera\'s, a key held pans nothing', async () => {
  const { render2d, player, frame, bind } = made()
  bind()
  await frame()
  fire('keydown', { key: 'd' })
  player.bind({ press: { f: ['fire'] } })
  await frame(100)
  expect(render2d.camera().look).toEqual([30, 20])
})

test('the pointer within edge of a side of the canvas pans toward it, of two sides toward the corner, and elsewhere not at all', async () => {
  const { render2d, frame } = made({ ...cam, look: [50, 40] })
  await frame()
  const at = async (x: number, y: number) => {
    const was = render2d.camera().look
    fire('mousemove', client(x, y))
    await frame(100)
    const now = render2d.camera().look
    render2d.look([50, 40])
    return [+(now[0] - was[0]).toFixed(6), +(now[1] - was[1]).toFixed(6)]
  }
  const d = +(5 * Math.SQRT1_2).toFixed(6)
  expect(await at(480, 300)).toEqual([0, 0])
  expect(await at(0, 300)).toEqual([-5, 0])
  expect(await at(20, 300)).toEqual([-5, 0])
  expect(await at(22, 300)).toEqual([0, 0])
  expect(await at(950, 300)).toEqual([5, 0])
  expect(await at(480, 10)).toEqual([0, -5])
  expect(await at(480, 590)).toEqual([0, 5])
  expect(await at(5, 595)).toEqual([-d, d])
  expect(await at(958, 2)).toEqual([d, -d])
  // Off the canvas's box, beside the page's margin, is not on the canvas.
  expect(await at(-10, 300)).toEqual([0, 0])
  expect(await at(480, 620)).toEqual([0, 0])
})

test('the pointer pans nothing once it leaves the page, the page loses the focus, the pointer is locked, or a modal has the input', async () => {
  const { render2d, plugins, frame } = made()
  await frame()
  const pans = async () => {
    const was = render2d.camera().look[0]
    await frame(100)
    return render2d.camera().look[0] !== was
  }
  fire('mousemove', client(0, 300))
  expect(await pans()).toBe(true)
  fire('mouseout', { relatedTarget: {} })
  expect(await pans()).toBe(true)
  fire('mouseout', { relatedTarget: null })
  expect(await pans()).toBe(false)
  fire('mousemove', client(0, 300))
  expect(await pans()).toBe(true)
  fire('blur')
  expect(await pans()).toBe(false)
  fire('mousemove', client(0, 300))
  page.pointerLockElement = {}
  expect(await pans()).toBe(false)
  page.pointerLockElement = null
  plugins.ui = { modal: () => ({}), took: () => false, hit: () => false }
  expect(await pans()).toBe(false)
  plugins.ui.modal = () => undefined
  expect(await pans()).toBe(true)
  // A frame with no canvas mounted has no pointer on it.
  render2d.canvas = undefined
  expect(await pans()).toBe(false)
})

test('the edge and the keys together pan at the one speed', async () => {
  const { render2d, frame, bind } = made()
  bind()
  await frame()
  fire('keydown', { key: 'd' })
  fire('mousemove', client(950, 300))
  await frame(100)
  expect(render2d.camera().look).toEqual([35, 20])
  // Against each other they cancel.
  fire('mousemove', client(0, 300))
  await frame(100)
  expect(render2d.camera().look).toEqual([35, 20])
})

test('the looked-at point is held inside the bounds at both ends of both axes', async () => {
  const { render2d, frame, bind } = made()
  bind()
  await frame()
  fire('keydown', { key: 'a' })
  fire('keydown', { key: 'w' })
  await frame(10_000)
  expect(render2d.camera().look).toEqual([0, 0])
  fire('keyup', { key: 'a' })
  fire('keyup', { key: 'w' })
  fire('keydown', { key: 'd' })
  fire('keydown', { key: 's' })
  await frame(10_000)
  expect(render2d.camera().look).toEqual([100, 80])
  // A look an actor makes is where the pan goes on from, and is held inside too.
  fire('keyup', { key: 'd' })
  fire('keyup', { key: 's' })
  render2d.look([120, 10, 3])
  await frame(100)
  expect(render2d.camera().look).toEqual([100, 10, 3])
})

test('look centres the camera on a point, held inside the bounds, and the pan goes on from there', async () => {
  const { render2d, plugins, pancamera, frame, bind } = made()
  bind()
  await frame()
  pancamera.look(plugins, [70, 60])
  expect(render2d.camera().look).toEqual([70, 60])
  pancamera.look(plugins, [140, -5, 3])
  expect(render2d.camera().look).toEqual([100, 0, 3])
  pancamera.look(plugins, [-20, 95])
  expect(render2d.camera().look).toEqual([0, 80])
  fire('keydown', { key: 'd' })
  await frame(100)
  expect(render2d.camera().look).toEqual([5, 80])
})

test('the wheel steps the zoom through the list a notch at a time, keeps what turns less, and stays at either end', async () => {
  const { render2d, frame, bind } = made()
  bind()
  await frame()
  const wheel = async (...dys: number[]) => {
    for (const deltaY of dys) fire('wheel', { deltaY })
    await frame()
    return render2d.camera().zoom
  }
  expect(await wheel(-100)).toBe(1.5)
  expect(await wheel(-60)).toBe(1.5)
  expect(await wheel(-40)).toBe(2)
  expect(await wheel(-100, -100)).toBe(3)
  expect(await wheel(-300)).toBe(3)
  expect(await wheel(100)).toBe(2)
  expect(await wheel(500)).toBe(0.5)
  expect(await wheel(200)).toBe(0.5)
  expect(await wheel(-100)).toBe(0.75)
  expect(cancelled.get('wheel')).toBe(10)
  // A zoom not in the list steps to the nearest in it the way the wheel turned.
  render2d.zoom(1.2)
  expect(await wheel(-100)).toBe(1.5)
  render2d.zoom(1.2)
  expect(await wheel(100)).toBe(1)
  // The zoom is drawn: the world is scaled by it.
  render2d.afterTick()
  expect(render2d.world!.scale.x).toBe(1)
})

test('it throws listed before render2d or player, with no render2d, with no world.render2d, or with no world.pancamera', async () => {
  await expect(made(cam, flat, ['player', 'pancamera', 'render2d']).frame()).rejects.toThrow('pancamera is listed before render2d')
  await expect(made(cam, flat, ['render2d', 'pancamera', 'player']).frame()).rejects.toThrow('pancamera is listed before player')
  await expect(made(cam, flat, ['player', 'pancamera']).frame()).rejects.toThrow('the scene does not list render2d')
  await expect(made(cam, null).frame()).rejects.toThrow('render2d has no world')
  await expect(made(null).frame()).rejects.toThrow('the scene gives pancamera no world.pancamera')
  // A scene with no player is panned by the edge alone.
  const { render2d, frame } = made(cam, flat, ['render2d', 'pancamera'])
  await frame()
  fire('mousemove', client(950, 300))
  await frame(100)
  expect(render2d.camera().look).toEqual([35, 20])
})

test('close takes its listeners off the page', async () => {
  const { pancamera, frame } = made()
  await frame()
  expect(on.get('blur')!.size).toBe(1)
  pancamera.close()
  for (const type of ['mousemove', 'mouseout', 'blur']) expect(on.get(type)!.size).toBe(0)
})
