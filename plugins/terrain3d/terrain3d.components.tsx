// The components of terrain3d's extension (terrain3d.extension.tsx): the Terrain panel on a field
// file. Every value it shows is the file's, as the editor last read it, and every change it makes is
// written to the file, a value at a time, as one change the editor can undo. While a number is
// dragged the preview shows the program with the value it is at; the file takes it when it is let go.
// Each section's edits are made by its function in the extension (`layerEdits`, `reprogrammed`,
// `nodeEdits`, `bandEdits`, `surfaceEdits`, `analysisEdits`, `detailEdits`), which its command calls
// too, so a change made here and the same change asked of the command are the same bytes.
//
// The panel's sections:
//   Brush     the brush's verb, radius, hardness, strength, level and surface, and the layer it is
//             armed on; a `surface` brush whose surface is none of the field's says it paints nothing.
//   Layers    each layer's square, `at` its middle [x, z], `size` metres across and `px` pixels
//             across, the strokes it holds, a button that arms it and one that takes it out; a new
//             layer is added at a point, [0, 0] or where the brush last pointed ("here", from the
//             moment it has pointed), and is armed once the file holds it.
//   Program   the program's own numbers, `out`, and its nodes as a list: each node's inputs are
//             selects of the nodes before it; renaming a node rewrites every later node that reads
//             it, and `out`; its op makes it again with that op's numbers, keeping its inputs; each
//             number has its range (the plan's), and every edit is refused that the program could
//             not be compiled from, such as a node moved above one it reads. The list is copied as
//             JSON, each node as its form shows it (`copyOf`), and a copied list pasted over it,
//             into this field or any other; a pasted list without the node `out` names
//             makes its last node `out`. Over it, a 128 × 128 preview of the program's `world`
//             square about the origin, −z up: the height, any node's value, or any key of the land
//             record, each drawn from its lowest to its highest value, black to white, with the
//             layers' squares over it; it is worked out in the page, a few rows at a time, the page
//             let go for a turn between them (the editor's `turn`).
//   Bands     each band's colour, amount and rules, the first the base coat, every later one's edge,
//             and the grain.
//   Surfaces  each surface's name, colour, cover and edge; renaming one rewrites the strokes that
//             paint it, and one a stroke paints is not taken out.
//   Analysis  the numbers the land record reads the ground with.
//   Detail    the ground detail the browser half draws over the colours, as a list of layers: each
//             one's kind, which makes it again with that kind's starting numbers and keeps its own
//             amount, fade, edge and rules; its rules over the record's keys, the bands and the
//             surfaces; its noise's octaves, offset, angle and stretch; and its kind's numbers, a
//             texture layer's maps picked from the scene's texture entries.
// An edge is switched on with `crisp`, starting at a width of 0.1, and taken out by switching it off.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor, useText } from '#editor/context.ts'
import { edited, Refusal, turn, type FileEdit } from '#editor/editor.ts'
import type { At } from '#editor/files.ts'
import { Check, ColorField, NumberField, RampField, Select, Slider, TextField, VecField } from '#editor/ui/fields.tsx'
import { NodeList } from '#editor/ui/list.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { Surface } from '#editor/ui/sheet.tsx'
import {
  analysisEdits, bandEdits, BUDGET, copyOf, detailEdits, fieldIn, greys, layerEdits, NEW_LAYER, nodeEdits, OPS, PREVIEW, RANGES, readings,
  reprogrammed, sampler, sampleRow, span, specsOf, squareOf, STARTS, surfaceEdits, writeField, type Brush, type Renode, type Settings, type Square,
} from './terrain3d.extension.tsx'
import { keys, kinds, shows, type Band, type Detail, type Edge, type Field, type Node, type Noise, type Rule } from './terrain3d.sim.ts'

// How tall the preview is drawn, in CSS pixels: two to a sample.
const PREVIEW_HEIGHT = 256

// ---------------------------------------------------------------- the panel

export function Terrain({ brush }: { brush: Brush }) {
  const ed = useEditor(['game', 'selection'])
  const s = ed.session
  // The field of the scene the panel works on (`focus`).
  const focus = ed.focus('terrain3d')
  const scene = focus?.scene
  const field = focus?.world.field as string | undefined
  const got = scene !== undefined && field !== undefined ? fieldIn(ed, scene) : undefined
  const path = got && 'path' in got ? got.path : undefined
  const text = useText(path)

  if (!s) return <Empty>Open a game, and the ground of the scene selected is edited here.</Empty>
  if (!scene || !got) return <Empty>No scene of {s.game.name} has a `world.terrain3d`.</Empty>
  if (path === undefined) return <Empty>{'why' in got && got.why}.</Empty>
  if (text === undefined) return <Empty>Reading {path}…</Empty>
  // The scene's texture entries, which a texture layer may name.
  const assets = (focus.truth.world.loader as { assets?: Record<string, { type: string }> } | undefined)?.assets ?? {}
  const textures = Object.entries(assets).filter(([, e]) => e.type === 'texture').map(([n]) => n)
  return <FieldEditor key={path} path={path} text={text} brush={brush} scene={scene} textures={textures} />
}

