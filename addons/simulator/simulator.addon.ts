// Pages against a server in time, with no time passing: one timeline in milliseconds, an event queue
// on it, and the real code on both ends — the engine, the scenemanager, the loopback, the player, the
// game's own rules and actors — with every frame, step, packet and message written down as it
// happens, one JSON object a line (JSONL).
//
// `simulate(run)` boots the manager scene `run.file` with `run.sim`, loads its scenes from
// `run.base`, and plays `run.ms` milliseconds, which take as long as the code takes to run them:
// - The server is the manager stepped by `run` (`addons/scenemanager`), the loop every
//   `<game>.server.ts` runs, on a clock of the timeline's, `server.ppm` parts in a million fast. Its
//   timer rounds each wait down to `server.grain` ms (1 when unset, as node does, never less than
//   one grain; 0 fires on the very millisecond asked for, a nanosecond at the least), fires
//   `server.late` ms late on the mean (an exponential), and not at all while the process is
//   stopped: a pause of `server.pause.ms` falls every `server.pause.every` seconds on the mean, and
//   every timer due inside one fires as it ends. `server.loop: 'interval'` steps once a
//   firing of a timer asked for again each step's milliseconds, as `setInterval` does, on the same
//   timer, which is how a server that loses steps is played again. `server.steps`, times of the
//   timeline, steps the manager at each of them and at no other, as a recording's server did
//   (`timing`).
// - Each page opens its link at `join` ms: a `view` on `link(loopback(accept(manager), time, net))`,
//   or with `predict` a page that runs its scene ahead (`addons/predict`), as `client.html` makes it,
//   whose frame is handed the page's clock,
//   with the page's `up` and `down` legs, which hand each envelope on the millisecond it arrives, a
//   wire that opens `open` ms later, as a socket's handshake does. Its display draws `display.hz`
//   frames a second, its vsyncs `display.phase` ms past each multiple of a frame's time (a phase of
//   its own from the seed when unset); a frame is called up to `wobble` ms after its vsync, a `drop`
//   fraction of vsyncs draw nothing, a long frame of `long.ms` comes every `long.every` seconds on
//   the mean and draws nothing on the vsyncs it covers, nothing is drawn while a `hidden` span,
//   `[from, to]` ms, is on, as a hidden tab's requestAnimationFrame stops, and the first frame waits
//   `stall` ms after the page joins, as a page that is still loading does. `display.at`, times of
//   the timeline, draws a frame at each of them and at no other, as a recording's page did
//   (`timing`). The page's clock, which its code reads as `performance.now`, is `clock.offset` ms
//   plus the timeline's, `clock.ppm` parts in a million fast.
// - Each page's input: `presses` at ms of the timeline, between frames as a real keyboard's are,
//   each an `act` sent through the player plugin as a bound key's message is, or a `key`, the
//   `KeyboardEvent.code` of a key going down (or `up`), handed to the listeners the page's code bound;
//   and a `think` (`addons/player`), asked before every frame with the rows the page holds for a press.
// - `ready`, when given, is handed the manager's truth once its scenes are loaded and before anything
//   runs, for what a run sets up on the server first: a playtester's seat, rows spawned.
// - `turns`, when given, are calls at ms of the timeline, for a knob a run turns as it plays: a
//   page's `up` or `down` leg, which its link reads live.
// - Every roll, the network's, the displays' and the server's, comes from `seed`, so the same run is
//   the same bytes. A frame's and a step's `cost`, the processor milliseconds it took, are written
//   only when `run.cost` asks for them, since no two machines take the same time.
// `running()` says what the run is running at the moment it is asked: a page's frame (or its input),
// `{ page }`, the server's step, `'server'`, or neither, so whatever times the code can say whose
// time it is.
//
// `real(run)` plays the same pages with the same records on real clocks over the real socket: each
// page `dial`s `run.url`, or the manager booted here behind `serve` on `run.port` (the manager's own
// port when unset, a free one when 0) and stepped by `run` on the machine's clock. Its pages draw
// `hz` frames a second on the machine's timers, and a server it does not hold writes no steps and no
// send times. A real run and a simulated one can be put side by side, and `timing` hands a
// simulation a recording's own timing, so what a real run shows can be told from what the machine's
// timers did to it.
//
// `tap` records a page in a real browser the same way, from the page's own address (`?tap=<name>`),
// and sends its lines to the simulator's routes (`simulator.route.ts`), which keep every recording in
// `addons/simulator/runs/`, where the simulator's Runs panel (`simulator.extension.tsx`) shows them.
//
// The records, each with its `type`:
// - `run`: what was played: the mode, the seed, the milliseconds, the server's and each page's
//   knobs, `watch`, and `clocks`, each page's clock at the timeline's 0.
// - `frame`: one page's frame. `t` the timeline's ms it was called at, `clock` the page's clock as
//   the frame began; `n` the step of the packet it drew; `took`, every envelope that arrived since
//   the frame before, its `k`, its step `n`, and when it was `sent` and arrived (`at`). `rows` holds
//   each row of a watched kind the page
//   drew, id to its kind and watched fields (every row when `watch.kinds` is unset, every field
//   when `watch.fields` is); `own` the id of the page's own row: with `watch.own` an empty list, `[]`,
//   the page's own `player` row itself (`possessed`), the thing the seat plays as; else the id its
//   `player` row holds in the field `watch.own`, or, for a list of fields, the id each row reached
//   holds in the next field, as `['held', 'chassis']` reaches the body of the car a `player` row
//   holds. A field names a row by its id, a number, or by `{ id }`, as a `player` row's `held`
//   does (`plugins/player/player.sim.ts`); `eye` the camera's
//   `{ pos, dir, target }` as the actor that exports `eye()` holds it, where one does, and where none
//   does its `{ pos, dir }` as the first of the scene's plugins that exports `eye()` holds it, as
//   chasecamera3d does; `drawn`, when `watch.drawn` asks for it, where the page drew things on that
//   frame, between the steps and after a page that runs ahead eased them: the camera's place, each
//   row's drawn place by its id (`rows`), and every mesh tied to no row by its three.js id (`meshes`),
//   as the first of the scene's plugins that exports
//   `drew(f)` hands them (render3d does, canvas or none). Smoothness is read off these, never off
//   `rows`, which hold a step's places and not what was drawn. With `drawn` come `between`, how far
//   past the step it drew the page's clock stood (`engine/browser.ts`, Drawing between steps).
// - `step`: one manager step. `n` the manager's step after it, `scenes` each scene's; `applied` each
//   page's message a scene answered this step, with `n` the scene's step that answered it, as `heard`
//   (`addons/heard`) lists it; `rows`, each scene's watched rows; and `cost`, when asked for.
// - `press`: an input handed to a page, and whether the page had a client to take it.
// - `packet` and `message`: each envelope down and each message up, when it was sent and each time it
//   arrived: none when it was lost, two when it was duplicated; and for an envelope, each time the
//   page's word that it got it (`Got`) reached the server. Written once the run is over.
//
// `parse` reads a JSONL file's records back. `summary` reads any run's records, a real one's too, and
// `histogram`, `standoff` and `packets` are its parts, for a test to state a fact such as "every
// frame moves one step" about a run; `report` prints a summary. From
// node:
//   node --experimental-strip-types addons/simulator/simulator.addon.ts run <config.json> [out.jsonl]
//   node --experimental-strip-types addons/simulator/simulator.addon.ts real <config.json> [out.jsonl]
//   node --experimental-strip-types addons/simulator/simulator.addon.ts summary <run.jsonl>
// A config is a `Run` (or a `RealRun`) as JSON, with `game`, the manager scene file's path from where
// node runs, in place of `file`, `sim` and `base`: the sim is the `<game>.sim.ts` beside it.
import { boot, seeded, type Arg, type Row, type Scene, type Sim, type Truth } from '#engine/engine.ts'
import type { Client } from '#engine/browser.ts'
import { accept, link, load, manager, run as keep, scenes, view, type Diff, type Got, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback, type Accept, type Leg, type Time, type Wire } from '#addons/loopback/loopback.addon.ts'
import { dial, serve } from '#addons/socket/socket.addon.ts'
import { heard } from '#addons/heard/heard.addon.ts'
import { predict } from '#addons/predict/predict.addon.ts'
import { possessed, type Think } from '#addons/player/player.addon.ts'

