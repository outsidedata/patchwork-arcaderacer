// The components of team vision's extension (vision.extension.tsx): the Vision panel and the field
// of a kind.
import { useSyncExternalStore } from 'react'
import { useEditor } from '#editor/context.ts'
import type { FieldProps } from '#editor/editor.ts'
import { Check, Select } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Toolbar } from '#editor/ui/layout.tsx'
import { Surface } from '#editor/ui/sheet.tsx'
import { Table } from '#editor/ui/table.tsx'
import { hexOf, themed } from '#editor/ui/theme.ts'
import { block, cellOf, teamOf, type Block } from './vision.addon.ts'
import { filed, report, seenBy, visionScene, type Picker, type Seat, type Slot } from './vision.extension.tsx'

// ---------------------------------------------------------------- the type

// A kind the owner's scene has a prefab for; one it has not is kept, and said to be missing.
export function KindName({ value, onChange, owner, label }: FieldProps<string>) {
  // The scene the extension is on is the view's or the focus's (`visionScene`), which reads the selection.
  const ed = useEditor(['game', 'selection'])
  const scene = owner.scene ?? visionScene(ed)
  const kinds = Object.keys((scene !== undefined ? ed.session?.scenes().get(scene)?.scene.prefabs : undefined) ?? {}).sort()
  const options = [...(kinds.includes(value) ? [] : [{ value, label: `${value} (no prefab)` }]), ...kinds.map(k => ({ value: k }))]
  return <Select<string> label={label} value={value} options={options} onChange={onChange} />
}

// ---------------------------------------------------------------- the panel

const slotName = (s: Seat) => `slot ${s.slot}${s.team !== s.slot ? ` (team ${String(s.team)})` : ''}`

export function VisionPanel({ picker }: { picker: Picker }) {
  const ed = useEditor(['game', 'selection'])
  useSyncExternalStore(picker.subscribe, picker.version)
  const s = ed.session
  if (!s) return <Empty>Open a game, and the vision of a scene with world.vision is shown here.</Empty>
  const scene = visionScene(ed)
  if (scene === undefined) return <Empty>No scene of {s.game.name} has world.vision.</Empty>
  const truth = s.scene(scene)
  let b: Block
  try {
    b = block(truth)
  } catch (e) {
    return (
      <PanelBody>
        <Note><Badge tone="danger">vision</Badge> {(e as Error).message}</Note>
        <Block scene={scene} />
      </PanelBody>
    )
  }
  const got = report(truth, scene)
  const { slot, over } = picker.shown
  const seat = got.seats.find(x => x.slot === slot)
  const pick = (v: Slot) => picker.set({ slot: v })
  const bar = (
    <Toolbar label="vision">
      <Select<string>
        label="slot"
        value={seat ? String(seat.slot) : ''}
        options={[...(seat ? [] : [{ value: '', label: 'pick a slot' }]), ...got.seats.map(x => ({ value: String(x.slot), label: slotName(x) }))]}
        onChange={v => { const x = got.seats.find(y => String(y.slot) === v); if (x) pick(x.slot) }}
      />
      <Check label="over the game view" value={over} onChange={v => picker.set({ over: v })} />
      <span>over the game view</span>
    </Toolbar>
  )
  return (
    <PanelBody bar={bar}>
      <Section title={seat ? `${scene}, step ${s.n}: what slot ${seat.slot}'s team sees` : `${scene}, step ${s.n}`}>
        <Note>{got.size[0]} × {got.size[1]} cells of {b.cell}; {got.everyone} rows sent to every seat (no place, or {b.always.join(', ') || 'no kind'}).</Note>
        {over && s.viewing !== scene && <Note>The game view shows {s.viewing ?? 'no scene'}: the vision is drawn over it once it shows {scene}.</Note>}
        {seat ? <VisionMap scene={scene} b={b} seat={seat} /> : <Empty>Pick a slot to see what its team sees.</Empty>}
      </Section>
      <Table<Seat>
        label="seats"
        rows={got.seats}
        keyOf={x => String(x.slot)}
        selected={seat ? String(seat.slot) : undefined}
        onSelect={k => { const x = got.seats.find(y => String(y.slot) === k); if (x) pick(x.slot) }}
        columns={[
          { key: 'slot', title: 'Slot', cell: x => String(x.slot) },
          { key: 'team', title: 'Team', cell: x => String(x.team ?? '—') },
          { key: 'player', title: 'Player', cell: x => (x.player === undefined ? <Badge tone="dim">no seat</Badge> : `#${x.player}`) },
          { key: 'cells', title: 'Cells seen', numeric: true, cell: x => got.teams.find(t => t.team === x.team)?.cells.length ?? 0 },
          { key: 'sent', title: 'Sent', numeric: true, cell: x => x.sent.length },
          { key: 'hidden', title: 'Not sent', numeric: true, cell: x => x.hidden.length },
        ]}
      />
      {seat && (
        <Section title={`Not sent to slot ${seat.slot}: ${seat.hidden.length}`} open={false}>
          {seat.hidden.length === 0 ? <Note>Its team sees every row with a place.</Note> : (
            <Row>
              {seat.hidden.map(id => {
                const r = truth.rows.find(x => x.id === id)!
                return <Button key={id} title={`select #${id}`} onClick={() => ed.select({ scene, id })}>#{id} {r.kind}</Button>
              })}
            </Row>
          )}
        </Section>
      )}
      <Block scene={scene} />
    </PanelBody>
  )
}

