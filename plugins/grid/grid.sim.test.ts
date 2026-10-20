// The grid's rows and questions, on a scene this test writes: a map 32 across and 16 down in chunks
// of 8, so 4 × 2 chunks, with a layer of 8 bits, one of 16 and one of 4 bits kept per 4 × 4 block. A
// `writer` row runs whatever a test hands it on its tick, the way a rule would.
import { expect, test } from 'vitest'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { delta } from '#addons/scenemanager/scenemanager.addon.ts'
import { cells, decode, encode, fill, grid, picture, spec } from './grid.sim.ts'

const DT = 1
const layers = { ground: { bits: 8 }, lot: { bits: 16 }, fog: { bits: 4, scale: 4 } }
const sceneOf = (g: any = { size: [32, 16], chunk: 8, layers }, actors: any[] = [{ is: 'grid' }, { is: 'writer' }]): Scene => ({
  world: { grid: g },
  prefabs: { grid: { k: 0, cells: {} }, writer: {} },
  actors,
})
let job: (w: W) => void = () => {}
const sim = { grid, writer: { tick: (_me: Row, _dt: number, w: W) => job(w) } }
const chunkRows = (truth: ReturnType<typeof boot>) => truth.rows.filter(r => r.kind === 'grid').sort((a, b) => a.data.k - b.data.k)

test('a value is six bits a character, the highest first, in characters JSON writes as they are', () => {
  expect(encode(0, 1)).toBe('A')
  expect(encode(63, 1)).toBe('_')
  expect(encode(64, 2)).toBe('BA')
  expect(encode(65535, 3)).toBe('P__')
  expect(decode('xP__', 1, 3)).toBe(65535)
  expect(JSON.stringify(encode(2 ** 30 - 1, 5))).toBe('"_____"')
  expect(() => decode('A!', 0, 2)).toThrow('grid string holds "!", which is no digit of a value')
})

