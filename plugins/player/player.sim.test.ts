// The rule half of the player: a seat's `player` row taking hold of rows that are not it. The scene is
// written here: a `cart`, which a held cart's `push` moves along x and which rolls to rest while
// nobody holds it, and a `turret`, which a held turret's `aim` turns. Neither lists `push` or `aim`
// in `open`. The `player` row's `use(id)` takes hold of the row of that id, its `out()` lets go, and
// `relay` passes `push` on to a held cart and `aim` to a held turret. Each seat's presses are sent as
// a page sends them, numbered from 1.
import { expect, test } from 'vitest'
import { boot, type Scene, type Sim, type Truth } from '#engine/engine.ts'
import { join, leave } from '#addons/player/player.addon.ts'
import { holding as holdingOn } from './player.plugin.ts'
import { holderOf, holding, letGo, relay, take } from './player.sim.ts'

const scene = (): Scene => ({
  world: {},
  prefabs: {
    engine: { dt: 1 / 60 },
    player: { seat: 0 },
    cart: { x: 0, speed: 0 },
    turret: { angle: 0 },
  },
  actors: [{ is: 'cart' }, { is: 'cart' }, { is: 'turret' }],
  seats: 2,
})

const sim: Sim = {
  player: {
    acts: {
      use(me, w, _seat, id: number) {
        const it = [...w.all('cart'), ...w.all('turret'), ...w.all('player')].find(r => r.id === id)
        if (it) take(me, w, it)
      },
      out(me) { letGo(me) },
      ...relay({ cart: ['push'], turret: ['aim'] }),
    },
  },
  cart: {
    tick(me, dt, w) {
      if (!holderOf(w, me)) me.data.speed = 0
      me.data.x += me.data.speed * dt
    },
    acts: {
      push(me, _w, _seat, v: number) {
        if (typeof v === 'number' && Number.isFinite(v)) me.data.speed = Math.max(-1, Math.min(1, v)) * 6
      },
    },
  },
  turret: {
    acts: {
      aim(me, _w, _seat, a: number) {
        if (typeof a === 'number' && Number.isFinite(a)) me.data.angle = a
      },
    },
  },
}

const DT = 1 / 60

function start() {
  const truth = boot(scene(), sim)
  const seats = [join(truth), join(truth)]
  const seq = new Map<number, number>()
  const player = (slot: number) => truth.rows.find(r => r.kind === 'player' && r.data.seat === slot)!
  const carts = () => truth.rows.filter(r => r.kind === 'cart')
  const turret = () => truth.rows.find(r => r.kind === 'turret')!
  // A press from the seat in `slot`, at the row `id` (its own `player` row unless named), taken on the
  // next step.
  const press = (slot: number, action: string, args: unknown[] = [], id = player(slot).id) => {
    const s = seats[slot]
    seq.set(s, (seq.get(s) ?? 0) + 1)
    truth.inbox(s, { seq: seq.get(s)!, n: truth.n, id, action, args: args as any[] })
  }
  const step = (n = 1) => { for (let i = 0; i < n; i++) truth.step(DT) }
  step()
  return { truth, seats, player, carts, turret, press, step }
}

// The `W` a test reads with, over the truth's rows as they stand.
const wOf = (truth: Truth) => ({
  all: (kind: string) => truth.rows.filter(r => r.kind === kind),
}) as any

test('taking hold: the row is held by that player row, and holding and holderOf find each other', () => {
  const { truth, player, carts, press, step } = start()
  press(0, 'use', [carts()[0].id])
  step()
  expect(player(0).data.held).toEqual({ kind: 'cart', id: carts()[0].id })
  expect(holding(wOf(truth), player(0))).toBe(carts()[0])
  expect(holderOf(wOf(truth), carts()[0])).toBe(player(0))
  expect(holderOf(wOf(truth), carts()[1])).toBeUndefined()
})

