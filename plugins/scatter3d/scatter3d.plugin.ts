// The browser half of scatter3d: trees, grass and boulders drawn around the camera, each pack a field
// of square cells that follows render3d's camera as it stands. Every cell is placed by the server
// half's `place` (`scatter3d.sim.ts`, which says what a pack holds and how a cell is kept), over the
// same ground, so a seat draws the instances the server's `solids` stand on.
//
// It stands the cells on the land the scene's `world.scatter3d.mods.land` names (`addons/scenemanager`'s
// mods), asked of that mod with the page's plugins each `afterTick`: `{ height, cover, ramp, rules,
// edits }`, terrain3d's browser half's `ground` from terrain3d's (`terrain3d.scatter3d.ts`). terrain3d
// makes that ground, and every new land under it, in its own `afterTick`, so the land's plugin is
// listed before this one and its land is read the frame it changes: a scene listing them the other
// way, or naming a land of a plugin it does not list, throws (`ahead`). Until there is a land, its
// field not loaded yet or a scene that names none, nothing is drawn: it waits for one.
//
// It reads the scene's `world.scatter3d` every frame (scatter3d has no row), and builds the field
// again when those numbers change, compared by content and never by identity. The browser's own
// numbers:
//   cutout    the alpha a BLEND material is cut at: every BLEND material of a model becomes an
//             alpha-tested one at `cutout`, written to depth and sorted with the opaque; a MASK
//             material keeps its own cutoff. Both are cards.
//   budget    milliseconds a frame may spend placing and bedding cells new to reach (The field), and
//             what is left of it on the place the land has prepared (Prepared places).
//   coverage  a card's alpha gains this much per mip level its texture is read at: a becomes
//             a·(1 + max(0, level)·coverage), level = ½·log2 of the larger squared screen derivative
//             of its texel position. Without it an alpha-tested leaf falls under the cutoff a few mips
//             down, far firs thin to sticks, and a card LOD swapped in far off turns from a solid crown
//             into a skeleton.
// and a pack's:
//   lods      the LOD drawn on each of the land's rings, finest first (Shells, below).
//   shadow    metres: a shell any of which is within it casts shadows; every shell takes them.
//   leaf      how far a card's normal is bent toward the sky: `leafNormal(leaf)`, n ←
//             normalize(mix(n, up, leaf)) after the normal maps, so a crown of cards is lit, and takes
//             snow, as one mass.
//   colour surface  a shape pack's, below.
//
// A model pack's meshes are named `<row>-<lod>[-<part>]`, the row one of the pack's `rows`: every mesh
// of that name is one part of that LOD. Three's glTF loader makes a repeated name unique with `_1`,
// `_2`, …, so `<row>-<lod>_n` reads as `<row>-<lod>`, and `<row>-<lod>-<part>_n` as a part. Its
// `sanitizeNodeName` deletes `.`, so a Blender `tall-0.001` arrives as `tall-0001` and reads as LOD 1;
// and a node of more than one primitive is a group whose meshes carry the glTF mesh's name, not the
// node's: the name read is the mesh's own. Only the LODs the pack's `lods` name are read. Each mesh's
// geometry is copied with its node transforms baked in, and every LOD of a row is moved by one offset,
// the one that puts its finest LOD's (the lowest-numbered its `lods` name) lowest point on y = 0 and
// the middle of its bounding box across x and z on the axis, so the LODs of a row stand on one spot. A
// row of weight 0 needs no mesh; a row that is drawn and has no mesh for a LOD its `lods` name throws
// naming it (`unmeshed`). Every material is copied, so the loader's own model is left as it was, and
// every copy goes through render3d's `dress`: a card with its surface of coverage and `leafNormal`,
// anything else with none. The model is asked of the loader once, and the pack is drawn once it has
// landed.
//
// Billboards. A part named `billboard` (`<row>-<lod>-billboard`, the far LOD the library's tree bake
// writes: one upright card of one picture of the tree, built in place like the other LODs, facing +z)
// is turned about its instance's own up to face the eye, in place of the instance's yaw: its position
// and its normal are turned in its vertex by the direction to `cameraPosition` taken into the
// instance's own space. Its shadow turns the same way, through a depth material of its own
// (`customDepthMaterial`) whose eye is the light's, so the card faces the light it casts for.
//
// A shape pack is boulders: `shape { detail, lumpy [base, range], squash }`. Each row is a variant,
// three's icosahedron of radius 1 and `detail`, each vertex moved out to base + range·h of itself,
// h the unit hash of its position (rounded to 1e-4, so every face that shares a vertex moves it alike
// and the rock has no cracks) with the seed + 7 + the row's index among `rows`, and then its y times
// `squash`, lit face by face. Its middle is on y = 0, so bedded like any other model half of it is under
// the ground, on purpose. It is drawn in `colour` (sRGB), with three's own roughness unless it has a
// `surface { broad, fine, lift, range, mix [a, b], moss { from, to, amount, up [lo, hi], colour }, bump,
// rough }`: n = a·noise(p·broad) + b·noise(p·fine), three-dimensional value noise with a quintic fade
// over the fragment's world point, and
//   albedo  × mix(1, 1 + range·(n − 0.5), lift);
//   bump    the normal bent as by a height of n·bump/fine metres, so a bump looks the same at any
//           `fine`;
//   moss    mixed in by smoothstep(from, to, n at an offset)·amount·smoothstep(up[0], up[1], the
//           world normal's y), so it grows on the faces that look up;
//   rough   the roughness.
// Its one geometry is drawn in every shell, whatever LOD its `lods` name.
//
// Shells. A pack is drawn on its land's rings (`rings()` on the page's land, each ring's reach in
// metres, terrain3d's `world.terrain3d.rings`), one shell for each entry of its `lods`: shell k reaches
// ⌈rings[k]/cell⌉ cells from the camera's cell, a cell's distance being the larger of its x and z
// distances in cells, and draws LOD lods[k]. Shell 0 is the square out to its reach, each later one the
// square ring between the one before and its own, and the pack ends at the ring of its last LOD. A
// pack with more `lods` than its land has rings, or a land that hands out none, throws the frame the
// pack is made. A shell casts shadows when any of it is within `shadow`: when the ring before it ends
// inside that distance (shell 0 always, with a `shadow` above 0). A change to the land's
// rings builds the field again.
//
// Looks. Each row drawn and each shell is a look: an InstancedMesh per part of that LOD, all of them
// as big as the shell's count of cells, since a cell holds at most one instance, so a look never
// overflows. Its instances are kept packed: a cell that leaves swaps the look's last instance into its
// place. Each instance is tinted by its cell's grey tint.
//
// The field. Each pack holds every cell within its reach, the refused ones too, so a cell is placed
// once while it stays in reach; a held cell's key is `cellKey(i, j)`, a number. The camera's cell is
// read each `afterTick`, after whatever places the camera, so a scene lists this before render3d,
// which draws in its own `afterTick`. A cell's shell changes only when its distance from the camera's
// cell crosses a shell's radius r, and a move of δ cells moves that distance by at most δ, so when the
// camera crosses into another cell only the rings between r − δ and r + δ cells from the old cell are
// asked, for each shell: O(R) cells, not the whole square, which only a move past the reach asks.
// Every asked cell whose shell changes leaves its look, the ones out of reach are let go, and only
// then does each one new to its shell arrive in its look: every one leaves before any arrives, or a
// look would briefly hold more than its count. So a cell changes LOD only when the camera crosses a
// cell, and every cell already placed changes shell on the crossing, whole.
//
// A cell new to reach is not placed on the crossing. It waits in a queue, planned again on each
// crossing nearest the camera's cell first, with the cells that have left reach dropped; each frame
// places and beds them, a cell from each pack in turn, until `budget` milliseconds have gone, and at
// least one. Each frame, only the slots of a look written since the last and still drawn go to the GPU,
// and they wait there until the renderer has sent them.
//
// Prepared places. The page's land may hold a place the camera is about to jump to, `prepared()` →
// `[x, z]` or undefined (terrain3d's `prepare`). For each pack, every cell within its reach of that
// place's cell is placed and bedded off the scene, nearest first, with what is left of `budget` once
// the camera's cells have had their share. A cell the camera's field asks for that the place has
// placed is taken from it, not queued. The frame the camera's cell is the place's cell, the camera has
// arrived: what the place had not placed yet is placed in that frame, `budget` or no budget, so the
// field there is never seen half placed. A new land or a stroke lays the place out again. `ready()` is
// whether this field's share of the place is done: every pack built, and every cell in reach of the
// place placed, in the place before arriving and in the field after; true with no place in hand. The
// land asks it through `scatter3d.terrain3d.ts`, named in `world.terrain3d.mods.ready`.
//
// Workers. Where the page has `Worker` and the land lends its workers (`task` on the page's land,
// terrain3d's), cells are placed and bedded off the page (`scatter3d.cells.ts`, the same arithmetic the
// page runs, so an instance is the same to the bit): the field's cells nearest the camera first, and
// the prepared place's nearest it first, BATCH a task, FLIGHT tasks of each in flight at once for each
// pack, the next sent as each comes back. What comes back is held where the field still waits for it,
// kept for the place, or, for a batch placed on a land that has since changed, queued again. `budget`
// then bounds nothing of scatter3d's. The frame the camera arrives at the prepared place with the land
// on the scene, every cell the field still waits for is placed on the page in that frame; while the
// land is not on the scene, as during preloading, the page keeps running and the workers finish it.
// Without them, every cell is placed on the page, a slice a frame.
//
// The looks go on render3d's scene only once the land says it is shown (`shown()` on the page's land,
// true when the land has none), so trees and grass never stand on ground that is not drawn yet.
//
// Bedding. A cell's instance is its model at `size`, yawed, then tilted, and sunk:
//   foot    the mean distance from the axis of the finest LOD's vertices from y = 0 up to a tenth of its rise,
//           its highest point; edge the largest of those distances;
//   lean    min(1, foot/rise): a tussock follows the slope and a fir stands up straight;
//   tilt    the plane fitted by least squares to the ground at 8 points foot·size round the cell's
//           point, the instance turned `lean` of the way (a slerp) from upright to its normal;
//   sink    the base stands at the plane's height over the point, less the largest gap between the
//           ground and a ring of radius (foot + lean·(edge − foot))·size about the tilted axis, taken
//           at 8 points starting straight downhill. The tilt turns the ring about the level line, so
//           its highest point over the ground is downhill wherever the slope faces, and it touches:
//           ground cover out to its edge, a fir at its foot, where its low branches overhang.
//
// A stroke moves scatter. Each frame reads the ground's `edits()` against what it saw last: a new land
// places every held cell again; a layer whose version moved re-takes each held cell whose footprint
// meets its rect, the cell's square grown by edge·(base + spread) for the pack's widest row. A cell
// re-taken is placed and bedded again from the same hashes, so a tree on raised ground rises with it and
// is the same tree, one on a painted road is refused, and the cells away from the stroke keep their
// matrices.
//
// Hollows. A scene may name, in `world.scatter3d.mods.hollows`, a list of plugins whose mods hand it
// boxes it draws nothing inside, `hollows(plugins)` → `[{ at, rot, half }]`, each a box's middle, its
// turn and its half extents along its own axes, as the page has them that frame: a car's body and
// wheels (`box3dvehicle.scatter3d.ts`), so grass the car stands in is never drawn through it. Each
// frame the boxes nearest the camera, `world.scatter3d.hollows` of them at most, are handed to every
// material of the field, and a fragment of an instance inside one is not drawn. Every plugin named
// is listed (`provided`), and `hollows` is a whole number above 0, or the first frame throws.
//
// It hands out `solids(x, z, r)`, the server half's `solids` over this client's land: the held cells
// where the field has them, any other placed on the spot; `packs()`, each built pack by name, `{ at, the
// camera's cell; held, its cells by cellKey; pending, the cells waiting to be placed; looks, by
// "<row> <shell>"; models, each drawn row's LODs and its foot, edge, rise and lean; ahead, the place's
// cells, or undefined }`; `ready()` (Prepared places); `cellKey`; and `leafNormal`. `close` takes every look off the scene and disposes
// its meshes, the copied geometries and the copied materials.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { check, hash, place, solidsOver, unit, type Cell, type Ground, type Pack, type RockSurface, type Scatter } from './scatter3d.sim.ts'
import { take as takeCell, type Stand } from './scatter3d.cells.ts'

