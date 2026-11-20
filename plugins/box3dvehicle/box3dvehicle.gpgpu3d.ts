// box3dvehicle's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's: every car as things on the
// GPU. A scene with `world.gpgpu3d.mods: { things: ['box3dvehicle'], behaviors: ['box3dvehicle'] }` has each
// car's body and wheels met by whatever asks gpgpu3d, and pressing the grass that names them
// (`box3dvehicle.grass3d.ts`).
//
// `things(plugins, near)` hands back the boxes box3dvehicle hands lod3d (`box3dvehicle.lod3d.ts`), each
// whose middle is within `near.reach` of `near.at`: `{ hyperbox: { at, rot, half } }`, a box turned any
// way, its middle at `at`, turned by `rot` [x, y, z, w], reaching `half` [x, y, z] metres each way along
// its own axes.
//
// `behaviors()` delivers `hyperbox`. A line meets it where it first enters it, and one that starts inside
// it meets nothing of it, as shapes3d's `box` on the GPU; a point within it is put out of it by the nearest
// way.
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Near, Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import { hollows } from './box3dvehicle.lod3d.ts'

export type Hyperbox = { at: number[]; rot: number[]; half: number[] }

export const things = (plugins: Plugins, near: Near): Thing[] =>
  hollows(plugins)
    .filter(h => Math.hypot(h.at[0] - near.at[0], h.at[1] - near.at[1], h.at[2] - near.at[2]) <= near.reach)
    .map(h => ({ hyperbox: { at: h.at, rot: h.rot, half: h.half } }))

const HYPERBOX = /* glsl */ `
vec3 hyperboxTurn(vec4 r, vec3 v) { vec3 t = 2.0 * cross(r.xyz, v); return v + r.w * t + cross(r.xyz, t); }
bool hyperboxLine(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal) {
  vec4 a = gpRow(s, 0), b = gpRow(s, 1);
  vec4 rot = vec4(a.w, b.xyz), back = vec4(-rot.xyz, rot.w);
  vec3 half_ = vec3(b.w, gpRow(s, 2).xy);
  vec3 lo = hyperboxTurn(back, o - a.xyz), ld = hyperboxTurn(back, d);
  float tin = -1e30, tout = 1e30;
  vec3 nin = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    if (abs(ld[i]) < 1e-12) { if (abs(lo[i]) > half_[i]) return false; continue; }
    float t1 = (-half_[i] - lo[i]) / ld[i], t2 = (half_[i] - lo[i]) / ld[i];
    vec3 n = vec3(0.0);
    n[i] = ld[i] > 0.0 ? -1.0 : 1.0;
    if (min(t1, t2) > tin) { tin = min(t1, t2); nin = n; }
    tout = min(tout, max(t1, t2));
    if (tin > tout) return false;
  }
  if (tin < 0.0 || tin > far) return false;
  t = tin;
  normal = hyperboxTurn(rot, nin);
  return true;
}
bool hyperboxPush(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  vec4 a = gpRow(s, 0), b = gpRow(s, 1);
  vec4 rot = vec4(a.w, b.xyz);
  vec3 reach = vec3(b.w, gpRow(s, 2).xy) + clear;
  vec3 lo = hyperboxTurn(vec4(-rot.xyz, rot.w), x - a.xyz);
  if (any(greaterThan(abs(lo), reach))) return false;
  depth = 1e30;
  vec3 n = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    if (reach[i] - abs(lo[i]) < depth) { depth = reach[i] - abs(lo[i]); n = vec3(0.0); n[i] = lo[i] < 0.0 ? -1.0 : 1.0; }
  }
  normal = hyperboxTurn(rot, n);
  return true;
}
`

const hyperbox: Behavior = { size: 10, pack: (h: Hyperbox) => [...h.at, ...h.rot, ...h.half], glsl: HYPERBOX }

export const behaviors = () => ({ hyperbox })
