// Many truths in one process: a manager scene and its children.
// A child's prefabs are the manager scene's with the child's own over them. Those tests write both
// scenes themselves: a manager, and one child, `den`, as a scene file and a sim file in a folder of
// its own, which is what `load` imports. The den also shows `prepare`: `load` and a page's `view`
// wait for it before the first step and before the client. A third, the forge, ships plugins of
// its own and shows where a mod of one of them is found.
// The addon is held to carrying no envelopes itself.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, seeded, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { accept, actorsOf, ahead, delta, type Diff, link, listed, load, manager, mod, modsOf, patch, provided, run, scene, view } from './scenemanager.addon.ts'
import { ground } from '#plugins/terrain3d/terrain3d.box3d.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'

const DT = 1 / 60

const step = (truth: Truth, k: number) => { for (let i = 0; i < k; i++) truth.step(DT) }

const top: Scene = {
  prefabs: {
    engine: { dt: DT },
    scenemanager: { scenes: { den: { file: 'den.scene.json', suspend: false } }, dt: DT, entry: 'den', port: 0 },
    imp: { hp: 60, run: 8.75 },
    torch: { lit: 'manager' },
  },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

// The den also names a data file for its loader, which its `reader` reads every step, and a
// `lantern` whose `prepare` records each row it is handed, with the names of the catalogue in the
// `world` it is handed beside it, and then waits for the test's `gate`. The data file is the test's
// own, in its folder; the loader in node reads a url from the working directory.
const dir = mkdtempSync(join(tmpdir(), 'scenemanager-'))
const tableFile = join(dir, 'den.table.json')
writeFileSync(tableFile, JSON.stringify({ port: 4242 }))
const table = relative(process.cwd(), tableFile)
const den = {
  world: { loader: { assets: { table: { type: 'json', url: table, preload: true } } } },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 },
    scenemanager: { out: {} },
    torch: { lit: 'den' },
    spawner: { made: 0 },
    loader: {},
    reader: { port: 0 },
    lantern: {},
  },
  actors: [{ is: 'scenemanager' }, { is: 'imp', run: 10 }, { is: 'torch' }, { is: 'spawner' }, { is: 'loader' }, { is: 'reader' }, { is: 'lantern' }],
  plugins: ['scenemanager'],
}
const lit = globalThis as unknown as { prepared: [number, string[]][]; gate: Promise<void> }
lit.prepared = []
lit.gate = Promise.resolve()

