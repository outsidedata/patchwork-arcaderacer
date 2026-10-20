// A list whose rows are edited in place, such as the nodes of a program: each row is drawn by
// `render` under a head that names it, and moved up or down, dropped, or dragged by its head onto
// another row's place. `make`, when given, is what Add appends. Every change hands `onChange` the
// whole list as it now is.
//
// A row keeps what its fields hold (a number being typed, a draft) while its node moves: rows are
// keyed by `keyOf` when given, else by the node itself, so a node moved to another place takes its
// row with it, and a node replaced by an edited copy keeps the row its place had.
import { useRef, useState, type ReactNode } from 'react'
import { Button } from './layout.tsx'

// The keys given out: each node's, the last list's with its keys, and the next key to give.
type Keys<T> = { keys: WeakMap<object, number>; last: { item: T; key: number }[]; next: number }

// Each node's row key: a node seen before keeps its key; a node new in a place whose node is gone
// takes that place's key, as an edited copy does; anything else is given a new one.
function keysOf<T>(s: Keys<T>, items: T[]): number[] {
  const used = new Set<number>()
  const here = new Set<unknown>(items)
  const out = items.map((it, i) => {
    const obj = typeof it === 'object' && it !== null
    let k = obj ? s.keys.get(it as object) : undefined
    if (k === undefined || used.has(k)) {
      const was = s.last[i]
      k = was && !used.has(was.key) && (was.item === it || !here.has(was.item)) ? was.key : s.next++
    }
    used.add(k)
    if (obj) s.keys.set(it as object, k)
    return k
  })
  s.last = items.map((item, i) => ({ item, key: out[i] }))
  return out
}

export function NodeList<T>({ items, onChange, render, make, name, keyOf, label }: {
  items: T[]
  onChange(items: T[]): void
  render(item: T, i: number): ReactNode
  make?(): T
  // What a row's head says, and what it is called to a screen reader; its index when not given.
  name?(item: T, i: number): string
  // A key that stays the node's wherever it goes, such as its id.
  keyOf?(item: T, i: number): string | number
  label: string
}) {
  const dragged = useRef<number | undefined>(undefined)
  const [s] = useState<Keys<T>>(() => ({ keys: new WeakMap(), last: [], next: 0 }))
  const keys = keysOf(s, items)
  const moved = (from: number, to: number) => {
    const next = [...items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    return next
  }
  return (
    <div className="ui-nodes" role="list" aria-label={label}>
      {items.map((it, i) => {
        const called = name?.(it, i) ?? String(i)
        return (
          <div
            key={keyOf ? keyOf(it, i) : keys[i]}
            className="ui-node"
            role="listitem"
            aria-label={called}
            onDragOver={e => { if (dragged.current !== undefined) e.preventDefault() }}
            onDrop={e => {
              e.preventDefault()
              const from = dragged.current
              dragged.current = undefined
              if (from !== undefined && from !== i) onChange(moved(from, i))
            }}
          >
            <div className="ui-node-head" draggable onDragStart={() => { dragged.current = i }} onDragEnd={() => { dragged.current = undefined }}>
              <span className="ui-caret" aria-hidden>⋮</span>
              <span className="ui-node-name">{called}</span>
              <span className="ui-spacer" />
              <Button title={`move ${called} up`} disabled={i === 0} onClick={() => onChange(moved(i, i - 1))}>↑</Button>
              <Button title={`move ${called} down`} disabled={i === items.length - 1} onClick={() => onChange(moved(i, i + 1))}>↓</Button>
              <Button title={`drop ${called}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</Button>
            </div>
            <div className="ui-node-body">{render(it, i)}</div>
          </div>
        )
      })}
      {make && <Button title={`add to ${label}`} onClick={() => onChange([...items, make()])}>Add</Button>}
    </div>
  )
}