// The module a land's workers place and bed cells with (Workers), and how many cells go in one task.
const CELLS = new URL('./scatter3d.cells.ts', import.meta.url).href
const BATCH = 512
// How many tasks of one pack's field, and of its share of the prepared place, may be in flight at once.
const FLIGHT = 4

type Three = typeof import('three')
// A box no instance is drawn inside: its middle, its turn and its half extents along its own axes.
export type Hollow = { at: number[]; rot: number[]; half: number[] }
// What a `hollows` mod is: the boxes of its plugin's things as this page has them.
export type Hollows = (plugins: Plugins) => Hollow[]
// A part of a LOD: a billboard's carries the depth material its shadow turns with (Billboards).
export type Part = { name: string; geometry: THREE.BufferGeometry; material: THREE.Material; depth?: THREE.Material }
// A row's parts by LOD number, only the LODs its pack's `lods` name; a shape's one geometry is LOD 0.
export type Model = { lods: Part[][]; foot: number; edge: number; rise: number; lean: number }
export type Held = { i: number; j: number; cell: Cell | undefined; m: Float32Array | undefined; shell: number; look: Look | undefined; slot: number }
export type Look = { meshes: THREE.InstancedMesh[]; cap: number; count: number; held: Held[]; written: Set<number> }
// A pack's share of the prepared place: the place's cell, the cells placed there by cellKey, every
// cell in reach of it nearest first and how far through them it is, and whether the camera has arrived.
export type Ahead = {
  at: [number, number]; cells: Map<number, { cell: Cell | undefined; m: Float32Array | undefined }>
  queue: { i: number; j: number; d: number }[]; next: number; out: number; arrived: boolean
}
export type Live = {
  name: string; pack: Pack; radii: number[]; grow: number; models: Record<string, Model>
  at: [number, number] | undefined; held: Map<number, Held>; looks: Map<string, Look>; byRow: Record<string, Look[]>
  pending: Map<number, { i: number; j: number; d: number }>; queue: { i: number; j: number; d: number }[]; next: number
  stands: Record<string, Stand>; flying: Set<number>; out: number
  ahead: Ahead | undefined
  geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material>
}

