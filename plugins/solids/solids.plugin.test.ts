// The solids' arithmetic, with numbers of the test's own: a loft and a prism, their faces pointing out
// and their volumes the rules', and a frame turning about x, then y, then moving. A plugin that
// switches a model's lamps, as a mech's headlamps go on and off, darkens the lamp paint through
// `materials` and dims the lights that name it, and every part in that paint on every node goes dark
// with them while the other lights burn on. How a plugin that draws its models through solids draws a
// model's parts with them is that plugin's own test.
// Then scenes of the test's own, in a game folder of the test's own written to a temp folder, which is
// their home, each through a page on the loopback as `index.html` makes one, on a clock of one step a
// frame, with render3d handed a canvas stand-in and no renderer, so every frame's placing is worked
// out and nothing is drawn. `world.solids` draws each `pad` row from a model of the test's own, a slab
// on a node turned a quarter round, and a lamp that blinks; a `crate` is a row it does not draw. In
// `yard`, which names no land, a pad stands at its row's `pos` facing its `yaw`, and follows the row as
// it moves and turns; its lamp is lit the first half of each second; a pad row that ends is taken off
// the scene. In `sloped`, a plugin of the test's own, `field`, shipped before solids and named for its
// `land` (`plugins/field/field.solids.ts`), the pad stands on the field's slope wherever its row
// moves, whatever height the row says. A scene that ships field after solids, or names terrain3d's
// land and does not list terrain3d, throws on its first frame. In `checked`, the pad's slab lays the
// catalogue's checker 2 m to a span: it is drawn with the loader's picture, a span of it every 2 m of
// every face, upright and unmirrored, and its lamp, laying none, carries no places on a picture.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import * as THREE from 'three'
import { lights, meshes, place, solid, triangles } from './solids.plugin.ts'

