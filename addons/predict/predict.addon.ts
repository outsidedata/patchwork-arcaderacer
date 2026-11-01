// Running a scene ahead of its server. A page across a network from its server, `client.html`, is
// sent each step's rows a down leg late, and its presses reach the server an up leg late, so a page
// that draws the packets draws its own press a whole round trip after the key went down. A page
// that runs ahead holds a truth of the scene its seat is on, a copy of the server's, steps it on its
// own clock as `index.html` steps its truth, answers its own presses on it, and draws it: a press is
// drawn on the next frame, at any lag.
//
// The server owns the clock (`addons/rewind`). It runs on its own and never waits for a page. The
// page stamps each press with the step its copy answered it on; the press reaches the server after
// the server has run that step, and the server goes back there: it loads the truth as it stood
// before that step, takes the press, and plays on from there, running nothing again. So the server's
// truth holds every press of this page on the step this page made it.
//
// Every other seat's presses reach the page the same way. With each packet the server sends the
// scene's journal (`Log` in the scenemanager addon): every message any seat's steps took, stamped
// with the step it was answered on, from the first entry the page has not said it has. The page puts
// each into its copy on that step: its copy is run by a rewind of its own (`addons/rewind`), which
// goes back to that step as the server's did and runs every step again up to where it stood within
// the same frame (`fast`), so the player never sees the world stand behind. Whatever the late press
// moved jumps, and that jump is eased (Easing a jump). So the copy takes every seat's presses on the steps the server took
// them, as the server's truth does, and comes to the same rows: the page is corrected only for the
// last bit of maths a browser rounds otherwise than node, and when a press of its own reaches the
// server so late that the copy no longer keeps the step it took it on.
//
// Where it stands. It sits between the page's link and its view:
//   const page = tap(dial(url), wire => predict(link(wire), file, import.meta.url, mount))
//   const loop = async now => { page.input(); await page.frame(now); requestAnimationFrame(loop) }
// `predict(wire, file, base, mount)` makes the view itself, on a link of its own, and hands back the
// page: `input()`, the view's, called before the steps; `frame(now)`, which runs this frame's steps of
// the copy and then the view's frame, `now` the time `requestAnimationFrame` handed the loop; `client`
// and `name`, the view's; `close()`; and `stats` (below). `index.html` never imports it: there the
// page and the truth share a tab, and nothing needs running ahead.
//
// Which scenes. A child scene is run ahead when its `world.predict` is `{ "epsilon": e, "cutoff": c,
// "halflife": h, "snap": s, "below": b }` (`predicts` in `addons/rewind`). Any other scene runs nothing here: every envelope goes to the view
// as it came, every message goes up as it is, and the page steps nothing.
//
// The page's maths. A browser and node do not compute `Math.sin`, `exp`, `pow`, `**` and the rest
// to the same last bit (Chrome against node 22 differed on 2 to 16 in 100 of each), so a copy whose
// rules called them would end a hair from the server's truth; every rule, plugin server half and mod
// one asks calls `plugins/math` instead, the same bits on both (held by `plugins/math/math.sim.test.ts`
// and `games/games.test.ts`). `epsilon`, in the units of the rows' numbers, is how far apart a number
// of the page's and the server's may be and still be the same: a packet within it is a drift, never a
// correction, and the copy plays on without taking the server's truth (Correcting).
//
// Starting. The first envelope of a visit names the scene; once its files are fetched and its rows'
// kinds prepared, as `view` prepares them, the page sends `want`, asking for the whole truth, which
// the server sends with its next packet, with where the journal stood as it was saved. The page boots
// the scene, loads the snapshot (`engine/engine.ts`, `save` and `load`), gives it the pieces the
// server's truth has (`door` in the scenemanager addon, `mirror` in the player addon), hands each
// row's kind what it held beside the rows on the server (`Memory` in `addons/rewind`: box3d's whole
// Box3D world, its contacts and warm starting with it), and runs it from the next frame, taking every
// journal entry from where the snapshot left it. Until then every envelope goes to the view as it
// came, and a message the client sends waits. A `want` that no snapshot answered within a second is
// sent again, so a lost one is asked for again.
//
// The clock. The copy steps a step for every `engine.dt` of the page's clock, as `index.html` steps
// its truth, handed the manager's `scenemanager.dt` as the server's children are, at most a quarter
// second of steps on one frame. It starts at the snapshot's step, which the server had already passed
// by the down leg, so the copy runs that far behind the server's clock and every press reaches the
// server a round trip after its step, which `cutoff` must cover. A copy that falls more than `cutoff`
// steps behind the newest packet, a tab whose frames stopped, asks for the whole truth again and
// starts over from it. The server's truth falls behind the server's clock each time it goes back for
// a late press, so a copy timed off the truth's step would stand wherever the truth stood when the
// page joined, and two pages that joined at different times would stand far apart, each going back
// that far for every press of the other. So every packet carries the server's clock (`clock` on the
// scenemanager's `Log`), and the copy is held to it as heard, carried on by the page's own clock: it
// starts there, and runs up to `SKEW` faster or slower than real time until it stands there again.
// Every page stands one down leg behind the server's clock, whenever it joined. The view is handed `between`, what the clock owes over a step's seconds, and
// draws between the copy's last two steps (`engine/browser.ts`).
//
// A message. The client's message is stamped with the step the copy is about to run, put in the
// copy's inbox, which answers it on that step, kept until a packet's ack covers it, and sent up on
// every frame until then, so one lost on the way is sent again; the server takes each once. Its
// entry in the journal, when it comes, is this page's own and is not taken again; one the server
// answered on another step than its stamp, past `cutoff`, is moved there in the copy (`move` in
// `addons/rewind`), and has the page ask for the whole truth only when the copy no longer keeps the
// step it took it on.
//
// What is drawn. The view is handed the copy's packet after each step it runs: every row the seat may
// see, as the copy has it. The seat's own row answers its press on the next frame; so does every row
// that press makes or moves, a shot it fires, a thing it throws, a crate it knocks over; and every
// other seat's row runs on from its last press, carried by the copy's rules, never held where the
// last packet left it. A press of another seat that reaches the copy late moves what it moved, and
// that jump is eased (Easing a jump).
//
// Easing a jump. When the copy goes back for a late journal entry, or loads the server's truth over a
// copy already running, the rows it has at the step it last drew differ from what it drew there only
// where the jump moved something. Each number that moved, by no more than `snap`, is an offset, but
// one whole on both sides of the jump, a sprite's frame, a count, an id, which has no place between
// and is drawn where it now is: the
// view is handed the copy's rows with every offset added, so on that step each thing is drawn just
// where it was, and each offset halves every `halflife` milliseconds of the steps' time until it is
// within `below`, and gone. A thing the jump did not move has no offset and is drawn exactly where the
// copy has it, moving or not; a number that moved further than `snap` is drawn where it now is at
// once. The copy itself is never offset: only what the view is handed.
//
// Correcting. Each packet the server sends is held against the rows the copy had at that step, once
// the copy has run that step and taken every journal entry the packet carried, and only when the
// server had taken every press this page made before that step: a packet whose ack does not cover
// such a press was made before the press reached the server, and is no news. Where one differs past
// `epsilon`, the page asks for the whole truth; the snapshot comes back of a later step, and the page loads it, puts
// back every message it sent that the snapshot's seat had not taken yet, and runs again to the step
// it stood at. A packet within `epsilon` is a drift, past it a correction; only a correction has the
// page ask for the whole truth.
//
// `stats`: `predicting`, whether this visit runs ahead; `corrections`, packets that differed by more
// than `epsilon`; `drifts`, packets that differed by no more; `behind`, how many steps the copy
// stands behind the newest packet; `n`, the copy's step; `checked`, packets held against the copy;
// `taken`, journal entries of other seats put into the copy; `missed`, those stamped before the
// oldest step the copy keeps, answered on its next step instead; `back`, steps the copy went back for
// them; `loads`, the step of each snapshot the copy loaded; `differed` and `first`, the last and the
// first packet that differed: its step and each row that differed, with the copy's data and the
// packet's; `drifted`, the last packet that drifted, the same, with `by`, the most any one number of
// it was apart.
import { boot, type Msg, type Packet, type Row, type Scene, type Sim, type Snapshot, type Truth } from '#engine/engine.ts'
import type { Client } from '#engine/browser.ts'
import { child, door, prepare, seat, view, type Down, type Entry, type Link, type SeatOp, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { mirror } from '#addons/player/player.addon.ts'
import { onRewind, predicts, restore, rewind, type Rewind, type Written } from '#addons/rewind/rewind.addon.ts'

export type Stats = {
  predicting: boolean
  corrections: number
  drifts: number
  behind: number
  n: number
  checked: number
  taken: number
  back: number
  missed: number
  // The step of each snapshot the copy loaded, oldest first.
  loads: number[]
  differed?: { n: number; rows: { id: number; kind: string; mine?: unknown; theirs?: unknown }[] }
  first?: { n: number; rows: { id: number; kind: string; mine?: unknown; theirs?: unknown }[] }
  drifted?: { n: number; by: number; rows: { id: number; kind: string; mine?: unknown; theirs?: unknown }[] }
}

type Visit = {
  scene: string
  seat: number
  // Whether the scene is read: and if so, whether it runs ahead.
  read: boolean
  passing: boolean
  ready?: { scene: Scene; sim: Sim }
  epsilon: number
  cutoff: number
  // How a jump of the copy is eased (Easing a jump), and whether the copy jumped since its last step
  // was drawn: went back for a journal entry, or loaded the server's truth over a copy already running.
  ease?: { halflife: number; snap: number; below: number }
  jumped: boolean
  // Each row's offset, every number of its data the jump moved and how far, by row id; and the rows
  // the view was last handed, offsets in, with their step.
  offsets: Map<number, Offset[]>
  drawn?: { n: number; rows: Row[] }
  truth?: Truth
  rewind?: Rewind
  // The newest snapshot heard and not loaded yet, with what each row's kind held beside it and where
  // the journal stood as it was saved, and when the page last asked for one.
  snap?: { snap: Snapshot; held: Record<number, unknown>; log: Written[]; end: number; at: number }
  asked: number
  asking: boolean
  // The messages sent that no packet's ack covers yet, and the newest the copy has answered.
  kept: Msg[]
  ack: number
  // The step each message this page sent was stamped with, until its journal entry comes.
  stamps: Map<number, number>
  // The messages the client sent before the copy ran, which wait for it (A message).
  queued: Msg[]
  // The journal entries heard, by place, and the place of the first not yet taken into the copy.
  entries: Map<number, Written>
  applied: number
  // The rows the seat's packet of the copy had at each step no packet has been held against yet.
  history: Map<number, Row[]>
  // The packets heard and not yet held against the copy, each with the journal end it carried.
  arrived: { packet: Packet; end: number }[]
  // The step of the newest packet held against the copy, and every message sent that the newest
  // packet held against it had not taken: a later packet's ack lets a message go from `kept`, and an
  // earlier packet, held after it, still has to know it was made before the server took it. Beside
  // them, each journal entry taken since the journal end of the newest packet held, by place and step:
  // a packet made before the server took a message stamped before its step is no news either.
  upto: number
  pressed: Msg[]
  since: { i: number; n: number }[]
  newest: number
  owed: number
  last: number
  // The server's clock less this page's own, both in steps, as the packets heard have it (The clock);
  // and the highest reading of the server's clock of a packet whose journal is all in hand, with the
  // reading and journal end of each packet heard whose journal is not yet (The journal).
  base?: number
  heard?: number
  clocks: { end: number; clock: number }[]
  stats: Stats
}

// Equal as JSON sends them: an object's `undefined` fields are absent.
const plain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b) || a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]))
  if (!plain(a) || !plain(b)) return false
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter(key => o[key] !== undefined)
  const ka = keys(a)
  return ka.length === keys(b).length && ka.every(key => Object.hasOwn(b, key) && same(a[key], b[key]))
}
// The rows of `mine` and `theirs` that differ, or that one has and the other has not.
export function differing(mine: Row[], theirs: Row[]) {
  const by = new Map(theirs.map(r => [r.id, r]))
  const out: { id: number; kind: string; mine?: unknown; theirs?: unknown }[] = mine
    .filter(r => !by.has(r.id) || by.get(r.id)!.kind !== r.kind || !same(r.data, by.get(r.id)!.data))
    .map(r => ({ id: r.id, kind: r.kind, mine: r.data, theirs: by.get(r.id)?.data }))
  for (const r of theirs) if (!mine.some(m => m.id === r.id)) out.push({ id: r.id, kind: r.kind, theirs: r.data })
  return structuredClone(out)
}

