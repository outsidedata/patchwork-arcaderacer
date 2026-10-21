// The bundle of a page on a root of its own, whose engine, addons, plugins and packages are core's and
// whose one game new-game writes, with a page of the test's own beside the game's that boots the game's
// truth and loads its scenes: the bundle is built, its files written to a folder, and the page's file
// run in node from there, so every scene the game loads while it runs comes out of the bundle.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Row } from '#engine/engine.ts'
import { newGame } from './new-game.ts'
import { bundler, type Built } from './bundle.ts'

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'bundle-')))
for (const f of ['engine', 'addons', 'plugins', 'node_modules', 'package.json', 'tsconfig.json']) symlinkSync(path.join(core, f), path.join(root, f))
afterAll(() => rmSync(root, { recursive: true, force: true }))
await newGame('fresh', root)

// The test's page: the game's truth booted, its scenes loaded by the urls the scenemanager builds
// from the page's own, three steps, and the main scene's rows and a worker's url handed out.
writeFileSync(path.join(root, 'games/fresh/boot.html'), `<!doctype html>
<html><body>
<script type="module">
  import { boot } from '#engine/engine.ts'
  import { connection, load, manager } from '#addons/scenemanager/scenemanager.addon.ts'
  import { sim } from './fresh.sim.ts'
  import file from './fresh.scene.json'
  const truth = boot(file, sim)
  const room = (await load(truth, import.meta.url)).get('main')
  connection(manager(truth), () => {})
  for (let i = 0; i < 3; i++) truth.step(file.prefabs.engine.dt)
  globalThis.booted = { rows: room.rows, worker: new URL('./echo.worker.ts', import.meta.url).href }
</script>
</body></html>
`)
writeFileSync(path.join(root, 'games/fresh/echo.worker.ts'), "globalThis.addEventListener('message', (e: Event) => postMessage((e as MessageEvent).data))\n")

const SITE = 'http://bundle.test/'
const b = bundler({ root, page: 'games/fresh/boot.html', url: r => `/${r}`, out: '/b/' })
afterAll(() => b.dispose())

// The bundle's files written into a folder of their own, and the page's file run from there.
async function run(built: Built, name: string): Promise<{ rows: Row[]; worker: string; list: Record<string, any> }> {
  const dir = path.join(root, name)
  for (const [f, bytes] of built.files) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
    writeFileSync(path.join(dir, f), bytes)
  }
  const src = /<script type="module" src="\/b\/([^"]+)">/.exec(built.html)![1]
  // A page's place, and a file it fetches by its path from the root answered from the repo, as the
  // dev server answers it.
  vi.stubGlobal('location', new URL(SITE))
  vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(path.join(root, new URL(url, SITE).pathname))))
  try {
    await import(pathToFileURL(path.join(dir, src)).href)
  } finally {
    vi.unstubAllGlobals()
  }
  const g = globalThis as Record<string | symbol, any>
  return { ...g.booted, list: g[Symbol.for('core.bundle')] }
}

test('the page is one module script of the bundle, and its scenes, sims and looks come out of it', async () => {
  const built = await b.build()
  expect(built.html.match(/<script\b[^>]*>/g)).toEqual(['<script type="module" src="/b/games/fresh/boot.0.js">'])
  // The page's code is one file, and the worker one of its own: nothing else but the chunks of
  // code they share.
  const own = [...built.files.keys()].filter(f => f.endsWith('.js') && !f.startsWith('chunks/'))
  expect(own.sort()).toEqual(['games/fresh/boot.0.js', 'games/fresh/echo.worker.js'])

  const { rows, worker, list } = await run(built, 'one')
  const start = rows.find(r => r.kind === 'start')!
  expect(rows.find(r => r.kind === 'body')!.data.pos).toEqual(start.data.pos)
  // A worker's url is its file's in the bundle.
  expect(worker).toBe(`${SITE}b/games/fresh/echo.worker.js`)
  // The list names every scene's sim, every plugin a scene names and each look as a maker of copies.
  expect(Object.keys(list)).toEqual(expect.arrayContaining([
    '/games/fresh/main.sim.ts',
    '/plugins/scenemanager/scenemanager.plugin.ts',
    '/games/fresh/body.client.ts?instance',
    '/games/fresh/player.client.ts?instance',
  ]))
  const look = list['/games/fresh/body.client.ts?instance']
  const [a, c] = [await look.instance(), await look.instance()]
  expect(a).not.toBe(c)
  expect(typeof a.setup).toBe('function')
})

test('built again, the bundle holds a look written since', async () => {
  writeFileSync(path.join(root, 'games/fresh/spark.client.ts'), 'export function setup() {}\nexport function tick() {}\nexport function remove() {}\n')
  const { list } = await run(await b.build(), 'two')
  expect(Object.keys(list)).toContain('/games/fresh/spark.client.ts?instance')
  rmSync(path.join(root, 'games/fresh/spark.client.ts'))
})
