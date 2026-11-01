// The editor's files: a JSON edit changes only the value it names and is taken back byte for byte,
// and no path leaves the repo or reaches node_modules or .git, by name or through a symlink.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { edit, Files, splice, valueAt } from './files.ts'

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a member taken out goes with its comma and its space, and one put in is written as its neighbours are, and nothing else changes', () => {
  const text = '{\n  "o": { "a": 1, "b": [1, 2], "c": 3 },\n  "l": [1, 2],\n  "p": {\n    "x": [1, 2],\n    "y": {\n      "z": 1\n    }\n  },\n  "e": {}\n}\n'
  expect(edit(text, ['o', 'a'], undefined)).toBe(text.replace('"a": 1, ', ''))
  expect(edit(text, ['o', 'b'], undefined)).toBe(text.replace(', "b": [1, 2]', ''))
  expect(edit(text, ['o', 'c'], undefined)).toBe(text.replace(', "c": 3', ''))
  expect(edit(text, ['p', 'x'], undefined)).toBe(text.replace('"x": [1, 2],\n    ', ''))
  expect(edit(text, ['l', 0], undefined)).toBe(text.replace('"l": [1, 2]', '"l": [2]'))
  expect(edit(text, ['o', 'd'], [4])).toBe(text.replace('"c": 3', '"c": 3, "d": [4]'))
  expect(edit(text, ['l', 1], 9, true)).toBe(text.replace('"l": [1, 2]', '"l": [1, 9, 2]'))
  expect(edit(text, ['l', 0], 9, true)).toBe(text.replace('"l": [1, 2]', '"l": [9, 1, 2]'))
  expect(edit(text, ['l', -1], 9, true)).toBe(text.replace('"l": [1, 2]', '"l": [1, 2, 9]'))
  // Beside a neighbour laid out over lines, laid out over lines at its indent.
  expect(edit(text, ['p', 'w'], { v: [1] })).toContain('    },\n    "w": {\n      "v": [1]\n    }\n  },')
  expect(edit(text, ['e', 'k'], 1)).toContain('  "e": {\n    "k": 1\n  }\n}')
  expect(edit(edit(text, ['o', 'a'], undefined), ['o', 'b'], undefined)).toContain('"o": { "c": 3 }')
  expect(edit(edit(edit(text, ['o', 'a'], undefined), ['o', 'b'], undefined), ['o', 'c'], undefined)).toContain('"o": {}')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an edit taken back with its splice puts back its bytes, a key at its place with its comma; a file changed there since is edited by value', () => {
  const text = '{\n  "o": { "a": 1, "b": [1, 2], "c": 3 },\n  "p": {\n    "x": [1, 2],\n    "y": { "z": 1 }\n  }\n}\n'
  for (const at of [['o', 'a'], ['o', 'b'], ['o', 'c'], ['p', 'x'], ['p', 'y']]) {
    const removed = edit(text, at, undefined)
    const made = splice(text, removed)
    expect(edit(removed, at, valueAt(text, at), false, { splice: made })).toBe(text)
    // Without its splice, a key that was not its object's last goes back at the end.
    if (at[1] !== 'c' && at[1] !== 'y') expect(edit(removed, at, valueAt(text, at))).not.toBe(text)
  }
  const added = edit(text, ['p', 'y', 'q'], 4)
  expect(edit(added, ['p', 'y', 'q'], undefined, false, { splice: splice(text, added) })).toBe(text)
  const inserted = edit(text, ['p', 'x', 1], 9, true)
  expect(edit(inserted, ['p', 'x', 1], undefined, false, { splice: splice(text, inserted) })).toBe(text)
  // The splice no longer matches where it was made, or putting it back is not the value asked for.
  const removed = edit(text, ['o', 'b'], undefined)
  const made = splice(text, removed)
  const moved = edit(removed, ['o', 'a'], 5)
  expect(JSON.parse(edit(moved, ['o', 'b'], [1, 2], false, { splice: made }))).toEqual({ ...JSON.parse(text), o: { a: 5, c: 3, b: [1, 2] } })
  expect(JSON.parse(edit(removed, ['o', 'b'], [7], false, { splice: made })).o).toEqual({ a: 1, c: 3, b: [7] })
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a value put into a list first, between two or last, on one line or a line each, comes out as it went in', () => {
  const one = '{ "l": [1, 2, 3] }\n'
  const lines = '{\n  "l": [\n    1,\n    2\n  ]\n}\n'
  for (const [text, i, want] of [
    [one, 0, '{ "l": [9, 1, 2, 3] }\n'],
    [one, 1, '{ "l": [1, 9, 2, 3] }\n'],
    [one, -1, '{ "l": [1, 2, 3, 9] }\n'],
    [lines, 0, '{\n  "l": [\n    9,\n    1,\n    2\n  ]\n}\n'],
    [lines, 1, '{\n  "l": [\n    1,\n    9,\n    2\n  ]\n}\n'],
    [lines, -1, '{\n  "l": [\n    1,\n    2,\n    9\n  ]\n}\n'],
  ] as [string, number, string][]) {
    const put = edit(text, ['l', i], 9, true)
    expect(put).toBe(want)
    const where = i === -1 ? JSON.parse(put).l.length - 1 : i
    expect(edit(put, ['l', where], undefined)).toBe(text)
  }
  // A list with nothing in it takes its first value inside its bracket.
  expect(edit('{ "l": [] }', ['l', -1], { a: 1 }, true)).toBe('{ "l": [{ "a": 1 }] }')
  // An empty list in an object written on lines takes its first on a line of its own, laid out as the
  // repo writes one, a list of numbers on one line; its last taken out leaves it [] again.
  const empty = '{\n  "layers": []\n}\n'
  const layer = { at: [0, 0], strokes: [{ verb: 'raise', path: [[1, 2], [3, 4]] }] }
  const laid = edit(empty, ['layers', -1], layer, true)
  expect(laid).toBe('{\n  "layers": [\n    {\n      "at": [0, 0],\n      "strokes": [\n        {\n          "verb": "raise",\n          "path": [\n            [1, 2],\n            [3, 4]\n          ]\n        }\n      ]\n    }\n  ]\n}\n')
  expect(JSON.parse(laid).layers).toEqual([layer])
  expect(edit(laid, ['layers', 0], undefined)).toBe(empty)
  // A value set one past a list's end is put in after its last, and taken out again the same.
  for (const [text, want] of [['{ "l": [] }', '{ "l": [{ "a": 1 }] }'], [lines, '{\n  "l": [\n    1,\n    2,\n    {\n      "a": 1\n    }\n  ]\n}\n']]) {
    const n = JSON.parse(text).l.length
    expect(edit(text, ['l', n], { a: 1 })).toBe(want)
    expect(edit(want, ['l', n], undefined)).toBe(text)
  }
})

