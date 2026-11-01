// @vitest-environment jsdom
// The cutscene panel's timeline, driven with the pointer and the keys. jsdom lays nothing out, so every box
// is given, as the editor's timeline test gives them: the ruler and the tracks start at the page's left
// and are 800 pixels wide, and lane i is the 24 pixels from 24·(i + 1) down. jsdom has no pointer
// events and observes no size, so a pointer event is a mouse event here and nothing is observed.
import { afterEach, beforeEach, expect, test } from 'vitest'
import { END, tickOf, timeline, type Chip, type Move, type Props } from './cutscene.timeline.ts'

class Pointer extends MouseEvent {}
globalThis.PointerEvent ??= Pointer as unknown as typeof PointerEvent
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

let rect: typeof Element.prototype.getBoundingClientRect
beforeEach(() => {
  rect = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const lane = this.getAttribute('data-lane')
    const i = lane === null ? -1 : [...this.parentElement!.querySelectorAll('[data-lane]')].indexOf(this)
    const top = i < 0 ? 0 : 24 * (i + 1)
    return { left: 0, top, width: 800, height: 24, right: 800, bottom: top + 24, x: 0, y: top, toJSON() {} } as DOMRect
  }
})
afterEach(() => {
  Element.prototype.getBoundingClientRect = rect
  document.body.replaceChildren()
})

// Fitted to a span of 10 with 2 % either side: t is drawn at (t + 0.2)·800 / 10.4. The tick is then
// 1, so a drag snaps to a quarter.
const x = (t: number) => ((t + 0.2) * 800) / 10.4
const y = (lane: number) => 24 * (lane + 1) + 12

const LANES = [{ id: 'hero', label: 'hero' }, { id: 'dummy', label: 'dummy' }, { id: 'camera', label: 'camera', marks: [{ at: 3 }, { at: 3.01 }, { at: 7 }], tone: 'fail' }]
const CHIPS: Chip[] = [
  { id: 'walk', lane: 'hero', at: 1, length: 2, label: 'walk', lanes: ['dummy'], open: true },
  { id: 'say', lane: 'hero', at: 4, length: 3, label: 'hero: go', resize: true },
  { id: 'shot', lane: 'camera', at: 2, label: 'shot', warn: true },
  { id: 'fade', lane: 'dummy', at: 6, length: 1, label: 'fade', look: 'ramp' },
]

// A timeline whose selection, chips, end and playhead are its caller's, as the panel keeps them,
// noting each move, resize, end, seek and key it is handed.
function harness() {
  const root = document.createElement('div')
  document.body.append(root)
  const log: unknown[] = []
  const tl = timeline(root)
  let props: Props
  const set = (more: Partial<Props>) => { props = { ...props, ...more }; tl.set(props) }
  props = {
    label: 'cues', lanes: LANES, chips: CHIPS, marks: [{ at: 3 }, { at: 5, length: 1.5 }], head: 0, span: 10, grain: 0.05, end: 9, selected: [],
    onSelect: ids => { log.push(['select', ids]); set({ selected: ids }) },
    onSeek: (t, done) => { log.push(['seek', t, done]); set({ head: t }) },
    onMove: (moves: Move[], done) => {
      log.push(['move', moves, done])
      if (done) set({ chips: props.chips!.map(c => { const m = moves.find(o => o.id === c.id); return m ? { ...c, at: m.at, lane: m.lane } : c }) })
    },
    onResize: (id, length, done) => { log.push(['resize', id, length, done]); if (done) set({ chips: props.chips!.map(c => (c.id === id ? { ...c, length } : c)) }) },
    onEnd: (t, done) => { log.push(['end', t, done]); if (done) set({ end: t }) },
    onKey: e => log.push(['key', e.key]),
  }
  tl.set(props)
  return { root, log, set, tl }
}

