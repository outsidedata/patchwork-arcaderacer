// The sim half of loader, in node: a catalogue url is a path under the working directory, and the
// bytes a tick reads through `asset` are the bytes of that file. The test writes its own scene: a
// loader row naming a level of its own, and a row whose tick copies what `asset` hands it. A json
// entry is read with `json`, and `prepare` is what puts it there before the first step. A texture,
// a model and a sound are the browser half's: this half never fetches one, preloaded or not.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { boot, type Scene } from '#engine/engine.ts'
import { asset, def, json, loader, namesIn, ready } from './loader.sim.ts'

const DT = 1 / 60

// Files this test writes, in a folder of its own in the system's temporary folder, each named by its
// path from the working directory, where node reads a url from.
const folder = mkdtempSync(join(tmpdir(), 'loader-sim-'))
afterAll(() => rmSync(folder, { recursive: true }))
const write = (name: string, text: string) => {
  writeFileSync(join(folder, name), text)
  return '/' + relative(process.cwd(), join(folder, name))
}

// A level: a hall of rooms, written as a file is, so its bytes are more than its parsed value.
const url = write('hall.json', JSON.stringify({ rooms: [{ name: 'hall', w: 12, h: 8, doors: [[0, 4], [11, 4]] }, { name: 'cellar', w: 6, h: 6, doors: [[3, 0]] }] }, null, 2) + '\n')
const file = readFileSync(join(folder, 'hall.json'))

const scene: Scene = {
  world: {
    loader: {
      assets: {
        hall: { type: 'json', url, preload: true },
        coin: { type: 'texture', url: '/plugins/loader/no-such-coin.png', preload: true },
        bone: { type: 'model', url: '/plugins/loader/no-such-model.glb', preload: true },
      },
    },
  },
  prefabs: {
    loader: {},
    reader: { size: 0, head: [] },
  },
  actors: [{ is: 'loader' }, { is: 'reader' }],
}

const sim = {
  loader,
  reader: {
    tick(me: any, _dt: number, w: any) {
      if (!ready(w, 'hall')) return
      const got = new Uint8Array(asset(w, 'hall'))
      me.data.size = got.byteLength
      me.data.head = [...got.slice(0, 8)]
    },
  },
}

// The bytes are the process's, so this runs before anything has read the file.
test('asset throws while the bytes have not landed', () => {
  const truth = boot(structuredClone(scene), { ...sim, reader: { tick(_me: any, _dt: number, w: any) { asset(w, 'hall') } } })
  expect(() => truth.step(DT)).toThrow('loader has not finished hall')
})

test('a preloaded asset read in node is the file at its url under the working directory', async () => {
  const truth = boot(structuredClone(scene), sim)
  const reader = () => truth.rows.find(r => r.kind === 'reader')!.data
  await vi.waitFor(() => {
    truth.step(DT)
    expect(reader().size).toBe(file.byteLength)
  })
  expect(reader().head).toEqual([...file.subarray(0, 8)])
})

test('a preloaded texture and model are neither fetched nor kept, before the first step or after it', async () => {
  let got: boolean[] = []
  const truth = boot(structuredClone(scene), { loader, reader: { tick(_me: any, _dt: number, w: any) { got = [ready(w, 'coin'), ready(w, 'bone')] } } })
  await loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world)
  for (let i = 0; i < 3; i++) truth.step(DT)
  await new Promise(r => setTimeout(r, 20))
  truth.step(DT)
  expect(got).toEqual([false, false])
})

// In a tab the url is fetched through `encodeURI`, once: a space is %20 and a % is %25.
test('in a tab a url is fetched encoded once', async () => {
  const asked: string[] = []
  vi.stubGlobal('location', { href: 'http://page/' })
  vi.stubGlobal('fetch', async (u: string) => { asked.push(u); return new Response('{"n":2}') })
  try {
    const { jsonAt } = await import('./loader.sim.ts')
    expect(await jsonAt('odd', '/a 100% b.json')).toEqual({ n: 2 })
    expect(asked).toEqual(['/a%20100%25%20b.json'])
  } finally {
    vi.unstubAllGlobals()
  }
})

// A data file: any json under the working directory does; this one is shaped as a scene file is.
const port = 8123
const table = write('table.scene.json', JSON.stringify({ world: {}, prefabs: { scenemanager: { port } }, actors: [] }))

const tables: Scene = {
  world: { loader: { assets: { table: { type: 'json', url: table, preload: true }, coin: { type: 'texture', url } } } },
  prefabs: {
    loader: {},
    reader: { port: 0, same: false },
  },
  actors: [{ is: 'loader' }, { is: 'reader' }],
}

const reads = {
  tick(me: any, _dt: number, w: any) {
    me.data.port = json(w, 'table').prefabs.scenemanager.port
    me.data.same = json(w, 'table') === json(w, 'table')
  },
}

test('the catalogue is the scene\'s world.loader, and a scene whose world has none cannot be prepared', async () => {
  const truth = boot({ prefabs: { loader: {} }, actors: [{ is: 'loader' }] }, { loader })
  expect(truth.rows.find(r => r.kind === 'loader')!.data).toEqual({})
  await expect(loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world)).rejects.toThrow('the scene\'s world has no loader catalogue')
})

test('once prepare has resolved, a json entry is the parsed file on the first step, the same value each read', async () => {
  const truth = boot(structuredClone(tables), { loader, reader: reads })
  await loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world)
  truth.step(DT)
  expect(truth.rows.find(r => r.kind === 'reader')!.data).toEqual({ port, same: true })
})

test('json on an entry that is not json throws', () => {
  const truth = boot(structuredClone(tables), { loader, reader: { tick(_me: any, _dt: number, w: any) { json(w, 'coin') } } })
  expect(() => truth.step(DT)).toThrow('loader coin is a texture, not json')
})

// A scene's definitions, one entry per kind: an imp and a zombie.
const monsterDefs = { imp: { health: 60, speed: 8, attack: { kind: 'fireball', damage: [3, 24] } }, zombie: { health: 20, speed: 8, attack: { kind: 'hitscan', damage: [3, 15] } } }
const defs = write('defs.json', JSON.stringify(monsterDefs))

const defined = (world: Record<string, any>, kind: string) => {
  let got: any
  const truth = boot({
    world: { ...world, loader: { assets: { monsters: { type: 'json', url: defs, preload: true } } } },
    prefabs: { loader: {}, reader: {} },
    actors: [{ is: 'loader' }, { is: 'reader' }],
  }, { loader, reader: { tick(_me: any, _dt: number, w: any) { got = def(w, kind) } } })
  return loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world).then(() => { truth.step(DT); return got })
}

test('def is a kind\'s entry in the file the scene\'s world.defs names', async () => {
  expect(await defined({ defs: 'monsters' }, 'imp')).toEqual(monsterDefs.imp)
})

test('def of a kind the file has no entry for, or in a scene naming no defs, throws', async () => {
  await expect(defined({ defs: 'monsters' }, 'cyberdemon')).rejects.toThrow('monsters has no definition of cyberdemon')
  await expect(defined({}, 'imp')).rejects.toThrow('the scene\'s world names no defs')
})

test('an actor reads the same definition from its page\'s wire, once the loader row is prepared', async () => {
  const loaderRow = { id: 1, kind: 'loader', data: {} }
  const scene = { world: { defs: 'monsters', loader: { assets: { monsters: { type: 'json', url: defs, preload: true } } } }, prefabs: { loader: {} }, actors: [] }
  await loader.prepare(loaderRow, scene.world)
  const wire = { n: 0, ack: 0, rows: [loaderRow], home: '', scene, send: () => 0 }
  expect(def(wire, 'zombie')).toEqual(monsterDefs.zombie)
  expect(def(wire, 'zombie')).toBe(await defined({ defs: 'monsters' }, 'zombie'))
})

import { holds as held, jsonAt, load, rewritten, writes, written } from './loader.sim.ts'

test('a url is the path as the file is named: a space and a % are read as they are', async () => {
  expect(await jsonAt('odd', write('a 100% b.json', '{"n":1}'))).toEqual({ n: 1 })
})

test('a file that cannot be read rejects, and is read again the next time it is asked for', async () => {
  const url = '/' + relative(process.cwd(), join(folder, 'later.json'))
  await expect(jsonAt('later', url)).rejects.toThrow(`loader later: loader could not read ${url}: ENOENT`)
  writeFileSync(join(folder, 'later.json'), '{"here":true}')
  expect(await jsonAt('later', url)).toEqual({ here: true })
})

test('a rule that asks load for a file on every step fetches it and reports its failure once for its loader row, and a new row asks again', async () => {
  const url = '/' + relative(process.cwd(), join(folder, 'asked.json'))
  const errors: unknown[] = []
  const quiet = vi.spyOn(console, 'error').mockImplementation((e: unknown) => { errors.push(e) })
  const asking: Scene = { world: { loader: { assets: { asked: { type: 'json', url } } } }, prefabs: { loader: {}, asker: { got: null } }, actors: [{ is: 'loader' }, { is: 'asker' }] }
  const asker = {
    tick(me: any, _dt: number, w: any) {
      if (ready(w, 'asked')) me.data.got = json(w, 'asked')
      else load(w, 'asked')
    },
  }
  const got = (t: ReturnType<typeof boot>) => t.rows.find(r => r.kind === 'asker')!.data.got
  const steps = async (t: ReturnType<typeof boot>) => {
    for (let s = 0; s < 5; s++) {
      t.step(DT)
      await new Promise(r => setTimeout(r, 10))
    }
  }
  try {
    const truth = boot(structuredClone(asking), { loader, asker })
    await steps(truth)
    expect(errors.map(e => (e as Error).message)).toEqual([`loader asked: loader could not read ${url}: ENOENT`])
    // The file is there now, and the row that asked is not fetching it again.
    writeFileSync(join(folder, 'asked.json'), '{"late":true}')
    await steps(truth)
    expect(got(truth)).toBeNull()
    expect(errors).toHaveLength(1)
    const again = boot(structuredClone(asking), { loader, asker })
    await steps(again)
    expect(got(again)).toEqual({ late: true })
    expect(errors).toHaveLength(1)
  } finally {
    quiet.mockRestore()
  }
})

test('a file written while the game runs refills the parsed file every reader holds, and later readers read it too', async () => {
  const url = write('speed.json', '{"speed":3}')
  const held = await jsonAt('speed', url)
  written(url, '{"speed":7,"turn":2}')
  expect(held).toEqual({ speed: 7, turn: 2 })
  expect(await jsonAt('speed', url)).toBe(held)
  const fresh = write('fresh.json', '{"a":1}')
  written(fresh, '{"a":2}')
  expect(await jsonAt('fresh', fresh)).toEqual({ a: 2 })
})

