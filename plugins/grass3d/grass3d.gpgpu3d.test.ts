// grass3d's op for gpgpu3d, named in a scene's `world.gpgpu3d.mods.ops` and loaded as `prepare` loads every mod:
// it joins gpgpu3d's own, and compiles to the GLSL that reads the blade being made.
import { expect, test } from 'vitest'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { compile, opsOf } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'

const world = { gpgpu3d: { mods: { ops: ['grass3d'] } } }
await prepare({}, [], world)

test('dist stands beside gpgpu3d\'s ops, and with gpgpu3d\'s roll compiles to what the blade has in scope', () => {
  const table = opsOf(world)
  expect(Object.keys(table)).toEqual(expect.arrayContaining(['noise', 'time', 'roll', 'dist']))
  const c = compile(table, { nodes: [{ id: 'r', op: 'roll', salt: 3 }, { id: 'd', op: 'dist' }, { id: 'x', op: 'combine', a: 'r', b: 'd', mode: 'mul' }], out: { height: 'x' } }, 'g', 'grass3d grass meadow program')
  expect(c.glsl).toContain('gpgV0 = gpRollOf( 3 );')
  expect(c.glsl).toContain('gpgV1 = gD;')
  expect(c.glsl).toContain('gpgV2 = gpcombineOf( 2, gpgN0(), gpgN1(), 0.5 );')
  // the distance moves and the roll does not
  expect(c.moves).toEqual({ height: true })
})

test('a scene that does not name grass3d under ops has no dist: the program is told the ops there are', () => {
  expect(() => compile(opsOf({}), { nodes: [{ id: 'd', op: 'dist' }], out: { height: 'd' } }, 'g', 'grass3d grass meadow program')).toThrow('grass3d grass meadow program node 0 (d) is of the op "dist", which is none of const, coord, time, roll, noise, warp, fold, remap, ramp, combine, blend, scale: world.gpgpu3d.mods.ops names the plugins that deliver ops')
})
