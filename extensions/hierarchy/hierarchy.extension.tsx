// Every scene of the open game and every row in it, at the step the game is at. A row an `actors`
// entry made is marked as one (`Session.actor`); the rest were spawned. The filter keeps the rows
// whose name, `<kind> #<id>`, has its text, whatever the case (`matches`). A row is duplicated or
// ended from here, and both are edits the recording keeps.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here:
//   rows.scenes     every scene, with its file, its rows by kind, and the scene the game view shows;
//   rows.list       a scene's rows, of one kind or through the filter, each with its kind, and its
//                   place among the scene's actors entries when one made it;
//   rows.spawn      a row of a kind the scene has a prefab of, from this step on;
//   rows.duplicate  a row spawned again with its data, as Duplicate does (`duplicate`);
//   rows.end        a row ended, as End does (`Edits.end`).
// Each change is one undo, and a row changed is answered with its data.
import { z } from 'zod'
import { ROW, type Edits, type Editor } from '#editor/editor.ts'
import type { Row } from '#engine/engine.ts'
import { Hierarchy } from './hierarchy.components.tsx'

// Whether row `r` is one the filter's text keeps: its name, `<kind> #<id>`, has the text, whatever
// the case; an empty filter keeps every row.
export const matches = (r: Row, filter: string) => !filter || `${r.kind} #${r.id}`.toLowerCase().includes(filter.toLowerCase())

// Row `id` of `scene` spawned again, of its kind and with a copy of its data, from this step on, as
// an edit of `e`. Answers the row it made.
export function duplicate(ed: Editor, e: Edits, scene: string, id: number): Row {
  const row = ed.rowOf(scene, id)
  return spawned(ed, scene, () => e.spawn(scene, row.kind, structuredClone(row.data)))
}

// The row `spawn` makes in `scene`: the one there after it that was not there before.
function spawned(ed: Editor, scene: string, spawn: () => void): Row {
  const had = new Set(ed.sceneOf(scene).rows.map(r => r.id))
  spawn()
  return ed.sceneOf(scene).rows.find(r => !had.has(r.id))!
}

export function hierarchy(ed: Editor) {
  ed.panel({ id: 'hierarchy', title: 'Hierarchy', area: 'left', lead: true, component: Hierarchy })

  ed.command({
    id: 'rows.scenes',
    title: 'Rows: scenes',
    input: z.object({}).describe('Every scene of the open game at the step it is at: its scene file, its actors file when it names one, how many rows it has and how many of each kind; and the scene the game view shows.'),
    run: () => {
      const s = ed.need()
      return {
        game: s.game.name,
        step: s.n,
        viewing: s.viewing ?? null,
        scenes: [...s.scenes()].map(([scene, truth]) => {
          const kinds: Record<string, number> = {}
          for (const r of truth.rows) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
          const actorsFile = s.actorsPath(scene)
          return { scene, file: s.path(scene), ...(actorsFile !== undefined && { actorsFile }), rows: truth.rows.length, kinds }
        }),
      }
    },
  })
  ed.command({
    id: 'rows.list',
    title: 'Rows: list',
    input: z.object({
      scene: ROW.scene,
      kind: z.string().optional().describe('only rows of this kind'),
      filter: z.string().optional().describe('only rows whose name, "<kind> #<id>", has this text, whatever the case, as the Hierarchy panel\'s filter keeps them'),
    }).describe('The rows of a scene at the step the game is at, in order: each one\'s id and kind, and, for a row an actors entry made, `actor`, its entry\'s place among the scene\'s actors (inspect.row says the entry and its file).'),
    run: ({ scene, kind, filter = '' }) => {
      const s = ed.need()
      const rows = ed.sceneOf(scene).rows
      if (kind !== undefined && !rows.some(r => r.kind === kind))
        throw new Error(`scene ${scene} has no ${kind} rows at step ${s.n}: its kinds are ${[...new Set(rows.map(r => r.kind))].join(', ')}`)
      return rows
        .filter(r => (kind === undefined || r.kind === kind) && matches(r, filter))
        .map(r => ({ id: r.id, kind: r.kind, ...(s.actor(scene, r.id) && { actor: r.id - 1 }) }))
    },
  })
  ed.command({
    id: 'rows.spawn',
    title: 'Rows: spawn',
    input: z.object({
      scene: ROW.scene,
      kind: z.string().describe('a kind the scene has a prefab of'),
      data: z.record(z.string(), z.unknown()).optional().describe('fields over the prefab\'s, by name'),
    }).describe('Spawns a row in a scene, its prefab with `data` over it, from this step on: an edit the recording keeps, one undo. Answers the row.'),
    run: ({ scene, kind, data }, e) => {
      // Every prefab its truth boots with, the manager's and its own over them.
      const kinds = Object.keys(ed.sceneOf(scene).scene.prefabs)
      if (!kinds.includes(kind)) throw new Error(`scene ${scene} has no prefab ${kind}: its prefabs are ${kinds.join(', ')}`)
      return spawned(ed, scene, () => e.spawn(scene, kind, data))
    },
  })
  ed.command({
    id: 'rows.duplicate',
    title: 'Rows: duplicate',
    input: z.object(ROW).describe('Spawns a row again, of its kind and with its data, from this step on, as the Hierarchy panel\'s Duplicate does: one undo. Answers the new row.'),
    run: ({ scene, id }, e) => duplicate(ed, e, scene, id),
  })
  ed.command({
    id: 'rows.end',
    title: 'Rows: end',
    input: z.object(ROW).describe('Ends a row from this step on, as the Hierarchy panel\'s End does: one undo. A row selected lets go of the selection to its scene. Answers the scene, the row ended and how many rows the scene has left.'),
    run: ({ scene, id }, e) => {
      ed.rowOf(scene, id)
      e.end(scene, id)
      return { scene, ended: id, rows: ed.sceneOf(scene).rows.length }
    },
  })
}
