// The components of volley2d's extension (volley2d.extension.tsx): the Patterns panel and the fields
// of the patterns types. Every change the panel makes is made by the extension's functions, which its
// commands call too: the file read by `patternsIn`; a pattern added, taken out, or its layers set, by
// the list or a layer's fields, by `patternEdits`; a rename by `renamed`; each written as one change
// by the editor's `written` (the loader's `putEdits`); and the plot worked out by `plotted` and drawn by
// `drawPlot`.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor, useText } from '#editor/context.ts'
import type { FieldProps } from '#editor/editor.ts'
import type { At } from '#editor/files.ts'
import { AngleDial, NumberField, Select, TextField } from '#editor/ui/fields.tsx'
import { Field } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { NodeList } from '#editor/ui/list.tsx'
import { Surface } from '#editor/ui/sheet.tsx'
import { Table } from '#editor/ui/table.tsx'
import { cssOf } from '#editor/ui/theme.ts'
import { clipsFiles, clipsIn, jsonsOf, putEdits, type Naming } from '#plugins/loader/loader.extension.tsx'
import { layersOf } from '#plugins/render2d/render2d.extension.tsx'
import type { Emitter, Layer, Patterns as File } from './volley2d.sim.ts'
import {
  BOUND, NEEDS, REF, SPECS, bearing, drawPlot, focus, fresh, heading, named, namings, patternEdits, patternsIn, plotted, renamed,
  survey, valueAt, whereFor,
  type Asset, type Context, type Edit, type Ref, type Spec, type Studio, type Where,
} from './volley2d.extension.tsx'

// Writes the edits a function makes as one change, or refuses them, saying why, when it throws; the
// write is handed back, or undefined when refused.
type Put = (make: () => Edit[]) => Promise<void> | undefined
const brief = (v: number) => String(+v.toFixed(3))

// A theme colour, as the surface's canvas reads it.
const themed = (ctx: CanvasRenderingContext2D) => cssOf(ctx.canvas)

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

// The clips of every sheet entry of a catalogue that `names` names, by name; a sheet whose files have
// not all been read is not in it. Drawn again for a change to one of the files they are read from.
function useClips(assets: Record<string, Asset>, names: string[]): Map<string, string[]> {
  const ed = useEditor([])
  const sheets = [...new Set(names)].filter(n => assets[n]?.type === 'sheet')
  useEditor(['texts'], sheets.flatMap(n => clipsFiles(ed, assets[n])))
  return new Map(sheets.flatMap(n => {
    const clips = clipsIn(ed, assets[n])
    return clips ? [[n, clips] as const] : []
  }))
}

// ---------------------------------------------------------------- the types

// A clip of the sheet the layer draws from: the layer is the owner's `data`, else the value that
// holds the field in the owner's file.
export function ClipName({ value, onChange, at, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const w = whereFor(ed, owner)
  const file = useJson(owner.data ? undefined : owner.file)
  const layer = (owner.data ?? valueAt(file, at.slice(0, -1))) as Emitter | undefined
  const sheet = layer?.sheet
  const clips = useClips(w?.assets ?? {}, sheet ? [sheet] : []).get(sheet ?? '') ?? []
  const why = !sheet ? 'the layer draws no sheet' : `not in ${sheet}`
  return <Select<string> label={label} value={value} options={[...new Set([value, ...clips])].map(c => ({ value: c, label: clips.includes(c) ? c : `${c} (${why})` }))} onChange={onChange} />
}

// A pattern of the patterns file.
export function PatternName({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const w = whereFor(ed, owner)
  const file = useJson(w?.path) as File | undefined
  const names = Object.keys(file?.patterns ?? {})
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (not in ${w?.path ?? 'a patterns file'})` }))} onChange={onChange} />
}

// A layer of `world.render2d` of the scene the patterns file is fired in.
export function LayerName({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const w = whereFor(ed, owner)
  const names = w ? layersOf(ed, w.scene) : []
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (no render2d layer)` }))} onChange={onChange} />
}

// ---------------------------------------------------------------- the panel

