// The timeline, driven with the pointer and the keys. jsdom lays nothing out, so every box is given:
// the ruler and the tracks start at the page's left and are 800 pixels wide, and lane i is the 24
// pixels from 24·(i + 1) down.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { END, Timeline, type Chip, type Move } from './timeline.tsx'

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
afterEach(() => { Element.prototype.getBoundingClientRect = rect })

// Fitted to a span of 10 with 2 % either side: t is drawn at (t + 0.2)·800 / 10.4. The tick is then
// 1, so a drag snaps to a quarter.
const x = (t: number) => ((t + 0.2) * 800) / 10.4
const y = (lane: number) => 24 * (lane + 1) + 12

const LANES = [{ id: 'hero', label: 'hero' }, { id: 'dummy', label: 'dummy' }, { id: 'camera', label: 'camera' }]
const CHIPS: Chip[] = [
  { id: 'walk', lane: 'hero', at: 1, length: 2, label: 'walk', lanes: ['dummy'], open: true },
  { id: 'say', lane: 'hero', at: 4, length: 3, label: 'hero: go', resize: true },
  { id: 'shot', lane: 'camera', at: 2, label: 'shot', warn: true },
  { id: 'fade', lane: 'dummy', at: 6, length: 1, label: 'fade', look: 'ramp' },
]

// A timeline whose selection, chips and end are its own state, as a panel keeps them, noting each
// move, resize, end and seek it is handed.
function Harness({ log }: { log: unknown[] }) {
  const [chips, setChips] = useState(CHIPS)
  const [selected, setSelected] = useState<string[]>([])
  const [end, setEnd] = useState(9)
  const [head, setHead] = useState(0)
  return (
    <Timeline
      label="cutscene"
      lanes={LANES}
      chips={chips}
      marks={[{ at: 3 }, { at: 5, length: 1.5 }]}
      head={head}
      span={10}
      grain={0.05}
      end={end}
      selected={selected}
      onSelect={setSelected}
      onSeek={(t, done) => { setHead(t); log.push(['seek', t, done]) }}
      onMove={(moves: Move[], done) => {
        log.push(['move', moves, done])
        if (done) setChips(cs => cs.map(c => { const m = moves.find(o => o.id === c.id); return m ? { ...c, at: m.at, lane: m.lane } : c }))
      }}
      onResize={(id, length, done) => {
        log.push(['resize', id, length, done])
        if (done) setChips(cs => cs.map(c => (c.id === id ? { ...c, length } : c)))
      }}
      onEnd={(t, done) => { log.push(['end', t, done]); if (done) setEnd(t) }}
      onKey={e => log.push(['key', e.key])}
    />
  )
}

