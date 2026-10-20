// A timeline: a ruler over lanes, chips on the lanes, a playhead, and an end bracket.
//
// Time is in whatever unit the caller counts, steps or seconds; `grain` is the smallest step of it,
// and `format` writes a time on the ruler. The view shows `[0, span]` fitted to the width the first
// time it has one, and again whenever `fit` changes; the wheel zooms about the pointer and Shift and
// the wheel pans. The ruler's ticks are round values at least a thumb apart; a drag snaps to a
// quarter tick, and with Alt to a grain. Every time handed back is a whole number of grains.
//
// The ruler: pressing or dragging along it scrubs the playhead (`onSeek`, `done` true on release),
// and it takes the focus, where ← and → seek a grain, and with Shift a tick. `marks` are drawn in
// its strip: a point, or a hatched hold when it has a length.
//
// A chip is a point at `at`, or a bar of `length` from it: `open` runs on past its end with no end
// drawn, `look` draws it striped, as a ramp or as a loop, and `warn` outlines it in the warn colour.
// Clicking a chip selects it alone, and Shift- or Cmd/Ctrl-click adds it or takes it away; a drag
// across empty lanes selects every chip it boxes. Dragging a selected chip moves every chip selected
// (`onMove`, each with its new time and lane, `done` true once, on release), clamped to `[0, end]`,
// onto the lane under the pointer for a chip whose `lanes` names that lane. Dragging the right edge of a chip with
// `resize` sets its length (`onResize`). A double-click on an empty stretch of a lane asks for a
// chip there (`onAdd`), at the grain the pointer is in. The end bracket is dragged too (`onEnd`), is selected as
// `END`, and the time past it is hatched. Keys pressed while the lanes have the focus go to `onKey`.
//
// Positions come from the ruler's box, and the lane under the pointer from the lanes' boxes, so the
// timeline takes the width it is given. A press is followed on the window until it is let go; a
// pointer the browser cancels ends the gesture where the pointer last was, as a release there.
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

// A lane's `marks` are where something happened on it, in order of `at`, each a point or a run of
// `length`: they are drawn merged to whole pixels, so however many there are the lane draws at most
// one span per two pixels of its width, and a press on one seeks to the grain under the pointer
// inside it (`onSeek`, done).
export type Lane = { id: string; label: ReactNode; extra?: ReactNode; marks?: Mark[] }
export type Chip = {
  id: string
  lane: string
  at: number
  length?: number
  open?: boolean
  look?: 'bar' | 'stripe' | 'ramp' | 'loop'
  label?: string
  warn?: boolean
  // The lanes it may be dragged onto, beside its own.
  lanes?: string[]
  // Not dragged: it shows where something is, and is selected by a click.
  fixed?: boolean
  resize?: boolean
}
export type Mark = { at: number; length?: number }
export type Move = { id: string; at: number; lane: string }
export const END = 'end'

type View = { t0: number; k: number }
type Gesture =
  | { kind: 'seek' }
  | { kind: 'move'; x: number; y: number; t: number; lane: number; moved: boolean; chips: Chip[]; lead: Chip; narrow: boolean }
  | { kind: 'narrow'; id: string }
  | { kind: 'resize'; chip: Chip }
  | { kind: 'end' }
  | { kind: 'box'; x: number; y: number; to?: [number, number]; add: boolean }

const round = (v: number) => +v.toFixed(9)
// The tick: a round number of units, 1, 2 or 5 times a power of ten, at least `px` pixels apart.
const tickOf = (k: number, grain: number, px = 70) => {
  const raw = Math.max(px / k, grain)
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return round(p * (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10))
}

