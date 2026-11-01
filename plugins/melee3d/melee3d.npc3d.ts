// melee3d's mod for npc3d (`addons/scenemanager`'s mods): a sword fight, the behaviour `fight`, for an
// NPC that holds a blade melee3d knows, on npc3d's walker body. A scene names it in
// `world.npc3d.mods.behaviors: 'melee3d'`, and a key of an NPC's `behaviors` named `fight`, or one whose
// `as` is `fight`, has it.
//
// Who it fights. Its foes are the rows of the kinds the list its setting `at` names holds (a list of
// its definition's, npc3d's `listOf`) that it has noticed (npc3d's `noticing`, `aware` 1, kept while it
// remembers them), that stand (not `limp`) with `health` left, and whose team is not its own: a row's
// `team`, else its definition's, else ''. A foe is swinging at it when melee3d's `liveOf` of the foe's
// definition's `strikes` names a clip, whose `hit` marker (anim's) the foe's playhead has not reached.
// Its rivals are the rows of its own kind on its team that stand with `health` left, hold a blade
// (melee3d's `blades`) and fight the same foe.
//
// Its settings, metres, seconds and degrees:
//   weight     its score while it has a foe, or its guard is up; with neither, 0.
//   at         the list of its definition's that names the kinds it fights.
//   speed      `{ walk, run }` m/s.
//   near       within this of its foe it walks and faces it; further, it runs.
//   reach      it strikes within this of its foe.
//   face       it strikes facing its foe within this.
//   ring       the radius of the ring a rival waits on round a foe, and `slots`, the bearings on it,
//              degrees about the way the foe faces, taken in turn by the waiting rivals.
//   attackers  how many of a foe's rivals engage it at once: the nearest, then by id.
//   retarget   it turns to another foe standing nearer than this share of its foe's distance.
//   wait       [lo, hi] seconds, rolled, between its attacks, counted down only while it is free.
//   chain      the clips of its strike chain, in order, and `most` the most strikes a chain throws.
//   heavy      the clip of its heavy strike, thrown with odds `heavyOdds`.
//   sees       metres within which a foe's swing, facing it within 60°, is judged.
//   guardOdds  the odds its guard rises against a swing it judges, after a reaction rolled in `react`.
//   block      [start, hold, end], the clips of its guard.
//   unarmed    with no blade (the hand cut off) it backs away at its walk until this far off.
//   crawl      `{ stance, speed }`: kneeling in that stance of its rig (a leg cut off), it crawls at
//              that speed toward its foe and does nothing else.
//
// Its row carries: `target`, the id of the foe it fights, or null; `wait`, the seconds before its next
// attack may begin, null until it is first rolled; `chain`, the strikes of its chain still to throw
// after the one playing; `queued`, the strike that starts once the one playing is past its cancel, or
// null; `guard`, its block is up, and `guardFor`, the seconds it has been; `read`, the swing it last
// judged (`<id>:<clip>`); `wary`, the seconds before its guard rises against it, or null; and
// `ticked`, the time of npc3d's clock it last stepped, null when it has not stepped since it started.
//
// It starts by halting its walk where it stands. Each step (`tick`):
//   1. Its foe: the one it has while that is a foe still, unless another stands nearer than `retarget`
//      of its distance, which it turns to; with none, the nearest; or none. Its eyes go to its foe.
//   2. Its place. Kneeling, it crawls toward its foe. With no blade it backs off facing it. Armed, the
//      first `attackers` of the foe's rivals close to `reach`, and the rest go to their slot on the ring,
//      each the next of `slots`, so a crowd surrounds a body and takes turns at it. Within `near` it
//      faces its foe.
//   3. Its guard. A foe's swing it has not judged is judged once: with odds `guardOdds` its guard rises
//      after the reaction, if it is free then and the swing still comes. The guard is `block`'s start,
//      then its hold, and its end once no swing comes; it stands still facing its foe while it is up.
//   4. Its attack: engaged, armed, free, guard down, `wait` run out, within `reach` and facing its foe
//      within `face`, it throws `heavy` with odds `heavyOdds`, or else begins `chain` with 1 to `most`
//      strikes rolled, and `wait` is rolled again. Each strike of the chain past its `chain` marker
//      queues the next while strikes remain, and a queued strike starts the first step the one playing
//      is past its cancel.
//   5. What it asks of walker. In an act it asks nothing, and the clip's travel is its rule's to carry;
//      an act past its cancel gives way to the walk it wants (anim's `stop`). Its body then walks and is
//      animated, as npc3d's walker body does.
// Free is grounded and not held by its act (anim's `committed`). An attack and a guard are acts,
// played held when their clip has no `cancel` marker.
import type { Row, W } from '#engine/engine.ts'
import type { Behavior, Body, Noticing, Settings } from '#plugins/npc3d/npc3d.sim.ts'
import { listOf, roll } from '#plugins/npc3d/npc3d.sim.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import { clipOf, committed, play, rigOf, stop } from '#plugins/anim/anim.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { blades, liveOf } from './melee3d.sim.ts'

