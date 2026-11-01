// shapes3d's mod for solids, named by the scene's `world.solids.mods`: `models`. The test writes a game
// folder of its own to a temp folder, its home, a manager and one child, `yard`, with a crate (a box,
// turned) and a post (a cylinder of eight sides), each with a look, a kerb (a box) with none, and a
// wall (a box) whose look lays the catalogue's checker; its `world.solids` names no kinds of its own.
// A page on it through the loopback, as `index.html` makes one, with render3d handed a canvas stand-in
// and no renderer, so every frame's placing is worked out and nothing is drawn: solids draws the crate
// and the post from shapes3d's numbers, each its row's size and paint, standing at its row's `pos`
// turned by its `yaw`, the kerb not at all, and the wall with the loader's picture laid on it. A
// cylinder's look with no sides throws, naming the kind.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, modsOf, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { models } from './shapes3d.solids.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

const kinds = {
  crate: { shape: { box: { size: [2, 1, 0.6] } }, look: { colour: '#6b5a3e', roughness: 0.8 } },
  post: { shape: { cylinder: { radius: 0.5, height: 3 } }, look: { colour: '#7a6f62', sides: 8 } },
  kerb: { shape: { box: { size: [4, 0.2, 0.3] } } },
  ramp: { shape: { plane: { size: [2, 4], tilt: Math.atan(0.5) } }, look: { colour: '#70a8e8', thick: 0.2 } },
  wall: { shape: { box: { size: [4, 3.5, 0.4] } }, look: { colour: '#c8ccd0', map: 'checker', scale: 2 } },
}
const yard: Scene = {
  world: {
    loader: { assets: { checker: { type: 'texture', url: '/shapes3d-solids-test/checker.png', wrap: 'repeat' } } },
    shapes3d: { kinds },
    solids: { mods: { models: 'shapes3d' } },
  },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 },
    scenemanager: { out: {} },
    loader: {},
    crate: { pos: [0, 0, 0], yaw: 0 }, post: { pos: [0, 0, 0], yaw: 0 }, kerb: { pos: [0, 0, 0], yaw: 0 }, ramp: { pos: [0, 0, 0], yaw: 0 }, wall: { pos: [0, 0, 0], yaw: 0 },
  },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' },
    { is: 'crate', pos: [3, 0.5, -2], yaw: 2.4 }, { is: 'post', pos: [-4, 0, 1] }, { is: 'kerb', pos: [0, 0, 6] }, { is: 'ramp', pos: [0, 1, -8] }, { is: 'wall', pos: [8, 0, 0] },
  ],
  plugins: ['loader', 'scenemanager', 'solids', 'render3d'],
  seats: 1,
}
const dir = mkdtempSync(join(tmpdir(), 'shapes3d-solids-'))
afterAll(() => rmSync(dir, { recursive: true }))
const from = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${from('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${from('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, crate: {}, post: {}, kerb: {}, ramp: {}, wall: {} }
export const scene = file
`)
const home = pathToFileURL(dir + '/').href

async function open() {
  const top: Scene = {
    world: {},
    plugins: ['scenemanager'],
    seats: 1,
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
    actors: [{ is: 'scenemanager' }],
  }
  const truth = boot(structuredClone(top), { scenemanager })
  const field = (await load(truth, home)).get('yard')!
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  for (let i = 0; i < 3; i++) { truth.step(DT); clock += DT * 1000; await page.frame() }
  return { field, client: page.client! }
}

// The box round every mesh of a drawn group, in the group's own frame.
function bounds(group: any) {
  const box = new THREE.Box3()
  group.updateMatrixWorld(true)
  const back = new THREE.Matrix4().copy(group.matrixWorld).invert()
  group.traverse((o: any) => {
    if (!o.isMesh) return
    o.geometry.computeBoundingBox()
    box.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(back, o.matrixWorld)))
  })
  return box
}

test('the scene\'s models mod is shapes3d\'s', async () => {
  const { field } = await open()
  expect(modsOf(field.world, 'solids', 'models')).toEqual([models])
})

test('solids draws each shape with a look from its numbers, standing on its row and turned by its yaw, and one with no look not at all', async () => {
  const { field, client } = await open()
  const solids = client.plugins.solids
  const row = (kind: string) => field.rows.find(r => r.kind === kind)!
  const crate = solids.group(row('crate').id), post = solids.group(row('post').id)
  expect(solids.group(row('kerb').id)).toBeUndefined()
  // The crate: 2 m across, 1 m tall and 0.6 m long, its foot's middle on its row's pos, turned 2.4. A
  // mesh's corners are 32-bit floats.
  const c = bounds(crate)
  ;[c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z].forEach((v, i) => expect(v).toBeCloseTo([-1, 0, -0.3, 1, 1, 0.3][i], 6))
  const corner = crate.localToWorld(new THREE.Vector3(1, 0, 0.3)).toArray()
  const yaw = 2.4
  ;[3 + Math.cos(yaw) + 0.3 * Math.sin(yaw), 0.5, -2 - Math.sin(yaw) + 0.3 * Math.cos(yaw)].forEach((v, i) => expect(corner[i]).toBeCloseTo(v, 9))
  // The post: eight sides each 0.5 m from its middle, on the cylinder a shot meets, 3 m tall; a side
  // faces each way along x and z.
  const p = bounds(post)
  expect(p.max.y).toBeCloseTo(3, 6)
  expect(p.min.y).toBeCloseTo(0, 6)
  for (const v of [p.max.x, -p.min.x, p.max.z, -p.min.z]) expect(v).toBeCloseTo(0.5, 6)
  const paints = (g: any) => { const out: string[] = []; g.traverse((o: any) => { if (o.isMesh) out.push('#' + o.material.color.getHexString()) }); return out }
  expect(paints(crate)).toEqual([kinds.crate.look.colour])
  expect(paints(post)).toEqual([kinds.post.look.colour])
})

test('solids draws a tilted plane as a slab under its surface, its far end risen to where a body stands on it', async () => {
  const { field, client } = await open()
  const ramp = client.plugins.solids.group(field.rows.find(r => r.kind === 'ramp')!.id)
  // Its surface's far end, 2 m along its length on the ground, rises 1 m over its middle, and its near
  // end, with the slab under it, falls past 1 m under it.
  const b = bounds(ramp)
  expect(b.max.y).toBeCloseTo(1, 6)
  expect(b.min.y).toBeLessThan(-1)
})

test('a look that names a map is drawn with the loader\'s picture laid on it', async () => {
  const { field, client } = await open()
  const wall = client.plugins.solids.group(field.rows.find(r => r.kind === 'wall')!.id)
  const painted: any[] = []
  wall.traverse((o: any) => { if (o.isMesh) painted.push(o) })
  expect(painted).toHaveLength(1)
  expect(painted[0].material.map).toBe(client.plugins.loader.get('checker'))
  expect(painted[0].geometry.getAttribute('uv')).toBeDefined()
})

test('a cylinder\'s look with no sides throws, naming the kind', () => {
  const plugins = { wire: { scene: { world: { shapes3d: { kinds: { pole: { shape: { cylinder: { radius: 0.2, height: 2 } }, look: { colour: '#ffffff' } } } } } } } } as any
  expect(() => models(plugins)).toThrow('shapes3d kind pole is drawn as a cylinder, and its look gives no sides')
})