writeFileSync(join(dir, 'den.scene.json'), JSON.stringify(den))
writeFileSync(join(dir, 'den.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { json, loader } from ${JSON.stringify(new URL('../../plugins/loader/loader.sim.ts', import.meta.url).pathname)}
import file from './den.scene.json' with { type: 'json' }
export const sim = {
  scenemanager,
  imp: {},
  torch: {},
  spawner: { tick(me, _dt, w) { if (!me.data.made) me.data.made = w.spawn('imp').id } },
  loader,
  reader: { tick(me, _dt, w) { me.data.port = json(w, 'table').port } },
  lantern: { async prepare(me, world) { globalThis.prepared.push([me.id, Object.keys(world.loader.assets)]); await globalThis.gate } },
}
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const denOf = async () => {
  const children = await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)
  return children.get('den')!
}

// The first test in this file to read the den's data file, so nothing but `load` has fetched it.
test('load prepares every row before it returns, so a rule reads a data file on the first step', async () => {
  const child = await denOf()
  child.step(DT)
  const port = JSON.parse(readFileSync(tableFile, 'utf8')).port
  expect(child.rows.find(r => r.kind === 'reader')!.data.port).toBe(port)
})

test('a page makes the client of a visit only once every row of its first packet is prepared, each handed the scene\'s world', async () => {
  const truth = boot(structuredClone(top), { scenemanager })
  await load(truth, pathToFileURL(dir + '/').href)
  const lantern = scene(manager(truth), 'den').rows.find(r => r.kind === 'lantern')!.id
  let open = () => {}
  lit.gate = new Promise(r => { open = r })
  lit.prepared = []
  const p = view(link(loopback(accept(manager(truth)))), top, pathToFileURL(dir + '/').href, () => {})
  truth.step(DT)
  const framing = p.frame()
  await vi.waitFor(() => expect(lit.prepared).toEqual([[lantern, ['table']]]))
  expect(p.client).toBeUndefined()
  open()
  await framing
  expect(p.name).toBe('den')
  expect(p.client).toBeDefined()
  lit.gate = Promise.resolve()
})

// Mods of a game's own plugins. A game folder of the test's own ships two plugins, `bellows` and
// `anvil` (`world.shipped.plugins`), and the forge scene names a mod each way a mod can sit: bellows
// for anvil, the game's for the game's, beside bellows; terrain3d for anvil, top-level for the
// game's, beside anvil; bellows for hitscan3d, the game's for top-level, beside bellows; and
// terrain3d for box3d, both top-level, `plugins/terrain3d/terrain3d.box3d.ts` as ever. Each of the
// game's mods hands back its own name, so the test sees which file each came from.
const forgeTop: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { forge: { file: 'forge.scene.json', suspend: false } }, dt: DT, entry: 'forge', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const forge = (world: Record<string, any>) => ({
  world: { shipped: { plugins: ['bellows', 'anvil'] }, ...world },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
})
const FORGE = {
  anvil: { mods: { heat: 'bellows', tone: 'terrain3d' } },
  hitscan3d: { mods: { solids: 'bellows' } },
  box3d: { mods: { ground: 'terrain3d' } },
}
const forges: string[] = []
afterAll(() => { for (const d of forges) rmSync(d, { recursive: true }) })
const forgeDir = (world: Record<string, any>) => {
  const d = mkdtempSync(join(tmpdir(), 'scenemanager-forge-'))
  forges.push(d)
  writeFileSync(join(d, 'forge.scene.json'), JSON.stringify(forge(world)))
  writeFileSync(join(d, 'forge.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './forge.scene.json' with { type: 'json' }
export const sim = { scenemanager }
export const scene = file
`)
  for (const [folder, file, body] of [
    ['bellows', 'bellows.anvil.ts', `export const heat = () => 'bellows/bellows.anvil'`],
    ['anvil', 'terrain3d.anvil.ts', `export const tone = () => 'anvil/terrain3d.anvil'`],
    ['bellows', 'bellows.hitscan3d.ts', `export const solids = () => 'bellows/bellows.hitscan3d'`],
  ]) {
    mkdirSync(join(d, 'plugins', folder), { recursive: true })
    writeFileSync(join(d, 'plugins', folder, file), body)
  }
  return pathToFileURL(d + '/').href
}
const home = forgeDir(FORGE)
const named = (world: Record<string, any>) => [
  mod<() => string>(world, 'anvil', 'heat')!(),
  mod<() => string>(world, 'anvil', 'tone')!(),
  mod<() => string>(world, 'hitscan3d', 'solids')!(),
]

test('a mod of a game\'s own plugin is found in the game\'s folder, beside the game\'s one of the pair, and a top-level pair where it always was', async () => {
  const child = (await load(boot(structuredClone(forgeTop), { scenemanager }), home)).get('forge')!
  expect(child.world.scenemanager.home).toBe(home)
  expect(named(child.world)).toEqual(['bellows/bellows.anvil', 'anvil/terrain3d.anvil', 'bellows/bellows.hitscan3d'])
  expect(mod(child.world, 'box3d', 'ground')).toBe(ground)
  expect(mod(child.world, 'anvil', 'none')).toBeUndefined()
})

test('the page finds the same mods in the scene its client is handed, and so does a copy of that scene\'s world', async () => {
  const truth = boot(structuredClone(forgeTop), { scenemanager })
  await load(truth, home)
  const p = view(link(loopback(accept(manager(truth)))), forgeTop, home, () => {})
  truth.step(DT)
  await p.frame()
  const world = p.client!.plugins.wire.scene.world!
  expect(named(world)).toEqual(['bellows/bellows.anvil', 'anvil/terrain3d.anvil', 'bellows/bellows.hitscan3d'])
  expect(named(structuredClone(world))).toEqual(named(world))
  p.close()
})

test('listed is the order the page ticks plugins in, the game\'s own in shipped\'s place; provided holds a mod\'s plugin to being listed, and ahead to coming first', () => {
  const at = (plugins: string[], mods: Record<string, string>): Scene =>
    ({ plugins, world: { shipped: { plugins: ['bellows', 'anvil'] }, anvil: { mods } }, prefabs: {}, actors: [] })
  expect(listed(at(['loader', 'shipped', 'render3d'], {}))).toEqual(['loader', 'bellows', 'anvil', 'render3d'])
  expect(listed({ plugins: ['loader', 'render3d'], prefabs: {}, actors: [] })).toEqual(['loader', 'render3d'])
  expect(() => ahead(at(['terrain3d', 'shipped'], { heat: 'bellows', tone: 'terrain3d' }), 'anvil', 'heat')).not.toThrow()
  expect(() => ahead(at(['terrain3d', 'shipped'], { heat: 'bellows', tone: 'terrain3d' }), 'anvil', 'tone')).not.toThrow()
  expect(() => ahead(at(['shipped'], {}), 'anvil', 'tone')).not.toThrow()
  expect(() => ahead(at(['shipped', 'terrain3d'], { tone: 'terrain3d' }), 'anvil', 'tone')).toThrow('anvil is listed before terrain3d, whose tone it reads that frame')
  expect(() => ahead(at(['shipped'], { tone: 'terrain3d' }), 'anvil', 'tone')).toThrow('anvil\'s tone is terrain3d\'s, which this scene does not list')
  expect(() => provided(at(['shipped', 'terrain3d'], { tone: 'terrain3d' }), 'anvil', 'tone')).not.toThrow()
  expect(() => provided(at(['shipped'], {}), 'anvil', 'tone')).not.toThrow()
  expect(() => provided(at(['shipped'], { tone: 'terrain3d' }), 'anvil', 'tone')).toThrow('anvil\'s tone is terrain3d\'s, which this scene does not list')
})

test('an entry naming several plugins loads every one, modsOf hands back each one\'s function in its order, mod refuses it, and provided and ahead hold every one', async () => {
  const many = forgeDir({ ...FORGE, hitscan3d: { mods: { solids: ['bellows', 'anvil'] } } })
  mkdirSync(join(new URL(many).pathname, 'plugins', 'anvil'), { recursive: true })
  writeFileSync(join(new URL(many).pathname, 'plugins', 'anvil', 'anvil.hitscan3d.ts'), `export const solids = () => 'anvil/anvil.hitscan3d'`)
  const child = (await load(boot(structuredClone(forgeTop), { scenemanager }), many)).get('forge')!
  expect(modsOf<() => string>(child.world, 'hitscan3d', 'solids').map(f => f())).toEqual(['bellows/bellows.hitscan3d', 'anvil/anvil.hitscan3d'])
  // A single name is a list of one, and an entry the scene does not give is none.
  expect(modsOf<() => string>(child.world, 'anvil', 'heat').map(f => f())).toEqual(['bellows/bellows.anvil'])
  expect(modsOf(child.world, 'anvil', 'none')).toEqual([])
  expect(() => mod(child.world, 'hitscan3d', 'solids')).toThrow('hitscan3d\'s solids names bellows, anvil, and hitscan3d takes it from one plugin: name one')
  const at = (plugins: string[]): Scene => ({ plugins, world: { shipped: { plugins: ['bellows', 'anvil'] }, hitscan3d: { mods: { solids: ['bellows', 'terrain3d'] } } }, prefabs: {}, actors: [] })
  expect(() => provided(at(['shipped', 'hitscan3d']), 'hitscan3d', 'solids')).toThrow('hitscan3d\'s solids is terrain3d\'s, which this scene does not list')
  expect(() => ahead(at(['shipped', 'hitscan3d', 'terrain3d']), 'hitscan3d', 'solids')).toThrow('hitscan3d is listed before terrain3d, whose solids it reads that frame')
  expect(() => ahead(at(['shipped', 'terrain3d', 'hitscan3d']), 'hitscan3d', 'solids')).not.toThrow()
})

test('a mod of the game\'s that does not export its function throws naming its file, and a world with no home cannot find one', async () => {
  const bad = forgeDir({ anvil: { mods: { cool: 'bellows' } } })
  await expect(load(boot(structuredClone(forgeTop), { scenemanager }), bad)).rejects.toThrow(`${bad}plugins/bellows/bellows.anvil.ts does not export cool`)
  expect(() => mod({ shipped: { plugins: ['bellows'] }, anvil: { mods: { heat: 'bellows' } } }, 'anvil', 'heat'))
    .toThrow('the bellows mod of anvil is the game\'s, and this scene has no world.scenemanager.home to find it in')
})

test('an actor of a prefab only the manager scene gives is a row of that prefab with the actor entry over it', async () => {
  const child = await denOf()
  expect(child.rows.find(r => r.kind === 'imp')!.data).toEqual({ hp: 60, run: 10 })
})

test('w.spawn in a child makes a row of a prefab only the manager scene gives', async () => {
  const child = await denOf()
  child.step(DT)
  const made = child.rows.find(r => r.kind === 'spawner')!.data.made
  expect(child.rows.find(r => r.id === made)!.data).toEqual({ hp: 60, run: 8.75 })
})

test('a prefab the child scene gives is the child one, whole, and its scenemanager row is given the names of the manager\'s table', async () => {
  const child = await denOf()
  expect(child.rows.find(r => r.kind === 'torch')!.data).toEqual({ lit: 'den' })
  expect(child.rows.find(r => r.kind === 'scenemanager')!.data).toEqual({ out: {}, names: Object.keys(top.prefabs.scenemanager.scenes) })
})

test('a name neither scene gives a prefab still throws', async () => {
  const child = await denOf()
  expect(() => child.spawn('ghost')).toThrow('no prefab for ghost')
})

// A vault: a scene whose actors are its file's and then those of the file its `actorsFile` names,
// as a level a generator made is loaded, and one naming a file that is not an actors list.
const vaultDir = mkdtempSync(join(tmpdir(), 'scenemanager-vault-'))
afterAll(() => rmSync(vaultDir, { recursive: true }))
const vaultOf = (actorsFile: string, list: unknown) => {
  const name = `vault${Math.random().toString(36).slice(2)}`
  const scene = { prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, coin: { worth: 1 } }, actors: [{ is: 'scenemanager' }, { is: 'coin', worth: 5 }], plugins: ['scenemanager'], actorsFile }
  writeFileSync(join(vaultDir, `${name}.scene.json`), JSON.stringify(scene))
  writeFileSync(join(vaultDir, `${name}.sim.ts`), `
import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, coin: {} }
export const scene = file
`)
  writeFileSync(join(vaultDir, actorsFile), JSON.stringify(list))
  const manager: Scene = { ...structuredClone(top), prefabs: { ...structuredClone(top.prefabs), scenemanager: { scenes: { vault: { file: `${name}.scene.json`, suspend: false } }, dt: DT, entry: 'vault', port: 0 } } }
  return () => load(boot(manager, { scenemanager }), pathToFileURL(vaultDir + '/').href)
}

test('a scene\'s actors are its file\'s, then those of the file its actorsFile names, each over its prefab; every boot reads the one list', async () => {
  const boots = vaultOf('vault.actors.json', [{ is: 'coin', pos: [1, 2] }, { is: 'coin', worth: 9, pos: [3, 4] }])
  const coins = (await boots()).get('vault')!.rows.filter(r => r.kind === 'coin').map(r => r.data)
  expect(coins).toEqual([{ worth: 5 }, { worth: 1, pos: [1, 2] }, { worth: 9, pos: [3, 4] }])
  const list = await actorsOf(new URL(pathToFileURL(vaultDir + '/').href), 'vault.actors.json')
  list.push({ is: 'coin', worth: 2, pos: [5, 6] })
  expect((await boots()).get('vault')!.rows.filter(r => r.kind === 'coin')).toHaveLength(4)
})

test('a row holds its own copy of its entry: moving it in place moves neither the entry nor the row of a boot after', async () => {
  const boots = vaultOf('vault-c.actors.json', [{ is: 'coin', pos: [1, 2] }])
  const [coin] = (await boots()).get('vault')!.rows.filter(r => r.kind === 'coin' && r.data.pos)
  coin.data.pos[0] = 99
  const list = await actorsOf(new URL(pathToFileURL(vaultDir + '/').href), 'vault-c.actors.json')
  expect(list[0]).toEqual({ is: 'coin', pos: [1, 2] })
  expect((await boots()).get('vault')!.rows.find(r => r.kind === 'coin' && r.data.pos)!.data.pos).toEqual([1, 2])
})

test('a child\'s world.scenemanager.actors is its actors entries, its file\'s and then its actorsFile\'s, which no row moving in place moves', async () => {
  const vault = (await vaultOf('vault-d.actors.json', [{ is: 'coin', pos: [1, 2] }])()).get('vault')!
  expect(vault.world.scenemanager.actors).toEqual([{ is: 'scenemanager' }, { is: 'coin', worth: 5 }, { is: 'coin', pos: [1, 2] }])
  vault.rows.find(r => r.kind === 'coin' && r.data.pos)!.data.pos[0] = 99
  expect(vault.world.scenemanager.actors[2]).toEqual({ is: 'coin', pos: [1, 2] })
})

test('an actorsFile that is not a .actors.json, or not a list, is refused', async () => {
  await expect(vaultOf('vault-a.json', [])()).rejects.toThrow('the scene names vault-a.json as its actorsFile, not a .actors.json')
  await expect(vaultOf('vault-b.actors.json', { is: 'coin' })()).rejects.toThrow('vault-b.actors.json is not a list of actors entries')
})

// A level that extends a partial, as levels that share a land write their plugins' numbers, prefabs
// and the actors they all have once: the partial's world and prefabs under the level's, key by key,
// and the partial's actors before the level's.
test('a scene that extends a partial takes its world and prefabs under its own, key by key, and its actors first', async () => {
  const d = mkdtempSync(join(tmpdir(), 'scenemanager-partial-'))
  try {
    const partial = {
      world: { seed: 7, physics: { gravity: [0, -9.8, 0], substeps: 4 }, level: 'none' },
      prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, crop: { kind: 'wheat', grow: 3 } },
      actors: [{ is: 'scenemanager' }, { is: 'crop', at: [0, 0] }],
    }
    const level = {
      extends: 'land.partial_scene.json',
      plugins: ['scenemanager'],
      world: { physics: { substeps: 8 }, level: 'sowing' },
      prefabs: { crop: { grow: 5 } },
      actors: [{ is: 'crop', at: [4, 2], kind: 'barley' }],
    }
    writeFileSync(join(d, 'land.partial_scene.json'), JSON.stringify(partial))
    writeFileSync(join(d, 'sowing.scene.json'), JSON.stringify(level))
    writeFileSync(join(d, 'sowing.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './sowing.scene.json' with { type: 'json' }
export const sim = { scenemanager, crop: {} }
export const scene = file
`)
    const manager: Scene = { ...structuredClone(top), prefabs: { ...structuredClone(top.prefabs), scenemanager: { scenes: { sowing: { file: 'sowing.scene.json', suspend: false } }, dt: DT, entry: 'sowing', port: 0 } } }
    const sowing = (await load(boot(manager, { scenemanager }), pathToFileURL(d + '/').href)).get('sowing')!
    expect(sowing.world).toMatchObject({ seed: 7, physics: { gravity: [0, -9.8, 0], substeps: 8 }, level: 'sowing' })
    expect(sowing.rows.filter(r => r.kind === 'crop').map(r => r.data)).toEqual([
      { kind: 'wheat', grow: 5, at: [0, 0] },
      { kind: 'barley', grow: 5, at: [4, 2] },
    ])
  } finally {
    rmSync(d, { recursive: true })
  }
})

