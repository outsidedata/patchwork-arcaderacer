// The browser half of lod3d: each layer's instances (`lod3d.sim.ts`'s `tile`) held round render3d's camera,
// in tiles across x and z, each tile in the shell its distance from the camera's tile puts it in, and
// handed to the Drawings of the layer's words, which draw them. It stands nothing anywhere and draws
// nothing itself: the surfaces are the `seen` mods', the drawers the `behaviors` mods', and with none named
// it throws.
//
// Each `afterTick` it asks every `seen` plugin for its surfaces; until every one has handed them nothing is
// held, and once every one is `shown` (true where it says nothing) each Drawing is shown. A `seen` plugin
// with a browser half is listed before lod3d. A `version` that moves takes every held tile again.
// `world.lod3d` changing, or any Drawing gone stale, makes everything again. A layer is held once every one
// of its words has handed it a Drawing. Its numbers:
//   budget    milliseconds a frame taking tiles new to reach, nearest the camera first, at least one
//   hollows   with `mods.hollows`: the most boxes, `{ at, rot, half }` from each named plugin's
//             `hollows(plugins)`, nearest the camera, handed each Drawing every frame
//
// Shells. Shell k reaches ⌈rings[k] / cell⌉ tiles from the camera's tile (the larger of the x and z
// distances), out to the most shells any of the layer's words draws. A tile moving shell leaves every
// Drawing and arrives in its new shell, every tile leaving before any arrives.
//
// Height. `height(h)` is the camera's height above the ground in metres, as far as the shells are
// concerned, held until it is called again: -1, where it starts, and the shells are the x and z
// distances alone; h at or above 0, and shell k reaches ⌈√(rings[k]² − h²) / cell⌉ tiles, gone while
// rings[k] is not above h. So climbing shrinks every shell onto the ground under the camera, and the
// finer ones go first. Each layer's shells change the next frame, as if the camera's tile had moved.
//
// Workers. Where the page has `Worker`, lod3d works tiles off the page in a pool of its own module workers
// (`lod3d.worker.ts`), one fewer than the machine's cores, at least one, made the first time a layer can
// use them. A layer can when every `seen` plugin whose surfaces its tiles read hands a `worker`, the module
// that answers them there (`lod3d.sim.ts`); any other is worked on the page. Each version, every worker is
// sent the layers, every surface, and each plugin's `worker`, and works every tile asked after it on them,
// with the same arithmetic the page runs, so a tile is the same to the bit. A layer's tiles go nearest the
// camera first, BATCH a task, to the least busy worker, FLIGHT tasks of each layer in flight at once, the
// next sent as each comes back. What comes back waits until the frame takes it, under `budget` as a tile
// worked on the page does, and is held then in the shell it is in by that frame, or let go out of reach. A
// `version` that moves lets go of every answer still in flight and asks again for every held tile, each
// keeping what it draws until its new instances come. Where the page has no `Worker`, as in node, every
// tile is worked on the page.
//
// Prepared places. A `seen` plugin may hand a place the camera is about to jump to, `prepared` `[x, z]`
// (terrain3d's `prepare`, through `terrain3d.lod3d.ts`); the first one handed is the place. For each layer,
// every tile within its reach of the place's tile is worked ahead, nearest the place first, and kept off the
// scene: on the page with what is left of `budget` once the camera's tiles have had theirs, or in the
// workers, FLIGHT tasks of each layer at once. A tile the camera's field asks for that the place has worked
// is held from it at once. The frame the camera's tile is the place's, the camera has arrived: every tile
// the place has worked is held, and, once every `seen` plugin is `shown`, every tile in reach still not
// held is worked on the page and held in that frame, `budget` or no budget, so the field there is never
// seen half held; while one is not shown yet, as during preloading, the field fills as it always does. A
// `version` that moves lays the place out again. `ready()` is whether this field's share of the place is
// done: every layer held, and every tile in reach of the place worked, before arriving, or held, after;
// true with no place in hand. terrain3d asks it through `lod3d.terrain3d.ts`, named in
// `world.terrain3d.mods.ready`.
//
// It hands out `layers()`, each layer's `{ layer, held }`, every held tile's `things`, `ready()`, and
// `height(h)`.
// `close` disposes every Drawing and ends the workers.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { listed, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { behaviorsOf, check, drawersOf, layersOf, named, reachOf, rootsOf, tile, type Behaviors, type Drawing, type Hollow, type Layer, type Lod3d, type Seen, type Surface, type Thing } from './lod3d.sim.ts'
import type { Answer, Asked, Hold } from './lod3d.tiles.ts'

