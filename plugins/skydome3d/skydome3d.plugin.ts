// The browser half of skydome3d, the one sky: the dome, the lights, the fog, the exposure, the
// scene's environment and the shadow box. It draws the skydome3d row and the scene's
// `world.skydome3d` as they stand, and nothing interpolates: the sun comes from the row's `t` through
// the server half's `sun` (`skydome3d.sim.ts`). The weather (weather3d) and the clouds (clouds3d) are
// plugins of their own, listed after this one: the clouds draw into the dome through `dome`, below,
// and the weather reaches the sky through the `weather` mod.
//
// It reads the camera where it stands in its `afterTick`, which runs after every plugin's tick,
// where a follow camera or a shot places it. So a scene lists it before `render3d`, which draws in
// its own `afterTick`, and after anything that places the camera in its own `afterTick`. It registers
// its splice with render3d in its first `tick` with a row, before any `afterTick` dresses a material.
//
// The browser half's keys of `world.skydome3d`, beside the server half's (`skydome3d.sim.ts`):
//   look     the dome palette and the lights, every colour authored sRGB, read one way, converted
//            to linear:
//              dayZenith dayHorizon nightZenith nightHorizon setZenith setHorizon  the gradient
//              sunHigh sunLow   the sun's colour high and low; moon, the moon's; ground, the
//                               hemisphere light's ground
//              exposure nightOpen  render3d's exposure is exposure·(1 + nightOpen·night)
//              sunIntensity moonIntensity hemiDay hemiNight  the lights, below
//              stars     the stars' strength
//              starSize  a star's radius in cells of its grid; twinkle how deep it twinkles;
//                        twinkles whole cycles a day, times a whole number from 1 to twinkleSpread
//                        picked by each star's hash, so the stars meet themselves at midnight
//              sunShrink [lo, hi]  the sun.y over which the disc shrinks from its horizon size
//                                  (0.0115 rad) to its high size (0.0080 rad)
//              sunEdge moonEdge  where a disc's edge starts to soften, a fraction of its radius
//              moonSize  the moon's radius in radians
//              radius     the dome's radius in metres
//              overcast   the weather's gloom, below
//              haze mist  the fog, below
//              envSun envMix envIntensity  the environment, below
//   shadow   { map, half, near, far, bias, normalBias }: the key light's shadow box.
//   off      the parts not drawn, read once when the sky is built, for measuring what each costs:
//              dome      the dome not drawn at all
//              gradient stars moon sun flash  each compiled out of the dome's shader; with no
//                        gradient the dome starts from black
//              fog       no fog put on the scene
//              environment  no environment made from the dome
//              shadow    the key light casts no shadow
//            A part it does not know throws.
//
// The land a scene names for it, `world.skydome3d.mods: { land: '<a>' }` (terrain3d's,
// `terrain3d.skydome3d.ts`), is listed before it, and a scene that lists it after, or does not list
// it, throws (`ahead`).
//
// The weather the sky stands in comes through a mod, `world.skydome3d.mods: { weather: '<a>' }`
// (weather3d's, `weather3d.skydome3d.ts`): `weather(plugins)` is `{ mix, lift, to, from, blend,
// shares }`, the Weather standing under the camera, how far a lightning flash lifts the sky now (0
// with none), the weather the sky is going to and the one it left, how far it has gone, and each
// biome's share under the camera. With none named, the sky stands in no weather: every number of
// `mix` 0, no lift, and the environment made again only for the sun and a new look. A scene that names
// one and does not list its plugin throws.
//
// The palette, from the sun's elevation `el` in radians: day = smooth(−0.10, 0.22, el), night =
// 1 − smooth(−0.16, 0.02, el), sunset = exp(−(el/0.20)²). The zenith is mix(nightZenith, dayZenith,
// day) pushed toward setZenith by sunset·0.65·day, the horizon likewise by sunset·0.85·day, and the
// sun's colour is mix(sunLow, sunHigh, smooth(0.02, 0.40, el)). The weather's gloom: the zenith and
// horizon, and so the fog and the dome, the hemisphere light's ground colour, and the key and
// hemisphere lights' intensities are multiplied by dark = max(0, 1 − overcast·mix.cloud·mix.dense).
//
// The lights. The key light is a directional light toward the brighter of the sun, at
// (0.5 + sunIntensity·day)·(1 − night) in the sun's colour, and the moon, at
// moonIntensity·night·moonLit·smooth(−0.10, 0.22, the moon's elevation) in `moon`, so a moon that
// has set lights nothing from under the ground. It shines at the brighter less the dimmer, so its
// intensity is 0 at the moment it changes body, times dark, and the weather's lift is added for as
// long as a flash lasts. The hemisphere light is the horizon over `ground`, at hemiNight + hemiDay·day.
// The fog is FogExp2, of density haze·(0.6 + mix.haze·0.5) + mix.fog·mist. Three mixes the fog into a
// lit material after its tone mapping, so the fog's colour is the dome's horizon as drawn, the
// horizon plus a flash's lift, passed through three's tone curve (`toneMap`, the same `aces` and
// `neutral` render3d names) at the exposure; with render3d's `ao` on the frame is tone mapped at its
// end, and the fog's colour is that horizon itself. So the dome behind a fogged hill is the fog on
// it, through a flash too.
//
// The shadow box. The key light casts from the first frame on and never stops, its intensity going
// to 0 through the night, so no program recompiles at sunrise. Its box is `half` metres each way
// across the light, `near` to `far` along it, centred on the camera snapped to whole texels
// (2·half/map) across the light, in three's `lookAt` basis with the shadow camera's up; the light
// stands far/2 out from that centre. Three's PCF shadow adds the bias to the receiver's depth with
// no reversed branch, while under reversed depth its map compares GreaterEqual, so when render3d's
// renderer draws reversed depth with a PCF map the key light is handed −bias; its basic and VSM paths
// turn the bias themselves and take it as it is.
//
// The dome is a BackSide sphere of `radius`, 48×24, drawn first (renderOrder −1000) with no depth
// write and no fog, centred on the camera, its shader ending in three's tonemapping and colorspace
// chunks. Along each direction D from the camera it draws:
//   the gradient  mix(horizon, zenith, pow(D.y, 0.55)); below the horizon, the horizon.
//   stars         D turned about the pole at `lat` by the hour, hashed on a 220 grid of its xz/|y|,
//                 one star in a cell whose hash passes 0.9975, twinkling, times stars·night, dimmed
//                 toward the horizon by D.y.
//   the moon      a disc lit toward the sun by cos 2πφ from behind and |sin 2πφ| from the side.
//   the sun       a disc 0.0080–0.0115 rad in radius at 0.5 + sunIntensity·day, a glow
//                 pow(·, 900)·0.30 and a halo pow(·, 8)·(0.20 + 0.45·sunset), all times (1 − night).
//   the splices   each `dome` splice's main, in the order they were handed over (clouds3d's deck,
//                 cirrus and god rays).
//   a flash       the weather's lift added to every colour.
// Nothing is cut below the dome's horizon: the gradient is the horizon there and the sun's glow and
// halo carry on.
//
// `dome(key, { uniforms, common, main })` hands the dome's shader a splice, once per key: `common`
// goes before its `main()`, after the dome's own uniforms and `NOISE` (so a splice reads skySun,
// skyZenith, skyHorizon, skyKey, skyLight, skyNight and the rest by name), `main` goes in its `main()`
// after the sun and before the flash, with the colour so far in `vec3 sky`, the unit way `D` and the
// camera `eye`; the `uniforms` objects join the dome's own, so the plugin that owns them writes
// `value` once a frame. A splice handed over after the dome is built rebuilds its shader. `skyLight`
// is the key light's colour times its intensity, the lift and all.
//
// `NOISE` is the one value noise the sky's splices share, 4 octaves at ×2.03 with a 0.55 domain warp:
// `skyCloudAt(q, w, cover, sharp, salt)` is coverage smoothstep(hi − e, hi + e, n) and thickness
// smoothstep(hi, hi + 0.30, n) of the noise at q warped by the noise at w, hi = 1 − cover, e =
// max(0.02, sharp·0.5); salt picks where in the noise. It is in the dome's shader, and it is
// registered with render3d's `splice` under `skydome3d`, so it is in every dressed material's
// shader too, for clouds3d's cloud shadow and weather3d's snow.
//
// The environment. The dome, as it draws, is drawn alone into three's PMREMGenerator on render3d's
// renderer (`fromScene`, sigma 0, the cube camera's own near and far, from the camera's position),
// through a second mesh on the dome's geometry and material scaled to a metre in radius, and the
// result is the scene's `environment`, lit at `look.envIntensity` (three's
// `scene.environmentIntensity`), so a metal reflects the sky and every standard or physical material
// is lit by it. It is made on the first frame with a renderer and again only when stale
// (`stale(look, then, now)` over `lit(row, weather)`: none yet, a new `to`, `from` or look, the sun
// turned more than envSun radians, or s, the smoothstep of `blend`, or a biome's share under the camera
// moved more than envMix); the one before is disposed. It is drawn without a flash, `skyLight` at the
// key light less the lift, all put back after, so a refresh during a flash does not hold the flash
// for as long as it stands.
//
// It hands out `light()`, for the sea, the weather, the clouds and whatever is lit apart from the
// scene, a cockpit drawn in render3d's overlay: `{ sun, sunColor, zenith, horizon, fog, key, keyColor,
// sky, ground, night }`, the sun's direction, its colour times its share of the key light and dark (0
// once the moon has the key), the zenith and horizon in linear, and the scene's fog; `key`, the unit
// way toward the body the key light shines from, sun or moon, and `keyColor`, its colour times its
// intensity, a flash and all; `sky` and `ground`, the hemisphere light's two colours times its
// intensity; `night`, the palette's. The same objects every frame, moved in place. `sky()` is a
// probe for tests: the palette's numbers, the lights, the fog, the dome and the dome's uniforms. Both
// are undefined until the sky has drawn its first frame. `close` takes all of it off the scene and
// disposes it, the environment and its generator too, empties the scene's `environment` and fog and
// puts its environment intensity back to 1.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { moon as moonOf, moonLit, sun as sunOf, type Sky, type Table } from './skydome3d.sim.ts'
import type { Weather } from '#plugins/weather3d/weather3d.sim.ts'

