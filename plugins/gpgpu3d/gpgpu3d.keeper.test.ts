// gpgpu3d's keeper with no GPU: a reader's values planned, with and without a program, and the shaders read.
import { expect, test } from 'vitest'
import { compile, opsOf, type Program } from './gpgpu3d.ops.ts'
import { plan, type Spec } from './gpgpu3d.keeper.ts'

const table = opsOf({})
// A reader of three values: a height with a roll of the thing's own in it, a glow that is the sheet's number
// unless the program gives it, and a colour.
const spec = (program?: Program): Spec => ({
  prefix: 't', what: 'try thing', name: 'try', program,
  outs: { height: { kind: 'number', wrap: 'max( #, 0.0 )' }, glow: { kind: 'number' }, tint: { kind: 'colour' } },
  values: [
    { name: 'tall', size: 1, outs: ['height'], own: true, group: 'shape', glsl: 'tRoll() * tOutHeight()' },
    { name: 'lit', size: 1, outs: ['glow'], own: false, half: true, group: 'look', glsl: 'tGlow * tOutGlow()' },
    { name: 'hue', size: 3, outs: ['tint'], own: false, half: true, group: 'look', glsl: 'tOutTint( tBase )' },
  ],
  keeping: { head: 'uniform float tGlow;\nuniform vec3 tBase;\nfloat tRoll() { return 0.5; }\nfloat gpRollOf( int salt ) { return 0.5; }', begin: '  point = vec3( float( i ) );' },
})
const planned = (program?: Program) => plan(spec(program), program && (part => ({ ...compile(table, program, 'try', 'try thing program', { height: 'number', glow: 'number', tint: 'colour' }, part), uniforms: {} })))

test('with no program a reader keeps what is the thing\'s own and reads the sheet\'s numbers as they are', () => {
  const p = planned()
  expect(Object.fromEntries(Object.entries(p.layout.values).map(([name, v]) => [name, v.how]))).toEqual({ tall: 'kept', lit: 'plain', hue: 'plain' })
  // one texture, of whole floats, the height in its first channel, written in one draw
  expect(p.layout.textures).toEqual([{ half: false, group: 'shape', channels: ['v_tall', '0.0', '0.0', '0.0'] }])
  expect(p.passes).toHaveLength(1)
  expect(p.passes[0].fragment).toContain('float v_tall = tRoll() * tOutHeight();')
  const whole = p.reading()
  // the kept value is fetched, the plain ones are the sheet's
  expect(whole.textures).toEqual([0])
  expect(whole.glsl).toContain('float tValTall() {  return tValF0().r; }')
  expect(whole.glsl).toContain('float tOutGlow() { return 1.0; }')
  expect(whole.glsl).toContain('float tValLit() {  return tGlow * tOutGlow(); }')
  // a shader that asks for one group is handed that group's values alone
  const shape = p.reading(['shape'])
  expect(shape.glsl).toContain('tValTall')
  expect(shape.glsl).not.toContain('tValLit')
  expect(p.reading(['look']).textures).toEqual([])
})

test('with a program, what stands still is kept and never run by the reader, and what moves runs each frame over what was kept', () => {
  // a height by noise, a glow that is the same noise swung by the clock, and a tint by the noise
  const p = planned({
    nodes: [
      { id: 'patch', op: 'noise', kind: 'simplex', freq: 0.07, seed: 3 },
      { id: 'clock', op: 'time', rate: 1 },
      { id: 'wave', op: 'fold', input: 'clock', kind: 'wave' },
      { id: 'lit', op: 'combine', a: 'patch', b: 'wave', mode: 'mul' },
    ],
    out: { height: 'patch', glow: 'lit', tint: { to: '#c8b040', by: 'patch' } },
  })
  expect(Object.fromEntries(Object.entries(p.layout.values).map(([name, v]) => [name, v.how]))).toEqual({ tall: 'kept', lit: 'live', hue: 'kept' })
  expect(p.layout.live).toEqual(['glow'])
  // the height, the colour, and the noise the live half reads: three textures, one draw
  expect(p.layout.textures.map(t => [t.half, t.group])).toEqual([[false, 'shape'], [true, 'look'], [false, '']])
  expect(p.layout.nodes).toBe(2)
  expect(p.passes).toHaveLength(1)
  // the keeping shader runs the noise; no reading does
  expect(p.passes[0].fragment).toContain('gpFbm')
  expect(p.passes[0].fragment).not.toContain('gpTime')
  const whole = p.reading()
  expect(whole.glsl).not.toContain('gpFbm')
  expect(whole.glsl).toContain('gpTime')
  expect(whole.glsl).toContain('float tOutGlow() { return gptryOut_glow(); }')
  expect(whole.glsl).toContain('gptryK0 = tValF2().r;')
  expect(whole.textures).toEqual([0, 1, 2])
  // the shape alone reads no clock and no kept node
  const shape = p.reading(['shape'])
  expect(shape.glsl).not.toContain('gpTime')
  expect(shape.textures).toEqual([0])
})
