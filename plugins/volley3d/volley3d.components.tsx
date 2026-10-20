// The components of volley3d's extension (volley3d.extension.tsx): the Patterns 3D panel and the field
// of the `volley3d.pattern` type.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor, useText } from '#editor/context.ts'
import type { FieldProps } from '#editor/editor.ts'
import type { At } from '#editor/files.ts'
import { Chart } from '#editor/ui/chart.tsx'
import { AngleDial, NumberField, Select, TextField } from '#editor/ui/fields.tsx'
import { Field } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { Table } from '#editor/ui/table.tsx'
import type { Pattern, Patterns as File } from './volley3d.sim.ts'
import {
  SPECS, firsts, focus, fresh, namings, plot, reach, renaming, survey, valueAt, whereFor,
  type Naming, type Spec, type Studio, type Where,
} from './volley3d.extension.tsx'

type Edit = { file: string; at: At; value: unknown }
type Write = (at: At, value: unknown) => Promise<void>
type Writes = (edits: Edit[]) => Promise<void>

const pathOf = (url: string) => url.replace(/^\//, '')
const brief = (v: number) => String(+v.toFixed(2))

// The files at `paths`, each read by the editor once and parsed once a text; a file not read yet, or
// not JSON, is left out.
function useRead(paths: string[]): { path: string; value: unknown }[] {
  const ed = useEditor(['texts'], paths)
  const key = paths.join('\n')
  useEffect(() => {
    for (const p of key.split('\n').filter(Boolean)) if (!ed.texts.has(p)) void ed.text(p).catch(e => ed.error(`${p}: ${(e as Error).message}`))
  }, [ed, key])
  const cache = useRef(new Map<string, { text: string; value: unknown }>())
  return paths.flatMap(path => {
    const text = ed.texts.get(path)
    if (text === undefined) return []
    let had = cache.current.get(path)
    if (had?.text !== text) {
      let value: unknown
      try {
        value = JSON.parse(text)
      } catch {
        value = undefined
      }
      cache.current.set(path, (had = { text, value }))
    }
    return had.value === undefined ? [] : [{ path, value: had.value }]
  })
}

// A json file's value, or undefined until it has been read or when it is not JSON.
function useJson(path: string | undefined): unknown {
  const text = useText(path)
  return useMemo(() => {
    if (text === undefined) return undefined
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }, [text])
}

// The names of the effects of an effects file, undefined until it has been read.
function useEffects(path: string | undefined): string[] | undefined {
  const file = useJson(path) as { effects?: Record<string, unknown> } | undefined
  return file?.effects ? Object.keys(file.effects) : undefined
}

// ---------------------------------------------------------------- the type

// A pattern of the patterns file.
export function PatternName({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const w = whereFor(ed, owner)
  const file = useJson(w?.path) as File | undefined
  const names = Object.keys(file?.patterns ?? {})
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (not in ${w?.path ?? 'a patterns file'})` }))} onChange={onChange} />
}

// ---------------------------------------------------------------- the panel

export function Patterns({ studio }: { studio: Studio }) {
  const ed = useEditor(['game', 'selection'])
  useSyncExternalStore(studio.subscribe, studio.version)
  useEffect(() => studio.open(), [studio])
  const w = focus(ed)
  const text = useText(w?.path)
  const parsed = useMemo((): { file: File } | { error: string } | undefined => {
    if (text === undefined) return undefined
    try {
      const file = JSON.parse(text)
      if (file === null || typeof file !== 'object' || typeof file.patterns !== 'object' || file.patterns === null) return { error: 'it holds no patterns' }
      return { file }
    } catch (e) {
      return { error: `it is not JSON: ${(e as Error).message}` }
    }
  }, [text])
  if (!ed.session) return <Empty>Open a game, and the launched rounds of the scene selected are made here.</Empty>
  if (!w) return <Empty>No scene of {ed.session.game.name} fires rounds: none names volley3d in its plugins with a json entry of its catalogue for its world's patterns.</Empty>
  if (!parsed) return <Empty>Reading {w.path}…</Empty>
  if ('error' in parsed) return <Empty>{w.path}: {parsed.error}.</Empty>
  return <PatternsFile key={w.path} studio={studio} w={w} file={parsed.file} />
}

function PatternsFile({ studio, w, file }: { studio: Studio; w: Where; file: File }) {
  const ed = useEditor(['game'])
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState('')
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const names = Object.keys(file.patterns)
  const others = useRead(Object.values(w.assets).filter(a => a.type === 'json' && pathOf(a.url) !== w.path).map(a => pathOf(a.url)))
  const effects = useEffects(w.effects)
  const rows = names.map(name => {
    const p = file.patterns[name]
    const sv = survey(file, name, effects, w.effects ?? 'no effects file')
    const flies = typeof p.speed === 'number' && typeof p.life === 'number'
    return {
      name, speed: flies ? p.speed : NaN, life: flies ? p.life : NaN, reach: flies ? reach(p) : NaN,
      seeks: p.seek !== undefined, splash: p.splash ?? 0, named: namings(w.path, name, others).length, problems: sv.problems,
    }
  })
  const needle = filter.trim().toLowerCase()
  const shown = rows.filter(r => r.name.toLowerCase().includes(needle))
  const selected = studio.pattern !== undefined && studio.pattern in file.patterns ? studio.pattern : undefined
  const s = ed.session!
  const shows = s.viewing === w.scene

  const refuse = (why: string) => {
    setRefused(why)
    ed.error(`volley3d: refused: ${why}`)
  }
  const write: Write = (at, value) => {
    setRefused(undefined)
    return ed.editFile(w.path, at, value).catch(() => {})
  }
  const writes: Writes = edits => {
    setRefused(undefined)
    return ed.editFiles(edits).catch(() => {})
  }
  const add = () => {
    const n = adding.trim()
    if (!n) return refuse('a pattern needs a name')
    if (n in file.patterns) return refuse(`there is a pattern ${n} already`)
    void write(['patterns', n], fresh(file)).then(() => studio.select(n))
    setAdding('')
  }
  const number = (v: number) => (Number.isNaN(v) ? '—' : brief(v))

  return (
    <PanelBody bar={
      <Toolbar label="patterns">
        <Badge tone="dim">{w.scene}</Badge>
        <span className="ui-spacer" />
        <Button title="loop the selected pattern" pressed={studio.loop} disabled={!shows} onClick={() => studio.setLoop(!studio.loop)}>Loop</Button>
        <Button title="fire the selected pattern once" disabled={!shows || !selected} onClick={() => studio.fire()}>Fire Once</Button>
        <Badge>{names.length} patterns</Badge>
      </Toolbar>
    }>
      {refused && <Note>Refused: {refused}</Note>}
      {!shows && <Note>The game view shows {s.viewing ?? 'nothing'}: the patterns preview once it shows {w.scene}.</Note>}
      {shows && studio.held && <Note>{studio.held}</Note>}
      <Section title={<>Patterns <Badge tone="dim">{w.path}</Badge></>} extra={<Badge>{shown.length === names.length ? names.length : `${shown.length} of ${names.length}`}</Badge>}>
        <TextField label="filter patterns" value={filter} onChange={setFilter} />
        <Table
          label="patterns"
          rows={shown}
          keyOf={r => r.name}
          selected={selected}
          onSelect={studio.select}
          columns={[
            { key: 'name', title: 'Pattern', cell: r => r.problems.length ? <Row>{r.name}<Badge tone="danger">broken</Badge></Row> : r.name, sort: r => r.name },
            { key: 'speed', title: 'Speed', cell: r => number(r.speed), sort: r => r.speed, numeric: true },
            { key: 'life', title: 'Life', cell: r => number(r.life), sort: r => r.life, numeric: true },
            { key: 'reach', title: 'Reach', cell: r => number(r.reach), sort: r => r.reach, numeric: true },
            { key: 'seeks', title: 'Seeks', cell: r => (r.seeks ? 'yes' : ''), sort: r => (r.seeks ? 1 : 0) },
            { key: 'splash', title: 'Splash', cell: r => number(r.splash), sort: r => r.splash, numeric: true },
            { key: 'named', title: 'Named', cell: r => r.named, sort: r => r.named, numeric: true },
          ]}
        />
        <LabelledRow label="new" extra={<Button title="add a pattern" disabled={!adding.trim()} onClick={add}>Add</Button>}>
          <TextField label="new pattern name" value={adding} onChange={setAdding} />
        </LabelledRow>
      </Section>
      {selected
        ? <PatternForm key={selected} studio={studio} w={w} file={file} name={selected} others={others} effects={effects} write={write} writes={writes} refuse={refuse} />
        : <Empty>Select a pattern to edit and preview it.</Empty>}
    </PanelBody>
  )
}

function PatternForm({ studio, w, file, name, others, effects, write, writes, refuse }: {
  studio: Studio; w: Where; file: File; name: string; others: { path: string; value: unknown }[]; effects: string[] | undefined
  write: Write; writes: Writes; refuse(why: string): void
}) {
  // The Fire Pattern 3D tool's key, as the tool was added.
  const ed = useEditor(['extensions'])
  const [removing, setRemoving] = useState(false)
  const p = file.patterns[name]
  const users = namings(w.path, name, others)
  const sv = survey(file, name, effects, w.effects ?? 'no effects file')
  const base = ['patterns', name]
  const owner = { file: w.path, scene: w.scene, data: p as unknown as Record<string, unknown> }
  const has = (s: Spec) => valueAt(p, s.at) !== undefined
  const set = SPECS.filter(has)
  // A look's field is added only to a pattern that has a look to hold it.
  const addable = SPECS.filter(s => !has(s) && (s.at[0] !== 'look' || (p.look !== null && typeof p.look === 'object')))
  const ctx = { effects, firsts: firsts(file) }
  const flies = typeof p.speed === 'number' && typeof p.life === 'number'

  const rename = (to: string) => {
    const n = to.trim()
    if (n === name) return
    if (!n) return refuse('a pattern needs a name')
    if (n in file.patterns) return refuse(`there is a pattern ${n} already`)
    void writes(renaming(file, w.path, name, n)).then(() => studio.select(n))
  }
  const remove = () => {
    setRemoving(false)
    void write(base, undefined).then(() => studio.select(undefined))
  }
  const add = (key: string) => {
    const spec = SPECS.find(s => s.at.join('.') === key)!
    const value = spec.absent(p, ctx)
    if (value === undefined) return refuse(`${spec.label} has nothing to be: the scene's effects file ${effects ? 'has no effects' : 'has not been read yet'}`)
    void write([...base, ...spec.at], value)
  }
  const point = studio.point?.scene === w.scene ? studio.point.at : undefined

  return (
    <Section title={<>{name} {sv.problems.length ? <Badge tone="danger">broken</Badge> : null}</>} extra={<Button title={`remove pattern ${name}`} onClick={() => (users.length ? setRemoving(true) : remove())}>✕</Button>}>
      {removing && (
        <>
          <Note>{name} is named in {users.length} {users.length === 1 ? 'place' : 'places'}, listed under Named By: each will name a pattern there is none of.</Note>
          <Row>
            <Button title={`remove ${name} anyway`} onClick={remove}>Remove</Button>
            <Button title={`keep ${name}`} onClick={() => setRemoving(false)}>Keep</Button>
          </Row>
        </>
      )}
      <LabelledRow label="name"><TextField label="pattern name" value={name} onChange={(v, done) => { if (done) rename(v) }} /></LabelledRow>
      {sv.problems.map(x => <Note key={x}>{x}.</Note>)}
      <Section title="Named By" extra={<Badge>{users.length}</Badge>} open={users.length > 0}>
        {users.length
          ? <Table<Naming> label={`where ${name} is named`} rows={users} keyOf={u => `${u.file} ${u.at.join('.')}`} columns={[
              { key: 'file', title: 'File', cell: u => u.file, sort: u => u.file },
              { key: 'at', title: 'Where', cell: u => u.at.join('.'), sort: u => u.at.join('.') },
            ]} />
          : <Note>No other json entry of the catalogue names {name}.</Note>}
      </Section>
      <Section title="Fields">
        {set.map(s => (
          <LabelledRow
            key={s.at.join('.')}
            label={s.label}
            title={s.title}
            extra={s.needed ? undefined : <Button title={`remove ${s.at.join(' ')} of ${name}`} onClick={() => void write([...base, ...s.at], undefined)}>✕</Button>}
          >
            <Field label={`${name} ${s.at.join(' ')}`} value={valueAt(p, s.at)} at={[...base, ...s.at]} owner={owner} onChange={(v, done) => { if (done) void write([...base, ...s.at], v) }} />
          </LabelledRow>
        ))}
        {addable.length > 0 && (
          <LabelledRow label="add">
            <Select<string> label={`add a field to ${name}`} value="" options={[{ value: '', label: 'a field…' }, ...addable.map(s => ({ value: s.at.join('.'), label: s.label }))]} onChange={v => { if (v) add(v) }} />
          </LabelledRow>
        )}
      </Section>
      <Section title="Preview">
        <LabelledRow label="heading" title="the way it is fired along the ground: degrees from the world's +z toward its +x">
          <AngleDial label="preview heading" value={studio.spawn.heading} onChange={(v, done) => { if (done) studio.setSpawn({ heading: v }) }} />
        </LabelledRow>
        <LabelledRow label="elevation (°)" title="degrees over level it is fired at, and the plot's">
          <NumberField label="preview elevation" value={studio.spawn.elevation} onChange={(v, done) => { if (done && v >= -90 && v <= 90) studio.setSpawn({ elevation: v }) }} />
        </LabelledRow>
        <LabelledRow label="height (m)" title="metres over the point it is fired from">
          <NumberField label="preview height" value={studio.spawn.height} onChange={(v, done) => { if (done) studio.setSpawn({ height: v }) }} />
        </LabelledRow>
        <LabelledRow label="over" extra={<Button title="fire over the middle of the view" disabled={!point} onClick={() => studio.setPoint(undefined)}>Middle</Button>}>
          {point ? <Badge>{point.map(brief).join(', ')}</Badge> : <Note>the ground under the middle of the view</Note>}
        </LabelledRow>
        <Note>Fire Pattern 3D ({ed.tools.get('volley3d.fire')?.key}) fires {name} over where the view is pressed, and loops it there.</Note>
        {flies ? <PlotView studio={studio} name={name} pattern={p} dt={w.dt} /> : <Note>{name} cannot be plotted without a speed and a life.</Note>}
      </Section>
    </Section>
  )
}

// A round's flight from the side at the preview's elevation: its height over the metres along the
// ground, and where it ends, its top, where it comes back down and its fastest.
function PlotView({ studio, name, pattern, dt }: { studio: Studio; name: string; pattern: Pattern; dt: number }) {
  const { elevation } = studio.spawn
  const key = JSON.stringify(pattern)
  const got = useMemo(() => plot(pattern, (elevation * Math.PI) / 180, dt), [key, elevation, dt]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Chart label={`${name} fired ${brief(elevation)}° up`} series={[{ label: name, points: got.points }]} x={{ label: 'along the ground (m)' }} y={{ label: 'height (m)' }} />
      <Row>
        <Badge title="where it is when its life ends: metres along the ground, and its height">ends {brief(got.end[0])} m on, {brief(got.end[1])} m up</Badge>
        <Badge title="the highest it goes over where it was fired from, and the second it is there">top {brief(got.top.height)} m at {brief(got.top.when)} s</Badge>
        <Badge title="where it first comes back down through the height it was fired from">{got.down ? `down at ${brief(got.down.along)} m, ${brief(got.down.when)} s` : 'never back down'}</Badge>
        <Badge title="the fastest it goes, its fall with its speed along its aim">fastest {brief(got.fastest)} m/s</Badge>
      </Row>
    </>
  )
}
