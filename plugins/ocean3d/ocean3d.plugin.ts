// The browser half of ocean3d: the sea drawn from the ocean3d row's `t` and the scene's
// `world.ocean3d`, read off `plugins.wire.scene.world`. The spectrum is the server half's
// (`ocean3d.sim.ts`), made again in this client from the same numbers, so every seat draws the same
// waves the server floats things on. Nothing interpolates: the waves are at the row's `t`, and the
// foam moves on by how far that `t` moved.
//
// It is listed before render3d, which draws in its own `afterTick`, and reads the camera where it
// stands in its `afterTick`. A scene with the row and no render3d throws.
//
// What the sea is drawn over and in comes through mods (`addons/scenemanager`), which a scene names
// in `world.ocean3d.mods`:
//   light   `light(plugins)`, `{ sun, sunColor, zenith, horizon }` as three's Vector3 and Colors, or
//           undefined before the sky has one: skydome3d's (`skydome3d.ocean3d.ts`). It is read in this
//           `afterTick` and placed in the sky's, so the scene lists its plugin before this one, or
//           throws (`ahead`). Nothing is drawn until the camera and the sky's first light are there.
//           With no light mod the sea is drawn in the fixed `world.ocean3d.light`, once the camera is
//           there; beside a light mod the fixed light is not read, and a scene with neither throws,
//           naming both.
//   land    `land(plugins)`, `{ depth(x, z), edits?() }`, or undefined: terrain3d's
//           (`terrain3d.ocean3d.ts`), the seabed the tile is baked from. Read in this `afterTick` and
//           made in the land's, so its plugin is listed before this one too (`ahead`). With no land
//           mod, or until it hands a ground, the sea is open ocean everywhere.
//   wind    the server half's (its header), asked here with a `w` over the rows this page draws.
//
// The browser half's numbers in `world.ocean3d`, beside the sea's (`ocean3d.sim.ts`):
//   light           the fixed light, read when no light mod is named, every frame:
//                   `{ sun: [x, y, z], sunColor, zenith, horizon }`, `sun` the way toward the sun,
//                   normalised here, and the colours authored sRGB as `deep` is: the sun's light, the
//                   sky straight up and the sky at the horizon.
//   deep scatter    the body's colours, authored sRGB; glow and glowPower its sun-facing glow
//   glint glintPower  the sun's Blinn glint
//   foamColour      the foam's colour, authored sRGB; foamJ [full, none] the foam history over which
//                   a cascade's foam cover goes from all to none; bubbles the bubble noise's cycles a
//                   metre and bubbleEdge its edge
//   alpha           the sea's opacity looked at straight down over shallows; clearDepth the metres of
//                   water over which it rises to opaque, so the seabed shows in the shallows only
//   rings segs far  the disc: rings out to `far` metres, each of segs vertices
//   depthHalf depthMax depthRes depthRows  the seabed tile: ±depthHalf metres, depthRes texels across,
//                   depth up to depthMax metres, re-baked depthRows rows a frame
// The disc's and the tile's numbers are read on the first frame; every other number every frame.
//
// The FFT. Per cascade per frame, fragment shaders on half-float RES² targets, their quads drawn
// through an orthographic camera, which a renderer drawing reversed depth can project again:
//   evolve h      (h0·e^{iφ} + conj(h0(−k))·e^{−iφ})·A in .xy, .zw forced to 0, because a constant
//                 there comes out of the inverse transform as an overflow spike. φ = 2π·fract(m·t/repeat),
//                 m read from the spectrum texel, h0(−k) from the mirror texel. A is the server half's
//                 `ampAt(w)`, `w` the frame's rows, so the GPU and `waveAt` draw at one amplitude as the
//                 weather fades.
//   evolve D      i·h·k/|k| packed as Dx + iDz in .xy, and i·h·kx + i(i·h·kz), the slopes ∂h/∂x +
//                 i∂h/∂z, in .zw, both straight from h, so the slopes are spectral.
//   inverse FFTs  one of h and one of D: a bit-reverse pass, 8 radix-2×2 butterfly stages that take x
//                 and y at once, and a (−1)^(x+y) pass, for the cells' k starting at −128dK.
//   assemble      displacement RGBA = (chop·Dx, h, chop·Dz, foam history) and derivatives =
//                 (∂h/∂x, ∂h/∂z, chop·∂Dx/∂x, chop·∂Dz/∂z), both mipmapped and repeating, so far
//                 water calms instead of crawling. The Jacobian's terms are central differences across
//                 the tile, which wraps: J = (1 + chop∂Dx/∂x)(1 + chop∂Dz/∂z) − chop²∂Dx/∂z·∂Dz/∂x, and
//                 the history is min(J, prev + Δt·foamRecovery/max(J, 0.5)).
// Δt is the change in the row's `t` since the last FFT, wrapped into [0, repeat), so foam fades on
// the game's clock and a `t` that stands still advances nothing. The history is cleared, written as
// J, on the first frame, when the renderer first appears, and whenever a number the spectrum reads
// changes (`inputs`), or `amp` or `chop`: an uncleared target reads as a permanent
// whitecap. The weather's fade moves A and clears nothing, so the foam carries through it.
//
// The disc. An exponential polar disc, ring i at radius A(e^{6.25i/rings} − 1), A so the last ring is
// at `far`, a centre vertex and `segs` vertices a ring, wound counter-clockwise seen from above:
// reversed, the whole sea is culled and reads as clear water. Each vertex carries its spacing, the
// larger of the way out to the next ring (the last ring's own way in) and the way round to the next
// vertex; cascade c is read at mip max(0, log2(spacing·RES/patch_c)). It is recentred on the camera
// snapped to the innermost ring's spacing, so vertices do not swim across the waves. A vertex reads
// each cascade at its world xz with the half-texel offset removed, xz/patch + 0.5/RES, so texel n is
// the sea at n·patch/RES, and moves by the sum times the shoaling there.
//
// The seabed tile. depth/depthMax in R8, depthRes² texels over ±depthHalf around a centre, the camera
// snapped to a tile texel. The first bake with a ground is whole; when the camera is more than
// depthHalf/2 from the centre along x or z, a bake of the new centre is made depthRows rows a frame
// into a second buffer, which swaps in, with its centre, once complete. The tile keeps the ground's
// `edits()` it was baked from, and an edit since then that reaches it, a new land or a layer whose
// version moved and whose rect overlaps the tile, starts a sliced bake at the same centre. A bake in
// hand is never started again: it finishes, its rows baked before an edit as they were, and swaps in
// with the edits it started from, so an edit made meanwhile starts one more bake the frame after,
// and a held brush shows a whole new tile every ⌈depthRes/depthRows⌉ frames. Outside the tile, and
// with no ground, the depth reads as open ocean, 1e4 m, a shoaling of 1. The shoaling is the server
// half's `shoal`.
//
// A depth pre-pass: the same geometry and displacement, DoubleSide, renderOrder 1, no colour, pushed
// back 0.2 % of its distance from the camera, because polygon offset punches holes near the camera.
// Its depth is the sea render3d's `ao` reads, waves and all.
//
// The colour pass: transparent, no depth write, depth LEQUAL, renderOrder 2, the front side.
//   normal      from the summed derivatives times the shoaling, the slopes divided by the Jacobian's
//               terms 1 + shoal·chop∂D/∂ clamped at 0.18.
//   fresnel     mix(0.02, 0.62, (1 − N·V)⁵).
//   reflection  the sky's gradient along the reflected ray, mix(horizon, zenith, pow(R.y, 0.55)), the
//               horizon below it, from the light.
//   body        mix(deep, scatter, N.y·0.6) lit by horizon + sunColor·max(sun.y, 0), plus the glow
//               scatter·sunColor·glow·pow(max(−V·sun, 0), glowPower).
//   glint       sunColor·glint·pow(N·H, glintPower)·max(N·sun, 0): a sun below the sea glints nothing.
//   colour      mix(body, reflection, fresnel) + glint.
//   foam        cover = the larger of cascades 0 and 1's 1 − smoothstep(full, none, history); foam =
//               cover·smoothstep(1 − cover, 1 − cover + bubbleEdge, n)·shoaling, n = 0.5 + gradient
//               noise at `bubbles` cycles a metre, clamped to [0, 1]; lit as the body is.
//   alpha       mix(mix(alpha, 1, fresnel), 1, smoothstep(0, clearDepth, depth))·smoothstep(0, 0.28,
//               shoaling), the depth the tile's: opaque over deep water, and fading out at the shore.
//   then three's tonemapping, colorspace and fog chunks, in three's order: the fog is the scene's
//   FogExp2, the sky's.
// The sun and the sky are taken from the light every frame.
//
// `sea()` is a probe for tests: the meshes, the uniforms, the spectrum and its textures, the targets,
// the tile and the last FFT's clock. `close` takes the meshes off the scene and disposes every
// geometry, material, texture and target.
import type * as THREE from 'three'
import type { Row, W } from '#engine/engine.ts'
import type { Plugins, Wire } from '#engine/browser.ts'
import { ahead, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { ampAt, inputs, RES, spectrum, type Sea, type Spectrum } from './ocean3d.sim.ts'

// The fixed light, authored: the way toward the sun and sRGB colours.
export type Fixed = { sun: [number, number, number]; sunColor: string; zenith: string; horizon: string }
export type Numbers = Sea & {
  light?: Fixed
  deep: string; scatter: string; glow: number; glowPower: number; glint: number; glintPower: number
  foamColour: string; foamJ: [number, number]; bubbles: number; bubbleEdge: number; alpha: number; clearDepth: number
  rings: number; segs: number; far: number; depthHalf: number; depthMax: number; depthRes: number; depthRows: number
}
type Three = typeof import('three')
type Uniforms = Record<string, THREE.IUniform>
type Target = THREE.WebGLRenderTarget
type Sky = { sun: THREE.Vector3; sunColor: THREE.Color; zenith: THREE.Color; horizon: THREE.Color }
// The ground a `land` mod hands out: its `edits` the land and each painted layer's version and rect.
type Edits = { land: unknown; layers: { version: number; rect: number[] }[] }
export type Ground = { depth(x: number, z: number): number; edits?(): Edits }
// The mods ocean3d asks for on the page.
export type Light = (plugins: Plugins) => Sky | undefined
export type Land = (plugins: Plugins) => Ground | undefined
// The tile's shown buffer, its centre and the edits it was baked from, and the bake in hand into the
// other buffer.
type Bake = { centre: [number, number]; row: number; from?: Edits }
type Tile = {
  res: number; half: number; max: number; rows: number; texture: THREE.DataTexture; data: Uint8Array; back: Uint8Array
  centre: [number, number]; baked: boolean; from?: Edits; next?: Bake
}

// The radii of the disc's rings, 0 first and `far` last.
export const radii = (rings: number, far: number) => {
  const A = far / (Math.exp(6.25) - 1)
  return Array.from({ length: rings + 1 }, (_, i) => (i === rings ? far : A * (Math.exp((6.25 * i) / rings) - 1)))
}

// The disc: a centre vertex, then `segs` vertices a ring, each with its spacing; wound CCW from above.
export function disc(three: Three, rings: number, segs: number, far: number): THREE.BufferGeometry {
  const r = radii(rings, far)
  const n = 1 + rings * segs
  const position = new Float32Array(n * 3), spacing = new Float32Array(n)
  spacing[0] = r[1]
  for (let i = 1; i <= rings; i++) {
    const out = i < rings ? r[i + 1] - r[i] : r[i] - r[i - 1]
    const round = (2 * Math.PI * r[i]) / segs
    for (let j = 0; j < segs; j++) {
      const v = 1 + (i - 1) * segs + j, a = (2 * Math.PI * j) / segs
      position[v * 3] = r[i] * Math.cos(a)
      position[v * 3 + 2] = r[i] * Math.sin(a)
      spacing[v] = Math.max(out, round)
    }
  }
  const index: number[] = []
  const at = (i: number, j: number) => 1 + (i - 1) * segs + (j % segs)
  for (let j = 0; j < segs; j++) index.push(0, at(1, j + 1), at(1, j))
  for (let i = 1; i < rings; i++) for (let j = 0; j < segs; j++) {
    const A = at(i, j), B = at(i, j + 1), C = at(i + 1, j), D = at(i + 1, j + 1)
    index.push(A, B, C, B, D, C)
  }
  const g = new three.BufferGeometry()
  g.setAttribute('position', new three.BufferAttribute(position, 3))
  g.setAttribute('spacing', new three.BufferAttribute(spacing, 1))
  g.setIndex(index)
  return g
}

// ---------------------------------------------------------------- the FFT's shaders

const QUAD_VERTEX = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
`
const COMPLEX = /* glsl */ `
vec2 cmul( vec2 a, vec2 b ) { return vec2( a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x ); }
`
const EVOLVE_H = /* glsl */ `
uniform sampler2D spectrum;
uniform float cycle;
uniform float amp;
${COMPLEX}
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  ivec2 q = ivec2( ( ${RES} - p.x ) % ${RES}, ( ${RES} - p.y ) % ${RES} );
  vec4 a = texelFetch( spectrum, p, 0 );
  vec4 b = texelFetch( spectrum, q, 0 );
  float phi = 6.283185307179586 * fract( a.z * cycle );
  vec2 e = vec2( cos( phi ), sin( phi ) );
  vec2 h = cmul( a.xy, e ) + cmul( vec2( b.x, -b.y ), vec2( e.x, -e.y ) );
  gl_FragColor = vec4( h * amp, 0.0, 0.0 );
}
`
const EVOLVE_D = /* glsl */ `
uniform sampler2D h;
uniform float dK;
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  vec2 k = vec2( p - ivec2( ${RES / 2} ) ) * dK;
  float len = length( k );
  vec2 v = texelFetch( h, p, 0 ).xy;
  vec2 ih = vec2( -v.y, v.x );
  vec2 u = len > 0.0 ? k / len : vec2( 0.0 );
  vec2 dx = ih * u.x, dz = ih * u.y, sx = ih * k.x, sz = ih * k.y;
  gl_FragColor = vec4( dx + vec2( -dz.y, dz.x ), sx + vec2( -sz.y, sz.x ) );
}
`
const BITS = Math.log2(RES)
const BIT_REVERSE = /* glsl */ `
uniform sampler2D src;
int reversed( int v ) {
  int r = 0;
  for ( int b = 0; b < ${BITS}; b++ ) { r = ( r << 1 ) | ( v & 1 ); v >>= 1; }
  return r;
}
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  gl_FragColor = texelFetch( src, ivec2( reversed( p.x ), reversed( p.y ) ), 0 );
}
`
// One radix-2 stage along x and one along y at once: out = in[lo] ± w·in[hi] on each axis, w =
// e^{+2πiq/size}, which is the inverse transform's sign.
const BUTTERFLY = /* glsl */ `
uniform sampler2D src;
uniform int span;
${COMPLEX}
vec4 twist( vec4 v, vec2 w ) { return vec4( cmul( v.xy, w ), cmul( v.zw, w ) ); }
void axis( int n, out int lo, out int hi, out vec2 w, out float sgn ) {
  int size = 2 * span;
  int j = n % size;
  int q = j % span;
  lo = n - j + q;
  hi = lo + span;
  float a = 6.283185307179586 * float( q ) / float( size );
  w = vec2( cos( a ), sin( a ) );
  sgn = j < span ? 1.0 : -1.0;
}
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  int x0, x1, y0, y1;
  vec2 wx, wy;
  float sx, sy;
  axis( p.x, x0, x1, wx, sx );
  axis( p.y, y0, y1, wy, sy );
  vec4 g0 = texelFetch( src, ivec2( x0, y0 ), 0 ) + sx * twist( texelFetch( src, ivec2( x1, y0 ), 0 ), wx );
  vec4 g1 = texelFetch( src, ivec2( x0, y1 ), 0 ) + sx * twist( texelFetch( src, ivec2( x1, y1 ), 0 ), wx );
  gl_FragColor = g0 + sy * twist( g1, wy );
}
`
const SIGN = /* glsl */ `
uniform sampler2D src;
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  gl_FragColor = ( ( p.x + p.y ) % 2 == 0 ? 1.0 : -1.0 ) * texelFetch( src, p, 0 );
}
`
const ASSEMBLE = /* glsl */ `
uniform sampler2D hSpace;
uniform sampler2D dSpace;
uniform sampler2D prev;
uniform float chop;
uniform float texel;
uniform float recover;
uniform float clear;
void main() {
  ivec2 p = ivec2( gl_FragCoord.xy );
  int m = ${RES - 1};
  vec4 d = texelFetch( dSpace, p, 0 );
  vec2 ddx = ( texelFetch( dSpace, ivec2( ( p.x + 1 ) & m, p.y ), 0 ).xy - texelFetch( dSpace, ivec2( ( p.x + m ) & m, p.y ), 0 ).xy ) / ( 2.0 * texel );
  vec2 ddz = ( texelFetch( dSpace, ivec2( p.x, ( p.y + 1 ) & m ), 0 ).xy - texelFetch( dSpace, ivec2( p.x, ( p.y + m ) & m ), 0 ).xy ) / ( 2.0 * texel );
  #ifdef DISPLACEMENT
    float J = ( 1.0 + chop * ddx.x ) * ( 1.0 + chop * ddz.y ) - chop * chop * ddz.x * ddx.y;
    float history = clear > 0.5 ? J : min( J, texelFetch( prev, p, 0 ).w + recover / max( J, 0.5 ) );
    gl_FragColor = vec4( chop * d.x, texelFetch( hSpace, p, 0 ).x, chop * d.y, history );
  #else
    gl_FragColor = vec4( d.z, d.w, chop * ddx.x, chop * ddz.y );
  #endif
}
`

// ---------------------------------------------------------------- the surface's shaders

// A cascade's texel coordinate at world xz: the half-texel offset removed.
const uv = (c: number, xz: string) => `${xz} / oceanPatch${c} + 0.5 / ${RES.toFixed(1)}`

function surfaceVertex(count: number) {
  const each = (f: (c: number) => string) => Array.from({ length: count }, (_, c) => f(c)).join('\n')
  return /* glsl */ `
