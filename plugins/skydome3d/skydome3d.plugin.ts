// The browser half of skydome3d, the one sky: the dome, the lights, the fog, the exposure, the
// scene's environment, the shadow box, the weather on every dressed surface, the rain, snow and dust,
// and lightning. It draws the skydome3d row and the scene's `world.skydome3d` as they stand, and
// nothing interpolates: the sun comes from the row's `t` through the server half's `sun`
// (`skydome3d.sim.ts`), the clouds from its `drift`, the falling things from the packet's step count.
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
//              cloudScale  noise cycles a metre of the cloud function; cloudSharp its edge;
//                          cloudDrift the fraction of the drift its warp moves by, so a cloud changes
//                          shape as it travels; cloudShadow how much the deck takes from direct light
//              cloudLit cloudShade lining  the deck's colour, below; cirrusAlpha the cirrus's
//              godrays stars  the god rays' and the stars' strength
//              starSize  a star's radius in cells of its grid; twinkle how deep it twinkles;
//                        twinkles whole cycles a day, times a whole number from 1 to twinkleSpread
//                        picked by each star's hash, so the stars meet themselves at midnight
//              sunShrink [lo, hi]  the sun.y over which the disc shrinks from its horizon size
//                                  (0.0115 rad) to its high size (0.0080 rad)
//              sunEdge moonEdge  where a disc's edge starts to soften, a fraction of its radius
//              moonSize  the moon's radius in radians
//              snowScale  the cycles a metre the snow's drift field is read at
//              flash      how far a lightning flash lifts the dome's colour and the key light
//              radius     the dome's radius in metres
//              overcast   the weather's gloom, below
//              haze mist  the fog, below
//              envSun envMix envIntensity  the environment, below
//   precip   the falling things, in a box `range` metres from the camera each way:
//              rain snow dust splashes  the most of each, drawn times mix.rain, snow, dust and rain
//              edge      metres inside the box's faces over which a drop fades out, so none pops as
//                        it wraps; near, metres from the camera over which one fades in
//              rainFall rainLen rainWidth rainOpacity  m/s, and a streak's length and width in m
//              snowFall snowSize snowOpacity snowSway, dustFall dustSize dustOpacity dustColour
//              dustSway  a sway is [metres, radians a second, spread]: each flake sways across x
//                        and z on two rates, rate·(1 ± spread·(hash − 0.5)), from hashed phases
//              swayPeriod  seconds: each sway rate is put on the nearest whole number of cycles of
//                        it, at least one, and the sway's clock is wrapped by it
//              splashSize splashLife splashOpacity  a splash's radius grown, its life in seconds
//              splashRing  the ring's half-width, a fraction of the splash's radius as it grows
//              lift      metres a splash stands over the ground
//              keyShare  how much of the key light lights the falling things, beside the
//                        hemisphere light
//   shadow   { map, half, near, far, bias, normalBias }: the key light's shadow box.
//
// The splashes stand on the land a mod hands it, `world.skydome3d.mods: { land: '<a>' }` (terrain3d's,
// `terrain3d.skydome3d.ts`): `land(plugins)` is an object whose `height(x, z)` is the ground there, or
// undefined until it has one. With no mod named, or no land yet, no splash is drawn. The plugin the mod
// is is listed before this one, so the land it asks in its `afterTick` is this frame's, and a scene
// that lists it after, or does not list it, throws (`ahead`).
//
// With `world.skydome3d.biomes` (`skydome3d.sim.ts`), every frame is drawn in the weather standing
// under the camera, `here` over the land's `mix(x, z)` at the camera's x and z, each biome's share by
// name: the dome, the deck, the fog, the gloom and the falling things are that place's, so the sky
// slides from one biome's weather to the next as the camera crosses. With no land yet, the scene's;
// with biomes and no land mod named, it throws.
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
// intensity is 0 at the moment it changes body, times dark, and a flash adds `look.flash` for as
// long as it lasts. The hemisphere light is the horizon over `ground`, at hemiNight + hemiDay·day.
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
//   cirrus        at 2.6·base, the cloud function elsewhere in the noise at a sharpness of 1, of
//                 horizon + key·cloudLit, at cirrusAlpha.
//   the deck      at `base`, with parallax from the camera, fading out from 2.5 to 13 km along the
//                 ray: horizon·mix(1, cloudShade, depth) + key·(cloudLit·(1 − depth) + lining·l),
//                 depth = 1 − exp(−thickness·dense) and l = coverage·(1 − thickness)·(1 − the
//                 coverage 400 m toward the key light), `key` the key light's colour times its
//                 intensity. It hides whatever is behind it, the sun's disc, glow and halo too.
//   god rays      6 steps from D toward the key light, each open where the deck is not, times
//                 pow(D·key, 7), godrays·its intensity·(1 − 0.6·night), and the deck's cover.
//   a flash       its lift added to every colour.
// The deck and the cirrus are drawn only from below them. Nothing is cut below the dome's horizon:
// the gradient is the horizon there and the sun's glow and halo carry on.
//
// One cloud function drives the dome, the cloud shadow and the snow cover: 4 octaves of value noise
// at ×2.03 with a 0.55 domain warp; hi = 1 − cover; coverage smoothstep(hi − e, hi + e, n) with e =
// max(0.02, sharp·0.5); thickness smoothstep(hi, hi + 0.30, n). Clouds read it at (p.xz − drift)·
// cloudScale, its warp at (p.xz − drift·cloudDrift)·cloudScale; the snow at p.xz·snowScale with
// cover `pack`.
//
// The weather surface, registered with render3d's `splice` under `skydome3d`, so it reaches every
// dressed standard and physical material with the dome's own uniform objects (a dressed Lambert or
// Phong material takes all of it but the roughness, which it has none of):
//   after normal_fragment_maps  wet darkens the albedo by 0.55·wet and takes its roughness toward
//                               0.09; snow, over up faces smoothstep(0.20, 0.72, n.y) times the
//                               snow's drift field, tints toward (0.90, 0.93, 0.99), takes the
//                               roughness toward 0.72 and bends the normal up by 0.6.
//   after lights_fragment_end   the cloud shadow multiplies directDiffuse and directSpecular, every
//                               direct light: traced up the sun ray to the deck, capped at 6·base,
//                               1 − cloudShadow·coverage·smoothstep(0.05, 0.22, sun.y). A point at or
//                               above the deck's base, a peak over the clouds, takes none.
//
// The falling things are instanced quads, every one drawn from both sides, wrapped on the GPU into
// the box around the camera: each drop's place is hashed from its number, carried by `drift` (the
// wind's integral, gusts and all) and fallen at its speed for the packet's step count times the
// engine's `dt`, so two clients draw the same drops; the drift and the fall are wrapped into the box
// and the sway's clock by swayPeriod here, in doubles, before they reach a float uniform, so a long
// game loses no precision. Rain streaks lie along the wind as it blows
// now against their fall. They are lit by the hemisphere light plus keyShare of the key. Splashes
// are rings that grow and fade over splashLife, each at a place hashed from its number and its life
// in the same box, standing `lift` over the land's `height`.
//
// The environment. The dome, as it draws, is drawn alone into three's PMREMGenerator on render3d's
// renderer (`fromScene`, sigma 0, the cube camera's own near and far, from the camera's position),
// through a second mesh on the dome's geometry and material scaled to a metre in radius, and the
// result is the scene's `environment`, lit at `look.envIntensity` (three's
// `scene.environmentIntensity`), so a metal reflects the sky and every standard or physical material
// is lit by it. It is made on the first frame with a renderer and again only when stale
// (`stale(look, then, now)` over `lit(row, shares)`: none yet, a new `to`, `from` or look, the sun
// turned more than envSun radians, or s, the smoothstep of `blend`, or a biome's share under the camera
// moved more than envMix); the one before is disposed. It is drawn without a flash, the god rays and the light on the deck and the cirrus at the
// key light less the flash, all put back after, so a refresh during a flash does not hold the flash
// for as long as it stands.
//
// It hands out `light()`, for the sea and for whatever is lit apart from the scene, a cockpit drawn
// in render3d's overlay: `{ sun, sunColor, zenith, horizon, fog, key, keyColor, sky, ground }`, the
// sun's direction, its colour times its share of the key light and dark (0 once the moon has the
// key), the zenith and horizon in linear, and the scene's fog; `key`, the unit way toward the body
// the key light shines from, sun or moon, and `keyColor`, its colour times its intensity, a flash and
// all; `sky` and `ground`, the hemisphere light's two colours times its intensity. The same objects
// every frame, moved in place. `sky()` is a
// probe for tests: the palette's numbers, the lights, the fog, the dome, the falling things and the
// dome's uniforms. Both are undefined until the sky has drawn its first frame. `close` takes all of it
// off the scene and disposes it, the environment and its generator too, empties the scene's
// `environment` and fog and puts its environment intensity back to 1.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { here, moon as moonOf, moonLit, sun as sunOf, wind as windOf, type Sky, type Table, type Weather } from './skydome3d.sim.ts'

