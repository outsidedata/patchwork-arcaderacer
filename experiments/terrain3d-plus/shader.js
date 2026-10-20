// Experiment 2's ground material: experiment 1's material (`../terrain-warp/shader.js`) drawn on
// terrain3d's rings. What changes is where two of its inputs come from:
//
//   slope   the ring's vertex normal, which terrain3d works out from the land over ±one cell, as
//           the GPU blends it between the vertices. The finest ring's cell is 3 m, so a cliff
//           narrower than a triangle up close is drawn as a cliff; far off, the baked rings draw it.
//   biomes  the land's own mix (the program's `biomes` node), which terrain3d carries to every
//           vertex as band 1's ramp of `biome:desert` (tdA0.x). Per pixel it is moved by warped
//           noise and drawn through an edge, as a layer's mask is, so the border is ragged at every
//           scale and is the same border the ground's shape changes along.
//
// Everything else is experiment 1's: the warp, the layer masks, the texture arrays, the height
// blend, the far read, one sun and a sky, the baked rings (here wrapped and baked a strip at a time).
import * as THREE from 'three'
import { BIOMES, glsl, LAYERS } from '../terrain-warp/warp.js'

const vertexShader = `
attribute vec4 tdA0;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vDesert;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNrm = normal;
  vDesert = tdA0.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`

