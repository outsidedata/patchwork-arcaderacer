// terrain3d's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's: the land as a thing on the GPU.
// A scene with `world.gpgpu3d.mods: { things: ['terrain3d'], behaviors: ['terrain3d'] }`, and terrain3d
// listed, has the land round the camera met by whatever asks gpgpu3d's `gpLine`.
//
// `things(plugins, near)` hands back the window of the land it holds, `{ land:
// { at, cell, n, heights } }`, or nothing until the first has been filled. A window is a square of n × n
// heights, `cell` metres apart (the finest ring's cell, the lattice the land's nearest triangles stand
// on), its first at `at` [x, z], `heights[j · n + i]` the height the rings draw at (x + i·cell,
// z + j·cell). Its middle is the camera's place taken to the nearest quarter of a window, and it is wide
// enough that the land is held `near.reach` metres round the camera wherever in that quarter the camera
// stands. A window is filled when the middle moves and when the land does (a new land, a stroke): in one
// of terrain3d's workers (`task` below, its `ground.task`), or on the page where there are none. The
// window held is handed until the new one lands.
//
// `behaviors()` delivers `land`. Its numbers on the GPU are the window's `at`, `cell` and `n`; its heights
// are a float texture of its own, `landHeights`, a height a texel. A line meets it where it first goes
// under the land, the land between four heights the plane through them bent (each across, then along);
// one that starts under the land or off the window, or leaves the window before it goes under, meets
// nothing. It is walked a cell of ground at a time for as far as it stays over the window, and where it
// goes under halved HALVINGS times. The normal is that bent plane's own there, so a line that goes under
// it always goes against its normal. A point over the window is put `clear` clear of the land along that
// normal, measured from the land straight under it.
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Near, Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import { layoutOf } from './terrain3d.rings.ts'

// This module, which terrain3d's workers load to fill a window. It names its own file as a `new URL`, so
// the static site's bundle (`scripts/bundle.ts`) finds it as a task of a worker and writes it as a file.
const HERE = new URL('./terrain3d.gpgpu3d.ts', import.meta.url).href
// How many times the stretch of a line that goes under the land is halved to find where: as many as a
// float has bits to tell two places along it apart.
const HALVINGS = 24

export type Window = { at: number[]; cell: number; n: number; heights: Float32Array }
type Input = { x: number; z: number; cell: number; n: number }

const fill = (ground: { height(x: number, z: number): number }, { x, z, cell, n }: Input) => {
  const heights = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = ground.height(x + i * cell, z + j * cell)
  return heights
}

// In a worker of terrain3d's (`terrain3d.worker.ts`): a window's heights.
export const task = (ground: { height(x: number, z: number): number }, input: Input) => {
  const heights = fill(ground, input)
  return { out: heights, transfer: [heights.buffer] }
}

const ids = new WeakMap<object, number>()
let next = 0
const idOf = (o: object) => ids.get(o) ?? (ids.set(o, next++), next - 1)

// Each page's window, by its terrain3d: the one held and what it was filled for, and the one asked for.
const held = new WeakMap<object, { key?: string; asked?: string; window?: Window }>()

export function things(plugins: Plugins, near: Near): Thing[] {
  const t = plugins.terrain3d
  const ground = t?.ground
  if (!ground) return []
  const e = ground.edits()
  const cell = layoutOf(plugins.wire.scene.world!.terrain3d.rings).c0
  const half = Math.ceil(near.reach / cell)
  const snap = Math.ceil(half / 2)
  const wide = half + Math.ceil(snap / 2)
  const n = 2 * wide + 1
  const mi = Math.round(near.at[0] / cell / snap) * snap, mj = Math.round(near.at[2] / cell / snap) * snap
  const key = `${idOf(e.land)} ${e.layers.map((x: { version: number }) => x.version).join(' ')} ${mi} ${mj} ${n} ${cell}`
  let h = held.get(t)
  if (!h) held.set(t, (h = {}))
  if (h.key !== key && h.asked !== key) {
    const mine = h
    mine.asked = key
    const input: Input = { x: (mi - wide) * cell, z: (mj - wide) * cell, cell, n }
    const land = (heights: Float32Array) => {
      if (mine.asked !== key) return
      mine.key = key
      mine.window = { at: [input.x, input.z], cell, n, heights }
    }
    const asked = ground.task(HERE, input)
    if (asked) asked.then((out: unknown) => land(out as Float32Array))
    else land(fill(ground, input))
  }
  return h.window ? [{ land: h.window }] : []
}

