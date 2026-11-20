// Games that live outside the repo, served as if they were in `games/`: `yarn dev <folder>` and `yarn serve <folder>`
// mount the folder, and its game is `games/<the folder's name>/` to everything that serves, bundles and runs a game
// (`vite.config.ts`, `bundle.ts`, `servers.ts`, `home.ts`). Its pages are `/games/<name>/<page>.html`, its files
// `/games/<name>/<file>`, its server `games/<name>/<name>.server.ts`, run from the repo's root as every game's is.
//
// A mounted game imports the engine as a game of the repo does, by the repo's own names (`#engine/*`, `#plugins/*`,
// `#addons/*`, `#games/*`, `#scripts/*`, the `imports` of the repo's package.json) and the repo's packages (`three`,
// `lil-gui`): its folder's own package.json, if it has one, is never read for them. The bundle resolves them for the
// page (`bundle.ts`), and `mounted.hooks.ts`, which `servers.ts` hands node with `--import`, for the server.
//
// Each path is named two ways: as the repo names it (`games/<name>/<file>`, what a url and a key are made from) and
// where it is on disk (`where`). A file of a mounted folder found on disk is named as the repo names it by `named`.
// A folder is mounted by its real path, links followed, so a file found through a link to it is named too.
import { existsSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'

const posix = (p: string) => p.split(path.sep).join('/')

// Each mounted game's name and its folder's real path.
const mounted = new Map<string, string>()

// The game in `folder` mounted, and its name handed back: the folder's own name, which must be a game's name, not
// one of the repo's games, and not one mounted from another folder already.
export function mount(root: string, folder: string): string {
  const abs = path.resolve(folder)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error(`mount: ${abs} is not a folder`)
  const real = realpathSync(abs)
  const name = path.basename(real)
  if (!/^[\w-]+$/.test(name)) throw new Error(`mount: a game's folder is named in letters, digits, _ and -, not ${name}`)
  if (existsSync(path.join(root, 'games', name))) throw new Error(`mount: the repo has a game ${name} (games/${name}); a mounted game needs a name of its own`)
  const had = mounted.get(name)
  if (had !== undefined && had !== real) throw new Error(`mount: ${name} is mounted from ${had} already`)
  mounted.set(name, real)
  return name
}

// Every mounted game, by name, with its folder.
export const mounts = (): [string, string][] => [...mounted]

// Whether `name` is a mounted game.
export const isMounted = (name: string) => mounted.has(name)

// Where a path as the repo names it is on disk: under the mounted folder for `games/<a mounted game>/...`, else
// under the root.
export function where(root: string, rel: string): string {
  const m = /^games\/([^/]+)(?:\/(.*))?$/.exec(posix(rel))
  const folder = m ? mounted.get(m[1]) : undefined
  if (folder === undefined) return path.join(root, rel)
  return m![2] ? path.join(folder, m![2]) : folder
}

// A file on disk named as the repo names it: `games/<name>/...` for one in a mounted folder (its real path or the
// path it was mounted by), else its path from the root; undefined for a file in neither.
export function named(root: string, abs: string): string | undefined {
  for (const [name, folder] of mounted) {
    const inside = within(folder, abs) ?? within(folder, real(abs))
    if (inside !== undefined) return inside ? `games/${name}/${inside}` : `games/${name}`
  }
  const r = posix(path.relative(root, abs))
  return r.startsWith('..') || path.isAbsolute(r) ? undefined : r
}

// `abs` from `folder`, '' for the folder itself, undefined when it is not inside it
function within(folder: string, abs: string): string | undefined {
  const r = path.relative(folder, abs)
  if (r === '') return ''
  return r.startsWith('..') || path.isAbsolute(r) ? undefined : posix(r)
}

// the path with its links followed, as far as the nearest folder over it still there (a file just removed)
function real(abs: string): string {
  for (let at = abs, rest = ''; ; rest = path.join(path.basename(at), rest), at = path.dirname(at)) {
    try { return path.join(realpathSync(at), rest) } catch {}
    if (path.dirname(at) === at) return abs
  }
}

// The repo's own names for its folders (its package.json's `imports`): `#engine/x` is `<root>/engine/x`, and
// `#games/<a mounted game>/x` is in that game's folder.
export const REPO_NAMES = /^#(engine|plugins|addons|games|scripts)\/(.+)$/

export function repoName(root: string, specifier: string): string | undefined {
  const m = REPO_NAMES.exec(specifier)
  return m ? where(root, `${m[1]}/${m[2]}`) : undefined
}
