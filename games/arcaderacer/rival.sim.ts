// A CPU racer. It starts on grid place `grid` and each step of the race works out its own controls
// with the drive plugin's `pilot`, by its definition's `ai` (every number of it is in the drive
// plugin's header), then is driven and timed by the drive plugin's `run`, as the seat's car is, by its
// definition's `drive` numbers.
//
// It is a cast member of the title's intro (core's `plugins/cutscene`, the contract of a cast kind):
// it carries `name`, the cast's name for it, '' where nothing casts it. Cast, it drives on by its own
// `pilot` exactly as it would uncast, so the camera films a real race: `direct` is set on it while the
// intro plays, and it takes no cue of the cutscene's but the shots that follow or look at it. A `walk`,
// `face`, `play` or `gesture` handed it throws, naming the cue's verb, since a car driven by its pilot
// can do none of them. Its act `advance(dt)` runs exactly its own step, `before` and `tick`, which the
// cutscene calls on every cast member for each step it plays through when the intro is skipped. It has
// no `go`: the intro's cue file sends nobody anywhere at its end.
import type { Kind, Row, W } from '#engine/engine.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import { courseOf, gridAt, trackOf } from './plugins/track/track.sim.ts'
import { CONTROLS, control, pilot, place, run, type Control } from './plugins/drive/drive.sim.ts'

// What a cast member is directed to do that a car driven by its pilot cannot.
const UNDRIVEN = ['walk', 'face', 'play', 'gesture']

function before(me: Row, w: W) {
  if (me.data.seg >= 0) return
  place(me, w, gridAt(trackOf(w), courseOf(w).track.grid, me.data.grid))
}

function tick(me: Row, dt: number, w: W) {
  const direct = me.data.direct
  if (direct) {
    const asked = UNDRIVEN.find(k => Object.hasOwn(direct, k))
    if (asked) throw new Error(`the rival ${me.data.name} was handed a ${asked} cue, and a rival is driven by its pilot`)
  }
  const race = w.find('race')
  if (me.data.seg >= 0 && race.data.phase !== 'grid' && race.data.phase !== 'count') {
    const wants = pilot(w, me, def(w, me.kind).ai, me.data.grid)
    for (const name of Object.keys(CONTROLS) as Control[]) control(me, name, wants[name])
  }
  run(me, dt, w, race)
}

export const rival: Kind = {
  before(me, _dt, w) { before(me, w) },
  tick(me, dt, w) { tick(me, dt, w) },
  acts: {
    advance(me, w, _seat, dt: number) {
      before(me, w)
      tick(me, dt, w)
    },
  },
}
