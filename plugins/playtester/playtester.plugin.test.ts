// The playtester: a plugin the scene names, handed the player by the seat's actor in setup.
// Nothing presses a key; the seat plays itself through the same player the hand would use.
//
// The scene is written here: one seat, whose `player` row climbs a rung a press to its top. The
// seat's actor binds a key to `climb` and hands the playtester a think that presses it until the
// top; it, the player's rule and the scene's own file and sim are written into a folder of their
// own, the page's folder, where `load` finds the scene and its sim, which imports the rule, and the
// client finds the actor. A manager of that one scene is booted beside it, and a page is on it
// through the loopback, as a game's `index.html` runs.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as path } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, scene as child, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'

const DT = 1 / 60
// The actor binds keys on the page; node has no page.
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}

const scene: Scene = {
  world: {},
  plugins: ['scenemanager', 'player', 'playtester'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, player: { seat: 0, rung: 0, top: 30 } },
  actors: [{ is: 'scenemanager' }],
}
const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { ladder: { file: 'ladder.scene.json', suspend: false } }, dt: DT, entry: 'ladder', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}

const home = mkdtempSync(path(tmpdir(), 'playtester-'))
writeFileSync(path(home, 'player.sim.ts'), `export const player = { acts: { climb(me) { me.data.rung++ } } }\n`)
writeFileSync(path(home, 'ladder.scene.json'), JSON.stringify(scene))
writeFileSync(path(home, 'ladder.sim.ts'), `import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { player } from './player.sim.ts'
import file from './ladder.scene.json' with { type: 'json' }
export const sim = { scenemanager, player }
export const scene = file
`)
writeFileSync(path(home, 'player.client.ts'), `
export function setup(row, plugins) {
  plugins.player.bind({ press: { ArrowUp: ['climb'] } })
  plugins.playtester.play(plugins.player, rows => {
    const me = rows.find(r => r.kind === 'player')
    if (me && me.data.rung < me.data.top) return ['climb']
  })
}
export function tick() {}
export function remove(plugins) { plugins.player.unbind() }
`)
afterAll(() => rmSync(home, { recursive: true }))

test('the playtester plays the seat with no key pressed', async () => {
  const here = pathToFileURL(home + '/').href
  const truth = boot(top, { scenemanager })
  await load(truth, here)
  const ladder = child(manager(truth), 'ladder')
  const page = view(link(loopback(accept(manager(truth)))), top, here, () => {})
  const rung = () => ladder.rows.find(r => r.kind === 'player')!.data.rung
  let climbing = 0
  for (let f = 0; f < 120; f++) {
    const before = rung()
    await page.frame(); truth.step(DT)
    if (rung() > before) climbing++
  }
  page.close()
  // The think reads the rows of the last packet the page took. A press it makes in a frame is in the
  // truth's inbox at once, answered by the step after that frame, and in the packet the next frame
  // takes, so no press is in flight when the think reads: it presses until the row the seat was sent
  // is at the top, and the server stops on the top.
  expect(rung()).toBe(30)
  expect(climbing).toBe(30)
})
