// The browser half of npc3d on a three.js scene with no canvas: a page handed a wire of a guard that
// looks at players, its definitions a file the loader holds, and the cones turned on. A guard's fans
// are made once and kept while its sight's cone, range and edge stay the numbers they were made from,
// and made again the frame any of them changes, in place in the definitions too.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { json, jsonAt, written } from '#plugins/loader/loader.sim.ts'
import { npc3d } from './npc3d.plugin.ts'

const url = '/npc3d-plugin-test/defs.json'
written(url, JSON.stringify({
  guard: { body: 'walker', sight: { cone: 90, range: 10, edge: { cone: 120, range: 14 }, kinds: ['player'] } },
}))
await jsonAt('defs', url)

const page = () => {
  const scene = {
    world: { defs: 'defs', loader: { assets: { defs: { type: 'json', url, preload: true } } } },
    prefabs: { engine: { dt: 1 / 60 } },
  }
  const plugins: any = {
    wire: { n: 1, scene, rows: [{ id: 1, kind: 'guard', data: { pos: [2, 0, 3], yaw: 0, look: 0 } }] },
    render3d: { THREE, scene: new THREE.Scene() },
  }
  const me = npc3d()
  me.cones = true
  return { plugins, me }
}

// The fans on the scene: the cone and the edge, each a mesh of a circle.
const fans = (plugins: any) => plugins.render3d.scene.children.filter((o: any) => o.isMesh) as THREE.Mesh<THREE.CircleGeometry>[]
// Whether the fans on the scene are these very meshes, not new ones made alike.
const kept = (plugins: any, these: THREE.Mesh[]) => {
  const now = fans(plugins)
  return now.length === these.length && now.every((m, i) => m === these[i])
}

test('a guard\'s fans are kept while its sight\'s numbers stay, and made again the frame any of its four changes', () => {
  const { plugins, me } = page()
  me.tick(plugins)
  const made = fans(plugins)
  expect(made).toHaveLength(2)
  expect(made.map(m => [m.geometry.parameters.radius, m.geometry.parameters.thetaLength])).toEqual([[10, Math.PI / 2], [14, (2 * Math.PI) / 3]])
  // The same numbers, frame after frame: the same two meshes.
  me.tick(plugins)
  me.tick(plugins)
  expect(kept(plugins, made)).toBe(true)
  // Each of the four numbers changed in the definitions, in place: both fans made again, of the new numbers.
  const sight = json(plugins.wire, 'defs').guard.sight
  const before = { cone: sight.cone, range: sight.range, edge: { ...sight.edge } }
  try {
    let last = made
    for (const change of [() => { sight.cone = 60 }, () => { sight.range = 12 }, () => { sight.edge.cone = 150 }, () => { sight.edge.range = 20 }]) {
      change()
      me.tick(plugins)
      const now = fans(plugins)
      expect(now).toHaveLength(2)
      expect(now.some(m => last.includes(m))).toBe(false)
      me.tick(plugins)
      expect(kept(plugins, now)).toBe(true)
      last = now
    }
    expect(last.map(m => [m.geometry.parameters.radius, m.geometry.parameters.thetaLength])).toEqual([[12, Math.PI / 3], [20, (150 * Math.PI) / 180]])
    // No edge: its fan is of no cone and no range, and taking it away is a change too.
    delete sight.edge
    me.tick(plugins)
    const bare = fans(plugins)
    expect(bare.some(m => last.includes(m))).toBe(false)
    expect(bare[1].geometry.parameters.radius).toBe(0)
    me.tick(plugins)
    expect(kept(plugins, bare)).toBe(true)
  } finally {
    Object.assign(sight, before)
  }
})
