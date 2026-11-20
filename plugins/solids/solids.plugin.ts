// solids: models made of low-poly solids. It has no row, no prefab and no server half: all of it is
// the page's. It does two things:
//   - It hands the plugins that draw such models their meshes: `plugins.solids` is `meshes`, `blink`
//     and `solid` (below), which a plugin drawing a machine of them, or hanging a model on a node of
//     one, is handed as any plugin is, so a scene that lists such a plugin lists this one.
//   - It draws a row that stands still as a model: each row of a kind `world.solids.kinds` names,
//     from its model, standing at the row's `pos` on the ground and facing its `yaw`.
// Its numbers are the scene's `world.solids`, which a scene that draws no row of its own leaves out:
//   kinds   `{ <kind>: <model> }`: each row of the kind is drawn from the model, a `json` entry of the
//           scene's loader catalogue, read with the loader's `json`; left out, none.
// More models come from the plugins `world.solids.mods.models` names, each exporting `models(plugins)`,
// `{ models: { <kind>: <model> }, rows }`: the models laid over `kinds` in the list's order, a later
// one's taking the place of an earlier one's, and the rows drawn from them, each `{ id, kind, data: { pos,
// yaw?, rot? } }`, which the mod translates from what it knows, rows or not. A kind a mod hands a model for
// is drawn only at the rows the mods hand over, never at the wire's (`plugins/shapes3d`'s shapes).
// A model stands on the land a mod hands it, `world.solids.mods: { land: '<a>' }` (terrain3d's,
// `terrain3d.solids.ts`): `land(plugins)` is an object whose `height(x, z)` is the ground there, or
// undefined until it has one; until then, or with no mod named, it stands at the row's own height.
// The plugin the mod is is listed before this one, so the land it asks in its `afterTick` is this
// frame's, and a scene that lists it after, or does not list it, throws (`ahead`). A paint that wears
// a look of the scene's one shader takes it from the plugin `world.solids.mods.looks` names, listed
// before this one the same way (Paints, below).
// A row is read for its `pos` [x, y, z] and its turn, and nothing else: its `rot` [x, y, z, w], a unit
// quaternion, where it carries one (shapes3d's hyperplanes), else its `yaw` about up; its model's whole
// turn is set from it every frame, since render3d turns it between the steps by its quaternion. A drawn model is `paints`,
// `nodes` `{ <name>: { parent?, at, turn?, mirror? } }`, the frames its parts hang in, listed parent
// first: each `at` metres from its parent's origin (the row's `pos` for a node with none), turned by
// its `turn` [rx, ry] about x and then about y in its parent's frame, its x flipped when `mirror` is
// true; and `parts`. It is listed before render3d, so what it places
// in its `afterTick` is drawn that frame. A row that ends is taken off the scene and disposed, and
// when its kind's model changes, in place or not, every row of that kind is made
// again: a copy of each model is taken when it changes and walked against it each frame. One of
// these per client; `close` takes everything it drew off the scene and disposes it. `group(id)` is
// row `id`'s three.js group, its world matrix this frame's, or undefined while the row is not drawn.
//
// Solids. A part is a convex solid in its node's frame, turned by its own `frame` first: a `loft`
// along an axis from `from` to `to` between two rectangles `a` and `b`, each [centre j, centre k,
// half j, half k] on the two other axes in order (x: y, z; y: x, z; z: x, y), or a `prism` of `sides`
// sides along an axis from `from` (radius `r[0]`) to `to` (radius `r[1]`) round `at` [j, k], its first
// corner half a side round from the j axis so a flat side faces it. A `frame` `{ at, turn: [rx, ry] }`
// turns the solid about x, then about y, then moves it to `at`: `place(v, frame)`. `solid(part)` is
// its corners and its faces, each face its corner indices and its outward unit normal, found by
// Newell's method and turned to point away from the solid's middle, so a face's winding in the file
// does not matter. `triangles` fans every face into triangles wound so each one's normal points out:
// a flat-shaded mesh of them shows every facet.
//
// Paints. A model's `paints` are `{ <name>: { colour, roughness?, metalness?, glow?, blink?, opacity?,
// map?, scale? } }`: a standard material, flat-shaded so every facet shows, dressed by render3d so the
// sky's light, wet and snow reach it, with three's own roughness and metalness where the paint gives
// none. `glow` is the emissive strength in the paint's own colour; `blink` `[hz, on]` lights it only
// the first `on` of each of `hz` cycles a second, at the glow, or 1 where the paint gives none.
// `opacity` below 1 makes it see-through, glass: it lets that share of what is behind it through,
// writes no depth, so what is behind it is drawn whatever order the two are drawn in, and casts no
// shadow, so light comes through it. `map` names a texture entry of the scene's loader catalogue: the
// picture laid on every face of every part in the paint, its `colour` tinting it, `scale` metres of a
// face to one span of the picture, the same on every face whatever its size, so a checker's squares
// are one size on a long wall and on a post. Each face takes the picture across the two axes of its
// node's frame it lies most nearly along (`uvs`), upright and unmirrored as it is seen from outside;
// an entry that repeats (`wrap: 'repeat'`) repeats it past one span. A paint with a `map` and no
// `scale` throws, naming it.
//
// A paint may instead be a look, `{ look }`: the name of a material of the scene's one shader, which
// the plugin `world.solids.mods.looks` names hands over (supershader3d's, `supershader3d.solids.ts`):
// `looks(plugins)` is `{ material(name),
// idOf(name) }`, the material of the draw call that draws the look, shared by every part that wears
// it and owned by that plugin, and the look's number, each undefined for a name it does not hold.
// Every face of a part in a look paint takes its place in metres (`uvs` at a scale of 1), and each
// vertex carries `lookId`, the look's number, and `lookInfo`, the look's number, the row's id and the
// part's number, so no two parts of a row, and no two rows, are alike. A look paint is the look's
// alone: one that also gives a colour, a map, a roughness, a metalness, a glow, a blink or an
// opacity throws, naming it, since the look works every one of those out itself and the material is
// shared. A paint with neither a colour nor a look throws, naming it. A row whose model's paints name
// a look is drawn once the mod holds that look's material; until then it is not drawn, as a row waits
// for its pictures. The plugin the mod is is listed before this one, which `ahead` checks.
//
// `meshes(THREE, dress, paints, parts, whose, maps?, looks?, seed?)` makes every part: one mesh for
// each node and paint, every part of that node in that paint in it, casting and taking shadows, keyed
// by the node. A mesh whose paint has a `map` or a `look` carries its faces' places on the picture, or
// in metres; no other does. `maps(name)` is the picture of a catalogue entry, decoded, which a caller
// whose paints name a `map` hands it; `looks` is the looks mod's answer, which a caller whose paints
// name a `look` hands it, and `seed` the row's id those paints carry. It throws naming `whose` for a
// paint `paints` does not hold, for a paint with a `map` when it is handed no `maps`, and for a
// paint with a `look` when it is handed no `looks` or the looks hold no such material. `materials` is
// each paint's material by its name, for a caller that lights or darkens a paint as it draws;
// `owned` is every geometry and material it made, for the caller to dispose, a look's material not
// among them; `blinks` each blinking paint's material, which `blink(blinks, now)` lights or darkens
// as the page's clock `now`, in milliseconds, says. The pictures are the loader's and are not owned.
//
// Lights. A model's `lights` are real lights, lighting whatever is round them, each hung in a node as
// a part is: `[{ node, colour, intensity, at, distance?, decay?, spot?, shadow?, paint? }]`, a point
// light at `at` in its node's frame, `intensity` candela, reaching `distance` metres (0 or none, no
// end) and falling off by `decay` (2 when none, as light does). With `spot` `{ aim, angle, penumbra }`
// it is a spot light pointed at `aim`, a point in the same frame, its cone `angle` radians from its
// axis to its edge and `penumbra` the share of that softened. `shadow`, a whole number of pixels,
// casts shadows through a map that many pixels across. `paint` names the paint the light is the glow
// of: a plugin that lights and darkens a model's paints as it draws (a mech's headlamps, its cabin's
// lights) lights and darkens the light with it, and the light carries the name as `userData.paint`.
// `lights(THREE, lights)` makes them, keyed by the node as `meshes` keys its meshes, each spot's aim a child of the
// node beside it so it moves with it, and `owned` what it made, for the caller to dispose. A drawn
// row whose model hangs a light from a node it does not list throws naming the model and the node.
//
// Pictures. A row whose model's paints name a `map` is drawn once the loader (`plugins.loader`) holds
// every picture they name, which solids asks it for the first frame it meets them; until then the row
// is not drawn. A `map` that names no texture entry of the catalogue throws, naming the model, the
// paint and the entry.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { json } from '#plugins/loader/loader.sim.ts'

