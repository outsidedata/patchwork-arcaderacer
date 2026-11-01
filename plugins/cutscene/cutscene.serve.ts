// The dev server's half of the cutscene's panel (`cutscene.panel.ts`): what a page cannot do itself,
// a cue file saved into the game and the cue file's own check run, each in node. `cutsceneServe()` is a
// Vite plugin, listed in the repo's `vite.config.ts`, so every game's dev page served by `yarn dev` (or
// `yarn serve <game>`) has it. It answers
//   POST /@cutscene/save?game=<game>&scene=<scene>    the cue file posted, held to what the panel holds
//        a change to (`cutscene.cued.ts`'s `file`, the scene loaded as the game loads it), and written
//        into the scene's cue file, JSON's own layout two spaces deep, when it is not the file as it is:
//        `{ written }`, the files written; 400 naming why when it is refused.
//   POST /@cutscene/check?game=<game>&scene=<scene>   the cue file's own check, the script beside it of
//        its name (`cutscene.cued.ts`'s `frames`), run on the cue file posted, saved or not:
//        `{ failed: [{ shot, e, text }] }`, each failing frame; 404 when there is no script beside it;
//        409 naming why when it throws. A check of a cue file posted while one of the same runs ends the
//        one that runs, which is answered 409.
// A game is a folder of `games/` with its manager scene, `<game>.scene.json`; anything else is a 404.
// `answers(root)` is the same against any root, which is how its test runs it.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'

const CUED = fileURLToPath(new URL('./cutscene.cued.ts', import.meta.url))

type Answer = { status: number; body: unknown }

export function answers(root: string) {
  // `cutscene.cued.ts` run on the cue file of `game`'s `scene` in `mode`, `script` handed on its standard
  // input: what it printed, and `kill`, which ends it.
  const cued = (manager: string, scene: string, mode: 'file' | 'frames', script: unknown) => {
    const p = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', CUED, manager, scene, mode], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = '', err = ''
    p.stdout.on('data', c => out += c)
    p.stderr.on('data', c => err += c)
    p.stdin.end(JSON.stringify(script))
    const done = new Promise<Record<string, any>>((ok, no) => p.on('close', code => {
      try { ok(JSON.parse(out)) } catch { no(new Error(err.trim().split('\n').slice(-4).join(' ') || `cutscene.cued.ts ended with ${code}`)) }
    }))
    return { done, kill: () => { p.kill() } }
  }
  // The check of each cue file that runs, by `<game>/<scene>`, and how it is ended.
  const checking = new Map<string, () => void>()

  return {
    async answer(route: string, game: string, scene: string, body: any): Promise<Answer> {
      if (!/^[\w-]+$/.test(game) || !/^[\w-]+$/.test(scene)) return { status: 404, body: { error: 'a game and a scene are words' } }
      const manager = path.join(root, 'games', game, `${game}.scene.json`)
      if (!fs.existsSync(manager)) return { status: 404, body: { error: `no game ${game}` } }
      if (!body || typeof body !== 'object' || !Array.isArray(body.cues) || !body.cast) return { status: 400, body: { error: 'a cue file is { end, cast, cues, ... }' } }
      if (route === 'check') {
        const key = `${game}/${scene}`
        checking.get(key)?.()
        let ended = false
        const p = cued(manager, scene, 'frames', body)
        const stop = () => { ended = true; p.kill() }
        checking.set(key, stop)
        try {
          const r = await p.done
          if (r.none) return { status: 404, body: { error: r.none } }
          return r.error ? { status: 409, body: { error: r.error } } : { status: 200, body: { failed: r.failed } }
        } catch (e) {
          return { status: 409, body: { error: ended ? 'another check of this cue file began' : (e as Error).message } }
        } finally {
          if (checking.get(key) === stop) checking.delete(key)
        }
      }
      if (route !== 'save') return { status: 404, body: { error: `no route ${route}` } }
      const r: Record<string, any> = await cued(manager, scene, 'file', body).done.catch((e: Error) => ({ error: e.message }))
      if (r.error) return { status: r.error.startsWith('the manager names no scene') ? 404 : 400, body: { error: r.error } }
      const full = path.resolve(root, r.file)
      if (!full.startsWith(path.join(root, 'games') + path.sep)) return { status: 400, body: { error: `${r.file} is no file of a game` } }
      const text = JSON.stringify(body, null, 2) + '\n'
      if (fs.existsSync(full) && fs.readFileSync(full, 'utf8') === text) return { status: 200, body: { written: [] } }
      fs.writeFileSync(full + '.tmp', text)
      fs.renameSync(full + '.tmp', full)
      return { status: 200, body: { written: [r.file] } }
    },
    close() { for (const stop of checking.values()) stop() },
  }
}

const read = (req: IncomingMessage) => new Promise<string>((done, fail) => {
  let text = ''
  req.on('data', c => text += c)
  req.on('end', () => done(text))
  req.on('error', fail)
})

export const cutsceneServe = (): Plugin => ({
  name: 'cutscene-panel',
  configureServer(server) {
    const a = answers(path.resolve(server.config.root))
    server.httpServer?.on('close', () => a.close())
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const route = /^\/@cutscene\/(save|check)$/.exec(url.pathname)?.[1]
      if (!route || req.method !== 'POST') return next()
      let body: unknown
      try { body = JSON.parse((await read(req)) || 'null') } catch { body = undefined }
      const out = await a.answer(route, url.searchParams.get('game') ?? '', url.searchParams.get('scene') ?? '', body)
      res.statusCode = out.status
      res.setHeader('content-type', 'application/json')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(out.body))
    })
  },
})
