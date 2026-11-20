// Instanced meshes: many copies of a look, each with its own place, turn, size and grey, drawn through
// render3d as one InstancedMesh per part, row and shell. It has no row. What it draws comes two ways:
//
// - A placer asks `instances(spec)` for an Instances and hands it instances to draw, shell by shell, as
//   lod3d does through the `mesh` word instances3d's mod delivers it (`instances3d.lod3d.ts`).
// - `world.instances3d.kinds` names kinds whose rows it draws itself, one instance a row, every frame where
//   the `instances` mods put them: `mods: { instances: ['box3d'] }` draws every box3d body of those kinds
//   where box3d has it (`plugins/box3d/box3d.instances3d.ts`).
//
// It is listed before render3d. Its `instances` mods read the rows this page has, so a plugin that hands
// them need not be listed (shapes3d has no browser half to list).
//
// `world.instances3d`:
//   cutout    the alpha a BLEND material is cut at, written to depth; read when a model with cards is drawn
//   coverage  a card's alpha gains this much per mip level its texture is read at; read with `cutout`
//   kinds     kind to a look (`instances3d.sim.ts`), drawn in one shell
//   mods      instances  `instances(plugins)` → `{ kind, at, rot }[]`, where each row of a kind is this frame
//             behaviors  `behaviors()` → `{ <word>: Geometry }`, the geometry of a look that gives that word
//
// A spec: `{ name, rows, seed, shells, look, lean?, hollows?, gpu? }`: `name` named in what it throws, `rows`
// the rows of the look drawn, `seed` the boulders' seed, `shells` each shell's outer reach in metres, nearest
// first, `lean` how far an instance with no turn leans along its normal (its row's own, foot / rise off its
// model, where it gives none), `hollows` the most boxes `frame` is handed.
//
// `gpu: { uniforms, glsl }` places every instance on the GPU, for a placer whose things are on the GPU
// already (gpuparticle3d's particles, `instances3d.gpuparticle3d.ts`): `glsl` declares what it reads and
// defines `void inPlace( float slot, out vec3 at, out vec4 rot, out float size )`, each instance's place, turn
// [x, y, z, w] and size from the number it is handed, its slot; `uniforms` are handed to every program as
// they are, so the placer writes their `value` once a frame. Such an Instances draws in one shell, and is
// handed its instances by `place(row, slots)`, each row's slots in place of the last, in place of `add`,
// `remove` and `clear`, which throw on it. Its shadows are cast from where the GLSL places it.
//
// Models. Only the LODs a look names are read, each copied with its node's transform, every LOD of a row
// moved so its finest LOD's lowest point is on y = 0 and its middle on the axis; a row missing a LOD
// throws. Each material is copied and dressed by render3d: a BLEND one cut at `cutout` and written to
// depth, a card's alpha raised by `coverage` and its normal bent `leaf` toward up; a part named
// `billboard` turned about its up to face the eye, its shadow with it. A shape is a boulder of each row,
// an icosahedron of `detail`, each vertex out to base + range·h (`lumpy` [base, range]), y times
// `squash`, in `colour`, with an optional noise `surface`. A word's geometry is its Geometry's parts,
// each placed in the instance as it says, in `colour`, `roughness` and `metalness`. A shape's or a word's
// look with a `map` waits for that picture too, and lays it on every face at `scale`; `flat` shades it flat.
//
// An instance: `{ row, at, rot?, normal?, spin?, size?, tint?, sink? }`. With `rot`, a turn [x, y, z, w], it
// is the look at `at`, turned `rot`, at `size` (1). Without, it stands: turned from upright `lean` of the
// way to `normal` (up), spun by `spin` about that up, its foot at `at`, let down by its base ring's lift
// off the surface and by `sink`·rise·size. Its grey is `tint` (1).
//
// An Instances:
//   add(instances, shell)  draws them in that shell; hands back what `remove` is handed
//   remove(added)          takes them out
//   clear()                takes every instance out
//   place(row, slots)      for a spec with `gpu`: that row's instances, one a slot `inPlace` is handed
//   frame(boxes)           once a frame after the instances have moved: the boxes `{ at, rot, half }`
//                          nothing is drawn inside, and only the slots written sent to the GPU
//   show()                 puts what it draws on render3d's scene, and everything it makes after
//   stale()                whether `cutout`, `coverage` or the `behaviors` mods have changed since it was made
//   dispose()              lets go of everything it made
// Each row and shell is a set of slots, an InstancedMesh per part whose capacity doubles when full, kept
// packed. `instances` hands back undefined while its model loads, which it asks the loader for.
//
// `close` disposes every Instances it made.
import type * as THREE from 'three'
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js'
import type { Plugins } from '#engine/browser.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { check, geometriesOf, wordOf, type Look, type RockSurface, type Shape } from './instances3d.sim.ts'