test('every write of a file is counted, one this half reads and one it never does, a sheet\'s page say', () => {
  const url = write('counted.json', '{}'), page = '/nowhere/counted.png'
  expect([writes(url), writes(page)]).toEqual([0, 0])
  written(url, '{"a":1}')
  written(url, '{"a":2}')
  rewritten(page)
  expect([writes(url), writes(page)]).toEqual([2, 1])
  expect(held(page)).toBe(false)
})

// Sprite sheets. `read` is what `sheet` hands a rule: the file with its tags written out as clips
// and drawn as its catalogue entry says. These sheets are written here.
import { frameOf, pick, play, reach, read, span } from './loader.sim.ts'

// An Aseprite JSON-Array of frames each whole on its page, `[id, x, y, w, h, anchor, ms]`, and tags.
type Cell = [string, number, number, number, number, [number, number], number?]
const sheetFile = (image: string, cells: Cell[], frameTags: any[] = [], more: object = {}) => ({
  frames: cells.map(([filename, x, y, w, h, [ax, ay], duration]) => ({
    filename, frame: { x, y, w, h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
    pivot: { x: ax / w, y: ay / h }, ...(duration !== undefined && { duration }),
  })),
  meta: { app: 'test', image, frameTags, ...more },
})
// `cols` × `rows` cells of `w` × `h` from a page's top left, numbered from `from`, each run a row.
const cut = (from: number, cols: number, rows: number, w: number, h: number, anchor: [number, number], ms?: number): Cell[] =>
  Array.from({ length: cols * rows }, (_, i) => [String(from + i), (i % cols) * w, Math.floor(i / cols) * h, w, h, anchor, ms])
const rowTags = (name: string, cols: number, rows: number, more: object = {}) =>
  Array.from({ length: rows }, (_, k) => ({ name: `${name}@${k}`, from: k * cols, to: k * cols + cols - 1, direction: 'forward', ...more }))

// Two packs, a walk of four runs a quarter turn apart at 10 frames a second and a run of four that
// holds its last frame, each frame of it a quarter of a second.
const walkerPacks: Record<string, any> = {
  '/games/x/assets/walker.json': sheetFile('walk one.png', cut(0, 3, 4, 10, 20, [5, 18], 100), rowTags('walk', 3, 4), { related_multi_packs: ['walker/run.json'] }),
  '/games/x/assets/walker/run.json': sheetFile('../run.png', cut(12, 2, 4, 8, 8, [4, 8], 250), rowTags('run', 2, 4, { repeat: '1' })),
}
const gridded = read(walkerPacks['/games/x/assets/walker.json'], '/games/x/assets/walker.json', { nearest: true, facing: { first: 0, step: 0.25 } }, u => walkerPacks[u])

test('each pack of a multipack is a page, its frames on it, a plain path from its own folder with nothing in it encoded', () => {
  expect(gridded.frames['0']).toEqual({ id: '0', page: 0, box: [0, 0, 10, 20], rotated: false, size: [10, 20], trim: [0, 0, 10, 20], anchor: [5, 18] })
  expect(gridded.frames['5']).toEqual({ id: '5', page: 0, box: [20, 20, 10, 20], rotated: false, size: [10, 20], trim: [0, 0, 10, 20], anchor: [5, 18] })
  expect(gridded.frames['19']).toEqual({ id: '19', page: 1, box: [8, 24, 8, 8], rotated: false, size: [8, 8], trim: [0, 0, 8, 8], anchor: [4, 8] })
  expect(Object.keys(gridded.frames)).toHaveLength(20)
  expect(gridded.pages).toEqual(['/games/x/assets/walk one.png', '/games/x/assets/run.png'])
  expect(read(sheetFile('../art/100% one.png', []), '/games/x/assets/walker.json').pages).toEqual(['/games/x/art/100% one.png'])
  expect(read(sheetFile('/top.png', []), '/games/x/assets/walker.json').pages).toEqual(['/top.png'])
})

test('the tags of a pack count its own frames, runs @k of one clip, looping unless they repeat', () => {
  expect(gridded.clips.walk).toEqual({ loop: true, runs: [['0', '1', '2'], ['3', '4', '5'], ['6', '7', '8'], ['9', '10', '11']], durations: [0.1, 0.1, 0.1] })
  expect(gridded.clips.run.loop).toBe(false)
  expect(gridded.clips.run.runs[3]).toEqual(['18', '19'])
})

// Boxes of any size, each with its own anchor, as a sheet cut by hand is, drawn facing right and
// mirrored for left.
const boxedFile = sheetFile('fighter.png', [
  ['5.17', 5, 17, 37, 58, [18, 58], 250 / 3], ['51.17', 51, 17, 44, 58, [18, 58], 250 / 3], ['99.17', 99, 17, 30, 40, [12, 40], 250 / 3],
], [{ name: 'punch', from: 0, to: 2, direction: 'forward', repeat: '1' }])
const boxed = read(boxedFile, '/f.json', { facing: { first: 0, mirror: true } })

test('an animation naming a frame the sheet does not have throws', () => {
  expect(() => read({ ...sheetFile('p.png', []), animations: { a: ['x'] } }, '/s.json'))
    .toThrow('sheet /s.json clip a names frame x, which it does not have')
})

test('of runs a quarter turn apart, the one facing nearest the way asked for', () => {
  expect(pick(gridded, 'walk', 0)).toEqual({ run: 0, mirror: false })
  expect(pick(gridded, 'walk', 0.2)).toEqual({ run: 1, mirror: false })
  expect(pick(gridded, 'walk', 0.55)).toEqual({ run: 2, mirror: false })
  expect(pick(gridded, 'walk', -0.3)).toEqual({ run: 3, mirror: false })
  expect(pick(gridded, 'walk', 0.9)).toEqual({ run: 0, mirror: false })
})

test('one run drawn facing right faces left mirrored; drawn facing left, it faces right mirrored', () => {
  expect(pick(boxed, 'punch', 0)).toEqual({ run: 0, mirror: false })
  expect(pick(boxed, 'punch', 0.5)).toEqual({ run: 0, mirror: true })
  const lefty = { ...boxed, facing: { first: 0.5, step: 0, mirror: true } }
  expect(pick(lefty, 'punch', 0.5)).toEqual({ run: 0, mirror: false })
  expect(pick(lefty, 'punch', 0)).toEqual({ run: 0, mirror: true })
})

test('five runs from down round to up through left draw the right-hand side mirrored', () => {
  const five = read(sheetFile('p.png', cut(0, 1, 5, 1, 1, [0, 0], 1000), rowTags('walk', 1, 5)), '/5.json', { facing: { first: 0.75, step: -0.125, mirror: true } })
  expect(pick(five, 'walk', 0.75)).toEqual({ run: 0, mirror: false })
  expect(pick(five, 'walk', 0.5)).toEqual({ run: 2, mirror: false })
  expect(pick(five, 'walk', 0.25)).toEqual({ run: 4, mirror: false })
  expect(pick(five, 'walk', 0)).toEqual({ run: 2, mirror: true })
  expect(pick(five, 'walk', 0.875)).toEqual({ run: 1, mirror: true })
  expect(pick(five, 'walk', 0.125)).toEqual({ run: 3, mirror: true })
})

test('a clip of one run on a sheet that mirrors nothing faces every way', () => {
  const still = { ...boxed, facing: { first: 0, step: 0, mirror: false } }
  for (const turns of [0, 0.25, 0.5, 0.75]) expect(pick(still, 'punch', turns)).toEqual({ run: 0, mirror: false })
})

test('a frame of a clip is the frame its run lists at that place', () => {
  expect(frameOf(gridded, 'walk', 2, 1).id).toBe('7')
  expect(frameOf(boxed, 'punch', 0, 2).box).toEqual([99, 17, 30, 40])
})

test('a clip whose frames are picked one by one has no durations, and playing it or timing it throws; one frame of it holds', () => {
  const picked = read(sheetFile('p.png', cut(0, 2, 1, 4, 4, [2, 4]), [{ name: 'stand', from: 0, to: 1 }, { name: 'one', from: 0, to: 0 }]), '/p.json')
  expect(picked.clips.stand).toEqual({ loop: true, runs: [['0', '1']] })
  expect(() => play(picked, 'stand', 0, 0, 0.1)).toThrow('clip stand is not timed: its frames have no duration')
  expect(() => span(picked, 'stand')).toThrow('clip stand is not timed: its frames have no duration')
  expect(play(picked, 'one', 0, 0, 5)).toEqual([0, 0])
})

test('a frame reaches from its anchor to the edges of its box, and mirrored it reaches the other way', () => {
  const f = boxed.frames['51.17']
  expect(reach(f, false)).toEqual([18, 26, 58, 0])
  expect(reach(f, true)).toEqual([26, 18, 58, 0])
})

// ---------------------------------------------------------------- a walker, Aseprite's shapes

// An Aseprite JSON with slices. Six frames on one page: `a` and `b` a two-frame walk facing one
// way, `e` and `f` the same walk the other way; `c` trimmed, its 10 × 12 box cut from a 16 × 16
// picture 3 across and 4 down; `d` with no pivot. Each lasts its own milliseconds, and `b` stands
// half its height below its own bottom edge.
const whole = (w: number, h: number) => ({ trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h } })
const aseFrames: [string, any][] = [
  ['a', { frame: { x: 0, y: 0, w: 16, h: 16 }, rotated: false, ...whole(16, 16), duration: 100, pivot: { x: 0.5, y: 1 } }],
  ['b', { frame: { x: 16, y: 0, w: 16, h: 16 }, rotated: false, ...whole(16, 16), duration: 200, pivot: { x: 0.5, y: 1.5 } }],
  ['c', { frame: { x: 32, y: 0, w: 10, h: 12 }, rotated: false, trimmed: true, spriteSourceSize: { x: 3, y: 4, w: 10, h: 12 }, sourceSize: { w: 16, h: 16 }, duration: 50, pivot: { x: 0.5, y: 1 } }],
  ['d', { frame: { x: 48, y: 0, w: 16, h: 16 }, rotated: false, ...whole(16, 16), duration: 100 }],
  ['e', { frame: { x: 0, y: 16, w: 16, h: 16 }, rotated: false, ...whole(16, 16), duration: 100, pivot: { x: 0.5, y: 1 } }],
  ['f', { frame: { x: 16, y: 16, w: 16, h: 16 }, rotated: false, ...whole(16, 16), duration: 200, pivot: { x: 0.5, y: 1 } }],
]
const aseMeta = {
  app: 'https://www.aseprite.org/',
  version: '1.3',
  image: 'art/walker.png',
  size: { w: 64, h: 32 },
  frameTags: [
    { name: 'walk@0', from: 0, to: 1, direction: 'forward' },
    { name: 'walk@1', from: 4, to: 5, direction: 'forward' },
    { name: 'back', from: 0, to: 2, direction: 'reverse' },
    { name: 'bounce', from: 0, to: 3, direction: 'pingpong' },
    { name: 'bounceBack', from: 0, to: 2, direction: 'pingpong_reverse' },
    { name: 'once', from: 0, to: 2, direction: 'forward', repeat: '1' },
    { name: 'thrice', from: 0, to: 2, direction: 'pingpong', repeat: '3' },
  ],
  slices: [
    { name: 'muzzle', color: '#ff0000ff', keys: [{ frame: 2, bounds: { x: 10, y: 5, w: 1, h: 1 } }, { frame: 3, bounds: { x: 12, y: 6, w: 1, h: 1 } }] },
    { name: 'panel', color: '#0000ffff', keys: [{ frame: 0, bounds: { x: 0, y: 0, w: 16, h: 16 }, center: { x: 4, y: 4, w: 8, h: 8 }, pivot: { x: 8, y: 16 } }] },
  ],
}
const aseArray = { frames: aseFrames.map(([filename, f]) => ({ filename, ...f })), meta: aseMeta }
const aseHash = { frames: Object.fromEntries(aseFrames), meta: aseMeta }
const walker = read(aseArray, '/games/x/assets/walker.json')

