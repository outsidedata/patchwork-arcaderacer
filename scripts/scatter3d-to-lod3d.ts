// scatter3d's settings in a games folder's scene files written as lod3d's, drawn by instances3d.
//
//   node --experimental-strip-types scripts/scatter3d-to-lod3d.ts <games> <out>
//
// Every `<scene>.scene.json` and `<name>.partial_scene.json` under `<games>` that holds anything of
// scatter3d is written again under `<out>` at the same path, the rest left out; `<games>` itself is never
// written. What it prints is every file it wrote, and every other file under `<games>` that names scatter3d
// (a game's code, its tests, its README), each of which is moved to lod3d by hand.
//
// In each file, field by field, so a child scene's few fields over its manager's or its partial's are
// translated as they stand:
//   plugins                 `scatter3d` becomes `instances3d`, unless the list has it, then `lod3d`
//   world.scatter3d         becomes world.lod3d:
//     mods.ground, .land    surfaces, seen and behaviors (terrain3d's, and instances3d's for `mesh`)
//     mods.hollows          hollows (box3dvehicle's `box3dvehicle.lod3d.ts`)
//     budget, hollows       as they are
//     remember              gone: lod3d's server half keeps nothing between questions
//     cutout, coverage      world.instances3d's
//     packs                 layers, each pack a layer `on` the land, its cells one try each (`spacing`
//                           its `cell`), `rows` (weight, solid, tall, sink), seed, density, rules,
//                           clearing, size and vary as they are, and `mesh` its asset or shape, colour,
//                           surface, lods, shadow and leaf
//     biomes                throws: lod3d has no sum of biome shares
//   world.<p>.mods          every `scatter3d` named becomes `lod3d`; lod3d's mods for walker, hitscan3d,
//                           box3d, cover3d, ragdoll3d and terrain3d (`ready`) export what scatter3d's did
//   world.lod3d.remember    scatter3d's: how many tiles lod3d's server half keeps for each truth
//   world.lod3d.widest      the widest circle a solid row's instance has, solid·(base + spread): how far
//                           past a question the server half reaches for tiles (`lod3d.walker.ts`), in the
//                           file whose layers are whole
//   world.lod3d.rings       each pack's `lods` were drawn on the land's rings, `world.terrain3d.rings`,
//                           so the layers are drawn on the same reaches: written beside the layers
//
// Then every scene a game runs, as `addons/scenemanager` makes its world (its partial's with its own merged
// over it field by field, laid over its manager's one plugin deep, so a plugin a child gives at all takes
// the place of the manager's whole), is given in its own file the whole of world.lod3d and of
// world.instances3d wherever what it would be handed is not the translation of its scatter3d: another
// land's rings, other layers' widest, or a child's own few fields that would replace its manager's whole.
// Every one is then checked: what it is handed is the translation of its scatter3d, every layer is whole,
// and its rings are its land's. Any that is not throws, naming it.
import fs from 'node:fs'
import path from 'node:path'

