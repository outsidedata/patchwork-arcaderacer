// gpgpu3d's keeper: what a thing on the GPU is, worked out once and kept in textures, a texel a thing, so the
// shader that draws or moves it each frame reads it back and works out only what moves. A blade of grass's
// place, height and colour, a lock of hair's stiffness and curl: each is a number of the sheet, a roll of the
// thing's own and whatever the sheet's program of ops (`gpgpu3d.ops.ts`) says at the thing's point, and none
// of it changes from frame to frame. A reader that ran it in its shader would run it for every vertex of every
// frame. A reader hands the keeper its values and reads each through the function the keeper writes for it,
// and has no other way to a program's output, so nothing that stands still is worked out twice.
//
// This file is the keeper with no GPU in it: what is kept and where (`plan`), and the GLSL of the shader that
// keeps it and of the reading a reader's shader holds. `gpgpu3d.plugin.ts`'s `keeper(plugins, spec)` makes the
// textures and draws into them.
//
// A Spec is what a reader writes:
//   prefix    letters, put before every GLSL name the keeper makes (`g`: `gValTall()`, `gOutHeight()`)
//   what      the reader's thing as a sentence names it (`grass3d grass meadow`)
//   name      the program's own word in every name of its GLSL, letters and digits
//   program   optional, the sheet's program of ops
//   outs      `{ <name>: { kind, none?, wrap? } }`: each name the program's `out` may give, a number or a
//             colour. The keeper writes a function for each, `float <prefix>Out<Name>()` or
//             `vec3 <prefix>Out<Name>( vec3 base )`: the program's where it gives the name, `wrap` round it
//             (`#` the program's value, as `max( #, 0.0 )`), and where it does not, `none` (1.0 for a number,
//             `base` for a colour, when left out)
//   values    the values of a thing, in order (a Value, below)
//   setups    `{ <name>: { declare, run } }`: GLSL several values share, `declare` its globals and `run` the
//             statements that fill them, run once a thing before the first value that `needs` it
//   helpers   GLSL of the reader's own that reads the outs' functions, put after them in both shaders
//   keeping   the keeping shader's own: `head`, the GLSL before the program (the reader's uniforms, its
//             rolls, the globals its values read, and `float gpRollOf( int salt )`, the thing's own random
//             number for the op `roll`); and `begin`, statements run for each thing, with `i` its number in
//             its slot and `tag` the slot's two numbers in scope: they set the reader's globals and `point`,
//             the point the program is run at, and `return` where there is no thing to keep
// A Value:
//   name      letters and digits; the reader reads it with `<prefix>Val<Name>()`
//   size      its channels, 1 to 4: a float or a vec
//   outs      the names of `outs` its GLSL reads
//   own       whether something of the thing's own is in it (a roll, its place), so it is kept whether or
//             not the sheet has a program
//   group     who reads it. A reader's shader asks for the groups it reads (a shadow's shader the ones that
//             shape a thing), and values of different groups never share a texture
//   half      kept in half floats
//   gate      of size 1: a thing whose kept value is 0 or under keeps nothing more
//   needs     the setups it reads
//   glsl      its GLSL, an expression of the reader's globals, its helpers and the outs' functions
//   plain     what it is with no output of the program in it, where that is simpler than `glsl`
//   live      `{ keeps, glsl }`, for a value whose still part is worth keeping when it moves: `keeps` the
//             expression kept in its place, `glsl` the expression each frame, `#` what was kept
//
// What becomes of a value. A name of `outs` is live when the program gives it and it moves
// (`gpgpu3d.ops.ts`, Still and moving), or when a value that reads a live name reads it too. A value that
// reads a live name is `live`: its GLSL runs in the reader's shader each frame, over the live half of the
// program. A value that is the thing's `own`, or reads a name the program gives, is `kept`: worked out by the
// keeping shader, once, over the still half. Any other is `plain`: the sheet's own number, kept nowhere. The
// kept values are packed into textures of four channels, those of one group and one precision together, and
// after them the program's kept nodes, the values the live half reads that do not move.
//
// The keeping shader is drawn once for each four textures (`passes`), a square for each slot written. A slot
// is a rectangle of texels at its place in the grid, a texel a thing; `tag` is two numbers of the reader's
// for the slot (grass3d's tile).
//
// A reading is the GLSL a reader's shader holds, after its own uniforms and globals: the live half of the
// program, the outs' functions, the helpers, and
//   void <prefix>ValOf( ivec2 slot, int i )   the thing read from here on: thing `i` of the slot, the slot
//                                             wrapped into the grid
//   void <prefix>ValPoint( vec3 p )           the point the live half is run at, given once, after the
//                                             reader's globals are set
//   <type> <prefix>Val<Name>()                each value of the groups asked for, whatever became of it
// A kept value's texture is fetched the first time a value in it is read, so a reader that stops at a gate
// fetches no more.
import type { Kind, Part, Program } from './gpgpu3d.ops.ts'