type Sway = [number, number, number]
export type Look = {
  dayZenith: string; dayHorizon: string; nightZenith: string; nightHorizon: string; setZenith: string; setHorizon: string
  sunHigh: string; sunLow: string; moon: string; ground: string
  exposure: number; nightOpen: number; sunIntensity: number; moonIntensity: number; hemiDay: number; hemiNight: number
  cloudScale: number; cloudSharp: number; cloudDrift: number; cloudShadow: number; godrays: number; stars: number; haze: number; mist: number
  cloudLit: number; cloudShade: number; lining: number; cirrusAlpha: number; starSize: number; twinkle: number; twinkles: number; twinkleSpread: number
  sunShrink: [number, number]; sunEdge: number; moonEdge: number; moonSize: number; snowScale: number; flash: number; radius: number; overcast: number
  envSun: number; envMix: number; envIntensity: number
}
export type Precip = {
  rain: number; snow: number; dust: number; splashes: number; range: number; edge: number; near: number
  rainFall: number; rainLen: number; rainWidth: number; rainOpacity: number
  snowFall: number; snowSize: number; snowOpacity: number; snowSway: Sway
  dustFall: number; dustSize: number; dustOpacity: number; dustColour: string; dustSway: Sway; swayPeriod: number
  splashSize: number; splashLife: number; splashOpacity: number; splashRing: number; lift: number; keyShare: number
}
export type Shadow = { map: number; half: number; near: number; far: number; bias: number; normalBias: number }
// The row with `world.skydome3d` beside it, which the frame is drawn from.
type Row = Sky & Table & { look: Look; precip: Precip; shadow: Shadow }
// What the `land` mod hands back: the ground's height and each biome's share, or undefined until there is one.
type Land = (plugins: Plugins) => { height(x: number, z: number): number; mix(x: number, z: number): Record<string, number> } | undefined
const skyOf = (plugins: Plugins, data: Record<string, any>): Row => ({ ...data, ...plugins.wire.scene.world!.skydome3d })
type Tone = 'aces' | 'neutral' | 'none' | undefined
type Three = typeof import('three')
type Uniforms = Record<string, THREE.IUniform>
type Fall = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>

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

