// motion3d: how a rigged body moves through the world, or is held in place, while it plays animation.
// One flat system for every thing a body does with its clips: walking, dancing in a zone, hanging off a
// ledge, sitting in a chair, climbing a rope, driving a car. It plays the body's clips itself, one at a
// time, a change of clip faded over the kind's `fade` (`motion3d.play.ts`), and draws the body itself.
// Its server half (this file) has no row of its own: the functions a body's rule calls on its own row. Its browser half (`motion3d.plugin.ts`) draws a body held to a moving
// space on that space as the page draws it, hangs its props, and bends its limbs itself.
//
// motion3d decides nothing. The game's own rule picks the body's activity, its motion and the point of
// a space it plays against; motion3d plays the motion's clip and puts the body there; kinematics3d moves
// the body's place on its target (`plugins/kinematics3d`), a space's point or the triangles beneath it,
// by the behaviors motion3d delivers it (`move`, `jump`; `motion3d.kinematics3d.ts`), and lets it fall,
// so a scene names motion3d in `world.kinematics3d.mods.behaviors` and `states`.
//
// One held path. Every body is held to its move's target and moved along the target's ways: free is held
// with more directions. The ground is a target as a line or a plane is, `triangles`, its ways x and z
// with no ends. Each step the clip runs, kinematics3d moves the place (`along`) by the move's behavior,
// and the body is placed there by its clip (`advance`).
//
// The character's motion3d file. `world.motion3d.kinds.<kind>` is `{ motion, baked }` beside the body's
// own (`motion3d.play.ts`: `rig`, `measured`, `model`, `glb`, `fade`, `reads`, `props`), `<kind>` the
// row's `as` when it names one, else its kind: `motion` the loader `json` entry of its motion3d file
// (`xbot.motion3d.json`), and `baked` of what motion3d's bake made of it (`xbot.motion3d.baked.json`,
// `motion3d.offsets.ts`). A kind the table does not name throws naming it. The motion3d file is `{ rig,
// moves, turns, carries?, activities }`, each activity `{ normal?, motions }`:
//   normal   [x, y, z], a unit vector: the up the activity holds the body to on any point, in place of
//            the point's own normal (walking stands upright on a slope); none, the point's own
//   motions  `{ <motion>: { target?, behavior?, clips, press?, stick?, from?, when?, then?, over? } }`:
//            the first the one the activity starts with, where nothing fits (`fill`); a motion's `when`
//            is its description of the situation it plays in:
//     target    the kind of target it plays against, `point`, `line`, `plane` or `triangles` (Targets,
//               below)
//     behavior  how kinematics3d moves the body while it plays: `move` or `jump`
//               (`motion3d.kinematics3d.ts`); `move` when it names none
//     clips   the names of clips of the body's rig; none, for the whole body a move that hands it to
//             the stack, for the upper half a held motion where it names a carry
//     press   the key that plays it
//     stick   the way the stick must point: `forward`, `back`, `across`, `none`
//     from    the moves it may follow, the body's or its upper half's; none, any (a move a space offers is
//             played by `press` from none)
//     when    the states that must be true of the body (kinematics3d's `is`), `!word` one that must not
//     then    the move of its activity played once it is over (A motion ends, below); none, the stack
//     over    the bone the move's clip is played from, over the body (Over, below)
//     carry   the carry the body holds its prop by while the move plays (Carries, below)
//
// Carries. The motion3d file's `carries`, `{ <name>: { prop, anchor, limbs } }`, each how the body holds a
// prop of its kind's `props` (`prop`, its loader model) while a move that names it plays:
//   anchor  `{ bone, at, turn, point }`: the prop set so its `point` empty (a rifle's `stock`) stands at
//           the frame of the first bone whose name ends with `bone`, that frame's scale taken off, moved
//           by `at` (metres) and turned by `turn` (degrees, an XYZ Euler) in it
//   limbs   `[{ bones: [upper, lower, end], target, pole }]`: each limb reaches the empty `target` inside
//           the prop, its end bone there and turned as it is, its middle joint toward `pole`, a direction
//           in the body root's frame
// at the share its move's clip is drawn by (whole for a move with no clips): the upper half's move's first, else the body's
// (`carrying(w, me)`). The browser half bends them (`motion3d.plugin.ts`, ik3d's solve), and draws a
// prop some carry holds only while it is carried (`carriedProps(w, me)`): it is in the hands only then.
//
// Over. A move with `over` is played on the upper half alone: its clip on the bone `over` names and every
// bone under it, over whatever the body plays, the body's own move going on beneath it, one at a time as
// the body's are, faded in and out over the kind's `fade` (`motion3d.play.ts`'s `over`). The upper half
// is a part of the body of its own (The stack): its move, `upperMotion`, of the activity `upperActivity`
// of the shape `upperSpace`, comes and goes as the stack has it. One with no clips lets the upper half go,
// but one that names a carry holds the upper half on that carry, nothing played over the body: a held
// motion, over as a loop is. It never moves the body and has no target.
//
// Targets. A move plays against its `target`: on `triangles`, or on a `plane` with a clip whose spot is
// the feet on the floor at the frame it is on its point (`on`), the triangles beneath the body (terrain3d's
// `triangles`), facing the way the body faces less the clip's `beginTurn`, held to the ground's up there;
// else the one point of that kind the space has (a space with none or more than one throws, naming
// them); a move with no `target`, none: it plays where it stands. On a target whose ways span the ground
// (kinematics3d's `spans`: the ground, a ceiling, the water), the body turns the way the stick goes, as
// `move` turns it (the row's `facing`), and faces that way less the clip's `beginTurn`.
//
// The want. A body is moved as fast as its clip carries it. A loop: as its lap carries its spot, as hard
// as the stick pushes the way the clip goes, or, on a target whose ways span the ground, the stick's way
// (the row's `want`, the camera-relative stick) at the lap's speed, by `move`. A one-shot whose move is
// `move`: as far as its root's travel goes along the target's ways this step, walls and edges stopping it,
// the rest of its travel placing the body. A one-shot of another behavior (`jump`): the stick's way at
// the speed it goes across the ground, its travel placing the body. A move on `triangles` stands its root
// on its place (the land's clips are measured from the root on the floor); any other is placed by its
// offsets (Offsets, below).
//
// The stack. The shapes holding the body are a stack, best ranked first (a space's `priority`, its
// distance, its id), the anywhere shape at the bottom (`world.motion3d.anywhere`). A shape whose `data`
// says `motion3d.autoChange` takes its activities up with no key; the anywhere shape is one. The body has
// two parts: the whole body, whose motions name no `over`, and the upper half, whose motions do. Each part
// takes its motion from the highest of those shapes with one that fits: no `press`, may follow what the
// body and its upper half play (`from`), and describes the situation (its `when` and `stick` hold).
// What a shape does not list is inherited from the shapes under it, down to the anywhere shape.
//
// A motion ends, then the next is found. A motion remembers the shape it started in (`space`,
// `upperSpace`). A one-shot is over when it plays out. A loop, or a held motion with no clip, is over
// when its shape no longer holds the body, when its description stops being true, or, as its clip comes
// round (each step for one with no clip), when a higher ranked shape holding the body has a motion of its
// part that fits. Over: its `then`, when it names one; else the search through the stack; else, nothing
// fitting, `fill` from the anywhere shape: its first activity, its first motion (the upper half let go).
// A motion of the whole body found so plays the clip of its own that goes the way the body is walked
// (strafing: a walk of eight clips, one each way).
//
// Moves. A shape that takes nothing up with no key, a station, is entered by a key, and holds the body in
// its activity as long as it stands (its point may stand outside it: a seat beside its desk): a one-shot
// played out, its `then`, else the stack; on a loop, the first move of its activity with no `press` and a
// `stick` or a `when`, that may follow it and whose stick and states hold, its clip the one that goes the
// way the stick pushes. A key plays, through the shapes holding the body and the station it is in, best
// ranked first, down to the anywhere shape, the first motion with that `press` whose stick and states
// hold: one over the body that may follow what the body and its upper half play (one with no `from`, any
// but itself); one of the whole body whose `from` names the move it plays, in any activity; one with no
// `from`, in an activity the body is not in, of a shape ranked above the one it is in.
// The baked file is `{ held, offsets }`: `held.<clip>`, each clip's spot, `{ spot, on, facing?, after? }`
// (its sidecar's, `motion3d.offsets.ts`'s header), and `offsets.<body>.<clip>`, its two offsets for the
// row's body, its kind's `model` (Offsets, below). A clip it has no offsets of throws, naming it.
//
// Held to a point. A space's points are what its shape names under `points`, placed in the world as its
// row stands, each a constraint: a `point` (a place and a facing), a `line` (from one place to another,
// and a facing), or a `plane` (a rectangle, its middle, its two axes and a facing), each with the
// `normal` its shape gives it, the way it faces out. Its frame is its up, the activity's `normal`, else
// its own, else straight up; its ahead, its facing laid square to its up (or, where its facing is its up,
// up the world laid square to it); and its left, the third way. A point is a kinematics3d target, the
// same data under the same word, and the body's place on it, `along`, kinematics3d's place: metres along
// a line from its `from`, [across, along] metres on a plane from its middle, nothing on a point.
//
// Offsets. `beginOffset` is where the clip's spot stands from the point at its first frame, and
// `endOffset` at its last, [x, y, z] metres in the point's frame; `beginTurn` the way the body faces at
// the first frame from the point's facing, degrees, positive to its left; for a spot on its point all
// through, all are zero. The spot is the middle of the bones `held.<clip>.spot` names (the hands on a bar,
// the hips on a seat, the feet against a wall), none the root.
//
// Tilt. A clip is measured against a thing that faces some way: a wall its feet kick off faces out of
// it, toward the body; a seat or a floor faces up. Its offsets' `normal` is that way, in the body's frame
// at the clip's first frame, straight up where they give none. Held to a point whose up is another way,
// the body is tilted by the turn that lays the one onto the other, about its root: a climber leans onto
// a wall that leans back. The row carries the tilt, `tilt` [x, y, z, w], a quaternion over its facing,
// or null; it is eased in and out as the root is (Easing), and the browser half draws it.
//
// Each step the body is placed by its clip's offsets alone. The spot is where the body is drawn (`spotIn`:
// the middle of the bones, `drawnAt`, the measured `ends`, each bone where its segment starts, for a
// one-shot that carries travel the hips held at their rest across the ground and the body turned back by
// the curve's turn, as they are pinned; from the root where the clip's measured travel carries it,
// `carries`, turned as it is), in the clip's frame at its start. The body faces the point's facing turned
// by `beginTurn`, and the clip's frame at its start is put so that its spot stands `beginOffset` from
// the point. Where its last frame would stand the spot short of `endOffset`, the difference is made up in
// step with the playhead. The root then goes where the clip carries it from there. The place on a line or
// a plane is set as the body comes onto it, nearest where the spot would stand less its `beginOffset`,
// the clip begun where the root stands, and kept short of its edges by how far the spot's bones reach
// along each of its ways. A motion held to another point comes onto that one afresh. A looping clip moves
// its place by how far a lap carries its spot as it plays, at its own rate and the row's: its measured
// travel across the ground over a lap, which is drawn none of, and how far the clip draws the spot on
// from its first frame to its last, its climb among it. That is the want motion3d hands kinematics3d,
// which moves the place and stops it at the point's edges; a move that would carry a bone of the spot past
// an edge, as the clip has it this step, is not made. With no bone named, a loop's spot is the root risen
// as far as the clip climbs its hips into its lap. Whether the target holds the body up is kinematics3d's
// to say (its `grounded`); its `vel` is the speed `move` moves it along the target at, from rest as it
// comes onto a space.
//
// Easing. A body's clip fades into the one it starts over its kind's `fade`, each
// clip drawn about the root, and each clip's bones stand at their own heights over it: a hang's wrists
// 1.919 m over the root, a shimmy's 2.370 m. So the root is eased as the clips fade: from where
// the clip fading out stood it (`eased.from`, the body's place when its clip was at full weight) to
// where the clip coming in has it, at the share the one coming in is drawn by (its `blend`), so the
// bones the two clips land on a point stay on it all through the fade. Handed from a space's point to
// the triangles, its place there is where its feet are, and kinematics3d stands it there or lets it
// fall, the root eased the same way. With no fade running, nothing is eased.
//
// The limbs. While a body is held to a target, each hand and foot of its clip's spot (`LeftHand`,
// `RightHand`, `LeftFoot`, `RightFoot`) is bent onto the nearest place of that target for
// the frames the bake says it is planted (`plantsOf`), eased in over `world.motion3d.ease` seconds
// from the run's start and out over as long to its end, but at an end of the clip's own (a one-shot's
// start or end, a loop held all its lap), where the crossfade eases it; in a crossfade, each of the two
// clips by its share. Each bends as its clip bends it (`asDrawn`). `reachesOf(w, me)` is every limb bent
// this step, `{ bone, bones, pole, at, turn, weight }`. A scene that bends a limb and gives no
// `world.motion3d.ease` throws.
//
// Spaces: anything a plugin hands motion3d through the `spaces` mod, `world.motion3d.mods.spaces: '<a>'`,
// `spaces(w, at)`, every space there is, each `{ id, activities, priority?, data?, points?, holds, far }`:
// the row id of the thing that offers it, the activity words it offers, its priority, its `data` (its
// `motion3d.autoChange`), its points placed in the world, whether it holds the point `at` [x, y, z], and
// how far its middle is from `at`. shapes3d is one (`shapes3d.motion3d.ts`). A space whose row moves
// carries the body held to its points with it. Priority: the anywhere shape's own; a space's, 1 when it
// gives none.
//
// What the rule calls, each on its own row:
//   drive(me, w, dt, stick)   once a step: writes `offered`, the activity words of the spaces that hold
//                          the body, highest priority first, and `lookAround`, those spaces as
//                          `holding` hands them, its last step's moved to `previousLookAround` first: a
//                          space in `lookAround` and not in `previousLookAround` is one the body has just
//                          come into; hands the body back to its `anywhere` when
//                          its space is gone, or no longer holds it while it is held to nothing; and
//                          moves and plays it (Moves), the stick [right, forward] its want along a target
//   press(me, w, key, stick)  a key: plays the move it starts (Moves, Over); whether one was played
//
// The body's row carries `activity`, the word of the activity it is in; `motion`, the move it plays, or
// null; `space`, the row id of the space whose activity it is in, or null; `root`, the target it is
// held to, the name of a point of its space or the triangles beneath it it was handed, or null; `along`, its
// place on its target, or null; `eased`, `{ from, to }` while its root is eased, `from` [x, y, z, yaw]
// and the tilt after it when it had one, `to` null, else null;
// `offered`, `lookAround` and `previousLookAround`; `tilt`; `stopped`, the way the stick pushed when its place stopped at an edge, or false;
// `facing`, the way `move` turned it on a target whose ways span the ground, or null; and `upperMotion`,
// `upperActivity` and `upperSpace`, the move its upper half plays, its activity and its shape, or null.
// motion3d fills each the first time it moves the row: the anywhere shape's first activity, nothing else
// yet. Its rule sets `want`, the stick's way across the ground [x, z], and `face`, the way to face, or
// null.
//
// The numbers, `world.motion3d`: `kinds` (above), `anywhere`, `ease` (The limbs), seconds, and `mods`:
// `spaces`, and the browser half's `object` (`motion3d.plugin.ts`).
// The anywhere shape, `world.motion3d.anywhere`, `{ shape: { box: { size } }, activities, priority, data
// }`: a box at the middle of the world, 1e9 m a side, holding every point, priority 0, under every other
// shape; its `activities` the ones a body has everywhere, the first the one it starts in (`fill`).
import type { Row, W } from '#engine/engine.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { Quaternion, Vector3 } from 'three'
import { animate as animated, playKind as animKind, clipOf, ends, fill as fillPlay, movesOf, numbersOf, over, overStep, plantsOf, play as playClip, posed, readsOf, rigOf, under, type Body, type Limb } from './motion3d.play.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { at as atOn, is, joined, nearest as nearestOn, parts, spans, step as moveOn, ways as waysOf, type Place, type Target } from '#plugins/kinematics3d/kinematics3d.sim.ts'
import { fill as fillBody } from './motion3d.kinematics3d.ts'
import * as math from '#plugins/math/math.sim.ts'
import { add, axes, dot, drawnAt as clipDrawnAt, onFloor as clipOnFloor, fromBody, inBody, rootIn as clipRootIn, scaled, segmentOf, spotIn as clipSpotIn, sub, type Held as Spot, type Offsets } from './motion3d.clip.ts'

