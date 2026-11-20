// supershader3d: one shader for every surface of a scene, drawn in at most three calls. It has no
// row and no server half: its numbers are the scene's `world.supershader3d`, read off the page's own
// scene. It builds on render3d, which it takes out of `plugins`, and reads one file through the
// loader: the looks JSON a game's bake writes (`scripts/bake.ts`, `looks`), the library's pro-ng
// looks composed at bake time, so the game ships that JSON and the pictures and never loads the
// library (`ONE-SHADER.md` in the library's pro-ng says the whole system).
//
// `world.supershader3d`:
//   looks   the catalogue name of the looks JSON (a `json` entry; `preload` it), or none where the `looks` mod
//           names it.
//   glowmap { resolution, cells }, or none: the glow the camera sees made each frame into a texture another
//           plugin lights the scene from (The glowmap, below).
//   mods    behaviors  the plugins that deliver the shared textures the looks read (The shared
//                      textures, below).
//           looks      one: `(world) → name`, the catalogue name of the looks JSON, from the plugin that makes the
//                      scene's place (world3d's, `world3d.supershader3d.ts`), in place of `looks`.
//
// The shared textures. The file's `needs` names each shared texture the looks read, and this keeps a
// table from that word to the function that makes it, `(plugins) → THREE.Texture`, bound as the
// uniform of the word's name: `noise` (`csNoise`, a 256 square tiling value noise) and `random`
// (`cbRand`, a 256 square table of random numbers) are its own, each made here as the library's
// install.js makes them. Every other word is delivered: the scene names the plugins in
// `world.supershader3d.mods.behaviors`, each exporting `behaviors(plugins)`, `{ <word>: make }`, laid
// over the table in the list's order, a later one's taking the place of an earlier one's, a delivered
// `noise` the place of its own; `courses`, the buildings' course table the wall looks read
// (`csCourses`), is world3d's, which draws the buildings (`world3d.supershader3d.ts`). A need nothing delivers throws,
// naming the word and the key.
//
// The file. `materials` are the scene's materials in the order a vertex's `lookId` counts them,
// each `{ name, look, call, colour }`: its look's name, the draw call that draws it (`solid`,
// `relief`, a look with a parallax and the sun's shadow marched inside it, or `seeThrough`) and its
// flat colour for the debug view. `calls` holds each call's shader, `{ ids, fragmentPars, features }`,
// or null where no material is drawn by it, and `all`, every material behind one switch, for a
// program that draws any of them (the ground's). `vertexPars` and `vertexMain` are the vertex side:
// the attributes `lookId`, `lookInfo` and the slots `s0`, `s1`, `s2` and `s3`, copied to varyings, and the
// world position and normal. `settings` is every material's settings, `{ width, materials }`,
// `materials[id]` the material's in its look's order, each `{ name, type, value }`, `type` `float` or
// `vec3` (The settings); `needs` which shared textures the looks read (`noise`, `random`, `courses`); `pictures` the stack's
// layers in order, each `{ asset, file, set, source, colour }`, `asset` the catalogue name of the
// picture, a `texture` entry, which the bake cut to `picture` pixels square.
//
// What it makes, on the first tick the file has landed: the shared textures the looks need, from the
// table (The shared textures); and one MeshPhysicalMaterial
// per call that draws anything, dressed by render3d, so every splice the scene's plugins register
// lands on it, and then patched: the vertex side after `common` and `project_vertex`, `lookTime` declared
// ahead of it so a look's own `vertex` code reads the clock as its fragment code does; the whole
// fragment preamble right before `void main`, after everything three declares; after `map_fragment`
// the uv's screen derivatives, taken once where every pixel runs them so a picture read inside a
// look's branch still knows its sharpness, then `lookRun(id)` and the look's colour and alpha; the
// roughness, metalness, normal (the look's own, or its height bent into the normal by the pixel's
// neighbours and its tangent-space normal turned in), glow and cavity; three's `lights_physical_fragment`
// and `transmission_fragment` with their material lines swapped to read the look's ior, clear coat,
// sheen, thin film, dispersion and light-through; and in `lights_fragment_begin` the directional
// light multiplied by `lookShadow(id, direction)`, the parallax looks' shadow inside their own relief.
// Each chunk's text is checked against three's as the materials are made, so a three that changed
// one throws then, naming it, not silently in a shader. A feature of three's (clear coat, sheen,
// iridescence, dispersion, transmission) is turned on for a call only when one of its looks writes
// it; transmission draws the whole solid scene a second time each frame.
//
// The pictures. Every picture of the stack is asked of the loader, and once every one has landed or
// failed they are drawn at `picture` square into one DataArrayTexture, `lookPictures`, with repeat
// wrap, trilinear mips and the GPU's anisotropy, and each colour picture's mean linear lightness goes
// in `lookMeans`, which a look reads to take a picture grey before tinting it. A picture that failed
// is a black layer; the loader writes the failure once. A picture whose asset is no `texture` entry
// of the catalogue throws, naming it and the file. Before the stack is drawn, and on a page with no
// renderer, the sampler is unbound and a picture reads black.
//
// A looks file baked with a `stack` (`scripts/bake.ts`'s looks tool writes one) holds every picture
// again as one GPU-compressed KTX2 array, its mips made by the bake, and each layer's mean: the
// catalogue's `stack.asset`, which must be a `.ktx2` texture entry (the loader's KTX2), is asked of the
// loader and bound as `lookPictures` as it lands, with repeat wrap, trilinear filtering and the GPU's
// anisotropy, and `lookMeans` is the file's. Nothing is drawn, read back or mipmapped on the page, and
// the pictures' own entries are not asked for. A stack that failed reads black; the loader writes the
// failure once. A file with no `stack` is drawn from its pictures as above.
//
// The settings. A GPU holds only so many uniforms a program (MAX_FRAGMENT_UNIFORM_VECTORS, 1024
// vectors on many), and a scene of many materials, each with its own settings, passes it, so no
// setting is a uniform: the bake (`scripts/pack-looks.ts`) writes each material's look to read its
// settings out of one table, `lookSettings`, with `texelFetch(lookSettings, ivec2(<slot>, <id>), 0)`,
// `.r` for a float and `.rgb` for a vec3. The table is a float RGBA DataTexture `width` texels across
// and a row a material, the row's texels the material's settings in order, nearest filtered with no
// mips, made from the file as it lands, on a page with no renderer too. The program holds one sampler
// however many materials and settings the scene has.
//
// The glowmap. With `world.supershader3d.glowmap`, `{ resolution, cells }`, the glow the camera sees is made each
// frame into one float texture another plugin lights the scene from, so a thing in a glowing material casts its glow
// by being drawn: the scene drawn again small, each glowing pixel's glow by its material's own `lookRun`, summed into
// cells (each its power, area, place and facing). `supershader3d.glowmap.ts` says it and the texture's layout. It is
// drawn by the scene's
// outermost draw, through the camera that draws it, hooked on the scene's `onBeforeRender` once the file has landed.
// lights3d lights the scene from it through its mod `supershader3d.lights3d.ts` (`world.lights3d.mods.glow`).
//
// A geometry drawn by a call's material carries, on each vertex, `lookId` (its material's number),
// `lookInfo` (three numbers a look seeds itself from: its material, its thing's row and its part,
// so no two parts are alike), `uv` in metres, and the slots `s0` (3 numbers), `s1` (3), `s2` (4) and
// `s3` (2), which any look may read for what its geometry hands it (a vertex without one reads zeros).
//
// It hands out `material(call)`, the call's material or undefined while the file has not landed or
// the call draws nothing; `surfaced(call, surface)`, a new material of that call dressed with a render3d
// surface (`render3d.plugin.ts`, `dress`), for a plugin that poses its own copies of a geometry in the
// vertex shader (crowd3d's held items), undefined as `material` is, and disposed on `close`; `idOf(name)` and `callOf(name)`, a material's number and call by its name,
// undefined for a name the file does not hold; `looks()`, the file; `glsl()`, the `all` call's
// preamble with the varyings its vertex side declares made plain globals, for a program of another plugin's that has no
// tagged vertices and sets `vLookUv`, `vLookWorld`, `vLookWN`, `vLookInfo`, `vLookId`, `lookGx` and
// `lookGy` itself before calling `lookRun` (the ground's, `supershader3d.terrain3d.ts`); `uniforms`,
// the one set every material and such a program binds, `lookView` (0 shaded, 1 each piece its own
// colour, 2 the relief, 3 the normal), `lookDebug` (1 draws every material in its flat colour),
// `lookTime` (the looks' clock: seconds since the file landed, on by `prefabs.engine.dt` each tick
// after, which a look that moves reads on either side, the vertex side's declared by the plugin and the fragment
// side's by the file; the library's `LOOKS.md` says how), `lookPictures`,
// `lookMeans`, `lookSettings` and the shared textures; `setting(material, name)`, a
// setting's value, a number or `[r, g, b]`, and `set(material, name, value)`, which writes it into the
// table for the next frame, each throwing on a material or setting the file does not hold and `set`
// on a value of the wrong type; and `ready()`, whether the file has landed and every picture has
// landed or failed; `glowmap()`, the glowmap as the last frame drew it (`{ texture, cells }`), undefined without
// one. Its mods deliver its looks to solids
// (`supershader3d.solids.ts`) and to terrain3d (`supershader3d.terrain3d.ts`). It is listed before
// every plugin that reads it, which each checks with `ahead`. `close` disposes every material and
// texture it made.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Splice } from '#plugins/render3d/render3d.plugin.ts'
import { mod, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { makeGlowmap, type Glowmap, type GlowSettings } from './supershader3d.glowmap.ts'

export type { Glowmap, GlowSettings }

export type Call = 'solid' | 'relief' | 'seeThrough'
export type Shader = { ids: number[]; fragmentPars: string; features: Record<string, boolean> }
// One setting of a material, a texel of the settings table (The settings).
export type Setting = { name: string; type: 'float' | 'vec3'; value: number | number[] }
export type Looks = {
  about: string
  picture: number
  materials: { name: string; look: string; call: Call; colour: number[] }[]
  vertexPars: string
  vertexMain: string
  calls: { solid: Shader | null; relief: Shader | null; seeThrough: Shader | null; all: Shader | null }
  settings: { width: number; materials: Setting[][] }
  needs: string[]
  pictures: { asset: string; file: string; set: string; source: string; colour: boolean }[]
  // every picture of `pictures` again, in its order, as one GPU-compressed KTX2 array with its mips: the
  // catalogue's entry `asset`, the file `file` in the pictures' folder; and each layer's `lookMeans`
  stack?: { asset: string; file: string; means: number[] }
}
type Settings = { looks?: string; glowmap?: GlowSettings; mods?: { behaviors?: string | string[]; looks?: string } }
// A shared texture's maker (The shared textures), and what a mod delivers, by word.
export type Shared = (plugins: Plugins) => THREE.Texture
export type Behaviors = (plugins: Plugins) => Record<string, Shared>
// The `looks` mod: the catalogue name of the looks file the plugin that makes the scene's place hands it.
export type LooksOf = (world: Record<string, any>) => string

// The catalogue name of the scene's looks file: the `looks` mod's, or `world.supershader3d.looks`.
function looksOf(world: Record<string, any>, s: Settings): string {
  const from = mod<LooksOf>(world, 'supershader3d', 'looks')
  return from ? from(world) : s.looks!
}

const CALLS: Call[] = ['solid', 'relief', 'seeThrough']
// The uniform each shared texture is bound as.
const BOUND: Record<string, string> = { noise: 'csNoise', random: 'cbRand', courses: 'csCourses' }

// A preamble's varyings as plain globals, for a program that sets them itself: each varying the file's
// vertex side declares, whatever its name, and no other (another plugin's spliced in stays a varying).
export const free = (fragmentPars: string, vertexPars: string) => {
  const own = new Set([...vertexPars.matchAll(/^(?:flat )?varying \S+ (\w+);/gm)].map(m => m[1]))
  return fragmentPars.replace(/^(?:flat )?varying (\S+) (\w+);/gm, (line, type, name) => (own.has(name) ? `${type} ${name};` : line))
}

// A small fast random, seeded, as the library's install.js seeds its textures.
export function mulberry(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Value noise repeating every 32 units, a unit 8 pixels, three sizes of it (1, 1/2 and 1/4 unit)
// summed as the looks' `csTN` reads it: the bytes, 256 square, RGBA.
export function noiseBytes(): Uint8Array {
  const N = 256, P = 32
  const rnd = mulberry(977)
  const lattice = (cells: number) => Array.from({ length: cells * cells }, () => rnd())
  const octaves = [[P, 0.5], [P * 2, 0.25], [P * 4, 0.125]].map(([cells, w]) => ({ cells, w, v: lattice(cells) }))
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let s = 0
      for (const { cells, w, v } of octaves) {
        const fx = (x / N) * cells, fy = (y / N) * cells
        const ix = Math.floor(fx), iy = Math.floor(fy)
        let tx = fx - ix, ty = fy - iy
        tx = tx * tx * (3 - 2 * tx)
        ty = ty * ty * (3 - 2 * ty)
        const at = (i: number, j: number) => v[((j % cells) * cells) + (i % cells)]
        const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1)
        s += w * ((a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty)
      }
      const k = (y * N + x) * 4
      data[k] = data[k + 1] = data[k + 2] = Math.round((s / 0.875) * 255)
      data[k + 3] = 255
    }
  }
  return data
}

