// hair3d: hair, fur and manes grown on the skin of a body that is posed by its bones, simulated lock by
// lock on the GPU and drawn strand by strand, with nothing stored but where each lock is rooted. It has no
// row: no rule reads a hair, and every seat grows its own, the same locks on the same skin. This half is
// what the browser half (`hair3d.plugin.ts`) and the mods that hand it skins read: the scene's numbers and
// their check, what a skin is, and the arithmetic that roots a hair's locks on one.
//
// `world.hair3d`:
//   hairs   the name in the scene's `loader` catalogue of the hairs file, a `json` entry with `preload`:
//           every number of the hair a scene grows (The hairs file, below), as particle3d's `effects`
//           names its effects file
//   mods    skins      the page's, any number: `skins(plugins)` → `[{ id, kind, skins }]`, every wearer
//                      the plugin draws now: `id` its own for as long as it is drawn, `kind` the kind
//                      whose hairs it wears, `skins` its skins, each what it is under its word
//                      (`{ skinned: <a three SkinnedMesh> }`). `anim.hair3d.ts` and `motion3d.hair3d.ts`
//                      hand each row they draw, its kind the one its `as` names when it names one, else
//                      its own; `puppet3d.hair3d.ts` each row it draws, by its kind; `crowd3d.hair3d.ts`
//                      each body that has people, all of them one wearer of the body's name. With none
//                      named it throws.
//           behaviors  the page's, any number: `behaviors()` → `{ <word>: (plugins, thing) => Skinned }`,
//                      the skin (Skins, below) of a thing of that word, laid over each other in the list's
//                      order. hair3d has no word of its own: `render3d.hair3d.ts` delivers `skinned`, a
//                      three SkinnedMesh, and `crowd3d.hair3d.ts` `posed`, a mesh group of a crowd3d body.
//                      A skin of a word nothing delivers throws, naming the wearer and the word.
//           wind       the page's, optional: `wind(plugins)` → `{ wind: [x, z], drift: [x, z] }`, the wind
//                      in metres a second and its integral in metres (`weather3d.hair3d.ts`), or undefined
//                      while it has none. With none named, the hairs file's `wind` blows.
//           keeper     the page's: `keeper(plugins)` → `(spec)` → `{ layout, room(...) }`, what keeps each
//                      lock and each strand once it is worked out, and compiles a hair's `program` with it
//                      (`gpgpu3d.hair3d.ts`: gpgpu3d's keeper, `gpgpu3d.keeper.ts`). With none named it throws.
//           looks      the page's, optional, one plugin: `looks(plugins)` → `{ idOf(name), material(name,
//                      surface) }`, what draws a hair that names a `look` (`supershader3d.hair3d.ts`)
//           solids     the page's, optional, one plugin: `solids(plugins)` → `{ glsl, uniforms, now() }`,
//                      what every lock is kept out of, as the GPU meets it. `glsl`
//                      defines `hMeetCount` and `hMeetOf` (`hair3d.glsl.ts`, the pass), how many things
//                      there are and how far a point is to move out of one; `uniforms` is what it reads;
//                      `now()` is called the moment the locks are moved, as the scene is drawn (gpgpu3d's,
//                      `gpgpu3d.hair3d.ts`: the things it holds for hair3d, the capsules and balls of anim's,
//                      motion3d's and puppet3d's bodies, a wearer's own head and neck among them, shapes3d's
//                      shapes and terrain3d's land). With none named a lock meets nothing.
//
// The hairs file:
//   wind    `{ toward, speed }`: the wind with no `wind` mod, blowing toward `toward` degrees clockwise from
//           north (0 toward −z, 90 toward +x), `speed` metres a second
//   gust    `{ scale, strength, rate }`: gusts are patches `scale` metres across, the wind at a lock
//           1 − strength + 2·strength·g of its mean, g the gust there from 0 to 1, moving on at `rate` radians
//           a second
//   kinds   kind to `{ hairs }`, the kinds whose wearers wear hair; a wearer of a kind not here wears
//           none. `hairs` names the hairs it wears
//   hairs   name to a Hair
// A Hair:
//   on        where it grows: `{ meshes, bones, weight, cuts, planes, faces }`.
//               meshes  a regular expression matched against the name of each of the wearer's skins
//               bones   bones named by the end of their names (every bone a name ends), and `weight`: a
//                       lock roots only where those bones together hold at least `weight` of the skin, from
//                       0 to 1 (a weight of 0 roots it everywhere on the skins)
//               cuts    `[{ bone, normal, offset }]`, each a plane in the frame of `bone` as the skin was
//                       bound, scale taken off: a lock roots only where the skin is at least `offset` metres
//                       along `normal` from the bone, for every cut
//               planes  `[{ normal, offset }]`, each a plane in the skin's own frame as it was bound (a
//                       body's +y up and +z ahead): a lock roots only where the skin is at least `offset`
//                       metres along `normal` from its origin, for every plane
//               faces   `[{ toward, within }]`: a lock roots only where the skin's normal, as it was bound,
//                       is within `within` degrees of `toward`, for every one
//             A hair that roots nowhere on a skin its `meshes` matches throws.
//   density   locks a square metre of the skin it grows on
//   strands   strands drawn a lock
//   length    [base, spread] metres: a lock is base·(1 − spread/2 + spread·roll) long
//   width     [base, spread] metres at a strand's root, rolled the same; `taper` the share of it left at
//             its tip; `thin` the least width a strand is drawn, in metres a metre from the eye, so a far
//             strand is not thinner than a pixel
//   links     the points a lock is simulated with, past its root; `segments` the pieces a strand is drawn
//             in along the curve through them
//   comb      [x, y, z]: added to the skin's unit normal, in the skin's own frame as it was bound, to make
//             the way a lock lies with nothing pulling on it; [0, 0, 0] stands it straight out of the skin,
//             and a comb that points into the skin lays the lock along it
//   stiffness [root, tip]: how hard each link is pulled back to that way, a second, at the root and at
//             the tip
//   gravity   metres a second squared it falls with
//   damping   the share of its speed it loses, a second, as exp(−damping·t)
//   drag      how fast it takes the wind's speed, a second
//   clump     `{ radius, tight }`: a lock's strands root within `radius` metres of it, and close to
//             1 − tight of that at the tip
//   curl      `{ radius, turns }`: each strand winds round its lock `turns` times, `radius` metres out
//   ragged    the share of its lock's length a strand may fall short by, each strand its own
//   colours   `{ root, tip }`: a strand runs root to tip
//   vary      how far a lock's brightness, and each strand's within it, strays from 1
//   ao        how much darker a strand is at its root than at its tip
//   roughness the strands' roughness
//   shine     `{ strength, power }`: the highlight that runs across the strands, and how tight it is
//   translucency  how much light comes through the hair lit from behind
//   shadow    whether it casts shadows
//   look      optional: the name of a material of the scene's looks (supershader3d's), which draws the strands
//             in place of `colours`, `vary`, `ao`, `roughness`, `shine` and `translucency`, through the `looks`
//             mod; the strands are shaped and moved as ever. A hair with one in a scene that names no `looks`
//             mod throws, and it is not grown until the looks have landed and hold the material.
//   program   optional, a program of ops (`plugins/gpgpu3d/gpgpu3d.ops.ts`: nodes in order, each an `op` and
//             its numbers and inputs, and `out`): what the sheet says about a lock from where it is rooted,
//             worked out on the GPU for each lock at its root on the skin as it was bound, in metres, so a
//             pattern stays where it is on the body however the body moves. gpgpu3d's `roll` (`salt`) is the
//             lock's own random number. A name `out` does not give leaves that part of the hair as the numbers
//             above make it. Each name multiplies the field it works on, a number below 0 counting as 0, but
//             the three of `comb`, which are added to it, and `gravity` and `curlTurns`, which a number below
//             0 turns over:
//               cover          0 to 1, the share of the locks that stand: a lock stands where its own roll is
//                              under it, so 0 is bare skin (a parting, a hairline, a patch)
//               length         × the lock's length
//               width, taper   × `width`'s base and `taper`
//               combX, combY, combZ   + `comb`, in the skin's own frame as it was bound
//               stiffnessRoot, stiffnessTip   × `stiffness`
//               gravity, damping, drag        × each
//               clumpRadius, clumpTight       × `clump`
//               curlRadius, curlTurns         × `curl`
//               ragged, vary, ao, roughness, translucency   × each
//               shineStrength, shinePower     × `shine`
//             and two colours, each `{ r, g, b }` of nodes or a tint `{ to: "#c8b040", by: <node> }` of the
//             colour the hair has (`gpgpu3d.ops.ts`, `out`):
//               rootColour     in place of `colours.root`
//               tipColour      in place of `colours.tip`
//             What a program gives is worked out once for each lock and kept; a name that reads the clock
//             (`time`) is worked out each frame.
//
// Skins. A skin is what a hair is rooted on and carried by, whoever poses it: its `name`, which a hair's
// `on.meshes` matches; its `key`, the same for every skin of one geometry, so the locks of a hair are
// rooted once for all of them; `unit`, the metres one of its own units is; `frames()`, each bone's name
// and frame as the skin was bound, in metres; `skin()`, the whole of it (`Skin`), read once to root on;
// and `pose()`, asked the moment the scene is drawn: the float texture its bones' matrices stand in, four
// texels a bone, `first` the row of the texture its first copy's bones are in, or −1 where the texture is
// three's own of one skeleton, `copies` how many copies of the skin are drawn, each copy's bones the row
// after the one before, and `bind`, what takes a skinned place into the world. A word's behavior makes
// one from a thing of its word.
//
// Rooting. `rootsOf(hair, name, skin)` rolls where a hair's locks root on a skin: over each triangle,
// density times its area of them (the part left over rolled), each at a point rolled on the triangle,
// kept where the hair's bones hold enough of the skin there and every cut, plane and face passes. Each
// lock holds its place and the skin's normal there as the skin was bound, the four bones that hold most of
// it with their shares, its length and a roll of its own. The rolls are a hash of the hair's name, so every
// page roots the same locks.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Kind, Program } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'
import type { Kept, Spec } from '#plugins/gpgpu3d/gpgpu3d.keeper.ts'

