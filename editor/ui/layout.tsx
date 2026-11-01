// The design system's buttons and the pieces panels are laid out with.
import { useState, type CSSProperties, type ReactNode } from 'react'

export function Button({ children, onClick, title, disabled, primary, pressed }: {
  children: ReactNode
  onClick(): void
  title?: string
  disabled?: boolean
  primary?: boolean
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      className={`ui-button${primary ? ' ui-primary' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function Toolbar({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="ui-toolbar" role="toolbar" aria-label={label}>{children}</div>
}

// A panel's content: an optional toolbar over a body that scrolls.
export function PanelBody({ children, bar }: { children: ReactNode; bar?: ReactNode }) {
  return (
    <div className="ui-panel">
      {bar}
      <div className="ui-panel-body">{children}</div>
    </div>
  )
}

// A titled group that folds away.
export function Section({ title, children, open: first = true, extra }: { title: ReactNode; children: ReactNode; open?: boolean; extra?: ReactNode }) {
  const [open, setOpen] = useState(first)
  return (
    <section className="ui-section">
      <header className="ui-section-head">
        <button type="button" className="ui-disclosure" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="ui-caret" aria-hidden>{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {extra}
      </header>
      {open && <div className="ui-section-body">{children}</div>}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="ui-empty">{children}</div>
}

export function Badge({ children, tone, title }: { children: ReactNode; tone?: 'accent' | 'dim' | 'danger'; title?: string }) {
  return <span className={`ui-badge${tone ? ` ui-${tone}` : ''}`} title={title}>{children}</span>
}

// A row of tiles to pick one of, such as the frames of a clip; with `wrap`, rows of them, such as
// a palette; with `columns`, that many to a row, edge to edge across the strip's width, such as a
// tileset laid out as its image lays it out.
export function Strip({ items, selected, onSelect, label, wrap, columns }: {
  items: { id: string | number; node: ReactNode; title?: string }[]
  selected?: string | number
  onSelect(id: string | number): void
  label?: string
  wrap?: boolean
  columns?: number
}) {
  return (
    <div
      className={`ui-strip${wrap ? ' ui-wrap' : ''}${columns ? ' ui-columns' : ''}`}
      style={columns ? ({ '--columns': columns } as CSSProperties) : undefined}
      role="listbox"
      aria-label={label}
    >
      {items.map(it => (
        <button
          key={it.id}
          type="button"
          role="option"
          aria-selected={it.id === selected}
          title={it.title}
          aria-label={it.title}
          className={`ui-tile${it.id === selected ? ' ui-selected' : ''}`}
          onClick={() => onSelect(it.id)}
        >
          {it.node}
        </button>
      ))}
    </div>
  )
}

// A panel's two parts side by side: `main` takes the room, `side` a column beside it that scrolls.
export function Split({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="ui-split">
      <div className="ui-split-main">{main}</div>
      <div className="ui-split-side">{side}</div>
    </div>
  )
}

// A value in a panel beside what it is: the label, the value's field, and an action on it.
export function LabelledRow({ label, children, extra, title }: { label: ReactNode; children: ReactNode; extra?: ReactNode; title?: string }) {
  return (
    <div className="ui-grid-row">
      <span className="ui-key" title={title}>{label}</span>
      <div className="ui-grid-value">{children}</div>
      {extra}
    </div>
  )
}

// A line of text that says something about a panel's state, quieter than its values.
export function Note({ children }: { children: ReactNode }) {
  return <p className="ui-note">{children}</p>
}

// Things side by side in one row, such as a line's buttons.
export function Row({ children }: { children: ReactNode }) {
  return <div className="ui-row">{children}</div>
}

// How full something is between `min` and `max`: a bar filled to `value`, with a tick at `mark`,
// such as where it rests, and the value written beside it.
export function Meter({ value, min, max, mark, label, text }: { value: number; min: number; max: number; mark?: number; label?: string; text?: ReactNode }) {
  const at = (v: number) => `${(100 * Math.min(1, Math.max(0, (v - min) / (max - min)))).toFixed(1)}%`
  return (
    <div className="ui-row ui-meter-row">
      <div className="ui-meter" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}>
        <div className="ui-meter-fill" style={{ width: at(value) }} />
        {mark !== undefined && <div className="ui-meter-mark" style={{ left: at(mark) }} />}
      </div>
      {text !== undefined && <span className="ui-meter-text">{text}</span>}
    </div>
  )
}
