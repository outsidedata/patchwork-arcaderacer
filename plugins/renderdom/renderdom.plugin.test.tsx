// renderdom on a jsdom page: the plugin handed a `plugins` of a wire on a scene of its own, ticked
// and framed by hand as a client would. jsdom lays nothing out, so where an element lies on the page
// is given to it (`getBoundingClientRect`), and it has no pointer capture and no 2D context, which
// are stood in for here as a browser gives them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { renderdom, scoped, type Hands, type Renderdom } from './renderdom.plugin.ts'

const scene = { prefabs: { engine: { width: 800, height: 450 } } }
const wire = (): Plugins => ({ wire: { n: 0, ack: 0, rows: [], home: '', scene, send: () => 0 } } as unknown as Plugins)

const windowed = (w: number, h: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
}
const ratio = (r: number) => Object.defineProperty(window, 'devicePixelRatio', { value: r, configurable: true })
const lies = (el: Element, left: number, top: number, width = 0, height = 0) => {
  el.getBoundingClientRect = () => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON() { return this } }) as DOMRect
}

// A 2D context that keeps what it was asked to do.
const contexts: { canvas: HTMLCanvasElement; calls: [string, ...number[]][] }[] = []
const context = (canvas: HTMLCanvasElement) => {
  const c = { canvas, calls: [] as [string, ...number[]][] }
  contexts.push(c)
  return {
    canvas,
    setTransform: (...a: number[]) => c.calls.push(['setTransform', ...a]),
    clearRect: (...a: number[]) => c.calls.push(['clearRect', ...a]),
  }
}

let dom: Renderdom
let plugins: Plugins
const frame = (draw: () => void) => {
  dom.tick(plugins)
  draw()
  dom.afterTick()
}

beforeEach(() => {
  windowed(800, 450)
  ratio(1)
  contexts.length = 0
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) { return context(this) } as never)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  dom = renderdom()
  plugins = wire()
})
afterEach(() => {
  dom.close()
  vi.restoreAllMocks()
})

const pointer = (el: Element, type: string, init: PointerEventInit) => {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init })
  el.dispatchEvent(e)
  return e
}

