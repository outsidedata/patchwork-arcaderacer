// The components of the scenemanager's extension (scenemanager.extension.tsx): the field of a scene's
// name, and the Scenes panel with its New scene form.
import { useState } from 'react'
import { useEditor } from '#editor/context.ts'
import type { FieldProps } from '#editor/editor.ts'
import { Check, Select, TextField } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { Tree } from '#editor/ui/tree.tsx'
import { namedEntries, scenesOf } from './scenemanager.extension.tsx'

// A scene of the open game's table; a name it has not got is kept and marked so.
export function SceneName({ value, onChange, label }: FieldProps<string>) {
  const names = Object.keys(scenesOf(useEditor(['game'])))
  const options = [...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (no scene of the game)` }))
  return <Select<string> label={label} value={value} options={options} onChange={onChange} />
}

type Draft = { name: string; from: string; keep: string[]; own: string[] }

// The open game's scenes, the one selected shown, and the form a new one is made with.
export function ScenesPanel() {
  const ed = useEditor(['game', 'selection'])
  const [draft, setDraft] = useState<Draft | undefined>()
  const [error, setError] = useState<string | undefined>()
  const s = ed.session
  if (!s) return <Empty>Open a game to see its scenes.</Empty>
  const table = scenesOf(ed)
  const names = Object.keys(table)
  const entry = (s.game.file.prefabs.scenemanager as { entry?: string }).entry
  const sel = ed.selection && 'scene' in ed.selection && names.includes(ed.selection.scene) ? ed.selection.scene : undefined
  const kindsOf = (scene: string) => {
    const counts = new Map<string, number>()
    for (const a of s.files.get(s.path(scene))?.actors ?? []) counts.set(a.is, (counts.get(a.is) ?? 0) + 1)
    return counts
  }
  const start = (from: string) => {
    setError(undefined)
    setDraft({ name: '', from, keep: [...kindsOf(from).keys()], own: namedEntries(ed, from).filter(n => !n.shared).map(n => n.name) })
  }
  const act = async (f: () => Promise<unknown>) => {
    setError(undefined)
    try {
      await f()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  if (draft) {
    const counts = kindsOf(draft.from)
    const named = namedEntries(ed, draft.from)
    const bar = (
      <Toolbar label="New scene">
        <Button primary title="Make the scene" disabled={!draft.name} onClick={() => void act(() => ed.call('scenes.new', draft)).then(ok => { if (ok) { setDraft(undefined); ed.select({ scene: draft.name }) } })}>Make</Button>
        <Button title="Cancel the new scene" onClick={() => setDraft(undefined)}>Cancel</Button>
      </Toolbar>
    )
    return (
      <PanelBody bar={bar}>
        <Section title={`New scene from ${draft.from}`}>
          <LabelledRow label="name"><TextField label="name" value={draft.name} onChange={v => setDraft({ ...draft, name: v.trim() })} /></LabelledRow>
          <LabelledRow label="from"><Select<string> label="from" value={draft.from} options={names.map(n => ({ value: n }))} onChange={from => setDraft({ ...draft, ...{ from, keep: [...kindsOf(from).keys()], own: namedEntries(ed, from).filter(n => !n.shared).map(n => n.name) } })} /></LabelledRow>
          <Note>It has {draft.from}'s kinds, systems and world, and is booted with the game's other scenes.</Note>
          {error && <Note>{error}</Note>}
        </Section>
        <Section title="Its actors, by kind">
          {counts.size
            ? [...counts].map(([k, n]) => (
              <Row key={k}>
                <Check label={`Keep the ${k} actors`} value={draft.keep.includes(k)} onChange={on => setDraft({ ...draft, keep: on ? [...draft.keep, k] : draft.keep.filter(x => x !== k) })} />
                <span className="ui-mono">{k}</span>
                <Badge>{n}</Badge>
              </Row>
            ))
            : <Note>{draft.from} has no actors of its own.</Note>}
        </Section>
        <Section title="Its own copies">
          {named.length
            ? named.map(n => (
              <Row key={n.name}>
                <Check label={`Its own copy of ${n.name}`} value={draft.own.includes(n.name)} onChange={on => setDraft({ ...draft, own: on ? [...draft.own, n.name] : draft.own.filter(x => x !== n.name) })} />
                <span className="ui-mono">{n.name}</span>
                <Note>{n.url.slice(n.url.lastIndexOf('/') + 1)}{n.shared ? ', which every scene uses' : ''}; unticked, the two scenes share it</Note>
              </Row>
            ))
            : <Note>{draft.from}'s world names no file of its catalogue.</Note>}
        </Section>
      </PanelBody>
    )
  }

  const bar = (
    <Toolbar label="Scenes">
      <Button primary title="New scene" onClick={() => start(sel ?? entry ?? names[0])}>New scene</Button>
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Tree
        label="Scenes"
        items={names.map(n => ({ id: n, label: n, badge: <Badge title={n === entry ? 'every seat enters here' : 'rows now'}>{n === entry ? 'entry' : s.scene(n).rows.length}</Badge> }))}
        selected={sel}
        onSelect={id => ed.select({ scene: id })}
      />
      {sel && (
        <Section
          title={sel}
          extra={<Row><Button title={`New scene from ${sel}`} onClick={() => start(sel)}>New scene from this</Button><Button title={`Remove ${sel}`} disabled={sel === entry} onClick={() => void act(() => ed.call('scenes.remove', { name: sel }))}>Remove</Button></Row>}
        >
          <LabelledRow label="file"><span className="ui-mono">{table[sel].file}</span></LabelledRow>
          <LabelledRow label="rows now"><span className="ui-mono">{s.scene(sel).rows.length}</span></LabelledRow>
          <LabelledRow label="uses">{namedEntries(ed, sel).length ? <span className="ui-mono">{namedEntries(ed, sel).map(n => n.name).join(', ')}</span> : <Note>no file by name</Note>}</LabelledRow>
          {error && (
            <>
              <Note>{error}</Note>
              {error.includes('take it out anyway') && <Button title={`Remove ${sel} anyway`} onClick={() => void act(() => ed.call('scenes.remove', { name: sel, anyway: true }))}>Remove anyway</Button>}
            </>
          )}
        </Section>
      )}
    </PanelBody>
  )
}
