// walker: a kinematic body on any ground. It has a server half only: a rule calls `walk`, `slide`,
// `seek` and `relative` for its own row, and nothing is drawn here.
//
// Walker's row, `walker` (one `actors` entry, an empty prefab), has no field of its own: its `before`
// runs at the start of every step, ahead of every rule's `tick`, and makes what walker keeps for the
// truth (The ground a truth keeps, and Agents, below). A scene whose kinds walk as agents lists it; any
// other may. The scene's `world.walker.kinds` is the table of the
// kinds whose rows walk, which a child scene inherits from the manager's `world` (`addons/scenemanager`).
// A kind's entry is every number its bodies are tuned by:
//   radius     metres: the body's circle against solids' footprints.
//   height     metres: the body's height, for whatever stands on it.
//   accel      1/s: `vel` eases toward `want` by 1 − exp(−accel·dt) a step.
//   airAccel   1/s: the same rate for a body in the air, off the ground and not sliding: 0 keeps the
//              horizontal speed it left the ground with, a fling or a leap carried all the way; small
//              lets the keys steer it a little. `accel` when absent.
//   turnRate   1/s: `yaw` eases toward its aim by 1 − exp(−turnRate·dt) a step.
//   turnMax    rad/s: the fastest `yaw` turns, so a heavy body swings round at a steady rate and eases
//              in only at the end; no limit when absent.
//   gravity    m/s², downward.
//   jumpH      metres: a jump leaves the ground at √(2·gravity·jumpH).
//   step       metres: the tallest rise a foot takes in one move, and the spread of feet one stand
//              height is taken over.
//   maxSlope   rise over run: the steepest grade climbed.
//   wade       metres: the deepest water walked into.
//   span       metres: the side of the footprint square.
//   probe      metres: how far ahead the slope rule looks for a rise past step.
//   slopeBand  rise over run: a slide starts where the ground is steeper than maxSlope and ends only
//              where it is under maxSlope − slopeBand, so ground whose grade hovers at maxSlope does not
//              turn `grounded` on and off. `check` requires 0 < slopeBand < maxSlope.
//   slide      m/s: the speed a body on steep ground slides down it at.
//   seekSpeed  m/s: the speed `seek` walks at.
//   bodies     the kinds of the table whose bodies are solid to this kind's, or none when absent: each
//              row of one, but the body itself and one `limp` (ragdoll3d's, lying), is a solid circle
//              of its kind's `radius` at its `pos`, asked with the ground's (below).
//   agent      metres: the side of the squares of the map a kind that walks as an agent walks on
//              (Agents, below); absent, the kind walks as the whole body this header describes.
// `walk`, `slide`, `carry` and `seek` look up `w.world.walker.kinds[me.kind]` (the kind a row's `as`
// names, when it names one: a seat's `player` row that is an `xbot` walks as one), and a kind the table
// does not name throws naming it. The table is checked by whichever of those four is asked first
// whenever its content changes, compared as text since the editor edits the scene in place. `check` throws a sentence naming the kind for
// a number that is not finite or out of range (jumpH and wade may be 0, the rest must be above it),
// for `bodies` that is not a list of the table's kinds (or `player`, whose rows walk by their `as`),
// and unless maxSlope·span·√2 < step: a span
// square's corners on a grade g spread by up to g·span·√2 and the centre lies between them, so every
// grade up to maxSlope keeps all five feet within step.
//
// A walking row carries `pos` [x, y, z], `yaw`, `vel` [x, y, z] (m/s), `grounded`, `sliding` (on steep
// ground), `speed` (the horizontal speed it moved at), and `side` and `turned`, which `seek` keeps; its rule sets the
// intents `want` [x, z] (the horizontal velocity it asks for, m/s), `face` (a yaw to turn to, or
// null) and `jump` (true to jump). `pos`, `vel` and `want` are always written as new arrays, never
// element by element, since an actor entry's arrays are the loaded scene's own.
//
// The ground is handed in by the rule, never imported: `{ height(x, z), depth?(x, z),
// solids(x, z, r), footing?(pos, yaw) }`. `height` is the ground a foot stands on, `depth` the water over
// it (none when absent), and `solids` every solid reaching within r of (x, z) (Solids and their
// footprints, below). `footing`, where given, is where a body standing at `pos` facing `yaw` is now that
// the floor under it has moved (shapes3d's moved shapes), or undefined where it has not: `walk` puts a
// grounded body there before it moves it, so a body stands still on a moving floor. A ground with no
// `footing`, terrain's, never moves.
// A game builds it from terrain3d's `heightAt` (or `rawAt` on a flooded place) and `depthAt`, and
// scatter3d's `solids`; a test writes its own. `groundOf(w)` is the ground the scene's mods make
// (`addons/scenemanager`): `world.walker.mods: { height, depth?, cell?, solids?, fixed?, behaviors? }`
// names the plugins that provide each (`terrain3d.walker.ts`, `scatter3d.walker.ts`,
// `shapes3d.walker.ts`); with neither `solids` nor `fixed` there are none, and a scene that names no
// `height` throws. Walker takes its feet itself, so the stand height means the same over any ground.
// `slide`, `carry` and `seek` ask the ground's solids and, beside them, the bodies that reach within r
// of the kinds the body's `bodies` names, read off the rows the rule's `w` holds, each a circle of its
// kind's `radius`, so a body is slid round, stopped at and sought round as a trunk is.
//
// Solids and their footprints. Walker never knows what a solid is: it walks round each by its
// footprint, a convex outline on the ground, its corners in order round it, one for a round thing,
// taken `round` metres wider all round (`Footprint`). A solid names its word by the key its numbers sit
// under, `{ cylinder: { pos, radius, height } }`, and its word's behavior, `(shape) → Footprint`, makes
// its footprint. Walker's own word:
//   cylinder  `{ pos, radius, height? }`: its footprint is the circle `radius` round (pos[0], pos[2]),
//             one corner rounded by `radius`.
// More words come from the plugins `world.walker.mods.behaviors` names, each exporting `behaviors()`,
// `{ <word>: <behavior> }`, laid over walker's own in the list's order: a word one delivers takes the
// place of walker's own of that word, and a later one's takes the place of an earlier one's. The plugin
// that hands walker solids of a word delivers that word's behavior (`plugins/shapes3d`'s `box`, its four
// corners). A solid of a word none of them has throws naming it. One fallback is kept, `fromBare`: a
// solid handed bare, `{ x, z, radius }`, as providers written before solids had words hand them, is the
// cylinder it always was. Nothing past `fromBare` reads a bare solid; a footprint of one corner is
// walked round by the very sums a circle always was.
//
// The ground a truth keeps. `groundOf(w)` makes the ground once for each truth, the first time it is
// asked, and hands back that same ground every step after, made again only when `world.walker.mods`
// changes (the editor edits the scene in place): every mod is found once. On a ground with a `cell`,
// every corner of the lattice is asked of `height` (and `depth`) once for the truth, at (i·cell,
// j·cell), and kept, so a body stands on the same triangles as on a ground asked each call. Solids are
// two kinds: `fixed`, every solid that never moves (a level's walls, scatter3d's trunks, shapes3d's
// shapes), and `solids`, what moves. `world.walker.mods.fixed` names one plugin or a list, each
// `fixed(w, x, z, r)` (`Fixed`) handing back its solids reaching within r of (x, z), as `solids` does;
// the ground's `solids` is every `fixed` plugin's solids, then the `solids` mod's. An agent's map asks `fixed` once a tile
// (Agents, below) and never again. Walker's row makes the ground on the scene's first step, when the
// scene names a `height`, so it is made before any body walks.
//
// Agents. A kind whose entry gives `agent` walks as an agent: a body a crowd is made of, cheap enough to
// walk by the hundred, where the whole body asks the ground dozens of times a step. `walk` walks it so;
// `slide`, `carry` and `seek` are the whole body's for every kind. Its map is the ground as that kind
// reads it, made once and kept for as long as the ground is: squares `agent` metres across, in tiles of
// 32 a side, each tile made the first time a body asks a square of it. A square is open where the whole
// body could stand at its centre (S not steep, by maxSlope; the footprint's water no deeper than
// `wade`), and holds S there. Each tile is handed the footprints of the `fixed` solids reaching within
// `radius` of it, asked once as it is made. One step of an agent:
//   1. `vel` eases toward `want` by 1 − exp(−accel·dt) and `yaw` turns as `walk`'s step 1; `jump` is
//      cleared, never taken.
//   2. The point vel·dt away is pushed out of the fixed footprints of the tile it is in, as the whole
//      body is, so it slides round a trunk or a wall; of the bodies of the kinds its `bodies` names,
//      where they stood as the step began (walker's row files them, so the step's order changes
//      nothing); and of the `solids` mod's footprints, what moves (on a ground `groundOf` did not make,
//      every solid it has).
//   3. It is taken where it stays in the body's square, or reaches an open square no more than `step`
//      above the one the body stands in; otherwise the move along the axis it moves most on alone, then
//      the other, or none. A body in a square that is not open goes anywhere, so it walks out.
//   4. It stands at the height between the four squares' centres round it: each open square within
//      `step` of its own at its own height, any other at its own square's. It is `grounded` and not
//      `sliding`, `vel` is the eased velocity where the move went as asked and the move made where it did
//      not, its upward part 0, and `speed` the horizontal speed.
// A scene whose kinds walk as agents lists walker's row; an agent's step with none throws naming it.
//
// One read a call. `walk`, `slide`, `carry`, `seek` and `stand` each read the ground once for the body
// they move. A ground with a `cell` (metres; `world.walker.mods.cell`, terrain3d's the cell of its
// finest ring) is stood on as the triangles of that lattice: each corner, a whole number of cells on
// each axis, is asked of `height` (and `depth`) once in the call, and every cell is split from its
// low corner to its high one, as terrain3d draws it, so a body stands on the ground that is drawn
// and every foot, gradient and probe of the call is worked out from those corners, on a ground
// `groundOf` made read off the corners the truth keeps (above). The cell is never
// chosen for walker: it is the ground the game draws, so a game that draws its ground finer has its
// bodies stand on that finer ground with nothing else changed: a body that stands wrong is fixed by
// drawing the ground finer, never in walker. A ground with no
// `cell` is asked at each point. The solids are asked once, round the body out to the farthest the
// call can reach (the move, or the way to a `seek`'s target) and two radii past it, and every
// question inside that disc is answered from that list; one reaching outside it is asked of the
// ground.
//
// The footprint. The feet are the four corners of a `span` square, square to the world's axes, and
// its centre. S(x, z), the stand height, is the mean height of the feet within `step` of the highest
// foot: on noise, or any grade up to maxSlope, the plain mean of all five; across a ledge, the feet
// still on top. g(x, z) is the gradient of S by central differences across one span (S at ± span/2 on
// each axis). Water depth is the plain mean of the four corners' depth.
//
// Steep ground is not ground. The ground a body stands on is S, and it is steep where S rises faster
// than maxSlope: on each axis the smaller of S's two one-sided differences a thousandth of a span
// long, and 0 where they differ in sign, so a body held up by feet on a steep face stands on steep
// ground, while the jump S makes where a foot meets a riser or leaves a drop is an edge beside it and
// not a grade under it. A body on steep ground, or within one step's fall of it, is sliding: it is not
// `grounded`, it cannot jump, the uphill part of its `want` is dropped and its downhill part is at
// least `slide`, and it follows the ground down as a grounded body does. A rise onto steep ground is
// refused (the slope rule, below). So no hop climbs a face steeper than maxSlope further than jumpH +
// step above the last walkable ground a body stood on.
//
// `walk(me, w, dt, ground)`, one step:
//   1. On steep ground, `want` is taken as above. `vel`'s horizontal part eases toward it, as a
//      vector, by 1 − exp(−accel·dt), or by 1 − exp(−airAccel·dt) for a body in the air (on the
//      ground or sliding as step 4 has it at the step's start). `yaw` eases the short way round toward `face`, or toward
//      `want`'s bearing when `face` is null and `want` is not zero, by 1 − exp(−turnRate·dt), at most
//      turnMax·dt, and is kept in (−π, π]. Bearings are the camera law's: yaw θ faces (sin θ, cos θ).
//   2. `jump`, grounded, sets vy = √(2·gravity·jumpH) and leaves the ground; `jump` is cleared
//      either way.
//   3. `slide` moves the body by vel·dt.
//   4. On the ground or sliding, a rise or flat is followed with vy = 0. Airborne, vy loses
//      gravity·dt and pos.y gains vy·dt (semi-implicit), and it lands on the step pos.y reaches S,
//      with vy the landing move's rate if that move dropped and 0 if it rose. A drop is that same
//      fall, taken from the step before's vy: while S stays at or above pos.y + (vy − gravity·dt)·dt
//      the drop is followed, vy the drop's own rate, and below that the ground fell away faster than
//      gravity and the body leaves it. So a ledge lets go and the body falls by the exact gravity sum,
//      and a jump of jumpH 0.9 at gravity 20 and 60 Hz peaks at the sum Σ(6 − n/3)/60 = 0.85 m. A body
//      that ends the step on the ground is `grounded` unless the ground there is steep (past
//      maxSlope, or past maxSlope − slopeBand for a body sliding).
//   5. `vel` and `speed` are read back from the horizontal motion `slide` made, so a wall and a
//      reversal both show as `vel` easing toward a `want` it did not reach. On an axis the move went
//      where it was asked, to the rounding of the position, the eased speed is kept, so an
//      unobstructed body's `vel` is the eased velocity exactly and not a rounding of it; and since a
//      move shorter than the tolerance is not made, a body let go of stops rather than creeping on
//      by a rounding a step.
//
// `slide(me, w, delta, ground)` moves the body horizontally by delta [x, z], within the limits, and
// returns the move it made. It leaves pos.y to `walk`. The limits run as rounds on the point the
// round before left, up to 6. Each round the point is pushed out of the solids, and then the limits
// are asked in turn, wading, step and slope, the first that refuses being the answer:
//   Solids.  The point is pushed out of every footprint it is within `radius` of, to `radius` clear:
//            out of one of one corner along the line from that corner, out of any other from the
//            nearest point of its outline along the way out there, so solids are slid round. Solids are
//            asked again each round, so a push onto a second solid, or onto ground a limit refuses, is
//            caught, and a point is taken only once no solid holds it.
//   Wading.  A move into water deeper than `wade`, and deeper than the footprint already stood in, is
//            refused, across the depth's gradient at that point (central differences a thousandth
//            of a span wide, or one span wide where that is flat), which projects it onto the
//            shoreline. A footprint already that deep moves freely while it does not deepen.
//   Step.    Each foot starts at the higher of its own ground and pos.y, so a foot over a drop or in
//            the air is at the body's height. The move is refused if the ground under some foot at
//            the point is more than `step` above that same foot. Walking off a ledge is never
//            refused; a vertical riser taller than step is refused at any angle as soon as one foot
//            would cross it; a face that is not vertical lets each foot rise a little a move and is
//            the slope rule's to refuse; a kerb up to step passes. A body in the air steps up from
//            its own height, so a jump lands on a ledge whose top it is above when its feet reach it
//            (at a 0.85 m apex and step 0.6: 0.8 m, not 0.9 m, which the slope rule refuses). A step
//            refusal's edge is found where the first refusing foot's path first rises past step, by
//            30 halvings, and where a second path parallel to it span/8 to one side (or, starting
//            over, the line between the two starts) crosses the same height; the line through the two
//            crossings is the edge's tangent, and the move slides along it: a straight edge's exact
//            tangent, and a span/8 chord of a curved one.
//   Slope.   A move onto steep ground that raises S is refused across its gradient there. Otherwise
//            a move that raises S above both S at the start and pos.y is refused when both hold at the
//            point: |g| is over maxSlope; and R, the highest S at samples every span/16 along g out to
//            `probe` metres, less S at the start, is over `step` (the samples stop at the first that
//            is). So a steep feature whose whole rise stays within step is stepped over, and one
//            taller than step is refused, whether a wall, stacked risers or a narrow ridge. The
//            judgement reads the ground within span/2 of the feet, so a cliff further to the side does
//            not block gentle ground beside it. A move along a steep face's contour or down it does
//            not rise, flat ground beside a drop is never a climb, and a body in the air above the
//            ground it moves over is not climbing it. A slope refusal is across the gradient of S at
//            the refused point (central differences a thousandth of a span wide, or g where that is
//            flat), which on a plane face is exact.
// A refused move has its component along the refusal's normal removed and goes to the next round. A
// round that cannot get past its refusal (no normal, a move not heading along it, a projection that
// shortens nothing, or the last round):
//   by slope or wading, is first settled onto the level it stood at (S at the start or pos.y, or the
//     water at wade or the start's depth, whichever is deeper): moved down that field's own gradient
//     at the point, a thousandth of a span wide, by its excess over the gradient's square, and judged
//     again the next round, as on a curved face or shore a square footprint meets with a different
//     corner as it goes; and still not got past, goes as far along the round's move as every limit
//     passes, found by 12 halvings;
//   by step, leaves the body where the move started.
//
// `carry(me, w, delta, ground)` is a clip's measured travel: `slide`, with delta first cut where the
// body's circle first meets a solid's footprint on its way (the footprints grown by the body's radius,
// met along the move's line), so a lunge or a roll into a trunk, a wall or a body stops against it
// where a walk slides round it. A body touching a solid, or within it, does not move toward it at all; a move away from
// it, or past it, is not cut. A rule carries after it walks, so `carry` then puts the body on the
// ground where the move leaves it, as `walk` would have: where S is at or above pos.y it stands on S,
// and a body in the air lands there with vy 0; a body on the ground follows a drop of up to `step` onto
// ground that is not steep, down a slope or a kerb, with vy kept; any other drop, past a ledge or onto
// steep ground, leaves it in the air at its height, and `walk` lets it fall from there by the gravity
// sum. Standing on S it is `sliding` or `grounded` by walk's rule; in the air, neither. So a roll down
// a slope stays on the ground, where the next `walk` would take a carried drop past gravity's fall in
// a step for a ledge, and no carry leaves a body drawn in or above the ground it stands on.
//
// `relative(stick, yaw)` is the camera-relative stick. `stick` is [x, z]: forward is z, [0, 1] (W),
// and right is x, [1, 0] (D). It is turned so stick-forward lands on (sin yaw, cos yaw), the camera
// law's look direction, and stick-right on (−cos yaw, sin yaw), forward × up, the camera's right,
// and clamped to length 1. A rule multiplies it by its speed to make `want`.
//
// `seek(me, w, target, stop, ground)` sets `want` toward target [x, z] at seekSpeed, never at a
// speed read off `want`, and returns whether the body has arrived: within `stop` metres, `want` is
// zeroed and it returns true. The solids it asks for lie along the corridor to target: discs
// radius·√2 across every radius along the way, which hold every footprint that comes within the body's
// radius of it. While the straight way to target passes through no grown footprint (a solid's
// footprint grown by the body's radius), `want` points at target and `side` is 0. Otherwise it goes
// round the footprint the way enters first, with its group (every grown footprint overlapping one in
// it, gathered one by one from the ground's `solids`): their silhouette is the union of every member's
// bearings from the body, a footprint of one corner its corner's bearing widened by the half-angle its
// grown circle subtends there, any other the bearings of its corners, each widened so, and `want` aims
// at an edge of the interval holding target's bearing, a tangent to the edge member's grown footprint.
// A footprint that edge's ray enters before its tangent point joins the members, with its group, and
// the edge is taken again. The side is kept in `side` (1 the edge bearings grow toward, −1 the other) until the
// line comes clear: first blocked, the side whose way round (to the tangent point, then straight on
// to target) is shorter. `turned` sums the turn of `want` while a side is kept; a way round that has
// turned it a whole turn without the line coming clear is going round a pocket, and the other side
// is taken. A group whose silhouette closes round the body has no edge, and `want` points at target.
//
// `stand(k, ground, x, z)` is S, and `numbers(me, w)` a row's kind's numbers, for a rule that needs
// them.
//
// Every number a game tunes is in `kinds`. What stays in the code is the method's own precision:
// TOLERANCE, 30 HALVINGS to find where a foot's path rises past step, the slope rule's SAMPLES every
// span/16 along g, gradients taken over a thousandth (FINE) of span, a step edge's second path EDGE
// (span/8) aside, 12 halvings (FRACTION) of a round's move, at most 6 ROUNDS of `slide`, and the
// position's own rounding, two parts in 2⁵², that `walk` reads a move made as the move asked within.
import type { Kind, Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

export type Numbers = {
  radius: number; height: number; accel: number; turnRate: number; gravity: number; jumpH: number
  step: number; maxSlope: number; slopeBand: number; slide: number; wade: number; span: number; probe: number; seekSpeed: number
  turnMax?: number
  airAccel?: number
  bodies?: string[]
  agent?: number
}
// A solid handed bare (`fromBare`).
export type Solid = { x: number; z: number; radius: number }
// A solid: its numbers under its word (Solids and their footprints, above).
export type Worded = { [word: string]: any }
// A footprint: a convex outline on the ground, its corners `points` [[x, z], …] in order round it, one
// for a round thing, taken `round` metres wider all round.
export type Footprint = { points: number[][]; round: number }
// A word's behavior: the footprint of a thing of that word.
export type Behavior = (shape: any) => Footprint
export type Ground = {
  height(x: number, z: number): number
  depth?(x: number, z: number): number
  solids(x: number, z: number, r: number): (Solid | Worded)[]
  cell?: number
  // Where a body standing at `pos`, facing `yaw`, is now that the floor under it has moved, or undefined
  // where that floor has not moved (`walk`).
  footing?(pos: number[], yaw: number): { pos: number[]; yaw: number } | undefined
}
// The ground's heights and water, what the footprint stands on, without its solids.
type Heights = Omit<Ground, 'solids'>
// A plugin's `fixed` (`world.walker.mods.fixed`): every solid that never moves reaching within r of
// (x, z), from the walls of a level, the trunks and boulders scatter3d places, anything that stands
// where it stands for the life of the truth.
export type Fixed = (w: W, x: number, z: number, r: number) => (Solid | Worded)[]

// walker's own word (Solids and their footprints, above).
/** @deprecated LEGACY, being phased out: a plugin keeps no words of its own; every word is delivered by the plugin that brings things of it (`world.walker.mods.behaviors`). */
export const base: Record<string, Behavior> = {
  cylinder: c => ({ points: [[c.pos[0], c.pos[2]]], round: c.radius }),
}

// Every behavior the scene has: walker's own, and over them each mod's in the order they are named;
// made once per scene's `world`, whose mods never change.
const behaviorsMade = new WeakMap<object, Record<string, Behavior>>()
function behaviorsOf(world: object): Record<string, Behavior> {
  let all = behaviorsMade.get(world)
  if (!all) {
    all = { ...base }
    for (const m of modsOf<() => Record<string, Behavior>>(world, 'walker', 'behaviors')) Object.assign(all, m())
    behaviorsMade.set(world, all)
  }
  return all
}

// The one fallback: a solid handed bare, `{ x, z, radius }`, as providers written before solids had
// words hand them, is the upright cylinder it always was. Nothing past this reads a bare solid.
/** @deprecated LEGACY, being phased out: a provider hands worded solids and delivers their words' behaviors; a bare solid is the old way. */
function fromBare(s: Solid | Worded): Worded {
  if (!('x' in s && 'radius' in s)) return s
  const bare = s as Solid
  return { cylinder: { pos: [bare.x, 0, bare.z], radius: bare.radius } }
}

// What turns a solid into its footprint, by its word's behavior among `all`.
type Foot = (s: Solid | Worded) => Footprint
const footOf = (all: Record<string, Behavior>): Foot => solid => {
  const s = fromBare(solid)
  const word = Object.keys(s)[0]
  const behavior = all[word]
  if (!behavior) throw new Error(`walker has no behavior for a solid of the word ${word}: no plugin world.walker.mods.behaviors names delivers it`)
  return behavior(s[word])
}
// A footprint of walker's own words alone, for a question that reads no solid.
const ownFoot = footOf(base)

// The ground as walker keeps it for a truth (`groundOf`): every corner of the lattice asked of `height`
// and `depth` so far, kept by `keyOf`; the fixed solids, asked of every `fixed` plugin; and the
// `solids` mod's, what moves.
const KEPT = Symbol('kept')
type Area = (x: number, z: number, r: number) => (Solid | Worded)[]
type Kept = { height?: Map<number, number>; depth?: Map<number, number>; fixed?: Area; moving?: Area }
type Made = Ground & { [KEPT]: Kept }

// A square (i, j) of a grid, or a corner of the lattice, as one number.
const keyOf = (i: number, j: number) => (i + 1048576) * 2097152 + (j + 1048576)

// The ground the scene's mods make, made once for each truth and kept until `world.walker.mods`
// changes (the editor edits the scene in place).
const grounds = new WeakMap<W, { mods: string; ground: Made }>()

export function groundOf(w: W): Ground {
  const mods = JSON.stringify(w.world.walker?.mods ?? null)
  const was = grounds.get(w)
  if (was && was.mods === mods) return was.ground
  const ground = make(w)
  grounds.set(w, { mods, ground })
  return ground
}

function make(w: W): Made {
  const height = mod<(w: W, x: number, z: number) => number>(w.world, 'walker', 'height')
  if (!height) throw new Error('walker is asked for the ground its mods make, and the scene names no world.walker.mods.height')
  const depth = mod<(w: W, x: number, z: number) => number>(w.world, 'walker', 'depth')
  const solids = mod<(w: W, x: number, z: number, r: number) => Solid[]>(w.world, 'walker', 'solids')
  const drawn = mod<(w: W) => number>(w.world, 'walker', 'cell')
  const fixed = modsOf<Fixed>(w.world, 'walker', 'fixed')
  const cell = drawn?.(w)
  const h = (x: number, z: number) => height(w, x, z)
  const d = depth && ((x: number, z: number) => depth(w, x, z))
  const kept: Kept = {}
  if (cell !== undefined) {
    kept.height = new Map()
    if (d) kept.depth = new Map()
  }
  if (fixed.length) kept.fixed = (x, z, r) => fixed.flatMap(f => f(w, x, z, r))
  if (solids) kept.moving = (x, z, r) => solids(w, x, z, r)
  const all = (x: number, z: number, r: number) => [...(kept.fixed?.(x, z, r) ?? []), ...(kept.moving?.(x, z, r) ?? [])]
  return {
    height: h,
    ...(d && { depth: d }),
    solids: all,
    ...(cell !== undefined && { cell }),
    [KEPT]: kept,
  }
}

// ---------------------------------------------------------------- footprints

// The point of a footprint's outline nearest (x, z): `at`, whether (x, z) lies inside the outline, and
// `n`, the unit way out of it there: from `at` toward (x, z) outside, the nearest side's outward normal
// inside. An outline of one point is that point, never inside; of two, the segment between them.
function nearest(points: number[][], x: number, z: number): { at: number[]; inside: boolean; n: number[] | undefined } {
  if (points.length === 1) return { at: points[0], inside: false, n: undefined }
  // The turn of the outline: + for anticlockwise in (x, z), − for clockwise; a side's outward normal
  // is its direction turned a quarter the other way.
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]
    area += ax * bz - bx * az
  }
  const sign = area >= 0 ? 1 : -1
  let best: number[] = points[0], far = Infinity, normal: number[] | undefined, inside = points.length > 2
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]
    const ex = bx - ax, ez = bz - az, len2 = ex * ex + ez * ez
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2)) : 0
    const px = ax + ex * t, pz = az + ez * t
    const d = math.hypot(x - px, z - pz)
    const len = Math.sqrt(len2)
    const out = len > 0 ? [(ez / len) * sign, (-ex / len) * sign] : [0, 0]
    if ((x - ax) * out[0] + (z - az) * out[1] > 0) inside = false
    if (d < far) { far = d; best = [px, pz]; normal = out }
  }
  if (inside) return { at: best, inside, n: normal }
  return { at: best, inside, n: far > 0 ? [(x - best[0]) / far, (z - best[1]) / far] : normal }
}