// A clip's two offsets (Offsets, the header): metres in its point's frame, degrees, and the normal of
// what it was measured against.
export type { Offsets }
export type Stick = 'forward' | 'back' | 'across' | 'none'
export type Motion = { target?: 'point' | 'line' | 'spline' | 'plane' | 'triangles'; behavior?: 'move' | 'jump'; clips: string[]; press?: string; stick?: Stick; from?: string[]; when?: string[]; then?: string; over?: string; carry?: string }
// How the body carries a prop (Carries, the header): the prop set by one of its points against a bone,
// and the limbs that reach points of it.
export type Carry = {
  prop: string
  anchor: { bone: string; at: number[]; turn: number[]; point: string }
  limbs: { bones: [string, string, string]; target: string; pole: number[] }[]
}
export type Activity = { normal?: number[]; motions: Record<string, Motion> }
export type File = { rig: string; moves: number; turns: number; carries?: Record<string, Carry>; activities: Record<string, Activity> }
export type Baked = { held: Record<string, Spot>; offsets: Record<string, Record<string, Offsets>> }
export type Held = { ended: boolean; stopped: boolean; clip: string }
// A limb bent onto its point this step (`reachesOf`): the bone it ends in, its chain of three bones by
// name, its pole, and where its end bone reaches, in the body's frame (x left, y up, z ahead, from the
// root): `at` [x, y, z] metres and `turn` [x, y, z, w] the end bone's turn as the clip has it, and
// `weight`, how much of it is pinned.
export type Reach = { bone: string; bones: [string, string, string]; pole: number[]; at: number[]; turn: number[]; weight: number }
// A space's point placed in the world: metres, and `yaw` the facing a body takes on it, radians (yaw θ
// faces (sin θ, cos θ)); a plane's `u` and `v` its two axes, unit vectors, along its `size`.
// `normal`, when the point gives one, the way it faces out, a unit vector.
export type Constraint =
  | { point: { at: number[]; yaw: number; normal?: number[] } }
  | { line: { from: number[]; to: number[]; yaw: number; normal?: number[] } }
  | { spline: { points: number[][]; yaw: number; normal?: number[] } }
  | { plane: { at: number[]; u: number[]; v: number[]; size: number[]; yaw: number; normal?: number[] } }
  | { triangles: { yaw?: number; normal?: number[] } }
