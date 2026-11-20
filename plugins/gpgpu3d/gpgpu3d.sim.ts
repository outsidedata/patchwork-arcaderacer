// gpgpu3d: the things of a scene held on the GPU, for every plugin whose own work is done there. It has no
// row, makes no pass and draws nothing. Each frame it is handed the things that stand round the camera,
// packs them into one float texture, and hands any shader the GLSL that reads them: where a line first
// meets one, and how far a point is to move to stand clear of one. A plugin whose particles, strands or
// fabric are moved on the GPU puts that GLSL in its own pass and asks it there, so what it meets is never
// its own to pack or to meet.
//
// This file is the half with no page in it: the types a word's owner writes to, the table of words, the
// GLSL made from it and the packing. `gpgpu3d.plugin.ts` holds the texture.
//
// `world.gpgpu3d`:
//   reach  metres round the camera within which things are held. Each `things` mod is handed it, and hands
//          back what of its own reaches within it.
//   meets  optional, `{ <plugin>: [<plugin>, …] }`: of the plugins that read gpgpu3d, which plugins' things
//          each meets, each one `mods.things` names. A plugin it does not list meets every thing. So grass
//          is pressed by the cars and the bodies and not by the land, and a cape meets the bones of the body
//          that wears it and not the cylinder that body walks as.
//   mods   things     plugins whose `things(plugins, near)` hand back the things they have within `near`,
//                     `{ at: [x, y, z], reach }`, the camera's place and `reach`: each `{ <word>:
//                     <numbers> }`, a thing of that word (shapes3d's shapes, terrain3d's land, anim's and
//                     motion3d's bodies' capsules, box3dvehicle's cars, walker's bodies). They read the
//                     rows this page holds and what their own plugin's browser half holds, so a plugin
//                     with no browser half need not be listed.
//          behaviors  plugins whose `behaviors()` deliver the words, `{ <word>: Behavior }`, each laid over
//                     the last. A plugin may hand things of a word another delivers (walker's bodies are
//                     shapes3d's `cylinder`), and the scene names both.
//          ops        plugins whose `ops()` deliver ops, `{ <word>: Op }`, each laid over gpgpu3d's own: the
//                     operations a sheet's program is written in (`gpgpu3d.ops.ts`, which holds the whole
//                     contract and every op gpgpu3d brings)
//
// gpgpu3d has no word of its own for a thing. A thing of a word no plugin delivers throws, naming the word and
// `world.gpgpu3d.mods.behaviors`.
//
// Ops. Beside the things, gpgpu3d compiles programs: a sheet's list of operations (noise, folds, remaps, the
// clock), written the way terrain3d writes its height program, turned into GLSL that a reader's shader calls
// at a point. The page's half hands them out (`program`, `gpgpu3d.plugin.ts`). A reader asks for one under a
// name of its own and calls the function of each of the program's outputs where it wants the value.
//
// A Behavior, what a word's owner writes:
//   size             how many numbers a thing of the word is on the GPU
//   pack(data, made) those numbers, from the thing's numbers under its word. `made` is `{ own, three }`:
//                    `own` the uniforms the word's `uniforms()` made for this page, whose `value` it may
//                    write (a texture of the thing's own, made with `three`), and gpgpu3d disposes
//   moves(data)      optional, for a thing that moves: `{ key, at }`, `key` the thing's own, the same every
//                    frame, and `at` [x, y, z] a point of it. gpgpu3d holds the metres a second that point
//                    has moved since the frame before, between the moments the two frames draw; a thing
//                    with none, or first handed this frame, is still
//   uniforms()       optional: uniforms of the word's own, made once a page and handed to every shader
//                    beside gpgpu3d's, for what a thing is that numbers alone do not hold (the land's
//                    heights)
//   glsl             GLSL ES 3.00 that declares the word's own uniforms and defines, of thing `s`,
//                      bool <word>Line(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal)
//                    where the line from `o` along the unit `d` first meets it within `far` metres: `t`
//                    metres along it, `normal` the thing's there, facing back toward the line's start; and
//                      bool <word>Push(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth)
//                    whether the point `x` is nearer than `clear` metres to it, or inside it: `normal` the
//                    way out and `depth` the metres along it `x` is to move to stand `clear` clear. A face
//                    with no inside keeps `x` on the side of it `was` was on.
//                    It reads the thing's numbers with `gp(s, k)`, number `k` of those `pack` handed back,
//                    or four at a time with `gpRow(s, j)`, numbers 4j to 4j + 3. Every name it defines
//                    begins with its word, since it is put in another plugin's shader beside every other
//                    word's.
//
// The texture. `WIDE` texels across. A thing is `texels` texels, the same for every word: one of its word's
// place in the table and the metres a second it moves, then its numbers, room for the longest word's. Thing
// `s` starts at texel `s · texels`. The things are held plugin by plugin, in `mods.things`' order.
//
// The GLSL (`glslOf`), what one reader's shader is handed, `spans` the plugins whose things it meets: the
// uniforms `gpThings`, the texture, `gpSpan`, where each of those plugins' things start and how many they
// are, and `gpCount`, how many things it meets in all; `gp(s, k)`, `gpRow(s, j)`, `gpWord(s)`, a thing's
// word's place in the table, and `gpVel(s)`, the metres a second it moves; every word's GLSL; and
//   int gpThing(int i)       the thing that is the reader's `i`-th, `i` from 0 to `gpCount`
//   bool gpLineOf(int s, …)  `<word>Line` of thing `s`, whatever its word
//   bool gpPushOf(int s, …)  `<word>Push` of thing `s`
//   bool gpLine(vec3 from, vec3 dir, float far, out float t, out vec3 normal)
//                            where the line from `from` along the unit `dir` first meets any thing the
//                            reader meets within `far` metres, false where it meets none
// Every name of gpgpu3d's own begins with `gp`.
import type { Plugins } from '#engine/browser.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