// How far (x, z) stands from a footprint's outline, 0 inside it, not counting its rounding.
function gap(f: Footprint, x: number, z: number): number {
  const near = nearest(f.points, x, z)
  return near.inside ? 0 : math.hypot(x - near.at[0], z - near.at[1])
}

// Whether a footprint reaches within r of (x, z).
function within(f: Footprint, x: number, z: number, r: number): boolean {
  if (f.points.length === 1) return math.hypot(f.points[0][0] - x, f.points[0][1] - z) <= r + f.round
  return gap(f, x, z) <= r + f.round
}

// Whether the segment from (ax, az) to (bx, bz) crosses the one from (cx, cz) to (dx, dz).
function crosses(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): boolean {
  const side = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px)
  const d1 = side(cx, cz, dx, dz, ax, az), d2 = side(cx, cz, dx, dz, bx, bz)
  const d3 = side(ax, az, bx, bz, cx, cz), d4 = side(ax, az, bx, bz, dx, dz)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// How far apart two outlines stand, 0 where they overlap.
function apart(a: number[][], b: number[][]): number {
  for (let i = 0; i < a.length; i++) {
    const [ax, az] = a[i], [bx, bz] = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      const [cx, cz] = b[j], [dx, dz] = b[(j + 1) % b.length]
      if (crosses(ax, az, bx, bz, cx, cz, dx, dz)) return 0
    }
  }
  let least = Infinity
  for (const [x, z] of a) least = Math.min(least, gap({ points: b, round: 0 }, x, z))
  for (const [x, z] of b) least = Math.min(least, gap({ points: a, round: 0 }, x, z))
  return least
}