const DEG = Math.PI / 180
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))

const alive = (r: Row) => !r.data.limp && r.data.health > 0
const teamOf = (w: W, r: Row): string => r.data.team ?? def(w, r.kind).team ?? ''
const apart = (a: Row, b: Row) => math.hypot(b.data.pos[0] - a.data.pos[0], b.data.pos[2] - a.data.pos[2])
const bearing = (a: Row, b: Row) => math.atan2(b.data.pos[0] - a.data.pos[0], b.data.pos[2] - a.data.pos[2])
// A clip with no cancel marker holds the body until it ends.
const holds = (w: W, me: Row, clip: string) => !clipOf(rigOf(w, me.kind), clip).markers.some(m => m.name === 'cancel')
const act = (w: W, me: Row, clip: string) => play(me, clip, { holds: holds(w, me, clip) })
const marker = (w: W, r: Row, clip: string, name: string) => clipOf(rigOf(w, r.kind), clip).markers.find(m => m.name === name)?.t

// Every foe `me` has noticed (Who it fights, above).
function foesOf(me: Row, w: W, set: Settings, k: Settings): Row[] {
  const kinds = listOf(me.kind, k, set.at)
  const mine = teamOf(w, me)
  const noticing = me.data.noticing as Record<string, Noticing>
  return kinds.flatMap(kind => w.all(kind)).filter(r => r.id !== me.id && noticing[r.id]?.aware >= 1 && alive(r) && teamOf(w, r) !== mine)
}

// The swing of a foe within `sees`, facing `me`, that has not reached its `hit` marker: its key.
function threat(me: Row, w: W, set: Settings, foes: Row[]): string | undefined {
  for (const r of foes) {
    if (apart(me, r) > set.sees) continue
    if (Math.abs(wrap(bearing(r, me) - r.data.yaw)) > 60 * DEG) continue
    const live = liveOf(r, def(w, r.kind).strikes ?? {})
    if (live === null) continue
    const t = r.data.upper === live ? r.data.upperT : r.data.clipT
    const hit = marker(w, r, live, 'hit')
    if (hit !== undefined && t < hit) return `${r.id}:${live}`
  }
  return undefined
}

