// gpuparticle3d's shaders, GLSL ES 3.00, each a string. They share `PRELUDE`: the layouts' `#define`s
// (`layout.ts`), reading a number of the table, of an effect, of a particle and of an effect's live point,
// the rolls (`hash.ts`), `noise.ts`'s noise and curl, and particle3d's arithmetic over a life (stops, a
// layer's size now). Every function is particle3d's (`plugins/particle3d/particle3d.plugin.ts`), named as it
// names it, written for one particle on the GPU.
//
// The state of every particle is five float textures, S × S, one texel a slot (`slot % S`, `slot / S`):
//
//   A   its place [x, y, z] and its age
//   B   its speed [x, y, z] and its life, or for a layer that lasts, the seconds into its effect it lasts from
//   C   the point it was thrown from [x, y, z] and its turn
//   D   its size at birth, its spin, its layer's offset in the table and its effect's row, -1 for a free slot
//   R   its seed
//
// An effect's live numbers are `live`, four texels an effect (LIVE_*): its point, the line it goes along, its
// speed and its `to`. The CPU writes an effect that is not carried; the carry pass writes one a particle carries
// from that particle, every frame while it lives, and then holds it where it was.

import { defines } from './layout.ts'

// The width in texels of the table, of the effects texture and of the live texture.
export const TW = 1024
export const LIVE = 4

// Reading the table: a number, and two or three in a row by whole texels, one texel read for a run that sits
// in one texel and two for one that crosses into the next.
const TABLE = /* glsl */ `
vec4 texel(int t) { return texelFetch(tableTex, ivec2(t % TW, t / TW), 0); }
float at(int i) { return texel(i >> 2)[i & 3]; }
vec2 at2(int i) {
  int k = i & 3;
  vec4 a = texel(i >> 2);
  if (k == 0) return a.xy;
  if (k == 1) return a.yz;
  if (k == 2) return a.zw;
  return vec2(a.w, texel((i >> 2) + 1).x);
}
vec3 at3(int i) {
  int k = i & 3;
  vec4 a = texel(i >> 2);
  if (k == 0) return a.xyz;
  if (k == 1) return a.yzw;
  vec4 b = texel((i >> 2) + 1);
  return k == 2 ? vec3(a.zw, b.x) : vec3(a.w, b.xy);
}
`

export const PRELUDE = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
${defines()}
#define TW ${TW}
#define LIVE_POINT 0
#define LIVE_DIR 1
#define LIVE_VEL 2
#define LIVE_TO 3
#define M_PI 3.141592653589793

uniform sampler2D tableTex;
uniform sampler2D effectsTex;
uniform sampler2D liveTex;
uniform sampler2D sA;
uniform sampler2D sB;
uniform sampler2D sC;
uniform sampler2D sD;
uniform sampler2D sR;
uniform int S;
uniform float dt;

${TABLE}
float ef(int fx, int k) { int i = fx * E_SIZE + k; int t = i >> 2; return texelFetch(effectsTex, ivec2(t % TW, t / TW), 0)[i & 3]; }
vec3 ef3(int fx, int k) { return vec3(ef(fx, k), ef(fx, k + 1), ef(fx, k + 2)); }
vec4 live(int fx, int k) { int t = fx * 4 + k; return texelFetch(liveTex, ivec2(t % TW, t / TW), 0); }
vec3 pointOf(int fx) { return live(fx, LIVE_POINT).xyz; }
bool on(int i) { return at(i) > 0.5; }
ivec2 texelOf(int slot) { return ivec2(slot % S, slot / S); }

