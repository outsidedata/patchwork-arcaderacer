// The math plugin hands back the same bits wherever it runs. Each function's results over 20,000 seeded
// inputs, drawn with exact arithmetic alone, hash to the values pinned here: they were pinned from node
// 22 and Chrome 157 alike, so this test fails on any change to a bit, on any engine it runs in. Where
// JavaScript fixes the answer (NaN, ±0, ±Infinity, ±1 and the rest of each function's special cases),
// each hands back exactly what `Math` does. Every top-level plugin's server half, and every mod one of
// them asks, computes with it.
import { expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as math from './math.sim.ts'

type Fn = (...a: number[]) => number
const fns = math as unknown as Record<string, Fn>
const ONE = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'cbrt']
const TWO = ['atan2', 'pow', 'hypot']

// FNV-1a over the 8 bytes of every result. Inputs span angles, huge and tiny numbers, the unit interval
// and every size from 2⁻⁶⁰ to 2⁶⁰; 2^e is made by doubling, since `**` is one of the functions that
// differ between engines.
function hashes() {
  let s = 5
  const die = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  const two = (e: number) => { let p = 1; for (let i = 0; i < Math.abs(e); i++) p = e > 0 ? p * 2 : p / 2; return p }
  const ranges = [() => (die() - 0.5) * 40, () => (die() - 0.5) * 1e9, () => (die() - 0.5) * 2.2, () => die() * 1000,
    () => (die() < 0.5 ? -1 : 1) * (1 + die()) * two(Math.floor(die() * 120) - 60), () => (die() - 0.5) * 1e-6]
  const pick = () => ranges[Math.floor(die() * ranges.length)]()
  const f = new Float64Array(1), b = new Uint8Array(f.buffer)
  const out: Record<string, string> = {}
  for (const name of [...ONE, ...TWO]) {
    let h = 0x811c9dc5
    for (let k = 0; k < 20000; k++) {
      const x = pick(), y = pick()
      f[0] = name === 'atan2' || name === 'hypot' ? fns[name](x, y) : name === 'pow' ? fns[name](x, y / 50) : fns[name](x)
      for (let i = 0; i < 8; i++) h = Math.imul(h ^ b[i], 16777619) >>> 0
    }
    out[name] = h.toString(16)
  }
  return out
}

test('every function hands back the bits pinned from node and Chrome alike', () => {
  expect(hashes()).toEqual({
    sin: '1d315733', cos: 'eef5f48a', tan: '7b04cf6c', asin: 'db8d7605', acos: '496a20b0', atan: '8bd5521a',
    sinh: 'aa82196c', cosh: '52433f32', tanh: '83e5ec96', asinh: '8888314a', acosh: '37dbfa39', atanh: 'a15d24f8',
    exp: 'b83c427', expm1: '221ad276', log: '7dab7631', log1p: 'eea4f829', log2: '12e00670', log10: '851b9079',
    cbrt: '6118c65e', atan2: '80d11f7b', pow: '439fa394', hypot: '3643991a',
  })
})

test('where JavaScript fixes the answer, each hands back what Math does', () => {
  // JavaScript fixes every one of them at NaN, ±0 and ±Infinity, and these at ±1 (ECMA-262, the
  // Math object). Elsewhere the last bit is the engine's: Chrome's `Math.expm1(1)` is not fdlibm's.
  const special = [NaN, 0, -0, Infinity, -Infinity]
  const atOne: [string, number][] = [['acos', 1], ['acosh', 1], ['log', 1], ['log2', 1], ['log10', 1], ['log1p', -1], ['atanh', 1], ['atanh', -1]]
  for (const name of ONE) {
    for (const x of special) expect([name, x, fns[name](x)]).toEqual([name, x, (Math as unknown as Record<string, Fn>)[name](x)])
  }
  for (const [name, x] of atOne) expect([name, x, fns[name](x)]).toEqual([name, x, (Math as unknown as Record<string, Fn>)[name](x)])
  const pairs = [...special, 1, -1, 0.5, -0.5, 2, -2, 3, -3]
  for (const name of TWO) {
    for (const x of pairs) for (const y of pairs) {
      const want = (Math as unknown as Record<string, Fn>)[name](x, y)
      // Away from the special cases a value's last bit is the engine's: those are the hashes' to pin.
      const fixed = !Number.isFinite(want) || Number.isNaN(want) || want === 0 || Number.isInteger(want) || [x, y].some(v => !Number.isFinite(v) || v === 0)
      if (fixed) expect([name, x, y, fns[name](x, y)]).toEqual([name, x, y, want])
    }
  }
  expect(Object.is(math.sin(-0), -0)).toBe(true)
  expect(Object.is(math.atan2(-0, 1), -0)).toBe(true)
  expect(Object.is(math.atan2(0, -1), Math.PI)).toBe(true)
  expect(Object.is(math.pow(-0, 3), -0)).toBe(true)
  expect(math.pow(2, 40)).toBe(1099511627776)
  expect(math.pow(NaN, 0)).toBe(1)
  expect(math.pow(1, Infinity)).toBeNaN()
  expect(math.hypot()).toBe(0)
  expect(math.hypot(NaN, Infinity)).toBe(Infinity)
  expect(math.hypot(3, 4, 12)).toBe(13)
  expect(math.exp(1)).toBe(Math.E)
})