export type Thing = Record<string, any>
export type Near = { at: number[]; reach: number }
export type Things = (plugins: Plugins, near: Near) => Thing[]
export type Uniforms = Record<string, { value: any }>
export type Behavior = {
  size: number
  pack(data: any, made: { own: Uniforms; three: any }): number[]
  moves?(data: any): { key: string; at: number[] }
  uniforms?(): Uniforms
  glsl: string
}
export type Behaviors = () => Record<string, Behavior>
// The words a scene's mods deliver, in the order a thing's word is numbered by, and the texels a thing is.
export type Table = { words: string[]; behaviors: Record<string, Behavior>; texels: number }
// What gpgpu3d hands a plugin that reads it (`gpgpu3d.plugin.ts`, `shader`).
export type Shader = { glsl: string; uniforms: Uniforms; words: string[]; things(): Thing[] }

// The point `at` metres in the frame of an object whose world matrix's elements are `e`, that frame's scale
// taken off: where a thing a bone carries stands, for the plugins that hand such things.
export function carried(e: ArrayLike<number>, at: number[]): number[] {
  const out = [e[12], e[13], e[14]]
  for (let a = 0; a < 3; a++) {
    const l = Math.hypot(e[a * 4], e[a * 4 + 1], e[a * 4 + 2]) || 1
    for (let k = 0; k < 3; k++) out[k] += (e[a * 4 + k] / l) * at[a]
  }
  return out
}

// The width of the things texture, in texels.
export const WIDE = 1024

const WORLD = ['reach', 'meets', 'mods']

// The plugins `world.gpgpu3d.mods.things` names, in its order.
export const handing = (world: Record<string, any>): string[] => [world.gpgpu3d.mods?.things ?? []].flat()

// `world.gpgpu3d` read: a field it does not know throws, a `reach` that is no length, and a `meets` that
// names a plugin `mods.things` does not.
export function check(world: Record<string, any>): { reach: number; meets: Record<string, string[]> } {
  const own = world.gpgpu3d
  if (!own) throw new Error('gpgpu3d is listed, and the scene has no world.gpgpu3d')
  for (const k of Object.keys(own)) if (!WORLD.includes(k)) throw new Error(`world.gpgpu3d has ${k}, which gpgpu3d does not know`)
  if (typeof own.reach !== 'number' || !(own.reach > 0)) throw new Error(`world.gpgpu3d.reach is ${JSON.stringify(own.reach)}, and it is the metres round the camera things are held within`)
  const meets = own.meets ?? {}
  if (typeof meets !== 'object' || Array.isArray(meets)) throw new Error(`world.gpgpu3d.meets is ${JSON.stringify(meets)}, and it is { <plugin>: [<plugin>, …] }`)
  const names = handing(world)
  for (const [who, list] of Object.entries(meets)) {
    if (!Array.isArray(list)) throw new Error(`world.gpgpu3d.meets.${who} is ${JSON.stringify(list)}, and it is a list of the plugins whose things ${who} meets`)
    for (const n of list) if (!names.includes(n)) throw new Error(`world.gpgpu3d.meets.${who} names ${JSON.stringify(n)}, which world.gpgpu3d.mods.things does not: ${names.join(', ')}`)
  }
  return { reach: own.reach, meets }
}

