// anim's mod for fabric3d: the bodies a page's anim draws, handed as things fabrics are held to.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { sources } from './anim.fabric3d.ts'

test('a body anim draws is handed once its model and its props are made, as the kind anim draws it as, its points its bones, its props and the empties in them', () => {
  const neck = new THREE.Bone()
  neck.name = 'mixamorigNeck'
  const pole = new THREE.Group(), tip = new THREE.Object3D()
  tip.name = 'tip'
  pole.add(tip)
  const made = { model: false, props: false }
  const plugins = {
    wire: {
      scene: { world: { anim: { kinds: { guard: { props: [{ model: 'pole', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }] } } } } },
      rows: [{ id: 4, kind: 'player', data: { as: 'guard' } }, { id: 5, kind: 'crate', data: {} }],
    },
    anim: {
      model: (id: number) => (id === 4 && made.model ? new THREE.Group() : undefined),
      props: (id: number) => (id === 4 && made.props ? [pole] : []),
      socket: (id: number, suffix: string) => (id === 4 && suffix === 'Neck' ? neck : undefined),
    },
  } as unknown as Plugins
  expect(sources(plugins)).toEqual([])
  made.model = true
  expect(sources(plugins)).toEqual([])
  made.props = true
  const [guard] = sources(plugins)
  expect([guard.key, guard.of]).toEqual(['4', 'guard'])
  expect(guard.point('Neck')).toBe(neck)
  expect(guard.point('pole')).toBe(pole)
  expect(guard.point('tip')).toBe(tip)
  expect(guard.point('Tail')).toBeUndefined()
})
