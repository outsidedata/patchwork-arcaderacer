// The circuit's look: the road the track plugin makes from the scene's course and seed, built on the
// row's first tick, once cull3d has ticked: each piece runs the whole loop, so it is split into
// cull3d's tiles, and three draws only the tiles in view. The course file's `road` holds every colour
// and size:
//   asphalt        the road, edge to edge.
//   line, lineWidth  the white lines: an edge line just inside each edge, and the centre line, dashed
//                  `dash` [on, off] metres.
//   kerb, kerbWidth, kerbLength, kerbCurve  the kerbs outside each edge where the road turns harder
//                  than `kerbCurve` (1/m), striped in the two colours `kerbLength` metres a stripe.
//   verge          the run-off from the kerb to the wall.
//   finish         { squares, depth }: the chequered line across the road at the start, `squares`
//                  across and two deep in `depth` metres.
//   surface        the texture the road is laid in, in the road's own metres: across it from the
//                  centre line, and along it from the start (each strip carries them as `roadAt`):
//     maps         { colour, normal, roughness }: three catalogue `texture` entries (the normal and
//                  roughness maps `space: 'linear'`, all `wrap: 'repeat'`).
//     tint         how far `asphalt` (or `verge`) takes over the texture's own average colour: 0 the
//                  texture as it is, 1 the colour given with the texture's detail.
//     size         [fine, coarse]: metres a tile covers, sampled at both and mixed.
//     turn         radians the coarse tile is turned, so the two never line up.
//     mix          how much of the coarse tile is in it near the camera.
//     fade         [near, far] metres: the fine tile gives way to the coarse between them.
//     normal       [near, far]: the normal map's strength near and from `fade[1]` on.
//     roughness    the roughness map scaled by it.
//     paint        { grain, normal, roughness }: the lines, the kerbs and the chequer keep their own
//                  colour, darkened and lightened by `grain` of the asphalt's grain, take `normal` of
//                  the asphalt's normal, so they lie in it, and are `roughness` rough.
//     wear         { width, darken, smooth }: the band the cars wear down the middle, about `width`
//                  metres either side of the centre, `darken` darker and `smooth` less rough there.
//     wet          (left out: dry) { darken, roughness, puddles { size, cover, edge, darken,
//                  roughness } }: the whole road `darken` darker and its roughness times `roughness`,
//                  and puddles of about `size` metres over `cover` of it, `edge` soft, `darken` darker
//                  again, `roughness` rough and flat, so lamps and headlights glint in them.
//                  Until all three maps have landed the road is drawn in its colours alone.
// The walls, and everything beyond them, are the land plugin's. Each piece is named `circuit.<piece>`,
// every tile of it so: `asphalt`, `edge` (each edge line), `centre`, `finish`, `kerb` (each side) and
// `verge` (each side).
// The road is drawn at the circuit's own surface, banked as the track plugin says (y − side × slope),
// each layer on it a few centimetres over the one under it, so a line never fights the asphalt.
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { courseOf, trackOf, type Track } from './plugins/track/track.sim.ts'
import { textures } from './plugins/land/land.plugin.ts'

let made: THREE.Object3D[] = []
let built = false

