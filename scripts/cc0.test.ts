import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { config, cut, outputs, pick, texture, type Config } from './cc0.ts'
import { downloads as downloaded, fakeLibrary, fakeSet } from './cc0.fake.ts'

let root: string
let library: string
let made: { src: string, out: string, size: number }[]

const set = (zip: string, files: string[]) => fakeSet(library, zip, files)
const downloads = () => downloaded(library)

// Game `demo`'s cc0-textures.json.
const game = (c: unknown) => {
  fs.mkdirSync(path.join(root, 'games', 'demo', 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'games', 'demo', 'assets', 'cc0-textures.json'), JSON.stringify(c))
}

const tools = () => ({
  library,
  webp: async (src: string, out: string, size: number) => {
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, 'webp')
    made.push({ src, out, size })
    return ''
  },
})

const rock: Config = { folder: 'ground', sizes: [2048, 512], sets: { rock: { set: 'Rock007_4K-JPG', maps: ['color', 'normal'] } } }
const ROCK = ['Rock007_4K_Color.jpg', 'Rock007_4K_NormalDX.jpg', 'Rock007_4K_NormalGL.jpg', 'Rock007_4K_Roughness.jpg', 'Rock007.png', 'Rock007_4K-JPG.usdc']

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc0-test-'))
  library = path.join(root, 'library')
  fakeLibrary(library)
  made = []
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('outputs', () => {
  it('is every set, map and size, as <folder>/<name>-<map>-<size>.webp', () => {
    expect(outputs(rock)).toEqual(['ground/rock-color-2048.webp', 'ground/rock-color-512.webp', 'ground/rock-normal-2048.webp', 'ground/rock-normal-512.webp'])
  })
})

describe('pick', () => {
  it('takes the OpenGL normal over the DirectX one, in every vendor\'s names', () => {
    expect(pick(['Rock007_4K_NormalDX.jpg', 'Rock007_4K_NormalGL.jpg'], 'normal')).toBe('Rock007_4K_NormalGL.jpg')
    expect(pick(['stone_wall_nor_dx_4k.jpg', 'stone_wall_nor_gl_4k.jpg'], 'normal')).toBe('stone_wall_nor_gl_4k.jpg')
  })
  it('takes a set\'s one plain normal, and no DirectX one alone', () => {
    expect(pick(['4K-metal_roof_baseColor.jpeg', '4K-metal_roof_normal.jpeg'], 'normal')).toBe('4K-metal_roof_normal.jpeg')
    expect(pick(['Rock007_4K_NormalDX.jpg'], 'normal')).toBeUndefined()
  })
  it('finds the colour by every vendor\'s name for it', () => {
    expect(pick(['Rock007_4K_Color.jpg'], 'color')).toBe('Rock007_4K_Color.jpg')
    expect(pick(['stone_wall_diff_4k.jpg'], 'color')).toBe('stone_wall_diff_4k.jpg')
    expect(pick(['4K-metal_roof_baseColor.jpeg'], 'color')).toBe('4K-metal_roof_baseColor.jpeg')
    expect(pick(['fabric_96_basecolor-4K.png'], 'color')).toBe('fabric_96_basecolor-4K.png')
    expect(pick(['4K-plaster_10-diffuse.jpg'], 'color')).toBe('4K-plaster_10-diffuse.jpg')
    expect(pick(['fabric_130_albedo-4K.png'], 'color')).toBe('fabric_130_albedo-4K.png')
  })
  it('finds the roughness, and only among pictures', () => {
    expect(pick(['Rock007_4K_Roughness.jpg'], 'roughness')).toBe('Rock007_4K_Roughness.jpg')
    expect(pick(['stone_wall_rough_4k.jpg'], 'roughness')).toBe('stone_wall_rough_4k.jpg')
    expect(pick(['Rock007_4K_Roughness.usdc'], 'roughness')).toBeUndefined()
  })
})

describe('config', () => {
  it('is undefined for a game with no cc0-textures.json', () => {
    expect(config(root, 'demo')).toBeUndefined()
  })
  it('reads the file', () => {
    game(rock)
    expect(config(root, 'demo')).toEqual(rock)
  })
  it('names the file and the field that is wrong', () => {
    game({ ...rock, sizes: [1024, 0] })
    expect(() => config(root, 'demo')).toThrow('games/demo/assets/cc0-textures.json: sizes[1] is not a positive whole number')
    game({ ...rock, sets: { rock: { set: 'Rock007_4K-JPG', maps: ['colour'] } } })
    expect(() => config(root, 'demo')).toThrow('games/demo/assets/cc0-textures.json: sets.rock.maps[0] is not one of color, normal, roughness')
    game({ ...rock, folder: '' })
    expect(() => config(root, 'demo')).toThrow('games/demo/assets/cc0-textures.json: folder is not a folder name')
    game({ ...rock, sets: { rock: { maps: ['color'] } } })
    expect(() => config(root, 'demo')).toThrow('games/demo/assets/cc0-textures.json: sets.rock.set is not a set\'s name')
  })
})

