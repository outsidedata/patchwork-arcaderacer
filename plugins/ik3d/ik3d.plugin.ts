// ik3d: a body's limbs bent to reach points on what it holds, or on what another plugin says it reaches
// for, and what it holds set against the body by a point of its own. A browser half only, with no row
// and no prefab: what it draws is worked out each frame from rows every seat already has, and its
// numbers never change, so they are the scene's `world.ik3d`, read off `plugins.wire.scene.world`.
//
// The bodies, and the limbs other plugins hand, come through mods (`addons/scenemanager`),
// `world.ik3d.mods`:
//   body   `body(plugins, row)`, the body the page draws for the row, `{ kind, root, props, limp }`:
//          the kind its numbers are found under, its model root, the props hung on it in their kind's
//          order as `{ model, root }`, and whether it lies limp; undefined while it has no model
//          (anim's, `anim.ik3d.ts`). A scene that names none throws. The plugin whose `body` it is
//          poses its models and hangs its props in its own `tick` and again in its `afterTick`, which
//          this one reads in each, so it is listed before ik3d and a scene listing it after throws
//          (`ahead`). render3d draws in its `afterTick`, so ik3d is listed before render3d, or the
//          frame would be drawn before the limbs reach: the other order throws.
//   limbs  `limbs(plugins, row)`, limbs another plugin hands for the row this frame, beside its kind's
//          own: `[{ bones, pole, target }]`, each as a kind's limb but `target` the three.js object it
//          reaches (interact's, `plugins/interact/interact.ik3d.ts`: the hands and feet of a body in an
//          interaction on its machine's points, for the step it is in); undefined or empty for none. A
//          row whose kind `world.ik3d.kinds` does not list is solved for these alone. They are bent
//          after the kind's own and counted after them in `short`. The plugin it is is listed before
//          ik3d (`ahead`). With none named, a row is solved for its kind's limbs alone.
//
// The numbers, `world.ik3d.kinds.<kind>`:
//   anchor  `{ prop, bone, at, turn, point }`, optional: the prop hung as `prop` (its loader model)
//           is set so its `point` empty (a rifle's `stock`) stands at the frame of the first bone whose
//           name ends with `bone`, that frame's scale taken off, moved by `at` (metres) and turned by
//           `turn` (degrees, an XYZ Euler) in it; `turn` turns the prop about the point. A prop with
//           no such point is set by its root. With no anchor, every prop stays where its body hung it.
//   limbs   `[{ bones: [upper, lower, end], prop, target, pole }]`: each limb, three bone suffixes
//           (an arm, its forearm and its hand, or a thigh, its shin and its foot), reaches the empty
//           `target` inside the prop hung as `prop`: the end bone at the empty's place, turned to its
//           rotation, the middle joint toward `pole`, a direction in the body root's frame. The solve
//           is `ik3d.solve.ts`'s `reach`.
// The numbers are checked whenever their content changes, and one out of shape throws naming it. A
// bone suffix the model has no bone for, a prop the body does not hold and an empty the prop does not
// have throw naming them, once the body and its props are there. A prop the body's kind names and its
// plugin has not made yet, its model still loading, is waited for: the body is not solved until it is
// there, so its first frames stand as its clip draws them.
//
// A frame: the anchor first, then each limb in its order, in this plugin's `tick` (so an actor's
// tick reads the reached pose, a muzzle where the hands hold it) and again in its `afterTick`, after
// the body's plugin hangs its props again. A Mixamo model's meshes can each bind a skeleton copy of
// their own: the solve is on the copy whose bones' names carry no `_N` (the copy the clips drive),
// and each bone it turns lends its local rotation to the bone of the same name in every other copy.
//   The plugin that poses a body writes a bone only when its clip's value for it moved, so a bone left
// turned would keep the reach of the frame before and take another. Each bone a solve turns is kept
// as it stood before the solve and as the solve left it; before the next solve, a bone that still
// stands as the solve left it is put back as it stood before, and one its clip has written since is
// left as the clip wrote it. So every solve starts from the clip's pose, and solving twice in a frame
// lands the same.
//   A limp body is not solved: whatever made it limp owns its bones. It is let go of, and so is a row
// that ends and a row whose kind `world.ik3d.kinds` no longer lists: each bone the last solve turned
// that still stands as it left it is put back, so the body stands as its clip draws it. `close` lets
// go of all.
//
// `short(id)` is how far each limb's end bone ended from its target on the last solve, metres, in its
// kind's order and then the `limbs` mod's, or undefined for a row not solved.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { ahead, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { anchor, reach } from './ik3d.solve.ts'