export function Timeline({ label, lanes, chips = [], marks = [], head, span, grain, fit, end, selected = [], format = t => String(round(t)), onSeek, onSelect, onMove, onResize, onEnd, onAdd, onKey }: {
  label: string
  lanes: Lane[]
  chips?: Chip[]
  marks?: Mark[]
  head: number
  span: number
  grain: number
  fit?: unknown
  end?: number
  selected?: string[]
  format?(t: number): string
  onSeek?(t: number, done: boolean): void
  onSelect?(ids: string[]): void
  onMove?(moves: Move[], done: boolean): void
  onResize?(id: string, length: number, done: boolean): void
  onEnd?(t: number, done: boolean): void
  onAdd?(lane: string, t: number): void
  onKey?(e: KeyboardEvent): void
}) {
  const ruler = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | undefined>(undefined)
  const [width, setWidth] = useState(0)
  const [view, setView] = useState<View | undefined>(undefined)
  const [fitted, setFitted] = useState<unknown>(fit)
  const [box, setBox] = useState<[number, number, number, number] | undefined>(undefined)
  const [moving, setMoving] = useState<Move[] | undefined>(undefined)

  // The width of the ruler, as it is laid out; one that is not laid out is taken as 800 pixels.
  useLayoutEffect(() => {
    const el = ruler.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width || 800)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])
  if (fit !== fitted) {
    setFitted(fit)
    setView(undefined)
  }
  const whole = Math.max(span, grain * 10)
  const shown: View = view ?? { t0: -whole * 0.02, k: (width || 800) / (whole * 1.04) }
  const tick = tickOf(shown.k, grain)
  const x = (t: number) => (t - shown.t0) * shown.k
  const snapTo = (v: number, by: number) => round(Math.round(v / by) * by)
  const snap = (v: number, free: boolean) => snapTo(free ? v : snapTo(v, tick / 4), grain)
  // The time under a client x, from the ruler's box.
  const timeAt = (cx: number) => shown.t0 + (cx - (ruler.current?.getBoundingClientRect().left ?? 0)) / shown.k
  // The index of the lane under a client y, from the lanes' boxes; the nearest end past them.
  const laneAt = (cy: number) => {
    const rows = [...(body.current?.querySelectorAll<HTMLElement>('[data-lane]') ?? [])]
    if (!rows.length) return 0
    const i = rows.findIndex(r => { const b = r.getBoundingClientRect(); return cy >= b.top && cy < b.bottom })
    if (i >= 0) return i
    return cy < rows[0].getBoundingClientRect().top ? 0 : rows.length - 1
  }
  const limit = end ?? Infinity

  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    setView(v => {
      const now = v ?? shown
      if (e.shiftKey) return { t0: now.t0 + (e.deltaY || e.deltaX) / now.k, k: now.k }
      const t = now.t0 + (e.clientX - (ruler.current?.getBoundingClientRect().left ?? 0)) / now.k
      const k = Math.min(1e6, Math.max(1e-6, now.k * Math.exp(-e.deltaY * 0.0015)))
      return { t0: t - (t - now.t0) * (now.k / k), k }
    })
  }
  // The wheel must not scroll the panel as well, which only a listener that is not passive stops.
  const wheelRef = useRef(wheel)
  useLayoutEffect(() => { wheelRef.current = wheel })
  useLayoutEffect(() => {
    const els = [ruler.current, body.current].filter(e => e !== null)
    const f = (e: WheelEvent) => wheelRef.current(e)
    for (const el of els) el.addEventListener('wheel', f, { passive: false })
    return () => { for (const el of els) el.removeEventListener('wheel', f) }
  }, [])

  // ---------------------------------------------------------------- gestures

  // A gesture follows the pointer on the window until it is let go, wherever it goes: a chip dragged
  // onto another lane is drawn anew there, and the element pressed is gone.
  type Follow = (e: globalThis.PointerEvent) => void
  const follow = useRef<{ move: Follow; up: Follow }>({ move: () => {}, up: () => {} })
  const capture = () => {
    let last: globalThis.PointerEvent | undefined
    const move = (e: globalThis.PointerEvent) => {
      last = e
      follow.current.move(e)
    }
    const up = (e: globalThis.PointerEvent) => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', up)
      follow.current.up(e.type === 'pointercancel' && last ? last : e)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', up)
  }

  const seekDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    ruler.current?.focus()
    capture()
    gesture.current = { kind: 'seek' }
    onSeek?.(Math.max(0, snapTo(timeAt(e.clientX), grain)), false)
  }
  const chipDown = (e: PointerEvent, c: Chip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    body.current?.focus()
    capture()
    const on = selected.includes(c.id)
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      onSelect?.(on ? selected.filter(id => id !== c.id) : [...selected, c.id])
      return
    }
    const ids = on ? selected : [c.id]
    if (!on) onSelect?.(ids)
    // A press on one of several selected, let go without a drag, selects it alone.
    const narrow = on && selected.length > 1
    if (c.fixed || !onMove) {
      if (narrow) gesture.current = { kind: 'narrow', id: c.id }
      return
    }
    const chosen = chips.filter(o => ids.includes(o.id) && !o.fixed)
    gesture.current = { kind: 'move', x: e.clientX, y: e.clientY, t: timeAt(e.clientX), lane: laneAt(e.clientY), moved: false, chips: chosen, lead: c, narrow }
  }
  const edgeDown = (e: PointerEvent, c: Chip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    capture()
    if (!selected.includes(c.id)) onSelect?.([c.id])
    gesture.current = { kind: 'resize', chip: c }
  }
  const endDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    capture()
    onSelect?.([END])
    gesture.current = { kind: 'end' }
  }
  // A press on a lane's mark seeks to the grain under the pointer, inside the mark.
  const markDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const from = Number(e.currentTarget.dataset.from), to = Number(e.currentTarget.dataset.to)
    onSeek?.(Math.min(to, Math.max(from, snapTo(timeAt(e.clientX), grain))), true)
  }
  const emptyDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    body.current?.focus()
    capture()
    gesture.current = { kind: 'box', x: e.clientX, y: e.clientY, add: e.shiftKey }
  }

  // Where every chip of a move goes: the lead chip's time snapped, the rest by as much, the whole
  // group kept inside [0, end], and each onto the lane as many lanes away as the pointer went, when
  // the chip may go there.
  const movesOf = (g: Extract<Gesture, { kind: 'move' }>, cx: number, cy: number, free: boolean): Move[] => {
    let by = snap(g.lead.at + timeAt(cx) - g.t, free) - g.lead.at
    const lo = Math.min(...g.chips.map(c => c.at)), hi = Math.max(...g.chips.map(c => c.at))
    by = Math.min(Math.max(by, -lo), limit - hi)
    const dl = laneAt(cy) - g.lane
    return g.chips.map(c => {
      const to = lanes[lanes.findIndex(l => l.id === c.lane) + dl]?.id
      return { id: c.id, at: round(c.at + by), lane: to !== undefined && (to === c.lane || c.lanes?.includes(to)) ? to : c.lane }
    })
  }

  const pointerMove = (e: globalThis.PointerEvent) => {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'seek') onSeek?.(Math.max(0, snapTo(timeAt(e.clientX), grain)), false)
    else if (g.kind === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return
      g.moved = true
      const m = movesOf(g, e.clientX, e.clientY, e.altKey)
      setMoving(m)
      onMove?.(m, false)
    } else if (g.kind === 'resize') onResize?.(g.chip.id, Math.max(grain, snap(timeAt(e.clientX), e.altKey) - g.chip.at), false)
    else if (g.kind === 'end') onEnd?.(Math.max(0, snap(timeAt(e.clientX), e.altKey)), false)
    else if (g.kind === 'box') {
      g.to = [e.clientX, e.clientY]
      const r = body.current?.getBoundingClientRect()
      setBox(r && [Math.min(g.x, e.clientX) - r.left, Math.min(g.y, e.clientY) - r.top, Math.abs(e.clientX - g.x), Math.abs(e.clientY - g.y)])
    }
  }
  const pointerUp = (e: globalThis.PointerEvent) => {
    const g = gesture.current
    gesture.current = undefined
    setBox(undefined)
    setMoving(undefined)
    if (!g) return
    if (g.kind === 'seek') onSeek?.(Math.max(0, snapTo(timeAt(e.clientX), grain)), true)
    else if (g.kind === 'move' && g.moved) onMove?.(movesOf(g, e.clientX, e.clientY, e.altKey), true)
    else if (g.kind === 'move' && g.narrow) onSelect?.([g.lead.id])
    else if (g.kind === 'narrow') onSelect?.([g.id])
    else if (g.kind === 'resize') onResize?.(g.chip.id, Math.max(grain, snap(timeAt(e.clientX), e.altKey) - g.chip.at), true)
    else if (g.kind === 'end') onEnd?.(Math.max(0, snap(timeAt(e.clientX), e.altKey)), true)
    else if (g.kind === 'box') {
      if (!g.to) return onSelect?.(g.add ? selected : [])
      const [t0, t1] = [timeAt(Math.min(g.x, g.to[0])), timeAt(Math.max(g.x, g.to[0]))]
      const [l0, l1] = [laneAt(Math.min(g.y, g.to[1])), laneAt(Math.max(g.y, g.to[1]))]
      const inBox = chips.filter(c => {
        const li = lanes.findIndex(l => l.id === c.lane)
        return li >= l0 && li <= l1 && c.at <= t1 && c.at + (c.length ?? 0) >= t0
      }).map(c => c.id)
      onSelect?.(g.add ? [...new Set([...selected, ...inBox])] : inBox)
    }
  }
  useLayoutEffect(() => { follow.current = { move: pointerMove, up: pointerUp } })
  const rulerKey = (e: KeyboardEvent) => {
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    e.preventDefault()
    onSeek?.(Math.max(0, snapTo(head + by * (e.shiftKey ? tick : grain), grain)), true)
  }

  // ---------------------------------------------------------------- the picture

  const t1 = shown.t0 + (width || 800) / shown.k
  const ticks: number[] = []
  for (let t = Math.ceil(shown.t0 / tick) * tick; t <= t1; t += tick) ticks.push(round(t))
  const placed = new Map((moving ?? []).map(m => [m.id, m]))
  const lanesOf = new Map<string, Chip[]>()
  for (const c of chips) {
    const m = placed.get(c.id)
    const at = m ? { ...c, at: m.at, lane: m.lane } : c
    if (at.at + (at.length ?? 0) < shown.t0 || at.at > t1) continue
    lanesOf.set(at.lane, [...(lanesOf.get(at.lane) ?? []), at])
  }
  const pastEnd = end !== undefined ? Math.max(0, x(end)) : undefined
  // A lane's marks as the spans of whole pixels they cover, each with the times it runs between.
  const spans = (ms: Mark[]) => {
    const out: { x0: number; x1: number; from: number; to: number }[] = []
    for (const m of ms) {
      const to = m.at + (m.length ?? 0)
      if (to < shown.t0 || m.at > t1) continue
      const x0 = Math.floor(x(m.at)), x1 = Math.max(x0 + 2, Math.ceil(x(to)))
      const was = out[out.length - 1]
      if (was && x0 <= was.x1 + 1) {
        was.x1 = Math.max(was.x1, x1)
        was.to = Math.max(was.to, to)
      } else out.push({ x0, x1, from: m.at, to })
    }
    return out
  }

  return (
    <div className="ui-timeline" aria-label={label}>
      <div className="ui-tl-row ui-tl-rulers">
        <div className="ui-tl-head" />
        <div
          ref={ruler}
          className="ui-tl-ruler"
          role="slider"
          tabIndex={0}
          aria-label={`${label} playhead`}
          aria-valuemin={0}
          aria-valuemax={span}
          aria-valuenow={head}
          aria-valuetext={format(head)}
          onPointerDown={seekDown}
          onKeyDown={rulerKey}
        >
          {ticks.map(t => (
            <span key={t} className="ui-tl-tick" style={{ left: x(t) }}>{format(t)}</span>
          ))}
          {marks.map((m, i) => (m.at + (m.length ?? 0) >= shown.t0 && m.at <= t1) && (
            <span key={i} className={m.length ? 'ui-tl-hold' : 'ui-tl-mark'} style={{ left: x(m.at), width: m.length ? m.length * shown.k : undefined }} />
          ))}
          {pastEnd !== undefined && <span className="ui-tl-past" style={{ left: pastEnd }} />}
          <span className="ui-tl-head-mark" style={{ left: x(head) }} />
        </div>
      </div>
      <div ref={body} className="ui-tl-body" tabIndex={0} aria-label={`${label} lanes`} onKeyDown={onKey}>
        {lanes.map(l => (
          <div key={l.id} className="ui-tl-row" data-lane={l.id}>
            <div className="ui-tl-head">
              <span className="ui-tl-name">{l.label}</span>
              {l.extra}
            </div>
            <div className="ui-tl-track" role="listbox" aria-multiselectable aria-label={typeof l.label === 'string' ? l.label : l.id} onPointerDown={emptyDown} onDoubleClick={e => {
              if (!onAdd || e.target !== e.currentTarget) return
              const t = Math.floor(round(timeAt(e.clientX) / grain)) * grain
              if (t >= 0 && t < limit) onAdd(l.id, round(t))
            }}>
              {l.marks && spans(l.marks).map(s => (
                <span
                  key={s.x0}
                  className="ui-tl-lane-mark"
                  aria-label={`${typeof l.label === 'string' ? l.label : l.id} ${format(s.from)}${s.to > s.from ? ` to ${format(s.to)}` : ''}`}
                  style={{ left: s.x0, width: s.x1 - s.x0 }}
                  data-from={s.from}
                  data-to={s.to}
                  onPointerDown={markDown}
                />
              ))}
              {(lanesOf.get(l.id) ?? []).map(c => {
                const on = selected.includes(c.id)
                const bar = c.length !== undefined && c.length > 0
                const cls = ['ui-chip', bar ? `ui-chip-${c.look ?? 'bar'}` : 'ui-chip-point', c.open && 'ui-chip-open', c.warn && 'ui-chip-warn', on && 'ui-selected'].filter(Boolean).join(' ')
                return (
                  <div
                    key={c.id}
                    className={cls}
                    role="option"
                    aria-selected={on}
                    aria-label={c.label ?? c.id}
                    title={c.label}
                    style={{ left: x(c.at), width: bar ? Math.max(2, c.length! * shown.k) : undefined }}
                    onPointerDown={e => chipDown(e, c)}
                  >
                    {bar && <span className="ui-chip-label">{c.label}</span>}
                    {bar && c.resize && <span className="ui-chip-edge" aria-label={`${c.label ?? c.id} end`} onPointerDown={e => edgeDown(e, c)} />}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div className="ui-tl-over">
          {pastEnd !== undefined && <span className="ui-tl-past" style={{ left: pastEnd }} />}
          <span className="ui-tl-playhead" style={{ left: x(head) }} />
          {end !== undefined && (
            <span
              className={`ui-tl-end${selected.includes(END) ? ' ui-selected' : ''}`}
              role="button"
              aria-label={`${label} end`}
              aria-pressed={selected.includes(END)}
              style={{ left: x(end) }}
              onPointerDown={endDown}
            />
          )}
        </div>
        {box && <span className="ui-tl-box" style={{ left: box[0], top: box[1], width: box[2], height: box[3] }} />}
      </div>
    </div>
  )
}
