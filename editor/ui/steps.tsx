// A step grid, as a drum machine lays one out: a row per voice, a cell per step, each on or off.
// Clicking a cell hands `onToggle` its row and step; the cell is a button, so the keys reach it too.
// Every `beat` steps a cell is shaded, and every `bar` steps a line is drawn before it, so the eye
// counts; the step at `head`, while there is one, is lit down every row.
import type { ReactNode } from 'react'

export type StepRow = { id: string; label: ReactNode; extra?: ReactNode }

export function StepGrid({ label, rows, steps, on, head, beat = 4, bar = 16, onToggle }: {
  label: string
  rows: StepRow[]
  steps: number
  // Whether row `row`'s step `step` is on.
  on(row: string, step: number): boolean
  head?: number
  beat?: number
  bar?: number
  onToggle(row: string, step: number): void
}) {
  const cells = Array.from({ length: steps }, (_, i) => i)
  return (
    <div className="ui-steps" role="grid" aria-label={label}>
      {rows.map(r => (
        <div key={r.id} className="ui-steps-row" role="row">
          <div className="ui-steps-head">
            <span className="ui-steps-name">{r.label}</span>
            {r.extra}
          </div>
          {cells.map(i => {
            const lit = on(r.id, i)
            const cls = ['ui-step', lit && 'ui-on', Math.floor(i / beat) % 2 === 1 && 'ui-off-beat', i > 0 && i % bar === 0 && 'ui-bar', i === head && 'ui-head']
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                aria-pressed={lit}
                aria-label={`${typeof r.label === 'string' ? r.label : r.id} ${i + 1}`}
                className={cls.filter(Boolean).join(' ')}
                onClick={() => onToggle(r.id, i)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