export function tableOf(world: Record<string, any>): Table {
  const behaviors: Record<string, Behavior> = Object.assign({}, ...modsOf<Behaviors>(world, 'gpgpu3d', 'behaviors').map(f => f()))
  const words = Object.keys(behaviors)
  return { words, behaviors, texels: 1 + Math.ceil(Math.max(0, ...words.map(w => behaviors[w].size)) / 4) }
}

const each = (t: Table, call: (word: string) => string) =>
  t.words.map((w, i) => `  ${i ? 'else ' : ''}if (word == ${i}) return ${call(w)};`).join('\n')

// The GLSL of a reader that meets the things of `spans` plugins.
export const glslOf = (t: Table, spans: number) => /* glsl */ `
#define GP_WIDE ${WIDE}
#define GP_TEXELS ${t.texels}
#define GP_SPANS ${Math.max(1, spans)}
uniform highp sampler2D gpThings;
uniform int gpSpan[2 * GP_SPANS];
uniform int gpCount;
vec4 gpTexel(int i) { return texelFetch(gpThings, ivec2(i % GP_WIDE, i / GP_WIDE), 0); }
vec4 gpRow(int s, int j) { return gpTexel(s * GP_TEXELS + 1 + j); }
float gp(int s, int k) { return gpRow(s, k >> 2)[k & 3]; }
int gpWord(int s) { return int(gpTexel(s * GP_TEXELS).x); }
vec3 gpVel(int s) { return gpTexel(s * GP_TEXELS).yzw; }
int gpThing(int i) {
  for (int k = 0; k < GP_SPANS; k++) {
    if (i < gpSpan[2 * k + 1]) return gpSpan[2 * k] + i;
    i -= gpSpan[2 * k + 1];
  }
  return 0;
}
${t.words.map(w => t.behaviors[w].glsl).join('\n')}
bool gpLineOf(int s, vec3 from, vec3 dir, float far, out float t, out vec3 normal) {
  int word = gpWord(s);
${each(t, w => `${w}Line(s, from, dir, far, t, normal)`)}
  return false;
}
bool gpPushOf(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth) {
  int word = gpWord(s);
${each(t, w => `${w}Push(s, x, was, clear, normal, depth)`)}
  return false;
}
bool gpLine(vec3 from, vec3 dir, float far, out float t, out vec3 normal) {
  bool met = false;
  t = far;
  normal = vec3(0.0);
  for (int i = 0; i < gpCount; i++) {
    float st = 0.0;
    vec3 sn = vec3(0.0);
    if (gpLineOf(gpThing(i), from, dir, far, st, sn) && (!met || st < t)) { met = true; t = st; normal = sn; }
  }
  return met;
}
`

// The things as the texture holds them, `texels` texels each. `owns` is each word's own uniforms, and
// `speed` the metres a second a moving thing's point has moved.
export function pack(t: Table, things: Thing[], owns: Record<string, Uniforms>, three: any, speed: (key: string, at: number[]) => number[]): Float32Array {
  const stride = t.texels * 4
  const data = new Float32Array(Math.max(1, things.length) * stride)
  things.forEach((thing, s) => {
    const word = Object.keys(thing)[0]
    const i = t.words.indexOf(word)
    if (i < 0) throw new Error(`gpgpu3d has no behavior for thing ${s}, of the word ${word}: no plugin world.gpgpu3d.mods.behaviors names delivers it`)
    const b = t.behaviors[word]
    data[s * stride] = i
    if (b.moves) {
      const { key, at } = b.moves(thing[word])
      data.set(speed(`${word} ${key}`, at), s * stride + 1)
    }
    data.set(b.pack(thing[word], { own: owns[word], three }), s * stride + 4)
  })
  return data
}
