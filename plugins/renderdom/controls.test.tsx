// The controls kit on a jsdom page, through a real renderdom framed by hand as a client would. jsdom
// lays nothing out, so where a part's surface lies on the page is given to it, and it has no pointer
// capture, which is stood in for as a browser gives it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { renderdom, type Renderdom } from './renderdom.plugin.ts'
import { ARC, DOUBLE, FINE, TRAVEL, WHEEL, controls, fraction, knobSize, segmentWidths, switchWidth, valueAt, type Gesture } from './controls.ts'

const scene = { prefabs: { engine: { width: 800, height: 450 } } }
const plugins = { wire: { n: 0, ack: 0, rows: [], home: '', scene, send: () => 0 } } as unknown as Plugins

let dom: Renderdom
let now = 0
beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 450, configurable: true })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  now = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  dom = renderdom()
})
afterEach(() => {
  dom.close()
  vi.restoreAllMocks()
})

const frame = (draw: (kit: ReturnType<typeof controls>) => void) => {
  dom.tick(plugins)
  dom.panel('rack', [0, 0, 800, 450])
  draw(controls(dom))
  dom.afterTick()
}
const find = (key: string) => dom.root!.querySelector(`[data-key="${key}"]`) as HTMLElement
// Every surface lies at the page's origin: its points are then the pointer's own.
const at0 = (el: Element) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, x: 0, y: 0, right: 0, bottom: 0, toJSON() { return this } }) as DOMRect
  return el
}
const pointer = (el: Element, type: string, init: PointerEventInit) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init }))
const wheel = (el: Element, deltaY: number, shiftKey = false) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY, shiftKey }))

// A caller holding one value, as a studio holds a param: each change written back, each gesture
// counted.
const holding = (start: number) => {
  const s = { value: start, changes: [] as number[], begun: 0, ended: 0 }
  const gesture: Gesture = { begin: () => s.begun++, end: () => s.ended++ }
  const onChange = (v: number) => { s.value = v; s.changes.push(v) }
  return { s, gesture, onChange }
}

const knob = (h: ReturnType<typeof holding>, o: { range?: [number, number]; log?: boolean; step?: number; reset?: number } = {}) =>
  frame(kit => kit.knob('rack', 'cutoff', {
    at: [100, 40],
    label: 'Cutoff',
    value: h.s.value,
    range: o.range ?? [0, 100],
    log: o.log,
    step: o.step,
    reset: o.reset ?? 50,
    shown: v => v.toFixed(1),
    accent: '#b7a4ff',
    onChange: h.onChange,
    gesture: h.gesture,
  }))

