// box3dvehicle's mod for grass3d (`addons/scenemanager`'s mods). A scene with
// `world.grass3d.mods: { behaviors: ['box3dvehicle'] }` has the grass pressed by every `hyperbox` gpgpu3d
// holds for it, which are every car's body and wheels (`box3dvehicle.gpgpu3d.ts`): the grass bends away
// from each and is trampled under where it stands on the ground, so a car's wheels lay tracks behind it.
//
// `behaviors()` delivers `hyperbox` (grass3d's Press). A box stands over a blade whose root is not over
// its top and whose tip reaches its underside, the root's height taken in the box's own frame; the root is
// outside its footprint by how far it stands from the box across and along, in the box's own frame. It
// treads a ground point inside it, or within `tread` metres of it, or half a cell where that is more: a
// wheel at any turn of its spin, a body only where it sits on the ground.
import type { Press } from '#plugins/grass3d/grass3d.sim.ts'
import type { Hyperbox } from './box3dvehicle.gpgpu3d.ts'
import { turn } from './box3dvehicle.sim.ts'

const PRESS = /* glsl */ `
bool hyperboxPress( int s, vec3 root, float tall, out float out_, out vec2 middle ) {
  vec4 a = gpRow( s, 0 ), b = gpRow( s, 1 );
  vec3 half_ = vec3( b.w, gpRow( s, 2 ).xy );
  vec3 q = hyperboxTurn( vec4( -a.w, -b.xyz ), root - a.xyz ) / half_;
  if ( q.y < -1.0 - tall / half_.y || q.y > 1.0 ) return false;
  out_ = length( max( ( abs( q.xz ) - 1.0 ) * half_.xz, 0.0 ) );
  middle = a.xz;
  return true;
}
`

const hyperbox: Press = {
  glsl: PRESS,
  span: (h: Hyperbox) => ({ at: h.at, reach: Math.hypot(h.half[0], h.half[1], h.half[2]) }),
  trodden(h: Hyperbox, x, y, z, { tread, cell }) {
    const q = turn([-h.rot[0], -h.rot[1], -h.rot[2], h.rot[3]], [x - h.at[0], y - h.at[1], z - h.at[2]])
    const out = (k: number) => Math.max(0, Math.abs(q[k]) - h.half[k])
    return Math.hypot(out(0), out(1), out(2)) <= Math.max(tread, cell / 2)
  },
}

export const behaviors = () => ({ hyperbox })