function FieldEditor({ path, text, brush, scene, textures }: { path: string; text: string; brush: Brush; scene: string; textures: string[] }) {
  const ed = useEditor([])
  const field = useMemo(() => JSON.parse(text) as Field, [text])
  const settings = useSyncExternalStore(brush.subscribe, () => brush.get(path))
  // A number being dragged, shown in the preview until it is let go.
  const [pending, setPending] = useState<FileEdit | undefined>(undefined)
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const shown = useMemo(() => (pending ? edited(field, [pending]) : field), [field, pending])

  // Says why an edit was refused, here and in the console.
  const refuse = (why: string) => {
    setRefused(why)
    ed.error(`${path}: refused: ${why}`)
  }
  // Writes the edits a section's function makes of the field to the file as one change
  // (`writeField`), or refuses them, saying why; whether the file took them. A write that failed the
  // editor has said why of.
  const write = async (edits: () => FileEdit[]) => {
    setPending(undefined)
    let got: FileEdit[]
    try {
      got = edits()
    } catch (e) {
      refuse(e instanceof Refusal ? e.why : (e as Error).message)
      return false
    }
    if (!got.length) return false
    setRefused(undefined)
    try {
      await writeField(ed, path, field, got)
      return true
    } catch (e) {
      if (e instanceof Refusal) refuse(e.why)
      return false
    }
  }
  // A number at `at`: shown while it is dragged, written as `then` writes it when it is let go.
  const number = (at: At, then: (value: number) => Promise<boolean>) => (value: number, done: boolean) => (done ? then(value) : setPending({ at, value }))

  return (
    <PanelBody bar={
      <Toolbar label="terrain">
        <Badge tone="dim">{path}</Badge>
        <span className="ui-spacer" />
        <Button title="brush (T)" onClick={brush.use}>Brush</Button>
      </Toolbar>
    }>
      {refused && <Note>Refused: {refused}</Note>}
      <BrushSection brush={brush} field={field} path={path} />
      <LayersSection field={field} path={path} brush={brush} armed={settings.armed} write={write} />
      <ProgramSection field={field} path={path} shown={shown} write={write} number={number} scene={scene} />
      <BandsSection field={field} write={write} number={number} />
      <SurfacesSection field={field} path={path} write={write} number={number} />
      <Section title="Analysis" open={false}>
        {Object.entries(field.analysis).map(([k, v]) => (
          <LabelledRow key={k} label={k}>
            <NumberField label={`analysis ${k}`} value={v} integer={k === 'records' || k === 'occlusionSteps'} onChange={(n, done) => done && write(() => analysisEdits({ [k]: n }))} />
          </LabelledRow>
        ))}
      </Section>
      <DetailSection field={field} write={write} textures={textures} />
    </PanelBody>
  )
}

type Write = (edits: () => FileEdit[]) => Promise<boolean>
type Num = (at: At, then: (value: number) => Promise<boolean>) => (value: number, done: boolean) => void

// ---------------------------------------------------------------- the brush

function BrushSection({ brush, field, path }: { brush: Brush; field: Field; path: string }) {
  const s = useSyncExternalStore(brush.subscribe, () => brush.get(path))
  const surfaces = Object.keys(field.surfaces ?? {})
  const armed = s.armed
  const set = (patch: Partial<Settings>) => brush.set(path, patch)
  const bare = s.verb === 'surface' && !surfaces.includes(s.surface)
  return (
    <Section title="Brush" extra={<Badge tone={armed === undefined ? 'dim' : 'accent'}>{armed === undefined ? 'no layer armed' : `layer ${armed}`}</Badge>}>
      <Toolbar label="brush verbs">
        {brush.verbs.map(v => <Button key={v} title={`brush ${v}`} pressed={s.verb === v} onClick={() => set({ verb: v })}>{v}</Button>)}
      </Toolbar>
      <LabelledRow label="radius"><Slider label="brush radius" min={RANGES.radius[0]} max={RANGES.radius[1]} step={0.5} value={s.radius} onChange={v => set({ radius: v })} /></LabelledRow>
      <LabelledRow label="hardness"><Slider label="brush hardness" min={RANGES.hardness[0]} max={RANGES.hardness[1]} step={0.01} value={s.hardness} onChange={v => set({ hardness: v })} /></LabelledRow>
      <LabelledRow label="strength"><Slider label="brush strength" min={RANGES.strength[0]} max={RANGES.strength[1]} step={0.1} value={s.strength} onChange={v => set({ strength: v })} /></LabelledRow>
      <LabelledRow label="level"><NumberField label="brush level" value={s.level} onChange={v => set({ level: v })} /></LabelledRow>
      <LabelledRow label="surface">
        {surfaces.length
          ? <Select<string> label="brush surface" value={surfaces.includes(s.surface) ? s.surface : ''} options={[{ value: '', label: 'none' }, ...surfaces.map(n => ({ value: n }))]} onChange={v => set({ surface: v })} />
          : <Note>The field has no surfaces.</Note>}
      </LabelledRow>
      <Note>
        {armed === undefined
          ? 'Arm a layer below; the brush paints only inside it.'
          : bare ? 'The brush paints no surface of the field: pick one.'
          : s.verb === 'pick' ? `A click reads the ground as layer ${armed} leaves it into level.` : `The brush paints layer ${armed}; paint outside it is dropped.`}
      </Note>
    </Section>
  )
}

