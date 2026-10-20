// The scenemanager's extension: the type of a field that names a scene of the open game, the Scenes
// panel, and a scene added to the game, made new from another and taken out.
//
// The Scenes panel (`scenemanager.components.tsx`) lists the game's scenes, the entry marked; the one
// selected shows its file, its rows and the files its world uses by name; Remove takes it out (Remove
// anyway, when another scene's field names it); New scene opens the form: a name, the scene it is made
// from, the kinds whose actors it keeps, and which of the files that scene's world names, its map say,
// it gets its own copy of (`newScene`), each unticked one shared with the scene it is made from.
//
// `scenemanager.scene` is a scene of the manager's table, `prefabs.scenemanager.scenes` of the
// open game's manager file: a pick of its names, a name the table has not got kept and marked so,
// as a door to a scene nobody made yet is. The manager's `entry` is one. A game binds a field of
// its own that names a scene to it, where one of its things leads.
//
// `addScene` adds a scene to the open game as one change, the extension's route's `make`
// (`scenemanager.route.ts`), so one undo takes it all back out and redo makes it again byte for byte:
// its scene file, `<name>.scene.json` beside the manager's; its sim, `<name>.sim.ts`, which exports
// that file as `scene` and hands out as `sim` the sim the scene it is made from hands out, whether
// that scene's sim makes it or hands out another's, as the levels of a game whose levels share their
// kinds do; any other new files it is handed, such as its map; the catalogue entries it is handed for
// them, such as its map's in the manager's catalogue; and its entry in the manager's table, the one of
// the scene it is made from with the new file, last, so the game boots with the scene once everything
// it names is there. The route refuses it whole, writing nothing, for a file there already, a
// catalogue entry or a table entry there already. The editor's session takes the new scene in as the
// manager's file changes (`editor/session.ts`). `removeScene` takes a scene out the same way, as one
// change, the route's `unmake`: its entry first, so the game boots without it, then the entries of a
// catalogue it shares with others, the manager's, that only its world names, as a scene made with its
// own copy of a map is catalogued, then its scene file, its sim and the data files only it reaches, a
// map it was made with say; a file the route finds not there refuses it whole, writing nothing. The
// manager's entry, which every connection enters, is not taken out, nor a scene whose sim another
// scene's sim hands out, nor, unless asked to anyway, one a field of another scene names
// (`scenemanager.scene`). A scene added holds only actors of the kinds the sim it is made from hands
// out.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each one undo:
//   scenes.new     a scene made from another as the New scene form makes one (`newScene`);
//   scenes.add     a scene added to the open game as `addScene` adds one, made from another: its
//                  scene file the one handed, a scene file's shape, or else a copy of the file of the
//                  scene it is made from. Answers its entry, its files and the game's scenes.
//   scenes.remove  a scene taken out as `removeScene` takes one out. Answers the files taken away, the
//                  files it names alone that stay, and the game's scenes.
import { z } from 'zod'
import type { Edits, Editor } from '#editor/editor.ts'
import type { Entry } from '#addons/scenemanager/scenemanager.addon.ts'
import { namesIn } from '#plugins/loader/loader.sim.ts'
import { SceneName, ScenesPanel } from './scenemanager.components.tsx'
import { SCENE_NAME, type Catalogued } from './scenemanager.route.ts'

// The open game's table of scenes, by name.
export function scenesOf(ed: Editor): Record<string, Entry> {
  return (ed.session?.game.file.prefabs.scenemanager?.scenes ?? {}) as Record<string, Entry>
}

// The sim a scene's sim hands out: the module it hands out another's from, else itself, by its file
// name beside it.
export function simOf(simFile: string, text: string): string {
  const handed = /^export\s*\{\s*sim\s*\}\s*from\s*['"]\.\/([^'"/]+\.sim\.ts)['"]/m.exec(text)
  return handed ? handed[1] : simFile
}

// The sim of a scene made from another: its scene file exported as `scene`, and the sim `kinds`
// hands out as `sim`.
export function simText(name: string, from: string, kinds: string): string {
  return [
    `// ${name}, made from ${from}: the scene is \`${name}.scene.json\`, and its kinds are every one \`${kinds}\` hands out.`,
    `import type { Scene } from '#engine/engine.ts'`,
    `import file from './${name}.scene.json' with { type: 'json' }`,
    '',
    `export { sim } from './${kinds}'`,
    '',
    'export const scene = file as Scene',
    '',
  ].join('\n')
}

