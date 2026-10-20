// A truth that puts a late press on the step it was made on. A page that runs a scene ahead of its
// server (`addons/predict`) answers its own press on its own copy at once, on the step its copy is
// about to run, and stamps the message with that step. The press crosses the wire and reaches the
// server after the server has run that step: a page's copy runs behind the server's clock by the
// down leg, so every press of it is a round trip late. The server never waits for a page: it runs on
// its own clock (`run` in `addons/scenemanager`), and a press that arrives late is put back where it
// was made. The server keeps its truth as it stood before each of its last `cutoff` steps; a press
// stamped for a step it has already run makes it load the truth as it stood before that step and take
// the press there, and nothing more: no step is run again in that tick. The truth plays on from there,
// one step for each step of the clock, so it stands as many steps behind where it was as the press
// was late, and as it passes each step it had run before it takes again every message it took there
// and every seat that came or went there. The server is never fast-forwarded. A page that runs the
// scene ahead goes back the same way when the journal (below) tells it of the press, and then runs
// every step again up to where it stood within the same frame (`fast`, below), so its player never
// sees the world stand behind; what the press moved is eased there (`addons/predict`, Easing a jump).
// Latency is never punished: the page that pressed sees its press where it made it. A press stamped
// further back than `cutoff` steps is answered on the step the server is about to run, and the page
// that sent it, told by the journal, moves it there in its copy (`move`). So `cutoff` is the furthest
// the scene ever goes back, and the furthest the server's truth ever stands behind its clock.
//
// Which scenes. A child scene whose `world.predict` is `{ "epsilon": e, "cutoff": c, "halflife": h,
// "snap": s, "below": b }` is run by `rewind` (`load` in `addons/scenemanager`), and its
// pages run it ahead. `epsilon`, `halflife`, `snap` and `below` are the page's (`addons/predict`, `Predict` below);
// `cutoff` is how many steps back the server goes, a whole number of 1 or more.
// A scene with no `world.predict` is not run ahead: the server answers every message on the first
// step after it arrives and keeps nothing, and its pages draw the server's packets. A
// `world.predict` of another shape throws, naming it.
//
// When a step happened. Every message a page sends is stamped `n`, the step it was answered on in
// the page's copy. The server knows when it arrived: the step it was about to run then, its own
// clock. A stamp that step or later is on time, and the truth holds the message for its step (the
// engine answers a message on the first step at or after its stamp). A stamp more than `cutoff`
// steps later than the server's clock is a step no page's copy has run yet, and is answered on the
// server's next step. A stamp before the server's clock is late: put back on its step when the
// server still keeps the truth as it stood before that step, answered on the next step when not.
// So a page can move its own press no further from the step the server's clock had when it arrived
// than `cutoff` steps back, and never forward past what it could have run.
//
// What is kept. Before each step the truth is saved (`save` in `engine/engine.ts`), with what each
// row's kind holds beside the rows (`Memory`, a physics world among it). Every message that reached
// the truth between two steps, from a page, the playtester, a scene's entry act or an arrival, is
// kept with the step it reached it before, and so is every change made through `change`, a seat
// joining or leaving (`seat` in `addons/scenemanager`): the steps passed again take each on the step
// it was. A truth changed between two steps any other way, a scene's rule run from outside a step, a
// persist load landing, cannot have the steps before that change passed again without it, so the
// saves before it are let go: a late press never reaches back past it.
//
// The journal. Every message, as the truth answers it, stamped with the step it is answered on, and
// every change, with the step it was made before, is written down in order (`Written`), and kept for
// twice `cutoff` steps. The server sends it to every page of the scene (`Log` in the scenemanager
// addon), and each page puts every entry into its copy the same way: `take` for a message, `schedule`
// for a change, each held for its step when the copy has not run it yet and gone back to when it
// has.
//
// From going back until it stands again where it stood, `rewinding(truth)` is true: whatever runs on
// a truth's steps from outside, the playtester thinking, persist writing, `heard` writing down what
// the steps answered, does nothing it already did. `onRestore(truth, f)` calls `f` with the save each
// time the truth is put back to one, before it runs a step from it: the player addon takes back which
// slot each seat holds. `onRewind(truth, f)` calls `f` once the truth has gone back: the rows are new
// objects then, which anything that holds rows takes again.
import type { Msg, Row, Snapshot, Truth } from '#engine/engine.ts'

