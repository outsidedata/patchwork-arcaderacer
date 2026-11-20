// motion3d's mod for fabric3d: the bodies a page's motion3d draws, handed as things fabrics are held to.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { sources } from './motion3d.fabric3d.ts'

test('a body motion3d draws is handed once its model and its props are made, as the kind motion3d draws it as, its points its bones, its props and the empties in them', () => {
  const neck = new THREE.Bone()
  neck.name = 'mixamorigNeck'
  const wand = new THREE.Group(), grip = new THREE.Object3D()
  grip.name = 'grip'
  wand.add(grip)
  const made = { model: false, props: false }
  const plugins = {
    wire: {
      scene: { world: { motion3d: { kinds: { xbot: { props: [{ model: 'wand', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }] } } } } },
      rows: [{ id: 4, kind: 'player', data: { as: 'xbot' } }, { id: 5, kind: 'crate', data: {} }],
    },
    motion3d: {
      model: (id: number) => (id === 4 && made.model ? new THREE.Group() : undefined),
      props: (id: number) => (id === 4 && made.props ? [wand] : []),
      socket: (id: number, suffix: string) => (id === 4 && suffix === 'Neck' ? neck : undefined),
    },
  } as unknown as Plugins
  expect(sources(plugins)).toEqual([])
  made.model = true
  expect(sources(plugins)).toEqual([])
  made.props = true
  const [dancer] = sources(plugins)
  expect([dancer.key, dancer.of]).toEqual(['4', 'xbot'])
  expect(dancer.point('Neck')).toBe(neck)
  expect(dancer.point('wand')).toBe(wand)
  expect(dancer.point('grip')).toBe(grip)
  expect(dancer.point('Tail')).toBeUndefined()
})