export function Patterns({ studio }: { studio: Studio }) {
  const ed = useEditor(['game', 'selection'])
  useSyncExternalStore(studio.subscribe, studio.version)
  useEffect(() => studio.open(), [studio])
  const w = focus(ed)
  const text = useText(w?.path)
  const parsed = useMemo(() => (text === undefined ? undefined : patternsIn(text)), [text])
  if (!ed.session) return <Empty>Open a game, and the bullet patterns of the scene selected are made here.</Empty>
  if (!w) return <Empty>No scene of {ed.session.game.name} fires volleys: none names volley2d in its plugins with a json entry of its catalogue for its world's patterns.</Empty>
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
  const others = useRead(jsonsOf(w.assets, w.path))
  const sheets = names.flatMap(n => file.patterns[n].flatMap(l => (named(l) === undefined && (l as Emitter).sheet ? [(l as Emitter).sheet!] : [])))
  const clips = useClips(w.assets, sheets)
  const clipsOf = (sheet: string) => clips.get(sheet)
  const layers = layersOf(ed, w.scene)
  const rows = names.map(name => {
    const sv = survey(file, name, w.assets, clipsOf, { world: w.world, layers })
    return { name, layers: file.patterns[name].length, bullets: sv.shots.length, named: namings(file, w.path, name, others).length, problems: sv.problems }
  })
  const needle = filter.trim().toLowerCase()
  const shown = rows.filter(r => r.name.toLowerCase().includes(needle))
  const selected = studio.pattern !== undefined && studio.pattern in file.patterns ? studio.pattern : undefined
  const s = ed.session!
  const shows = s.viewing === w.scene

  const refuse = (why: string) => {
    setRefused(why)
    ed.error(`volley2d: refused: ${why}`)
  }
  // The edits `make` makes, written as one change; refused, and written nowhere, when it throws.
  const put: Put = make => putEdits(ed, make, refuse, () => setRefused(undefined))
  const add = () => {
    const n = adding.trim()
    if (!n) return refuse('a pattern needs a name')
    if (Object.hasOwn(file.patterns, n)) return refuse(`there is a pattern ${n} already`)
    void put(() => patternEdits(file, w.path, n, [fresh(file)]))?.then(() => studio.select(n))
    setAdding('')
  }

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
            { key: 'layers', title: 'Layers', cell: r => r.layers, sort: r => r.layers, numeric: true },
            { key: 'bullets', title: 'Bullets', cell: r => r.bullets, sort: r => r.bullets, numeric: true },
            { key: 'named', title: 'Named', cell: r => r.named, sort: r => r.named, numeric: true },
          ]}
        />
        <LabelledRow label="new" extra={<Button title="add a pattern" disabled={!adding.trim()} onClick={add}>Add</Button>}>
          <TextField label="new pattern name" value={adding} onChange={setAdding} />
        </LabelledRow>
      </Section>
      {selected
        ? <PatternForm key={selected} studio={studio} w={w} file={file} name={selected} others={others} clipsOf={clipsOf} drawn={sheets} layers={layers} put={put} refuse={refuse} />
        : <Empty>Select a pattern to edit and preview it.</Empty>}
    </PanelBody>
  )
}