// Adds the scene `name`, made from the scene `from`, as one change `e` makes, the route's `make`: its
// scene file holding `file`, its sim, the files `more` (by their paths from the repo, with their text),
// then the catalogue entries `assets`, and its entry in the manager's table last.
export async function addScene(ed: Editor, e: Edits, name: string, from: string, file: unknown, more: Record<string, string> = {}, assets: Catalogued[] = []) {
  const s = ed.need()
  const table = scenesOf(ed)
  if (!SCENE_NAME.test(name)) throw new Error(`a scene's name is lower-case letters, digits and dashes, and not ${JSON.stringify(name)}`)
  if (table[name]) throw new Error(`${s.game.name} has a scene ${name} already`)
  const was = entryOf(ed, from)
  const folder = folderOf(ed)
  const fromSim = simFile(was)
  const kinds = simOf(fromSim, await ed.text(folder + fromSim))
  const made = {
    [`${folder}${name}.scene.json`]: JSON.stringify(file, null, 2) + '\n',
    [`${folder}${name}.sim.ts`]: simText(name, from, kinds),
    ...more,
  }
  await e.route('scenemanager', 'make', { files: made, assets, table: { file: s.game.path, name, entry: { ...was, file: `${name}.scene.json` } } })
}

// Every string a scene file's own `world` holds, at any depth, but in its catalogue (`world.loader`):
// the names it uses things by, a catalogue entry's among them.
function worldNames(world: Record<string, unknown> | undefined): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.add(v)
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk)
  }
  for (const [k, v] of Object.entries(world ?? {})) if (k !== 'loader') walk(v)
  return out
}

// The entries of scene `scene`'s catalogue, as it boots with it, that its own file's world names by a
// string: the files it uses by name, its map say. `shared` says of each whether every scene of the
// game names it, as their definitions; else a scene made from this one is given its own copy of it.
export function namedEntries(ed: Editor, scene: string): { name: string; url: string; shared: boolean }[] {
  const s = ed.need()
  const assets = (s.scene(scene).world.loader?.assets ?? {}) as Record<string, { url: string }>
  const mine = worldNames(s.files.get(s.path(scene))?.world)
  const scenes = Object.keys(scenesOf(ed))
  return Object.keys(assets).filter(a => mine.has(a)).map(a => ({
    name: a,
    url: assets[a].url,
    shared: scenes.every(o => worldNames(s.files.get(s.path(o))?.world).has(a)),
  }))
}

// A scene made from scene `from` as the change `e` makes, as `addScene` adds one: its file `from`'s,
// with the actors of the kinds `keep` alone, in its actors file's copy when `from` names one; and for
// each catalogue entry of `own` that `from`'s world names, a copy of its file of its own, beside it,
// named after the scene (after the scene and the entry, for more than one), its world naming the copy
// where it named the entry, and the copy catalogued where the entry is: in its own world's catalogue
// in place of the entry, when `from`'s file gives its catalogue, else beside the entry in the file
// that does, the manager's.
export async function newScene(ed: Editor, e: Edits, name: string, from: string, keep: string[], own: string[]) {
  const s = ed.need()
  const fromPath = s.path(from)
  const file = structuredClone(s.files.get(fromPath)!) as Record<string, unknown> & { world?: Record<string, unknown>; actors: { is: string }[]; actorsFile?: string }
  file.actors = file.actors.filter(a => keep.includes(a.is))
  const more: Record<string, string> = {}
  const catalogued: Catalogued[] = []
  const dir = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)
  const list = s.actorsPath(from)
  if (list && file.actorsFile) {
    const copy = `${dir(file.actorsFile)}${name}.actors.json`
    file.actorsFile = copy
    more[`${dir(fromPath)}${copy}`] = JSON.stringify((s.lists.get(list) ?? []).filter(a => keep.includes(a.is)), null, 2) + '\n'
  }
  const named = namedEntries(ed, from)
  const assets = (s.scene(from).world.loader?.assets ?? {}) as Record<string, { url: string }>
  const ownsCatalogue = !!(file.world?.loader as { assets?: unknown } | undefined)?.assets
  for (const n of own) {
    if (!named.some(m => m.name === n)) throw new Error(`${from}'s world names no entry ${n} of its catalogue: it names ${named.map(m => m.name).join(', ') || 'none'}`)
    const key = own.length === 1 ? name : `${name}-${n}`
    if (key in assets) throw new Error(`${from}'s catalogue has an entry ${key} already`)
    const url = assets[n].url
    const copy = `${dir(url)}${key}${url.slice(url.lastIndexOf('.'))}`
    more[copy.replace(/^\//, '')] = await ed.text(url.replace(/^\//, ''))
    // The world names the copy where it named the entry.
    const rename = (v: unknown): unknown => (v === n ? key : Array.isArray(v) ? v.map(rename) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rename(x)])) : v)
    for (const k of Object.keys(file.world ?? {})) if (k !== 'loader') file.world![k] = rename(file.world![k])
    const entry = { ...assets[n], url: copy }
    if (ownsCatalogue) {
      const catalogue = (file.world!.loader as { assets: Record<string, unknown> }).assets
      delete catalogue[n]
      catalogue[key] = entry
    } else catalogued.push({ file: ed.worldFile(from, 'loader'), name: key, entry })
  }
  await addScene(ed, e, name, from, file, more, catalogued)
}

