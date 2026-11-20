// lights3d's area lights: lights that are a surface, not a point. `lights3d.plugin.ts` says how a scene gives them,
// `world.lights3d.areas`; this file holds what they need beyond a lamp's record.
//
// Rectangles: three's `RectAreaLight`, its `color` × `intensity` the light its face gives off, `width` × `height`
// metres, shining along its own −z from its middle. One whose `userData.picture` is a three texture shines that
// picture: each point is lit by the part of the picture it faces. Each picture is prefiltered into `levels` layers of
// `size` × `size` texels of one texture array: the picture in the middle with a border of its own edge round it, a
// share PAD of the layer wide each side, layer 0 as it is and each layer after blurred by a Gaussian twice as wide as
// the one before, layer k's spread 2^k / 2^levels of the picture's width; filtered again whenever the texture's
// `version` changes, so a picture played (a canvas, a video) lights as it is now. A rectangle is evaluated by three's
// Linearly Transformed Cosines (Heitz, Dupuy, Hill, Neubelt, 2016), as three's `RE_Direct_RectArea_Physical` is, and
// its picture read as their filtered texture fetch reads it: where the lobe's middle meets the light's plane, blurred
// by the distance over the square root of the light's area times `blur`.
//
// What glows: supershader3d's glowmap (`plugins/supershader3d/supershader3d.glowmap.ts`), handed over by the mod the
// scene names in `world.lights3d.mods.glow` (`supershader3d.lights3d.ts`): the glow the camera sees, summed into
// screen cells, each a small light of its power at its place facing its way, read by every pixel, since where they
// stand is known only to the GPU; `glow.gain` scales them.
//
// A rectangle is clustered as a lamp is, by the reach past which it gives less than `cutoff` (its light × its area
// over pi, over cutoff, square-rooted), and fades to nothing at that reach as three fades a lamp of a `distance`.
// Rectangles are lit in the standard and physical materials, which three's LTC code is written for; screen cells in
// every material that lights. A rectangle that casts a shadow (`castShadow`) is given a tile as a spot is, its camera at its middle
// looking the way it shines, `angle` radians from its aim to its edge, from `near` metres to its reach, its shadow
// read as a lamp's is. The glow's cells cast none, and the fog is not lit by them.
import type * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js'
import type { Plugins } from '#engine/browser.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Glowmap } from '#plugins/supershader3d/supershader3d.plugin.ts'
import type { Ctx } from './lights3d.lights.ts'

export type Areas = {
  size: number; levels: number; blur: number; cutoff: number; angle: number; near: number
  glow?: { gain: number }
}

// The share of a layer's width left each side of the picture for its blurred edge.
const PAD = 0.125
// Taps each side of the middle in a blur pass.
const TAPS = 6

export function checkedAreas(a: Areas) {
  if (!(Number.isInteger(a.size) && a.size >= 8)) throw new Error(`lights3d areas size ${a.size} is not a whole number of texels from 8`)
  if (!(Number.isInteger(a.levels) && a.levels >= 2)) throw new Error(`lights3d areas levels ${a.levels} is not a whole number from 2`)
  if (!(a.blur > 0)) throw new Error(`lights3d areas blur ${a.blur} is not above 0`)
  if (!(a.cutoff > 0)) throw new Error(`lights3d areas cutoff ${a.cutoff} is not above 0`)
  if (!(a.angle > 0 && a.angle < Math.PI / 2)) throw new Error(`lights3d areas angle ${a.angle} is not above 0 and below a quarter turn`)
  if (!(a.near > 0)) throw new Error(`lights3d areas near ${a.near} is not above 0`)
  return a
}

// What a rectangle gives off, reduced to one number: its colour's brightness × intensity × its area.
export const rectPower = (light: THREE.RectAreaLight) =>
  (0.2126 * light.color.r + 0.7152 * light.color.g + 0.0722 * light.color.b) * light.intensity * light.width * light.height
// The reach past which a rectangle gives less than `cutoff`.
export const rectReach = (light: THREE.RectAreaLight, a: Areas) => Math.sqrt(rectPower(light) / (Math.PI * a.cutoff))