export type Space = { id: number; activities: string[]; priority?: number; data?: { motion3d?: { autoChange?: boolean }; [plugin: string]: unknown }; points?: Record<string, Constraint>; holds: boolean; far: number }
export type Spaces = (w: W, at: number[]) => Space[]
export type Kind = Body & { motion: string; baked: string }
export type Numbers = { kinds: Record<string, Kind>; anywhere: Anywhere; ease?: number; still: number }

// The priority of a space that gives none.
const OFFERED = 1
const DEG = Math.PI / 180
const UP = [0, 1, 0]
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))

const kindOf = (me: Row): string => (typeof me.data.as === 'string' ? me.data.as : me.kind)

function kindNumbers(w: W, me: Row): Kind {
  const k = (w.world.motion3d as Numbers | undefined)?.kinds?.[kindOf(me)]
  if (!k) throw new Error(`motion3d has no kind ${kindOf(me)}: world.motion3d.kinds names none`)
  return k
}

// The anywhere shape (`world.motion3d.anywhere`): a box at the middle of the world holding every point,
// under every other shape, its activities the ones a body has everywhere.
export type Anywhere = { shape: { box: { size: number[] } }; activities: string[]; priority: number; data?: Space['data'] }
export function anywhereShape(w: W): Anywhere {
  const a = (w.world.motion3d as Numbers | undefined)?.anywhere
  if (!a?.activities?.length) throw new Error('motion3d: world.motion3d.anywhere names no activities')
  return a
}
export const anywhere = (_me: Row, w: W): string[] => anywhereShape(w).activities

// The fields motion3d keeps on a row, filled the first time it moves it: the first activity of its
// `anywhere`, nothing else yet; kinematics3d's beside them (its `fill`).
function fill(me: Row, w: W) {
  const d = me.data
  fillBody(me)
  fillPlay(d)
  if (d.activity == null) d.activity = anywhere(me, w)[0]
  for (const k of ['motion', 'space', 'root', 'along', 'eased', 'tilt', 'upperMotion', 'upperActivity', 'upperSpace']) d[k] ??= null
  d.stopped ??= false
  d.offered ??= []
  d.lookAround ??= []
  d.previousLookAround ??= []
}
const fileOf = (w: W, me: Row): File => json(w, kindNumbers(w, me).motion)
const bakedOf = (w: W, me: Row): Baked => json(w, kindNumbers(w, me).baked)

export function activityOf(w: W, me: Row, word: string): Activity {
  const a = fileOf(w, me).activities[word]
  if (!a) throw new Error(`motion3d: ${kindOf(me)}'s motion3d file has no activity ${word}`)
  return a
}

export const motionOf = (a: Activity, name: string | null): Motion | undefined => (name === null ? undefined : a.motions[name])

const rank = (s: Space) => s.priority ?? OFFERED

// Every space, and of them those that hold the body, in the order an offer looks through them.
function spacesOf(me: Row, w: W): { all: Space[]; here: Space[] } {
  const spaces = mod<Spaces>(w.world, 'motion3d', 'spaces')
  const all = spaces ? spaces(w, me.data.pos) : []
  return { all, here: all.filter(s => s.holds).sort((a, b) => rank(b) - rank(a) || a.far - b.far || a.id - b.id) }
}

export const holding = (me: Row, w: W): Space[] => spacesOf(me, w).here

// ---------------------------------------------------------------- held to a point

// The rig, the body and the moves and turns a row is measured by (`motion3d.clip.ts`).
const measured = (w: W, me: Row) => {
  const kind = animKind(me)
  return { rig: rigOf(w, kind), body: numbersOf(w, kind).model, anim: movesOf(w, kind) }
}

// Where a segment's start stands in the body's frame `t` seconds into `clip`, as it is drawn.
function drawnAt(w: W, me: Row, seg: string, clip: string, t: number): number[] {
  const { rig, body, anim } = measured(w, me)
  return clipDrawnAt(rig, body, anim, clip, seg, t)
}

// A clip's offsets for the row's body (Offsets, the header), from the baked file; none throws, naming it.
const offsetsOf = (w: W, me: Row, clip: string): Offsets => {
  const { body } = measured(w, me)
  const o = bakedOf(w, me).offsets[body]?.[clip]
  if (!o) throw new Error(`motion3d: the baked file has no offsets of ${clip} for ${body}: bake it (motion3d.offsets.ts)`)
  return o
}

// The bones of a clip's spot, from the baked file; none for the root.
function spotOf(w: W, me: Row, clip: string): string[] {
  const h = bakedOf(w, me).held[clip]
  if (!h) throw new Error(`motion3d: the baked file has no held of ${clip}: bake it (motion3d.offsets.ts)`)
  return h.spot ?? []
}

// Where the root stands `t` seconds into `clip`, in the clip's frame at its start, and how far it has
// turned (`motion3d.clip.ts`'s `rootIn`).
const rootIn = (w: W, me: Row, clip: string, t: number) => clipRootIn(measured(w, me).rig, movesOf(w, animKind(me)), clip, t)

// Where the clip's spot stands `t` seconds into `clip`, in the clip's frame at its start.
function spotIn(w: W, me: Row, clip: string, t: number): number[] {
  const { rig, body, anim } = measured(w, me)
  return clipSpotIn(rig, body, anim, clip, spotOf(w, me, clip), t)
}

// How far the spot's bones stand from their middle at the clip's start along the world direction `dir`
// (a unit vector), the body turned `turn`, the most of either way: how far short of a line's or a plane's
// edge their middle must stay as the body comes onto it.
function reachOf(w: W, me: Row, clip: string, turn: Turn, dir: number[]): number {
  const bones = spotOf(w, me, clip)
  if (!bones.length) return 0
  const drawn = bones.map(b => turned(turn, drawnAt(w, me, segmentOf(b), clip, 0)))
  const mid = [0, 1, 2].map(i => drawn.reduce((s, p) => s + p[i], 0) / drawn.length)
  return Math.max(...drawn.map(p => Math.abs(dot(sub(p, mid), dir))))
}