// ---------------------------------------------------------------- layers

function LayersSection({ field, path, brush, armed, write }: {
  field: Field; path: string; brush: Brush; armed: number | undefined; write: Write
}) {
  const layers = field.layers ?? []
  // A layer added, set or taken out, as `layerEdits` makes it.
  const change = (k: number | undefined, layer: Square | null) => write(() => layerEdits(path, field, k, layer))
  const pointed = useSyncExternalStore(brush.subscribe, () => brush.at !== undefined)
  const [at, setAt] = useState<number[]>(NEW_LAYER.at)
  const [size, setSize] = useState(NEW_LAYER.size)
  const [px, setPx] = useState(NEW_LAYER.px)
  return (
    <Section title="Layers" extra={<Badge>{layers.length}</Badge>}>
      {layers.map((l, k) => (
        <div key={k}>
          <Row>
            <Button title={`arm layer ${k}`} pressed={armed === k} onClick={() => brush.set(path, { armed: armed === k ? undefined : k })}>layer {k}</Button>
            <Badge tone="dim">{l.strokes.length} strokes</Badge>
            <span className="ui-spacer" />
            <Button title={`remove layer ${k}`} onClick={() => void change(k, null)}>✕</Button>
          </Row>
          <LabelledRow label="at"><VecField label={`layer ${k} at`} names={['x', 'z']} value={l.at} onChange={(v, done) => done && change(k, { at: v })} /></LabelledRow>
          <LabelledRow label="size"><NumberField label={`layer ${k} size`} value={l.size} onChange={(v, done) => done && change(k, { size: v })} /></LabelledRow>
          <LabelledRow label="px"><NumberField label={`layer ${k} px`} integer value={l.px} onChange={(v, done) => done && change(k, { px: v })} /></LabelledRow>
        </div>
      ))}
      <LabelledRow label="new at" extra={<Button title="where the brush last pointed" disabled={!pointed} onClick={() => brush.at && setAt(brush.at)}>here</Button>}>
        <VecField label="new layer at" names={['x', 'z']} value={at} onChange={(v, done) => done && setAt(v)} />
      </LabelledRow>
      <LabelledRow label="new size"><NumberField label="new layer size" value={size} onChange={(v, done) => done && setSize(v)} /></LabelledRow>
      <LabelledRow label="new px"><NumberField label="new layer px" integer value={px} onChange={(v, done) => done && setPx(v)} /></LabelledRow>
      <Button
        title="add a layer"
        onClick={() => void change(undefined, { at, size, px }).then(ok => ok && brush.set(path, { armed: layers.length }))}
      >Add layer</Button>
    </Section>
  )
}

// ---------------------------------------------------------------- the program

function ProgramSection({ field, path, shown, write, number, scene }: {
  field: Field; path: string; shown: Field; write: Write; number: Num; scene: string
}) {
  const p = field.program
  // The program's values set, as `reprogrammed` makes them, and one number of them as it is let go.
  const program = (patch: Partial<Field['program']>) => write(() => reprogrammed(p, patch))
  const value = (k: 'world' | 'hscale' | 'sea') => number(['program', k], v => program({ [k]: v }))
  // A node changed as `nodeEdits` makes it.
  const renode = (id: string, how: Renode) => write(() => nodeEdits(path, p, id, how))
  const ids = p.nodes.map(n => n.id)
  const [copied, setCopied] = useState<string | undefined>(undefined)
  const paste = async () => {
    let nodes: Node[]
    try {
      nodes = JSON.parse(await navigator.clipboard.readText())
    } catch (e) {
      return setCopied(`The clipboard holds no JSON: ${(e as Error).message}`)
    }
    if (!Array.isArray(nodes) || !nodes.every(n => n && typeof n === 'object' && typeof n.id === 'string' && typeof n.op === 'string'))
      return setCopied('The clipboard holds no list of nodes.')
    const pasted = await program({ nodes })
    setCopied(pasted ? `Pasted ${nodes.length} nodes.` : undefined)
  }
  return (
    <Section title="Program" extra={<Badge>{p.nodes.length} nodes</Badge>}>
      <Preview field={shown} scene={scene} />
      <LabelledRow label="world"><NumberField label="program world" value={p.world} onChange={value('world')} /></LabelledRow>
      <LabelledRow label="hscale"><NumberField label="program hscale" value={p.hscale} onChange={value('hscale')} /></LabelledRow>
      <LabelledRow label="sea"><Slider label="program sea" min={0} max={1} step={0.001} value={p.sea} onChange={value('sea')} /></LabelledRow>
      <LabelledRow label="flood"><Check label="program flood" value={p.flood} onChange={v => program({ flood: v })} /></LabelledRow>
      <LabelledRow label="out"><Select<string> label="program out" value={p.out} options={ids.map(id => ({ value: id }))} onChange={v => program({ out: v })} /></LabelledRow>
      <Row>
        <Button
          title="copy the nodes as JSON"
          onClick={() => void navigator.clipboard.writeText(JSON.stringify(copyOf(p), null, 2)).then(() => setCopied(`Copied ${p.nodes.length} nodes.`), e => setCopied(`Not copied: ${(e as Error).message}`))}
        >Copy</Button>
        <Button title="paste nodes from JSON" onClick={() => void paste()}>Paste</Button>
        {copied && <Badge tone="dim">{copied}</Badge>}
      </Row>
      <NodeList<Node>
        label="nodes"
        items={p.nodes}
        name={n => n.id}
        onChange={nodes => program({ nodes, out: p.out })}
        make={() => {
          let k = p.nodes.length
          while (ids.includes(`n${k}`)) k++
          return { id: `n${k}`, op: 'const', value: 0 }
        }}
        render={(n, i) => (
          <NodeForm
            node={n}
            earlier={ids.slice(0, i)}
            onRename={rename => renode(n.id, { rename })}
            onOp={op => renode(n.id, { op })}
            set={(k, v) => renode(n.id, { values: { [k]: v } })}
            number={k => number(['program', 'nodes', i, k], v => renode(n.id, { values: { [k]: v } }))}
          />
        )}
      />
    </Section>
  )
}