type Three = typeof import('three')
export type Anchor = { prop: string; bone: string; at: number[]; turn: number[]; point: string }
export type Limb = { bones: [string, string, string]; prop: string; target: string; pole: number[] }
export type Kind = { anchor?: Anchor; limbs?: Limb[] }
export type Numbers = { kinds: Record<string, Kind> }
export type Body = { kind: string; root: THREE.Object3D; props: { model: string; root: THREE.Object3D | undefined }[]; limp: boolean }
type BodyMod = (plugins: Plugins, row: Row) => Body | undefined
// A limb another plugin hands for a row this frame: its bones, its pole and the object it reaches.
export type Handed = { bones: [string, string, string]; pole: number[]; target: THREE.Object3D }
type LimbsMod = (plugins: Plugins, row: Row) => Handed[] | undefined
// What a limb reaches for this frame: its bones, its pole and its target resolved.
type Reach = { bones: [string, string, string]; pole: number[]; end: THREE.Object3D }

const three = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))
const name = (v: unknown) => typeof v === 'string' && v.length > 0

export function check(n: Numbers) {
  if (!n || typeof n.kinds !== 'object' || n.kinds === null) throw new Error('ik3d: world.ik3d has no kinds')
  for (const [kind, k] of Object.entries(n.kinds)) {
    const at = `ik3d kinds.${kind}`
    if (k.anchor !== undefined) {
      const a = k.anchor
      if (!name(a.prop)) throw new Error(`${at}.anchor.prop is not a model's name`)
      if (!name(a.bone)) throw new Error(`${at}.anchor.bone is not a bone's name`)
      if (!name(a.point)) throw new Error(`${at}.anchor.point is not an empty's name`)
      if (!three(a.at)) throw new Error(`${at}.anchor.at is not three numbers`)
      if (!three(a.turn)) throw new Error(`${at}.anchor.turn is not three numbers`)
    }
    for (const [i, l] of (k.limbs ?? []).entries()) {
      const li = `${at}.limbs[${i}]`
      if (!Array.isArray(l.bones) || l.bones.length !== 3 || !l.bones.every(name)) throw new Error(`${li}.bones is not three bones' names`)
      if (!name(l.prop)) throw new Error(`${li}.prop is not a model's name`)
      if (!name(l.target)) throw new Error(`${li}.target is not an empty's name`)
      if (!three(l.pole) || Math.hypot(...l.pole) === 0) throw new Error(`${li}.pole is not a direction`)
    }
  }
}

// A bone's name with the `_N` three's loaders give a repeated name taken off.
const base = (s: string) => s.replace(/_\d+$/, '')

type Turned = { bone: THREE.Object3D; before: THREE.Quaternion; after: THREE.Quaternion }
type Solved = { root: THREE.Object3D; turned: Turned[]; short: number[] }

