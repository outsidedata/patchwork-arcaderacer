// clouds3d, the clouds: the deck, the cirrus and the god rays drawn into skydome3d's dome, and the
// deck's shadow on every dressed surface. It has no row and no server half: the clouds are the
// weather's, carried by its drift, so every seat sees the same.
//
// It is built on skydome3d, whose dome it draws into (`dome`) and whose `NOISE` and `light()` it
// reads, so a scene lists it after skydome3d, which it checks on its first frame, and before
// `render3d`, which draws in its own `afterTick`.
//
// The weather it draws comes through a mod, `world.clouds3d.mods: { weather: '<a>' }` (weather3d's,
// `weather3d.clouds3d.ts`): `weather(plugins)` is `{ mix, drift }`, the Weather standing under the
// camera and the wind's integral [x, z] in metres, or undefined before there is one, when no cloud is
// drawn. With none named, no cloud is drawn either.
//
// The keys of `world.clouds3d`:
//   look     cloudScale  noise cycles a metre of the cloud function; cloudSharp its edge;
//                        cloudDrift the fraction of the drift its warp moves by, so a cloud changes
//                        shape as it travels; cloudShadow how much the deck takes from direct light
//            cloudLit cloudShade lining  the deck's colour, below; cirrusAlpha the cirrus's
//            godrays  the god rays' strength
//   off      the parts not drawn, read once when the clouds are built, for measuring what each costs:
//              cirrus deck godrays  each compiled out of the dome's shader
//              cloudShadow  compiled out of the cloud shadow on every dressed material
//            A part it does not know throws.
//   mods     { weather }, above.
//
// One cloud function drives the dome and the cloud shadow: skydome3d's `skyCloudAt`. Clouds read it
// at (p.xz − drift)·cloudScale, its warp at (p.xz − drift·cloudDrift)·cloudScale.
//
// In the dome, along each direction D from the camera, after the sun and before the flash:
//   cirrus        at 2.6·base, the cloud function elsewhere in the noise at a sharpness of 1, of
//                 horizon + key·cloudLit, at cirrusAlpha.
//   the deck      at `base`, with parallax from the camera, fading out from 2.5 to 13 km along the
//                 ray: horizon·mix(1, cloudShade, depth) + key·(cloudLit·(1 − depth) + lining·l),
//                 depth = 1 − exp(−thickness·dense) and l = coverage·(1 − thickness)·(1 − the
//                 coverage 400 m toward the key light), `key` the key light's colour times its
//                 intensity (the sky's `skyLight`). It hides whatever is behind it, the sun's disc,
//                 glow and halo too.
//   god rays      6 steps from D toward the key light, each open where the deck is not, times
//                 pow(D·key, 7), godrays·the key light·(1 − 0.6·night), and the deck's cover.
// The deck and the cirrus are drawn only from below them.
//
// The cloud shadow, registered with render3d's `splice` under `clouds3d`, so it reaches every dressed
// standard and physical material, after `lights_fragment_end`: it multiplies directDiffuse and
// directSpecular, every direct light: traced up the sun ray to the deck, capped at 6·base,
// 1 − cloudShadow·coverage·smoothstep(0.05, 0.22, sun.y). A point at or above the deck's base, a peak
// over the clouds, takes none.
//
// `clouds()` is a probe for tests: the dome splice's and the cloud shadow's uniforms, undefined until
// the clouds have drawn their first frame.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Light } from '#plugins/skydome3d/skydome3d.plugin.ts'
import type { Weather } from '#plugins/weather3d/weather3d.sim.ts'

export type Look = {
  cloudScale: number; cloudSharp: number; cloudDrift: number; cloudShadow: number; godrays: number
  cloudLit: number; cloudShade: number; lining: number; cirrusAlpha: number
}
// The parts `world.clouds3d.off` can take out, each compiled out of its shader as `SKY_NO_<PART>`.
export const PARTS = ['cirrus', 'deck', 'godrays', 'cloudShadow'] as const
export type Part = (typeof PARTS)[number]
const defineOf = (part: Part) => `SKY_NO_${part.toUpperCase()}`
type Table = { look: Look; off?: Part[] }
// What the `weather` mod hands back: the weather standing under the camera, and the drift.
type Clouded = { mix: Weather; drift: [number, number] }
type WeatherMod = (plugins: Plugins) => Clouded | undefined
type Uniforms = Record<string, THREE.IUniform>

