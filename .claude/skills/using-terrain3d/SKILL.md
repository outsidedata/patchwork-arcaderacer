---
name: using-terrain3d
description: Use in core, or any clone of it, whenever terrain3d comes up - the 3D ground plugin, its field file (`program` and its nodes, `analysis`, `ground` and its texture layers with their rules, noise edges and warps, `surfaces`, `layers` and their strokes), `world.terrain3d` (`field`, `rings`, `shadowReach`, `budget`, `seabed`, `static`, `preload`, `bake`, `maps`, `mods.ready`), biomes, the sea and `flood`, ground textures (colour and normal maps fetched from cc0-textures.com and drawn as ground layers), the baked rings (virtual texturing) and the near maps, the land record's keys (`layer:<name>`, `biome:<name>`, `surface:<name>`), `heightAt`, `rawAt`, `depthAt`, `paintAt`, `ray` and the other queries, the page's `ground`, preparing a place, the workers and `task`, the brush, and the `terrain3d.<p>.ts` mods that stand walker, kinematics3d, nav3d, shapes3d, box3d, box3dvehicle, scatter3d, solids, hitscan3d, flight3d, ragdoll3d, dismember3d, skydome3d, weather3d, ocean3d and the cutscene on the land. Also when the ground does not draw, draws grey, shows a hole or a seam, throws about its rings, nodes, rules, ground layers, bake or maps, or a thing floats over it or sinks into it. Also whenever the ground's height at a point is wanted while a game is made: "find the point", "what's the height at", "the y at x, z", "put it on the ground", "place it on the terrain", an `actors` entry's `pos[1]`, every entry checked for sitting under or over the land. `height.ts` beside this skill prints it from the scene (Asking the ground); never a new script of the game's.
---

# Using terrain3d

terrain3d is the 3D ground: endless land worked out from one JSON file, the field. The ground is
a pure function of that file. No three.js, no clock and no randomness go into it beyond the
file's own seeds. A rule on the server and the rings drawn on a page both ask the same `land` code
over the same parse, and they get the same heights byte for byte. It has **no row**: none of it
changes while the game runs, so nothing of it goes down the wire.

The files, in `plugins/terrain3d/`:

| File | Runs | Does |
|---|---|---|
| `terrain3d.sim.ts` | server and page | compiles the height program, bakes painted layers, answers every query (`land`, `landOf`, `heightAt`…) |
| `terrain3d.warp.ts` | server and page | the ground look as one deterministic field: each layer's mask, warp and weight, in TS (the land record's `layer:<name>`) and as its GLSL twin |
| `terrain3d.plugin.ts` | page | draws the land as square rings round the camera, its look, the near maps; hands out `ground`, `land`, `rings`, `building()`, `bake`, `focus`, `carry` |
| `terrain3d.rings.ts` | page and workers | the arithmetic of one ring's mesh and of the values the ground carries |
| `terrain3d.worker.ts` | worker | builds rings and runs `task`s off the page |
| `terrain3d.bake.ts` | page | the baked rings: the look rendered into textures round the camera |
| `terrain3d.present.ts` | worker or page | which ground layers the ground round a point hits, for the near maps |
| `terrain3d.<p>.ts` (16) | either | mods: what plugin `p` gets when a scene names terrain3d in `world.<p>.mods` |

The headers of `terrain3d.sim.ts`, `terrain3d.warp.ts`, `terrain3d.plugin.ts`, `terrain3d.rings.ts`
and `terrain3d.bake.ts` hold the whole contract. This skill summarises them. Where they disagree with
it, the headers are right and this file gets fixed.

## Putting it in a scene

1. The field file goes in the game's `assets/`. Give it a `json` entry with `preload` in the
   scene's loader catalogue, since the server half reads it through the loader's `json`, the one
   import a plugin's server half makes. Every map a ground layer names is a `texture` entry too
   (`bringing-in-art`):

```json
"loader": { "assets": {
  "place": { "type": "json", "url": "/games/<game>/assets/place.json", "preload": true },
  "meadow": { "type": "texture", "url": "/games/<game>/assets/ground/meadow-color-1024.webp", "wrap": "repeat" },
  "meadowNormal": { "type": "texture", "url": "/games/<game>/assets/ground/meadow-normal-1024.webp", "space": "linear", "wrap": "repeat" }
} }
```

2. `world.terrain3d` holds the plugin's fixed numbers. A child scene inherits them from the manager
   scene's `world`:

```json
"terrain3d": {
  "field": "place",
  "rings": [{ "reach": 128, "seg": 256 }, { "reach": 512, "seg": 256 }, { "reach": 2048, "seg": 256 }, { "reach": 9000, "seg": 180 }],
  "shadowReach": 512,
  "budget": 8,
  "seabed": false,
  "preload": true,
  "bake": { "rings": [512, 2048, 8192], "res": 2048, "near": 150, "far": 300, "cliff": 0.6, "band": 0.06, "budget": 1024 },
  "maps": { "near": 6, "reach": 300, "step": 8, "small": 256 },
  "mods": { "ready": ["scatter3d"] }
}
```

