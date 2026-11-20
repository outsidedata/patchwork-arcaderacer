// supershader3d's glowmap: the glow the camera sees, made each frame into one float texture another plugin lights the
// scene from (lights3d), so a thing glows and casts that glow by being drawn in a glowing material, with nothing
// placed by hand. The plugin makes it when the scene gives `world.supershader3d.glowmap`, `{ resolution, cells:
// [across, up] }`.
//
// Each frame the scene is drawn again through the camera, at `resolution` of the drawing buffer's width and height,
// into three targets at once: each pixel a glowing material covers, its glow times the piece of surface the pixel
// covers (its depth over the screen's height, through the field of view, squared, over how squarely it is seen, held
// from going past five times) with that area, the look read with nought screen derivatives so detail finer than the
// pass's pixels is counted whole, its place in the world and its facing (the side its front faces, turned to the
// camera where its back is seen); every other mesh draws nothing into them but stands in front of what is behind it,
// and every point, line and sprite is left out. A skinned, morphed or instanced mesh is drawn posed, as three draws it.
// Then the frame is cut into `cells`, and each cell summed: its glow's power, the area it covers, and the place and
// facing of its glowing pixels weighted by how bright each is. Glow behind something, or off the screen, is not in it.
//
// The texture, `cells` across × 3 texels by `cells` up, nearest filtered, float RGBA: cell (i, j) at x = i × 3, y = j:
// (its power, the area its glowing pixels cover), (its place, the weight of its pixels), (its facing, 0). A cell with
// no glow is nought.
//
// It is drawn inside the scene's draw through the camera that draws it, the outermost draw only (a draw inside it,
// lights3d's shadows or probes, finds it as it stands): the scene's own hooks are let alone while the glow pass draws
// it, so it draws only what it draws.
import type * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import type { Looks } from './supershader3d.plugin.ts'

export type GlowSettings = { resolution: number; cells: [number, number] }

// What a plugin lights from: the texture and its cells, across and up.
export type Glowmap = { texture: THREE.Texture; cells: [number, number] }

export function checkedGlow(s: GlowSettings) {
  if (!(s.resolution > 0 && s.resolution <= 1)) throw new Error(`supershader3d glowmap resolution ${s.resolution} is not above 0 and up to 1`)
  if (!(s.cells.length === 2 && s.cells.every(n => Number.isInteger(n) && n >= 1))) {
    throw new Error(`supershader3d glowmap cells ${JSON.stringify(s.cells)} are not two whole numbers from 1`)
  }
  return s
}

const QUAD = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }'

// The vertex side every mesh of the pass is drawn with: three's own skinning, morphing and instancing, then (for a
// material's mesh) the looks' own, with `lookTime` declared ahead of it as the plugin's materials declare it, so a
// look's vertex code that moves by the clock moves the same in the pass.
export const VERTEX = (looks?: Looks) => `
  #include <common>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>
  ${looks ? `uniform float lookTime;\n${looks.vertexPars}` : ''}
  varying vec3 glView;
  void main() {
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    #include <project_vertex>
    ${looks ? looks.vertexMain : ''}
    glView = mvPosition.xyz;
  }`

// A looks material's pixel: its glow times the surface it covers, its place, its facing.
const GLOWING = (pars: string) => `
  layout( location = 1 ) out highp vec4 glPlace;
  layout( location = 2 ) out highp vec4 glFacing;
  vec3 vNormal;
  vec3 vViewPosition;
  ${pars}
  varying vec3 glView;
  uniform float glPixel;
  void main() {
    // nought, so detail finer than this pass's pixels (a rune's stroke) still glows and is counted whole, not faded
    // out as the look fades what a pixel cannot show
    lookGx = vec2( 0.0 );
    lookGy = vec2( 0.0 );
    vNormal = normalize( mat3( viewMatrix ) * vLookWN );
    vViewPosition = - glView;
    Look k = lookRun( int( vLookId + 0.5 ) );
    vec3 n = normalize( vLookWN ) * ( gl_FrontFacing ? 1.0 : -1.0 );
    float seen = max( abs( dot( n, normalize( cameraPosition - vLookWorld ) ) ), 0.2 );
    float size = - glView.z * glPixel;
    float area = size * size / seen;
    gl_FragColor = vec4( k.glow * area, area );
    glPlace = vec4( vLookWorld, 1.0 );
    glFacing = vec4( n, 0.0 );
  }`

// Every other mesh's pixel: nothing, standing in front of what is behind it.
const DARK = `
  layout( location = 1 ) out highp vec4 glPlace;
  layout( location = 2 ) out highp vec4 glFacing;
  varying vec3 glView;
  void main() { gl_FragColor = vec4( 0.0 ); glPlace = vec4( 0.0 ); glFacing = vec4( 0.0 ); }`

// The cells: each the sum of its block of the pass's pixels.
const CELLS = `
  uniform highp sampler2D glPower;
  uniform highp sampler2D glPlaces;
  uniform highp sampler2D glFacings;
  uniform ivec2 glCells;
  void main() {
    ivec2 f = ivec2( gl_FragCoord.xy );
    int part = f.x % 3;
    ivec2 c = ivec2( f.x / 3, f.y );
    ivec2 size = textureSize( glPower, 0 );
    ivec2 lo = c * size / glCells, hi = ( c + 1 ) * size / glCells;
    vec3 power = vec3( 0.0 ), place = vec3( 0.0 ), facing = vec3( 0.0 );
    float area = 0.0, weight = 0.0;
    for ( int y = lo.y; y < hi.y; y ++ ) for ( int x = lo.x; x < hi.x; x ++ ) {
      vec4 p = texelFetch( glPower, ivec2( x, y ), 0 );
      float l = dot( p.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      if ( l <= 0.0 ) continue;
      power += p.rgb;
      area += p.a;
      place += texelFetch( glPlaces, ivec2( x, y ), 0 ).xyz * l;
      facing += texelFetch( glFacings, ivec2( x, y ), 0 ).xyz * l;
      weight += l;
    }
    if ( part == 0 ) gl_FragColor = vec4( power, area );
    else if ( part == 1 ) gl_FragColor = weight > 0.0 ? vec4( place / weight, weight ) : vec4( 0.0 );
    else gl_FragColor = vec4( length( facing ) > 0.0 ? normalize( facing ) : vec3( 0.0 ), 0.0 );
  }`

