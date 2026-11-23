// pack-looks on a file of a hundred materials, eleven settings each, as compose.js writes them: one
// sampler declared in place of 1100 uniforms, each copy reading its own texel, and the table holding
// every value; a file read any other way, or naming a setting it does not hand back, throws naming it.
import { expect, test } from 'vitest'
import { fold, pack, packLooks, type Uniforms } from './pack-looks.ts'

const uniforms: Uniforms = {}
let fragmentPars = ''
for (let id = 0; id < 100; id++) {
  const copies: string[] = []
  for (let s = 0; s < 11; s++) {
    const type = s % 4 === 3 ? 'vec3' : 'float'
    uniforms[`L${id}_k${s}`] = { type, value: type === 'vec3' ? [id, s, 1] : id + s / 100 }
    fragmentPars += `uniform ${type} L${id}_k${s};\n`
    copies.push(`  p_k${s} = L${id}_k${s};`)
  }
  fragmentPars += `void look_${id}(inout Look k) {\n${copies.join('\n')}\n}\n`
}
const part = { ids: [...Array(100).keys()], fragmentPars, features: {} }

test('a hundred materials of eleven settings each read from one sampler, and the table holds every value', () => {
  const packed = packLooks({
    about: 'a test', picture: 64, vertexPars: '', vertexMain: '', needs: [], pictures: [],
    materials: part.ids.map(id => ({ name: `m${id}`, look: 'rock', call: 'solid' as const, colour: [0.5, 0.5, 0.5] })),
    calls: { solid: part, relief: null, seeThrough: null, all: part },
    uniforms,
  })
  expect('uniforms' in packed).toBe(false)
  expect(packed.settings.width).toBe(11)
  expect(packed.settings.materials).toHaveLength(100)
  expect(packed.settings.materials[57][3]).toEqual({ name: 'k3', type: 'vec3', value: [57, 3, 1] })
  expect(packed.settings.materials[57][4]).toEqual({ name: 'k4', type: 'float', value: 57.04 })
  for (const call of ['solid', 'all'] as const) {
    const f = packed.calls[call]!.fragmentPars
    expect(f.match(/^uniform .*$/gm)).toEqual(['uniform highp sampler2D lookSettings;'])
    expect(f).not.toMatch(/\bL\d+_/)
    expect(f.match(/^void look_\d+\(.*$/gm)).toEqual(['void look_0(inout Look k, int lookRow) {'])
    expect(f).toContain('  p_k3 = texelFetch(lookSettings, ivec2(3, lookRow), 0).rgb;\n  p_k4 = texelFetch(lookSettings, ivec2(4, lookRow), 0).r;')
  }
  expect(packed.calls.relief).toBeNull()
})

test('a look\'s vertex code reads its settings from the same table: its declarations taken out, its copies its texels', () => {
  const vertexPars = 'uniform float L57_k4;\nuniform vec3 L57_k3;\nfloat p_k4;\nvec3 p_k3;\nvoid lookVertex_57() {\n  p_k4 = L57_k4;\n  p_k3 = L57_k3;\n  gl_Position.y += p_k4;\n}\n'
  const { vertexPars: v } = pack({ solid: part, relief: null, seeThrough: null, all: null }, vertexPars, uniforms, 100)
  expect(v.match(/^uniform .*$/gm)).toEqual(['uniform highp sampler2D lookSettings;'])
  expect(v).not.toMatch(/\bL\d+_/)
  expect(v).toContain('  p_k4 = texelFetch(lookSettings, ivec2(4, 57), 0).r;\n  p_k3 = texelFetch(lookSettings, ivec2(3, 57), 0).rgb;')
})

test('the materials of one look fold into one function a look, each called with its own row; a look that differs but for its row stays its own', () => {
  const text = [
    'float p_a;',
    'void look_0(inout Look k) {\n  p_a = texelFetch(lookSettings, ivec2(0, 0), 0).r;\n  k.rough = p_a;\n}',
    'void look_1(inout Look k) {\n  p_a = texelFetch(lookSettings, ivec2(0, 1), 0).r;\n  k.metal = p_a;\n}',
    'void look_2(inout Look k) {\n  p_a = texelFetch(lookSettings, ivec2(0, 2), 0).r;\n  k.rough = p_a;\n}',
    'void look_3(inout Look k) {\n  p_a = texelFetch(lookSettings, ivec2(0, 3), 0).r;\n  k.metal = p_a;\n}',
    'float lookShadow_0(vec3 Lview) {\n  return texelFetch(lookSettings, ivec2(1, 0), 0).r * Lview.y;\n}',
    'float lookShadow_2(vec3 Lview) {\n  return texelFetch(lookSettings, ivec2(1, 2), 0).r * Lview.y;\n}',
    'Look lookRun(int id) {\n  Look k = lookStart();\n  switch (id) {\n    case 0: look_0(k); break;\n    case 1: look_1(k); break;\n    case 2: look_2(k); break;\n    case 3: look_3(k); break;\n  }\n  return k;\n}',
    'float lookShadow(int id, vec3 Lview) {\n  switch (id) {\n    case 0: return lookShadow_0(Lview);\n    case 2: return lookShadow_2(vec3(Lview.x, max(Lview.y, 0.0), Lview.z));\n  }\n  return 1.0;\n}',
    '',
  ].join('\n')
  expect(fold('solid', text)).toBe([
    'float p_a;',
    'void look_0(inout Look k, int lookRow) {\n  p_a = texelFetch(lookSettings, ivec2(0, lookRow), 0).r;\n  k.rough = p_a;\n}',
    'void look_1(inout Look k, int lookRow) {\n  p_a = texelFetch(lookSettings, ivec2(0, lookRow), 0).r;\n  k.metal = p_a;\n}',
    'float lookShadow_0(vec3 Lview, int lookRow) {\n  return texelFetch(lookSettings, ivec2(1, lookRow), 0).r * Lview.y;\n}',
    'Look lookRun(int id) {\n  Look k = lookStart();\n  switch (id) {\n    case 0: look_0(k, 0); break;\n    case 1: look_1(k, 1); break;\n    case 2: look_0(k, 2); break;\n    case 3: look_1(k, 3); break;\n  }\n  return k;\n}',
    'float lookShadow(int id, vec3 Lview) {\n  switch (id) {\n    case 0: return lookShadow_0(Lview, 0);\n    case 2: return lookShadow_0(vec3(Lview.x, max(Lview.y, 0.0), Lview.z), 2);\n  }\n  return 1.0;\n}',
    '',
  ].join('\n'))
  expect(fold('solid', 'float kn(vec2 p) { return p.x; }\n')).toBe('float kn(vec2 p) { return p.x; }\n')
  expect(() => fold('all', `int lookRow;\n${text}`)).toThrow('the all call names lookRow already, which folding its looks would declare')
})

test('a setting read other than by its copy, and one the file does not hand back, each throw naming it and the call', () => {
  const other = { ...part, fragmentPars: `${fragmentPars}float twice() { return L4_k0 * 2.0; }\n` }
  expect(() => pack({ solid: other, relief: null, seeThrough: null, all: null }, '', uniforms, 100)).toThrow('the solid call reads L4_k0 other than by its declaration and its copy into p_, which cannot be moved into the settings table')
  const unknown = { ...part, fragmentPars: `${fragmentPars}uniform float L4_nope;\n` }
  expect(() => pack({ solid: null, relief: null, seeThrough: null, all: unknown }, '', uniforms, 100)).toThrow('the all call reads L4_nope, which is no setting the looks file hands back')
  expect(() => pack({ solid: part, relief: null, seeThrough: null, all: null }, '', uniforms, 50)).toThrow('the looks file hands back the setting L50_k0, which is no L<id>_<name> of its 50 materials')
})
