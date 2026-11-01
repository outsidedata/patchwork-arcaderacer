// The dvr's page: any game of `games/`, booted in this tab as its `index.html` boots it, in one of
// two modes, by the address:
//
//   ?game=<g>&record=<name>   played by hand, live, on the page's own clock, as `index.html` plays it.
//                             Every key, mouse, wheel and pointer event the page is handed, every
//                             gamepad read and every `input()` the loop runs is written down with the
//                             manager's step it came on, and the take is posted to the dvr's server
//                             (`dvr.ts serve`) every five seconds, at "save", and as the page goes.
//   ?game=<g>                 render: no clock of its own. `dvr.html`'s first script froze
//                             `performance.now`, `Date.now` and `requestAnimationFrame`, and the
//                             driver (`dvr.ts render`) calls `dvr.frame(i)` once for each frame of the
//                             film, which sets the clock to that frame's time, runs every step owed
//                             by then, and draws, and then photographs the page.
//     &take=<name>            the take played back: each entry handed to the page again before the
//                             step it came before, on the same step, so the truth takes every message
//                             on the step it took it live and plays out as it did. Every 60 steps the
//                             take holds a hash of every scene's rows, which the render checks.
//     &script=<url>           a module of the dvr's own for this film, which may export `think(rows)`,
//                             a press asked for every frame as `addons/player`'s think is, and
//                             `direct(film)`, called every frame after the steps and before the draw
//                             with the client's plugins, the rows, the time and the frame, to place a
//                             camera (claim render3d's) or anything else the page draws.
//     &fps=<f>                frames a second of the film (60).
//     &scale=<s>              pixels drawn per canvas pixel: render3d's `ratio`, which the driver
//                             matches with the page's device pixel ratio, so a 1280×720 game at 3 is
//                             3840×2160. A scene whose dither3d draws at a ratio of its own keeps it,
//                             and the browser shows its blocks at the device's ratio, as a page does.
//     &look=<l>               dither3d's look: `keep` it (the default), draw it `sharp` at the film's
//                             scale, or `clean`, dither3d off.
//     &hud=off                the ui plugin's canvas hidden: the game alone.
//
// The game's seat wrapper is read off its own `index.html`: the function its loopback is handed the
// manager through (`accept`, or the game's own, as `match`), imported from where that page imports it.
import { boot, type Row, type Truth } from '#engine/engine.ts'
import type { Client } from '#engine/browser.ts'
import { load, manager, link, view, accept, scenes, type Up, type Got, type Diff } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback, type Accept } from '#addons/loopback/loopback.addon.ts'

type Init = Record<string, unknown>
// One thing that reached the page from outside, on the manager's step `n`: an event, as its type
// and the fields it is made again from, at the canvas it was aimed at (its index on the stage, or
// -1 the page's body, -2 the window), and the canvas holding the pointer lock as it came (-1 none);
// or the loop's `input()`, with the gamepads as they read then.
type Pad = { id: string; index: number; mapping: string; buttons: { pressed: boolean; touched: boolean; value: number }[]; axes: number[] }
// A message the page sent its seat, `up`, on step `n`, is an entry too: played back, the truth is
// handed the take's own messages on their own steps, and the page's, made again from the events, are
// held back and only compared, so what the truth takes is what it took live however the page's
// frames fell.
type Entry =
  | { n: number; e: string; at: number; lock: number; init: Init }
  | { n: number; input: true; pads?: Pad[] }
  | { n: number; up: Up }
type Check = { n: number; hash: string }
export type Take = { game: string; name: string; dt: number; width: number; height: number; steps: number; entries: Entry[]; checks: Check[] }

declare global {
  interface Window {
    __real?: { now(): number; date(): number; raf(f: FrameRequestCallback): number; caf(k: number): void }
    __clock?: { set(ms: number): void; readonly ms: number; flush(): void }
    dvr: unknown
  }
}

const query = new URLSearchParams(location.search)
const game = query.get('game')
if (!game || !/^[\w-]+$/.test(game)) throw new Error(`dvr.html is given no game, or one named ${JSON.stringify(game)}: ?game=<a folder of games/>`)
const recording = query.get('record')
const home = new URL(`/games/${game}/index.html`, location.href).href
const stage = document.getElementById('stage')!

// ------------------------------------------------------------------ the game, as its page boots it

const file = (await import(/* @vite-ignore */ `/games/${game}/${game}.scene.json`)).default
const { sim } = await import(/* @vite-ignore */ `/games/${game}/${game}.sim.ts`)
const dt: number = file.prefabs.engine.dt

