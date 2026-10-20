// The browser half of the player: what a seat's keys, mouse and gamepads send. A manager of one
// scene and one page on it through the loopback, as a game's `index.html` joins them, each frame
// one step of the manager and then the page's frame. The scene is written here, into a folder of its
// own as a game's child scene is, so the manager boots it from files as a game's does. Each test
// binds its own table on the page's player plugin and reads the messages that reached the server.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join as path, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { boot, type Msg, type Row, type Scene } from '#engine/engine.ts'
import { client } from '#engine/browser.ts'
import { loader } from '#plugins/loader/loader.plugin.ts'
import { accept, entries, link, load, manager, scene, type Diff, type Got, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback, type Accept } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { keyCode, keyName, type Bound } from './player.plugin.ts'

// The actors bind keys and the mouse on the page; node has no page. This one keeps the last
// listener bound for each event, so a test can hand it an event, and it holds the pointer lock:
// `requestPointerLock` on the element clicked gives the lock to that element, `exitPointerLock`
// takes it back. Every event it hands on can have its default cancelled, and `cancelled` counts
// the events that were, by type.
const on = new Map<string, (e: any) => void>()
const cancelled = new Map<string, number>()
;(globalThis as any).addEventListener = (type: string, f: (e: any) => void) => {
  on.set(type, e => f({ preventDefault() { cancelled.set(type, (cancelled.get(type) ?? 0) + 1) }, ...e }))
}
;(globalThis as any).removeEventListener = (type: string) => { on.delete(type) }
const page = { pointerLockElement: null as unknown, exitPointerLock() { page.pointerLockElement = null } }
;(globalThis as any).document = page

// A key event as the page sends one: the key's place on the keyboard, `code`, and what it typed,
// which is its name unless `more` says otherwise, as `W` with Shift down.
const key = (code: string, more: Record<string, unknown> = {}) => ({ code, key: keyName(code), ...more })

// The page's clock, which the action avenue's repeat reads to press a held action again: it moves
// only as the tests move it, a step's time with each frame.
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)
const pass = (seconds: number) => { clock += seconds * 1000 }

// A folder of the files named, the page's folder of one scene, and the server's sim off the rule
// files in it: each kind's `<kind>.sim.ts` exports the kind under its name.
const folders: string[] = []
afterAll(() => { for (const f of folders) rmSync(f, { recursive: true }) })
function folder(files: Record<string, string>) {
  const dir = mkdtempSync(path(tmpdir(), 'player-'))
  folders.push(dir)
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(path(dir, name)), { recursive: true })
    writeFileSync(path(dir, name), text)
  }
  return pathToFileURL(dir + '/').href
}
// A manager of the one scene `name`, written into `home` as a game's child scene is: its scene file,
// and its sim, which imports each kind's rule file named in `kinds`, a path from `home` or from
// anywhere. Hands back the manager's scene, which the test boots and the page views.
function managed(home: string, name: string, child: Scene, kinds: Record<string, string>): Scene {
  const dir = fileURLToPath(home)
  writeFileSync(path(dir, `${name}.scene.json`), JSON.stringify(child))
  writeFileSync(path(dir, `${name}.sim.ts`), `${Object.entries(kinds).map(([k, f]) => `import { ${k} } from ${JSON.stringify(f)}\n`).join('')}import file from './${name}.scene.json' with { type: 'json' }
export const sim = { ${Object.keys(kinds).join(', ')} }
export const scene = file
`)
  const dt = child.prefabs.engine.dt
  return {
    world: {},
    plugins: ['scenemanager'],
    seats: 1,
    prefabs: { engine: { dt }, scenemanager: { scenes: { [name]: { file: `${name}.scene.json`, suspend: false } }, dt, entry: name, port: 0 } },
    actors: [{ is: 'scenemanager' }],
  }
}

// The range steps 60 times a second, and its sim imports the scenemanager's rule from core.
const DT = 1 / 60
const SCENEMANAGER = new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname

// ---------------------------------------------------------------- the mouse, the keys and gamepads

// A range of a camera and nothing else, and one page on it: no actor binds a key, so the only
// presses are the test's. Each test binds its own table on the page's player plugin. The seat's
// `aim` and `fire` do nothing; the messages are what is measured, and every one the mouse, a key or a
// gamepad makes is written down as it reaches the server (`tapped`), as its action and its args.
const range: Scene = {
  world: {},
  plugins: ['scenemanager', 'player', 'render3d'],
  seats: 1,
  prefabs: {
    engine: { dt: DT, width: 800, height: 600 },
    scenemanager: { out: {} },
    render3d: { camera: { at: [0, 2, 10], look: [0, 0, 0], fov: 50, near: 0.1, far: 100 } },
    player: { seat: 0 },
  },
  actors: [{ is: 'scenemanager' }],
}
// The server's side of a seat on `row`, writing each message into `into` as it arrives, before the
// step that answers it.
const tapped = (row: Row, into: Msg[]): Accept<Up | Got, Diff> => send => {
  const seat = accept(row)(send)
  return { take: up => { if ('msg' in up) into.push(up.msg); seat.take(up) }, close: () => seat.close() }
}
const rangeHome = folder({ 'player.sim.ts': 'export const player = { acts: { aim() {}, fire() {} } }\n' })
const rangeTop = managed(rangeHome, 'range', range, { scenemanager: SCENEMANAGER, player: './player.sim.ts' })

// The range booted, and a page on it. `player` is the page's `world.player`, as a scene file would
// give it: the sticks' dead zone and the resolution of what is read analog.
async function rangeRig(player: { deadzone?: number; resolution?: number } = {}) {
  const truth = boot(structuredClone(rangeTop), { scenemanager })
  await load(truth, rangeHome)
  const shots: Msg[] = []
  const row = manager(truth)
  const wire = link(loopback(tapped(row, shots)))
  // The range is the one scene, and the seat never leaves it, so this page is the one client the
  // scenemanager's `view` would make, made here and handed every packet.
  const [[name]] = entries(row)
  const s = structuredClone(scene(row, name).scene) as Scene
  const me = await client({ ...s, world: { ...s.world, player } }, rangeHome)
  // Mounted, as the view mounts a client, on the visit the first envelope names.
  wire.hear(d => {
    if (!me.plugins.scenemanager.link) me.plugins.scenemanager.mount(wire, d.scene, d.seat)
    me.plugins.scenemanager.hand(d.packet)
  })
  me.plugins.render3d.canvas = { addEventListener: () => {}, style: {}, width: 800, height: 600 }
  const frames = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); pass(DT); await me.frame() } }
  const sent = (action: string) => shots.filter(m => m.action === action).map(m => m.args)
  await frames(5)
  return { player: me.plugins.player, plugins: me.plugins, frames, sent }
}

const canvas = { requestPointerLock() { page.pointerLockElement = canvas } }
const click = { target: canvas, clientX: 0, clientY: 0, offsetX: 0, offsetY: 0 }

test('the mouse sends nothing until a click takes the pointer lock, then one message a frame with the pixels it moved', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ pointer: (dx: number, dy: number) => ['aim', dx, dy] })
  on.get('mousemove')!({ movementX: 7, movementY: 3 })
  await frames(2)
  expect(sent('aim')).toEqual([])
  on.get('click')!(click)
  expect(page.pointerLockElement).toBe(canvas)
  on.get('mousemove')!({ movementX: 7, movementY: 3 })
  on.get('mousemove')!({ movementX: 5, movementY: -1 })
  await frames(2)
  expect(sent('aim')).toEqual([[12, 2]])
  await frames(3)
  expect(sent('aim')).toEqual([[12, 2]])
  player.unbind()
})

// A key's message goes up the moment the key goes down, with no frame between, so the truth's next
// step takes it. What is read once a frame, the mouse here, goes up in `input`, which a page whose
// loop steps the truth calls before its steps; the frame after it sends it no second time, and a
// frame with no `input` before it reads it itself.
test('a key goes up the moment it goes down, and input sends what a frame reads before the steps, once', async () => {
  const { player, plugins, frames, sent } = await rangeRig()
  player.bind({ press: { f: ['fire'] }, pointer: (dx: number, dy: number) => ['aim', dx, dy] })
  on.get('keydown')!(key('KeyF'))
  on.get('keyup')!(key('KeyF'))
  expect(sent('fire')).toEqual([[]])
  on.get('click')!(click)
  on.get('mousemove')!({ movementX: 4, movementY: 2 })
  player.input(plugins)
  expect(sent('aim')).toEqual([[4, 2]])
  await frames(1)
  expect(sent('aim')).toEqual([[4, 2]])
  on.get('mousemove')!({ movementX: 1, movementY: 1 })
  await frames(1)
  expect(sent('aim')).toEqual([[4, 2], [1, 1]])
  player.unbind()
})