// The road's surface: the asphalt texture laid in the road's own metres, the wear down the middle and,
// on a wet course, the damp and the puddles. `uRoadPaint` is 1 on a painted layer.
const ROAD = {
  vertex: {
    common: 'attribute vec2 roadAt; varying vec2 vRoadAt;',
    begin_vertex: 'vRoadAt = roadAt;',
  },
  fragment: {
    common: `
      varying vec2 vRoadAt;
      uniform sampler2D uRoadColourMap; uniform sampler2D uRoadNormalMap; uniform sampler2D uRoadRoughMap;
      uniform float uRoadOn; uniform float uRoadPaint; uniform float uRoadTint; uniform vec2 uRoadSize;
      uniform float uRoadTurn; uniform float uRoadMix; uniform vec2 uRoadFade; uniform vec2 uRoadNormal;
      uniform float uRoadRough; uniform vec3 uRoadPaintLook; uniform vec3 uRoadWear;
      uniform vec4 uRoadWet; uniform vec4 uRoadPuddle; uniform float uRoadPuddleRough;
      float roadHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float roadValue(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(roadHash(i), roadHash(i + vec2(1.0, 0.0)), f.x), mix(roadHash(i + vec2(0.0, 1.0)), roadHash(i + vec2(1.0)), f.x), f.y);
      }
      float roadNoise(vec2 p) { return roadValue(p) * 0.6 + roadValue(p * 2.3 + 17.0) * 0.3 + roadValue(p * 5.1 + 3.0) * 0.1; }`,
    color_fragment: `
      vec3 roadN = vec3(0.0, 1.0, 0.0);
      float roadR = roughness;
      if (uRoadOn > 0.5) {
        vec3 gn = normalize(inverseTransformDirection(vNormal, viewMatrix));
        // the road's own frame, across and along, from how its metres run over the screen
        vec3 q0 = dFdx(vDressWorld), q1 = dFdy(vDressWorld);
        vec2 st0 = dFdx(vRoadAt), st1 = dFdy(vRoadAt);
        vec3 q1p = cross(q1, gn), q0p = cross(gn, q0);
        vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
        float det = max(dot(T, T), dot(B, B));
        float sc = det == 0.0 ? 0.0 : inversesqrt(det);
        mat3 tbn = mat3(T * sc, B * sc, gn);
        float far = smoothstep(uRoadFade.x, uRoadFade.y, length(vDressWorld - cameraPosition));
        float k = mix(uRoadMix, 1.0, far);
        float strength = mix(uRoadNormal.x, uRoadNormal.y, far);
        vec2 p = vRoadAt;
        float s = sin(uRoadTurn), c = cos(uRoadTurn);
        vec2 b = mat2(c, s, -s, c) * p / uRoadSize.y;
        vec3 col = texture2D(uRoadColourMap, b).rgb;
        vec3 n = texture2D(uRoadNormalMap, b).xyz * 2.0 - 1.0;
        float r = texture2D(uRoadRoughMap, b).g;
        if (k < 0.999) {
          vec2 a = p / uRoadSize.x;
          col = mix(texture2D(uRoadColourMap, a).rgb, col, k);
          n = mix(texture2D(uRoadNormalMap, a).xyz * 2.0 - 1.0, n, k);
          r = mix(texture2D(uRoadRoughMap, a).g, r, k);
        }
        vec3 detail = col / max(textureLod(uRoadColourMap, vec2(0.5), 16.0).rgb, vec3(0.004));
        float grain = dot(detail, vec3(0.2126, 0.7152, 0.0722));
        vec3 albedo = mix(mix(col, diffuseColor.rgb * detail, uRoadTint), diffuseColor.rgb * mix(1.0, grain, uRoadPaintLook.x), uRoadPaint);
        float rough = mix(r * uRoadRough, uRoadPaintLook.z, uRoadPaint);
        float ns = strength * mix(1.0, uRoadPaintLook.y, uRoadPaint);
        float band = exp(-pow(p.x / uRoadWear.x, 2.0)) * (1.0 - uRoadPaint);
        albedo *= 1.0 - uRoadWear.y * band;
        rough *= 1.0 - uRoadWear.z * band;
        if (uRoadWet.x > 0.5) {
          float h = roadNoise(vDressWorld.xz / uRoadPuddle.x);
          float puddle = smoothstep(1.0 - uRoadPuddle.y - uRoadPuddle.z, 1.0 - uRoadPuddle.y + uRoadPuddle.z, h);
          albedo *= (1.0 - uRoadWet.y) * (1.0 - uRoadPuddle.w * puddle);
          rough = mix(rough * uRoadWet.z, uRoadPuddleRough, puddle);
          ns *= 1.0 - puddle;
        }
        diffuseColor.rgb = albedo;
        roadN = normalize(tbn * normalize(vec3(n.xy * ns, max(n.z, 0.001))));
        roadR = rough;
      }`,
    roughnessmap_fragment: `
      if (uRoadOn > 0.5) roughnessFactor = roadR;`,
    normal_fragment_maps: `
      if (uRoadOn > 0.5) normal = normalize((viewMatrix * vec4(roadN, 0.0)).xyz);`,
  },
}