export type { Hollow } from './lod3d.sim.ts'
export type Hollows = (plugins: Plugins) => Hollow[]
export type Held = { i: number; j: number; things: Thing[]; shell: number; drawn: unknown[] }
// A layer's tiles worked off the page (Workers): each tile asked and not taken yet; the held tiles to ask
// again; the answers come back and not yet taken; and how many tasks are in flight. A new one is made with
// each `version`, so an answer to one made before is let go.
export type Away = { asked: Set<number>; again: [number, number][]; back: { i: number; j: number; things: Thing[] }[]; flight: number }
type Pooled = { worker: Worker; asked: number }
// A layer's share of the prepared place (Prepared places): the place's tile, the tiles worked for it and not
// yet held, every tile in reach of it nearest first and how far through them it is, the tasks of it in
// flight, and whether the camera has arrived.
export type Ahead = { at: [number, number]; tiles: Map<number, Thing[]>; queue: { i: number; j: number; d: number }[]; next: number; flight: number; arrived: boolean }
// A layer held: `rings` its shells' reach in metres, `radii` each shell's reach in tiles at the height `h`
// they were worked out for (Height), -1 for a shell gone.
export type Live = {
  name: string; layer: Layer; rings: number[]; radii: number[]; h: number; drawings: Drawing[]
  at: [number, number] | undefined; held: Map<number, Held>
  queue: { i: number; j: number; d: number }[]; next: number
  away?: Away
  ahead?: Ahead
}

const key = (i: number, j: number) => i * 134217728 + j
// How many tiles go in one task, and how many tasks of one layer may be in flight at once (Workers).
const BATCH = 64
const FLIGHT = 4

