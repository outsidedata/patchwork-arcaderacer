// item3d: kit items of the library's pro-ng, drawn in supershader3d's one shader. An item is one kit kind built with
// its keys (a wrench, a helmet, a lantern), baked by the bake's `items` tool (`scripts/items.ts`) into a glb and a
// sidecar. world3d is a place, what stands still and is stood on; item3d is the things that move: lying loose in the
// scene as rows, or held by a body, handed to the plugin that draws the body through item3d's mods. It has no server
// half and no row of its own. Its numbers are the scene's `world.item3d`:
//   items  `{ <item>: { glb, file } }`: each item's glb, a `binary` entry of the loader's catalogue, and its sidecar
//          `<item>.item.json`, a `json` entry with `preload`
//   kinds  `{ <kind>: { item } }`, left out when no item lies loose: every row of a kind listed is drawn as that
//          item, at the row's `pos` [x, y, z] metres, turned by its `rot` [x, y, z, w]. A kind naming an item `items`
//          has not throws.
//   bodies the name in the loader's catalogue of the bodies sheet (The sheet, below), a `json` entry, left out
//          when no body is dressed from one
// A field of `world.item3d`, of an item or of a kind that is none of these throws, naming it.
//
// The sheet. The bodies sheet (`item3d.bodies.ts` says every field) is, for each body a game draws, what it holds
// and where (`holds`), what it wears (`wears`) and its capsules (`capsules`). item3d reads it and draws none of it:
// each part goes to the plugin that does, through a mod of item3d's that the scene names in that plugin's `mods`:
//   holds on a bone    anim's and motion3d's `props` mod (`item3d.anim.ts`, `item3d.motion3d.ts`): the props of the
//                      kind of that name, after the kind's own
//   holds on a place   crowd3d's `items` mod (`item3d.crowd3d.ts`): how each item sits on each place
//   wears              fabric3d's `attach` mod (`item3d.fabric3d.ts`): each fabric kept on every body of that name
//   capsules           anim's and motion3d's `capsules` mod: the capsules of the kind of that name, after its own
// The sheet is checked when it lands and again whenever the loader hands a new one (the file written while the
// game runs), and a sheet that is not one throws, naming the body and the field. Until it lands each mod hands
// nothing: no body holds, wears or is met, and crowd3d waits for it before it builds.
//
// The sidecar is `{ item, kind, keys, materials, clips, spawns }` (`Sidecar`, `scripts/items.ts`): `materials` the
// names of the item's materials in the order its glb's vertices count them, `clips` its clips as pro-ng wrote them,
// `spawns` the effects that burn on it, `[{ effect, at, dir }]`, each a point in metres and a way in its own frame
// (The effects, below). A scene
// has one looks file, which holds every material of every item beside the scene's own (the bake composes them:
// `items` hands back the items' materials for the `looks` tool). As an item is made, each vertex's `lookId`, and the
// material's number in its `lookInfo`, is renumbered from the item's own count to the number that material has in the
// scene's looks file, by its name. A material the looks file has not throws, naming the item and the material.
//
// An item is made once its glb has landed and supershader3d's looks file has: the glb unpacked and assembled as a
// place's is (`plugins/supershader3d/supershader3d.glb.ts`), every mesh in one geometry, each triangle in the run of
// the call that draws its material, at most three calls.
//
// The effects. An item's own particles and lamps, which its kit kind says, burn on every copy of it drawn, wherever
// it is, through particle3d: a scene with `world.particle3d.mods: { sources: ['item3d'] }` (`item3d.particle3d.ts`)
// is handed, each frame, a source for each spawn of each copy, naming the spawn's effect, at the spawn's point and
// along its way as the copy stands then. A copy is an object `mesh(item)` handed out that is in a scene and shown
// (a loose item, a prop anim or motion3d hangs on a bone), or one a plugin that draws its own copies says it carries
// (`carried`, below: crowd3d's people's, through `item3d.crowd3d.ts`). The scene's effects file lists each item's
// `<item>.effects.json` under `files`, and particle3d is listed after the plugins that pose the bodies. With no such
// mod named nothing burns.
//
// The hair. The hair an item's kit kind grows (the sidecar's `grows`, `[{ row, number, part, hair }]`: a part of
// the item, its thing's row and its number in its thing, which each vertex's `lookInfo` holds, and the hair's name
// in the scene's hairs file) grows on every copy of it through hair3d, whose `skins` and `behaviors` name item3d
// (`item3d.hair3d.ts`): each such part is a skin, its triangles alone. Every copy that stands stiff is one wearer of
// all of them, each copy a row of one texture of matrices, a draw for all; a copy with bones of its own is a wearer
// by itself on its own skin's bones, so a part a bone carries takes its hair with it.
//
// The cloth. The fabrics an item's kit kind hangs (the sidecar's `wears`, names in the scene's fabrics file, whose
// pins the bake's items tool wrote) hang on every copy of it through fabric3d, whose `attach` and `sources` name
// item3d (`item3d.fabric3d.ts`): each copy is a thing of the item's own `of` (`wornAs`), its points the item
// (`item`, `STIFF`) and, for a copy with bones, each bone of it.
//
// What it hands out, for its mods and for a game's own look:
//   ready(item)   whether the item is made
//   mesh(item)    a new object of the item, at the item's own zero, y up, metres, wearing supershader3d's materials,
//                 casting and taking shadows and marked moving (`userData.moving`, so lights3d draws its shadow each
//                 frame). An item that stands still is a Mesh that shares the item's one geometry; an item that moves
//                 (a skin, morph targets) is its own SkinnedMesh or Mesh with its own bones, and every clip of its
//                 sidecar whose `start` is `on` plays on it from then, advanced each tick by the engine's `dt`. The
//                 object is the caller's to add to the scene and to take away; one taken away is forgotten on the
//                 next tick. It is never dressed again by its caller: `render3d.dress` would write over the looks.
//   parts(item)   the item as geometries a plugin instances itself, `{ call, geometry }[]`, one for each call that
//                 draws any of it, each with every vertex attribute the looks read, for crowd3d's held copies. An
//                 item that moves throws: a copy posed on the GPU by one bone has no bones of its own.
//   sidecar(item) the item's sidecar
//   bodies()      the bodies of the sheet, `{ <body>: { holds, wears, capsules } }`, checked, the sheet's own
//                 objects, so a number changed in one is read where it is; `{}` with no `bodies` named, and
//                 undefined until the sheet has landed, which it asks the loader for
//   carried(by, copies)  the copies of items the plugin `by` draws itself this frame, `{ key, item, matrix }[]`
//                 (`Carried`): `key` the same every frame the copy is there, `matrix` column-major from the item's
//                 own frame to the world. Each call takes the place of `by`'s last.
//   sources()     every spawn of every copy this frame as a source of particle3d's (The effects, above), its `on`
//                 `item`, its `of` the item
//   wearers()     hair3d's wearers of every item that grows hair, and `skin(thing)` the skin of one's part (The
//                 hair, above)
//   things()      fabric3d's things of every copy of an item that hangs cloth, and `hung()` each item's fabrics as
//                 entries of fabric3d's attach, `{ fabric, of }` (The cloth, above)
// Each of the first four throws for an item `world.item3d.items` has not, and `mesh` and `parts` for one not yet
// made.
//
// Its mods hand an item to the plugin that draws a body: `item3d.anim.ts` and `item3d.motion3d.ts` (a prop `{ item,
// bone, at, turn }` beside `{ model, ... }`), `item3d.crowd3d.ts` (an item `{ item, <place>: { at, turn, scale } }`
// beside `{ model, ... }`), each named in that plugin's `mods`. A prop or an item that names a `model` is a loader
// glb drawn as it always was; nothing of item3d touches it. The same mods hand each plugin its part of the sheet,
// and `item3d.fabric3d.ts` hands fabric3d what each body wears.
//
// It is listed after loader and supershader3d, before anim, motion3d and crowd3d where they hold its items, and
// before render3d; the other orders throw. `close` disposes every geometry it made.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { listed } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Call, Looks } from '#plugins/supershader3d/supershader3d.plugin.ts'
import { assemble, unpack, type Unpacked } from '#plugins/supershader3d/supershader3d.glb.ts'
import { played, type Clips, type Spawn } from '#plugins/world3d/world3d.place.ts'
import type { Source } from '#plugins/particle3d/particle3d.plugin.ts'
import type { Frame, Pose, Skinned, Wearer } from '#plugins/hair3d/hair3d.sim.ts'
import type { Placed, Thing } from '#plugins/fabric3d/fabric3d.plugin.ts'
import { check, type Bodies, type Body } from './item3d.bodies.ts'