export const GLSL_AREAS = (levels: number) => ({
  common: `
    uniform highp sampler2DArray uLights3dPictures;
    uniform sampler2D uLights3dLtc;
    uniform float uLights3dBlur;
    uniform highp sampler2D uLights3dGlowmap;
    uniform float uLights3dGlowGain;
    uniform ivec2 uLights3dGlowCells;
    #define LIGHTS3D_LEVELS ${levels}.0
    #define LIGHTS3D_PAD ${PAD}`,
  '?lights_physical_pars_fragment': `
    // three's two LTC tables, side by side in one texture: the inverse matrix's on the left, the Fresnel's on the right
    vec4 lights3dLtc1( vec2 uv ) { return texture2D( uLights3dLtc, vec2( uv.x * 0.5, uv.y ) ); }
    vec4 lights3dLtc2( vec2 uv ) { return texture2D( uLights3dLtc, vec2( uv.x * 0.5 + 0.5, uv.y ) ); }
    // The picture's light seen by a lobe from corners p0, p1, p3 of the light (p0 its left bottom, p1 its right
    // bottom, p3 its left top) relative to the surface, in the lobe's own space, its picture's first layer \`first\`.
    vec3 lights3dFetch( vec3 p0, vec3 p1, vec3 p3, float first ) {
      vec3 v1 = p1 - p0, v2 = p3 - p0;
      vec3 across = cross( v1, v2 );
      float area2 = dot( across, across );
      float away = dot( across, p0 );
      vec3 foot = away * across / area2 - p0;
      float d12 = dot( v1, v2 ), i11 = 1.0 / dot( v1, v1 );
      vec3 up = v2 - v1 * d12 * i11;
      vec2 uv;
      uv.y = dot( up, foot ) / dot( up, up );
      uv.x = dot( v1, foot ) * i11 - d12 * i11 * uv.y;
      float seen = abs( away ) / pow( area2, 0.75 );
      float level = clamp( log2( max( seen * uLights3dBlur, 1e-6 ) ) + LIGHTS3D_LEVELS, 0.0, LIGHTS3D_LEVELS - 1.0 );
      vec2 at = LIGHTS3D_PAD + ( 1.0 - 2.0 * LIGHTS3D_PAD ) * uv;
      float lo = floor( level );
      vec3 a = texture( uLights3dPictures, vec3( at, first + lo ) ).rgb;
      vec3 b = texture( uLights3dPictures, vec3( at, first + min( lo + 1.0, LIGHTS3D_LEVELS - 1.0 ) ) ).rgb;
      return mix( a, b, level - lo );
    }
    // three's LTC_Evaluate over a rectangle, its colour read from its picture where it has one
    vec3 lights3dRect( vec3 N, vec3 V, vec3 P, mat3 mInv, vec3 rect[ 4 ], float first ) {
      vec3 v1 = rect[ 1 ] - rect[ 0 ], v2 = rect[ 3 ] - rect[ 0 ];
      if ( dot( cross( v1, v2 ), P - rect[ 0 ] ) < 0.0 ) return vec3( 0.0 );
      vec3 T1 = normalize( V - N * dot( V, N ) );
      vec3 T2 = - cross( N, T1 );
      mat3 m = mInv * transpose( mat3( T1, T2, N ) );
      vec3 c[ 4 ];
      for ( int i = 0; i < 4; i ++ ) c[ i ] = m * ( rect[ i ] - P );
      vec3 shone = first < 0.0 ? vec3( 1.0 ) : lights3dFetch( c[ 0 ], c[ 1 ], c[ 3 ], first );
      for ( int i = 0; i < 4; i ++ ) c[ i ] = normalize( c[ i ] );
      vec3 f = LTC_EdgeVectorFormFactor( c[ 0 ], c[ 1 ] ) + LTC_EdgeVectorFormFactor( c[ 1 ], c[ 2 ] )
        + LTC_EdgeVectorFormFactor( c[ 2 ], c[ 3 ] ) + LTC_EdgeVectorFormFactor( c[ 3 ], c[ 0 ] );
      return shone * LTC_ClippedSphereFormFactor( f );
    }
    // how much of an area light reaches a point d from it, its reach r: all of it near, fading to none at r, as
    // three fades a lamp of a distance
    float lights3dFade( float d, float r ) { return pow2( saturate( 1.0 - pow4( d / r ) ) ); }`,
})