export type Look = {
  dayZenith: string; dayHorizon: string; nightZenith: string; nightHorizon: string; setZenith: string; setHorizon: string
  sunHigh: string; sunLow: string; moon: string; ground: string
  exposure: number; nightOpen: number; sunIntensity: number; moonIntensity: number; hemiDay: number; hemiNight: number
  stars: number; haze: number; mist: number; starSize: number; twinkle: number; twinkles: number; twinkleSpread: number
  sunShrink: [number, number]; sunEdge: number; moonEdge: number; moonSize: number; radius: number; overcast: number
  envSun: number; envMix: number; envIntensity: number
}
export type Shadow = { map: number; half: number; near: number; far: number; bias: number; normalBias: number }
// The parts `world.skydome3d.off` can take out, each compiled out of the dome's shader as
// `SKY_NO_<PART>` or never drawn.
export const PARTS = ['dome', 'gradient', 'stars', 'moon', 'sun', 'flash', 'fog', 'environment', 'shadow'] as const
export type Part = (typeof PARTS)[number]
const defineOf = (part: Part) => `SKY_NO_${part.toUpperCase()}`
// The row with `world.skydome3d` beside it, which the frame is drawn from.
type Row = Sky & Table & { look: Look; shadow: Shadow; off?: Part[] }
// What the `weather` mod hands back: the weather the sky stands in this frame.
export type Standing = { mix: Weather; lift: number; to: string; from: Weather; blend: number; shares: Record<string, number> }
type WeatherMod = (plugins: Plugins) => Standing | undefined
// A splice of the dome's shader.
export type DomeSplice = { uniforms?: Record<string, THREE.IUniform>; common?: string; main?: string }
const skyOf = (plugins: Plugins, data: Record<string, any>): Row => ({ ...data, ...plugins.wire.scene.world!.skydome3d })
type Tone = 'aces' | 'neutral' | 'none' | undefined
type Three = typeof import('three')
type Uniforms = Record<string, THREE.IUniform>

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// Three's tone curves as its tonemapping chunk has them, exposure and all: a colour in linear through
// `aces` or `neutral`, and back as it was through `none` or none named.
export function toneMap(tone: Tone, [r, g, b]: number[], exposure: number): number[] {
  if (tone === 'aces') {
    const k = exposure / 0.6
    r *= k; g *= k; b *= k
    const fit = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081)
    const i = [fit(0.59719 * r + 0.35458 * g + 0.04823 * b), fit(0.076 * r + 0.90834 * g + 0.01566 * b), fit(0.0284 * r + 0.13383 * g + 0.83777 * b)]
    return [1.60475 * i[0] - 0.53108 * i[1] - 0.07367 * i[2], -0.10208 * i[0] + 1.10813 * i[1] - 0.00605 * i[2], -0.00327 * i[0] - 0.07276 * i[1] + 1.07602 * i[2]].map(clamp01)
  }
  if (tone === 'neutral') {
    let c = [r * exposure, g * exposure, b * exposure]
    const x = Math.min(...c)
    const offset = x < 0.08 ? x - 6.25 * x * x : 0.04
    c = c.map(v => v - offset)
    const peak = Math.max(...c), start = 0.8 - 0.04
    if (peak < start) return c
    const d = 1 - start
    const top = 1 - (d * d) / (peak + d - start)
    c = c.map(v => (v * top) / peak)
    const grey = 1 - 1 / (0.15 * (peak - top) + 1)
    return c.map(v => v + (top - v) * grey)
  }
  return [r, g, b]
}

