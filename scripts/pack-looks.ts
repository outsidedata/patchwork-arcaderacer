// A looks file as the library writes it made supershader3d's: every setting moved out of uniforms
// into one table, `lookSettings`, a row a material and a texel a setting
// (`plugins/supershader3d/supershader3d.plugin.ts`, The settings). The library's
// `pro-ng/material/compose.js` writes each setting of material `id` as `uniform float|vec3
// L<id>_<name>;` and copies it once, `p_<name> = L<id>_<name>;`, at the top of the material's look,
// and a GPU holds only so many uniforms a program (MAX_FRAGMENT_UNIFORM_VECTORS, 1024 on many),
// which a scene of many materials passes. Each declaration is taken out, each copy reads its texel
// instead, `.r` for a float and `.rgb` for a vec3, and the sampler is declared once at the head of
// each call. The vertex side, `vertexPars`, is moved the same way: a look's vertex code reads its
// material's settings through the same two forms. An `L<id>_` that is neither form, or names a setting the file does not hand back,
// throws, naming it and the call. Each call's fragment side then has its materials' copies of one look
// folded into one function (`fold`), so its program holds a function a look, not one a material.
//
// `packLooks(file)` takes the file the library writes, `uniforms` in place of `settings`: the bake's
// `looks` tool's (`bake.ts`), and the file pro-ng's own build writes beside a town
// (`pro-ng/look_bake.mjs`), which a game's bake copies in and runs this on. It is a module of its
// own so a game's bake, which `bake.ts` imports while it runs, can import it without waiting on
// `bake.ts`.
import type { Looks, Setting, Shader } from '#plugins/supershader3d/supershader3d.plugin.ts'

export type Uniforms = Record<string, { type: 'float' | 'vec3'; value: number | number[] }>
export type Composed = Omit<Looks, 'settings'> & { uniforms: Uniforms }

export function pack(calls: Looks['calls'], vertexPars: string, uniforms: Uniforms, count: number): { calls: Looks['calls']; vertexPars: string; settings: Looks['settings'] } {
  const rows: Setting[][] = Array.from({ length: count }, () => [])
  const slot = new Map<string, { id: number; at: number; type: 'float' | 'vec3' }>()
  for (const [uniform, { type, value }] of Object.entries(uniforms)) {
    const m = uniform.match(/^L(\d+)_(\w+)$/)
    if (!m || Number(m[1]) >= count) throw new Error(`the looks file hands back the setting ${uniform}, which is no L<id>_<name> of its ${count} materials`)
    const id = Number(m[1])
    slot.set(uniform, { id, at: rows[id].length, type })
    rows[id].push({ name: m[2], type, value: Array.isArray(value) ? [...value] : value })
  }
  // one side's GLSL with its settings read from the table, the sampler declared at its head
  const packed = (call: string, pars: string): string => {
    const known = (uniform: string) => {
      const s = slot.get(uniform)
      if (!s) throw new Error(`the ${call} call reads ${uniform}, which is no setting the looks file hands back`)
      return s
    }
    const text = pars
      .replace(/^uniform (float|vec3) (L\d+_\w+);\n/gm, (_, type, uniform) => {
        if (known(uniform).type !== type) throw new Error(`the ${call} call declares ${uniform} a ${type}, which the looks file hands back as a ${known(uniform).type}`)
        return ''
      })
      .replace(/^([ \t]*)(p_\w+) = (L\d+_\w+);$/gm, (_, indent, local, uniform) => {
        const { id, at, type } = known(uniform)
        return `${indent}${local} = texelFetch(lookSettings, ivec2(${at}, ${id}), 0).${type === 'vec3' ? 'rgb' : 'r'};`
      })
    const left = text.match(/\bL\d+_\w+\b/)
    if (left) throw new Error(`the ${call} call reads ${left[0]} other than by its declaration and its copy into p_, which cannot be moved into the settings table`)
    return `uniform highp sampler2D lookSettings;\n${text}`
  }
  // a call's fragment side packed and its looks folded; the vertex side is not folded, as `vertexMain`,
  // which calls its functions, is not this module's to rewrite
  const one = (call: string, part: Shader | null): Shader | null => (part ? { ...part, fragmentPars: fold(call, packed(call, part.fragmentPars)) } : null)
  return {
    calls: { solid: one('solid', calls.solid), relief: one('relief', calls.relief), seeThrough: one('seeThrough', calls.seeThrough), all: one('all', calls.all) },
    vertexPars: packed('vertex', vertexPars),
    settings: { width: Math.max(1, ...rows.map(r => r.length)), materials: rows },
  }
}

