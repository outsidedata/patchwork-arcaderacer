// A solids model as the workshop's page draws it, with models of the test's own: the stand-in scene
// for each way a game finds a model; the solids plugin's own drawing of a row (no renderer: its
// `afterTick` handed a three.js scene), whose node groups and meshes the page finds by the order every
// drawer hangs them in, with another plugin's things hung on its nodes after; the page's own drawing
// of a model with no nodes, its parts in pieces at the origin; and the drawing a mesh is part of.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { written } from '../../plugins/loader/loader.sim.ts'
import { meshes, lights, solids } from '../../plugins/solids/solids.plugin.ts'
import { assemble, labels, nodeGroups, rootOf, standScene, stillRow, type Model, type Stand } from './drawn.ts'

const GAME = { world: { loader: { assets: { m: { type: 'json', url: '/games/t/m.json' }, defs: { type: 'json', url: '/games/t/defs.json' } } } }, engine: { dt: 0.02 }, render3d: { tone: 'neutral' } }
const SIZE = { width: 640, height: 480 }

// A machine: a body, a mirrored arm turned about x then y, a bare mount on the arm; two paints on the body.
const MACHINE: Model = {
  paints: { hull: { colour: '#ff0000' }, trim: { colour: '#00ff00' }, glow: { colour: '#0000ff', glow: 1 } },
  nodes: {
    body: { at: [0, 2, 0] },
    arm: { parent: 'body', at: [1, 0.5, 0], turn: [0.3, -0.4], mirror: true },
    mount: { parent: 'arm', at: [0, -0.5, 0.2] },
    head: { parent: 'body', at: [0, 1, 0] },
  },
  parts: [
    { node: 'body', paint: 'trim', loft: { axis: 'y', from: 0, to: 1, a: [0, 0, 0.5, 0.5] } },
    { node: 'arm', paint: 'hull', prism: { axis: 'y', from: -1, to: 0, at: [0, 0], r: [0.1, 0.1], sides: 6 } },
    { node: 'body', paint: 'hull', loft: { axis: 'y', from: -0.5, to: 0, a: [0, 0, 0.6, 0.4] } },
    { node: 'head', paint: 'glow', loft: { axis: 'z', from: 0, to: 0.3, a: [0, 0, 0.2, 0.2] } },
  ],
  lights: [{ node: 'head', colour: '#ffffff', intensity: 2, at: [0, 0, 0.4] }],
}
// A module: no nodes, its parts in two pieces, a muzzle empty.
const MODULE: Model = {
  paints: { mod: { colour: '#808080' }, dark: { colour: '#202020' } },
  empties: { muzzle: [0, 0, 1.4] },
  parts: [
    { node: 'body', paint: 'mod', loft: { axis: 'z', from: 0, to: 0.5, a: [0, 0, 0.2, 0.2] } },
    { node: 'barrels', paint: 'dark', prism: { axis: 'z', from: 0.5, to: 1.4, at: [0, 0], r: [0.1, 0.1], sides: 6 } },
    { node: 'body', paint: 'dark', loft: { axis: 'y', from: 0.2, to: 0.3, a: [0, 0, 0.1, 0.1] } },
  ],
  lights: [{ node: 'barrels', colour: '#ffaa00', intensity: 1, at: [0, 0, 1.5] }],
}

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
const colourOf = (o: any) => '#' + o.material.color.getHexString()

test('the stand-in scene for each way a game finds a model', () => {
  const byKind: Stand = { scene: 'yard', kind: 'pad', by: 'solids', drawers: [], world: {} }
  const a = standScene(GAME, 'm', byKind, 'http://x/games/t/', SIZE)
  expect(a.drawers).toEqual([])
  expect(a.scene.plugins).toEqual(['loader', 'solids', 'render3d'])
  expect(a.scene.world).toEqual({ loader: GAME.world.loader, scenemanager: { home: 'http://x/games/t/' }, solids: { kinds: { pad: 'm' } } })
  expect(a.scene.prefabs.engine).toEqual({ width: 640, height: 480, dt: 0.02 })
  expect(a.scene.prefabs.render3d.tone).toBe('neutral')
  const byDefs: Stand = { scene: 'yard', kind: 'walker', by: 'defs', defs: 'defs', drawers: ['legs', 'hang'], world: { legs: { mods: {} }, hang: { mods: { node: 'legs' } } } }
  const b = standScene(GAME, 'm', byDefs, 'http://x/games/t/', SIZE)
  expect(b.drawers).toEqual(['legs', 'hang'])
  expect(b.scene.plugins).toEqual(['loader', 'solids', 'shipped', 'render3d'])
  expect(b.scene.world).toEqual({ loader: GAME.world.loader, scenemanager: { home: 'http://x/games/t/' }, defs: 'defs', shipped: { plugins: ['legs', 'hang'] }, legs: { mods: {} }, hang: { mods: { node: 'legs' } } })
  // Its own copies: the page edits them.
  expect(b.scene.world.loader).not.toBe(GAME.world.loader)
  expect(b.scene.world.hang).not.toBe(byDefs.world.hang)
  const none = standScene(GAME, 'm', undefined, 'http://x/games/t/', SIZE)
  expect(none.scene.plugins).toEqual(['loader', 'solids', 'render3d'])
  expect(none.scene.world.solids).toBeUndefined()
  expect(stillRow('walker')).toEqual({ id: 1, kind: 'walker', data: { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], heading: 0, kneel: 0 } })
})

