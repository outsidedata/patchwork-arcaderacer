// npc3d, the server half: NPCs over two kinds of body, walkers drawn by anim and people drawn by
// crowd3d. What an NPC senses and what it does are said once, in its kind's definition; every order it
// gives goes to its body, and each body does what it can of an order and drops the rest, so one
// definition works on either body.
//
// Bodies. Every kind npc3d reads a place or a facing off names its body in its definition, `body`. A
// body says whether where it stands and faces is known for any moment (`continuous`, a course) or only
// for the step its row is of (moved step by step, drawn between the steps by the page):
//   walker   its row is walker's body and anim's fields: `pos` [x, y, z] metres where its feet stand,
//            `yaw` (yaw θ faces (sin θ, cos θ)), and walker's intents. Each step, after the NPC's own
//            work, it walks (`walk`, on the ground `world.walker.mods` makes) and is animated
//            (`animate`). Standing stops whatever anim plays as an act and plays the clip as one,
//            unless it is the clip of its rig's `still` role, which its gears play when it stands;
//            standing held, the clip is kept on its last frame (the body goes `limp` once it gets
//            there). Walking sets `goal`: walker's `seek` walks it there at its kind's `seekSpeed`,
//            round what is solid, its gears playing as it moves, and the walk ends within the
//            definition's `arrive` metres of it, where it stops, or where it is held up, getting
//            closer to it slower than the definition's `stall` `{ speed, time }` metres a second for
//            `time` seconds on end (its row's `gap` and `stalled`), as when bodies it keeps apart
//            from stand on the place and it would walk round them for ever; the walk's clip and
//            speed are dropped. With no goal it walks by its `want`: none once it has stood or
//            halted, or the way a behaviour that steers it itself has written there. Facing a way
//            sets walker's `face`, which it turns to at walker's `turnRate`, standing or walking:
//            walking, its legs take the gear of the way it walks against the way it faces, so it
//            strafes; a walk started after faces the way it walks again. Its hands play on anim's
//            upper channel, the legs going on as they were. It keeps apart from the bodies its
//            walker kind's `bodies` names (walker's).
//   crowd3d  its row is a crowd3d course: `pos` [x, y, z] metres where its feet stood at `since`,
//            seconds on npc3d's clock, `to` [x, y, z] where the course ends, `speed` metres a second
//            across the ground from `pos` toward `to`, `yaw`, `clip`, `body` and `holding`, written
//            only when an order changes it, and `through`, null on a straight course. Its feet stand on
//            the course as crowd3d draws it (`crowd3d.sim.ts`): the shapes3d line from `pos` to `to`, or
//            with `through` the shapes3d spline through `pos`, each of `through` and `to`, its height
//            along it, and at `to` once it has got there; on a spline it faces the way the piece it
//            walks goes.
//            Standing writes a course of speed 0 that ends where it stands, on the clip, held or not as
//            crowd3d's `hold` says of the clip; walking writes one straight to the place, its height
//            and all, or along the spline of a route's leg, at the order's speed on its clip, which
//            ends when it gets there, at the time worked out from how far it is across the ground and
//            the speed; when the NPC next thinks,
//            the course is cut back to where it got to then, the place itself. It plays one clip and
//            faces the way it walks: it turns at once, facing a way while walking is dropped, its hands
//            stop it where it is on their clip, and it walks through every other body.
//            A row that carries `normal`, or an order that hands one, stands on crowd3d's ground's up
//            (`crowd3d.sim.ts`, The ground's up): walking writes `normal` the up where it stands and
//            `normalTo` the order's, [0, 1, 0] where the order hands none; standing, halting and facing
//            write both the up where it stands, and the way it faces in that up's frame. A row that
//            carries none and is handed none stands on [0, 1, 0], its row never given either.
//
// Places. Every place an order sends a body to is [x, y, z]: the walker's feet stand on its ground
// wherever it walks, and it reads the place across the ground alone; a person's course goes to its
// height. A behaviour sends a body to a place whose height it knows (a row's feet, a fact's position, a
// route's node); to one it rolls across the ground (`wander`, `flee`), at the height its feet stand.
//
// Routes. A walk goes along a route when the scene names a `route` mod, `world.npc3d.mods.route`
// `(w, from, to) → [leg, …] | undefined` (`nav3d.npc3d.ts`, nav3d's `route` over the scene's
// graph: the places to go to in turn from `from` [x, y, z], each with its height, the last of them
// `to`, or undefined when there is no way). A leg is a place [x, y, z], walked to along the shapes3d line
// from the place before, or `{ at, normal }`, the place and the up of the ground there, or `{ spline:
// { points }, normal? }`, the shapes3d spline from the place before through `points` to its last, a
// graph link's course (a curved stair), and the up at its last. A person walks each leg onto its up
// (Bodies, above); a walker drops it. Its row's `route` is `{ points, leg,
// speed, clip }`: the legs, the one it walks now, and the walk's speed and clip; or null for a walk
// straight to the place, which is what a walk is with no mod, with no way, and when the way is
// straight. The body walks one leg at a time, so a person climbs a stair the route goes up leg by leg: a
// person along a spline leg as its course, a walker to each of the spline's points in turn. A walker walks to it, and within the
// definition's `arrive` of it with places left, goes on to the next the same step. A person is given
// one straight course to it, and when that course has come to its end, the next starts from where and
// when it ended. Only the last place ends the walk. A walker held up (`stall`, above) on the way to a
// place before the last asks for a new route to the last from where it stands; held up on the way to
// the last, its walk ends there, as one with no route does. A walk that ends, a key started and a walk
// sent somewhere else put `route` back to null.
//
// The plugin's row, `npc3d`, one `actors` entry:
//   time     the seconds its truth has run, the steps taken times the step's `dt`, as crowd3d's clock
//            counts them on the page, set in its `before` so every rule of the step reads the same
//            time (`now`).
//   sounds   a ledger of the sounds made (Hearing, below): each stays until its `last` seconds are
//            up, and the page draws each once by its id.
//   next     the id the next sound takes.
// In its `tick` it asks every NPC that is due to `think` (Choosing, below).
//
// An NPC is a row of a kind whose definition gives `sight`. Its rule, `npc`, each step: its look
// turns (Looking), the behaviour it is doing has its `tick`, its body does its own work, and it looks
// (Seeing, Noticing).
//
// Looking. Its eyes face the way its body faces turned by its head, its row's `look`, radians off the
// body (`eyes`), so when the body turns the eyes turn with it. Its row's `gaze` is the way, a yaw in
// the world, it wants its eyes to face, or null for straight ahead. The definition's `look` `{ rate,
// reach }`: each step `look` turns toward `gaze` less the way the body faces, kept within `reach`
// degrees either side, at most `rate` radians a second. Neither body draws the head: it is where the
// NPC sees from.
//
// Seeing. The definition's `sight` `{ eye, at, cone, range, edge: { cone, range, weight }, kinds }`:
// it looks at the rows of the kinds `kinds` lists, but itself, from `eye` metres over its feet to `at`
// metres over theirs. A row is in view when its feet stand within `range` metres over the ground and
// within half of `cone` degrees of the way its eyes face, either side, or within the edge's `range` and half its
// `cone`. It is seen when it is in view and nothing stands between the two points: the `sight` mod's,
// `world.npc3d.mods.sight` `(w, from, to) → boolean` (`hitscan3d.npc3d.ts`, hitscan3d's `sees`), with
// none named nothing stands between any two. Its row's `seen` is the ids of the rows it sees, lowest
// first, written as a new list only when they change.
//
// Facts. Everything an NPC knows is a fact, `{ type, position, time }`: a `type` (a kind of row seen,
// `intruder`, or a sound, `shot`), the `position` [x, y, z] it was at and the `time` it was. Its row's
// `facts` holds the newest fact of each type that has reached it; a fact of a type it holds takes the
// place of the one it held. A fact is let go once the definition's `memory` seconds have gone since its
// time. What an NPC has done about a fact is not npc3d's: a behaviour that cares (a game's, delivered
// by a mod) keeps that on the row itself, by the fact's type and time. Every behaviour acts on
// facts alone, never on how they reached it. A fact reaches an NPC by a check of distance and line of
// sight, and nothing else: an NPC that notices a row it sees (Noticing, below) is reached by a fact
// of the row's kind where it stands, each step it sees it; one within earshot of a sound (Hearing,
// below), by a fact of the sound's type where it was made.
//
// Noticing. Its row's `noticing` is how far it has got to noticing each row it has seen, `{ <id>: {
// kind, aware, time } }`: `aware` 0 to 1, and `time` when it last saw it. The definition's `notice`
// `{ time, fall }`: each step it sees a row its `aware` rises by dt / `time` times the weight it is
// seen with: in the cone, 1 less half how far it stands over `range` and half how far it stands off
// the way its eyes face over half the cone, so a row near and in the middle is noticed in `time`
// seconds and one at the cone's far corner never; in the edge alone, the edge's `weight` times 1 less
// how far it stands over the edge's `range`. At 1 it is noticed. A row it does not see: noticed, it is
// kept noticed until `memory` seconds have gone since it last saw it, so seen again it is noticed at
// once; not yet noticed, its `aware` falls by dt / `fall`, and at 0 it is let go. A row that has ended
// is let go.
//
// Hearing. `raise(w, by, type, position, loud, last)` makes a sound: `{ id, type, position, time,
// loud, last, by }` on the ledger, `position` [x, y, z], `loud` the metres it carries, `last` the
// seconds it stays there for the page, `by` the row that made it. Every NPC but `by` whose definition
// gives `hearing`, a number times every sound's `loud`, and whose feet stand within that of
// `position`, is reached by its fact, `{ type, position, time }`.
//
// Choosing. An NPC whose definition gives `behaviors` chooses what it does; one without stands as it
// is and only senses. Its definition:
//   think      seconds between its thinks, each NPC's from a start its id puts it at, so the thinks
//              of a crowd spread over the steps.
//   stay       the score added to the key it is doing while that is not over, so it is not dropped
//              for one that scores a hair higher.
//   whim       the most score added to each key at each think, rolled, so two NPCs alike in every
//              way choose differently.
//   react      [lo, hi] seconds: how long after it notices a row, or hears a sound, it thinks again,
//              rolled each time.
//   dies       the key it starts when it is killed (`hit`); its row carries `hp`, `dead`, and `hurt`,
//              the time it was last hit, 0 for never.
//   behaviors  `{ <key>: { <settings> } }`, what it can do. Each key's behaviour is the one its `as`
//              names, else the one named as the key, so one behaviour serves several keys with
//              settings of their own. The highest score wins; two the same go to the key listed
//              first. A key whose behaviour scores 0 or less is not chosen; with none to choose it
//              goes on as it is. A key whose settings give `commit` is not scored against while it is
//              not over: it goes on until its task is over.
//   any other  a list of kinds under any name, `"threats": ["guard"]`, which a behaviour's settings
//              name (`"at": "threats"`), so what relates to what is the definition's to say; a
//              setting naming a list the definition has not got throws, naming both.
// Its row carries `doing`, the key it is doing ('' before its first think), `until`, the time its task
// ends, 0 for one that does not end of itself, `wake`, the time something it sensed has it think
// again, 0 for none, and `arrived`, true from the step a walker body gets where it walked (and stops
// there) until the NPC next thinks, so that walk is told from a task that ended standing. The `npc3d` row asks it to think when its task has ended, when its `wake` has
// come, and each `think` seconds. A key whose walk has ended (`until` has come while its body walks)
// and whose behaviour has an `arrive` is arriving, not over: it keeps its stay, and its `arrive` does
// what it went there for. A task that is over runs its behaviour's `end` first, which may say the NPC
// is gone. Starting a key puts down what the NPC held, sets `gaze` back to null and `until` to 0.
// `force(key)` starts a key of its blob now, whatever it was doing; `order(key, x, y, z)` writes `told`
// [x, y, z] on its row and then starts the key: what something outside it makes it do.
//
// The behaviours are this file's (`base`) and those of every plugin `world.npc3d.mods.behaviors`
// names, each exporting `behaviors()`, `{ <name>: Behavior }`; a mod's behaviour of a base name takes
// its place. A blob naming a behaviour none of them has throws, naming it. The base behaviours:
//   idle         stands on a clip rolled from `clips` for seconds rolled within `for`. Its score is
//                its `weight`.
//   wander       walks on `clip` at `speed` to a place rolled within `reach` metres of where it
//                stands, kept within `bounds` [x, z] of the middle, and ends there. Its score is its
//                `weight`.
// A behaviour's `at` and `from` name a list of the definition's (`"at": "threats"`), whose names are
// types of facts: the kinds of rows it sees, or the types of sounds.
//   visit       goes near the nearest row of the kind `near` names and does something there. Its
//                score is its `weight` times how near that row is, none at `range`. It walks on
//                `walk` at `speed` to a place `off` [x, z] metres from that row, rolled within `spot`
//                [x, z] of it; there it faces the row and plays a clip rolled from `clips` for seconds
//                rolled within `for`, holding what `holding` names (crowd3d's `{ <place>: <item> }`).
//   go           walks on `clip` at `speed` to where it was told, `told`, and stands there on `stand`.
//                Never chosen (−∞): it is what `order` starts.
//   chase       goes to the nearest fact of the list `at` names. Its score is its `weight` times how
//                near that is, none at `range`. It walks on `clip` at `speed`, its eyes on it, walking
//                again to the nearest such fact once that is more than `near` from where it is going;
//                there it stands on `stand`, and is over.
//   flee         runs from a threat: the nearest fact of the list `from` names within `range`. Its
//                score is its `weight` times how near the threat is, none at `range`. It runs from
//                it (`away`, below) and stands there on a clip rolled from `clips` for seconds rolled
//                within `for`.
//   attack       shoots the nearest row of the list `at` names that it has noticed, sees now, and is
//                not `dead`, within `range`. Its score is its `weight` times how near it is, none at
//                `range`. It stands on `stand` facing it, its eyes on it, for seconds rolled within
//                `for`, and each step turns to it and, `rate` times a second, shoots from its `eye`
//                (its sight's) at `aim` metres over the row's feet, the shot turned off by up to
//                `spread` degrees each way, rolled, through the `shot` mod (`world.npc3d.mods.shot`,
//                `(w, from, dir, far, { skip, hurt }) → { point, id? } | undefined`), hurting what it
//                meets by `damage`. Each shot is written on its row, `shot` `{ from, to, time }`, has
//                its hands play `clip`, and makes a `shot` sound that carries `loud` metres and stays
//                `last` seconds. The row it shoots at dead, gone or out of sight ends it.
//   die          is never chosen (−∞): it is the key a definition's `dies` names. It stands on
//                `clip`, held on its last frame, for `for` seconds, and then the row ends.
import type { Kind, Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'
import { mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { groundOf, seek, walk } from '#plugins/walker/walker.sim.ts'
import { animate, gesture, play, rigOf, stop } from '#plugins/anim/anim.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { ends as courseEnds, facing as courseFacing, mid, piece as coursePiece, standing, UP, where as courseWhere } from '#plugins/crowd3d/crowd3d.sim.ts'

export type Settings = Record<string, any>
export type Fact = { type: string; position: number[]; time: number }
export type Sound = Fact & { id: number; loud: number; last: number; by: number }
export type Noticing = { kind: string; aware: number; time: number }
export type Shot = { point: number[]; id?: number } | undefined
type Sight = (w: W, from: number[], to: number[]) => boolean
type Shoot = (w: W, from: number[], dir: number[], far: number, opts: { skip: number[]; hurt: { damage: number; by: number } }) => Shot
// A place of a route: [x, y, z], or it with the up of the ground there, or a shapes3d spline whose points
// run from the place before to its end, with the up at its end.
export type Leg = number[] | { at: number[]; normal: number[] } | { spline: { points: number[][] }; normal?: number[] }
type Router = (w: W, from: number[], to: number[]) => Leg[] | undefined
export type Route = { points: Leg[]; leg: number; speed: number; clip: string }

// What carries out an NPC's orders, and where a row of the kind stands.
export type Body = {
  // Whether `where` and `facing` answer for any moment (a course), or only for the step its row is of
  // (a body moved step by step, which the page draws between the steps).
  continuous: boolean
  // Where its feet stand at `time`, [x, y, z].
  where(me: Row, time: number): number[]
  // The way it faces at `time`, a yaw.
  facing(me: Row, time: number): number
  // Stands it where it is on `clip`; with `hold`, kept on the clip's last frame once it is played.
  stand(me: Row, w: W, time: number, clip: string, hold?: boolean): void
  // Walks it to `to` [x, y, z], on `clip` at `speed` where the body walks by them, along the shapes3d
  // spline from where it stands through each place of `through` when given, else the line, onto the up
  // `normal` of the ground at `to` where the body stands on one; hands back when it gets there, or 0 when
  // the body says so itself once it has.
  go(me: Row, w: W, time: number, to: number[], speed: number, clip: string, through?: number[][], normal?: number[]): number
  // Whether it is walking.
  moving(me: Row): boolean
  // Stops its walk where it had got to at `time`, the time the walk ended, on the clip it walked on.
  halt(me: Row, time: number): void
  // Turns it to face `yaw`.
  face(me: Row, time: number, yaw: number): void
  // Has its hands play `clip`.
  hands(me: Row, w: W, time: number, clip: string): void
  // Has it hold `items`, crowd3d's `{ <place>: <item> }`, nothing for `{}`.
  hold(me: Row, items: Record<string, string>): void
  // Its own work each step, after the NPC's.
  tick?(me: Row, w: W, dt: number, time: number, k: Settings): void
}

export type Behavior = {
  // How much the NPC wants to do this now.
  score(me: Row, w: W, set: Settings, time: number, body: Body, k: Settings): number
  // Starts it: has the body do it, and writes the NPC's `until`.
  start(me: Row, w: W, set: Settings, time: number, body: Body, k: Settings): void
  // Its walk has ended where it was going: does what it went there for.
  arrive?(me: Row, w: W, set: Settings, time: number, body: Body, k: Settings): void
  // Each step while it is being done.
  tick?(me: Row, w: W, set: Settings, time: number, body: Body, k: Settings): void
  // Its task is over: what comes of it. Hands back true when the NPC is gone.
  end?(me: Row, w: W, set: Settings, time: number, body: Body, k: Settings): boolean
}

// `me`'s route put back to null (Routes, above).
const unroute = (me: Row) => {
  if (me.data.route !== null) me.data.route = null
}

// Walks `me` to `to` [x, y, z] on `clip` at `speed` (Routes, above): along a route there when the
// scene names a `route` mod and the way is not straight; else straight there. Hands back what the
// body's `go` hands back for the first place.
// Where a leg ends, and the places a spline goes through between where it starts and there.
// The up at a leg's end, and whether it is a spline.
const splined = (leg: Leg): leg is { spline: { points: number[][] }; normal?: number[] } => !Array.isArray(leg) && 'spline' in leg
const endOf = (leg: Leg): number[] => (Array.isArray(leg) ? leg : splined(leg) ? leg.spline.points[leg.spline.points.length - 1] : leg.at)
const throughOf = (leg: Leg): number[][] | undefined => (splined(leg) ? leg.spline.points.slice(1, -1) : undefined)
const normalOf = (leg: Leg): number[] | undefined => (Array.isArray(leg) ? undefined : leg.normal)

// A body walks a leg: along its spline where it is one and the body walks a course (crowd3d's); a body
// moved step by step (walker's) walks to each of the spline's places in turn instead, one leg each, and
// to each place without its up.
const legsFor = (body: Body, legs: Leg[]): Leg[] =>
  body.continuous ? legs : legs.flatMap(l => (Array.isArray(l) ? [l] : splined(l) ? l.spline.points.slice(1) : [l.at]))
const walkLeg = (me: Row, w: W, time: number, body: Body, leg: Leg, speed: number, clip: string) =>
  body.go(me, w, time, endOf(leg), speed, clip, throughOf(leg), normalOf(leg))

export function travel(me: Row, w: W, time: number, body: Body, to: number[], speed: number, clip: string): number {
  const ask = mod<Router>(w.world, 'npc3d', 'route')
  const points = legsFor(body, ask?.(w, body.where(me, time), to) ?? [])
  if (points.length < 2 && points.every(p => !splined(p))) {
    unroute(me)
    return body.go(me, w, time, to, speed, clip, undefined, points.length ? normalOf(points[0]) : undefined)
  }
  me.data.route = { points, leg: 0, speed, clip }
  return walkLeg(me, w, time, body, points[0], speed, clip)
}

// `me`'s route on to its next place at `time`, from where the leg before ended: hands back what the
// body's `go` hands back, or undefined when it was walking to its last.
function onward(me: Row, w: W, body: Body, time: number): number | undefined {
  const r: Route | null = me.data.route
  if (!r || r.leg >= r.points.length - 1) return undefined
  const leg = r.leg + 1
  me.data.route = { ...r, leg }
  return walkLeg(me, w, time, body, r.points[leg], r.speed, r.clip)
}

// Where a crowd3d course puts its feet at `time`, as crowd3d draws it (`crowd3d.sim.ts`'s `where`): on
// its shapes3d line or spline, as far along it as its speed carries it across the ground since `since`.
const onCourse = (row: Row, time: number): number[] => courseWhere(row, time)

// A crowd3d course written straight: `through` let go, where it held a spline.
const straight = (me: Row) => {
  if (me.data.through) me.data.through = null
}

// A crowd3d course's ups written: `normal` where it starts, `normalTo` where it ends.
const upOn = (me: Row, normal: number[], normalTo: number[]) => {
  me.data.normal = [normal[0], normal[1], normal[2]]
  me.data.normalTo = [normalTo[0], normalTo[1], normalTo[2]]
}

// A crowd3d course stood still where it had got to at `time`: there, from then, on the up there where the
// row carries one, facing as it faced then in that up's frame.
const still = (me: Row, time: number) => {
  const here = standing(me, time)
  me.data.pos = here.at
  me.data.to = [...here.at]
  straight(me)
  if (me.data.normal !== undefined) upOn(me, here.normal, here.normal)
  me.data.since = time
  me.data.yaw = here.yaw
}

export const bodies: Record<string, Body> = {
  walker: {
    continuous: false,
    where: me => me.data.pos,
    facing: me => me.data.yaw,
    stand(me, w, _time, clip, hold) {
      me.data.goal = null
      me.data.want = [0, 0]
      me.data.rest = hold ? clip : null
      stop(me, w)
      if (clip !== rigOf(w, me.kind).roles.still) play(me, clip, { holds: hold })
    },
    go(me, w, _time, to) {
      stop(me, w)
      me.data.face = null
      me.data.goal = [to[0], to[2]]
      me.data.stalled = 0
      me.data.gap = null
      return 0
    },
    moving: me => me.data.goal !== null,
    halt(me) {
      me.data.goal = null
      me.data.want = [0, 0]
      me.data.stalled = 0
      me.data.gap = null
    },
    face(me, _time, yaw) { me.data.face = yaw },
    hands(me, _w, _time, clip) { gesture(me, clip) },
    hold() {},
    // With a `goal`, walker's `seek` walks it there; within the definition's `arrive` it has got
    // there, and its task ends now. A walk held up, getting closer to its goal slower than the
    // definition's `stall.speed` for `stall.time` seconds on end (its row's `gap`, how far it was from
    // the goal the step before, and `stalled`, the seconds it has been held up), ends where it is, as
    // got there: the place is taken by bodies it keeps apart from, and it would walk round them for
    // ever. On a route (Routes, above), a goal got to with places left is the next place, sought the
    // same step, and held up on the way to one before the last, it asks for a new route to the last
    // from where it stands. Without a goal it walks by the `want` it has: none once it has stood or
    // halted, or the way a behaviour that steers it itself wrote (melee3d's `fight`). A clip it was stood on to be
    // held (`rest`) is kept on its last frame: the step its playhead reaches within a step of the
    // clip's end the body goes `limp`, which anim draws no more and walker passes through.
    tick(me, w, dt, time, k) {
      const ground = groundOf(w)
      if (me.data.goal) {
        let there = seek(me, w, me.data.goal, k.arrive, ground)
        while (there && onward(me, w, bodies.walker, time) !== undefined) there = seek(me, w, me.data.goal, k.arrive, ground)
        const gap = math.hypot(me.data.goal[0] - me.data.pos[0], me.data.goal[1] - me.data.pos[2])
        const closing = me.data.gap === null ? Infinity : (me.data.gap - gap) / dt
        me.data.gap = gap
        const stalled = closing < k.stall.speed ? me.data.stalled + dt : 0
        if (stalled !== me.data.stalled) me.data.stalled = stalled
        const r: Route | null = me.data.route
        if (!there && stalled >= k.stall.time && r && r.leg < r.points.length - 1) {
          travel(me, w, time, bodies.walker, endOf(r.points[r.points.length - 1]), r.speed, r.clip)
          seek(me, w, me.data.goal, k.arrive, ground)
        } else if (there || stalled >= k.stall.time) {
          me.data.goal = null
          me.data.want = [0, 0]
          me.data.stalled = 0
          me.data.gap = null
          if (me.data.until === 0) me.data.until = time
          me.data.arrived = true
          unroute(me)
        }
      }
      walk(me, w, dt, ground)
      me.data.jump = false
      animate(me, w, dt)
      if (me.data.rest && me.data.state === 'act' && me.data.clip === me.data.rest && me.data.clipT >= rigOf(w, me.kind).table[me.data.rest].dur - dt) {
        me.data.limp = true
        me.data.rest = null
      }
    },
  },
  crowd3d: {
    continuous: true,
    where: onCourse,
    // The way the piece it walks faces: on a spline, turning with the curve.
    facing: (me, time) => coursePiece(me, time).yaw,
    stand(me, _w, time, clip) {
      still(me, time)
      me.data.speed = 0
      me.data.clip = clip
    },
    // Along `through` a spline from where it stands, through each of its places, to `to`; else the line.
    go(me, _w, time, to, speed, clip, through, normal) {
      const here = standing(me, time)
      const at = here.at
      const ups = normal !== undefined || me.data.normal !== undefined
      const n0 = ups ? here.normal : UP, n1 = normal ?? UP
      me.data.pos = at
      me.data.since = time
      me.data.clip = clip
      me.data.to = [to[0], to[1], to[2]]
      if (through?.length) me.data.through = through.map(p => [p[0], p[1], p[2]])
      else straight(me)
      if (ups) upOn(me, n0, n1)
      me.data.speed = speed
      me.data.yaw = through?.length ? coursePiece(me, time).yaw : courseFacing(at, to, mid(n0, n1), here.yaw)
      return courseEnds(me)
    },
    moving: me => me.data.speed > 0,
    halt(me, time) {
      still(me, time)
      me.data.speed = 0
    },
    // A person walks the way it faces: walking, it keeps its course; standing, it turns at once.
    face(me, time, yaw) {
      if (me.data.speed > 0) return
      still(me, time)
      me.data.yaw = yaw
    },
    // A person plays one clip: its hands stop it where it is.
    hands(me, w, time, clip) { bodies.crowd3d.stand(me, w, time, clip) },
    hold(me, items) {
      if (Object.keys(items).length || Object.keys(me.data.holding).length) me.data.holding = { ...items }
    },
  },
}

// The body a kind's definition names.
export function bodyOf(kind: string, k: Settings): Body {
  const body = bodies[k.body]
  if (!body) throw new Error(`npc3d has no body ${k.body}, which ${kind}'s definition names`)
  return body
}

// The kinds whose definitions give `sight`, of the scene's definitions file.
export function npcs(from: W | Wire): string[] {
  const defs = json(from, ('find' in from ? from.world : from.scene.world).defs)
  return Object.keys(defs).filter(k => defs[k].sight !== undefined)
}

// The clock: the seconds the truth has run, as the `npc3d` row keeps it.
export const now = (w: W): number => w.find('npc3d').data.time

// The list of kinds a setting names, off an NPC's definition.
export function listOf(kind: string, k: Settings, name: string): string[] {
  const list = k[name]
  if (!Array.isArray(list)) throw new Error(`${kind}'s definition has no list ${name}, which one of its behaviours names`)
  return list
}

// A number rolled within [lo, hi], and a thing rolled from a list, on the truth's die.
export const roll = (w: W, [lo, hi]: number[]) => lo + (hi - lo) * w.die()
export const pick = <T>(w: W, list: T[]): T => list[Math.floor(w.die() * list.length)]

// How near: 1 on it, 0 at `range` and beyond.
export const nearness = (far: number, range: number) => Math.max(0, 1 - far / range)

// The way from (ax, az) to (bx, bz), a yaw.
export const toward = (ax: number, az: number, bx: number, bz: number) => math.atan2(bx - ax, bz - az)

// An angle taken round into (−π, π].
const wrap = (a: number) => math.atan2(math.sin(a), math.cos(a))

// How a row standing at `to` is in view of an eye at `at` looking along `look`: the weight it is seen
// with (Noticing, above), or 0 when it is in neither the cone nor the edge.
export function inView(sight: Settings, at: number[], look: number, to: number[]): number {
  const dx = to[0] - at[0], dz = to[2] - at[2]
  const far = math.hypot(dx, dz)
  const off = far === 0 ? 0 : Math.abs(wrap(math.atan2(dx, dz) - look))
  const half = (sight.cone * Math.PI) / 360
  if (far <= sight.range && off <= half) return Math.max(0, 1 - (far / sight.range + off / half) / 2)
  const edge = sight.edge
  if (edge && far <= edge.range && off <= (edge.cone * Math.PI) / 360) return edge.weight * (1 - far / edge.range)
  return 0
}

// The rows `me` sees now, each with the weight it is seen with, lowest id first.
export function seeing(me: Row, w: W, k: Settings, time: number): { row: Row; at: number[]; weight: number }[] {
  const body = bodyOf(me.kind, k)
  const feet = body.where(me, time)
  const eye = [feet[0], feet[1] + k.sight.eye, feet[2]]
  const look = eyes(me, body, time)
  const sight = mod<Sight>(w.world, 'npc3d', 'sight')
  const out: { row: Row; at: number[]; weight: number }[] = []
  for (const kind of k.sight.kinds) {
    const theirs = bodyOf(kind, def(w, kind))
    for (const row of w.all(kind)) {
      if (row === me) continue
      const at = theirs.where(row, time)
      const weight = inView(k.sight, feet, look, at)
      if (weight <= 0) continue
      if (sight && !sight(w, eye, [at[0], at[1] + k.sight.at, at[2]])) continue
      out.push({ row, at, weight })
    }
  }
  return out.sort((a, b) => a.row.id - b.row.id)
}

// The facts of `types` `me` holds, each with how far its position is from `me`'s feet, nearest first.
export function recall(me: Row, w: W, types: string[], time: number): { fact: Fact; far: number }[] {
  const feet = bodyOf(me.kind, def(w, me.kind)).where(me, time)
  return (me.data.facts as Fact[])
    .filter(f => types.includes(f.type))
    .map(fact => ({ fact, far: math.hypot(fact.position[0] - feet[0], fact.position[2] - feet[2]) }))
    .sort((a, b) => a.far - b.far)
}

// `facts` with `fact` in the place of the one of its type, or after them all when there is none.
function learn(facts: Fact[], fact: Fact): Fact[] {
  const i = facts.findIndex(f => f.type === fact.type)
  return i < 0 ? [...facts, fact] : facts.map((f, j) => (j === i ? fact : f))
}

// Has `me` think again `react` seconds from now, rolled, unless it chooses nothing or something sooner
// is due.
function rouse(me: Row, w: W, k: Settings, time: number) {
  if (!k.behaviors) return
  const at = time + roll(w, k.react)
  me.data.wake = me.data.wake > 0 ? Math.min(me.data.wake, at) : at
}

// Makes a sound, and has its fact reach every NPC within earshot of it (Hearing, above).
export function raise(w: W, by: Row, type: string, position: number[], loud: number, last: number) {
  const ledger = w.find('npc3d')
  const time = ledger.data.time
  const id = ledger.data.next
  const fact: Fact = { type, position: [position[0], position[1], position[2]], time }
  ledger.data.sounds = [...ledger.data.sounds, { ...fact, id, loud, last, by: by.id }]
  ledger.data.next += 1
  for (const kind of npcs(w)) {
    const k = def(w, kind)
    if (k.hearing === undefined) continue
    const body = bodyOf(kind, k)
    for (const row of w.all(kind)) {
      if (row === by) continue
      const feet = body.where(row, time)
      if (math.hypot(feet[0] - position[0], feet[2] - position[2]) > loud * k.hearing) continue
      row.data.facts = learn(row.data.facts, fact)
      rouse(row, w, k, time)
    }
  }
}

// Turns `me`'s head toward its gaze, within its reach of the way its body faces, by at most its rate.
function turnLook(me: Row, k: Settings, body: Body, dt: number, time: number) {
  const reach = (k.look.reach * Math.PI) / 180
  const want = me.data.gaze === null ? 0 : Math.max(-reach, Math.min(reach, wrap(me.data.gaze - body.facing(me, time))))
  const off = want - me.data.look
  const most = k.look.rate * dt
  const look = Math.abs(off) <= most ? want : me.data.look + Math.sign(off) * most
  if (look !== me.data.look) me.data.look = look
}

// The way an NPC's eyes face at `time`, a yaw: the way its body faces, turned by its head's `look`.
export const eyes = (me: Row, body: Body, time: number): number => wrap(body.facing(me, time) + me.data.look)

// What `me` sees, notices and knows, brought up to date for this step (Facts, Noticing, above).
function sense(me: Row, w: W, k: Settings, dt: number, time: number) {
  const seen = seeing(me, w, k, time)
  const ids = seen.map(s => s.row.id)
  if (ids.length !== me.data.seen.length || ids.some((id, i) => id !== me.data.seen[i])) me.data.seen = ids
  const noticing: Record<string, Noticing> = {}
  let facts: Fact[] = me.data.facts
  for (const s of seen) {
    const was: Noticing | undefined = me.data.noticing[s.row.id]
    const aware = Math.min(1, (was?.aware ?? 0) + (dt / k.notice.time) * s.weight)
    if (aware >= 1 && !(was && was.aware >= 1)) rouse(me, w, k, time)
    noticing[s.row.id] = { kind: s.row.kind, aware, time }
    if (aware >= 1) facts = learn(facts, { type: s.row.kind, position: s.at, time })
  }
  for (const [id, it] of Object.entries(me.data.noticing as Record<string, Noticing>)) {
    if (noticing[id] || !w.all(it.kind).some(r => r.id === Number(id))) continue
    if (it.aware >= 1) {
      if (time - it.time <= k.memory) noticing[id] = it
      continue
    }
    const aware = it.aware - dt / k.notice.fall
    if (aware > 0) noticing[id] = { ...it, aware }
  }
  me.data.noticing = noticing
  if (facts.some(f => time - f.time > k.memory)) facts = facts.filter(f => time - f.time <= k.memory)
  if (facts !== me.data.facts) me.data.facts = facts
}

// Where the threat `flee` runs from stands, [x, y, z], and its score, or undefined when there is none.
function threatOf(me: Row, w: W, set: Settings, k: Settings, time: number): { at: number[]; score: number } | undefined {
  const near = recall(me, w, listOf(me.kind, k, set.from), time)[0]
  if (!near || near.far > set.range) return undefined
  return { at: near.fact.position, score: set.weight * nearness(near.far, set.range) }
}

// Runs `me` from `from` [x, y, z]: on its settings' `clip` at `speed`, `away` metres straight from it
// across the ground (a way rolled when it stands on it), kept within `bounds` [x, z] of the middle, to a
// place at the height its feet stand; writes its `until`.
export function away(me: Row, w: W, set: Settings, time: number, body: Body, from: number[]) {
  const at = body.where(me, time)
  const dx = at[0] - from[0], dz = at[2] - from[2], far = math.hypot(dx, dz)
  const a = far > 0 ? math.atan2(dx, dz) : 2 * Math.PI * w.die()
  const x = Math.max(-set.bounds[0], Math.min(set.bounds[0], at[0] + set.away * math.sin(a)))
  const z = Math.max(-set.bounds[1], Math.min(set.bounds[1], at[2] + set.away * math.cos(a)))
  me.data.until = travel(me, w, time, body, [x, at[1], z], set.speed, set.clip)
}

// The row `attack` shoots: the nearest row of its list that `me` sees now, has noticed, and is not
// dead, within `range`, with where it stands and how far.
function targetOf(me: Row, w: W, set: Settings, k: Settings, time: number): { row: Row; at: number[]; far: number } | undefined {
  const kinds = listOf(me.kind, k, set.at)
  const feet = bodyOf(me.kind, k).where(me, time)
  let best: { row: Row; at: number[]; far: number } | undefined
  for (const id of me.data.seen as number[]) {
    const it: Noticing | undefined = me.data.noticing[id]
    if (!it || it.aware < 1 || !kinds.includes(it.kind)) continue
    const row = w.all(it.kind).find(r => r.id === id)
    if (!row || row.data.dead) continue
    const at = bodyOf(row.kind, def(w, row.kind)).where(row, time)
    const far = math.hypot(at[0] - feet[0], at[2] - feet[2])
    if (far <= set.range && (!best || far < best.far)) best = { row, at, far }
  }
  return best
}

export const base: Record<string, Behavior> = {
  idle: {
    score: (_me, _w, set) => set.weight,
    start(me, w, set, time, body) {
      body.stand(me, w, time, pick(w, set.clips))
      me.data.until = time + roll(w, set.for)
    },
  },
  wander: {
    score: (_me, _w, set) => set.weight,
    start(me, w, set, time, body) {
      const at = body.where(me, time)
      const a = 2 * Math.PI * w.die(), r = set.reach * Math.sqrt(w.die())
      const x = Math.max(-set.bounds[0], Math.min(set.bounds[0], at[0] + r * math.sin(a)))
      const z = Math.max(-set.bounds[1], Math.min(set.bounds[1], at[2] + r * math.cos(a)))
      me.data.until = travel(me, w, time, body, [x, at[1], z], set.speed, set.clip)
    },
  },
  visit: {
    score(me, w, set, time, body) {
      const at = body.where(me, time)
      const near = nearestRow(w, set.near, at)
      return near ? set.weight * nearness(near.far, set.range) : 0
    },
    start(me, w, set, time, body) {
      const at = body.where(me, time)
      const place = nearestRow(w, set.near, at)!.at
      const x = place[0] + set.off[0] + (w.die() * 2 - 1) * set.spot[0]
      const z = place[2] + set.off[1] + (w.die() * 2 - 1) * set.spot[1]
      me.data.until = travel(me, w, time, body, [x, place[1], z], set.speed, set.walk)
    },
    arrive(me, w, set, time, body) {
      const at = body.where(me, time)
      const place = nearestRow(w, set.near, at)!.at
      body.stand(me, w, time, pick(w, set.clips))
      body.face(me, time, toward(at[0], at[2], place[0], place[2]))
      body.hold(me, set.holding ?? {})
      me.data.until = time + roll(w, set.for)
    },
  },
  go: {
    score: () => -Infinity,
    start(me, w, set, time, body) {
      me.data.until = travel(me, w, time, body, me.data.told, set.speed, set.clip)
    },
    arrive(me, w, set, time, body) {
      body.stand(me, w, time, set.stand)
      me.data.until = 0
    },
  },
  chase: {
    score(me, w, set, time, _body, k) {
      const prey = recall(me, w, listOf(me.kind, k, set.at), time)[0]
      return prey ? set.weight * nearness(prey.far, set.range) : 0
    },
    start(me, w, set, time, body, k) {
      const p = recall(me, w, listOf(me.kind, k, set.at), time)[0].fact.position
      me.data.told = [p[0], p[1], p[2]]
      me.data.until = travel(me, w, time, body, me.data.told, set.speed, set.clip)
    },
    tick(me, w, set, time, body, k) {
      const prey = recall(me, w, listOf(me.kind, k, set.at), time)[0]
      if (!prey || !body.moving(me)) return
      const p = prey.fact.position
      const at = body.where(me, time)
      me.data.gaze = toward(at[0], at[2], p[0], p[2])
      if (math.hypot(p[0] - me.data.told[0], p[2] - me.data.told[2]) <= set.near) return
      me.data.told = [p[0], p[1], p[2]]
      me.data.until = travel(me, w, time, body, me.data.told, set.speed, set.clip)
    },
    arrive(me, w, set, time, body) {
      body.stand(me, w, time, set.stand)
      me.data.until = time
    },
  },
  flee: {
    score: (me, w, set, time, _body, k) => threatOf(me, w, set, k, time)?.score ?? 0,
    start(me, w, set, time, body, k) {
      away(me, w, set, time, body, threatOf(me, w, set, k, time)!.at)
    },
    arrive(me, w, set, time, body) {
      body.stand(me, w, time, pick(w, set.clips))
      me.data.until = time + roll(w, set.for)
    },
  },
  attack: {
    score(me, w, set, time, _body, k) {
      const target = targetOf(me, w, set, k, time)
      return target ? set.weight * nearness(target.far, set.range) : 0
    },
    start(me, w, set, time, body, k) {
      const target = targetOf(me, w, set, k, time)!
      const at = body.where(me, time)
      body.stand(me, w, time, set.stand)
      body.face(me, time, toward(at[0], at[2], target.at[0], target.at[2]))
      me.data.target = target.row.id
      me.data.next = time
      me.data.until = time + roll(w, set.for)
    },
    tick(me, w, set, time, body, k) {
      const it: Noticing | undefined = me.data.noticing[me.data.target]
      const row = it && w.all(it.kind).find(r => r.id === me.data.target)
      if (!row || row.data.dead || !me.data.seen.includes(row.id)) {
        me.data.until = time
        return
      }
      const there = bodyOf(row.kind, def(w, row.kind)).where(row, time)
      const at = body.where(me, time)
      const yaw = toward(at[0], at[2], there[0], there[2])
      body.face(me, time, yaw)
      me.data.gaze = yaw
      if (time < me.data.next) return
      me.data.next = time + 1 / set.rate
      const from = [at[0], at[1] + k.sight.eye, at[2]]
      const aim = [there[0] - from[0], there[1] + set.aim - from[1], there[2] - from[2]]
      const spread = (set.spread * Math.PI) / 180
      const turn = math.atan2(aim[0], aim[2]) + (w.die() * 2 - 1) * spread
      const pitch = math.atan2(aim[1], math.hypot(aim[0], aim[2])) + (w.die() * 2 - 1) * spread
      const dir = [math.sin(turn) * math.cos(pitch), math.sin(pitch), math.cos(turn) * math.cos(pitch)]
      const shoot = mod<Shoot>(w.world, 'npc3d', 'shot')
      if (!shoot) throw new Error(`${me.kind} attacks, and the scene names no world.npc3d.mods.shot`)
      const hit = shoot(w, from, dir, set.range, { skip: [me.id], hurt: { damage: set.damage, by: me.id } })
      me.data.shot = { from, to: hit ? hit.point : from.map((v, i) => v + dir[i] * set.range), time }
      body.hands(me, w, time, set.clip)
      raise(w, me, 'shot', at, set.loud, set.last)
    },
  },
  die: {
    score: () => -Infinity,
    start(me, w, set, time, body) {
      body.stand(me, w, time, set.clip, true)
      me.data.until = time + set.for
    },
    end(me, w) {
      w.end(me)
      return true
    },
  },
}

// The row of kind `kind` nearest `at` [x, y, z], where it stands, and how far, or undefined for none: a
// row of a kind whose definition names a body where its body says, any other at its `pos`.
function nearestRow(w: W, kind: string, at: number[]): { row: Row; at: number[]; far: number } | undefined {
  const k = json(w, w.world.defs)[kind]
  const body = k?.body === undefined ? undefined : bodyOf(kind, k)
  const time = now(w)
  let best: { row: Row; at: number[]; far: number } | undefined
  for (const row of w.all(kind)) {
    const p = body ? body.where(row, time) : row.data.pos
    const far = math.hypot(p[0] - at[0], p[2] - at[2])
    if (!best || far < best.far) best = { row, at: p, far }
  }
  return best
}

// Every behaviour the scene has: the base ones, and over them each mod's in the order they are named;
// made once per scene's `world`, whose mods never change.
const made = new WeakMap<object, Record<string, Behavior>>()
function behaviorsOf(world: any): Record<string, Behavior> {
  let all = made.get(world)
  if (!all) {
    all = { ...base }
    for (const m of modsOf<() => Record<string, Behavior>>(world, 'npc3d', 'behaviors')) Object.assign(all, m())
    made.set(world, all)
  }
  return all
}

// The behaviour a key of an NPC's blob runs: the one its `as` names, else the key's own.
function behaviorOf(all: Record<string, Behavior>, kind: string, key: string, set: Settings): Behavior {
  const name = set.as ?? key
  const b = all[name]
  if (!b) throw new Error(`npc3d has no behaviour ${name}, which ${kind}'s behaviors names`)
  return b
}

// Starts `key` of an NPC's blob: what it held is put down first, and its eyes go back to the way it
// faces.
function startKey(me: Row, w: W, key: string, time: number) {
  const k = def(w, me.kind)
  const set = k.behaviors?.[key]
  if (!set) throw new Error(`${me.kind}'s behaviors has no ${key}`)
  const body = bodyOf(me.kind, k)
  me.data.doing = key
  me.data.until = 0
  me.data.gaze = null
  me.data.arrived = false
  unroute(me)
  body.hold(me, {})
  behaviorOf(behaviorsOf(w.world), me.kind, key, set).start(me, w, set, time, body, k)
}

// The golden ratio's fraction: an id times it, wrapped round 1, puts each NPC's thinks at its own
// point of its period.
const GOLDEN = 0.6180339887498949

export const npc3d: Kind = {
  before(me, dt) {
    me.data.time = (Math.round(me.data.time / dt) + 1) * dt
    const time = me.data.time
    if (me.data.sounds.some((s: Sound) => s.time + s.last <= time)) me.data.sounds = me.data.sounds.filter((s: Sound) => s.time + s.last > time)
  },
  tick(me, dt, w) {
    const time = me.data.time
    for (const kind of npcs(w)) {
      const k = def(w, kind)
      if (!k.behaviors) continue
      for (const row of w.all(kind)) {
        const ended = row.data.until > 0 && row.data.until <= time
        const woke = row.data.wake > 0 && row.data.wake <= time
        const off = ((row.id * GOLDEN) % 1) * k.think
        const round = Math.floor((time + off) / k.think) !== Math.floor((time - dt + off) / k.think)
        if (ended || woke || round) w.call(row, 'think', -1, time)
      }
    }
  },
}

// An NPC's rule, whatever its body: what every kind whose definition gives `sight` hands out as its
// own, `export const <kind> = npc`.
export const npc: Kind = {
  tick(me, dt, w) {
    const k = def(w, me.kind)
    const body = bodyOf(me.kind, k)
    const time = now(w)
    turnLook(me, k, body, dt, time)
    if (me.data.doing) {
      const set = k.behaviors[me.data.doing]
      behaviorOf(behaviorsOf(w.world), me.kind, me.data.doing, set).tick?.(me, w, set, time, body, k)
    }
    body.tick?.(me, w, dt, time, k)
    sense(me, w, k, dt, time)
  },
  acts: {
    think(me, w, _seat, time: number) {
      if (me.data.wake !== 0) me.data.wake = 0
      const k = def(w, me.kind)
      const body = bodyOf(me.kind, k)
      const all = behaviorsOf(w.world)
      const ended = me.data.until > 0 && me.data.until <= time
      // A walk on a route that has got to a place before its last goes on to the next, from where and
      // when it got there: the walk is not over.
      if (ended && body.moving(me)) {
        const next = onward(me, w, body, me.data.until)
        if (next !== undefined) {
          me.data.until = next
          return
        }
      }
      // A walk that has ended on the way to something the behaviour does when it gets there is that
      // behaviour arriving, not over: it keeps its stay.
      const doing = me.data.doing ? behaviorOf(all, me.kind, me.data.doing, k.behaviors[me.data.doing]) : undefined
      const walked = ended && (body.moving(me) || me.data.arrived)
      // A walk that has ended stops where it had got to when it ended, not where the step after has
      // carried it.
      if (ended && body.moving(me)) body.halt(me, me.data.until)
      if (walked) unroute(me)
      if (me.data.arrived) me.data.arrived = false
      const arriving = walked && doing?.arrive !== undefined
      const over = ended && !arriving
      // A committed key goes on, whatever scores higher, until it is over.
      if (doing && k.behaviors[me.data.doing].commit && !over) {
        if (arriving) doing.arrive!(me, w, k.behaviors[me.data.doing], time, body, k)
        return
      }
      if (over && doing?.end && doing.end(me, w, k.behaviors[me.data.doing], time, body, k)) return
      let best = '', top = -Infinity
      for (const [key, set] of Object.entries(k.behaviors as Record<string, Settings>)) {
        const score = behaviorOf(all, me.kind, key, set).score(me, w, set, time, body, k)
        if (score <= 0) continue
        const total = score + w.die() * k.whim + (key === me.data.doing && !over ? k.stay : 0)
        if (total > top) { best = key; top = total }
      }
      if (!best) {
        if (arriving) doing!.arrive!(me, w, k.behaviors[me.data.doing], time, body, k)
        return
      }
      if (best === me.data.doing && !over) {
        if (arriving) doing!.arrive!(me, w, k.behaviors[best], time, body, k)
        return
      }
      startKey(me, w, best, time)
    },
    // Has it start `key` of its blob now, whatever it was doing.
    force(me, w, _seat, key: string) {
      startKey(me, w, key, now(w))
    },
    // Tells it a place, `told` [x, y, z], and has it start `key` of its blob now.
    order(me, w, _seat, key: string, x: number, y: number, z: number) {
      me.data.told = [x, y, z]
      startKey(me, w, key, now(w))
    },
    // Hurts it (hitscan3d's `Struck`): its `hp` goes down by the damage, and at none it is `dead` and
    // starts its definition's `dies` key. A dead NPC is hurt no more.
    hit(me, w, _seat, struck: { damage: number }) {
      if (me.data.dead) return
      me.data.hp -= struck.damage
      me.data.hurt = now(w)
      if (me.data.hp > 0) return
      me.data.dead = true
      startKey(me, w, def(w, me.kind).dies, now(w))
    },
  },
}