// Node as it is, with no `document` (the loader lends node one only while a model decodes), so
// nothing holds the pointer lock. A click still asks the element for the
// lock, a move sends nothing, and letting go asks the page for nothing.
test('with no document nothing holds the pointer lock: a click asks for it, a move sends nothing, and unbind lets go', async () => {
  const { player, frames, sent } = await rangeRig()
  const g = globalThis as { document?: unknown }
  const was = g.document
  delete g.document
  try {
    let asked = 0
    player.bind({ pointer: (dx: number, dy: number) => ['aim', dx, dy] })
    on.get('click')!({ ...click, target: { requestPointerLock() { asked++ } } })
    on.get('mousemove')!({ movementX: 7, movementY: 3 })
    await frames(2)
    expect(asked).toBe(1)
    expect(sent('aim')).toEqual([])
    expect(() => player.unbind()).not.toThrow()
  } finally {
    g.document = was
  }
})

// The loader lends node a `document` that decodes images and has no pointer lock, while a model
// decodes; anything the page runs meanwhile sees it. The glTF loader here stands in for three's: the
// moment it is handed the model, the player lets go of a lock a click asked for.
test('while the loader lends node a document to decode a model, the player lets go of the pointer lock without calling what it lacks', async () => {
  const { player } = await rangeRig()
  const g = globalThis as { document?: unknown }
  const was = g.document
  delete g.document
  const dir = mkdtempSync(path(tmpdir(), 'player-model-'))
  try {
    writeFileSync(path(dir, 'x.glb'), 'glb')
    player.bind({ pointer: (dx: number, dy: number) => ['aim', dx, dy] })
    on.get('click')!({ ...click, target: { requestPointerLock() {} } })
    let seen: unknown, threw: unknown
    class Decoding { setMeshoptDecoder() { return this } parse(_b: unknown, _p: string, ok: (g: unknown) => void) { seen = g.document; try { player.unbind() } catch (e) { threw = e } ok({ scene: {}, animations: [] }) } }
    const me = loader()
    me.tick({ wire: { rows: [{ id: 1, kind: 'loader', data: {} }], scene: { world: { loader: { assets: { x: { type: 'model', url: '/' + relative(process.cwd(), path(dir, 'x.glb')) } } } } } }, render3d: { GLTFLoader: Decoding } } as any)
    await me.load('x')
    expect(seen).toMatchObject({ createElementNS: expect.any(Function) })
    expect(threw).toBeUndefined()
    expect(g.document).toBeUndefined()
  } finally {
    rmSync(dir, { recursive: true })
    g.document = was
  }
})

test('a mouse button is a key: held while it is down, and sent from press the moment it goes down', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ press: { Mouse0: ['fire'] }, every: (held: (key: string) => boolean) => (held('Mouse2') ? ['aim', 0, 0.01] : undefined) })
  on.get('mousedown')!({ button: 0 })
  on.get('mouseup')!({ button: 0 })
  on.get('mousedown')!({ button: 2 })
  await frames(3)
  on.get('mouseup')!({ button: 2 })
  await frames(3)
  expect(sent('fire')).toEqual([[]])
  expect(sent('aim')).toEqual([[0, 0.01], [0, 0.01], [0, 0.01]])
  player.unbind()
})

test('a hold is one button of any of its keys: 1 sent when the first goes down, 0 when the last comes up', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ hold: [{ keys: ['Mouse0', 'Control'], send: (v: number) => ['aim', v, 0] }] })
  on.get('mousedown')!({ button: 0 })
  on.get('keydown')!(key('ControlLeft'))
  await frames(2)
  on.get('mouseup')!({ button: 0 })
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0]])
  on.get('keyup')!(key('ControlLeft'))
  on.get('keydown')!(key('ControlLeft'))
  on.get('keyup')!(key('ControlLeft'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [1, 0], [0, 0]])
  player.unbind()
})

test('a stick is four keys sent as one way, x and y, whenever either changes, and any key of a list holds its side', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ stick: [{ keys: [['ArrowLeft', 'a'], ['ArrowRight', 'd'], ['ArrowUp', 'w'], ['ArrowDown', 's']], send: (x: number, y: number) => ['aim', x, y] }] })
  on.get('keydown')!(key('KeyD'))
  on.get('keydown')!(key('ArrowUp'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [1, -1]])
  on.get('keydown')!(key('ArrowRight'))
  on.get('keyup')!(key('KeyD'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [1, -1]])
  on.get('keydown')!(key('KeyA'))
  on.get('keyup')!(key('ArrowUp'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [1, -1], [0, -1], [0, 0]])
  player.unbind()
})

test('a key press gives a function runs it on the page the moment the key goes down, and sends nothing', async () => {
  const { player, frames, sent } = await rangeRig()
  let flips = 0
  player.bind({ press: { h: () => { flips++ }, f: ['fire'] } })
  on.get('keydown')!(key('KeyH'))
  expect(flips).toBe(1)
  on.get('keyup')!(key('KeyH'))
  on.get('keydown')!(key('KeyF'))
  await frames(2)
  expect(flips).toBe(1)
  expect(sent('fire')).toEqual([[]])
  expect(sent('h')).toEqual([])
  player.unbind()
})

test('a key release gives a function runs it when the key comes up, its repeats press nothing, and letting go of every key releases it', async () => {
  const { player } = await rangeRig()
  const heard: string[] = []
  player.bind({ press: { a: () => heard.push('down') }, release: { a: () => heard.push('up') } })
  on.get('keydown')!(key('KeyA'))
  on.get('keydown')!(key('KeyA'))
  on.get('keyup')!(key('KeyA'))
  expect(heard).toEqual(['down', 'up'])
  on.get('keydown')!(key('KeyA'))
  player.unbind()
  expect(heard).toEqual(['down', 'up', 'down', 'up'])
})

test('a key that goes down in a field of the page is the field\'s: nothing is sent and nothing is run', async () => {
  const { player, frames, sent } = await rangeRig()
  let ran = 0
  player.bind({ press: { f: ['fire'], h: () => { ran++ } } })
  for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) {
    for (const code of ['KeyF', 'KeyH']) {
      on.get('keydown')!(key(code, { target }))
      on.get('keyup')!(key(code, { target }))
    }
  }
  await frames(2)
  expect(sent('fire')).toEqual([])
  expect(ran).toBe(0)
  on.get('keydown')!(key('KeyF', { target: { tagName: 'CANVAS' } }))
  on.get('keydown')!(key('KeyH', { target: { tagName: 'CANVAS' } }))
  await frames(2)
  expect(sent('fire')).toEqual([[]])
  expect(ran).toBe(1)
  player.unbind()
})

test('an axis key may be a list of keys, any of which holds its side', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ axis: [{ keys: [['q', 'Home'], 'e'], send: (v: number) => ['aim', v, 0] }] })
  on.get('keydown')!(key('Home'))
  on.get('keydown')!(key('KeyQ'))
  on.get('keyup')!(key('Home'))
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0]])
  on.get('keyup')!(key('KeyQ'))
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0], [0, 0]])
  player.unbind()
})

test('a table without pointer takes no pointer lock, and unbind gives back the lock one with pointer took', async () => {
  const { player } = await rangeRig()
  player.bind({ click: () => undefined })
  on.get('click')!(click)
  expect(page.pointerLockElement).toBe(null)
  player.bind({ pointer: () => undefined })
  on.get('click')!(click)
  expect(page.pointerLockElement).toBe(canvas)
  player.unbind()
  expect(page.pointerLockElement).toBe(null)
})

// A letter is one key whether Shift is down or not: the page types it in capitals while Shift is
// held, and the table names it in lower case, so a key held across Shift's press or release is let
// go when it comes up either way.
test('a letter is one key with Shift or without: a table names it in lower case', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ axis: [{ keys: ['s', 'w'], send: (v: number) => ['aim', v, 0] }], press: { f: ['fire'] } })
  on.get('keydown')!(key('ShiftLeft'))
  on.get('keydown')!(key('KeyW', { key: 'W' }))
  on.get('keydown')!(key('KeyF', { key: 'F' }))
  on.get('keyup')!(key('ShiftLeft'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0]])
  expect(sent('fire')).toEqual([[]])
  on.get('keyup')!(key('KeyW'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  on.get('keydown')!(key('KeyS'))
  on.get('keydown')!(key('ShiftLeft'))
  on.get('keyup')!(key('KeyS', { key: 'S' }))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [-1, 0], [0, 0]])
  player.unbind()
})

// A digit or a punctuation key types another character under Shift: `1` goes down, and `!` comes up
// with Shift held. The key is its place on the keyboard, so it is let go all the same, and one
// pressed under Shift is the key the table names.
test('a digit or punctuation key let go under Shift is let go, and one pressed under Shift is held', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ axis: [{ keys: ['1', '['], send: (v: number) => ['aim', v, 0] }], press: { '/': ['fire'] } })
  on.get('keydown')!(key('Digit1'))
  on.get('keydown')!(key('ShiftLeft'))
  on.get('keyup')!(key('Digit1', { key: '!' }))
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0], [0, 0]])
  on.get('keydown')!(key('BracketLeft', { key: '{' }))
  on.get('keydown')!(key('Slash', { key: '?' }))
  on.get('keyup')!(key('ShiftLeft'))
  on.get('keyup')!(key('Slash'))
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0], [0, 0], [1, 0]])
  expect(sent('fire')).toEqual([[]])
  on.get('keyup')!(key('BracketLeft'))
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0], [0, 0], [1, 0], [0, 0]])
  player.unbind()
})

