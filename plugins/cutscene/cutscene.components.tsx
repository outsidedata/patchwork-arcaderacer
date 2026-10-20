// The components of the cutscene's extension (cutscene.extension.tsx): the Cutscene panel on a cue
// file. Every value it shows is the file's, as the editor last read it, and every change goes through
// the studio the extension hands it, which writes it to the file or refuses it.
//
// The bar: `▶ here` plays the session from the playhead; `end` selects the end bracket; the readout
// is the playhead over the scene's length in elapsed seconds; the problems count opens the list of
// problems, each of which selects its cue; the error line is the last change refused.
//
// The timeline: a lane per cast member, then camera, say, sound and screen, each with `+`, which makes
// a cue there at the playhead (off on sound, saying why, in a scene with no sound cues), and camera's
// `look`, which shows the cutscene's own camera in the game view. Beside it the form of the cue
// selected: its fields by its `do`, the `do` itself, which makes it a cue of another kind at the same
// `at` (not a sound, saying why, in a scene with no sound cues), the buttons that take the stage's
// view into a shot and pick a walk's or a face's target on the stage, and the note of what the
// measure pass found for it; with the end bracket selected, the file's `end`, `go` and `arrive`.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useEditor } from '#editor/context.ts'
import { Check, JsonField, NumberField, Select, Slider, TextField, VecField } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Split, Toolbar } from '#editor/ui/layout.tsx'
import { END, Timeline, type Lane } from '#editor/ui/timeline.tsx'
import { DOS, GRAIN, soundless, type Model, type Studio } from './cutscene.extension.tsx'

const POINT = '(a point)'
const NOTHING = '(nothing)'
const fmt = (t: number) => String(Math.round(t * 1000) / 1000)

export function Cutscene({ studio }: { studio: Studio }) {
  // The model is made from the session and the texts of the files; the look button reads the orbit's
  // holds.
  useEditor(['game', 'texts', 'tools'])
  useSyncExternalStore(studio.subscribe, studio.version)
  useEffect(() => {
    studio.mounted(true)
    return () => studio.mounted(false)
  }, [studio])
  const m = studio.model()
  if (!m) return <Empty>No scene of the open game has a cutscene row with a cue file.</Empty>
  const head = studio.head()
  const nudge = studio.nudging()
  const chips = m.chips.map(c => (nudge?.ids.includes(c.id) ? { ...c, at: Math.min(m.end, Math.max(0, c.at + nudge.by)) } : c))
  const plus = (lane: string, extra?: ReactNode) => {
    const off = lane === 'sound' ? soundless(m) : undefined
    return (
      <>
        <Button title={off ? `add to ${lane}: ${off}` : `add to ${lane}`} disabled={!!off} onClick={() => studio.add(lane)}>+</Button>
        {extra}
      </>
    )
  }
  const lanes: Lane[] = m.lanes.map(id => ({
    id, label: id,
    extra: plus(id, id === 'camera' ? <Button title="look" pressed={studio.looking()} onClick={() => studio.look(!studio.looking())}>look</Button> : undefined),
  }))
  const one = studio.selected.length === 1 ? studio.selected[0] : undefined
  const bar = (
    <Toolbar label="cutscene">
      <Button title="play from the playhead" onClick={() => studio.here()}>▶ here</Button>
      <Button title="end" pressed={studio.selected.includes(END)} onClick={() => studio.select([END])}>end</Button>
      <span role="status" aria-label="playhead">{fmt(head)} / {fmt(m.end)} s</span>
      <Button title="problems" pressed={studio.problems} onClick={() => studio.showProblems(!studio.problems)}>
        <Badge tone={m.problems.length ? 'danger' : 'dim'}>{m.problems.length}</Badge> problems
      </Button>
      {studio.error && <span role="alert" className="ui-note">{studio.error}</span>}
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Split
        main={(
          <Timeline
            label="cues"
            lanes={lanes}
            chips={chips}
            marks={m.holdMarks}
            head={head}
            span={m.span}
            grain={GRAIN}
            fit={m.target.path}
            end={m.end}
            selected={studio.selected}
            format={fmt}
            onSeek={(t, done) => studio.seek(t, done)}
            onSelect={ids => studio.select(ids)}
            onMove={(moves, done) => studio.move(moves, done)}
            onResize={(id, length, done) => studio.resize(id, length, done)}
            onEnd={(t, done) => studio.setEnd(t, done)}
            onKey={e => studio.key(e)}
          />
        )}
        side={(
          <>
            {studio.problems && (
              <Section title="Problems">
                {m.problems.length ? m.problems.map((p, k) => (
                  <Row key={k}>
                    <Button title={`cue ${p.cue}: ${p.text}`} onClick={() => studio.select([String(p.cue)])}>cue {p.cue}</Button>
                    <span>{p.text}</span>
                  </Row>
                )) : <Note>No problems.</Note>}
              </Section>
            )}
            {one === END ? <EndForm m={m} studio={studio} />
              : one !== undefined && m.file.cues[Number(one)] ? <CueForm m={m} studio={studio} i={Number(one)} />
                : <Note>Select a cue, or the end.</Note>}
          </>
        )}
      />
    </PanelBody>
  )
}

