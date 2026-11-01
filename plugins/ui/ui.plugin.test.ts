// The UI on a scene this test writes itself, with no page: panels placed by `world.ui`, a thing shown
// for as long as somebody shows it, the hit test a click is asked through, the focus the pointer and
// a modal's keys move, every key named in `world.ui` by its place on the keyboard, modals stacked and opened, and world points placed through a camera after
// every actor has ticked. A frame here is what a client's frame does to this plugin: its tick, the
// actors' shows, its afterTick.
import { afterEach, expect, test, vi } from 'vitest'
import * as PIXI from 'pixi.js'
import * as THREE from 'three'
import { ui } from './ui.plugin.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { keyCode } from '#plugins/player/player.plugin.ts'

// Node has no WebGL, so a mounted canvas's renderer is a stand-in that keeps its size and resolution
// as PixiJS's does, and with `autoDensity` writes the canvas's CSS size from them as PixiJS's does.
const renderers = vi.hoisted(() => [] as { resolution: number; resized: number[][]; screen: { width: number; height: number }; drawn: any[] }[])
vi.mock('pixi.js', async original => ({
  ...(await original<typeof import('pixi.js')>()),
  autoDetectRenderer: async (o: { canvas: { style: Record<string, string> }; width: number; height: number; resolution: number }) => {
    const r = {
      resolution: o.resolution,
      resized: [] as number[][],
      screen: { width: o.width, height: o.height },
      drawn: [] as any[],
      resize(w: number, h: number, res: number) { r.resolution = res; r.resized.push([w, h, res]); r.screen = { width: w, height: h }; o.canvas.style.width = `${w}px`; o.canvas.style.height = `${h}px` },
      canvas: o.canvas,
      render(what: any) { r.drawn.push(what) },
      destroy() {},
    }
    o.canvas.style.width = `${o.width}px`
    o.canvas.style.height = `${o.height}px`
    renderers.push(r)
    return r
  },
}))

// The page's listeners, by type and phase, so a test can hand one an event; and a canvas that keeps
// its own.
type On = { type: string; f: (e: any) => void; capture: boolean }
const page: On[] = []
;(globalThis as any).addEventListener = (type: string, f: (e: any) => void, capture = false) => { page.push({ type, f, capture }) }
;(globalThis as any).removeEventListener = (type: string, f: (e: any) => void, capture = false) => {
  const i = page.findIndex(o => o.type === type && o.f === f && o.capture === capture)
  if (i >= 0) page.splice(i, 1)
}
const surface = () => {
  const on = new Map<string, (e: any) => void>()
  return { on, style: {} as any, addEventListener: (t: string, f: (e: any) => void) => on.set(t, f), removeEventListener: (t: string, f: any) => { if (on.get(t) === f) on.delete(t) }, remove() {} }
}

const W = 400, H = 300
const prefabs = {
  engine: { width: W, height: H },
}
const world = {
  ui: {
    panels: {
      tl: { anchor: 'top-left', at: [10, 20] },
      tr: { anchor: 'top-right', at: [-16, 16], size: [100, 50], clip: true, layer: 2 },
      bottom: { anchor: 'bottom', at: [0, -8], size: [200, 40], layer: 1 },
      middle: { anchor: 'center', size: [100, 100] },
      menu: { anchor: 'center', size: [200, 200], modal: true, layer: 3, backdrop: { color: 0, alpha: 0.5 } },
      dialog: { anchor: 'center', size: [200, 60], modal: true, layer: 4 },
      pause: { anchor: 'center', size: [100, 100], modal: true, layer: 5, key: 'p' },
      big: { anchor: 'bottom-right', at: [-4, -6], size: [100, 40], scale: 1.5, clip: true },
      bag: { anchor: 'top-right', size: [50, 50], group: 'right' },
      book: { anchor: 'top-right', size: [50, 50], group: 'right', key: 'b' },
      sheet: { anchor: 'top-left', size: [50, 50], group: 'left' },
      crooked: { anchor: 'middle' },
      scope: { anchor: 'top-right', at: [-10, 10], size: [60, 40], scale: 2, screen: 1193046 },
      bare: { anchor: 'top-left' },
      open: { anchor: 'top', clip: true },
    },
    keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', press: ['Enter', ' '], back: 'Escape' },
    styles: {
      label: { fontFamily: 'monospace', fontSize: 20, fill: 16777215 },
      button: { size: [80, 30], radius: 4, fill: { color: 3355443 }, focus: { color: 7829367 }, text: { fontSize: 14 } },
    },
  },
}

// Every UI a test starts is closed after it, so none is left listening on the page for the next.
const started: ReturnType<typeof ui>[] = []
afterEach(() => { for (const me of started.splice(0)) me.close() })

const start = (more: Record<string, any> = {}, canvas?: ReturnType<typeof surface>) => {
  const me = ui()
  started.push(me)
  if (canvas) me.canvas = canvas as any
  const plugins = { wire: { scene: { prefabs, world }, rows: [] }, ...more } as any
  const frame = (show: () => void = () => {}) => { me.tick(plugins); show(); me.afterTick() }
  return { me, plugins, frame }
}

// A key going down or up on the page, named as a table names it and carrying the `code` the browser
// would send for it, reaches every listener for it, those of the capture phase first. `press` is a
// key going down and coming up, as a tap on a keyboard is; it hands back the event the key going
// down was.
const key = (type: 'keydown' | 'keyup', k: string, repeat = false) => {
  const e = { key: k, code: keyCode(k), repeat, preventDefault: vi.fn() } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> }
  for (const capture of [true, false]) for (const o of page.filter(o => o.type === type && o.capture === capture)) o.f(e)
  return e
}
const press = (k: string) => { const e = key('keydown', k); key('keyup', k); return e }

// A button on a panel at (x, y) of it, which says its name when it is tapped.
const shows = (me: ReturnType<typeof ui>, panel: string, name: string, [x, y]: [number, number], taps: string[] = []) =>
  me.show(panel, name, () => {
    const b = me.button({ ...me.style('button'), label: name } as any).on('pointertap', () => taps.push(name))
    b.position.set(x, y)
    return b
  })