export type Axis = 'x' | 'y' | 'z'
export type Frame = { at?: number[]; turn?: number[] }
export type Loft = { axis: Axis; from: number; to: number; a: number[]; b?: number[] }
export type Prism = { axis: Axis; from: number; to: number; at: number[]; r: number[]; sides: number }
export type Part = { node: string; paint: string; loft?: Loft; prism?: Prism; frame?: Frame }
export type Face = { ix: number[]; n: number[] }
export type Solid = { v: number[][]; faces: Face[] }
export type Paint = { colour?: string; look?: string; roughness?: number; metalness?: number; glow?: number; blink?: number[]; opacity?: number; map?: string; scale?: number }
// What the looks mod hands over: a look's material and number by its name.
export type Looks = { material(name: string): any; idOf(name: string): number | undefined }
export type Blink = { mat: any; paint: Paint }
export type Lamp = {
  node: string
  colour: string
  intensity: number
  at: number[]
  distance?: number
  decay?: number
  spot?: { aim: number[]; angle: number; penumbra: number }
  shadow?: number
  paint?: string
}

const AX: Record<Axis, number[]> = { x: [0, 1, 2], y: [1, 0, 2], z: [2, 0, 1] }
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const mean = (vs: number[][]) => vs.reduce((m, v) => [m[0] + v[0] / vs.length, m[1] + v[1] / vs.length, m[2] + v[2] / vs.length], [0, 0, 0])
const unit = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }

// A point turned about x by rx, then about y by ry, then moved to `at`.
export function place(v: number[], f?: Frame): number[] {
  if (!f) return v
  const [rx, ry] = f.turn ?? [0, 0], at = f.at ?? [0, 0, 0]
  let c = Math.cos(rx), s = Math.sin(rx)
  const w = [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]
  c = Math.cos(ry); s = Math.sin(ry)
  return [w[0] * c + w[2] * s + at[0], w[1] + at[1], -w[0] * s + w[2] * c + at[2]]
}

function faced(v: number[][], rings: number[][]): Solid {
  const c = mean(v)
  const faces = rings.map(ix => {
    const pts = ix.map(i => v[i]), n = [0, 0, 0]
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1])
    })
    const u = unit(n)
    return { ix, n: dot(u, sub(mean(pts), c)) < 0 ? u.map(x => -x) : u }
  })
  return { v, faces }
}

export function solid(part: Part): Solid {
  const v: number[][] = []
  if (part.loft) {
    const { axis, from, to, a, b = a } = part.loft, [i, j, k] = AX[axis]
    for (const [t, R] of [[from, a], [to, b]] as [number, number[]][])
      for (const [sj, sk] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 0, 0]; p[i] = t; p[j] = R[0] + sj * R[2]; p[k] = R[1] + sk * R[3]; v.push(p)
      }
    return faced(v.map(p => place(p, part.frame)), [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]])
  }
  if (part.prism) {
    const { axis, from, to, at, r, sides: n } = part.prism, [i, j, k] = AX[axis]
    for (const [t, rr] of [[from, r[0]], [to, r[1]]])
      for (let s = 0; s < n; s++) {
        const th = (s + 0.5) * 2 * Math.PI / n, p = [0, 0, 0]
        p[i] = t; p[j] = at[0] + rr * Math.cos(th); p[k] = at[1] + rr * Math.sin(th); v.push(p)
      }
    const rings = [[...Array(n).keys()], [...Array(n).keys()].map(s => n + s)]
    for (let s = 0; s < n; s++) rings.push([s, (s + 1) % n, n + (s + 1) % n, n + s])
    return faced(v.map(p => place(p, part.frame)), rings)
  }
  throw new Error(`a part of node ${part.node} is neither a loft nor a prism`)
}

// Every face fanned into triangles, each wound so its normal points out, handed with the face's normal.
function fans(s: Solid, each: (t: number[][], n: number[]) => void) {
  for (const f of s.faces) for (let i = 1; i < f.ix.length - 1; i++) {
    let t = [s.v[f.ix[0]], s.v[f.ix[i]], s.v[f.ix[i + 1]]]
    if (dot(cross(sub(t[1], t[0]), sub(t[2], t[0])), f.n) < 0) t = [t[0], t[2], t[1]]
    each(t, f.n)
  }
}

// Every face fanned into triangles, as flat [x, y, z, …], each wound so its normal points out.
export function triangles(s: Solid): number[] {
  const out: number[] = []
  fans(s, t => { for (const p of t) out.push(p[0], p[1], p[2]) })
  return out
}

