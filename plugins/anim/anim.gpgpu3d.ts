// anim's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's: the bodies anim draws as things on the
// GPU. A scene with `world.gpgpu3d.mods: { things: ['anim'], behaviors: ['anim'] }`, and anim listed, has
// every body of a kind that has capsules (`world.anim.kinds.<kind>.capsules`, and those the `capsules` mod gives
// the kind, item3d's off its bodies sheet: `anim.sim.ts`'s `capsulesOf`) met by whatever asks
// gpgpu3d: a cape draped on the body that wears it, a particle bounced off it.
//
// `things(plugins, near)` hands back, for every row anim draws whose kind has capsules and whose model
// is made, each capsule whose middle is within `near.reach` of `near.at`: `{ capsule: { key, a, b, radius }
// }`, `key` its row and its place in the list, `a` and `b` where its two bones stand as they are when it is
// asked: posed for the frame once anim has ticked, and between the steps where the frame is drawn. A ball,
// `{ bone, at, radius }`, is a capsule whose two ends are the one point its bone carries. A
// capsule that names a bone the body has none of throws, naming the kind and the bone.
//
// `behaviors()` delivers `capsule`, a thing that moves, its speed its middle's. A line meets it as
// hitscan3d's `capsule` does; a point within it is put out of it by the nearest way.
import type { Plugins } from '#engine/browser.ts'
import { carried, type Behavior, type Near, type Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import { animKind, capsulesOf, numbersOf } from './anim.sim.ts'

export type Held = { key: string; a: number[]; b: number[]; radius: number }
const middle = (c: Held) => [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, (c.a[2] + c.b[2]) / 2]

export function things(plugins: Plugins, near: Near): Thing[] {
  const kinds = numbersOf(plugins.wire)?.kinds ?? {}
  const out: Thing[] = []
  for (const r of plugins.wire.rows) {
    const of = animKind(r)
    if (!kinds[of] || !plugins.anim.model(r.id)) continue
    const list = capsulesOf(plugins, of)
    const end = (on: string, at = [0, 0, 0]) => {
      const bone = plugins.anim.socket(r.id, on)
      if (!bone) throw new Error(`anim: a capsule of the kind ${of} runs to the bone ${on}, which the body has none of`)
      return carried(bone.matrixWorld.elements, at)
    }
    list.forEach((c, i) => {
      const a = 'bone' in c ? end(c.bone, c.at) : end(c.from)
      const capsule: Held = { key: `${r.id} ${i}`, a, b: 'bone' in c ? a : end(c.to), radius: c.radius }
      const m = middle(capsule)
      if (Math.hypot(m[0] - near.at[0], m[1] - near.at[1], m[2] - near.at[2]) <= near.reach) out.push({ capsule })
    })
  }
  return out
}

const CAPSULE = /* glsl */ `
bool capsuleLine(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal) {
  vec4 r0 = gpRow(s, 0), r1 = gpRow(s, 1);
  vec3 a = r0.xyz, ba = vec3(r0.w, r1.xy) - a, oa = o - a;
  float r = r1.z, len2 = dot(ba, ba);
  // every crossing of the side between the ends, and of each end's ball beyond its end: the first and the last
  float first = 1e30, last = -1e30;
  if (len2 > 1e-12) {
    float bd = dot(ba, d), bo = dot(ba, oa);
    float qa = len2 - bd * bd, qb = len2 * dot(oa, d) - bo * bd, qc = len2 * dot(oa, oa) - bo * bo - r * r * len2;
    float disc = qb * qb - qa * qc;
    if (qa > 1e-12 && disc >= 0.0) {
      float sq = sqrt(disc);
      for (int i = 0; i < 2; i++) {
        float tt = (i == 0 ? -qb - sq : -qb + sq) / qa;
        float u = dot(oa + d * tt, ba) / len2;
        if (u >= 0.0 && u <= 1.0) { first = min(first, tt); last = max(last, tt); }
      }
    }
  }
  for (int e = 0; e < 2; e++) {
    vec3 oc = e == 0 ? oa : oa - ba;
    float hb = dot(d, oc), disc = hb * hb - (dot(oc, oc) - r * r);
    if (disc < 0.0) continue;
    float sq = sqrt(disc);
    for (int i = 0; i < 2; i++) {
      float tt = i == 0 ? -hb - sq : -hb + sq;
      float u = len2 > 1e-12 ? dot(oa + d * tt, ba) / len2 : 0.0;
      if (len2 <= 1e-12 || (e == 0 ? u <= 0.0 : u >= 1.0)) { first = min(first, tt); last = max(last, tt); }
    }
  }
  if (last < first) return false;
  vec3 off = oa - ba * (len2 > 1e-12 ? clamp(dot(oa, ba) / len2, 0.0, 1.0) : 0.0);
  bool inside = dot(off, off) <= r * r;
  t = inside ? last : first;
  if (t < 0.0 || t > far) return false;
  vec3 p = oa + d * t;
  vec3 n = p - ba * (len2 > 1e-12 ? clamp(dot(p, ba) / len2, 0.0, 1.0) : 0.0);
  float l = length(n);
  if (l > 0.0) n /= l;
  normal = inside ? -n : n;
  return true;
}
bool capsulePush(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  vec4 r0 = gpRow(s, 0), r1 = gpRow(s, 1);
  vec3 a = r0.xyz, ab = vec3(r0.w, r1.xy) - a;
  float r = r1.z + clear, along = dot(ab, ab);
  vec3 o = x - (a + ab * (along > 1e-12 ? clamp(dot(x - a, ab) / along, 0.0, 1.0) : 0.0));
  float far = length(o);
  if (far >= r) return false;
  depth = r - far;
  normal = far > 1e-9 ? o / far : vec3(0.0, 1.0, 0.0);
  return true;
}
`

const capsule: Behavior = {
  size: 7,
  pack: (c: Held) => [...c.a, ...c.b, c.radius],
  moves: (c: Held) => ({ key: c.key, at: middle(c) }),
  glsl: CAPSULE,
}

export const behaviors = () => ({ capsule })