// The rolls (hash.ts).
uint hash(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
float roll(uint seed, uint k) { return float(hash(hash(seed) + k * 0x9e3779b9u) >> 8u) / 16777216.0; }
float lerpOf(int i, float u) { return at(i) + (at(i + 1) - at(i)) * u; }

// noise.ts: value noise, its slope, and the curl of three of it.
float nhash(int i, int j, int k) {
  uint h = uint(i) * 374761393u + uint(j) * 668265263u + uint(k) * 2147483647u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return (float(h) / 4294967295.0) * 2.0 - 1.0;
}
float ease(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float rise(float t) { return 30.0 * t * t * (t - 1.0) * (t - 1.0); }
float noise3(vec3 q) {
  ivec3 c = ivec3(floor(q)); vec3 f = q - floor(q);
  float u = ease(f.x), v = ease(f.y), w = ease(f.z);
  float e00 = mix(nhash(c.x, c.y, c.z), nhash(c.x + 1, c.y, c.z), u);
  float e10 = mix(nhash(c.x, c.y + 1, c.z), nhash(c.x + 1, c.y + 1, c.z), u);
  float e01 = mix(nhash(c.x, c.y, c.z + 1), nhash(c.x + 1, c.y, c.z + 1), u);
  float e11 = mix(nhash(c.x, c.y + 1, c.z + 1), nhash(c.x + 1, c.y + 1, c.z + 1), u);
  return mix(mix(e00, e10, v), mix(e01, e11, v), w);
}
vec3 slope(vec3 q) {
  ivec3 c = ivec3(floor(q)); vec3 f = q - floor(q);
  float u = ease(f.x), v = ease(f.y), w = ease(f.z);
  float a = nhash(c.x, c.y, c.z), b = nhash(c.x + 1, c.y, c.z), cc = nhash(c.x, c.y + 1, c.z), d = nhash(c.x + 1, c.y + 1, c.z);
  float e = nhash(c.x, c.y, c.z + 1), ff = nhash(c.x + 1, c.y, c.z + 1), g = nhash(c.x, c.y + 1, c.z + 1), h = nhash(c.x + 1, c.y + 1, c.z + 1);
  float near = mix(a, b, u), far = mix(cc, d, u), near1 = mix(e, ff, u), far1 = mix(g, h, u);
  return vec3(
    rise(f.x) * mix(mix(b - a, d - cc, v), mix(ff - e, h - g, v), w),
    rise(f.y) * mix(far - near, far1 - near1, w),
    rise(f.z) * (mix(near1, far1, v) - mix(near, far, v)));
}
vec3 curl(vec3 q) {
  vec3 a = slope(q), b = slope(q + vec3(31.4, -17.2, 8.9)), c = slope(q + vec3(-12.7, 43.1, 27.6));
  return vec3(c.y - b.z, a.z - c.x, b.x - a.y);
}

// Stops [at, value...] of 'width' numbers each, 'n' of them from 'off': the two 'x' is between, and how far.
void between(int off, int n, int width, float x, out int a, out int b, out float k) {
  a = off; b = off; k = 0.0;
  if (x <= at(off)) return;
  for (int i = 1; i < 64; i++) {
    if (i >= n) break;
    int p = off + (i - 1) * width, q = off + i * width;
    if (x <= at(q)) { a = p; b = q; k = at(q) > at(p) ? (x - at(p)) / (at(q) - at(p)) : 1.0; return; }
  }
  a = b = off + (n - 1) * width;
}
float stopOf(int off, int n, float x) { int a, b; float k; between(off, n, 2, x, a, b, k); return at(a + 1) + (at(b + 1) - at(a + 1)) * k; }
// Of [seconds, ...] in order, 'width' numbers each, the last whose seconds 'age' has reached: its offset, or -1.
int reached(int off, int n, int width, float age) {
  int got = -1;
  for (int i = 0; i < 64; i++) {
    if (i >= n || at(off + i * width) > age + 1e-9) break;
    got = off + i * width;
  }
  return got;
}

// One particle, as the passes hold it.
struct P { vec3 p; float age; vec3 v; float life; vec3 o; float rot; float s0; float spin; int layer; int fx; uint seed; };
P load(int slot) {
  ivec2 c = texelOf(slot);
  vec4 a = texelFetch(sA, c, 0), b = texelFetch(sB, c, 0), cc = texelFetch(sC, c, 0), d = texelFetch(sD, c, 0), r = texelFetch(sR, c, 0);
  return P(a.xyz, a.w, b.xyz, b.w, cc.xyz, cc.w, d.x, d.y, int(d.z), int(d.w), uint(r.x));
}
bool used(P q) { return q.fx >= 0; }
// The seconds it lives: its life, or for one that lasts, until its effect's life is over.
float span(P q) { return on(q.layer + L_lasts) ? ef(q.fx, E_life) - q.life : q.life; }
bool alive(P q) { return q.age < span(q) - 1e-9; }
float partOf(P q) { return min(1.0, q.age / span(q)); }
float sized(P q) {
  int l = q.layer;
  if (at(l + L_growsN) > 0.0) return q.s0 * stopOf(int(at(l + L_grows)), int(at(l + L_growsN)), partOf(q));
  return q.s0 + (q.s0 * at(l + L_grow) - q.s0) * partOf(q);
}
// Where it is drawn: its place, or for one that follows, kept about its effect's point.
vec3 place(P q) { return on(q.layer + L_follow) ? q.p + pointOf(q.fx) - q.o : q.p; }
`

// The `meet` of a scene that names no `solids` mod: a line meets nothing.
export const NOTHING = /* glsl */ `
bool meet(vec3 from, vec3 dir, float far, out float t, out vec3 normal) { t = far; normal = vec3(0.0); return false; }
`

// The step: particle3d's 'move', each force set's 'push' and 'whirl', the bounce off the solids and the floor.
// `meet` is the solids' GLSL, the `solids` mod's or NOTHING: it defines
//   bool meet(vec3 from, vec3 dir, float far, out float t, out vec3 normal)
// where a line from `from` along the unit `dir` first meets a solid within `far`, and the solid's normal there.
export const MOVE = (meet: string) => /* glsl */ `
// The seconds back the step being run is, for a particle the spawn is ageing to its effect's age.
float behind = 0.0;
// The scale of the effect of the particle being moved, read once a move.
float scaleNow = 1.0;
// The strength of each generator entry the particle being moved is in, rolled once a move.
float strengths[64];

// The time now on the clock an effect's birth is written on.
uniform float now;
float sinceOf(P q) { float root = ef(q.fx, E_root); int r = root < 0.0 ? q.fx : int(root); return now - ef(r, E_born) - behind; }
vec3 lineOf(P q, int f) {
  int l = q.layer;
  if (on(f + F_hasAxis)) return normalize(at3(f + F_axis));
  if (on(l + F_hasAxis)) return normalize(at3(l + F_axis));
  if (on(l + L_hasDir)) return normalize(at3(l + L_dir));
  vec4 d = live(q.fx, LIVE_DIR);
  if (d.w > 0.5) return normalize(d.xyz);
  return vec3(0.0, 1.0, 0.0);
}
vec3 centreOf(P q, int f) {
  float s = scaleNow;
  vec3 from = q.o;
  if (on(f + F_anchorEffect)) { float root = ef(q.fx, E_root); from = pointOf(root < 0.0 ? q.fx : int(root)); }
  return from + at3(f + F_at) * s;
}
vec3 fieldOf(P q, int f) {
  float n = at(f + F_noiseFrequency);
  if (!on(f + F_hasScroll)) return q.p * n;
  float t = sinceOf(q) * scaleNow;
  return (q.p - at3(f + F_noiseScroll) * t) * n;
}
float reach(P q, int f, vec3 m) {
  float w = 1.0;
  float range = at(f + F_range);
  if (range >= 0.0) {
    float r = range * scaleNow, d = distance(q.p, m);
    if (d >= r) return 0.0;
    float fo = at(f + F_falloff);
    if (fo != 0.0) w *= pow(1.0 - d / r, fo);
  }
  if (at(f + F_overLifeN) > 0.0) w *= stopOf(int(at(f + F_overLife)), int(at(f + F_overLifeN)), partOf(q));
  if (at(f + F_overAgeN) > 0.0) w *= stopOf(int(at(f + F_overAge)), int(at(f + F_overAgeN)), sinceOf(q));
  float amp = at(f + F_noiseAmplitude);
  if (amp != 0.0) w *= max(0.0, 1.0 + amp * noise3(fieldOf(q, f)));
  return w;
}
void push(inout P q, int f, float k, float dt) {
  float s = scaleNow;
  vec3 m = centreOf(q, f);
  float w = k * reach(q, f, m);
  if (w == 0.0) return;
  float drag = at(f + F_drag), dbs = at(f + F_dragBySpeed);
  if (drag != 0.0 || dbs != 0.0) {
    vec3 air = on(f + F_hasWind) ? at3(f + F_wind) * s : vec3(0.0);
    float through = dbs != 0.0 ? length(q.v - air) / s : 0.0;
    float d = max(0.0, 1.0 - (drag + dbs * through) * w * dt);
    q.v = air + (q.v - air) * d;
  }
  float pull = at(f + F_pull);
  if (pull != 0.0) {
    vec3 d = m - q.p;
    if (on(f + F_toAxis)) { vec3 a = lineOf(q, f); d -= a * dot(d, a); }
    float len = length(d);
    float shell = at(f + F_shell);
    float way = shell < 0.0 ? 1.0 : sign(len - shell * s);
    if (len > 0.0) q.v += (d / len) * pull * way * w * s * dt;
  }
  float g = at(f + F_g);
  if (g != 0.0) q.v.y -= g * w * s * dt;
  if (on(f + F_hasDirection)) q.v += at3(f + F_direction) * w * s * dt;
  float turb = at(f + F_turbulence);
  if (turb != 0.0) q.v += curl(fieldOf(q, f)) * turb * w * s * dt;
}
void whirl(inout P q, int f, float turn) {
  vec3 a = lineOf(q, f);
  vec3 m = centreOf(q, f);
  turn *= reach(q, f, m);
  if (turn == 0.0) return;
  float c = cos(turn), sn = sin(turn);
  vec3 x = q.p - m;
  vec3 r = x * c + cross(a, x) * sn + a * dot(a, x) * (1.0 - c);
  vec3 v = q.v * c + cross(a, q.v) * sn + a * dot(a, q.v) * (1.0 - c);
  q.p = m + r;
  q.v = v;
}
float strengthOf(P q, int e) {
  float least = at(e + EN_least), most = at(e + EN_most);
  return least == most ? least : least + (most - least) * roll(q.seed, uint(at(e + EN_roll)));
}
float weightOf(P q) {
  int l = q.layer;
  float g = at(l + F_g);
  int off = int(at(l + L_entries)), n = int(at(l + L_entriesN));
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    int e = off + i * EN_SIZE, f = int(at(e + EN_entry));
    g += (at(f + F_g) - (on(f + F_hasDirection) ? at(f + F_direction + 1) : 0.0)) * strengths[i];
  }
  return g;
}
void strike(inout P q, vec3 n, float into) {
  float b = at(q.layer + L_bounce);
  q.v = (q.v - 2.0 * into * n) * b;
  float along = dot(q.v, n);
  float slide = length(q.v - along * n);
  float radius = sized(q) / 2.0;
  if (at(q.layer + L_spin) != 0.0 && radius > 0.0) q.spin = (q.spin < 0.0 ? -1.0 : 1.0) * (slide / radius);
}

${meet}

void move(inout P q, float dt) {
  int l = q.layer;
  int off = int(at(l + L_entries)), n = int(at(l + L_entriesN));
  scaleNow = ef(q.fx, E_scale);
  push(q, l, 1.0, dt);
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    int e = off + i * EN_SIZE;
    float s = strengthOf(q, e);
    strengths[i] = s;
    if (s != 0.0) push(q, int(at(e + EN_entry)), s, dt);
  }
  float k = 1.0;
  if (at(l + L_paceN) > 0.0) { int r = reached(int(at(l + L_pace)), int(at(l + L_paceN)), 2, q.age); if (r >= 0) k = at(r + 1); }
  float left = dt * k;
  float bounce = at(l + L_bounce);
  for (int b = 0; b < 4; b++) {
    if (bounce < 0.0 || left <= 0.0) break;
    float speed = length(q.v), far = speed * left;
    float t; vec3 nrm;
    if (!(far > 0.0) || !meet(q.p, q.v / speed, far, t, nrm)) break;
    float s = t / speed;
    q.p += q.v * s;
    left -= s;
    float into = dot(q.v, nrm);
    if (into < 0.0) strike(q, nrm, into);
    q.p += nrm * 1e-4;
  }
  q.p += q.v * left;
  float sw = at(l + F_swirl);
  if (sw != 0.0) whirl(q, l, sw * dt * k);
  for (int i = 0; i < 64; i++) {
    if (i >= n) break;
    int f = int(at(off + i * EN_SIZE + EN_entry));
    float s = strengths[i];
    if (s != 0.0 && at(f + F_swirl) != 0.0) whirl(q, f, at(f + F_swirl) * s * dt * k);
  }
  if (ef(q.fx, E_hasFloor) > 0.5) {
    float floor = ef(q.fx, E_floor);
    if (q.p.y < floor) {
      q.p.y = floor;
      if (q.v.y < 0.0) {
        if (bounce < 0.0) q.v.y = 0.0;
        else {
          strike(q, vec3(0.0, 1.0, 0.0), q.v.y);
          if (q.v.y <= weightOf(q) * scaleNow * dt * 2.0) q.v.y = 0.0;
        }
      }
    }
  }
  q.rot += q.spin * dt;
  q.age += dt;
}
`

// A full-screen pass's vertex shader: a quad of two triangles over the target.
export const QUAD = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const OUTS = /* glsl */ `
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
layout(location = 2) out vec4 oC;
layout(location = 3) out vec4 oD;
layout(location = 4) out vec4 oR;
void store(P q) {
  oA = vec4(q.p, q.age); oB = vec4(q.v, q.life); oC = vec4(q.o, q.rot);
  oD = vec4(q.s0, q.spin, float(q.layer), float(q.fx)); oR = vec4(float(q.seed), 0.0, 0.0, 0.0);
}
void free() { oA = vec4(0.0); oB = vec4(0.0); oC = vec4(0.0); oD = vec4(0.0, 0.0, 0.0, -1.0); oR = vec4(0.0); }
`

// The step of every particle: moved one step of dt, and its slot freed the step it dies. A particle whose slot
// the CPU has freed and given to another this frame is written over after, by the spawn.
export const STEP = (meet: string) => /* glsl */ `${PRELUDE}${MOVE(meet)}${OUTS}
void main() {
  int slot = int(gl_FragCoord.y) * S + int(gl_FragCoord.x);
  P q = load(slot);
  if (!used(q)) { free(); return; }
  move(q, dt);
  if (!alive(q)) { free(); return; }
  store(q);
}
`

// The spawn: one point a particle thrown this frame, drawn into its slot. Each is particle3d's 'burst' for one
// particle: aimed, rolled, placed in its jitter and its box, thrown out and along, and aged to the effect's age.
export const SPAWN_VERTEX = /* glsl */ `
precision highp float;
uniform int S;
in float slot;
in float burst;
in float seed;
flat out int vSlot;
flat out int vBurst;
flat out uint vSeed;
void main() {
  int s = int(slot);
  vSlot = s; vBurst = int(burst); vSeed = uint(seed);
  vec2 c = (vec2(float(s % S), float(s / S)) + 0.5) / float(S);
  gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}
