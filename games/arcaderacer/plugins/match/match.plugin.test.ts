// The match as the pages show it, each page made as `index.html` makes it, on a loopback to the game's
// match addon, in node with no canvas: the page's key listeners kept and fired by hand. The title shows
// no lobby while its intro plays, and a key skips the intro; then the leader's title shows the course select and another seat's the line saying the leader picks; the leader's
// course button takes both seats to the course as racers, and the keys drive the seat's own car; a
// page that joins mid-race is told to wait and offered to spectate, and spectating it is shown the free
// camera and each active car to follow, its camera following the car it picks; once the leader's car
// finishes every page shows the results, the leader's with the exit button, which Enter presses; and
// exit takes every page back to the lobby. The courses' music plays through audiodaw, so node is given
// its Web Audio first (`nodeaudio.ts`).
import '#plugins/audiodaw/nodeaudio.ts'
import { afterEach, expect, test, vi } from 'vitest'
import type * as PIXI from 'pixi.js'
import type * as THREE from 'three'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import type { Client } from '#engine/browser.ts'
import { link, load, manager, run, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback, type Time } from '#addons/loopback/loopback.addon.ts'
import { predict } from '#addons/predict/predict.addon.ts'
import { holding, keyCode, possessed } from '#plugins/player/player.plugin.ts'
import { match } from '../../addons/match/match.addon.ts'
import { sim } from '../../arcaderacer.sim.ts'
import file from '../../arcaderacer.scene.json' with { type: 'json' }
import defs from '../../assets/arcaderacer.json' with { type: 'json' }

vi.setConfig({ testTimeout: 180_000 })

const DT = file.prefabs.engine.dt
const base = new URL('../../', import.meta.url).href
const entry = file.prefabs.scenemanager.entry
const D = defs.match

// The pages' listeners, kept so the test can hand them key events as the browser would.
const listeners: { type: string; f: (e: unknown) => void }[] = []
vi.stubGlobal('addEventListener', (type: string, f: (e: unknown) => void) => listeners.push({ type, f }))
vi.stubGlobal('removeEventListener', (type: string, f: (e: unknown) => void) => {
  const k = listeners.findIndex(l => l.type === type && l.f === f)
  if (k >= 0) listeners.splice(k, 1)
})
const key = (type: 'keydown' | 'keyup', name: string) => {
  const e = { key: name, code: keyCode(name), repeat: false, target: null, preventDefault() {}, stopPropagation() {}, ctrlKey: false, metaKey: false, altKey: false }
  for (const l of [...listeners].filter(l => l.type === type)) l.f(e)
}
// The browser's record of a key or a click, which the music waits on before it plays: none, as a page
// in node is never touched, so the songs load and stay silent.
Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: false, isActive: false }, configurable: true })
// The UI listens once it has a canvas: a stand-in.
const mount = (me: Client) => {
  me.plugins.ui.canvas = { addEventListener() {}, removeEventListener() {}, style: {}, remove() {}, width: 1280, height: 720 }
}

const pages: ReturnType<typeof view>[] = []
afterEach(() => { for (const p of pages.splice(0)) p.close() })

