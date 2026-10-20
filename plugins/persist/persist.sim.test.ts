// The rule side of persist: `claim` writes a request onto the truth's `persist` row, keyed by the
// kind and the match, and nothing else. The test boots a scene it writes: a `persist` row loading
// `hero` by claim and `note` at boot, and a `desk` whose open act `ask` claims an account's heroes.
// Loading them is the addon's (`addons/persist/persist.addon.test.ts`); no addon is attached here.
import { expect, test } from 'vitest'
import { boot, type Scene, type Sim } from '#engine/engine.ts'
import { claim, persist } from './persist.sim.ts'

const scene = (): Scene => ({
  prefabs: {
    persist: { kinds: { hero: { key: 'uid', load: 'claim' }, note: { key: 'uid', load: 'boot' } }, every: 1, claims: {} },
    hero: { uid: '', account: '' },
    note: { uid: '' },
    desk: {},
  },
  actors: [{ is: 'persist' }, { is: 'desk' }],
})

const sim: Sim = {
  persist,
  hero: {},
  note: {},
  desk: { acts: { ask: (_me, w, _seat, kind: string, ...match) => claim(w, kind, Object.fromEntries(match.map(m => m.split('=')))) }, open: ['ask'] },
}

const start = () => {
  const truth = boot(scene(), sim)
  const seat = truth.open()
  let seq = 0
  const desk = truth.rows.find(r => r.kind === 'desk')!
  const ask = (...args: string[]) => truth.inbox(seat, { seq: ++seq, n: truth.n, id: desk.id, action: 'ask', args })
  const claims = () => truth.rows.find(r => r.kind === 'persist')!.data.claims
  return { truth, ask, claims }
}

test('a claim is written onto the persist row as its kind and match, and the persist kind does nothing a step', () => {
  const { truth, ask, claims } = start()
  ask('hero', 'account=a1')
  truth.step(1 / 60)
  expect(Object.values(claims())).toEqual([{ kind: 'hero', match: { account: 'a1' } }])
  truth.step(1 / 60)
  expect(Object.values(claims())).toEqual([{ kind: 'hero', match: { account: 'a1' } }])
})

test('the same claim asked twice, its fields in either order, is one request, and another match is another', () => {
  const { truth, ask, claims } = start()
  ask('hero', 'account=a1', 'realm=east')
  ask('hero', 'realm=east', 'account=a1')
  ask('hero', 'account=a2')
  truth.step(1 / 60)
  expect(Object.keys(claims()).length).toBe(2)
  expect(Object.values(claims())).toContainEqual({ kind: 'hero', match: { account: 'a2' } })
})

test('a kind the row loads at boot, or does not declare, cannot be claimed', () => {
  for (const kind of ['note', 'desk']) {
    const { truth, ask, claims } = start()
    ask(kind)
    expect(() => truth.step(1 / 60)).toThrow(`persist loads no ${kind} by claim`)
    expect(claims()).toEqual({})
  }
})
