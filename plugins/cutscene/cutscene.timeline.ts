// A timeline: a ruler over lanes, chips on the lanes, a playhead, and an end bracket. The editor's
// (`editor/ui/timeline.tsx`), carried over to the cutscene's panel (`cutscene.panel.ts`), which draws
// with the DOM itself:
// `timeline(el)` draws into `el` and hands back `set(props)`, which draws it again from `props`, and
// `close()`.
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
// onto the lane under the pointer for a chip whose `lanes` names that lane. Dragging the right edge of
// a chip with `resize` sets its length (`onResize`). A double-click on an empty stretch of a lane asks
// for a chip there (`onAdd`), at the grain the pointer is in. The end bracket is dragged too (`onEnd`),
// is selected as `END`, and the time past it is hatched. Keys pressed while the lanes have the focus
// go to `onKey`.
//
// A lane's `marks` are where something happened on it, in order of `at`, each a point or a run of
// `length`: they are drawn merged to whole pixels, so however many there are the lane draws at most
// one span per two pixels of its width, each with the lane's `tone` as a class (the panel's
// failing frames are `fail`, red), and a press on one seeks to the grain under the pointer inside it
// (`onSeek`, done).
//
// Positions come from the ruler's box, and the lane under the pointer from the lanes' boxes, so the
// timeline takes the width it is given. A press is followed on the window until it is let go; a
// pointer the browser cancels ends the gesture where the pointer last was, as a release there.

export type Lane = { id: string; label: string; extra?: HTMLElement[]; marks?: Mark[]; tone?: string }
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

export type Props = {
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
}

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
export const tickOf = (k: number, grain: number, px = 70) => {
  const raw = Math.max(px / k, grain)
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return round(p * (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10))
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, style: Partial<CSSStyleDeclaration> = {}) => {
  const e = document.createElement(tag)
  e.className = cls
  Object.assign(e.style, style)
  return e
}