// The addon carries no envelopes itself: the transport is the wire `link` is handed. So it calls
// `connection` in one place, `accept`, which hands the seat's diffs to a transport, and takes no value from
// the loopback or socket addons, only their types; a page and a manager joined here would be a
// second wire beside theirs that no test of theirs covers. Comments are read past.
test('the addon reaches a page only through the wire link is handed', () => {
  const code = readFileSync(new URL('./scenemanager.addon.ts', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const calls = [...code.matchAll(/(?<!function )\bconnection\(/g)].length
  const values = [...code.matchAll(/^import (?!type )[^\n]*from '\.\.\/(loopback|socket)\//gm)].map(m => m[0])
  const body = code.slice(code.indexOf('export const accept = '), code.indexOf('\n}\n', code.indexOf('export const accept = ')))
  expect({ calls, values, accept: /\bconnection\(row, /.test(body) }).toEqual({ calls: 1, values: [], accept: true })
})

// ---------------------------------------------------------------- the diffs on the wire

// Rows as JSON carries them: an object's `undefined` fields gone, and an array's made null.
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v))

// Random rows: nested objects, arrays of objects, nulls, `undefined` fields, a kind that changes
// under one id, rows added and rows dropped.
const shuffled = (die: () => number) => {
  const value = (depth: number): unknown => {
    const r = die()
    if (r < 0.15) return null
    if (r < 0.25) return undefined
    if (r < 0.45) return Math.floor(die() * 5)
    if (r < 0.55) return ['a', 'b', 'c'][Math.floor(die() * 3)]
    if (r < 0.7) return Array.from({ length: Math.floor(die() * 3) }, () => (depth < 2 ? value(depth + 1) : 1))
    if (depth > 2) return true
    return Object.fromEntries(Array.from({ length: Math.floor(die() * 4) }, (_, i) => [`f${Math.floor(die() * 5)}${i}`, value(depth + 1)]))
  }
  const data = () => Object.fromEntries(Array.from({ length: 1 + Math.floor(die() * 5) }, (_, i) => [`k${i}`, value(0)]))
  const kinds = ['imp', 'coin', 'door']
  let next = 1
  const fresh = (): Row => ({ id: next++, kind: kinds[Math.floor(die() * 3)], data: data() })
  const rows: Row[] = Array.from({ length: 6 }, fresh)
  return () => {
    const now: Row[] = []
    for (const r of rows) {
      const roll = die()
      if (roll < 0.1) continue
      if (roll < 0.15) now.push({ id: r.id, kind: kinds[(kinds.indexOf(r.kind) + 1) % 3], data: data() })
      else if (roll < 0.6) {
        const d = structuredClone(r.data)
        const keys = Object.keys(d)
        const key = keys[Math.floor(die() * keys.length)] ?? 'k0'
        if (die() < 0.2) delete d[key]
        else d[key] = value(0)
        if (die() < 0.3) d[`k${keys.length}`] = value(0)
        now.push({ id: r.id, kind: r.kind, data: d })
      } else now.push(structuredClone(r))
    }
    while (die() < 0.4) now.push(fresh())
    rows.splice(0, rows.length, ...now)
    return structuredClone(now)
  }
}

test('a delta patched onto its base is the rows it was made from, in memory and across JSON', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const die = seeded(seed)
    const roll = shuffled(die)
    let base = roll()
    for (let i = 0; i < 60; i++) {
      const now = roll()
      const kept = structuredClone(base), was = structuredClone(now)
      const d = delta(base, now)
      expect(patch(base, d)).toEqual(now)
      expect(json(patch(json(base), json(d)))).toEqual(json(now))
      // Neither list is touched, and what is rebuilt shares nothing with them.
      expect([base, now]).toEqual([kept, was])
      const out = patch(base, d)
      for (const r of out) r.data.poked = 1
      expect([base, now]).toEqual([kept, was])
      base = now
    }
  }
})

test('a delta holds each row that changed and no other; an array is sent whole, a kind changed under an id is dropped and added', () => {
  const base: Row[] = [
    { id: 1, kind: 'imp', data: { hp: 60, at: { x: 1, y: 2 }, path: [[0, 0], [1, 1]], gone: 3 } },
    { id: 2, kind: 'coin', data: { worth: 5 } },
    { id: 3, kind: 'door', data: { open: false } },
  ]
  expect(delta(base, structuredClone(base))).toEqual({ add: [], change: [], drop: [] })
  const now = structuredClone(base)
  now[0].data.at.y = 3
  now[0].data.path[1][0] = 2
  now[0].data.gone = undefined
  now[0].data.hp = 60
  now[1] = { id: 2, kind: 'imp', data: { worth: 5 } }
  now.splice(2, 1)
  now.push({ id: 4, kind: 'coin', data: { worth: 1 } })
  expect(delta(base, now)).toEqual({
    add: [now[1], now[2]],
    change: [{ id: 1, set: [[['at', 'y'], 3], [['path'], [[0, 0], [2, 1]]]], unset: [['gone']] }],
    drop: [2, 3],
  })
})

// A key JSON may name as an own field of a row's data, and a patch writes as one: never the
// object's prototype.
test('a field named __proto__ is a field', () => {
  const base: Row[] = [{ id: 1, kind: 'imp', data: JSON.parse('{"__proto__": {"a": 1}}') }]
  const now: Row[] = [{ id: 1, kind: 'imp', data: JSON.parse('{"__proto__": {"a": 2}, "b": 1}') }]
  const out = patch(base, json(delta(base, now)))
  expect(Object.getPrototypeOf(out[0].data)).toBe(Object.prototype)
  expect(JSON.stringify(out)).toBe(JSON.stringify(now))
})

// The den, whose rows stop moving once its spawner has spawned, as the server's side of one seat
// sees it: every envelope it sends, and what the page says back.
const denSeat = async (backlog?: number) => {
  const made = structuredClone(top)
  if (backlog !== undefined) made.prefabs.scenemanager.backlog = backlog
  const truth = boot(made, { scenemanager })
  await load(truth, pathToFileURL(dir + '/').href)
  const sent: Diff[] = []
  const seat = accept(manager(truth))(d => sent.push(d))
  return { truth, sent, seat, den: scene(manager(truth), 'den') }
}

test('a step where nothing moved sends an empty delta, and one field moved sends that field', async () => {
  const { truth, sent, seat, den } = await denSeat()
  step(truth, 1)
  expect(sent[0]).toMatchObject({ scene: 'den', k: 1, base: null, change: [], drop: [] })
  expect(sent[0].add.map(r => r.kind)).toContain('imp')
  seat.take({ got: 1 })
  step(truth, 3)
  const idle = sent[sent.length - 1]
  expect(idle).toMatchObject({ base: 1, add: [], change: [], drop: [] })
  seat.take({ got: idle.k })
  den.rows.find(r => r.kind === 'imp')!.data.hp = 7
  step(truth, 1)
  const imp = den.rows.find(r => r.kind === 'imp')!
  expect(sent[sent.length - 1]).toMatchObject({ base: idle.k, add: [], drop: [], change: [{ id: imp.id, set: [[['hp'], 7]], unset: [] }] })
})

// The server reaches back over the last `backlog` envelopes, 32 unless the manager's row says,
// and reads a base as old as that before it lets the oldest go.
test('a diff reaches back backlog envelopes and no further, and keep says how far', async () => {
  for (const backlog of [4, undefined]) {
    const { truth, sent, seat } = await denSeat(backlog)
    const far = backlog ?? 32
    step(truth, 1)
    seat.take({ got: 1 })
    step(truth, far + 1)
    expect(sent.map(d => d.base)).toEqual([null, ...Array(far).fill(1), null])
    expect(sent.map(d => d.keep)).toEqual(sent.map(d => d.k - far + 1))
    // An ack of an envelope not sent yet, or not a number, moves nothing.
    const last = sent[sent.length - 1].k
    seat.take({ got: last })
    seat.take({ got: 10_000 })
    seat.take({ got: 'x' } as any)
    step(truth, 1)
    expect(sent[sent.length - 1].base).toBe(last)
  }
})

test('load refuses a backlog that is not a whole number above 0', async () => {
  for (const backlog of [0, -2, 2.5, '4', null]) {
    const scene = structuredClone(top)
    scene.prefabs.scenemanager.backlog = backlog
    await expect(load(boot(scene, { scenemanager }), pathToFileURL(dir + '/').href)).rejects.toThrow('scenemanager row declares a backlog that is not a whole number above 0')
  }
})

// `run` on a clock the test holds: `after` keeps the one call asked for, and `fire` moves the clock
// to when it is called and calls it. The truth has no rows; its step counter is what `run` did.
const held = () => {
  let now = 0
  let due: { at: number; f: () => void } | undefined
  const time = { now: () => now, after: (ms: number, f: () => void) => { due = { at: now + ms, f } } }
  const fire = (at = due!.at) => { const d = due!; due = undefined; now = at; d.f() }
  return { time, fire, get due() { return due }, set now(t: number) { now = t } }
}
const bare = () => boot({ world: {}, prefabs: { engine: { dt: DT } }, actors: [] }, {})

test('run steps as often as the clock owes a step, however late or truncated each timer fires', () => {
  const c = held(), truth = bare()
  run(truth, c.time)
  expect(c.due!.at).toBeCloseTo(DT * 1000)
  // Node's timer: the delay truncated to whole milliseconds, and each firing 1.3 ms late.
  while (c.due!.at < 10_000) c.fire(Math.trunc(c.due!.at - c.time.now()) + c.time.now() + 1.3)
  expect(truth.n).toBeGreaterThanOrEqual(599)
  expect(truth.n).toBeLessThanOrEqual(600)
})

test('run makes up a stall with every step it owes at once, and no more than a quarter second of them', () => {
  const c = held(), truth = bare()
  run(truth, c.time)
  c.fire(100)
  expect(truth.n).toBe(6)
  c.fire(5100)
  expect(truth.n).toBe(6 + Math.floor(0.25 / DT + 1e-9))
})

test('run asks for nothing more once stopped, and the call already asked for steps nothing', () => {
  const c = held(), truth = bare()
  const loop = run(truth, c.time)
  loop.stop()
  c.fire(1000)
  expect(truth.n).toBe(0)
  expect(c.due).toBeUndefined()
})

test('run refuses a manager with no engine dt', () => {
  expect(() => run(boot({ world: {}, prefabs: {}, actors: [] }, {}), held().time)).toThrow('the manager scene has no engine prefab with a dt above 0')
})
