// grass3d: ground cover made on the GPU round the camera, blade by blade: what a blade is worked out once and
// kept in a texture, what moves it worked out each frame. It has no row: no rule reads a blade of grass, and every seat draws its own,
// the same blades from the same ground. This half is what the browser half (`grass3d.plugin.ts`) and its
// workers (`grass3d.worker.ts`) both read: the scene's numbers and their check, the levels a grass is drawn
// in, the window of ground held round the camera, and the arithmetic that reads a block of that ground off
// the land.
//
// `world.grass3d`:
//   grasses    the name in the scene's `loader` catalogue of the grasses file, a `json` entry with
//              `preload`: every number of the grass a scene grows (The grasses file, below), as
//              particle3d's `effects` names its effects file
//   mods       land      the page's: `land(plugins)` → `{ ground, version, cell, shown?, prepared?, worker? }`,
//                         or undefined while it has none (`terrain3d.grass3d.ts`). `ground` answers
//                         `height(x, z)`, `cover(x, z)`, `ramp(rule, x, z)` and `rules(list, what)` (which
//                         throws a sentence naming `what` and a rule it cannot answer); `version` moves when
//                         the land does; `cell` is the metres between the lattice points the ground is drawn
//                         through, which the blades stand on exactly; `shown` whether the land is on the
//                         scene; `prepared` `[x, z]`, a place the camera is about to jump to; `worker`
//                         `{ url, held }`, the module whose `worker(held)` makes the same ground in a worker.
//                         With none named it throws.
//              wind      the page's, optional: `wind(plugins)` → `{ wind: [x, z], drift: [x, z] }`, the wind
//                         in metres a second and its integral in metres (`weather3d.grass3d.ts`), or undefined
//                         while it has none. With none named, the grasses file's `wind` blows.
//              pressed   the page's, optional, one plugin: `pressed(plugins)` → `{ glsl, uniforms, words,
//                         things() }`, the things that may press the grass, held on the GPU: the GLSL that
//                         reads them and the uniforms it reads, the words in the order the GLSL numbers
//                         them, and the things as they were last filled (gpgpu3d's, `gpgpu3d.grass3d.ts`,
//                         the things `world.gpgpu3d.meets.grass3d` names; gpgpu3d is listed before
//                         grass3d). With none named nothing presses the grass.
//              behaviors the page's, optional, any number: `behaviors()` → `{ <word>: Press }`, how a thing
//                         of a word presses the grass (Pressing, below), each laid over the last
//                         (`box3dvehicle.grass3d.ts`: `hyperbox`, every car's body and wheels;
//                         `walker.grass3d.ts`: `cylinder`, every walking body). A thing of a word none
//                         delivers presses nothing: the land is a thing too.
//              keeper    the page's: `keeper(plugins)` → `(spec)` → `{ layout, room(...) }`, what keeps each
//                         blade once it is worked out, and compiles a grass's `program` with it
//                         (`gpgpu3d.grass3d.ts`: gpgpu3d's keeper, `gpgpu3d.keeper.ts`, gpgpu3d listed before
//                         grass3d). With none named it throws. grass3d's own op, `dist`, is delivered to
//                         gpgpu3d by `grass3d.gpgpu3d.ts`, which the scene names under
//                         `world.gpgpu3d.mods.ops`.
//
// Pressing. The grass bends away from a thing that stands over it, within `trample.reach` of its footprint,
// and is trampled, lying away from the thing's middle, where the thing treads the ground. A Press is what
// a word's owner writes:
//   glsl      GLSL that defines, of thing `s` as the `pressed` mod's GLSL holds it,
//               bool <word>Press(int s, vec3 root, float tall, out float out_, out vec2 middle)
//             whether the thing stands over a blade rooted at `root` and `tall` metres high: `out_` the
//             metres the root stands outside its footprint, 0 under it, and `middle` its middle on the
//             ground, which the blade bends away from
//   span(data)   `{ at, reach }`: the thing's middle [x, y, z] and the metres round it, over the ground,
//             within which it may tread
//   trodden(data, x, y, z, { tread, cell })   whether it treads the ground point (x, y, z): `tread` the
//             metres over the ground within which a thing's underside tramples it, `cell` the metres
//             between the points of the ground, each of which stands for the cell round it
//
// The grasses file:
//   budget     milliseconds a frame the page fills ground in, where it has no workers; at least one block
//   wind      `{ toward, speed }`: the wind with no `wind` mod, blowing toward `toward` degrees clockwise from
//              north (0 toward −z, 90 toward +x), `speed` metres a second; its drift is its speed times the
//              page's clock
//   gust       `{ scale, strength, flutter, rate }`: gusts are patches `scale` metres across carried over the
//              grass by the wind's drift, the wind's bend at a blade 1 − strength + 2·strength·g of its
//              mean, g the gust there from 0 to 1; every blade flutters `flutter` of its height at `rate`
//              radians a second, spread a fifth either way from blade to blade, more as the wind rises
//   bend       the share of a blade's height its tip is blown over by each metre a second of wind, at most
//              0.85
//   trample    `{ recover, reach }`: seconds a trampled blade takes to stand most of the way back up (it
//              rises as exp(−age/recover)); metres from a thing that presses it over which a blade is bent
//              away from it
//   grasses    name to a Grass, each drawn over the same ground
// A Grass:
//   rules      `[{ q, lo, hi }]` over the land's record (terrain3d's `layer:<name>`, `slope`, `water`...):
//              each ramp multiplies the share of the ground the grass covers there, times the land's `cover`
//              (a painted road's 0). A blade stands where its own roll is under that share, and grows in
//              over the last 0.15 of it, so an edge is ragged, never a line
//   density    blades a square metre within `full` metres of the camera; past it the density falls as
//              (full / d)², so the blades on screen stay the same in number however far the grass reaches
//   full       metres
//   reach      metres from the camera the grass reaches; `fade` the metres inside it over which the blades
//              shrink into the ground
//   tile       metres: the side of the square a blade's place is rolled in. A blade is the i-th of its tile,
//              the same blade at every distance, and the i-th blade is drawn while the density at it times
//              tile² is over i, growing in over the last blade's worth, so it thins out blade by blade and
//              never pops
//   program    optional, a program of ops (`plugins/gpgpu3d/gpgpu3d.ops.ts`: nodes in order, each an `op` and
//              its numbers and inputs, and `out`): what the ground and the sheet say about where a blade
//              stands, worked out on the GPU for each blade at its foot, `vec3(x, ground height, z)`. The
//              names `out` may give, each a number below 0 counts as 0 for; a name it does not give leaves
//              that part of the blade as the numbers below make it. Each name but `dry` has the field of the
//              grass it works on, and multiplies it where the blade stands:
//                height        × the blade's height
//                width         × its width
//                lean          × its lean
//                cover         × the share of the ground the grass covers there (`rules`' share), so 0 grows none
//                bright        × its brightness
//                vary          × `vary`, how far its brightness strays
//                ao            × `ao`, how dark it is at the root
//                translucency  × `translucency`, the light through it
//                roughness     × `roughness`, its shine (at most 1)
//                bend          × `bend`, how far the wind blows its tip over, so 0 is a blade the wind never moves
//                dryAmount     × `dry.amount`, how far the dry patches turn it
//                dry           0 to 1, where the dry patches lie, in place of the grass's own noise
//              and three colours, each `{ r, g, b }` of nodes or a tint `{ to: "#c8b040", by: <node> }` of the
//              colour the grass has (`gpgpu3d.ops.ts`, `out`):
//                rootColour    in place of `colours.root`
//                tipColour     in place of `colours.tip`
//                dryColour     in place of `colours.dry`
//              gpgpu3d's `roll` (`salt`) is the blade's own random number, 0 to 1, another for each salt, and
//              beside gpgpu3d's ops a program reads `dist` (the blade's metres from the camera)
//   height     [base, spread] metres: a blade is base·(1 − spread/2 + spread·roll) tall
//   width      [base, spread] metres at its root, rolled the same, and wider as the density falls:
//              ((d / full)²)^widen, at most `widest` times, so the far grass covers as the near grass does
//   lean       its tip bent over this share of its height, each blade its own way, with no wind
//   segments   the segments of a blade in each level, nearest first; the last stands for every level after
//   chunks     the squares each level is drawn in across each side, each culled to the camera on its own
//   colours    `{ root, tip, dry }`: a blade runs root to tip; dry patches turn it toward `dry`
//   dry        `{ amount, scale }`: how far the dry patches turn it, their size in metres
//   vary       how far a blade's brightness strays from 1
//   translucency  how much light comes through a blade lit from behind
//   roughness  the blades' roughness
//   ao         how much darker a blade is at its root than at its tip, within `full` metres; it fades out by
//              four times `full`, so a far blade seen whole from above is not a dark speck
//   shadow     metres from the camera within which blades cast shadows; 0 none
//
// Levels. A grass is drawn in levels: level 0 is every tile nearer than 2·full, level k ≥ 1 every tile
// whose nearest point lies from full·2^k to full·2^(k+1), out to `reach`. Level k draws ⌈density·tile²/4^k⌉
// blades a tile, which is every blade any tile of it can stand, since the density at full·2^k is
// density/4^k. Each level is a square of tiles round the camera's tile, a whole number of `chunks` across.
// A tile of the square outside its level's band draws nothing, a chunk outside it is not drawn at all.
//
// The window. The ground is held in a square of lattice points `cell` apart round the camera, in blocks
// of BLOCK points a side, the square snapped to whole blocks and `blocks` across, wide enough that every
// blade within `reach` of a camera anywhere in its middle block stands on it. A block is filled once and
// held while it stays in the window. `fill` reads one block off the land: each point's height and, for each
// grass, the share of it covered.
import type { Plugins } from '#engine/browser.ts'
import type { Kind, Program } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'
import type { Kept, Spec } from '#plugins/gpgpu3d/gpgpu3d.keeper.ts'

