// A tree of items that fold open, one of them selected, walked with the arrow keys. Each item's
// children are a group inside it, and its name is its label alone, as the ARIA tree pattern has it.
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'

export type TreeItem = { id: string; label: ReactNode; children?: TreeItem[]; badge?: ReactNode }

export function Tree({ items, selected, onSelect, label, open: first = [], clickOpens = false }: {
  items: TreeItem[]
  selected?: string
  onSelect(id: string): void
  label?: string
  open?: string[]
  // A click on an item with children folds it open or shut, for a tree whose branches are only
  // there to hold their leaves, such as folders.
  clickOpens?: boolean
}) {
  const [open, setOpen] = useState(() => new Set(first))
  const base = useId()
  const toggle = (id: string) => setOpen(o => {
    const n = new Set(o)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  // The items shown, in order.
  const shown: TreeItem[] = []
  const walk = (list: TreeItem[]) => {
    for (const item of list) {
      shown.push(item)
      if (item.children && open.has(item.id)) walk(item.children)
    }
  }
  walk(items)

  const key = (e: KeyboardEvent) => {
    const at = shown.findIndex(s => s.id === selected)
    const here = shown[at]
    if (e.key === 'ArrowDown' && at < shown.length - 1) onSelect(shown[at + 1].id)
    else if (e.key === 'ArrowUp' && at > 0) onSelect(shown[at - 1].id)
    else if (e.key === 'ArrowRight' && here?.children && !open.has(here.id)) toggle(here.id)
    else if (e.key === 'ArrowLeft' && here?.children && open.has(here.id)) toggle(here.id)
    else return
    e.preventDefault()
  }

  const draw = (item: TreeItem, depth: number): ReactNode => {
    const id = `${base}-${item.id}`
    const opened = open.has(item.id)
    return (
      <div
        key={item.id}
        role="treeitem"
        aria-labelledby={id}
        aria-level={depth + 1}
        aria-selected={item.id === selected}
        aria-expanded={item.children ? opened : undefined}
        onClick={e => {
          e.stopPropagation()
          onSelect(item.id)
          if (clickOpens && item.children) toggle(item.id)
        }}
        onDoubleClick={e => {
          e.stopPropagation()
          if (item.children && !clickOpens) toggle(item.id)
        }}
      >
        <div className={`ui-tree-item${item.id === selected ? ' ui-selected' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}>
          <span className="ui-caret" aria-hidden onClick={e => { e.stopPropagation(); if (item.children) toggle(item.id) }}>
            {item.children ? (opened ? '▾' : '▸') : ''}
          </span>
          <span id={id} className="ui-tree-label">{item.label}</span>
          {item.badge}
        </div>
        {item.children && opened && <div role="group">{item.children.map(c => draw(c, depth + 1))}</div>}
      </div>
    )
  }

  return (
    <div className="ui-tree" role="tree" aria-label={label} tabIndex={0} onKeyDown={key}>
      {items.map(i => draw(i, 0))}
    </div>
  )
}