function PatternForm({ studio, w, file, name, others, clipsOf, drawn, layers: renders, put, refuse }: {
  studio: Studio; w: Where; file: File; name: string; others: { path: string; value: unknown }[]
  clipsOf(sheet: string): string[] | undefined; drawn: string[]; layers: string[]; put: Put; refuse(why: string): void
}) {
  // The Fire Pattern tool's key, as the tool was added.
  const ed = useEditor(['extensions'])
  const [removing, setRemoving] = useState(false)
  const layers = file.patterns[name]
  const users = namings(file, w.path, name, others)
  const sv = survey(file, name, w.assets, clipsOf, { world: w.world, layers: renders })
  const sp = studio.spawn
  const base = ['patterns', name]
  const names = Object.keys(file.patterns)
  // The patterns a `{ pattern }` layer of this one may name: every other, but none built of this one.
  const madeOf = (n: string, seen: string[] = []): boolean => n === name || (!seen.includes(n) && (file.patterns[n] ?? []).some(l => { const p = named(l); return p !== undefined && madeOf(p, [...seen, n]) }))
  const nameable = names.filter(n => !madeOf(n))
  // The sheets a field `sheet` may be added as: those the file draws from first, then the others.
  const sheets = [...new Set([...drawn, ...Object.entries(w.assets).filter(([, a]) => a.type === 'sheet').map(([n]) => n)])].filter(n => w.assets[n]?.type === 'sheet')

  const rename = (to: string) => {
    const n = to.trim()
    if (n === name) return
    void put(() => renamed(file, w.path, name, n))?.then(() => studio.select(n))
  }
  const remove = () => {
    setRemoving(false)
    void put(() => patternEdits(file, w.path, name, null))?.then(() => studio.select(undefined))
  }
  // The pattern's layers made `next`, by the list or a layer's own fields.
  const change = (next: Layer[]) => void put(() => patternEdits(file, w.path, name, next))
  const set = (i: number, layer: Layer) => change(layers.map((l, j) => (j === i ? layer : l)))
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
      {sv.problems.map(p => <Note key={p}>{p}.</Note>)}
      <Section title="Named By" extra={<Badge>{users.length}</Badge>} open={users.length > 0}>
        {users.length
          ? <Table<Naming> label={`where ${name} is named`} rows={users} keyOf={u => `${u.file} ${u.at.join('.')}`} columns={[
              { key: 'file', title: 'File', cell: u => u.file, sort: u => u.file },
              { key: 'at', title: 'Where', cell: u => u.at.join('.'), sort: u => u.at.join('.') },
            ]} />
          : <Note>No layer of the patterns and no other json entry of the catalogue names {name}.</Note>}
      </Section>
      <Section title="Preview">
        <LabelledRow label="aim" title="the heading the volley is fired along: 0 right, 90 straight down the screen, radians in the file">
          <AngleDial label="preview aim" value={bearing(sp.dir)} onChange={v => studio.setSpawn({ dir: heading(v) })} />
        </LabelledRow>
        <LabelledRow label="at" extra={<Button title="fire at the middle of the view" disabled={!point} onClick={() => studio.setPoint(undefined)}>Middle</Button>}>
          {point ? <Badge>{point.slice(0, 2).map(brief).join(', ')}</Badge> : <Note>the ground under the middle of the view</Note>}
        </LabelledRow>
        <Note>Fire Pattern ({ed.tools.get('volley2d.fire')?.key}) fires {name} where the view is pressed, and loops it there.</Note>
        <PlotView studio={studio} w={w} name={name} shots={sv.problems.length ? undefined : sv.shots} />
      </Section>
      <Section title="Layers" extra={<Badge>{layers.length}</Badge>}>
        <NodeList<Layer>
          label={`layers of ${name}`}
          items={layers}
          onChange={change}
          make={() => fresh(file)}
          name={(l, i) => `layer ${i} ${named(l) !== undefined ? `pattern ${named(l)}` : (l as Emitter).clip ?? 'undrawn'}`}
          render={(l, i) => named(l) !== undefined
            ? <LayerForm<Ref> layer={l as Ref} fields={REF} at={[...base, i]} i={i} w={w} ctx={{ sheets, clips: undefined, world: w.world, dt: w.dt }} clipsOf={clipsOf} set={next => set(i, next)} refuse={refuse} />
            : <LayerForm<Emitter> layer={l as Emitter} fields={SPECS} at={[...base, i]} i={i} w={w} ctx={{ sheets, clips: (l as Emitter).sheet ? clipsOf((l as Emitter).sheet!) : undefined, world: w.world, dt: w.dt }} clipsOf={clipsOf} set={next => set(i, next)} refuse={refuse} />}
        />
        <LabelledRow label="add">
          <Select<string> label={`add a pattern layer to ${name}`} value="" options={[{ value: '', label: 'a pattern layer…' }, ...nameable.map(n => ({ value: n }))]} onChange={v => { if (v) change([...layers, { pattern: v }]) }} />
        </LabelledRow>
      </Section>
    </Section>
  )
}

// Every bullet's path over the bounds, faint, from the middle of them along the preview's aim; the
// most in the air at once and when, and when the last is gone.
function PlotView({ studio, w, name, shots }: { studio: Studio; w: Where; name: string; shots: ReturnType<typeof survey>['shots'] | undefined }) {
  // The plot is drawn in the theme's colours.
  const ed = useEditor(['theme'])
  const { dir, plot: span } = studio.spawn
  // The bullets as text, the same for every drawing of the form that changes none of them, which
  // surveys the pattern anew each time and hands a new list: the plot is worked out, and drawn, again
  // only for bullets that are new.
  const fired = shots && JSON.stringify(shots)
  const got = useMemo(
    () => (shots ? plotted(w.world.bounds, w.dt, shots, dir, span) : undefined),
    // `fired` is every bullet of `shots`, and changes whenever one does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fired, dir, span, w.world.bounds, w.dt],
  )
  const draw = (c: CanvasRenderingContext2D, width: number, height: number) => {
    if (got) drawPlot(c, themed(c), got, w.world.bounds, width, height)
  }
  if (!got) return <Note>{name} cannot be plotted until it builds.</Note>
  return (
    <>
      <Surface label={`${name}: every bullet's path over ${span} s`} height={200} version={[got, ed.theme]} draw={draw} />
      <Row>
        <Badge title="every bullet a volley of it fires">{shots!.length} bullets</Badge>
        <Badge title="the most bullets of one volley in the air at once, and the first second that many are">peak {got.peak} at {brief(got.when)} s</Badge>
        <Badge title="the second the last bullet is gone">{got.clear === undefined ? `in the air past ${span} s` : `gone by ${brief(got.clear)} s`}</Badge>
      </Row>
      <LabelledRow label="plot (s)" title="the seconds the plot follows each bullet for">
        <NumberField label="plot seconds" value={span} onChange={(v, done) => { if (done && v > 0) studio.setSpawn({ plot: v }) }} />
      </LabelledRow>
    </>
  )
}