// `<row>-<lod>`, with `_n` or `-<part>` after it.
const NAME = /^(.+)-(\d+)(?:_\d+)?(?:-(.+))?$/

// The LODs a model pack's `lods` name, each once, finest first.
const lodsOf = (pack: Pack) => [...new Set(pack.lods)].sort((a, b) => a - b)

// Whether a part is a billboard (Billboards): `billboard`, or `billboard_n` where three's loader made a
// repeated name unique.
const BILLBOARD = /^billboard(?:_\d+)?$/

// The sentence a model pack is refused with when a row it draws has no mesh in `root`, the model's
// scene, for a LOD its `lods` name, or undefined when every drawn row has every one.
export function unmeshed(name: string, pack: Pack, root: THREE.Object3D): string | undefined {
  const has = new Set<string>()
  root.traverse(o => {
    const at = (o as THREE.Mesh).isMesh ? NAME.exec(o.name) : null
    if (at) has.add(`${at[1]} ${Number(at[2])}`)
  })
  for (const [row, r] of Object.entries(pack.rows)) {
    if (!(r.weight > 0)) continue
    for (const k of lodsOf(pack)) if (!has.has(`${row} ${k}`)) return `scatter3d pack ${name} row ${row} has no LOD ${k} in ${pack.asset}`
  }
  return undefined
}

// A held cell's key: exact while |j| < 2²⁶.
export const cellKey = (i: number, j: number) => i * 134217728 + j
const f6 = (v: number) => v.toFixed(6)

export const leafNormal = (leaf: number) => `normal = normalize( mix( normal, ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz, ${f6(leaf)} ) );`

// A card's surface: coverage on its alpha, and its normal bent toward the sky.
const cardOf = (leaf: number, coverage: number) => ({
  fragment: {
    alphamap_fragment: [
      '#ifdef USE_MAP',
      '  vec2 scTexel = vMapUv * vec2( textureSize( map, 0 ) );',
      '  float scLevel = 0.5 * log2( max( dot( dFdx( scTexel ), dFdx( scTexel ) ), dot( dFdy( scTexel ), dFdy( scTexel ) ) ) );',
      `  diffuseColor.a *= 1.0 + max( 0.0, scLevel ) * ${f6(coverage)};`,
      '#endif',
    ].join('\n'),
    normal_fragment_maps: leafNormal(leaf),
  },
})

// A billboard's turn (Billboards): `v`, a point or a direction in the card's own space, turned about
// its up so its +z faces the eye, the eye taken into the instance's own space through the inverse of
// its whole matrix. Straight over the card the eye has no direction across the ground, and it keeps
// facing +z.
const FACE = [
  'vec3 scFace( vec3 v ) {',
  '  mat4 scWhole = modelMatrix;',
  '  #ifdef USE_INSTANCING',
  '    scWhole = modelMatrix * instanceMatrix;',
  '  #endif',
  '  vec2 scEye = ( inverse( scWhole ) * vec4( cameraPosition, 1.0 ) ).xz;',
  '  float scLen = length( scEye );',
  '  vec2 scTo = scLen > 1e-6 ? scEye / scLen : vec2( 0.0, 1.0 );',
  '  return vec3( v.x * scTo.y + v.z * scTo.x, v.y, v.z * scTo.y - v.x * scTo.x );',
  '}',
].join('\n')

// A billboard's surface: its normal and its position turned to the eye, before the instance's matrix.
const billboardOf = (): Surface => ({
  vertex: {
    common: FACE,
    beginnormal_vertex: 'objectNormal = scFace( objectNormal );',
    begin_vertex: 'transformed = scFace( transformed );',
  },
})