// Whether two values are the same: the same number (NaN the same as NaN), string, boolean or null, or
// arrays and plain objects of the same, item by item and field by field, a field holding undefined the
// same as one not there. Read every frame, so it walks the two and makes nothing.
function same(a: unknown, b: unknown): boolean {
  if (a === b || (a !== a && b !== b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const c = b as unknown[]
    if (a.length !== c.length) return false
    for (let i = 0; i < a.length; i++) if (!same(a[i], c[i])) return false
    return true
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>
  for (const k in x) if (!same(x[k], y[k])) return false
  for (const k in y) if (!(k in x) && y[k] !== undefined) return false
  return true
}

export function lod3d() {
  let built: Lod3d | undefined // a copy of world.lod3d the layers were made by, walked against it every frame
  let checked = false
  let onScene = false
  let version: string | undefined
  // The version, and the layers with it, the workers were last handed (Workers).
  let sent: string | undefined
  let surfaces: Surface[] | undefined
  let lives: Record<string, Live> = {}
  // The Drawings of a layer not yet held, while any of its words has handed none.
  let making = new Map<string, (Drawing | undefined)[]>()
  // The workers (Workers): none until a layer can use them, false where the page has no `Worker`. Each task
  // in flight under its id: what to call with its answer, and the worker working it.
  let pool: Pooled[] | false | undefined
  const tasks = new Map<number, { done: (out: Thing[][]) => void; on: Pooled }>()
  let nextTask = 0
  // Whether this field's share of the prepared place is done, as of the last frame (Prepared places).
  let share = false
  // The camera's height above the ground for the shells, -1 while none is handed (Height).
  let height = -1

  function workers(): Pooled[] | false {
    if (pool !== undefined) return pool
    if (typeof Worker === 'undefined') return (pool = false)
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2
    pool = Array.from({ length: Math.max(1, cores - 1) }, () => {
      const worker = new Worker(new URL('./lod3d.worker.ts', import.meta.url), { type: 'module' })
      const on: Pooled = { worker, asked: 0 }
      worker.addEventListener('message', e => {
        const a = (e as MessageEvent).data as Answer
        const t = tasks.get(a.id)
        if (!t) return
        tasks.delete(a.id)
        t.on.asked--
        t.done(a.out)
      })
      worker.addEventListener('error', e => { throw new Error(`lod3d's worker failed: ${(e as ErrorEvent).message}`) })
      return on
    })
    return pool
  }

  // Tiles of layer `name` asked of the least busy worker: a promise of each tile's things.
  function work(name: string, asked: [number, number][]): Promise<Thing[][]> {
    const on = (pool as Pooled[]).reduce((a, b) => (b.asked < a.asked ? b : a))
    on.asked++
    const id = nextTask++
    return new Promise(done => {
      tasks.set(id, { done, on })
      on.worker.postMessage({ type: 'tiles', id, name, tiles: asked } satisfies Asked)
    })
  }

  const drop = () => {
    for (const l of Object.values(lives)) for (const d of l.drawings) d.dispose()
    for (const ds of making.values()) for (const d of ds) d?.dispose()
    lives = {}
    making = new Map()
    onScene = false
  }

  const me = {
    layers: () => lives,
    ready: () => share,
    height(h: number) {
      if (!(h === -1 || (Number.isFinite(h) && h >= 0))) throw new Error(`lod3d's height ${h} is not -1 or a number of metres at or above 0`)
      height = h
    },

    afterTick(plugins: Plugins) {
      const on = plugins.wire.scene
      const s = on.world?.lod3d as Lod3d | undefined
      if (!s) return
      if (!plugins.render3d) throw new Error('lod3d holds its instances round render3d\'s camera, and this scene does not list render3d')
      const order = listed(on)
      for (const a of ([] as string[]).concat(s.mods?.seen ?? [])) {
        if (order.includes(a) && order.indexOf(a) > order.indexOf('lod3d')) throw new Error(`lod3d is listed before ${a}, whose surfaces it reads that frame`)
      }
      const stale = Object.values(lives).some(l => l.drawings.some(d => d.stale())) || [...making.values()].some(ds => ds.some(d => d?.stale()))
      if (!built || !same(s, built) || stale) {
        drop()
        built = structuredClone(s)
        checked = false
        version = undefined
        sent = undefined
        const hollowed = modsOf<Hollows>(on.world!, 'lod3d', 'hollows').length > 0
        if (hollowed && !(Number.isInteger(s.hollows) && s.hollows! > 0)) throw new Error(`lod3d is handed hollows, and world.lod3d.hollows ${s.hollows} is not a whole number above 0`)
      }
      const camera = plugins.render3d.camera as THREE.PerspectiveCamera | undefined
      const hollowed = modsOf<Hollows>(on.world!, 'lod3d', 'hollows').length > 0
      let boxes: Hollow[] = []
      if (hollowed) {
        provided(on, 'lod3d', 'hollows')
        const eye = camera?.position
        boxes = modsOf<Hollows>(on.world!, 'lod3d', 'hollows').flatMap(f => f(plugins))
        if (eye) boxes.sort((a, b) => Math.hypot(a.at[0] - eye.x, a.at[1] - eye.y, a.at[2] - eye.z) - Math.hypot(b.at[0] - eye.x, b.at[1] - eye.y, b.at[2] - eye.z))
        boxes = boxes.slice(0, s.hollows)
      }
      const seen = named<(plugins: Plugins) => Seen | undefined>(on.world!, 'seen').map(f => f(plugins))
      const behaviors = behaviorsOf(on.world!)
      if (seen.some(x => !x)) { share = false; return }
      const prepared = (seen as Seen[]).find(x => x.prepared)?.prepared
      const shown = (seen as Seen[]).every(x => x.shown ?? true)
      const now = (seen as Seen[]).map(x => x.version).join('\n')
      // The surfaces as one list, the same list while no version moves, so what a tile keeps of it holds.
      if (!surfaces || now !== version) surfaces = (seen as Seen[]).flatMap(x => x.surfaces)
      const all = surfaces
      const ask = { plugins }
      if (!checked) { check(s, all, behaviors, ask); checked = true }
      const layers = layersOf(s)
      const sights = seen as Seen[]
      const names = ([] as string[]).concat(s.mods?.seen ?? [])
      // Whether a layer's tiles go to the workers: every `seen` plugin whose surfaces they read hands a
      // `worker`, and the page has workers.
      const away = (name: string) => {
        const roots = rootsOf(name, layers)
        const owners = sights.filter(x => x.surfaces.some(sf => roots.includes(sf.name)))
        return owners.length > 0 && owners.every(x => x.worker) && workers() !== false
      }
      for (const [name, l] of Object.entries(layers)) {
        if (lives[name]) continue
        const live = make(name, l, s, behaviors, plugins, hollowed)
        if (!live) continue
        lives[name] = live
        if (away(name)) live.away = fresh([])
      }
      // The tiles each layer round another asks of its parent, shared by every layer this frame.
      const kept = new Map<string, Thing[]>()
      const take = (l: Live, i: number, j: number) => tile(l.name, layers, i, j, all, behaviors, ask, kept)
      if (now !== version) {
        version = now
        for (const l of Object.values(lives)) {
          // The place laid out again on the new surfaces; what it had worked is let go.
          l.ahead = undefined
          if (away(l.name)) {
            // A new Away lets go of every answer to the old one; each held tile is asked again, and the
            // field queued again round the camera.
            l.away = fresh([...l.held.values()].map(h => [h.i, h.j]))
            l.at = undefined
          } else {
            l.away = undefined
            for (const h of l.held.values()) { leave(l, h); h.things = take(l, h.i, h.j); arrive(l, h) }
          }
        }
      }
      // Every worker handed these layers and this version's surfaces and modules, before any tile of them
      // is asked: once each, and again when either changes.
      if (pool && sent !== now) {
        sent = now
        const plugins: Hold['plugins'] = {}
        sights.forEach((x, n) => { if (x.worker) plugins[names[n]] = x.worker })
        const held: Hold = { layers, surfaces: all, plugins }
        for (const p of pool) p.worker.postMessage({ type: 'hold', held } satisfies Asked)
      }
      if (camera) {
        for (const l of Object.values(lives)) lay(l, prepared)
        for (const l of Object.values(lives)) follow(l, camera.position.x, camera.position.z)
        for (const l of Object.values(lives)) reached(l, shown, take)
        for (const l of Object.values(lives)) if (l.away) { send(l); sendAhead(l) }
        const start = performance.now()
        let took = true, one = false
        while (took && (!one || performance.now() - start < s.budget)) {
          took = false
          for (const l of Object.values(lives)) if (l.away ? settle(l) : place(l, take)) took = one = true
        }
        // The prepared place's tiles, a tile from each layer in turn, with what is left of the budget.
        took = true
        while (took && performance.now() - start < s.budget) {
          took = false
          for (const l of Object.values(lives)) if (!l.away && prep(l, take)) took = true
        }
      }
      share = !prepared || (Object.keys(layers).every(name => lives[name]) && Object.values(lives).every(l => l.ahead !== undefined && (l.ahead.arrived ? filled(l) : l.ahead.next >= l.ahead.queue.length && l.ahead.flight === 0)))
      for (const l of Object.values(lives)) for (const d of l.drawings) d.frame(boxes)
      if (!onScene && shown) {
        onScene = true
        for (const l of Object.values(lives)) for (const d of l.drawings) d.show()
      }
    },

    close() {
      drop()
      built = undefined
      version = undefined
      sent = undefined
      surfaces = undefined
      share = false
      for (const p of pool || []) p.worker.terminate()
      pool = undefined
      tasks.clear()
    },
  }

  // A layer held once each of its words has handed a Drawing; until then the ones handed wait in `making`.
  function make(name: string, l: Layer, s: Lod3d, behaviors: Behaviors, plugins: Plugins, hollowed: boolean): Live | undefined {
    const what = `lod3d layer ${name}`
    const drawers = drawersOf(l, behaviors, what)
    const got = making.get(name) ?? drawers.map(() => undefined)
    making.set(name, got)
    const rings = s.rings.slice(0, reachOf(l, behaviors, what))
    const radii = reachAt(rings, l.cell, -1)
    const slots = radii.map((R, k) => (2 * R + 1) ** 2 - (k ? (2 * radii[k - 1] + 1) ** 2 : 0))
    drawers.forEach((d, k) => { got[k] ??= d.drawer.draw(d.look, { name, layer: l, rings: s.rings, plugins, slots, ...(hollowed && { hollows: s.hollows }) }) })
    if (got.some(d => !d)) return undefined
    making.delete(name)
    const drawings = got as Drawing[]
    if (onScene) for (const d of drawings) d.show()
    return { name, layer: l, rings, radii, h: -1, drawings, at: undefined, held: new Map(), queue: [], next: 0 }
  }

  // Each shell's reach in tiles at height `h` (Height): ⌈rings[k] / cell⌉ at -1, else ⌈√(rings[k]² − h²) /
  // cell⌉, -1 while rings[k] is not above h.
  const reachAt = (rings: number[], cell: number, h: number) =>
    rings.map(e => (h < 0 ? Math.ceil(e / cell) : e > h ? Math.ceil(Math.sqrt(e * e - h * h) / cell) : -1))

  // The shell a tile is in from the camera's tile, or -1 out of reach.
  const shellOf = (l: Live, i: number, j: number) => {
    const d = Math.max(Math.abs(i - l.at![0]), Math.abs(j - l.at![1]))
    return l.radii.findIndex(R => d <= R)
  }

  // The next tile of the queue worked here on the page and held: false when none in reach is left.
  function place(l: Live, take: (l: Live, i: number, j: number) => Thing[]): boolean {
    while (l.next < l.queue.length) {
      const { i, j } = l.queue[l.next++]
      if (l.held.has(key(i, j))) continue
      const shell = shellOf(l, i, j)
      if (shell < 0) continue
      const h: Held = { i, j, things: take(l, i, j), shell, drawn: [] }
      l.held.set(key(i, j), h)
      arrive(l, h)
      return true
    }
    return false
  }

  const fresh = (again: [number, number][]): Away => ({ asked: new Set(), again, back: [], flight: 0 })

  // Tasks sent to the workers for a layer until FLIGHT are in flight: the held tiles to ask again first,
  // then the queue's, nearest first, each BATCH tiles.
  function send(l: Live) {
    const a = l.away!
    while (a.flight < FLIGHT) {
      const batch = a.again.splice(0, BATCH)
      while (batch.length < BATCH && l.next < l.queue.length) {
        const { i, j } = l.queue[l.next++]
        const k = key(i, j)
        if (l.held.has(k) || a.asked.has(k)) continue
        batch.push([i, j])
      }
      if (!batch.length) return
      for (const [i, j] of batch) a.asked.add(key(i, j))
      a.flight++
      work(l.name, batch).then(out => {
        if (lives[l.name] !== l || l.away !== a) return
        a.flight--
        batch.forEach(([i, j], n) => a.back.push({ i, j, things: out[n] }))
      })
    }
  }

  // The next answer come back from a layer's workers taken: a held tile's new instances in place of its
  // old, or a new tile held in the shell it is in now; one out of reach is let go. False when none is left.
  function settle(l: Live): boolean {
    const a = l.away!
    while (a.back.length) {
      const { i, j, things } = a.back.shift()!
      const k = key(i, j)
      a.asked.delete(k)
      const h = l.held.get(k)
      if (h) {
        leave(l, h)
        h.things = things
        arrive(l, h)
        return true
      }
      const shell = shellOf(l, i, j)
      if (shell < 0) continue
      const n: Held = { i, j, things, shell, drawn: [] }
      l.held.set(k, n)
      arrive(l, n)
      return true
    }
    return false
  }

  const arrive = (l: Live, h: Held) => { h.drawn = l.drawings.map(d => d.arrive(h.things, h.shell)) }
  const leave = (l: Live, h: Held) => { l.drawings.forEach((d, k) => d.leave(h.drawn[k])); h.drawn = [] }

  // The field onto the camera's tile: every held tile moved to the shell it is now in, or let go out of
  // reach, every one leaving before any arrives; every tile in reach not held queued, nearest first. A
  // height handed since the last frame works the shells out again and does the same (Height).
  function follow(l: Live, x: number, z: number) {
    const ci = Math.floor(x / l.layer.cell), cj = Math.floor(z / l.layer.cell)
    if (l.at && l.at[0] === ci && l.at[1] === cj && l.h === height) return
    if (l.h !== height) { l.h = height; l.radii = reachAt(l.rings, l.layer.cell, height) }
    l.at = [ci, cj]
    const R = l.radii[l.radii.length - 1]
    const arriving: Held[] = []
    for (const [k, h] of l.held) {
      const shell = l.radii.findIndex(r => Math.max(Math.abs(h.i - ci), Math.abs(h.j - cj)) <= r)
      if (shell === h.shell) continue
      leave(l, h)
      if (shell < 0) { l.held.delete(k); continue }
      h.shell = shell
      arriving.push(h)
    }
    for (const h of arriving) arrive(l, h)
    const queue: { i: number; j: number; d: number }[] = []
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        const k = key(i, j)
        if (l.held.has(k)) continue
        // A tile the prepared place has worked is held from it at once.
        const worked = l.ahead?.tiles.get(k)
        if (worked) { l.ahead!.tiles.delete(k); hold(l, i, j, worked); continue }
        queue.push({ i, j, d: Math.max(Math.abs(i - ci), Math.abs(j - cj)) })
      }
    }
    l.queue = queue.sort((a, b) => a.d - b.d)
    l.next = 0
  }

  // A tile held in the shell it is in now, and drawn.
  function hold(l: Live, i: number, j: number, things: Thing[]) {
    const h: Held = { i, j, things, shell: shellOf(l, i, j), drawn: [] }
    l.held.set(key(i, j), h)
    arrive(l, h)
  }

  // The layer's share of the prepared place at `at`, laid out when the place's tile moves: every tile in
  // reach of it, nearest first (Prepared places).
  function lay(l: Live, at: number[] | undefined) {
    if (!at) { l.ahead = undefined; return }
    const ci = Math.floor(at[0] / l.layer.cell), cj = Math.floor(at[1] / l.layer.cell)
    if (l.ahead && l.ahead.at[0] === ci && l.ahead.at[1] === cj) return
    const R = l.radii[l.radii.length - 1]
    const queue: { i: number; j: number; d: number }[] = []
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) queue.push({ i, j, d: Math.max(Math.abs(i - ci), Math.abs(j - cj)) })
    l.ahead = { at: [ci, cj], tiles: new Map(), queue: queue.sort((a, b) => a.d - b.d), next: 0, flight: 0, arrived: false }
  }

  // Whether the camera's tile has just become the prepared place's: then every tile the place has worked
  // is held, and, once the surfaces are shown, every tile in reach still not held is worked here and held
  // in this frame; the place has arrived.
  function reached(l: Live, shown: boolean, take: (l: Live, i: number, j: number) => Thing[]) {
    const a = l.ahead
    if (!a || a.arrived || !l.at || l.at[0] !== a.at[0] || l.at[1] !== a.at[1]) return
    for (const [k, things] of a.tiles) {
      const i = Math.round(k / 134217728), j = k - i * 134217728
      if (!l.held.has(k) && shellOf(l, i, j) >= 0) hold(l, i, j, things)
    }
    a.tiles.clear()
    if (shown) {
      // The whole square, since a tile sent to a worker has left the queue and is not held yet.
      const R = l.radii[l.radii.length - 1]
      for (let j = a.at[1] - R; j <= a.at[1] + R; j++) for (let i = a.at[0] - R; i <= a.at[0] + R; i++) if (!l.held.has(key(i, j))) hold(l, i, j, take(l, i, j))
      l.next = l.queue.length
    }
    a.arrived = true
  }

  // The next tile of the prepared place not yet worked, worked here and kept off the scene; false when
  // every one is, or the camera has arrived. A tile the camera's field already holds is skipped.
  function prep(l: Live, take: (l: Live, i: number, j: number) => Thing[]): boolean {
    const a = l.ahead
    if (!a || a.arrived) return false
    while (a.next < a.queue.length) {
      const { i, j } = a.queue[a.next++]
      const k = key(i, j)
      if (l.held.has(k) || a.tiles.has(k)) continue
      a.tiles.set(k, take(l, i, j))
      return true
    }
    return false
  }

  // Tasks of the prepared place's tiles sent to the workers until FLIGHT are in flight, nearest it first,
  // each BATCH tiles the field does not hold. What comes back is kept for the place, or, once the camera
  // has arrived, taken as the field's own answers.
  function sendAhead(l: Live) {
    const a = l.ahead
    if (!a || a.arrived) return
    while (a.flight < FLIGHT) {
      const batch: [number, number][] = []
      while (batch.length < BATCH && a.next < a.queue.length) {
        const { i, j } = a.queue[a.next++]
        const k = key(i, j)
        if (l.held.has(k) || a.tiles.has(k) || l.away!.asked.has(k)) continue
        batch.push([i, j])
      }
      if (!batch.length) return
      a.flight++
      const away = l.away!
      work(l.name, batch).then(out => {
        if (lives[l.name] !== l || l.ahead !== a) return
        a.flight--
        batch.forEach(([i, j], n) => {
          if (!a.arrived) a.tiles.set(key(i, j), out[n])
          else if (l.away === away && !l.held.has(key(i, j))) away.back.push({ i, j, things: out[n] })
        })
      })
    }
  }

  // Whether the camera's field has held every tile in reach: its queue gone through, and, off the page,
  // nothing still asked or come back and not yet taken.
  const filled = (l: Live) => l.next >= l.queue.length && (!l.away || (l.away.flight === 0 && l.away.back.length === 0 && l.away.again.length === 0))

  return me
}