// A layer's set fields by their meaning, each removable but for a `{ pattern }` layer's `pattern`, and
// the fields it does not set, each added with the value volley2d reads when it is left out.
function LayerForm<L extends object>({ layer, fields, at, i, w, ctx, clipsOf, set: change, refuse }: {
  layer: L; fields: Spec<L>[]; at: At; i: number; w: Where; ctx: Context
  clipsOf(sheet: string): string[] | undefined
  // The layer made `next`, one change.
  set(next: L): void
  refuse(why: string): void
}) {
  const owner = { file: w.path, scene: w.scene, data: layer as Record<string, unknown> }
  const has = (k: string) => (layer as Record<string, unknown>)[k] !== undefined
  const needs = NEEDS as Record<string, string | undefined>
  const set = fields.filter(s => has(s.key))
  const addable = fields.filter(s => !has(s.key) && (needs[s.key] === undefined || has(needs[s.key]!)))
  const ref = named(layer as Layer) !== undefined
  const emitter = layer as Emitter
  const add = (key: string) => {
    const spec = fields.find(s => s.key === key)!
    const needing = fields.filter(s => needs[s.key] === spec.key && (BOUND as string[]).includes(s.key) && !has(s.key))
    const value = spec.absent(layer, ctx)
    if (value === undefined) return refuse(`${spec.key} has nothing to be: the catalogue has no ${spec.key === 'sheet' ? 'sheet' : `clip of ${emitter.sheet} read yet`}`)
    // A field it needs comes with it.
    const next: Record<string, unknown> = { ...layer, [spec.key]: value }
    for (const n of needing) {
      const v = n.absent(next as L, { ...ctx, clips: clipsOf(value as string) })
      if (v === undefined) return refuse(`${spec.key} ${String(value)} needs a ${n.key}, and its clips have not been read yet`)
      next[n.key] = v
    }
    change(next as L)
  }
  // The field goes, and every one that needs it.
  const remove = (key: string) => {
    const next = { ...(layer as Record<string, unknown>) }
    for (const k of [key, ...fields.filter(s => needs[s.key] === key).map(s => s.key)]) delete next[k]
    change(next as L)
  }
  return (
    <>
      {ref && (
        <LabelledRow label="pattern" title="the pattern whose every layer this layer stands for">
          <Field label={`layer ${i} pattern`} value={named(layer as Layer)} at={[...at, 'pattern']} owner={owner} onChange={(v, done) => { if (done) change({ ...layer, pattern: v }) }} />
        </LabelledRow>
      )}
      {!ref && (!emitter.sheet || !emitter.clip) && <Note>Its bullets fly and hit, and are not drawn: it names no {emitter.sheet ? 'clip' : 'sheet and clip'}.</Note>}
      {set.map(s => (
        <LabelledRow key={s.key} label={s.label} title={s.title} extra={<Button title={`remove ${s.key} of layer ${i}`} onClick={() => remove(s.key)}>✕</Button>}>
          <Field label={`layer ${i} ${s.key}`} value={(layer as Record<string, unknown>)[s.key]} at={[...at, s.key]} owner={owner} onChange={(v, done) => { if (done) change({ ...layer, [s.key]: v }) }} />
        </LabelledRow>
      ))}
      {addable.length > 0 && (
        <LabelledRow label="add">
          <Select<string> label={`add a field to layer ${i}`} value="" options={[{ value: '', label: 'a field…' }, ...addable.map(s => ({ value: s.key, label: s.label }))]} onChange={v => { if (v) add(v) }} />
        </LabelledRow>
      )}
    </>
  )
}