| Key | Meaning |
|---|---|
| `field` | the catalogue name of the field file |
| `rings` | finest first. Each is a square `reach` metres from middle to edge, `seg` cells across |
| `shadowReach` | rings with `reach` ≤ this cast shadows. Every ring receives them |
| `budget` | milliseconds per frame the ring rebuild may take on the page (it always does at least one unit) |
| `seabed` | draw ground under the waterline at `raw` height, so the sea has a floor |
| `static` | optional, default false. The rings are built once round the origin and never follow the camera. Only for a place small enough that the finest ring covers all of it |
| `preload` | optional, default false. Nothing of the land goes on the scene until the camera's first place is built whole (Prepared places) |
| `bake` | optional. The baked rings (Baked rings) |
| `maps` | optional. The near maps (Near maps) |
| `mods.ready` | plugins whose share of a prepared place must be done before the place is, as scatter3d's cells |

3. List `terrain3d` in the scene's `plugins` **before `render3d`**. It places its rings in
   `afterTick` and render3d draws in its own `afterTick`, so listing it after render3d draws round
   last frame's camera, and nothing reports it. Also list it before every plugin that reads its
   land in the same `afterTick`: skydome3d checks this with `ahead` and throws. A sky over terrain
   is `["loader", "scenemanager", "player", "terrain3d", "skydome3d", "render3d"]`.
4. Name it in each consumer's `world.<p>.mods` (The mods, below).

## The field file

```json
{ "program": {…}, "analysis": {…}, "ground": {…}, "surfaces": {…}, "layers": […] }
```

A field with no `ground` throws `terrain3d field has no ground` when its land is made.

| Key | What it is |
|---|---|
| `program` | `{ world, hscale, sea, flood, out, nodes }`, the height program |
| `analysis` | metres the land record reads the ground over: `slopeStep`, `curveStep`, `positionRadius`, `occlusionRadius`, `occlusionSteps`, `cliffProbe`, `cliffSlope`, `cliffDrop`, `flatAngle` (radians), `records` (cache size, a whole number above 0) |
| `ground` | the look: texture layers with rules, noise edges and warps, and how they compose (The ground) |
| `surfaces` | `{ name: { colour?, cover, grip?, drag?, spray?, mark?, edge? } }`, what a `surface` stroke paints |
| `layers` | `[{ at: [x, z], size, px, strokes }]`, painted ground: a square `size` m across centred on `at`, `px`×`px` pixels |

### The height program

`nodes` run in order into one reused buffer, and `out` names the node that is the ground. An input
names an **earlier** node, so cycles can't be written. Values are unitless and get multiplied by
`hscale` once. Only a warp's `amount`, a crater's `radius` and a clearing's `flat` are metres.
Noise lattice coordinates are `((p' / world) + 0.5)·freq`, so `freq` is the number of cells across
`world` metres.

| `op` | Params | Value |
|---|---|---|
| `const` | `value` | the value |
| `noise` | `kind` (`value`, `simplex`, `worley`), `freq`, `seed`, `rotate?`, `stretch?` [x, z], `metric?` (`f1`, `f2`, `f2-f1`, worley only) | noise in about [0, 1] |
| `warp` | `input`, `x`, `z`, `amount` | `input` re-run at the point moved `amount`·(x, z) metres |
| `fold` | `input`, `kind` (`ridge`, `billow`, `abs`, `terrace`), `steps` (terrace) | ridge (1−\|2v−1\|)², billow \|2v−1\|², abs \|2v−1\|, terrace floors with quintic risers |
| `remap` | `input`, `inLo`, `inHi`, `outLo`, `outHi`, `ease?` (`linear`, `smooth`, `smoother`) | clamped and eased onto outLo..outHi |
| `combine` | `a`, `b`, `mode` (`add`, `sub`, `mul`, `min`, `max`, `lerp`), `t?` (0.5) | the two combined |
| `scale` | `input`, `by` | input × by |
| `craters` | `freq`, `seed`, `radius` [min, max] m, `depth`, `rim`, `rimWidth`, `ejecta` | a crater per lattice cell. The deepest floor wins and the rims add |
| `clearing` | `input`, `flat` m, `floor` | input levelled toward its own value at the origin, so a spawn stands on flat ground without a pit |
| `biomes` | `list: [{ name, strength, height }]` (node ids), `sharp` > 0 | Σ share·height, where share = max(0, strength)^sharp over the sum. At most one per program, names distinct |

