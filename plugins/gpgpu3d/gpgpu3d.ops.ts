// gpgpu3d's ops: a list of operations a sheet writes, compiled to GLSL that any plugin's shader calls. A
// program is terrain3d's height program on the GPU: nodes that run in order, each an `op` and the numbers
// and inputs that op takes, an input naming an earlier node, so a cycle cannot be written, and `out` naming
// the nodes whose values the reader asks for. The reader's shader evaluates it at a point, on the GPU, with
// nothing worked out on the CPU: the compiler here writes the GLSL and checks the sheet, and that is all.
//
// A program:
//   nodes   `[{ id, op, <inputs>, <numbers> }]`, in order. `id` is the node's own name, distinct. `op` is a
//           word of the table below. An input is a field naming a node before this one; a number is a field of
//           the op's own. A field the op does not take throws, naming the op and what it does take.
//   out     `{ <name>: <node id> }`: each name the reader asks for, and the node whose value it is. A node no
//           `out` reaches is not compiled, so a sheet that holds a cheap algorithm and a costly one costs what
//           the nodes its `out` reaches cost. A name the reader asks as a colour is not one node but one of
//             `{ r, g, b }`   three nodes, each 0 to 1, the colour itself
//             `{ to, by }`    the colour the reader has, mixed toward the hex `to` (`"#c8b040"`) by the node
//                             `by`, 0 (none of it) to 1 (all of it)
//           and both are written in sRGB, as a sheet writes any colour. The reader says which names are numbers
//           and which are colours (`allowed`), and a name given the wrong form throws.
//
// Every node is a float, and a function of the point. What the point is, is the reader's to say: grass3d
// hands the foot of the blade. The reader hands it once, and every node is worked out at most once at it
// however many outputs and nodes read it, so a sheet whose outputs share a noise pays for the noise once.
// `warp` runs its input at another point: the nodes that input reads are worked out there, a time for each
// warp, and cost what they cost again.
//
// The table of ops. gpgpu3d brings the ones every program wants, and a plugin brings one of its own, an
// op that reads what only that plugin's shader has in scope (grass3d's `dist`, a blade's metres from the
// camera), with `<a>.gpgpu3d.ts` exporting `ops()` and the scene naming `a` in `world.gpgpu3d.mods.ops`.
// A delivered op takes the place of one of the same word, a built-in included. An op is what a word's
// owner writes:
//   inputs    the fields that name a node, all needed
//   optional  the fields that name a node, which may be left out
//   params    `{ <field>: Param }`: a Param is `{ type: 'number', default?, min?, above?, max? }`,
//             `{ type: 'whole', default?, min?, max? }`, `{ type: 'choice', of, default? }` or
//             `{ type: 'vec3', default? }`. A param with no default is needed. The numbers go into the GLSL
//             as they are, so a sheet that changes is compiled again.
//   needs     the names of gpgpu3d's libraries (below) its GLSL calls
//   lib       GLSL of the op's own, put in once however many nodes use the op. Every name it defines begins
//             with the op's word (gpgpu3d's own ops put `gp` before it)
//   moves     true for an op whose value at a point is another from frame to frame: `time`, the clock, and
//             grass3d's `dist`, the camera's distance. A node moves when its op does, or a node it reads does
//   check     optional: a sentence naming what is wrong with a node whose fields are each right alone
//   expr(c)   the GLSL expression of a node of this op. `c.p` is the point, `c.input(name, at?)` the GLSL of
//             the input `name` run at `at` (the point when left out), `c.has(name)` whether an optional
//             input is given, `c.param(name)` a number as a GLSL literal (a choice as its place in `of`),
//             `c.value(name)` it as the sheet wrote it. It is asked once for the node worked out at the
//             reader's point and again for the node worked out at another, where `c.p` is that point
// An expression names each input once, so an input is run once however the op uses it: an op that needs a
// value twice takes it as the argument of a function of its `lib`.
//
// The libraries are GLSL gpgpu3d keeps for any op to call: `hash` (an integer hash of a lattice point, so
// the same on every GPU), `noise` (value, simplex, worley and cell noise, and their octaves), `ramp`, and
// `time`, the page's clock in `gpTime`, which gpgpu3d holds and sets each frame. A library names the shared
// uniforms it reads, and the program hands them back for the reader to put in its material.
//
// The built-in ops:
//   const      `value`
//   coord      `axis` (x, y, z): that coordinate of the point
//   time       `rate`: the page's clock in seconds times rate
//   roll       `salt`: the random number of the thing the reader is working out (a blade, a lock), 0 to 1, the
//              same thing the same number every frame and another for each salt. The reader's shader says what
//              it is, `float gpRollOf( int salt )`, as a keeper's reader does (`gpgpu3d.keeper.ts`)
//   noise     `kind` (value, simplex, worley, cell), `freq` cycles a metre, `seed`, `octaves`, `lacunarity`,
//              `gain`, `rotate` radians about y, `stretch` [x, y, z] (a 0 flattens that axis), `metric` (f1, f2,
//              f2-f1, worley's): about 0 to 1. `cell` is a hash of the lattice cell, blocks of one value
//   warp       `input`, `x`, `y`, `z` (nodes, any of them), `amount` metres: `input` run at the point moved
//              `amount` times (x, y, z)
//   fold       `input`, `kind` (ridge, billow, abs, terrace, wave), `steps`: the 0 to 1 `input` folded
//   remap      `input`, `inLo`, `inHi`, `outLo`, `outHi`, `ease` (linear, smooth, smoother): clamped and eased
//   ramp       `input`, `lo`, `hi`: 0 to 1 across lo to hi, turned over when lo is above hi, a step when equal
//   combine    `a`, `b`, `mode` (add, sub, mul, min, max, lerp), `t` (0.5, lerp's)
//   blend      `a`, `b`, `by` (a node): `a` where `by` is 0 and `b` where it is 1
//   scale      `input`, `by`
//
// What the compiler hands back (`compile`): `glsl`, the libraries and ops' GLSL, then the nodes an `out`
// reaches, a function for each that holds its value once worked out, and one for each name of `out`,
// `float gp<name>Out_<out>()`, or for a colour `vec3 gp<name>Out_<out>( vec3 base )`, `base` the colour the
// reader has, which a `{ to, by }` mixes toward its own and a `{ r, g, b }` leaves; `at`, the name of
// `void at( vec3 p )`, which the reader calls once for each point
// with the point, before it reads any output (it forgets every value worked out at the last); `outs`, each
// name of `out` and its function's name; `kinds`, each name of `out` and whether it is a number or a colour;
// and `uses`, the shared uniforms the GLSL reads. `name` is the
// reader's own word for the program, letters and digits, put in every name so two programs can stand in one
// shader. Every name of the compiler's own begins with `gp`. A reader that asks an output with no `at` first
// reads the values of the last point it gave, or of a point of 0.
//
// Still and moving. `moves` is, for each name of `out`, whether a node it reads moves. A value that does not
// move is the same every frame at the same point, so a reader that keeps what it works out (grass3d keeps each
// blade's in a texture) works it out once. Such a reader compiles the program in two halves, each with a
// `part`, `{ live, of, outs? }`: `live` the names of `out` it works out each frame, every one that moves among
// them; `of` the half, `still` or `live`; `outs` the names of that half to compile, all of them when left out.
//   still   the names not in `live`, for the shader that runs once. `kept` is a function for each kept node,
//           `float gp<name>Keep<n>()`: a node that does not move and that the live half reads at the reader's
//           point. The reader keeps each value with the rest
//   live    the names in `live`, for the shader that runs each frame. `kept` is a global for each kept node,
//           `float gp<name>K<n>`, in the same order, or '' for one these `outs` do not read: the reader sets
//           each from what it kept before it reads an output, and nothing a kept node reads is worked out again
// The two halves number the kept nodes alike whatever their `outs`. With no `part` the whole program is
// compiled for one shader, and `kept` is empty.
//
// For a tool that tunes a program, `rangeOf(param, value)` is the slider of one number of a node: its least,
// its most and its step, from what the op says the number may be.
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