// An item's sidecar, as the bake's items tool writes it (`scripts/items.ts`).
export type Sidecar = { item: string; kind: string; keys: Record<string, unknown>; materials: string[]; clips: Clips; spawns: Spawn[]; grows: Grow[]; wears: string[] }
// The point of an item a fabric's pin is `on` when no bone of the item carries it: the item itself.
export const STIFF = 'item'
// A part of an item that grows a hair: the part's name and its number in its thing, the thing's row in the item
// (each vertex's `lookInfo` y and z), and the hair's name in the scene's hairs file.
export type Grow = { row: number; number: number; part: string; hair: string }
// A part of an item as a skin of hair3d's, as `wearers` hands it under the word `item`: the item, the part by its
// row and number, and for a copy with bones of its own, that copy's object.
export type Grown = { item: string; row: number; number: number; object?: THREE.SkinnedMesh }
// hair3d's kind of an item's wearers, which the hairs file's `kinds` lists.
export const wornAs = (item: string) => `item3d/${item}`
// The name of a part's skin, which a hair's `on.meshes` matches.
export const skinName = (row: number, part: string) => `${row} ${part}`
// A copy of an item a plugin draws itself and carries: what it is, the same every frame, its item, and where it
// is this frame, a column-major matrix from the item's own frame to the world.
export type Carried = { key: string; item: string; matrix: number[] }
export type Numbers = { items: Record<string, { glb: string; file: string }>; kinds?: Record<string, { item: string }>; bodies?: string }
export type Part = { call: Call; geometry: THREE.BufferGeometry }
// An item made: its glb unpacked and renumbered, whether it moves, and the one mesh a still item's copies share.
type Made = { unpacked: Unpacked; moves: boolean; shared: THREE.Mesh | undefined; parts: Part[] | undefined }
type Three = typeof import('three')

