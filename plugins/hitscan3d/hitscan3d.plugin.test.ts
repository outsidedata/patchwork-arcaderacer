// hitscan3d's browser half. On plugins the test writes: `seen()` before any tick and on rows with no
// hitscan3d row. Then a scene booted under a manager, with a hitscan3d row, and a page on it through
// the loopback with packets held three steps' time on the way down, on a clock the test moves a step
// at a time: `seen()` is the `n` of the row in the packet the page draws, three steps behind the
// server's own.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, scene as child, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback, type Time } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { hitscan3d } from './hitscan3d.plugin.ts'

test('seen() is undefined before the first tick, and on a page whose rows hold no hitscan3d row', () => {
  const rows: Row[] = [{ id: 1, kind: 'body', data: { n: 9 } }]
  const plugins: any = { wire: { rows } }
  const h = hitscan3d()
  expect(h.seen()).toBeUndefined()
  h.tick(plugins)
  expect(h.seen()).toBeUndefined()
  // Read off the rows the wire holds at the time it is asked.
  plugins.wire.rows = [...rows, { id: 2, kind: 'hitscan3d', data: { n: 12 } }]
  h.tick(plugins)
  expect(h.seen()).toBe(12)
})

const DT = 1 / 60
const LAG = 3
const field: Scene = {
  world: { hitscan3d: { kinds: {}, rewind: 10 } },
  plugins: ['scenemanager', 'hitscan3d'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, hitscan3d: {} },
  actors: [{ is: 'scenemanager' }, { is: 'hitscan3d' }],
}
const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { field: { file: 'field.scene.json', suspend: false } }, dt: DT, entry: 'field', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const dir = mkdtempSync(join(tmpdir(), 'hitscan3d-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
writeFileSync(join(dir, 'field.scene.json'), JSON.stringify(field))
writeFileSync(join(dir, 'field.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { hitscan3d } from ${JSON.stringify(new URL('./hitscan3d.sim.ts', import.meta.url).pathname)}
import file from './field.scene.json' with { type: 'json' }
export const sim = { scenemanager, hitscan3d }
export const scene = file
`)

test('seen() is the n of the hitscan3d row in the packet the page draws, as far behind the server\'s as the packets are held', async () => {
  const home = pathToFileURL(dir + '/').href
  const truth = boot(structuredClone(top), { scenemanager })
  await load(truth, home)
  // A clock the test holds: `until(t)` moves it to t, calling back whatever falls due on the way.
  let now = 0
  const due: { at: number; f: () => void }[] = []
  const time: Time = { now: () => now, after: (ms, f) => { due.push({ at: now + ms, f }) } }
  const until = (t: number) => {
    for (;;) {
      due.sort((a, b) => a.at - b.at)
      if (!due.length || due[0].at > t) break
      const { at, f } = due.shift()!
      now = at
      f()
    }
    now = t
  }
  const P = DT * 1000
  const tab = view(link(loopback(accept(manager(truth)), time, { up: { delay: 0 }, down: { delay: LAG * P }, seed: 1 })), top, home, () => {})
  const server = () => child(manager(truth), 'field').rows.find(r => r.kind === 'hitscan3d')!.data.n as number
  let read = 0
  for (let k = 1; k <= 40; k++) {
    until(k * P)
    truth.step(DT)
    until(k * P)
    await tab.frame()
    const page = tab.client
    if (!page) continue
    const seen = page.plugins.hitscan3d.seen()
    expect(seen).toBe(page.rows.find(r => r.kind === 'hitscan3d')!.data.n)
    expect(seen).toBe(server() - LAG)
    read++
  }
  expect(read).toBeGreaterThan(30)
})
