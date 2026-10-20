import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atLeast, health, settings, which } from './health.ts'

const core = path.resolve(import.meta.dirname, '..')
let root: string

// A root with a package.json of `deps`, each installed but those in `missing`.
const makeRoot = (deps: string[], missing: string[] = []) => {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    engines: { node: '>=22.6' }, dependencies: Object.fromEntries(deps.map(d => [d, '1'])),
  }))
  for (const d of deps.filter(d => !missing.includes(d))) {
    fs.mkdirSync(path.join(root, 'node_modules', d), { recursive: true })
    fs.writeFileSync(path.join(root, 'node_modules', d, 'package.json'), '{}')
  }
}

// An executable shell script named `name` in `dir`.
const tool = (dir: string, name: string, body: string) => {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name)
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return file
}

const byName = async (shell: Record<string, string | undefined>) =>
  Object.fromEntries((await health(root, shell)).map(r => [r.name, r]))

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'health-test-'))
  makeRoot([])
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('atLeast', () => {
  it('compares part by part, as numbers', () => {
    expect(atLeast('22.22.0', '22.6')).toBe(true)
    expect(atLeast('22.6.0', '22.6')).toBe(true)
    expect(atLeast('22.5.9', '22.6')).toBe(false)
    expect(atLeast('23.0.0', '22.6')).toBe(true)
    expect(atLeast('9.9.9', '22.6')).toBe(false)
  })
})

describe('settings', () => {
  it('reads the root .env, under what the shell set', () => {
    fs.writeFileSync(path.join(root, '.env'), '# a comment\nBLENDER=/from/env\nMAGICK="/quoted"\n')
    expect(settings(root, { BLENDER: '/from/shell' })).toMatchObject({ BLENDER: '/from/shell', MAGICK: '/quoted' })
  })
  it('is the shell alone with no .env', () => {
    expect(settings(root, { A: 'b' })).toEqual({ A: 'b' })
  })
})

describe('which', () => {
  it('finds a bare name on the PATH past the root node_modules', () => {
    const bin = tool(path.join(root, 'node_modules', '.bin'), 'thing', 'exit 0')
    const real = tool(path.join(root, 'bin'), 'thing', 'exit 0')
    const PATH = [path.dirname(bin), path.dirname(real)].join(path.delimiter)
    expect(which('thing', root, { PATH })).toBe(real)
    expect(which('thing', root, { PATH: path.dirname(bin) })).toBeUndefined()
  })
  it('is a path itself', () => {
    expect(which('/some/where/thing', root, {})).toBe('/some/where/thing')
  })
})