test('a key is named by its place: what it types on a US keyboard without Shift, one name for both sides of a modifier; keyCode runs it backwards', () => {
  const names = {
    KeyA: 'a', KeyZ: 'z', Digit0: '0', Digit9: '9', Numpad0: '0', Numpad7: '7', Space: ' ',
    ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control', AltLeft: 'Alt', AltRight: 'Alt',
    MetaLeft: 'Meta', MetaRight: 'Meta', OSLeft: 'Meta', OSRight: 'Meta',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
    Comma: ',', Period: '.', Slash: '/',
    NumpadDecimal: '.', NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadEnter: 'Enter', NumpadEqual: '=', NumpadComma: ',',
    ArrowLeft: 'ArrowLeft', ArrowUp: 'ArrowUp', Escape: 'Escape', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', F1: 'F1', F12: 'F12', Home: 'Home', PageDown: 'PageDown', CapsLock: 'CapsLock', IntlBackslash: 'IntlBackslash',
  }
  for (const [code, name] of Object.entries(names)) expect([code, keyName(code)]).toEqual([code, name])
  // Run backwards, a name is the main keyboard's key, and the left of a pair.
  const codes = { a: 'KeyA', W: 'KeyW', '0': 'Digit0', ' ': 'Space', Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft', '-': 'Minus', '=': 'Equal', '.': 'Period', '/': 'Slash', ',': 'Comma', '\\': 'Backslash', "'": 'Quote', '[': 'BracketLeft', Enter: 'Enter', Escape: 'Escape', ArrowDown: 'ArrowDown', Tab: 'Tab', '+': '+', '*': '*' }
  for (const [name, code] of Object.entries(codes)) expect([name, keyCode(name)]).toEqual([name, code])
  for (const name of Object.values(names)) expect(keyName(keyCode(name))).toBe(name)
})

// An on-screen keyboard's key has no place, and its `code` is empty: it is named by what it typed.
test('a key with no place on the keyboard is named by what it typed, a letter in lower case', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ axis: [{ keys: ['s', 'w'], send: (v: number) => ['aim', v, 0] }] })
  on.get('keydown')!({ code: '', key: 'W' })
  await frames(2)
  on.get('keyup')!({ code: '', key: 'w' })
  await frames(2)
  on.get('keydown')!({ code: 'Unidentified', key: 's' })
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [-1, 0]])
  player.unbind()
})

// A click on a canvas render2d's `fit` draws at three CSS pixels a canvas pixel: the page says
// where in CSS pixels, and `click` and the UI hear canvas pixels.
test('a click\'s page pixels reach `click` and the UI divided by the renderer\'s scale', async () => {
  const { player, plugins, frames, sent } = await rangeRig()
  const hits: number[][] = []
  plugins.ui = { hit: (x: number, y: number) => { hits.push([x, y]); return false }, took: () => false, modal: () => undefined }
  Object.defineProperty(plugins.render3d, 'scale', { value: 3, configurable: true })
  try {
    player.bind({ click: (x: number, y: number) => ['aim', x, y] })
    on.get('click')!({ ...click, offsetX: 450, offsetY: 30 })
    await frames(2)
    expect(sent('aim')).toEqual([[150, 10]])
    expect(hits).toEqual([[150, 10]])
  } finally {
    delete plugins.render3d.scale
    player.unbind()
  }
})

// ---------------------------------------------------------------- gamepads

// The gamepads `navigator.getGamepads` hands back, as the browser's: a list with a hole where a
// gamepad was unplugged, each with its buttons in the standard mapping's order, its axes, and
// `connected`.
type Effect = { startDelay: number; duration: number; strongMagnitude: number; weakMagnitude: number }
type Pad = {
  id?: string; mapping?: string; connected: boolean; buttons: { pressed: boolean; value: number }[]; axes: number[]
  vibrationActuator?: { playEffect: (type: string, params: Effect) => Promise<string> }
}
const gamepads: (Pad | null)[] = []
const gamepad = () => {
  const p: Pad = { connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] }
  gamepads.push(p)
  return p
}
const push = (p: Pad, i: number, down: boolean) => { p.buttons[i] = { pressed: down, value: down ? 1 : 0 } }
// A trigger squeezed `value` of the way to the floor, pressed as the browser calls it once it moves.
const squeeze = (p: Pad, i: number, value: number) => { p.buttons[i] = { pressed: value > 0, value } }
const plugged = async (f: () => Promise<void>) => {
  gamepads.length = 0
  vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { getGamepads: () => gamepads }))
  try {
    await f()
  } finally {
    vi.unstubAllGlobals()
    gamepads.length = 0
  }
}

test('a gamepad button is a key: sent from press the frame it goes down, once, held while it is down, and heard by every', () => plugged(async () => {
  const { player, frames, sent } = await rangeRig()
  gamepads.push(null)
  const pad = gamepad()
  player.bind({
    press: { Pad0: ['fire'] },
    hold: [{ keys: ['Pad7', 'Control'], send: (v: number) => ['aim', v, 0] }],
    every: (held: (key: string) => boolean) => (held('Pad3') ? ['aim', 0, 9] : undefined),
  })
  push(pad, 0, true)
  await frames(3)
  expect(sent('fire')).toEqual([[]])
  push(pad, 0, false)
  await frames(1)
  push(pad, 0, true)
  await frames(1)
  expect(sent('fire')).toEqual([[], []])
  push(pad, 7, true)
  await frames(2)
  on.get('keydown')!(key('ControlLeft'))
  push(pad, 7, false)
  await frames(2)
  on.get('keyup')!(key('ControlLeft'))
  push(pad, 3, true)
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [0, 9], [0, 9]])
  // A gamepad unplugged lets go of what it held.
  pad.connected = false
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [0, 9], [0, 9]])
  player.unbind()
}))

// Two gamepads, and a d-pad and the left stick beside the keys: any of them holds a side.
test('the left stick past the dead zone and the d-pad hold a side of a stick as its keys do, on any gamepad connected', () => plugged(async () => {
  const { player, frames, sent } = await rangeRig({ deadzone: 0.5 })
  const one = gamepad(), two = gamepad()
  player.bind({ stick: [{ keys: [['ArrowLeft', 'a', 'Pad14', 'PadStickLeft'], ['ArrowRight', 'd', 'Pad15', 'PadStickRight'], ['ArrowUp', 'w', 'Pad12', 'PadStickUp'], ['ArrowDown', 's', 'Pad13', 'PadStickDown']], send: (x: number, y: number) => ['aim', x, y] }] })
  one.axes = [-0.4, 0.2]
  await frames(2)
  expect(sent('aim')).toEqual([])
  one.axes = [-0.6, 0.2]
  await frames(2)
  one.axes = [0.7, 0.9]
  await frames(2)
  // Pushed right on one and up on the other's d-pad: right and up together.
  one.axes = [0.7, 0]
  push(two, 12, true)
  await frames(2)
  one.axes = [0, 0]
  await frames(2)
  push(two, 12, false)
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0], [1, 1], [1, -1], [0, -1], [0, 0]])
  // The d-pad and the keys hold one side together: it is let go when the last of them is.
  push(one, 14, true)
  on.get('keydown')!(key('KeyA'))
  await frames(2)
  push(one, 14, false)
  await frames(2)
  on.get('keyup')!(key('KeyA'))
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0], [1, 1], [1, -1], [0, -1], [0, 0], [-1, 0], [0, 0]])
  player.unbind()
}))

test('a table that binds a side of a stick throws when the scene gives no world.player.deadzone, and without one the sticks hold nothing', () => plugged(async () => {
  const { player, frames, sent } = await rangeRig()
  const pad = gamepad()
  pad.axes = [-1, 0]
  player.bind({ every: (held: (key: string) => boolean) => (held('PadStickLeft') ? ['aim', -1, 0] : undefined), press: { Pad0: ['fire'] } })
  push(pad, 0, true)
  await frames(2)
  expect(sent('aim')).toEqual([])
  expect(sent('fire')).toEqual([[]])
  player.bind({ axis: [{ keys: ['PadStickLeft', 'PadStickRight'], send: (v: number) => ['aim', v, 0] }] })
  await expect(frames(1)).rejects.toThrow('the player table holds a side of a stick, and the scene gives no world.player.deadzone')
  player.bind({ hold: [{ keys: ['PadRightStickUp'], send: (v: number) => ['aim', v, 0] }] })
  await expect(frames(1)).rejects.toThrow('the player table holds a side of a stick, and the scene gives no world.player.deadzone')
  player.unbind()
}))

// While a modal has the input, no gamepad key goes down; one held as it came up is held only when
// it is pressed again, as a key is.
test('while a modal has the input a gamepad button is not the game\'s, and one held through it is held again only on a new press', () => plugged(async () => {
  const { player, plugins, frames, sent } = await rangeRig()
  let up: string | undefined
  plugins.ui = { hit: () => false, took: () => false, modal: () => up }
  const pad = gamepad()
  player.bind({ hold: [{ keys: ['Pad1'], send: (v: number) => ['aim', v, 0] }], press: { Pad9: ['fire'] } })
  push(pad, 1, true)
  await frames(2)
  up = 'pause'
  await frames(2)
  push(pad, 9, true)
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  expect(sent('fire')).toEqual([])
  up = undefined
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  push(pad, 1, false)
  push(pad, 9, false)
  await frames(1)
  push(pad, 1, true)
  push(pad, 9, true)
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [1, 0]])
  expect(sent('fire')).toEqual([[]])
  player.unbind()
}))

