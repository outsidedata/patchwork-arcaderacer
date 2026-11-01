// motion3d's browser half: every body motion3d moves drawn from its row's fields as they stand, a body
// held to a point of a space that moves drawn on that point as the page draws the space, a tilted body
// drawn tilted, its prop carried and its limbs bent (The bend, below). The server
// half (`motion3d.sim.ts`, `motion3d.play.ts`) says what the fields hold; this half draws them and moves
// nothing.
//
// The body. Each row of a kind `world.motion3d.kinds` lists (by its `as`, else its kind) gets its own
// `plugins.loader.model(<kind>.model)` clone, placed at the row's position and turned to its facing (the
// fields its kind's `reads` names `pos` and `yaw`), and added to render3d's scene. The model is asked of
// the loader once, and the row is drawn once it has landed. Every material is handed to `render3d.dress`
// once, and every mesh casts and takes shadows. The model is taken off the scene when its row ends, and
// `close` takes every one off. A row with no clip yet is drawn at rest.
//
// The clips. Every clip the rig lists is read out of the model's animations once per model and rig (a
// listed clip the model lacks throws naming it). Each clip's tracks are moved to start at 0, so `clipT`
// is the clip's own time, and a clip whose length is more than a frame from its table `dur` throws,
// naming it. A mirrored clip is built from its source here: the tracks of Left and Right bones swapped,
// x positions negated and the quaternions' y and z negated. They are built again when the rig's `clips`
// or `table` change.
//
// The mixer is scrubbed, never run. Every action is always playing; each frame writes each action's
// `time` and weight from the row, then calls `mixer.update(0)`: `clip` at `clipT` with weight `blend`, and
// `from`, frozen at `fromT`, with 1 − `blend`, so the fade runs over `fade` on the row's own fields. Each
// slot has an action of its own per clip, so a clip fading into itself is drawn at both its times.
//   The upper half: `upper` at `upperW` and `was` at `wasW`, each clip's tracks of the bones from the
//     row's `upperBone` (`wasBone`) up as a clip of their own, bound to the model root, weighted as
//     `partsOf` weighs them, over the body's two (anim's upper layer, its mask each move's own bone).
//
//
// Pinning. The row carries the body's travel, so the hips must not carry it again. The hips are the
// bone the clips key that has no bone above it. A one-shot that carries travel has their horizontal
// position at rest; a loop at rest plus their sway about its steady progress, straight from where the
// clip starts them to where it ends them; a one-shot whose travel turns has the curve's yaw at the
// playhead taken back off them, about the vertical (read from the hips' parent, the armature being
// Z-up). A one-shot that carries no travel is drawn as its clip draws it. Each slot's hips are pinned as
// its clip is and weighted as the mixer weights it, written every frame.
//
// Props. `<kind>.props: [{ model, bone, at, turn }]` hangs loader models on the body: each row gets its
// own clone per prop, made once every one has landed and added to render3d's scene, placed at the world
// frame of `bone` (the first bone whose name ends with it) with that frame's scale taken off, then moved
// by `at` (metres) and turned by `turn` (degrees, an XYZ Euler) in the bone's scale-free frame. They are
// placed at the end of the `tick` and again in the `afterTick`, so motion3d is listed before render3d
// (the other order throws).
//
// A row limp by the field its kind's `reads` names `limp` is not drawn: whatever made it limp owns its
// model, reached through `model(id)`; once it gets up its bones are put back at their rest and its mixer
// made again.
//
// A body on a drawn space. The server stands a held body's root where its point has it, from the
// space's row. In the `tick`, once the body is posed, and again in the `afterTick`, for each row held in
// a space (its `space` set) to a point (its `root` set), not limp, whose space the `object` mod draws
// (`world.motion3d.mods.object`, `object(plugins, space)`: the three.js object the space is drawn by this
// frame, a car rolling on its springs; listed before motion3d, `ahead`): the body's root is put where it
// stands in the space's row's frame (its `pos` and `yaw`), in the drawn object's frame instead, its scale
// kept, and its props moved by as much as the root was. With no `object` named, a body is drawn where
// its row stands.
//
// A tilted body. For each row that carries a `tilt` (`motion3d.sim.ts`, Tilt) and is on no drawn space,
// its root is turned by its tilt about itself, the props with it, once a frame.
//
// The bend. In the `tick`, once the body is posed and placed, and again in the `afterTick`, after its
// props are hung again: each bone the last bend turned that still stands as it left it is put back as it
// stood (a bone its clip has written since is left), so every bend starts from the clips' pose. Then each
// limb its motion pins onto its target (`reachesOf`), in its order. Then the body's carry
// (`motion3d.sim.ts`, Carries; `carrying`): its prop set by its anchor (ik3d's `anchor`), eased from where
// it hangs by the carry's share, and each of its limbs reaching its empty in the prop, eased from where its
// end bone is drawn by the same share; a prop still loading is waited for. A prop some carry holds is
// drawn only while it is carried. Each limb is ik3d's `reach` (`ik3d.solve.ts`) on the
// skeleton copy whose bones' names carry no `_N`, each bone it turns lending its turn to the bone of the
// same name in every other copy. A limp body is not bent.
//
// The aim. A row's `aim`, a direction [x, y, z] in the world (the rule's to write; none, not aimed), is
// where the prop its carry holds points while the upper half's move plays a loop (a pose held up, not
// a draw or a holster). In the bend, before the carry is set: the prop is set by its anchor, its forward
// is its anchor point's −Z, and the turn that lays that forward along the aim (across about the world's
// up, then up or down) is shared evenly among the bones from the upper half's `over` bone up to the
// anchor bone's parent, by the carry's share, each about its own joint. The carry is then set on the
// turned body and its limbs reach it, so the hands follow the prop. Its anchor bone must be under the
// `over` bone (else it throws).
//
// `model(id)` is the row's model root, or undefined before it is built; `props(id)` its prop roots in
// its kind's order, or [] before they are made; `socket(id, suffix)` the first object under its model,
// depth first, whose name ends with `suffix`. Each is posed for the frame once the `tick` has run.
// `limbs(plugins, row)` is each limb the row's motion pins this frame (`reachesOf`), its bones, its pole
// and a three.js object at its reach, in the frame of the body's root as drawn; one object for each of
// the row's limbs, kept from frame to frame. Undefined for a row with no limb pinned, or no drawn body.
// `short(id)` is how far each limb's end bone ended from its target on the last bend, metres, in the
// bend's order, or undefined for a row not drawn. `aimed(id)` is its last aim, `{ forward, bone,
// anchor, hands }`: before the turn, the prop's forward [x, y, z] and its anchor bone's turn [x, y, z, w];
// after it and before the bend, the anchor bone's frame and each of the carry's limbs' end bones', each
// a matrix's 16 numbers; in the world; undefined when the body was not aimed. `close` lets go of all.
import type * as THREE from 'three'
import type { Plugins, Wire } from '#engine/browser.ts'
import type { Row, W } from '#engine/engine.ts'
import { ahead, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { anchor, reach } from '#plugins/ik3d/ik3d.solve.ts'
import { carriedProps, carrying, reachesOf, type Numbers } from './motion3d.sim.ts'
import { at, carries, clipOf, movesOf, playKind, readsOf, rigOf, type Body as Kind, type Moves, type Part, type Prop, type Reads, type Rig, partsOf } from './motion3d.play.ts'

type Three = typeof import('three')
const DEG = Math.PI / 180
type ObjectMod = (plugins: Plugins, space: number) => THREE.Object3D | undefined
// A limb motion3d pins: its bones, its pole and the object it reaches.
export type Limb = { bones: [string, string, string]; pole: number[]; target: THREE.Object3D }

// A listed clip as this model draws it.
type Drawn = {
  slots: Record<'to' | 'from', THREE.AnimationClip>
  // By the bone the upper half plays it from: its tracks of that bone and every bone under it.
  masked: Map<string, Record<'upper' | 'was', THREE.AnimationClip>>
  dur: number
  pos: THREE.Interpolant | undefined
  quat: THREE.Interpolant | undefined
  start: THREE.Vector3
  end: THREE.Vector3
}
type Kit = { text: string; clips: Map<string, Drawn>; hips: string | undefined }
type Drawing = {
  root: THREE.Object3D
  kit: Kit
  key: string
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  rest: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][]
  hips: THREE.Object3D | undefined
  bind: [THREE.Vector3, THREE.Quaternion] | undefined
  sockets: Map<string, THREE.Object3D | undefined>
  bones: Map<string, THREE.Object3D>
  props: { root: THREE.Object3D; bone: THREE.Object3D; offset: THREE.Matrix4 }[] | undefined
  hung: string | undefined
  row: Row
  limp: boolean
  turned: { bone: THREE.Object3D; before: THREE.Quaternion; after: THREE.Quaternion }[] // each bone the last bend turned
  short: number[] // how far each limb's end bone ended from its target on the last bend, metres
  reached: Map<string, THREE.Object3D> // a carried limb's target eased in, by its end bone
  carried: number // the prop its carry sets this frame, by its place in its kind's props, or −1
  aimed: Aimed | undefined // the last aim, before its turn; none when not aimed
}
// The last aim of a body: before its turn, the prop's forward and its anchor bone's turn; after it and
// before the bend, the anchor bone's frame (its scale taken off) and each of its carry's limbs' end
// bones', in the carry's order, each a matrix's 16 numbers; all in the world.
type Aimed = { forward: number[]; bone: number[]; anchor?: number[]; hands?: number[][] }
// A limb bent this frame: its three bones, its pole and the object its end bone reaches.
type Bent = { bones: [string, string, string]; pole: number[]; end: THREE.Object3D }

