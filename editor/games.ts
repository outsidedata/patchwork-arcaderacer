// A game, as the editor opens it, found by its file names: `games/<game>/<game>.scene.json` is a
// game's manager scene and `<game>.sim.ts` its sim. A game whose manager scene has no
// `scenemanager` table is older than the scenemanager pattern, and the editor does not open it. The
// editor page reads the one game its url names (`main.tsx`); the server lists the games there are
// (`FilesApi.games`).
import type { Scene, Sim } from '#engine/engine.ts'
import type { FilesApi } from './files.ts'

export type Game = {
  name: string
  // The manager scene's path from the repo, and the url its scene files are relative to.
  path: string
  base: string
  file: Scene
  managed: boolean
  sim(): Promise<Sim>
}

// Game `name`, its manager scene read through `files` as the file now is, its sim imported from its
// folder on `origin`.
export async function readGame(files: FilesApi, name: string, origin = location.origin): Promise<Game> {
  const path = `games/${name}/${name}.scene.json`
  const file = JSON.parse(await files.read(path)) as Scene
  const base = new URL(`/games/${name}/`, origin).href
  return {
    name,
    path,
    base,
    file,
    managed: !!file.prefabs?.scenemanager?.scenes,
    sim: async () => ((await import(/* @vite-ignore */ new URL(`${name}.sim.ts`, base).href)) as { sim: Sim }).sim,
  }
}