const pointOf = (space: Space | undefined, name: string): Constraint => {
  const c = space?.points?.[name]
  if (!c) throw new Error(`motion3d holds the body to ${name}, which the space ${space?.id} has no point of`)
  return c
}

// Whether a clip has the feet on the floor at the frame its spot is on its point (`motion3d.clip.ts`'s
// `onFloor`).
function onFloor(w: W, me: Row, clip: string): boolean {
  const { rig, body } = measured(w, me)
  return clipOnFloor(rig, body, clip, spotOf(w, me, clip), bakedOf(w, me).held[clip].on)
}

// A constraint's own numbers, under whichever word it is.
const dataOf = (c: Constraint) => Object.values(c)[0] as { yaw: number; normal?: number[] }

// The up a body is held to on a constraint (Held to a point, the header): its activity's `normal`, else
// the constraint's, else straight up.
const upOf = (w: W, me: Row, c: Constraint): number[] => activityOf(w, me, me.data.activity).normal ?? dataOf(c).normal ?? UP

// A constraint's frame (Offsets, the header): `motion3d.clip.ts`'s `axes` of its facing and its up.
function axesOf(w: W, me: Row, c: Constraint): { x: number[]; y: number[]; z: number[] } {
  return axes(dataOf(c).yaw, upOf(w, me, c))
}

// An offset [x, y, z] in a constraint's frame from its place `at`, in the world.
function inFrame(w: W, me: Row, c: Constraint, at: number[], o: number[]): number[] {
  const { x, y, z } = axesOf(w, me, c)
  return [0, 1, 2].map(i => at[i] + x[i] * o[0] + y[i] * o[1] + z[i] * o[2])
}

// How a body is turned on a constraint for `clip` (Tilt, the header): its facing, and the tilt that lays
// the normal the clip was measured against, turned with the body, onto the constraint's up; null for none.
type Turn = { yaw: number; tilt: Quaternion | null }
function turnOf(w: W, me: Row, c: Constraint, clip: string): Turn {
  const o = offsetsOf(w, me, clip)
  // The way the body faces on a target whose ways span the ground, as kinematics3d's `move` turned it,
  // else the target's own.
  const yaw = (me.data.facing ?? dataOf(c).yaw) + o.beginTurn * DEG
  const n = upOf(w, me, c)
  const m = fromBody(yaw, o.normal ?? UP)
  const tilt = new Quaternion().setFromUnitVectors(new Vector3(m[0], m[1], m[2]).normalize(), new Vector3(n[0], n[1], n[2]))
  return { yaw, tilt: 1 - Math.abs(tilt.w) < 1e-9 ? null : tilt }
}

// A vector in the frame of a body turned `turn` (x left, y up, z ahead), in the world.
function turned(turn: Turn, v: number[]): number[] {
  const f = fromBody(turn.yaw, v)
  if (!turn.tilt) return f
  const p = new Vector3(f[0], f[1], f[2]).applyQuaternion(turn.tilt)
  return [p.x, p.y, p.z]
}

// The tilt a row carries, [x, y, z, w], or null.
const tiltOf = (q: Quaternion | null): number[] | null => (q ? [q.x, q.y, q.z, q.w] : null)

// Where a body coming onto a constraint is on it: the clip begun where the root stands, the body facing as
// it takes the constraint, the place on it nearest where its spot would stand less its `beginOffset`.
// Kept short of its edges (`kept`). With no clip, the place nearest the root.
function onto(w: W, me: Row, c: Constraint, clip: string | undefined, root = false): Place {
  const d = me.data
  if (clip === undefined || root) return nearestOn(w, c as Target, d.pos, me)
  const spot = add(d.pos, turned(turnOf(w, me, c, clip), spotIn(w, me, clip, 0)))
  const target = sub(spot, inFrame(w, me, c, [0, 0, 0], offsetsOf(w, me, clip).beginOffset))
  return kept(w, me, c, clip, nearestOn(w, c as Target, target, me))
}

// The world place of `along` on a constraint (kinematics3d's `at`).
const onIt = (w: W, me: Row, c: Constraint, along: Place): number[] => atOn(w, c as Target, along, me).at

// Where the body stands `t` seconds into `clip`, held to the constraint `c` at its place `along`
// (Offsets, the header): its root, the way it faces and its tilt.
function placing(w: W, me: Row, c: Constraint, along: Place, clip: string, t: number): { pos: number[]; turn: Turn } {
  const r = clipOf(rigOf(w, animKind(me)), clip)
  const o = offsetsOf(w, me, clip)
  const at = onIt(w, me, c, along)
  const turn = turnOf(w, me, c, clip)
  const root = rootIn(w, me, clip, t)
  // What of the root's travel the place carries (`travels`): the travel along the target's ways, which
  // kinematics3d has moved the place by, taken off where the clip stands the root.
  const all = travels(w, me, clip) ? waysOf(w, c as Target, along, me) : []
  const travel = turned(turn, root.at)
  const carried = all.reduce((p, way) => add(p, scaled(way.dir, dot(travel, way.dir))), [0, 0, 0])
  const turnTo = { yaw: turn.yaw + root.turn, tilt: turn.tilt }
  // A move on the triangles stands its root on its place, gone on by the rest of its travel.
  if (rooted(w, me)) return { pos: add(at, sub(travel, carried)), turn: turnTo }
  // The clip's frame at its start, so that its spot stands its `beginOffset` from the point.
  const start = sub(inFrame(w, me, c, at, o.beginOffset), turned(turn, spotIn(w, me, clip, 0)))
  // How far the clip's last frame stands its spot from its `endOffset`, taken off in step with the playhead.
  const off = sub(inFrame(w, me, c, at, o.endOffset), add(start, turned(turn, spotIn(w, me, clip, r.dur))))
  const s = r.dur > 0 ? clamp(t / r.dur, 0, 1) : 0
  return { pos: sub(add(add(start, travel), scaled(off, s)), carried), turn: turnTo }
}

// Whether the body's move plays on `triangles` (its motion's `target`), so stands its root on its place:
// the land's moves are measured from the root on the floor.
function rooted(w: W, me: Row): boolean {
  const d = me.data
  const m = typeof d.activity === 'string' ? motionOf(activityOf(w, me, d.activity), d.motion) : undefined
  return m?.target === 'triangles'
}

// Whether the body's place on its target carries the root's travel of `clip` (The want, the header): a
// one-shot its motion moves by `move` (none named), whose travel kinematics3d moves the place along the
// target's ways by, walls and edges stopping it; the rest of its travel the body is placed by.
function travels(w: W, me: Row, clip: string): boolean {
  if (clipOf(rigOf(w, animKind(me)), clip).loop) return false
  const m = typeof me.data.activity === 'string' ? motionOf(activityOf(w, me, me.data.activity), me.data.motion) : undefined
  return (m?.behavior ?? 'move') === 'move'
}

// How far `clip` carries the root along a target's ways from `t0` seconds in to `t1`, the body turned
// `turn`: one number to each way, metres.
function carriedBy(w: W, me: Row, c: Constraint, clip: string, t0: number, t1: number): number[] {
  const turn = turnOf(w, me, c, clip)
  const moved = sub(turned(turn, rootIn(w, me, clip, t1).at), turned(turn, rootIn(w, me, clip, t0).at))
  return waysOf(w, c as Target, me.data.along, me).map(way => dot(moved, way.dir))
}

