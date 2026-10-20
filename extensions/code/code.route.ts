// The code extension's backend (`code.extension.tsx`): the code files of the games, plugins, addons
// and extensions, listed, written whole, made and taken away.
// The engine's code is no file here: it is frozen. Nor is the editor's own. A JSON file is no code
// file either: it is data, written a value at a time by the editor's own files.
//
//   GET  list    ?dirs=<folder>,…: every code file under each folder, a game's, a plugin's, an
//                addon's or an extension's (`games/<game>`), sorted; a folder that is not there has
//                none. Answers { files }.
//   GET  read    ?path=<file>: the code file's text, or null when it is not there, which the panel
//                asks of a file it makes, takes away or kept open across a reload, and which is no
//                error. Answers { text }.
//   POST save    { path, text, was }: the file at `path` made to hold `text`, when it holds `was` now:
//                `was` null for a file that is not there yet, which `save` makes; `text` null to take
//                the file away. A file that holds something else than `was` is refused with nothing
//                written, so a save never writes over a change it was not shown. Answers { files }:
//                the path. Run inside a change (`Edits.route`, `editor/server/changes.ts`), the file
//                it writes is that change, which one undo takes back byte for byte, and which a page
//                that has imported the file reloads with.
import type { RouteFiles, Router } from '#editor/server/routes.ts'

// What makes a file code: its extension. JSON is data, not code.
export const CODE = /\.(ts|tsx|js|mjs|cjs|css|html|py|glsl|wgsl|md|txt)$/
// The folders code is kept in, each a thing of its own: `games/<game>`, `plugins/tilemap`.
const HOME = /^(games|plugins|addons|extensions)\/[^/]+$/

// A path a code file may be at: below a game's, a plugin's, an addon's or an extension's folder,
// with no step up or back out of it, and a code file's extension.
export const codePath = (p: unknown): p is string =>
  typeof p === 'string' && CODE.test(p) && HOME.test(p.split('/').slice(0, 2).join('/')) && p.split('/').length > 2 &&
  !p.split('/').some(part => part === '..' || part === '.' || part === '')

const textOf = (files: RouteFiles, p: string) => files.read(p).then(t => t as string | null, () => null)

async function list(query: URLSearchParams, files: RouteFiles) {
  const dirs = (query.get('dirs') ?? '').split(',').filter(Boolean)
  for (const d of dirs) if (!HOME.test(d)) throw new Error(`list lists a game's, a plugin's, an addon's or an extension's folder, and not ${d}`)
  const found = new Set<string>()
  for (const d of dirs) for (const f of await files.list(d).catch(() => [] as string[])) if (codePath(f)) found.add(f)
  return { files: [...found].sort() }
}

async function save(body: unknown, files: RouteFiles) {
  const b = body as { path?: unknown; text?: unknown; was?: unknown } | null
  const p = b?.path
  if (!codePath(p)) throw new Error(`save writes a code file of a game, a plugin, an addon or an extension, and not ${String(p)}`)
  const text = b!.text ?? null, was = b!.was ?? null
  if (text !== null && typeof text !== 'string') throw new Error(`save writes ${p} as text`)
  if (was !== null && typeof was !== 'string') throw new Error(`save is handed what ${p} holds as text`)
  if (text === null && was === null) throw new Error(`save makes ${p}, writes it or takes it away, and is handed neither its text nor what it holds`)
  const now = await textOf(files, p)
  if (now !== was) {
    if (was === null) throw new Error(`${p} is there already`)
    if (now === null) throw new Error(`${p} is not there`)
    throw new Error(`${p} has changed since it was read: read it again`)
  }
  if (text === null) await files.remove(p)
  else await files.write(p, text)
  return { files: [p] }
}

async function read(query: URLSearchParams, files: RouteFiles) {
  const p = query.get('path')
  if (!codePath(p)) throw new Error(`read reads a code file of a game, a plugin, an addon or an extension, and not ${String(p)}`)
  return { text: await textOf(files, p) }
}

export function code(r: Router) {
  r.get('list', ({ query, files }) => list(query, files))
  r.get('read', ({ query, files }) => read(query, files))
  r.post('save', ({ body, files }) => save(body, files))
}
