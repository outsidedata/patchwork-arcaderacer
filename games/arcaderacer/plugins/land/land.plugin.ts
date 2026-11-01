// The browser half of land: it draws the country round the circuit, everything but the road's own
// surface (the circuit's look) and the cars (drive). It builds once, the first frame the page holds a
// `scenery` row, from the scene's course file and seed (`landOf` in `land.sim.ts`), and then each frame
// keeps the sun's shadow round the camera. Everything it made goes in `close`. The sky and the air are
// the `air` plugin's.
//
// The course file's `light`:
//   sun        { dir, colour, intensity, shadow, reach }: a directional light from `dir`, its shadow a
//              `shadow`-pixel map over `reach` metres round the camera.
//   sky        { colour, ground, intensity }: a hemisphere light.
//   lit        whether the city's lights are on (dusk or night): windows light, and lamps glow and
//              light the road.
// The course file's `look`, every colour and size:
//   ground     { colours, plain, scale, surface }: the ground's colours, mixed in patches `scale` metres
//              across, and the plain beyond the square; `surface` the texture over them all:
//              flat, steep  { colour, normal, roughness, tint }: two texture sets, three catalogue
//                           `texture` entries each (the normal and roughness maps `space: 'linear'`);
//                           `flat` on ground facing up, `steep` (triplanar, on the world's three planes)
//                           where it faces away from up. `tint` is how far the painted colour (a patch,
//                           the plain's, the skirt's) takes over the set's own average colour: 0 the
//                           texture as it is, 1 the painted colour with the texture's detail.
//              size         [fine, coarse]: metres one tile covers, sampled at both and mixed.
//              turn         radians the coarse tile is turned, so the two never line up.
//              mix          how much of the coarse tile is in the colour near the camera.
//              fade         [near, far] metres: the fine tile gives way to the coarse between them.
//              normal       [near, far]: the normal map's strength near and from `fade[1]` on.
//              roughness    the roughness maps scaled by it.
//              slope        [flat, steep]: the up-component of the ground's normal at and above which
//                           it is all `flat`, and at and below which it is all `steep`.
//              sharp        the power the triplanar weights are raised to: higher, crisper seams.
//              Until every one of the six maps has landed the ground is drawn in its painted colours.
//   skirt      the corridor's ground from a wall out to the country, textured as the ground is.
//   walls      { barrier, height, retaining, retain, rail, railHeight }: the barrier at each edge of
//              the road, `height` tall, growing into a `retaining` wall where the ground beside the
//              road is higher than it, at most `retain` over the road, the bank sloping up from its
//              top to the ground; on a bridge or wherever the road is `clearance` over the ground, a
//              rail `railHeight` tall. `surface`, of the ground's shape, textures them, the tunnels'
//              bores, ceilings and portals and the raised road's deck with them.
//   tunnel     { height, colour, ceiling, lights, every, portal, glow, light? }: the bore of every
//              stretch the road runs under the ground (a `tunnel` or an `underground`), `height` to its
//              ceiling, a light every `every` metres along its ceiling in `lights` × `glow`, and the
//              portal's face at each end. With `light` { intensity, distance, decay }, each of them is
//              a real point light of `lights`, `distance` metres its reach.
//   elevated   { deck, colour, piers, pier }: where the road runs over the ground, a deck `deck` thick
//              under it and a pier `pier` across every `piers` metres down to the ground.
//   water      { colour, opacity }: the sea, at the land's `water.level`.
//   bridge     { colour, towers, tower, leg, out, cable, sag, hangers, beams }: over each `bridge`
//              feature a suspension bridge: towers at the fractions `towers` of its stretch, `tower`
//              over the deck, of legs `leg` across standing `out` beyond the walls, joined by `beams`
//              cross beams; a main cable each side from an anchor at either end over the towers,
//              hanging to `sag` over the deck mid-span, `cable` thick, with a hanger every `hangers`.
//   blocks     the city's buildings. With `model` { model, lots, corners, lods, tints, fit },
//              built of a loader model's whole buildings: each block a ring of them round its edge,
//              a corner lot (one of `corners`, the node `<corner>_<level>`, its square `corner` in
//              its node's extras) at each corner, turned to face both its streets, and each side
//              between them filled with lots (each of `lots`, its street front `width` and `depth`
//              in its node's extras), rolled from the scene's seed and stretched together to fill
//              the side, by no less than `fit[0]` and no more than `fit[1]` of their width (a side
//              that cannot be filled within that stands empty; a block too small for two corner lots
//              across stands empty); and along each of the land's street fronts (land.sim.ts's
//              `frontage`) a corner lot at each end, its cut to the side street, and lots between,
//              each spanning a chord of the front's line so their fronts meet round the road's bends
//              (`stand` lays them all out). Each stands on the lowest ground under its footprint, tinted one
//              of `tints`, drawn at the first of `lods` [{ level, within, cast }] whose `within`
//              metres of the camera it stands (none past the last), casting shadows at a level with
//              `cast`.
//              Otherwise each block is a tower of one mesh, every facade in `colours` (a curtain
//              wall's frame in `frames`), styled by `styles` [punched, curtain, ribbon] weights:
//              windows { floor, width, glass, curtain, lit, litChance, frame } cut into the walls
//              (`floor` and `width` metres a window, `frame` of each round a punched one; when the
//              lights are on `litChance` of them lit), the glass mirroring the sky `reflect` [facing,
//              grazing]; its roof `roof`; `cornice` { height, rise, out, shade } a ledge round each
//              tier's top, `shade` of the facade's colour; `podium` { over, chance, floors, inset,
//              style } a base of `floors` floors under a shaft `inset` in from it; `setback` { above,
//              chance, tiers, shaft, inset } the shaft taking `shaft` of its height and stepped in
//              `inset` for each of `tiers` tiers over it; `round` { over, chance, sides } a round
//              shaft; `piers` { size } at a punched tier's corners; `crown` { chance, height, spire }
//              a pyramid over a curtain wall, `height` of the building, and a spire on `spire` of
//              them; `plant` { colour, units, size, height, mast, mastOver, mastHeight } boxes and
//              masts on a flat roof; `neon` { colours, chance, glow, size } signs on `chance` of the
//              towers, `size` [least, most] tall, on a tower's lowest tier.
//   things     by name, how each scattered thing looks. With `model`, `lods` [{ node, within? }]:
//              each tree is the node of that loader model whose `within` metres of the camera it
//              stands first, the last node beyond them all; a node a metre tall with its foot at the
//              origin, scaled to the
//              thing's size and `girth` [least, most] as wide, sunk `sink` into the ground, tinted
//              one of `leaves`. Every tree is such a model, grown by the library's `trees/trees.py`
//              (`assets/trees/trees.trees.json`). Otherwise `fern` { leaves } and `rock` { colours };
//              any other name with no `model` throws.
//   along      by name: `marker` { height, colour, band } (a post at the road's edge); `lamp`
//              { height, colour, head, glow, light? } (a street lamp leaning over the road, its head
//              glowing; when the lights are on, with `light` { intensity, distance, decay }, every
//              lamp's head a real point light of `head`), or `lamp` { model, node, height, head,
//              light? } (that loader model's node standing at each place, the light `height` metres
//              up it); `sign` { size, lift, frame, face, edge, border, glow } (a road sign on two
//              posts, its `face` toward the cars coming inside a `border` of `edge`, its back and
//              posts `frame`).
// A course with real lamp or tunnel lights holds hundreds of them, more than three lights a program
// by, so its scene lists `lights3d`, which draws every one by clusters; land throws on a scene that
// does not.
// What it draws is drawn only where the camera can see it, by `cull3d`, which every scene with land
// lists before `shipped` (land throws on one that does not): everything it draws many copies of (the
// lots and the trees at their levels, the scattered things, the roadside pieces, the piers, the
// hangers, the tunnel's lights, the neon) is a crowd of cull3d's, each copy handed the GPU only when
// it is in view, or casts a shadow that may fall in it, nearest first; and the ground, the walls, the
// skirt and the towers, each one mesh all round the course, are split into cull3d's tiles, so three
// culls each tile whole. The plain and the sea, a few triangles under everything, and each landmark's
// own meshes, are culled by three as they are.
//   landmarks  by name: `volcano` and `fuji` { colour, snow, snowline, sides } (a cone `width`
//              across, snow above `snowline` of its height); `range` { colour, snow, snowline, sides }
//              (`count` peaks round the middle, `height` and `width` rolled, `spread` either way of
//              `distance`); `lattice` { red, white, bands, deck, legs } (a lattice tower `height`
//              tall, `base` across at its feet, banded, with observation decks at the fractions
//              `deck`); `clock` { stone, roof, face, glow } (a clock tower `height` tall, `width`
//              across, its faces lit); `wheel` { colour, pods, glow } (an observation wheel `height`
//              tall with `spokes` spokes, turning); `dome` { stone, lead, glow } (a domed cathedral
//              `height` tall, `width` across); and for any name { model, node } (that loader
//              model's node at its true size, turned `turn` turns, drawn once the model lands and
//              casting no shadow, standing as it does beyond the sun's shadow round the camera).
// A landmark's numbers beside its look's are on its `landmarks` entry in the course file. Each piece
// it adds to the scene is named `land.<piece>`: `ground`, `plain`, `sea`, `walls`, `skirt`,
// `tunnel.lights`, `piers`, `bridge.tower`, `bridge.cable`, `bridge.hangers`, `things.<name>` (each
// fern or rock), `things.<name>.<node>` (a model's trees at that level), `blocks` (the towers),
// `blocks.<lot>.<node>` (a model's lots of one kind at that level), `neon`, `along.<name>`,
// `landmark.<name>`, and `lamplights` and `tunnel.lamplights`, groups of the real lights; every tile
// of `ground`, `walls`, `skirt` and `blocks` is named as its piece. Nothing it
// draws is touched by a car. Every roll it makes for how a thing looks is seeded from the scene's
// seed, so a course looks the same on every page.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { seeded } from '#engine/engine.ts'
import { courseOf, inside, sample, type Track } from '../track/track.sim.ts'
import { landOf, type Block, type Course, type Land } from './land.sim.ts'
import type { Crowd } from '#plugins/cull3d/cull3d.plugin.ts'