// Two values apart by no more than `epsilon` in every number, and the same in everything else.
function near(a: unknown, b: unknown, epsilon: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || Math.abs(a - b) <= epsilon
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => near(x, b[i], epsilon))
  if (!plain(a) || !plain(b)) return same(a, b)
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter(key => o[key] !== undefined)
  const ka = keys(a)
  return ka.length === keys(b).length && ka.every(key => Object.hasOwn(b, key) && near(a[key], b[key], epsilon))
}
// The most any one number of `a` stands from its place in `b`, of two values `near` holds alike.
function apart(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) ? 0 : Math.abs(a - b)
  if (Array.isArray(a) && Array.isArray(b)) return Math.max(0, ...a.map((x, i) => apart(x, b[i])))
  if (!plain(a) || !plain(b)) return 0
  return Math.max(0, ...Object.keys(a).map(key => apart(a[key], b[key])))
}
export const nearRows = (a: Row[], b: Row[], epsilon: number) => {
  if (a.length !== b.length) return false
  const by = new Map(b.map(r => [r.id, r]))
  return a.every(r => { const o = by.get(r.id); return !!o && o.kind === r.kind && near(r.data, o.data, epsilon) })
}
// Whether two lists of rows are the same rows, each the same kind with the same data, as JSON has it.
export const sameRows = (a: Row[], b: Row[]) => {
  if (a.length !== b.length) return false
  const by = new Map(b.map(r => [r.id, r]))
  return a.every(r => { const o = by.get(r.id); return !!o && o.kind === r.kind && same(r.data, o.data) })
}