export function makeGlowmap(T: typeof THREE, settings: GlowSettings, looks: Looks, uniforms: Record<string, THREE.IUniform>, own: Set<THREE.Material>) {
  const s = checkedGlow(settings)
  const quad = new FullScreenQuad()
  // the cells' texture, made again when `cells` changes
  let target: THREE.WebGLRenderTarget | undefined
  // the pass's three targets, the looks' material and the dark one for each side, and the cells' pass
  let screen: THREE.WebGLRenderTarget | undefined
  const glowing = new Map<THREE.Side, THREE.ShaderMaterial>()
  const dark = new Map<THREE.Side, THREE.ShaderMaterial>()
  const cells = new T.ShaderMaterial({
    vertexShader: QUAD, fragmentShader: CELLS, depthTest: false, depthWrite: false,
    uniforms: { glPower: { value: null }, glPlaces: { value: null }, glFacings: { value: null }, glCells: { value: new T.Vector2(...s.cells) } },
  })
  const pixel = { value: 0 }
  const size = new T.Vector2()

  const glowFor = (side: THREE.Side) => {
    let m = glowing.get(side)
    if (!m) {
      m = new T.ShaderMaterial({ vertexShader: VERTEX(looks), fragmentShader: GLOWING(looks.calls.all!.fragmentPars), uniforms: { ...uniforms, glPixel: pixel }, side })
      glowing.set(side, m)
    }
    return m
  }
  const darkFor = (side: THREE.Side) => {
    let m = dark.get(side)
    if (!m) {
      m = new T.ShaderMaterial({ vertexShader: VERTEX(), fragmentShader: DARK, side })
      dark.set(side, m)
    }
    return m
  }

  // The cells' texture, `cells` across × 3 by `cells` up, made again where `cells` has changed.
  const sized = () => {
    const [across, up] = s.cells
    if (target && target.width === across * 3 && target.height === up) return target
    target?.dispose()
    target = new T.WebGLRenderTarget(across * 3, up, { type: T.FloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter, generateMipmaps: false, depthBuffer: false })
    return target
  }

  return {
    // The texture and its cells, or undefined before it has been drawn.
    map(): Glowmap | undefined {
      if (!target) return undefined
      return { texture: target.texture, cells: [s.cells[0], s.cells[1]] }
    },
    // Drawn for this frame: the scene drawn again through `camera` into the pass's three targets, then summed into the
    // cells. `resolution` and `cells` are read each frame.
    draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
      const was = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel()
      const auto = renderer.autoClear
      renderer.autoClear = false
      try {
        renderer.getDrawingBufferSize(size)
        const w = Math.max(1, Math.round(size.x * s.resolution)), h = Math.max(1, Math.round(size.y * s.resolution))
        if (!screen || screen.width !== w || screen.height !== h) {
          screen?.dispose()
          screen = new T.WebGLRenderTarget(w, h, { count: 3, type: T.FloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter, generateMipmaps: false, depthBuffer: true })
        }
        const p = (camera as THREE.PerspectiveCamera).projectionMatrix.elements
        // the world's height a pixel covers a metre away
        pixel.value = 2 / (p[5] * h)
        // every mesh in the pass's material, every other thing hidden, the scene's own hooks and backdrop let alone
        const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = []
        const hidden: THREE.Object3D[] = []
        scene.traverseVisible(o => {
          const m = o as THREE.Mesh
          if (m.isMesh) {
            swapped.push([m, m.material])
            const pick = (x: THREE.Material) => (own.has(x) ? glowFor(x.side) : darkFor(x.side))
            m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material)
          } else if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) {
            o.visible = false
            hidden.push(o)
          }
        })
        const { onBeforeRender, onAfterRender, background, environment, fog, overrideMaterial } = scene
        scene.onBeforeRender = () => {}
        scene.onAfterRender = () => {}
        scene.background = null
        scene.environment = null
        scene.fog = null
        scene.overrideMaterial = null
        const clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha()
        renderer.setRenderTarget(screen)
        renderer.setClearColor(0x000000, 0)
        renderer.clear()
        try {
          renderer.render(scene, camera)
        } finally {
          for (const [m, was] of swapped) m.material = was
          for (const o of hidden) o.visible = true
          Object.assign(scene, { onBeforeRender, onAfterRender, background, environment, fog, overrideMaterial })
          renderer.setClearColor(clear, alpha)
        }
        cells.uniforms.glPower.value = screen.textures[0]
        cells.uniforms.glPlaces.value = screen.textures[1]
        cells.uniforms.glFacings.value = screen.textures[2]
        ;(cells.uniforms.glCells.value as THREE.Vector2).set(s.cells[0], s.cells[1])
        renderer.setRenderTarget(sized())
        quad.material = cells
        quad.render(renderer)
      } finally {
        renderer.autoClear = auto
        renderer.setRenderTarget(was, face, level)
      }
    },
    dispose() {
      target?.dispose()
      screen?.dispose()
      cells.dispose()
      for (const m of [...glowing.values(), ...dark.values()]) m.dispose()
      quad.dispose()
    },
  }
}
