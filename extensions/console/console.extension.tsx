// What the editor has to say: a step that threw, with its stack, a file it could not write, an
// extension that would not load, and each game opened and closed.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here:
//   console.read   the lines, each with its index, which holds across a clear (`Editor.cleared`), so
//                  a call hands the last index it read as `since` and is answered the lines after it;
//   console.clear  empties the console, as Clear does (`Editor.clearLog`).
import { z } from 'zod'
import type { Editor } from '#editor/editor.ts'
import { Console } from './console.components.tsx'

export function console(ed: Editor) {
  ed.panel({ id: 'console', title: 'Console', area: 'bottom', component: Console })

  ed.command({
    id: 'console.read',
    title: 'Read the console',
    input: z.object({
      since: z.number().int().optional().describe('the index of the last line read: only the lines after it are answered'),
      level: z.enum(['info', 'error']).optional().describe('only the lines of this level'),
    }).describe('The editor\'s console: each line with its index, its level, its message, its time, and, for a step that threw, its stack. Answers `last`, the index of the last line there is, to hand as `since` next time, and how many errors the console holds.'),
    run: ({ since = -1, level }) => {
      const lines = ed.log
        .map((l, i) => ({ index: ed.cleared + i, level: l.level, message: l.message, at: new Date(l.at).toISOString(), ...(l.stack !== undefined && { stack: l.stack }) }))
        .filter(l => l.index > since && (level === undefined || l.level === level))
      return { lines, last: ed.cleared + ed.log.length - 1, errors: ed.log.filter(l => l.level === 'error').length }
    },
  })
  ed.command({
    id: 'console.clear',
    title: 'Clear the console',
    run: () => {
      const lines = ed.log.length
      ed.clearLog()
      return { cleared: lines }
    },
  })
}