type Json = Record<string, any>
const plain = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
// As `addons/scenemanager` merges a world: objects field by field, the one over winning, anything else
// replaced.
function merge(under: Json, over: Json): Json {
  const out = { ...under }
  for (const [k, v] of Object.entries(over)) out[k] = plain(v) && plain(under[k]) ? merge(under[k], v) : v
  return out
}
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
const sorted = (v: unknown): unknown => (Array.isArray(v) ? v.map(sorted) : plain(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v)

const MESH = ['asset', 'shape', 'colour', 'surface', 'lods', 'shadow', 'leaf']
const AS_IS = ['rows', 'cell', 'seed', 'density', 'rules', 'clearing', 'size', 'vary']
const KNOWN = new Set([...MESH, ...AS_IS, 'biomes'])

// One pack, or the fields of one a scene lays over another's, as a layer, or the fields of one.
function layerOf(p: Json, what: string): Json {
  for (const k of Object.keys(p)) if (!KNOWN.has(k)) throw new Error(`${what} gives ${k}, which is no field of a scatter3d pack`)
  if (p.biomes !== undefined) throw new Error(`${what} gives biomes, which lod3d has no way to keep: a layer's keep is a product of ramps, and biomes is a sum of shares`)
  const l: Json = {}
  // A pack as a whole has an asset or a shape; a few fields over one have neither.
  if (p.asset !== undefined || p.shape !== undefined) l.on = ['land']
  for (const k of AS_IS) {
    if (p[k] === undefined) continue
    l[k] = k === 'rows' ? Object.fromEntries(Object.entries(p.rows as Json).map(([n, r]) => [n, { ...r }])) : structuredClone(p[k])
    if (k === 'cell') l.spacing = p.cell
  }
  const mesh = Object.fromEntries(MESH.filter(k => p[k] !== undefined).map(k => [k, structuredClone(p[k])]))
  if (Object.keys(mesh).length) l.mesh = mesh
  return l
}

// A world's scatter3d, or the fields of one, as lod3d's and instances3d's.
function scatterOf(s: Json, what: string): { lod3d: Json; instances3d: Json } {
  const lod3d: Json = {}, instances3d: Json = {}
  for (const k of Object.keys(s)) if (!['mods', 'cutout', 'coverage', 'budget', 'hollows', 'remember', 'packs'].includes(k)) throw new Error(`${what} gives ${k}, which is no field of world.scatter3d`)
  if (s.mods) {
    for (const k of Object.keys(s.mods)) if (!['ground', 'land', 'hollows'].includes(k)) throw new Error(`${what} names a mod ${k}, which scatter3d never asks`)
    const lands = [...new Set([s.mods.ground, s.mods.land].filter(v => v !== undefined))]
    const mods: Json = {}
    if (lands.length) {
      mods.surfaces = lands
      mods.seen = lands
      mods.behaviors = [...lands, 'instances3d']
    }
    if (s.mods.hollows !== undefined) mods.hollows = ([] as string[]).concat(s.mods.hollows)
    lod3d.mods = mods
  }
  if (s.budget !== undefined) lod3d.budget = s.budget
  if (s.hollows !== undefined) lod3d.hollows = s.hollows
  if (s.remember !== undefined) lod3d.remember = s.remember
  if (s.cutout !== undefined) instances3d.cutout = s.cutout
  if (s.coverage !== undefined) instances3d.coverage = s.coverage
  if (s.packs) lod3d.layers = Object.fromEntries(Object.entries(s.packs as Json).map(([name, p]) => [name, layerOf(p, `${what} pack ${name}`)]))
  return { lod3d, instances3d }
}

const reaches = (world: Json) => (world.terrain3d?.rings as { reach: number }[] | undefined)?.map(r => r.reach)
// The widest circle any solid instance of these layers has, solid·(base + spread) of its row and size, for
// lod3d's server half (`lod3d.walker.ts`), which reaches that far past a question for the tiles it asks.
const widestOf = (layers: Json) => Math.max(0, ...Object.values(layers).flatMap((l: Json) => Object.values((l.rows ?? {}) as Record<string, Json>).filter((r: Json) => r.solid !== undefined && (r.weight ?? 1) > 0).map((r: Json) => r.solid * (l.size[0] + l.size[1]))))

// Every `scatter3d` a world's mods name, as `lod3d`.
function modsOf(v: unknown): unknown {
  if (v === 'scatter3d') return 'lod3d'
  if (Array.isArray(v)) return v.map(modsOf)
  return v
}

// A whole scene file, translated; whether anything of scatter3d was in it.
function translate(scene: Json, what: string): { scene: Json; changed: boolean } {
  let changed = false
  const out: Json = {}
  for (const [k, v] of Object.entries(scene)) {
    if (k === 'plugins' && Array.isArray(v) && v.includes('scatter3d')) {
      changed = true
      out.plugins = v.flatMap((p: string) => (p === 'scatter3d' ? [...(v.includes('instances3d') ? [] : ['instances3d']), 'lod3d'] : [p]))
      continue
    }
    if (k !== 'world' || !plain(v)) { out[k] = v; continue }
    const world: Json = {}
    for (const [p, settings] of Object.entries(v)) {
      if (p === 'scatter3d') {
        changed = true
        const { lod3d, instances3d } = scatterOf(settings, `${what} world.scatter3d`)
        if (Object.keys(instances3d).length) {
          const had = v.instances3d ?? {}
          for (const [n, x] of Object.entries(instances3d)) if (had[n] !== undefined && had[n] !== x) throw new Error(`${what} world.instances3d.${n} is ${had[n]}, and world.scatter3d.${n} ${x}`)
          world.instances3d = { ...(world.instances3d ?? {}), ...instances3d, ...had }
        }
        if (lod3d.layers && reaches(v)) lod3d.rings = reaches(v)
        // Worked out here where every layer is whole; a scene whose merged layers differ is given its own.
        if (lod3d.layers && Object.values(lod3d.layers as Json).every((l: Json) => l.rows && l.size)) lod3d.widest = widestOf(lod3d.layers)
        if (v.lod3d) throw new Error(`${what} gives world.lod3d beside world.scatter3d`)
        world.lod3d = lod3d
        continue
      }
      if (p === 'instances3d' && world.instances3d) { world.instances3d = { ...world.instances3d, ...settings }; continue }
      if (plain(settings) && plain(settings.mods) && JSON.stringify(settings.mods).includes('"scatter3d"')) {
        changed = true
        world[p] = { ...settings, mods: Object.fromEntries(Object.entries(settings.mods).map(([m, x]) => [m, modsOf(x)])) }
        continue
      }
      world[p] = settings
    }
    out.world = world
  }
  return { scene: out, changed }
}

// JSON as the games write it: a value on one line when it fits in WIDTH, else one field or item a line.
const WIDTH = 110
// `lead` is how much of the line is already written before the value: its indent and its key.
function write(v: unknown, indent = '', lead = indent.length): string {
  const flat = oneLine(v)
  if (lead + flat.length <= WIDTH || (!plain(v) && !Array.isArray(v))) return flat
  const inner = indent + '  '
  if (Array.isArray(v)) return `[\n${v.map(x => inner + write(x, inner)).join(',\n')}\n${indent}]`
  return `{\n${Object.entries(v as Json).map(([k, x]) => { const key = `${inner}${JSON.stringify(k)}: `; return key + write(x, inner, key.length) }).join(',\n')}\n${indent}}`
}
// A value on one line, `{ "a": 1, "b": [1, 2] }`, each string as JSON writes it.
function oneLine(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(oneLine).join(', ')}]`
  if (plain(v)) { const e = Object.entries(v); return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${oneLine(x)}`).join(', ')} }` : '{}' }
  return JSON.stringify(v)
}

// ---------------------------------------------------------------- the folder

const [games, outDir] = process.argv.slice(2)
if (!games || !outDir) throw new Error('scatter3d-to-lod3d takes the games folder to read and the folder to write the scene files to')
if (path.resolve(outDir).startsWith(path.resolve(games) + path.sep) || path.resolve(outDir) === path.resolve(games)) throw new Error(`${outDir} is inside ${games}: the translation is written beside the games, never over them`)

const files: string[] = []
const named: string[] = []
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(partial_)?scene\.json$/.test(e.name)) files.push(p)
    else if (/\.(ts|tsx|mjs|js|md|html|json|py)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('scatter3d')) named.push(p)
  }
}
walk(games)

const before = new Map<string, Json>(), after = new Map<string, Json>()
const wrote: string[] = []
for (const f of files) {
  const scene = JSON.parse(fs.readFileSync(f, 'utf8')) as Json
  const rel = path.relative(games, f)
  const t = translate(scene, rel)
  before.set(f, scene)
  after.set(f, t.scene)
  if (t.changed) wrote.push(f)
}

// Every scene a game runs: each manager's children, and a scene of a game with no manager on its own.
type Run = { file: string; chain: string[] }
const runs: Run[] = []
for (const f of files) {
  const s = before.get(f)!
  const children = s.prefabs?.scenemanager?.scenes as Record<string, { file: string }> | undefined
  if (!children) continue
  for (const c of Object.values(children)) {
    const child = path.resolve(path.dirname(f), c.file)
    if (!before.has(child)) throw new Error(`${path.relative(games, f)} names ${c.file}, which is no scene file under ${games}`)
    const ext = before.get(child)!.extends as string | undefined
    runs.push({ file: child, chain: [f, ...(ext ? [path.resolve(path.dirname(child), ext)] : []), child] })
  }
}
// A child's world as `addons/scenemanager` makes it: its partial's world with its own merged over it field
// by field (`extended`), laid over its manager's one plugin deep (`child`), so a plugin a child gives at
// all takes the place of the manager's whole.
const resolved = (chain: string[], by: Map<string, Json>) => {
  const of = (f: string) => {
    const s = by.get(f)
    if (!s) throw new Error(`${chain.at(-1)} extends ${f}, which is no scene file`)
    return s.world ?? {}
  }
  const [manager, ...own] = chain
  return { ...of(manager), ...own.reduce((w, f) => merge(w, of(f)), {} as Json) }
}

// A scene whose merged lod3d or instances3d is not the translation of its merged scatter3d is given the
// whole of it in its own file: its rings when its land's differ, its widest when its layers do, and every
// field the manager's held, since a plugin a child gives takes the place of the manager's whole. Only a
// scene that lists scatter3d draws it; one that inherits its numbers and lists it not draws nothing of them.
const draws = (r: Run) => ((before.get(r.file)!.plugins ?? []) as string[]).includes('scatter3d')
for (const r of runs) {
  const was = resolved(r.chain, before)
  if (!was.scatter3d?.packs || !draws(r)) continue
  if (!reaches(was)) throw new Error(`${path.relative(games, r.file)} draws scatter3d's packs on a land with no rings`)
  const want = translate({ world: was }, path.relative(games, r.file)).scene.world
  const now = resolved(r.chain, after)
  const own = after.get(r.file)!
  for (const p of ['lod3d', 'instances3d']) {
    if (same(now[p], want[p])) continue
    own.world = { ...(own.world ?? {}), [p]: want[p] }
    if (!wrote.includes(r.file)) wrote.push(r.file)
  }
}

