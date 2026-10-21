// The browser side. Loads the scene's plugins from `../plugins/<name>/<name>.plugin.ts`, takes
// packets from the one plugin with a mounted `pipe`, and gives each row a `<kind>.client.ts`
// next to the page (setup, tick, remove). No client file, no actor, and no request for one: the
// client starts by reading which kinds have a look (`looked`, below), and imports a row's file only
// when its kind is one of them. A kind's file is imported once, as `<kind>.client.ts?instance`, the
// file made to hand out a fresh copy of itself (`scripts/instance.ts`), and each row is set up on a
// copy of its own, `instance()`: what an actor keeps at the top of its file, the mesh it drew, is
// that row's, and two clients in one tab (two seats, the editor's views) never share one.
// `actor(id)` is the copy this client runs for row `id`.
//
// The bundle. Every module a page loads while it runs, a plugin, a scene's sim, a mod, a drawing
// file, is loaded through `imported(url)`. A page the dev server or the static site built into a
// bundle (`scripts/bundle.ts`) holds each of them in it, and `imported` takes it from there, so no
// request goes out for its code; anywhere else, in a test or a page served file by file, the url
// itself is imported.
// The file exports a function of the plugin's own name and this calls it once, so the renderer,
// the pipe, the actors and the keys belong to this client alone and go when it closes: a page makes
// a new client each time the seat moves to another scene, and that one starts with none of them.
// `wire` holds the last packet's step, ack and rows, the page's folder and scene, and `send`,
// which numbers each message and returns that number, or 0 when the pipe refused it.
// `close` ends the client: every actor's `remove`, then every plugin's `close` in the reverse of
// the order the scene names them, so a plugin is still whole while the ones after it let go of it,
// then the pipe's `close`. A frame after that does nothing.
//
// Input before the steps. A page whose loop steps the truth in its own frames calls `input()` first,
// then runs its steps, then `frame()`: `input` runs every plugin's `input`, handed `plugins`, so
// what a plugin reads once a frame, a gamepad's buttons or the mouse, goes up the pipe before
// the steps the loop is about to run, and those steps take it. A page that steps nothing, as
// `client.html`'s, calls none. Before the first packet it does nothing.
//
// Drawing between steps. A page whose loop steps the truth in its own frames, as `index.html`'s
// does, knows how far its clock has gone past the step it just took: what it still owes over a
// step's seconds, from 0 up to 1. It hands that to `frame` as `between`, and `wire.between` holds it
// for that frame; a page that hands none, as `client.html`'s and a test's frames do, leaves it
// undefined. A renderer draws every thing it holds a step behind the clock: `between` of the way
// from where the step before put it to where the newest step put it, with `steps` below, so a thing
// moving at a steady speed moves the same distance every frame however the frames and the steps
// fall. With no `between`, things are drawn where the newest rows put them.
import type { Arg, Pipe, Row, Scene } from './engine.ts'

export type Wire = { n: number; ack: number; rows: Row[]; between?: number; send(id: number, action: string, ...args: Arg[]): number; home: string; scene: Scene }
export type Plugins = Record<string, any> & { wire: Wire }
export type Actor = {
  setup(row: Row, plugins: Plugins): void
  tick(row: Row, plugins: Plugins): void | false
  remove(plugins: Plugins): void
}
export type Client = Awaited<ReturnType<typeof client>>

// The modules of the bundle this page was built into, by the path and query of the url each is
// loaded by: handed over by the bundle's own file before the page's script runs
// (`scripts/bundle.ts`), and none in a page that is no bundle.
const bundled = (): Record<string, any> => (globalThis as Record<symbol, Record<string, any> | undefined>)[Symbol.for('core.bundle')] ?? {}

// The module at `url`: the bundle's when the page is a bundle holding it, else the url's.
export function imported(url: string): Promise<any> {
  const u = new URL(url)
  const had = bundled()[u.pathname + u.search]
  return had ? Promise.resolve(had) : import(/* @vite-ignore */ url)
}

// A drawing file as the page imports it: a maker of fresh copies of itself.
type Instanced = { instance(): Promise<Actor> }

