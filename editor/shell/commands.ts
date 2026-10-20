// The shell's commands, the editor's own: opening another game, undo and redo and what they
// take back, what is selected, the panels shown, the theme, the layout and the keys. The page's
// shell turns them on as the extension `shell` (`App.tsx`), handing them how to open its dialogs,
// and the boundary test of the MCP tools (`editor/mcp.test.tsx`) turns the same on, so each is held
// to being a tool an LLM can call.
//
// What a menu, a key and a call do is one function: `edit.undo` is Edit › Undo and Mod+Z, and
// `view.theme` is View › Theme, `Editor.setTheme` for each. The asked ones are for an LLM:
//   edit.select     selects a row, a scene or a file, or nothing, as a click in a panel does;
//   edit.selection  what is selected;
//   edit.history    what `edit.undo` takes back and `edit.redo` makes again, a change at a time;
//   view.show       shows a panel, as View › <panel> does;
//   view.theme      puts a theme on the editor;
//   view.perf       what drawing has cost, each panel's drawings and the changes of each topic
//                   (`Editor.perf`), and with `reset` counted again from now.
import { z } from 'zod'
import { BUDGET, outlined, type Change, type Editor, type Selection } from '../editor.ts'
import type { Op } from '../files.ts'
import { resetLayout } from './layout.ts'

export type ShellDialog = 'open' | 'keys'

export function shell(ed: Editor, show: (dialog: ShellDialog) => void) {
  ed.command({ id: 'file.open', title: 'Open Game…', menu: 'File', key: 'Mod+O', run: () => show('open') })
  // A change is in the history from the moment it is sent, so Undo is enabled as soon as one is.
  ed.command({ id: 'edit.undo', title: 'Undo', menu: 'Edit', key: 'Mod+Z', run: () => ed.undo(), enabled: () => ed.undos.length > 0 })
  ed.command({ id: 'edit.redo', title: 'Redo', menu: 'Edit', key: 'Mod+Shift+Z', run: () => ed.redo(), enabled: () => ed.redos.length > 0 })
  ed.command({ id: 'view.reset', title: 'Reset Layout', menu: 'View', run: resetLayout })
  ed.command({ id: 'help.keys', title: 'Keyboard Shortcuts', menu: 'Help', run: () => show('keys') })

  ed.command({
    id: 'edit.select',
    title: 'Select',
    input: z.object({
      scene: z.string().optional().describe('a scene of the open game: selected alone, or the scene of the row `id`'),
      id: z.number().int().optional().describe('a row of `scene`, by its id'),
      file: z.string().optional().describe('a data file of the open game, a JSON file by its path from the repo as the Files panel lists it, selected alone'),
    }).describe('Selects a row (scene and id), a scene (scene alone) or a file (file alone), which the inspector shows and the panels that follow the selection work on; nothing handed selects nothing. Answers the selection.'),
    run: async args => {
      ed.select(await selection(ed, args))
      return selected(ed)
    },
  })
  ed.command({
    id: 'edit.selection',
    title: 'Selection',
    input: z.object({}).describe('What is selected: a row, with its kind, a scene, or a file; null when nothing is.'),
    run: () => selected(ed),
  })
  ed.command({
    id: 'edit.history',
    title: 'History',
    input: z.object({}).describe(`What edit.undo takes back, the next first, and what edit.redo makes again, the next first. Each change: a change of the files, the files it wrote and the ops it was sent as, each a value written at its path in a file, or removed, or inserted into a list, a whole file written or taken away, or an extension's route run (no ops for one made before the page last reloaded); its row edits, by the step they are from; the recording after step at made to end at end; or the changes of one action. A value longer than ${BRIEF} characters of JSON is told in outline: \`long\` its length, its short \`fields\` and the length of each of its \`longFields\`, or its \`items\`.`),
    run: () => ({ undo: [...ed.undos].reverse().map(told), redo: [...ed.redos].reverse().map(told) }),
  })
  ed.command({
    id: 'view.show',
    title: 'Show a panel',
    input: z.object({ panel: z.string().describe('a panel by its id, as game or inspector; one there is not is refused, naming every id') }).describe('Shows a panel of the editor, opening it where it goes when it is closed, so the person in the editor sees what you work on. Answers its id and title.'),
    run: ({ panel }) => {
      const p = ed.panels.get(panel)
      if (!p) throw new Error(`no panel ${panel}: the panels are ${[...ed.panels.keys()].join(', ')}`)
      if (!ed.revealer) throw new Error(`the editor's page has no dock to show the panel ${panel} in`)
      ed.reveal(panel)
      return { panel, title: p.title }
    },
  })
  ed.command({
    id: 'view.theme',
    title: 'Theme',
    input: z.object({ name: z.string().describe('a theme: dark, light, or one an extension ships') }).describe('Puts a theme on the editor, as View › Theme does; the page keeps it for the next load. Answers the theme.'),
    run: ({ name }) => {
      ed.setTheme(name)
      return { theme: ed.theme }
    },
  })
  ed.command({
    id: 'view.perf',
    title: 'Drawing cost',
    input: z.object({
      reset: z.boolean().optional().describe('counted again from now, once these numbers are answered'),
    }).describe(`What drawing the editor has cost since the page loaded or the last reset: each docked panel, the most costly first, with how many times it was drawn, the milliseconds of all of them and the most one took (a panel drawn in more than ${BUDGET} ms, one frame, is said in the console); and how many changes of each topic the editor told.`),
    run: ({ reset }) => ed.perf(reset),
  })
}

