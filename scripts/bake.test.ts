import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bake, tools } from './bake.ts'
import { downloads, fakeLibrary, fakeSet } from './cc0.fake.ts'

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
  MAGICK: tool('magick', 'printf "RIFF\\000\\000\\000\\000WEBPVP8 " > "$last"'),
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

  it('runs Blender in the background, the library in its environment, ~ as the home folder', async () => {
    const t = tools(root, { ...fakes(), PATCHWORK_LIBRARY: '~/lib' }, root)
    expect(t.library).toBe(path.join(os.homedir(), 'lib'))
    await t.blender(['--python', 'x.py'])
    expect(calls()).toContain(`blender --background --python x.py PATCHWORK_LIBRARY=${path.join(os.homedir(), 'lib')}`)
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