// How far the segment from the origin to (ex, ez) passes from an outline, 0 where it crosses it.
function passes(points: number[][], ex: number, ez: number): number {
  const line = [[0, 0], [ex, ez]]
  if (points.length === 1) return gap({ points: line, round: 0 }, points[0][0], points[0][1])
  return apart(points, line)
}

// The least t ≥ 0 at which the ray from (px, pz) along (dx, dz) meets an outline taken `r` wider, or
// Infinity when it never does; 0 from within it.
function enter(points: number[][], r: number, px: number, pz: number, dx: number, dz: number): number {
  const f = { points, round: r }
  if (gap(f, px, pz) <= r) return 0
  let best = Infinity
  const a = dx * dx + dz * dz
  if (!(a > 0)) return best
  // Each corner, a circle `r` across.
  for (const [cx, cz] of points) {
    const qx = px - cx, qz = pz - cz
    const b = qx * dx + qz * dz, c = qx * qx + qz * qz - r * r, disc = b * b - a * c
    if (disc < 0) continue
    const t = (-b - Math.sqrt(disc)) / a
    if (t >= 0) best = Math.min(best, t)
  }
  // Each side, moved `r` out along its outward normal.
  if (points.length > 1) {
    let area = 0
    for (let i = 0; i < points.length; i++) {
      const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]
      area += ax * bz - bx * az
    }
    const sign = area >= 0 ? 1 : -1
    for (let i = 0; i < points.length; i++) {
      const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]
      const ex = bx - ax, ez = bz - az, len = math.hypot(ex, ez)
      if (!(len > 0)) continue
      for (const out of points.length === 2 ? [1, -1] : [sign]) {
        const nx = (ez / len) * out, nz = (-ex / len) * out
        const towards = dx * nx + dz * nz
        if (!(towards < 0)) continue
        const sx = ax + nx * r, sz = az + nz * r
        const t = ((sx - px) * nx + (sz - pz) * nz) / towards
        if (t < 0) continue
        const hx = px + dx * t - sx, hz = pz + dz * t - sz
        const along = (hx * ex + hz * ez) / (len * len)
        if (along >= 0 && along <= 1) best = Math.min(best, t)
      }
    }
  }
  return best
}

