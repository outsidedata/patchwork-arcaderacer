// puppet3d's mod for gpgpu3d: the capsules and balls of the bodies a page's puppet3d draws, handed as things
// on the GPU.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { things } from './puppet3d.gpgpu3d.ts'

test('a body of a kind that has capsules is handed each, a ball where its bone carries it, once its body is made and while it is within reach', () => {
  const bone = (name: string, at: number[]) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    b.updateMatrixWorld()
    return b
  }
  const body = new THREE.SkinnedMesh()
  body.bind(new THREE.Skeleton([bone('neck', [0, 1.5, 1]), bone('chest', [0, 1.4, 0.5])]))
  let made = false
  const plugins = {
    wire: {
      scene: { world: { puppet3d: { kinds: ['horse', 'hawk'], capsules: { horse: [{ bone: 'neck', at: [0, 0.2, 0], radius: 0.15 }, { from: 'chest', to: 'neck', radius: 0.2 }] } } } },
      rows: [{ id: 7, kind: 'horse', data: {} }, { id: 8, kind: 'hawk', data: {} }],
    },
    puppet3d: { bodies: (id: number) => (id === 7 && made ? [body] : []) },
  } as unknown as Plugins
  const near = { at: [0, 0, 0], reach: 10 }
  expect(things(plugins, near)).toEqual([])
  made = true
  expect(things(plugins, near)).toEqual([
    { capsule: { key: '7 0', a: [0, 1.7, 1], b: [0, 1.7, 1], radius: 0.15 } },
    { capsule: { key: '7 1', a: [0, 1.4, 0.5], b: [0, 1.5, 1], radius: 0.2 } },
  ])
  expect(things(plugins, { at: [40, 0, 0], reach: 10 })).toEqual([])
})