export type Param =
  | { type: 'number'; default?: number; min?: number; above?: number; max?: number }
  | { type: 'whole'; default?: number; min?: number; max?: number }
  | { type: 'choice'; of: string[]; default?: string }
  | { type: 'vec3'; default?: [number, number, number] }
export type Fields = Record<string, unknown>
export type Ctx = {
  p: string
  input(name: string, at?: string): string
  has(name: string): boolean
  param(name: string): string
  value(name: string): unknown
}
export type Op = {
  inputs?: string[]
  optional?: string[]
  params?: Record<string, Param>
  needs?: string[]
  lib?: string
  moves?: boolean
  check?(node: Fields): string | undefined
  expr(c: Ctx): string
}
export type Ops = () => Record<string, Op>
export type OpTable = Record<string, Op>
export type Lib = { glsl: string; needs?: string[]; uses?: string[] }
export type Node = { id: string; op: string; [field: string]: unknown }
// What a name of `out` is: a node (a number), or a colour, either `{ r, g, b }` of three nodes or a tint
// `{ to, by }`, the reader's own colour mixed toward the hex `to` by the node `by`.
export type Kind = 'number' | 'colour'
export type Out = string | { r: string; g: string; b: string } | { to: string; by: string }
export type Program = { nodes: Node[]; out: Record<string, Out> }
export type Compiled = { glsl: string; outs: Record<string, string>; kinds: Record<string, Kind>; at: string; uses: string[]; moves: Record<string, boolean>; kept: string[] }
// One half of a program a reader works out in two places (Still and moving, in the header): `live` every name
// of `out` the reader works out each frame, `of` which half this is, `outs` the names of that half to compile,
// all of them when left out.
export type Part = { live: string[]; of: 'still' | 'live'; outs?: string[] }