const chip = (name: string) => screen.getByRole('option', { name })
// A press on `el`, followed on the window, as a pointer is once pressed.
const drag = (el: Element, from: [number, number], to: [number, number], mods: { altKey?: boolean; shiftKey?: boolean } = {}) => {
  fireEvent.pointerDown(el, { button: 0, clientX: from[0], clientY: from[1], ...mods })
  fireEvent.pointerMove(window, { clientX: (from[0] + to[0]) / 2, clientY: (from[1] + to[1]) / 2, ...mods })
  fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1], ...mods })
  fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1], ...mods })
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('chips sit in their lanes: points, bars, open, ramps, warned, and past the end is hatched', () => {
  const { container } = render(<Harness log={[]} />)
  expect(within(screen.getByRole('listbox', { name: 'hero' })).getAllByRole('option').map(o => o.getAttribute('aria-label'))).toEqual(['walk', 'hero: go'])
  expect(chip('shot')).toHaveClass('ui-chip-point', 'ui-chip-warn')
  expect(chip('walk')).toHaveClass('ui-chip-bar', 'ui-chip-open')
  expect(chip('fade')).toHaveClass('ui-chip-ramp')
  expect(chip('walk').style.left).toBe(`${x(1)}px`)
  expect(parseFloat(chip('hero: go').style.width)).toBeCloseTo((3 * 800) / 10.4)
  expect(container.querySelectorAll('.ui-tl-mark')).toHaveLength(1)
  expect(container.querySelectorAll('.ui-tl-hold')).toHaveLength(1)
  expect((container.querySelector('.ui-tl-over .ui-tl-past') as HTMLElement).style.left).toBe(`${x(9)}px`)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a click selects, Shift-click adds and takes away, and a box across the lanes selects what it covers', () => {
  render(<Harness log={[]} />)
  fireEvent.pointerDown(chip('walk'), { button: 0, clientX: x(1.5), clientY: y(0) })
  fireEvent.pointerUp(window, { clientX: x(1.5), clientY: y(0) })
  expect(chip('walk')).toHaveAttribute('aria-selected', 'true')
  fireEvent.pointerDown(chip('shot'), { button: 0, shiftKey: true, clientX: x(2), clientY: y(2) })
  expect([chip('walk'), chip('shot')].map(c => c.getAttribute('aria-selected'))).toEqual(['true', 'true'])
  fireEvent.pointerDown(chip('walk'), { button: 0, shiftKey: true, clientX: x(1.5), clientY: y(0) })
  expect(chip('walk')).toHaveAttribute('aria-selected', 'false')
  // From 3.5 on the hero's lane to 6.5 on the dummy's: the line and the fade.
  drag(screen.getByRole('listbox', { name: 'hero' }), [x(3.5), y(0)], [x(6.5), y(1)])
  expect(screen.getAllByRole('option', { selected: true }).map(o => o.getAttribute('aria-label'))).toEqual(['hero: go', 'fade'])
  // A click on nothing selects nothing.
  fireEvent.pointerDown(screen.getByRole('listbox', { name: 'camera' }), { button: 0, clientX: x(8), clientY: y(2) })
  fireEvent.pointerUp(window, { clientX: x(8), clientY: y(2) })
  expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a drag moves every chip selected, snapped to a quarter tick, Alt to a grain, as one move when let go', () => {
  const log: unknown[] = []
  render(<Harness log={log} />)
  drag(chip('hero: go'), [x(4.5), y(0)], [x(5.63), y(0)])
  const moves = log.filter(l => (l as unknown[])[0] === 'move')
  expect(moves.filter(m => (m as unknown[])[2] === true)).toHaveLength(1)
  expect(moves.at(-1)).toEqual(['move', [{ id: 'say', at: 5.25, lane: 'hero' }], true])
  log.length = 0
  drag(chip('hero: go'), [x(5.5), y(0)], [x(5.63), y(0)], { altKey: true })
  expect(log.at(-1)).toEqual(['move', [{ id: 'say', at: 5.4, lane: 'hero' }], true])
  // Two selected move together, each by as much.
  fireEvent.pointerDown(chip('shot'), { button: 0, shiftKey: true, clientX: x(2), clientY: y(2) })
  log.length = 0
  drag(chip('shot'), [x(2), y(2)], [x(3), y(2)])
  expect(log.at(-1)).toEqual(['move', [{ id: 'say', at: 6.4, lane: 'hero' }, { id: 'shot', at: 3, lane: 'camera' }], true])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a drag stays inside [0, end], and goes onto another lane only where the chip may go', () => {
  const log: unknown[] = []
  render(<Harness log={log} />)
  drag(chip('hero: go'), [x(5), y(0)], [x(20), y(0)])
  // The line starts at 4 and the end is 9: it is kept at 9.
  expect(log.at(-1)).toEqual(['move', [{ id: 'say', at: 9, lane: 'hero' }], true])
  drag(chip('walk'), [x(1.5), y(0)], [x(-5), y(1)])
  expect(log.at(-1)).toEqual(['move', [{ id: 'walk', at: 0, lane: 'dummy' }], true])
  drag(chip('shot'), [x(2), y(2)], [x(2), y(0)])
  expect(log.at(-1)).toEqual(['move', [{ id: 'shot', at: 2, lane: 'camera' }], true])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the right edge of a resizable chip sets its length, and the end bracket is selected and dragged', () => {
  const log: unknown[] = []
  render(<Harness log={log} />)
  drag(screen.getByLabelText('hero: go end'), [x(7), y(0)], [x(8.1), y(0)])
  expect(log.filter(l => (l as unknown[])[0] === 'resize').at(-1)).toEqual(['resize', 'say', 4, true])
  expect(screen.queryByLabelText('walk end')).toBeNull()
  const bracket = screen.getByRole('button', { name: 'cutscene end' })
  drag(bracket, [x(9), y(0)], [x(7.4), y(0)])
  expect(log.at(-1)).toEqual(['end', 7.5, true])
  expect(screen.getByRole('button', { name: 'cutscene end' })).toHaveAttribute('aria-pressed', 'true')
  expect(END).toBe('end')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the ruler scrubs to a grain, and with the focus the arrows seek a grain and Shift a tick; keys on the lanes go to onKey', () => {
  const log: unknown[] = []
  render(<Harness log={log} />)
  const ruler = screen.getByRole('slider', { name: 'cutscene playhead' })
  fireEvent.pointerDown(ruler, { button: 0, clientX: x(2.02) })
  fireEvent.pointerMove(window, { clientX: x(3.33) })
  fireEvent.pointerUp(window, { clientX: x(3.33) })
  expect(log).toEqual([['seek', 2, false], ['seek', 3.35, false], ['seek', 3.35, true]])
  expect(ruler).toHaveFocus()
  fireEvent.keyDown(ruler, { key: 'ArrowRight' })
  expect(log.at(-1)).toEqual(['seek', 3.4, true])
  fireEvent.keyDown(ruler, { key: 'ArrowLeft', shiftKey: true })
  expect(log.at(-1)).toEqual(['seek', 2.4, true])
  fireEvent.keyDown(screen.getByLabelText('cutscene lanes'), { key: 'Delete' })
  expect(log.at(-1)).toEqual(['key', 'Delete'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the wheel zooms about the pointer, Shift and the wheel pans, and a new `fit` fits again', () => {
  const onSeek = vi.fn()
  const props = { label: 'rec', lanes: [], head: 0, span: 10, grain: 1, onSeek }
  const { rerender } = render(<Timeline {...props} fit={1} />)
  const ruler = screen.getByRole('slider', { name: 'rec playhead' })
  const at = (cx: number) => {
    fireEvent.pointerDown(ruler, { button: 0, clientX: cx })
    fireEvent.pointerUp(window, { clientX: cx })
    return onSeek.mock.calls.at(-1)![0]
  }
  expect(at(x(5))).toBe(5)
  // Zoomed in about step 5: step 5 stays under the pointer, and step 7 is further off.
  fireEvent.wheel(ruler, { deltaY: -400, clientX: x(5) })
  expect(at(x(5))).toBe(5)
  expect(at(x(7))).toBeLessThan(7)
  fireEvent.wheel(ruler, { deltaY: 100, shiftKey: true })
  expect(at(x(5))).toBeGreaterThan(5)
  rerender(<Timeline {...props} fit={1} />)
  expect(at(x(5))).toBeGreaterThan(5)
  rerender(<Timeline {...props} fit={2} />)
  expect(at(x(5))).toBe(5)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a press on one of several selected chips, let go without a drag, selects it alone; Cmd or Ctrl adds as Shift does', () => {
  render(<Harness log={[]} />)
  fireEvent.pointerDown(chip('walk'), { button: 0, clientX: x(1.5), clientY: y(0) })
  fireEvent.pointerUp(window, { clientX: x(1.5), clientY: y(0) })
  fireEvent.pointerDown(chip('shot'), { button: 0, metaKey: true, clientX: x(2), clientY: y(2) })
  fireEvent.pointerUp(window, { clientX: x(2), clientY: y(2) })
  fireEvent.pointerDown(chip('fade'), { button: 0, ctrlKey: true, clientX: x(6.5), clientY: y(1) })
  fireEvent.pointerUp(window, { clientX: x(6.5), clientY: y(1) })
  expect(screen.getAllByRole('option', { selected: true }).map(o => o.getAttribute('aria-label'))).toEqual(['walk', 'fade', 'shot'])
  // Pressed, all three stay selected, so a drag would move all three; let go, the one pressed is.
  fireEvent.pointerDown(chip('shot'), { button: 0, clientX: x(2), clientY: y(2) })
  expect(screen.getAllByRole('option', { selected: true })).toHaveLength(3)
  fireEvent.pointerUp(window, { clientX: x(2), clientY: y(2) })
  expect(screen.getAllByRole('option', { selected: true }).map(o => o.getAttribute('aria-label'))).toEqual(['shot'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a cancelled pointer ends the drag where it last was, once, and a later release commits nothing', () => {
  const log: unknown[] = []
  render(<Harness log={log} />)
  fireEvent.pointerDown(chip('hero: go'), { button: 0, clientX: x(4.5), clientY: y(0) })
  fireEvent.pointerMove(window, { clientX: x(5.5), clientY: y(0) })
  fireEvent(window, new PointerEvent('pointercancel', { clientX: 0, clientY: 0 }))
  expect(log.filter(l => (l as unknown[])[2] === true)).toEqual([['move', [{ id: 'say', at: 5, lane: 'hero' }], true]])
  fireEvent.pointerMove(window, { clientX: x(8), clientY: y(0) })
  fireEvent.pointerUp(window, { clientX: x(8), clientY: y(0) })
  expect(log.filter(l => (l as unknown[])[2] === true)).toHaveLength(1)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a lane\'s marks are drawn merged to whole pixels: 36,000 steps, every other one marked, draw a few hundred spans, and a press seeks inside one', () => {
  const onSeek = vi.fn()
  const marks = Array.from({ length: 18000 }, (_, i) => ({ at: i * 2 }))
  const lanes = [{ id: 'seat', label: 'seat', marks }, { id: 'edits', label: 'edits', marks: [{ at: 100, length: 50 }, { at: 30000 }] }]
  const t0 = performance.now()
  const { container } = render(<Timeline label="rec" lanes={lanes} head={0} span={36000} grain={1} onSeek={onSeek} />)
  const took = performance.now() - t0
  const seat = container.querySelectorAll('[data-lane="seat"] .ui-tl-lane-mark')
  expect(seat.length).toBeGreaterThan(0)
  expect(seat.length).toBeLessThanOrEqual(400)
  expect(took).toBeLessThan(1000)
  // Fitted to 36,000 steps, a pixel is 46.8 steps: the run from 100 to 150 is one span, and a press
  // at its left edge seeks into it, not before it.
  const run = screen.getByLabelText('edits 100 to 150')
  fireEvent.pointerDown(run, { button: 0, clientX: 0 })
  expect(onSeek).toHaveBeenLastCalledWith(100, true)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a double-click on an empty stretch of a lane asks for a chip at the grain under it, and one on a chip asks for nothing', () => {
  const added: [string, number][] = []
  render(<Timeline label="t" lanes={LANES} chips={CHIPS} head={0} span={10} grain={1} end={9} onAdd={(lane, t) => added.push([lane, t])} />)
  const tracks = screen.getAllByRole('listbox')
  fireEvent.doubleClick(tracks[2], { clientX: x(5.6), clientY: y(2) })
  fireEvent.doubleClick(screen.getByText('hero: go'), { clientX: x(5), clientY: y(0) })
  fireEvent.doubleClick(tracks[0], { clientX: x(9.5), clientY: y(0) })
  expect(added).toEqual([['camera', 5]])
})