describe('panels and shown things', () => {
  it('puts the root on the page on its first tick, hidden until the frame ends', () => {
    dom.tick(plugins)
    expect(dom.root!.isConnected).toBe(true)
    expect(dom.root!.style.display).toBe('none')
    dom.afterTick()
    expect(dom.root!.style.display).toBe('')
  })

  it('makes an element once and keeps it across frames', () => {
    const make = vi.fn(() => document.createElement('div'))
    let first: HTMLElement | undefined
    frame(() => {
      const panel = dom.panel('rack', [10, 20, 300, 200])
      expect(panel.style.left).toBe('10px')
      expect(panel.style.width).toBe('300px')
      first = dom.show('rack', 'cutoff', make)
    })
    for (let i = 0; i < 3; i++) frame(() => {
      dom.panel('rack', [10, 20, 300, 200])
      expect(dom.show('rack', 'cutoff', make)).toBe(first)
    })
    expect(make).toHaveBeenCalledTimes(1)
    expect(first!.isConnected).toBe(true)
    expect(first!.dataset.key).toBe('cutoff')
    expect(first!.parentElement!.dataset.panel).toBe('rack')
  })

  it('removes an element the first frame it is not asked for, and makes it anew after', () => {
    let a: HTMLElement | undefined, b: HTMLElement | undefined
    frame(() => {
      dom.panel('rack', [0, 0, 100, 100])
      a = dom.show('rack', 'a', () => document.createElement('div'))
      b = dom.show('rack', 'b', () => document.createElement('div'))
    })
    frame(() => {
      dom.panel('rack', [0, 0, 100, 100])
      dom.show('rack', 'b', () => document.createElement('div'))
    })
    expect(a!.isConnected).toBe(false)
    expect(b!.isConnected).toBe(true)
    let again: HTMLElement | undefined
    frame(() => {
      dom.panel('rack', [0, 0, 100, 100])
      again = dom.show('rack', 'a', () => document.createElement('div'))
    })
    expect(again).not.toBe(a)
    expect(again!.isConnected).toBe(true)
  })

  it('lays a panel’s elements in the order asked for this frame', () => {
    const els: Record<string, HTMLElement> = {}
    const ask = (keys: string[]) => frame(() => {
      dom.panel('p', [0, 0, 10, 10])
      for (const k of keys) els[k] = dom.show('p', k, () => document.createElement('div'))
    })
    ask(['a', 'b', 'c'])
    ask(['c', 'a', 'b'])
    expect([...els.a.parentElement!.children].map(c => (c as HTMLElement).dataset.key)).toEqual(['c', 'a', 'b'])
  })

  it('takes a panel away with everything on it the first frame it is not asked for', () => {
    let panel: HTMLElement | undefined, el: HTMLElement | undefined
    frame(() => {
      panel = dom.panel('mixer', [0, 0, 100, 100])
      el = dom.show('mixer', 'fader', () => document.createElement('div'))
    })
    frame(() => {})
    expect(panel!.isConnected).toBe(false)
    expect(el!.isConnected).toBe(false)
    frame(() => {
      expect(dom.panel('mixer', [0, 0, 100, 100])).not.toBe(panel)
    })
  })

  it('throws on a key shown twice in a frame, and on a panel not asked for this frame', () => {
    dom.tick(plugins)
    dom.panel('p', [0, 0, 10, 10])
    dom.show('p', 'k', () => document.createElement('div'))
    expect(() => dom.show('p', 'k', () => document.createElement('div'))).toThrow('renderdom showed p k twice in one frame')
    expect(() => dom.show('q', 'k', () => document.createElement('div'))).toThrow('renderdom panel q was not asked for this frame')
    dom.afterTick()
    dom.tick(plugins)
    expect(() => dom.show('p', 'k', () => document.createElement('div'))).toThrow('renderdom panel p was not asked for this frame')
    dom.afterTick()
  })

  it('adds a stylesheet scoped to the root once per string, and each font stylesheet once', () => {
    frame(() => {
      dom.style('.a { color: red; }')
      dom.style('.a { color: red; }')
      dom.style('.b { color: blue; }')
      dom.fonts(['https://fonts.example/a.css', 'https://fonts.example/b.css'])
      dom.fonts(['https://fonts.example/a.css'])
    })
    const sheets = [...dom.root!.querySelectorAll('style')]
    const root = `[data-renderdom="${dom.root!.dataset.renderdom}"]`
    expect(sheets.map(s => s.textContent)).toEqual([`${root} .b { color: blue; }\n`, `${root} .a { color: red; }\n`])
    expect(sheets.map(s => s.sheet!.cssRules.length)).toEqual([1, 1])
    const links = [...document.head.querySelectorAll('link[rel="stylesheet"]')].map(l => l.getAttribute('href'))
    expect(links).toEqual(['https://fonts.example/a.css', 'https://fonts.example/b.css'])
    dom.close()
    expect(document.head.querySelectorAll('link').length).toBe(0)
    expect(dom.root!.isConnected).toBe(false)
  })
})

describe('scoped', () => {
  it('puts every selector under the root, & standing for the root, through at-rules', () => {
    const css = `/* a note */
& { --ground: #c9ced5; }
&.dark .a, .b > span, :is(.c, .d) { color: red; }
@import url("x.css");
@media (min-width: 600px) { .e { margin: 0; } }
@keyframes blink { from { opacity: 0; } to { opacity: 1; } }`
    expect(scoped(css, '[r]')).toBe([
      '[r] { --ground: #c9ced5; }',
      '[r].dark .a, [r] .b > span, [r] :is(.c, .d) { color: red; }',
      '@import url("x.css");',
      '@media (min-width: 600px) {\n[r] .e { margin: 0; }\n}',
      '@keyframes blink { from { opacity: 0; } to { opacity: 1; } }',
      '',
    ].join('\n'))
  })
})

describe('the root', () => {
  it('scales with the page, contained and centred in the window', () => {
    windowed(1600, 900)
    dom.tick(plugins)
    expect(dom.scale).toBe(2)
    expect(dom.root!.style.transform).toBe('scale(2)')
    expect(dom.root!.style.width).toBe('800px')
    expect(dom.root!.style.height).toBe('450px')
    expect(dom.root!.style.left).toBe('0px')
    dom.afterTick()
    windowed(1000, 1000)
    dom.tick(plugins)
    expect(dom.scale).toBe(1.25)
    expect(dom.root!.style.transform).toBe('scale(1.25)')
    expect(dom.root!.style.left).toBe('0px')
    expect(dom.root!.style.top).toBe(`${(1000 - 450 * 1.25) / 2}px`)
    dom.afterTick()
  })

  it('lies over the game renderer’s canvas at its laid-out size, at the renderer’s own size', () => {
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    lies(canvas, 30, 40, 960, 540)
    plugins.render2d = { canvas, size: [640, 360] }
    dom.tick(plugins)
    expect(dom.size).toEqual([640, 360])
    expect(dom.scale).toBe(1.5)
    expect(dom.root!.style.transform).toBe('scale(1.5)')
    expect(dom.root!.style.left).toBe('30px')
    expect(dom.root!.style.top).toBe('40px')
    dom.afterTick()
    canvas.remove()
  })
})