// The names a hair's `program` may give to `out`, and whether each is a number or a colour.
export const OUTS: Record<string, Kind> = {
  cover: 'number', length: 'number', width: 'number', taper: 'number', combX: 'number', combY: 'number', combZ: 'number',
  stiffnessRoot: 'number', stiffnessTip: 'number', gravity: 'number', damping: 'number', drag: 'number',
  clumpRadius: 'number', clumpTight: 'number', curlRadius: 'number', curlTurns: 'number', ragged: 'number',
  vary: 'number', ao: 'number', roughness: 'number', shineStrength: 'number', shinePower: 'number', translucency: 'number',
  rootColour: 'colour', tipColour: 'colour',
}
// What the `keeper` mod hands back: the function that makes a keeper from a spec (`gpgpu3d.keeper.ts`).
export type Keeper = (plugins: Plugins) => (spec: Spec) => Kept

export type Cut = { bone: string; normal: [number, number, number]; offset: number }
export type Plane = { normal: [number, number, number]; offset: number }
export type Face = { toward: [number, number, number]; within: number }
export type Hair = {
  on: { meshes: string; bones: string[]; weight: number; cuts: Cut[]; planes: Plane[]; faces: Face[] }
  density: number; strands: number
  length: [number, number]; width: [number, number]; taper: number; thin: number
  links: number; segments: number
  comb: [number, number, number]; stiffness: [number, number]
  gravity: number; damping: number; drag: number
  clump: { radius: number; tight: number }; curl: { radius: number; turns: number }; ragged: number
  colours: { root: string; tip: string }; vary: number; ao: number
  roughness: number; shine: { strength: number; power: number }; translucency: number
  shadow: boolean
  program?: Program
  look?: string
}
// What the `looks` mod hands back: `idOf(name)`, the number of the material `name` of the scene's looks, which
// hair3d writes on every vertex of a strand as `lookId`, and `material(name, surface)`, a new material that draws
// it, dressed with hair3d's surface, which shapes each strand; each undefined for a name the looks have not, or
// while they have not landed.
export type Looks = (plugins: Plugins) => { idOf(name: string): number | undefined; material(name: string, surface: unknown): THREE.Material | undefined }
export type Worn = { hairs: string[] }
// `world.hair3d`: the hairs file's entry and the mods.
export type Numbers = { hairs: string; mods?: { skins?: string | string[]; behaviors?: string | string[]; keeper?: string; wind?: string; solids?: string; looks?: string } }
// What the `solids` mod hands back: the GLSL the pass is made with, the uniforms it reads, and `now`,
// called the moment the locks are moved.
export type Solids = (plugins: Plugins) => { glsl: string; uniforms: Record<string, { value: any }>; now(): void }
// The hairs file.
export type Hair3d = {
  wind: { toward: number; speed: number }
  gust: { scale: number; strength: number; rate: number }
  kinds: Record<string, Worn>
  hairs: Record<string, Hair>
}
export type Wind = { wind: [number, number]; drift: [number, number] }
export type WindMod = (plugins: Plugins) => Wind | undefined

