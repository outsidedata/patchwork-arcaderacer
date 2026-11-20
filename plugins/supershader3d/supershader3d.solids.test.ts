// supershader3d's mod for solids, named by the scene's `world.solids.mods.looks`. The test writes a
// game folder of its own, a manager and one child, `yard`, where shapes3d's `block` wears the look
// `stone` and its `post` the look `path`, and solids' own `pad` model has a paint of each, through a
// page on the loopback as `index.html` makes one, with render3d handed a canvas stand-in and no
// renderer. Once the looks file has landed, every part in a look paint is drawn with the plugin's
// material of the look's call, shared, its vertices carrying the look's number and the row's id, its
// faces their places in metres; a paint that wears a look and gives a colour too throws, naming it;
// and the plugin listed after solids throws on the first frame.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, mod, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { looks } from './supershader3d.solids.ts'
import type { Looks } from './supershader3d.plugin.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

const BASE = 'flat varying float vLookId;\nvarying vec3 vLookInfo;\nvarying vec2 vLookUv;\nvarying vec3 vLookWorld;\nvarying vec3 vLookWN;\nvec2 lookGx, lookGy;\nstruct Look { vec3 colour; };\nLook lookStart() { Look k; k.colour = vec3(0.5); return k; }\n'
const shaderOf = (ids: number[]) => ({
  ids,
  fragmentPars: `${BASE}${ids.map(id => `void look_${id}(inout Look k) {\n  k.colour = vec3(${id}.0);\n}\n`).join('')}Look lookRun(int id) {\n  Look k = lookStart();\n  switch (id) {\n${ids.map(id => `    case ${id}: look_${id}(k); break;`).join('\n')}\n  }\n  return k;\n}\nfloat lookShadow(int id, vec3 Lview) {\n  \n  return 1.0;\n}\n`,
  features: {},
})
const LOOKS: Looks = {
  about: 'a test', picture: 64,
  materials: [{ name: 'stone', look: 'rock', call: 'solid', colour: [0.5, 0.5, 0.5] }, { name: 'path', look: 'cobble', call: 'relief', colour: [0.4, 0.4, 0.4] }],
  vertexPars: 'attribute float lookId;\nattribute vec3 lookInfo;\n', vertexMain: 'vLookId = lookId;\n',
  calls: { solid: shaderOf([0]), relief: shaderOf([1]), seeThrough: null, all: shaderOf([0, 1]) },
  settings: { width: 1, materials: [[], []] }, needs: [], pictures: [],
}
const LOOKS_URL = '/supershader3d-solids-test/main.looks.json'
written(LOOKS_URL, JSON.stringify(LOOKS))
const PAD = {
  paints: { slab: { look: 'stone' }, kerb: { look: 'path' }, lamp: { colour: '#ffb547' } },
  nodes: { base: { at: [0, 0, 0] } },
  parts: [
    { node: 'base', paint: 'slab', loft: { axis: 'y', from: 0, to: 0.3, a: [0, 0, 2, 1] } },
    { node: 'base', paint: 'kerb', loft: { axis: 'y', from: 0, to: 0.2, a: [0, 1.2, 2, 0.2] } },
    { node: 'base', paint: 'lamp', prism: { axis: 'y', from: 0.3, to: 0.5, at: [0, 0], r: [0.2, 0.2], sides: 6 } },
  ],
}
const PAD_URL = '/supershader3d-solids-test/pad.model.json'
written(PAD_URL, JSON.stringify(PAD))
const MIXED = { ...PAD, paints: { ...PAD.paints, slab: { look: 'stone', colour: '#ff0000' } } }
const MIXED_URL = '/supershader3d-solids-test/mixed.model.json'
written(MIXED_URL, JSON.stringify(MIXED))