// A number as a GLSL float.
const float = (v: number) => {
  const s = String(v)
  const lit = /[.e]/.test(s) ? s : `${s}.0`
  return v < 0 ? `(${lit})` : lit
}
const whole = (v: number) => String(v)

const KINDS = ['value', 'simplex', 'worley', 'cell']
const METRICS = ['f1', 'f2', 'f2-f1']
const FOLDS = ['ridge', 'billow', 'abs', 'terrace', 'wave']
const EASES = ['linear', 'smooth', 'smoother']
const MODES = ['add', 'sub', 'mul', 'min', 'max', 'lerp']
const AXES = ['x', 'y', 'z']

// A colour written as a sheet writes one, `#rrggbb` in sRGB, as the linear numbers a shader works in.
const HEX = /^#[0-9a-fA-F]{6}$/
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearOf = (hex: string) => [1, 3, 5].map(i => linear(parseInt(hex.slice(i, i + 2), 16) / 255))

// The nodes an `out` reads.
const nodesOf = (to: Out): string[] => (typeof to === 'string' ? [to] : 'by' in to ? [to.by] : [to.r, to.g, to.b])
const kindOf = (to: Out): Kind => (typeof to === 'string' ? 'number' : 'colour')

// The libraries of gpgpu3d's own.
export const libs: Record<string, Lib> = {
  time: { glsl: 'uniform float gpTime;', uses: ['gpTime'] },
  colour: {
    glsl: /* glsl */ `
vec3 gpLinear( vec3 c ) {
  c = clamp( c, 0.0, 1.0 );
  return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) );
}`,
  },
  ramp: {
    glsl: /* glsl */ `
float gpRamp( float v, float lo, float hi ) {
  return lo == hi ? ( v >= lo ? 1.0 : 0.0 ) : clamp( ( v - lo ) / ( hi - lo ), 0.0, 1.0 );
}`,
  },
  hash: {
    glsl: /* glsl */ `
uint gpMix( uint x ) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
uint gpHash( ivec3 c, uint seed ) {
  uvec3 q = uvec3( c );
  return gpMix( q.x * 0x8da6b343u ^ q.y * 0xd8163841u ^ q.z * 0xcb1ab31fu ^ seed );
}
float gpHashF( ivec3 c, uint seed ) {
  return float( gpHash( c, seed ) >> 8u ) / 16777216.0;
}
vec3 gpHash3( ivec3 c, uint seed ) {
  uint h = gpHash( c, seed );
  return vec3( float( h & 1023u ), float( ( h >> 10u ) & 1023u ), float( h >> 22u ) ) / 1023.0;
}`,
  },
  noise: {
    needs: ['hash'],
    glsl: /* glsl */ `
vec3 gpRotY( vec3 p, float c, float s ) {
  return vec3( c * p.x - s * p.z, p.y, s * p.x + c * p.z );
}
float gpQuintic( float t ) {
  return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 );
}
float gpValue( vec3 p, uint seed ) {
  vec3 fl = floor( p );
  ivec3 i = ivec3( fl );
  vec3 f = p - fl;
  vec3 v = vec3( gpQuintic( f.x ), gpQuintic( f.y ), gpQuintic( f.z ) );
  return mix(
    mix( mix( gpHashF( i, seed ), gpHashF( i + ivec3( 1, 0, 0 ), seed ), v.x ), mix( gpHashF( i + ivec3( 0, 1, 0 ), seed ), gpHashF( i + ivec3( 1, 1, 0 ), seed ), v.x ), v.y ),
    mix( mix( gpHashF( i + ivec3( 0, 0, 1 ), seed ), gpHashF( i + ivec3( 1, 0, 1 ), seed ), v.x ), mix( gpHashF( i + ivec3( 0, 1, 1 ), seed ), gpHashF( i + ivec3( 1, 1, 1 ), seed ), v.x ), v.y ),
    v.z );
}
float gpCell( vec3 p, uint seed ) {
  return gpHashF( ivec3( floor( p ) ), seed );
}
float gpWorley( vec3 p, uint seed, int metric ) {
  vec3 fl = floor( p );
  ivec3 b = ivec3( fl );
  vec3 f = p - fl;
  float d1 = 8.0, d2 = 8.0;
  for ( int z = -1; z <= 1; z++ ) {
    for ( int y = -1; y <= 1; y++ ) {
      for ( int x = -1; x <= 1; x++ ) {
        ivec3 o = ivec3( x, y, z );
        ivec3 c = b + o;
        vec3 at = vec3( o ) + gpHash3( c, seed );
        float d = distance( at, f );
        if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
      }
    }
  }
  if ( metric == 0 ) return clamp( d1, 0.0, 1.0 );
  if ( metric == 1 ) return clamp( d2 / 1.5, 0.0, 1.0 );
  return clamp( d2 - d1, 0.0, 1.0 );
}
vec3 gpGrad( ivec3 c, uint seed ) {
  vec3 g = gpHash3( c, seed ) * 2.0 - 1.0;
  return g / max( length( g ), 1e-3 );
}
float gpSimplex( vec3 p, uint seed ) {
  vec3 s = floor( p + ( p.x + p.y + p.z ) * 0.33333333 );
  vec3 x0 = p - s + ( s.x + s.y + s.z ) * 0.16666667;
  vec3 e = step( x0.yzx, x0 );
  vec3 i1 = e * ( 1.0 - e.zxy );
  vec3 i2 = 1.0 - e.zxy * ( 1.0 - e );
  vec3 x1 = x0 - i1 + 0.16666667;
  vec3 x2 = x0 - i2 + 0.33333333;
  vec3 x3 = x0 - 0.5;
  ivec3 c = ivec3( s );
  vec4 w = max( 0.6 - vec4( dot( x0, x0 ), dot( x1, x1 ), dot( x2, x2 ), dot( x3, x3 ) ), 0.0 );
  w *= w;
  w *= w;
  float n = w.x * dot( gpGrad( c, seed ), x0 )
    + w.y * dot( gpGrad( c + ivec3( i1 ), seed ), x1 )
    + w.z * dot( gpGrad( c + ivec3( i2 ), seed ), x2 )
    + w.w * dot( gpGrad( c + ivec3( 1 ), seed ), x3 );
  return clamp( 0.5 + 0.5 * 45.0 * n, 0.0, 1.0 );
}
float gpNoise( int kind, int metric, vec3 p, uint seed ) {
  if ( kind == 0 ) return gpValue( p, seed );
  if ( kind == 1 ) return gpSimplex( p, seed );
  if ( kind == 2 ) return gpWorley( p, seed, metric );
  return gpCell( p, seed );
}
float gpFbm( int kind, int metric, vec3 p, uint seed, int octaves, float lacunarity, float gain ) {
  float sum = 0.0, amp = 1.0, total = 0.0;
  for ( int o = 0; o < octaves; o++ ) {
    sum += amp * gpNoise( kind, metric, p, seed + uint( o ) * 1013u );
    total += amp;
    amp *= gain;
    p *= lacunarity;
  }
  return sum / total;
}`,
  },
}

