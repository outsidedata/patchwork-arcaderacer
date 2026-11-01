// anim's touch reader: what a clip touches (where its hands grip, its feet stand, its seat sits, which
// limbs are planted and when), read off where a body's skin is on every frame of it (`anim.touches.py`
// measures it), by the taxonomy in `anim.touches.json` beside this. Run three ways:
//   node plugins/anim/anim.touches.mjs [<pattern>]
//       every clip of the library, off the skin demo_walker's `touches.mjs` measured into
//       `~/troupe-collection/packs/mixamo-skin`, written to `~/troupe-collection/packs/mixamo-touches.json`;
//       with a pattern, a regular expression matched case-blind against each clip's path, name and
//       description, only those clips, printed instead of written
//   node plugins/anim/anim.touches.mjs rig <rig.json> <skin.json> <out.json>
//       anim's export (`anim.export.py`): each clip of a rig as baked onto each of its bodies, off the
//       skin the export measured on it (`<skin.json>`, `{ <body>: { <clip>: <skin> } }`), each read as the
//       rig has it (a loop where its entry says `loop`), written as `{ <body>: { <clip>: <reading> } }`,
//       which `merge-table.mjs` writes into the rig file's `touches`; a mirrored clip (`mirror`) is anim's
//       own and is left out
//   `read(file, skin, opts)`, imported: a game reads its own clips by it (demo_walker's `xbot.touches.mjs`)
//
// Every place is in the clip's own space as `anim.touches.py` measures it: metres, x the left of a body facing
// +z, y up, z ahead, its origin the hips at rest across the ground on the first frame, the floor the clip
// was made on at y = 0, each place lifted by the clip's `lift` (below) and turned by its `turned`. A
// heading is degrees from +z, positive left.
//
// For each clip:
//   name, description   Mixamo's, where `mixamo-roots.json` holds them (a pack's clips have its file's name)
//   case                the first of `anim.touches.json`'s cases whose words match its name, description or
//                       file's name
//   loop, dur, frames   whether it loops (Mixamo's word, or the rig's), its seconds and its frames
//   turned              degrees left the clip is read turned by (a game's rig turns some, `opts.turn`), 0
//   travel              [left, up, ahead] metres the hips move from the first frame to the last; `lap` the
//                       same for a loop, its progress over one lap, null for a one-shot
//   floor               the height of the raised floor (STEP or more up) the clip ends standing on, or null
//   plants              every patch of skin held: held still, slower than PLANT m/s (a palm PRESS m/s) for
//                       at least HOLD seconds (a hand's middle GRIP seconds), a pose (POSE frames or fewer)
//                       holding every part over all of it, and the kicks and presses the reads find;
//                       `{ point, from, to, at, on }`, `point` an `anim.touches.json` part and its side (`soleL`,
//                       `gripR`, `seat`, …) and `on` what it is held on: `ground` or `raised floor` (STEP
//                       or more up), `rung`, `wall`, `ledge` (a palm set on a top), `hold` (a hand gripping
//                       overhead or held while the hips move about it, off the body), or `still`. A loop's
//                       hold that goes round its end runs `to` past its last second; its places are carried
//                       on by the lap's progress
//   floors              the levels it stands, kneels, sits or lies on: `{ y, from, to, by }`, `by` the
//                       parts held on it. A part is on a floor while it is the lowest of the parts held
//                       then that bear weight (the soles, balls, heels, knees, seat and belly; the hands
//                       reach down over edges), within LEVEL of it (the belly LIES), and the body hangs
//                       from nothing (a case `by` its grip hangs from its first grip to its last, a loop
//                       of one all the time). A sole is on it flat, its ball level with it and its ankle
//                       ANKLE over it; a ball on tiptoe, its heel raised LEVEL over it and its ankle over
//                       it (on a rung the heel stands level or hangs under). A level within LEVEL of
//                       another is the same one
//   lift                `[[t, metres], ...]`: how far the clip is raised on each frame to stand on its
//                       floor: the deepest of the soles planted within NEAR under it (or, for a clip
//                       whose lowest held sole floats FLOAT to STEP over it, those standing as low) and
//                       the knees, seat and belly within SINKS under it (lying, kneeling and sitting on the
//                       floor sink further), filled between the frames that plant none and smoothed over SMOOTH
//                       frames, as `xbot.contacts.mjs` lifts a clip; null where it never reaches LIFT, and
//                       for a case placed by its grip (`anim.touches.json`'s `by`), which hangs from what it
//                       holds and stands on no floor
//   things              the sizes of each thing its case needs, read by the case's `reads`, each named
//                       below; a size that could not be read is left out and a doubt says so
//   doubts              what could not be settled, each `{ t, question }`, to be answered by eye
//
// The reads:
//   grip     the hands held still over the shoulders: `grips` each `{ hand, y, at, from, to }`, `y` the
//            top of the hand (what a lip or a bar is held by), `lip` their median height, `span` how far
//            apart the two hands hold at once
//   face     the balls of the feet set STEP or more over the floor, slower than KICK m/s for KICKS frames
//            (a run up or along a wall plants a foot for 1 to 4 frames), standing on no floor the while:
//            against an upright face, `face` `{ at, heights, normal, along, under }`. Kicks spread SPREAD or
//            more across the ground lie on the wall's line, its `normal` (the way the face looks) toward
//            the body's side of it, `along` true; else the face looks back along the way the body faces
//            as it kicks. `under` how far beyond the gripping hands the face stands, along the way the
//            body faces
//   top      the floor the clip ends on, where it is a level other than the one it starts on: `top` its
//            height, and `climb` its height over the lip where there is one
//   press    the palms set on something STEP or more over the floor while the hips move ANCHOR or more,
//            each staying within SETTLE of where it was put down for HOLD seconds or more (a palm bearing
//            a vault rolls): `press` `{ hand, y, at, from, to }` each, and `over` `{ top, at, way, clear,
//            from, to }`: the presses run together in time (gaps of GAP seconds or less) pressed longest,
//            `top` and `at` the middle of the two hands' presses, `way` the heading the body goes over
//            (a one-shot's travel, where it travels TRAVELS or more, else the way it faces as it
//            presses), `clear` [back, ahead] how far behind and ahead of `at` along that way the top
//            may reach with every sole and ball kept over it
//   swing    the hands' path while they hang over the shoulders and the body stands on no floor: a
//            circle fitted to it (least squares) in the upright plane along the way it goes is the line
//            they swing on, `swing` `{ pivot, radius, from, to }`, where it hangs from and its length; a
//            path whose circle is over STRAIGHT metres across, or hangs under it, is a line run along
//            (a zip line), `swing` `{ line: [start, end], from, to }`
//   floors   the floor it starts on and the one it ends on, each where the lowest part held on it at
//            that end stands: `start`, `end`, and `rise`, end less start
//   steps    stairs: `steps` `{ riser, tread, count }`, the median rise from one floor the soles stand
//            on to the next, and the median distance the next one's soles stand further along the way
//            the body goes
//   rungs    the heights the balls stand on while climbing (a ball held FLOAT or more up, its sole not
//            flat on a raised floor the while): `rungs` folded into one lap and clustered within FLAT,
//            `lap` a loop's climb, `spacing`; and `ladder`, the rung plane, as `xbot.contacts.mjs` read
//            it: `{ normal, at, tops, from, to, hands, spread, across, grips, rails, open }`
//   seat     the hips steady in height, low and off the feet: `seat` `{ y, at, facing, rear, from, to }`
//            each, `rear` how far behind the seat's middle the body's back reaches while it sits; and,
//            where the skin has the rearmost skin (`anim.touches.py --rear`), `behind` [[x, y, z], ...], the
//            skin furthest behind over the whole clip in each square of REAR across and up, in the
//            chair's frame: what a chair's back must stand behind
//   back     the torso's back held still: `back` `{ at, y, normal }`, the face it rests on
//   palms    the palms held still off the floor: `palms` `{ y, at, from, to }` each
//   belly    the torso's lowest skin at its lowest, `belly`, and whether it lies (within LIES of a floor)
//   knees    the knees held on a floor: `knees` `{ y, at, from, to }` each
//   holds    the hands held still away from the body: `points` `{ hand, at, from, to }` each
//   span     a carried thing: the hands' mean place before the body, `span` `{ apart, y, ahead }`
//   strike   the moment each foot, knee, hand and the head moves fastest: `strikes` `{ part, t, speed,
//            at }`, fastest first
//   water    where the surface stands, which the skin cannot say, so the clip's words do: under water
//            (`underwater`) UNDER over the highest the crown reaches, else SURFACE over the shoulders'
//            median height; `water` `{ under, surface, crown, shoulders }` and a doubt saying so
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const here = import.meta.dirname
const troupe = (process.env.PATCHWORK_CLIPS ?? '~/troupe-collection').replace(/^~(?=$|\/)/, homedir())
const packs = path.join(troupe, 'packs')
const SKIN = path.join(packs, 'mixamo-skin')
const OUT = path.join(packs, 'mixamo-touches.json')
const taxonomy = JSON.parse(readFileSync(path.join(here, 'anim.touches.json'), 'utf8'))
// Mixamo's names and descriptions of the library's clips, where the library has them: a clip of none is
// known by its file's name.
const ROOTS = path.join(packs, 'mixamo-roots.json')
const roots = existsSync(ROOTS) ? JSON.parse(readFileSync(ROOTS, 'utf8')) : {}
const cases = taxonomy.cases.map(c => ({ ...c, re: new RegExp(c.words, 'i') }))