function NodeForm({ node, earlier, onRename, onOp, set, number }: {
  node: Node
  earlier: string[]
  onRename(id: string): void
  onOp(op: string): void
  set(key: string, value: unknown): void
  number(key: string): (value: number, done: boolean) => void
}) {
  const name = node.id
  return (
    <>
      <LabelledRow label="id"><TextField label={`${name} id`} value={name} onChange={v => v && v !== name && onRename(v)} /></LabelledRow>
      <LabelledRow label="op"><Select<string> label={`${name} op`} value={node.op} options={[...new Set([node.op, ...OPS])].map(o => ({ value: o }))} onChange={onOp} /></LabelledRow>
      {specsOf(node).map(s => {
        const label = `${name} ${s.key}`
        const v = node[s.key] ?? s.absent
        let field
        if (s.ref) {
          const options = earlier.map(o => ({ value: o, label: o }))
          if (!earlier.includes(v)) options.unshift({ value: v ?? '', label: `${v ?? 'nothing'} (not before this node)` })
          field = <Select<string> label={label} value={v ?? ''} options={options} onChange={x => set(s.key, x)} />
        }
        else if (s.choices) field = <Select<string> label={label} value={v} options={s.choices.map(c => ({ value: c }))} onChange={x => set(s.key, x)} />
        else if (s.pair) field = <VecField label={label} names={s.pair} value={v} onChange={(x, done) => done && set(s.key, x)} />
        else if (s.slide) field = <Slider label={label} min={s.min!} max={s.max!} integer={s.int} step={s.int ? 1 : (s.max! - s.min!) / 1000} value={v} onChange={number(s.key)} />
        else if (s.min !== undefined) {
          const into = number(s.key)
          field = <NumberField label={label} integer={s.int} value={v} onChange={(x, done) => into(Math.min(s.max!, Math.max(s.min!, x)), done)} />
        } else field = <NumberField label={label} value={v} onChange={number(s.key)} />
        return <LabelledRow key={s.key} label={s.key} title={s.min !== undefined ? `${s.min} to ${s.max}` : undefined}>{field}</LabelledRow>
      })}
    </>
  )
}

const brief = (v: number) => String(+v.toPrecision(4))

