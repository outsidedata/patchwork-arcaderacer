import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bake, tools } from './bake.ts'
import { downloads, fakeLibrary, fakeProng, fakeSet } from './cc0.fake.ts'

let root: string
let log: string

// An executable shell script named `name` in the root's `bin/`, which appends its arguments, one line a
// call, to the log, then runs `body`; `$last` is its last argument.
const tool = (name: string, body: string) => {
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true })
  const file = path.join(root, 'bin', name)
  fs.writeFileSync(file, `#!/bin/sh\necho "${name} $* PATCHWORK_LIBRARY=$PATCHWORK_LIBRARY" >> "${log}"\nfor a; do last=$a; done\n${body}\n`, { mode: 0o755 })
  return file
}

// Every bake tool, faked so each passes health's check.
const fakes = () => ({
  BLENDER: tool('blender', 'echo "Blender 5.1.2"'),
  GLTFPACK: tool('gltfpack', 'while [ $# -gt 0 ]; do [ "$1" = -o ] && out=$2; shift; done\nprintf "glTF EXT_texture_webp" > "$out"'),
  // a WebP or a PNG written to its last argument; asked for a mean (`info:`), a mean
  MAGICK: tool('magick', 'if [ "$last" = info: ]; then echo 0.25; else printf "RIFF\\000\\000\\000\\000WEBPVP8 " > "${last#PNG32:}"; fi'),
  // a KTX2 written to its -output_file
  BASISU: tool('basisu', 'while [ $# -gt 0 ]; do [ "$1" = -output_file ] && out=$2; shift; done\nprintf "\\253KTX 20\\273" > "$out"'),
  PATCHWORK_LIBRARY: path.join(root, 'library'),
})

// A game `name` whose bake is `body`, the body of its default export, handed `t`, the tools.
const game = (name: string, body: string) => {
  fs.mkdirSync(path.join(root, 'games', name, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'games', name, 'assets', `${name}.bake.ts`), `export default async (t) => { ${body} }\n`)
}

const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [])

const ROCK = ['Rock007_4K_Color.jpg', 'Rock007_4K_NormalDX.jpg', 'Rock007_4K_NormalGL.jpg', 'Rock007_4K_Roughness.jpg']