// The ops gpgpu3d brings.
const builtins: Record<string, Op> = {
  const: {
    params: { value: { type: 'number' } },
    expr: c => c.param('value'),
  },
  coord: {
    params: { axis: { type: 'choice', of: AXES } },
    expr: c => `${c.p}.${c.value('axis')}`,
  },
  time: {
    needs: ['time'],
    moves: true,
    params: { rate: { type: 'number', default: 1 } },
    expr: c => `( gpTime * ${c.param('rate')} )`,
  },
  roll: {
    params: { salt: { type: 'whole', min: 0 } },
    expr: c => `gpRollOf( ${c.param('salt')} )`,
  },
  noise: {
    needs: ['noise'],
    params: {
      kind: { type: 'choice', of: KINDS, default: 'value' },
      freq: { type: 'number', above: 0 },
      seed: { type: 'whole', min: 0, default: 0 },
      octaves: { type: 'whole', min: 1, max: 16, default: 1 },
      lacunarity: { type: 'number', above: 0, default: 2 },
      gain: { type: 'number', above: 0, default: 0.5 },
      rotate: { type: 'number', default: 0 },
      stretch: { type: 'vec3', default: [1, 1, 1] },
      metric: { type: 'choice', of: METRICS, default: 'f1' },
    },
    expr: c => {
      const turn = c.value('rotate') as number
      const [sx, sy, sz] = (c.value('stretch') as number[]).map(v => v * (c.value('freq') as number))
      const at = `gpRotY( ${c.p}, ${float(Math.cos(turn))}, ${float(Math.sin(turn))} ) * vec3( ${float(sx)}, ${float(sy)}, ${float(sz)} )`
      return `gpFbm( ${c.param('kind')}, ${c.param('metric')}, ${at}, ${c.param('seed')}u, ${c.param('octaves')}, ${c.param('lacunarity')}, ${c.param('gain')} )`
    },
  },
  warp: {
    inputs: ['input'],
    optional: ['x', 'y', 'z'],
    params: { amount: { type: 'number' } },
    check: node => (node.x === undefined && node.y === undefined && node.z === undefined ? 'moves the point by none of x, y, z' : undefined),
    expr: c => {
      const along = (n: string) => (c.has(n) ? c.input(n) : '0.0')
      return c.input('input', `${c.p} + ${c.param('amount')} * vec3( ${along('x')}, ${along('y')}, ${along('z')} )`)
    },
  },
  fold: {
    inputs: ['input'],
    params: { kind: { type: 'choice', of: FOLDS }, steps: { type: 'number', above: 0, default: 4 } },
    lib: /* glsl */ `
float gpfoldOf( int kind, float v, float steps ) {
  if ( kind == 0 ) { float r = 1.0 - abs( 2.0 * v - 1.0 ); return r * r; }
  if ( kind == 1 ) { float r = abs( 2.0 * v - 1.0 ); return r * r; }
  if ( kind == 2 ) return abs( 2.0 * v - 1.0 );
  if ( kind == 3 ) {
    float x = v * steps;
    float i = floor( x );
    float f = x - i;
    return ( i + f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 ) ) / steps;
  }
  return 0.5 + 0.5 * sin( 6.2831853 * v );
}`,
    expr: c => `gpfoldOf( ${c.param('kind')}, ${c.input('input')}, ${c.param('steps')} )`,
  },
  remap: {
    inputs: ['input'],
    needs: ['ramp'],
    params: {
      inLo: { type: 'number' }, inHi: { type: 'number' }, outLo: { type: 'number' }, outHi: { type: 'number' },
      ease: { type: 'choice', of: EASES, default: 'linear' },
    },
    lib: /* glsl */ `
float gpremapOf( float v, float inLo, float inHi, float outLo, float outHi, int ease ) {
  float t = gpRamp( v, inLo, inHi );
  if ( ease == 1 ) t = t * t * ( 3.0 - 2.0 * t );
  else if ( ease == 2 ) t = t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 );
  return mix( outLo, outHi, t );
}`,
    expr: c => `gpremapOf( ${c.input('input')}, ${c.param('inLo')}, ${c.param('inHi')}, ${c.param('outLo')}, ${c.param('outHi')}, ${c.param('ease')} )`,
  },
  ramp: {
    inputs: ['input'],
    needs: ['ramp'],
    params: { lo: { type: 'number' }, hi: { type: 'number' } },
    expr: c => `gpRamp( ${c.input('input')}, ${c.param('lo')}, ${c.param('hi')} )`,
  },
  combine: {
    inputs: ['a', 'b'],
    params: { mode: { type: 'choice', of: MODES }, t: { type: 'number', default: 0.5 } },
    lib: /* glsl */ `
float gpcombineOf( int mode, float a, float b, float t ) {
  if ( mode == 0 ) return a + b;
  if ( mode == 1 ) return a - b;
  if ( mode == 2 ) return a * b;
  if ( mode == 3 ) return min( a, b );
  if ( mode == 4 ) return max( a, b );
  return mix( a, b, t );
}`,
    expr: c => `gpcombineOf( ${c.param('mode')}, ${c.input('a')}, ${c.input('b')}, ${c.param('t')} )`,
  },
  blend: {
    inputs: ['a', 'b', 'by'],
    expr: c => `mix( ${c.input('a')}, ${c.input('b')}, clamp( ${c.input('by')}, 0.0, 1.0 ) )`,
  },
  scale: {
    inputs: ['input'],
    params: { by: { type: 'number' } },
    expr: c => `( ${c.input('input')} * ${c.param('by')} )`,
  },
}