`compile(program)` returns `run(x, z)`, `at(id, x, z)` (any node's value, for previews), `biomes`
(the names) and `mix(x, z)` (the shares).

A biome is a name, a node saying how much of it stands at a point, and a node that is its own
ground there, so each biome has its own landform (dunes in a desert, peaks in the alps) and the
heights blend across the border by the same shares the look reads as `biome:<name>`.

### The sea

raw = program·hscale − hscale·(2·sea − 1), so the waterline sits at y = 0.

- `flood: true`: `height` = max(raw, 0), which is the water's surface, and `depth` = max(0, −raw).
- `flood: false`: no sea. `height` = raw, `depth` is 0 everywhere, and a valley below 0 stays dry.
- `raw` is always the ground itself, under the water too.

### Painted layers and the brush's strokes

The strokes are the source, and no image file exists. The first time the land reads a layer it
bakes the strokes in order into a raster of target height × weight, a surface index and that
surface's weight. Layers apply in order, h ← h·(1 − W) + T, sampled bilinear and zero outside, so
paint feathers out over one pixel at a layer's edge. A later layer reads the ground the earlier
ones leave.

A stroke is `{ verb, radius, hardness, strength, level, surface, path: [[x, z], …] }`. The type
has every key on every stroke, and a verb ignores the keys it doesn't use: only `raise`/`lower` read
`strength`, only `flatten` reads `level`, and only `surface` reads `surface`. Each pixel within
`radius` of the polyline moves f = clamp01((1 − d/r)/(1 − hardness)) of the way to its goal. An
empty entry `[]` in `path` breaks it into runs that are never joined. One stroke has one verb, so
a road is two strokes along the same path, a `bench` and then a `surface` whose surface has
`cover: 0`:

```json
{ "at": [0, 0], "size": 256, "px": 256, "strokes": [
  { "verb": "bench", "radius": 6, "hardness": 0.6, "strength": 0, "level": 0, "surface": "", "path": [[-100, 4], [0, 10], [100, 30]] },
  { "verb": "surface", "radius": 4, "hardness": 0.8, "strength": 0, "level": 0, "surface": "road", "path": [[-100, 4], [0, 10], [100, 30]] }
] }
```

A layer's pixel is `size / px` metres. Make it fine enough for the narrowest stroke's edge.

| `verb` | Goal |
|---|---|
| `raise` / `lower` | the ground under the pixel ± `strength`. It is relative, so the painted spot follows when the program changes |
| `flatten` | `level` |
| `smooth` | the mean of the pixel and ±radius/2 along x and z |
| `bench` | the ground under the nearest point of the path: it follows the hill along the path and is flat across it. This is how a road is cut |
| `surface` | no height: paints `surface` (it must be a key of `surfaces`) |

### Surfaces

`paintAt` returns `{ weight, surface, cover, grip, drag, spray, mark }` for the strongest painted
surface at a point:

- `colour`, when a surface has one, is drawn over the ground layers by the paint's weight, through
  its `edge` when it has one. Leave it out and give a ground layer a rule on `surface:<name>`
  instead to lay a texture where it is painted (a road layer).
- `cover` = 1 + (cover − 1)·weight multiplies scatter3d's density (0 on a road clears it).
- `grip` (1 on unpainted ground) multiplies a wheel's friction.
- `drag` (0 unpainted) is rolling resistance, newtons lost per newton of load.
- `spray` is a particle3d effect name, or `false` for nothing. `mark`, 0 to 1, is how dark a tyre
  track it takes. Both are given only where the weight is at least a half, otherwise undefined, and
  the vehicle falls back to what it does on unpainted ground.

### Rules, ramps and edges

The one ramp is `shape(v, lo, hi)` = clamp01((v − lo)/(hi − lo)). It inverts when lo > hi and is a
step at lo when they are equal. A rule `{ q, lo, hi }` is that ramp over the land record's key `q`.
Ground layers, scatter3d's keep rules and boulders all use it.

A surface's `edge { width, ragged, scale }` turns a weight w into smoothstep(0.5 − width/2,
0.5 + width/2, w + ragged·(noise − 0.5)): a crisp line where w crosses a half, broken up by
`ragged` at `scale` cycles a metre.

### The land record

`analyse(x, z)` is cached (up to `records` of them, oldest first out), and each key is computed only
when it is first read. These are the keys a rule's `q` can name:

| Key | Meaning |
|---|---|
| `height` | heightAt |
| `relief` | height / hscale |
| `slope` | 1 − n.y over ±slopeStep (0 flat, 1 vertical) |
| `aspect` | the way downhill faces, atan2(n.x, n.z): 0 faces +z, π/2 faces +x |
| `profile`, `plan` | curvature along and across the slope over curveStep, positive where concave (a foot, a hollow) |
| `position` | height minus the mean of 8 points `positionRadius` around (+ on a crest, − in a dip) |
| `occlusion` | mean over 8 directions of sin(highest horizon angle) |
| `form` | geomorphon: 0 flat, 1 peak, 2 ridge, 3 shoulder, 4 spur, 5 slope, 6 hollow, 7 footslope, 8 valley, 9 pit |
| `cliffAbove`, `cliffBelow` | how much a cliff rises above, or drops below, `cliffProbe` metres along the gradient |
| `wet` | shape(plan, 0, .01)·shape(−position, 0, .15·positionRadius): concave hollows |
| `water` | depthAt |
| `biome:<name>` | that biome's share of the mix |
| `surface:<name>` | that surface's painted weight, 0 where another surface is painted |
| `layer:<name>` | that ground layer's weight as the shader draws it, before the height blend |

