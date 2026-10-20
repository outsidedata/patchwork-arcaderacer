// The workshop's server on a root the test writes in a temp folder: two games, `range` with a manager
// scene naming two scenes (`yard` and `field`, both drawing the body `soldier` holding a `gun`, the
// field's IK unlike the yard's), `camp` with one scene of its own and a body that holds nothing, and
// `works`, a game of solids models, `ridge`, two scenes on a partial, and `pass`, a partial whose scenes
// do not all have the prop. Each scene has its sim, so it is loaded as the game loads it. Each glb is a JSON-only glb the test builds. The game list; a
// game read from its files, its models, bodies, what they hold and where they drift; its solids models,
// how it finds each and how the page draws it; notes on a glb and on a solids model; a solids model's
// frames written in place; notes added, read and patched; points written
// into a glb and read back; a fit written into every scene that draws the body; a model brought from
// one game to another; `hangar`'s interaction summarised, written into its file and refused out of
// shape; `motor`'s cars, each vehicle of its fleet a machine with the interactions of the kind
// box3dvehicle, and a vehicle's look points read and written into the manager in place; a pack clip
// baked into a rig through a Blender the test writes; a refused path of every kind;
// a `.ts` served stripped; the packs; and a `changed` event after a file of a game is written.
import { afterAll, beforeAll, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { start } from './workshop.server.ts'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workshop-'))
let server: { url: string; close(): Promise<void> }
let url = ''

// A glb of one node `body`, a mesh's, and the given empties, with no binary chunk.
function glb(empties: Record<string, number[]> = {}) {
  const nodes: Record<string, unknown>[] = [{ name: 'body', mesh: 0 }, ...Object.entries(empties).map(([name, t]) => ({ name, translation: t }))]
  const json = { asset: { version: '2.0' }, scenes: [{ nodes: nodes.map((_, i) => i) }], scene: 0, nodes }
  let text = Buffer.from(JSON.stringify(json))
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const head = Buffer.alloc(20)
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + text.length, 8)
  head.writeUInt32LE(text.length, 12); head.writeUInt32LE(0x4e4f534a, 16)
  return Buffer.concat([head, text])
}
const write = (rel: string, data: string | Buffer) => {
  const full = path.join(root, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, data)
}
const IK = { anchor: { prop: 'gun', bone: 'RightShoulder', at: [0, 0, 0], turn: [0, 0, 0], point: 'stock' }, limbs: [] }
const sceneOf = (ik?: unknown) => JSON.stringify({
  world: {
    loader: { assets: { gun: { type: 'model', url: '/games/range/assets/gun.glb' }, soldier: { type: 'model', url: '/games/range/assets/soldier.glb' } } },
    anim: { still: 0.05, kinds: { soldier: { rig: 'rig', model: 'soldier', props: [{ model: 'gun', bone: 'RightHand', at: [0, 0.1, 0], turn: [90, 0, 0] }] } } },
    ...(ik ? { ik3d: { mods: { body: 'anim' }, kinds: { soldier: ik } } } : {}),
  },
  prefabs: { render3d: { tone: 'neutral', camera: { fov: 60, near: 0.1, far: 100, at: [0, 2, 5], look: [0, 1, 0] } } },
  plugins: ['loader', 'anim', 'render3d'],
  actors: [],
}, null, 2) + '\n'
// A scene's sim, as every game's: it imports its scene file and exports it, which is how scenemanager's
// `child` reads a scene.
const simOf = (name: string) => `import scene from './${name}.scene.json' with { type: 'json' }\nexport { scene }\nexport const sim = {}\n`
// ridge: two scenes on one partial, `ridge.partial_scene.json`, which holds the catalogue, the body
// and its IK. `dawn` gives its own IK for the soldier and lists ik3d; `dusk` gives only a catalogue
// entry of its own and lists no ik3d.
const PARTIAL = JSON.stringify({
  world: {
    loader: { assets: { gun: { type: 'model', url: '/games/ridge/assets/gun.glb' }, soldier: { type: 'model', url: '/games/ridge/assets/soldier.glb' } } },
    anim: { kinds: { soldier: { rig: 'rig', model: 'soldier', props: [{ model: 'gun', bone: 'RightHand', at: [0, 0.1, 0], turn: [90, 0, 0] }] } } },
    ik3d: { mods: { body: 'anim' }, kinds: { soldier: IK } },
  },
  prefabs: { render3d: { tone: 'neutral' } },
}, null, 2) + '\n'
const DAWN_IK = { ...IK, anchor: { ...IK.anchor, at: [0, 0.2, 0] } }
// hangar's interaction: a worker climbs a walker at its `board` point and sits in its chair, holding.
const BOARD = {
  body: 'worker',
  steps: [
    { name: 'climb', clip: 'climb', at: 'board', turn: 90 },
    { name: 'seated', clip: 'pilot', at: 'seat', hold: true, ik: [{ bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], target: 'gripL', pole: [1, -1, 0] }] },
  ],
}

