// Fetches the CC0 sets the experiment's two biomes are drawn with, at their full 4K, into ./4k/: the
// alpine biome is the four sets demo_terrain3d's ground is cut from, the desert biome four more. The
// page shrinks them to the chosen array size when it loads. A set whose three maps are already in
// ./4k/ is skipped. The maps are copied as the vendors give them (no resize, no recompression):
//
//   node experiments/terrain-warp/fetch.mjs
//
// It needs `curl`, `unzip` and macOS's `sips` on the path.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(new URL('.', import.meta.url).pathname, '4k')
mkdirSync(out, { recursive: true })

const SETS = {
  meadow: 'th/aerial_grass_rock_4K-JPG.zip',
  rock: 'cc0t/Rock007_4K-JPG.zip',
  snow: 'th/snow_02_4K-JPG.zip',
  gravel: 'th/gravel_ground_01_4K-JPG.zip',
  'dry-ground': 'th/dry_ground_rocks_4K-JPG.zip',
  'cracked-mud': 'th/mud_cracked_dry_03_4K-JPG.zip',
  'desert-rock': 'cc0t/Rock029_4K-JPG.zip',
  'red-ground': 'th/cracked_red_ground_4K-JPG.zip',
}

const MAPS = {
  color: [/_color\./i, /_diff_/i, /basecolor/i],
  normal: [/normalgl/i, /_nor_gl_/i],
  rough: [/_roughness\./i, /_rough_/i],
}

const files = (dir) => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))

for (const [name, source] of Object.entries(SETS)) {
  if (Object.keys(MAPS).every(map => existsSync(join(out, `${name}-${map}.jpg`)))) { console.log(name, 'already in ./4k/'); continue }
  const work = mkdtempSync(join(tmpdir(), 'ground4k-'))
  const zip = join(work, 'set.zip')
  execFileSync('curl', ['-sSfL', '-o', zip, `https://download.cc0-textures.com/${source}`])
  execFileSync('unzip', ['-q', '-o', zip, '-d', work])
  const all = files(work).filter(f => /\.(jpe?g|png)$/i.test(f))
  for (const [map, names] of Object.entries(MAPS)) {
    const found = all.find(f => names.some(n => n.test(f.split('/').pop())))
    if (!found) throw new Error(`${name}: no ${map} map among ${all.map(f => f.split('/').pop()).join(', ')}`)
    // full size, quality 95: a JPEG source passes through near-unchanged, a PNG one becomes a JPEG
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', found, '--out', join(out, `${name}-${map}.jpg`)], { stdio: 'ignore' })
  }
  rmSync(work, { recursive: true, force: true })
  console.log(name, 'from', source)
}