export function ik3d() {
  const solved = new Map<number, Solved>()
  let text = ''
  let numbers: Numbers | undefined

  // The bone the solve turns for a suffix (the first whose name, `_N` aside, ends with it and has no
  // `_N`, else the first), and every other copy's bone of that name.
  function bonesOf(root: THREE.Object3D, suffix: string, kind: string) {
    const all: THREE.Object3D[] = []
    root.traverse(o => { if ((o as THREE.Bone).isBone && base(o.name).endsWith(suffix)) all.push(o) })
    if (!all.length) throw new Error(`ik3d kinds.${kind}: the model has no bone ending ${suffix}`)
    const main = all.find(o => o.name === base(o.name)) ?? all[0]
    return { main, copies: all.filter(o => o !== main && base(o.name) === base(main.name)) }
  }

  function empty(prop: THREE.Object3D, suffix: string, where: string) {
    let found: THREE.Object3D | undefined
    prop.traverse(o => { if (!found && o !== prop && o.name.endsWith(suffix)) found = o })
    if (!found) throw new Error(`${where}: the prop has no empty ending ${suffix}`)
    return found
  }

  function held(b: Body, model: string, where: string) {
    const p = b.props.find(x => x.model === model)
    if (!p) throw new Error(`${where}: the body holds no ${model}`)
    return p.root!
  }
  // What each of the kind's limbs reaches for this frame, in the kind's order: its bones, its pole and
  // its target, the empty inside the prop it holds; undefined while a prop waits on its model still
  // loading. A prop not named at all, or an empty it lacks, throws.
  function reachesOf(b: Body, k: Kind): Reach[] | undefined {
    if (k.anchor && !b.props.find(x => x.model === k.anchor!.prop)) throw new Error(`ik3d kinds.${b.kind}.anchor: the body holds no ${k.anchor.prop}`)
    if (k.anchor && b.props.find(x => x.model === k.anchor!.prop)!.root === undefined) return undefined
    const got: Reach[] = []
    for (const [i, l] of (k.limbs ?? []).entries()) {
      const where = `ik3d kinds.${b.kind}.limbs[${i}]`
      const p = b.props.find(x => x.model === l.prop)
      if (!p) throw new Error(`${where}: the body holds no ${l.prop}`)
      if (p.root === undefined) return undefined
      got.push({ bones: l.bones, pole: l.pole, end: empty(p.root, l.target, where) })
    }
    return got
  }

  // Every bone a solve turned that still stands as it left it, put back as it stood before.
  function putBack(s: Solved) {
    for (const t of s.turned) if (t.bone.quaternion.equals(t.after)) t.bone.quaternion.copy(t.before)
    s.turned = []
  }

  function solve(T: Three, r: Row, b: Body, k: Kind, reaches: Reach[]) {
    let s = solved.get(r.id)
    if (s && s.root !== b.root) { solved.delete(r.id); s = undefined }
    if (!s) { s = { root: b.root, turned: [], short: [] }; solved.set(r.id, s) }
    putBack(s)
    b.root.updateMatrixWorld(true)
    if (k.anchor) {
      const a = k.anchor
      const where = `ik3d kinds.${b.kind}.anchor`
      anchor(T, held(b, a.prop, where), bonesOf(b.root, a.bone, b.kind).main, a.at, a.turn, a.point)
    }
    const turned: THREE.Object3D[][] = []
    s.short = reaches.map(l => {
      const chain = l.bones.map(suffix => bonesOf(b.root, suffix, b.kind))
      const before = chain.flatMap(c => [c.main, ...c.copies]).map(o => ({ bone: o, before: o.quaternion.clone() }))
      l.end.updateWorldMatrix(true, false)
      const short = reach(T, chain.map(c => c.main) as [THREE.Object3D, THREE.Object3D, THREE.Object3D], l.end, l.pole, b.root)
      for (const c of chain) for (const o of c.copies) o.quaternion.copy(c.main.quaternion)
      for (const { bone, before: q } of before) s!.turned.push({ bone, before: q, after: bone.quaternion.clone() })
      turned.push(chain.flatMap(c => c.copies))
      return short
    })
    for (const copies of turned) for (const o of copies) o.updateMatrixWorld(true)
  }

  function frame(plugins: Plugins) {
    const scene = plugins.wire.scene
    const n = scene.world?.ik3d as Numbers | undefined
    if (!n) throw new Error('ik3d: the scene gives no world.ik3d')
    const now = JSON.stringify(n)
    if (now !== text) {
      check(n)
      text = now
    }
    numbers = n
    const body = mod<BodyMod>(scene.world!, 'ik3d', 'body')
    if (!body) throw new Error('ik3d bends the bodies a mod hands it, and the scene names none in world.ik3d.mods.body')
    ahead(scene, 'ik3d', 'body')
    const handed = mod<LimbsMod>(scene.world!, 'ik3d', 'limbs')
    if (handed) ahead(scene, 'ik3d', 'limbs')
    const order: string[] = scene.plugins ?? []
    if (order.includes('render3d') && order.indexOf('render3d') < order.indexOf('ik3d')) throw new Error("ik3d must come before render3d in the scene's plugins, so the limbs reach before the frame is drawn")
    if (!plugins.render3d) throw new Error('ik3d bends bodies render3d draws, and this scene does not list it')
    const T: Three = plugins.render3d.THREE
    const seen = new Set<number>()
    for (const r of plugins.wire.rows) {
      const b = body(plugins, r)
      if (!b || b.limp) continue
      const k = numbers.kinds[b.kind]
      const more = handed?.(plugins, r) ?? []
      if (!k && !more.length) continue
      const own = k ? reachesOf(b, k) : []
      if (!own) continue
      seen.add(r.id)
      solve(T, r, b, k ?? {}, [...own, ...more.map(l => ({ bones: l.bones, pole: l.pole, end: l.target }))])
    }
    for (const id of [...solved.keys()]) if (!seen.has(id)) letGo(id)
  }

  // A body no longer solved, its bones put back as its clip left them: a kind whose IK is taken
  // out, a row gone limp or ended. A bone something else has written since is left as it was written.
  function letGo(id: number) {
    const s = solved.get(id)
    if (s) putBack(s)
    solved.delete(id)
  }

  return {
    tick(plugins: Plugins) { frame(plugins) },
    afterTick(plugins: Plugins) { frame(plugins) },
    short(id: number): number[] | undefined { return solved.get(id)?.short.slice() },
    close() {
      solved.clear()
      text = ''
      numbers = undefined
    },
  }
}