function Preview({ field, scene }: { field: Field; scene: string }) {
  const [what, setWhat] = useState('height')
  const [out, setOut] = useState<{ values: Float64Array; lo: number; hi: number; of: string } | { error: string } | undefined>(undefined)
  const [rows, setRows] = useState(0)
  const [at, setAt] = useState<string | undefined>(undefined)
  // The surface's size when it was drawn last, to find the sample under the pointer.
  const size = useRef<[number, number]>([0, 0])
  // The theme, whose accent the layers' squares are drawn in.
  const theme = useEditor(['theme']).theme
  const text = JSON.stringify(field)
  const world = field.program.world
  const options = readings(field).map(value => ({ value, label: value.replace(/^node:/, 'node ').replace(/^key:/, 'record ') }))
  const showing = options.some(o => o.value === what) ? what : 'height'

  useEffect(() => {
    let f: (x: number, z: number) => number
    try {
      f = sampler(JSON.parse(text), showing)
    } catch (e) {
      setOut({ error: (e as Error).message })
      return
    }
    const values = new Float64Array(PREVIEW * PREVIEW)
    let live = true
    void (async () => {
      let j = 0
      while (j < PREVIEW) {
        await turn()
        if (!live) return
        const start = performance.now()
        while (j < PREVIEW && (j === 0 || performance.now() - start < BUDGET)) sampleRow(f, world, values, j++)
        setRows(j)
      }
      setOut({ values, ...span(values), of: showing })
    })()
    return () => { live = false }
  }, [text, showing, world])

  // The square the preview is drawn in, on a surface `w` by `h`.
  const square = (w: number, h: number) => {
    const side = Math.min(w, h)
    return { x: (w - side) / 2, y: (h - side) / 2, side }
  }
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    size.current = [w, h]
    if (!out || 'error' in out) return
    const img = ctx.createImageData(PREVIEW, PREVIEW)
    img.data.set(greys(out.values, out.lo, out.hi))
    const pic = document.createElement('canvas')
    pic.width = pic.height = PREVIEW
    pic.getContext('2d')?.putImageData(img, 0, 0)
    const { x, y, side } = square(w, h)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(pic, x, y, side, side)
    ctx.strokeStyle = getComputedStyle(ctx.canvas).getPropertyValue('--accent').trim()
    ctx.lineWidth = 1
    for (const l of field.layers ?? []) {
      const [sx, sy, sw, sh] = squareOf(l, world, side)
      ctx.strokeRect(x + sx, y + sy, sw, sh)
    }
  }

  const label = options.find(o => o.value === showing)!.label
  return (
    <Section title="Preview" extra={at ? <Badge tone="dim">{at}</Badge> : undefined}>
      <LabelledRow label="of"><Select<string> label="preview of" value={showing} options={options} onChange={setWhat} /></LabelledRow>
      <Surface
        label={`preview of ${label} on ${scene}`}
        height={PREVIEW_HEIGHT}
        version={[out, field.layers, world, theme]}
        draw={draw}
        onMove={pt => {
          if (!out || 'error' in out) return
          const { x, y, side } = square(...size.current)
          const i = Math.floor(((pt.x - x) / side) * PREVIEW), j = Math.floor(((pt.y - y) / side) * PREVIEW)
          if (i < 0 || j < 0 || i >= PREVIEW || j >= PREVIEW) return setAt(undefined)
          const wx = -world / 2 + (i + 0.5) * (world / PREVIEW), wz = -world / 2 + (j + 0.5) * (world / PREVIEW)
          setAt(`${brief(wx)}, ${brief(wz)}: ${brief(out.values[j * PREVIEW + i])}`)
        }}
        onLeave={() => setAt(undefined)}
      />
      <Note>
        {!out ? `Working out ${label}: ${rows} of ${PREVIEW} rows.`
          : 'error' in out ? `No preview: ${out.error}`
          : `${label} from ${brief(out.lo)} to ${brief(out.hi)}, ${PREVIEW} × ${PREVIEW} over ${world} m${out.of !== showing || rows < PREVIEW ? ` (working out ${label}: ${rows} of ${PREVIEW} rows)` : ''}`}
      </Note>
    </Section>
  )
}

// ---------------------------------------------------------------- bands and surfaces

function BandsSection({ field, write, number }: { field: Field; write: Write; number: Num }) {
  // The bands, and the grain, set as `bandEdits` makes them; band `i` as `to` makes it of what it is.
  const bands = (list: Band[]) => write(() => bandEdits(field, { bands: list }))
  const band = (i: number, to: (b: Band) => Band) => bands(field.bands.map((b, j) => (j === i ? to(b) : b)))
  const grain = (k: 'base' | 'range') => number(['grain', k], v => write(() => bandEdits(field, { grain: { [k]: v } })))
  // A rule's one part that changed, once it is let go.
  const rule = (i: number, j: number, was: Rule) => (r: Rule, done: boolean) => {
    const k = done ? (['q', 'lo', 'hi'] as const).find(k => r[k] !== was[k]) : undefined
    if (k) band(i, b => ({ ...b, rules: b.rules.map((x, m) => (m === j ? { ...x, [k]: r[k] } : x)) }))
  }
  return (
    <Section title="Bands" extra={<Badge>{field.bands.length}</Badge>} open={false}>
      <NodeList
        label="bands"
        items={field.bands}
        name={(_, i) => (i === 0 ? 'base' : `band ${i}`)}
        onChange={bands}
        make={() => ({ colour: '#808080', amount: 1, rules: [] })}
        render={(b, i) => {
          const called = i === 0 ? 'base' : `band ${i}`
          return (
            <>
              <LabelledRow label="colour"><ColorField label={`${called} colour`} value={b.colour} onChange={(v, done) => done && band(i, b => ({ ...b, colour: v as string }))} /></LabelledRow>
              <LabelledRow label="amount"><Slider label={`${called} amount`} min={0} max={1} step={0.01} value={b.amount} onChange={number(['bands', i, 'amount'], v => band(i, b => ({ ...b, amount: v })))} /></LabelledRow>
              {b.rules.map((r, j) => (
                <LabelledRow key={j} label={`rule ${j}`} extra={<Button title={`drop ${called} rule ${j}`} onClick={() => band(i, b => ({ ...b, rules: b.rules.filter((_, m) => m !== j) }))}>✕</Button>}>
                  <RampField label={`${called} rule ${j}`} value={r} keys={[...keys]} onChange={rule(i, j, r)} />
                </LabelledRow>
              ))}
              <Button title={`add a rule to ${called}`} onClick={() => band(i, b => ({ ...b, rules: [...b.rules, { q: 'height', lo: 0, hi: 1 }] }))}>Add rule</Button>
              {i > 0 && <EdgeFields label={`${called} edge`} value={b.edge} onChange={edge => band(i, b => edged(b, edge))} />}
            </>
          )
        }}
      />
      <LabelledRow label="grain base"><NumberField label="grain base" value={field.grain.base} onChange={grain('base')} /></LabelledRow>
      <LabelledRow label="grain range"><NumberField label="grain range" value={field.grain.range} onChange={grain('range')} /></LabelledRow>
    </Section>
  )
}

