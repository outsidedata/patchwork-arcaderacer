// `heard` on a truth this test writes: one `dummy` row a seat possesses, whose `poke` act counts.
import { expect, test } from 'vitest'
import { boot, type Msg, type Scene } from '#engine/engine.ts'
import { heard } from './heard.addon.ts'

const DT = 1 / 60
const scene: Scene = { prefabs: { dummy: { pokes: 0 } }, actors: [{ is: 'dummy' }] }
const sim = { dummy: { acts: { poke(me: { data: { pokes: number } }) { me.data.pokes++ } } } }
const start = () => {
  const truth = boot(structuredClone(scene), sim)
  const dummy = truth.rows[0]
  const seat = truth.open(dummy.id)
  const msg = (seq: number, n: number, action = 'poke'): Msg => ({ seq, n, id: dummy.id, action, args: [] })
  return { truth, dummy, seat, msg }
}

// A message is in the list once the step answers it, with the step that answered it and its seat,
// never as it reaches the inbox; one stamped for a later step only once that step runs.
test('each message the step answers is in the list on the step that answered it, and one held for a later step only then', () => {
  const { truth, seat, msg } = start()
  const list = heard(truth)
  truth.inbox(seat, msg(1, 0))
  truth.inbox(seat, msg(2, 3))
  expect(list).toEqual([])
  truth.step(DT)
  expect(list).toEqual([{ at: 0, seat, msg: msg(1, 0) }])
  truth.step(DT)
  truth.step(DT)
  expect(list).toHaveLength(1)
  truth.step(DT)
  expect(list).toEqual([{ at: 0, seat, msg: msg(1, 0) }, { at: 3, seat, msg: msg(2, 3) }])
})

// The truth answers a message whose act the kind has not got, refusing it and acking it, so it is in
// the list; one a piece attached before refused, the truth never took, so it is not.
test('a message of an act the kind has not got is answered and listed; one an earlier piece refused is not', () => {
  const { truth, dummy, seat, msg } = start()
  truth.attach({ show: () => true, hide: () => [], accept: (_s, m) => m.seq !== 2, advance: () => true, spawn: () => {} })
  const list = heard(truth)
  truth.inbox(seat, msg(1, 0, 'nothing'))
  truth.inbox(seat, msg(2, 0))
  truth.inbox(seat, msg(3, 0))
  truth.step(DT)
  expect(list.map(h => h.msg.seq)).toEqual([1, 3])
  expect(dummy.data.pokes).toBe(1)
})

// The list is the caller's: emptied, it holds only what is answered after, and two callers each hold
// their own.
test('the list is the caller\'s to empty, and each caller holds its own', () => {
  const { truth, seat, msg } = start()
  const mine = heard(truth), theirs = heard(truth)
  truth.inbox(seat, msg(1, 0))
  truth.step(DT)
  mine.splice(0)
  truth.inbox(seat, msg(2, 1))
  truth.step(DT)
  expect(mine.map(h => h.msg.seq)).toEqual([2])
  expect(theirs.map(h => h.msg.seq)).toEqual([1, 2])
})