export type Display = { hz: number; at?: number[]; phase?: number; wobble?: number; drop?: number; long?: { every: number; ms: number }; hidden?: [number, number][]; stall?: number }
export type Press = { at: number; act?: [string, ...Arg[]]; key?: string; up?: boolean }
export type Page = { join?: number; open?: number; display: Display; clock?: { offset?: number; ppm?: number }; up: Leg; down: Leg; presses?: Press[]; think?: Think; predict?: boolean }
export type Server = { steps?: number[]; loop?: 'owed' | 'interval'; grain?: number; late?: number; pause?: { every: number; ms: number }; ppm?: number }
export type Watch = { kinds?: string[]; fields?: string[]; own?: string | string[]; drawn?: boolean }
export type Drawn = { camera: number[]; rows: Record<number, number[]>; meshes: Record<number, number[]> }
type Game = {
  file: Scene; sim: Sim; base: string; ms: number; watch?: Watch; mount?: (me: Client, scene: Scene) => void
  ready?: (truth: Truth) => void | Promise<void>; turns?: { at: number; turn: () => void }[]; cost?: boolean; write?: (line: string) => void
}
export type Run = Game & { seed: number; server?: Server; pages: Page[] }
export type RealPage = { join?: number; hz: number; presses?: Press[]; think?: Think; predict?: boolean }
export type RealRun = Game & { pages: RealPage[]; url?: string; port?: number }

export type Took = { k: number; n: number; sent: number | null; at: number }
export type Watched = Record<string, Record<string, unknown>>
export type Eye = { pos: number[]; dir: number[]; target?: number[] }
export type FrameRecord = {
  type: 'frame'; page: number; t: number; clock: number; n: number | null; took: Took[]
  rows: Watched; own?: number; eye?: Eye; drawn?: Drawn; between?: number; cost?: number
}
export type Applied = { page: number; scene: string; seq: number; action: string; n: number }
export type StepRecord = { type: 'step'; t: number; n: number; scenes: Record<string, number>; applied: Applied[]; rows?: Record<string, Watched>; cost?: number }
export type PressRecord = { type: 'press'; page: number; t: number; act?: [string, ...Arg[]]; key?: string; up?: boolean; taken: boolean }
export type PacketRecord = { type: 'packet'; page: number; scene: string; seat: number; k: number; n: number; sent: number; at: number[]; got: number[] }
export type MessageRecord = { type: 'message'; page: number; scene: string; seat: number; seq: number; action: string; sent: number; at: number[] }
export type RunRecord = { type: 'run'; mode: 'sim' | 'real'; seed?: number; ms: number; clocks?: number[]; server?: Server; url?: string; pages: unknown[]; watch?: Watch }
export type Record_ = RunRecord | FrameRecord | StepRecord | PressRecord | PacketRecord | MessageRecord

// The machine's own clock, whatever the pages are told, and the processor time this process has
// spent, in ms, which a frame's and a step's cost are counted in: other work on the machine does not
// stretch it, as it stretches the wall's. Where there is no process to ask, a browser's page, it is
// the wall's.
const wall = performance.now.bind(performance)
const spent = typeof process !== 'undefined' && typeof process.cpuUsage === 'function'
  ? () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000 }
  : wall

// Where the recordings are kept, from the repo, and the name a recording may have, which is its
// file's: letters, digits, _, . and - only (`simulator.route.ts`).
export const RUNS = 'addons/simulator/runs'
export const NAME = /^[\w.-]+$/

export type Running = { page: number } | 'server' | undefined
let current: Running
export const running = (): Running => current
// Runs `f` as `who`, and says so to `running` for as long as it runs.
async function running_<T>(who: Running, f: () => T | Promise<T>): Promise<T> {
  const was = current
  current = who
  try { return await f() } finally { current = was }
}

// ------------------------------------------------------------------ the two clocks

// Where events are put and in what order they run: `at` a time, and the timeline's `now`. The
// simulated one runs them in time order, the one put first first among equals, and none of them
// waits for a real clock; the real one runs them on the machine's timers, one at a time, each
// waiting for the one before, as a page's event loop does.
// `zero` is the machine's clock (`performance.now`) at the timeline's 0, for the real one.
type Clock = { now(): number; at(t: number, f: () => void | Promise<void>): void; play(): Promise<void>; zero?: number }

