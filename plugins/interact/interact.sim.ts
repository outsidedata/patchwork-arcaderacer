// interact: a body doing one thing with a machine, start to finish (boarding a walker and sitting in
// its seat, getting into a car and driving it, climbing onto a tractor). An interaction is a list of
// steps played in order on the body's row; in each, the body plays one clip, parented to a point of the
// machine, and its hands and feet may reach other points of it (`interact.ik3d.ts`). It describes the
// body alone: what the machine does meanwhile (kneeling for it, opening a door) is the game's, which
// reads the step the body is in. This file is the server half, with no row of its own: the functions a
// body's rule calls on its own row.
//
// The numbers, `world.interact`:
//   kinds   `{ <machine kind>: { <interaction>: <catalogue key> } }`: the interactions a machine of
//           the kind has, each a `json` entry of the scene's loader catalogue (`world.loader.assets`),
//           the interaction's file, read with the loader's `json`.
//   mods    `{ point }` (below), and the browser half's `object` and `body` (`interact.plugin.ts`).
//
// An interaction's file, `<machine>.<interaction>.interaction.json` beside the machine's model:
//   body    the anim kind of the body that plays it (`world.anim.kinds`): whose rig its clips are.
//   steps   `[{ name, clip, at, turn?, travel?, hold?, ik? }]`, played in order:
//     name   what the step is called, unique in the interaction: a game reads it (`stepOf`), the
//            workshop shows it.
//     clip   the clip of the body's rig the step plays (anim's `play`, as an act that holds); the
//            step lasts the clip's length, its table's `dur`.
//     at     the machine's point the body stands at: its root (the feet) there, every step of the
//            game, so the body goes where the machine takes the point and nowhere else.
//     turn   degrees: the body faces the point's frame's yaw turned this far (left positive), 0 when
//            it gives none.
//     travel `"from"` or `"to"`: the step carries its clip's measured travel (the rig's table, its
//            `travel` rows, times the clip's `scale`, its turn kept only where anim keeps it, `carries`)
//            in the point's frame, so a clip that walks the body somewhere (into a car's seat, out of
//            it) walks it there on the machine. `"from"`: the body starts at the point facing `turn`
//            and goes where the clip takes it. `"to"`: the body ends at the point facing `turn` at the
//            clip's end, starting wherever that puts it. At the step's `t` seconds into the clip, the
//            body is the start's place moved by the curve from its first row to `t`, in the start's
//            facing, and turned by as much as the curve has turned. Without `travel` the body stays on
//            the point. A step that holds travels nowhere: one that gives both throws.
//     hold   true: the step lasts until `end`, its clip looping as the rig plays it. Only the last
//            step holds; an interaction whose last step does not hold ends with that step's clip.
//     ik     `[{ bones, target, pole }]`: limbs the body bends while the step lasts, each as an ik3d
//            limb (`plugins/ik3d`), `target` a point of the machine (`interact.ik3d.ts`).
// A file out of shape throws naming the interaction and the field, the first time it is read and
// whenever its content changes.
//
// The machine's points come through a mod (`addons/scenemanager`), `world.interact.mods`:
//   point   `point(w, machine, name)`: the world place of the point `name` of the machine's row
//           `machine` this step, `{ at: [x, y, z], yaw }`, `yaw` its frame's facing, radians (the
//           game's that knows how its machines are built); undefined
//           for a point the machine has not. A scene with an interaction that names none throws.
//
// The body's row carries `interact`: null when it is in none, else `{ machine, kind, name, step, t }`:
// the machine's row id and kind, the interaction's name, the index of the step it is in and the seconds
// it has been in it. Its starting value, null, is in the body's prefab beside its other fields.
//
//   begin(me, w, machine, name)   `me` starts the machine's interaction `name` at its first step: its
//            clip played from 0 and the body placed at its `at`. Throws for an interaction the
//            machine's kind has not.
//   advance(me, w, dt)   the body's rule calls it each step it is in one, after the machine has moved:
//            `t` goes up by dt; a step whose clip has run its length gives way to the next, its clip
//            played from 0, the time past the end carried into it; past the last step that does not
//            hold, the interaction ends (`interact` null, the act stopped, the body where the last step
//            left it). The body is placed: its root at the step's point, facing the point's yaw turned
//            by `turn`, or where its `travel` has it, still (`vel` 0, on the ground as anim reads it, the
//            fields its anim kind's `reads` names). Hands back the step it
//            is in, `{ name, done }`, `done` true the step the interaction ended; undefined when the
//            body is in none. A machine whose row has ended ends the interaction, `done` true.
//   end(me, w)   the interaction ends where it is: `interact` null and the act stopped (anim's `stop`),
//            so the body is back in its gears.
//   stepOf(me, w)   the name of the step the body is in, or undefined when it is in none.
//   interactionOf(w, kind, name)   the interaction `name` of machines of `kind`, its file read and
//            checked, or undefined when the kind has no such one.
//   placeOf(w, machine, name)   the world place of the machine's point `name` this step, `{ at, yaw }`,
//            through the point mod: how near a body is to it. Throws for a point the machine has not.
//   startOf(w, me, machine, name)   where the machine's interaction `name` stands `me` as it begins,
//            `{ at, yaw }`, the body's facing: its first step's point and turn, moved back along the
//            clip's travel when that step travels `"to"`. Where a game stands a body before it begins,
//            and how near the body must be. Throws for an interaction the machine's kind has not.
//   travelOf(from, me, step, t)   the step's place for the body `me` at `t` seconds into it, in the
//            point's frame: `{ at: [x, z], yaw }`, metres along the frame's x and z and radians left
//            of the frame's facing (`[0, 0]` and the step's `turn` for a step that does not travel);
//            `from` a rule's `w` or a page's wire. What both halves place the body by.
import type { Row, W } from '#engine/engine.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Wire } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { animKind, at as curveAt, carries, clipOf, numbersOf, play, readsOf, rigOf, stop } from '#plugins/anim/anim.sim.ts'

