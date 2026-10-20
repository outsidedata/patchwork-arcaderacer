// The code extension's components (`code.extension.tsx`): the Code panel and the inspector's Code
// section of a selected row.
import { useEffect, useState } from 'react'
import { useEditor } from '#editor/context.ts'
import type { Selection } from '#editor/editor.ts'
import { CodeField } from '#editor/ui/code.tsx'
import { TextField } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, Note, PanelBody, Row, Split, Toolbar } from '#editor/ui/layout.tsx'
import { Tree, type TreeItem } from '#editor/ui/tree.tsx'
import type { Studio } from './code.extension.tsx'

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const homeOf = (path: string) => path.split('/').slice(0, 2).join('/')

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

export function CodePanel({ studio }: { studio: Studio }) {
  const ed = useEditor(['game', 'x.code'])
  const run = useRun()
  const game = ed.session?.game.name
  const [filter, setFilter] = useState('')
  useEffect(() => {
    if (game) run(() => studio.list())
    // Listed again for each game opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game])
  if (!game) return <Empty>Open a game to see its code.</Empty>

  const groups = new Map<string, string[]>()
  for (const f of studio.files ?? []) {
    if (filter && !f.toLowerCase().includes(filter.toLowerCase())) continue
    const home = homeOf(f)
    if (!groups.has(home)) groups.set(home, [])
    groups.get(home)!.push(f)
  }
  const items: TreeItem[] = [...groups].map(([home, files]) => ({
    id: home,
    label: home,
    badge: <Badge>{files.length}</Badge>,
    children: files.map(f => ({ id: f, label: f.slice(home.length + 1), badge: studio.dirty(f) ? <Badge tone="accent" title="changes not saved">●</Badge> : undefined })),
  }))

  const cur = studio.current
  const b = cur ? studio.buffers.get(cur) : undefined
  const tabs = (
    <Toolbar label="Files open">
      {studio.open.map(p => (
        <Row key={p}>
          <Button pressed={p === cur} title={p} onClick={() => studio.pick(p)}>{nameOf(p)}{studio.dirty(p) ? ' ●' : ''}</Button>
          <Button title={studio.dirty(p) ? `${p} holds changes not saved` : `Close ${p}`} disabled={studio.dirty(p)} onClick={() => run(() => studio.close(p))}>×</Button>
        </Row>
      ))}
    </Toolbar>
  )
  const bar = cur && b && (
    <>
      {tabs}
      <Toolbar label="File">
        <span className="ui-mono">{cur}</span>
        <Button primary title={`Save ${cur}`} disabled={!studio.dirty(cur) || b.disk !== undefined} onClick={() => run(() => studio.save(cur))}>Save</Button>
        <Button title={`Revert ${cur} to the file`} disabled={!studio.dirty(cur)} onClick={() => run(() => studio.revert(cur))}>Revert</Button>
        <Badge>{b.text.split('\n').length} lines</Badge>
      </Toolbar>
      {b.disk !== undefined && (
        <Toolbar label="Changed on disk">
          <Note>{b.disk === null ? `${cur} has been taken away since it was opened.` : `${cur} changed on disk since it was opened. Your changes are kept.`}</Note>
          <Button title={`Take the file's text for ${cur}`} onClick={() => run(() => studio.revert(cur))}>Take the file's</Button>
          {b.disk !== null && <Button title={`Keep your changes to ${cur}, to save over the file's`} onClick={() => studio.keepMine(cur)}>Keep mine</Button>}
        </Toolbar>
      )}
    </>
  )

  const main = cur && b
    ? (
      <PanelBody bar={bar}>
        <CodeField
          key={cur}
          value={b.text}
          path={cur}
          line={studio.line?.path === cur ? studio.line.at : undefined}
          onChange={text => studio.edit(cur, text)}
          onSave={() => run(() => studio.save(cur))}
        />
      </PanelBody>
    )
    : <PanelBody bar={studio.open.length ? tabs : undefined}><Empty>Pick a file to open it.</Empty></PanelBody>

  const side = (
    <PanelBody bar={<Toolbar label="Find a file"><TextField value={filter} label="Find a file" onChange={v => setFilter(v)} /></Toolbar>}>
      {studio.files === undefined
        ? <Empty>Listing the code…</Empty>
        : items.length
          ? <Tree items={items} selected={cur} label="Code files" open={[`games/${game}`]} clickOpens onSelect={id => { if (id.split('/').length > 2) run(() => studio.show(id)) }} />
          : <Empty>{filter ? `No file's path holds "${filter}".` : 'No code here.'}</Empty>}
    </PanelBody>
  )

  return <Split main={main} side={side} />
}

// A selected row's kind's code: the files named after its kind, its rule and its look, each opened by
// a click.
export function KindCode({ studio, selection }: { studio: Studio; selection: Selection }) {
  const ed = useEditor(['game', 'x.code'])
  const run = useRun()
  const row = selection && 'id' in selection ? ed.session?.row(selection.scene, selection.id) : undefined
  useEffect(() => {
    if (studio.files === undefined && ed.session) run(() => studio.list())
    // Listed once, when the panel or this section first asks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!row) return null
  const named = (studio.files ?? []).filter(f => nameOf(f).startsWith(`${row.kind}.`) && !/\.test\.tsx?$/.test(f))
  if (studio.files === undefined) return <Note>Listing the code…</Note>
  if (!named.length) return <Note>No code file is named after {row.kind}.</Note>
  return (
    <>
      {named.map(f => (
        <Row key={f}>
          <span className="ui-mono">{f}</span>
          <Button title={`Open ${f}`} onClick={() => run(() => studio.show(f))}>Open</Button>
        </Row>
      ))}
    </>
  )
}
