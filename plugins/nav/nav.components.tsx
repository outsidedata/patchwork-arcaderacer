// The components of nav's extension (nav.extension.tsx): the fields of nav's types and the Route
// section.
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react'
import { useEditor } from '#editor/context.ts'
import type { Editor, FieldProps, Owner, Selection } from '#editor/editor.ts'
import { Check, VecField } from '#editor/ui/fields.tsx'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { Badge, Button, Empty, LabelledRow, Note, Row } from '#editor/ui/layout.tsx'
import { colours, drawn, fieldsOf, gap, lines, measure, nowhere, setWay, standsAt, wayOf, type Drawing, type Line, type Role } from './nav.extension.tsx'

const fmt = (v: number) => String(+v.toFixed(1))
const point = (p: number[]) => p.map(fmt).join(', ')

// Draws the lines `draw` hands back on the stage of the game view while `draw` is given: after each
// render, and after every step, seek and edit of the recorder, each time taking the lines drawn
// before away, unless they are the same. The component is drawn again for a change of the game, of
// the stage, and of the theme, whose colours the lines are. What it drew goes when `draw` is taken
// away, when the stage or the recording changes, and when the component goes.
function useMarks(draw: (() => Line[]) | undefined) {
  const ed = useEditor(['game', 'tools', 'theme'])
  const read = useRef(draw)
  useLayoutEffect(() => { read.current = draw })
  const paint = useRef<(() => void) | undefined>(undefined)
  const stage = ed.staged, rec = ed.session?.rec, on = draw !== undefined
  useEffect(() => {
    if (!on || !stage) return
    const drawn: (() => void)[] = []
    let was = ''
    const clear = () => { for (const f of drawn.splice(0)) f() }
    paint.current = () => {
      const now = read.current?.() ?? []
      const key = JSON.stringify(now)
      if (key === was) return
      was = key
      clear()
      for (const l of now) drawn.push(stage.mark(l.points, l.color))
    }
    paint.current()
    const off = rec?.on(() => paint.current?.())
    return () => {
      off?.()
      paint.current = undefined
      clear()
    }
  }, [on, stage, rec])
  useEffect(() => { paint.current?.() })
}

// Whether the game view draws `scene` on a stage.
const drawing = (ed: Editor, scene: string | undefined) => !!ed.staged && (scene === undefined || ed.session?.viewing === scene)

// ---------------------------------------------------------------- the types

export function Place({ value, onChange, label }: FieldProps<number[]>) {
  return <VecField label={label} value={value} onChange={onChange} />
}

export function RouteField({ value, onChange, owner, label }: FieldProps<number[][]>) {
  const ed = useEditor(['game', 'tools', 'extensions'])
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const m = measure({ route: value })
  const name = label ?? 'route'
  useMarks(hovered || focused ? () => {
    if (!drawing(ed, owner.scene)) return []
    const row = owner.scene !== undefined && owner.row !== undefined ? ed.session?.row(owner.scene, owner.row) : undefined
    return row ? lines(wayOf(ed, row), colours()) : lines({ route: value }, colours())
  } : undefined)
  const box = useRef<HTMLDivElement>(null)
  const blur = (e: FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false) }
  // A field that had the focus loses it without a blur when the element holding it goes, as a
  // number's text box does once it is entered.
  useEffect(() => { if (focused && !box.current?.contains(document.activeElement)) setFocused(false) })
  return (
    <div ref={box} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={blur}>
      <Row>
        <Button title={`${open ? 'fold' : 'open'} ${name}`} pressed={open} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</Button>
        {value.length
          ? <span>{value.length} {value.length === 1 ? 'point' : 'points'} · {fmt(m.length)} long · ends at {point(value[value.length - 1])}</span>
          : <Badge tone="dim">no points</Badge>}
        {m.jumps.length > 0 && <Badge tone="danger">{m.jumps.length} {m.jumps.length === 1 ? 'jump' : 'jumps'}</Badge>}
      </Row>
      {open && value.map((p, i) => (
        <LabelledRow key={i} label={String(i)}>
          <VecField label={`${name} ${i}`} value={p} onChange={(v, done) => onChange(value.map((q, j) => (j === i ? v : q)), done)} />
        </LabelledRow>
      ))}
    </div>
  )
}

