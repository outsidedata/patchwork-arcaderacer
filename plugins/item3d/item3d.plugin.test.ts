// item3d's browser half on items of the test's own, the glb of supershader3d's fixture (`supershader3d.glb.fixture.ts`,
// as pro-ng's pack writes one): `crate`, the fixture with no skin and no morph targets, an item that stands still, and `fan`, the fixture
// skinned to its rotor, whose clip `spin` turns once in a third of a second. Each item's vertices count the materials
// `stone` and `slate` as 0 and 1; the scene's looks file here holds them after a material of its own, as 2 and 1. The
// plugin is handed the plugins it draws through, render3d's scene and THREE, supershader3d's looks and materials and
// the loader's files, and ticked as a page ticks it. What it built is read off render3d's scene and what it hands out.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import type { Looks } from '#plugins/supershader3d/supershader3d.plugin.ts'
import { glbOf, made } from '#plugins/supershader3d/supershader3d.glb.fixture.ts'
import { item3d, type Sidecar } from './item3d.plugin.ts'

const DT = 1 / 60
// the scene's looks: its own material first, then the items', in another order than the items count them
const LOOKS = {
  materials: [
    { name: 'ground', look: 'cobble', call: 'solid', colour: [0.4, 0.4, 0.4] },
    { name: 'slate', look: 'slate', call: 'relief', colour: [0.2, 0.2, 0.3] },
    { name: 'stone', look: 'stone', call: 'solid', colour: [0.5, 0.5, 0.5] },
  ],
} as unknown as Looks
const side = (item: string, clips: Sidecar['clips'], more: Partial<Sidecar> = {}): Sidecar => ({ item, kind: 'test', keys: {}, materials: ['stone', 'slate'], clips, spawns: [], grows: [], wears: [], ...more })
// the fixture's kit quad: the part 3 of the thing of row 0
const BLADE = { row: 0, number: 3, part: 'blade', hair: 'test/tuft' }
// the fixture with no skin and its sign's morph targets taken off: a thing that stands still
function still() {
  const it = made({ skinned: false })
  for (const mesh of it.gltf.meshes) {
    delete mesh.weights
    delete mesh.extras
    for (const p of mesh.primitives) delete p.targets
  }
  return it
}
const FILES: Record<string, unknown> = {
  'crate-glb': { bytes: glbOf(still()) },
  'crate-item': side('crate', { things: [] }),
  'lamp-glb': { bytes: glbOf(still()) },
  'lamp-item': side('lamp', { things: [] }, { spawns: [{ effect: 'lamp/flame', at: [0, 0.5, 0], dir: [0, 1, 0] }], grows: [BLADE], wears: ['test/flag'] }),
  'fan-glb': { bytes: glbOf(made()) },
  'fan-item': side('fan', { things: [{ thing: 'fan', kind: 'fan', clips: { spin: { about: 'turns', how: 'bones', start: 'on', loop: true, seconds: 1 / 3, animation: 'fan spin' } } }] }, { grows: [BLADE], wears: ['test/flag'] }),
}

function page(rows: Row[] = []) {
  const scene = new THREE.Scene()
  const materials = { solid: new THREE.MeshBasicMaterial(), relief: new THREE.MeshBasicMaterial() } as Record<string, THREE.Material>
  let looks: Looks | undefined
  const plugins = {
    wire: {
      rows,
      scene: {
        plugins: ['loader', 'supershader3d', 'item3d', 'render3d'],
        prefabs: { engine: { dt: DT } },
        world: { item3d: { items: { crate: { glb: 'crate-glb', file: 'crate-item' }, lamp: { glb: 'lamp-glb', file: 'lamp-item' }, fan: { glb: 'fan-glb', file: 'fan-item' } }, kinds: { box: { item: 'crate' } } } },
      },
    },
    render3d: { THREE, scene },
    loader: { load: async (name: string) => FILES[name], get: (name: string) => FILES[name], ready: (name: string) => name in FILES, onWritten: () => {} },
    supershader3d: { looks: () => looks, material: (call: string) => materials[call], idOf: (name: string) => looks!.materials.findIndex(m => m.name === name) },
    land: () => { looks = LOOKS },
  } as unknown as Plugins
  return { plugins, scene, materials }
}