test('an Aseprite sheet reads the same from its JSON-Array and its JSON-Hash, its one page beside it', () => {
  expect(read(aseHash, '/games/x/assets/walker.json')).toEqual(walker)
  expect(walker.pages).toEqual(['/games/x/assets/art/walker.png'])
  expect(walker.order).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
})

test('a trimmed frame is its box on the page, the whole picture\'s size, where its box was in the picture, and the whole picture\'s pivot as its anchor', () => {
  expect(walker.frames.c).toEqual({ id: 'c', page: 0, box: [32, 0, 10, 12], rotated: false, size: [16, 16], trim: [3, 4, 10, 12], anchor: [8, 16] })
})

test('a frame with no pivot stands on its whole picture\'s top left', () => {
  expect(walker.frames.d.anchor).toEqual([0, 0])
  const trimmed = read({ frames: [{ filename: 't', frame: { x: 0, y: 0, w: 4, h: 4 }, trimmed: true, spriteSourceSize: { x: 2, y: 1, w: 4, h: 4 }, sourceSize: { w: 8, h: 8 }, duration: 100 }], meta: { app: 'a', image: 'p.png' } }, '/t.json')
  expect(trimmed.frames.t.anchor).toEqual([0, 0])
})

test('a frame a packer stored turned is its box as it lies on the page, its size upright, and says it is turned', () => {
  const turned = read({ frames: { r: { frame: { x: 5, y: 6, w: 10, h: 30 }, rotated: true, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 10, h: 30 }, sourceSize: { w: 10, h: 30 }, pivot: { x: 0.5, y: 1 } } }, meta: { app: 'tp', image: 'p.png' } }, '/r.json')
  expect(turned.frames.r).toEqual({ id: 'r', page: 0, box: [5, 6, 30, 10], rotated: true, size: [10, 30], trim: [0, 0, 10, 30], anchor: [5, 30] })
})

test('a clip moves on each frame after its own duration, and lasts the sum of them', () => {
  const [f, t] = play(walker, 'walk', 0, 0, 0.15)
  expect(f).toBe(1)
  expect(t).toBeCloseTo(0.05)
  const [g, u] = play(walker, 'walk', 1, 0.05, 0.2)
  expect(g).toBe(0)
  expect(u).toBeCloseTo(0.05)
  expect(play(walker, 'walk', 0, 0, 0.09)).toEqual([0, 0.09])
  expect(span(walker, 'walk')).toBeCloseTo(0.3)
  expect(span(walker, 'back')).toBeCloseTo(0.35)
  expect(play(walker, 'once', 0, 0, 1)).toEqual([2, 0])
  expect(span(walker, 'thrice')).toBeCloseTo(0.1 + 0.2 + 0.05 + 0.2 + 0.1 + 0.2 + 0.05)
})

test('slices are read with every key, a key naming its frame by its place in the file', () => {
  expect(walker.slices.muzzle).toEqual([{ frame: 2, bounds: [10, 5, 1, 1] }, { frame: 3, bounds: [12, 6, 1, 1] }])
  expect(walker.order[walker.slices.muzzle[0].frame]).toBe('c')
  expect(walker.slices.panel).toEqual([{ frame: 0, bounds: [0, 0, 16, 16], center: [4, 4, 8, 8], pivot: [8, 16] }])
  expect(boxed.slices).toEqual({})
  expect(boxed.order).toEqual(['5.17', '51.17', '99.17'])
})

test('TexturePacker\'s animations are clips, each looping', () => {
  const tp = read({ frames: aseHash.frames, animations: { walk: ['a', 'b'], 'walk@1': ['e', 'f'] }, meta: { app: 'http://www.codeandweb.com/texturepacker', image: 'p.png' } }, '/tp.json')
  expect(tp.clips.walk).toEqual({ loop: true, runs: [['a', 'b'], ['e', 'f']], durations: [0.1, 0.2] })
})

test('an Aseprite sheet whose clip misses a run, mixes looping, lasts differently run to run, plays a way Aseprite has not, or keys a slice on no frame, throws', () => {
  const tagged = (...frameTags: any[]) => ({ frames: aseArray.frames, meta: { ...aseMeta, frameTags, slices: [] } })
  expect(() => read(tagged({ name: 'w@0', from: 0, to: 1 }, { name: 'w@2', from: 4, to: 5 }), '/s.json')).toThrow('sheet /s.json clip w has run 2 and no run 1')
  expect(() => read(tagged({ name: 'w@0', from: 0, to: 1 }, { name: 'w@1', from: 4, to: 5, repeat: '1' }), '/s.json')).toThrow('sheet /s.json clip w has runs that loop and runs that do not')
  expect(() => read(tagged({ name: 'w@0', from: 0, to: 1 }, { name: 'w@1', from: 1, to: 2 }), '/s.json')).toThrow('sheet /s.json clip w has runs timed differently')
  expect(() => read(tagged({ name: 'w', from: 0, to: 1, direction: 'sideways' }), '/s.json')).toThrow('sheet /s.json tag w: direction sideways is none of')
  expect(() => read(tagged({ name: 'w', from: 4, to: 9 }), '/s.json')).toThrow('sheet /s.json tag w runs from 4 to 9 of 6 frames')
  expect(() => read({ ...aseArray, meta: { ...aseMeta, image: undefined } }, '/s.json')).toThrow('sheet /s.json has no meta.image')
  expect(() => read({ ...aseArray, meta: { ...aseMeta, slices: [{ name: 'm', keys: [{ frame: 6, bounds: { x: 0, y: 0, w: 1, h: 1 } }] }] } }, '/s.json')).toThrow('sheet /s.json slice m has a key at frame 6 of 6')
  expect(() => read({ ...aseArray, meta: { ...aseMeta, slices: [aseMeta.slices[0], aseMeta.slices[0]] } }, '/s.json')).toThrow('sheet /s.json has two slices muzzle')
})

test('two entries of one sheet drawn two ways are two sheets, and a write refills both', async () => {
  const url = write('two ways.json', JSON.stringify(aseArray))
  const plain = await sheetAt('plain', url), turned = await sheetAt('turned', url, { facing: { first: 0.5, mirror: true } })
  expect(await sheetAt('again', url)).toBe(plain)
  expect([plain.facing.first, turned.facing.first]).toEqual([0, 0.5])
  written(url, JSON.stringify({ ...aseArray, meta: { ...aseMeta, image: 'other.png' } }))
  expect(plain.pages[0].endsWith('/other.png')).toBe(true)
  expect([turned.pages[0].endsWith('/other.png'), turned.facing.mirror]).toEqual([true, true])
})

// ---------------------------------------------------------------- Aseprite and TexturePacker

import { gpl, holds, palette, played, readMap, sheetAt, tiled, tiledAt } from './loader.sim.ts'

// The url of a file of this test's folder.
const folderUrl = (name: string) => '/' + relative(process.cwd(), join(folder, name)).split('\\').join('/')

// An Aseprite JSON-Array: frames 48 pixels square timed one by one, and tags of every direction.
const cell = (filename: string, x: number, y: number, duration = 100, pivot = { x: 0.5, y: 0.8125 }, h = 48) => ({
  filename, frame: { x, y, w: 48, h }, rotated: false, trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w: 48, h }, sourceSize: { w: 48, h }, pivot, duration,
})
const aseprite = {
  frames: [
    cell('walk/0', 0, 0), cell('walk/1', 48, 0, 150), cell('walk/2', 96, 0),
    cell('wave/0', 0, 48, 100, { x: 0.5, y: 47 / 56 }, 56), cell('wave/1', 48, 48, 100, { x: 0.5, y: 47 / 56 }, 56), cell('wave/2', 96, 48, 100, { x: 0.5, y: 47 / 56 }, 56), cell('wave/3', 144, 48, 100, { x: 0.5, y: 47 / 56 }, 56),
    cell('flash/0', 0, 104, 50, { x: 0.5, y: 1.5 }),
    cell('look-right/0', 48, 104), cell('look-right/1', 96, 104), cell('look-left/0', 144, 104), cell('look-left/1', 192, 104),
  ],
  meta: {
    app: 'https://www.aseprite.org/', image: 'hero sheet.png', size: { w: 240, h: 152 },
    frameTags: [
      { name: 'walk', from: 0, to: 2, direction: 'forward' },
      { name: 'wave', from: 3, to: 6, direction: 'pingpong', repeat: '2' },
      { name: 'back', from: 0, to: 2, direction: 'reverse', repeat: 1 },
      { name: 'sway', from: 3, to: 5, direction: 'pingpong_reverse' },
      { name: 'flash', from: 7, to: 7, direction: 'forward', repeat: '1' },
      { name: 'look@0', from: 8, to: 9, direction: 'forward' },
      { name: 'look@1', from: 10, to: 11, direction: 'forward' },
    ],
  },
}
const hero = read(aseprite, '/games/x/assets/hero.json')