// The button that pressed a menu's button to move the seat is still down on the next scene's first
// frame: it was pressed before that client, and presses nothing there until it is pressed again.
test('a gamepad button already down on a client\'s first frame is held only on a new press, on either avenue', () => plugged(async () => {
  const pad = gamepad()
  push(pad, 0, true)
  // The rig's first frames read the pad with the button down.
  const keys = await rangeRig()
  keys.player.bind({ press: { Pad0: ['fire'] }, hold: [{ keys: ['Pad0'], send: (v: number) => ['aim', v, 0] }] })
  await keys.frames(3)
  expect(keys.sent('fire')).toEqual([])
  expect(keys.sent('aim')).toEqual([])
  push(pad, 0, false)
  await keys.frames(1)
  push(pad, 0, true)
  await keys.frames(1)
  expect(keys.sent('fire')).toEqual([[]])
  expect(keys.sent('aim')).toEqual([[1, 0]])
  keys.player.unbind()
  push(pad, 0, true)
  // On the action avenue the UI, which on a client's first frame has not ticked, is not offered it
  // either, nor after: it is offered only the new press.
  const actions = await actionRig({ actions: { shoot: ['Pad0'] } })
  let asked = 0
  actions.plugins.ui = { hit: () => false, took: () => false, modal: () => undefined, keyDown: () => { asked++; return false }, keyUp: () => {} }
  actions.player.control({ press: { shoot: ['fire'] } })
  await actions.frames(3)
  expect(asked).toBe(0)
  expect(actions.sent('fire')).toEqual([])
  push(pad, 0, false)
  await actions.frames(1)
  push(pad, 0, true)
  await actions.frames(1)
  expect(asked).toBe(1)
  expect(actions.sent('fire')).toEqual([[]])
  actions.player.unbind()
}))

// Read analog, a trigger sends how far it is squeezed and a stick how far past the dead zone it is
// pushed, each in whole tenths here; read as keys, the same trigger sends 1 however lightly it is held.
test('an axis, a stick and a hold read analog send how far their keys hold them, in whole steps of world.player.resolution, a key of the keyboard all the way', () => plugged(async () => {
  const { player, frames, sent } = await rangeRig({ deadzone: 0.2, resolution: 10 })
  const pad = gamepad()
  player.bind({
    axis: [{ keys: [['ArrowDown', 'Pad6'], ['ArrowUp', 'Pad7']], send: (v: number) => ['pedal', v], analog: true }],
    stick: [
      { keys: ['PadStickLeft', 'PadStickRight', 'PadStickUp', 'PadStickDown'], send: (x: number, y: number) => ['steer', x, y], analog: true },
      { keys: ['PadRightStickLeft', 'PadRightStickRight', 'PadRightStickUp', 'PadRightStickDown'], send: (x: number, y: number) => ['look', x, y], analog: true },
    ],
    hold: [
      { keys: ['Pad6'], send: (v: number) => ['grip', v], analog: true },
      { keys: ['Pad7'], send: (v: number) => ['fire', v] },
    ],
  })
  squeeze(pad, 7, 0.5)
  await frames(2)
  // Inside the same tenth sends nothing; into the next sends it.
  squeeze(pad, 7, 0.53)
  await frames(2)
  squeeze(pad, 7, 0.56)
  await frames(2)
  // The left trigger a quarter down alone: a half step rounded away from the middle.
  squeeze(pad, 7, 0)
  squeeze(pad, 6, 0.25)
  await frames(2)
  squeeze(pad, 6, 0)
  await frames(2)
  // A key of the keyboard is held all the way, and the most of a side's keys is that side's.
  on.get('keydown')!(key('ArrowUp'))
  squeeze(pad, 7, 0.3)
  await frames(2)
  // The key let go of leaves the trigger's 0.3, sent the moment the key comes up.
  on.get('keyup')!(key('ArrowUp'))
  await frames(2)
  squeeze(pad, 7, 0)
  await frames(2)
  expect(sent('pedal')).toEqual([[0.5], [0.6], [-0.3], [0], [1], [0.3], [0]])
  expect(sent('grip')).toEqual([[0.3], [0]])
  expect(sent('fire')).toEqual([[1], [0], [1], [0]])
  // A stick past the dead zone is 0 at it and 1 at the rim: 0.6 out past 0.2 is half of the rest.
  pad.axes = [0.6, -1, -0.6, 0.1]
  await frames(2)
  pad.axes = [0.1, 0, 0, 0]
  await frames(2)
  expect(sent('steer')).toEqual([[0.5, -1], [0, 0]])
  expect(sent('look')).toEqual([[-0.5, 0], [0, 0]])
  player.unbind()
}))

test('a table that reads anything analog throws in a scene whose world.player.resolution is not a whole number of steps above 0', () => plugged(async () => {
  for (const resolution of [undefined, 0, 2.5]) {
    const { player, frames } = await rangeRig({ deadzone: 0.2, resolution })
    gamepad()
    player.bind({ hold: [{ keys: ['Pad7'], send: (v: number) => ['fire', v], analog: true }] })
    await expect(frames(1)).rejects.toThrow(`the player table reads a key analog, and the scene's world.player.resolution is ${resolution}, not a whole number of steps above 0`)
    player.unbind()
  }
}))

// The pad the player has in their hands shakes; one left on the desk does not, and none does while
// they are on the keyboard.
test('rumble shakes the gamepad that last had a key go down, and none once a key or a mouse button went down after it', () => plugged(async () => {
  const { player, frames } = await rangeRig({ deadzone: 0.2 })
  const shook: [string, string, Effect][] = []
  const one = gamepad(), two = gamepad(), bare = gamepad()
  // A rumble cut short by the next is rejected by the browser, and that is no failure.
  one.vibrationActuator = { playEffect: (type, params) => { shook.push(['one', type, params]); return Promise.reject(new Error('preempted')) } }
  two.vibrationActuator = { playEffect: (type, params) => { shook.push(['two', type, params]); return Promise.resolve('complete') } }
  player.bind({ press: { Pad0: ['fire'] } })
  const shake = { strong: 1, weak: 0.5, seconds: 0.2 }
  const effect = { startDelay: 0, duration: 200, strongMagnitude: 1, weakMagnitude: 0.5 }
  player.rumble(shake)
  expect(shook).toEqual([])
  push(two, 0, true)
  await frames(2)
  player.rumble(shake)
  expect(shook).toEqual([['two', 'dual-rumble', effect]])
  on.get('keydown')!(key('KeyK'))
  player.rumble(shake)
  // A side of a stick pushed past the dead zone is a key going down too, a button never let go of not.
  one.axes = [0.9, 0, 0, 0]
  await frames(2)
  player.rumble(shake)
  on.get('mousedown')!({ button: 0 })
  player.rumble(shake)
  expect(shook).toEqual([['two', 'dual-rumble', effect], ['one', 'dual-rumble', effect]])
  // A gamepad the browser gives no actuator shakes nothing and throws nothing.
  push(bare, 3, true)
  await frames(2)
  player.rumble(shake)
  expect(shook.length).toBe(2)
  for (const bad of [{ strong: 1.5, weak: 0, seconds: 1 }, { strong: 0, weak: -0.1, seconds: 1 }, { strong: 0.5, weak: 0.5, seconds: 0 }]) {
    expect(() => player.rumble(bad)).toThrow(`a rumble's strong and weak are 0 to 1 and its seconds above 0, not ${bad.strong}, ${bad.weak} and ${bad.seconds}`)
  }
  player.unbind()
}))

