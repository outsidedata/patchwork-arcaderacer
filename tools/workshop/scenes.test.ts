// The workshop's scene edits on scene text the test writes in both layouts a game's files use: one
// laid out by JSON.stringify, every array a number a line, and one laid by hand, an asset entry and
// its number arrays on one line. Writing the same hold leaves the text byte for byte; a new hold
// changes its numbers only; a body that does not hold the model gets the entry; ik3d is added to
// a scene that has none (in its plugins after anim, and world.ik3d with anim's body mod) and
// replaced in one that has it; a catalogue entry is added, kept, or refused; a scene that does
// not draw the body or have the model is left alone; and a box3dvehicle vehicle's look points, in a
// manager laid out by JSON.stringify with its points laid by hand, written in place (the same numbers
// byte for byte), turned, added, and left alone in a file that gives no such look.
import { expect, test } from 'vitest'
import { catalogue, fit, listed, points, spans } from './scenes.ts'

const spread = JSON.stringify({
  world: {
    loader: { assets: { rifle: { type: 'model', url: '/games/g/assets/rifle.glb' }, xbot: { type: 'model', url: '/games/g/assets/xbot.glb' } } },
    anim: { kinds: { xbot: { rig: 'rig', model: 'xbot', props: [{ model: 'rifle', bone: 'RightHand', at: [-0.003, 0.05, 0.014], turn: [92.5, 36, -96.3] }] }, ybot: { rig: 'rig', model: 'ybot' } } },
  },
  plugins: ['loader', 'anim', 'render3d'],
}, null, 2) + '\n'

const byHand = `{
  "world": {
    "loader": {
      "assets": {
        "rifle": { "type": "model", "url": "/games/g/assets/rifle.glb" },
        "rig": { "type": "json", "url": "/games/g/assets/rig.json" }
      }
    },
    "anim": {
      "kinds": {
        "xbot": { "rig": "rig", "model": "xbot", "props": [{ "model": "rifle", "bone": "RightHand", "at": [0, 0.1, 0], "turn": [90, 0, 0] }] }
      }
    }
  },
  "plugins": ["loader", "anim", "render3d"]
}
`

const parse = (t: string) => JSON.parse(t)
const IK = { anchor: { prop: 'rifle', bone: 'RightShoulder', at: [0.01, 0.2, -0.07], turn: [-96, -40, 26], point: 'stock' }, limbs: [{ bones: ['RightArm', 'RightForeArm', 'RightHand'], prop: 'rifle', target: 'grip', pole: [-1, -1, 0] }] }

test('the same hold leaves the file byte for byte, in either layout', () => {
  expect(fit(spread, { body: 'xbot', prop: 'rifle', hold: { bone: 'RightHand', at: [-0.003, 0.05, 0.014], turn: [92.5, 36, -96.3] } })).toBe(spread)
  expect(fit(byHand, { body: 'xbot', prop: 'rifle', hold: { bone: 'RightHand', at: [0, 0.1, 0], turn: [90, 0, 0] } })).toBe(byHand)
})

test('a new hold changes the numbers and nothing else, each array in its own layout', () => {
  const t = fit(spread, { body: 'xbot', prop: 'rifle', hold: { bone: 'RightHand', at: [0.0033, 0.1072, 0.0122], turn: [91.56, 27.38, -95.79] } })!
  expect(parse(t).world.anim.kinds.xbot.props).toEqual([{ model: 'rifle', bone: 'RightHand', at: [0.0033, 0.1072, 0.0122], turn: [91.56, 27.38, -95.79] }])
  expect(t.replace(/0\.0033|0\.1072|0\.0122|91\.56|27\.38|-95\.79/g, 'N')).toBe(spread.replace(/-0\.003(?=,)|0\.05(?=,)|0\.014(?=\n)|92\.5|\b36\b(?=,)|-96\.3/g, 'N'))
  const h = fit(byHand, { body: 'xbot', prop: 'rifle', hold: { bone: 'RightHand', at: [0.01, 0.12, 0], turn: [88, 1, 2] } })!
  expect(h).toBe(byHand.replace('[0, 0.1, 0]', '[0.01, 0.12, 0]').replace('[90, 0, 0]', '[88, 1, 2]'))
})

test('a body that does not hold the model is given the entry, in the file\'s layout', () => {
  const t = fit(spread, { body: 'ybot', prop: 'rifle', hold: { bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] } })!
  expect(parse(t).world.anim.kinds.ybot.props).toEqual([{ model: 'rifle', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }])
  expect(parse(t).world.anim.kinds.xbot).toEqual(parse(spread).world.anim.kinds.xbot)
  expect(t).toContain('"at": [\n')
})

