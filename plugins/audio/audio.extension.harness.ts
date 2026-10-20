// What audio's extension tests share, those that attach the game view and those that do not: a file
// of the repo as it is on disk, and a wait for what the panel and the editor do in their own time.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { vi } from 'vitest'
import { repo } from '#editor/test/editor.ts'

export const disk = (p: string) => readFileSync(path.join(repo, p), 'utf8')

export const until = (f: () => unknown) => vi.waitFor(f, { timeout: 30_000, interval: 20 })
