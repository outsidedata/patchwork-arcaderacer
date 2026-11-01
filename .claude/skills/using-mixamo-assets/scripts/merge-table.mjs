// Writes a measured anim table (anim.export.py's <table.json>) into a rig file, the bodies' measured
// bones (its <table.ends.json> beside it) into the rig's `ends`, their blades' grips (its
// <table.grips.json>) into the rig's `grips` and what their clips touch (its <table.touches.json>) into
// the rig's `touches`, each body's over the one it had, the poses its clips name (its
// <table.poses.json>) as the rig's `poses`, and
// any `<body>=<fbx>` given into its `bodies`, in the rig's own layout: one-space indent, every array of
// plain values on one line.
//   node merge-table.mjs <rig.json> <table.json> <out rig.json> [<body>=<fbx> ...]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
const [rigPath, tablePath, outPath, ...bodies] = process.argv.slice(2)
const text = readFileSync(rigPath, 'utf8')
const rig = JSON.parse(text)
for (const b of bodies) {
  const [k, v] = b.split('=')
  rig.bodies[k] = v
}
rig.table = JSON.parse(readFileSync(tablePath, 'utf8'))
const endsPath = tablePath.replace(/\.json$/, '') + '.ends.json'
if (existsSync(endsPath)) rig.ends = { ...rig.ends, ...JSON.parse(readFileSync(endsPath, 'utf8')) }
const gripsPath = tablePath.replace(/\.json$/, '') + '.grips.json'
if (existsSync(gripsPath)) rig.grips = { ...rig.grips, ...JSON.parse(readFileSync(gripsPath, 'utf8')) }
const touchesPath = tablePath.replace(/\.json$/, '') + '.touches.json'
if (existsSync(touchesPath)) rig.touches = { ...rig.touches, ...JSON.parse(readFileSync(touchesPath, 'utf8')) }
// The poses its clips name (<table.poses.json>), the whole of them: each is a frame of a clip of this bake.
const posesPath = tablePath.replace(/\.json$/, '') + '.poses.json'
if (existsSync(posesPath)) {
  const poses = JSON.parse(readFileSync(posesPath, 'utf8'))
  if (Object.keys(poses).length) rig.poses = poses
  else delete rig.poses
}

const flat = a => a.every(x => x === null || typeof x !== 'object')
function fmt(v, ind) {
  const pad = ' '.repeat(ind), inner = ' '.repeat(ind + 1)
  if (Array.isArray(v)) {
    if (flat(v)) return `[${v.map(x => JSON.stringify(x)).join(', ')}]`
    return `[\n${v.map(x => inner + fmt(x, ind + 1)).join(',\n')}\n${pad}]`
  }
  if (v && typeof v === 'object') {
    const es = Object.entries(v)
    if (!es.length) return '{}'
    return `{\n${es.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${fmt(x, ind + 1)}`).join(',\n')}\n${pad}}`
  }
  return JSON.stringify(v)
}
writeFileSync(outPath, fmt(rig, 0) + (text.endsWith('\n') ? '\n' : ''))
console.log('wrote', outPath, 'clips', Object.keys(rig.table).length)