test('an Aseprite frame is its filename, its box, and its pivot as a pixel anchor, whole when it is within a millionth of one', () => {
  expect(hero.pages).toEqual(['/games/x/assets/hero sheet.png'])
  expect(hero.frames['walk/1']).toEqual({ id: 'walk/1', page: 0, box: [48, 0, 48, 48], rotated: false, size: [48, 48], trim: [0, 0, 48, 48], anchor: [24, 39] })
  expect(hero.frames['wave/2'].anchor).toEqual([24, 47])
  // A pivot below the frame is an anchor below it.
  expect(hero.frames['flash/0'].anchor).toEqual([24, 72])
  expect(reach(hero.frames['flash/0'], false)).toEqual([24, 24, 72, -24])
})

test('each tag is a clip whose runs are its frames in the order they play, timed by their durations', () => {
  expect(hero.clips.walk).toEqual({ loop: true, runs: [['walk/0', 'walk/1', 'walk/2']], durations: [0.1, 0.15, 0.1] })
  expect(hero.clips.wave).toMatchObject({ loop: false, runs: [['wave/0', 'wave/1', 'wave/2', 'wave/3', 'wave/2', 'wave/1', 'wave/0']] })
  expect(hero.clips.back).toMatchObject({ loop: false, runs: [['walk/2', 'walk/1', 'walk/0']] })
  expect(hero.clips.sway).toMatchObject({ loop: true, runs: [['wave/2', 'wave/1', 'wave/0', 'wave/1']] })
  expect(hero.clips.flash).toMatchObject({ loop: false, runs: [['flash/0']], durations: [0.05] })
  expect(hero.clips.look.runs).toEqual([['look-right/0', 'look-right/1'], ['look-left/0', 'look-left/1']])
})

test('a ping-pong turns at each end without showing the end frame twice, a pass each way one time of its repeat', () => {
  const ids = ['a', 'b', 'c']
  expect(played(ids, 'pingpong', 0)).toEqual({ run: ['a', 'b', 'c', 'b'], loop: true })
  expect(played(ids, 'pingpong', 1)).toEqual({ run: ['a', 'b', 'c'], loop: false })
  expect(played(ids, 'pingpong', 3)).toEqual({ run: ['a', 'b', 'c', 'b', 'a', 'b', 'c'], loop: false })
  expect(played(ids, 'pingpong_reverse', 2)).toEqual({ run: ['c', 'b', 'a', 'b', 'c'], loop: false })
  expect(played(ids, 'forward', 2)).toEqual({ run: ['a', 'b', 'c', 'a', 'b', 'c'], loop: false })
  expect(played(['a'], 'pingpong', 0)).toEqual({ run: ['a'], loop: true })
  expect(() => played(ids, 'sideways', 0)).toThrow('direction sideways is none of forward, reverse, pingpong, pingpong_reverse')
  expect(() => played(ids, 'forward', 1.5)).toThrow('repeat 1.5 is no count of times')
})

test('a sheet whose runs are missing one, differ in length or in timing, or time some frames and not others, throws', () => {
  const tags = (frameTags: any[], frames: any[] = aseprite.frames) => () => read({ frames, meta: { image: 'p.png', frameTags } }, '/s.json')
  expect(tags([{ name: 'go@0', from: 0, to: 1 }, { name: 'go@1', from: 0, to: 2 }])).toThrow('sheet /s.json clip go has runs of different lengths')
  const some = aseprite.frames.map((f, i) => (i === 1 ? { ...f, duration: undefined } : f))
  expect(tags([{ name: 'go', from: 0, to: 2 }], some)).toThrow('sheet /s.json clip go has frames with a duration and frames without')
  expect(() => read({ frames: {}, nope: 1 }, '/n.json')).toThrow('sheet /n.json is no sheet the loader reads')
})

// A TexturePacker multipack of two JSON-Hash packs: one frame trimmed, one trimmed and turned a
// quarter on its page, one on the second pack, and an animation over all three.
const packs = {
  'coins-0.json': {
    frames: {
      'coin 1.png': { frame: { x: 2, y: 4, w: 10, h: 12 }, rotated: false, trimmed: true, spriteSourceSize: { x: 3, y: 2, w: 10, h: 12 }, sourceSize: { w: 16, h: 16 }, pivot: { x: 0.5, y: 0.5 } },
      'coin 2.png': { frame: { x: 20, y: 4, w: 10, h: 12 }, rotated: true, trimmed: true, spriteSourceSize: { x: 3, y: 2, w: 10, h: 12 }, sourceSize: { w: 16, h: 16 }, pivot: { x: 0.5, y: 0.5 } },
    },
    animations: { spin: ['coin 1.png', 'coin 2.png', 'coin 3.png'] },
    meta: { app: 'https://www.codeandweb.com/texturepacker', image: 'coins-0.png', related_multi_packs: ['coins-1.json'] },
  },
  'coins-1.json': {
    frames: { 'coin 3.png': { frame: { x: 0, y: 0, w: 16, h: 16 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 }, sourceSize: { w: 16, h: 16 } } },
    meta: { image: 'coins-1.png', related_multi_packs: ['coins-0.json'] },
  },
}

test('a TexturePacker multipack is one sheet: each pack a page, trimmed and turned frames kept as they lie, and its animations clips', async () => {
  const url = write('coins-0.json', JSON.stringify(packs['coins-0.json']))
  write('coins-1.json', JSON.stringify(packs['coins-1.json']))
  const coins = await sheetAt('coins', url)
  expect(coins.pages).toEqual([folderUrl('coins-0.png'), folderUrl('coins-1.png')])
  expect(coins.frames['coin 1.png']).toEqual({ id: 'coin 1.png', page: 0, box: [2, 4, 10, 12], rotated: false, size: [16, 16], trim: [3, 2, 10, 12], anchor: [8, 8] })
  expect(coins.frames['coin 2.png']).toEqual({ id: 'coin 2.png', page: 0, box: [20, 4, 12, 10], rotated: true, size: [16, 16], trim: [3, 2, 10, 12], anchor: [8, 8] })
  expect(coins.frames['coin 3.png']).toMatchObject({ page: 1, anchor: [0, 0] })
  expect(coins.clips.spin).toEqual({ loop: true, runs: [['coin 1.png', 'coin 2.png', 'coin 3.png']] })
  // Its pixels reach from the anchor to the trimmed box, not the whole frame.
  expect(reach(coins.frames['coin 1.png'], false)).toEqual([5, 5, 6, 6])
  expect(holds(folderUrl('coins-1.json'))).toBe(true)
})

test('nearest, facing and palette come from the catalogue entry', async () => {
  const url = write('dressed.json', JSON.stringify(aseprite))
  const plain = await sheetAt('dressed', url)
  const dressed = await sheetAt('dressed', url, { nearest: true, facing: { first: 0.5, mirror: true }, palette: 'mario' })
  expect([plain.nearest, plain.facing, plain.palette]).toEqual([false, { first: 0, step: 0, mirror: false }, undefined])
  expect([dressed.nearest, dressed.facing, dressed.palette]).toEqual([true, { first: 0.5, step: 0, mirror: true }, 'mario'])
})

// In a tab, with every fetch held until the test lets it land.
test('a multipack\'s packs, and a map\'s tilesets, are fetched together once the file naming them lands', async () => {
  const tileset = (name: string) => JSON.stringify({ type: 'tileset', name, tilewidth: 8, tileheight: 8, tilecount: 1, columns: 1, image: `${name}.png`, imagewidth: 8, imageheight: 8 })
  const files: Record<string, string> = {
    '/held/sheet.json': JSON.stringify({ frames: [], meta: { app: 'test', image: 'a.png', related_multi_packs: ['b.json', 'c.json'] } }),
    '/held/b.json': JSON.stringify({ frames: [], meta: { image: 'b.png' } }),
    '/held/c.json': JSON.stringify({ frames: [], meta: { image: 'c.png' } }),
    '/held/map.tmj': JSON.stringify({ type: 'map', orientation: 'orthogonal', width: 1, height: 1, tilewidth: 8, tileheight: 8, tilesets: [{ firstgid: 1, source: 'x.tsj' }, { firstgid: 2, source: 'y.tsj' }], layers: [] }),
    '/held/x.tsj': tileset('x'),
    '/held/y.tsj': tileset('y'),
  }
  const held: { url: string; land(): void }[] = []
  vi.stubGlobal('location', { href: 'http://page/' })
  vi.stubGlobal('fetch', (u: string) => new Promise(ok => held.push({ url: u, land: () => ok(new Response(files[u])) })))
  const land = async (urls: string[]) => {
    await vi.waitFor(() => expect(held.map(h => h.url)).toEqual(urls))
    for (const h of held.splice(0)) h.land()
  }
  try {
    const sheet = sheetAt('held', '/held/sheet.json')
    await land(['/held/sheet.json'])
    await land(['/held/b.json', '/held/c.json'])
    expect((await sheet).pages).toEqual(['/held/a.png', '/held/b.png', '/held/c.png'])
    const map = tiledAt('held', '/held/map.tmj')
    await land(['/held/map.tmj'])
    await land(['/held/x.tsj', '/held/y.tsj'])
    expect((await map).tilesets.map(t => t.name)).toEqual(['x', 'y'])
  } finally {
    vi.unstubAllGlobals()
  }
})

test('a rewritten pack of a multipack refills the sheet every reader holds', async () => {
  const url = write('re-0.json', JSON.stringify({ ...packs['coins-0.json'], meta: { ...packs['coins-0.json'].meta, related_multi_packs: ['re-1.json'] } }))
  const other = write('re-1.json', JSON.stringify(packs['coins-1.json']))
  const held = await sheetAt('re', url)
  const moved = structuredClone(packs['coins-1.json'])
  moved.frames['coin 3.png'].frame.x = 5
  written(other, JSON.stringify(moved))
  expect(held.frames['coin 3.png'].box[0]).toBe(5)
})

// ---------------------------------------------------------------- tilesets as sheets