test('the lobby, the race, a spectator and the results, as each page shows them', async () => {
  const truth = boot(structuredClone(file) as Scene, sim)
  const scenes = await load(truth, base)
  const door = match(manager(truth))
  const open = () => {
    const p = view(link(loopback(door)), file as Scene, base, mount)
    pages.push(p)
    return p
  }
  const frame = async () => {
    truth.step(DT)
    for (const p of pages) await p.frame()
  }
  const until = async (ok: () => boolean, most = 60) => {
    for (let k = 0; k < most && !ok(); k++) await frame()
    expect(ok()).toBe(true)
  }
  type Page = ReturnType<typeof view>
  const panel = (p: Page, name: string) => p.client!.plugins.ui.panel(name) as PIXI.Container
  const shown = (p: Page, name: string, label: string) => panel(p, name).getChildByLabel(label) as PIXI.Container | null
  const words = (c: PIXI.Container | null) => (c as PIXI.Text | null)?.text
  const label = (c: PIXI.Container | null) => (c?.children.find(o => 'text' in o) as PIXI.Text | undefined)?.text
  const tap = (c: PIXI.Container | null) => c!.emit('pointertap', {} as never)
  const matchRow = (p: Page) => p.client!.plugins.wire.rows.find((r: Row) => r.kind === 'match') as Row | undefined

  // the title's intro, which shows no lobby while it plays, skipped with a key once it runs
  const a = open(), b = open()
  await until(() => !!a.client && !!b.client && (matchRow(a)?.data.roster.length ?? 0) === 2 && (matchRow(b)?.data.roster.length ?? 0) === 2)
  const intro = (p: Page) => p.client!.plugins.wire.rows.find((r: Row) => r.kind === 'cutscene')?.data
  await until(() => !!intro(a)?.running, 900)
  expect(shown(a, 'title', 'course.0')).toBeNull()
  expect(shown(b, 'title', 'match.lobby')).toBeNull()
  key('keydown', 'x')
  key('keyup', 'x')
  await until(() => !!intro(a)?.done && !!intro(b)?.done)
  // the lobby: the leader picks a course, the other seat is told the leader picks
  await until(() => !!shown(a, 'title', 'course.0') && !!shown(b, 'title', 'match.lobby'), 600)
  expect(a.name).toBe(entry)
  // each course's word is a button laid over the word as the camera draws it, left to right in order
  await until(() => defs.titlecard.courses.every((_, i) => ((shown(a, 'title', `course.${i}`)?.hitArea as PIXI.Rectangle | undefined)?.width ?? 0) > 1), 900)
  const boxes = defs.titlecard.courses.map((_, i) => shown(a, 'title', `course.${i}`)!)
  for (const [i, b] of boxes.entries()) {
    const area = b.hitArea as PIXI.Rectangle
    expect(area.width).toBeGreaterThan(area.height)
    if (i) expect(b.position.x).toBeGreaterThan(boxes[i - 1].position.x + (boxes[i - 1].hitArea as PIXI.Rectangle).width)
  }
  expect(shown(a, 'title', 'match.lobby')).toBeNull()
  expect(shown(b, 'title', 'course.0')).toBeNull()
  expect(words(shown(b, 'title', 'match.lobby'))).toBe(D.lobby.text)

  // the leader's course button: both seats to the course, each in a car of its own
  const course = defs.titlecard.courses[0].scene
  tap(shown(a, 'title', 'course.0'))
  await until(() => a.name === course && b.name === course)
  const forest = scenes.get(course)!
  const own = (p: Page) => possessed(p.client!.plugins.wire.rows)
  const car = (p: Page) => holding(p.client!.plugins.wire.rows)
  await until(() => car(a)?.data.seg >= 0 && car(b)?.data.seg >= 0)
  // the keys reach the car the seat holds
  key('keydown', 'ArrowUp')
  await until(() => forest.rows.find(r => r.id === car(a)!.id)?.data.throttle === 1, 10)
  key('keyup', 'ArrowUp')
  await until(() => forest.rows.find(r => r.id === car(a)!.id)?.data.throttle === 0, 10)

  // a page that joins mid-race waits, told so, and is offered to spectate
  const c = open()
  await until(() => !!c.client && matchRow(c)?.data.match === 'racing' && !!shown(c, 'title', 'match.spectate'))
  expect(c.name).toBe(entry)
  expect(words(shown(c, 'title', 'match.message'))).toBe(D.messages.waiting)
  expect(label(shown(c, 'title', 'match.spectate'))).toBe(D.spectate.label)
  tap(shown(c, 'title', 'match.spectate'))
  await until(() => c.name === course && own(c)?.data.watch === -1)
  await frame()
  // spectating: the free camera and each car a racer holds, and nothing else
  const watch = panel(c, 'watch').children.map(o => o.label)
  expect(watch).toEqual(['match.watch.free', `match.watch.car.${car(a)!.id}`, `match.watch.car.${car(b)!.id}`])
  expect(label(shown(c, 'watch', 'match.watch.free'))).toBe(D.watch.free)
  expect(label(shown(c, 'watch', `match.watch.car.${car(b)!.id}`))).toBe(`PLAYER ${car(b)!.data.grid + 1}`)
  expect(c.client!.plugins.render3d.claimed()).toBe('match')
  // it follows b's car: its camera stands behind it
  tap(shown(c, 'watch', `match.watch.car.${car(b)!.id}`))
  await until(() => own(c)?.data.watch === car(b)!.id)
  await frame()
  const followed = c.client!.plugins.wire.rows.find((r: Row) => r.id === car(b)!.id)!
  const camera = c.client!.plugins.render3d.camera as THREE.PerspectiveCamera
  const { pos, cam } = followed.data
  expect(camera.position.x).toBeCloseTo(pos[0] - Math.sin(cam) * D.follow.back, 6)
  expect(camera.position.y).toBeCloseTo(pos[1] + D.follow.high, 6)
  expect(camera.position.z).toBeCloseTo(pos[2] - Math.cos(cam) * D.follow.back, 6)

  // the leader's car finishes: every page shows the results, the leader's with the exit
  const race = () => forest.rows.find(r => r.kind === 'race')!
  await until(() => race().data.phase === 'go', 600)
  forest.rows.find(r => r.id === car(a)!.id)!.data.done = 99
  await until(() => [a, b, c].every(p => !!shown(p, 'results', 'match.results')))
  for (const p of [a, b, c]) expect(p.client!.plugins.ui.modal()).toBe('results')
  expect(label(shown(a, 'results', 'match.exit'))).toBe(D.results.exit.label)
  expect(shown(b, 'results', 'match.exit')).toBeNull()
  expect(shown(c, 'results', 'match.exit')).toBeNull()
  expect(words(shown(a, 'results', `match.result.${car(a)!.id}.name`))).toBe(D.results.you)
  // Enter presses the leader's exit: every page back in the lobby
  key('keydown', 'Enter')
  key('keyup', 'Enter')
  await until(() => [a, b, c].every(p => p.name === entry))
  await until(() => [a, b, c].every(p => matchRow(p)?.data.match === 'lobby'))
  await until(() => !!shown(a, 'title', 'course.0') && !!shown(c, 'title', 'match.lobby'), 600)
  expect(words(shown(c, 'title', 'match.lobby'))).toBe(D.lobby.text)
})