const fire = (on: EventTarget, type: string, init: MouseEventInit) => on.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, ...init }))
const chip = (root: HTMLElement, label: string) => root.querySelector<HTMLElement>(`[role=option][aria-label="${label}"]`)!
// A press on `el`, followed on the window, as a pointer is once pressed.
const drag = (el: Element, from: [number, number], to: [number, number], mods: MouseEventInit = {}) => {
  fire(el, 'pointerdown', { clientX: from[0], clientY: from[1], ...mods })
  fire(window, 'pointermove', { clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2, ...mods })
  fire(window, 'pointermove', { clientX: to[0], clientY: to[1], ...mods })
  fire(window, 'pointerup', { clientX: to[0], clientY: to[1], ...mods })
}

test('the tick is a round number at least a thumb apart', () => {
  expect(tickOf(800 / 10.4, 0.05)).toBe(1)
  expect(tickOf(8, 0.05)).toBe(10)
  expect(tickOf(10000, 0.05)).toBe(0.05)
})

test('chips sit in their lanes, points and bars where their times are; the ruler\'s ticks, a hold, past the end hatched, and a lane\'s marks merged and toned', () => {
  const { root } = harness()
  const track = (name: string) => root.querySelector(`[role=listbox][aria-label="${name}"]`)!
  expect([...track('hero').querySelectorAll('[role=option]')].map(o => o.getAttribute('aria-label'))).toEqual(['walk', 'hero: go'])
  expect(chip(root, 'walk').className).toBe('ui-chip ui-chip-bar ui-chip-open')
  expect(parseFloat(chip(root, 'walk').style.left)).toBeCloseTo(x(1), 9)
  expect(parseFloat(chip(root, 'walk').style.width)).toBeCloseTo((2 * 800) / 10.4, 9)
  expect(chip(root, 'shot').className).toBe('ui-chip ui-chip-point ui-chip-warn')
  expect(chip(root, 'fade').className).toBe('ui-chip ui-chip-ramp')
  expect(chip(root, 'hero: go').querySelector('[aria-label="hero: go end"]')).not.toBeNull()
  expect([...root.querySelectorAll('.ui-tl-tick')].map(t => t.textContent)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  expect(root.querySelector('.ui-tl-mark')).not.toBeNull()
  expect(parseFloat(root.querySelector<HTMLElement>('.ui-tl-hold')!.style.width)).toBeCloseTo((1.5 * 800) / 10.4, 9)
  expect(root.querySelectorAll('.ui-tl-past')).toHaveLength(2)
  // 3 and 3.01 are a pixel apart, one mark; 7 another.
  const marks = [...track('camera').querySelectorAll<HTMLElement>('.ui-tl-lane-mark')]
  expect(marks.map(m => [m.className, m.dataset.from, m.dataset.to])).toEqual([['ui-tl-lane-mark fail', '3', '3.01'], ['ui-tl-lane-mark fail', '7', '7']])
})

test('the ruler scrubs: seeks while pressed and once, done, when let go, a grain at a time; ← and → there seek a grain, and with Shift a tick', () => {
  const { root, log } = harness()
  const ruler = root.querySelector('[role=slider]')!
  drag(ruler, [x(2), 5], [x(3.333), 5])
  expect(log).toEqual([['seek', 2, false], ['seek', 2.65, false], ['seek', 3.35, false], ['seek', 3.35, true]])
  log.length = 0
  const r = root.querySelector('[role=slider]')!
  r.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  root.querySelector('[role=slider]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
  expect(log).toEqual([['seek', 3.4, true], ['seek', 4.4, true]])
})

test('a click selects a chip alone, Shift adds one and takes it away; a press on empty lanes then let go selects none', () => {
  const { root, log } = harness()
  fire(chip(root, 'walk'), 'pointerdown', { clientX: x(1.5), clientY: y(0) })
  fire(window, 'pointerup', { clientX: x(1.5), clientY: y(0) })
  fire(chip(root, 'shot'), 'pointerdown', { clientX: x(2), clientY: y(2), shiftKey: true })
  fire(window, 'pointerup', { clientX: x(2), clientY: y(2) })
  fire(chip(root, 'walk'), 'pointerdown', { clientX: x(1.5), clientY: y(0), metaKey: true })
  fire(window, 'pointerup', { clientX: x(1.5), clientY: y(0) })
  expect(log).toEqual([['select', ['walk']], ['select', ['walk', 'shot']], ['select', ['shot']]])
  expect(chip(root, 'shot').getAttribute('aria-selected')).toBe('true')
  log.length = 0
  const track = root.querySelector('[role=listbox][aria-label=dummy]')!
  fire(track, 'pointerdown', { clientX: x(8), clientY: y(1) })
  fire(window, 'pointerup', { clientX: x(8), clientY: y(1) })
  expect(log).toEqual([['select', []]])
})

test('a chip dragged moves, snapped to a quarter tick, onto a lane it may go to, done once on release; with Alt to a grain; kept inside the end', () => {
  const { root, log } = harness()
  drag(chip(root, 'walk'), [x(1.5), y(0)], [x(2.6), y(1)])
  const moves = log.filter(l => (l as unknown[])[0] === 'move') as [string, Move[], boolean][]
  expect(moves.at(-1)).toEqual(['move', [{ id: 'walk', at: 2, lane: 'dummy' }], true])
  expect(moves.filter(m => m[2])).toHaveLength(1)
  expect(chip(root, 'walk').closest('[data-lane]')!.getAttribute('data-lane')).toBe('dummy')
  log.length = 0
  // The say may go onto no other lane: it stays on its own, and Alt snaps to a grain.
  drag(chip(root, 'hero: go'), [x(5), y(0)], [x(6.31), y(1)], { altKey: true })
  expect(log.at(-1)).toEqual(['move', [{ id: 'say', at: 5.3, lane: 'hero' }], true])
  log.length = 0
  drag(chip(root, 'hero: go'), [x(6), y(0)], [x(10), y(0)])
  expect(log.at(-1)).toEqual(['move', [{ id: 'say', at: 9, lane: 'hero' }], true])
})

test('a chip\'s right edge sets its length; the end bracket is dragged and selected; a box across lanes selects what it holds', () => {
  const { root, log } = harness()
  drag(root.querySelector('[aria-label="hero: go end"]')!, [x(7), y(0)], [x(8.1), y(0)])
  expect(log.slice(0, 1)).toEqual([['select', ['say']]])
  expect(log.at(-1)).toEqual(['resize', 'say', 4, true])
  log.length = 0
  drag(root.querySelector('[role=button][aria-label="cues end"]')!, [x(9), 30], [x(7.4), 30])
  expect(log[0]).toEqual(['select', [END]])
  expect(log.at(-1)).toEqual(['end', 7.5, true])
  expect(root.querySelector('.ui-tl-end')!.className).toBe('ui-tl-end ui-selected')
  log.length = 0
  // From 0.5 to 6.5 over every lane: the walk, the say it reaches into, the shot and the fade.
  drag(root.querySelector('[role=listbox][aria-label=hero]')!, [x(0.5), y(0) - 6], [x(6.5), y(2)])
  expect(log).toEqual([['select', ['walk', 'say', 'shot', 'fade']]])
})

test('keys on the lanes go to the caller; a press on a lane\'s mark seeks inside it', () => {
  const { root, log } = harness()
  root.querySelector('.ui-tl-body')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
  fire(root.querySelector('.ui-tl-lane-mark')!, 'pointerdown', { clientX: x(5), clientY: y(2) })
  expect(log).toEqual([['key', 'Delete'], ['seek', 3.01, true]])
})

test('a playhead that moves alone moves its marks and draws nothing else again; a change of anything else draws it all again', () => {
  const { root, set } = harness()
  const walk = chip(root, 'walk')
  set({ head: 4 })
  expect(chip(root, 'walk')).toBe(walk)
  expect(parseFloat(root.querySelector<HTMLElement>('.ui-tl-playhead')!.style.left)).toBeCloseTo(x(4), 9)
  expect(parseFloat(root.querySelector<HTMLElement>('.ui-tl-head-mark')!.style.left)).toBeCloseTo(x(4), 9)
  expect(root.querySelector('[role=slider]')!.getAttribute('aria-valuenow')).toBe('4')
  set({ selected: ['walk'] })
  expect(chip(root, 'walk')).not.toBe(walk)
  expect(chip(root, 'walk').className).toContain('ui-selected')
})