// A value with its edge, or with none.
const edged = <T extends { edge?: Edge }>(v: T, edge: Edge | undefined): T => {
  const { edge: _, ...rest } = v
  return (edge ? { ...rest, edge } : rest) as T
}
// What an edge switched on starts as.
const NEW_EDGE: Edge = { width: 0.1, ragged: 0, scale: 0.5 }

// An edge, or none: switched on it is drawn crisp, its width, how ragged and the noise's scale set
// when each is let go.
function EdgeFields({ label, value, onChange }: { label: string; value: Edge | undefined; onChange(edge: Edge | undefined): void }) {
  const set = (k: keyof Edge) => (v: number, done: boolean) => done && value && onChange({ ...value, [k]: v })
  return (
    <>
      <LabelledRow label="crisp"><Check label={`${label} crisp`} value={!!value} onChange={on => onChange(on ? NEW_EDGE : undefined)} /></LabelledRow>
      {value && (
        <>
          <LabelledRow label="width"><Slider label={`${label} width`} min={0.01} max={1} step={0.01} value={value.width} onChange={set('width')} /></LabelledRow>
          <LabelledRow label="ragged"><Slider label={`${label} ragged`} min={0} max={1} step={0.01} value={value.ragged} onChange={set('ragged')} /></LabelledRow>
          <LabelledRow label="scale"><NumberField label={`${label} scale`} value={value.scale} onChange={set('scale')} /></LabelledRow>
        </>
      )}
    </>
  )
}

function SurfacesSection({ field, path, write, number }: { field: Field; path: string; write: Write; number: Num }) {
  const surfaces = field.surfaces ?? {}
  const [name, setName] = useState('')
  // A surface changed as `surfaceEdits` says: renamed, with every stroke that paints it, taken out,
  // its colour set, or added.
  const change = (n: string, how: Parameters<typeof surfaceEdits>[3]) => write(() => surfaceEdits(field, path, n, how))
  const rename = (was: string, to: string) => {
    if (to) void change(was, { rename: to })
  }
  return (
    <Section title="Surfaces" extra={<Badge>{Object.keys(surfaces).length}</Badge>} open={false}>
      {Object.entries(surfaces).map(([n, s]) => (
        <div key={n}>
          <Row>
            <TextField label={`surface ${n} name`} value={n} onChange={v => rename(n, v)} />
            <Button title={`remove surface ${n}`} onClick={() => change(n, { surface: null })}>✕</Button>
          </Row>
          <LabelledRow label="colour"><ColorField label={`surface ${n} colour`} value={s.colour} onChange={(v, done) => done && change(n, { surface: { colour: v as string } })} /></LabelledRow>
          <LabelledRow label="cover"><Slider label={`surface ${n} cover`} min={0} max={4} step={0.01} value={s.cover} onChange={number(['surfaces', n, 'cover'], v => change(n, { surface: { cover: v } }))} /></LabelledRow>
          <EdgeFields label={`surface ${n} edge`} value={s.edge} onChange={edge => void change(n, { surface: { edge: edge ?? null } })} />
        </div>
      ))}
      <LabelledRow label="new" extra={<Button title="add a surface" disabled={!name || name in surfaces} onClick={() => { void change(name, { surface: {} }); setName('') }}>Add</Button>}>
        <TextField label="new surface name" value={name} onChange={setName} />
      </LabelledRow>
    </Section>
  )
}

// ---------------------------------------------------------------- the detail

function DetailSection({ field, write, textures }: { field: Field; write: Write; textures: string[] }) {
  const detail = field.detail ?? []
  // The layers set as `detailEdits` makes them; layer `i` as `to` makes it of what it is.
  const all = (list: Detail[]) => write(() => detailEdits(field, list))
  const layer = (i: number) => (to: (d: Detail) => Detail) => all(detail.map((d, j) => (j === i ? to(d) : d)))
  return (
    <Section title="Detail" extra={<Badge>{detail.length}</Badge>} open={false}>
      <NodeList<Detail>
        label="detail"
        items={detail}
        name={(d, i) => `${i} ${d.kind}`}
        onChange={all}
        make={() => STARTS.tint}
        render={(d, i) => <LayerForm layer={d} called={`detail ${i}`} field={field} textures={textures} set={layer(i)} />}
      />
    </Section>
  )
}