// A screen that shows what the plugin hears reads it back: the gamepads as the last read found them,
// and every key held, by the names tables give them.
test('pads hands back every gamepad the last read found, copied, the one last used marked, and held every key held by its name', () => plugged(async () => {
  const { player, frames } = await rangeRig({ deadzone: 0.2 })
  expect(player.pads()).toEqual([])
  gamepads.push(null)
  const xbox = gamepad(), other = gamepad()
  xbox.id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'
  xbox.mapping = 'standard'
  other.id = 'Generic USB Joystick (Vendor: 0079 Product: 0006)'
  other.mapping = ''
  player.bind({ press: { Pad0: ['fire'] } })
  squeeze(xbox, 7, 0.4)
  xbox.axes = [0.5, -0.1, 0, 1]
  push(other, 3, true)
  await frames(1)
  const read = player.pads()
  expect(read.map((p: { index: number; family: string; mapping: string; used: boolean }) => [p.index, p.family, p.mapping, p.used])).toEqual([[1, 'xbox', 'standard', false], [2, 'pad', '', true]])
  expect(read[0].id).toBe(xbox.id)
  expect(read[0].buttons[7]).toEqual({ pressed: true, value: 0.4 })
  expect(read[0].axes).toEqual([0.5, -0.1, 0, 1])
  expect(read[1].buttons[3]).toEqual({ pressed: true, value: 1 })
  // Copies: the page may keep them, and they are not the gamepads the browser hands on.
  read[0].axes[0] = 9
  expect(player.pads()[0].axes[0]).toBe(0.5)
  expect(read[0].buttons).not.toBe(xbox.buttons)
  // The keys held, a key, a mouse button and the pad's, by name, in the order they went down.
  on.get('keydown')!(key('ShiftLeft'))
  on.get('mousedown')!({ button: 2 })
  await frames(1)
  expect(player.held()).toEqual(['Pad7', 'PadStickRight', 'PadRightStickDown', 'Pad3', 'Shift', 'Mouse2'])
  expect(player.pads().map((p: { used: boolean }) => p.used)).toEqual([false, false])
  on.get('keyup')!(key('ShiftLeft'))
  on.get('mouseup')!({ button: 2 })
  squeeze(xbox, 7, 0)
  xbox.axes = [0, 0, 0, 0]
  push(other, 3, false)
  await frames(1)
  expect(player.held()).toEqual([])
  // Unplugged, a gamepad is not read.
  other.connected = false
  await frames(1)
  expect(player.pads().map((p: { index: number }) => p.index)).toEqual([1])
  player.unbind()
}))

// Tab moves the focus off the page and the right button opens a menu, unless the page cancels them.
test('a key or a mouse button the table binds has its browser default cancelled, and one it does not bind keeps it', async () => {
  const { player } = await rangeRig()
  cancelled.clear()
  player.bind({ press: { Tab: ['fire'] }, stick: [{ keys: ['a', 'd', 'w', 's'], send: (x: number, y: number) => ['aim', x, y] }] })
  on.get('keydown')!(key('Tab'))
  on.get('keydown')!(key('KeyD', { key: 'D' }))
  on.get('keydown')!(key('KeyK'))
  on.get('contextmenu')!({})
  expect(cancelled.get('keydown')).toBe(2)
  expect(cancelled.get('contextmenu')).toBeUndefined()
  player.bind({ hold: [{ keys: ['Mouse2'], send: (v: number) => ['aim', v, 0] }] })
  on.get('contextmenu')!({})
  on.get('mousedown')!({ button: 2 })
  expect(cancelled.get('contextmenu')).toBe(1)
  expect(cancelled.get('mousedown')).toBe(1)
  player.unbind()
})

// Control, Command or Alt held is a browser shortcut: zoom on Control =, find on Control F.
test('a bound key keeps its browser default while Control, Command or Alt is down', async () => {
  const { player, frames, sent } = await rangeRig()
  cancelled.clear()
  player.bind({ press: { f: ['fire'], '=': ['fire'] } })
  on.get('keydown')!(key('KeyF', { ctrlKey: true }))
  on.get('keyup')!(key('KeyF'))
  on.get('keydown')!(key('Equal', { metaKey: true }))
  on.get('keyup')!(key('Equal'))
  on.get('keydown')!(key('KeyF', { key: 'F', altKey: true }))
  on.get('keyup')!(key('KeyF'))
  expect(cancelled.get('keydown')).toBeUndefined()
  on.get('mousedown')!({ button: 2, ctrlKey: true })
  expect(cancelled.get('mousedown')).toBeUndefined()
  on.get('keydown')!(key('KeyF'))
  expect(cancelled.get('keydown')).toBe(1)
  await frames(2)
  expect(sent('fire').length).toBe(4)
  player.unbind()
})

// A drag is the mouse moved with a key held, the right button say, while the page holds no pointer
// lock: the pixels it moved across and down are added up and sent once a frame. Once a click has
// taken the lock, the movement is `pointer`'s and the drag sends nothing.
test('a drag sends the pixels the mouse moved while its key is held and the page holds no pointer lock, once a frame', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ drag: { key: 'Mouse2', send: (dx: number, dy: number) => ['aim', dx, dy] }, pointer: (dx: number) => ['aim', dx, 99] })
  on.get('mousemove')!({ movementX: 4, movementY: 1 })
  await frames(1)
  on.get('mousedown')!({ button: 2 })
  on.get('mousemove')!({ movementX: 4, movementY: 1 })
  on.get('mousemove')!({ movementX: 3, movementY: -2 })
  await frames(2)
  expect(sent('aim')).toEqual([[7, -1]])
  on.get('mouseup')!({ button: 2 })
  on.get('mousemove')!({ movementX: 5, movementY: 5 })
  await frames(2)
  expect(sent('aim')).toEqual([[7, -1]])
  on.get('click')!(click)
  on.get('mousedown')!({ button: 2 })
  on.get('mousemove')!({ movementX: 2, movementY: 0 })
  await frames(2)
  expect(sent('aim')).toEqual([[7, -1], [2, 99]])
  player.unbind()
})

// Hover is where the pointer is, asked once a frame it moved: over the UI or off the page it is over
// nothing. A city's tool draws the cell under it from it.
test('hover is asked once a frame the pointer moved, with where it is, and with null over the UI or off the page', async () => {
  const { player, plugins, frames, sent } = await rangeRig()
  let overUi = false
  plugins.ui = { hit: () => overUi, took: () => false, modal: () => undefined }
  try {
    // The range's player has one act that takes two numbers, `aim`: null is sent as [-1, -1].
    player.bind({ hover: (at: [number, number] | null) => ['aim', ...(at ?? [-1, -1])] })
    on.get('mousemove')!({ offsetX: 10, offsetY: 20 })
    on.get('mousemove')!({ offsetX: 30, offsetY: 40 })
    await frames(2)
    expect(sent('aim')).toEqual([[30, 40]])
    overUi = true
    on.get('mousemove')!({ offsetX: 31, offsetY: 40 })
    await frames(1)
    overUi = false
    on.get('mouseout')!({ relatedTarget: {} })
    await frames(1)
    on.get('mouseout')!({ relatedTarget: null })
    await frames(1)
    expect(sent('aim')).toEqual([[30, 40], [-1, -1], [-1, -1]])
  } finally {
    player.unbind()
  }
})

// A stroke is a drag with where it began and ended: a road laid from the cell pressed to the cell
// let go, the cells between drawn as the mouse moves. A press on the UI is the UI's and begins none;
// a modal letting every key go cancels one.
test('a stroke asks start where its button went down, move once a frame it moved, and end where it came up; a modal cancels it', async () => {
  const { player, plugins, frames, sent } = await rangeRig()
  let overUi = false, modal: object | undefined
  plugins.ui = { hit: () => overUi, took: () => false, modal: () => modal }
  try {
    // The range's player has one act that takes two numbers, `aim`: each call is told by a thousands
    // mark on its y, start 1000, move 2000, end 3000 and cancel 4000.
    player.bind({ stroke: { key: 'Mouse0', start: (x: number, y: number) => ['aim', x, 1000 + y], move: (x: number, y: number) => ['aim', x, 2000 + y], end: (x: number, y: number) => ['aim', x, 3000 + y], cancel: () => ['aim', 0, 4000] } })
    const calls = (mark: number) => sent('aim').filter(([, y]) => Math.floor((y as number) / 1000) === mark).map(([x, y]) => [x, (y as number) - mark * 1000])
    on.get('mousemove')!({ offsetX: 1, offsetY: 1 })
    await frames(1)
    expect(sent('aim')).toEqual([])
    on.get('mousedown')!({ button: 0, offsetX: 1, offsetY: 2 })
    on.get('mousemove')!({ offsetX: 3, offsetY: 4 })
    on.get('mousemove')!({ offsetX: 5, offsetY: 6 })
    await frames(1)
    await frames(1)
    on.get('mouseup')!({ button: 0, offsetX: 7, offsetY: 8 })
    on.get('mousemove')!({ offsetX: 9, offsetY: 9 })
    await frames(2)
    expect([calls(1), calls(2), calls(3)]).toEqual([[[1, 2]], [[5, 6]], [[7, 8]]])
    // Another button, or a press on the UI, begins no stroke.
    on.get('mousedown')!({ button: 2, offsetX: 1, offsetY: 1 })
    on.get('mouseup')!({ button: 2, offsetX: 1, offsetY: 1 })
    overUi = true
    on.get('mousedown')!({ button: 0, offsetX: 1, offsetY: 1 })
    on.get('mouseup')!({ button: 0, offsetX: 1, offsetY: 1 })
    overUi = false
    await frames(2)
    expect([calls(1).length, calls(3).length]).toEqual([1, 1])
    // A modal lets it go: cancel, and its release then ends nothing.
    on.get('mousedown')!({ button: 0, offsetX: 2, offsetY: 2 })
    await frames(1)
    modal = {}
    await frames(1)
    modal = undefined
    on.get('mouseup')!({ button: 0, offsetX: 3, offsetY: 3 })
    await frames(2)
    expect([calls(1), calls(3), calls(4)]).toEqual([[[1, 2], [2, 2]], [[7, 8]], [[0, 0]]])
  } finally {
    player.unbind()
  }
})