describe('knob', () => {
  it('changes by the fraction of its travel it is dragged up, and down', () => {
    const h = holding(50)
    knob(h)
    const dial = at0(find('cutoff:dial'))
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 10, clientY: 100 })
    pointer(dial, 'pointermove', { buttons: 1, clientX: 10, clientY: 100 - TRAVEL * 0.2 })
    expect(h.s.value).toBeCloseTo(70, 10)
    knob(h)
    pointer(dial, 'pointermove', { buttons: 1, clientX: 10, clientY: 100 + TRAVEL * 0.5 })
    expect(h.s.value).toBeCloseTo(0, 10) // clamped at the least: 0.2 up, then 0.7 down from there
    knob(h)
    pointer(dial, 'pointermove', { buttons: 1, clientX: 10, clientY: 100 + TRAVEL * 0.5 - TRAVEL * 0.25 })
    expect(h.s.value).toBeCloseTo(25, 10)
    pointer(dial, 'pointerup', { button: 0, clientX: 10, clientY: 0 })
  })

  it('drags fine with Shift held', () => {
    const h = holding(50)
    knob(h)
    const dial = at0(find('cutoff:dial'))
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 10, clientY: 100 })
    pointer(dial, 'pointermove', { buttons: 1, clientX: 10, clientY: 100 - TRAVEL * 0.2, shiftKey: true })
    expect(h.s.value).toBeCloseTo(50 + 100 * 0.2 * FINE, 10)
    // Letting Shift go goes on from there, with no jump.
    pointer(dial, 'pointermove', { buttons: 1, clientX: 10, clientY: 100 - TRAVEL * 0.3 })
    expect(h.s.value).toBeCloseTo(50 + 100 * 0.2 * FINE + 10, 10)
    pointer(dial, 'pointerup', { button: 0, clientX: 10, clientY: 0 })
  })

  it('drags a log range by ratio and a stepped one by whole steps', () => {
    const h = holding(20)
    knob(h, { range: [20, 20000], log: true, reset: 1000 })
    const dial = at0(find('cutoff:dial'))
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 0, clientY: 200 })
    pointer(dial, 'pointermove', { buttons: 1, clientX: 0, clientY: 200 - TRAVEL / 3 })
    expect(h.s.value).toBeCloseTo(200, 6)
    pointer(dial, 'pointerup', { button: 0, clientX: 0, clientY: 0 })
    const stepped = holding(1)
    dom.close()
    dom = renderdom()
    knob(stepped, { range: [1, 32], step: 1, reset: 1 })
    const d2 = at0(find('cutoff:dial'))
    pointer(d2, 'pointerdown', { button: 0, buttons: 1, clientX: 0, clientY: 200 })
    pointer(d2, 'pointermove', { buttons: 1, clientX: 0, clientY: 200 - TRAVEL * 0.5 })
    expect(stepped.s.value).toBe(17) // 1 + 31 × 0.5 = 16.5, to the whole step
    pointer(d2, 'pointerup', { button: 0, clientX: 0, clientY: 0 })
  })

  it('resets on a double click, as one gesture', () => {
    const h = holding(80)
    knob(h, { reset: 50 })
    const dial = at0(find('cutoff:dial'))
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    pointer(dial, 'pointerup', { button: 0, clientX: 5, clientY: 5 })
    expect(h.s.changes).toEqual([])
    now += DOUBLE - 50
    knob(h, { reset: 50 })
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    pointer(dial, 'pointerup', { button: 0, clientX: 5, clientY: 5 })
    expect(h.s.changes).toEqual([50])
    expect([h.s.begun, h.s.ended]).toEqual([1, 1])
  })

  it('takes two presses further apart than a double click as two clicks', () => {
    const h = holding(80)
    knob(h, { reset: 50 })
    const dial = at0(find('cutoff:dial'))
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    pointer(dial, 'pointerup', { button: 0, clientX: 5, clientY: 5 })
    now += DOUBLE + 50
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    pointer(dial, 'pointerup', { button: 0, clientX: 5, clientY: 5 })
    expect(h.s.changes).toEqual([])
    expect(h.s.begun).toBe(0)
  })

  it('steps with the wheel, each notch one gesture', () => {
    const h = holding(50)
    knob(h)
    const dial = at0(find('cutoff:dial'))
    wheel(dial, -100)
    expect(h.s.value).toBeCloseTo(50 + 100 * WHEEL, 10)
    knob(h)
    wheel(dial, 100)
    knob(h)
    wheel(dial, 100)
    expect(h.s.value).toBeCloseTo(50 - 100 * WHEEL, 10)
    knob(h)
    wheel(dial, -100, true)
    expect(h.s.value).toBeCloseTo(50 - 100 * WHEEL + 100 * WHEEL * FINE, 10)
    expect([h.s.begun, h.s.ended]).toEqual([4, 4])
    const stepped = holding(5)
    knob(stepped, { range: [1, 32], step: 1 })
    wheel(dial, -100)
    knob(stepped, { range: [1, 32], step: 1 })
    wheel(dial, -100)
    expect(stepped.s.changes).toEqual([6, 7])
  })

  it('hands one gesture for one drag, however many changes it makes, and none for a drag that changes nothing', () => {
    const h = holding(50)
    knob(h)
    const dial = at0(find('cutoff:dial'))
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 10, clientY: 100 })
    for (let y = 99; y > 60; y--) {
      pointer(dial, 'pointermove', { buttons: 1, clientX: 10, clientY: y })
      knob(h)
    }
    expect(h.s.begun).toBe(1)
    expect(h.s.ended).toBe(0)
    pointer(dial, 'pointerup', { button: 0, clientX: 10, clientY: 60 })
    expect([h.s.begun, h.s.ended]).toEqual([1, 1])
    expect(h.s.changes.length).toBe(39)
    now += DOUBLE * 2
    pointer(dial, 'pointerdown', { button: 0, buttons: 1, clientX: 10, clientY: 100 })
    pointer(dial, 'pointermove', { buttons: 1, clientX: 30, clientY: 100 })
    pointer(dial, 'pointerup', { button: 0, clientX: 30, clientY: 100 })
    expect([h.s.begun, h.s.ended]).toEqual([1, 1])
  })

  it('draws its ring’s arc for its value, in its accent, and writes the value under it', () => {
    const h = holding(25)
    knob(h)
    const el = find('cutoff')
    const ring = el.querySelector('.rd-ring') as HTMLElement
    expect(ring.style.getPropertyValue('--arc')).toBe(`${0.25 * ARC}deg`)
    expect(el.style.getPropertyValue('--accent')).toBe('#b7a4ff')
    expect(el.querySelector('.rd-value')!.textContent).toBe('25.0')
    expect(el.querySelector('.rd-label')!.textContent).toBe('Cutoff')
    expect(el.style.left).toBe('100px')
    h.s.value = 100
    knob(h)
    expect(ring.style.getPropertyValue('--arc')).toBe(`${ARC}deg`)
    const log = holding(Math.sqrt(20 * 20000))
    knob(log, { range: [20, 20000], log: true })
    expect(parseFloat(ring.style.getPropertyValue('--arc'))).toBeCloseTo(ARC / 2, 6)
    const sheet = [...dom.root!.querySelectorAll('style')].map(s => s.textContent).join('')
    expect(sheet).toContain('conic-gradient(from 225deg, var(--accent) 0deg var(--arc)')
  })

  it('draws a dial of the size it is asked for, and takes drags over that dial', () => {
    expect(knobSize()).toEqual([56, 60])
    expect(knobSize(60)).toEqual([72, 84])
    expect(knobSize(24)).toEqual([40, 48])
    const h = holding(0)
    frame(kit => kit.knob('rack', 'big', { at: [10, 20], label: 'Cutoff', value: h.s.value, range: [0, 100], reset: 0, shown: String, accent: '#fff', dial: 60, onChange: h.onChange, gesture: h.gesture }))
    const el = find('big')
    expect([el.style.width, el.style.height]).toEqual(['72px', '84px'])
    const ring = el.querySelector('.rd-ring') as HTMLElement
    expect([ring.style.left, ring.style.top, ring.style.width, ring.style.height]).toEqual(['6px', '12px', '60px', '60px'])
    expect((el.querySelector('.rd-value') as HTMLElement).style.top).toBe('72px')
    const dial = find('big:dial')
    expect([dial.style.left, dial.style.top, dial.style.width, dial.style.height]).toEqual(['16px', '32px', '60px', '60px'])
  })

  it('is taken away the first frame it is not asked for', () => {
    const h = holding(50)
    knob(h)
    const el = find('cutoff'), dial = find('cutoff:dial')
    frame(() => {})
    expect(el.isConnected).toBe(false)
    expect(dial.isConnected).toBe(false)
  })
})