`
export const SPAWN = (meet: string) => /* glsl */ `${PRELUDE}${MOVE(meet)}${OUTS}
uniform sampler2D burstsTex;
flat in int vSlot;
flat in int vBurst;
flat in uint vSeed;
// A burst: its effect's row, its layer's offset, the seconds of the effect's age it was thrown at, and the
// seconds from then to now.
vec4 burstOf(int b) { return texelFetch(burstsTex, ivec2(b % TW, b / TW), 0); }
vec3 aim(int l, int fx, uint seed) {
  float u = roll(seed, ROLL_dirU), w = roll(seed, ROLL_dirW);
  float spread = at(l + L_spread);
  if (spread < 0.0) {
    float y = 2.0 * u - 1.0, r = sqrt(max(0.0, 1.0 - y * y)), a = 2.0 * M_PI * w;
    return vec3(r * cos(a), y, r * sin(a));
  }
  vec3 d = on(l + L_hasDir) ? at3(l + L_dir) : live(fx, LIVE_DIR).xyz;
  vec3 z = normalize(d);
  vec3 x = normalize(cross(abs(z.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0), z));
  vec3 y = cross(z, x);
  float c = 1.0 - u * (1.0 - cos(spread)), sn = sqrt(max(0.0, 1.0 - c * c)), a = 2.0 * M_PI * w;
  return z * c + (x * cos(a) + y * sin(a)) * sn;
}
void main() {
  vec4 bt = burstOf(vBurst);
  int fx = int(bt.x), l = int(bt.y);
  float t = bt.z, ahead = bt.w;
  uint seed = vSeed;
  float scale = ef(fx, E_scale);
  vec3 at0 = pointOf(fx);
  vec3 dir = aim(l, fx, seed);
  float speed = lerpOf(l + L_speed, roll(seed, ROLL_speed)) * scale;
  float life = lerpOf(l + L_life, roll(seed, ROLL_life));
  float skip = at(l + L_skip) * roll(seed, ROLL_skip);
  float size = lerpOf(l + L_sizes, roll(seed, ROLL_size)) * scale;
  vec3 p = at0;
  for (int k = 0; k < 3; k++) p[k] += (roll(seed, ROLL_jitter + uint(2 * k)) - roll(seed, ROLL_jitter + uint(2 * k + 1))) * at(l + L_jitter + k) * scale;
  float sp = at(l + L_spin);
  float spin = sp != 0.0 ? (roll(seed, ROLL_spin) * 2.0 - 1.0) * sp : 0.0;
  float rot = sp != 0.0 ? roll(seed, ROLL_rot) * 2.0 * M_PI : 0.0;
  for (int k = 0; k < 3; k++) p[k] += (at(l + L_box + k) + (at(l + L_box + k + 3) - at(l + L_box + k)) * roll(seed, ROLL_box + uint(k))) * scale;
  float out_ = lerpOf(l + L_outward, roll(seed, ROLL_outward)) * scale;
  vec3 off = p - at0;
  float far = length(off);
  vec3 away = far > 1e-9 ? off / far : dir;
  vec3 v = dir * speed + away * out_ + live(fx, LIVE_VEL).xyz * at(l + L_inherit);
  P q = P(p, skip, v, on(l + L_lasts) ? t - skip : life, at0, rot, size, spin, l, fx, seed);
  for (int i = 0; i < 100000; i++) {
    if (ahead <= 1e-9 || !alive(q)) break;
    behind = ahead;
    move(q, min(dt, ahead));
    ahead -= dt;
  }
  if (!alive(q)) { free(); return; }
  store(q);
}
`

// The carry pass: an effect's live numbers (LIVE_*), one texel each, four an effect. One the CPU places is its
// own; one a particle carries is at the particle's place, along the way it goes, as fast, its 'to' the point of
// the effect the particle is of, while it lives; and where it last was after. Run as many times a frame as
// effects are carried deep, each run reading the last's, so a chain of carrying is followed to its end.
export const CARRY = /* glsl */ `${PRELUDE}
layout(location = 0) out vec4 o;
void main() {
  int t = int(gl_FragCoord.y) * TW + int(gl_FragCoord.x);
  int fx = t / 4, k = t % 4;
  vec4 was = texelFetch(liveTex, ivec2(gl_FragCoord.xy), 0);
  float carrier = ef(fx, E_carrier);
  if (carrier < 0.0) {
    if (k == LIVE_POINT) o = vec4(ef3(fx, E_point), 1.0);
    else if (k == LIVE_DIR) o = vec4(ef3(fx, E_dir), ef(fx, E_hasDir));
    else if (k == LIVE_VEL) o = vec4(ef3(fx, E_vel), 0.0);
    else o = vec4(ef3(fx, E_to), ef(fx, E_hasTo));
    return;
  }
  if (ef(fx, E_carrierLive) < 0.5) { o = was; return; }
  P q = load(int(carrier));
  if (!used(q)) { o = was; return; }
  if (k == LIVE_POINT) o = vec4(place(q), 1.0);
  else if (k == LIVE_DIR) o = length(q.v) > 1e-9 ? vec4(normalize(q.v), 1.0) : was;
  else if (k == LIVE_VEL) o = vec4(q.v, 0.0);
  else o = vec4(pointOf(q.fx), 1.0);
}
`

// The keys: for each slot, how far its particle is behind the camera's place along the way the camera looks
// back (particle3d's 'behind'), and the slot; a free slot, and every slot from 'top' up, which the CPU holds
// free, behind everything, so it sorts last.
export const KEYS = /* glsl */ `${PRELUDE}
uniform vec3 eye;
uniform vec3 back;
uniform int top;
layout(location = 0) out vec4 o;
void main() {
  int slot = int(gl_FragCoord.y) * S + int(gl_FragCoord.x);
  P q = load(slot);
  if (slot >= top || !used(q) || !alive(q) || on(q.layer + L_word)) { o = vec4(3.0e38, float(slot), 0.0, 0.0); return; }
  vec3 c = on(q.layer + L_beam) ? pointOf(q.fx) : place(q);
  o = vec4(dot(c - eye, back), float(slot), 0.0, 0.0);
}
`

// One pass of a bitonic sort of the keys, smallest first: the farthest from the camera first.
export const SORT = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D keys;
uniform int S;
uniform int stage;
uniform int span;
layout(location = 0) out vec4 o;
void main() {
  int i = int(gl_FragCoord.y) * S + int(gl_FragCoord.x);
  int j = i ^ span;
  vec4 me = texelFetch(keys, ivec2(i % S, i / S), 0), it = texelFetch(keys, ivec2(j % S, j / S), 0);
  bool up = (i & stage) == 0;
  bool low = i < j;
  bool less = it.x < me.x || (it.x == me.x && it.y < me.y);
  o = (low == up) == less ? it : me;
}
`