// Where each corner of `triangles`, in its order, lies on a picture one span of which is `scale`
// metres, as flat [u, v, …]: a face's own across the two axes it lies most nearly along, upright and
// unmirrored seen from outside it, u to the right and v up (on a floor or a roof, v toward −z).
export function uvs(s: Solid, scale: number): number[] {
  const out: number[] = []
  fans(s, (t, n) => {
    const [ax, ay, az] = n.map(Math.abs)
    for (const [x, y, z] of t) {
      if (ay >= ax && ay >= az) out.push(x / scale, (n[1] > 0 ? -z : z) / scale)
      else if (ax >= az) out.push((n[0] > 0 ? -z : z) / scale, y / scale)
      else out.push((n[2] > 0 ? x : -x) / scale, y / scale)
    }
  })
  return out
}

export function meshes(THREE: any, dress: (m: any) => any, paints: Record<string, Paint>, parts: Part[], whose: string, maps?: (name: string) => any, looks?: Looks, seed = 0) {
  const owned: { dispose(): void }[] = [], blinks: Blink[] = []
  const mats = new Map<string, any>()
  const paintOf = (name: string) => {
    const p = paints[name]
    if (!p) throw new Error(`${whose} has no paint ${name}`)
    if (p.look !== undefined) {
      const other = (['colour', 'map', 'roughness', 'metalness', 'glow', 'blink', 'opacity'] as const).filter(k => p[k] !== undefined)
      if (other.length) throw new Error(`${whose}: paint ${name} wears the look ${p.look}, and gives ${other.join(', ')} too, which the look works out itself`)
      if (!looks) throw new Error(`${whose}: paint ${name} wears the look ${p.look}, and meshes was handed no looks`)
      if (looks.idOf(p.look) === undefined || !looks.material(p.look)) throw new Error(`${whose}: paint ${name} wears the look ${p.look}, which the looks do not hold`)
      return p
    }
    if (p.colour === undefined) throw new Error(`${whose}: paint ${name} has neither a colour nor a look`)
    if (p.map !== undefined && !(Number.isFinite(p.scale) && p.scale! > 0)) throw new Error(`${whose}: paint ${name} lays the picture ${p.map}, and gives no scale above 0`)
    if (p.map !== undefined && !maps) throw new Error(`${whose}: paint ${name} lays the picture ${p.map}, and meshes was handed no maps`)
    return p
  }
  const mat = (name: string) => {
    if (!mats.has(name)) {
      const p = paintOf(name)
      if (p.look !== undefined) {
        mats.set(name, looks!.material(p.look))
        return mats.get(name)
      }
      const colour = new THREE.Color(p.colour)
      const made = dress(new THREE.MeshStandardMaterial({
        color: colour, flatShading: true,
        ...(p.map === undefined ? {} : { map: maps!(p.map) }),
        ...(p.roughness === undefined ? {} : { roughness: p.roughness }),
        ...(p.metalness === undefined ? {} : { metalness: p.metalness }),
        ...(p.glow === undefined ? {} : { emissive: colour, emissiveIntensity: p.glow }),
        ...(p.opacity === undefined || p.opacity >= 1 ? {} : { transparent: true, opacity: p.opacity, depthWrite: false }),
      }))
      owned.push(made)
      mats.set(name, made)
      if (p.blink) blinks.push({ mat: made, paint: p })
    }
    return mats.get(name)
  }
  const batches = new Map<string, Map<string, { tris: number[]; uv?: number[]; look?: number[] }>>()
  parts.forEach((part, index) => {
    if (!batches.has(part.node)) batches.set(part.node, new Map())
    const byPaint = batches.get(part.node)!
    const p = paintOf(part.paint)
    if (!byPaint.has(part.paint)) byPaint.set(part.paint, { tris: [], ...(p.map === undefined && p.look === undefined ? {} : { uv: [] }), ...(p.look === undefined ? {} : { look: [] }) })
    const batch = byPaint.get(part.paint)!
    const s = solid(part)
    const tris = triangles(s)
    batch.tris.push(...tris)
    batch.uv?.push(...uvs(s, p.look === undefined ? p.scale! : 1))
    if (batch.look) {
      const id = looks!.idOf(p.look!)!
      for (let i = 0; i < tris.length; i += 3) batch.look.push(id, seed, index)
    }
  })
  const made = new Map<string, any[]>()
  for (const [node, byPaint] of batches)
    made.set(node, [...byPaint].map(([paint, { tris, uv, look }]) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3))
      if (uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
      if (look) {
        geo.setAttribute('lookId', new THREE.Float32BufferAttribute(look.filter((_, i) => i % 3 === 0), 1))
        geo.setAttribute('lookInfo', new THREE.Float32BufferAttribute(look, 3))
      }
      geo.computeVertexNormals()
      owned.push(geo)
      const out = new THREE.Mesh(geo, mat(paint))
      out.receiveShadow = true
      out.castShadow = !out.material.transparent
      return out
    }))
  return { meshes: made, owned, blinks, materials: mats }
}

