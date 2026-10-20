// The open game's data files: its scene files and everything in `assets/` a machine or a person
// writes as JSON (`Editor.dataFiles`). Selecting one shows all of it in the inspector, every value
// editable.
//
// Its command, for an LLM calling it (`editor/mcp.ts`):
//   files.list  the data files the panel lists, or those in one folder of the game's; one is
//               selected with `edit.select`, read with `inspect.file` and edited with `inspect.edit`.
import { z } from 'zod'
import type { Editor } from '#editor/editor.ts'
import { Files } from './files.components.tsx'

const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/'))

export function files(ed: Editor) {
  ed.panel({ id: 'files', title: 'Files', area: 'left', component: Files })

  ed.command({
    id: 'files.list',
    title: 'List the data files',
    input: z.object({
      dir: z.string().optional().describe('a folder of the game\'s, by its path from the repo, as games/<game>/assets: only the data files in it, at any depth'),
    }).describe('The open game\'s data files, as the Files panel lists them: its scene files and every JSON file in its folder, by their paths from the repo.'),
    run: async ({ dir }) => {
      const all = await ed.dataFiles()
      if (dir === undefined) return { files: all }
      const d = dir.replace(/\/+$/, '')
      const got = all.filter(p => p.startsWith(`${d}/`))
      if (!got.length) throw new Error(`no data file of ${ed.need().game.name} is in ${dir}: the folders that hold them are ${[...new Set(all.map(folderOf))].sort().join(', ')}`)
      return { files: got }
    },
  })
}