// The weather of a sky that stands in none: every number 0, no lift.
const NONE: Standing = {
  mix: { cloud: 0, cirrus: 0, base: 0, top: 0, dense: 0, rain: 0, snow: 0, fog: 0, haze: 0, wind: 0, gust: 0, thunder: 0, dust: 0 },
  lift: 0, to: '', from: { cloud: 0, cirrus: 0, base: 0, top: 0, dense: 0, rain: 0, snow: 0, fog: 0, haze: 0, wind: 0, gust: 0, thunder: 0, dust: 0 }, blend: 1, shares: {},
}

// What the environment was made from: when it is stale is `stale`.
export type Lit = { sun: number[]; to: string; from: Weather; s: number; look: Look; shares: Record<string, number> }
export const lit = (row: Row, weather: Standing = NONE): Lit => ({ sun: sunOf(row), to: weather.to, from: weather.from, s: smooth(0, 1, weather.blend), look: row.look, shares: weather.shares })
export function stale(look: Look, then: Lit | undefined, now: Lit): boolean {
  if (!then) return true
  if (then.to !== now.to || JSON.stringify(then.from) !== JSON.stringify(now.from) || JSON.stringify(then.look) !== JSON.stringify(now.look)) return true
  const turned = Math.acos(Math.min(1, Math.max(-1, then.sun[0] * now.sun[0] + then.sun[1] * now.sun[1] + then.sun[2] * now.sun[2])))
  const moved = Object.keys({ ...then.shares, ...now.shares }).some(n => Math.abs((now.shares[n] ?? 0) - (then.shares[n] ?? 0)) > look.envMix)
  return turned > look.envSun || Math.abs(now.s - then.s) > look.envMix || moved
}

