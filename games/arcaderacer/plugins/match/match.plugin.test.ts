// The match as the pages show it, each page made as `index.html` makes it, on a loopback to the game's
// match addon, in node with no canvas: the page's key listeners kept and fired by hand. The title shows
// no lobby while its intro plays, and a key skips the intro; then every seat's title shows the name, the
// one thing of ui3d's menu, and Enter starts: the leader's title shows the course select, each word with
// its hit box, left to right, and another seat's the car select; Enter again chooses the leader's course
// and takes it to the car select, and picks the other seat's car; every page shows who is here and what
// each picked, and the seat that picked is told what the match waits on (the other's car); the leader's
// Enter on its car picks it and brings up START, and Enter on that takes both seats to the course it chose
// as racers, each page saying it is ready, and the keys drive the seat's own car; a page that joins
// mid-race is told to wait and offered to spectate, and spectating it is shown the free camera and each
// active car to follow, its camera following the car it picks; once every racer has finished every page
// shows the results with the exit button and the seconds left, which Enter presses; and exit takes every
// page back to the lobby. A second test is `index.html`'s own page, on the addon's `solo`: the title, the
// course select and the car select, and the pick takes it straight to the course, with no roster, START or
// staging list ever shown; the results show the exit and no countdown, and stand until Enter presses it.
// The courses' music plays through audiodaw, so node is given its Web Audio first (`nodeaudio.ts`).
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
import { match, solo } from '../../addons/match/match.addon.ts'
import { fill } from '../dash/dash.plugin.ts'
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