A ground layer's own rules may read every key but `layer:<name>`. Anything else (scatter3d's rules
on the server, on the page and in its workers) may read `layer:<name>`, so trees stand on the meadow
that is drawn: `{ "q": "layer:meadow", "lo": 0.5, "hi": 0.85 }`.

## The ground

The look is `ground` in the field (`terrain3d.warp.ts`):

```json
"ground": {
  "compose": "stack",
  "heightBlend": { "amount": 2, "depth": 0.1 },
  "far": { "amount": 0.7, "scale": 7.3 },
  "roughness": 0.9,
  "layers": [
    { "name": "meadow", "map": "meadow", "normal": "meadowNormal", "scale": 36,
      "warp": [{ "freq": 0.005, "amp": 30, "stretch": [1, 1, 1], "rotate": 0 }, { "freq": 0.035, "amp": 3, "stretch": [1, 1, 1], "rotate": 0 }] },
    { "name": "rock", "map": "rock", "normal": "rockNormal", "scale": 30, "tri": true, "sharp": 12,
      "where": [{ "q": "slope", "lo": 0.3, "hi": 0.45 }],
      "noise": { "freq": 0.12, "amp": 0.8 }, "edge": 0.35 }
  ]
}
```

| Key | Meaning |
|---|---|
| `layers` | in order: the first covers everything, each later one lies over the ones before it where its mask is |
| `name` | distinct; the land record's `layer:<name>` |
| `map`, `normal` | catalogue `texture` entries: the colour (sRGB) and an OpenGL normal map (green up). No normal: drawn flat |
| `scale` | metres a repeat |
| `strength` | the normal map's xy multiplied, 1 when absent |
| `tri`, `sharp` | projected along all three axes, each axis's share its normal's part to the power `sharp` (4 when absent), so a cliff does not stretch the map down its face. Cliffs want `sharp` about 12 |
| `where` | rules on the land record, their ramps multiplied: the layer's coarse mask |
| `noise` | `{ freq, amp }`: the mask v moved by ±amp·4v(1 − v) of four octaves of value noise at `freq` cycles a metre, at the warped point. The edge wanders at every scale; where the rules give 0 or 1 the noise moves nothing |
| `edge` | how wide that crossing is drawn, 0 a cut to 1; 0.3 when absent |
| `warp` | `[{ freq, amp, stretch: [x, y, z], rotate }]`: octaves of 3D noise of world xyz adding `amp` metres of offset. The map and the mask's noise are read at the warped point, which hides the repeat. Stretching y alone draws strata |
| `compose` | `stack` (w_k = m_k·Π_{j>k}(1 − m_j)), `normalise` (m / Σm) or `sharpened` (m⁴ / Σm⁴) |
| `heightBlend` | `{ amount, depth }`: at a border the layer whose texture stands taller (its luminance) wins, within `depth`. The GPU's alone |
| `far` | `{ amount, scale }`: a second read of each map at `scale` × its repeat, as a ratio to the map's mean colour, so the far ground varies at a scale no repeat has |
| `roughness` | the ground's one roughness; no roughness map is read |

