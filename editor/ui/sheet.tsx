// The design system's pieces for pictures: a frame cut out of a sheet's page, a picture's pixels,
// and a surface a panel draws on and points at, such as a level editor's map.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Pixels } from './pixels.ts'

// One frame of a page, `box` [x, y, width, height] where it lies on the page, drawn upright at its
// own pixels; CSS scales it. A `rotated` frame lies on the page turned a quarter clockwise (a
// sheet's frame, `plugins/loader/loader.sim.ts`), its upright top row running down its box's right
// edge, and is drawn turned back, its box's height across and its width down. `over`, when given,
// draws over the frame in its pixels, such as the shapes a tile collides with; the frame is drawn
// again whenever it is another function.
export function FrameImage({ image, box, rotated, label, over }: {
  image: HTMLImageElement | undefined
  box: number[]
  rotated?: boolean
  label?: string
  over?(ctx: CanvasRenderingContext2D, width: number, height: number): void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [x, y, bw, bh] = box
  const [w, h] = rotated ? [bh, bw] : [bw, bh]
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !image) return
    ctx.clearRect(0, 0, w, h)
    if (rotated) {
      ctx.save()
      ctx.translate(0, h)
      ctx.rotate(-Math.PI / 2)
      ctx.drawImage(image, x, y, bw, bh, 0, 0, bw, bh)
      ctx.restore()
    } else ctx.drawImage(image, x, y, bw, bh, 0, 0, bw, bh)
    over?.(ctx, w, h)
  }, [image, x, y, bw, bh, w, h, rotated, over])
  return <canvas ref={ref} width={w} height={h} aria-label={label} />
}

// A picture's pixels (`pixels.ts`) drawn at their own size; CSS scales it.
export function PixelImage({ pixels, label }: { pixels: Pixels | undefined; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx || !pixels?.width || !pixels.height) return
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
  }, [pixels])
  return <canvas ref={ref} width={pixels?.width ?? 0} height={pixels?.height ?? 0} aria-label={label} />
}

// Where the pointer is on a surface, in CSS pixels from its top left, which buttons are down, and
// whether Shift and Alt are held.
export type SurfacePointer = { x: number; y: number; buttons: number; button: number; shift: boolean; alt: boolean }

// Two versions of a surface the same: two lists of the same items, in order, or one value.
const sameVersion = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => Object.is(v, b[i])) : Object.is(a, b)

const at = (c: HTMLCanvasElement, e:{ clientX: number; clientY: number; buttons: number; button: number; shiftKey: boolean; altKey: boolean }): SurfacePointer => {
  const r = c.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top, buttons: e.buttons, button: e.button, shift: e.shiftKey, alt: e.altKey }
}

// A canvas that fills its panel, or, given a `height` in CSS pixels, its panel's width at that
// height. `draw` is handed its 2D context, scaled so that one unit is one CSS pixel, and the
// surface's size, whenever `version` changes or the surface is resized: a list changes when one of
// its items does, so a panel hands a new list each drawing and the surface draws only for one that
// holds something new. The pointer's press, move, release, double click and wheel are handed over in
// CSS pixels; keys pressed while it has the focus go to `onKey`.
export function Surface({ draw, version, label, height, onDown, onMove, onUp, onDouble, onLeave, onWheel, onKey }: {
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void
  version: unknown
  label: string
  height?: number
  onDown?(p: SurfacePointer): void
  onMove?(p: SurfacePointer): void
  onUp?(p: SurfacePointer): void
  onDouble?(p: SurfacePointer): void
  onLeave?(): void
  onWheel?(p: SurfacePointer, dy: number): void
  onKey?(e: KeyboardEvent): void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<[number, number]>([0, 0])
  // How many versions there have been that hold something new.
  const [drawn, setDrawn] = useState({ version, n: 0 })
  if (!sameVersion(drawn.version, version)) setDrawn({ version, n: drawn.n + 1 })
  const drawRef = useRef(draw)
  const wheel = useRef(onWheel)
  useLayoutEffect(() => {
    drawRef.current = draw
    wheel.current = onWheel
  })

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize([el.clientWidth, el.clientHeight])
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const k = devicePixelRatio
    c.width = Math.max(1, Math.round(size[0] * k))
    c.height = Math.max(1, Math.round(size[1] * k))
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.clearRect(0, 0, size[0], size[1])
    drawRef.current(ctx, size[0], size[1])
  }, [size, drawn.n])

  // A wheel turned over the surface zooms it, and the page must not scroll too, which only a
  // listener that is not passive can stop.
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const f = (e: WheelEvent) => {
      if (!wheel.current) return
      e.preventDefault()
      wheel.current(at(c, e), e.deltaY)
    }
    c.addEventListener('wheel', f, { passive: false })
    return () => c.removeEventListener('wheel', f)
  }, [])

  return (
    <div ref={box} className="ui-surface" style={height === undefined ? undefined : { height, minHeight: height }} tabIndex={0} aria-label={label} onKeyDown={onKey}>
      <canvas
        ref={canvas}
        onPointerDown={e => {
          box.current?.focus()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          onDown?.(at(e.currentTarget, e))
        }}
        onPointerMove={e => onMove?.(at(e.currentTarget, e))}
        onPointerUp={e => onUp?.(at(e.currentTarget, e))}
        onDoubleClick={e => onDouble?.(at(e.currentTarget, e))}
        onPointerLeave={() => onLeave?.()}
        onContextMenu={e => e.preventDefault()}
      />
    </div>
  )
}