// One integer hash for the noise and the stars, the same in every program that reads it.
export const HASH = /* glsl */ `
uint skyMix( uint x ) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
float skyDrop( uint a, uint salt ) { return float( skyMix( a + skyMix( salt ) ) ) / 4294967296.0; }
float skyHash( ivec2 c, uint salt ) { return float( skyMix( uint( c.x ) + skyMix( uint( c.y ) + skyMix( salt ) ) ) ) / 4294967296.0; }
`

// The value noise the sky's splices share.
export const NOISE = /* glsl */ `
${HASH}
float skyNoise( vec2 p, uint salt ) {
  vec2 i = floor( p ), f = p - i;
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  ivec2 c = ivec2( i );
  float a = skyHash( c, salt ), b = skyHash( c + ivec2( 1, 0 ), salt );
  float d = skyHash( c + ivec2( 0, 1 ), salt ), e = skyHash( c + ivec2( 1, 1 ), salt );
  return mix( mix( a, b, u.x ), mix( d, e, u.x ), u.y );
}
float skyFbm( vec2 p, uint salt ) {
  float sum = 0.0, amp = 0.5;
  for ( int k = 0; k < 4; k++ ) {
    sum += amp * skyNoise( p, salt );
    p *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}
// Coverage and thickness at noise point q, its warp read at w; salt picks where in the noise.
vec2 skyCloudAt( vec2 q, vec2 w, float cover, float sharp, uint salt ) {
  vec2 warp = vec2( skyFbm( w, salt + 1u ), skyFbm( w, salt + 2u ) ) * 2.0 - 1.0;
  float n = skyFbm( q + 0.55 * warp, salt );
  float hi = 1.0 - cover;
  float e = max( 0.02, sharp * 0.5 );
  return vec2( smoothstep( hi - e, hi + e, n ), smoothstep( hi, hi + 0.30, n ) );
}
`

const DOME_VERTEX = /* glsl */ `
varying vec3 vSkyDir;
void main() {
  vSkyDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const DOME_FRAGMENT = (splices: DomeSplice[]) => /* glsl */ `