// a tick of the plugin, each glb's unpacking let finish first
async function tick(me: ReturnType<typeof item3d>, p: Plugins) {
  await new Promise(r => setTimeout(r, 0))
  me.tick(p)
}
// the plugin ticked until its glbs and the looks file have landed and every item is made
async function ready(p: Plugins) {
  const me = item3d()
  p.item3d = me
  await tick(me, p)
  p.land()
  await tick(me, p)
  return me
}
const row = (id: number, pos: number[], rot: number[]): Row => ({ id, kind: 'box', data: { pos, rot } }) as Row

test('a row of a kind item3d lists lies loose as its item, in the scene\'s materials, where the row says, and goes when the row ends', async () => {
  const rows = [row(7, [1, 0.5, -2], [0, 1, 0, 0])]
  const { plugins, scene, materials } = page(rows)
  const me = item3d()
  plugins.item3d = me
  await tick(me, plugins)
  // its glb has landed and the looks file has not: nothing is drawn yet
  await tick(me, plugins)
  expect(scene.children).toEqual([])
  expect(me.ready('crate')).toBe(false)
  plugins.land()
  await tick(me, plugins)
  expect(me.ready('crate')).toBe(true)
  const mesh = scene.children[0] as THREE.Mesh
  expect(mesh.position.toArray()).toEqual([1, 0.5, -2])
  expect(mesh.quaternion.toArray()).toEqual([0, 1, 0, 0])
  expect(mesh.castShadow && mesh.receiveShadow && mesh.userData.moving).toBe(true)
  expect(mesh.material).toEqual([materials.solid, materials.relief])
  // every vertex renumbered from the item's own count (stone 0, slate 1) to the scene's (stone 2, slate 1)
  const ids = new Set(mesh.geometry.getAttribute('lookId').array as Float32Array)
  expect([...ids].sort()).toEqual([1, 2])
  // the row moves, and the item with it; the row ends, and the item goes
  rows[0].data.pos = [3, 0.5, -2]
  await tick(me, plugins)
  expect(scene.children).toEqual([mesh])
  expect(mesh.position.x).toBe(3)
  rows.length = 0
  await tick(me, plugins)
  expect(scene.children).toEqual([])
})

test('every object of an item that stands still shares its one geometry', async () => {
  const { plugins } = page()
  const me = await ready(plugins)
  const a = me.mesh('crate') as THREE.Mesh, b = me.mesh('crate') as THREE.Mesh
  expect(a).not.toBe(b)
  expect(a.geometry === b.geometry).toBe(true)
})

test('an object of an item that moves has bones of its own, and its clip that starts on plays as the plugin ticks', async () => {
  const { plugins, scene } = page()
  const me = await ready(plugins)
  const a = me.mesh('fan') as THREE.SkinnedMesh, b = me.mesh('fan') as THREE.SkinnedMesh
  expect(a.isSkinnedMesh).toBe(true)
  expect(a.skeleton).not.toBe(b.skeleton)
  scene.add(a)
  const rotor = a.skeleton.bones.find(bone => bone.name.endsWith('rotor'))!
  const was = rotor.quaternion.clone()
  // a twelfth of a second on: a quarter of its turn
  for (let i = 0; i < 5; i++) await tick(me, plugins)
  expect(rotor.quaternion.angleTo(was)).toBeCloseTo(Math.PI / 2, 2)
  // taken out of the scene, it is forgotten: its clip plays no more
  a.removeFromParent()
  await tick(me, plugins)
  const stopped = rotor.quaternion.clone()
  await tick(me, plugins)
  expect(rotor.quaternion.equals(stopped)).toBe(true)
})

