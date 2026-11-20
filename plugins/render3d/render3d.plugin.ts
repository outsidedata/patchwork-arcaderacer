// render3d: the three.js scene, the camera it is seen through, and the look it is drawn with. It has
// no row and no server half: its prefab is read off the scene on the first tick, as `ui` reads its
// own, so the numbers reach every page once, in the scene file the page already has.
//
// The prefab:
//   camera      { fov, near, far, at, look }: a PerspectiveCamera of the canvas's shape at `at`,
//               looking at `look`. Whatever places the camera afterwards writes it here.
//   pixelRatio  a cap on the screen's devicePixelRatio. The canvas keeps the engine prefab's
//               `width` and `height` as its size on the page, and draws that many pixels times the
//               ratio; with none it draws one pixel per pixel.
//   tone        `aces`, `neutral` or `none`, and `exposure` the light it is fed with.
//   shadows     `soft`, `hard` or `none`.
//   background  a colour the scene is cleared to. Through the composer it is tone mapped with the
//               rest of the frame; drawn straight, three clears to it as given.
//   transparent true: the canvas drawn see-through wherever the scene draws nothing (the renderer made
//               with `alpha` and cleared to nothing), so a shot of it is a picture with no backdrop, an
//               icon. A scene with a `background` too throws.
//   ao          { on, radius, thickness, falloff, scale, intensity, samples }: three's GTAOPass, run
//               through an EffectComposer, while `on` is true; off when it is false or left out, so a
//               scene keeps its AO's settings with the AO off. An `ao` that is off is as no `ao`
//               everywhere below.
//   bloom       { strength, radius, threshold }: three's UnrealBloomPass, run through the
//               EffectComposer after the AO, on the frame's light before it is tone mapped, so a
//               surface or a particle brighter than `threshold` spills `strength` of its light
//               round it, `radius` from 0 to 1 how far. With no `ao`, no `bloom` and no effect
//               (Effects, below) there is no composer, and the scene is drawn straight to the canvas.
// A field left out leaves three's own setting: no tone mapping, an exposure of 1, no shadows, a pixel
// ratio of 1, three's clear colour. A scene with no render3d prefab has no camera and draws nothing.
//
// Through the composer the frame is drawn into half-float targets, so light past 1 survives until
// the last pass, three's OutputPass, tone maps it and puts it in sRGB; a material's `toneMapped`
// changes nothing there.
//
// The AO reads the depth the scene pass drew. The composer's two targets each carry a float depth
// texture, and each frame the GTAO pass is handed the one the scene pass is about to draw into, with
// no normals, which it rebuilds from the depth. So the scene is drawn once a frame, every surface
// occludes where its own material put it, and no pass draws the scene again with an override
// material or holds a target of normals or depth to draw it into. With `ao` the renderer draws
// reversed depth (`reversedDepthBuffer`), so a normal rebuilt from depth far off is not noise; that
// is fixed when the renderer is made, so the renderer is made once a page has mounted a canvas and
// the prefab has been read, whichever comes second. A plugin that draws passes of its own through
// this renderer does so with a camera three can project again, an orthographic one, because a
// reversed-depth renderer calls `updateProjectionMatrix` on it.
//
// `project(p)` is the canvas point of a world point through the camera as it stands, in the canvas's
// pixels from its top left: `{ x, y, behind }`, where `behind` is true where the camera draws
// nothing, behind it, nearer than `near` or past `far`. It is measured along the camera's own axis,
// so it holds under either depth projection.
//
// `drew(f)` hands `f`, every frame, where the camera and each mesh stand in the world as they are
// drawn, placed between the steps, only what is drawn at all: `{ camera, rows, meshes }`, an object tagged with the row it draws
// (`userData.row`, which box3d sets on what it follows) under `rows` by the row's id, and every other
// mesh under `meshes` by its three.js id. It runs
// whether or not a canvas is mounted, so a page on node, the simulator's, is measured where a page
// in a browser draws; it hands back a function that stops it.
//
// `drifted(f)` hands `f` each object of the scene, the overlay or the camera the moment it stops being
// drawn between the steps because it moved on a frame that took no step (Between steps): its place,
// turn or scale differs in any bit, on such a frame, from where it stood on the frame of the newest
// step. `f` gets `{ object, path, step, was, now }`: the object, its names from the scene down
// (`name` or `type`, joined with ` > `), the step it drifted in, and its numbers on the step's frame
// and now (position, quaternion, scale). Each object is handed over once per step it drifts in, and
// an object raising `userData.teleport` is not, since it asked to be drawn where it is set. It is how
// a testbed finds what judders: a look that recomputes its object every frame with a different
// rounding falls out of the blend with no error. Nothing is checked while no `f` listens; it hands
// back a function that stops it.
//
// Materials. `splice(key, splice)` registers a shader splice for every dressed material, once per
// key. `dress(material, { surface })` hands a material every splice and its own `surface` through
// one `onBeforeCompile`. A splice and a surface have one shape, `{ uniforms?, vertex?: { chunk:
// glsl }, fragment?: { chunk: glsl } }`: each glsl goes right after `#include <chunk>` in that
// shader (`common` for declarations), and a chunk the shader does not include throws when the
// program is compiled. A chunk named `?chunk` is one some shaders lack: its glsl goes after
// `#include <chunk>` where the shader includes it and nowhere else, as code for the light goes only
// into the shaders that light (`lights_fragment_begin` is in Lambert, Phong, standard, physical and
// toon, never in basic). The surface goes in first, then the splices in the order they were
// registered, so a splice lands on the surface's own look. The `uniforms` objects are handed to every
// program as they are, so the plugin that owns a splice writes `value` once a frame and every
// dressed material follows. Every dressed program has `vDressWorld`, the fragment's world position
// with an instanced or batched mesh's own matrix counted; the fragment's world normal is
// `inverseTransformDirection(normal, viewMatrix)`. A program's cache key is the splice keys and the
// surface's own text, so two materials with different surfaces never share a program. A splice
// registered after a material was dressed marks that material for recompiling; a disposed material
// is let go of.
//
// Effects. `pass(key, pass)` draws every frame through a three postprocessing `Pass` of another
// plugin's, once per key: after the AO, in the order they were handed over, and before the overlay,
// the bloom and the tone mapping, so an effect works on the frame's light as the scene left it.
// Before each frame its `depth` is set to the depth texture the scene was drawn with, the one the AO
// reads; under `ao` that depth is reversed, which three tells every shader material by defining
// USE_REVERSED_DEPTH_BUFFER. It is sized to the drawing buffer when the composer is made. With an
// effect there is always a composer, drawn into targets that carry that depth, and handing one over
// once the renderer is made makes the composer again. A pass handed over is render3d's from then on:
// it is disposed when render3d closes.
//
// Reflections. `ssr` on the prefab, `{ steps, distance, thickness, roughness }`, is screen-space
// reflections: the frame is drawn through the composer, and after the scene and its effects a pass keeps
// it for the next frame (its colour with mips, each pixel's distance from the camera, and the camera's
// view and projection). Every dressed program, last of every splice, where three adds an envMap's light
// in the shaders that take light from round them (standard and physical): a surface smoother than
// `roughness` walks its reflected ray `distance` metres in `steps` steps through the world, puts each
// step through the last frame's camera, and where it first passes behind the last frame's depth by less
// than `thickness` metres, halved back to the edge, takes the last frame's colour there, read blurred by
// its roughness, in place of the reflection it had, faded near the frame's edge, toward the ray's end
// and as its roughness nears `roughness`. A ray that meets nothing keeps the reflection the surface had:
// lights3d's probes, an envMap, or none. Each number is read every frame.
// A mirror is a flat mesh whose face is its local +z (a PlaneGeometry) with `userData.mirror =
// { resolution }`: each frame the scene is drawn from the camera reflected in its plane, the mirror
// hidden and everything behind its plane clipped away, into a picture `resolution` of the frame's size,
// with mips; its material, dressed if it was not, reads that picture where the fragment falls in it,
// blurred by its roughness, as its whole reflection, and its colour, metalness and roughness work on it
// as on any light round it (a metal of roughness 0 is a looking glass; a polished dielectric reflects
// more as the eye grazes it). A mirror seen from behind keeps its last picture. Each mirror's material
// is its own: two mirrors sharing one throw, naming both. A mirror in another mirror shows its own
// picture as the last frame left it.
//
// `finish(key, pass)` draws every frame through a pass after the tone mapping, once per key, in the
// order they were handed over: it reads the frame's colours as the screen shows them, in sRGB from 0
// to 1, which is where a look made of the screen's own colours, a palette or a dither, has to work.
// The last one enabled draws to the canvas. It is handed no depth, is sized to the drawing buffer as
// an effect is, makes the composer again as an effect does, and is disposed when render3d closes.
// A finish pass alone makes a composer of three's own half-float targets.
//
// `ratio(r, look)` draws `r` pixels per canvas pixel from then on, whatever the screen's own ratio
// and the prefab's, the renderer, the composer and every pass of it sized again at once; with a
// `look` of `blocks` the page shows each drawn pixel as a hard square (the canvas's CSS
// `image-rendering: pixelated`), so 0.25 on a 1280×720 canvas draws 320×180 and shows each pixel 4
// canvas pixels square, and with `smooth`, or none, the browser's own smoothing. `ratio()` goes back
// to the prefab's, smoothed. Set before the renderer is made, it is what the renderer is made with.
//
// The overlay. `overlay` is `{ scene, camera }`, a second scene drawn over the first each frame
// with the depth cleared between them, so whatever is in it is drawn over the world and meets
// nothing of it: a cockpit, a held tool, anything that stands a hand's width from the eye. Its camera
// takes the main camera's place, turn, field of view, aspect and zoom as the frame is drawn, and
// keeps its own `near` and `far`, which whoever puts something in the overlay sets for what it put
// there, so the world keeps a near plane far enough out for its depth to hold across the land while
// the overlay's is a hundredth of that, clipping nothing close and fighting nothing far. An overlay
// with nothing in it is not drawn. Through the composer it is drawn after the AO, which does not
// reach it, and before the bloom and the tone mapping, which do, so it is lit, bloomed and graded as
// the world is; drawn straight, it is drawn right after the world. Its lights light it alone, and the
// world's light it alone, so what it holds is lit by lights it holds.
//
// Between steps. Each frame, just before it draws, every object of the scene and of the overlay, and
// the camera, is put between where the last two steps left it, as far as the frame's wire says
// (`steps`, `engine/browser.ts`, Drawing between steps): its position in a straight line, its turn the
// short way round, its scale; and once the frame is drawn each is put back where it was set. An
// InstancedMesh's copies are drawn where they are set. A frame whose tick was not run, as a test that
// draws render3d alone runs it, draws everything where it is set.
//
// A teleport. An object whose `userData.teleport` is true on a frame is drawn where it is set on that
// frame and on every other frame of the step the client is on, never between: a look that puts its
// object somewhere new rather than along its way (a door that takes the player elsewhere, a respawn, a
// car put back on the road, the camera that goes with any of them) raises the flag on the frame it
// moves the object and lowers it on a later frame, and from the next step the object is drawn between
// steps again, from where it was put. Left up, the object is never drawn between: a light moved from
// lamp to lamp. Unflagged, an object put 40 metres on is drawn sliding the 40 metres for a step. The
// flag is the object's own: a child moved with its parent needs none, and a child moved itself needs
// its own.
//
// Shaders compiled before the first draw. An object put straight into the scene or the overlay, or
// handed to `prepare(object)` (one already there, given a material it has not been drawn with), is
// compiled for that scene the next time the scene is drawn, last of the scene's own `onBeforeRender`,
// so with the lights exactly as the draw has them (lights3d takes its own out of three's there), and
// everything put in one scene since its last draw in one `renderer.compile`; and it is drawn in no
// frame, a mirror's neither, until every program it needs has finished compiling on the GPU's own
// threads (`KHR_parallel_shader_compile`): it shows a few frames later instead of stalling the frame
// that first draws it. Its `visible` is lowered only for each draw and put back after, so whatever sets
// it, sets it as ever. One whose programs are compiled already is drawn that frame. `compiling()` is how
// many are waiting or compiling, what a loading screen waits on (`render3d.loader.ts`). Objects added
// inside one already in the scene are compiled when first drawn, as is everything where the GPU has no
// `KHR_parallel_shader_compile`.
//
// The camera has one driver at a time. Whoever places it claims it: `claim(owner)` is true when
// `owner` now holds it and false while another does, `release(owner)` lets go of the owner's own
// claim only, and `claimed()` is the owner or undefined.
//
// It hands out THREE, the scene, the overlay, the canvas, the camera, the renderer, GLTFLoader and SkeletonUtils,
// and `composer`, the EffectComposer the frame is drawn through, or undefined while there is none: it
// is made again whenever an effect joins, so it is read where it is used, never kept.
// The canvas is hidden until the first `afterTick`, which runs only once the client has been sent a
// packet, so a canvas with nothing drawn on it is never shown. One of these per client, made when
// the seat arrives on its scene and closed when it leaves: `close` disposes the composer, the
// renderer and its WebGL context, then takes the canvas off the page.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { steps, type Plugins } from '#engine/browser.ts'