export type Rule = { q: string; lo: number; hi: number }
// The names a grass's `program` may give to `out`, and whether each is a number or a colour.
export const OUTS: Record<string, Kind> = {
  height: 'number', width: 'number', lean: 'number', cover: 'number', bright: 'number', vary: 'number', ao: 'number',
  translucency: 'number', roughness: 'number', bend: 'number', dryAmount: 'number', dry: 'number',
  rootColour: 'colour', tipColour: 'colour', dryColour: 'colour',
}
export type Grass = {
  rules: Rule[]; program?: Program; density: number; full: number; reach: number; fade: number; tile: number
  height: [number, number]; width: [number, number]; widen: number; widest: number; lean: number
  segments: number[]; chunks: number
  colours: { root: string; tip: string; dry: string }; dry: { amount: number; scale: number }
  vary: number; translucency: number; roughness: number; ao: number; shadow: number
}
// `world.grass3d`: the grasses file's entry and the mods.
export type Numbers = { grasses: string; mods?: { land?: string; keeper?: string; wind?: string; pressed?: string; behaviors?: string | string[] } }
// The grasses file.
export type Grass3d = {
  budget: number
  wind: { toward: number; speed: number }
  gust: { scale: number; strength: number; flutter: number; rate: number }
  bend: number
  trample: { recover: number; reach: number }
  grasses: Record<string, Grass>
}
// The ground a `land` mod answers, on the page and in a worker.
export type Ground = {
  height(x: number, z: number): number
  cover(x: number, z: number): number
  ramp(rule: Rule, x: number, z: number): number
  rules(list: Rule[], what: string): Rule[]
}
export type Land = { ground: Ground; version: string; cell: number; shown?: boolean; prepared?: number[]; worker?: { url: string; held: unknown } }
export type LandMod = (plugins: Plugins) => Land | undefined
export type Wind = { wind: [number, number]; drift: [number, number] }
export type WindMod = (plugins: Plugins) => Wind | undefined
// What the `pressed` mod hands back, and how a word presses the grass (Pressing).
export type Pressed = (plugins: Plugins) => { glsl: string; uniforms: Record<string, { value: any }>; words: string[]; things(): Record<string, any>[] }
export type Press = {
  glsl: string
  span(data: any): { at: number[]; reach: number }
  trodden(data: any, x: number, y: number, z: number, slack: { tread: number; cell: number }): boolean
}
export type Presses = () => Record<string, Press>
// What the `keeper` mod hands back: the function that makes the keeper of one grass's blades from its spec
// (`gpgpu3d.keeper.ts`).
export type Keeper = (plugins: Plugins) => (spec: Spec) => Kept