// What the environment was made from: when it is stale is `stale`.
export type Lit = { sun: number[]; to: string; from: Weather; s: number; look: Look; shares: Record<string, number> }
export const lit = (row: Row, shares: Record<string, number> = {}): Lit => ({ sun: sunOf(row), to: row.to, from: row.from, s: smooth(0, 1, row.blend), look: row.look, shares })
export function stale(look: Look, then: Lit | undefined, now: Lit): boolean {
  if (!then) return true
  if (then.to !== now.to || JSON.stringify(then.from) !== JSON.stringify(now.from) || JSON.stringify(then.look) !== JSON.stringify(now.look)) return true
  const turned = Math.acos(Math.min(1, Math.max(-1, then.sun[0] * now.sun[0] + then.sun[1] * now.sun[1] + then.sun[2] * now.sun[2])))
  const moved = Object.keys({ ...then.shares, ...now.shares }).some(n => Math.abs((now.shares[n] ?? 0) - (then.shares[n] ?? 0)) > look.envMix)
  return turned > look.envSun || Math.abs(now.s - then.s) > look.envMix || moved
}

// One integer hash for the drops' and splashes' seeds and the noise, the same in JS and in GLSL.
const mixBits = (x: number) => {
  x = (x ^ (x >>> 16)) >>> 0
  x = Math.imul(x, 0x7feb352d) >>> 0
  x = (x ^ (x >>> 15)) >>> 0
  x = Math.imul(x, 0x846ca68b) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}
const hash01 = (a: number, salt: number) => mixBits((a + mixBits(salt)) >>> 0) / 4294967296
const HASH = /* glsl */ `
uint skyMix( uint x ) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
float skyDrop( uint a, uint salt ) { return float( skyMix( a + skyMix( salt ) ) ) / 4294967296.0; }
float skyHash( ivec2 c, uint salt ) { return float( skyMix( uint( c.x ) + skyMix( uint( c.y ) + skyMix( salt ) ) ) ) / 4294967296.0; }
`

// The cloud function and the cloud shadow, with the uniforms they read: the dome and every dressed
// program declare these the same.
const CLOUD = /* glsl */ `
uniform vec3 skySun;
uniform float skyCover;
uniform float skyBase;
uniform vec2 skyDrift;
uniform float skyScale;
uniform float skySharp;
uniform float skyWarp;
uniform float skyShadow;
uniform float skyWet;
uniform float skyPack;
uniform float skySnowScale;
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
// The clouds over ground point p, carried by the drift.
vec2 skyCloud( vec2 p, float cover, float sharp, uint salt ) {
  return skyCloudAt( ( p - skyDrift ) * skyScale, ( p - skyDrift * skyWarp ) * skyScale, cover, sharp, salt );
}
float skyCloudShadow( vec3 p ) {
  if ( p.y >= skyBase || skySun.y <= 0.0 ) return 1.0;
  float t = min( ( skyBase - p.y ) / skySun.y, 6.0 * skyBase );
  return 1.0 - skyShadow * skyCloud( p.xz + skySun.xz * t, skyCover, skySharp, 0u ).x * smoothstep( 0.05, 0.22, skySun.y );
}
`
// The salts: the deck, the cirrus and the snow each read the noise somewhere of their own.
const SURFACE = {
  normal_fragment_maps: /* glsl */ `{
  vec3 skyUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float skyFacing = inverseTransformDirection( normal, viewMatrix ).y;
  vec2 skyAt = vDressWorld.xz * skySnowScale;
  float skySnow = smoothstep( 0.20, 0.72, skyFacing ) * skyCloudAt( skyAt, skyAt, skyPack, skySharp, 6u ).x;
  diffuseColor.rgb *= 1.0 - 0.55 * skyWet;
  #ifdef STANDARD
    roughnessFactor = mix( roughnessFactor, 0.09, skyWet );
  #endif
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.90, 0.93, 0.99 ), skySnow );
  #ifdef STANDARD
    roughnessFactor = mix( roughnessFactor, 0.72, skySnow );
  #endif
  normal = normalize( mix( normal, skyUp, 0.6 * skySnow ) );
}`,
  lights_fragment_end: /* glsl */ `{
  float skyShade = skyCloudShadow( vDressWorld );
  reflectedLight.directDiffuse *= skyShade;
  reflectedLight.directSpecular *= skyShade;
}`,
}

