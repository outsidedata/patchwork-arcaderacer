// The ground of a game's scene at points, worked out on node as its server works it out: the scene
// made as `load` makes each child (`child`: the manager's world under the child's, its partial, its
// actorsFile), the field `world.terrain3d.field` names read through the loader as its `prepare` reads
// it (`mount`, `prepared`), and asked of `landOf`, the land `heightAt`, `rawAt` and `depthAt` read. So a
// height printed here is the one a rule and a page get, to the last bit, for writing into an `actors`
// entry's `pos[1]` while a level is made.
//   node --experimental-strip-types height.ts <game> [<scene>] <x> <z> [<x> <z>]… [--actors]
// Each point prints its x, z, `height` (heightAt: the ground, or the water's surface where the land
// floods), `raw` (rawAt: the ground itself, under water too, where walker stands a body) and `depth`
// (depthAt). `<scene>` is a name of the manager's table, the entry scene when left out. `--actors` also
// prints every `actors` entry of the scene whose `pos` is [x, y, z]: its kind, its pos, the ground under
// it and `above`, its y less the height there, so an entry left at y = 0 under the land shows as below
// it. Run from the repo's root, or anywhere: it finds the repo two folders above its own.
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const a = args.indexOf('--actors')
const actors = a >= 0
if (actors) args.splice(a, 1)
const [game, ...rest] = args
const usage = 'usage: node --experimental-strip-types height.ts <game> [<scene>] <x> <z> [<x> <z>]… [--actors]'
if (!game) {
  console.error(usage)
  process.exit(1)
}
const root = path.resolve(import.meta.dirname, '../../..')
// The loader reads a file at its catalogue url from the folder node runs in.
process.chdir(root)
const at = (p: string) => pathToFileURL(path.join(root, p)).href
const { child } = await import(at('addons/scenemanager/scenemanager.addon.ts'))
const { mount, prepared } = await import(at('plugins/loader/loader.sim.ts'))
const { landOf } = await import(at('plugins/terrain3d/terrain3d.sim.ts'))
const { default: file } = await import(at(`games/${game}/${game}.scene.json`), { with: { type: 'json' } })

const table = file.prefabs.scenemanager.scenes as Record<string, unknown>
const named = rest.length && rest[0] in table
const name: string = named ? rest.shift()! : file.prefabs.scenemanager.entry
const entry = table[name]
if (!entry) throw new Error(`${game}.scene.json names no scene ${name}`)
const numbers = rest.map(Number)
const bad = rest.find((s, i) => s === '' || !Number.isFinite(numbers[i]))
if (bad !== undefined) throw new Error(`${bad} is neither a scene of ${game}.scene.json (${Object.keys(table).join(', ')}) nor a number`)
if (numbers.length % 2) throw new Error(`${numbers.length} numbers are not pairs of x and z`)
if (!numbers.length && !actors) {
  console.error(usage)
  process.exit(1)
}

const { scene } = await child(file, name, entry, at(`games/${game}/${game}.server.ts`))
const field = scene.world.terrain3d?.field
if (typeof field !== 'string') throw new Error(`${game}'s scene ${name} has no world.terrain3d.field`)
await mount(scene.world)
const land = landOf(await prepared(scene.world, field))

const f = (v: number) => v.toFixed(3)
const columns = (cells: string[], widths: number[]) => cells.map((c, i) => c.padStart(widths[i])).join('  ')

console.log(`${game} ${name}: the land of ${field} (${scene.world.loader.assets[field].url})\n`)
if (numbers.length) {
  const widths = [10, 10, 10, 10, 8]
  console.log(columns(['x', 'z', 'height', 'raw', 'depth'], widths))
  for (let i = 0; i < numbers.length; i += 2) {
    const [x, z] = [numbers[i], numbers[i + 1]]
    console.log(columns([f(x), f(z), f(land.height(x, z)), f(land.raw(x, z)), f(land.depth(x, z))], widths))
  }
}
if (actors) {
  const placed = (scene.actors as { is: string; pos?: unknown }[])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => Array.isArray(e.pos) && e.pos.length === 3 && e.pos.every(v => typeof v === 'number'))
  if (numbers.length) console.log('')
  if (!placed.length) console.log(`no actors entry of ${name} has a pos of [x, y, z]`)
  else {
    const widths = [5, Math.max(4, ...placed.map(({ e }) => e.is.length)), 10, 10, 10, 10, 10, 8, 10]
    console.log(columns(['entry', 'kind', 'x', 'y', 'z', 'height', 'raw', 'depth', 'above'], widths))
    for (const { e, i } of placed) {
      const [x, y, z] = e.pos as number[]
      const h = land.height(x, z)
      console.log(columns([String(i), e.is, f(x), f(y), f(z), f(h), f(land.raw(x, z)), f(land.depth(x, z)), f(y - h)], widths))
    }
  }
}
