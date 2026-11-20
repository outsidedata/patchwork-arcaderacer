// gpgpu3d's ops on a GPU: each program is compiled by `compile`, run as a fragment shader over a grid of points
// into a float target and read back, and the numbers are checked against what the op is said to do. Open
// `gpgpu3d.ops.gpu.html` from `yarn dev` in Chrome; `window.gpu` holds every check and whether all held.
import { compile, opsOf, type Program } from './gpgpu3d.ops.ts'

const table = opsOf({})
const canvas = document.createElement('canvas')
const gl = canvas.getContext('webgl2')!
if (!gl) throw new Error('no WebGL2')
if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float render targets')

// A grid of w × h points: origin + x·i + y·j, i across and j up.
type Grid = { w: number; h: number; origin: number[]; x: number[]; y: number[] }
const grid = (w: number, h: number, origin: number[], x: number[], y: number[]): Grid => ({ w, h, origin, x, y })

const compileShader = (type: number, source: string) => {
  const s = gl.createShader(type)!
  gl.shaderSource(s, source)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${gl.getShaderInfoLog(s)}\n${source}`)
  return s
}

// Up to four outs of a program at every point of a grid, each as a Float32Array, the clock as given.
function run(program: Program, outs: string[], g: Grid, time = 0): Float32Array[] {
  const c = compile(table, program, 'gpu', 'gpu program')
  const call = [0, 1, 2, 3].map(k => (outs[k] ? `${c.outs[outs[k]]}()` : '0.0')).join(', ')
  const fragment = `#version 300 es
precision highp float;
precision highp int;
uniform vec3 uOrigin;
uniform vec3 uX;
uniform vec3 uY;
${c.glsl}
out vec4 o;
void main() {
  vec3 p = uOrigin + uX * ( gl_FragCoord.x - 0.5 ) + uY * ( gl_FragCoord.y - 0.5 );
  ${c.at}( p );
  o = vec4( ${call} );
}`
  const vertex = '#version 300 es\nin vec2 a;\nvoid main() { gl_Position = vec4( a, 0.0, 1.0 ); }'
  const prog = gl.createProgram()!
  gl.attachShader(prog, compileShader(gl.VERTEX_SHADER, vertex))
  gl.attachShader(prog, compileShader(gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`${gl.getProgramInfoLog(prog)}`)
  gl.useProgram(prog)
  gl.uniform3fv(gl.getUniformLocation(prog, 'uOrigin'), g.origin)
  gl.uniform3fv(gl.getUniformLocation(prog, 'uX'), g.x)
  gl.uniform3fv(gl.getUniformLocation(prog, 'uY'), g.y)
  const clock = gl.getUniformLocation(prog, 'gpTime')
  if (clock) gl.uniform1f(clock, time)
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, g.w, g.h, 0, gl.RGBA, gl.FLOAT, null)
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.viewport(0, 0, g.w, g.h)
  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  const data = new Float32Array(g.w * g.h * 4)
  gl.readPixels(0, 0, g.w, g.h, gl.RGBA, gl.FLOAT, data)
  if (gl.getError() !== gl.NO_ERROR) throw new Error('a GL error')
  gl.deleteTexture(tex); gl.deleteFramebuffer(fb); gl.deleteBuffer(buf); gl.deleteProgram(prog)
  return outs.map((_, k) => Float32Array.from({ length: g.w * g.h }, (__, n) => data[n * 4 + k]))
}

const checks: { name: string; ok: boolean; detail: string }[] = []
const check = (name: string, ok: boolean, detail = '') => { checks.push({ name, ok, detail }) }
const f = (v: number) => v.toFixed(5)
// The largest distance between `a` and what `want` says each should be, and between two arrays.
const off = (a: ArrayLike<number>, want: (n: number) => number) => { let w = 0; for (let n = 0; n < a.length; n++) w = Math.max(w, Math.abs(a[n] - want(n))); return w }
const gap = (a: Float32Array, b: Float32Array) => off(a, n => b[n])
const stats = (a: Float32Array) => {
  let lo = Infinity, hi = -Infinity, sum = 0
  for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v }
  const mean = sum / a.length
  let ss = 0
  for (const v of a) ss += (v - mean) ** 2
  return { lo, hi, mean, std: Math.sqrt(ss / a.length) }
}
const within = (worst: number, bound: number) => worst < bound

// 64 points from 0 to 1 along x, and the 128 × 128 points a noise is judged over, 0.37 apart
const unit = grid(64, 1, [0, 0, 0], [1 / 63, 0, 0], [0, 0, 0])
const field = grid(128, 128, [-23.7, -23.7, 0.5], [0.37, 0, 0], [0, 0.37, 0])

// const, coord, scale
{
  const [k, x, s] = run({ nodes: [{ id: 'k', op: 'const', value: 3 }, { id: 'x', op: 'coord', axis: 'x' }, { id: 'sc', op: 'scale', input: 'x', by: -2.5 }], out: { k: 'k', x: 'x', s: 'sc' } }, ['k', 'x', 's'], unit)
  check('const gives its value at every point', off(k, () => 3) === 0, `worst ${off(k, () => 3)}`)
  check('coord x is the point\'s x', within(off(x, n => n / 63), 1e-6), `worst ${off(x, n => n / 63)}`)
  check('scale multiplies its input', within(off(s, n => (-2.5 * n) / 63), 1e-5), `worst ${off(s, n => (-2.5 * n) / 63)}`)
}

// combine, blend
{
  const modes = ['add', 'sub', 'mul', 'min', 'max', 'lerp']
  const want = [1.1, -0.5, 0.24, 0.3, 0.8, 0.425]
  const nodes: Program['nodes'] = [{ id: 'a', op: 'const', value: 0.3 }, { id: 'b', op: 'const', value: 0.8 }]
  const out: Record<string, string> = {}
  for (const m of modes) { nodes.push({ id: m, op: 'combine', a: 'a', b: 'b', mode: m, t: 0.25 }); out[m] = m }
  const got = [...run({ nodes, out }, modes.slice(0, 4), unit), ...run({ nodes, out }, modes.slice(4), unit)].map(a => a[0])
  modes.forEach((m, k) => check(`combine ${m}`, Math.abs(got[k] - want[k]) < 1e-6, `${got[k]} for ${want[k]}`))
  const [x, mixed] = run({ nodes: [{ id: 'a', op: 'const', value: 10 }, { id: 'b', op: 'const', value: 20 }, { id: 'x', op: 'coord', axis: 'x' }, { id: 'm', op: 'blend', a: 'a', b: 'b', by: 'x' }], out: { x: 'x', m: 'm' } }, ['x', 'm'], grid(64, 1, [-0.5, 0, 0], [2 / 63, 0, 0], [0, 0, 0]))
  const blended = (n: number) => 10 + 10 * Math.min(1, Math.max(0, x[n]))
  check('blend runs from a to b by the node, held at the ends', within(off(mixed, blended), 1e-4), `worst ${off(mixed, blended)}`)
}

// remap, ramp
{
  const nodes: Program['nodes'] = [
    { id: 'x', op: 'coord', axis: 'x' },
    { id: 'lin', op: 'remap', input: 'x', inLo: 0.25, inHi: 0.75, outLo: 10, outHi: 20 },
    { id: 'sm', op: 'remap', input: 'x', inLo: 0.25, inHi: 0.75, outLo: 10, outHi: 20, ease: 'smooth' },
    { id: 'sm2', op: 'remap', input: 'x', inLo: 0.25, inHi: 0.75, outLo: 10, outHi: 20, ease: 'smoother' },
    { id: 'inv', op: 'ramp', input: 'x', lo: 0.75, hi: 0.25 },
    { id: 'step', op: 'ramp', input: 'x', lo: 0.5, hi: 0.5 },
  ]
  const out = { x: 'x', lin: 'lin', sm: 'sm', sm2: 'sm2', inv: 'inv', step: 'step' }
  const [x, lin, sm, sm2] = run({ nodes, out }, ['x', 'lin', 'sm', 'sm2'], unit)
  const [inv, step] = run({ nodes, out }, ['inv', 'step'], unit)
  const t = (n: number) => Math.min(1, Math.max(0, (x[n] - 0.25) / 0.5))
  check('remap linear is clamped and straight', within(off(lin, n => 10 + 10 * t(n)), 1e-4), `worst ${off(lin, n => 10 + 10 * t(n))}`)
  check('remap smooth is the cubic ease', within(off(sm, n => 10 + 10 * t(n) ** 2 * (3 - 2 * t(n))), 1e-4), `worst ${off(sm, n => 10 + 10 * t(n) ** 2 * (3 - 2 * t(n)))}`)
  check('remap smoother is the quintic ease', within(off(sm2, n => 10 + 10 * t(n) ** 3 * (t(n) * (t(n) * 6 - 15) + 10)), 1e-4), '')
  check('ramp from the high edge to the low one is turned over', within(off(inv, n => Math.min(1, Math.max(0, (x[n] - 0.75) / -0.5))), 1e-5), '')
  check('ramp with lo equal to hi is a step', off(step, n => (x[n] >= 0.5 ? 1 : 0)) === 0, '')
}

// fold
{
  const kinds = ['ridge', 'billow', 'abs', 'terrace', 'wave']
  const nodes: Program['nodes'] = [{ id: 'x', op: 'coord', axis: 'x' }]
  const out: Record<string, string> = { x: 'x' }
  for (const k of kinds) { nodes.push({ id: k, op: 'fold', input: 'x', kind: k, steps: 4 }); out[k] = k }
  const [x, ridge, billow, abs] = run({ nodes, out }, ['x', 'ridge', 'billow', 'abs'], unit)
  const [terrace, wave] = run({ nodes, out }, ['terrace', 'wave'], unit)
  const stair = (v: number) => { const s = v * 4, i = Math.floor(s), fr = s - i; return (i + fr ** 3 * (fr * (fr * 6 - 15) + 10)) / 4 }
  check('fold ridge', within(off(ridge, n => (1 - Math.abs(2 * x[n] - 1)) ** 2), 1e-5), '')
  check('fold billow', within(off(billow, n => Math.abs(2 * x[n] - 1) ** 2), 1e-5), '')
  check('fold abs', within(off(abs, n => Math.abs(2 * x[n] - 1)), 1e-5), '')
  check('fold terrace', within(off(terrace, n => stair(x[n])), 1e-4), `worst ${off(terrace, n => stair(x[n]))}`)
  check('fold wave', within(off(wave, n => 0.5 + 0.5 * Math.sin(2 * Math.PI * x[n])), 1e-4), `worst ${off(wave, n => 0.5 + 0.5 * Math.sin(2 * Math.PI * x[n]))}`)
}

// time
{
  const p: Program = { nodes: [{ id: 't', op: 'time', rate: 2 }], out: { t: 't' } }
  const at5 = run(p, ['t'], unit, 5)[0][0], at7 = run(p, ['t'], unit, 7)[0][0]
  check('time is the clock the page sets times rate', at5 === 10 && at7 === 14, `${at5} ${at7}`)
}

// noise, each kind
const noise = (own: Record<string, unknown>, g: Grid = field): Float32Array =>
  run({ nodes: [{ id: 'n', op: 'noise', freq: 1, ...own }], out: { n: 'n' } }, ['n'], g)[0]
const kinds: [string, Record<string, unknown>][] = [
  ['value', { kind: 'value' }], ['simplex', { kind: 'simplex' }], ['cell', { kind: 'cell' }],
  ['worley f1', { kind: 'worley', metric: 'f1' }], ['worley f2', { kind: 'worley', metric: 'f2' }], ['worley f2-f1', { kind: 'worley', metric: 'f2-f1' }],
]
const ranges: Record<string, { lo: number; hi: number; mean: number; std: number; step: number }> = {}
for (const [name, own] of kinds) {
  const a = noise(own), s = stats(a)
  check(`${name} noise stays within 0 to 1`, s.lo >= 0 && s.hi <= 1, `${f(s.lo)} to ${f(s.hi)}`)
  check(`${name} noise is spread, not flat`, s.std > 0.05 && s.mean > 0.15 && s.mean < 0.85, `mean ${f(s.mean)}, std ${f(s.std)}`)
  const ends = a.reduce((n, v) => n + (v <= 0 || v >= 1 ? 1 : 0), 0) / a.length
  check(`${name} noise is not cut off at 0 or 1: under 0.5% of it sits on an end`, ends < 0.005, `${(ends * 100).toFixed(3)}% on an end`)
  check(`${name} noise is the same on a second run`, gap(a, noise(own)) === 0, '')
  const other = noise({ ...own, seed: 1 }), so = stats(other)
  let dot = 0, sa = 0, sb = 0
  for (let n = 0; n < a.length; n++) { dot += (a[n] - s.mean) * (other[n] - so.mean); sa += (a[n] - s.mean) ** 2; sb += (other[n] - so.mean) ** 2 }
  const corr = dot / Math.sqrt(sa * sb)
  check(`${name} noise of another seed is another noise`, Math.abs(corr) < 0.2, `correlation ${f(corr)}`)
  // twice the frequency over the points is one frequency over twice the distance
  const twice = noise({ ...own, freq: 2 }), spread = noise(own, grid(128, 128, field.origin.map(v => v * 2), field.x.map(v => v * 2), field.y.map(v => v * 2)))
  check(`${name} noise at twice the frequency is the noise over twice the distance`, within(gap(twice, spread), 1e-4), `worst ${gap(twice, spread)}`)
  // the largest step between neighbours 0.01 apart
  const c = noise(own, grid(128, 128, [-0.6, -0.6, 0.5], [0.01, 0, 0], [0, 0.01, 0]))
  let step = 0
  for (let j = 0; j < 128; j++) for (let i = 1; i < 128; i++) step = Math.max(step, Math.abs(c[j * 128 + i] - c[j * 128 + i - 1]))
  ranges[name] = { ...s, step }
  if (name === 'cell') {
    const inside = noise(own, grid(8, 8, [0.05, 0.05, 0.5], [0.1, 0, 0], [0, 0.1, 0]))
    check('cell noise is one value inside a lattice cell and steps between them', gap(inside, new Float32Array(64).fill(inside[0])) === 0 && step > 0.1, `largest step ${f(step)}`)
  } else {
    check(`${name} noise moves smoothly: no step over 0.01 above 0.06`, step < 0.06, `largest step ${f(step)}`)
  }
}

// noise, its other fields
{
  const flat = noise({ kind: 'value', stretch: [1, 0, 1] }, grid(32, 32, [0.3, 0, 0.7], [0.37, 0, 0], [0, 5.3, 0]))
  check('a noise stretched to 0 along y does not change along y', off(flat, n => flat[n % 32]) === 0, `worst ${off(flat, n => flat[n % 32])}`)
  const one = noise({ kind: 'value', octaves: 1 }), four = noise({ kind: 'value', octaves: 4 }), s4 = stats(four)
  check('four octaves are another noise than one, and still 0 to 1', gap(one, four) > 0.05 && s4.lo >= 0 && s4.hi <= 1, `${f(gap(one, four))}, ${f(s4.lo)} to ${f(s4.hi)}`)
  const turned = noise({ kind: 'value', rotate: Math.PI / 2 }), straight = noise({ kind: 'value' })
  check('rotating the noise about y turns it', gap(turned, straight) > 0.05, f(gap(turned, straight)))
  const wide = noise({ kind: 'value', stretch: [0.5, 1, 1] }), narrow = noise({ kind: 'value', freq: 0.5, stretch: [1, 2, 2] })
  check('stretch scales each axis of the frequency', within(gap(wide, narrow), 1e-6), f(gap(wide, narrow)))
}

// warp
{
  const base = { id: 'n', op: 'noise', kind: 'value', freq: 0.3 }
  const [warped] = run({ nodes: [base, { id: 'one', op: 'const', value: 1 }, { id: 'w', op: 'warp', input: 'n', x: 'one', amount: 3 }], out: { w: 'w' } }, ['w'], field)
  const [moved] = run({ nodes: [base], out: { w: 'n' } }, ['w'], grid(128, 128, [field.origin[0] + 3, field.origin[1], field.origin[2]], field.x, field.y))
  check('warp runs its input at the point moved by amount times its nodes', within(gap(warped, moved), 1e-4), `worst ${gap(warped, moved)}`)
  const [none] = run({ nodes: [base, { id: 'one', op: 'const', value: 1 }, { id: 'w', op: 'warp', input: 'n', x: 'one', amount: 0 }], out: { w: 'w' } }, ['w'], field)
  const [plain] = run({ nodes: [base], out: { w: 'n' } }, ['w'], field)
  check('warp by 0 is its input', gap(none, plain) === 0, '')
  // one node read at the point and under a warp, by two outputs: each its own value, the one worked out once
  const [here, there] = run({ nodes: [base, { id: 'one', op: 'const', value: 1 }, { id: 'w', op: 'warp', input: 'n', x: 'one', amount: 3 }], out: { here: 'n', there: 'w' } }, ['here', 'there'], field)
  check('a node read at the point and under a warp has its value at each', gap(here, plain) === 0 && within(gap(there, moved), 1e-4), `${gap(here, plain)}, ${gap(there, moved)}`)
}

// one sheet that holds two algorithms, and the output that reaches the dearer one
{
  const sheet: Program = { nodes: [
    { id: 'patch', op: 'noise', kind: 'simplex', freq: 0.07, seed: 3, octaves: 3 },
    { id: 'tall', op: 'remap', input: 'patch', inLo: 0.3, inHi: 0.7, outLo: 0.6, outHi: 1.5, ease: 'smooth' },
    { id: 'tuft', op: 'noise', kind: 'worley', metric: 'f1', freq: 1.8, seed: 9 },
    { id: 'both', op: 'combine', a: 'tall', b: 'tuft', mode: 'mul' },
  ], out: { cheap: 'tall', rich: 'both' } }
  const [cheap, rich] = run(sheet, ['cheap', 'rich'], field)
  const a = stats(cheap), b = stats(rich)
  check('the cheap output of a sheet stays within its remap', a.lo >= 0.6 - 1e-5 && a.hi <= 1.5 + 1e-5 && a.std > 0.05, `${f(a.lo)} to ${f(a.hi)}, std ${f(a.std)}`)
  check('the rich output is the cheap one times the tufts', b.lo >= 0 && b.hi <= 1.5 + 1e-5 && gap(cheap, rich) > 0.1, `${f(b.lo)} to ${f(b.hi)}`)
}

const failed = checks.filter(c => !c.ok)
;(window as any).gpu = { done: true, failed: failed.length, checks, ranges }
document.getElementById('out')!.textContent = `${checks.length - failed.length} of ${checks.length} held\n` + checks.map(c => `${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? `  (${c.detail})` : ''}`).join('\n')
