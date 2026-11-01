// The browser half of terrain3d: the ground drawn as square rings that follow the camera, so it
// never ends, and the `ground` other plugins ask. It reads the scene's `world.terrain3d` off
// `plugins.wire.scene.world` (terrain3d has no row), asks the loader for the field it names
// (`terrain3d.sim.ts` says what the file holds) and makes its own land from this client's parse of it
// with the server half's `land`, so a seat draws the ground its rules stand on, byte for byte.
//
// Its other numbers are the render budget:
//   rings        `[{ reach, seg }]`, finest first: a ring is a square `reach` metres from its middle
//                to its edge, of `seg` cells across.
//   shadowReach  a ring whose reach is within this casts shadows; every ring takes them.
//   budget       milliseconds a frame the rebuild may take.
//   seabed       whether ground under the waterline is drawn at `raw`, so the sea has a floor.
//   static       false when left out; true, the rings stand still, centred on the world's origin, instead of following
//                the camera: built once and never recentred, for a place small enough that its
//                finest ring covers all of it. A brush stroke still rebuilds the rings it reaches.
//   preload      false when left out; true, the camera's first place is prepared before anything of
//                the land is on the scene (Prepared places).
//   bake         optional: baked rings round the camera (Baked rings), `terrain3d.bake.ts` its keys.
//   maps         optional: `{ near, reach, step, small }`, full maps only for the layers the ground
//                near the camera hits and a small copy of every layer (Near maps).
//
// Baked rings. With `bake`, the ground's look is rendered into square textures round the camera, its
// albedo and its normal-mapped normal, from the rings drawn, with the ground's own material, a strip at
// a time as the camera moves, `bake.budget` thousand texels a frame (`terrain3d.bake.ts` says how). A
// fragment between `bake.near` and `bake.far` from the camera fades from the look worked out live to
// the baked one, and past `far`, wherever a ring holds a finished bake, reads only that: no ground
// layer's mask, warp or map is worked out there. Ground steeper than `bake.cliff` (its normal's y below
// it) stays live at every distance, and so does ground past the coarsest ring. A new look, a new land
// or a stroke bakes every ring again; until a ring is baked, the ground it would cover is live. The
// plugin bakes round the camera with its own rings each `afterTick`, once they are on the scene; a
// plugin drawing terrain3d's rings itself asks `bake(meshes, x, z, cover)` with its own (a ring's mesh
// is placed by its ground point in a bake, so a ground bent in its vertex bakes flat). `baked()` is
// each ring's `{ side, at, valid, left }`, or undefined with no bake. A bake set the coarsest mesh ring
// cannot cover throws when the plugin starts, with the side it may have.
//
// Prepared places. `prepare(x, z)` gets the land ready at a place the camera is about to jump to, a
// cut, a teleport, a respawn, before it gets there: every ring the camera would stand in there is
// built off the scene, from what is left of `budget` once the camera's own rebuild has had its share,
// and stays built. One place is in hand at a time: `prepare` again replaces it, and `unprepare()` lets
// it go. `prepared()` is `{ at, done }`, or undefined with none in hand. A place is done when every ring
// is built, every map the ground layers name has landed or failed, and every plugin
// `world.terrain3d.mods.ready` names says its share of the place is done, `ready(plugins)` → boolean,
// as scatter3d does once every cell in reach of the place is placed (`scatter3d.terrain3d.ts`). Each is
// asked the frame after it ran, so it may be listed after terrain3d, and one the scene does not list
// throws (`provided`).
//
// The camera arrives when its finest ring would stand where the place's does. The rebuild in hand is
// let go, and the next takes every ring the place built for the middle and hole it wants, builds
// whatever is still unbuilt in that one frame, `budget` or no budget, and swaps them all in: arriving
// before the place is done costs that frame, and never shows a ring half built. Once the place has
// swapped in and is done, it is let go. A stroke or a new land lays its rings out again. A jump to a
// place nobody prepared is rebuilt a slice a frame, as any other move is.
//
// Preloading is the camera's own first place: with `preload`, this client prepares where the camera
// stands, arrives at once, so the place is built whole there, and puts nothing of the land on
// render3d's scene until the place is done, so the land and what stands on it arrive in the same
// frame, whole. Until then the place follows the camera, which whatever places it may still be
// moving onto the seat: it keeps its rings while the finest ring's middle stays, and is prepared again
// where the camera stands when that moves. `ground.shown()` is false until then; without `preload` it is true
// from the first frame.
//
// Workers. Where the page has `Worker`, rings are built off the page, in a pool of module workers
// (`terrain3d.worker.ts`), as many as the rings and one fewer than the machine's cores, at least one,
// made the first time a ring is asked for and terminated in `close`. Each holds its own land, made
// from this client's field and unsaved strokes, sent again whenever the land or a layer's version
// moves; a ring is asked of the least busy worker the moment it is wanted, and is built with the same
// arithmetic the page would use (`terrain3d.rings.ts`), so its floats are the page's, and its arrays
// come back without a copy. `budget` then bounds only the page's own work. A ring no longer wanted is
// dropped from its worker's queue, and an answer that comes back for one is let go. Arriving at a
// prepared place while the land is on the scene builds every ring of it still in a worker here, in
// that frame; while it is not, as during preloading, the page waits for the workers and keeps
// running. Where there is no `Worker`, as in node, every ring is built a slice a frame on the page.
//
// `task(url, input)` lends the workers to any plugin that reads the land: the module at `url`'s
// `task(ground, input)` runs in the least busy worker on its land, `ground` the land as `ground` below
// has it but for `ray`, `shown` and preparing, and hands back `{ out, transfer }`; `task` hands back a
// promise of `out`, or undefined where there are no workers. scatter3d places its cells so
// (`scatter3d.cells.ts`).
//
// The grid. The finest ring's cell, 2·reach/seg, is the lattice unit, and every place a ring puts
// a vertex is a whole number of units across, so two rings that put one at the same place put it at
// the same float. Each coarser ring's cell is its own 2·reach/seg rounded to a whole number of the
// next finer ring's cells. A ring snaps its middle to multiples of about an eighth of its reach,
// rounded to a whole number of the next coarser ring's cells (its own, for the outermost), and its
// half width is its reach rounded up to the same, so its edge, and so the hole the next ring leaves
// for it, sits on the next ring's grid lines and no strip of sky shows. The camera may sit up to half
// a snap from each of two rings' middles, so a ring set in which a ring's half width is less than
// the finer one's, plus half of both snaps, plus a cell, could leave a hole uncovered, and throws when
// the plugin starts.
//
// Seams. A fine ring's outer edge is lifted onto the next coarser ring's chord: a vertex t fine cells
// along a coarse edge from its vertex A to B, m fine cells to a coarse one, is drawn at hA +
// (hB − hA)·(t/m) (hA itself at t = 0), so the rings meet without skirts. The coarse ring's cells
// along its hole are fanned through those same seam vertices, made with the same arithmetic from the
// same heights, so the two rings share every seam vertex bit for bit and no T-junction drops a pixel.
// Only the outermost ring hangs a skirt, max(hscale, 40) deep, down from its edge.
//
// A ring recentres (unless `static`) when the camera, read off render3d's camera as it stands each `afterTick`, crosses
// half a snap, and the ring outside it follows, because its hole moves. The rings that change are
// built into second buffers a slice a frame: each frame takes units of work (a ring's layout, a row
// of heights and colours, a row of normals, its seams and skirt, a row of triangles, and last the
// swap) until `budget` milliseconds have gone, at least one; and all of them swap in together, in
// that last unit, once every one is whole, so a seam is never half built. The rings are sized so a rebuild finishes before the camera leaves the
// fine area. A new land is made when the field's content changes, compared by value and never by
// identity, since the loader refills a rewritten file in place: when only its layers changed, as
// when a stroke is saved or undone, only the rings that the rects of the layers from the first that
// changed on, the old land's and the new one's, reach are rebuilt, and every other ring is the new
// land's as it stands, since every height and value it drew is the same; a change to the ground
// layers but for their rules on more than height and slope, or to the surfaces' colours, covers and
// edges, changes what no vertex carries and rebuilds no ring, only the material; any other
// change rebuilds every ring, which draw with the material the old look made until they swap in. A ring is also rebuilt where a layer's version has moved and its rect reaches ground
// the ring draws, as when the brush strokes this client's `land`. The rings shown stay on the scene
// until the rebuilt ones swap in, so the ground never goes. So this is listed before render3d,
// whose `afterTick` draws.
//
// What the ground carries. The values of the land record the colour is made of (`Slots`): every
// surface, the paint's weight where the paint is that surface and 0 elsewhere; every ground layer
// after the first with a rule on more than height and slope, those rules' ramps multiplied
// (`vertexRules`), `biome:<name>` among them; and every biome's share (Views). They are not on the
// vertices: each ring's build works them out at each of its grid points into a grid of texels
// (`terrain3d.rings.ts`), which `carry` writes into one float texture array, ring k's in its own
// layers, four values a texel, and the look reads them by ground point, from the finest ring drawn
// whose square holds it, blended between the four grid points round it. So a field carries as many as
// it likes. A ring's outer edge carries the coarser ring's values blended along it, as its heights are
// lifted onto its chord, so the two rings agree along the seam. `carry(list)` is handed every ring
// drawn, `{ k, C, grid? }`, the grid where the ring is new; the plugin calls it as rings swap in, and a
// plugin drawing terrain3d's rings itself calls it with its own. Normals are the height function's
// over ±one cell, and along a ring's hole over ±one of the finer ring's cells, as that ring takes them
// at the same vertices; never a zero vector made unit: a NaN normal silently stops shadow receiving.
//
// Ground layers. The colour and the normal are made per pixel, in GLSL built from the field's
// `ground` with toFixed(6) (`terrain3d.warp.ts`'s twin) and handed to render3d's `dress`, so they get
// the weather and the lights too. Each layer's mask is its carried value at the pixel, times its
// height and slope rules there (its height, and one minus its geometric normal's y), moved by its
// noise at the warped point through its edge; the masks are composed into weights, and each layer
// with a weight above 0.01 reads its map and its normal map at the warped point, with the unwarped
// point's gradients, on the top plane or on all three; then the height blend, the sums, and each
// surface's colour by its weight through its edge (an edge, `terrain3d.sim.ts`). The roughness is the
// ground's one `roughness`; no map is read for it. A layer draws mid grey until every map has landed.
// A map that is no `texture` entry of the catalogue throws. The GLSL reads only constants, but for
// the arrays, so changing a layer's numbers makes a new program and changes no ring.
//
// Near maps. Without `maps`, every layer's maps are drawn into two texture arrays, colour and normal,
// layer k into slot k, at the largest colour map's size. With `maps: { near, reach, step, small }`:
//   - every layer's maps are drawn small, `small` texels a side, into two small arrays, the small copy
//     of every layer;
//   - the near arrays, at the largest colour map's size, hold `near` slots;
//   - the layers the ground within `reach` metres of the camera hits are worked out on a grid `step`
//     metres apart (`terrain3d.present.ts`, in a worker), each layer's weight summed, again whenever
//     the camera moves a quarter of `reach` or the land changes (`focus(x, z)`; a plugin drawing the
//     rings itself calls it with its own point); the `near` with the most weight hold the slots, a
//     layer keeping a slot it already has, and the rest read their small copy. A layer that comes into
//     reach reads its small copy until its full maps are drawn into a slot.
// So the near ground holds full maps only for the few layers it hits, and the field may have as many
// layers as the small arrays hold. The far read reads the small copy. A baked ring whose texel is as
// wide as a small copy's, the smallest layer `scale` over `small`, bakes from the small copies (Baked
// rings). Each of the four arrays binds one texture unit, however many layers there are.
//
// Views. The material's `userData.terrain3d` is its uniforms, and `tdDebug` among them draws the
// ground unlit and unfogged as one of: 0 lit, as it is; 2 the weights, each layer its own hue; 3 the
// top layer's warp; 4 the top layer's mip, blue 0 to red 8 and past; 5 the albedo; 6 the normal; 7
// the biomes' shares, each biome its own hue; 8 the slope; 9 and 10 the albedo and the normal as a
// bake writes them; 11 the baked rings, live ground grey and each ring its own hue, by how much it gives.
// A testbed sets it; no game does. The ground carries every biome's share too, for view 7.
//
// It hands out `land`, the client's own, which the brush strokes, made again from each new content
// with the unsaved strokes the file does not hold yet (`terrain3d.sim.ts`); `rings`, where each ring stands
// (`at` its middle and `half` its half width in metres, `cell`, and its `mesh`); `building()`, how far
// the rebuild in hand has got, `{ done, total }` units, or undefined; `shown()`, whether the rings are
// on the scene; `prepare(x, z)`, `prepared()` and `unprepare()` (Prepared places); `task(url, input)`
// (Workers); `bake(meshes, x, z, cover)` and `baked()` (Baked rings); `focus(x, z)` (Near maps);
// `carry(list)` (What the ground carries); and `ground`, once there is a land: `{ height, raw, depth, at, cover, spray, mark, ramp,
// rules, edits, ray, mix, layers, rings, shown, prepare, prepared, unprepare, task }` over this client's
// land, `at` its land record, `cover`, `spray` and `mark` its paint's, `rules` the land's own check,
// which knows its biomes, `ray(origin, dir)` marched out to the camera's far plane and `mix(x, z)` each
// biome's share there by name, `layers(x, z)` each ground layer's weight there by name, `rings()` each
// ring's `reach`, finest first, which scatter3d draws its LODs on, `shown()`, `prepare(x, z)`, `unprepare()` and `task` as above, and
// `prepared()` the place in hand's `at`, or undefined. `close` takes the rings off the scene and disposes
// every geometry and the material.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { land as landFrom, type Edge, type Field, type Land, type Rule } from './terrain3d.sim.ts'
import { biomeNames, build as buildRing, finish, layoutOf, slotsOf, vertexRules, type Arrays, type Build, type Layout, type Slots } from './terrain3d.rings.ts'
import { glsl } from './terrain3d.warp.ts'
import { baker, bakeUniforms, checkBake, type BakeSettings, type Baker } from './terrain3d.bake.ts'
import { present, type Input as PresentInput } from './terrain3d.present.ts'