type Three = typeof THREE
export type Instance = { row: string; at: number[]; rot?: number[]; normal?: number[]; spin?: number; size?: number; tint?: number; sink?: number }
export type Box = { at: number[]; rot: number[]; half: number[] }
export type Gpu = { uniforms: object; glsl: string }
export type Spec = { name: string; rows: string[]; seed: number; shells: number[]; look: Look; lean?: number; hollows?: number; slots?: number[]; gpu?: Gpu }
export type Instances = {
  add(instances: Instance[], shell: number): unknown
  place(row: string, slots: ArrayLike<number>): void
  remove(added: unknown): void
  clear(): void
  frame(boxes: Box[]): void
  show(): void
  stale(): boolean
  dispose(): void
}
export type Placed = { kind: string; at: number[]; rot: number[] }
type Part = { name: string; geometry: THREE.BufferGeometry; material: THREE.Material; depth?: THREE.Material }
type Stand = { foot: number; edge: number; rise: number; lean: number }
type Slots = { meshes: THREE.InstancedMesh[]; cap: number; count: number; items: Item[]; written: Set<number>; whole: boolean }
type Item = { instance: Instance; slots: Slots; slot: number }
type Splice = { uniforms?: object; vertex?: Record<string, string>; fragment?: Record<string, string> }

const NAME = /^(.+)-(\d+)(?:_\d+)?(?:-(.+))?$/
const BILLBOARD = /^billboard(?:_\d+)?$/
const f6 = (v: number) => v.toFixed(6)

const card = (leaf: number, coverage: number): Splice => ({
  fragment: {
    alphamap_fragment: [
      '#ifdef USE_MAP',
      '  vec2 inTexel = vMapUv * vec2( textureSize( map, 0 ) );',
      '  float inLevel = 0.5 * log2( max( dot( dFdx( inTexel ), dFdx( inTexel ) ), dot( dFdy( inTexel ), dFdy( inTexel ) ) ) );',
      `  diffuseColor.a *= 1.0 + max( 0.0, inLevel ) * ${f6(coverage)};`,
      '#endif',
    ].join('\n'),
    normal_fragment_maps: `normal = normalize( mix( normal, ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz, ${f6(leaf)} ) );`,
  },
})

