// The row one seat possesses on a course: the driver, or a spectator. `addons/player` spawns it and
// writes the slot it gave the connection into `seat`, and every seat is sent it. The match addon sends
// a seat to a course as a racer or a spectator, and tells the course's `match` row which this row is
// (`role` in the match plugin), writing `conn`, the seat the match's roster names the connection by
// (−1 until then): a racer's row holds the `car` made for it on its slot's grid place (`held`, `take`
// in `plugins/player`), and a spectator's holds nothing and has `watch`, null on a racer's row.
//
// The acts:
//   steer, throttle, brake, handbrake   each one number, passed on to the car it holds (`relay` in
//            `plugins/player`), and nothing while it holds none. A page running the course ahead
//            (`addons/predict`) runs them on its copy, so the car answers the keys on the next frame.
//   watch(target)  a spectator's choice: the free camera (−1) or a car a racer holds, to follow.
import type { Kind } from '#engine/engine.ts'
import { relay } from '#plugins/player/player.sim.ts'
import { watch } from './plugins/match/match.sim.ts'

export const player: Kind = {
  acts: {
    ...relay({ car: ['steer', 'throttle', 'brake', 'handbrake'] }),
    watch: (me, w, _seat, target) => watch(me, w, target),
  },
}