const swap = (name: string) => name.replace(/Left|Right/g, s => (s === 'Left' ? 'Right' : 'Left'))
// A bone's name with the `_N` three's loaders give a repeated name taken off.
const base = (s: string) => s.replace(/_\d+$/, '')

// The rows this page draws as a server function reads them, never written: the `w` the page asks the
// server half's `reachesOf`, and so the `spaces` mod, with.
const reading = (wire: Wire): W => {
  const refuse = (what: string) => () => { throw new Error(`motion3d's page reading the rows does not ${what}`) }
  return {
    world: wire.scene.world ?? {},
    all: kind => wire.rows.filter(r => r.kind === kind),
    get: (id: number): Row => {
      const r = wire.rows.find(r => r.id === id)
      if (!r) throw new Error(`no row ${id} in this packet`)
      return r
    },
    find: (kind, pred = () => true) => {
      const r = wire.rows.find(r => r.kind === kind && pred(r))
      if (!r) throw new Error(`no ${kind} matches in this packet`)
      return r
    },
    spawn: refuse('spawn'),
    end: refuse('end a row'),
    die: refuse('roll'),
    call: refuse('call an act'),
  } as W
}

// A row's frame: its place and its turn about the vertical by its yaw, tilted by its `tilt` when it has
// one.
function frameOf(T: Three, d: { pos?: number[]; yaw?: number; tilt?: number[] | null }): THREE.Matrix4 {
  const p = d.pos ?? [0, 0, 0]
  const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), d.yaw ?? 0)
  if (d.tilt) q.premultiply(new T.Quaternion(d.tilt[0], d.tilt[1], d.tilt[2], d.tilt[3]))
  return new T.Matrix4().compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(1, 1, 1))
}