What the experiments that made this settled (issue #20):

- A big slow warp octave, its `amp` as large as or larger than the repeat (30 m on a 24–45 m
  repeat), plus `far` at about ×7.3 and 0.7, hides the repeat. Small warps do nothing visible.
- Fast octaves smear the texture once amp × freq × stretch × 2 goes much over about 0.4.
- Edges look natural with `edge` about 0.35, the noise's `amp` 0.8–0.9, and `heightBlend` amount 2,
  depth 0.1.
- Repeats of 30–45 m.

**Height and slope are worked out per pixel** on the GPU (slope from the geometric normal). Every
other key a layer's rules read, `biome:<name>` and `surface:<name>` among them, is carried
(What the ground carries).

## Ground textures from cc0-textures.com

Real ground maps (grass, rock, snow, sand, dirt, forest floor) come from cc0-textures.com: CC0 PBR
sets, no login and no attribution. The `cc0-textures` skill, where it is installed, holds the whole
API.

1. **Find.** `https://cc0-textures.com/tag/<tag>/<page>` (tags are hyphenated: `forest-floor`,
   60 to a page). The list is the JSON in `<script id="__NEXT_DATA__">`, at
   `props.pageProps.textures`, each entry with `title`, `tags`, `vendor`, `download` and `thumb`. A
   bad tag still answers 200, with no `textures` key.
2. **Look before choosing.** Fetch `https://cc0-textures.com/thumbs/<vendor>/<thumb>` (720×720 PNG)
   and look at it. A title alone picks the wrong rock. A ground-level photo, not an aerial one: an
   aerial photo stretched over 30 m is blurry at eye level.
3. **Name it** in `games/<game>/assets/cc0-textures.json` (the header of `scripts/cc0.ts`):
   `{ "folder": "ground", "sizes": [2048, 1024, 512], "sets": { "rock": { "set": "Rock007_4K-JPG",
   "maps": ["color", "normal"] } } }`. `set` is the set's zip name in the library's list of
   cc0-textures sets (`PATCHWORK_LIBRARY`). The ground reads `color` and `normal` only; the normal
   taken is the OpenGL one, and a set with only a DirectX normal gives none.
4. **Bake.** `yarn bake <game>` downloads each set into the library once, then cuts each map at each
   size, square, as WebP, to `assets/<folder>/<name>-<map>-<size>.webp` (`ground/rock-normal-1024.webp`).
   The game commits them (committing-a-game), so it boots with no bake; `yarn health` names a game
   whose maps are not all there.
5. **Catalogue** each map: the colour `{ "type": "texture", "url": …, "wrap": "repeat" }`, the
   normal with `"space": "linear"` too.

## How it is drawn

### Rings

- The finest ring's cell, 2·reach/seg, is the lattice unit. Every coarser cell is rounded to a
  whole number of the next finer ring's cells, so shared vertices land on the same floats. Each ring
  snaps its middle to about an eighth of its reach, and its half width is its reach rounded up to
  the next coarser ring's cells. A ring's half width has to be at least the finer ring's, plus half
  of both snaps, plus one of its own cells; a ring set short of that throws when the plugin starts,
  and the error gives the reach the ring needs.
- **Seams.** A fine ring's outer edge is lifted onto the coarse ring's chord. The coarse ring fans
  its hole-edge cells through those same vertices, so the two share every seam vertex bit for bit,
  with no skirts and no T-junctions. Only the outermost ring hangs a skirt, max(hscale, 40) deep.
- **Rebuilds.** A ring recentres when the camera (read off render3d's camera each `afterTick`)
  crosses half a snap. Changed rings are built a unit at a time (layout, a row of heights, a row of
  normals, the seams and skirt, a row of triangles) and all swap in together once every one is
  whole, so the ground never vanishes and no seam is half built. `building()` reports
  `{ done, total }`.
- **Workers.** Where the page has `Worker`, rings are built in a pool of module workers (one fewer
  than the cores, at most one a ring), with the same arithmetic, so the floats are the page's.
  `budget` then bounds only the page's own work. `task(url, input)` lends the workers to any plugin
  that reads the land: the module at `url`'s `task(ground, input)` runs there (scatter3d places its
  cells so).
- **What a change rebuilds.** The field is compared by content, never by identity, since the loader
  refills a rewritten file in place.
  - A change to the ground layers but their carried rules, or to the surfaces' colours, covers and
    edges, makes a new material and rebuilds **no ring**.
  - A change to `layers` alone rebuilds only the rings the changed layers' rects reach.
  - Anything else rebuilds every ring.

### Prepared places

`ground.prepare(x, z)` builds every ring the camera would stand in at a place it is about to jump to
(a cut, a teleport, a respawn), off the scene, from what is left of `budget`. The camera arrives
when its finest ring would stand where the place's does, and the place's rings swap in whole that
frame. A place is done when every ring is built, every map the ground layers name has landed or failed, and every plugin in
`world.terrain3d.mods.ready` says its share is done. `preload` prepares the camera's first place and
puts nothing of the land on the scene until it is done, so the land and what stands on it arrive in
the same frame. `ground.shown()` is false until then.

### What the ground carries

The values of the land record the look reads, besides height and slope:

- each surface's paint weight;
- each ground layer after the first with a rule on more than height and slope, those rules' ramps
  multiplied (`biome:<name>` and `surface:<name>` rules among them);
- each biome's share, for the biome view.

They are **not on the vertices**. Each ring's build works them out at each of its grid points into a
grid of texels (`terrain3d.rings.ts`), the plugin writes every ring's grid into one float texture
array (`carry`), and the look reads them by ground position, blended between the four grid points
round it, from the finest ring drawn there. **There is no cap on how many a field carries.** A
ring's outer edge carries the coarser ring's values blended along it, as its heights are lifted onto
its chord, so the masks agree across the seam.

### Near maps

Without `maps`, every layer's colour and normal maps are drawn into two texture arrays at the
largest colour map's size. That is about 171 MB a layer at 4K, so a field with many layers runs out
of memory. With `maps`:

| Key | Meaning |
|---|---|
| `near` | slots of full-size maps the near arrays hold |
| `reach` | metres from the camera whose ground decides which layers hold them |
| `step` | metres between the points that ground is sampled at |
| `small` | texels a side of every layer's small copy |

- Every layer's maps are drawn small, `small`², into the small arrays. At 256² a layer is about
  0.7 MB, colour and normal, so a field may have as many layers as the GPU's arrays hold (at least
  256).