// The cloud uniforms and the cloud function, as the dome and every dressed program declare them.
const CLOUD = /* glsl */ `
uniform float skyCover;
uniform float skyBase;
uniform vec2 skyDrift;
uniform float skyScale;
uniform float skySharp;
uniform float skyWarp;
// The clouds over ground point p, carried by the drift.
vec2 skyCloud( vec2 p, float cover, float sharp, uint salt ) {
  return skyCloudAt( ( p - skyDrift ) * skyScale, ( p - skyDrift * skyWarp ) * skyScale, cover, sharp, salt );
}
`
const DOME_COMMON = /* glsl */ `
${CLOUD}
uniform float skyCirrus;
uniform float skyDense;
uniform float skyCloudLit;
uniform float skyCloudShade;
uniform float skyLining;
uniform float skyCirrusAlpha;
uniform float skyGodrays;
// How much of the sky the deck hides along d from the eye.
float skyDeck( vec3 d, vec3 eye ) {
  if ( d.y <= 0.0 || eye.y >= skyBase ) return 0.0;
  float t = ( skyBase - eye.y ) / d.y;
  return skyCloud( eye.xz + d.xz * t, skyCover, skySharp, 0u ).x * ( 1.0 - smoothstep( 2500.0, 13000.0, t ) );
}
`
const DOME_MAIN = /* glsl */ `
  if ( D.y > 0.0 ) {
    #ifndef SKY_NO_CIRRUS
    float high = 2.6 * skyBase;
    if ( eye.y < high ) {
      float t = ( high - eye.y ) / D.y;
      float c = skyCloud( eye.xz + D.xz * t, skyCirrus, 1.0, 3u ).x * ( 1.0 - smoothstep( 2500.0, 13000.0, t ) );
      sky = mix( sky, skyHorizon + skyLight * skyCloudLit, c * skyCirrusAlpha );
    }
    #endif
    #ifndef SKY_NO_DECK
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
    #endif
    #ifndef SKY_NO_GODRAYS
    float kd = dot( D, skyKey );
    if ( kd > 0.0 && skyGodrays > 0.0 && skyCover > 0.0 ) {
      float open = 0.0;
      for ( int i = 0; i < 6; i++ ) open += 1.0 - skyDeck( normalize( mix( D, skyKey, float( i ) / 6.0 ) ), eye );
      sky += skyLight * skyGodrays * ( 1.0 - 0.6 * skyNight ) * skyCover * pow( kd, 7.0 ) * open / 6.0;
    }
    #endif
  }
`
const SHADOW_COMMON = /* glsl */ `
uniform vec3 skySun;
uniform float skyShadow;
${CLOUD}
float skyCloudShadow( vec3 p ) {
  if ( p.y >= skyBase || skySun.y <= 0.0 ) return 1.0;
  float t = min( ( skyBase - p.y ) / skySun.y, 6.0 * skyBase );
  return 1.0 - skyShadow * skyCloud( p.xz + skySun.xz * t, skyCover, skySharp, 0u ).x * smoothstep( 0.05, 0.22, skySun.y );
}
`
const SHADOW = /* glsl */ `{
  #ifndef SKY_NO_CLOUDSHADOW
    float skyShade = skyCloudShadow( vDressWorld );
    reflectedLight.directDiffuse *= skyShade;
    reflectedLight.directSpecular *= skyShade;
  #endif
}`

export function clouds3d() {
  let u: { dome: Uniforms; shadow: Uniforms } | undefined
  let shown = false

  // The dome splice and the cloud shadow's splice, once, after the sky has drawn so its splice, which
  // the shadow reads, is registered before this one.
  function build(plugins: Plugins, table: Table) {
    const three = plugins.render3d.THREE as typeof import('three')
    for (const part of table.off ?? []) if (!PARTS.includes(part)) throw new Error(`clouds3d has no part ${part} to take off; its parts are ${PARTS.join(', ')}`)
    const defines = (table.off ?? []).map(part => `#define ${defineOf(part)}\n`).join('')
    const n = () => ({ value: 0 })
    const shared: Uniforms = { skyCover: n(), skyBase: n(), skyDrift: { value: new three.Vector2() }, skyScale: n(), skySharp: n(), skyWarp: n() }
    const dome: Uniforms = { ...shared, skyCirrus: n(), skyDense: n(), skyCloudLit: n(), skyCloudShade: n(), skyLining: n(), skyCirrusAlpha: n(), skyGodrays: n() }
    const shadow: Uniforms = { ...shared, skySun: { value: new three.Vector3() }, skyShadow: n() }
    plugins.skydome3d.dome('clouds3d', { uniforms: dome, common: defines + DOME_COMMON, main: DOME_MAIN })
    plugins.render3d.splice('clouds3d', { uniforms: shadow, fragment: { common: defines + SHADOW_COMMON, lights_fragment_end: SHADOW } })
    u = { dome, shadow }
  }

  return {
    afterTick(plugins: Plugins) {
      const scene = plugins.wire.scene
      const order = scene.plugins ?? []
      if (order.indexOf('clouds3d') < order.indexOf('skydome3d')) throw new Error('clouds3d is listed before skydome3d, whose dome it draws into')
      const table = scene.world!.clouds3d as Table
      const weather = mod<WeatherMod>(scene.world!, 'clouds3d', 'weather')
      const light = plugins.skydome3d.light() as Light | undefined
      if (!light) return
      if (!u) build(plugins, table)
      const now = weather?.(plugins)
      const look = table.look
      const set = (name: string, value: number) => { u!.dome[name].value = value }
      set('skyCover', now?.mix.cloud ?? 0); set('skyBase', now?.mix.base ?? 0); set('skyCirrus', now?.mix.cirrus ?? 0); set('skyDense', now?.mix.dense ?? 0)
      set('skyScale', look.cloudScale); set('skySharp', look.cloudSharp); set('skyWarp', look.cloudDrift)
      set('skyCloudLit', look.cloudLit); set('skyCloudShade', look.cloudShade); set('skyLining', look.lining); set('skyCirrusAlpha', look.cirrusAlpha)
      set('skyGodrays', look.godrays)
      ;(u!.dome.skyDrift.value as THREE.Vector2).fromArray(now?.drift ?? [0, 0])
      ;(u!.shadow.skySun.value as THREE.Vector3).copy(light.sun)
      u!.shadow.skyShadow.value = look.cloudShadow
      shown = true
    },
    clouds: () => (shown ? u : undefined),
  }
}