// Every scene a game runs checked: the merged translation is the translation of the merged originals.
for (const r of runs) {
  const what = path.relative(games, r.file)
  const was = resolved(r.chain, before), now = resolved(r.chain, after)
  if (now.scatter3d) throw new Error(`${what} still gives world.scatter3d`)
  if (!was.scatter3d) continue
  const want = translate({ world: was }, what).scene.world
  if (!draws(r)) continue
  for (const p of ['lod3d', 'instances3d']) if (!same(now[p], want[p])) throw new Error(`${what}'s world.${p} merged from its files is not the translation of its world.scatter3d:\n${JSON.stringify(now[p])}\n${JSON.stringify(want[p])}`)
  for (const [name, l] of Object.entries((now.lod3d.layers ?? {}) as Json)) {
    for (const k of ['on', 'rows', 'cell', 'spacing', 'seed', 'density', 'size', 'mesh']) if (l[k] === undefined) throw new Error(`${what} lod3d layer ${name} has no ${k}`)
    if (l.mesh.lods.length > now.lod3d.rings.length) throw new Error(`${what} lod3d layer ${name} draws ${l.mesh.lods.length} shells on ${now.lod3d.rings.length} rings`)
  }
  for (const p of Object.keys(now)) if (JSON.stringify(now[p]?.mods ?? {}).includes('"scatter3d"')) throw new Error(`${what} world.${p}.mods still names scatter3d`)
}

for (const f of wrote) {
  const to = path.join(outDir, path.relative(games, f))
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.writeFileSync(to, write(after.get(f)) + '\n')
}
console.log(`wrote ${wrote.length} scene files under ${outDir}:`)
for (const f of wrote.sort()) console.log(`  ${path.relative(games, f)}`)
console.log(`\nnaming scatter3d outside the scene files, moved to lod3d by hand:`)
for (const f of named.sort()) console.log(`  ${path.relative(games, f)}`)