// A table of RAND × RAND random numbers, four to a cell, read whole.
export const RAND = 256
export function randomBytes(): Uint8Array {
  const rnd = mulberry(4111)
  const data = new Uint8Array(RAND * RAND * 4)
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256)
  return data
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) }
const lin = (x: number) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }

// The chunk of three's that `name` is, its uniforms' uses `swaps` ([old, new]) made the look's; a chunk
// that no longer says what is swapped throws, so a three that changed it is found at once.
export function swapped(three: typeof import('three'), name: string, swaps: [string, string][]) {
  let text = three.ShaderChunk[name as keyof typeof three.ShaderChunk] as string
  if (typeof text !== 'string') throw new Error(`supershader3d: three has no chunk ${name}`)
  for (const [a, b] of swaps) {
    if (!text.includes(a)) throw new Error(`supershader3d: three's ${name} no longer has "${a}"`)
    text = text.replace(a, b)
  }
  return text
}

// The three chunks the looks reach into, swapped to read the look (`kl`) at each pixel.
export function chunks(three: typeof import('three')) {
  return {
    lightsPhysical: swapped(three, 'lights_physical_fragment', [
      ['material.ior = ior;', 'material.ior = kl.ior;'],
      ['material.clearcoat = clearcoat;', 'material.clearcoat = kl.clearcoat;'],
      ['material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = kl.clearcoatRough;'],
      ['material.dispersion = dispersion;', 'material.dispersion = kl.dispersion;'],
      ['material.iridescence = iridescence;', 'material.iridescence = kl.iridescence;'],
      ['material.iridescenceIOR = iridescenceIOR;', 'material.iridescenceIOR = kl.iridIor;'],
      ['material.iridescenceThickness = iridescenceThicknessMaximum;', 'material.iridescenceThickness = kl.iridThick;'],
      ['material.sheenColor = sheenColor;', 'material.sheenColor = kl.sheen;'],
      ['material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );', 'material.sheenRoughness = clamp( kl.sheenRough, 0.0001, 1.0 );'],
    ]),
    transmission: swapped(three, 'transmission_fragment', [
      ['material.transmission = transmission;', 'material.transmission = kl.transmission;'],
      ['material.thickness = thickness;', 'material.thickness = kl.thickness;'],
      ['material.attenuationDistance = attenuationDistance;', 'material.attenuationDistance = kl.attDist;'],
      ['material.attenuationColor = attenuationColor;', 'material.attenuationColor = kl.attColour;'],
    ]),
    lights: swapped(three, 'lights_fragment_begin', [[
      'getDirectionalLightInfo( directionalLight, directLight );',
      'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= lookShadow( int( vLookId + 0.5 ), directLight.direction );',
    ]]),
  }
}