test('a panel is placed by its anchor, offset and size, drawn by its layer and then by where `world.ui` lists it, and made once', () => {
  const { me, frame } = start()
  frame()
  expect([me.panel('tl').x, me.panel('tl').y]).toEqual([10, 20])
  expect([me.panel('tr').x, me.panel('tr').y]).toEqual([W - 100 - 16, 16])
  expect([me.panel('bottom').x, me.panel('bottom').y]).toEqual([(W - 200) / 2, H - 40 - 8])
  expect([me.panel('middle').x, me.panel('middle').y]).toEqual([(W - 100) / 2, (H - 100) / 2])
  // `tl` and `middle` are both on layer 0, and `world.ui` lists `tl` first, so `middle` is drawn over it.
  const z = ['tl', 'middle', 'bottom', 'tr', 'menu'].map(n => me.panel(n).zIndex)
  expect([...z].sort((a, b) => a - b)).toEqual(z)
  expect(new Set(z).size).toBe(z.length)
  expect([me.panel('tr').boundsArea.width, me.panel('tr').boundsArea.height]).toEqual([100, 50])
  expect(me.panel('tr').mask).toBeTruthy()
  expect(me.panel('tl').mask).toBeFalsy()
  expect(me.panel('tl')).toBe(me.panel('tl'))
  expect(me.stage.sortableChildren).toBe(true)
})

test('a scaled panel is laid out in its own pixels: its box, clip and things scaled onto the canvas, anchored as big as it is drawn', () => {
  const { me, frame } = start()
  let b: PIXI.Container | undefined
  frame(() => { b = me.show('big', 'b', () => me.button({ ...me.style('button'), label: 'b' } as any)); b.position.set(10, 5) })
  const big = me.panel('big')
  expect([big.x, big.y]).toEqual([W - 150 - 4, H - 60 - 6])
  expect([big.scale.x, big.scale.y]).toEqual([1.5, 1.5])
  expect([big.boundsArea.width, big.boundsArea.height]).toEqual([100, 40])
  // The button's 80 by 30 from (10, 5) of the panel is 120 by 45 from (15, 7.5) of it on the canvas.
  expect(me.hit(big.x + 15 + 119, big.y + 7.5 + 44)).toBe(b)
  expect(me.hit(big.x + 15 + 121, big.y + 7.5 + 20)).toBe(null)
})

test('of the panels of one group one is open at a time, opened from code or by its key; other groups are left open', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  frame()
  me.open('sheet')
  me.open('bag')
  expect([me.opened('sheet'), me.opened('bag')]).toEqual([true, true])
  me.open('book')
  expect([me.opened('sheet'), me.opened('bag'), me.opened('book')]).toEqual([true, false, true])
  me.open('bag')
  expect([me.opened('bag'), me.opened('book')]).toEqual([true, false])
  press('b')
  expect([me.opened('sheet'), me.opened('bag'), me.opened('book')]).toEqual([true, false, true])
  me.dismiss('book')
  expect([me.opened('sheet'), me.opened('bag'), me.opened('book')]).toEqual([true, false, false])
})

test('a name `world.ui` does not give, or gives wrong, throws', () => {
  const early = ui()
  expect(() => early.panel('tl')).toThrow('ui has not ticked yet')
  const { me, frame } = start()
  frame()
  expect(() => me.panel('nope')).toThrow('ui has no panel nope')
  expect(() => me.show('nope', 'a', () => new PIXI.Container())).toThrow('ui has no panel nope')
  expect(() => me.open('nope')).toThrow('ui has no panel nope')
  expect(() => me.dismiss('nope')).toThrow('ui has no panel nope')
  expect(() => me.opened('nope')).toThrow('ui has no panel nope')
  expect(() => me.panel('crooked')).toThrow('ui panel crooked has anchor middle, which is none of top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right')
  expect(() => me.panel('open')).toThrow('ui panel open clips but has no size')
  expect(() => me.style('nope')).toThrow('ui has no style nope')
  const bare = ui()
  bare.tick({ wire: { scene: { prefabs, world: {} }, rows: [] } } as any)
  expect(() => bare.panel('tl')).toThrow('scene lists ui but has no world.ui')
})

test('show makes a thing once, named by its key, hands it back every frame it is shown, and destroys it after a frame nobody showed it', () => {
  const { me, frame } = start()
  let made = 0
  const make = () => { made++; return new PIXI.Text({ text: 'hi', style: me.style('label') }) }
  let first: PIXI.Text | undefined, again: PIXI.Text | undefined
  frame(() => { first = me.show('tl', 'a', make) })
  expect(first!.label).toBe('a')
  frame(() => { again = me.show('tl', 'a', make) })
  expect(again).toBe(first)
  expect(made).toBe(1)
  expect(me.panel('tl').children).toEqual([first])
  expect(me.panel('tl').getChildByLabel('a')).toBe(first)
  frame()
  expect(first!.destroyed).toBe(true)
  expect(me.panel('tl').children).toEqual([])
  frame(() => { again = me.show('tl', 'a', make) })
  expect(made).toBe(2)
  expect(again).not.toBe(first)
})

test('one key is one thing: shown twice in a frame throws, and so does a child show did not hand out', () => {
  const { me, frame } = start()
  expect(() => frame(() => { me.show('tl', 'a', () => new PIXI.Container()); me.show('tl', 'a', () => new PIXI.Container()) }))
    .toThrow('ui showed tl a twice in one frame')
  const other = start()
  expect(() => other.frame(() => { other.me.show('tr', 'a', () => new PIXI.Container()); other.me.panel('tr').addChild(new PIXI.Container()) }))
    .toThrow('ui panel tr holds a child show did not hand out')
})

