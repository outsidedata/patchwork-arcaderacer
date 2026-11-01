// anim's route: a rig's bodies baked from the library by Blender (`anim.export.py`), for the
// Export models command (`anim.extension.tsx`).
//
//   POST export   { rig, models }: `rig` is the rig file and `models` `{ <body>: <glb> }` the glb each
//                 body the rig's `bodies` names is written to, all by their paths from the repo.
//                 Blender bakes every clip onto every body and measures the table on the first, in a
//                 folder of the system's temporary folder; the glbs are written through the files it
//                 is handed, then the measured table into the rig as one value, its `table`. Answers
//                 { table, files }: the table, and every file written, the glbs and the rig. Run
//                 inside a change (`Edits.route`, `editor/server/changes.ts`), the glbs and the table
//                 are that change, which one undo takes back byte for byte, and an export that fails
//                 part-way leaves every file as it was.
//
// Blender is `BLENDER` from the environment, else the macOS application's binary.
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RouteFiles, Router } from '#editor/server/routes.ts'
import type { Measure } from './anim.sim.ts'

// What an export answers.
export type Exported = Awaited<ReturnType<typeof exported>>

const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender'
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'anim.export.py')

// A path of the repo, as a page sent it.
function repoPath(v: unknown, ext: string, what: string): string {
  if (typeof v !== 'string' || !v.endsWith(ext)) throw new Error(`${what} is a ${ext} file of the repo`)
  const p = path.posix.normalize(v.replace(/^\/+/, ''))
  if (p.startsWith('..')) throw new Error(`${v} is not in the repo`)
  return p
}

function blender(args: string[]): Promise<string> {
  return new Promise((done, fail) => execFile(BLENDER, ['--background', '--factory-startup', '--python', SCRIPT, '--', ...args],
    { maxBuffer: 64 << 20 }, (e, out, err) => e ? fail(new Error(`Blender: ${(err || out).split('\n').filter(l => /Error|error|anim export/.test(l)).slice(-4).join(' ') || e.message}`)) : done(out)))
}

async function exported(body: unknown, files: RouteFiles) {
  const b = body as { rig?: unknown; models?: unknown } | null
  const rig = repoPath(b?.rig, '.json', 'rig')
  if (!b?.models || typeof b.models !== 'object') throw new Error('models is { <body>: <glb> }')
  const models = Object.entries(b.models as Record<string, unknown>).map(([k, v]) => [k, repoPath(v, '.glb', `the model of ${k}`)] as const)
  if (!models.length) throw new Error('an export names at least one body')
  const bodies = (JSON.parse(await files.read(rig)) as { bodies?: Record<string, string> }).bodies ?? {}
  for (const [k] of models) if (!(k in bodies)) throw new Error(`${rig} names no body ${k} in its bodies`)
  const work = await mkdtemp(path.join(tmpdir(), 'anim-export-'))
  try {
    const table = path.join(work, 'table.json')
    const outs = models.map(([k], i) => [k, path.join(work, `${i}.glb`)] as const)
    await blender([await files.resolve(rig), table, ...outs.map(([k, o]) => `${k}=${o}`)])
    const measured = JSON.parse(await readFile(table, 'utf8')) as Record<string, Measure>
    const glbs = await Promise.all(outs.map(([, o]) => readFile(o)))
    for (const [i, [, p]] of models.entries()) await files.write(p, new Uint8Array(glbs[i]))
    await files.edit(rig, ['table'], measured)
    return { table: measured, files: [...models.map(([, p]) => p), rig] }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

export function anim(r: Router) {
  r.post('export', ({ body, files }) => exported(body, files))
}
