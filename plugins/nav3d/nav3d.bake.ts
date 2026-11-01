// nav3d's bake, run on node before the game runs, from a game's own bake file (`scripts/bake.ts`):
//
//   import { bake } from '#plugins/nav3d/nav3d.bake.ts'
//   export default async () => { await bake(new URL('../<game>.scene.json', import.meta.url), '<scene>') }
//
// `bake(manager, scene, write?)` boots the game's manager scene, the file at `manager`, as a server
// does (`load`), and in its child `scene` makes every graph `world.nav3d.graphs` gives a `bake`
// (`graphOf`, `nav3d.sim.ts`), writing each as JSON to its catalogue entry's url: a path under the
// working directory, which is core's root, as the loader reads one on node. It hands back the names it
// made. `write(url, text)`, given, is handed each file in place of the disk.
//
// A graph is an entry of its scene's catalogue, the manager boots every one of its scenes, and each
// scene's preloaded files are read before it boots, so a graph not yet made, of this scene or of any
// other, would stop the boot: before it boots, the bake hands the loader an empty graph, `{ places: [],
// ways: [] }`, for each graph a bake makes, in every scene of the manager, whose file is not on disk.
// The bake reads the scene's rows and changes nothing: nothing is stepped, spawned or ended.
import fs from 'node:fs'
import path from 'node:path'
import { boot, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { child, load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { graphOf } from './nav3d.sim.ts'

const disk = (url: string, text: string) => {
  const file = path.join(process.cwd(), url)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

// The graphs a child's world has the bake make, each with its file's url.
function baked(world: Record<string, any>): { name: string; url: string }[] {
  return Object.entries((world.nav3d?.graphs ?? {}) as Record<string, { asset: string; bake?: unknown }>)
    .filter(([, g]) => g.bake)
    .map(([name, g]) => {
      const it = world.loader?.assets?.[g.asset]
      if (!it) throw new Error(`nav3d graph ${name}'s asset ${g.asset} is not in the scene's loader catalogue`)
      return { name, url: it.url as string }
    })
}

// The rows and world of a booted truth, read as a rule reads them; it changes nothing.
function reader(t: Truth): W {
  const still = (what: string) => () => { throw new Error(`nav3d's bake reads the scene and changes nothing: it does not ${what}`) }
  return {
    world: t.world,
    all: kind => t.rows.filter((r: Row) => r.kind === kind),
    get: id => {
      const r = t.rows.find((r: Row) => r.id === id)
      if (!r) throw new Error(`no row ${id}`)
      return r
    },
    find: (kind, pred = () => true) => {
      const r = t.rows.find((r: Row) => r.kind === kind && pred(r))
      if (!r) throw new Error(`no ${kind} matches`)
      return r
    },
    spawn: still('spawn'),
    end: still('end'),
    die: still('roll'),
    call: still('call'),
  }
}

export async function bake(manager: URL, scene: string, write: (url: string, text: string) => void = disk): Promise<string[]> {
  const top = JSON.parse(fs.readFileSync(manager, 'utf8')) as Scene
  const base = new URL('./', manager).href
  const scenes = (top.prefabs.scenemanager?.scenes ?? {}) as Record<string, any>
  const entry = scenes[scene]
  if (!entry) throw new Error(`${path.basename(manager.pathname)} has no scene ${scene}`)
  const made = await child(top, scene, entry, base)
  const graphs = baked(made.scene.world ?? {})
  if (!graphs.length) throw new Error(`scene ${scene} has no graph to bake: no world.nav3d.graphs entry gives a bake`)
  for (const [name, e] of Object.entries(scenes)) {
    const world = name === scene ? made.scene.world : (await child(top, name, e, base)).scene.world
    for (const g of baked(world ?? {})) if (!fs.existsSync(path.join(process.cwd(), g.url))) written(g.url, JSON.stringify({ places: [], ways: [] }))
  }
  const truth = (await load(boot(top, { scenemanager }), base)).get(scene)!
  const w = reader(truth)
  for (const g of graphs) {
    const text = JSON.stringify(graphOf(w, g.name))
    write(g.url, text)
    written(g.url, text)
  }
  return graphs.map(g => g.name)
}