test('ik3d is added to a scene that has none: listed after anim, and world.ik3d with anim\'s body mod', () => {
  for (const text of [spread, byHand]) {
    const t = fit(text, { body: 'xbot', prop: 'rifle', ik: IK })!
    const s = parse(t)
    expect(s.plugins).toEqual(['loader', 'anim', 'ik3d', 'render3d'])
    expect(s.world.ik3d).toEqual({ mods: { body: 'anim' }, kinds: { xbot: IK } })
    expect({ ...s.world, ik3d: undefined }).toEqual({ ...parse(text).world, ik3d: undefined })
  }
  // The hand-laid file keeps its plugins on one line and its arrays of numbers on one line.
  const h = fit(byHand, { body: 'xbot', prop: 'rifle', ik: IK })!
  expect(h).toContain('"plugins": ["loader", "anim", "ik3d", "render3d"]')
  expect(h).toContain('"at": [0.01, 0.2, -0.07]')
})

test('ik3d already there is replaced for the body, and another body\'s is added beside it', () => {
  const once = fit(spread, { body: 'xbot', prop: 'rifle', ik: IK })!
  const moved = { ...IK, anchor: { ...IK.anchor, at: [0.02, 0.21, -0.06] } }
  const twice = fit(once, { body: 'xbot', prop: 'rifle', ik: moved })!
  expect(parse(twice).world.ik3d.kinds.xbot).toEqual(moved)
  expect(parse(twice).plugins).toEqual(['loader', 'anim', 'ik3d', 'render3d'])
  const withHold = fit(twice, { body: 'ybot', prop: 'rifle', hold: { bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }, ik: IK })!
  expect(parse(withHold).world.ik3d.kinds).toEqual({ xbot: moved, ybot: IK })
  expect(fit(withHold, { body: 'xbot', prop: 'rifle', ik: moved })).toBe(withHold)
})

test('a hold is written only into a file whose own anim kinds have the body', () => {
  const hold = { bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }
  expect(fit(spread, { body: 'zbot', prop: 'rifle', hold })).toBeUndefined()
  expect(fit('{"world": {}, "plugins": []}', { body: 'xbot', prop: 'rifle', hold })).toBeUndefined()
})

test('an IK is written into a partial, which has no plugins, and a scene of it is given ik3d by listed', () => {
  const partial = '{\n  "world": {\n    "anim": {\n      "kinds": {\n        "xbot": { "rig": "rig", "model": "xbot" }\n      }\n    }\n  }\n}\n'
  const t = fit(partial, { body: 'xbot', prop: 'rifle', ik: IK })!
  expect(parse(t).world.ik3d).toEqual({ mods: { body: 'anim' }, kinds: { xbot: IK } })
  expect(parse(t).plugins).toBeUndefined()
  expect(listed(partial)).toBeUndefined()
  expect(listed('{"plugins": ["loader", "anim", "render3d"]}')).toBe('{"plugins": ["loader", "anim", "ik3d", "render3d"]}')
  expect(listed('{\n  "plugins": [\n    "anim",\n    "render3d"\n  ]\n}')).toBe('{\n  "plugins": [\n    "anim",\n    "ik3d",\n    "render3d"\n  ]\n}')
  expect(listed('{"plugins": ["anim", "ik3d"]}')).toBeUndefined()
  expect(listed('{"plugins": ["loader"]}')).toBeUndefined()
})

test('a catalogue entry is added to a scene that draws with anim, kept when it is there, refused when its key names another file', () => {
  const entry = { type: 'model', url: '/games/g/assets/smg.glb' }
  const t = catalogue(byHand, 'smg', entry)!
  expect(parse(t).world.loader.assets.smg).toEqual(entry)
  expect(t).toContain('"smg": { "type": "model", "url": "/games/g/assets/smg.glb" }')
  expect(catalogue(t, 'smg', entry)).toBeUndefined()
  expect(() => catalogue(t, 'smg', { type: 'model', url: '/games/g/assets/other.glb' })).toThrow(/another smg/)
  expect(catalogue('{"world": {"loader": {"assets": {}}}}', 'smg', entry)).toBeUndefined()
})

