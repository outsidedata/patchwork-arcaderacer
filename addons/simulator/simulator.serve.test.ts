// The tap's dev-server half on a folder of its own: a tap's first batch begins a recording, each after
// is put at its end, and a name, a list or a line that is not one is refused, writing nothing.
import { afterAll, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { answers } from './simulator.serve.ts'

const root = mkdtempSync(path.join(tmpdir(), 'simulator-serve-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const a = answers(root)
const at = (name: string) => path.join(root, 'addons/simulator/runs', `${name}.jsonl`)

test('a tap\'s first batch begins a recording, and each after is put at its end', () => {
  expect(a.tap({ name: 'browser', first: true, lines: ['{"type":"run","mode":"real","ms":0,"pages":[]}', '{"type":"frame","t":1}'] })).toEqual({ status: 200, body: { lines: 2 } })
  expect(a.tap({ name: 'browser', first: false, lines: ['{"type":"frame","t":2}'] })).toEqual({ status: 200, body: { lines: 1 } })
  expect(readFileSync(at('browser'), 'utf8')).toBe('{"type":"run","mode":"real","ms":0,"pages":[]}\n{"type":"frame","t":1}\n{"type":"frame","t":2}\n')
  a.tap({ name: 'browser', first: true, lines: ['{"type":"run","mode":"real","ms":0,"pages":[]}'] })
  expect(readFileSync(at('browser'), 'utf8')).toBe('{"type":"run","mode":"real","ms":0,"pages":[]}\n')
})

test('a name, a list or a line that is not one is refused, and nothing is written', () => {
  expect(a.tap({ name: '../x', first: true, lines: ['{}'] })).toEqual({ status: 400, body: { error: 'a recording is named with letters, digits, _, . and - only, not "../x"' } })
  expect(a.tap({ name: 'gone', first: true, lines: 'x' })).toEqual({ status: 400, body: { error: 'a tap sends its lines as a list of strings' } })
  const bad = a.tap({ name: 'gone', first: true, lines: ['{}', '{ nope'] })
  expect(bad.status).toBe(400)
  expect((bad.body as { error: string }).error).toMatch(/^a line is no JSON: /)
  expect(a.tap(undefined).status).toBe(400)
  expect(existsSync(at('gone'))).toBe(false)
})