// Points, colours and the road's own metres (across, along) of a strip of triangles.
type Strip = { pos: number[]; col: number[]; at: number[] }

function geometry(T: typeof THREE, s: Strip): THREE.BufferGeometry {
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(s.pos, 3))
  g.setAttribute('color', new T.Float32BufferAttribute(s.col, 3))
  g.setAttribute('roadAt', new T.Float32BufferAttribute(s.at, 2))
  g.computeVertexNormals()
  return g
}

// A strip along the whole loop from `a` to `b` metres right of the centre, raised `lift` and `rise`
// metres at those two edges, in the colour `paint(i)` gives the segment from sample i (none drawn
// where it gives undefined).
function strip(T: typeof THREE, t: Track, a: number, b: number, lift: [number, number], paint: (i: number, s: number) => THREE.Color | undefined): THREE.BufferGeometry {
  const s: Strip = { pos: [], col: [], at: [] }
  const at = (i: number, side: number, up: number) => {
    const k = i % t.n
    const c = Math.cos(t.yaw[k]), sn = Math.sin(t.yaw[k])
    return { p: [t.x[k] - c * side, t.y[k] - side * t.slope[k] + up, t.z[k] + sn * side], m: [side, i * t.step] }
  }
  for (let i = 0; i < t.n; i++) {
    const colour = paint(i, i * t.step)
    if (!colour) continue
    const p0 = at(i, a, lift[0]), p1 = at(i, b, lift[1]), p2 = at(i + 1, a, lift[0]), p3 = at(i + 1, b, lift[1])
    // two triangles wound counter-clockwise seen from above: right × ahead is up
    const quad = a < b ? [p0, p1, p2, p1, p3, p2] : [p0, p2, p1, p1, p2, p3]
    for (const q of quad) {
      s.pos.push(...q.p)
      s.at.push(...q.m)
      s.col.push(colour.r, colour.g, colour.b)
    }
  }
  return geometry(T, s)
}

export function setup() {
  made = []
  built = false
}

