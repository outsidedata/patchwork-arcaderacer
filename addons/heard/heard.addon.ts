// What a truth's steps answered, for whoever asks to read it: a test that counts the presses the
// server took, or the simulator writing down which page's message each step took. The truth keeps no
// message it has answered, so a server that never asks holds none; one that asks holds every message
// answered from then on, in the list `heard` hands back, which is the caller's to read and to empty.
//
// `heard(truth)` attaches a piece whose `accept` writes down each message the step answers, `{ at,
// seat, msg }`, `at` the step that answered it, before the passes of that step, and lets it through.
// A message is answered on the step it is stamped with, or the first one after it reaches the truth,
// so one held for a later step is in the list once that step runs, and never before. The engine asks
// every piece in the order they were attached and stops at the first that refuses, so a message a
// piece attached earlier refused is not in the list: the truth did not take it.
//
// A server that rewinds (`addons/rewind`) runs steps again with the messages they took, and a late
// one put back on its step. A message the steps run again answer on the step it was written down at
// is not written down again; one answered on another step than before, the late one or one a late
// one moved, is written down again at the step that answered it now.
import type { Msg, Truth } from '#engine/engine.ts'
import { reach, rewinding } from '#addons/rewind/rewind.addon.ts'

export type Heard = { at: number; seat: number; msg: Msg }

// Whether two messages say the same: the same number (NaN the same as NaN), string, boolean or null, or
// arrays and plain objects of the same, item by item and field by field, a field holding undefined the
// same as one not there.
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

export function heard(truth: Truth): Heard[] {
  const list: Heard[] = []
  // What was written down at each step a rewind may still run again, to know it again: each message
  // copied as it arrived, before the act it asks for runs, which may write into its args.
  const written = new Map<number, { seat: number; msg: Msg }[]>()
  truth.attach({
    show: () => true,
    hide: () => [],
    accept: (seat, msg) => {
      const at = written.get(truth.n) ?? []
      if (rewinding(truth) && at.some(e => e.seat === seat && e.msg.seq === msg.seq && same(e.msg, msg))) return true
      at.push({ seat, msg: structuredClone(msg) })
      written.set(truth.n, at)
      for (const n of written.keys()) if (n < reach(truth)) written.delete(n)
      list.push({ at: truth.n, seat, msg })
      return true
    },
    advance: () => true,
    spawn: () => {},
  })
  return list
}