// `world.terrain3d.maps` (Near maps).
export type Maps = { near: number; reach: number; step: number; small: number }
type Settings = { field: string; rings: { reach: number; seg: number }[]; shadowReach: number; budget: number; seabed: boolean; static?: boolean; preload?: boolean; bake?: BakeSettings; maps?: Maps }

// Throws for maps settings that cannot work.
function checkMaps(m: Maps) {
  if (!(Number.isInteger(m.near) && m.near >= 1)) throw new Error(`terrain3d maps near ${m.near} is not a whole number of at least 1`)
  if (!(m.reach > 0)) throw new Error(`terrain3d maps reach ${m.reach} is not above 0`)
  if (!(m.step > 0 && m.step <= m.reach)) throw new Error(`terrain3d maps step ${m.step} is not above 0 and within reach ${m.reach}`)
  if (!(Number.isInteger(m.small) && m.small >= 16)) throw new Error(`terrain3d maps small ${m.small} is not a whole number of at least 16`)
}

// The ground layers' maps as the look reads them (Near maps): the near arrays, `near` slots of full
// maps, which layer each slot holds and where each layer is (−1 for none), the small copy of every
// layer, and `put`, which draws layer k's maps into a slot of a pair of arrays.
type Stock = {
  col: THREE.WebGLArrayRenderTarget; nr: THREE.WebGLArrayRenderTarget; small: { col: THREE.WebGLArrayRenderTarget; nr: THREE.WebGLArrayRenderTarget } | undefined
  near: number; of: number[]; holds: number[]; uniforms: Record<string, THREE.IUniform>
  put(col: THREE.WebGLArrayRenderTarget, nr: THREE.WebGLArrayRenderTarget, slot: number, k: number): void
  mips(rt: THREE.WebGLArrayRenderTarget): void
  dispose(): void
}
// What the ground carries, held for the look (What the ground carries): a float texture array, ring k's
// value texels in its layers k·A to k·A + A − 1, each W texels a side; and each ring's grid corner, cell
// and N, as the look's `tdValRing` has them.
type Values = { tex: THREE.DataArrayTexture; A: number; W: number; R: number; ring: THREE.Vector4[] }
type Shown = { C: number[]; hole: number[] | undefined; land: Land; versions: number[]; mesh: THREE.Mesh }

// Everything of a field a vertex carries is made from: two fields that give the same make the same
// rings, whatever else of their look differs.
const carried = (f: Field) => JSON.stringify([Object.keys(f.surfaces ?? {}), f.ground.layers.map(vertexRules), biomeNames(f)])
// Everything of a field the material is made from.
const looked = (f: Field) => JSON.stringify([f.ground, f.surfaces ?? {}])

// The colour the weights and biome views give the i-th of n: hues round the wheel, as linear GLSL.
const pal = (i: number, n: number) => {
  const h = i / Math.max(n, 1), c = (o: number) => (0.55 + 0.45 * Math.cos(2 * Math.PI * (h + o))).toFixed(6)
  return `vec3(${c(0)}, ${c(0.33)}, ${c(0.67)})`
}

// The GLSL of 2D value noise, which a surface's ragged edge reads.
const NOISE = [
  'float tdHash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }',
  'float tdNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
  '  return mix(mix(tdHash(i), tdHash(i + vec2(1.0, 0.0)), u.x), mix(tdHash(i + vec2(0.0, 1.0)), tdHash(i + vec2(1.0, 1.0)), u.x), u.y); }',
].join('\n')

