// The simulator's routes over HTTP, on a repo of their own: the engine, the plugins and every other
// addon as the real ones are, the simulator's own folder with its addon and route and nothing else,
// so the recordings written land in this repo alone, and a game of one scene, `lane`, whose seats
// each own a mover that goes one unit a step.
import { afterAll, beforeAll, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { start } from '#editor/server/server.ts'
import { parse, summary, report } from './simulator.addon.ts'

const repo = process.cwd()
const root = mkdtempSync(path.join(tmpdir(), 'simulator-route-'))
for (const dir of ['engine', 'plugins', 'node_modules']) symlinkSync(path.join(repo, dir), path.join(root, dir))
mkdirSync(path.join(root, 'addons/simulator'), { recursive: true })
for (const a of readdirSync(path.join(repo, 'addons'))) if (a !== 'simulator') symlinkSync(path.join(repo, 'addons', a), path.join(root, 'addons', a))
for (const f of ['simulator.addon.ts', 'simulator.route.ts']) symlinkSync(path.join(repo, 'addons/simulator', f), path.join(root, 'addons/simulator', f))
const game = path.join(root, 'games/lane')
mkdirSync(game, { recursive: true })
const SM = JSON.stringify(path.join(repo, 'plugins/scenemanager/scenemanager.sim.ts'))
const DT = 1 / 60
writeFileSync(path.join(game, 'lane.scene.json'), JSON.stringify({
  world: {}, plugins: ['scenemanager'], seats: 1, actors: [{ is: 'scenemanager' }],
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { track: { file: 'track.scene.json', suspend: false } }, dt: DT, entry: 'track', port: 0 } },
}))
writeFileSync(path.join(game, 'lane.sim.ts'), `import { scenemanager } from ${SM}\nexport const sim = { scenemanager }\n`)
writeFileSync(path.join(game, 'track.scene.json'), JSON.stringify({
  world: {}, plugins: ['scenemanager', 'player'], seats: 2, actors: [{ is: 'scenemanager' }],
  prefabs: { engine: { dt: DT, width: 10, height: 10 }, scenemanager: { out: {} }, player: { seat: 0, mover: 0 }, mover: { pos: [0, 0, 0] } },
}))
writeFileSync(path.join(game, 'track.sim.ts'), `import { scenemanager } from ${SM}
import { player } from './player.sim.ts'
import { mover } from './mover.sim.ts'
import file from './track.scene.json' with { type: 'json' }
export const sim = { scenemanager, player, mover }
export const scene = file
`)
writeFileSync(path.join(game, 'player.sim.ts'), `export const player = { before(me, _dt, w) { if (!me.data.mover) me.data.mover = w.spawn('mover', {}).id } }\n`)
writeFileSync(path.join(game, 'mover.sim.ts'), `export const mover = { tick(me) { me.data.pos[0] += 1 } }\n`)

let server: Awaited<ReturnType<typeof start>>
beforeAll(async () => { server = await start({ root, port: 0 }) })
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const get = (route: string) => fetch(`${server.url}/api/x/simulator/${route}`)
const post = (route: string, body: unknown) => fetch(`${server.url}/api/x/simulator/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const refused = async (res: Response) => {
  expect(res.status).toBe(400)
  return (await res.json()).error as string
}
const runs = path.join(root, 'addons/simulator/runs')

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('with no recordings there are none, and a name that is not one is refused', async () => {
  expect(await (await get('runs')).json()).toEqual([])
  expect(await refused(await get('read?name=../x'))).toBe('a recording is named with letters, digits, _, . and - only, not "../x"')
  expect(await refused(await post('tap', { name: 'a/b', first: true, lines: ['{}'] }))).toBe('a recording is named with letters, digits, _, . and - only, not "a/b"')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a tap\'s first batch begins a recording, each after is put at its end, and a line that is not JSON is refused', async () => {
  expect(await (await post('tap', { name: 'browser', first: true, lines: ['{"type":"run","mode":"real","ms":0,"pages":[]}', '{"type":"frame","t":1}'] })).json()).toEqual({ lines: 2 })
  expect(await (await post('tap', { name: 'browser', first: false, lines: ['{"type":"frame","t":2}'] })).json()).toEqual({ lines: 1 })
  expect(readFileSync(path.join(runs, 'browser.jsonl'), 'utf8')).toBe('{"type":"run","mode":"real","ms":0,"pages":[]}\n{"type":"frame","t":1}\n{"type":"frame","t":2}\n')
  expect(await (await get('read?name=browser')).text()).toBe(readFileSync(path.join(runs, 'browser.jsonl'), 'utf8'))
  await post('tap', { name: 'browser', first: true, lines: ['{"type":"run","mode":"real","ms":0,"pages":[]}'] })
  expect(readFileSync(path.join(runs, 'browser.jsonl'), 'utf8').split('\n').filter(Boolean)).toHaveLength(1)
  expect(await refused(await post('tap', { name: 'browser', first: false, lines: ['{ nope'] }))).toMatch(/JSON/)
  expect(await refused(await post('tap', { name: 'browser', first: false, lines: 'x' }))).toBe('a tap sends its lines as a list of strings')
  expect(await (await get('runs')).json()).toEqual(['browser'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('run plays a config on node and writes it as a recording, answering the summary the command line printed', async () => {
  const config = { game: 'games/lane/lane.scene.json', seed: 2, ms: 1500, pages: [{ display: { hz: 60 }, up: { delay: 20 }, down: { delay: 20 } }], watch: { kinds: ['mover'], fields: ['pos'], own: 'mover' } }
  const got = await (await post('run', { name: 'lane-1', config })).json()
  const records = parse(readFileSync(path.join(runs, 'lane-1.jsonl'), 'utf8'))
  expect(records[0]).toMatchObject({ type: 'run', mode: 'sim', seed: 2, ms: 1500 })
  expect(got).toEqual({ name: 'lane-1', report: report(summary(records)), files: ['addons/simulator/runs/lane-1.jsonl'] })
  // A run over a recording that is there writes over it, answering the same way.
  const text = readFileSync(path.join(runs, 'lane-1.jsonl'), 'utf8')
  const again = await (await post('run', { name: 'lane-1', config: { ...config, seed: 5 } })).json()
  const over = readFileSync(path.join(runs, 'lane-1.jsonl'), 'utf8')
  expect(over).not.toBe(text)
  expect(again).toEqual({ name: 'lane-1', report: report(summary(parse(over))), files: ['addons/simulator/runs/lane-1.jsonl'] })
  expect(await (await get('runs')).json()).toEqual(['browser', 'lane-1'])
  expect(await refused(await post('run', { name: 'lane-2', config: { ...config, game: 'games/lane/nothing.txt' } }))).toMatch(/not a \.scene\.json/)
  expect(existsSync(path.join(runs, 'lane-2.jsonl'))).toBe(false)
  expect(await refused(await post('run', { name: 'lane-2', config: {} }))).toBe('a run is handed a config whose game names a manager scene file')
}, 60_000)