// A clock the test moves, as node's `setTimeout` falls due.
function clock() {
  let now = 0
  let queue: { at: number; i: number; f: () => void }[] = []
  let i = 0
  const time: Time = { now: () => now, after: (ms, f) => { queue.push({ at: now + Math.max(1, ms), i: i++, f }) } }
  const to = (t: number) => {
    for (;;) {
      const due = queue.filter(q => q.at <= t).sort((a, b) => a.at - b.at || a.i - b.i)[0]
      if (!due) break
      queue = queue.filter(q => q !== due)
      now = due.at
      due.f()
    }
    now = t
  }
  return { time, to, get now() { return now } }
}

// On `client.html` a page runs each course ahead of the server (`addons/predict`), and what the match
// sends a course rides its journal like any seat's press: pages that run the course ahead, on a wire
// that lags and bunches, through a start, the racers driving, two spectators joining, a racer
// refreshing (its car held by nobody, the page back as a new connection) and the leader leaving mid-race,
// never throw and never once differ from the server.
test('pages that run the course ahead never differ from the server through the match', async () => {
  const truth = boot(structuredClone(file) as Scene, sim)
  await load(truth, base)
  const c = clock()
  vi.spyOn(performance, 'now').mockImplementation(() => c.now)
  const stop = run(truth, c.time)
  const door = match(manager(truth))
  // a wire that lags and bunches, so every page's copy runs well ahead of what the server has sent
  const leg = { delay: 90, jitter: 80, tail: true }
  const links: ReturnType<typeof link>[] = []
  const open = (seed: number) => {
    const l = link(loopback(door, c.time, { up: leg, down: leg, seed }))
    links.push(l)
    const p = predict(l, file as Scene, base, mount)
    return p
  }
  const ps: ReturnType<typeof predict>[] = []
  // every visit's corrections and how many packets it held against its copy
  const visits = new Map<object, { corrections: number; checked: number; predicting: boolean; first?: unknown }>()
  const frame = async () => {
    c.to(c.now + 1000 / 60)
    for (const p of ps) {
      p.input()
      await p.frame(c.now)
      const s = p.stats
      visits.set(s, { corrections: s.corrections, checked: s.checked, predicting: s.predicting, first: s.first })
    }
  }
  const until = async (ok: () => boolean, most = 600) => {
    for (let k = 0; k < most && !ok(); k++) await frame()
    expect(ok()).toBe(true)
  }
  const shown = (p: ReturnType<typeof predict>, name: string, label: string) => (p.client?.plugins.ui.panel(name) as PIXI.Container | undefined)?.getChildByLabel(label) as PIXI.Container | null | undefined
  const tap = (x: PIXI.Container | null | undefined) => x!.emit('pointertap', {} as never)
  const roster = (p: ReturnType<typeof predict>) => (p.client?.plugins.wire.rows.find((r: Row) => r.kind === 'match')?.data.roster ?? []) as unknown[]

  ps.push(open(1), open(2))
  const [a, b] = ps
  // the title's intro skipped with a key once it runs, and then the lobby
  const intro = (p: ReturnType<typeof predict>) => p.client?.plugins.wire.rows.find((r: Row) => r.kind === 'cutscene')?.data
  await until(() => roster(a).length === 2 && roster(b).length === 2 && !!intro(a)?.running, 900)
  key('keydown', 'x')
  key('keyup', 'x')
  await until(() => !!shown(a, 'title', 'course.0'))
  const course = defs.titlecard.courses[0].scene
  tap(shown(a, 'title', 'course.0'))
  const own = (p: ReturnType<typeof predict>) => possessed(p.client?.plugins.wire.rows ?? [])
  const car = (p: ReturnType<typeof predict>) => holding(p.client?.plugins.wire.rows ?? [])
  await until(() => a.name === course && b.name === course && a.stats.predicting && b.stats.predicting && car(a)?.data.seg >= 0 && car(b)?.data.seg >= 0)
  // the race goes, and both cars drive
  key('keydown', 'ArrowUp')
  await until(() => car(a)!.data.speed > 5 && car(b)!.data.speed > 5, 900)
  // two spectators join mid-race, one after the other, while the racers' copies run ahead
  const watched = (p: ReturnType<typeof predict>) => own(p)?.data.watch === -1
  const spectate = async (seed: number) => {
    const p = open(seed)
    ps.push(p)
    await until(() => !!shown(p, 'title', 'match.spectate'))
    tap(shown(p, 'title', 'match.spectate'))
    await until(() => p.name === course && p.stats.predicting && watched(p))
    return p
  }
  const s = await spectate(3)
  const t = await spectate(4)
  for (let k = 0; k < 60; k++) await frame()
  // a racer refreshes: its car stands on, held by nobody, on every page's copy as on the server, and
  // the page comes back as a new connection, waiting
  const bCar = car(b)!.id
  links[1].close()
  ps.splice(ps.indexOf(b), 1)
  await until(() => {
    const rows = a.client!.plugins.wire.rows
    return rows.some((r: Row) => r.id === bCar) && !rows.some((r: Row) => r.kind === 'player' && r.data.held?.id === bCar)
  })
  const back = open(5)
  ps.push(back)
  await until(() => !!shown(back, 'title', 'match.spectate'))
  for (let k = 0; k < 60; k++) await frame()
  // the leader leaves mid-race: the spectators are back in the lobby, told why
  links[0].close()
  ps.splice(ps.indexOf(a), 1)
  await until(() => [s, t].every(p => p.name === entry && p.client!.plugins.wire.rows.find((r: Row) => r.kind === 'match')?.data.message === 'disconnected'))
  key('keyup', 'ArrowUp')
  const ran = [...visits.values()].filter(v => v.predicting)
  expect(ran.length).toBe(4)
  for (const v of ran) {
    expect(v.checked).toBeGreaterThan(50)
    expect(v.corrections, JSON.stringify(v.first)).toBe(0)
  }
  for (const p of ps) p.close()
  stop.stop()
  vi.restoreAllMocks()
})
