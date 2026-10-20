// The code extension: the code of the open game, and of the plugins and addons it names, read and
// written in the editor. A game's rules and looks, its kinds' `.sim.ts` and `.client.ts`, its own
// plugins, and the shared plugins it uses are text in TypeScript, which the editor's files, that
// write JSON a value at a time, cannot write; this writes them whole through its route
// (`code.route.ts`). The engine's code is not offered: it is frozen.
//
// The Code panel (`code.components.tsx`):
//   the files   every code file under the open game's folder and under the folder of each plugin and
//               addon its scenes name, by folder, filtered by what is typed; a click opens one;
//   the tabs    the files open, each marked while it holds changes not saved; one closes only once
//               it holds none;
//   the text    the file open, in the design system's code field: highlighted, searched, Mod-S saves.
// A file whose text changed on disk since it was opened, while it holds changes of its own, is said
// to be so: its own changes are kept, and are saved over the disk's only once asked to (Keep mine),
// or let go for the disk's (Take the file's).
//
// A save is one undo: the route runs as a change of the files (`Edits.route`). A file the page has
// imported, which it holds as it was, reloads it once the save is in the history, and again as it is
// undone or redone (`Editor.undo`), and so does every other page that has imported it; one no page
// has imported reloads none, and is imported as it now is when it first is. A game on node running it
// starts again as it is written. The reloaded page puts back the session, the step, the history and
// this panel's files, tabs and changes not saved, each game's by itself. A file open here that a change
// wrote, this panel's or another's, or that changed on the disk (`Editor.disk`), is read again where
// the panel holds no changes to it. A file is read through the route (`read`), which answers one that
// is not there, as a file being made is, as no error.
//
// An inspector section, Code, shows a selected row's kind's code: the files named after its kind,
// its rule and its look, each opened by a click.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`):
//   code.files   the code files the panel lists, or those under a folder;
//   code.read    a code file's text, or some of its lines, and whether the panel holds changes to it
//                not saved;
//   code.open    a code file shown in the Code panel, at a line when one is named;
//   code.write   a code file written whole, or made: one undo, the page reloaded with it when it has
//                imported it; refused while the panel holds changes to it not saved;
//   code.remove  a code file taken away: one undo, which makes it again; refused the same way;
//   code.save    the file the panel shows, saved (Mod-S).
import { z } from 'zod'
import { fetched, type Editor, type Edits } from '#editor/editor.ts'
import { codePath } from './code.route.ts'
import { CodePanel, KindCode } from './code.components.tsx'

// What the panel holds of a file: `text`, as it is now in the panel; `was`, what the file held when
// it was read or last saved, null for a file not made yet; `disk`, what the file holds now, when
// that is not `was` while the panel holds changes of its own.
export type Buffer = { text: string; was: string | null; disk?: string | null }

export type Studio = {
  files: string[] | undefined
  open: string[]
  current: string | undefined
  line: { path: string; at: number } | undefined
  buffers: Map<string, Buffer>
  dirty(path: string): boolean
  list(): Promise<string[]>
  show(path: string, line?: number): Promise<void>
  edit(path: string, text: string): void
  save(path: string): Promise<void>
  revert(path: string): Promise<void>
  keepMine(path: string): void
  close(path: string): void
  pick(path: string): void
}

// What a reload keeps, in this tab only, of each game by itself, as the editor's session is kept: the
// files open, the one shown, and each file's changes not saved. Going to another game's page in this
// tab, and back, puts back each one's.
const keptOf = (ed: Editor) => `code.kept.${ed.game?.name ?? ''}`
type Kept = { open: string[]; current?: string; drafts: Record<string, { text: string; was: string | null }> }
const readKept = (key: string): Kept => {
  try {
    return { open: [], drafts: {}, ...JSON.parse(sessionStorage.getItem(key) ?? '{}') }
  } catch {
    return { open: [], drafts: {} }
  }
}

const refuse = (path: string) => { throw new Error(`${path} is no code file of a game, a plugin, an addon or an extension`) }

