// Serves one game as it is played over the network: `yarn serve <game>` runs Vite on the repo's
// config, which serves every game's pages as `yarn dev` does, and `games/<game>/<game>.server.ts` on
// node beside it (`servers.ts`), so `client.html` dials it. Everything the game's server prints is
// printed after the game's name. A change to a file the server may run starts it again on its new
// code, one that stopped by itself too (`restarts`). The home page says which game's server runs
// (`home.ts`). Ctrl-C stops both.
import { fileURLToPath } from 'node:url'
import { createServer, type PluginOption } from 'vite'
import config from '../vite.config.ts'
import { home } from './home.ts'
import { restarts, Servers } from './servers.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

export async function serve(game: string) {
  const servers = new Servers(root)
  servers.on(e => { if (e.type === 'log') console.log(`${e.game}: ${e.line}`) })
  servers.start(game)
  const plugins = (config.plugins ?? []).map((p: PluginOption) => (p && 'name' in p && p.name === 'home' ? home(() => servers.running()) : p))
  const vite = await createServer({ ...config, configFile: false, root, plugins })
  const restart = restarts(servers)
  vite.watcher.on('all', (event, file) => {
    if (event !== 'add' && event !== 'change' && event !== 'unlink') return
    restart.changed(file.slice(root.length).split('\\').join('/'))
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
    console.error('name a game: yarn serve <game>')
    process.exit(1)
  }
  const served = await serve(game).catch((e: Error) => {
    console.error(e.message)
    process.exit(1)
  })
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => { void served.close().then(() => process.exit(0)) })
}