test('chunk 0 makes every chunk on the first step, every value 0, before any tick reads them', () => {
  const truth = boot(sceneOf(), sim)
  const seen: number[] = []
  job = w => { const c = cells(w); seen.push(c.get('ground', 31, 15), c.get('lot', 0, 8), c.get('fog', 20, 3)) }
  truth.step(DT)
  expect(seen).toEqual([0, 0, 0])
  const rows = chunkRows(truth)
  expect(rows.map(r => r.data.k)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  for (const r of rows) {
    expect(r.data.cells.ground).toBe('A'.repeat(64 * 2))
    expect(r.data.cells.lot).toBe('A'.repeat(64 * 3))
    expect(r.data.cells.fog).toBe('A'.repeat(4))
  }
  job = () => {}
  truth.step(DT)
  expect(chunkRows(truth)).toHaveLength(8)
})

test('a rule whose row runs before the grid\'s reads the whole map in its first before, and the page is sent it whole', () => {
  const scene = sceneOf(undefined, [{ is: 'early' }, { is: 'grid' }])
  const truth = boot({ ...scene, prefabs: { ...scene.prefabs, early: {} } }, { grid, early: { before: (_me: Row, _dt: number, w: W) => job(w) } })
  const seat = truth.open()
  const seen: number[] = []
  job = w => { const c = cells(w); seen.push(c.get('ground', 31, 15), c.get('lot', 0, 8), c.get('fog', 20, 3)) }
  truth.step(DT)
  expect(seen).toEqual([0, 0, 0])
  const sent = truth.packet(seat).rows.filter(r => r.kind === 'grid').sort((a, b) => a.data.k - b.data.k)
  expect(sent.map(r => r.data.k)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  expect(sent.every(r => Object.keys(r.data.cells).sort().join() === 'fog,ground,lot')).toBe(true)
  job = () => {}
})

test('a value set is read back, and only its own chunk\'s string of its own layer changes', () => {
  const truth = boot(sceneOf(), sim)
  job = () => {}
  truth.step(DT)
  const before = structuredClone(chunkRows(truth).map(r => r.data))
  job = w => cells(w).set('lot', 13, 9, 40000)
  truth.step(DT)
  const after = chunkRows(truth).map(r => r.data)
  // [13, 9] is in chunk 1 across, 1 down: chunk 5, row 1 of it, column 5, value 13 of the string.
  after.forEach((d, k) => {
    if (k !== 5) expect(d).toEqual(before[k])
    else {
      expect(d.cells.ground).toBe(before[k].cells.ground)
      expect(d.cells.lot).toBe('A'.repeat(13 * 3) + encode(40000, 3) + 'A'.repeat(50 * 3))
    }
  })
  let got = -1
  job = w => { got = cells(w).get('lot', 13, 9) }
  truth.step(DT)
  expect(got).toBe(40000)
})

test('a layer of scale 4 holds one value per 4 × 4 block: every cell of the block reads it', () => {
  const truth = boot(sceneOf(), sim)
  let block: number[] = []
  job = w => {
    const c = cells(w)
    c.set('fog', 21, 6, 9)
    block = [20, 21, 22, 23].flatMap(x => [4, 5, 6, 7].map(y => c.get('fog', x, y)))
    block.push(c.get('fog', 24, 6), c.get('fog', 19, 6), c.get('fog', 21, 8))
  }
  truth.step(DT)
  expect(block).toEqual([...Array(16).fill(9), 0, 0, 0])
  // Block [1, 1] of chunk 2, the chunk of cells 16 to 23 across and 0 to 7 down.
  expect(chunkRows(truth)[2].data.cells.fog).toBe('AAAJ')
})

test('a cell outside the map, a layer the scene has not, and a value the layer cannot hold each throw', () => {
  const truth = boot(sceneOf(), sim)
  job = () => {}
  truth.step(DT)
  const fails: string[] = []
  job = w => {
    const c = cells(w)
    for (const f of [() => c.get('ground', 32, 0), () => c.get('ground', -1, 0), () => c.get('ground', 1.5, 0), () => c.get('water', 0, 0),
      () => c.set('ground', 0, 0, 256), () => c.set('ground', 0, 0, -1), () => c.set('ground', 0, 0, 0.5), () => c.set('fog', 0, 0, 16)]) {
      try { f() } catch (e) { fails.push((e as Error).message) }
    }
  }
  truth.step(DT)
  expect(fails).toEqual([
    'cell [32, 0] is not inside the grid of 32 × 16',
    'cell [-1, 0] is not inside the grid of 32 × 16',
    'cell [1.5, 0] is not inside the grid of 32 × 16',
    'the grid has no layer water',
    '256 is not a value of ground, a whole number from 0 to 255',
    '-1 is not a value of ground, a whole number from 0 to 255',
    '0.5 is not a value of ground, a whole number from 0 to 255',
    '16 is not a value of fog, a whole number from 0 to 15',
  ])
  expect(truth.rows.find(r => r.kind === 'grid')!.data.cells.ground).toBe('A'.repeat(128))
})

test('world.grid is checked: its chunk, a size of whole chunks, and each layer\'s bits and scale', () => {
  expect(() => spec({})).toThrow('the scene\'s world has no grid')
  expect(() => spec({ grid: { size: [32, 16], chunk: 0, layers } })).toThrow('world.grid.chunk is 0, not a whole number above 0')
  expect(() => spec({ grid: { size: [30, 16], chunk: 8, layers } })).toThrow('world.grid.size is [30,16], not [w, h] of whole chunks of 8')
  expect(() => spec({ grid: { size: [32, 16], chunk: 8, layers: {} } })).toThrow('world.grid.layers names no layer')
  expect(() => spec({ grid: { size: [32, 16], chunk: 8, layers: { a: { bits: 31 } } } })).toThrow('world.grid.layers.a.bits is 31, not a whole number from 1 to 30')
  expect(() => spec({ grid: { size: [32, 16], chunk: 8, layers: { a: { bits: 4, scale: 3 } } } })).toThrow('world.grid.layers.a.scale is 3, not a whole number a chunk of 8 is made of')
  expect(spec({ grid: { size: [32, 16], chunk: 8, layers } }).layers.ground).toEqual({ bits: 8, scale: 1 })
})

test('chunks already rows, as persist spawns its records, are kept; a layer they lack is added at 0', () => {
  const kept = Array.from({ length: 8 }, (_, k) => ({ is: 'grid', k, cells: { ground: encode(k, 2).repeat(64), lot: 'A'.repeat(192) } }))
  const truth = boot(sceneOf(undefined, [...kept, { is: 'writer' }]), sim)
  let read: number[] = []
  job = w => { const c = cells(w); read = [c.get('ground', 0, 0), c.get('ground', 31, 15), c.get('fog', 31, 15)] }
  truth.step(DT)
  expect(chunkRows(truth)).toHaveLength(8)
  expect(read).toEqual([0, 7, 0])
  expect(chunkRows(truth).every(r => r.data.cells.fog === 'AAAA')).toBe(true)
})

test('one cell set crosses the wire as one layer\'s string of one chunk', () => {
  const truth = boot(sceneOf(), sim)
  const seat = truth.open()
  job = () => {}
  truth.step(DT)
  const base = truth.packet(seat).rows
  job = w => cells(w).set('ground', 2, 2, 200)
  truth.step(DT)
  const d = delta(base, truth.packet(seat).rows)
  expect(d.add).toEqual([])
  expect(d.drop).toEqual([])
  expect(d.change).toHaveLength(1)
  expect(d.change[0].set.map(([path]) => path)).toEqual([['cells', 'ground']])
})

test('the rows of a packet, handed with the world, read as the truth\'s', () => {
  const truth = boot(sceneOf(), sim)
  const seat = truth.open()
  job = w => { const c = cells(w); c.set('ground', 30, 14, 77); c.set('fog', 1, 1, 3) }
  truth.step(DT)
  const c = cells({ world: truth.world, rows: truth.packet(seat).rows })
  expect([c.get('ground', 30, 14), c.get('fog', 3, 3), c.get('ground', 0, 0)]).toEqual([77, 3, 0])
  expect(c.layers).toEqual(['ground', 'lot', 'fog'])
})

// A grid with every cell of every layer set from its place, so a value read from the wrong place
// or the wrong bits shows.
const valueAt = (layer: string, x: number, y: number) => layer === 'ground' ? (x * 7 + y * 3) % 256 : layer === 'lot' ? (x * 1013 + y * 57) % 65536 : (x + y) % 16
function painted(g?: any) {
  const truth = boot(sceneOf(g), sim)
  job = w => {
    const c = cells(w)
    for (const name of c.layers) for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) c.set(name, x, y, valueAt(name, x, y) % 2 ** (spec(w.world).layers[name].bits))
  }
  truth.step(DT)
  job = () => {}
  return truth
}

test('a grid written as a picture and filled from it is the same grid', () => {
  const from = painted()
  const p = picture({ world: from.world, rows: from.rows })
  // 8 + 16 + 4 bits fit one plane of 32.
  expect([p.width, p.height]).toEqual([32, 16])
  expect(JSON.parse(p.text.grid)).toEqual([{ name: 'ground', bits: 8, scale: 1 }, { name: 'lot', bits: 16, scale: 1 }, { name: 'fog', bits: 4, scale: 4 }])
  // Red is ground; green and blue are lot, low byte first; fog is alpha's low 4 bits, the value of
  // the block [4, 8] to [7, 11] that its last cell painted, [7, 11].
  const o = (9 * 32 + 5) * 4
  expect([...p.data.subarray(o, o + 4)]).toEqual([valueAt('ground', 5, 9), valueAt('lot', 5, 9) & 255, valueAt('lot', 5, 9) >> 8, valueAt('fog', 7, 11)])
  const to = boot(sceneOf(), sim)
  job = w => fill(w, p)
  to.step(DT)
  expect(chunkRows(to).map(r => r.data)).toEqual(chunkRows(from).map(r => r.data))
})

test('layers past 32 bits start a second plane, under the first', () => {
  const g = { size: [32, 16], chunk: 8, layers: { ground: { bits: 8 }, lot: { bits: 16 }, deep: { bits: 12 } } }
  const from = painted(g)
  const p = picture({ world: from.world, rows: from.rows })
  expect([p.width, p.height]).toEqual([32, 32])
  const to = boot(sceneOf(g), sim)
  job = w => fill(w, p)
  to.step(DT)
  expect(chunkRows(to).map(r => r.data)).toEqual(chunkRows(from).map(r => r.data))
})

test('a picture is read by its layers\' names: one the scene has not is left out, one it lacks is 0, other bits throw', () => {
  const from = painted({ size: [32, 16], chunk: 8, layers: { lot: { bits: 16 }, gone: { bits: 3 }, ground: { bits: 8 } } })
  const p = picture({ world: from.world, rows: from.rows })
  let read: number[] = []
  const to = boot(sceneOf(), sim)
  job = w => { fill(w, p); const c = cells(w); read = [c.get('ground', 5, 9), c.get('lot', 5, 9), c.get('fog', 5, 9)] }
  to.step(DT)
  expect(read).toEqual([valueAt('ground', 5, 9), valueAt('lot', 5, 9), 0])
  const other = boot(sceneOf({ size: [32, 16], chunk: 8, layers: { lot: { bits: 16 }, ground: { bits: 7 } } }), sim)
  job = () => {}
  other.step(DT)
  job = w => fill(w, p)
  expect(() => other.step(DT)).toThrow('the picture\'s layer ground is 8 bits at scale 1, and the scene\'s 7 bits at scale 1')
  // Nothing was written: the lot layer, which comes first and fits, is as it was.
  let lot = -1
  job = w => { lot = cells(w).get('lot', 5, 9) }
  other.step(DT)
  expect(lot).toBe(0)
})

test('a picture with no grid text is read as the scene\'s layers in the scene\'s order, and one of another size throws', () => {
  // A height map as an image program paints one: red the ground, the rest 0.
  const data = new Uint8ClampedArray(32 * 16 * 4)
  for (let i = 0; i < 32 * 16; i++) data[i * 4] = i % 200
  let read: number[] = []
  const truth = boot(sceneOf(), sim)
  job = w => { fill(w, { width: 32, height: 16, data, text: {} }); const c = cells(w); read = [c.get('ground', 3, 1), c.get('lot', 3, 1)] }
  truth.step(DT)
  expect(read).toEqual([35, 0])
  job = w => fill(w, { width: 16, height: 16, data: new Uint8ClampedArray(16 * 16 * 4), text: {} })
  expect(() => truth.step(DT)).toThrow('a picture of 16 × 16 holds no grid of 32 × 16 in 1 plane')
})
