// The scenemanager row's rule on a scene this test writes itself, a child as the addon leaves it
// once loaded: a `scenemanager` row whose `names` are `den` and `yard`, and two `door` rows, a kind
// whose act moves the seat that knocked and whose hook moves the seat it keeps. No addon runs here,
// so nothing reads `out`: the test reads it after each step, as the addon would once the step is over.
import { expect, test } from 'vitest'
import { boot, type Arg, type Row, type Scene, type Sim, type Truth } from '#engine/engine.ts'
import { scenemanager } from './scenemanager.sim.ts'

const DT = 1 / 60

const door: Sim[string] = {
  acts: {
    knock: (_me, w, seat, name: string, ...args) => w.call(w.find('scenemanager'), 'go', seat, name, ...args),
  },
  tick(me, _dt, w) {
    if (me.data.leave == null) return
    w.call(w.find('scenemanager'), 'go', me.data.seat, me.data.leave)
    me.data.leave = null
  },
}

const scene = (row: Record<string, unknown> = { names: ['den', 'yard'] }): Scene => ({
  prefabs: { scenemanager: { out: {}, ...row }, door: { seat: null, leave: null } },
  actors: [{ is: 'scenemanager' }, { is: 'door' }, { is: 'door' }],
})

const start = (row?: Record<string, unknown>) => {
  const truth = boot(scene(row), { scenemanager, door })
  const ctrl = truth.rows.find(r => r.kind === 'scenemanager') as Row
  const doors = truth.rows.filter(r => r.kind === 'door')
  let seq = 0
  // A message from a seat, at a row, answered on the next step.
  const say = (seat: number, at: Row, action: string, ...args: Arg[]) => truth.inbox(seat, { seq: ++seq, n: truth.n, id: at.id, action, args })
  return { truth, ctrl, doors, say, step: (k = 1) => { for (let i = 0; i < k; i++) truth.step(DT) } }
}
const ack = (truth: Truth, seat: number) => truth.packet(seat).ack

test('a seat that possesses no row sends go at the row, and its slot in out holds the scene and the arguments', () => {
  const { truth, ctrl, say, step } = start()
  const a = truth.open(), b = truth.open()
  say(a, ctrl, 'go', 'yard', 3, 'gate')
  step()
  expect(ctrl.data.out).toEqual({ [a]: { scene: 'yard', args: [3, 'gate'] } })
  say(b, ctrl, 'go', 'den')
  step()
  expect(ctrl.data.out).toEqual({ [a]: { scene: 'yard', args: [3, 'gate'] }, [b]: { scene: 'den', args: [] } })
})

test('a second go before the slot is read replaces the first', () => {
  const { truth, ctrl, say, step } = start()
  const a = truth.open()
  say(a, ctrl, 'go', 'yard')
  say(a, ctrl, 'go', 'den', 1)
  step()
  expect(ctrl.data.out).toEqual({ [a]: { scene: 'den', args: [1] } })
})

// A seat's message arrives from outside the program, so its name may be anything.
test('go refuses a name the row\'s names do not hold, writing nothing, and the message is still answered', () => {
  const { truth, ctrl, say, step } = start()
  const a = truth.open()
  for (const name of ['cellar', 'Den', '', 7, null, true, ['den'], { scene: 'den' }, '__proto__', 'constructor', 'toString']) {
    say(a, ctrl, 'go', name as Arg)
    const before = ack(truth, a)
    step()
    expect(ctrl.data.out).toEqual({})
    expect(ack(truth, a)).toBe(before + 1)
  }
  // A row the addon has written no names on refuses every name.
  const bare = start({})
  const s = bare.truth.open()
  bare.say(s, bare.ctrl, 'go', 'den')
  bare.step()
  expect(bare.ctrl.data.out).toEqual({})
})

test('a rule\'s act moves the seat it was handed, and a hook the seat its row keeps', () => {
  const { truth, ctrl, doors, say, step } = start()
  truth.open()
  const knocker = truth.open(doors[0].id)
  say(knocker, doors[0], 'knock', 'yard', 'north')
  step()
  expect(ctrl.data.out).toEqual({ [knocker]: { scene: 'yard', args: ['north'] } })
  // A hook has no seat: it passes the seat its row keeps.
  Object.assign(doors[1].data, { seat: 5, leave: 'den' })
  step()
  expect(ctrl.data.out).toEqual({ [knocker]: { scene: 'yard', args: ['north'] }, 5: { scene: 'den', args: [] } })
  // A rule's name is refused as a seat's is.
  say(knocker, doors[0], 'knock', 'cellar')
  step()
  expect(Object.keys(ctrl.data.out)).toEqual([String(knocker), '5'])
})
