// lights3d: every point and spot light of render3d's scene drawn by clusters (Forward+), so a scene may
// hold as many as it likes; with `areas`, every rectangle of light (three's `RectAreaLight`, a picture where it has
// one) drawn by the same clusters, and the glow the camera sees (supershader3d's glowing materials) lighting every
// pixel; and, when the scene
// gives it `shadows`, every one that casts a shadow
// shadowed from two atlases of the same tiles: a still one, drawn once, of what never moves, and a
// moving one, drawn each frame, of what moves. Three lights a fragment by looping over every light of
// the scene, each a uniform of every program, and a shadow is a map and a uniform more; this takes the
// lights off that loop and lights each fragment by the few that reach it, its shadows read from tiles.
// It has no row and no server half: its numbers are the scene's `world.lights3d`, read on its first
// tick:
//   grid     [across, up]: the cells the frame is cut into, across and up.
//   slices   the cells along the view, from the camera's `near` to its `far`, each the same ratio
//            deeper than the one before, so the cells near the eye are as shallow as they are wide.
//   shadows  { atlas, tile, bias, normalBias, budget }, or none. A light's tiles are the same in both
//            atlases. Its still tiles are drawn once, when it is first given them, from every caster not
//            marked moving, and kept as they are: nothing that moves after, the light or a caster, draws
//            them again, so a light that moves keeps the still shadow it was first drawn with. Its moving
//            tiles are drawn every frame from the casters marked moving alone, `userData.moving` true,
//            which the plugin that moves a thing sets (anim on the bodies it poses and the props they
//            hold, crowd3d on its crowds), only the faces whose view holds one; a caster drawn wherever it
//            is (`frustumCulled` false) is held by every face of every light. A fragment is lit by what
//            passes both. `budget` is the most still tiles drawn
//            a frame, those owed a drawing past it drawn on the frames after (a light never drawn first,
//            then the nearest). Each atlas is `atlas` texels square, cut into
//            tiles `tile` texels square (`atlas` a whole number of `tile`s). A shadowed spot takes one
//            tile, a shadowed point light six, one for each face of a cube round it. `bias` (metres) is
//            how much nearer than the nearest thing a fragment must be to be shadowed, and `normalBias`
//            (metres) how far along its normal a fragment is moved before it is looked up, which keep a
//            surface from shadowing itself in stripes. With no `shadows`, a light that casts a shadow
//            is left to three, as it was before lights3d had shadows.
//   probes   { size, intensity, near, far, places }, or none: reflection probes. Each of `places`,
//            `{ at: [x, y, z], box: [x0, y0, z0, x1, y1, z1] }`, is a point the scene is captured round,
//            into a cube `size` texels a face drawn from `near` to `far` metres, lit by every lamp with
//            its shadow, and a box of the world it lights: a surface of the standard or physical
//            material in the box takes its reflection and the light round it, as three's own envMap
//            gives them, times `intensity`, the reflection looked up where the ray leaves the box so it
//            stands where the wall it shows does. A surface in more than one box takes the smallest's,
//            in none the nearest's. The probes are captured on the second frame and again on the frame
//            after `capture()` is called, and are packed into one texture however many there are. With
//            `refresh` above 0, that many faces are drawn again every frame after, going round every
//            probe's six in turn, each probe's picture packed again as its sixth is drawn: so what
//            moves shows in the reflections, 6 × probes / refresh frames late. 0 draws them no more.
//   fog      { density, colour, steps, g, far, resolution }, or none: air lit by every lamp (Haze,
//            below), handed to render3d as a pass the first tick render3d has a camera. `density` is
//            the share of light the fog takes a metre, `colour` (#rrggbb) its own faint light, `steps`
//            the steps each ray is walked in, `g` from -1 to 1 how much more of a lamp's light it
//            throws on toward the eye than back, `far` the metres a ray that meets nothing is walked,
//            `resolution` the share of the frame's width and height the walk is drawn at, and `blend`
//            the share of each new frame's walk in the fog drawn, the rest the frames before it (1 for
//            none), which smooths the walk's noise over time. With `noise: { size, layers, strength,
//            wind }` the fog's thickness is swung by a noise that repeats every `size` metres (its
//            biggest clumps about a quarter of that), `layers` of it from 1 to 4 each half the size and
//            drifting faster, `strength` from 0 (even) to 1 (clumps and clear gaps), drifting on `wind`
//            [x, y, z] metres a second by the steps' clock, each finer layer turned further round, so
//            it churns. With `height: { floor, thinning }` it is full below `floor` and halves every
//            `thinning` metres above. Each is read every frame, so one written while the page runs is
//            drawn from the next. With `areas` the fog is lit by every rectangle too (`lights3d.fog.ts`).
//   areas    { size, levels, blur, cutoff, angle, near, glow? }, or none: lights that are a surface
//            (`lights3d.areas.ts` says each). Every `RectAreaLight` is lit here, three's loop leaving it out:
//            its light through three's Linearly Transformed Cosines, its `userData.picture` (a texture)
//            prefiltered into `levels` layers `size` texels square and read blurred by `blur`; clustered by the
//            reach past which it gives less than `cutoff`, and faded to nothing there; one that casts a shadow
//            given one tile, through a camera at its middle `angle` radians from its aim, from `near` metres.
//            With `glow: { gain }` and `mods: { glow: 'supershader3d' }`, every cell of the glow the camera
//            sees in supershader3d's glowmap lights the scene, `gain` times its glow: a small light at its
//            place facing its way, so a glowing thing, a moving or posed one too, lights where it is drawn.
//            Rectangles light the standard and physical materials; the glow's cells every one that lights.
//            Each number is read every frame. With no `areas`, a `RectAreaLight` is three's, as it was.
//   mods     { glow }: the plugin that hands over what glows, `<glow>.lights3d.ts`, read with `areas.glow`.
// Each time the scene is drawn, as three calls the scene's `onBeforeRender` with the camera it draws
// through (render3d's own, and again for any other camera a pass draws the scene with), it:
//   1. takes every visible `PointLight` and `SpotLight` of the scene (and, with `areas`, `RectAreaLight`) that is on a
//      layer the camera sees, and turns its layers off, so three's own loop leaves it out, and with `areas` binds the
//      glow's cells for this frame: one that casts a shadow too
//      when there are `shadows`, and with none, one that casts a shadow is three's, as it always was,
//      its layers given back if this had taken them. Anything that reads the lights off the scene
//      still finds them where they stand.
//   2. gives tiles to the lights that cast a shadow, nearest the camera first (each one's distance
//      from the camera less its reach), and only those whose light reaches the view, while the tiles
//      last: a light the tiles do not reach is lit without its shadow, as a far lamp is seen. For each
//      tile owed it, it draws what never moves from the light into the still atlas, and for each face
//      whose view holds something moving, what moves into the moving atlas, each fragment's distance from the light
//      between its shadow camera's `near` and its reach (`distance`, or its shadow camera's `far` for
//      one of no reach) as a number from 0 to 1, as three's own point shadows store it (its distance
//      material), only what casts a shadow (`castShadow`) drawn: a spot's tile through a camera of
//      twice its `angle` aimed at its `target`, a rectangle's through one of twice the areas' `angle` aimed the
//      way it shines, a point light's six through cameras of 90° down each axis. Each tile's matrix in each atlas, from the view space of the camera the scene is drawn
//      through to the tile's clip space, goes into a texture of its own for that atlas, four texels a
//      tile; a moving tile with nothing drawn in it this frame gets a matrix of zeros, which holds no
//      point, so it shadows nothing.
//   3. writes each light's place in view space, its `distance`, its colour times its `intensity`, its
//      `decay`, a spot's cone (its direction from its `target` in view space, the cosine of its
//      `angle` and of its `angle` less its `penumbra`), its first tile and how many it has (none for
//      one with no shadow, or none given), its shadow's near and far, and its `shadow.bias` and
//      `shadow.normalBias` added to the scene's, into a float texture, six texels a light, the fifth's last
//      number its kind (`lights3d.glsl.ts`, `TEXELS`; a rectangle's own numbers
//      `lights3d.lights.ts`, `writeLights`). A point light's cone takes in every direction. A spot's `map` is not
//      drawn.
//   4. puts each light in every cell its sphere of reach meets (a lamp's `distance`, one of no `distance`
//      reaching them all; an area's as `areas` says), each cell a box in view space, and writes each cell's run in one list of
//      light numbers, a texture of where each run starts and how long it is beside it.
// A splice (render3d's `splice`, under `lights3d`, `?lights_fragment_begin`: only into the shaders that
// light, Lambert, Phong, standard, physical and toon) then finds a fragment's cell by its pixel and its
// depth, and hands each light of the cell to the shader's own RE_Direct as three's own point light loop
// does, with three's own fall off and its own spot cone (`getSpotAttenuation`), and, for a light with
// tiles, its shadow: the fragment, moved `normalBias` along its normal, is put through each of the
// light's tiles' matrices until one holds it, and nine texels round it are compared with its own
// distance less `bias`, the share of them it is no farther than being how much of the light gets past,
// in the still atlas and in the moving one, the two shares multiplied. A rectangle is lit by LTC, and the glow's
// cells after the loop (`lights3d.areas.ts`). So each lamp is drawn as it would be in three's loop, standing with them before
// `lights_fragment_maps` and `lights_fragment_end`, where every later splice finds it as direct light.
// Where three's loop has no direct light to set it up, the splice sets up the standard material's
// multiple scattering itself. The scene's `onAfterRender` turns the splice off again, so the overlay,
// and any other scene drawn through the same renderer, is lit by its own lights alone. No texture but
// the atlases has a fixed size: each grows to what the frame needs.
//
// It hands out `count`, the lights clustered the last time the scene was drawn, `entries`, the lights
// put in a cell, counted once a cell, `cells`, the cells, `shadowed`, the lights given tiles, `tiles`,
// the tiles they took, `redrawn`, the still tiles drawn the last frame, `moving`, the moving tiles drawn
// the last frame, and `owed`, the still tiles the budget left for later frames. It needs render3d,
// and is listed anywhere in `plugins`, after supershader3d where `mods.glow` names it: its work is done as the scene is
// drawn. `close` gives every light it took
// its layers back, frees its textures and both atlases and gives the scene its hooks back. One of these per client, as render3d is.
//
// The parts, each in a file of its own beside this one: `lights3d.lights.ts` what they share and the lights' records,
// `lights3d.clusters.ts` the cells, `lights3d.shadows.ts` the atlases, `lights3d.probes.ts` the probes,
// `lights3d.areas.ts` the area lights, `lights3d.fog.ts` the fog, and `lights3d.glsl.ts` the shader code they splice
// in. Every sampler a lit shader is handed by lights3d: its lights, cells and list, both atlases and their tiles (7),
// with `areas` the pictures, the LTC tables and the glowmap (3 more), with `probes` their array (1 more).
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { lit, MATRIX, ROW, TEXELS } from './lights3d.glsl.ts'
import { Haze } from './lights3d.fog.ts'
import { isRect, texture, writeLights, type Built, type Ctx, type Light } from './lights3d.lights.ts'
import { makeClusters } from './lights3d.clusters.ts'
import { makeShadows } from './lights3d.shadows.ts'
import { makeProbes } from './lights3d.probes.ts'
import { checkedAreas, makeAreas, type Areas } from './lights3d.areas.ts'

