// One seat's keys and its camera, once its `player` row holds a car on the grid (`holding`): a
// spectator's row holds none, binds no key and leaves the camera to the match plugin. The keys: steer on
// the left and right arrows, a and d, the d-pad and the left stick; throttle on up, w and the pad's
// bottom button or right trigger; brake on down, s and the pad's right button or left trigger; the
// handbrake on the space bar and the pad's left button. Each is sent to the seat's `player` row as it
// changes, which passes it on to the car it holds. A racer has no key back to the title.
//
// The camera rides the car the seat holds: `back` metres behind it along its `cam` heading (which the
// drive plugin swings toward the car's course, so a drift shows the car's side) and `high` over it,
// looking at a point `ahead` metres along that heading and `aim` over the car. It is set from the
// frame's rows alone, with nothing kept from frame to frame, so it moves exactly as the car is drawn.
// Its field of view is `fov` degrees, `fast` more at the car's top speed and `boosted` more while it
// boosts, eased out over its last `ease` seconds. The speed is felt in the standoff too: at top speed
// the camera stands `stretch` metres further back and `drop` lower, `kick` further while it boosts,
// and it rumbles `rumble` { fast, boosted, wave, cross }: up to `fast` metres × the square of the
// share of top speed it goes, `boosted` more boosting, up and down along a wave of `wave` radians a
// metre the car travels (its `far`), and side to side along one `cross` [times as fast, a phase
// ahead], so it moves with the car's own travel and never with a frame or a step counter. The
// numbers are the `player` definition's `camera`. While anything else holds render3d's
// camera, the editor's orbit say, it is left alone.
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { holding, type Binds } from '#plugins/player/player.plugin.ts'
import { def } from '#plugins/loader/loader.sim.ts'

function bindOurs(plugins: Plugins) {
  plugins.player.bind({
    axis: [{ keys: [['ArrowLeft', 'a', 'Pad14', 'PadStickLeft'], ['ArrowRight', 'd', 'Pad15', 'PadStickRight']], send: v => ['steer', v] }],
    hold: [
      { keys: ['ArrowUp', 'w', 'Pad0', 'Pad7'], send: v => ['throttle', v] },
      { keys: ['ArrowDown', 's', 'Pad1', 'Pad6'], send: v => ['brake', v] },
      { keys: [' ', 'Pad2'], send: v => ['handbrake', v] },
    ],
  } satisfies Binds)
}

function tickOurs(row: Row, car: Row, plugins: Plugins) {
  const { render3d, wire } = plugins
  const camera = render3d.camera as THREE.PerspectiveCamera | undefined
  if (!camera || render3d.claimed() !== undefined) return
  const C = def(wire, row.kind).camera
  const top = def(wire, car.kind).drive.top
  const { pos, cam, speed, boost, far } = car.data
  const fast = Math.min(1, speed / top), boosting = Math.min(1, boost / C.ease)
  const fx = Math.sin(cam), fz = Math.cos(cam)
  // the rumble: a wave along the road, so it is as smooth as the car's own travel
  const R = C.rumble
  const amp = (R.fast * fast * fast + R.boosted * boosting) * Math.sin(far * R.wave)
  const amp2 = (R.fast * fast * fast + R.boosted * boosting) * Math.sin(far * R.wave * R.cross[0] + R.cross[1])
  const back = C.back + C.stretch * fast + C.kick * boosting
  const high = C.high - C.drop * fast + amp
  camera.position.set(pos[0] - fx * back + fz * amp2, pos[1] + high, pos[2] - fz * back - fx * amp2)
  camera.up.set(0, 1, 0)
  camera.lookAt(pos[0] + fx * C.ahead, pos[1] + C.aim, pos[2] + fz * C.ahead)
  const fov = C.fov + C.fast * fast + C.boosted * boosting
  if (camera.fov !== fov) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
}

// Every seat is sent every `player` row (`addons/player`), and this look is loaded for each: it binds
// keys and moves the camera only for the row that is this seat's, the one that is `mine`, and binds
// the keys the first frame the car it holds stands on the grid.
let ours = false
let bound = false

export function setup(row: Row) {
  ours = row.data.mine === true
}

export function tick(row: Row, plugins: Plugins) {
  if (!ours) return
  const car = holding(plugins.wire.rows)
  if (!car || car.data.seg < 0) return
  if (!bound) { bindOurs(plugins); bound = true }
  tickOurs(row, car, plugins)
}

export function remove(plugins: Plugins) {
  if (bound) plugins.player.unbind()
}