function EndForm({ m, studio }: { m: Model; studio: Studio }) {
  return (
    <Section title="End">
      <LabelledRow label="end"><NumberField label="end" value={m.file.end} onChange={(v, done) => done && studio.setFile('end', v)} /></LabelledRow>
      <LabelledRow label="go"><TextField label="go" value={m.file.go ?? ''} onChange={(v, done) => done && studio.setFile('go', v === '' ? undefined : v)} /></LabelledRow>
      <LabelledRow label="arrive"><JsonField label="arrive" value={m.file.arrive ?? []} onChange={(v, done) => done && studio.setFile('arrive', v)} /></LabelledRow>
    </Section>
  )
}

// A target: a cast member, a mark, or a point typed as its numbers.
function TargetField({ m, studio, label, value, onChange, nothing }: {
  m: Model; studio: Studio; label: string; value: unknown; onChange(v: unknown): void; nothing?: boolean
}) {
  const names = [...new Set([...m.cast, ...m.marks.map(k => k.name)])]
  const point = Array.isArray(value)
  const chosen = value === null ? NOTHING : point ? POINT : String(value)
  const options = [...(nothing ? [NOTHING] : []), ...names, ...(names.includes(chosen) || chosen === NOTHING || chosen === POINT ? [] : [chosen]), POINT].map(v => ({ value: v }))
  return (
    <>
      <Select label={label} value={chosen} options={options} onChange={v => {
        if (v === NOTHING) onChange(null)
        else if (v === POINT) onChange(point ? value : [0, 0])
        else onChange(v)
      }} />
      {point && (
        <TextField label={`${label} point`} value={(value as number[]).join(', ')} onChange={(v, done) => {
          if (!done) return
          const got = studio.target(v)
          if (got !== undefined) onChange(got)
        }} />
      )}
    </>
  )
}