function timeline(end: number): Clock {
  let now = 0, k = 0
  const queue: { t: number; k: number; f: () => void | Promise<void> }[] = []
  return {
    now: () => now,
    at(t, f) {
      const e = { t: Math.max(t, now), k: k++, f }
      let lo = 0, hi = queue.length
      while (lo < hi) { const mid = (lo + hi) >> 1; const q = queue[mid]; if (q.t < e.t || (q.t === e.t && q.k < e.k)) lo = mid + 1; else hi = mid }
      queue.splice(lo, 0, e)
    },
    async play() {
      while (queue.length && queue[0].t <= end) {
        const e = queue.shift()!
        now = e.t
        await e.f()
      }
      now = end
    },
  }
}

function machine(end: number): Clock {
  const start = wall()
  let chain = Promise.resolve()
  let fail: unknown
  const now = () => wall() - start
  return {
    zero: start,
    now,
    at(t, f) {
      setTimeout(() => { chain = chain.then(() => { if (now() <= end) return f() }).catch(e => { fail ??= e }) }, Math.max(0, t - now()))
    },
    async play() {
      await new Promise(r => setTimeout(r, Math.max(0, end - now())))
      await chain
      if (fail) throw fail
    },
  }
}

// An exponential wait of mean `mean`, from a roll.
const exp = (u: number, mean: number) => -Math.log(1 - u) * mean

// Instants from 0 to `end`, gaps an exponential of mean `every` seconds.
function instants(die: () => number, every: number, end: number): number[] {
  const out: number[] = []
  if (!(every > 0)) return out
  for (let t = exp(die(), every * 1000); t < end; t += exp(die(), every * 1000)) out.push(t)
  return out
}

// ------------------------------------------------------------------ the page's globals

// What a page's code reaches through the global object: its clock as `performance.now`, and the
// listeners it binds, each page's its own, swapped in around everything that runs as that page.
type Listeners = Map<string, Set<(e: any) => void>>
const g = globalThis as any

function globals(clock: () => number) {
  const now = Object.getOwnPropertyDescriptor(performance, 'now')
  const had = { add: g.addEventListener, remove: g.removeEventListener, document: g.document, hasDocument: 'document' in g }
  let reading = clock
  Object.defineProperty(performance, 'now', { value: () => reading(), configurable: true, writable: true })
  if (!had.hasDocument) g.document = { pointerLockElement: null, exitPointerLock() {} }
  return {
    // Runs `f` as a page: its clock, its listeners.
    async as<T>(page: { clock: () => number; listeners: Listeners }, f: () => T | Promise<T>): Promise<T> {
      const was = reading
      const add = g.addEventListener, remove = g.removeEventListener
      reading = page.clock
      g.addEventListener = (type: string, fn: (e: any) => void) => { let s = page.listeners.get(type); if (!s) page.listeners.set(type, (s = new Set())); s.add(fn) }
      g.removeEventListener = (type: string, fn: (e: any) => void) => { page.listeners.get(type)?.delete(fn) }
      try { return await f() } finally { reading = was; g.addEventListener = add; g.removeEventListener = remove }
    },
    restore() {
      if (now) Object.defineProperty(performance, 'now', now)
      else delete (performance as any).now
      g.addEventListener = had.add
      g.removeEventListener = had.remove
      if (!had.hasDocument) delete g.document
    },
  }
}

// ------------------------------------------------------------------ one run, either clock

type Live = {
  i: number
  clock: () => number
  listeners: Listeners
  tab?: ReturnType<typeof view> | ReturnType<typeof predict>
  arrived: Took[]
  eyes: Map<number, (() => Eye) | null>
  // The client whose drawing is listened to, and what it drew on the frame just run.
  drawing?: { client: Client; last?: Drawn }
}

function watched(rows: Row[], watch: Watch | undefined): Watched {
  const out: Watched = {}
  if (!watch) return out
  for (const r of rows) {
    if (watch.kinds && !watch.kinds.includes(r.kind)) continue
    const rec: Record<string, unknown> = { kind: r.kind }
    for (const f of watch.fields ?? Object.keys(r.data)) if (f in r.data) rec[f] = structuredClone(r.data[f])
    out[r.id] = rec
  }
  return out
}

type Plan = {
  mode: 'sim' | 'real'
  clock: Clock
  // The server this run holds, and the time its `run` keeps (the machine's when none); none when
  // the pages dial one elsewhere.
  server?: { truth: Truth; time?: Time; interval?: boolean; steps?: number[] }
  // Before the first event: hands the server's side of every seat, tapped, to whatever carries it.
  start(tapped: Accept<Up | Got, Diff> | undefined): Promise<void>
  // Page `i`'s wire to its seat.
  wire(i: number): Wire<Up | Got, Diff>
  pages: { join: number; clock: () => number; think?: Think; predict?: boolean; presses: Press[]; frames(frame: () => Promise<void>): void }[]
  head: RunRecord
}