test('a bar fills the part of its track its fraction says from the left, to a whole pixel, in the fill it is given, framed round the outside', () => {
  const { me } = start()
  const b = me.bar({ size: [46, 6], edge: 1, frame: { color: 0x000000 }, track: { color: 0x333333 } })
  // The frame and the track, then the fill, each a rectangle: [x, y, width, height, colour].
  const rects = (g: any) => g.context.instructions.map((i: any) => {
    const r = i.data.path.shapePath.shapePrimitives[0].shape
    return [r.x, r.y, r.width, r.height, i.data.style.color]
  })
  const [back, full] = b.children as any[]
  expect(rects(back)).toEqual([[-1, -1, 48, 8, 0x000000], [0, 0, 46, 6, 0x333333]])
  b.set(0.5, { color: 0xffe14d })
  expect(rects(full)).toEqual([[0, 0, 23, 6, 0xffe14d]])
  b.set(2 / 3, { color: 0x555555 })
  expect(rects(full)).toEqual([[0, 0, 31, 6, 0x555555]])
  b.set(0, { color: 0xffe14d })
  expect(rects(full)).toEqual([])
  b.set(1.5, { color: 0xffe14d })
  expect(rects(full)).toEqual([[0, 0, 46, 6, 0xffe14d]])
})

test('an iris covers its box but for a circle, cut a row of pixels at a time, rows cut alike one rectangle', () => {
  const { me } = start()
  const g = me.iris({ size: [16, 12] })
  const rects = (it: any) => it.context.instructions.map((i: any) => {
    const r = i.data.path.shapePath.shapePrimitives[0].shape
    return [r.x, r.y, r.width, r.height, i.data.style.color]
  })
  // Which pixels of each row show through, from the rectangles.
  const open = (it: any) => Array.from({ length: 12 }, (_, j) => {
    const row = Array(16).fill(true)
    for (const [x, y, w, h] of rects(it)) if (j >= y && j < y + h) for (let i = x; i < x + w; i++) row[i] = false
    return row.map(o => (o ? 'o' : '#')).join('')
  })
  g.set(8, 6, 0)
  expect(rects(g)).toEqual([[0, 0, 16, 12, 0]])
  // Radius 4 about the middle of the box: a row is open across the pixels whose middles are inside
  // the circle at the row's middle.
  g.set(8, 6, 4)
  expect(open(g)).toEqual([
    '################',
    '################',
    '######oooo######',
    '#####oooooo#####',
    '####oooooooo####',
    '####oooooooo####',
    '####oooooooo####',
    '####oooooooo####',
    '#####oooooo#####',
    '######oooo######',
    '################',
    '################',
  ])
  // Rows cut alike are one rectangle: the two black bands, then each side of each of the five spans.
  expect(rects(g)).toHaveLength(2 + 2 * 5)
  // Off the box's edge the circle is cut at it; past its far corner nothing is covered.
  g.set(0, 0, 3)
  expect(open(g).slice(0, 4)).toEqual(['ooo#############', 'ooo#############', 'oo##############', '################'])
  g.set(8, 6, Math.hypot(8, 6) + 1)
  expect(rects(g)).toEqual([])
  // The fill it is given.
  const red = me.iris({ size: [4, 4], fill: { color: 0xff0000 } })
  red.set(2, 2, 0)
  expect(rects(red)).toEqual([[0, 0, 4, 4, 0xff0000]])
})

test('a button\'s label is a Text, or with `bitmap` a BitmapText drawn in its style\'s font, centred on it and never hit apart from it', () => {
  const { me, frame } = start()
  frame()
  const plain = me.button({ ...me.style('button'), label: 'go' } as any)
  const gold = me.button({ ...me.style('button'), label: 'go', bitmap: true } as any)
  const label = (b: PIXI.Container) => b.children[1] as PIXI.Text | PIXI.BitmapText
  expect(label(plain)).toBeInstanceOf(PIXI.Text)
  expect(label(gold)).toBeInstanceOf(PIXI.BitmapText)
  expect([label(gold).text, label(gold).x, label(gold).y, gold.interactiveChildren]).toEqual(['go', 40, 15, false])
})

test('a button\'s `baselineOffset` moves its label down that many pixels, its hit area staying the button\'s box', () => {
  const { me, frame } = start()
  frame()
  const low = me.button({ ...me.style('button'), label: 'go', bitmap: true, baselineOffset: 3 } as any)
  const high = me.button({ ...me.style('button'), label: 'go', baselineOffset: -2 } as any)
  expect([low.children[1].x, low.children[1].y, high.children[1].y]).toEqual([40, 18, 13])
  expect(low.hitArea).toEqual(new PIXI.Rectangle(0, 0, 80, 30))
})

test('style hands back a copy, so what an actor writes on it is not the next actor\'s', () => {
  const { me, frame } = start()
  frame()
  const s = me.style('label')
  s.fontSize = 99
  expect(me.style('label').fontSize).toBe(20)
})

// The button's top left is at (10, 10) in `middle`, whose own is at (150, 100), and it is 80 by 30.
const onMiddle = (me: ReturnType<typeof ui>) => {
  const b = shows(me, 'middle', 'go', [10, 10])
  me.show('middle', 'words', () => { const t = new PIXI.Text({ text: 'words', style: me.style('label') }); t.position.set(0, 60); return t })
  return b
}

test('hit finds the interactive thing under a canvas point, and text is not one', () => {
  const { me, frame } = start()
  let b: PIXI.Container | undefined
  frame(() => { b = onMiddle(me) })
  expect(me.hit(200, 125)).toBe(b)
  expect(me.hit(159, 125)).toBe(null)
  expect(me.hit(155, 170)).toBe(null)
  expect(me.hit(5, 5)).toBe(null)
  expect(me.modal()).toBe(undefined)
})

