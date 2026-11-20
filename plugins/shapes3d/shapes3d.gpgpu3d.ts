// shapes3d's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's: its shapes as things on the GPU.
// A scene with `world.gpgpu3d.mods: { things: ['shapes3d'], behaviors: ['shapes3d'] }` has every box,
// plane, hyperplane and cylinder of shapes3d's met by whatever asks gpgpu3d's `gpLine`.
//
// `things(plugins, near)` hands back each box, plane, hyperplane and cylinder whose footprint reaches
// within `near.reach` of `near.at`, as the data it is, `{ <word>: shape }`, standing where the page draws
// it this frame, between its last two steps (`shapes3d.drawn.ts`); `triangles` are met by nothing, as in
// shapes3d's particle3d mod.
//
// `behaviors()` delivers those four words. Each packs its shape's numbers as they stand. Its `Line` meets
// a line as shapes3d's and hitscan3d's own sums meet it (`lineBox`, `linePlane`, `lineHyperplane`,
// hitscan3d's `cylinder`), but for a line that starts inside a box, which meets nothing of it. Its `Push`
// puts a point `clear` clear of a box or a cylinder it is in, out by the nearest way, and keeps it `clear`
// clear of a plane or a hyperplane on the side it was on.
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Near, Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import { words, type Box, type Cylinder, type Hyperplane, type Plane } from './shapes3d.sim.ts'
import { drawn } from './shapes3d.drawn.ts'