// A locked key is the game's only while the page holds the pointer lock: a strike on the left button
// and a block on the right, which without the lock take the lock and drag the camera. The lock lost
// while one is held lets it go, as its release would.
test('a locked key is heard only while the page holds the pointer lock, and losing the lock lets it go', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ press: { Mouse0: ['fire'] }, hold: [{ keys: ['Mouse2'], send: (v: number) => ['aim', v, 0] }], locked: ['Mouse0', 'Mouse2'], pointer: () => undefined })
  on.get('mousedown')!({ button: 0 })
  on.get('mousedown')!({ button: 2 })
  await frames(2)
  expect(sent('fire')).toEqual([])
  expect(sent('aim')).toEqual([])
  on.get('mouseup')!({ button: 0 })
  on.get('mouseup')!({ button: 2 })
  on.get('click')!(click)
  expect(page.pointerLockElement).toBe(canvas)
  on.get('mousedown')!({ button: 0 })
  on.get('mousedown')!({ button: 2 })
  await frames(2)
  expect(sent('fire')).toEqual([[]])
  expect(sent('aim')).toEqual([[1, 0]])
  page.pointerLockElement = null
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  // The lock back with the button still down: not held until it is pressed again.
  on.get('click')!(click)
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  on.get('mouseup')!({ button: 2 })
  on.get('mousedown')!({ button: 2 })
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [1, 0]])
  on.get('mouseup')!({ button: 2 })
  on.get('mouseup')!({ button: 0 })
  // A button already down when a click takes the lock is not held.
  page.pointerLockElement = null
  await frames(1)
  on.get('mousedown')!({ button: 2 })
  on.get('click')!(click)
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [1, 0], [0, 0]])
  player.unbind()
})

// Losing the lock (Escape does it in a browser) lets go of every key held, and a key still down is
// held again only when it is pressed again.
test('every key held is let go the frame the pointer lock is lost, and is held again only on a new press', async () => {
  const { player, frames, sent } = await rangeRig()
  player.bind({ axis: [{ keys: ['s', 'w'], send: (v: number) => ['aim', v, 0] }], pointer: () => undefined })
  on.get('click')!(click)
  on.get('keydown')!(key('KeyW'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0]])
  page.pointerLockElement = null
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  on.get('click')!(click)
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  on.get('keydown')!(key('KeyW'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [1, 0]])
  player.unbind()
})

// The wheel's turn, in pixels down, is added up and sent once a frame it turned, and the page does
// not scroll under it.
test('the wheel is asked once a frame it turned, with the pixels it turned down, and the page does not scroll', async () => {
  const { player, frames, sent } = await rangeRig()
  cancelled.clear()
  player.bind({ wheel: (dy: number) => ['aim', 0, dy] })
  on.get('wheel')!({ deltaY: 100 })
  on.get('wheel')!({ deltaY: -30 })
  await frames(2)
  expect(sent('aim')).toEqual([[0, 70]])
  expect(cancelled.get('wheel')).toBe(2)
  // Under Control, Command or Alt the wheel keeps its default, so the browser zooms (a trackpad's
  // pinch is the wheel under Control), and the game still hears it.
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) on.get('wheel')!({ deltaY: 10, [mod]: true })
  await frames(2)
  expect(sent('aim')).toEqual([[0, 70], [0, 30]])
  expect(cancelled.get('wheel')).toBe(2)
  player.unbind()
})

// The scene's UI is asked first. This one has something that takes the pointer left of x 100, and
// takes the key `q`, as it takes every key while a modal panel holds anything.
test('a click, a mouse button or a key the UI takes is not the game\'s', async () => {
  const { player, plugins, frames, sent } = await rangeRig()
  plugins.ui = { hit: (x: number) => x < 100, took: (e: { key: string }) => e.key === 'q', modal: () => undefined }
  player.bind({ press: { Mouse0: ['fire'], q: ['fire'] }, click: (x: number, y: number) => ['aim', x, y] })
  const at = (x: number) => ({ ...click, button: 0, offsetX: x, offsetY: 10 })
  on.get('mousedown')!(at(50))
  on.get('mouseup')!(at(50))
  on.get('click')!(at(50))
  on.get('keydown')!(key('KeyQ'))
  on.get('keyup')!(key('KeyQ'))
  await frames(2)
  expect(sent('fire')).toEqual([])
  expect(sent('aim')).toEqual([])
  on.get('mousedown')!(at(150))
  on.get('mouseup')!(at(150))
  on.get('click')!(at(150))
  await frames(2)
  expect(sent('fire')).toEqual([[]])
  expect(sent('aim')).toEqual([[150, 10]])
  player.unbind()
})

// While a modal has the input, the game holds nothing: a held key's axis and a held button's hold
// go back to 0 as their release would send them, a held button stops being held, and the pointer
// lock this plugin took is given back. This UI says a modal is up from the moment `up` is set.
test('while a modal has the input, every key and button the game held is let go, and so is the pointer lock', async () => {
  const { player, plugins, frames, sent } = await rangeRig()
  let up: string | undefined
  plugins.ui = { hit: () => false, took: () => false, modal: () => up }
  player.bind({
    axis: [{ keys: ['s', 'w'], send: (v: number) => ['aim', v, 0] }],
    hold: [{ keys: ['Control'], send: (v: number) => ['aim', 0, v] }],
    every: (held: (key: string) => boolean) => (held('Mouse0') ? ['fire'] : undefined),
    pointer: () => undefined,
  })
  on.get('click')!(click)
  expect(page.pointerLockElement).toBe(canvas)
  on.get('keydown')!(key('KeyW'))
  on.get('keydown')!(key('ControlLeft'))
  on.get('mousedown')!({ button: 0 })
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 1]])
  expect(sent('fire').length).toBe(2)
  up = 'pause'
  await frames(3)
  expect(sent('aim')).toEqual([[1, 0], [0, 1], [0, 0], [0, 0]])
  expect(sent('fire').length).toBe(2)
  expect(page.pointerLockElement).toBe(null)
  player.unbind()
})

// ---------------------------------------------------------------- the action avenue (`control`)

// The range as `rangeRig` makes it, with `world.player` written over the range's, its `actions` each
// labelled by its name, as a scene file would give them; with `store`, the scene lists the store
// `before` the player, as a scene whose player rebinds does, or `after` it.
type World = { actions?: Record<string, Bound>; deadzone?: number; repeat?: number; resolution?: number }
async function actionRig(world: World = {}, store: false | 'before' | 'after' = false) {
  const truth = boot(structuredClone(rangeTop), { scenemanager })
  await load(truth, rangeHome)
  const shots: Msg[] = []
  const row = manager(truth)
  const wire = link(loopback(tapped(row, shots)))
  const [[name]] = entries(row)
  const s = structuredClone(scene(row, name).scene) as Scene
  const { actions = {}, ...rest } = world
  const player = { ...rest, actions: Object.fromEntries(Object.entries(actions).map(([n, keys]) => [n, { label: n, keys }])) }
  const plugins = s.plugins!.flatMap(p => (p !== 'player' || !store ? [p] : store === 'before' ? ['store', p] : [p, 'store']))
  const me = await client({ ...s, plugins, world: { ...s.world, player }, prefabs: { ...s.prefabs, ...(store ? { store: {} } : {}) } }, rangeHome)
  wire.hear(d => {
    if (!me.plugins.scenemanager.link) me.plugins.scenemanager.mount(wire, d.scene, d.seat)
    me.plugins.scenemanager.hand(d.packet)
  })
  me.plugins.render3d.canvas = { addEventListener: () => {}, style: {}, width: 800, height: 600 }
  const frames = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); pass(DT); await me.frame() } }
  const sent = (action: string) => shots.filter(m => m.action === action).map(m => m.args)
  await frames(5)
  return { player: me.plugins.player, plugins: me.plugins, link: wire, frames, sent }
}

test('control binds behaviour to the scene\'s actions: a press, a hold, an axis, a stick and a release, each from any of its keys', async () => {
  const { player, frames, sent } = await actionRig({ actions: { shoot: ['f', 'Mouse0'], grip: ['Control'], tilt: [['q'], ['e']], way: [['ArrowLeft', 'a'], ['ArrowRight', 'd'], ['ArrowUp', 'w'], ['ArrowDown', 's']], note: ['n', 'Mouse1'] } })
  const notes: string[] = []
  player.control({
    press: { shoot: ['fire'], note: () => notes.push('down') },
    release: { note: () => notes.push('up') },
    hold: { grip: (v: number) => ['aim', v, 100] },
    axis: { tilt: (v: number) => ['aim', v, 200] },
    stick: { way: (x: number, y: number) => ['aim', x, y] },
  })
  on.get('keydown')!(key('KeyF'))
  on.get('keyup')!(key('KeyF'))
  on.get('mousedown')!({ button: 0 })
  on.get('mouseup')!({ button: 0 })
  on.get('keydown')!(key('ControlLeft'))
  on.get('keydown')!(key('KeyE'))
  on.get('keydown')!(key('KeyD'))
  on.get('keydown')!(key('ArrowUp'))
  await frames(2)
  on.get('keyup')!(key('ControlLeft'))
  on.get('keyup')!(key('KeyE'))
  on.get('keyup')!(key('KeyD'))
  on.get('keyup')!(key('ArrowUp'))
  await frames(2)
  expect(sent('fire')).toEqual([[], []])
  expect(sent('aim')).toEqual([[1, 100], [1, 200], [1, 0], [1, -1], [0, 100], [0, 200], [0, -1], [0, 0]])
  // Two keys of one action with a release: pressed at the first, released at the last.
  on.get('keydown')!(key('KeyN'))
  on.get('mousedown')!({ button: 1 })
  on.get('keydown')!(key('KeyN', { repeat: true }))
  on.get('keyup')!(key('KeyN'))
  expect(notes).toEqual(['down'])
  on.get('mouseup')!({ button: 1 })
  expect(notes).toEqual(['down', 'up'])
  player.unbind()
})

