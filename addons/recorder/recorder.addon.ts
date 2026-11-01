// A game's manager truth under a clock someone else holds: the editor's. It boots the manager,
// loads its scenes and opens one seat, as a page does, and journals everything that reaches the
// truths from outside: every envelope the seat sends, and every edit made to a live row. Any step
// is rebuilt by booting again from the scene files and replaying the journal up to it, which is how
// time goes back: the die's counter and the next row id are inside the truth, where nothing
// outside can read or set them, and replaying the same inputs reproduces them exactly.
//
// Each journal entry happens `at` a step: the manager's step counter when it was made, after the
// step before it and before that step. An envelope sent at step k is in the truth's inbox when
// step k runs, as a page's is; an edit made at step k is on the row when step k runs. Arriving at
// step k, by stepping or by seeking, applies every entry at k in the order they were made, so a
// paused truth shows the edits made at it.
//
// The recording ends at `end`. Stepping below it plays the recording back. The seat sending an
// envelope below it takes over: every entry after the current step is dropped, and the recording
// goes on live from there. `splice` swaps the recording after a step for another and hands back the
// one it took out, so an end set by hand is taken back by splicing that back in. An edit below it is
// kept with the rest of the recording, so the steps
// after it replay with it.
//
// `link` is the seat the page's `view` holds, the same one for the recorder's whole life. Every
// truth the recorder boots gets a new connection behind it, and a view keeps its client across
// them: the link works out each packet's `born` and `ended` itself, against the rows it last
// handed the view, so a row the client already draws is not set up twice and a row the new truth
// does not have is removed. A row whose id now names another kind is removed and born again. A
// rebuild hands the view one packet, of the step it stops at; at step 0 no step has sent the seat
// one, and the view is handed nothing, as a page is.
//
// A step that throws leaves its truth half stepped. The recorder keeps the error as `failure`,
// rebuilds the step before it, and stays there. An entry a rebuild cannot apply, because an
// authored edit left out the row it names, or an envelope names a visit the seat is not on, is
// skipped and kept in `skipped`.
//
// Closing the link lets the recorder go. Its seat leaves every truth, and no truth is stepped again:
// not by the seat's leaving, which steps a `suspend: true` scene it was the last one in, so a truth
// whose next step throws is closed as cleanly as any other.
import { boot, type Row, type Scene, type Sim, type Truth } from '#engine/engine.ts'
import { accept, link, load, manager, scene, scenes, type Down, type Link, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'

export type Path = (string | number)[]
export type Edit =
  | { set: { scene: string; id: number; path: Path; value: unknown } }
  | { spawn: { scene: string; kind: string; data: Record<string, unknown> } }
  | { end: { scene: string; id: number } }
export type Entry = { at: number } & ({ up: Up } | Edit)
// The recording after a step: the entries after it, and the step it ends at.
export type Tail = { end: number; entries: Entry[] }
export type Failure = { at: number; message: string; stack?: string }
export type Recorder = Awaited<ReturnType<typeof recorder>>

// Writes `value` at `path` inside `into`.
export function put(into: any, path: Path, value: unknown) {
  if (!path.length) throw new Error('an edit names no field')
  let at = into
  for (const key of path.slice(0, -1)) {
    if (at[key] === null || typeof at[key] !== 'object') throw new Error(`no field ${path.join('.')}`)
    at = at[key]
  }
  at[path[path.length - 1]] = value
}

// `file` and `sim` are the manager scene and its sim, `base` the url its scene files are relative
// to. `journal` and `end` are a recording to start from; the recorder starts at its step 0.
export async function recorder(file: Scene, sim: Sim, base: string, from: Entry[] = [], end = 0) {
  const dt = file.prefabs.engine?.dt
  if (typeof dt !== 'number') throw new Error('the manager scene has no engine prefab with a dt')

  const journal: Entry[] = [...from]
  const byAt = new Map<number, Entry[]>()
  const index = () => {
    byAt.clear()
    for (const e of journal) byAt.set(e.at, [...(byAt.get(e.at) ?? []), e])
  }
  const record = (e: Entry) => {
    journal.push(e)
    byAt.set(e.at, [...(byAt.get(e.at) ?? []), e])
  }
  index()

  let truth!: Truth
  let inner!: Link
  let n = 0
  let replaying = false
  let failure: Failure | undefined
  const skipped: Entry[] = []
  const listeners = new Set<() => void>()
  const changed = () => { for (const f of listeners) f() }

  // The seat the view holds.
  let hearer: ((down: Down) => void) | undefined
  let latest: Down | undefined
  let visit: { scene: string; seat: number } | undefined
  let shown = new Map<number, string>()
  const hand = (down: Down) => {
    if (!hearer) return
    if (!visit || visit.scene !== down.scene || visit.seat !== down.seat) shown = new Map()
    visit = { scene: down.scene, seat: down.seat }
    const now = new Map(down.packet.rows.map(r => [r.id, r.kind]))
    const born = down.packet.rows.filter(r => shown.get(r.id) !== r.kind).map(r => r.id)
    const ended = [...shown].filter(([id, kind]) => now.get(id) !== kind).map(([id]) => id)
    shown = now
    hearer({ ...down, packet: { ...down.packet, born, ended } })
  }
  const heard = (down: Down) => {
    latest = down
    if (!replaying) hand(down)
  }

  const child = (name: string) => scene(manager(truth), name)
  const row = (name: string, id: number): Row | undefined => child(name).rows.find(r => r.id === id)

  const apply = (e: Entry) => {
    try {
      if ('up' in e) {
        // The seat is on the visit its last packet was of, and the manager drops an envelope of any
        // other: one sent before the page heard the seat had moved, or one an edit has since moved
        // the seat away from.
        if (!latest || latest.scene !== e.up.scene || latest.seat !== e.up.seat) throw new Error('the seat is not on that visit')
        inner.send(e.up)
      } else if ('spawn' in e) child(e.spawn.scene).spawn(e.spawn.kind, structuredClone(e.spawn.data))
      else {
        const target = 'set' in e ? row(e.set.scene, e.set.id) : row(e.end.scene, e.end.id)
        if (!target) throw new Error('no such row')
        if ('set' in e) put(target.data, e.set.path, structuredClone(e.set.value))
        else child(e.end.scene).end(target)
      }
    } catch {
      skipped.push(e)
    }
  }
  const arrive = () => { for (const e of byAt.get(n) ?? []) apply(e) }

  // A packet of the seat's scene as it is now, for an edit made between steps.
  const refresh = () => { if (visit) hand({ ...visit, packet: child(visit.scene).packet(visit.seat) }) }

  const fail = (e: unknown, at: number) => {
    const err = e instanceof Error ? e : new Error(String(e))
    failure = { at, message: err.message, stack: err.stack }
  }

  // Boots a fresh truth and replays the journal up to step `k`, or up to the step before the first
  // one that throws.
  async function rebuild(k: number): Promise<void> {
    const t = boot(file, sim)
    await load(t, base)
    const l = link(loopback(accept(manager(t))))
    replaying = true
    latest = undefined
    skipped.length = 0
    truth = t
    inner = l
    n = 0
    l.hear(heard)
    arrive()
    try {
      while (n < k) {
        t.step(dt)
        n++
        arrive()
      }
    } catch (e) {
      replaying = false
      fail(e, n)
      return rebuild(n)
    }
    replaying = false
    if (latest) hand(latest)
  }

  await rebuild(0)

  const me = {
    link: {
      hear(fn: (down: Down) => void) {
        hearer = fn
        shown = new Map()
        visit = undefined
        if (latest) hand(latest)
      },
      send(up: Up) {
        if (n < end) me.cut()
        inner.send(up)
        record({ at: n, up })
      },
      // The recorder is let go: its truths are held still first, so the seat's leaving, which steps a
      // `suspend: true` scene it was the last one in, steps nothing, and a truth whose next step
      // throws is not stepped into it.
      close() {
        const still = { show: () => true, hide: () => [], accept: () => true, advance: () => false, spawn: () => {} }
        for (const t of [truth, ...scenes(manager(truth)).values()]) t.attach(still)
        inner.close()
      },
      store: {},
    } satisfies Link,
    get truth() { return truth },
    get n() { return n },
    get end() { return end },
    get dt() { return dt },
    get journal(): readonly Entry[] { return journal },
    // The last step that threw, until the next step or seek.
    get failure() { return failure },
    get skipped(): readonly Entry[] { return skipped },
    // Called after every step, seek and edit. Returns the call that stops it.
    on(f: () => void) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    // One step. A step that throws is rebuilt from the step before it, which the promise it
    // returns then is.
    step(): Promise<void> | undefined {
      const at = n
      failure = undefined
      try {
        truth.step(dt)
        n++
        arrive()
      } catch (e) {
        fail(e, at)
        const why = failure
        return rebuild(at).then(() => { failure = why; changed() })
      }
      if (n > end) end = n
      changed()
    },
    async seek(k: number) {
      failure = undefined
      await rebuild(Math.max(0, Math.min(k, end)))
      changed()
    },
    // The same step, rebuilt from the scene files as they are now.
    rerun() { return me.seek(n) },
    // Step 0 of an empty recording.
    restart() {
      journal.length = 0
      index()
      end = 0
      return me.seek(0)
    },
    // The recording ends here: every entry after this step is dropped.
    cut() {
      for (let i = journal.length - 1; i >= 0; i--) if (journal[i].at > n) journal.splice(i, 1)
      index()
      end = n
    },
    // The recording after step `at` made `tail`: every entry after it dropped, `tail`'s put in their
    // place, and the recording ending where `tail` says. Returns the tail it replaced, which the same
    // call puts back, the entries themselves, so an edit among them is still the one `unedit` takes.
    // A truth past `at` is rebuilt from the recording as it now is.
    async splice(at: number, tail: Tail): Promise<Tail> {
      const was: Tail = { end, entries: journal.filter(e => e.at > at) }
      for (let i = journal.length - 1; i >= 0; i--) if (journal[i].at > at) journal.splice(i, 1)
      journal.push(...tail.entries)
      index()
      end = tail.end
      if (n > at) await rebuild(Math.min(n, end))
      changed()
      return was
    },
    // An edit to a live row, from this step on. Returns the entry, which `unedit` takes back.
    edit(e: Edit): Entry {
      const entry = { ...e, at: n } as Entry
      skipped.length = 0
      apply(entry)
      if (skipped.includes(entry)) throw new Error(`the edit could not be made: ${JSON.stringify(e)}`)
      record(entry)
      refresh()
      changed()
      return entry
    },
    // Takes an edit back out of the journal and rebuilds this step without it.
    unedit(e: Entry) {
      const i = journal.indexOf(e)
      if (i < 0) throw new Error('that edit is not in the journal')
      journal.splice(i, 1)
      index()
      return me.rerun()
    },
    // Puts an edit `unedit` took out back where it was, and rebuilds this step with it.
    redo(e: Entry) {
      record(e)
      return me.rerun()
    },
    // The rows of the seat's scene sent to the view again, as they are now.
    refresh,
  }
  return me
}