// Memory a kind keeps beside the rows from one step to the next, which a truth's snapshot does not
// carry: a physics library's world, its contacts, warm starting impulses and sleep. `hold` hands it
// out without changing it, as JSON and `Uint8Array`s (a physics world's image is the library's own
// bytes, kept as they are: `addons/socket` carries them as bytes, and a loopback as they are): as
// the server saves the truth for a page that asks for it, and
// before each step a server that rewinds keeps. `take` is handed it on a truth loaded from that save,
// before the truth's next step, so the truth steps on exactly as the one it was saved from did; `was`
// is the row of the same id the truth held before the load, when it had one, whose memory the kind
// may reuse.
export type Memory = { hold?(me: Row): unknown; take?(me: Row, held: unknown, was?: Row): void }

// `halflife`, `snap` and `below` are how a page smooths the jump its copy makes when it goes back or
// loads the server's truth (`addons/predict`, Easing a jump): milliseconds an offset takes to halve,
// and distances in the units of the rows' numbers.
export type Predict = { epsilon: number; cutoff: number; halflife: number; snap: number; below: number }

const plain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const at = (v: unknown, least: number) => typeof v === 'number' && Number.isFinite(v) && v >= least

// `world.predict`, read off the scene file, which comes from outside the program: undefined when the
// scene is not run ahead.
export function predicts(world: Record<string, any> | undefined): Predict | undefined {
  const b = world?.predict
  if (b === undefined) return undefined
  const keys = ['epsilon', 'cutoff', 'halflife', 'snap', 'below']
  const ok = plain(b) && Object.keys(b).length === keys.length && keys.every(k => k in b)
    && at(b.epsilon, 0) && Number.isSafeInteger(b.cutoff) && (b.cutoff as number) >= 1
    && at(b.halflife, Number.MIN_VALUE) && at(b.snap, 0) && at(b.below, Number.MIN_VALUE)
  if (!ok) throw new Error(`world.predict is ${JSON.stringify(b)}: { "epsilon": <a distance of 0 or more>, "cutoff": <whole steps, 1 or more>, "halflife": <milliseconds above 0>, "snap": <a distance of 0 or more>, "below": <a distance above 0> } runs the scene ahead, and a scene that does not leaves it out`)
  const n = b as Record<keyof Predict, number>
  return { epsilon: n.epsilon, cutoff: n.cutoff, halflife: n.halflife, snap: n.snap, below: n.below }
}

// What each row's kind holds beside the rows, by row id.
export function held(truth: Truth): Record<number, unknown> {
  const out: Record<number, unknown> = {}
  for (const r of truth.rows) {
    const memory = (truth.sim[r.kind] as Memory | undefined)?.hold?.(r)
    if (memory !== undefined) out[r.id] = memory
  }
  return out
}

const restored = new WeakMap<Truth, ((s: Snapshot) => void)[]>()
export function onRestore(truth: Truth, f: (s: Snapshot) => void) {
  const list = restored.get(truth) ?? []
  list.push(f)
  restored.set(truth, list)
}

// A truth put back to a save, each row's kind handed what it held beside it then, with the row it
// had before the load of the same id, and whatever keeps state of the truth's seats told.
export function restore(truth: Truth, s: Snapshot, memory: Record<number, unknown>) {
  const was = new Map(truth.rows.map(r => [r.id, r]))
  truth.load(s)
  for (const r of truth.rows) if (r.id in memory) (truth.sim[r.kind] as Memory | undefined)?.take?.(r, memory[r.id], was.get(r.id))
  for (const f of restored.get(truth) ?? []) f(s)
}

const replaying = new WeakSet<Truth>()
export const rewinding = (truth: Truth) => replaying.has(truth)
// The oldest step a rewind of the truth may still run again: the step it is about to run when
// nothing rewinds it.
const oldest = new WeakMap<Truth, () => number>()
export const reach = (truth: Truth) => oldest.get(truth)?.() ?? truth.n
const rewound = new WeakMap<Truth, (() => void)[]>()
export function onRewind(truth: Truth, f: () => void) {
  const list = rewound.get(truth) ?? []
  list.push(f)
  rewound.set(truth, list)
}

type Arrival = { seat: number; msg: Msg }
// A change made to the truth between two steps, as data the journal carries and as the function that
// makes it.
type Change = { op: unknown; f: () => unknown }
// The truth as it stood before step `n`: the save, what each kind held, the messages that reached it
// since the step before and the changes made to it since, each already in the save.
type Kept = { snap: Snapshot; memory: Record<number, unknown>; arrivals: Arrival[]; changes: Change[] }
// One entry of the journal, at its place `i`: a message, with the seat that sent it, as the truth
// answers it, stamped with the step it is answered on; or a change, `op`, made before step `at`. `at`
// is the step the truth was about to run when the entry was written down.
export type Written = { i: number; at: number } & ({ seat: number; msg: Msg } | { op: unknown })