test('a Tiled tileset is a sheet: a frame a tile standing as Tiled stands one, a clip a type or an animation', () => {
  const s = read({
    type: 'tileset', name: 'blocks', tilewidth: 16, tileheight: 16, tilecount: 8, columns: 4, margin: 1, spacing: 2,
    image: '../art/blocks.png', imagewidth: 71, imageheight: 35, objectalignment: 'bottom', tileoffset: { x: 0, y: 2 },
    tiles: [
      { id: 4, type: 'coin' },
      { id: 1, type: 'coin', animation: [{ tileid: 1, duration: 100 }, { tileid: 2, duration: 150 }] },
      { id: 3, class: 'question' },
      { id: 5, animation: [{ tileid: 5, duration: 50 }, { tileid: 6, duration: 50 }] },
    ],
  }, '/games/x/assets/blocks.tsj')
  expect(s.pages).toEqual(['/games/x/art/blocks.png'])
  expect(Object.keys(s.frames)).toHaveLength(8)
  expect(s.frames['5']).toEqual({ id: '5', page: 0, box: [19, 19, 16, 16], rotated: false, size: [16, 16], trim: [0, 0, 16, 16], anchor: [8, 14] })
  expect(s.clips.coin).toEqual({ loop: true, runs: [['1', '2']], durations: [0.1, 0.15] })
  expect(s.clips.question).toEqual({ loop: true, runs: [['3']] })
  expect(s.clips['5']).toEqual({ loop: true, runs: [['5', '6']], durations: [0.05, 0.05] })
  expect(play(s, 'question', 0, 0, 5)).toEqual([0, 0])
  expect(play(s, 'coin', 0, 0, 0.12)[0]).toBe(1)
})

test('a tileset of images is a sheet of a page an image, each tile standing on its bottom left', () => {
  const s = read({ type: 'tileset', name: 'props', tilewidth: 20, tileheight: 30, tilecount: 2, columns: 0, tiles: [
    { id: 0, image: 'tree.png', imagewidth: 20, imageheight: 30 },
    { id: 3, image: 'rock.png', imagewidth: 8, imageheight: 6, type: 'rock' },
  ] }, '/p/props.tsj')
  expect(s.pages).toEqual(['/p/tree.png', '/p/rock.png'])
  expect(s.frames['3']).toMatchObject({ page: 1, box: [0, 0, 8, 6], anchor: [0, 6] })
  expect(s.clips.rock.runs).toEqual([['3']])
})

// ---------------------------------------------------------------- palettes

test('a GIMP palette is its colours as 0xRRGGBB in the file\'s order, its name, columns and comments skipped', async () => {
  expect(gpl('GIMP Palette\nName: two\nColumns: 2\n# a comment\n\n255   0  16\tred\n  0 128 255 blue\r\n', '/two.gpl')).toEqual([0xff0010, 0x0080ff])
  expect(() => gpl('JASC-PAL\n', '/x.gpl')).toThrow('palette /x.gpl does not start with the line GIMP Palette')
  expect(() => gpl('GIMP Palette\n1 2\n', '/x.gpl')).toThrow('palette /x.gpl line 2 is no colour: 1 2')
  expect(() => gpl('GIMP Palette\n1 2 300\n', '/x.gpl')).toThrow('palette /x.gpl line 2 is no colour: 1 2 300')
})

test('a palette entry is preloaded and read by a rule, and a rewrite refills the colours every reader holds', async () => {
  const url = write('fire.gpl', 'GIMP Palette\n255 0 0\n')
  let got: number[] | undefined
  const truth = boot({ world: { loader: { assets: { fire: { type: 'palette', url, preload: true } } } }, prefabs: { loader: {}, reader: {} }, actors: [{ is: 'loader' }, { is: 'reader' }] },
    { loader, reader: { tick(_me: any, _dt: number, w: any) { got = palette(w, 'fire') } } })
  await loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world)
  truth.step(DT)
  expect(got).toEqual([0xff0000])
  written(url, 'GIMP Palette\n255 0 0\n0 255 0\n')
  expect(got).toEqual([0xff0000, 0x00ff00])
})

// ---------------------------------------------------------------- Tiled maps

import * as zlib from 'node:zlib'

// Cells as Tiled writes them in base64: little-endian 32-bit gids, compressed or not.
const packed = (gids: number[], squash: (b: Buffer) => Buffer = b => b) => {
  const b = Buffer.alloc(gids.length * 4)
  gids.forEach((g, i) => b.writeUInt32LE(g >>> 0, i * 4))
  return squash(b).toString('base64')
}
const FH = 0x80000000, FV = 0x40000000, FD = 0x20000000
const CELLS = [1, 2 + FH, 0, 101 + FV, 3 + FD, 0, 0, 1 + FH + FV + FD, 0, 0, 0, 102]

const tileset = {
  type: 'tileset', name: 'land', tilewidth: 16, tileheight: 16, tilecount: 8, columns: 4, image: 'land.png', imagewidth: 64, imageheight: 32,
  tiles: [
    { id: 0, type: 'ground', properties: [{ name: 'hard', type: 'bool', value: true }], objectgroup: { type: 'objectgroup', objects: [{ id: 1, x: 0, y: 0, width: 16, height: 16, type: '' }] } },
    { id: 1, class: 'slope', objectgroup: { type: 'objectgroup', objects: [{ id: 1, x: 0, y: 0, polygon: [{ x: 0, y: 16 }, { x: 16, y: 16 }, { x: 16, y: 0 }] }] } },
    { id: 2, type: 'coin', animation: [{ tileid: 2, duration: 120 }, { tileid: 3, duration: 80 }] },
    { id: 4, objectgroup: { type: 'objectgroup', objects: [{ id: 1, x: 0, y: 0, width: 16, height: 4, type: 'top' }] } },
  ],
}
const mapOf = (more: Record<string, any> = {}): any => ({
  type: 'map', version: '1.10', orientation: 'orthogonal', renderorder: 'right-down', width: 4, height: 3, tilewidth: 16, tileheight: 16,
  infinite: false, backgroundcolor: '#5c94fc', properties: [{ name: 'music', type: 'string', value: 'overworld' }],
  tilesets: [{ firstgid: 1, source: 'land.tsj' }, { firstgid: 101, name: 'embedded', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2, image: '../art/emb.png', imagewidth: 32, imageheight: 32, tiles: [{ id: 1, type: 'brick' }] }],
  layers: [
    { type: 'tilelayer', name: 'csv', width: 4, height: 3, data: CELLS, visible: true, opacity: 1, x: 0, y: 0 },
    {
      type: 'group', name: 'fore', offsetx: 8, offsety: 4, parallaxx: 0.5, opacity: 0.5, tintcolor: '#ff0000', visible: true, layers: [
        { type: 'tilelayer', name: 'b64', width: 4, height: 3, encoding: 'base64', data: packed(CELLS), offsetx: 2, parallaxx: 0.5, parallaxy: 2, opacity: 0.5, tintcolor: '#8080ff', visible: true },
        { type: 'group', name: 'hidden', visible: false, layers: [{ type: 'tilelayer', name: 'zlib', width: 4, height: 3, encoding: 'base64', compression: 'zlib', data: packed(CELLS, zlib.deflateSync), visible: true }] },
      ],
    },
    { type: 'tilelayer', name: 'gzip', width: 4, height: 3, encoding: 'base64', compression: 'gzip', data: packed(CELLS, zlib.gzipSync), visible: true },
    { type: 'tilelayer', name: 'zstd', width: 4, height: 3, encoding: 'base64', compression: 'zstd', data: packed(CELLS, (zlib as any).zstdCompressSync), visible: true },
    { type: 'imagelayer', name: 'sky', image: 'sky.png', repeatx: true, offsetx: 3, offsety: -2, parallaxx: 0.2, visible: true, opacity: 1 },
    {
      type: 'objectgroup', name: 'things', offsetx: 16, visible: true, opacity: 1, objects: [
        { id: 1, name: 'start', type: 'hero', x: 16, y: 32, width: 16, height: 24, properties: [{ name: 'lives', type: 'int', value: 3 }] },
        { id: 2, name: 'goal', class: 'goal', x: 48, y: 8, width: 0, height: 0, point: true },
        { id: 3, name: 'hill', x: 8, y: 40, width: 0, height: 0, polygon: [{ x: 0, y: 0 }, { x: 16, y: -8 }, { x: 32, y: 0 }] },
        { id: 4, name: 'path', x: 0, y: 0, width: 0, height: 0, polyline: [{ x: 0, y: 0 }, { x: 32, y: 16 }] },
        { id: 5, name: 'pond', x: 32, y: 16, width: 16, height: 8, ellipse: true },
        { id: 6, name: '', x: 32, y: 48, width: 16, height: 16, gid: 3 + FH, properties: [{ name: 'worth', type: 'int', value: 5 }] },
      ],
    },
  ],
  ...more,
})

test('a Tiled map reads every encoding of its cells to the same gids, each cell\'s flip bits apart', async () => {
  write('land.tsj', JSON.stringify(tileset))
  const map = await tiledAt('world', write('world.tmj', JSON.stringify(mapOf())))
  const gids = [1, 2, 0, 101, 3, 0, 0, 1, 0, 0, 0, 102], flips = [0, 4, 0, 2, 1, 0, 0, 7, 0, 0, 0, 0]
  for (const name of ['csv', 'b64', 'zlib', 'gzip', 'zstd']) {
    const l = map.layers.find(l => l.name === name) as any
    expect([l.kind, l.x, l.y, l.width, l.height, l.data, l.flips]).toEqual(['tiles', 0, 0, 4, 3, gids, flips])
  }
  expect([map.orientation, map.renderorder, map.width, map.height, map.tilewidth, map.tileheight, map.infinite, map.background]).toEqual(['orthogonal', 'right-down', 4, 3, 16, 16, false, 0x5c94fc])
  expect(map.properties).toEqual({ music: 'overworld' })
})

test('a map\'s tiles are every tile of its tilesets by gid: page, box, type, properties, animation and collision shapes', async () => {
  write('land.tsj', JSON.stringify(tileset))
  const map = await tiledAt('world', write('world2.tmj', JSON.stringify(mapOf())))
  expect(map.tilesets.map(t => [t.name, t.firstgid, t.count, t.source])).toEqual([['land', 1, 8, folderUrl('land.tsj')], ['embedded', 101, 4, folderUrl('world2.tmj')]])
  expect(map.tiles[1]).toEqual({
    gid: 1, tileset: 0, id: 0, page: folderUrl('land.png'), box: [0, 0, 16, 16], type: 'ground', properties: { hard: true },
    shapes: [{ points: [[0, 0], [16, 0], [16, 16], [0, 16]], top: false }],
  })
  // Tiled 1.9's `class` is its type; a polygon written counter-clockwise goes round clockwise.
  expect(map.tiles[2]).toMatchObject({ type: 'slope', box: [16, 0, 16, 16] })
  expect(map.tiles[2].shapes[0].points).toEqual([[16, 0], [16, 16], [0, 16]])
  expect(map.tiles[3]).toMatchObject({ type: 'coin', animation: [{ tile: 3, duration: 120 }, { tile: 4, duration: 80 }], shapes: [] })
  expect(map.tiles[5].shapes).toEqual([{ points: [[0, 0], [16, 0], [16, 4], [0, 4]], top: true }])
  expect(map.tiles[102]).toMatchObject({ page: folderUrl('../art/emb.png'), box: [16, 0, 16, 16], type: 'brick' })
  expect(Object.keys(map.tiles)).toHaveLength(12)
})