// The drawing file of `kind` beside the page at `home`, or undefined when it does not load.
export function drawing(kind: string, home: string): Promise<Instanced | undefined> {
  return imported(new URL(`${kind}.client.ts?instance`, home).href).catch(() => undefined)
}

// The kinds that have a look among the names of a folder's files: each `<kind>.client.ts`.
export function looks(names: string[]): string[] {
  return names.filter(n => /^[^.]+\.client\.ts$/.test(n)).map(n => n.slice(0, -'.client.ts'.length)).sort()
}

// The kinds that have a look beside the page at `home`. A bundle holds every one, and names them. A
// page on disk, in node or a test, has its folder read. A page over http that is no bundle reads
// `looks.json` beside it, a list of those kinds, which the dev server makes from the folder each time
// it is asked (`vite.config.ts`).
async function looked(home: string): Promise<Set<string>> {
  const folder = new URL('.', home)
  const all = Object.keys(bundled())
  if (all.length) {
    const at = /^(.*\/)([^/]+)\.client\.ts\?instance$/
    return new Set(all.flatMap(k => (at.exec(k)?.[1] === folder.pathname ? [at.exec(k)![2]] : [])))
  }
  if (folder.protocol === 'file:') return new Set(looks(process.getBuiltinModule('node:fs').readdirSync(folder) as string[]))
  const res = await fetch(new URL('looks.json', folder))
  if (!res.ok) throw new Error(`${res.url} answered ${res.status}: it lists the kinds with a look`)
  return new Set(await res.json() as string[])
}

export async function client(scene: Scene, home: string) {
  if (!scene.plugins) throw new Error('scene names no plugins')
  const lookable = await looked(home)
  const files = new Map<string, Promise<Instanced | undefined>>()
  let seq = 0
  const order: any[] = []
  const pipe = (): Pipe => {
    const mounted = order.filter(p => 'pipe' in p && p.pipe)
    if (mounted.length !== 1) throw new Error(`${mounted.length} wire plugins mounted, need 1`)
    return mounted[0].pipe
  }
  const wire: Wire = { n: 0, ack: 0, rows: [], home, scene, send: (id, action, ...args) => { const s = ++seq; return pipe().send({ seq: s, n: wire.n, id, action, args }) ? s : 0 } }
  const plugins: Plugins = { wire }
  for (const name of scene.plugins) {
    const mod = await imported(new URL(`../plugins/${name}/${name}.plugin.ts`, import.meta.url).href)
    if (!(name in mod)) throw new Error(`${name}.plugin.ts does not export ${name}`)
    const made = mod[name]()
    plugins[name] = made
    order.push(made)
  }
  const actors = new Map<number, Actor>()
  let synced = false
  let closed = false
  const me = {
    plugins,
    get n() { return wire.n },
    get rows() { return wire.rows },
    actor(id: number): Actor | undefined { return actors.get(id) },
    input() {
      if (closed || !synced) return
      for (const p of order) if ('input' in p) p.input(plugins)
    },
    async frame(between?: number) {
      if (closed || !order.some(p => 'pipe' in p && p.pipe)) return
      wire.between = between
      for (const pkt of pipe().take()) {
        synced = true
        wire.n = pkt.n
        wire.ack = pkt.ack
        wire.rows = pkt.rows
        for (const id of pkt.ended) {
          actors.get(id)?.remove(plugins)
          actors.delete(id)
        }
        for (const id of pkt.born) {
          const row = pkt.rows.find(r => r.id === id)
          if (!row) throw new Error(`truth says row ${id} was born but did not send it`)
          if (!lookable.has(row.kind)) continue
          if (!files.has(row.kind)) files.set(row.kind, drawing(row.kind, home))
          const file = await files.get(row.kind)
          if (closed) return
          if (!file) continue
          const actor = await file.instance()
          if (closed) return
          actor.setup(row, plugins)
          actors.set(id, actor)
        }
      }
      if (!synced) return
      for (const p of order) if ('tick' in p) await p.tick(plugins)
      for (const r of wire.rows) actors.get(r.id)?.tick(r, plugins)
      for (const p of order) if ('afterTick' in p) await p.afterTick(plugins)
    },
    close() {
      if (closed) return
      closed = true
      for (const actor of actors.values()) actor.remove(plugins)
      actors.clear()
      for (const p of [...order].reverse()) if ('close' in p) p.close(plugins)
      for (const p of order) if ('pipe' in p && p.pipe) p.pipe.close()
    },
  }
  return me
}