// The draw of one particle's quad: particle3d's 'draw', its place, size, turn, frame, flips, colour and fade.
// It is two halves. The look pass, run once a frame over the slots after the sort, works out each particle's
// quad once: where it is, its two axes, its four edges, its frame, its flips, its colour and whether it is
// added, into five textures, the same texel as its slot:
//
//   look0   its place [x, y, z] and its batch, -1 for a slot drawn by no batch
//   look1   its right axis [x, y, z] and its flags: 1 kept (not added), 2 flipped across, 4 flipped up
//   look2   its up axis [x, y, z] and its frame's offset in the table
//   look3   its left, right, bottom and top edges along its axes
//   look4   its colour and alpha
//   look5   a flipbook's: the next frame's offset in the table, how far it is laid into it (`blend`), and where
//           its opacity is cut (`erode`)
//
// The draw's vertex shader then reads its sorted slot's five texels and the one corner of its picture.
export const LOOK = /* glsl */ `${PRELUDE}
uniform vec3 camR;
uniform vec3 camU;
uniform vec3 camB;
layout(location = 0) out vec4 oPlace;
layout(location = 1) out vec4 oRight;
layout(location = 2) out vec4 oUp;
layout(location = 3) out vec4 oEdges;
layout(location = 4) out vec4 oTint;
layout(location = 5) out vec4 oBook;
vec3 srgbToLinear(vec3 c) { return mix(c * 0.0773993808, pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), step(0.04045, c)); }
void main() {
  int slot = int(gl_FragCoord.y) * S + int(gl_FragCoord.x);
  P q = load(slot);
  oPlace = vec4(0.0, 0.0, 0.0, -1.0);
  oRight = vec4(0.0);
  oUp = vec4(0.0);
  oEdges = vec4(0.0);
  oTint = vec4(0.0);
  oBook = vec4(0.0);
  if (!used(q) || !alive(q) || on(q.layer + L_word) || !on(q.layer + L_ready)) return;
  int l = q.layer;
  int frame = -1;
  int frame2 = -1;
  float mixed = 0.0;
  int batch = -1;
  {
    float k = q.age / span(q);
    int n = int(at(l + L_framesN));
    int i = 0;
    // where in its clip it is, from the part its frames begin at, round past the last when it has a start
    bool started = on(l + L_hasStart);
    float begin = started ? lerpOf(l + L_start, roll(q.seed, ROLL_start)) : 0.0;
    float along = (k + begin) * float(n);
    if (on(l + L_play) && on(l + L_timed)) {
      int d = int(at(l + L_durations));
      float total = 0.0;
      for (int j = 0; j < 256; j++) { if (j >= n) break; total += at(d + j); }
      float tt = q.age + 1e-9;
      if (on(l + L_loop)) tt = mod(tt, total);
      i = n - 1;
      if (on(l + L_loop) || tt < total) {
        for (int j = 0; j < 256; j++) {
          if (j >= n) break;
          if (tt < at(d + j)) { i = j; break; }
          tt -= at(d + j);
        }
      }
    } else if (!on(l + L_play)) i = started ? int(floor(along)) % n : min(n - 1, int(floor(along)));
    int after = started ? (i + 1) % n : min(n - 1, i + 1);
    frame = int(at(l + L_frames)) + i * FR_SIZE;
    frame2 = on(l + L_blend) ? int(at(l + L_frames)) + after * FR_SIZE : frame;
    if (on(l + L_blend)) mixed = along - floor(along);
    batch = int(at(frame + FR_batch));
  }
  {
    float k = q.age / span(q);
    float size = sized(q);
    bool sheet = on(frame + FR_sheet);
    vec2 fsize = at2(frame + FR_fsize);
    float ppm = at(l + L_ppm);
    float w = (sheet ? fsize.x / ppm : 1.0) * size;
    float h = (sheet ? fsize.y / ppm : 1.0) * size;
    vec3 c = place(q), r, u;
    vec2 org = on(l + L_hasOrigin) ? at2(l + L_origin) : on(l + L_stretch) ? vec2(1.0, 0.5) : sheet ? at2(frame + FR_anchor) / fsize : vec2(0.5);
    if (on(l + L_beam)) {
      vec3 from = pointOf(q.fx), gap = live(q.fx, LIVE_TO).xyz - from;
      w = length(gap);
      c = from;
      r = w > 0.0 ? gap / w : camR;
      vec3 side = cross(camB, r);
      u = length(side) > 1e-9 ? normalize(side) : camU;
      org = vec2(0.0, 0.5);
    } else {
      float turn = q.rot;
      vec3 along = vec3(0.0);
      bool has = false;
      if (on(l + L_stretch)) { along = q.v; has = true; }
      else if (on(l + L_face)) {
        if (on(l + L_hasDir)) { along = at3(l + L_dir); has = true; }
        else { vec4 d = live(q.fx, LIVE_DIR); along = d.xyz; has = d.w > 0.5; }
      }
      if (has) {
        float x = dot(along, camR), y = dot(along, camU);
        if (x != 0.0 || y != 0.0) turn = atan(y, x);
      }
      r = cos(turn) * camR + sin(turn) * camU;
      u = -sin(turn) * camR + cos(turn) * camU;
    }
    bool fx = false, fy = false;
    if (at(l + L_flipsN) > 0.0) {
      int fl = reached(int(at(l + L_flips)), int(at(l + L_flipsN)), 3, q.age);
      if (fl >= 0) { fx = at(fl + 1) != 0.0; fy = at(fl + 2) != 0.0; }
    }
    vec4 tr = sheet ? vec4(at2(frame + FR_trim) / fsize, vec2(at(frame + FR_trim + 2), at(frame + FR_trim + 3)) / fsize) : vec4(0.0, 0.0, 1.0, 1.0);
    if (fx) tr.x = 1.0 - tr.x - tr.z;
    if (fy) tr.y = 1.0 - tr.y - tr.w;
    float left = (tr.x - org.x) * w, right = (tr.x + tr.z - org.x) * w, bottom = (org.y - tr.y - tr.w) * h, top = (org.y - tr.y) * h;
    vec3 from = on(l + L_hasTint) ? at3(l + L_tint) : ef(q.fx, E_hasTint) > 0.5 ? ef3(q.fx, E_tint) : vec3(1.0);
    vec3 rgb = on(l + L_hasTint1) ? mix(from, at3(l + L_tint1), k) : from;
    if (at(l + L_tintsN) > 0.0) {
      int a, b; float kk;
      between(int(at(l + L_tints)), int(at(l + L_tintsN)), 4, k, a, b, kk);
      rgb = mix(at3(a + 1), at3(b + 1), kk);
    }
    float fade = at(l + L_fade);
    float fading = fade < 0.0 ? k : max(0.0, 1.0 - (span(q) - q.age) / fade);
    float alpha = at(l + L_alphasN) > 0.0 ? stopOf(int(at(l + L_alphas)), int(at(l + L_alphasN)), k) : at(l + L_a0) + (at(l + L_a1) - at(l + L_a0)) * fading;
    float flags = (on(l + L_add) ? 0.0 : 1.0) + (fx ? 2.0 : 0.0) + (fy ? 4.0 : 0.0);
    oPlace = vec4(c, float(batch));
    oRight = vec4(r, flags);
    oUp = vec4(u, float(frame));
    oEdges = vec4(left, right, bottom, top);
    oTint = vec4(srgbToLinear(rgb) * at(l + L_gain), alpha);
    float cut = at(l + L_erodeN) > 0.0 ? stopOf(int(at(l + L_erode)), int(at(l + L_erodeN)), k) : 0.0;
    oBook = vec4(float(frame2), mixed, cut, 0.0);
  }
}
`

