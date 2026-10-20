// Records in rows under named columns, such as a game's units or a catalogue's entries: one row
// selected, walked with the arrow keys, and every column with a `sort` sorts the rows by it when its
// head is clicked, and the other way round when it is clicked again.
import { useState, type KeyboardEvent, type ReactNode } from 'react'

export type Column<T> = {
  key: string
  title: string
  cell(row: T): ReactNode
  // What the rows are ordered by when this column sorts them.
  sort?(row: T): string | number
  // A number column's cells are set to the right.
  numeric?: boolean
}

export function Table<T>({ rows, columns, keyOf, selected, onSelect, label }: {
  rows: T[]
  columns: Column<T>[]
  keyOf(row: T): string
  selected?: string
  onSelect?(key: string): void
  label: string
}) {
  const [by, setBy] = useState<{ key: string; down: boolean } | undefined>(undefined)
  const col = by && columns.find(c => c.key === by.key)
  const shown = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a), y = col.sort!(b)
        const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
        return by!.down ? -d : d
      })
    : rows
  const key = (e: KeyboardEvent) => {
    if (!onSelect || !shown.length) return
    const at = shown.findIndex(r => keyOf(r) === selected)
    const to = e.key === 'ArrowDown' ? Math.min(shown.length - 1, at + 1) : e.key === 'ArrowUp' ? Math.max(0, at - 1) : undefined
    if (to === undefined) return
    e.preventDefault()
    onSelect(keyOf(shown[to]))
  }
  return (
    <table className="ui-table" aria-label={label} tabIndex={onSelect ? 0 : undefined} onKeyDown={key}>
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c.key} className={c.numeric ? 'ui-numeric' : undefined} aria-sort={by?.key === c.key ? (by.down ? 'descending' : 'ascending') : undefined}>
              {c.sort
                ? <button type="button" className="ui-table-sort" onClick={() => setBy(by?.key === c.key ? { key: c.key, down: !by.down } : { key: c.key, down: false })}>{c.title}{by?.key === c.key ? (by.down ? ' ▾' : ' ▴') : ''}</button>
                : c.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map(r => {
          const k = keyOf(r)
          return (
            <tr key={k} aria-selected={onSelect ? k === selected : undefined} className={k === selected ? 'ui-selected' : undefined} onClick={() => onSelect?.(k)}>
              {columns.map(c => <td key={c.key} className={c.numeric ? 'ui-numeric' : undefined}>{c.cell(r)}</td>)}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