type V3 = [number, number, number]
export type Prefab = {
  camera: { fov: number; near: number; far: number; at: V3; look: V3 }
  pixelRatio?: number
  tone?: 'aces' | 'neutral' | 'none'
  exposure?: number
  shadows?: 'soft' | 'hard' | 'none'
  background?: THREE.ColorRepresentation
  transparent?: boolean
  ao?: { on?: boolean; radius: number; thickness: number; falloff: number; scale: number; intensity: number; samples: number }
  bloom?: { strength: number; radius: number; threshold: number }
  ssr?: Ssr
}
// Screen-space reflections (Reflections, the header).
export type Ssr = { steps: number; distance: number; thickness: number; roughness: number }
// A mesh's `userData.mirror` (Reflections, the header).
export type Mirror = { resolution: number }
type Stage = 'vertex' | 'fragment'
export type Splice = { uniforms?: Record<string, THREE.IUniform>; vertex?: Record<string, string>; fragment?: Record<string, string> }
// A pass another plugin draws the frame through, handed the depth the scene was drawn with.
export type Effect = Pass & { depth?: THREE.DepthTexture | null }

const TONES = { aces: THREE.ACESFilmicToneMapping, neutral: THREE.NeutralToneMapping, none: THREE.NoToneMapping }
const SHADOWS = { soft: THREE.PCFShadowMap, hard: THREE.BasicShadowMap }
// The values `tone` and `shadows` take.
export const tones = Object.keys(TONES) as NonNullable<Prefab['tone']>[]
export const shadowings = [...Object.keys(SHADOWS), 'none'] as NonNullable<Prefab['shadows']>[]