const DOME_VERTEX = /* glsl */ `
varying vec3 vSkyDir;
void main() {
  vSkyDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`
const DOME_FRAGMENT = /* glsl */ `
uniform vec3 skyZenith;
uniform vec3 skyHorizon;
uniform vec3 skySunColour;
uniform vec3 skyMoonColour;
uniform vec3 skyKey;
uniform vec3 skyKeyColour;
uniform vec3 skyLight;
uniform vec3 skyMoon;
uniform float skyNight;
uniform float skySunset;
uniform float skySunPower;
uniform float skyFlash;
uniform float skyRays;
uniform float skyStars;
uniform float skyClock;
uniform float skyPhase;
uniform float skyCirrus;
uniform float skyDense;
uniform vec2 skyLat;
uniform vec2 skyTurn;
uniform float skyCloudLit;
uniform float skyCloudShade;
uniform float skyLining;
uniform float skyCirrusAlpha;
uniform float skyStarSize;
uniform float skyTwinkle;
uniform float skyTwinkles;
uniform float skyTwinkleSpread;
uniform vec2 skySunShrink;
uniform float skySunEdge;
uniform float skyMoonEdge;
uniform float skyMoonSize;
varying vec3 vSkyDir;
${CLOUD}
// How much of the sky the deck hides along d from the eye.
float skyDeck( vec3 d, vec3 eye ) {
  if ( d.y <= 0.0 || eye.y >= skyBase ) return 0.0;
  float t = ( skyBase - eye.y ) / d.y;
  return skyCloud( eye.xz + d.xz * t, skyCover, skySharp, 0u ).x * ( 1.0 - smoothstep( 2500.0, 13000.0, t ) );
}
void main() {
  vec3 D = normalize( vSkyDir );
  vec3 eye = cameraPosition;
  vec3 sky = D.y > 0.0 ? mix( skyHorizon, skyZenith, pow( D.y, 0.55 ) ) : skyHorizon;

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

  float sd = dot( D, skySun );
  float r = mix( 0.0115, 0.0080, smoothstep( skySunShrink.x, skySunShrink.y, skySun.y ) );
  float disc = 1.0 - smoothstep( r * skySunEdge, r, acos( clamp( sd, -1.0, 1.0 ) ) );
  float s = max( sd, 0.0 );
  sky += skySunColour * ( disc * skySunPower + pow( s, 900.0 ) * 0.30 + pow( s, 8.0 ) * ( 0.20 + 0.45 * skySunset ) ) * ( 1.0 - skyNight );

  if ( D.y > 0.0 ) {
    float high = 2.6 * skyBase;
    if ( eye.y < high ) {
      float t = ( high - eye.y ) / D.y;
      float c = skyCloud( eye.xz + D.xz * t, skyCirrus, 1.0, 3u ).x * ( 1.0 - smoothstep( 2500.0, 13000.0, t ) );
      sky = mix( sky, skyHorizon + skyLight * skyCloudLit, c * skyCirrusAlpha );
    }
    if ( eye.y < skyBase ) {
      float t = ( skyBase - eye.y ) / D.y;
      vec2 q = eye.xz + D.xz * t;
      vec2 c = skyCloud( q, skyCover, skySharp, 0u );
      vec2 toward = dot( skyKey.xz, skyKey.xz ) > 0.0 ? normalize( skyKey.xz ) : vec2( 0.0 );
      float ahead = skyCloud( q + toward * 400.0, skyCover, skySharp, 0u ).x;
      float depth = 1.0 - exp( - c.y * skyDense );
      float l = c.x * ( 1.0 - c.y ) * ( 1.0 - ahead );
      vec3 deck = skyHorizon * mix( 1.0, skyCloudShade, depth ) + skyLight * ( skyCloudLit * ( 1.0 - depth ) + skyLining * l );
      sky = mix( sky, deck, c.x * ( 1.0 - smoothstep( 2500.0, 13000.0, t ) ) );
    }
    float kd = dot( D, skyKey );
    if ( kd > 0.0 && skyRays > 0.0 && skyCover > 0.0 ) {
      float open = 0.0;
      for ( int i = 0; i < 6; i++ ) open += 1.0 - skyDeck( normalize( mix( D, skyKey, float( i ) / 6.0 ) ), eye );
      sky += skyKeyColour * skyRays * skyCover * pow( kd, 7.0 ) * open / 6.0;
    }
  }

  sky += vec3( skyFlash );
  gl_FragColor = vec4( sky, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

const FALL_VERTEX = /* glsl */ `
uniform float fallTime;
uniform float fallPeriod;
uniform float fallDrop;
uniform float fallSpeed;
uniform float fallRange;
uniform float fallEdge;
uniform float fallNear;
uniform vec2 fallCarry;
uniform vec2 fallWind;
uniform vec2 fallQuad;
uniform vec3 fallSway;
varying vec2 vFall;
varying float vFade;
${HASH}
void main() {
  uint id = uint( gl_InstanceID );
  float box = 2.0 * fallRange;
  vec3 p = vec3( skyDrop( id, 0u ), skyDrop( id, 1u ), skyDrop( id, 2u ) ) * box;
  p.xz += fallCarry;
  p.y -= fallDrop;
  #ifdef SWAY
    // Each rate put on the nearest whole number of cycles a period, at least one, so the clock wrapped
    // by the period sways as the clock itself would.
    float turn = 6.28318530718 / fallPeriod;
    float r1 = turn * max( 1.0, floor( fallSway.y * ( 1.0 + fallSway.z * ( skyDrop( id, 3u ) - 0.5 ) ) / turn + 0.5 ) );
    float r2 = turn * max( 1.0, floor( fallSway.y * ( 1.0 - fallSway.z * ( skyDrop( id, 4u ) - 0.5 ) ) / turn + 0.5 ) );
    p.x += fallSway.x * sin( r1 * fallTime + 6.28318530718 * skyDrop( id, 5u ) );
    p.z += fallSway.x * sin( r2 * fallTime + 6.28318530718 * skyDrop( id, 6u ) );
  #endif
  vec3 rel = mod( p - cameraPosition + fallRange, box ) - fallRange;
  vec3 at = cameraPosition + rel;
  float reach = max( abs( rel.x ), max( abs( rel.y ), abs( rel.z ) ) );
  vFade = ( 1.0 - smoothstep( fallRange - fallEdge, fallRange, reach ) ) * smoothstep( 0.0, fallNear, length( rel ) );
  #ifdef STREAK
    vec3 axis = normalize( vec3( fallWind.x, - fallSpeed, fallWind.y ) );
    vec3 across = normalize( cross( axis, rel ) );
    at += across * position.x * fallQuad.x * 0.5 + axis * position.y * fallQuad.y * 0.5;
  #else
    vec3 right = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
    vec3 up = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
    at += ( right * position.x + up * position.y ) * fallQuad.x * 0.5;
  #endif
  vFall = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4( at, 1.0 );
}
`
const FALL_FRAGMENT = /* glsl */ `
uniform vec3 fallLight;
uniform float fallOpacity;
varying vec2 vFall;
varying float vFade;
void main() {
  #ifdef STREAK
    float a = ( 1.0 - abs( vFall.x ) ) * ( 1.0 - vFall.y * vFall.y );
  #else
    float a = max( 0.0, 1.0 - dot( vFall, vFall ) );
  #endif
  gl_FragColor = vec4( fallLight, fallOpacity * a * vFade );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
const SPLASH_VERTEX = /* glsl */ `
attribute vec4 spot;
uniform float splashSize;
varying vec2 vFall;
varying float vAge;
void main() {
  vFall = position.xy;
  vAge = spot.w;
  gl_Position = projectionMatrix * viewMatrix * vec4( spot.xyz + vec3( position.x, 0.0, position.y ) * splashSize, 1.0 );
}
`
const SPLASH_FRAGMENT = /* glsl */ `
uniform vec3 fallLight;
uniform float fallOpacity;
uniform float splashRing;
varying vec2 vFall;
varying float vAge;
void main() {
  float width = splashRing * vAge;
  float ring = width > 0.0 ? 1.0 - smoothstep( 0.0, width, abs( length( vFall ) - vAge ) ) : 0.0;
  gl_FragColor = vec4( fallLight, fallOpacity * ( 1.0 - vAge ) * ring );
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
  fall?: { rain: Fall; snow: Fall; dust: Fall; splashes: Fall; key: string }
  shadowKey: string
  colour: THREE.Color
  tint: THREE.Color
  light: Light
}
// The sky's light as `light()` hands it out, changed in place every frame.
export type Light = { sun: THREE.Vector3; sunColor: THREE.Color; zenith: THREE.Color; horizon: THREE.Color; fog: THREE.FogExp2; key: THREE.Vector3; keyColor: THREE.Color; sky: THREE.Color; ground: THREE.Color }

export function skydome3d() {
  let b: Built | undefined
  let probe: ReturnType<typeof read> | undefined
  let shown = false

  // Everything the sky puts on render3d's scene, and its splice, once.
  function build(plugins: Plugins, row: Row) {
    const three = plugins.render3d.THREE as Three
    const scene = plugins.render3d.scene as THREE.Scene
    const v3 = () => ({ value: new three.Vector3() })
    const c = () => ({ value: new three.Color() })
    const n = () => ({ value: 0 })
    const u: Uniforms = {
      skySun: v3(), skyCover: n(), skyBase: n(), skyDrift: { value: new three.Vector2() }, skyScale: n(), skySharp: n(), skyWarp: n(), skyShadow: n(),
      skyWet: n(), skyPack: n(), skySnowScale: n(),
      skyZenith: c(), skyHorizon: c(), skySunColour: c(), skyMoonColour: c(), skyKey: v3(), skyKeyColour: c(), skyLight: c(), skyMoon: v3(),
      skyNight: n(), skySunset: n(), skySunPower: n(), skyFlash: n(), skyRays: n(), skyStars: n(), skyClock: n(), skyPhase: n(), skyCirrus: n(), skyDense: n(),
      skyLat: { value: new three.Vector2() }, skyTurn: { value: new three.Vector2() },
      skyCloudLit: n(), skyCloudShade: n(), skyLining: n(), skyCirrusAlpha: n(), skyStarSize: n(), skyTwinkle: n(), skyTwinkles: n(), skyTwinkleSpread: n(),
      skySunShrink: { value: new three.Vector2() }, skySunEdge: n(), skyMoonEdge: n(), skyMoonSize: n(),
    }
    const surface = ['skySun', 'skyCover', 'skyBase', 'skyDrift', 'skyScale', 'skySharp', 'skyWarp', 'skyShadow', 'skyWet', 'skyPack', 'skySnowScale']
    plugins.render3d.splice('skydome3d', { uniforms: Object.fromEntries(surface.map(k => [k, u[k]])), fragment: { common: CLOUD, ...SURFACE } })

    const material = new three.ShaderMaterial({ uniforms: u, vertexShader: DOME_VERTEX, fragmentShader: DOME_FRAGMENT, side: three.BackSide, depthWrite: false })
    const dome = new three.Mesh(new three.SphereGeometry(row.look.radius, 48, 24), material)
    dome.renderOrder = -1000
    scene.add(dome)
    const envScene = new three.Scene()
    const envMesh = new three.Mesh(dome.geometry, material)
    envScene.add(envMesh)

    const key = new three.DirectionalLight()
    key.castShadow = true
    scene.add(key, key.target)
    const hemi = new three.HemisphereLight()
    scene.add(hemi)
    const fog = new three.FogExp2(0xffffff, 0)
    scene.fog = fog
    b = {
      three, scene, u, dome, env: { scene: envScene, mesh: envMesh }, key, hemi, fog, shadowKey: '', colour: new three.Color(), tint: new three.Color(),
      light: { sun: new three.Vector3(), sunColor: new three.Color(), zenith: new three.Color(), horizon: new three.Color(), fog, key: new three.Vector3(), keyColor: new three.Color(), sky: new three.Color(), ground: new three.Color() },
    }
  }

  // The rain, snow, dust and splashes, made again when the precip numbers change.
  function falling(p: Precip) {
    const key = JSON.stringify(p)
    if (b!.fall?.key === key) return b!.fall
    dropFall()
    const three = b!.three
    const quad = new three.PlaneGeometry(2, 2)
    const make = (defines: Record<string, string>, most: number, splash = false): Fall => {
      const g = new three.InstancedBufferGeometry()
      g.index = quad.index
      g.setAttribute('position', quad.getAttribute('position'))
      if (splash) g.setAttribute('spot', new three.InstancedBufferAttribute(new Float32Array(most * 4), 4).setUsage(three.DynamicDrawUsage))
      g.instanceCount = 0
      const uniforms: Uniforms = splash
        ? { fallLight: { value: new three.Color() }, fallOpacity: { value: 0 }, splashRing: { value: 0 }, splashSize: { value: 0 } }
        : {
          fallTime: { value: 0 }, fallPeriod: { value: 1 }, fallDrop: { value: 0 }, fallSpeed: { value: 0 }, fallRange: { value: 0 }, fallEdge: { value: 0 }, fallNear: { value: 0 },
          fallCarry: { value: new three.Vector2() }, fallWind: { value: new three.Vector2() }, fallQuad: { value: new three.Vector2() },
          fallSway: { value: new three.Vector3() }, fallLight: { value: new three.Color() }, fallOpacity: { value: 0 },
        }
      const m = new three.ShaderMaterial({
        uniforms, defines, vertexShader: splash ? SPLASH_VERTEX : FALL_VERTEX, fragmentShader: splash ? SPLASH_FRAGMENT : FALL_FRAGMENT,
        transparent: true, depthWrite: false, side: three.DoubleSide,
      })
      const mesh = new three.Mesh(g, m)
      mesh.frustumCulled = false
      mesh.visible = false
      b!.scene.add(mesh)
      return mesh
    }
    b!.fall = { rain: make({ STREAK: '' }, p.rain), snow: make({ SWAY: '' }, p.snow), dust: make({ SWAY: '' }, p.dust), splashes: make({}, p.splashes, true), key }
    quad.dispose()
    return b!.fall
  }

  function dropFall() {
    if (!b?.fall) return
    for (const m of [b.fall.rain, b.fall.snow, b.fall.dust, b.fall.splashes]) {
      b.scene.remove(m)
      m.geometry.dispose()
      m.material.dispose()
    }
    b.fall = undefined
  }

  // The frame's sky from the row and `world.skydome3d` as they stand, the camera where it stands, and render3d's renderer.
  function read(plugins: Plugins, row: Row, camera: THREE.PerspectiveCamera, shares: Record<string, number>) {
    const { three, u, key, hemi, fog, colour, light } = b!
    const look = row.look, mix = row.mix
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
    const lift = row.flash > 0 ? look.flash : 0
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

    const rays = (flash: number) => look.godrays * (steady + flash) * (1 - 0.6 * night)
    const set = (name: string, value: number) => { u[name].value = value }
    ;(u.skySun.value as THREE.Vector3).fromArray(s)
    ;(u.skyMoon.value as THREE.Vector3).fromArray(m)
    ;(u.skyKey.value as THREE.Vector3).fromArray(toward)
    ;(u.skyZenith.value as THREE.Color).copy(zenith)
    ;(u.skyHorizon.value as THREE.Color).copy(horizon)
    ;(u.skyKeyColour.value as THREE.Color).copy(key.color)
    const lightAt = (flash: number) => (u.skyLight.value as THREE.Color).copy(key.color).multiplyScalar(steady + flash)
    lightAt(lift)
    ;(u.skyDrift.value as THREE.Vector2).fromArray(row.drift)
    const lat = row.lat * (Math.PI / 180), H = (row.t / row.day - 0.5) * 2 * Math.PI
    ;(u.skyLat.value as THREE.Vector2).set(Math.sin(lat), Math.cos(lat))
    ;(u.skyTurn.value as THREE.Vector2).set(Math.cos(H), Math.sin(H))
    ;(u.skySunShrink.value as THREE.Vector2).fromArray(look.sunShrink)
    set('skyCover', mix.cloud); set('skyBase', mix.base); set('skyCirrus', mix.cirrus); set('skyDense', mix.dense)
    set('skyScale', look.cloudScale); set('skySharp', look.cloudSharp); set('skyWarp', look.cloudDrift); set('skyShadow', look.cloudShadow)
    set('skyWet', row.wet); set('skyPack', row.pack); set('skySnowScale', look.snowScale)
    set('skyNight', night); set('skySunset', sunset); set('skySunPower', 0.5 + look.sunIntensity * day); set('skyFlash', lift); set('skyRays', rays(lift))
    set('skyStars', look.stars * night); set('skyClock', row.t / row.day); set('skyPhase', row.phase)
    set('skyCloudLit', look.cloudLit); set('skyCloudShade', look.cloudShade); set('skyLining', look.lining); set('skyCirrusAlpha', look.cirrusAlpha)
    set('skyStarSize', look.starSize); set('skyTwinkle', look.twinkle); set('skyTwinkles', look.twinkles); set('skyTwinkleSpread', look.twinkleSpread)
    set('skySunEdge', look.sunEdge); set('skyMoonEdge', look.moonEdge); set('skyMoonSize', look.moonSize)

    if (b!.dome.geometry.parameters.radius !== look.radius) {
      b!.dome.geometry.dispose()
      b!.dome.geometry = new three.SphereGeometry(look.radius, 48, 24)
      b!.env.mesh.geometry = b!.dome.geometry
    }
    b!.dome.position.copy(camera.position)
    b!.env.mesh.scale.setScalar(1 / look.radius)

    // The falling things' light: the hemisphere's sky and keyShare of the key.
    const fallLight = colour.copy(horizon).multiplyScalar(hemi.intensity).add(b!.tint.copy(key.color).multiplyScalar(key.intensity * row.precip.keyShare))
    fall(plugins, row, camera, fallLight)

    light.sun.fromArray(s)
    light.sunColor.copy(sunColour).multiplyScalar(body === 'sun' ? steady : 0)
    light.key.fromArray(toward)
    light.keyColor.copy(key.color).multiplyScalar(key.intensity)
    light.sky.copy(hemi.color).multiplyScalar(hemi.intensity)
    light.ground.copy(hemi.groundColor).multiplyScalar(hemi.intensity)

    environment(renderer, row, shares, camera, () => { set('skyFlash', 0); set('skyRays', rays(0)); lightAt(0) }, () => { set('skyFlash', lift); set('skyRays', rays(lift)); lightAt(lift) })

    return {
      el, day, night, sunset, dark, moonEl, sunKey, moonKey, body, exposure,
      zenith, horizon, sunColour, dome: b!.dome, key, hemi, fog, uniforms: u,
      fall: { rain: b!.fall!.rain, snow: b!.fall!.snow, dust: b!.fall!.dust, splashes: b!.fall!.splashes },
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

  function fall(plugins: Plugins, row: Row, camera: THREE.PerspectiveCamera, lightColour: THREE.Color) {
    const p = row.precip, mix = row.mix
    const f = falling(p)
    const time = plugins.wire.n * plugins.wire.scene.prefabs.engine.dt
    const box = 2 * p.range
    const wrap = (x: number) => ((x % box) + box) % box
    const [wx, wz] = windOf(row)
    const each: [Fall, number, number, number, number, number, Sway | undefined, string | undefined][] = [
      [f.rain, p.rain * mix.rain, p.rainFall, p.rainWidth, p.rainLen, p.rainOpacity, undefined, undefined],
      [f.snow, p.snow * mix.snow, p.snowFall, p.snowSize, p.snowSize, p.snowOpacity, p.snowSway, undefined],
      [f.dust, p.dust * mix.dust, p.dustFall, p.dustSize, p.dustSize, p.dustOpacity, p.dustSway, p.dustColour],
    ]
    for (const [mesh, count, speed, width, length, opacity, sway, tint] of each) {
      const u = mesh.material.uniforms
      mesh.geometry.instanceCount = Math.round(count)
      mesh.visible = mesh.geometry.instanceCount > 0
      u.fallTime.value = ((time % p.swayPeriod) + p.swayPeriod) % p.swayPeriod
      u.fallPeriod.value = p.swayPeriod
      u.fallDrop.value = wrap(time * speed)
      u.fallSpeed.value = speed
      u.fallRange.value = p.range
      u.fallEdge.value = p.edge
      u.fallNear.value = p.near
      ;(u.fallCarry.value as THREE.Vector2).set(wrap(row.drift[0]), wrap(row.drift[1]))
      ;(u.fallWind.value as THREE.Vector2).set(wx, wz)
      ;(u.fallQuad.value as THREE.Vector2).set(width, length)
      if (sway) (u.fallSway.value as THREE.Vector3).fromArray(sway)
      ;(u.fallLight.value as THREE.Color).copy(lightColour)
      if (tint) (u.fallLight.value as THREE.Color).multiply(b!.tint.set(tint))
      u.fallOpacity.value = opacity
    }

    // Splashes: each lives splashLife, at a place hashed from its number and its life, in the box.
    const s = f.splashes, su = s.material.uniforms
    const ground = mod<Land>(plugins.wire.scene.world!, 'skydome3d', 'land')?.(plugins)
    const count = ground ? Math.round(p.splashes * mix.rain) : 0
    s.geometry.instanceCount = count
    s.visible = count > 0
    su.splashSize.value = p.splashSize
    su.splashRing.value = p.splashRing
    su.fallOpacity.value = p.splashOpacity
    ;(su.fallLight.value as THREE.Color).copy(lightColour)
    if (!ground) return
    const spot = s.geometry.getAttribute('spot') as THREE.InstancedBufferAttribute
    const at = spot.array as Float32Array, eye = camera.position
    for (let i = 0; i < count; i++) {
      const life = time / p.splashLife + hash01(i, 20)
      const cycle = Math.floor(life)
      const k = mixBits((i + mixBits(cycle >>> 0)) >>> 0)
      const x = eye.x + wrap(hash01(k, 21) * box - eye.x + p.range) - p.range
      const z = eye.z + wrap(hash01(k, 22) * box - eye.z + p.range) - p.range
      at[i * 4] = x
      at[i * 4 + 1] = ground.height(x, z) + p.lift
      at[i * 4 + 2] = z
      at[i * 4 + 3] = life - cycle
    }
    spot.needsUpdate = true
  }

  // The scene's environment, made again only when stale, drawn with the flash taken out.
  function environment(renderer: THREE.WebGLRenderer | undefined, row: Row, shares: Record<string, number>, camera: THREE.PerspectiveCamera, calm: () => void, back: () => void) {
    const { three, scene, env } = b!
    if (!renderer) return
    const now = lit(row, shares)
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
      let shares: Record<string, number> = {}
      if (Object.keys(sky.biomes ?? {}).length) {
        const land = mod<Land>(plugins.wire.scene.world!, 'skydome3d', 'land')
        if (!land) throw new Error('skydome3d has biomes and the scene names no world.skydome3d.mods.land')
        shares = land(plugins)?.mix(camera.position.x, camera.position.z) ?? {}
      }
      probe = read(plugins, { ...sky, mix: here(sky.mix, sky.biomes, shares) }, camera, shares)
      shown = true
    },
    light: () => (shown ? b!.light : undefined),
    sky: () => (shown ? probe : undefined),
    close() {
      if (!b) return
      const { scene, dome, key, hemi, fog, env } = b
      dropFall()
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