test('the pointer over a thing focuses it and sends it focus; off it, the focus goes and it is sent blur', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  let b: PIXI.Container | undefined
  frame(() => { b = onMiddle(me) })
  const seen: string[] = []
  b!.on('focus', () => seen.push('focus'))
  b!.on('blur', () => seen.push('blur'))
  canvas.on.get('pointermove')!({ offsetX: 200, offsetY: 125 })
  expect(me.focused(b!)).toBe(true)
  canvas.on.get('pointermove')!({ offsetX: 201, offsetY: 126 })
  canvas.on.get('pointermove')!({ offsetX: 5, offsetY: 5 })
  expect(me.focused(b!)).toBe(false)
  canvas.on.get('pointermove')!({ offsetX: 200, offsetY: 125 })
  canvas.on.get('pointerleave')!({})
  expect(seen).toEqual(['focus', 'blur', 'focus', 'blur'])
})

// Four buttons on the modal, whose top left is at (100, 50): a, b and c down the left, and d to the
// right of b. They are shown in that order, so a is the first.
const onMenu = (me: ReturnType<typeof ui>, taps: string[]) => {
  const at: Record<string, [number, number]> = { a: [10, 10], b: [10, 60], c: [10, 110], d: [110, 60] }
  return Object.fromEntries(Object.entries(at).map(([name, xy]) => [name, shows(me, 'menu', name, xy, taps)]))
}

test('a modal that shows anything has the input: the focus on its first thing, `world.ui`\'s focus and press keys, and every key', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  const taps: string[] = []
  let b: Record<string, PIXI.Container> = {}
  frame(() => { b = onMenu(me, taps) })
  expect(me.modal()).toBe('menu')
  const focused = () => Object.keys(b).find(k => me.focused(b[k]))
  expect(focused()).toBe('a')
  const moves = ['ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowDown', 'ArrowUp'].map(k => { press(k); return focused() })
  expect(moves).toEqual(['b', 'd', 'b', 'c', 'c', 'b'])
  const enter = press('Enter')
  expect(me.took(enter)).toBe(true)
  expect(enter.preventDefault).toHaveBeenCalled()
  press(' ')
  expect(taps).toEqual(['b', 'b'])
  // A key the UI does nothing with is still not the game's, and the page keeps its own use of it.
  const w = press('w')
  expect(me.took(w)).toBe(true)
  expect(w.preventDefault).not.toHaveBeenCalled()
  // The player did not open this one — it is up because something shows on it — so the key that
  // opens `pause` changes nothing, and `back` is not the UI's at all: only the game can take this
  // screen down, so the game hears it, and the page keeps its own use of it.
  const escape = press('Escape')
  expect(me.took(escape)).toBe(false)
  expect(escape.preventDefault).not.toHaveBeenCalled()
  const p = press('p')
  expect(me.took(p)).toBe(true)
  expect(focused()).toBe('b')
  expect(me.opened('pause')).toBe(false)
  expect(me.modal()).toBe('menu')
  // A frame that shows nothing on it takes it down, and the keys are the game's again.
  frame()
  expect(b.a.destroyed).toBe(true)
  expect(me.modal()).toBe(undefined)
  expect(me.took(press('ArrowDown'))).toBe(false)
})

// A gamepad's keys reach the UI through `keyDown` and `keyUp`, as `plugins/player` hands them on when
// it plays by actions, and `world.ui` names them as it names a keyboard's: here the d-pad moves the
// focus, the right face button presses, the bottom one backs out, and Select opens `pause`. While the
// player listens for a key to rebind an action to, the UI takes none, from the keyboard or a pad.
test('a gamepad key handed to keyDown is the UI\'s as a keyboard key is, and while the player listens the UI takes no key', () => {
  const pads = { ...world, ui: { ...world.ui, panels: { ...world.ui.panels, pause: { ...world.ui.panels.pause, key: 'Pad8' } }, keys: { up: ['ArrowUp', 'Pad12'], down: ['ArrowDown', 'Pad13'], left: ['ArrowLeft', 'Pad14'], right: ['ArrowRight', 'Pad15'], press: ['Enter', 'Pad1'], back: ['Escape', 'Pad0'] } } }
  const player = { listening: false }
  const { me, frame } = start({ wire: { scene: { prefabs, world: pads }, rows: [] }, player }, surface())
  const taps: string[] = []
  let b: Record<string, PIXI.Container> = {}
  // With no modal up, Select opens `pause`, and a key no panel names is the game's.
  frame()
  expect(me.keyDown('Pad0')).toBe(false)
  expect(me.keyDown('Pad8')).toBe(true)
  me.keyUp('Pad8')
  expect(me.opened('pause')).toBe(true)
  me.dismiss('pause')
  frame(() => { b = onMenu(me, taps) })
  const focused = () => Object.keys(b).find(k => me.focused(b[k]))
  expect(focused()).toBe('a')
  expect(me.keyDown('Pad13')).toBe(true)
  me.keyUp('Pad13')
  expect(focused()).toBe('b')
  expect(me.keyDown('Pad1')).toBe(true)
  me.keyUp('Pad1')
  expect(taps).toEqual(['b'])
  // A pad key the modal names for nothing is still not the game's.
  expect(me.keyDown('Pad9')).toBe(true)
  me.keyUp('Pad9')
  player.listening = true
  expect(me.keyDown('Pad13')).toBe(false)
  me.keyUp('Pad13')
  const down = press('ArrowDown')
  expect(me.took(down)).toBe(false)
  expect(down.preventDefault).not.toHaveBeenCalled()
  expect(focused()).toBe('b')
  player.listening = false
  expect(me.took(press('ArrowDown'))).toBe(true)
  expect(focused()).toBe('c')
})

test('when the thing a modal has focused goes and the modal keeps the input, the focus goes to the first thing it shows', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  let one: PIXI.Container | undefined, next: PIXI.Container | undefined, two: PIXI.Container | undefined
  frame(() => { one = shows(me, 'menu', 'one', [10, 10]); next = shows(me, 'menu', 'next', [10, 60]) })
  press('ArrowDown')
  expect(me.focused(next!)).toBe(true)
  // Another list shown in place of the other: `next` goes, `one` stays first, and `two` comes after it.
  frame(() => { one = shows(me, 'menu', 'one', [10, 10]); two = shows(me, 'menu', 'two', [10, 110]) })
  expect(next!.destroyed).toBe(true)
  expect(me.modal()).toBe('menu')
  expect([me.focused(one!), me.focused(two!)]).toEqual([true, false])
})

