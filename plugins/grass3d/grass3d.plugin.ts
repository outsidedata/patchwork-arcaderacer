// The browser half of grass3d: every grass of the grasses file `world.grass3d.grasses` names in the loader's
// catalogue (`grass3d.sim.ts`), nothing drawn until it has landed, drawn round render3d's
// camera, blade by blade on the GPU (`grass3d.glsl.ts`), what a blade is kept once and what moves it worked
// out each frame, over the ground it holds round the camera. Nothing of it is on a row and nothing of it goes up the wire: every page draws its own.
//
// Listing. grass3d reads the land's mod the frame its plugin places its own land, so the plugin the `land`
// mod names (terrain3d) is listed before grass3d, and so are the `wind` mod's (weather3d), and the
// `keeper` and `pressed` mods' (gpgpu3d), whose things it tramples under the frame they are filled and
// whose clock its programs read; grass3d places
// its blades in its `afterTick`, so it is listed before render3d, which draws in its own. Each is checked
// on every frame, and each throws naming the plugin out of place.
//
// The window. The ground is held in two textures of N × N texels, N = blocks·BLOCK, one texel a lattice
// point `cell` metres apart (the land's `cell`), each point at texel (x mod N, z mod N), so the window
// moves a block at a time by filling only the blocks that come into it. The field texture holds each
// point's height, and when it was last trampled (seconds of this page's clock) and which way it lies, a
// vector as long as it was pressed down; each keeps texture the share four grasses cover there. A block
// that leaves the window is wiped: no height, no grass and nothing lying, so the blades of the block that
// comes into its texels stand only once it is filled. Blocks are filled nearest the camera's block first.
// Each version of the land (its `version`) fills every block again, the old one drawn until the new comes,
// and every block in flight of the old is let go. What has been trampled stays trampled.
//
// Workers. Where the page has `Worker` and the land hands a `worker`, blocks are filled off the page in a
// pool of grass3d's own module workers (`grass3d.worker.ts`), one fewer than the cores, at least one: each
// handed the land of each version, then BATCH blocks a task, FLIGHT tasks in flight at once, the least busy
// worker first. What comes back is written into the textures the next frame. Elsewhere, as in node, blocks
// are filled on the page, `budget` milliseconds a frame, one at least.
//
// Prepared places. A land that hands `prepared` `[x, z]` (terrain3d's `prepare`) is about to put the camera
// there: every block the window would hold there and does not hold now is filled ahead and kept off the
// textures, nearest the place first. The frame the camera's block is the place's, every block kept is
// written in. `ready()` is whether this grass's share of the place is done: every block of the window
// there filled, ahead or after arriving; true with no place in hand. terrain3d asks it through
// `grass3d.terrain3d.ts`, named in `world.terrain3d.mods.ready`.
//
// The levels. Each grass is drawn in its levels (`levelsOf`), each level a square of tiles round the
// camera's tile, in chunks² chunks, each chunk a mesh of one instanced draw of every blade of its tiles:
// `gChunk`, one value for all its instances, is its first tile. Each frame each chunk is moved onto the
// camera, hidden where no tile of it lies in its level's band, given a sphere round its tiles and the ground
// under them for render3d's frustum and every light's, and set to cast shadows while its nearest point is
// within the grass's `shadow` metres. Its blades are marked moving (`userData.moving`), so lights3d draws
// their shadows every frame. Nothing is on the scene until the land is `shown`.
//
// Bent and trampled. The things the `pressed` mod holds on the GPU press the grass, each as the behavior of
// its word says (`grass3d.sim.ts`, Pressing; `world.grass3d.mods.behaviors`), and a thing of a word none
// delivers presses nothing. The blades read the things where they are drawn and bend away from each that
// stands over them, within `trample.reach` metres of its footprint. Each frame every thing tramples every
// lattice point round it that its word's `trodden` says it treads, handed TREAD, the metres over the ground
// within which an underside tramples it, and the cell, since a point stands for the cell round it (a wheel
// at any turn of its spin, however narrow its tyre; a body where it sits on the ground): the blade lies
// from then on away from the middle of what pressed it, standing back up over `trample.recover` seconds.
//
// Kept. What a blade is that is the same every frame, where it stands, its ground, its height, width, facing,
// lean and colour, is worked out once and kept by the `keeper` mod's keeper (gpgpu3d's,
// `plugins/gpgpu3d/gpgpu3d.keeper.ts`), which grass3d hands each grass's values (`grass3d.glsl.ts`, `specOf`).
// Each level has a room of it: a slot a tile, at the tile's place in the level's square (tile mod side), a
// texel a blade. Each frame, a level whose square has moved a tile, or under which a block of ground was
// written or wiped, is gone over: each tile of its square a camera in the middle tile can draw is wanted of
// the room, and the room writes those its slot does not hold or whose ground changed. A level whose square
// stands still on unchanged ground costs nothing. It is drawn with render3d's renderer, and with none yet
// nothing is kept. The blades' shader reads each value through the keeper's reading and works out only what
// moves. A grass of more blades a tile, or more tiles a side, than the GPU's largest texture holds throws,
// naming the grass and the level.
//
// Programs. A grass with a `program` (`grass3d.sim.ts`) has it compiled by the keeper when its levels are
// made, in halves: the names of its `out` that are the same every frame into the keeping shader, kept with
// the blade, and those that move (they read the clock or the camera's distance) into every material of the
// grass, the shadows' the ones that shape a blade alone, with the uniforms they read. A value the moving half
// reads that does not move is kept too, and read back. A changed grasses file makes everything again, the
// program with it.
//
// The wind. The `wind` mod's wind and drift, or with none named the grasses file's `wind` and its drift over
// this page's clock. The flutter runs on the page's clock.
//
// It hands out `ready()`, `blocks()` (`{ held, of, asked, queued, flight }`: the blocks filled of this
// land's version of those the window holds, those asked of the workers and not come back, those queued and
// not yet asked, and the tasks in flight), `at(i, j)` (lattice point (i, j) as it is held, `{ height,
// trampled, lies, keeps }`, or undefined out of the window), `chunks()` (each grass's levels, each level's
// chunks, `{ visible, castShadow, at, count }`), `kept()` (each grass's levels, each `{ level, held, drew,
// textures }`: the tiles its textures hold, the tiles kept since it was made, and each texture's size and
// whether it is of half floats) and `close()`, which
// takes everything off the scene, disposes it and ends the workers. The grasses file changing makes
// everything again.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { ahead, listed, mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Room } from '#plugins/gpgpu3d/gpgpu3d.keeper.ts'
import { BLOCK, blockOf, check, fill, levelsOf, NOWHERE, windowOf, type Filled, type Grass, type Grass3d, type Keeper, type LandMod, type Level, type Numbers, type Press, type Pressed, type Presses, type Rule, type WindMod } from './grass3d.sim.ts'
import { pressing, shadowed, specOf, surface } from './grass3d.glsl.ts'
import type { Answer, Asked } from './grass3d.blocks.ts'