export type Uniforms = Record<string, { value: any }>
export type Value = {
  name: string; size: 1 | 2 | 3 | 4; outs: string[]; own: boolean; group: string
  half?: boolean; gate?: boolean; needs?: string[]
  glsl: string; plain?: string; live?: { keeps: string; glsl: string }
}
export type Spec = {
  prefix: string; what: string; name: string; program?: Program
  outs: Record<string, { kind: Kind; none?: string; wrap?: string }>
  values: Value[]
  setups?: Record<string, { declare: string; run: string }>
  helpers?: string
  keeping: { head: string; begin: string }
}
// A program compiled, as `gpgpu3d.plugin.ts`'s `program` hands it back.
export type Programmed = { glsl: string; outs: Record<string, string>; kinds: Record<string, Kind>; at: string; moves: Record<string, boolean>; kept: string[]; uniforms: Uniforms }
// What became of a value, and where it is kept: its texture and channels, -1 and '' where nothing of it is.
export type Held = { how: 'plain' | 'kept' | 'live'; texture: number; swizzle: string; value: Value }
// What is kept and where: each value, each texture (whether of half floats, its group, the GLSL of each of its
// channels in the keeping shader), `nodes` the first texture of the program's kept nodes, `live` the live
// names of `outs`, and the textures each draw of the keeping shader fills.
export type Layout = { values: Record<string, Held>; textures: { half: boolean; group: string; channels: string[] }[]; nodes: number; live: string[]; passes: number[][] }
// A reading: its GLSL, the textures it reads by their place in the layout, and the uniforms its program reads.
export type Reading = { glsl: string; textures: number[]; uniforms: Uniforms }
export type Plan = {
  layout: Layout
  // the uniforms the still half of the program reads
  uniforms: Uniforms
  vertex: string
  // each draw of the keeping shader: the textures it fills and its fragment shader
  passes: { textures: number[]; fragment: string }[]
  reading(groups?: string[]): Reading
}

// The room a reader's things are kept in: `cols` by `rows` slots of `count` things each, the uniforms its
// keeping shader reads, and for the sentence thrown when it is more than the GPU holds, what it is and what to
// lower.
export type Roomed = { cols: number; rows: number; count: number; uniforms: Uniforms; what: string; hint: string }
// A room as the plugin hands it back (`gpgpu3d.plugin.ts`, `keeper`).
export type Room = {
  // the GLSL of a reading and the uniforms it reads: the room's textures, its grid, the program's own
  reading(groups?: string[]): { glsl: string; uniforms: Uniforms }
  // the slot at (col, row) is to hold the things of the tag (a, b): written at the next `keep` unless it does
  want(col: number, row: number, a: number, b: number): void
  // what the slot at (col, row) holds is no longer right; `staleAll`, every slot
  stale(col: number, row: number): void
  staleAll(): void
  // every slot wanted and not held, written: how many
  keep(renderer: any): number
  held(): number
  drew(): number
  textures(): { width: number; height: number; half: boolean }[]
  dispose(): void
}
export type Kept = { layout: Layout; room(room: Roomed): Room }

const word = (name: string) => name[0].toUpperCase() + name.slice(1)
const typeOf = (size: number) => (size === 1 ? 'float' : `vec${size}`)

