// The size of what a commit of a game would add: `node .claude/skills/committing-a-game/scripts/inventory.mjs
// games/<game>`, from the root. It reads the files git would commit in that folder, tracked and
// untracked but not ignored, as `raw.mjs` does, and prints:
//   the count of those files and their total size
//   each kind of file (its extension), its count and its total size, largest first
//   the fifteen largest files, largest first
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
if (!dir || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: node .claude/skills/committing-a-game/scripts/inventory.mjs games/<game>')
  process.exit(2)
}

const listed = spawnSync('git', ['-C', dir, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
if (listed.status !== 0) {
  console.error(`git ls-files in ${dir} failed: ${listed.stderr}`)
  process.exit(2)
}
const files = [...new Set(listed.stdout.split('\0').filter(Boolean))]
  .filter(f => fs.existsSync(path.join(dir, f)))
  .map(f => ({ f, size: fs.statSync(path.join(dir, f)).size }))

const size = n => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`
const total = files.reduce((s, x) => s + x.size, 0)
console.log(`${files.length} files git would commit in ${dir}, ${size(total)}`)

// A file's kind: its extension, or its name when it has none (`.gitignore`, `LICENSE`).
const kind = f => path.extname(f).toLowerCase() || path.basename(f)
const kinds = new Map()
for (const { f, size } of files) {
  const k = kinds.get(kind(f)) ?? { n: 0, size: 0 }
  k.n++
  k.size += size
  kinds.set(kind(f), k)
}
console.log('\nby kind:')
for (const [k, { n, size: s }] of [...kinds].sort((a, b) => b[1].size - a[1].size)) console.log(`  ${size(s).padStart(10)}  ${String(n).padStart(4)} files  ${k}`)

console.log('\nlargest files:')
for (const { f, size: s } of files.sort((a, b) => b.size - a.size).slice(0, 15)) console.log(`  ${size(s).padStart(10)}  ${f}`)