// The ops a scene's mods deliver laid over gpgpu3d's own.
export const opsOf = (world: Record<string, any>): OpTable => Object.assign({}, builtins, ...modsOf<Ops>(world, 'gpgpu3d', 'ops').map(f => f()))

// The slider a tool shows for a number of a node of type `p` standing at `v`: a whole number steps by 1 within
// what the op says it may be; any other runs from what the op says it is above or at least, or from minus its
// top, to three times where it stands (one figure of it), a thousand steps over it.
export function rangeOf(p: Param, v: number): { min: number; max: number; step: number } {
  const nice = (x: number) => { const e = 10 ** Math.floor(Math.log10(x)); return Math.ceil(x / e) * e }
  if (p.type === 'whole') return { min: p.min ?? -nice(Math.abs(v) * 3 + 1), max: p.max ?? nice(Math.abs(v) * 3 + 8), step: 1 }
  const max = nice(Math.max(Math.abs(v) * 3, 1e-3))
  const step = 10 ** (Math.floor(Math.log10(max)) - 3)
  const lo = p.type === 'number' ? (p.min ?? (p.above !== undefined ? p.above + step : -max)) : -max
  return { min: lo, max: p.type === 'number' && p.max !== undefined ? p.max : max, step }
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isWhole = (v: unknown): v is number => Number.isInteger(v)

// A param's value as the sheet wrote it, or its default; throws a sentence naming the node and the param.
function valueOf(at: string, name: string, p: Param, given: unknown): unknown {
  const no = (is: string): never => { throw new Error(`${at} ${name} ${JSON.stringify(given)} is not ${is}`) }
  if (given === undefined) {
    if (p.default === undefined) throw new Error(`${at} has no ${name}`)
    return p.default
  }
  if (p.type === 'number') {
    if (!isNumber(given)) return no('a number')
    if (p.min !== undefined && given < p.min) no(`a number at or above ${p.min}`)
    if (p.above !== undefined && !(given > p.above)) no(`a number above ${p.above}`)
    if (p.max !== undefined && given > p.max) no(`a number at or below ${p.max}`)
  } else if (p.type === 'whole') {
    if (!isWhole(given)) return no('a whole number')
    if (p.min !== undefined && (given as number) < p.min) no(`a whole number at or above ${p.min}`)
    if (p.max !== undefined && (given as number) > p.max) no(`a whole number at or below ${p.max}`)
  } else if (p.type === 'choice') {
    if (!p.of.includes(given as string)) no(`none of ${p.of.join(', ')}`)
  } else if (!Array.isArray(given) || given.length !== 3 || !given.every(isNumber)) no('[x, y, z], three numbers')
  return given
}

const literal = (p: Param, v: unknown): string =>
  p.type === 'number' ? float(v as number) : p.type === 'whole' ? whole(v as number) : p.type === 'choice' ? whole(p.of.indexOf(v as string)) : `vec3( ${(v as number[]).map(float).join(', ')} )`

// Throws a sentence naming the first thing in a program that cannot be compiled, and hands back each node's
// fields as the sheet wrote them or defaulted. `what` is the program as the reader calls it, `allowed` the
// names of `out` it takes.
function checked(table: OpTable, program: Program, what: string, allowed: Record<string, Kind> | undefined) {
  const no = (sentence: string): never => { throw new Error(`${what} ${sentence}`) }
  if (!program || !Array.isArray(program.nodes) || !program.nodes.length) no('has no nodes: it is { nodes: [...], out: {...} }')
  if (!program.out || typeof program.out !== 'object' || Array.isArray(program.out) || !Object.keys(program.out).length) no('has no out: it is { nodes: [...], out: { <name>: <node id> } }')
  const place = new Map<string, number>()
  const values: Fields[] = []
  program.nodes.forEach((node, k) => {
    const at = `node ${k}${node?.id ? ` (${node.id})` : ''}`
    if (!node || typeof node.id !== 'string' || !node.id) no(`${at} has no id`)
    if (place.has(node.id)) no(`has two nodes ${node.id}`)
    const op = table[node.op]
    if (!op) no(`${at} is of the op ${JSON.stringify(node.op)}, which is none of ${Object.keys(table).join(', ')}: world.gpgpu3d.mods.ops names the plugins that deliver ops`)
    const takes = [...(op.inputs ?? []), ...(op.optional ?? []), ...Object.keys(op.params ?? {})]
    for (const key of Object.keys(node)) {
      if (key !== 'id' && key !== 'op' && !takes.includes(key)) no(`${at} of ${node.op} has ${key}, which ${node.op} does not take: ${takes.join(', ')}`)
    }
    const v: Fields = {}
    for (const name of op.inputs ?? []) {
      if (node[name] === undefined) no(`${at} of ${node.op} has no ${name}, a node before it`)
    }
    for (const name of [...(op.inputs ?? []), ...(op.optional ?? [])]) {
      if (node[name] === undefined) continue
      const to = node[name]
      if (typeof to !== 'string' || !place.has(to)) no(`${at} of ${node.op} reads ${name} ${JSON.stringify(to)}, which is not a node before it`)
      v[name] = to
    }
    for (const [name, p] of Object.entries(op.params ?? {})) v[name] = valueOf(`${what} ${at} of ${node.op}`, name, p, node[name])
    const problem = op.check?.(node)
    if (problem) no(`${at} of ${node.op} ${problem}`)
    place.set(node.id, k)
    values.push(v)
  })
  const isNode = (v: unknown): v is string => typeof v === 'string' && place.has(v)
  for (const [name, to] of Object.entries(program.out)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(name)) no(`out ${JSON.stringify(name)} is not a name of letters and digits that starts with a lower case letter`)
    if (allowed && !(name in allowed)) no(`out ${name} is none of ${Object.keys(allowed).join(', ')}`)
    if (typeof to === 'string') {
      if (!isNode(to)) no(`out ${name} is ${JSON.stringify(to)}, which is no node`)
    } else if (to && typeof to === 'object' && !Array.isArray(to) && 'by' in to) {
      if (!isNode(to.by)) no(`out ${name} by is ${JSON.stringify(to.by)}, which is no node`)
      if (typeof to.to !== 'string' || !HEX.test(to.to)) no(`out ${name} to is ${JSON.stringify(to.to)}, which is not a colour like "#8fae4c"`)
    } else if (to && typeof to === 'object' && !Array.isArray(to)) {
      for (const c of ['r', 'g', 'b'] as const) if (!isNode((to as Record<string, unknown>)[c])) no(`out ${name} ${c} is ${JSON.stringify((to as Record<string, unknown>)[c])}, which is no node`)
    } else no(`out ${name} is ${JSON.stringify(to)}: a node id, or for a colour { r, g, b } of node ids or { to: "#rrggbb", by: <node id> }`)
    const kind = allowed?.[name]
    if (kind && kind !== kindOf(to)) no(kind === 'number' ? `out ${name} is a colour, and ${name} is a number: a node id` : `out ${name} is a node id, and ${name} is a colour: { r, g, b } of node ids, or { to: "#rrggbb", by: <node id> }`)
  }
  return values
}