// The light of a rectangle (kind 1), inside the cluster loop of the shaders three's LTC code is written for, where
// l3A, l3B, l3S, l3P and l3Q are the light's texels and the sixth is read here.
export const AREA_LIGHT = `
        #ifdef STANDARD
        else {
          // a rectangle: its middle, half width and half height in the view, its light, its picture's first layer
          vec3 l3W = l3S.xyz, l3Hh = texelFetch( uLights3dLights, l3T + ivec2( 0, 5 ), 0 ).xyz;
          vec3 l3Colour = l3B.rgb * lights3dFade( length( l3A.xyz - geometryPosition ), l3A.w );
          if ( l3P.z > 0.0 ) {
            vec3 l3Moved = geometryPosition + geometryNormal * l3Q.z;
            l3Colour *= lights3dShadow( l3Moved, length( l3A.xyz - l3Moved ), l3P, l3Q );
          }
          // counterclockwise seen from the side it shines on, as three's RE_Direct_RectArea_Physical: the light's +x and
          // −y, −x and −y, −x and +y, +x and +y; seen from in front, its +x is on the left
          vec3 l3Rect[ 4 ];
          l3Rect[ 0 ] = l3A.xyz + l3W - l3Hh;
          l3Rect[ 1 ] = l3A.xyz - l3W - l3Hh;
          l3Rect[ 2 ] = l3A.xyz - l3W + l3Hh;
          l3Rect[ 3 ] = l3A.xyz + l3W + l3Hh;
          reflectedLight.directSpecular += l3Colour * l3Fresnel * lights3dRect( geometryNormal, geometryViewDir, geometryPosition, l3Inv, l3Rect, l3B.w );
          reflectedLight.directDiffuse += l3Colour * material.diffuseContribution * lights3dRect( geometryNormal, geometryViewDir, geometryPosition, mat3( 1.0 ), l3Rect, l3B.w );
        }
        #endif`

// The LTC lobe fitted for this pixel, before the cluster loop, in the shaders three's LTC code is written for.
export const AREA_LOBE = `
      #ifdef STANDARD
      vec2 l3Uv = LTC_Uv( geometryNormal, geometryViewDir, material.roughness );
      vec4 l3T1 = lights3dLtc1( l3Uv ), l3T2 = lights3dLtc2( l3Uv );
      mat3 l3Inv = mat3( vec3( l3T1.x, 0, l3T1.y ), vec3( 0, 1, 0 ), vec3( l3T1.z, 0, l3T1.w ) );
      vec3 l3Fresnel = material.specularColorBlended * l3T2.x + ( material.specularF90 - material.specularColorBlended ) * l3T2.y;
      #endif`

// Every cell of the glow the camera sees, after the cluster loop, in every shader that lights: a small light at its
// place facing its way, its power over the square of its distance (and its area over pi, so a surface close by is
// not lit past the light it covers), times how squarely it faces the point, handed to the shader's own RE_Direct.
export const AREA_CELLS = `
      for ( int j = 0; j < uLights3dGlowCells.y; j ++ ) for ( int i = 0; i < uLights3dGlowCells.x; i ++ ) {
        ivec2 l3C = ivec2( i * 3, j );
        vec4 l3Power = texelFetch( uLights3dGlowmap, l3C, 0 );
        if ( l3Power.r + l3Power.g + l3Power.b <= 0.0 ) continue;
        vec3 l3Place = ( viewMatrix * vec4( texelFetch( uLights3dGlowmap, l3C + ivec2( 1, 0 ), 0 ).xyz, 1.0 ) ).xyz;
        vec3 l3Facing = mat3( viewMatrix ) * texelFetch( uLights3dGlowmap, l3C + ivec2( 2, 0 ), 0 ).xyz;
        vec3 l3To = l3Place - geometryPosition;
        float l3D2 = dot( l3To, l3To ) + l3Power.a / PI;
        directLight.direction = normalize( l3To );
        directLight.color = uLights3dGlowGain * l3Power.rgb * max( dot( l3Facing, - directLight.direction ), 0.0 ) / l3D2;
        directLight.visible = true;
        RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      }`

