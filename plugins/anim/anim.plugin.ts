// A row is drawn by the entry of the kind its `as` names when it names one, else its own kind's
// (`animKind`): a seat's `player` row that is an `xbot` names `as: "xbot"`.
//
// The browser half of anim: one model per row of a kind `world.anim.kinds` lists, drawn from the
// row's fields as they stand. The server half (`anim.sim.ts`) says what the fields and the rig file
// hold; this half draws them and moves nothing.
//
// The model. Each row gets its own `plugins.loader.model(kinds.<kind>.model)` clone, placed at the
// row's position and turned to its facing, the fields its kind's `reads` names `pos` and `yaw`, and
// added to render3d's scene. The model is asked of the
// loader once, and the row is drawn once it has landed. Every material is handed to
// `render3d.dress` once, and every mesh casts and takes shadows. The model is taken off the scene
// when its row ends, and `close` takes every one off.
//
// The clips. Every clip the rig lists is read out of the model's animations once per model and rig
// (animations the rig does not list are ignored, and a listed clip the model lacks throws naming
// it). An exported clip's first key sits a frame in, so each clip's tracks are moved to start at 0:
// `clipT` is the clip's own time and the table's `dur` its length, and a clip whose length is more
// than a frame (its own closest two keys) from its table `dur` throws, naming it. A mirrored clip is
// built from its source here: the tracks of Left and Right bones swapped, x positions negated and
// the quaternions' y and z negated, which is the source's pose reflected across the body's x. They
// are built again when the rig's `clips`, `mask` or `meshes` change, compared by content, since the
// editor writes a file in place.
//
// The mixer is scrubbed, never run. Every action is always playing; each frame writes each action's
// `time` and weight from the row, then calls `mixer.update(0)`, which evaluates every action at
// exactly its time. A stopped action would sit in bind pose while every number said otherwise.
//   The base: `clip` plays at `clipT` with weight `blend`, and `from`, frozen at `fromT`, with
//     1 − `blend`, so the crossfade runs over `fade` on the row's own fields.
//   The upper layer: each clip's tracks of the bones under `mask` (the bone whose name ends with it,
//     and every bone below it), as a clip of their own, bound to the model root, because binding it to
//     the bone makes a second PropertyMixer that blends against a frozen snapshot. The mixer keeps a
//     running weighted average, so a layer of share s over a base of weight 1 is given weight
//     s/(1 − s). Two slots, `upper` at `upperW` and `was` at `wasW`, crossfade one gesture into the
//     next: shares a and b get weights a·k and b·k, k = s/(a + b)/(1 − s), s = min(0.999, a + b), so
//     together they hold s of every masked bone. A rig with no `mask` draws no upper layer.
//   Each slot has an action of its own per clip, made the first time the slot draws it, so a clip
//     fading into itself is drawn at both its times. A bone is bound when the first clip that keys
//     it is drawn, and nothing but the mixer writes a bone of a row that is not limp (the aim puts
//     back what the mixer left before the mixer runs again), so every binding starts from the rest
//     the model was made with.
//
// Pinning. The row carries the body's travel, so the hips must not carry it again, or the distance
// and the turn are drawn twice. The hips are the bone the clips key that has no bone above it.
//   `upright` pins their horizontal position: a one-shot that carries travel at bind, since its row
//     carries its whole measured path; a loop at bind plus its sway about its steady progress, since
//     its row carries that progress and not the hips' path, so the hips keep their sway and surge.
//     The steady progress runs straight from where the clip starts the hips to where it ends them.
//     The vertical is read from the hips' parent's world quaternion, because the armature is Z-up;
//     the height is the clip's own.
//   `unspin` pins their yaw for a one-shot whose travel turns: the curve's yaw at the playhead is
//     taken back off them, about that same vertical.
//   A one-shot that carries no travel is drawn as its clip draws it.
// The hips are written from each base slot's own sampled hips, pinned as its clip is, weighted as the
// mixer weights it: each pinned clip's share of the hips is replaced by where that clip draws them,
// so a crossfade eases. They are written every frame, since the mixer writes a bone only when its
// clip value moved.
//
// Mesh roles. `meshes` is role to a regular expression matched against each mesh's name, and
// `show` stance to the roles it draws. A mesh draws when the row's stance shows one of its roles; a
// mesh of no role is always drawn, and a rig with no `show`, or a stance it does not name, draws
// every mesh.
//
// The aim. A kind with `aim: { bones: { <bone suffix>: <share> } }` pitches its body's upper half by
// the row's aim: the field its `reads` names `aim`, radians, positive up. `reads.aim` may be a dotted
// path, so `"look.pitch"` reads the `pitch` of the row's `look`. Once the mixer has posed the body
// and the hips are pinned, each listed bone (the first whose name ends with the suffix) is turned by
// share × pitch about the body's right: the horizontal square to its facing, in the world, taken into
// the bone's parent's frame. A turn about the right raises what faces forward, so a positive pitch
// lifts the chest, the head and the muzzle of what the hands hold, and shares that sum to 1 turn
// everything above the last listed bone by the whole pitch. A turn about that axis leaves the axis
// where it was, so each bone's axis is the same whether the bones above it in the chain have turned
// yet or not. The turn is never laid on the frame before's: the mixer writes a bone only when its
// sampled value moved, so a bone whose clip stands still would keep last frame's turn and take
// another. Each aimed bone's quaternion as the mixer left it is kept, put back before the next
// `mixer.update(0)`, and turned again after it. A kind with no `aim`, and a row whose aim is not a
// number, is drawn as the mixer leaves it. A kind with an `aim` and no `reads.aim` throws, and so does
// a suffix no bone ends with. A limp row is not aimed, and neither is `pose`.
//
// Props. `kinds.<kind>.props: [{ model, bone, at, turn }]` hangs loader models on the body. Each row
// gets its own `plugins.loader.model(model)` clone per prop, each asked of the loader once, made
// once every one has landed and added to render3d's scene, not under the bone; every material is
// dressed and every mesh casts and takes shadows, as the body's. Each is placed at the world frame of
// `bone` (the first bone whose name ends with it) with that frame's scale taken off, since a Mixamo
// armature is scaled to centimetres and a prop is modelled in metres, then moved by `at` (metres)
// and turned by `turn` (degrees, an XYZ Euler), both in the bone's scale-free frame. A row's props
// are made again when its kind's `props` change, and go with its model.
//   A prop is placed after everything that poses the bones in the frame and before render3d draws
// it. The client runs every plugin's `tick` in the scene's order, then every actor's, then every
// plugin's `afterTick`, and render3d draws in its `afterTick`. anim poses a standing body in its
// `tick`, and ragdoll3d, after anim in the scene's plugins, writes a limp one in its own. So anim
// places the props in its `afterTick`, after every tick, and must come before render3d in the
// scene's `plugins`, or render3d would draw them where they hung the frame before: the other order
// throws. It places them at the end of its `tick` too, so an actor's tick reads this frame's pose of
// a body that stands; a limp body's props there are where ragdoll3d left them the frame before, until
// the `afterTick`. A prop follows its bone while the row is limp.
//
// A row limp by the field its kind's `reads` names `limp` is not drawn: whatever made it limp owns its
// model, reached through `model(id)`. A row with no clip yet is drawn in its stance's `still` role.
// `pose(id, clip, t)` draws the row's model in `clip` alone at `t`, at the row's position and facing,
// pinned as that
// clip is, from a rebuilt mixer, and hands back the model; it throws for a row with no model yet.
// Every bone is first put back at the rest it had when the model was made, so a seat that drew the row walking and a seat that never drew it start the same body. A row
// that gets up has its bones put back at that rest and its mixer rebuilt too, so every bone is
// written from the clips again, not only those whose clip value moved since before it went limp, and
// a bone no clip keys does not keep the turn it was left in while limp.
//
// `model(id)` is the row's model root, or undefined before it is built. `socket(id, suffix)` is the
// first object under it, depth first, whose name ends with `suffix`. Both are posed for the frame
// once this plugin's `tick` has run, with their world matrices up to date. `props(id)` is the row's
// prop roots in the order its kind lists them, or [] before they are made, with their world matrices
// current once placed, so a game finds an empty inside one, a rifle's `muzzle`, by its name.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { animKind, at, carries, clipOf, momentOf, numbersOf, readsOf, rigOf, stanceOf, type Numbers, type Prop, type Reads, type Rig } from './anim.sim.ts'