// The body placed `t` seconds into `clip`, held to the constraint `c` (the header).
function place(w: W, me: Row, c: Constraint, clip: string, t: number) {
  const d = me.data
  const { pos, turn } = placing(w, me, c, d.along, clip, t)
  d.pos = pos
  d.yaw = turn.yaw
  d.tilt = tiltOf(turn.tilt)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// A place on a target kept short of its edges by how far the spot's bones reach along each of its ways
// (kinematics3d's `ways`), for a body facing as it takes the constraint for `clip`. A way too short for
// the bones keeps them at its middle.
function kept(w: W, me: Row, c: Constraint, clip: string, along: Place): Place {
  const turn = turnOf(w, me, c, clip)
  const all = waysOf(w, c as Target, along, me)
  const at = parts(along).map((v, i) => {
    const { dir, lo, hi } = all[i]
    const r = Math.min(reachOf(w, me, clip, turn, dir), (hi - lo) / 2)
    return clamp(v, lo + r, hi - r)
  })
  return joined(at, along)
}

// Where each of the spot's bones stands along the world direction `dir` (a unit vector) from `from`,
// `t` seconds into the clip, the body placed at `along` (`placing`): the least and the most. With no
// bone named, the place `along` itself.
function spreadAt(w: W, me: Row, c: Constraint, along: Place, clip: string, t: number, from: number[], dir: number[]): number[] {
  const bones = spotOf(w, me, clip)
  if (!bones.length) {
    const at = dot(sub(onIt(w, me, c, along), from), dir)
    return [at, at]
  }
  const { pos, turn } = placing(w, me, c, along, clip, t)
  const at = bones.map(b => dot(sub(add(pos, turned(turn, drawnAt(w, me, segmentOf(b), clip, t))), from), dir))
  return [Math.min(...at), Math.max(...at)]
}

// Whether a place on one way of a target, moved from `was` to `want`, keeps every bone of the spot within
// that way's bounds `[lo, hi]` from `from`, as the clip has the bones `t` seconds in: a move that would
// carry one past a bound, outward, does not. The `move` behavior asks it (`motion3d.kinematics3d.ts`).
export function fits(w: W, me: Row, c: Constraint, clip: string, t: number, from: number[], dir: number[], was: number, want: number, moved: Place, lo: number, hi: number): boolean {
  if (want === was) return true
  const [a, b] = spreadAt(w, me, c, moved, clip, t, from, dir)
  return want > was ? b <= hi : a >= lo
}

// How far a lap of a looping clip carries its spot, in the body's frame (x left, y up, z ahead): its
// measured travel across the ground, and how far the clip draws the spot on from its first frame to its
// last.
function lapOf(w: W, me: Row, clip: string): number[] {
  const r = clipOf(rigOf(w, animKind(me)), clip)
  return add([r.measure.left * r.scale, 0, r.measure.forward * r.scale], sub(spotIn(w, me, clip, r.dur), spotIn(w, me, clip, 0)))
}

// The way a clip goes as the stick points, [x right, y forward], a unit vector: across for its travel to
// the left or the right, forward for ahead or up; none for a clip that goes nowhere.
function wayOf(w: W, me: Row, clip: string): number[] {
  const lap = lapOf(w, me, clip)
  const way = [-lap[0], lap[1] + lap[2]]
  const m = math.hypot(way[0], way[1])
  return m > 1e-9 ? [way[0] / m, way[1] / m] : [0, 0]
}

// How hard the stick pushes the way a clip goes: 0 to 1.
const push = (w: W, me: Row, clip: string, stick: number[]) => {
  const way = wayOf(w, me, clip)
  return Math.max(0, Math.min(1, stick[0] * way[0] + stick[1] * way[1]))
}

// A looping clip's place on its target moved on by kinematics3d (the header), by the `move` behavior
// wrapping it (`motion3d.kinematics3d.ts`). The want, in the world: on a target whose ways span the
// ground, the stick's way (the row's `want`) at the clip's lap speed; on any other, how far a lap carries
// its spot a second at the clip's own rate, as hard as the stick pushes the way the clip goes. `move` lays
// it along the target's ways and makes no move that stops at an edge or carries a bone of the spot past
// one. The clip plays at the rate kinematics3d moved the body, its share of the lap's own speed (a clip
// that travels none at its own); `pushed` whether the stick pushed it at all, `stopped` when it did and
// the body went nowhere, and `speed` how fast it went along the target, m/s.
function slide(w: W, me: Row, c: Constraint, clip: string, dt: number, stick: number[]): { pushed: boolean; stopped: boolean; rate: number; speed: number } {
  const d = me.data
  const r = clipOf(rigOf(w, animKind(me)), clip)
  const all = waysOf(w, c as Target, d.along, me)
  const turn = turnOf(w, me, c, clip)
  const full = all.length ? scaled(turned(turn, lapOf(w, me, clip)), r.rate / r.dur) : [0, 0, 0]
  const fast = math.hypot(full[0], full[1], full[2])
  if (!(fast > 1e-9)) {
    // A clip that goes nowhere: the body's step all the same, held where it is, so kinematics3d asks what
    // holds it up.
    d.along = moveOn(w, { move: c }, d.along, [0, 0, 0], dt, me)
    return { pushed: false, stopped: false, rate: 1, speed: 0 }
  }
  const across = spans(all)
  const p = across ? Math.min(1, math.hypot(d.want[0], d.want[1])) : push(w, me, clip, stick)
  const want = across ? [d.want[0] * fast, 0, d.want[1] * fast] : scaled(full, p)
  const was = parts(d.along)
  d.along = moveOn(w, { move: c }, d.along, want, dt, me)
  // How far the body went along the target this step, and how far the full lap's speed goes along it.
  const now = parts(d.along)
  const went = math.hypot(...now.map((v, i) => v - was[i]))
  const along = across ? fast : math.hypot(...all.map(way => dot(full, way.dir)))
  const rate = along > 1e-9 ? went / (along * dt) : p
  return { pushed: p > 0, stopped: p > 0 && went === 0, rate, speed: went / dt }
}

// ---------------------------------------------------------------- the activities

// The body's place as it stands, [x, y, z, yaw], and its tilt after when it has one.
const placed = (d: any): number[] => [d.pos[0], d.pos[1], d.pos[2], d.yaw, ...(d.tilt ?? [])]

// The share the clip coming in is drawn at: its `blend` while a crossfade runs, else the whole.
const share = (d: any): number => (d.from != null ? d.blend : 1)

// The place the clip fading out stands the root at, kept as the clip itself is kept: taken from where
// the body stands when the clip it plays is at full weight, or when nothing was eased; while a crossfade
// runs, the clip it fades from is kept, and so is its place kept (Easing, the header).
function easeFrom(d: any, to: number[] | null) {
  const from = d.eased === null || d.eased === undefined || share(d) >= 1 ? placed(d) : d.eased.from
  d.eased = { from, to }
}

// The root eased from where the clip fading out stood it to where the clip coming in has it, at the
// share the one coming in is drawn by; once that is whole, nothing is eased.
function ease(d: any) {
  if (!d.eased) return
  const t = share(d)
  if (t >= 1) {
    d.eased = null
    return
  }
  const [x, y, z, yaw, ...tilt] = d.eased.from
  d.pos = [x + (d.pos[0] - x) * t, y + (d.pos[1] - y) * t, z + (d.pos[2] - z) * t]
  d.yaw = yaw + wrap(d.yaw - yaw) * t
  const was = tilt.length ? new Quaternion(tilt[0], tilt[1], tilt[2], tilt[3]) : new Quaternion()
  const now = d.tilt ? new Quaternion(d.tilt[0], d.tilt[1], d.tilt[2], d.tilt[3]) : new Quaternion()
  const q = was.slerp(now, t)
  d.tilt = 1 - Math.abs(q.w) < 1e-9 ? null : tiltOf(q)
}

// The space the body's activity is offered by, or undefined for its `anywhere`.
const spaceOf = (me: Row, w: W): Space | undefined => spacesOf(me, w).all.find(s => s.id === me.data.space)

// What a move of `clip` plays against (Targets, the header): the triangles beneath the body for a move on
// `triangles`, or on a `plane` with the clip's feet on the floor, facing as the body does less the clip's `beginTurn`, held to the ground's up where the
// clip's feet are on it (where the clip starts them, or, for one on it at its end, where it ends them, as
// it plays from where the body stands); else the one point of the move's `target` kind the space has, by
// its name; none for a move with no `target`.
function rootFor(w: W, me: Row, space: Space | undefined, m: Motion, clip: string): string | Constraint | null {
  if (!m.target) return null
  if (m.target === 'triangles' || (m.target === 'plane' && onFloor(w, me, clip))) {
    const d = me.data
    const facing = d.yaw - offsetsOf(w, me, clip).beginTurn * DEG
    const end = onFloor(w, me, clip) && bakedOf(w, me).held[clip].on === 'end'
    const spot = add(d.pos, fromBody(facing, spotIn(w, me, clip, end ? clipOf(rigOf(w, animKind(me)), clip).dur : 0)))
    const under: Target = { triangles: {} }
    const { normal } = atOn(w, under, nearestOn(w, under, spot, me), me)
    return { triangles: { yaw: facing, normal } }
  }
  const names = Object.entries(space?.points ?? {}).filter(([, c]) => Object.keys(c)[0] === m.target).map(([name]) => name)
  if (names.length !== 1) throw new Error(`motion3d plays a move against the ${m.target} of the space ${space?.id}, which has ${names.length} of them: ${names.join(', ') || 'none'}`)
  return names[0]
}

// The target the body is held to now: its space's point by name, or the triangles beneath it it was handed.
function pointFor(me: Row, w: W): Constraint {
  const root = me.data.root
  return typeof root === 'string' ? pointOf(spaceOf(me, w), root) : root
}

// Whether the stick points the way a move asks (`stick`): `forward` pushed ahead, `back` pulled back,
// `across` pushed left or right, `none` let go; any way for a move that asks none.
function stickOk(m: Motion, stick: number[]): boolean {
  switch (m.stick) {
    case undefined: return true
    case 'forward': return stick[1] > 0
    case 'back': return stick[1] < 0
    case 'across': return stick[0] !== 0
    case 'none': return stick[0] === 0 && stick[1] === 0
  }
}

// Whether every state a move's `when` names is true of the body (kinematics3d's `is`), a word written
// `!word` that it is not.
const whenOk = (w: W, me: Row, m: Motion): boolean => (m.when ?? []).every(word => (word.startsWith('!') ? !is(me, w, word.slice(1)) : is(me, w, word)))

// Whether a move may follow the one the body plays or the one its upper half plays: any for a move with
// no `from`.
const fromOk = (me: Row, m: Motion): boolean => !m.from || m.from.includes(me.data.motion) || m.from.includes(me.data.upperMotion)

// Of a move's clips, the one that goes the way the stick pushes hardest; its first when none goes that way.
function toward(w: W, me: Row, m: Motion, stick: number[]): string {
  let best = m.clips[0], most = 0
  for (const c of m.clips) {
    const p = push(w, me, c, stick)
    if (p > most) { most = p; best = c }
  }
  return best
}

// The move `name` of the activity `activity` of the space `space` (null for the body's `anywhere`)
// played: its clip `clip`, or the one that goes the way the stick pushes. A move with no clips hands the
// body back to walking.
function begin(me: Row, w: W, activity: string, space: number | null, name: string, stick: number[], clip?: string) {
  const d = me.data
  const m = motionOf(activityOf(w, me, activity), name)
  if (!m) throw new Error(`motion3d's activity ${activity} has no motion ${name}`)
  if (!m.clips.length) return leave(me, w)
  const s = space === null ? undefined : spacesOf(me, w).all.find(s => s.id === space)
  if (space !== null && !s) throw new Error(`motion3d plays ${activity} in the space ${space}, which is gone`)
  const chosen = clip ?? toward(w, me, m, stick)
  d.layer = null
  // Handed from a space's point to the triangles: its place is where its feet are, and kinematics3d
  // stands it there or lets it fall.
  const was = d.root
  const root = rootFor(w, me, s, m, chosen)
  const handed = d.space !== space && root !== null && typeof root !== 'string' && typeof was === 'string' && d.clip != null
  const feet = handed ? underFeet(w, me, d.clip, d.clipT).slice(0, 3) : null
  if (d.activity !== activity || d.space !== space) {
    if (space !== null && d.space !== space) d[readsOf(w, animKind(me)).vel] = [0, 0, 0]
    d.activity = activity
    d.space = space
    d.stopped = false
  }
  // The triangles beneath it it was handed keep its place from one move on them to the next; a point of
  // a space is come onto afresh.
  const kept = root !== null && typeof root !== 'string' && was !== null && typeof was !== 'string'
  if (!kept && root !== was) d.along = null
  if (typeof root !== 'string' || root !== was) d.facing = null
  d.root = root
  if (root !== null && d.along === null) d.along = feet ?? onto(w, me, pointFor(me, w), chosen, m.target === 'triangles')
  if (d.motion === name && d.clip === chosen && d.state === 'act') return
  d.motion = name
  easeFrom(d, null)
  playClip(me, chosen)
  if (root !== null) place(w, me, pointFor(me, w), chosen, 0)
  ease(d)
}

// Where the body stands under its feet as `clip` has them `t` seconds in: the root raised to the lower
// of its toes' tips.
function underFeet(w: W, me: Row, clip: string, t: number): number[] {
  const d = me.data
  const floor = Math.min(ends(w, me, 'footL', { clip, clipT: t })[4], ends(w, me, 'footR', { clip, clipT: t })[4])
  return [d.pos[0], d.pos[1] + floor, d.pos[2], d.yaw]
}

// One step of a body on its target (One held path, the header): its clip run a step; its place moved
// along the target by kinematics3d, by the motion's behavior: a loop as hard as the stick pushes its way
// and played at the rate it went (`slide`), a one-shot by `move` as far as its travel carries it along
// the target's ways, one by another behavior (`jump`) at the stick's way at the speed it goes across the
// ground; then placed there by its clip's offsets. A body with no target is played where it stands.
function advance(me: Row, w: W, dt: number, stick: number[]): { ended: boolean; clip: string } {
  const d = me.data
  const clip: string = d.clip
  const r = clipOf(rigOf(w, animKind(me)), clip)
  const t0: number = d.clipT
  animated(me, w, dt)
  const ended = d.state !== 'act'
  if (d.root !== null) {
    const c = pointFor(me, w)
    const m = typeof d.activity === 'string' ? motionOf(activityOf(w, me, d.activity), d.motion) : undefined
    const behavior = m?.behavior ?? 'move'
    if (!ended && r.loop) {
      // Stopped at an edge stays stopped until the stick pushes another way.
      if (d.stopped && (stick[0] !== 0 || stick[1] !== 0) && !(dot([...stick, 0], [...d.stopped, 0]) > 0)) d.stopped = false
      const slid = slide(w, me, c, clip, dt, stick)
      // At rest (kinematics3d's), a loop whose lap carries the body nowhere (an idle: less than the
      // motion3d file's `moves`, the distance that counts as travel) plays on at its own rate; one that
      // carries it (a climb) holds still, at the rate the place went.
      const lap = lapOf(w, me, clip)
      const nowhere = math.hypot(lap[0], lap[1], lap[2]) <= movesOf(w, animKind(me)).moves
      d.rate = nowhere && is(me, w, 'rest') ? 1 : slid.rate
      // Stopped where it was pushed and went nowhere; no longer once its place moves.
      if (slid.stopped) d.stopped = stick.slice()
      else if (slid.speed > 0) d.stopped = false
      d.speed = slid.speed
    } else if (behavior === 'move') {
      // A one-shot carried along the target's ways as far as its travel goes this step.
      const was = parts(d.along)
      const by = ended ? waysOf(w, c as Target, d.along, me).map(() => 0) : carriedBy(w, me, c, clip, t0, d.clipT)
      d.along = moveOn(w, c as Target, d.along, by.map(v => v / dt), dt, me)
      d.speed = math.hypot(...parts(d.along).map((v, i) => v - was[i])) / dt
    } else {
      const speed = math.hypot(d.vel[0], d.vel[2])
      d.along = moveOn(w, { [behavior]: c }, d.along, [d.want[0] * speed, 0, d.want[1] * speed], dt, me)
    }
    place(w, me, c, clip, ended ? r.dur : d.clipT)
  }
  if (!ended) ease(d)
  return { ended, clip }
}

// ---------------------------------------------------------------- the stack

// A shape holding the body (The stack, the header): a space, or the anywhere shape (`id` null); its
// rank, whether a body takes up its activities with no key (`data.motion3d.autoChange`), and the
// activities it offers.
type Shape = { id: number | null; rank: number; auto: boolean; activities: string[] }
type Part = 'body' | 'upper'
// A motion found: its activity, the shape it is in, its name.
type Found = { word: string; space: number | null; name: string }

// Every shape holding the body, best ranked first, the anywhere shape last; with `kept`, the station the
// body is in beside them while it stands, its point maybe outside it (a seat beside its desk).
function stackOf(me: Row, w: W, kept = false): Shape[] {
  const a = anywhereShape(w)
  const { all, here } = spacesOf(me, w)
  const mine = kept ? all.find(s => s.id === me.data.space && !here.includes(s)) : undefined
  const spaces = mine ? [...here, mine].sort((p, q) => rank(q) - rank(p) || p.far - q.far || p.id - q.id) : here
  return [
    ...spaces.map(s => ({ id: s.id, rank: rank(s), auto: s.data?.motion3d?.autoChange === true, activities: s.activities })),
    { id: null, rank: a.priority, auto: a.data?.motion3d?.autoChange === true, activities: a.activities },
  ]
}

// The shape `id` while it holds the body; undefined once it does not.
const shapeOf = (me: Row, w: W, id: number | null): Shape | undefined => stackOf(me, w).find(s => s.id === id)

// Whether a motion describes the situation: its `when` and its `stick` hold.
const describes = (w: W, me: Row, m: Motion, stick: number[]): boolean => stickOk(m, stick) && whenOk(w, me, m)

// The first motion of `part` (one over the body for the upper half, else one of the whole body) that
// takes no key, may follow what the body plays and describes the situation, through every shape holding
// the body that takes up its activities with no key, best ranked first, down to the anywhere shape.
function search(me: Row, w: W, part: Part, stick: number[]): Found | undefined {
  for (const s of stackOf(me, w)) {
    if (!s.auto) continue
    for (const word of s.activities) {
      for (const [name, m] of Object.entries(activityOf(w, me, word).motions)) {
        if (!!m.over !== (part === 'upper') || m.press || !fromOk(me, m) || !describes(w, me, m, stick)) continue
        return { word, space: s.id, name }
      }
    }
  }
  return undefined
}

// When nothing fits (`fill`): the anywhere shape's first activity, its first motion of the whole body.
function filled(me: Row, w: W): Found {
  const word = anywhere(me, w)[0]
  const name = Object.entries(activityOf(w, me, word).motions).find(([, m]) => !m.over)?.[0]
  if (name === undefined) throw new Error(`motion3d's activity ${word} has no motion of the whole body`)
  return { word, space: null, name }
}

// The rank of the shape a found motion is in.
const rankOf = (me: Row, w: W, f: Found): number => shapeOf(me, w, f.space)?.rank ?? anywhereShape(w).priority

// Of a move's clips on a shape that takes it up with no key, the one that goes the way the body is
// walked, in its own frame [right, forward].
function walked(w: W, me: Row, m: Motion): string {
  const b = inBody(me.data.yaw, [me.data.want[0], 0, me.data.want[1]])
  return toward(w, me, m, [-b[0], b[2]])
}

// The body handed to what the stack holds it in: the search, else `fill`.
function leave(me: Row, w: W, stick: number[] = [0, 0]) {
  const next = search(me, w, 'body', stick) ?? filled(me, w)
  begin(me, w, next.word, next.space, next.name, stick, walked(w, me, motionOf(activityOf(w, me, next.word), next.name)!))
}

// The motion of the whole body (A motion ends, the header), after its step. In a shape a key put it in
// (one that takes nothing up with no key, a station), as that activity has it: a one-shot played out,
// its `then`, else the stack; a loop, the first move of its activity with no `press` and a `stick` or a
// `when`, that may follow it and whose stick and states hold. Anywhere else: a one-shot plays through,
// then its `then`, else the stack; a loop is over once its shape no longer holds the body, its
// description stops being true, or, as its clip comes round, a higher ranked shape holding the body has a
// motion of the whole body that fits, and is followed by its `then`, else the stack; else it plays on, its
// clip the one that goes the way the body is walked.
function select(me: Row, w: W, h: { ended: boolean; clip: string }, stick: number[], lapped: boolean) {
  const d = me.data
  const a = activityOf(w, me, d.activity)
  const cur = motionOf(a, d.motion)
  const here = shapeOf(me, w, d.space)
  const loop = clipOf(rigOf(w, animKind(me)), h.clip).loop
  const then = (name: string): Found => ({ word: d.activity, space: d.space, name })
  // A station is held to as long as it stands (`step` hands the body back once it is gone): its point may
  // stand outside its shape, a seat beside its desk.
  const station = d.space !== null && spaceOf(me, w)?.data?.motion3d?.autoChange !== true
  if (station) {
    if (!loop) {
      if (!h.ended) return
      if (cur?.then) begin(me, w, d.activity, d.space, cur.then, stick)
      else leave(me, w, stick)
      return
    }
    for (const [name, m] of Object.entries(a.motions)) {
      if (m.over || m.press || (!m.stick && !m.when?.length) || !fromOk(me, m) || !describes(w, me, m, stick)) continue
      begin(me, w, d.activity, d.space, name, stick)
      return
    }
    return
  }
  let next: Found | undefined
  if (!cur) next = search(me, w, 'body', stick) ?? filled(me, w)
  else if (!loop) {
    if (!h.ended) return
    next = cur.then ? then(cur.then) : search(me, w, 'body', stick) ?? filled(me, w)
  } else {
    const higher = lapped && here ? search(me, w, 'body', stick) : undefined
    const over = !here || !describes(w, me, cur, stick) || (higher !== undefined && rankOf(me, w, higher) > here.rank)
    if (over) next = cur.then ? then(cur.then) : higher ?? search(me, w, 'body', stick) ?? filled(me, w)
  }
  const found = next ?? then(d.motion)
  const m = motionOf(activityOf(w, me, found.word), found.name)!
  if (!m.clips.length) return leave(me, w, stick)
  begin(me, w, found.word, found.space, found.name, stick, walked(w, me, m))
}

export function drive(me: Row, w: W, dt: number, stick: number[]) {
  const d = me.data
  step(me, w)
  if (d.motion === null || d.clip == null) leave(me, w, stick)
  const t0: number = d.clipT
  const h = advance(me, w, dt, stick)
  select(me, w, h, stick, clipOf(rigOf(w, animKind(me)), h.clip).loop && d.clipT < t0)
  upper(me, w, dt, stick)
}

// The motion `name` of the activity `word` of the shape `space` played on the upper half (Over, the
// header): one of its clips, picked on the die; with none, nothing played over the body, held while it
// carries, else the upper half let go.
function overBegin(me: Row, w: W, f: Found) {
  const d = me.data
  const m = motionOf(activityOf(w, me, f.word), f.name)!
  d.upperActivity = f.word
  d.upperSpace = f.space
  if (!m.clips.length) {
    under(me)
    d.upperMotion = m.carry !== undefined ? f.name : null
    if (d.upperMotion === null) d.upperActivity = d.upperSpace = null
    return
  }
  over(me, m.clips[Math.floor(w.die() * m.clips.length)], m.over!)
  d.upperMotion = f.name
}

// One step of the upper half (Over, A motion ends, the header): a one-shot played out, its `then`, else
// the stack; a loop or a held motion with no clips is over once its shape no longer holds the body, its
// description stops being true, or a higher ranked shape holding the body has a motion over it that
// fits, and is followed by its `then`, else the stack; with nothing over the body, the stack. Nothing
// found, the upper half is let go.
function upper(me: Row, w: W, dt: number, stick: number[]) {
  const d = me.data
  const m = d.upperMotion === null ? undefined : motionOf(activityOf(w, me, d.upperActivity), d.upperMotion)
  const ended = overStep(me, w, dt, !!m?.then).ended
  let next: Found | undefined
  if (m) {
    const then = m.then ? { word: d.upperActivity, space: d.upperSpace, name: m.then } : undefined
    const oneShot = m.clips.length > 0 && !clipOf(rigOf(w, animKind(me)), m.clips[0]).loop
    if (oneShot) {
      if (!ended) return
      next = then ?? search(me, w, 'upper', stick)
    } else {
      const here = shapeOf(me, w, d.upperSpace)
      const higher = search(me, w, 'upper', stick)
      const over = !here || !describes(w, me, m, stick) || (higher !== undefined && rankOf(me, w, higher) > here.rank)
      if (!over) return
      next = then ?? higher
    }
  } else next = search(me, w, 'upper', stick)
  if (next) {
    if (!motionOf(activityOf(w, me, next.word), next.name)?.over) throw new Error(`motion3d's ${d.upperActivity}.${d.upperMotion} is played over the body, and what follows it, ${next.word}.${next.name}, is not`)
    overBegin(me, w, next)
  } else if (m) {
    under(me)
    d.upperMotion = d.upperActivity = d.upperSpace = null
  }
}

// Whether a move played over the body may follow what the body and its upper half play: any but itself
// for one with no `from`.
const overFromOk = (me: Row, name: string, m: Motion): boolean =>
  m.from ? m.from.includes(me.data.motion) || m.from.includes(me.data.upperMotion) : me.data.upperMotion !== name

// A key (Moves, the header): through the shapes holding the body, best ranked first, down to the
// anywhere shape, the first motion with that `press` whose stick and states hold: one over the body that
// may follow what the body and its upper half play; one of the whole body with a `from` that names the
// move the body plays, in any of their activities; one with no `from` in another activity, of a shape
// ranked above the one the body is in.
export function press(me: Row, w: W, key: string, stick: number[]): boolean {
  const d = me.data
  fill(me, w)
  const all = stackOf(me, w, true)
  const at = all.find(s => s.id === d.space)?.rank ?? anywhereShape(w).priority
  for (const s of all) {
    for (const word of s.activities) {
      for (const [name, m] of Object.entries(activityOf(w, me, word).motions)) {
        if (m.press !== key || !describes(w, me, m, stick)) continue
        if (m.over) {
          if (!overFromOk(me, name, m)) continue
          overBegin(me, w, { word, space: s.id, name })
          return true
        }
        const mine = word === d.activity && s.id === d.space
        if (m.from ? !m.from.includes(d.motion) : mine || s.rank <= at) continue
        begin(me, w, word, s.id, name, stick)
        return true
      }
    }
  }
  return false
}


// ---------------------------------------------------------------- the limbs

// Each bone a limb ends in, its chain from the shoulder or the hip, and the limb the bake says when is
// planted (`plantsOf`).
const LIMBS: Record<string, { bones: [string, string, string]; limb: Limb }> = {
  LeftHand: { bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], limb: 'handL' },
  RightHand: { bones: ['RightArm', 'RightForeArm', 'RightHand'], limb: 'handR' },
  LeftFoot: { bones: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], limb: 'footL' },
  RightFoot: { bones: ['RightUpLeg', 'RightLeg', 'RightFoot'], limb: 'footR' },
}

