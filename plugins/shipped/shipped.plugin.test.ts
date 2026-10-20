// The plugins a game ships in its own folder. The test writes that folder: two plugins, `lamp`
// and `bell`, each recording what it was called with, and hands `shipped` a page whose folder it is.
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { shipped } from './shipped.plugin.ts'

const dir = mkdtempSync(join(tmpdir(), 'shipped-'))
for (const name of ['lamp', 'bell']) {
  mkdirSync(join(dir, 'plugins', name), { recursive: true })
  writeFileSync(join(dir, 'plugins', name, `${name}.plugin.ts`), `
export function ${name}() {
  const said = globalThis.said
  return {
    lit: false,
    tick(plugins) { said.push('${name} tick ' + plugins.wire.n) },
    afterTick() { said.push('${name} afterTick') },
    close() { said.push('${name} close') },
  }
}
`)
}
afterAll(() => rmSync(dir, { recursive: true }))

const said: string[] = (globalThis as any).said = []

const page = (names: string[], also: Record<string, unknown> = {}) => ({
  wire: { n: 0, home: pathToFileURL(dir + '/').href, scene: { world: { shipped: { plugins: names } } } },
  ...also,
}) as any

test('its first tick loads each shipped plugin onto plugins, and ticks them all that frame, in order', async () => {
  said.length = 0
  const plugins = page(['lamp', 'bell'])
  const me = shipped()
  await me.tick(plugins)
  expect(plugins.lamp.lit).toBe(false)
  expect(plugins.bell).toBeDefined()
  plugins.wire.n = 1
  await me.tick(plugins)
  await me.afterTick(plugins)
  me.close(plugins)
  expect(said).toEqual([
    'lamp tick 0', 'bell tick 0',
    'lamp tick 1', 'bell tick 1',
    'lamp afterTick', 'bell afterTick',
    'bell close', 'lamp close',
  ])
})

test('a shipped plugin named like one the scene already names throws', async () => {
  await expect(shipped().tick(page(['lamp'], { lamp: {} }))).rejects.toThrow('shipped plugin lamp has the name of a plugin the scene already names')
})