attribute float spacing;
${each(c => `uniform sampler2D oceanDisp${c};\nuniform float oceanPatch${c};`)}
uniform sampler2D oceanDepth;
uniform vec4 oceanTile;
uniform float oceanDepthMax;
uniform float oceanShoalDepth;
uniform float oceanShoalFloor;
varying vec2 vOceanAt;
varying vec3 vOceanWorld;
varying float vOceanShoal;
varying float vOceanDepth;
#include <fog_pars_vertex>
// The water's depth over xz off the tile: open ocean, 1e4 m, outside it or with none (oceanTile.w 0).
float oceanDepthAt( vec2 xz ) {
  vec2 t = ( xz - oceanTile.xy ) / ( 2.0 * oceanTile.z ) + 0.5;
  if ( oceanTile.w < 0.5 || any( lessThan( t, vec2( 0.0 ) ) ) || any( greaterThan( t, vec2( 1.0 ) ) ) ) return 1.0e4;
  return textureLod( oceanDepth, t, 0.0 ).r * oceanDepthMax;
}
void main() {
  vec3 at = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  vec3 d = vec3( 0.0 );
${each(c => `  d += textureLod( oceanDisp${c}, ${uv(c, 'at.xz')}, max( 0.0, log2( spacing * ${RES.toFixed(1)} / oceanPatch${c} ) ) ).xyz;`)}
  float depth = oceanDepthAt( at.xz );
  float s = oceanShoalFloor + ( 1.0 - oceanShoalFloor ) * smoothstep( 0.0, oceanShoalDepth, depth );
  vec3 world = vec3( at.x + s * d.x, s * d.y, at.z + s * d.z );
  vOceanAt = at.xz;
  vOceanWorld = world;
  vOceanShoal = s;
  vOceanDepth = depth;
  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  #ifdef PREPASS
    mvPosition.xyz *= 1.002;
  #endif
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`
}

const PREPASS_FRAGMENT = /* glsl */ `
void main() { gl_FragColor = vec4( 0.0 ); }
`

function surfaceFragment(count: number) {
  const each = (f: (c: number) => string) => Array.from({ length: count }, (_, c) => f(c)).join('\n')
  const foamed = Math.min(count, 2)
  return /* glsl */ `
${each(c => `uniform sampler2D oceanDisp${c};\nuniform sampler2D oceanDeriv${c};\nuniform float oceanPatch${c};`)}
uniform vec3 oceanSun;
uniform vec3 oceanSunColour;
uniform vec3 oceanZenith;
uniform vec3 oceanHorizon;
uniform vec3 oceanDeep;
uniform vec3 oceanScatter;
uniform vec3 oceanFoamColour;
uniform float oceanGlow;
uniform float oceanGlowPower;
uniform float oceanGlint;
uniform float oceanGlintPower;
uniform float oceanAlpha;
uniform float oceanClearDepth;
uniform vec2 oceanFoamJ;
uniform float oceanBubbles;
uniform float oceanBubbleEdge;
varying vec2 vOceanAt;
varying vec3 vOceanWorld;
varying float vOceanShoal;
varying float vOceanDepth;
#include <fog_pars_fragment>
uint oceanMix( uint x ) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
vec2 oceanGradient( ivec2 c ) {
  float a = float( oceanMix( uint( c.x ) + oceanMix( uint( c.y ) ) ) ) * ( 6.283185307179586 / 4294967296.0 );
  return vec2( cos( a ), sin( a ) );
}
// Gradient noise with a quintic fade, about ±0.7.
float oceanNoise( vec2 p ) {
  vec2 i = floor( p ), f = p - i;
  ivec2 c = ivec2( i );
  vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
  float a = dot( oceanGradient( c ), f );
  float b = dot( oceanGradient( c + ivec2( 1, 0 ) ), f - vec2( 1.0, 0.0 ) );
  float e = dot( oceanGradient( c + ivec2( 0, 1 ) ), f - vec2( 0.0, 1.0 ) );
  float g = dot( oceanGradient( c + ivec2( 1, 1 ) ), f - vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( e, g, u.x ), u.y );
}
void main() {
  float s = vOceanShoal;
  vec4 der = vec4( 0.0 );
${each(c => `  der += texture2D( oceanDeriv${c}, ${uv(c, 'vOceanAt')} );`)}
  vec2 slope = s * der.xy / max( 1.0 + s * der.zw, vec2( 0.18 ) );
  vec3 N = normalize( vec3( -slope.x, 1.0, -slope.y ) );
  vec3 V = normalize( cameraPosition - vOceanWorld );
  float fresnel = mix( 0.02, 0.62, pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), 5.0 ) );
  vec3 R = reflect( -V, N );
  vec3 sky = mix( oceanHorizon, oceanZenith, pow( max( R.y, 0.0 ), 0.55 ) );
  vec3 lit = oceanHorizon + oceanSunColour * max( oceanSun.y, 0.0 );
  vec3 body = mix( oceanDeep, oceanScatter, N.y * 0.6 ) * lit
    + oceanScatter * oceanSunColour * oceanGlow * pow( max( dot( -V, oceanSun ), 0.0 ), oceanGlowPower );
  vec3 H = normalize( V + oceanSun );
  vec3 glint = oceanSunColour * oceanGlint * pow( max( dot( N, H ), 0.0 ), oceanGlintPower ) * max( dot( N, oceanSun ), 0.0 );
  vec3 colour = mix( body, sky, fresnel ) + glint;
  float cover = 0.0;
