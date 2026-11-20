// fabric3d's fabrics file read and its pins laid, on a page with no renderer: the file is checked when it
// lands, with the words the scene's mods deliver, and each pin's frame is worked out on the CPU before a
// pass moves anything. How a fabric moves and drapes is seen on the GPU, in a game's page.
import { expect, test } from 'vitest'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { behaviorsOf, check, holding, laid, type Fabrics } from './fabric3d.plugin.ts'

const flag = {
  plane: { size: [2, 1] }, paint: { colour: '#c8312b' }, points: [5, 3],
  weight: 0.15, stretch: 1, shear: 0.6, bend: 0.1, drag: 0.3, catch: 0.6, friction: 0.3, thick: 0.02,
  pins: [{ on: 'pos', from: [0, 0], to: [0, 2], at: [0, 6, 0], turn: [90, 0, 0] }],
}
const own = (more: Record<string, unknown> = {}) => ({
  fabrics: 'fabrics', gravity: [0, -9.81, 0], substep: 1 / 240, passes: 4, most: 0.05,
  mods: { behaviors: ['shapes3d', 'solids'], sources: ['shapes3d'] }, ...more,
})
// A scene's world with shapes3d's and solids' mods for fabric3d loaded, as the scenemanager loads them.
const scene = async (fabric3d: Record<string, unknown>) => {
  const world: Record<string, any> = { fabric3d, loader: { assets: {} }, scenemanager: { home: pathToFileURL(`${import.meta.dirname}/`).href } }
  await prepare({} as any, [], world)
  return world
}

test('a fabrics file cut by shapes3d and painted by solids, held to a mast, is read; a word no mod delivers, a pin off the fabric and a held fabric with no sources each throw, naming it', async () => {
  const world = await scene(own({ attach: [{ fabric: 'flag', of: 'mast' }] }))
  const words = behaviorsOf(world)
  const read = (file: unknown, settings = world.fabric3d, w = world) => () => check(file as Fabrics, settings, words, w)
  expect(read({ fabrics: { flag } })).not.toThrow()
  expect(read({ fabrics: { flag: { ...flag, silk: {} } } })).toThrow('fabric3d has no behavior for the fabric flag, of the word silk: no plugin world.fabric3d.mods.behaviors names delivers it')
  expect(read({ fabrics: { flag: { ...flag, pins: [{ on: 'pos', from: [5, 0] }] } } })).toThrow("fabric3d's fabric flag's pin 0 has a from of [5,0], and it is [column, row] of a point of its 5 by 3")
  const bare = await scene(own({ attach: [{ fabric: 'flag', of: 'mast' }], mods: { behaviors: ['shapes3d', 'solids'] } }))
  expect(read({ fabrics: { flag } }, bare.fabric3d, bare)).toThrow('world.fabric3d.attach 0 holds flag to every mast, and world.fabric3d.mods names no sources')
})

test('a flag pinned by its first column to the top of a mast hangs down the mast from the pin\'s place, out along the mast\'s x', async () => {
  const words = behaviorsOf(await scene(own()))
  const lain = laid(flag, words.plane, flag.plane)
  // the first column is held by pin 0, and no other point is held
  expect([0, 1, 2].map(r => lain.held[r * 5])).toEqual([0, 0, 0])
  expect(lain.held[1]).toBe(-1)
  expect([lain.across, lain.along]).toEqual([2, 1])
  const anchor = [...lain.rest.subarray(0, 3)]
  const frame = holding(THREE, flag.pins[0], anchor, { at: [10, 0, 0] }, new THREE.Matrix4())
  const at = (c: number, r: number) => new THREE.Vector3(...lain.rest.subarray((r * 5 + c) * 4, (r * 5 + c) * 4 + 3)).applyMatrix4(frame).toArray().map(v => +v.toFixed(6))
  expect(at(0, 0)).toEqual([10, 6, 0])
  expect(at(0, 2)).toEqual([10, 5, 0])
  expect(at(4, 0)).toEqual([12, 6, 0])
})