// A billboard's depth material: three's own, its vertex turned as the card's is, so the shadow map,
// drawn from the light's eye, holds the card turned to the light. Three hands it the card's map and
// cut each time it draws the shadow.
function billboardDepth(three: Three) {
  const m = new three.MeshDepthMaterial()
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FACE}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = scFace( transformed );')
  }
  m.customProgramCacheKey = () => 'scatter3d billboard'
  return m
}

// The surface that draws nothing inside the hollows: each fragment's world point taken into each
// box's own space, where the box is the cube from -1 to 1, and dropped inside one. `scHollow` holds
// `cap` boxes, the first `scHollows` of them in use.
const hollowOf = (cap: number, uniforms: object) => ({
  uniforms,
  fragment: {
    common: `uniform mat4 scHollow[ ${cap} ];\nuniform int scHollows;`,
    clipping_planes_fragment: [
      `for ( int k = 0; k < ${cap}; k ++ ) {`,
      '  if ( k >= scHollows ) break;',
      '  vec3 q = ( scHollow[ k ] * vec4( vDressWorld, 1.0 ) ).xyz;',
      '  if ( all( lessThanEqual( abs( q ), vec3( 1.0 ) ) ) ) discard;',
      '}',
    ].join('\n'),
  },
})

type Surface = { uniforms?: object; vertex?: Record<string, string>; fragment?: Record<string, string> }
// Two surfaces as one: their uniforms together, and each chunk's glsl one after the other.
function both(a: Surface | undefined, b: Surface | undefined): Surface | undefined {
  if (!a || !b) return a ?? b
  const join = (x: Record<string, string> = {}, y: Record<string, string> = {}) =>
    Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map(k => [k, [x[k], y[k]].filter(Boolean).join('\n')]))
  return { uniforms: { ...a.uniforms, ...b.uniforms }, vertex: join(a.vertex, b.vertex), fragment: join(a.fragment, b.fragment) }
}

// A boulder's surface.
function rockOf(s: RockSurface, three: Three) {
  const rgb = (c: string) => { const k = new three.Color(c); return `vec3( ${f6(k.r)}, ${f6(k.g)}, ${f6(k.b)} )` }
  const { moss } = s
  return {
    fragment: {
      common: [
        'float scHash( vec3 p ) { p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) ); p += dot( p, p.yxz + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }',
        'float scNoise( vec3 p ) {',
        '  vec3 i = floor( p ); vec3 f = fract( p ); vec3 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );',
        '  float a = mix( mix( scHash( i ), scHash( i + vec3( 1.0, 0.0, 0.0 ) ), u.x ), mix( scHash( i + vec3( 0.0, 1.0, 0.0 ) ), scHash( i + vec3( 1.0, 1.0, 0.0 ) ), u.x ), u.y );',
        '  float b = mix( mix( scHash( i + vec3( 0.0, 0.0, 1.0 ) ), scHash( i + vec3( 1.0, 0.0, 1.0 ) ), u.x ), mix( scHash( i + vec3( 0.0, 1.0, 1.0 ) ), scHash( i + vec3( 1.0, 1.0, 1.0 ) ), u.x ), u.y );',
        '  return mix( a, b, u.z ); }',
        `float scRock( vec3 p ) { return ${f6(s.mix[0])} * scNoise( p * ${f6(s.broad)} ) + ${f6(s.mix[1])} * scNoise( p * ${f6(s.fine)} ); }`,
      ].join('\n'),
      color_fragment: [
        'float scN = scRock( vDressWorld );',
        `diffuseColor.rgb *= mix( 1.0, 1.0 + ${f6(s.range)} * ( scN - 0.5 ), ${f6(s.lift)} );`,
      ].join('\n'),
      normal_fragment_maps: [
        `vec2 scD = vec2( dFdx( scN ), dFdy( scN ) ) * ${f6(s.bump / s.fine)};`,
        'vec3 scSx = dFdx( -vViewPosition ), scSy = dFdy( -vViewPosition );',
        'vec3 scR1 = cross( scSy, normal ), scR2 = cross( normal, scSx );',
        'float scDet = dot( scSx, scR1 ) * faceDirection;',
        'normal = normalize( abs( scDet ) * normal - sign( scDet ) * ( scD.x * scR1 + scD.y * scR2 ) );',
        `float scMoss = smoothstep( ${f6(moss.from)}, ${f6(moss.to)}, scRock( vDressWorld + vec3( 37.1, 11.9, 91.7 ) ) ) * ${f6(moss.amount)}`,
        `  * smoothstep( ${f6(moss.up[0])}, ${f6(moss.up[1])}, inverseTransformDirection( normal, viewMatrix ).y );`,
        `diffuseColor.rgb = mix( diffuseColor.rgb, ${rgb(moss.colour)}, scMoss );`,
      ].join('\n'),
    },
  }
}

// A row's foot, edge, rise and lean, from LOD 0's vertices standing on y = 0.
function stand(parts: Part[]): Pick<Model, 'foot' | 'edge' | 'rise' | 'lean'> {
  let rise = 0
  for (const p of parts) { const a = p.geometry.getAttribute('position'); for (let v = 0; v < a.count; v++) rise = Math.max(rise, a.getY(v)) }
  let sum = 0, n = 0, edge = 0
  for (const p of parts) {
    const a = p.geometry.getAttribute('position')
    for (let v = 0; v < a.count; v++) {
      const y = a.getY(v)
      if (y < 0 || y > 0.1 * rise) continue
      const d = Math.hypot(a.getX(v), a.getZ(v))
      sum += d
      n++
      edge = Math.max(edge, d)
    }
  }
  const foot = n ? sum / n : 0
  return { foot, edge, rise, lean: rise > 0 ? Math.min(1, foot / rise) : 1 }
}

// A boulder variant: the hashed icosahedron.
function boulder(shape: NonNullable<Pack['shape']>, seed: number, three: Three) {
  const g = new three.IcosahedronGeometry(1, shape.detail)
  const p = g.getAttribute('position')
  const [base, range] = shape.lumpy
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), y = p.getY(v), z = p.getZ(v)
    const r = base + range * unit(Math.round(x * 1e4), Math.round(y * 1e4), hash(Math.round(z * 1e4), 0, seed))
    p.setXYZ(v, x * r, y * r * shape.squash, z * r)
  }
  g.computeVertexNormals()
  return g
}