async function play(game: Game, plan: Plan): Promise<Record_[]> {
  const { clock } = plan
  const records: Record_[] = []
  const put = (r: Record_) => { records.push(r); game.write?.(JSON.stringify(r)) }
  put(plan.head)
  const env = plan.mode === 'sim' ? globals(plan.server?.time?.now ?? clock.now) : undefined
  const as = <T>(page: Live, f: () => T | Promise<T>): Promise<T> => running_({ page: page.i }, () => (env ? env.as(page, f) : listening(page, f)))
  // Envelopes and messages by their visit, `scene/seat`, which both ends of a wire know, and their
  // number on it; and the page each visit is.
  const packets = new Map<string, PacketRecord>()
  const messages = new Map<string, MessageRecord>()
  const visits = new Map<string, number>()
  const lives: Live[] = []
  let loop: { stop(): void } | undefined
  let last = () => {}
  try {
    // The server's side of every seat, each envelope written down as it is sent and each message as
    // it arrives.
    let tapped: Accept<Up | Got, Diff> | undefined
    if (plan.server) {
      const inner = accept(manager(plan.server.truth))
      tapped = send => {
        // This connection's envelopes by their number, which the page's word that it got one names.
        const mine = new Map<number, PacketRecord>()
        const seat = inner(d => {
          const pk: PacketRecord = { type: 'packet', page: visits.get(`${d.scene}/${d.seat}`) ?? -1, scene: d.scene, seat: d.seat, k: d.k, n: d.n, sent: clock.now(), at: [], got: [] }
          packets.set(`${d.scene}/${d.seat}/${d.k}`, pk)
          mine.set(d.k, pk)
          send(d)
        })
        last()
        return {
          take(u) {
            if ('msg' in u) messages.get(`${u.scene}/${u.seat}/${u.msg.seq}`)?.at.push(clock.now())
            else if ('got' in u) mine.get(u.got)?.got.push(clock.now())
            seat.take(u)
          },
          close: () => seat.close(),
        }
      }
    }
    if (plan.server) await game.ready?.(plan.server.truth)
    await plan.start(tapped)

    // The server's steps, and which page's message each scene took on each.
    if (plan.server) {
      const { truth } = plan.server
      // The server's timer, whose every call is the server's time, and the real clock at the start of
      // what each step's cost is counted from: the call, or the end of the step before it in the call.
      let mark = 0
      const inner = plan.server.time ?? { now: () => performance.now(), after: (ms: number, f: () => void) => { setTimeout(f, ms) } }
      const time: Time = {
        now: inner.now,
        after: (ms, f) => inner.after(ms, () => {
          const was = current
          current = 'server'
          mark = spent()
          try { f() } finally { current = was }
        }),
      }
      const row = manager(truth)
      // What each scene's steps answered since the last step was written down.
      const answered = new Map([...scenes(row)].map(([name, child]) => [name, heard(child)]))
      // A step is written down by the listener of the manager's steps registered last, so its cost
      // holds everything the step did, every connection sending its packet too: each connection the
      // server makes registers one after its own, and only the newest writes.
      let newest = 0
      last = () => {
        const mine = ++newest
        truth.onStep(() => { if (mine === newest) record() })
      }
      const record = () => {
        const end = spent()
        const was = current
        current = undefined
        const applied: Applied[] = []
        const at: Record<string, number> = {}
        for (const [name, child] of scenes(row)) {
          at[name] = child.n
          // A seq of 0 is the server's own, an entry's act or an arrival, which no page sent.
          for (const h of answered.get(name)!.splice(0)) {
            const page = visits.get(`${name}/${h.seat}`)
            if (h.msg.seq !== 0 && page !== undefined) applied.push({ page, scene: name, seq: h.msg.seq, action: h.msg.action, n: h.at })
          }
        }
        const rec: StepRecord = { type: 'step', t: clock.now(), n: truth.n, scenes: at, applied }
        if (game.watch) rec.rows = Object.fromEntries([...scenes(row)].map(([name, child]) => [name, watched(child.rows, game.watch)]))
        if (game.cost) rec.cost = end - mark
        put(rec)
        current = was
        mark = spent()
      }
      last()
      const dt = truth.scene.prefabs.engine.dt as number
      if (plan.server.steps) {
        for (const at of plan.server.steps) plan.clock.at(at, () => {
          const was = current
          current = 'server'
          mark = spent()
          try { truth.step(dt) } finally { current = was }
        })
      } else if (plan.server.interval) {
        const again = () => { truth.step(dt); time.after(dt * 1000, again) }
        time.after(dt * 1000, again)
      } else loop = keep(truth, time)
    }

    for (const [i, p] of plan.pages.entries()) {
      const live: Live = { i, clock: p.clock, listeners: new Map(), arrived: [], eyes: new Map() }
      lives.push(live)
      clock.at(p.join, () => {
        const inner = plan.wire(i)
        const wire: Wire<Up | Got, Diff> = fan => {
          const w = inner(d => {
            const visit = `${d.scene}/${d.seat}`
            visits.set(visit, i)
            const pk = packets.get(`${visit}/${d.k}`)
            pk?.at.push(clock.now())
            live.arrived.push({ k: d.k, n: d.n, sent: pk ? pk.sent : null, at: clock.now() })
            fan(d)
          })
          return {
            send(u) {
              // A page that runs its scene ahead sends a message again until it is acked: written
              // down once, when it was first sent.
              const key = 'msg' in u ? `${u.scene}/${u.seat}/${u.msg.seq}` : undefined
              if ('msg' in u && !messages.has(key!)) {
                visits.set(`${u.scene}/${u.seat}`, i)
                messages.set(key!, { type: 'message', page: i, scene: u.scene, seat: u.seat, seq: u.msg.seq, action: u.msg.action, sent: clock.now(), at: [] })
              }
              w.send(u)
            },
            close: () => w.close(),
          }
        }
        // A page that runs its scene ahead, as `client.html` makes it, or one that draws what it is sent.
        live.tab = (p.predict ? predict : view)(link(wire), structuredClone(game.file), game.base, game.mount ?? (() => {}))
      })
      p.frames(async () => {
        const tab = live.tab
        if (!tab) return
        const before = tab.client
        if (p.think && before?.plugins.player) {
          const press = p.think(before.rows)
          if (press) await as(live, () => before.plugins.player[press[0]](...press.slice(1)))
        }
        const took = live.arrived.splice(0)
        const t = clock.now(), start = live.clock()
        const c0 = spent()
        // The page's input before its steps, as `client.html`'s loop calls it.
        await as(live, () => tab.input())
        listen(live, game.watch)
        // A page that runs ahead steps its copy on the page's clock, as `requestAnimationFrame` hands it.
        await as(live, () => ('stats' in tab ? tab.frame(start) : tab.frame()))
        const cost = spent() - c0
        put(await frameOf(live, took, t, start, game.watch, game.cost ? cost : undefined))
      })
      for (const press of p.presses) clock.at(press.at, () => as(live, () => {
        const c = live.tab?.client
        let taken = false
        if (press.act && c?.plugins.player) { c.plugins.player[press.act[0]](...press.act.slice(1)); taken = true }
        if (press.key) {
          const type = press.up ? 'keyup' : 'keydown'
          const e = { type, code: press.key, key: press.key, repeat: false, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} }
          const fns = [...(live.listeners.get(type) ?? [])]
          for (const fn of fns) fn(e)
          taken = fns.length > 0
        }
        put({ type: 'press', page: i, t: clock.now(), ...(press.act ? { act: press.act } : {}), ...(press.key ? { key: press.key, ...(press.up ? { up: true } : {}) } : {}), taken })
      }))
    }
    for (const t of game.turns ?? []) clock.at(t.at, t.turn)

    await clock.play()
  } finally {
    loop?.stop()
    for (const live of lives) if (live.tab) await as(live, () => live.tab!.close())
    env?.restore()
  }
  for (const pk of packets.values()) if (pk.page < 0) pk.page = visits.get(`${pk.scene}/${pk.seat}`) ?? -1
  const byTime = <T extends { sent: number; page: number }>(a: T, b: T) => a.sent - b.sent || a.page - b.page
  for (const r of [...packets.values()].sort((a, b) => byTime(a, b) || a.k - b.k)) put(r)
  for (const r of [...messages.values()].sort((a, b) => byTime(a, b) || a.seq - b.seq)) put(r)
  return records
}