test('each spawn of an item is a source of particle3d\'s for every copy in a scene and shown, where the copy stands, and for every copy another plugin carries', async () => {
  const { plugins, scene } = page()
  const me = await ready(plugins)
  const lamp = me.mesh('lamp')
  me.mesh('crate')
  // handed out and in no scene: nothing burns
  expect(me.sources()).toEqual([])
  // in the scene, moved and turned a quarter about z: the spawn's point and way with it
  lamp.position.set(2, 0, 0)
  lamp.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  scene.add(lamp)
  await tick(me, plugins)
  const [s] = me.sources()
  expect(me.sources()).toHaveLength(1)
  expect(s).toMatchObject({ key: `item3d ${lamp.id} 0`, on: 'item', of: 'lamp', effect: 'lamp/flame', drivers: {} })
  expect(s.at[0]).toBeCloseTo(1.5)
  expect(s.at[1]).toBeCloseTo(0)
  expect(s.dir![0]).toBeCloseTo(-1)
  // hidden, it burns nothing; shown again, the same source
  lamp.visible = false
  expect(me.sources()).toEqual([])
  lamp.visible = true
  expect(me.sources()[0].key).toBe(s.key)
  // a copy crowd3d carries, and one of an item with no spawns
  me.carried('crowd3d', [{ key: '9 leftHand', item: 'lamp', matrix: new THREE.Matrix4().makeTranslation(0, 1, 4).toArray() }, { key: '9 head', item: 'crate', matrix: new THREE.Matrix4().toArray() }])
  const carried = me.sources().find(x => x.key === 'item3d crowd3d 9 leftHand 0')!
  expect(carried.at).toEqual([0, 1.5, 4])
  expect(me.sources()).toHaveLength(2)
  me.carried('crowd3d', [])
  expect(me.sources()).toHaveLength(1)
  // taken out of the scene, it is forgotten
  lamp.removeFromParent()
  await tick(me, plugins)
  expect(me.sources()).toEqual([])
})

test('the parts of an item that grow hair are skins of hair3d\'s: every stiff copy one wearer, each copy a row of one texture, and a copy with bones a wearer of its own on its skin\'s bones', async () => {
  const { plugins, scene } = page()
  const me = await ready(plugins)
  expect(me.wearers()).toEqual([])
  const a = me.mesh('lamp'), b = me.mesh('lamp')
  a.position.set(1, 2, 3)
  scene.add(a, b)
  me.carried('crowd3d', [{ key: '9 head', item: 'lamp', matrix: new THREE.Matrix4().makeTranslation(7, 0, 0).toArray() }])
  const [worn] = me.wearers()
  expect(me.wearers()).toHaveLength(1)
  expect(worn).toEqual({ id: 'item3d lamp', kind: 'item3d/lamp', skins: [{ item: { item: 'lamp', row: 0, number: 3 } }] })
  const skin = me.skin(worn.skins[0].item as any)
  expect(me.skin(worn.skins[0].item as any)).toBe(skin)
  expect([skin.name, skin.key, skin.unit]).toEqual(['0 blade', 'lamp|0|3', 1])
  // the part's two triangles alone, of the glb's four meshes' vertices, wholly on the one bone
  const cut = skin.skin()
  expect(cut.triangles.length).toBe(6)
  expect(cut.positions.length).toBe(12)
  expect([...cut.weights.slice(0, 4)]).toEqual([1, 0, 0, 0])
  expect(cut.frames.map(f => f.name)).toEqual(['item'])
  // three copies, a row each: the two objects where they stand, then the carried one
  const pose = skin.pose()
  expect([pose.first, pose.copies]).toEqual([0, 3])
  const rows = pose.bones.image.data as Float32Array
  expect([...rows.slice(12, 15)]).toEqual([1, 2, 3])
  expect([...rows.slice(44, 47)]).toEqual([7, 0, 0])
  // a copy with bones of its own: its own wearer, its skin's bones the item's, the quad on the rotor
  const fan = me.mesh('fan') as THREE.SkinnedMesh
  scene.add(fan)
  const own = me.wearers().find(w => w.id === `item3d fan ${fan.id}`)!
  const boned = me.skin(own.skins[0].item as any)
  expect(boned.key).toBe('fan|0|3|boned')
  expect(boned.frames().map(f => f.name)).toEqual(fan.skeleton.bones.map(bone => bone.name))
  expect([...boned.skin().bones.slice(0, 4)]).toEqual([1, 0, 0, 0])
  expect(boned.pose().first).toBe(-1)
  expect(boned.pose().bones).toBe(fan.skeleton.boneTexture)
})