test('groups are flattened into their layers: offsets added, parallax, opacity and tint multiplied, and hidden with them', async () => {
  write('land.tsj', JSON.stringify(tileset))
  const map = await tiledAt('world', write('world3.tmj', JSON.stringify(mapOf())))
  const by = (name: string) => map.layers.find(l => l.name === name)!
  expect(map.layers.map(l => l.name)).toEqual(['csv', 'b64', 'zlib', 'gzip', 'zstd', 'sky', 'things'])
  expect(by('b64')).toMatchObject({ offset: [10, 4], shift: [10 / 16, 4 / 16], parallax: [0.25, 2], opacity: 0.25, tint: 0x800000, visible: true })
  expect(by('zlib')).toMatchObject({ offset: [8, 4], parallax: [0.5, 1], opacity: 0.5, tint: 0xff0000, visible: false })
  expect(by('csv')).toMatchObject({ offset: [0, 0], shift: [0, 0], parallax: [1, 1], opacity: 1, tint: null, visible: true })
  expect(by('sky')).toEqual({ kind: 'image', name: 'sky', image: folderUrl('sky.png'), repeat: [true, false], offset: [3, -2], shift: [3 / 16, -2 / 16], parallax: [0.2, 1], opacity: 1, tint: null, visible: true, properties: {} })
})

test('objects are in cells with their layer\'s offset, a tile object by its top left with its tile\'s type and properties under its own', async () => {
  write('land.tsj', JSON.stringify(tileset))
  const map = await tiledAt('world', write('world4.tmj', JSON.stringify(mapOf())))
  const things = (map.layers.find(l => l.name === 'things') as any).objects
  expect(things).toEqual([
    { id: 1, name: 'start', type: 'hero', x: 2, y: 2, w: 1, h: 1.5, visible: true, properties: { lives: 3 } },
    { id: 2, name: 'goal', type: 'goal', x: 4, y: 0.5, w: 0, h: 0, point: true, visible: true, properties: {} },
    { id: 3, name: 'hill', type: '', x: 1.5, y: 2.5, w: 0, h: 0, polygon: [[0, 0], [1, -0.5], [2, 0]], visible: true, properties: {} },
    { id: 4, name: 'path', type: '', x: 1, y: 0, w: 0, h: 0, polyline: [[0, 0], [2, 1]], visible: true, properties: {} },
    { id: 5, name: 'pond', type: '', x: 3, y: 1, w: 1, h: 0.5, ellipse: true, visible: true, properties: {} },
    { id: 6, name: '', type: 'coin', x: 3, y: 2, w: 1, h: 1, tile: 3, flip: 4, visible: true, properties: { worth: 5 } },
  ])
})

test('an isometric map\'s objects are a tile high a cell both ways, and its offsets go on a cell\'s diamond', () => {
  const map = readMap({ ...mapOf(), orientation: 'isometric', tilewidth: 64, tileheight: 32, layers: [
    { type: 'objectgroup', name: 'o', offsetx: 32, offsety: 16, objects: [{ id: 1, name: '', x: 32, y: 64, width: 32, height: 16 }] },
  ] }, '/iso.tmj', () => tileset)
  expect(map.layers[0].shift).toEqual([1, 0])
  expect((map.layers[0] as any).objects[0]).toMatchObject({ x: 2, y: 2, w: 1, h: 0.5 })
})

test('an infinite map\'s chunks are laid into one grid starting at its first cell', async () => {
  const chunk = (x: number, y: number, first: number) => ({ x, y, width: 2, height: 2, data: packed([first, 0, 0, first + FH], zlib.deflateSync) })
  write('land.tsj', JSON.stringify(tileset))
  const url = write('endless.tmj', JSON.stringify(mapOf({ infinite: true, width: 0, height: 0, layers: [
    { type: 'tilelayer', name: 'ground', encoding: 'base64', compression: 'zlib', chunks: [chunk(-2, 0, 1), chunk(2, 2, 3)], startx: -2, starty: 0, width: 6, height: 4, visible: true },
    { type: 'tilelayer', name: 'empty', encoding: 'base64', chunks: [], visible: true },
  ] })))
  const map = await tiledAt('endless', url)
  const ground = map.layers[0] as any
  expect([ground.x, ground.y, ground.width, ground.height]).toEqual([-2, 0, 6, 4])
  expect(ground.data).toEqual([1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 3])
  expect(ground.flips[7]).toBe(4)
  expect(map.layers[1]).toMatchObject({ x: 0, y: 0, width: 0, height: 0, data: [] })
})

test('a staggered or hexagonal map, a .tmx, a .tsx tileset, a gid no tileset has and a rotated object are refused, each saying why', async () => {
  const more = () => tileset
  for (const orientation of ['staggered', 'hexagonal']) expect(() => readMap(mapOf({ orientation }), '/m.tmj', more)).toThrow(`tilemap /m.tmj is ${orientation}: tilemap reads orthogonal and isometric maps, and neither staggered nor hexagonal ones`)
  expect(() => readMap(mapOf(), '/m.tmx')).toThrow('/m.tmx is a .tmx: save as .tmj')
  expect(() => readMap(mapOf({ tilesets: [{ firstgid: 1, source: 'land.tsx' }] }), '/m.tmj')).toThrow('/land.tsx is a .tsx: save as .tsj')
  expect(() => readMap(mapOf({ layers: [{ type: 'tilelayer', name: 'x', width: 1, height: 1, data: [50] }] }), '/m.tmj', more)).toThrow('tilemap /m.tmj layer x cell 0, 0 holds tile 50, which no tileset has')
  expect(() => readMap(mapOf({ layers: [{ type: 'objectgroup', name: 'o', objects: [{ id: 9, x: 0, y: 0, rotation: 45 }] }] }), '/m.tmj', more)).toThrow('tilemap /m.tmj layer o object 9 is rotated')
  expect(() => readMap(mapOf({ layers: [{ type: 'objectgroup', name: 'o', objects: [{ id: 9, x: 0, y: 0, template: 't.tj' }] }] }), '/m.tmj', more)).toThrow('tilemap /m.tmj layer o object 9 is made from a template')
  expect(() => readMap(mapOf({ layers: [{ type: 'tilelayer', name: 'x', width: 2, height: 1, data: [1] }] }), '/m.tmj', more)).toThrow('tilemap /m.tmj layer x has 1 cells, not 2')
  expect(() => readMap(mapOf({ layers: [{ type: 'tilelayer', name: 'x', width: 1, height: 1, encoding: 'base64', compression: 'lz4', data: '' }] }), '/m.tmj', more)).toThrow('tilemap /m.tmj layer x is compressed with lz4, which is none of zlib, gzip and zstd')
  expect(() => readMap(mapOf({ layers: [{ type: 'tilelayer', name: 'x', width: 1, height: 1, data: [0] }, { type: 'tilelayer', name: 'x', width: 1, height: 1, data: [0] }] }), '/m.tmj', more)).toThrow('tilemap /m.tmj has two tile layers named x')
  const concave = { ...tileset, tiles: [{ id: 0, objectgroup: { objects: [{ id: 7, x: 0, y: 0, polygon: [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 8, y: 4 }, { x: 16, y: 16 }, { x: 0, y: 16 }] }] } }] }
  expect(() => readMap(mapOf(), '/m.tmj', () => concave)).toThrow('tileset land tile 0 collision object 7 is a polygon that is not convex')
  const round = { ...tileset, tiles: [{ id: 0, objectgroup: { objects: [{ id: 8, x: 0, y: 0, width: 16, height: 16, ellipse: true }] } }] }
  expect(() => readMap(mapOf(), '/m.tmj', () => round)).toThrow('tileset land tile 0 collision object 8 is not a rectangle or a polygon')
  await expect(tiledAt('old', write('old.tmx', '<map/>'))).rejects.toThrow('loader old: ')
})

test('a tilemap entry is preloaded with every tileset it names, and a rewritten tileset refills the map every rule holds', async () => {
  write('land.tsj', JSON.stringify(tileset))
  const url = write('live.tmj', JSON.stringify(mapOf()))
  const tsj = folderUrl('land.tsj')
  let got: any
  const truth = boot({ world: { loader: { assets: { live: { type: 'tilemap', url, preload: true } } } }, prefabs: { loader: {}, reader: {} }, actors: [{ is: 'loader' }, { is: 'reader' }] },
    { loader, reader: { tick(_me: any, _dt: number, w: any) { got = tiled(w, 'live') } } })
  await loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world)
  truth.step(DT)
  expect(got.tiles[1].type).toBe('ground')
  expect(holds(tsj)).toBe(true)
  const held = got
  written(tsj, JSON.stringify({ ...tileset, tiles: [{ ...tileset.tiles[0], type: 'stone' }, ...tileset.tiles.slice(1)] }))
  expect(held.tiles[1].type).toBe('stone')
  truth.step(DT)
  expect(got).toBe(held)
})

test('a rewritten map naming a tileset the process has not read fetches it, then refills the map', async () => {
  write('land.tsj', JSON.stringify(tileset))
  write('more.tsj', JSON.stringify({ ...tileset, name: 'more', tiles: [] }))
  const url = write('grow.tmj', JSON.stringify(mapOf()))
  const held = await tiledAt('grow', url)
  const next = mapOf()
  next.tilesets.push({ firstgid: 201, source: 'more.tsj' })
  written(url, JSON.stringify(next))
  await vi.waitFor(() => expect(held.tilesets.map(t => t.name)).toEqual(['land', 'embedded', 'more']))
})

// ---------------------------------------------------------------- pictures
//
// A PNG is read into the pixels it was written from, whatever its colour type, depth, filters and
// interlacing, with its text; what `encodePng` writes reads back the same, a pixel whose alpha is 0
// keeping its colour; and a `pixels` entry is preloaded and read by a rule.
import { png } from '#editor/test/png.ts'
import { decodePng, encodePng, pixels, pixelsAt, type Pixels } from './loader.sim.ts'

const px = (p: Pixels, x: number, y: number) => [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)]
const all = (p: Pixels) => Array.from({ length: p.height }, (_, y) => Array.from({ length: p.width }, (_, x) => px(p, x, y)))

