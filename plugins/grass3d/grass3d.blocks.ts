// What grass3d's browser half (`grass3d.plugin.ts`, Workers) and its workers (`grass3d.worker.ts`) say to
// each other, and what a worker does with it, kept apart from the worker's own listener so the page's tests
// run the same code in a stand-in.
//
// What the page sends:
//   { type: 'hold', version, url, held, cell, rules }   the land of `version`: the module at `url`, whose
//                       `worker(held)` makes the ground, the lattice's `cell` and each grass's rules
//   { type: 'fill', id, version, blocks: [bx, bz][] }   blocks of that version to fill (`grass3d.sim.ts`'s
//                       `fill`)
// What comes back, for each fill: { id, version, out }, each block filled, the arrays handed over, not
// copied. A fill of a version the worker no longer holds comes back with no blocks.
import { fill, type Filled, type Ground, type Rule } from './grass3d.sim.ts'

export type Asked =
  | { type: 'hold'; version: string; url: string; held: unknown; cell: number; rules: Rule[][] }
  | { type: 'fill'; id: number; version: string; blocks: [number, number][] }
export type Answer = { id: number; version: string; out: Filled[] }

// What a worker holds: the land of one version, made once.
export type Holder = { holding?: { version: string; ground: Promise<Ground>; cell: number; rules: Rule[][] } }
export const holder = (): Holder => ({})

// One message to a worker: a land held, or blocks filled and `send` handed the answer and the buffers to
// hand over.
export async function serve(h: Holder, a: Asked, send: (answer: Answer, transfer: ArrayBuffer[]) => void) {
  if (a.type === 'hold') {
    h.holding = { version: a.version, cell: a.cell, rules: a.rules, ground: import(a.url).then(m => (m.worker as (held: unknown) => Ground)(a.held)) }
    return
  }
  const held = h.holding
  if (!held || held.version !== a.version) { send({ id: a.id, version: a.version, out: [] }, []); return }
  const ground = await held.ground
  const out = a.blocks.map(([bx, bz]) => fill(ground, bx, bz, held.cell, held.rules))
  send({ id: a.id, version: a.version, out }, out.flatMap(f => [f.heights.buffer as ArrayBuffer, f.keeps.buffer as ArrayBuffer]))
}