type V = [number, number, number]

// Copies of one thing drawn from a loader model at its levels of detail (the trees of one name, the
// lots of one kind): each copy's matrix and tint, the model's node for each level and how near the
// camera that level is drawn, and once the model has landed, the crowd cull3d draws them by. `label`
// names them in the scene, `land.<label>.<node>`.
type Grove = {
  label: string
  model: string
  levels: { node: string; within: number; cast: boolean }[]
  twoSided: boolean
  tints: THREE.Color[]
  matrices: THREE.Matrix4[]
  grown: boolean
}

// Work that waits for a loader model to land: run once, with the model's scene, the frame it has.
type Later = { model: string; run: (scene: THREE.Object3D) => void }

// Triangles as flat lists of points and colours, made into one geometry.
class Batch {
  pos: number[] = []
  col: number[] = []
  tri(a: V, b: V, c: V, colour: THREE.Color) {
    this.pos.push(...a, ...b, ...c)
    for (let k = 0; k < 3; k++) this.col.push(colour.r, colour.g, colour.b)
  }
  // a four-sided piece: a, b along one edge and c, d along the other, a beside c
  quad(a: V, b: V, c: V, d: V, colour: THREE.Color) {
    this.tri(a, b, c, colour)
    this.tri(b, d, c, colour)
  }
  geometry(T: typeof THREE) {
    const g = new T.BufferGeometry()
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3))
    g.computeVertexNormals()
    return g
  }
}

// Several geometries as one, each laid out as it is.
function merge(T: typeof THREE, parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = []
  for (const p of parts) {
    const flat = p.index ? p.toNonIndexed() : p
    pos.push(...(flat.getAttribute('position').array as Float32Array))
    nor.push(...(flat.getAttribute('normal').array as Float32Array))
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3))
  return g
}

// A point `side` metres right of the centre line at sample i, `up` over the road's surface there.
const at = (t: Track, i: number, side: number, up = 0): V => {
  const k = ((i % t.n) + t.n) % t.n
  return [t.x[k] - Math.cos(t.yaw[k]) * side, t.y[k] - side * t.slope[k] + up, t.z[k] + Math.sin(t.yaw[k]) * side]
}

// The city's walls, a surface render3d dresses the buildings' material with. Each vertex carries its
// facade's `aStyle`: 0 punched windows in a wall, 1 a curtain wall of glass on thin mullions with a
// dark spandrel each floor, 2 ribbons of glass along each floor, 3 no windows at all (a cornice, a
// roof's plant). The glass mirrors the sky by the Fresnel law, the curtain wall most.
const WINDOWS = {
  vertex: {
    common: 'attribute float aStyle; varying float vStyle;',
    begin_vertex: 'vStyle = aStyle;',
  },
  fragment: {
    common: `
      varying float vStyle;
      uniform float uFloor; uniform float uWidth; uniform float uFrame; uniform float uLitChance;
      uniform vec3 uGlass; uniform vec3 uCurtain; uniform vec3 uLit; uniform vec3 uRoof;
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uUnder; uniform vec2 uReflect;`,
    emissivemap_fragment: `
      {
        vec3 wn = inverseTransformDirection(normal, viewMatrix);
        float style = floor(vStyle + 0.5);
        if (wn.y > 0.5) {
          if (style < 2.5) diffuseColor.rgb = uRoof;
        } else if (abs(wn.y) < 0.5 && style < 2.5) {
          bool alongX = abs(wn.z) > abs(wn.x);
          float u = alongX ? vDressWorld.x : vDressWorld.z;
          float across = alongX ? vDressWorld.z : vDressWorld.x;
          vec2 cell = vec2(u / uWidth, vDressWorld.y / uFloor);
          vec2 f = fract(cell);
          // the frame round a window: across, below and above it
          vec3 fr = style < 0.5 ? vec3(uFrame, uFrame * 1.3, uFrame * 0.7) : style < 1.5 ? vec3(0.035, 0.16, 0.03) : vec3(-1.0, 0.34, 0.1);
          float win = step(fr.x, f.x) * step(f.x, 1.0 - fr.x) * step(fr.y, f.y) * step(f.y, 1.0 - fr.z);
          float h = fract(sin(dot(floor(cell) + vec2(floor(across * 0.5), floor(across * 0.13)), vec2(12.9898, 78.233))) * 43758.5453);
          float h2 = fract(h * 31.17 + 0.37);
          vec3 glass = (style > 0.5 && style < 1.5 ? uCurtain : uGlass) * (0.7 + 0.6 * h2);
          // a curtain wall's spandrels are dark glass too, only flatter
          if (style > 0.5 && style < 1.5) diffuseColor.rgb = mix(diffuseColor.rgb, uCurtain * 0.55, 1.0 - win);
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, win);
          roughnessFactor = mix(roughnessFactor, 0.08, win);
          metalnessFactor = mix(metalnessFactor, 0.2, win);
          // the sky in the glass
          vec3 eye = normalize(vDressWorld - cameraPosition);
          vec3 r = reflect(eye, wn);
          vec3 sky = r.y > 0.0 ? mix(uHorizon, uZenith, pow(r.y, 0.6)) : mix(uHorizon, uUnder, min(1.0, -r.y * 4.0));
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-eye, wn), 0.0), 5.0);
          float mirror = style > 0.5 && style < 1.5 ? max(win, 0.6) : win;
          totalEmissiveRadiance += sky * mirror * mix(uReflect.x, uReflect.y, fres);
          totalEmissiveRadiance += uLit * win * step(1.0 - uLitChance, h);
        }
      }`,
  },
}

// Points, normals and colours of triangles, made into one geometry; `extra` per vertex as `aStyle`.
class Shell {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  sty: number[] = []
  // a box `w` × `h` × `d` standing on `y0`, centred on (x, z), turned `yaw`, no bottom face
  box(T: typeof THREE, x: number, y0: number, z: number, w: number, h: number, d: number, yaw: number, c: THREE.Color, style: number) {
    this.add(new T.BoxGeometry(w, h, d).rotateY(yaw).translate(x, y0 + h / 2, z), c, style)
  }
  // any geometry laid where it stands, but for its faces looking straight down
  add(geometry: THREE.BufferGeometry, c: THREE.Color, style: number) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry
    if (g !== geometry) geometry.dispose()
    const p = g.getAttribute('position').array, n = g.getAttribute('normal').array
    for (let k = 0; k < p.length / 3; k++) {
      if (n[k * 3 + 1] < -0.5) continue
      this.pos.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2])
      this.nor.push(n[k * 3], n[k * 3 + 1], n[k * 3 + 2])
      this.col.push(c.r, c.g, c.b)
      this.sty.push(style)
    }
    g.dispose()
  }
  geometry(T: typeof THREE) {
    const g = new T.BufferGeometry()
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3))
    g.setAttribute('aStyle', new T.Float32BufferAttribute(this.sty, 1))
    return g
  }
}

// The uniforms a set of textures is bound to as the loader hands each one over, `on` turned to 1 once
// every one of them has landed. Until then a sampler holds nothing and the surface that reads them
// draws as it would with no textures at all, so nothing is ever sampled black. `maps` is each
// uniform's name and the catalogue entry it takes.
export function textures(loader: Plugins['loader'], maps: Record<string, string>, uniforms: Record<string, THREE.IUniform>, on: THREE.IUniform<number>) {
  const names = Object.entries(maps)
  let landed = 0
  for (const [uniform, entry] of names) {
    uniforms[uniform] = { value: null }
    loader.on(entry, (texture: THREE.Texture) => {
      uniforms[uniform].value = texture
      if (++landed === names.length) on.value = 1
    })
  }
}