// A game `name` that draws Rock007 at 512, and the library holding the set.
const cc0Game = (name: string) => {
  fakeLibrary(path.join(root, 'library'))
  fakeSet(path.join(root, 'library'), 'Rock007_4K-JPG', ROCK)
  fs.mkdirSync(path.join(root, 'games', name, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'games', name, 'assets', 'cc0-textures.json'), JSON.stringify({
    folder: 'ground', sizes: [512], sets: { rock: { set: 'Rock007_4K-JPG', maps: ['color', 'normal'] } },
  }))
}
const cut = (name: string, file: string) => path.join(root, 'games', name, 'assets', 'ground', file)

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'bake-test-'))
  log = path.join(root, 'calls.log')
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ engines: { node: '>=22.6' } }))
  fs.mkdirSync(path.join(root, 'library'))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('tools', () => {
  it('packs with meshopt and WebP, every named node, mesh, material and extras kept', async () => {
    const t = tools(root, fakes(), root)
    const out = path.join(root, 'built', 'deep', 'a.glb')
    await t.pack('/raw/a.glb', out)
    expect(calls()).toContain(`gltfpack -i /raw/a.glb -o ${out} -cc -kn -km -ke -vpf -tw PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
    expect(fs.readFileSync(out, 'utf8')).toContain('EXT_texture_webp')
  })

  it('cuts a picture square to the size, as WebP at quality 80', async () => {
    const t = tools(root, fakes(), root)
    const out = path.join(root, 'built', 'colour.webp')
    await t.webp('/lib/Big_Color.jpg', out, 1024)
    expect(calls()).toContain(`magick /lib/Big_Color.jpg -resize 1024x1024! -quality 80 ${out} PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
    expect(fs.existsSync(out)).toBe(true)
  })

  it('writes a KTX2 linear and mipmapped in linear, and one of colours sRGB and mipmapped in linear light', async () => {
    const t = tools(root, fakes(), root)
    const lib = `PATCHWORK_LIBRARY=${path.join(root, 'library')}`
    const numbers = path.join(root, 'built', 'rock-normal.ktx2')
    await t.ktx2(['/lib/Rock_NormalGL.jpg'], numbers, 1024)
    expect(calls()).toContain(`basisu -etc1s -linear -mipmap -mip_linear -tex_type 2d -ktx2 -output_file ${numbers} ${path.join(root, 'rock-normal.ktx2.0.png')} ${lib}`)
    const colours = path.join(root, 'built', 'rock-color.ktx2')
    await t.ktx2(['/lib/Rock_Color.jpg'], colours, 512, 'srgb')
    expect(calls()).toContain(`magick /lib/Rock_Color.jpg -resize 512x512! PNG32:${path.join(root, 'rock-color.ktx2.0.png')} ${lib}`)
    expect(calls()).toContain(`basisu -etc1s -srgb -mipmap -mip_srgb -tex_type 2d -ktx2 -output_file ${colours} ${path.join(root, 'rock-color.ktx2.0.png')} ${lib}`)
    expect(fs.readFileSync(colours, 'latin1').slice(1, 7)).toBe('KTX 20')
  })

  it('runs Blender in the background, the library in its environment, ~ as the home folder', async () => {
    const t = tools(root, { ...fakes(), PATCHWORK_LIBRARY: '~/lib' }, root)
    expect(t.library).toBe(path.join(os.homedir(), 'lib'))
    await t.blender(['--python', 'x.py'])
    expect(calls()).toContain(`blender --background --python x.py PATCHWORK_LIBRARY=${path.join(os.homedir(), 'lib')}`)
  })

  it('bakes an effects file\'s flipbooks with core\'s flipbooks.py in Blender', async () => {
    const script = path.resolve(import.meta.dirname, '../tools/workshop/flipbooks.py')
    await tools(root, fakes(), root).flipbooks('/game/assets/fire.json')
    expect(calls()).toContain(`blender --background --python ${script} -- /game/assets/fire.json PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
  })

  it('hands a bake a set\'s maps in the library, downloaded first', async () => {
    fakeLibrary(path.join(root, 'library'))
    fakeSet(path.join(root, 'library'), 'Rock007_4K-JPG', ROCK)
    const dir = path.join(root, 'library', 'textures', 'cc0-textures', 'Rock007_4K-JPG')
    expect(await tools(root, fakes(), root).texture('Rock007_4K-JPG')).toEqual({
      color: path.join(dir, 'Rock007_4K_Color.jpg'),
      normal: path.join(dir, 'Rock007_4K_NormalGL.jpg'),
      roughness: path.join(dir, 'Rock007_4K_Roughness.jpg'),
    })
  })

  it('throws with the output of a tool that fails', async () => {
    const t = tools(root, { ...fakes(), GLTFPACK: tool('broken', 'echo "it broke"; exit 3') }, root)
    await expect(t.pack('/raw/a.glb', path.join(root, 'a.glb'))).rejects.toThrow(/broken -i \/raw\/a\.glb .* failed:\nit broke/s)
  })
})

describe('looks', () => {
  // The library with pro-ng and Rock007, and a looks bake of a stone, a path and a pane.
  const prepared = () => {
    fakeLibrary(path.join(root, 'library'))
    fakeProng(path.join(root, 'library'))
    fakeSet(path.join(root, 'library'), 'Rock007_4K-JPG', ROCK)
    return {
      materials: {
        stone: { look: 'rock', colour: '#ff0000' },
        path: { look: 'cobble', settings: { size: 0.2 } },
        pane: { look: 'glass' },
      },
      out: path.join(root, 'games', 'town', 'assets', 'main.looks.json'),
      pictures: path.join(root, 'games', 'town', 'assets', 'looks'),
    }
  }

  it('composes the materials\' looks through the library\'s pro-ng, in their order, into the three calls and one of all, and writes the JSON', async () => {
    const spec = prepared()
    const made = await tools(root, fakes(), root).looks(spec)
    expect(JSON.parse(fs.readFileSync(spec.out, 'utf8'))).toEqual(made)
    expect(made.picture).toBe(1024)
    expect(made.materials.map(m => [m.name, m.look, m.call])).toEqual([['stone', 'rock', 'solid'], ['path', 'cobble', 'relief'], ['pane', 'glass', 'seeThrough']])
    expect(made.materials[0].colour).toEqual([1, 0, 0])
    expect(made.materials[1].colour[0]).toBeCloseTo(0.2158605, 6)
    expect(made.calls.solid!.ids).toEqual([0])
    expect(made.calls.relief!.ids).toEqual([1])
    expect(made.calls.seeThrough!.ids).toEqual([2])
    expect(made.calls.all!.ids).toEqual([0, 1, 2])
    // the one shader of every material: every look's case, and the relief look's shadow
    for (const id of [0, 1, 2]) expect(made.calls.all!.fragmentPars).toContain(`case ${id}: look_${id}(k); break;`)
    expect(made.calls.all!.fragmentPars).toContain('float lookShadow_1(vec3 Lview) {')
    expect(made.calls.all!.fragmentPars).toContain('case 1: return lookShadow_1(Lview);')
    expect(made.calls.all!.fragmentPars).not.toContain('float lookShadow(int id, vec3 Lview) {\n  \n  return 1.0;')
    expect(made.calls.all!.fragmentPars.match(/float lookShadow\(int id, vec3 Lview\)/g)).toHaveLength(1)
    expect(made.calls.solid!.fragmentPars).not.toContain('lookShadow_1')
    // the settings in the table, a row a material, the setting given over the look's own
    expect(made.settings).toEqual({ width: 2, materials: [[], [{ name: 'size', type: 'float', value: 0.2 }, { name: 'grey', type: 'vec3', value: [0.2, 0.2, 0.2] }], []] })
    // no setting a uniform: each call declares the one sampler, and the path's look reads its texels
    for (const call of ['solid', 'relief', 'seeThrough', 'all'] as const) {
      const f = made.calls[call]!.fragmentPars
      expect(f).not.toMatch(/\bL\d+_/)
      expect(f.startsWith('uniform highp sampler2D lookSettings;\n')).toBe(true)
    }
    for (const call of ['relief', 'all'] as const) {
      expect(made.calls[call]!.fragmentPars).toContain('  p_size = texelFetch(lookSettings, ivec2(0, 1), 0).r;\n  p_grey = texelFetch(lookSettings, ivec2(1, 1), 0).rgb;')
    }
    expect(made.needs).toEqual(['noise'])
    expect(made.vertexPars).toContain('attribute float lookId;')
  })

  it('cuts every picture the looks read to PICTURE square as WebP into the folder, named after its file, the set downloaded first', async () => {
    const spec = prepared()
    const made = await tools(root, fakes(), root).looks(spec)
    const dir = path.join(root, 'library', 'textures', 'cc0-textures', 'Rock007_4K-JPG')
    expect(made.pictures).toEqual([{ asset: 'Rock007_4K_Color', file: 'Rock007_4K_Color.webp', set: 'Rock007_4K-JPG', source: 'Rock007_4K_Color.jpg', colour: true }])
    expect(calls()).toContain(`magick ${path.join(dir, 'Rock007_4K_Color.jpg')} -resize 1024x1024! -quality 80 ${path.join(spec.pictures, 'Rock007_4K_Color.webp')} PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
    expect(fs.readFileSync(path.join(spec.pictures, 'Rock007_4K_Color.webp'), 'latin1')).toMatch(/^RIFF.{4}WEBP/s)
    expect(downloads(path.join(root, 'library'))).toEqual(['Rock007_4K-JPG'])
  })

  it('writes every picture again as one GPU-compressed KTX2 stack beside them, with each colour picture\'s mean, named after the looks file', async () => {
    const spec = prepared()
    const made = await tools(root, fakes(), root).looks(spec)
    expect(made.stack).toEqual({ asset: 'main_pictures', file: 'main.pictures.ktx2', means: [0.25] })
    expect(fs.readFileSync(path.join(spec.pictures, 'main.pictures.ktx2'), 'latin1').slice(1, 7)).toBe('KTX 20')
    const png = path.join(root, 'main.pictures.ktx2.0.png')
    const picture = path.join(spec.pictures, 'Rock007_4K_Color.webp')
    expect(calls()).toContain(`magick ${picture} -resize 1024x1024! PNG32:${png} PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
    expect(calls()).toContain(`basisu -etc1s -linear -mipmap -mip_linear -tex_type 2d -ktx2 -output_file ${path.join(spec.pictures, 'main.pictures.ktx2')} ${png} PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
    expect(calls()).toContain(`magick ${picture} -resize 1024x1024! -colorspace RGB -grayscale Rec709Luminance -format %[fx:mean] info: PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
  })

  it('stacks several pictures as an array in their order, a picture that is not colour meaning 0.2, and leaves a file of no picture as it was', async () => {
    const t = tools(root, fakes(), root)
    const folder = path.join(root, 'looks')
    fs.mkdirSync(folder)
    for (const f of ['a.webp', 'b.webp']) fs.writeFileSync(path.join(folder, f), 'x')
    const looks = { picture: 512, pictures: [{ asset: 'a', file: 'a.webp', set: 's', source: 'a.jpg', colour: true }, { asset: 'b', file: 'b.webp', set: 's', source: 'b.jpg', colour: false }] } as any
    const made = await t.stack(looks, folder, path.join(root, 'town.looks.json'))
    expect(made.stack).toEqual({ asset: 'town_pictures', file: 'town.pictures.ktx2', means: [0.25, 0.2] })
    expect(calls().find(c => c.startsWith('basisu'))).toContain(`-tex_type 2darray -ktx2 -output_file ${path.join(folder, 'town.pictures.ktx2')} ${path.join(root, 'town.pictures.ktx2.0.png')} ${path.join(root, 'town.pictures.ktx2.1.png')}`)
    const none = { picture: 512, pictures: [] } as any
    expect(await t.stack(none, folder, path.join(root, 'bare.looks.json'))).toBe(none)
    await expect(t.stack({ ...looks, pictures: [{ ...looks.pictures[0], file: 'gone.webp' }] }, folder, path.join(root, 'x.looks.json'))).rejects.toThrow(`the looks' picture gone.webp is not in ${folder}, which the stack is made from`)
  })

  it('throws naming a look the library lacks, a setting of the wrong kind, and a picture the set does not hold', async () => {
    const spec = prepared()
    const t = tools(root, fakes(), root)
    await expect(t.looks({ ...spec, materials: { wall: { look: 'funkystone' } } })).rejects.toThrow('material wall: no look funkystone (pro-ng/material/looks/funkystone.js)')
    await expect(t.looks({ ...spec, materials: { path: { look: 'cobble', settings: { size: 'big' as unknown as number } } } })).rejects.toThrow('look cobble: setting size is not a number or a colour [r, g, b]')
    fs.rmSync(path.join(root, 'library', 'fixtures', 'Rock007_4K-JPG', 'Rock007_4K_Color.jpg'))
    await expect(t.looks({ ...spec, materials: { stone: { look: 'rock' } } })).rejects.toThrow(/the looks read Rock007_4K-JPG\/Rock007_4K_Color\.jpg, which the set in the library does not hold/)
    expect(fs.existsSync(spec.out)).toBe(false)
  })

  it('throws naming the library when it has no pro-ng', async () => {
    fakeLibrary(path.join(root, 'library'))
    await expect(tools(root, fakes(), root).looks({ materials: {}, out: path.join(root, 'x.json'), pictures: root })).rejects.toThrow(/has no pro-ng\/material\/compose\.js/)
  })
})

describe('bake', () => {
  it('refuses a game with neither a bake file nor a cc0-textures.json', async () => {
    await expect(bake('nope', root, fakes())).rejects.toThrow('nope has no bake: no games/nope/assets/nope.bake.ts or cc0-textures.json')
  })

  it('cuts a game\'s cc0 maps with no Blender and no gltfpack, which only a bake file needs', async () => {
    cc0Game('valley')
    await bake('valley', root, { ...fakes(), BLENDER: path.join(root, 'no-blender'), GLTFPACK: path.join(root, 'no-gltfpack') })
    const dir = path.join(root, 'library', 'textures', 'cc0-textures', 'Rock007_4K-JPG')
    expect(calls()).toContain(`magick ${path.join(dir, 'Rock007_4K_Color.jpg')} -resize 512x512! -quality 80 ${cut('valley', 'rock-color-512.webp')} PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
    expect(calls()).toContain(`magick ${path.join(dir, 'Rock007_4K_NormalGL.jpg')} -resize 512x512! -quality 80 ${cut('valley', 'rock-normal-512.webp')} PATCHWORK_LIBRARY=${path.join(root, 'library')}`)
    expect(fs.readFileSync(cut('valley', 'rock-normal-512.webp'), 'latin1')).toMatch(/^RIFF.{4}WEBP/s)
    expect(downloads(path.join(root, 'library'))).toEqual(['Rock007_4K-JPG'])
  })

  it('stops a cc0 game when ImageMagick cannot write WebP, cutting nothing', async () => {
    cc0Game('valley')
    await expect(bake('valley', root, { ...fakes(), MAGICK: path.join(root, 'no-magick') })).rejects.toThrow(/imagemagick: /)
    expect(fs.existsSync(cut('valley', 'rock-color-512.webp'))).toBe(false)
  })

  it('cuts a game\'s cc0 maps before its bake file runs', async () => {
    cc0Game('valley')
    const seen = path.join(root, 'seen.txt')
    fs.writeFileSync(path.join(root, 'games', 'valley', 'assets', 'valley.bake.ts'),
      `import fs from 'node:fs'\nexport default async () => fs.writeFileSync(${JSON.stringify(seen)}, String(fs.existsSync(${JSON.stringify(cut('valley', 'rock-color-512.webp'))})))\n`)
    await bake('valley', root, fakes())
    expect(fs.readFileSync(seen, 'utf8')).toBe('true')
  })

  it('stops before the game bakes when a check fails, naming it and its fix', async () => {
    game('racer', `require('fs').writeFileSync(${JSON.stringify(path.join(root, 'baked'))}, 'x')`)
    const failing = { ...fakes(), PATCHWORK_LIBRARY: path.join(root, 'missing') }
    await expect(bake('racer', root, failing)).rejects.toThrow(/library: .*missing is not a folder\n {2}fix: .*PATCHWORK_LIBRARY/)
    expect(fs.existsSync(path.join(root, 'baked'))).toBe(false)
  })

  it('runs the game bake with the tools, its scratch folder gone after', async () => {
    const seen = path.join(root, 'seen.json')
    game('racer', `
      const fs = await import('node:fs')
      const raw = t.scratch('raw.glb')
      fs.writeFileSync(raw, 'plain')
      await t.pack(raw, ${JSON.stringify(path.join(root, 'games/racer/assets/car.glb'))})
      fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ raw, library: t.library, there: fs.existsSync(raw) }))
    `)
    await bake('racer', root, fakes())
    const { raw, library, there } = JSON.parse(fs.readFileSync(seen, 'utf8'))
    expect(there).toBe(true)
    expect(fs.existsSync(raw)).toBe(false)
    expect(library).toBe(path.join(root, 'library'))
    expect(fs.readFileSync(path.join(root, 'games/racer/assets/car.glb'), 'utf8')).toContain('EXT_texture_webp')
  })

  it('removes its scratch folder when the game bake throws', async () => {
    const seen = path.join(root, 'seen.txt')
    game('racer', `(await import('node:fs')).writeFileSync(${JSON.stringify(seen)}, t.scratch('x')); throw new Error('bake broke')`)
    await expect(bake('racer', root, fakes())).rejects.toThrow('bake broke')
    expect(fs.existsSync(path.dirname(fs.readFileSync(seen, 'utf8')))).toBe(false)
  })
})