// A manager scene laid as a game's is: JSON.stringify's layout, every array a number a line, and a
// vehicle's look points laid by hand, a point a line.
const fleet = JSON.stringify({ world: { box3dvehicle: { chassis: 'car', vehicles: { jeep: { body: { length: 3.6, center: [0.1, -0.2, 0] }, look: { lock: 2, points: {} } }, cart: { body: { length: 2 }, look: { lock: 1.5 } } } } } }, null, 2)
  .replace('"points": {}', `"points": {
              "seat": [-0.7885, -0.046, -0.325],
              "gripL": { "at": [0.0538, 0.5052, -0.4722], "part": "steer", "turn": [-0.156794, 0.689504, -0.518731, 0.48054] },
              "footL": [-0.0385, -0.19, -0.425],
              "knee": { "at": [0.1, 0.2, -0.3], "part": "steer" }
            }`) + '\n'

test('a vehicle\'s points: the same numbers leave the file byte for byte', () => {
  const same = {
    empties: { seat: [-0.7885, -0.046, -0.325], gripL: [0.0538, 0.5052, -0.4722], footL: [-0.0385, -0.19, -0.425], knee: [0.1, 0.2, -0.3] },
    turns: { gripL: [-0.156794, 0.689504, -0.518731, 0.48054] },
  }
  expect(points(fleet, 'jeep', same)).toBe(fleet)
})

test('a vehicle\'s points moved and turned in place, each laid as it stood', () => {
  const t = points(fleet, 'jeep', { empties: { seat: [-0.8, -0.05, -0.33], gripL: [0.06, 0.5, -0.47] }, turns: { gripL: [0, 0, 0, 1] } })!
  expect(t).toBe(fleet
    .replace('"seat": [-0.7885, -0.046, -0.325]', '"seat": [-0.8, -0.05, -0.33]')
    .replace('"at": [0.0538, 0.5052, -0.4722], "part": "steer", "turn": [-0.156794, 0.689504, -0.518731, 0.48054]', '"at": [0.06, 0.5, -0.47], "part": "steer", "turn": [0, 0, 0, 1]'))
  // A bare point turned becomes `{ at, turn }` where it stood; an object with no turn is given one last.
  const u = points(fleet, 'jeep', { turns: { footL: [0, 0.7071, 0, 0.7071], knee: [0.5, 0, 0, 0.866] } })!
  expect(u).toBe(fleet
    .replace('"footL": [-0.0385, -0.19, -0.425]', '"footL": { "at": [-0.0385, -0.19, -0.425], "turn": [0, 0.7071, 0, 0.7071] }')
    .replace('"knee": { "at": [0.1, 0.2, -0.3], "part": "steer" }', '"knee": { "at": [0.1, 0.2, -0.3], "part": "steer", "turn": [0.5, 0, 0, 0.866] }'))
  expect(parse(u).world.box3dvehicle.vehicles.jeep.look.points.knee).toEqual({ at: [0.1, 0.2, -0.3], part: 'steer', turn: [0.5, 0, 0, 0.866] })
})

test('a vehicle\'s new point is added a line of its own, and a look with no points is given them', () => {
  const t = points(fleet, 'jeep', { empties: { hip: [0, 0.3, -0.3] } })!
  expect(t).toBe(fleet.replace('"knee": { "at": [0.1, 0.2, -0.3], "part": "steer" }', '"knee": { "at": [0.1, 0.2, -0.3], "part": "steer" },\n              "hip": [0, 0.3, -0.3]'))
  const c = points(fleet, 'cart', { empties: { seat: [-0.46, 0.067, -0.2875] } })!
  expect(parse(c).world.box3dvehicle.vehicles.cart.look).toEqual({ lock: 1.5, points: { seat: [-0.46, 0.067, -0.2875] } })
  expect(parse(c).world.box3dvehicle.vehicles.jeep).toEqual(parse(fleet).world.box3dvehicle.vehicles.jeep)
})

test('a vehicle\'s points: a file whose own world gives no such look is left, and a turn of a point it has not throws', () => {
  expect(points(fleet, 'truck', { empties: { seat: [0, 0, 0] } })).toBeUndefined()
  expect(points(byHand, 'jeep', { empties: { seat: [0, 0, 0] } })).toBeUndefined()
  expect(() => points(fleet, 'jeep', { turns: { tail: [0, 0, 0, 1] } })).toThrow(/jeep's look has no point tail/)
})

test('spans keeps every value\'s place in the text', () => {
  const s = spans('{ "a": [1, "x\\"y"], "b": { "c": null } }')
  expect(s.kind).toBe('object')
  const a = (s as any).entries[0][1]
  expect('{ "a": [1, "x\\"y"], "b": { "c": null } }'.slice(a.from, a.to)).toBe('[1, "x\\"y"]')
})
