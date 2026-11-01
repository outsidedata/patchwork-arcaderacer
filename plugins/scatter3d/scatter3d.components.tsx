// The components of scatter3d's extension (scatter3d.extension.tsx): the Scatter panel.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor } from '#editor/context.ts'
import { edited, turn, written, type Editor } from '#editor/editor.ts'
import type { Plugins } from '#engine/browser.ts'
import type { At } from '#editor/files.ts'
import { Check, ColorField, NumberField, RampField, Select, Slider, TextField, VecField } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { Surface } from '#editor/ui/sheet.tsx'
import { BUDGET, cameraCell, checked, fileEdits, FIRST, GREY, groundIn, KIND, placeRow, refusal, ruleKeys, sourced, type Edit, type Land } from './scatter3d.extension.tsx'
import type { Pack, Scatter as Numbers } from './scatter3d.sim.ts'

// How tall the preview is drawn.
const PREVIEW_HEIGHT = 256

// Calls `f` after each frame of the editor's clock, until the call it hands back is made.
type Frames = (f: () => void) => () => void

// The scatter the panel works on (`focus`), the game view's client while the view shows that scene,
// and the catalogue's models.
function scatterOf(ed: Editor) {
  const f = ed.focus(KIND)
  if (!f) return undefined
  const { scene, truth, worldFile: path, plugins: client } = f
  const numbers = f.world as Numbers
  const assets = (truth.world.loader?.assets ?? {}) as Record<string, { type: string }>
  return {
    scene, path, numbers, client,
    models: Object.entries(assets).filter(([, a]) => a.type === 'model').map(([n]) => n),
  }
}

