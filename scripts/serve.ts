// Serves one game as it is played over the network: `yarn serve <game | folder>` runs Vite on the repo's
// config, which serves every game's pages as `yarn dev` does, and `games/<game>/<game>.server.ts` on
// node beside it (`servers.ts`), so `client.html` dials it. Everything the game's server prints is
// printed after the game's name. A change to a file the server may run starts it again on its new
// code, one that stopped by itself too (`restarts`); a file whose real path, links followed, is out of
// the repo (a game's builds in the system's temp folder, linked into its `assets/`) never does. The
// home page says which game's server runs
// (`home.ts`). Ctrl-C stops both.
//
// `yarn serve <folder>` serves a game that lives outside the repo: the folder is mounted (`mounts.ts`), its game
// named by the folder's name and served at `/games/<name>/`, its files watched as the repo's are. A game is the
// repo's when `games/<game>` is there, and else a folder.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, type PluginOption } from 'vite'
import config from '../vite.config.ts'
import { home } from './home.ts'
import { mount, mounts, named } from './mounts.ts'
import { inRepo, restarts, runs, Servers } from './servers.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

// The game asked for by name or by its folder: the repo's own when `games/<it>` is there, else the folder mounted.
export const gameAt = (asked: string) => (/^[\w-]+$/.test(asked) && existsSync(path.join(root, 'games', asked)) ? asked : mount(root, asked))

export async function serve(asked: string) {
  const game = gameAt(asked)
  const servers = new Servers(root)
  servers.on(e => { if (e.type === 'log') console.log(`${e.game}: ${e.line}`) })
  servers.start(game)
  const plugins = (config.plugins ?? []).map((p: PluginOption) => (p && 'name' in p && p.name === 'home' ? home(() => servers.running()) : p))
  const vite = await createServer({ ...config, configFile: false, root, plugins })
  for (const [, folder] of mounts()) vite.watcher.add(folder)
  const restart = restarts(servers)
  vite.watcher.on('all', (event, file) => {
    if (event !== 'add' && event !== 'change' && event !== 'unlink') return
    // a file reached through a link out of the repo (a game's builds in the system's temp folder) is never the
    // server's code: its writes start nothing again (`inRepo`)
    if (!inRepo(root, file)) return
    const rel = named(root, file)
    if (rel === undefined) return
    if (runs(rel)) console.log(`${game}: ${rel} ${event === 'unlink' ? 'removed' : 'changed'}`)
    restart.changed(rel)
  })
  await vite.listen()
  const at = vite.resolvedUrls?.local[0] ?? `http://localhost:${vite.config.server.port}/`
  console.log(`${game}: ${at}games/${game}/client.html`)
  return {
    async close() {
      restart.close()
      servers.stopAll()
      await vite.close()
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const game = process.argv[2]
  if (!game) {
    console.error('name a game: yarn serve <game | folder>')
    process.exit(1)
  }
  const served = await serve(game).catch((e: Error) => {
    console.error(e.message)
    process.exit(1)
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => { void served.close().then(() => process.exit(0)) })
}
