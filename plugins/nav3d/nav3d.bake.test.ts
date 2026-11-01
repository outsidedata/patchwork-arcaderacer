// nav3d's bake. The test writes a game folder: a manager scene file and three children, `yard`, level
// ground (terrain3d's) with a wall (a shapes3d box) and a graph `field` the bake makes, whose file is not
// on disk; `porch`, the same with a graph `steps` of its own, whose file is not on disk either; and
// `bare`, with no graph to bake. `bake` boots the manager from its file as a server does, every child
// with it, hands each graph of the scene it is asked to `write` at its catalogue url, and hands back
// their names; the graph is the wall's four corners grown by the clearance, joined round it. A scene the
// manager has not got, and one with nothing to bake, throw.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { bake } from './nav3d.bake.ts'
import type { Graph } from './nav3d.sim.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const urls = { land: '/nav3d-bake-test/yard.json', field: '/nav3d-bake-test/field.nav.json', steps: '/nav3d-bake-test/steps.nav.json' }
written(urls.land, JSON.stringify(field))

const child = (nav3d: Record<string, unknown>) => ({
  world: {
    loader: { assets: { land: { type: 'json', url: urls.land, preload: true }, field: { type: 'json', url: urls.field, preload: true }, steps: { type: 'json', url: urls.steps, preload: true } } },
    terrain3d: { field: 'land' },
    shapes3d: { kinds: { wall: { shape: { box: { size: [6, 3, 0.4] } } } } },
    nav3d,
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, wall: { pos: [0, 0, 0], yaw: 0 } },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'wall', pos: [0, 0, 0], yaw: 0 }],
  plugins: ['scenemanager'],
})
const top = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: true }, porch: { file: 'porch.scene.json', suspend: true }, bare: { file: 'bare.scene.json', suspend: true } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

const dir = mkdtempSync(join(tmpdir(), 'nav3d-bake-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
const sim = (name: string) => `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, wall: {} }
export const scene = file
`
writeFileSync(join(dir, 'game.scene.json'), JSON.stringify(top))
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(child({
  graphs: { field: { asset: 'field', bake: { area: [-20, -20, 20, 20], clearance: 0.5, around: 8, sample: 1, slope: 0.5, wade: 0.3 } } },
  mods: { solids: ['shapes3d'], height: 'terrain3d', link: 'terrain3d', behaviors: ['terrain3d'] },
})))
writeFileSync(join(dir, 'yard.sim.ts'), sim('yard'))
writeFileSync(join(dir, 'porch.scene.json'), JSON.stringify(child({
  graphs: { steps: { asset: 'steps', bake: { area: [-20, -20, 20, 20], clearance: 0.5, around: 8, sample: 1, slope: 0.5, wade: 0.3 } } },
  mods: { solids: ['shapes3d'], height: 'terrain3d', link: 'terrain3d', behaviors: ['terrain3d'] },
})))
writeFileSync(join(dir, 'porch.sim.ts'), sim('porch'))
writeFileSync(join(dir, 'bare.scene.json'), JSON.stringify(child({ graphs: {} })))
writeFileSync(join(dir, 'bare.sim.ts'), sim('bare'))
afterAll(() => rmSync(dir, { recursive: true }))
const manager = pathToFileURL(join(dir, 'game.scene.json'))

test('the bake boots the game, makes each graph the scene gives a bake, and writes it at its url, while another scene\'s graph is not yet made', async () => {
  const files = new Map<string, string>()
  expect(await bake(manager, 'yard', (url, text) => files.set(url, text))).toEqual(['field'])
  expect([...files.keys()]).toEqual([urls.field])
  const g = JSON.parse(files.get(urls.field)!) as Graph
  expect(g.places.map(p => p.point.at.map(v => +v.toFixed(9)))).toEqual([[-3.5, 0, -0.7], [3.5, 0, -0.7], [3.5, 0, 0.7], [-3.5, 0, 0.7]])
  const index = (p: number[]) => g.places.findIndex(q => q.point.at.every((v, i) => v === p[i]))
  expect(g.ways.map(wy => ('line' in wy ? [index(wy.line.from), index(wy.line.to)] : []))).toEqual([[0, 1], [0, 3], [1, 2], [2, 3]])
  // A second bake of the same scene writes the same file.
  const again = new Map<string, string>()
  await bake(manager, 'yard', (url, text) => again.set(url, text))
  expect(again.get(urls.field)).toBe(files.get(urls.field))
})

test('a scene the manager has not got, and one with no graph to bake, throw', async () => {
  await expect(bake(manager, 'gone', () => {})).rejects.toThrow('game.scene.json has no scene gone')
  await expect(bake(manager, 'bare', () => {})).rejects.toThrow('scene bare has no graph to bake: no world.nav3d.graphs entry gives a bake')
})