describe('fraction and valueAt', () => {
  it('map a range both ways, by ratio when log, to whole steps when stepped', () => {
    expect(fraction({ range: [0, 10] }, 2.5)).toBe(0.25)
    expect(fraction({ range: [0, 10] }, 20)).toBe(1)
    expect(fraction({ range: [10, 1000], log: true }, 100)).toBeCloseTo(0.5, 12)
    expect(valueAt({ range: [10, 1000], log: true }, 0.5)).toBeCloseTo(100, 10)
    expect(valueAt({ range: [0, 1], step: 0.1 }, 0.33)).toBe(0.3)
    expect(valueAt({ range: [0, 10] }, -1)).toBe(0)
  })
})

describe('switch', () => {
  it('lights the option that is on and picks another as one gesture', () => {
    const h = { on: 'legato', picks: [] as string[], begun: 0, ended: 0 }
    const draw = () => frame(kit => kit.switch('rack', 'glide', {
      at: [10, 10],
      width: 150,
      label: 'Glide',
      options: ['off', 'legato', 'on'],
      on: h.on,
      onPick: o => { h.on = o; h.picks.push(o) },
      gesture: { begin: () => h.begun++, end: () => h.ended++ },
    }))
    draw()
    const segs = [...find('glide').querySelectorAll('.rd-segment')]
    expect(segs.map(s => s.textContent)).toEqual(['off', 'legato', 'on'])
    expect(segs.map(s => s.classList.contains('rd-on'))).toEqual([false, true, false])
    const row = at0(find('glide:row'))
    // Each segment as wide as its label needs (42, 64 and 36), the 6 spare shared out: 44, 66 and 38,
    // ending at 45, 111 and 149 past the row's left border.
    expect(segs.map(s => (s as HTMLElement).style.width)).toEqual(['44px', '66px', '38px'])
    pointer(row, 'pointerdown', { button: 0, buttons: 1, clientX: 120, clientY: 5 })
    pointer(row, 'pointerup', { button: 0, clientX: 120, clientY: 5 })
    draw()
    expect(h.picks).toEqual(['on'])
    expect(segs.map(s => s.classList.contains('rd-on'))).toEqual([false, false, true])
    pointer(row, 'pointerdown', { button: 0, buttons: 1, clientX: 140, clientY: 5 })
    pointer(row, 'pointerup', { button: 0, clientX: 140, clientY: 5 })
    expect(h.picks).toEqual(['on'])
    expect([h.begun, h.ended]).toEqual([1, 1])
    // A press just inside the second segment picks it, and just before it, the first.
    pointer(row, 'pointerdown', { button: 0, buttons: 1, clientX: 45, clientY: 5 })
    pointer(row, 'pointerup', { button: 0, clientX: 45, clientY: 5 })
    draw()
    pointer(row, 'pointerdown', { button: 0, buttons: 1, clientX: 44, clientY: 5 })
    pointer(row, 'pointerup', { button: 0, clientX: 44, clientY: 5 })
    expect(h.picks).toEqual(['on', 'legato', 'off'])
  })

  it('needs room for every label, and refuses a width under it', () => {
    // Each segment: 5 px padding each side, an 8 px LED, a 3 px gap, 7 px a letter, and a 1 px border
    // after the first; the row's two borders.
    expect(switchWidth(['ON', 'BYPASS'])).toBe(2 + 35 + 64)
    expect(segmentWidths(['ON', 'BYPASS'], 101)).toEqual([35, 64])
    expect(segmentWidths(['A', 'B'], 102)).toEqual([49, 51])
    expect(() => frame(kit => kit.switch('rack', 'state', { at: [0, 0], width: 90, label: 'State', options: ['ON', 'BYPASS'], on: 'ON', onPick() {}, gesture: { begin() {}, end() {} } })))
      .toThrow('switch rack/state is 90 wide: its labels ON, BYPASS need 101')
  })
})

