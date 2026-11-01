// A solids model's file edited in place: a hand-laid machine (each node on one line, no spaces), a
// spaced one, and a module whose points are `empties`. The same numbers write the same bytes; a moved
// node changes only its own line; a turn is replaced, added after `at`, or left out when it is none;
// a node and an empty are added in the file's own style; what is not a frame is refused.
import { expect, test } from 'vitest'
import { framesOf, setFrames, solid } from './solids.ts'

const MACHINE = `{
  "paints": {
    "hull": {"colour":"#8e98a4","roughness":0.6}
  },
  "nodes": {
    "pelvis": {"at":[0,2.6,0]},
    "torso": {"parent":"pelvis","at":[0,0.3,0]},
    "L1": {"parent":"torso","at":[0.8,1.005,0]},
    "B1": {"parent":"torso","at":[0.4,0.675,-0.825],"turn":[-0.2537,0]},
    "R1": {"parent":"torso","at":[-0.8,0.975,0.35],"mirror":true}
  },
  "body": "pelvis",
  "parts": [
    {"node":"pelvis","paint":"hull","loft":{"axis":"y","from":0,"to":1,"a":[0,0,1,1]}}
  ]
}
`
const SPACED = `{
  "paints": { "hull": { "colour": "#888" } },
  "nodes": {
    "base": { "at": [0, 0, 0] },
    "lid": { "parent": "base", "at": [0, 1, 0] }
  },
  "parts": []
}
`
const MODULE = `{
  "paints": {
    "mod": {"colour":"#5f6b78"}
  },
  "empties": {
    "muzzle": [0.35,0,1.4]
  },
  "parts": [
    {"node":"body","paint":"mod","prism":{"axis":"z","from":0,"to":1,"at":[0,0],"r":[0.1,0.1],"sides":6}}
  ]
}
`

test('a solids model is paints and parts; its frames are its nodes, each with a turn, and its empties', () => {
  expect(solid(JSON.parse(MACHINE))).toBe(true)
  expect(solid(JSON.parse(MODULE))).toBe(true)
  expect(solid({ paints: {} })).toBe(false)
  expect(solid({ loader: {} })).toBe(false)
  expect(solid([1])).toBe(false)
  const f = framesOf(JSON.parse(MACHINE))
  expect(f.nodes.pelvis).toEqual({ at: [0, 2.6, 0], turn: [0, 0] })
  expect(f.nodes.B1).toEqual({ parent: 'torso', at: [0.4, 0.675, -0.825], turn: [-0.2537, 0] })
  expect(f.nodes.R1).toEqual({ parent: 'torso', at: [-0.8, 0.975, 0.35], turn: [0, 0], mirror: true })
  expect(f.empties).toEqual({})
  expect(framesOf(JSON.parse(MODULE))).toEqual({ nodes: {}, empties: { muzzle: [0.35, 0, 1.4] }, turns: {} })
})

// A seat's empties: a bare point, one riding a part, and one already turned.
const SEAT = `{
  "paints": {"hull": {"colour":"#888"}},
  "empties": {
    "seat": [0,0.014,-0.04],
    "gripL": {"at":[0.3,0.72,0.3],"part":"stickL"},
    "footL": {"at":[0.13,0.08,0.42],"turn":[0,0,0,1]}
  },
  "parts": []
}
`

test('an empty turned: its quaternion written in place, added after its at, or a bare point made { at, turn }, each in its own style, and read back', () => {
  const q = [0.1, 0.2, 0.3, 0.927362]
  const now = setFrames(SEAT, { turns: { seat: q, gripL: q, footL: q } })
  expect(now).toContain('    "seat": {"at":[0,0.014,-0.04],"turn":[0.1,0.2,0.3,0.9274]},\n')
  expect(now).toContain('    "gripL": {"at":[0.3,0.72,0.3],"turn":[0.1,0.2,0.3,0.9274],"part":"stickL"},\n')
  expect(now).toContain('    "footL": {"at":[0.13,0.08,0.42],"turn":[0.1,0.2,0.3,0.9274]}\n')
  const f = framesOf(JSON.parse(now))
  expect(f.turns).toEqual({ seat: [0.1, 0.2, 0.3, 0.9274], gripL: [0.1, 0.2, 0.3, 0.9274], footL: [0.1, 0.2, 0.3, 0.9274] })
  expect(f.empties.gripL).toEqual([0.3, 0.72, 0.3])
  // Moved after it is turned, the point keeps its turn and its part.
  expect(JSON.parse(setFrames(now, { empties: { gripL: [0.31, 0.7, 0.3] } })).empties.gripL).toEqual({ at: [0.31, 0.7, 0.3], turn: [0.1, 0.2, 0.3, 0.9274], part: 'stickL' })
  expect(setFrames(SEAT, { turns: { footL: [0, 0, 0, 1] } })).toBe(SEAT)
  expect(() => setFrames(SEAT, { turns: { seat: [0, 0, 1] } })).toThrow(/not a quaternion/)
  expect(() => setFrames(SEAT, { turns: { roof: q } })).toThrow(/no empty roof/)
})

