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

export function heard(truth: Truth): Heard[] {
  const list: Heard[] = []
  // What was written down at each step a rewind may still run again, to know it again.
  const written = new Map<number, Set<string>>()
  truth.attach({
    show: () => true,
    hide: () => [],
    accept: (seat, msg) => {
      const said = JSON.stringify([seat, msg])
      const at = written.get(truth.n) ?? new Set<string>()
      if (rewinding(truth) && at.has(said)) return true
      written.set(truth.n, at.add(said))
      for (const n of written.keys()) if (n < reach(truth)) written.delete(n)
      list.push({ at: truth.n, seat, msg })
      return true
    },
    advance: () => true,
    spawn: () => {},
  })
  return list
}
