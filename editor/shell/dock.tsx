// The panels, docked: tabs, splits, groups dragged anywhere and floated. Each panel is one an
// extension added; the layout is kept in the browser and put back on the next load. Each area opens
// on its lead panel, else the first placed there (`Panel.lead`); a side column is 300 wide and the
// bottom 220 high when the dock makes them.
//
// A panel whose tab is not shown waits: it is drawn in an `<Activity>`, hidden, so its effects are
// let go and its drawings wait behind everything shown, and shown again it is drawn as the editor is
// then. Every panel is drawn in a `<Profiler>`, which hands the editor what each drawing cost
// (`Editor.drawn`).
import { DockviewReact, themeDark, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react'
import { Activity, Profiler, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useEditor } from '../context.ts'
import { Empty } from '../ui/layout.tsx'
import { LAYOUT, PANELS } from './layout.ts'


function Hosted({ params, api }: IDockviewPanelProps<{ id: string }>) {
  const ed = useEditor(['extensions'])
  // Whether its tab is shown, as the dock says.
  const visibility = useCallback((f: () => void) => {
    const off = api.onDidVisibilityChange(f)
    return () => off.dispose()
  }, [api])
  const shown = useSyncExternalStore(visibility, () => api.isVisible)
  const P = ed.panels.get(params.id)?.component
  return (
    <Activity mode={shown ? 'visible' : 'hidden'}>
      <Profiler id={params.id} onRender={(id, _phase, ms) => ed.drawn(id, ms)}>
        {P ? <P /> : <Empty>The extension that shows this panel is off.</Empty>}
      </Profiler>
    </Activity>
  )
}

const components = { panel: Hosted }

// The panels the dock has seen, and of those the ones it took away because their extension was off.
type Kept = { known: string[]; parked: string[] }
const read = (): Kept => {
  try {
    return { known: [], parked: [], ...JSON.parse(localStorage.getItem(PANELS) ?? '{}') }
  } catch {
    return { known: [], parked: [] }
  }
}
const AREAS = ['center', 'left', 'right', 'bottom']
// A side area's group the dock made, and the side.
type Made = { group: { api: { setSize(size: { width?: number; height?: number }): void } }; area: 'left' | 'right' | 'bottom' }
// Each side area's group given its side's size: a column's width, the bottom's height.
const size = (made: Made[]) => {
  for (const m of made) m.group.api.setSize(m.area === 'bottom' ? { height: 220 } : { width: 300 })
}

export function Dock() {
  const ed = useEditor(['extensions'])
  const api = useRef<DockviewApi | undefined>(undefined)
  // A panel the dock has never seen is placed. One it took away because its extension turned off, as
  // a game's and a plugin's do when the game closes, is put back when it turns on again. One a person
  // closed is neither, so it stays closed until they open it.
  const kept = useRef<{ known: Set<string>; parked: Set<string> } | null>(null)
  if (kept.current == null) {
    const k = read()
    kept.current = { known: new Set(k.known), parked: new Set(k.parked) }
  }

  // Opens a panel in the place its extension asked for, beside the panels already there. A panel
  // that joins an area leaves the tab it shows alone unless it is the area's lead or `shown`; a
  // panel that makes a side area answers its group, which `fit` gives that side's size once every
  // panel is placed, since each group made after it takes its share of the room.
  const place = (id: string, shown: boolean) => {
    const dock = api.current
    const p = ed.panels.get(id)
    if (!dock || !p) return
    const there = dock.getPanel(id)
    if (there) return void there.api.setActive()
    const area = p.area ?? 'center'
    const areaOf = (id: string) => ed.panels.get(id)?.area ?? 'center'
    // Beside the panels of its own area, or else to that side of the centre's, or of any panel.
    const same = dock.panels.find(o => areaOf(o.id) === area)
    const beside = dock.panels.find(o => areaOf(o.id) === 'center') ?? dock.panels[0]
    const side = ({ left: 'left', right: 'right', bottom: 'below', center: 'right' } as const)[area]
    const position = same ? { referencePanel: same.id, direction: 'within' as const } : beside ? { referencePanel: beside.id, direction: side } : undefined
    const made = dock.addPanel({ id, component: 'panel', params: { id }, title: p.title, position, inactive: !!same && !shown && !p.lead })
    return same || area === 'center' ? undefined : { group: made.group, area }
  }

  const ready = (e: DockviewReadyEvent) => {
    api.current = e.api
    const saved = localStorage.getItem(LAYOUT)
    let restored = false
    if (saved) {
      try {
        e.api.fromJSON(JSON.parse(saved))
        restored = true
      } catch {
        e.api.clear()
      }
    }
    // What the dock has seen belongs to the layout it saw it in: with none put back, every panel is
    // new and placed again.
    if (!restored) kept.current = { known: new Set(), parked: new Set() }
    for (const o of e.api.panels) kept.current!.known.add(o.id)
    fit()
    e.api.onDidLayoutChange(() => localStorage.setItem(LAYOUT, JSON.stringify(e.api.toJSON())))
  }

  useEffect(() => ed.reveals(id => {
    const made = place(id, true)
    if (made) size([made])
  }))
  // Takes away the panels whose extension is off, puts back the ones taken away whose extension is
  // on again, and places the new ones.
  const fit = () => {
    const dock = api.current
    if (!dock) return
    const { known, parked } = kept.current!
    for (const o of [...dock.panels]) {
      if (ed.panels.has(o.id)) continue
      parked.add(o.id)
      o.api.close()
    }
    const byArea = [...ed.panels.values()].sort((a, b) => AREAS.indexOf(a.area ?? 'center') - AREAS.indexOf(b.area ?? 'center'))
    const made: Made[] = []
    for (const p of byArea) {
      const fresh = !known.has(p.id)
      known.add(p.id)
      if (dock.getPanel(p.id) || !(fresh || parked.has(p.id))) continue
      parked.delete(p.id)
      const m = place(p.id, false)
      if (m) made.push(m)
    }
    size(made)
    const now = JSON.stringify({ known: [...known], parked: [...parked] })
    if (localStorage.getItem(PANELS) !== now) localStorage.setItem(PANELS, now)
  }
  // Every time the panels change.
  useEffect(fit)

  return <DockviewReact className="editor-dock" theme={themeDark} components={components} onReady={ready} />
}

