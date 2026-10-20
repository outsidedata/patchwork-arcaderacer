// The scenemanager extension's backend (`scenemanager.extension.tsx`): a scene added to a game, or
// taken out of it, whole. A scene is made of files no JSON value written can make, since none is there
// yet, and one of them, its sim, is not JSON; of the entries a catalogue it shares, the manager's,
// holds for files of its own, a map it was made with say; and of its entry in the manager's table.
//
//   POST make    { files, table: { file, name, entry }, assets?: [{ file, name, entry }] }: each file
//                of `files`, path from the repo to its text, written, a path outside a game's folder or
//                a file already there refused before any is; then each of `assets`, entry `name` of the
//                catalogue of the scene file `file` (`world.loader.assets`), set to `entry`, refused
//                when the catalogue has it already; then, last, scene `name` of the manager's table in
//                the scene file `file` (`prefabs.scenemanager.scenes`), set to `entry`, refused when the
//                table has it already or the name is none a scene may have. Answers { files }, the paths
//                written.
//   POST unmake  { files, table: { file, name }, assets?: [{ file, name }] }: scene `name` taken out of
//                the manager's table first, refused when the table has none; then each entry of
//                `assets` taken out of its catalogue, refused when the catalogue has none; then each
//                file of `files`, a list of paths, taken away, a path outside a game's folder or a file
//                not there refused before any is. Answers { files }, the paths taken away.
//
// Each JSON value is set as the editor sets one (`files.edit`), so the manager's file's diff is that
// value. Run inside a change (`Edits.route`, `editor/server/changes.ts`), every file it writes, every
// value it sets and every file it takes away is part of that change: a refusal part-way leaves every
// file as it was, one undo takes the whole scene back, and redo makes it again byte for byte.
import type { RouteFiles, Router } from '#editor/server/routes.ts'

// A name a scene may have: its files are named after it.
export const SCENE_NAME = /^[a-z0-9][a-z0-9-]*$/

// An entry `name` of the scene file `file`: of its catalogue, or of the manager's table; and, made, the
// value it is set to.
type Named = { file: string; name: string }
export type Catalogued = Named & { entry: Record<string, unknown> }

// A path a scene's file may be at: in a game's folder, below `games/<game>/`, with no step up or
// back out of it.
const inGame = (p: unknown): p is string =>
  typeof p === 'string' && /^games\/[^/]+\/./.test(p) && !p.split('/').some(part => part === '..' || part === '.' || part === '')
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

async function there(files: RouteFiles, p: string) {
  return files.read(p).then(() => true, () => false)
}

// Whether the JSON file `p` has a value at `at`, each step a key of an object.
async function has(files: RouteFiles, p: string, at: string[]): Promise<boolean> {
  const text = await files.read(p).catch(() => {
    throw new Error(`${p} is not there`)
  })
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error(`${p} is not JSON`)
  }
  for (const k of at) {
    if (!isObject(v) || !Object.hasOwn(v, k)) return false
    v = v[k]
  }
  return true
}

const TABLE = (name: string) => ['prefabs', 'scenemanager', 'scenes', name]
const CATALOGUE = (name: string) => ['world', 'loader', 'assets', name]

// The table's entry and the catalogue entries a body names, each refused when it is not shaped so:
// with the value it is set to when `entry`.
function entriesOf<T extends Named>(route: string, body: unknown, entry: boolean) {
  const { table, assets = [] } = (body ?? {}) as { table?: unknown; assets?: unknown }
  const shape = entry ? '{ file, name, entry }' : '{ file, name }'
  const check = (v: unknown, what: string) => {
    if (!isObject(v) || !inGame(v.file) || typeof v.name !== 'string' || !v.name || (entry && !isObject(v.entry)))
      throw new Error(`${route} takes ${what} as ${shape}: a scene file in a game's folder, a name${entry ? ' and an object' : ''}`)
  }
  check(table, 'the manager\'s table entry')
  if (!Array.isArray(assets)) throw new Error(`${route} takes assets as a list of catalogue entries`)
  for (const a of assets) check(a, 'each catalogue entry')
  return { table: table as T, assets: assets as T[] }
}

async function make(body: unknown, files: RouteFiles) {
  const given = (body as { files?: unknown } | null)?.files
  if (given === null || typeof given !== 'object' || Array.isArray(given)) throw new Error('make takes files, each path with its text')
  const entries = Object.entries(given as Record<string, unknown>)
  if (!entries.length) throw new Error('make takes one file or more')
  const { table, assets } = entriesOf<Catalogued>('make', body, true)
  if (!SCENE_NAME.test(table.name)) throw new Error(`a scene's name is lower-case letters, digits and dashes, and not ${JSON.stringify(table.name)}`)
  for (const [p, text] of entries) {
    if (!inGame(p)) throw new Error(`make writes in a game's folder, and not ${p}`)
    if (typeof text !== 'string') throw new Error(`make writes ${p} as text`)
    if (await there(files, p)) throw new Error(`${p} is there already`)
  }
  for (const [p, text] of entries) await files.write(p, text as string)
  for (const a of assets) {
    if (await has(files, a.file, CATALOGUE(a.name))) throw new Error(`the catalogue of ${a.file} has an entry ${a.name} already`)
    await files.edit(a.file, CATALOGUE(a.name), a.entry)
  }
  if (await has(files, table.file, TABLE(table.name))) throw new Error(`the table of ${table.file} has a scene ${table.name} already`)
  await files.edit(table.file, TABLE(table.name), table.entry)
  return { files: entries.map(([p]) => p) }
}

async function unmake(body: unknown, files: RouteFiles) {
  const paths = (body as { files?: unknown } | null)?.files
  if (!Array.isArray(paths) || !paths.length) throw new Error('unmake takes a list of one path or more')
  for (const p of paths) if (!inGame(p)) throw new Error(`unmake takes away in a game's folder, and not ${String(p)}`)
  const { table, assets } = entriesOf<Named>('unmake', body, false)
  if (!(await has(files, table.file, TABLE(table.name)))) throw new Error(`the table of ${table.file} has no scene ${table.name}`)
  await files.edit(table.file, TABLE(table.name), undefined)
  for (const a of assets) {
    if (!(await has(files, a.file, CATALOGUE(a.name)))) throw new Error(`the catalogue of ${a.file} has no entry ${a.name}`)
    await files.edit(a.file, CATALOGUE(a.name), undefined)
  }
  for (const p of paths as string[]) if (!(await there(files, p))) throw new Error(`${p} is not there`)
  for (const p of paths as string[]) await files.remove(p)
  return { files: paths as string[] }
}

export function scenemanager(r: Router) {
  r.post('make', ({ body, files }) => make(body, files))
  r.post('unmake', ({ body, files }) => unmake(body, files))
}
