// A small chart of one or more series against one x: lines, or areas washed under them. One y axis,
// always. Each series takes the theme's series colours in a fixed order (`--series-1` to
// `--series-4`), text stays in the text colours, a legend names the series when there are two or
// more, and `bands` shades spans of x with a label, such as the band of wavelengths a cascade
// covers. Hovering the plot shows a crosshair at the first series' point nearest the pointer, and
// each series' own point nearest the pointer with its value (and its x, where it is not the
// crosshair's); Table shows every value as rows, a row for each x any series has. An x axis with
// `log` is drawn on a log scale, every x above 0.
import { useEffect, useRef, useState } from 'react'
import { Button } from './layout.tsx'

export type Series = { label: string; points: [number, number][] }
export type Band = { from: number; to: number; label: string }
type Axis = { label: string; log?: boolean; format?(v: number): string }

const fmt = (v: number) => (Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3) ? v.toExponential(1) : String(+v.toPrecision(3)))

// About `n` round values from a to b: steps of 1, 2 or 5 times a power of ten.
function ticks(a: number, b: number, n = 5): number[] {
  const raw = (b - a) / n
  if (!(raw > 0)) return [a]
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  const step = p * (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10)
  const out: number[] = []
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(+v.toPrecision(12))
  return out
}
// Powers of ten from a to b, with 2 and 5 between when there are few.
function logTicks(a: number, b: number): number[] {
  const out: number[] = []
  const few = Math.log10(b / a) < 3
  for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++)
    for (const m of few ? [1, 2, 5] : [1]) {
      const v = m * 10 ** e
      if (v >= a && v <= b) out.push(+v.toPrecision(12))
    }
  return out
}

const M = { left: 44, right: 10, top: 8, bottom: 30 }