// What `edit.select` is handed, as a selection: a file alone, a row by its scene and id, a scene
// alone, or nothing. A scene, a row or a data file of the open game there is not is refused.
async function selection(ed: Editor, { scene, id, file }: { scene?: string; id?: number; file?: string }): Promise<Selection> {
  if (file !== undefined) {
    if (scene !== undefined || id !== undefined) throw new Error('a file is selected alone: hand file, or scene with an id or without')
    return { file: await ed.dataFile(file) }
  }
  if (id !== undefined) {
    if (scene === undefined) throw new Error(`a row is selected by its scene and its id: hand the scene of row ${id}`)
    ed.rowOf(scene, id)
    return { scene, id }
  }
  if (scene !== undefined) {
    ed.sceneOf(scene)
    return { scene }
  }
  return undefined
}

// The selection as a call is answered it: a row with its kind, while it is live, a scene or a file,
// or null.
function selected(ed: Editor) {
  const sel = ed.selection
  if (!sel) return null
  if (!('id' in sel)) return sel
  const kind = ed.session?.row(sel.scene, sel.id)?.kind
  return { ...sel, ...(kind !== undefined && { kind }) }
}

// A value as the history tells it: in outline when its JSON is longer than `BRIEF` characters.
const BRIEF = 200
const brief = (v: unknown) => outlined(v, BRIEF)

// One op a change of the files was sent as: a value written in a file at its path, `removed` for one
// taken out and `insert` for one put into a list; a whole file written, its text or its bytes, or
// taken away; or an extension's route run, by its owner and its name.
function toldOp(o: Op) {
  if ('json' in o) return { file: o.json, at: o.at, ...(o.value === undefined ? { removed: true } : { value: brief(o.value) }), ...(o.insert && { insert: true }) }
  if ('text' in o) return { file: o.text, ...(o.value === null ? { removed: true } : { text: brief(o.value) }) }
  if ('bytes' in o) return { file: o.bytes, ...(o.value === null ? { removed: true } : { bytes: true }) }
  return { route: { owner: o.route.owner, route: o.route.route } }
}

// A change as `edit.history` tells it.
function told(c: Change): unknown {
  if ('steps' in c) return { steps: c.steps.map(told) }
  if ('change' in c) return { files: c.files, ...(c.ops && { ops: c.ops.map(toldOp) }) }
  // What the change makes of the recording after step `at`: it ends at `end`, with `entries`
  // entries after `at`.
  if ('recording' in c) return { recording: { at: c.recording.at, end: c.recording.tail.end, entries: c.recording.tail.entries.length } }
  const { at, ...edit } = c.row
  if ('set' in edit) return { row: { step: at, set: { ...edit.set, value: brief(edit.set.value) } } }
  if ('spawn' in edit) return { row: { step: at, spawn: { ...edit.spawn, data: brief(edit.spawn.data) } } }
  return { row: { step: at, ...edit } }
}