export function Goal({ value, onChange, owner, at, label }: FieldProps<number[] | null>) {
  const ed = useEditor(['extensions'])
  const name = label ?? 'goal'
  // The point the mover stands on: the field bound to `nav.from` beside the goal.
  const here = standsAt(ed, owner, at)
  if (value === null)
    return (
      <Row>
        <Badge tone="dim">none</Badge>
        <Button title={here ? `set ${name} where it stands` : nowhere(name)} disabled={!here} onClick={() => onChange(here!, true)}>set here</Button>
      </Row>
    )
  return (
    <Row>
      <VecField label={name} value={value} onChange={onChange} />
      <Button title={`take ${name} away`} onClick={() => onChange(null, true)}>✕</Button>
    </Row>
  )
}

// ---------------------------------------------------------------- the Route section

export function RouteSection({ selection, drawing: toggle }: { selection: Selection; drawing: Drawing }) {
  const ed = useEditor(['game', 'tools', 'extensions', 'x.nav'])
  const every = toggle.every
  const sel = selection as { scene: string; id: number }
  const s = ed.session
  const row = s?.row(sel.scene, sel.id)
  const on = !!row && drawing(ed, sel.scene)
  useMarks(on ? () => (ed.session?.row(sel.scene, sel.id) && drawing(ed, sel.scene) ? drawn(ed, sel.scene, sel.id, every) : []) : undefined)
  if (!s || !row) return <Empty>Row #{sel.id} is not in {sel.scene}.</Empty>

  const way = wayOf(ed, row)
  const m = measure(way)
  const bound = fieldsOf(ed, row, row.data)
  const numbers = Object.fromEntries(Object.values(bound).map(k => [k, row.data[k]]))
  const roleOf = (field: string | number) => (Object.keys(bound) as Role[]).find(r => bound[r] === field)!
  const scene = sel.scene
  return (
    <>
      {!ed.staged
        ? <Note>No game view is open: the way is drawn once one shows {scene}.</Note>
        : s.viewing !== scene && <Note>The game view shows {s.viewing ?? 'no scene'}: the way is drawn once it shows {scene}.</Note>}
      <LabelledRow label="points left">{m.left}</LabelledRow>
      <LabelledRow label="to first point">{m.first === undefined ? '—' : fmt(m.first)}</LabelledRow>
      <LabelledRow label="length">{fmt(m.length)}</LabelledRow>
      <LabelledRow label="step">{m.step === undefined ? '—' : fmt(m.step)}</LabelledRow>
      <LabelledRow label="end to goal">{m.toGoal === undefined ? (way.goal ? '—' : 'no goal') : fmt(m.toGoal)}</LabelledRow>
      {m.stands && <Note>It has a goal and no route: it stands.</Note>}
      {m.short && m.toGoal !== undefined && (
        <Note><Badge>short</Badge> The route ends {fmt(m.toGoal)} from the goal, more than a diagonal step: it was searched toward another point, or cut at the edge of its search, or the goal cannot be reached from here.</Note>
      )}
      {m.jumps.map(j => (
        <Note key={j.at}><Badge tone="danger">jump</Badge> Point {j.at} is {fmt(j.gap)} from point {j.at - 1}, {fmt(j.gap / m.step!)} steps.</Note>
      ))}
      {way.from && way.goal && <LabelledRow label="stands from goal">{fmt(gap(way.from, way.goal))}</LabelledRow>}
      <LabelledRow label="every mover"><Check label="draw every mover's way" value={every} onChange={v => toggle.setEvery(v)} /></LabelledRow>
      <Note>From where it stands along its route in the accent colour, on to its goal in the warning colour, a jump in the danger colour{every ? '; every other mover in a hue of its own' : ''}.</Note>
      <PropertyGrid
        value={numbers}
        owner={{ kind: row.kind, scene, row: row.id, data: row.data } satisfies Owner}
        onChange={(at, v, done) => {
          if (!done) return s.preview(scene, row.id, at, v)
          try {
            setWay(ed, ed, scene, row, { [roleOf(at[0])]: v })
          } catch (e) {
            ed.error(`nav: refused: ${(e as Error).message}`)
          }
        }}
      />
    </>
  )
}
