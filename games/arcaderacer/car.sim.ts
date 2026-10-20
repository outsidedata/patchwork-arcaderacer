// A seat's car: a racer on grid place `grid`, which the match plugin's `role` makes when the match
// sends a racer to the course, and which that racer's `player` row holds (`take` in `plugins/player`).
// Its `before` puts it on its grid place; each step of the race it is driven and timed by the drive
// plugin's `run`, by its definition's `drive` numbers, as a rival is.
//
// Its four controls, `steer`, `throttle`, `brake` and `handbrake`, are its acts, each one number
// (`CONTROLS` in the drive plugin). None is `open`: a seat reaches them only through the `player` row
// that holds the car, which passes its presses on (`relay`). A car no `player` row holds, as when its
// racer's seat has left, has every control at 0 from the next step and stands on where it was.
import type { Kind, Row, W } from '#engine/engine.ts'
import { holderOf } from '#plugins/player/player.sim.ts'
import { courseOf, gridAt, trackOf } from './plugins/track/track.sim.ts'
import { CONTROLS, control, place, run, type Control } from './plugins/drive/drive.sim.ts'

const hand = (name: Control) => (me: Row, _w: W, _seat: number, v: unknown) => control(me, name, v)

export const car: Kind = {
  before(me, _dt, w) {
    if (me.data.seg < 0) place(me, w, gridAt(trackOf(w), courseOf(w).track.grid, me.data.grid))
    if (!holderOf(w, me)) for (const name of Object.keys(CONTROLS) as Control[]) me.data[name] = 0
  },
  tick(me, dt, w) {
    run(me, dt, w, w.find('race'))
  },
  acts: {
    steer: hand('steer'),
    throttle: hand('throttle'),
    brake: hand('brake'),
    handbrake: hand('handbrake'),
  },
}