type Three = typeof import('three')
type Kind = Numbers['kinds'][string]
type Slot = 'to' | 'from' | 'upper' | 'was'
const DEG = Math.PI / 180
const SHARE = 0.999 // the most of a masked bone the upper layer holds, short of the 1 its weight s/(1 − s) cannot reach

// A listed clip as this model draws it.
type Drawn = {
  slots: Record<Slot, THREE.AnimationClip>
  dur: number
  pos: THREE.Interpolant | undefined // the hips' position and quaternion tracks, sampled
  quat: THREE.Interpolant | undefined
  start: THREE.Vector3 // the hips where the clip starts and ends them
  end: THREE.Vector3
}
// Everything one model and rig draw with.
type Kit = { text: string; clips: Map<string, Drawn>; hips: string | undefined; roles: [string, RegExp][] }
type Body = {
  root: THREE.Object3D
  kit: Kit
  key: string
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  rest: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][]
  hips: THREE.Object3D | undefined
  bind: [THREE.Vector3, THREE.Quaternion] | undefined // the hips' rest
  meshes: { mesh: THREE.Object3D; roles: string[] }[]
  sockets: Map<string, THREE.Object3D | undefined>
  bones: Map<string, THREE.Object3D> // by the suffix `aim` and `props` name them by
  aimed: [THREE.Object3D, THREE.Quaternion][] // each bone the aim turned last frame, as the mixer left it
  props: { root: THREE.Object3D; bone: THREE.Object3D; offset: THREE.Matrix4 }[] | undefined
  hung: string | undefined // the kind's `props` the body's props were hung by, as text
  row: Row
  limp: boolean
}
type Part = { slot: Slot; clip: string; t: number; w: number }