// Scene `name` of the open game's table, refused naming the scenes it has.
function entryOf(ed: Editor, name: string): Entry {
  const table = scenesOf(ed)
  if (!Object.hasOwn(table, name)) throw new Error(`${ed.need().game.name} has no scene ${name}: its scenes are ${Object.keys(table).join(', ')}`)
  return table[name]
}
// The open game's folder, from the repo, and a scene's sim file in it, beside its scene file.
const folderOf = (ed: Editor) => ed.need().game.path.slice(0, ed.need().game.path.lastIndexOf('/') + 1)
const simFile = (entry: Entry) => entry.file.replace(/\.scene\.json$/, '.sim.ts')

// The files of the open game a scene names, by their paths from the repo: every url of its
// catalogue, and its actors file.
function namedBy(ed: Editor, scene: string): string[] {
  const s = ed.need()
  const assets = (s.scene(scene).world.loader?.assets ?? {}) as Record<string, { url: string }>
  const list = s.actorsPath(scene)
  return [...Object.values(assets).map(a => a.url.replace(/^\//, '')), ...(list ? [list] : [])]
}
// A data file a scene's files may be made with, which a route takes away and makes again as text.
const DATA = /\.(json|tmj|tsj)$/

// Every file the open game's files reach from `roots`, the roots too: each data file read, and the
// files it names in turn, as the loader, which reads them, says they do (`namesIn`). A file that is not
// there reaches nothing more; `unread` holds it.
async function reach(ed: Editor, roots: string[], unread = new Set<string>()): Promise<Set<string>> {
  const seen = new Set<string>()
  const todo = [...roots]
  while (todo.length) {
    const f = todo.pop()!
    if (seen.has(f)) continue
    seen.add(f)
    if (!DATA.test(f)) continue
    let file: unknown
    try {
      file = JSON.parse(await ed.text(f))
    } catch {
      unread.add(f)
      continue
    }
    todo.push(...namesIn(file, '/' + f).map(n => n.url.replace(/^\//, '')))
  }
  return seen
}

// Where the open game's files other than scene `name`'s own name it, in a field bound to
// `scenemanager.scene` (`SceneName`): each scene's prefabs and actors, its actors file's, and the
// definitions of its data file of kinds (`world.defs`), each as the file and the path in it.
async function namingsOf(ed: Editor, name: string): Promise<string[]> {
  const s = ed.need()
  const out = new Set<string>()
  const walk = (file: string, kind: string, value: unknown, at: (string | number)[], where: (string | number)[]) => {
    if (value === name && ed.typeOf(kind, at) === 'scenemanager.scene') out.add(`${file} ${[...where, ...at].join('.')}`)
    if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(file, kind, v, [...at, Array.isArray(value) ? Number(k) : k], where)
  }
  const scene = (file: string, f: { prefabs?: Record<string, unknown>; actors?: Record<string, unknown>[] }) => {
    for (const [kind, prefab] of Object.entries(f.prefabs ?? {})) walk(file, kind, prefab, [], ['prefabs', kind])
    ;(f.actors ?? []).forEach((a, i) => walk(file, String(a.is), a, [], ['actors', i]))
  }
  scene(s.game.path, s.game.file)
  const defs = new Set<string>()
  for (const other of Object.keys(scenesOf(ed))) {
    if (other === name) continue
    scene(s.path(other), s.files.get(s.path(other)) ?? {})
    const list = s.actorsPath(other)
    if (list) (s.lists.get(list) ?? []).forEach((a, i) => walk(list, String(a.is), a, [], [i]))
    const world = s.scene(other).world
    const def = typeof world.defs === 'string' ? (world.loader?.assets?.[world.defs] as { url?: string } | undefined)?.url : undefined
    if (def) defs.add(def.replace(/^\//, ''))
  }
  for (const file of defs) for (const [kind, d] of Object.entries(JSON.parse(await ed.text(file)) as Record<string, unknown>)) walk(file, kind, d, [], [kind])
  return [...out]
}

// Takes the scene `name` out of the open game as one change `e` makes, the route's `unmake`: its entry
// in the manager's table, then each entry of a catalogue it shares, the manager's, that only its world
// names and whose file goes, then its scene file, its sim, and each data file it reaches that no other
// scene reaches (a map, an actors file), which a scene added was made with, with what it reaches in
// turn. Refused, writing nothing, for the manager's entry, for a scene whose sim another scene's sim
// hands out, and, unless `anyway`, for a scene a field of another names, naming them; and whole, by
// the route, for a file not there. Answers the files taken away, and those it reaches alone that stay:
// a picture, and the sheet or map that names it.
export async function removeScene(ed: Editor, e: Edits, name: string, anyway = false): Promise<{ files: string[]; kept: string[] }> {
  const s = ed.need()
  const entry = entryOf(ed, name)
  const manager = s.game.file.prefabs.scenemanager as { entry: string }
  if (manager.entry === name) throw new Error(`${name} is the scene every connection enters, the manager's entry: make another the entry first`)
  const folder = folderOf(ed)
  const sim = simFile(entry)
  const others = Object.keys(scenesOf(ed)).filter(o => o !== name)
  const users: string[] = []
  for (const other of others) if (simOf(simFile(scenesOf(ed)[other]), await ed.text(folder + simFile(scenesOf(ed)[other]))) === sim) users.push(other)
  if (users.length) throw new Error(`the sim of ${name}, ${sim}, hands out the kinds of ${users.join(', ')}: take ${users.length === 1 ? 'that scene' : 'those scenes'} out first`)
  const naming = await namingsOf(ed, name)
  if (naming.length && !anyway) throw new Error(`${name} is named by ${naming.join('; ')}: take it out anyway, and they name a scene the game has not got`)
  // What every other scene reaches, a map's tilesets and a sheet's pages too, and what this one reaches
  // that none of them does: of that, a file goes with every file it reaches that goes too, so a map
  // or a sheet and the pictures it names go or stay together, and stays, with them, when one of them
  // is no data a route makes again as text, or is not there to be read.
  // The scene's own entries of a catalogue it shares, the manager's: those its world names and no
  // other scene file's does, as a scene made with its own copy of a map is catalogued. They go with it,
  // and what they name is reached from nowhere else for them.
  const loaderFile = ed.worldFile(name, 'loader')
  const inherited = loaderFile === s.path(name) ? {} : ((s.files.get(loaderFile)?.world?.loader as { assets?: Record<string, { url: string }> } | undefined)?.assets ?? {})
  const othersName = new Set([s.game.path, ...others.map(o => s.path(o))].flatMap(p => [...worldNames(s.files.get(p)?.world)]))
  const mine = namedEntries(ed, name).filter(n => n.name in inherited && !othersName.has(n.name))
  const mineUrls = new Set(mine.map(n => n.url.replace(/^\//, '')))
  const unread = new Set<string>()
  const roots = [...others.flatMap(o => namedBy(ed, o)), ...Object.values((s.game.file.world?.loader?.assets ?? {}) as Record<string, { url: string }>).map(a => a.url.replace(/^\//, ''))]
  const elsewhere = await reach(ed, roots.filter(f => !mineUrls.has(f)))
  const alone = [...(await reach(ed, namedBy(ed, name), unread))].filter(f => f.startsWith(folder) && !elsewhere.has(f))
  const taken: string[] = []
  for (const f of alone) {
    const along = [...(await reach(ed, [f]))].filter(g => alone.includes(g))
    if (along.every(g => DATA.test(g) && !unread.has(g))) taken.push(f)
  }
  const files = [folder + entry.file, folder + sim, ...taken]
  const assets = mine.filter(n => taken.includes(n.url.replace(/^\//, ''))).map(n => ({ file: loaderFile, name: n.name }))
  await e.route('scenemanager', 'unmake', { files, table: { file: s.game.path, name }, assets })
  return { files, kept: alone.filter(f => !taken.includes(f)) }
}

// What a scene file holds, as the engine reads one: its prefabs, its actors, each a kind it `is`,
// and its world, its plugins and its seats where it gives them, with any other block beside them.
const SCENE = z.looseObject({
  world: z.record(z.string(), z.json()).optional(),
  prefabs: z.record(z.string(), z.record(z.string(), z.json())),
  actors: z.array(z.looseObject({ is: z.string() })),
  plugins: z.array(z.string()).optional(),
  seats: z.number().int().min(0).optional(),
})

export function scenemanager(ed: Editor) {
  ed.field('scenemanager.scene', SceneName)
  ed.bind('scenemanager', { entry: 'scenemanager.scene' })
  ed.panel({ id: 'scenes', title: 'Scenes', area: 'left', component: ScenesPanel })

  const scenes = () => Object.keys(scenesOf(ed))
  ed.command({
    id: 'scenes.new',
    title: 'Scenes: new',
    input: z.object({
      name: z.string().describe('the new scene\'s name: lower-case letters, digits and dashes'),
      from: z.string().describe('the scene it is made from: its kinds, systems, world and actors'),
      keep: z.array(z.string()).optional().describe('the kinds whose actors it keeps; all of from\'s by default, none with []'),
      own: z.array(z.string()).optional().describe('catalogue entries from\'s world names, its map say, it gets its own copy of; by default each not every scene names'),
    }).describe('Makes a scene from another as the New scene form does: its file from\'s with the actors of the kinds kept, its own copy of each file of own, its sim and its entry in the manager\'s table. One undo. Answers its entry, files and the game\'s scenes.'),
    run: async ({ name, from, keep, own }, e) => {
      entryOf(ed, from)
      const kinds = [...new Set((ed.need().files.get(ed.need().path(from))?.actors ?? []).map(a => a.is))]
      await newScene(ed, e, name, from, keep ?? kinds, own ?? namedEntries(ed, from).filter(n => !n.shared).map(n => n.name))
      return { name, entry: scenesOf(ed)[name], scenes: scenes() }
    },
  })
  ed.command({
    id: 'scenes.add',
    title: 'Scenes: add',
    input: z.object({
      name: z.string().describe('the new scene\'s name: lower-case letters, digits and dashes'),
      from: z.string().describe('the scene it is made from, whose sim\'s kinds it has and whose entry it copies'),
      file: z.record(z.string(), z.unknown()).optional().describe('its scene file: { prefabs, actors, world?, plugins?, seats? }; a copy of from\'s when left out'),
    }).describe('Adds a scene to the open game, made from another: its scene file, its sim and its entry in the manager\'s table, as one undo. Answers its entry and files.'),
    run: async ({ name, from, file }, e) => {
      const was = entryOf(ed, from)
      const folder = folderOf(ed)
      const given = file ?? JSON.parse(await ed.text(folder + was.file))
      // Parsed to be held to its shape, and written as it was handed, its keys in its own order.
      const got = SCENE.safeParse(given)
      if (!got.success) throw new Error(`the scene file of ${name} is not one the engine reads: ${z.prettifyError(got.error)}`)
      // Each actor a kind the sim it is booted with hands out: `from`'s.
      const kinds = Object.keys(ed.sceneOf(from).sim)
      const odd = got.data.actors.findIndex(a => !kinds.includes(a.is))
      if (odd >= 0) throw new Error(`the scene file of ${name} has actor ${odd} a ${got.data.actors[odd].is}, a kind the sim of ${from} does not hand out: its kinds are ${kinds.join(', ')}`)
      await addScene(ed, e, name, from, given)
      return { name, entry: scenesOf(ed)[name], files: [`${folder}${name}.scene.json`, `${folder}${name}.sim.ts`], scenes: scenes() }
    },
  })
  ed.command({
    id: 'scenes.remove',
    title: 'Scenes: remove',
    input: z.object({
      name: z.string().describe('the scene'),
      anyway: z.boolean().optional().describe('take it out though a field of another scene names it'),
    }).describe('Takes a scene out of the open game: its entry in the manager\'s table, its scene file, its sim and the data files only it names, as one undo; refused for the entry scene, one whose sim hands out another\'s kinds, and one another names unless anyway. Answers the files taken away, and those it names alone that stay.'),
    run: async ({ name, anyway = false }, e) => ({ removed: name, ...(await removeScene(ed, e, name, anyway)), scenes: scenes() }),
  })
}
