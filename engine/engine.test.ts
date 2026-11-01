// The engine knows no package. Its files import one another and nothing else, and no line of them
// names a folder of plugins/ or addons/: a client loads the plugins its scene names, by the name
// the scene gives, and everything outside the step is attached from outside.
//
// A step's rows are the ones standing as its passes begin: a row spawned during the step runs from
// the next step's `before`, and a row ended runs nothing more.
import { expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { boot, type Row, type Sim, type W } from './engine.ts'

const here = new URL('./', import.meta.url)
const files = readdirSync(here).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
const source = files.map(f => readFileSync(new URL(f, here), 'utf8'))

test('the engine imports only its own files', () => {
  const from = source.flatMap(s => [...s.matchAll(/from '([^']+)'/g)].map(m => m[1]))
  expect(from.length).toBeGreaterThan(0)
  expect(from.filter(f => !f.startsWith('./'))).toEqual([])
})

test('the engine names no plugin and no addon', () => {
  const packages = ['../plugins/', '../addons/'].flatMap(d => readdirSync(new URL(d, here)))
  expect(packages).toContain('box3d')
  expect(packages).toContain('player')
  expect(packages.filter(p => source.some(s => new RegExp(`\\b${p}\\b`).test(s)))).toEqual([])
})

// A scene of an `a` row and a `b` row, with a prefab for every kind `sim` names.
const bootWith = (sim: Sim) => boot({ prefabs: Object.fromEntries(Object.keys(sim).map(k => [k, {}])), actors: [{ is: 'a' }, { is: 'b' }] }, sim)

test('a row spawned during a step runs nothing that step, and every pass of the next from its before', () => {
  const ran: string[] = []
  const hooks = (name: string) => ({ before: () => { ran.push(`${name}.before`) }, tick: () => { ran.push(`${name}.tick`) }, after: () => { ran.push(`${name}.after`) } })
  for (const pass of ['before', 'tick', 'after'] as const) {
    ran.length = 0
    const t = bootWith({ a: { ...hooks('a'), [pass]: (_me: Row, _dt: number, w: W) => { ran.push(`a.${pass}`); if (t.n === 0) w.spawn('kid') } }, b: hooks('b'), kid: hooks('kid') })
    t.step(1 / 30)
    expect(ran).toEqual(['a.before', 'b.before', 'a.tick', 'b.tick', 'a.after', 'b.after'])
    expect(t.rows.map(r => r.kind)).toEqual(['a', 'b', 'kid'])
    ran.length = 0
    t.step(1 / 30)
    expect(ran).toEqual(['a.before', 'b.before', 'kid.before', 'a.tick', 'b.tick', 'kid.tick', 'a.after', 'b.after', 'kid.after'])
  }
})

test('a row ended during a step runs nothing more, in that pass or the ones after it', () => {
  const ran: string[] = []
  const hooks = (name: string) => ({ before: () => { ran.push(`${name}.before`) }, tick: () => { ran.push(`${name}.tick`) }, after: () => { ran.push(`${name}.after`) } })
  const t = bootWith({ a: { ...hooks('a'), tick: (_me, _dt, w) => { ran.push('a.tick'); w.end(w.get(2)) } }, b: hooks('b') })
  t.step(1 / 30)
  expect(ran).toEqual(['a.before', 'b.before', 'a.tick', 'a.after'])
  expect(t.rows.map(r => r.kind)).toEqual(['a'])
})

// A truth saved between steps and loaded into another booted from the same scene steps on as the
// first does: the same rows, the same rolls of the die, the same ids for what it spawns, and the
// messages its seats held for later answered on their steps, across JSON as a socket carries it.
test('a truth loaded from another\'s save steps on exactly as that one does', () => {
  const sim: Sim = {
    a: {
      tick: (me, _dt, w) => { me.data.x = (me.data.x ?? 0) + w.die(); if (w.die() < 0.3) w.spawn('kid', { at: me.data.x }) },
      acts: { push: (me, _w, _seat, by) => { me.data.x += by } },
    },
    b: {},
    kid: { tick: (me, _dt, w) => { if (++me.data.age > 3) w.end(me) } },
  }
  const scene = { world: { seed: 5 }, prefabs: { a: {}, b: {}, kid: { age: 0 } }, actors: [{ is: 'a' }, { is: 'b' }] }
  const one = boot(structuredClone(scene), sim)
  one.open(1)
  for (let i = 0; i < 20; i++) one.step(1 / 30)
  one.inbox(0, { seq: 1, n: 24, id: 1, action: 'push', args: [10] })
  const two = boot(structuredClone(scene), sim)
  two.load(JSON.parse(JSON.stringify(one.save())))
  expect(two.n).toBe(20)
  for (let i = 0; i < 20; i++) {
    one.step(1 / 30)
    two.step(1 / 30)
    expect(two.rows).toEqual(one.rows)
  }
  expect(one.rows.find(r => r.kind === 'kid')).toBeDefined()
  expect(two.packet(0)).toEqual(one.packet(0))
})

// Ids. What a seat's message spawns, through the act it asks for and anything that act calls, takes
// that seat's own next id; what a hook spawns, or a spawn from outside a step, takes the truth's. So
// two seats' presses taken in either order, or one of them a step earlier, give every row the same id,
// and a truth loaded from a save goes on handing out the ids the saved one would.
test('a row a seat\'s message spawns takes that seat\'s own id, whatever another seat spawned, in any order', () => {
  const sim: Sim = {
    a: {
      tick: (me, _dt, w) => { if (++me.data.t % 3 === 0) w.spawn('kid') },
      // `a.fire` spawns through a call to another act, `b.fire` straight off.
      acts: { fire: (me, w) => { w.call(me, 'shoot', 0) }, shoot: (_me, w) => { w.spawn('kid') } },
      open: ['fire'],
    },
    b: { acts: { fire: (_me, w) => { w.spawn('kid') } }, open: ['fire'] },
    kid: {},
  }
  const scene = { prefabs: { a: { t: 0 }, b: {}, kid: {} }, actors: [{ is: 'a' }, { is: 'b' }] }
  // Seat 0 fires `a` on step 2; seat 1 fires `b` on step `at`.
  const run = (at: number, first: 0 | 1) => {
    const t = boot(structuredClone(scene), sim)
    t.open()
    t.open()
    const press = [() => t.inbox(0, { seq: 1, n: 2, id: 1, action: 'fire', args: [] }), () => t.inbox(1, { seq: 1, n: at, id: 2, action: 'fire', args: [] })]
    press[first]()
    press[1 - first]()
    for (let i = 0; i < 8; i++) t.step(1 / 30)
    return t
  }
  const ids = (t: ReturnType<typeof run>) => t.rows.filter(r => r.kind === 'kid').map(r => r.id).sort((x, y) => x - y)
  const seat = (i: number, k: number) => 2 ** 40 + i * 2 ** 32 + k
  // The hook's kids take the truth's ids from 3, after the two actors; each seat's its own.
  const want = [3, 4, seat(0, 1), seat(1, 1)]
  expect(ids(run(2, 0))).toEqual(want)
  expect(ids(run(2, 1))).toEqual(want)
  // Seat 1's press a step earlier, as a late press put back on its step: no row's id moves.
  expect(ids(run(1, 0))).toEqual(want)
  // A spawn from outside a step takes the truth's next id.
  const t = run(2, 0)
  expect(t.spawn('kid').id).toBe(5)
  // A truth loaded from a save goes on with every seat's count where the saved one had it.
  const two = boot(structuredClone(scene), sim)
  two.load(JSON.parse(JSON.stringify(t.save())))
  two.inbox(0, { seq: 2, n: two.n, id: 1, action: 'fire', args: [] })
  two.step(1 / 30)
  expect(ids(two)).toContain(seat(0, 2))
})

test('a row spawned by an act answered as the step begins, or between steps, runs that step', () => {
  const ran: string[] = []
  const t = bootWith({ a: { tick: () => { ran.push('a.tick') }, acts: { make: (_me, w) => { w.spawn('kid') } }, open: ['make'] }, b: {}, kid: { before: () => { ran.push('kid.before') }, tick: () => { ran.push('kid.tick') } } })
  t.open()
  t.inbox(0, { seq: 1, n: 0, id: 1, action: 'make', args: [] })
  t.step(1 / 30)
  expect(ran).toEqual(['kid.before', 'a.tick', 'kid.tick'])
  ran.length = 0
  t.spawn('kid')
  t.step(1 / 30)
  expect(ran).toEqual(['kid.before', 'kid.before', 'a.tick', 'kid.tick', 'kid.tick'])
})