// One page's frame as a record: what its client holds after the frame, which began at `t` on the
// run's clock and `start` on the page's, with the envelopes it took, what `watch` names, and `cost`
// when the run times its frames.
async function frameOf(live: Live, took: Took[], t: number, start: number, watch: Watch | undefined, cost: number | undefined): Promise<FrameRecord> {
  const c = live.tab!.client
  const rec: FrameRecord = {
    type: 'frame', page: live.i, t, clock: start, n: c ? c.n : null, took,
    rows: watched(c?.rows ?? [], watch),
  }
  if (c && watch?.own) {
    let at: Row | undefined = possessed(c.rows)
    let id: unknown
    for (const field of [watch.own].flat()) {
      const named: unknown = at?.data[field]
      id = typeof named === 'object' && named !== null && 'id' in named ? named.id : named
      at = typeof id === 'number' ? c.rows.find(r => r.id === id) : undefined
    }
    if (at) rec.own = at.id
  }
  if (c) {
    const eye = await eyeOf(live, c)
    if (eye) rec.eye = eye
  }
  if (live.drawing?.last) {
    rec.drawn = live.drawing.last
    live.drawing.last = undefined
    if (c?.plugins.wire.between !== undefined) rec.between = c.plugins.wire.between
  }
  if (cost !== undefined) rec.cost = cost
  return rec
}

// Listens, before a frame runs, to where the page's client draws things: the first of the scene's
// plugins that exports `drew(f)` hands `f` each frame's drawn places (render3d does). A client made
// again, a new scene's, is listened to afresh.
function listen(live: Live, watch: Watch | undefined) {
  const c = live.tab?.client
  if (!watch?.drawn || !c || live.drawing?.client === c) return
  const drawing: Live['drawing'] = { client: c }
  live.drawing = drawing
  for (const name of c.plugins.wire.scene.plugins ?? []) {
    const p = c.plugins[name]
    if (p && 'drew' in p && typeof p.drew === 'function') { p.drew((d: Drawn) => { drawing.last = d }); return }
  }
}

// The listeners of a page on real clocks, where the page's clock is the machine's own.
async function listening<T>(page: Live, f: () => T | Promise<T>): Promise<T> {
  const add = g.addEventListener, remove = g.removeEventListener
  g.addEventListener = (type: string, fn: (e: any) => void) => { let s = page.listeners.get(type); if (!s) page.listeners.set(type, (s = new Set())); s.add(fn) }
  g.removeEventListener = (type: string, fn: (e: any) => void) => { page.listeners.get(type)?.delete(fn) }
  try { return await f() } finally { g.addEventListener = add; g.removeEventListener = remove }
}

const copy = (e: Eye): Eye => ({ pos: [...e.pos], dir: [...e.dir], ...(e.target ? { target: [...e.target] } : {}) })

// The camera of the actor that exports `eye()`, by the module the client runs for its row (`actor`
// in `engine/browser.ts`). A row whose actor is not set up yet is asked again on a later frame.
async function eyeOf(live: Live, c: Client): Promise<Eye | undefined> {
  for (const r of c.rows) {
    let eye = live.eyes.get(r.id)
    if (eye === undefined) {
      const mod = c.actor(r.id) as (Record<string, unknown> | undefined)
      if (!mod) continue
      eye = typeof mod.eye === 'function' ? mod.eye as () => Eye : null
      live.eyes.set(r.id, eye)
    }
    if (eye) {
      const e = eye()
      if (e) return copy(e)
    }
  }
  // Where no actor holds one, the camera as the first of the scene's plugins that exports `eye()`
  // holds it: its `{ pos, dir }`. A plugin holds it as its own, which `in` asks, since a name the
  // player plugin has not got is a message it sends.
  for (const name of c.plugins.wire.scene.plugins ?? []) {
    const p = c.plugins[name]
    if (p && 'eye' in p && typeof p.eye === 'function') return copy(p.eye())
  }
  return undefined
}

// ------------------------------------------------------------------ simulate