const tmp = mkdtempSync(path.join(tmpdir(), 'editor-files-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))
mkdirSync(path.join(tmp, 'games/g'), { recursive: true })
mkdirSync(path.join(tmp, 'node_modules/x'), { recursive: true })
writeFileSync(path.join(tmp, 'games/g/g.scene.json'), '{ "world": { "seed": 1 } }\n')
const outside = mkdtempSync(path.join(tmpdir(), 'editor-outside-'))
symlinkSync(outside, path.join(tmp, 'games/out'))

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a path outside the repo, into node_modules or .git, or through a symlink out of it, is refused', async () => {
  const files = new Files(tmp)
  for (const bad of ['../x.json', '/etc/passwd', 'node_modules/x/y.js', '.git/config', 'games/out/z.json', '']) {
    await expect(files.write(bad, '{}')).rejects.toThrow('is not a file of the repo the editor may touch')
  }
  await expect(files.read('games/out/../g/g.scene.json')).resolves.toContain('seed')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('edit writes the file and hands back its text, the value it replaced and how it was written, and the bytes it changed; list walks a folder', async () => {
  const files = new Files(tmp)
  const { text, before, was, splice: made } = await files.edit('games/g/g.scene.json', ['world', 'seed'], 9)
  expect([before, was]).toEqual([1, { raw: '1', slot: 0 }])
  expect(made).toEqual({ offset: text.indexOf('9'), was: '1', now: '9' })
  expect(text).toBe('{ "world": { "seed": 9 } }\n')
  expect(readFileSync(path.join(tmp, 'games/g/g.scene.json'), 'utf8')).toBe(text)
  await files.write('games/g/assets/new.json', '[]')
  expect(await files.list('games/g')).toEqual(['games/g/assets/new.json', 'games/g/g.scene.json'])
})
