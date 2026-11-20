// `yarn dev [<folder> ...] [--port <n>] [--host [<host>]] [--strictPort]`: Vite on the repo's config, every game's pages
// served file by file and as bundles (`vite.config.ts`), and each folder named mounted (`mounts.ts`), its game served
// at `/games/<the folder's name>/` as if it were in `games/`. The flags are Vite's own. Ctrl-C stops it.
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import config from '../vite.config.ts'
import { mount, mounts } from './mounts.ts'

const root = fileURLToPath(new URL('..', import.meta.url))

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { port: { type: 'string' }, host: { type: 'string' }, strictPort: { type: 'boolean' } },
  // `--host` alone is every address, as Vite's own
  args: process.argv.slice(2).flatMap((a, i, all) => (a === '--host' && (i === all.length - 1 || all[i + 1].startsWith('-')) ? ['--host', '0.0.0.0'] : [a])),
})
for (const folder of positionals) mount(root, folder)
const vite = await createServer({
  ...config,
  configFile: false,
  root,
  server: {
    ...config.server,
    ...(values.port !== undefined ? { port: Number(values.port) } : {}),
    ...(values.host !== undefined ? { host: values.host } : {}),
    ...(values.strictPort ? { strictPort: true } : {}),
  },
})
for (const [, folder] of mounts()) vite.watcher.add(folder)
await vite.listen()
vite.printUrls()
const at = vite.resolvedUrls?.local[0] ?? `http://localhost:${vite.config.server.port}/`
for (const [name] of mounts()) console.log(`${name}: ${at}games/${name}/`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void vite.close().then(() => process.exit(0)) })
