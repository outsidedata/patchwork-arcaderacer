// fabric3d: fabric moved on the GPU. A fabric is its points, each a texel of float textures, moved by
// shader passes through render3d's renderer and drawn as one mesh whose every vertex reads where its point is.
// No point is on the CPU and nothing is read back, so a fabric is the page's alone: it has no row, no prefab
// and no server half, every page moves its own, and no rule reads one. Its fixed numbers are the scene's
// `world.fabric3d` and the fabrics file that names.
//
// fabric3d knows no cloth, no shape and no body. It keeps a table from a word to that word's behavior
// (`world.fabric3d.mods.behaviors`), is handed what holds a fabric by its `sources` mods and what a fabric
// meets, as the GPU meets it, by its `solids` mod, and owns what is the same for every fabric: the passes,
// the pins, the clock and the mesh.
//
// `world.fabric3d`:
//   fabrics     the name in the scene's `loader` catalogue of the fabrics file (below)
//   attach      a list, each a fabric put in the scene, one of
//                 { fabric, of }         the fabric kept on every thing the `sources` mods hand back whose `of`
//                                        is `of`, held to it by the fabric's pins, from the frame the thing is
//                                        handed until the frame it is not
//                 { fabric, at, turn? }  one fabric of no pins laid at `at` [x, y, z] metres, turned by `turn`
//                                        [x, y, z] degrees, and left to fall
//   gravity    [x, y, z] metres a second a second
//   wind        [x, y, z] metres a second the air moves, with no `wind` mod; with neither, the air is still
//   turbulence  { size, strength }, or none: the air's speed changed from place to place and moment to
//               moment by as much as `strength` of the wind's speed, in gusts `size` metres across carried
//               along by the wind
//   substep     the longest a fabric is moved in one go, seconds: a frame's time is cut into as many equal
//               substeps as keep each no longer
//   passes      how many times a substep pulls every point toward its rest lengths
//   most        the most seconds a fabric is moved in one frame; a frame longer than it moves the fabric that
//               far and no further
//   mods        behaviors  plugins whose `behaviors()` deliver words (Words, below)
//               solids     one plugin, whose `solids(plugins)` hands back what every fabric meets, as the GPU
//                          meets it: `{ glsl, uniforms, now() }`. `glsl` defines `meetCount` and `meetOf`
//                          (`glsl.ts`, MEETS), how many things there are and how far a point is to move to
//                          stand clear of one; `uniforms` is what it reads; and `now()` is called the moment
//                          the fabrics are moved, as the scene is drawn, so what they meet stands where the
//                          frame draws it (gpgpu3d's, `gpgpu3d.fabric3d.ts`: the things it holds, shapes3d's
//                          shapes, terrain3d's land and the capsules of anim's and motion3d's bodies among
//                          them). Asked once, when the passes are made. With none named a fabric meets
//                          nothing.
//               sources    plugins whose `sources(plugins)` hand back, once a frame, the things a fabric is
//                          held to (Things, below)
//               wind       one plugin whose `wind(plugins)` is the wind now, [x, y, z] metres a second, or
//                          undefined while it has none, when `world.fabric3d.wind` is used
//               attach     one plugin whose `attach(plugins)` hands back, each frame, more entries of
//                          `attach`, each `{ fabric, of }`, kept after the scene's own and checked as they
//                          are (item3d's: what each body of its bodies sheet wears). Its plugin is listed
//                          before fabric3d. With none named the scene's `attach` is all there is.
//
// The fabrics file is `{ fabrics: { <name>: fabric } }`, a fabric:
//   weight    kilograms a square metre
//   stretch   0 to 1, how much of the way a pass pulls each point back to its rest length from the points
//             it is linked to along the weave; `bend` the same from those it is linked to over a fold, which
//             keep it as flat as it was cut
//   drag      how much of its speed a point loses a second to the air
//   catch     how hard the air pushes it: newtons a square metre for each metre a second the air moves
//             across its face
//   friction  0 to 1, how much of a point's move across a thing it meets is held back
//   thick     metres it is kept clear of what it meets
//   pins      a list, each the points it holds and `on`, the point of the thing the fabric is attached to
//             that holds them (Pins, below)
//   and its words, every other field: one whose behavior gives a cut, and one whose behavior gives a
//   `material`, how it is drawn.
// A fabric starts lying as its cut has it, in the frame of its first pin, or where its `attach` lays it, and
// moves from there.
//
// Cuts. A cut is one of two, by what its word's behavior gives:
//   a grid   (`rest`) `points` [columns, rows] of them, a column and a row each, laid where the behavior puts
//            the point `u` of the way across and `v` of the way along. Each is linked to its four neighbours
//            along the weave, to its four across the weave (`shear`, 0 to 1, which keep it square) and to its
//            four two points along (`bend`). A grid gives `points` and `shear`.
//   sewn     (`sewn`) a mesh of triangles the behavior hands whole, a garment's say: its points where they
//            lie at rest, its triangles, its pieces, each a name and the points of it, and where each point
//            of what it was cut on stood. Each point is linked to every point it shares a triangle's edge
//            with (`stretch`) and to the point across each edge from it (`bend`). A sewn fabric gives no
//            `points` and no `shear`: its points are its mesh's, and its triangles keep it square.
//
// Pins. A grid's pin is `{ on, from, to?, at?, turn? }`: the points from column and row `from` to column and
// row `to` (or `from` alone). The point `from` is held at `at` [x, y, z] metres in the frame of the thing's
// point `on`, and the pin's other points where they lie from it in the fabric's cut, turned by `turn` [x, y,
// z] degrees: a pin of one point holds a corner, a pin of an edge holds the edge stiff along a pole.
// A sewn fabric's pin is `{ on, piece }`: every point of the piece `piece`, held where it lay from the point
// `on` when the fabric was cut, as that point has since moved and turned: a skirt's waistband on the hips.
// `on` is the end of the name of one of the points the cut says it was cut on. No two pins hold one point.
//
// Words. A fabric's field that is none of the above is a word, and its value that word's numbers. Each plugin
// `world.fabric3d.mods.behaviors` names exports `behaviors()` → `{ <word>: Behavior }`, laid over the last:
//
//   Behavior.check(data, what, world)        throws a sentence naming `what` for numbers it cannot use
//   Behavior.rest(data, u, v)                a grid's cut: where the point `u` of the way across and `v` of
//                                            the way along lies in the fabric's own frame, [x, y, z] metres
//   Behavior.sewn(data, { plugins, name })   a sewn cut (`Sewn`), or undefined while what it is cut from loads
//   Behavior.material(data, { plugins, name })   how it is drawn: `{ material, span? }`, a three.js material of
//                                            its own for this one fabric, or undefined while what it draws
//                                            with loads; with a `span`, the fabric's uv runs `span` metres to
//                                            1, and with none 0 to 1 across and along the whole fabric
//
// fabric3d dresses the material (`render3d`'s `dress`) so the scene's light reaches it, draws it from both
// sides, and has the mesh cast and take shadows. A word no plugin delivers throws, naming the fabric, the word
// and `world.fabric3d.mods.behaviors`; so does a fabric with no cut, no drawing, or two of either. shapes3d
// delivers the cut `plane` (`shapes3d.fabric3d.ts`), loader the cut `garment` (`loader.fabric3d.ts`) and
// solids the drawing `paint` (`solids.fabric3d.ts`).
//
// Things. What `sources` hand back, each `{ key, of, point(on) }`: `key` the thing's own, the
// same every frame, `of` what it is, which an `attach` names, and `point(on)` its point of that
// word, as a three.js object, read as it is drawn (between the steps, where render3d has put it), or as `{ at,
// rot? }`, a place in the world and a turn [x, y, z, w]. A thing is handed only once it is drawn, so a point
// it does not have throws, naming the thing and the word. anim and motion3d hand every body they draw, its
// points its bones, its props and their empties (`anim.fabric3d.ts`, `motion3d.fabric3d.ts`); shapes3d every
// shape, its point `pos` (`shapes3d.fabric3d.ts`); a game's own plugin whatever it draws.
//
// The clock. A fabric is moved to the moment the frame draws, `(wire.n − 1 + wire.between) × dt`, inside the
// scene's draw (the scene's `onBeforeRender`), once a frame, before anything of the frame is drawn, its
// shadows too: there every pin's point stands where it is drawn, so a held edge never trails what holds it.
// Each substep puts the held points a little further from where their pins had them a frame ago to where
// they have them now. A thing whose point's object, or any object above it, raises `userData.teleport` has its
// fabrics laid again where it now is.
//
// Each substep is three kinds of pass: the move (`glsl.ts`'s MOVE), `passes` of the lengths (HOLD), and what it
// meets (MEETS); then, once a frame, the way each point faces (FACES), which the mesh is lit by. A fabric does
// not meet itself or another fabric.
//
// It hands out `fabrics`, each fabric in the scene now, `{ key, fabric, of?, thing?, mesh, points, columns,
// rows }`, `points` how many it has and `columns` and `rows` the texels they are kept in, across and along (a
// grid's own columns and rows), and `places(key)`, every point of one read back from the GPU as [x, y, z, …],
// one after another: a readout for a testbed, which stalls the frame it is asked in and is never asked by a
// game. fabric3d is listed before render3d (listed after it, it throws). `close` frees every target, texture,
// mesh and material it made, and takes its hook off the scene.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { DRAWN, FACES, HOLD, LAY, MEETS, MOVE, NOTHING, PIN, QUAD } from './glsl.ts'