const fight: Behavior = {
  score: (me, w, set, _time, _body, k) => (me.data.guard || foesOf(me, w, set, k).length > 0 ? set.weight : 0),
  start(me, _w, _set, time, body: Body) {
    body.halt(me, time)
    me.data.ticked = null
  },
  tick(me, w, set, time, _body, k) {
    const d = me.data
    const dt = d.ticked === null ? 0 : time - d.ticked
    d.ticked = time
    if (d.wait === null) d.wait = roll(w, set.wait)
    d.jump = false

    // 1. Its foe.
    const foes = foesOf(me, w, set, k)
    let foe = d.target === null ? undefined : foes.find(r => r.id === d.target)
    const nearest = foes.slice().sort((a, b) => apart(me, a) - apart(me, b) || a.id - b.id)[0]
    if (!foe || (nearest && apart(me, nearest) < apart(me, foe) * set.retarget)) foe = nearest
    d.target = foe ? foe.id : null
    const gaze = foe ? bearing(me, foe) : null
    if (gaze !== d.gaze) d.gaze = gaze

    const free = d.grounded && !committed(me)
    const armed = blades(w, me).length > 0
    let want = [0, 0]
    let face: number | null = null

    // 2. Its place.
    if (foe) {
      const far = apart(me, foe), way = bearing(me, foe)
      const toward = (speed: number) => [math.sin(way) * speed, math.cos(way) * speed]
      if (d.rig === set.crawl.stance) {
        want = toward(set.crawl.speed)
        face = way
      } else if (!armed) {
        if (far < set.unarmed) want = toward(-set.speed.walk)
        face = way
      } else {
        const rivals = w.all(me.kind).filter(r => alive(r) && teamOf(w, r) === teamOf(w, me) && r.data.target === foe.id && blades(w, r).length > 0)
          .sort((a, b) => apart(a, foe) - apart(b, foe) || a.id - b.id)
        const rank = Math.max(0, rivals.findIndex(r => r.id === me.id))
        if (rank < set.attackers) {
          if (far > set.reach) want = toward(far > set.near ? set.speed.run : set.speed.walk)
        } else {
          const slot = foe.data.yaw + set.slots[(rank - set.attackers) % set.slots.length] * DEG
          const sx = foe.data.pos[0] + math.sin(slot) * set.ring, sz = foe.data.pos[2] + math.cos(slot) * set.ring
          const gap = math.hypot(sx - d.pos[0], sz - d.pos[2])
          if (gap > 0.4) {
            const speed = gap > set.near ? set.speed.run : set.speed.walk
            want = [((sx - d.pos[0]) / gap) * speed, ((sz - d.pos[2]) / gap) * speed]
          }
        }
        if (far < set.near) face = way

        // 3. Its guard.
        const coming = threat(me, w, set, foes)
        if (coming !== undefined && coming !== d.read) {
          d.read = coming
          if (w.die() < set.guardOdds) d.wary = roll(w, set.react)
        }
        if (d.wary !== null) {
          d.wary -= dt
          if (d.wary <= 0) {
            d.wary = null
            if (coming !== undefined && free && !d.guard) {
              act(w, me, set.block[0])
              d.guard = true
              d.queued = null
            }
          }
        }
        if (d.guard) {
          if (coming === undefined && d.state === 'loco') d.guard = false
          else if (coming === undefined && d.clip === set.block[1]) {
            act(w, me, set.block[2])
            d.guard = false
          } else if (d.state === 'loco') act(w, me, set.block[1])
          want = [0, 0]
          face = way
        }

        // 4. Its attack.
        if (free && d.state !== 'act') d.wait = Math.max(0, d.wait - dt)
        const engaged = rank < set.attackers
        if (engaged && free && !d.guard && d.wait <= 0 && far <= set.reach && Math.abs(wrap(way - d.yaw)) < set.face * DEG) {
          if (w.die() < set.heavyOdds) {
            act(w, me, set.heavy)
            d.chain = 0
          } else {
            act(w, me, set.chain[0])
            d.chain = Math.floor(w.die() * set.most)
          }
          d.wait = roll(w, set.wait)
          want = [0, 0]
        }
        const chain = set.chain as string[]
        if (d.state === 'act' && chain.includes(d.clip) && d.chain > 0 && d.queued === null && d.clipT >= marker(w, me, d.clip, 'chain')!) {
          d.queued = chain[(chain.indexOf(d.clip) + 1) % chain.length]
          d.chain -= 1
        }
        if (d.queued !== null && !committed(me) && !d.guard) {
          act(w, me, d.queued)
          d.queued = null
        }
      }
    } else if (d.guard) {
      act(w, me, set.block[2])
      d.guard = false
    }
    d.guardFor = d.guard ? d.guardFor + dt : 0

    // 5. What it asks of walker.
    if (d.state === 'act' && !committed(me) && (want[0] || want[1]) && d.queued === null && !d.guard) stop(me, w)
    if (d.state === 'act') {
      d.want = [0, 0]
      d.face = null
    } else {
      d.want = want
      d.face = face
    }
  },
}

export const behaviors = (): Record<string, Behavior> => ({ fight })