export type { Areas } from './lights3d.areas.ts'

export { fogNoise } from './lights3d.fog.ts'
export { GLSL, prefiltered } from './lights3d.glsl.ts'

export type Shadows = { atlas: number; tile: number; bias: number; normalBias: number; budget: number }
export type FogNoise = { size: number; layers: number; strength: number; wind: [number, number, number] }
export type FogHeight = { floor: number; thinning: number }
export type Fog = { density: number; colour: string; steps: number; g: number; far: number; resolution: number; blend: number; noise?: FogNoise; height?: FogHeight }
export type Probe = { at: number[]; box: number[] }
export type Probes = { size: number; intensity: number; near: number; far: number; refresh: number; places: Probe[] }
export type Settings = { grid: [number, number]; slices: number; shadows?: Shadows; fog?: Fog; probes?: Probes; areas?: Areas; mods?: { glow?: string } }

// Throws naming the first number of `s` it cannot cut the frame or the atlas by.
function checked(s: Settings | undefined): Settings {
  if (!s) throw new Error('the scene names lights3d but gives no world.lights3d')
  const whole = (n: unknown) => Number.isInteger(n) && (n as number) > 0
  if (!(Array.isArray(s.grid) && s.grid.length === 2 && s.grid.every(whole))) throw new Error(`lights3d grid ${JSON.stringify(s.grid)} is not [across, up], two whole numbers above 0`)
  if (!whole(s.slices)) throw new Error(`lights3d slices ${s.slices} is not a whole number above 0`)
  const sh = s.shadows
  if (sh) {
    if (!whole(sh.atlas) || !whole(sh.tile)) throw new Error(`lights3d shadows atlas ${sh.atlas} and tile ${sh.tile} are not whole numbers above 0`)
    if (sh.atlas % sh.tile !== 0) throw new Error(`lights3d shadows atlas ${sh.atlas} is not a whole number of tiles of ${sh.tile}`)
    if (!(sh.bias >= 0) || !(sh.normalBias >= 0)) throw new Error(`lights3d shadows bias ${sh.bias} and normalBias ${sh.normalBias} are not numbers of 0 or more`)
    if (!whole(sh.budget)) throw new Error(`lights3d shadows budget ${sh.budget} is not a whole number above 0`)
  }
  const f = s.fog
  if (f) {
    if (!(f.density >= 0)) throw new Error(`lights3d fog density ${f.density} is not a number of 0 or more`)
    if (!whole(f.steps)) throw new Error(`lights3d fog steps ${f.steps} is not a whole number above 0`)
    if (!(f.g > -1 && f.g < 1)) throw new Error(`lights3d fog g ${f.g} is not between -1 and 1`)
    if (!(f.far > 0)) throw new Error(`lights3d fog far ${f.far} is not above 0`)
    if (!(f.resolution > 0 && f.resolution <= 1)) throw new Error(`lights3d fog resolution ${f.resolution} is not above 0 and no more than 1`)
    if (!(f.blend > 0 && f.blend <= 1)) throw new Error(`lights3d fog blend ${f.blend} is not above 0 and no more than 1`)
    const n = f.noise
    if (n) {
      if (!(n.size > 0)) throw new Error(`lights3d fog noise size ${n.size} is not above 0`)
      if (!(Number.isInteger(n.layers) && n.layers >= 1 && n.layers <= 4)) throw new Error(`lights3d fog noise layers ${n.layers} is not a whole number from 1 to 4`)
      if (!(n.strength >= 0 && n.strength <= 1)) throw new Error(`lights3d fog noise strength ${n.strength} is not from 0 to 1`)
      if (!(Array.isArray(n.wind) && n.wind.length === 3 && n.wind.every(Number.isFinite))) throw new Error(`lights3d fog noise wind ${JSON.stringify(n.wind)} is not [x, y, z]`)
    }
    const ht = f.height
    if (ht) {
      if (!Number.isFinite(ht.floor)) throw new Error(`lights3d fog height floor ${ht.floor} is not a number`)
      if (!(ht.thinning > 0)) throw new Error(`lights3d fog height thinning ${ht.thinning} is not above 0`)
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(f.colour)) throw new Error(`lights3d fog colour ${f.colour} is not a colour #rrggbb`)
  }
  const p = s.probes
  if (p) {
    if (!whole(p.size) || Math.log2(p.size) % 1 !== 0 || p.size < 16) throw new Error(`lights3d probes size ${p.size} is not a power of 2 of 16 or more`)
    if (!(p.intensity >= 0)) throw new Error(`lights3d probes intensity ${p.intensity} is not a number of 0 or more`)
    if (!(p.near > 0 && p.far > p.near)) throw new Error(`lights3d probes near ${p.near} and far ${p.far} are not 0 < near < far`)
    if (!(Number.isInteger(p.refresh) && p.refresh >= 0)) throw new Error(`lights3d probes refresh ${p.refresh} is not a whole number of 0 or more`)
    if (!(Array.isArray(p.places) && p.places.length > 0)) throw new Error('lights3d probes has no places')
    p.places.forEach((q, i) => {
      if (!(Array.isArray(q.at) && q.at.length === 3)) throw new Error(`lights3d probe ${i} at ${JSON.stringify(q.at)} is not [x, y, z]`)
      if (!(Array.isArray(q.box) && q.box.length === 6 && q.box[0] < q.box[3] && q.box[1] < q.box[4] && q.box[2] < q.box[5]))
        throw new Error(`lights3d probe ${i} box ${JSON.stringify(q.box)} is not [x0, y0, z0, x1, y1, z1], each least below its most`)
    })
  }
  if (s.areas) checkedAreas(s.areas)
  return s
}

