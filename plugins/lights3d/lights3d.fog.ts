// lights3d's fog: air lit by every lamp and, with `areas`, every rectangle (a small light at its middle of its light ×
// its area × its picture's average, with its shadow), a pass render3d draws the frame through (`lights3d.plugin.ts` says how a scene
// gives it, `world.lights3d.fog`). Its noise is baked here; its walk reads the lamps from lights3d's cells and
// lights and their shadows from its atlases, by the shader code of `lights3d.glsl.ts`.
import type * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { GLSL } from './lights3d.glsl.ts'
import { GLSL_AREAS } from './lights3d.areas.ts'
import type { Fog } from './lights3d.plugin.ts'

// The fog's noise: `size`³ texels of smooth noise that repeats seamlessly along every axis, four octaves
// of value noise on lattices that divide `size`, each lattice point a roll of a seeded generator, so
// every page bakes the same, stretched to the whole of 0 to 1. Read through a sampler that repeats and
// smooths.
export function fogNoise(size = 64) {
  let seed = 7919
  const roll = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const out = new Float32Array(size * size * size)
  for (const [cells, weight] of [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]] as const) {
    const lattice = Float32Array.from({ length: cells * cells * cells }, roll)
    const at = (x: number, y: number, z: number) => lattice[((z % cells) * cells + (y % cells)) * cells + (x % cells)]
    const ease = (t: number) => t * t * (3 - 2 * t)
    for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells, fz = (z / size) * cells
      const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz)
      const u = ease(fx - x0), v = ease(fy - y0), w = ease(fz - z0)
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t
      const c = (dx: number, dy: number, dz: number) => at(x0 + dx, y0 + dy, z0 + dz)
      const value = lerp(
        lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
        lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
        w,
      )
      out[(z * size + y) * size + x] += value * weight
    }
  }
  // stretched to the whole of 0..1: summed octaves crowd round their middle, and fog cut from that
  // would barely clump
  let lo = Infinity, hi = -Infinity
  for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = Math.round(((out[i] - lo) / (hi - lo)) * 255)
  return { size, bytes }
}

// The fog, a pass render3d draws the frame through (its `pass`, under `lights3d`) with the depth the
// scene was drawn with. Each pixel's ray, from the eye to what the pixel shows (or `far` metres, where
// it shows nothing nearer), is walked in `steps` steps, each begun at a point jittered by the pixel so
// the steps' bands blur into noise. At each step the fog there takes `density` of the light a metre:
// what is behind it is dimmed by that much, and it gives back the light that reaches it, scattered
// toward the eye: `colour`, its own faint light where no lamp reaches, and every lamp of the cell the
// step is in, as the surfaces are lit (its fall off, its cone, its shadow from the atlas), times the
// Henyey-Greenstein phase of the angle between the lamp's light and the ray, `g` above 0 throwing more
// of it on toward the eye, so a lamp's halo is brightest looking into it.
// The walk is drawn at `resolution` of the frame's size into a target of its own, each texel the light
// the fog gave back along its ray and the share of what is behind that shows through, and laid over the
// frame at its full size, smoothed between texels: fog has no edges of its own to lose. Each step reads
// one texel of a lamp's shadow, its jitter blurring the edge as nine texels blur a surface's.
// Smoothed over time: each frame's jitter is moved on by the golden ratio, so a pixel's steps start
// somewhere new every frame, and each frame's walk is blended into the frames before it, `blend` of it
// the new frame's. The frames before are read where the pixel's ray end stood in the last frame,
// through the last frame's camera, so the blend holds as the camera moves, and held within what this
// frame's nine nearest texels show, so a moving lamp leaves no trail. Where the last frame did not see
// the point, or there is no last frame, the new frame's walk stands alone.
export class Haze extends Pass {
  depth: THREE.DepthTexture | null = null
  material: THREE.ShaderMaterial
  laid: THREE.ShaderMaterial
  quad: FullScreenQuad
  over: FullScreenQuad
  low: THREE.WebGLRenderTarget
  // the frames blended so far, two so one is read while the other is written, the one written last
  // `current`; the camera they were drawn through; and whether there is one yet
  kept: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  current = 0
  had = false
  frame = 0
  prevViewProj: THREE.Matrix4
  resolve: THREE.ShaderMaterial
  blended: FullScreenQuad
  // the noise the fog's thickness is swung by, and the moment drawn, in seconds, which drifts it: set by
  // lights3d each tick from the steps' clock, so it drifts smoothly at any display's rate
  noise: THREE.Data3DTexture
  time = 0

