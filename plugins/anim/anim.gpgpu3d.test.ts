// anim's mod for gpgpu3d: the capsules of the bodies a page's anim draws, handed as things on the GPU.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { things } from './anim.gpgpu3d.ts'

test('a body of a kind that gives capsules is handed as one capsule for each, between its bones where they stand, once its model is made and while it is within reach', () => {
  const bone = (name: string, at: number[]) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    b.updateMatrixWorld()
    return b
  }
  const bones = [bone('mixamorigHips', [2, 1, 0]), bone('mixamorigSpine2', [2, 1.4, 0]), bone('mixamorigNeck', [2, 1.6, 0])]
  let made = false
  const plugins = {
    wire: {
      scene: { world: { anim: { kinds: { guard: { capsules: [{ from: 'Hips', to: 'Spine2', radius: 0.15 }, { from: 'Spine2', to: 'Neck', radius: 0.16 }, { bone: 'Neck', at: [0, 0.5, 0], radius: 0.1 }] }, crate: {} } } } },
      rows: [{ id: 4, kind: 'player', data: { as: 'guard' } }, { id: 5, kind: 'crate', data: {} }],
    },
    anim: {
      model: (id: number) => (id === 4 && made ? new THREE.Group() : undefined),
      socket: (id: number, suffix: string) => (id === 4 ? bones.find(b => b.name.endsWith(suffix)) : undefined),
    },
  } as unknown as Plugins
  const near = { at: [0, 0, 0], reach: 10 }
  expect(things(plugins, near)).toEqual([])
  made = true
  expect(things(plugins, near)).toEqual([
    { capsule: { key: '4 0', a: [2, 1, 0], b: [2, 1.4, 0], radius: 0.15 } },
    { capsule: { key: '4 1', a: [2, 1.4, 0], b: [2, 1.6, 0], radius: 0.16 } },
    { capsule: { key: '4 2', a: [2, 2.1, 0], b: [2, 2.1, 0], radius: 0.1 } },
  ])
  expect(things(plugins, { at: [40, 0, 0], reach: 10 })).toEqual([])
})