// How much of a limb is pinned `t` seconds into a clip it is planted in over `runs`: whole inside a
// run, eased in over `ease` seconds from the run's start and out over `ease` to its end, except at an
// end that is the clip's own (a one-shot's start or end, a loop held all its lap), where the crossfade
// eases it. A loop's run past its end holds the next lap's start.
function pinned(runs: number[][], t: number, dur: number, loop: boolean, ease: number): number {
  let most = 0
  for (const [a, b] of runs) {
    if (loop && a <= 1e-6 && b >= dur - 1e-6) return 1
    for (const at of loop ? [t, t + dur] : [t]) {
      if (at < a || at > b) continue
      const into = !loop && a <= 1e-6 ? 1 : ease > 0 ? (at - a) / ease : 1
      const out = !loop && b >= dur - 1e-6 ? 1 : ease > 0 ? (b - at) / ease : 1
      most = Math.max(most, clamp(Math.min(into, out), 0, 1))
    }
  }
  return most
}

// The place on a constraint nearest `p`, in the world (kinematics3d's `nearest`, then its `at`).
const nearest = (w: W, me: Row, c: Constraint, p: number[]): number[] => onIt(w, me, c, nearestOn(w, c as Target, p, me))

// The props some carry of the body's motion3d file holds, by their loader model.
export const carriedProps = (from: W, me: Row): string[] => Object.values(fileOf(from, me).carries ?? {}).map(c => c.prop)