export function tick(_row: Row, plugins: Plugins) {
  if (built) return
  built = true
  const { render3d, wire, cull3d } = plugins
  if (!cull3d) throw new Error(`circuit: the scene of the course ${wire.scene.world!.course} does not list cull3d, which splits the road`)
  const T = render3d.THREE as typeof THREE
  const L = courseOf(wire).road
  const t = trackOf(wire)
  const half = t.width / 2
  const colour = (c: string) => new T.Color(c)
  const asphalt = colour(L.asphalt), line = colour(L.line), verge = colour(L.verge)
  const kerbs = (L.kerb as string[]).map(colour)
  const turning = (i: number) => Math.abs(t.curve[i]) > L.kerbCurve

  // the surface every piece shares, its maps bound as they land; each piece says whether it is paint
  const S = L.surface
  const on = { value: 0 }
  const shared: Record<string, THREE.IUniform> = {
    uRoadOn: on, uRoadTint: { value: S.tint }, uRoadSize: { value: new T.Vector2(...(S.size as [number, number])) },
    uRoadTurn: { value: S.turn }, uRoadMix: { value: S.mix }, uRoadFade: { value: new T.Vector2(...(S.fade as [number, number])) },
    uRoadNormal: { value: new T.Vector2(...(S.normal as [number, number])) }, uRoadRough: { value: S.roughness },
    uRoadPaintLook: { value: new T.Vector3(S.paint.grain, S.paint.normal, S.paint.roughness) },
    uRoadWear: { value: new T.Vector3(S.wear.width, S.wear.darken, S.wear.smooth) },
    uRoadWet: { value: S.wet ? new T.Vector4(1, S.wet.darken, S.wet.roughness, 0) : new T.Vector4(0, 0, 1, 0) },
    uRoadPuddle: { value: S.wet ? new T.Vector4(S.wet.puddles.size, S.wet.puddles.cover, S.wet.puddles.edge, S.wet.puddles.darken) : new T.Vector4(1, 0, 0, 0) },
    uRoadPuddleRough: { value: S.wet ? S.wet.puddles.roughness : 0 },
  }
  textures(plugins.loader, { uRoadColourMap: S.maps.colour, uRoadNormalMap: S.maps.normal, uRoadRoughMap: S.maps.roughness }, shared, on)
  const material = (paint: boolean) => render3d.dress(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), {
    surface: { uniforms: { ...shared, uRoadPaint: { value: paint ? 1 : 0 } }, vertex: ROAD.vertex, fragment: ROAD.fragment },
  })

  const pieces: [string, THREE.BufferGeometry, boolean][] = []
  // the road and what lies on it, each layer a little above the last
  pieces.push(['asphalt', strip(T, t, -half, half, [0, 0], () => asphalt), false])
  const edge = half - 0.5
  pieces.push(['edge', strip(T, t, -edge - L.lineWidth, -edge, [0.02, 0.02], () => line), true])
  pieces.push(['edge', strip(T, t, edge, edge + L.lineWidth, [0.02, 0.02], () => line), true])
  const [dashOn, dashOff] = L.dash as [number, number]
  pieces.push(['centre', strip(T, t, -L.lineWidth / 2, L.lineWidth / 2, [0.02, 0.02], (_i, s) => (s % (dashOn + dashOff) < dashOn && s > L.finish.depth * 2 ? line : undefined)), true])
  // the chequered line: a row of squares across the road, two deep
  const sq = t.width / L.finish.squares
  const chequer: Strip = { pos: [], col: [], at: [] }
  const black = colour('#111111'), white = colour('#f4f4f4')
  for (let r = 0; r < 2; r++) for (let q = 0; q < L.finish.squares; q++) {
    const s0 = (r * L.finish.depth) / 2, s1 = ((r + 1) * L.finish.depth) / 2
    const a = -half + q * sq, b = a + sq
    const corner = (s: number, side: number) => {
      const u = s / t.step, k = Math.floor(u)
      const yaw = t.yaw[k], f = u - k
      const x = t.x[k] + (t.x[k + 1] - t.x[k]) * f, y = t.y[k] + (t.y[k + 1] - t.y[k]) * f, z = t.z[k] + (t.z[k + 1] - t.z[k]) * f
      return { p: [x - Math.cos(yaw) * side, y - side * t.slope[k] + 0.03, z + Math.sin(yaw) * side], m: [side, s] }
    }
    const c = (r + q) % 2 ? black : white
    for (const p of [corner(s0, a), corner(s0, b), corner(s1, a), corner(s0, b), corner(s1, b), corner(s1, a)]) {
      chequer.pos.push(...p.p)
      chequer.at.push(...p.m)
      chequer.col.push(c.r, c.g, c.b)
    }
  }
  pieces.push(['finish', geometry(T, chequer), true])
  // kerbs where it turns, and the run-off out to the walls
  const stripe = (_i: number, s: number) => kerbs[Math.floor(s / L.kerbLength) % kerbs.length]
  pieces.push(['kerb', strip(T, t, -half - L.kerbWidth, -half, [0.04, 0.04], (i, s) => (turning(i) ? stripe(i, s) : undefined)), true])
  pieces.push(['kerb', strip(T, t, half, half + L.kerbWidth, [0.04, 0.04], (i, s) => (turning(i) ? stripe(i, s) : undefined)), true])
  pieces.push(['verge', strip(T, t, -t.walls, -half, [0, 0], () => verge), false])
  pieces.push(['verge', strip(T, t, half, t.walls, [0, 0], () => verge), false])

  for (const [piece, geometry, paint] of pieces) {
    const m = material(paint)
    for (const tile of cull3d.split(geometry)) {
      const mesh = new T.Mesh(tile, m)
      mesh.name = `circuit.${piece}`
      mesh.receiveShadow = true
      render3d.scene.add(mesh)
      made.push(mesh)
    }
  }
}

export function remove(plugins: Plugins) {
  for (const m of made) {
    plugins.render3d.scene.remove(m)
    const mesh = m as THREE.Mesh
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  }
  made = []
  built = false
}