// One number of a row's data, by its path, and how far a jump moved it from where it was drawn.
type Offset = { path: (string | number)[]; by: number }
// Every number in a row's data, by path.
function numbers(v: unknown, path: (string | number)[] = [], out: { path: (string | number)[]; value: number }[] = []) {
  if (typeof v === 'number') { if (Number.isFinite(v)) out.push({ path, value: v }) }
  else if (Array.isArray(v)) v.forEach((x, i) => numbers(x, [...path, i], out))
  else if (plain(v)) for (const [k, x] of Object.entries(v)) numbers(x, [...path, k], out)
  return out
}
const at = (v: unknown, path: (string | number)[]): unknown => path.reduce<unknown>((o, k) => (o as Record<string | number, unknown> | undefined)?.[k], v)
// Each row of `now` the copy's rows moved from `was` (the same step, as drawn), as its offsets: every
// number now differs from what was drawn, by how far. A row a number of which moved further than
// `snap`, or that was not drawn, has none: it is drawn where it is.
function offsets(was: Row[], now: Row[], snap: number) {
  const by = new Map(was.map(r => [r.id, r]))
  const out = new Map<number, Offset[]>()
  for (const r of now) {
    const w = by.get(r.id)
    if (!w || w.kind !== r.kind) continue
    const list: Offset[] = []
    let far = false
    for (const { path, value } of numbers(r.data)) {
      const old = at(w.data, path)
      if (typeof old !== 'number' || !Number.isFinite(old) || old === value) continue
      // A whole number on both sides of the jump, a sprite's frame, a count, a row's id, a slot, has
      // no place between: drawn where it now is.
      if (Number.isInteger(old) && Number.isInteger(value)) continue
      if (Math.abs(old - value) > snap) { far = true; break }
      list.push({ path, by: old - value })
    }
    if (!far && list.length) out.set(r.id, list)
  }
  return out
}

