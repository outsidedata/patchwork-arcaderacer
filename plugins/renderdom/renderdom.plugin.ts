// The page's DOM layer, a peer of render2d and render3d: plain HTML elements drawn over the game. It
// has no row and no `world.renderdom`; it reads the game's size and draws nothing of its own.
//
// The root. One `div` per client, fixed over the game's canvas: the canvas of whichever renderer
// the scene names (`plugins.render3d`, else `plugins.render2d`) once that canvas is on the page and
// laid out, else, with no game renderer or none laid out yet, centred in the window at the largest
// size that fits, as CSS's `object-fit: contain` fits an image. It is the game's size in its own
// units, a CSS pixel each: the game renderer's `size` where it hands one out, else the `engine`
// prefab's `width` × `height`. It is drawn `scale` CSS pixels to each of those units with a CSS
// transform, `scale` the canvas's laid-out width over the game's width (or the contain fit), worked
// out again every `tick`, so it follows the page as it is resized and the game canvas as its
// renderer refits it. Every box below is in the game's units, and so is every point a surface hands
// back. It is put on the page on the first `tick`, hidden until the first `afterTick`, so the page
// never shows it empty, and taken off it in `close` with everything in it. It takes no pointer event
// itself, so the game's canvas under it is clicked wherever no panel lies.
//
// Panels. `panel(name, box)` is the panel's `div`, made the first time it is asked for, placed at
// `box` [x, y, width, height] every frame it is asked for, and taken away, with everything shown on
// it, the first frame it is not. Panels lie over one another in the order they were first made. A
// panel takes the pointer over its whole box.
//
// Shown things. `show(panel, key, make)` is the element for `key` on that panel, which must have
// been asked for this frame: `make` makes it the first time it is asked for, the same element comes
// back every frame it is asked for again, and the first frame it is not asked for it is taken off the
// page. A key is asked for once a frame, or `show` throws. The elements of a panel lie in the order
// they were asked for this frame, the first under the rest, and an element is moved only when that
// order changes. Each carries its key as `data-key` and its panel as the panel's `data-panel`, so a
// test finds it without showing it. A shown element is the caller's to place and fill, every frame.
// `canvas` and `surface` are shown things too, by the same contract, under keys of the same panel.
//
// `style(css)`: a stylesheet of rules for the elements in the root, each selector put under the
// root's own `data-renderdom` attribute so it reaches nothing else on the page, and `&` in a
// selector standing for the root itself, as in CSS nesting (`scoped`); one `style` element per
// distinct string, however often it is asked for. `fonts(urls)`: a stylesheet `link` per url, put in
// the page's head once, each font face it declares loaded once it has loaded, so text drawn on a
// canvas, which asks for no face itself, finds it there the frame after.
//
// `canvas(panel, key, box)`: a `canvas` element at `box`, kept as `show` keeps an element, its
// backing store `width × scale × devicePixelRatio` by `height × scale × devicePixelRatio` device
// pixels, rounded, resized when either changes. Each frame it is asked for it is cleared, and its 2D
// context, the same object every frame, is handed back with its transform set to draw in the box's
// own units: (0, 0) its top left, (width, height) its bottom right.
//
// `surface(panel, key, box, hands)`: pointer input over `box`, a transparent `div` kept as `show`
// keeps an element, handing each event to `hands` at the point in the box's own units, (0, 0) its top
// left, and `mods`, `{ shift, alt, mod }`, `mod` being `ctrlKey || metaKey`. The hands asked for in
// the latest frame are the ones called.
//   down(x, y, mods)   the left button pressed on the box. The pointer is captured: `move` and `up`
//                      follow it until the button is let go, wherever it goes, so their points can be
//                      outside the box, negative or past its size.
//   move(x, y, mods)   the captured pointer moving.
//   up(x, y, mods)     the captured pointer let go, or its capture lost, or the surface taken away
//                      while held, so every `down` is followed by one `up`. Let go outside the box,
//                      `leave` follows it.
//   hover(x, y, mods)  the pointer moving over the box while no button is down and no surface holds
//                      a captured pointer.
//   leave(x, y, mods)  the pointer leaving the box, under the same condition.
//   wheel(x, y, mods, dx, dy)  the wheel over the box, its deltas in CSS pixels (a line is 16, a
//                      page the window's height); the page does not scroll.
//   menu(x, y, mods)   the right button pressed on the box. The page's context menu is never opened
//                      over it.
// Any hand left out is not called. `cursor(panel, key, css)` is the CSS cursor over a surface shown
// this frame; while it holds a captured pointer, the cursor stays it wherever the pointer goes.
//
// Keys. `keys(handler)` hands `handler` every key going down on the page, as `{ key, code, ctrlKey,
// metaKey, shiftKey, altKey, mod, repeat }` (`key` and `code` the event's own, `mod` `ctrlKey ||
// metaKey`), while it is asked for every frame, as `show` keeps an element; several asked in one frame
// are each handed every key, in the order they were asked. A handler that hands back true took the
// key, and the page's own action for it (a scroll for Space, a bookmark for Mod+D) is cancelled. A
// key typed into a field, an `input`, a `textarea` or anything `contenteditable`, is no key: one in a
// field inside the root is stopped in the capture phase, on the window, before any other listener of
// the page is reached (renderdom adds that listener when it is made, before any plugin ticks, so it
// is the window's first), and the field still takes what is typed; one in a field elsewhere on the
// page reaches no handler. `keyup` and `keypress` in a field inside the root are stopped the same way.
// `keyups(handler)` is the same for every key let go, kept by the same contract: a note played on a
// key is let go with it. A key let go in a field is no key, as above.
//
// It needs a page: a client with no `document` throws on its first tick. One of these per client:
// `close` removes every listener it added, the root and every stylesheet it put on the page.
import type { Plugins } from '#engine/browser.ts'

