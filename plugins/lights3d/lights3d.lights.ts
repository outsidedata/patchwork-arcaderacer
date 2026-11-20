// lights3d's lights: what every part of the plugin shares (the textures it made, the uniforms every lit shader is
// handed, what it counts, whether the probes or the shadows are being drawn), the float textures it grows, and
// each light's record in the lights texture, written each time the scene is drawn (step 3 of `lights3d.plugin.ts`).
import type * as THREE from 'three'
import type { Shadows } from './lights3d.plugin.ts'
import { ROW, TEXELS } from './lights3d.glsl.ts'
import { rectReach, type Areas } from './lights3d.areas.ts'

// A lamp: a light of the scene that shines from a point.
export type Lamp = THREE.PointLight | THREE.SpotLight
// A light lights3d lights and that may cast a shadow: a lamp, or a rectangle of the scene (`lights3d.areas.ts`).
export type Light = Lamp | THREE.RectAreaLight

export const isRect = (light: Light): light is THREE.RectAreaLight => !!(light as THREE.RectAreaLight).isRectAreaLight

// The atlases: the still one, the moving one beside it of the same tiles, its distance material and the camera each
// tile is drawn through.
export type Atlas = { target: THREE.WebGLRenderTarget; moving: THREE.WebGLRenderTarget; material: THREE.ShaderMaterial; camera: THREE.PerspectiveCamera; settings: Shadows; across: number }

// What the plugin made on its first tick.
export type Built = {
  T: typeof THREE
  scene: THREE.Scene
  before: THREE.Scene['onBeforeRender']
  after: THREE.Scene['onAfterRender']
  lights: THREE.DataTexture
  cells: THREE.DataTexture
  index: THREE.DataTexture
  tiles: THREE.DataTexture
  // the moving atlas's tiles' matrices, laid out as `tiles`
  moved: THREE.DataTexture
  // none with no `shadows`
  atlas?: Atlas
  // the atlas's stand-in, where there is none, so the sampler is always bound
  blank: THREE.DataTexture
}

// What the plugin hands out as counts (`lights3d.plugin.ts`, the end of its header).
export type Counts = {
  count: number; entries: number; cells: number; shadowed: number; tiles: number; redrawn: number; moving: number; owed: number
  captures: number; packed: number
}

// What every part shares. `capturing` is true while the probes are drawn: the scene is lit as it stands, its shadows
// read from the atlas as the last frame drew it, and no probe is captured again. `shadowing` is true while the
// shadows are drawn, so the scene's hooks, called again by that drawing, do nothing.
export type Ctx = { built: Built; uniforms: Record<string, THREE.IUniform>; me: Counts; capturing: boolean; shadowing: boolean; areas?: Areas }

export type Key = 'lights' | 'cells' | 'index' | 'tiles' | 'moved'

// A float texture `ROW` texels wide and `rows` high, read texel by texel: the lights and the tiles'
// matrices four numbers a texel, the cells' runs two, the list one.
export function texture(T: typeof THREE, key: Key, rows: number) {
  const [format, channels] = key === 'lights' || key === 'tiles' || key === 'moved' ? [T.RGBAFormat, 4] : key === 'cells' ? [T.RGFormat, 2] : [T.RedFormat, 1]
  const t = new T.DataTexture(new Float32Array(ROW * rows * channels), ROW, rows, format, T.FloatType)
  t.minFilter = t.magFilter = T.NearestFilter
  t.generateMipmaps = false
  t.needsUpdate = true
  return t
}

// A texture of `rows` rows at least, grown by doubling, the uniform pointing at it.
export function room(ctx: Ctx, key: Key, uniform: string, rows: number) {
  const b = ctx.built, t = b[key]
  if (t.image.height >= rows) return t
  let h = t.image.height
  while (h < rows) h *= 2
  const grown = texture(b.T, key, h)
  t.dispose()
  b[key] = grown
  ctx.uniforms[uniform].value = grown
  return grown
}

// How far a light reaches, Infinity for a lamp of no `distance`: a lamp's `distance`, a rectangle's the reach past
// which it gives less than the areas' `cutoff`.
export function reachOf(ctx: Ctx, light: Light) {
  if (isRect(light)) return rectReach(light, ctx.areas!)
  return light.distance > 0 ? light.distance : Infinity
}

// A light's shadow's near and far: a lamp's shadow camera's near, and its reach, or its shadow camera's far for one of
// no reach; a rectangle's the areas' `near`, and its reach.
export const nearOf = (ctx: Ctx, light: Light) => (isRect(light) ? ctx.areas!.near : light.shadow.camera.near)
export const farOf = (ctx: Ctx, light: Light) => (isRect(light) || light.distance > 0 ? reachOf(ctx, light) : light.shadow.camera.far)