// Lattice points a side of a block of the window.
export const BLOCK = 32
// Heights at or below this are no ground: terrain3d's erased ground answers −1e9.
export const NOWHERE = -1e8

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const whole = (v: unknown, lo: number): v is number => Number.isInteger(v) && (v as number) >= lo
const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(finite)
const colour = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)

// Throws a sentence naming the first number of the grasses file that is wrong, and, handed the land's
// ground, the first rule of a grass it cannot answer.
export function check(s: Grass3d, ground?: Ground) {
  const no = (what: string, v: unknown, is: string) => { throw new Error(`grass3d ${what} ${JSON.stringify(v)} is not ${is}`) }
  if (!finite(s.budget) || s.budget <= 0) no('budget', s.budget, 'a number of milliseconds above 0')
  if (!s.wind || !finite(s.wind.toward)) no('wind toward', s.wind?.toward, 'a number of degrees')
  if (!finite(s.wind.speed) || s.wind.speed < 0) no('wind speed', s.wind.speed, 'a number of metres a second at or above 0')
  const g = s.gust
  if (!g || !finite(g.scale) || g.scale <= 0) no('gust scale', g?.scale, 'a number of metres above 0')
  if (!finite(g.strength) || g.strength < 0 || g.strength > 1) no('gust strength', g.strength, 'a number from 0 to 1')
  if (!finite(g.flutter) || g.flutter < 0 || g.flutter > 1) no('gust flutter', g.flutter, 'a number from 0 to 1')
  if (!finite(g.rate) || g.rate < 0) no('gust rate', g.rate, 'a number of radians a second at or above 0')
  if (!finite(s.bend) || s.bend < 0 || s.bend > 0.85) no('bend', s.bend, 'a number from 0 to 0.85')
  if (!s.trample || !finite(s.trample.recover) || s.trample.recover <= 0) no('trample recover', s.trample?.recover, 'a number of seconds above 0')
  if (!finite(s.trample.reach) || s.trample.reach < 0) no('trample reach', s.trample.reach, 'a number of metres at or above 0')
  if (!s.grasses || typeof s.grasses !== 'object' || !Object.keys(s.grasses).length) no('grasses', s.grasses, 'a table of at least one grass')
  for (const [name, x] of Object.entries(s.grasses)) {
    const what = (k: string) => `grass ${name} ${k}`
    if (!Array.isArray(x.rules)) no(what('rules'), x.rules, 'a list of rules')
    x.rules.forEach((r, k) => { if (!r || typeof r.q !== 'string' || !finite(r.lo) || !finite(r.hi)) no(what(`rule ${k}`), r, '{ q, lo, hi }') })
    if (ground) ground.rules(x.rules, `grass3d grass ${name}`)
    if (x.program !== undefined && (!x.program || !Array.isArray(x.program.nodes) || !x.program.out || typeof x.program.out !== 'object')) no(what('program'), x.program, '{ nodes: [...], out: { <name>: <node id> } }')
    if (!finite(x.density) || x.density <= 0) no(what('density'), x.density, 'a number of blades a square metre above 0')
    if (!finite(x.full) || x.full <= 0) no(what('full'), x.full, 'a number of metres above 0')
    if (!finite(x.reach) || x.reach <= x.full) no(what('reach'), x.reach, `a number of metres beyond its full ${x.full}`)
    if (!finite(x.fade) || x.fade < 0 || x.fade > x.reach) no(what('fade'), x.fade, `a number of metres from 0 to its reach ${x.reach}`)
    if (!finite(x.tile) || x.tile <= 0) no(what('tile'), x.tile, 'a number of metres above 0')
    if (!pair(x.height) || x.height[0] <= 0 || x.height[1] < 0 || x.height[1] > 2) no(what('height'), x.height, '[base metres above 0, spread from 0 to 2]')
    if (!pair(x.width) || x.width[0] <= 0 || x.width[1] < 0 || x.width[1] > 2) no(what('width'), x.width, '[base metres above 0, spread from 0 to 2]')
    if (!finite(x.widen) || x.widen < 0) no(what('widen'), x.widen, 'a number at or above 0')
    if (!finite(x.widest) || x.widest < 1) no(what('widest'), x.widest, 'a number at or above 1')
    if (!finite(x.lean) || x.lean < 0 || x.lean > 0.85) no(what('lean'), x.lean, 'a number from 0 to 0.85')
    if (!Array.isArray(x.segments) || !x.segments.length || !x.segments.every(n => whole(n, 1))) no(what('segments'), x.segments, 'a list of whole numbers of at least 1')
    if (!whole(x.chunks, 1)) no(what('chunks'), x.chunks, 'a whole number of at least 1')
    if (!x.colours || !colour(x.colours.root) || !colour(x.colours.tip) || !colour(x.colours.dry)) no(what('colours'), x.colours, '{ root, tip, dry }, each a colour #rrggbb')
    if (!x.dry || !finite(x.dry.amount) || x.dry.amount < 0 || x.dry.amount > 1) no(what('dry amount'), x.dry?.amount, 'a number from 0 to 1')
    if (!finite(x.dry.scale) || x.dry.scale <= 0) no(what('dry scale'), x.dry.scale, 'a number of metres above 0')
    if (!finite(x.vary) || x.vary < 0 || x.vary > 1) no(what('vary'), x.vary, 'a number from 0 to 1')
    if (!finite(x.translucency) || x.translucency < 0) no(what('translucency'), x.translucency, 'a number at or above 0')
    if (!finite(x.roughness) || x.roughness < 0 || x.roughness > 1) no(what('roughness'), x.roughness, 'a number from 0 to 1')
    if (!finite(x.ao) || x.ao < 0 || x.ao > 1) no(what('ao'), x.ao, 'a number from 0 to 1')
    if (!finite(x.shadow) || x.shadow < 0) no(what('shadow'), x.shadow, 'a number of metres at or above 0')
  }
}