describe('health', () => {
  it('passes node at the version engines names', async () => {
    expect((await byName({})).node).toMatchObject({ ok: true, for: 'play' })
  })

  it('names every package not installed, and says yarn install', async () => {
    makeRoot(['alpha', 'beta', 'gamma'], ['beta', 'gamma'])
    expect((await byName({})).packages).toMatchObject({ ok: false, detail: 'missing beta, gamma', fix: 'yarn install' })
    makeRoot(['alpha'])
    expect((await byName({})).packages).toMatchObject({ ok: true, detail: '1 installed' })
  })

  it('passes a Blender that answers --version, and fails one that does not run', async () => {
    const good = tool(path.join(root, 'bin'), 'blender', 'echo "Blender 5.1.2"; echo "build date: x"')
    expect((await byName({ BLENDER: good })).blender).toMatchObject({ ok: true, detail: `5.1.2 at ${good}` })
    const bad = (await byName({ BLENDER: path.join(root, 'nope') })).blender
    expect(bad.ok).toBe(false)
    expect(bad.fix).toMatch(/BLENDER/)
  })

  it('takes BLENDER from the root .env', async () => {
    const good = tool(path.join(root, 'bin'), 'blender', 'echo "Blender 4.2"')
    fs.writeFileSync(path.join(root, '.env'), `BLENDER=${good}\n`)
    expect((await byName({})).blender).toMatchObject({ ok: true, detail: `4.2 at ${good}` })
  })

  it('passes a library that is a folder, ~ as the home folder', async () => {
    expect((await byName({ PATCHWORK_LIBRARY: root })).library).toMatchObject({ ok: true, detail: root })
    expect((await byName({ PATCHWORK_LIBRARY: '~' })).library).toMatchObject({ ok: true, detail: os.homedir() })
    const missing = (await byName({ PATCHWORK_LIBRARY: path.join(root, 'nope') })).library
    expect(missing.ok).toBe(false)
    expect(missing.fix).toMatch(/PATCHWORK_LIBRARY/)
  })

  it('fails the npm gltfpack, the node.js build, which has no WebP', async () => {
    const r = (await byName({ GLTFPACK: path.join(core, 'node_modules', '.bin', 'gltfpack'), PATH: process.env.PATH })).gltfpack
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/without WebP support/)
    expect(r.fix).toMatch(/meshoptimizer\/releases/)
  })

  it('passes a gltfpack whose glb has a WebP texture, and fails one whose glb has none', async () => {
    const good = tool(path.join(root, 'good'), 'gltfpack', 'printf "glTF EXT_texture_webp" > "$4"')
    expect((await byName({ PATH: path.dirname(good) })).gltfpack).toMatchObject({ ok: true, detail: `${good} packs WebP textures` })
    const plain = tool(path.join(root, 'plain'), 'gltfpack', 'printf "glTF" > "$4"')
    expect((await byName({ GLTFPACK: plain })).gltfpack).toMatchObject({ ok: false, detail: `${plain} cannot pack WebP textures: no WebP texture in its glb` })
  })

  it('names the version of a gltfpack that refuses -tw', async () => {
    const old = tool(path.join(root, 'old'), 'gltfpack', 'echo "gltfpack 0.17"; echo "Unrecognized option -tw"; exit 1')
    expect((await byName({ GLTFPACK: old })).gltfpack.detail).toBe(`${old} (0.17) cannot pack WebP textures: gltfpack 0.17`)
  })

  it('fails gltfpack and magick when neither is on the PATH', async () => {
    const r = await byName({ PATH: path.join(root, 'empty') })
    expect(r.gltfpack).toMatchObject({ ok: false, detail: 'no gltfpack on the PATH' })
    expect(r.imagemagick).toMatchObject({ ok: false, detail: 'no magick on the PATH' })
  })

  it('names a game whose cc0 maps are not all baked, and the bake that makes them', async () => {
    fs.mkdirSync(path.join(root, 'games', 'valley', 'assets', 'ground'), { recursive: true })
    fs.writeFileSync(path.join(root, 'games', 'valley', 'assets', 'cc0-textures.json'), JSON.stringify({
      folder: 'ground', sizes: [1024, 512], sets: { rock: { set: 'Rock007_4K-JPG', maps: ['color', 'normal'] } },
    }))
    fs.writeFileSync(path.join(root, 'games', 'valley', 'assets', 'ground', 'rock-color-1024.webp'), 'webp')
    expect((await byName({})).valley).toMatchObject({ ok: false, for: 'game', detail: '3 of 4 cc0 textures not baked', fix: 'yarn bake valley' })
    for (const f of ['rock-color-512.webp', 'rock-normal-1024.webp', 'rock-normal-512.webp']) {
      fs.writeFileSync(path.join(root, 'games', 'valley', 'assets', 'ground', f), 'webp')
    }
    expect((await byName({})).valley).toMatchObject({ ok: true, for: 'game', detail: '4 cc0 textures baked' })
  })

  it('fails a game whose cc0-textures.json is wrong, saying what is wrong', async () => {
    fs.mkdirSync(path.join(root, 'games', 'valley', 'assets'), { recursive: true })
    fs.writeFileSync(path.join(root, 'games', 'valley', 'assets', 'cc0-textures.json'), JSON.stringify({ folder: 'ground', sizes: [0], sets: {} }))
    expect((await byName({})).valley).toMatchObject({ ok: false, for: 'game', detail: 'games/valley/assets/cc0-textures.json: sizes[0] is not a positive whole number' })
  })

  it('checks no game that has no cc0-textures.json, and none in a root with no games', async () => {
    expect((await health(root, {})).filter(r => r.for === 'game')).toEqual([])
    fs.mkdirSync(path.join(root, 'games', 'plain', 'assets'), { recursive: true })
    expect((await health(root, {})).filter(r => r.for === 'game')).toEqual([])
  })

  it('passes an ImageMagick that writes WebP, and fails one that writes something else', async () => {
    const good = tool(path.join(root, 'good'), 'magick', 'printf "RIFF\\000\\000\\000\\000WEBPVP8 " > "$4"')
    expect((await byName({ MAGICK: good })).imagemagick).toMatchObject({ ok: true, detail: `${good} writes WebP` })
    const png = tool(path.join(root, 'png'), 'magick', 'printf "\\211PNG" > "$4"')
    expect((await byName({ MAGICK: png })).imagemagick).toMatchObject({ ok: false, detail: `${png} cannot write WebP: its file is not WebP` })
    const refuses = tool(path.join(root, 'refuses'), 'magick', 'echo "no encode delegate for this image format WEBP" >&2; exit 1')
    expect((await byName({ MAGICK: refuses })).imagemagick.detail).toBe(`${refuses} cannot write WebP: no encode delegate for this image format WEBP`)
  })
})