type Three = typeof import('three')

export type Pin = { on: string; from?: number[]; to?: number[]; piece?: string; at?: number[]; turn?: number[] }
export type Fabric = {
  points?: number[]; weight: number; stretch: number; shear?: number; bend: number
  drag: number; catch: number; friction: number; thick: number; pins?: Pin[]
  [word: string]: any
}
export type Fabrics = { fabrics: Record<string, Fabric> }
export type Attach = { fabric: string; of?: string; at?: number[]; turn?: number[] }
export type Settings = {
  fabrics: string; attach?: Attach[]
  gravity: number[]; wind?: number[]; turbulence?: { size: number; strength: number }
  substep: number; passes: number; most: number; mods?: Record<string, string | string[]>
}

// A sewn cut (the header, Cuts): `points` where each point lies at rest in the cut's own frame, [x, y, z]
// metres each; the drawn vertices, each `of` a point, a seam's point drawn once for each piece that meets
// there, with its `uv`, [u, v] metres, where it lies on the cloth as it was cut flat; `index` the triangles,
// three vertices each; `pieces` the points of each piece by its name; and `stood`, by the word of each point
// of what the fabric was cut on, a bone say, that point's frame as the fabric was cut, sixteen numbers
// column by column, in the frame `points` are in.
export type Sewn = {
  points: Float32Array; of: Uint32Array; uv: Float32Array; index: Uint32Array
  pieces: Record<string, number[]>; stood: Record<string, number[]>
}
// A word's behavior (the header, Words).
// A drawing hands back the material fabric3d dresses with its surface, or, where the material is one its own
// plugin has to dress (supershader3d's, a look), `dress(surface)`, which makes it dressed with the surface it is
// handed, and `vertex`, numbers written on every drawn vertex under each name (`lookId`).
export type Drawn = { span?: number } & ({ material: THREE.Material } | { dress(surface: unknown): THREE.Material; vertex: Record<string, number> })
export type Behavior = {
  check(data: any, what: string, world: Record<string, any>): void
  rest?(data: any, u: number, v: number): number[]
  sewn?(data: any, made: { plugins: Plugins; name: string }): Sewn | undefined
  material?(data: any, made: { plugins: Plugins; name: string }): Drawn | undefined
}
// What the `sources` mods hand back (the header, Things).
export type Placed = { at: number[]; rot?: number[] }
export type Thing = { key: string; of: string; point(on: string): THREE.Object3D | Placed | undefined }
export type Things = (plugins: Plugins) => readonly Thing[]
// What the `solids` mod hands back: the GLSL the MEETS pass is made with, the uniforms it reads, and `now`,
// called the moment the fabrics are moved.
export type Solids = (plugins: Plugins) => { glsl: string; uniforms: Record<string, THREE.IUniform>; now(): void }
export type Wind = (plugins: Plugins) => number[] | undefined
// The `attach` mod: more entries of `attach`, each a fabric held to every thing of an `of`, as they are now.
export type Attaching = (plugins: Plugins) => { fabric: string; of: string }[]

export const FIELDS = ['points', 'weight', 'stretch', 'shear', 'bend', 'drag', 'catch', 'friction', 'thick', 'pins'] as const satisfies readonly (keyof Fabric)[]
export const PINNED = ['on', 'from', 'to', 'at', 'turn'] as const satisfies readonly (keyof Pin)[]
export const WORN = ['on', 'piece'] as const satisfies readonly (keyof Pin)[]
export const WORLD = ['fabrics', 'attach', 'gravity', 'wind', 'turbulence', 'substep', 'passes', 'most', 'mods'] as const satisfies readonly (keyof Settings)[]
export const ATTACH = ['fabric', 'of', 'at', 'turn'] as const satisfies readonly (keyof Attach)[]
export const MODS = ['behaviors', 'solids', 'sources', 'wind', 'attach']

// What holds two linked points (`glsl.ts`, linkTex).
const STRETCH = 1, SHEAR = 2, BEND = 3

// The words a scene's mods deliver: each plugin `world.fabric3d.mods.behaviors` names, laid over the last.
export const behaviorsOf = (world: Record<string, any>): Record<string, Behavior> =>
  Object.assign({}, ...modsOf<() => Record<string, Behavior>>(world, 'fabric3d', 'behaviors').map(f => f()))
// The words of a fabric: its fields that are none of fabric3d's own.
export const wordsOf = (f: Fabric) => Object.keys(f).filter(k => !(FIELDS as readonly string[]).includes(k))