// The draw's vertex shader, spliced into a MeshBasicMaterial (plugin, 'meshOf'), so three's map, fog, tone
// mapping, colour space and alpha test draw it as they draw particle3d's: one corner of the quad of the
// instance's sorted slot, read off the look pass's textures.
export const QUAD_PARS = /* glsl */ `
${defines()}
#define TW ${TW}
uniform sampler2D tableTex;
${TABLE}
uniform sampler2D sorted;
uniform sampler2D look0;
uniform sampler2D look1;
uniform sampler2D look2;
uniform sampler2D look3;
uniform sampler2D look4;
uniform sampler2D look5;
uniform int S;
uniform int batch;
attribute float corner;
varying float vKeep;
varying vec2 vFrame2;
varying vec2 vLook;
vec4 vTint;
vec2 vQuadUv;
`
export const QUAD_MAIN = /* glsl */ `
  vec4 key = texelFetch(sorted, ivec2(gl_InstanceID % S, gl_InstanceID / S), 0);
  int slot = int(key.y);
  ivec2 c = ivec2(slot % S, slot / S);
  vec4 placed = texelFetch(look0, c, 0);
  vec3 transformed = vec3(0.0);
  vQuadUv = vec2(0.0);
  vTint = vec4(0.0);
  vKeep = 1.0;
  vFrame2 = vec2(0.0);
  vLook = vec2(0.0);
  bool shown = key.x < 1.0e38 && int(placed.w) == batch;
  if (shown) {
    vec4 right = texelFetch(look1, c, 0), up = texelFetch(look2, c, 0), edges = texelFetch(look3, c, 0);
    int flags = int(right.w);
    bool fx = (flags & 2) != 0, fy = (flags & 4) != 0;
    int v = int(corner);
    bool isRight = v == 1 || v == 2, isTop = v >= 2;
    transformed = placed.xyz + (isRight ? edges.y : edges.x) * right.xyz + (isTop ? edges.w : edges.z) * up.xyz;
    int ci = 2 * ((isTop != fy ? 0 : 2) + (isRight != fx ? 1 : 0));
    vQuadUv = at2(int(up.w) + FR_uv + ci);
    vec4 book = texelFetch(look5, c, 0);
    vFrame2 = at2(int(book.x) + FR_uv + ci);
    vLook = book.yz;
    vTint = texelFetch(look4, c, 0);
    vKeep = (flags & 1) != 0 ? 1.0 : 0.0;
  }
`
// After three's 'project_vertex' in the draw: a corner of no particle of this batch is put outside the view, and the
// picture's place and the colour handed to three's own varyings.
export const QUAD_AFTER = /* glsl */ `
  if (!shown) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  #ifdef USE_MAP
  vMapUv = vQuadUv;
  #endif
  vColor = vTint;
`