test('control throws on an action the scene does not name and on one read in another shape, and every asks only of buttons', async () => {
  const { player, frames } = await actionRig({ actions: { shoot: ['f'], tilt: [['s'], ['w']] } })
  expect(() => player.control({ press: { fire: ['fire'] } })).toThrow("the player table's press names fire, which the scene's world.player.actions does not")
  expect(() => player.control({ axis: { shoot: (v: number) => ['aim', v, 0] } })).toThrow("the player table's axis reads shoot as a axis, and the scene gives it the keys of a button")
  expect(() => player.control({ locked: ['nothing'] })).toThrow("the player table's locked names nothing")
  player.control({ every: (held: (action: string) => boolean) => (held('tilt') ? ['fire'] : undefined) })
  await expect(frames(1)).rejects.toThrow('every asked whether tilt is held, and it is not a button')
  player.unbind()
})

test('bind and control replace each other as the table in force, and bind plays by keys as it always has', async () => {
  const { player, frames, sent } = await actionRig({ actions: { shoot: ['f'] } })
  player.control({ press: { shoot: ['fire'] } })
  player.bind({ press: { g: ['fire'] } })
  on.get('keydown')!(key('KeyF'))
  on.get('keyup')!(key('KeyF'))
  on.get('keydown')!(key('KeyG'))
  on.get('keyup')!(key('KeyG'))
  await frames(2)
  expect(sent('fire')).toEqual([[]])
  player.control({ press: { shoot: ['fire'] } })
  on.get('keydown')!(key('KeyG'))
  on.get('keyup')!(key('KeyG'))
  on.get('keydown')!(key('KeyF'))
  on.get('keyup')!(key('KeyF'))
  await frames(2)
  expect(sent('fire')).toEqual([[], []])
  player.unbind()
})

// What the player chose is the store's, the page's own table: the server is sent none of it.
test('an action rebound plays from its new keys and not its old, the store holds the choice, and restore gives back the scene\'s', async () => {
  const { player, plugins, link: page, frames, sent } = await actionRig({ actions: { shoot: ['f'], tilt: [['s'], ['w']] } }, 'before')
  player.control({ press: { shoot: ['fire'] }, axis: { tilt: (v: number) => ['aim', v, 0] } })
  player.rebind('shoot', ['g', 'Pad3'])
  player.rebind('tilt', [['ArrowDown'], ['ArrowUp']])
  expect(page.store['player.keys']).toEqual({ shoot: ['g', 'Pad3'], tilt: [['ArrowDown'], ['ArrowUp']] })
  expect(plugins.store.get('player.keys')).toBe(page.store['player.keys'])
  on.get('keydown')!(key('KeyF'))
  on.get('keyup')!(key('KeyF'))
  on.get('keydown')!(key('KeyW'))
  on.get('keyup')!(key('KeyW'))
  await frames(2)
  expect(sent('fire')).toEqual([])
  expect(sent('aim')).toEqual([])
  on.get('keydown')!(key('KeyG'))
  on.get('keydown')!(key('ArrowUp'))
  await frames(2)
  expect(sent('fire')).toEqual([[]])
  expect(sent('aim')).toEqual([[1, 0]])
  on.get('keyup')!(key('ArrowUp'))
  on.get('keyup')!(key('KeyG'))
  expect(() => player.rebind('tilt', ['q'])).toThrow('tilt is a axis and was given ["q"]')
  expect(() => player.rebind('shoot', [['q'], ['e']])).toThrow('shoot is a button and was given [["q"],["e"]]')
  expect(() => player.rebind('nothing', ['q'])).toThrow("the scene's world.player.actions names no nothing")
  player.restore('shoot')
  expect(page.store['player.keys']).toEqual({ tilt: [['ArrowDown'], ['ArrowUp']] })
  on.get('keydown')!(key('KeyF'))
  await frames(2)
  expect(sent('fire')).toEqual([[], []])
  player.restore()
  expect(page.store['player.keys']).toEqual({})
  player.unbind()
})

test('a scene that lists no store plays its own keys and keeps no choice, and one that lists it after the player throws', async () => {
  const { player } = await actionRig({ actions: { shoot: ['f'] } })
  player.control({ press: { shoot: ['fire'] } })
  expect(() => player.rebind('shoot', ['g'])).toThrow('the scene lists no store, so nothing the player changes can be kept')
  expect(() => player.configure({ repeat: 0.2 })).toThrow('the scene lists no store')
  expect(player.settings()).toEqual({ toggle: [], deadzone: undefined, repeat: 0 })
  player.unbind()
  const late = await actionRig({ actions: { shoot: ['f'] } }, 'after')
  expect(() => late.player.control({ press: { shoot: ['fire'] } })).toThrow('store is listed after player, so the player would read the store of the frame before')
  late.player.unbind()
})

// A hold played as a toggle: the first press holds it and the next lets it go, sending what a held
// key sends; a modal, like every key, lets it go.
test('a toggle holds its action from one press to the next and sends the 1 and 0 a held key sends, and a modal lets it go', async () => {
  const { player, plugins, frames, sent } = await actionRig({ actions: { grip: ['Control', 'Pad7'] } }, 'before')
  let up: string | undefined
  plugins.ui = { hit: () => false, took: () => false, modal: () => up }
  player.control({ hold: { grip: (v: number) => ['aim', v, 0] } })
  player.configure({ toggle: ['grip'] })
  expect(plugins.store.get('player.toggle')).toEqual(['grip'])
  expect(player.settings().toggle).toEqual(['grip'])
  on.get('keydown')!(key('ControlLeft'))
  on.get('keyup')!(key('ControlLeft'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0]])
  // The keyboard's repeat of a key already down turns nothing.
  on.get('keydown')!(key('ControlLeft'))
  on.get('keydown')!(key('ControlLeft', { repeat: true }))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0]])
  on.get('keyup')!(key('ControlLeft'))
  on.get('keydown')!(key('ControlLeft'))
  on.get('keyup')!(key('ControlLeft'))
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [1, 0]])
  up = 'pause'
  await frames(2)
  expect(sent('aim')).toEqual([[1, 0], [0, 0], [1, 0], [0, 0]])
  up = undefined
  expect(() => player.configure({ toggle: ['nothing'] })).toThrow("the scene's world.player.actions names no nothing")
  player.restore('grip')
  expect(player.settings().toggle).toEqual([])
  player.unbind()
})

test('a scene whose actions hold a side of the left stick needs world.player.deadzone, and the store\'s takes the stick in place of it', () => plugged(async () => {
  const bare = await actionRig({ actions: { tilt: [['PadStickLeft'], ['PadStickRight']] } }, 'before')
  bare.player.control({ axis: { tilt: (v: number) => ['aim', v, 0] } })
  await expect(bare.frames(1)).rejects.toThrow('the player table holds a side of a stick, and the scene gives no world.player.deadzone')
  bare.player.unbind()
  const { player, frames, sent } = await actionRig({ deadzone: 0.5, actions: { tilt: [['PadStickLeft'], ['PadStickRight']] } }, 'before')
  const pad = gamepad()
  player.control({ axis: { tilt: (v: number) => ['aim', v, 0] } })
  pad.axes = [-0.3, 0]
  await frames(2)
  expect(sent('aim')).toEqual([])
  player.configure({ deadzone: 0.2 })
  expect(player.settings().deadzone).toBe(0.2)
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0]])
  player.restore()
  expect(player.settings().deadzone).toBe(0.5)
  await frames(2)
  expect(sent('aim')).toEqual([[-1, 0], [0, 0]])
  for (const d of [0, 1, -0.1, 1.5]) expect(() => player.configure({ deadzone: d })).toThrow('a deadzone is a fraction of the way out, above 0 and below 1')
  // A stick swung from one side to the other between two frames sends the one way it holds now.
  pad.axes = [-0.9, 0]
  await frames(1)
  pad.axes = [0.9, 0]
  await frames(1)
  expect(sent('aim')).toEqual([[-1, 0], [0, 0], [-1, 0], [1, 0]])
  player.unbind()
}))