// One level of a grass (Levels): the band of nearest distances [from, to) its tiles stand in, the blades a
// tile, the segments a blade, and its square: `side` tiles across, `chunks` chunks of `chunk` tiles a side.
export type Level = { k: number; from: number; to: number; blades: number; segments: number; side: number; chunk: number; chunks: number }

export function levelsOf(g: Grass): Level[] {
  const out: Level[] = []
  for (let k = 0; ; k++) {
    const from = k === 0 ? 0 : g.full * 2 ** k
    if (from >= g.reach) break
    const to = Math.min(g.reach, g.full * 2 ** (k + 1))
    const blades = Math.ceil((g.density * g.tile * g.tile) / 4 ** k)
    // Every tile whose nearest point is nearer than `to` from a camera anywhere in the middle tile.
    const across = 2 * Math.ceil(to / g.tile) + 1
    const chunk = Math.ceil(across / g.chunks)
    out.push({ k, from, to, blades, segments: g.segments[Math.min(k, g.segments.length - 1)], side: chunk * g.chunks, chunk, chunks: g.chunks })
  }
  return out
}

// The window (The window): `blocks` blocks a side, enough that a blade `reach` metres from a camera
// anywhere in the middle block stands inside it.
export function windowOf(cell: number, reach: number) {
  const half = Math.ceil(reach / cell / BLOCK) + 1
  return { blocks: 2 * half + 1, half }
}