// An object put at the world matrix `m`, in its parent's frame when it has one.
function setWorld(T: Three, o: THREE.Object3D, m: THREE.Matrix4) {
  const local = o.parent ? new T.Matrix4().copy(o.parent.matrixWorld).invert().multiply(m) : m
  local.decompose(o.position, o.quaternion, o.scale)
  o.updateMatrixWorld(true)
}

// The body's root put at `at` (a world matrix whose scale is 1), only its position and its turn written
// in its parent's frame, its scale kept; each prop moved by as much as the root was.
function seat(T: Three, root: THREE.Object3D, props: THREE.Object3D[], at: THREE.Matrix4) {
  const p = new T.Vector3(), q = new T.Quaternion()
  at.decompose(p, q, new T.Vector3())
  root.updateWorldMatrix(true, false)
  const was = root.matrixWorld.clone()
  const parent = root.parent
  if (parent) {
    root.position.copy(parent.worldToLocal(p))
    root.quaternion.copy(parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q))
  } else {
    root.position.copy(p)
    root.quaternion.copy(q)
  }
  root.updateMatrixWorld(true)
  const moved = new T.Matrix4().copy(root.matrixWorld).multiply(was.invert())
  for (const prop of props) {
    prop.updateWorldMatrix(true, false)
    setWorld(T, prop, new T.Matrix4().copy(moved).multiply(prop.matrixWorld))
  }
}