const OWN = new Set(['items', 'kinds', 'bodies'])
// The bodies of a scene that names no sheet.
const NOBODY: Record<string, Body> = {}
// The drivers of a source of item3d's: none.
const NONE: Record<string, number> = {}

// The scene's numbers, checked: every field one of item3d's, every kind's item one of `items`.
export function numbersOf(world: Record<string, any>): Numbers {
  const n = world.item3d as Numbers | undefined
  if (!n) throw new Error('the scene names item3d but gives no world.item3d')
  for (const k of Object.keys(n)) if (k !== 'mods' && !OWN.has(k)) throw new Error(`world.item3d has ${k}, which item3d does not know: its fields are items, kinds and bodies`)
  if (!n.items || typeof n.items !== 'object') throw new Error('world.item3d gives no items')
  for (const [name, item] of Object.entries(n.items)) {
    for (const k of Object.keys(item)) if (k !== 'glb' && k !== 'file') throw new Error(`world.item3d.items.${name} has ${k}; an item is its glb and its file`)
    if (typeof item.glb !== 'string' || typeof item.file !== 'string') throw new Error(`world.item3d.items.${name} is { glb, file }, each the name of a catalogue entry`)
  }
  for (const [kind, k] of Object.entries(n.kinds ?? {})) {
    for (const f of Object.keys(k)) if (f !== 'item') throw new Error(`world.item3d.kinds.${kind} has ${f}; a kind is its item`)
    if (!n.items[k.item]) throw new Error(`world.item3d.kinds.${kind} is the item ${k.item}, which is none of world.item3d.items: ${Object.keys(n.items).join(', ')}`)  }
  if (n.bodies !== undefined && typeof n.bodies !== 'string') throw new Error(`world.item3d.bodies is ${JSON.stringify(n.bodies)}, and it is the name of the bodies sheet in the loader's catalogue`)
  return n
}