test('while a modal shows anything no point reaches what is under it, and its backdrop is no thing to focus', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  let under: PIXI.Container | undefined, a: PIXI.Container | undefined
  // The button on `middle` spans (160, 110) to (240, 140); `a` on the modal spans (110, 60) to (190, 90).
  frame(() => { under = onMiddle(me) })
  expect(me.hit(220, 125)).toBe(under)
  frame(() => { onMiddle(me); a = shows(me, 'menu', 'a', [10, 10]) })
  const backdrop = me.hit(220, 125)
  expect(backdrop).not.toBe(under)
  expect(backdrop).toBeTruthy()
  expect(me.hit(5, 5)).toBe(backdrop)
  expect(me.hit(150, 75)).toBe(a)
  canvas.on.get('pointermove')!({ offsetX: 220, offsetY: 125 })
  expect(me.focused(a!)).toBe(true)
  canvas.on.get('pointerleave')!({})
  expect(me.focused(a!)).toBe(true)
  frame(() => { onMiddle(me) })
  expect(me.hit(220, 125)).toBe(under)
})

test('a modal over a modal has the input, and when it goes the one under it has its focus back', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  const taps: string[] = []
  let b: Record<string, PIXI.Container> = {}
  frame(() => { b = onMenu(me, taps) })
  press('ArrowDown')
  expect(me.focused(b.b)).toBe(true)
  let yes: PIXI.Container | undefined
  // `dialog` spans (100, 120) to (300, 180), over the menu.
  const both = () => { b = onMenu(me, taps); yes = shows(me, 'dialog', 'yes', [10, 15], taps); shows(me, 'dialog', 'no', [110, 15], taps) }
  frame(both)
  expect(me.modal()).toBe('dialog')
  expect(me.focused(yes!)).toBe(true)
  press('Enter')
  expect(taps).toEqual(['yes'])
  // The menu's `a` is under the dialog's backdrop.
  expect(me.hit(150, 75)).not.toBe(b.a)
  frame(() => { b = onMenu(me, taps) })
  expect(me.modal()).toBe('menu')
  expect(me.focused(b.b)).toBe(true)
})

test('a panel the player opens: its key opens it, `back` or its key dismisses it, and open and dismiss do the same from code', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  // The pause menu's actor, which shows it while it is open.
  const pause = () => { if (me.opened('pause')) shows(me, 'pause', 'resume', [10, 10]) }
  frame(pause)
  const p = press('p')
  expect(me.took(p)).toBe(true)
  expect(me.opened('pause')).toBe(true)
  frame(pause)
  expect(me.modal()).toBe('pause')
  press('Escape')
  expect(me.opened('pause')).toBe(false)
  frame(pause)
  expect(me.modal()).toBe(undefined)
  press('p')
  frame(pause)
  press('p')
  expect(me.opened('pause')).toBe(false)
  me.open('pause')
  expect(me.opened('pause')).toBe(true)
  me.dismiss('pause')
  expect(me.opened('pause')).toBe(false)
  // Until a frame has shown nothing on it, it is still up and the keys are still its own.
  expect(me.took(press('q'))).toBe(true)
  frame(pause)
  // With no modal up and no panel of its own, a key is not the UI's.
  expect(me.took(press('q'))).toBe(false)
})

test('`back` backs out of the modal on top: the UI closes a menu the player opened, and on a screen the game put up it is the game\'s key', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  // `menu` is a screen the game puts up, for as long as its actor shows it; `pause`, over it, is a
  // menu the player opens.
  const both = () => { shows(me, 'menu', 'a', [10, 10]); if (me.opened('pause')) shows(me, 'pause', 'resume', [10, 10]) }
  frame(both)
  me.open('pause')
  frame(both)
  expect(me.modal()).toBe('pause')
  const first = press('Escape')
  expect(me.took(first)).toBe(true)
  expect(first.preventDefault).toHaveBeenCalled()
  expect(me.opened('pause')).toBe(false)
  frame(both)
  expect(me.modal()).toBe('menu')
  const second = press('Escape')
  expect(me.took(second)).toBe(false)
  expect(second.preventDefault).not.toHaveBeenCalled()
  frame(both)
  expect(me.modal()).toBe('menu')
})

// A key is let go by its place on the keyboard: `p` held as the pause menu comes up, then let go as
// `P` under Shift, is let go, so the next `p` closes the menu.
test('a key held as a modal came up and let go under Shift is let go, and the next press of it is fresh', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  const pause = () => { if (me.opened('pause')) shows(me, 'pause', 'resume', [10, 10]) }
  const at = (type: 'keydown' | 'keyup', k: string, code: string) => {
    const e = { key: k, code, repeat: false, preventDefault: vi.fn() }
    for (const capture of [true, false]) for (const o of page.filter(o => o.type === type && o.capture === capture)) o.f(e)
  }
  frame(pause)
  at('keydown', 'p', 'KeyP')
  frame(pause)
  expect(me.modal()).toBe('pause')
  at('keydown', 'Shift', 'ShiftLeft')
  at('keyup', 'P', 'KeyP')
  at('keyup', 'Shift', 'ShiftLeft')
  at('keydown', 'p', 'KeyP')
  expect(me.opened('pause')).toBe(false)
})

