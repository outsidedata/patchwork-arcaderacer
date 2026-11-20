// gpgpu3d's ops in node: what a program is checked for and the GLSL it compiles to. What the GLSL computes is
// seen on the GPU (`gpgpu3d.ops.gpu.mjs`).
import { expect, test } from 'vitest'
import { compile, opsOf, rangeOf, type Kind, type Op, type Program } from './gpgpu3d.ops.ts'

const table = opsOf({})
const build = (program: Program, allowed?: Record<string, Kind>) => compile(table, program, 'try', 'try program', allowed)

const patches: Program = {
  nodes: [
    { id: 'patch', op: 'noise', kind: 'simplex', freq: 0.07, seed: 3, octaves: 3 },
    { id: 'tall', op: 'remap', input: 'patch', inLo: 0.3, inHi: 0.7, outLo: 0.6, outHi: 1.5, ease: 'smooth' },
    { id: 'tuft', op: 'noise', kind: 'worley', metric: 'f1', freq: 1.8, seed: 9 },
    { id: 'both', op: 'combine', a: 'tall', b: 'tuft', mode: 'mul' },
    { id: 'unused', op: 'time', rate: 2 },
  ],
  out: { height: 'both' },
}

test('a program compiles to a function for each node its out reaches, worked out once at the point the reader gives, and one for each out; a node nothing reaches is left out, and so is the library only it needs', () => {
  const c = build(patches)
  expect(c.outs).toEqual({ height: 'gptryOut_height' })
  expect(c.at).toBe('gptryAt')
  expect(c.uses).toEqual([])
  for (const k of [0, 1, 2, 3]) expect(c.glsl).toContain(`float gptryN${k}() { if ( !gptryD${k} )`)
  expect(c.glsl).not.toContain('gptryN4')
  expect(c.glsl).not.toContain('gpTime')
  expect(c.glsl).toContain('float gptryOut_height() { return gptryN3(); }')
  // the point is given once, and it forgets what was worked out at the last
  expect(c.glsl).toContain('void gptryAt( vec3 p ) { gptryP = p; gptryD0 = false; gptryD1 = false; gptryD2 = false; gptryD3 = false; }')
  // the noise's library and the hash it needs, each once, before the first node that calls them
  expect(c.glsl.match(/uint gpHash\(/g)).toHaveLength(1)
  expect(c.glsl.match(/float gpFbm\(/g)).toHaveLength(1)
  expect(c.glsl.indexOf('float gpFbm(')).toBeLessThan(c.glsl.indexOf('float gptryN0('))
  // the numbers are written into the GLSL: the sheet's, as they are
  expect(c.glsl).toContain('gptryV1 = gpremapOf( gptryN0(), 0.3, 0.7, 0.6, 1.5, 1 )')
  expect(c.glsl).toContain('gptryV0 = gpFbm( 1, 0, gpRotY( gptryP, 1.0, 0.0 ) * vec3( 0.07, 0.07, 0.07 ), 3u, 3, 2.0, 0.5 )')
})

test('two outputs that read one node read it once: the node has one function, and each output calls it', () => {
  const c = build({ nodes: [{ id: 'n', op: 'noise', kind: 'value', freq: 1 }, { id: 'twice', op: 'scale', input: 'n', by: 2 }], out: { a: 'n', b: 'twice' } })
  expect(c.glsl.match(/float gptryN0\(\)/g)).toHaveLength(1)
  expect(c.glsl).toContain('float gptryOut_a() { return gptryN0(); }')
  expect(c.glsl).toContain('gptryV1 = ( gptryN0() * 2.0 )')
})

test('the clock is a library of its own: a program that reaches a time node reads gpTime and says so', () => {
  const c = build({ nodes: [{ id: 't', op: 'time', rate: 2 }, { id: 'w', op: 'fold', input: 't', kind: 'wave' }], out: { sway: 'w' } })
  expect(c.uses).toEqual(['gpTime'])
  expect(c.glsl).toContain('uniform float gpTime;')
  expect(c.glsl).toContain('( gpTime * 2.0 )')
})

test('a warp runs its input at the point it moves: that input has a function of the point of its own, and the node the warp moves it by is read at the point', () => {
  const c = build({
    nodes: [
      { id: 'a', op: 'noise', kind: 'value', freq: 0.5 },
      { id: 'b', op: 'noise', kind: 'value', freq: 0.2, seed: 1 },
      { id: 'w', op: 'warp', input: 'a', x: 'b', amount: 4 },
    ],
    out: { v: 'w' },
  })
  expect(c.glsl).toContain('float gptryF0( vec3 p )')
  expect(c.glsl).toContain('gptryV2 = gptryF0( gptryP + 4.0 * vec3( gptryN1(), 0.0, 0.0 ) )')
  // the warped input is read at no point but the ones it is moved to, so it has no value held for the point
  expect(c.glsl).not.toContain('gptryN0')
  // a node read both ways has both
  const both = build({
    nodes: [{ id: 'a', op: 'noise', kind: 'value', freq: 0.5 }, { id: 'one', op: 'const', value: 1 }, { id: 'w', op: 'warp', input: 'a', x: 'one', amount: 4 }],
    out: { here: 'a', there: 'w' },
  })
  expect(both.glsl).toContain('float gptryF0( vec3 p )')
  expect(both.glsl).toContain('float gptryN0() { if ( !gptryD0 )')
})

test('a program of two names stands beside another in one shader: each name is in every function it makes', () => {
  const a = compile(table, patches, 'one', 'a'), b = compile(table, patches, 'two', 'b')
  expect(a.glsl).toContain('gponeN3')
  expect(b.glsl).toContain('gptwoN3')
  expect(a.outs.height).not.toBe(b.outs.height)
})

test('a sheet that is wrong is told which node, which field and what it should be', () => {
  const one = (node: Record<string, unknown>, others: Record<string, unknown>[] = []) => () => build({ nodes: [...others, { id: 'n', ...node } as any], out: { v: 'n' } })
  const c = { id: 'c', op: 'const', value: 1 }
  expect(one({ op: 'perlin', freq: 1 })).toThrow('try program node 0 (n) is of the op "perlin", which is none of const, coord, time, roll, noise, warp, fold, remap, ramp, combine, blend, scale: world.gpgpu3d.mods.ops names the plugins that deliver ops')
  expect(one({ op: 'noise', freq: 1, speed: 2 })).toThrow('try program node 0 (n) of noise has speed, which noise does not take: kind, freq, seed, octaves, lacunarity, gain, rotate, stretch, metric')
  expect(one({ op: 'noise' })).toThrow('try program node 0 (n) of noise has no freq')
  expect(one({ op: 'noise', freq: 0 })).toThrow('freq 0 is not a number above 0')
  expect(one({ op: 'noise', freq: 1, kind: 'perlin' })).toThrow('kind "perlin" is not none of value, simplex, worley, cell')
  expect(one({ op: 'noise', freq: 1, octaves: 0 })).toThrow('octaves 0 is not a whole number at or above 1')
  expect(one({ op: 'noise', freq: 1, stretch: [1, 1] })).toThrow('stretch [1,1] is not [x, y, z], three numbers')
  expect(one({ op: 'scale', by: 2 })).toThrow('node 0 (n) of scale has no input, a node before it')
  expect(one({ op: 'scale', input: 'c' })).toThrow('node 0 (n) of scale reads input "c", which is not a node before it')
  expect(one({ op: 'scale', input: 'c', by: 2 }, [c])).not.toThrow()
  expect(one({ op: 'scale', input: 'later', by: 2 }, [])).toThrow('reads input "later", which is not a node before it')
  expect(one({ op: 'warp', input: 'c', amount: 1 }, [c])).toThrow('node 1 (n) of warp moves the point by none of x, y, z')
  expect(() => build({ nodes: [{ id: 'a', op: 'const', value: 1 }, { id: 'a', op: 'const', value: 2 }], out: { v: 'a' } })).toThrow('try program has two nodes a')
  expect(() => build({ nodes: [{ id: 'a', op: 'const', value: 1 }], out: { v: 'zz' } })).toThrow('try program out v is "zz", which is no node')
  expect(() => build({ nodes: [{ id: 'a', op: 'const', value: 1 }], out: {} })).toThrow('try program has no out')
  expect(() => build({ nodes: [], out: { v: 'a' } })).toThrow('try program has no nodes')
  expect(() => build({ nodes: [{ id: 'a', op: 'const', value: 1 }], out: { v: 'a' } }, { height: 'number', width: 'number' })).toThrow('try program out v is none of height, width')
  expect(() => compile(table, patches, 'two words', 'x')).toThrow('the program\'s name "two words" is not letters and digits that start with a letter')
})

const shade: Program = {
  nodes: [{ id: 'n', op: 'noise', kind: 'value', freq: 1 }, { id: 'half', op: 'const', value: 0.5 }, { id: 'unused', op: 'time', rate: 1 }],
  out: { number: 'n', tint: { to: '#ff8000', by: 'n' }, rgb: { r: 'n', g: 'half', b: 'half' } },
}

test('a colour out is a function of the reader\'s own colour: a tint mixes toward its hex by a node, three nodes are the colour, and both are in linear numbers whatever the sheet wrote in sRGB', () => {
  const c = build(shade, { number: 'number', tint: 'colour', rgb: 'colour' })
  expect(c.kinds).toEqual({ number: 'number', tint: 'colour', rgb: 'colour' })
  expect(c.outs).toEqual({ number: 'gptryOut_number', tint: 'gptryOut_tint', rgb: 'gptryOut_rgb' })
  // #ff8000 in linear is 1, 0.2158605, 0: the hex is turned over in the GLSL's literal, not on the GPU
  expect(c.glsl).toContain('vec3 gptryOut_tint( vec3 base ) { return mix( base, vec3( 1.0, 0.21586050011389926, 0.0 ), clamp( gptryN0(), 0.0, 1.0 ) ); }')
  expect(c.glsl).toContain('vec3 gptryOut_rgb( vec3 base ) { return gpLinear( vec3( gptryN0(), gptryN1(), gptryN1() ) ); }')
  expect(c.glsl).toContain('float gptryOut_number() { return gptryN0(); }')
  // the sRGB curve is there once, and only for the three nodes; the nodes the outs share are worked out once
  expect(c.glsl.match(/vec3 gpLinear\(/g)).toHaveLength(1)
  expect(c.glsl.match(/float gptryN0\(\)/g)).toHaveLength(1)
  expect(c.glsl).not.toContain('gptryN2')
  // a program with no three-node colour carries no curve
  expect(build({ nodes: shade.nodes, out: { tint: shade.out.tint } }).glsl).not.toContain('gpLinear')
  // with no `allowed` a name's form says which it is
  expect(build(shade).kinds).toEqual({ number: 'number', tint: 'colour', rgb: 'colour' })
})

test('a colour out of the wrong form, or a name given the other kind, is told what it should be', () => {
  const nodes = shade.nodes
  const out = (o: unknown, allowed?: Record<string, Kind>) => () => build({ nodes, out: { v: o as any } }, allowed)
  expect(out({ to: 'orange', by: 'n' })).toThrow('try program out v to is "orange", which is not a colour like "#8fae4c"')
  expect(out({ to: '#ff8000', by: 'zz' })).toThrow('try program out v by is "zz", which is no node')
  expect(out({ r: 'n', g: 'half' })).toThrow('try program out v b is undefined, which is no node')
  expect(out(['n'])).toThrow('try program out v is ["n"]: a node id, or for a colour { r, g, b } of node ids or { to: "#rrggbb", by: <node id> }')
  expect(out({ to: '#ff8000', by: 'n' }, { v: 'number' })).toThrow('try program out v is a colour, and v is a number: a node id')
  expect(out('n', { v: 'colour' })).toThrow('try program out v is a node id, and v is a colour: { r, g, b } of node ids, or { to: "#rrggbb", by: <node id> }')
})

test('a tool\'s slider for a number of a node is within what the op says the number may be, and steps a whole number by 1', () => {
  const noise = table.noise.params!
  // freq is above 0: the slider starts one step over it and runs to three times where it stands
  expect(rangeOf(noise.freq, 0.045)).toEqual({ min: 0.0001, max: 0.2, step: 0.0001 })
  // octaves are whole, from 1 to 16
  expect(rangeOf(noise.octaves, 3)).toEqual({ min: 1, max: 16, step: 1 })
  // a number with no bound is either side of 0
  expect(rangeOf(table.remap.params!.outHi, 1.5)).toEqual({ min: -5, max: 5, step: 0.001 })
  expect(rangeOf(table.const.params!.value, 0)).toEqual({ min: -0.001, max: 0.001, step: 1e-6 })
})

test('an op a plugin delivers is of the table beside the built-in ones, and one of a built-in\'s word takes its place', () => {
  const roll: Op = { params: { salt: { type: 'whole', min: 0 } }, lib: 'float rollOf( vec3 p, int salt ) { return fract( sin( dot( p, vec3( 12.9, 78.2, 37.7 ) ) + float( salt ) ) * 43758.5 ); }', expr: c => `rollOf( ${c.p}, ${c.param('salt')} )` }
  const mine = { ...table, roll, const: { params: { value: { type: 'number' } }, expr: () => '0.25' } as Op }
  const c = compile(mine, { nodes: [{ id: 'r', op: 'roll', salt: 4 }, { id: 'k', op: 'const', value: 9 }, { id: 'm', op: 'combine', a: 'r', b: 'k', mode: 'add' }], out: { v: 'm' } }, 'try', 'try program')
  expect(c.glsl.match(/float rollOf\(/g)).toHaveLength(1)
  expect(c.glsl).toContain('rollOf( gptryP, 4 )')
  expect(c.glsl).toContain('gptryV1 = 0.25;')
})

test('a reader that keeps what does not move compiles a program in halves: the still half works the noise out, the live half is handed it and never runs it', () => {
  // a patch of tall grass by noise, and its brightness the same noise swung by the clock
  const swung: Program = {
    nodes: [
      { id: 'patch', op: 'noise', kind: 'simplex', freq: 0.07, seed: 3, octaves: 3 },
      { id: 'clock', op: 'time', rate: 1 },
      { id: 'wave', op: 'fold', input: 'clock', kind: 'wave' },
      { id: 'lit', op: 'combine', a: 'patch', b: 'wave', mode: 'mul' },
    ],
    out: { height: 'patch', bright: 'lit' },
  }
  const whole = build(swung)
  expect(whole.moves).toEqual({ height: false, bright: true })
  const live = Object.keys(whole.moves).filter(name => whole.moves[name])
  const still = compile(table, swung, 'try', 'try program', undefined, { live, of: 'still' })
  const each = compile(table, swung, 'try', 'try program', undefined, { live, of: 'live' })
  // the still half: the height, and the noise kept for the live half; no clock
  expect(Object.keys(still.outs)).toEqual(['height'])
  expect(still.kept).toEqual(['gptryKeep0'])
  expect(still.glsl).toContain('float gptryKeep0() { return gptryN0(); }')
  expect(still.uses).toEqual([])
  // the live half: the brightness, the noise a global the reader sets, and no noise worked out
  expect(Object.keys(each.outs)).toEqual(['bright'])
  expect(each.kept).toEqual(['gptryK0'])
  expect(each.glsl).toContain('float gptryN0() { return gptryK0; }')
  expect(each.glsl).not.toContain('gpFbm')
  expect(each.uses).toEqual(['gpTime'])
  // a half asked for names it does not read is handed no kept node
  expect(compile(table, swung, 'try', 'try program', undefined, { live, of: 'live', outs: ['height'] }).kept).toEqual([''])
})