  // a colour #rrggbb as three reads it, linear
  linear: (hex: string) => [number, number, number]

  // `levels`, the areas' (`world.lights3d.areas.levels`), where the scene has area lights, so the walk lights them too
  constructor(private camera: THREE.PerspectiveCamera, private f: Fog, shared: Record<string, THREE.IUniform>, T: typeof THREE, levels?: number) {
    super()
    const c = new T.Color(f.colour)
    const scratch = new T.Color()
    this.linear = hex => { scratch.set(hex); return [scratch.r, scratch.g, scratch.b] }
    const target = () => new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false, generateMipmaps: false })
    const baked = fogNoise()
    this.noise = new T.Data3DTexture(baked.bytes, baked.size, baked.size, baked.size)
    this.noise.format = T.RedFormat
    this.noise.type = T.UnsignedByteType
    this.noise.minFilter = this.noise.magFilter = T.LinearFilter
    this.noise.wrapS = this.noise.wrapT = this.noise.wrapR = T.RepeatWrapping
    this.noise.unpackAlignment = 1
    this.noise.needsUpdate = true
    this.low = target()
    this.kept = [target(), target()]
    this.prevViewProj = new T.Matrix4()
    const vertex = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
    this.resolve = new T.ShaderMaterial({
      uniforms: {
        tNow: { value: this.low.texture }, tBefore: { value: null }, tDepth: { value: null },
        uInverse: { value: new T.Matrix4() }, uCamera: { value: new T.Matrix4() }, uBefore: { value: this.prevViewProj },
        cameraNear: { value: camera.near }, cameraFar: { value: camera.far }, uFar: { value: f.far },
        uBlend: { value: f.blend }, uHad: { value: 0 }, uTexel: { value: new T.Vector2(1, 1) },
      },
      vertexShader: vertex,
      fragmentShader: `
        #include <packing>
        uniform sampler2D tNow; uniform sampler2D tBefore; uniform sampler2D tDepth;
        uniform mat4 uInverse; uniform mat4 uCamera; uniform mat4 uBefore;
        uniform float cameraNear; uniform float cameraFar; uniform float uFar; uniform float uBlend; uniform float uHad;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec4 now = texture2D( tNow, vUv );
          // what this frame's nine nearest texels show, which the frames before are held within
          vec4 lo = now, hi = now;
          for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
            vec4 s = texture2D( tNow, vUv + vec2( x, y ) * uTexel );
            lo = min( lo, s ); hi = max( hi, s );
          }
          // where the pixel's ray ends, in the world, and where that stood in the last frame
          float d = texture2D( tDepth, vUv ).x;
          vec4 h = uInverse * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
          vec3 ray = normalize( h.xyz / h.w );
          #ifdef USE_REVERSED_DEPTH_BUFFER
          bool sky = d <= 0.0;
          #else
          bool sky = d >= 1.0;
          #endif
          float end = sky ? uFar : min( uFar, - perspectiveDepthToViewZ( d, cameraNear, cameraFar ) / max( - ray.z, 1e-4 ) );
          vec4 then = uBefore * ( uCamera * vec4( ray * end, 1.0 ) );
          vec2 at = then.xy / then.w * 0.5 + 0.5;
          if ( uHad < 0.5 || then.w <= 0.0 || at.x < 0.0 || at.y < 0.0 || at.x > 1.0 || at.y > 1.0 ) {
            gl_FragColor = now;
            return;
          }
          vec4 before = clamp( texture2D( tBefore, at ), lo, hi );
          gl_FragColor = mix( before, now, uBlend );
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.blended = new FullScreenQuad(this.resolve)
    this.laid = new T.ShaderMaterial({
      uniforms: { tColor: { value: null }, tFog: { value: this.kept[0].texture } },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tColor;\nuniform sampler2D tFog;\nvarying vec2 vUv;\nvoid main() { vec4 s = texture2D( tColor, vUv ); vec4 f = texture2D( tFog, vUv ); gl_FragColor = vec4( s.rgb * f.a + f.rgb, s.a ); }',
      depthTest: false,
      depthWrite: false,
    })
    this.over = new FullScreenQuad(this.laid)
    this.material = new T.ShaderMaterial({
      uniforms: {
        ...shared,
        tDepth: { value: null },
        uInverse: { value: new T.Matrix4() },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        uDensity: { value: f.density },
        uAmbient: { value: new T.Vector3(c.r, c.g, c.b) },
        uSteps: { value: f.steps },
        uG: { value: f.g },
        uFar: { value: f.far },
        uFrame: { value: 0 },
        uCameraWorld: { value: new T.Matrix4() },
        uNoise: { value: this.noise },
        uNoiseOn: { value: 0 }, uNoiseSize: { value: 1 }, uNoiseLayers: { value: 1 }, uNoiseStrength: { value: 0 }, uWind: { value: new T.Vector3() }, uTime: { value: 0 },
        uHeightOn: { value: 0 }, uFloor: { value: 0 }, uThinning: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        #include <common>
        #include <packing>
        ${GLSL.common}
        ${levels === undefined ? '' : `${GLSL_AREAS(levels).common}\n        #define LIGHTS3D_AREAS`}
        // three's own, from lights_pars_begin, which a pass does not include
        float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
          float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
          if ( cutoffDistance > 0.0 ) distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
          return distanceFalloff;
        }
        float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
          return smoothstep( coneCosine, penumbraCosine, angleCosine );
        }
        uniform sampler2D tDepth;
        uniform mat4 uInverse;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float uDensity;
        uniform vec3 uAmbient;
        uniform float uSteps;
        uniform float uG;
        uniform float uFar;
        uniform float uFrame;
        uniform mat4 uCameraWorld;
        uniform highp sampler3D uNoise;
        uniform float uNoiseOn; uniform float uNoiseSize; uniform float uNoiseLayers; uniform float uNoiseStrength; uniform vec3 uWind; uniform float uTime;
        uniform float uHeightOn; uniform float uFloor; uniform float uThinning;
        varying vec2 vUv;
        // how thick the fog is at world point w, times its density: halved every thinning metres above
        // the floor, and swung by the noise, its layers each half the size of the one before and drifting
        // faster on the wind turned further round, so the fog churns rather than slides
        float thickness( vec3 w ) {
          float k = 1.0;
          if ( uHeightOn > 0.5 ) k *= exp2( - max( w.y - uFloor, 0.0 ) / uThinning );
          if ( uNoiseOn > 0.5 ) {
            float n = 0.0, a = 1.0, sum = 0.0;
            for ( int i = 0; i < 4; i ++ ) {
              if ( float( i ) >= uNoiseLayers ) break;
              float turn = float( i ) * 1.7, c = cos( turn ), s = sin( turn );
              vec3 drift = vec3( c * uWind.x - s * uWind.z, uWind.y, s * uWind.x + c * uWind.z ) * uTime * ( 1.0 + 0.6 * float( i ) );
              n += a * texture( uNoise, ( w * exp2( float( i ) ) + drift ) / uNoiseSize ).r;
              sum += a;
              a *= 0.5;
            }
            // averaged layers crowd round their middle again: widened before the clumps are cut
            n = clamp( ( n / sum - 0.5 ) * ( 1.0 + 0.6 * ( uNoiseLayers - 1.0 ) ) + 0.5, 0.0, 1.0 );
            k *= mix( 1.0, 2.0 * smoothstep( 0.35, 0.65, n ), uNoiseStrength );
          }
          return k;
        }
        // a number from 0 to 1 that changes from pixel to pixel with no pattern the eye picks up, moved on
        // by the golden ratio each frame so the frames blended start each pixel's steps somewhere new
        float jitter( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) + uFrame * 0.6180339887 ); }
        void main() {
          float d = texture2D( tDepth, vUv ).x;
          vec4 ndc = vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
          vec4 h = uInverse * ndc;
          vec3 ray = normalize( h.xyz / h.w );
          // the length along the ray to what the pixel shows: its depth along the view over the ray's
          // share of the view, or far where it shows nothing
          float viewZ = perspectiveDepthToViewZ( d, cameraNear, cameraFar );
          #ifdef USE_REVERSED_DEPTH_BUFFER
          bool sky = d <= 0.0;
          #else
          bool sky = d >= 1.0;
          #endif
          float end = sky ? uFar : min( uFar, -viewZ / max( -ray.z, 1e-4 ) );
          float stride = end / uSteps;
          float t = stride * jitter( gl_FragCoord.xy );
          float through = 1.0;
          vec3 light = vec3( 0.0 );
          float g2 = uG * uG;
          int n = int( uSteps );
          for ( int i = 0; i < 256; i ++ ) {
            if ( i >= n ) break;
            vec3 p = ray * t;
            vec3 here = uAmbient;
            {
              float depth = max( - p.z, uLights3dNear );
              vec3 at = vec3( vUv * uLights3dGrid.xy, log( depth / uLights3dNear ) * uLights3dScale );
              ivec3 cell = ivec3( clamp( floor( at ), vec3( 0.0 ), uLights3dGrid - 1.0 ) );
              int c = cell.x + int( uLights3dGrid.x ) * ( cell.y + int( uLights3dGrid.y ) * cell.z );
              vec2 run = texelFetch( uLights3dCells, ivec2( c % LIGHTS3D_ROW, c / LIGHTS3D_ROW ), 0 ).xy;
              int last = int( run.x + run.y );
              for ( int e = int( run.x ); e < last; e ++ ) {
                int k = int( texelFetch( uLights3dIndex, ivec2( e % LIGHTS3D_ROW, e / LIGHTS3D_ROW ), 0 ).r );
                ivec2 T = ivec2( k % LIGHTS3D_ROW, ( k / LIGHTS3D_ROW ) * LIGHTS3D_TEXELS );
                vec4 A = texelFetch( uLights3dLights, T, 0 );
                vec4 B = texelFetch( uLights3dLights, T + ivec2( 0, 1 ), 0 );
                vec4 S = texelFetch( uLights3dLights, T + ivec2( 0, 2 ), 0 );
                vec4 P = texelFetch( uLights3dLights, T + ivec2( 0, 3 ), 0 );
                vec4 Q = texelFetch( uLights3dLights, T + ivec2( 0, 4 ), 0 );
                // the light reaching this step, and the way it comes from
                vec3 lit = vec3( 0.0 ), L = vec3( 0.0, 0.0, 1.0 );
                #ifdef LIGHTS3D_AREAS
                if ( Q.w > 0.5 ) {
                  // a rectangle: a small light at its middle, its light × its area × its picture's average, given off
                  // along its own −z (its half width crossed with its half height, turned round), over the square of
                  // the distance and its area over pi, faded at its reach, with its shadow
                  vec3 W = S.xyz, Hh = texelFetch( uLights3dLights, T + ivec2( 0, 5 ), 0 ).xyz;
                  vec3 V = A.xyz - p;
                  float len = length( V );
                  L = V / max( len, 1e-4 );
                  vec3 facing = - normalize( cross( W, Hh ) );
                  float area = 4.0 * length( W ) * length( Hh );
                  vec3 colour = B.rgb;
                  if ( B.w >= 0.0 ) colour *= texture( uLights3dPictures, vec3( 0.5, 0.5, B.w + LIGHTS3D_LEVELS - 1.0 ) ).rgb;
                  lit = colour * area * max( dot( facing, - L ), 0.0 ) / ( len * len + area / PI ) * pow2( saturate( 1.0 - pow4( len / A.w ) ) );
                  if ( P.z > 0.0 ) lit *= lights3dShadowOf( p, len, P, Q, 0 );
                  if ( lit.r + lit.g + lit.b <= 0.0 ) continue;
                } else
                #endif
                {
                  vec3 V = A.xyz - p;
                  float len = length( V );
                  L = V / max( len, 1e-4 );
                  float cone = getSpotAttenuation( S.w, P.x, dot( L, S.xyz ) );
                  if ( cone <= 0.0 ) continue;
                  lit = B.rgb * cone * getDistanceAttenuation( len, A.w, B.w );
                  if ( P.z > 0.0 ) lit *= lights3dShadowOf( p, len, P, Q, 0 );
                }
                float cosine = dot( L, -ray );
                float phase = ( 1.0 - g2 ) / ( 4.0 * PI * pow( max( 1.0 + g2 - 2.0 * uG * cosine, 1e-4 ), 1.5 ) );
                here += lit * phase;
              }
            }
            float taken = exp( - uDensity * thickness( ( uCameraWorld * vec4( p, 1.0 ) ).xyz ) * stride );
            light += through * here * ( 1.0 - taken );
            through *= taken;
            t += stride;
            // past here almost nothing more would show
            if ( through < 0.01 ) break;
          }
          gl_FragColor = vec4( light, through );
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  // the frame's size, kept so a `resolution` written while the page runs sizes the walk again
  size: [number, number] = [1, 1]

  setSize(width: number, height: number) {
    this.size = [width, height]
    this.fit()
  }

  fit() {
    const w = Math.max(1, Math.ceil(this.size[0] * this.f.resolution)), h = Math.max(1, Math.ceil(this.size[1] * this.f.resolution))
    if (this.low.width === w && this.low.height === h) return
    for (const t of [this.low, ...this.kept]) t.setSize(w, h)
    // a walk of another size has no frames before it
    this.had = false
  }

  // Every number of the fog is read off `world.lights3d.fog` each frame, so one written while the page
  // runs is drawn from the next.
  render(renderer: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    const u = this.material.uniforms, f = this.f
    u.uDensity.value = f.density
    u.uSteps.value = f.steps
    u.uG.value = f.g
    u.uFar.value = f.far
    ;(u.uAmbient.value as THREE.Vector3).set(...this.linear(f.colour))
    this.fit()
    u.tDepth.value = this.depth
    u.uInverse.value.copy(this.camera.projectionMatrixInverse)
    u.cameraNear.value = this.camera.near
    u.cameraFar.value = this.camera.far
    u.uFrame.value = this.frame++ % 1000
    u.uCameraWorld.value.copy(this.camera.matrixWorld)
    const n = f.noise, ht = f.height
    u.uNoiseOn.value = n ? 1 : 0
    if (n) {
      u.uNoiseSize.value = n.size
      u.uNoiseLayers.value = n.layers
      u.uNoiseStrength.value = n.strength
      u.uWind.value.set(n.wind[0], n.wind[1], n.wind[2])
    }
    u.uTime.value = this.time
    u.uHeightOn.value = ht ? 1 : 0
    if (ht) {
      u.uFloor.value = ht.floor
      u.uThinning.value = ht.thinning
    }
    renderer.setRenderTarget(this.low)
    this.quad.render(renderer)
    // this frame's walk blended into the frames before it, into the other kept target
    const r = this.resolve.uniforms, next = 1 - this.current
    r.tBefore.value = this.kept[this.current].texture
    r.tDepth.value = this.depth
    r.uInverse.value.copy(this.camera.projectionMatrixInverse)
    r.uCamera.value.copy(this.camera.matrixWorld)
    r.cameraNear.value = this.camera.near
    r.cameraFar.value = this.camera.far
    r.uFar.value = f.far
    r.uBlend.value = f.blend
    r.uHad.value = this.had ? 1 : 0
    r.uTexel.value.set(1 / this.low.width, 1 / this.low.height)
    renderer.setRenderTarget(this.kept[next])
    this.blended.render(renderer)
    this.current = next
    this.had = true
    this.prevViewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    this.laid.uniforms.tFog.value = this.kept[next].texture
    this.laid.uniforms.tColor.value = read.texture
    renderer.setRenderTarget(this.renderToScreen ? null : write)
    this.over.render(renderer)
  }

  dispose() {
    this.material.dispose()
    this.laid.dispose()
    this.resolve.dispose()
    this.quad.dispose()
    this.over.dispose()
    this.blended.dispose()
    this.low.dispose()
    for (const t of this.kept) t.dispose()
    this.noise.dispose()
  }
}
