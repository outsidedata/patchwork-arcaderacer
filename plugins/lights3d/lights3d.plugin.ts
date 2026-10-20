// lights3d: every point light of render3d's scene drawn by clusters (Forward+), so a scene may hold
// as many as it likes. Three lights a fragment by looping over every light of the scene, each a
// uniform of every program; this takes the point lights off that loop and lights each fragment by the
// few that reach it. It has no row and no server half: its numbers are the scene's `world.lights3d`,
// read on its first tick:
//   grid     [across, up]: the cells the frame is cut into, across and up.
//   slices   the cells along the view, from the camera's `near` to its `far`, each the same ratio
//            deeper than the one before, so the cells near the eye are as shallow as they are wide.
// Each time the scene is drawn, as three calls the scene's `onBeforeRender` with the camera it draws
// through (render3d's own, and again for any other camera a pass draws the scene with), it:
//   1. takes every visible `PointLight` of the scene that casts no shadow and is on a layer the
//      camera sees, and turns its layers off, so three's own loop leaves it out. One that casts a
//      shadow is three's, as it always was, its layers given back if this had taken them. Anything
//      that reads the lights off the scene still finds them where they stand.
//   2. writes each one's place in view space, its `distance`, its colour times its `intensity` and
//      its `decay` into a float texture, two texels a light.
//   3. puts each light in every cell its sphere of `distance` metres reaches (one of no `distance`
//      reaches them all), each cell a box in view space, and writes each cell's run in one list of
//      light numbers, a texture of where each run starts and how long it is beside it.
// A splice (render3d's `splice`, under `lights3d`, `?lights_fragment_begin`: only into the shaders that
// light, Lambert, Phong, standard, physical and toon) then finds a fragment's cell by its pixel and its
// depth, and hands each light of the cell to the shader's own RE_Direct as three's own point light loop
// does, with three's own fall off: so each light is drawn as it would be in three's loop, standing
// with them before `lights_fragment_maps` and `lights_fragment_end`, where every later splice finds it
// as direct light. Where three's loop has no direct light to set it up, the splice sets up the
// standard material's multiple scattering itself. The scene's `onAfterRender` turns the splice off
// again, so the overlay, and any other scene drawn through the same renderer, is lit by its own lights
// alone. No texture has a fixed size: each grows to what the frame needs.
//
// It hands out `count`, the lights clustered the last time the scene was drawn, `entries`, the lights
// put in a cell, counted once a cell, and `cells`, the cells. It needs render3d, and is listed anywhere
// in `plugins`: its work is done as the scene is drawn. `close` gives every light it took its layers
// back, frees its textures and gives the scene its hooks back. One of these per client, as render3d is.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'

export type Settings = { grid: [number, number]; slices: number }

// The width of each texture, in texels: a run of lights, cells or entries wraps to the next row after
// this many. 1024 is under every WebGL2 renderer's least largest texture, 2048.
const ROW = 1024

// Throws naming the first number of `s` it cannot cut the frame by.
function checked(s: Settings | undefined): Settings {
  if (!s) throw new Error('the scene names lights3d but gives no world.lights3d')
  const whole = (n: unknown) => Number.isInteger(n) && (n as number) > 0
  if (!(Array.isArray(s.grid) && s.grid.length === 2 && s.grid.every(whole))) throw new Error(`lights3d grid ${JSON.stringify(s.grid)} is not [across, up], two whole numbers above 0`)
  if (!whole(s.slices)) throw new Error(`lights3d slices ${s.slices} is not a whole number above 0`)
  return s
}