// What presses the grass: the `pressed` mod's things, each word's Press, and the GLSL made of them.
type Pressing = { pressed: ReturnType<Pressed> | undefined; presses: Record<string, Press>; glsl: string }

// Blocks a task, and tasks in flight at once (Workers).
const BATCH = 4
const FLIGHT = 4
// Metres over the ground within which the underside of a thing tramples it.
const TREAD = 0.25

type Three = typeof import('three')
type Uniforms = Record<string, THREE.IUniform>
type Chunk = { mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshStandardMaterial>; first: THREE.InstancedBufferAttribute; at: [number, number] | undefined; count: number }
// What a level keeps of its blades (Kept): its square's `side` in tiles; the keeper's room, a slot a tile, at
// the tile's place in the square (tile mod side); `needs`, for each tile of the square by its place from the
// square's corner, whether a camera anywhere in the middle tile can draw it; the square's corner tile when it
// was last gone over, and whether it must be gone over again.
type Keeping = { side: number; room: Room; needs: Uint8Array; origin: [number, number] | undefined; check: boolean }
type Drawn = { level: Level; material: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial; distance: THREE.MeshDistanceMaterial; uniforms: Uniforms; chunks: Chunk[]; kept: Keeping }
type Grown = { name: string; grass: Grass; levels: Drawn[] }
type Texture = { data: Float32Array; tex: THREE.DataTexture }
type Pooled = { worker: Worker; asked: number }
// Blocks filled ahead for a prepared place (Prepared places): the place's middle block, the blocks kept,
// every block of its window nearest first and how far through them it is, the tasks of it in flight, and
// whether the camera has arrived.
type Ahead = { at: [number, number]; version: string; kept: Map<number, Filled>; queue: [number, number][]; next: number; flight: number; arrived: boolean }
type Made = {
  three: Three; cell: number; blocks: number; half: number; N: number
  rules: Rule[][]
  field: Texture; keeps: Texture[]
  version: string | undefined
  origin: [number, number] | undefined
  // The blocks of the window held, each its ground's [lowest, highest]; those of them held from a land
  // before this version, drawn until they are filled again; those asked and not come back.
  held: Map<number, [number, number]>
  stale: Set<number>
  asked: Set<number>
  queue: [number, number][]; next: number
  back: Filled[]
  ahead: Ahead | undefined
  uniforms: Uniforms
  grown: Grown[]
  geometries: Map<number, THREE.BufferGeometry>
  onScene: boolean
  shownAt: number
}

const key = (bx: number, bz: number) => (bx + 1048576) * 2097152 + (bz + 1048576)
const unkey = (k: number): [number, number] => [Math.floor(k / 2097152) - 1048576, (k % 2097152) - 1048576]
const mod_ = (a: number, n: number) => ((a % n) + n) % n

// Whether two values are the same, field by field (as lod3d's browser half reads it every frame).
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

// A grass's seed, from its name: the same on every page. The same hash of any text is a program's place in the
// shader cache's key, since three reuses a program whose key it has seen.
function textHash(name: string) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0
  return h
}
const seedOf = (name: string) => textHash(name) % 65521

