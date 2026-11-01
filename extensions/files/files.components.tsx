// The components of the files extension (files.extension.tsx).
import { useEffect, useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { Empty, PanelBody } from '#editor/ui/layout.tsx'
import { Tree, type TreeItem } from '#editor/ui/tree.tsx'

// The paths as a tree of folders, from `root`.
function folders(paths: string[], root: string): TreeItem[] {
  const top: TreeItem[] = []
  const dirs = new Map<string, TreeItem>()
  const dir = (path: string): TreeItem[] => {
    if (path === root) return top
    const had = dirs.get(path)
    if (had) return had.children!
    const made: TreeItem = { id: `dir:${path}`, label: path.slice(path.lastIndexOf('/') + 1), children: [] }
    dirs.set(path, made)
    dir(path.slice(0, path.lastIndexOf('/'))).push(made)
    return made.children!
  }
  for (const p of paths) dir(p.slice(0, p.lastIndexOf('/'))).push({ id: p, label: p.slice(p.lastIndexOf('/') + 1) })
  return top
}

export function Files() {
  const ed = useEditor(['game', 'selection'])
  const game = ed.session?.game.name
  const [paths, setPaths] = useState<{ game: string; list: string[] } | undefined>(undefined)
  useEffect(() => {
    if (!game) return
    let live = true
    ed.dataFiles().then(
      list => { if (live) setPaths({ game, list }) },
      e => ed.error((e as Error).message),
    )
    return () => { live = false }
  }, [ed, game])
  if (!game) return <Empty>No game is open.</Empty>
  if (paths?.game !== game) return <Empty>Listing games/{game}…</Empty>
  const sel = ed.selection
  return (
    <PanelBody>
      <Tree
        label="files"
        clickOpens
        items={folders(paths.list, `games/${game}`)}
        selected={sel && 'file' in sel ? sel.file : undefined}
        onSelect={id => { if (!id.startsWith('dir:')) ed.select({ file: id }) }}
      />
    </PanelBody>
  )
}
