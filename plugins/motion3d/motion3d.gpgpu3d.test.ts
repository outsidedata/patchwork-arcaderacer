// motion3d's mod for gpgpu3d: the capsules of the bodies a page's motion3d draws, handed as things on the GPU.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { things } from './motion3d.gpgpu3d.ts'

test('a body of a kind that gives capsules is handed as one capsule for each, between its bones where they stand, once its model is made', () => {
  const bone = (name: string, at: number[]) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    b.updateMatrixWorld()
    return b
  }
  const bones = [bone('mixamorigNeck', [0, 1.6, 3]), bone('mixamorigHead', [0, 1.7, 3])]
  let made = false
  const plugins = {
    wire: {
      scene: { world: { motion3d: { kinds: { xbot: { capsules: [{ from: 'Neck', to: 'Head', radius: 0.07 }] } } } } },
      rows: [{ id: 4, kind: 'player', data: { as: 'xbot' } }],
    },
    motion3d: {
      model: (id: number) => (id === 4 && made ? new THREE.Group() : undefined),
      socket: (id: number, suffix: string) => (id === 4 ? bones.find(b => b.name.endsWith(suffix)) : undefined),
    },
  } as unknown as Plugins
  const near = { at: [0, 0, 0], reach: 10 }
  expect(things(plugins, near)).toEqual([])
  made = true
  expect(things(plugins, near)).toEqual([{ capsule: { key: '4 0', a: [0, 1.6, 3], b: [0, 1.7, 3], radius: 0.07 } }])
})
