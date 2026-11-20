// fabric3d's shaders: the passes that move a fabric's points on the GPU, and the splice its mesh is drawn
// through. A fabric is its points, each a texel of its textures, `w` across and `h` along (a fabric cut as a
// grid, a column and a row; a sewn one, its points one after another):
//
//   posTex   xyz where the point is, w its pin's number + 1, or 0 for a point nothing holds
//   prevTex  xyz where it was a substep ago
//   restTex  xyz where it lies in its cut's own frame, w 1 for a point and 0 for a texel that is none
//   linkTex  the points each point is held to: `links` texels a point, side by side, each xy the texel of the
//            other point, z the metres between the two at rest, and w what holds them: 1 along the weave
//            (`stretch`), 2 across it (`shear`), 3 over a fold (`bend`), 0 for no link
//   ringTex  the triangles each point is a corner of: `rings` texels a point, side by side, each xy and zw
//            the texels of the triangle's other two corners, in the order that faces it; x below 0 for none
//
// What it meets is the `solids` mod's, whose GLSL the MEETS pass is made with.

// The numbers of one pin: the frame it holds its points in now, and the frame a frame ago.
export const PIN = 32

export const QUAD = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const PRELUDE = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D posTex;
uniform sampler2D prevTex;
uniform sampler2D restTex;
`

// The way the fabric faces at a point: the sum of its triangles' faces.
const FACING = /* glsl */ `
uniform sampler2D ringTex;
uniform int rings;
vec3 facing(ivec2 t, vec3 x) {
  vec3 n = vec3(0.0);
  for (int i = 0; i < rings; i++) {
    vec4 G = texelFetch(ringTex, ivec2(t.x * rings + i, t.y), 0);
    if (G.x < 0.0) continue;
    n += cross(texelFetch(posTex, ivec2(G.xy), 0).xyz - x, texelFetch(posTex, ivec2(G.zw), 0).xyz - x);
  }
  float l = length(n);
  return l > 1e-12 ? n / l : vec3(0.0, 1.0, 0.0);
}
`

// The fabric laid as the page worked it out: the two textures it uploaded, copied into the state.
export const LAY = /* glsl */ `${PRELUDE}
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oPrev;
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  oPos = texelFetch(posTex, t, 0);
  oPrev = texelFetch(prevTex, t, 0);
}
`

// One substep's move: a held point put where its pin holds it, `through` of the way from the pin's frame a
// frame ago to its frame now; every other point carried on at the speed it had, pulled by gravity, pushed by
// the air across its face, and slowed by its drag.
export const MOVE = /* glsl */ `${PRELUDE}
uniform sampler2D pinsTex;
uniform float h;
uniform float hPrev;
uniform float through;
uniform float now;
uniform vec3 gravity;
uniform vec3 wind;
uniform vec2 turbulence;
uniform float drag;
uniform float caught;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oPrev;
${FACING}
mat4 frame(int pin, int from) {
  return mat4(texelFetch(pinsTex, ivec2(from, pin), 0), texelFetch(pinsTex, ivec2(from + 1, pin), 0), texelFetch(pinsTex, ivec2(from + 2, pin), 0), texelFetch(pinsTex, ivec2(from + 3, pin), 0));
}
// Value noise, three of it, each from -1 to 1.
float hash(ivec3 p) {
  uint x = uint(p.x) * 374761393u + uint(p.y) * 668265263u + uint(p.z) * 2147483647u;
  x = (x ^ (x >> 13u)) * 1274126177u;
  x ^= x >> 16u;
  return float(x >> 8u) / 16777216.0;
}
float noise(vec3 p) {
  ivec3 i = ivec3(floor(p));
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash(i), hash(i + ivec3(1, 0, 0)), f.x), mix(hash(i + ivec3(0, 1, 0)), hash(i + ivec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(hash(i + ivec3(0, 0, 1)), hash(i + ivec3(1, 0, 1)), f.x), mix(hash(i + ivec3(0, 1, 1)), hash(i + ivec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z) * 2.0 - 1.0;
}
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(posTex, t, 0);
  vec3 x = P.xyz;
  oPos = P;
  oPrev = vec4(x, 0.0);
  vec4 R = texelFetch(restTex, t, 0);
  if (R.w < 0.5) return;
  int pin = int(P.w) - 1;
  if (pin >= 0) {
    vec4 r = vec4(R.xyz, 1.0);
    oPos = vec4(mix((frame(pin, 4) * r).xyz, (frame(pin, 0) * r).xyz, through), P.w);
    return;
  }
  vec3 v = (x - texelFetch(prevTex, t, 0).xyz) / hPrev;
  vec3 air = wind;
  if (turbulence.y > 0.0) {
    vec3 q = (x - wind * now) / turbulence.x;
    air += length(wind) * turbulence.y * vec3(noise(q), noise(q + vec3(31.7, 0.0, 0.0)), noise(q + vec3(0.0, 0.0, 57.3)));
  }
  vec3 n = facing(t, x);
  v += (gravity + caught * dot(air - v, n) * n) * h;
  v *= max(0.0, 1.0 - drag * h);
  oPos = vec4(x + v * h, P.w);
}
`

// One pass of the fabric's lengths: each point nothing holds moved toward where each point it is linked to
// would have it, by `stretch`, `shear` or `bend` as the link says, by the mean of them all. A held point
// does not give, so a point linked to one moves the whole way to it.
export const HOLD = /* glsl */ `${PRELUDE}
uniform sampler2D linkTex;
uniform int links;
uniform float stretch;
uniform float shear;
uniform float bend;
layout(location = 0) out vec4 oPos;
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(posTex, t, 0);
  oPos = P;
  if (P.w > 0.5 || texelFetch(restTex, t, 0).w < 0.5) return;
  vec3 x = P.xyz;
  vec3 sum = vec3(0.0);
  float count = 0.0;
  for (int i = 0; i < links; i++) {
    vec4 L = texelFetch(linkTex, ivec2(t.x * links + i, t.y), 0);
    float k = L.w < 0.5 ? 0.0 : L.w < 1.5 ? stretch : L.w < 2.5 ? shear : bend;
    if (k <= 0.0) continue;
    vec4 Q = texelFetch(posTex, ivec2(L.xy), 0);
    vec3 d = Q.xyz - x;
    float len = length(d);
    count += 1.0;
    if (len < 1e-9) continue;
    sum += d * ((len - L.z) / len) * (Q.w > 0.5 ? 1.0 : 0.5) * k;
  }
  if (count > 0.0) oPos.xyz = x + sum / count;
}
`

// The `meet` of a scene that names no `solids` mod: a fabric meets nothing.
export const NOTHING = /* glsl */ `
int meetCount() { return 0; }
bool meetOf(int i, vec3 x, vec3 was, float clear, out vec3 normal, out float depth, out vec3 vel) { return false; }
`

// What the fabric meets: each point nothing holds put `thick` clear of everything it is nearer than that
// to, or inside, one thing after another; and where it met one, the part of its substep's move across that
// thing's face, less the thing's own move, held back by `friction`. `meet` is the solids' GLSL, the `solids`
// mod's or NOTHING: it defines
//   int meetCount()
// how many things there are, and
//   bool meetOf(int i, vec3 x, vec3 was, float clear, out vec3 normal, out float depth, out vec3 vel)
// whether the point `x`, which was at `was` a substep ago, is nearer than `clear` to thing `i`: `normal` the
// way out, `depth` the metres along it `x` is to move to stand `clear` clear, and `vel` the metres a second
// the thing moves.
export const MEETS = (meet: string) => /* glsl */ `${PRELUDE}
uniform float thick;
uniform float friction;
uniform float h;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oPrev;
${meet}
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(posTex, t, 0);
  vec3 prev = texelFetch(prevTex, t, 0).xyz;
  oPos = P;
  oPrev = vec4(prev, 0.0);
  if (P.w > 0.5 || texelFetch(restTex, t, 0).w < 0.5) return;
  vec3 x = P.xyz;
  int count = meetCount();
  for (int i = 0; i < count; i++) {
    vec3 n, vel;
    float depth;
    if (!meetOf(i, x, prev, thick, n, depth, vel)) continue;
    x += n * depth;
    vec3 move = x - prev - vel * h;
    x -= (move - n * dot(move, n)) * friction;
  }
  oPos.xyz = x;
}
`

// The way every point faces, written once the frame's substeps are done, for the mesh to be lit by.
export const FACES = /* glsl */ `${PRELUDE}
layout(location = 0) out vec4 oFacing;
${FACING}
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  oFacing = vec4(facing(t, texelFetch(posTex, t, 0).xyz), 0.0);
}
`

// The splice a fabric's material is dressed with (`render3d`'s `dress`), and the lines its shadow's
// materials are given: each vertex is drawn at a point of the fabric, `fabricTexel` that point's texel,
// where the point is and facing as the FACES pass found it.
export const DRAWN = {
  common: /* glsl */ `
uniform highp sampler2D fabricPos;
uniform highp sampler2D fabricFacing;
attribute vec2 fabricTexel;
`,
  beginnormal_vertex: /* glsl */ `
objectNormal = texelFetch(fabricFacing, ivec2(fabricTexel), 0).xyz;
`,
  begin_vertex: /* glsl */ `
transformed = texelFetch(fabricPos, ivec2(fabricTexel), 0).xyz;
`,
}