describe('cut', () => {
  it('downloads each set and cuts every map at every size from the picked file', async () => {
    set('Rock007_4K-JPG', ROCK)
    game(rock)
    const assets = path.join(root, 'games', 'demo', 'assets')
    const written = await cut(root, 'demo', tools())
    expect(written).toEqual(outputs(rock).map(o => path.join(assets, o)))
    const dir = path.join(library, 'textures', 'cc0-textures', 'Rock007_4K-JPG')
    expect(made).toEqual([
      { src: path.join(dir, 'Rock007_4K_Color.jpg'), out: path.join(assets, 'ground/rock-color-2048.webp'), size: 2048 },
      { src: path.join(dir, 'Rock007_4K_Color.jpg'), out: path.join(assets, 'ground/rock-color-512.webp'), size: 512 },
      { src: path.join(dir, 'Rock007_4K_NormalGL.jpg'), out: path.join(assets, 'ground/rock-normal-2048.webp'), size: 2048 },
      { src: path.join(dir, 'Rock007_4K_NormalGL.jpg'), out: path.join(assets, 'ground/rock-normal-512.webp'), size: 512 },
    ])
    expect(downloads()).toEqual(['Rock007_4K-JPG'])
  })

  it('cuts nothing and downloads nothing when every map is there', async () => {
    set('Rock007_4K-JPG', ROCK)
    game(rock)
    await cut(root, 'demo', tools())
    made = []
    expect(await cut(root, 'demo', tools())).toEqual([])
    expect(made).toEqual([])
    expect(downloads()).toEqual(['Rock007_4K-JPG'])
  })

  it('cuts only the maps that are missing', async () => {
    set('Rock007_4K-JPG', ROCK)
    game(rock)
    await cut(root, 'demo', tools())
    fs.rmSync(path.join(root, 'games', 'demo', 'assets', 'ground', 'rock-normal-512.webp'))
    made = []
    expect(await cut(root, 'demo', tools())).toEqual([path.join(root, 'games', 'demo', 'assets', 'ground', 'rock-normal-512.webp')])
  })

  it('downloads nothing when a set is not in the list, naming it', async () => {
    set('Rock007_4K-JPG', ROCK)
    game({ ...rock, sets: { ...rock.sets, lava: { set: 'Lava001_4K-JPG', maps: ['color'] } } })
    await expect(cut(root, 'demo', tools())).rejects.toThrow('demo: no cc0-textures set Lava001_4K-JPG (yarn cc0-textures:search <words>)')
    expect(downloads()).toEqual([])
  })

  it('names the set and the map a zip does not have', async () => {
    set('Rock007_4K-JPG', ['Rock007_4K_Color.jpg', 'Rock007_4K_NormalGL.jpg'])
    game({ ...rock, sets: { rock: { set: 'Rock007_4K-JPG', maps: ['roughness'] } } })
    await expect(cut(root, 'demo', tools())).rejects.toThrow('demo: Rock007_4K-JPG has no roughness map among Rock007_4K_Color.jpg, Rock007_4K_NormalGL.jpg')
    expect(made).toEqual([])
  })

  it('is nothing for a game with no cc0-textures.json', async () => {
    expect(await cut(root, 'demo', tools())).toEqual([])
  })

  it('says where the library is when it has no cc0-textures module', async () => {
    fs.rmSync(path.join(library, 'cc0-textures'), { recursive: true })
    set('Rock007_4K-JPG', ROCK)
    game(rock)
    await expect(cut(root, 'demo', tools())).rejects.toThrow(`the library at ${library} has no cc0-textures/cc0-textures.mjs`)
  })
})

describe('texture', () => {
  it('is a set\'s maps in the library, downloaded first', async () => {
    set('Rock007_4K-JPG', ROCK)
    const dir = path.join(library, 'textures', 'cc0-textures', 'Rock007_4K-JPG')
    expect(await texture(library, 'Rock007_4K-JPG')).toEqual({
      color: path.join(dir, 'Rock007_4K_Color.jpg'),
      normal: path.join(dir, 'Rock007_4K_NormalGL.jpg'),
      roughness: path.join(dir, 'Rock007_4K_Roughness.jpg'),
    })
    expect(downloads()).toEqual(['Rock007_4K-JPG'])
  })
  it('leaves out a map the set does not have', async () => {
    set('metal_roof-4K', ['4K-metal_roof_baseColor.jpeg', '4K-metal_roof_normal.jpeg'])
    expect(Object.keys(await texture(library, 'metal_roof-4K'))).toEqual(['color', 'normal'])
  })
})