test('a row is held by one seat at most, a player row holds one row at most, and a player row is never held', () => {
  const { truth, player, carts, turret, press, step } = start()
  press(0, 'use', [carts()[0].id])
  step()
  press(1, 'use', [carts()[0].id])
  press(0, 'use', [turret().id])
  press(1, 'use', [player(0).id])
  step()
  expect(player(0).data.held).toEqual({ kind: 'cart', id: carts()[0].id })
  expect(player(1).data.held).toBeUndefined()
  expect(holderOf(wOf(truth), carts()[0])).toBe(player(0))
  expect(holderOf(wOf(truth), turret())).toBeUndefined()
})

test('a press relayed reaches the held row on the step it is taken, and only a kind that lists it', () => {
  const { player, carts, turret, press, step } = start()
  press(0, 'push', [1])
  press(0, 'aim', [2])
  step()
  expect(carts().map(c => c.data.speed)).toEqual([0, 0])
  expect(turret().data.angle).toBe(0)
  press(0, 'use', [carts()[0].id])
  step()
  press(0, 'push', [1])
  press(0, 'aim', [2])
  step()
  expect(carts()[0].data.speed).toBe(6)
  expect(carts()[0].data.x).toBeCloseTo(6 * DT, 12)
  expect(carts()[1].data.speed).toBe(0)
  expect(turret().data.angle).toBe(0)
  expect(player(0).data.held).toEqual({ kind: 'cart', id: carts()[0].id })
})

test('a held row\'s relayed act, sent at the row itself, is refused: a seat reaches it only through the player row that holds it', () => {
  const { player, carts, press, step } = start()
  press(0, 'use', [carts()[0].id])
  step()
  press(0, 'push', [1], carts()[0].id)
  press(1, 'push', [1], carts()[0].id)
  step()
  expect(carts()[0].data.speed).toBe(0)
  expect(player(0).data.held).toEqual({ kind: 'cart', id: carts()[0].id })
})

test('letting go: the row has no holder from that step, rests by its own rule, and another seat may take it', () => {
  const { truth, player, carts, press, step } = start()
  press(0, 'use', [carts()[0].id])
  step()
  press(0, 'push', [1])
  step()
  expect(carts()[0].data.speed).toBe(6)
  press(0, 'out')
  step()
  expect(player(0).data.held).toBeNull()
  expect(holding(wOf(truth), player(0))).toBeUndefined()
  expect(holderOf(wOf(truth), carts()[0])).toBeUndefined()
  expect(carts()[0].data.speed).toBe(0)
  press(0, 'push', [1])
  press(1, 'use', [carts()[0].id])
  step()
  expect(carts()[0].data.speed).toBe(0)
  expect(holderOf(wOf(truth), carts()[0])).toBe(player(1))
})

test('a seat that leaves ends its player row and with it the hold: the row rests by its own rule', () => {
  const { truth, seats, player, carts, press, step } = start()
  press(0, 'use', [carts()[0].id])
  step()
  press(0, 'push', [1])
  step()
  const x = carts()[0].data.x
  leave(truth, seats[0])
  step()
  expect(holderOf(wOf(truth), carts()[0])).toBeUndefined()
  expect(carts()[0].data.speed).toBe(0)
  expect(carts()[0].data.x).toBe(x)
  expect(player(1).data.held).toBeUndefined()
})

test('a held row that ends lets go of its holder by being gone, and the holder may take another', () => {
  const { truth, player, carts, turret, press, step } = start()
  const gone = carts()[0]
  press(0, 'use', [gone.id])
  step()
  truth.rows.splice(truth.rows.indexOf(gone), 1)
  expect(holding(wOf(truth), player(0))).toBeUndefined()
  press(0, 'push', [1])
  press(0, 'use', [turret().id])
  step()
  expect(player(0).data.held).toEqual({ kind: 'turret', id: turret().id })
  press(0, 'aim', [0.5])
  step()
  expect(turret().data.angle).toBe(0.5)
})

test('on a page, holding is the row its own player row holds among the rows it was sent, and nothing for a seat that holds none', () => {
  const { truth, seats, carts, press, step } = start()
  press(0, 'use', [carts()[1].id])
  step()
  expect(holdingOn(truth.packet(seats[0]).rows)).toEqual(carts()[1])
  expect(holdingOn(truth.packet(seats[1]).rows)).toBeUndefined()
})