// The ground's texture, sampled in world x and z: the course file's `look.ground.surface` (in the
// header). `flat` is laid from straight down; `steep` is laid on the three planes of the world and
// blended by the facing (triplanar), so a bank or a cliff is never stretched. Each is sampled twice,
// once `size[0]` metres a tile and once `size[1]` metres turned `turn`, and the two mixed; the fine one
// gives way to the coarse one between `fade[0]` and `fade[1]` metres from the camera, and the normal's
// strength from `normal[0]` to `normal[1]`. The colour each fragment ends with is the texture's, its
// own average colour (its last mip) moved toward the fragment's painted colour by `tint`, so the
// patches the land paints stay as a tint over it and it never repeats as wallpaper.
const GROUND = {
  common: `
    uniform sampler2D uLandFlatColour; uniform sampler2D uLandFlatNormal; uniform sampler2D uLandFlatRough;
    uniform sampler2D uLandSteepColour; uniform sampler2D uLandSteepNormal; uniform sampler2D uLandSteepRough;
    uniform float uLandOn; uniform float uLandFlatTint; uniform float uLandSteepTint;
    uniform vec2 uLandSize; uniform float uLandTurn; uniform float uLandMix; uniform vec2 uLandFade;
    uniform vec2 uLandNormal; uniform float uLandRough; uniform vec2 uLandSlope; uniform float uLandSharp;
    struct LandTap { vec3 c; vec3 avg; vec3 n; float r; };
    // one set at a point of its plane, the fine and the coarse tile mixed k of the way to the coarse
    LandTap landTap(sampler2D col, sampler2D nor, sampler2D rou, vec2 p, float k, float strength) {
      float s = sin(uLandTurn), c = cos(uLandTurn);
      vec2 b = mat2(c, s, -s, c) * p / uLandSize.y;
      LandTap t;
      t.c = texture2D(col, b).rgb; t.n = texture2D(nor, b).xyz * 2.0 - 1.0; t.r = texture2D(rou, b).g;
      if (k < 0.999) {
        vec2 a = p / uLandSize.x;
        t.c = mix(texture2D(col, a).rgb, t.c, k);
        t.n = mix(texture2D(nor, a).xyz * 2.0 - 1.0, t.n, k);
        t.r = mix(texture2D(rou, a).g, t.r, k);
      }
      t.avg = max(textureLod(col, vec2(0.5), 16.0).rgb, vec3(0.004));
      t.n = normalize(vec3(t.n.xy * strength, max(t.n.z, 0.001)));
      return t;
    }
    vec3 landColour(LandTap t, vec3 painted, float tint) { return mix(t.c, painted * t.c / t.avg, tint); }`,
  color_fragment: `
    vec3 landN = vec3(0.0, 1.0, 0.0);
    float landR = roughness;
    if (uLandOn > 0.5) {
      vec3 gn = normalize(inverseTransformDirection(vNormal, viewMatrix)) * (gl_FrontFacing ? 1.0 : -1.0);
      vec3 p = vDressWorld;
      float far = smoothstep(uLandFade.x, uLandFade.y, length(p - cameraPosition));
      float k = mix(uLandMix, 1.0, far);
      float strength = mix(uLandNormal.x, uLandNormal.y, far);
      float steep = 1.0 - smoothstep(uLandSlope.y, uLandSlope.x, gn.y);
      vec3 colour = vec3(0.0); vec3 n = vec3(0.0); float r = 0.0;
      if (steep < 0.999) {
        LandTap t = landTap(uLandFlatColour, uLandFlatNormal, uLandFlatRough, p.xz, k, strength);
        float w = 1.0 - steep;
        colour += landColour(t, diffuseColor.rgb, uLandFlatTint) * w;
        n += normalize(vec3(t.n.x + gn.x, abs(t.n.z) * gn.y, t.n.y + gn.z)) * w;
        r += t.r * w;
      }
      if (steep > 0.001) {
        vec3 w = pow(abs(gn), vec3(uLandSharp));
        w /= (w.x + w.y + w.z);
        vec3 sg = sign(gn);
        vec3 nx = vec3(0.0), ny = vec3(0.0), nz = vec3(0.0); vec3 cx = vec3(0.0), cy = vec3(0.0), cz = vec3(0.0); float rx = 0.0, ry = 0.0, rz = 0.0;
        if (w.x > 0.01) {
          LandTap t = landTap(uLandSteepColour, uLandSteepNormal, uLandSteepRough, vec2(p.z * sg.x, p.y), k, strength);
          t.n.x *= sg.x;
          nx = vec3(t.n.xy + gn.zy, abs(t.n.z) * gn.x).zyx; cx = landColour(t, diffuseColor.rgb, uLandSteepTint); rx = t.r;
        }
        if (w.y > 0.01) {
          LandTap t = landTap(uLandSteepColour, uLandSteepNormal, uLandSteepRough, vec2(p.x * sg.y, p.z), k, strength);
          t.n.x *= sg.y;
          ny = vec3(t.n.xy + gn.xz, abs(t.n.z) * gn.y).xzy; cy = landColour(t, diffuseColor.rgb, uLandSteepTint); ry = t.r;
        }
        if (w.z > 0.01) {
          LandTap t = landTap(uLandSteepColour, uLandSteepNormal, uLandSteepRough, vec2(-p.x * sg.z, p.y), k, strength);
          t.n.x *= -sg.z;
          nz = vec3(t.n.xy + gn.xy, abs(t.n.z) * gn.z); cz = landColour(t, diffuseColor.rgb, uLandSteepTint); rz = t.r;
        }
        colour += (cx * w.x + cy * w.y + cz * w.z) * steep;
        n += normalize(nx * w.x + ny * w.y + nz * w.z + gn * 0.0001) * steep;
        r += (rx * w.x + ry * w.y + rz * w.z) * steep;
      }
      diffuseColor.rgb = colour;
      landN = normalize(n);
      landR = r * uLandRough;
    }`,
  roughnessmap_fragment: `
    if (uLandOn > 0.5) roughnessFactor = landR;`,
  normal_fragment_maps: `
    if (uLandOn > 0.5) normal = normalize((viewMatrix * vec4(landN, 0.0)).xyz);`,
}

// What a model's lot says of its size on its node: a lot its street front `width` and its `depth`, a
// corner lot its square `corner`.
export type Size = { width?: number; depth?: number; corner?: number }

// A model city's lots, by name, each where it stands, its turn, how far it is stretched along its
// front and its tint: round every block a corner lot at each corner and lots between, and along every
// street front a corner lot at each end and lots between. `Bl` is the course's `look.blocks`, `size`
// a lot's size by its name; every roll is from the scene's seed. A lot's local x runs along its front
// and its local z out of it, toward the street; it stands on the lowest ground under its footprint.
export function stand(lay: Land, Bl: any, seed: number, size: (name: string) => Size) {
  const lots = (Bl.lots as string[]).map(name => ({ name, width: size(name).width!, depth: size(name).depth! }))
  const corners = (Bl.corners as string[]).map(name => ({ name, size: size(name).corner! }))
  const S = Math.max(...corners.map(c => c.size))
  const most = Math.max(...lots.map(l => l.width))
  const [fit0, fit1] = Bl.fit as [number, number]
  const roll = seeded(seed ^ 0xb10c)
  const choose = <X>(list: X[]) => list[Math.floor(roll() * list.length) % list.length]
  const placed = new Map<string, { at: [number, number, number]; yaw: number; stretch: number; tint: string }[]>()
  // a lot stands on the lowest ground under its footprint's corners and its origin
  const put = (name: string, x: number, z: number, yaw: number, stretch: number, footprint: number[][]) => {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    const y = Math.min(lay.height(x, z), ...footprint.map(([fx, fz]) => lay.height(x + fx * c + fz * s, z - fx * s + fz * c)))
    if (!placed.has(name)) placed.set(name, [])
    placed.get(name)!.push({ at: [x, y, z], yaw, stretch, tint: choose(Bl.tints as string[]) })
  }
  // the lots for a side `length` long: rolled until the next roll could overrun it, then the one that
  // leaves the stretch nearest 1, or none when that stretch is better; none when no run fills it
  // within `fit`
  const run = (length: number) => {
    const seq: typeof lots = []
    let total = 0
    while (length - total > most) {
      const lot = choose(lots)
      seq.push(lot)
      total += lot.width
    }
    const best = lots.reduce((a, b) => (Math.abs(length - total - b.width) < Math.abs(length - total - a.width) ? b : a))
    const without = total > 0 ? Math.abs(Math.log(length / total)) : Infinity
    if (Math.abs(Math.log(length / (total + best.width))) < without) {
      seq.push(best)
      total += best.width
    }
    const stretch = length / total
    return stretch >= fit0 && stretch <= fit1 ? { seq, stretch } : undefined
  }
  const square = (side: number) => [[0, 0], [side, 0], [0, -side], [side, -side]]
  for (const b of lay.blocks) {
    if (Math.min(b.w, b.d) < 2 * S) continue
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2
    // the four corners, each turned to face its two streets
    for (const [cx, cz, yaw] of [[x0, z1, 0], [x1, z1, Math.PI / 2], [x1, z0, Math.PI], [x0, z0, -Math.PI / 2]]) {
      const corner = choose(corners)
      put(corner.name, cx, cz, yaw, 1, square(corner.size))
    }
    // the four sides between them, each lot's front on the block's edge
    for (const [ax, az, bx, bz, yaw] of [[x0 + S, z1, x1 - S, z1, 0], [x1, z1 - S, x1, z0 + S, Math.PI / 2], [x1 - S, z0, x0 + S, z0, Math.PI], [x0, z0 + S, x0, z1 - S, -Math.PI / 2]]) {
      const length = Math.hypot(bx - ax, bz - az)
      const filled = run(length)
      if (!filled) continue
      let along = 0
      for (const lot of filled.seq) {
        const w = lot.width * filled.stretch
        const f = (along + w / 2) / length
        put(lot.name, ax + (bx - ax) * f, az + (bz - az) * f, yaw, filled.stretch, [[-w / 2, 0], [w / 2, 0], [-w / 2, -lot.depth], [w / 2, -lot.depth]])
        along += w
      }
    }
  }
  // the street fronts along the road: a corner lot at each end of a run (its cut to the side street),
  // and between them lots each spanning a chord of the run's line, so their fronts meet round its bends
  for (const front of lay.fronts) {
    const pts = front.points
    const cum = [0]
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]))
    const total = cum[cum.length - 1]
    const point = (a: number): [number, number] => {
      let k = 1
      while (k < pts.length - 1 && cum[k] < a) k++
      const f = Math.max(0, Math.min(1, (a - cum[k - 1]) / (cum[k] - cum[k - 1] || 1)))
      return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * f, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * f]
    }
    // the chord from a to b along the line: its middle, its turn (local +x along it, the front to the
    // road) and its length
    const chord = (a: number, b: number) => {
      const [ax, az] = point(a), [bx, bz] = point(b)
      return { x: (ax + bx) / 2, z: (az + bz) / 2, yaw: Math.atan2(-(bz - az), bx - ax), length: Math.hypot(bx - ax, bz - az) }
    }
    const first = choose(corners), last = choose(corners)
    if (total < first.size + last.size) continue
    put(first.name, ...point(0), chord(0, first.size).yaw, 1, square(first.size))
    put(last.name, ...point(total), chord(total - last.size, total).yaw + Math.PI / 2, 1, square(last.size))
    const filled = run(total - first.size - last.size)
    if (!filled) continue
    let along = first.size
    for (const lot of filled.seq) {
      const w = lot.width * filled.stretch
      const c = chord(along, along + w)
      put(lot.name, c.x, c.z, c.yaw, c.length / lot.width, [[-c.length / 2, 0], [c.length / 2, 0], [-c.length / 2, -lot.depth], [c.length / 2, -lot.depth]])
      along += w
    }
  }
  return placed
}