// The function the game's index.html hands the manager to its loopback through, from where it
// imports it.
async function seatOf(): Promise<(row: Row) => ReturnType<typeof accept>> {
  // The file as written, from the dvr's server: Vite serves a page with its inline script taken out.
  const html = await (await fetch(`/dvr/page/${game}`)).text()
  const named = /loopback\((\w+)\(manager\(truth\)\)/.exec(html)?.[1]
  if (!named) throw new Error(`games/${game}/index.html hands its loopback no manager this dvr can read`)
  if (named === 'accept') return accept
  const from = new RegExp(`import\\s*\\{[^}]*\\b${named}\\b[^}]*\\}\\s*from\\s*'([^']+)'`).exec(html)?.[1]
  if (!from) throw new Error(`games/${game}/index.html hands its loopback ${named}, imported from nowhere this dvr can read`)
  const mod = await import(/* @vite-ignore */ new URL(from, home).pathname)
  return mod[named]
}
const seat = await seatOf()
const truth: Truth = boot(file, sim)
await load(truth, home)

// The seat's side of the page's wire, and what each message up meets on the way: `heard` is handed
// every one and says whether it goes on to the truth.
let side: { take(up: Up | Got): void } | undefined
let heard = (_: Up | Got) => true
const tapped: Accept<Up | Got, Diff> = send => {
  const s = seat(manager(truth))(send)
  side = s
  return { take(up) { if (heard(up)) s.take(up) }, close: () => s.close() }
}

const canvases = () => [...stage.querySelectorAll('canvas')]
const page = view(link(loopback(tapped)), file, home, (me: Client, scene) => {
  const { width, height } = scene.prefabs.engine
  stage.style.width = `${width}px`
  stage.style.height = `${height}px`
  for (const surface of [me.plugins.render3d ?? me.plugins.render2d, me.plugins.ui]) {
    if (!surface) continue
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    if (surface === me.plugins.ui) canvas.dataset.surface = 'ui'
    stage.appendChild(canvas)
    surface.mount(canvas)
  }
})

// A hash of every scene's rows, which a take holds every 60 steps and a render checks.
function hash(): string {
  let h = 0x811c9dc5
  const text = JSON.stringify([...scenes(manager(truth))].map(([name, t]) => [name, t.n, t.rows]))
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}
const CHECK = 60

// ------------------------------------------------------------------ the events a take holds

const KEY = ['key', 'code', 'location', 'repeat', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey']
const MOUSE = ['clientX', 'clientY', 'screenX', 'screenY', 'button', 'buttons', 'movementX', 'movementY', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey']
const WHEEL = [...MOUSE, 'deltaX', 'deltaY', 'deltaZ', 'deltaMode']
const POINTER = [...MOUSE, 'pointerId', 'pointerType', 'isPrimary', 'pressure', 'width', 'height', 'tiltX', 'tiltY']
const EVENTS: Record<string, { fields: string[]; make: (type: string, init: Init) => Event }> = {}
for (const t of ['keydown', 'keyup']) EVENTS[t] = { fields: KEY, make: (type, i) => new KeyboardEvent(type, i) }
for (const t of ['mousedown', 'mouseup', 'mousemove', 'mouseout', 'click', 'contextmenu']) EVENTS[t] = { fields: MOUSE, make: (type, i) => new MouseEvent(type, i) }
EVENTS.wheel = { fields: WHEEL, make: (type, i) => new WheelEvent(type, i) }
for (const t of ['pointerdown', 'pointerup', 'pointermove', 'pointerleave', 'pointerover', 'pointerout', 'pointerenter']) EVENTS[t] = { fields: POINTER, make: (type, i) => new PointerEvent(type, i) }
// Whether the event bubbles and can be cancelled, as the browser makes each.
const QUIET = new Set(['pointerleave', 'pointerenter'])

const aimOf = (t: EventTarget | null) => {
  const i = canvases().indexOf(t as HTMLCanvasElement)
  return i >= 0 ? i : t === window ? -2 : -1
}
const targetOf = (at: number): EventTarget => (at >= 0 ? canvases()[at] ?? document.body : at === -2 ? window : document.body)
const lockOf = () => (document.pointerLockElement ? canvases().indexOf(document.pointerLockElement as HTMLCanvasElement) : -1)

const padsNow = (): Pad[] | undefined => {
  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads().filter((p): p is Gamepad => !!p?.connected) : []
  if (!pads.length) return undefined
  return pads.map(p => ({ id: p.id, index: p.index, mapping: p.mapping, buttons: p.buttons.map(b => ({ pressed: b.pressed, touched: b.touched, value: b.value })), axes: [...p.axes] }))
}

// ------------------------------------------------------------------ record

if (recording) {
  if (!/^[\w.-]+$/.test(recording)) throw new Error(`the take is named ${JSON.stringify(recording)}: letters, digits, _, . and - only`)
  const take: Take = { game, name: recording, dt, width: file.prefabs.engine.width, height: file.prefabs.engine.height, steps: 0, entries: [], checks: [] }
  heard = up => {
    if ('msg' in up) take.entries.push({ n: truth.n, up: structuredClone(up) })
    return true
  }
  for (const type of Object.keys(EVENTS)) {
    addEventListener(type, e => {
      if (!e.isTrusted) return
      const init: Init = { bubbles: !QUIET.has(type), cancelable: e.cancelable, composed: true }
      for (const f of EVENTS[type].fields) init[f] = (e as unknown as Init)[f]
      if (type === 'mouseout') init.related = (e as MouseEvent).relatedTarget ? 1 : 0
      take.entries.push({ n: truth.n, e: type, at: aimOf(e.target), lock: lockOf(), init })
    }, { capture: true })
  }

  const rec = document.getElementById('rec')!
  rec.style.display = 'block'
  const save = (last: boolean) => {
    take.steps = truth.n
    const body = JSON.stringify(take)
    const url = `/dvr/take/${game}/${recording}`
    if (last) navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
    else return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body }).then(r => { if (!r.ok) throw new Error(`the dvr's server kept no take: ${r.status}`) })
  }
  const button = document.createElement('button')
  button.textContent = 'save'
  let saved = 'not saved yet'
  button.onclick = () => { void save(false)?.then(() => { saved = `saved at step ${take.steps}` }, e => { saved = String(e) }) }
  setInterval(() => { void save(false)?.then(() => { saved = `saved at step ${take.steps}` }, e => { saved = String(e) }) }, 5000)
  addEventListener('pagehide', () => save(true))

  let last = performance.now(), owed = 0
  const loop = async (now: number) => {
    owed += Math.min((now - last) / 1000, 0.25)
    last = now
    take.entries.push({ n: truth.n, input: true, ...(padsNow() ? { pads: padsNow() } : {}) })
    page.input()
    while (owed >= dt) {
      truth.step(dt)
      owed -= dt
      if (truth.n % CHECK === 0) take.checks.push({ n: truth.n, hash: hash() })
    }
    await page.frame(owed / dt)
    rec.firstChild?.remove()
    rec.prepend(document.createTextNode(`● REC ${recording}  ${(truth.n * dt).toFixed(1)} s  step ${truth.n}  ${take.entries.length} entries  ${saved}`))
    if (!rec.contains(button)) rec.appendChild(button)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
} else {
  // ---------------------------------------------------------------- render

  const clock = window.__clock!
  const fps = Number(query.get('fps') ?? 60)
  const scale = Number(query.get('scale') ?? 1)
  if (!(fps > 0)) throw new Error(`the film's fps ${query.get('fps')} is not above 0`)
  if (!(scale > 0)) throw new Error(`the film's scale ${query.get('scale')} is not above 0`)
  const look = query.get('look') ?? 'keep'
  if (!['keep', 'sharp', 'clean'].includes(look)) throw new Error(`the film's look ${look} is none of keep, sharp, clean`)
  // With `hud=off` the ui's canvas is drawn and never shown, so its events still land where they did.
  if (query.get('hud') === 'off') document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '#stage canvas[data-surface=ui] { visibility: hidden }' }))
  else if (query.has('hud') && query.get('hud') !== 'on') throw new Error(`the film's hud ${query.get('hud')} is neither on nor off`)

  const takeName = query.get('take')
  const take: Take | undefined = takeName ? await (await fetch(`/dvr/take/${game}/${takeName}`)).json() : undefined
  if (take && take.dt !== dt) throw new Error(`the take ${takeName} was played at a step of ${take.dt} s, and the game's is now ${dt} s`)
  const script = query.get('script') ? await import(/* @vite-ignore */ query.get('script')!) : {}

  // Played back, the pointer is locked where the take says it was, and asking for the lock asks for
  // nothing; the gamepads read as the take read them.
  let lock = -1
  let pads: Pad[] = []
  if (take) {
    Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => (lock >= 0 ? canvases()[lock] ?? null : null), configurable: true })
    Element.prototype.requestPointerLock = function () { return Promise.resolve() } as typeof Element.prototype.requestPointerLock
    Document.prototype.exitPointerLock = function () {}
    navigator.getGamepads = () => pads.map(p => ({
      ...p, connected: true, timestamp: clock.ms, vibrationActuator: null, hapticActuators: [],
      buttons: p.buttons.map(b => ({ ...b })),
    })) as unknown as (Gamepad | null)[]
  }

  let next = 0
  // Everything the take holds up to step `n`, handed to the page again in the order it came.
  const replay = (n: number) => {
    if (!take) return
    while (next < take.entries.length && take.entries[next].n <= n) {
      const entry = take.entries[next++]
      if ('input' in entry) {
        pads = entry.pads ?? []
        page.input()
        continue
      }
      if ('up' in entry) {
        side!.take(structuredClone(entry.up))
        continue
      }
      lock = entry.lock
      const { related, ...init } = entry.init
      if (entry.e === 'mouseout') init.relatedTarget = related ? document.body : null
      targetOf(entry.at).dispatchEvent(EVENTS[entry.e].make(entry.e, init))
    }
  }

  // The page's own messages, held back from the truth and kept to compare with the take's.
  const own: { n: number; up: Up }[] = []
  if (take) heard = up => {
    if (!('msg' in up)) return true
    own.push({ n: truth.n, up: structuredClone(up) })
    return false
  }
  // How many of the page's own messages were the take's, the same act with the same arguments on the
  // same step, and the first that was not.
  const said = () => {
    const key = (s: { n: number; up: Up }) => 'msg' in s.up ? JSON.stringify([s.n, s.up.scene, s.up.msg.id, s.up.msg.action, s.up.msg.args]) : ''
    const theirs = (take?.entries ?? []).filter((e): e is { n: number; up: Up } => 'up' in e && e.n < truth.n)
    const mine = own.filter(s => s.n < truth.n)
    let same = 0
    for (let i = 0; i < Math.min(theirs.length, mine.length) && key(theirs[i]) === key(mine[i]); i++) same++
    const first = same < Math.max(theirs.length, mine.length) ? { take: theirs[same] ?? null, page: mine[same] ?? null } : null
    return { take: theirs.length, page: mine.length, same, first }
  }

  const checks = new Map(take?.checks.map(c => [c.n, c.hash]))
  const differed: { n: number; take: string; now: string }[] = []
  let drawnBy: Client | undefined

  // Frame `i` of the film: the clock at its time, every step owed by then run, the take's entries
  // handed in before the step they came before, the script's press and direction, and the draw.
  async function frame(i: number) {
    const t = i / fps
    clock.set(t * 1000)
    const due = Math.floor(t / dt + 1e-9)
    replay(truth.n)
    const before = page.client
    if (!take) {
      if (script.think && before?.plugins.player) {
        const press = script.think(before.rows)
        if (press) before.plugins.player[press[0]](...press.slice(1))
      }
      page.input()
    }
    while (truth.n < due) {
      replay(truth.n)
      truth.step(dt)
      const want = checks.get(truth.n)
      if (want !== undefined) {
        const now = hash()
        if (now !== want) differed.push({ n: truth.n, take: want, now })
      }
    }
    const between = t / dt - due
    const c = page.client
    if (c && script.direct) script.direct({ plugins: c.plugins, rows: c.rows, t, frame: i, fps, truth })
    clock.flush()
    await page.frame(between)
    // A new client, a scene the seat moved to, draws at the film's scale from its first frame on.
    const after = page.client
    if (after && after !== drawnBy) drawnBy = after
    const r3 = after?.plugins.render3d
    const dither = after?.plugins.dither3d
    // dither3d's own look: kept, drawn at the film's scale, or off. It has nothing to set until it
    // has ticked, which it throws to say.
    if (dither && look !== 'keep') {
      try {
        if (look === 'clean' && dither.on) dither.on = false
        if (look === 'sharp' && dither.ratio !== undefined) dither.ratio = undefined
      } catch {}
    }
    const own = dither && (() => { try { return dither.on && dither.ratio !== undefined } catch { return false } })()
    if (r3?.renderer && !own && r3.renderer.getPixelRatio() !== scale) {
      r3.ratio(scale)
      await page.frame(between)
    }
    return { n: truth.n, scene: page.name ?? null, between, differed: differed.length }
  }

  // The film's size: the manager's, or where it gives none, the entry scene's, which every seat
  // enters first.
  const entry = scenes(manager(truth)).get(manager(truth).data.entry as string)!.scene.prefabs.engine
  window.dvr = {
    width: (file.prefabs.engine.width ?? entry.width) as number,
    height: (file.prefabs.engine.height ?? entry.height) as number,
    dt,
    fps,
    // How many frames the take lasts at this fps, or null with no take.
    frames: take ? Math.floor(take.steps * dt * fps) : null,
    frame,
    // The size of the stage as the scene now draws it, which a scene of another size changes.
    size: () => ({ width: stage.offsetWidth, height: stage.offsetHeight }),
    differed: () => differed,
    said,
  }
}
document.title = `dvr ${game}`
// The driver waits on this.
;(window as unknown as { dvrReady: boolean }).dvrReady = true