const swap = (name: string) => name.replace(/Left|Right/g, s => (s === 'Left' ? 'Right' : 'Left'))

export function anim() {
  const bodies = new Map<number, Body>()
  const kits = new Map<string, Kit>()
  const dressed = new WeakSet<THREE.Material>()
  const asked = new Set<string>()
  let three: Three | undefined
  let scene: THREE.Scene | undefined
  let numbers: Numbers | undefined
  let rigs = new Map<string, { rig: Rig; text: string; reads: Reads; props: string }>() // each listed kind's rig, this frame, what its kit is built from, the fields it reads, and its props as text
  const texts = new WeakMap<object, string>() // what a kit is built from, per parse of a rig file: the loader refills a file's parse in place with new top-level values

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
      if (!src) throw new Error(`anim: the model ${model} has no animation ${name}`)
      const tracks = src.tracks.map(t => t.clone())
      const first = Math.min(...tracks.map(t => t.times[0]))
      let frame = Infinity
      for (const t of tracks) {
        t.shift(-first)
        for (let i = 1; i < t.times.length; i++) frame = Math.min(frame, t.times[i] - t.times[i - 1])
      }
      const length = Math.max(...tracks.map(t => t.times[t.times.length - 1]))
      if (Math.abs(length - c.dur) > frame) throw new Error(`anim: ${name} lasts ${length} s in the model ${model}, more than a frame from its table's ${c.dur} s`)
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
    // The bones under the mask.
    const masked = new Set<string>()
    if (rig.mask !== undefined) {
      let top: THREE.Object3D | undefined
      root.traverse(o => { if (!top && (o as THREE.Bone).isBone && o.name.endsWith(rig.mask!)) top = o })
      if (!top) throw new Error(`anim: the model ${model} has no bone ending ${rig.mask}`)
      top.traverse(o => { masked.add(o.name) })
    }
    const clips = new Map<string, Drawn>()
    for (const [name, tracks] of raw) {
      const base = new T.AnimationClip(name, -1, tracks)
      const upper = new T.AnimationClip(`${name} upper`, base.duration, tracks.filter(t => masked.has(parse(t).nodeName)))
      // Sampled as the mixer samples the track, by its own interpolation.
      const track = (prop: string) => tracks.find(t => t.name === `${hips}.${prop}`) as (THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }) | undefined
      const pos = track('position')?.createInterpolant()
      const quat = track('quaternion')?.createInterpolant()
      const sample = (t: number) => (pos ? new T.Vector3().fromArray(pos.evaluate(t)) : new T.Vector3())
      clips.set(name, {
        slots: {
          to: base,
          from: new T.AnimationClip(`${name} from`, base.duration, tracks),
          upper,
          was: new T.AnimationClip(`${name} was`, base.duration, upper.tracks),
        },
        dur: base.duration,
        pos,
        quat,
        start: sample(0),
        end: sample(base.duration),
      })
    }
    const roles = Object.entries(rig.meshes ?? {}).map(([role, pattern]) => [role, new RegExp(pattern)] as [string, RegExp])
    return { text, clips, hips, roles }
  }

  // Every object under the model back where it was when the model was made, and a new mixer.
  function rebuild(b: Body) {
    b.mixer.stopAllAction()
    b.mixer.uncacheRoot(b.root)
    for (const [o, p, q, s] of b.rest) {
      o.position.copy(p)
      o.quaternion.copy(q)
      o.scale.copy(s)
    }
    b.mixer = new three!.AnimationMixer(b.root)
    b.actions.clear()
    b.aimed = []
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
  function dress(root: THREE.Object3D, plugins: Plugins, each: (mesh: THREE.Mesh) => void = () => {}) {
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
      each(mesh)
    })
  }

  // The first bone under the model whose name ends with `suffix`.
  function boneOf(b: Body, suffix: string, model: string) {
    let found = b.bones.get(suffix)
    if (!found) {
      b.root.traverse(o => { if (!found && (o as THREE.Bone).isBone && o.name.endsWith(suffix)) found = o })
      if (!found) throw new Error(`anim: the model ${model} has no bone ending ${suffix}`)
      b.bones.set(suffix, found)
    }
    return found
  }

  function make(r: Row, plugins: Plugins, rig: Rig, text: string, reads: Reads): Body | undefined {
    const T = three!
    const k = numbers!.kinds[animKind(r)]
    if (!ready(plugins, k.model)) return undefined
    const { scene: root, animations } = plugins.loader.model(k.model) as { scene: THREE.Object3D; animations: THREE.AnimationClip[] }
    const key = `${k.model}\n${k.rig}`
    let kit = kits.get(key)
    if (!kit) {
      kit = kitOf(root, animations, rig, k.model, text)
      kits.set(key, kit)
    }
    const rest: Body['rest'] = []
    const meshes: Body['meshes'] = []
    root.traverse(o => { rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]) })
    dress(root, plugins, mesh => { meshes.push({ mesh, roles: kit.roles.filter(([, re]) => re.test(mesh.name)).map(([role]) => role) }) })
    const hips = kit.hips === undefined ? undefined : T.PropertyBinding.findNode(root, kit.hips) as THREE.Object3D
    const b: Body = {
      root, kit, key, mixer: new T.AnimationMixer(root), actions: new Map(), rest, hips, bind: hips && [hips.position.clone(), hips.quaternion.clone()], meshes, sockets: new Map(),
      bones: new Map(), aimed: [], props: undefined, hung: undefined, row: r, limp: false,
    }
    place(b, r.data, reads)
    b.root.updateMatrixWorld(true)
    scene!.add(root)
    return b
  }

  const drop = (id: number) => {
    const b = bodies.get(id)
    if (!b) return
    b.mixer.stopAllAction()
    b.mixer.uncacheRoot(b.root)
    b.root.removeFromParent()
    unhang(b)
    bodies.delete(id)
  }

  const unhang = (b: Body) => {
    for (const p of b.props ?? []) p.root.removeFromParent()
    b.props = undefined
  }

  // The kind's props, each its own clone of its model, made once every one has landed, and made
  // again when the kind's `props` change.
  function props(b: Body, plugins: Plugins, k: Kind, text: string) {
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

  // Each prop at its bone with the bone's scale taken off, then its offset.
  function hang(b: Body) {
    const T = three!
    const at = new T.Vector3(), turn = new T.Quaternion(), scale = new T.Vector3()
    for (const p of b.props ?? []) {
      p.bone.updateWorldMatrix(true, false)
      p.bone.matrixWorld.decompose(at, turn, scale)
      p.root.matrix.compose(at, turn, scale.set(1, 1, 1)).multiply(p.offset)
      p.root.matrix.decompose(p.root.position, p.root.quaternion, p.root.scale)
      p.root.updateMatrixWorld(true)
    }
  }

  const action = (b: Body, slot: Slot, clip: string) => {
    const key = `${slot} ${clip}`
    let a = b.actions.get(key)
    if (!a) {
      const drawn = b.kit.clips.get(clip)
      if (!drawn) throw new Error(`anim: the model has no clip ${clip}`)
      a = b.mixer.clipAction(drawn.slots[slot])
      a.play()
      b.actions.set(key, a)
    }
    return a
  }

  // The body in the parts given, every other action at weight 0, with its hips pinned.
  function weigh(b: Body, rig: Rig, parts: Part[]) {
    for (const a of b.actions.values()) a.setEffectiveWeight(0)
    for (const p of parts) {
      if (!(p.w > 0)) continue
      const a = action(b, p.slot, p.clip)
      a.time = p.t
      a.setEffectiveWeight(p.w)
    }
    for (const [bone, sampled] of b.aimed) bone.quaternion.copy(sampled)
    b.aimed = []
    b.mixer.update(0)
    pin(b, rig, parts.filter(p => (p.slot === 'to' || p.slot === 'from') && p.w > 0))
  }

  function pin(b: Body, rig: Rig, parts: Part[]) {
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
      const how = carries(c, numbers!)
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

  // The parts the row's fields draw.
  function parts(d: any, rig: Rig): Part[] {
    const clip = d.clip ?? momentOf(rig, stanceOf(rig, d), 'still')
    if (clip === undefined) return []
    const blend = d.from != null ? d.blend : 1
    const out: Part[] = [{ slot: 'to', clip, t: d.clip != null ? d.clipT : 0, w: blend }]
    if (d.from != null && blend < 1) out.push({ slot: 'from', clip: d.from, t: d.fromT, w: 1 - blend })
    if (rig.mask === undefined) return out
    const a = d.upper != null ? d.upperW : 0
    const w = d.was != null ? d.wasW : 0
    if (a + w > 0) {
      const s = Math.min(SHARE, a + w)
      const k = s / (a + w) / (1 - s)
      if (a > 0) out.push({ slot: 'upper', clip: d.upper, t: d.upperT, w: a * k })
      if (w > 0) out.push({ slot: 'was', clip: d.was, t: d.wasT, w: w * k })
    }
    return out
  }
  const place = (b: Body, d: any, reads: Reads) => {
    const p = d[reads.pos] ?? [0, 0, 0]
    b.root.position.set(p[0], p[1], p[2])
    b.root.quaternion.setFromAxisAngle(new three!.Vector3(0, 1, 0), d[reads.yaw] ?? 0)
  }

  // Each bone `aim` lists turned by its share of the row's pitch about the body's right, each kept
  // first as the mixer left it.
  function aim(b: Body, d: any, k: Kind, reads: Reads) {
    if (!k.aim) return
    if (reads.aim === undefined) throw new Error(`anim kinds.${animKind(b.row)} has an aim, and its reads name no aim`)
    let pitch = d
    for (const f of reads.aim.split('.')) pitch = pitch?.[f]
    if (typeof pitch !== 'number') return
    const T = three!
    const right = new T.Vector3(-1, 0, 0).applyQuaternion(b.root.quaternion)
    const bones = Object.entries(k.aim.bones).map(([suffix, share]) => [boneOf(b, suffix, k.model), share] as const)
    b.aimed = bones.map(([bone]) => [bone, bone.quaternion.clone()])
    const parent = new T.Quaternion()
    for (const [bone, share] of bones) {
      const axis = right.clone().applyQuaternion(bone.parent!.getWorldQuaternion(parent).invert())
      bone.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis, share * pitch))
    }
  }

  function draw(b: Body, d: any, rig: Rig, reads: Reads, k: Kind) {
    place(b, d, reads)
    const show = rig.show?.[stanceOf(rig, d)]
    for (const { mesh, roles } of b.meshes) mesh.visible = !show || !roles.length || roles.some(r => show.includes(r))
    weigh(b, rig, parts(d, rig))
    aim(b, d, k, reads)
    b.root.updateMatrixWorld(true)
  }

  const me = {
    tick(plugins: Plugins) {
      if (!plugins.render3d) throw new Error('anim draws through render3d, which this scene does not list')
      const order: string[] = plugins.wire.scene.plugins ?? []
      if (order.includes('render3d') && order.indexOf('render3d') < order.indexOf('anim')) throw new Error("anim must come before render3d in the scene's plugins, so its props are hung before the frame is drawn")
      three = plugins.render3d.THREE
      scene = plugins.render3d.scene
      numbers = numbersOf(plugins.wire)
      rigs = new Map()
      const seen = new Set<number>()
      for (const r of plugins.wire.rows) {
        const kind = animKind(r)
        if (!numbers.kinds[kind]) continue
        seen.add(r.id)
        const k = numbers.kinds[kind]
        const key = `${k.model}\n${k.rig}`
        let got = rigs.get(kind)
        if (!got) {
          const rig = rigOf(plugins.wire, kind)
          let text = texts.get(rig.clips)
          if (text === undefined) texts.set(rig.clips, (text = JSON.stringify([rig.clips, rig.mask ?? null, rig.meshes ?? null, rig.table])))
          got = { rig, text, reads: readsOf(plugins.wire, kind), props: JSON.stringify(k.props ?? []) }
          rigs.set(kind, got)
          if (kits.get(key)?.text !== got.text) kits.delete(key)
        }
        const { rig, text, reads, props: hung } = got
        let b = bodies.get(r.id)
        if (b && (b.key !== key || kits.get(key) !== b.kit)) {
          drop(r.id)
          b = undefined
        }
        if (!b) {
          b = make(r, plugins, rig, text, reads)
          if (!b) continue
          bodies.set(r.id, b)
        }
        b.row = r
        props(b, plugins, k, hung)
        if (r.data[reads.limp]) {
          b.limp = true
          hang(b)
          continue
        }
        if (b.limp) {
          rebuild(b)
          b.limp = false
        }
        draw(b, r.data, rig, reads, k)
        hang(b)
      }
      for (const id of [...bodies.keys()]) if (!seen.has(id)) drop(id)
    },
    afterTick() {
      for (const b of bodies.values()) hang(b)
    },
    model(id: number): THREE.Object3D | undefined { return bodies.get(id)?.root },
    props(id: number): THREE.Object3D[] { return bodies.get(id)?.props?.map(p => p.root) ?? [] },
    socket(id: number, suffix: string): THREE.Object3D | undefined {
      const b = bodies.get(id)
      if (!b) return undefined
      if (!b.sockets.has(suffix)) {
        let found: THREE.Object3D | undefined
        b.root.traverse(o => { if (!found && o.name.endsWith(suffix)) found = o })
        b.sockets.set(suffix, found)
      }
      return b.sockets.get(suffix)
    },
    pose(id: number, clip: string, t: number): THREE.Object3D {
      const b = bodies.get(id)
      if (!b) throw new Error(`anim has no model for row ${id}`)
      const { rig, reads } = rigs.get(animKind(b.row))!
      rebuild(b)
      place(b, b.row.data, reads)
      b.root.updateMatrixWorld(true)
      weigh(b, rig, [{ slot: 'to', clip, t, w: 1 }])
      b.root.updateMatrixWorld(true)
      return b.root
    },
    close() {
      for (const id of [...bodies.keys()]) drop(id)
      kits.clear()
      asked.clear()
      rigs = new Map()
      numbers = undefined
    },
  }
  return me
}