test('the solids plugin\'s drawing of a row: each node\'s group and each mesh\'s node and paint found by the order it hangs them', () => {
  written('/games/t/m.json', JSON.stringify(MACHINE))
  const scene = new THREE.Scene()
  const { scene: stand } = standScene(GAME, 'm', { scene: 'yard', kind: 'pad', by: 'solids', drawers: [], world: {} }, 'http://x/games/t/', SIZE)
  const plugins: any = { wire: { n: 1, scene: stand, rows: [{ id: 1, kind: 'pad', data: { pos: [3, 0, -2], yaw: 0.5 } }] }, render3d: { THREE, scene, dress: (m: any) => m } }
  const S = solids()
  S.afterTick(plugins)
  const root = S.group(1)
  expect(root.parent).toBe(scene)
  const groups = nodeGroups(root, MACHINE)
  expect([...groups.keys()]).toEqual(['body', 'arm', 'mount', 'head'])
  for (const [name, n] of Object.entries(MACHINE.nodes!)) {
    const g = groups.get(name) as any
    close(g.position.toArray(), n.at)
    expect(g.parent).toBe(n.parent ? groups.get(n.parent) : root)
  }
  expect((groups.get('arm') as any).scale.x).toBe(-1)
  // About x by 0.3, then about y by -0.4, in its parent's frame.
  const arm = groups.get('arm') as any
  const want = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.4)
  close(new THREE.Vector3(0, -1, 0).applyEuler(arm.rotation).toArray(), want.toArray())
  const found = labels(root, MACHINE)
  expect([...found.values()]).toEqual(expect.arrayContaining([{ node: 'body', paint: 'trim' }, { node: 'body', paint: 'hull' }, { node: 'arm', paint: 'hull' }, { node: 'head', paint: 'glow' }]))
  expect(found.size).toBe(4)
  for (const [mesh, l] of found) {
    expect(colourOf(mesh)).toBe(MACHINE.paints[l.paint].colour)
    expect((mesh as any).parent).toBe(groups.get(l.node))
  }
  // Another plugin's things hung on a node after the drawing is made change none of it.
  const hung = new THREE.Group()
  hung.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: '#ffffff' })))
  ;(groups.get('mount') as any).add(hung)
  ;(groups.get('body') as any).add(new THREE.Group())
  expect(nodeGroups(root, MACHINE)).toEqual(groups)
  expect(labels(root, MACHINE)).toEqual(found)
  // A mesh is part of its drawing; the drawing is the scene's child.
  expect(rootOf([...found.keys()][0], scene)).toBe(root)
  expect(rootOf(hung.children[0] as any, scene)).toBe(root)
  expect(rootOf(new THREE.Mesh() as any, scene)).toBeUndefined()
  S.close()
})

test('the page\'s own drawing: a model with no nodes in pieces at its origin, with the solids plugin\'s meshes and lights', () => {
  const S = { meshes, lights }
  const made = assemble(THREE, S, (m: any) => m, MODULE)
  expect([...made.groups.keys()]).toEqual(['body', 'barrels'])
  for (const g of made.groups.values()) { expect(g.parent).toBe(made.root); close(g.position.toArray(), [0, 0, 0]) }
  const found = labels(made.root, MODULE, made.groups)
  expect([...found.values()]).toEqual([{ node: 'body', paint: 'mod' }, { node: 'body', paint: 'dark' }, { node: 'barrels', paint: 'dark' }])
  for (const [mesh, l] of found) expect(colourOf(mesh)).toBe(MODULE.paints[l.paint].colour)
  const lamp = made.groups.get('barrels').children.find((c: any) => c.isPointLight)
  close(lamp.position.toArray(), [0, 0, 1.5])
  // Its every geometry, material and light is the caller's to dispose.
  expect(made.owned.length).toBe(3 + 2 + 1) // three meshes' geometries, two paints, one lamp
  // A model with nodes hangs as the solids plugin hangs it: each part's corners where its drawing puts them.
  written('/games/t/m.json', JSON.stringify(MACHINE))
  const scene = new THREE.Scene()
  const { scene: stand } = standScene(GAME, 'm', { scene: 'yard', kind: 'pad', by: 'solids', drawers: [], world: {} }, 'http://x/games/t/', SIZE)
  const plugin = solids()
  plugin.afterTick({ wire: { n: 1, scene: stand, rows: [{ id: 1, kind: 'pad', data: { pos: [0, 0, 0], yaw: 0 } }] }, render3d: { THREE, scene, dress: (m: any) => m } } as any)
  const theirs = plugin.group(1)
  const ours = assemble(THREE, S, (m: any) => m, MACHINE)
  theirs.updateMatrixWorld(true)
  ours.root.updateMatrixWorld(true)
  const corners = (root: any, model: Model) => [...labels(root, model, nodeGroups(root, model) as any)].flatMap(([mesh]) => {
    const p = (mesh as any).geometry.attributes.position
    return [0, p.count - 1].map(i => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4((mesh as any).matrixWorld).toArray())
  })
  const a = corners(theirs, MACHINE), b = corners(ours.root, MACHINE)
  expect(a.length).toBe(8)
  a.forEach((v, i) => close(v, b[i]))
  plugin.close()
})
