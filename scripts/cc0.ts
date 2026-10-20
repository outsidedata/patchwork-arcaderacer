// A game's cc0-textures.com maps, made by its bake (`bake.ts`). A game that draws cc0-textures sets
// names them in `games/<game>/assets/cc0-textures.json`:
//
//   { "folder": "ground", "sizes": [2048, 1024, 512],
//     "sets": { "rock": { "set": "Rock007_4K-JPG", "maps": ["color", "normal"] }, ... } }
//
// `set` is a set's name in the library's list of cc0-textures sets (`textures/cc0-textures.json` in
// `PATCHWORK_LIBRARY`), its zip's name; `maps` are any of `color` (sRGB), `normal` (the OpenGL one,
// +y up, as three reads it) and `roughness`. Each map of each set is cut at each size, square, as WebP
// by the bake's `webp`, to `assets/<folder>/<name>-<map>-<size>.webp`: `ground/rock-normal-1024.webp`.
// The game commits them, as it does every file its bake writes, so it boots with no bake; `yarn health`
// names a game whose maps are not all there.
//
// The sets are the library's: its `cc0-textures/cc0-textures.mjs` resolves a name against its list and
// downloads a set from cc0-textures.com into `textures/cc0-textures/<zip>/`, once, where git ignores
// it. This file loads that module from the library, so core and the library share one download.
// Which file of a set is which map is read off the vendors' names for them: ambientCG's `_Color`,
// `_NormalGL`, `_Roughness`; Poly Haven's `_diff_`, `_nor_gl_`, `_rough_`; ShareTextures' `basecolor`,
// `diffuse`, `albedo`, `normal`, `roughness`. A set with an OpenGL and a DirectX normal gives the
// OpenGL one; a set with one plain normal gives that; a set with only a DirectX normal gives none.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Tools } from './bake.ts'

export type Map = 'color' | 'normal' | 'roughness'
export type Config = { folder: string, sizes: number[], sets: Record<string, { set: string, maps: Map[] }> }

const MAPS: Map[] = ['color', 'normal', 'roughness']

// The library's cc0-textures module (`cc0-textures.mjs` in the library).
type Library = {
  read: (library: string) => Record<string, { zip: string, tags: string[], maps: string[] }>
  resolve: (directory: Record<string, unknown>, name: string) => string
  download: (directory: Record<string, unknown>, zip: string, options: { library: string }) => Promise<{ dir: string, fetched: boolean }>
}

const load = async (library: string): Promise<Library> => {
  const file = path.join(library, 'cc0-textures', 'cc0-textures.mjs')
  if (!fs.existsSync(file)) throw new Error(`the library at ${library} has no cc0-textures/cc0-textures.mjs`)
  return await import(pathToFileURL(file).href) as Library
}

const IMAGE = /\.(jpe?g|png)$/i
const DX = /normaldx|_nor_dx_/i
const NAMES: Record<Map, RegExp[]> = {
  color: [/_color\./i, /_diff_/i, /basecolor/i, /diffuse/i, /albedo/i],
  normal: [/normalgl/i, /_nor_gl_/i],
  roughness: [/roughness/i, /_rough_/i],
}

// The file of a set's files that is `map`, or undefined.
export const pick = (files: string[], map: Map): string | undefined => {
  const pictures = files.filter(f => IMAGE.test(f))
  const named = pictures.find(f => NAMES[map].some(r => r.test(f)))
  if (named || map !== 'normal') return named
  const plain = pictures.filter(f => /normal/i.test(f))
  return plain.length === 1 && !DX.test(plain[0]) ? plain[0] : undefined
}

const isWhole = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n > 0

// The game's cc0-textures.json, undefined when it has none; it throws naming the file and the field
// that is wrong.
export const config = (root: string, game: string): Config | undefined => {
  const rel = path.join('games', game, 'assets', 'cc0-textures.json')
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) return undefined
  const c = JSON.parse(fs.readFileSync(file, 'utf8'))
  const wrong = (field: string, what: string) => { throw new Error(`${rel}: ${field} is not ${what}`) }
  if (typeof c.folder !== 'string' || !c.folder || c.folder.includes('..')) wrong('folder', 'a folder name')
  if (!Array.isArray(c.sizes) || !c.sizes.length) wrong('sizes', 'a list of sizes')
  c.sizes.forEach((s: unknown, i: number) => { if (!isWhole(s)) wrong(`sizes[${i}]`, 'a positive whole number') })
  if (!c.sets || typeof c.sets !== 'object' || !Object.keys(c.sets).length) wrong('sets', 'a table of sets')
  for (const [name, s] of Object.entries(c.sets as Record<string, { set: unknown, maps: unknown }>)) {
    if (typeof s?.set !== 'string' || !s.set) wrong(`sets.${name}.set`, 'a set\'s name')
    if (!Array.isArray(s.maps) || !s.maps.length) wrong(`sets.${name}.maps`, 'a list of maps')
    ;(s.maps as unknown[]).forEach((m, i) => { if (!MAPS.includes(m as Map)) wrong(`sets.${name}.maps[${i}]`, `one of ${MAPS.join(', ')}`) })
  }
  return c as Config
}

const output = (c: Config, name: string, map: Map, size: number) => `${c.folder}/${name}-${map}-${size}.webp`

// Every file the config makes, under the game's `assets/`, set by set, map by map, size by size.
export const outputs = (c: Config): string[] =>
  Object.entries(c.sets).flatMap(([name, s]) => s.maps.flatMap(map => c.sizes.map(size => output(c, name, map, size))))

// Every map of the game's config not already on disk, cut; the paths written. Every set is resolved
// against the library's list before any is downloaded.
export const cut = async (root: string, game: string, tools: Pick<Tools, 'library' | 'webp'>): Promise<string[]> => {
  const c = config(root, game)
  if (!c) return []
  const assets = path.join(root, 'games', game, 'assets')
  const missing = (name: string, map: Map) => c.sizes.filter(size => !fs.existsSync(path.join(assets, output(c, name, map, size))))
  const sets = Object.entries(c.sets).filter(([name, s]) => s.maps.some(map => missing(name, map).length))
  if (!sets.length) return []
  const library = await load(tools.library)
  const directory = library.read(tools.library)
  const zips = sets.map(([, s]) => {
    try { return library.resolve(directory, s.set) } catch (e) { throw new Error(`${game}: ${(e as Error).message}`) }
  })
  const written: string[] = []
  for (const [i, [name, s]] of sets.entries()) {
    const { dir } = await library.download(directory, zips[i], { library: tools.library })
    const files = fs.readdirSync(dir).sort()
    const sources = s.maps.map(map => {
      const file = pick(files, map)
      if (!file) throw new Error(`${game}: ${zips[i]} has no ${map} map among ${files.join(', ')}`)
      return [map, path.join(dir, file)] as const
    })
    for (const [map, src] of sources) {
      for (const size of missing(name, map)) {
        const out = path.join(assets, output(c, name, map, size))
        await tools.webp(src, out, size)
        written.push(out)
      }
    }
  }
  return written
}

// A set's maps in the library, downloaded first when it is not there: each map the set has, by name.
export const texture = async (library: string, zip: string): Promise<Partial<Record<Map, string>>> => {
  const lib = await load(library)
  const directory = lib.read(library)
  const { dir } = await lib.download(directory, lib.resolve(directory, zip), { library })
  const files = fs.readdirSync(dir).sort()
  return Object.fromEntries(MAPS.flatMap(map => {
    const file = pick(files, map)
    return file ? [[map, path.join(dir, file)]] : []
  }))
}