// Held still: slower than this, m/s, for at least HOLD seconds; a hand's middle for GRIP seconds, since a
// swinging arm stops for 3 frames as it turns back (`xbot.contacts.mjs`).
const PLANT = 0.35
const HOLD = 0.09
const GRIP = 0.15
// A palm bearing the body rolls and slides on what it is set on (`xbot.contacts.mjs`).
const PRESS = 1.5
// A palm set on something stays within this of where it was put down while the body goes over it,
// metres: the one-hand vault's lowest palm skin wanders 0.16 m across as the hand rolls.
const SETTLE = 0.12
// Presses no more than this apart in time are one push over one top, seconds.
const GAP = 0.2
// A sole or a ball from NEAR under the floor to FLOAT over it stands on it, metres.
const NEAR = 0.1
const FLOAT = 0.02
// A body lying or sitting on the floor sinks its torso under it by up to this, metres: Laying On Back's
// lies 0.098 under.
const SINKS = 0.2
// Two levels within this of each other are one floor; a ball within this of its heel is flat, metres.
const LEVEL = 0.03
// The balls on one rung stand within this of each other, metres: the left and the right foot's balls
// differ by up to 3 cm on the ladder climb (`xbot.contacts.mjs`'s FLAT).
const FLAT = 0.06
// The balls a rung plane is read off stand within this of it, metres: a foot set on a rung stands up to
// 7 cm further onto it than the other (Ladder Climb One Step At A Time's left 6.8 cm past its right); the
// game's own ladder clips stand theirs within 1.5 cm.
const PLANE = 0.08
// A ladder leans when its rungs lean this far or more off upright, degrees: the leaning climbs lean 20 to
// 21°, and an upright ladder's clips read 2 to 6° off where each foot is set on its rung.
const LEANS = 10
// A thing this far over the floor or more is raised off it, metres.
const STEP = 0.15
// The hips move at least this far while a part is held on something, metres (`xbot.contacts.mjs`).
const ANCHOR = 0.05
// A held hand within this of a knee, a thigh's middle or the hips rests on the body, metres.
const RESTS = 0.2
// A lift is smoothed over this many frames, and one that never reaches LIFT metres is none.
const SMOOTH = 5
const LIFT = 0.005
// The seat holds the hip joint under SEAT metres over the floor (standing it stands 0.98 m over it, on a
// chair 0.55, in a car's seat 0.75) for at least SITS seconds, SUPPORT metres or more off the middle of
// the feet across the ground.
const SEAT = 0.9
const SITS = 0.3
const SUPPORT = 0.25
// The torso lies when its lowest skin is within this of a floor, metres.
const LIES = 0.12
// A clip of this many frames or fewer is a pose: the Sitting Pack's and the Laying Pack's are 2.
const POSE = 5
// A foot stands flat on what holds it when its ankle stands this far or more over its sole, metres; on
// a wall the ankle stands beside the sole, not over it.
const ANKLE = 0.05
// A foot set on a wall: slower than KICK m/s for KICKS frames or more (Wall Run (2) plants each foot for
// 2 to 4 frames under 0.7 m/s); kicks spread SPREAD metres or more along the ground run along the wall.
const KICK = 1
const KICKS = 2
const SPREAD = 0.3
// A one-shot that travels this far, metres, goes at what it meets along its travel, which the hips,
// twisting as it kicks or vaults, need not face (`xbot.contacts.mjs`'s TRAVELS).
const TRAVELS = 0.5
// A grip on a ladder further to the side than the feet by this or more is on a rail, metres; a hand
// closed round a rung holds its middle this far out from the rung plane or less (`xbot.contacts.mjs`'s
// RAIL and CLOSED).
const RAIL = 0.1
const CLOSED = 0.07
// The side of the squares, across and up, a sitting clip's rearmost skin is kept in, metres (`anim.touches.py`'s).
const REAR = 0.02
// The hands swing from a line (a rope, a trapeze, a zip line) whose path fits a circle of more than this
// radius as a straight line, metres.
const STRAIGHT = 20
// Where a surface swimmer's water stands: over the shoulders by this, metres; under water, over the
// crown by this.
const SURFACE = 0.05
const UNDER = 0.3