// ---------------------------------------------------------------- one body's read of the ground

// The ground as one body reads it in one call: on a ground with a `cell`, its height and depth are
// the triangles of the lattice of that cell, each corner asked of the ground once in the call, every
// cell split from its (i, j) corner to its (i + 1, j + 1) one, as terrain3d draws its finest ring; and
// its solids are asked once, round (x, z) out to `reach`, and every question inside that disc is
// answered from that list. A question that reaches outside it is asked of the ground.
const READ = Symbol('read')
// Its solids are their footprints, each turned once, as they are read.
type Read = Omit<Ground, 'solids'> & { solids(x: number, z: number, r: number): Footprint[]; [READ]: true }

// `kept`, the corners a truth keeps, when the ground is one `groundOf` made; else the call's own.
function lattice(f: (x: number, z: number) => number, c: number, kept?: Map<number, number>) {
  const corners = kept ?? new Map<number, number>()
  const at = (i: number, j: number) => {
    const key = keyOf(i, j)
    let h = corners.get(key)
    if (h === undefined) corners.set(key, (h = f(i * c, j * c)))
    return h
  }
  return (x: number, z: number) => {
    const gx = x / c, gz = z / c
    const i = Math.floor(gx), j = Math.floor(gz)
    const fx = gx - i, fz = gz - j
    const a = at(i, j), d = at(i + 1, j + 1)
    if (fx >= fz) {
      const b = at(i + 1, j)
      return a + (b - a) * fx + (d - b) * fz
    }
    const e = at(i, j + 1)
    return a + (e - a) * fz + (d - e) * fx
  }
}

function read(ground: Ground | Read, x: number, z: number, reach: number, foot: Foot): Read {
  if ((ground as Read)[READ]) return ground as Read
  const asked = (ground as Ground).solids
  const near = (list: Footprint[], qx: number, qz: number, r: number) => list.filter(s => within(s, qx, qz, r))
  const held = reach > 0 ? asked(x, z, reach).map(foot) : undefined
  const c = ground.cell
  const kept = (ground as Partial<Made>)[KEPT]
  return {
    [READ]: true,
    height: c ? lattice(ground.height, c, kept?.height) : ground.height,
    ...(ground.depth && { depth: c ? lattice(ground.depth, c, kept?.depth) : ground.depth }),
    solids: (qx, qz, r) => (held && math.hypot(qx - x, qz - z) + r <= reach ? near(held, qx, qz, r) : asked(qx, qz, r).map(foot)),
    ...(c && { cell: c }),
  }
}

// One call's ground for `me`: the bodies solid to it beside the ground's solids, read round where it
// stands out to `reach` past its own radius, each solid's footprint by the scene's behaviors.
const ready = (me: Row, w: W, k: Numbers, on: Ground, reach: number) =>
  read(bodied(me, w, k, on), me.data.pos[0], me.data.pos[2], reach + 2 * k.radius, footOf(behaviorsOf(w.world)))

export type Body = {
  pos: number[]; yaw: number; vel: number[]; grounded: boolean; speed: number
  want: number[]; face: number | null; jump: boolean; side: number; turned: number; sliding: boolean
}

const TOLERANCE = 1e-9
const HALVINGS = 30
const FRACTION = 12
const SAMPLES = 16
const FINE = 1000
const EDGE = 8
const ROUNDS = 6

// Which numbers may be 0; every other must be above it.
const FIELDS: Record<Exclude<keyof Numbers, 'bodies' | 'turnMax' | 'airAccel' | 'agent'>, 'zero' | 'above'> = {
  radius: 'above', height: 'above', accel: 'above', turnRate: 'above', gravity: 'above', jumpH: 'zero',
  step: 'above', maxSlope: 'above', slopeBand: 'above', slide: 'above', wade: 'zero', span: 'above', probe: 'above', seekSpeed: 'above',
}

// Throws a sentence naming the kind whose numbers cannot be walked by.
export function check(kinds: Record<string, Numbers>) {
  for (const [name, k] of Object.entries(kinds)) {
    for (const [f, least] of Object.entries(FIELDS) as [keyof typeof FIELDS, 'zero' | 'above'][]) {
      const v = k[f]
      if (!Number.isFinite(v) || (least === 'zero' ? v < 0 : v <= 0)) {
        throw new Error(`walker kind ${name}: ${f} ${v} is not a number ${least === 'zero' ? 'at or above' : 'above'} 0`)
      }
    }
    if (k.turnMax !== undefined && !(Number.isFinite(k.turnMax) && k.turnMax > 0)) {
      throw new Error(`walker kind ${name}: turnMax ${k.turnMax} is not a number above 0`)
    }
    if (k.airAccel !== undefined && !(Number.isFinite(k.airAccel) && k.airAccel >= 0)) {
      throw new Error(`walker kind ${name}: airAccel ${k.airAccel} is not a number at or above 0`)
    }
    if (k.agent !== undefined && !(Number.isFinite(k.agent) && k.agent > 0)) {
      throw new Error(`walker kind ${name}: agent ${k.agent} is not a number above 0`)
    }
    // `player`, a seat's row, walks as the kind its `as` names, so it may stand among the bodies too.
    if (k.bodies !== undefined && !(Array.isArray(k.bodies) && k.bodies.every(b => typeof b === 'string' && (Object.hasOwn(kinds, b) || b === 'player')))) {
      throw new Error(`walker kind ${name}: bodies ${JSON.stringify(k.bodies)} is not a list of the table's kinds`)
    }
    if (!(k.slopeBand < k.maxSlope)) throw new Error(`walker kind ${name}: slopeBand ${k.slopeBand} is not under maxSlope ${k.maxSlope}`)
    const spread = k.maxSlope * k.span * Math.SQRT2
    if (!(spread < k.step)) {
      throw new Error(`walker kind ${name}: maxSlope·span·√2 is ${spread}, not under step ${k.step}, so a footprint on a grade of maxSlope spreads past step`)
    }
  }
}

// The scene's table, `world.walker.kinds`, checked the first time it is read.
const checked = new WeakSet<object>()
function table(w: W): Record<string, Numbers> {
  const kinds = w.world.walker.kinds as Record<string, Numbers>
  if (!checked.has(kinds)) {
    check(kinds)
    checked.add(kinds)
  }
  return kinds
}

// The kind whose entry a row walks by: the kind its `as` names, or its own. A seat's `player` row
// that is one of several bodies, an `xbot` or a `ybot`, names it in `as`.
export const kindOf = (me: Row): string => (typeof me.data.as === 'string' ? me.data.as : me.kind)

export function numbers(me: Row, w: W): Numbers {
  const kind = kindOf(me)
  const k = table(w)[kind]
  if (!k) throw new Error(`walker kinds has no kind ${kind}`)
  return k
}

