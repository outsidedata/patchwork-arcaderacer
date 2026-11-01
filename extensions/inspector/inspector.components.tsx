// The components of the inspector extension (inspector.extension.tsx).
import type { Path } from '#addons/recorder/recorder.addon.ts'
import { useEditor, useText } from '#editor/context.ts'
import type { Editor } from '#editor/editor.ts'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, PanelBody, Section } from '#editor/ui/layout.tsx'
import { editEntry, inspected, isDefs, resetEntry, saveAsActor } from './inspector.extension.tsx'

// A write that failed, written to the console, unless the editor has written it there already.
const fail = (ed: Editor) => (e: unknown) => { if (!ed.said(e)) ed.error((e as Error).message, (e as Error).stack) }

export function RowInspector({ scene, id }: { scene: string; id: number }) {
  const ed = useEditor(['game'])
  const s = ed.session!
  if (!s.row(scene, id)) return <Empty>Row #{id} is not in {scene} at step {s.n}.</Empty>
  const it = inspected(ed, scene, id)
  const { row, path, prefab, prefabPath, actor, merged } = it

  return (
    <>
      <Section title={<>Row <Badge>step {s.n}</Badge></>} extra={!actor && <Button title="save as an actor entry" onClick={() => void ed.together(e => saveAsActor(ed, e, scene, id)).catch(fail(ed))}>Save as actor</Button>}>
        <PropertyGrid
          value={row.data}
          owner={{ kind: row.kind, scene, row: id, data: row.data }}
          onChange={(at, v, done) => (done ? ed.editRow(scene, id, at, v) : s.preview(scene, id, at, v))}
        />
      </Section>
      {actor && merged && (
        <Section title={<>Actor entry <Badge>{actor.file === path ? `${path} · actors[${actor.at[1]}]` : `${actor.file} · [${actor.at[0]}]`}</Badge></>}>
          <PropertyGrid
            value={merged}
            owner={{ kind: row.kind, scene, data: merged }}
            onChange={(at, v, done) => { if (done) void ed.together(e => editEntry(e, it, at, v)).catch(fail(ed)) }}
            extra={at => at.length === 1 && at[0] in actor.entry
              ? <Button title={`reset ${at[0]} to the prefab`} onClick={() => void ed.together(e => resetEntry(e, it, String(at[0]))).catch(fail(ed))}>reset</Button>
              : null}
          />
        </Section>
      )}
      {prefab && prefabPath && (
        <Section title={<>Prefab <Badge>{prefabPath} · {row.kind}</Badge></>} open={!actor}>
          <PropertyGrid value={prefab} owner={{ kind: row.kind, scene, data: prefab }} onChange={(at, v, done) => { if (done) void ed.editFile(prefabPath, ['prefabs', row.kind, ...at], v).catch(fail(ed)) }} />
        </Section>
      )}
    </>
  )
}

export function SceneInspector({ scene }: { scene: string }) {
  const ed = useEditor(['game'])
  const s = ed.session!
  const path = s.path(scene)
  const file = s.files.get(path)!
  const write = (at: Path) => (v: unknown) => void ed.editFile(path, at, v).catch(fail(ed))
  return (
    <>
      <Section title={<>World <Badge>{path}</Badge></>}>
        <PropertyGrid value={file.world ?? {}} owner={{ scene, file: path }} at={['world']} top={1} onChange={(at, v, done) => { if (done) write(at)(v) }} />
      </Section>
      {Object.entries(file.prefabs ?? {}).map(([name, prefab]) => (
        <Section key={name} title={<>{name} <Badge tone="dim">prefab</Badge></>} open={false}>
          <PropertyGrid value={prefab} owner={{ kind: name, scene, data: prefab }} onChange={(at, v, done) => { if (done) write(['prefabs', name, ...at])(v) }} />
        </Section>
      ))}
    </>
  )
}

// Drawn again for the file's text (`useText`), and for the game, which says whether it is a scene's
// definitions (`isDefs`).
export function FileInspector({ file }: { file: string }) {
  const ed = useEditor(['game'])
  const text = useText(file)
  if (text === undefined) return <Empty>Reading {file}…</Empty>
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (e) {
    return <Empty>{file} is not JSON: {(e as Error).message}</Empty>
  }
  if (value === null || typeof value !== 'object') return <Empty>{file} holds {String(value)}.</Empty>
  const write = (at: Path, v: unknown) => void ed.editFile(file, at, v).catch(fail(ed))
  // A scene's definitions: each entry is a kind's, and shows as that kind's fields.
  if (!Array.isArray(value) && isDefs(ed, file))
    return (
      <>
        {Object.entries(value as Record<string, unknown>).map(([kind, def]) => (
          <Section key={kind} title={<>{kind} <Badge tone="dim">definition</Badge></>} open={false}>
            {def !== null && typeof def === 'object'
              ? <PropertyGrid value={def as Record<string, unknown>} owner={{ kind, data: def as Record<string, unknown> }} onChange={(at, v, done) => { if (done) write([kind, ...at], v) }} />
              : <PropertyGrid value={{ [kind]: def }} owner={{ file }} onChange={(at, v, done) => { if (done) write(at, v) }} />}
          </Section>
        ))}
      </>
    )
  return (
    <Section title={<>{file}</>}>
      <PropertyGrid value={value as Record<string, unknown>} owner={{ file }} onChange={(at, v, done) => { if (done) write(at, v) }} />
    </Section>
  )
}

// Drawn again for the selection, the sections extensions add, and the game, off which each section's
// `when` reads whether it shows.
export function Inspector() {
  const ed = useEditor(['selection', 'game', 'extensions'])
  const sel = ed.selection
  if (!sel) return <Empty>Nothing is selected.</Empty>
  if (!('file' in sel) && !ed.session) return <Empty>No game is open.</Empty>
  return (
    <PanelBody>
      {'file' in sel ? <FileInspector file={sel.file} /> : 'id' in sel ? <RowInspector scene={sel.scene} id={sel.id} /> : <SceneInspector scene={sel.scene} />}
      {ed.sections.filter(x => x.when(sel)).map(x => (
        <Section key={x.id} title={x.title}>
          <x.component selection={sel} />
        </Section>
      ))}
    </PanelBody>
  )
}