// The scene's cells, each the picked slot's team sees clear and every other dark, and every row with
// a place: its own team's in the accent colour, others sent in the warning colour, and those not sent
// in the danger colour, ringed.
function VisionMap({ scene, b, seat }: { scene: string; b: Block; seat: Seat }) {
  // The theme too: the map is drawn in its colours.
  const ed = useEditor(['game', 'theme'])
  const truth = ed.session!.scene(scene)
  const seen = seenBy(truth, seat.slot)
  const hidden = new Set(seat.hidden)
  const draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const [w, h] = b.size
    const k = Math.min(width / w, height / h)
    ctx.translate((width - w * k) / 2, (height - h * k) / 2)
    ctx.fillStyle = hexOf(themed('--canvas', 0xffffff))
    ctx.fillRect(0, 0, w * k, h * k)
    ctx.fillStyle = hexOf(themed('--fg', 0xffffff))
    ctx.globalAlpha = 0.25
    for (let c = 0; c < w * h; c++) if (seen?.[c]) ctx.fillRect((c % w) * k, Math.floor(c / w) * k, k, k)
    ctx.globalAlpha = 1
    const own = themed('--accent', 0xffffff), other = themed('--warn', 0xffffff), danger = themed('--danger', 0xffffff)
    for (const r of truth.rows) {
      const c = cellOf(b, r)
      if (c < 0 || b.always.includes(r.kind)) continue
      const x = ((c % w) + 0.5) * k, y = (Math.floor(c / w) + 0.5) * k
      const mine = teamOf(b, r.data[b.slot]) === seat.team && seat.team !== undefined
      ctx.beginPath()
      ctx.arc(x, y, Math.max(1.5, k / 3), 0, 2 * Math.PI)
      if (hidden.has(r.id)) {
        ctx.strokeStyle = hexOf(danger)
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        ctx.fillStyle = hexOf(mine ? own : other)
        ctx.fill()
      }
    }
  }
  return <Surface label="vision map" height={220} version={`${ed.session!.n}:${seat.slot}:${JSON.stringify(seat.hidden)}:${seen?.join('')}:${ed.theme}`} draw={draw} />
}

// `world.vision` as the scene's file holds it, a value at a time.
function Block({ scene }: { scene: string }) {
  const ed = useEditor(['game'])
  const s = ed.session!
  const file = ed.worldFile(scene, 'vision')
  const value = filed(ed, scene)
  if (!value) return <Note>{file} gives {scene} no world.vision.</Note>
  const kinds = Object.keys(s.scene(scene).scene.prefabs).sort()
  const sight = (value.sight ?? {}) as Record<string, unknown>
  const always = (Array.isArray(value.always) ? value.always : []) as string[]
  const run = (id: string, args: unknown) => void ed.call(id, { scene, ...(args as object) }).catch(e => ed.error((e as Error).message))
  const unsighted = kinds.filter(k => !(k in sight)), unalways = kinds.filter(k => !always.includes(k))
  const slots = report(s.scene(scene), scene).seats.map(x => x.slot)
  const remove = (at: (string | number)[]) => {
    const [, , key, item] = at.map(String)
    if (at.length === 4 && key === 'sight') return <Button title={`take ${item} out of sight`} onClick={() => run('vision.sight', { kind: item, cells: null })}>✕</Button>
    if (at.length === 4 && key === 'always') return <Button title={`take ${always[Number(item)]} out of always`} onClick={() => run('vision.always', { kind: always[Number(item)], on: false })}>✕</Button>
    if (at.length === 3 && key === 'teams') return <Button title="take teams away" onClick={() => run('vision.teams', { teams: null })}>✕</Button>
    return null
  }
  return (
    <Section title={`world.vision · ${file}`}>
      <PropertyGrid
        value={value}
        owner={{ file, scene }}
        at={['world', 'vision']}
        top={2}
        extra={remove}
        onChange={(at, v, done) => (done ? void ed.editFile(file, at, v).catch(() => {}) : s.previewWorld(scene, at.slice(1), v))}
      />
      <LabelledRow label="sees">
        {unsighted.length
          ? <Select<string> label="add a kind to sight" value="" options={[{ value: '', label: 'add a kind…' }, ...unsighted.map(k => ({ value: k }))]} onChange={k => k && run('vision.sight', { kind: k, cells: 1 })} />
          : <Badge tone="dim">every kind sees</Badge>}
      </LabelledRow>
      <LabelledRow label="always sent">
        {unalways.length
          ? <Select<string> label="add a kind to always" value="" options={[{ value: '', label: 'add a kind…' }, ...unalways.map(k => ({ value: k }))]} onChange={k => k && run('vision.always', { kind: k, on: true })} />
          : <Badge tone="dim">every kind is</Badge>}
      </LabelledRow>
      {value.teams === undefined && (
        <LabelledRow label="teams" title="none given: each slot is a team of its own">
          <Button title="give each slot a team" onClick={() => run('vision.teams', { teams: slots.every(x => typeof x === 'number') ? Array.from({ length: Math.max(-1, ...(slots as number[])) + 1 }, (_, i) => i) : slots })}>give each slot a team</Button>
        </LabelledRow>
      )}
    </Section>
  )
}
