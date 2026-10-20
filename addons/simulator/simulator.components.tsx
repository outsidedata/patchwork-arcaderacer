// The components of the simulator's extension (simulator.extension.tsx): the Runs panel. It shows one
// recording of `addons/simulator/runs/` at a time, read through the editor's files, and plays new
// ones through the simulator's routes.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEditor, useText } from '#editor/context.ts'
import { Chart } from '#editor/ui/chart.tsx'
import { JsonField, Select, TextField } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Section, Strip, Toolbar } from '#editor/ui/layout.tsx'
import { Table } from '#editor/ui/table.tsx'
import { Timeline } from '#editor/ui/timeline.tsx'
import { parse, RUNS, summary, type FrameRecord, type Record_ } from './simulator.addon.ts'
import { frameAt, lanesOf, play, playedOn, recordings, seriesOf, starting, unplayable } from './simulator.extension.tsx'

const round = (v: number, d = 1) => +v.toFixed(d)
const counts = (h: Record<number, number>) => Object.entries(h).map(([k, v]) => `${k}:${v}`).join(' ') || '–'

export function Runs() {
  // The open game, Play's starting config and why it is off; every file's writes, the folder of runs
  // listed anew by them (`writesIn`); and the runs played (`playedOn`).
  const ed = useEditor(['game', 'texts', 'x.simulator'])
  const [names, setNames] = useState<string[]>([])
  const [picked, setPicked] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(0)
  const [at, setAt] = useState(0)
  const [name, setName] = useState('run')
  const [config, setConfig] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | undefined>(undefined)
  const reload = useCallback(async () => setNames(await recordings(ed)), [ed])
  const shown = picked !== undefined && names.includes(picked) ? picked : names[names.length - 1]
  // Listed again whenever a run is played here, by the panel or sim.run, and whenever a recording the
  // editor holds is written anew on the disk.
  const written = ed.writesIn(RUNS), ran = playedOn(ed)
  useEffect(() => { void reload() }, [reload, written, ran])
  const text = useText(shown === undefined ? undefined : `${RUNS}/${shown}.jsonl`)
  const records = useMemo<Record_[] | undefined>(() => {
    if (text === undefined) return undefined
    try { return parse(text) } catch { return [] }
  }, [text])
  const game = ed.session?.game.path
  const conf = config ?? (game ? starting(game) : undefined)

  // Why Play is off, when it is.
  const why = conf === undefined ? undefined : unplayable(ed, name, conf)
  const run = async () => {
    setBusy(true)
    setSaid(undefined)
    try {
      const got = await play(ed, name, conf)
      setSaid(got.report)
      await reload()
      setPicked(got.name)
    } catch (e) {
      ed.error(`simulator run: ${(e as Error).message}`)
      setSaid((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const bar = (
    <Toolbar label="runs">
      {names.length ? (
        <Select<string> label="recording" value={shown!} options={names.map(n => ({ value: n, label: n }))} onChange={v => setPicked(v)} />
      ) : <Badge tone="dim">no recordings</Badge>}
      <Button title="List the recordings again, as a browser's tap adds them" onClick={() => void reload()}>Reload</Button>
      <span className="ui-spacer" />
      {records && <Badge tone="dim">{records.length} records</Badge>}
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Section title="Run" open={!names.length}>
        {conf ? (
          <>
            <LabelledRow label="name"><TextField label="run name" value={name} onChange={(v, done) => { if (done) setName(v) }} /></LabelledRow>
            <LabelledRow label="config"><JsonField label="run config" value={conf} onChange={(v, done) => { if (done) setConfig(v) }} /></LabelledRow>
            <Button primary disabled={busy || why !== undefined} onClick={() => void run()}>{busy ? 'Playing…' : 'Play'}</Button>
            {why && <Note>Not played: {why}</Note>}
            {said && <pre aria-label="run report" className="ui-note">{said}</pre>}
            <Note>Plays the config on node, as the simulator's command line does, and keeps it as a recording, which is no change of the game's and is not undone. A browser records itself when a game's client.html is opened with ?tap=&lt;name&gt;.</Note>
          </>
        ) : <Empty>Open a game, and a run of it is played here.</Empty>}
      </Section>
      {records && <Recording records={records} page={page} setPage={setPage} at={at} setAt={setAt} />}
    </PanelBody>
  )
}

// One recording: its summary, a timeline of what happened when, each page's steps a frame and
// standoff over time, and the frame of the page picked at the time picked.
function Recording({ records, page, setPage, at, setAt }: { records: Record_[]; page: number; setPage(p: number): void; at: number; setAt(t: number): void }) {
  const s = useMemo(() => { try { return summary(records) } catch { return undefined } }, [records])
  if (!s) return <Empty>This recording has no run line.</Empty>
  const pages = s.pages.map(p => p.page)
  const lanes = lanesOf(records, pages)
  const charts = seriesOf(records, pages)
  const frame = frameAt(records, page, at)
  return (
    <>
      <Section title="Summary">
        <Note>{`${s.mode === 'sim' ? 'Simulated' : 'Real'} run of ${round(s.ms, 0)} ms: ${s.steps} server steps, ${round(s.rate, 2)} a second.`}</Note>
        <Table
          label="pages"
          rows={s.pages}
          keyOf={p => String(p.page)}
          selected={String(page)}
          onSelect={k => setPage(Number(k))}
          columns={[
            { key: 'page', title: 'page', cell: p => p.page, numeric: true },
            { key: 'frames', title: 'frames', cell: p => p.frames, numeric: true },
            { key: 'steps', title: 'steps a frame', cell: p => `${counts(p.histogram.counts)} (first packet ${p.histogram.first === null ? '–' : `${round(p.histogram.first, 1)} ms`})` },
            { key: 'envelopes', title: 'envelopes a frame', cell: p => counts(p.packets) },
            { key: 'standoff', title: 'standoff jitter', cell: p => `max ${round(p.standoff.max, 4)}, rms ${round(p.standoff.rms, 4)}` },
          ]}
        />
      </Section>
      <Section title="Timeline">
        <Timeline label="recording" lanes={lanes} head={at} span={s.ms} grain={1} fit={s.ms} format={t => `${Math.round(t)} ms`} onSeek={t => setAt(t)} />
      </Section>
      <Section title="Over time">
        <Chart label="steps a frame" series={charts.steps} x={{ label: 'ms' }} y={{ label: 'steps' }} />
        <Chart label="standoff" series={charts.standoff} x={{ label: 'ms' }} y={{ label: 'camera to own row' }} />
      </Section>
      <Section title="Frame">
        {pages.length > 1 && <Strip label="page" items={pages.map(p => ({ id: String(p), node: `page ${p}` }))} selected={String(page)} onSelect={k => setPage(Number(k))} />}
        {frame ? <FrameView frame={frame} /> : <Note>Page {page} drew no frames.</Note>}
      </Section>
    </>
  )
}

// A frame's record: what the page was at, the envelopes it took, and the rows it drew, each number to
// three places.
function FrameView({ frame }: { frame: FrameRecord }) {
  const fields: [string, string][] = [
    ['t', `${round(frame.t, 3)} ms`], ['clock', `${round(frame.clock, 3)} ms`], ['packet step', String(frame.n ?? '–')],
    ['camera', frame.eye ? `at ${frame.eye.pos.map(v => round(v, 2)).join(', ')}` : '–'],
    ...(frame.cost !== undefined ? [['cost', `${round(frame.cost, 3)} ms`] as [string, string]] : []),
  ]
  const rows = Object.entries(frame.rows).map(([id, r]) => ({ id, r }))
  return (
    <>
      <Table label="frame" rows={fields} keyOf={f => f[0]} columns={[{ key: 'field', title: 'field', cell: f => f[0] }, { key: 'value', title: 'value', cell: f => f[1] }]} />
      <Table label="envelopes taken" rows={frame.took} keyOf={k => String(k.k)} columns={[
        { key: 'k', title: 'k', cell: k => k.k, numeric: true },
        { key: 'n', title: 'step', cell: k => k.n, numeric: true },
        { key: 'sent', title: 'sent', cell: k => (k.sent === null ? '–' : `${round(k.sent, 3)} ms`) },
        { key: 'at', title: 'arrived', cell: k => `${round(k.at, 3)} ms` },
      ]} />
      <Table label="rows drawn" rows={rows} keyOf={x => x.id} columns={[
        { key: 'id', title: 'id', cell: x => (Number(x.id) === frame.own ? `${x.id} (own)` : x.id), numeric: true },
        { key: 'kind', title: 'kind', cell: x => String(x.r.kind) },
        { key: 'fields', title: 'fields', cell: x => JSON.stringify(Object.fromEntries(Object.entries(x.r).filter(([k]) => k !== 'kind')), (_k, v) => (typeof v === 'number' ? round(v, 3) : v)) },
      ]} />
    </>
  )
}
