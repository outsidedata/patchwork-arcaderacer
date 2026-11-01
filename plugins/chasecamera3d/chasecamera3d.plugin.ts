// chasecamera3d: render3d's camera held on one row, a rigid orbit about it. It has no row, no prefab
// and no server half.
//
// The game names the row with `follow(id)`, from the setup of the seat's own actor, which the client
// runs before the ticks of the frame the row first arrives in. The row carries `pos`, `lift` and
// `look { yaw, pitch, dist, side? }`, and the camera is placed from them as this frame's rows
// hold them: the pivot is `pos` raised by `lift`, and moved `side` metres to the right of the way
// `yaw` looks, (−cos yaw, 0, sin yaw), when the row gives a `side`, so the body stands off the middle
// of the view and a reticle there looks past its shoulder; the eye is the pivot plus `dist` times
// (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch); the camera's up is world up, set again every
// frame because something else may have turned it, and it looks at the pivot. That is the whole of it. The
// camera moves exactly as the row does: it adds no speed of the body's, no easing from where
// it was, no floor under it, no jump past a distance, no chance and no count of frames or steps.
// Whatever has to turn or rise gradually, a lock-on's yaw or a crouch's pivot, is a field of the row
// that its rule moves at a rate, and the camera sits on that field. A camera that shakes on a body
// that shakes is fixed in the body.
//
// It places the camera in its `tick`. Every plugin's tick runs before any actor's tick and any
// `afterTick`, and render3d draws, and every plugin that builds round the camera reads it, in
// `afterTick`, so each of them sees this frame's camera, the first frame's too. It is listed after
// render3d, whose first tick makes the camera from its own prefab (`at`, `look`) and would put that
// over a camera placed before it. Listed otherwise, or in a scene with no render3d camera, its tick
// throws.
//
// The camera has one driver at a time: this places it only while `render3d.claimed()` is empty, and
// never claims it, so a cutscene or the editor's orbit keeps it while they hold it, and the frame
// they let go it is back on the row. It places nothing before `follow`, or on a frame whose rows
// lack the followed row: the camera stays where it was.
//
// `eye()` is `{ pos, dir }`: where render3d's camera stands and the way it looks, its world −z,
// whoever placed it. It throws before the first tick.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'

type V3 = [number, number, number]
// What the followed row carries that this reads.
export type Followed = { pos: V3; lift: number; look: { yaw: number; pitch: number; dist: number; side?: number } }

export function chasecamera3d() {
  let id: number | undefined
  let render3d: Plugins['render3d'] | undefined

  return {
    follow(row: number) { id = row },
    tick(plugins: Plugins) {
      const order = plugins.wire.scene.plugins!
      const me = order.indexOf('chasecamera3d')
      if (!order.includes('render3d')) throw new Error('chasecamera3d places render3d\'s camera, and the scene does not list render3d')
      if (order.indexOf('render3d') > me) throw new Error('chasecamera3d is listed before render3d, whose first tick would put its prefab camera over the one placed')
      render3d = plugins.render3d
      const camera = render3d.camera as THREE.PerspectiveCamera | undefined
      if (!camera) throw new Error('chasecamera3d places render3d\'s camera, and the scene gives no render3d prefab to make one')
      if (render3d.claimed() !== undefined) return
      const row = plugins.wire.rows.find(r => r.id === id)
      if (!row) return
      const { pos, lift, look: { yaw, pitch, dist, side = 0 } } = row.data as Followed
      const x = pos[0] - side * Math.cos(yaw), y = pos[1] + lift, z = pos[2] + side * Math.sin(yaw)
      camera.position.set(x + dist * -Math.sin(yaw) * Math.cos(pitch), y + dist * Math.sin(pitch), z + dist * -Math.cos(yaw) * Math.cos(pitch))
      camera.up.set(0, 1, 0)
      camera.lookAt(x, y, z)
    },
    eye(): { pos: number[]; dir: number[] } {
      const camera = render3d?.camera as THREE.PerspectiveCamera | undefined
      if (!camera) throw new Error('chasecamera3d has no camera to read: it has not ticked, or render3d made none')
      const { Vector3 } = render3d.THREE as typeof THREE
      return { pos: camera.getWorldPosition(new Vector3()).toArray(), dir: camera.getWorldDirection(new Vector3()).toArray() }
    },
  }
}