// The block the lattice point nearest under x lies in, along one axis.
export const blockOf = (x: number, cell: number) => Math.floor(Math.floor(x / cell) / BLOCK)

// One block of the ground: the heights of its BLOCK² lattice points, row by row along x, each `cell`
// apart from (bx·BLOCK·cell, bz·BLOCK·cell), and each grass's share covered there, grass by grass for each
// point. A point with no ground (erased) has no grass.
export type Filled = { bx: number; bz: number; heights: Float32Array; keeps: Float32Array }

export function fill(ground: Ground, bx: number, bz: number, cell: number, rules: Rule[][]): Filled {
  const G = rules.length
  const heights = new Float32Array(BLOCK * BLOCK), keeps = new Float32Array(BLOCK * BLOCK * G)
  for (let j = 0; j < BLOCK; j++) {
    for (let i = 0; i < BLOCK; i++) {
      const x = (bx * BLOCK + i) * cell, z = (bz * BLOCK + j) * cell
      const h = ground.height(x, z), n = j * BLOCK + i
      heights[n] = h
      if (h <= NOWHERE) continue
      const cover = ground.cover(x, z)
      for (let k = 0; k < G; k++) {
        let keep = cover
        for (const r of rules[k]) { if (keep <= 0) break; keep *= ground.ramp(r, x, z) }
        keeps[n * G + k] = Math.max(0, Math.min(1, keep))
      }
    }
  }
  return { bx, bz, heights, keeps }
}
