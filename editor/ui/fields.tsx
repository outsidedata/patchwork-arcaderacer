// The design system's value fields. Each shows a value and hands every change to `onChange`,
// with `done` false while a drag or a keystroke is still going and true when it is let go or
// committed, so a caller can show the drag live and keep only what it ends on.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { hexOf } from './theme.ts'

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(4)))

// How much one pixel of drag moves a number: finer for smaller numbers.
const stepFor = (v: number) => {
  const a = Math.abs(v)
  return a === 0 ? 0.01 : Math.max(0.001, 10 ** (Math.floor(Math.log10(a)) - 2))
}

export function NumberField({ value, onChange, label, step, integer }: {
  value: number
  onChange(value: number, done: boolean): void
  label?: string
  step?: number
  integer?: boolean
}) {
  const [text, setText] = useState<string | undefined>(undefined)
  const [live, setLive] = useState<number | undefined>(undefined)
  const drag = useRef<{ x: number; from: number; moved: boolean; now: number } | undefined>(undefined)
  const round = (v: number) => (integer ? Math.round(v) : v)

  const down = (e: PointerEvent) => {
    if (text !== undefined || e.button !== 0) return
    e.preventDefault()
    drag.current = { x: e.clientX, from: value, moved: false, now: value }
    const per = step ?? (integer ? 1 : stepFor(value))
    const move = (m: globalThis.PointerEvent) => {
      const d = drag.current!
      const dx = m.clientX - d.x
      if (!d.moved && Math.abs(dx) < 3) return
      d.moved = true
      d.now = round(d.from + dx * per * (m.shiftKey ? 10 : m.altKey ? 0.1 : 1))
      setLive(d.now)
      onChange(d.now, false)
    }
    const up = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      const d = drag.current!
      drag.current = undefined
      setLive(undefined)
      if (d.moved) onChange(d.now, true)
      else setText(fmt(value))
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
  }

  const commit = () => {
    if (text === undefined) return
    const v = Number(text)
    setText(undefined)
    if (text.trim() !== '' && Number.isFinite(v) && v !== value) onChange(round(v), true)
  }
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
    else if (e.key === 'Escape') setText(undefined)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const per = (step ?? (integer ? 1 : stepFor(value))) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
      const v = round(Number(text) + per)
      setText(fmt(v))
      onChange(v, true)
    }
  }

  if (text !== undefined)
    return <input className="ui-input ui-number" aria-label={label} value={text} onChange={e => setText(e.target.value)} onFocus={e => e.target.select()} onBlur={commit} onKeyDown={key} autoFocus />
  return (
    <div
      className="ui-input ui-number ui-scrub"
      role="spinbutton"
      aria-label={label}
      aria-valuenow={live ?? value}
      tabIndex={0}
      onPointerDown={down}
      onKeyDown={e => { if (e.key === 'Enter') setText(fmt(value)) }}
    >
      {fmt(live ?? value)}
    </div>
  )
}

export function TextField({ value, onChange, label }: { value: string; onChange(value: string, done: boolean): void; label?: string }) {
  const [text, setText] = useState(value)
  const [was, setWas] = useState(value)
  if (value !== was) {
    setWas(value)
    setText(value)
  }
  const commit = () => { if (text !== value) onChange(text, true) }
  return (
    <input
      className="ui-input"
      aria-label={label}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setText(value)
      }}
    />
  )
}

export function Check({ value, onChange, label }: { value: boolean; onChange(value: boolean, done: boolean): void; label?: string }) {
  return <input type="checkbox" className="ui-check" aria-label={label} checked={value} onChange={e => onChange(e.target.checked, true)} />
}