export function motion3d() {
  const drawings = new Map<number, Drawing>()
  const kits = new Map<string, Kit>()
  const dressed = new WeakSet<THREE.Material>()
  const asked = new Set<string>()
  const texts = new WeakMap<object, string>()
  // Each row's limb targets, by the bone each limb ends in.
  const targets = new Map<number, Map<string, THREE.Object3D>>()
  // Each body root this tilted, and the turn it left it at.
  const tilted = new WeakMap<THREE.Object3D, THREE.Quaternion>()
  let three: Three | undefined
  let scene: THREE.Scene | undefined

  const numbersOf = (plugins: Plugins): Numbers => {
    const n = plugins.wire.scene.world?.motion3d as Numbers | undefined
    if (!n) throw new Error('motion3d: the scene gives no world.motion3d')
    return n
  }

  // The model's clips as the rig lists them, moved to start at 0, checked against the table, and
  // mirrored where the rig says.
  function kitOf(root: THREE.Object3D, animations: THREE.AnimationClip[], rig: Rig, model: string, text: string): Kit {
    const T = three!
    const found = new Map(animations.map(c => [c.name, c]))
    const parse = (track: THREE.KeyframeTrack) => T.PropertyBinding.parseTrackName(track.name)
    const raw = new Map<string, THREE.KeyframeTrack[]>()
    for (const name of Object.keys(rig.clips)) {
      const c = clipOf(rig, name)
      if (c.mirrored) continue
      const src = found.get(name)
      if (!src) throw new Error(`motion3d: the model ${model} has no animation ${name}`)
      const tracks = src.tracks.map(t => t.clone())
      const first = Math.min(...tracks.map(t => t.times[0]))
      let frame = Infinity
      for (const t of tracks) {
        t.shift(-first)
        for (let i = 1; i < t.times.length; i++) frame = Math.min(frame, t.times[i] - t.times[i - 1])
      }
      const length = Math.max(...tracks.map(t => t.times[t.times.length - 1]))
      if (Math.abs(length - c.dur) > frame) throw new Error(`motion3d: ${name} lasts ${length} s in the model ${model}, more than a frame from its table's ${c.dur} s`)
      raw.set(name, tracks)
    }
    for (const name of Object.keys(rig.clips)) {
      const c = clipOf(rig, name)
      if (!c.mirrored) continue
      raw.set(name, raw.get(c.source)!.map(t => {
        const m = t.clone()
        const { nodeName, propertyName } = parse(t)
        m.name = `${swap(nodeName)}.${propertyName}`
        const v = m.values
        if (propertyName === 'position') for (let i = 0; i < v.length; i += 3) v[i] = -v[i]
        if (propertyName === 'quaternion') for (let i = 0; i < v.length; i += 4) { v[i + 1] = -v[i + 1]; v[i + 2] = -v[i + 2] }
        return m
      }))
    }
    // The hips: the bone the clips key with no bone above it.
    const keyed = new Map<string, THREE.KeyframeTrack>()
    for (const tracks of raw.values()) for (const t of tracks) if (!keyed.has(t.name)) keyed.set(t.name, t)
    let hips: string | undefined
    for (const t of keyed.values()) {
      const node = T.PropertyBinding.findNode(root, parse(t).nodeName) as THREE.Object3D | null
      if (node && (node as THREE.Bone).isBone && !(node.parent as THREE.Bone | null)?.isBone) { hips = node.name; break }
    }
    const clips = new Map<string, Drawn>()
    for (const [name, tracks] of raw) {
      const base = new T.AnimationClip(name, -1, tracks)
      const track = (prop: string) => tracks.find(t => t.name === `${hips}.${prop}`) as (THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }) | undefined
      const pos = track('position')?.createInterpolant()
      const quat = track('quaternion')?.createInterpolant()
      const sample = (t: number) => (pos ? new T.Vector3().fromArray(pos.evaluate(t)) : new T.Vector3())
      clips.set(name, {
        slots: { to: base, from: new T.AnimationClip(`${name} from`, base.duration, tracks) },
        masked: new Map(),
        dur: base.duration,
        pos,
        quat,
        start: sample(0),
        end: sample(base.duration),
      })
    }
    return { text, clips, hips }
  }

  // Every object under the model back where it was when the model was made, and a new mixer.
  function rebuild(b: Drawing) {
    b.mixer.stopAllAction()
    b.mixer.uncacheRoot(b.root)
    for (const [o, p, q, s] of b.rest) {
      o.position.copy(p)
      o.quaternion.copy(q)
      o.scale.copy(s)
    }
    b.mixer = new three!.AnimationMixer(b.root)
    b.actions.clear()
    b.turned = []
    b.short = []
  }

  // Whether the loader's model has landed, asking for it once.
  function ready(plugins: Plugins, model: string) {
    const loader = plugins.loader
    if (loader.ready(model)) return true
    if (!asked.has(model)) {
      asked.add(model)
      // The loader writes a failure to the console once itself.
      loader.load(model).catch(() => {})
    }
    return false
  }

  // Every material handed to render3d once, and every mesh casting and taking shadows.
  function dress(root: THREE.Object3D, plugins: Plugins) {
    root.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (dressed.has(m)) continue
        dressed.add(m)
        plugins.render3d.dress(m)
      }
    })
  }

  // The first bone under the model whose name ends with `suffix`.
  function boneOf(b: Drawing, suffix: string, model: string) {
    let found = b.bones.get(suffix)
    if (!found) {
      b.root.traverse(o => { if (!found && (o as THREE.Bone).isBone && o.name.endsWith(suffix)) found = o })
      if (!found) throw new Error(`motion3d: the model ${model} has no bone ending ${suffix}`)
      b.bones.set(suffix, found)
    }
    return found
  }

  const keyOf = (k: Kind) => `${k.model}\n${k.rig}\n${k.measured ?? ''}`

  function make(r: Row, plugins: Plugins, k: Kind, rig: Rig, text: string, reads: Reads): Drawing | undefined {
    const T = three!
    if (!ready(plugins, k.model)) return undefined
    const { scene: root, animations } = plugins.loader.model(k.model) as { scene: THREE.Object3D; animations: THREE.AnimationClip[] }
    const key = keyOf(k)
    let kit = kits.get(key)
    if (!kit) {
      kit = kitOf(root, animations, rig, k.model, text)
      kits.set(key, kit)
    }
    const rest: Drawing['rest'] = []
    root.traverse(o => { rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]) })
    dress(root, plugins)
    const hips = kit.hips === undefined ? undefined : T.PropertyBinding.findNode(root, kit.hips) as THREE.Object3D
    const b: Drawing = {
      root, kit, key, mixer: new T.AnimationMixer(root), actions: new Map(), rest, hips, bind: hips && [hips.position.clone(), hips.quaternion.clone()],
      sockets: new Map(), bones: new Map(), props: undefined, hung: undefined, row: r, limp: false, aimed: undefined,
      turned: [], short: [], reached: new Map(), carried: -1,
    }
    place(b, r.data, reads)
    b.root.updateMatrixWorld(true)
    scene!.add(root)
    return b
  }

  const unhang = (b: Drawing) => {
    for (const p of b.props ?? []) p.root.removeFromParent()
    b.props = undefined
  }

  const drop = (id: number) => {
    const b = drawings.get(id)
    if (!b) return
    b.mixer.stopAllAction()
    b.mixer.uncacheRoot(b.root)
    b.root.removeFromParent()
    unhang(b)
    drawings.delete(id)
    targets.delete(id)
  }

  // The kind's props, each its own clone of its model, made once every one has landed, and made again
  // when the kind's `props` change.
  function props(b: Drawing, plugins: Plugins, k: Kind) {
    const text = JSON.stringify(k.props ?? [])
    if (b.hung !== text) {
      unhang(b)
      b.hung = text
    }
    const list: Prop[] = k.props ?? []
    if (b.props || !list.length || !list.every(p => ready(plugins, p.model))) return
    const T = three!
    b.props = list.map(p => {
      const root = (plugins.loader.model(p.model) as { scene: THREE.Object3D }).scene
      dress(root, plugins)
      scene!.add(root)
      const turn = new T.Quaternion().setFromEuler(new T.Euler(p.turn[0] * DEG, p.turn[1] * DEG, p.turn[2] * DEG, 'XYZ'))
      return { root, bone: boneOf(b, p.bone, k.model), offset: new T.Matrix4().compose(new T.Vector3().fromArray(p.at), turn, new T.Vector3(1, 1, 1)) }
    })
  }

  // Each prop at its bone with the bone's scale taken off, then its offset; but the one its carry sets.
  function hang(b: Drawing, but = -1) {
    const T = three!
    const at3 = new T.Vector3(), turn = new T.Quaternion(), scale = new T.Vector3()
    for (const [i, p] of (b.props ?? []).entries()) {
      if (i === but) continue
      p.bone.updateWorldMatrix(true, false)
      p.bone.matrixWorld.decompose(at3, turn, scale)
      p.root.matrix.compose(at3, turn, scale.set(1, 1, 1)).multiply(p.offset)
      p.root.matrix.decompose(p.root.position, p.root.quaternion, p.root.scale)
      p.root.updateMatrixWorld(true)
    }
  }

  // A clip's tracks of the bone whose name ends with `bone` and every bone under it, as the upper half's
  // two clips of their own, bound to the model root as anim binds its upper layer; made once per kit.
  function maskedOf(b: Drawing, drawn: Drawn, clip: string, bone: string) {
    let m = drawn.masked.get(bone)
    if (m) return m
    const T = three!
    let top: THREE.Object3D | undefined
    b.root.traverse(o => { if (!top && (o as THREE.Bone).isBone && o.name.endsWith(bone)) top = o })
    if (!top) throw new Error(`motion3d: the model has no bone ending ${bone}`)
    const names = new Set<string>()
    top.traverse(o => { names.add(o.name) })
    const tracks = drawn.slots.to.tracks.filter(t => names.has(T.PropertyBinding.parseTrackName(t.name).nodeName))
    m = { upper: new T.AnimationClip(`${clip} upper ${bone}`, drawn.dur, tracks), was: new T.AnimationClip(`${clip} was ${bone}`, drawn.dur, tracks) }
    drawn.masked.set(bone, m)
    return m
  }

  const action = (b: Drawing, p: Part) => {
    const key = `${p.slot} ${p.bone ?? ''} ${p.clip}`
    let a = b.actions.get(key)
    if (!a) {
      const drawn = b.kit.clips.get(p.clip)
      if (!drawn) throw new Error(`motion3d: the model has no clip ${p.clip}`)
      a = b.mixer.clipAction(p.slot === 'to' || p.slot === 'from' ? drawn.slots[p.slot] : maskedOf(b, drawn, p.clip, p.bone!)[p.slot])
      a.play()
      b.actions.set(key, a)
    }
    return a
  }

  // The body in the parts given, every other action at weight 0, with its hips pinned by the body's two
  // parts.
  function weigh(b: Drawing, rig: Rig, parts: Part[], moves: Moves) {
    for (const a of b.actions.values()) a.setEffectiveWeight(0)
    for (const p of parts) {
      const a = action(b, p)
      a.time = p.t
      a.setEffectiveWeight(p.w)
    }
    putBack(b)
    b.mixer.update(0)
    pin(b, rig, parts.filter(p => p.slot === 'to' || p.slot === 'from'), moves)
  }

  function pin(b: Drawing, rig: Rig, parts: Part[], moves: Moves) {
    const T = three!
    const hips = b.hips
    if (!hips || !parts.length) return
    const up = new T.Vector3(0, 1, 0).applyQuaternion(hips.parent!.getWorldQuaternion(new T.Quaternion()).invert()).normalize()
    const vert = (v: THREE.Vector3) => up.clone().multiplyScalar(v.dot(up))
    const flat = (v: THREE.Vector3) => v.clone().sub(vert(v))
    const [restPos, restQuat] = b.bind!
    const pos = new T.Vector3()
    let quat: THREE.Quaternion | undefined
    let total = 0
    for (const p of parts) {
      const c = clipOf(rig, p.clip)
      const drawn = b.kit.clips.get(p.clip)!
      const h = drawn.pos ? new T.Vector3().fromArray(drawn.pos.evaluate(p.t)) : restPos.clone()
      let q = drawn.quat ? new T.Quaternion().fromArray(drawn.quat.evaluate(p.t)) : restQuat.clone()
      const how = carries(c, moves)
      let x = h
      if (c.loop) {
        const steady = drawn.start.clone().lerp(drawn.end, p.t / drawn.dur)
        x = flat(restPos).add(flat(h.clone().sub(steady))).add(vert(h))
      } else if (how.carries) x = flat(restPos).add(vert(h))
      if (how.turns) q = new T.Quaternion().setFromAxisAngle(up, -at(c.measure, p.t)[2] * DEG).multiply(q)
      pos.addScaledVector(x, p.w)
      total += p.w
      if (!quat) quat = q
      else quat.slerp(q, p.w / total)
    }
    hips.position.copy(pos.divideScalar(total))
    hips.quaternion.copy(quat!)
  }

  const place = (b: Drawing, d: any, reads: Reads) => {
    const p = d[reads.pos] ?? [0, 0, 0]
    b.root.position.set(p[0], p[1], p[2])
    b.root.quaternion.setFromAxisAngle(new three!.Vector3(0, 1, 0), d[reads.yaw] ?? 0)
  }

  // Every body drawn from its row's fields this frame, its props hung.
  function draw(plugins: Plugins) {
    const n = numbersOf(plugins)
    const seen = new Set<number>()
    for (const r of plugins.wire.rows) {
      const kind = playKind(r)
      const k = n.kinds[kind]
      if (!k?.model) continue
      seen.add(r.id)
      const rig = rigOf(plugins.wire, kind)
      let text = texts.get(rig.clips)
      if (text === undefined) texts.set(rig.clips, (text = JSON.stringify([rig.clips, rig.table])))
      const key = keyOf(k)
      if (kits.get(key) && kits.get(key)!.text !== text) kits.delete(key)
      const reads = readsOf(plugins.wire, kind)
      let b = drawings.get(r.id)
      if (b && (b.key !== key || kits.get(key) !== b.kit)) {
        drop(r.id)
        b = undefined
      }
      if (!b) {
        b = make(r, plugins, k, rig, text, reads)
        if (!b) continue
        drawings.set(r.id, b)
      }
      b.row = r
      props(b, plugins, k)
      if (r.data[reads.limp]) {
        b.limp = true
        hang(b)
        continue
      }
      if (b.limp) {
        rebuild(b)
        b.limp = false
      }
      place(b, r.data, reads)
      weigh(b, rig, partsOf(r.data), movesOf(plugins.wire, kind))
      b.root.updateMatrixWorld(true)
      hang(b)
    }
    for (const id of [...drawings.keys()]) if (!seen.has(id)) drop(id)
  }

  // Each held body on the space the `object` mod draws, and each tilted body tilted.
  function frame(plugins: Plugins) {
    const scene = plugins.wire.scene
    const object = mod<ObjectMod>(scene.world!, 'motion3d', 'object')
    if (object) ahead(scene, 'motion3d', 'object')
    for (const r of plugins.wire.rows) {
      const d = r.data
      const b = drawings.get(r.id)
      if (!b || b.limp) continue
      const held = d.space !== null && d.space !== undefined && d.root !== null && d.root !== undefined
      const space = held ? plugins.wire.rows.find(s => s.id === d.space) : undefined
      const drawn = space && object?.(plugins, d.space)
      if (!drawn && !d.tilt) continue
      const T = three!
      const propRoots = (b.props ?? []).map(p => p.root)
      const p = new T.Vector3(), q = new T.Quaternion()
      if (drawn) {
        drawn.updateWorldMatrix(true, false)
        const rel = frameOf(T, space!.data).invert().multiply(frameOf(T, d))
        drawn.matrixWorld.decompose(p, q, new T.Vector3())
        seat(T, b.root, propRoots, new T.Matrix4().compose(p, q, new T.Vector3(1, 1, 1)).multiply(rel))
        continue
      }
      // Tilted about its root as drawn this frame; once a frame, so a root this already tilted, untouched
      // since, is left.
      b.root.updateWorldMatrix(true, false)
      b.root.matrixWorld.decompose(p, q, new T.Vector3())
      const was = tilted.get(b.root)
      if (was && was.angleTo(q) < 1e-6) continue
      q.premultiply(new T.Quaternion(d.tilt[0], d.tilt[1], d.tilt[2], d.tilt[3]))
      seat(T, b.root, propRoots, new T.Matrix4().compose(p, q, new T.Vector3(1, 1, 1)))
      b.root.updateWorldMatrix(true, false)
      tilted.set(b.root, b.root.getWorldQuaternion(new T.Quaternion()))
    }
  }

  // The limbs a body's motion pins onto its target this frame: each its bones, its pole and an object at
  // its reach, in the frame of the body's root as drawn.
  function pinned(plugins: Plugins, row: Row): Limb[] | undefined {
    const b = drawings.get(row.id)
    const reaches = b && !b.limp ? reachesOf(reading(plugins.wire), row) : []
    if (!b || b.limp || !reaches.length) {
      targets.delete(row.id)
      return undefined
    }
    const T = three!
    let mine = targets.get(row.id)
    if (!mine) targets.set(row.id, (mine = new Map()))
    for (const bone of [...mine.keys()]) if (!reaches.some(r => r.bone === bone)) mine.delete(bone)
    b.root.updateWorldMatrix(true, false)
    const p = new T.Vector3(), q = new T.Quaternion()
    b.root.matrixWorld.decompose(p, q, new T.Vector3())
    const root = new T.Matrix4().compose(p, q, new T.Vector3(1, 1, 1))
    return reaches.map(r => {
      let o = mine!.get(r.bone)
      if (!o) mine!.set(r.bone, (o = new T.Object3D()))
      const at4 = new T.Matrix4().compose(new T.Vector3().fromArray(r.at), new T.Quaternion().fromArray(r.turn), new T.Vector3(1, 1, 1))
      o.matrix.copy(root).multiply(at4)
      o.matrix.decompose(o.position, o.quaternion, o.scale)
      o.updateMatrixWorld(true)
      return { bones: r.bones, pole: r.pole, target: o }
    })
  }

  // The bone a bend turns for a suffix (the first whose name, `_N` aside, ends with it and has no `_N`,
  // else the first), and every other skeleton copy's bone of that name (ik3d's).
  function bonesOf(b: Drawing, suffix: string, model: string) {
    const all: THREE.Object3D[] = []
    b.root.traverse(o => { if ((o as THREE.Bone).isBone && base(o.name).endsWith(suffix)) all.push(o) })
    if (!all.length) throw new Error(`motion3d: the model ${model} has no bone ending ${suffix}`)
    const main = all.find(o => o.name === base(o.name)) ?? all[0]
    return { main, copies: all.filter(o => o !== main && base(o.name) === base(main.name)) }
  }

  function empty(prop: THREE.Object3D, suffix: string, where: string) {
    let found: THREE.Object3D | undefined
    prop.traverse(o => { if (!found && o !== prop && o.name.endsWith(suffix)) found = o })
    if (!found) throw new Error(`${where}: the prop has no empty ending ${suffix}`)
    return found
  }

  // Every bone the last bend turned that still stands as it left it, put back as it stood before.
  function putBack(b: Drawing) {
    for (const t of b.turned) if (t.bone.quaternion.equals(t.after)) t.bone.quaternion.copy(t.before)
    b.turned = []
  }

  // The body's carry (`motion3d.sim.ts`, Carries): its prop set by its anchor, eased in from where it
  // hangs by the carry's share, and its limbs reaching the prop's empties, each eased in from where the
  // end bone is drawn by the same share; none while the prop is still loading.
  function carried(b: Drawing, k: Kind, w: W): Bent[] {
    const held = carrying(w, b.row)
    if (!held) {
      b.reached.clear()
      return []
    }
    const { carry, weight } = held
    const where = `motion3d's carry of ${carry.prop}`
    const i = (k.props ?? []).findIndex(p => p.model === carry.prop)
    if (i < 0) throw new Error(`${where}: the body's kind hangs no ${carry.prop} among its props`)
    const prop = b.props?.[i]?.root
    if (!prop) return []
    b.carried = i
    const T = three!
    prop.updateWorldMatrix(true, false)
    const hung = prop.matrixWorld.clone()
    anchor(T, prop, bonesOf(b, carry.anchor.bone, k.model).main, carry.anchor.at, carry.anchor.turn, carry.anchor.point)
    if (weight < 1) {
      const p0 = new T.Vector3(), q0 = new T.Quaternion(), s0 = new T.Vector3(), p1 = new T.Vector3(), q1 = new T.Quaternion(), s1 = new T.Vector3()
      hung.decompose(p0, q0, s0)
      prop.matrixWorld.decompose(p1, q1, s1)
      setWorld(T, prop, new T.Matrix4().compose(p0.lerp(p1, weight), q0.slerp(q1, weight), s0.lerp(s1, weight)))
    }
    return carry.limbs.map(l => {
      const target = empty(prop, l.target, where)
      target.updateWorldMatrix(true, false)
      if (weight >= 1) return { bones: l.bones, pole: l.pole, end: target }
      const end = bonesOf(b, l.bones[2], k.model).main
      end.updateWorldMatrix(true, false)
      let o = b.reached.get(l.bones[2])
      if (!o) b.reached.set(l.bones[2], (o = new T.Object3D()))
      const p0 = new T.Vector3(), q0 = new T.Quaternion(), p1 = new T.Vector3(), q1 = new T.Quaternion()
      end.matrixWorld.decompose(p0, q0, new T.Vector3())
      target.matrixWorld.decompose(p1, q1, new T.Vector3())
      o.position.copy(p0.lerp(p1, weight))
      o.quaternion.copy(q0.slerp(q1, weight))
      o.updateMatrixWorld(true)
      return { bones: l.bones, pole: l.pole, end: o }
    })
  }

  // The aim (The aim, the header): the upper half turned, from its move's `over` bone up to the carry's
  // anchor bone, so the prop's forward out of its anchor point lies along the row's `aim`.
  function aim(b: Drawing, k: Kind, w: W) {
    const d = b.row.data
    b.aimed = undefined
    const held = carrying(w, b.row)
    if (!held || !Array.isArray(d.aim) || typeof d.upper !== 'string' || typeof d.upperBone !== 'string') return
    if (!clipOf(rigOf(w, playKind(b.row)), d.upper).loop) return
    const { carry, weight } = held
    const i = (k.props ?? []).findIndex(p => p.model === carry.prop)
    const prop = i < 0 ? undefined : b.props?.[i]?.root
    if (!prop) return
    const T = three!
    const anchored = bonesOf(b, carry.anchor.bone, k.model).main
    // The chain the turn is shared among: the anchor bone's parent down to the `over` bone.
    const chain: THREE.Object3D[] = []
    for (let o = anchored.parent; o; o = o.parent) {
      chain.unshift(o)
      if (base(o.name).endsWith(d.upperBone)) break
      if (o === b.root) throw new Error(`motion3d aims ${carry.prop}: its anchor ${carry.anchor.bone} is not under the bone ${d.upperBone}`)
    }
    b.root.updateMatrixWorld(true)
    anchor(T, prop, anchored, carry.anchor.at, carry.anchor.turn, carry.anchor.point)
    const point = empty(prop, carry.anchor.point, `motion3d's aim of ${carry.prop}`)
    const forward = new T.Vector3(0, 0, -1).applyQuaternion(point.getWorldQuaternion(new T.Quaternion()))
    b.aimed = { forward: forward.toArray(), bone: anchored.getWorldQuaternion(new T.Quaternion()).toArray() as number[] }
    const want = new T.Vector3(d.aim[0], d.aim[1], d.aim[2]).normalize()
    // Turned across about the world's up, then up or down about the level line square to the aim.
    const yaw = Math.atan2(want.x, want.z) - Math.atan2(forward.x, forward.z)
    const across = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw)
    const turn = new T.Quaternion().setFromUnitVectors(forward.clone().applyQuaternion(across).normalize(), want).multiply(across)
    const part = new T.Quaternion().slerp(turn, weight / chain.length)
    const parent = new T.Quaternion()
    for (const bone of chain) {
      const before = bone.quaternion.clone()
      const p = bone.parent!.getWorldQuaternion(parent)
      bone.quaternion.premultiply(p.clone().invert().multiply(part).multiply(p))
      bone.updateMatrixWorld(true)
      const copies = bonesOf(b, base(bone.name), k.model).copies
      for (const o of [bone, ...copies]) {
        const was = o === bone ? before : o.quaternion.clone()
        if (o !== bone) o.quaternion.copy(bone.quaternion)
        b.turned.push({ bone: o, before: was, after: o.quaternion.clone() })
      }
      for (const o of copies) o.updateMatrixWorld(true)
    }
    // The anchor bone and each of the carry's limbs' end bones as the clip and the aim leave them, before
    // the bend.
    const spot = new T.Vector3(), q = new T.Quaternion()
    anchored.matrixWorld.decompose(spot, q, new T.Vector3())
    b.aimed!.anchor = new T.Matrix4().compose(spot, q, new T.Vector3(1, 1, 1)).toArray()
    b.aimed!.hands = carry.limbs.map(l => bonesOf(b, l.bones[2], k.model).main.matrixWorld.toArray())
  }

  // Every body's limbs bent (ik3d's solve, `ik3d.solve.ts`): its bones first put back as its clips left
  // them, its upper half aimed, its carry's prop set and its limbs, then each limb its motion pins onto
  // its target.
  function bend(plugins: Plugins) {
    const T = three!
    const n = numbersOf(plugins)
    const w = reading(plugins.wire)
    for (const b of drawings.values()) {
      putBack(b)
      b.short = []
      b.carried = -1
      if (b.limp) continue
      const k = n.kinds[playKind(b.row)]
      b.root.updateMatrixWorld(true)
      aim(b, k, w)
      const limbs = [...(pinned(plugins, b.row) ?? []).map(l => ({ bones: l.bones, pole: l.pole, end: l.target })), ...carried(b, k, w)]
      const copied: THREE.Object3D[] = []
      for (const l of limbs) {
        const chain = l.bones.map(suffix => bonesOf(b, suffix, k.model))
        const before = chain.flatMap(c => [c.main, ...c.copies]).map(o => ({ bone: o, before: o.quaternion.clone() }))
        b.short.push(reach(T, chain.map(c => c.main) as [THREE.Object3D, THREE.Object3D, THREE.Object3D], l.end, l.pole, b.root))
        for (const c of chain) for (const o of c.copies) o.quaternion.copy(c.main.quaternion)
        for (const { bone, before: q } of before) b.turned.push({ bone, before: q, after: bone.quaternion.clone() })
        copied.push(...chain.flatMap(c => c.copies))
      }
      for (const o of copied) o.updateMatrixWorld(true)
      // Every other prop hung again on its bone as bent; a prop some carry holds drawn only while carried.
      hang(b, b.carried)
      const held = carriedProps(w, b.row)
      for (const [i, p] of (b.props ?? []).entries()) if (held.includes(k.props![i].model)) p.root.visible = i === b.carried
    }
  }

  return {
    tick(plugins: Plugins) {
      if (!plugins.render3d) throw new Error('motion3d draws through render3d, which this scene does not list')
      const order: string[] = plugins.wire.scene.plugins ?? []
      if (order.includes('render3d') && order.indexOf('render3d') < order.indexOf('motion3d')) throw new Error("motion3d must come before render3d in the scene's plugins, so its bodies are drawn before the frame is")
      three = plugins.render3d.THREE
      scene = plugins.render3d.scene
      draw(plugins)
      frame(plugins)
      bend(plugins)
    },
    afterTick(plugins: Plugins) {
      frame(plugins)
      for (const b of drawings.values()) hang(b)
      bend(plugins)
    },
    short(id: number): number[] | undefined { return drawings.get(id)?.short.slice() },
    aimed(id: number): Aimed | undefined { return drawings.get(id)?.aimed },
    model(id: number): THREE.Object3D | undefined { return drawings.get(id)?.root },
    props(id: number): THREE.Object3D[] { return drawings.get(id)?.props?.map(p => p.root) ?? [] },
    socket(id: number, suffix: string): THREE.Object3D | undefined {
      const b = drawings.get(id)
      if (!b) return undefined
      if (!b.sockets.has(suffix)) {
        let found: THREE.Object3D | undefined
        b.root.traverse(o => { if (!found && o.name.endsWith(suffix)) found = o })
        b.sockets.set(suffix, found)
      }
      return b.sockets.get(suffix)
    },
    limbs(plugins: Plugins, row: Row): Limb[] | undefined { return pinned(plugins, row) },
    close() {
      for (const id of [...drawings.keys()]) drop(id)
      kits.clear()
      asked.clear()
      targets.clear()
    },
  }
}
