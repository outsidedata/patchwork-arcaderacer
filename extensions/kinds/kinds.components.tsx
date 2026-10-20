// The kinds extension's components (`kinds.extension.tsx`): the Kinds panel, and its New kind form.
import { useEffect, useState } from 'react'
import { useEditor } from '#editor/context.ts'
import { Check, Select, TextField } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { Tree } from '#editor/ui/tree.tsx'
import type { Draft, Studio } from './kinds.extension.tsx'

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// Runs what a control does, writing what it throws to the console.
function useRun() {
  const ed = useEditor([])
  return (f: () => unknown) => {
    try {
      const r = f()
      if (r instanceof Promise) r.catch(e => ed.error((e as Error).message, (e as Error).stack))
    } catch (e) {
      ed.error((e as Error).message, (e as Error).stack)
    }
  }
}

export function KindsPanel({ studio }: { studio: Studio }) {
  const ed = useEditor(['game', 'x.kinds'])
  const run = useRun()
  const game = ed.session?.game.name
  const [filter, setFilter] = useState('')
  useEffect(() => {
    if (game) run(() => studio.read())
    // Read again for each game opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game])
  if (!game) return <Empty>Open a game to see its kinds.</Empty>
  if (studio.draft) return <NewKind studio={studio} draft={studio.draft} game={game} />

  const all = studio.kinds()
  const shown = all.filter(k => k.name.includes(filter))
  const sel = all.find(k => k.name === studio.selected)
  const open = (path: string) => run(() => ed.call('code.open', { path }))
  const bar = (
    <Toolbar label="Kinds">
      <Button primary title="New kind" onClick={() => run(() => studio.start(null))}>New kind</Button>
      <TextField label="Find a kind" value={filter} onChange={v => setFilter(v)} />
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Tree
        label="Kinds"
        items={shown.map(k => ({ id: k.name, label: k.name, badge: <Badge title="rows now">{Object.values(k.rows).reduce((a, b) => a + b, 0)}</Badge> }))}
        selected={studio.selected}
        onSelect={id => studio.select(id)}
      />
      {sel && !studio.code && <Note>Reading {game}'s code…</Note>}
      {sel && studio.code && (
        <Section title={sel.name} extra={<Button title={`New kind like ${sel.name}`} disabled={!sel.rule} onClick={() => run(() => studio.start(sel.name))}>New kind like this</Button>}>
          <LabelledRow label="rule">
            {sel.rule ? <Button title={`Open ${sel.name}'s rule`} onClick={() => open(`games/${game}/${sel.name}.sim.ts`)}>{sel.name}.sim.ts</Button> : <Note>not in the game's folder: a plugin's row</Note>}
          </LabelledRow>
          <LabelledRow label="look">
            {sel.look ? <Button title={`Open ${sel.name}'s look`} onClick={() => open(`games/${game}/${sel.name}.client.ts`)}>{sel.name}.client.ts</Button> : <Note>none of its own</Note>}
          </LabelledRow>
          <LabelledRow label="prefab">{sel.prefab ? <span className="ui-mono">{nameOf(sel.prefab)}</span> : <Note>none</Note>}</LabelledRow>
          <LabelledRow label="in sims">{sel.modules.length ? <span className="ui-mono">{sel.modules.map(nameOf).join(', ')}</span> : <Note>no sim of the game's lists it</Note>}</LabelledRow>
          <LabelledRow label="rows now">{Object.keys(sel.rows).length ? <span className="ui-mono">{Object.entries(sel.rows).map(([s, n]) => `${s} ${n}`).join(' · ')}</span> : <Note>none</Note>}</LabelledRow>
        </Section>
      )}
    </PanelBody>
  )
}

// The form for `draft`, the one the panel drew it for: a drawing of the form alone, for its own state,
// can come before the panel's for a change that let the draft go, and draws the draft it was handed.
function NewKind({ studio, draft: d, game }: { studio: Studio; draft: Draft; game: string }) {
  useEditor(['game', 'x.kinds'])
  const run = useRun()
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const code = studio.code
  const ruled = studio.kinds().filter(k => k.rule).map(k => k.name)
  const like = d.like
  const make = async () => {
    setBusy(true)
    setError(undefined)
    try {
      await studio.make()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const relike = (to: string) => run(async () => {
    const name = d.name
    await studio.start(to || null)
    studio.change({ name })
  })
  const writes = [
    `${d.name || '<name>'}.sim.ts`,
    ...(like && code?.looks.includes(like) ? [`${d.name || '<name>'}.client.ts`] : []),
    ...d.sims.map(nameOf),
    'its prefab',
    ...(like ? ['its definition'] : []),
    ...(d.places.length - d.skip.length > 0 ? [`${d.places.length - d.skip.length} places`] : []),
  ]
  const bar = (
    <Toolbar label="New kind">
      <Button primary title="Make the kind" disabled={!d.name || busy || !d.sims.length} onClick={() => void make()}>Make</Button>
      <Button title="Cancel the new kind" onClick={() => studio.cancel()}>Cancel</Button>
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Section title={like ? `New kind like ${like}` : 'New kind'}>
        <LabelledRow label="name"><TextField label="name" value={d.name} onChange={v => studio.change({ name: v.trim() })} /></LabelledRow>
        <LabelledRow label="like">
          <Select<string> label="like" value={like ?? ''} options={[{ value: '', label: 'none: a blank kind' }, ...ruled.map(k => ({ value: k }))]} onChange={relike} />
        </LabelledRow>
        {error && <Note>{error}</Note>}
      </Section>
      <Section title="Its rule goes into">
        {Object.entries(code?.modules ?? {}).map(([p, m]) => (
          <Row key={p}>
            <Check
              label={`Add it to ${p}`}
              value={d.sims.includes(p)}
              onChange={on => { if ('kinds' in m) studio.change({ sims: on ? [...d.sims, p] : d.sims.filter(s => s !== p) }) }}
            />
            <span className="ui-mono">{nameOf(p)}</span>
            <Note>{'kinds' in m ? `the sim of ${Object.entries(code!.scenes).filter(([, to]) => to === p).map(([s]) => nameOf(s).replace(/\.sim\.ts$/, '')).join(', ')}` : m.why}</Note>
          </Row>
        ))}
      </Section>
      {like && (
        <Section title={`Also wherever ${like} is`}>
          {d.places.length
            ? d.places.map(p => (
              <Row key={p.id}>
                <Check label={`Put it in ${p.at.join('.')} of ${p.file}`} value={!d.skip.includes(p.id)} onChange={on => studio.change({ skip: on ? d.skip.filter(s => s !== p.id) : [...d.skip, p.id] })} />
                <span className="ui-mono">{p.at.join('.')}</span>
                <Note>{p.table ? 'a copy of its entry' : 'listed'} · {nameOf(p.file)}</Note>
              </Row>
            ))
            : <Note>No table or list of {game}'s data names {like}.</Note>}
        </Section>
      )}
      <Section title="Writes">
        <Note>{writes.join(' · ')}: one undo. The page reloads with it, and its rule opens in the Code panel.</Note>
      </Section>
    </PanelBody>
  )
}
