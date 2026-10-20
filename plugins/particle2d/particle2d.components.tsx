// The components of particle2d's extension (particle2d.extension.tsx), and of particle3d's, which
// hands each the space it works in: the Effects panel and the fields of the effects types. Every
// change the panel makes is made by the extension's functions, which its commands call too: the file
// read by `effectsIn`; its own fields by `fileEdits`; an effect added, taken out, or its layers set,
// by the list or a layer's fields, by `effectEdits`; a rename by `renamed`; each written as one change
// by the editor's `written` (the loader's `putEdits`).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor, useText } from '#editor/context.ts'
import type { FieldProps } from '#editor/editor.ts'
import type { At } from '#editor/files.ts'
import { AngleDial, Check, ColorField, NumberField, Select, Slider, TextField, VecField } from '#editor/ui/fields.tsx'
import { Field } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { NodeList } from '#editor/ui/list.tsx'
import { Surface } from '#editor/ui/sheet.tsx'
import { Table } from '#editor/ui/table.tsx'
import { cssOf, hexOf } from '#editor/ui/theme.ts'
import { clipsFiles, clipsIn, jsonsOf, putEdits, type Naming } from '#plugins/loader/loader.extension.tsx'
import { layersOf } from '#plugins/render2d/render2d.extension.tsx'
import type { Emitter, Layer } from './particle2d.plugin.ts'
import {
  BOUND, EITHER, NEEDS, SPACE, effectEdits, effectsIn, fileEdits, focus, marks, named, namings, namingsOf, renamed, sample, specs, survey, valueAt, whereFor,
  type Asset, type Context, type Edit, type Effects as File, type FileSpec, type Space, type Studio, type Where,
} from './particle2d.extension.tsx'

type V2 = [number, number]
const brief = (v: number) => String(+v.toFixed(3))

// A theme colour, as the surface's canvas reads it.
const themed = (ctx: CanvasRenderingContext2D) => cssOf(ctx.canvas)