// What every dressed program is given before its surface: the world position of the fragment.
const WORLD: Splice = {
  vertex: {
    common: 'varying vec3 vDressWorld;',
    project_vertex: [
      'vec4 dressWorld = vec4( transformed, 1.0 );',
      '#ifdef USE_BATCHING',
      '  dressWorld = batchingMatrix * dressWorld;',
      '#endif',
      '#ifdef USE_INSTANCING',
      '  dressWorld = instanceMatrix * dressWorld;',
      '#endif',
      'vDressWorld = ( modelMatrix * dressWorld ).xyz;',
    ].join('\n'),
  },
  fragment: { common: 'varying vec3 vDressWorld;' },
}

// A number from 0 to 1 that changes from pixel to pixel with no pattern the eye picks up.
const JITTER = 'float rdJitter( vec2 p ) { return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) ); }'

// Screen-space reflections, the last of every dressed program's splices, where three adds an envMap's
// light (`lights_fragment_maps`), in the shaders that take light from round them (standard and
// physical): a surface smoother than `roughness` traces its reflected ray through the world and finds,
// through the last frame's camera, where it passes behind the last frame's depth; the last frame's
// colour there, read blurred by the surface's roughness, takes the place of the reflection the surface
// had (a probe's, an envMap's, or none), faded as the surface nears `roughness` and as the point nears
// the frame's edge. A ray that meets nothing keeps the reflection there was.
const SSR: Splice = {
  fragment: {
    common: `
      uniform float uRdSsrOn; uniform highp sampler2D uRdSsrColour; uniform highp sampler2D uRdSsrDepth;
      uniform mat4 uRdSsrPrevView; uniform mat4 uRdSsrPrevProj; uniform mat4 uRdSsrCamera;
      uniform float uRdSsrSteps; uniform float uRdSsrDistance; uniform float uRdSsrThickness; uniform float uRdSsrRough; uniform float uRdSsrMips;
      ${JITTER}
      // where world point q falls in the last frame, its uv and how far behind the last frame's depth
      // there it is (its distance from that camera less the depth's), and false off that frame
      bool rdSsrAt( vec3 q, out vec2 uv, out float behind ) {
        vec4 v = uRdSsrPrevView * vec4( q, 1.0 );
        vec4 c = uRdSsrPrevProj * v;
        if ( c.w <= 0.0 ) return false;
        uv = c.xy / c.w * 0.5 + 0.5;
        if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return false;
        behind = - v.z - texture2D( uRdSsrDepth, uv ).r;
        return true;
      }`,
    '?lights_fragment_maps': `
      #if defined( RE_IndirectSpecular )
      if ( uRdSsrOn > 0.5 && material.roughness < uRdSsrRough ) {
        vec3 rdFrom = ( uRdSsrCamera * vec4( geometryPosition, 1.0 ) ).xyz;
        vec3 rdWay = normalize( ( uRdSsrCamera * vec4( reflect( - geometryViewDir, geometryNormal ), 0.0 ) ).xyz );
        float rdStride = uRdSsrDistance / uRdSsrSteps;
        float rdT = rdStride * ( 0.5 + rdJitter( gl_FragCoord.xy ) );
        float rdLast = 0.0;
        vec2 rdUv = vec2( 0.0 );
        float rdHit = 0.0;
        for ( int i = 0; i < 256; i ++ ) {
          if ( float( i ) >= uRdSsrSteps ) break;
          float behind;
          if ( !rdSsrAt( rdFrom + rdWay * rdT, rdUv, behind ) ) break;
          if ( behind > 0.0 && behind < uRdSsrThickness ) {
            // halved back and forth between the last step in front and this one behind
            float lo = rdLast, hi = rdT;
            for ( int j = 0; j < 6; j ++ ) {
              float mid = 0.5 * ( lo + hi );
              vec2 u; float b;
              if ( rdSsrAt( rdFrom + rdWay * mid, u, b ) && b > 0.0 ) { hi = mid; rdUv = u; } else lo = mid;
            }
            vec2 edge = min( rdUv, 1.0 - rdUv );
            rdHit = smoothstep( 0.0, 0.08, min( edge.x, edge.y ) ) * ( 1.0 - rdT / uRdSsrDistance );
            break;
          }
          rdLast = rdT;
          rdT += rdStride;
        }
        if ( rdHit > 0.0 ) {
          vec3 rdSeen = textureLod( uRdSsrColour, rdUv, material.roughness * uRdSsrMips ).rgb;
          radiance = mix( radiance, rdSeen, rdHit * ( 1.0 - smoothstep( 0.5 * uRdSsrRough, uRdSsrRough, material.roughness ) ) );
        }
      }
      #endif`,
  },
}

// A mirror's reflection, after everything else where three adds an envMap's light: the picture drawn
// from the mirrored camera, read where the fragment falls in it, blurred by the surface's roughness, as
// its whole reflection. The surface's colour, metalness and roughness work on it as on any light round it.
const MIRROR = `
      #if defined( RE_IndirectSpecular )
      vec4 rdMirrorAt = uRdMirrorMatrix * vec4( vDressWorld, 1.0 );
      radiance = textureLod( uRdMirror, rdMirrorAt.xy / rdMirrorAt.w, material.roughness * uRdMirrorMips ).rgb;
      #endif`