export function lights3d() {
  // Each light whose layers this turned off, and the layers it had.
  const taken = new Map<Light, number>()
  const uniforms: Record<string, THREE.IUniform> = {}
  // Whether the fog's pass has been handed to render3d, which it is once render3d has a camera, and the
  // pass.
  let hazed = false
  let haze: Haze | undefined
  // What every part shares, the parts, and the probes; none before the first tick.
  let ctx: Ctx | undefined
  let parts: { clusters: ReturnType<typeof makeClusters>; shadows: ReturnType<typeof makeShadows>; probes?: ReturnType<typeof makeProbes>; areas?: ReturnType<typeof makeAreas> } | undefined
  // The page's plugins as the last tick handed them, which the mod for what glows is asked with.
  let latest: Plugins | undefined

  const me = {
    uniforms,
    count: 0,
    entries: 0,
    cells: 0,
    shadowed: 0,
    tiles: 0,
    // The tiles drawn the last frame: those of lights that took new tiles.
    redrawn: 0,
    // The moving tiles drawn the last frame: each face of a light whose view held something that moves.
    moving: 0,
    // The tiles owed a drawing that the budget left for later frames.
    owed: 0,
    // The probes are captured again before the next frame: after the place has changed.
    capture() { parts?.probes?.again() },
    // How many times the probes have been captured whole, and how many probe pictures have been packed,
    // whole captures' and refreshes' both.
    captures: 0,
    packed: 0,
    tick(plugins: Plugins) {
      latest = plugins
      const render3d = plugins.render3d
      if (ctx) {
        const fog = (plugins.wire.scene.world?.lights3d as Settings).fog
        if (fog && !hazed && render3d.camera) {
          haze = new Haze(render3d.camera, fog, uniforms, ctx.built.T, ctx.areas?.levels)
          render3d.pass('lights3d', haze)
          hazed = true
        }
        // the moment drawn, a step behind the clock, which the fog's noise drifts by
        const w = plugins.wire
        if (haze) haze.time = (w.n - 1 + (w.between ?? 1)) * w.scene.prefabs.engine.dt
        return
      }
      if (!render3d) throw new Error('lights3d needs render3d, which this scene does not name')
      const s = checked(plugins.wire.scene.world?.lights3d as Settings | undefined)
      const T = render3d.THREE as typeof THREE
      const scene = render3d.scene as THREE.Scene
      const [nx, ny] = s.grid, nz = s.slices
      me.cells = nx * ny * nz
      const blank = new T.DataTexture(new Float32Array([1, 1, 1, 1]), 1, 1, T.RGBAFormat, T.FloatType)
      blank.needsUpdate = true
      const built: Built = {
        T,
        scene,
        before: scene.onBeforeRender,
        after: scene.onAfterRender,
        lights: texture(T, 'lights', TEXELS),
        cells: texture(T, 'cells', Math.ceil(me.cells / ROW)),
        index: texture(T, 'index', 1),
        tiles: texture(T, 'tiles', MATRIX),
        moved: texture(T, 'moved', MATRIX),
        blank,
      }
      if (s.shadows) {
        const sh = s.shadows
        // one channel of half floats: the distance material writes its number into red
        const atlas = () => new T.WebGLRenderTarget(sh.atlas, sh.atlas, { type: T.HalfFloatType, format: T.RedFormat, minFilter: T.NearestFilter, magFilter: T.NearestFilter, generateMipmaps: false, depthBuffer: true })
        const lib = T.ShaderLib.distance
        const material = new T.ShaderMaterial({ vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: T.UniformsUtils.clone(lib.uniforms) })
        built.atlas = { target: atlas(), moving: atlas(), material, camera: new T.PerspectiveCamera(90, 1, 0.1, 10), settings: sh, across: sh.atlas / sh.tile }
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
        uLights3dAtlas: { value: built.atlas ? built.atlas.target.texture : blank },
        uLights3dTiles: { value: built.tiles },
        uLights3dMoving: { value: built.atlas ? built.atlas.moving.texture : blank },
        uLights3dMoved: { value: built.moved },
        uLights3dAcross: { value: built.atlas ? built.atlas.across : 1 },
      })
      const c: Ctx = { built, uniforms, me, capturing: false, shadowing: false, areas: s.areas }
      ctx = c
      parts = { clusters: makeClusters(c), shadows: makeShadows(c) }
      if (s.areas) {
        provided(plugins.wire.scene, 'lights3d', 'glow')
        parts.areas = makeAreas(c, s.areas)
      }
      const fragment = lit(s.areas?.levels)
      if (s.probes) {
        const probes = makeProbes(c, s.probes)
        parts.probes = probes
        fragment.common += probes.common
        fragment['?lights_fragment_maps'] = probes.maps
      }
      render3d.splice('lights3d', { uniforms, fragment })
      if (s.fog && render3d.camera) {
        haze = new Haze(render3d.camera, s.fog, uniforms, T, s.areas?.levels)
        render3d.pass('lights3d', haze)
        hazed = true
      }
      const { before, after } = built
      const size = new T.Vector2()
      // three hands a scene's `onBeforeRender` the target it draws into where a mesh's is handed its
      // geometry: null for the canvas
      scene.onBeforeRender = function (renderer, s3, camera, target, material, group) {
        before.call(this, renderer, s3, camera, target, material, group)
        if (c.shadowing) return
        // the probes captured before the frame is lit
        parts!.probes?.before(renderer)
        const t = target as unknown as THREE.RenderTarget | null
        if (t) size.set(t.width, t.height)
        else renderer.getDrawingBufferSize(size)
        draw(renderer, camera, size.x, size.y)
      }
      scene.onAfterRender = function (renderer, s3, camera, geometry, material, group) {
        after.call(this, renderer, s3, camera, geometry, material, group)
        if (c.shadowing) return
        uniforms.uLights3dOn.value = 0
      }
    },
    close() {
      if (!ctx) return
      const built = ctx.built
      for (const [light, mask] of taken) light.layers.mask = mask
      taken.clear()
      built.scene.onBeforeRender = built.before
      built.scene.onAfterRender = built.after
      for (const t of [built.lights, built.cells, built.index, built.tiles, built.moved, built.blank]) t.dispose()
      if (built.atlas) { built.atlas.target.dispose(); built.atlas.moving.dispose(); built.atlas.material.dispose() }
      parts?.probes?.dispose()
      parts?.areas?.dispose()
      uniforms.uLights3dOn.value = 0
      ctx = undefined
      parts = undefined
    },
  }

  // The scene drawn through `camera` into a target of `width` × `height`: its lights found (step 1), their shadows
  // (step 2, `lights3d.shadows.ts`), their records (step 3, `lights3d.lights.ts`) and their cells (step 4,
  // `lights3d.clusters.ts`), and the splice turned on.
  function draw(renderer: THREE.WebGLRenderer, camera: THREE.Camera, width: number, height: number) {
    const c = ctx!, b = c.built
    // 1. the lights: point, spot and, with `areas`, rectangles, visible, on a layer the camera sees, and a lamp
    // casting no shadow unless there are shadows; then the glow's cells bound for this frame
    const found: Light[] = []
    const rects: THREE.RectAreaLight[] = []
    b.scene.traverseVisible(o => {
      const light = o as Light
      if (!(light as THREE.PointLight).isPointLight && !(light as THREE.SpotLight).isSpotLight && !(c.areas && isRect(light))) return
      if (!isRect(light) && light.castShadow && !b.atlas) {
        if (taken.has(light)) { light.layers.mask = taken.get(light)!; taken.delete(light) }
        return
      }
      const mask = taken.get(light) ?? light.layers.mask
      if (!(mask & camera.layers.mask)) return
      if (!taken.has(light)) { taken.set(light, mask); light.layers.disableAll() }
      found.push(light)
      if (isRect(light)) rects.push(light)
    })
    const areas = parts!.areas
    if (areas) {
      areas.pictures(renderer, rects)
      areas.glowing(latest!)
    }
    me.count = found.length
    // 2. the shadows
    const given = parts!.shadows.shadows(renderer, camera, found)
    // 3. their place in view space, reach, colour, fall off, cone and shadow
    writeLights(c, camera, found, given, light => (areas ? areas.first(light) : -1))
    // 4. the cells each reaches
    parts!.clusters.cluster(camera, found, width, height)
    uniforms.uLights3dOn.value = 1
  }

  return me
}
