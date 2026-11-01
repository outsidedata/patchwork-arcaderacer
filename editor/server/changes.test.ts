// The server's changes, on a repo of their own: a change whole or not at all, applied in the order
// asked for, taken back and made again byte for byte for each kind of op, taken back value by value
// where a JSON file changed since and refused where a whole file did, a route's writes part of its
// change and the JSON values it sets values of it, the record read back by a new `Changes` on the same folder, the oldest pruned, and an
// unknown change refused by its id.
import { afterAll, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Changes, KEPT, type Answer, type Changed } from './changes.ts'
import { edit, Files } from './files.ts'
import type { RouteFiles } from './routes.ts'

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'editor-changes-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const files = new Files(root)

// The routes a change may run, by `<owner>/<route>`, as a route of an extension's is handed the
// change's files.
const routes: { [route: string]: (body: unknown, files: RouteFiles) => Promise<unknown> } = {}
const call = (owner: string, route: string, body: unknown, f: RouteFiles) => routes[`${owner}/${route}`](body, f)
// The changes kept in `folder` of the repo's cache, as the server keeps them.
const open = (folder: string) => new Changes(files, path.join(root, 'node_modules/.cache/editor', folder), call)

const at = (rel: string) => path.join(root, rel)
// A file's bytes, or null when there is none.
const bytes = (rel: string) => (existsSync(at(rel)) ? readFileSync(at(rel)) : null)
const put = (rel: string, data: string | Uint8Array) => {
  mkdirSync(path.dirname(at(rel)), { recursive: true })
  writeFileSync(at(rel), data)
}
// An answer that is no refusal.
const made = (a: Answer): Changed => {
  if ('error' in a) throw new Error(a.error)
  return a
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a change is whole or not at all: an op that throws puts back every file written before it, a route\'s too, and nothing is kept', async () => {
  const c = open('whole')
  put('games/w/a.json', '{\n  "x": 1,\n  "y": [1, 2]\n}\n')
  const a = bytes('games/w/a.json')
  routes['t/half'] = async (_body, f) => {
    await f.write('games/w/a.json', 'broken')
    await f.write('games/w/made.bin', new Uint8Array([1, 2]))
    throw new Error('half way')
  }
  expect(await c.change('w1', [
    { json: 'games/w/a.json', at: ['x'], value: 2 },
    { text: 'games/w/new.txt', value: 'new' },
    { json: 'games/w/missing.json', at: ['x'], value: 1 },
  ])).toMatchObject({ id: 'w1', error: expect.stringContaining('missing.json') })
  expect([bytes('games/w/a.json'), bytes('games/w/new.txt')]).toEqual([a, null])
  expect(await c.change('w2', [{ json: 'games/w/a.json', at: ['y', -1], value: 3, insert: true }, { route: { owner: 't', route: 'half', body: {} } }])).toEqual({ id: 'w2', error: 'half way' })
  expect([bytes('games/w/a.json'), bytes('games/w/made.bin')]).toEqual([a, null])
  // Neither is kept, nor counted.
  expect(await c.undo('w1')).toEqual({ id: 'w1', error: 'no change w1 is kept' })
  expect(await c.undo('w2')).toEqual({ id: 'w2', error: 'no change w2 is kept' })
  expect(c.version).toBe(0)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('changes, undos and redos are applied one at a time, in the order they are asked for, an undo asked for as its change is still being made after it', async () => {
  const c = open('order')
  put('games/o/n.json', '{ "n": 0 }\n')
  put('games/o/slow.txt', 'before')
  const was = [bytes('games/o/n.json'), bytes('games/o/slow.txt')]
  routes['t/slow'] = async (body, f) => {
    await new Promise(r => setTimeout(r, 50))
    await f.write('games/o/slow.txt', String(body))
    return { wrote: body }
  }
  const answers = await Promise.all([
    c.change('o1', [{ route: { owner: 't', route: 'slow', body: 'after' } }]),
    c.undo('o1'),
    c.change('o2', [{ json: 'games/o/n.json', at: ['n'], value: 1 }]),
    c.change('o3', [{ json: 'games/o/n.json', at: ['n'], value: 2 }]),
    c.undo('o3'),
    c.undo('o2'),
    c.redo('o2'),
  ])
  expect(answers.map(a => [a.id, made(a).version])).toEqual([['o1', 1], ['o1', 2], ['o2', 3], ['o3', 4], ['o3', 5], ['o2', 6], ['o2', 7]])
  expect(answers[0]).toMatchObject({ files: { 'games/o/slow.txt': 'after' }, answers: [{ wrote: 'after' }] })
  expect(bytes('games/o/slow.txt')).toEqual(was[1])
  expect(readFileSync(at('games/o/n.json'), 'utf8')).toBe('{ "n": 1 }\n')
  expect(made(await c.undo('o2')).files).toEqual({ 'games/o/n.json': '{ "n": 0 }\n' })
  expect(bytes('games/o/n.json')).toEqual(was[0])
  // A change on the disk that no change made is counted too.
  c.outside()
  expect(made(await c.redo('o2')).version).toBe(10)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an undo puts every file back byte for byte, and a redo writes it as the change did, for each kind of op', async () => {
  const c = open('bytes')
  // JSON values: a number written `1.0`, a key taken out of the middle, an item put on a list's end, and
  // a key put in first.
  const json = '{\n  "a": 1.0,\n  "mid": { "k": [1, 2] },\n  "list": [\n    { "k": 0 }\n  ],\n  "z": "end"\n}\n'
  put('games/b/v.json', json)
  const ops = made(await c.change('j', [
    { json: 'games/b/v.json', at: ['a'], value: 2 },
    { json: 'games/b/v.json', at: ['mid'] },
    { json: 'games/b/v.json', at: ['list', -1], value: { k: 1 }, insert: true },
    { json: 'games/b/v.json', at: ['first'], value: true, index: 0 },
  ]))
  const after = readFileSync(at('games/b/v.json'), 'utf8')
  expect(after).toBe('{\n  "first": true,\n  "a": 2,\n  "list": [\n    { "k": 0 },\n    { "k": 1 }\n  ],\n  "z": "end"\n}\n')
  expect(ops).toEqual({ id: 'j', version: expect.any(Number), files: { 'games/b/v.json': after }, answers: [] })
  expect(made(await c.undo('j')).files).toEqual({ 'games/b/v.json': json })
  expect(readFileSync(at('games/b/v.json'), 'utf8')).toBe(json)
  await c.redo('j')
  expect(readFileSync(at('games/b/v.json'), 'utf8')).toBe(after)
  await c.undo('j')
  expect(readFileSync(at('games/b/v.json'), 'utf8')).toBe(json)

  // Whole text files: one written over, one made, one taken away; code among them, which a page that
  // has imported it reloads for, as it says itself.
  put('games/b/rule.ts', 'export const n = 1\r\n')
  put('games/b/gone.md', '# gone\n')
  const texts = { 'games/b/rule.ts': bytes('games/b/rule.ts'), 'games/b/gone.md': bytes('games/b/gone.md'), 'games/b/new.txt': null }
  expect(made(await c.change('t', [
    { text: 'games/b/rule.ts', value: 'export const n = 2\n' },
    { text: 'games/b/new.txt', value: 'new' },
    { text: 'games/b/gone.md', value: null },
  ]))).toMatchObject({ files: { 'games/b/rule.ts': 'export const n = 2\n', 'games/b/new.txt': 'new', 'games/b/gone.md': null } })
  expect(made(await c.undo('t'))).toMatchObject({ files: { 'games/b/rule.ts': 'export const n = 1\r\n', 'games/b/new.txt': null, 'games/b/gone.md': '# gone\n' } })
  expect(Object.fromEntries(Object.keys(texts).map(f => [f, bytes(f)]))).toEqual(texts)
  await c.redo('t')
  expect([bytes('games/b/rule.ts')?.toString(), bytes('games/b/new.txt')?.toString(), bytes('games/b/gone.md')]).toEqual(['export const n = 2\n', 'new', null])

  // A whole file's bytes, which are no text: listed with none.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255])
  put('games/b/pic.png', new Uint8Array([0x89, 1]))
  expect(made(await c.change('p', [{ bytes: 'games/b/pic.png', value: Buffer.from(png).toString('base64') }, { bytes: 'games/b/old.png', value: null }])).files)
    .toEqual({ 'games/b/pic.png': null, 'games/b/old.png': null })
  expect([...bytes('games/b/pic.png')!]).toEqual([...png])
  await c.undo('p')
  expect([...bytes('games/b/pic.png')!]).toEqual([0x89, 1])
  await c.redo('p')
  expect([...bytes('games/b/pic.png')!]).toEqual([...png])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an undo after the file changed since takes a JSON file back value by value, and refuses a whole file, naming it, writing nothing', async () => {
  const c = open('since')
  const json = '{\n  "x": 1.0,\n  "y": 1\n}\n'
  put('games/s/a.json', json)
  made(await c.change('v', [{ json: 'games/s/a.json', at: ['x'], value: 2 }]))
  // Changed by hand, another value of the file.
  put('games/s/a.json', edit(readFileSync(at('games/s/a.json'), 'utf8'), ['y'], 5))
  await c.undo('v')
  expect(readFileSync(at('games/s/a.json'), 'utf8')).toBe('{\n  "x": 1.0,\n  "y": 5\n}\n')
  await c.redo('v')
  expect(readFileSync(at('games/s/a.json'), 'utf8')).toBe('{\n  "x": 2,\n  "y": 5\n}\n')
  // Nothing changed since, it goes by the bytes again.
  await c.undo('v')
  expect(readFileSync(at('games/s/a.json'), 'utf8')).toBe('{\n  "x": 1.0,\n  "y": 5\n}\n')

  // A change of a JSON value and a whole text file, the text changed by hand: refused whole.
  put('games/s/b.json', '{ "k": 1 }\n')
  put('games/s/t.txt', 'one')
  made(await c.change('w', [{ json: 'games/s/b.json', at: ['k'], value: 2 }, { text: 'games/s/t.txt', value: 'two' }]))
  put('games/s/t.txt', 'three')
  expect(await c.undo('w')).toEqual({ id: 'w', error: 'games/s/t.txt has changed since w was made, so it is not taken back' })
  expect([readFileSync(at('games/s/b.json'), 'utf8'), readFileSync(at('games/s/t.txt'), 'utf8')]).toEqual(['{ "k": 2 }\n', 'three'])
  // Put back by hand as the change left it, it is taken back; changed again, it is not made again.
  put('games/s/t.txt', 'two')
  made(await c.undo('w'))
  expect([readFileSync(at('games/s/b.json'), 'utf8'), readFileSync(at('games/s/t.txt'), 'utf8')]).toEqual(['{ "k": 1 }\n', 'one'])
  put('games/s/t.txt', 'four')
  expect(await c.redo('w')).toEqual({ id: 'w', error: 'games/s/t.txt has changed since w was taken back, so it is not made again' })
  expect([readFileSync(at('games/s/b.json'), 'utf8'), readFileSync(at('games/s/t.txt'), 'utf8')]).toEqual(['{ "k": 1 }\n', 'four'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('every file a route writes or takes away is part of its change, and taken back and made again with it', async () => {
  const c = open('route')
  put('games/r/r.json', '{ "made": [] }\n')
  put('games/r/old.txt', 'old')
  const was = { 'games/r/r.json': bytes('games/r/r.json'), 'games/r/old.txt': bytes('games/r/old.txt'), 'games/r/pic.png': null }
  routes['t/make'] = async (body, f) => {
    const name = (body as { name: string }).name
    const scene = JSON.parse(await f.read('games/r/r.json')) as { made: string[] }
    await Promise.all([
      f.write('games/r/r.json', JSON.stringify({ made: [...scene.made, name] })),
      f.write('games/r/pic.png', new Uint8Array([0x89, 0, 1])),
      f.remove('games/r/old.txt'),
    ])
    return { made: name }
  }
  expect(made(await c.change('r', [{ route: { owner: 't', route: 'make', body: { name: 'imp' } } }]))).toMatchObject({
    files: { 'games/r/r.json': '{"made":["imp"]}', 'games/r/pic.png': null, 'games/r/old.txt': null },
    answers: [{ made: 'imp' }],
  })
  const after = Object.fromEntries(Object.keys(was).map(f => [f, bytes(f)]))
  await c.undo('r')
  expect(Object.fromEntries(Object.keys(was).map(f => [f, bytes(f)]))).toEqual(was)
  await c.redo('r')
  expect(Object.fromEntries(Object.keys(was).map(f => [f, bytes(f)]))).toEqual(after)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a JSON value a route sets is a value of its change, as a json op\'s is: taken back byte for byte, and value by value once the file has changed since; one set before the route throws is put back', async () => {
  const c = open('route-values')
  const json = '{\n  "a": 1.0,\n  "list": [1]\n}\n'
  put('games/v/v.json', json)
  routes['t/set'] = async (_body, f) => {
    await f.edit('games/v/v.json', ['a'], 2)
    await f.edit('games/v/v.json', ['list', -1], 2, true)
    await f.edit('games/v/v.json', ['b'], { k: 1 })
  }
  const after = '{\n  "a": 2,\n  "list": [1, 2],\n  "b": { "k": 1 }\n}\n'
  expect(made(await c.change('s', [{ route: { owner: 't', route: 'set', body: {} } }])).files).toEqual({ 'games/v/v.json': after })
  await c.undo('s')
  expect(readFileSync(at('games/v/v.json'), 'utf8')).toBe(json)
  await c.redo('s')
  expect(readFileSync(at('games/v/v.json'), 'utf8')).toBe(after)
  // Changed by hand, another value of the file: the route's values alone are taken back.
  put('games/v/v.json', edit(after, ['list', 0], 5))
  made(await c.undo('s'))
  expect(readFileSync(at('games/v/v.json'), 'utf8')).toBe('{\n  "a": 1.0,\n  "list": [5]\n}\n')

  put('games/v/w.json', json)
  routes['t/throws'] = async (_body, f) => {
    await f.edit('games/v/w.json', ['a'], 2)
    throw new Error('after a value')
  }
  expect(await c.change('t', [{ route: { owner: 't', route: 'throws', body: {} } }])).toEqual({ id: 't', error: 'after a value' })
  expect(readFileSync(at('games/v/w.json'), 'utf8')).toBe(json)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the record survives the server starting again: a new Changes on the same folder takes back and makes again a change made before', async () => {
  put('games/k/k.json', '{ "k": 1 }\n')
  const json = bytes('games/k/k.json')
  made(await open('kept').change('k1', [{ json: 'games/k/k.json', at: ['k'], value: 2 }]))
  const again = open('kept')
  await again.undo('k1')
  expect(bytes('games/k/k.json')).toEqual(json)
  made(await again.change('k2', [{ text: 'games/k/t.txt', value: 't' }]))
  const third = open('kept')
  made(await third.redo('k1'))
  made(await third.undo('k2'))
  expect([readFileSync(at('games/k/k.json'), 'utf8'), bytes('games/k/t.txt')]).toEqual(['{ "k": 2 }\n', null])
})

// Two thousand and one changes written to the disk, each with its record: as long as the disk takes,
// the more so beside other tests, so given far longer than one change.
// OCT-24-EDITOR-ALPHA-SWEEP
test.skip(`the last ${KEPT} changes are kept, and the oldest taken away`, async () => {
  const c = open('pruned')
  const answers = await Promise.all(Array.from({ length: KEPT + 1 }, (_, i) => c.change(`p${i}`, [{ text: 'games/p/p.txt', value: String(i) }])))
  answers.forEach(made)
  expect(readdirSync(path.join(root, 'node_modules/.cache/editor/pruned'))).toHaveLength(KEPT)
  expect(await c.undo('p0')).toEqual({ id: 'p0', error: 'no change p0 is kept' })
  made(await c.undo(`p${KEPT}`))
  // So too for one that reads them back.
  const again = open('pruned')
  expect(await again.redo('p0')).toEqual({ id: 'p0', error: 'no change p0 is kept' })
  expect(await again.redo('p1')).toEqual({ id: 'p1', error: 'p1 is not taken back' })
  made(await again.redo(`p${KEPT}`))
}, 60_000)

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an undo or a redo of a change never made is refused, naming it, as is a change named as one made already, or taken back twice', async () => {
  const c = open('unknown')
  expect(await c.undo('nobody')).toEqual({ id: 'nobody', error: 'no change nobody is kept' })
  expect(await c.redo('nobody')).toEqual({ id: 'nobody', error: 'no change nobody is kept' })
  put('games/u/u.txt', 'u')
  made(await c.change('u', [{ text: 'games/u/u.txt', value: 'v' }]))
  expect(await c.change('u', [{ text: 'games/u/u.txt', value: 'w' }])).toEqual({ id: 'u', error: 'a change u is made already' })
  expect(await c.redo('u')).toEqual({ id: 'u', error: 'u is not taken back' })
  made(await c.undo('u'))
  expect(await c.undo('u')).toEqual({ id: 'u', error: 'u is taken back already' })
  expect(readFileSync(at('games/u/u.txt'), 'utf8')).toBe('u')
})