export function Chart({ series, area, x, y, bands = [], label, height = 150 }: {
  series: Series[]
  area?: boolean
  x: Axis
  y: Axis
  bands?: Band[]
  label: string
  height?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  // The pointer's x on the plot, in pixels, while it is over it.
  const [hover, setHover] = useState<number | undefined>(undefined)
  const [table, setTable] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => { if (el.clientWidth) setWidth(el.clientWidth) }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const all = series.flatMap(s => s.points).filter(([px]) => !x.log || px > 0)
  const xs = all.map(p => p[0]), ys = all.map(p => p[1])
  let [x0, x1] = xs.length ? [Math.min(...xs), Math.max(...xs)] : [0, 1]
  if (x0 === x1) [x0, x1] = x.log ? [x0 / 2, x1 * 2] : [x0 - 1, x1 + 1]
  let [y0, y1] = ys.length ? [Math.min(...ys), Math.max(...ys)] : [0, 1]
  if (area) [y0, y1] = [Math.min(0, y0), Math.max(0, y1)]
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1]
  const pad = (y1 - y0) * 0.05
  if (!area || y0 < 0) y0 -= pad
  y1 += pad
  const W = Math.max(M.left + M.right + 10, width), H = height
  const pw = W - M.left - M.right, ph = H - M.top - M.bottom
  const tx = (v: number) => M.left + (x.log ? Math.log(v / x0) / Math.log(x1 / x0) : (v - x0) / (x1 - x0)) * pw
  const ty = (v: number) => M.top + (1 - (v - y0) / (y1 - y0)) * ph
  const xt = x.log ? logTicks(x0, x1) : ticks(x0, x1)
  const yt = ticks(y0, y1, 4)
  const fx = x.format ?? fmt, fy = y.format ?? fmt
  const path = (pts: [number, number][]) => pts.filter(([px]) => !x.log || px > 0).map(([px, py], i) => `${i ? 'L' : 'M'}${tx(px).toFixed(1)},${ty(py).toFixed(1)}`).join('')
  const base = ty(Math.max(y0, Math.min(y1, 0)))
  // Each series' point nearest the pointer's x, drawn at its own x; the crosshair is at the first
  // series' one.
  const nearest = (pts: [number, number][], px: number) => {
    let best: [number, number] | undefined, d = Infinity
    for (const p of pts) {
      if (x.log && p[0] <= 0) continue
      const dd = Math.abs(tx(p[0]) - px)
      if (dd < d) { d = dd; best = p }
    }
    return best
  }
  const at = hover === undefined ? [] : series.map(s => nearest(s.points, hover))
  const near = at.find(p => p !== undefined)
  // Every x any series has, in order: a row of the table each.
  const xsAll = [...new Set(series.flatMap(s => s.points.map(p => p[0])))].sort((a, b) => a - b)

  return (
    <div className="ui-chart" ref={box}>
      <div className="ui-row ui-chart-head">
        <span className="ui-key">{y.label}</span>
        <span className="ui-spacer" />
        {series.length > 1 && series.map((s, i) => (
          <span key={i} className="ui-chart-key"><span className={`ui-chart-swatch ui-series-${(i % 4) + 1}`} aria-hidden />{s.label}</span>
        ))}
        <Button title={`${label} as a table`} pressed={table} onClick={() => setTable(!table)}>Table</Button>
      </div>
      {table ? (
        <table className="ui-chart-table" aria-label={label}>
          <thead><tr><th>{x.label}</th>{series.map((s, i) => <th key={i}>{s.label}</th>)}</tr></thead>
          <tbody>
            {xsAll.map(px => (
              <tr key={px}><td>{fx(px)}</td>{series.map((s, i) => { const p = s.points.find(q => q[0] === px); return <td key={i}>{p ? fy(p[1]) : ''}</td> })}</tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="ui-chart-plot">
          <svg
            width={W}
            height={H}
            role="img"
            aria-label={label}
            onPointerMove={e => setHover(e.clientX - e.currentTarget.getBoundingClientRect().left)}
            onPointerLeave={() => setHover(undefined)}
          >
            {bands.map(b => {
              const a = tx(Math.max(b.from, x0)), c = tx(Math.min(b.to, x1))
              return c > a && (
                <g key={b.label} className="ui-chart-band">
                  <rect x={a} y={M.top} width={c - a} height={ph} />
                  <text x={(a + c) / 2} y={M.top + 10} textAnchor="middle">{b.label}</text>
                </g>
              )
            })}
            {yt.map(v => (
              <g key={v} className="ui-chart-grid">
                <line x1={M.left} x2={W - M.right} y1={ty(v)} y2={ty(v)} />
                <text x={M.left - 4} y={ty(v) + 3} textAnchor="end">{fy(v)}</text>
              </g>
            ))}
            {xt.map(v => (
              <text key={v} className="ui-chart-tick" x={tx(v)} y={H - M.bottom + 12} textAnchor="middle">{fx(v)}</text>
            ))}
            <text className="ui-chart-tick" x={W - M.right} y={H - 4} textAnchor="end">{x.label}</text>
            <line className="ui-chart-axis" x1={M.left} x2={W - M.right} y1={base} y2={base} />
            {series.map((s, i) => (
              <g key={i} className={`ui-series-${(i % 4) + 1}`}>
                {area && s.points.length > 1 && (
                  <path className="ui-chart-area" d={`${path(s.points)}L${tx(s.points[s.points.length - 1][0]).toFixed(1)},${base}L${tx(s.points[0][0]).toFixed(1)},${base}Z`} />
                )}
                <path className="ui-chart-line" d={path(s.points)} />
              </g>
            ))}
            {near && (
              <g>
                <line className="ui-chart-cross" x1={tx(near[0])} x2={tx(near[0])} y1={M.top} y2={M.top + ph} />
                {at.map((p, i) => p && (
                  <circle key={i} className={`ui-chart-dot ui-series-${(i % 4) + 1}`} cx={tx(p[0])} cy={ty(p[1])} r={4} />
                ))}
              </g>
            )}
          </svg>
          {near && (
            <div className="ui-chart-tip" role="status" style={{ left: Math.min(tx(near[0]) + 8, W - 130), top: M.top }}>
              <div className="ui-key">{x.label} {fx(near[0])}</div>
              {at.map((p, i) => p && (
                <div key={i} className="ui-chart-key">
                  <span className={`ui-chart-swatch ui-series-${(i % 4) + 1}`} aria-hidden />
                  {series.length > 1 ? `${series[i].label} ` : ''}{fy(p[1])}{p[0] !== near![0] ? ` at ${fx(p[0])}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