test('the same numbers write the same bytes', () => {
  const f = framesOf(JSON.parse(MACHINE))
  expect(setFrames(MACHINE, { nodes: Object.fromEntries(Object.entries(f.nodes).map(([n, x]) => [n, { at: x.at, turn: x.turn }])) })).toBe(MACHINE)
  expect(setFrames(MODULE, { empties: { muzzle: [0.35, 0, 1.4] } })).toBe(MODULE)
  expect(setFrames(SPACED, { nodes: { lid: { at: [0, 1, 0], turn: [0, 0] } } })).toBe(SPACED)
})

test('a moved node changes its own line alone, in its own style', () => {
  const now = setFrames(MACHINE, { nodes: { L1: { at: [0.81234567, 1.1, -0.00001], turn: [0, 0.5] } } })
  const was = MACHINE.split('\n'), is = now.split('\n')
  expect(is.length).toBe(was.length)
  const changed = is.map((l, i) => [l, was[i]]).filter(([a, b]) => a !== b)
  expect(changed).toEqual([['    "L1": {"parent":"torso","at":[0.8123,1.1,0],"turn":[0,0.5]},', '    "L1": {"parent":"torso","at":[0.8,1.005,0]},']])
  const turned = setFrames(MACHINE, { nodes: { B1: { at: [0.4, 0.675, -0.825], turn: [-0.3, 0.1] } } })
  expect(turned).toContain('"B1": {"parent":"torso","at":[0.4,0.675,-0.825],"turn":[-0.3,0.1]},')
  const spaced = setFrames(SPACED, { nodes: { lid: { at: [0, 1.25, 0], turn: [0.1, 0] } } })
  expect(spaced).toContain('"lid": { "parent": "base", "at": [0, 1.25, 0], "turn": [0.1, 0] }')
  expect(JSON.parse(spaced).nodes.lid).toEqual({ parent: 'base', at: [0, 1.25, 0], turn: [0.1, 0] })
})

test('a node and an empty are added last, laid as their neighbours are', () => {
  const now = setFrames(MACHINE, { nodes: { grip: { parent: 'torso', at: [0, 0.5, 0.2], turn: [0, 0] } } })
  expect(now).toContain('    "R1": {"parent":"torso","at":[-0.8,0.975,0.35],"mirror":true},\n    "grip": {"parent":"torso","at":[0,0.5,0.2]}\n  },')
  expect(JSON.parse(now).nodes.grip).toEqual({ parent: 'torso', at: [0, 0.5, 0.2] })
  const spaced = setFrames(SPACED, { nodes: { hinge: { parent: 'lid', at: [0, 0, -0.5], turn: [1.5708, 0] } } })
  expect(spaced).toContain('"lid": { "parent": "base", "at": [0, 1, 0] },\n    "hinge": { "parent": "lid", "at": [0, 0, -0.5], "turn": [1.5708, 0] }\n  },')
  const empty = setFrames(MODULE, { empties: { smoke: [0, 0.2, -0.3] } })
  expect(empty).toContain('    "muzzle": [0.35,0,1.4],\n    "smoke": [0,0.2,-0.3]\n  },')
  const fresh = setFrames(SPACED, { empties: { tip: [0, 2, 0] } })
  expect(JSON.parse(fresh).empties).toEqual({ tip: [0, 2, 0] })
  expect(fresh.endsWith('"parts": [],\n  "empties": { "tip": [0, 2, 0] }\n}\n')).toBe(true)
})

test('what is not a frame is refused', () => {
  expect(() => setFrames(MACHINE, { nodes: { L1: { at: [0, 0] } } })).toThrow(/three numbers/)
  expect(() => setFrames(MACHINE, { nodes: { L1: { at: [0, 0, 0], turn: [0, 0, 0] } } })).toThrow(/two numbers/)
  expect(() => setFrames(MACHINE, { nodes: { 'a b': { at: [0, 0, 0] } } })).toThrow(/not a node's name/)
  expect(() => setFrames(MACHINE, { nodes: { new: { parent: 'nowhere', at: [0, 0, 0] } } })).toThrow(/does not have/)
  expect(() => setFrames(MODULE, { nodes: { new: { at: [0, 0, 0] } } })).toThrow(/no nodes/)
  expect(() => setFrames(MODULE, { empties: { muzzle: [0, Number.NaN, 0] } })).toThrow(/three numbers/)
})
