import { expect, test } from 'vitest'
import { VERTEX } from './supershader3d.glowmap.ts'
import type { Looks } from './supershader3d.plugin.ts'

const LOOKS: Looks = {
  about: 'a test', picture: 64,
  materials: [{ name: 'lava', look: 'lava', call: 'solid', colour: [1, 0.3, 0] }],
  vertexPars: 'attribute float lookId;\nflat varying float vLookId;\n',
  vertexMain: 'vLookId = lookId;\n',
  calls: { solid: null, relief: null, seeThrough: null, all: null },
  settings: { width: 1, materials: [[]] },
  needs: [], pictures: [],
}

test('the glow pass declares the looks\' clock ahead of their vertex side for a looks material, and not for the dark one', () => {
  const lit = VERTEX(LOOKS)
  expect(lit).toContain('uniform float lookTime;\nattribute float lookId;')
  expect(lit.match(/uniform float lookTime;/g)).toHaveLength(1)
  expect(lit.indexOf('vLookId = lookId;')).toBeGreaterThan(lit.indexOf('#include <project_vertex>'))
  expect(VERTEX()).not.toContain('lookTime')
})