// A scene of its own keys: w a s d move the focus, e and f press, q backs out, and `m` opens the
// pause menu. The arrows, Enter and Escape are nothing to it, and `m` is the key at KeyM whatever
// it types.
test('every key the UI acts on is `world.ui`\'s, named by its place on the keyboard, and a key it has no name for throws', () => {
  const canvas = surface()
  const { me, plugins, frame } = start({}, canvas)
  const ui = {
    ...world.ui,
    panels: { ...world.ui.panels, pause: { ...world.ui.panels.pause, key: 'm' } },
    keys: { up: 'w', down: 's', left: 'a', right: 'd', press: ['e', 'f'], back: 'q' },
  }
  plugins.wire.scene = { prefabs, world: { ...world, ui } }
  const taps: string[] = []
  let b: Record<string, PIXI.Container> = {}
  frame(() => { b = onMenu(me, taps) })
  const focused = () => Object.keys(b).find(k => me.focused(b[k]))
  for (const k of ['ArrowDown', 'Enter', ' ']) press(k)
  expect([focused(), taps]).toEqual(['a', []])
  const moves = ['s', 'd', 'a', 's', 'w'].map(k => { press(k); return focused() })
  expect(moves).toEqual(['b', 'd', 'b', 'c', 'b'])
  press('e')
  press('f')
  expect(taps).toEqual(['b', 'b'])
  // `q`, not Escape, is the key a screen the game put up leaves to the game.
  expect(me.took(press('Escape'))).toBe(true)
  expect(me.took(press('q'))).toBe(false)
  frame()
  // Typed under Shift, or on a layout where that key types something else, KeyM is still `m`.
  const pause = () => { if (me.opened('pause')) shows(me, 'pause', 'resume', [10, 10]) }
  const at = (type: 'keydown' | 'keyup', k: string, code: string) => {
    const e = { key: k, code, repeat: false, preventDefault: vi.fn() }
    for (const capture of [true, false]) for (const o of page.filter(o => o.type === type && o.capture === capture)) o.f(e)
  }
  at('keydown', 'M', 'KeyM')
  at('keyup', 'M', 'KeyM')
  expect(me.opened('pause')).toBe(true)
  frame(pause)
  press('Escape')
  expect(me.opened('pause')).toBe(true)
  at('keydown', ',', 'KeyM')
  at('keyup', ',', 'KeyM')
  expect(me.opened('pause')).toBe(false)
  frame(pause)
  press('m')
  frame(pause)
  press('q')
  expect(me.opened('pause')).toBe(false)
  frame(pause)
  // A prefab that names no `back` cannot say what a key on a modal does.
  const { back, ...rest } = ui.keys
  plugins.wire.scene = { prefabs, world: { ...world, ui: { ...ui, keys: rest } } }
  frame(() => { onMenu(me, taps) })
  expect(() => press('x')).toThrow('world.ui has no keys.back')
})

// The game's canvas fitted to the window at three CSS pixels a canvas pixel, on a screen of two
// physical pixels a CSS pixel.
test('over a fitted game the UI\'s canvas is as big on the page as the game\'s, drawn at the pixel ratio times its scale, and the pointer reaches its canvas points', async () => {
  vi.stubGlobal('devicePixelRatio', 2)
  try {
    // The page makes the canvas the `engine` prefab's size.
    const canvas = Object.assign(surface(), { width: W, height: H })
    const game = { scale: 3 }
    const { me, frame } = start({ render2d: game })
    me.mount(canvas as any)
    await Promise.resolve()
    const r = renderers.at(-1)!
    expect(canvas.style.width).toBe(`${W}px`)
    let b: PIXI.Container | undefined
    frame(() => { b = onMiddle(me) })
    expect(canvas.style).toMatchObject({ width: `${W * 3}px`, height: `${H * 3}px`, display: '' })
    expect(r.resolution).toBe(6)
    expect(r.resized).toEqual([[W, H, 6]])
    // The button at (160, 110) of the canvas, 80 by 30, is at (480, 330) of the page's box.
    canvas.on.get('pointermove')!({ offsetX: 3 * 200, offsetY: 3 * 125 })
    expect(me.focused(b!)).toBe(true)
    canvas.on.get('pointermove')!({ offsetX: 200, offsetY: 125 })
    expect(me.focused(b!)).toBe(false)
    // Refitted to two CSS pixels a canvas pixel, it follows the frame after; and it asks the
    // renderer nothing while nothing changed.
    frame(() => { onMiddle(me) })
    expect(r.resized).toHaveLength(1)
    game.scale = 2
    frame(() => { onMiddle(me) })
    expect(canvas.style).toMatchObject({ width: `${W * 2}px`, height: `${H * 2}px` })
    expect(r.resized).toEqual([[W, H, 6], [W, H, 4]])
  } finally {
    vi.unstubAllGlobals()
  }
})

