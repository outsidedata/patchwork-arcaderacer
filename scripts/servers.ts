// Games running on node, as they run on their own: `games/<game>/<game>.server.ts` in a child
// process, its seats on the port its manager scene names, `client.html` dialing it. Each line it
// prints goes to whoever listens. A game asked to run stays asked for until it is stopped: a change
// to the files it runs starts it again on its new code, whoever made the change (`restarts`), and so
// starts one that had stopped by itself, its server thrown or its scene file broken, once the file is
// put right. `yarn serve <game>` runs one (`serve.ts`).
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mounts, where } from './mounts.ts'

// node's resolving for a mounted game's server, handed to every server's node while a game is mounted
const HOOKS = fileURLToPath(new URL('./mounted.hooks.ts', import.meta.url))

export type Event = { type: 'log'; game: string; line: string } | { type: 'servers'; running: Running[] }
export type Running = { game: string; port: number }

// How long the changes to the files of a game on node are gathered before it starts again, so a
// change of many files, a kind made say, restarts it once.
export const GATHER = 300

// The game a file is of, by its path from the repo, when it is in a game's folder.
export const gameOf = (rel: string) => /^games\/([^/]+)\//.exec(rel)?.[1]

// Whether a game on node may run the file, by its path from the repo: code of the four folders a
// server imports, so not a test or an actor's look, which only a page draws; and a
// data file of a game's folder. Never a hidden file or a text editor's backup, a page, a note, or what
// a run of the simulator records.
// Whether `file`, a path as the watcher names it, really is in the repo or in a mounted game's folder (`mounts.ts`),
// its links followed: a file reached through a link out of them (a game's builds in the system's temp folder, linked
// into its `assets/`) is not, so its writes start no server again. A file just removed is placed by the nearest folder
// over it still there, since a build clears its whole folder.
export const inRepo = (root: string, file: string) => {
  const homes = [realpathSync(root), ...mounts().map(([, folder]) => folder)].map(h => h + path.sep)
  for (let at = file, rest = ''; ; rest = path.join(path.basename(at), rest), at = path.dirname(at)) {
    try {
      const real = path.join(realpathSync(at), rest)
      return homes.some(h => real.startsWith(h))
    } catch {}
    if (path.dirname(at) === at) return true
  }
}

export const runs = (rel: string) => {
  const name = rel.slice(rel.lastIndexOf('/') + 1)
  if (name.startsWith('.') || name.endsWith('~') || /\.(html|md)$/.test(name)) return false
  if (/\.(test\.tsx?|client\.tsx?)$/.test(name)) return false
  if (/\.tsx?$/.test(name)) return /^(games|plugins|addons|engine)\//.test(rel)
  return /^games\//.test(rel)
}

// `changed`, a file changed, by its path from the repo: when a game on node may run it, the games it is
// for start again once `GATHER` ms pass with no other such change, its own game's when it is in a
// game's folder, else every one asked to run. `close` lets go of a start not yet made.
export function restarts(servers: Servers) {
  const restarting = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    changed(rel: string) {
      if (!runs(rel)) return
      restarting.add(gameOf(rel) ?? '*')
      clearTimeout(timer)
      timer = setTimeout(() => {
        const all = restarting.has('*')
        const games = [...restarting]
        restarting.clear()
        if (all) servers.changed()
        else for (const g of games) servers.changed(g)
      }, GATHER)
    },
    close() { clearTimeout(timer) },
  }
}

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
  // gets the port, its own lines say. A mounted game's (`mounts.ts`) is its folder's, run from the
  // repo's root as every game's is, node handed `mounted.hooks.ts` and the mounted folders.
  private spawn(game: string) {
    const folder = where(this.root, `games/${game}`)
    const file = path.join(folder, `${game}.server.ts`)
    if (!existsSync(file)) throw new Error(`games/${game} has no ${game}.server.ts`)
    const scene = JSON.parse(readFileSync(path.join(folder, `${game}.scene.json`), 'utf8'))
    const port: number = scene.prefabs?.scenemanager?.port
    const mounted = mounts()
    const proc = spawn(process.execPath, ['--experimental-strip-types', ...(mounted.length ? ['--import', HOOKS] : []), file], {
      cwd: this.root,
      env: mounted.length ? { ...process.env, PATCHWORK_MOUNTS: JSON.stringify(Object.fromEntries(mounted)) } : process.env,
    })
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
