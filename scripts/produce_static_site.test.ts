// produce_static_site on a root of its own, whose engine, addons, plugins and packages are core's and
// whose one game new-game writes: the site's root is the game's page, every file it holds is a module
// a browser runs from its place in the site, the game boots from the site's files alone, its
// catalogue urls are written for the host's path, and nothing of the tests, the server or the
// testbed is in it.
import { afterAll, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Scene, Sim } from '#engine/engine.ts'
import { newGame } from './new-game.ts'
import { produceStaticSite } from './produce_static_site.ts'

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'static-site-')))
for (const f of ['engine', 'addons', 'plugins', 'node_modules', 'package.json', 'tsconfig.json']) symlinkSync(path.join(core, f), path.join(root, f))
afterAll(() => rmSync(root, { recursive: true, force: true }))
await newGame('fresh', root)
writeFileSync(path.join(root, 'games/fresh/fresh.sim.test.ts'), 'export {}\n')
writeFileSync(path.join(root, 'games/fresh/dev.html'), '<!doctype html>\n')
writeFileSync(path.join(root, 'games/fresh/assets/make.ts'), "import { readFileSync } from 'node:fs'\nexport const made = readFileSync\n")
mkdirSync(path.join(root, 'games/fresh/lab'))
writeFileSync(path.join(root, 'games/fresh/lab/raw.ts'), "import { AudioContext } from 'node-web-audio-api'\nexport const made = AudioContext\n")
writeFileSync(path.join(root, 'games/fresh/lab/run.ts'), "import { made } from './raw'\nexport const ran = made\n")

const at = (out: string, f: string) => path.join(root, out, f)

test('the game boots from the site alone, its page at the site\'s root, its scenes found by the urls it builds while it runs', async () => {
  const { files } = await produceStaticSite({ root, game: 'fresh', out: 'site', base: '/' })
  expect(files).toContain('index.html')
  expect(files).toContain('fresh.sim.js')
  expect(files).toContain('core/engine/engine.js')
  expect(readFileSync(at('site', 'index.html'), 'utf8')).toContain('from "./core/engine/engine.js"')
  expect(readFileSync(at('site', 'index.html'), 'utf8')).toContain('from "./fresh.scene.json.js"')

  // Every module names its imports by a path from its place, none by `#…`, and no url it builds
  // names a `.ts` file.
  for (const f of files.filter(f => f.endsWith('.js') && !f.startsWith('core/vendor/'))) {
    const code = readFileSync(at('site', f), 'utf8')
    expect(code, f).not.toMatch(/from ["']#/)
    expect(code, f).not.toMatch(/\.ts[`'"?#]/)
  }

  const { sim } = await import(pathToFileURL(at('site', 'fresh.sim.js')).href) as { sim: Sim }
  const { default: file } = await import(pathToFileURL(at('site', 'fresh.scene.json.js')).href) as { default: Scene }
  const { boot } = await import(pathToFileURL(at('site', 'core/engine/engine.js')).href) as typeof import('#engine/engine.ts')
  const { connection, load, manager } = await import(pathToFileURL(at('site', 'core/addons/scenemanager/scenemanager.addon.js')).href) as typeof import('#addons/scenemanager/scenemanager.addon.ts')
  // The loader reads a catalogue's url from the working directory, which is the host's root here.
  vi.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'site'))
  const truth = boot(file, sim)
  const room = (await load(truth, pathToFileURL(at('site', 'index.html')).href)).get('main')!
  connection(manager(truth), () => {})
  for (let i = 0; i < 3; i++) truth.step(file.prefabs.engine.dt)
  vi.restoreAllMocks()
  const start = room.rows.find(r => r.kind === 'start')!
  expect(room.rows.find(r => r.kind === 'body')!.data.pos).toEqual(start.data.pos)
})

test('three and its addons are one three in the site\'s vendor', async () => {
  const three = await import(pathToFileURL(at('site', 'core/vendor/three.js')).href) as typeof import('three')
  const { FullScreenQuad } = await import(pathToFileURL(at('site', 'core/vendor/three/addons/postprocessing/Pass.js.js')).href) as { FullScreenQuad: new () => { _mesh: unknown } }
  expect(new FullScreenQuad()._mesh).toBeInstanceOf(three.Mesh)
})

test('under a path of the host, a catalogue url names the file at that path, and the tests, the server, the testbed, the art\'s scripts and a node tool and what imports it are left out', async () => {
  const catalogue = JSON.parse(readFileSync(path.join(root, 'games/fresh/main.scene.json'), 'utf8')).world.loader.assets as Record<string, { url: string }>
  const url = Object.values(catalogue)[0].url
  expect(url.startsWith('/games/fresh/')).toBe(true)
  await produceStaticSite({ root, game: 'fresh', out: 'sub', base: '/fresh/' })
  const written = JSON.parse(readFileSync(at('sub', 'main.scene.json'), 'utf8')).world.loader.assets as Record<string, { url: string }>
  expect(Object.values(written)[0].url).toBe(`/fresh/${url.slice('/games/fresh/'.length)}`)
  for (const f of ['fresh.sim.test.js', 'dev.html', 'client.html', 'fresh.server.js', 'assets/make.js', 'assets/make.ts', 'lab/raw.js', 'lab/run.js']) expect(existsSync(at('sub', f)), f).toBe(false)
  expect(existsSync(at('sub', 'core/engine/engine.test.js'))).toBe(false)
})

test('in a repo whose games/ holds the game alone, the game\'s README becomes the repo\'s; with another game there, the repo keeps its own', async () => {
  writeFileSync(path.join(root, 'games/fresh/README.md'), '# fresh\n')
  await produceStaticSite({ root, game: 'fresh', out: 'site', base: '/' })
  expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('# fresh\n')
  mkdirSync(path.join(root, 'games/other'))
  writeFileSync(path.join(root, 'games/fresh/README.md'), '# fresh, again\n')
  await produceStaticSite({ root, game: 'fresh', out: 'site', base: '/' })
  expect(readFileSync(path.join(root, 'README.md'), 'utf8')).toBe('# fresh\n')
  rmSync(path.join(root, 'games/other'), { recursive: true })
})

test('a game that is not there, a base that is not a path and an out that is the repo are refused', async () => {
  await expect(produceStaticSite({ root, game: 'gone', out: 'x', base: '/' })).rejects.toThrow('there is no games/gone/index.html')
  await expect(produceStaticSite({ root, game: 'fresh', out: 'x', base: 'fresh' })).rejects.toThrow('--base fresh must start and end with /')
  await expect(produceStaticSite({ root, game: 'fresh', out: 'engine', base: '/' })).rejects.toThrow('--out engine is the repo or a folder of it the site is made from')
})