const close = (a: number[], b: number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))
const volume = (tris: number[]) => {
  let v = 0
  for (let i = 0; i < tris.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(i, i + 9)
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}

test('a loft is its two rectangles joined, every face pointing out, and its volume the prismatoid rule\'s', () => {
  const s = solid({ node: 'n', paint: 'p', loft: { axis: 'y', from: 0, to: 2, a: [0, 0, 1, 1], b: [0, 0.5, 0.5, 0.5] } })
  expect(s.v).toHaveLength(8)
  expect(s.faces).toHaveLength(6)
  expect(s.v.slice(0, 4).map(v => v[1])).toEqual([0, 0, 0, 0])
  close(s.faces[0].n, [0, -1, 0])
  close(s.faces[1].n, [0, 1, 0])
  // The top is half the size and half a metre forward: the front stands upright at z = 1 and the back
  // slopes forward as it rises, so it faces up as well as back.
  const front = s.faces.find(f => f.n[2] > 0.5)!, back = s.faces.find(f => f.n[2] < -0.5)!
  close(front.n, [0, 0, 1])
  expect(back.n[1]).toBeGreaterThan(0.4)
  // Prismatoid: h/6 (A0 + 4·Amid + A1), the middle 1.5 by 1.5.
  expect(volume(triangles(s))).toBeCloseTo((2 / 6) * (4 + 4 * 2.25 + 1), 9)
})

test('a prism of n sides has n + 2 faces, a flat side facing its j axis, and the area of its polygon times its length', () => {
  const s = solid({ node: 'n', paint: 'p', prism: { axis: 'x', from: -1, to: 1, at: [0, 0], r: [1, 1], sides: 8 } })
  expect(s.faces).toHaveLength(10)
  expect(s.faces.some(f => Math.abs(f.n[1] - 1) < 1e-9)).toBe(true)
  expect(volume(triangles(s))).toBeCloseTo(2 * 0.5 * 8 * Math.sin((2 * Math.PI) / 8), 9)
})

test('a frame turns about x, then y, then moves', () => {
  close(place([0, 1, 0], { turn: [Math.PI / 2, 0] }), [0, 0, 1])
  close(place([0, 0, 1], { turn: [0, Math.PI / 2] }), [1, 0, 0])
  close(place([0, 1, 0], { at: [1, 2, 3], turn: [Math.PI / 2, Math.PI / 2] }), [2, 2, 3])
  const s = solid({ node: 'n', paint: 'p', loft: { axis: 'z', from: 0, to: 1, a: [0, 0, 1, 1] }, frame: { at: [5, 0, 0] } })
  expect(Math.min(...s.v.map(v => v[0]))).toBeCloseTo(4, 9)
})

test('a paint with an opacity below 1 is glass: see-through by that much, writing no depth and casting no shadow, while every other paint is solid and casts one', () => {
  const paints = { hull: { colour: '#8e98a4' }, glass: { colour: '#7fd4ff', opacity: 0.2 }, whole: { colour: '#ffffff', opacity: 1 } }
  const box = (paint: string) => ({ node: 'n', paint, loft: { axis: 'y' as const, from: 0, to: 1, a: [0, 0, 1, 1] } })
  const { meshes: made } = meshes(THREE, (m: unknown) => m, paints, ['hull', 'glass', 'whole'].map(box), 'a test')
  const [hull, glass, whole] = made.get('n')!
  expect([glass.material.transparent, glass.material.opacity, glass.material.depthWrite, glass.castShadow, glass.receiveShadow]).toEqual([true, 0.2, false, false, true])
  for (const m of [hull, whole]) expect([m.material.transparent, m.material.opacity, m.material.depthWrite, m.castShadow, m.receiveShadow]).toEqual([false, 1, true, true, true])
})

test('lamps switched off by their paint: every part in the lamp paint, on every node, goes dark, and so do the lights that name it, while a light that names none burns on', () => {
  const paints = { hull: { colour: '#8e98a4' }, lamp: { colour: '#ffb547', glow: 4 } }
  const parts = ['left', 'right'].flatMap(node => ['hull', 'lamp'].map(paint => ({ node, paint, loft: { axis: 'y' as const, from: 0, to: 1, a: [0, 0, 1, 1] } })))
  const { meshes: made, materials } = meshes(THREE, (m: unknown) => m, paints, parts, 'a test')
  const lit = lights(THREE, [
    { node: 'left', colour: '#fff4d6', intensity: 800, at: [0, 1, 0], paint: 'lamp' },
    { node: 'right', colour: '#fff4d6', intensity: 800, at: [0, 1, 0], paint: 'lamp' },
    { node: 'left', colour: '#ffffff', intensity: 5, at: [0, 2, 0] },
  ])
  // Off, as the plugin that holds the switch turns them.
  materials.get('lamp').emissiveIntensity = 0
  for (const l of lit.owned as any[]) if (l.userData.paint === 'lamp') l.intensity = 0
  const lamp = new THREE.Color(paints.lamp.colour)
  const lampParts = [...made.values()].flat().filter(m => m.material.color.equals(lamp))
  expect(lampParts.map(m => m.material.emissiveIntensity)).toEqual([0, 0])
  expect([...lit.lights.values()].flat().map(l => l.intensity)).toEqual([0, 5, 0])
})

// ---------------------------------------------------------------- a scene of the test's own

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

// A slab on a node turned a quarter round about y, and a lamp over it that blinks once a second, lit
// the first half of it.
const PAD = {
  paints: { slab: { colour: '#4a4f55' }, lamp: { colour: '#ffb547', glow: 4, blink: [1, 0.5] } },
  nodes: { base: { at: [0, 0, 0] }, top: { parent: 'base', at: [0, 1, 0], turn: [0, Math.PI / 2] } },
  parts: [
    { node: 'base', paint: 'slab', loft: { axis: 'y', from: 0, to: 0.3, a: [0, 0, 2, 1] } },
    { node: 'top', paint: 'lamp', prism: { axis: 'y', from: 0, to: 0.2, at: [0, 0], r: [0.2, 0.2], sides: 6 } },
  ],
  lights: [{ node: 'top', colour: '#fff4d6', intensity: 2400, distance: 60, decay: 1.5, at: [0, 0.1, 0], spot: { aim: [2, -1, 0], angle: 0.9, penumbra: 0.4 } }],
}
const PAD_URL = '/solids-plugin-test/pad.model.json'
written(PAD_URL, JSON.stringify(PAD))

// The pad with its slab laying a checker, 2 m to a span, and its lamp laying none.
const CHECKED = { ...PAD, paints: { slab: { colour: '#4a4f55', map: 'checker', scale: 2 }, lamp: { colour: '#ffb547', glow: 4 } } }
const CHECKED_URL = '/solids-plugin-test/checked.model.json'
written(CHECKED_URL, JSON.stringify(CHECKED))

// The field's land: `at` metres high at the origin, rising `slope` [x, z] a metre.
const FIELD = { at: 0.4, slope: [0.2, -0.1] }
const fieldHeight = (x: number, z: number) => FIELD.at + FIELD.slope[0] * x + FIELD.slope[1] * z

// A pad and a crate, neither with a rule to move it, in a scene that lists `plugins` and ships what
// `shipped` lists, with `world` over the rest.
const yardOf = (plugins: string[], shipped: string[] = [], world: Record<string, any> = {}): Scene => ({
  world: {
    loader: { assets: { pad: { type: 'json', url: PAD_URL, preload: true } } },
    shipped: { plugins: shipped },
    solids: { kinds: { pad: 'pad' } },
    ...world,
  },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 },
    scenemanager: { out: {} },
    loader: {},
    pad: { pos: [0, 0, 0], yaw: 0 },
    crate: { pos: [0, 0, 0] },
  },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'pad', pos: [4, 1.5, -2], yaw: 0.7 }, { is: 'crate', pos: [6, 0, 6] }],
  plugins,
  seats: 1,
})
const scenes: Record<string, Scene> = {
  // No land named.
  yard: yardOf(['scenemanager', 'solids', 'render3d']),
  // The field's land, field shipped before solids.
  sloped: yardOf(['scenemanager', 'shipped', 'solids', 'render3d'], ['field'], { field: FIELD, solids: { kinds: { pad: 'pad' }, mods: { land: 'field' } } }),
  // The field's land, field shipped after solids.
  late: yardOf(['scenemanager', 'solids', 'shipped', 'render3d'], ['field'], { field: FIELD, solids: { kinds: { pad: 'pad' }, mods: { land: 'field' } } }),
  // terrain3d's land, and no terrain3d listed.
  unlisted: yardOf(['scenemanager', 'solids', 'render3d'], [], { solids: { kinds: { pad: 'pad' }, mods: { land: 'terrain3d' } } }),
  // The pad drawn from the checked model, the checker a repeating texture of the catalogue.
  checked: yardOf(['loader', 'scenemanager', 'solids', 'render3d'], [], {
    loader: { assets: { pad: { type: 'json', url: CHECKED_URL, preload: true }, checker: { type: 'texture', url: '/solids-plugin-test/checker.png', wrap: 'repeat' } } },
  }),
}
const dir = mkdtempSync(join(tmpdir(), 'solids-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
const from = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
for (const [name, s] of Object.entries(scenes)) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(s))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${from('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${from('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, pad: {}, crate: {} }
export const scene = file
`)
}
// The game's own plugin field, the test's own, with its land for solids beside it, where the
// scenemanager finds it.
mkdirSync(join(dir, 'plugins', 'field'), { recursive: true })
writeFileSync(join(dir, 'plugins', 'field', 'field.plugin.ts'), 'export function field() { return {} }\n')
writeFileSync(join(dir, 'plugins', 'field', 'field.solids.ts'), `
export const land = (plugins: any) => {
  const { at, slope } = plugins.wire.scene.world.field
  return { height: (x: number, z: number) => at + slope[0] * x + slope[1] * z }
}
`)
const home = pathToFileURL(dir + '/').href

// A page on the scene `entry`, the one scene its manager names, and its frames, not yet stepped.
async function open(entry: string) {
  const top: Scene = {
    world: {},
    plugins: ['scenemanager'],
    seats: 1,
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [entry]: { file: `${entry}.scene.json`, suspend: false } }, dt: DT, entry, port: 0 } },
    actors: [{ is: 'scenemanager' }],
  }
  const truth = boot(structuredClone(top), { scenemanager })
  const field = (await load(truth, home)).get(entry)!
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frames = async (k: number) => {
    for (let i = 0; i < k; i++) { truth.step(DT); clock += DT * 1000; await page.frame() }
  }
  return { field, page, frames }
}

async function yard(entry = 'yard') {
  const { field, page, frames } = await open(entry)
  await frames(3)
  const client = page.client!
  const { THREE, scene } = client.plugins.render3d
  // The mesh of the pad's paint `paint`.
  const mesh = (id: number, paint: keyof typeof PAD.paints): any => {
    const colour = new THREE.Color(PAD.paints[paint].colour)
    let found: any
    client.plugins.solids.group(id)?.traverse((o: any) => { if (o.isMesh && o.material.color.equals(colour)) found = o })
    return found
  }
  return { field, frames, THREE, scene, mesh, solids: client.plugins.solids, pad: field.rows.find(r => r.kind === 'pad')!, crate: field.rows.find(r => r.kind === 'crate')! }
}

// A point of the pad's frame in the world, at `pos` facing `yaw`.
const standing = (pos: number[], yaw: number, p: number[]) =>
  [pos[0] + p[0] * Math.cos(yaw) + p[2] * Math.sin(yaw), pos[1] + p[1], pos[2] - p[0] * Math.sin(yaw) + p[2] * Math.cos(yaw)]

test('with no land named, a row of a kind world.solids names stands at its pos facing its yaw, its nodes turned as the model says, and follows the row', async () => {
  const { THREE, frames, solids, mesh, pad, crate } = await yard()
  expect(solids.group(crate.id)).toBeUndefined()
  for (const p of [[0, 0, 0], [1, 0, 0], [0.3, 0.2, -0.7]])
    close(solids.group(pad.id).localToWorld(new THREE.Vector3(...p)).toArray(), standing(pad.data.pos, pad.data.yaw, p), 6)
  // The lamp's node is a metre up and turned a quarter round: its +x is the pad's −z.
  const lamp = mesh(pad.id, 'lamp').parent
  close(lamp.localToWorld(new THREE.Vector3(1, 0, 0)).toArray(), standing(pad.data.pos, pad.data.yaw, [0, 1, -1]), 6)
  expect(mesh(pad.id, 'slab')).toBeDefined()
  pad.data.pos = [-3, 0.5, 8]
  pad.data.yaw = -2.1
  await frames(2)
  close(solids.group(pad.id).localToWorld(new THREE.Vector3(1, 0, 2)).toArray(), standing(pad.data.pos, pad.data.yaw, [1, 0, 2]), 6)
})

test('a row turned past a quarter is drawn facing its yaw, upright, after render3d has written its turn as a quaternion', async () => {
  const { THREE, frames, solids, pad } = await yard()
  for (const yaw of [2.6, -2.9]) {
    pad.data.yaw = yaw
    await frames(1)
    // As render3d writes it between the steps: three reads it back as a half turn on x and z.
    const group = solids.group(pad.id)
    group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    expect(Math.abs(group.rotation.x)).toBeCloseTo(Math.PI, 9)
    await frames(1)
    for (const p of [[0, 0, 0], [1, 0, 2], [0.3, 0.2, -0.7]])
      close(group.localToWorld(new THREE.Vector3(...p)).toArray(), standing(pad.data.pos, yaw, p), 6)
  }
})

test('a model\'s light hangs in its node at its place, a spot pointed at its aim, and follows the row', async () => {
  const { THREE, frames, solids, pad } = await yard()
  const L = PAD.lights[0]
  const find = () => {
    let found: any
    solids.group(pad.id).traverse((o: any) => { if (o.isSpotLight) found = o })
    return found
  }
  // The lamp's node is a metre up and turned a quarter round: its +x is the pad's −z.
  const inPad = (p: number[]) => [p[2], 1 + p[1], -p[0]]
  for (const [pos, yaw] of [[pad.data.pos, pad.data.yaw], [[-3, 0.5, 8], -2.1]] as [number[], number][]) {
    pad.data.pos = pos
    pad.data.yaw = yaw
    await frames(2)
    const spot = find()
    close(spot.getWorldPosition(new THREE.Vector3()).toArray(), standing(pos, yaw, inPad(L.at)), 6)
    close(spot.target.getWorldPosition(new THREE.Vector3()).toArray(), standing(pos, yaw, inPad(L.spot.aim)), 6)
    expect([spot.intensity, spot.distance, spot.decay, spot.angle, spot.penumbra]).toEqual([L.intensity, L.distance, L.decay, L.spot.angle, L.spot.penumbra])
  }
})

test('a blinking paint is lit the first `on` of each of its cycles and dark the rest, by the page\'s clock', async () => {
  const { frames, mesh, pad } = await yard()
  const lit: boolean[] = []
  for (let i = 0; i < 60; i++) {
    await frames(1)
    lit.push(mesh(pad.id, 'lamp').material.emissiveIntensity > 0)
    expect(lit[i]).toBe((clock / 1000) % 1 < 0.5)
  }
  expect(lit.some(Boolean) && lit.some(l => !l)).toBe(true)
})

test('a row that ends is taken off the scene', async () => {
  const { field, frames, scene, solids, pad } = await yard()
  const group = solids.group(pad.id)
  expect(group.parent).toBe(scene)
  field.end(pad)
  await frames(2)
  expect(solids.group(pad.id)).toBeUndefined()
  expect(group.parent).toBeNull()
})

test('with a land mod named, a row stands on the land it hands, facing its yaw, wherever the row moves and whatever height it says', async () => {
  const { THREE, frames, solids, pad } = await yard('sloped')
  for (const [pos, yaw] of [[pad.data.pos, pad.data.yaw], [[-3, 0.5, 8], -2.1], [[12, -7, -9], 1.3]] as [number[], number][]) {
    pad.data.pos = pos
    pad.data.yaw = yaw
    await frames(2)
    const [x, y, z] = pos
    // The slope is not level where it stands, so the land is not the row's own height.
    expect(fieldHeight(x, z)).not.toBeCloseTo(y, 3)
    for (const p of [[0, 0, 0], [1, 0, 2], [0.3, 0.2, -0.7]])
      close(solids.group(pad.id).localToWorld(new THREE.Vector3(...p)).toArray(), standing([x, fieldHeight(x, z), z], yaw, p), 6)
  }
})

test('a paint that lays a picture is drawn with the loader\'s picture, a span of it every `scale` metres of every face, upright and unmirrored, and a paint that lays none carries no places on a picture', async () => {
  const { field, page, frames } = await open('checked')
  await frames(3)
  const { solids, loader } = page.client!.plugins
  const group = solids.group(field.rows.find(r => r.kind === 'pad')!.id)
  const painted: any[] = []
  group.traverse((o: any) => { if (o.isMesh) painted.push(o) })
  const slab = painted.find(m => m.material.map), lamp = painted.find(m => !m.material.map)
  expect(slab.material.map).toBe(loader.get('checker'))
  expect(lamp.geometry.getAttribute('uv')).toBeUndefined()
  // Every edge of every triangle of the slab, a box 4 m by 0.3 m by 2 m, is as long on the picture as
  // it is in metres over the scale, and every triangle, wound outward, is wound the same way on it.
  const at = slab.geometry.getAttribute('position'), uv = slab.geometry.getAttribute('uv')
  expect(uv.count).toBe(at.count)
  for (let i = 0; i < at.count; i += 3) {
    const p = [0, 1, 2].map(k => [at.getX(i + k), at.getY(i + k), at.getZ(i + k)])
    const q = [0, 1, 2].map(k => [uv.getX(i + k), uv.getY(i + k)])
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]])
      expect(Math.hypot(q[b][0] - q[a][0], q[b][1] - q[a][1]) * 2).toBeCloseTo(Math.hypot(p[b][0] - p[a][0], p[b][1] - p[a][1], p[b][2] - p[a][2]), 5)
    expect((q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0])).toBeGreaterThan(0)
  }
})

test('a scene whose land solids reads is a plugin listed after it, or one it does not list, throws on the first frame', async () => {
  await expect((await open('late')).frames(3)).rejects.toThrow('solids is listed before field, whose land it reads that frame')
  await expect((await open('unlisted')).frames(3)).rejects.toThrow('solids\'s land is terrain3d\'s, which this scene does not list')
})