// One detail layer's form: its kind, which makes it again with that kind's starting numbers and its
// own amount, fade, edge and rules; those; and its kind's numbers.
function LayerForm({ layer: d, called, field, textures, set }: {
  layer: Detail; called: string; field: Field; textures: string[]; set(to: (d: Detail) => Detail): void
}) {
  // A number of the layer's, or of an object of it, set once it is let go.
  const num = <K extends string>(k: K) => (v: number, done: boolean) => done && set(x => ({ ...x, [k]: v }) as Detail)
  const rules = d.where ?? []
  const rule = (j: number, was: Rule) => (r: Rule, done: boolean) => {
    const k = done ? (['q', 'lo', 'hi'] as const).find(k => r[k] !== was[k]) : undefined
    if (k) set(x => ({ ...x, where: rules.map((y, m) => (m === j ? { ...y, [k]: r[k] } : y)) }))
  }
  const remade = (kind: Detail['kind']) => set(x => ({ ...STARTS[kind], ...(['amount', 'fade', 'edge', 'where'] as const).reduce((o, k) => (x[k] === undefined ? o : { ...o, [k]: x[k] }), {}) }))
  const without = <K extends string>(k: K) => (x: Detail) => { const { [k as string]: _, ...rest } = x as Record<string, unknown>; return rest as Detail }
  return (
    <>
      <LabelledRow label="kind"><Select<Detail['kind']> label={`${called} kind`} value={d.kind} options={kinds.map(k => ({ value: k }))} onChange={remade} /></LabelledRow>
      <LabelledRow label="amount"><Slider label={`${called} amount`} min={0} max={1} step={0.01} value={d.amount ?? 1} onChange={num('amount')} /></LabelledRow>
      <LabelledRow label="fades"><Check label={`${called} fades`} value={!!d.fade} onChange={on => set(on ? x => ({ ...x, fade: [24, 110] }) : without('fade'))} /></LabelledRow>
      {d.fade && <LabelledRow label="fade"><VecField label={`${called} fade`} names={['near', 'far']} value={d.fade} onChange={(v, done) => done && set(x => ({ ...x, fade: v }))} /></LabelledRow>}
      <EdgeFields label={`${called} edge`} value={d.edge} onChange={edge => set(x => edged(x, edge))} />
      {rules.map((r, j) => (
        <LabelledRow key={j} label={`rule ${j}`} extra={<Button title={`drop ${called} rule ${j}`} onClick={() => set(x => ({ ...x, where: rules.filter((_, m) => m !== j) }))}>✕</Button>}>
          <RampField label={`${called} rule ${j}`} value={r} keys={[...keys, ...shows(field)]} onChange={rule(j, r)} />
        </LabelledRow>
      ))}
      <Button title={`add a rule to ${called}`} onClick={() => set(x => ({ ...x, where: [...rules, { q: 'slope', lo: 0, hi: 1 }] }))}>Add rule</Button>
      {d.kind !== 'texture' && <NoiseFields called={called} noise={d.noise} set={noise => set(x => ({ ...x, noise }) as Detail)} />}
      {d.kind === 'tint' && (
        <>
          <LabelledRow label="base"><NumberField label={`${called} base`} value={d.base} onChange={num('base')} /></LabelledRow>
          <LabelledRow label="range"><NumberField label={`${called} range`} value={d.range} onChange={num('range')} /></LabelledRow>
        </>
      )}
      {d.kind === 'patch' && (
        <>
          <LabelledRow label="from"><Slider label={`${called} from`} min={0} max={1} step={0.01} value={d.from} onChange={num('from')} /></LabelledRow>
          <LabelledRow label="to"><Slider label={`${called} to`} min={0} max={1} step={0.01} value={d.to} onChange={num('to')} /></LabelledRow>
          <LabelledRow label="colour"><ColorField label={`${called} colour`} value={d.colour} onChange={(v, done) => done && set(x => ({ ...x, colour: v as string }) as Detail)} /></LabelledRow>
        </>
      )}
      {d.kind === 'bump' && (
        <>
          <LabelledRow label="step"><NumberField label={`${called} step`} value={d.step} onChange={num('step')} /></LabelledRow>
          <LabelledRow label="strength"><NumberField label={`${called} strength`} value={d.strength} onChange={num('strength')} /></LabelledRow>
        </>
      )}
      {d.kind === 'rough' && (
        <>
          <LabelledRow label="range"><VecField label={`${called} range`} names={['lo', 'hi']} value={d.range} onChange={(v, done) => done && set(x => ({ ...x, range: v }) as Detail)} /></LabelledRow>
          <LabelledRow label="jitter"><VecField label={`${called} jitter`} names={['freq', 'amount']} value={[d.jitter.freq, d.jitter.amount]} onChange={(v, done) => done && set(x => ({ ...x, jitter: { freq: v[0], amount: v[1] } }) as Detail)} /></LabelledRow>
        </>
      )}
      {d.kind === 'texture' && <TextureFields called={called} layer={d} textures={textures} set={set} num={num} />}
    </>
  )
}

