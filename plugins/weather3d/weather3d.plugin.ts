// The browser half of weather3d, the weather: the rain, snow, dust and splashes, the wet and the snow
// on every dressed surface, and the lightning's lift. It draws the weather3d row and the scene's
// `world.weather3d` as they stand, and nothing interpolates: the falling things come from the row's
// `drift` and the packet's step count.
//
// It stands under skydome3d, which it is built on: it lights the falling things with the sky's
// `light()` and its snow reads the sky's `NOISE`. So a scene lists it after skydome3d, which it checks
// on its first frame, and before `render3d`, which draws in its own `afterTick`. It registers its
// splice with render3d in its first `tick` with a row, after skydome3d's, before any `afterTick`
// dresses a material.
//
// The browser half's keys of `world.weather3d`, beside the server half's (`weather3d.sim.ts`):
//   look     snowScale  the cycles a metre the snow's drift field is read at; snowSharp its edge
//            flash      how far a lightning flash lifts the dome's colour and the key light
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
//   off      the parts not drawn, read once when the weather is built, for measuring what each costs:
//              wet snowCover  each compiled out of the weather surface on every dressed material
//              rain snowfall dust splashes  none of that kind drawn
//            A part it does not know throws.
//
// The splashes stand on the land a mod hands it, `world.weather3d.mods: { land: '<a>' }` (terrain3d's,
// `terrain3d.weather3d.ts`): `land(plugins)` is an object whose `height(x, z)` is the ground there and
// `mix(x, z)` each biome's share, or undefined until it has one. With no mod named, or no land yet, no
// splash is drawn. With `world.weather3d.biomes` (`weather3d.sim.ts`) the weather it hands out is the
// one standing under the camera, `here` over the land's `mix` at the camera's x and z; with no land
// yet, the scene's; with biomes and no land mod named, it throws.
//
// `weather()` is the weather the sky, the clouds and whatever else draws in it stand in this frame:
// `{ mix, lift, to, from, blend, shares, drift }`, the Weather standing under the camera, the flash's
// lift (`look.flash` while the row's `flash` is above 0, else 0), the row's `to`, `from`, `blend` and
// `drift`, and each biome's share under the camera; undefined with no weather3d row or no camera.
//
// The weather surface, registered with render3d's `splice` under `weather3d`, so it reaches every
// dressed standard and physical material (a dressed Lambert or Phong material takes all of it but the
// roughness, which it has none of):
//   after normal_fragment_maps  wet darkens the albedo by 0.55·wet and takes its roughness toward
//                               0.09; snow, over up faces smoothstep(0.20, 0.72, n.y) times the
//                               snow's drift field, `skyCloudAt` at the world xz·snowScale with
//                               cover `pack` and snowSharp, tints toward (0.90, 0.93, 0.99), takes the
//                               roughness toward 0.72 and bends the normal up by 0.6.
//
// The falling things are instanced quads, every one drawn from both sides, wrapped on the GPU into
// the box around the camera: each drop's place is hashed from its number, carried by `drift` (the
// wind's integral, gusts and all) and fallen at its speed for the packet's step count times the
// engine's `dt`, so two clients draw the same drops; the drift and the fall are wrapped into the box
// and the sway's clock by swayPeriod here, in doubles, before they reach a float uniform, so a long
// game loses no precision. Rain streaks lie along the wind as it blows now against their fall, the
// wind on the sky's clock through the `sky` mod (`weather3d.sim.ts`). They are lit by the sky's
// hemisphere light plus keyShare of its key. Splashes are rings that grow and fade over splashLife,
// each at a place hashed from its number and its life in the same box, standing `lift` over the
// land's `height`.
//
// `fall()` is a probe for tests: the rain, snow, dust and splashes meshes, undefined until the
// weather has drawn its first frame. `close` takes them off the scene and disposes them.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { HASH, type Light, type Standing } from '#plugins/skydome3d/skydome3d.plugin.ts'
import { here, skyOf, wind as windOf, type Table, type Weathered } from './weather3d.sim.ts'

