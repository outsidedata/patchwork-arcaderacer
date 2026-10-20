// What is selected, every value of it editable.
//
// A row shows three things. Its live data at this step: an edit there changes this run from this
// step on, and the recording keeps it. Its actor entry, when an `actors` entry made it (a row's id
// is its entry's place in the scene's actors, plus one: its scene file's `actors`, then its actors
// file's, `Session.actor`): the entry's fields over its prefab's, where editing a field the entry
// does not set yet writes it into the entry, and resetting one takes it back out (`editEntry`,
// `resetEntry`). A spawned row is saved as an actor entry, its fields that differ from its prefab,
// at the end of the scene's actors, in its actors file when it names one (`saveAsActor`). And its
// kind's prefab, in whichever scene file gives it. An edit to either file rebuilds the step from the
// files. Extensions add sections of their own below.
//
// A scene shows its `world`, drawn as the bindings of its scene file say of `world.*`, and every
// prefab its file gives; a file shows all of it, its values drawn as its bindings say
// (`Editor.bindFile`). A scene's definitions, the data file its `world.defs` names in the world it
// boots with (the manager's with its own over it), shows an entry per kind, each drawn as that
// kind's fields (`isDefs`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here:
//   inspect.row         a row: its data, its actor entry and the file it is in, its prefab and the
//                       file that gives it, and the type a binding gives each field (`Editor.typeOf`);
//   inspect.set         a field of a row's live data, from this step on (`Edits.editRow`);
//   inspect.entry       a field of a row's actor entry (`editEntry`);
//   inspect.reset       a field of a row's actor entry back to its prefab's (`resetEntry`);
//   inspect.saveAsActor a spawned row saved as an actor entry (`saveAsActor`);
//   inspect.scene       a scene's file: its world, its prefabs and its actors;
//   inspect.file        a data file, or a value in it;
//   inspect.edit        a value of a data file set, inserted into a list or removed
//                       (`Edits.editFile`), as a field of a prefab, a world or a file is edited here.
// Each change is one undo. A long value is answered in outline (`outlined`), which `inspect.file`
// reads at its path.
import { z } from 'zod'
import { put, type Path } from '#addons/recorder/recorder.addon.ts'
import { outlined, OUTLINE, ROW, type Edits, type Editor } from '#editor/editor.ts'
import { Inspector } from './inspector.components.tsx'

// Row `id` of `scene` as the inspector shows it: the row, its scene file, its kind's prefab and the
// file that gives it (the scene's own, else the manager's), and, for a row an actors entry made,
// that entry and where it is written (`actor`), and its fields over the prefab's (`merged`).
export function inspected(ed: Editor, scene: string, id: number) {
  const s = ed.need()
  const row = ed.rowOf(scene, id)
  const path = s.path(scene)
  const file = ed.prefabFile(scene, row.kind)
  const prefabPath = row.kind in (s.files.get(file)?.prefabs ?? {}) ? file : undefined
  const prefab = prefabPath === undefined ? undefined : (s.files.get(prefabPath)!.prefabs[row.kind] as Record<string, unknown>)
  const actor = s.actor(scene, id)
  const merged = actor && { ...structuredClone(prefab ?? {}), ...Object.fromEntries(Object.entries(actor.entry).filter(([k]) => k !== 'is')) }
  return { scene, row, path, prefab, prefabPath, actor, merged }
}
export type Inspected = ReturnType<typeof inspected>

// The actors entry of an inspected row, refused for a row no entry made.
function entryOf({ scene, row, actor, merged }: Inspected) {
  if (!actor || !merged) throw new Error(`row ${row.id} of ${scene}, a ${row.kind}, was spawned: no actors entry made it (inspect.saveAsActor saves it as one)`)
  return { ...actor, merged }
}

// The field at `at` of an inspected row's actor entry set to `value`, as an edit of `e`: in the entry
// when it sets that field already, and else the whole field, its prefab's value with `value` put in
// at `at`, written into the entry.
export async function editEntry(e: Edits, it: Inspected, at: Path, value: unknown): Promise<void> {
  const { file, at: entryAt, entry, merged } = entryOf(it)
  const [top, ...rest] = at
  if (top === 'is') throw new Error('an entry\'s `is` is its kind, not a field: spawn a row of the other kind instead')
  if (top in entry) return e.editFile(file, [...entryAt, ...at], value)
  if (rest.length && !(top in merged)) throw new Error(`row ${it.row.id} of ${it.scene}: its actors entry and its prefab have no field ${top}: they have ${Object.keys(merged).join(', ')}`)
  const whole = structuredClone(merged[top as string])
  if (rest.length) put(whole, rest, value)
  return e.editFile(file, [...entryAt, top], rest.length ? whole : value)
}