const said = (v: unknown) => JSON.stringify(v)
const numbers = (v: unknown, n: number): v is number[] => Array.isArray(v) && v.length === n && v.every(e => typeof e === 'number' && Number.isFinite(e))
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const within = (v: unknown, least: number, most: number): v is number => typeof v === 'number' && v >= least && v <= most

// A fabric's cut and its drawing: the one word of each its behaviors give, and their numbers.
export function wordsFor(name: string, f: Fabric, words: Record<string, Behavior>) {
  const mine = wordsOf(f)
  for (const w of mine)
    if (!words[w]) throw new Error(`fabric3d has no behavior for the fabric ${name}, of the word ${w}: no plugin world.fabric3d.mods.behaviors names delivers it`)
  const cuts = mine.filter(w => words[w].rest || words[w].sewn), drawings = mine.filter(w => words[w].material)
  if (cuts.length !== 1) throw new Error(`fabric3d's fabric ${name} has ${cuts.length ? `the cuts ${cuts.join(', ')}` : 'no cut'}, and a fabric is cut by one word whose behavior gives a rest or a sewn`)
  if (drawings.length !== 1) throw new Error(`fabric3d's fabric ${name} has ${drawings.length ? `the drawings ${drawings.join(', ')}` : 'no drawing'}, and a fabric is drawn by one word whose behavior gives a material`)
  return { cut: cuts[0], drawing: drawings[0] }
}

// Every point a grid's pin holds, [column, row] each, its `from` first.
export function pointsOf(pin: Pin): number[][] {
  const [c0, r0] = pin.from!, [c1, r1] = pin.to ?? pin.from!
  const out: number[][] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([c, r])
  return out
}

export function check(file: Fabrics, own: Record<string, any>, words: Record<string, Behavior> = {}, world: Record<string, any> = {}) {
  for (const k of Object.keys(own)) if (!(WORLD as readonly string[]).includes(k)) throw new Error(`world.fabric3d has ${k}, which fabric3d does not know`)
  for (const k of Object.keys(own.mods ?? {})) if (!MODS.includes(k)) throw new Error(`world.fabric3d.mods has ${k}, and fabric3d's mods are ${MODS.join(', ')}`)
  if (!numbers(own.gravity, 3)) throw new Error(`world.fabric3d.gravity is ${said(own.gravity)}, and it is [x, y, z] metres a second a second`)
  if (own.wind !== undefined && !numbers(own.wind, 3)) throw new Error(`world.fabric3d.wind is ${said(own.wind)}, and it is [x, y, z] metres a second`)
  if (own.turbulence !== undefined) {
    const t = own.turbulence
    if (!t || typeof t !== 'object' || !(t.size > 0) || !(t.strength >= 0)) throw new Error(`world.fabric3d.turbulence is ${said(t)}, and it is { size, strength }, size metres above 0 and strength at or above 0`)
  }
  if (!(own.substep > 0)) throw new Error(`world.fabric3d.substep is ${said(own.substep)}, and it is seconds above 0`)
  if (!whole(own.passes) || own.passes < 1) throw new Error(`world.fabric3d.passes is ${said(own.passes)}, and it is a whole number above 0`)
  if (!(own.most > 0)) throw new Error(`world.fabric3d.most is ${said(own.most)}, and it is seconds above 0`)
  if (!file || typeof file.fabrics !== 'object' || !file.fabrics) throw new Error("fabric3d's fabrics file has no fabrics, and it is { fabrics: { <name>: fabric } }")
  for (const k of Object.keys(file)) if (k !== 'fabrics') throw new Error(`fabric3d's fabrics file has ${k}, which fabric3d does not know`)

  for (const [name, f] of Object.entries(file.fabrics)) {
    const what = `fabric3d's fabric ${name}`
    const { cut, drawing } = wordsFor(name, f, words)
    for (const w of [cut, drawing]) words[w].check(f[w], `${what}'s ${w}`, world)
    const grid = !!words[cut].rest
    if (grid) {
      if (!numbers(f.points, 2) || !f.points.every(n => whole(n) && n >= 2)) throw new Error(`${what} has points of ${said(f.points)}, and they are [columns, rows], each a whole number of 2 or more`)
      if (!within(f.shear, 0, 1)) throw new Error(`${what} has a shear of ${said(f.shear)}, and it is from 0 to 1`)
    } else {
      if (f.points !== undefined) throw new Error(`${what} has points of ${said(f.points)}, and it is sewn by ${cut}: its points are its mesh's`)
      if (f.shear !== undefined) throw new Error(`${what} has a shear of ${said(f.shear)}, and it is sewn by ${cut}: its triangles keep it square`)
    }
    if (!(f.weight > 0)) throw new Error(`${what} has a weight of ${said(f.weight)}, and it is kilograms a square metre above 0`)
    for (const k of ['stretch', 'bend', 'friction'] as const)
      if (!within(f[k], 0, 1)) throw new Error(`${what} has a ${k} of ${said(f[k])}, and it is from 0 to 1`)
    for (const k of ['drag', 'catch', 'thick'] as const)
      if (!within(f[k], 0, Infinity)) throw new Error(`${what} has a ${k} of ${said(f[k])}, and it is at or above 0`)
    if (f.pins !== undefined) {
      const fields: readonly string[] = grid ? PINNED : WORN
      const shape = `{ ${fields.join(', ')} }`
      if (!Array.isArray(f.pins)) throw new Error(`${what} has pins of ${said(f.pins)}, and they are a list, each ${shape}`)
      const [cols, rows] = grid ? f.points! : [0, 0]
      const inGrid = (p: unknown): p is number[] => numbers(p, 2) && whole(p[0]) && whole(p[1]) && p[0] >= 0 && p[0] < cols && p[1] >= 0 && p[1] < rows
      const taken = new Map<string, number>()
      f.pins.forEach((pin: unknown, i) => {
        const at = `${what}'s pin ${i}`
        if (!pin || typeof pin !== 'object' || Array.isArray(pin)) throw new Error(`${at} is ${said(pin)}, and a pin is ${shape}`)
        for (const k of Object.keys(pin)) if (!fields.includes(k)) throw new Error(`${at} has ${k}, and a pin of a fabric ${grid ? 'cut as a grid' : `sewn by ${cut}`} is ${shape}`)
        const p = pin as Pin
        if (typeof p.on !== 'string') throw new Error(`${at} has an on of ${said(p.on)}, and on is the word of the point it is held to`)
        if (!grid) {
          if (typeof p.piece !== 'string') throw new Error(`${at} has a piece of ${said(p.piece)}, and piece is the name of the piece it holds`)
          const had = taken.get(p.piece)
          if (had !== undefined) throw new Error(`${at} holds the piece ${p.piece}, which pin ${had} holds`)
          taken.set(p.piece, i)
          return
        }
        if (!inGrid(p.from)) throw new Error(`${at} has a from of ${said(p.from)}, and it is [column, row] of a point of its ${cols} by ${rows}`)
        if (p.to !== undefined && (!inGrid(p.to) || p.to[0] < p.from[0] || p.to[1] < p.from[1])) throw new Error(`${at} has a to of ${said(p.to)}, and it is [column, row] of a point of its ${cols} by ${rows}, at or past its from`)
        if (p.at !== undefined && !numbers(p.at, 3)) throw new Error(`${at} has an at of ${said(p.at)}, and it is [x, y, z] metres`)
        if (p.turn !== undefined && !numbers(p.turn, 3)) throw new Error(`${at} has a turn of ${said(p.turn)}, and it is [x, y, z] degrees`)
        for (const [c, r] of pointsOf(p)) {
          const had = taken.get(`${c} ${r}`)
          if (had !== undefined) throw new Error(`${at} holds the point [${c}, ${r}], which pin ${had} holds`)
          taken.set(`${c} ${r}`, i)
        }
      })
    }
  }

  if (own.attach !== undefined) {
    if (!Array.isArray(own.attach)) throw new Error(`world.fabric3d.attach is ${said(own.attach)}, and it is a list, each { fabric, of } or { fabric, at, turn }`)
    own.attach.forEach((a: unknown, i: number) => attached(a, `world.fabric3d.attach ${i}`, file, world))
  }
}