const LAND = /* glsl */ `
uniform highp sampler2D landHeights;
// The land over a point, the point taken to the window's nearest edge when it is outside it: its height,
// and its rise a metre along x and along z.
vec3 landAt(int s, vec2 p) {
  int n = int(gp(s, 3));
  float cell = gp(s, 2);
  vec2 g = clamp((p - vec2(gp(s, 0), gp(s, 1))) / cell, vec2(0.0), vec2(float(n - 1)));
  ivec2 c = min(ivec2(floor(g)), ivec2(n - 2));
  vec2 f = g - vec2(c);
  float a = texelFetch(landHeights, c, 0).x, b = texelFetch(landHeights, c + ivec2(1, 0), 0).x;
  float e = texelFetch(landHeights, c + ivec2(0, 1), 0).x, k = texelFetch(landHeights, c + ivec2(1, 1), 0).x;
  return vec3(mix(mix(a, b, f.x), mix(e, k, f.x), f.y), mix(b - a, k - e, f.y) / cell, mix(e - a, k - b, f.x) / cell);
}
float landHeight(int s, vec2 p) { return landAt(s, p).x; }
bool landLine(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal) {
  float cell = gp(s, 2);
  vec2 low = vec2(gp(s, 0), gp(s, 1)), high = low + cell * float(int(gp(s, 3)) - 1);
  if (o.x < low.x || o.z < low.y || o.x > high.x || o.z > high.y || o.y < landHeight(s, o.xz)) return false;
  // as far as the line stays over the window
  float within = far;
  if (d.x > 0.0) within = min(within, (high.x - o.x) / d.x);
  if (d.x < 0.0) within = min(within, (low.x - o.x) / d.x);
  if (d.z > 0.0) within = min(within, (high.y - o.z) / d.z);
  if (d.z < 0.0) within = min(within, (low.y - o.z) / d.z);
  int strides = int(ceil(within * length(d.xz) / cell)) + 1;
  float stride = within / float(strides), was = 0.0;
  for (int i = 1; i <= strides; i++) {
    float ahead = stride * float(i);
    vec3 p = o + d * ahead;
    if (p.y < landHeight(s, p.xz)) {
      float over = was, under = ahead;
      for (int j = 0; j < ${HALVINGS}; j++) {
        float mid = (over + under) / 2.0;
        vec3 q = o + d * mid;
        if (q.y < landHeight(s, q.xz)) under = mid; else over = mid;
      }
      t = over;
      vec3 here = landAt(s, (o + d * t).xz);
      normal = normalize(vec3(-here.y, 1.0, -here.z));
      return true;
    }
    was = ahead;
  }
  return false;
}
bool landPush(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  vec4 a = gpRow(s, 0);
  vec2 high = a.xy + a.z * float(int(a.w) - 1);
  if (x.x < a.x || x.z < a.y || x.x > high.x || x.z > high.y) return false;
  vec3 here = landAt(s, x.xz);
  normal = normalize(vec3(-here.y, 1.0, -here.z));
  float off = (x.y - here.x) * normal.y;
  if (off >= clear) return false;
  depth = clear - off;
  return true;
}
`

const land: Behavior = {
  size: 4,
  uniforms: () => ({ landHeights: { value: null } }),
  pack(w: Window, { own, three }) {
    const u = own.landHeights
    if (u.value?.image.data !== w.heights) {
      u.value?.dispose()
      u.value = new three.DataTexture(w.heights, w.n, w.n, three.RedFormat, three.FloatType)
      u.value.needsUpdate = true
    }
    return [w.at[0], w.at[1], w.cell, w.n]
  },
  glsl: LAND,
}

export const behaviors = () => ({ land })