export async function simulate(run: Run): Promise<Record_[]> {
  const clock = timeline(run.ms)
  const die = seeded(run.seed)
  const sub = () => seeded(Math.floor(die() * 2 ** 31))
  const s = run.server ?? {}
  const serverDie = sub()
  const pauses = instants(serverDie, s.pause?.every ?? 0, run.ms).map(t => [t, t + (s.pause?.ms ?? 0)] as const)
  const rate = 1 + (s.ppm ?? 0) * 1e-6
  const grain = s.grain ?? 1
  const time: Time = {
    now: () => clock.now() * rate,
    after(ms, f) {
      // An exact timer still waits a nanosecond: a loop a hair short of a whole step asks for less
      // than the timeline's clock can add to itself, and would be called again at the same instant.
      const wait = (grain > 0 ? Math.max(grain, Math.floor(ms / grain) * grain) : Math.max(ms, 1e-6)) + (s.late ? exp(serverDie(), s.late) : 0)
      let t = clock.now() + wait / rate
      for (const [a, b] of pauses) if (t >= a && t < b) t = b
      clock.at(t, f)
    },
  }
  const truth = boot(structuredClone(run.file), run.sim)
  await load(truth, run.base)
  const netTime: Time = { now: clock.now, after: (ms, f) => clock.at(clock.now() + ms, f) }
  let tapped: Accept<Up | Got, Diff> | undefined
  const pages = run.pages.map(p => {
    const net = { up: p.up, down: p.down, seed: Math.floor(die() * 2 ** 31), open: p.open }
    const d = sub()
    const P = 1000 / p.display.hz
    const rolled = d() * P
    const phase = p.display.phase ?? rolled
    const longs = instants(d, p.display.long?.every ?? 0, run.ms)
    const offset = p.clock?.offset ?? 0, prate = 1 + (p.clock?.ppm ?? 0) * 1e-6
    // The first vsync at or after `t`.
    const vsync = (t: number) => phase + Math.ceil((t - phase) / P - 1e-9) * P
    return {
      join: p.join ?? 0,
      clock: () => offset + clock.now() * prate,
      think: p.think,
      predict: p.predict,
      presses: p.presses ?? [],
      net,
      frames(frame: () => Promise<void>) {
        if (p.display.at) {
          for (const at of p.display.at) clock.at(at, frame)
          return
        }
        let last = -Infinity
        const next = (ready: number) => {
          let v = vsync(ready)
          for (;;) {
            const hid = p.display.hidden?.find(([a, b]) => v >= a && v < b)
            if (hid) { v = vsync(hid[1]); continue }
            if (d() < (p.display.drop ?? 0)) { v += P; continue }
            break
          }
          clock.at(v + d() * (p.display.wobble ?? 0), async () => {
            await frame()
            // A long frame draws nothing on the vsyncs its work covers.
            const t = clock.now()
            const long = longs.some(x => x > last && x <= t)
            last = t
            next(Math.max(v + P / 2, long ? t + p.display.long!.ms : 0))
          })
        }
        next((p.join ?? 0) + (p.display.stall ?? 0))
      },
    }
  })
  const head: RunRecord = {
    type: 'run', mode: 'sim', seed: run.seed, ms: run.ms, clocks: run.pages.map(p => p.clock?.offset ?? 0), server: s,
    pages: run.pages.map(({ think, up, down, ...p }) => {
      const leg = ({ wait, ...l }: Leg) => (wait ? { ...l, wait: true } : l)
      return { ...p, up: leg(up), down: leg(down), ...(think ? { think: true } : {}) }
    }),
    ...(run.watch ? { watch: run.watch } : {}),
  }
  return play(run, {
    mode: 'sim', clock, head, pages,
    server: { truth, time, interval: s.loop === 'interval', steps: s.steps },
    start: async t => { tapped = t },
    wire: i => loopback(tapped!, netTime, pages[i].net),
  })
}

// ------------------------------------------------------------------ real

export async function real(run: RealRun): Promise<Record_[]> {
  const clock = machine(run.ms)
  let truth: Truth | undefined
  if (!run.url) {
    truth = boot(structuredClone(run.file), run.sim)
    await load(truth, run.base)
  }
  let url = run.url
  let server: { close(): Promise<void> } | undefined
  const pages = run.pages.map(p => ({
    join: p.join ?? 0,
    clock: () => performance.now(),
    think: p.think,
    predict: p.predict,
    presses: p.presses ?? [],
    // Frame k at k frames' time, as a display's vsyncs are: each frame is on a later one than the
    // last, however early a timer fires, and one that ran past vsyncs draws on the next one after it.
    frames(frame: () => Promise<void>) {
      const P = 1000 / p.hz
      let k = Math.ceil((p.join ?? 0) / P)
      const next = () => clock.at(k * P, async () => { await frame(); k = Math.max(k + 1, Math.ceil(clock.now() / P)); next() })
      next()
    },
  }))
  const head: RunRecord = {
    type: 'run', mode: 'real', ms: run.ms, clocks: run.pages.map(() => clock.zero!), ...(run.url ? { url: run.url } : {}),
    pages: run.pages.map(({ think, ...p }) => (think ? { ...p, think: true } : p)),
    ...(run.watch ? { watch: run.watch } : {}),
  }
  try {
    return await play(run, {
      mode: 'real', clock, head, pages,
      server: truth ? { truth } : undefined,
      start: async tapped => {
        if (!tapped) return
        const s = await serve(run.port ?? manager(truth!).data.port, tapped)
        server = s
        url = `ws://localhost:${s.port}`
      },
      wire: () => dial<Up | Got, Diff>(url!),
    })
  } finally {
    await server?.close()
  }
}

// ------------------------------------------------------------------ the browser's tap

