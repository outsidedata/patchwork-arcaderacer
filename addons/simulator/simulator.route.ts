// The simulator's routes, for its panel (`simulator.extension.tsx`) and for a browser's tap (`tap` in
// `simulator.addon.ts`). A recording is `addons/simulator/runs/<name>.jsonl`, a name of letters,
// digits, `_`, `.` and `-`, written through the server's files. A recording is no change of a game's:
// every route here is a plain request, outside any change, a run the panel's (`routeOf`) and a tap a
// browser's, and nothing it writes is undone.
//
//   GET  runs          every recording's name, in order.
//   GET  read?name=    a recording's lines, as its file holds them.
//   POST tap           { name, first, lines }: the lines put at the end of the recording `name`, which
//                      the first batch of a tap begins afresh.
//   POST run           { name, config }: `config` played on node by the simulator's command line, as
//                      `run <config.json>` plays one (its `game` the manager scene file's path from
//                      the repo), in a folder of the system's temporary folder, and written as the
//                      recording `name`, over one of that name; answers { name, report, files }: the
//                      summary the command line printed, and the recording's path. A config the
//                      command line refuses answers what it said, and writes nothing.
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { RouteFiles, Router } from '#editor/server/routes.ts'
import { NAME, RUNS } from './simulator.addon.ts'

const fileOf = (name: unknown): string => {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`a recording is named with letters, digits, _, . and - only, not ${JSON.stringify(name)}`)
  return `${RUNS}/${name}.jsonl`
}

async function had(files: RouteFiles, rel: string): Promise<string> {
  try { return await files.read(rel) } catch { return '' }
}

export function simulator(r: Router) {
  r.get('runs', async ({ files }) => {
    const all = await files.list(RUNS).catch(() => [] as string[])
    return all.filter(f => f.endsWith('.jsonl') && !f.slice(RUNS.length + 1).includes('/')).map(f => f.slice(RUNS.length + 1, -'.jsonl'.length))
  })

  r.get('read', async ({ query, files }) => files.read(fileOf(query.get('name'))))

  r.post('tap', async ({ body, files }) => {
    const { name, first, lines } = body as { name: unknown; first: unknown; lines: unknown }
    if (!Array.isArray(lines) || !lines.every(l => typeof l === 'string')) throw new Error('a tap sends its lines as a list of strings')
    for (const l of lines) JSON.parse(l)
    const rel = fileOf(name)
    const before = first === true ? '' : await had(files, rel)
    await files.write(rel, before + lines.map(l => l + '\n').join(''))
    return { lines: lines.length }
  })

  r.post('run', async ({ body, files }) => {
    const { name, config } = body as { name: unknown; config: unknown }
    const rel = fileOf(name)
    if (typeof config !== 'object' || config === null || typeof (config as { game?: unknown }).game !== 'string') throw new Error('a run is handed a config whose game names a manager scene file')
    const root = path.dirname(await files.resolve('addons'))
    const game = await files.resolve((config as { game: string }).game)
    const dir = await mkdtemp(path.join(tmpdir(), 'simulator-run-'))
    try {
      const at = path.join(dir, 'config.json'), out = path.join(dir, 'out.jsonl')
      await writeFile(at, JSON.stringify({ ...config, game }))
      const cli = path.join(root, 'addons/simulator/simulator.addon.ts')
      const { code, stdout, stderr } = await new Promise<{ code: number | null; stdout: string; stderr: string }>((done, fail) => {
        const child = spawn(process.execPath, ['--experimental-strip-types', '--no-warnings', cli, 'run', at, out], { cwd: root })
        let stdout = '', stderr = ''
        child.stdout.on('data', d => { stdout += d })
        child.stderr.on('data', d => { stderr += d })
        child.on('error', fail)
        child.on('close', code => done({ code, stdout, stderr }))
      })
      if (code !== 0) throw new Error(stderr.trim() || `the simulator stopped with ${code}`)
      await files.write(rel, await readFile(out, 'utf8'))
      return { name, report: stdout.trim(), files: [rel] }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
}