describe('canvas', () => {
  it('is sized in device pixels for a devicePixelRatio of 2 and the root’s scale, cleared, and keeps its context', () => {
    ratio(2)
    windowed(1600, 900) // scale 2
    let ctx: unknown
    frame(() => {
      dom.panel('roll', [0, 0, 400, 300])
      ctx = dom.canvas('roll', 'grid', [10, 20, 100, 50])
    })
    const el = dom.root!.querySelector('canvas')!
    expect(el.width).toBe(400)
    expect(el.height).toBe(200)
    expect(el.style.width).toBe('100px')
    expect(el.style.left).toBe('10px')
    expect(contexts[0].calls).toEqual([['setTransform', 1, 0, 0, 1, 0, 0], ['clearRect', 0, 0, 400, 200], ['setTransform', 4, 0, 0, 4, 0, 0]])
    frame(() => {
      dom.panel('roll', [0, 0, 400, 300])
      expect(dom.canvas('roll', 'grid', [10, 20, 100, 50])).toBe(ctx)
    })
    expect(contexts.length).toBe(1)
    expect(contexts[0].calls.filter(c => c[0] === 'clearRect').length).toBe(2)
    expect(dom.root!.querySelectorAll('canvas').length).toBe(1)
  })
})

describe('surface', () => {
  // A surface at [100, 50, 200, 100] on a panel at the root's origin, the root drawn at scale 2, so
  // its top left lies at (200, 100) on the page.
  const surfaced = (hands: Hands) => {
    windowed(1600, 900)
    let el: HTMLElement | undefined
    const draw = () => frame(() => {
      dom.panel('roll', [0, 0, 800, 450])
      el = dom.surface('roll', 'grid', [100, 50, 200, 100], hands)
    })
    draw()
    lies(el!, 200, 100, 400, 200)
    return { el: el!, draw }
  }

  it('hands down, move and up in the box’s units with their modifiers', () => {
    const calls: unknown[] = []
    const { el } = surfaced({
      down: (x, y, m) => calls.push(['down', x, y, m]),
      move: (x, y, m) => calls.push(['move', x, y, m]),
      up: (x, y, m) => calls.push(['up', x, y, m]),
    })
    pointer(el, 'pointerdown', { button: 0, buttons: 1, clientX: 240, clientY: 140, shiftKey: true })
    pointer(el, 'pointermove', { buttons: 1, clientX: 260, clientY: 150, altKey: true })
    pointer(el, 'pointermove', { buttons: 1, clientX: 270, clientY: 160, metaKey: true })
    pointer(el, 'pointerup', { button: 0, clientX: 280, clientY: 170, ctrlKey: true })
    expect(calls).toEqual([
      ['down', 20, 20, { shift: true, alt: false, mod: false }],
      ['move', 30, 25, { shift: false, alt: true, mod: false }],
      ['move', 35, 30, { shift: false, alt: false, mod: true }],
      ['up', 40, 35, { shift: false, alt: false, mod: true }],
    ])
    expect(el.setPointerCapture).toHaveBeenCalledWith(1)
    expect(el.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  it('follows a captured drag outside the box, and leaves when let go outside it', () => {
    const calls: unknown[] = []
    const { el } = surfaced({
      move: (x, y) => calls.push(['move', x, y]),
      up: (x, y) => calls.push(['up', x, y]),
      leave: (x, y) => calls.push(['leave', x, y]),
      hover: (x, y) => calls.push(['hover', x, y]),
    })
    pointer(el, 'pointerdown', { button: 0, buttons: 1, clientX: 210, clientY: 110 })
    // Captured, the pointer's events reach the surface wherever the pointer is.
    pointer(el, 'pointerleave', { buttons: 1, clientX: 100, clientY: 50 })
    pointer(el, 'pointermove', { buttons: 1, clientX: 100, clientY: 50 })
    pointer(el, 'pointermove', { buttons: 1, clientX: 1000, clientY: 600 })
    pointer(el, 'pointerup', { button: 0, clientX: 1000, clientY: 600 })
    expect(calls).toEqual([['move', -50, -25], ['move', 400, 250], ['up', 400, 250], ['leave', 400, 250]])
  })

  it('fires hover and leave only while no button is down', () => {
    const calls: unknown[] = []
    const hands: Hands = { hover: (x, y) => calls.push(['hover', x, y]), leave: (x, y) => calls.push(['leave', x, y]) }
    const { el } = surfaced(hands)
    pointer(el, 'pointermove', { buttons: 0, clientX: 220, clientY: 120 })
    pointer(el, 'pointermove', { buttons: 1, clientX: 230, clientY: 120 })
    pointer(el, 'pointerleave', { buttons: 1, clientX: 100, clientY: 120 })
    pointer(el, 'pointerleave', { buttons: 0, clientX: 100, clientY: 120 })
    expect(calls).toEqual([['hover', 10, 10], ['leave', -50, 10]])
  })

  it('hovers no surface while another holds a captured pointer', () => {
    windowed(800, 450)
    const calls: string[] = []
    let a: HTMLElement | undefined, b: HTMLElement | undefined
    frame(() => {
      dom.panel('p', [0, 0, 800, 450])
      a = dom.surface('p', 'a', [0, 0, 100, 100], { down: () => calls.push('down a'), hover: () => calls.push('hover a') })
      b = dom.surface('p', 'b', [200, 0, 100, 100], { hover: () => calls.push('hover b'), leave: () => calls.push('leave b') })
    })
    lies(b!, 200, 0, 100, 100)
    pointer(a!, 'pointerdown', { button: 0, buttons: 1, clientX: 10, clientY: 10 })
    pointer(b!, 'pointermove', { pointerId: 2, buttons: 0, clientX: 210, clientY: 10 })
    pointer(b!, 'pointerleave', { pointerId: 2, buttons: 0, clientX: 310, clientY: 10 })
    expect(calls).toEqual(['down a'])
  })

  it('hands wheel its deltas in CSS pixels and keeps the page from scrolling', () => {
    const calls: unknown[] = []
    const { el } = surfaced({ wheel: (x, y, m, dx, dy) => calls.push([x, y, m, dx, dy]) })
    const pixels = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 240, clientY: 140, deltaX: 4, deltaY: -120, shiftKey: true })
    el.dispatchEvent(pixels)
    const lines = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 240, clientY: 140, deltaY: 3, deltaMode: 1, ctrlKey: true })
    el.dispatchEvent(lines)
    expect(calls).toEqual([
      [20, 20, { shift: true, alt: false, mod: false }, 4, -120],
      [20, 20, { shift: false, alt: false, mod: true }, 0, 48],
    ])
    expect(pixels.defaultPrevented).toBe(true)
  })

  it('hands menu the right button without a down, and keeps the context menu off the box', () => {
    const calls: unknown[] = []
    const { el } = surfaced({ down: () => calls.push('down'), menu: (x, y, m) => calls.push(['menu', x, y, m]) })
    pointer(el, 'pointerdown', { button: 2, buttons: 2, clientX: 260, clientY: 120, altKey: true })
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
    el.dispatchEvent(menu)
    expect(calls).toEqual([['menu', 30, 10, { shift: false, alt: true, mod: false }]])
    expect(menu.defaultPrevented).toBe(true)
  })

  it('calls the hands of the latest frame', () => {
    const calls: string[] = []
    windowed(800, 450)
    let el: HTMLElement | undefined
    for (const name of ['first', 'second']) frame(() => {
      dom.panel('p', [0, 0, 800, 450])
      el = dom.surface('p', 's', [0, 0, 100, 100], { hover: () => calls.push(name) })
    })
    pointer(el!, 'pointermove', { buttons: 0, clientX: 10, clientY: 10 })
    expect(calls).toEqual(['second'])
  })

  it('lets go with an up when its capture is lost or it is taken away while held', () => {
    const calls: unknown[] = []
    const { el, draw } = surfaced({ up: (x, y) => calls.push(['up', x, y]) })
    pointer(el, 'pointerdown', { button: 0, buttons: 1, clientX: 210, clientY: 110 })
    el.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }))
    expect(calls).toEqual([['up', 5, 5]])
    draw()
    pointer(el, 'pointerdown', { button: 0, buttons: 1, clientX: 220, clientY: 120 })
    frame(() => { dom.panel('roll', [0, 0, 800, 450]) })
    expect(calls).toEqual([['up', 5, 5], ['up', 10, 10]])
    expect(el.isConnected).toBe(false)
  })

  it('sets the cursor over a surface, and over the root while it holds the pointer', () => {
    windowed(800, 450)
    let el: HTMLElement | undefined
    const draw = (css: string) => frame(() => {
      dom.panel('p', [0, 0, 800, 450])
      el = dom.surface('p', 's', [0, 0, 100, 100], {})
      dom.cursor('p', 's', css)
    })
    draw('crosshair')
    expect(el!.style.cursor).toBe('crosshair')
    pointer(el!, 'pointerdown', { button: 0, buttons: 1, clientX: 10, clientY: 10 })
    draw('ew-resize')
    expect(el!.style.cursor).toBe('ew-resize')
    expect(dom.root!.style.cursor).toBe('ew-resize')
    pointer(el!, 'pointerup', { button: 0, clientX: 10, clientY: 10 })
    expect(dom.root!.style.cursor).toBe('')
    dom.tick(plugins)
    dom.panel('p', [0, 0, 800, 450])
    expect(() => dom.cursor('p', 's', 'move')).toThrow('renderdom has no surface p s this frame')
    dom.afterTick()
  })
})