// A save split into each seat's inbox and everything else but the rows each seat's last packet
// showed, which a packet made between two steps changes and no step reads.
const split = (s: Snapshot) => ({
  body: JSON.stringify({ ...s, seats: s.seats.map(({ inbox: _, shown: __, ...seat }) => seat) }),
  inbox: s.seats.map(seat => seat.inbox.map(m => JSON.stringify(m))),
})

export type Rewind = {
  // A message as it arrived: held for its step, or put back on it.
  take(seat: number, msg: Msg): void
  // A change made now, between two steps, which the steps run again make again on the step it was
  // made before; what `f` hands back.
  change<T>(op: unknown, f: () => T): T
  // A change made before step `at`, which the truth may not have reached or may have passed: made
  // before that step when the truth reaches it, or put back there.
  schedule(at: number, op: unknown, f: () => unknown): void
  // A message of `seat`'s the truth took on step `from`, which the server answered on `msg.n` instead:
  // taken out of `from` and every step after it, and taken on `msg.n`, the truth going back to `from`
  // on its next step. False, and nothing done, when the truth no longer keeps step `from`.
  move(seat: number, from: number, msg: Msg): boolean
  // One step of the truth, every late message and change put back first.
  step(dt: number): void
  // How many steps the truth went back, in all; and how many late messages and changes were later
  // than the truth keeps steps, and were taken on the next step instead.
  readonly back: number
  readonly missed: number
  // The journal's entries from `from` on, and the place the next entry will take; `base`, the first
  // entry it still holds.
  journal(from: number): Written[]
  readonly end: number
  readonly base: number
  // How many late messages and changes wait for the next step to put them back; and every one of
  // them let go, for a truth loaded from a save that some of them may already be in.
  readonly waiting: number
  drop(): void
  // Real time in steps, which a page's copy sets back after running a snapshot up to where it stands.
  clock: number
  // The truth as it stood before the oldest step kept, with what each kind held then: what a page
  // that runs the scene ahead starts from, so every late message the server may yet put back lands
  // on a step the page's copy holds too. The truth as it stands now before the first step.
  earliest(): { snap: Snapshot; memory: Record<number, unknown> }
}