export function lights(THREE: any, lamps: Lamp[]) {
  const owned: { dispose(): void }[] = []
  const made = new Map<string, any[]>()
  for (const l of lamps) {
    const colour = new THREE.Color(l.colour)
    const decay = l.decay ?? 2, distance = l.distance ?? 0
    const light = l.spot
      ? new THREE.SpotLight(colour, l.intensity, distance, l.spot.angle, l.spot.penumbra, decay)
      : new THREE.PointLight(colour, l.intensity, distance, decay)
    light.position.fromArray(l.at)
    if (l.paint !== undefined) light.userData.paint = l.paint
    const list = made.get(l.node) ?? []
    list.push(light)
    if (l.spot) {
      light.target = new THREE.Object3D()
      light.target.position.fromArray(l.spot.aim)
      list.push(light.target)
    }
    if (l.shadow) {
      light.castShadow = true
      light.shadow.mapSize.set(l.shadow, l.shadow)
      light.shadow.camera.near = 0.2
      light.shadow.camera.far = distance || 500
      light.shadow.bias = -0.0005
    }
    made.set(l.node, list)
    owned.push(light)
  }
  return { lights: made, owned }
}

export function blink(blinks: Blink[], now: number) {
  for (const b of blinks) {
    const [hz, on] = b.paint.blink!
    b.mat.emissiveIntensity = (now / 1000 * hz) % 1 < on ? b.paint.glow ?? 1 : 0
  }
}

type Node = { parent?: string; at: number[]; turn?: number[]; mirror?: boolean }
export type Model = { paints: Record<string, Paint>; nodes: Record<string, Node>; parts: Part[]; lights?: Lamp[] }
type Drawn = { kind: string; root: any; owned: { dispose(): void }[]; blinks: Blink[] }
type Fixed = { kinds?: Record<string, string> }
type Land = (plugins: Plugins) => { height(x: number, z: number): number } | undefined
type Models = (plugins: Plugins) => { models: Record<string, Model>; rows: Row[] }
type LooksMod = (plugins: Plugins) => Looks

// Whether two values are the same: the same number (NaN the same as NaN), string, boolean or null, or
// arrays and plain objects of the same, item by item and field by field, a field holding undefined the
// same as one not there. Read every frame against the copy of each kind's model, so it walks the two
// and makes nothing.
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

