// shapes3d's mod for instances3d: each shape's geometry has the corners solids draws for it
// (`shapes3d.solids.ts` through solids' `solid`), rows stand where they are turned by their yaw or rot, and
// instances3d lays a kind's picture on it at its scale.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { mod, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { solid } from '#plugins/solids/solids.plugin.ts'
import { instances3d } from '#plugins/instances3d/instances3d.plugin.ts'
import { models } from './shapes3d.solids.ts'
import { behaviors, instances } from './shapes3d.instances3d.ts'

const kinds = {
  pillar: { shape: { cylinder: { radius: 0.5, height: 3 } }, look: { colour: '#fff', sides: 8 } },
  wall: { shape: { box: { size: [4, 2.5, 0.3] } }, look: { colour: '#fff' } },
  ramp: { shape: { plane: { size: [2, 6], tilt: 0.3 } }, look: { colour: '#fff', thick: 0.2 } },
  slab: { shape: { hyperplane: { size: [3, 5] } }, look: { colour: '#fff', thick: 0.25 } },
}
const world = {
  shapes3d: { kinds },
  instances3d: {
    mods: { instances: ['shapes3d'], behaviors: ['shapes3d'] },
    kinds: { wall: { form: {}, colour: '#9a8f80', map: 'brick', scale: 2, flat: true, lods: [0], shadow: 1, leaf: 0 } },
  },
}
const tools = { THREE, convex: () => new THREE.BufferGeometry() }
const key = (p: number[]) => p.map(v => (Math.round(v * 1e5) / 1e5 + 0).toFixed(5)).join(' ')
const corners = (g: THREE.BufferGeometry) => { const p = g.getAttribute('position'); return [...new Set(Array.from({ length: p.count }, (_, k) => key([p.getX(k), p.getY(k), p.getZ(k)])))].sort() }
const form = { cylinder: { sides: 8 }, box: {}, plane: { thick: 0.2 }, hyperplane: { thick: 0.25 } }

test('each shape is the very solid solids draws of it: the same corners', () => {
  const page = { wire: { scene: { world }, rows: [] } } as unknown as Plugins
  const theirs = models(page).models
  for (const [kind, word] of [['pillar', 'cylinder'], ['wall', 'box'], ['ramp', 'plane'], ['slab', 'hyperplane']] as const) {
    const [mine] = behaviors().form.parts(form[word], kind, tools, world)
    // three's cylinder also has the middle of each cap, which lies on that cap's face.
    const centre = (k: string) => word === 'cylinder' && k.startsWith('0.00000') && k.endsWith(' 0.00000')
    expect(corners(mine.geometry).filter(k => !centre(k))).toEqual([...new Set(solid(theirs[kind].parts[0]).v.map(key))].sort())
  }
})

test('a form missing its numbers, a kind shapes3d does not list and a word with no body throw naming the kind', () => {
  expect(() => behaviors().form.parts({}, 'pillar', tools, world)).toThrow('shapes3d kind pillar is drawn as a cylinder, and its form gives no sides')
  expect(() => behaviors().form.parts({}, 'ramp', tools, world)).toThrow('shapes3d kind ramp is drawn as a plane, and its form gives no thick')
  expect(() => behaviors().form.parts({}, 'ghost', tools, world)).toThrow('instances3d draws ghost\'s form, and world.shapes3d.kinds lists no ghost')
  const posted = { ...world, shapes3d: { kinds: { ...kinds, post: { shape: { point: { at: [0, 0, 0] } } } } } }
  expect(() => behaviors().form.parts({}, 'post', tools, posted)).toThrow('shapes3d kind post is a point, which is none of its words')
})

test('instances are every row of a shapes3d kind at its pos, turned by its rot, else its yaw about up', async () => {
  await prepare({}, [], world)
  expect(mod(world, 'instances3d', 'instances')).toBe(instances)
  const rows = [{ id: 1, kind: 'wall', data: { pos: [1, 0, 2], yaw: Math.PI / 2 } }, { id: 2, kind: 'slab', data: { pos: [0, 3, 0], rot: [0.1, 0, 0, 0.995] } }, { id: 3, kind: 'player', data: { pos: [0, 0, 0] } }]
  const got = instances({ wire: { scene: { world }, rows } } as unknown as Plugins)
  expect(got.map(g => g.kind)).toEqual(['wall', 'slab'])
  expect(got[0].rot.map(v => Math.round(v * 1e6) / 1e6)).toEqual([0, 0.707107, 0, 0.707107])
  expect(got[1].rot).toEqual([0.1, 0, 0, 0.995])
})

test('instances3d draws a kind with its picture laid at its scale, flat, once the picture has come', async () => {
  await prepare({}, [], world)
  const scene = new THREE.Scene()
  const brick = new THREE.Texture()
  let ready = false
  const asked: string[] = []
  const plugins = {
    render3d: { THREE, scene, dress: (m: THREE.Material) => m },
    loader: { ready: () => ready, load: async (n: string) => { asked.push(n) }, get: () => brick },
    wire: { scene: { world, plugins: ['instances3d', 'render3d'] }, rows: [{ id: 1, kind: 'wall', data: { pos: [0, 0, 0], yaw: 0 } }] },
  } as unknown as Plugins
  plugins.instances3d = instances3d()
  plugins.instances3d.afterTick(plugins)
  expect(scene.children).toEqual([])
  expect(asked).toEqual(['brick'])
  ready = true
  plugins.instances3d.afterTick(plugins)
  const [wall] = scene.children as THREE.InstancedMesh[]
  const m = wall.material as THREE.MeshStandardMaterial
  expect([m.map, m.flatShading, wall.count]).toEqual([brick, true, 1])
  // The wall's face toward +z, 4 m across and 2.5 m up, is 2 spans across and 1.25 up at scale 2.
  const p = wall.geometry.getAttribute('position'), uv = wall.geometry.getAttribute('uv')
  const onFront = (k: number) => Math.abs(p.getZ(k) - 0.15) < 1e-6
  const front = Array.from({ length: p.count / 3 }, (_, t) => [3 * t, 3 * t + 1, 3 * t + 2]).filter(tri => tri.every(onFront)).flat()
  const us = front.map(k => uv.getX(k)), vs = front.map(k => uv.getY(k))
  expect([Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]).toEqual([-1, 1, 0, 1.25])
})