// Each light's record written into the lights texture: a lamp's place in view space, reach, colour, fall off, cone
// and shadow, its first tile and how many it has (`given`, none where it has no shadow this frame), its shadow's near
// and far, and its `shadow.bias` and `shadow.normalBias` added to the scene's; a rectangle's middle, reach, light,
// picture (`first`, its first layer), half width and half height in view space and the same shadow.
export function writeLights(ctx: Ctx, camera: THREE.Camera, found: Light[], given: Map<Light, [number, number]>, first: (light: THREE.RectAreaLight) => number) {
  const b = ctx.built, T = b.T
  const n = found.length
  const lights = room(ctx, 'lights', 'uLights3dLights', TEXELS * Math.max(1, Math.ceil(n / ROW)))
  const ld = lights.image.data as Float32Array
  const view = camera.matrixWorldInverse
  const v = new T.Vector3(), aim = new T.Vector3(), to = new T.Vector3(), turn = new T.Matrix4()
  const sh = b.atlas?.settings
  for (let k = 0; k < n; k++) {
    const light = found[k]
    v.setFromMatrixPosition(light.matrixWorld).applyMatrix4(view)
    const row = Math.floor(k / ROW) * TEXELS, col = k % ROW
    const [a, c, s, q, e, h] = [0, 1, 2, 3, 4, 5].map(t => ((row + t) * ROW + col) * 4)
    if (isRect(light)) {
      // its half width and half height turned into the view, as three's own are
      turn.multiplyMatrices(view, light.matrixWorld).extractRotation(turn.clone())
      aim.set(light.width / 2, 0, 0).applyMatrix4(turn)
      to.set(0, light.height / 2, 0).applyMatrix4(turn)
      ld[a] = v.x; ld[a + 1] = v.y; ld[a + 2] = v.z; ld[a + 3] = reachOf(ctx, light)
      ld[c] = light.color.r * light.intensity; ld[c + 1] = light.color.g * light.intensity; ld[c + 2] = light.color.b * light.intensity; ld[c + 3] = first(light)
      ld[s] = aim.x; ld[s + 1] = aim.y; ld[s + 2] = aim.z; ld[s + 3] = 0
      ld[h] = to.x; ld[h + 1] = to.y; ld[h + 2] = to.z; ld[h + 3] = 0
      const tiles = given.get(light)
      ld[q] = 0; ld[q + 1] = tiles ? tiles[0] : -1; ld[q + 2] = tiles ? tiles[1] : 0; ld[q + 3] = farOf(ctx, light)
      ld[e] = nearOf(ctx, light); ld[e + 1] = sh?.bias ?? 0; ld[e + 2] = sh?.normalBias ?? 0; ld[e + 3] = 1
      continue
    }
    ld[a] = v.x; ld[a + 1] = v.y; ld[a + 2] = v.z; ld[a + 3] = light.distance
    ld[c] = light.color.r * light.intensity; ld[c + 1] = light.color.g * light.intensity; ld[c + 2] = light.color.b * light.intensity; ld[c + 3] = light.decay
    const spot = light as THREE.SpotLight
    if (spot.isSpotLight) {
      // as three's own: from the target to the light, in view space, and the cosines of the cone
      // and of the cone less its penumbra
      aim.setFromMatrixPosition(spot.matrixWorld).sub(to.setFromMatrixPosition(spot.target.matrixWorld)).transformDirection(view)
      ld[s] = aim.x; ld[s + 1] = aim.y; ld[s + 2] = aim.z; ld[s + 3] = Math.cos(spot.angle)
      ld[q] = Math.cos(spot.angle * (1 - spot.penumbra))
    } else {
      // a point light's cone takes in every direction: smoothstep(-2, -1, cos) is 1 for every cos
      ld[s] = 0; ld[s + 1] = 0; ld[s + 2] = 1; ld[s + 3] = -2
      ld[q] = -1
    }
    // its tiles, none where it has no shadow this frame
    const tiles = given.get(light)
    ld[q + 1] = tiles ? tiles[0] : -1; ld[q + 2] = tiles ? tiles[1] : 0; ld[q + 3] = farOf(ctx, light)
    ld[e] = nearOf(ctx, light)
    ld[e + 1] = (sh?.bias ?? 0) + Math.abs(light.shadow.bias)
    ld[e + 2] = (sh?.normalBias ?? 0) + light.shadow.normalBias
    ld[e + 3] = 0
  }
  lights.needsUpdate = true
}