${Array.from({ length: foamed }, (_, c) => `  cover = max( cover, 1.0 - smoothstep( oceanFoamJ.x, oceanFoamJ.y, texture2D( oceanDisp${c}, ${uv(c, 'vOceanAt')} ).w ) );`).join('\n')}
  float n = clamp( 0.5 + oceanNoise( vOceanAt * oceanBubbles ), 0.0, 1.0 );
  float foam = cover * smoothstep( 1.0 - cover, 1.0 - cover + oceanBubbleEdge, n ) * s;
  colour = mix( colour, oceanFoamColour * lit, foam );
  float alpha = mix( mix( oceanAlpha, 1.0, fresnel ), 1.0, smoothstep( 0.0, oceanClearDepth, vOceanDepth ) );
  gl_FragColor = vec4( colour, alpha * smoothstep( 0.0, 0.28, s ) );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`
}

// ---------------------------------------------------------------- the plugin

// The rows this page draws as a server function reads them, never written: the `w` the page asks
// `ampAt`, and so the `wind` mod, with.
const reading = (wire: Wire): W => {
  const refuse = (what: string) => () => { throw new Error(`ocean3d's page reading the rows does not ${what}`) }
  return {
    world: wire.scene.world ?? {},
    all: kind => wire.rows.filter(r => r.kind === kind),
    get: (id: number): Row => {
      const r = wire.rows.find(r => r.id === id)
      if (!r) throw new Error(`no row ${id} in this packet`)
      return r
    },
    find: (kind, pred = () => true) => {
      const r = wire.rows.find(r => r.kind === kind && pred(r))
      if (!r) throw new Error(`no ${kind} matches in this packet`)
      return r
    },
    spawn: refuse('spawn'),
    end: refuse('end a row'),
    die: refuse('roll'),
    call: refuse('call an act'),
  }
}