// What is kept of a spec's things and the shaders that keep and read it. `compile` compiles the spec's
// program, whole or a half of it, and is left out for a spec with none.
export function plan(spec: Spec, compile?: (part?: Part) => Programmed): Plan {
  const P = spec.prefix
  const moves = compile?.().moves ?? {}
  const live = new Set(Object.keys(moves).filter(o => moves[o]))
  for (let again = true; again;) {
    again = false
    for (const v of spec.values) {
      if (!v.outs.some(o => live.has(o))) continue
      for (const o of v.outs) if (o in moves && !live.has(o)) { live.add(o); again = true }
    }
  }
  const lives = [...live]
  const still = compile?.({ live: lives, of: 'still' })

  const textures: Layout['textures'] = []
  const values: Record<string, Held> = {}
  for (const value of spec.values) {
    const how = value.outs.some(o => live.has(o)) ? 'live' : value.own || value.outs.some(o => o in moves) ? 'kept' : 'plain'
    const held: Held = (values[value.name] = { how, texture: -1, swizzle: '', value })
    if (how === 'plain' || (how === 'live' && !value.live)) continue
    let t = textures.findIndex(x => x.half === !!value.half && x.group === value.group && x.channels.length + value.size <= 4)
    if (t < 0) t = textures.push({ half: !!value.half, group: value.group, channels: [] }) - 1
    const at = textures[t].channels.length
    held.texture = t
    held.swizzle = 'rgba'.slice(at, at + value.size)
    for (let c = 0; c < value.size; c++) textures[t].channels.push(value.size === 1 ? `v_${value.name}` : `v_${value.name}.${'xyzw'[c]}`)
  }
  const nodes = textures.length
  const keeps = still?.kept ?? []
  for (let n = 0; n < keeps.length; n += 4) textures.push({ half: false, group: '', channels: keeps.slice(n, n + 4).map(f => `${f}()`) })
  for (const t of textures) while (t.channels.length < 4) t.channels.push('0.0')
  const passes: number[][] = []
  for (let t = 0; t < textures.length; t += 4) passes.push(Array.from({ length: Math.min(4, textures.length - t) }, (_, n) => t + n))
  const layout: Layout = { values, textures, nodes, live: lives, passes }

  // The function of each name of `outs`, over the half of the program a shader holds.
  const outputs = (half: Programmed | undefined) => Object.entries(spec.outs).map(([name, o]) => {
    const f = half?.outs[name]
    if (o.kind === 'colour') return `vec3 ${P}Out${word(name)}( vec3 base ) { return ${f ? `${f}( base )` : o.none ?? 'base'}; }`
    return `float ${P}Out${word(name)}() { return ${f ? (o.wrap ?? '#').replace('#', `${f}()`) : o.none ?? '1.0'}; }`
  }).join('\n')
  const setupNames = Object.keys(spec.setups ?? {})
  const setups = setupNames.map(name => {
    const s = spec.setups![name]
    return `${s.declare}\nbool ${P}Set${word(name)} = false;\nvoid ${P}Setup${word(name)}() { if ( ${P}Set${word(name)} ) return; ${P}Set${word(name)} = true; ${s.run} }`
  }).join('\n')
  const ready = (v: Value) => (v.needs ?? []).map(n => `${P}Setup${word(n)}();`).join(' ')

  const vertex = /* glsl */ `
precision highp float;
precision highp int;
uniform ivec2 ${P}ValGrid;
in vec3 position;
in vec4 ${P}ValSlot;
out vec2 ${P}ValTag;
void main() {
  ${P}ValTag = ${P}ValSlot.zw;
  gl_Position = vec4( ( ${P}ValSlot.xy + position.xy ) / vec2( ${P}ValGrid ) * 2.0 - 1.0, 0.0, 1.0 );
}
`
  const stored = Object.values(values).filter(k => k.texture >= 0)
  const kept = (k: Held) => (k.how === 'kept' ? k.value.glsl : k.value.live!.keeps)
  const gates = stored.filter(k => k.value.gate && k.how === 'kept')
  const fragment = (pass: number[]) => {
    const here = stored.filter(k => pass.includes(k.texture) && !gates.includes(k))
    const line = (k: Held) => `  ${ready(k.value)}\n  ${typeOf(k.value.size)} v_${k.value.name} = ${kept(k)};`
    return /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
uniform ivec2 ${P}ValPatch;
uniform int ${P}ValCount;
in vec2 ${P}ValTag;
${pass.map((_, n) => `layout(location = ${n}) out vec4 gpkOut${n};`).join('\n')}
${spec.keeping.head}
${still?.glsl ?? ''}
${outputs(still)}
${spec.helpers ?? ''}
${setups}
void main() {
${pass.map((_, n) => `  gpkOut${n} = vec4( 0.0 );`).join('\n')}
  ivec2 gpkAt = ivec2( gl_FragCoord.xy );
  ivec2 gpkPx = gpkAt - ( gpkAt / ${P}ValPatch ) * ${P}ValPatch;
  int i = gpkPx.y * ${P}ValPatch.x + gpkPx.x;
  if ( i >= ${P}ValCount ) return;
  vec2 tag = floor( ${P}ValTag + 0.5 );
  vec3 point = vec3( 0.0 );
${spec.keeping.begin}
${still ? `  ${still.at}( point );` : ''}
${gates.map(k => `${line(k)}\n  if ( v_${k.value.name} <= 0.0 ) return;`).join('\n')}
${here.map(line).join('\n')}
${pass.map((t, n) => `  gpkOut${n} = vec4( ${textures[t].channels.join(', ')} );`).join('\n')}
}
`
  }

  const reading = (groups?: string[]): Reading => {
    const mine = Object.values(values).filter(k => !groups || groups.includes(k.value.group))
    const half = compile?.({ live: lives, of: 'live', outs: groups && [...new Set(mine.flatMap(k => k.value.outs))] })
    const handed = (half?.kept ?? []).map((name, n) => ({ name, texture: nodes + (n >> 2), channel: 'rgba'[n & 3] })).filter(k => k.name)
    const read = [...new Set([...mine.filter(k => k.texture >= 0).map(k => k.texture), ...handed.map(k => k.texture)])].sort((a, b) => a - b)
    const fetched = (k: Held) => `${P}ValF${k.texture}().${k.swizzle}`
    const of = (k: Held) => {
      if (k.how === 'kept') return fetched(k)
      if (k.how === 'plain') return k.value.plain ?? k.value.glsl
      return k.value.live ? k.value.live.glsl.replace('#', fetched(k)) : k.value.glsl
    }
    const glsl = /* glsl */ `
uniform ivec2 ${P}ValPatch;
uniform ivec2 ${P}ValGrid;
${read.map(t => `uniform highp sampler2D ${P}ValT${t};`).join('\n')}
${half?.glsl ?? ''}
${outputs(half)}
${spec.helpers ?? ''}
ivec2 ${P}ValTexel;
${read.map(t => `vec4 ${P}ValC${t};\nbool ${P}ValH${t} = false;\nvec4 ${P}ValF${t}() { if ( !${P}ValH${t} ) { ${P}ValC${t} = texelFetch( ${P}ValT${t}, ${P}ValTexel, 0 ); ${P}ValH${t} = true; } return ${P}ValC${t}; }`).join('\n')}
${setups}
void ${P}ValOf( ivec2 slot, int i ) {
  ivec2 s = slot - ${P}ValGrid * ivec2( floor( vec2( slot ) / vec2( ${P}ValGrid ) ) );
  ${P}ValTexel = s * ${P}ValPatch + ivec2( i - ( i / ${P}ValPatch.x ) * ${P}ValPatch.x, i / ${P}ValPatch.x );
  ${read.map(t => `${P}ValH${t} = false;`).join(' ')} ${setupNames.map(n => `${P}Set${word(n)} = false;`).join(' ')}
}
void ${P}ValPoint( vec3 p ) {
  ${half ? `${half.at}( p );` : ''}
${handed.map(k => `  ${k.name} = ${P}ValF${k.texture}().${k.channel};`).join('\n')}
}
${mine.map(k => `${typeOf(k.value.size)} ${P}Val${word(k.value.name)}() { ${k.how === 'kept' || (k.how === 'plain' && k.value.plain) ? '' : ready(k.value)} return ${of(k)}; }`).join('\n')}
`
    return { glsl, textures: read, uniforms: half?.uniforms ?? {} }
  }
  const readings = new Map<string, Reading>()
  return {
    layout, uniforms: still?.uniforms ?? {}, vertex,
    passes: passes.map(pass => ({ textures: pass, fragment: fragment(pass) })),
    reading(groups) {
      const key = groups ? groups.join('\n') : '\n'
      if (!readings.has(key)) readings.set(key, reading(groups))
      return readings.get(key)!
    },
  }
}