export type Limb = { bones: [string, string, string]; target: string; pole: number[] }
export type Step = { name: string; clip: string; at: string; turn?: number; travel?: 'from' | 'to'; hold?: boolean; ik?: Limb[] }
export type Interaction = { body: string; steps: Step[] }
export type Numbers = { kinds: Record<string, Record<string, string>> }
export type Place = { at: number[]; yaw: number }
export type State = { machine: number; kind: string; name: string; step: number; t: number }
type PointMod = (w: W, machine: Row, name: string) => Place | undefined

const word = (v: unknown) => typeof v === 'string' && v.length > 0
const three = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))

// An interaction's file checked, throwing naming `where` and the field out of shape.
export function check(f: Interaction, where: string) {
  if (!f || typeof f !== 'object') throw new Error(`${where} is not an interaction`)
  if (!word(f.body)) throw new Error(`${where}.body is not an anim kind's name`)
  if (!Array.isArray(f.steps) || !f.steps.length) throw new Error(`${where}.steps is not a list of steps`)
  const names = new Set<string>()
  f.steps.forEach((s, i) => {
    const at = `${where}.steps[${i}]`
    if (!word(s.name)) throw new Error(`${at}.name is not a word`)
    if (names.has(s.name)) throw new Error(`${at}.name ${s.name} is the name of an earlier step`)
    names.add(s.name)
    if (!word(s.clip)) throw new Error(`${at}.clip is not a clip's name`)
    if (!word(s.at)) throw new Error(`${at}.at is not a point's name`)
    if (s.turn !== undefined && !Number.isFinite(s.turn)) throw new Error(`${at}.turn is not a number of degrees`)
    if (s.travel !== undefined && s.travel !== 'from' && s.travel !== 'to') throw new Error(`${at}.travel is not "from" or "to"`)
    if (s.hold !== undefined && typeof s.hold !== 'boolean') throw new Error(`${at}.hold is not true or false`)
    if (s.hold && i !== f.steps.length - 1) throw new Error(`${at} holds, and only the last step may`)
    if (s.hold && s.travel) throw new Error(`${at} holds and travels, and a step that holds travels nowhere`)
    for (const [j, l] of (s.ik ?? []).entries()) {
      if (!Array.isArray(l.bones) || l.bones.length !== 3 || !l.bones.every(word)) throw new Error(`${at}.ik[${j}].bones is not three bones' names`)
      if (!word(l.target)) throw new Error(`${at}.ik[${j}].target is not a point's name`)
      if (!three(l.pole) || l.pole.every(n => n === 0)) throw new Error(`${at}.ik[${j}].pole is not a direction`)
    }
  })
}

// Each file's content as last checked, by the loader's parse of it, so a file is checked once per change.
const checked = new WeakMap<object, string>()

export function interactionOf(w: W | { scene: { world?: Record<string, any> } }, kind: string, name: string): Interaction | undefined {
  const world = ('find' in w ? w.world : w.scene.world!) as Record<string, any>
  const n = world.interact as Numbers | undefined
  if (!n || typeof n.kinds !== 'object') throw new Error('interact: the scene gives no world.interact.kinds')
  const key = n.kinds[kind]?.[name]
  if (key === undefined) return undefined
  const f = json(w as W, key) as Interaction
  const text = JSON.stringify(f)
  if (checked.get(f) !== text) {
    check(f, `interact ${kind}.${name}`)
    checked.set(f, text)
  }
  return f
}

const stateOf = (me: Row) => me.data.interact as State | null | undefined

// The machine the body is in an interaction with, or undefined once its row has ended.
const machineOf = (w: W, s: State): Row | undefined => w.all(s.kind).find(r => r.id === s.machine)

// The seconds a step lasts: its clip's length, or for ever when it holds.
function lengthOf(w: W, me: Row, step: Step): number {
  if (step.hold) return Infinity
  const m = rigOf(w, animKind(me)).table[step.clip]
  if (!m) throw new Error(`interact: the rig of ${animKind(me)} has no clip ${step.clip} in its table`)
  return m.dur
}

