// Games running on node, as they run on their own: `games/<game>/<game>.server.ts` in a child
// process, its seats on the port its manager scene names, `client.html` dialing it. Each line it
// prints goes to whoever listens. A game asked to run stays asked for until it is stopped: a change
// to the files it runs starts it again on its new code, whoever made the change (`disk.ts`), and so
// starts one that had stopped by itself, its server thrown or its scene file broken, once the file is
// put right.
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type Event = { type: 'log'; game: string; line: string } | { type: 'servers'; running: Running[] }
export type Running = { game: string; port: number }

export class Servers {
  readonly root: string
  private procs = new Map<string, { proc: ChildProcess; port: number }>()
  // The games asked to run and not stopped since, running or not.
  private wanted = new Set<string>()
  private listeners = new Set<(e: Event) => void>()
  constructor(root: string) { this.root = root }

  on(f: (e: Event) => void) { this.listeners.add(f) }
  private emit(e: Event) { for (const f of this.listeners) f(e) }

  running(): Running[] { return [...this.procs].map(([game, p]) => ({ game, port: p.port })) }

  start(game: string): Running[] {
    if (!/^[\w-]+$/.test(game)) throw new Error(`no game ${game}`)
    if (this.procs.has(game)) return this.running()
    this.spawn(game)
    this.wanted.add(game)
    return this.running()
  }

  stop(game: string): Running[] {
    this.wanted.delete(game)
    if (this.kill(game)) this.emit({ type: 'servers', running: this.running() })
    return this.running()
  }

  stopAll() { for (const game of new Set([...this.wanted, ...this.procs.keys()])) this.stop(game) }

  // A file a game asked to run uses changed: the game `only` starts again on its new code, when the
  // file is that game's alone, and else every one asked to run, each whether it was running or had
  // stopped by itself. One that will not start, its scene file broken or its server taken away, stays
  // asked for and says why in its log, to start once a change puts it right.
  changed(only?: string) {
    for (const game of [...this.wanted]) {
      if (only !== undefined && game !== only) continue
      this.kill(game)
      try {
        this.spawn(game)
      } catch (e) {
        this.emit({ type: 'log', game, line: `could not start again: ${(e as Error).message}` })
        this.emit({ type: 'servers', running: this.running() })
      }
    }
  }

  // The game's server in a child process, said in the log to be starting on its port: whether it
  // gets the port, its own lines say.
  private spawn(game: string) {
    const file = path.join(this.root, 'games', game, `${game}.server.ts`)
    if (!existsSync(file)) throw new Error(`games/${game} has no ${game}.server.ts`)
    const scene = JSON.parse(readFileSync(path.join(this.root, 'games', game, `${game}.scene.json`), 'utf8'))
    const port: number = scene.prefabs?.scenemanager?.port
    const proc = spawn(process.execPath, ['--experimental-strip-types', file], { cwd: this.root })
    const lines = (from: NodeJS.ReadableStream) => {
      let rest = ''
      from.setEncoding('utf8')
      from.on('data', (chunk: string) => {
        const all = (rest + chunk).split('\n')
        rest = all.pop() ?? ''
        for (const line of all) this.emit({ type: 'log', game, line })
      })
    }
    lines(proc.stdout!)
    lines(proc.stderr!)
    proc.on('exit', code => {
      if (this.procs.get(game)?.proc !== proc) return
      this.procs.delete(game)
      this.emit({ type: 'log', game, line: `exited with code ${code}` })
      this.emit({ type: 'servers', running: this.running() })
    })
    this.procs.set(game, { proc, port })
    this.emit({ type: 'log', game, line: `starting on port ${port}` })
    this.emit({ type: 'servers', running: this.running() })
  }

  // The game's server stopped, when it runs: says so in the log, and whether it ran.
  private kill(game: string) {
    const p = this.procs.get(game)
    if (!p) return false
    this.procs.delete(game)
    p.proc.kill()
    this.emit({ type: 'log', game, line: 'stopped' })
    return true
  }
}