// The ground's look, as a render3d surface (Ground layers). `uniforms` gets the two texture arrays,
// their size and each layer's switch.
function look(f: Field, slots: Slots, THREE: typeof import('three'), uniforms: Record<string, THREE.IUniform>, bake: BakeSettings | undefined, maps: Maps | undefined, meshRings: number): { uniforms: Record<string, THREE.IUniform>; vertex: Record<string, string>; fragment: Record<string, string> } {
  const n6 = (v: number) => v.toFixed(6)
  const rgb = (c: string) => { const k = new THREE.Color(c); return `vec3(${n6(k.r)}, ${n6(k.g)}, ${n6(k.b)})` }
  const value = (s: number) => `tdVal[${s >> 2}].${'xyzw'[s & 3]}`
  const A = slots.attributes
  const sharpen = (w: string, e: Edge | undefined) => {
    if (!e) return w
    const rag = e.ragged > 0 ? ` + ${n6(e.ragged)} * (tdNoise(vDressWorld.xz * ${n6(e.scale)}) - 0.5)` : ''
    return `smoothstep(${n6(0.5 - e.width / 2)}, ${n6(0.5 + e.width / 2)}, ${w}${rag})`
  }
  const g = f.ground, L = g.layers.length
  const surfaces = Object.keys(f.surfaces ?? {})
  uniforms.tdVals = { value: null }
  uniforms.tdValRing = { value: Array.from({ length: meshRings }, () => new THREE.Vector4(0, 0, 1, -1)) }
  uniforms.tdCol = { value: null }
  uniforms.tdNR = { value: null }
  // the small copy of every layer, and where each layer's full maps are in the near arrays, −1 for none
  // (Near maps); without `maps` every layer is in the near arrays, layer k at k
  uniforms.tdColS = { value: null }
  uniforms.tdNRS = { value: null }
  uniforms.tdSlot = { value: g.layers.map((_, k) => (maps ? -1 : k)) }
  uniforms.tdSmallOnly = { value: 0 }
  uniforms.tdRes = { value: 1024 }
  uniforms.tdOn = { value: Array.from({ length: L }, () => 0) }
  uniforms.tdDebug = { value: 0 }
  Object.assign(uniforms, bakeUniforms(THREE, bake ?? { rings: [], res: 0, near: 0, far: 0, cliff: 0, band: 0, budget: 0 }))
  const R = bake?.rings.length ?? 0

  // One layer's read: its map and its normal map, on the top plane or on all three, at the warped
  // point with the unwarped point's gradients, so the mip is the plain tiling's.
  const read = [
    'vec2 tdPlane(vec3 v, vec3 sg, int i) { if (i == 0) return vec2(v.z * sg.x, v.y); if (i == 1) return vec2(v.x * sg.y, v.z); return vec2(-v.x * sg.z, v.y); }',
    'void tdAdd(int i, float wt, bool sm, float L, vec3 Q, vec3 Dx, vec3 Dy, vec3 sg, vec3 n, float st, inout vec3 alb, inout vec3 nrm) {',
    '  vec2 uv = tdPlane(Q, sg, i), dx = tdPlane(Dx, sg, i), dy = tdPlane(Dy, sg, i);',
    '  alb += (sm ? textureGrad(tdColS, vec3(uv, L), dx, dy) : textureGrad(tdCol, vec3(uv, L), dx, dy)).rgb * wt;',
    '  vec3 t = vec3((sm ? textureGrad(tdNRS, vec3(uv, L), dx, dy) : textureGrad(tdNR, vec3(uv, L), dx, dy)).rg * 2.0 - 1.0, 0.0);',
    '  t.z = sqrt(max(0.0, 1.0 - dot(t.xy, t.xy))); t.xy *= st;',
    '  if (i == 1) { t.x *= sg.y; t = vec3(t.xy + n.xz, t.z * n.y); nrm += t.xzy * wt; }',
    '  else if (i == 0) { t.x *= sg.x; t = vec3(t.xy + n.zy, t.z * n.x); nrm += t.zyx * wt; }',
    '  else { t.x *= -sg.z; t = vec3(t.xy + n.xy, t.z * n.z); nrm += t.xyz * wt; } }',
  ].join('\n')
  const reads = g.layers.map((l, k) => {
    const sharp = n6(l.sharp ?? 4), st = n6(l.strength ?? 1)
    // the far read is coarse, so it reads the small copy where there is one
    const farC = maps ? 'tdColS' : 'tdCol', farL = maps ? `${k}.0` : 'L'
    const far = g.far && g.far.amount > 0 ? [
      `  { float m = ${n6(g.far.scale)}; vec3 fc = textureGrad(${farC}, vec3(tdPlane(Q, sg, 1) / m, ${farL}), tdPlane(Dx, sg, 1) / m, tdPlane(Dy, sg, 1) / m).rgb;`,
      `    vec3 mean = textureLod(${farC}, vec3(0.5, 0.5, ${farL}), 16.0).rgb;`,
      `    alb *= mix(vec3(1.0), clamp(fc / max(mean, vec3(0.02)), 0.0, 3.0), ${n6(g.far.amount)}); }`,
    ].join('\n') : ''
    return [
      `void tdRead${k}(vec3 p, vec3 n, vec3 dpx, vec3 dpy, vec3 wv, out vec3 alb, out vec3 nrm) {`,
      // the layer's full maps where the near arrays hold them, its small copy where they do not or a bake
      // asks for it
      `  float S = tdSlot[${k}]; bool sm = S < -0.5 || tdSmallOnly > 0.5; float L = sm ? ${k}.0 : S;`,
      `  vec3 Q = (p + wv) / ${n6(l.scale)}, Dx = dpx / ${n6(l.scale)}, Dy = dpy / ${n6(l.scale)};`,
      '  vec3 sg = vec3(n.x < 0.0 ? -1.0 : 1.0, n.y < 0.0 ? -1.0 : 1.0, n.z < 0.0 ? -1.0 : 1.0);',
      l.tri ? `  vec3 a = pow(abs(n), vec3(${sharp})); a /= a.x + a.y + a.z;` : '  vec3 a = vec3(0.0, 1.0, 0.0);',
      '  alb = vec3(0.0); nrm = vec3(0.0);',
      `  tdAdd(1, a.y, sm, L, Q, Dx, Dy, sg, n, ${st}, alb, nrm);`,
      l.tri ? `  if (a.x > 0.001) tdAdd(0, a.x, sm, L, Q, Dx, Dy, sg, n, ${st}, alb, nrm);\n  if (a.z > 0.001) tdAdd(2, a.z, sm, L, Q, Dx, Dy, sg, n, ${st}, alb, nrm);` : '',
      far,
      `  if (tdOn[${k}] < 0.5) alb = vec3(0.5);`,
      '  nrm = normalize(nrm); }',
    ].filter(Boolean).join('\n')
  })

  // The weights: each layer's coarse mask (its carried rules from the vertices, height and slope per
  // pixel), its noise at the warped point through its edge, composed; then each read, the height
  // blend, and the sums.
  const masks = g.layers.map((_, k) => [
    `float tdV${k} = twCoarse${k}(tdP, tdSlope, ${slots.masks[k] !== undefined ? value(slots.masks[k]!) : '1.0'});`,
    `float tdM${k} = 0.0; vec3 tdWv${k} = vec3(0.0);`,
    `if (!twNone${k}(tdV${k})) { tdWv${k} = twWarp${k}(tdP); tdM${k} = twAll${k}(tdV${k}) ? 1.0 : twMask${k}(tdP, tdV${k}, tdWv${k}); }`,
  ].join(' '))
  const composed = g.compose === 'normalise' || g.compose === 'sharpened'
    ? [
      ...g.layers.map((_, k) => `float tdW${k} = ${g.compose === 'sharpened' ? `pow(tdM${k}, 4.0)` : `tdM${k}`};`),
      `float tdSum = ${g.layers.map((_, k) => `tdW${k}`).join(' + ')};`,
      ...g.layers.map((_, k) => `tdW${k} /= tdSum;`),
    ]
    : g.layers.map((_, k) => `float tdW${k} = tdM${k}${g.layers.slice(k + 1).map((_, j) => ` * (1.0 - tdM${k + 1 + j})`).join('')};`)
  const blended = g.heightBlend && g.heightBlend.amount > 0 ? [
    `float tdHi = -10.0;`,
    ...g.layers.map((_, k) => `float tdS${k} = tdW${k} > 0.01 ? tdW${k} + ${n6(g.heightBlend!.amount)} * dot(tdAlb${k}, vec3(0.2126, 0.7152, 0.0722)) : -10.0; tdHi = max(tdHi, tdS${k});`),
    `tdHi -= ${n6(g.heightBlend.depth)};`,
    ...g.layers.map((_, k) => `tdS${k} = max(tdS${k} - tdHi, 0.0);`),
    `float tdBs = ${g.layers.map((_, k) => `tdS${k}`).join(' + ')};`,
    ...g.layers.map((_, k) => `tdW${k} = tdS${k} / tdBs;`),
  ] : []
  // The baked rings (Baked rings): how much of the fragment they give, tdVt, their albedo and normal,
  // and which ring the finest read was. None in a view but the rings', and none on a cliff.
  const baked = R ? [
    'float tdVt = 0.0, tdRingAt = -1.0; vec3 tdBC = vec3(0.0), tdBN = tdGeo;',
    `if ((tdDebug < 0.5 || tdDebug > 10.5) && tdGeo.y >= ${n6(bake!.cliff)}) {`,
    `  tdVt = smoothstep(${n6(bake!.near)}, ${n6(bake!.far)}, distance(cameraPosition, tdP));`,
    '  if (tdVt > 0.0) { float tdCover; tdBC = tdRings(tdP.xz, tdDx, tdDy, tdCover, tdBN, tdRingAt); tdVt *= tdCover; }',
    '}',
  ] : ['float tdVt = 0.0, tdRingAt = -1.0; vec3 tdBC = vec3(0.0), tdBN = tdGeo;']
  const colours = [
    'vec3 tdP = vDressWorld;',
    'vec3 tdGeo = inverseTransformDirection(normalize(vNormal), viewMatrix);',
    'float tdSlope = 1.0 - tdGeo.y;',
    'vec3 tdDx = dFdx(tdP), tdDy = dFdy(tdP);',
    A ? `vec4 tdVal[${A}]; tdValues(tdP.xz, tdVal);` : '',
    'vec3 tdC = vec3(0.0); tdN = tdGeo;',
    ...baked,
    // Live: every layer worked out, wherever the rings do not give the whole fragment.
    'if (tdVt < 0.999 || tdDebug > 0.5) {',
    ...masks,
    ...composed,
    ...g.layers.map((_, k) => `vec3 tdAlb${k} = vec3(0.0), tdNrm${k} = tdGeo; if (tdW${k} > 0.01) tdRead${k}(tdP, tdGeo, tdDx, tdDy, tdWv${k}, tdAlb${k}, tdNrm${k});`),
    ...blended,
    `tdC = ${g.layers.map((_, k) => `tdAlb${k} * tdW${k}`).join(' + ')};`,
    `tdN = normalize(${g.layers.map((_, k) => `tdNrm${k} * tdW${k}`).join(' + ')});`,
    ...surfaces.filter(name => f.surfaces[name].colour).map((name, i) => `float tdS${L + i} = ${sharpen(value(slots.surfaces[name]), f.surfaces[name].edge)}; tdC = mix(tdC, ${rgb(f.surfaces[name].colour!)}, tdS${L + i});`),
    // The views (Views): what the fragment is drawn as instead of lit, kept in tdDbg.
    'if (tdDebug > 0.5) {',
    '  float tdRelief = 0.35 + 0.65 * max(dot(tdGeo, normalize(vec3(0.45, 0.8, 0.4))), 0.0);',
    `  int tdTop = 0; float tdTopW = tdW0;`,
    ...g.layers.slice(1).map((_, j) => `  if (tdW${j + 1} > tdTopW) { tdTop = ${j + 1}; tdTopW = tdW${j + 1}; }`),
    `  vec3 tdTopWv = ${g.layers.map((_, k) => `tdTop == ${k} ? tdWv${k} : `).join('')}vec3(0.0);`,
    `  float tdTopScale = ${g.layers.map((l, k) => `tdTop == ${k} ? ${n6(l.scale)} : `).join('')}1.0;`,
    `  if (tdDebug < 2.5) tdDbg = (${g.layers.map((_, k) => `${pal(k, L)} * tdW${k}`).join(' + ')}) * tdRelief;`,
    '  else if (tdDebug < 3.5) tdDbg = 0.5 + 0.5 * clamp(tdTopWv / 30.0, -1.0, 1.0);',
    '  else if (tdDebug < 4.5) { float l = clamp(log2(max(length(tdDx.xz), length(tdDy.xz)) / tdTopScale * tdRes) / 8.0, 0.0, 1.0);',
    '    tdDbg = clamp(vec3(1.5 - abs(4.0 * l - 3.0), 1.5 - abs(4.0 * l - 2.0), 1.5 - abs(4.0 * l - 1.0)), 0.0, 1.0) * tdRelief; }',
    '  else if (tdDebug < 5.5) tdDbg = tdC;',
    '  else if (tdDebug < 6.5) tdDbg = tdN * 0.5 + 0.5;',
    `  else if (tdDebug < 7.5) tdDbg = (${slots.biomes.length ? slots.biomes.map((s, j) => `${pal(j, slots.biomes.length)} * ${value(s)}`).join(' + ') : 'vec3(0.5)'}) * tdRelief;`,
    '  else if (tdDebug < 8.5) tdDbg = vec3(tdSlope) * tdRelief;',
    // what a bake writes: the albedo as c^(1/2.2), and the normal as n·0.5 + 0.5
    '  else if (tdDebug < 9.5) tdDbg = pow(max(tdC, vec3(0.0)), vec3(1.0 / 2.2));',
    '  else if (tdDebug < 10.5) tdDbg = tdN * 0.5 + 0.5;',
    // the rings: live grey, and the finest ring read green, blue, orange, red…, by how much of the
    // fragment the rings give
    `  else { vec3 rc = ${R ? Array.from({ length: R }, (_, i) => `tdRingAt < ${i}.5 ? ${pal(i, R)} : `).join('') : ''}vec3(0.55);`,
    '    tdDbg = mix(vec3(0.55), rc, tdRingAt < 0.0 ? 0.0 : tdVt) * tdRelief; }',
    '}',
    '}',
    'if (tdVt > 0.0 && tdDebug < 0.5) { tdC = mix(tdC, tdBC, tdVt); tdN = normalize(mix(tdN, tdBN, tdVt)); }',
    'diffuseColor.rgb = tdC;',
  ]
  // A point's read of the rings: each ring from the finest, faded out over its last `band` of side
  // before its finished square ends, the rest left to the next; `cover` how much they give in all.
  const rings = R ? [
    'uniform highp sampler2DArray tdRing;',
    `uniform vec4 tdRingA[${R}];`, `uniform vec4 tdRingV[${R}];`, `uniform float tdRingS[${R}];`,
    'vec3 tdRings(vec2 xz, vec3 dpx, vec3 dpy, out float cover, out vec3 n, out float at) {',
    '  float rem = 1.0; vec3 acc = vec3(0.0), nacc = vec3(0.0); at = -1.0;',
    `  for (int i = 0; i < ${R}; i++) {`,
    '    if (rem < 0.001) break;',
    '    vec2 rel = xz - tdRingA[i].xy; vec4 v = tdRingV[i];',
    '    float e = min(min(rel.x - v.x, v.z - rel.x), min(rel.y - v.y, v.w - rel.y));',
    `    float f = clamp(e / (tdRingS[i] * ${n6(bake!.band)}), 0.0, 1.0);`,
    '    if (f <= 0.0) continue;',
    '    vec2 uv = vec2(rel.x, -rel.y) / tdRingS[i] + tdRingA[i].zw, ga = vec2(dpx.x, -dpx.z) / tdRingS[i], gb = vec2(dpy.x, -dpy.z) / tdRingS[i];',
    '    vec3 c = pow(textureGrad(tdRing, vec3(uv, float(2 * i)), ga, gb).rgb, vec3(2.2));',
    '    vec3 rn = textureGrad(tdRing, vec3(uv, float(2 * i + 1)), ga, gb).xyz * 2.0 - 1.0;',
    '    float a = f * rem; acc += c * a; nacc += rn * a; rem -= a;',
    '    if (at < 0.0) at = float(i);',
    '  }',
    '  cover = 1.0 - rem;',
    '  n = cover > 0.0 ? normalize(nacc) : vec3(0.0, 1.0, 0.0);',
    '  return cover > 0.0 ? acc / cover : vec3(0.0); }',
  ] : []
  // What the ground carries at a point (What the ground carries): the finest ring drawn whose square
  // holds it, `tdValRing[k]` its grid's corner, cell and N (N below 0 for a ring not drawn), its four
  // grid points round the point blended.
  const values = A ? [
    'uniform highp sampler2DArray tdVals;', `uniform vec4 tdValRing[${meshRings}];`,
    `void tdValues(vec2 xz, out vec4 v[${A}]) {`,
    `  for (int a = 0; a < ${A}; a++) v[a] = vec4(0.0);`,
    `  for (int k = 0; k < ${meshRings}; k++) {`,
    '    vec4 r = tdValRing[k];',
    '    if (r.w < 0.0) continue;',
    '    vec2 g = (xz - r.xy) / r.z;',
    '    if (g.x < 0.0 || g.y < 0.0 || g.x > r.w || g.y > r.w) continue;',
    '    g = min(g, vec2(r.w - 0.0001));',
    '    ivec2 i = ivec2(floor(g)); vec2 f = g - vec2(i);',
    `    for (int a = 0; a < ${A}; a++) {`,
    `      int L = k * ${A} + a;`,
    '      vec4 v00 = texelFetch(tdVals, ivec3(i, L), 0), v10 = texelFetch(tdVals, ivec3(i.x + 1, i.y, L), 0);',
    '      vec4 v01 = texelFetch(tdVals, ivec3(i.x, i.y + 1, L), 0), v11 = texelFetch(tdVals, ivec3(i.x + 1, i.y + 1, L), 0);',
    '      v[a] = mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);',
    '    }',
    '    return;',
    '  } }',
  ] : []
  // A bake (`terrain3d.bake.ts`): each vertex put by its ground point onto the tile in hand, after
  // whatever else has placed it, so a bent ground bakes flat.
  const bakeVertex = R ? [
    'uniform float tdBakeOn; uniform vec4 tdBakeRect;',
  ] : []
  const lines = (list: string[]) => list.filter(Boolean).join('\n')
  return {
    uniforms,
    vertex: {
      common: lines(bakeVertex),
      ...(R ? { fog_vertex: 'if (tdBakeOn > 0.5) gl_Position = vec4((position.x - tdBakeRect.x) / tdBakeRect.z, (tdBakeRect.y - position.z) / tdBakeRect.w, 0.0, 1.0);' } : {}),
    },
    fragment: {
      common: lines([
        ...values,
        'uniform highp sampler2DArray tdCol;', 'uniform highp sampler2DArray tdNR;', 'uniform float tdRes;', `uniform float tdOn[${L}];`,
        'uniform highp sampler2DArray tdColS;', 'uniform highp sampler2DArray tdNRS;', `uniform float tdSlot[${L}];`, 'uniform float tdSmallOnly;',
        'vec3 tdN;', 'uniform float tdDebug;', 'vec3 tdDbg = vec3(0.0);',
        NOISE, glsl(g), read, ...reads, ...rings,
      ]),
      color_fragment: lines(colours),
      normal_fragment_maps: 'normal = normalize((viewMatrix * vec4(tdN, 0.0)).xyz);',
      // a view is drawn as it is: no light, no fog, only the output's colour space
      fog_fragment: 'if (tdDebug > 0.5) gl_FragColor = linearToOutputTexel(vec4(tdDbg, 1.0));',
    },
  }
}
// A place prepared ahead of the camera (Prepared places): its point, the land and centres its rings
// are built for, and those rings; whether the camera has arrived, whether the rings have swapped in,
// and whether the place is done.
type Place = {
  at: number[]; land: Land | undefined; versions: number[]; centres: number[][]; builds: Build[]
  arrived: boolean; swapped: boolean; done: boolean
}
// A rebuild: its builds, and the place it takes them from, which it builds whole.
type Job = { land: Land; versions: number[]; builds: Build[]; total: number; done: number; from: Place | undefined }

