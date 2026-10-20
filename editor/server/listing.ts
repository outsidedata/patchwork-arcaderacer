// What the editor's server lists of the repo, found on the disk each time it is asked, so a game or
// an extension made a moment ago is in it: the games, and the extensions an editor page loads.
import { existsSync, readFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

// The games of `games/` under `root`: each folder holding a manager scene of its name, and whether
// the editor opens it, a scenemanager table in that scene and a sim beside it. None when there is no
// `games/`, as in a clone of core before its first game.
export async function gamesIn(root: string): Promise<{ name: string; opens: boolean }[]> {
  const out: { name: string; opens: boolean }[] = []
  // A folder by a link to it is a game's folder as much as one that is there itself.
  for (const e of await readdir(path.join(root, 'games'), { withFileTypes: true }).catch(() => [])) {
    const scene = path.join(root, 'games', e.name, `${e.name}.scene.json`)
    if (!existsSync(scene)) continue
    let table: unknown
    try {
      table = JSON.parse(readFileSync(scene, 'utf8'))?.prefabs?.scenemanager?.scenes
    } catch {
      table = undefined
    }
    out.push({ name: e.name, opens: !!table && existsSync(path.join(root, 'games', e.name, `${e.name}.sim.ts`)) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// The `.extension.tsx` files in `dir` under `root`, or in each folder of it with `deep`, by their urls;
// a file or a folder by a link to it as much as one there itself.
async function extensionsAt(root: string, dir: string, deep: boolean): Promise<string[]> {
  const names = (d: string) => readdir(path.join(root, d)).catch(() => [] as string[])
  const is = (p: string) => stat(path.join(root, p)).catch(() => undefined)
  const out: string[] = []
  for (const name of await names(dir)) {
    const at = `${dir}/${name}`
    const s = await is(at)
    if (deep && s?.isDirectory()) for (const f of await names(at)) {
      if (f.endsWith('.extension.tsx') && (await is(`${at}/${f}`))?.isFile()) out.push(`/${at}/${f}`)
    }
    if (!deep && name.endsWith('.extension.tsx') && s?.isFile()) out.push(`/${at}`)
  }
  return out.sort()
}

export type Extensions = { own: string[]; named: string[]; game: string[] }

// Every extension an editor page on `game` loads, by its url: the editor's own; every plugin's and
// addon's, which it turns on as the game names them (`Editor.fit`); and the game's own, its folder's,
// its own extensions' and its own plugins'.
export async function extensionsOf(root: string, game: string | undefined): Promise<Extensions> {
  if (game !== undefined && !/^[\w-]+$/.test(game)) throw new Error(`no game ${game}`)
  const g = game && `games/${game}`
  return {
    own: await extensionsAt(root, 'extensions', true),
    named: [...await extensionsAt(root, 'plugins', true), ...await extensionsAt(root, 'addons', true)],
    game: g ? [...await extensionsAt(root, g, false), ...await extensionsAt(root, `${g}/extensions`, true), ...await extensionsAt(root, `${g}/plugins`, true)] : [],
  }
}