const nothing = (): Stats => ({ predicting: false, corrections: 0, drifts: 0, behind: 0, n: 0, checked: 0, taken: 0, back: 0, missed: 0, loads: [] })
const ASK = 1000
// How much faster or slower than real time the copy may run to stand on the server's clock again, and
// how much of a later packet's lower reading of that clock it takes (The clock).
const SKEW = 0.1
const SETTLE = 0.01

export function predict(wire: Link, file: Scene, base: string, mount: Parameters<typeof view>[3]) {
  const table = file.prefabs.scenemanager?.scenes as Record<string, Entry> | undefined
  if (!table) throw new Error('the manager scene has no scenemanager prefab naming scenes')
  const wall: unknown = file.prefabs.engine?.dt
  const dt: unknown = file.prefabs.scenemanager?.dt
  if (typeof wall !== 'number' || !(wall > 0)) throw new Error('the manager scene has no engine prefab with a dt above 0')
  if (typeof dt !== 'number' || !(dt > 0)) throw new Error('the manager scene has no scenemanager prefab with a dt above 0')

  const hearers: ((down: Down) => void)[] = []
  const held: Down[] = []
  const fan = (down: Down) => { if (!hearers.length) held.push(down); for (const h of hearers) h(down) }
  let visit: Visit | undefined
  let failed: unknown
  // The rows the view was last handed, by id and kind, for the births and ends of the next packet.
  let shown = new Map<number, string>()

  const pass = (d: Down) => {
    shown = new Map(d.packet.rows.map(r => [r.id, r.kind]))
    fan(d)
  }
  // The seat's packet of the copy, as the server makes its packets: the rows the seat may see; none
  // on a step before the seat came, which a copy loaded from a snapshot older than that runs.
  const seen = (v: Visit) => (v.seat < v.truth!.seats ? v.truth!.packet(v.seat).rows : [])
  // The step a journal entry is taken on: a message's stamp, or the step a change was made before.
  const when = (e: Written) => ('msg' in e ? e.msg.n : e.at)
  // The copy's packet after its newest step, handed to the view (What is drawn), each row drawn by its
  // offset away from where the copy has it (Easing a jump). After a jump, the offsets are taken again
  // from the step last drawn: what was drawn there less what the copy now has there. Each halves every
  // `halflife` of the steps' time, and one within `below` is gone. A number a rule has since taken out
  // of its row, or turned into something else, takes its offset with it.
  const emit = (v: Visit, rows: Row[]) => {
    const sent = structuredClone(rows)
    const ease = v.ease!
    if (v.jumped && v.drawn) {
      const again = v.history.get(v.drawn.n)
      v.offsets = again ? offsets(v.drawn.rows, again, ease.snap) : new Map<number, Offset[]>()
    }
    v.jumped = false
    const k = v.drawn ? Math.pow(0.5, Math.max(0, v.truth!.n - v.drawn.n) * wall * 1000 / ease.halflife) : 1
    for (const [id, list] of v.offsets) {
      const left = list.map(o => ({ path: o.path, by: o.by * k })).filter(o => Math.abs(o.by) > ease.below)
      if (left.length) v.offsets.set(id, left)
      else v.offsets.delete(id)
    }
    for (const r of sent) {
      for (const o of v.offsets.get(r.id) ?? []) {
        const parent = at(r.data, o.path.slice(0, -1)) as Record<string | number, unknown> | undefined
        const key = o.path[o.path.length - 1]
        const value = parent?.[key]
        if (parent && typeof value === 'number') parent[key] = value + o.by
      }
    }
    v.drawn = { n: v.truth!.n, rows: structuredClone(sent) }
    v.stats.n = v.truth!.n
    const now = new Map(sent.map(r => [r.id, r.kind]))
    const born = sent.filter(r => shown.get(r.id) !== r.kind).map(r => r.id)
    const ended = [...shown].filter(([id, kind]) => now.get(id) !== kind).map(([id]) => id)
    shown = now
    fan({ scene: v.scene, seat: v.seat, packet: { n: v.truth!.n, ack: v.ack, rows: sent, born, ended } })
  }
  const want = (v: Visit, now: number) => {
    if (now - v.asked <= ASK) return
    v.asked = now
    wire.send({ scene: v.scene, seat: v.seat, want: true })
  }

  const begin = (d: Down): Visit => {
    const v: Visit = {
      scene: d.scene, seat: d.seat, read: false, passing: false, epsilon: 0, cutoff: 0, jumped: false, offsets: new Map(), asked: -Infinity, asking: false,
      kept: [], ack: 0, stamps: new Map(), queued: [], entries: new Map(), applied: 0, history: new Map(),
      arrived: [], upto: -Infinity, pressed: [], since: [], newest: d.packet.n, owed: 0, last: 0, stats: nothing(), clocks: [],
    }
    const e = table[d.scene]
    if (!e) { v.read = true; v.passing = true; return v }
    void (async () => {
      const { scene, sim } = await child(file, d.scene, e, base)
      const ahead = predicts(scene.world)
      if (!ahead) {
        v.read = true
        v.passing = true
        for (const msg of v.queued.splice(0)) wire.send({ scene: v.scene, seat: v.seat, msg })
        return
      }
      v.epsilon = ahead.epsilon
      v.cutoff = ahead.cutoff
      v.ease = { halflife: ahead.halflife, snap: ahead.snap, below: ahead.below }
      await prepare(sim, d.packet.rows, scene.world ?? {})
      v.ready = { scene, sim }
      v.read = true
    })().catch(err => { failed = err })
    return v
  }

  wire.hear(d => {
    if (!visit || visit.scene !== d.scene || visit.seat !== d.seat) visit = begin(d)
    const v = visit
    if (d.snap && d.log && (!v.snap || d.packet.n > v.snap.at)) v.snap = { snap: d.snap, held: d.held ?? {}, log: d.log.entries, end: d.log.end, at: d.packet.n }
    // A snapshot's journal too: the server sends the journal on from its end after it, so a copy that
    // plays on without loading it takes the entries before that end from it.
    for (const e of d.log?.entries ?? []) if (e.i >= v.applied) v.entries.set(e.i, e)
    // The server's step as the last packet heard has it, which goes back when the server does.
    v.newest = d.packet.n
    // The server's clock, which never goes back, read off the packet less the page's own clock: the
    // packet that came quickest reads it highest, and a slower one moves it down only a little.
    if (d.log) {
      const read = d.log.clock - performance.now() / 1000 / wall
      v.base = v.base === undefined || read > v.base ? read : v.base + (read - v.base) * SETTLE
      v.clocks.push({ end: d.log.end, clock: d.log.clock })
    }
    // The server's clock is heard once every journal entry written by then is in hand: a packet that
    // passed an earlier one on the way, or came after a snapshot the copy did not load, carries the
    // journal from further on than the page has, and tells of its clock only when the entries between
    // come (The journal).
    let have = v.applied
    while (v.entries.has(have)) have++
    v.clocks = v.clocks.filter(c => {
      if (c.end > have) return true
      v.heard = Math.max(v.heard ?? -Infinity, c.clock)
      return false
    })
    if (!v.truth) return pass(d)
    v.arrived.push({ packet: d.packet, end: d.log?.end ?? Infinity })
  })

  // A message the client sent, stamped with the step the copy is about to run, answered there, and kept
  // until an ack covers it.
  const press = (v: Visit, m: Msg) => {
    const msg: Msg = { ...m, n: v.truth!.n }
    v.kept.push(msg)
    v.pressed.push(msg)
    v.stamps.set(msg.seq, msg.n)
    v.truth!.inbox(v.seat, structuredClone(msg))
  }
  // The copy's next step, through its rewind, which first puts back every journal entry handed it
  // late; the rows the seat's packet of each step it runs has, run again or not, are kept.
  const step = (v: Visit) => {
    for (const m of v.kept) if (m.n <= v.truth!.n) v.ack = Math.max(v.ack, m.seq)
    v.rewind!.step(dt)
  }
  // The newest snapshot loaded into the copy, the truth as it stood before the oldest step the server
  // keeps. Every journal entry the server sent with it that the snapshot does not hold is put in the
  // copy's inbox for its step, each seat's and this page's own; every message this page sent that
  // the journal has not yet taken goes in on its stamp, where the server will put it. The journal is
  // taken on from where it stood, and the steps are run to `to`. Booted first when the copy is not
  // made yet.
  const load = (v: Visit, to: number) => {
    const { snap: s, held: memory, log, end } = v.snap!
    v.snap = undefined
    v.asking = false
    if (!v.truth) {
      const t = boot(v.ready!.scene, v.ready!.sim)
      door(t)
      v.truth = t
      // The copy catches up within the frame after it goes back, so the player never sees the world
      // run backwards: only what the late press moved jumps, and that is smoothed.
      // The copy keeps every step the server may still put a late press on, as its clock was last
      // heard (The journal), and never fewer than `cutoff` behind its own.
      v.rewind = rewind(t, v.cutoff, {
        cap: false, fast: true, stepped: () => v.history.set(t.n, seen(v)),
        horizon: () => Math.min(v.rewind!.clock, v.heard ?? v.rewind!.clock) - v.cutoff,
      })
      // The copy went back: the packets of the steps it now passes again are held against it again.
      onRewind(t, () => { v.upto = Math.min(v.upto, t.n - 1); v.jumped = true })
    }
    const t = v.truth
    v.rewind!.drop()
    restore(t, s, memory)
    v.stats.loads.push(s.n)
    v.jumped = true
    mirror(t, s.seats)
    v.ack = Math.max(v.ack, s.seats[v.seat]?.ack ?? 0)
    // A seat that came or went after the snapshot's step, this page's own among them, comes or goes
    // on its step as the copy runs to it.
    const holds = new Set(s.seats.flatMap((seat, i) => seat.inbox.map(m => JSON.stringify([i, m]))))
    // A message of a seat the snapshot does not hold yet, which comes on a later step, waits for its
    // own step, where that seat has come.
    const put = (who: number, msg: Msg) => {
      if (who < t.seats) t.inbox(who, structuredClone(msg))
      else v.rewind!.schedule(msg.n, null, () => t.inbox(who, structuredClone(msg)))
    }
    for (const e of [...log].sort((a, b) => a.i - b.i)) {
      if (!('msg' in e)) {
        if (e.at > s.n) v.rewind!.schedule(e.at, e.op, () => seat(t, e.op as SeatOp))
        continue
      }
      if (e.seat === v.seat) v.stamps.delete(e.msg.seq)
      if (e.msg.n < s.n || holds.has(JSON.stringify([e.seat, e.msg]))) continue
      put(e.seat, e.msg)
    }
    // A message stamped before the snapshot's step and not in the journal is past what the server
    // keeps: it will be answered where it arrives, and its entry, when it comes, is taken into the
    // copy there as another seat's is.
    for (const m of v.kept) {
      if (!v.stamps.has(m.seq)) continue
      if (m.n >= s.n) put(v.seat, m)
      else v.stamps.delete(m.seq)
    }
    v.applied = end
    v.since = log.map(e => ({ i: e.i, n: when(e) }))
    for (const i of [...v.entries.keys()]) if (i < end) v.entries.delete(i)
    v.history.clear()
    v.history.set(t.n, seen(v))
    v.arrived = v.arrived.filter(a => a.packet.n > t.n)
    v.upto = t.n
    // The steps run to `to` are the snapshot catching up, not the page's time passing.
    const clock = v.rewind!.clock
    while (t.n < to) step(v)
    v.rewind!.clock = Math.max(clock, t.n)
  }

  // Every journal entry heard, in order from the first not taken, put into the copy: a seat that came
  // or went, before the step it did; another seat's message, or one the server made for this seat,
  // on the step the server answered it; this page's own is in the copy already, and one the server
  // answered elsewhere than its stamp has the page ask for the whole truth.
  const journal = (v: Visit) => {
    const t = v.truth!
    for (;;) {
      const e = v.entries.get(v.applied)
      if (!e) break
      v.entries.delete(v.applied)
      v.applied++
      v.since.push({ i: e.i, n: when(e) })
      if (!('msg' in e)) {
        v.rewind!.schedule(e.at, e.op, () => seat(t, e.op as SeatOp))
        continue
      }
      const stamp = e.seat === v.seat ? v.stamps.get(e.msg.seq) : undefined
      if (stamp !== undefined) {
        v.stamps.delete(e.msg.seq)
        // Answered on another step than its stamp: the copy moves it there as the server did, and
        // asks for the whole truth only when it no longer keeps the step it took it on.
        if (stamp !== e.msg.n && !v.rewind!.move(e.seat, stamp, e.msg)) v.asking = true
        continue
      }
      v.rewind!.take(e.seat, e.msg)
      v.stats.taken++
    }
  }

  // A packet held against the copy's rows at its step, once the copy has run it: whether it differs.
  const check = (v: Visit, p: Packet, end: number) => {
    v.upto = p.n
    const mine = v.history.get(p.n)
    for (const n of [...v.history.keys()]) if (n < p.n) v.history.delete(n)
    const early = v.pressed.some(m => m.n < p.n && m.seq > p.ack) || v.since.some(e => e.i >= end && e.n < p.n)
    // Kept for every packet still to be held, whatever order they come in: a packet sent later can be of
    // an earlier step, the server having gone back, and carry a later ack and journal end. One the server
    // took after making a packet is stamped no more than `cutoff` steps before that packet's step, and a
    // packet held is of a step past `upto`, so one stamped further back than that is no one's news.
    v.pressed = v.pressed.filter(m => m.n > v.upto - v.cutoff)
    v.since = v.since.filter(e => e.n > v.upto - v.cutoff)
    // Made before the server took a message stamped before its step, this page's or another seat's:
    // no news.
    if (!mine || early) return
    v.stats.checked++
    if (sameRows(mine, p.rows)) return
    // A drift is left alone: the copy plays on, and nothing is loaded.
    if (nearRows(mine, p.rows, v.epsilon)) {
      v.stats.drifts++
      const rows = differing(mine, p.rows)
      v.stats.drifted = { n: p.n, by: Math.max(...rows.map(r => apart(r.mine, r.theirs))), rows }
      return
    }
    v.stats.corrections++
    v.stats.differed = { n: p.n, rows: differing(mine, p.rows) }
    v.stats.first ??= v.stats.differed
    v.asking = true
  }

  const page = view({
    hear(fn) { if (!hearers.length) held.splice(0).forEach(fn); hearers.push(fn) },
    send(up: Up) {
      const v = visit
      if (!('msg' in up) || !v || v.passing || up.scene !== v.scene || up.seat !== v.seat) return wire.send(up)
      // Until the copy runs, a message waits here: sent up as it is, the server could answer it on a
      // step the snapshot the copy starts from had already passed, and the copy never would.
      if (!v.truth) { v.queued.push(up.msg); return }
      press(v, up.msg)
    },
    close: () => wire.close(),
    store: wire.store,
  }, file, base, mount)

  return {
    get client(): Client | undefined { return page.client },
    get name() { return page.name },
    get stats(): Stats { return visit?.stats ?? nothing() },
    input() { page.input() },
    async frame(now: number) {
      if (failed) throw failed
      const v = visit
      if (!v || v.passing || !v.ready) return page.frame()
      if (!v.truth) {
        if (!v.snap) {
          want(v, now)
          return page.frame()
        }
        // The copy starts where the server's clock stands as heard, not where its truth stood.
        load(v, Math.max(v.snap.at, v.base === undefined ? 0 : Math.floor(v.base + now / 1000 / wall)))
        for (const msg of v.queued.splice(0)) press(v, msg)
        v.last = now
        v.owed = wall / 2
        v.stats.predicting = true
        emit(v, seen(v))
      }
      const t = v.truth!

      // The acks heard since the last frame let go of the messages they cover.
      for (const a of v.arrived) v.kept = v.kept.filter(m => m.seq > a.packet.ack)
      // A snapshot asked for after a packet differed, or after the copy fell behind.
      if (v.asking && v.snap) load(v, Math.max(t.n, v.snap.at))
      journal(v)

      // This frame's steps, each handed to the view, the first putting back every late journal entry.
      // Then every packet of a step the copy has run held against it, oldest first, once the copy has
      // taken the journal it carried, which a frame that ran no step leaves for the next; one older
      // than a packet already held is no news.
      // The copy's clock held to the server's (The clock): off it, it runs up to `SKEW` faster or
      // slower than real time until it stands there again.
      const off = v.base === undefined ? 0 : t.n - (v.base + now / 1000 / wall)
      const rate = 1 - Math.max(-SKEW, Math.min(SKEW, off * 0.02))
      v.owed += Math.min((now - v.last) / 1000, 0.25) * rate
      v.last = now
      while (v.owed >= wall) {
        v.owed -= wall
        step(v)
        emit(v, v.history.get(t.n)!)
      }
      v.arrived.sort((a, b) => a.packet.n - b.packet.n)
      while (v.arrived.length && v.arrived[0].packet.n <= t.n && v.arrived[0].end <= v.applied && !v.rewind!.waiting) {
        const { packet, end } = v.arrived.shift()!
        if (packet.n > v.upto) check(v, packet, end)
      }
      if (v.newest - t.n > v.cutoff) v.asking = true

      if (v.asking) want(v, now)
      for (const msg of v.kept) wire.send({ scene: v.scene, seat: v.seat, msg: structuredClone(msg) })
      v.stats.behind = v.newest - t.n
      v.stats.back = v.rewind!.back
      v.stats.missed = v.rewind!.missed
      await page.frame(v.owed / wall)
    },
    close() { page.close() },
  }
}
