// produce_static_site on a root of its own, whose engine, addons, plugins and packages are core's and
// whose one game new-game writes: the site's root is the game's page, its code is the page's bundle
// under `bundle/`, holding every scene and look the game loads by the url it builds in the site, its
// catalogue urls are written for the host's path in its files and in its bundle alike, and nothing of
// the tests, the server, the testbed or any `.ts` file is in it. That a bundle boots the game is
// `scripts/bundle.test.ts`.
import { afterAll, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
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

const at = (out: string, f: string) => path.join(root, out, f)

test('the page at the site\'s root runs the bundle, which holds every scene and look by the url the game builds for it in the site', async () => {
  const { files } = await produceStaticSite({ root, game: 'fresh', out: 'site', base: '/' })
  const page = readFileSync(at('site', 'index.html'), 'utf8')
  expect(page.match(/<script\b[^>]*type="module"[^>]*>/g)).toEqual(['<script type="module" src="/bundle/games/fresh/index.0.js">'])
  expect(files).toContain('bundle/games/fresh/index.0.js')
  // The loading screen is the first thing in the page's body, ahead of the game's module.
  const open = page.match(/<body\b[^>]*>/)!
  expect(page.slice(open.index! + open[0].length).trimStart().startsWith(readFileSync(path.join(core, 'scripts/loading.html'), 'utf8').trimStart())).toBe(true)
  // The page's code is the one file and the chunks it shares with a worker; no module of the repo is a
  // file of its own, and no `.ts` file is in the site. The one `.js` outside the bundle is no module:
  // the loader's KTX2 transcoder, which three's KTX2 reader fetches as text, beside its `.wasm`, at the
  // url the loader names it by in the site.
  expect(files.filter(f => f.endsWith('.js') && !f.startsWith('bundle/'))).toEqual(['core/plugins/loader/basis/basis_transcoder.js'])
  expect(files).toContain('core/plugins/loader/basis/basis_transcoder.wasm')
  expect(files.filter(f => f.endsWith('.ts'))).toEqual([])
  const code = readFileSync(at('site', 'bundle/games/fresh/index.0.js'), 'utf8')
  for (const url of ['/main.sim.ts', '/body.client.ts?instance', '/player.client.ts?instance', '/core/plugins/scenemanager/scenemanager.plugin.ts']) expect(code, url).toContain(JSON.stringify(url))
})

test('under a path of the host, a catalogue url names the file at that path in the files and the bundle, and the tests, the server, the testbed and the art\'s scripts are left out', async () => {
  const catalogue = JSON.parse(readFileSync(path.join(root, 'games/fresh/main.scene.json'), 'utf8')).world.loader.assets as Record<string, { url: string }>
  const url = Object.values(catalogue)[0].url
  expect(url.startsWith('/games/fresh/')).toBe(true)
  const { files } = await produceStaticSite({ root, game: 'fresh', out: 'sub', base: '/fresh/' })
  const hosted = `/fresh/${url.slice('/games/fresh/'.length)}`
  const written = JSON.parse(readFileSync(at('sub', 'main.scene.json'), 'utf8')).world.loader.assets as Record<string, { url: string }>
  expect(Object.values(written)[0].url).toBe(hosted)
  const bundled = files.filter(f => f.startsWith('bundle/') && f.endsWith('.js')).map(f => readFileSync(at('sub', f), 'utf8')).join('\n')
  expect(bundled).toContain(JSON.stringify(hosted))
  expect(bundled).not.toContain(JSON.stringify(url))
  expect(readFileSync(at('sub', 'index.html'), 'utf8')).toContain('src="/fresh/bundle/games/fresh/index.0.js"')
  for (const f of ['fresh.sim.test.ts', 'fresh.sim.test.js', 'dev.html', 'client.html', 'fresh.server.ts', 'fresh.server.js', 'assets/make.ts', 'assets/make.js', 'lab/raw.ts', 'lab/raw.js']) expect(existsSync(at('sub', f)), f).toBe(false)
  expect(existsSync(at('sub', 'core/engine/engine.ts'))).toBe(false)
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

test('a game that is not there, a base that is not a path, an out that is the repo and a game holding a bundle folder are refused', async () => {
  await expect(produceStaticSite({ root, game: 'gone', out: 'x', base: '/' })).rejects.toThrow('there is no games/gone/index.html')
  await expect(produceStaticSite({ root, game: 'fresh', out: 'x', base: 'fresh' })).rejects.toThrow('--base fresh must start and end with /')
  await expect(produceStaticSite({ root, game: 'fresh', out: 'engine', base: '/' })).rejects.toThrow('--out engine is the repo or a folder of it the site is made from')
  mkdirSync(path.join(root, 'games/fresh/bundle'))
  await expect(produceStaticSite({ root, game: 'fresh', out: 'x', base: '/' })).rejects.toThrow('games/fresh/bundle is there, and the site keeps its bundle in bundle/')
  rmSync(path.join(root, 'games/fresh/bundle'), { recursive: true })
})

test('a game whose entry scene shows a loading screen has it as the page\'s cover in place of the site\'s, its files at their paths on the host', async () => {
  await newGame('shown', root)
  const file = path.join(root, 'games/shown/main.scene.json')
  const scene = JSON.parse(readFileSync(file, 'utf8'))
  scene.plugins.push('ui')
  scene.world.loader.assets.splash = { type: 'texture', url: '/games/shown/assets/splash.png', for: 'ui', preload: true }
  scene.world.ui = { mods: { behaviors: ['loader'] }, panels: { loading: { anchor: 'center', size: [320, 180], layer: 9, modal: true, loading: { pictures: [{ picture: 'splash', at: [0, 0], size: [320, 180] }], fade: 0.5 } } } }
  writeFileSync(file, JSON.stringify(scene))
  writeFileSync(path.join(root, 'games/shown/assets/splash.png'), new Uint8Array([1]))
  const { files } = await produceStaticSite({ root, game: 'shown', out: 'shown-site', base: '/shown/' })
  const page = readFileSync(at('shown-site', 'index.html'), 'utf8')
  const open = page.match(/<body\b[^>]*>/)!
  expect(page.slice(open.index! + open[0].length).trimStart().startsWith('<div id="loader-cover"></div>')).toBe(true)
  expect(page).not.toContain('patchwork-loading')
  const numbers = JSON.parse(/const cover = ([\s\S]*?);\n/.exec(page)![1])
  expect([numbers.pictures, numbers.urls]).toEqual([[{ url: '/shown/assets/splash.png', at: [0, 0], size: [320, 180] }], ['/shown/assets/shown.json', '/shown/assets/splash.png']])
  expect(files).toContain('assets/splash.png')
  rmSync(path.join(root, 'games/shown'), { recursive: true })
})