const FACE = [
  'vec3 inFace( vec3 v ) {',
  '  mat4 inWhole = modelMatrix;',
  '  #ifdef USE_INSTANCING',
  '    inWhole = modelMatrix * instanceMatrix;',
  '  #endif',
  '  vec2 inEye = ( inverse( inWhole ) * vec4( cameraPosition, 1.0 ) ).xz;',
  '  float inLen = length( inEye );',
  '  vec2 inTo = inLen > 1e-6 ? inEye / inLen : vec2( 0.0, 1.0 );',
  '  return vec3( v.x * inTo.y + v.z * inTo.x, v.y, v.z * inTo.y - v.x * inTo.x );',
  '}',
].join('\n')
const billboard = (): Splice => ({ vertex: { common: FACE, beginnormal_vertex: 'objectNormal = inFace( objectNormal );', begin_vertex: 'transformed = inFace( transformed );' } })
function billboardDepth(three: Three) {
  const m = new three.MeshDepthMaterial()
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${FACE}`).replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = inFace( transformed );')
  }
  m.customProgramCacheKey = () => 'instances3d billboard'
  return m
}

const hollowOf = (cap: number, uniforms: object): Splice => ({
  uniforms,
  fragment: {
    common: `uniform mat4 inHollow[ ${cap} ];\nuniform int inHollows;`,
    clipping_planes_fragment: [
      `for ( int k = 0; k < ${cap}; k ++ ) {`,
      '  if ( k >= inHollows ) break;',
      '  vec3 q = ( inHollow[ k ] * vec4( vDressWorld, 1.0 ) ).xyz;',
      '  if ( all( lessThanEqual( abs( q ), vec3( 1.0 ) ) ) ) discard;',
      '}',
    ].join('\n'),
  },
})

function rock(s: RockSurface, three: Three): Splice {
  const rgb = (c: string) => { const k = new three.Color(c); return `vec3( ${f6(k.r)}, ${f6(k.g)}, ${f6(k.b)} )` }
  const { moss } = s
  return {
    fragment: {
      common: [
        'float inHash( vec3 p ) { p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) ); p += dot( p, p.yxz + 33.33 ); return fract( ( p.x + p.y ) * p.z ); }',
        'float inNoise( vec3 p ) {',
        '  vec3 i = floor( p ); vec3 f = fract( p ); vec3 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );',
        '  float a = mix( mix( inHash( i ), inHash( i + vec3( 1.0, 0.0, 0.0 ) ), u.x ), mix( inHash( i + vec3( 0.0, 1.0, 0.0 ) ), inHash( i + vec3( 1.0, 1.0, 0.0 ) ), u.x ), u.y );',
        '  float b = mix( mix( inHash( i + vec3( 0.0, 0.0, 1.0 ) ), inHash( i + vec3( 1.0, 0.0, 1.0 ) ), u.x ), mix( inHash( i + vec3( 0.0, 1.0, 1.0 ) ), inHash( i + vec3( 1.0, 1.0, 1.0 ) ), u.x ), u.y );',
        '  return mix( a, b, u.z ); }',
        `float inRock( vec3 p ) { return ${f6(s.mix[0])} * inNoise( p * ${f6(s.broad)} ) + ${f6(s.mix[1])} * inNoise( p * ${f6(s.fine)} ); }`,
      ].join('\n'),
      color_fragment: ['float inN = inRock( vDressWorld );', `diffuseColor.rgb *= mix( 1.0, 1.0 + ${f6(s.range)} * ( inN - 0.5 ), ${f6(s.lift)} );`].join('\n'),
      normal_fragment_maps: [
        `vec2 inD = vec2( dFdx( inN ), dFdy( inN ) ) * ${f6(s.bump / s.fine)};`,
        'vec3 inSx = dFdx( -vViewPosition ), inSy = dFdy( -vViewPosition );',
        'vec3 inR1 = cross( inSy, normal ), inR2 = cross( normal, inSx );',
        'float inDet = dot( inSx, inR1 ) * faceDirection;',
        'normal = normalize( abs( inDet ) * normal - sign( inDet ) * ( inD.x * inR1 + inD.y * inR2 ) );',
        `float inMoss = smoothstep( ${f6(moss.from)}, ${f6(moss.to)}, inRock( vDressWorld + vec3( 37.1, 11.9, 91.7 ) ) ) * ${f6(moss.amount)}`,
        `  * smoothstep( ${f6(moss.up[0])}, ${f6(moss.up[1])}, inverseTransformDirection( normal, viewMatrix ).y );`,
        `diffuseColor.rgb = mix( diffuseColor.rgb, ${rgb(moss.colour)}, inMoss );`,
      ].join('\n'),
    },
  }
}

// A spec's `gpu`: each instance placed, turned and sized by the placer's `inPlace` from its slot, its normal
// turned with it, before three's instance matrix (left whole) and the mesh's own.
const PLACED = (gpu: Gpu) => [
  'attribute float inSlot;',
  gpu.glsl,
  'vec3 inPAt; vec4 inPRot; float inPSize;',
  'vec3 inPTurn( vec4 q, vec3 v ) { vec3 t = 2.0 * cross( q.xyz, v ); return v + q.w * t + cross( q.xyz, t ); }',
].join('\n')
const placed = (gpu: Gpu): Splice => ({
  uniforms: gpu.uniforms,
  vertex: {
    common: PLACED(gpu),
    beginnormal_vertex: 'inPlace( inSlot, inPAt, inPRot, inPSize );\nobjectNormal = inPTurn( inPRot, objectNormal );',
    begin_vertex: 'inPlace( inSlot, inPAt, inPRot, inPSize );\ntransformed = inPAt + inPTurn( inPRot, transformed * inPSize );',
  },
})
// The depth and distance materials a `gpu` spec's meshes cast their shadows by, placed as they are.
function placedShadow<M extends THREE.Material>(m: M, gpu: Gpu): M {
  m.onBeforeCompile = (shader: { vertexShader: string; uniforms: Record<string, unknown> }) => {
    Object.assign(shader.uniforms, gpu.uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${PLACED(gpu)}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ninPlace( inSlot, inPAt, inPRot, inPSize );\ntransformed = inPAt + inPTurn( inPRot, transformed * inPSize );')
  }
  m.customProgramCacheKey = () => `instances3d placed ${gpu.glsl}`
  return m
}

function both(a: Splice | undefined, b: Splice | undefined): Splice | undefined {
  if (!a || !b) return a ?? b
  const join = (x: Record<string, string> = {}, y: Record<string, string> = {}) =>
    Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map(k => [k, [x[k], y[k]].filter(Boolean).join('\n')]))
  return { uniforms: { ...a.uniforms, ...b.uniforms }, vertex: join(a.vertex, b.vertex), fragment: join(a.fragment, b.fragment) }
}

function standOf(parts: Part[]): Stand {
  let rise = 0
  for (const p of parts) { const a = p.geometry.getAttribute('position'); for (let v = 0; v < a.count; v++) rise = Math.max(rise, a.getY(v)) }
  let sum = 0, n = 0, edge = 0
  for (const p of parts) {
    const a = p.geometry.getAttribute('position')
    for (let v = 0; v < a.count; v++) {
      const y = a.getY(v)
      if (y < 0 || y > 0.1 * rise) continue
      const d = Math.hypot(a.getX(v), a.getZ(v))
      sum += d; n++; edge = Math.max(edge, d)
    }
  }
  const foot = n ? sum / n : 0
  return { foot, edge, rise, lean: rise > 0 ? Math.min(1, foot / rise) : 1 }
}

function boulder(shape: Shape, seed: number, three: Three) {
  const mix = (a: number, b: number, c: number) => { let h = Math.imul(a, 0x3c6ef372) ^ Math.imul(b, 0x7feb352d) ^ Math.imul(c, 0x846ca68b); h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0 }
  const g = new three.IcosahedronGeometry(1, shape.detail)
  const p = g.getAttribute('position')
  const [base, range] = shape.lumpy
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v), y = p.getY(v), z = p.getZ(v)
    const r = base + (range * mix(Math.round(x * 1e4), Math.round(y * 1e4), mix(Math.round(z * 1e4), 0, seed))) / 4294967296
    p.setXYZ(v, x * r, y * r * shape.squash, z * r)
  }
  g.computeVertexNormals()
  return g
}

// A geometry with every triangle its own, each corner where it lies on a picture one span of which is
// `scale` metres: across the two axes its triangle's face lies most nearly along, upright and unmirrored
// seen from outside it, u to the right and v up (on a floor or a roof, v toward −z).
function uvs(three: Three, g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const flat = g.index ? g.toNonIndexed() : g
  if (flat !== g) g.dispose()
  const p = flat.getAttribute('position'), out = new Float32Array(p.count * 2)
  for (let v = 0; v + 2 < p.count; v += 3) {
    const a = [p.getX(v), p.getY(v), p.getZ(v)], b = [p.getX(v + 1), p.getY(v + 1), p.getZ(v + 1)], c = [p.getX(v + 2), p.getY(v + 2), p.getZ(v + 2)]
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], f = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]]
    const [ax, ay, az] = n.map(Math.abs)
    ;[a, b, c].forEach(([x, y, z], k) => {
      const uv = ay >= ax && ay >= az ? [x, n[1] > 0 ? -z : z] : ax >= az ? [n[0] > 0 ? -z : z, y] : [n[2] > 0 ? x : -x, y]
      out[(v + k) * 2] = uv[0] / scale
      out[(v + k) * 2 + 1] = uv[1] / scale
    })
  }
  flat.setAttribute('uv', new three.BufferAttribute(out, 2))
  return flat
}

// Whether two values are the same: the same number (NaN the same as NaN), string, boolean or null, or
// arrays and plain objects of the same, item by item and field by field, a field holding undefined the
// same as one not there. Read for every Instances every frame, so it walks the two and makes nothing.
function same(a: unknown, b: unknown): boolean {
  if (a === b || (a !== a && b !== b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const c = b as unknown[]
    if (a.length !== c.length) return false
    for (let i = 0; i < a.length; i++) if (!same(a[i], c[i])) return false
    return true
  }
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>
  for (const k in x) if (!same(x[k], y[k])) return false
  for (const k in y) if (!(k in x) && y[k] !== undefined) return false
  return true
}

// What a made Instances depends on beyond its spec, copied when it is made: when the scene's differs
// from the copy, in place or not, the Instances is stale.
type Own = { cutout: unknown; coverage: unknown; behaviors: unknown }
const ownOf = (world: Record<string, any>): Own => { const s = world.instances3d ?? {}; return structuredClone({ cutout: s.cutout, coverage: s.coverage, behaviors: s.mods?.behaviors }) }
const sameOwn = (world: Record<string, any>, own: Own) => { const s = world.instances3d ?? {}; return same(s.cutout, own.cutout) && same(s.coverage, own.coverage) && same(s.mods?.behaviors, own.behaviors) }

export function instances3d() {
  const asked = new Set<string>()
  const made = new Set<Instances>()
  // The kinds world.instances3d.kinds draws: each kind's Instances once its look has come.
  let kinds = new Map<string, Instances>()
  let built: Record<string, unknown> | undefined // a copy of world.instances3d the kinds' Instances were made by

  function instances(plugins: Plugins, spec: Spec): Instances | undefined {
    if (!plugins.render3d) throw new Error('instances3d draws through render3d, which this scene does not list')
    const { look, rows, name } = spec
    const t: Three = plugins.render3d.THREE
    const scene: THREE.Scene = plugins.render3d.scene
    const world = plugins.wire.scene.world!
    const own = ownOf(world)
    const lods = [...new Set(look.lods)].sort((a, b) => a - b)
    const files = [look.asset, look.map].filter((f): f is string => f !== undefined)
    if (files.some(f => !plugins.loader.ready(f))) {
      for (const f of files) if (!asked.has(f)) { asked.add(f); plugins.loader.load(f).catch(() => {}) }
      return undefined
    }
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    const hollow = spec.hollows === undefined ? undefined : { inHollow: { value: Array.from({ length: spec.hollows }, () => new t.Matrix4()) }, inHollows: { value: 0 } }
    const clear = both(hollow && hollowOf(spec.hollows!, hollow), spec.gpu && placed(spec.gpu))
    const dress = <M extends THREE.Material>(m: M, splice?: Splice): M => { const surface = both(splice, clear); return plugins.render3d.dress(m, surface ? { surface } : {}) }
    if (spec.gpu && spec.shells.length !== 1) throw new Error(`${name} is placed on the GPU, and it draws in one shell, not ${spec.shells.length}`)
    const shadows = spec.gpu && {
      depth: placedShadow(new t.MeshDepthMaterial({ depthPacking: t.RGBADepthPacking }), spec.gpu),
      distance: placedShadow(new t.MeshDistanceMaterial(), spec.gpu),
    }
    const parts: Record<string, Part[][]> = {}
    const word = wordOf(look)
    if (look.asset !== undefined) {
      const root = plugins.loader.model(look.asset).scene as THREE.Object3D
      root.updateMatrixWorld(true)
      const copies = new Map<string, { material: THREE.Material; depth?: THREE.Material }>()
      root.traverse(o => {
        const mesh = o as THREE.Mesh
        const at = mesh.isMesh ? NAME.exec(mesh.name) : null
        if (!at || !rows.includes(at[1]) || !lods.includes(Number(at[2]))) return
        const board = at[3] !== undefined && BILLBOARD.test(at[3])
        const theirs = mesh.material as THREE.Material
        const id = `${theirs.uuid} ${board}`
        let copy = copies.get(id)
        if (!copy) {
          const material = theirs.clone()
          const isCard = material.transparent || material.alphaTest > 0
          const cards = world.instances3d as { cutout?: number; coverage?: number } | undefined
          if (isCard && !(cards?.cutout !== undefined && cards.coverage !== undefined)) throw new Error(`${name}'s ${look.asset} has cards, and world.instances3d gives no cutout and coverage`)
          if (material.transparent) { material.transparent = false; material.alphaTest = cards!.cutout!; material.depthWrite = true }
          dress(material, both(isCard ? card(look.leaf, cards!.coverage!) : undefined, board ? billboard() : undefined))
          materials.add(material)
          const depth = board ? billboardDepth(t) : undefined
          if (depth) materials.add(depth)
          copies.set(id, (copy = { material, depth }))
        }
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
        geometries.add(geometry)
        ;((parts[at[1]] ??= [])[Number(at[2])] ??= []).push({ name: mesh.name, geometry, ...copy })
      })
      for (const row of rows) {
        for (const k of lods) if (!parts[row]?.[k]) throw new Error(`${name} row ${row} has no LOD ${k} in ${look.asset}`)
        const box = new t.Box3()
        for (const p of parts[row][lods[0]]) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!) }
        const dx = -(box.min.x + box.max.x) / 2, dy = -box.min.y, dz = -(box.min.z + box.max.z) / 2
        for (const k of lods) for (const p of parts[row][k]) p.geometry.translate(dx, dy, dz)
      }
    } else {
      const paint = {
        color: new t.Color(look.colour), roughness: look.surface?.rough ?? look.roughness ?? 1, metalness: look.metalness ?? 0, flatShading: look.flat ?? false,
        ...(look.map !== undefined && { map: plugins.loader.get(look.map) }),
      }
      const material = dress(new t.MeshStandardMaterial(paint), look.surface && rock(look.surface, t))
      materials.add(material)
      const laid = (g: THREE.BufferGeometry) => (look.map === undefined ? g : uvs(t, g, look.scale!))
      if (word !== undefined) {
        const geometry = geometriesOf(world)[word]
        if (!geometry) throw new Error(`${name} gives ${word}, which no plugin world.instances3d.mods.behaviors names delivers`)
        const tools = { THREE: t, convex: (points: number[][]) => new ConvexGeometry(points.map(p => new t.Vector3(p[0], p[1], p[2]))) }
        for (const row of rows) {
          parts[row] = [geometry.parts(look[word], row, tools, world).map(p => {
            const g = laid(p.geometry.applyMatrix4(new t.Matrix4().compose(new t.Vector3(...(p.at ?? [0, 0, 0])), new t.Quaternion(...(p.turn ?? [0, 0, 0, 1])), new t.Vector3(...(p.size ?? [1, 1, 1])))))
            geometries.add(g)
            return { name: row, geometry: g, material }
          })]
        }
      } else {
        rows.forEach((row, n) => {
          const geometry = laid(boulder(look.shape!, spec.seed + 7 + n, t))
          geometries.add(geometry)
          parts[row] = [[{ name: row, geometry, material }]]
        })
      }
    }

    let shown = false
    let gone = false
    const meshes = new Set<THREE.InstancedMesh>()
    const mesh = (p: Part, cap: number, casts: boolean) => {
      const m = new t.InstancedMesh(p.geometry, p.material, cap)
      m.name = p.name
      if (p.depth) m.customDepthMaterial = p.depth
      if (shadows) {
        m.customDepthMaterial = shadows.depth
        m.customDistanceMaterial = shadows.distance
      }
      m.count = 0
      m.instanceColor = new t.InstancedBufferAttribute(new Float32Array(cap * 3), 3)
      m.castShadow = casts
      m.receiveShadow = true
      m.frustumCulled = false
      meshes.add(m)
      if (shown) scene.add(m)
      return m
    }
    const drawn = look.asset !== undefined ? look.lods : look.lods.map(() => 0)
    const slots: Record<string, Slots[]> = {}
    for (const row of rows) {
      slots[row] = drawn.map((lod, k) => {
        const cap = spec.slots?.[k] ?? 64
        return { meshes: parts[row][lod].map(p => mesh(p, cap, (k ? spec.shells[k - 1] : 0) < look.shadow)), cap, count: 0, items: [], written: new Set(), whole: false }
      })
    }
    const stands: Record<string, Stand> = Object.fromEntries(rows.map(row => [row, look.asset !== undefined ? standOf(parts[row][lods[0]]) : { foot: 0, edge: 0, rise: 1, lean: 1 }]))
    // Each instance's matrix, kept while the placer keeps the instance, across the shells it moves through.
    const matrices = new WeakMap<Instance, Float32Array>()
    const matrix = (it: Instance) => {
      const had = matrices.get(it)
      if (had) return had
      const size = it.size ?? 1
      let m: THREE.Matrix4
      if (it.rot) m = new t.Matrix4().compose(new t.Vector3(...it.at), new t.Quaternion(...it.rot).normalize(), new t.Vector3(size, size, size))
      else {
        const st = stands[it.row]
        const lean = spec.lean ?? st.lean
        const Y = new t.Vector3(0, 1, 0), N = new t.Vector3(...(it.normal ?? [0, 1, 0])).normalize()
        const tilt = new t.Quaternion().slerpQuaternions(new t.Quaternion(), new t.Quaternion().setFromUnitVectors(Y, N), lean)
        const up = Y.clone().applyQuaternion(tilt)
        const q = new t.Quaternion().setFromAxisAngle(up, it.spin ?? 0).multiply(tilt)
        const lift = (st.foot + lean * (st.edge - st.foot)) * size * Math.sin(Math.acos(Math.max(-1, Math.min(1, up.dot(N)))))
        const pos = new t.Vector3(...it.at).addScaledVector(N, -lift).addScaledVector(up, -(it.sink ?? 0) * st.rise * size)
        m = new t.Matrix4().compose(pos, q, new t.Vector3(size, size, size))
      }
      const out = Float32Array.from(m.elements)
      matrices.set(it, out)
      return out
    }
    const grow = (k: Slots) => {
      k.cap *= 2
      k.meshes = k.meshes.map(old => {
        const m = mesh({ name: old.name, geometry: old.geometry, material: old.material as THREE.Material, depth: old.customDepthMaterial }, k.cap, old.castShadow)
        m.instanceMatrix.array.set(old.instanceMatrix.array)
        m.instanceColor!.array.set(old.instanceColor!.array)
        m.count = old.count
        scene.remove(old)
        meshes.delete(old)
        old.dispose()
        return m
      })
      k.whole = true
    }
    const upload = (k: Slots) => {
      if (k.whole) {
        for (const m of k.meshes) { m.instanceMatrix.needsUpdate = true; m.instanceColor!.needsUpdate = true }
        k.whole = false
        k.written.clear()
        return
      }
      const written = [...k.written].filter(s => s < k.count)
      k.written.clear()
      if (!written.length) return
      for (const m of k.meshes) {
        for (const [a, n] of [[m.instanceMatrix, 16], [m.instanceColor!, 3]] as const) {
          for (const s of written) a.addUpdateRange(s * n, n)
          a.needsUpdate = true
        }
      }
    }

    const onGpu = (what: string) => { if (spec.gpu) throw new Error(`${name} is placed on the GPU, and ${what} is not: its instances are handed by place(row, slots)`) }
    const it: Instances = {
      place(row, list) {
        if (!spec.gpu) throw new Error(`${name} is not placed on the GPU: place(row, slots) is for a spec with gpu`)
        const k = slots[row]?.[0]
        if (!k) throw new Error(`${name} has no row ${row}`)
        while (k.cap < list.length) grow(k)
        k.count = list.length
        for (const m of k.meshes) {
          let a = m.geometry.getAttribute('inSlot') as THREE.InstancedBufferAttribute | undefined
          if (!a || a.count < k.cap) {
            a = new t.InstancedBufferAttribute(new Float32Array(k.cap), 1)
            m.geometry.setAttribute('inSlot', a)
          }
          ;(a.array as Float32Array).set(list)
          a.addUpdateRange(0, list.length)
          a.needsUpdate = true
          m.instanceColor!.array.fill(1)
          m.instanceColor!.needsUpdate = true
          m.count = list.length
        }
      },
      add(list, shell) {
        onGpu('add')
        const items: Item[] = []
        if (shell >= drawn.length) return items
        for (const instance of list) {
          const k = slots[instance.row]?.[shell]
          if (!k) throw new Error(`${name} has no row ${instance.row}`)
          if (k.count === k.cap) grow(k)
          const slot = k.count++
          const m = matrix(instance)
          for (const mesh of k.meshes) {
            mesh.instanceMatrix.array.set(m, slot * 16)
            mesh.instanceColor!.array.fill(instance.tint ?? 1, slot * 3, slot * 3 + 3)
            mesh.count = k.count
          }
          k.written.add(slot)
          const item = { instance, slots: k, slot }
          k.items[slot] = item
          items.push(item)
        }
        return items
      },
      remove(added) {
        onGpu('remove')
        for (const item of added as Item[]) {
          if (item.slot < 0) continue
          const k = item.slots
          const last = --k.count
          if (item.slot !== last) {
            const moved = k.items[last]
            for (const m of k.meshes) {
              m.instanceMatrix.array.copyWithin(item.slot * 16, last * 16, last * 16 + 16)
              m.instanceColor!.array.copyWithin(item.slot * 3, last * 3, last * 3 + 3)
            }
            k.items[item.slot] = moved
            moved.slot = item.slot
            k.written.add(item.slot)
          }
          k.items.length = last
          for (const m of k.meshes) m.count = k.count
          item.slot = -1
        }
      },
      clear() {
        onGpu('clear')
        for (const shells of Object.values(slots)) for (const k of shells) {
          for (const item of k.items) item.slot = -1
          k.items.length = 0
          k.count = 0
          for (const m of k.meshes) m.count = 0
        }
      },
      frame(boxes) {
        if (hollow) {
          boxes.forEach((b, k) => hollow.inHollow.value[k].compose(new t.Vector3(...b.at), new t.Quaternion(...b.rot), new t.Vector3(...b.half)).invert())
          hollow.inHollows.value = boxes.length
        }
        for (const shells of Object.values(slots)) for (const k of shells) upload(k)
      },
      show() {
        if (shown) return
        shown = true
        for (const m of meshes) scene.add(m)
      },
      stale: () => !sameOwn(plugins.wire.scene.world!, own),
      dispose() {
        if (gone) return
        gone = true
        for (const m of meshes) { scene.remove(m); m.dispose() }
        meshes.clear()
        for (const g of geometries) g.dispose()
        for (const m of materials) m.dispose()
        if (shadows) { shadows.depth.dispose(); shadows.distance.dispose() }
        made.delete(it)
      },
    }
    made.add(it)
    return it
  }

  const dropKinds = () => { for (const k of kinds.values()) k.dispose(); kinds = new Map() }

  return {
    instances,

    afterTick(plugins: Plugins) {
      const scene = plugins.wire.scene
      const s = scene.world?.instances3d as { kinds?: Record<string, Look> } | undefined
      if (!s?.kinds) { dropKinds(); built = undefined; return }
      if (!built || !same(s, built)) {
        dropKinds()
        built = structuredClone(s)
        for (const [kind, look] of Object.entries(s.kinds)) check(look, 1, `world.instances3d.kinds.${kind}`, scene.world!)
      }
      const placed = modsOf<(plugins: Plugins) => Placed[]>(scene.world!, 'instances3d', 'instances').flatMap(f => f(plugins))
      const byKind = new Map<string, Instance[]>()
      for (const p of placed) if (s.kinds[p.kind]) (byKind.get(p.kind) ?? byKind.set(p.kind, []).get(p.kind)!).push({ row: p.kind, at: p.at, rot: p.rot })
      for (const [kind, look] of Object.entries(s.kinds)) {
        let k = kinds.get(kind)
        if (!k) {
          k = instances(plugins, { name: `world.instances3d.kinds.${kind}`, rows: [kind], seed: 0, shells: [Infinity], look })
          if (!k) continue
          k.show()
          kinds.set(kind, k)
        }
        k.clear()
        k.add(byKind.get(kind) ?? [], 0)
        k.frame([])
      }
    },

    close() {
      for (const d of [...made]) d.dispose()
      kinds = new Map()
      built = undefined
      asked.clear()
    },
  }
}