// motor's interaction: a driver gets into a car's seat, walking into it, and sits, hands on the wheel.
const ENTER = {
  body: 'driver',
  steps: [
    { name: 'in', clip: 'enter', at: 'seat', turn: 90, travel: 'to' },
    { name: 'seated', clip: 'drive', at: 'seat', turn: 90, hold: true, ik: [{ bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], target: 'gripL', pole: [1, -1, 0] }] },
  ],
}
// motor's manager: JSON.stringify's layout, but for the jeep's points, laid by hand a point a line. The
// jeep is drawn in code with an exhaust; the van is a model with none.
const MOTOR = JSON.stringify({
  world: {
    loader: { assets: {
      'box3dvehicle-enter': { type: 'json', url: '/games/motor/assets/box3dvehicle.enter.interaction.json' },
      van: { type: 'model', url: '/games/motor/assets/van.glb' },
      'driver-rig': { type: 'json', url: '/games/motor/assets/driver.rig.json' },
    } },
    box3dvehicle: {
      chassis: 'car', wheel: 'wheel', joint: 'axle',
      vehicles: {
        jeep: { body: { length: 3.6 }, look: { lock: 2, exhaust: [{ at: [-1.8, -0.2, 0.4], dir: [-1, 0, 0], pipe: 0.03, effect: 'smoke' }], points: {} } },
        van: { body: { length: 4.5 }, look: { lock: 2.5, model: { asset: 'van' } } },
      },
      mods: { gravity: 'box3d', land: 'terrain3d' },
    },
    particle3d: { effects: 'effects' },
    anim: { kinds: { driver: { rig: 'driver-rig', model: 'driver' } } },
    interact: { kinds: { box3dvehicle: { enter: 'box3dvehicle-enter' } }, mods: { point: 'box3dvehicle', object: 'box3dvehicle', body: 'anim' } },
  },
  prefabs: { scenemanager: { scenes: { lot: { file: 'lot.scene.json', suspend: false }, shed: { file: 'shed.scene.json', suspend: true } } } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
}, null, 2).replace('"points": {}', `"points": {
              "seat": [-0.7885, -0.046, -0.325],
              "gripL": { "at": [0.0538, 0.5052, -0.4722], "part": "steer", "turn": [-0.156794, 0.689504, -0.518731, 0.48054] }
            }`) + '\n'

beforeAll(async () => {
  write('games/range/yard.sim.ts', simOf('yard'))
  write('games/range/field.sim.ts', simOf('field'))
  write('games/works/shop.sim.ts', simOf('shop'))
  write('games/ridge/ridge.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: { dawn: { file: 'dawn.scene.json', suspend: true }, dusk: { file: 'dusk.scene.json', suspend: true } } } } }))
  write('games/ridge/ridge.partial_scene.json', PARTIAL)
  write('games/ridge/dawn.scene.json', JSON.stringify({ extends: 'ridge.partial_scene.json', plugins: ['loader', 'anim', 'ik3d', 'render3d'], world: { ik3d: { kinds: { soldier: DAWN_IK } } } }, null, 2) + '\n')
  write('games/ridge/dusk.scene.json', JSON.stringify({ extends: 'ridge.partial_scene.json', plugins: ['loader', 'anim', 'render3d'], world: { loader: { assets: { lamp: { type: 'model', url: '/games/ridge/assets/lamp.glb' } } } } }, null, 2) + '\n')
  write('games/ridge/dawn.sim.ts', simOf('dawn'))
  write('games/ridge/dusk.sim.ts', simOf('dusk'))
  write('games/ridge/assets/gun.glb', glb({ muzzle: [0, 0, -0.5] }))
  write('games/ridge/assets/soldier.glb', glb())
  write('games/ridge/assets/lamp.glb', glb())
  // pass: two scenes on a partial with the body, the gun only in `east`'s own catalogue: a fit would
  // write the hold into the partial, and `west` would hang a model it has not.
  write('games/pass/pass.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: { east: { file: 'east.scene.json', suspend: true }, west: { file: 'west.scene.json', suspend: true } } } } }))
  write('games/pass/pass.partial_scene.json', JSON.stringify({ world: { loader: { assets: { soldier: { type: 'model', url: '/games/pass/assets/soldier.glb' } } }, anim: { kinds: { soldier: { rig: 'rig', model: 'soldier' } } } } }, null, 2) + '\n')
  write('games/pass/east.scene.json', JSON.stringify({ extends: 'pass.partial_scene.json', plugins: ['loader', 'anim'], world: { loader: { assets: { gun: { type: 'model', url: '/games/pass/assets/gun.glb' } } } } }, null, 2) + '\n')
  write('games/pass/west.scene.json', JSON.stringify({ extends: 'pass.partial_scene.json', plugins: ['loader', 'anim'] }, null, 2) + '\n')
  write('games/pass/east.sim.ts', simOf('east'))
  write('games/pass/west.sim.ts', simOf('west'))
  write('games/range/range.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: true }, field: { file: 'field.scene.json', suspend: true } }, dt: 0.02 } } }))
  write('games/range/yard.scene.json', sceneOf(IK))
  write('games/range/field.scene.json', sceneOf({ ...IK, anchor: { ...IK.anchor, at: [0.1, 0, 0] } }))
  write('games/range/assets/gun.glb', glb({ muzzle: [0, 0, -0.5] }))
  write('games/range/assets/soldier.glb', glb())
  write('games/camp/camp.scene.json', JSON.stringify({
    world: { loader: { assets: { scout: { type: 'model', url: '/games/camp/assets/scout.glb' } } }, anim: { kinds: { scout: { rig: 'rig', model: 'scout' } } } },
    plugins: ['loader', 'anim', 'render3d'],
  }, null, 2) + '\n')
  write('games/camp/assets/scout.glb', glb())
  // works: a game of solids models. Its one scene finds `crate-model` through the solids plugin's
  // kinds, `walker-model` and `cab-model` through the definitions (`walker.model`, `walker.cabin.model`),
  // and has `loose-model` that nothing names; `table` is its definitions, a json that is no model.
  // `rig3d` and `hang3d` draw solids models, `hud` does not.
  write('games/works/works.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: { shop: { file: 'shop.scene.json', suspend: true } } } } }))
  write('games/works/shop.scene.json', JSON.stringify({
    world: {
      defs: 'table',
      loader: { assets: {
        table: { type: 'json', url: '/games/works/assets/table.json' },
        'crate-model': { type: 'json', url: '/games/works/assets/crate.model.json' },
        'walker-model': { type: 'json', url: '/games/works/assets/walker.model.json' },
        'cab-model': { type: 'json', url: '/games/works/assets/cab.model.json' },
        'loose-model': { type: 'json', url: '/games/works/assets/loose.model.json' },
      } },
      solids: { kinds: { crate: 'crate-model' }, mods: { land: 'terrain3d' } },
      shipped: { plugins: ['rig3d', 'hud', 'hang3d'] },
      rig3d: { mods: { land: 'terrain3d' } },
      hang3d: { mods: { node: 'rig3d', light: 'skydome3d', both: ['rig3d', 'skydome3d'] } },
    },
    prefabs: {},
    plugins: ['loader', 'terrain3d', 'solids', 'shipped', 'render3d'],
    actors: [],
  }, null, 2) + '\n')
  write('games/works/assets/table.json', JSON.stringify({ walker: { model: 'walker-model', cabin: { model: 'cab-model', node: 'torso' } }, crate: { tall: 1 } }))
  write('games/works/assets/crate.model.json', JSON.stringify({ paints: { wood: { colour: '#a07040' } }, nodes: { lid: { at: [0, 1, 0] } }, parts: [] }, null, 2) + '\n')
  write('games/works/assets/walker.model.json', '{\n  "paints": {"hull": {"colour":"#888"}},\n  "nodes": {\n    "pelvis": {"at":[0,2,0]},\n    "L1": {"parent":"pelvis","at":[0.8,1,0]}\n  },\n  "parts": []\n}\n')
  write('games/works/assets/cab.model.json', JSON.stringify({ paints: {}, parts: [], empties: { eye: [0, 0.5, 0] } }, null, 2) + '\n')
  write('games/works/assets/loose.model.json', JSON.stringify({ paints: {}, parts: [] }))
  write('games/works/plugins/rig3d/rig3d.plugin.ts', 'export function rig3d() { return { afterTick(plugins: any) { plugins.solids.meshes() } } }\n')
  write('games/works/plugins/hang3d/hang3d.plugin.ts', 'export function hang3d() { return { afterTick(p: any) { p.solids.meshes() } } }\n')
  write('games/works/plugins/hud/hud.plugin.ts', 'export function hud() { return {} }\n')
  // hangar: a game with an interaction. `drill` has it and builds no walker; `sortie` has it and its
  // `start` builds a walker fitted with a chair, so the summary takes the fit from `sortie`. The worker's
  // rig bakes one body, and Blender is a script the test writes (`BLENDER`), which writes the table it
  // is asked for and each glb, as anim's export would.
  write('games/hangar/hangar.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: { drill: { file: 'drill.scene.json', suspend: true }, sortie: { file: 'sortie.scene.json', suspend: true } } } } }))
  const hangarWorld = {
    defs: 'table',
    loader: { assets: {
      table: { type: 'json', url: '/games/hangar/assets/table.json' },
      'walker-board': { type: 'json', url: '/games/hangar/assets/walker.board.interaction.json' },
      'worker-rig': { type: 'json', url: '/games/hangar/assets/worker.rig.json' },
      worker: { type: 'model', url: '/games/hangar/assets/worker.glb' },
    } },
    anim: { kinds: { worker: { rig: 'worker-rig', model: 'worker' } } },
    interact: { kinds: { walker: { board: 'walker-board' } }, mods: { point: 'mount3d', object: 'mount3d' } },
  }
  write('games/hangar/drill.scene.json', JSON.stringify({ world: hangarWorld, prefabs: {}, plugins: ['loader', 'anim'], actors: [] }, null, 2) + '\n')
  write('games/hangar/sortie.scene.json', JSON.stringify({ world: hangarWorld, prefabs: {}, plugins: ['loader', 'anim'], actors: [{ is: 'start', mech: 'walker', fit: { S1: 'chair', B1: null } }] }, null, 2) + '\n')
  write('games/hangar/drill.sim.ts', simOf('drill'))
  write('games/hangar/sortie.sim.ts', simOf('sortie'))
  write('games/hangar/assets/table.json', JSON.stringify({ walker: { interact: { board: { climb: { kneel: 1 }, seated: { kneel: 0 } } } } }))
  write('games/hangar/assets/walker.board.interaction.json', JSON.stringify(BOARD, null, 2) + '\n')
  write('games/hangar/assets/worker.rig.json', JSON.stringify({ bodies: { worker: 'characters/worker.fbx' }, clips: { climb: { file: 'packs/Climb Pack/climb.fbx' }, pilot: { file: 'packs/Climb Pack/pilot.fbx' } }, table: {} }, null, 1) + '\n')
  write('games/hangar/assets/worker.glb', glb())
  write('packs/Sitting Pack/Stand To Sit.fbx', 'fbx')
  write('packs/Sitting Pack/Sit To Stand.fbx', 'fbx')
  write('bin/blender', '#!/bin/sh\nshift 5\ntable=$2\nshift 2\nprintf \'{"climb":{"dur":1},"pilot":{"dur":2},"standToSit":{"dur":1.5}}\' > "$table"\nfor o in "$@"; do printf baked > "${o#*=}"; done\n')
  fs.chmodSync(path.join(root, 'bin/blender'), 0o755)
  write('.claude/skills/using-mixamo-assets/scripts/merge-table.mjs', fs.readFileSync(new URL('../../.claude/skills/using-mixamo-assets/scripts/merge-table.mjs', import.meta.url), 'utf8'))
  // motor: a game of cars. Its manager gives the fleet, its points laid by hand a point a line, and
  // the interactions every scene has; `lot` lists box3dvehicle, particle3d and interact and makes its
  // cars; `shed` lists no box3dvehicle.
  write('games/motor/motor.scene.json', MOTOR)
  write('games/motor/lot.scene.json', JSON.stringify({ world: {}, prefabs: {}, plugins: ['loader', 'box3d', 'box3dvehicle', 'particle3d', 'anim', 'interact', 'ik3d', 'render3d'], actors: [{ is: 'spot', vehicle: 'jeep' }] }, null, 2) + '\n')
  write('games/motor/shed.scene.json', JSON.stringify({ world: {}, prefabs: {}, plugins: ['loader', 'anim', 'render3d'], actors: [] }, null, 2) + '\n')
  write('games/motor/lot.sim.ts', simOf('lot'))
  write('games/motor/shed.sim.ts', simOf('shed'))
  write('games/motor/assets/box3dvehicle.enter.interaction.json', JSON.stringify(ENTER, null, 2) + '\n')
  write('games/motor/assets/van.glb', glb())
  write('games/notagame/readme.txt', 'no manager scene here')
  write('tools/workshop/workshop.html', '<!doctype html><title>workshop</title>')
  write('tools/workshop/page.ts', 'const n: number = 1\nexport default n\n')
  write('plugins/demo/demo.plugin.ts', 'enum Way { Up }\nexport const way: Way = Way.Up\n')
  write('secret.txt', 'outside')
  write('packs/Rifle Pack/idle.fbx', 'fbx')
  write('packs/Rifle Pack/notes.txt', 'not a clip')
  server = await start({ port: 0, root, packs: path.join(root, 'packs') })
  url = server.url
})
afterAll(async () => {
  await server.close()
  fs.rmSync(root, { recursive: true })
})

const get = async (p: string) => { const r = await fetch(url + p); return { status: r.status, body: await r.text() } }
const json = async (p: string, init?: RequestInit) => { const r = await fetch(url + p, init); return { status: r.status, body: await r.json() } }
const post = (p: string, body: unknown, method = 'POST') => json(p, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const GUN = encodeURIComponent('games/range/assets/gun.glb')

test('the games: each folder of games/ with its manager scene', async () => {
  expect((await json('/api/games')).body).toEqual(['camp', 'hangar', 'motor', 'pass', 'range', 'ridge', 'works'])
})

test('scenes on a partial are read as the game loads them: what each has from its partial, under its own', async () => {
  const g = (await json('/api/game/ridge')).body
  expect(g.scenes).toEqual(['dawn', 'dusk'])
  expect(g.render3d.tone).toBe('neutral')
  expect(g.models.map((m: any) => [m.key, m.scenes])).toEqual([['gun', ['dawn', 'dusk']], ['soldier', ['dawn', 'dusk']], ['lamp', ['dusk']]])
  // dawn's own IK wins over the partial's; dusk has the partial's, so it drifts from dawn.
  expect(g.bodies).toEqual([{ kind: 'soldier', model: 'soldier', rig: 'rig', scenes: ['dawn', 'dusk'], drift: ['dusk'], props: [{ model: 'gun', bone: 'RightHand', at: [0, 0.1, 0], turn: [90, 0, 0] }], ik: DAWN_IK }])
})

test('a fit on scenes of a partial: the hold into the partial, each IK where it is given, ik3d into each scene\'s plugins', async () => {
  const hold = { bone: 'RightHand', at: [0.02, 0.1, 0], turn: [80, 0, 0] }
  const ik = { ...IK, anchor: { ...IK.anchor, at: [0, 0.3, 0] } }
  const r = await post('/api/fit/ridge', { body: 'soldier', prop: 'gun', hold, ik })
  expect(r.status).toBe(200)
  expect(r.body.scenes.sort()).toEqual(['games/ridge/dawn.scene.json', 'games/ridge/dusk.scene.json', 'games/ridge/ridge.partial_scene.json'])
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(root, 'games/ridge', f), 'utf8'))
  const partial = read('ridge.partial_scene.json')
  expect(partial.world.anim.kinds.soldier.props).toEqual([{ model: 'gun', ...hold }])
  expect(partial.world.ik3d.kinds.soldier).toEqual(ik) // dusk's
  expect(partial.plugins).toBeUndefined()
  const dawn = read('dawn.scene.json')
  expect(dawn.world).toEqual({ ik3d: { kinds: { soldier: ik } } })
  expect(dawn.plugins).toEqual(['loader', 'anim', 'ik3d', 'render3d'])
  const dusk = read('dusk.scene.json')
  expect(dusk.world.anim).toBeUndefined()
  expect(dusk.world.ik3d).toBeUndefined()
  expect(dusk.plugins).toEqual(['loader', 'anim', 'ik3d', 'render3d'])
  // Read back whole: one fit, no drift.
  const g = (await json('/api/game/ridge')).body
  expect(g.bodies[0]).toMatchObject({ drift: [], props: [{ model: 'gun', ...hold }], ik })
  expect((await post('/api/fit/ridge', { body: 'soldier', prop: 'gun', hold, ik })).body.scenes).toEqual([])
})

test('a fit refused when a scene draws the body from the partial and has not the prop', async () => {
  const r = await post('/api/fit/pass', { body: 'soldier', prop: 'gun', hold: { bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] } })
  expect(r.status).toBe(409)
  expect(r.body.error).toMatch(/west draw soldier from games\/pass\/pass.partial_scene.json and have no gun/)
  expect(JSON.parse(fs.readFileSync(path.join(root, 'games/pass/pass.partial_scene.json'), 'utf8')).world.anim.kinds.soldier.props).toBeUndefined()
})

test('a model brought into a game on a partial is catalogued in the partial', async () => {
  const r = await post('/api/bring/ridge', { from: 'camp', key: 'scout' })
  expect(r.status).toBe(200)
  expect(r.body.written).toEqual(['games/ridge/assets/scout.glb', 'games/ridge/ridge.partial_scene.json'])
  const g = (await json('/api/game/ridge')).body
  expect(g.models.find((m: any) => m.key === 'scout').scenes).toEqual(['dawn', 'dusk'])
})

test('a game read from its files: its scenes, its world, its models, its bodies, what they hold, where they drift', async () => {
  const g = (await json('/api/game/range')).body
  expect(g.scenes).toEqual(['yard', 'field'])
  expect(g.engine).toEqual({ dt: 0.02 })
  expect(g.render3d.tone).toBe('neutral')
  expect(Object.keys(g.world.loader.assets)).toEqual(['gun', 'soldier'])
  expect(g.world.ik3d).toEqual({ mods: { body: 'anim' }, kinds: { soldier: IK } })
  expect(g.models.map((m: any) => [m.key, m.file, m.type, m.scenes, m.open])).toEqual([['gun', 'games/range/assets/gun.glb', 'glb', ['yard', 'field'], 0], ['soldier', 'games/range/assets/soldier.glb', 'glb', ['yard', 'field'], 0]])
  expect(g.bodies).toEqual([{ kind: 'soldier', model: 'soldier', rig: 'rig', scenes: ['yard', 'field'], drift: ['field'], props: [{ model: 'gun', bone: 'RightHand', at: [0, 0.1, 0], turn: [90, 0, 0] }], ik: IK }])
  const camp = (await json('/api/game/camp')).body
  expect(camp.scenes).toEqual(['camp'])
  expect(camp.bodies[0].props).toEqual([])
  expect((await json('/api/game/notagame')).status).toBe(404)
  expect((await json('/api/game/..')).status).toBe(404)
})

test('notes: added, read, patched, counted open, and refused for a path that is not a game\'s glb', async () => {
  const camera = { position: [1, 1, 1], target: [0, 0, 0], fov: 40 }
  const made = await post(`/api/notes?file=${GUN}`, { text: ' grip too thin ', at: [0, 0.05, 0.1], mesh: 'grip', material: 'rubber', camera })
  expect(made.body).toMatchObject({ id: 1, text: 'grip too thin', status: 'open', reply: '' })
  expect((await post(`/api/notes?file=${GUN}`, { text: '', at: [0, 0, 0] })).status).toBe(400)
  expect((await post(`/api/notes?file=${GUN}`, { text: 'x', at: [0, 0] })).status).toBe(400)
  expect((await json(`/api/notes?file=${GUN}`)).body).toHaveLength(1)
  expect((await json('/api/game/range')).body.models[0].open).toBe(1)
  const fixed = await post(`/api/notes/1?file=${GUN}`, { status: 'fixed', reply: 'widened to 32 mm' }, 'PATCH')
  expect(fixed.body).toMatchObject({ status: 'fixed', reply: 'widened to 32 mm' })
  expect((await post(`/api/notes/1?file=${GUN}`, { status: 'gone' }, 'PATCH')).status).toBe(400)
  expect((await post(`/api/notes/9?file=${GUN}`, { status: 'open' }, 'PATCH')).status).toBe(404)
  expect(JSON.parse(fs.readFileSync(path.join(root, 'games/range/assets/gun.notes.json'), 'utf8'))[0].reply).toBe('widened to 32 mm')
  for (const bad of ['secret.txt', '../secret.txt', 'games/../secret.txt', 'games/range/assets/missing.glb', 'tools/workshop/page.ts']) {
    expect((await json(`/api/notes?file=${encodeURIComponent(bad)}`)).status).toBe(404)
  }
})

test('points: written into the glb, an empty made where there was none, and read back', async () => {
  expect((await json(`/api/points?file=${GUN}`)).body).toEqual({ muzzle: { at: [0, 0, -0.5], turn: [0, 0, 0, 1] } })
  const pts = { grip: { at: [0, -0.05, 0.1], turn: [0, 0.7071068, 0, 0.7071068] }, muzzle: { at: [0, 0.01, -0.52], turn: [0, 0, 0, 1] } }
  const r = await post(`/api/points?file=${GUN}`, { points: pts })
  expect(r.body).toEqual(pts)
  const bytes = fs.readFileSync(path.join(root, 'games/range/assets/gun.glb'))
  expect(bytes.readUInt32LE(8)).toBe(bytes.length)
  expect(bytes.readUInt32LE(12) % 4).toBe(0)
  expect((await post(`/api/points?file=${GUN}`, { points: { body: { at: [0, 0, 0], turn: [0, 0, 0, 1] } } })).status).toBe(409) // a mesh's node is not a point
  expect((await post(`/api/points?file=${GUN}`, { points: { 'a b': { at: [0, 0, 0], turn: [0, 0, 0, 1] } } })).status).toBe(400)
  expect((await post(`/api/points?file=${GUN}`, { points: { grip: { at: [0, 0, 0], turn: [0, 0, 1] } } })).status).toBe(400)
})

test('solids models: listed beside the glbs, each with how the game finds it and how the page draws it', async () => {
  const g = (await json('/api/game/works')).body
  const by = Object.fromEntries(g.models.map((m: any) => [m.key, m]))
  expect(Object.keys(by)).toEqual(['crate-model', 'walker-model', 'cab-model', 'loose-model'])
  expect(g.models.every((m: any) => m.type === 'solids' && m.scenes.join() === 'shop')).toBe(true)
  expect(by['crate-model'].file).toBe('games/works/assets/crate.model.json')
  expect(by['crate-model'].named).toEqual([{ by: 'solids', kind: 'crate', path: 'world.solids.kinds.crate', scenes: ['shop'] }])
  expect(by['crate-model'].stand).toEqual({ scene: 'shop', kind: 'crate', by: 'solids', drawers: [], world: {} })
  expect(by['walker-model'].named).toEqual([{ by: 'defs', kind: 'walker', path: 'walker.model', scenes: ['shop'] }])
  // Drawn as the game draws it: by the plugins that draw solids, each mod kept only where its provider draws too.
  expect(by['walker-model'].stand).toEqual({ scene: 'shop', kind: 'walker', by: 'defs', defs: 'table', drawers: ['rig3d', 'hang3d'], world: { rig3d: { mods: {} }, hang3d: { mods: { node: 'rig3d', both: 'rig3d' } } } })
  // A cabin is found through its definition, but no plugin draws a lone row of it: no stand.
  expect(by['cab-model'].named).toEqual([{ by: 'defs', kind: 'walker', path: 'walker.cabin.model', scenes: ['shop'] }])
  expect(by['cab-model'].stand).toBeUndefined()
  expect(by['loose-model'].named).toEqual([])
  expect(g.world.loader.assets.table).toEqual({ type: 'json', url: '/games/works/assets/table.json' })
  expect(g.bodies).toEqual([])
})

test('notes on a solids model, kept beside its json', async () => {
  const WALKER = encodeURIComponent('games/works/assets/walker.model.json')
  const camera = { position: [4, 3, 6], target: [0, 2, 0], fov: 40 }
  const made = await post(`/api/notes?file=${WALKER}`, { text: 'hip too wide', at: [1, 2, 0], mesh: 'pelvis', material: 'hull', camera })
  expect(made.body).toMatchObject({ id: 1, text: 'hip too wide', at: [1, 2, 0], mesh: 'pelvis', material: 'hull', camera, status: 'open' })
  expect(JSON.parse(fs.readFileSync(path.join(root, 'games/works/assets/walker.model.notes.json'), 'utf8'))).toHaveLength(1)
  expect((await json('/api/game/works')).body.models.find((m: any) => m.key === 'walker-model').open).toBe(1)
  expect((await post(`/api/notes/1?file=${WALKER}`, { status: 'fixed', reply: 'narrowed' }, 'PATCH')).body).toMatchObject({ status: 'fixed', reply: 'narrowed' })
  // A json that is no solids model, and a notes file, are not models.
  for (const bad of ['games/works/assets/table.json', 'games/works/assets/walker.model.notes.json', 'games/works/shop.scene.json']) {
    expect((await json(`/api/notes?file=${encodeURIComponent(bad)}`)).status).toBe(404)
  }
})

test('frames: a solids model\'s nodes and empties read, and written into its json in place', async () => {
  const WALKER = encodeURIComponent('games/works/assets/walker.model.json')
  const CAB = encodeURIComponent('games/works/assets/cab.model.json')
  expect((await json(`/api/frames?file=${WALKER}`)).body).toEqual({ nodes: { pelvis: { at: [0, 2, 0], turn: [0, 0] }, L1: { parent: 'pelvis', at: [0.8, 1, 0], turn: [0, 0] } }, empties: {}, turns: {} })
  const r = await post(`/api/frames?file=${WALKER}`, { nodes: { L1: { at: [0.85, 1.1, 0], turn: [0, 0.25] }, grip: { parent: 'L1', at: [0, -0.2, 0.3] } } })
  expect(r.body.nodes.L1).toEqual({ parent: 'pelvis', at: [0.85, 1.1, 0], turn: [0, 0.25] })
  expect(r.body.nodes.grip).toEqual({ parent: 'L1', at: [0, -0.2, 0.3], turn: [0, 0] })
  expect(fs.readFileSync(path.join(root, 'games/works/assets/walker.model.json'), 'utf8')).toBe(
    '{\n  "paints": {"hull": {"colour":"#888"}},\n  "nodes": {\n    "pelvis": {"at":[0,2,0]},\n    "L1": {"parent":"pelvis","at":[0.85,1.1,0],"turn":[0,0.25]},\n    "grip": {"parent":"L1","at":[0,-0.2,0.3]}\n  },\n  "parts": []\n}\n')
  expect((await post(`/api/frames?file=${CAB}`, { empties: { eye: [0, 0.55, 0.1] } })).body.empties).toEqual({ eye: [0, 0.55, 0.1] })
  // An empty turned, as a glb's point is: a quaternion, the point kept.
  const turned = await post(`/api/frames?file=${CAB}`, { turns: { eye: [0, 0.7071, 0, 0.7071] } })
  expect(turned.body.turns).toEqual({ eye: [0, 0.7071, 0, 0.7071] })
  expect(turned.body.empties).toEqual({ eye: [0, 0.55, 0.1] })
  expect((await post(`/api/frames?file=${CAB}`, { turns: { eye: [0, 1] } })).status).toBe(400)
  expect((await post(`/api/frames?file=${CAB}`, { turns: 3 })).status).toBe(400)
  expect((await post(`/api/frames?file=${WALKER}`, { nodes: { L1: { at: [0, 0] } } })).status).toBe(400)
  expect((await post(`/api/frames?file=${WALKER}`, { nodes: { x: { parent: 'nowhere', at: [0, 0, 0] } } })).status).toBe(400)
  expect((await post(`/api/frames?file=${WALKER}`, { nodes: 3 })).status).toBe(400)
  expect((await json(`/api/frames?file=${encodeURIComponent('games/works/assets/table.json')}`)).status).toBe(404)
  expect((await json(`/api/frames?file=${encodeURIComponent('games/range/assets/gun.glb')}`)).status).toBe(404)
  // A solids model is no glb: its points are frames.
  expect((await json(`/api/points?file=${WALKER}`)).status).toBe(404)
})

test('interactions: each with its file, its body, and the fit and poses of the scene that builds its machine', async () => {
  const g = (await json('/api/game/hangar')).body
  expect(g.error).toBeUndefined()
  expect(g.interactions).toEqual([{
    scene: 'sortie', machine: 'walker', name: 'board', key: 'walker-board', url: '/games/hangar/assets/walker.board.interaction.json',
    file: 'games/hangar/assets/walker.board.interaction.json', body: 'worker', fit: { S1: 'chair', B1: null },
    poses: { climb: { kneel: 1 }, seated: { kneel: 0 } }, mods: { point: 'mount3d', object: 'mount3d' },
  }])
  // A game with no interaction lists none.
  expect((await json('/api/game/range')).body.interactions).toEqual([])
})

test('vehicles: every vehicle of the fleet a scene has interactions for, a machine, with its files and how the page draws it', async () => {
  const g = (await json('/api/game/motor')).body
  expect(g.error).toBeUndefined()
  const fleet = JSON.parse(MOTOR).world.box3dvehicle
  expect(g.vehicles).toEqual([
    {
      name: 'jeep', scene: 'lot', files: ['games/motor/motor.scene.json'], model: null, plugins: ['box3dvehicle', 'particle3d'],
      world: { box3dvehicle: { chassis: 'car', wheel: 'wheel', joint: 'axle', vehicles: { jeep: fleet.vehicles.jeep } }, particle3d: { effects: 'effects' } },
    },
    {
      name: 'van', scene: 'lot', files: ['games/motor/motor.scene.json'], model: 'van', plugins: ['box3dvehicle'],
      world: { box3dvehicle: { chassis: 'car', wheel: 'wheel', joint: 'axle', vehicles: { van: fleet.vehicles.van } } },
    },
  ])
  // Its interactions are of the kind box3dvehicle, every vehicle's, on the points box3dvehicle hands.
  expect(g.interactions).toEqual([{
    scene: 'lot', machine: 'box3dvehicle', name: 'enter', key: 'box3dvehicle-enter', url: '/games/motor/assets/box3dvehicle.enter.interaction.json',
    file: 'games/motor/assets/box3dvehicle.enter.interaction.json', body: 'driver', fit: {}, poses: {},
    mods: { point: 'box3dvehicle', object: 'box3dvehicle', body: 'anim' },
  }])
  // A game with no fleet has none.
  expect((await json('/api/game/hangar')).body.vehicles).toEqual([])
})

test('a vehicle\'s points read, and written into its look in the scene file that gives it, in place', async () => {
  const FILE = path.join(root, 'games/motor/motor.scene.json')
  const got = (await json('/api/vehicle/motor/jeep')).body
  expect(got).toEqual({ nodes: {}, empties: { seat: [-0.7885, -0.046, -0.325], gripL: [0.0538, 0.5052, -0.4722] }, turns: { gripL: [-0.156794, 0.689504, -0.518731, 0.48054] } })
  // The same numbers write nothing, byte for byte.
  const same = await post('/api/vehicle/motor/jeep', { empties: got.empties, turns: got.turns })
  expect(same.body.written).toEqual([])
  expect(fs.readFileSync(FILE, 'utf8')).toBe(MOTOR)
  // A point moved, a grip turned and moved, and one added: each in place, the rest as it was.
  const r = await post('/api/vehicle/motor/jeep', { empties: { seat: [-0.8, -0.05, -0.33], gripL: [0.06, 0.5, -0.47], footL: [-0.04, -0.19, -0.425] }, turns: { gripL: [0, 0, 0, 1] } })
  expect(r.status).toBe(200)
  expect(r.body).toEqual({
    nodes: {}, empties: { seat: [-0.8, -0.05, -0.33], gripL: [0.06, 0.5, -0.47], footL: [-0.04, -0.19, -0.425] }, turns: { gripL: [0, 0, 0, 1] },
    written: ['games/motor/motor.scene.json'],
  })
  expect(fs.readFileSync(FILE, 'utf8')).toBe(MOTOR
    .replace('"seat": [-0.7885, -0.046, -0.325]', '"seat": [-0.8, -0.05, -0.33]')
    .replace('"at": [0.0538, 0.5052, -0.4722], "part": "steer", "turn": [-0.156794, 0.689504, -0.518731, 0.48054] }', '"at": [0.06, 0.5, -0.47], "part": "steer", "turn": [0, 0, 0, 1] },\n              "footL": [-0.04, -0.19, -0.425]'))
  // Read back in the game's summary as the page draws it.
  expect((await json('/api/game/motor')).body.vehicles[0].world.box3dvehicle.vehicles.jeep.look.points.seat).toEqual([-0.8, -0.05, -0.33])
  // Out of shape, a point it has not turned, a vehicle it has not: refused.
  expect((await post('/api/vehicle/motor/jeep', { empties: { seat: [0, 0] } })).status).toBe(400)
  expect((await post('/api/vehicle/motor/jeep', { empties: { 'a b': [0, 0, 0] } })).status).toBe(400)
  expect((await post('/api/vehicle/motor/jeep', { turns: { seat: [0, 0, 1] } })).status).toBe(400)
  expect((await post('/api/vehicle/motor/jeep', { turns: { tail: [0, 0, 0, 1] } })).body.error).toMatch(/no point tail/)
  expect((await post('/api/vehicle/motor/jeep', { empties: 3 })).status).toBe(400)
  expect((await json('/api/vehicle/motor/bus')).status).toBe(404)
  expect((await json('/api/vehicle/nowhere/jeep')).status).toBe(404)
  fs.writeFileSync(FILE, MOTOR)
})

test('an interaction written into its file, each step on lines of its own, and refused out of shape', async () => {
  const FILE = encodeURIComponent('games/hangar/assets/walker.board.interaction.json')
  const changed = structuredClone(BOARD)
  changed.steps[0].turn = 75
  changed.steps[1].ik![0].pole = [1, -0.5, 0.2]
  const r = await post(`/api/interaction?file=${FILE}`, changed)
  expect(r.status).toBe(200)
  expect(r.body).toEqual(changed)
  expect(fs.readFileSync(path.join(root, 'games/hangar/assets/walker.board.interaction.json'), 'utf8')).toBe(
    '{\n  "body": "worker",\n  "steps": [\n' +
    '    {"name":"climb","clip":"climb","at":"board","turn":75},\n' +
    '    {"name":"seated","clip":"pilot","at":"seat","hold":true, "ik": [\n' +
    '      {"bones":["LeftArm","LeftForeArm","LeftHand"],"target":"gripL","pole":[1,-0.5,0.2]}\n' +
    '    ]}\n  ]\n}\n')
  // Only the last step holds; a pole of no length is no direction; and only an interaction's file is one.
  const held = structuredClone(BOARD)
  ;(held.steps[0] as { hold?: boolean }).hold = true
  expect((await post(`/api/interaction?file=${FILE}`, held)).body.error).toMatch(/steps\[0\] holds, and only the last step may/)
  const flat = structuredClone(BOARD)
  flat.steps[1].ik![0].pole = [0, 0, 0]
  expect((await post(`/api/interaction?file=${FILE}`, flat)).status).toBe(400)
  expect((await post(`/api/interaction?file=${encodeURIComponent('games/hangar/assets/table.json')}`, BOARD)).status).toBe(404)
  expect((await post(`/api/interaction?file=${encodeURIComponent('games/hangar/assets/none.interaction.json')}`, BOARD)).status).toBe(404)
  await post(`/api/interaction?file=${FILE}`, BOARD)
})

test('a pack clip baked into a body\'s rig: the clip added under its name, every body baked, the table merged in the rig\'s layout', async () => {
  const was = process.env.BLENDER
  process.env.BLENDER = path.join(root, 'bin/blender')
  try {
    const r = await post('/api/bake/hangar', { body: 'worker', clip: 'pack:Sitting Pack/Stand To Sit.fbx', name: 'standToSit' })
    expect(r.body.error).toBeUndefined()
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ clip: 'standToSit', written: ['games/hangar/assets/worker.rig.json', 'games/hangar/assets/worker.glb'] })
    const text = fs.readFileSync(path.join(root, 'games/hangar/assets/worker.rig.json'), 'utf8')
    expect(JSON.parse(text)).toEqual({
      bodies: { worker: 'characters/worker.fbx' },
      clips: { climb: { file: 'packs/Climb Pack/climb.fbx' }, pilot: { file: 'packs/Climb Pack/pilot.fbx' }, standToSit: { file: 'packs/Sitting Pack/Stand To Sit.fbx' } },
      table: { climb: { dur: 1 }, pilot: { dur: 2 }, standToSit: { dur: 1.5 } },
    })
    expect(text).toContain('\n "clips": {\n  "climb": {\n   "file": "packs/Climb Pack/climb.fbx"\n  },')
    expect(fs.readFileSync(path.join(root, 'games/hangar/assets/worker.glb'), 'utf8')).toBe('baked')
    // The same clip under the same name bakes again; a name the rig gives another file is refused.
    expect((await post('/api/bake/hangar', { body: 'worker', clip: 'pack:Sitting Pack/Stand To Sit.fbx', name: 'standToSit' })).status).toBe(200)
    expect((await post('/api/bake/hangar', { body: 'worker', clip: 'pack:Sitting Pack/Sit To Stand.fbx', name: 'standToSit' })).body.error).toMatch(/has a clip standToSit already, of another file/)
    // A clip not of the packs, a body the game has not, a name that is not a word: refused.
    expect((await post('/api/bake/hangar', { body: 'worker', clip: 'pack:Sitting Pack/Nothing.fbx', name: 'nothing' })).body.error).toMatch(/no pack clip/)
    expect((await post('/api/bake/hangar', { body: 'nobody', clip: 'pack:Sitting Pack/Stand To Sit.fbx', name: 'standToSit' })).body.error).toMatch(/draws no body nobody/)
    expect((await post('/api/bake/hangar', { body: 'worker', clip: 'climb', name: 'x y' })).status).toBe(409)
  } finally {
    if (was === undefined) delete process.env.BLENDER
    else process.env.BLENDER = was
  }
})

test('a solids model is not brought to another game: no body can hold one', async () => {
  const r = await post('/api/bring/camp', { from: 'works', key: 'walker-model' })
  expect(r.status).toBe(409)
  expect(r.body.error).toMatch(/solids model/)
})

test('a fit is written into every scene of the game that draws the body, each in its own layout', async () => {
  const hold = { bone: 'RightHand', at: [0.01, 0.12, 0], turn: [88, 1, 2] }
  const r = await post('/api/fit/range', { body: 'soldier', prop: 'gun', hold, ik: IK })
  expect(r.body.scenes.sort()).toEqual(['games/range/field.scene.json', 'games/range/yard.scene.json'])
  for (const s of ['yard', 'field']) {
    const scene = JSON.parse(fs.readFileSync(path.join(root, `games/range/${s}.scene.json`), 'utf8'))
    expect(scene.world.anim.kinds.soldier.props).toEqual([{ model: 'gun', ...hold }])
    expect(scene.world.ik3d.kinds.soldier).toEqual(IK)
    expect(scene.plugins).toEqual(['loader', 'anim', 'ik3d', 'render3d'])
  }
  expect((await json('/api/game/range')).body.bodies[0].drift).toEqual([])
  // The same fit again changes nothing.
  expect((await post('/api/fit/range', { body: 'soldier', prop: 'gun', hold, ik: IK })).body.scenes).toEqual([])
  expect((await post('/api/fit/range', { body: 'soldier', prop: 'gun', hold: { bone: 'RightHand', at: [0, 0] , turn: [0, 0, 0] } })).status).toBe(400)
  expect((await post('/api/fit/nowhere', { body: 'soldier', prop: 'gun', ik: IK })).status).toBe(404)
})

test('a model brought from one game into another: its glb copied, catalogued, and held as the other game\'s body held it', async () => {
  const r = await post('/api/bring/camp', { from: 'range', key: 'gun', body: 'scout', like: 'soldier' })
  expect(r.status).toBe(200)
  expect(r.body.written).toEqual(['games/camp/assets/gun.glb', 'games/camp/camp.scene.json'])
  expect(fs.readFileSync(path.join(root, 'games/camp/assets/gun.glb')).equals(fs.readFileSync(path.join(root, 'games/range/assets/gun.glb')))).toBe(true)
  const camp = (await json('/api/game/camp')).body
  expect(camp.world.loader.assets.gun).toEqual({ type: 'model', url: '/games/camp/assets/gun.glb' })
  expect(camp.bodies[0].props).toEqual([{ model: 'gun', bone: 'RightHand', at: [0.01, 0.12, 0], turn: [88, 1, 2] }])
  expect(camp.bodies[0].ik).toEqual(IK)
  // Again: here already, nothing written.
  expect((await post('/api/bring/camp', { from: 'range', key: 'gun', body: 'scout', like: 'soldier' })).body.written).toEqual([])
  // Another file by that name is refused, and so is a model the other game has not.
  write('games/range/assets/gun.glb', glb({ muzzle: [0, 0, -0.9] }))
  expect((await post('/api/bring/camp', { from: 'range', key: 'gun' })).status).toBe(409)
  expect((await post('/api/bring/camp', { from: 'range', key: 'sword' })).status).toBe(404)
})

test('every served path stays inside its folder, and a .ts is served with its types stripped, an enum too', async () => {
  for (const bad of ['/games/../secret.txt', '/games/%2e%2e/secret.txt', '/plugins/../secret.txt', '/three/../../secret.txt', '/npm/../secret.txt', '/packs/../secret.txt', '/packs/Rifle%20Pack/notes.txt']) {
    const r = await get(bad)
    expect([403, 404]).toContain(r.status)
    expect(r.body).not.toContain('outside\n')
  }
  expect((await get('/games/range/assets/soldier.glb')).status).toBe(200)
  const page = await get('/page.ts')
  expect(page.body).not.toContain(': number')
  expect(page.body).toContain('const n')
  const plugin = await get('/plugins/demo/demo.plugin.ts')
  expect(plugin.status).toBe(200)
  expect(plugin.body).not.toMatch(/enum Way/)
  expect((await get('/')).body).toContain('workshop')
})

test('the packs: each folder with its clips, and a clip served', async () => {
  expect((await json('/api/packs')).body).toEqual([{ pack: 'Rifle Pack', clips: ['idle.fbx'] }, { pack: 'Sitting Pack', clips: ['Sit To Stand.fbx', 'Stand To Sit.fbx'] }])
  expect((await get('/packs/Rifle%20Pack/idle.fbx')).body).toBe('fbx')
})

test('a file of a game written is sent as changed, once, 150 ms after its last write', async () => {
  const seen: string[] = []
  const ctl = new AbortController()
  const res = await fetch(url + '/api/events', { signal: ctl.signal })
  const reader = res.body!.getReader()
  const reading = (async () => {
    const dec = new TextDecoder()
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
      if (done) return
      for (const line of dec.decode(value).split('\n')) if (line.startsWith('data: ')) seen.push(line.slice(6))
    }
  })()
  await new Promise(r => setTimeout(r, 100))
  // A file no other test writes, so no earlier write's event, which macOS may hand on late, is counted.
  const file = path.join(root, 'games/range/assets/watched.json')
  fs.writeFileSync(file, '{}')
  fs.appendFileSync(file, ' ')
  fs.appendFileSync(file, ' ')
  await new Promise(r => setTimeout(r, 600))
  ctl.abort()
  await reading
  expect(seen.filter(s => s === 'changed games/range/assets/watched.json')).toHaveLength(1)
})