// A bone's name and its frame as the skin was bound, a 4×4 matrix column by column, in metres.
export type Frame = { name: string; bind: ArrayLike<number> }
// A skin as it was bound: each vertex's place (metres) and normal, the four bones that hold it and their
// shares, its triangles, and its bones' frames.
export type Skin = {
  positions: Float32Array; normals: Float32Array; bones: Float32Array; weights: Float32Array
  triangles: Uint32Array
  frames: Frame[]
}
export type Pose = { bones: THREE.Texture; first: number; copies: number; bind: THREE.Matrix4 }
export type Skinned = { name: string; key: string; unit: number; frames(): Frame[]; skin(): Skin; pose(): Pose }
// A skin as a `skins` mod hands it: what it is under its word, `{ skinned: <a three SkinnedMesh> }`.
export type Thing = Record<string, unknown>
export type Wearer = { id: string; kind: string; skins: Thing[] }
export type Skins = (plugins: Plugins) => Wearer[]
// A word's behavior: the skin of a thing of that word, the same one each time it is handed the thing.
export type Behavior = (plugins: Plugins, thing: any) => Skinned
export type Behaviors = () => Record<string, Behavior>
// The locks rooted on a skin, four numbers a lock in each: `at` its place and its length, `normal` the
// skin's normal there and a roll of its own, `bones` the four bones that hold it and `weights` their shares.
export type Roots = { count: number; at: Float32Array; normal: Float32Array; bones: Float32Array; weights: Float32Array }