type Sway = [number, number, number]
export type Look = { snowScale: number; snowSharp: number; flash: number }
export type Precip = {
  rain: number; snow: number; dust: number; splashes: number; range: number; edge: number; near: number
  rainFall: number; rainLen: number; rainWidth: number; rainOpacity: number
  snowFall: number; snowSize: number; snowOpacity: number; snowSway: Sway
  dustFall: number; dustSize: number; dustOpacity: number; dustColour: string; dustSway: Sway; swayPeriod: number
  splashSize: number; splashLife: number; splashOpacity: number; splashRing: number; lift: number; keyShare: number
}
// The parts `world.weather3d.off` can take out, each compiled out of the weather surface as
// `SKY_NO_<PART>` or never drawn.
export const PARTS = ['wet', 'snowCover', 'rain', 'snowfall', 'dust', 'splashes'] as const
export type Part = (typeof PARTS)[number]
const defineOf = (part: Part) => `SKY_NO_${part.toUpperCase()}`
// The row with `world.weather3d` beside it, which the frame is drawn from.
type Row = Weathered & Table & { look: Look; precip: Precip; off?: Part[] }
// What the `land` mod hands back: the ground's height and each biome's share, or undefined until there is one.
type Land = (plugins: Plugins) => { height(x: number, z: number): number; mix(x: number, z: number): Record<string, number> } | undefined
// The weather `weather()` hands out.
export type Now = Standing & { drift: [number, number] }
const rowOf = (plugins: Plugins, data: Record<string, any>): Row => ({ ...data, ...plugins.wire.scene.world!.weather3d })
type Three = typeof import('three')
type Uniforms = Record<string, THREE.IUniform>
type Fall = THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>

// One integer hash for the drops' and splashes' seeds, the same in JS and in GLSL.
const mixBits = (x: number) => {
  x = (x ^ (x >>> 16)) >>> 0
  x = Math.imul(x, 0x7feb352d) >>> 0
  x = (x ^ (x >>> 15)) >>> 0
  x = Math.imul(x, 0x846ca68b) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}
const hash01 = (a: number, salt: number) => mixBits((a + mixBits(salt)) >>> 0) / 4294967296

const SURFACE = {
  common: /* glsl */ `
uniform float skyWet;
uniform float skyPack;
uniform float skySnowScale;
uniform float skySnowSharp;
`,
  normal_fragment_maps: /* glsl */ `{
  #ifndef SKY_NO_WET
    diffuseColor.rgb *= 1.0 - 0.55 * skyWet;
    #ifdef STANDARD
      roughnessFactor = mix( roughnessFactor, 0.09, skyWet );
    #endif
  #endif
  #ifndef SKY_NO_SNOWCOVER
    vec3 skyUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float skyFacing = inverseTransformDirection( normal, viewMatrix ).y;
    vec2 skyAt = vDressWorld.xz * skySnowScale;
    float skySnow = smoothstep( 0.20, 0.72, skyFacing ) * skyCloudAt( skyAt, skyAt, skyPack, skySnowSharp, 6u ).x;
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.90, 0.93, 0.99 ), skySnow );
    #ifdef STANDARD
      roughnessFactor = mix( roughnessFactor, 0.72, skySnow );
    #endif
    normal = normalize( mix( normal, skyUp, 0.6 * skySnow ) );
  #endif
}`,
}

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
  fall?: { rain: Fall; snow: Fall; dust: Fall; splashes: Fall; key: string }
  off: Set<Part>
  colour: THREE.Color
  tint: THREE.Color
}