// The picture laid into a layer with its border: its own edge carried out to the layer's edge.
const LAY = `
  uniform sampler2D picture;
  varying vec2 vUv;
  void main() {
    vec2 at = clamp( ( vUv - ${PAD} ) / ( 1.0 - 2.0 * ${PAD} ), 0.0, 1.0 );
    gl_FragColor = vec4( texture2D( picture, at ).rgb, 1.0 );
  }`

// One pass of a Gaussian whose standard deviation is `spread` (a share of the layer's width) along `way`, out to three
// of them each side, from a 2D texture or a layer of the array.
const BLUR = (array: boolean) => `
  ${array ? 'uniform highp sampler2DArray from; uniform float layer;' : 'uniform sampler2D from;'}
  uniform vec2 way;
  uniform float spread;
  varying vec2 vUv;
  void main() {
    vec3 sum = vec3( 0.0 );
    float total = 0.0;
    for ( int i = -${TAPS}; i <= ${TAPS}; i ++ ) {
      float x = float( i ) / ${TAPS}.0 * 3.0;
      float w = exp( - 0.5 * x * x );
      vec2 at = vUv + way * x * spread;
      sum += w * ${array ? 'texture( from, vec3( at, layer ) ).rgb' : 'texture2D( from, at ).rgb'};
      total += w;
    }
    gl_FragColor = vec4( sum / total, 1.0 );
  }`

const QUAD = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }'