// A 9 by 7 picture with every pixel different, so a pixel read from the wrong place shows.
const W = 9, H = 7
const colour = (x: number, y: number) => [x * 25, y * 30, (x * 7 + y * 11) % 256, (x + y) % 3 === 0 ? 0 : 255 - x - y]

test('RGBA rows filtered each of the five ways read back as they were written', () => {
  const samples = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => colour(x, y)).flat())
  const got = decodePng(png({ width: W, height: H, type: 6, depth: 8, samples, filters: [0, 1, 2, 3, 4] }))
  expect([got.width, got.height]).toEqual([W, H])
  expect(all(got)).toEqual(Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => colour(x, y))))
})

test('an Adam7 image reads as the same image written straight', () => {
  const samples = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => colour(x, y)).flat())
  const straight = decodePng(png({ width: W, height: H, type: 6, depth: 8, samples, filters: [4, 1] }))
  const laced = decodePng(png({ width: W, height: H, type: 6, depth: 8, samples, filters: [3, 2, 1], interlace: true }))
  expect(all(laced)).toEqual(all(straight))
})

test('a palette of 4 bits takes its colours and its transparency from PLTE and tRNS', () => {
  const palette: [number, number, number][] = [[0, 0, 0], [248, 0, 0], [0, 248, 0], [0, 0, 248], [255, 255, 255]]
  const index = (x: number, y: number) => (x + y) % 5
  const got = decodePng(png({ width: 5, height: 3, type: 3, depth: 4, palette, trns: [0, 128], samples: Array.from({ length: 3 }, (_, y) => Array.from({ length: 5 }, (_, x) => index(x, y))), filters: [1] }))
  expect(px(got, 0, 0)).toEqual([0, 0, 0, 0])
  expect(px(got, 1, 0)).toEqual([248, 0, 0, 128])
  expect(px(got, 3, 0)).toEqual([0, 0, 248, 255])
  expect(px(got, 4, 2)).toEqual([248, 0, 0, 128])
})

test('grey of 1 bit, grey and alpha of 16 bits and RGB with a transparent colour read as RGBA', () => {
  const bits = decodePng(png({ width: 10, height: 1, type: 0, depth: 1, samples: [[1, 0, 1, 1, 0, 0, 0, 1, 0, 1]] }))
  expect(all(bits)[0].map(p => p[0])).toEqual([255, 0, 255, 255, 0, 0, 0, 255, 0, 255])
  const deep = decodePng(png({ width: 2, height: 1, type: 4, depth: 16, samples: [[0x1234, 0xffff, 0xab00, 0x8000]], filters: [2] }))
  expect(all(deep)[0]).toEqual([[0x12, 0x12, 0x12, 255], [0xab, 0xab, 0xab, 0x80]])
  const keyed = decodePng(png({ width: 2, height: 1, type: 2, depth: 8, trns: [0, 10, 0, 20, 0, 30], samples: [[10, 20, 30, 10, 20, 31]] }))
  expect(all(keyed)[0]).toEqual([[10, 20, 30, 0], [10, 20, 31, 255]])
})

// A chunk as PNG lays one out, for a test to put text into a file the helper wrote.
const chunk = (name: string, body: Uint8Array) => {
  const out = Buffer.alloc(12 + body.length)
  out.writeUInt32BE(body.length, 0)
  out.write(name, 4, 'latin1')
  Buffer.from(body).copy(out, 8)
  out.writeUInt32BE(zlib.crc32(out.subarray(4, 8 + body.length)), 8 + body.length)
  return out
}
// A PNG with chunks put in after its header.
const withChunks = (file: Uint8Array, ...chunks: Buffer[]) => new Uint8Array(Buffer.concat([Buffer.from(file.subarray(0, 33)), ...chunks, Buffer.from(file.subarray(33))]))

test('tEXt, zTXt and iTXt, deflated or not, are read by keyword', () => {
  const file = png({ width: 1, height: 1, type: 6, depth: 8, samples: [[1, 2, 3, 4]] })
  const got = decodePng(withChunks(file,
    chunk('tEXt', Buffer.from('Title\0caf\xe9', 'latin1')),
    chunk('zTXt', Buffer.concat([Buffer.from('Comment\0\0', 'latin1'), zlib.deflateSync(Buffer.from('long ', 'latin1'))])),
    chunk('iTXt', Buffer.concat([Buffer.from('city\0\0\0en\0Stadt\0', 'latin1'), Buffer.from('Ünïcode ✓', 'utf8')])),
    chunk('iTXt', Buffer.concat([Buffer.from('packed\0\x01\0\0\0', 'latin1'), zlib.deflateSync(Buffer.from('ß'.repeat(40), 'utf8'))])),
  ))
  expect(got.text).toEqual({ Title: 'café', Comment: 'long ', city: 'Ünïcode ✓', packed: 'ß'.repeat(40) })
  expect(px(got, 0, 0)).toEqual([1, 2, 3, 4])
})

test('encodePng writes pixels and text that decodePng reads back exactly, colours under alpha 0 kept', () => {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(colour(x, y), (y * W + x) * 4)
  // A pixel of alpha 0 still holds its colour, as a value stored in the other channels must.
  data.set([200, 100, 50, 0], 0)
  const text = { city: JSON.stringify({ name: 'Nørth ✓', funds: 20000 }), 'Map v1': 'x' }
  const back = decodePng(encodePng({ width: W, height: H, data, text }))
  expect([back.width, back.height]).toEqual([W, H])
  expect([...back.data]).toEqual([...data])
  expect(back.text).toEqual(text)
})

test('encodePng reads back a picture whose rows each want a different filter', () => {
  // Flat rows, rows that rise along x, rows that repeat the one above and noise, so every filter
  // is the smallest for some row.
  const w = 64, h = 16
  const data = new Uint8ClampedArray(w * h * 4)
  let seed = 7
  const noise = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    data[(y * w + x) * 4 + c] = [5, x * 3 + c, (y >> 1) * 40 + c, noise()][y % 4]
  }
  const file = encodePng({ width: w, height: h, data, text: {} })
  expect([...decodePng(file).data]).toEqual([...data])
  // Every row's filter byte, which the zlib stream holds first on each row.
  const view = new DataView(file.buffer, file.byteOffset)
  let at = 8, idat: Uint8Array | undefined
  while (!idat) {
    const n = view.getUint32(at)
    if (String.fromCharCode(...file.subarray(at + 4, at + 8)) === 'IDAT') idat = file.subarray(at + 8, at + 8 + n)
    at += 12 + n
  }
  const filters = new Set(Array.from({ length: h }, (_, y) => zlib.inflateSync(idat!)[y * (w * 4 + 1)]))
  expect(filters.size).toBeGreaterThan(1)
})

test('encodePng refuses pixels whose data is the wrong size, and a keyword PNG cannot hold', () => {
  expect(() => encodePng({ width: 2, height: 2, data: new Uint8ClampedArray(15), text: {} })).toThrow('pixels of 2 × 2 hold 15 bytes, not 16')
  expect(() => encodePng({ width: 1, height: 1, data: new Uint8ClampedArray(4), text: { '': 'x' } })).toThrow('a PNG text keyword is 1 to 79 Latin-1 characters, not ""')
  expect(() => encodePng({ width: 1, height: 1, data: new Uint8ClampedArray(4), text: { ['k'.repeat(80)]: 'x' } })).toThrow('1 to 79')
})

test('a pixels entry is preloaded and a rule reads it, the same copy on every step', async () => {
  const data = new Uint8ClampedArray([1, 2, 3, 0, 4, 5, 6, 255])
  const url = '/' + relative(process.cwd(), join(folder, 'map.png'))
  writeFileSync(join(folder, 'map.png'), encodePng({ width: 2, height: 1, data, text: { seed: '9' } }))
  const got: Pixels[] = []
  const truth = boot({ world: { loader: { assets: { map: { type: 'pixels', url, preload: true } } } }, prefabs: { loader: {}, reader: {} }, actors: [{ is: 'loader' }, { is: 'reader' }] },
    { loader, reader: { tick(_me: any, _dt: number, w: any) { got.push(pixels(w, 'map')) } } })
  await loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world)
  truth.step(DT)
  truth.step(DT)
  expect(got[0]).toBe(got[1])
  expect([...got[0].data]).toEqual([...data])
  expect(got[0].text).toEqual({ seed: '9' })
  expect(await pixelsAt('map', url)).toBe(got[0])
})

import { binary, binaryAt, prepared } from './loader.sim.ts'

test('a binary entry is preloaded and a rule reads its bytes byte for byte, the same copy on every step', async () => {
  const bytes = new Uint8Array([0, 1, 2, 0xfe, 0xff, 0x80, 10, 13])
  const url = '/' + relative(process.cwd(), join(folder, 'rom.bin'))
  writeFileSync(join(folder, 'rom.bin'), bytes)
  const got: Uint8Array[] = []
  const truth = boot({ world: { loader: { assets: { rom: { type: 'binary', url, preload: true } } } }, prefabs: { loader: {}, reader: {} }, actors: [{ is: 'loader' }, { is: 'reader' }] },
    { loader, reader: { tick(_me: any, _dt: number, w: any) { got.push(binary(w, 'rom')) } } })
  await loader.prepare(truth.rows.find(r => r.kind === 'loader')!, truth.world)
  truth.step(DT)
  truth.step(DT)
  expect(got[0]).toBe(got[1])
  expect([...got[0]]).toEqual([...bytes])
  expect(await binaryAt('rom', url)).toBe(got[0])
})

test('prepared hands another kind\'s prepare a file its first step reads, which need not be preloaded', async () => {
  writeFileSync(join(folder, 'disk.bin'), new Uint8Array([7, 8, 9]))
  const url = '/' + relative(process.cwd(), join(folder, 'disk.bin'))
  const world = { loader: { assets: { disk: { type: 'binary', url }, notes: { type: 'json', url: write('notes.json', '{"a":1}') }, pic: { type: 'texture', url } } } }
  expect([...(await prepared(world, 'disk'))]).toEqual([7, 8, 9])
  expect(await prepared(world, 'notes')).toEqual({ a: 1 })
  await expect(prepared(world, 'gone')).rejects.toThrow('loader has no gone')
  await expect(prepared(world, 'pic')).rejects.toThrow('loader pic is a texture, which a rule does not read')
})