// A noise's octaves, each its freq and weight, and its offset, angle and stretch.
function NoiseFields({ called, noise: n, set }: { called: string; noise: Noise; set(noise: Noise): void }) {
  const octave = (i: number, freq: number, weight: number) => set({ ...n, freqs: n.freqs.map((f, j) => (j === i ? freq : f)), weights: n.weights.map((w, j) => (j === i ? weight : w)) })
  return (
    <>
      {n.freqs.map((f, i) => (
        <LabelledRow key={i} label={`octave ${i}`} extra={n.freqs.length > 1 && <Button title={`drop ${called} octave ${i}`} onClick={() => set({ ...n, freqs: n.freqs.filter((_, j) => j !== i), weights: n.weights.filter((_, j) => j !== i) })}>✕</Button>}>
          <VecField label={`${called} octave ${i}`} names={['freq', 'weight']} value={[f, n.weights[i]]} onChange={(v, done) => done && octave(i, v[0], v[1])} />
        </LabelledRow>
      ))}
      <Button title={`add an octave to ${called}`} onClick={() => set({ ...n, freqs: [...n.freqs, n.freqs[n.freqs.length - 1] * 2], weights: [...n.weights, n.weights[n.weights.length - 1] / 2] })}>Add octave</Button>
      <LabelledRow label="offset"><VecField label={`${called} offset`} names={['x', 'z']} value={n.offset ?? [0, 0]} onChange={(v, done) => done && set({ ...n, offset: v })} /></LabelledRow>
      <LabelledRow label="angle"><NumberField label={`${called} angle`} value={n.angle ?? 0} onChange={(v, done) => done && set({ ...n, angle: v })} /></LabelledRow>
      <LabelledRow label="stretch"><VecField label={`${called} stretch`} names={['x', 'z']} value={n.stretch ?? [1, 1]} onChange={(v, done) => done && set({ ...n, stretch: v })} /></LabelledRow>
    </>
  )
}

// A texture layer's maps, picked from the scene's texture entries, and its numbers.
function TextureFields({ called, layer: d, textures, set, num }: {
  called: string; layer: Extract<Detail, { kind: 'texture' }>; textures: string[]; set(to: (d: Detail) => Detail): void
  num(k: string): (v: number, done: boolean) => void
}) {
  const options = (v: string | undefined, none: boolean) => [
    ...(none ? [{ value: '', label: 'none' }] : []),
    ...[...new Set([...(v ? [v] : []), ...textures])].map(t => ({ value: t, label: textures.includes(t) ? t : `${t} (no texture of the scene)` })),
  ]
  // A map picked, or taken out when it is none.
  const pick = (k: 'map' | 'normal' | 'rough') => (v: string) => set(x => {
    const { [k]: _, ...rest } = x as Record<string, unknown>
    return (v ? { ...rest, [k]: v } : rest) as Detail
  })
  return (
    <>
      <LabelledRow label="map"><Select<string> label={`${called} map`} value={d.map} options={options(d.map, !d.map)} onChange={pick('map')} /></LabelledRow>
      <LabelledRow label="normal"><Select<string> label={`${called} normal`} value={d.normal ?? ''} options={options(d.normal, true)} onChange={pick('normal')} /></LabelledRow>
      <LabelledRow label="rough"><Select<string> label={`${called} rough`} value={d.rough ?? ''} options={options(d.rough, true)} onChange={pick('rough')} /></LabelledRow>
      <LabelledRow label="scale"><NumberField label={`${called} scale`} value={d.scale} onChange={num('scale')} /></LabelledRow>
      <LabelledRow label="project"><Select<'top' | 'tri'> label={`${called} project`} value={d.project} options={[{ value: 'top' }, { value: 'tri' }]} onChange={v => set(x => ({ ...x, project: v }) as Detail)} /></LabelledRow>
      <LabelledRow label="sharp"><NumberField label={`${called} sharp`} value={d.sharp} onChange={num('sharp')} /></LabelledRow>
      <LabelledRow label="vary"><Slider label={`${called} vary`} min={0} max={1} step={0.01} value={d.vary} onChange={num('vary')} /></LabelledRow>
      <LabelledRow label="colour"><ColorField label={`${called} colour`} value={d.colour} onChange={(v, done) => done && set(x => ({ ...x, colour: v as string }) as Detail)} /></LabelledRow>
      <LabelledRow label="strength"><NumberField label={`${called} strength`} value={d.strength} onChange={num('strength')} /></LabelledRow>
      <LabelledRow label="blend"><Select<'over' | 'multiply'> label={`${called} blend`} value={d.blend} options={[{ value: 'over' }, { value: 'multiply' }]} onChange={v => set(x => ({ ...x, blend: v }) as Detail)} /></LabelledRow>
    </>
  )
}