// One entry of `attach`, the scene's own or one the `attach` mod hands, checked against the fabrics file: `at`
// names it in what it throws.
export function attached(a: unknown, at: string, file: Fabrics, world: Record<string, any>): asserts a is Attach {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${at} is ${said(a)}, and it is { fabric, of } or { fabric, at, turn }`)
  for (const k of Object.keys(a)) if (!(ATTACH as readonly string[]).includes(k)) throw new Error(`${at} has ${k}, and it is { fabric, of } or { fabric, at, turn }`)
  const e = a as Attach
  const f = typeof e.fabric === 'string' ? file.fabrics[e.fabric] : undefined
  if (!f) throw new Error(`${at} puts in ${said(e.fabric)}, which the fabrics file has no fabric of`)
  if ((e.of === undefined) === (e.at === undefined)) throw new Error(`${at} is ${said(a)}, and it gives an of, the things it is held to, or an at, where it is laid, and not both`)
  if (e.of !== undefined) {
    if (typeof e.of !== 'string') throw new Error(`${at} has an of of ${said(e.of)}, and of is what the things it is held to are of`)
    if (e.turn !== undefined) throw new Error(`${at} has a turn and an of, and a fabric held to a thing is turned by its pins`)
    if (!f.pins?.length) throw new Error(`${at} holds ${e.fabric} to every ${e.of}, and ${e.fabric} has no pins`)
    if (!modsOf(world, 'fabric3d', 'sources').length) throw new Error(`${at} holds ${e.fabric} to every ${e.of}, and world.fabric3d.mods names no sources`)
  } else {
    if (!numbers(e.at, 3)) throw new Error(`${at} has an at of ${said(e.at)}, and it is [x, y, z] metres`)
    if (e.turn !== undefined && !numbers(e.turn, 3)) throw new Error(`${at} has a turn of ${said(e.turn)}, and it is [x, y, z] degrees`)
    if (f.pins?.length) throw new Error(`${at} lays ${e.fabric} at a place, and ${e.fabric} has pins, which hold it to a thing: give it an of`)
  }
}

// A fabric as its cut lays it, whichever cut that is, as the passes and the mesh read it: `count` points kept
// in texels `w` across and `h` along, the point `i` at texel [i mod w, i over w];
//   rest      every texel's [x, y, z, 1], where its point lies in the cut's own frame, or four noughts for a
//             texel that is no point
//   held      every point's pin, its number in the fabric's `pins`, or -1
//   links     `linked` texels a point: the points it is held to (`glsl.ts`, linkTex)
//   ring      `rings` texels a point: the triangles it is a corner of (`glsl.ts`, ringTex)
//   texel     the drawn vertices, each the texel of its point; `uv` each one's place on the cloth as it was cut
//             flat, [u, v] metres from the cloth's corner; `index` the triangles, three vertices each
//   across    how many metres the cloth runs across and `along`
//   stood     for each pin of a sewn fabric, the frame its point `on` stood in as the fabric was cut
export type Laid = {
  w: number; h: number; count: number
  rest: Float32Array; held: Int32Array
  links: Float32Array; linked: number
  ring: Float32Array; rings: number
  texel: Float32Array; uv: Float32Array; index: Uint32Array
  across: number; along: number
  stood: (number[] | undefined)[]
}

// The links and the rings of `count` points kept `w` across: `pairs` [a, b, what holds them] each, and
// `triangles` three points each, both by the points' numbers; `at` where each point lies at rest.
function woven(count: number, w: number, h: number, at: Float32Array, pairs: number[][], triangles: ArrayLike<number>) {
  const gap = (a: number, b: number) => Math.hypot(at[a * 3] - at[b * 3], at[a * 3 + 1] - at[b * 3 + 1], at[a * 3 + 2] - at[b * 3 + 2])
  const to: number[][][] = Array.from({ length: count }, () => [])
  for (const [a, b, kind] of pairs) {
    const length = gap(a, b)
    to[a].push([b, length, kind])
    to[b].push([a, length, kind])
  }
  const linked = Math.max(1, ...to.map(l => l.length))
  const links = new Float32Array(w * linked * h * 4)
  to.forEach((list, i) => list.forEach(([other, length, kind], k) => links.set([other % w, Math.floor(other / w), length, kind], (i * linked + k) * 4)))
  const round: number[][][] = Array.from({ length: count }, () => [])
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [triangles[t], triangles[t + 1], triangles[t + 2]]
    round[a].push([b, c])
    round[b].push([c, a])
    round[c].push([a, b])
  }
  const rings = Math.max(1, ...round.map(l => l.length))
  const ring = new Float32Array(w * rings * h * 4).fill(-1)
  round.forEach((list, i) => list.forEach(([b, c], k) => ring.set([b % w, Math.floor(b / w), c % w, Math.floor(c / w)], (i * rings + k) * 4)))
  return { links, linked, ring, rings }
}

// A grid as its cut lays it (the header, Cuts).
export function laid(f: Fabric, cut: Behavior, data: unknown): Laid {
  const [cols, rows] = f.points!
  const count = cols * rows
  const at = new Float32Array(count * 3)
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) at.set(cut.rest!(data, c / (cols - 1), r / (rows - 1)), (r * cols + c) * 3)
  const rest = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) rest.set([at[i * 3], at[i * 3 + 1], at[i * 3 + 2], 1], i * 4)
  const held = new Int32Array(count).fill(-1)
  ;(f.pins ?? []).forEach((pin, i) => { for (const [c, r] of pointsOf(pin)) held[r * cols + c] = i })
  const gap = (a: number, b: number) => Math.hypot(at[a * 3] - at[b * 3], at[a * 3 + 1] - at[b * 3 + 1], at[a * 3 + 2] - at[b * 3 + 2])
  let across = 0, along = 0
  for (let c = 1; c < cols; c++) across += gap(c, c - 1)
  for (let r = 1; r < rows; r++) along += gap(r * cols, (r - 1) * cols)
  const pairs: number[][] = []
  const pair = (c: number, r: number, dc: number, dr: number, kind: number) => {
    if (c + dc >= 0 && c + dc < cols && r + dr < rows) pairs.push([r * cols + c, (r + dr) * cols + c + dc, kind])
  }
  const texel = new Float32Array(count * 2), uv = new Float32Array(count * 2)
  const index: number[] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      pair(c, r, 1, 0, STRETCH); pair(c, r, 0, 1, STRETCH)
      pair(c, r, 1, 1, SHEAR); pair(c, r, -1, 1, SHEAR)
      pair(c, r, 2, 0, BEND); pair(c, r, 0, 2, BEND)
      const i = r * cols + c
      texel.set([c, r], i * 2)
      uv.set([(c / (cols - 1)) * across, (1 - r / (rows - 1)) * along], i * 2)
      if (c + 1 < cols && r + 1 < rows) index.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1)
    }
  return {
    w: cols, h: rows, count, rest, held, ...woven(count, cols, rows, at, pairs, index),
    texel, uv, index: Uint32Array.from(index), across, along, stood: (f.pins ?? []).map(() => undefined),
  }
}

// A sewn fabric as its cut hands it (the header, Cuts): `what` names the fabric in what it throws.
export function sewn(what: string, f: Fabric, s: Sewn): Laid {
  const count = s.points.length / 3
  const w = Math.ceil(Math.sqrt(count)), h = Math.ceil(count / w)
  const rest = new Float32Array(w * h * 4)
  for (let i = 0; i < count; i++) rest.set([s.points[i * 3], s.points[i * 3 + 1], s.points[i * 3 + 2], 1], i * 4)
  const held = new Int32Array(count).fill(-1)
  const stood = (f.pins ?? []).map((pin, i) => {
    const points = s.pieces[pin.piece!]
    if (!points) throw new Error(`${what}'s pin ${i} holds the piece ${pin.piece}, and its pieces are ${Object.keys(s.pieces).join(', ')}`)
    for (const p of points) {
      if (held[p] >= 0) throw new Error(`${what}'s pin ${i} holds the piece ${pin.piece}, a point of which pin ${held[p]} holds: the two pieces are sewn together there`)
      held[p] = i
    }
    const on = Object.keys(s.stood).find(k => k.endsWith(pin.on))
    if (on === undefined) throw new Error(`${what}'s pin ${i} holds the piece ${pin.piece} on ${pin.on}, and it was cut on nothing of that name: ${Object.keys(s.stood).join(', ')}`)
    return s.stood[on]
  })
  // each edge of a triangle a link along the weave, and the two points across an edge two triangles share a
  // link over the fold between them
  const key = (a: number, b: number) => (a < b ? a * count + b : b * count + a)
  const across = new Map<number, number[]>()
  const triangles: number[] = []
  for (let t = 0; t < s.index.length; t += 3) {
    const [a, b, c] = [s.of[s.index[t]], s.of[s.index[t + 1]], s.of[s.index[t + 2]]]
    if (a === b || b === c || a === c) continue
    triangles.push(a, b, c)
    for (const [p, q, o] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const k = key(p, q)
      const had = across.get(k)
      if (had) had.push(o)
      else across.set(k, [o])
    }
  }
  const pairs: number[][] = []
  const folds = new Set<number>()
  for (const [k, far] of across) {
    pairs.push([Math.floor(k / count), k % count, STRETCH])
    if (far.length !== 2 || far[0] === far[1]) continue
    const fold = key(far[0], far[1])
    if (across.has(fold) || folds.has(fold)) continue
    folds.add(fold)
    pairs.push([far[0], far[1], BEND])
  }
  const vertices = s.of.length
  const texel = new Float32Array(vertices * 2), uv = new Float32Array(vertices * 2)
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity]
  for (let v = 0; v < vertices; v++) {
    texel.set([s.of[v] % w, Math.floor(s.of[v] / w)], v * 2)
    lo = [Math.min(lo[0], s.uv[v * 2]), Math.min(lo[1], s.uv[v * 2 + 1])]
    hi = [Math.max(hi[0], s.uv[v * 2]), Math.max(hi[1], s.uv[v * 2 + 1])]
  }
  for (let v = 0; v < vertices; v++) uv.set([s.uv[v * 2] - lo[0], s.uv[v * 2 + 1] - lo[1]], v * 2)
  return {
    w, h, count, rest, held, ...woven(count, w, h, s.points, pairs, triangles),
    texel, uv, index: s.index, across: hi[0] - lo[0], along: hi[1] - lo[1], stood,
  }
}