// The files at `paths`, each read by the editor once and handed to `as`, which a text is handed once;
// a file not read yet, or that `as` throws on, is left out.
function useRead<T>(paths: string[], as: (text: string, path: string) => T): { path: string; value: T }[] {
  const ed = useEditor(['texts'], paths)
  const key = paths.join('\n')
  useEffect(() => {
    for (const p of key.split('\n').filter(Boolean)) if (!ed.texts.has(p)) void ed.text(p).catch(e => ed.error(`${p}: ${(e as Error).message}`))
  }, [ed, key])
  const cache = useRef(new Map<string, { text: string; value: T | undefined }>())
  return paths.flatMap(path => {
    const text = ed.texts.get(path)
    if (text === undefined) return []
    let had = cache.current.get(path)
    if (had?.text !== text) {
      let value: T | undefined
      try {
        value = as(text, path)
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

// A [min, max] pair: each typed or dragged, the other pushed along so that min stays at or under
// max, whole numbers for `n`; under them a bar of the span, from 0 to the furthest of the two.
export function Range({ value, onChange, at, label }: FieldProps<V2>) {
  const ed = useEditor(['theme'])
  const whole = at[at.length - 1] === 'n'
  const [live, setLive] = useState<V2 | undefined>(undefined)
  const [lo, hi] = live ?? value
  const set = (i: 0 | 1, v: number, done: boolean) => {
    const x = whole ? Math.round(v) : v
    const next: V2 = i === 0 ? [x, Math.max(x, hi)] : [Math.min(lo, x), x]
    setLive(done ? undefined : next)
    onChange(next, done)
  }
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const color = themed(ctx)
    const a = Math.min(0, lo), b = Math.max(0, hi) === a ? a + 1 : Math.max(0, hi)
    const x = (v: number) => ((v - a) / (b - a)) * w
    ctx.fillStyle = color('--border')
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = color('--accent')
    ctx.fillRect(x(lo), 0, Math.max(2, x(hi) - x(lo)), h)
  }
  return (
    <>
      <Row>
        <NumberField label={label && `${label} min`} integer={whole} value={lo} onChange={(v, done) => set(0, v, done)} />
        <NumberField label={label && `${label} max`} integer={whole} value={hi} onChange={(v, done) => set(1, v, done)} />
      </Row>
      <Surface label={`${label ?? 'range'} from ${lo} to ${hi}`} height={4} version={`${lo} ${hi} ${ed.theme}`} draw={draw} />
    </>
  )
}

// An opacity, from 0 to 1.
export function Opacity({ value, onChange, label }: FieldProps<number>) {
  return <Slider label={label} min={0} max={1} step={0.01} value={value} onChange={onChange} />
}

// A clip of the sheet the layer draws from: the layer is the owner's `data`, else the value that
// holds the field in the owner's file.
export function Clip({ value, onChange, at, owner, label, space }: FieldProps<string> & { space: Space }) {
  const ed = useEditor(['game', 'selection'])
  const w = whereFor(ed, owner, space)
  const file = useJson(owner.data ? undefined : owner.file)
  const layer = (owner.data ?? valueAt(file, at.slice(0, -1))) as Emitter | undefined
  const sheet = layer?.sheet
  const clips = useClips(w?.assets ?? {}, sheet ? [sheet] : []).get(sheet ?? '') ?? []
  const why = !sheet ? 'the layer draws no sheet' : `not in ${sheet}`
  return <Select<string> label={label} value={value} options={[...new Set([value, ...clips])].map(c => ({ value: c, label: clips.includes(c) ? c : `${c} (${why})` }))} onChange={onChange} />
}

// An effect of the effects file.
export function EffectName({ value, onChange, owner, label, space }: FieldProps<string> & { space: Space }) {
  const ed = useEditor(['game', 'selection'])
  const w = whereFor(ed, owner, space)
  const file = useJson(w?.path) as File | undefined
  const names = Object.keys(file?.effects ?? {})
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (not in ${w?.path ?? 'an effects file'})` }))} onChange={onChange} />
}

// A layer of `world.render2d` of the scene the effects file is drawn in.
export function LayerName({ value, onChange, owner, label }: FieldProps<string>) {
  const ed = useEditor(['game', 'selection'])
  const w = whereFor(ed, owner, SPACE)
  const names = w ? layersOf(ed, w.scene) : []
  return <Select<string> label={label} value={value} options={[...new Set([value, ...names])].map(n => ({ value: n, label: names.includes(n) ? n : `${n} (no render2d layer)` }))} onChange={onChange} />
}

// ---------------------------------------------------------------- the panel

export function Effects({ studio }: { studio: Studio }) {
  const ed = useEditor(['game', 'selection'])
  useSyncExternalStore(studio.subscribe, studio.version)
  useEffect(() => studio.open(), [studio])
  const { space } = studio
  const w = focus(ed, space)
  const text = useText(w?.path)
  const parsed = useMemo(() => (text === undefined ? undefined : effectsIn(text)), [text])
  if (!ed.session) return <Empty>Open a game, and the effects of the scene selected are made here.</Empty>
  if (!w) return <Empty>No scene of {ed.session.game.name} draws effects: none names {space.plugin} in its plugins with a json entry of its catalogue for its world's effects.</Empty>
  if (!parsed) return <Empty>Reading {w.path}…</Empty>
  if ('error' in parsed) return <Empty>{w.path}: {parsed.error}.</Empty>
  return <EffectsFile key={w.path} studio={studio} w={w} file={parsed.file} />
}

function EffectsFile({ studio, w, file }: { studio: Studio; w: Where; file: File }) {
  const ed = useEditor(['game'])
  const [filter, setFilter] = useState('')
  const [fresh, setFresh] = useState('')
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const names = Object.keys(file.effects)
  // The other json entries, each parsed once a text, so a drawing with nothing new hands `namingsOf`
  // the same values and it walks nothing.
  const others = useRead(jsonsOf(w.assets, w.path), text => JSON.parse(text) as unknown)
  const sheets = names.flatMap(n => file.effects[n].flatMap(l => (named(l) === undefined && (l as Emitter).sheet ? [(l as Emitter).sheet!] : [])))
  const clips = useClips(w.assets, sheets)
  const clipsOf = (sheet: string) => clips.get(sheet)
  const naming = namingsOf(file, w.path, others)
  const rows = names.map(name => ({
    name,
    layers: file.effects[name].length,
    named: naming.get(name)!.length,
    problems: survey(file, name, w.assets, clipsOf, studio.space).problems,
  }))
  const needle = filter.trim().toLowerCase()
  const shown = rows.filter(r => r.name.toLowerCase().includes(needle))
  const selected = studio.effect !== undefined && studio.effect in file.effects ? studio.effect : undefined
  const s = ed.session!
  const shows = s.viewing === w.scene

  const refuse = (why: string) => {
    setRefused(why)
    ed.error(`${studio.space.plugin}: refused: ${why}`)
  }
  // The edits `make` makes, written as one change; refused, and written nowhere, when it throws.
  const put: Put = make => putEdits(ed, make, refuse, () => setRefused(undefined))
  const add = () => {
    const n = fresh.trim()
    if (!n) return refuse('an effect needs a name')
    if (Object.hasOwn(file.effects, n)) return refuse(`there is an effect ${n} already`)
    void put(() => effectEdits(file, w.path, n, [{ ...studio.space.emitter }]))?.then(() => studio.select(n))
    setFresh('')
  }
  const field = (f: FileSpec) => (
    <Field label={f.key} value={file[f.key]} at={[f.key]} owner={{ file: w.path, scene: w.scene }} onChange={(v, done) => { if (done) void put(() => fileEdits(ed, w, file, f, v)) }} />
  )

  return (
    <PanelBody bar={
      <Toolbar label="effects">
        <Badge tone="dim">{w.scene}</Badge>
        <span className="ui-spacer" />
        <Button title="loop the selected effect" pressed={studio.loop} disabled={!shows} onClick={() => studio.setLoop(!studio.loop)}>Loop</Button>
        <Button title="fire the selected effect once" disabled={!shows || !selected} onClick={() => studio.fire()}>Fire Once</Button>
        <Badge>{names.length} effects</Badge>
      </Toolbar>
    }>
      {refused && <Note>Refused: {refused}</Note>}
      {!shows && <Note>The game view shows {s.viewing ?? 'nothing'}: the effects preview once it shows {w.scene}.</Note>}
      {shows && studio.held && <Note>{studio.held}</Note>}
      <Section title={<>File <Badge tone="dim">{w.path}</Badge></>} open={false}>
        {studio.space.file.map(f => (
          <LabelledRow key={f.key} label={f.key} title={f.title} extra={f.absent && file[f.key] !== undefined ? <Button title={`remove ${f.key}`} onClick={() => void put(() => fileEdits(ed, w, file, f, undefined))}>✕</Button> : undefined}>
            {f.absent && file[f.key] === undefined
              ? <Row><Note>{f.absent.note}</Note><Button title={`set ${f.key}`} onClick={() => void put(() => fileEdits(ed, w, file, f, f.absent!.set))}>Set</Button></Row>
              : field(f)}
          </LabelledRow>
        ))}
      </Section>
      <Section title="Effects" extra={<Badge>{shown.length === names.length ? names.length : `${shown.length} of ${names.length}`}</Badge>}>
        <TextField label="filter effects" value={filter} onChange={setFilter} />
        <Table
          label="effects"
          rows={shown}
          keyOf={r => r.name}
          selected={selected}
          onSelect={studio.select}
          columns={[
            { key: 'name', title: 'Effect', cell: r => r.problems.length ? <Row>{r.name}<Badge tone="danger">broken</Badge></Row> : r.name, sort: r => r.name },
            { key: 'layers', title: 'Layers', cell: r => r.layers, sort: r => r.layers, numeric: true },
            { key: 'named', title: 'Named', cell: r => r.named, sort: r => r.named, numeric: true },
          ]}
        />
        <LabelledRow label="new" extra={<Button title="add an effect" disabled={!fresh.trim()} onClick={add}>Add</Button>}>
          <TextField label="new effect name" value={fresh} onChange={setFresh} />
        </LabelledRow>
      </Section>
      {selected
        ? <EffectForm key={selected} studio={studio} w={w} file={file} name={selected} others={others} clipsOf={clipsOf} put={put} refuse={refuse} />
        : <Empty>Select an effect to edit and preview it.</Empty>}
    </PanelBody>
  )
}

// Writes the edits a function makes as one change, or refuses them, saying why, when it throws; the
// write is handed back, or undefined when refused.
type Put = (make: () => Edit[]) => Promise<void> | undefined

function EffectForm({ studio, w, file, name, others, clipsOf, put, refuse }: {
  studio: Studio; w: Where; file: File; name: string; others: { path: string; value: unknown }[]
  clipsOf(sheet: string): string[] | undefined; put: Put; refuse(why: string): void
}) {
  // The Fire Effect tool's key, as the tool was added.
  const ed = useEditor(['extensions'])
  const [removing, setRemoving] = useState(false)
  const layers = file.effects[name]
  const users = namings(file, w.path, name, others)
  const sv = survey(file, name, w.assets, clipsOf, studio.space)
  const { space } = studio
  const sp = studio.spawn
  const base = ['effects', name]
  const names = Object.keys(file.effects)
  // The effects an `{ effect }` layer of this one may name: every other, but none made of this one.
  const madeOf = (n: string, seen: string[] = []): boolean => n === name || (!seen.includes(n) && (file.effects[n] ?? []).some(l => { const e = named(l); return e !== undefined && madeOf(e, [...seen, n]) }))
  const nameable = names.filter(n => !madeOf(n))
  const sheets = Object.entries(w.assets).filter(([, a]) => a.type === 'sheet').map(([n]) => n)

  const rename = (to: string) => {
    const n = to.trim()
    if (n === name) return
    void put(() => renamed(file, w.path, name, n))?.then(() => studio.select(n))
  }
  const remove = () => {
    setRemoving(false)
    void put(() => effectEdits(file, w.path, name, null))?.then(() => studio.select(undefined))
  }
  // The effect's layers made `next`, by the list or a layer's own fields.
  const change = (next: Layer[]) => void put(() => effectEdits(file, w.path, name, next))
  const set = (i: number, layer: Layer) => change(layers.map((l, j) => (j === i ? layer : l)))
  const point = studio.point?.scene === w.scene ? studio.point.at : undefined

  return (
    <Section title={<>{name} {sv.problems.length ? <Badge tone="danger">broken</Badge> : null}</>} extra={<Button title={`remove effect ${name}`} onClick={() => (users.length ? setRemoving(true) : remove())}>✕</Button>}>
      {removing && (
        <>
          <Note>{name} is named in {users.length} {users.length === 1 ? 'place' : 'places'}, listed under Named By: each will name an effect there is none of.</Note>
          <Row>
            <Button title={`remove ${name} anyway`} onClick={remove}>Remove</Button>
            <Button title={`keep ${name}`} onClick={() => setRemoving(false)}>Keep</Button>
          </Row>
        </>
      )}
      <LabelledRow label="name"><TextField label="effect name" value={name} onChange={(v, done) => { if (done) rename(v) }} /></LabelledRow>
      {sv.problems.map(p => <Note key={p}>{p}.</Note>)}
      <Section title="Named By" extra={<Badge>{users.length}</Badge>} open={users.length > 0}>
        {users.length
          ? <Table<Naming> label={`where ${name} is named`} rows={users} keyOf={u => `${u.file} ${u.at.join('.')}`} columns={[
              { key: 'file', title: 'File', cell: u => u.file, sort: u => u.file },
              { key: 'at', title: 'Where', cell: u => u.at.join('.'), sort: u => u.at.join('.') },
            ]} />
          : <Note>No layer of the effects and no other json entry of the catalogue names {name}.</Note>}
      </Section>
      <Section title="Preview">
        {space.axes === 2
          ? <LabelledRow label="dir" title="the way the effect is aimed, clockwise from up the screen"><AngleDial label="preview dir" value={sp.angle} onChange={v => studio.setSpawn({ angle: v })} /></LabelledRow>
          : <LabelledRow label="dir" title="the way the effect is aimed, a vector of the world"><VecField label="preview dir" value={sp.aim} onChange={(v, done) => { if (done) studio.setSpawn({ aim: [...v] }) }} /></LabelledRow>}
        {sv.beam && (
          <>
            <Note>{name} draws a beam, so it is spawned with a to: the point this far from where it is emitted, in world units.</Note>
            <LabelledRow label="to"><VecField label="preview to" value={sp.to} onChange={(v, done) => { if (done) studio.setSpawn({ to: v.slice(0, space.axes) }) }} /></LabelledRow>
          </>
        )}
        <LabelledRow label="tint" title="the colour of the layers that set none" extra={<Check label="preview has a tint" value={sp.tint !== undefined} onChange={on => studio.setSpawn({ tint: on ? 0xffffff : undefined })} />}>
          {sp.tint !== undefined ? <ColorField label="preview tint" value={sp.tint} onChange={v => studio.setSpawn({ tint: v as number })} /> : <Note>none</Note>}
        </LabelledRow>
        <LabelledRow label="scale" title="times every length of the effect: a particle's size, speed and jitter, the box, g and pull"><NumberField label="preview scale" value={sp.scale} onChange={(v, done) => { if (done) studio.setSpawn({ scale: Math.max(0, v) }) }} /></LabelledRow>
        {sv.lives && (
          <LabelledRow label="life (s)" title="the seconds the effect goes on bursting, and a layer that lasts lives"><NumberField label="preview life" value={sp.life} onChange={(v, done) => { if (done) studio.setSpawn({ life: Math.max(0, v) }) }} /></LabelledRow>
        )}
        <LabelledRow label="seed" title="the same particles every emit" extra={<Check label="preview has a seed" value={sp.seed !== undefined} onChange={on => studio.setSpawn({ seed: on ? 1 : undefined })} />}>
          {sp.seed !== undefined ? <NumberField label="preview seed" integer value={sp.seed} onChange={(v, done) => { if (done) studio.setSpawn({ seed: Math.max(0, Math.round(v)) }) }} /> : <Note>each emit its own</Note>}
        </LabelledRow>
        <LabelledRow label="at" extra={<Button title="emit at the middle of the view" disabled={!point} onClick={() => studio.setPoint(undefined)}>Middle</Button>}>
          {point ? <Badge>{point.map(brief).join(', ')}</Badge> : <Note>the ground under the middle of the view</Note>}
        </LabelledRow>
        <Note>{space.tool.title} ({ed.tools.get(`${space.plugin}.fire`)?.key}) fires {name} where the view is pressed, and loops it there.</Note>
      </Section>
      <Section title="Layers" extra={<Badge>{layers.length}</Badge>}>
        <NodeList<Layer>
          label={`layers of ${name}`}
          items={layers}
          onChange={change}
          make={() => ({ ...space.emitter })}
          name={(l, i) => `layer ${i} ${named(l) !== undefined ? `effect ${named(l)}` : (l as Emitter).clip ?? 'square'}`}
          render={(l, i) => named(l) !== undefined
            ? <LabelledRow label="effect"><Field label={`layer ${i} effect`} value={named(l)} at={[...base, i, 'effect']} owner={{ file: w.path, scene: w.scene, data: l as Record<string, unknown> }} onChange={(v, done) => { if (done) set(i, { ...l, effect: v as string }) }} /></LabelledRow>
            : <EmitterForm layer={l as Emitter} at={[...base, i]} i={i} w={w} ctx={{ sheets, clips: (l as Emitter).sheet ? clipsOf((l as Emitter).sheet!) : undefined, dir: space.dir(sp) }} clipsOf={clipsOf} tint={sp.tint} life={sp.life} set={next => set(i, next)} refuse={refuse} />}
        />
        <LabelledRow label="add">
          <Select<string> label={`add an effect layer to ${name}`} value="" options={[{ value: '', label: 'an effect layer…' }, ...nameable.map(n => ({ value: n }))]} onChange={v => { if (v) change([...layers, { effect: v }]) }} />
        </LabelledRow>
      </Section>
    </Section>
  )
}

function EmitterForm({ layer, at, i, w, ctx, clipsOf, tint, life: lasting, set: change, refuse }: {
  layer: Emitter; at: At; i: number; w: Where; ctx: Context; clipsOf(sheet: string): string[] | undefined; tint: number | undefined
  // The seconds a layer that lasts lives, the life its effect is previewed with.
  life: number
  // The layer made `next`, one change.
  set(next: Emitter): void
  refuse(why: string): void
}) {
  const ed = useEditor(['theme'])
  const fields = specs(w.space)
  const owner = { file: w.path, scene: w.scene, data: layer as Record<string, unknown> }
  const set = fields.filter(s => layer[s.key] !== undefined)
  const addable = fields.filter(s => layer[s.key] === undefined && (NEEDS[s.key] === undefined || layer[NEEDS[s.key]!] !== undefined))
  // The one of `life` and `lasts` a layer has, which it cannot go without.
  const kept = (key: keyof Emitter) => EITHER.includes(key) && EITHER.every(k => k === key || layer[k] === undefined)
  const add = (key: string) => {
    const spec = fields.find(s => s.key === key)!
    const needing = fields.filter(s => NEEDS[s.key] === spec.key && BOUND.includes(s.key) && layer[s.key] === undefined)
    const value = spec.absent(layer, ctx)
    if (value === undefined) return refuse(`${spec.key} has nothing to be: the catalogue has no ${spec.key === 'sheet' ? 'sheet' : `clip of ${layer.sheet} read yet`}`)
    // The one of `life` and `lasts` it had goes as the other comes, and a field it needs comes with it.
    const next: Record<string, unknown> = { ...layer, [spec.key]: value }
    if (EITHER.includes(spec.key)) for (const k of EITHER) if (k !== spec.key) delete next[k]
    for (const n of needing) {
      const v = n.absent(next as Emitter, { ...ctx, clips: clipsOf(value as string) })
      if (v === undefined) return refuse(`${spec.key} ${String(value)} needs a ${n.key}, and its clips have not been read yet`)
      next[n.key] = v
    }
    change(next as Emitter)
  }
  // The field goes, and every one that needs it.
  const remove = (key: keyof Emitter) => {
    const next: Record<string, unknown> = { ...layer }
    for (const k of [key, ...fields.filter(s => NEEDS[s.key] === key).map(s => s.key)]) delete next[k]
    change(next as Emitter)
  }
  const draw = (c: CanvasRenderingContext2D, width: number, height: number) => {
    const color = themed(c)
    const band = height - 12
    const life = layer.lasts ? lasting : layer.life?.[1] ?? 0
    const top = Math.max(1, layer.grow ?? 1)
    for (let x = 0; x < width; x++) {
      const s = sample(layer, tint, width > 1 ? x / (width - 1) : 0, life)
      const h = Math.max(1, (band * s.size) / top)
      c.fillStyle = hexOf(s.color)
      c.globalAlpha = Math.max(0, Math.min(1, s.alpha))
      c.fillRect(x, (band - h) / 2, 1, h)
    }
    c.globalAlpha = 1
    c.fillStyle = color('--dim')
    c.font = '10px ui-monospace, Menlo, monospace'
    if (!(life > 0)) return void c.fillText('no life', 2, height - 2)
    // The shortest life a particle is rolled, where its colour and opacity have reached their ends.
    if (layer.life && layer.life[0] < life) {
      const x = (layer.life[0] / life) * width
      for (let y = 0; y < band; y += 4) c.fillRect(x, y, 1, 2)
    }
    const ts = marks(life)
    ts.forEach((t, k) => {
      const x = Math.min(width - 1, (t / life) * width)
      c.fillRect(x, band, 1, 3)
      const text = k === ts.length - 1 ? `${t} s` : String(t)
      const tw = c.measureText(text).width
      c.fillText(text, Math.min(x + 2, width - tw - 1), height - 1)
    })
  }
  return (
    <>
      <Surface label={`layer ${i}: one particle over its life of ${layer.lasts ? `its effect's, ${lasting}` : layer.life?.[1] ?? 0} s`} height={34} version={`${JSON.stringify(layer)} ${tint} ${lasting} ${ed.theme}`} draw={draw} />
      {set.map(s => (
        <LabelledRow key={s.key} label={s.label} title={s.title} extra={kept(s.key) ? undefined : <Button title={`remove ${s.key} of layer ${i}`} onClick={() => remove(s.key)}>✕</Button>}>
          <Field label={`layer ${i} ${s.key}`} value={layer[s.key]} at={[...at, s.key]} owner={owner} onChange={(v, done) => { if (done) change({ ...layer, [s.key]: v }) }} />
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