export function land() {
  let built: {
    objects: THREE.Object3D[]
    crowds: Crowd[]
    sun: THREE.DirectionalLight
    toward: THREE.Vector3
    reach: number
    wheel?: THREE.Object3D
    groves: Grove[]
    later: Later[]
    crowd: (levels: { meshes: THREE.InstancedMesh[]; within: number; cast: boolean; name: string }[], matrices: THREE.Matrix4[], colours?: THREE.Color[]) => void
  } | undefined

  function build(p: Plugins) {
    const { render3d, wire, cull3d } = p
    if (!cull3d) throw new Error(`land: the scene of the course ${wire.scene.world!.course} does not list cull3d, which draws what land places`)
    const T = render3d.THREE as typeof THREE
    const course = courseOf(wire) as Course & { light: any; look: any; landmarks?: any[] }
    const seed = wire.scene.world!.seed as number
    const lay: Land = landOf(course, seed)
    const t = lay.track
    const Lk = course.look, Lt = course.light, Ld = course.land
    const lit = !!Lt.lit
    const groves: Grove[] = []
    const later: Later[] = []
    // a loader model's mesh parts under one of its nodes, each with its own copy of its geometry and
    // material (which `close` disposes, leaving the loader's model whole), the material dressed
    const parts = (scene: THREE.Object3D, model: string, name: string) => {
      const node = scene.getObjectByName(name)
      if (!node) throw new Error(`land: ${model} has no node ${name}`)
      const out: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = []
      node.traverse(o => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) out.push({ geometry: mesh.geometry.clone(), material: render3d.dress((mesh.material as THREE.Material).clone()) })
      })
      return { node, parts: out }
    }
    const whenLanded = (model: string, run: (scene: THREE.Object3D) => void) => {
      p.loader.load(model).catch(() => {})
      later.push({ model, run })
    }
    const objects: THREE.Object3D[] = []
    const colour = (c: string | number) => new T.Color(c)
    const die = seeded(seed ^ 0x10c4)
    const pick = <X>(list: X[]) => list[Math.floor(die() * list.length) % list.length]
    const add = <O extends THREE.Object3D>(o: O, cast = false, receive = true, name?: string): O => {
      if (name) o.name = `land.${name}`
      o.traverse(m => { (m as THREE.Mesh).castShadow = cast; (m as THREE.Mesh).receiveShadow = receive })
      render3d.scene.add(o)
      objects.push(o)
      return o
    }
    // Copies drawn by cull3d: each level's meshes added to the scene, `cast` casting shadows, each named
    // `land.<name>`, every copy at `matrices`, tinted `colours`.
    const crowds: Crowd[] = []
    const crowd = (levels: { meshes: THREE.InstancedMesh[]; within: number; cast: boolean; name: string }[], matrices: THREE.Matrix4[], colours?: THREE.Color[]) => {
      for (const l of levels) for (const m of l.meshes) add(m, l.cast, true, l.name)
      crowds.push(cull3d.crowd({ matrices, colours, levels: levels.map(l => ({ meshes: l.meshes, within: l.within })) }))
    }
    // One crowd at one level, drawn as near or far as it stands: `geometry` in `material` at every one
    // of `matrices`.
    const copies = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], matrices: THREE.Matrix4[], cast: boolean, name: string, colours?: THREE.Color[]) =>
      crowd([{ meshes: [new T.InstancedMesh(geometry, material, 0)], within: Infinity, cast, name }], matrices, colours)
    // A surface all round the course cut into cull3d's tiles, each its own mesh of `material`, named
    // `land.<name>`.
    const tiled = (geometry: THREE.BufferGeometry, material: THREE.Material, cast: boolean, name: string) => {
      for (const piece of cull3d.split(geometry)) add(new T.Mesh(piece, material), cast, true, name)
    }
    const painted = (opts: THREE.MeshStandardMaterialParameters = {}) => render3d.dress(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...opts }))
    const plain = (c: string, opts: THREE.MeshStandardMaterialParameters = {}) => render3d.dress(new T.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...opts }))
    const glowing = (c: string, glow: number) => render3d.dress(new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: glow, roughness: 0.6 }))
    // a real point light of `colour` at each place, `light` { intensity, distance, decay }, in one group
    const lamps = (places: THREE.Vector3[], colour: string, light: { intensity: number; distance: number; decay: number }, name: string) => {
      if (!p.lights3d) throw new Error(`land: the course ${wire.scene.world!.course} gives real ${name}, and the scene does not list lights3d to draw them`)
      const group = new T.Group()
      for (const at of places) {
        const l = new T.PointLight(colour, light.intensity, light.distance, light.decay)
        l.position.copy(at)
        group.add(l)
      }
      add(group, false, false, name)
    }

    // ---------------------------------------------------------------- light and sky
    const sky = new T.HemisphereLight(Lt.sky.colour, Lt.sky.ground, Lt.sky.intensity)
    const sun = new T.DirectionalLight(Lt.sun.colour, Lt.sun.intensity)
    const toward = new T.Vector3().fromArray(Lt.sun.dir).normalize()
    const reach = Lt.sun.reach
    sun.castShadow = true
    sun.shadow.mapSize.set(Lt.sun.shadow, Lt.sun.shadow)
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -reach
    sc.right = sc.top = reach
    sc.near = 1
    sc.far = reach * 6
    sc.updateProjectionMatrix()
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.04
    add(sky)
    add(sun)
    add(sun.target)

    // ---------------------------------------------------------------- the ground
    const G = Lk.ground
    // a textured surface (`look.ground.surface`, `look.walls.surface`), its maps bound as they land:
    // the ground, the skirt and the plain share the ground's, and the walls have their own
    const surfaced = (S: any) => {
      const on = { value: 0 }
      const uniforms: Record<string, THREE.IUniform> = {
        uLandOn: on, uLandFlatTint: { value: S.flat.tint }, uLandSteepTint: { value: S.steep.tint },
        uLandSize: { value: new T.Vector2(...(S.size as [number, number])) }, uLandTurn: { value: S.turn }, uLandMix: { value: S.mix },
        uLandFade: { value: new T.Vector2(...(S.fade as [number, number])) }, uLandNormal: { value: new T.Vector2(...(S.normal as [number, number])) },
        uLandRough: { value: S.roughness }, uLandSlope: { value: new T.Vector2(...(S.slope as [number, number])) }, uLandSharp: { value: S.sharp },
      }
      textures(p.loader, {
        uLandFlatColour: S.flat.colour, uLandFlatNormal: S.flat.normal, uLandFlatRough: S.flat.roughness,
        uLandSteepColour: S.steep.colour, uLandSteepNormal: S.steep.normal, uLandSteepRough: S.steep.roughness,
      }, uniforms, on)
      return (material: THREE.MeshStandardMaterial) => render3d.dress(material, { surface: { uniforms, fragment: GROUND } })
    }
    const earth = surfaced(G.surface)
    const size = Ld.size, cell = Ld.cell, N = Math.round(size / cell)
    const x0 = lay.middle[0] - size / 2, z0 = lay.middle[1] - size / 2
    const heights = new Float32Array((N + 1) * (N + 1)), cuts = new Uint8Array((N + 1) * (N + 1))
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = x0 + i * cell, z = z0 + j * cell
      heights[j * (N + 1) + i] = lay.height(x, z)
      cuts[j * (N + 1) + i] = lay.cut(x, z) ? 1 : 0
    }
    const patches = G.colours.map(colour)
    const patch = (x: number, z: number) => {
      const u = Math.sin(x / G.scale) * Math.cos(z / (G.scale * 1.3)) + Math.sin((x + z) / (G.scale * 2.7))
      const k = ((u + 2) / 4) * (patches.length - 1)
      const a = Math.floor(k), f = k - a
      return patches[Math.min(a, patches.length - 1)].clone().lerp(patches[Math.min(a + 1, patches.length - 1)], f)
    }
    const ground = new Batch()
    const vertex = (i: number, j: number): V => [x0 + i * cell, heights[j * (N + 1) + i], z0 + j * cell]
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * (N + 1) + i
      if (cuts[k] || cuts[k + 1] || cuts[k + N + 1] || cuts[k + N + 2]) continue
      const c = patch(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell)
      // wound so each faces up: +x then +z is counter-clockwise from above
      ground.tri(vertex(i, j), vertex(i, j + 1), vertex(i + 1, j), c)
      ground.tri(vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1), c)
    }
    tiled(ground.geometry(T), earth(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })), false, 'ground')
    // the plain beyond the square, at the level the country settles to at its rim: a ring round the
    // square and never over it, so no road below level 0 is covered
    const ring = new T.Shape()
    const far = size * 6, near = size / 2
    ring.moveTo(-far, -far).lineTo(far, -far).lineTo(far, far).lineTo(-far, far).lineTo(-far, -far)
    const hole = new T.Path()
    hole.moveTo(-near, -near).lineTo(-near, near).lineTo(near, near).lineTo(near, -near).lineTo(-near, -near)
    ring.holes.push(hole)
    const plainMesh = new T.Mesh(new T.ShapeGeometry(ring).rotateX(-Math.PI / 2), earth(new T.MeshStandardMaterial({ color: G.plain, roughness: 1, metalness: 0 })))
    plainMesh.position.set(lay.middle[0], 0, lay.middle[1])
    add(plainMesh, false, true, 'plain')
    if (Ld.water && Lk.water) {
      const sea = new T.Mesh(
        new T.PlaneGeometry(size * 1.2, size * 1.2).rotateX(-Math.PI / 2),
        render3d.dress(new T.MeshStandardMaterial({ color: Lk.water.colour, roughness: 0.12, metalness: 0.1, transparent: true, opacity: Lk.water.opacity })),
      )
      sea.position.set(lay.middle[0], Ld.water.level, lay.middle[1])
      add(sea, false, true, 'sea')
    }

    // ---------------------------------------------------------------- the corridor
    const W = Lk.walls, Tu = Lk.tunnel, E = Lk.elevated
    const outer = t.walls + Ld.skirt, beyond = outer + cell * 1.5
    const groundAt = (i: number, side: number) => { const p = at(t, i, side); return lay.height(p[0], p[2]) }
    const bored = (i: number) => t.features.some(f => (f.kind === 'tunnel' || f.kind === 'underground') && inside(f, i * t.step, t.length) === 1)
    const over = (i: number, side: number) => at(t, i, side)[1] - groundAt(i, side) > Ld.clearance
    const solid = new Batch(), shade = new Batch(), lights: { p: V; yaw: number }[] = []
    const barrier = colour(W.barrier), retaining = colour(W.retaining), rail = colour(W.rail), skirt = colour(Lk.skirt)
    const bore = colour(Tu.colour), ceiling = colour(Tu.ceiling), portal = colour(Tu.portal), deck = colour(E.colour)
    for (let i = 0; i < t.n; i++) {
      const j = i + 1
      const inBore = bored(i) && bored(j)
      for (const way of [-1, 1]) {
        const e = way * t.walls, o = way * outer, b = way * beyond
        if (inBore) {
          // the bore's wall up to its ceiling
          solid.quad(at(t, i, e), at(t, j, e), at(t, i, e, Tu.height), at(t, j, e, Tu.height), bore)
          continue
        }
        if (over(i, o) && over(j, o)) {
          // a rail, and the deck's edge down to its underside
          solid.quad(at(t, i, e), at(t, j, e), at(t, i, e, W.railHeight), at(t, j, e, W.railHeight), rail)
          solid.quad(at(t, i, e), at(t, j, e), at(t, i, e, -E.deck), at(t, j, e, -E.deck), deck)
          continue
        }
        // the wall, grown into a retaining wall where the ground beside it is higher, and the skirt
        // from its top out to the country
        const top = (k: number) => Math.max(at(t, k, e)[1] + W.height, Math.min(groundAt(k, o), at(t, k, e)[1] + W.retain))
        const ti = top(i), tj = top(j)
        const high = ti - at(t, i, e)[1] > W.height + 0.3
        const pi = at(t, i, e), pj = at(t, j, e)
        solid.quad(pi, pj, [pi[0], ti, pi[2]], [pj[0], tj, pj[2]], high ? retaining : barrier)
        const oi = at(t, i, o), oj = at(t, j, o), bi = at(t, i, b), bj = at(t, j, b)
        shade.quad([pi[0], ti, pi[2]], [pj[0], tj, pj[2]], [oi[0], groundAt(i, o), oi[2]], [oj[0], groundAt(j, o), oj[2]], skirt)
        shade.quad([oi[0], groundAt(i, o), oi[2]], [oj[0], groundAt(j, o), oj[2]], [bi[0], groundAt(i, b), bi[2]], [bj[0], groundAt(j, b), bj[2]], skirt)
      }
      if (inBore) {
        // the ceiling, the lid of ground over it, and a light along it
        solid.quad(at(t, i, -t.walls, Tu.height), at(t, j, -t.walls, Tu.height), at(t, i, t.walls, Tu.height), at(t, j, t.walls, Tu.height), ceiling)
        const lid = (k: number) => Math.max(groundAt(k, -outer), groundAt(k, outer), at(t, k, 0, Tu.height + 1.5)[1])
        const across = [-beyond, -outer, outer, beyond]
        const lidY = (k: number, side: number) => (Math.abs(side) > outer ? Math.max(groundAt(k, side), lid(k) - (Math.abs(side) - outer)) : lid(k))
        for (let q = 0; q < across.length - 1; q++) {
          const a = across[q], c = across[q + 1]
          const ai = at(t, i, a), ci = at(t, i, c), aj = at(t, j, a), cj = at(t, j, c)
          shade.quad([ai[0], lidY(i, a), ai[2]], [aj[0], lidY(j, a), aj[2]], [ci[0], lidY(i, c), ci[2]], [cj[0], lidY(j, c), cj[2]], skirt)
        }
        // one on each `every` metres: the sample whose stretch of them is not its last sample's
        if (Math.floor((i * t.step) / Tu.every) !== Math.floor(((i - 1) * t.step) / Tu.every)) lights.push({ p: at(t, i, 0, Tu.height - 0.15), yaw: t.yaw[i % t.n] })
      } else if (over(i, outer) && over(j, outer)) {
        // the deck's underside
        solid.quad(at(t, i, -t.walls, -E.deck), at(t, j, -t.walls, -E.deck), at(t, i, t.walls, -E.deck), at(t, j, t.walls, -E.deck), deck)
      }
      // a portal where the road goes under or comes out: its face from the road up to the lid
      if (bored(i) !== bored(j)) {
        const k = bored(i) ? i : j
        const lidTop = Math.max(groundAt(k, -outer), groundAt(k, outer), at(t, k, 0, Tu.height + 1.5)[1]) + 0.5
        const face = (a: number, c: number, from: number) => {
          const pa = at(t, k, a, from), pc = at(t, k, c, from)
          solid.quad(pa, pc, [pa[0], lidTop, pa[2]], [pc[0], lidTop, pc[2]], portal)
        }
        face(-beyond, -t.walls, -1)
        face(t.walls, beyond, -1)
        face(-t.walls, t.walls, Tu.height)
      }
    }
    tiled(solid.geometry(T), surfaced(W.surface)(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: T.DoubleSide })), true, 'walls')
    tiled(shade.geometry(T), earth(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })), true, 'skirt')
    if (lights.length) {
      const up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1)
      copies(new T.BoxGeometry(t.width * 0.5, 0.12, 0.8), glowing(Tu.lights, Tu.glow), lights.map(l => new T.Matrix4().compose(new T.Vector3(...l.p), new T.Quaternion().setFromAxisAngle(up, l.yaw), one)), false, 'tunnel.lights')
      if (Tu.light) lamps(lights.map(l => new T.Vector3(...l.p)), Tu.lights, Tu.light, 'tunnel.lamplights')
    }
    // piers under the raised road, down to the ground
    {
      const piers: THREE.Matrix4[] = []
      for (let s = 0; s < t.length; s += E.piers) {
        const i = Math.round(s / t.step)
        if (!over(i, outer)) continue
        const c = at(t, i, 0, -E.deck), g = groundAt(i, 0)
        const tall = c[1] - g
        if (tall < 1) continue
        const m = new T.Matrix4().compose(new T.Vector3(c[0], g + tall / 2, c[2]), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), t.yaw[i % t.n]), new T.Vector3(t.width * 0.6, tall, E.pier))
        piers.push(m)
      }
      if (piers.length) copies(new T.BoxGeometry(1, 1, 1), plain(E.colour), piers, true, 'piers')
    }

    // ---------------------------------------------------------------- the bridge
    for (const f of t.features.filter(f => f.kind === 'bridge')) {
      const B = Lk.bridge
      if (!B) continue
      const white = plain(B.colour, { roughness: 0.5 })
      const side = t.walls + B.out
      const span = f.s1 - f.s0
      const towers = (B.towers as number[]).map(a => f.s0 + span * a)
      const deckY = (s: number) => sample(t, s).y
      const yawAt = (s: number) => sample(t, s).yaw
      const point = (s: number, sd: number, y: number): V => { const c = sample(t, s); return [c.x - Math.cos(c.yaw) * sd, y, c.z + Math.sin(c.yaw) * sd] }
      const box = (centre: V, w: number, h: number, d: number, yaw: number) => {
        const m = new T.Mesh(new T.BoxGeometry(w, h, d), white)
        m.position.set(...centre)
        m.rotation.y = yaw
        return add(m, true, true, 'bridge.tower')
      }
      for (const s of towers) {
        const top = deckY(s) + B.tower
        for (const way of [-1, 1]) {
          const foot = point(s, way * side, 0)
          const bottom = lay.height(foot[0], foot[2])
          box([foot[0], (bottom + top) / 2, foot[2]], B.leg, top - bottom, B.leg, yawAt(s))
        }
        for (let k = 1; k <= B.beams; k++) {
          const y = deckY(s) + (B.tower * k) / B.beams - B.leg
          const c = point(s, 0, y)
          // a box turned by the road's heading has its x across the road: the beam spans the legs
          box(c, side * 2 + B.leg, B.leg * 0.8, B.leg * 0.8, yawAt(s))
        }
      }
      // the main cables: up from an anchor to the first tower, hanging between, down to an anchor
      const anchor0 = f.s0 - f.ramp * 0.6, anchor1 = f.s1 + f.ramp * 0.6
      const [ta, tb] = [towers[0], towers[towers.length - 1]]
      const cableY = (s: number) => {
        const topA = deckY(ta) + B.tower, topB = deckY(tb) + B.tower
        if (s <= ta) { const k = (s - anchor0) / (ta - anchor0); return deckY(anchor0) + 1 + (topA - deckY(anchor0) - 1) * k * k }
        if (s >= tb) { const k = (anchor1 - s) / (anchor1 - tb); return deckY(anchor1) + 1 + (topB - deckY(anchor1) - 1) * k * k }
        const k = (s - ta) / (tb - ta)
        const low = deckY((ta + tb) / 2) + B.sag
        return topA + (topB - topA) * k - ((topA + topB) / 2 - low) * 4 * k * (1 - k)
      }
      for (const way of [-1, 1]) {
        const pts: THREE.Vector3[] = []
        for (let s = anchor0; s <= anchor1; s += 6) pts.push(new T.Vector3(...point(s, way * side, cableY(s))))
        add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), pts.length * 2, B.cable, 6, false), white), true, true, 'bridge.cable')
        const hangers: THREE.Matrix4[] = []
        for (let s = anchor0 + B.hangers; s < anchor1; s += B.hangers) {
          const bottom = deckY(s) + W.railHeight, topY = cableY(s)
          if (topY - bottom < 1) continue
          const c = point(s, way * side, (bottom + topY) / 2)
          hangers.push(new T.Matrix4().compose(new T.Vector3(...c), new T.Quaternion(), new T.Vector3(1, topY - bottom, 1)))
        }
        copies(new T.CylinderGeometry(B.cable * 0.35, B.cable * 0.35, 1, 4), white, hangers, false, 'bridge.hangers')
      }
    }

    // ---------------------------------------------------------------- what is scattered
    const things = Lk.things ?? {}
    const yAxis = new T.Vector3(0, 1, 0)
    for (const [name, list] of Object.entries(lay.things)) {
      if (!list.length) continue
      const look = things[name]
      if (look.model) {
        // a model's trees: each its matrix and tint now, drawn once the model lands; a tree's cards
        // are seen from both sides
        const tints = list.map(() => colour(pick(look.leaves)))
        const matrices = list.map(th => {
          const tall = th.size, wide = th.size * (look.girth[0] + (look.girth[1] - look.girth[0]) * die())
          return new T.Matrix4().compose(new T.Vector3(th.x, th.y - look.sink, th.z), new T.Quaternion().setFromAxisAngle(yAxis, th.yaw), new T.Vector3(wide, tall, wide))
        })
        groves.push({
          label: `things.${name}`, model: look.model, twoSided: true,
          levels: (look.lods as { node: string; within?: number }[]).map(l => ({ node: l.node, within: l.within ?? Infinity, cast: true })),
          tints, matrices, grown: false,
        })
        p.loader.load(look.model).catch(() => {})
        continue
      }
      const placeAll = (geometry: THREE.BufferGeometry, material: THREE.Material, scale: (k: number) => THREE.Vector3, tint?: (k: number) => THREE.Color, cast = true) => {
        const matrices = list.map((th, k) => new T.Matrix4().compose(new T.Vector3(th.x, th.y - 0.2, th.z), new T.Quaternion().setFromAxisAngle(yAxis, th.yaw), scale(k)))
        copies(geometry, material, matrices, cast, `things.${name}`, tint && list.map((_, k) => tint(k)))
      }
      const tints = list.map(() => colour(pick(look.leaves ?? look.colours)))
      if (name === 'fern') {
        const fronds: THREE.BufferGeometry[] = []
        for (let k = 0; k < 6; k++) fronds.push(new T.PlaneGeometry(0.35, 1.1).translate(0, 0.55, 0).rotateX(-0.9).rotateY((k / 6) * Math.PI * 2))
        placeAll(merge(T, fronds), plain('#ffffff', { side: T.DoubleSide, roughness: 1 }), k => new T.Vector3(list[k].size, list[k].size * 0.8, list[k].size), k => tints[k], false)
      } else if (name === 'rock') {
        placeAll(new T.DodecahedronGeometry(0.5, 0), plain('#ffffff', { roughness: 1, flatShading: true }), k => new T.Vector3(list[k].size * 1.2, list[k].size * 0.7, list[k].size), k => tints[k])
      } else {
        throw new Error(`land: things.${name} has no model, and only fern and rock are drawn without one`)
      }
    }

    // ---------------------------------------------------------------- the city
    if (lay.blocks.length && Lk.blocks?.model) {
      // whole buildings of a model, stood round each block once the model has landed: their widths
      // are the model's, carried on its nodes
      const Bl = Lk.blocks
      whenLanded(Bl.model, scene => {
        const level0 = Bl.lods[0].level
        const placed = stand(lay, Bl, seed, name => {
          const node = scene.getObjectByName(`${name}_${level0}`)
          if (!node) throw new Error(`land: ${Bl.model} has no node ${name}_${level0}`)
          return node.userData as Size
        })
        for (const [name, list] of placed) {
          groves.push({
            label: `blocks.${name}`, model: Bl.model, twoSided: false,
            levels: (Bl.lods as { level: string; within?: number; cast?: boolean }[]).map(l => ({ node: `${name}_${l.level}`, within: l.within ?? Infinity, cast: !!l.cast })),
            tints: list.map(l => colour(l.tint)),
            matrices: list.map(l => new T.Matrix4().compose(new T.Vector3(...l.at), new T.Quaternion().setFromAxisAngle(yAxis, l.yaw), new T.Vector3(l.stretch, 1, 1))),
            grown: false,
          })
        }
      })
    } else if (lay.blocks.length && Lk.blocks) {
      const Bl = Lk.blocks, Wn = Bl.windows
      const R = Bl.reflect
      const material = render3d.dress(new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.8, metalness: 0.05 }), {
        surface: {
          uniforms: {
            uFloor: { value: Wn.floor }, uWidth: { value: Wn.width }, uFrame: { value: Wn.frame },
            uLitChance: { value: lit ? Wn.litChance : 0 }, uGlass: { value: colour(Wn.glass) }, uCurtain: { value: colour(Wn.curtain) },
            uLit: { value: colour(Wn.lit).multiplyScalar(lit ? 1.6 : 0) }, uRoof: { value: colour(Bl.roof) },
            uZenith: { value: colour(Lt.dome.top) }, uHorizon: { value: colour(Lt.sky.colour) }, uUnder: { value: colour(Lt.sky.ground) },
            uReflect: { value: new T.Vector2(R[0], R[1]) },
          },
          vertex: WINDOWS.vertex,
          fragment: WINDOWS.fragment,
        },
      })
      const shell = new Shell()
      const P = Bl.podium, S = Bl.setback, C = Bl.cornice, U = Bl.plant, Rd = Bl.round, Cr = Bl.crown, Pi = Bl.piers
      const weights = Bl.styles as number[]
      const styleOf = () => {
        let r = die() * weights.reduce((a, b) => a + b, 0)
        for (let k = 0; k < weights.length; k++) if ((r -= weights[k]) < 0) return k
        return 0
      }
      const roll = (range: number[]) => range[0] + (range[1] - range[0]) * die()
      // A tower: a podium, the shaft set back over it in tiers, square or (`round` of the tall ones)
      // round, a cornice round each tier's top, piers at a punched tier's corners, a crown on a curtain
      // wall, and the plant on its roof. Its `base` is its lowest tier, where its neon hangs.
      const tower = (b: Block) => {
        const style = styleOf()
        const paint = colour(style === 1 ? pick(Bl.frames) : pick(Bl.colours))
        const ledge = paint.clone().multiplyScalar(C.shade)
        const tiers: { w: number; d: number; y0: number; y1: number; style: number; podium?: boolean }[] = []
        let y = b.y - 0.5, w = b.w, d = b.d, h = b.h + 0.5
        if (P && h > P.over && die() < P.chance) {
          const ph = Wn.floor * Math.round(roll(P.floors))
          tiers.push({ w, d, y0: y, y1: y + ph, style: P.style, podium: true })
          y += ph
          h -= ph
          w *= 1 - P.inset * 2
          d *= 1 - P.inset * 2
        }
        const round = !!Rd && h > Rd.over && die() < Rd.chance
        const count = S && h > S.above && die() < S.chance ? Math.round(roll(S.tiers)) : 0
        // the shaft takes `S.shaft` of the height left, and each setback over it half the last one's
        const shaft = count ? roll(S.shaft) : 1
        const halves = Array.from({ length: count }, (_, k) => Math.pow(0.5, k))
        const sum = halves.reduce((a, c) => a + c, 0)
        for (const th of [h * shaft, ...halves.map(c => (h * (1 - shaft) * c) / sum)]) {
          tiers.push({ w, d, y0: y, y1: y + th, style })
          y += th
          const inset = S ? roll(S.inset) : 0
          w *= 1 - inset * 2
          d *= 1 - inset * 2
        }
        for (const t of tiers) {
          const th = t.y1 - t.y0
          // a round tower is round above its podium
          if (round && !t.podium) {
            const r = Math.min(t.w, t.d) / 2
            shell.add(new T.CylinderGeometry(r, r, th, Rd.sides).translate(b.x, t.y0 + th / 2, b.z), paint, t.style)
            if (C) shell.add(new T.CylinderGeometry(r + C.out, r + C.out, C.height + C.rise, Rd.sides).translate(b.x, t.y1 - C.height + (C.height + C.rise) / 2, b.z), ledge, 3)
            continue
          }
          shell.box(T, b.x, t.y0, b.z, t.w, th, t.d, 0, paint, t.style)
          if (C) shell.box(T, b.x, t.y1 - C.height, b.z, t.w + C.out * 2, C.height + C.rise, t.d + C.out * 2, 0, ledge, 3)
          if (Pi && t.style === 0) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            shell.box(T, b.x + (sx * t.w) / 2, t.y0, b.z + (sz * t.d) / 2, Pi.size, th, Pi.size, 0, ledge, 3)
          }
        }
        const top = tiers[tiers.length - 1]
        const roof = top.y1 + (C ? C.rise : 0)
        const plant = colour(U.colour)
        if (Cr && style === 1 && die() < Cr.chance) {
          // a crown: a pyramid (or a cone on a round tower) of the curtain wall's frame, and a spire
          const ch = b.h * roll(Cr.height)
          const cone = round
            ? new T.ConeGeometry(Math.min(top.w, top.d) / 2, ch, Rd.sides)
            : new T.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).scale(top.w, ch, top.d)
          shell.add(cone.translate(b.x, roof + ch / 2, b.z), ledge, 3)
          if (die() < Cr.spire) shell.box(T, b.x, roof + ch * 0.8, b.z, 0.6, ch * 0.9, 0.6, 0, plant, 3)
          return { base: tiers[0], y1: tiers[0].y1 }
        }
        const units = Math.round(roll(U.units))
        for (let k = 0; k < units; k++) {
          const uw = roll(U.size), ud = roll(U.size)
          if (uw > top.w * 0.6 || ud > top.d * 0.6) continue
          shell.box(T, b.x + (die() - 0.5) * (top.w - uw) * 0.6, roof, b.z + (die() - 0.5) * (top.d - ud) * 0.6, uw, U.height * (0.6 + 0.8 * die()), ud, 0, plant, 3)
        }
        if (die() < U.mast && b.h > U.mastOver) shell.box(T, b.x, roof, b.z, 0.5, roll(U.mastHeight), 0.5, 0, plant, 3)
        return { base: tiers[0], y1: tiers[0].y1 }
      }
      const shaped = lay.blocks.map(tower)
      tiled(shell.geometry(T), material, true, 'blocks')
      // neon on some of them
      const signs: { m: THREE.Matrix4; c: THREE.Color }[] = []
      for (const [n, whole] of lay.blocks.entries()) {
        const base = shaped[n].base
        const b = { x: whole.x, y: base.y0, z: whole.z, w: base.w, d: base.d, h: base.y1 - base.y0 }
        if (die() > Bl.neon.chance) continue
        const tall = Bl.neon.size[0] + (Bl.neon.size[1] - Bl.neon.size[0]) * die()
        if (tall > b.h * 0.8) continue
        const face = Math.floor(die() * 4)
        const along = (die() - 0.5) * (face % 2 ? b.d : b.w) * 0.7
        const dx = face === 0 ? b.w / 2 : face === 2 ? -b.w / 2 : along, dz = face === 1 ? b.d / 2 : face === 3 ? -b.d / 2 : along
        const y = b.y + 4 + die() * Math.max(0, b.h - tall - 6)
        const off = 0.6
        const pos = new T.Vector3(b.x + dx + (face === 0 ? off : face === 2 ? -off : 0), y + tall / 2, b.z + dz + (face === 1 ? off : face === 3 ? -off : 0))
        signs.push({ m: new T.Matrix4().compose(pos, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), face % 2 ? 0 : Math.PI / 2), new T.Vector3(1.6, tall, 0.4)), c: colour(pick(Bl.neon.colours)).multiplyScalar(Bl.neon.glow) })
      }
      if (signs.length) copies(new T.BoxGeometry(1, 1, 1), render3d.dress(new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })), signs.map(sg => sg.m), false, 'neon', signs.map(sg => sg.c))
    }

    // ---------------------------------------------------------------- along the road
    const heads: THREE.Vector3[] = []
    for (const [name, list] of Object.entries(lay.along)) {
      if (!list.length) continue
      const look = Lk.along[name]
      const yaw = (k: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), list[k].yaw)
      const instances = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], place: (k: number) => THREE.Matrix4, cast = true) =>
        copies(geometry, material, list.map((_, k) => place(k)), cast, `along.${name}`)
      const base = (k: number, up: number) => new T.Vector3(list[k].x, list[k].y + up, list[k].z)
      if (look.model) {
        // a model's lamp at every place, drawn once it lands, every part of it one crowd; its light
        // (`height` up it) now
        whenLanded(look.model, scene => {
          const meshes = parts(scene, look.model, look.node).parts.map(part => new T.InstancedMesh(part.geometry, part.material, 0))
          crowd([{ meshes, within: Infinity, cast: true, name: `along.${name}` }], list.map((_, k) => new T.Matrix4().compose(base(k, 0), yaw(k), new T.Vector3(1, 1, 1))))
        })
        if (name === 'lamp') list.forEach((_, k) => heads.push(base(k, look.height)))
      } else if (name === 'marker') {
        instances(new T.BoxGeometry(0.18, look.height, 0.18).translate(0, look.height / 2, 0), plain(look.colour), k => new T.Matrix4().compose(base(k, 0), yaw(k), new T.Vector3(1, 1, 1)))
        instances(new T.BoxGeometry(0.2, 0.18, 0.2).translate(0, look.height * 0.8, 0), plain(look.band), k => new T.Matrix4().compose(base(k, 0), yaw(k), new T.Vector3(1, 1, 1)))
      } else if (name === 'lamp') {
        const arm = 3
        instances(new T.CylinderGeometry(0.1, 0.16, look.height, 6).translate(0, look.height / 2, 0), plain(look.colour, { metalness: 0.4, roughness: 0.5 }), k => new T.Matrix4().compose(base(k, 0), yaw(k), new T.Vector3(1, 1, 1)))
        // the arm and the head reach over the road: toward the centre, the opposite of `side`
        const reachIn = (k: number) => new T.Vector3(Math.cos(list[k].yaw) * list[k].side, 0, -Math.sin(list[k].yaw) * list[k].side)
        instances(new T.BoxGeometry(0.12, 0.12, arm).translate(0, 0, arm / 2), plain(look.colour), k => {
          const dir = reachIn(k)
          return new T.Matrix4().compose(base(k, look.height), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), dir), new T.Vector3(1, 1, 1))
        })
        instances(new T.BoxGeometry(0.5, 0.18, 1.1), glowing(look.head, lit ? look.glow : look.glow * 0.05), k => {
          const head = base(k, look.height - 0.15).add(reachIn(k).multiplyScalar(arm))
          heads.push(head.clone().add(new T.Vector3(0, -0.4, 0)))
          return new T.Matrix4().compose(head, new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), reachIn(k)), new T.Vector3(1, 1, 1))
        }, false)
      } else if (name === 'sign') {
        const [w, h] = look.size
        // The cars come along the road's heading, its +z, so they see a board's −z side. That side is
        // the sign's face, glowing in `face` inside a `border`; the other sides and the back are the
        // `frame`'s, and the posts stand behind it, +z, where they hold it up from out of sight.
        const back = plain(look.frame)
        // a box's sides in three's order: +x, −x, +y, −y, +z, −z
        instances(new T.BoxGeometry(w, h, 0.25), [back, back, back, back, back, glowing(look.face, look.glow)], k => new T.Matrix4().compose(base(k, look.lift + h / 2), yaw(k), new T.Vector3(1, 1, 1)))
        instances(new T.BoxGeometry(w + look.border * 2, h + look.border * 2, 0.2).translate(0, 0, 0.06), glowing(look.edge, look.glow), k => new T.Matrix4().compose(base(k, look.lift + h / 2), yaw(k), new T.Vector3(1, 1, 1)))
        for (const leg of [-1, 1]) {
          instances(new T.BoxGeometry(0.25, look.lift + h, 0.25).translate(leg * w * 0.4, (look.lift + h) / 2, 0.3), back, k => new T.Matrix4().compose(base(k, 0), yaw(k), new T.Vector3(1, 1, 1)))
        }
      }
    }

    // ---------------------------------------------------------------- landmarks
    let wheel: THREE.Object3D | undefined
    const peakRoll = seeded(seed ^ 0x9eaf)
    const cone = (radius: number, height: number, sides: number, look: any): THREE.BufferGeometry => {
      const g = new T.ConeGeometry(radius, height, sides, 8).translate(0, height / 2, 0).toNonIndexed()
      const pos = g.getAttribute('position')
      const cols: number[] = []
      const rock = colour(look.colour), snow = colour(look.snow)
      for (let k = 0; k < pos.count; k++) {
        const c = pos.getY(k) > height * look.snowline ? snow : rock
        cols.push(c.r, c.g, c.b)
      }
      g.setAttribute('color', new T.Float32BufferAttribute(cols, 3))
      g.computeVertexNormals()
      return g
    }
    for (const mk of lay.landmarks as any[]) {
      const look = Lk.landmarks[mk.name]
      const group = new T.Group()
      group.position.set(mk.x, mk.y, mk.z)
      if (look.model) {
        // a model's landmark at its true size, drawn once it lands
        group.rotation.y = (mk.turn ?? 0) * Math.PI * 2
        whenLanded(look.model, scene => {
          for (const part of parts(scene, look.model, look.node).parts) {
            const mesh = new T.Mesh(part.geometry, part.material)
            mesh.receiveShadow = true
            group.add(mesh)
          }
        })
        add(group, false, true, `landmark.${mk.name}`)
        continue
      }
      if (mk.name === 'volcano' || mk.name === 'fuji') {
        group.position.y = 0
        group.add(new T.Mesh(cone(mk.width / 2, mk.height, look.sides, look), painted({ flatShading: true, fog: true })))
      } else if (mk.name === 'range') {
        group.position.set(lay.middle[0], 0, lay.middle[1])
        for (let k = 0; k < mk.count; k++) {
          const a = ((k + peakRoll() * 0.7) / mk.count) * Math.PI * 2
          const r = mk.distance + (peakRoll() - 0.5) * 2 * mk.spread
          const h = mk.height[0] + (mk.height[1] - mk.height[0]) * peakRoll(), w = mk.width[0] + (mk.width[1] - mk.width[0]) * peakRoll()
          const peak = new T.Mesh(cone(w / 2, h, look.sides, look), painted({ flatShading: true }))
          peak.position.set(Math.sin(a) * r, -h * 0.05, Math.cos(a) * r)
          peak.rotation.y = peakRoll() * Math.PI
          group.add(peak)
        }
      } else if (mk.name === 'lattice') {
        const red = plain(look.red, { roughness: 0.6 }), white = plain(look.white, { roughness: 0.6 })
        const H = mk.height, base = mk.base
        const widthAt = (f: number) => base * Math.pow(1 - f, 1.8) + 4
        // four legs splayed to a quarter of its height
        for (let k = 0; k < look.legs; k++) {
          const a = (k / look.legs) * Math.PI * 2 + Math.PI / 4
          const foot = new T.Vector3(Math.cos(a) * base * 0.5, 0, Math.sin(a) * base * 0.5)
          const knee = new T.Vector3(Math.cos(a) * widthAt(0.25) * 0.5, H * 0.25, Math.sin(a) * widthAt(0.25) * 0.5)
          const leg = new T.Mesh(new T.BoxGeometry(5, foot.distanceTo(knee), 5), k % 2 ? red : white)
          leg.position.copy(foot).add(knee).multiplyScalar(0.5)
          leg.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), knee.clone().sub(foot).normalize())
          group.add(leg)
        }
        for (let b = 0; b < look.bands; b++) {
          const f0 = 0.25 + (b / look.bands) * 0.72, f1 = 0.25 + ((b + 1) / look.bands) * 0.72
          const band = new T.Mesh(new T.CylinderGeometry(widthAt(f1) * 0.5 * Math.SQRT2, widthAt(f0) * 0.5 * Math.SQRT2, (f1 - f0) * H, 4, 1, true).rotateY(Math.PI / 4), b % 2 ? white : red)
          band.position.y = ((f0 + f1) / 2) * H
          group.add(band)
        }
        for (const f of look.deck) {
          const d = new T.Mesh(new T.BoxGeometry(widthAt(f) + 8, 9, widthAt(f) + 8), white)
          d.position.y = f * H
          group.add(d)
        }
        const mast = new T.Mesh(new T.CylinderGeometry(0.6, 1.6, H * 0.12, 6), red)
        mast.position.y = H * 1.03
        group.add(mast)
      } else if (mk.name === 'clock') {
        const stone = plain(look.stone), roof = plain(look.roof)
        const w = mk.width, H = mk.height
        const shaft = new T.Mesh(new T.BoxGeometry(w, H * 0.62, w), stone)
        shaft.position.y = H * 0.31
        const belfry = new T.Mesh(new T.BoxGeometry(w * 1.25, H * 0.14, w * 1.25), stone)
        belfry.position.y = H * 0.69
        group.add(shaft, belfry)
        for (let k = 0; k < 4; k++) {
          const face = new T.Mesh(new T.CircleGeometry(w * 0.45, 32), glowing(look.face, lit ? look.glow : 0.3))
          const a = (k / 4) * Math.PI * 2
          face.position.set(Math.sin(a) * (w * 0.63), H * 0.69, Math.cos(a) * (w * 0.63))
          face.rotation.y = a
          group.add(face)
        }
        const spire = new T.Mesh(new T.ConeGeometry(w * 0.85, H * 0.3, 4).rotateY(Math.PI / 4), roof)
        spire.position.y = H * 0.76 + H * 0.15
        group.add(spire)
      } else if (mk.name === 'wheel') {
        const frame = plain(look.colour, { metalness: 0.5, roughness: 0.4 })
        const R = mk.height / 2 - 4
        const turning = new T.Group()
        turning.add(new T.Mesh(new T.TorusGeometry(R, 0.9, 6, 64), frame))
        for (let k = 0; k < mk.spokes; k++) {
          const spoke = new T.Mesh(new T.CylinderGeometry(0.15, 0.15, R, 4), frame)
          const a = (k / mk.spokes) * Math.PI * 2
          spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0)
          spoke.rotation.z = a - Math.PI / 2
          turning.add(spoke)
          const pod = new T.Mesh(new T.SphereGeometry(1.8, 8, 6).scale(1.6, 1, 1), glowing(look.pods, lit ? look.glow : 0.2))
          pod.position.set(Math.cos(a) * (R + 1.5), Math.sin(a) * (R + 1.5), 0)
          turning.add(pod)
        }
        turning.position.y = R + 6
        group.add(turning)
        for (const lean of [-1, 1]) {
          const leg = new T.Mesh(new T.BoxGeometry(1.5, R + 10, 1.5), frame)
          leg.position.set(0, (R + 6) / 2, lean * 8)
          leg.rotation.x = lean * 0.25
          group.add(leg)
        }
        group.rotation.y = peakRoll() * Math.PI
        wheel = turning
      } else if (mk.name === 'dome') {
        const stone = plain(look.stone), lead = plain(look.lead, { metalness: 0.3 })
        const w = mk.width, H = mk.height
        const nave = new T.Mesh(new T.BoxGeometry(w * 2.2, H * 0.25, w * 0.8), stone)
        nave.position.y = H * 0.125
        const drum = new T.Mesh(new T.CylinderGeometry(w * 0.32, w * 0.34, H * 0.25, 24), stone)
        drum.position.y = H * 0.375
        const cupola = new T.Mesh(new T.SphereGeometry(w * 0.33, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.25, 1), lead)
        cupola.position.y = H * 0.5
        const lantern = new T.Mesh(new T.CylinderGeometry(w * 0.05, w * 0.07, H * 0.12, 8), glowing(look.stone, lit ? look.glow : 0))
        lantern.position.y = H * 0.94
        group.add(nave, drum, cupola, lantern)
      }
      add(group, mk.name !== 'volcano' && mk.name !== 'fuji' && mk.name !== 'range', true, `landmark.${mk.name}`)
    }

    // when the lights are on, a real light under every lamp's head
    const lampLook = Lk.along?.lamp
    if (lit && lampLook?.light && heads.length) lamps(heads, lampLook.head, lampLook.light, 'lamplights')
    built = { objects, crowds, sun, toward, reach, wheel, groves, later, crowd }
  }

  // A grove's levels of detail, made from its model once it has landed and handed to cull3d as one
  // crowd: each level's node's meshes, their materials dressed (and, for a tree's cards, drawn from both
  // sides), one instanced mesh per mesh, casting shadows where its level says.
  function grow(p: Plugins, g: Grove, crowd: NonNullable<typeof built>['crowd']) {
    const T = p.render3d.THREE as typeof THREE
    const scene = p.loader.model(g.model).scene as THREE.Object3D
    crowd(g.levels.map(level => {
      const node = scene.getObjectByName(level.node)
      if (!node) throw new Error(`land: ${g.model} has no node ${level.node}`)
      const parts: THREE.Mesh[] = []
      node.traverse(o => { if ((o as THREE.Mesh).isMesh) parts.push(o as THREE.Mesh) })
      const meshes = parts.map(part => {
        const material = (part.material as THREE.MeshStandardMaterial).clone()
        if (g.twoSided) material.side = T.DoubleSide
        // its own copy of the geometry, which `close` disposes, leaving the loader's model whole
        return new T.InstancedMesh(part.geometry.clone(), p.render3d.dress(material), 0)
      })
      return { meshes, within: level.within, cast: level.cast, name: `${g.label}.${level.node}` }
    }), g.matrices, g.tints)
    g.grown = true
  }

  return {
    tick(p: Plugins) {
      if (!built && p.wire.rows.some(r => r.kind === 'scenery')) build(p)
      const camera = p.render3d.camera as THREE.PerspectiveCamera | undefined
      if (!built || !camera) return
      const { sun, toward, reach } = built
      // what waited for a model, the frame it lands
      for (const w of built.later.filter(w => p.loader.ready(w.model))) {
        built.later.splice(built.later.indexOf(w), 1)
        w.run(p.loader.model(w.model).scene as THREE.Object3D)
      }
      for (const g of built.groves) if (!g.grown && p.loader.ready(g.model)) grow(p, g, built.crowd)
      const x = Math.round(camera.position.x), y = Math.round(camera.position.y), z = Math.round(camera.position.z)
      sun.target.position.set(x, y, z)
      sun.position.set(x + toward.x * reach * 3, y + toward.y * reach * 3, z + toward.z * reach * 3)
      if (built.wheel) built.wheel.rotation.z = (performance.now() / 1000) * 0.03
    },
    close(p: Plugins) {
      if (!built) return
      for (const c of built.crowds) c.forget()
      for (const o of built.objects) {
        p.render3d.scene.remove(o)
        o.traverse(m => {
          const mesh = m as THREE.Mesh
          mesh.geometry?.dispose()
          for (const mat of [mesh.material ?? []].flat() as THREE.Material[]) mat.dispose()
        })
      }
      built = undefined
    },
  }
}