// One turn of node's event loop, as a browser gives one between frames: the loader reads a file from disk
// (`fs.readFile`), which lands only when the loop turns, and a frame alone awaits nothing that turns it.
const turn = () => new Promise<void>(done => setImmediate(done))

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
    for (const p of pages) {
      p.input()
      await p.frame()
    }
    await turn()
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
  // a thing ui3d shows, by its key: its holder in the overlay, and its hit box
  // (a holder is a child of the overlay's scene; the title's model has a node `name` of its own)
  const thing = (p: Page, k: string) => (p.client!.plugins.render3d.overlay.scene as THREE.Scene).children.find(o => o.name === k)
  const box = (p: Page, k: string) => (p.client!.plugins.render3d.overlay.scene as THREE.Scene).getObjectByName(`${k}.box`) as THREE.Mesh<THREE.BoxGeometry> | undefined
  const selected = (p: Page) => p.client!.plugins.ui3d.selected() as string | undefined
  const enter = () => {
    key('keydown', 'Enter')
    key('keyup', 'Enter')
  }

  // the title's intro, which shows no lobby while it plays, skipped with a key once it runs
  const a = open(), b = open()
  await until(() => !!a.client && !!b.client && (matchRow(a)?.data.roster.length ?? 0) === 2 && (matchRow(b)?.data.roster.length ?? 0) === 2)
  const intro = (p: Page) => p.client!.plugins.wire.rows.find((r: Row) => r.kind === 'cutscene')?.data
  await until(() => !!intro(a)?.running, 900)
  expect(thing(a, 'course.0')).toBeUndefined()
  expect(shown(b, 'title', 'match.lobby')).toBeNull()
  key('keydown', 'x')
  key('keyup', 'x')
  await until(() => !!intro(a)?.done && !!intro(b)?.done)
  // the lobby opens on the title: the name, the one thing of the menu, and no courses or cars yet
  const cars = defs.match.cars
  await until(() => [a, b].every(p => !!box(p, 'name')), 900)
  expect([selected(a), selected(b)]).toEqual(['name', 'name'])
  expect(thing(a, 'course.0')).toBeUndefined()
  expect(thing(a, 'car.0')).toBeUndefined()
  // Enter on the title: the leader to the course select, the other seat to the car select
  enter()
  await until(() => defs.titlecard.courses.every((_, i) => !!box(a, `course.${i}`)) && !!thing(b, 'car.0'), 900)
  expect(thing(a, 'name')).toBeUndefined()
  expect(thing(a, 'car.0')).toBeUndefined()
  expect(thing(b, 'course.0')).toBeUndefined()
  // each course's word has a hit box wider than tall, left to right in order as the camera draws them
  const across = defs.titlecard.courses.map((_, i) => {
    const b = box(a, `course.${i}`)!
    expect(b.geometry.parameters.width).toBeGreaterThan(b.geometry.parameters.height)
    return a.client!.plugins.render3d.project(b.getWorldPosition(b.position.clone()).toArray()).x as number
  })
  for (let i = 1; i < across.length; i++) expect(across[i]).toBeGreaterThan(across[i - 1])
  expect(selected(a)).toBe('course.0')
  await until(() => !!box(b, 'car.0'), 900)
  expect(selected(b)).toBe('car.0')
  // Enter again: the leader chooses its course and goes to the car select; the other seat picks its car,
  // and is told what the match waits on, over the courses' words, none of them selectable
  const course = defs.titlecard.courses[0].scene
  enter()
  await until(() => !!box(a, 'car.0') && !!shown(b, 'title', 'match.lobby'), 900)
  expect(thing(a, 'course.0')).toBeUndefined()
  expect((matchRow(a)?.data.roster as { car: string }[]).map(e => e.car)).toEqual(['', cars[0]])
  expect(matchRow(b)?.data.chosen).toBe(course)
  expect(a.name).toBe(entry)
  expect(thing(b, 'course.0')).toBeDefined()
  expect(box(b, 'course.0')).toBeUndefined()
  expect(shown(a, 'title', 'match.lobby')).toBeNull()
  const one = fill(D.player, { n: 1 }), two = fill(D.player, { n: 2 })
  expect(words(shown(b, 'title', 'match.lobby'))).toBe(fill(D.lobby.text.picking, { names: one }))
  // every page shows who is here, who leads, which is its own, and what each has picked; and the course
  const R = D.lobby.roster
  const line = (p: Page, id: number) => words(shown(p, 'title', `match.roster.${id}`))
  const ids = (matchRow(a)?.data.roster as { id: number }[]).map(e => e.id)
  for (const p of [a, b]) {
    expect(words(shown(p, 'title', 'match.course'))).toBe(fill(D.lobby.course.text, { course: defs.titlecard.courses[0].word }))
  }
  expect(line(a, ids[0])).toBe(fill(R.line, { name: one, tags: R.host + R.you, car: R.picking }))
  expect(line(a, ids[1])).toBe(fill(R.line, { name: two, tags: '', car: D.names[cars[0]] }))
  expect(line(b, ids[0])).toBe(fill(R.line, { name: one, tags: R.host, car: R.picking }))
  expect(line(b, ids[1])).toBe(fill(R.line, { name: two, tags: R.you, car: D.names[cars[0]] }))

  // the leader's Enter on its car picks it; every seat has picked, so START comes up for the leader
  // alone, and the other seat is told the leader starts
  enter()
  await until(() => !!shown(a, 'title', 'match.start') && !!shown(b, 'title', 'match.lobby'))
  expect(label(shown(a, 'title', 'match.start'))).toBe(D.lobby.start.label)
  expect(shown(b, 'title', 'match.start')).toBeNull()
  await until(() => words(shown(b, 'title', 'match.lobby')) === fill(D.lobby.text.waiting, { host: one }))
  expect(a.name).toBe(entry)

  // Enter on START: both seats to the course it chose, each in a car of its own
  enter()
  await until(() => a.name === course && b.name === course)
  const forest = scenes.get(course)!
  const own = (p: Page) => possessed(p.client!.plugins.wire.rows)
  const car = (p: Page) => holding(p.client!.plugins.wire.rows)
  await until(() => car(a)?.data.seg >= 0 && car(b)?.data.seg >= 0)
  // each page says its art is in once it is whole, and the race goes on from staging
  await until(() => own(a)?.data.ready === true && own(b)?.data.ready === true)
  // each racer's car is the car its seat picked, and every rival one dealt from the cars
  expect([car(a)!.data.car, car(b)!.data.car]).toEqual([cars[0], cars[0]])
  for (const r of forest.rows.filter(r => r.kind === 'rival')) expect(cars).toContain(r.data.car)
  // the keys reach the car the seat holds
  // once the loading screen, a modal panel that takes every key, has faded out (it fades on the page's
  // own clock, `fade` seconds)
  await until(() => !a.client!.plugins.ui.modal() && !b.client!.plugins.ui.modal(), 5000)
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

  // the first racer home waits for the other, and says so; then both are home: every page shows the
  // results, each with the exit and the seconds left
  const race = () => forest.rows.find(r => r.kind === 'race')!
  await until(() => race().data.phase === 'go', 600)
  forest.rows.find(r => r.id === car(a)!.id)!.data.done = 99
  await until(() => !!shown(a, 'hud', 'finishWaiting'))
  expect(words(shown(a, 'hud', 'finishWaiting'))).toBe(defs.race.hud.finish.waiting.text)
  expect(shown(a, 'results', 'match.results')).toBeNull()
  forest.rows.find(r => r.id === car(b)!.id)!.data.done = 100
  await until(() => [a, b, c].every(p => !!shown(p, 'results', 'match.results')))
  // (the spectator's own loading screen, a modal, may still be fading out on its page's clock)
  await until(() => [a, b, c].every(p => p.client!.plugins.ui.modal() === 'results'), 5000)
  for (const p of [a, b, c]) expect(label(shown(p, 'results', 'match.exit'))).toBe(D.results.exit.label)
  for (const p of [a, b, c]) {
    const over = p.client!.plugins.wire.rows.find((r: Row) => r.kind === 'race')!.data.over
    expect(over).toBeGreaterThan(0)
    expect(words(shown(p, 'results', 'match.countdown'))).toBe(fill(D.results.countdown.text, { seconds: Math.ceil(defs.race.results - over) }))
  }
  expect(words(shown(a, 'results', `match.result.${car(a)!.id}.name`))).toBe(D.results.you)
  // Enter presses exit, on any page: every page back in the lobby
  key('keydown', 'Enter')
  key('keyup', 'Enter')
  await until(() => [a, b, c].every(p => p.name === entry))
  await until(() => [a, b, c].every(p => matchRow(p)?.data.match === 'lobby'))
  // back in the lobby every seat is on the title again, and goes on through it as before
  await until(() => [a, b, c].every(p => !!box(p, 'name')), 600)
  enter()
  await until(() => !!box(a, 'course.0') && !!box(c, 'car.0'), 900)
  enter()
  await until(() => !!box(a, 'car.0') && !!shown(c, 'title', 'match.lobby'), 900)
  expect(words(shown(c, 'title', 'match.lobby'))).toBe(fill(D.lobby.text.picking, { names: one }))
})