// A colour, as `#rrggbb` text or as the number 0xrrggbb, handed back in the form it came in.
export function ColorField({ value, onChange, label }: { value: string | number; onChange(value: string | number, done: boolean): void; label?: string }) {
  const css = typeof value === 'number' ? hexOf(value) : value
  const back = (c: string) => (typeof value === 'number' ? parseInt(c.slice(1), 16) : c)
  return (
    <div className="ui-row">
      <input type="color" className="ui-color" aria-label={label} value={css} onChange={e => onChange(back(e.target.value), false)} onBlur={e => onChange(back(e.target.value), true)} />
      <TextField label={label && `${label} hex`} value={css} onChange={t => { if (/^#[0-9a-f]{6}$/i.test(t)) onChange(back(t), true) }} />
    </div>
  )
}

const AXES = ['x', 'y', 'z', 'w']

export function VecField({ value, onChange, label, names = AXES }: { value: number[]; onChange(value: number[], done: boolean): void; label?: string; names?: string[] }) {
  return (
    <div className="ui-row ui-vec">
      {value.map((v, i) => (
        <label key={i} className="ui-vec-part">
          <span className="ui-axis">{names[i] ?? i}</span>
          <NumberField label={label ? `${label} ${names[i] ?? i}` : undefined} value={v} onChange={(n, done) => onChange(value.map((o, j) => (j === i ? n : o)), done)} />
        </label>
      ))}
    </div>
  )
}

// A choice of options; one `off` is shown and cannot be chosen, its text saying why, `<label> — <off>`,
// so the reason is read wherever the option is.
export function Select<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label?: string; off?: string }[]
  onChange(value: T, done: boolean): void
  label?: string
}) {
  return (
    <select className="ui-input ui-select" aria-label={label} value={String(value)} onChange={e => onChange(options.find(o => String(o.value) === e.target.value)!.value, true)}>
      {options.map(o => <option key={String(o.value)} value={String(o.value)} disabled={o.off !== undefined} title={o.off}>{o.label ?? String(o.value)}{o.off !== undefined && ` — ${o.off}`}</option>)}
    </select>
  )
}

// Any JSON value as text, taken when it parses.
export function JsonField({ value, onChange, label }: { value: unknown; onChange(value: unknown, done: boolean): void; label?: string }) {
  const text = JSON.stringify(value)
  const [draft, setDraft] = useState(text)
  const [bad, setBad] = useState(false)
  const [was, setWas] = useState(text)
  if (text !== was) {
    setWas(text)
    setDraft(text)
    setBad(false)
  }
  const commit = () => {
    if (draft === text) return
    try {
      onChange(JSON.parse(draft), true)
    } catch {
      setBad(true)
    }
  }
  return (
    <input
      className={`ui-input ui-mono${bad ? ' ui-bad' : ''}`}
      aria-label={label}
      aria-invalid={bad}
      value={draft}
      onChange={e => { setDraft(e.target.value); setBad(false) }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit() }}
    />
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// A number between `min` and `max`: a track to drag along, and the number beside it to type. The
// track hands every value it passes with `done` false, and the one it is let go at with true.
export function Slider({ value, min, max, step, integer, onChange, label }: {
  value: number
  min: number
  max: number
  step?: number
  integer?: boolean
  onChange(value: number, done: boolean): void
  label?: string
}) {
  const [live, setLive] = useState<number | undefined>(undefined)
  const shown = live ?? value
  const done = () => {
    if (live === undefined) return
    setLive(undefined)
    onChange(live, true)
  }
  return (
    <div className="ui-row ui-slider">
      <input
        type="range"
        className="ui-range"
        aria-label={label}
        min={min}
        max={max}
        step={step ?? (integer ? 1 : 'any')}
        value={shown}
        onChange={e => {
          const v = Number(e.target.value)
          setLive(v)
          onChange(v, false)
        }}
        onPointerUp={done}
        onKeyUp={done}
        onBlur={done}
      />
      <NumberField label={label && `${label} value`} integer={integer} step={step} value={shown} onChange={(v, d) => onChange(clamp(v, min, max), d)} />
    </div>
  )
}

// A bearing in degrees, clockwise from up, as a compass reads a map with −z up: 0 up, 90 right. Drag
// the dial, or turn it with the arrows while it has the focus, a degree at a time; Shift turns it by
// 15. The number beside it is typed. Every value it hands back is in [0, 360).
export function AngleDial({ value, onChange, label }: { value: number; onChange(value: number, done: boolean): void; label?: string }) {
  const [live, setLive] = useState<number | undefined>(undefined)
  const shown = live ?? value
  const wrap = (v: number) => ((Math.round(v) % 360) + 360) % 360
  const at = (e: PointerEvent, shift: boolean) => {
    const r = e.currentTarget.getBoundingClientRect()
    const deg = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI
    return wrap(shift ? Math.round(deg / 15) * 15 : deg)
  }
  const a = (shown * Math.PI) / 180
  return (
    <div className="ui-row ui-dial">
      <svg
        viewBox="-12 -12 24 24"
        className="ui-dial-face"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={shown}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          const v = at(e, e.shiftKey)
          setLive(v)
          onChange(v, false)
        }}
        onPointerMove={e => {
          if (live === undefined) return
          const v = at(e, e.shiftKey)
          setLive(v)
          onChange(v, false)
        }}
        onPointerUp={() => {
          if (live === undefined) return
          setLive(undefined)
          onChange(live, true)
        }}
        onKeyDown={e => {
          const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
          if (!by) return
          e.preventDefault()
          onChange(wrap(value + by * (e.shiftKey ? 15 : 1)), true)
        }}
      >
        <circle r={10} className="ui-dial-ring" />
        <line x1={0} y1={0} x2={Math.sin(a) * 9} y2={-Math.cos(a) * 9} className="ui-dial-needle" />
        <circle cx={Math.sin(a) * 9} cy={-Math.cos(a) * 9} r={2} className="ui-dial-tip" />
      </svg>
      <NumberField label={label && `${label} degrees`} step={1} value={shown} onChange={(v, d) => onChange(wrap(v), d)} />
    </div>
  )
}