// The ground with the bodies solid to `me` beside its solids: every row of a kind its `bodies` names,
// but itself and a limp one, whose circle reaches within r. The table was checked by `numbers`.
function bodied(me: Row, w: W, k: Numbers, ground: Ground): Ground {
  if (!k.bodies?.length) return ground
  const kinds = w.world.walker.kinds as Record<string, Numbers>
  // A row walks among the bodies by its own entry, or the entry of the kind its `as` names; a `player`
  // row with neither (a seat that plays no body) is none.
  const bodies = k.bodies.flatMap(kind => w.all(kind).filter(o => o.id !== me.id && !o.data.limp && kinds[kindOf(o)]).map(o => ({ x: o.data.pos[0], z: o.data.pos[2], radius: kinds[kindOf(o)].radius })))
  return {
    ...ground,
    solids: (x, z, r) => [...ground.solids(x, z, r), ...bodies.filter(s => math.hypot(s.x - x, s.z - z) <= r + s.radius)],
  }
}

// ---------------------------------------------------------------- the footprint

// The feet's offsets from the body: the four corners of the span square, then its centre.
const feet = (k: Numbers) => {
  const o = k.span / 2
  return [[-o, -o], [o, -o], [-o, o], [o, o], [0, 0]]
}

// S: the mean height of the feet within step of the highest, on the ground as a body reads it.
export const stand = (k: Numbers, ground: Ground, x: number, z: number): number => standOn(k, read(ground, x, z, 0, ownFoot), x, z)

// The feet in `feet`'s order, each added in that order, with nothing made: it is asked dozens of times a
// body a step.
function standOn(k: Numbers, ground: Heights, x: number, z: number): number {
  const o = k.span / 2, height = ground.height
  const a = height(x - o, z - o), b = height(x + o, z - o), c = height(x - o, z + o), d = height(x + o, z + o), e = height(x, z)
  const least = Math.max(a, b, c, d, e) - k.step - TOLERANCE
  let sum = 0, n = 0
  if (a >= least) { sum += a; n++ }
  if (b >= least) { sum += b; n++ }
  if (c >= least) { sum += c; n++ }
  if (d >= least) { sum += d; n++ }
  if (e >= least) { sum += e; n++ }
  return sum / n
}

// The plain mean of the four corners' depth, 0 on a ground with none.
function depthOf(k: Numbers, ground: Heights, x: number, z: number): number {
  const depth = ground.depth
  if (!depth) return 0
  const o = k.span / 2
  return (depth(x - o, z - o) + depth(x + o, z - o) + depth(x - o, z + o) + depth(x + o, z + o)) / 4
}

// The gradient of f by central differences `width` wide.
function gradient(f: (x: number, z: number) => number, x: number, z: number, width: number): number[] {
  const h = width / 2
  return [(f(x + h, z) - f(x - h, z)) / width, (f(x, z + h) - f(x, z - h)) / width]
}

// The unit of a projection's normal: the fine gradient, or the span-wide one where that is flat.
function normal(f: (x: number, z: number) => number, x: number, z: number, span: number): number[] | undefined {
  for (const width of [span / FINE, span]) {
    const [gx, gz] = gradient(f, x, z, width)
    const m = math.hypot(gx, gz)
    if (m > TOLERANCE) return [gx / m, gz / m]
  }
  return undefined
}

// ---------------------------------------------------------------- the limits

// A limit's answer for a point: undefined when it passes, otherwise which limit refused it and the
// normal the move's component along is removed, or null when there is none to project across.
type Refusal = { by: 'wade' | 'step' | 'slope'; n: number[] | null } | undefined

function wading(k: Numbers, ground: Heights, p: number[], q: number[]): Refusal {
  if (!ground.depth) return undefined
  const dq = depthOf(k, ground, q[0], q[1])
  if (!(dq > k.wade + TOLERANCE && dq > depthOf(k, ground, p[0], p[1]) + TOLERANCE)) return undefined
  return { by: 'wade', n: normal((x, z) => depthOf(k, ground, x, z), q[0], q[1], k.span) ?? null }
}

// The edge a refusing foot's path crosses: where the path from p to q first rises past step, found by
// halving, and where a second path, parallel to it span/8 to one side, crosses the same height. The
// line through the two crossings is the edge's tangent, and the normal is square to it.
function stepping(k: Numbers, ground: Heights, p: number[], y: number, q: number[]): Refusal {
  const d = [q[0] - p[0], q[1] - p[1]]
  const len = math.hypot(d[0], d[1])
  for (const [ox, oz] of feet(k)) {
    const from = Math.max(ground.height(p[0] + ox, p[1] + oz), y)
    const over = (x: number, z: number) => ground.height(x, z) - from > k.step + TOLERANCE
    if (!over(q[0] + ox, q[1] + oz)) continue
    // The crossing between a point that is not over and one that is.
    const cross = (a: number[], b: number[]) => {
      let lo = 0, hi = 1
      for (let h = 0; h < HALVINGS; h++) {
        const mid = (lo + hi) / 2
        if (over(a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid)) hi = mid
        else lo = mid
      }
      return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi]
    }
    const start = [p[0] + ox, p[1] + oz], end = [q[0] + ox, q[1] + oz]
    const c = cross(start, end)
    const side = [(-d[1] / len) * (k.span / EDGE), (d[0] / len) * (k.span / EDGE)]
    for (const sign of [1, -1]) {
      const s0 = [start[0] + sign * side[0], start[1] + sign * side[1]]
      const s1 = [end[0] + sign * side[0], end[1] + sign * side[1]]
      // The parallel path crosses along its length, or, starting over, between the two starts.
      const other = !over(s0[0], s0[1]) ? (over(s1[0], s1[1]) ? cross(s0, s1) : undefined) : cross(start, s0)
      if (!other) continue
      const tx = other[0] - c[0], tz = other[1] - c[1]
      const m = math.hypot(tx, tz)
      if (!(m > TOLERANCE)) continue
      const n = [tz / m, -tx / m]
      const toward = n[0] * d[0] + n[1] * d[1] >= 0 ? 1 : -1
      return { by: 'step', n: [n[0] * toward, n[1] * toward] }
    }
    return { by: 'step', n: null }
  }
  return undefined
}

// The way up at q when the ground there is too steep to climb, measured from `from`: g, the gradient
// of S across one span, is steeper than maxSlope, and R, the highest S at samples every span/16 along
// g out to probe, less `from`, is over step. R is over step as soon as one sample is, so the samples
// stop there.
function climb(k: Numbers, ground: Heights, q: number[], from: number): number[] | undefined {
  const S = (x: number, z: number) => standOn(k, ground, x, z)
  const [gx, gz] = gradient(S, q[0], q[1], k.span)
  const m = math.hypot(gx, gz)
  if (!(m > k.maxSlope)) return undefined
  const ux = gx / m, uz = gz / m, apart = k.span / SAMPLES
  for (let i = 0; i * apart <= k.probe + TOLERANCE; i++) {
    if (S(q[0] + ux * i * apart, q[1] + uz * i * apart) - from > k.step + TOLERANCE) return [ux, uz]
  }
  return undefined
}

function sloping(k: Numbers, ground: Heights, p: number[], y: number, q: number[]): Refusal {
  const S = (x: number, z: number) => standOn(k, ground, x, z)
  const sp = S(p[0], p[1])
  if (!(S(q[0], q[1]) > Math.max(sp, y) + TOLERANCE)) return undefined
  // Steep ground is not ground: a rise onto it is refused across its own gradient.
  const onto = steep(k, ground, q[0], q[1])
  if (onto) return { by: 'slope', n: onto }
  const up = climb(k, ground, q, sp)
  return up ? { by: 'slope', n: normal(S, q[0], q[1], k.span) ?? up } : undefined
}

// The limits in turn: the first that refuses is the answer.
function limits(k: Numbers, ground: Heights, p: number[], y: number, q: number[]): Refusal {
  return wading(k, ground, p, q) ?? stepping(k, ground, p, y, q) ?? sloping(k, ground, p, y, q)
}

// The point pushed out of every solid it is within the body's radius of: a round one along the line
// from its middle, one with corners from the nearest point of its outline, along the way out there.
function push(k: Numbers, ground: Read, q: number[], from: number[]): number[] {
  let [x, z] = q
  for (const s of ground.solids(x, z, k.radius)) {
    const reach = s.round + k.radius
    if (s.points.length === 1) {
      const [sx, sz] = s.points[0]
      let dx = x - sx, dz = z - sz
      let d = math.hypot(dx, dz)
      if (d >= reach) continue
      // A point on the centre is pushed back the way it came.
      if (d === 0) { dx = from[0] - q[0]; dz = from[1] - q[1]; d = math.hypot(dx, dz) }
      if (d === 0) { dx = 1; dz = 0; d = 1 }
      x = sx + (dx / d) * reach
      z = sz + (dz / d) * reach
      continue
    }
    const near = nearest(s.points, x, z)
    if (!near.inside && math.hypot(x - near.at[0], z - near.at[1]) >= reach) continue
    const n = near.n ?? [1, 0]
    x = near.at[0] + n[0] * reach
    z = near.at[1] + n[1] * reach
  }
  return [x, z]
}

const clear = (k: Numbers, ground: Read, q: number[]) =>
  ground.solids(q[0], q[1], k.radius).every(s => s.points.length === 1
    ? math.hypot(q[0] - s.points[0][0], q[1] - s.points[0][1]) >= s.round + k.radius - TOLERANCE
    : gap(s, q[0], q[1]) >= s.round + k.radius - TOLERANCE)

export function slide(me: Row, w: W, delta: number[], on: Ground): number[] {
  const k = numbers(me, w)
  return slideOn(me, k, ready(me, w, k, on, math.hypot(delta[0], delta[1])), delta)
}