// The glb's vertices renumbered from the item's own materials to the scene's: each `lookId`, and the material's
// number in `lookInfo`, the number `idOf` gives the material's name.
export function renumber(unpacked: Unpacked, item: string, materials: string[], idOf: (name: string) => number | undefined) {
  const to = materials.map(name => {
    const id = idOf(name)
    if (id === undefined) throw new Error(`item3d: the item ${item} is drawn in the material ${name}, which the scene's looks file has not: bake the game again, its looks composed with the items' materials`)
    return id
  })
  for (const m of unpacked.meshes) {
    const ids = m.inputs.lookId, info = m.inputs.lookInfo
    for (let v = 0; v < m.count; v++) {
      const was = Math.round(ids[v])
      if (to[was] === undefined) throw new Error(`item3d: a vertex of the item ${item} has the lookId ${ids[v]}, and its sidecar lists ${materials.length} materials`)
      ids[v] = to[was]
      if (info) info[v * 3] = to[was]
    }
  }
}

// A geometry's groups as geometries of their own, one a call, each vertex attribute kept.
function split(T: Three, mesh: THREE.Mesh, looks: Looks): Part[] {
  const g = mesh.geometry
  const index = g.index!.array
  const lookId = g.getAttribute('lookId')
  return g.groups.map(group => {
    const call = looks.materials[Math.round(lookId.getX(index[group.start]))].call
    const used = new Map<number, number>()
    const order: number[] = []
    const out = new Uint32Array(group.count)
    for (let i = 0; i < group.count; i++) {
      const v = index[group.start + i]
      let at = used.get(v)
      if (at === undefined) { at = order.length; used.set(v, at); order.push(v) }
      out[i] = at
    }
    const geometry = new T.BufferGeometry()
    for (const [name, a] of Object.entries(g.attributes)) {
      const from = a.array as Float32Array, size = a.itemSize
      const values = new Float32Array(order.length * size)
      order.forEach((v, k) => { for (let c = 0; c < size; c++) values[k * size + c] = from[v * size + c] })
      geometry.setAttribute(name, new T.BufferAttribute(values, size))
    }
    geometry.setIndex(new T.BufferAttribute(out, 1))
    geometry.computeBoundingSphere()
    return { call, geometry }
  })
}

