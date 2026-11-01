// A worker of terrain3d's browser half (`terrain3d.plugin.ts`, Workers): it holds its own land, made
// from the field and the unsaved strokes the page sends it, and builds the rings the page asks for
// with the same arithmetic the page would (`terrain3d.rings.ts`), handing back each ring's arrays
// without a copy.
//
// What the page sends, in order:
//   { type: 'land', field, unsaved }                 the land from now on: `land(field)` keeping the
//                                                    unsaved stroke `unsaved[k]` on layer k
//   { type: 'ring', id, rings, k, C, hole, seabed }  ring k of `world.terrain3d.rings`, middle C and
//                                                    the finer ring's middle `hole`, on the land as the
//                                                    last `land` left it
//   { type: 'drop', ids }                            the rings asked for under those ids, not wanted
//   { type: 'task', id, url, input }                 the module at `url`'s `task(ground, input)` run on
//                                                    the land, `ground` the land as terrain3d's page
//                                                    `ground` has it (`groundOf`), but for what only a
//                                                    page has: `ray`, `shown` and preparing
// What it sends back: `{ type: 'ring', id, k, C, hole, N, pos, nor, grid, index }` for each ring it built,
// and `{ type: 'task', id, out }` for each task, `out` and its `transfer` from the task.
//
// A ring or a task asked for waits in a queue and is run on a turn of its own, one a turn, so a `drop`
// that arrives while it waits is read before it is built, and a dropped ring is never built. Each is
// run on the land of the last `land` before it, since the page sends them in that order.
import { land as landFrom, type Field, type Land, type Rule, type Stroke } from './terrain3d.sim.ts'
import { arrays, build, finish, layoutOf, slotsOf, type Layout, type Slots } from './terrain3d.rings.ts'

type On = { land: Land; slots: Slots }
type Ask =
  | { type: 'ring'; id: number; rings: { reach: number; seg: number }[]; k: number; C: number[]; hole: number[] | undefined; seabed: boolean; on: On }
  | { type: 'task'; id: number; url: string; input: unknown; on: On }
type Task = (ground: ReturnType<typeof groundOf>, input: unknown) => { out: unknown; transfer: Transferable[] }

const send = (globalThis as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage.bind(globalThis)
let held: On | undefined
const layouts = new Map<string, Layout>()
let queue: Ask[] = []
let turn = false

// The land as a task reads it: terrain3d's page `ground`, but for what only a page has.
function groundOf(l: Land) {
  return {
    height: (x: number, z: number) => l.height(x, z),
    raw: (x: number, z: number) => l.raw(x, z),
    depth: (x: number, z: number) => l.depth(x, z),
    at: (x: number, z: number) => l.analyse(x, z),
    cover: (x: number, z: number) => l.paint(x, z).cover,
    spray: (x: number, z: number) => l.paint(x, z).spray,
    mark: (x: number, z: number) => l.paint(x, z).mark,
    ramp: (rule: Rule, x: number, z: number) => l.ramp(rule, x, z),
    rules: (list: Rule[], what: string) => l.rules(list, what),
    edits: () => l.edits(),
    mix: (x: number, z: number) => l.mix(x, z),
    layers: (x: number, z: number) => l.layers(x, z),
  }
}

// The next ring or task in the queue run and sent, on a turn of its own.
async function next() {
  const a = queue.shift()
  if (!a) {
    turn = false
    return
  }
  if (a.type === 'ring') {
    const key = JSON.stringify(a.rings)
    let layout = layouts.get(key)
    if (!layout) {
      layout = layoutOf(a.rings)
      layouts.set(key, layout)
    }
    const b = build(a.on.land, layout, a.on.slots, a.k, a.C, a.hole, a.seabed)
    finish(b)
    const { out, transfer } = arrays(b)
    send({ type: 'ring', id: a.id, ...out }, transfer)
  } else {
    const run = (await import(/* @vite-ignore */ a.url)).task as Task
    const { out, transfer } = run(groundOf(a.on.land), a.input)
    send({ type: 'task', id: a.id, out }, transfer)
  }
  turn = false
  wake()
}

function wake() {
  if (turn || !queue.length) return
  turn = true
  setTimeout(next, 0)
}

globalThis.addEventListener('message', (e: Event) => {
  const data = (e as MessageEvent).data
  if (data.type === 'land') {
    const field = data.field as Field, unsaved = data.unsaved as (Stroke | undefined)[]
    held = { land: landFrom(field, { unsaved: k => unsaved[k] }), slots: slotsOf(field) }
  } else if (data.type === 'ring') {
    queue.push({ type: 'ring', id: data.id, rings: data.rings, k: data.k, C: data.C, hole: data.hole, seabed: data.seabed, on: held! })
    wake()
  } else if (data.type === 'task') {
    queue.push({ type: 'task', id: data.id, url: data.url, input: data.input, on: held! })
    wake()
  } else if (data.type === 'drop') {
    const ids = new Set(data.ids as number[])
    queue = queue.filter(a => !ids.has(a.id))
  }
})