const round = (v, places = 3) => Math.round(v * 10 ** places) / 10 ** places
const r3 = p => p.map(v => round(v))
const sub = (a, b) => a.map((v, i) => v - b[i])
const len = v => Math.hypot(...v)
const mean = ps => ps[0].map((_, i) => ps.reduce((s, p) => s + p[i], 0) / ps.length)
const median = vs => { const s = [...vs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const DEG = Math.PI / 180
const wrapDeg = a => a - 360 * Math.ceil((a - 180) / 360)
const meanDeg = as => Math.atan2(as.reduce((s, a) => s + Math.sin(a * DEG), 0), as.reduce((s, a) => s + Math.cos(a * DEG), 0)) / DEG
// The way a line from a body's right to its left faces, degrees from +z, positive left.
const square = (l, r) => { const d = sub(l, r); return Math.atan2(-d[2], d[0]) / DEG }

// What a clip is called, and the words its case is chosen by: a pack's clips all carry Mixamo's word on
// the whole pack (its description lists every clip), so they go by their file's name.
function wordsOf(file) {
  const e = roots[file] ?? {}
  const base = path.basename(file, path.extname(file)).replace(/\s*\(\d+\)$/, '')
  const pack = (e.description ?? '').split(',').length > 3
  return pack || !e.name ? { name: base, description: null, text: base } : { name: e.name, description: e.description, text: `${e.name} | ${e.description} | ${base}` }
}

// Runs of frames where `keep(f)` holds, at least `min` frames long; a loop's run may go round its end.
function runs(n, loop, keep, min) {
  const out = []
  let start = -1
  for (let f = 0; f <= n; f++) {
    const on = keep(f)
    if (on && start < 0) start = f
    if ((!on || f === n) && start >= 0) {
      out.push([start, on ? f : f - 1])
      start = -1
    }
  }
  if (loop && out.length > 1 && out[0][0] === 0 && out[out.length - 1][1] === n) {
    const last = out.pop()
    out[0] = [last[0], out[0][1] + n]
  }
  return out.filter(([s, e]) => e - s + 1 >= min)
}

// The lift on each frame: the deepest planted part's depth under the floor, filled between the frames
// that plant one, and toward 0 over the frames before the first and after the last where the clip also
// stands on rungs, a wall or a raised floor (`raised`, the frames such holds start and end on), so a clip
// that leaves the floor for them meets them where it measured them; smoothed (`xbot.contacts.mjs`'s).
function liftOf(n, loop, ground, raised) {
  const known = ground.flatMap((v, f) => (v === undefined ? [] : [f]))
  if (!known.length) return null
  const fill = Array(n + 1)
  for (const f of known) fill[f] = ground[f]
  const first = known[0], last = known[known.length - 1]
  for (let f = 0; f <= n; f++) {
    if (fill[f] !== undefined) continue
    if (f > first && f < last) {
      const a = known.filter(k => k < f).pop(), b = known.find(k => k > f)
      fill[f] = fill[a] + ((fill[b] - fill[a]) * (f - a)) / (b - a)
    } else if (loop && n > 0) {
      const a = last, b = first + n, g = f < first ? f + n : f
      fill[f] = fill[a] + ((fill[first] - fill[a]) * (g - a)) / Math.max(1, b - a)
    } else if (f < first) {
      // Before the floor: toward 0 by the first raised frame before it, or held where there is none.
      const r = raised.filter(k => k < first).pop()
      fill[f] = r === undefined ? fill[first] : f <= r ? 0 : (fill[first] * (f - r)) / (first - r)
    } else {
      const r = raised.find(k => k > last)
      fill[f] = r === undefined ? fill[last] : f >= r ? 0 : (fill[last] * (r - f)) / (r - last)
    }
  }
  const half = (SMOOTH - 1) / 2
  const out = fill.map((_, f) => {
    let sum = 0, count = 0
    for (let k = f - half; k <= f + half; k++) {
      const g = loop && n > 0 ? ((k % n) + n) % n : Math.max(0, Math.min(n, k))
      sum += fill[g]
      count++
    }
    return sum / count
  })
  if (loop) out[n] = out[0]
  return Math.max(...out.map(Math.abs)) >= LIFT ? out : null
}

// The parts of one frame of the skin file, by `anim.touches.json`'s names and their sides.
function partsOf(s, f) {
  const j = s.joints[f]
  const at = k => j.slice(k * 3, k * 3 + 3)
  return {
    soleL: s.soleL[f], soleR: s.soleR[f], ballL: s.ballL[f], ballR: s.ballR[f], heelL: s.heelL[f], heelR: s.heelR[f],
    handL: s.handL[f].slice(0, 3), handR: s.handR[f].slice(0, 3),
    palmL: s.handL[f].slice(3, 6), palmR: s.handR[f].slice(3, 6),
    gripL: s.handL[f].slice(6, 9), gripR: s.handR[f].slice(6, 9),
    forearmL: s.forearmL[f], forearmR: s.forearmR[f], kneeL: s.shinL[f], kneeR: s.shinR[f],
    seat: s.seat[f], back: s.back[f], front: s.front[f], belly: s.low[f], head: s.head[f].slice(0, 3), crown: s.head[f].slice(3, 6),
    hips: at(0), hipL: at(1), hipR: at(2), shoulderL: at(3), shoulderR: at(4), jointKneeL: at(5), jointKneeR: at(6), ankleL: at(7), ankleR: at(8),
  }
}

const HELD = ['soleL', 'soleR', 'ballL', 'ballR', 'heelL', 'heelR', 'handL', 'handR', 'palmL', 'palmR', 'gripL', 'gripR', 'forearmL', 'forearmR', 'kneeL', 'kneeR', 'seat', 'back', 'belly']

// A point [x, y, z] turned `deg` degrees left about the vertical through (cx, cz) (`xbot.contacts.mjs`'s).
function turnAbout(p, deg, cx, cz) {
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG), x = p[0] - cx, z = p[2] - cz
  return [cx + x * c + z * s, p[1], cz - x * s + z * c]
}

// `opts`: `turn`, degrees left, every point turned by about the hips on the first frame before it is read,
// as anim's export turns a clip its sidecar's `offset.rotation` turns; `loop`, whether it loops, where a
// game's rig says so (Mixamo's word otherwise); `case`, the case it is read as (its words' otherwise);
// `lift`, false for a clip read as it is baked, its sidecar's lift already laid on (anim's export), so
// nothing is lifted and its `lift` is null.
export function read(file, s, opts = {}) {
  const words = wordsOf(file)
  const kase = opts.case ? cases.find(c => c.case === opts.case) : cases.find(c => c.re.test(words.text))
  if (!kase) throw new Error(`anim.touches.mjs: no case ${opts.case}`)
  const e = roots[file] ?? {}
  const loop = opts.loop ?? !!e.loop
  const n = s.frames - 1
  const fps = s.fps
  const unturned = Array.from({ length: n + 1 }, (_, f) => partsOf(s, f))
  const [cx, , cz] = unturned[0].hips
  const turnBy = opts.turn ?? 0
  const raw = turnBy ? unturned.map(fr => Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, turnAbout(v, turnBy, cx, cz)]))) : unturned
  const rearOf = f => (s.rear ? (turnBy ? s.rear[f].map(p => turnAbout(p, turnBy, cx, cz)) : s.rear[f]) : null)
  // The hips' own turn from the first frame, degrees left (the measure anim's table travels by), where the
  // skin file has it; else the hip joints' line's.
  const hipsYaw = f => (s.hipsYaw ? s.hipsYaw[f] : wrapDeg(square(raw[f].hipL, raw[f].hipR) - square(raw[0].hipL, raw[0].hipR)))
  const sec = f => round(f / fps)
  const doubts = []
  const byGrip = kase.by === 'grip'
  // A part's place on frame f of a run that may go round a loop's end: frames past the last are the next
  // lap's, carried on by the lap's progress (the hips' from the first frame to the last), and frames
  // before the first the lap before's (`xbot.contacts.mjs`'s).
  const lapped = frames => (part, f) => {
    if (f >= 0 && f <= n) return frames[f][part]
    const k = Math.floor(f / n)
    const progress = sub(frames[n].hips, frames[0].hips)
    return frames[f - k * n][part].map((v, i) => v + progress[i] * k)
  }

  // ---- holds, first as measured, for the lift
  const holdsOf = frames => {
    const at = lapped(frames)
    // A pose (POSE frames or fewer) is the body held still: every part is held over all of it.
    if (n + 1 <= POSE) return HELD.map(part => ({ part, s: 0, e: n, at: mean(frames.map(fr => fr[part])), moved: 0 }))
    const speed = (part, f) => {
      if (n === 0) return 0
      const p = loop ? f - 1 : Math.max(0, f - 1), q = loop ? f + 1 : Math.min(n, f + 1)
      const a = at(part, p), b = at(part, q)
      return (len(sub(b, a)) * fps) / (q - p)
    }
    const out = []
    for (const part of HELD) {
      const min = Math.ceil((part.startsWith('hand') || part.startsWith('grip') ? GRIP : HOLD) * fps - 1e-9)
      const still = part.startsWith('palm') ? PRESS : PLANT
      for (const [a, b] of runs(n, loop, f => speed(part, f) < still, min)) {
        const ps = [], hips = []
        for (let f = a; f <= b; f++) { ps.push(at(part, f)); hips.push(at('hips', f)) }
        let moved = 0
        for (const h of hips) moved = Math.max(moved, len(sub(h, hips[0])))
        out.push({ part, s: a, e: b, at: mean(ps), moved })
      }
    }
    return out
  }

  // ---- the lift, off the soles planted on the floor
  let lift = null
  if (!byGrip && opts.lift !== false) {
    const ground = Array(n + 1).fill(undefined)
    // The soles planted on the floor, and the knees, the seat and the torso a body kneels, sits or lies
    // on it by, which sink further: the deepest of them on each frame is stood on the floor.
    const measured = holdsOf(raw)
    // A clip that floats over its floor (Pushing Heavy Object's soles stand 6.7 cm over it) stands its
    // lowest planted soles on it, where they stand less than STEP over it.
    const soleYs = measured.filter(h => h.part.startsWith('sole')).map(h => h.at[1])
    const lowestSole = soleYs.length ? Math.min(...soleYs) : Infinity
    const float = lowestSole >= FLOAT && lowestSole < STEP ? lowestSole + LEVEL : FLOAT
    const planted = measured.filter(h => (h.part.startsWith('sole') && h.at[1] > -NEAR && h.at[1] < float) ||
      (['kneeL', 'kneeR', 'seat', 'belly'].includes(h.part) && h.at[1] > -SINKS && h.at[1] < FLOAT))
    for (const h of planted) {
      for (let f = h.s; f <= h.e; f++) {
        const g = loop && n > 0 ? f % n : f
        const y = raw[g][h.part][1]
        ground[g] = ground[g] === undefined ? -y : Math.max(ground[g], -y)
      }
    }
    // The frames the clip stands on something raised start and end on: a ball held STEP or more up (a
    // wall, a rung; on a ladder any ball off the floor, FLOAT up), or a sole held flat STEP or more up.
    const flatRaw = h => {
      const side = h.part.slice(-1)
      const span = Array.from({ length: h.e - h.s + 1 }, (_, i) => raw[(h.s + i) % (n + 1)])
      const ball = mean(span.map(fr => fr['ball' + side])), ankle = mean(span.map(fr => fr['ankle' + side]))
      return Math.abs(ball[1] - h.at[1]) <= LEVEL && ankle[1] - h.at[1] >= ANKLE
    }
    const raised = [...new Set(measured.filter(h => (h.part.startsWith('ball') && h.at[1] >= (kase.case === 'ladder' ? FLOAT : STEP)) ||
      (h.part.startsWith('sole') && h.at[1] >= STEP && flatRaw(h))).flatMap(h => [h.s, Math.min(n, h.e)]))].sort((a, b) => a - b)
    lift = liftOf(n, loop, ground, raised)
  }
  const liftAt = f => (lift ? lift[Math.max(0, Math.min(n, f))] : 0)
  const frames = raw.map((p, f) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [v[0], v[1] + liftAt(f), v[2]]])))
  const at = lapped(frames)
  const facing = frames.map(fr => square(fr.hipL, fr.hipR))
  const holds = holdsOf(frames)

  // ---- what the hands hold overhead: a body that hangs from them stands on no floor while it does
  const overhead = holds.filter(h => {
    if (!h.part.startsWith('grip')) return false
    const mid = Math.round((h.s + h.e) / 2)
    return h.at[1] > Math.max(at('shoulderL', mid)[1], at('shoulderR', mid)[1])
  })
  // A case placed by its grip hangs from its hands from its first grip to its last, its hands taking
  // turns (a loop of it all the time). No other case hangs: hands held over the shoulders there hold a
  // rifle up, cheer or reach, and the feet bear the body.
  const gripFrom = overhead.length ? Math.min(...overhead.map(h => h.s)) : Infinity
  const gripTo = overhead.length ? Math.max(...overhead.map(h => h.e)) : -Infinity
  const hanging = f => byGrip && overhead.length > 0 && (loop || (f >= gripFrom && f <= gripTo))
  // A sole held flat on what holds it: its ball level with it and its ankle over it.
  const flat = h => {
    const side = h.part.slice(-1)
    const span = Array.from({ length: h.e - h.s + 1 }, (_, i) => h.s + i)
    const ball = mean(span.map(f => at('ball' + side, f)))
    const ankle = mean(span.map(f => at('ankle' + side, f)))
    return Math.abs(ball[1] - h.at[1]) <= LEVEL && ankle[1] - h.at[1] >= ANKLE
  }

  // ---- floors: the levels the feet stand flat on, the knees kneel on, the seat sits on and the torso lies
  // on, each while it is the lowest of the parts the body bears its weight on that are held still then
  // (the hands left out, which reach down over an edge), and the body hangs from nothing
  const BEARS = ['soleL', 'soleR', 'ballL', 'ballR', 'heelL', 'heelR', 'kneeL', 'kneeR', 'seat', 'belly']
  // A ball stood on (on tiptoe, crouched): its ankle over it and its heel raised LEVEL or more over it;
  // on a rung the heel stands level with the ball or hangs under it, and a flat foot is its sole's.
  const tiptoe = h => {
    const side = h.part.slice(-1)
    const span = Array.from({ length: h.e - h.s + 1 }, (_, i) => h.s + i)
    const heel = mean(span.map(f => at('heel' + side, f)))
    const ankle = mean(span.map(f => at('ankle' + side, f)))
    return heel[1] - h.at[1] >= LEVEL && ankle[1] - h.at[1] >= ANKLE
  }
  const lowest = Array(n + 1).fill(Infinity)
  for (const h of holds.filter(h => BEARS.includes(h.part))) {
    for (let f = h.s; f <= h.e; f++) {
      const g = f % (n + 1)
      lowest[g] = Math.min(lowest[g], at(h.part, g)[1])
    }
  }
  // A part is on a floor where it is the lowest held part (within LEVEL, the belly within LIES) for at
  // least half its hold: on stairs both feet stand at once on two steps for a few frames before the
  // lower one lifts.
  const footed = holds.filter(h => {
    if (!BEARS.includes(h.part)) return false
    let lowestFor = 0, hung = 0
    const near = h.part === 'belly' ? LIES : LEVEL
    for (let f = h.s; f <= h.e; f++) {
      if (frames[f % (n + 1)][h.part][1] - lowest[f % (n + 1)] <= near) lowestFor++
      if (hanging(f % (n + 1))) hung++
    }
    if (hung > (h.e - h.s + 1) / 2 || lowestFor < (h.e - h.s + 1) / 2) return false
    if (h.part.startsWith('sole')) return flat(h)
    if (h.part.startsWith('ball')) return tiptoe(h)
    return h.part.startsWith('knee') || h.part === 'belly' || h.part === 'seat'
  })
  const floors = []
  for (const h of [...footed].sort((a, b) => a.s - b.s)) {
    const f = floors.find(l => Math.abs(l.y - h.at[1]) <= LEVEL)
    if (f) { f.ys.push(h.at[1]); f.from = Math.min(f.from, h.s); f.to = Math.max(f.to, h.e); f.by.add(h.part.replace(/[LR]$/, '')) }
    else floors.push({ y: h.at[1], ys: [h.at[1]], from: h.s, to: h.e, by: new Set([h.part.replace(/[LR]$/, '')]) })
  }
  // A floor stands where the lowest part held on it stands; the others hover over it.
  for (const f of floors) f.y = Math.min(...f.ys)
  const floorAt = f => floors.filter(l => l.from <= f && l.to >= f).sort((a, b) => a.y - b.y)[0]
  // The floor it starts on and the one it ends on, each where the lowest part held on it at that end
  // stands (the feet may settle lower on it as they arrive, and stand there at the end).
  const ends = Math.max(2, Math.round(0.1 * fps))
  const levelOf = (l, keep) => {
    if (!l) return undefined
    const there = footed.filter(h => keep(h) && Math.abs(h.at[1] - l.y) <= LEVEL)
    return { ...l, y: there.length ? Math.min(...there.map(h => h.at[1])) : l.y }
  }
  const startFloor = levelOf(floors.find(l => l.from <= ends), h => h.s <= ends)
  const endFloor = levelOf([...floors].reverse().find(l => l.to >= n - ends), h => h.e >= n - ends)
  const floorY = startFloor ? startFloor.y : 0

  // The way a one-shot goes, degrees from +z, positive left, where its hips travel TRAVELS or more across
  // the ground; null for a loop or one that stays.
  const travelWay = () => {
    const tr = sub(at('hips', n), at('hips', 0))
    return !loop && Math.hypot(tr[0], tr[2]) >= TRAVELS ? Math.atan2(tr[0], tr[2]) / DEG : null
  }

  // ---- the reads
  const things = {}
  // The holds the reads find on rungs, the kicks on a wall and the palms set on a top, labelled in `plants`.
  let rungBalls = [], kicked = [], pressed = []
  const want = new Set(kase.reads)
  const holdsOn = prefix => holds.filter(h => h.part.startsWith(prefix))
  const span = h => ({ from: sec(h.s), to: sec(Math.min(h.e, n)) })

  if (want.has('grip')) {
    const grips = overhead
    if (grips.length) {
      const both = []
      for (const a of grips.filter(h => h.part === 'gripL')) for (const b of grips.filter(h => h.part === 'gripR')) {
        const s0 = Math.max(a.s, b.s), e0 = Math.min(a.e, b.e)
        if (e0 >= s0) both.push(len(sub(a.at, b.at)))
      }
      things.grips = grips.map(h => ({ hand: h.part.slice(-1), y: round(h.at[1]), at: [round(h.at[0]), round(h.at[2])], ...span(h) }))
      things.lip = round(median(grips.map(h => h.at[1])))
      if (both.length) things.span = round(median(both))
    }
  }

  if (want.has('face')) {
    // A ball set STEP or more over the floor the clip started on, slower than KICK m/s for KICKS frames or
    // more (a run up or along a wall plants each foot for 1 to 4 frames), its foot standing on no floor
    // the while: set against an upright face.
    const kicks = []
    for (const part of ['ballL', 'ballR']) {
      const v = f => { const a = Math.max(0, f - 1), b = Math.min(n, f + 1); return len(sub(at(part, b), at(part, a))) * fps / Math.max(1, b - a) }
      for (const [s0, e0] of runs(n, loop, f => v(Math.min(f, n)) < KICK && at(part, f)[1] - floorY >= STEP, KICKS)) {
        if (footed.some(o => o.part === 'sole' + part.slice(-1) && o.s <= e0 && o.e >= s0)) continue
        kicks.push({ part, s: s0, e: e0, at: mean(Array.from({ length: e0 - s0 + 1 }, (_, i) => at(part, s0 + i))) })
      }
    }
    kicked = kicks
    if (kicks.length) {
      const c = mean(kicks.map(k => k.at))
      // Kicks spread SPREAD or more along the ground on a line that runs with the body's travel lie on the
      // wall's line, the body on one side of it (a run along a wall, a shimmy). Else (a run up a wall
      // sets the left foot and the right side by side) the face looks back along the way the body goes
      // at it: a one-shot's travel, where it travels TRAVELS or more, else the way it faces as it kicks.
      const xs = kicks.map(k => [k.at[0] - c[0], k.at[2] - c[2]])
      const sxx = xs.reduce((s, p) => s + p[0] * p[0], 0), szz = xs.reduce((s, p) => s + p[1] * p[1], 0), sxz = xs.reduce((s, p) => s + p[0] * p[1], 0)
      const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz)
      const along = [Math.cos(theta), Math.sin(theta)]
      const spread = Math.max(...xs.map(p => p[0] * along[0] + p[1] * along[1])) - Math.min(...xs.map(p => p[0] * along[0] + p[1] * along[1]))
      const goes = travelWay()
      const withTravel = goes === null || Math.abs(Math.cos((Math.atan2(along[0], along[1]) / DEG - goes) * DEG)) >= Math.cos(45 * DEG)
      const runsAlong = spread >= SPREAD && withTravel
      let normal
      if (runsAlong) {
        const hips = mean(kicks.map(k => at('hips', Math.round((k.s + k.e) / 2))))
        let nx = -along[1], nz = along[0]
        if ((hips[0] - c[0]) * nx + (hips[2] - c[2]) * nz < 0) { nx = -nx; nz = -nz }
        normal = Math.atan2(nx, nz) / DEG
      } else normal = wrapDeg((goes ?? meanDeg(kicks.map(k => facing[Math.round((k.s + k.e) / 2) % (n + 1)]))) + 180)
      const way = wrapDeg(normal + 180)
      things.face = { at: [round(c[0]), round(c[2])], heights: kicks.map(k => round(k.at[1])).sort((a, b) => a - b), normal: round(normal, 2), along: runsAlong, from: sec(Math.min(...kicks.map(k => k.s))), to: sec(Math.min(n, Math.max(...kicks.map(k => k.e)))) }
      if (things.grips) {
        const g = mean(things.grips.map(gg => [gg.at[0], 0, gg.at[1]]))
        const dir = [Math.sin(way * DEG), 0, Math.cos(way * DEG)]
        things.face.under = round((c[0] - g[0]) * dir[0] + (c[2] - g[2]) * dir[2])
      }
    } else doubts.push({ t: null, question: 'its case sets the feet on a wall, and no foot is held still off the floor without standing on one: where is the wall?' })
  }

  if (want.has('top') || want.has('floors')) {
    if (startFloor) things.start = round(startFloor.y)
    if (endFloor) things.end = round(endFloor.y)
    if (startFloor && endFloor) things.rise = round(endFloor.y - startFloor.y)
    if (want.has('top') && endFloor && (!startFloor || Math.abs(endFloor.y - startFloor.y) >= STEP)) {
      things.top = round(endFloor.y)
      if (things.lip !== undefined) things.climb = round(endFloor.y - things.lip)
    }
  }

  if (want.has('steps')) {
    // The steps the soles stand on, one floor each: their rise, the median of the floors' rises one to
    // the next, and their tread, the median of how far along the way the body goes each step's soles
    // stand past the step's before.
    const levels = [...floors].sort((a, b) => a.y - b.y)
    const soles = levels.map(l => footed.filter(h => h.part.startsWith('sole') && Math.abs(h.at[1] - l.y) <= LEVEL))
    if (levels.length >= 2 && soles.every(s => s.length)) {
      const goes = sub(at('hips', n), at('hips', 0))
      const k = Math.hypot(goes[0], goes[2]) || 1
      const ahead = s => mean(s.map(h => h.at)).reduce((v, c, i) => v + (i === 0 ? c * goes[0] : i === 2 ? c * goes[2] : 0), 0) / k
      const rises = levels.slice(1).map((l, i) => l.y - levels[i].y)
      const treads = soles.slice(1).map((s, i) => ahead(s) - ahead(soles[i]))
      things.steps = { riser: round(median(rises)), tread: round(median(treads)), count: levels.length }
    } else doubts.push({ t: null, question: 'its case climbs stairs, and its soles stand on fewer than two steps' })
  }

  if (want.has('press')) {
    // A palm set on something rolls as the body goes over it: it is set where it stays within SETTLE of
    // where it was put down for HOLD seconds or more, whatever its speed.
    const settled = []
    for (const part of ['palmL', 'palmR']) {
      let a = 0
      while (a <= n) {
        let b = a
        while (b + 1 <= n && len(sub(at(part, b + 1), at(part, a))) <= SETTLE) b++
        if (b - a + 1 >= Math.ceil(HOLD * fps)) {
          const ps = Array.from({ length: b - a + 1 }, (_, i) => at(part, a + i))
          let moved = 0
          for (let f = a; f <= b; f++) moved = Math.max(moved, len(sub(at('hips', f), at('hips', a))))
          settled.push({ part, s: a, e: b, at: mean(ps), moved })
          a = b + 1
        } else a++
      }
    }
    const presses = settled.filter(h => h.moved >= ANCHOR && h.at[1] - floorY >= STEP)
    pressed = presses
    if (presses.length) {
      things.press = presses.map(h => ({ hand: h.part.slice(-1), y: round(h.at[1]), at: [round(h.at[0]), round(h.at[2])], ...span(h) }))
      // The top the hands go over: the presses run together in time (no gap over GAP seconds), the run
      // pressed longest, its height and place their middle. `way` the heading the body goes over it (a
      // one-shot's travel, where it travels TRAVELS or more, else the way it faces as it presses), and
      // `clear` [back, ahead] how far behind and ahead of `at` along that way the top may reach with
      // every sole and ball of the clip kept over it (`xbot.contacts.mjs`'s ledge).
      const sorted = [...presses].sort((a, b) => a.s - b.s)
      const groups = [[sorted[0]]]
      for (const h of sorted.slice(1)) {
        const g = groups[groups.length - 1]
        if (h.s - Math.max(...g.map(x => x.e)) <= GAP * fps) g.push(h)
        else groups.push([h])
      }
      const count = g => g.reduce((s, h) => s + h.e - h.s + 1, 0)
      const best = groups.reduce((a, b) => (count(b) > count(a) ? b : a))
      // The middle of the hands: each hand's presses' middle, then the two's.
      const c = mean(['L', 'R'].map(side => best.filter(h => h.part.endsWith(side))).filter(g => g.length).map(g => mean(g.map(h => h.at))))
      const way = travelWay() ?? meanDeg(best.map(h => facing[Math.round((h.s + h.e) / 2) % (n + 1)]))
      const dir = [Math.sin(way * DEG), Math.cos(way * DEG)]
      let back = -Infinity, ahead = Infinity
      for (let f = 0; f <= n; f++) {
        for (const point of ['soleL', 'soleR', 'ballL', 'ballR']) {
          const q = at(point, f)
          if (q[1] >= c[1]) continue
          const a = (q[0] - c[0]) * dir[0] + (q[2] - c[2]) * dir[1]
          if (a < 0) back = Math.max(back, a)
          else ahead = Math.min(ahead, a)
        }
      }
      things.over = { top: round(c[1]), at: [round(c[0]), round(c[2])], way: round(way, 2), clear: [round(back), round(ahead)], from: sec(best[0].s), to: sec(Math.min(n, Math.max(...best.map(h => h.e)))) }
    }
    else if (kase.reads[0] === 'press') doubts.push({ t: null, question: 'its case sets the hands on a top, and no palm is set on anything over the floor: what does it go over?' })
  }
  if (want.has('swing')) {
    // The hands' path while they hang overhead and the body stands on nothing: a circle through it in
    // the upright plane along the way they go is the line they swing on, its middle where it hangs from
    // and its radius its length; a path too straight for one is a line run along (a zip line).
    const path = []
    for (let f = 0; f <= n; f++) {
      const fr = frames[f]
      const top = mean([fr.gripL, fr.gripR])
      if (top[1] > Math.max(fr.shoulderL[1], fr.shoulderR[1]) && !footed.some(h => h.s <= f && h.e >= f)) path.push({ f, p: top })
    }
    if (path.length >= Math.ceil(GRIP * fps)) {
      const a = path[0].p, b = path[path.length - 1].p
      const run = Math.hypot(b[0] - a[0], b[2] - a[2])
      const dir = run > 1e-6 ? [(b[0] - a[0]) / run, (b[2] - a[2]) / run] : [0, 1]
      const pts = path.map(({ p }) => [(p[0] - a[0]) * dir[0] + (p[2] - a[2]) * dir[1], p[1]])
      // The circle through the points by least squares (Kåsa's): x² + y² + D x + E y + F = 0.
      let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sxz = 0, syz = 0, sz = 0
      for (const [x, y] of pts) {
        const z = x * x + y * y
        sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y; sxz += x * z; syz += y * z; sz += z
      }
      const m = pts.length
      const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, m]], B = [-sxz, -syz, -sz]
      const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
      const d = det(A)
      const col = (i) => A.map((row, k) => row.map((v, j) => (j === i ? B[k] : v)))
      const [D, E, F] = Math.abs(d) > 1e-12 ? [det(col(0)) / d, det(col(1)) / d, det(col(2)) / d] : [NaN, NaN, NaN]
      const cx = -D / 2, cy = -E / 2, radius = Math.sqrt(cx * cx + cy * cy - F)
      const span = { from: sec(path[0].f), to: sec(path[path.length - 1].f) }
      if (Number.isFinite(radius) && radius <= STRAIGHT && cy > Math.max(...pts.map(p => p[1]))) {
        things.swing = { pivot: [round(a[0] + dir[0] * cx), round(cy), round(a[2] + dir[1] * cx)], radius: round(radius), ...span }
      } else {
        things.swing = { line: [r3(a), r3(b)], ...span }
      }
    }
  }

  if (want.has('grip') && !things.grips && !things.press && !things.swing) doubts.push({ t: null, question: 'its case holds something, and no hand is held over the shoulders or set on a top: what does it hold?' })

  if (want.has('rungs')) {
    // The balls held off the floor the clip was made on, on rungs, but where the sole of the same foot
    // stands flat on the floor the clip ends on, STEP or more up, the while: the ladder's top. A clip that
    // sets the whole sole flat on each rung (Ladder Climb One Step At A Time) stands on rungs all the
    // same. A loop climbs `lap` metres a lap, so a height and that height a lap up are one rung: the
    // heights are folded into one lap first.
    const onTop = o => !loop && endFloor && endFloor.y >= STEP && Math.abs(o.at[1] - endFloor.y) <= LEVEL && flat(o)
    const balls = holds.filter(h => h.part.startsWith('ball') && h.at[1] >= FLOAT &&
      !holds.some(o => o.part === 'sole' + h.part.slice(-1) && o.s <= h.e && o.e >= h.s && onTop(o)))
    rungBalls = balls
    const lap = loop ? at('hips', n)[1] - at('hips', 0)[1] : 0
    const base = balls.length ? Math.min(...balls.map(h => h.at[1])) : 0
    const fold = y => (lap > STEP ? base + ((((y - base) % lap) + lap) % lap) : y)
    const clusters = []
    for (const y of balls.map(h => fold(h.at[1])).sort((a, b) => a - b)) {
      const near = clusters.find(k => Math.abs(median(k) - y) <= FLAT)
      const wrapped = lap > STEP && clusters.find(k => Math.abs(median(k) + lap - y) <= FLAT)
      if (near) near.push(y)
      else if (wrapped) wrapped.push(y - lap)
      else clusters.push([y])
    }
    const heights = clusters.map(median).sort((a, b) => a - b)
    if (heights.length >= 2 || (lap > STEP && heights.length)) {
      const steps = lap > STEP ? heights.map((v, i) => (i + 1 < heights.length ? heights[i + 1] - v : heights[0] + lap - v)) : heights.slice(1).map((v, i) => v - heights[i])
      things.rungs = heights.map(v => round(v))
      if (lap > STEP) things.lap = round(lap)
      things.spacing = round(median(steps))
    } else doubts.push({ t: null, question: 'its case climbs rungs, and the balls stand on fewer than two heights off the floor' })

    // The rung plane its held balls stand on (`xbot.contacts.mjs`'s ladder): the facing most rung holds
    // share, and the balls of it within FLAT of one plane square to it; `normal` the heading from the plane
    // toward the body, `at` [x, z] the point of the plane between the left and the right balls, `tops`
    // the heights the balls stand on; `hands` how far out from the plane toward the body the held hands
    // stand, `spread` how far the held balls stand off it, `across` the furthest they stand to either side
    // of `at` along the rungs and `grips` how far to either side the held hands stand; `rails` the middle
    // of the grips RAIL or more further to the side than the feet (null for none); `open` how far out the
    // grips inside the rails stand that are not closed round a rung.
    const rungHolds = balls.map(h => ({ ...h, facing: facing[Math.round((h.s + h.e) / 2) % (n + 1)] }))
    if (rungHolds.length) {
      const crowd = rungHolds.map(h => rungHolds.filter(o => Math.abs(wrapDeg(o.facing - h.facing)) <= 30)).reduce((a, b) => (b.length > a.length ? b : a))
      const way = meanDeg(crowd.map(h => h.facing))
      const toward = [Math.sin(way * DEG), 0, Math.cos(way * DEG)]
      const depth = p => p.at[0] * toward[0] + p.at[2] * toward[2]
      // A ladder may lean (Ladder Climb One Step At A Time's rises 0.593 m a lap and comes 0.215 m
      // toward the clip's forward): the rungs' depth along the way the body faces is fitted against
      // their height, a straight line, and each ball is read by how far it stands off that line.
      const ys = crowd.map(h => h.at[1]), dsAll = crowd.map(depth)
      const my = ys.reduce((a, b) => a + b, 0) / ys.length, md = dsAll.reduce((a, b) => a + b, 0) / dsAll.length
      const vy = ys.reduce((s, y) => s + (y - my) ** 2, 0)
      const slope = vy > 1e-6 ? ys.reduce((s, y, i) => s + (y - my) * (dsAll[i] - md), 0) / vy : 0
      const off0 = h => depth(h) - (md + slope * (h.at[1] - my))
      const ds = crowd.map(off0).sort((a, b) => a - b)
      const mid = ds[Math.floor(ds.length / 2)]
      const held = crowd.filter(h => Math.abs(off0(h) - mid) <= PLANE)
      const L = held.filter(h => h.part.endsWith('L')), R = held.filter(h => h.part.endsWith('R'))
      if (L.length && R.length) {
        // A ladder leaning LEANS or more has the lean taken off each ball before the line across the
        // rungs is read, so a left foot on a higher, deeper rung than the right does not skew it; one
        // under it is upright, its feet set a little in or out on their rungs.
        const leans = Math.abs(Math.atan(slope) / DEG) >= LEANS
        const upright = p => (leans ? [p[0] - toward[0] * slope * (p[1] - my), p[1], p[2] - toward[2] * slope * (p[1] - my)] : p)
        const pl = mean(L.map(h => upright(h.at))), pr = mean(R.map(h => upright(h.at)))
        const across = [pl[0] - pr[0], 0, pl[2] - pr[2]]
        let normal = [-across[2], 0, across[0]]
        if (normal[0] * toward[0] + normal[2] * toward[2] > 0) normal = normal.map(v => -v)
        const k = Math.hypot(normal[0], normal[2])
        normal = normal.map(v => v / k)
        const centre = mean([pl, pr])
        const off = p => (p[0] - centre[0]) * normal[0] + (p[2] - centre[2]) * normal[2]
        const side = p => Math.abs((p[0] - centre[0]) * normal[2] - (p[2] - centre[2]) * normal[0])
        const from = Math.min(...held.map(h => h.s)), to = Math.max(...held.map(h => h.e))
        // The hands held on it: a hand's middle held while the hips move ANCHOR or more, not resting on
        // the body.
        const hands = holdsOn('hand').filter(h => h.moved >= ANCHOR && h.e >= from && h.s <= to && (() => {
          const fr = frames[Math.round((h.s + h.e) / 2) % (n + 1)]
          const body = [fr.jointKneeL, fr.jointKneeR, mean([fr.hipL, fr.jointKneeL]), mean([fr.hipR, fr.jointKneeR]), fr.hips]
          return Math.min(...body.map(b => len(sub(h.at, b)))) >= RESTS
        })())
        const ladder = {
          normal: round(Math.atan2(normal[0], normal[2]) / DEG, 2),
          at: [round(centre[0]), round(centre[2])],
          // How far the rungs lean off upright, degrees, positive with the higher ones further from the
          // body.
          lean: round(Math.atan(slope) / DEG, 1),
          tops: [...new Set(held.map(h => round(h.at[1])))].sort((a, b) => a - b),
          from: sec(from), to: sec(Math.min(n, to)),
          hands: hands.map(h => round(off(h.at))),
          spread: round(Math.max(...held.map(h => Math.abs(off(h.at))))),
          across: round(Math.max(...held.map(h => side(h.at)))),
          grips: hands.map(h => round(side(h.at))),
        }
        const railed = ladder.grips.filter(g => g >= ladder.across + RAIL)
        ladder.rails = railed.length ? round(railed.reduce((s, g) => s + g, 0) / railed.length) : null
        ladder.open = hands.filter(h => side(h.at) < ladder.across + RAIL && Math.abs(off(h.at)) > CLOSED).map(h => round(off(h.at)))
        things.ladder = ladder
      } else doubts.push({ t: null, question: 'its case climbs rungs, and the balls on them are not both feet\'s: where is the rung plane?' })
    }
  }

  if (want.has('seat')) {
    const seats = []
    // The hips steady in height (a seat that moves, a wheelchair's or a car's, carries them across the
    // ground), low, and off the feet.
    const rises = f => { const a = Math.max(0, f - 1), b = Math.min(n, f + 1); return Math.abs(at('hips', b)[1] - at('hips', a)[1]) * fps / Math.max(1, b - a) }
    for (const [a, b] of runs(n, loop, f => rises(Math.min(f, n)) < PLANT && at('hips', f)[1] - floorY < SEAT, Math.min(n + 1, Math.ceil(SITS * fps)))) {
      const mid = Math.round((a + b) / 2) % (n + 1)
      const fr = frames[mid]
      const feet = mean([fr.soleL, fr.soleR])
      const off = Math.hypot(fr.hips[0] - feet[0], fr.hips[2] - feet[2])
      const seatY = mean(Array.from({ length: Math.min(b, n) - a + 1 }, (_, i) => at('seat', a + i)))
      if (off < SUPPORT && seatY[1] - floorY > STEP) continue
      const way = facing[mid]
      const dir = [Math.sin(way * DEG), 0, Math.cos(way * DEG)]
      let rear = Infinity
      for (let f = a; f <= Math.min(b, n); f++) rear = Math.min(rear, (at('back', f)[0] - seatY[0]) * dir[0] + (at('back', f)[2] - seatY[2]) * dir[2])
      seats.push({ y: round(seatY[1]), at: [round(seatY[0]), round(seatY[2])], facing: round(way, 1), rear: round(-rear), from: sec(a), to: sec(Math.min(b, n)) })
    }
    if (seats.length) things.seat = seats
    else doubts.push({ t: null, question: 'its case sits, and the hips are never held low and still off the feet' })

    // Where the skin file has the rearmost skin (`anim.touches.py --rear`): the body's skin furthest behind over
    // the whole clip in each square of REAR across and up, in the chair's frame, `behind` [[x, y, z], ...]:
    // from where the root stands while the first seat holds the hips (its end for a clip that ends
    // seated, its start for one that starts seated, the seat's last frame else), the hips' travel from
    // the first frame, turned the way the hips' own axis has turned then; what a chair's back must stand
    // behind (`xbot.contacts.mjs`'s rear).
    if (seats.length && s.rear) {
      const first = runs(n, loop, f => rises(Math.min(f, n)) < PLANT && at('hips', f)[1] - floorY < SEAT, Math.min(n + 1, Math.ceil(SITS * fps)))[0]
      const f = first[1] >= n ? n : first[0] <= 0 ? 0 : first[1]
      const left = at('hips', f)[0] - at('hips', 0)[0], fwd = at('hips', f)[2] - at('hips', 0)[2]
      const yaw = hipsYaw(f) * DEG, c = Math.cos(yaw), si = Math.sin(yaw)
      const cells = new Map()
      for (let g = 0; g <= n; g++) {
        for (const p of rearOf(g)) {
          const dx = p[0] - left, dz = p[2] - fwd
          const q = [dx * c - dz * si, p[1] + liftAt(g), dx * si + dz * c]
          const key = `${Math.floor(q[0] / REAR)} ${Math.floor(q[1] / REAR)}`
          const had = cells.get(key)
          if (!had || q[2] < had[2]) cells.set(key, q)
        }
      }
      things.behind = [...cells.values()].map(r3).sort((a, b) => a[1] - b[1] || a[0] - b[0])
    }
  }

  if (want.has('back')) {
    const backs = holdsOn('back').filter(h => (h.e - h.s) / fps >= SITS)
    if (backs.length) things.back = backs.map(h => { const mid = Math.round((h.s + h.e) / 2) % (n + 1); return { y: round(h.at[1]), at: [round(h.at[0]), round(h.at[2])], normal: round(facing[mid], 1), ...span(h) } })
  }

  if (want.has('palms')) {
    const palms = holdsOn('palm').filter(h => h.at[1] - floorY >= STEP && h.moved < ANCHOR * 4)
    if (palms.length) things.palms = palms.map(h => ({ hand: h.part.slice(-1), y: round(h.at[1]), at: [round(h.at[0]), round(h.at[2])], ...span(h) }))
  }

  if (want.has('belly')) {
    let low = Infinity, lowF = 0
    for (let f = 0; f <= n; f++) if (at('belly', f)[1] < low) { low = at('belly', f)[1]; lowF = f }
    const floorUnder = floorAt(lowF)
    things.belly = round(low)
    things.lies = low - (floorUnder ? floorUnder.y : floorY) <= LIES
    if (kase.case === 'bed') {
      const feetDown = holds.some(h => h.part.startsWith('sole') && Math.abs(h.at[1] - floorY) < FLOAT && h.s <= lowF && h.e >= lowF)
      if (!feetDown && low - floorY > STEP) things.bed = round(low)
    }
  }

  if (want.has('knees')) {
    const knees = holdsOn('knee').filter(h => floors.some(l => Math.abs(l.y - h.at[1]) <= LEVEL))
    if (knees.length) things.knees = knees.map(h => ({ side: h.part.slice(-1), y: round(h.at[1]), at: [round(h.at[0]), round(h.at[2])], ...span(h) }))
  }

  if (want.has('holds')) {
    const points = holdsOn('hand').filter(h => {
      const mid = Math.round((h.s + h.e) / 2) % (n + 1)
      const fr = frames[mid]
      const body = [fr.jointKneeL, fr.jointKneeR, mean([fr.hipL, fr.jointKneeL]), mean([fr.hipR, fr.jointKneeR]), fr.hips]
      return Math.min(...body.map(b => len(sub(h.at, b)))) >= RESTS && h.at[1] - floorY > LEVEL
    })
    if (points.length) things.points = points.map(h => ({ hand: h.part.slice(-1), at: r3(h.at), ...span(h) }))
  }

  if (want.has('span')) {
    const rel = []
    for (let f = 0; f <= n; f++) {
      const fr = frames[f]
      const way = facing[f] * DEG
      const toBody = p => { const d = sub(p, fr.hips); return [d[0] * Math.cos(way) - d[2] * Math.sin(way), p[1], d[0] * Math.sin(way) + d[2] * Math.cos(way)] }
      rel.push([toBody(fr.handL), toBody(fr.handR)])
    }
    things.span = { apart: round(median(rel.map(([a, b]) => len(sub(a, b))))), y: round(median(rel.map(([a, b]) => (a[1] + b[1]) / 2))), ahead: round(median(rel.map(([a, b]) => (a[2] + b[2]) / 2))) }
  }

  if (want.has('strike')) {
    const strikes = []
    for (const part of ['ballL', 'ballR', 'kneeL', 'kneeR', 'handL', 'handR', 'head']) {
      let best = 0, bestF = 0
      for (let f = 1; f < n; f++) {
        const v = len(sub(at(part, f + 1), at(part, f - 1))) * fps / 2
        if (v > best) { best = v; bestF = f }
      }
      strikes.push({ part, t: sec(bestF), speed: round(best, 2), at: r3(at(part, bestF)) })
    }
    things.strikes = strikes.sort((a, b) => b.speed - a.speed)
  }

  if (want.has('water')) {
    // The skin does not say where the water stands, so the clip's words do: under water, UNDER over the
    // highest the crown reaches; else on it, SURFACE over the shoulders' middle height, where a swimmer
    // or a treader holds the head clear.
    const crowns = frames.map(fr => fr.crown[1])
    const shoulders = frames.map(fr => (fr.shoulderL[1] + fr.shoulderR[1]) / 2)
    const under = /underwater|under water/i.test(words.text)
    things.water = { under, surface: round(under ? Math.max(...crowns) + UNDER : median(shoulders) + SURFACE), crown: [round(Math.min(...crowns)), round(Math.max(...crowns))], shoulders: [round(Math.min(...shoulders)), round(Math.max(...shoulders))] }
    doubts.push({ t: null, question: `the surface is set by the clip's words (${under ? 'under water' : 'on it'}), not measured: does the body stand in the water so?` })
  }

  // Every patch of skin held, labelled by what it is held on (`xbot.contacts.mjs`'s `plants`): `ground` or
  // `raised floor` (STEP or more up), a floor it stands, kneels, sits or lies on; `rung`; `wall`, a foot
  // kicked against one; `ledge`, a palm set on a top; `hold`, a hand gripping overhead or held while the
  // hips move about it, not resting on the body; `still`, held on nothing or at rest on the body. A loop's
  // hold that goes round its end runs `to` past its last second.
  const rests = h => {
    const fr = frames[Math.round((h.s + h.e) / 2) % (n + 1)]
    const body = [fr.jointKneeL, fr.jointKneeR, mean([fr.hipL, fr.jointKneeL]), mean([fr.hipR, fr.jointKneeR]), fr.hips]
    return Math.min(...body.map(b => len(sub(h.at, b)))) < RESTS
  }
  const onOf = h => {
    if (footed.includes(h)) return h.at[1] >= STEP ? 'raised floor' : 'ground'
    if (rungBalls.includes(h)) return 'rung'
    if (overhead.includes(h)) return 'hold'
    if (h.part.startsWith('hand') && h.moved >= ANCHOR && !rests(h)) return 'hold'
    return 'still'
  }
  const plant = (h, on) => ({ point: h.part, from: sec(h.s), to: sec(h.e), at: r3(h.at), on })
  const plants = [...holds.map(h => plant(h, onOf(h))), ...kicked.map(k => plant(k, 'wall')), ...pressed.map(p => plant(p, 'ledge'))]

  const first = frames[0].hips, last = frames[n].hips
  return {
    name: words.name, description: words.description, case: kase.case, loop, dur: round(n / fps), frames: n + 1, turned: turnBy,
    travel: r3(sub(last, first)),
    lap: loop ? r3(sub(last, first)) : null,
    floor: endFloor && endFloor.y >= STEP ? round(endFloor.y) : null,
    plants,
    floors: floors.map(l => ({ y: round(l.y), from: sec(l.from), to: sec(Math.min(l.to, n)), by: [...l.by] })),
    lift: lift ? lift.map((v, f) => [sec(f), round(v)]) : null,
    things, doubts,
  }
}