function slideOn(me: Row, k: Numbers, ground: Read, delta: number[]): number[] {
  const b = me.data as Body
  const [px, y, pz] = b.pos
  const p = [px, pz]
  const take = (q: number[]) => {
    b.pos = [q[0], y, q[1]]
    return [q[0] - px, q[1] - pz]
  }
  let d = [delta[0], delta[1]]
  for (let round = 0; round < ROUNDS; round++) {
    if (math.hypot(d[0], d[1]) <= TOLERANCE) break
    const q = push(k, ground, [px + d[0], pz + d[1]], p)
    d = [q[0] - px, q[1] - pz]
    const refused = limits(k, ground, p, y, q)
    if (!refused) {
      if (clear(k, ground, q)) return take(q)
      continue
    }
    const { n } = refused
    const along = n ? d[0] * n[0] + d[1] * n[1] : 0
    const next = n && along > 0 ? [d[0] - along * n[0], d[1] - along * n[1]] : undefined
    const stalled = !next || round === ROUNDS - 1 || math.hypot(next[0], next[1]) >= math.hypot(d[0], d[1]) * (1 - TOLERANCE)
    if (!stalled) {
      d = next
      continue
    }
    // A slope or wading refusal the projection cannot get past, as on a curved face or shore that a
    // square footprint meets with a different corner as it goes, is settled onto the level it stood
    // at: S's at the start (or pos.y), or the water's (wade, or the depth at the start, whichever is
    // deeper). It is moved down that field's own gradient by its excess over the gradient's square,
    // and judged again the next round.
    if (refused.by !== 'step' && round < ROUNDS - 1) {
      const S = (x: number, z: number) => standOn(k, ground, x, z)
      const D = (x: number, z: number) => depthOf(k, ground, x, z)
      const [f, level] = refused.by === 'slope' ? [S, Math.max(S(px, pz), y)] : [D, Math.max(k.wade, D(px, pz))]
      const [gx, gz] = gradient(f, q[0], q[1], k.span / FINE)
      const g2 = gx * gx + gz * gz, rise = f(q[0], q[1]) - level
      if (g2 > TOLERANCE && rise > 0) {
        const base = next ?? d
        d = [base[0] - (rise / g2) * gx, base[1] - (rise / g2) * gz]
        continue
      }
    }
    // A slope or wading refusal still not got past goes as far along this round's move as every limit
    // passes, found by halving.
    if (refused.by === 'step') break
    let lo = 0, hi = 1
    for (let h = 0; h < FRACTION; h++) {
      const t = (lo + hi) / 2
      const c = push(k, ground, [px + d[0] * t, pz + d[1] * t], p)
      if (!limits(k, ground, p, y, c) && clear(k, ground, c)) lo = t
      else hi = t
    }
    if (lo * math.hypot(d[0], d[1]) <= TOLERANCE) break
    return take(push(k, ground, [px + d[0] * lo, pz + d[1] * lo], p))
  }
  return [0, 0]
}

// The share of the move p + t·d, t in [0, 1], before a body at p first meets the footprint of s grown
// by the body's radius: 1 when it never does or moves away from it, 0 when it touches or is within it
// moving toward it.
function meets(k: Numbers, p: number[], d: number[], s: Footprint): number {
  const reach = s.round + k.radius
  if (s.points.length === 1) {
    const qx = p[0] - s.points[0][0], qz = p[1] - s.points[0][1]
    const b = qx * d[0] + qz * d[1]
    if (!(b < 0)) return 1
    const c = qx * qx + qz * qz - reach * reach
    if (c <= 0) return 0
    const a = d[0] * d[0] + d[1] * d[1]
    const disc = b * b - a * c
    if (disc < 0) return 1
    return Math.min(1, (-b - Math.sqrt(disc)) / a)
  }
  const near = nearest(s.points, p[0], p[1])
  const n = near.n ?? [0, 0]
  if (!(n[0] * d[0] + n[1] * d[1] < 0)) return 1
  if (near.inside || math.hypot(p[0] - near.at[0], p[1] - near.at[1]) <= reach) return 0
  return Math.min(1, enter(s.points, reach, p[0], p[1], d[0], d[1]))
}

export function carry(me: Row, w: W, delta: number[], at: Ground): number[] {
  const k = numbers(me, w)
  const b = me.data as Body
  const [px, y, pz] = b.pos
  // Every solid within the body's radius of the move: those reaching within half its length and the
  // radius of its middle.
  const half = math.hypot(delta[0], delta[1]) / 2
  const on = ready(me, w, k, at, 2 * half)
  let t = 1
  for (const s of on.solids(px + delta[0] / 2, pz + delta[1] / 2, half + k.radius)) t = Math.min(t, meets(k, [px, pz], delta, s))
  const made = slideOn(me, k, on, [delta[0] * t, delta[1] * t])
  // The body stands on S where the move rose to it, or, on the ground, dropped to it by up to step onto
  // ground that is not steep; a body in the air lands there, with vy 0. Anywhere else it is in the air
  // at its height.
  const [x, , z] = b.pos
  const S = standOn(k, on, x, z)
  if (S >= y || ((b.grounded || b.sliding) && y - S <= k.step + TOLERANCE && !steep(k, on, x, z))) {
    if (!b.grounded && !b.sliding) b.vel = [b.vel[0], 0, b.vel[2]]
    b.pos = [x, S, z]
    b.sliding = !!steep(k, on, x, z, b.sliding ? k.maxSlope - k.slopeBand : k.maxSlope)
    b.grounded = !b.sliding
  } else b.grounded = b.sliding = false
  return made
}

// ---------------------------------------------------------------- walking

// An angle in (−π, π].
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))

// Steep ground, which is not ground: the uphill direction of the ground a body at (x, z) stands on,
// its stand height S, where that is steeper than maxSlope; undefined where it is not. It is S and not
// the point under the centre, so a body held up by feet on a steep face stands on steep ground. Each
// axis takes the smaller of S's two one-sided differences a thousandth of a span long, and 0 where
// they differ in sign, so the jump S makes where a foot meets a riser, or leaves a drop, is an edge
// beside the body and not a grade under it.
function steep(k: Numbers, ground: Heights, x: number, z: number, limit = k.maxSlope): number[] | undefined {
  const h = k.span / FINE
  const s0 = standOn(k, ground, x, z)
  const least = (a: number, b: number) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b)
  const gx = least(standOn(k, ground, x + h, z) - s0, s0 - standOn(k, ground, x - h, z)) / h
  const gz = least(standOn(k, ground, x, z + h) - s0, s0 - standOn(k, ground, x, z - h)) / h
  const m = math.hypot(gx, gz)
  return m > limit ? [gx / m, gz / m] : undefined
}

// `yaw` eased the short way round toward `face`, or toward `want`'s bearing when `face` is null and
// `want` is not zero, at most turnMax·dt.
function turn(b: Body, k: Numbers, dt: number) {
  const aim = b.face ?? (math.hypot(b.want[0], b.want[1]) > TOLERANCE ? math.atan2(b.want[0], b.want[1]) : null)
  if (aim === null) return
  const most = (k.turnMax ?? Infinity) * dt
  b.yaw = wrap(b.yaw + Math.max(-most, Math.min(most, wrap(aim - b.yaw) * (1 - math.exp(-k.turnRate * dt)))))
}

// The eased speed where the move went where it was asked, to the rounding of the position.
const eased = (m: number, ask: number, v: number, from: number, to: number, dt: number) =>
  Math.abs(m - ask) <= 2 * Number.EPSILON * Math.max(Math.abs(from), Math.abs(to)) ? v : m / dt

export function walk(me: Row, w: W, dt: number, at: Ground) {
  const k = numbers(me, w)
  if (k.agent !== undefined) return stride(me, w, dt, at, k)
  const b = me.data as Body
  // A body standing on a floor that has moved is first put where the floor took it.
  const borne = b.grounded ? at.footing?.(b.pos, b.yaw) : undefined
  if (borne) Object.assign(b, { pos: borne.pos, yaw: borne.yaw })
  const [px, py, pz] = b.pos
  // The farthest this step can move it: its speed eases between `vel` and `want`, steep ground's slide
  // added to it.
  const ground = ready(me, w, k, at, (math.hypot(b.vel[0], b.vel[2]) + math.hypot(b.want[0], b.want[1]) + k.slide) * dt)
  // On the ground: grounded, or on steep ground within the fall of one step of it, sliding.
  const on = b.grounded || py <= standOn(k, ground, px, pz) + k.gravity * dt * dt
  // A slide starts past maxSlope and ends only below maxSlope − slopeBand.
  const up = on ? steep(k, ground, px, pz, b.sliding ? k.maxSlope - k.slopeBand : k.maxSlope) : undefined
  let want = b.want
  if (up) {
    const along = want[0] * up[0] + want[1] * up[1]
    const slid = Math.min(along, -k.slide)
    want = [want[0] + (slid - along) * up[0], want[1] + (slid - along) * up[1]]
  }
  const ease = 1 - math.exp(-(on ? k.accel : (k.airAccel ?? k.accel)) * dt)
  const vx = b.vel[0] + (want[0] - b.vel[0]) * ease
  const vz = b.vel[2] + (want[1] - b.vel[2]) * ease
  turn(b, k, dt)

  let vy = b.vel[1]
  let following = on
  if (b.jump && b.grounded && !up) {
    vy = Math.sqrt(2 * k.gravity * k.jumpH)
    following = false
  }
  b.jump = false

  const asked = [vx * dt, vz * dt]
  const made = slideOn(me, k, ground, asked)
  const [x, y, z] = b.pos
  const S = standOn(k, ground, x, z)
  let ny: number
  // A grounded drop the fall would reach is the landing below, taken within the step.
  if (following && S >= y) {
    ny = S
    vy = 0
  } else {
    vy -= k.gravity * dt
    ny = y + vy * dt
    following = false
    if (ny <= S) {
      vy = S < y ? (S - y) / dt : 0
      ny = S
      following = true
    }
  }
  b.pos = [x, ny, z]
  b.sliding = following && !!steep(k, ground, x, z, b.sliding || up ? k.maxSlope - k.slopeBand : k.maxSlope)
  b.grounded = following && !b.sliding

  b.vel = [eased(made[0], asked[0], vx, px, x, dt), vy, eased(made[1], asked[1], vz, pz, z, dt)]
  b.speed = math.hypot(b.vel[0], b.vel[2])
}