// The index of the bracket that closes the one opened at `open`.
function closing(text: string, open: number): number {
  const pair: Record<string, string> = { '(': ')', '{': '}' }
  const shut = pair[text[open]]
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++
    else if (text[i] === shut && --depth === 0) return i
  }
  throw new Error(`pack-looks: the ${text[open]} at ${open} is never closed`)
}

// A call's fragment GLSL with every material's copy of a look folded into one function a look. compose.js
// writes a look's function once per material, `<name>_<id>`, the copies the same but for the row each
// reads its settings from (`ivec2(<slot>, <id>)`); a scene of four hundred materials and forty looks is a
// program of four hundred functions and near a million characters, which a browser's shader compiler
// may refuse (Firefox's does, and a material whose program does not link is not drawn). Every function
// `<name>_<id>` whose body, its own row read as `lookRow`, is another's of the same name and parameters
// is dropped for the first of them, which takes the row as a last parameter, `int lookRow`; each call
// `<name>_<id>(...)` calls that one with `<id>` after its arguments. A body that differs anywhere but
// its row is a look of its own. The text is returned as it is when no function is so named, and one
// that names `lookRow` already throws.
export function fold(call: string, text: string): string {
  const head = /^(\w+) (\w+?)_(\d+)\(([^)]*)\) \{$/gm
  type Copy = { name: string; id: number; start: number; end: number; key: string; params: string; ret: string; body: string }
  const copies: Copy[] = []
  for (const m of text.matchAll(head)) {
    const [, ret, name, digits, params] = m
    const id = Number(digits)
    const open = m.index! + m[0].length - 1
    const shut = closing(text, open)
    const body = text.slice(open + 1, shut).replace(new RegExp(`ivec2\\((\\d+), ${id}\\)`, 'g'), 'ivec2($1, lookRow)')
    copies.push({ name, id, start: m.index!, end: shut + 1, key: `${ret} ${name}(${params})${body}`, params, ret, body })
  }
  if (copies.length === 0) return text
  if (/\blookRow\b/.test(text)) throw new Error(`the ${call} call names lookRow already, which folding its looks would declare`)
  // the function each copy is folded into: the first of its name whose text is its own
  const first = new Map<string, Copy>()
  const into = new Map<string, Copy>()
  for (const c of copies) {
    if (!first.has(c.key)) first.set(c.key, c)
    into.set(`${c.name}_${c.id}`, first.get(c.key)!)
  }
  // the definitions rewritten from the last back, so each one's place in the text still holds
  let out = text
  for (const c of [...copies].reverse()) {
    const kept = first.get(c.key) === c
    const params = c.params.trim() ? `${c.params}, int lookRow` : 'int lookRow'
    const replacement = kept ? `${c.ret} ${c.name}_${c.id}(${params}) {${c.body}}` : ''
    let end = c.end
    if (!kept && out[end] === '\n') end++
    out = out.slice(0, c.start) + replacement + out.slice(end)
  }
  // every call of a copy made a call of the function it was folded into, its row after its arguments
  const calls = new RegExp(`\\b(${[...new Set(copies.map(c => c.name))].join('|')})_(\\d+)\\(`, 'g')
  let done = ''
  let at = 0
  for (const m of out.matchAll(calls)) {
    const target = into.get(`${m[1]}_${m[2]}`)
    if (!target) continue
    const open = m.index! + m[0].length - 1
    // a kept definition's own head is no call
    if (/^\s*\w+\s*$/.test(out.slice(out.lastIndexOf('\n', m.index!) + 1, m.index!)) && out.slice(closing(out, open) + 1).startsWith(' {')) continue
    const shut = closing(out, open)
    const args = out.slice(open + 1, shut)
    done += `${out.slice(at, m.index!)}${target.name}_${target.id}(${args.trim() ? `${args}, ` : ''}${m[2]})`
    at = shut + 1
  }
  return done + out.slice(at)
}

export function packLooks({ uniforms, ...file }: Composed): Looks {
  const { calls, vertexPars, settings } = pack(file.calls, file.vertexPars, uniforms, file.materials.length)
  return { ...file, calls, vertexPars, settings }
}