export function placeOf(w: W, machine: Row, name: string, where = `interact ${machine.kind}`): Place {
  const point = mod<PointMod>(w.world, 'interact', 'point')
  if (!point) throw new Error('interact places bodies at the points a mod hands it, and the scene names none in world.interact.mods.point')
  const p = point(w, machine, name)
  if (!p) throw new Error(`${where}: the ${machine.kind} has no point ${name}`)
  return p
}

const DEG = Math.PI / 180

// A move of `fwd` metres ahead and `left` metres to the left of a facing `yaw`, as [x, z]: yaw θ faces
// (sin θ, cos θ), and left of it is (cos θ, −sin θ), anim's way.
const moved = (fwd: number, left: number, yaw: number) => [fwd * math.sin(yaw) + left * math.cos(yaw), fwd * math.cos(yaw) - left * math.sin(yaw)]

export function travelOf(from: W | Wire, me: Row, step: Step, t: number): { at: number[]; yaw: number } {
  const turn = (step.turn ?? 0) * DEG
  if (!step.travel) return { at: [0, 0], yaw: turn }
  const clip = clipOf(rigOf(from, animKind(me)), step.clip)
  const { turns } = carries(clip, numbersOf(from))
  // The curve from its first row: metres ahead and left in the start's facing, and degrees turned.
  const [f0, l0, y0] = curveAt(clip.measure, 0)
  const curve = (u: number) => {
    const [f, l, y] = curveAt(clip.measure, u)
    return [(f - f0) * clip.scale, (l - l0) * clip.scale, turns ? (y - y0) * DEG : 0]
  }
  let start = [0, 0], facing = turn
  if (step.travel === 'to') {
    const [f, l, y] = curve(clip.dur)
    facing = turn - y
    const back = moved(f, l, facing)
    start = [-back[0], -back[1]]
  }
  const [f, l, y] = curve(Math.min(Math.max(t, 0), clip.dur))
  const go = moved(f, l, facing)
  return { at: [start[0] + go[0], start[1] + go[1]], yaw: facing + y }
}

// A place in a point's frame, [x, z] and a yaw left of its facing, put in the world.
function inWorld(p: Place, local: { at: number[]; yaw: number }): Place {
  const [x, z] = local.at, c = math.cos(p.yaw), s = math.sin(p.yaw)
  return { at: [p.at[0] + x * c + z * s, p.at[1], p.at[2] - x * s + z * c], yaw: p.yaw + local.yaw }
}

export function startOf(w: W, me: Row, machine: Row, name: string): Place {
  const f = interactionOf(w, machine.kind, name)
  if (!f) throw new Error(`interact: a ${machine.kind} has no interaction ${name}`)
  const step = f.steps[0]
  return inWorld(placeOf(w, machine, step.at, `interact ${machine.kind}.${name}.steps[0]`), travelOf(w, me, step, 0))
}

// The body placed for its step: its root on the step's point, or where its travel has it.
function place(me: Row, w: W, machine: Row, f: Interaction, s: State) {
  const step = f.steps[s.step]
  const p = inWorld(placeOf(w, machine, step.at, `interact ${machine.kind}.${s.name}.steps[${s.step}]`), travelOf(w, me, step, s.t))
  const r = readsOf(w, animKind(me))
  me.data[r.pos] = p.at
  me.data[r.yaw] = p.yaw
  me.data[r.vel] = [0, 0, 0]
  me.data[r.grounded] = true
}

export function begin(me: Row, w: W, machine: Row, name: string) {
  const f = interactionOf(w, machine.kind, name)
  if (!f) throw new Error(`interact: a ${machine.kind} has no interaction ${name}`)
  const s: State = { machine: machine.id, kind: machine.kind, name, step: 0, t: 0 }
  me.data.interact = s
  play(me, f.steps[0].clip, { holds: true })
  place(me, w, machine, f, s)
}

export function advance(me: Row, w: W, dt: number): { name: string; done: boolean } | undefined {
  const s = stateOf(me)
  if (!s) return undefined
  const machine = machineOf(w, s)
  if (!machine) {
    end(me, w)
    return { name: s.name, done: true }
  }
  const f = interactionOf(w, machine.kind, s.name)!
  const next: State = { ...s, t: s.t + dt }
  let length = lengthOf(w, me, f.steps[next.step])
  while (next.t >= length) {
    if (next.step === f.steps.length - 1) {
      place(me, w, machine, f, next)
      end(me, w)
      return { name: f.steps[next.step].name, done: true }
    }
    next.t -= length
    next.step += 1
    play(me, f.steps[next.step].clip, { holds: true })
    length = lengthOf(w, me, f.steps[next.step])
  }
  me.data.interact = next
  place(me, w, machine, f, next)
  return { name: f.steps[next.step].name, done: false }
}

export function end(me: Row, w: W) {
  if (!stateOf(me)) return
  me.data.interact = null
  stop(me, w)
}

export function stepOf(me: Row, w: W): string | undefined {
  const s = stateOf(me)
  if (!s) return undefined
  return interactionOf(w, s.kind, s.name)?.steps[s.step]?.name
}