// ---------------------------------------------------------------- agents

// An agent kind's map of one ground: squares `agent` metres across from the origin, in tiles of TILE
// squares a side, each made the first time a body asks a square of it. A square is open where the
// kind may stand at its centre (S not steep there, the footprint's water no deeper than `wade`, and
// clear of every fixed solid by the kind's `radius`) and holds S there.
const TILE = 32
type Tile = { open: Uint8Array; h: Float64Array; solids: Footprint[] }
type AgentMap = { cell: number; tiles: Map<number, Tile> }
const maps = new WeakMap<Ground, Map<Numbers, AgentMap>>()

function mapOf(k: Numbers, ground: Ground): AgentMap {
  let byKind = maps.get(ground)
  if (!byKind) maps.set(ground, (byKind = new Map()))
  let m = byKind.get(k)
  if (!m) byKind.set(k, (m = { cell: k.agent!, tiles: new Map() }))
  return m
}

function tileOf(k: Numbers, ground: Ground, m: AgentMap, ti: number, tj: number, foot: Foot): Tile {
  const key = keyOf(ti, tj)
  const had = m.tiles.get(key)
  if (had) return had
  const c = m.cell
  const x0 = ti * TILE * c, z0 = tj * TILE * c
  const on = read(ground, x0, z0, 0, foot)
  // The fixed solids, asked once for the whole tile: every one reaching within the kind's radius of a
  // point of it, which an agent standing in it is pushed out of, each as its footprint.
  const side = TILE * c
  const fixed = (ground as Partial<Made>)[KEPT]?.fixed
  const solids = fixed ? fixed(x0 + side / 2, z0 + side / 2, (side / 2) * Math.SQRT2 + k.radius).map(foot) : []
  const t: Tile = { open: new Uint8Array(TILE * TILE), h: new Float64Array(TILE * TILE), solids }
  for (let j = 0; j < TILE; j++) {
    for (let i = 0; i < TILE; i++) {
      const x = x0 + (i + 0.5) * c, z = z0 + (j + 0.5) * c
      const n = j * TILE + i
      t.h[n] = standOn(k, on, x, z)
      const dry = depthOf(k, on, x, z) <= k.wade + TOLERANCE
      t.open[n] = dry && !steep(k, on, x, z) ? 1 : 0
    }
  }
  m.tiles.set(key, t)
  return t
}

// The bodies an agent kind is solid to, filed by walker's row at the start of every step, in squares
// twice the largest radius across: every row of a kind its `bodies` names but a limp one, where it
// stood as the step began, so every agent of a step is pushed out of the same bodies, whatever order
// the step moves them in.
type Crowd = { side: number; squares: Map<number, number[]>; ids: number[]; x: Float64Array; z: Float64Array; r: Float64Array }
const crowds = new WeakMap<W, Map<Numbers, Crowd>>()

function fileCrowd(w: W, k: Numbers): Crowd {
  const kinds = w.world.walker.kinds as Record<string, Numbers>
  const rows = (k.bodies ?? []).flatMap(kind => w.all(kind).filter(o => !o.data.limp && kinds[kindOf(o)]))
  const n = rows.length
  const x = new Float64Array(n), z = new Float64Array(n), r = new Float64Array(n)
  let most = 0
  rows.forEach((o, i) => {
    x[i] = o.data.pos[0]
    z[i] = o.data.pos[2]
    r[i] = kinds[kindOf(o)].radius
    most = Math.max(most, r[i])
  })
  const side = 2 * most
  const squares = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const key = keyOf(Math.floor(x[i] / side), Math.floor(z[i] / side))
    const list = squares.get(key)
    if (list) list.push(i)
    else squares.set(key, [i])
  }
  return { side, squares, ids: rows.map(o => o.id), x, z, r }
}

// walker's row. It has no field of its own: its `before` runs at the start of every step, ahead of
// every rule's `tick`. It makes the ground the scene's mods make on the scene's first step, so the
// ground is kept before any body walks, and files the crowd of every kind of the table that walks as an
// agent.
export const walker: Kind = {
  before(_me, _dt, w) {
    if (w.world.walker.mods?.height) groundOf(w)
    const byKind = new Map<Numbers, Crowd>()
    for (const k of Object.values(table(w))) if (k.agent !== undefined) byKind.set(k, fileCrowd(w, k))
    crowds.set(w, byKind)
  },
}

// Every body of the crowd but `me` whose circle reaches within r of (x, z), as its footprint.
function crowdNear(c: Crowd, me: number, x: number, z: number, r: number): Footprint[] {
  const out: Footprint[] = []
  if (!c.ids.length) return out
  // A body's centre lies in its own square, so one reaching within r lies within r + its radius.
  const reach = r + c.side / 2
  const i0 = Math.floor((x - reach) / c.side), i1 = Math.floor((x + reach) / c.side)
  const j0 = Math.floor((z - reach) / c.side), j1 = Math.floor((z + reach) / c.side)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      for (const n of c.squares.get(keyOf(i, j)) ?? []) {
        if (c.ids[n] === me) continue
        if (math.hypot(c.x[n] - x, c.z[n] - z) <= r + c.r[n]) out.push({ points: [[c.x[n], c.z[n]]], round: c.r[n] })
      }
    }
  }
  return out
}

// The solids an agent is pushed out of each step: on a ground `groundOf` made, the `solids` mod's, what
// moves; on any other, every solid it has, since none of them is on the map.
function movers(ground: Ground): Ground {
  const kept = (ground as Partial<Made>)[KEPT]
  if (!kept) return ground
  return { ...ground, solids: kept.moving ?? (() => []) }
}

// One step of a body whose kind walks as an agent.
function stride(me: Row, w: W, dt: number, ground: Ground, k: Numbers) {
  const b = me.data as Body
  const m = mapOf(k, ground)
  const c = m.cell
  const foot = footOf(behaviorsOf(w.world))
  // The square (i, j): whether it is open, and its height, found in its tile with nothing made.
  let tile!: Tile, n = 0
  const find = (i: number, j: number) => {
    const ti = Math.floor(i / TILE), tj = Math.floor(j / TILE)
    tile = tileOf(k, ground, m, ti, tj, foot)
    n = (j - tj * TILE) * TILE + (i - ti * TILE)
  }
  const open = (i: number, j: number) => { find(i, j); return tile.open[n] === 1 }
  const high = (i: number, j: number) => { find(i, j); return tile.h[n] }

  const [px, , pz] = b.pos
  const ease = 1 - math.exp(-k.accel * dt)
  const vx = b.vel[0] + (b.want[0] - b.vel[0]) * ease
  const vz = b.vel[2] + (b.want[1] - b.vel[2]) * ease
  turn(b, k, dt)
  b.jump = false

  const asked = [vx * dt, vz * dt]
  const crowd = crowds.get(w)?.get(k)
  if (!crowd) throw new Error(`walker kind ${kindOf(me)} walks as an agent among the crowd walker's row files each step, and the scene has no walker row`)
  const still = movers(ground)
  // The fixed solids round (x, z) are those its tile was handed, which hold every one within the kind's
  // radius of any point of it.
  const kept = (x: number, z: number, r: number) => {
    find(Math.floor(x / c), Math.floor(z / c))
    return tile.solids.filter(s => within(s, x, z, r))
  }
  const others: Read = {
    [READ]: true,
    height: still.height,
    solids: (x, z, r) => [...kept(x, z, r), ...still.solids(x, z, r).map(foot), ...crowdNear(crowd, me.id, x, z, r)],
  }
  const q = push(k, others, [px + asked[0], pz + asked[1]], [px, pz])
  // A point may be stood on from where the body stands: in its own square, or in an open square no more
  // than `step` above it. A body standing in a square that is not open may go anywhere.
  const i0 = Math.floor(px / c), j0 = Math.floor(pz / c)
  const from = open(i0, j0) ? high(i0, j0) : undefined
  const may = (x: number, z: number) => {
    const i = Math.floor(x / c), j = Math.floor(z / c)
    return from === undefined || (i === i0 && j === j0) || (open(i, j) && high(i, j) - from <= k.step + TOLERANCE)
  }
  // Refused, the move goes along the axis it moves most on alone, then the other, or not at all.
  let to = q
  if (!may(q[0], q[1])) {
    const byX = [q[0], pz], byZ = [px, q[1]]
    const [first, second] = Math.abs(q[0] - px) >= Math.abs(q[1] - pz) ? [byX, byZ] : [byZ, byX]
    to = may(first[0], first[1]) ? first : may(second[0], second[1]) ? second : [px, pz]
  }

  // The height between the four squares' centres round it: a square open and within `step` of the one
  // it stands in its own, and any other, the top of a riser or the foot of a ledge beside it, the
  // height of the square it stands in.
  const own = high(Math.floor(to[0] / c), Math.floor(to[1] / c))
  const gx = to[0] / c - 0.5, gz = to[1] / c - 0.5
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j
  const hh = (a: number, e: number) => {
    if (!open(a, e)) return own
    const h = high(a, e)
    return Math.abs(h - own) <= k.step + TOLERANCE ? h : own
  }
  const y = (hh(i, j) * (1 - fx) + hh(i + 1, j) * fx) * (1 - fz) + (hh(i, j + 1) * (1 - fx) + hh(i + 1, j + 1) * fx) * fz

  b.pos = [to[0], y, to[1]]
  b.vel = [eased(to[0] - px, asked[0], vx, px, to[0], dt), 0, eased(to[1] - pz, asked[1], vz, pz, to[1], dt)]
  b.speed = math.hypot(b.vel[0], b.vel[2])
  b.grounded = true
  b.sliding = false
}