// An argument past 2¹⁹·π/2 is reduced by 2/π to 1,584 bits (__kernel_rem_pio2): the largest double is
// where that runs longest.
test('trigonometry of a huge argument agrees with another library to the last place or one past it', () => {
  // Chrome 157's Math.sin and Math.cos, which are LLVM's libc, not fdlibm.
  expect(math.sin(1e22)).toBeCloseTo(-0.8522008497671888, 15)
  expect(math.cos(1e22)).toBeCloseTo(0.523214785395139, 15)
  expect(math.sin(Number.MAX_VALUE)).toBeCloseTo(0.004961954789184062, 15)
  expect(math.cos(Number.MAX_VALUE)).toBeCloseTo(-0.9999876894265599, 15)
})

// A rule writes `math.pow(2, bits)` where it packs bits and `math.pow(13, 5)` for a count: each is a
// whole power, and comes back exact. Since the bits are the same on every engine, node shows it for all.
test('a whole power of a whole number comes back exact', () => {
  let p = 1
  for (let k = 0; k <= 1023; k++, p *= 2) expect([k, math.pow(2, k)]).toEqual([k, p])
  p = 1
  for (let k = 0; k >= -1074; k--, p /= 2) expect([k, math.pow(2, k)]).toEqual([k, p])
  for (let b = 2; b <= 64; b++) {
    let q = 1
    for (let e = 0; q * b <= Number.MAX_SAFE_INTEGER; e++, q *= b) expect([b, e, math.pow(b, e)]).toEqual([b, e, q])
  }
})

// Core's three is outsidedata/three.js, whose `src/math` turns every angle with a copy of this
// plugin's code (`src/math/DeterministicMath.js`, its test pinning these same hashes). So a rule may
// use three's vectors, quaternions and matrices: here they hand back what this plugin hands back, bit
// for bit, where node's own `Math.sin` and `Math.cos` are not fdlibm's and differ on some of these.
test('three\'s src/math turns angles with these maths', async () => {
  const { Euler, Matrix4, Quaternion, Vector3 } = await import('three')
  const axis = new Vector3(1, 2, 3).normalize()
  let native = 0
  for (let i = 0; i < 2000; i++) {
    const angle = (i - 1000) * 0.00731
    const s = math.sin(angle / 2)
    if (Math.sin(angle / 2) !== s || Math.cos(angle) !== math.cos(angle)) native++
    expect([angle, new Quaternion().setFromAxisAngle(axis, angle).toArray()]).toEqual([angle, [axis.x * s, axis.y * s, axis.z * s, math.cos(angle / 2)]])
    const m = new Matrix4().makeRotationX(angle)
    expect([angle, m.elements[5], m.elements[6]]).toEqual([angle, math.cos(angle), math.sin(angle)])
    const e = new Euler().setFromRotationMatrix(new Matrix4().makeRotationY(angle / 3))
    expect([angle, e.y]).toEqual([angle, math.asin(Math.min(Math.max(math.sin(angle / 3), -1), 1))])
  }
  // Stock three, which calls `Math`, would come back different on these.
  expect(native).toBeGreaterThan(0)
})

// Every top-level plugin's server half, and every mod one of them asks (a function of the server's
// `w`), runs in the truth on node and in a page that runs the scene ahead, so it computes with this
// plugin: it calls none of `Math`'s functions that engines differ on and writes no `**`. From three it
// takes only the classes of three's `src/math`, which turn angles with this plugin's code (above): the
// rest of three, its curves and its scene graph among them, calls `Math` as the engine has it. A
// game's own rules are held to the same in `games/games.test.ts`. Comments are read past.
const VARIES = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\b|\*\*/
const ASKS = /\b(?:mod|modsOf)\b[^;]*?\(\s*(?:w\.)?world\s*,\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/g
// What a file takes from three that is not a class of three's `src/math`: every name of each
// `import { … } from 'three'` but `type` ones, and a whole `import * as`.
const threeMath = new Set(readdirSync(new URL('../../node_modules/three/src/math/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3)))
const notThreeMath = (c: string) => [
  ...[...c.matchAll(/import\s+\{([^}]*)\}\s*from\s*'three'/g)].flatMap(m => m[1].split(',').map(n => n.trim()).filter(n => n && !n.startsWith('type ')).map(n => n.split(/\s+as\s+/)[0]))
    .filter(n => !threeMath.has(n)),
  ...[...c.matchAll(/import\s+\*\s+as\s+\w+\s+from\s*'three'/g)].map(m => m[0]),
]

test('no plugin\'s server half, nor a mod one asks, computes with what engines differ on', () => {
  const root = new URL('../../', import.meta.url).pathname
  const files = (readdirSync(join(root, 'plugins'), { recursive: true }) as string[]).map(f => join('plugins', f))
    .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  const code = (f: string) => readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const sims = files.filter(f => f.endsWith('.sim.ts') && f !== 'plugins/math/math.sim.ts')
  expect(sims.length).toBeGreaterThan(20)
  const asked = new Set(sims.flatMap(f => [...code(f).matchAll(ASKS)].map(m => `${m[1]}.${m[2]}`)))
  // A mod is `<a>/<a>.<p>.ts`; it runs in the truth when it exports a function a server half asks for.
  const truthMods = files.filter(f => {
    const m = /(?:^|\/)([a-z0-9]+)\/\1\.([a-z0-9]+)\.ts$/.exec(f)
    if (!m) return false
    return [...code(f).matchAll(/\bexport\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].some(e => asked.has(`${m[2]}.${e[1]}`))
  })
  expect(truthMods).toContain('plugins/terrain3d/terrain3d.hitscan3d.ts')
  expect(truthMods).toContain('plugins/scatter3d/scatter3d.box3d.ts')
  expect(threeMath.has('Quaternion')).toBe(true)
  const breaking = [...sims, ...truthMods].filter(f => VARIES.test(code(f)) || notThreeMath(code(f)).length > 0)
  expect(breaking).toEqual([])
})