if (process.argv[1] === import.meta.filename && process.argv[2] === 'rig') {
  // Each clip of the rig as baked onto each body (the header), not lifted: the export has laid the clip's
  // sidecar on, so the reading is of the clip as anim plays it.
  const [rigPath, skinPath, outPath] = process.argv.slice(3)
  const rig = JSON.parse(readFileSync(rigPath, 'utf8'))
  const skins = JSON.parse(readFileSync(skinPath, 'utf8'))
  const out = {}
  for (const [body, clips] of Object.entries(skins)) {
    out[body] = {}
    for (const [name, s] of Object.entries(clips)) {
      const e = typeof rig.clips[name] === 'string' ? { file: rig.clips[name] } : rig.clips[name]
      if (s.error) throw new Error(`anim.touches.mjs: ${name} (${e.file}) could not be measured on ${body}: ${s.error}`)
      out[body][name] = read(e.file, s, { loop: !!e.loop, lift: false })
    }
  }
  writeFileSync(outPath, JSON.stringify(out))
  console.log(`TOUCHES ${outPath} bodies=${Object.keys(out).length}`)
} else if (process.argv[1] === import.meta.filename) {
  const pattern = process.argv[2] ? new RegExp(process.argv[2], 'i') : null
  const files = Object.keys(roots).filter(f => existsSync(path.join(SKIN, f + '.json')))
  const out = {}
  const counts = {}
  for (const file of files) {
    if (pattern && !pattern.test(file) && !pattern.test(roots[file].name ?? '') && !pattern.test(roots[file].description ?? '')) continue
    const s = JSON.parse(readFileSync(path.join(SKIN, file + '.json'), 'utf8'))
    if (s.error) { out[file] = { error: s.error }; continue }
    out[file] = read(file, s)
    counts[out[file].case] = (counts[out[file].case] ?? 0) + 1
  }
  if (pattern) {
    for (const [file, c] of Object.entries(out)) {
      console.log(`\n== ${file}\n   ${c.name} | ${c.description ?? ''} → ${c.case}  (${c.dur}s${c.loop ? ' loop' : ''}, travel ${c.travel})`)
      console.log(`   floors ${c.floors.map(l => `${l.y}@${l.from}-${l.to}[${l.by}]`).join(' ')}${c.lift ? `  lift ${Math.min(...c.lift.map(r => r[1]))}..${Math.max(...c.lift.map(r => r[1]))}` : ''}`)
      console.log(`   things ${JSON.stringify(c.things)}`)
      for (const d of c.doubts) console.log(`   ? ${d.question}`)
    }
  } else {
    writeFileSync(OUT, JSON.stringify({ taxonomy: 'plugins/anim/anim.touches.json', clips: out }) + '\n')
    console.log(`wrote ${path.relative(troupe, OUT)}: ${Object.keys(out).length} clips`)
  }
  console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '))
}
