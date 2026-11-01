// The games extension's components (`games.extension.tsx`): the Games panel and its New game form.
import { useEffect, useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { NumberField, TextField } from '#editor/ui/fields.tsx'
import { Badge, Button, LabelledRow, Note, PanelBody, Section, Toolbar } from '#editor/ui/layout.tsx'
import { Tree } from '#editor/ui/tree.tsx'

type Draft = { name: string; scene: string; width: number; height: number }

export function GamesPanel() {
  // The game the editor is on is fixed for the page, and the list is asked of the server.
  const ed = useEditor([])
  const [draft, setDraft] = useState<Draft | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<string | undefined>()
  // The games as the server lists them now, listed again each time the panel shows the list.
  const [games, setGames] = useState<{ name: string; opens: boolean }[]>([])
  useEffect(() => {
    if (draft) return
    let on = true
    ed.files.games().then(g => { if (on) setGames(g) }, e => { if (on) setError((e as Error).message) })
    return () => { on = false }
  }, [ed, draft])
  const open = ed.game?.name
  const act = async (f: () => Promise<unknown>) => {
    setBusy(true)
    setError(undefined)
    try {
      await f()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (draft) {
    const bar = (
      <Toolbar label="New game">
        <Button primary title="Make the game" disabled={!draft.name || busy} onClick={() => void act(() => ed.call('games.new', draft)).then(ok => { if (ok) setDraft(undefined) })}>Make</Button>
        <Button title="Cancel the new game" onClick={() => setDraft(undefined)}>Cancel</Button>
      </Toolbar>
    )
    return (
      <PanelBody bar={bar}>
        <Section title="New game">
          <LabelledRow label="name"><TextField label="name" value={draft.name} onChange={v => setDraft({ ...draft, name: v.trim() })} /></LabelledRow>
          <LabelledRow label="scene"><TextField label="scene" value={draft.scene} onChange={v => setDraft({ ...draft, scene: v.trim() })} /></LabelledRow>
          <LabelledRow label="width"><NumberField label="width" integer value={draft.width} onChange={(v, done) => { if (done) setDraft({ ...draft, width: v }) }} /></LabelledRow>
          <LabelledRow label="height"><NumberField label="height" integer value={draft.height} onChange={(v, done) => { if (done) setDraft({ ...draft, height: v }) }} /></LabelledRow>
          <Note>A manager naming one scene, which every connection enters, drawn by render2d with nothing in it yet; its pages, its server and a test. Making it opens it: the editor goes to its page{open ? `, keeping ${open}'s session for when it comes back` : ''}.</Note>
          {error && <Note>{error}</Note>}
        </Section>
      </PanelBody>
    )
  }

  const bar = (
    <Toolbar label="Games">
      <Button primary title="New game" onClick={() => { setError(undefined); setDraft({ name: '', scene: 'main', width: 960, height: 600 }) }}>New game</Button>
      <Button title={picked ? `Open ${picked}` : 'Open the game picked'} disabled={!picked || picked === open || busy || !games.find(g => g.name === picked)?.opens} onClick={() => void act(() => ed.openGame(picked!))}>Open</Button>
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Tree
        label="Games"
        items={games.map(g => ({ id: g.name, label: g.name, badge: g.name === open ? <Badge tone="accent">open</Badge> : !g.opens ? <Badge tone="dim">not openable</Badge> : undefined }))}
        selected={picked ?? open}
        onSelect={id => setPicked(id)}
      />
      {error && <Note>{error}</Note>}
    </PanelBody>
  )
}
