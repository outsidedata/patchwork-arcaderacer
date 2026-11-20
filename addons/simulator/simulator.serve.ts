// The dev server's half of the simulator's browser tap (`tap` in `simulator.addon.ts`): a page cannot
// write a file, so the lines it records are posted here and written into the repo. `simulatorServe()`
// is a Vite plugin, listed in the repo's `vite.config.ts`, so every page served by `yarn dev` (or
// `yarn serve <game>`) has it. It answers
//   POST /@simulator/tap    { name, first, lines }: the lines put at the end of the recording
//        `addons/simulator/runs/<name>.jsonl`, which the first batch of a tap begins afresh:
//        `{ lines }`, how many were written; 400 naming why when it is refused: a name of anything but
//        letters, digits, `_`, `.` and `-`, lines that are no list of strings, or a line that is no JSON.
// A recording is read back with the simulator's command line, `summary <run.jsonl>`.
// `answers(root)` is the same against any root, which is how its test runs it.
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { NAME, RUNS } from './simulator.addon.ts'

type Answer = { status: number; body: unknown }

export function answers(root: string) {
  return {
    tap(body: unknown): Answer {
      const { name, first, lines } = (body ?? {}) as { name?: unknown; first?: unknown; lines?: unknown }
      if (typeof name !== 'string' || !NAME.test(name)) return { status: 400, body: { error: `a recording is named with letters, digits, _, . and - only, not ${JSON.stringify(name)}` } }
      if (!Array.isArray(lines) || !lines.every(l => typeof l === 'string')) return { status: 400, body: { error: 'a tap sends its lines as a list of strings' } }
      for (const l of lines) {
        try { JSON.parse(l) } catch (e) { return { status: 400, body: { error: `a line is no JSON: ${(e as Error).message}` } } }
      }
      const dir = path.join(root, RUNS)
      const file = path.join(dir, `${name}.jsonl`)
      fs.mkdirSync(dir, { recursive: true })
      const text = lines.map(l => l + '\n').join('')
      if (first === true) fs.writeFileSync(file, text)
      else fs.appendFileSync(file, text)
      return { status: 200, body: { lines: lines.length } }
    },
  }
}

const read = (req: IncomingMessage) => new Promise<string>((done, fail) => {
  let text = ''
  req.on('data', c => text += c)
  req.on('end', () => done(text))
  req.on('error', fail)
})

export const simulatorServe = (): Plugin => ({
  name: 'simulator-tap',
  configureServer(server) {
    const a = answers(path.resolve(server.config.root))
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname !== '/@simulator/tap' || req.method !== 'POST') return next()
      let body: unknown
      try { body = JSON.parse((await read(req)) || 'null') } catch { body = undefined }
      const out = a.tap(body)
      res.statusCode = out.status
      res.setHeader('content-type', 'application/json')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(out.body))
    })
  },
})