// The frame a grid's pin holds its points in: its point's frame (its place and turn, its scale taken off),
// moved by the pin's `at` and turned by its `turn`, with the pin's first point at its middle.
export function holding(T: Three, pin: Pin, anchor: number[], point: THREE.Object3D | Placed, into: THREE.Matrix4): THREE.Matrix4 {
  const at = new T.Vector3(), turn = new T.Quaternion(), one = new T.Vector3(1, 1, 1)
  if ('isObject3D' in point) point.matrixWorld.decompose(at, turn, new T.Vector3())
  else {
    at.fromArray(point.at)
    if (point.rot) turn.fromArray(point.rot)
  }
  into.compose(at, turn, one)
  return into.multiply(framed(T, pin.at, pin.turn)).multiply(new T.Matrix4().makeTranslation(-anchor[0], -anchor[1], -anchor[2]))
}
// The frame a sewn fabric's pin holds its points in: its point's frame now, its scale with it, times the
// inverse of the frame that point stood in as the fabric was cut (`unstood`), so a point of the fabric lies
// from it as it did then.
export function wearing(T: Three, unstood: THREE.Matrix4, point: THREE.Object3D | Placed, into: THREE.Matrix4): THREE.Matrix4 {
  if ('isObject3D' in point) into.copy(point.matrixWorld)
  else into.compose(new T.Vector3().fromArray(point.at), point.rot ? new T.Quaternion().fromArray(point.rot) : new T.Quaternion(), new T.Vector3(1, 1, 1))
  return into.multiply(unstood)
}
// A place and a turn in degrees as a frame.
export function framed(T: Three, at: number[] = [0, 0, 0], turn: number[] = [0, 0, 0]): THREE.Matrix4 {
  const rad = Math.PI / 180
  return new T.Matrix4().compose(new T.Vector3(at[0], at[1], at[2]), new T.Quaternion().setFromEuler(new T.Euler(turn[0] * rad, turn[1] * rad, turn[2] * rad)), new T.Vector3(1, 1, 1))
}