export function solids() {
  const drawn = new Map<number, Drawn>()
  // A copy of each kind's model as its rows were drawn from it, taken when it changes: a loader file
  // refilled in place, a dev page's panel's edit and a mod's fresh model of other numbers are all noticed.
  const seen = new Map<string, Model>()
  const asked = new Set<string>()

  function make(plugins: Plugins, m: Model, kind: string, row: number, looks: Looks | undefined): Drawn {
    const { THREE, scene, dress } = plugins.render3d
    const root = new THREE.Group()
    const nodes = new Map<string, any>()
    for (const [name, n] of Object.entries(m.nodes)) {
      const o = new THREE.Group()
      o.position.fromArray(n.at)
      o.rotation.order = 'ZYX'
      if (n.turn) o.rotation.set(n.turn[0], n.turn[1], 0)
      if (n.mirror) o.scale.x = -1
      const parent = n.parent === undefined ? root : nodes.get(n.parent)
      if (!parent) throw new Error(`solids: node ${name} of ${kind}'s model hangs from ${n.parent}, which is not listed before it`)
      parent.add(o)
      nodes.set(name, o)
    }
    const { meshes: made, owned, blinks } = meshes(THREE, dress, m.paints, m.parts, `solids: model of ${kind}`, name => plugins.loader.get(name), looks, row)
    for (const [node, list] of made) {
      if (!nodes.has(node)) throw new Error(`solids: a part of ${kind}'s model hangs from node ${node}, which the model does not list`)
      nodes.get(node).add(...list)
    }
    const lit = lights(THREE, m.lights ?? [])
    for (const [node, list] of lit.lights) {
      if (!nodes.has(node)) throw new Error(`solids: a light of ${kind}'s model hangs from node ${node}, which the model does not list`)
      nodes.get(node).add(...list)
    }
    scene.add(root)
    return { kind, root, owned: [...owned, ...lit.owned], blinks }
  }

  // Whether the loader holds every picture the model's paints lay, asking it for any it has not got.
  function pictured(plugins: Plugins, m: Model, kind: string) {
    let all = true
    for (const [name, p] of Object.entries(m.paints)) {
      if (p.map === undefined) continue
      if (plugins.loader.catalogued(p.map)?.type !== 'texture') throw new Error(`solids: paint ${name} of ${kind}'s model lays ${p.map}, which is no texture entry of the loader's catalogue`)
      if (plugins.loader.ready(p.map)) continue
      all = false
      // The loader writes a failure to the console once itself.
      if (!asked.has(p.map)) { asked.add(p.map); plugins.loader.load(p.map).catch(() => {}) }
    }
    return all
  }

  // Whether the looks mod holds the material of every look the model's paints wear.
  function looked(m: Model, looks: Looks | undefined) {
    for (const p of Object.values(m.paints)) {
      if (p.look === undefined) continue
      if (!looks || looks.idOf(p.look) === undefined || !looks.material(p.look)) return false
    }
    return true
  }

  function drop(id: number) {
    const d = drawn.get(id)
    if (!d) return
    d.root.removeFromParent()
    for (const o of d.owned) o.dispose()
    drawn.delete(id)
  }

  return {
    meshes,
    lights,
    blink,
    solid,
    afterTick(plugins: Plugins) {
      const k = plugins.wire.scene.world?.solids as Fixed | undefined
      if (!k) return
      ahead(plugins.wire.scene, 'solids', 'land')
      ahead(plugins.wire.scene, 'solids', 'looks')
      const ground = mod<Land>(plugins.wire.scene.world!, 'solids', 'land')?.(plugins)
      const looks = mod<LooksMod>(plugins.wire.scene.world!, 'solids', 'looks')?.(plugins)
      const now = performance.now()
      const models = new Map<string, Model>()
      for (const [kind, name] of Object.entries(k.kinds ?? {})) models.set(kind, json(plugins.wire, name) as Model)
      // The rows drawn: the wire's of the kinds `kinds` names, and every one a mod hands over, in place of
      // the wire's of each kind a mod hands a model for.
      const givenRows: Row[] = [], givenKinds = new Set<string>()
      for (const given of modsOf<Models>(plugins.wire.scene.world!, 'solids', 'models')) {
        const g = given(plugins)
        for (const [kind, m] of Object.entries(g.models)) { models.set(kind, m); givenKinds.add(kind) }
        givenRows.push(...g.rows)
      }
      const rows = [...plugins.wire.rows.filter(r => !givenKinds.has(r.kind)), ...givenRows]
      for (const [kind, m] of models) {
        const was = seen.get(kind)
        if (was && same(m, was)) continue
        if (was) for (const [id, d] of [...drawn]) if (d.kind === kind) drop(id)
        seen.set(kind, structuredClone(m))
      }
      const ready = new Map<string, boolean>()
      for (const [kind, m] of models) ready.set(kind, pictured(plugins, m, kind) && looked(m, looks))
      const here = new Set<number>()
      for (const row of rows) {
        const m = models.get(row.kind)
        if (!m || !ready.get(row.kind)) continue
        here.add(row.id)
        if (!drawn.has(row.id)) drawn.set(row.id, make(plugins, m, row.kind, row.id, looks))
        const d = drawn.get(row.id)!
        const [x, y, z] = row.data.pos as number[]
        d.root.position.set(x, ground?.height(x, z) ?? y, z)
        // The whole turn: render3d turns the model between the steps by writing its quaternion, and
        // three reads a turn past a quarter back as a half turn on x and z, so a model given its y
        // alone would be drawn upside down.
        const rot = row.data.rot as number[] | undefined
        if (rot) d.root.quaternion.set(rot[0], rot[1], rot[2], rot[3])
        else d.root.rotation.set(0, row.data.yaw, 0)
        blink(d.blinks, now)
        d.root.updateMatrixWorld(true)
      }
      for (const id of [...drawn.keys()]) if (!here.has(id)) drop(id)
    },
    group(id: number) {
      return drawn.get(id)?.root
    },
    close() {
      for (const id of [...drawn.keys()]) drop(id)
      seen.clear()
      asked.clear()
    },
  }
}