describe('button, led and lcd', () => {
  it('presses a button when let go over it, not when dragged off it, and lights its LED', () => {
    let pressed = 0
    const draw = (lit: boolean) => frame(kit => kit.button('rack', 'save', { at: [0, 0], size: [40, 16], label: 'Save', lit, accent: '#7fe0c0', onPress: () => pressed++ }))
    draw(false)
    const el = find('save'), s = at0(find('save:press'))
    expect(el.querySelector('.rd-led')!.classList.contains('rd-on')).toBe(false)
    pointer(s, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    expect(el.classList.contains('rd-down')).toBe(true)
    pointer(s, 'pointerup', { button: 0, clientX: 5, clientY: 5 })
    expect(pressed).toBe(1)
    pointer(s, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    pointer(s, 'pointerup', { button: 0, clientX: 60, clientY: 5 })
    expect(pressed).toBe(1)
    expect(el.classList.contains('rd-down')).toBe(false)
    draw(true)
    expect(el.querySelector('.rd-led')!.classList.contains('rd-on')).toBe(true)
    expect(el.textContent).toBe('Save')
  })

  it('lights an LED while on, and writes an LCD’s lines', () => {
    const draw = (on: boolean, lines: string[]) => frame(kit => {
      kit.led('rack', 'gate', { at: [4, 4], on, accent: '#e2e86a' })
      kit.lcd('rack', 'patch', { at: [20, 4], size: [120, 32], lines })
    })
    draw(false, ['01 FAT BASS'])
    expect(find('gate').classList.contains('rd-on')).toBe(false)
    expect(find('patch').textContent).toBe('01 FAT BASS')
    draw(true, ['02 SYNC LEAD', 'MONARCH'])
    expect(find('gate').classList.contains('rd-on')).toBe(true)
    expect(find('gate').style.getPropertyValue('--accent')).toBe('#e2e86a')
    expect(find('patch').textContent).toBe('02 SYNC LEAD\nMONARCH')
  })
})

describe('fader', () => {
  it('goes from the least to the most over its track, places its cap and resets on a double click', () => {
    const h = holding(0)
    const draw = () => frame(kit => kit.fader('rack', 'gain', {
      at: [300, 20], height: 200, label: 'Level', value: h.s.value, range: [-60, 6], reset: 0, shown: v => `${v.toFixed(1)} dB`, accent: '#8cc8ff', onChange: h.onChange, gesture: h.gesture,
    }))
    draw()
    const travel = 200 - 12 - 14 - 12
    const el = find('gain'), track = at0(find('gain:track'))
    expect(el.querySelector('.rd-value')!.textContent).toBe('0.0 dB')
    expect((el.querySelector('.rd-handle') as HTMLElement).style.top).toBe(`${12 + (1 - 60 / 66) * travel}px`)
    pointer(track, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 100 })
    pointer(track, 'pointermove', { buttons: 1, clientX: 5, clientY: 100 + travel * 0.5 })
    pointer(track, 'pointerup', { button: 0, clientX: 5, clientY: 100 + travel * 0.5 })
    expect(h.s.value).toBeCloseTo(-33, 10)
    draw()
    expect(parseFloat((el.querySelector('.rd-handle') as HTMLElement).style.top)).toBeCloseTo(12 + (1 - 27 / 66) * travel, 6)
    now += DOUBLE * 2
    pointer(track, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    pointer(track, 'pointerup', { button: 0, clientX: 5, clientY: 5 })
    now += 100
    pointer(track, 'pointerdown', { button: 0, buttons: 1, clientX: 5, clientY: 5 })
    pointer(track, 'pointerup', { button: 0, clientX: 5, clientY: 5 })
    expect(h.s.value).toBe(0)
    expect([h.s.begun, h.s.ended]).toEqual([2, 2])
  })
})

describe('meter', () => {
  it('fills to the level it is fed each frame and holds its peak, then lets it fall', () => {
    const draw = (level: number) => frame(kit => kit.meter('rack', 'out', { at: [0, 0], size: [8, 68], level }))
    draw(-6)
    const el = find('out'), fill = el.querySelector('.rd-fill') as HTMLElement, peak = el.querySelector('.rd-peak') as HTMLElement
    const inner = 66
    expect(fill.style.height).toBe(`${(54 / 66) * inner}px`)
    now += 500
    draw(-30)
    expect(fill.style.height).toBe(`${(30 / 66) * inner}px`)
    expect(peak.style.top).toBe(`${(1 - 54 / 66) * inner}px`)
    now += 1500 // 2 s after the peak: held 1.5 s, then 0.5 s falling 20 dB a second
    draw(-30)
    expect(parseFloat(peak.style.top)).toBeCloseTo((1 - 44 / 66) * inner, 10)
    draw(-80)
    expect(fill.style.height).toBe('0px')
  })
})

describe('module', () => {
  it('is the bevelled box with its title along the top and an LED when lit is given', () => {
    const draw = (lit: boolean | undefined) => frame(kit => kit.module('rack', 'filter', { box: [10, 20, 200, 120], title: 'Filter', lit, accent: '#ffb38a' }))
    draw(undefined)
    const el = find('filter'), led = el.querySelector('.rd-led') as HTMLElement
    expect(el.classList.contains('rd-module')).toBe(true)
    expect(el.querySelector('.rd-header')!.textContent).toBe('Filter')
    expect([el.style.left, el.style.top, el.style.width, el.style.height]).toEqual(['10px', '20px', '200px', '120px'])
    expect(led.hidden).toBe(true)
    draw(true)
    expect(led.hidden).toBe(false)
    expect(led.classList.contains('rd-on')).toBe(true)
    draw(false)
    expect(led.classList.contains('rd-on')).toBe(false)
  })

  it('lies under the controls shown after it', () => {
    frame(kit => {
      kit.module('rack', 'filter', { box: [0, 0, 200, 120], title: 'Filter' })
      kit.led('rack', 'gate', { at: [4, 4], on: true, accent: '#fff' })
    })
    const keys = [...find('filter').parentElement!.children].map(c => (c as HTMLElement).dataset.key)
    expect(keys.indexOf('filter')).toBeLessThan(keys.indexOf('gate'))
  })
})