// A page in a real browser, recorded as a real run is. `client.html` hands `tap` the wire it dials
// and the function that makes its view on it, and frames what `tap` hands back as it would the view.
// It records only when the page's address asks, `?tap=<name>`: then every frame is a frame record,
// its envelopes the ones that arrived since the frame before (when they were sent is the server's
// to know, and is null), and the lines go to the simulator's route (`simulator.route.ts`), which
// writes them to `addons/simulator/runs/<name>.jsonl`, the run line first, then a batch a second and
// the last as the page is hidden. The address's `kinds` and `fields`, each a list split by commas,
// and `own`, fields split by dots, are the watch, and `drawn`, present, records where each frame drew
// things. Without `?tap` it is the view, untouched.
// `send` is how the lines leave the page, `fetch` to the route unless another is handed in, and
// `search` the address's query, the page's own unless another is handed in.
// `input` before the page's steps, as `client.html`'s loop calls it; `frame` handed the time
// `requestAnimationFrame` handed the loop, which a page that runs its scene ahead steps its copy on.
export type Tapped = { input(): void; frame(now?: number): Promise<void>; readonly client: Client | undefined; close(): void }
export function tap<V extends Tapped>(wire: Wire<Up | Got, Diff>, make: (wire: Wire<Up | Got, Diff>) => V, options: {
  search?: string
  send?: (body: { name: string; first: boolean; lines: string[] }, last: boolean) => void
} = {}): Tapped {
  const query = new URLSearchParams(options.search ?? (typeof location === 'undefined' ? '' : location.search))
  const name = query.get('tap')
  if (!name) return make(wire)
  if (!NAME.test(name)) throw new Error(`the tap is named ${JSON.stringify(name)}: letters, digits, _, . and - only`)
  const list = (key: string, by: string) => query.get(key)?.split(by).filter(Boolean)
  const watch: Watch | undefined = query.has('kinds') || query.has('fields') || query.has('own') || query.has('drawn')
    ? { ...(list('kinds', ',') ? { kinds: list('kinds', ',') } : {}), ...(list('fields', ',') ? { fields: list('fields', ',') } : {}), ...(list('own', '.') ? { own: list('own', '.') } : {}), ...(query.has('drawn') ? { drawn: true } : {}) }
    : undefined
  const send = options.send ?? ((body, last) => {
    const json = JSON.stringify(body)
    if (last && typeof navigator !== 'undefined' && navigator.sendBeacon) navigator.sendBeacon('/api/x/simulator/tap', new Blob([json], { type: 'application/json' }))
    else void fetch('/api/x/simulator/tap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json })
  })
  const start = performance.now()
  const now = () => performance.now() - start
  const live: Live = { i: 0, clock: () => performance.now(), listeners: new Map(), arrived: [], eyes: new Map() }
  let lines: string[] = [JSON.stringify({ type: 'run', mode: 'real', ms: 0, clocks: [start], pages: [{ browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent }], ...(watch ? { watch } : {}) } satisfies RunRecord)]
  let first = true
  const flush = (last: boolean) => {
    if (!lines.length) return
    send({ name, first, lines }, last)
    first = false
    lines = []
  }
  const timer = setInterval(() => flush(false), 1000)
  const hidden = () => flush(true)
  if (typeof addEventListener === 'function') addEventListener('pagehide', hidden)
  const tapped: Wire<Up | Got, Diff> = fan => wire(d => {
    live.arrived.push({ k: d.k, n: d.n, sent: null, at: now() })
    fan(d)
  })
  const inner = make(tapped)
  live.tab = inner as unknown as Live['tab']
  return {
    get client() { return inner.client },
    input() { inner.input() },
    async frame(at?: number) {
      const took = live.arrived.splice(0)
      const t = now(), start = live.clock()
      listen(live, watch)
      await inner.frame(at)
      lines.push(JSON.stringify(await frameOf(live, took, t, start, watch, undefined)))
    },
    close() {
      clearInterval(timer)
      if (typeof removeEventListener === 'function') removeEventListener('pagehide', hidden)
      flush(true)
      inner.close()
    },
  }
}

// The timing of a recorded run, a real one's above all, for a simulation to play again: when its
// server stepped; when each page's code saw each frame; how long each page's wire took to open, to
// just before the step that made its first envelope; and each page's network, item by item: each
// envelope, message and word that an envelope was got (`Got`) arrives when it arrived, however long
// the frame that sent it took in the machine's time, and one that never arrived is lost again. A
// simulation of the same game given it draws what the recording drew, however late the machine's
// timers came and however long its socket held a message while it was made, so what a real run
// shows can be told from what the timers did to it. Whatever the recording does not know, a server
// it did not hold, is left to each leg's middle wait.
export function timing(records: Record_[]): { ms: number; server: Server; pages: Page[] } {
  const head = records.find((r): r is RunRecord => r.type === 'run')
  if (!head) throw new Error('the records have no run line')
  const frames = records.filter((r): r is FrameRecord => r.type === 'frame')
  const ms = head.ms || frames.reduce((m, f) => Math.max(m, f.t), 0)
  const ids = [...new Set(frames.map(f => f.page))].sort((a, b) => a - b)
  const middle = (waits: number[]) => (waits.length ? [...waits].sort((a, b) => a - b)[Math.floor(waits.length / 2)] : 0)
  return {
    ms,
    server: { steps: records.filter((r): r is StepRecord => r.type === 'step').map(r => r.t) },
    pages: ids.map(page => {
      // When the page's code saw each frame: its clock's first reading, less the page's clock at the
      // timeline's 0, which the run line says, or else the frame that read soonest after it was
      // called gives.
      const mine = frames.filter(f => f.page === page)
      const base = head.clocks?.[page] ?? Math.min(...mine.map(f => f.clock - f.t))
      const at = mine.map(f => f.clock - base)
      const gaps = at.slice(1).map((t, i) => t - at[i]).sort((a, b) => a - b)
      const hz = gaps.length ? 1000 / gaps[Math.floor(gaps.length / 2)] : 60
      const sent = records.filter((r): r is PacketRecord => r.type === 'packet' && r.page === page)
      const said = records.filter((r): r is MessageRecord => r.type === 'message' && r.page === page)
      // When each item arrived, or null for one that never did.
      const down = new Map(sent.map(p => [`${p.scene}/${p.seat}/${p.k}`, p.at.length ? p.at[0] : null]))
      const heard = new Map(said.map(m => [`${m.scene}/${m.seat}/${m.seq}`, m.at.length ? m.at[0] : null]))
      const got = new Map(sent.filter(p => p.got.length).map(p => [p.k, p.got[0]]))
      const until = (at: number | null | undefined, now: number) => (at === null || at === undefined ? at : Math.max(0, at - now))
      // The page opened its wire as the recording began, and the server made its side just before the
      // step that made its first envelope.
      const first = sent.reduce<PacketRecord | undefined>((a, p) => (!a || p.sent < a.sent ? p : a), undefined)
      const made = first && records.find((r): r is StepRecord => r.type === 'step' && r.scenes[first.scene] === first.n)
      const open = first ? Math.max(0, (made ? made.t : first.sent) - 1e-6) : 0
      return {
        // The page's clock as the recording's was, so its sums are made on the numbers it made them on.
        display: { hz, at }, join: 0, open, clock: { offset: base },
        up: {
          delay: middle(said.flatMap(m => m.at.map(a => a - m.sent))),
          wait: (item: unknown, now: number) => {
            const u = item as Up | Got
            return until('got' in u ? got.get(u.got) : 'msg' in u ? heard.get(`${u.scene}/${u.seat}/${u.msg.seq}`) : undefined, now)
          },
        },
        down: {
          delay: middle(sent.flatMap(p => p.at.map(a => a - p.sent))),
          wait: (item: unknown, now: number) => { const d = item as Diff; return until(down.get(`${d.scene}/${d.seat}/${d.k}`), now) },
        },
      }
    }),
  }
}

// ------------------------------------------------------------------ examining

// The records of a JSONL file's text.
export function parse(text: string): Record_[] {
  return text.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Record_)
}