// Field `field` of an inspected row's actor entry taken out, so the row has its prefab's, as an edit
// of `e`; a field the entry does not set is refused, naming those it sets.
export async function resetEntry(e: Edits, it: Inspected, field: string): Promise<void> {
  const { file, at, entry } = entryOf(it)
  const set = Object.keys(entry).filter(k => k !== 'is')
  if (!set.includes(field)) throw new Error(`row ${it.row.id} of ${it.scene}: its actors entry sets no ${field}: it sets ${set.join(', ') || 'nothing'}`)
  return e.editFile(file, [...at, field], undefined)
}

// The fields of an inspected row that differ from its prefab: what an actor entry for it holds.
const asEntry = ({ row, prefab }: Inspected) =>
  ({ is: row.kind, ...Object.fromEntries(Object.entries(row.data).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(prefab?.[k]))) })

// Row `id` of `scene`, spawned, saved as an actors entry at the end of its scene's actors, as an edit
// of `e`: in the actors file the scene file names, when it names one, else in the scene file's own
// `actors`. Answers the file, where in it, and the entry.
export async function saveAsActor(ed: Editor, e: Edits, scene: string, id: number) {
  const it = inspected(ed, scene, id)
  if (it.actor) throw new Error(`row ${id} of ${scene} was made by an actors entry already: ${it.actor.file} at [${it.actor.at.join(', ')}]`)
  const listed = ed.need().actorsPath(scene)
  const file = listed ?? it.path
  const entry = asEntry(it)
  await e.editFile(file, listed ? [-1] : ['actors', -1], entry, true)
  const written = JSON.parse(await ed.text(file))
  return { file, at: [...(listed ? [] : ['actors']), (listed ? written : written.actors).length - 1], entry }
}

// Whether a file is the definitions of a scene of the open game: the data file its `world.defs`
// names in its catalogue, an entry per kind, each read off the world the scene boots with, its own
// over the manager's, as a game that names its catalogue once in its manager's file does.
export function isDefs(ed: Editor, file: string) {
  const url = '/' + file
  return [...(ed.session?.scenes().values() ?? [])].some(({ world }) => {
    const defs = (world as { defs?: unknown }).defs
    const asset = typeof defs === 'string' ? (world.loader?.assets as Record<string, { url?: string }> | undefined)?.[defs] : undefined
    return asset?.url === url
  })
}

// The types bindings give the fields of `value`, at every depth, by each field's path from `at`
// joined by dots, as the property grid finds them: a field bound to a type is drawn by it, and an
// object or a list no binding types is opened into its own fields.
function typesOf(ed: Editor, owner: { kind?: string; file?: string }, value: unknown, at: Path = [], out: Record<string, string> = {}) {
  if (value === null || typeof value !== 'object') return out
  for (const [k, v] of Object.entries(value)) {
    const path = [...at, Array.isArray(value) ? Number(k) : k]
    const type = ed.typeOf(owner.kind, path, owner.file)
    if (type) out[path.join('.')] = type
    else typesOf(ed, owner, v, path, out)
  }
  return out
}
// The types of the value at `at`: the one a binding gives it, when one does, as the grid draws it by
// that type whole; else those of its fields.
const typesAt = (ed: Editor, owner: { kind?: string; file?: string }, value: unknown, at: Path) => {
  const own = at.length ? ed.typeOf(owner.kind, at, owner.file) : undefined
  return own ? { [at.join('.')]: own } : typesOf(ed, owner, value, at)
}

// The value at `at` inside `value`; a key or an index it has not got is refused, naming those it has.
function valueAt(value: unknown, at: Path, file: string): unknown {
  let here = value
  for (let i = 0; i < at.length; i++) {
    const k = at[i]
    if (here === null || typeof here !== 'object' || !(k in here)) {
      const where = `[${at.slice(0, i).join(', ')}]`
      const has = here !== null && typeof here === 'object' ? (Array.isArray(here) ? `a list of ${here.length}` : `keys ${Object.keys(here).join(', ')}`) : `the value ${JSON.stringify(here)}`
      throw new Error(`${file} has no ${JSON.stringify(k)} at ${where}: there it has ${has}`)
    }
    here = (here as Record<string | number, unknown>)[k]
  }
  return here
}

// A data file of the open game, read and parsed; one that is not a data file is refused, naming them.
async function readData(ed: Editor, file: string): Promise<unknown> {
  await ed.dataFile(file)
  return JSON.parse(await ed.text(file))
}