test('over a game fitted to the window the UI\'s canvas is the game canvas\'s size, and its panels follow it when it is resized', async () => {
  vi.stubGlobal('devicePixelRatio', 1)
  try {
    const canvas = Object.assign(surface(), { width: W, height: H })
    const game = { scale: 1, size: [1000, 600] }
    const { me, frame } = start({ render2d: game })
    me.mount(canvas as any)
    await Promise.resolve()
    const r = renderers.at(-1)!
    let b: PIXI.Container | undefined
    frame(() => { b = onMiddle(me) })
    expect(canvas.style).toMatchObject({ width: '1000px', height: '600px' })
    expect(r.resized).toEqual([[1000, 600, 1]])
    expect([me.panel('middle').x, me.panel('middle').y]).toEqual([450, 250])
    // The button at (10, 10) of the middle panel is at (460, 260) of the canvas, and the pointer reaches it there.
    canvas.on.get('pointermove')!({ offsetX: 470, offsetY: 270 })
    expect(me.focused(b!)).toBe(true)
    game.size = [800, 400]
    frame(() => { onMiddle(me) })
    expect(canvas.style).toMatchObject({ width: '800px', height: '400px' })
    expect([me.panel('middle').x, me.panel('middle').y]).toEqual([350, 150])
    frame(() => { onMiddle(me) })
    expect(r.resized).toHaveLength(2)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('a thing nobody showed on the newest step is drawn until the clock reaches that step, so a cover handed to a veil on one step leaves no frame bare; one let go on a frame of no step goes at once', () => {
  const { me, plugins, frame } = start()
  const panel = () => me.panel('middle').children.map(c => c.label)
  const box = () => new PIXI.Graphics().rect(0, 0, 10, 10).fill({ color: 0 })
  // step 1, the clock at it: the cover
  Object.assign(plugins.wire, { n: 1, between: 1 })
  frame(() => { me.show('middle', 'cover', box) })
  // step 2, the clock halfway to it: the veil takes over, and the cover is still drawn
  Object.assign(plugins.wire, { n: 2, between: 0.5 })
  frame(() => { me.show('middle', 'veil', box) })
  expect(panel()).toEqual(['cover', 'veil'])
  // the clock at step 2: the cover goes
  Object.assign(plugins.wire, { between: 1 })
  frame(() => { me.show('middle', 'veil', box) })
  expect(panel()).toEqual(['veil'])
  // let go on a frame that took no step: it goes the same frame, wherever the clock is
  Object.assign(plugins.wire, { between: 0.5 })
  frame()
  expect(panel()).toEqual([])
})

test('on a page over render3d the world is covered in black in render3d\'s overlay from the first tick until the frame the UI first draws, and with no page it is never covered', async () => {
  vi.stubGlobal('devicePixelRatio', 1)
  try {
    let fonts = false
    const r3 = { THREE, overlay: { scene: new THREE.Scene() } }
    const canvas = Object.assign(surface(), { width: W, height: H })
    const { me, frame } = start({ render3d: r3, loader: { fonts: () => fonts } })
    me.mount(canvas as any)
    frame()
    // the UI's renderer is not made yet
    expect(r3.overlay.scene.children.map(c => c.name)).toEqual(['ui.cover'])
    await Promise.resolve()
    frame()
    // its fonts are not in yet
    expect(r3.overlay.scene.children.map(c => c.name)).toEqual(['ui.cover'])
    expect(renderers.at(-1)!.drawn).toEqual([])
    fonts = true
    frame()
    expect(renderers.at(-1)!.drawn).toEqual([me.stage])
    expect(r3.overlay.scene.children).toEqual([])
    frame()
    expect(r3.overlay.scene.children).toEqual([])
    const bare = { THREE, overlay: { scene: new THREE.Scene() } }
    start({ render3d: bare }).frame()
    expect(bare.overlay.scene.children).toEqual([])
  } finally {
    vi.unstubAllGlobals()
  }
})

test('while a font of the catalogue is still coming nothing is drawn and the canvas stays hidden, things are shown and hit as ever, and the first frame after it is in is drawn', async () => {
  vi.stubGlobal('devicePixelRatio', 1)
  try {
    const canvas = Object.assign(surface(), { width: W, height: H })
    let fonts = false
    const { me, frame } = start({ loader: { fonts: () => fonts } })
    me.mount(canvas as any)
    await Promise.resolve()
    const r = renderers.at(-1)!
    let b: PIXI.Container | undefined
    frame(() => { b = onMiddle(me) })
    frame(() => { onMiddle(me) })
    expect(canvas.style.display).toBe('none')
    expect(r.drawn).toEqual([])
    expect(me.hit(200, 125)).toBe(b)
    fonts = true
    frame(() => { onMiddle(me) })
    expect(canvas.style.display).toBe('')
    expect(r.drawn).toEqual([me.stage])
  } finally {
    vi.unstubAllGlobals()
  }
})

test('a modal acts only on a key pressed after it came up: one held from before, and every repeat, does nothing until it is let go', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  const taps: string[] = []
  // Enter is held down in the game when the menu comes up, and its repeats go on arriving.
  frame()
  key('keydown', 'Enter')
  frame(() => { onMenu(me, taps) })
  expect(me.took(key('keydown', 'Enter', true))).toBe(true)
  expect(me.took(key('keydown', 'Enter'))).toBe(true)
  expect(taps).toEqual([])
  key('keyup', 'Enter')
  press('Enter')
  expect(taps).toEqual(['a'])
  // A repeat of a key pressed while the menu is up does nothing either.
  key('keydown', 'ArrowDown')
  key('keydown', 'ArrowDown', true)
  key('keydown', 'ArrowDown', true)
  key('keyup', 'ArrowDown')
  press('Enter')
  expect(taps).toEqual(['a', 'b'])
})

test('on a screen the game put up, a fresh `back` is the game\'s, and one held from before or repeated is nobody\'s', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  frame()
  // Escape goes down in the game, and the game's screen comes up the frame after, under it.
  expect(me.took(key('keydown', 'Escape'))).toBe(false)
  frame(() => { onMenu(me, []) })
  expect(me.took(key('keydown', 'Escape', true))).toBe(true)
  key('keyup', 'Escape')
  expect(me.took(press('Escape'))).toBe(false)
  expect(me.took(key('keydown', 'Escape', true))).toBe(true)
})

test('project asks render3d for a world point\'s canvas point through its camera, and pin places a shown thing there with the camera the frame ends with', () => {
  const r = render3d()
  const { me, plugins, frame } = start({ render3d: r })
  plugins.wire.scene = { prefabs: { ...prefabs, render3d: { camera: { fov: 90, near: 0.1, far: 100, at: [0, 0, 0], look: [0, 0, -1] } } }, world }
  r.tick(plugins)
  frame()
  const { x, y, behind } = me.project([0, 0, -5])
  expect(x).toBeCloseTo(W / 2)
  expect(y).toBeCloseTo(H / 2)
  expect(behind).toBe(false)
  // tan(45°) is 1: a point 1 to the right at 5 away is 1/5 of the way to the edge, over an aspect of 4/3.
  expect(me.project([1, 0, -5]).x).toBeCloseTo(W / 2 * (1 + 0.2 / (W / H)))
  expect(me.project([0, 0, 5]).behind).toBe(true)
  let plate: PIXI.Text | undefined
  // The camera moves 1 to the right after the plate is pinned, as the seat's own actor moves it
  // after the rows of the level have ticked; the plate is placed by where the camera ends up.
  frame(() => {
    plate = me.show('tl', 'plate', () => new PIXI.Text({ text: 'seat 2', style: me.style('label') }))
    me.pin(plate, [0, 0, -5])
    r.camera!.position.x = 1
  })
  expect(plate!.x + 10).toBeCloseTo(W / 2 * (1 - 0.2 / (W / H)))
  expect(plate!.y + 20).toBeCloseTo(H / 2)
  expect(plate!.visible).toBe(true)
  frame(() => { me.pin(me.show('tl', 'plate', () => new PIXI.Text()), [0, 0, 5]) })
  expect(plate!.visible).toBe(false)
  const flat = start()
  flat.frame()
  expect(() => flat.me.project([0, 0, 0])).toThrow('ui.project needs render3d or render2d, and this scene names neither')
})

test('in a flat scene project asks render2d, and pin places a shown thing where its world point is drawn', () => {
  const r = render2d()
  const { me, plugins, frame } = start({ render2d: r })
  plugins.wire.scene = { prefabs, world: { ...world, render2d: { ground: [[32, 16], [-32, 16]], up: [0, -32], zoom: 2, look: [1, 1], layers: ['floor'] } } }
  r.tick(plugins)
  frame()
  expect(me.project([1, 1])).toEqual({ x: W / 2, y: H / 2, behind: false })
  let plate: PIXI.Text | undefined
  frame(() => {
    plate = me.show('tl', 'plate', () => new PIXI.Text({ text: 'imp', style: me.style('label') }))
    me.pin(plate, [2, 1, 0.5])
    r.look([2, 1])
  })
  const at = r.project([2, 1, 0.5])
  r.afterTick()
  const [px, py] = r.place([2, 1, 0.5])
  expect(at).toEqual({ x: r.world!.position.x + px * 2, y: r.world!.position.y + py * 2, behind: false })
  expect([plate!.x + 10, plate!.y + 20]).toEqual([at.x, at.y])
  expect(plate!.visible).toBe(true)
})

test('close removes every listener it added and destroys everything it drew', () => {
  const canvas = surface()
  const { me, frame } = start({}, canvas)
  const before = page.length
  let b: PIXI.Container | undefined
  frame(() => { b = onMiddle(me) })
  expect(page.length).toBe(before + 2)
  expect([...canvas.on.keys()].sort()).toEqual(['pointerleave', 'pointermove'])
  me.close()
  expect(page.length).toBe(before)
  expect([...canvas.on.keys()]).toEqual([])
  expect(b!.destroyed).toBe(true)
  expect(me.stage.destroyed).toBe(true)
})

// The page, for the canvas the UI makes for its surfaces.
const page2d = () => {
  const made: { width: number; height: number; style: Record<string, string> }[] = []
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      expect(tag).toBe('canvas')
      const c = { width: 0, height: 0, style: {} }
      made.push(c)
      return c
    },
  })
  return made
}