const fragmentShader = `
${glsl()}
uniform sampler2DArray uCol;
uniform sampler2DArray uNR;
uniform float uRes;
uniform float uScale[${LAYERS}];
uniform float uTri[${LAYERS}];
uniform float uSharp[${LAYERS}];
uniform float uNorStr[${LAYERS}];
uniform float uCompose;
uniform float uHB;
uniform float uHBDepth;
uniform float uHBSrc;
uniform float uFar;
uniform float uFarMul;
uniform float uDebug;
uniform float uFog;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmb;
uniform vec4 uBorder;
varying vec3 vWorld;
varying vec3 vNrm;
varying float vDesert;

struct Read { vec3 alb; vec3 nrm; float hgt; vec3 warp; float lod; };

vec2 plane(vec3 v, vec3 sg, int i) {
  if (i == 0) return vec2(v.z * sg.x, v.y);
  if (i == 1) return vec2(v.x * sg.y, v.z);
  return vec2(-v.x * sg.z, v.y);
}

void planeAdd(int i, float wt, float L, vec3 Q, vec3 Dx, vec3 Dy, vec3 sg, vec3 g, float st, inout vec3 alb, inout vec3 nrm, inout float rough) {
  vec2 uv = plane(Q, sg, i), dx = plane(Dx, sg, i), dy = plane(Dy, sg, i);
  alb += textureGrad(uCol, vec3(uv, L), dx, dy).rgb * wt;
  vec3 nr = textureGrad(uNR, vec3(uv, L), dx, dy).rgb;
  rough += nr.b * wt;
  vec3 t = vec3(nr.rg * 2.0 - 1.0, 0.0);
  t.z = sqrt(max(0.0, 1.0 - dot(t.xy, t.xy)));
  t.xy *= st;
  if (i == 1) { t.x *= sg.y; t = vec3(t.xy + g.xz, t.z * g.y); nrm += t.xzy * wt; }
  else if (i == 0) { t.x *= sg.x; t = vec3(t.xy + g.zy, t.z * g.x); nrm += t.zyx * wt; }
  else { t.x *= -sg.z; t = vec3(t.xy + g.xy, t.z * g.z); nrm += t.xyz * wt; }
}

Read readLayer(int k, vec3 p, vec3 g, vec3 dpx, vec3 dpy, vec3 wv) {
  Read r;
  float sc = uScale[k], L = float(k);
  r.warp = wv;
  vec3 Q = (p + wv) / sc, Dx = dpx / sc, Dy = dpy / sc;
  vec3 sg = vec3(g.x < 0.0 ? -1.0 : 1.0, g.y < 0.0 ? -1.0 : 1.0, g.z < 0.0 ? -1.0 : 1.0);
  vec3 a = vec3(0.0, 1.0, 0.0);
  if (uTri[k] > 0.5) { a = pow(abs(g), vec3(uSharp[k])); a /= a.x + a.y + a.z; }
  float st = uNorStr[k];
  vec3 alb = vec3(0.0), nrm = vec3(0.0); float rough = 0.0;
  planeAdd(1, a.y, L, Q, Dx, Dy, sg, g, st, alb, nrm, rough);
  r.lod = log2(max(length(plane(Dx, sg, 1)), length(plane(Dy, sg, 1))) * uRes);
  if (a.x > 0.001) planeAdd(0, a.x, L, Q, Dx, Dy, sg, g, st, alb, nrm, rough);
  if (a.z > 0.001) planeAdd(2, a.z, L, Q, Dx, Dy, sg, g, st, alb, nrm, rough);
  if (uFar > 0.0) {
    float m = uFarMul;
    vec3 f = textureGrad(uCol, vec3(plane(Q, sg, 1) / m, L), plane(Dx, sg, 1) / m, plane(Dy, sg, 1) / m).rgb;
    vec3 mean = textureLod(uCol, vec3(0.5, 0.5, L), 14.0).rgb;
    alb *= mix(vec3(1.0), clamp(f / max(mean, vec3(0.02)), 0.0, 3.0), uFar);
  }
  r.alb = alb;
  r.nrm = normalize(nrm);
  r.hgt = uHBSrc < 0.5 ? dot(alb, vec3(0.2126, 0.7152, 0.0722)) : 1.0 - rough;
  return r;
}

vec3 lodColour(float l) {
  float t = clamp(l / 8.0, 0.0, 1.0);
  return clamp(vec3(1.5 - abs(4.0 * t - 3.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 1.0)), 0.0, 1.0);
}

// The desert's share drawn per pixel: the land's share moved by ±amount of warped noise (slot
// LAYERS + 1's octaves, the desert biome's warp) at uBorder.x cycles a metre, through an edge
// uBorder.z wide. uBorder.w 0 draws the land's share as it blends.
void biomes(vec3 p, out float b[TW_BIOMES]) {
  float s = clamp(vDesert, 0.0, 1.0);
  if (uBorder.w > 0.5) {
    vec3 q = vec3(p.x, 0.0, p.z);
    vec3 wv = twWarp(q, TW_LAYERS + 1);
    float v = s + uBorder.y * (twEdgeNoise((q + wv) * uBorder.x, TW_LAYERS + 1) - 0.5) * 2.0;
    float e = max(uBorder.z, 0.001);
    s = twStep(0.5 - e * 0.5, 0.5 + e * 0.5, v);
  }
  b[0] = 1.0 - s;
  b[1] = s;
  float sum = 0.0;
  for (int j = 0; j < TW_BIOMES; j++) { if (b[j] < 0.01) b[j] = 0.0; sum += b[j]; }
  for (int j = 0; j < TW_BIOMES; j++) b[j] /= sum;
}

// The baked rings, as in experiment 1: wrapped on their side, read only inside their finished
// rectangle, each blending to the next over the last uRingBand of its side.
uniform sampler2DArray uRing0;
uniform sampler2DArray uRing1;
uniform sampler2DArray uRing2;
uniform vec4 uRingV[3];
uniform float uRingS[3];
uniform float uRingBand;
uniform float uVT;
uniform float uVTNear;
uniform float uVTFar;
uniform float uVTCliff;
float ringEdge(vec2 xz, vec4 v) { return min(min(xz.x - v.x, v.z - xz.x), min(xz.y - v.y, v.w - xz.y)); }
vec3 ringOne(sampler2DArray s, float side, vec2 xz, vec3 dpx, vec3 dpy, out vec3 n) {
  vec2 u = vec2(xz.x, -xz.y) / side, a = vec2(dpx.x, -dpx.z) / side, b = vec2(dpy.x, -dpy.z) / side;
  n = textureGrad(s, vec3(u, 1.0), a, b).xyz * 2.0 - 1.0;
  return textureGrad(s, vec3(u, 0.0), a, b).rgb;
}
vec3 ringRead(vec2 xz, vec3 dpx, vec3 dpy, out float cover, out vec3 n, out float which) {
  float rem = 1.0;
  vec3 acc = vec3(0.0), nacc = vec3(0.0), rn;
  which = -1.0;
  for (int i = 0; i < 3; i++) {
    if (rem < 0.001) break;
    float f = clamp(ringEdge(xz, uRingV[i]) / (uRingS[i] * uRingBand), 0.0, 1.0);
    if (f <= 0.0) continue;
    vec3 c;
    if (i == 0) c = ringOne(uRing0, uRingS[0], xz, dpx, dpy, rn);
    else if (i == 1) c = ringOne(uRing1, uRingS[1], xz, dpx, dpy, rn);
    else c = ringOne(uRing2, uRingS[2], xz, dpx, dpy, rn);
    float a = f * rem;
    acc += c * a;
    nacc += rn * a;
    rem -= a;
    if (which < 0.0) which = float(i);
  }
  cover = 1.0 - rem;
  n = cover > 0.0 ? normalize(nacc) : vec3(0.0, 1.0, 0.0);
  return cover > 0.0 ? acc / cover : vec3(0.0);
}

void main() {
  vec3 p = vWorld;
  vec3 g = normalize(vNrm);
  vec3 dpx = dFdx(p), dpy = dFdy(p);
  float dist = distance(cameraPosition, p);
  bool fieldView = uDebug == 1.0 || uDebug == 2.0 || uDebug == 3.0 || uDebug == 11.0;

  float vt = uVT > 0.5 && g.y >= uVTCliff ? smoothstep(uVTNear, uVTFar, dist) : 0.0;
  float ring = -1.0;
  vec3 baked = vec3(0.0), bn = g;
  if (vt > 0.0) {
    float cover;
    baked = ringRead(p.xz, dpx, dpy, cover, bn, ring);
    vt *= cover;
  }

  vec3 alb = vec3(0.0), N = g;
  float w[TW_LAYERS];
  float bw[TW_BIOMES];
  for (int k = 0; k < TW_LAYERS; k++) w[k] = 0.0;
  for (int j = 0; j < TW_BIOMES; j++) bw[j] = 0.0;
  vec3 topWarp = vec3(0.0); float topLod = 0.0;
  if (vt < 0.999 || fieldView) {
    biomes(p, bw);
    vec3 wv[TW_LAYERS];
    for (int j = 0; j < TW_BIOMES; j++) {
      if (bw[j] == 0.0) continue;
      vec4 m;
      for (int r = 0; r < TW_PER; r++) { int k = j * TW_PER + r; wv[k] = twWarp(p, k); m[r] = twMask(p, g.y, k, wv[k]); }
      vec4 share = twCompose(m, uCompose);
      for (int r = 0; r < TW_PER; r++) w[j * TW_PER + r] = bw[j] * share[r];
    }

    Read r[TW_LAYERS];
    for (int k = 0; k < TW_LAYERS; k++) {
      if (w[k] > 0.01) r[k] = readLayer(k, p, g, dpx, dpy, wv[k]);
      else { r[k].alb = vec3(0.0); r[k].nrm = g; r[k].hgt = 0.0; r[k].warp = vec3(0.0); r[k].lod = 0.0; }
    }

    if (uHB > 0.0) {
      float s[TW_LAYERS];
      float hi = -10.0;
      for (int k = 0; k < TW_LAYERS; k++) { s[k] = w[k] > 0.01 ? w[k] + uHB * r[k].hgt : -10.0; hi = max(hi, s[k]); }
      hi -= uHBDepth;
      float sum = 0.0;
      for (int k = 0; k < TW_LAYERS; k++) { s[k] = max(s[k] - hi, 0.0); sum += s[k]; }
      for (int k = 0; k < TW_LAYERS; k++) w[k] = s[k] / sum;
    }

    vec3 nrm = vec3(0.0);
    for (int k = 0; k < TW_LAYERS; k++) { alb += r[k].alb * w[k]; nrm += r[k].nrm * w[k]; }
    N = normalize(nrm);
    int t = 0;
    for (int k = 1; k < TW_LAYERS; k++) if (w[k] > w[t]) t = k;
    topWarp = r[t].warp;
    topLod = r[t].lod;
  }
  if (uDebug == 7.0) { gl_FragColor = vec4(alb, 1.0); return; }
  if (uDebug == 9.0) { gl_FragColor = vec4(N * 0.5 + 0.5, 1.0); return; }

  if (vt > 0.0 && !fieldView) {
    alb = mix(alb, baked, vt);
    N = normalize(mix(N, bn, vt));
  }

  float sun = max(dot(N, uSunDir), 0.0);
  vec3 light = uSunCol * sun + uAmb * (0.6 + 0.4 * N.y);
  vec3 col = alb * light;
  float relief = 0.35 + 0.65 * max(dot(g, uSunDir), 0.0);

  if (uDebug == 1.0) {
    vec3 pal[TW_LAYERS] = vec3[TW_LAYERS](vec3(0.25, 0.75, 0.25), vec3(0.9, 0.6, 0.2), vec3(0.3, 0.4, 1.0), vec3(1.0),
                                          vec3(0.95, 0.85, 0.35), vec3(0.45, 0.28, 0.12), vec3(0.85, 0.15, 0.1), vec3(1.0, 0.55, 0.75));
    vec3 c = vec3(0.0);
    for (int k = 0; k < TW_LAYERS; k++) c += pal[k] * w[k];
    col = c * relief;
  } else if (uDebug == 11.0) {
    vec3 pal[TW_BIOMES] = vec3[TW_BIOMES](vec3(0.3, 0.7, 0.35), vec3(0.95, 0.7, 0.3));
    vec3 c = vec3(0.0);
    for (int j = 0; j < TW_BIOMES; j++) c += pal[j] * bw[j];
    col = c * relief;
  } else if (uDebug == 2.0) {
    col = 0.5 + 0.5 * clamp(topWarp / 30.0, -1.0, 1.0);
  } else if (uDebug == 3.0) {
    col = lodColour(topLod) * relief;
  } else if (uDebug == 8.0) {
    vec3 rc = ring < 0.5 ? vec3(0.2, 0.85, 0.3) : ring < 1.5 ? vec3(0.25, 0.45, 1.0) : vec3(1.0, 0.55, 0.15);
    col = mix(vec3(0.55), rc, ring < 0.0 ? 0.0 : vt) * relief;
  } else if (uDebug == 4.0) {
    col = alb;
  } else if (uDebug == 6.0) {
    col = 0.5 + 0.5 * N;
  }

  if (uFog > 0.0 && uDebug != 6.0 && uDebug != 2.0) col = mix(col, uSky, 1.0 - exp(-dist * uFog));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function makeMaterial() {
  const z = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v))
  const SLOTS = LAYERS + BIOMES
  const uniforms = {
    uHeight: { value: z(LAYERS, () => new THREE.Vector4()) },
    uSlope: { value: z(LAYERS, () => new THREE.Vector4()) },
    uNoise: { value: z(SLOTS, () => new THREE.Vector4()) },
    uOct: { value: z(SLOTS * 3, () => new THREE.Vector4()) },
    uStr: { value: z(SLOTS * 3, () => new THREE.Vector3(1, 1, 1)) },
    uCover: { value: z(BIOMES, 0) },
    uCol: { value: null },
    uNR: { value: null },
    uRes: { value: 4096 },
    uScale: { value: z(LAYERS, 1) },
    uTri: { value: z(LAYERS, 0) },
    uSharp: { value: z(LAYERS, 4) },
    uNorStr: { value: z(LAYERS, 1) },
    uCompose: { value: 0 },
    uHB: { value: 0 },
    uHBDepth: { value: 0.2 },
    uHBSrc: { value: 0 },
    uFar: { value: 0 },
    uFarMul: { value: 8 },
    uDebug: { value: 0 },
    uFog: { value: 0 },
    uSky: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
    uAmb: { value: new THREE.Color(0.3, 0.3, 0.3) },
    uBorder: { value: new THREE.Vector4(0.01, 0.35, 0.2, 1) },
    uRing0: { value: null },
    uRing1: { value: null },
    uRing2: { value: null },
    uRingV: { value: z(3, () => new THREE.Vector4(1, 1, -1, -1)) },
    uRingS: { value: z(3, 1) },
    uRingBand: { value: 0.06 },
    uVT: { value: 0 },
    uVTNear: { value: 150 },
    uVTFar: { value: 300 },
    uVTCliff: { value: 0.6 },
  }
  return new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader })
}