export function code(ed: Editor) {
  const KEPT = keptOf(ed)
  const kept = readKept(KEPT)
  const buffers = new Map<string, Buffer>()
  // The list in hand, and the folders and their writes it was asked over (`list`).
  let listing: { at: string; files: Promise<string[]> } | undefined

  // A code file's text, or null when it is not there, asked of the route, which answers that as no
  // error.
  const read = async (path: string) => (await fetched<{ text: string | null }>(`/api/x/code/read?path=${encodeURIComponent(path)}`)).text
  const dirty = (path: string) => { const b = buffers.get(path); return !!b && b.text !== b.was }
  const keep = () => {
    const drafts: Kept['drafts'] = {}
    for (const [p, b] of buffers) if (b.text !== b.was) drafts[p] = { text: b.text, was: b.was }
    try {
      sessionStorage.setItem(KEPT, JSON.stringify({ open: studio.open, current: studio.current, drafts } satisfies Kept))
    } catch {
      // A tab that keeps nothing reloads without its tabs.
    }
  }
  const forget = (path: string) => {
    buffers.delete(path)
    const i = studio.open.indexOf(path)
    if (i >= 0) studio.open.splice(i, 1)
    if (studio.current === path) studio.current = studio.open[Math.min(i, studio.open.length - 1)]
  }

  // The folders whose code the open game uses: its own, and each plugin's and addon's its scenes name.
  const dirs = () => {
    const s = ed.session
    if (!s) return []
    return [`games/${s.game.name}`, ...[...ed.names()].flatMap(n => [`plugins/${n}`, `addons/${n}`])]
  }

  const studio: Studio = {
    files: undefined,
    open: [...kept.open],
    current: kept.current,
    line: undefined,
    buffers,
    dirty,
    // Listed once for every asker at once: a list asked for while one is in hand over the same folders,
    // written to as many times, is that one, as the panel and the Inspector's section ask together as
    // a game opens.
    list() {
      const d = dirs()
      const at = `${d.join(',')} ${d.map(f => ed.writesIn(f)).join(',')}`
      if (listing?.at === at) return listing.files
      const asked = d.length ? fetched<{ files: string[] }>(`/api/x/code/list?dirs=${encodeURIComponent(d.join(','))}`).then(r => r.files) : Promise.resolve([])
      const files: Promise<string[]> = asked.then(f => {
        studio.files = f
        ed.changed('x.code')
        return f
      }).finally(() => { if (listing?.files === files) listing = undefined })
      listing = { at, files }
      return files
    },
    async show(path, line) {
      if (!codePath(path)) refuse(path)
      if (!buffers.has(path)) {
        const text = await read(path)
        if (text === null) throw new Error(`${path} is not there`)
        buffers.set(path, { text, was: text })
      }
      if (!studio.open.includes(path)) studio.open.push(path)
      studio.current = path
      studio.line = line === undefined ? undefined : { path, at: line }
      keep()
      ed.reveal('code')
      ed.changed('x.code')
    },
    edit(path, text) {
      const b = buffers.get(path)
      if (!b) return
      const was = dirty(path)
      b.text = text
      keep()
      if (dirty(path) !== was) ed.changed('x.code')
    },
    async save(path) {
      const b = buffers.get(path)
      if (!b || !dirty(path)) return
      if (b.disk !== undefined) throw new Error(`${path} changed on disk since it was opened: take the file's text, or keep yours to save over it`)
      const text = b.text
      try {
        await ed.route('code', 'save', { path, text, was: b.was })
      } catch (e) {
        const disk = await read(path)
        if (disk !== b.was) b.disk = disk
        ed.changed('x.code')
        throw e
      }
      const made = b.was === null
      b.was = text
      keep()
      ed.changed('x.code')
      if (made) await studio.list()
    },
    async revert(path) {
      const disk = await read(path)
      if (disk === null) forget(path)
      else buffers.set(path, { text: disk, was: disk })
      keep()
      ed.changed('x.code')
    },
    keepMine(path) {
      const b = buffers.get(path)
      if (!b || b.disk === undefined) return
      b.was = b.disk
      delete b.disk
      keep()
      ed.changed('x.code')
    },
    close(path) {
      if (dirty(path)) throw new Error(`${path} holds changes not saved: save or revert it first`)
      forget(path)
      keep()
      ed.changed('x.code')
    },
    pick(path) {
      studio.current = path
      keep()
      ed.changed('x.code')
    },
  }

  // The files a reload kept open, read again: a change not saved is put back over the file it was
  // made on, and marked when the file has changed since.
  const restore = async () => {
    for (const p of [...studio.open]) {
      const disk = await read(p)
      const d = kept.drafts[p]
      if (d) buffers.set(p, d.was === disk ? { text: d.text, was: disk } : { text: d.text, was: d.was, disk })
      else if (disk !== null) buffers.set(p, { text: disk, was: disk })
      else forget(p)
    }
    if (studio.current && !studio.open.includes(studio.current)) studio.current = studio.open[0]
    keep()
    ed.changed('x.code')
  }
  void restore()

  // A file open here that a change wrote, kept, taken back or made again: the panel's copy follows it
  // where it holds no changes of its own, or where the file now holds what the panel does, as after
  // its own save; else the panel's changes are kept and the file's text is marked as changed.
  ed.onBytes(async f => {
    const b = buffers.get(f)
    if (!b) return
    const disk = await read(f)
    if (disk === b.text || b.text === b.was) {
      if (disk === null) forget(f)
      else buffers.set(f, { text: disk, was: disk })
    } else if (disk !== b.was) b.disk = disk
    keep()
    ed.changed('x.code')
  })

  function Code() {
    return <CodePanel studio={studio} />
  }
  ed.panel({ id: 'code', title: 'Code', area: 'center', component: Code })
  ed.inspector({ id: 'code.kind', title: 'Code', when: sel => !!sel && 'id' in sel, component: ({ selection }) => <KindCode studio={studio} selection={selection} /> })

  // ---------------------------------------------------------------- the commands

  const path = z.string().describe('a code file, by its path from the repo: games/<game>/…, plugins/<p>/…, addons/<a>/… or extensions/<e>/…')
  const checked = (p: string) => { if (!codePath(p)) refuse(p); return p }
  const unsaved = (p: string) => { if (dirty(p)) throw new Error(`the Code panel holds changes to ${p} not saved: save or revert them first`) }
  // `p` written to hold `text`, or taken away with null, as one change of `edits`; the panel's copy
  // follows it.
  const write = async (edits: Edits, p: string, text: string | null) => {
    const was = await read(p)
    if (text === null && was === null) throw new Error(`${p} is not there`)
    await edits.route('code', 'save', { path: p, text, was })
    if (text === null) forget(p)
    else if (buffers.has(p)) buffers.set(p, { text, was: text })
    keep()
    ed.changed('x.code')
    if (was === null || text === null) await studio.list()
  }

  ed.command({
    id: 'code.files',
    title: 'Code: files',
    input: z.object({
      dir: z.string().optional().describe('a folder: only the code files under it, as games/<game>/plugins'),
    }).describe('The code files of the open game and of the plugins and addons its scenes name, by their paths from the repo, as the Code panel lists them.'),
    enabled: () => !!ed.session,
    run: async ({ dir }) => {
      const all = await studio.list()
      if (dir === undefined) return { files: all }
      const d = dir.replace(/\/+$/, '')
      return { files: all.filter(f => f.startsWith(`${d}/`)) }
    },
  })
  ed.command({
    id: 'code.read',
    title: 'Code: read',
    input: z.object({
      path,
      from: z.number().int().min(1).optional().describe('the first line to answer, from 1'),
      to: z.number().int().min(1).optional().describe('the last line to answer'),
    }).describe('A code file\'s text as it is on disk, or the lines from `from` to `to`, its count of lines, and whether the Code panel holds changes to it not saved.'),
    run: async ({ path: p, from, to }) => {
      checked(p)
      const text = await read(p)
      if (text === null) throw new Error(`${p} is not there`)
      const lines = text.split('\n')
      const a = from ?? 1, b = Math.min(to ?? lines.length, lines.length)
      if (a > lines.length) throw new Error(`${p} has ${lines.length} lines`)
      return { path: p, lines: lines.length, from: a, to: b, text: lines.slice(a - 1, b).join('\n'), unsaved: dirty(p) }
    },
  })
  ed.command({
    id: 'code.open',
    title: 'Code: open',
    input: z.object({ path, line: z.number().int().min(1).optional().describe('the line to show, from 1') }).describe('Shows a code file in the Code panel, at a line when one is named. Answers its count of lines.'),
    run: async ({ path: p, line }) => {
      await studio.show(checked(p), line)
      return { path: p, lines: buffers.get(p)!.text.split('\n').length }
    },
  })
  ed.command({
    id: 'code.write',
    title: 'Code: write',
    input: z.object({ path, text: z.string().describe('the file\'s whole new text') }).describe('Writes a code file whole, or makes it when it is not there, as one undo; the page reloads with it when it has imported it. Refused while the Code panel holds changes to it not saved.'),
    run: async ({ path: p, text }, edits) => {
      unsaved(checked(p))
      await write(edits, p, text)
      return { path: p, lines: text.split('\n').length }
    },
  })
  ed.command({
    id: 'code.remove',
    title: 'Code: remove',
    input: z.object({ path }).describe('Takes a code file away, as one undo, which makes it again; the page reloads without it when it has imported it. Refused while the Code panel holds changes to it not saved.'),
    run: async ({ path: p }, edits) => {
      unsaved(checked(p))
      await write(edits, p, null)
      return { removed: p }
    },
  })
  ed.command({
    id: 'code.save',
    title: 'Save Code',
    menu: 'File',
    key: 'Mod+S',
    enabled: () => !!studio.current && dirty(studio.current),
    run: () => studio.save(studio.current!),
  })
}