// A rule `{ q, lo, hi }`: the ramp clamp01((v − lo) / (hi − lo)) over the value `q` names, so it
// rises from 0 at `lo` to 1 at `hi`, falls when `lo > hi`, and steps at `lo` when they are equal.
// The ramp is drawn over `range`, or over lo and hi with room either side.
export type Rule = { q: string; lo: number; hi: number }
const ramp = (v: number, lo: number, hi: number) => (lo === hi ? (v >= lo ? 1 : 0) : clamp((v - lo) / (hi - lo), 0, 1))

export function RampField({ value, keys, range, onChange, label }: {
  value: Rule
  keys: string[]
  range?: [number, number]
  onChange(value: Rule, done: boolean): void
  label?: string
}) {
  const { q, lo, hi } = value
  const span = Math.abs(hi - lo) || Math.max(1, Math.abs(lo))
  const [a, b] = range ?? [Math.min(lo, hi) - span / 2, Math.max(lo, hi) + span / 2]
  const W = 60, H = 16
  const x = (v: number) => ((v - a) / (b - a || 1)) * W
  const y = (w: number) => H - 1 - w * (H - 2)
  // The ramp's corners, and where it steps when lo and hi are one value.
  const xs = [a, ...[lo, hi].filter(v => v > a && v < b).sort((m, n) => m - n), b]
  const points = lo === hi
    ? [[a, ramp(a, lo, hi)], [lo, 0], [lo, 1], [b, 1]].filter(([v]) => v >= a && v <= b)
    : xs.map(v => [v, ramp(v, lo, hi)])
  return (
    <div className="ui-ramp" aria-label={label}>
      <Select<string> label={label && `${label} of`} value={q} options={[...new Set([q, ...keys])].map(k => ({ value: k }))} onChange={v => onChange({ q: v, lo, hi }, true)} />
      <svg className="ui-ramp-plot" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${q} ${lo > hi ? 'falls' : 'rises'} from ${lo} to ${hi}`}>
        <polyline points={points.map(([v, w]) => `${x(v)},${y(w)}`).join(' ')} className="ui-ramp-line" />
      </svg>
      <NumberField label={label && `${label} lo`} value={lo} onChange={(v, d) => onChange({ q, lo: v, hi }, d)} />
      <NumberField label={label && `${label} hi`} value={hi} onChange={(v, d) => onChange({ q, lo, hi: v }, d)} />
    </div>
  )
}