// One fabric in the scene.
type Held = {
  key: string; name: string; fabric: Fabric; of?: string; thing?: Thing; at?: THREE.Matrix4
  lain: Laid; anchors: (number[] | undefined)[]; unstood: (THREE.Matrix4 | undefined)[]
  restTex: THREE.DataTexture; linkTex: THREE.DataTexture; ringTex: THREE.DataTexture
  pinsTex?: THREE.DataTexture; pins: Float32Array
  state: THREE.WebGLRenderTarget[]; scratch: THREE.WebGLRenderTarget[]; facing: THREE.WebGLRenderTarget
  mesh: THREE.Mesh; made: THREE.Material; shadows: THREE.Material[]
  placed: boolean; h: number
}

export function fabric3d() {
  let file: Fabrics | undefined
  let words: Record<string, Behavior> = {}
  let asked = false, checked = false, unchecked = false, stale = false
  const held = new Map<string, Held>()
  // The wind the mod handed this frame, read when the scene is drawn.
  let blowing: number[] = [0, 0, 0]
  // The frame afterTick counted, and the one the fabrics were last moved in.
  let frame = 0, moved = -1
  let clock = 0, last: number | undefined
  let latest: Plugins | undefined

  let gpu: {
    T: Three; renderer: THREE.WebGLRenderer; scene: THREE.Scene
    quad: THREE.Mesh; quadScene: THREE.Scene; camera: THREE.OrthographicCamera
    passes: { lay: THREE.RawShaderMaterial; move: THREE.RawShaderMaterial; hold: THREE.RawShaderMaterial; meets: THREE.RawShaderMaterial; faces: THREE.RawShaderMaterial }
    // what the fabrics meet, the `solids` mod's
    solid: ReturnType<Solids> | undefined
    before: THREE.Scene['onBeforeRender']; hook: THREE.Scene['onBeforeRender']
  } | undefined

  const floats = (T: Three, data: Float32Array, w: number, h: number) => {
    const t = new T.DataTexture(data, w, h, T.RGBAFormat, T.FloatType)
    t.minFilter = t.magFilter = T.NearestFilter
    t.needsUpdate = true
    return t
  }
  const target = (T: Three, w: number, h: number, count: number) =>
    new T.WebGLRenderTarget(w, h, { count, type: T.FloatType, format: T.RGBAFormat, depthBuffer: false, minFilter: T.NearestFilter, magFilter: T.NearestFilter, generateMipmaps: false })

  const setupGpu = (plugins: Plugins) => {
    if (gpu) return gpu
    const { THREE: T, renderer, scene } = plugins.render3d as { THREE: Three; renderer?: THREE.WebGLRenderer; scene: THREE.Scene }
    if (!renderer) return undefined
    const raw = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new T.RawShaderMaterial({ glslVersion: T.GLSL3, vertexShader: QUAD, fragmentShader, uniforms, depthTest: false, depthWrite: false, blending: T.NoBlending })
    const common = () => ({ posTex: { value: null }, prevTex: { value: null }, restTex: { value: null } })
    const ringed = () => ({ ringTex: { value: null }, rings: { value: 0 } })
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2))
    quad.frustumCulled = false
    const quadScene = new T.Scene()
    quadScene.add(quad)
    const before = scene.onBeforeRender
    // The fabrics are moved first, so whatever else is hooked here, a shadow drawn of the frame among it,
    // draws them where this frame has them.
    const hook: THREE.Scene['onBeforeRender'] = function (this: THREE.Scene, r, s3, camera, t, material, group) {
      if (gpu && moved !== frame) {
        moved = frame
        move()
      }
      before.call(this, r, s3, camera, t, material, group)
    }
    scene.onBeforeRender = hook
    const solid = mod<Solids>(plugins.wire.scene.world!, 'fabric3d', 'solids')?.(plugins)
    gpu = {
      T, renderer, scene, quad, quadScene, camera: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      passes: {
        lay: raw(LAY, common()),
        move: raw(MOVE, {
          ...common(), ...ringed(), pinsTex: { value: null }, h: { value: 0 }, hPrev: { value: 0 }, through: { value: 0 }, now: { value: 0 },
          gravity: { value: new T.Vector3() }, wind: { value: new T.Vector3() }, turbulence: { value: new T.Vector2() }, drag: { value: 0 }, caught: { value: 0 },
        }),
        hold: raw(HOLD, { ...common(), linkTex: { value: null }, links: { value: 0 }, stretch: { value: 0 }, shear: { value: 0 }, bend: { value: 0 } }),
        meets: raw(MEETS(solid?.glsl ?? NOTHING), { ...solid?.uniforms, ...common(), thick: { value: 0 }, friction: { value: 0 }, h: { value: 0 } }),
        faces: raw(FACES, { ...common(), ...ringed() }),
      },
      solid, before, hook,
    }
    return gpu
  }
  const run = (material: THREE.RawShaderMaterial, into: THREE.WebGLRenderTarget) => {
    const g = gpu!
    g.quad.material = material
    g.renderer.setRenderTarget(into)
    g.renderer.render(g.quadScene, g.camera)
  }
  const bind = (m: THREE.RawShaderMaterial, f: Held, pos: THREE.Texture, prev: THREE.Texture) => {
    const u = m.uniforms
    u.posTex.value = pos
    u.prevTex.value = prev
    u.restTex.value = f.restTex
    if (u.ringTex) {
      u.ringTex.value = f.ringTex
      u.rings.value = f.lain.rings
    }
    if (u.linkTex) {
      u.linkTex.value = f.linkTex
      u.links.value = f.lain.linked
    }
  }

  // The frame of each of a fabric's pins now, PIN numbers each: now, then as it was; and whether what holds
  // it was put somewhere new.
  const frames = (f: Held) => {
    const T = gpu!.T, m = new T.Matrix4()
    let jumped = false
    ;(f.fabric.pins ?? []).forEach((pin, i) => {
      const point = f.thing!.point(pin.on)
      if (!point) throw new Error(`fabric3d's fabric ${f.name} is held to the point ${pin.on}, which the ${f.thing!.of} ${f.thing!.key} has none of`)
      if ('isObject3D' in point) for (let o: THREE.Object3D | null = point; o; o = o.parent) if (o.userData.teleport === true) jumped = true
      f.pins.copyWithin(i * PIN + 16, i * PIN, i * PIN + 16)
      const unstood = f.unstood[i]
      ;(unstood ? wearing(T, unstood, point, m) : holding(T, pin, f.anchors[i]!, point, m)).toArray(f.pins, i * PIN)
    })
    return jumped
  }
  // A fabric laid as its cut has it, in its first pin's frame or where its attach lays it, and still.
  const lay = (f: Held) => {
    const T = gpu!.T, { w, h, count, rest, held: pinned } = f.lain
    const base = f.at ?? new T.Matrix4().fromArray(f.pins, 0)
    const pos = new Float32Array(w * h * 4), v = new T.Vector3(), m = new T.Matrix4()
    for (let i = 0; i < count; i++) {
      const pin = pinned[i]
      v.set(rest[i * 4], rest[i * 4 + 1], rest[i * 4 + 2]).applyMatrix4(pin >= 0 ? m.fromArray(f.pins, pin * PIN) : base)
      pos.set([v.x, v.y, v.z, pin + 1], i * 4)
    }
    f.pins.forEach((_, i) => { if (i % PIN >= 16) f.pins[i] = f.pins[i - 16] })
    if (f.pinsTex) f.pinsTex.needsUpdate = true
    const tex = floats(T, pos, w, h)
    bind(gpu!.passes.lay, f, tex, tex)
    run(gpu!.passes.lay, f.state[0])
    tex.dispose()
    f.placed = true
    f.h = 0
  }

  // Every fabric moved to the moment this frame draws: run from the scene's `onBeforeRender`, where every
  // object stands as it is drawn.
  const move = () => {
    const g = gpu!, plugins = latest!
    const own = plugins.wire.scene.world!.fabric3d as Settings
    const elapsed = last === undefined ? 0 : Math.min(Math.max(0, clock - last), own.most)
    last = clock
    const renderer = g.renderer
    const was = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel()
    const autoClear = renderer.autoClear, xr = renderer.xr.enabled, shadows = renderer.shadowMap.autoUpdate
    renderer.autoClear = false
    renderer.xr.enabled = false
    renderer.shadowMap.autoUpdate = false
    try {
      // what the fabrics meet, as it stands now that every object is where the frame draws it
      g.solid?.now()
      const count = elapsed > 0 ? Math.max(1, Math.ceil(elapsed / own.substep - 1e-9)) : 0
      const h = count ? elapsed / count : 0
      const { move: moving, hold, meets, faces } = g.passes
      for (const f of held.values()) {
        const jumped = f.thing ? frames(f) : false
        if (f.pinsTex) f.pinsTex.needsUpdate = true
        if (!f.placed || jumped) lay(f)
        const [here, there] = f.state
        for (let k = 0; k < count; k++) {
          bind(moving, f, here.textures[0], here.textures[1])
          const u = moving.uniforms
          u.pinsTex.value = f.pinsTex ?? null
          u.h.value = h
          u.hPrev.value = f.h || h
          u.through.value = (k + 1) / count
          u.now.value = clock
          u.gravity.value.fromArray(own.gravity)
          u.wind.value.fromArray(blowing)
          u.turbulence.value.set(own.turbulence?.size ?? 1, own.turbulence?.strength ?? 0)
          u.drag.value = f.fabric.drag
          u.caught.value = f.fabric.catch / f.fabric.weight
          run(moving, there)
          let pos = there.textures[0]
          for (let p = 0; p < own.passes; p++) {
            bind(hold, f, pos, there.textures[1])
            hold.uniforms.stretch.value = f.fabric.stretch
            hold.uniforms.shear.value = f.fabric.shear ?? 0
            hold.uniforms.bend.value = f.fabric.bend
            run(hold, f.scratch[p & 1])
            pos = f.scratch[p & 1].texture
          }
          bind(meets, f, pos, there.textures[1])
          meets.uniforms.thick.value = f.fabric.thick
          meets.uniforms.friction.value = f.fabric.friction
          meets.uniforms.h.value = h
          run(meets, here)
          f.h = h
        }
        bind(faces, f, here.textures[0], here.textures[1])
        run(faces, f.facing)
      }
    } finally {
      renderer.setRenderTarget(was, face, level)
      renderer.autoClear = autoClear
      renderer.xr.enabled = xr
      renderer.shadowMap.autoUpdate = shadows
    }
  }

  // A fabric's mesh: each vertex drawn at a point, its uv `span` metres to 1 or once over the whole fabric.
  const meshOf = (plugins: Plugins, name: string, lain: Laid, drawn: Drawn, uniforms: Record<string, THREE.IUniform>) => {
    const T = gpu!.T, { w, rest, texel } = lain
    const n = texel.length / 2
    const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), uv = new Float32Array(n * 2)
    const [su, sv] = drawn.span ? [drawn.span, drawn.span] : [lain.across, lain.along]
    for (let v = 0; v < n; v++) {
      const i = texel[v * 2 + 1] * w + texel[v * 2]
      position.set([rest[i * 4], rest[i * 4 + 1], rest[i * 4 + 2]], v * 3)
      normal[v * 3 + 1] = 1
      uv.set([su > 0 ? lain.uv[v * 2] / su : 0, sv > 0 ? lain.uv[v * 2 + 1] / sv : 0], v * 2)
    }
    const geometry = new T.BufferGeometry()
    geometry.setAttribute('position', new T.BufferAttribute(position, 3))
    geometry.setAttribute('normal', new T.BufferAttribute(normal, 3))
    geometry.setAttribute('uv', new T.BufferAttribute(uv, 2))
    geometry.setAttribute('fabricTexel', new T.BufferAttribute(texel, 2))
    geometry.setIndex(new T.BufferAttribute(lain.index, 1))
    if ('dress' in drawn) for (const [input, value] of Object.entries(drawn.vertex)) geometry.setAttribute(input, new T.BufferAttribute(new Float32Array(n).fill(value), 1))
    const material: THREE.Material = 'dress' in drawn ? drawn.dress({ uniforms, vertex: DRAWN }) : plugins.render3d.dress(drawn.material, { surface: { uniforms, vertex: DRAWN } })
    material.side = T.DoubleSide
    material.shadowSide = T.DoubleSide
    const shadow = <M extends THREE.Material>(m: M) => {
      m.side = T.DoubleSide
      m.onBeforeCompile = s => {
        Object.assign(s.uniforms, uniforms)
        s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>${DRAWN.common}`).replace('#include <begin_vertex>', `#include <begin_vertex>${DRAWN.begin_vertex}`)
      }
      m.customProgramCacheKey = () => 'fabric3d'
      return m
    }
    const mesh = new T.Mesh(geometry, material)
    mesh.name = `fabric3d ${name}`
    mesh.frustumCulled = false
    mesh.castShadow = mesh.receiveShadow = true
    mesh.userData.moving = true
    mesh.customDepthMaterial = shadow(new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }))
    mesh.customDistanceMaterial = shadow(new T.MeshDistanceMaterial())
    return mesh
  }

  // One fabric made: its textures, its targets and its mesh, or undefined while its cut or its drawing loads.
  const make = (plugins: Plugins, key: string, name: string, placing: { thing: Thing } | { at: THREE.Matrix4 }): Held | undefined => {
    const g = gpu!, T = g.T
    const fabric = file!.fabrics[name]
    const what = `fabric3d's fabric ${name}`
    const { cut, drawing } = wordsFor(name, fabric, words)
    const how = words[cut]
    const cloth = how.sewn?.(fabric[cut], { plugins, name: what })
    if (how.sewn && !cloth) return undefined
    const lain = cloth ? sewn(what, fabric, cloth) : laid(fabric, how, fabric[cut])
    const { w, h, rest } = lain
    const widest = w * Math.max(lain.linked, lain.rings)
    if (widest > g.renderer.capabilities.maxTextureSize) throw new Error(`${what} has ${lain.count} points, each held to as many as ${Math.max(lain.linked, lain.rings)} others, which is ${widest} texels across, and this GPU's textures are ${g.renderer.capabilities.maxTextureSize} at most`)
    const drawn = words[drawing].material!(fabric[drawing], { plugins, name: what })
    if (!drawn) return undefined
    const state = [target(T, w, h, 2), target(T, w, h, 2)]
    const facing = target(T, w, h, 1)
    const pins = new Float32Array((fabric.pins?.length ?? 0) * PIN)
    const uniforms = { fabricPos: { value: state[0].textures[0] }, fabricFacing: { value: facing.texture } }
    const mesh = meshOf(plugins, name, lain, drawn, uniforms)
    g.scene.add(mesh)
    return {
      key, name, fabric, lain,
      ...('thing' in placing ? { thing: placing.thing, of: placing.thing.of } : { at: placing.at }),
      anchors: (fabric.pins ?? []).map(p => (p.from ? [...rest.subarray((p.from[1] * w + p.from[0]) * 4, (p.from[1] * w + p.from[0]) * 4 + 3)] : undefined)),
      unstood: lain.stood.map(m => (m ? new T.Matrix4().fromArray(m).invert() : undefined)),
      restTex: floats(T, rest, w, h),
      linkTex: floats(T, lain.links, w * lain.linked, h),
      ringTex: floats(T, lain.ring, w * lain.rings, h),
      pinsTex: pins.length ? floats(T, pins, PIN / 4, pins.length / PIN) : undefined, pins,
      state, scratch: [target(T, w, h, 1), target(T, w, h, 1)], facing,
      mesh, made: mesh.material as THREE.Material, shadows: [mesh.customDepthMaterial!, mesh.customDistanceMaterial!],
      placed: false, h: 0,
    }
  }
  const drop = (f: Held) => {
    gpu?.scene.remove(f.mesh)
    f.mesh.geometry.dispose()
    f.made.dispose()
    for (const m of f.shadows) m.dispose()
    for (const t of [...f.state, ...f.scratch, f.facing]) t.dispose()
    f.restTex.dispose()
    f.linkTex.dispose()
    f.ringTex.dispose()
    f.pinsTex?.dispose()
    held.delete(f.key)
  }

  const setup = (plugins: Plugins): Settings => {
    const { scene } = plugins.wire
    const own = scene.world?.fabric3d
    if (!own) throw new Error('the scene names fabric3d but gives no world.fabric3d')
    if (!checked) {
      checked = true
      const order = scene.plugins!
      if (!plugins.render3d) throw new Error('fabric3d draws through render3d, which this scene does not name')
      if (order.indexOf('render3d') < order.indexOf('fabric3d')) throw new Error('fabric3d is listed after render3d, which would draw the frame before its fabrics are put in it')
      // the mods that read another plugin's browser half; a `sources` mod may be shapes3d's, which has none
      for (const key of ['solids', 'wind']) provided(scene, 'fabric3d', key)
      // the `attach` mod is read in this plugin's own frame, so its plugin has ticked first
      ahead(scene, 'fabric3d', 'attach')
    }
    if (!asked) {
      if (!plugins.loader) throw new Error('fabric3d reads its fabrics through loader, which this scene does not name')
      asked = true
      words = behaviorsOf(scene.world!)
      plugins.loader.on(own.fabrics, (it: Fabrics) => { file = it; unchecked = true })
      plugins.loader.onWritten(own.fabrics, () => { stale = unchecked = true })
    }
    return own
  }

  return {
    get fabrics() {
      return [...held.values()].map(f => ({ key: f.key, fabric: f.name, of: f.of, thing: f.thing?.key, mesh: f.mesh, points: f.lain.count, columns: f.lain.w, rows: f.lain.h }))
    },
    places(key: string): Float32Array {
      const f = held.get(key)
      if (!f || !gpu) throw new Error(`fabric3d has no fabric ${key}: its fabrics are ${[...held.keys()].join(', ')}`)
      const out = new Float32Array(f.lain.w * f.lain.h * 4)
      gpu.renderer.readRenderTargetPixels(f.state[0], 0, 0, f.lain.w, f.lain.h, out)
      return Float32Array.from({ length: f.lain.count * 3 }, (_, i) => out[Math.floor(i / 3) * 4 + (i % 3)])
    },
    tick(plugins: Plugins) { setup(plugins) },
    afterTick(plugins: Plugins) {
      const { scene } = plugins.wire
      const own = setup(plugins)
      const world = scene.world!
      const dt = scene.prefabs.engine?.dt
      if (!dt) throw new Error('scene has no engine prefab with dt')
      latest = plugins
      frame++
      clock = (plugins.wire.n - 1 + (plugins.wire.between ?? 1)) * dt
      if (file && unchecked) {
        unchecked = false
        check(file, own, words, world)
      }
      if (stale) {
        stale = false
        for (const f of [...held.values()]) drop(f)
      }
      blowing = mod<Wind>(world, 'fabric3d', 'wind')?.(plugins) ?? own.wind ?? [0, 0, 0]
      if (!file || unchecked || !setupGpu(plugins)) return
      // every fabric the attach asks for kept, and every other let go
      const sources = modsOf<Things>(world, 'fabric3d', 'sources').flatMap(f => f(plugins))
      const wanted = new Set<string>()
      // the scene's own entries, keyed by their place in its list, then those the `attach` mod hands now, keyed
      // by the fabric and what it is held to, so one handed is the same fabric whatever else is handed
      const handed = mod<Attaching>(world, 'fabric3d', 'attach')?.(plugins) ?? []
      handed.forEach((a, i) => attached(a, `fabric3d's attach mod's entry ${i}`, file!, world))
      const all: [string, Attach][] = [...(own.attach ?? []).map((a, i): [string, Attach] => [`${i}`, a]), ...handed.map((a): [string, Attach] => [`${a.fabric} of ${a.of}`, a])]
      all.forEach(([i, a]) => {
        const places: [string, { thing: Thing } | { at: THREE.Matrix4 }][] = a.of === undefined
          ? [[`${i}`, { at: framed(gpu!.T, a.at, a.turn) }]]
          : sources.filter(t => t.of === a.of).map(thing => [`${i} ${thing.key}`, { thing }])
        for (const [key, placing] of places) {
          wanted.add(key)
          const had = held.get(key)
          if (had) {
            if ('thing' in placing) had.thing = placing.thing
            continue
          }
          const made = make(plugins, key, a.fabric, placing)
          if (made) held.set(key, made)
        }
      })
      for (const f of [...held.values()]) if (!wanted.has(f.key)) drop(f)
    },
    close() {
      for (const f of [...held.values()]) drop(f)
      if (gpu) {
        if (gpu.scene.onBeforeRender === gpu.hook) gpu.scene.onBeforeRender = gpu.before
        for (const m of Object.values(gpu.passes)) m.dispose()
        gpu.quad.geometry.dispose()
        gpu = undefined
      }
      latest = undefined
    },
  }
}