const BOX = /* glsl */ `
bool boxLine(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal) {
  vec3 pos = vec3(gp(s, 0), gp(s, 1), gp(s, 2)), size = vec3(gp(s, 3), gp(s, 4), gp(s, 5));
  float c = cos(gp(s, 6)), sn = sin(gp(s, 6));
  vec3 r = o - pos;
  vec3 lo = vec3(r.x * c - r.z * sn, r.y, r.x * sn + r.z * c);
  vec3 ld = vec3(d.x * c - d.z * sn, d.y, d.x * sn + d.z * c);
  vec3 mn = vec3(-size.x / 2.0, 0.0, -size.z / 2.0), mx = vec3(size.x / 2.0, size.y, size.z / 2.0);
  float tin = -1e30, tout = 1e30;
  vec3 nin = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    if (abs(ld[i]) < 1e-12) { if (lo[i] < mn[i] || lo[i] > mx[i]) return false; continue; }
    float t1 = (mn[i] - lo[i]) / ld[i], t2 = (mx[i] - lo[i]) / ld[i];
    vec3 n1 = vec3(0.0), n2 = vec3(0.0);
    n1[i] = -1.0; n2[i] = 1.0;
    if (t1 > t2) { float tt = t1; t1 = t2; t2 = tt; vec3 nn = n1; n1 = n2; n2 = nn; }
    if (t1 > tin) { tin = t1; nin = n1; }
    if (t2 < tout) tout = t2;
    if (tin > tout) return false;
  }
  if (tin < 0.0 || tin > far) return false;
  t = tin;
  normal = vec3(nin.x * c + nin.z * sn, nin.y, -nin.x * sn + nin.z * c);
  return true;
}
bool boxPush(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  vec4 a = gpRow(s, 0), b = gpRow(s, 1);
  vec3 size = vec3(a.w, b.x, b.y);
  float c = cos(b.z), sn = sin(b.z);
  vec3 r = x - a.xyz;
  vec3 lo = vec3(r.x * c - r.z * sn, r.y, r.x * sn + r.z * c);
  vec3 mn = vec3(-size.x / 2.0, 0.0, -size.z / 2.0) - clear, mx = vec3(size.x / 2.0, size.y, size.z / 2.0) + clear;
  if (any(lessThan(lo, mn)) || any(greaterThan(lo, mx))) return false;
  depth = 1e30;
  vec3 n = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    if (lo[i] - mn[i] < depth) { depth = lo[i] - mn[i]; n = vec3(0.0); n[i] = -1.0; }
    if (mx[i] - lo[i] < depth) { depth = mx[i] - lo[i]; n = vec3(0.0); n[i] = 1.0; }
  }
  normal = vec3(n.x * c + n.z * sn, n.y, -n.x * sn + n.z * c);
  return true;
}
`
// A face with no thickness, in its own frame: the point kept on the side of it that it was on.
const face = (word: string) => /* glsl */ `
bool ${word}Face(vec3 lo, vec3 was, vec2 size, float slope, float clear, out vec3 n, out float depth) {
  if (abs(lo.x) > size.x / 2.0 + clear || abs(lo.z) > size.y / 2.0 + clear) return false;
  float l = sqrt(1.0 + slope * slope);
  float side = was.y - was.z * slope >= 0.0 ? 1.0 : -1.0;
  float off = (lo.y - lo.z * slope) / l * side;
  if (off >= clear) return false;
  depth = clear - off;
  n = vec3(0.0, side / l, -slope * side / l);
  return true;
}
`
const PLANE = /* glsl */ `${face('plane')}
bool planePush(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  vec4 a = gpRow(s, 0), b = gpRow(s, 1);
  float c = cos(b.y), sn = sin(b.y);
  vec3 r = x - a.xyz, w = was - a.xyz, n;
  if (!planeFace(vec3(r.x * c - r.z * sn, r.y, r.x * sn + r.z * c), vec3(w.x * c - w.z * sn, w.y, w.x * sn + w.z * c), vec2(a.w, b.x), b.z, clear, n, depth)) return false;
  normal = vec3(n.x * c + n.z * sn, n.y, -n.x * sn + n.z * c);
  return true;
}
bool planeLine(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal) {
  vec3 pos = vec3(gp(s, 0), gp(s, 1), gp(s, 2));
  vec2 size = vec2(gp(s, 3), gp(s, 4));
  float c = cos(gp(s, 5)), sn = sin(gp(s, 5)), slope = gp(s, 6);
  vec3 r = o - pos;
  vec3 lo = vec3(r.x * c - r.z * sn, r.y, r.x * sn + r.z * c);
  vec3 ld = vec3(d.x * c - d.z * sn, d.y, d.x * sn + d.z * c);
  float across = ld.y - ld.z * slope;
  if (abs(across) < 1e-12) return false;
  t = -(lo.y - lo.z * slope) / across;
  if (t < 0.0 || t > far) return false;
  float hx = lo.x + ld.x * t, hz = lo.z + ld.z * t;
  if (abs(hx) > size.x / 2.0 || abs(hz) > size.y / 2.0) return false;
  float l = sqrt(1.0 + slope * slope), back = across > 0.0 ? -1.0 : 1.0;
  vec3 n = vec3(0.0, back / l, (-slope * back) / l);
  normal = vec3(n.x * c + n.z * sn, n.y, -n.x * sn + n.z * c);
  return true;
}
`
const HYPERPLANE = /* glsl */ `${face('hyperplane')}
vec3 hyperplaneTurn(vec4 r, vec3 v) { vec3 t = 2.0 * cross(r.xyz, v); return v + r.w * t + cross(r.xyz, t); }
bool hyperplanePush(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  vec4 a = gpRow(s, 0), b = gpRow(s, 1);
  vec4 rot = vec4(b.yzw, gpRow(s, 2).x), back = vec4(-rot.xyz, rot.w);
  vec3 n;
  if (!hyperplaneFace(hyperplaneTurn(back, x - a.xyz), hyperplaneTurn(back, was - a.xyz), vec2(a.w, b.x), 0.0, clear, n, depth)) return false;
  normal = hyperplaneTurn(rot, n);
  return true;
}
bool hyperplaneLine(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal) {
  vec3 pos = vec3(gp(s, 0), gp(s, 1), gp(s, 2));
  vec2 size = vec2(gp(s, 3), gp(s, 4));
  vec4 rot = vec4(gp(s, 5), gp(s, 6), gp(s, 7), gp(s, 8));
  vec4 back = vec4(-rot.xyz, rot.w);
  vec3 lo = hyperplaneTurn(back, o - pos), ld = hyperplaneTurn(back, d);
  if (abs(ld.y) < 1e-12) return false;
  t = -lo.y / ld.y;
  if (t < 0.0 || t > far) return false;
  if (abs(lo.x + ld.x * t) > size.x / 2.0 || abs(lo.z + ld.z * t) > size.y / 2.0) return false;
  normal = hyperplaneTurn(rot, vec3(0.0, ld.y > 0.0 ? -1.0 : 1.0, 0.0));
  return true;
}
`
const CYLINDER = /* glsl */ `
bool cylinderPush(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  vec4 a = gpRow(s, 0);
  float r = a.w + clear, y0 = a.y - clear, y1 = a.y + gpRow(s, 1).x + clear;
  vec2 o = x.xz - a.xz;
  float far = length(o);
  if (far >= r || x.y <= y0 || x.y >= y1) return false;
  depth = r - far;
  normal = far > 1e-9 ? vec3(o.x / far, 0.0, o.y / far) : vec3(1.0, 0.0, 0.0);
  if (y1 - x.y < depth) { depth = y1 - x.y; normal = vec3(0.0, 1.0, 0.0); }
  if (x.y - y0 < depth) { depth = x.y - y0; normal = vec3(0.0, -1.0, 0.0); }
  return true;
}
bool cylinderLine(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal) {
  vec3 c = vec3(gp(s, 0), gp(s, 1), gp(s, 2));
  float r = gp(s, 3), y0 = c.y, y1 = c.y + gp(s, 4);
  bool found = false;
  float best = 1e30; vec3 bn = vec3(0.0);
  float ox = o.x - c.x, oz = o.z - c.z;
  float a = d.x * d.x + d.z * d.z;
  bool inside = ox * ox + oz * oz <= r * r;
  if (a > 1e-12) {
    float b = ox * d.x + oz * d.z;
    float disc = b * b - a * (ox * ox + oz * oz - r * r);
    if (disc >= 0.0) {
      float sq = sqrt(disc);
      float tt = inside ? (-b + sq) / a : (-b - sq) / a;
      float y = o.y + d.y * tt;
      if (y >= y0 && y <= y1 && tt >= 0.0 && tt <= far) {
        float px = ox + d.x * tt, pz = oz + d.z * tt;
        vec3 n = normalize(vec3(px, 0.0, pz)) * (inside ? -1.0 : 1.0);
        found = true; best = tt; bn = n;
      }
    }
  }
  if (abs(d.y) > 1e-12) {
    for (int i = 0; i < 2; i++) {
      float y = i == 0 ? y0 : y1;
      float tt = (y - o.y) / d.y;
      float px = ox + d.x * tt, pz = oz + d.z * tt;
      if (tt >= 0.0 && tt <= far && px * px + pz * pz <= r * r && tt < best) {
        found = true; best = tt; bn = vec3(0.0, i == 0 ? -1.0 : 1.0, 0.0);
      }
    }
  }
  t = best; normal = bn;
  return found;
}
`

const delivered: Record<string, Behavior> = {
  box: { size: 7, pack: (b: Box) => [...b.pos, ...b.size, b.yaw], glsl: BOX },
  plane: { size: 7, pack: (p: Plane) => [...p.pos, ...p.size, p.yaw, p.slope], glsl: PLANE },
  hyperplane: { size: 9, pack: (h: Hyperplane) => [...h.pos, ...h.size, ...h.rot], glsl: HYPERPLANE },
  cylinder: { size: 5, pack: (c: Cylinder) => [...c.pos, c.radius, c.height], glsl: CYLINDER },
}

export const behaviors = () => delivered

export function things(plugins: Plugins, near: Near): Thing[] {
  return drawn(plugins)
    .filter(p => p.word in delivered && words[p.word].gap(p.shape[p.word], near.at[0], near.at[2]) <= near.reach)
    .map(p => p.shape)
}