export function Scatter() {
  const ed = useEditor(['game', 'selection'])
  const s = ed.session
  // What the game view's client holds that no change of the editor's tells, its land landing and its
  // camera crossing into another cell, is looked at after each frame of the editor's clock.
  const frames: Frames = useCallback(f => s?.onFrame(f) ?? (() => {}), [s])
  const sc = scatterOf(ed)
  // The land the client stands the scatter on, once the land the scene's `world.scatter3d.mods.land`
  // names has landed.
  const ground = useSyncExternalStore(frames, () => groundIn(sc?.client))
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const [refused, setRefused] = useState<string | undefined>(undefined)
  // A number being dragged, shown in the preview until it is let go.
  const [pending, setPending] = useState<Edit | undefined>(undefined)
  const [name, setName] = useState('')
  if (!s) return <Empty>Open a game, and the scatter of the scene selected is set here.</Empty>
  if (!sc) return <Empty>No scene of {s.game.name} has a scatter3d.</Empty>
  const { scene, path, numbers, models } = sc
  const names = Object.keys(numbers.packs)
  const pack = chosen !== undefined && names.includes(chosen) ? chosen : names[0]

  const refuse = (why: string) => {
    setRefused(why)
    ed.error(`scatter3d: refused: ${why}`)
  }
  // Edits to the numbers as one change, or refused as `refusal` says, the `unmeshed` sentence asked
  // of the game view's client's loader, so that is checked while the view shows the scene.
  const write = async (edits: Edit[]) => {
    setPending(undefined)
    const why = await refusal(ed, scene, edits, sc.client)
    if (why) return refuse(why)
    setRefused(undefined)
    written(ed, fileEdits(path, edits)).catch(() => {})
  }
  const set = (at: At, value: unknown) => void write([{ at, value }])
  const number = (at: At) => (value: number, done: boolean) => (done ? set(at, value) : setPending({ at, value }))
  // The numbers as the preview shows it: with the number being dragged, unless the check throws at it.
  const dragged = pending && edited(numbers, [pending])
  const shown = dragged && !checked(dragged, ground) ? dragged : numbers

  return (
    <PanelBody bar={<Toolbar label="scatter"><Badge tone="dim">{scene}</Badge><span className="ui-spacer" /><Badge>{names.length} packs</Badge></Toolbar>}>
      {refused && <Note>Refused: {refused}</Note>}
      <Section title="Packs">
        <LabelledRow label="pack" extra={pack && <Button title={`remove pack ${pack}`} onClick={() => set(['packs', pack], undefined)}>✕</Button>}>
          {names.length ? <Select<string> label="pack" value={pack} options={names.map(n => ({ value: n }))} onChange={setChosen} /> : <Note>No packs.</Note>}
        </LabelledRow>
        <LabelledRow label="new" extra={
          <Button
            title="add a pack"
            disabled={!name || Object.hasOwn(numbers.packs, name)}
            onClick={() => {
              set(['packs', name], pack ? numbers.packs[pack] : FIRST)
              setChosen(name)
              setName('')
            }}
          >Add</Button>
        }>
          <TextField label="new pack name" value={name} onChange={setName} />
        </LabelledRow>
        {Object.hasOwn(numbers.packs, name) && <Note>Not added: {scene}'s scatter has a pack {name} already.</Note>}
        {pack && <Note>A pack added is a copy of {pack}.</Note>}
      </Section>
      {pack && <PackForm key={pack} name={pack} pack={numbers.packs[pack]} models={models} keys={ruleKeys(numbers, ground)} set={set} write={write} number={number} />}
      {pack && (
        <Section title="Preview">
          {ground
            ? <Preview pack={shown.packs[pack]} name={pack} ground={ground} client={sc.client} frames={frames} />
            : !sc.client
              ? <Note>The game view shows another scene: the preview stands the cells on the ground of {scene} once it shows that.</Note>
              : numbers.mods?.land === undefined
                ? <Note>{scene}'s scatter names no land in its world.scatter3d.mods: the preview has no ground to stand the cells on.</Note>
                : <Note>The land of {scene} has not landed in the game view yet: the preview stands the cells on it once it has.</Note>}
        </Section>
      )}
    </PanelBody>
  )
}

function PackForm({ name, pack, models, keys, set, write, number }: {
  name: string
  pack: Pack
  models: string[]
  keys: string[]
  set(at: At, value: unknown): void
  write(edits: Edit[]): void
  number(at: At): (value: number, done: boolean) => void
}) {
  const at = (...k: (string | number)[]) => ['packs', name, ...k]
  const [row, setRow] = useState('')
  const source = (v: string) => write(sourced(name, pack, v))
  const list = (k: 'lods') => (text: string, done: boolean) => {
    if (!done) return
    const v = text.split(/[\s,]+/).filter(Boolean).map(Number)
    set(at(k), v)
  }
  return (
    <>
      <Section title={`Pack ${name}`}>
        <LabelledRow label="drawn from">
          <Select<string> label={`${name} asset`} value={pack.asset ?? ''} options={[...models.map(m => ({ value: m })), { value: '', label: 'a shape' }]} onChange={source} />
        </LabelledRow>
        {pack.shape && (
          <>
            <LabelledRow label="detail"><Slider label={`${name} detail`} min={0} max={4} integer value={pack.shape.detail} onChange={(v, done) => done && set(at('shape', 'detail'), v)} /></LabelledRow>
            <LabelledRow label="lumpy"><VecField label={`${name} lumpy`} names={['base', 'range']} value={pack.shape.lumpy} onChange={(v, done) => done && set(at('shape', 'lumpy'), v)} /></LabelledRow>
            <LabelledRow label="squash"><Slider label={`${name} squash`} min={0.1} max={2} step={0.01} value={pack.shape.squash} onChange={(v, done) => done && set(at('shape', 'squash'), v)} /></LabelledRow>
            <LabelledRow label="colour"><ColorField label={`${name} colour`} value={pack.colour ?? GREY} onChange={(v, done) => done && set(at('colour'), v)} /></LabelledRow>
            {pack.surface && (
              <Section title="surface" open={false}>
                <PropertyGrid value={pack.surface} at={at('surface')} owner={{ kind: KIND, data: pack }} onChange={(a, v, done) => { if (done) set(a, v) }} />
              </Section>
            )}
          </>
        )}
        <LabelledRow label="cell"><NumberField label={`${name} cell`} value={pack.cell} onChange={number(at('cell'))} /></LabelledRow>
        <LabelledRow label="reach"><NumberField label={`${name} reach`} value={pack.reach} onChange={number(at('reach'))} /></LabelledRow>
        <LabelledRow label="seed"><NumberField label={`${name} seed`} integer value={pack.seed} onChange={number(at('seed'))} /></LabelledRow>
        <LabelledRow label="lods"><TextField label={`${name} lods`} value={pack.lods.join(', ')} onChange={list('lods')} /></LabelledRow>
        <LabelledRow label="shadow"><NumberField label={`${name} shadow`} value={pack.shadow} onChange={(v, done) => done && set(at('shadow'), v)} /></LabelledRow>
        <LabelledRow label="leaf"><Slider label={`${name} leaf`} min={0} max={1} step={0.01} value={pack.leaf} onChange={(v, done) => done && set(at('leaf'), v)} /></LabelledRow>
        <LabelledRow label="density"><Slider label={`${name} density`} min={0} max={1} step={0.01} value={pack.density} onChange={number(at('density'))} /></LabelledRow>
        <LabelledRow label="clearing"><NumberField label={`${name} clearing`} value={pack.clearing} onChange={(v, done) => number(at('clearing'))(Math.max(0, v), done)} /></LabelledRow>
        <LabelledRow label="size"><VecField label={`${name} size`} names={['base', 'spread']} value={pack.size} onChange={(v, done) => done && set(at('size'), v)} /></LabelledRow>
        <LabelledRow label="vary"><Slider label={`${name} vary`} min={0} max={1} step={0.01} value={pack.vary} onChange={number(at('vary'))} /></LabelledRow>
      </Section>
      <Section title="Rows" extra={<Badge>{Object.keys(pack.rows).length}</Badge>}>
        {Object.entries(pack.rows).map(([r, v]) => (
          <div key={r}>
            <Row>
              <Badge>{r}</Badge>
              <span className="ui-spacer" />
              <Button title={`remove row ${r}`} onClick={() => set(at('rows', r), undefined)}>✕</Button>
            </Row>
            <LabelledRow label="weight"><NumberField label={`${r} weight`} value={v.weight} onChange={(w, done) => done && set(at('rows', r, 'weight'), Math.max(0, w))} /></LabelledRow>
            <LabelledRow label="solid" extra={<Check label={`${r} is solid`} value={v.solid !== undefined} onChange={on => set(at('rows', r, 'solid'), on ? 0.5 : undefined)} />}>
              {v.solid !== undefined ? <NumberField label={`${r} solid`} value={v.solid} onChange={(w, done) => done && set(at('rows', r, 'solid'), Math.max(0, w))} /> : <Note>walked through</Note>}
            </LabelledRow>
          </div>
        ))}
        <LabelledRow label="new" extra={<Button title="add a row" disabled={!row || Object.hasOwn(pack.rows, row)} onClick={() => { set(at('rows', row), { weight: 1 }); setRow('') }}>Add</Button>}>
          <TextField label="new row name" value={row} onChange={setRow} />
        </LabelledRow>
        {Object.hasOwn(pack.rows, row) && <Note>Not added: {name} has a row {row} already.</Note>}
        <Note>{pack.asset ? `A row is a mesh row of ${pack.asset}: its meshes are named <row>-<lod>.` : 'A row is a variant of the shape.'}</Note>
      </Section>
      <Section title="Rules" extra={<Badge>{pack.rules.length}</Badge>}>
        {pack.rules.map((r, j) => (
          <LabelledRow key={j} label={`rule ${j}`} extra={<Button title={`drop ${name} rule ${j}`} onClick={() => set(at('rules', j), undefined)}>✕</Button>}>
            <RampField label={`${name} rule ${j}`} value={r} keys={[...new Set([r.q, ...keys])]} onChange={(v, done) => {
              const k = (['q', 'lo', 'hi'] as const).find(k => v[k] !== r[k])
              if (k === 'q') set(at('rules', j, k), v[k])
              // A number dragged back to where it was shows the pack as it is.
              else if (k || !done) number(at('rules', j, k ?? 'lo'))(v[k ?? 'lo'], done)
            }} />
          </LabelledRow>
        ))}
        <Button title={`add a rule to ${name}`} onClick={() => write([{ at: at('rules', -1), value: { q: keys[0], lo: 0, hi: 1 }, insert: true }])}>Add rule</Button>
      </Section>
    </>
  )
}

// The pack's cells out to its reach around the camera's cell, each kept one a dot, −z up.
function Preview({ pack, name, ground, client, frames }: { pack: Pack; name: string; ground: Land; client: Plugins | undefined; frames: Frames }) {
  // The camera's cell, looked at after each frame, so a camera that has crossed into another is seen.
  const ci = useSyncExternalStore(frames, () => cameraCell(client, pack)[0])
  const cj = useSyncExternalStore(frames, () => cameraCell(client, pack)[1])
  const R = Math.ceil(pack.reach / pack.cell)
  const text = JSON.stringify(pack)
  const [out, setOut] = useState<{ kept: Uint8Array; count: number; done: number; of: string } | { error: string } | undefined>(undefined)
  const size = useRef<[number, number]>([0, 0])
  // The theme, whose colours the cells are drawn in.
  const theme = useEditor(['theme']).theme
  useEffect(() => {
    const p = JSON.parse(text) as Pack
    const side = 2 * R + 1
    const kept = new Uint8Array(side * side)
    let live = true
    void (async () => {
      let row = 0, count = 0
      while (row < side) {
        await turn()
        if (!live) return
        const start = performance.now()
        try {
          while (row < side && (row === 0 || performance.now() - start < BUDGET)) count += placeRow(p, [ci, cj], R, row++, ground, kept)
        } catch (e) {
          setOut({ error: (e as Error).message })
          return
        }
        setOut({ kept, count, done: row, of: `${text} ${ci} ${cj}` })
      }
    })()
    return () => { live = false }
  }, [text, ci, cj, R, ground])

  const side = 2 * R + 1
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    size.current = [w, h]
    if (!out || 'error' in out) return
    const s = Math.min(w, h), x0 = (w - s) / 2, y0 = (h - s) / 2, k = s / side
    const css = (v: string) => getComputedStyle(ctx.canvas).getPropertyValue(v).trim()
    ctx.fillStyle = css('--canvas') || 'black'
    ctx.fillRect(x0, y0, s, s)
    ctx.fillStyle = css('--accent') || 'white'
    const dot = Math.max(1, k * 0.6)
    out.kept.forEach((on, p) => { if (on) ctx.fillRect(x0 + (p % side) * k + (k - dot) / 2, y0 + Math.floor(p / side) * k + (k - dot) / 2, dot, dot) })
    ctx.strokeStyle = css('--fg') || 'white'
    ctx.strokeRect(x0 + R * k, y0 + R * k, k, k)
  }
  const cells = side * side
  return (
    <>
      <Surface label={`kept cells of ${name}`} height={PREVIEW_HEIGHT} version={[out, theme]} draw={draw} />
      <Note>
        {!out ? `Placing ${name}'s cells…`
          : 'error' in out ? `No preview: ${out.error}`
          : out.done < side ? `Placing ${name}'s cells: ${out.done} of ${side} rows, ${out.count} kept so far.`
          : `${out.count} kept of ${cells} cells within ${pack.reach} m of the camera, ${pack.cell} m apart.`}
      </Note>
    </>
  )
}
