// The components of the game extension (game.extension.tsx).
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useEditor } from '#editor/context.ts'
import type { Pointer } from '#editor/editor.ts'
import { keyLabel } from '#editor/shell/keys.ts'
import { GameList } from '#editor/shell/open.tsx'
import { Button, Empty } from '#editor/ui/layout.tsx'

type Held = { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }
const kept = ({ clientX, clientY, shiftKey, altKey, metaKey, ctrlKey }: Held): Held => ({ clientX, clientY, shiftKey, altKey, metaKey, ctrlKey })

// Drawn again for the game, the tool the view is in and its stage, and the tools extensions add.
export function GameView() {
  const ed = useEditor(['game', 'tools', 'extensions'])
  const s = ed.session
  const box = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const outline = useRef<HTMLDivElement>(null)
  const pick = useRef<HTMLDivElement>(null)
  // What a press is doing until it is let go: the tool's, or the orbit's from the last client point.
  const held = useRef<{ tool: true } | { orbit: 'turn' | 'pan'; x: number; y: number } | undefined>(undefined)
  // The last pointer the tool was handed, to hand it again after the orbit moves the view.
  const last = useRef<Held | undefined>(undefined)
  const [focused, setFocused] = useState(false)
  const tool = ed.active

  useEffect(() => {
    if (!s || !stage.current) return
    s.attach(stage.current)
    return () => s.detach()
  }, [s])

  // The canvases, as big as the panel lets them be at their own shape. A canvas drawn at a pixel
  // ratio has more pixels than its size on the page, which its style gives; one with no style is its
  // pixels. A canvas the game sizes on the page after it is mounted, as render2d's `fit` does from
  // its first frame and each time the window changes, is fitted again.
  useEffect(() => {
    const outer = box.current
    const inner = stage.current
    if (!outer || !inner) return
    const fit = () => {
      const c = inner.querySelector('canvas')
      const w = c && (parseFloat(c.style.width) || c.width), h = c && (parseFloat(c.style.height) || c.height)
      if (!w || !h) return
      const k = Math.min(outer.clientWidth / w, outer.clientHeight / h)
      inner.style.transform = `translate(-50%, -50%) scale(${k})`
    }
    const size = new ResizeObserver(fit)
    size.observe(outer)
    // The transform written on `inner` is this fit's own, and fits nothing again.
    const kids = new MutationObserver(seen => { if (seen.some(m => m.target !== inner || m.type === 'childList')) fit() })
    kids.observe(inner, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
    fit()
    return () => {
      size.disconnect()
      kids.disconnect()
    }
  }, [s])

  // The canvas point, in its pixels, under a pointer.
  const canvasAt = (clientX: number, clientY: number): [number, number] | undefined => {
    const c = stage.current?.querySelector('canvas')
    if (!c) return undefined
    const r = c.getBoundingClientRect()
    return [((clientX - r.left) / r.width) * c.width, ((clientY - r.top) / r.height) * c.height]
  }

  // The pointer as the active tool is handed it, in canvas pixels on the scene the view shows.
  const pointer = (e: Held): Pointer | undefined => {
    const at = canvasAt(e.clientX, e.clientY)
    const scene = ed.session?.viewing
    const stage = ed.staged
    if (!at || !scene || !stage) return undefined
    return { x: at[0], y: at[1], scene, stage, shift: e.shiftKey, alt: e.altKey, mod: e.metaKey || e.ctrlKey }
  }
  // The canvas pixels a move of the pointer by client pixels covers.
  const canvasBy = (dx: number, dy: number): [number, number] => {
    const c = stage.current?.querySelector('canvas')
    const r = c?.getBoundingClientRect()
    return c && r?.width ? [(dx * c.width) / r.width, (dy * c.height) / r.height] : [dx, dy]
  }
  // After the orbit moves the view, the tool hears where the pointer now is over the world.
  const rehover = () => {
    const e = last.current
    const p = e && pointer(e)
    const h = held.current
    if (p && !(h && 'tool' in h)) ed.active?.hover?.(p)
  }

  // A tool left while it is pressed is handed its `up` where the pointer last was, and the press is
  // over: the tool the view goes to hears nothing of it.
  // A drag of the orbit's ends too, so no move after it turns the orbit from where it began.
  useEffect(() => ed.ends(() => {
    const h = held.current
    held.current = undefined
    if (!h || !('tool' in h)) return
    const p = last.current && pointer(last.current)
    if (p) ed.active?.up?.(p)
  }))
  // A view taken away mid-press takes the press with it.
  useEffect(() => () => { held.current = undefined }, [])

  // The wheel over a tool's view zooms the orbit, and the panel must not scroll too, which only a
  // listener that is not passive can stop.
  useEffect(() => {
    const el = pick.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      last.current = kept(e)
      const orbit = ed.staged?.orbit
      if (!orbit) return
      orbit.zoom(e.deltaY)
      rehover()
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })

  // The selected row's outline, where it is drawn: placed again after each frame of the editor's
  // clock (`Session.onFrame`), as the row moves and the camera turns, at once when the selection or
  // the stage changes, and when the panel is resized, which moves the canvas within it.
  useEffect(() => {
    if (!s) return
    const place = () => {
      const el = outline.current
      const sel = ed.selection
      const c = stage.current?.querySelector('canvas')
      const b = sel && 'id' in sel && sel.scene === s.viewing && c ? ed.staged?.bounds(sel.id) : undefined
      if (!el || !b || !c || !box.current) {
        if (el) el.hidden = true
        return
      }
      const r = c.getBoundingClientRect(), o = box.current.getBoundingClientRect()
      const kx = r.width / c.width, ky = r.height / c.height
      el.hidden = false
      el.style.left = `${r.left - o.left + b[0] * kx}px`
      el.style.top = `${r.top - o.top + b[1] * ky}px`
      el.style.width = `${b[2] * kx}px`
      el.style.height = `${b[3] * ky}px`
    }
    const size = new ResizeObserver(place)
    if (box.current) size.observe(box.current)
    const offs = [s.onFrame(place), ed.subscribe(place, ['selection', 'tools'])]
    place()
    return () => {
      size.disconnect()
      for (const off of offs) off()
    }
  }, [ed, s])

  if (!s)
    return (
      <Empty>
        <p>Open a game</p>
        <GameList onOpen={name => void ed.openGame(name).catch(e => ed.error((e as Error).message, (e as Error).stack))} />
      </Empty>
    )

  // A left press is the tool's until it is let go; a right or a middle one the orbit's.
  const down = (e: ReactPointerEvent) => {
    last.current = kept(e)
    const p = pointer(e)
    if (!p) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    if (e.button === 0) {
      held.current = { tool: true }
      tool?.down?.(p)
    } else if (e.button === 1 || e.button === 2) held.current = { orbit: e.button === 2 && !e.shiftKey ? 'turn' : 'pan', x: e.clientX, y: e.clientY }
  }
  const move = (e: ReactPointerEvent) => {
    last.current = kept(e)
    const h = held.current
    if (h && 'orbit' in h) {
      const orbit = ed.staged?.orbit
      const [dx, dy] = canvasBy(e.clientX - h.x, e.clientY - h.y)
      h.x = e.clientX
      h.y = e.clientY
      if (!orbit) return
      if (h.orbit === 'turn') orbit.turn(dx, dy)
      else orbit.pan(dx, dy)
      return rehover()
    }
    const p = pointer(e)
    if (!p) return
    if (h) tool?.move?.(p)
    else tool?.hover?.(p)
  }
  const up = (e: ReactPointerEvent) => {
    last.current = kept(e)
    const h = held.current
    held.current = undefined
    const p = pointer(e)
    if (h && 'tool' in h && p) tool?.up?.(p)
  }
  // A pointer the browser cancels ends a press as a release where it last moved to: the cancel's own
  // point is not where the hand was.
  const cancel = () => {
    const h = held.current
    held.current = undefined
    const p = last.current && pointer(last.current)
    if (h && 'tool' in h && p) tool?.up?.(p)
  }
  const leave = () => {
    last.current = undefined
    if (!held.current) tool?.hover?.(undefined)
  }

  const hint = s.n === 0
    ? 'step 0: the seat is sent its first packet when the game steps'
    : tool
      ? `${tool.title}${ed.staged?.orbit ? ' · right drag turns, middle drag pans, the wheel zooms' : ''}`
      : focused ? 'the game has the keys' : 'click to play'

  return (
    <div ref={box} className="game-view">
      {/* The canvases are mounted in the stage, and the game's input is what happens in it. */}
      <div
        ref={stage}
        className="game-stage"
        tabIndex={0}
        aria-label="game view"
        onPointerDown={e => (e.currentTarget as HTMLElement).focus()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {tool && (
        <div
          ref={pick}
          className="game-pick"
          aria-label={`${tool.title} tool`}
          style={{ cursor: tool.cursor }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          onPointerLeave={leave}
          onContextMenu={e => e.preventDefault()}
        />
      )}
      <div ref={outline} className="game-selection" hidden />
      <div className="game-tools" role="toolbar" aria-label="game view tools">
        <Button title="play: the game has the mouse and the keys (Escape)" pressed={!tool} onClick={() => ed.activate(undefined)}>Play</Button>
        {[...ed.tools.values()].map(t => (
          <Button key={t.id} title={`${t.title.toLowerCase()}${t.key ? ` (${keyLabel(t.key)})` : ''}`} pressed={ed.tooling === t.id} onClick={() => ed.activate(t.id)}>{t.title}</Button>
        ))}
      </div>
      <span className="game-hint">{hint}</span>
    </div>
  )
}