function CueForm({ m, studio, i }: { m: Model; studio: Studio; i: number }) {
  const c = m.file.cues[i]
  const set = (field: string) => (v: unknown, done = true) => { if (done) studio.set(i, field, v) }
  const num = (field: string, fallback?: number) => (
    <LabelledRow label={field}><NumberField label={field} value={c[field] ?? fallback ?? 0} onChange={(v, done) => set(field)(v, done)} /></LabelledRow>
  )
  const who = (line = false) => (
    <LabelledRow label="who">
      <Select label="who" value={c.who} options={[...m.cast, ...(line ? ['line'] : [])].map(v => ({ value: v }))} onChange={v => set('who')(v)} />
    </LabelledRow>
  )
  const target = (field: string, nothing = false) => (
    <LabelledRow label={field}><TargetField m={m} studio={studio} label={field} value={c[field]} nothing={nothing} onChange={v => set(field)(v)} /></LabelledRow>
  )
  const clip = (options: string[], field = 'clip', none = false) => {
    const all = [...(none ? [NOTHING] : []), ...options, ...(c[field] === null || options.includes(c[field]) ? [] : [c[field]])]
    return (
      <LabelledRow label={field}>
        <Select label={field} value={c[field] ?? NOTHING} options={all.map(v => ({ value: v }))} onChange={v => set(field)(v === NOTHING ? null : v)} />
      </LabelledRow>
    )
  }
  const fields: Record<string, () => ReactNode> = {
    play: () => <>{who()}{clip(m.clips(c.who))}<LabelledRow label="holds"><Check label="holds" value={c.holds} onChange={v => set('holds')(v)} /></LabelledRow>{num('rate')}</>,
    gesture: () => <>{who()}{clip(m.clips(c.who))}</>,
    walk: () => (
      <>
        {who()}{target('to')}{clip(m.gears(c.who), 'gear', true)}{num('limit', m.file.limit)}
        <Button title="pick on stage" onClick={() => studio.pick(i, 'to')}>pick on stage</Button>
      </>
    ),
    face: () => <>{who()}{target('to', true)}<Button title="pick on stage" onClick={() => studio.pick(i, 'to')}>pick on stage</Button></>,
    say: () => (
      <>
        {who()}
        <LabelledRow label="text"><TextField label="text" value={c.text} onChange={(v, done) => set('text')(v, done)} /></LabelledRow>
        {num('for')}
        <LabelledRow label="voice"><TextField label="voice" value={c.voice ?? ''} onChange={(v, done) => set('voice')(v === '' ? undefined : v, done)} /></LabelledRow>
      </>
    ),
    wait: () => who(true),
    shot: () => (
      <>
        <LabelledRow label="name"><TextField label="name" value={c.name} onChange={(v, done) => set('name')(v, done)} /></LabelledRow>
        <LabelledRow label="follows">
          <Select label="follows" value={c.follows ?? NOTHING} options={[NOTHING, ...m.cast].map(v => ({ value: v }))} onChange={v => set('follows')(v === NOTHING ? undefined : v)} />
        </LabelledRow>
        {c.follows !== undefined && (
          <LabelledRow label="frame">
            <Select label="frame" value={c.frame ?? 'world'} options={[{ value: 'world' }, { value: 'body' }]} onChange={v => set('frame')(v)} />
          </LabelledRow>
        )}
        {c.follows !== undefined
          ? <LabelledRow label="offset"><VecField label="offset" value={c.pos} onChange={(v, done) => set('pos')(v, done)} /></LabelledRow>
          : target('pos')}
        {target('look')}
        <LabelledRow label="fov"><Slider label="fov" min={10} max={120} step={1} value={c.fov ?? m.file.fov} onChange={(v, done) => set('fov')(v, done)} /></LabelledRow>
        {num('over')}
        <Button title="take the view" onClick={() => studio.take(i)}>take the view</Button>
      </>
    ),
    fade: () => <><LabelledRow label="to"><Slider label="to" min={0} max={1} step={0.01} value={c.to} onChange={(v, done) => set('to')(v, done)} /></LabelledRow>{num('over')}</>,
    bars: () => <><LabelledRow label="on"><Check label="on" value={c.on} onChange={v => set('on')(v)} /></LabelledRow>{num('over')}</>,
    shake: () => <>{num('over')}{num('amp')}</>,
    sound: () => (
      <>
        <LabelledRow label="cue"><Select label="cue" value={c.cue} options={[...new Set([...m.sounds, c.cue])].map(v => ({ value: v }))} onChange={v => set('cue')(v)} /></LabelledRow>
        <LabelledRow label="who">
          <Select label="who" value={c.who ?? NOTHING} options={[NOTHING, ...m.cast].map(v => ({ value: v }))} onChange={v => set('who')(v === NOTHING ? undefined : v)} />
        </LabelledRow>
        {c.who === undefined && (
          <LabelledRow label="where">
            <TargetField m={m} studio={studio} label="where" value={c.where ?? null} nothing onChange={v => set('where')(v === null ? undefined : v)} />
          </LabelledRow>
        )}
      </>
    ),
    music: () => <LabelledRow label="name"><TextField label="name" value={c.name} onChange={(v, done) => set('name')(v, done)} /></LabelledRow>,
  }
  return (
    <Section title={`Cue ${i}`}>
      <LabelledRow label="at"><NumberField label="at" value={c.at} onChange={(v, done) => set('at')(v, done)} /></LabelledRow>
      <LabelledRow label="do">
        <Select label="do" value={c.do} options={DOS.map(v => ({ value: v, off: v === 'sound' && c.do !== 'sound' ? soundless(m) : undefined }))} onChange={v => studio.convert(i, v)} />
      </LabelledRow>
      {(fields[c.do] ?? (() => null))()}
      {m.note(i).map(line => <Note key={line}>{line}</Note>)}
    </Section>
  )
}