// A page's frames that drew a packet: every frame from its first packet on.
const framesOf = (records: Record_[], page: number) => records.filter((r): r is FrameRecord => r.type === 'frame' && r.page === page && r.n !== null)
const count = (xs: number[]) => {
  const out: Record<number, number> = {}
  for (const x of xs) out[x] = (out[x] ?? 0) + 1
  return out
}

// How many frames of a page moved the step it drew by 0, 1, 2… steps, from the frame after its first
// packet's; and the timeline's ms of that first frame, or null when the page drew no packet.
export function histogram(records: Record_[], page: number): { first: number | null; counts: Record<number, number> } {
  const fs = framesOf(records, page)
  if (!fs.length) return { first: null, counts: {} }
  return { first: fs[0].t, counts: count(fs.slice(1).map((f, i) => f.n! - fs[i].n!)) }
}

// The page's own row (`watch.own`) against its camera, frame by frame from its first packet: `d` the
// distance from the camera's eye to the row's `field` (a point), and how much it changed from one
// frame to the next at most and on the root mean square: a camera following smoothly changes it
// little, one that judders changes it every frame.
export function standoff(records: Record_[], page: number, field = 'pos'): { frames: { t: number; d: number }[]; jitter: { max: number; rms: number } } {
  const out: { t: number; d: number }[] = []
  for (const f of framesOf(records, page)) {
    const at = f.own !== undefined ? f.rows[f.own]?.[field] : undefined
    if (!f.eye || !Array.isArray(at)) continue
    out.push({ t: f.t, d: Math.hypot(...f.eye.pos.map((e, i) => e - (at[i] as number))) })
  }
  const deltas = out.map((x, i) => (i ? Math.abs(x.d - out[i - 1].d) : 0)).slice(1)
  return {
    frames: out,
    jitter: { max: deltas.length ? Math.max(...deltas) : 0, rms: deltas.length ? Math.sqrt(deltas.reduce((s, x) => s + x * x, 0) / deltas.length) : 0 },
  }
}

// How many frames of a page took 0, 1, 2… envelopes, from the frame after its first packet's.
export function packets(records: Record_[], page: number): Record<number, number> {
  return count(framesOf(records, page).slice(1).map(f => f.took.length))
}

export type Summary = {
  mode: 'sim' | 'real'
  ms: number
  steps: number
  rate: number
  pages: { page: number; frames: number; histogram: ReturnType<typeof histogram>; standoff: { max: number; rms: number }; packets: Record<number, number> }[]
}

// Every part of a run, per page, and the server's steps and their rate.
export function summary(records: Record_[]): Summary {
  const head = records.find((r): r is RunRecord => r.type === 'run')
  if (!head) throw new Error('the records have no run line')
  const stepped = records.filter(r => r.type === 'step').length
  // A run whose length was not known as it began, a browser's, is as long as its last frame.
  const ms = head.ms || records.reduce((m, r) => (r.type === 'frame' ? Math.max(m, r.t) : m), 0)
  const ids = [...new Set(records.flatMap(r => (r.type === 'frame' ? [r.page] : [])))].sort((a, b) => a - b)
  return {
    mode: head.mode,
    ms,
    steps: stepped,
    rate: ms > 0 ? stepped / (ms / 1000) : 0,
    pages: ids.map(page => ({
      page,
      frames: records.filter(r => r.type === 'frame' && r.page === page).length,
      histogram: histogram(records, page),
      standoff: standoff(records, page).jitter,
      packets: packets(records, page),
    })),
  }
}

// A summary as lines to print.
export function report(s: Summary): string {
  const lines = [`${s.mode} run of ${s.ms} ms: ${s.steps} server steps, ${s.rate.toFixed(2)} a second`]
  const hist = (h: Record<number, number>) => Object.entries(h).map(([k, v]) => `${k}:${v}`).join(' ')
  for (const p of s.pages) {
    lines.push(`page ${p.page}: ${p.frames} frames; steps a frame ${hist(p.histogram.counts)} (first packet drawn at ${p.histogram.first === null ? '-' : `${p.histogram.first.toFixed(1)} ms`})`)
    lines.push(`  envelopes a frame ${hist(p.packets)}; standoff jitter max ${p.standoff.max.toFixed(4)}, rms ${p.standoff.rms.toFixed(4)}`)
  }
  return lines.join('\n')
}

// ------------------------------------------------------------------ from node

// A config's `game`, the manager scene file's path, as the file, its sim and the folder beside it.
async function gameOf(path: string): Promise<{ file: Scene; sim: Sim; base: string }> {
  if (!path.endsWith('.scene.json')) throw new Error(`the config's game names ${path}, not a .scene.json`)
  const { readFile } = await import('node:fs/promises')
  const { pathToFileURL } = await import('node:url')
  const url = pathToFileURL(path)
  const file = JSON.parse(await readFile(url, 'utf8')) as Scene
  const mod = await import(/* @vite-ignore */ new URL(path.replace(/\.scene\.json$/, '.sim.ts').split('/').pop()!, url).href)
  if (!('sim' in mod)) throw new Error(`the sim beside ${path} exports no sim`)
  return { file, sim: mod.sim as Sim, base: new URL('./', url).href }
}

// Run as the script node was handed, under any link to it: the real paths are compared.
const main = typeof process !== 'undefined' && !!process.argv?.[1]?.endsWith('simulator.addon.ts') &&
  (await import('node:fs')).realpathSync(process.argv[1]) === (await import('node:url')).fileURLToPath(import.meta.url)
if (main) {
  const [what, path, out] = process.argv.slice(2)
  const { readFile, writeFile } = await import('node:fs/promises')
  if (what === 'summary' && path) console.log(report(summary(parse(await readFile(path, 'utf8')))))
  else if ((what === 'run' || what === 'real') && path) {
    const config = JSON.parse(await readFile(path, 'utf8'))
    const lines: string[] = []
    const game = { ...config, ...(await gameOf(config.game)), write: (l: string) => lines.push(l) }
    const records = what === 'run' ? await simulate(game) : await real(game)
    if (out) await writeFile(out, lines.join('\n') + '\n')
    console.log(report(summary(records)))
    process.exit(0)
  } else {
    console.error('usage: simulator.addon.ts run <config.json> [out.jsonl] | real <config.json> [out.jsonl] | summary <run.jsonl>')
    process.exit(1)
  }
}