export type Ground = NonNullable<ReturnType<typeof terrain3d>['ground']>

export function terrain3d() {
  let settings = ''
  let layout: Layout | undefined
  let field: Field | undefined
  let seen: { parts: unknown[]; text: string } | undefined
  let asked: string | undefined
  // The material of the field's look as it now is, what its vertices carry, and the keys it was made
  // for; a material replaced while a ring still draws with it waits in `retired` until none does.
  let material: THREE.MeshStandardMaterial | undefined
  let slots: Slots | undefined
  let looks = '', carries = ''
  const retired = new Set<THREE.Material>()
  let shown: (Shown | undefined)[] = []
  let job: Job | undefined
  let scene: THREE.Scene | undefined
  // The ground layers' maps still on their way (one count for the whole set), and the texture arrays
  // they were last drawn into (Ground layers).
  let waiting = 0
  let stock: Stock | undefined
  // Near maps: the settings, the layers the ground round the camera hits, most first, as last worked
  // out, where and on what land, and whether an answer is on its way.
  let maps: Maps | undefined
  let wanted: number[] | undefined
  let focused: { x: number; z: number; land: Land } | undefined
  let asking = false
  // What the ground carries, for the look of the material now made.
  let values: Values | undefined
  // The place in hand (Prepared places), and whether the rings are on the scene: false only until a
  // scene that preloads has its first place done.
  let place: Place | undefined
  let onScene = false
  // The workers (Workers): none until the first ring is asked for, and none at all where the page has
  // no `Worker`. Each ring asked of one is in flight under its id, with the worker building it, until
  // its arrays come back; `away` holds every build still in flight. `sent` is the land the workers hold.
  let pool: { worker: Worker; asked: number }[] | undefined
  const flying = new Map<number, { b: Build; on: { worker: Worker; asked: number } }>()
  const away = new WeakSet<Build>()
  // Each task in flight under its id: what to call with its output, and the worker running it.
  const tasks = new Map<number, { done: (out: unknown) => void; on: { worker: Worker; asked: number } }>()
  let ids = 0
  let sent: { land: Land; versions: string } | undefined
  // The baked rings (Baked rings): none without `bake` or a renderer; the settings they were made for;
  // and the land and stroke versions their bake is of.
  let bakes: Baker | undefined
  let bakeKey = ''
  let bakeOf: { land: Land; versions: string } | undefined
  let bakeSettings: BakeSettings | undefined
  // three and the renderer, as render3d last handed them.
  let page3: typeof import('three') | undefined
  let renderer: THREE.WebGLRenderer | undefined

  // Disposes every retired material no ring draws with.
  const retire = () => {
    for (const m of retired) {
      if (shown.some(b => b?.mesh.material === m)) continue
      const v = m.userData.terrain3dValues as Values | undefined
      if (v && v !== values) v.tex.dispose()
      m.dispose()
      retired.delete(m)
    }
  }

  // Whether `f` holds other content than the field last seen: its top-level values are swapped
  // whenever the loader refills it, and a swap for the same content changes nothing.
  const changed = (f: Field) => {
    const parts = Object.values(f)
    if (f === field && seen && seen.parts.length === parts.length && seen.parts.every((p, i) => p === parts[i])) return false
    const text = JSON.stringify(f)
    const same = seen?.text === text
    field = f
    seen = { parts, text }
    return !same
  }

  const drop = (b: Shown | undefined) => {
    if (!b) return
    scene?.remove(b.mesh)
    b.mesh.geometry.dispose()
  }

  const me = {
    land: undefined as Land | undefined,
    ground: undefined as undefined | {
      height(x: number, z: number): number; raw(x: number, z: number): number; depth(x: number, z: number): number
      at(x: number, z: number): ReturnType<Land['analyse']>; cover(x: number, z: number): number
      spray(x: number, z: number): string | false | undefined; mark(x: number, z: number): number | undefined
      ramp(rule: Rule, x: number, z: number): number; rules: Land['rules']; edits(): ReturnType<Land['edits']>
      ray(origin: number[], dir: number[]): number[] | undefined; mix: Land['mix']; layers: Land['layers']; rings(): number[]; shown(): boolean
      prepare(x: number, z: number): void; prepared(): number[] | undefined; unprepare(): void
      task(url: string, input: unknown): Promise<unknown> | undefined
    },
    rings: [] as { at: number[]; half: number; cell: number; mesh: THREE.Mesh }[],
    building: () => (job ? { done: job.done, total: job.total } : undefined),
    shown: () => onScene,
    prepare(x: number, z: number) {
      if (place) abandon(place.builds)
      place = { at: [x, z], land: undefined, versions: [], centres: [], builds: [], arrived: false, swapped: false, done: false }
    },
    prepared: () => (place ? { at: place.at, done: place.done } : undefined),
    unprepare() {
      if (place) abandon(place.builds)
      place = undefined
    },
    // The module at `url`'s `task(ground, input)` run on the land in the least busy worker, its output
    // handed back; undefined where there are no workers (Workers).
    task(url: string, input: unknown): Promise<unknown> | undefined {
      if (!me.land || !layout || !threads()) return undefined
      sync()
      const on = pool!.reduce((a, p) => (p.asked < a.asked ? p : a))
      const id = ++ids
      on.asked++
      return new Promise(done => {
        tasks.set(id, { done, on })
        on.worker.postMessage({ type: 'task', id, url, input })
      })
    },

    // A frame of the baked rings (Baked rings): they follow ground point (x, z) and bake what of them
    // `meshes`, drawn with this ground's material, cover, `cover` the square [x0, z0, x1, z1] they draw.
    // The plugin calls it with its own rings; a plugin drawing terrain3d's rings itself calls it with
    // its own. Nothing without `bake`, a renderer, or while a mesh still draws with an old material.
    bake(meshes: THREE.Mesh[], x: number, z: number, cover: number[]) {
      const b = bakeSettings
      if (!b || !renderer || !page3 || !material || !me.land || meshes.some(m => m.material !== material)) return
      bakes ??= baker(page3, renderer, b)
      const versions = JSON.stringify(me.land.edits().layers.map(e => e.version))
      if (!bakeOf || bakeOf.land !== me.land || bakeOf.versions !== versions) {
        bakes.reset()
        bakeOf = { land: me.land, versions }
      }
      const u = material.userData.terrain3d as Record<string, THREE.IUniform>
      // a ring whose texel is as wide as a small copy's bakes from the small copies (Near maps)
      const fine = maps ? Math.min(...me.land.field.ground.layers.map(l => l.scale)) / maps.small : Infinity
      bakes.update(meshes, x, z, cover, u, waiting === 0 && (u.tdOn.value as number[]).every(v => v === 1), fine)
    },
    // The near maps follow ground point (x, z) (Near maps). The plugin calls it with the camera's point;
    // a plugin drawing terrain3d's rings itself calls it with its own.
    focus(x: number, z: number) { focus(x, z) },
    // The rings drawn, for what the ground carries (What the ground carries): each ring k drawn, middle C,
    // and the values its build carried where it is new; every ring not listed is not drawn.
    carry(list: { k: number; C: number[]; grid?: Float32Array }[]) {
      const v = values
      if (!v || !layout) return
      const { c0, rings } = layout
      const drawn = new Set(list.map(e => e.k))
      v.ring.forEach((r, k) => { if (!drawn.has(k)) r.w = -1 })
      const data = v.tex.image.data as Float32Array
      let moved = false
      for (const e of list) {
        const r = rings[e.k], N = (2 * r.H) / r.m, row = 4 * (N + 1)
        v.ring[e.k].set((e.C[0] - r.H) * c0, (e.C[1] - r.H) * c0, r.m * c0, N)
        // a build made for another look's values is left out
        if (!e.grid || e.grid.length !== v.A * row * (N + 1)) continue
        for (let a = 0; a < v.A; a++) {
          const layer = e.k * v.A + a
          for (let j = 0; j <= N; j++) data.set(e.grid.subarray((a * (N + 1) + j) * row, (a * (N + 1) + j + 1) * row), ((layer * v.W + j) * v.W) * 4)
          v.tex.addLayerUpdate(layer)
        }
        moved = true
      }
      if (moved) v.tex.needsUpdate = true
    },
    // Each baked ring's side, middle, finished square and tiles left, or undefined with no bake.
    baked: () => bakes?.state(),

    afterTick(plugins: Plugins) {
      const s = plugins.wire.scene.world!.terrain3d as Settings
      if (!s.preload) onScene = true
      page3 = plugins.render3d.THREE as typeof import('three')
      renderer = plugins.render3d.renderer as THREE.WebGLRenderer | undefined
      const key = JSON.stringify([s.rings, s.shadowReach, s.seabed])
      if (key !== settings) {
        layout = layoutOf(s.rings)
        settings = key
        if (job) abandon(job.builds)
        job = undefined
        for (const b of shown) drop(b)
        shown = []
        me.rings = []
        if (place) place.land = undefined
      }
      const bk = JSON.stringify([s.bake ?? null, s.rings, s.maps ?? null])
      if (bk !== bakeKey) {
        if (s.bake) checkBake(s.bake, layout!)
        if (s.maps) checkMaps(s.maps)
        maps = s.maps
        bakes?.close()
        bakes = undefined
        bakeOf = undefined
        bakeKey = bk
        bakeSettings = s.bake
      }
      const f = plugins.loader.get(s.field) as Field | undefined
      if (!f) {
        if (asked !== s.field) { asked = s.field; plugins.loader.load(s.field) }
        return
      }
      const { THREE: three, scene: on, camera } = plugins.render3d as { THREE: typeof import('three'); scene: THREE.Scene; camera?: THREE.PerspectiveCamera }
      scene = on
      const prior = seen?.text
      if (changed(f) || (material && looks !== looked(f) + bakeKey)) remake(f, prior === undefined ? undefined : JSON.parse(prior), three, plugins)
      if (!camera) return
      const x = s.static ? 0 : camera.position.x, z = s.static ? 0 : camera.position.z
      // A scene that preloads prepares the camera's own place first, and shows nothing until it is
      // done; until then the place follows the camera, keeping its rings while their middles stay.
      if (!onScene && (!place || place.at[0] !== x || place.at[1] !== z)) {
        if (place?.land && same(centresOf(x, z)[0], place.centres[0])) place.at = [x, z]
        else me.prepare(x, z)
      }
      // A place is laid out again for a new land, or when a stroke has moved a layer since.
      if (place && (place.land !== me.land || me.land!.edits().layers.some((e, i) => e.version !== place!.versions[i]))) lay(place, s)
      if (job && job.land !== me.land) {
        abandon(job.builds)
        job = undefined
      }
      // Arriving: the camera stands where the place was prepared. The rebuild in hand is let go, and
      // the next takes the place's rings and is built whole: a ring still in a worker is built here in
      // this frame while the land is on the scene, and waited for while it is not.
      if (place && !place.arrived && same(centresOf(x, z)[0], place.centres[0])) {
        const p = place
        p.arrived = true
        if (job) abandon(job.builds.filter(b => !p.builds.includes(b)))
        job = plan(x, z, s, p)
        if (!job) p.swapped = true
        else if (onScene) for (const b of job.builds) if (away.has(b)) here(b, s)
      }
      job ??= plan(x, z, s, undefined)
      const start = performance.now()
      if (job) {
        const j = job
        do { if (!work(j, three, s)) break } while (job === j && (j.from || performance.now() - start < s.budget))
      }
      // The baked rings, round the camera itself, over what the rings drawn cover.
      if (onScene && me.rings.length === layout!.rings.length) {
        const o = me.rings[me.rings.length - 1]
        me.bake(me.rings.map(r => r.mesh), camera.position.x, camera.position.z, [o.at[0] - o.half, o.at[1] - o.half, o.at[0] + o.half, o.at[1] + o.half])
      }
      me.focus(camera.position.x, camera.position.z)
      // The place not yet arrived at gets what is left of the budget.
      if (place && !place.arrived) {
        const p = place
        while (performance.now() - start < s.budget) {
          const b = p.builds.find(b => b.next < b.units.length)
          if (!b) break
          b.units[b.next++]()
        }
      }
      if (place) settle(place, plugins)
    },

    close() {
      job = undefined
      place = undefined
      onScene = false
      for (const p of pool ?? []) p.worker.terminate()
      pool = undefined
      flying.clear()
      tasks.clear()
      sent = undefined
      for (const b of shown) drop(b)
      shown = []
      me.rings = []
      material?.dispose()
      material = undefined
      stock?.dispose()
      stock = undefined
      wanted = undefined
      focused = undefined
      values?.tex.dispose()
      values = undefined
      bakes?.close()
      bakes = undefined
      bakeOf = undefined
      bakeKey = ''
      for (const m of retired) m.dispose()
      retired.clear()
      looks = carries = ''
    },
  }

  // Where each ring's middle stands, in lattice units, for the camera at (x, z).
  function centresOf(x: number, z: number) {
    const { c0, rings } = layout!
    return rings.map(r => [Math.round(x / c0 / r.s) * r.s + 0, Math.round(z / c0 / r.s) * r.s + 0])
  }

  const same = (a: number[] | undefined, b: number[] | undefined) => (!a && !b) || (!!a && !!b && a[0] === b[0] && a[1] === b[1])

  // The place's rings laid out, every one, to be built for the land as it is, off the scene; on a
  // static land, whose rings never move, only while none is drawn.
  function lay(p: Place, s: Settings) {
    const c = centresOf(s.static ? 0 : p.at[0], s.static ? 0 : p.at[1])
    p.land = me.land
    p.versions = me.land!.edits().layers.map(e => e.version)
    p.centres = c
    abandon(p.builds)
    p.builds = s.static && shown.some(Boolean) ? [] : c.map((C, k) => ring(k, C, k > 0 ? c[k - 1] : undefined, s.seabed, s))
    p.arrived = p.swapped = p.done = false
  }

  // Whether a build has every unit run and is not in a worker.
  const built = (b: Build) => !away.has(b) && b.next === b.units.length

  // Ring k, middle C and the finer ring's middle `hole`, to be built: asked of the least busy worker
  // where there are workers, its arrays filled in when they come back; as units of work on the page
  // where there are none.
  function ring(k: number, C: number[], hole: number[] | undefined, seabed: boolean, s: Settings): Build {
    if (!threads()) return buildRing(me.land!, layout!, slots!, k, C, hole, seabed)
    sync()
    const b: Build = {
      k, C, hole, N: 0, x0: 0, z0: 0, vid: new Int32Array(0), hs: new Float64Array(0), seam: new Map(), count: 0,
      pos: new Float32Array(0), nor: new Float32Array(0), grid: new Float32Array(0), index: [], units: [], next: 0,
    }
    const on = pool!.reduce((a, p) => (p.asked < a.asked ? p : a))
    const id = ++ids
    on.asked++
    flying.set(id, { b, on })
    away.add(b)
    on.worker.postMessage({ type: 'ring', id, rings: s.rings, k, C, hole, seabed })
    return b
  }

  // A build still in a worker, built here instead, now; the worker is told to drop it.
  function here(b: Build, s: Settings) {
    abandon([b])
    const f = buildRing(me.land!, layout!, slots!, b.k, b.C, b.hole, s.seabed)
    finish(f)
    Object.assign(b, { pos: f.pos, nor: f.nor, grid: f.grid, index: f.index })
  }

  // The builds of these still in a worker, no longer wanted: each worker is told to drop them.
  function abandon(builds: Build[]) {
    const by = new Map<Worker, number[]>()
    for (const [id, f] of flying) {
      if (!builds.includes(f.b)) continue
      flying.delete(id)
      away.delete(f.b)
      f.on.asked--
      by.set(f.on.worker, [...(by.get(f.on.worker) ?? []), id])
    }
    for (const [worker, list] of by) worker.postMessage({ type: 'drop', ids: list })
  }

  // The workers, made the first time a ring is asked for: as many as the rings, and one fewer than the
  // machine's cores, at least one. False where the page has no `Worker`.
  function threads() {
    if (pool) return pool.length > 0
    if (typeof Worker === 'undefined') {
      pool = []
      return false
    }
    const n = Math.max(1, Math.min(layout!.rings.length, (navigator.hardwareConcurrency ?? 2) - 1))
    pool = Array.from({ length: n }, () => {
      const worker = new Worker(new URL('./terrain3d.worker.ts', import.meta.url), { type: 'module' })
      worker.addEventListener('message', e => {
        const data = e.data as (Arrays & { type: 'ring'; id: number }) | { type: 'task'; id: number; out: unknown }
        if (data.type === 'ring') return took(data)
        const t = tasks.get(data.id)
        if (!t) return
        tasks.delete(data.id)
        t.on.asked--
        t.done(data.out)
      })
      worker.addEventListener('error', e => { throw new Error(`terrain3d's worker failed: ${e.message}`) })
      return { worker, asked: 0 }
    })
    return true
  }

  // The land the workers build on brought up to this client's: its field and every unsaved stroke,
  // sent whenever the land or a layer's version has moved since they were last sent.
  function sync() {
    const l = me.land!
    const versions = JSON.stringify(l.edits().layers.map(e => e.version))
    if (sent && sent.land === l && sent.versions === versions) return
    sent = { land: l, versions }
    const unsaved = (l.field.layers ?? []).map((_, k) => l.unsaved(k))
    for (const p of pool!) p.worker.postMessage({ type: 'land', field: l.field, unsaved })
  }

  // A ring's arrays back from a worker, filled into its build if it is still wanted.
  function took(a: Arrays & { id: number }) {
    const f = flying.get(a.id)
    if (!f) return
    flying.delete(a.id)
    f.on.asked--
    away.delete(f.b)
    Object.assign(f.b, { pos: a.pos, nor: a.nor, grid: a.grid, index: a.index })
  }

  // Whether the place is done: its rings built (swapped in, once arrived at), every map landed or
  // failed, and every plugin `world.terrain3d.mods.ready` names done with its share. Once it is done
  // and arrived at, the rings go on the scene if they are not on it yet, and the place is let go.
  function settle(p: Place, plugins: Plugins) {
    const on = plugins.wire.scene
    provided(on, 'terrain3d', 'ready')
    const whole = p.arrived ? p.swapped : p.builds.every(built)
    p.done = whole && waiting === 0 && modsOf<(plugins: Plugins) => boolean>(on.world!, 'terrain3d', 'ready').every(f => f(plugins))
    if (!p.done || !p.arrived) return
    if (!onScene) {
      onScene = true
      for (const b of shown) if (b) scene?.add(b.mesh)
    }
    place = undefined
  }

  // A new land from the field's new content, and the rings to be built again: those its changed
  // layers reach when nothing but layers, or what of the look no vertex carries, changed; every ring
  // otherwise. A ring that stays is the new land's as it stands. A new look makes a new material,
  // which the rings draw with at once when they carry what it reads, and from the swap otherwise.
  function remake(f: Field, prior: Field | undefined, three: typeof import('three'), plugins: Plugins) {
    const was = me.land
    const l = landFrom(f, was)
    me.land = l
    if (job) abandon(job.builds)
    job = undefined
    const dirty = was && prior && differs(prior, was, l)
    if (dirty) {
      const versions = l.edits().layers.map(e => e.version)
      shown.forEach((b, k) => {
        if (b && b.land === was && !dirty.some(r => reaches(r, k, b.C, b.hole))) shown[k] = { ...b, land: l, versions }
      })
    }
    if (!material || looked(f) + bakeKey !== looks) {
      const s = slotsOf(f)
      const uniforms: Record<string, THREE.IUniform> = {}
      const made = plugins.render3d.dress(new three.MeshStandardMaterial({ roughness: f.ground.roughness ?? 0.9, metalness: 0 }), { surface: look(f, s, three, uniforms, bakeSettings, maps, layout!.rings.length) }) as THREE.MeshStandardMaterial
      bind(f, uniforms, plugins, three, maps)
      // the values the ground carries: kept from the old look when it carried the same, so the rings
      // that stay draw with the new material at once; made anew, and filled as the rings swap in, when not
      const v = valuesFor(three, s)
      if (v) {
        uniforms.tdVals.value = v.tex
        uniforms.tdValRing.value = v.ring
      }
      values = v
      made.userData.terrain3d = uniforms
      made.userData.terrain3dValues = v
      // the layers the ground round the camera hits are worked out again for the new look
      focused = undefined
      wanted = undefined
      if (material) retired.add(material)
      material = made
      slots = s
      looks = looked(f) + bakeKey
      if (carried(f) === carries) for (const b of shown) if (b) b.mesh.material = made
      carries = carried(f)
      retire()
    }
    me.ground = {
      height: (x, z) => me.land!.height(x, z),
      raw: (x, z) => me.land!.raw(x, z),
      depth: (x, z) => me.land!.depth(x, z),
      at: (x, z) => me.land!.analyse(x, z),
      cover: (x, z) => me.land!.paint(x, z).cover,
      spray: (x, z) => me.land!.paint(x, z).spray,
      mark: (x, z) => me.land!.paint(x, z).mark,
      ramp: (rule, x, z) => me.land!.ramp(rule, x, z),
      rules: (list, what) => me.land!.rules(list, what),
      edits: () => me.land!.edits(),
      ray: (origin, dir) => me.land!.ray(origin, dir, (plugins.render3d.camera as THREE.PerspectiveCamera).far),
      mix: (x, z) => me.land!.mix(x, z),
      layers: (x, z) => me.land!.layers(x, z),
      rings: () => layout!.rings.map(r => r.reach),
      task: (url, input) => me.task(url, input),
      shown: () => onScene,
      prepare: (x, z) => me.prepare(x, z),
      prepared: () => place?.at,
      unprepare: () => me.unprepare(),
    }
  }

  // Every ground layer's maps, asked of the loader and, once every one has landed, drawn into the
  // arrays (Near maps): without `maps`, every layer into the near arrays, layer k into slot k; with it,
  // every layer's small copy into the small arrays, and the near arrays' `near` slots left for `reside`
  // to fill with the layers the ground round the camera hits. Each array has its mips built, and then
  // every layer is switched on. A layer with no normal map is drawn flat. With no renderer, as in node,
  // there are no arrays and the layers stay off.
  function bind(f: Field, uniforms: Record<string, THREE.IUniform>, plugins: Plugins, three: typeof import('three'), mp: Maps | undefined) {
    const layers = f.ground.layers
    layers.forEach((l, k) => {
      for (const name of [l.map, l.normal]) {
        if (name !== undefined && plugins.loader.catalogued(name)?.type !== 'texture') throw new Error(`terrain3d ground layer ${k} names ${name}, which is no texture entry of the loader's catalogue`)
      }
    })
    const renderer = plugins.render3d.renderer as THREE.WebGLRenderer | undefined
    if (!renderer) return
    // The loader writes a failure to the console once itself, and the layers stay off.
    waiting++
    Promise.all(layers.map(l => Promise.all([plugins.loader.load(l.map), l.normal ? plugins.loader.load(l.normal) : undefined]))).then(got => {
      const L = layers.length
      const res = Math.max(...got.map(([c]) => ((c as THREE.Texture).image as { width: number }).width))
      // texture arrays are WebGL 2's, which three renders with alone
      const gl = renderer.getContext() as WebGL2RenderingContext
      const target = (size: number, depth: number, srgb: boolean) => {
        const rt = new three.WebGLArrayRenderTarget(size, size, depth, { depthBuffer: false, generateMipmaps: true, minFilter: three.LinearMipmapLinearFilter, magFilter: three.LinearFilter })
        rt.texture.wrapS = rt.texture.wrapT = three.RepeatWrapping
        rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        rt.texture.colorSpace = srgb ? three.SRGBColorSpace : three.NoColorSpace
        renderer.initRenderTarget(rt)
        rt.texture.generateMipmaps = false
        return rt
      }
      const mips = (rt: THREE.WebGLArrayRenderTarget) => {
        renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, (renderer.properties.get(rt.texture) as { __webglTexture: WebGLTexture }).__webglTexture)
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY)
        renderer.state.unbindTexture()
      }
      const near = mp ? Math.min(mp.near, L) : L
      const col = target(res, near, true), nr = target(res, near, false)
      const small = mp ? { col: target(mp.small, L, true), nr: target(mp.small, L, false) } : undefined
      // a map drawn smaller reads its own mips, as the quad's derivatives pick them
      const copy = new three.ShaderMaterial({
        uniforms: { uA: { value: null }, uMode: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D uA; uniform float uMode; varying vec2 vUv; void main() { gl_FragColor = uMode < 0.5 ? vec4(texture2D(uA, vUv).rgb, 1.0) : uMode < 1.5 ? vec4(texture2D(uA, vUv).rg, 0.0, 1.0) : vec4(0.5, 0.5, 0.0, 1.0); }',
        depthTest: false,
        depthWrite: false,
      })
      const quad = new three.Mesh(new three.PlaneGeometry(2, 2), copy)
      quad.frustumCulled = false
      // an orthographic eye: render3d's reversed-depth renderer projects every camera again
      const on = new three.Scene().add(quad), eye = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const put = (tc: THREE.WebGLArrayRenderTarget, tn: THREE.WebGLArrayRenderTarget, slot: number, k: number) => {
        const [c, n] = got[k]
        const was = renderer.getRenderTarget()
        copy.uniforms.uMode.value = 0
        copy.uniforms.uA.value = c
        renderer.setRenderTarget(tc, slot)
        renderer.render(on, eye)
        copy.uniforms.uMode.value = n ? 1 : 2
        copy.uniforms.uA.value = n ?? null
        renderer.setRenderTarget(tn, slot)
        renderer.render(on, eye)
        renderer.setRenderTarget(was)
      }
      const of = layers.map(() => -1), holds = Array.from({ length: near }, () => -1)
      if (small) {
        for (let k = 0; k < L; k++) put(small.col, small.nr, k, k)
        mips(small.col)
        mips(small.nr)
      } else {
        for (let k = 0; k < L; k++) { put(col, nr, k, k); of[k] = k; holds[k] = k }
        mips(col)
        mips(nr)
      }
      stock?.dispose()
      stock = {
        col, nr, small, near, of, holds, uniforms, put, mips,
        dispose() {
          col.dispose()
          nr.dispose()
          small?.col.dispose()
          small?.nr.dispose()
          copy.dispose()
          quad.geometry.dispose()
        },
      }
      uniforms.tdCol.value = col.texture
      uniforms.tdNR.value = nr.texture
      uniforms.tdColS.value = small?.col.texture ?? null
      uniforms.tdNRS.value = small?.nr.texture ?? null
      uniforms.tdSlot.value = of.slice()
      uniforms.tdRes.value = res
      uniforms.tdOn.value = layers.map(() => 1)
      // the layers the ground round the camera hits, if they were worked out before the maps landed
      if (small && wanted) reside(wanted)
    }, () => {}).finally(() => { waiting-- })
  }

  // The near arrays hold the first `near` of `order`, the layers the ground round the camera hits, most
  // first (Near maps): a layer already in a slot keeps it, a slot whose layer is no longer wanted is
  // freed, and each wanted layer not in one has its full maps drawn into a free one. Every layer past
  // the first `near` reads its small copy.
  function reside(order: number[]) {
    wanted = order
    const s = stock
    if (!s?.small) return
    const want = order.slice(0, s.near), keep = new Set(want)
    s.holds.forEach((k, slot) => {
      if (k < 0 || keep.has(k)) return
      s.of[k] = -1
      s.holds[slot] = -1
    })
    let drew = false
    for (const k of want) {
      if (s.of[k] >= 0) continue
      const slot = s.holds.indexOf(-1)
      s.put(s.col, s.nr, slot, k)
      s.of[k] = slot
      s.holds[slot] = k
      drew = true
    }
    if (drew) { s.mips(s.col); s.mips(s.nr) }
    s.uniforms.tdSlot.value = s.of.slice()
  }

  // The layers the ground within `maps.reach` of ground point (x, z) hits, worked out again whenever
  // that point moves a quarter of the reach or the land changes (`terrain3d.present.ts`), in a worker
  // where there are workers, here where there are none; then `reside`. One answer is asked for at a
  // time; a point moved on meanwhile is asked for once it lands.
  function focus(x: number, z: number) {
    const mp = maps, l = me.land
    if (!mp || !l || asking) return
    const snap = mp.reach / 4
    const cx = Math.round(x / snap) * snap + 0, cz = Math.round(z / snap) * snap + 0
    if (focused && focused.x === cx && focused.z === cz && focused.land === l) return
    focused = { x: cx, z: cz, land: l }
    const input: PresentInput = { x: cx, z: cz, reach: mp.reach, step: mp.step, names: l.field.ground.layers.map(g => g.name) }
    const order = (sum: number[]) => sum.map((v, k) => [v, k]).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).map(([, k]) => k)
    const asked = me.task(new URL('./terrain3d.present.ts', import.meta.url).href, input)
    if (!asked) return reside(order(present(l, input)))
    asking = true
    asked.then(sum => {
      asking = false
      if (me.land === l) reside(order(sum as number[]))
    })
  }

  // What the ground carries, for a new look (What the ground carries): the texture array kept while
  // the values a point carries and the rings stay as they were, and made again when they change.
  function valuesFor(three: typeof import('three'), sl: Slots): Values | undefined {
    const { rings } = layout!
    const A = sl.attributes, W = Math.max(...rings.map(r => (2 * r.H) / r.m + 1)), R = rings.length
    if (!A) return undefined
    if (values && values.A === A && values.W === W && values.R === R) return values
    const tex = new three.DataArrayTexture(new Float32Array(W * W * R * A * 4), W, W, R * A)
    tex.format = three.RGBAFormat
    tex.type = three.FloatType
    tex.minFilter = tex.magFilter = three.NearestFilter
    tex.generateMipmaps = false
    tex.needsUpdate = true
    return { tex, A, W, R, ring: rings.map(() => new three.Vector4(0, 0, 1, -1)) }
  }

  // Where the ground of land `b` can differ from land `a`'s, made from the field `prior` held, as
  // rects, when the two fields differ in their layers, and in what of their look no vertex carries,
  // alone: the rect of each layer of either from the first that differs on, since a layer's strokes
  // read the ground the layers before it leave. Undefined when anything else differs. `prior` is the
  // content as it was: the loader refills the parsed field in place, so `a.field` already holds the
  // new one.
  function differs(prior: Field, a: Land, b: Land): number[][] | undefined {
    const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y)
    const fa = prior as Record<string, unknown>, fb = b.field as Record<string, unknown>
    const drawn = ['layers', 'ground', 'surfaces']
    for (const key of new Set([...Object.keys(fa), ...Object.keys(fb)])) if (!drawn.includes(key) && !same(fa[key], fb[key])) return undefined
    if (carried(prior) !== carried(b.field)) return undefined
    const la = prior.layers ?? [], lb = b.field.layers ?? []
    let first = 0
    while (first < Math.max(la.length, lb.length) && same(la[first], lb[first]) && same(a.unsaved(first), b.unsaved(first))) first++
    const rects: number[][] = []
    for (let k = first; k < la.length; k++) rects.push(a.rect(k))
    for (let k = first; k < lb.length; k++) rects.push(b.rect(k))
    return rects
  }

  // The rings the camera at (x, z) wants rebuilt, as a job, or undefined when every ring stands right;
  // a ring place `from` has built for the same middle and hole is taken from it.
  function plan(x: number, z: number, s: Settings, from: Place | undefined): Job | undefined {
    const { rings } = layout!
    const l = me.land!
    const centres = centresOf(x, z)
    const edits = l.edits()
    const versions = edits.layers.map(e => e.version)
    const builds: Build[] = []
    rings.forEach((_, k) => {
      const was = shown[k], C = centres[k], hole = k > 0 ? centres[k - 1] : undefined
      const moved = !was || was.land !== l || was.C[0] !== C[0] || was.C[1] !== C[1] || (hole && (was.hole![0] !== hole[0] || was.hole![1] !== hole[1]))
      const stroked = was && edits.layers.some((e, i) => e.version !== was.versions[i] && reaches(e.rect, k, C, hole))
      if (!moved && !stroked) return
      const ready = from?.builds.find(b => b.k === k && same(b.C, C) && same(b.hole, hole))
      builds.push(ready ?? ring(k, C, hole, s.seabed, s))
    })
    if (!builds.length) return undefined
    // Every build's units still to run, and the swap; a ring in a worker has none here.
    const total = builds.reduce((n, b) => n + b.units.length - b.next, 0) + 1
    return { land: l, versions, builds, total, done: 0, from }
  }

  // Whether a rect reaches the ground ring k draws: its square, less the open hole within a cell of it.
  function reaches(rect: number[], k: number, C: number[], hole: number[] | undefined) {
    const { c0, rings } = layout!
    const r = rings[k], h = r.H * c0, cell = r.m * c0
    const [x0, z0, x1, z1] = [rect[0] - cell, rect[1] - cell, rect[2] + cell, rect[3] + cell]
    if (x1 < (C[0] * c0) - h || x0 > C[0] * c0 + h || z1 < C[1] * c0 - h || z0 > C[1] * c0 + h) return false
    if (!hole) return true
    const hh = rings[k - 1].H * c0, hx = hole[0] * c0, hz = hole[1] * c0
    return !(x0 > hx - hh && x1 < hx + hh && z0 > hz - hh && z1 < hz + hh)
  }

  // One unit of the job: the next unit of a build, or, once every build is whole, the swap. False when
  // there is nothing to do this frame but wait for a worker, or the job has swapped in.
  function work(j: Job, three: typeof import('three'), s: Settings) {
    for (const b of j.builds) {
      if (b.next < b.units.length) {
        j.done++
        b.units[b.next++]()
        return true
      }
    }
    if (!j.builds.every(built)) return false
    j.done++
    swap(j, three, s)
    return false
  }

  function swap(j: Job, three: typeof import('three'), s: Settings) {
    const { c0, rings } = layout!
    for (const b of j.builds) {
      const g = new three.BufferGeometry()
      g.setAttribute('position', new three.BufferAttribute(b.pos, 3))
      g.setAttribute('normal', new three.BufferAttribute(b.nor, 3))
      g.setIndex(new three.BufferAttribute(b.index instanceof Uint32Array ? b.index : Uint32Array.from(b.index), 1))
      g.computeBoundingSphere()
      const was = shown[b.k]
      let mesh: THREE.Mesh
      if (was) {
        mesh = was.mesh
        mesh.geometry.dispose()
        mesh.geometry = g
        mesh.material = material!
      } else {
        mesh = new three.Mesh(g, material)
        mesh.receiveShadow = true
        // Off the scene until a preloading scene's first place is done; `settle` puts it on with the rest.
        if (onScene) scene!.add(mesh)
      }
      mesh.castShadow = rings[b.k].reach <= s.shadowReach
      shown[b.k] = { C: b.C, hole: b.hole, land: j.land, versions: j.versions, mesh }
    }
    const grids = new Map(j.builds.map(b => [b.k, b.grid]))
    me.carry(shown.flatMap((b, k) => (b ? [{ k, C: b.C, grid: grids.get(k) }] : [])))
    if (j.from) j.from.swapped = true
    job = undefined
    me.rings = shown.map((b, k) => ({ at: [b!.C[0] * c0, b!.C[1] * c0], half: rings[k].H * c0, cell: rings[k].m * c0, mesh: b!.mesh }))
    retire()
  }

  return me
}
