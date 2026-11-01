// A dvr script (`dvr.ts render <g> --script tools/dvr/scripts/orbit.ts`): the camera taken
// from whatever drives it and swung round the seat's own thing, the row its `player` row holds or
// else the `player` row itself, at `RADIUS` metres out and `HEIGHT` up, a whole turn every `TURN`
// seconds, looking at a point `LOOK` metres above the thing's `pos`. A scene with no render3d, or a
// thing with no `pos`, is filmed as the game draws it.
import { holding, possessed } from '#plugins/player/player.plugin.ts'
import type { Row } from '#engine/engine.ts'

const RADIUS = 9
const HEIGHT = 3.5
const TURN = 12
const LOOK = 1

const owner = 'dvr orbit'

export function direct(film: { plugins: Record<string, any>; rows: Row[]; t: number }) {
  const r3 = film.plugins.render3d
  const thing = holding(film.rows) ?? possessed(film.rows)
  const pos = thing?.data.pos as number[] | undefined
  if (!r3?.camera || !Array.isArray(pos) || !r3.claim(owner)) return
  const a = (film.t / TURN) * Math.PI * 2
  r3.camera.position.set(pos[0] + Math.sin(a) * RADIUS, pos[1] + HEIGHT, pos[2] + Math.cos(a) * RADIUS)
  r3.camera.up.set(0, 1, 0)
  r3.camera.lookAt(pos[0], pos[1] + LOOK, pos[2])
}
