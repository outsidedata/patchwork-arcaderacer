// A server that puts a late press on the step it was made on. Each test boots one scene twice: a
// truth that took every press on time, the way a server would that every press reached before its
// step, and a truth behind `rewind`, which takes some of them late. Where the rewind puts a late press
// back, it goes back to that step and plays on from there a step for each step of its clock, so it
// stands behind the on-time truth by as many steps as the press was late, and at every step it reaches
// it holds the same rows, the same die and the same ids the on-time truth held at that step; where the
// press is past `cutoff`, the rewind answers it on its next step, as a truth that took it then.
import { expect, test } from 'vitest'
import { boot, type Msg, type Scene, type Sim, type Truth } from '#engine/engine.ts'
import { join, playtest } from '#addons/player/player.addon.ts'
import { heard } from '#addons/heard/heard.addon.ts'
import { box3d } from '#plugins/box3d/box3d.sim.ts'
import { predicts, reach, rewind, rewinding } from './rewind.addon.ts'

const DT = 1 / 60

// A car each seat drives, rolling the die every step for a wobble; a sparker spawning a spark every
// 7 steps that ends itself 5 steps on, so a step taken with another die or another next id differs.
const sim: Sim = {
  start: {},
  player: {
    before(me, _dt, w) {
      if (me.data.car) return
      const s = w.find('start', r => r.data.slot === me.data.seat)
      me.data.car = w.spawn('car', { x: s.data.x }).id
    },
    acts: {
      steer(me, w, seat, x) {
        if (typeof x !== 'number' || !Number.isFinite(x)) return
        w.call(w.get(me.data.car), 'steer', seat, x)
      },
    },
  },
  car: {
    tick(me, dt, w) {
      me.data.wobble = w.die() - 0.5
      me.data.x += (me.data.steer * 10 + me.data.wobble) * dt
    },
    acts: { steer(me, _w, _seat, x) { me.data.steer = x } },
  },
  sparker: { tick(me, _dt, w) { if (++me.data.t % 7 === 0) w.spawn('spark') } },
  spark: { tick(me, _dt, w) { if (++me.data.age > 5) w.end(me) } },
}

const scene = (): Scene => ({
  world: { seed: 7 },
  prefabs: { player: { seat: 0, car: 0 }, start: { slot: 0, x: 0 }, car: { x: 0, steer: 0, wobble: 0 }, sparker: { t: 0 }, spark: { age: 0 } },
  actors: [{ is: 'sparker' }, { is: 'start', slot: 0, x: 0 }, { is: 'start', slot: 1, x: 50 }],
  plugins: ['player'],
  seats: 2,
})

// The truth as JSON has it: rows, die, next id, every seat. What a seat's last packet showed is left
// out: a truth that goes back keeps the rows each seat was last sent as they are, since that is what
// its page holds, and a truth that took the press on time sent other packets.
const state = (t: Truth) => JSON.stringify({ ...t.save(), seats: t.save().seats.map(s => ({ ...s, inbox: [], shown: [] })) })
const steer = (seq: number, n: number, id: number, x: number): Msg => ({ seq, n, id, action: 'steer', args: [x] })
const playerOf = (t: Truth, slot: number) => t.rows.find(r => r.kind === 'player' && r.data.seat === slot)!
// The on-time truth's state at every step it stood at, to hold the rewound truth against at the same
// step, however far behind it stands.
const record = (t: Truth, of: (t: Truth) => string = state) => {
  const at = new Map<number, string>([[t.n, of(t)]])
  return { step() { t.step(DT); at.set(t.n, of(t)) }, at: (n: number) => at.get(n) }
}