export function relative(stick: number[], yaw: number): number[] {
  const s = math.sin(yaw), c = math.cos(yaw)
  const x = stick[1] * s - stick[0] * c
  const z = stick[1] * c + stick[0] * s
  const m = math.hypot(x, z)
  return m > 1 ? [x / m, z / m] : [x, z]
}

// ---------------------------------------------------------------- seeking

// A solid's footprint grown by the body's radius, about the body: its outline's corners `pts`, `r` its
// rounding grown, its middle `x`, `z` (its one corner, or the mean of its corners) and how far that is,
// `d`.
type Grown = { pts: number[][]; x: number; z: number; r: number; d: number }

// The way, a bearing about the target's, a grown footprint spans seen from the body: `at` its middle's,
// `lo` and `hi` how far it reaches either way of that, and `loReach` and `hiReach` how far from the
// body each edge's tangent point stands. A body within it sees it span a half turn.
function bearings(c: Grown, toward: number) {
  const at = wrap(math.atan2(c.x, c.z) - toward)
  if (c.pts.length === 1) {
    const half = c.d > c.r ? math.asin(c.r / c.d) : Math.PI / 2
    const reach = Math.sqrt(Math.max(0, c.d * c.d - c.r * c.r))
    return { at, lo: half, hi: half, loReach: reach, hiReach: reach }
  }
  if (gap({ points: c.pts, round: c.r }, 0, 0) <= c.r) return { at, lo: Math.PI / 2, hi: Math.PI / 2, loReach: 0, hiReach: 0 }
  let lo = -Infinity, hi = -Infinity, loReach = 0, hiReach = 0
  for (const [x, z] of c.pts) {
    const off = wrap(wrap(math.atan2(x, z) - toward) - at)
    const d = math.hypot(x, z)
    const half = d > c.r ? math.asin(c.r / d) : Math.PI / 2
    const reach = Math.sqrt(Math.max(0, d * d - c.r * c.r))
    if (half - off > lo) { lo = half - off; loReach = reach }
    if (off + half > hi) { hi = off + half; hiReach = reach }
  }
  return { at, lo, hi, loReach, hiReach }
}

// Where the line from the body along unit (ex, ez), `len` long, first enters a grown footprint whose
// middle is ahead of the body, or undefined when it does not come within it.
function onLine(c: Grown, ex: number, ez: number, len: number): number | undefined {
  const ahead = c.x * ex + c.z * ez
  if (!(ahead > 0)) return undefined
  if (c.pts.length === 1) {
    const t = Math.min(ahead, len)
    if (!(math.hypot(c.x - ex * t, c.z - ez * t) < c.r - TOLERANCE)) return undefined
    return ahead - Math.sqrt(Math.max(0, c.r * c.r - (c.d * c.d - ahead * ahead)))
  }
  if (!(passes(c.pts, ex * len, ez * len) < c.r - TOLERANCE)) return undefined
  return enter(c.pts, c.r, 0, 0, ex, ez)
}

// Whether two grown footprints overlap.
function overlap(a: Grown, b: Grown): boolean {
  if (a.pts.length === 1 && b.pts.length === 1) return math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r
  return apart(a.pts, b.pts) < a.r + b.r
}

export function seek(me: Row, w: W, target: number[], stop: number, on: Ground): boolean {
  const k = numbers(me, w)
  const b = me.data as Body
  const [px, , pz] = b.pos
  const tx = target[0] - px, tz = target[1] - pz
  const far = math.hypot(tx, tz)
  if (far <= stop) {
    b.want = [0, 0]
    b.side = 0
    b.turned = 0
    return true
  }
  // Read out past target, so the corridor and the groups round it are answered from one list.
  const ground = ready(me, w, k, on, far + k.radius)
  const toward = math.atan2(tx, tz)
  const heading = (a: number) => [k.seekSpeed * math.sin(a), k.seekSpeed * math.cos(a)]
  const ux = tx / far, uz = tz / far
  // A solid's footprint grown by the body's radius, about the body.
  const grow = (s: Footprint): Grown => {
    if (s.points.length === 1) {
      const x = s.points[0][0] - px, z = s.points[0][1] - pz
      return { pts: [[x, z]], x, z, r: s.round + k.radius, d: math.hypot(x, z) }
    }
    const pts = s.points.map(p => [p[0] - px, p[1] - pz])
    const x = pts.reduce((m, p) => m + p[0], 0) / pts.length, z = pts.reduce((m, p) => m + p[1], 0) / pts.length
    return { pts, x, z, r: s.round + k.radius, d: math.hypot(x, z) }
  }
  const key = (c: Grown) => (c.pts.length === 1 ? `${c.x} ${c.z} ${c.r}` : `${c.pts.map(p => `${p[0]} ${p[1]}`).join(' ')} ${c.r}`)
  // How far a grown footprint's corners stand from its middle.
  const spread = (c: Grown) => c.pts.reduce((m, p) => Math.max(m, math.hypot(p[0] - c.x, p[1] - c.z)), 0)

  // The solids along the corridor to target: discs radius·√2 across, every radius along the way,
  // hold every footprint that comes within the body's radius of it.
  const along = new Map<string, Grown>()
  for (let t = 0; ; t = Math.min(far, t + k.radius)) {
    for (const s of ground.solids(px + ux * t, pz + uz * t, k.radius * Math.SQRT2)) {
      const c = grow(s)
      along.set(key(c), c)
    }
    if (t === far) break
  }

  // The grown footprint the straight way to target enters first.
  let nearest = Infinity, first: Grown | undefined
  for (const c of along.values()) {
    const enters = onLine(c, ux, uz, far)
    if (enters === undefined) continue
    if (enters < nearest) { nearest = enters; first = c }
  }
  // A clear line is walked straight, and ends a way round.
  if (!first) {
    b.want = heading(toward)
    b.side = 0
    b.turned = 0
    return false
  }

  // A footprint's group: every grown footprint overlapping one already in it, asked of the ground
  // around each.
  const flood = (into: Map<string, Grown>, from: Grown) => {
    const added = new Map([[key(from), from]])
    for (const c of added.values()) {
      into.set(key(c), c)
      const round = c.pts.length === 1 ? c.r + k.radius : spread(c) + c.r + k.radius
      for (const s of ground.solids(c.x + px, c.z + pz, round).map(grow)) {
        if (!into.has(key(s)) && !added.has(key(s)) && overlap(s, c)) added.set(key(s), s)
      }
    }
  }
  const members = new Map<string, Grown>()
  flood(members, first)

  // The silhouette of the members, in bearings about target's, grown out from 0 over each footprint's
  // interval and its turns either way; undefined when it closes round the body. Each edge carries how
  // far its tangent point stands from the body.
  const silhouette = () => {
    const spans = [...members.values()].flatMap(c => {
      const { at, lo, hi, loReach, hiReach } = bearings(c, toward)
      return [-2 * Math.PI, 0, 2 * Math.PI].map(turn => ({ lo: at + turn - lo, hi: at + turn + hi, loReach, hiReach }))
    })
    let lo = 0, hi = 0, grew = true
    let loReach: number | undefined, hiReach: number | undefined
    while (grew && hi - lo < 2 * Math.PI) {
      grew = false
      for (const s of spans) {
        if (s.lo > hi || s.hi < lo) continue
        if (s.lo < lo) { lo = s.lo; loReach = s.loReach; grew = true }
        if (s.hi > hi) { hi = s.hi; hiReach = s.hiReach; grew = true }
      }
    }
    return hi - lo >= 2 * Math.PI || loReach === undefined || hiReach === undefined ? undefined : { lo, hi, loReach, hiReach }
  }

  // An edge on one side, a tangent to its member's grown footprint, and the way round by it: to the
  // tangent point, then straight on to target. A footprint the edge's ray enters before its tangent
  // point is in the way round, so it and its group join the members, and the edge is taken again.
  const edge = (side: number) => {
    for (;;) {
      const sil = silhouette()
      if (!sil) return undefined
      const rel = side === 1 ? sil.hi : sil.lo
      const a = toward + rel, ex = math.sin(a), ez = math.cos(a)
      const reach = side === 1 ? sil.hiReach : sil.loReach
      const blocking = ground.solids(px, pz, reach + k.radius).map(grow).find(c => !members.has(key(c)) && onLine(c, ex, ez, reach) !== undefined)
      if (!blocking) return { a, way: reach + math.hypot(tx - reach * ex, tz - reach * ez) }
      flood(members, blocking)
    }
  }

  // The side already taken, or, first blocked, the one whose way round is shorter. A way round that
  // has turned `want` a whole turn without the line coming clear is going round a pocket, and the
  // other side is taken.
  if (b.side !== 1 && b.side !== -1) {
    const up = edge(1), down = edge(-1)
    b.side = up && (!down || up.way < down.way) ? 1 : -1
    b.turned = 0
  } else if (Math.abs(b.turned) >= 2 * Math.PI) {
    b.side = -b.side
    b.turned = 0
  }
  const taken = edge(b.side)
  const was = b.want
  b.want = heading(taken ? taken.a : toward)
  if (math.hypot(was[0], was[1]) > TOLERANCE) b.turned += wrap(math.atan2(b.want[0], b.want[1]) - math.atan2(was[0], was[1]))
  return false
}
