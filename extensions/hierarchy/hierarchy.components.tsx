// The components of the hierarchy extension (hierarchy.extension.tsx).
import { useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { TextField } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, PanelBody, Toolbar } from '#editor/ui/layout.tsx'
import { Tree, type TreeItem } from '#editor/ui/tree.tsx'
import { duplicate, matches } from './hierarchy.extension.tsx'

const rowId = (scene: string, id: number) => `row:${scene}:${id}`

export function Hierarchy() {
  const ed = useEditor(['game', 'selection'])
  const [filter, setFilter] = useState('')
  const s = ed.session
  if (!s) return <Empty>No game is open.</Empty>
  const sel = ed.selection
  const selected = sel && 'scene' in sel ? ('id' in sel ? rowId(sel.scene, sel.id) : `scene:${sel.scene}`) : undefined
  const items: TreeItem[] = [...s.scenes()].map(([name, truth]) => ({
    id: `scene:${name}`,
    label: name,
    badge: <Badge>{truth.rows.length}</Badge>,
    children: truth.rows
      .filter(r => matches(r, filter))
      .map(r => ({
        id: rowId(name, r.id),
        label: <>{r.kind} <span className="ui-key">#{r.id}</span></>,
        badge: s.actor(name, r.id) ? <Badge tone="dim">actor</Badge> : undefined,
      })),
  }))
  const select = (id: string) => {
    const [what, scene, n] = id.split(':')
    ed.select(what === 'row' ? { scene, id: Number(n) } : { scene })
  }
  const row = sel && 'id' in sel ? s.row(sel.scene, sel.id) : undefined
  return (
    <PanelBody
      bar={
        <Toolbar label="rows">
          <TextField label="filter rows" value={filter} onChange={setFilter} />
          <Button title="duplicate the row" disabled={!row} onClick={() => { if (row && sel && 'id' in sel) ed.together(e => duplicate(ed, e, sel.scene, sel.id)) }}>Duplicate</Button>
          <Button title="end the row" disabled={!row} onClick={() => { if (sel && 'id' in sel) ed.end(sel.scene, sel.id) }}>End</Button>
        </Toolbar>
      }
    >
      <Tree label="scenes and rows" items={items} selected={selected} onSelect={select} open={[...s.scenes().keys()].map(n => `scene:${n}`)} />
    </PanelBody>
  )
}