export function timeline(root: HTMLElement) {
  let props: Props | undefined
  let ruler: HTMLElement | undefined
  let body: HTMLElement | undefined
  let gesture: Gesture | undefined
  let width = 0
  let view: View | undefined
  let fitted: unknown
  let box: [number, number, number, number] | undefined
  let moving: Move[] | undefined
  // Where the body was scrolled to, kept over each drawing.
  let scroll = 0

  const P = () => props!
  const whole = () => Math.max(P().span, P().grain * 10)
  const shown = (): View => view ?? { t0: -whole() * 0.02, k: (width || 800) / (whole() * 1.04) }
  const tick = () => tickOf(shown().k, P().grain)
  const x = (t: number) => (t - shown().t0) * shown().k
  const snapTo = (v: number, by: number) => round(Math.round(v / by) * by)
  const snap = (v: number, free: boolean) => snapTo(free ? v : snapTo(v, tick() / 4), P().grain)
  // The time under a client x, from the ruler's box.
  const timeAt = (cx: number) => shown().t0 + (cx - (ruler?.getBoundingClientRect().left ?? 0)) / shown().k
  // The index of the lane under a client y, from the lanes' boxes; the nearest end past them.
  const laneAt = (cy: number) => {
    const rows = [...(body?.querySelectorAll<HTMLElement>('[data-lane]') ?? [])]
    if (!rows.length) return 0
    const i = rows.findIndex(r => { const b = r.getBoundingClientRect(); return cy >= b.top && cy < b.bottom })
    if (i >= 0) return i
    return cy < rows[0].getBoundingClientRect().top ? 0 : rows.length - 1
  }
  const limit = () => P().end ?? Infinity

  // The wheel must not scroll the page as well, which only a listener that is not passive stops.
  const wheel = (e: WheelEvent) => {
    if (!props || !(ruler?.contains(e.target as Node) || body?.contains(e.target as Node))) return
    e.preventDefault()
    const now = shown()
    if (e.shiftKey) view = { t0: now.t0 + (e.deltaY || e.deltaX) / now.k, k: now.k }
    else {
      const t = now.t0 + (e.clientX - (ruler?.getBoundingClientRect().left ?? 0)) / now.k
      const k = Math.min(1e6, Math.max(1e-6, now.k * Math.exp(-e.deltaY * 0.0015)))
      view = { t0: t - (t - now.t0) * (now.k / k), k }
    }
    draw()
  }
  root.addEventListener('wheel', wheel, { passive: false })
  // The width of the ruler, as it is laid out; one that is not laid out is taken as 800 pixels.
  const ro = new ResizeObserver(() => {
    const w = ruler?.getBoundingClientRect().width || 800
    if (w !== width) { width = w; draw() }
  })
  ro.observe(root)

  // ---------------------------------------------------------------- gestures

  // A gesture follows the pointer on the window until it is let go, wherever it goes: a chip dragged
  // onto another lane is drawn anew there, and the element pressed is gone.
  const capture = () => {
    let last: PointerEvent | undefined
    const move = (e: PointerEvent) => {
      last = e
      pointerMove(e)
    }
    const up = (e: PointerEvent) => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      removeEventListener('pointercancel', up)
      pointerUp(e.type === 'pointercancel' && last ? last : e)
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    addEventListener('pointercancel', up)
  }

  const seekDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    ruler?.focus()
    capture()
    gesture = { kind: 'seek' }
    P().onSeek?.(Math.max(0, snapTo(timeAt(e.clientX), P().grain)), false)
  }
  const chipDown = (e: PointerEvent, c: Chip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    body?.focus()
    capture()
    const selected = P().selected ?? []
    const on = selected.includes(c.id)
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      P().onSelect?.(on ? selected.filter(id => id !== c.id) : [...selected, c.id])
      return
    }
    const ids = on ? selected : [c.id]
    if (!on) P().onSelect?.(ids)
    // A press on one of several selected, let go without a drag, selects it alone.
    const narrow = on && selected.length > 1
    if (c.fixed || !P().onMove) {
      if (narrow) gesture = { kind: 'narrow', id: c.id }
      return
    }
    const chosen = (P().chips ?? []).filter(o => ids.includes(o.id) && !o.fixed)
    gesture = { kind: 'move', x: e.clientX, y: e.clientY, t: timeAt(e.clientX), lane: laneAt(e.clientY), moved: false, chips: chosen, lead: c, narrow }
  }
  const edgeDown = (e: PointerEvent, c: Chip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    capture()
    if (!(P().selected ?? []).includes(c.id)) P().onSelect?.([c.id])
    gesture = { kind: 'resize', chip: c }
  }
  const endDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    capture()
    P().onSelect?.([END])
    gesture = { kind: 'end' }
  }
  // A press on a lane's mark seeks to the grain under the pointer, inside the mark.
  const markDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const t = e.currentTarget as HTMLElement
    const from = Number(t.dataset.from), to = Number(t.dataset.to)
    P().onSeek?.(Math.min(to, Math.max(from, snapTo(timeAt(e.clientX), P().grain))), true)
  }
  const emptyDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    body?.focus()
    capture()
    gesture = { kind: 'box', x: e.clientX, y: e.clientY, add: e.shiftKey }
  }

  // Where every chip of a move goes: the lead chip's time snapped, the rest by as much, the whole
  // group kept inside [0, end], and each onto the lane as many lanes away as the pointer went, when
  // the chip may go there.
  const movesOf = (g: Extract<Gesture, { kind: 'move' }>, cx: number, cy: number, free: boolean): Move[] => {
    let by = snap(g.lead.at + timeAt(cx) - g.t, free) - g.lead.at
    const lo = Math.min(...g.chips.map(c => c.at)), hi = Math.max(...g.chips.map(c => c.at))
    by = Math.min(Math.max(by, -lo), limit() - hi)
    const dl = laneAt(cy) - g.lane
    const lanes = P().lanes
    return g.chips.map(c => {
      const to = lanes[lanes.findIndex(l => l.id === c.lane) + dl]?.id
      return { id: c.id, at: round(c.at + by), lane: to !== undefined && (to === c.lane || c.lanes?.includes(to)) ? to : c.lane }
    })
  }

  const pointerMove = (e: PointerEvent) => {
    const g = gesture
    if (!g || !props) return
    const { grain } = props
    if (g.kind === 'seek') props.onSeek?.(Math.max(0, snapTo(timeAt(e.clientX), grain)), false)
    else if (g.kind === 'move') {
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 3) return
      g.moved = true
      const m = movesOf(g, e.clientX, e.clientY, e.altKey)
      moving = m
      draw()
      props.onMove?.(m, false)
    } else if (g.kind === 'resize') props.onResize?.(g.chip.id, Math.max(grain, snap(timeAt(e.clientX), e.altKey) - g.chip.at), false)
    else if (g.kind === 'end') props.onEnd?.(Math.max(0, snap(timeAt(e.clientX), e.altKey)), false)
    else if (g.kind === 'box') {
      g.to = [e.clientX, e.clientY]
      const r = body?.getBoundingClientRect()
      box = r && [Math.min(g.x, e.clientX) - r.left, Math.min(g.y, e.clientY) - r.top + (body?.scrollTop ?? 0), Math.abs(e.clientX - g.x), Math.abs(e.clientY - g.y)]
      draw()
    }
  }
  const pointerUp = (e: PointerEvent) => {
    const g = gesture
    gesture = undefined
    const had = box || moving
    box = undefined
    moving = undefined
    if (had) draw()
    if (!g || !props) return
    const { grain } = props
    const selected = props.selected ?? []
    if (g.kind === 'seek') props.onSeek?.(Math.max(0, snapTo(timeAt(e.clientX), grain)), true)
    else if (g.kind === 'move' && g.moved) props.onMove?.(movesOf(g, e.clientX, e.clientY, e.altKey), true)
    else if (g.kind === 'move' && g.narrow) props.onSelect?.([g.lead.id])
    else if (g.kind === 'narrow') props.onSelect?.([g.id])
    else if (g.kind === 'resize') props.onResize?.(g.chip.id, Math.max(grain, snap(timeAt(e.clientX), e.altKey) - g.chip.at), true)
    else if (g.kind === 'end') props.onEnd?.(Math.max(0, snap(timeAt(e.clientX), e.altKey)), true)
    else if (g.kind === 'box') {
      if (!g.to) return props.onSelect?.(g.add ? selected : [])
      const [t0, t1] = [timeAt(Math.min(g.x, g.to[0])), timeAt(Math.max(g.x, g.to[0]))]
      const [l0, l1] = [laneAt(Math.min(g.y, g.to[1])), laneAt(Math.max(g.y, g.to[1]))]
      const inBox = (props.chips ?? []).filter(c => {
        const li = props!.lanes.findIndex(l => l.id === c.lane)
        return li >= l0 && li <= l1 && c.at <= t1 && c.at + (c.length ?? 0) >= t0
      }).map(c => c.id)
      props.onSelect?.(g.add ? [...new Set([...selected, ...inBox])] : inBox)
    }
  }
  const rulerKey = (e: KeyboardEvent) => {
    const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    e.preventDefault()
    P().onSeek?.(Math.max(0, snapTo(P().head + by * (e.shiftKey ? tick() : P().grain), P().grain)), true)
  }

  // ---------------------------------------------------------------- the picture

  // The playhead's marks, moved alone when only the playhead moved.
  let heads: HTMLElement[] = []
  const place = () => {
    const at = `${x(P().head)}px`
    for (const h of heads) h.style.left = at
    if (ruler) {
      ruler.setAttribute('aria-valuenow', String(P().head))
      ruler.setAttribute('aria-valuetext', (P().format ?? (t => String(round(t))))(P().head))
    }
  }

  function draw() {
    if (!props) return
    const { label, lanes, chips = [], marks = [], span, grain, end, selected = [], format = (t: number) => String(round(t)) } = props
    if (body) scroll = body.scrollTop
    const focused = root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined
    const s = shown()
    const tk = tick()
    const t1 = s.t0 + (width || 800) / s.k
    const ticks: number[] = []
    for (let t = Math.ceil(s.t0 / tk) * tk; t <= t1; t += tk) ticks.push(round(t))
    const placed = new Map((moving ?? []).map(m => [m.id, m]))
    const lanesOf = new Map<string, Chip[]>()
    for (const c of chips) {
      const m = placed.get(c.id)
      const at = m ? { ...c, at: m.at, lane: m.lane } : c
      if (at.at + (at.length ?? 0) < s.t0 || at.at > t1) continue
      lanesOf.set(at.lane, [...(lanesOf.get(at.lane) ?? []), at])
    }
    const pastEnd = end !== undefined ? Math.max(0, x(end)) : undefined
    // A lane's marks as the spans of whole pixels they cover, each with the times it runs between.
    const spans = (ms: Mark[]) => {
      const out: { x0: number; x1: number; from: number; to: number }[] = []
      for (const m of ms) {
        const to = m.at + (m.length ?? 0)
        if (to < s.t0 || m.at > t1) continue
        const x0 = Math.floor(x(m.at)), x1 = Math.max(x0 + 2, Math.ceil(x(to)))
        const was = out[out.length - 1]
        if (was && x0 <= was.x1 + 1) {
          was.x1 = Math.max(was.x1, x1)
          was.to = Math.max(was.to, to)
        } else out.push({ x0, x1, from: m.at, to })
      }
      return out
    }
    heads = []

    const top = el('div', 'ui-timeline')
    top.setAttribute('aria-label', label)
    const rulers = el('div', 'ui-tl-row ui-tl-rulers')
    rulers.append(el('div', 'ui-tl-head'))
    const r = el('div', 'ui-tl-ruler')
    r.tabIndex = 0
    r.dataset.focus = 'ruler'
    r.setAttribute('role', 'slider')
    r.setAttribute('aria-label', `${label} playhead`)
    r.setAttribute('aria-valuemin', '0')
    r.setAttribute('aria-valuemax', String(span))
    r.addEventListener('pointerdown', seekDown)
    r.addEventListener('keydown', rulerKey)
    for (const t of ticks) {
      const span = el('span', 'ui-tl-tick', { left: `${x(t)}px` })
      span.textContent = format(t)
      r.append(span)
    }
    for (const m of marks) if (m.at + (m.length ?? 0) >= s.t0 && m.at <= t1) r.append(el('span', m.length ? 'ui-tl-hold' : 'ui-tl-mark', { left: `${x(m.at)}px`, ...(m.length ? { width: `${m.length * s.k}px` } : {}) }))
    if (pastEnd !== undefined) r.append(el('span', 'ui-tl-past', { left: `${pastEnd}px` }))
    const hm = el('span', 'ui-tl-head-mark')
    heads.push(hm)
    r.append(hm)
    rulers.append(r)
    ruler = r

    const b = el('div', 'ui-tl-body')
    b.tabIndex = 0
    b.dataset.focus = 'lanes'
    b.setAttribute('aria-label', `${label} lanes`)
    b.addEventListener('keydown', e => P().onKey?.(e))
    for (const l of lanes) {
      const row = el('div', 'ui-tl-row')
      row.dataset.lane = l.id
      const h = el('div', 'ui-tl-head')
      const name = el('span', 'ui-tl-name')
      name.textContent = l.label
      h.append(name, ...(l.extra ?? []))
      const track = el('div', 'ui-tl-track')
      track.setAttribute('role', 'listbox')
      track.setAttribute('aria-multiselectable', 'true')
      track.setAttribute('aria-label', l.label)
      track.addEventListener('pointerdown', emptyDown)
      track.addEventListener('dblclick', e => {
        if (!P().onAdd || e.target !== e.currentTarget) return
        const t = Math.floor(round(timeAt(e.clientX) / grain)) * grain
        if (t >= 0 && t < limit()) P().onAdd!(l.id, round(t))
      })
      if (l.marks) for (const sp of spans(l.marks)) {
        const m = el('span', `ui-tl-lane-mark${l.tone ? ` ${l.tone}` : ''}`, { left: `${sp.x0}px`, width: `${sp.x1 - sp.x0}px` })
        m.setAttribute('aria-label', `${l.label} ${format(sp.from)}${sp.to > sp.from ? ` to ${format(sp.to)}` : ''}`)
        m.dataset.from = String(sp.from)
        m.dataset.to = String(sp.to)
        m.addEventListener('pointerdown', markDown)
        track.append(m)
      }
      for (const c of lanesOf.get(l.id) ?? []) {
        const on = selected.includes(c.id)
        const bar = c.length !== undefined && c.length > 0
        const cls = ['ui-chip', bar ? `ui-chip-${c.look ?? 'bar'}` : 'ui-chip-point', c.open && 'ui-chip-open', c.warn && 'ui-chip-warn', on && 'ui-selected'].filter(Boolean).join(' ')
        const chip = el('div', cls, { left: `${x(c.at)}px`, ...(bar ? { width: `${Math.max(2, c.length! * s.k)}px` } : {}) })
        chip.setAttribute('role', 'option')
        chip.setAttribute('aria-selected', String(on))
        chip.setAttribute('aria-label', c.label ?? c.id)
        chip.dataset.chip = c.id
        chip.addEventListener('pointerdown', e => chipDown(e, c))
        if (bar) {
          const text = el('span', 'ui-chip-label')
          text.textContent = c.label ?? ''
          chip.append(text)
          if (c.resize) {
            const edge = el('span', 'ui-chip-edge')
            edge.setAttribute('aria-label', `${c.label ?? c.id} end`)
            edge.addEventListener('pointerdown', e => edgeDown(e, c))
            chip.append(edge)
          }
        }
        track.append(chip)
      }
      row.append(h, track)
      b.append(row)
    }
    const over = el('div', 'ui-tl-over')
    if (pastEnd !== undefined) over.append(el('span', 'ui-tl-past', { left: `${pastEnd}px` }))
    const ph = el('span', 'ui-tl-playhead')
    heads.push(ph)
    over.append(ph)
    if (end !== undefined) {
      const e = el('span', `ui-tl-end${selected.includes(END) ? ' ui-selected' : ''}`, { left: `${x(end)}px` })
      e.setAttribute('role', 'button')
      e.setAttribute('aria-label', `${label} end`)
      e.setAttribute('aria-pressed', String(selected.includes(END)))
      e.addEventListener('pointerdown', endDown)
      over.append(e)
    }
    b.append(over)
    if (box) b.append(el('span', 'ui-tl-box', { left: `${box[0]}px`, top: `${box[1]}px`, width: `${box[2]}px`, height: `${box[3]}px` }))
    body = b
    top.append(rulers, b)
    root.replaceChildren(top)
    b.scrollTop = scroll
    place()
    if (focused) root.querySelector<HTMLElement>(`[data-focus=${focused}]`)?.focus()
    if (!width) {
      const w = r.getBoundingClientRect().width
      if (w) { width = w; draw() }
    }
  }

  return {
    // Drawn again from `next`; when only the playhead moved since, only it is moved.
    set(next: Props) {
      const was = props
      props = next
      if (next.fit !== fitted) {
        fitted = next.fit
        view = undefined
      }
      const same = was && Object.keys(next).every(k => k === 'head' || (next as any)[k] === (was as any)[k]) && Object.keys(was).length === Object.keys(next).length
      if (same && !gesture) place()
      else draw()
    },
    close() {
      ro.disconnect()
      root.removeEventListener('wheel', wheel)
      root.replaceChildren()
      props = undefined
    },
  }
}