// Where each thing a renderer draws stood after the last two steps the client took, so it draws them
// between (Drawing between steps, above). `read` hands back a thing's placement as numbers, `write`
// puts a placement on it, and `mix` is the placement `f` of the way from `a` to `b`.
// `place(things, wire)`, just before the draw: on the frame the client takes a new step it notes where
// every thing stands, as the actors and plugins have just set it from that step's rows; then, when
// the wire has a `between`, it puts every thing it noted on both of the last two steps the right part
// of the way from the one to the other. `restore()`, just after the draw, puts each back where it was
// set, so what an actor or a plugin reads of a thing is what it set. A thing that moved on a frame
// that took no step is moved by the page's own clock, not by the steps (an animation, a particle, a
// camera the editor turns): it is drawn where it is set for the rest of that step and all of the
// next, and between the steps again once a whole step has gone by with nothing but the steps moving
// it. A thing that came with the newest step, there on it and not on the step before, did not exist
// at the moment drawn, which is before that step: with `shown`, which reads and sets whether a thing
// is drawn at all, it is not drawn until the clock reaches its step, and is then drawn where it was
// set, its first place, never a step ahead of everything around it. Without `shown` it is drawn where
// it is set. Everything on a frame after the steps went back, as the editor's seek takes them, is
// drawn where it is set.
export function steps<T extends object>(read: (t: T) => number[], write: (t: T, p: number[]) => void, mix: (a: number[], b: number[], f: number) => number[], shown?: (t: T, on?: boolean) => boolean) {
  let now = new Map<T, number[]>(), before = new Map<T, number[]>()
  let at = -1, was = -1
  // The things that moved on a frame of no step: since the newest step, and in the step before it.
  let drifting = new Set<T>(), drifted = new Set<T>()
  // The things that came with the newest step, and those hidden for this draw.
  let fresh = new Set<T>()
  let hidden: T[] = []
  let moved: [T, number[]][] = []
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])
  return {
    place(things: T[], wire: Wire) {
      if (wire.n !== at) {
        const back = wire.n < at
        before = back ? new Map() : now
        was = back ? -1 : at
        now = new Map()
        at = wire.n
        drifted = drifting
        drifting = new Set()
        fresh = new Set()
        for (const t of things) {
          now.set(t, read(t))
          if (was >= 0 && !before.has(t)) fresh.add(t)
        }
      } else {
        for (const t of things) {
          const set = now.get(t)
          if (set && !same(set, read(t))) drifting.add(t)
        }
      }
      // A step behind the clock: `between` of a step past the step before the newest, which is the
      // one before it when the frame took one step, and as many before as the frame took.
      const f = wire.between === undefined || was < 0 ? undefined : Math.min(1, Math.max(0, (at - 1 + wire.between - was) / (at - was)))
      for (const t of things) {
        if (shown && f !== undefined && f < 1 && fresh.has(t) && shown(t)) {
          shown(t, false)
          hidden.push(t)
          continue
        }
        const a = before.get(t), b = now.get(t)
        if (f === undefined || !a || !b || drifting.has(t) || drifted.has(t) || same(a, b)) continue
        moved.push([t, read(t)])
        write(t, mix(a, b, f))
      }
    },
    restore() {
      for (const [t, b] of moved) write(t, b)
      for (const t of hidden) shown!(t, true)
      moved = []
      hidden = []
    },
  }
}

// A `mix` for `steps`: each number `f` of the way from `a` to `b` in a straight line, but each at one of
// the indices `angles`, in radians, which goes the short way round, so a hand at a hair before twelve
// and one at a hair after it are a hair apart.
export function mixing(angles: number[] = []) {
  return (a: number[], b: number[], f: number) => a.map((x, i) => {
    let d = b[i] - x
    if (angles.includes(i)) d -= 2 * Math.PI * Math.round(d / (2 * Math.PI))
    return x + d * f
  })
}