// The geometry of a blade of `s` segments (`grass3d.glsl.ts`).
function bladeOf(three: Three, s: number): THREE.BufferGeometry {
  const position: number[] = [], normal: number[] = [], index: number[] = []
  for (let k = 0; k < s; k++) position.push(-1, k / s, 0, 1, k / s, 0)
  position.push(0, 1, 0)
  for (let v = 0; v < 2 * s + 1; v++) normal.push(0, 0, 1)
  for (let k = 0; k < s - 1; k++) index.push(2 * k, 2 * k + 1, 2 * k + 3, 2 * k, 2 * k + 3, 2 * k + 2)
  index.push(2 * (s - 1), 2 * (s - 1) + 1, 2 * s)
  const g = new three.BufferGeometry()
  g.setAttribute('position', new three.Float32BufferAttribute(position, 3))
  g.setAttribute('normal', new three.Float32BufferAttribute(normal, 3))
  g.setIndex(index)
  return g
}

export function grass3d() {
  let built: Grass3d | undefined
  let checked = false
  let made: Made | undefined
  let pool: Pooled[] | false | undefined
  const tasks = new Map<number, { done: (a: Answer) => void; on: Pooled }>()
  let nextTask = 0
  let share = true
  let clock = -1
  let last = -1
  let drift: [number, number] = [0, 0]
  let press: Pressing | undefined

  function workers(): Pooled[] | false {
    if (pool !== undefined) return pool
    if (typeof Worker === 'undefined') return (pool = false)
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2
    pool = Array.from({ length: Math.max(1, cores - 1) }, () => {
      const worker = new Worker(new URL('./grass3d.worker.ts', import.meta.url), { type: 'module' })
      const on: Pooled = { worker, asked: 0 }
      worker.addEventListener('message', e => {
        const a = (e as MessageEvent).data as Answer
        const t = tasks.get(a.id)
        if (!t) return
        tasks.delete(a.id)
        t.on.asked--
        t.done(a)
      })
      worker.addEventListener('error', e => { throw new Error(`grass3d's worker failed: ${(e as ErrorEvent).message}`) })
      return on
    })
    return pool
  }

  function work(version: string, blocks: [number, number][]): Promise<Answer> {
    const on = (pool as Pooled[]).reduce((a, b) => (b.asked < a.asked ? b : a))
    on.asked++
    const id = nextTask++
    return new Promise(done => {
      tasks.set(id, { done, on })
      on.worker.postMessage({ type: 'fill', id, version, blocks } satisfies Asked)
    })
  }

  function drop() {
    if (!made) return
    for (const g of made.grown) {
      for (const l of g.levels) {
        for (const c of l.chunks) { c.mesh.removeFromParent(); c.mesh.geometry.dispose() }
        l.material.dispose(); l.depth.dispose(); l.distance.dispose()
        l.kept.room.dispose()
      }
    }
    for (const g of made.geometries.values()) g.dispose()
    made.field.tex.dispose()
    for (const k of made.keeps) k.tex.dispose()
    made = undefined
  }

  // Everything made for the grasses file over a land of lattice `cell`.
  function make(s: Grass3d, three: Three, plugins: Plugins, cell: number, pressed: Pressing, keeper: ReturnType<Keeper>): Made {
    const names = Object.keys(s.grasses)
    const reach = Math.max(...names.map(n => s.grasses[n].reach)) + Math.max(...names.map(n => s.grasses[n].tile))
    const { blocks, half } = windowOf(cell, reach)
    const N = blocks * BLOCK
    const texture = (): Texture => {
      const data = new Float32Array(N * N * 4)
      const tex = new three.DataTexture(data, N, N, three.RGBAFormat, three.FloatType)
      tex.magFilter = three.NearestFilter
      tex.minFilter = three.NearestFilter
      tex.generateMipmaps = false
      tex.needsUpdate = true
      return { data, tex }
    }
    const field = texture()
    const keeps = Array.from({ length: Math.ceil(names.length / 4) }, texture)
    const uniforms: Uniforms = {
      ...pressed.pressed?.uniforms,
      gCam: { value: new three.Vector3() },
      gTime: { value: 0 },
      gWind: { value: new three.Vector2() },
      gDrift: { value: new three.Vector2() },
      gGust: { value: new three.Vector4(s.gust.scale, s.gust.strength, s.gust.flutter, s.gust.rate) },
      gBend: { value: s.bend },
      gTrample: { value: new three.Vector2(s.trample.recover, s.trample.reach) },
      gField: { value: field.tex },
      gFieldO: { value: new three.Vector2() },
      gFieldN: { value: N },
      gCell: { value: cell },
    }
    const geometries = new Map<number, THREE.BufferGeometry>()
    const blade = (n: number) => geometries.get(n) ?? (geometries.set(n, bladeOf(three, n)), geometries.get(n)!)
    const render3d = plugins.render3d
    const grown: Grown[] = names.map((name, g) => {
      const grass = s.grasses[name]
      const mask = new three.Vector4(); mask.setComponent(g % 4, 1)
      // What is kept of a blade of this grass, its program compiled with it.
      const kept = keeper(specOf(`grass${g}`, `grass3d grass ${name}`, grass.program))
      const own: Uniforms = {
        gKeeps: { value: keeps[Math.floor(g / 4)].tex },
        gKeepMask: { value: mask },
        gDensity: { value: grass.density }, gFull: { value: grass.full }, gReach: { value: grass.reach }, gFade: { value: grass.fade },
        gTileSize: { value: grass.tile }, gHeight: { value: new three.Vector2(...grass.height) }, gWidth: { value: new three.Vector2(...grass.width) },
        gWiden: { value: grass.widen }, gWidest: { value: grass.widest }, gLean: { value: grass.lean }, gSeed: { value: seedOf(name) },
        gRootColour: { value: new three.Color(grass.colours.root) }, gTipColour: { value: new three.Color(grass.colours.tip) },
        gDryColour: { value: new three.Color(grass.colours.dry) }, gDry: { value: new three.Vector2(grass.dry.amount, grass.dry.scale) },
        gVary: { value: grass.vary }, gAo: { value: grass.ao }, gTranslucency: { value: grass.translucency },
      }
      const levels = levelsOf(grass).map((level): Drawn => {
        const side = level.side
        const u: Uniforms = {
          ...uniforms, ...own,
          gFrom: { value: level.from }, gTo: { value: level.to }, gBlades: { value: level.blades }, gChunkTiles: { value: level.chunk },
        }
        // The room the level's blades are kept in: a slot a tile, the level's square across and down.
        const room = kept.room({
          cols: side, rows: side, count: level.blades, uniforms: u,
          what: `grass3d grass ${name}: level ${level.k}, ${level.blades} blades a tile over ${side} tiles a side,`, hint: 'lower its density, its tile or its reach',
        })
        const whole = room.reading(), shaping = room.reading(['shape'])
        // A tile `ax` and `az` tiles from the middle one is nearer a camera in the middle tile than a tile less
        // each way, and no further than its own count.
        const needs = new Uint8Array(side * side), mid = Math.floor(side / 2)
        for (let z = 0; z < side; z++) {
          for (let x = 0; x < side; x++) {
            const ax = Math.abs(x - mid), az = Math.abs(z - mid)
            const nearest = Math.hypot(Math.max(ax - 1, 0), Math.max(az - 1, 0)) * grass.tile, farthest = Math.hypot(ax, az) * grass.tile
            needs[z * side + x] = nearest < level.to && farthest >= level.from ? 1 : 0
          }
        }
        const keeping: Keeping = { side, room, needs, origin: undefined, check: true }
        const material = render3d.dress(new three.MeshStandardMaterial({ color: 0xffffff, roughness: grass.roughness, metalness: 0, side: three.DoubleSide }), { surface: { uniforms: { ...u, ...whole.uniforms }, ...surface(pressed.glsl, whole.glsl) } })
        const shadowsOf = <M extends THREE.Material>(m: M, name: string): M => {
          const s = shadowed(pressed.glsl, shaping.glsl)
          const own = { ...u, ...shaping.uniforms }
          m.onBeforeCompile = shader => {
            Object.assign(shader.uniforms, own)
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', `#include <common>\n${s.common}`)
              .replace('#include <begin_vertex>', `#include <begin_vertex>\n${s.begin_vertex}`)
          }
          m.customProgramCacheKey = () => `grass3d ${name} ${textHash(s.common)}`
          return m
        }
        const depth = shadowsOf(new three.MeshDepthMaterial({ depthPacking: three.RGBADepthPacking, side: three.DoubleSide }), 'depth')
        const distance = shadowsOf(new three.MeshDistanceMaterial({ side: three.DoubleSide }), 'distance')
        const shape = blade(level.segments)
        const count = level.chunk * level.chunk * level.blades
        const chunks: Chunk[] = Array.from({ length: level.chunks * level.chunks }, () => {
          const geometry = new three.InstancedBufferGeometry()
          geometry.setIndex(shape.getIndex())
          geometry.setAttribute('position', shape.getAttribute('position'))
          geometry.setAttribute('normal', shape.getAttribute('normal'))
          const first = new three.InstancedBufferAttribute(new Float32Array(2), 2, false, count)
          geometry.setAttribute('gChunk', first)
          geometry.instanceCount = count
          geometry.boundingSphere = new three.Sphere()
          const mesh = new three.Mesh(geometry, material)
          mesh.customDepthMaterial = depth
          mesh.customDistanceMaterial = distance
          mesh.receiveShadow = true
          mesh.castShadow = false
          mesh.visible = false
          mesh.matrixAutoUpdate = false
          mesh.userData.moving = true
          mesh.name = `grass3d ${name} ${level.k}`
          return { mesh, first, at: undefined, count }
        })
        return { level, material, depth, distance, uniforms: u, chunks, kept: keeping }
      })
      return { name, grass, levels }
    })
    return {
      three, cell, blocks, half, N, rules: names.map(n => s.grasses[n].rules), field, keeps,
      version: undefined, origin: undefined, held: new Map(), stale: new Set(), asked: new Set(), queue: [], next: 0, back: [], ahead: undefined,
      uniforms, grown, geometries, onScene: false, shownAt: -1,
    }
  }

  // The slot a block's texels start at, along one axis.
  const slotOf = (m: Made, b: number) => mod_(b, m.blocks) * BLOCK

  // A row of a block's texels marked to go up to the GPU, in each of `textures`.
  function rows(m: Made, bx: number, bz: number, textures: Texture[]) {
    const sx = slotOf(m, bx), sz = slotOf(m, bz)
    for (const t of textures) {
      for (let j = 0; j < BLOCK; j++) t.tex.addUpdateRange(((sz + j) * m.N + sx) * 4, BLOCK * 4)
      t.tex.needsUpdate = true
    }
  }

  // A block filled written into the textures, and held with its ground's range.
  function write(m: Made, f: Filled) {
    const G = m.rules.length, sx = slotOf(m, f.bx), sz = slotOf(m, f.bz)
    let lo = Infinity, hi = -Infinity
    for (let j = 0; j < BLOCK; j++) {
      for (let i = 0; i < BLOCK; i++) {
        const n = j * BLOCK + i, t = ((sz + j) * m.N + sx + i) * 4
        const h = f.heights[n]
        m.field.data[t] = h
        if (h > NOWHERE) { lo = Math.min(lo, h); hi = Math.max(hi, h) }
        for (let g = 0; g < G; g++) m.keeps[g >> 2].data[t + (g & 3)] = f.keeps[n * G + g]
      }
    }
    rows(m, f.bx, f.bz, [m.field, ...m.keeps])
    m.held.set(key(f.bx, f.bz), lo <= hi ? [lo, hi] : [0, 0])
    m.stale.delete(key(f.bx, f.bz))
    changed(m, f.bx, f.bz)
  }

  // The ground of a block has changed: every tile kept that a blade standing on it may be in is kept again.
  // A blade stands on the lattice points round it, so the block's points reach a cell back from its first.
  function changed(m: Made, bx: number, bz: number) {
    const x0 = (bx * BLOCK - 1) * m.cell, x1 = (bx * BLOCK + BLOCK) * m.cell, z0 = (bz * BLOCK - 1) * m.cell, z1 = (bz * BLOCK + BLOCK) * m.cell
    for (const g of m.grown) {
      const T = g.grass.tile
      for (const l of g.levels) {
        const k = l.kept, o = k.origin
        if (!o) continue
        for (let tz = Math.max(Math.floor(z0 / T), o[1]); tz <= Math.min(Math.floor(z1 / T), o[1] + k.side - 1); tz++) {
          for (let tx = Math.max(Math.floor(x0 / T), o[0]); tx <= Math.min(Math.floor(x1 / T), o[0] + k.side - 1); tx++) {
            k.room.stale(mod_(tx, k.side), mod_(tz, k.side))
            k.check = true
          }
        }
      }
    }
  }

  // Every blade whose tile has come into its level's square, or whose ground has changed, worked out and kept:
  // each tile of the square a camera in the middle tile can draw is wanted of the level's room, which writes
  // the ones it does not hold. A level whose square has not moved and whose ground has not changed is not gone
  // over.
  function keep(m: Made, renderer: THREE.WebGLRenderer, eye: THREE.Vector3) {
    for (const g of m.grown) {
      const T = g.grass.tile
      const ti = Math.floor(eye.x / T), tj = Math.floor(eye.z / T)
      for (const l of g.levels) {
        const k = l.kept, side = k.side
        const o0 = ti - Math.floor(side / 2), o1 = tj - Math.floor(side / 2)
        if (!k.check && k.origin && k.origin[0] === o0 && k.origin[1] === o1) continue
        k.origin = [o0, o1]
        k.check = false
        for (let z = 0; z < side; z++) {
          for (let x = 0; x < side; x++) {
            if (!k.needs[z * side + x]) continue
            const tx = o0 + x, tz = o1 + z
            k.room.want(mod_(tx, side), mod_(tz, side), tx, tz)
          }
        }
        k.room.keep(renderer)
      }
    }
  }

  // Whether block k is held from this version of the land.
  const fresh = (m: Made, k: number) => m.held.has(k) && !m.stale.has(k)

  // A block's texels wiped: no ground, no grass, nothing lying.
  function wipe(m: Made, bx: number, bz: number) {
    const sx = slotOf(m, bx), sz = slotOf(m, bz)
    for (let j = 0; j < BLOCK; j++) {
      for (let i = 0; i < BLOCK; i++) {
        const t = ((sz + j) * m.N + sx + i) * 4
        m.field.data[t] = -1e9; m.field.data[t + 1] = 0; m.field.data[t + 2] = 0; m.field.data[t + 3] = 0
        for (const k of m.keeps) k.data.fill(0, t, t + 4)
      }
    }
    rows(m, bx, bz, [m.field, ...m.keeps])
    changed(m, bx, bz)
  }

  // Whether block (bx, bz) lies in the window of origin `o`.
  const inside = (m: Made, o: [number, number], bx: number, bz: number) => bx >= o[0] && bz >= o[1] && bx < o[0] + m.blocks && bz < o[1] + m.blocks

  // Every block of the window round middle block (cx, cz), nearest it first.
  function around(m: Made, cx: number, cz: number): [number, number][] {
    const out: [number, number][] = []
    for (let z = cz - m.half; z <= cz + m.half; z++) for (let x = cx - m.half; x <= cx + m.half; x++) out.push([x, z])
    return out.sort((a, b) => Math.max(Math.abs(a[0] - cx), Math.abs(a[1] - cz)) - Math.max(Math.abs(b[0] - cx), Math.abs(b[1] - cz)) || Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz))
  }

  // The window onto the camera's block: every block leaving it wiped and let go, every block in it not
  // held queued nearest first.
  function follow(m: Made, cx: number, cz: number, again: boolean) {
    const o: [number, number] = [cx - m.half, cz - m.half]
    if (!again && m.origin && m.origin[0] === o[0] && m.origin[1] === o[1]) return
    if (m.origin) {
      for (const k of [...m.held.keys()]) {
        const [bx, bz] = unkey(k)
        if (!inside(m, o, bx, bz)) { m.held.delete(k); m.stale.delete(k); wipe(m, bx, bz) }
      }
    }
    m.origin = o
    ;(m.uniforms.gFieldO.value as THREE.Vector2).set(o[0] * BLOCK, o[1] * BLOCK)
    m.queue = around(m, cx, cz)
    m.next = 0
  }

  const me = {
    ready: () => share,
    blocks: () => ({
      held: made ? made.held.size - made.stale.size : 0, of: made ? made.blocks * made.blocks : 0,
      asked: made ? made.asked.size : 0, queued: made ? made.queue.length - made.next : 0, flight: tasks.size,
    }),
    // The ground held: lattice point (i, j)'s height, when it was trampled and which way it lies, and each
    // grass's share covered, or undefined where its block is not in the window.
    at(i: number, j: number) {
      if (!made?.origin) return undefined
      const m = made, bx = Math.floor(i / BLOCK), bz = Math.floor(j / BLOCK)
      if (!inside(m, m.origin!, bx, bz)) return undefined
      const t = (mod_(j, m.N) * m.N + mod_(i, m.N)) * 4
      return {
        height: m.field.data[t], trampled: m.field.data[t + 1], lies: [m.field.data[t + 2], m.field.data[t + 3]],
        keeps: m.rules.map((_, g) => m.keeps[g >> 2].data[t + (g & 3)]),
      }
    },
    chunks: () => (made ? made.grown.map(g => ({ name: g.name, levels: g.levels.map(l => ({ level: l.level, chunks: l.chunks.map(c => ({ visible: c.mesh.visible, castShadow: c.mesh.castShadow, at: c.at, count: c.count })) })) })) : []),
    // What each level of each grass keeps of its blades: the tiles held in its textures, the tiles kept since it
    // was made, a tile kept again counted again, and the textures, each its size and whether of half floats.
    kept: () => (made ? made.grown.map(g => ({
      name: g.name,
      levels: g.levels.map(l => ({
        level: l.level, held: l.kept.room.held(), drew: l.kept.room.drew(), textures: l.kept.room.textures(),
      })),
    })) : []),

    afterTick(plugins: Plugins) {
      const scene = plugins.wire.scene
      const n = scene.world?.grass3d as Numbers | undefined
      if (!n) return
      if (!plugins.loader) throw new Error('grass3d reads its grasses file through the loader, and this scene does not list loader')
      if (typeof n.grasses !== 'string') throw new Error(`grass3d: world.grass3d.grasses ${JSON.stringify(n.grasses)} is not the name of the grasses file in the scene's loader catalogue`)
      const s = plugins.loader.get(n.grasses) as Grass3d | undefined
      if (!s) return
      const render3d = plugins.render3d
      if (!render3d) throw new Error('grass3d draws round render3d\'s camera, and this scene does not list render3d')
      const order = listed(scene)
      if (order.indexOf('grass3d') > order.indexOf('render3d')) throw new Error('grass3d is listed after render3d, which draws in its afterTick before grass3d has placed the blades')
      const world = scene.world!
      if (!world.grass3d.mods?.land) throw new Error('grass3d stands on a land, and the scene names no world.grass3d.mods.land')
      if (!world.grass3d.mods?.keeper) throw new Error('grass3d keeps what each blade is once it is worked out, and the scene names no world.grass3d.mods.keeper')
      ahead(scene, 'grass3d', 'land')
      ahead(scene, 'grass3d', 'keeper')
      ahead(scene, 'grass3d', 'wind')
      ahead(scene, 'grass3d', 'pressed')
      if (!built || !same(s, built)) {
        drop()
        built = structuredClone(s)
        checked = false
        share = true
      }
      const land = mod<LandMod>(world, 'grass3d', 'land')!(plugins)
      const camera = render3d.camera as THREE.PerspectiveCamera | undefined
      if (!land || !camera) return
      if (!checked) { check(s, land.ground); checked = true }
      const three = render3d.THREE as Three
      if (made && made.cell !== land.cell) drop()
      if (!press) {
        const pressed = mod<Pressed>(world, 'grass3d', 'pressed')?.(plugins)
        const presses: Record<string, Press> = Object.assign({}, ...modsOf<Presses>(world, 'grass3d', 'behaviors').map(f => f()))
        press = { pressed, presses, glsl: pressing(pressed, presses) }
      }
      if (!made) made = make(s, three, plugins, land.cell, press, mod<Keeper>(world, 'grass3d', 'keeper')!(plugins))
      const m = made

      // The page's clock, and the frame's seconds.
      const now = performance.now() / 1000
      if (clock < 0) clock = now
      const time = now - clock
      const dt = last < 0 ? 0 : Math.min(0.25, time - last)
      last = time

      const cx = blockOf(camera.position.x, m.cell), cz = blockOf(camera.position.z, m.cell)
      const moved = land.version !== m.version
      if (moved) {
        m.version = land.version
        m.stale = new Set(m.held.keys())
        m.asked.clear()
        m.back = []
        m.ahead = undefined
        const p = land.worker && workers()
        if (p) for (const w of p) w.worker.postMessage({ type: 'hold', version: land.version, url: land.worker!.url, held: land.worker!.held, cell: m.cell, rules: m.rules } satisfies Asked)
      }
      follow(m, cx, cz, moved)
      const away = !!land.worker && workers() !== false

      // A prepared place: laid out, and arrived at.
      const place = land.prepared ? [blockOf(land.prepared[0], m.cell), blockOf(land.prepared[1], m.cell)] as [number, number] : undefined
      if (!place) m.ahead = undefined
      else if (!m.ahead || m.ahead.at[0] !== place[0] || m.ahead.at[1] !== place[1] || m.ahead.version !== m.version) {
        m.ahead = { at: place, version: m.version!, kept: new Map(), queue: around(m, place[0], place[1]), next: 0, flight: 0, arrived: false }
      }
      const a = m.ahead
      if (a && !a.arrived && cx === a.at[0] && cz === a.at[1]) {
        for (const f of a.kept.values()) if (!fresh(m, key(f.bx, f.bz)) && inside(m, m.origin!, f.bx, f.bz)) write(m, f)
        a.kept.clear()
        a.arrived = true
      }

      // What the workers sent back, written in.
      for (const f of m.back.splice(0)) {
        const k = key(f.bx, f.bz)
        m.asked.delete(k)
        if (inside(m, m.origin!, f.bx, f.bz) && !fresh(m, k)) write(m, f)
      }
      if (away) {
        // Tasks of the window's blocks, then the place's, until FLIGHT are in flight.
        const version = m.version!
        const inFlight = () => [...tasks.values()].length
        while (inFlight() < FLIGHT) {
          const batch: [number, number][] = []
          while (batch.length < BATCH && m.next < m.queue.length) {
            const [bx, bz] = m.queue[m.next++]
            const k = key(bx, bz)
            if (fresh(m, k) || m.asked.has(k) || !inside(m, m.origin!, bx, bz)) continue
            batch.push([bx, bz])
          }
          if (!batch.length) break
          for (const [bx, bz] of batch) m.asked.add(key(bx, bz))
          work(version, batch).then(ans => {
            if (made !== m || ans.version !== m.version) return
            if (ans.out.length) m.back.push(...ans.out)
            else for (const [bx, bz] of batch) m.asked.delete(key(bx, bz))
          })
        }
        if (a && !a.arrived) {
          while (a.flight < FLIGHT && inFlight() < 2 * FLIGHT) {
            const batch: [number, number][] = []
            while (batch.length < BATCH && a.next < a.queue.length) {
              const [bx, bz] = a.queue[a.next++]
              const k = key(bx, bz)
              if (a.kept.has(k) || (fresh(m, k) && inside(m, m.origin!, bx, bz))) continue
              batch.push([bx, bz])
            }
            if (!batch.length) break
            a.flight++
            work(version, batch).then(ans => {
              if (made !== m || m.ahead !== a) return
              a.flight--
              for (const f of ans.out) {
                if (!a.arrived) a.kept.set(key(f.bx, f.bz), f)
                else m.back.push(f)
              }
            })
          }
        }
      } else {
        // Blocks filled here on the page, within `budget`, the window's first, then the place's.
        const start = performance.now()
        let one = false
        while (m.next < m.queue.length && (!one || performance.now() - start < s.budget)) {
          const [bx, bz] = m.queue[m.next++]
          if (fresh(m, key(bx, bz))) continue
          write(m, fill(land.ground, bx, bz, m.cell, m.rules))
          one = true
        }
        if (a && !a.arrived) {
          while (a.next < a.queue.length && performance.now() - start < s.budget) {
            const [bx, bz] = a.queue[a.next++]
            const k = key(bx, bz)
            if (a.kept.has(k) || (fresh(m, k) && inside(m, m.origin!, bx, bz))) continue
            a.kept.set(k, fill(land.ground, bx, bz, m.cell, m.rules))
          }
        }
      }
      const filled = () => around(m, cx, cz).every(([bx, bz]) => fresh(m, key(bx, bz)))
      share = !a || (a.arrived ? filled() : a.next >= a.queue.length && a.flight === 0)

      // The wind and its drift.
      const windMod = mod<WindMod>(world, 'grass3d', 'wind')
      const blowing = windMod?.(plugins)
      const u = m.uniforms
      if (blowing) {
        ;(u.gWind.value as THREE.Vector2).set(blowing.wind[0], blowing.wind[1])
        ;(u.gDrift.value as THREE.Vector2).set(blowing.drift[0], blowing.drift[1])
      } else {
        const a = (s.wind.toward * Math.PI) / 180
        const wx = s.wind.speed * Math.sin(a), wz = -s.wind.speed * Math.cos(a)
        drift = [drift[0] + wx * dt, drift[1] + wz * dt]
        ;(u.gWind.value as THREE.Vector2).set(wx, wz)
        ;(u.gDrift.value as THREE.Vector2).set(drift[0], drift[1])
      }
      ;(u.gCam.value as THREE.Vector3).copy(camera.position)
      u.gTime.value = time

      // The things that press the grass, trampling the ground.
      const eye = camera.position
      for (const thing of press.pressed?.things() ?? []) {
        const word = Object.keys(thing)[0], how = press.presses[word]
        if (how) trample(m, how, thing[word], time)
      }

      // The chunks onto the camera.
      for (const g of m.grown) {
        const T = g.grass.tile
        const ti = Math.floor(eye.x / T), tj = Math.floor(eye.z / T)
        for (const l of g.levels) {
          const L = l.level, o = [ti - Math.floor(L.side / 2), tj - Math.floor(L.side / 2)]
          l.chunks.forEach((c, n) => {
            const at: [number, number] = [o[0] + (n % L.chunks) * L.chunk, o[1] + Math.floor(n / L.chunks) * L.chunk]
            if (!c.at || c.at[0] !== at[0] || c.at[1] !== at[1]) {
              c.at = at
              c.first.array[0] = at[0]
              c.first.array[1] = at[1]
              c.first.needsUpdate = true
            }
            const x0 = at[0] * T, z0 = at[1] * T, x1 = x0 + L.chunk * T, z1 = z0 + L.chunk * T
            const nx = Math.max(x0, Math.min(eye.x, x1)), nz = Math.max(z0, Math.min(eye.z, z1))
            const nearest = Math.hypot(nx - eye.x, nz - eye.z)
            const farthest = Math.hypot(Math.max(Math.abs(x0 - eye.x), Math.abs(x1 - eye.x)), Math.max(Math.abs(z0 - eye.z), Math.abs(z1 - eye.z)))
            const range = groundUnder(m, x0, z0, x1, z1)
            c.mesh.visible = m.onScene && nearest < L.to && farthest >= L.from && range !== undefined
            if (!range) return
            const tall = g.grass.height[0] * (1 + g.grass.height[1] / 2)
            const bound = c.mesh.geometry.boundingSphere!
            bound.center.set((x0 + x1) / 2, (range[0] + range[1] + tall) / 2, (z0 + z1) / 2)
            bound.radius = Math.hypot((x1 - x0) / 2, (z1 - z0) / 2, (range[1] + tall - range[0]) / 2)
            c.mesh.castShadow = nearest < g.grass.shadow
          })
        }
      }

      // What has come into view or stands on changed ground, kept, before render3d draws.
      if (render3d.renderer) keep(m, render3d.renderer as THREE.WebGLRenderer, eye)

      if (!m.onScene && (land.shown ?? true)) {
        m.onScene = true
        for (const g of m.grown) for (const l of g.levels) for (const c of l.chunks) render3d.scene.add(c.mesh)
      }
    },

    close() {
      drop()
      built = undefined
      checked = false
      share = true
      clock = -1
      last = -1
      drift = [0, 0]
      press = undefined
      for (const p of pool || []) p.worker.terminate()
      pool = undefined
      tasks.clear()
    },
  }

  // The [lowest, highest] ground of every held block a rectangle of the world touches, or undefined
  // where it touches none.
  function groundUnder(m: Made, x0: number, z0: number, x1: number, z1: number): [number, number] | undefined {
    const span = BLOCK * m.cell
    let lo = Infinity, hi = -Infinity
    for (let bz = Math.floor(z0 / span); bz <= Math.floor(z1 / span); bz++) {
      for (let bx = Math.floor(x0 / span); bx <= Math.floor(x1 / span); bx++) {
        const r = m.held.get(key(bx, bz))
        if (!r) continue
        lo = Math.min(lo, r[0]); hi = Math.max(hi, r[1])
      }
    }
    return lo <= hi ? [lo, hi] : undefined
  }

  // The height held at lattice point (i, j), or undefined where its block is not held.
  function heldAt(m: Made, i: number, j: number): number | undefined {
    if (!m.held.has(key(Math.floor(i / BLOCK), Math.floor(j / BLOCK)))) return undefined
    const h = m.field.data[(mod_(j, m.N) * m.N + mod_(i, m.N)) * 4]
    return h > NOWHERE ? h : undefined
  }

  // Lattice point (i, j) trampled now, lying along (dx, dz), and marked to go up.
  function tread(m: Made, i: number, j: number, dx: number, dz: number, time: number) {
    const t = (mod_(j, m.N) * m.N + mod_(i, m.N)) * 4
    const len = Math.hypot(dx, dz)
    m.field.data[t + 1] = time
    m.field.data[t + 2] = len > 1e-6 ? dx / len : 0
    m.field.data[t + 3] = len > 1e-6 ? dz / len : 0
    m.field.tex.addUpdateRange(t, 4)
    m.field.tex.needsUpdate = true
  }

  // Every lattice point round a thing that its word says it treads, trampled away from its middle.
  function trample(m: Made, how: Press, data: unknown, time: number) {
    const { at, reach } = how.span(data), c = m.cell
    const slack = { tread: TREAD, cell: c }
    for (let j = Math.floor((at[2] - reach) / c); j <= Math.ceil((at[2] + reach) / c); j++) {
      for (let i = Math.floor((at[0] - reach) / c); i <= Math.ceil((at[0] + reach) / c); i++) {
        const y = heldAt(m, i, j)
        if (y === undefined) continue
        const x = i * c, z = j * c
        if (how.trodden(data, x, y, z, slack)) tread(m, i, j, x - at[0], z - at[2], time)
      }
    }
  }

  return me
}