// [x, y, width, height], in the game's units, or in the panel's for what is on a panel.
export type Box = [number, number, number, number]
export type Mods = { shift: boolean; alt: boolean; mod: boolean }
export type Hand = (x: number, y: number, mods: Mods) => void
export type Hands = {
  down?: Hand
  move?: Hand
  up?: Hand
  hover?: Hand
  leave?: Hand
  wheel?: (x: number, y: number, mods: Mods, dx: number, dy: number) => void
  menu?: Hand
}
export type Key = { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; mod: boolean; repeat: boolean }
export type KeyHandler = (k: Key) => boolean | void
export type Renderdom = ReturnType<typeof renderdom>

// A wheel's deltas in CSS pixels per line: the line height the browsers scroll by.
const LINE = 16

type Thing = {
  el: HTMLElement
  ctx?: CanvasRenderingContext2D
  hands?: Hands
  box?: Box
  drag?: { id: number; x: number; y: number; mods: Mods }
}
// `on`: asked for this frame; `asked`: the keys asked for on it this frame, in order.
type Panel = { el: HTMLDivElement; things: Map<string, Thing>; on: boolean; asked: string[]; seen: Set<string> }

const modsOf = (e: MouseEvent | KeyboardEvent): Mods => ({ shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey })

// Whether a key went down in a field, where it is typing and not a key.
const typing = (t: EventTarget | null): t is Element =>
  t instanceof Element && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.closest('[contenteditable]:not([contenteditable="false"])') !== null)

// A stylesheet's rules scoped under `root`, as CSS nesting would scope them, written out flat so
// every engine parses it: each selector of a rule is put under the root, `&` in one standing for the
// root itself, and the rules inside an at-rule's block (`@media`, `@supports`, `@container`) are
// scoped the same; an at-rule with no rules inside (`@keyframes`, `@font-face`, `@import`) is kept as
// it is. Comments are dropped.
// A selector list's selectors: split at its commas, but not at one inside brackets, `:is(a, b)`.
const split = (list: string): string[] => {
  const out: string[] = []
  let depth = 0, from = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(list.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(list.slice(from).trim())
  return out
}

export function scoped(css: string, root: string): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let out = '', i = 0
  // The end of the block opened just before `from`, past its closing brace.
  const close = (from: number) => {
    let depth = 1, j = from
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++
      else if (src[j] === '}') depth--
      j++
    }
    return j
  }
  while (i < src.length) {
    const open = src.indexOf('{', i), semi = src.indexOf(';', i)
    if (open < 0) break
    // A statement at-rule, `@import url(…);`, ends at its semicolon.
    if (semi >= 0 && semi < open && src.slice(i, semi).trim().startsWith('@')) {
      out += src.slice(i, semi + 1).trim() + '\n'
      i = semi + 1
      continue
    }
    const prelude = src.slice(i, open).trim()
    const end = close(open + 1)
    const body = src.slice(open + 1, end - 1)
    if (/^@(media|supports|container|layer)\b/.test(prelude)) out += `${prelude} {\n${scoped(body, root)}}\n`
    else if (prelude.startsWith('@')) out += `${prelude} {${body}}\n`
    else {
      const selectors = split(prelude).map(s => (s.includes('&') ? s.replaceAll('&', root) : `${root} ${s}`))
      out += `${selectors.join(', ')} {${body}}\n`
    }
    i = end
  }
  return out
}