describe('keys', () => {
  it('stops a keydown in a field inside the root before any handler or listener', () => {
    const handler = vi.fn()
    const other = vi.fn()
    const own = vi.fn()
    let input: HTMLInputElement | undefined
    frame(() => {
      dom.panel('rack', [0, 0, 300, 100])
      input = dom.show('rack', 'name', () => document.createElement('input'))
      dom.keys(handler)
    })
    addEventListener('keydown', other, true)
    input!.addEventListener('keydown', own)
    const area = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.setAttribute('contenteditable', 'true')
    const inner = document.createElement('span')
    editable.appendChild(inner)
    frame(() => {
      dom.panel('rack', [0, 0, 300, 100])
      dom.show('rack', 'name', () => document.createElement('input'))
      dom.show('rack', 'notes', () => area)
      dom.show('rack', 'rich', () => editable)
      dom.keys(handler)
    })
    for (const t of [input!, area, inner]) {
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
      t.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true, cancelable: true }))
    }
    expect(handler).not.toHaveBeenCalled()
    expect(other).not.toHaveBeenCalled()
    expect(own).not.toHaveBeenCalled()
    removeEventListener('keydown', other, true)
  })

  it('hands no handler a key typed in a field outside the root', () => {
    const handler = vi.fn()
    frame(() => dom.keys(handler))
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    input.remove()
  })

  it('hands a keydown elsewhere to every handler asked for with its modifiers, and cancels a key one took', () => {
    const got: unknown[] = []
    frame(() => {
      dom.keys(k => { got.push(['first', k]); return k.key === 'd' })
      dom.keys(k => { got.push(['second', k.key]) })
    })
    const d = new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(d)
    const a = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', ctrlKey: true, altKey: true, repeat: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(a)
    expect(got).toEqual([
      ['first', { key: 'd', code: 'KeyD', ctrlKey: false, metaKey: true, shiftKey: true, altKey: false, mod: true, repeat: false }],
      ['second', 'd'],
      ['first', { key: 'a', code: 'KeyA', ctrlKey: true, metaKey: false, shiftKey: false, altKey: true, mod: true, repeat: true }],
      ['second', 'a'],
    ])
    expect(d.defaultPrevented).toBe(true)
    expect(a.defaultPrevented).toBe(false)
  })

  it('drops a handler the first frame it is not asked for, and every listener on close', () => {
    const handler = vi.fn()
    frame(() => dom.keys(handler))
    frame(() => {})
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
    frame(() => dom.keys(handler))
    dom.close()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('hands a key let go to the keyups handlers alone, but not one let go in a field', () => {
    const downs = vi.fn(), ups = vi.fn()
    let input: HTMLInputElement | undefined
    frame(() => {
      dom.panel('p', [0, 0, 10, 10])
      input = dom.show('p', 'name', () => document.createElement('input'))
      dom.keys(downs)
      dom.keyups(ups)
    })
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true }))
    input!.dispatchEvent(new KeyboardEvent('keyup', { key: 'b', code: 'KeyB', bubbles: true }))
    expect(downs).not.toHaveBeenCalled()
    expect(ups).toHaveBeenCalledTimes(1)
    expect(ups.mock.calls[0][0]).toMatchObject({ key: 'a', code: 'KeyA', mod: false })
    frame(() => {})
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', code: 'KeyA', bubbles: true }))
    expect(ups).toHaveBeenCalledTimes(1)
  })
})