const PREDICT = { epsilon: 1e-6, cutoff: 12, halflife: 60, snap: 2, below: 1e-3 }
test('world.predict is an epsilon, a cutoff, a halflife, a snap and a below, or absent', () => {
  expect(predicts({})).toBeUndefined()
  expect(predicts({ predict: PREDICT })).toEqual(PREDICT)
  expect(() => predicts({ predict: { epsilon: 1e-6 } })).toThrow('world.predict is {"epsilon":0.000001}: { "epsilon": <a distance of 0 or more>, "cutoff": <whole steps, 1 or more>, "halflife": <milliseconds above 0>, "snap": <a distance of 0 or more>, "below": <a distance above 0> }')
  expect(() => predicts({ predict: { ...PREDICT, delay: 50 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { epsilon: 1e-6, cutoff: 12, halflife: 60, snap: 2 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { ...PREDICT, cutoff: 0 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { ...PREDICT, cutoff: 2.5 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { ...PREDICT, epsilon: -1 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { ...PREDICT, halflife: 0 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { ...PREDICT, snap: -1 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { ...PREDICT, below: 0 } })).toThrow('world.predict is')
  expect(() => predicts({ predict: { ...PREDICT, late: 'lossy' } })).toThrow('world.predict is')
  expect(() => predicts({ predict: true })).toThrow('world.predict is true')
})

test('a press arriving after its step is put back on it, and the truth plays on from there: at every step it reaches it holds what it would have, had the press been on time', () => {
  const exact = boot(scene(), sim), late = boot(scene(), sim)
  const a = join(exact), b = join(late)
  const on = record(exact)
  const r = rewind(late, 12)
  for (let i = 0; i < 30; i++) { on.step(); r.step(DT) }
  const me = playerOf(exact, 0).id
  // Pressed on step 30; arrives on the server at step 38, eight steps late. A second press on step 33
  // arrives two steps later, when the truth, gone back to 30, has only reached 32: on time.
  exact.inbox(a, steer(1, 30, me, 2))
  exact.inbox(a, steer(2, 33, me, -1))
  for (let i = 0; i < 8; i++) { on.step(); r.step(DT) }
  expect(late.n).toBe(38)
  r.take(b, steer(1, 30, me, 2))
  r.step(DT)
  // Gone back to 30, the press taken there, and one step run: nothing run again.
  expect(late.n).toBe(31)
  expect(r.clock).toBe(39)
  expect(state(late)).toBe(on.at(31))
  on.step()
  r.step(DT)
  r.take(b, steer(2, 33, me, -1))
  for (let i = 0; i < 40; i++) {
    on.step()
    r.step(DT)
    expect(state(late)).toBe(on.at(late.n))
    expect(r.clock - late.n).toBe(8)
  }
  expect(late.rows.some(x => x.kind === 'spark')).toBe(true)
  expect(r.back).toBe(8)
  expect(r.missed).toBe(0)
})

test('the truth never stands more than the cutoff behind its clock: presses late again and again move it back no further', () => {
  const exact = boot(scene(), sim), late = boot(scene(), sim)
  const a = join(exact), b = join(late)
  const on = record(exact)
  const r = rewind(late, 6)
  for (let i = 0; i < 10; i++) { on.step(); r.step(DT) }
  const me = playerOf(exact, 0).id
  // A press every 4 steps, each arriving 5 steps after it was made by the clock. The first goes back
  // 5; the truth then stands 5 behind, so the next is late by its stamp only when the clock has passed
  // it by more than 5, which none does: from there every press is on time.
  let seq = 0
  const presses = new Map<number, Msg>()
  for (let s = 10; s < 90; s += 4) presses.set(s, steer(++seq, s, me, (s % 3) - 1))
  for (let clock = 10; clock < 100; clock++) {
    const made = presses.get(clock)
    if (made) exact.inbox(a, made)
    const due = presses.get(clock - 5)
    if (due) r.take(b, due)
    on.step()
    r.step(DT)
    // Before the first press arrives the truth has not taken it; from then on it holds what the
    // on-time truth held at every step.
    if (clock >= 15) expect(state(late)).toBe(on.at(late.n))
    expect(r.clock - late.n).toBeLessThanOrEqual(6)
  }
  expect(r.back).toBe(5)
  expect(r.clock - late.n).toBe(5)
  expect(r.missed).toBe(0)
})

test('a press later than the cutoff is answered on the next step, as on a truth it reached then', () => {
  const exact = boot(scene(), sim), late = boot(scene(), sim)
  const a = join(exact), b = join(late)
  const r = rewind(late, 4)
  for (let i = 0; i < 30; i++) { exact.step(DT); r.step(DT) }
  const me = playerOf(exact, 0).id
  // Stamped 30, arriving at 36: six steps late, past a cutoff of 4.
  for (let i = 0; i < 6; i++) { exact.step(DT); r.step(DT) }
  exact.inbox(a, steer(1, 36, me, 2))
  r.take(b, steer(1, 30, me, 2))
  for (let i = 0; i < 20; i++) {
    exact.step(DT)
    r.step(DT)
    expect(state(late)).toBe(state(exact))
  }
  expect(r.back).toBe(0)
  expect(r.missed).toBe(1)
})

test('a page\'s copy that took its own press on its stamp, which the server answered later, moves it there and comes to the server\'s rows', () => {
  const server = boot(scene(), sim), copy = boot(scene(), sim)
  const a = join(server), b = join(copy)
  const r = rewind(copy, 12, { cap: false, fast: true })
  for (let i = 0; i < 30; i++) { server.step(DT); r.step(DT) }
  const me = playerOf(server, 0).id
  // The copy answered the press on step 30; the server got it past its cutoff and answered it on 36.
  copy.inbox(b, steer(1, 30, me, 2))
  server.inbox(a, steer(1, 36, me, 2))
  for (let i = 0; i < 8; i++) { server.step(DT); r.step(DT) }
  expect(state(copy)).not.toBe(state(server))
  expect(r.move(b, 30, steer(1, 36, me, 2))).toBe(true)
  for (let i = 0; i < 30; i++) {
    server.step(DT)
    r.step(DT)
    expect(state(copy)).toBe(state(server))
  }
  // A step the copy no longer keeps is not moved off.
  expect(r.move(b, 30, steer(1, 50, me, 2))).toBe(false)
})

test('a press stamped further ahead than the cutoff is answered on the next step', () => {
  const exact = boot(scene(), sim), late = boot(scene(), sim)
  const a = join(exact), b = join(late)
  const r = rewind(late, 4)
  for (let i = 0; i < 10; i++) { exact.step(DT); r.step(DT) }
  const me = playerOf(exact, 0).id
  exact.inbox(a, steer(1, 10, me, 3))
  r.take(b, steer(1, 500, me, 3))
  for (let i = 0; i < 10; i++) {
    exact.step(DT)
    r.step(DT)
    expect(state(late)).toBe(state(exact))
  }
})

test('the steps passed again take every message they took the first time on its step: another seat\'s on time, and a playtester\'s, which thinks nothing again', () => {
  const exact = boot(scene(), sim), late = boot(scene(), sim)
  const a = join(exact), b = join(late)
  // A playtester on each, steering every 5th step by a roll of its own.
  const think = (count: { n: number }) => () => (++count.n % 5 === 0 ? ['steer', (count.n % 3) - 1] as [string, number] : undefined)
  const one = { n: 0 }, two = { n: 0 }
  playtest(exact, think(one))
  playtest(late, think(two))
  const on = record(exact)
  const r = rewind(late, 16)
  for (let i = 0; i < 20; i++) { on.step(); r.step(DT) }
  const mine = playerOf(exact, 0).id
  // Seat a's press stamped 20, arriving at 30; the playtester pressed on its own meanwhile.
  exact.inbox(a, steer(1, 20, mine, 2))
  for (let i = 0; i < 10; i++) { on.step(); r.step(DT) }
  expect(two.n).toBe(30)
  r.take(b, steer(1, 20, mine, 2))
  for (let i = 0; i < 30; i++) {
    on.step()
    r.step(DT)
    expect(state(late)).toBe(on.at(late.n))
    // The playtester thinks nothing on a step it already thought on: only past step 30 does it again.
    expect(two.n).toBe(Math.max(30, late.n))
  }
  expect(late.n).toBe(50)
  expect(r.back).toBe(10)
})

test('a late press reaches back no further than a change made to the truth between steps', () => {
  const exact = boot(scene(), sim), late = boot(scene(), sim)
  const a = join(exact), b = join(late)
  const r = rewind(late, 30)
  for (let i = 0; i < 20; i++) { exact.step(DT); r.step(DT) }
  // A second seat joins at step 25, between two steps.
  for (let i = 0; i < 5; i++) { exact.step(DT); r.step(DT) }
  join(exact)
  join(late)
  expect(reach(late)).toBe(0)
  r.step(DT)
  exact.step(DT)
  expect(reach(late)).toBe(25)
  const me = playerOf(exact, 0).id
  // Stamped 22, before the join: answered on the next step.
  exact.inbox(a, steer(1, late.n, me, 2))
  r.take(b, steer(1, 22, me, 2))
  for (let i = 0; i < 10; i++) {
    exact.step(DT)
    r.step(DT)
    expect(state(late)).toBe(state(exact))
  }
  expect(r.back).toBe(0)
  expect(r.missed).toBe(1)
})

test('a late press stamped before a seat joined through change goes back past the join, and the join is made again on its step', () => {
  const exact = boot(scene(), sim), late = boot(scene(), sim)
  const a = join(exact), b = join(late)
  const on = record(exact)
  const r = rewind(late, 30)
  for (let i = 0; i < 22; i++) { on.step(); r.step(DT) }
  const me = playerOf(exact, 0).id
  // Pressed on step 22, arriving at 30; a second seat joined between steps 24 and 25.
  exact.inbox(a, steer(1, 22, me, 2))
  for (let i = 0; i < 3; i++) { on.step(); r.step(DT) }
  join(exact)
  r.change({ join: true }, () => join(late))
  for (let i = 0; i < 5; i++) { on.step(); r.step(DT) }
  r.take(b, steer(1, 22, me, 2))
  for (let i = 0; i < 30; i++) {
    on.step()
    r.step(DT)
    expect(state(late)).toBe(on.at(late.n))
  }
  expect(r.back).toBe(8)
  expect(late.seats).toBe(2)
})

test('heard writes each message down once, at the step that answered it, through steps run again', () => {
  const late = boot(scene(), sim)
  const b = join(late)
  const list = heard(late)
  const r = rewind(late, 12)
  for (let i = 0; i < 10; i++) r.step(DT)
  const me = playerOf(late, 0).id
  r.take(b, steer(1, 10, me, 1))
  r.step(DT)
  for (let i = 0; i < 5; i++) r.step(DT)
  r.take(b, steer(2, 12, me, -1))
  let during = false
  late.onStep(() => { if (rewinding(late)) during = true })
  for (let i = 0; i < 5; i++) r.step(DT)
  expect(during).toBe(true)
  expect(list.map(h => [h.at, h.msg.seq])).toEqual([[10, 1], [12, 2]])
})

// A stack of crates in Box3D, in the world box3d's own test makes.
const surface = { friction: 0.6, restitution: 0, rollingResistance: 0 }
const crates = (): Scene => ({
  world: {
    seed: 1,
    box3d: {
      gravity: [0, -10, 0], subStepCount: 4, contactHertz: 30, contactDampingRatio: 10, contactSpeed: 3,
      restitutionThreshold: 1, maximumLinearSpeed: 400, enableSleep: true, enableContinuous: true,
      static: [{ pos: [0, -1, 0], rot: [0, 0, 0, 1], shapes: [{ box: [20, 1, 20], density: 0, baseMaterial: surface }] }],
      kinds: {
        crate: {
          type: 'dynamic', linearDamping: 0, angularDamping: 0, gravityScale: 1, sleepThreshold: 0.05, isBullet: false,
          shapes: [{ box: [0.5, 0.5, 0.5], density: 1000, baseMaterial: surface }],
        },
      },
    },
  },
  prefabs: {
    box3d: {},
    player: { seat: 0 },
    crate: { pos: [0, 0, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true },
  },
  actors: [{ is: 'box3d' }, { is: 'crate', pos: [0, 0.6, 0] }, { is: 'crate', pos: [0.1, 1.8, 0] }, { is: 'crate', pos: [-0.1, 3, 0.1] }],
  plugins: ['player'],
  seats: 1,
})
const physics: Sim = {
  box3d,
  crate: {},
  player: { acts: { push(_me, w, _seat, x) { if (typeof x === 'number') w.all('crate')[2].data.vel = [x, 0, 0] } } },
}

test('a late press in a Box3D world on a server is put back on its step to the bit, and the world plays on from there', () => {
  const exact = boot(crates(), physics), late = boot(crates(), physics)
  const a = join(exact), b = join(late)
  const on = record(exact, t => JSON.stringify(t.rows))
  const r = rewind(late, 12)
  const me = playerOf(exact, 0).id
  for (let i = 0; i < 5; i++) { on.step(); r.step(DT) }
  // A push on every 8th step from step 5, each arriving 6 steps late by the clock: the first goes back
  // 6, and from there the truth stands 6 behind, so every later push is on time.
  let seq = 0
  const pushes = new Map<number, Msg>()
  for (let s = 5; s < 400; s += 8) pushes.set(s, { seq: ++seq, n: s, id: me, action: 'push', args: [(s % 3) - 1] })
  for (let s = 5; s < 420; s++) {
    const made = pushes.get(s)
    if (made) exact.inbox(a, made)
    const due = pushes.get(s - 6)
    if (due) r.take(b, due)
    on.step()
    r.step(DT)
    // From the first push arriving on, the same rows at every step.
    if (s >= 11) expect(JSON.stringify(late.rows)).toBe(on.at(late.n))
  }
  expect(r.back).toBe(6)
  expect(exact.n - late.n).toBe(6)
})

test('a late press in a Box3D world on a page\'s copy, which runs every step again at once, is put back to the bit, and the world is rewound in place every time', () => {
  const exact = boot(crates(), physics), late = boot(crates(), physics)
  const a = join(exact), b = join(late)
  const r = rewind(late, 12, { fast: true })
  const me = playerOf(exact, 0).id
  for (let i = 0; i < 5; i++) { exact.step(DT); r.step(DT) }
  // A push on every 8th step from step 5, each arriving 6 steps late: 140 rewinds, more than Box3D
  // holds worlds, which a rewind making a world each time would run out of. Between a push arriving
  // and the next being made, every push made has arrived, and the two worlds are the same to the bit.
  let seq = 0
  const pushes = new Map<number, Msg>()
  for (let s = 5; s < 1125; s += 8) pushes.set(s, { seq: ++seq, n: s, id: me, action: 'push', args: [(s % 3) - 1] })
  let compared = 0
  for (let s = 5; s < 1140; s++) {
    const on = pushes.get(s)
    if (on) exact.inbox(a, on)
    const due = pushes.get(s - 6)
    if (due) r.take(b, due)
    exact.step(DT)
    r.step(DT)
    if ((s - 5) % 8 >= 6) { expect(JSON.stringify(late.rows)).toBe(JSON.stringify(exact.rows)); compared++ }
  }
  expect(pushes.size).toBe(140)
  expect(compared).toBeGreaterThan(250)
  expect(r.back).toBe(pushes.size * 6)
  expect(late.n).toBe(exact.n)
})