export function item3d() {
  let three: Three | undefined
  let numbers: Numbers | undefined
  let plugins: Plugins | undefined
  let started = false
  let starts = 0
  const made = new Map<string, Made>()
  // each glb unpacked, waiting on the looks file
  const landed = new Map<string, Unpacked>()
  // a glb that landed and could not be unpacked, thrown by the next tick
  let broken: Error | undefined
  const geometries: THREE.BufferGeometry[] = []
  // every object of a moving item handed out, with its mixer, and whether it has been seen in a scene
  const moving = new Map<THREE.Object3D, { mixer: THREE.AnimationMixer; placed: boolean }>()
  // every object handed out of an item that has spawns, and whether it has been seen in a scene
  const burning = new Map<THREE.Object3D, { item: string; placed: boolean }>()
  // the copies other plugins carry this frame, by the plugin that carries them
  const carrying = new Map<string, Carried[]>()
  // the loose items drawn, by their row's id
  const loose = new Map<number, { object: THREE.Object3D; item: string }>()
  // the bodies sheet the loader last handed, once checked, and the sheet asked of the loader
  let sheet: Bodies | undefined
  let asked: string | undefined

  const known = (item: string) => {
    if (!numbers?.items[item]) throw new Error(`item3d has no item ${item}: world.item3d.items has ${Object.keys(numbers?.items ?? {}).join(', ') || 'none'}`)
  }
  const got = (item: string) => {
    known(item)
    const it = made.get(item)
    if (!it) throw new Error(`item3d: the item ${item} is not made yet; ask ready(item) first`)
    return it
  }
  const material = (call: Call) => {
    const m = plugins!.supershader3d.material(call) as THREE.Material | undefined
    if (!m) throw new Error(`item3d: an item draws ${call} triangles, and supershader3d has no ${call} material`)
    return m
  }
  // whether an object is in a scene with nothing over it hidden
  const shown = (object: THREE.Object3D) => {
    if (!object.parent) return false
    for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false
    return true
  }
  // each part's skin, once made, and each item's copies that stand stiff, as hair3d reads them: a float texture
  // of four texels a row, a copy's matrix a row, made again twice as tall when the copies outgrow it
  const skins = new Map<string, Skinned>()
  const stiff = new Map<string, { texture: THREE.DataTexture; room: number }>()
  // The stiff copies of an item this moment, each one's matrix a row of its texture: every object of it in a scene
  // and shown that has no bones of its own, then every copy a plugin carries.
  const standing = (item: string) => {
    const T = three!
    const matrices: ArrayLike<number>[] = []
    for (const [object, b] of burning) {
      if (b.item !== item || (object as THREE.SkinnedMesh).isSkinnedMesh || !shown(object)) continue
      object.updateWorldMatrix(true, false)
      matrices.push(object.matrixWorld.elements)
    }
    for (const copies of carrying.values()) for (const c of copies) if (c.item === item) matrices.push(c.matrix)
    let s = stiff.get(item)
    if (!s || s.room < matrices.length) {
      s?.texture.dispose()
      const room = Math.max(1, 2 ** Math.ceil(Math.log2(Math.max(1, matrices.length))))
      const texture = new T.DataTexture(new Float32Array(room * 16), 4, room, T.RGBAFormat, T.FloatType)
      texture.minFilter = texture.magFilter = T.NearestFilter
      stiff.set(item, (s = { texture, room }))
    }
    const data = s.texture.image.data as Float32Array
    matrices.forEach((m, i) => data.set(m, i * 16))
    s.texture.needsUpdate = true
    return { texture: s.texture, copies: matrices.length }
  }
  const lit = <O extends THREE.Object3D>(o: O) => {
    o.castShadow = true
    o.receiveShadow = true
    o.userData.moving = true
    return o
  }

  // An item made of its unpacked glb, once the looks file has landed.
  function make(item: string, unpacked: Unpacked) {
    const p = plugins!, T = three!
    const side = me.sidecar(item)
    renumber(unpacked, item, side.materials, name => p.supershader3d.idOf(name))
    const moves = !!unpacked.skin || unpacked.meshes.some(m => m.targets)
    let shared: THREE.Mesh | undefined
    if (!moves) {
      shared = assemble(T, unpacked, p.supershader3d.looks() as Looks, material)
      geometries.push(shared.geometry)
    }
    made.set(item, { unpacked, moves, shared, parts: undefined })
  }

  const me = {
    tick(p: Plugins) {
      plugins = p
      const scene = p.wire.scene
      numbers = numbersOf(scene.world!)
      if (!started) {
        const order = listed(scene)
        const before = (a: string) => order.includes(a) && order.indexOf(a) < order.indexOf('item3d')
        if (!p.supershader3d) throw new Error('item3d draws through supershader3d, which this scene does not name')
        if (!p.render3d) throw new Error('item3d draws through render3d, which this scene does not name')
        if (!before('loader')) throw new Error("item3d is listed before the loader, whose glbs it asks for in its tick")
        if (!before('supershader3d')) throw new Error('item3d is listed before supershader3d, whose looks its items are made in')
        if (before('render3d')) throw new Error("item3d is listed after render3d, which would draw its items a frame late")
        for (const host of ['anim', 'motion3d', 'crowd3d']) if (before(host)) throw new Error(`item3d is listed after ${host}, which asks it for the items it holds in its own tick`)
        started = true
        three = p.render3d.THREE as Three
        const mine = ++starts
        for (const [item, { glb }] of Object.entries(numbers.items)) {
          // The loader writes a glb that fails to land to the console once itself; one that lands and is no glb
          // item3d can draw is thrown by the next tick, naming the item.
          p.loader.load(glb).then((file: { bytes: Uint8Array }) =>
            unpack(file.bytes).then(
              unpacked => { if (mine === starts && started) landed.set(item, unpacked) },
              (e: Error) => { if (mine === starts && started) broken = new Error(`item3d: the item ${item}'s glb ${glb} is not one it draws: ${e.message}`) },
            )).catch(() => {})
        }
      }
      if (broken) { const e = broken; broken = undefined; throw e }
      if (landed.size && p.supershader3d.looks()) {
        for (const [item, unpacked] of landed) make(item, unpacked)
        landed.clear()
      }
      // the clips of every moving item's object, and those taken out of their scene forgotten
      const dt = scene.prefabs.engine.dt as number
      for (const [object, m] of moving) {
        if (object.parent) m.placed = true
        else if (m.placed) { m.mixer.stopAllAction(); m.mixer.uncacheRoot(object); moving.delete(object); continue }
        m.mixer.update(dt)
      }
      for (const [object, b] of burning) {
        if (object.parent) b.placed = true
        else if (b.placed) burning.delete(object)
      }
      // the loose items: every row of a kind `kinds` lists, drawn where it lies
      const kinds = numbers.kinds ?? {}
      const seen = new Set<number>()
      for (const r of p.wire.rows as Row[]) {
        const k = kinds[r.kind]
        if (!k) continue
        seen.add(r.id)
        let it = loose.get(r.id)
        if (it && it.item !== k.item) { it.object.removeFromParent(); loose.delete(r.id); it = undefined }
        if (!it) {
          if (!made.has(k.item)) continue
          it = { object: me.mesh(k.item), item: k.item }
          it.object.name = `item3d ${r.kind} ${r.id}`
          p.render3d.scene.add(it.object)
          loose.set(r.id, it)
        }
        const pos = r.data.pos as number[] | undefined, rot = r.data.rot as number[] | undefined
        if (!Array.isArray(pos) || pos.length !== 3 || !Array.isArray(rot) || rot.length !== 4) throw new Error(`item3d: the ${r.kind} ${r.id} lies loose with no pos [x, y, z] and rot [x, y, z, w]`)
        it.object.position.fromArray(pos)
        it.object.quaternion.fromArray(rot)
      }
      for (const [id, it] of loose) if (!seen.has(id)) { it.object.removeFromParent(); loose.delete(id) }
    },
    ready(item: string) {
      known(item)
      return made.has(item)
    },
    mesh(item: string): THREE.Object3D {
      const it = got(item)
      const T = three!
      const side = me.sidecar(item)
      const burns = <O extends THREE.Object3D>(o: O) => {
        if (side.spawns.length || side.grows.length || side.wears.length) burning.set(o, { item, placed: false })
        return o
      }
      if (it.shared) return burns(lit(new T.Mesh(it.shared.geometry, it.shared.material)))
      const object = burns(lit(assemble(T, it.unpacked, plugins!.supershader3d.looks() as Looks, material)))
      geometries.push(object.geometry)
      object.frustumCulled = false
      const mixer = new T.AnimationMixer(object)
      for (const clip of played(T, mixer, object, it.unpacked, side.clips)) if (clip.start) clip.action.play()
      moving.set(object, { mixer, placed: false })
      return object
    },
    parts(item: string): Part[] {
      const it = got(item)
      if (!it.shared) throw new Error(`item3d: the item ${item} moves (a skin or morph targets), and a copy posed on the GPU by one bone has no bones of its own`)
      if (!it.parts) {
        it.parts = split(three!, it.shared, plugins!.supershader3d.looks() as Looks)
        for (const part of it.parts) geometries.push(part.geometry)
      }
      return it.parts
    },
    sidecar(item: string): Sidecar {
      known(item)
      const side = plugins!.loader.get(numbers!.items[item].file) as Sidecar | undefined
      if (!side) throw new Error(`item3d: the item ${item}'s sidecar ${numbers!.items[item].file} has not landed: give its catalogue entry preload`)
      return side
    },
    carried(by: string, copies: Carried[]) {
      for (const c of copies) known(c.item)
      carrying.set(by, copies)
    },
    sources(): Source[] {
      if (!three) return []
      const T = three
      const out: Source[] = []
      const at = new T.Vector3(), dir = new T.Vector3(), m = new T.Matrix4()
      const thrown = (key: string, item: string, matrix: THREE.Matrix4) => {
        me.sidecar(item).spawns.forEach((s, i) => {
          at.fromArray(s.at).applyMatrix4(matrix)
          dir.fromArray(s.dir).transformDirection(matrix)
          out.push({ key: `${key} ${i}`, on: 'item', of: item, effect: s.effect, at: at.toArray(), dir: dir.toArray(), drivers: NONE })
        })
      }
      for (const [object, b] of burning) {
        if (!shown(object)) continue
        object.updateWorldMatrix(true, false)
        thrown(`item3d ${object.id}`, b.item, object.matrixWorld)
      }
      for (const [by, copies] of carrying) for (const c of copies) if (me.sidecar(c.item).spawns.length) thrown(`item3d ${by} ${c.key}`, c.item, m.fromArray(c.matrix))
      return out
    },
    hung(): { fabric: string; of: string }[] {
      if (!numbers || !plugins) return []
      return Object.keys(numbers.items).flatMap(item => ((plugins!.loader.get(numbers!.items[item].file) as Sidecar | undefined)?.wears ?? []).map(fabric => ({ fabric, of: wornAs(item) })))
    },
    things(): Thing[] {
      if (!three) return []
      const T = three
      const out: Thing[] = []
      const placed = (m: THREE.Matrix4): Placed => {
        const at = new T.Vector3(), rot = new T.Quaternion()
        m.decompose(at, rot, new T.Vector3())
        return { at: at.toArray(), rot: rot.toArray() }
      }
      for (const [object, b] of burning) {
        if (!me.sidecar(b.item).wears.length || !shown(object)) continue
        const boned = (object as THREE.SkinnedMesh).isSkinnedMesh ? (object as THREE.SkinnedMesh) : undefined
        out.push({
          key: `item3d ${object.id}`, of: wornAs(b.item),
          point(on) {
            object.updateWorldMatrix(true, false)
            if (on === STIFF) return placed(object.matrixWorld)
            const k = boned ? boned.skeleton.bones.findIndex(bone => bone.name.endsWith(on)) : -1
            if (k < 0) return undefined
            const bone = boned!.skeleton.bones[k]
            bone.updateWorldMatrix(true, false)
            // where the skin puts a point of the item's own frame that this bone carries whole
            return placed(new T.Matrix4().multiplyMatrices(object.matrixWorld, boned!.bindMatrixInverse).multiply(bone.matrixWorld).multiply(boned!.skeleton.boneInverses[k]).multiply(boned!.bindMatrix))
          },
        })
      }
      const m = new T.Matrix4()
      for (const [by, copies] of carrying) for (const c of copies) {
        if (!me.sidecar(c.item).wears.length) continue
        out.push({ key: `item3d ${by} ${c.key}`, of: wornAs(c.item), point: on => (on === STIFF ? placed(m.fromArray(c.matrix)) : undefined) })
      }
      return out
    },
    wearers(): Wearer[] {
      if (!three) return []
      const out: Wearer[] = []
      const still = new Set<string>()
      for (const [object, b] of burning) {
        const grows = me.sidecar(b.item).grows
        if (!grows.length || !shown(object)) continue
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) out.push({ id: `item3d ${b.item} ${object.id}`, kind: wornAs(b.item), skins: grows.map(g => ({ item: { item: b.item, row: g.row, number: g.number, object: object as THREE.SkinnedMesh } satisfies Grown })) })
        else still.add(b.item)
      }
      for (const copies of carrying.values()) for (const c of copies) if (me.sidecar(c.item).grows.length) still.add(c.item)
      for (const item of still) out.push({ id: `item3d ${item}`, kind: wornAs(item), skins: me.sidecar(item).grows.map(g => ({ item: { item, row: g.row, number: g.number } })) })
      return out
    },
    skin(thing: Grown): Skinned {
      const T = three!
      const key = `${thing.item}|${thing.row}|${thing.number}`
      const mine = thing.object ? `${key}|${thing.object.id}` : key
      const held = skins.get(mine)
      if (held) return held
      const it = got(thing.item)
      const grow = me.sidecar(thing.item).grows.find(g => g.row === thing.row && g.number === thing.number)
      if (!grow) throw new Error(`item3d: the item ${thing.item} grows no hair on the part ${thing.number} of its thing ${thing.row}`)
      const bound = it.unpacked.skin
      const frames = (): Frame[] => thing.object && bound
        ? bound.bones.map((b, k) => ({ name: b.name, bind: new T.Matrix4().fromArray(bound.inverses, k * 16).invert().elements.slice() }))
        : [{ name: 'item', bind: new T.Matrix4().elements.slice() }]
      const pose: Pose = { bones: undefined as unknown as THREE.Texture, first: thing.object ? -1 : 0, copies: 1, bind: new T.Matrix4() }
      const skin: Skinned = {
        name: skinName(grow.row, grow.part), key: thing.object ? `${key}|boned` : key, unit: 1, frames,
        skin() {
          // the part's triangles, of every mesh of the glb, its vertices as the glb has them
          const positions: number[] = [], normals: number[] = [], bones: number[] = [], weights: number[] = [], triangles: number[] = []
          for (const m of it.unpacked.meshes) {
            const info = m.inputs.lookInfo, p = m.inputs.position, n = m.inputs.normal
            const of = (v: number) => Math.round(info[v * 3 + 1]) === grow.row && Math.round(info[v * 3 + 2]) === grow.number
            const at = new Map<number, number>()
            for (let i = 0; i < m.index.length; i += 3) {
              const tri = [m.index[i], m.index[i + 1], m.index[i + 2]]
              if (!tri.every(of)) continue
              for (const v of tri) {
                let to = at.get(v)
                if (to === undefined) {
                  to = positions.length / 3
                  at.set(v, to)
                  positions.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2])
                  normals.push(n[v * 3], n[v * 3 + 1], n[v * 3 + 2])
                  if (thing.object && m.joints && m.weights) {
                    const w = [0, 1, 2, 3].map(k => m.weights![v * 4 + k]), sum = w[0] + w[1] + w[2] + w[3] || 1
                    for (let k = 0; k < 4; k++) { bones.push(m.joints[v * 4 + k]); weights.push(w[k] / sum) }
                  } else { bones.push(0, 0, 0, 0); weights.push(1, 0, 0, 0) }
                }
                triangles.push(to)
              }
            }
          }
          if (!triangles.length) throw new Error(`item3d: the item ${thing.item}'s part ${grow.part} has no triangle to grow the hair ${grow.hair} on`)
          return { positions: new Float32Array(positions), normals: new Float32Array(normals), bones: new Float32Array(bones), weights: new Float32Array(weights), triangles: new Uint32Array(triangles), frames: frames() }
        },
        pose() {
          const o = thing.object
          if (o) {
            o.updateWorldMatrix(true, false)
            o.skeleton.update()
            if (!o.skeleton.boneTexture) o.skeleton.computeBoneTexture()
            pose.bones = o.skeleton.boneTexture!
            pose.bind.multiplyMatrices(o.matrixWorld, o.bindMatrixInverse)
            return pose
          }
          const stand = standing(thing.item)
          pose.bones = stand.texture
          pose.copies = stand.copies
          return pose
        },
      }
      skins.set(mine, skin)
      return skin
    },
    bodies(): Record<string, Body> | undefined {
      if (!numbers) throw new Error('item3d is asked for its bodies before its first tick: list it before the plugin that asks')
      if (numbers.bodies === undefined) return NOBODY
      const loader = plugins!.loader
      if (asked !== numbers.bodies) {
        asked = numbers.bodies
        // the sheet written while the game runs is the loader's same object filled again: checked again
        loader.onWritten(asked, () => { sheet = undefined })
        // The loader writes a failure to the console once itself.
        if (!loader.ready(asked)) loader.load(asked).catch(() => {})
      }
      if (!loader.ready(numbers.bodies)) return undefined
      const file = loader.get(numbers.bodies) as unknown
      if (file !== sheet) {
        check(file, Object.keys(numbers.items))
        sheet = file
      }
      return sheet!.bodies
    },
    close() {
      for (const it of loose.values()) it.object.removeFromParent()
      loose.clear()
      for (const [object, m] of moving) { m.mixer.stopAllAction(); m.mixer.uncacheRoot(object) }
      moving.clear()
      burning.clear()
      carrying.clear()
      skins.clear()
      for (const s of stiff.values()) s.texture.dispose()
      stiff.clear()
      for (const g of geometries.splice(0)) g.dispose()
      made.clear()
      landed.clear()
      sheet = undefined
      asked = undefined
      started = false
      plugins = undefined
    },
  }
  return me
}
