// The page's table of values the server never reads, on a game the test writes: a manager of two
// scenes, `hall` and `vault`, each seat's player actor writing into its page's store the tint its
// slot names in the scene's `world.tints`, and a `walk` that sends the seat on to the vault. The
// table is the `store` field of the page's link, which outlives every client the page makes, so
// every scene of a page reads one table and no other page is sent it.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { accept, connection, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'

// The player plugin listens on the page; node has no page.
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}

// The game, written into a folder of its own as a game folder is. Each room's `player` kind is one
// rule file beside them, which both rooms' sims import.
const DT = 1 / 60
const TINTS = [16777215, 16744576, 8438015, 8454016]
const SCENEMANAGER = new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname
const dir = mkdtempSync(join(tmpdir(), 'store-'))
afterAll(() => rmSync(dir, { recursive: true }))
const room: Scene = {
  world: { tints: TINTS },
  plugins: ['player', 'store', 'scenemanager'],
  seats: 4,
  prefabs: { engine: { dt: DT, width: 640, height: 480 }, scenemanager: { out: {} }, player: { seat: 0 }, store: { tint: 16777215 } },
  actors: [{ is: 'scenemanager' }],
}
for (const name of ['hall', 'vault']) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(room))
  writeFileSync(join(dir, `${name}.sim.ts`), `import { scenemanager } from ${JSON.stringify(SCENEMANAGER)}
import { player } from './player.sim.ts'
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, player }
export const scene = file
`)
}
writeFileSync(join(dir, 'player.sim.ts'), `export const player = {
  acts: { walk(me, w, seat) { w.call(w.find('scenemanager'), 'go', seat, 'vault') } },
}
`)
writeFileSync(join(dir, 'player.client.ts'), `export function setup() {}
export function tick(row, plugins) { if (row.data.mine) plugins.store.set('tint', plugins.wire.scene.world.tints[row.data.seat]) }
export function remove() {}
`)
const file: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: {
    engine: { dt: DT },
    scenemanager: { scenes: { hall: { file: 'hall.scene.json', suspend: true }, vault: { file: 'vault.scene.json', suspend: true } }, dt: DT, entry: 'hall', port: 0 },
  },
  actors: [{ is: 'scenemanager' }],
}
const here = pathToFileURL(dir + '/').href

const start = async () => {
  const truth = boot(structuredClone(file), { scenemanager })
  const children = await load(truth, here)
  return { truth, row: manager(truth), children }
}

// A page: its link, and the one client `view` holds on it. The scenes draw nothing, so it mounts
// nothing.
const page = (row: Row) => {
  const wire = link(loopback(accept(row)))
  return { link: wire, view: view(wire, file, here, () => {}) }
}
type Page = ReturnType<typeof page>
const run = async (truth: Truth, pages: Page[], k: number) => {
  for (let i = 0; i < k; i++) { truth.step(DT); for (const p of pages) await p.view.frame() }
}

test('no truth holds a store row and no packet carries one', async () => {
  const { truth, row, children } = await start()
  const heard: Row[][] = []
  connection(row, d => heard.push(d.packet.rows))
  for (let i = 0; i < 4; i++) truth.step(DT)
  for (const t of [truth, ...children.values()]) expect(t.rows.some(r => r.kind === 'store')).toBe(false)
  expect(heard.length).toBeGreaterThan(0)
  expect(heard.some(rows => rows.some(r => r.kind === 'store'))).toBe(false)
})

test('each page writes its own tint into its own store, and the table outlives the scene that wrote it', async () => {
  const { truth, row } = await start()
  const a = page(row)
  const b = page(row)
  await run(truth, [a, b], 4)
  const tints = TINTS
  expect(a.view.client!.plugins.store.get('tint')).toBe(tints[0])
  expect(b.view.client!.plugins.store.get('tint')).toBe(tints[1])
  expect(a.link.store.tint).toBe(tints[0])
  expect(b.link.store.tint).toBe(tints[1])
  // A value the hall's client wrote is there for the vault's, which the page makes after the
  // hall's is closed.
  a.view.client!.plugins.store.set('volume', 0.3)
  // A value may be a list or a table, as a player's rebound keys are.
  const keys = { sword: ['q', 'Pad3'], move: [['j'], ['l'], ['i'], ['k']] }
  a.view.client!.plugins.store.set('keys', keys)
  a.view.client!.plugins.player.walk(1)
  for (let i = 0; i < 900 && a.view.name === 'hall'; i++) await run(truth, [a, b], 1)
  await run(truth, [a, b], 2)
  expect(a.view.name).toBe('vault')
  expect(a.view.client!.plugins.store.get('volume')).toBe(0.3)
  expect(a.view.client!.plugins.store.get('keys')).toEqual({ sword: ['q', 'Pad3'], move: [['j'], ['l'], ['i'], ['k']] })
  expect(b.link.store).not.toHaveProperty('volume')
})
