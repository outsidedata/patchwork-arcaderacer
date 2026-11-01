// The functions a CPU profile (a .cpuprofile, node's `--cpu-prof` or Chrome's) spent its time in, most
// first: each one's own time (in it, not in what it called) and its whole time (with what it called,
// counted once however deep it recursed), as shares of the time sampled, with its file and line.
//   node cpu-hot.mjs <file.cpuprofile> [how many]
import fs from 'node:fs'

const [file, many = '30'] = process.argv.slice(2)
if (!file) {
  console.error('usage: node cpu-hot.mjs <file.cpuprofile> [how many]')
  process.exit(1)
}
const p = JSON.parse(fs.readFileSync(file, 'utf8'))
const byId = new Map(p.nodes.map(n => [n.id, n]))
const parent = new Map()
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
const hits = new Map()
for (const s of p.samples) hits.set(s, (hits.get(s) ?? 0) + 1)
const total = p.samples.length
const where = url => url.replace(/^file:\/\//, '').replace(/^https?:\/\/[^/]+\//, '').replace(process.cwd() + '/', '').replace(/\?.*$/, '')
const key = n => `${n.callFrame.functionName || '(anonymous)'}  ${where(n.callFrame.url)}:${n.callFrame.lineNumber + 1}`
const own = new Map(), whole = new Map()
for (const [id, k] of hits) {
  const name = key(byId.get(id))
  own.set(name, (own.get(name) ?? 0) + k)
  const seen = new Set()
  for (let at = id; at !== undefined; at = parent.get(at)) {
    const kk = key(byId.get(at))
    if (seen.has(kk)) continue
    seen.add(kk)
    whole.set(kk, (whole.get(kk) ?? 0) + k)
  }
}
const pct = v => ((100 * v) / total).toFixed(1).padStart(5) + '%'
console.log(`${total} samples\n\nown time`)
for (const [k, v] of [...own].sort((a, b) => b[1] - a[1]).slice(0, Number(many))) console.log(pct(v), k)
console.log('\nwhole time (with what it called)')
for (const [k, v] of [...whole].sort((a, b) => b[1] - a[1]).slice(0, Number(many))) console.log(pct(v), k)