export function renderdom() {
  const doc = typeof document === 'undefined' ? undefined : document
  const id = Math.random().toString(36).slice(2)
  const panels = new Map<string, Panel>()
  const sheets = new Map<string, HTMLStyleElement>()
  const links = new Map<string, HTMLLinkElement>()
  let handlers: KeyHandler[] = [] // asked for in the latest frame
  let asking: KeyHandler[] = [] // asked for this frame
  let uppers: KeyHandler[] = [] // `keyups`, asked for in the latest frame
  let askingUp: KeyHandler[] = [] // and this frame
  let plugins: Plugins | undefined
  let scale = 1
  let size: [number, number] = [0, 0]
  let mounted = false
  let held: Thing | undefined // the surface holding a captured pointer
  const root = doc?.createElement('div')
  if (root) {
    root.dataset.renderdom = id
    Object.assign(root.style, { position: 'fixed', left: '0px', top: '0px', transformOrigin: '0 0', pointerEvents: 'none', zIndex: '10', display: 'none' })
  }

  // A field inside the root keeps its keys from every listener of the page.
  const swallow = (e: Event) => {
    if (root && typing(e.target) && root.contains(e.target)) e.stopImmediatePropagation()
  }
  const hand = (e: KeyboardEvent, to: KeyHandler[]) => {
    if (typing(e.target)) return
    const k: Key = { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, mod: e.ctrlKey || e.metaKey, repeat: e.repeat }
    let took = false
    for (const h of to) if (h(k) === true) took = true
    if (took) e.preventDefault()
  }
  const onKey = (e: KeyboardEvent) => hand(e, handlers)
  const onKeyUp = (e: KeyboardEvent) => hand(e, uppers)
  if (doc) {
    for (const type of ['keydown', 'keyup', 'keypress']) addEventListener(type, swallow, true)
    addEventListener('keydown', onKey)
    addEventListener('keyup', onKeyUp)
  }

  const page = (): Document => {
    if (!doc) throw new Error('renderdom draws on a page, and this client has no document')
    return doc
  }

  const place = (el: HTMLElement, [x, y, w, h]: Box) => {
    const s = el.style
    if (s.left !== `${x}px`) s.left = `${x}px`
    if (s.top !== `${y}px`) s.top = `${y}px`
    if (s.width !== `${w}px`) s.width = `${w}px`
    if (s.height !== `${h}px`) s.height = `${h}px`
  }

  const asked = (name: string): Panel => {
    const p = panels.get(name)
    if (!p || !p.on) throw new Error(`renderdom panel ${name} was not asked for this frame`)
    return p
  }

  // The thing for `key` on a panel asked for this frame, made by `make` the first time.
  const thing = (panel: string, key: string, make: () => Thing): Thing => {
    const p = asked(panel)
    if (p.seen.has(key)) throw new Error(`renderdom showed ${panel} ${key} twice in one frame`)
    p.seen.add(key)
    p.asked.push(key)
    let t = p.things.get(key)
    if (!t) {
      t = make()
      t.el.dataset.key = key
      p.things.set(key, t)
      p.el.appendChild(t.el)
    }
    return t
  }

  // A pointer event's point in a surface's own units.
  const at = (t: Thing, e: MouseEvent): [number, number] => {
    const r = t.el.getBoundingClientRect()
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]
  }
  const inside = (t: Thing, x: number, y: number) => x >= 0 && y >= 0 && x < t.box![2] && y < t.box![3]

  // Let go of a captured pointer: `up` at its last point, and `leave` when that is outside the box.
  const letGo = (t: Thing, x: number, y: number, mods: Mods) => {
    t.drag = undefined
    held = undefined
    if (root) root.style.cursor = ''
    t.hands?.up?.(x, y, mods)
    if (!inside(t, x, y)) t.hands?.leave?.(x, y, mods)
  }

  const makeSurface = (): Thing => {
    const el = page().createElement('div')
    el.style.position = 'absolute'
    el.style.touchAction = 'none'
    const t: Thing = { el }
    el.addEventListener('pointerdown', e => {
      const [x, y] = at(t, e)
      if (e.button === 2) {
        e.preventDefault()
        t.hands?.menu?.(x, y, modsOf(e))
        return
      }
      if (e.button !== 0 || held) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      t.drag = { id: e.pointerId, x, y, mods: modsOf(e) }
      held = t
      if (root) root.style.cursor = el.style.cursor
      t.hands?.down?.(x, y, modsOf(e))
    })
    el.addEventListener('pointermove', e => {
      const [x, y] = at(t, e)
      if (t.drag) {
        if (e.pointerId !== t.drag.id) return
        t.drag = { id: e.pointerId, x, y, mods: modsOf(e) }
        t.hands?.move?.(x, y, modsOf(e))
      } else if (!held && e.buttons === 0) t.hands?.hover?.(x, y, modsOf(e))
    })
    el.addEventListener('pointerup', e => {
      if (!t.drag || e.pointerId !== t.drag.id) return
      const [x, y] = at(t, e)
      el.releasePointerCapture(e.pointerId)
      letGo(t, x, y, modsOf(e))
    })
    el.addEventListener('lostpointercapture', e => {
      if (!t.drag || e.pointerId !== t.drag.id) return
      letGo(t, t.drag.x, t.drag.y, t.drag.mods)
    })
    el.addEventListener('pointerleave', e => {
      if (held || e.buttons !== 0) return
      const [x, y] = at(t, e)
      t.hands?.leave?.(x, y, modsOf(e))
    })
    el.addEventListener('wheel', e => {
      e.preventDefault()
      const k = e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? innerHeight : 1
      const [x, y] = at(t, e)
      t.hands?.wheel?.(x, y, modsOf(e), e.deltaX * k, e.deltaY * k)
    }, { passive: false })
    el.addEventListener('contextmenu', e => e.preventDefault())
    return t
  }

  // Takes a thing off the page; a surface holding a captured pointer lets go of it first.
  const drop = (t: Thing) => {
    if (t.drag) letGo(t, t.drag.x, t.drag.y, t.drag.mods)
    t.el.remove()
  }

  // The game's size in its own units and the CSS pixels each is drawn across, and the root laid
  // over the game's canvas, or contained in the window.
  const lay = (p: Plugins) => {
    const r = p.render3d ?? p.render2d
    const given: [number, number] | undefined = r?.size
    const e = p.wire.scene.prefabs.engine
    size = given && given[0] > 0 ? [given[0], given[1]] : [e.width, e.height]
    const canvas: HTMLCanvasElement | undefined = r?.canvas
    const rect = canvas?.isConnected ? canvas.getBoundingClientRect() : undefined
    let left: number, top: number
    if (rect && rect.width > 0) {
      scale = rect.width / size[0]
      left = rect.left
      top = rect.top
    } else {
      scale = Math.min(innerWidth / size[0], innerHeight / size[1])
      left = (innerWidth - size[0] * scale) / 2
      top = (innerHeight - size[1] * scale) / 2
    }
    const s = root!.style
    if (s.width !== `${size[0]}px`) s.width = `${size[0]}px`
    if (s.height !== `${size[1]}px`) s.height = `${size[1]}px`
    if (s.left !== `${left}px`) s.left = `${left}px`
    if (s.top !== `${top}px`) s.top = `${top}px`
    if (s.transform !== `scale(${scale})`) s.transform = `scale(${scale})`
  }

  const me = {
    root,
    // The CSS pixels one of the game's units is drawn across, as of the last tick.
    get scale() { return scale },
    // The game's size in its own units, [width, height], as of the last tick.
    get size(): [number, number] { return [size[0], size[1]] },
    tick(p: Plugins) {
      plugins = p
      const d = page()
      if (!mounted) {
        mounted = true
        d.body.appendChild(root!)
      }
      lay(p)
    },
    panel(name: string, box: Box): HTMLDivElement {
      let p = panels.get(name)
      if (!p) {
        const el = page().createElement('div')
        el.dataset.panel = name
        el.style.position = 'absolute'
        el.style.pointerEvents = 'auto'
        p = { el, things: new Map(), on: false, asked: [], seen: new Set() }
        panels.set(name, p)
        root!.appendChild(el)
      }
      p.on = true
      place(p.el, box)
      return p.el
    },
    show<T extends HTMLElement>(panel: string, key: string, make: () => T): T {
      return thing(panel, key, () => ({ el: make() })).el as T
    },
    style(css: string) {
      if (sheets.has(css)) return
      const el = page().createElement('style')
      el.textContent = scoped(css, `[data-renderdom="${id}"]`)
      sheets.set(css, el)
      root!.prepend(el)
    },
    fonts(urls: string[]) {
      const d = page()
      for (const url of urls) {
        if (links.has(url)) continue
        const el = d.createElement('link')
        el.rel = 'stylesheet'
        el.href = url
        el.addEventListener('load', () => d.fonts.forEach(f => { if (f.status === 'unloaded') f.load() }))
        links.set(url, el)
        d.head.appendChild(el)
      }
    },
    canvas(panel: string, key: string, box: Box): CanvasRenderingContext2D {
      const t = thing(panel, key, () => {
        const el = page().createElement('canvas')
        el.style.position = 'absolute'
        return { el, ctx: el.getContext('2d')! }
      })
      const el = t.el as HTMLCanvasElement, ctx = t.ctx!
      place(el, box)
      const k = scale * devicePixelRatio
      const w = Math.max(1, Math.round(box[2] * k)), h = Math.max(1, Math.round(box[3] * k))
      if (el.width !== w) el.width = w
      if (el.height !== h) el.height = h
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.setTransform(w / box[2], 0, 0, h / box[3], 0, 0)
      return ctx
    },
    surface(panel: string, key: string, box: Box, hands: Hands): HTMLDivElement {
      const t = thing(panel, key, makeSurface)
      t.hands = hands
      t.box = box
      place(t.el, box)
      return t.el as HTMLDivElement
    },
    cursor(panel: string, key: string, css: string) {
      const p = asked(panel)
      const t = p.things.get(key)
      if (!t || !t.box || !p.seen.has(key)) throw new Error(`renderdom has no surface ${panel} ${key} this frame`)
      if (t.el.style.cursor !== css) t.el.style.cursor = css
      if (held === t && root) root.style.cursor = css
    },
    keys(handler: KeyHandler) { asking.push(handler) },
    keyups(handler: KeyHandler) { askingUp.push(handler) },
    afterTick() {
      for (const [name, p] of panels) {
        if (!p.on) {
          for (const t of p.things.values()) drop(t)
          p.el.remove()
          panels.delete(name)
          continue
        }
        for (const [key, t] of p.things) {
          if (p.seen.has(key)) continue
          drop(t)
          p.things.delete(key)
        }
        // This frame's order, the first asked under the rest, moving only what is out of place.
        p.asked.forEach((key, i) => {
          const el = p.things.get(key)!.el
          if (p.el.children[i] !== el) p.el.insertBefore(el, p.el.children[i] ?? null)
        })
        p.asked = []
        p.seen.clear()
        p.on = false
      }
      handlers = asking
      asking = []
      uppers = askingUp
      askingUp = []
      if (root && plugins) root.style.display = ''
    },
    close() {
      if (doc) {
        for (const type of ['keydown', 'keyup', 'keypress']) removeEventListener(type, swallow, true)
        removeEventListener('keydown', onKey)
        removeEventListener('keyup', onKeyUp)
      }
      for (const p of panels.values()) for (const t of p.things.values()) drop(t)
      panels.clear()
      for (const el of links.values()) el.remove()
      links.clear()
      sheets.clear()
      handlers = []
      asking = []
      uppers = []
      askingUp = []
      root?.remove()
    },
  }
  return me
}