// On the action avenue the table names the actions it reads analog; the rest send whole ways as ever,
// and a hold played as a toggle sends 1 while it is on, however lightly its trigger was pressed.
test('control reads the actions its analog names as far as their keys hold them, in whole steps, and throws on one no axis, stick or hold reads', () => plugged(async () => {
  const { player, frames, sent } = await actionRig({
    deadzone: 0.2,
    resolution: 4,
    actions: {
      throttle: ['w', 'Pad7'],
      grip: ['g', 'Pad6'],
      steer: [['a', 'PadStickLeft'], ['d', 'PadStickRight']],
      look: [['PadRightStickLeft'], ['PadRightStickRight'], ['PadRightStickUp'], ['PadRightStickDown']],
    },
  }, 'before')
  const pad = gamepad()
  expect(() => player.control({ press: { grip: ['fire'] }, analog: ['grip'] })).toThrow('the player table reads grip analog, and no axis, stick or hold of it names grip')
  const looked: [number, number][] = []
  player.control({
    hold: { throttle: (v: number) => ['pedal', v], grip: (v: number) => ['grip', v] },
    axis: { steer: (v: number) => ['steer', v] },
    // What the page alone feels: the stick read, and nothing sent.
    stick: { look: (x: number, y: number) => { looked.push([x, y]); return undefined } },
    analog: ['throttle', 'steer', 'look'],
  })
  squeeze(pad, 7, 0.6)
  squeeze(pad, 6, 0.3)
  pad.axes = [-0.6, 0, 0, 0.8]
  await frames(2)
  squeeze(pad, 7, 0)
  squeeze(pad, 6, 0)
  pad.axes = [0, 0, 0, 0]
  await frames(2)
  // 0.6 in quarters is 0.5; the left stick 0.6 out past 0.2 is half the rest; the right stick 0.8
  // down three quarters; the grip, not read analog, is held all the way.
  expect(sent('pedal')).toEqual([[0.5], [0]])
  expect(sent('steer')).toEqual([[-0.5], [0]])
  expect(sent('grip')).toEqual([[1], [0]])
  expect(looked).toEqual([[0, 0.75], [0, 0]])
  expect(sent('look')).toEqual([])
  // Played as a toggle, an analog hold is on all the way from one press to the next.
  player.configure({ toggle: ['throttle'] })
  squeeze(pad, 7, 0.3)
  await frames(2)
  squeeze(pad, 7, 0)
  await frames(2)
  expect(sent('pedal')).toEqual([[0.5], [0], [1]])
  player.unbind()
}))

// The repeat presses a held action again every so many seconds, from a gamepad as from a key, and
// the keyboard's own repeats are then nobody's; an action with a release is pressed once a hold all
// the same.
test('the repeat presses a held action again every so many seconds, and the keyboard\'s own repeats press nothing', () => plugged(async () => {
  const { player, frames, sent } = await actionRig({ actions: { shoot: ['f', 'Pad0'], note: ['n'] } }, 'before')
  const pad = gamepad()
  const notes: string[] = []
  player.control({ press: { shoot: ['fire'], note: () => notes.push('down') }, release: { note: () => notes.push('up') } })
  // With no repeat, the keyboard's repeat presses again, as `bind`'s does.
  on.get('keydown')!(key('KeyF'))
  on.get('keydown')!(key('KeyF', { repeat: true }))
  on.get('keyup')!(key('KeyF'))
  await frames(1)
  expect(sent('fire').length).toBe(2)
  player.configure({ repeat: 0.1 })
  expect(player.settings().repeat).toBe(0.1)
  on.get('keydown')!(key('KeyF'))
  on.get('keydown')!(key('KeyF', { repeat: true }))
  // A quarter of a second held: pressed at the start, then at 0.1 and 0.2.
  await frames(15)
  on.get('keyup')!(key('KeyF'))
  await frames(15)
  expect(sent('fire').length).toBe(5)
  push(pad, 0, true)
  await frames(15)
  push(pad, 0, false)
  await frames(15)
  expect(sent('fire').length).toBe(8)
  on.get('keydown')!(key('KeyN'))
  await frames(15)
  on.get('keyup')!(key('KeyN'))
  expect(notes).toEqual(['down', 'up'])
  expect(() => player.configure({ repeat: -1 })).toThrow('a repeat is 0 or more seconds')
  player.unbind()
}))

// `listen` is a rebinding screen's: the next key, button or gamepad button goes to it and to nothing
// else, the UI included, and Escape hands it nothing.
test('listen hands the next key, mouse button or gamepad button to the screen and to nothing else, and Escape hands it nothing', () => plugged(async () => {
  const { player, plugins, frames, sent } = await actionRig({ actions: { shoot: ['f', 'Mouse0', 'Pad0'] } })
  // The UI takes no key from the keyboard while the player listens, as the real one does; a gamepad's
  // it would take is never offered it.
  const offered: string[] = []
  plugins.ui = { hit: () => false, took: () => false, modal: () => undefined, keyDown: (k: string) => { offered.push(k); return true }, keyUp: () => {} }
  const pad = gamepad()
  const got: (string | undefined)[] = []
  player.control({ press: { shoot: ['fire'] }, click: () => ['aim', 1, 1] })
  player.listen((k: string | undefined) => got.push(k))
  expect(player.listening).toBe(true)
  on.get('keydown')!(key('KeyF'))
  expect(player.listening).toBe(false)
  on.get('keyup')!(key('KeyF'))
  player.listen((k: string | undefined) => got.push(k))
  on.get('keydown')!(key('Escape'))
  player.listen((k: string | undefined) => got.push(k))
  on.get('mousedown')!({ button: 0 })
  on.get('mouseup')!({ button: 0 })
  on.get('click')!(click)
  player.listen((k: string | undefined) => got.push(k))
  push(pad, 3, true)
  await frames(2)
  player.listen((k: string | undefined) => got.push(k))
  player.unbind()
  expect(got).toEqual(['f', undefined, 'Mouse0', 'Pad3', undefined])
  expect(offered).toEqual([])
  expect(sent('fire')).toEqual([])
  expect(sent('aim')).toEqual([])
}))

// A gamepad key goes to the UI as a keyboard's does: offered first, and, taken, not the game's.
test('on the action avenue a gamepad key the UI takes is not the game\'s, and each one handed to the UI is handed back up', () => plugged(async () => {
  const { player, plugins, frames, sent } = await actionRig({ actions: { shoot: ['Pad0', 'Pad8'] } })
  const heard: string[] = []
  plugins.ui = { hit: () => false, took: () => false, modal: () => undefined, keyDown: (k: string) => { heard.push(`down ${k}`); return k === 'Pad8' }, keyUp: (k: string) => heard.push(`up ${k}`) }
  const pad = gamepad()
  player.control({ press: { shoot: ['fire'] } })
  push(pad, 8, true)
  await frames(2)
  expect(sent('fire')).toEqual([])
  push(pad, 8, false)
  push(pad, 0, true)
  await frames(2)
  expect(sent('fire')).toEqual([[]])
  expect(heard).toEqual(['down Pad8', 'up Pad8', 'down Pad0'])
  player.unbind()
}))

test('conflicts names each key more than one action holds, and actions shows every action as it is now beside the scene\'s', async () => {
  const { player } = await actionRig({ actions: { shoot: ['f', 'g'], block: ['g'], tilt: [['g'], ['h']], lift: ['Pad0'] } }, 'before')
  player.control({ press: { shoot: ['fire'] }, hold: { block: (v: number) => ['aim', v, 0] }, locked: ['block'], axis: { tilt: (v: number) => ['aim', v, 0] } })
  expect(player.conflicts()).toEqual([{ key: 'g', actions: ['shoot', 'block', 'tilt'] }])
  player.rebind('lift', ['h'])
  expect(player.conflicts()).toEqual([{ key: 'g', actions: ['shoot', 'block', 'tilt'] }, { key: 'h', actions: ['tilt', 'lift'] }])
  expect(player.actions()).toEqual([
    { name: 'shoot', label: 'shoot', shape: 'button', keys: ['f', 'g'], defaults: ['f', 'g'], bound: ['press'] },
    { name: 'block', label: 'block', shape: 'button', keys: ['g'], defaults: ['g'], bound: ['hold', 'locked'] },
    { name: 'tilt', label: 'tilt', shape: 'axis', keys: [['g'], ['h']], defaults: [['g'], ['h']], bound: ['axis'] },
    { name: 'lift', label: 'lift', shape: 'button', keys: ['h'], defaults: ['Pad0'], bound: [] },
  ])
  player.unbind()
})

test('device is what was used last: the keyboard and mouse, or a gamepad by its id', () => plugged(async () => {
  const { player, frames } = await actionRig({ actions: { shoot: ['f', 'Pad0'] } })
  player.control({ press: { shoot: ['fire'] } })
  expect(player.device()).toBe('keyboard')
  for (const [id, is] of [['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'xbox'], ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'playstation'], ['8BitDo SN30 Pro', 'pad']]) {
    gamepads.length = 0
    const pad = gamepad()
    pad.id = id
    push(pad, 0, true)
    await frames(1)
    expect(player.device()).toBe(is)
    push(pad, 0, false)
    await frames(1)
    on.get('keydown')!(key('KeyF'))
    on.get('keyup')!(key('KeyF'))
    expect(player.device()).toBe('keyboard')
  }
  player.unbind()
}))