const OUTLINED = `${OUTLINE} inspect.file reads it at its path.`
const key = z.union([z.string(), z.number().int()]).describe('a key of an object, or an index of a list')

export function inspector(ed: Editor) {
  ed.panel({ id: 'inspector', title: 'Inspector', area: 'right', lead: true, component: Inspector })

  // A row as `inspect.row` answers it, and each command that changes it.
  const shown = (scene: string, id: number) => {
    const it = inspected(ed, scene, id)
    return {
      scene, id, kind: it.row.kind, step: ed.need().n,
      data: outlined(it.row.data),
      types: typesOf(ed, { kind: it.row.kind }, it.row.data),
      ...(it.actor && { entry: { file: it.actor.file, at: it.actor.at, fields: outlined(it.actor.entry), merged: outlined(it.merged) } }),
      ...(it.prefabPath !== undefined && { prefab: { file: it.prefabPath, at: ['prefabs', it.row.kind], value: outlined(it.prefab) } }),
    }
  }
  ed.command({
    id: 'inspect.row',
    title: 'Inspect a row',
    input: z.object(ROW).describe(`A row at the step the game is at, as the inspector shows it: its data; its actors entry, when one made it, with the file and the path it is at and its fields over the prefab's (merged); its prefab, with the file that gives it; and the type a binding gives each field, by its path. ${OUTLINED}`),
    run: ({ scene, id }) => shown(scene, id),
  })
  ed.command({
    id: 'inspect.set',
    title: 'Set a field of a row',
    input: z.object({
      ...ROW,
      path: z.array(key).min(1).describe('the field, by its path in the row\'s data: ["pos", 0] is pos[0]'),
      value: z.unknown().describe('the JSON value to set it to'),
    }).describe('Sets a field of a row\'s live data from this step on, as editing the inspector\'s Row section does: an edit the recording keeps, one undo. Answers the row as inspect.row does.'),
    run: ({ scene, id, path, value }, e) => {
      ed.rowOf(scene, id)
      e.editRow(scene, id, path, value)
      return shown(scene, id)
    },
  })
  ed.command({
    id: 'inspect.entry',
    title: 'Set a field of a row\'s actor entry',
    input: z.object({
      ...ROW,
      path: z.array(key).min(1).describe('the field, by its path in the entry\'s fields over the prefab\'s: ["pos", 0] is pos[0]'),
      value: z.unknown().describe('the JSON value to set it to'),
    }).describe('Sets a field of the actors entry a row was made from, as editing the inspector\'s Actor entry section does: a field the entry does not set yet is written into it whole, the prefab\'s with the value put in. One undo; the step is rebuilt from the files. Answers the row as inspect.row does.'),
    run: async ({ scene, id, path, value }, e) => {
      await editEntry(e, inspected(ed, scene, id), path, value)
      return shown(scene, id)
    },
  })
  ed.command({
    id: 'inspect.reset',
    title: 'Reset a field of a row\'s actor entry',
    input: z.object({ ...ROW, field: z.string().describe('a field the entry sets, by its name') }).describe('Takes a field out of the actors entry a row was made from, so the row has its prefab\'s, as the inspector\'s reset button does. One undo; the step is rebuilt from the files. Answers the row as inspect.row does.'),
    run: async ({ scene, id, field }, e) => {
      await resetEntry(e, inspected(ed, scene, id), field)
      return shown(scene, id)
    },
  })
  ed.command({
    id: 'inspect.saveAsActor',
    title: 'Save a row as an actor entry',
    input: z.object(ROW).describe('Saves a spawned row as an actors entry, its fields that differ from its prefab, at the end of its scene\'s actors (in the actors file the scene names, when it names one), as the inspector\'s Save as actor does: one undo. The step is rebuilt from the files, where the entry makes a row from step 0. Answers the file, the path and the entry.'),
    run: ({ scene, id }, e) => saveAsActor(ed, e, scene, id),
  })
  ed.command({
    id: 'inspect.scene',
    title: 'Inspect a scene',
    input: z.object({ scene: ROW.scene }).describe(`A scene as its own file gives it, as the inspector shows it: the file, its world, its prefabs and its actors entries, the actors file it names with that file's entries, and the type a binding gives each field of its world and its prefabs, by its path. ${OUTLINED}`),
    run: ({ scene }) => {
      const s = ed.need()
      ed.sceneOf(scene)
      const path = s.path(scene), file = s.files.get(path)!
      const listed = s.actorsPath(scene)
      const prefabs = file.prefabs ?? {}
      return {
        scene, file: path,
        world: outlined(file.world ?? {}),
        prefabs: outlined(prefabs),
        actors: outlined(file.actors),
        ...(listed !== undefined && { actorsFile: { file: listed, actors: outlined(s.lists.get(listed) ?? []) } }),
        types: {
          world: typesOf(ed, { file: path }, file.world ?? {}, ['world']),
          prefabs: Object.fromEntries(Object.entries(prefabs).map(([kind, p]) => [kind, typesOf(ed, { kind }, p)])),
        },
      }
    },
  })
  ed.command({
    id: 'inspect.file',
    title: 'Inspect a data file',
    input: z.object({
      path: z.string().describe('a data file of the open game, by its path from the repo, as files.list lists them'),
      at: z.array(key).default([]).describe('the path of the value to read in it; the whole file when left out'),
    }).describe(`A data file of the open game, or the value at a path in it, as the inspector shows a file: the value, and the type a binding gives each of its fields, by its path; a scene's definitions by kind, each by its kind's. ${OUTLINED}`),
    run: async ({ path, at }) => {
      const whole = await readData(ed, path)
      const value = valueAt(whole, at, path)
      // A scene's definitions are each their kind's, typed by its bindings from the entry's top.
      const defs = whole !== null && typeof whole === 'object' && !Array.isArray(whole) && isDefs(ed, path)
      const types = !defs
        ? typesAt(ed, { file: path }, value, at)
        : at.length
          ? { [at[0]]: typesAt(ed, { kind: String(at[0]) }, value, at.slice(1)) }
          : Object.fromEntries(Object.entries(whole as Record<string, unknown>).map(([kind, def]) => [kind, typesOf(ed, { kind }, def)]))
      return { file: path, at, value: outlined(value), types }
    },
  })
  ed.command({
    id: 'inspect.edit',
    title: 'Edit a data file',
    input: z.object({
      path: z.string().describe('a data file of the open game, by its path from the repo, as files.list lists them'),
      at: z.array(key).min(1).describe('the path of the value in it: ["world", "speed"], or ["prefabs", "coin", "x"]'),
      value: z.unknown().optional().describe('the JSON value to set there, or to insert; hand this or remove'),
      insert: z.boolean().default(false).describe('insert value into the list `at` ends in, before the index it ends with, -1 for its end, rather than set it'),
      remove: z.boolean().default(false).describe('take the value at `at` out, a key from its object or an item from its list; hand this or value'),
    }).describe('Writes one value of a data file, as editing a field of a file, a scene\'s world or a prefab in the inspector does: set, inserted into a list, or removed, the rest of the file as it was written. One undo; the step is rebuilt from the files. Answers the value there now.'),
    run: async ({ path, at, value, insert, remove }, e) => {
      const before = await readData(ed, path)
      if (remove && value !== undefined) throw new Error('hand value to write it, or remove to take the value out, not both')
      if (!remove && value === undefined) throw new Error('hand value to write at `at`, or remove: true to take the value there out')
      if (remove && insert) throw new Error('remove takes a value out, and insert puts one in: hand one of them')
      const last = at[at.length - 1]
      // Where the value lands: an item inserted at an index before 0 or past the end goes on the end.
      let landed = at
      if (insert) {
        const list = valueAt(before, at.slice(0, -1), path)
        if (!Array.isArray(list) || typeof last !== 'number') throw new Error(`insert puts an item into a list, at an index: [${at.slice(0, -1).join(', ')}] of ${path} is no list, or ${JSON.stringify(last)} no index`)
        if (last < 0 || last > list.length) landed = [...at.slice(0, -1), list.length]
      } else if (remove) valueAt(before, at, path)
      else {
        // A value is set in an object or a list that is there: a key it lacks goes in, an item it
        // lacks does not, and nothing is made around it.
        const into = valueAt(before, at.slice(0, -1), path)
        if (into === null || typeof into !== 'object') throw new Error(`[${at.slice(0, -1).join(', ')}] of ${path} is ${JSON.stringify(into)}, no object or list to set ${JSON.stringify(last)} in`)
        if (Array.isArray(into) && !(typeof last === 'number' && last >= 0 && last < into.length)) throw new Error(`[${at.slice(0, -1).join(', ')}] of ${path} is a list of ${into.length}: set an item at an index from 0 to ${into.length - 1}, or insert one`)
      }
      await e.editFile(path, at, remove ? undefined : value, insert)
      if (remove) return { file: path, at, removed: true }
      return { file: path, at: landed, value: outlined(valueAt(JSON.parse(await ed.text(path)), landed, path)) }
    },
  })
}