test('index.html alone: the pick races the chosen course, with no lobby, and the results stand until exit', async () => {
  const truth = boot(structuredClone(file) as Scene, sim)
  const scenes = await load(truth, base)
  const a = view(link(loopback(solo(manager(truth)))), file as Scene, base, mount)
  pages.push(a)
  type Page = typeof a
  const course = defs.titlecard.courses[0].scene
  // every frame on the course: whether the race was ever on staging, and whether the staging list was
  // ever shown
  let staging = false, listed = false
  const frame = async () => {
    truth.step(DT)
    a.input()
    await a.frame()
    await turn()
    if (a.name !== course) return
    if (scenes.get(course)!.rows.find(r => r.kind === 'race')?.data.phase === 'staging') staging = true
    if (shown(a, 'hud', 'match.staging')) listed = true
  }
  const until = async (ok: () => boolean, most = 60) => {
    for (let k = 0; k < most && !ok(); k++) await frame()
    expect(ok()).toBe(true)
  }
  const panel = (p: Page, name: string) => p.client!.plugins.ui.panel(name) as PIXI.Container
  const shown = (p: Page, name: string, label: string) => panel(p, name).getChildByLabel(label) as PIXI.Container | null
  const label = (c: PIXI.Container | null) => (c?.children.find(o => 'text' in o) as PIXI.Text | undefined)?.text
  const matchRow = () => a.client!.plugins.wire.rows.find((r: Row) => r.kind === 'match') as Row | undefined
  const box = (k: string) => (a.client!.plugins.render3d.overlay.scene as THREE.Scene).getObjectByName(`${k}.box`)
  const enter = () => {
    key('keydown', 'Enter')
    key('keyup', 'Enter')
  }
  // nothing of the lobby is ever on the title: no roster line, no course line, no waiting line, no START
  const lobbyShown = () => panel(a, 'title').children.some(o => o.label.startsWith('match.'))

  await until(() => !!a.client && matchRow()?.data.roster.length === 1)
  expect(matchRow()!.data.solo).toBe(true)
  const intro = () => a.client!.plugins.wire.rows.find((r: Row) => r.kind === 'cutscene')?.data
  await until(() => !!intro()?.running, 900)
  key('keydown', 'x')
  key('keyup', 'x')
  await until(() => !!intro()?.done)
  // the title, the course select, the car select
  await until(() => !!box('name'), 900)
  enter()
  await until(() => !!box('course.0'), 900)
  expect(lobbyShown()).toBe(false)
  enter()
  await until(() => !!box('car.0'), 900)
  expect(lobbyShown()).toBe(false)
  // the pick is the start: the page is on the course in the car it picked, never shown START
  enter()
  await until(() => a.name === course, 900)
  const own = () => possessed(a.client!.plugins.wire.rows)
  const car = () => holding(a.client!.plugins.wire.rows)
  await until(() => car()?.data.seg >= 0)
  expect(car()!.data.car).toBe(defs.match.cars[0])
  // staging waits on the page with no list of who is loading, and goes once it is ready
  const race = () => scenes.get(course)!.rows.find(r => r.kind === 'race')!
  await until(() => own()?.data.ready === true, 900)
  await until(() => race().data.phase === 'go', 900)
  expect(staging).toBe(true)
  expect(listed).toBe(false)
  // the player finishes: the results with the exit and no countdown, standing past their time
  scenes.get(course)!.rows.find(r => r.id === car()!.id)!.data.done = 99
  await until(() => !!shown(a, 'results', 'match.results'))
  await until(() => a.client!.plugins.ui.modal() === 'results', 5000)
  expect(label(shown(a, 'results', 'match.exit'))).toBe(D.results.exit.label)
  expect(shown(a, 'results', 'match.countdown')).toBeNull()
  race().data.over = defs.race.results
  await until(() => race().data.ended === true, 5)
  for (let k = 0; k < 30; k++) await frame()
  expect(a.name).toBe(course)
  expect(matchRow()!.data.match).toBe('results')
  // Enter presses exit: back on the title
  enter()
  await until(() => a.name === entry && matchRow()?.data.match === 'lobby')
  await until(() => !!box('name'), 600)
  expect(lobbyShown()).toBe(false)
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
    await turn()
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
  // a thing of ui3d's menu, by its key: its hit box, there once it can be pressed
  const box = (p: ReturnType<typeof predict>, k: string) => (p.client?.plugins.render3d.overlay.scene as THREE.Scene | undefined)?.getObjectByName(`${k}.box`)
  const enter = () => {
    key('keydown', 'Enter')
    key('keyup', 'Enter')
  }
  // the title, the leader's course select and the other's car select, then the leader's car select
  await until(() => !!box(a, 'name') && !!box(b, 'name'))
  enter()
  await until(() => !!box(a, 'course.0') && !!box(b, 'car.0'))
  enter()
  await until(() => !!box(a, 'car.0'))
  const course = defs.titlecard.courses[0].scene
  // the leader's car, then START once every seat has picked
  enter()
  await until(() => !!shown(a, 'title', 'match.start'))
  enter()
  const own = (p: ReturnType<typeof predict>) => possessed(p.client?.plugins.wire.rows ?? [])
  const car = (p: ReturnType<typeof predict>) => holding(p.client?.plugins.wire.rows ?? [])
  await until(() => a.name === course && b.name === course && a.stats.predicting && b.stats.predicting && car(a)?.data.seg >= 0 && car(b)?.data.seg >= 0)
  // the loading screens, modal panels that take every key, fade out; the race goes, and both cars drive
  await until(() => !a.client!.plugins.ui.modal() && !b.client!.plugins.ui.modal())
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