// The light, after three's own point lights in `lights_fragment_begin`.
export const GLSL = {
  common: `
    uniform float uLights3dOn;
    uniform highp sampler2D uLights3dLights; uniform highp sampler2D uLights3dCells; uniform highp sampler2D uLights3dIndex;
    uniform vec3 uLights3dGrid; uniform vec2 uLights3dScreen; uniform float uLights3dNear; uniform float uLights3dScale;
    #define LIGHTS3D_ROW ${ROW}`,
  '?lights_fragment_begin': `
    if ( uLights3dOn > 0.5 ) {
      #if defined( STANDARD ) && !( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
      material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / ( material.dfg.x + material.dfg.y ) - 1.0 );
      #endif
      float l3Depth = max( - geometryPosition.z, uLights3dNear );
      vec3 l3At = vec3( gl_FragCoord.xy / uLights3dScreen * uLights3dGrid.xy, log( l3Depth / uLights3dNear ) * uLights3dScale );
      ivec3 l3Cell = ivec3( clamp( floor( l3At ), vec3( 0.0 ), uLights3dGrid - 1.0 ) );
      int l3C = l3Cell.x + int( uLights3dGrid.x ) * ( l3Cell.y + int( uLights3dGrid.y ) * l3Cell.z );
      vec2 l3Run = texelFetch( uLights3dCells, ivec2( l3C % LIGHTS3D_ROW, l3C / LIGHTS3D_ROW ), 0 ).xy;
      int l3End = int( l3Run.x + l3Run.y );
      for ( int l3E = int( l3Run.x ); l3E < l3End; l3E ++ ) {
        int l3K = int( texelFetch( uLights3dIndex, ivec2( l3E % LIGHTS3D_ROW, l3E / LIGHTS3D_ROW ), 0 ).r );
        ivec2 l3T = ivec2( l3K % LIGHTS3D_ROW, ( l3K / LIGHTS3D_ROW ) * 2 );
        vec4 l3A = texelFetch( uLights3dLights, l3T, 0 );
        vec4 l3B = texelFetch( uLights3dLights, l3T + ivec2( 0, 1 ), 0 );
        vec3 l3V = l3A.xyz - geometryPosition;
        directLight.direction = normalize( l3V );
        directLight.color = l3B.rgb * getDistanceAttenuation( length( l3V ), l3A.w, l3B.w );
        directLight.visible = true;
        RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      }
    }`,
}

