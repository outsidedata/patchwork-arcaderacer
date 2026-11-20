// A game in a folder out of the repo, mounted (`mounts.ts`): new-game writes it into a folder of its own in the
// system's temp folder, with a package.json of its own that names none of the repo's names, and it is then bundled
// from the repo's root as `games/<name>/`, its page's `#engine/*` and `three` the repo's, and its server run on node
// through `mounted.hooks.ts`.
import { afterAll, expect, test, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { newGame } from './new-game.ts'
import { bundler } from './bundle.ts'
import { isMounted, mount, mounts, named, where } from './mounts.ts'
import { inRepo } from './servers.ts'

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const away = realpathSync(mkdtempSync(path.join(tmpdir(), 'mounted-')))
afterAll(() => rmSync(away, { recursive: true, force: true }))
await newGame('farfield', away)
const folder = path.join(away, 'games', 'farfield')
// its own package.json, which names none of the repo's names: a mounted game's is never read for them
writeFileSync(path.join(away, 'package.json'), JSON.stringify({ name: 'elsewhere', type: 'module' }))
// a link to the folder, as a library's checkout is reached through one
const link = path.join(away, 'linked')
symlinkSync(folder, link)

test('a folder is mounted by its own name, and its paths named both ways', () => {
  expect(mount(core, link)).toBe('farfield')
  expect(isMounted('farfield')).toBe(true)
  expect(mounts()).toEqual([['farfield', folder]])
  expect(where(core, 'games/farfield/main.scene.json')).toBe(path.join(folder, 'main.scene.json'))
  expect(where(core, 'games/farfield')).toBe(folder)
  expect(where(core, 'engine/engine.ts')).toBe(path.join(core, 'engine/engine.ts'))
  expect(named(core, path.join(folder, 'assets', 'farfield.json'))).toBe('games/farfield/assets/farfield.json')
  expect(named(core, path.join(link, 'main.sim.ts'))).toBe('games/farfield/main.sim.ts')
  expect(named(core, path.join(core, 'plugins', 'loader'))).toBe('plugins/loader')
  expect(named(core, path.join(away, 'package.json'))).toBeUndefined()
  // the same folder mounted again is the same game
  expect(mount(core, folder)).toBe('farfield')
})

test('a mount refuses a name the repo has, a name taken by another folder, and what is not a folder', () => {
  const twin = path.join(away, 'twin', 'farfield')
  mkdirSync(twin, { recursive: true })
  expect(() => mount(core, twin)).toThrow(`farfield is mounted from ${folder} already`)
  const clash = path.join(away, 'clash', 'demo_render3d')
  mkdirSync(clash, { recursive: true })
  expect(() => mount(core, clash)).toThrow('the repo has a game demo_render3d')
  expect(() => mount(core, path.join(away, 'package.json'))).toThrow('is not a folder')
  expect(() => mount(core, path.join(away, 'nowhere'))).toThrow('is not a folder')
})

test('a mounted folder counts as the repo for a restart, and a link out of it does not', () => {
  expect(inRepo(core, path.join(folder, 'main.sim.ts'))).toBe(true)
  const builds = path.join(away, 'builds')
  mkdirSync(builds)
  symlinkSync(builds, path.join(folder, 'assets', 'builds'))
  expect(inRepo(core, path.join(folder, 'assets', 'builds', 'x.json'))).toBe(false)
})

test('its page is bundled from the repo, its engine and three the repo\'s, and booted', async () => {
  writeFileSync(path.join(folder, 'boot.html'), `<!doctype html>
<html><body>
<script type="module">
  import * as THREE from 'three'
  import { boot } from '#engine/engine.ts'
  import { connection, load, manager } from '#addons/scenemanager/scenemanager.addon.ts'
  import { sim } from './farfield.sim.ts'
  import file from './farfield.scene.json'
  const truth = boot(file, sim)
  const room = (await load(truth, import.meta.url)).get('main')
  connection(manager(truth), () => {})
  for (let i = 0; i < 3; i++) truth.step(file.prefabs.engine.dt)
  globalThis.mounted = { rows: room.rows, three: THREE.REVISION }
</script>
</body></html>
`)
  const b = bundler({ root: core, page: 'games/farfield/boot.html', url: r => `/${r}`, out: '/b/' })
  try {
    const built = await b.build()
    expect(built.html.match(/<script\b[^>]*>/g)).toEqual(['<script type="module" src="/b/games/farfield/boot.0.js">'])
    // the scene's sim is in the bundle by the url the scenemanager loads it by
    const dir = path.join(away, 'bundled')
    for (const [f, bytes] of built.files) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
      writeFileSync(path.join(dir, f), bytes)
    }
    const SITE = 'http://mounted.test/'
    vi.stubGlobal('location', new URL(SITE))
    vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(where(core, new URL(url, SITE).pathname.slice(1)))))
    try {
      await import(pathToFileURL(path.join(dir, 'games/farfield/boot.0.js')).href)
    } finally {
      vi.unstubAllGlobals()
    }
    const g = globalThis as Record<string | symbol, any>
    expect(Object.keys(g[Symbol.for('core.bundle')])).toContain('/games/farfield/main.sim.ts')
    const three = JSON.parse(readFileSync(path.join(core, 'node_modules/three/package.json'), 'utf8')).version as string
    expect(g.mounted.three).toBe(three.split('.')[1])
    expect(g.mounted.rows.map((r: { kind: string }) => r.kind).sort()).toEqual(['body', 'loader', 'player', 'scenemanager', 'start'])
  } finally {
    await b.dispose()
  }
})

test('its server runs on node from the repo\'s root, its engine the repo\'s', () => {
  const file = path.join(folder, 'probe.server.ts')
  writeFileSync(file, `import { boot } from '#engine/engine.ts'
import * as THREE from 'three'
import { sim } from './farfield.sim.ts'
import scene from './farfield.scene.json' with { type: 'json' }
const truth = boot(scene, sim)
console.log(JSON.stringify({ rows: truth.rows.length, three: THREE.REVISION, engine: import.meta.resolve('#engine/engine.ts') }))
`)
  const ran = spawnSync(process.execPath, ['--experimental-strip-types', '--import', path.join(core, 'scripts', 'mounted.hooks.ts'), file], {
    cwd: core, encoding: 'utf8', env: { ...process.env, PATCHWORK_MOUNTS: JSON.stringify({ farfield: folder }) },
  })
  expect(ran.stderr.replace(/^.*ExperimentalWarning.*\n|^.*--trace-warnings.*\n/gm, '')).toBe('')
  const out = JSON.parse(ran.stdout)
  expect(out.rows).toBeGreaterThan(0)
  expect(out.engine).toBe(pathToFileURL(path.join(core, 'engine', 'engine.ts')).href)
})
