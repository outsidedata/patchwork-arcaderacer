// world3d's mod for npc3d (`addons/scenemanager`'s mods). A scene with `world.npc3d.mods: { behaviors: ['world3d'] }`
// has npc3d take its behaviours for the people world3d spawns from the place's crowd file (`world3d.sim.ts`, People).
// A verb plays one of its clips, any of them at random.
//   loiter    parked at the landmark it is at (`at`): faces the landmark's yaw and plays a loiter verb of one of the
//             landmark's activities, its own verbs for the activity in place of the activity's, for seconds rolled
//             within `for`, and is over. A landmark with no loiter verb for it changes nothing: it stands on as it was,
//             for as long. Its score is its `weight`.
//   transfer  goes on to another landmark of the chain it is at, any of them (`going`), along npc3d's route
//             (`world.npc3d.mods.route`, nav3d's) at `speed`, on a transfer verb of its transfer activity
//             (`transfer`). It takes the landmark's transfer activity first when the landmark names one it has verbs
//             for and not the one it does: any of them, when it names several. There it is at the landmark (`at`), and
//             loiters as `loiter` does. Its score is its `weight`; 0 with no other landmark in its chain, or with no
//             transfer activity yet.
import { pick, roll, travel, type Behavior, type Body } from '#plugins/npc3d/npc3d.sim.ts'
import type { Row, W } from '#engine/engine.ts'
import { activitiesAt, crowdOf, verbsOf } from './world3d.sim.ts'

// The landmarks of the chain `me` is at, but the one it is at.
const onward = (me: Row): string[] => (me.data.chains as string[][]).find(c => c.includes(me.data.at))!.filter(l => l !== me.data.at)

// The transfer activity `me` does on leaving where it is: the landmark's, when it names one `me` has verbs for and
// not the one it does; else the one it does ('' for none).
function transferFrom(me: Row, w: W): string {
  const named = activitiesAt(crowdOf(w), me.data.at, me.data.activities, 'transfer')
  return !named.length || named.includes(me.data.transfer) ? me.data.transfer : pick(w, named)
}

// `me` parked at its landmark: faces its way and plays a loiter verb of it, for seconds rolled within `for`.
function loiter(me: Row, w: W, time: number, body: Body, span: number[]) {
  const crowd = crowdOf(w)
  const own = me.data.activities
  const verbs = activitiesAt(crowd, me.data.at, own, 'loiter').flatMap(a => verbsOf(crowd, a, own, 'loiter'))
  if (verbs.length) {
    body.stand(me, w, time, pick(w, pick(w, verbs).clips))
    body.face(me, time, crowd.landmarks[me.data.at].yaw)
  }
  me.data.until = time + roll(w, span)
}

export function behaviors(): Record<string, Behavior> {
  const parked: Behavior = {
    score: (_me, _w, set) => set.weight,
    start(me, w, set, time, body) {
      loiter(me, w, time, body, set.for)
    },
  }
  const transfer: Behavior = {
    score: (me, w, set) => (onward(me).length && transferFrom(me, w) ? set.weight : 0),
    start(me, w, set, time, body) {
      const crowd = crowdOf(w)
      me.data.transfer = transferFrom(me, w)
      me.data.going = pick(w, onward(me))
      const verb = pick(w, verbsOf(crowd, me.data.transfer, me.data.activities, 'transfer'))
      me.data.until = travel(me, w, time, body, crowd.landmarks[me.data.going].at, set.speed, pick(w, verb.clips))
    },
    arrive(me, w, set, time, body) {
      me.data.at = me.data.going
      loiter(me, w, time, body, set.for)
    },
  }
  return { loiter: parked, transfer }
}