test('every copy of an item that hangs cloth is a thing of fabric3d\'s, its points the item itself and each bone of a copy that has them; each item\'s fabrics are held to its own', async () => {
  const { plugins, scene } = page()
  const me = await ready(plugins)
  expect(me.hung()).toEqual([{ fabric: 'test/flag', of: 'item3d/lamp' }, { fabric: 'test/flag', of: 'item3d/fan' }])
  const lamp = me.mesh('lamp')
  lamp.position.set(1, 2, 3)
  scene.add(lamp)
  me.carried('crowd3d', [{ key: '9 head', item: 'lamp', matrix: new THREE.Matrix4().makeTranslation(7, 0, 0).toArray() }])
  const [loose, held] = me.things()
  expect([loose.key, loose.of, held.key, held.of]).toEqual([`item3d ${lamp.id}`, 'item3d/lamp', 'item3d crowd3d 9 head', 'item3d/lamp'])
  expect(loose.point('item')).toEqual({ at: [1, 2, 3], rot: [0, 0, 0, 1] })
  expect(held.point('item')).toEqual({ at: [7, 0, 0], rot: [0, 0, 0, 1] })
  expect(loose.point('rotor')).toBeUndefined()
  // a copy with bones: the rotor carries the item's frame round with it as its clip turns
  const fan = me.mesh('fan') as THREE.SkinnedMesh
  scene.add(fan)
  const thing = me.things().find(t => t.key === `item3d ${fan.id}`)!
  expect((thing.point('rotor') as { rot: number[] }).rot[3]).toBeCloseTo(1)
  for (let i = 0; i < 5; i++) await tick(me, plugins)
  const turned = thing.point('rotor') as { rot: number[] }
  expect(2 * Math.acos(Math.abs(turned.rot[3]))).toBeCloseTo(Math.PI / 2, 2)
})

test('the bodies of the sheet the scene names are handed out as the sheet has them, checked: none with no sheet named, and undefined until it lands', async () => {
  const { plugins } = page()
  const me = await ready(plugins)
  expect(me.bodies()).toEqual({})
  const world = plugins.wire.scene.world!
  world.item3d.bodies = 'bodies'
  expect(me.bodies()).toBeUndefined()
  const sheet = { bodies: { guard: { holds: [{ item: 'crate', bone: 'RightHand', at: [0, 0.1, 0], turn: [0, 0, 0] }], capsules: [{ from: 'Hips', to: 'Spine2', radius: 0.15 }] } } }
  FILES.bodies = sheet
  expect(me.bodies()).toBe(sheet.bodies)
  // a number changed in the sheet is read where it is
  sheet.bodies.guard.holds[0].at[1] = 0.2
  expect(me.bodies()!.guard.holds![0].at).toEqual([0, 0.2, 0])
  // a sheet the loader hands anew is checked: an item the scene has not throws, naming the body
  FILES.bodies = { bodies: { guard: { holds: [{ item: 'hammer', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }] } } }
  expect(() => me.bodies()).toThrow('item3d\'s body guard\'s hold 0 holds the item "hammer", which is none of world.item3d.items: crate, lamp, fan')
  delete FILES.bodies
})

test('an item\'s parts are a geometry for each call that draws it, and an item that moves has none', async () => {
  const { plugins } = page()
  const me = await ready(plugins)
  const parts = me.parts('crate')
  expect(parts.map(p => p.call).sort()).toEqual(['relief', 'solid'])
  const whole = (me.mesh('crate') as THREE.Mesh).geometry
  expect(parts.reduce((n, p) => n + p.geometry.index!.count, 0)).toBe(whole.index!.count)
  for (const p of parts) {
    expect(Object.keys(p.geometry.attributes).sort()).toEqual(Object.keys(whole.attributes).sort())
    const id = p.call === 'solid' ? 2 : 1
    expect(new Set(p.geometry.getAttribute('lookId').array as Float32Array)).toEqual(new Set([id]))
  }
  expect(() => me.parts('fan')).toThrow('the item fan moves')
})