// The most locks one hair roots on one skin.
export const MOST = 65536

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const whole = (v: unknown, lo: number): v is number => Number.isInteger(v) && (v as number) >= lo
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(finite)
const triple = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(finite)
const way = (v: unknown): v is [number, number, number] => triple(v) && Math.hypot(...v) > 0
const colour = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
const share = (v: unknown): v is number => finite(v) && v >= 0 && v <= 1

// Throws a sentence naming the first value of the hairs file that is wrong.
export function check(s: Hair3d) {
  const no = (what: string, v: unknown, is: string) => { throw new Error(`hair3d: the hairs file's ${what} ${JSON.stringify(v)} is not ${is}`) }
  if (!s.wind || !finite(s.wind.toward)) no('wind toward', s.wind?.toward, 'a number of degrees')
  if (!finite(s.wind.speed) || s.wind.speed < 0) no('wind speed', s.wind.speed, 'a number of metres a second at or above 0')
  const g = s.gust
  if (!g || !finite(g.scale) || g.scale <= 0) no('gust scale', g?.scale, 'a number of metres above 0')
  if (!share(g.strength)) no('gust strength', g.strength, 'a number from 0 to 1')
  if (!finite(g.rate) || g.rate < 0) no('gust rate', g.rate, 'a number of radians a second at or above 0')
  if (!s.hairs || typeof s.hairs !== 'object' || !Object.keys(s.hairs).length) no('hairs', s.hairs, 'a table of at least one hair')
  if (!s.kinds || typeof s.kinds !== 'object' || !Object.keys(s.kinds).length) no('kinds', s.kinds, 'a table of at least one kind')
  for (const [kind, k] of Object.entries(s.kinds)) {
    if (!Array.isArray(k.hairs) || !k.hairs.length) no(`kind ${kind} hairs`, k.hairs, 'a list of at least one hair')
    for (const h of k.hairs) if (!s.hairs[h]) no(`kind ${kind} hair`, h, `one of the hairs ${Object.keys(s.hairs).join(', ')}`)
  }
  for (const [name, x] of Object.entries(s.hairs)) {
    const what = (k: string) => `hair ${name} ${k}`
    const on = x.on
    if (!on || typeof on.meshes !== 'string') no(what('on meshes'), on?.meshes, 'a regular expression')
    try { new RegExp(on.meshes) } catch { no(what('on meshes'), on.meshes, 'a regular expression') }
    if (!Array.isArray(on.bones) || !on.bones.every(b => typeof b === 'string')) no(what('on bones'), on.bones, 'a list of bone names')
    if (!share(on.weight)) no(what('on weight'), on.weight, 'a number from 0 to 1')
    if (!Array.isArray(on.cuts)) no(what('on cuts'), on.cuts, 'a list of cuts')
    on.cuts.forEach((c, i) => {
      if (!c || typeof c.bone !== 'string' || !way(c.normal) || !finite(c.offset)) no(what(`on cut ${i}`), c, '{ bone, normal [x, y, z] longer than 0, offset }')
    })
    if (!Array.isArray(on.planes)) no(what('on planes'), on.planes, 'a list of planes')
    on.planes.forEach((c, i) => {
      if (!c || !way(c.normal) || !finite(c.offset)) no(what(`on plane ${i}`), c, '{ normal [x, y, z] longer than 0, offset }')
    })
    if (!Array.isArray(on.faces)) no(what('on faces'), on.faces, 'a list of faces')
    on.faces.forEach((c, i) => {
      if (!c || !way(c.toward) || !finite(c.within) || c.within <= 0 || c.within > 180) no(what(`on face ${i}`), c, '{ toward [x, y, z] longer than 0, within degrees above 0 and at most 180 }')
    })
    if (!finite(x.density) || x.density <= 0) no(what('density'), x.density, 'a number of locks a square metre above 0')
    if (!whole(x.strands, 1)) no(what('strands'), x.strands, 'a whole number of at least 1')
    if (!pair(x.length) || x.length[0] <= 0 || x.length[1] < 0 || x.length[1] > 2) no(what('length'), x.length, '[base metres above 0, spread from 0 to 2]')
    if (!pair(x.width) || x.width[0] <= 0 || x.width[1] < 0 || x.width[1] > 2) no(what('width'), x.width, '[base metres above 0, spread from 0 to 2]')
    if (!share(x.taper)) no(what('taper'), x.taper, 'a number from 0 to 1')
    if (!finite(x.thin) || x.thin < 0) no(what('thin'), x.thin, 'a number of metres a metre at or above 0')
    if (!whole(x.links, 1) || x.links > 16) no(what('links'), x.links, 'a whole number from 1 to 16')
    if (!whole(x.segments, 1)) no(what('segments'), x.segments, 'a whole number of at least 1')
    if (!triple(x.comb)) no(what('comb'), x.comb, '[x, y, z]')
    if (!pair(x.stiffness) || x.stiffness[0] < 0 || x.stiffness[1] < 0) no(what('stiffness'), x.stiffness, '[root, tip], each a second at or above 0')
    if (!finite(x.gravity)) no(what('gravity'), x.gravity, 'a number of metres a second squared')
    if (!finite(x.damping) || x.damping < 0) no(what('damping'), x.damping, 'a number a second at or above 0')
    if (!finite(x.drag) || x.drag < 0) no(what('drag'), x.drag, 'a number a second at or above 0')
    if (!x.clump || !finite(x.clump.radius) || x.clump.radius < 0) no(what('clump radius'), x.clump?.radius, 'a number of metres at or above 0')
    if (!share(x.clump.tight)) no(what('clump tight'), x.clump.tight, 'a number from 0 to 1')
    if (!x.curl || !finite(x.curl.radius) || x.curl.radius < 0) no(what('curl radius'), x.curl?.radius, 'a number of metres at or above 0')
    if (!finite(x.curl.turns)) no(what('curl turns'), x.curl.turns, 'a number of turns')
    if (!share(x.ragged)) no(what('ragged'), x.ragged, 'a number from 0 to 1')
    if (!x.colours || !colour(x.colours.root) || !colour(x.colours.tip)) no(what('colours'), x.colours, '{ root, tip }, each a colour #rrggbb')
    if (!share(x.vary)) no(what('vary'), x.vary, 'a number from 0 to 1')
    if (!share(x.ao)) no(what('ao'), x.ao, 'a number from 0 to 1')
    if (!share(x.roughness)) no(what('roughness'), x.roughness, 'a number from 0 to 1')
    if (!x.shine || !finite(x.shine.strength) || x.shine.strength < 0) no(what('shine strength'), x.shine?.strength, 'a number at or above 0')
    if (!finite(x.shine.power) || x.shine.power <= 0) no(what('shine power'), x.shine.power, 'a number above 0')
    if (!finite(x.translucency) || x.translucency < 0) no(what('translucency'), x.translucency, 'a number at or above 0')
    if (typeof x.shadow !== 'boolean') no(what('shadow'), x.shadow, 'true or false')
    if (x.look !== undefined && (typeof x.look !== 'string' || !x.look)) no(what('look'), x.look, 'the name of a material of the scene\'s looks')
    if (x.program !== undefined && (!x.program || !Array.isArray(x.program.nodes) || !x.program.out || typeof x.program.out !== 'object')) no(what('program'), x.program, '{ nodes: [...], out: { <name>: <node id> } }')
  }
}