// A call's material: three's physical material patched to take every input from the look.
export function patch(shader: { vertexShader: string; fragmentShader: string }, looks: Looks, part: Shader, swaps: ReturnType<typeof chunks>) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nuniform float lookTime;\n${looks.vertexPars}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${looks.vertexMain}`)
  if (!shader.fragmentShader.includes('void main() {')) throw new Error('supershader3d: three\'s fragment shader has no "void main() {"')
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${part.fragmentPars}\nvoid main() {`)
    .replace('#include <map_fragment>', [
      '#include <map_fragment>',
      'lookGx = dFdx(vLookUv);',
      'lookGy = dFdy(vLookUv);',
      'Look kl = lookRun(int(vLookId + 0.5));',
      'diffuseColor.rgb = kl.colour;',
      'diffuseColor.a *= kl.alpha;',
    ].join('\n'))
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = kl.rough;')
    .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = kl.metal;')
    .replace('#include <normal_fragment_maps>', [
      '#include <normal_fragment_maps>',
      'vec3 lookBent = kitBump(-vViewPosition, lookPerturb(normal, kl.nts, faceDirection), kl.height, faceDirection);',
      'normal = kl.ownNormal ? kl.normal : lookBent;',
      'if (lookView > 2.5 && lookView < 3.5) diffuseColor.rgb = normal * 0.5 + 0.5;',
    ].join('\n'))
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += kl.glow;')
    .replace('#include <lights_physical_fragment>', swaps.lightsPhysical)
    .replace('#include <lights_fragment_begin>', swaps.lights)
    .replace('#include <aomap_fragment>', [
      '#include <aomap_fragment>',
      'reflectedLight.indirectDiffuse *= kl.ao;',
      'reflectedLight.indirectSpecular *= kl.ao;',
      'reflectedLight.directDiffuse *= mix(1.0, kl.ao, kl.aoDirect);',
    ].join('\n'))
    .replace('#include <transmission_fragment>', swaps.transmission)
}