// `cap` refuses a stamp more than `cutoff` steps past the truth's clock, as a server must of a page;
// a page's copy, handed the server's own stamps, takes every one as it is. `stepped` is called after
// every step the truth runs. `horizon` is the oldest step a late message or change may still be put
// back on, and every save before it is let go: `cutoff` steps before the truth's clock when it is not
// given, as a server keeps. A page's copy hears of the server's late presses a down leg after the
// server took them, and keeps every step the server may still have put one on as it last heard the
// server's clock (`addons/predict`, The journal).
// `fast` has the truth, once it has gone back, run every step again up to where it stood within the
// same step it is given, so it never stands behind where it was: a page's copy, which the player
// watches, does this, so the world is never seen going back; a server, which nobody watches and which
// must spend no more than a step's time on a step, does not.
export function rewind(truth: Truth, cutoff: number, { cap = true, fast = false, stepped, horizon }: { cap?: boolean; fast?: boolean; stepped?: () => void; horizon?: () => number } = {}): Rewind {
  const ring = new Map<number, Kept>()
  const written: Written[] = []
  let next = 0
  const write = (e: { seat: number; msg: Msg } | { op: unknown }) => {
    written.push({ i: next++, at: truth.n, ...structuredClone(e) } as Written)
  }
  // The truth after the last step, as `split` has it, its inboxes those the step left of the
  // messages it held before it, and what each kind held then. A message in an inbox now that is not
  // one of those reached the truth since: from a page, or from whatever runs on the truth's steps,
  // the playtester pressing as the step ends.
  let after: ReturnType<typeof split> | undefined
  let memory: Record<number, unknown> | undefined
  // The changes made since the last step; the truth as the last of them left it; and whether the
  // truth was changed some other way between them.
  let gap: Change[] = []
  let made: string | undefined
  let dirty = false
  // Changes scheduled for a step not reached yet, and late messages and changes waiting for the next
  // step to put them back.
  const future = new Map<number, Change[]>()
  const late: Arrival[] = []
  const lateChanges: { at: number; change: Change }[] = []
  // Messages moved off the step they were taken on, waiting for the next step: each the step it was
  // taken on and where it goes.
  const moving: { from: number; seat: number; msg: Msg }[] = []
  // The step the truth stood at before it last went back, while it has not reached it again; and the
  // messages made again before this step, which are not new.
  let ahead: number | undefined
  let taken = new Set<string>()
  let went = 0
  let missed = 0
  // Real time in steps: one more for every step the truth is given, never going back.
  let clock = truth.n
  // The oldest step a late message or change may still be put back on.
  const floor = () => (horizon ? horizon() : clock - cutoff)
  oldest.set(truth, () => (ring.size ? Math.min(...ring.keys()) : truth.n))

  const change = <T>(op: unknown, f: () => T): T => {
    if (split(truth.save()).body !== (made ?? after?.body)) dirty = true
    const out = f()
    gap.push({ op, f })
    made = split(truth.save()).body
    return out
  }

  // The truth as it stands before the step it is about to run, kept, with every message and change
  // since the last step written in the journal. Anything but those that changed it since lets every
  // earlier save go.
  // A step passed again keeps what it took the first time beside what is new.
  const keep = () => {
    const snap = truth.save()
    const now = split(snap)
    const was = after?.inbox ?? []
    const arrivals = now.inbox.flatMap((list, seat) => list.filter(j => !(was[seat] ?? []).includes(j) && !taken.has(j)).map(j => ({ seat, msg: JSON.parse(j) as Msg })))
    const changes = gap
    for (const c of changes) write({ op: c.op })
    for (const a of arrivals) write(a)
    if (!after || dirty || now.body !== (made ?? after.body)) ring.clear()
    const before = ahead !== undefined ? ring.get(truth.n) : undefined
    gap = []
    made = undefined
    dirty = false
    taken = new Set()
    ring.set(truth.n, {
      snap,
      memory: !memory || changes.length ? held(truth) : memory,
      arrivals: [...before?.arrivals ?? [], ...arrivals],
      changes: [...before?.changes ?? [], ...changes],
    })
  }

  // The truth put back to before step `from`, each late message and change put on its step, and
  // nothing run again: the truth plays on from there, a step for each step of its clock, and as it
  // passes each step it had run before it takes every message and change that step took the first
  // time (`again`), until it stands where it stood. The rows each seat's last packet showed are kept
  // as they are now.
  const back_ = (from: number, back: Arrival[], changes: { at: number; change: Change }[], moved: { seat: number; msg: Msg }[] = []) => {
    // A moved message is taken out of every save from `from` on, in the inbox each holds and among
    // the arrivals each step passed again takes.
    for (const m of moved) {
      const it = (seat: number, msg: Msg) => seat === m.seat && msg.seq === m.msg.seq
      for (const [at, kept] of ring) {
        if (at < from) continue
        kept.arrivals = kept.arrivals.filter(a => !it(a.seat, a.msg))
        kept.snap = { ...kept.snap, seats: kept.snap.seats.map((s, i) => ({ ...s, inbox: s.inbox.filter(msg => !it(i, msg)) })) }
      }
    }
    const start = ring.get(from)!
    const saved = truth.save()
    const shown = saved.seats.map(s => s.shown)
    // What reached the truth since its last step, which the save it goes back to does not hold: made
    // again once it stands there, as reaching it then.
    const was = after?.inbox ?? []
    const pending = split(saved).inbox.flatMap((list, seat) => list.filter(j => !(was[seat] ?? []).includes(j)).map(j => ({ seat, msg: JSON.parse(j) as Msg })))
    const pendingChanges = gap
    for (const { at, change: c } of changes) if (at > from) ring.get(at)!.changes.push(c)
    went += truth.n - from
    ahead = Math.max(ahead ?? truth.n, truth.n)
    replaying.add(truth)
    restore(truth, { ...start.snap, seats: start.snap.seats.map((s, i) => ({ ...s, shown: shown[i] ?? s.shown })) }, start.memory)
    for (const { at, change: c } of changes) if (at === from) { c.f(); start.changes.push(c) }
    for (const a of back) truth.inbox(a.seat, structuredClone(a.msg))
    start.arrivals.push(...back)
    // A moved message waits in the inbox for its new step, so every save made before that step holds
    // it there.
    for (const m of moved) truth.inbox(m.seat, structuredClone(m.msg))
    // The truth as it now stands is what the step before `from` left, the late ones put on it.
    after = split(truth.save())
    memory = start.memory
    gap = []
    made = undefined
    dirty = false
    taken = new Set()
    for (const c of pendingChanges) change(c.op, c.f)
    for (const a of pending) truth.inbox(a.seat, a.msg)
    for (const f of rewound.get(truth) ?? []) f()
  }
  // One step of the truth, kept first, and what it left noted.
  const run = (dt: number) => {
    keep()
    const n = truth.n
    const waiting = split(ring.get(n)!.snap).inbox
    truth.step(dt)
    // A step a piece held back answered nothing.
    const left = truth.n === n ? waiting : waiting.map(list => list.filter(j => (JSON.parse(j) as Msg).n > n))
    after = { body: split(truth.save()).body, inbox: left }
    memory = held(truth)
    if (ahead !== undefined && truth.n >= ahead) {
      ahead = undefined
      replaying.delete(truth)
    }
    stepped?.()
  }
  // A step passed again: every change and message it took the first time made again before it, none
  // of them new to the journal.
  const again = () => {
    const kept = ring.get(truth.n)
    if (!kept) return
    for (const c of kept.changes) c.f()
    for (const a of kept.arrivals) truth.inbox(a.seat, structuredClone(a.msg))
    made = split(truth.save()).body
    taken = new Set(kept.arrivals.map(a => JSON.stringify(a.msg)))
  }

  return {
    get back() { return went },
    get missed() { return missed },
    get end() { return next },
    get base() { return written[0]?.i ?? next },
    get waiting() { return late.length + lateChanges.length + moving.length },
    get clock() { return clock },
    set clock(n) { clock = n },
    drop() {
      late.length = 0
      lateChanges.length = 0
      moving.length = 0
      future.clear()
      gap = []
      made = undefined
      dirty = true
    },
    journal: from => written.filter(e => e.i >= from),
    earliest() {
      if (!ring.size) return { snap: truth.save(), memory: held(truth) }
      const kept = ring.get(Math.min(...ring.keys()))!
      return { snap: structuredClone(kept.snap), memory: structuredClone(kept.memory) }
    },
    take(seat, msg) {
      if (cap && msg.n > clock + cutoff) truth.inbox(seat, { ...msg, n: truth.n })
      else if (msg.n >= truth.n) truth.inbox(seat, msg)
      else late.push({ seat, msg })
    },
    change,
    move(seat, from, msg) {
      // The truth goes back to the earlier of the step it took the message on and the step it goes to.
      const to = Math.min(from, msg.n)
      if (!(to < truth.n && ring.has(to))) return false
      moving.push({ from: to, seat, msg })
      return true
    },
    schedule(at, op, f) {
      if (at > truth.n) future.set(at, [...future.get(at) ?? [], { op, f }])
      else if (at === truth.n) change(op, f)
      else lateChanges.push({ at, change: { op, f } })
    },
    step(dt) {
      // The late messages and changes the truth still keeps the step of put it back to the earliest
      // of them; a step passed again takes what it took the first time.
      // `cutoff` counts back from real time: the truth never stands more than `cutoff` steps behind
      // it, and keeps no save older than that; a page's copy counts back from `horizon`. The saves
      // kept are those: a page whose packet brings a late press and a later reading of the server's
      // clock at once still holds the press's step, let go only after this step.
      const keeps = (at: number) => at < truth.n && ring.has(at)
      const back = late.filter(a => keeps(a.msg.n))
      const moved = lateChanges.filter(l => keeps(l.at))
      const tooLate = late.filter(a => !keeps(a.msg.n))
      const tooLateChanges = lateChanges.filter(l => !keeps(l.at))
      // A message moved is moved only while the truth still keeps the step it was taken on.
      const shift = moving.filter(m => keeps(m.from))
      if (shift.length < moving.length) throw new Error('rewind: a message was moved off a step the truth no longer keeps')
      late.length = 0
      lateChanges.length = 0
      moving.length = 0
      for (const a of back) write(a)
      for (const l of moved) write({ op: l.change.op })
      if (back.length || moved.length || shift.length) {
        back_(Math.min(...back.map(a => a.msg.n), ...moved.map(l => l.at), ...shift.map(m => m.from)), back, moved, shift)
        // Fast: every step it had run, run again now, so it stands where it stood.
        if (fast) {
          const to = ahead!
          run(dt)
          while (truth.n < to) { again(); run(dt) }
        }
      } else if (ahead !== undefined && truth.n < ahead) again()
      // One the truth no longer keeps the step of is taken now, as though it had arrived on time.
      for (const a of tooLate) { truth.inbox(a.seat, { ...a.msg, n: truth.n }); missed++ }
      for (const l of tooLateChanges) { change(l.change.op, l.change.f); missed++ }
      for (const c of future.get(truth.n) ?? []) change(c.op, c.f)
      future.delete(truth.n)
      run(dt)
      clock++
      const keep = floor()
      for (const k of [...ring.keys()]) if (k < keep) ring.delete(k)
      while (written.length && written[0].at < truth.n - 2 * cutoff) written.shift()
    },
  }
}