// The frame as the scene and its effects left it, kept for the next frame's screen-space reflections:
// its colour, with mips to read a rough surface's blurred reflection from, and each pixel's distance
// along the view from the camera, with the camera's view and projection as they were. It draws nothing
// into the frame.
class HistoryPass extends Pass {
  colour: THREE.WebGLRenderTarget
  depth: THREE.WebGLRenderTarget
  view = new THREE.Matrix4()
  projection = new THREE.Matrix4()
  // whether a frame has been kept yet
  kept = false
  frameDepth: THREE.DepthTexture | null = null
  private copy: THREE.ShaderMaterial
  private far: THREE.ShaderMaterial
  private quad: FullScreenQuad
  constructor(private camera: THREE.PerspectiveCamera) {
    super()
    this.needsSwap = false
    const target = (format: THREE.PixelFormat, mips: boolean) => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, format, depthBuffer: false, generateMipmaps: mips,
      minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter, magFilter: mips ? THREE.LinearFilter : THREE.NearestFilter,
    })
    this.colour = target(THREE.RGBAFormat, true)
    this.depth = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, format: THREE.RedFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
    const vertexShader = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }'
    this.copy = new THREE.ShaderMaterial({ uniforms: { src: { value: null } }, vertexShader, fragmentShader: 'uniform sampler2D src;\nvarying vec2 vUv;\nvoid main() { gl_FragColor = texture2D( src, vUv ); }', depthTest: false, depthWrite: false })
    this.far = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, cameraNear: { value: 0.1 }, cameraFar: { value: 1000 } },
      vertexShader,
      fragmentShader: [
        '#include <packing>',
        'uniform sampler2D tDepth; uniform float cameraNear; uniform float cameraFar;',
        'varying vec2 vUv;',
        'void main() {',
        '  float d = texture2D( tDepth, vUv ).x;',
        '  #ifdef USE_REVERSED_DEPTH_BUFFER',
        '  bool sky = d <= 0.0;',
        '  #else',
        '  bool sky = d >= 1.0;',
        '  #endif',
        '  gl_FragColor = vec4( sky ? 1e9 : - perspectiveDepthToViewZ( d, cameraNear, cameraFar ), 0.0, 0.0, 1.0 );',
        '}',
      ].join('\n'),
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.copy)
  }
  setSize(width: number, height: number) {
    this.colour.setSize(width, height)
    this.depth.setSize(width, height)
  }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    this.copy.uniforms.src.value = read.texture
    this.quad.material = this.copy
    renderer.setRenderTarget(this.colour)
    this.quad.render(renderer)
    const u = this.far.uniforms
    u.tDepth.value = this.frameDepth
    u.cameraNear.value = this.camera.near
    u.cameraFar.value = this.camera.far
    this.quad.material = this.far
    renderer.setRenderTarget(this.depth)
    this.quad.render(renderer)
    this.view.copy(this.camera.matrixWorldInverse)
    this.projection.copy(this.camera.projectionMatrix)
    this.kept = true
  }
  dispose() {
    this.colour.dispose()
    this.depth.dispose()
    this.copy.dispose()
    this.far.dispose()
    this.quad.dispose()
  }
}

// The part of a surface that makes a program, as text: its glsl and its uniform names. Two surfaces
// share a program only when this text is the same.
const text = (s: Splice | undefined) => (s ? JSON.stringify([s.vertex ?? {}, s.fragment ?? {}, Object.keys(s.uniforms ?? {})]) : '')

// Three's GTAOPass reading the depth it is handed, with no normals, and holding only what it draws
// with. Three's own, made with no depth, builds a target of normals with a depth texture of its own
// to draw the scene into a second time, and keeps it, sized and unused, once it is handed a depth;
// made with a depth, it reads that target's depth texture anyway and throws. So this one takes its
// depth only through `setGBuffer`, builds no such target, sizes the two targets it draws into, and
// disposes everything it holds, its AO and blend materials too, which three's own leaves.
class DepthAO extends GTAOPass {
  setGBuffer(depth?: THREE.DepthTexture) {
    (this as unknown as { _renderGBuffer: boolean })._renderGBuffer = false
    if (depth) this.depthTexture = depth
    for (const m of [this.gtaoMaterial, this.pdMaterial]) {
      m.defines.NORMAL_VECTOR_TYPE = 0
      m.defines.DEPTH_SWIZZLING = 'x'
      m.uniforms.tNormal.value = null
      m.uniforms.tDepth.value = depth ?? null
    }
    this.depthRenderMaterial.uniforms.tDepth.value = depth ?? null
  }
  setSize(width: number, height: number) {
    this.width = width
    this.height = height
    this.gtaoRenderTarget.setSize(width, height)
    this.pdRenderTarget.setSize(width, height)
    this.gtaoMaterial.uniforms.resolution.value.set(width, height)
    this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix)
    this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)
    this.pdMaterial.uniforms.resolution.value.set(width, height)
    this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)
  }
  dispose() {
    this.gtaoNoiseTexture.dispose()
    this.pdNoiseTexture.dispose()
    this.gtaoRenderTarget.dispose()
    this.pdRenderTarget.dispose()
    for (const m of [this.gtaoMaterial, this.normalMaterial, this.pdMaterial, this.depthRenderMaterial, this.copyMaterial, this.blendMaterial]) m.dispose()
    ;(this as unknown as { _fsQuad: { dispose(): void } })._fsQuad.dispose()
  }
}

// The overlay's camera put where the main camera stands, with its own near and far.
const follow = (overlay: THREE.PerspectiveCamera, camera: THREE.PerspectiveCamera) => {
  camera.updateMatrixWorld()
  camera.matrixWorld.decompose(overlay.position, overlay.quaternion, overlay.scale)
  overlay.fov = camera.fov
  overlay.aspect = camera.aspect
  overlay.zoom = camera.zoom
  overlay.updateMatrixWorld()
  overlay.updateProjectionMatrix()
}

// The overlay drawn over what the passes before it drew, into the same target, the depth cleared
// first. Three's RenderPass clears the depth of whatever target was bound before it binds its own,
// so it cannot do this.
class OverlayPass extends Pass {
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    super()
    this.needsSwap = false
  }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    if (!this.scene.children.length) return
    const was = renderer.autoClear
    renderer.autoClear = false
    renderer.setRenderTarget(this.renderToScreen ? null : read)
    renderer.clearDepth()
    renderer.render(this.scene, this.camera)
    renderer.autoClear = was
  }
}

// Each part's glsl right after the chunk it names, the parts in the order given; a `?chunk` only
// where the shader includes it.
const insert = (src: string, stage: Stage, parts: [string, Splice][]) => {
  const at = new Map<string, string[]>()
  for (const [key, part] of parts) {
    for (const [name, glsl] of Object.entries(part[stage] ?? {})) {
      const optional = name.startsWith('?'), chunk = optional ? name.slice(1) : name
      if (!src.includes(`#include <${chunk}>`)) {
        if (optional) continue
        throw new Error(`render3d: ${key} goes after #include <${chunk}>, which this ${stage} shader does not include`)
      }
      at.set(chunk, [...(at.get(chunk) ?? []), glsl])
    }
  }
  for (const [chunk, glsl] of at) src = src.replace(`#include <${chunk}>`, () => [`#include <${chunk}>`, ...glsl].join('\n'))
  return src
}