// What of a hair its locks are rooted and built from: a change to any of it roots and builds them again,
// a change to anything else of the hair is read as it draws.
export const builtFrom = (h: Hair) => JSON.stringify([h.on, h.density, h.strands, h.length, h.links, h.segments, h.shadow, h.program, h.look])

// A hair's seed, from its name: the same on every page.
export function seedOf(name: string) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0
  return h % 65521
}

// Rolls from 0 up to 1, the same from the same seed.
function rolls(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A point in a bone's frame as the skin was bound, the frame's scale taken off.
function into(bind: ArrayLike<number>, p: number[]): number[] {
  const out = [0, 0, 0]
  const d = [p[0] - bind[12], p[1] - bind[13], p[2] - bind[14]]
  for (let a = 0; a < 3; a++) {
    const x = bind[a * 4], y = bind[a * 4 + 1], z = bind[a * 4 + 2]
    const l = Math.hypot(x, y, z)
    out[a] = (d[0] * x + d[1] * y + d[2] * z) / l
  }
  return out
}

// The first bone whose name ends with `bone`, or a throw naming `what` asked.
export function boneOf(frames: Frame[], bone: string, what: string): number {
  const i = frames.findIndex(f => f.name.endsWith(bone))
  if (i < 0) throw new Error(`hair3d ${what} names the bone ${bone}, and no bone of the skin ends with it: ${frames.map(f => f.name).join(', ')}`)
  return i
}

export function rootsOf(hair: Hair, name: string, skin: Skin): Roots {
  const on = hair.on
  const grows = skin.frames.map(f => on.bones.some(b => f.name.endsWith(b)))
  for (const b of on.bones) boneOf(skin.frames, b, `hair ${name}: on.bones`)
  const unit = (v: number[]) => { const l = Math.hypot(...v); return v.map(x => x / l) }
  const cuts = on.cuts.map(c => ({ bind: skin.frames[boneOf(skin.frames, c.bone, `hair ${name}: a cut`)].bind, normal: unit(c.normal), offset: c.offset }))
  const planes = on.planes.map(c => ({ normal: unit(c.normal), offset: c.offset }))
  const faces = on.faces.map(c => ({ toward: unit(c.toward), least: Math.cos((c.within * Math.PI) / 180) }))
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const roll = rolls(seedOf(name))
  const P = skin.positions, N = skin.normals, B = skin.bones, W = skin.weights
  const at: number[] = [], normal: number[] = [], bones: number[] = [], weights: number[] = []
  const held = new Map<number, number>()
  for (let t = 0; t < skin.triangles.length; t += 3) {
    const v = [skin.triangles[t], skin.triangles[t + 1], skin.triangles[t + 2]]
    const [a, b, c] = v.map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]])
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const area = 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
    const wanted = hair.density * area
    const many = Math.floor(wanted) + (roll() < wanted - Math.floor(wanted) ? 1 : 0)
    for (let n = 0; n < many; n++) {
      const r1 = Math.sqrt(roll()), r2 = roll(), own = roll(), long = roll()
      const s = [1 - r1, r1 * (1 - r2), r1 * r2]
      const p = [0, 0, 0], q = [0, 0, 0]
      held.clear()
      for (let k = 0; k < 3; k++) {
        const i = v[k]
        for (let x = 0; x < 3; x++) { p[x] += s[k] * P[i * 3 + x]; q[x] += s[k] * N[i * 3 + x] }
        for (let j = 0; j < 4; j++) {
          const w = W[i * 4 + j] * s[k]
          if (w > 0) held.set(B[i * 4 + j], (held.get(B[i * 4 + j]) ?? 0) + w)
        }
      }
      let all = 0, grown = 0
      for (const [bone, w] of held) { all += w; if (grows[bone]) grown += w }
      if (all <= 0 || grown / all < on.weight) continue
      const ql = Math.hypot(q[0], q[1], q[2])
      if (ql === 0) continue
      const face = [q[0] / ql, q[1] / ql, q[2] / ql]
      if (cuts.some(cut => dot(into(cut.bind, p), cut.normal) < cut.offset)) continue
      if (planes.some(plane => dot(p, plane.normal) < plane.offset)) continue
      if (faces.some(f => dot(face, f.toward) < f.least)) continue
      const top = [...held].sort((x, y) => y[1] - x[1]).slice(0, 4)
      const sum = top.reduce((x, y) => x + y[1], 0)
      at.push(p[0], p[1], p[2], hair.length[0] * (1 - hair.length[1] / 2 + hair.length[1] * long))
      normal.push(face[0], face[1], face[2], own)
      for (let j = 0; j < 4; j++) { bones.push(top[j]?.[0] ?? 0); weights.push((top[j]?.[1] ?? 0) / sum) }
    }
  }
  const count = at.length / 4
  if (!count) throw new Error(`hair3d hair ${name} roots nowhere on the skin: its on ${JSON.stringify(on)} leaves no part of it`)
  if (count > MOST) throw new Error(`hair3d hair ${name} roots ${count} locks on one skin, more than the ${MOST} it holds: its density ${hair.density} is too high for the skin it grows on`)
  return { count, at: new Float32Array(at), normal: new Float32Array(normal), bones: new Float32Array(bones), weights: new Float32Array(weights) }
}

// The state texture of `count` locks of `links` links for `copies` copies of a skin: a copy's locks are
// `wide` a row, each lock's root and links one above the other, `high` texels a copy; the copies are tiled
// `cols` across and `tall` down, `width` by `height` texels in all.
export function layout(count: number, links: number, copies: number) {
  const wide = Math.ceil(Math.sqrt(count)), high = Math.ceil(count / wide) * (links + 1)
  const cols = Math.max(1, Math.round(Math.sqrt((copies * high) / wide))), tall = Math.ceil(copies / cols)
  return { wide, high, cols, tall, width: wide * cols, height: high * tall }
}
