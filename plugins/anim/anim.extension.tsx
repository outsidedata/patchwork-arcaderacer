// anim's extension: the Export models command (Game menu). For every rig file of the open game that
// names `bodies`, it bakes the rig's clips onto each body through anim's route (`anim.route.ts`,
// Blender running `anim.export.py`), which writes each body's glb where the catalogue entry of the
// same name says, and the measured `table` into the rig file as one value: one change of the files for
// each rig, whole or not at all, and one undo takes every glb and table of the export back together. A
// rig that names no bodies is not exported.
//
// A rig is found the way the game finds it: a kind of `world.anim.kinds` names its rig, a `json`
// entry of `world.loader.assets`, and each key of the rig's `bodies` is the `model` entry the body is
// written to. A body with no such entry is refused before Blender runs.
//
// Its commands, for a menu and for an LLM calling them (`editor/mcp.ts`), bake a rig with one
// function (`bake`): `anim.export`, Export models, exports every rig, each whatever another does, and
// `anim.exportRig` the rig it is handed, by its catalogue entry's name. Each answers, for each rig
// exported, the rig file and every file written, and fails with what failed, which a menu writes to
// the console: Export models names every rig that failed, a rig with no catalogue entry too, and
// every rig it exported, which its one undo takes back.
import { z } from 'zod'
import type { Edits, Editor } from '#editor/editor.ts'
import type { Exported } from './anim.route.ts'

type Asset = { url: string; type: string }
const fromRepo = (url: string) => url.replace(/^\//, '')

export function anim(ed: Editor) {
  ed.command({
    id: 'anim.export',
    title: 'Export Models',
    menu: 'Game',
    enabled: () => !!ed.session,
    run: () => ed.together(e => exportAll(ed, e)),
  })
  ed.command({
    id: 'anim.exportRig',
    title: 'Export a rig\'s models',
    input: z.object({ rig: z.string().describe('a rig by its catalogue entry\'s name, as a kind of world.anim.kinds names it') }).describe('Bakes a rig\'s clips onto each body its bodies names, in Blender, writes each body\'s glb to the model entry of its name, and the measured table into the rig file: one change the editor\'s Undo takes back. Answers the rig file and every file written.'),
    run: ({ rig }, e) => exportRig(ed, e, rig),
  })
}

// The rigs of the open game: every one a kind of its `world.anim.kinds` names, by its catalogue
// entry's name, with its file's path from the repo, or undefined for one the catalogue has no entry
// for; and every entry of the catalogues of its scenes, by name.
function rigsOf(ed: Editor) {
  const s = ed.need()
  const assets: Record<string, Asset> = {}
  for (const scene of s.files.values()) Object.assign(assets, scene.world?.loader?.assets ?? {})
  const rigs = new Map<string, string | undefined>()
  for (const scene of s.files.values())
    for (const k of Object.values((scene.world?.anim?.kinds ?? {}) as Record<string, { rig: string }>))
      rigs.set(k.rig, assets[k.rig] && fromRepo(assets[k.rig].url))
  return { rigs, assets }
}
type Rigs = ReturnType<typeof rigsOf>

// A rig's file, and the bodies it names, read once: undefined for one that names none. A rig the
// catalogue has no entry for is refused.
async function readRig(ed: Editor, name: string, file: string | undefined) {
  if (file === undefined) throw new Error(`no catalogue entry ${name} for a rig`)
  return { file, bodies: (JSON.parse(await ed.text(file)) as { bodies?: Record<string, string> }).bodies }
}

// Rig `name`, whose file is `file` and whose bodies are `bodies`, exported as one change of `e`'s:
// every body of it baked and written to its model entry, and the measured table written into the
// rig file, by the route. Answers the rig file and every file written.
async function bake(e: Edits, assets: Rigs['assets'], name: string, file: string, bodies: Record<string, string>) {
  const models: Record<string, string> = {}
  for (const body of Object.keys(bodies)) {
    const m = assets[body]
    if (m?.type !== 'model') throw new Error(`${file} names the body ${body}, and the catalogue has no model entry ${body} to write it to`)
    models[body] = fromRepo(m.url)
  }
  const done = await e.route<Exported>('anim', 'export', { rig: file, models })
  return { rig: name, file, files: done.files }
}

// Rig `name` exported, as one change of `e`'s. A rig there is not is refused, naming the rigs, and
// one that names no bodies.
export async function exportRig(ed: Editor, e: Edits, name: string) {
  const { rigs, assets } = rigsOf(ed)
  if (!rigs.has(name)) throw new Error(`no rig ${name}: the rigs are ${[...rigs.keys()].join(', ') || 'none'}`)
  const { file, bodies } = await readRig(ed, name, rigs.get(name))
  if (!bodies) throw new Error(`${file} names no bodies to export`)
  return bake(e, assets, name, file, bodies)
}

// Every rig that names bodies exported, one change a rig, each whatever another does, as the action
// `e` is of: a rig that fails changes nothing and is said, with every rig exported, whose changes the
// action keeps, so one undo takes them back.
async function exportAll(ed: Editor, e: Edits) {
  const { rigs, assets } = rigsOf(ed)
  const done: Awaited<ReturnType<typeof bake>>[] = []
  const failed: string[] = []
  for (const [name, at] of rigs) {
    try {
      const { file, bodies } = await readRig(ed, name, at)
      if (bodies) done.push(await bake(e, assets, name, file, bodies))
    } catch (err) {
      failed.push((err as Error).message)
    }
  }
  if (failed.length) throw new Error(`${failed.join('; ')}${done.length ? `; exported, and one undo takes them back: ${done.map(d => d.rig).join(', ')}` : ''}`)
  return done
}