test('a binary file written while the game runs is read anew from the next call', async () => {
  writeFileSync(join(folder, 'cart.bin'), new Uint8Array([1, 2, 3]))
  const url = '/' + relative(process.cwd(), join(folder, 'cart.bin'))
  const world = { loader: { assets: { cart: { type: 'binary', url } } } }
  expect([...(await prepared(world, 'cart'))]).toEqual([1, 2, 3])
  written(url, new Uint8Array([4, 5]))
  expect([...(await prepared(world, 'cart'))]).toEqual([4, 5])
})

test('a pixels entry that is not a PNG fails prepare with the reason', async () => {
  const url = write('not.png', 'GIF89a')
  const truth = boot({ world: { loader: { assets: { bad: { type: 'pixels', url, preload: true } } } }, prefabs: { loader: {} }, actors: [{ is: 'loader' }] }, { loader })
  await expect(loader.prepare(truth.rows[0], truth.world)).rejects.toThrow('loader bad: not a PNG')
})

test('what a file of the loader\'s names is what the loader opens of it: a tileset\'s pictures, any .tsj being one, and a pack\'s page and other packs', () => {
  // A tileset, by its type or by being a .tsj without one, names its picture and each tile's.
  const tiles = { image: 'grass.png', tiles: [{ id: 1, image: 'one.png' }] }
  const want = [{ at: ['image'], name: 'grass.png', url: '/a/grass.png' }, { at: ['tiles', 0, 'image'], name: 'one.png', url: '/a/one.png' }]
  expect(namesIn(tiles, '/a/set.tsj')).toEqual(want)
  expect(namesIn({ ...tiles, type: 'tileset' }, '/a/set.json')).toEqual(want)
  expect(namesIn({ meta: { image: 'p.png', related_multi_packs: ['b.json'] } }, '/a/s.json').map(n => n.url)).toEqual(['/a/p.png', '/a/b.json'])
  expect(namesIn({ hall: { speed: 1 } }, '/a/defs.json')).toEqual([])
  // A file whose JSON is no object names nothing; nor does a .tmj that is no map, which readMap does
  // not open.
  for (const nothing of [null, [], 3, 'map']) expect(namesIn(nothing, '/a/nothing.json')).toEqual([])
  expect(namesIn({ tilesets: [{ firstgid: 1, source: 'set.tsj' }], layers: [] }, '/a/m.tmj')).toEqual([])
  expect(() => readMap({ tilesets: [{ firstgid: 1, source: 'set.tsj' }], layers: [] }, '/a/m.tmj')).toThrow('tilemap /a/m.tmj is no Tiled map')
})

import { mkdirSync, existsSync } from 'node:fs'
import { mount, seal, sealed, unseal } from './loader.sim.ts'

// Wads. Each test seals its files into a folder of its own, since a wad open in the process stays
// open, and every file it held is then at its path for the rest of the run.
const wadFolder = (name: string) => {
  mkdirSync(join(folder, name), { recursive: true })
  return '/' + relative(process.cwd(), join(folder, name))
}
const bytesOf = (text: string) => new TextEncoder().encode(text)
const has = (hay: Uint8Array, needle: Uint8Array) => Buffer.from(hay).indexOf(Buffer.from(needle)) !== -1

test('a wad opens to the files sealed in it, byte for byte; the same files seal to the same wad, and none of them is in it as itself', async () => {
  const page = encodePng({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]), text: { from: 'a pack nobody may hand on' } })
  const files = { 'hero.png': page, 'sheets/hero.json': bytesOf('{"meta":{"image":"../hero.png"}}'), 'empty.bin': new Uint8Array(0) }
  const wad = await seal(files)
  expect(await unseal(wad)).toEqual(files)
  expect(await seal(files)).toEqual(wad)
  expect([...wad.subarray(0, 5)]).toEqual([0x50, 0x57, 0x41, 0x44, 1])
  for (const needle of [bytesOf('a pack nobody may hand on'), bytesOf('hero.png'), bytesOf('"meta"'), page.subarray(0, 8)]) expect(has(wad, needle)).toBe(false)
  // one byte more in one file is another wad, sealed with another IV
  const other = await seal({ ...files, 'empty.bin': new Uint8Array(1) })
  expect(other.subarray(5, 17)).not.toEqual(wad.subarray(5, 17))
})

test('a wad refuses a name that is not a path from its folder, and opening what is not a wad, a later version or a damaged one says why', async () => {
  for (const name of ['', '/abs.png', '../up.png', 'a/../b.png', './a.png', 'a//b.png']) await expect(seal({ [name]: new Uint8Array(1) })).rejects.toThrow('a wad holds files by their names from its folder')
  const wad = await seal({ 'a.png': new Uint8Array([1, 2, 3]) })
  await expect(unseal(bytesOf('{"not":"a wad"}'))).rejects.toThrow('it is not a wad')
  const later = wad.slice()
  later[4] = 2
  await expect(unseal(later)).rejects.toThrow('it is a wad of version 2, and this opens version 1')
  const damaged = wad.slice()
  damaged[damaged.length - 1] ^= 1
  await expect(unseal(damaged)).rejects.toThrow('it does not open with the key')
})

test('a scene\'s wads open in prepare, and every path a wad holds is read from it, a sheet\'s page beside a json in it too, while a path it does not hold is read from disk', async () => {
  const at = wadFolder('held')
  const page = encodePng({ width: 3, height: 2, data: new Uint8ClampedArray(3 * 2 * 4).fill(200), text: {} })
  const sheetJson = JSON.stringify({ frames: [{ filename: 'coin/0', frame: { x: 0, y: 0, w: 3, h: 2 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 3, h: 2 }, sourceSize: { w: 3, h: 2 } }], meta: { image: 'coin.png', size: { w: 3, h: 2 }, frameTags: [] } })
  writeFileSync(join(folder, 'held', 'art.wad'), await seal({ 'coin.png': page, 'coin.json': bytesOf(sheetJson), 'deep/defs.json': bytesOf('{"coin":{"worth":5}}') }))
  writeFileSync(join(folder, 'held', 'plain.json'), '{"plain":true}')
  const world = {
    defs: 'defs',
    loader: {
      wads: [`${at}/art.wad`],
      assets: {
        defs: { type: 'json', url: `${at}/deep/defs.json`, preload: true },
        coin: { type: 'sheet', url: `${at}/coin.json`, preload: true },
        plain: { type: 'json', url: `${at}/plain.json`, preload: true },
        page: { type: 'pixels', url: `${at}/coin.png`, preload: true },
      },
    },
  }
  for (const name of ['coin.png', 'coin.json', 'deep']) expect(existsSync(join(folder, 'held', name))).toBe(false)
  let seen: any
  const truth = boot({ world, prefabs: { loader: {}, coin: {} }, actors: [{ is: 'loader' }, { is: 'coin' }] }, {
    loader,
    coin: { tick(me: any, _dt: number, w: any) { seen = { def: def(w, me.kind), plain: json(w, 'plain'), page: [...new Uint8Array(asset(w, 'page'))] } } },
  })
  await loader.prepare(truth.rows[0], truth.world)
  truth.step(DT)
  expect(seen).toEqual({ def: { worth: 5 }, plain: { plain: true }, page: [...page] })
  const { sheetAt } = await import('./loader.sim.ts')
  const coin = await sheetAt('coin', `${at}/coin.json`)
  expect(coin.pages).toEqual([`${at}/coin.png`])
  expect(coin.frames['coin/0'].box).toEqual([0, 0, 3, 2])
  expect(new Uint8Array((await sealed(`${at}/coin.png`))!)).toEqual(page)
  expect(await sealed(`${at}/plain.json`)).toBeUndefined()
})

test('a read waits for a wad that has started opening, so a path it holds is never read from disk first', async () => {
  const at = wadFolder('waits')
  writeFileSync(join(folder, 'waits', 'late.wad'), await seal({ 'late.json': bytesOf('{"from":"the wad"}') }))
  const { jsonAt } = await import('./loader.sim.ts')
  const opening = mount({ loader: { wads: [`${at}/late.wad`] } })
  expect(await jsonAt('late', `${at}/late.json`)).toEqual({ from: 'the wad' })
  await opening
})

test('a wad that cannot be read or opened fails prepare saying which and why, reads go on without it, and it is read again on the next prepare', async () => {
  const at = wadFolder('broken')
  writeFileSync(join(folder, 'broken', 'here.json'), '{"here":true}')
  const world = { loader: { wads: [`${at}/gone.wad`], assets: { here: { type: 'json', url: `${at}/here.json`, preload: true } } } }
  const truth = boot({ world, prefabs: { loader: {} }, actors: [{ is: 'loader' }] }, { loader })
  await expect(loader.prepare(truth.rows[0], truth.world)).rejects.toThrow(`loader wad ${at}/gone.wad: loader could not read ${at}/gone.wad: ENOENT`)
  const { jsonAt } = await import('./loader.sim.ts')
  expect(await jsonAt('here', `${at}/here.json`)).toEqual({ here: true })
  writeFileSync(join(folder, 'broken', 'gone.wad'), bytesOf('PWAD\x01twelve bytes and nothing sealed'))
  await expect(loader.prepare(truth.rows[0], truth.world)).rejects.toThrow(`loader wad ${at}/gone.wad: it does not open with the key`)
  writeFileSync(join(folder, 'broken', 'gone.wad'), await seal({ 'found.json': bytesOf('{"found":1}') }))
  await loader.prepare(truth.rows[0], truth.world)
  expect(await jsonAt('found', `${at}/found.json`)).toEqual({ found: 1 })
})

test('in a tab a wad is fetched once, encoded once, and a path it holds is never fetched', async () => {
  const at = '/games/tab game/assets'
  const wad = await seal({ 'hero sheet.json': bytesOf('{"hero":1}') })
  const asked: string[] = []
  vi.stubGlobal('location', { href: 'http://page/' })
  vi.stubGlobal('fetch', async (u: string) => {
    asked.push(u)
    return u === encodeURI(`${at}/art.wad`) ? new Response(new Blob([wad as Uint8Array<ArrayBuffer>])) : new Response('{"fetched":true}')
  })
  try {
    const { jsonAt } = await import('./loader.sim.ts')
    await Promise.all([mount({ loader: { wads: [`${at}/art.wad`] } }), mount({ loader: { wads: [`${at}/art.wad`] } })])
    expect(await jsonAt('hero', `${at}/hero sheet.json`)).toEqual({ hero: 1 })
    expect(await jsonAt('other', `${at}/other.json`)).toEqual({ fetched: true })
    expect(asked).toEqual([encodeURI(`${at}/art.wad`), encodeURI(`${at}/other.json`)])
  } finally {
    vi.unstubAllGlobals()
  }
})