// The program compiled (see the header). Throws a sentence naming `what`, the program as the reader calls
// it, and the first thing in it that is wrong.
export function compile(table: OpTable, program: Program, name: string, what: string, allowed?: Record<string, Kind>, part?: Part): Compiled {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error(`${what}: the program's name ${JSON.stringify(name)} is not letters and digits that start with a letter`)
  const values = checked(table, program, what, allowed)
  const ids = new Map(program.nodes.map((n, k) => [n.id, k]))
  const base = `gp${name}P`
  const cached = (k: number) => `gp${name}N${k}`, pure = (k: number) => `gp${name}F${k}`
  const value = (k: number) => `gp${name}V${k}`, done = (k: number) => `gp${name}D${k}`
  const given = (n: number) => `gp${name}K${n}`, keep = (n: number) => `gp${name}Keep${n}`
  // Which nodes move: one of an op that moves, or one that reads a node that does. And which names of `out`.
  const moving: boolean[] = []
  program.nodes.forEach((node, k) => {
    const op = table[node.op]
    moving[k] = !!op.moves || [...(op.inputs ?? []), ...(op.optional ?? [])].some(f => values[k][f] !== undefined && moving[ids.get(values[k][f] as string)!])
  })
  const names = Object.keys(program.out)
  const moves = Object.fromEntries(names.map(out => [out, nodesOf(program.out[out]).some(id => moving[ids.get(id)!])]))
  const seeds = (outs: string[]) => outs.flatMap(out => nodesOf(program.out[out])).map(id => ids.get(id)!)
  const contextOf = (k: number, here: boolean, reads: (j: number, here: boolean) => void): Ctx => {
    const op = table[program.nodes[k].op], v = values[k]
    return {
      p: here ? base : 'p',
      input: (input, at) => {
        const j = ids.get(v[input] as string)!
        if (here && at === undefined) { reads(j, true); return `${cached(j)}()` }
        reads(j, false)
        return `${pure(j)}( ${at ?? 'p'} )`
      },
      has: input => v[input] !== undefined,
      param: field => literal(op.params![field], v[field]),
      value: field => v[field],
    }
  }
  // Which nodes are worked out at the point the reader gave (the cached form), and which at another point, as a
  // warp's input is (the pure form), from the nodes `from` that the outputs read. A node's inputs have lower
  // places, so going down the list finds each. With `keeping`, a node at the reader's point that does not move
  // is kept: its value is handed in, and nothing it reads is worked out.
  const walk = (from: number[], keeping: boolean) => {
    const atBase = new Set(from), elsewhere = new Set<number>(), kept = new Set<number>()
    const exprs = { base: new Map<number, string>(), elsewhere: new Map<number, string>() }
    for (let k = program.nodes.length - 1; k >= 0; k--) {
      const op = table[program.nodes[k].op]
      if (atBase.has(k)) {
        if (keeping && !moving[k]) kept.add(k)
        else exprs.base.set(k, op.expr(contextOf(k, true, (j, here) => (here ? atBase : elsewhere).add(j))))
      }
      if (elsewhere.has(k)) exprs.elsewhere.set(k, op.expr(contextOf(k, false, j => elsewhere.add(j))))
    }
    return { atBase, elsewhere, kept, exprs }
  }
  // The kept nodes of the whole live half, in the order both halves number them; and the names this compile
  // gives functions to.
  const live = part ? names.filter(out => part.live.includes(out)) : []
  const keeps = part ? [...walk(seeds(live), true).kept].sort((a, b) => a - b) : []
  const asked = part?.outs ? names.filter(out => part.outs!.includes(out)) : names
  const chosen = !part ? asked : asked.filter(out => live.includes(out) === (part.of === 'live'))
  const { atBase, elsewhere, kept, exprs } = walk([...seeds(chosen), ...(part?.of === 'still' ? keeps : [])], part?.of === 'live')
  // the libraries and ops' own GLSL, once each, a library after those it needs
  const included = new Set<string>()
  const uses: string[] = []
  const parts: string[] = []
  const include = (lib: string) => {
    if (included.has(lib)) return
    const l = libs[lib]
    if (!l) throw new Error(`${what}: gpgpu3d has no library ${lib}: ${Object.keys(libs).join(', ')}`)
    included.add(lib)
    for (const n of l.needs ?? []) include(n)
    for (const u of l.uses ?? []) if (!uses.includes(u)) uses.push(u)
    parts.push(l.glsl)
  }
  const ownLib = new Set<string>()
  const body: string[] = []
  const held = [...atBase].filter(k => !kept.has(k)).sort((a, b) => a - b)
  body.push(`vec3 ${base};`, ...held.map(k => `float ${value(k)};\nbool ${done(k)} = false;`))
  keeps.forEach((k, n) => { if (kept.has(k)) body.push(`float ${given(n)};`) })
  program.nodes.forEach((node, k) => {
    if (!atBase.has(k) && !elsewhere.has(k)) return
    const op = table[node.op]
    if (kept.has(k)) body.push(`// ${node.id}, ${node.op}, kept\nfloat ${cached(k)}() { return ${given(keeps.indexOf(k))}; }`)
    if (kept.has(k) && !elsewhere.has(k)) return
    for (const lib of op.needs ?? []) include(lib)
    if (op.lib && !ownLib.has(node.op)) { ownLib.add(node.op); parts.push(op.lib) }
    if (elsewhere.has(k)) body.push(`// ${node.id}, ${node.op}, at a point of its own\nfloat ${pure(k)}( vec3 p ) { return ${exprs.elsewhere.get(k)}; }`)
    if (atBase.has(k) && !kept.has(k)) body.push(`// ${node.id}, ${node.op}\nfloat ${cached(k)}() { if ( !${done(k)} ) { ${value(k)} = ${exprs.base.get(k)}; ${done(k)} = true; } return ${value(k)}; }`)
  })
  const at = `gp${name}At`
  body.push(`void ${at}( vec3 p ) { ${base} = p; ${held.map(k => `${done(k)} = false;`).join(' ')} }`)
  if (part?.of === 'still') keeps.forEach((k, n) => body.push(`float ${keep(n)}() { return ${cached(k)}(); }`))
  const outs: Record<string, string> = {}, kinds: Record<string, Kind> = {}
  const read = (id: string) => `${cached(ids.get(id)!)}()`
  for (const [out, to] of Object.entries(program.out)) {
    kinds[out] = kindOf(to)
    if (!chosen.includes(out)) continue
    outs[out] = `gp${name}Out_${out}`
    if (typeof to === 'string') body.push(`float ${outs[out]}() { return ${read(to)}; }`)
    else if ('by' in to) body.push(`vec3 ${outs[out]}( vec3 base ) { return mix( base, vec3( ${linearOf(to.to).map(float).join(', ')} ), clamp( ${read(to.by)}, 0.0, 1.0 ) ); }`)
    else {
      include('colour')
      body.push(`vec3 ${outs[out]}( vec3 base ) { return gpLinear( vec3( ${read(to.r)}, ${read(to.g)}, ${read(to.b)} ) ); }`)
    }
  }
  const handed = !part ? [] : part.of === 'still' ? keeps.map((_, n) => keep(n)) : keeps.map((k, n) => (kept.has(k) ? given(n) : ''))
  return { glsl: [...parts, ...body].join('\n'), outs, kinds, at, uses, moves, kept: handed }
}