export function lights3d() {
  let built: {
    T: typeof THREE
    scene: THREE.Scene
    before: THREE.Scene['onBeforeRender']
    after: THREE.Scene['onAfterRender']
    lights: THREE.DataTexture
    cells: THREE.DataTexture
    index: THREE.DataTexture
  } | undefined
  // Each light whose layers this turned off, and the layers it had.
  const taken = new Map<THREE.PointLight, number>()
  const uniforms: Record<string, THREE.IUniform> = {}
  // The cells as boxes in view space, six numbers a cell, made again when the camera's projection,
  // near, far or the grid changes.
  let boxes = new Float32Array(0)
  let shape = ''
  // A light and a cell it reaches, two numbers a pair, grown as a frame needs.
  let pairs = new Int32Array(0)
  let counts = new Uint32Array(0)

  const me = {
    uniforms,
    count: 0,
    entries: 0,
    cells: 0,
    tick(plugins: Plugins) {
      if (built) return
      const render3d = plugins.render3d
      if (!render3d) throw new Error('lights3d needs render3d, which this scene does not name')
      const s = checked(plugins.wire.scene.world?.lights3d as Settings | undefined)
      const T = render3d.THREE as typeof THREE
      const scene = render3d.scene as THREE.Scene
      const [nx, ny] = s.grid, nz = s.slices
      me.cells = nx * ny * nz
      counts = new Uint32Array(me.cells)
      built = {
        T,
        scene,
        before: scene.onBeforeRender,
        after: scene.onAfterRender,
        lights: texture(T, 'lights', 2),
        cells: texture(T, 'cells', Math.ceil(me.cells / ROW)),
        index: texture(T, 'index', 1),
      }
      Object.assign(uniforms, {
        uLights3dOn: { value: 0 },
        uLights3dLights: { value: built.lights },
        uLights3dCells: { value: built.cells },
        uLights3dIndex: { value: built.index },
        uLights3dGrid: { value: new T.Vector3(nx, ny, nz) },
        uLights3dScreen: { value: new T.Vector2(1, 1) },
        uLights3dNear: { value: 1 },
        uLights3dScale: { value: 1 },
      })
      render3d.splice('lights3d', { uniforms, fragment: GLSL })
      const { before, after } = built
      const size = new T.Vector2()
      // three hands a scene's `onBeforeRender` the target it draws into where a mesh's is handed its
      // geometry: null for the canvas
      scene.onBeforeRender = function (renderer, s3, camera, target, material, group) {
        before.call(this, renderer, s3, camera, target, material, group)
        const t = target as unknown as THREE.RenderTarget | null
        if (t) size.set(t.width, t.height)
        else renderer.getDrawingBufferSize(size)
        draw(camera, size.x, size.y)
      }
      scene.onAfterRender = function (renderer, s3, camera, geometry, material, group) {
        after.call(this, renderer, s3, camera, geometry, material, group)
        uniforms.uLights3dOn.value = 0
      }
    },
    close() {
      if (!built) return
      for (const [light, mask] of taken) light.layers.mask = mask
      taken.clear()
      built.scene.onBeforeRender = built.before
      built.scene.onAfterRender = built.after
      for (const t of [built.lights, built.cells, built.index]) t.dispose()
      uniforms.uLights3dOn.value = 0
      built = undefined
    },
  }

  // A float texture `ROW` texels wide and `rows` high, read texel by texel: the lights four numbers a
  // texel, the cells' runs two, the list one.
  function texture(T: typeof THREE, key: 'lights' | 'cells' | 'index', rows: number) {
    const [format, channels] = key === 'lights' ? [T.RGBAFormat, 4] : key === 'cells' ? [T.RGFormat, 2] : [T.RedFormat, 1]
    const t = new T.DataTexture(new Float32Array(ROW * rows * channels), ROW, rows, format, T.FloatType)
    t.minFilter = t.magFilter = T.NearestFilter
    t.generateMipmaps = false
    t.needsUpdate = true
    return t
  }

  // A texture of `rows` rows at least, grown by doubling, the uniform pointing at it.
  function room(key: 'lights' | 'cells' | 'index', uniform: string, rows: number) {
    const b = built!, t = b[key]
    if (t.image.height >= rows) return t
    let h = t.image.height
    while (h < rows) h *= 2
    const grown = texture(b.T, key, h)
    t.dispose()
    b[key] = grown
    uniforms[uniform].value = grown
    return grown
  }


  // The cells' boxes for this camera, made again when its projection or the grid changed.
  function cellBoxes(camera: THREE.Camera, near: number, far: number) {
    const g = uniforms.uLights3dGrid.value as THREE.Vector3
    const p = camera.projectionMatrix.elements
    const ortho = !!(camera as THREE.OrthographicCamera).isOrthographicCamera
    const key = `${p.join()}|${near}|${far}|${g.x},${g.y},${g.z}|${ortho}`
    if (key === shape) return
    shape = key
    const nx = g.x, ny = g.y, nz = g.z
    boxes = new Float32Array(nx * ny * nz * 6)
    // a view-space x or y at depth d, from a ndc coordinate on the axis whose scale is s and offset o
    const at = (ndc: number, d: number, s: number, o: number) => (ortho ? (ndc - o) / s : (d * (ndc + o)) / s)
    for (let z = 0; z < nz; z++) {
      const dn = near * Math.pow(far / near, z / nz), df = near * Math.pow(far / near, (z + 1) / nz)
      for (let y = 0; y < ny; y++) {
        const y0 = (y / ny) * 2 - 1, y1 = ((y + 1) / ny) * 2 - 1
        for (let x = 0; x < nx; x++) {
          const x0 = (x / nx) * 2 - 1, x1 = ((x + 1) / nx) * 2 - 1
          const xs = [at(x0, dn, p[0], ortho ? p[12] : p[8]), at(x0, df, p[0], ortho ? p[12] : p[8]), at(x1, dn, p[0], ortho ? p[12] : p[8]), at(x1, df, p[0], ortho ? p[12] : p[8])]
          const ys = [at(y0, dn, p[5], ortho ? p[13] : p[9]), at(y0, df, p[5], ortho ? p[13] : p[9]), at(y1, dn, p[5], ortho ? p[13] : p[9]), at(y1, df, p[5], ortho ? p[13] : p[9])]
          const c = ((z * ny + y) * nx + x) * 6
          boxes[c] = Math.min(...xs); boxes[c + 1] = Math.min(...ys); boxes[c + 2] = -df
          boxes[c + 3] = Math.max(...xs); boxes[c + 4] = Math.max(...ys); boxes[c + 5] = -dn
        }
      }
    }
  }

  function draw(camera: THREE.Camera, width: number, height: number) {
    const b = built!, T = b.T
    const cam = camera as THREE.PerspectiveCamera
    const near = cam.near, far = cam.far
    // 1. the lights: visible, casting no shadow, on a layer the camera sees
    const found: THREE.PointLight[] = []
    b.scene.traverseVisible(o => {
      const light = o as THREE.PointLight
      if (!light.isPointLight) return
      if (light.castShadow) {
        if (taken.has(light)) { light.layers.mask = taken.get(light)!; taken.delete(light) }
        return
      }
      const mask = taken.get(light) ?? light.layers.mask
      if (!(mask & camera.layers.mask)) return
      if (!taken.has(light)) { taken.set(light, mask); light.layers.disableAll() }
      found.push(light)
    })
    const n = found.length
    me.count = n
    // 2. their place in view space, reach, colour and fall off
    const lights = room('lights', 'uLights3dLights', 2 * Math.max(1, Math.ceil(n / ROW)))
    const ld = lights.image.data as Float32Array
    const view = camera.matrixWorldInverse
    const v = new T.Vector3()
    const g = uniforms.uLights3dGrid.value as THREE.Vector3
    const nx = g.x, ny = g.y, nz = g.z
    cellBoxes(camera, near, far)
    const p = camera.projectionMatrix.elements
    const ortho = !!(camera as THREE.OrthographicCamera).isOrthographicCamera
    const logScale = nz / Math.log(far / near)
    const sliceOf = (d: number) => Math.min(nz - 1, Math.max(0, Math.floor(Math.log(Math.max(d, near) / near) * logScale)))
    // the ndc of view-space x or y over depths [da, db], least or most
    const ndc = (x: number, da: number, db: number, s: number, o: number, most: boolean) => {
      if (ortho) return s * x + o
      const d = (x >= 0) === most ? da : db
      return (s * x) / d - o
    }
    const tile = (u: number, cells: number) => Math.min(cells - 1, Math.max(0, Math.floor(((u + 1) / 2) * cells)))
    counts.fill(0)
    let pairCount = 0
    const pair = (cell: number, k: number) => {
      if (pairs.length < (pairCount + 1) * 2) { const grown = new Int32Array(Math.max(1024, pairs.length * 2)); grown.set(pairs); pairs = grown }
      pairs[pairCount * 2] = cell
      pairs[pairCount * 2 + 1] = k
      pairCount++
      counts[cell]++
    }
    for (let k = 0; k < n; k++) {
      const light = found[k]
      v.setFromMatrixPosition(light.matrixWorld).applyMatrix4(view)
      const row = Math.floor(k / ROW) * 2, col = k % ROW
      const a = (row * ROW + col) * 4, c = ((row + 1) * ROW + col) * 4
      ld[a] = v.x; ld[a + 1] = v.y; ld[a + 2] = v.z; ld[a + 3] = light.distance
      ld[c] = light.color.r * light.intensity; ld[c + 1] = light.color.g * light.intensity; ld[c + 2] = light.color.b * light.intensity; ld[c + 3] = light.decay
      // 3. the cells it reaches
      const r = light.distance > 0 ? light.distance : Infinity
      const dMin = -v.z - r, dMax = -v.z + r
      if (dMax < near || dMin > far) continue
      const da = Math.max(dMin, near), db = Math.min(dMax, far)
      const z0 = sliceOf(da), z1 = sliceOf(db)
      let x0 = 0, x1 = nx - 1, y0 = 0, y1 = ny - 1
      if (r !== Infinity) {
        x0 = tile(ndc(v.x - r, da, db, p[0], ortho ? p[12] : p[8], false), nx)
        x1 = tile(ndc(v.x + r, da, db, p[0], ortho ? p[12] : p[8], true), nx)
        y0 = tile(ndc(v.y - r, da, db, p[5], ortho ? p[13] : p[9], false), ny)
        y1 = tile(ndc(v.y + r, da, db, p[5], ortho ? p[13] : p[9], true), ny)
      }
      const r2 = r * r
      for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const cell = (z * ny + y) * nx + x
        if (r !== Infinity) {
          const o = cell * 6
          const ex = v.x - Math.max(boxes[o], Math.min(v.x, boxes[o + 3]))
          const ey = v.y - Math.max(boxes[o + 1], Math.min(v.y, boxes[o + 4]))
          const ez = v.z - Math.max(boxes[o + 2], Math.min(v.z, boxes[o + 5]))
          if (ex * ex + ey * ey + ez * ez > r2) continue
        }
        pair(cell, k)
      }
    }
    lights.needsUpdate = true
    // each cell's run: where it starts in the list, and how long it is
    const cd = b.cells.image.data as Float32Array
    let start = 0
    for (let cell = 0; cell < me.cells; cell++) {
      cd[cell * 2] = start
      cd[cell * 2 + 1] = counts[cell]
      start += counts[cell]
    }
    b.cells.needsUpdate = true
    me.entries = pairCount
    const index = room('index', 'uLights3dIndex', Math.max(1, Math.ceil(pairCount / ROW)))
    const id = index.image.data as Float32Array
    const fill = counts
    fill.fill(0)
    for (let q = 0; q < pairCount; q++) {
      const cell = pairs[q * 2]
      id[cd[cell * 2] + fill[cell]++] = pairs[q * 2 + 1]
    }
    index.needsUpdate = true
    uniforms.uLights3dScreen.value.set(width, height)
    uniforms.uLights3dNear.value = near
    uniforms.uLights3dScale.value = logScale
    uniforms.uLights3dOn.value = 1
  }

  return me
}