export function scatter3d() {
  let seen: { s: Scatter; ground: Ground | undefined } | undefined
  let built: string | undefined
  let checked = false
  // Whether this field's share of the land's prepared place is done (Prepared places).
  let share = true
  // Whether the looks are on the scene: from the first frame the land is shown.
  let onScene = false
  let lives: Record<string, Live> = {}
  let land: object | undefined
  let versions: number[] = []
  let three: Three | undefined
  let scene: THREE.Scene | undefined
  const asked = new Set<string>()
  // The hollows every material of this client's shares: made with the field, while the scene names a
  // `hollows` mod, and written each frame.
  let hollow: { cap: number; uniforms: { scHollow: { value: THREE.Matrix4[] }; scHollows: { value: number } } } | undefined

  const drop = () => {
    for (const l of Object.values(lives)) {
      for (const look of l.looks.values()) for (const m of look.meshes) { scene?.remove(m); m.dispose() }
      for (const g of l.geometries) g.dispose()
      for (const m of l.materials) m.dispose()
    }
    lives = {}
  }

  const me = {
    leafNormal,
    packs: () => lives,
    ready: () => share,

    solids(x: number, z: number, r: number) {
      const ground = seen?.ground
      if (!seen || !ground) return []
      return solidsOver(seen.s.packs, (name, pack, i, j) => {
        const h = lives[name]?.held.get(cellKey(i, j))
        return h ? h.cell : place(pack, i, j, ground)
      }, x, z, r)
    },

    afterTick(plugins: Plugins) {
      const { scene: on } = plugins.wire
      const s = on.world?.scatter3d as Scatter | undefined
      if (!s) return
      if (!plugins.render3d) throw new Error('scatter3d draws through render3d, which this scene does not list')
      ahead(on, 'scatter3d', 'land')
      const ground = mod<(plugins: Plugins) => Ground | undefined>(on.world!, 'scatter3d', 'land')?.(plugins)
      seen = { s, ground }
      three = plugins.render3d.THREE
      scene = plugins.render3d.scene
      // the field is built again when its numbers, or the land's rings it is drawn on, change
      const text = JSON.stringify([s, ground?.rings?.()])
      if (text !== built) {
        drop()
        built = text
        checked = false
        const named = modsOf<Hollows>(on.world!, 'scatter3d', 'hollows').length > 0
        if (named && !(Number.isInteger(s.hollows) && s.hollows! > 0)) throw new Error(`scatter3d is handed hollows, and world.scatter3d.hollows ${s.hollows} is not a whole number above 0, the most it clears at once`)
        hollow = named ? { cap: s.hollows!, uniforms: { scHollow: { value: Array.from({ length: s.hollows! }, () => new three!.Matrix4()) }, scHollows: { value: 0 } } } : undefined
      }
      if (hollow) {
        provided(on, 'scatter3d', 'hollows')
        // The nearest boxes to the camera, as many as it holds.
        const eye = (plugins.render3d.camera as THREE.PerspectiveCamera | undefined)?.position
        const boxes = modsOf<Hollows>(on.world!, 'scatter3d', 'hollows').flatMap(f => f(plugins))
        if (eye) boxes.sort((a, b) => Math.hypot(a.at[0] - eye.x, a.at[1] - eye.y, a.at[2] - eye.z) - Math.hypot(b.at[0] - eye.x, b.at[1] - eye.y, b.at[2] - eye.z))
        const used = boxes.slice(0, hollow.cap), t = three!
        used.forEach((b, k) => hollow!.uniforms.scHollow.value[k].compose(new t.Vector3(...b.at), new t.Quaternion(...b.rot), new t.Vector3(...b.half)).invert())
        hollow.uniforms.scHollows.value = used.length
      }
      if (!ground) return
      if (!checked) {
        check(s, ground)
        checked = true
      }
      for (const [name, pack] of Object.entries(s.packs)) {
        if (lives[name]) continue
        const l = make(name, pack, s, plugins, ground)
        if (l) lives[name] = l
      }
      const e = ground.edits()
      if (e.land !== land) {
        for (const l of Object.values(lives)) {
          for (const h of l.held.values()) retake(l, h, ground)
          l.ahead = undefined
        }
        land = e.land
        versions = e.layers.map(v => v.version)
      } else {
        e.layers.forEach((layer, k) => {
          if (layer.version === versions[k]) return
          versions[k] = layer.version
          const [x0, z0, x1, z1] = layer.rect
          for (const l of Object.values(lives)) {
            const c = l.pack.cell, g = l.grow
            for (const h of l.held.values()) if (h.i * c - g <= x1 && (h.i + 1) * c + g >= x0 && h.j * c - g <= z1 && (h.j + 1) * c + g >= z0) retake(l, h, ground)
            l.ahead = undefined
          }
        })
      }
      const camera = plugins.render3d.camera as THREE.PerspectiveCamera | undefined
      const all = Object.values(lives)
      const at = ground.prepared?.()
      for (const l of all) aim(l, at)
      let landed = false
      if (camera) for (const l of all) {
        follow(l, camera.position.x, camera.position.z)
        if (reach(l)) landed = true
      }
      const start = performance.now()
      if (typeof Worker !== 'undefined' && ground.task) {
        // The land's workers place the cells (Workers). The frame the camera arrives at the prepared
        // place with the field in view, every cell it still waits for is placed here, now.
        if (landed && (ground.shown?.() ?? true)) for (const l of all) drain(l, ground)
        for (const l of all) {
          while (send(l, ground)) continue
          while (sendAhead(l, ground)) continue
        }
      } else {
        // The cells new to reach, a cell from each pack in turn, nearest first, until `budget`
        // milliseconds have gone, and at least one; every one of them the frame the camera arrives at
        // the prepared place.
        let took = true, one = false
        while (took && (landed || !one || performance.now() - start < s.budget)) {
          took = false
          for (const l of all) if (settle(l, ground)) took = one = true
        }
        // The prepared place's cells, a cell from each pack in turn, with what is left of the budget.
        let more = true
        while (more && performance.now() - start < s.budget) {
          more = false
          for (const l of all) if (prepare(l, ground)) more = true
        }
      }
      share = !at || (all.length === Object.keys(s.packs).length && all.every(l => (l.ahead!.arrived ? l.pending.size === 0 : l.ahead!.next >= l.ahead!.queue.length && l.ahead!.out === 0)))
      for (const l of all) upload(l)
      // Every look onto the scene the frame the land is shown, in the same frame as the land's rings.
      if (!onScene && (ground.shown?.() ?? true)) {
        onScene = true
        for (const l of all) for (const look of l.looks.values()) for (const m of look.meshes) scene!.add(m)
      }
    },

    close() {
      drop()
      seen = undefined
      built = undefined
      share = true
      onScene = false
      hollow = undefined
      land = undefined
      versions = []
      asked.clear()
    },
  }

  // A pack's models, its looks on the scene and its empty field; undefined while its model is coming.
  function make(name: string, pack: Pack, s: Scatter, plugins: Plugins, ground: Ground): Live | undefined {
    const t = three!
    const drawn = Object.keys(pack.rows).filter(row => pack.rows[row].weight > 0)
    // The land's rings, one shell on each of the first `lods.length` (Shells).
    const rings = ground.rings?.()
    if (!rings) throw new Error('scatter3d draws each pack on its land\'s rings, and its land hands out no rings')
    if (pack.lods.length > rings.length) throw new Error(`scatter3d pack ${name} has ${pack.lods.length} lods, one for each land ring it is drawn on, and its land has ${rings.length} rings`)
    const ends = pack.lods.map((_, k) => rings[k])
    const radii = ends.map(e => Math.ceil(e / pack.cell))
    // the LOD each shell draws: a shape's one geometry in every one
    const shows = pack.asset !== undefined ? pack.lods : pack.lods.map(() => 0)
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    const clear = hollow && hollowOf(hollow.cap, hollow.uniforms)
    const dress = <M extends THREE.Material>(m: M, own?: Surface): M => {
      const surface = both(own, clear)
      return plugins.render3d.dress(m, surface ? { surface } : {})
    }
    const models: Record<string, Model> = {}
    if (pack.asset !== undefined) {
      const loader = plugins.loader
      if (!loader.ready(pack.asset)) {
        if (!asked.has(pack.asset)) {
          asked.add(pack.asset)
          // The loader writes a failure to the console once itself.
          loader.load(pack.asset).catch(() => {})
        }
        return undefined
      }
      const root = loader.model(pack.asset).scene as THREE.Object3D
      const why = unmeshed(name, pack, root)
      if (why) throw new Error(why)
      root.updateMatrixWorld(true)
      const used = lodsOf(pack)
      // each material copied once as an ordinary part and once as a billboard, should one be both
      const copies = new Map<string, { material: THREE.Material; depth?: THREE.Material }>()
      const found: Record<string, Part[][]> = {}
      root.traverse(o => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        const at = NAME.exec(mesh.name)
        if (!at || !drawn.includes(at[1])) return
        const k = Number(at[2])
        if (!used.includes(k)) return
        const board = at[3] !== undefined && BILLBOARD.test(at[3])
        const theirs = mesh.material as THREE.Material
        const key = `${theirs.uuid} ${board}`
        let copy = copies.get(key)
        if (!copy) {
          const material = theirs.clone()
          const card = material.transparent || material.alphaTest > 0
          if (material.transparent) {
            material.transparent = false
            material.alphaTest = s.cutout
            material.depthWrite = true
          }
          dress(material, both(card ? cardOf(pack.leaf, s.coverage) : undefined, board ? billboardOf() : undefined))
          materials.add(material)
          const depth = board ? billboardDepth(t) : undefined
          if (depth) materials.add(depth)
          copies.set(key, copy = { material, depth })
        }
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
        geometries.add(geometry)
        ;((found[at[1]] ??= [])[k] ??= []).push({ name: mesh.name, geometry, ...copy })
      })
      for (const row of drawn) {
        const lods = found[row]
        const finest = lods[used[0]]
        const box = new t.Box3()
        for (const p of finest) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!) }
        const dx = -(box.min.x + box.max.x) / 2, dy = -box.min.y, dz = -(box.min.z + box.max.z) / 2
        for (const k of used) for (const p of lods[k]) p.geometry.translate(dx, dy, dz)
        models[row] = { lods, ...stand(finest) }
      }
    } else {
      const material = dress(new t.MeshStandardMaterial({ color: new t.Color(pack.colour), ...(pack.surface && { roughness: pack.surface.rough }) }), pack.surface && rockOf(pack.surface, t))
      material.name = name
      materials.add(material)
      const rows = Object.keys(pack.rows)
      for (const row of drawn) {
        const geometry = boulder(pack.shape!, pack.seed + 7 + rows.indexOf(row), t)
        geometries.add(geometry)
        const part = { name: row, geometry, material }
        models[row] = { lods: [[part]], ...stand([part]) }
      }
    }
    const looks = new Map<string, Look>(), byRow: Record<string, Look[]> = {}
    for (const row of drawn) {
      radii.forEach((R, k) => {
        const cap = (2 * R + 1) ** 2 - (k ? (2 * radii[k - 1] + 1) ** 2 : 0)
        const meshes = models[row].lods[shows[k]].map(p => {
          const m = new t.InstancedMesh(p.geometry, p.material, cap)
          m.name = p.name
          if (p.depth) m.customDepthMaterial = p.depth
          m.count = 0
          m.instanceColor = new t.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
          m.castShadow = (k ? ends[k - 1] : 0) < pack.shadow
          m.receiveShadow = true
          // The instances move as the camera does; a bounding sphere kept from any one moment culls
          // the rest.
          m.frustumCulled = false
          if (onScene) scene!.add(m)
          return m
        })
        const look = { meshes, cap, count: 0, held: [], written: new Set<number>() }
        looks.set(`${row} ${k}`, look)
        ;(byRow[row] ??= [])[k] = look
      })
    }
    const grow = Math.max(0, ...drawn.map(row => models[row].edge)) * (pack.size[0] + pack.size[1])
    const stands = Object.fromEntries(drawn.map(row => [row, { foot: models[row].foot, edge: models[row].edge, lean: models[row].lean }]))
    return { name, pack, radii, grow, models, at: undefined, held: new Map(), looks, byRow, pending: new Map(), queue: [], next: 0, stands, flying: new Set(), out: 0, ahead: undefined, geometries, materials }
  }

  // The shell a cell d cells from the camera's is in, or −1 out of reach.
  const shellOf = (l: Live, d: number) => l.radii.findIndex(R => d <= R)

  // Marks slot s of a look for upload.
  const touch = (look: Look, s: number) => { look.written.add(s) }

  function arrive(l: Live, h: Held) {
    const look = l.byRow[h.cell!.row][h.shell]
    if (look.count === look.cap) throw new Error(`scatter3d pack ${l.name}: the look of ${h.cell!.row} in shell ${h.shell} is full at ${look.cap}`)
    const slot = look.count++
    for (const m of look.meshes) {
      m.instanceMatrix.array.set(h.m!, slot * 16)
      m.instanceColor!.array.fill(h.cell!.tint, slot * 3, slot * 3 + 3)
      m.count = look.count
    }
    touch(look, slot)
    look.held[slot] = h
    h.look = look
    h.slot = slot
  }

  function leave(h: Held) {
    const look = h.look!
    const last = --look.count
    if (h.slot !== last) {
      const moved = look.held[last]
      for (const m of look.meshes) {
        m.instanceMatrix.array.copyWithin(h.slot * 16, last * 16, last * 16 + 16)
        m.instanceColor!.array.copyWithin(h.slot * 3, last * 3, last * 3 + 3)
      }
      look.held[h.slot] = moved
      moved.slot = h.slot
      touch(look, h.slot)
    }
    look.held.length = last
    for (const m of look.meshes) m.count = look.count
    h.look = undefined
    h.slot = -1
  }

  // Every look's slots written since the last frame and still drawn go to the GPU, and no others: a
  // range a slot, which three sorts and joins where they touch, never a span from the first to the
  // last, which would send every slot between. The ranges are added to any the renderer has not sent
  // yet, which it clears once it has, and a version moves only with a range, since a new version with
  // none sends the whole buffer.
  function upload(l: Live) {
    for (const look of l.looks.values()) {
      const slots = [...look.written].filter(s => s < look.count)
      look.written.clear()
      if (!slots.length) continue
      for (const m of look.meshes) {
        for (const [a, n] of [[m.instanceMatrix, 16], [m.instanceColor!, 3]] as const) {
          for (const s of slots) a.addUpdateRange(s * n, n)
          a.needsUpdate = true
        }
      }
    }
  }

  // A cell placed and bedded from its hashes, here on the page (`scatter3d.cells.ts`).
  const take = (l: Live, i: number, j: number, ground: Ground) => takeCell(l.pack, l.stands, i, j, ground)

  // A held cell placed and bedded again where it is, in its shell.
  function retake(l: Live, h: Held, ground: Ground) {
    if (h.look) leave(h)
    Object.assign(h, take(l, h.i, h.j, ground))
    if (h.cell) arrive(l, h)
  }

  // The field onto the camera's cell. A cell's shell changes only when its distance from the camera's
  // cell crosses a shell's radius R, and a move of δ cells changes that distance by at most δ, so
  // only the cells between R − δ and R + δ from the old cell are asked, ring by ring: O(R) of them
  // on a crossing. A move past the field's reach asks the whole square. A cell the prepared place has
  // placed is taken from it.
  function follow(l: Live, x: number, z: number) {
    const ci = Math.floor(x / l.pack.cell), cj = Math.floor(z / l.pack.cell)
    const was = l.at
    if (was && was[0] === ci && was[1] === cj) return
    l.at = [ci, cj]
    const R = l.radii[l.radii.length - 1]
    const arriving: Held[] = []
    // Every cell leaves before any arrives.
    const ask = (i: number, j: number) => {
      const k = shellOf(l, Math.max(Math.abs(i - ci), Math.abs(j - cj)))
      const key = cellKey(i, j)
      const h = l.held.get(key)
      if (!h) {
        const ready = k >= 0 ? l.ahead?.cells.get(key) : undefined
        if (ready) {
          const taken: Held = { i, j, ...ready, shell: k, look: undefined, slot: -1 }
          l.held.set(key, taken)
          l.ahead!.cells.delete(key)
          if (taken.cell) arriving.push(taken)
          return
        }
        if (k >= 0 && !l.pending.has(key)) l.pending.set(key, { i, j, d: 0 })
        return
      }
      if (k === h.shell) return
      if (h.look) leave(h)
      if (k < 0) { l.held.delete(key); return }
      h.shell = k
      if (h.cell) arriving.push(h)
    }
    const d = was ? Math.max(Math.abs(ci - was[0]), Math.abs(cj - was[1])) : Infinity
    if (d > R) {
      for (const h of l.held.values()) if (h.look) leave(h)
      l.held.clear()
      l.pending.clear()
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) ask(i, j)
    } else {
      const [oi, oj] = was!
      const rings = new Uint8Array(R + d + 1)
      for (const r of l.radii) for (let n = Math.max(0, r - d + 1); n <= r + d; n++) rings[n] = 1
      rings.forEach((on, n) => {
        if (!on) return
        if (n === 0) return ask(oi, oj)
        for (let i = oi - n; i <= oi + n; i++) { ask(i, oj - n); ask(i, oj + n) }
        for (let j = oj - n + 1; j < oj + n; j++) { ask(oi - n, j); ask(oi + n, j) }
      })
    }
    for (const h of arriving) arrive(l, h)
    // What is still to be placed, planned again from here: nearest first, and none out of reach.
    for (const [key, c] of l.pending) {
      c.d = Math.max(Math.abs(c.i - ci), Math.abs(c.j - cj))
      if (c.d > R) l.pending.delete(key)
    }
    l.queue = [...l.pending.values()].sort((a, b) => a.d - b.d)
    l.next = 0
  }

  // Whether the camera's cell has just become the prepared place's: then every cell the place has placed
  // that the field still waits for is taken from it, and the place has arrived.
  function reach(l: Live) {
    const a = l.ahead
    if (!a || a.arrived || !l.at || l.at[0] !== a.at[0] || l.at[1] !== a.at[1]) return false
    const taken: Held[] = []
    for (const [key, ready] of a.cells) {
      const c = l.pending.get(key)
      if (!c) continue
      const h: Held = { i: c.i, j: c.j, ...ready, shell: shellOf(l, Math.max(Math.abs(c.i - l.at[0]), Math.abs(c.j - l.at[1]))), look: undefined, slot: -1 }
      l.pending.delete(key)
      l.held.set(key, h)
      if (h.cell) taken.push(h)
    }
    for (const h of taken) arrive(l, h)
    a.arrived = true
    a.cells.clear()
    return true
  }

  // The pack's share of the prepared place at `at`, laid out when the place's cell moves: every cell in
  // reach of it, nearest first, none placed yet. None with no place in hand.
  function aim(l: Live, at: number[] | undefined) {
    if (!at) { l.ahead = undefined; return }
    const ci = Math.floor(at[0] / l.pack.cell), cj = Math.floor(at[1] / l.pack.cell)
    if (l.ahead && l.ahead.at[0] === ci && l.ahead.at[1] === cj) return
    const R = l.radii[l.radii.length - 1]
    const queue: { i: number; j: number; d: number }[] = []
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) queue.push({ i, j, d: Math.max(Math.abs(i - ci), Math.abs(j - cj)) })
    queue.sort((p, q) => p.d - q.d)
    l.ahead = { at: [ci, cj], cells: new Map(), queue, next: 0, out: 0, arrived: false }
  }

  // The next cell of the prepared place not yet placed, placed and bedded off the scene; false when
  // every one is, or the camera has arrived. A cell the camera's field already holds is skipped.
  function prepare(l: Live, ground: Ground) {
    const a = l.ahead
    if (!a || a.arrived) return false
    while (a.next < a.queue.length) {
      const { i, j } = a.queue[a.next++]
      const key = cellKey(i, j)
      if (l.held.has(key)) continue
      a.cells.set(key, take(l, i, j, ground))
      return true
    }
    return false
  }

  // The nearest cell still to be placed, placed and bedded in its shell; false when there is none.
  function settle(l: Live, ground: Ground) {
    while (l.next < l.queue.length) {
      const { i, j } = l.queue[l.next++]
      const key = cellKey(i, j)
      if (!l.pending.delete(key)) continue
      const h: Held = { i, j, ...take(l, i, j, ground), shell: shellOf(l, Math.max(Math.abs(i - l.at![0]), Math.abs(j - l.at![1]))), look: undefined, slot: -1 }
      l.held.set(key, h)
      if (h.cell) arrive(l, h)
      return true
    }
    return false
  }

  // A cell the field waits for, now placed: held in its shell, and in its look when it is not refused.
  // Nothing when the field no longer waits for it, placed already or out of reach.
  function hold(l: Live, i: number, j: number, cell: Cell | undefined, m: Float32Array | undefined) {
    const key = cellKey(i, j)
    if (!l.pending.delete(key)) return
    const h: Held = { i, j, cell, m, shell: shellOf(l, Math.max(Math.abs(i - l.at![0]), Math.abs(j - l.at![1]))), look: undefined, slot: -1 }
    l.held.set(key, h)
    if (h.cell) arrive(l, h)
  }

  // Every cell the field waits for placed here, now.
  function drain(l: Live, ground: Ground) {
    for (const c of [...l.pending.values()]) {
      const t = take(l, c.i, c.j, ground)
      hold(l, c.i, c.j, t.cell, t.m)
    }
  }

  // Up to BATCH of the field's cells, nearest first, that no task has, sent to the land's workers:
  // false when FLIGHT are in flight or none is left. What comes back is held where the field still
  // waits for it; a batch placed on a land that has since changed goes back in the queue.
  function send(l: Live, ground: Ground) {
    if (l.out >= FLIGHT) return false
    const batch: number[][] = []
    while (batch.length < BATCH && l.next < l.queue.length) {
      const { i, j } = l.queue[l.next++]
      const key = cellKey(i, j)
      if (!l.pending.has(key) || l.flying.has(key)) continue
      l.flying.add(key)
      batch.push([i, j])
    }
    if (!batch.length) return false
    const on = land, ver = versions.join()
    l.out++
    ground.task!(CELLS, { pack: l.pack, stands: l.stands, cells: batch })!.then(o => {
      const r = o as { cells: (Cell | undefined)[]; m: Float32Array }
      l.out--
      for (const [i, j] of batch) l.flying.delete(cellKey(i, j))
      if (lives[l.name] !== l) return
      if (land !== on || versions.join() !== ver) {
        for (const [i, j] of batch) l.queue.push({ i, j, d: 0 })
        return
      }
      batch.forEach(([i, j], n) => hold(l, i, j, r.cells[n], r.cells[n] && r.m.slice(16 * n, 16 * n + 16)))
      while (send(l, ground)) continue
    })
    return true
  }

  // Up to BATCH of the prepared place's cells, nearest it first, that the field does not hold, sent to
  // the land's workers: false when FLIGHT are in flight or none is left. What comes back is kept for the
  // place, or, once the camera has arrived, held where the field waits for it.
  function sendAhead(l: Live, ground: Ground) {
    const a = l.ahead
    if (!a || a.arrived || a.out >= FLIGHT) return false
    const batch: number[][] = []
    while (batch.length < BATCH && a.next < a.queue.length) {
      const { i, j } = a.queue[a.next++]
      if (!l.held.has(cellKey(i, j))) batch.push([i, j])
    }
    if (!batch.length) return false
    a.out++
    ground.task!(CELLS, { pack: l.pack, stands: l.stands, cells: batch })!.then(o => {
      const r = o as { cells: (Cell | undefined)[]; m: Float32Array }
      a.out--
      if (lives[l.name] !== l || l.ahead !== a) return
      batch.forEach(([i, j], n) => {
        const cell = r.cells[n], m = cell && r.m.slice(16 * n, 16 * n + 16)
        if (a.arrived) hold(l, i, j, cell, m)
        else a.cells.set(cellKey(i, j), { cell, m })
      })
      while (sendAhead(l, ground)) continue
    })
    return true
  }

  return me
}