// What the body carries this step (Carries, the header): the carry its upper half's move names, at the
// share that move's clip is drawn by, else the carry its body's move names, at its; none.
export function carrying(from: W, me: Row): { carry: Carry; weight: number } | undefined {
  const d = me.data
  if (typeof d.activity !== 'string') return undefined
  const up = typeof d.upperActivity === 'string' ? motionOf(activityOf(from, me, d.upperActivity), d.upperMotion ?? null) : undefined
  const body = motionOf(activityOf(from, me, d.activity), d.motion ?? null)
  const named = up?.carry !== undefined ? { name: up.carry, weight: !up.clips.length ? 1 : d.upper != null ? d.upperW : 0 } : body?.carry !== undefined ? { name: body.carry, weight: share(d) } : undefined
  if (!named || !(named.weight > 0)) return undefined
  const carry = fileOf(from, me).carries?.[named.name]
  if (!carry) throw new Error(`motion3d: ${kindOf(me)}'s motion3d file has no carry ${named.name}`)
  return { carry, weight: named.weight }
}

export function reachesOf(from: W, me: Row): Reach[] {
  const d = me.data
  // A move on the triangles stands its root on its place and pins no limb.
  if (typeof d.activity !== 'string' || d.clip == null || d.root == null || rooted(from, me)) return []
  // The hands and feet of the clip's own spot, each pinned onto the target the body is held to.
  const limbs = spotOf(from, me, d.clip).filter(bone => LIMBS[bone])
  if (!limbs.length) return []
  const ease = (from.world.motion3d as Numbers).ease
  if (typeof ease !== 'number') throw new Error(`motion3d pins the limbs of ${d.activity}.${d.motion} by world.motion3d.ease, which the scene does not give`)
  const target = pointFor(me, from)
  const rig = rigOf(from, animKind(me))
  // The parts the body is drawn by, each at its weight, each pinning only its own spot's limbs.
  const parts = [{ clip: d.clip as string, t: d.clipT as number, w: share(d) }]
  if (d.from != null && share(d) < 1) parts.push({ clip: d.from, t: d.fromT, w: 1 - share(d) })
  const pose = posed(from, me)
  const body: Turn = { yaw: d.yaw, tilt: d.tilt ? new Quaternion(d.tilt[0], d.tilt[1], d.tilt[2], d.tilt[3]) : null }
  // A world direction in the body's frame, its tilt taken off and then its facing.
  const inTurned = (r: number[]) => {
    if (!body.tilt) return inBody(body.yaw, r)
    const v = new Vector3(r[0], r[1], r[2]).applyQuaternion(body.tilt.clone().invert())
    return inBody(body.yaw, [v.x, v.y, v.z])
  }
  const out: Reach[] = []
  for (const bone of limbs) {
    const { bones, limb } = LIMBS[bone]
    const weight = parts.reduce((s, p) => {
      if (!spotOf(from, me, p.clip).includes(bone)) return s
      const c = clipOf(rig, p.clip)
      return s + p.w * pinned(plantsOf(from, me, p.clip)[limb], p.t, c.dur, c.loop, ease)
    }, 0)
    if (!(weight > 0)) continue
    const m4 = pose.get(bone)
    if (!m4) throw new Error(`motion3d bends ${bone}, which ${animKind(me)}'s glb has no joint of`)
    const p = new Vector3(), q = new Quaternion()
    m4.decompose(p, q, new Vector3())
    // The bone as drawn in the world, the nearest place of its point to it, and the reach between.
    const drawn = add(d.pos, turned(body, [p.x, p.y, p.z]))
    const to = nearest(from, me, target, drawn)
    const at = drawn.map((v, i) => v + (to[i] - v) * weight)
    const r = [at[0] - d.pos[0], at[1] - d.pos[1], at[2] - d.pos[2]]
    out.push({ bone, bones, pole: asDrawn(me, from, bone), at: inTurned(r), turn: [q.x, q.y, q.z, q.w], weight })
  }
  return out
}