// Where a frame drew things (`drew`): the camera; each object tagged with the row it draws,
// `userData.row`, by that row's id; and every other mesh by its three.js id.
type Drawn = { camera: number[]; rows: Record<number, number[]>; meshes: Record<number, number[]> }
// An object that stopped being drawn between the steps (`drifted`).
export type Drift = { object: THREE.Object3D; path: string; step: number; was: number[]; now: number[] }

export function render3d() {
  const scene = new THREE.Scene()
  const overlay = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() }
  // Shaders compiled before the first draw: each object put into the scene or the overlay and not yet
  // compiled, with the scene it is in; and each one compiling, with the materials it still waits on.
  const fresh = new Map<THREE.Object3D, THREE.Scene>()
  const compiling = new Map<THREE.Object3D, { scene: THREE.Scene; waiting: Set<THREE.Material> }>()
  const unready: THREE.Object3D[] = [] // what this frame's draws leave out, made visible again after
  const hooked: [THREE.Scene, THREE.Scene['onBeforeRender']][] = [] // each scene's own hook, put back after the frame
  // What was put into scene `s` since it was last drawn compiled in one call, as the draw now under way
  // has the lights (three walks the whole scene for its lights once a call, so a call an object would
  // walk it once an object); and everything of `s` still compiling left out of this frame's draws.
  const warm = (r: THREE.WebGLRenderer, s: THREE.Scene, cam: THREE.Camera) => {
    const put = [...fresh].filter(([, at]) => at === s).map(([o]) => o)
    if (put.length) {
      const all = {
        traverse: (f: (o: THREE.Object3D) => void) => { for (const o of put) o.traverse(f) },
        traverseVisible: (f: (o: THREE.Object3D) => void) => { for (const o of put) o.traverseVisible(f) },
      }
      // three's compile reads nothing of the object it is handed but these two walks
      r.compile(all as unknown as THREE.Object3D, cam, s)
      for (const o of put) {
        fresh.delete(o)
        const materials = new Set<THREE.Material>()
        o.traverse(c => { for (const m of [(c as THREE.Mesh).material ?? []].flat()) materials.add(m) })
        compiling.set(o, { scene: s, waiting: materials })
      }
    }
    for (const [o, { scene: at, waiting }] of compiling) {
      if (at !== s) continue
      for (const m of waiting) {
        // three keeps each material's program in its properties, whose type it leaves open
        const program = (r.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram
        if (program === undefined || program.isReady()) waiting.delete(m)
      }
      if (!waiting.size) compiling.delete(o)
      else if (o.visible) {
        o.visible = false
        unready.push(o)
      }
    }
  }
  for (const s of [scene, overlay.scene]) {
    s.addEventListener('childadded', ({ child }) => { fresh.set(child, s) })
    s.addEventListener('childremoved', ({ child }) => {
      fresh.delete(child)
      compiling.delete(child)
    })
  }
  const splices = new Map<string, Splice>()
  const effects = new Map<string, Effect>()
  const finishes = new Map<string, Pass>()
  // What `ratio` last asked for, or undefined for the prefab's.
  let drawn: { r: number; look: 'smooth' | 'blocks' } | undefined
  const dressed = new Set<THREE.Material>()
  let prefab: Prefab | undefined
  let size: [number, number] = [0, 0]
  let mounted: HTMLCanvasElement | undefined
  let renderer: THREE.WebGLRenderer | undefined
  let post: { composer: EffectComposer; gtao?: DepthAO; history?: HistoryPass; own: Pass[] } | undefined
  let holder: unknown
  // render3d's own splices, after every other plugin's: the screen-space reflections, when the prefab
  // asks for them.
  const late = new Map<string, Splice>()
  const ssrUniforms: Record<string, THREE.IUniform> = {
    uRdSsrOn: { value: 0 }, uRdSsrColour: { value: null }, uRdSsrDepth: { value: null },
    uRdSsrPrevView: { value: new THREE.Matrix4() }, uRdSsrPrevProj: { value: new THREE.Matrix4() }, uRdSsrCamera: { value: new THREE.Matrix4() },
    uRdSsrSteps: { value: 1 }, uRdSsrDistance: { value: 1 }, uRdSsrThickness: { value: 1 }, uRdSsrRough: { value: 1 }, uRdSsrMips: { value: 0 },
  }
  // Each mirror: the picture drawn from its mirrored camera, that camera, and its material's uniforms;
  // and each mirror's material, the splice it reads its picture by.
  const mirrors = new Map<THREE.Mesh, { target: THREE.WebGLRenderTarget; camera: THREE.PerspectiveCamera; uniforms: Record<string, THREE.IUniform> }>()
  const mirrored = new Map<THREE.Material, Splice>()
  // Whoever `drew` hands each frame's drawn places to.
  const watchers = new Set<(drawn: Drawn) => void>()
  // Whoever `drifted` hands each drifting object to, every object's place on the frame of the newest
  // step, the step that was, and the objects already handed over in it.
  const drifts = new Set<(d: Drift) => void>()
  let noted = new Map<THREE.Object3D, number[]>()
  let notedAt = -1
  let told = new Set<THREE.Object3D>()
  const pathOf = (o: THREE.Object3D) => {
    const names: string[] = []
    for (let p: THREE.Object3D | null = o; p && p !== scene && p !== overlay.scene; p = p.parent) names.unshift(p.name || p.type)
    return names.join(' > ')
  }
  const sameAs = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])
  // The wire as this frame's tick found it, which says the step drawn and how far past it the page is.
  let wire: Plugins['wire'] | undefined
  // Every object's and the camera's position, turn and scale after the last two steps (Between steps).
  const read = (o: THREE.Object3D) => [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()]
  const write = (o: THREE.Object3D, p: number[]) => { o.position.fromArray(p, 0); o.quaternion.fromArray(p, 3); o.scale.fromArray(p, 7) }
  // Each object last seen with `userData.teleport` up, and the step it was seen on (Between steps).
  const teleported = new Map<THREE.Object3D, number>()
  const between = steps<THREE.Object3D>(
    read,
    write,
    (a, b, f) => {
      const out = a.map((x, i) => x + (b[i] - x) * f)
      THREE.Quaternion.slerpFlat(out, 3, a, 3, b, 3, f)
      return out
    },
    (o, on) => { if (on !== undefined) o.visible = on; return o.visible },
  )

  // The prefab's AO while it is on, undefined while it is off or left out.
  const aoOf = (p: Prefab) => (p.ao?.on ? p.ao : undefined)

  // The pixels drawn per canvas pixel: what `ratio` asked for, else the prefab's capped at the screen's,
  // else one.
  const ratioOf = (p: Prefab) => drawn?.r ?? (p.pixelRatio !== undefined ? Math.min(devicePixelRatio, p.pixelRatio) : 1)
  // How the page shows the canvas's pixels.
  const show = () => { if (mounted) mounted.style.imageRendering = drawn?.look === 'blocks' ? 'pixelated' : '' }

  // The renderer, once there is both a canvas and a prefab: reversed depth is fixed when it is made.
  const make = () => {
    if (renderer || !mounted || !prefab) return
    const p = prefab
    const [width, height] = size
    const r = new THREE.WebGLRenderer({ canvas: mounted, reversedDepthBuffer: !!aoOf(p), alpha: !!p.transparent })
    if (p.transparent) r.setClearColor(0x000000, 0)
    r.setPixelRatio(ratioOf(p))
    r.setSize(width, height)
    if (p.tone !== undefined) r.toneMapping = TONES[p.tone]
    if (p.exposure !== undefined) r.toneMappingExposure = p.exposure
    if (p.shadows !== undefined && p.shadows !== 'none') {
      r.shadowMap.enabled = true
      r.shadowMap.type = SHADOWS[p.shadows]
    }
    renderer = r
    me.renderer = r
    compose()
  }

  // The composer, made again whenever an effect or a finish pass joins: the scene, the AO, every effect
  // in the order they joined, the overlay, the bloom, the tone mapping and every finish pass in the
  // order they joined. Its own passes are let go of when it is made again; an effect's and a finish
  // pass's stay, for the next one.
  const compose = () => {
    const p = prefab!, r = renderer!, ao = aoOf(p)
    const [width, height] = size
    if (post) {
      for (const pass of post.own) pass.dispose()
      post.composer.dispose()
      post = undefined
    }
    if (!ao && !p.bloom && !effects.size && !finishes.size && !p.ssr) return
    // With AO, an effect or screen-space reflections the scene is drawn into a target carrying the
    // depth they read; without, the composer's own half-float targets.
    const composer = ao || effects.size || p.ssr
      ? new EffectComposer(r, new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType) }))
      : new EffectComposer(r)
    composer.setSize(width, height)
    const own: Pass[] = [new RenderPass(scene, me.camera!)]
    composer.addPass(own[0])
    let gtao: DepthAO | undefined
    if (ao) {
      gtao = new DepthAO(scene, me.camera!, width * r.getPixelRatio(), height * r.getPixelRatio())
      const { radius, thickness, falloff, scale, intensity, samples } = ao
      gtao.updateGtaoMaterial({ radius, thickness, distanceFallOff: falloff, scale, samples })
      gtao.blendIntensity = intensity
      composer.addPass(gtao)
      own.push(gtao)
    }
    for (const effect of effects.values()) {
      effect.setSize(width * r.getPixelRatio(), height * r.getPixelRatio())
      composer.addPass(effect)
    }
    // the frame as the scene and its effects left it, kept for the next frame's reflections
    let history: HistoryPass | undefined
    if (p.ssr) {
      history = new HistoryPass(me.camera!)
      history.setSize(width * r.getPixelRatio(), height * r.getPixelRatio())
      composer.addPass(history)
      own.push(history)
    }
    const after: Pass[] = [new OverlayPass(overlay.scene, overlay.camera)]
    if (p.bloom) {
      const { strength, radius, threshold } = p.bloom
      after.push(new UnrealBloomPass(new THREE.Vector2(width * r.getPixelRatio(), height * r.getPixelRatio()), strength, radius, threshold))
    }
    after.push(new OutputPass())
    for (const pass of after) composer.addPass(pass)
    for (const finish of finishes.values()) {
      finish.setSize(width * r.getPixelRatio(), height * r.getPixelRatio())
      composer.addPass(finish)
    }
    post = { composer, gtao, history, own: [...own, ...after] }
  }

  // The camera reflected in a mirror's plane (its face is its local +z), as three's Reflector reflects
  // it: its place, the point it looks at and its up each mirrored. False when the camera stands behind
  // the mirror, which then shows nothing new.
  const at = new THREE.Vector3(), eye = new THREE.Vector3(), normal = new THREE.Vector3(), look = new THREE.Vector3(), turn = new THREE.Matrix4()
  const reflected = (mesh: THREE.Mesh, camera: THREE.PerspectiveCamera, into: THREE.PerspectiveCamera) => {
    at.setFromMatrixPosition(mesh.matrixWorld)
    eye.setFromMatrixPosition(camera.matrixWorld)
    turn.extractRotation(mesh.matrixWorld)
    normal.set(0, 0, 1).applyMatrix4(turn)
    const toward = at.clone().sub(eye)
    if (toward.dot(normal) > 0) return false
    into.position.copy(toward.reflect(normal).negate().add(at))
    turn.extractRotation(camera.matrixWorld)
    look.set(0, 0, -1).applyMatrix4(turn).add(eye)
    const target = at.clone().sub(look).reflect(normal).negate().add(at)
    into.up.set(0, 1, 0).applyMatrix4(turn).reflect(normal)
    into.lookAt(target)
    into.near = camera.near
    into.far = camera.far
    into.updateMatrixWorld()
    into.projectionMatrix.copy(camera.projectionMatrix)
    into.projectionMatrixInverse.copy(camera.projectionMatrixInverse)
    return true
  }

  // Every mirror of the scene drawn: each visible mesh with `userData.mirror` gets a picture of its own
  // the frame's size times its `resolution`, and its material the splice that reads it, the first frame
  // it is seen; then the scene, the mirror hidden and everything behind its plane clipped away, is
  // drawn from the reflected camera into it. A mirror gone from the scene lets its picture go.
  const reflect = (r: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
    const seen = new Set<THREE.Mesh>()
    scene.traverseVisible(o => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.userData.mirror) seen.add(m)
    })
    for (const [mesh, held] of mirrors) {
      if (seen.has(mesh)) continue
      held.target.dispose()
      mirrors.delete(mesh)
    }
    if (!seen.size) return
    const buffer = r.getDrawingBufferSize(new THREE.Vector2())
    const was = r.getRenderTarget(), planes = r.clippingPlanes
    try {
      for (const mesh of seen) {
        const m = mesh.userData.mirror as Mirror
        if (!(m.resolution > 0 && m.resolution <= 1)) throw new Error(`render3d mirror ${mesh.name || mesh.id} has a resolution of ${m.resolution}, and it is above 0 and no more than 1`)
        if (Array.isArray(mesh.material)) throw new Error(`render3d mirror ${mesh.name || mesh.id} has more than one material, and a mirror reads its picture through one`)
        const w = Math.max(1, Math.round(buffer.x * m.resolution)), h = Math.max(1, Math.round(buffer.y * m.resolution))
        let held = mirrors.get(mesh)
        if (!held) {
          const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter })
          held = { target, camera: new THREE.PerspectiveCamera(), uniforms: { uRdMirror: { value: target.texture }, uRdMirrorMatrix: { value: new THREE.Matrix4() }, uRdMirrorMips: { value: Math.log2(Math.max(w, h)) } } }
          mirrors.set(mesh, held)
        }
        if (held.target.width !== w || held.target.height !== h) {
          held.target.setSize(w, h)
          held.uniforms.uRdMirrorMips.value = Math.log2(Math.max(w, h))
        }
        const material = mesh.material as THREE.Material
        const owner = [...mirrors].find(([other, h]) => other !== mesh && mirrored.get(material)?.uniforms === h.uniforms)
        if (owner) throw new Error(`render3d mirrors ${mesh.name || mesh.id} and ${owner[0].name || owner[0].id} share a material, and each mirror reads its own picture through its own`)
        if (!mirrored.has(material)) {
          mirrored.set(material, {
            uniforms: held.uniforms,
            fragment: { common: 'uniform highp sampler2D uRdMirror; uniform mat4 uRdMirrorMatrix; uniform float uRdMirrorMips;', '?lights_fragment_maps': MIRROR },
          })
          if (!dressed.has(material)) me.dress(material)
          material.needsUpdate = true
        }
        if (!reflected(mesh, camera, held.camera)) continue
        held.camera.layers.mask = camera.layers.mask
        // from the world to the picture's uv: its projection and view, from -1..1 to 0..1
        held.uniforms.uRdMirrorMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
          .multiply(held.camera.projectionMatrix).multiply(held.camera.matrixWorldInverse)
        r.clippingPlanes = [new THREE.Plane().setFromNormalAndCoplanarPoint(normal, at)]
        mesh.visible = false
        r.setRenderTarget(held.target)
        r.render(scene, held.camera)
        mesh.visible = true
      }
    } finally {
      r.clippingPlanes = planes
      r.setRenderTarget(was)
    }
  }

  const me = {
    THREE,
    GLTFLoader,
    SkeletonUtils,
    scene,
    overlay,
    canvas: undefined as HTMLCanvasElement | undefined,
    camera: undefined as THREE.PerspectiveCamera | undefined,
    renderer: undefined as THREE.WebGLRenderer | undefined,
    get composer(): EffectComposer | undefined { return post?.composer },
    mount(canvas: HTMLCanvasElement) {
      canvas.style.display = 'none'
      me.canvas = canvas
      mounted = canvas
      show()
      make()
    },
    tick(plugins: Plugins) {
      wire = plugins.wire
      if (prefab) return
      const p = plugins.wire.scene.prefabs.render3d as Prefab | undefined
      if (!p) return
      if (!p.camera) throw new Error('the render3d prefab has no camera')
      if (p.tone !== undefined && !Object.hasOwn(TONES, p.tone)) throw new Error(`render3d tone ${p.tone} is none of ${tones.join(', ')}`)
      if (p.shadows !== undefined && p.shadows !== 'none' && !Object.hasOwn(SHADOWS, p.shadows)) throw new Error(`render3d shadows ${p.shadows} is none of ${shadowings.join(', ')}`)
      if (p.ssr) {
        const s = p.ssr
        if (!(Number.isInteger(s.steps) && s.steps > 0 && s.steps <= 256)) throw new Error(`render3d ssr steps ${s.steps} is not a whole number from 1 to 256`)
        if (!(s.distance > 0)) throw new Error(`render3d ssr distance ${s.distance} is not above 0`)
        if (!(s.thickness > 0)) throw new Error(`render3d ssr thickness ${s.thickness} is not above 0`)
        if (!(s.roughness > 0 && s.roughness <= 1)) throw new Error(`render3d ssr roughness ${s.roughness} is not above 0 and no more than 1`)
      }
      const { width, height } = plugins.wire.scene.prefabs.engine
      size = [width, height]
      const { fov, near, far, at, look } = p.camera
      const camera = new THREE.PerspectiveCamera(fov, width / height, near, far)
      camera.position.fromArray(at)
      camera.lookAt(...look)
      me.camera = camera
      if (p.background !== undefined && p.transparent) throw new Error('render3d: a transparent scene is cleared to nothing, and this one gives a background too')
      if (p.background !== undefined) scene.background = new THREE.Color(p.background)
      if (p.ssr) {
        late.set('ssr', { ...SSR, uniforms: ssrUniforms })
        for (const m of dressed) m.needsUpdate = true
      }
      prefab = p
      make()
    },
    // An object already in the scene or the overlay, given a material it has not been drawn with, is
    // compiled as one just put in: left out of every draw until its programs are ready.
    prepare(o: THREE.Object3D) {
      let root: THREE.Object3D = o
      while (root.parent) root = root.parent
      const s = root === scene ? scene : root === overlay.scene ? overlay.scene : undefined
      if (!s) throw new Error('render3d prepares only what is in its scene or its overlay')
      fresh.set(o, s)
    },
    // How many objects are waiting to compile or compiling: what a loading screen waits on. None where
    // nothing is compiled ahead, with no renderer or no `KHR_parallel_shader_compile`.
    compiling(): number {
      return renderer && renderer.extensions.get('KHR_parallel_shader_compile') !== null ? fresh.size + compiling.size : 0
    },
    project(p: number[]): { x: number; y: number; behind: boolean } {
      const camera = me.camera
      if (!camera) throw new Error('render3d has no camera: it has not ticked, or the scene gives no render3d prefab')
      camera.updateMatrixWorld()
      const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(camera.matrixWorldInverse)
      const along = -v.z
      v.applyMatrix4(camera.projectionMatrix)
      return { x: ((v.x + 1) / 2) * size[0], y: ((1 - v.y) / 2) * size[1], behind: !(along >= camera.near && along <= camera.far) }
    },
    splice(key: string, s: Splice) {
      if (splices.has(key)) throw new Error(`render3d already has the splice ${key}`)
      splices.set(key, s)
      for (const m of dressed) m.needsUpdate = true
    },
    pass(key: string, effect: Effect) {
      if (effects.has(key)) throw new Error(`render3d already has the pass ${key}`)
      effects.set(key, effect)
      if (renderer) compose()
    },
    finish(key: string, pass: Pass) {
      if (finishes.has(key)) throw new Error(`render3d already has the finish pass ${key}`)
      finishes.set(key, pass)
      if (renderer) compose()
    },
    ratio(r?: number, look: 'smooth' | 'blocks' = 'smooth') {
      if (r !== undefined && !(r > 0)) throw new Error(`render3d ratio ${r} is not above 0`)
      drawn = r === undefined ? undefined : { r, look }
      show()
      if (!renderer || !prefab) return
      const to = ratioOf(prefab)
      renderer.setPixelRatio(to)
      renderer.setSize(size[0], size[1])
      post?.composer.setPixelRatio(to)
    },
    dress<M extends THREE.Material>(material: M, { surface }: { surface?: Splice } = {}): M {
      const own = text(surface)
      material.onBeforeCompile = shader => {
        const mirror = mirrored.get(material)
        const parts: [string, Splice][] = [
          ['vDressWorld', WORLD], ...(surface ? [['the surface', surface] as [string, Splice]] : []), ...splices, ...late,
          ...(mirror ? [['the mirror', mirror] as [string, Splice]] : []),
        ]
        for (const [, part] of parts) Object.assign(shader.uniforms, part.uniforms)
        shader.vertexShader = insert(shader.vertexShader, 'vertex', parts)
        shader.fragmentShader = insert(shader.fragmentShader, 'fragment', parts)
      }
      material.customProgramCacheKey = () => [...splices.keys(), ...late.keys(), own, mirrored.has(material) ? 'mirror' : ''].join('|')
      if (!dressed.has(material)) {
        dressed.add(material)
        const drop = () => { dressed.delete(material); material.removeEventListener('dispose', drop) }
        material.addEventListener('dispose', drop)
      }
      material.needsUpdate = true
      return material
    },
    claim(owner: unknown) {
      if (holder !== undefined && holder !== owner) return false
      holder = owner
      return true
    },
    release(owner: unknown) { if (holder === owner) holder = undefined },
    claimed() { return holder },
    // `drew(f)`: `f` is handed, every frame, where each mesh of the scene and the camera stand as they
    // are drawn, between the steps, in the world, by the object's three.js id; whether or not there is
    // a canvas to draw on, so a page on node is measured as a page in a browser is drawn. It hands back
    // a function that stops it.
    // `drifted(f)`: `f` is handed each object the moment it stops being drawn between the steps, once
    // per step it drifts in (the header's `drifted`). It hands back a function that stops it.
    drifted(f: (d: Drift) => void) {
      drifts.add(f)
      if (drifts.size === 1) notedAt = -1
      return () => { drifts.delete(f) }
    },
    drew(f: (drawn: Drawn) => void) {
      watchers.add(f)
      return () => { watchers.delete(f) }
    },
    afterTick() {
      if (me.canvas) me.canvas.style.display = ''
      if (!me.camera || (!renderer && !watchers.size)) return
      const camera = me.camera
      if (wire) {
        const things: THREE.Object3D[] = [camera]
        scene.traverse(o => { if (o !== camera) things.push(o) })
        overlay.scene.traverse(o => { things.push(o) })
        const n = wire.n
        for (const o of things) if (o.userData.teleport === true) teleported.set(o, n)
        for (const [o, at] of teleported) if (at !== n) teleported.delete(o)
        const put = [...teleported.keys()].map(o => [o, read(o)] as const)
        if (drifts.size) {
          if (n !== notedAt) {
            noted = new Map(things.map(o => [o, read(o)]))
            notedAt = n
            told = new Set()
          } else {
            for (const o of things) {
              const was = noted.get(o)
              if (!was || told.has(o) || teleported.has(o)) continue
              const now = read(o)
              if (sameAs(was, now)) continue
              told.add(o)
              for (const f of drifts) f({ object: o, path: pathOf(o), step: n, was, now })
            }
          }
        }
        between.place(things, wire)
        for (const [o, p] of put) write(o, p)
      }
      try {
        if (watchers.size) {
          scene.updateMatrixWorld()
          camera.updateMatrixWorld()
          const at = new THREE.Vector3()
          const meshes: Record<number, number[]> = {}
          const rows: Record<number, number[]> = {}
          scene.traverseVisible(o => {
            const row = o.userData.row
            if (typeof row === 'number') rows[row] = o.getWorldPosition(at).toArray()
            else if ((o as THREE.Mesh).isMesh) meshes[o.id] = o.getWorldPosition(at).toArray()
          })
          const drawn = { camera: camera.getWorldPosition(at).toArray(), rows, meshes }
          for (const f of watchers) f(drawn)
        }
        if (!renderer) return
        if (overlay.scene.children.length) follow(overlay.camera, camera)
        camera.updateMatrixWorld()
        // What was put in since the last frame starts compiling, and what is still compiling is out of
        // every draw of this frame: done the first time each scene is drawn this frame, last of its
        // `onBeforeRender`, so the lights are as the draw has them (lights3d takes its own out there).
        if (renderer.extensions.get('KHR_parallel_shader_compile') !== null) {
          for (const s of [scene, overlay.scene]) {
            const was = s.onBeforeRender
            hooked.push([s, was])
            s.onBeforeRender = function (r, s3, cam, target, material, group) {
              was.call(this, r, s3, cam, target, material, group)
              s.onBeforeRender = was
              warm(r, s, cam)
            }
          }
        } else fresh.clear()
        reflect(renderer, camera)
        // the screen-space reflections read the frame the history pass kept last frame, through the
        // camera it was drawn with, from where the camera stands now
        const history = post?.history
        if (history && prefab?.ssr) {
          const s = prefab.ssr, u = ssrUniforms
          u.uRdSsrOn.value = history.kept ? 1 : 0
          u.uRdSsrColour.value = history.colour.texture
          u.uRdSsrDepth.value = history.depth.texture
          u.uRdSsrPrevView.value.copy(history.view)
          u.uRdSsrPrevProj.value.copy(history.projection)
          u.uRdSsrCamera.value.copy(camera.matrixWorld)
          u.uRdSsrSteps.value = s.steps
          u.uRdSsrDistance.value = s.distance
          u.uRdSsrThickness.value = s.thickness
          u.uRdSsrRough.value = s.roughness
          u.uRdSsrMips.value = Math.log2(Math.max(history.colour.width, history.colour.height))
        }
        if (!post) {
          renderer.render(scene, camera)
          if (!overlay.scene.children.length) return
          const was = renderer.autoClear
          renderer.autoClear = false
          renderer.clearDepth()
          renderer.render(overlay.scene, overlay.camera)
          renderer.autoClear = was
          return
        }
        // The scene pass draws into the composer's read target, and the AO and every effect read that
        // target's depth.
        const depth = post.composer.readBuffer.depthTexture
        post.gtao?.setGBuffer(depth!)
        for (const effect of effects.values()) effect.depth = depth
        if (post.history) post.history.frameDepth = depth ?? null
        post.composer.render()
      } finally {
        for (const [s, was] of hooked.splice(0)) s.onBeforeRender = was
        for (const o of unready.splice(0)) o.visible = true
        between.restore()
      }
    },
    // The renderer lets go of everything it put on the GPU and of the WebGL context itself, and the
    // canvas leaves the page. `dispose` alone keeps the context until the canvas is collected.
    close() {
      if (post) {
        for (const pass of post.own) pass.dispose()
        post.composer.dispose()
        post = undefined
      }
      for (const effect of effects.values()) effect.dispose()
      effects.clear()
      for (const finish of finishes.values()) finish.dispose()
      finishes.clear()
      for (const held of mirrors.values()) held.target.dispose()
      mirrors.clear()
      mirrored.clear()
      fresh.clear()
      compiling.clear()
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = undefined
      me.renderer = undefined
      dressed.clear()
      me.canvas?.remove()
    },
  }
  return me
}
