// Names every file of a game that git would commit and that is raw, which `committing-a-game` keeps
// out: `node .claude/skills/committing-a-game/scripts/raw.mjs games/<game>`, from the root.
// It reads the files git would commit in that folder, tracked and untracked but not ignored, so a
// game's `.gitignore` is honoured, and names:
//   a glb not packed by gltfpack: its `asset.generator` is not gltfpack's, so it is a plain export
//   a model or scene source: .fbx .blend .blend1 .obj .gltf .dae .3ds .max .ma .mb .usd .usda .usdc .usdz
//   an archive: .zip .7z .rar .tar .gz .tgz
//   a working picture: .psd .kra .xcf .exr .tif .tiff .tga
//   a .jpg or .jpeg: the bake's `webp` writes .webp, so a jpg in a game was copied in, never baked
// Each .png is listed apart: a script of the game's may draw one (an effects sheet) or it was copied
// in, and only the game says which. Every one is accounted for by the script that writes it.
// Exits 1 when a raw file is found, 0 when none is.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (!dir || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: node .claude/skills/committing-a-game/scripts/raw.mjs games/<game>')
  process.exit(2)
}

const listed = spawnSync('git', ['-C', dir, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
if (listed.status !== 0) {
  console.error(`git ls-files in ${dir} failed: ${listed.stderr}`)
  process.exit(2)
}
const files = [...new Set(listed.stdout.split('\0').filter(Boolean))]
  .filter(f => fs.existsSync(path.join(dir, f)))
  .sort()

const SOURCE = /\.(fbx|blend|blend1|obj|gltf|dae|3ds|max|ma|mb|usd|usda|usdc|usdz)$/i
const ARCHIVE = /\.(zip|7z|rar|tar|gz|tgz)$/i
const WORKING = /\.(psd|kra|xcf|exr|tif|tiff|tga)$/i
const JPG = /\.jpe?g$/i

// The generator a glb names in its JSON chunk, or why it has none.
const generator = file => {
  const b = fs.readFileSync(file)
  if (b.length < 20 || b.toString('ascii', 0, 4) !== 'glTF') return 'not a glb'
  const length = b.readUInt32LE(12)
  if (b.toString('ascii', 16, 20) !== 'JSON') return 'no JSON chunk'
  return JSON.parse(b.toString('utf8', 20, 20 + length)).asset?.generator ?? 'no generator'
}

const raw = []
const pngs = []
for (const f of files) {
  const full = path.join(dir, f)
  if (/\.glb$/i.test(f)) {
    const g = generator(full)
    if (!/^gltfpack/i.test(g)) raw.push(`${f}  glb not packed by gltfpack (generator: ${g})`)
  } else if (SOURCE.test(f)) raw.push(`${f}  model or scene source`)
  else if (ARCHIVE.test(f)) raw.push(`${f}  archive`)
  else if (WORKING.test(f)) raw.push(`${f}  working picture`)
  else if (JPG.test(f)) raw.push(`${f}  jpg: a baked picture is .webp`)
  else if (/\.png$/i.test(f)) pngs.push(f)
}

console.log(`${files.length} files git would commit in ${dir}`)
console.log(raw.length ? `\nraw, never committed (${raw.length}):` : '\nraw: none')
for (const r of raw) console.log(`  ${r}`)
if (pngs.length) {
  console.log(`\npng, each written by a script of the game's or raw (${pngs.length}):`)
  for (const p of pngs) console.log(`  ${p}`)
}
process.exit(raw.length ? 1 : 0)
