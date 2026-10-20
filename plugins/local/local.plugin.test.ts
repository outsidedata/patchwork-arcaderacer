// Local actors: no row on truth, nothing on the wire. The test writes the page's folder with one
// local actor, `flare`, which records every call and whose tick counts its `t` down and returns
// false once it is below 0, and a scene whose `flare` prefab gives `t` and a `tint`. It drives the
// plugin in the order a frame does: every plugin's tick, then every actor's tick (where an actor
// asks for a flare), then every plugin's afterTick.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { local } from './local.plugin.ts'

const dir = mkdtempSync(join(tmpdir(), 'local-'))
writeFileSync(join(dir, 'flare.client.ts'), `
export function setup(row) { globalThis.flares.push('setup ' + row.id + ' ' + row.data.tint) }
export function tick(row) {
  row.data.t -= 1
  globalThis.flares.push('tick ' + row.id + ' ' + row.data.t)
  if (row.data.t < 0) return false
}
export function remove() { globalThis.flares.push('remove') }
`)
afterAll(() => rmSync(dir, { recursive: true }))

const flares: string[] = (globalThis as any).flares = []
const plugins = { wire: { home: pathToFileURL(dir + '/').href, scene: { prefabs: { flare: { t: 3, tint: 'red' } } } } } as any

test('a local actor asked for in an actor\'s tick is set up that frame, ticked from the next, and removed when its tick returns false', async () => {
  flares.length = 0
  const me = local()
  me.tick(plugins)
  const row = me.spawn('flare', { t: 1 })
  expect(row.id).toBeLessThan(0)
  await me.afterTick(plugins)
  expect(flares).toEqual(['setup -1 red'])
  expect(me.rows).toEqual([{ id: -1, kind: 'flare', data: { t: 1, tint: 'red' } }])
  for (let f = 0; f < 3; f++) {
    me.tick(plugins)
    await me.afterTick(plugins)
  }
  expect(flares).toEqual(['setup -1 red', 'tick -1 0', 'tick -1 -1', 'remove'])
  expect(me.rows).toEqual([])
})

// A row actor's setup on the first packet runs before any plugin's tick.
test('a local actor asked for before the plugin has ever ticked is set up by the first afterTick', async () => {
  flares.length = 0
  const me = local()
  const row = me.spawn('flare')
  await me.afterTick(plugins)
  expect(flares).toEqual(['setup -1 red'])
  expect(row.data).toEqual({ t: 3, tint: 'red' })
})

test('the prefab is copied, so one local actor\'s writes are not the next one\'s numbers', async () => {
  flares.length = 0
  const scene = { prefabs: { flare: { t: 3, tint: 'red', at: [0, 0] } } }
  const p = { wire: { ...plugins.wire, scene } } as any
  const me = local()
  const a = me.spawn('flare')
  await me.afterTick(p)
  a.data.at[0] = 9
  const b = me.spawn('flare')
  await me.afterTick(p)
  expect([b.data.at, scene.prefabs.flare.at]).toEqual([[0, 0], [0, 0]])
})

test('several asked for in one frame are set up in the order they were asked for', async () => {
  flares.length = 0
  const me = local()
  me.spawn('flare', { tint: 'a' })
  me.spawn('flare', { tint: 'b' })
  me.spawn('flare', { tint: 'c' })
  await me.afterTick(plugins)
  expect(flares).toEqual(['setup -1 a', 'setup -2 b', 'setup -3 c'])
})

test('a name with no prefab throws, as w.spawn does', async () => {
  const me = local()
  me.spawn('spark')
  await expect(me.afterTick(plugins)).rejects.toThrow('no prefab for spark')
})

test('closing removes every local actor, and one still being imported is never set up', async () => {
  flares.length = 0
  const me = local()
  me.spawn('flare', { t: 5 })
  await me.afterTick(plugins)
  me.spawn('flare', { t: 5 })
  const importing = me.afterTick(plugins)
  me.close(plugins)
  await importing
  me.spawn('flare', { t: 5 })
  expect(flares).toEqual(['setup -1 red', 'remove'])
  expect(me.rows).toEqual([])
})
