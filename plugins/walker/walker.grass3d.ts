// walker's mod for grass3d (`addons/scenemanager`'s mods). A scene with
// `world.grass3d.mods: { behaviors: ['walker'] }` has the grass pressed by every `cylinder` gpgpu3d holds
// for it, which are every walking body (`walker.gpgpu3d.ts`): the grass bends away from each and is
// trampled under while the body stands on the ground.
//
// `behaviors()` delivers `cylinder` (grass3d's Press). An upright cylinder stands over a blade whose root
// is not over its top and whose tip reaches to within UNDER metres of its foot; the root is outside its
// footprint by how far it stands from its side. It treads a ground point within its radius, or half a cell
// where that is more, while its foot is within `tread` metres of the ground there.
import type { Press } from '#plugins/grass3d/grass3d.sim.ts'

// Metres under a cylinder's foot a blade's tip may stand and still be pushed by it.
const UNDER = 0.2

type Cylinder = { pos: number[]; radius: number; height: number }

const PRESS = /* glsl */ `
bool cylinderPress( int s, vec3 root, float tall, out float out_, out vec2 middle ) {
  vec4 a = gpRow( s, 0 );
  if ( root.y > a.y + gpRow( s, 1 ).x || root.y + tall < a.y - ${UNDER} ) return false;
  out_ = max( length( root.xz - a.xz ) - a.w, 0.0 );
  middle = a.xz;
  return true;
}
`

const cylinder: Press = {
  glsl: PRESS,
  span: (c: Cylinder) => ({ at: c.pos, reach: c.radius }),
  trodden: (c: Cylinder, x, y, z, { tread, cell }) =>
    Math.hypot(x - c.pos[0], z - c.pos[2]) <= Math.max(c.radius, cell / 2) && Math.abs(c.pos[1] - y) <= tread,
}

export const behaviors = () => ({ cylinder })