// The area lights' textures and passes, their uniforms put on the shared ones.
export function makeAreas(ctx: Ctx, a: Areas) {
  const T = ctx.built.T
  const ltc = RectAreaLightTexturesLib.init()
  // three's two 64 × 64 tables side by side, one texture
  const one = ltc.LTC_FLOAT_1.image.data as Float32Array, two = ltc.LTC_FLOAT_2.image.data as Float32Array
  const both = new Float32Array(128 * 64 * 4)
  for (let y = 0; y < 64; y++) {
    both.set(one.subarray(y * 64 * 4, (y + 1) * 64 * 4), y * 128 * 4)
    both.set(two.subarray(y * 64 * 4, (y + 1) * 64 * 4), (y * 128 + 64) * 4)
  }
  const tables = new T.DataTexture(both, 128, 64, T.RGBAFormat, T.FloatType)
  tables.minFilter = tables.magFilter = T.LinearFilter
  tables.wrapS = tables.wrapT = T.ClampToEdgeWrapping
  tables.needsUpdate = true
  const array = (n: number) => {
    const target = new T.WebGLArrayRenderTarget(a.size, a.size, n * a.levels, { type: T.HalfFloatType, generateMipmaps: false, depthBuffer: false })
    target.texture.minFilter = T.LinearFilter
    target.texture.magFilter = T.LinearFilter
    return target
  }
  let pictures = array(1)
  const half = new T.WebGLRenderTarget(a.size, a.size, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false, depthBuffer: false })
  const shader = (fragmentShader: string, more: Record<string, THREE.IUniform>) =>
    new T.ShaderMaterial({ vertexShader: QUAD, fragmentShader, uniforms: more, depthTest: false, depthWrite: false })
  const lay = shader(LAY, { picture: { value: null } })
  const across = shader(BLUR(true), { from: { value: pictures.texture }, layer: { value: 0 }, way: { value: new T.Vector2(1, 0) }, spread: { value: 0 } })
  const down = shader(BLUR(false), { from: { value: half.texture }, way: { value: new T.Vector2(0, 1) }, spread: { value: 0 } })
  const quad = new FullScreenQuad(lay)
  // the glowmap's stand-in, bound while there is none
  const stand = new T.DataTexture(new Float32Array(4), 1, 1, T.RGBAFormat, T.FloatType)
  stand.needsUpdate = true
  // each picture's place in the array, counted in pictures, and the version of it last filtered there
  const slots = new Map<THREE.Texture, { slot: number; version: number }>()
  Object.assign(ctx.uniforms, {
    uLights3dPictures: { value: pictures.texture },
    uLights3dLtc: { value: tables },
    uLights3dBlur: { value: a.blur },
    uLights3dGlowmap: { value: stand },
    uLights3dGlowGain: { value: a.glow?.gain ?? 1 },
    uLights3dGlowCells: { value: new T.Vector2(0, 0) },
  })

  // Filters `picture` into its slot's layers.
  const filter = (renderer: THREE.WebGLRenderer, picture: THREE.Texture, slot: number) => {
    const was = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel()
    const first = slot * a.levels
    lay.uniforms.picture.value = picture
    quad.material = lay
    renderer.setRenderTarget(pictures, first)
    quad.render(renderer)
    for (let k = 1; k < a.levels; k++) {
      // the spread this layer adds to the one before, so the two together are 2^k / 2^levels
      const now = 2 ** k / 2 ** a.levels, then = k === 1 ? 0 : 2 ** (k - 1) / 2 ** a.levels
      const spread = Math.sqrt(now * now - then * then) * (1 - 2 * PAD)
      across.uniforms.layer.value = first + k - 1
      across.uniforms.spread.value = spread
      quad.material = across
      renderer.setRenderTarget(half)
      quad.render(renderer)
      down.uniforms.spread.value = spread
      quad.material = down
      renderer.setRenderTarget(pictures, first + k)
      quad.render(renderer)
    }
    renderer.setRenderTarget(was, face, level)
  }

  return {
    // Each rectangle's picture given a slot, the array grown to hold them, and each filtered again where it changed.
    pictures(renderer: THREE.WebGLRenderer, rects: THREE.RectAreaLight[]) {
      ctx.uniforms.uLights3dBlur.value = a.blur
      const shown = new Set<THREE.Texture>()
      for (const light of rects) {
        const picture = light.userData.picture as THREE.Texture | undefined
        if (picture?.image) shown.add(picture)
      }
      for (const picture of [...slots.keys()]) if (!shown.has(picture)) slots.delete(picture)
      const used = new Set([...slots.values()].map(v => v.slot))
      for (const picture of shown) {
        if (slots.has(picture)) continue
        let slot = 0
        while (used.has(slot)) slot++
        used.add(slot)
        slots.set(picture, { slot, version: -1 })
      }
      const n = Math.max(1, ...[...used].map(u => u + 1))
      if (pictures.depth < n * a.levels) {
        pictures.dispose()
        pictures = array(n)
        ctx.uniforms.uLights3dPictures.value = pictures.texture
        across.uniforms.from.value = pictures.texture
        for (const held of slots.values()) held.version = -1
      }
      for (const [picture, held] of slots) {
        if (held.version === picture.version) continue
        filter(renderer, picture, held.slot)
        held.version = picture.version
      }
    },
    // The first layer of a rectangle's picture, or −1 for one that shines no picture.
    first(light: THREE.RectAreaLight) {
      const held = slots.get(light.userData.picture)
      return held ? held.slot * a.levels : -1
    },
    // What glows this frame, from the glowmap the scene's mod hands over: its cells bound for every pixel.
    glowing(plugins: Plugins) {
      const g = a.glow
      const take = g ? mod<(plugins: Plugins) => Glowmap | undefined>(plugins.wire.scene.world!, 'lights3d', 'glow') : undefined
      const map = take?.(plugins)
      ctx.uniforms.uLights3dGlowGain.value = g?.gain ?? 1
      ctx.uniforms.uLights3dGlowmap.value = map ? map.texture : stand
      const cells: [number, number] = map ? map.cells : [0, 0]
      ;(ctx.uniforms.uLights3dGlowCells.value as THREE.Vector2).set(cells[0], cells[1])
    },
    dispose() {
      tables.dispose()
      pictures.dispose()
      half.dispose()
      for (const m of [lay, across, down]) m.dispose()
      quad.dispose()
      stand.dispose()
      slots.clear()
    },
  }
}