uniform vec3 skySun;
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform vec3 skySunColour;
uniform vec3 skyMoonColour;
uniform vec3 skyKey;
uniform vec3 skyLight;
uniform vec3 skyMoon;
uniform float skyNight;
uniform float skySunset;
uniform float skySunPower;
uniform float skyFlash;
uniform float skyStars;
uniform float skyClock;
uniform float skyPhase;
uniform vec2 skyLat;
uniform vec2 skyTurn;
uniform float skyStarSize;
uniform float skyTwinkle;
uniform float skyTwinkles;
uniform float skyTwinkleSpread;
uniform vec2 skySunShrink;
uniform float skySunEdge;
uniform float skyMoonEdge;
uniform float skyMoonSize;
varying vec3 vSkyDir;
${NOISE}
${splices.map(s => s.common ?? '').join('\n')}
void main() {
  vec3 D = normalize( vSkyDir );
  vec3 eye = cameraPosition;
  vec3 sky = vec3( 0.0 );
  #ifndef SKY_NO_GRADIENT
    sky = D.y > 0.0 ? mix( skyHorizon, skyZenith, pow( D.y, 0.55 ) ) : skyHorizon;
  #endif

  #ifndef SKY_NO_STARS
  if ( D.y > 0.0 && skyStars > 0.0 ) {
    // D in the frame of the pole, turned back by the hour: sin δ, then cos δ at the hour angle less H.
    float cc = skyLat.x * D.z + skyLat.y * D.y;
    float cs = - D.x;
    vec3 S = vec3( cc * skyTurn.x + cs * skyTurn.y, skyLat.y * ( - D.z ) + skyLat.x * D.y, cs * skyTurn.x - cc * skyTurn.y );
    vec2 g = S.xz / abs( S.y ) * 220.0;
    ivec2 cell = ivec2( floor( g ) );
    uint side = S.y > 0.0 ? 10u : 20u;
    if ( skyHash( cell, side ) > 0.9975 ) {
      vec2 at = skyStarSize + ( 1.0 - 2.0 * skyStarSize ) * vec2( skyHash( cell, side + 1u ), skyHash( cell, side + 2u ) );
      float shape = 1.0 - smoothstep( 0.0, skyStarSize, length( g - vec2( cell ) - at ) );
      float k = 1.0 + floor( skyHash( cell, side + 3u ) * skyTwinkleSpread );
      float twinkle = 1.0 - skyTwinkle * ( 0.5 + 0.5 * sin( 6.28318530718 * ( skyTwinkles * k * skyClock + skyHash( cell, side + 4u ) ) ) );
      sky += vec3( skyStars * shape * twinkle * skyHash( cell, side + 5u ) * D.y );
    }
  }
  #endif

  #ifndef SKY_NO_MOON
  float mc = dot( D, skyMoon );
  vec3 o = ( D - skyMoon * mc ) / skyMoonSize;
  float r2 = dot( o, o );
  if ( mc > 0.0 && r2 < 1.0 ) {
    vec3 n = o - skyMoon * sqrt( 1.0 - r2 );
    vec3 side = skySun - skyMoon * dot( skySun, skyMoon );
    side = dot( side, side ) > 0.0 ? normalize( side ) : vec3( 0.0 );
    float a = 6.28318530718 * skyPhase;
    vec3 L = side * abs( sin( a ) ) + skyMoon * cos( a );
    sky += skyMoonColour * max( dot( n, L ), 0.0 ) * ( 1.0 - smoothstep( skyMoonEdge, 1.0, sqrt( r2 ) ) );
  }
  #endif

  #ifndef SKY_NO_SUN
  float sd = dot( D, skySun );
  float r = mix( 0.0115, 0.0080, smoothstep( skySunShrink.x, skySunShrink.y, skySun.y ) );
  float disc = 1.0 - smoothstep( r * skySunEdge, r, acos( clamp( sd, -1.0, 1.0 ) ) );
  float s = max( sd, 0.0 );
  sky += skySunColour * ( disc * skySunPower + pow( s, 900.0 ) * 0.30 + pow( s, 8.0 ) * ( 0.20 + 0.45 * skySunset ) ) * ( 1.0 - skyNight );
  #endif

${splices.map(s => s.main ?? '').join('\n')}

  #ifndef SKY_NO_FLASH
  sky += vec3( skyFlash );
  #endif
  gl_FragColor = vec4( sky, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

type Built = {
  three: Three
  scene: THREE.Scene
  u: Uniforms
  dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  env: { scene: THREE.Scene; mesh: THREE.Mesh; pmrem?: THREE.PMREMGenerator; target?: THREE.WebGLRenderTarget; then?: Lit }
  key: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  fog: THREE.FogExp2
  off: Set<Part>
  shadowKey: string
  colour: THREE.Color
  light: Light
}
// The sky's light as `light()` hands it out, changed in place every frame.
export type Light = { sun: THREE.Vector3; sunColor: THREE.Color; zenith: THREE.Color; horizon: THREE.Color; fog: THREE.FogExp2; key: THREE.Vector3; keyColor: THREE.Color; sky: THREE.Color; ground: THREE.Color; night: number }

export function skydome3d() {
  let b: Built | undefined
  let probe: ReturnType<typeof read> | undefined
  let shown = false
  const splices = new Map<string, DomeSplice>()

  // The dome's shader with every splice handed over so far, and their uniforms beside its own.
  function shade() {
    if (!b) return
    const material = b.dome.material
    material.fragmentShader = DOME_FRAGMENT([...splices.values()])
    for (const s of splices.values()) Object.assign(material.uniforms, s.uniforms)
    material.needsUpdate = true
  }

  // Everything the sky puts on render3d's scene, and its splice, once.
  function build(plugins: Plugins, row: Row) {
    const three = plugins.render3d.THREE as Three
    const scene = plugins.render3d.scene as THREE.Scene
    const v3 = () => ({ value: new three.Vector3() })
    const c = () => ({ value: new three.Color() })
    const n = () => ({ value: 0 })
    const u: Uniforms = {
      skySun: v3(),
      skyZenith: c(), skyHorizon: c(), skySunColour: c(), skyMoonColour: c(), skyKey: v3(), skyLight: c(), skyMoon: v3(),
      skyNight: n(), skySunset: n(), skySunPower: n(), skyFlash: n(), skyStars: n(), skyClock: n(), skyPhase: n(),
      skyLat: { value: new three.Vector2() }, skyTurn: { value: new three.Vector2() },
      skyStarSize: n(), skyTwinkle: n(), skyTwinkles: n(), skyTwinkleSpread: n(),
      skySunShrink: { value: new three.Vector2() }, skySunEdge: n(), skyMoonEdge: n(), skyMoonSize: n(),
    }
    for (const part of row.off ?? []) if (!PARTS.includes(part)) throw new Error(`skydome3d has no part ${part} to take off; its parts are ${PARTS.join(', ')}`)
    const off = new Set(row.off ?? [])
    const defines = Object.fromEntries([...off].map(part => [defineOf(part), '']))
    plugins.render3d.splice('skydome3d', { fragment: { common: NOISE } })

    const material = new three.ShaderMaterial({ uniforms: u, defines, vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT([]), side: three.BackSide, depthWrite: false })
    const dome = new three.Mesh(new three.SphereGeometry(row.look.radius, 48, 24), material)
    dome.renderOrder = -1000
    dome.visible = !off.has('dome')
    scene.add(dome)
    const envScene = new three.Scene()
    const envMesh = new three.Mesh(dome.geometry, material)
    envScene.add(envMesh)

    const key = new three.DirectionalLight()
    key.castShadow = !off.has('shadow')
    scene.add(key, key.target)
    const hemi = new three.HemisphereLight()
    scene.add(hemi)
    const fog = new three.FogExp2(0xffffff, 0)
    if (!off.has('fog')) scene.fog = fog
    b = {
      three, scene, u, dome, env: { scene: envScene, mesh: envMesh }, key, hemi, fog, off, shadowKey: '', colour: new three.Color(),
      light: { sun: new three.Vector3(), sunColor: new three.Color(), zenith: new three.Color(), horizon: new three.Color(), fog, key: new three.Vector3(), keyColor: new three.Color(), sky: new three.Color(), ground: new three.Color(), night: 0 },
    }
    shade()
  }

  // The frame's sky from the row and `world.skydome3d` as they stand, the weather it stands in, the
  // camera where it stands, and render3d's renderer.
  function read(plugins: Plugins, row: Row, weather: Standing, camera: THREE.PerspectiveCamera) {
    const { three, u, key, hemi, fog, colour, light } = b!
    const look = row.look, mix = weather.mix
    const s = sunOf(row), m = moonOf(row)
    const el = Math.asin(Math.min(1, Math.max(-1, s[1])))
    const day = smooth(-0.1, 0.22, el), night = 1 - smooth(-0.16, 0.02, el), sunset = Math.exp(-((el / 0.2) ** 2))
    const dark = Math.max(0, 1 - look.overcast * mix.cloud * mix.dense)
    const zenith = light.zenith.set(look.nightZenith).lerp(colour.set(look.dayZenith), day).lerp(colour.set(look.setZenith), sunset * 0.65 * day).multiplyScalar(dark)
    const horizon = light.horizon.set(look.nightHorizon).lerp(colour.set(look.dayHorizon), day).lerp(colour.set(look.setHorizon), sunset * 0.85 * day).multiplyScalar(dark)
    const sunColour = (u.skySunColour.value as THREE.Color).set(look.sunLow).lerp(colour.set(look.sunHigh), smooth(0.02, 0.4, el))
    const moonColour = (u.skyMoonColour.value as THREE.Color).set(look.moon)

    const sunKey = (0.5 + look.sunIntensity * day) * (1 - night)
    const moonEl = Math.asin(Math.min(1, Math.max(-1, m[1])))
    const moonKey = look.moonIntensity * night * moonLit(row) * smooth(-0.1, 0.22, moonEl)
    const body = sunKey >= moonKey ? 'sun' : 'moon'
    const lift = weather.lift
    const steady = Math.abs(sunKey - moonKey) * dark
    key.intensity = steady + lift
    key.color.copy(body === 'sun' ? sunColour : moonColour)
    const toward = body === 'sun' ? s : m
    hemi.color.copy(horizon)
    hemi.groundColor.set(look.ground).multiplyScalar(dark)
    hemi.intensity = (look.hemiNight + look.hemiDay * day) * dark

    const exposure = look.exposure * (1 + look.nightOpen * night)
    const renderer = plugins.render3d.renderer as THREE.WebGLRenderer | undefined
    if (renderer) renderer.toneMappingExposure = exposure
    const render = plugins.wire.scene.prefabs.render3d ?? {}
    fog.density = look.haze * (0.6 + mix.haze * 0.5) + mix.fog * look.mist
    // The dome's horizon as it is drawn, a flash's lift and all.
    const drawn = colour.copy(horizon).addScalar(lift)
    if (render.ao?.on) fog.color.copy(drawn)
    else fog.color.setRGB(...(toneMap(render.tone, drawn.toArray(), exposure) as [number, number, number]))

    shadowBox(renderer, row.shadow, toward, camera.position)

    const set = (name: string, value: number) => { u[name].value = value }
    ;(u.skySun.value as THREE.Vector3).fromArray(s)
    ;(u.skyMoon.value as THREE.Vector3).fromArray(m)
    ;(u.skyKey.value as THREE.Vector3).fromArray(toward)
    ;(u.skyZenith.value as THREE.Color).copy(zenith)
    ;(u.skyHorizon.value as THREE.Color).copy(horizon)
    const lightAt = (flash: number) => (u.skyLight.value as THREE.Color).copy(key.color).multiplyScalar(steady + flash)
    lightAt(lift)
    const lat = row.lat * (Math.PI / 180), H = (row.t / row.day - 0.5) * 2 * Math.PI
    ;(u.skyLat.value as THREE.Vector2).set(Math.sin(lat), Math.cos(lat))
    ;(u.skyTurn.value as THREE.Vector2).set(Math.cos(H), Math.sin(H))
    ;(u.skySunShrink.value as THREE.Vector2).fromArray(look.sunShrink)
    set('skyNight', night); set('skySunset', sunset); set('skySunPower', 0.5 + look.sunIntensity * day); set('skyFlash', lift)
    set('skyStars', look.stars * night); set('skyClock', row.t / row.day); set('skyPhase', row.phase)
    set('skyStarSize', look.starSize); set('skyTwinkle', look.twinkle); set('skyTwinkles', look.twinkles); set('skyTwinkleSpread', look.twinkleSpread)
    set('skySunEdge', look.sunEdge); set('skyMoonEdge', look.moonEdge); set('skyMoonSize', look.moonSize)

    if (b!.dome.geometry.parameters.radius !== look.radius) {
      b!.dome.geometry.dispose()
      b!.dome.geometry = new three.SphereGeometry(look.radius, 48, 24)
      b!.env.mesh.geometry = b!.dome.geometry
    }
    b!.dome.position.copy(camera.position)
    b!.env.mesh.scale.setScalar(1 / look.radius)

    light.sun.fromArray(s)
    light.sunColor.copy(sunColour).multiplyScalar(body === 'sun' ? steady : 0)
    light.key.fromArray(toward)
    light.keyColor.copy(key.color).multiplyScalar(key.intensity)
    light.sky.copy(hemi.color).multiplyScalar(hemi.intensity)
    light.ground.copy(hemi.groundColor).multiplyScalar(hemi.intensity)
    light.night = night

    environment(renderer, row, weather, camera, () => { set('skyFlash', 0); lightAt(0) }, () => { set('skyFlash', lift); lightAt(lift) })

    return {
      el, day, night, sunset, dark, moonEl, sunKey, moonKey, body, exposure,
      zenith, horizon, sunColour, dome: b!.dome, key, hemi, fog, uniforms: u,
    }
  }

  // The key light's box, centred on the camera snapped to whole texels across the light.
  function shadowBox(renderer: THREE.WebGLRenderer | undefined, sh: Shadow, toward: number[], eye: THREE.Vector3) {
    const { three, key } = b!
    const shadowKey = JSON.stringify(sh)
    const cam = key.shadow.camera
    if (shadowKey !== b!.shadowKey) {
      b!.shadowKey = shadowKey
      key.shadow.map?.dispose()
      key.shadow.map = null
      key.shadow.mapSize.set(sh.map, sh.map)
      cam.left = -sh.half
      cam.right = sh.half
      cam.top = sh.half
      cam.bottom = -sh.half
      cam.near = sh.near
      cam.far = sh.far
      cam.updateProjectionMatrix()
      key.shadow.normalBias = sh.normalBias
    }
    const turned = !!renderer && renderer.state.buffers.depth.getReversed() && renderer.shadowMap.type === three.PCFShadowMap
    key.shadow.bias = turned ? -sh.bias : sh.bias
    const dir = new three.Vector3().fromArray(toward)
    const X = new three.Vector3(), Y = new three.Vector3(), Z = new three.Vector3()
    new three.Matrix4().lookAt(dir, new three.Vector3(), cam.up).extractBasis(X, Y, Z)
    const texel = (2 * sh.half) / sh.map
    const snap = (v: number) => Math.round(v / texel) * texel
    const centre = X.multiplyScalar(snap(eye.dot(X))).add(Y.multiplyScalar(snap(eye.dot(Y)))).add(Z.multiplyScalar(eye.dot(Z)))
    key.target.position.copy(centre)
    key.position.copy(centre).addScaledVector(dir, sh.far / 2)
  }

  // The scene's environment, made again only when stale, drawn with the flash taken out.
  function environment(renderer: THREE.WebGLRenderer | undefined, row: Row, weather: Standing, camera: THREE.PerspectiveCamera, calm: () => void, back: () => void) {
    const { three, scene, env } = b!
    if (!renderer || b!.off.has('environment')) return
    const now = lit(row, weather)
    if (stale(row.look, env.then, now)) {
      env.pmrem ??= new three.PMREMGenerator(renderer)
      env.mesh.position.copy(camera.position)
      calm()
      const target = env.pmrem.fromScene(env.scene, 0, undefined, undefined, { position: camera.position })
      back()
      env.target?.dispose()
      env.target = target
      env.then = now
      scene.environment = target.texture
    }
    scene.environmentIntensity = row.look.envIntensity
  }

  return {
    tick(plugins: Plugins) {
      if (b) return
      const row = plugins.wire.rows.find(r => r.kind === 'skydome3d')
      if (row) build(plugins, skyOf(plugins, row.data))
    },
    afterTick(plugins: Plugins) {
      ahead(plugins.wire.scene, 'skydome3d', 'land')
      const row = plugins.wire.rows.find(r => r.kind === 'skydome3d')
      if (!row) return
      const sky = skyOf(plugins, row.data)
      if (!b) build(plugins, sky)
      const camera = plugins.render3d.camera as THREE.PerspectiveCamera | undefined
      if (!camera) return
      const world = plugins.wire.scene.world!
      const weatherMod = mod<WeatherMod>(world, 'skydome3d', 'weather')
      if (weatherMod) provided(plugins.wire.scene, 'skydome3d', 'weather')
      probe = read(plugins, sky, weatherMod?.(plugins) ?? NONE, camera)
      shown = true
    },
    dome(key: string, s: DomeSplice) {
      if (splices.has(key)) throw new Error(`skydome3d already has the dome splice ${key}`)
      splices.set(key, s)
      shade()
    },
    light: () => (shown ? b!.light : undefined),
    sky: () => (shown ? probe : undefined),
    close() {
      if (!b) return
      const { scene, dome, key, hemi, fog, env } = b
      scene.remove(dome, key, key.target, hemi)
      dome.geometry.dispose()
      dome.material.dispose()
      key.dispose()
      hemi.dispose()
      if (scene.fog === fog) scene.fog = null
      env.target?.dispose()
      env.pmrem?.dispose()
      scene.environment = null
      scene.environmentIntensity = 1
      b = undefined
      probe = undefined
      shown = false
    },
  }
}