- The layers the ground within `reach` hits are worked out in a worker (`terrain3d.present.ts`),
  each layer's weight summed over a grid `step` apart, again whenever the camera moves a quarter of
  `reach` or the land changes. The `near` layers with the most weight hold the full-size slots; a
  layer keeps a slot it already has. Every other layer reads its small copy.
- So the ground you stand on shows full maps for the few layers it hits, a layer coming into reach
  shows its small copy until its full maps are drawn into a slot, and fidelity falls off as the
  number of layers near the camera passes `near`, never with an error.
- `reach` the same as `bake.far` covers the ground drawn live.
- The far read reads the small copies.

### Baked rings

With `bake`, the look is rendered into square textures round the camera, its albedo and its
normal-mapped normal (`terrain3d.bake.ts`), and the ground past `far` reads one baked texel instead
of working out every layer: the far ground costs the same however many layers it has.

| Key | Meaning |
|---|---|
| `rings` | sides in metres, finest first, each a square round the camera |
| `res` | texels a side of every ring, at least 512 |
| `near`, `far` | metres from the camera over which the ground fades from live to baked |
| `cliff` | ground whose normal's y is below this stays live at every distance: a bake straight down has nothing for a steep face |
| `band` | the share of a ring's side over which it fades to the next coarser ring, so its edge never shows |
| `budget` | thousands of texels baked a frame, at least one tile |

- A ring is baked by drawing terrain3d's own ring meshes with terrain3d's own material, straight
  down, so baked and live are the same shader. A bent ground (the planet) bakes flat on its chart.
- A ring is addressed by ground position wrapped on its side, so when it moves only the strip it
  uncovers is baked, a 512² tile at a time, finest ring first, up to `budget`. Until a strip is
  finished the ground there is drawn live.
- A ring whose texel is as wide as a small copy's (the smallest layer `scale` over `maps.small`) bakes
  from the small copies.
- A new look, a new land or a stroke bakes every ring again.
- The coarsest bake ring has to lie inside the ground the rings draw; a bake set that can reach past
  it throws when the plugin starts, with the largest side it may have.
- `baked()` is each ring's `{ side, at, valid, left }`.
- A plugin drawing terrain3d's rings itself (a globe) calls `bake(meshes, x, z, cover)`,
  `focus(x, z)` and `carry(list)` with its own rings and its own point.

### Views

The material's `userData.terrain3d` is its uniforms. `tdDebug` draws the ground unlit and unfogged:
0 lit, 2 the weights (each layer its hue), 3 the top layer's warp, 4 the top layer's mip, 5 the
albedo, 6 the normal, 7 the biomes, 8 the slope, 9 and 10 the albedo and normal as a bake writes
them, 11 the baked rings (live grey, each ring its hue). A testbed sets it; no game does.

## Asking the ground

**On the server**, from a rule or another plugin's server half, import from
`#plugins/terrain3d/terrain3d.sim.ts`. Each query takes `w` and reads the land of
`world.terrain3d.field`. Points in 3D (`a`, `b`, `origin`, `dir`) are `[x, y, z]`. `normalAt`,
`restsAt`, `occludes` and `ray` work over `height`, so on a flooded land they meet the water's
surface. The bed under it is `rawAt`.

| Query | Returns |
|---|---|
| `heightAt(w, x, z)` | the ground, or the water's surface where the land floods |
| `rawAt(w, x, z)` | the ground itself, under water too |
| `depthAt(w, x, z)` | water depth (0 with no flood) |
| `normalAt(w, x, z, step)` | unit normal over ±step |
| `restsAt(w, x, z, span)` | mean of a span square's 4 corners, where a body wider than the bumps rests |
| `paintAt(w, x, z)` | `{ weight, surface, cover, grip, drag, spray, mark }` |
| `occludes(w, a, b)` | whether the ground rises above the segment a→b |
| `analyse(w, x, z)` | the land record (`.read(q)` or each key as a getter) |
| `ramp(w, rule, x, z)` | shape of a rule there |
| `ray(w, origin, dir, far)` | first point at or below the ground, or undefined |
| `edits(w)` | `{ land, layers: [{ version, rect }] }`, so a consumer can tell the ground changed |

A land also answers `mix(x, z)`, each biome's share by name, and `layers(x, z)`, each ground layer's
weight by name. `landOf(field)` is the land every truth in the process shares, made again only when
the field's content changes. `land(field, from?)` makes a fresh one, which the brush strokes.