// A pole that bends a limb the way its clip bends it this step: from the line between its first bone and
// its end to its middle joint, as the body is drawn (`posed`), in the body's frame.
export function asDrawn(me: Row, w: W, bone: string): number[] {
  const chain = LIMBS[bone]
  if (!chain) throw new Error(`motion3d bends no limb ending in ${bone}: ${Object.keys(LIMBS).join(', ')}`)
  const pose = posed(w, me)
  const [a, b, c] = chain.bones.map(n => new Vector3().setFromMatrixPosition(pose.get(n)!))
  const line = c.clone().sub(a)
  const len2 = line.lengthSq()
  const foot = len2 > 0 ? a.clone().addScaledVector(line, b.clone().sub(a).dot(line) / len2) : a
  const out = b.clone().sub(foot)
  return [out.x, out.y, out.z]
}

export function step(me: Row, w: W) {
  const d = me.data
  fill(me, w)
  // Last step's answer kept before this step's is worked out.
  d.previousLookAround = d.lookAround
  const { all, here } = spacesOf(me, w)
  d.lookAround = here
  d.offered = here.flatMap(s => s.activities)
  for (const word of d.offered) activityOf(w, me, word)
  if (d.space !== null) {
    const mine = all.find(s => s.id === d.space)
    // Its space gone: its place on it goes with it, and it is handed back from where its feet are.
    if (!mine) {
      d.root = null
      d.along = null
    }
    if (!mine || (!mine.holds && d.root === null)) leave(me, w)
  }
}