type Passes = { evolveH: THREE.ShaderMaterial; evolveD: THREE.ShaderMaterial; reverse: THREE.ShaderMaterial; butterfly: THREE.ShaderMaterial; sign: THREE.ShaderMaterial; displacement: THREE.ShaderMaterial; derivatives: THREE.ShaderMaterial }
type Built = {
  three: Three
  scene: THREE.Scene
  u: Uniforms
  geometry: THREE.BufferGeometry
  colour: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  prepass: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  snap: number
  tile: Tile
  fft: { scene: THREE.Scene; camera: THREE.OrthographicCamera; quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; passes: Passes; scratch: Target[] }
  count: number
  spectrum?: Spectrum
  textures: THREE.DataTexture[]
  disp: Target[][]
  deriv: Target[]
  seaKey?: string
  renderer?: THREE.WebGLRenderer
  t?: number
  clear: boolean
  step: number
}

export function ocean3d() {
  let b: Built | undefined

  function build(plugins: Plugins, numbers: Numbers) {
    const three = plugins.render3d.THREE as Three
    const scene = plugins.render3d.scene as THREE.Scene
    const v3 = () => ({ value: new three.Vector3() })
    const c = () => ({ value: new three.Color() })
    const n = () => ({ value: 0 })
    const res = numbers.depthRes
    const tileTexture = new three.DataTexture(new Uint8Array(res * res), res, res, three.RedFormat, three.UnsignedByteType)
    tileTexture.minFilter = three.LinearFilter
    tileTexture.magFilter = three.LinearFilter
    tileTexture.unpackAlignment = 1
    tileTexture.needsUpdate = true
    const u: Uniforms = {
      ...three.UniformsUtils.clone(three.UniformsLib.fog),
      oceanDepth: { value: tileTexture }, oceanTile: { value: new three.Vector4(0, 0, numbers.depthHalf, 0) }, oceanDepthMax: { value: numbers.depthMax },
      oceanShoalDepth: n(), oceanShoalFloor: n(),
      oceanSun: v3(), oceanSunColour: c(), oceanZenith: c(), oceanHorizon: c(), oceanDeep: c(), oceanScatter: c(), oceanFoamColour: c(),
      oceanGlow: n(), oceanGlowPower: n(), oceanGlint: n(), oceanGlintPower: n(), oceanAlpha: n(), oceanClearDepth: n(),
      oceanFoamJ: { value: new three.Vector2() }, oceanBubbles: n(), oceanBubbleEdge: n(),
    }
    const geometry = disc(three, numbers.rings, numbers.segs, numbers.far)
    const colour = new three.Mesh(geometry, new three.ShaderMaterial())
    colour.renderOrder = 2
    colour.frustumCulled = false
    colour.visible = false
    const prepass = new three.Mesh(geometry, new three.ShaderMaterial())
    prepass.renderOrder = 1
    prepass.frustumCulled = false
    prepass.visible = false
    scene.add(prepass, colour)

    const quad = new three.Mesh(new three.PlaneGeometry(2, 2), new three.ShaderMaterial())
    quad.position.z = -1
    quad.frustumCulled = false
    const fftScene = new three.Scene()
    fftScene.add(quad)
    const pass = (name: string, fragmentShader: string, uniforms: Uniforms, defines: Record<string, string> = {}) =>
      new three.ShaderMaterial({ name, uniforms, defines, vertexShader: QUAD_VERTEX, fragmentShader, depthTest: false, depthWrite: false, toneMapped: false })
    const tex = () => ({ value: null as THREE.Texture | null })
    const assemble = () => ({ hSpace: tex(), dSpace: tex(), prev: tex(), chop: n(), texel: n(), recover: n(), clear: n() })
    const passes: Passes = {
      evolveH: pass('evolve h', EVOLVE_H, { spectrum: tex(), cycle: n(), amp: n() }),
      evolveD: pass('evolve D', EVOLVE_D, { h: tex(), dK: n() }),
      reverse: pass('bit reverse', BIT_REVERSE, { src: tex() }),
      butterfly: pass('butterfly', BUTTERFLY, { src: tex(), span: n() }),
      sign: pass('sign', SIGN, { src: tex() }),
      displacement: pass('displacement', ASSEMBLE, assemble(), { DISPLACEMENT: '' }),
      derivatives: pass('derivatives', ASSEMBLE, assemble()),
    }
    const scratch = Array.from({ length: 4 }, () => target(three, false))
    const tile: Tile = {
      res, half: numbers.depthHalf, max: numbers.depthMax, rows: numbers.depthRows, texture: tileTexture,
      data: tileTexture.image.data as Uint8Array, back: new Uint8Array(res * res), centre: [0, 0], baked: false,
    }
    // The innermost ring's spacing, which the disc is snapped to.
    const snap = (geometry.getAttribute('spacing') as THREE.BufferAttribute).getX(0)
    b = {
      three, scene, u, geometry, colour, prepass, snap, tile,
      fft: { scene: fftScene, camera: new three.OrthographicCamera(-1, 1, 1, -1, 0, 2), quad, passes, scratch },
      count: 0, textures: [], disp: [], deriv: [], clear: true, step: 0,
    }
  }

  function target(three: Three, mipmapped: boolean): Target {
    return new three.WebGLRenderTarget(RES, RES, mipmapped
      ? { type: three.HalfFloatType, format: three.RGBAFormat, depthBuffer: false, generateMipmaps: true, minFilter: three.LinearMipmapLinearFilter, magFilter: three.LinearFilter, wrapS: three.RepeatWrapping, wrapT: three.RepeatWrapping }
      : { type: three.HalfFloatType, format: three.RGBAFormat, depthBuffer: false, generateMipmaps: false, minFilter: three.NearestFilter, magFilter: three.NearestFilter })
  }

  // The spectrum of the sea.s numbers, its textures, and a surface and targets for its cascades.
  function sea(numbers: Numbers) {
    const B = b!, three = B.three
    const key = inputs(numbers).join(',')
    if (B.spectrum?.key !== key) {
      B.spectrum = spectrum(numbers)
      for (const t of B.textures) t.dispose()
      B.textures = B.spectrum.cascades.map(c => {
        const t = new three.DataTexture(c.packed, RES, RES, three.RGBAFormat, three.FloatType)
        t.minFilter = three.NearestFilter
        t.magFilter = three.NearestFilter
        t.needsUpdate = true
        return t
      })
    }
    const count = B.spectrum.cascades.length
    if (count !== B.count) {
      for (const t of [...B.disp.flat(), ...B.deriv]) t.dispose()
      B.disp = Array.from({ length: count }, () => [target(three, true), target(three, true)])
      B.deriv = Array.from({ length: count }, () => target(three, true))
      for (let c = 0; c < count; c++) {
        B.u[`oceanDisp${c}`] = { value: B.disp[c][0].texture }
        B.u[`oceanDeriv${c}`] = { value: B.deriv[c].texture }
        B.u[`oceanPatch${c}`] ??= { value: 0 }
      }
      const vertexShader = surfaceVertex(count)
      B.colour.material.dispose()
      B.colour.material = new three.ShaderMaterial({
        name: 'ocean3d', uniforms: B.u, vertexShader, fragmentShader: surfaceFragment(count),
        transparent: true, depthWrite: false, depthFunc: three.LessEqualDepth, side: three.FrontSide, fog: true,
      })
      B.prepass.material.dispose()
      B.prepass.material = new three.ShaderMaterial({
        name: 'ocean3d depth', uniforms: B.u, vertexShader, fragmentShader: PREPASS_FRAGMENT, defines: { PREPASS: '' },
        colorWrite: false, side: three.DoubleSide,
      })
      B.count = count
    }
    B.spectrum.cascades.forEach((c, i) => { B.u[`oceanPatch${i}`].value = c.patch })
    const seaKey = `${key}|${numbers.amp}|${numbers.chop}`
    if (seaKey !== B.seaKey) {
      B.seaKey = seaKey
      B.clear = true
    }
  }

  // The seabed tile: whole with the first ground, then a sliced bake whenever the camera has gone far.
  function seabed(ground: Ground | undefined, eye: THREE.Vector3) {
    const B = b!, tile = B.tile
    const tu = B.u.oceanTile.value as THREE.Vector4
    if (!ground) { tu.w = 0; return }
    const texel = (2 * tile.half) / tile.res
    const centre = (): [number, number] => [Math.round(eye.x / texel) * texel, Math.round(eye.z / texel) * texel]
    const bakeRow = (into: Uint8Array, [cx, cz]: [number, number], j: number) => {
      const z = cz - tile.half + (j + 0.5) * texel
      for (let i = 0; i < tile.res; i++) {
        const depth = ground.depth(cx - tile.half + (i + 0.5) * texel, z)
        into[j * tile.res + i] = Math.round(Math.min(1, Math.max(0, depth / tile.max)) * 255)
      }
    }
    const show = () => {
      tu.set(tile.centre[0], tile.centre[1], tile.half, 1)
      tile.texture.needsUpdate = true
    }
    const now = ground.edits?.()
    if (!tile.baked) {
      tile.centre = centre()
      for (let j = 0; j < tile.res; j++) bakeRow(tile.data, tile.centre, j)
      tile.baked = true
      tile.from = now
      show()
      return
    }
    tu.w = 1
    // An edit since the shown tile's bake that reaches it: a new land, or a layer whose version moved
    // and whose rect overlaps it.
    const [cx, cz] = tile.centre, then = tile.from
    const touched = () => !!now && (!then || now.land !== then.land ||
      now.layers.some((l, k) => l.version !== then.layers[k]?.version && l.rect[0] < cx + tile.half && l.rect[2] > cx - tile.half && l.rect[1] < cz + tile.half && l.rect[3] > cz - tile.half))
    // A bake in hand runs to its end whatever is edited meanwhile, so a held brush cannot start it
    // again every frame; it swaps in with the edits it started from, and those since start the next.
    if (!tile.next) {
      if (Math.max(Math.abs(eye.x - cx), Math.abs(eye.z - cz)) > tile.half / 2) tile.next = { centre: centre(), row: 0, from: now }
      else if (touched()) tile.next = { centre: tile.centre, row: 0, from: now }
    }
    const next = tile.next
    if (!next) return
    for (let k = 0; k < tile.rows && next.row < tile.res; k++) bakeRow(tile.back, next.centre, next.row++)
    if (next.row < tile.res) return
    ;[tile.data, tile.back] = [tile.back, tile.data]
    tile.texture.image.data = tile.data
    tile.centre = next.centre
    tile.from = next.from
    tile.next = undefined
    show()
  }

  // Every cascade's waves at the row's t, and its foam moved on by dt.
  function fft(renderer: THREE.WebGLRenderer, numbers: Numbers, t: number, dt: number, amp: number) {
    const B = b!, { scene, camera, quad, passes, scratch } = B.fft
    const draw = (material: THREE.ShaderMaterial, into: Target, values: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(values)) material.uniforms[k].value = v
      quad.material = material
      renderer.setRenderTarget(into)
      renderer.render(scene, camera)
    }
    const [A, Bt, C, D] = scratch
    // The inverse transform of `of`, left in `of`.
    const transform = (of: Target) => {
      draw(passes.reverse, C, { src: of.texture })
      let from = C, to = D
      for (let s = 0; s < BITS; s++) {
        draw(passes.butterfly, to, { src: from.texture, span: 1 << s })
        ;[from, to] = [to, from]
      }
      draw(passes.sign, of, { src: from.texture })
    }
    const was = renderer.getRenderTarget()
    const step = dt * numbers.foamRecovery
    B.step = step
    B.spectrum!.cascades.forEach((c, i) => {
      draw(passes.evolveH, A, { spectrum: B.textures[i], cycle: t / numbers.repeat, amp })
      draw(passes.evolveD, Bt, { h: A.texture, dK: c.dK })
      transform(A)
      transform(Bt)
      const [prev, cur] = B.disp[i]
      B.disp[i] = [cur, prev]
      const common = { hSpace: A.texture, dSpace: Bt.texture, chop: numbers.chop, texel: c.patch / RES }
      draw(passes.displacement, cur, { ...common, prev: prev.texture, recover: step, clear: B.clear ? 1 : 0 })
      draw(passes.derivatives, B.deriv[i], common)
      B.u[`oceanDisp${i}`].value = cur.texture
    })
    renderer.setRenderTarget(was)
    B.clear = false
  }

  return {
    afterTick(plugins: Plugins) {
      const found = plugins.wire.rows.find(r => r.kind === 'ocean3d')
      if (!found) return
      const { scene } = plugins.wire
      const world = scene.world!
      const numbers = world.ocean3d as Numbers
      const t = found.data.t as number
      if (!plugins.render3d) throw new Error('ocean3d draws through render3d, which this scene does not list')
      const sky = mod<Light>(world, 'ocean3d', 'light')
      if (!sky && !numbers.light) throw new Error('ocean3d draws in a light, and this scene gives none: name the plugin whose light it is in world.ocean3d.mods.light, or give a fixed one in world.ocean3d.light')
      ahead(scene, 'ocean3d', 'light')
      ahead(scene, 'ocean3d', 'land')
      const camera = plugins.render3d.camera as THREE.PerspectiveCamera | undefined
      const lit = sky?.(plugins)
      if (!camera || (sky && !lit)) return
      if (!b) build(plugins, numbers)
      const B = b!
      sea(numbers)
      seabed(mod<Land>(world, 'ocean3d', 'land')?.(plugins), camera.position)

      B.colour.position.set(Math.round(camera.position.x / B.snap) * B.snap, 0, Math.round(camera.position.z / B.snap) * B.snap)
      B.prepass.position.copy(B.colour.position)
      const u = B.u
      const sun = u.oceanSun.value as THREE.Vector3, sunColour = u.oceanSunColour.value as THREE.Color
      const zenith = u.oceanZenith.value as THREE.Color, horizon = u.oceanHorizon.value as THREE.Color
      if (lit) {
        sun.copy(lit.sun)
        sunColour.copy(lit.sunColor)
        zenith.copy(lit.zenith)
        horizon.copy(lit.horizon)
      } else {
        const fixed = numbers.light!
        sun.fromArray(fixed.sun).normalize()
        sunColour.set(fixed.sunColor)
        zenith.set(fixed.zenith)
        horizon.set(fixed.horizon)
      }
      ;(u.oceanDeep.value as THREE.Color).set(numbers.deep)
      ;(u.oceanScatter.value as THREE.Color).set(numbers.scatter)
      ;(u.oceanFoamColour.value as THREE.Color).set(numbers.foamColour)
      ;(u.oceanFoamJ.value as THREE.Vector2).fromArray(numbers.foamJ)
      const set = (name: string, value: number) => { u[name].value = value }
      set('oceanGlow', numbers.glow); set('oceanGlowPower', numbers.glowPower); set('oceanGlint', numbers.glint); set('oceanGlintPower', numbers.glintPower)
      set('oceanAlpha', numbers.alpha); set('oceanClearDepth', numbers.clearDepth); set('oceanBubbles', numbers.bubbles); set('oceanBubbleEdge', numbers.bubbleEdge)
      set('oceanShoalDepth', numbers.shoalDepth); set('oceanShoalFloor', numbers.shoalFloor)

      const renderer = plugins.render3d.renderer as THREE.WebGLRenderer | undefined
      if (!renderer) return
      if (renderer !== B.renderer) {
        B.renderer = renderer
        B.clear = true
      }
      const dt = B.t === undefined ? 0 : ((((t - B.t) % numbers.repeat) + numbers.repeat) % numbers.repeat)
      B.t = t
      fft(renderer, numbers, t, dt, ampAt(reading(plugins.wire)))
      B.colour.visible = true
      B.prepass.visible = true
    },
    sea: () => b && {
      colour: b.colour, prepass: b.prepass, geometry: b.geometry, snap: b.snap, uniforms: b.u, spectrum: b.spectrum, textures: b.textures,
      disp: b.disp, deriv: b.deriv, tile: b.tile, passes: b.fft.passes, camera: b.fft.camera, scratch: b.fft.scratch, quad: b.fft.quad,
      t: b.t, step: b.step,
    },
    close() {
      if (!b) return
      const B = b
      B.scene.remove(B.colour, B.prepass)
      B.geometry.dispose()
      B.colour.material.dispose()
      B.prepass.material.dispose()
      for (const m of Object.values(B.fft.passes)) m.dispose()
      B.fft.quad.geometry.dispose()
      for (const t of [...B.fft.scratch, ...B.disp.flat(), ...B.deriv]) t.dispose()
      for (const t of B.textures) t.dispose()
      B.tile.texture.dispose()
      b = undefined
    },
  }
}
