// The actors extension's components (`actors.extension.tsx`): the Actors panel.
import { useEditor } from '#editor/context.ts'
import { Select } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Section, Strip, Toolbar } from '#editor/ui/layout.tsx'
import { placeable, SNAPS, type Studio } from './actors.extension.tsx'

// The scene the panel works on: the one selected, else the one the game view shows.
function sceneOf(ed: ReturnType<typeof useEditor>): string | undefined {
  const sel = ed.selection
  return sel && 'scene' in sel ? sel.scene : ed.session?.viewing
}

// Drawn again for the game, the selection, the placers extensions add (`placeable`), the tool the view
// is in, and the studio's kind and snap.
export function ActorsPanel({ studio }: { studio: Studio }) {
  const ed = useEditor(['game', 'selection', 'extensions', 'tools', 'x.actors'])
  const s = ed.session
  if (!s) return <Empty>Open a game to place its actors.</Empty>
  const scene = sceneOf(ed)
  if (!scene) return <Empty>Select a scene, or step the game so the view shows one.</Empty>
  const kinds = placeable(ed, scene)
  const rows = s.scene(scene).rows
  const count = (k: string) => rows.filter(r => r.kind === k && s.actor(scene, r.id)).length
  const sel = ed.selection && 'id' in ed.selection && ed.selection.scene === scene ? ed.selection : undefined
  const row = sel && s.row(scene, sel.id)
  const actor = sel && s.actor(scene, sel.id)
  const run = (id: string) => ed.call(id).catch(e => ed.error((e as Error).message, (e as Error).stack))
  const bar = (
    <Toolbar label="Actors">
      <Button title="Place: a click writes an actor of the kind picked" pressed={ed.tooling === 'actors.place'} onClick={() => ed.activate('actors.place')}>Place</Button>
      <Button title="Arrange: a drag moves an actor in its file" pressed={ed.tooling === 'actors.arrange'} onClick={() => ed.activate('actors.arrange')}>Arrange</Button>
      <Select<number> label="snap" value={studio.snap} options={SNAPS.map(v => ({ value: v, label: v ? `snap ${v}` : 'no snap' }))} onChange={v => studio.setSnap(v)} />
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Section title={`Kinds to place in ${scene}`}>
        {kinds.length
          ? <Strip label="Kinds to place" wrap items={kinds.map(k => ({ id: k, title: `Place ${k}`, node: <>{k}<Badge>{count(k)}</Badge></> }))} selected={studio.kind} onSelect={id => studio.pick(String(id))} />
          : <Note>No kind of {scene} stands on a point a placer reads.</Note>}
      </Section>
      {row && (
        <Section title={`${row.kind} #${row.id}`}>
          {actor
            ? <LabelledRow label="entry"><span className="ui-mono">{actor.file} [{actor.at.join(', ')}]</span></LabelledRow>
            : <Note>Spawned: no actors entry made it.</Note>}
          <Button title={`Delete ${row.kind} #${row.id} from ${scene}'s actors`} disabled={!actor} onClick={() => void run('actors.delete')}>Delete</Button>
        </Section>
      )}
    </PanelBody>
  )
}