export function weather3d() {
  let b: Built | undefined
  let shown = false

  // The weather surface's splice, once.
  function build(plugins: Plugins, row: Row) {
    const three = plugins.render3d.THREE as Three
    const scene = plugins.render3d.scene as THREE.Scene
    const u: Uniforms = { skyWet: { value: 0 }, skyPack: { value: 0 }, skySnowScale: { value: 0 }, skySnowSharp: { value: 0 } }
    for (const part of row.off ?? []) if (!PARTS.includes(part)) throw new Error(`weather3d has no part ${part} to take off; its parts are ${PARTS.join(', ')}`)
    const off = new Set(row.off ?? [])
    const common = [...off].map(part => `#define ${defineOf(part)}\n`).join('') + SURFACE.common
    plugins.render3d.splice('weather3d', { uniforms: u, fragment: { common, normal_fragment_maps: SURFACE.normal_fragment_maps } })
    b = { three, scene, u, off, colour: new three.Color(), tint: new three.Color() }
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

  // A `w` over the rows the page draws, for the server half's `sky` mod.
  const reading = (plugins: Plugins) => ({
    world: plugins.wire.scene.world!,
    find(kind: string) {
      const r = plugins.wire.rows.find(r => r.kind === kind)
      if (!r) throw new Error(`no ${kind} matches`)
      return r
    },
  }) as Parameters<typeof skyOf>[0]

  // The weather standing under the camera, and each biome's share there.
  function standing(plugins: Plugins): Now | undefined {
    const row = plugins.wire.rows.find(r => r.kind === 'weather3d')
    const camera = plugins.render3d.camera as THREE.PerspectiveCamera | undefined
    if (!row || !camera) return undefined
    const w = rowOf(plugins, row.data)
    let shares: Record<string, number> = {}
    if (Object.keys(w.biomes ?? {}).length) {
      const land = mod<Land>(plugins.wire.scene.world!, 'weather3d', 'land')
      if (!land) throw new Error('weather3d has biomes and the scene names no world.weather3d.mods.land')
      shares = land(plugins)?.mix(camera.position.x, camera.position.z) ?? {}
    }
    return { mix: here(w.mix, w.biomes, shares), lift: w.flash > 0 ? w.look.flash : 0, to: w.to, from: w.from, blend: w.blend, shares, drift: w.drift }
  }

  function fall(plugins: Plugins, row: Row, camera: THREE.PerspectiveCamera, light: Light) {
    const p = row.precip, mix = row.mix
    const f = falling(p)
    const lightColour = b!.colour.copy(light.sky).add(b!.tint.copy(light.keyColor).multiplyScalar(p.keyShare))
    const time = plugins.wire.n * plugins.wire.scene.prefabs.engine.dt
    const box = 2 * p.range
    const wrap = (x: number) => ((x % box) + box) % box
    const clock = skyOf(reading(plugins))
    const [wx, wz] = windOf({ ...row, t: clock.t, day: clock.day })
    const on = (part: Part) => (b!.off.has(part) ? 0 : 1)
    const each: [Fall, number, number, number, number, number, Sway | undefined, string | undefined][] = [
      [f.rain, p.rain * mix.rain * on('rain'), p.rainFall, p.rainWidth, p.rainLen, p.rainOpacity, undefined, undefined],
      [f.snow, p.snow * mix.snow * on('snowfall'), p.snowFall, p.snowSize, p.snowSize, p.snowOpacity, p.snowSway, undefined],
      [f.dust, p.dust * mix.dust * on('dust'), p.dustFall, p.dustSize, p.dustSize, p.dustOpacity, p.dustSway, p.dustColour],
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
    const ground = mod<Land>(plugins.wire.scene.world!, 'weather3d', 'land')?.(plugins)
    const count = ground ? Math.round(p.splashes * mix.rain * on('splashes')) : 0
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

  return {
    tick(plugins: Plugins) {
      if (b) return
      // After the sky has drawn, so its splice, which the snow reads, is registered before this one.
      const row = plugins.wire.rows.find(r => r.kind === 'weather3d')
      if (row && plugins.skydome3d.light()) build(plugins, rowOf(plugins, row.data))
    },
    afterTick(plugins: Plugins) {
      const order = plugins.wire.scene.plugins ?? []
      if (order.indexOf('weather3d') < order.indexOf('skydome3d')) throw new Error('weather3d is listed before skydome3d, whose light it draws in')
      ahead(plugins.wire.scene, 'weather3d', 'land')
      const row = plugins.wire.rows.find(r => r.kind === 'weather3d')
      if (!row) return
      const w = rowOf(plugins, row.data)
      if (!b) build(plugins, w)
      const camera = plugins.render3d.camera as THREE.PerspectiveCamera | undefined
      const light = plugins.skydome3d.light() as Light | undefined
      if (!camera || !light) return
      const now = standing(plugins)!
      b!.u.skyWet.value = w.wet
      b!.u.skyPack.value = w.pack
      b!.u.skySnowScale.value = w.look.snowScale
      b!.u.skySnowSharp.value = w.look.snowSharp
      fall(plugins, { ...w, mix: now.mix }, camera, light)
      shown = true
    },
    weather: (plugins: Plugins) => standing(plugins),
    fall: () => (shown ? { rain: b!.fall!.rain, snow: b!.fall!.snow, dust: b!.fall!.dust, splashes: b!.fall!.splashes } : undefined),
    close() {
      if (!b) return
      dropFall()
      b = undefined
      shown = false
    },
  }
}