export function supershader3d() {
  let looks: Looks | undefined
  let asked: string | undefined
  let three: typeof import('three') | undefined
  const uniforms: Record<string, THREE.IUniform> = {}
  const materials: Partial<Record<Call, THREE.MeshPhysicalMaterial>> = {}
  const made: THREE.Texture[] = []
  // each call's material made, set once the file lands, and the ones `surfaced` made, disposed on close
  let build: ((call: Call, surface?: Splice) => THREE.MeshPhysicalMaterial | undefined) | undefined
  const surfaces: THREE.Material[] = []
  const ids = new Map<string, number>()
  // the pictures: whether every one has landed or failed, and the stack drawn from them
  let landed = false
  let stack: THREE.DataArrayTexture | undefined
  // the settings table (The settings)
  let settings: THREE.DataTexture | undefined
  // the glowmap (The glowmap), the scene whose hooks draw it and the hooks it had, and how deep the scene's draws are
  let glow: ReturnType<typeof makeGlowmap> | undefined
  let hooked: { scene: THREE.Scene; before: THREE.Scene['onBeforeRender']; after: THREE.Scene['onAfterRender'] } | undefined
  let depth = 0

  // The glowmap made, and drawn by the scene's outermost draw each frame through the camera that draws it.
  function glowing(plugins: Plugins, file: Looks, s: GlowSettings) {
    const t = three!
    const scene = plugins.render3d.scene as THREE.Scene
    const own = new Set<THREE.Material>(Object.values(materials))
    glow = makeGlowmap(t, s, file, uniforms, own)
    const g = glow
    const before = scene.onBeforeRender, after = scene.onAfterRender
    hooked = { scene, before, after }
    scene.onBeforeRender = function (renderer, s3, camera, target, material, group) {
      depth++
      if (depth === 1) g.draw(renderer, scene, camera)
      before.call(this, renderer, s3, camera, target, material, group)
    }
    scene.onAfterRender = function (renderer, s3, camera, geometry, material, group) {
      after.call(this, renderer, s3, camera, geometry, material, group)
      depth--
    }
  }

  // A setting's texel written: a float in red, a colour in red, green and blue.
  function write(id: number, at: number, value: number | number[]) {
    const data = settings!.image.data as Float32Array
    const k = (id * looks!.settings.width + at) * 4
    if (Array.isArray(value)) data.set(value, k)
    else data[k] = value
    settings!.needsUpdate = true
  }

  // A setting of the file by its material's name and its own, and where it is in the table.
  function find(material: string, name: string) {
    const id = ids.get(material)
    if (id === undefined) throw new Error(`supershader3d: the looks file holds no material ${material}`)
    const row = looks!.settings.materials[id]
    const at = row.findIndex(s => s.name === name)
    if (at < 0) throw new Error(`supershader3d: material ${material} (look ${looks!.materials[id].look}) has no setting ${name}; it has ${row.map(s => s.name).join(', ') || 'none'}`)
    return { id, at, setting: row[at] }
  }

  // The materials, the shared textures and the pictures, once the file has landed.
  function install(plugins: Plugins, file: Looks) {
    looks = file
    const t = three!
    file.materials.forEach((m, id) => ids.set(m.name, id))
    uniforms.lookView = { value: 0 }
    uniforms.lookDebug = { value: 0 }
    uniforms.lookTime = { value: 0 }
    uniforms.lookPictures = { value: null }
    uniforms.lookMeans = { value: new Array(Math.max(file.pictures.length, 1)).fill(0.2) }
    // the table of shared textures: its own, and each delivered word laid over the last
    const table: Record<string, Shared> = {
      noise: () => {
        const n = new t.DataTexture(noiseBytes(), 256, 256)
        n.wrapS = n.wrapT = t.RepeatWrapping
        n.magFilter = t.LinearFilter
        n.minFilter = t.LinearMipmapLinearFilter
        n.generateMipmaps = true
        n.needsUpdate = true
        made.push(n)
        return n
      },
      random: () => {
        const r = new t.DataTexture(randomBytes(), RAND, RAND)
        r.magFilter = r.minFilter = t.NearestFilter
        r.needsUpdate = true
        made.push(r)
        return r
      },
    }
    provided(plugins.wire.scene, 'supershader3d', 'behaviors')
    for (const b of modsOf<Behaviors>(plugins.wire.scene.world!, 'supershader3d', 'behaviors')) Object.assign(table, b(plugins))
    for (const need of file.needs) {
      const make = table[need]
      if (!make) throw new Error(`supershader3d has no behavior for the shared texture ${need}, which the looks read: no plugin world.supershader3d.mods.behaviors names delivers it`)
      const bound = BOUND[need]
      if (!bound) throw new Error(`supershader3d: the looks read the shared texture ${need}, which no look's shared chunk binds (${Object.keys(BOUND).join(', ')})`)
      uniforms[bound] = { value: make(plugins) }
    }
    const { width, materials: rows } = file.settings
    const grid = new t.DataTexture(new Float32Array(width * Math.max(rows.length, 1) * 4), width, Math.max(rows.length, 1), t.RGBAFormat, t.FloatType)
    grid.magFilter = grid.minFilter = t.NearestFilter
    grid.generateMipmaps = false
    settings = grid
    rows.forEach((row, id) => row.forEach((s, at) => write(id, at, s.value)))
    uniforms.lookSettings = { value: grid }
    const swaps = chunks(t)
    // A call's material: three's physical material, dressed by render3d (with `surface`, when it is one a
    // plugin poses its own copies by), then patched with the call's looks.
    build = (call, surface) => {
      const part = file.calls[call]
      if (!part) return undefined
      const seeThrough = call === 'seeThrough'
      const material = new t.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 1, metalness: 0,
        clearcoat: part.features.clearcoat ? 1 : 0,
        sheen: part.features.sheen ? 1 : 0, sheenColor: 0xffffff,
        iridescence: part.features.iridescence ? 1 : 0,
        dispersion: part.features.dispersion ? 1 : 0,
        transmission: part.features.transmission ? 1 : 0,
        transparent: seeThrough, depthWrite: !seeThrough,
      })
      material.shadowSide = t.FrontSide
      material.name = `supershader3d ${call}`
      plugins.render3d.dress(material, surface ? { surface } : {})
      const dressed = material.onBeforeCompile, key = material.customProgramCacheKey
      const own = `supershader3d ${call} ${hash(part.fragmentPars)}`
      material.onBeforeCompile = (shader, renderer) => {
        dressed.call(material, shader, renderer)
        Object.assign(shader.uniforms, uniforms)
        patch(shader, file, part, swaps)
      }
      material.customProgramCacheKey = () => `${key.call(material)}|${own}`
      return material
    }
    for (const call of CALLS) {
      const material = build(call)
      if (material) materials[call] = material
    }
    pictures(plugins, file)
  }

  // The stack the bake wrote as one GPU-compressed KTX2 array (The pictures), bound as the loader hands
  // it over, with the means the bake worked out: nothing drawn, read back or mipmapped on the page.
  // The texture is the loader's, which keeps it; `close` leaves it.
  function compressed(plugins: Plugins, file: Looks, baked: NonNullable<Looks['stack']>) {
    const it = plugins.loader.catalogued(baked.asset)
    if (it?.type !== 'texture' || !/\.ktx2$/i.test(it.url)) throw new Error(`supershader3d: the looks' pictures are the stack ${baked.asset} (${baked.file}), which is no .ktx2 texture entry of the loader's catalogue`)
    plugins.loader.load(baked.asset).then((tex: THREE.Texture) => {
      if (looks !== file) return
      const renderer = plugins.render3d.renderer as THREE.WebGLRenderer | undefined
      tex.wrapS = tex.wrapT = three!.RepeatWrapping
      tex.magFilter = three!.LinearFilter
      tex.minFilter = three!.LinearMipmapLinearFilter
      if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      tex.needsUpdate = true
      uniforms.lookPictures.value = tex
      uniforms.lookMeans.value = baked.means
    }, () => {}).finally(() => { if (looks === file) landed = true })
  }

  // Every picture asked of the loader; once all have landed or failed, the stack, where there is a
  // renderer and a page to draw on.
  function pictures(plugins: Plugins, file: Looks) {
    if (file.stack) return compressed(plugins, file, file.stack)
    for (const p of file.pictures) {
      if (plugins.loader.catalogued(p.asset)?.type !== 'texture') throw new Error(`supershader3d: the looks read the picture ${p.asset} (${p.file}), which is no texture entry of the loader's catalogue`)
    }
    const t = three!
    Promise.allSettled(file.pictures.map(p => plugins.loader.load(p.asset))).then(got => {
      if (looks !== file) return
      landed = true
      const renderer = plugins.render3d.renderer as THREE.WebGLRenderer | undefined
      if (!renderer || typeof document === 'undefined' || !file.pictures.length) return
      const S = file.picture, n = file.pictures.length
      const data = new Uint8Array(S * S * 4 * n)
      const means = new Array(n).fill(0.2)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = S
      const g = canvas.getContext('2d', { willReadFrequently: true })!
      got.forEach((r, i) => {
        if (r.status !== 'fulfilled') return
        const image = (r.value as THREE.Texture).image as CanvasImageSource
        g.clearRect(0, 0, S, S)
        g.drawImage(image, 0, 0, S, S)
        const px = g.getImageData(0, 0, S, S).data
        data.set(px, i * S * S * 4)
        if (file.pictures[i].colour) {
          let s = 0, count = 0
          for (let k = 0; k < px.length; k += 4 * 257) { s += 0.2126 * lin(px[k]) + 0.7152 * lin(px[k + 1]) + 0.0722 * lin(px[k + 2]); count++ }
          means[i] = s / count
        }
      })
      const tex = new t.DataArrayTexture(data, S, S, n)
      tex.wrapS = tex.wrapT = t.RepeatWrapping
      tex.magFilter = t.LinearFilter
      tex.minFilter = t.LinearMipmapLinearFilter
      tex.generateMipmaps = true
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
      tex.needsUpdate = true
      stack = tex
      uniforms.lookPictures.value = tex
      uniforms.lookMeans.value = means
    })
  }

  return {
    uniforms,
    tick(plugins: Plugins) {
      // the looks' clock, once they are made: on by the frame's seconds each tick
      if (looks) {
        uniforms.lookTime.value += plugins.wire.scene.prefabs.engine.dt
        return
      }
      const world = plugins.wire.scene.world!
      const s = world.supershader3d as Settings
      const name = looksOf(world, s)
      three ??= plugins.render3d.THREE as typeof import('three')
      const file = plugins.loader.get(name) as Looks | undefined
      if (!file) {
        if (asked !== name) { asked = name; plugins.loader.load(name) }
        return
      }
      install(plugins, file)
      if (s.glowmap && plugins.render3d.scene) {
        if (!file.calls.all) throw new Error('supershader3d: world.supershader3d.glowmap needs the looks file\'s `all` call, which this one has not; bake it again')
        glowing(plugins, file, s.glowmap)
      }
    },
    // The glowmap as this frame drew it (The glowmap), or undefined where the scene gives none or before it is drawn.
    glowmap: (): Glowmap | undefined => glow?.map(),
    looks: () => looks,
    material: (call: Call) => materials[call],
    surfaced(call: Call, surface: Splice) {
      const material = build?.(call, surface)
      if (material) surfaces.push(material)
      return material
    },
    idOf: (name: string) => ids.get(name),
    callOf: (name: string): Call | undefined => { const id = ids.get(name); return id === undefined ? undefined : looks!.materials[id].call },
    glsl: () => (looks?.calls.all ? free(looks.calls.all.fragmentPars, looks.vertexPars) : undefined),
    setting(material: string, name: string): number | number[] {
      const { id, at, setting } = find(material, name)
      const data = settings!.image.data as Float32Array
      const k = (id * looks!.settings.width + at) * 4
      return setting.type === 'vec3' ? [data[k], data[k + 1], data[k + 2]] : data[k]
    },
    set(material: string, name: string, value: number | number[]) {
      const { id, at, setting } = find(material, name)
      const given = Array.isArray(value) ? (value.length === 3 ? 'vec3' : '') : 'float'
      if (given !== setting.type) throw new Error(`supershader3d: material ${material}'s setting ${name} is a ${setting.type}, and was handed ${JSON.stringify(value)}`)
      write(id, at, value)
    },
    ready: () => !!looks && landed,
    close() {
      if (hooked) {
        hooked.scene.onBeforeRender = hooked.before
        hooked.scene.onAfterRender = hooked.after
        hooked = undefined
      }
      glow?.dispose()
      glow = undefined
      depth = 0
      for (const call of CALLS) { materials[call]?.dispose(); delete materials[call] }
      for (const m of surfaces.splice(0)) m.dispose()
      build = undefined
      for (const t of made) t.dispose()
      made.length = 0
      stack?.dispose()
      stack = undefined
      settings?.dispose()
      settings = undefined
      for (const k of Object.keys(uniforms)) delete uniforms[k]
      ids.clear()
      looks = undefined
      asked = undefined
      landed = false
    },
  }
}