**While a level is made**, `height.ts` beside this skill prints the ground of a game's scene at
points, worked out as the server works it out (the scene made as `load` makes each child, the field
read through the loader, asked of `landOf`), so a height it prints is the one `heightAt` gives a rule.
No game writes a script of its own for this:

```
node --experimental-strip-types .claude/skills/using-terrain3d/height.ts <game> [<scene>] <x> <z> [<x> <z>]… [--actors]
```

Each point prints `height` (heightAt), `raw` (rawAt, where walker stands a body under water) and
`depth`. `<scene>` is the entry scene when left out. `--actors` also lists every `actors` entry whose
`pos` is [x, y, z], with the ground under it and `above`, its y less the height there, so an entry
sunk under the land shows up as negative.

"Find the point" means run it: for the game and scene being worked on, at the x, z named (or every
entry with `--actors`), and give back the height it prints, or write it into the entry's `pos[1]`
when the job is placing that entry. A walker body under water stands on `raw`, everything else on
`height`.

**On the page**, `plugins.terrain3d` hands out:

- `ground`, undefined until the field has loaded: `{ height, raw, depth, at, cover, spray, mark,
  ramp, rules, edits, ray, mix, layers, rings, shown, prepare, prepared, unprepare, task }` over this
  client's own land. `at` is the land record, `ray(origin, dir)` marches out to the camera's far
  plane, and `rings()` is each ring's `reach`, finest first, which scatter3d draws its LODs on.
- `land`, the client's land itself.
- `rings`, each `{ at, half, cell, mesh }`.
- `building()`, `shown()`, `prepare`, `prepared`, `unprepare`, `task`.
- `bake`, `baked`, `focus`, `carry`, for a plugin drawing the rings itself.
- `close()`, which removes the rings and disposes every geometry, material, array and worker.

Another plugin reaches these only through a mod. Never through `plugins.terrain3d` directly, and
never by reading `world.terrain3d`.

## The mods

A scene switches each on with `world.<p>.mods: { <function>: 'terrain3d' }`. The file is
`plugins/terrain3d/terrain3d.<p>.ts`.

| `p` | Mod key | Gives |
|---|---|---|
| `walker` | `height`, `depth`, `cell` | `rawAt` (bodies wade on the bed), `depthAt`, and the finest ring's cell, 2·reach/seg, so walker stands bodies on the triangles that are drawn. What a body does in that depth is walker's |
| `box3d` | `ground` | chunk [i, j] as a height-field Static of `world.box3d.chunk.count` heights a side, `chunk.cell` m apart |
| `box3dvehicle` | `land` (page), `grip`, `drag` (server) | dust spray and tyre marks off the painted surface, and its grip and rolling drag |
| `scatter3d` | `ground` (server), `land` (page) | `{ height, cover, ramp, rules, edits }`, so the trunk a rule hits is the one a seat sees; its rules may read `layer:<name>`. The other way round, scatter3d's own `scatter3d.terrain3d.ts` is terrain3d's `mods.ready`: whether every cell in reach of a prepared place is placed |
| `solids` | `land` | models stood on the land |
| `hitscan3d` | `ground` | `{ t, normal }` where a shot meets the land, or undefined |
| `flight3d` | `ground` | `heightAt`: a plane that flies into the sea has hit it |
| `ragdoll3d` | `land` | limp bodies laid on the land |
| `skydome3d` | `land` | the land skydome3d checks is listed before it (`ahead`); it throws where terrain3d comes after it or is not listed |
| `weather3d` | `land` | rain splashes on the land, and the weather of the biomes under the camera, by the land's `mix`. List terrain3d before weather3d, skydome3d and clouds3d |
| `dismember3d` | `land` | gore laid on the land |
| `kinematics3d` | `behaviors` | the `triangles` target: a body moved across the land, round and onto the solids `world.kinematics3d.mods.solids` names, by `world.kinematics3d.kinds.<kind>.triangles` (`radius`, `height`, `step`, `maxSlope`, `slopeBand`, `slide`, `wade`, `span`, `probe`, `bodies`) |
| `nav3d` | `height`, `link`, `behaviors` | nav3d's bake lays its graph on the land (`rawAt`), a link refused where the water is deeper than the bake's `wade` or a piece is steeper than its `slope`, walked in pieces of `sample` metres; its `ground` ways cost their `data.nav3d.cost`, else their length along their shape |
| `shapes3d` | `height` | `rawAt`, so a body walking shapes3d's ground stands on the land wherever no shape is |
| `ocean3d` | `land` | the seabed tile baked from `depth`, re-baked when `edits()` moves |
| `cutscene` | `land` | points, marks and shots stood on the land on the page, as its server half stands them on `heightAt` |

A plugin a game owns that needs the land gets a mod beside its own plugin,
`games/<game>/plugins/<p>/terrain3d.<p>.ts`, since a top-level plugin names no game's plugin
(`building-a-plugin`).

## Errors it throws

Each names its culprit:

- The program: `terrain3d node <i> has no id`, `has two nodes <id>`, `node <id> reads <param> <x>,
  which is not a node before it`, `program out <x> is none of its nodes`, `op <x> is none of …`,
  `noise <k> is none of …`, `fold`/`ease`/`mode`/`metric … is none of …`, `remaps from <a> to <a>,
  which is no span`, `has two biomes nodes`, `has no biomes in its list`, `sharp … is not above 0`.
- The analysis: `terrain3d analysis records <n> is not a whole number above 0`.
- The ground: `terrain3d field has no ground`, `ground has no layers`, `ground compose <x> is none of
  stack, normalise, sharpened`, `ground layer <k> has no name` / `names no map` / `scale … is not
  above 0`, `has two layers <name>`, `layer <k> rule <j> reads <q>, which is none of the land
  record's keys: …`, `noise freq … is not above 0`, `warp octave <j> stretch is not [x, y, z]`,
  `ground layer <k> names <x>, which is no texture entry of the loader's catalogue`.
- Surfaces and strokes: `edge width/ragged/scale …`, `terrain3d stroke surface <s> is none of the
  surfaces`, `stroke verb <v> is none of …`.
- Rings: `terrain3d has no rings`, `ring <k> reaches <r> m, which can leave ring <k−1>'s hole
  uncovered: it needs a reach of at least <n> m`.
- Bake: `terrain3d bake has no rings`, `bake ring <i> side … is not above 0` / `is not wider than
  ring <i−1>'s`, `bake res … is not a whole number of at least 512`, `bake far … is not beyond near`,
  `bake band … is not between 0 and 0.5`, `bake budget … is not above 0`, `bake ring <i> is <s> m a
  side, which reaches past the ground the rings draw: its side may be at most <n> m`.
- Maps: `terrain3d maps near … is not a whole number of at least 1`, `maps reach … is not above 0`,
  `maps step … is not above 0 and within reach`, `maps small … is not a whole number of at least 16`.
- Mods: `weather3d has biomes and the scene names no world.weather3d.mods.land`, `<p> is listed
  before terrain3d, whose <mod> it reads that frame`, `<p>'s <mod> is terrain3d's, which this scene
  does not list`.

## Common mistakes

| Mistake | Fix |
|---|---|
| A 3D actor left at y = 0, under the land | Only solids and walker stand a row on the land themselves, through their mods. Any other actor's `actors` entry has the land's height at its x, z written into `pos[1]`: `height.ts <game> <scene> <x> <z>` prints it, and `--actors` lists every entry's (`auditing-a-game`) |
| A plugin field `ground: 'terrain3d'` then `plugins[ground]` | A `land` or `ground` mod named in `world.<p>.mods` |
| `terrain3d` listed after `render3d` or after skydome3d | Before both. Listed after render3d it lags a frame silently |
| Using `heightAt` for a walker on a flooded land | The walker mod uses `rawAt` plus `depthAt` on purpose, so bodies wade |
| Expecting a dry valley below 0 to hold water | Water only exists with `flood: true` |
| The ground draws mid grey | Its maps have not all landed, or one failed (the loader says so in the console) |
| A scatter rule on `biome:meadow` putting trees on the rock in the meadow | `layer:meadow`: the layer that is drawn |
| Many layers at 4K and the page runs out of memory | `maps`: full maps only for the layers near the camera |
| The far ground costs as much as the near | `bake`: past `far` it reads one baked texel |
| Editing a parsed field object in place | Change the file. The loader refills it and terrain3d compares content |
| `static: true` on a big place | Only when the finest ring covers all of it. Otherwise the land ends at the rings' edge |
| Screenshotting a preloading scene before it is done and calling the black frame a bug | Wait for the loading screen to go, or for `ground.shown()` |

## Where it is proven

Beside the plugin, in node, one happy path each: `terrain3d.sim.test.ts` (the ground a rule reads),
`terrain3d.plugin.test.ts` (the rings a page draws), `terrain3d.present.test.ts`, and a test for the
box3d, box3dvehicle (its page `land`), flight3d, hitscan3d, nav3d, scatter3d (its server `ground`), solids and
walker mods (`terrain3d.<p>.test.ts`). The skydome3d, cutscene, ocean3d, ragdoll3d and scatter3d page
mods are proven by their consumers' tests. Nothing proves box3dvehicle's `grip` and `drag` mods yet,
nor the baked rings and the near maps' arrays, which need WebGL. Run only the file beside what changed:
`yarn vitest run plugins/terrain3d/<file>`. A change to the field or the look is looked at in Chrome
(`verifying-3d-visuals`), on demo_terrain3d's `dev.html`, whose ground-view menu sets `tdDebug`.

Related: `writing-the-look` (the ground beside the sky and the sea), `building-a-level` (the land as
the place a game is played in), `building-a-plugin` (writing a new `terrain3d.<p>.ts`).