const yardOf = (plugins: string[], pad: string): Scene => ({
  world: {
    loader: { assets: { looks: { type: 'json', url: LOOKS_URL, preload: true }, pad: { type: 'json', url: pad, preload: true } } },
    supershader3d: { looks: 'looks' },
    shapes3d: { kinds: { block: { shape: { box: { size: [2, 1, 0.6] } }, look: { look: 'stone' } }, post: { shape: { cylinder: { radius: 0.5, height: 3 } }, look: { look: 'path', sides: 8 } } } },
    solids: { kinds: { pad: 'pad' }, mods: { models: 'shapes3d', looks: 'supershader3d' } },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, block: { pos: [0, 0, 0], yaw: 0 }, post: { pos: [0, 0, 0], yaw: 0 }, pad: { pos: [0, 0, 0], yaw: 0 } },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'block', pos: [3, 0, -2], yaw: 1 }, { is: 'post', pos: [-4, 0, 1] }, { is: 'pad', pos: [0, 0, 5] }],
  plugins,
  seats: 1,
})
const scenes: Record<string, Scene> = {
  yard: yardOf(['loader', 'scenemanager', 'supershader3d', 'solids', 'render3d'], PAD_URL),
  mixed: yardOf(['loader', 'scenemanager', 'supershader3d', 'solids', 'render3d'], MIXED_URL),
  late: yardOf(['loader', 'scenemanager', 'solids', 'supershader3d', 'render3d'], PAD_URL),
}
const dir = mkdtempSync(join(tmpdir(), 'supershader3d-solids-'))
afterAll(() => rmSync(dir, { recursive: true }))
const from = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
for (const [name, s] of Object.entries(scenes)) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(s))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${from('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${from('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, block: {}, post: {}, pad: {} }
export const scene = file
`)
}
const home = pathToFileURL(dir + '/').href

async function open(entry: string) {
  const top: Scene = {
    world: {}, plugins: ['scenemanager'], seats: 1,
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [entry]: { file: `${entry}.scene.json`, suspend: false } }, dt: DT, entry, port: 0 } },
    actors: [{ is: 'scenemanager' }],
  }
  const truth = boot(structuredClone(top), { scenemanager })
  const field = (await load(truth, home)).get(entry)!
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frames = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); clock += DT * 1000; await page.frame() } }
  return { field, page, frames }
}
const meshesOf = (group: any) => { const out: any[] = []; group.traverse((o: any) => { if (o.isMesh) out.push(o) }); return out }

test('the scene\'s looks mod is supershader3d\'s, and it answers each material by name once the file has landed', async () => {
  const { field, page, frames } = await open('yard')
  expect(mod(field.world, 'solids', 'looks')).toBe(looks)
  await frames(3)
  const s = page.client!.plugins.supershader3d
  const l = looks(page.client!.plugins)
  expect(l.idOf('stone')).toBe(0)
  expect(l.material('stone')).toBe(s.material('solid'))
  expect(l.material('path')).toBe(s.material('relief'))
  expect([l.idOf('funkystone'), l.material('funkystone')]).toEqual([undefined, undefined])
})

test('every part in a look paint is drawn with the look\'s material, shared, its vertices tagged with the look and the row and placed in metres', async () => {
  const { field, page, frames } = await open('yard')
  await frames(3)
  const { solids, supershader3d: s } = page.client!.plugins
  const row = (kind: string) => field.rows.find(r => r.kind === kind)!
  const [block] = meshesOf(solids.group(row('block').id)), [post] = meshesOf(solids.group(row('post').id))
  expect(block.material).toBe(s.material('solid'))
  expect(post.material).toBe(s.material('relief'))
  const pad = meshesOf(solids.group(row('pad').id))
  const slab = pad.find(m => m.material === s.material('solid')), kerb = pad.find(m => m.material === s.material('relief')), lamp = pad.find(m => m.material !== slab.material && m.material !== kerb.material)
  expect(slab.material).toBe(block.material)
  expect(lamp.geometry.getAttribute('lookId')).toBeUndefined()
  // the block: a box 2 by 1 by 0.6, every vertex tagged stone, the block's row, part 0
  const ids = block.geometry.getAttribute('lookId'), info = block.geometry.getAttribute('lookInfo'), at = block.geometry.getAttribute('position'), uv = block.geometry.getAttribute('uv')
  expect(ids.count).toBe(at.count)
  for (let i = 0; i < ids.count; i++) {
    expect(ids.getX(i)).toBe(0)
    expect([info.getX(i), info.getY(i), info.getZ(i)]).toEqual([0, row('block').id, 0])
  }
  // in metres: each edge as long on the uv as in the world
  for (let i = 0; i < at.count; i += 3) {
    const p = [0, 1, 2].map(k => [at.getX(i + k), at.getY(i + k), at.getZ(i + k)]), q = [0, 1, 2].map(k => [uv.getX(i + k), uv.getY(i + k)])
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]])
      expect(Math.hypot(q[b][0] - q[a][0], q[b][1] - q[a][1])).toBeCloseTo(Math.hypot(p[b][0] - p[a][0], p[b][1] - p[a][1], p[b][2] - p[a][2]), 5)
  }
  // the kerb is the pad's second part, and its row's
  const kinfo = kerb.geometry.getAttribute('lookInfo')
  expect([kinfo.getX(0), kinfo.getY(0), kinfo.getZ(0)]).toEqual([1, row('pad').id, 1])
  expect(block.castShadow).toBe(true)
})

test('a paint that wears a look and gives a colour too throws naming it, and the plugin listed after solids throws on the first frame', async () => {
  await expect((await open('mixed')).frames(3)).rejects.toThrow('solids: model of pad: paint slab wears the look stone, and gives colour too, which the look works out itself')
  await expect((await open('late')).frames(3)).rejects.toThrow('solids is listed before supershader3d, whose looks it reads that frame')
})
