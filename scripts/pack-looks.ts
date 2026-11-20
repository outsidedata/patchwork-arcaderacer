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
// throws, naming it and the call.
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
  const one = (call: string, part: Shader | null): Shader | null => (part ? { ...part, fragmentPars: packed(call, part.fragmentPars) } : null)
  return {
    calls: { solid: one('solid', calls.solid), relief: one('relief', calls.relief), seeThrough: one('seeThrough', calls.seeThrough), all: one('all', calls.all) },
    vertexPars: packed('vertex', vertexPars),
    settings: { width: Math.max(1, ...rows.map(r => r.length)), materials: rows },
  }
}

export function packLooks({ uniforms, ...file }: Composed): Looks {
  const { calls, vertexPars, settings } = pack(file.calls, file.vertexPars, uniforms, file.materials.length)
  return { ...file, calls, vertexPars, settings }
}