test('on a page the surfaces asked in a frame are drawn side by side along the top of one canvas of their own by a renderer of their own, each its size times its scale at the UI\'s pixel ratio on its own colour, and each hands back that canvas and its box on it', async () => {
  vi.stubGlobal('devicePixelRatio', 2)
  const made = page2d()
  try {
    const canvas = Object.assign(surface(), { width: W, height: H })
    const { me, frame } = start({}, canvas)
    me.mount(canvas as any)
    await Promise.resolve()
    const [main, surfacer] = renderers.slice(-2)
    expect(made).toHaveLength(1)
    expect((surfacer as any).canvas).toBe(made[0])
    let scope: any, tr: any
    for (let f = 0; f < 3; f++) {
      main.drawn.length = 0
      surfacer.drawn.length = 0
      frame(() => { scope = me.surface('scope'); tr = me.surface('tr'); shows(me, 'scope', 'b', [5, 5]) })
      // Only the stage on the UI's canvas.
      expect(main.drawn).toEqual([me.stage])
      // `tr`, 100 by 50, listed before `scope`, 60 by 40 at a scale of 2, both at a pixel ratio of 2,
      // a pixel apart.
      expect([tr.canvas, scope.canvas]).toEqual([made[0], made[0]])
      expect(tr.box).toEqual([0, 0, 200, 100])
      expect(scope.box).toEqual([201, 0, 240, 160])
      expect(surfacer.screen).toEqual({ width: 442 / 2, height: 80 })
      expect(surfacer.resolution).toBe(2)
      const [grounds, first, second] = surfacer.drawn
      expect(surfacer.drawn).toHaveLength(3)
      expect(grounds.clearColor).toEqual([0, 0, 0, 1])
      // Each on its own colour: `tr` gives none, so black, and `scope` its `screen`.
      const fills = (grounds.container as PIXI.Graphics).context.instructions.filter(i => i.action === 'fill') as any[]
      expect(fills.map(i => i.data.style.color)).toEqual([0, 0x123456])
      expect([first.container, first.clear]).toEqual([me.panel('tr'), false])
      expect([first.transform.a, first.transform.tx]).toEqual([1, 0])
      expect([second.container, second.clear]).toEqual([me.panel('scope'), false])
      expect([second.transform.a, second.transform.d, second.transform.tx, second.transform.ty]).toEqual([2, 2, 100.5, 0])
    }
    // The same object each frame.
    frame(() => { expect(me.surface('scope')).toBe(scope); me.surface('tr') })
    // The first frame nobody asks, nothing is drawn on the surfaces' canvas and the panels are back.
    surfacer.drawn.length = 0
    frame(() => { shows(me, 'scope', 'b', [5, 5]) })
    expect(surfacer.drawn).toEqual([])
    expect(me.stage.children).toContain(me.panel('scope'))
  } finally {
    vi.unstubAllGlobals()
  }
})

test('a modal, or a panel with no size, is never drawn on a surface', () => {
  const { me, frame } = start()
  frame(() => {
    expect(() => me.surface('menu')).toThrow('ui panel menu is a modal, which is never drawn on a surface')
    expect(() => me.surface('bare')).toThrow('ui panel bare is drawn on a surface but has no size')
  })
})
