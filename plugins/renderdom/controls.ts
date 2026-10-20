// The controls kit: the parts every faceplate, rack and mixer is drawn from, built on renderdom's
// `show` and `surface`, so each part keeps the contract of a shown thing (made the first frame it is
// asked for, kept while asked for every frame, taken away the first frame it is not) and every
// pointer reaches it through renderdom. `controls(dom)` hands back the parts for one renderdom,
// putting the kit's stylesheet and its three fonts on the page once (`style`, `fonts`): Michroma for
// names, Silkscreen for labels, Share Tech Mono for values, on the chassis's silver.
//
// Every part is placed in its panel's units, `at` its top left, and each draws the same way every
// frame from what it is handed: a value it is handed is what it shows, and an edit is handed to the
// caller's `onChange` or `onPick`, never kept in the part. A part's own memory (a drag under way, a
// meter's held peak) lives on its element, which goes when the part does.
//
// One gesture, one step of undo. Every part that edits takes the caller's `gesture`, `{ begin, end }`.
// A drag calls `begin` before its first change and `end` when it is let go, however many changes lie
// between; a drag that changes nothing calls neither. A double click's reset, a wheel's step and a
// pick are each a gesture of one change.
//
// The parts. Each hands back its element. A part made of more than one shown thing shows them under
// `key` and keys of its own after it, `<key>:<part>`, so a key is never two of them.
//   knob(panel, key, { at, label, value, range, log, step, reset, shown, accent, dial, onChange, gesture, onMenu })
//       A dial `dial` across (`DIAL` when left out; `knobSize(dial)` is the whole knob's size) with
//       its label over it and `shown(value)` under it, the value's arc lit in `accent`
//       round a ring of `ARC` degrees, a `conic-gradient` from its lower left. Dragged up and down:
//       `TRAVEL` units of drag go from the least of `range` to the most, `FINE` of that with Shift
//       held. `log` spaces the range by ratio, so each doubling is as far as every other (`range`
//       above 0). `step` keeps the value to whole steps from the least. A double click (two presses
//       within `DOUBLE` ms) sets it to `reset`. The wheel steps it: one `step`, or `WHEEL` of the way,
//       `FINE` of that with Shift held. The right button anywhere on it calls `onMenu`, when given.
//   switch(panel, key, { at, width, label, options, on, onPick, gesture })
//       A segmented row of `options`, `width` units across, `on` lit with an LED. Each segment is as
//       wide as its label needs (`segmentWidths`), with the room over that shared out evenly; a
//       `width` under `switchWidth(options)` throws, since a label would run past its segment. A
//       press on another option picks it.
//   button(panel, key, { at, size, label, lit, accent, onPress })
//       A key-cap that is pressed while held and calls `onPress` when let go over it. With `lit` it
//       carries an LED, lit in `accent` while `lit` is true.
//   led(panel, key, { at, on, accent })   a lamp, lit in `accent` while `on`.
//   lcd(panel, key, { at, size, lines })  the green screen, a line of text per entry of `lines`.
//   fader(panel, key, { at, height, label, value, range, log, step, reset, shown, accent, onChange, gesture, onMenu })
//       A vertical fader `height` units tall: its cap travels the track, `shown(value)` under it,
//       dragged, double clicked, wheeled and right-pressed as a knob is, the whole track from the least
//       to the most.
//   meter(panel, key, { at, size, level })
//       A bar fed a level each frame in dBFS, filled from `FLOOR` dB to `CEIL` dB, red over 0 dB,
//       with the highest level of the last `HOLD` seconds held as a line that then falls `FALL` dB a
//       second.
//   module(panel, key, { box, title, lit, accent })
//       The bevelled box a faceplate's controls sit in, its title in the pixel font along its top, and,
//       when `lit` is given, an LED beside the title lit in `accent` while `lit` is true. It is shown
//       before the controls on it, so they lie over it.
import type { Box, Hands, Mods, Renderdom } from './renderdom.plugin.ts'

export type Gesture = { begin(): void; end(): void }
type At = [number, number]

// Drag: units of drag from the least to the most, the part of that a Shift drag goes, and the part
// of the way a wheel's notch goes.
export const TRAVEL = 150
export const FINE = 0.1
export const WHEEL = 0.01
// The longest gap between two presses of a double click, in ms.
export const DOUBLE = 300
// The degrees a knob's ring sweeps, from its lower left round to its lower right.
export const ARC = 270
// A meter's range in dBFS, how long it holds a peak in seconds, and how fast the peak then falls, in
// dB a second.
export const FLOOR = -60
export const CEIL = 6
export const HOLD = 1.5
export const FALL = 20

// A knob's size: its width, the label's height over the dial, the dial's diameter, the value's
// height under it.
const KNOB_W = 56
const LABEL_H = 12
const DIAL = 36
const VALUE_H = 12
// A fader's width, its cap's height, and the label's and value's heights.
const FADER_W = 28
const CAP_H = 14
// A switch's height, a module's header's height, an LED's diameter.
const SWITCH_H = 16
const HEADER_H = 16
const LED_D = 8
// A switch's segment: the padding at each side, the gap between its LED and its label, and the
// widest a label's letter is drawn (Silkscreen at 8px: W and M are 7 px, most letters 5 or 6).
export const SEG_PAD = 5
const SEG_GAP = 3
const SEG_CHAR = 7

const FONTS = 'https://fonts.googleapis.com/css2?family=Michroma&family=Share+Tech+Mono&family=Silkscreen&display=swap'

const CSS = `
& {
--ground: #c9ced5;
--face: #e3e6ea;
--light: #f7f8fa;
--shade: #9aa1aa;
--ink: #2b3036;
--soft: #5d646d;
--lcd-ink: #b8f2d8;
--lcd: #1c2626;
--off: #8a9099;
font-family: 'Share Tech Mono', monospace;
color: var(--ink);
}
.rd-name { font-family: 'Michroma', sans-serif; }
.rd-label { font-family: 'Silkscreen', monospace; font-size: 8px; line-height: ${LABEL_H}px; text-transform: uppercase; color: var(--soft); text-align: center; white-space: nowrap; }
.rd-value { font-family: 'Share Tech Mono', monospace; font-size: 11px; line-height: ${VALUE_H}px; text-align: center; white-space: nowrap; }
.rd-module { position: absolute; box-sizing: border-box; background: var(--face); border: 1px solid; border-color: var(--light) var(--shade) var(--shade) var(--light); }
.rd-header { position: absolute; left: 0; right: 0; top: 0; height: ${HEADER_H}px; box-sizing: border-box; padding: 0 6px; display: flex; align-items: center; gap: 5px; border-bottom: 1px solid var(--shade); font-family: 'Silkscreen', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
.rd-knob { position: absolute; width: ${KNOB_W}px; height: ${LABEL_H + DIAL + VALUE_H}px; }
.rd-knob .rd-label { position: absolute; left: 0; right: 0; top: 0; }
.rd-ring { position: absolute; top: ${LABEL_H}px; left: ${(KNOB_W - DIAL) / 2}px; width: ${DIAL}px; height: ${DIAL}px; border-radius: 50%;
  background: conic-gradient(from ${180 + (360 - ARC) / 2}deg, var(--accent) 0deg var(--arc), var(--shade) var(--arc) ${ARC}deg, transparent ${ARC}deg 360deg); }
.rd-cap { position: absolute; inset: 4px; border-radius: 50%; background: var(--face); border: 1px solid; border-color: var(--light) var(--shade) var(--shade) var(--light); box-sizing: border-box; }
.rd-pointer { position: absolute; left: 50%; top: 2px; width: 2px; margin-left: -1px; height: 9px; background: var(--ink); transform-origin: 1px ${DIAL / 2 - 6}px; }
.rd-knob .rd-value { position: absolute; left: 0; right: 0; top: ${LABEL_H + DIAL}px; }
.rd-switch { position: absolute; height: ${LABEL_H + SWITCH_H}px; }
.rd-switch .rd-label { text-align: left; }
.rd-segments { display: flex; height: ${SWITCH_H}px; box-sizing: border-box; border: 1px solid; border-color: var(--shade) var(--light) var(--light) var(--shade); background: var(--ground); }
.rd-segment { flex: none; box-sizing: border-box; padding: 0 ${SEG_PAD}px; white-space: nowrap; display: flex; align-items: center; justify-content: center; gap: 3px; font-family: 'Silkscreen', monospace; font-size: 8px; text-transform: uppercase; color: var(--soft); }
.rd-segment + .rd-segment { border-left: 1px solid var(--shade); }
.rd-segment.rd-on { background: var(--face); color: var(--ink); }
.rd-led { width: ${LED_D}px; height: ${LED_D}px; border-radius: 50%; box-sizing: border-box; border: 1px solid var(--shade); background: var(--off); flex: none; }
.rd-led.rd-on { background: var(--accent); box-shadow: 0 0 4px var(--accent); }
.rd-lamp { position: absolute; }
.rd-button { position: absolute; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 4px; background: var(--face); border: 1px solid; border-color: var(--light) var(--shade) var(--shade) var(--light); font-family: 'Silkscreen', monospace; font-size: 8px; text-transform: uppercase; }
.rd-button.rd-down { border-color: var(--shade) var(--light) var(--light) var(--shade); background: var(--ground); }
.rd-lcd { position: absolute; box-sizing: border-box; padding: 2px 5px; background: var(--lcd); color: var(--lcd-ink); border: 1px solid; border-color: var(--shade) var(--light) var(--light) var(--shade); font-family: 'Share Tech Mono', monospace; font-size: 15px; line-height: 18px; padding: 3px 10px; white-space: pre; overflow: hidden; }
.rd-fader { position: absolute; width: ${FADER_W}px; }
.rd-fader .rd-label { position: absolute; left: -6px; right: -6px; top: 0; }
.rd-track { position: absolute; left: ${FADER_W / 2 - 2}px; width: 4px; top: ${LABEL_H + CAP_H / 2}px; background: var(--ink); border: 1px solid; border-color: var(--shade) var(--light) var(--light) var(--shade); box-sizing: border-box; }
.rd-handle { position: absolute; left: 2px; right: 2px; height: ${CAP_H}px; box-sizing: border-box; background: var(--face); border: 1px solid; border-color: var(--light) var(--shade) var(--shade) var(--light); }
.rd-handle::after { content: ''; position: absolute; left: 3px; right: 3px; top: ${CAP_H / 2 - 1.5}px; height: 1px; background: var(--accent); }
.rd-fader .rd-value { position: absolute; left: -10px; right: -10px; }
.rd-meter { position: absolute; box-sizing: border-box; background: var(--lcd); border: 1px solid; border-color: var(--shade) var(--light) var(--light) var(--shade); overflow: hidden; }
.rd-fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(to top, #6fd29b 0%, #6fd29b ${(-FLOOR / (CEIL - FLOOR)) * 100 * 0.8}%, #e8d36a ${(-FLOOR / (CEIL - FLOOR)) * 100}%, #ef6a5a ${(-FLOOR / (CEIL - FLOOR)) * 100}%, #ef6a5a 100%); background-size: 100% var(--full); background-position: bottom; }
.rd-peak { position: absolute; left: 0; right: 0; height: 1px; background: var(--lcd-ink); }
`

// The width a segment needs for its label: its padding, its LED, the gap and the label's letters at
// their widest, and the border it draws between itself and the segment before it.
const segmentNeeds = (name: string, first: boolean) => SEG_PAD * 2 + LED_D + SEG_GAP + name.length * SEG_CHAR + (first ? 0 : 1)

// The least width a switch of `options` takes with every label inside its segment, the row's two
// borders with them: what a layout gives a switch at the least.
export function switchWidth(options: readonly string[]): number {
  return 2 + options.reduce((a, name, i) => a + segmentNeeds(name, i === 0), 0)
}

// Each segment's width in a switch `width` across: what its label needs, and the room over that
// shared out evenly, the last taking what does not divide.
export function segmentWidths(options: readonly string[], width: number): number[] {
  const needs = options.map((name, i) => segmentNeeds(name, i === 0))
  const spare = Math.max(0, width - 2 - needs.reduce((a, b) => a + b, 0))
  const each = Math.floor(spare / options.length)
  return needs.map((n, i) => n + each + (i === options.length - 1 ? spare - each * options.length : 0))
}

// What a dragged, wheeled and double-clicked value is handed.
type Valued = {
  value: number
  range: [number, number]
  log?: boolean
  step?: number
  reset: number
  onChange(v: number): void
  gesture: Gesture
}

// A dragged part's memory: the drag under way (the fraction it has reached, the last point's y, and
// whether it has begun its gesture), and when the last press that did not drag went down.
type Held = { drag?: { f: number; y: number; v: number; begun: boolean }; pressed?: number }

const clamp = (f: number) => Math.min(1, Math.max(0, f))

// Where a value lies along its range, 0 to 1, and the value at a fraction of its range, kept to its
// steps.
export function fraction(o: Pick<Valued, 'range' | 'log'>, v: number): number {
  const [lo, hi] = o.range
  return clamp(o.log ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo))
}
export function valueAt(o: Pick<Valued, 'range' | 'log' | 'step'>, f: number): number {
  const [lo, hi] = o.range
  const v = o.log ? lo * Math.pow(hi / lo, clamp(f)) : lo + (hi - lo) * clamp(f)
  if (!o.step) return v
  return Math.min(hi, Math.max(lo, Number((lo + Math.round((v - lo) / o.step) * o.step).toFixed(10))))
}

// The hands of a part dragged up for more, `travel` units from the least to the most.
function dragging(held: Held, o: Valued, travel: number): Hands {
  const once = (v: number) => {
    if (v === o.value) return
    o.gesture.begin()
    o.onChange(v)
    o.gesture.end()
  }
  return {
    down(_x, y) {
      const now = performance.now()
      if (held.pressed !== undefined && now - held.pressed <= DOUBLE) {
        held.pressed = undefined
        held.drag = undefined
        once(o.reset)
        return
      }
      held.pressed = now
      held.drag = { f: fraction(o, o.value), y, v: o.value, begun: false }
    },
    move(_x, y, mods: Mods) {
      const d = held.drag
      if (!d) return
      d.f = clamp(d.f + ((d.y - y) / travel) * (mods.shift ? FINE : 1))
      d.y = y
      const v = valueAt(o, d.f)
      if (v === d.v) return
      d.v = v
      held.pressed = undefined
      if (!d.begun) {
        d.begun = true
        o.gesture.begin()
      }
      o.onChange(v)
    },
    up() {
      const d = held.drag
      held.drag = undefined
      if (d?.begun) o.gesture.end()
    },
    wheel(_x, _y, mods, _dx, dy) {
      if (dy === 0) return
      const way = dy < 0 ? 1 : -1
      if (o.step) once(Math.min(o.range[1], Math.max(o.range[0], Number((o.value + way * o.step).toFixed(10)))))
      else once(valueAt(o, fraction(o, o.value) + way * WHEEL * (mods.shift ? FINE : 1)))
    },
  }
}

const div = (dom: Renderdom, cls: string, parent?: HTMLElement) => {
  const el = dom.root!.ownerDocument.createElement('div')
  el.className = cls
  parent?.appendChild(el)
  return el
}
const text = (el: HTMLElement, s: string) => { if (el.textContent !== s) el.textContent = s }
const toggle = (el: HTMLElement, cls: string, on: boolean) => { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on) }
const prop = (el: HTMLElement, name: string, v: string) => { if (el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v) }
const put = (el: HTMLElement, [x, y]: At) => {
  if (el.style.left !== `${x}px`) el.style.left = `${x}px`
  if (el.style.top !== `${y}px`) el.style.top = `${y}px`
}
const sized = (el: HTMLElement, [w, h]: [number, number]) => {
  if (el.style.width !== `${w}px`) el.style.width = `${w}px`
  if (el.style.height !== `${h}px`) el.style.height = `${h}px`
}

// The right button on a knob or a fader, its dial or track and its label and value: `onMenu`, when
// given, called with the page's own menu kept closed.
type Menu = { onMenu?(): void }
const menu = (o: Menu): Pick<Hands, 'menu'> => (o.onMenu ? { menu: () => o.onMenu!() } : {})

// `dial` is the dial's diameter, `DIAL` when left out.
export type KnobOptions = Valued & Menu & { at: At; label: string; shown(v: number): string; accent: string; dial?: number }

// The size a knob takes: `KNOB_W` wide with the kit's own dial, else as wide as its dial and a margin
// each side, 40 at the least, so its label and value fit; as tall as its label, dial and value.
export function knobSize(dial?: number): [number, number] {
  if (dial === undefined) return [KNOB_W, LABEL_H + DIAL + VALUE_H]
  return [Math.max(40, dial + 12), LABEL_H + dial + VALUE_H]
}
export type SwitchOptions = { at: At; width: number; label: string; options: string[]; on: string; onPick(o: string): void; gesture: Gesture }
export type ButtonOptions = { at: At; size: [number, number]; label: string; lit?: boolean; accent?: string; onPress(): void }
export type LedOptions = { at: At; on: boolean; accent: string }
export type LcdOptions = { at: At; size: [number, number]; lines: string[] }
export type FaderOptions = Valued & Menu & { at: At; height: number; label: string; shown(v: number): string; accent: string }
export type MeterOptions = { at: At; size: [number, number]; level: number }
export type ModuleOptions = { box: Box; title: string; lit?: boolean; accent?: string }

type Knob = HTMLDivElement & { held: Held; ring: HTMLDivElement; pointer: HTMLDivElement; label: HTMLDivElement; shown: HTMLDivElement }
type Fader = HTMLDivElement & { held: Held; track: HTMLDivElement; handle: HTMLDivElement; label: HTMLDivElement; shown: HTMLDivElement }
type Switch = HTMLDivElement & { label: HTMLDivElement; row: HTMLDivElement; made: string }
type Button = HTMLDivElement & { led: HTMLDivElement; name: HTMLSpanElement }
type Meter = HTMLDivElement & { fill: HTMLDivElement; peak: HTMLDivElement; held: number; since: number }
type Module = HTMLDivElement & { header: HTMLDivElement; led: HTMLDivElement; heading: HTMLSpanElement }

export function controls(dom: Renderdom) {
  dom.style(CSS)
  dom.fonts([FONTS])

  const knob = (panel: string, key: string, o: KnobOptions): HTMLDivElement => {
    const el = dom.show(panel, key, () => {
      const k = div(dom, 'rd-knob') as Knob
      k.held = {}
      k.label = div(dom, 'rd-label', k)
      k.ring = div(dom, 'rd-ring', k)
      const cap = div(dom, 'rd-cap', k.ring)
      k.pointer = div(dom, 'rd-pointer', cap)
      k.shown = div(dom, 'rd-value', k)
      return k
    })
    put(el, o.at)
    // A dial of another size: the knob as wide as it and its margins need, the ring, the pointer
    // and the value under it moved to fit.
    const dial = o.dial ?? DIAL
    const [w, h] = knobSize(o.dial)
    sized(el, [w, h])
    put(el.ring, [(w - dial) / 2, LABEL_H])
    sized(el.ring, [dial, dial])
    if (el.pointer.style.height !== `${Math.round(dial / 4)}px`) el.pointer.style.height = `${Math.round(dial / 4)}px`
    if (el.pointer.style.transformOrigin !== `1px ${dial / 2 - 6}px`) el.pointer.style.transformOrigin = `1px ${dial / 2 - 6}px`
    if (el.shown.style.top !== `${LABEL_H + dial}px`) el.shown.style.top = `${LABEL_H + dial}px`
    prop(el, '--accent', o.accent)
    const f = fraction(o, o.value)
    prop(el.ring, '--arc', `${f * ARC}deg`)
    const turn = `rotate(${f * ARC - ARC / 2}deg)`
    if (el.pointer.style.transform !== turn) el.pointer.style.transform = turn
    text(el.label, o.label)
    text(el.shown, o.shown(o.value))
    dom.surface(panel, `${key}:dial`, [o.at[0] + (w - dial) / 2, o.at[1] + LABEL_H, dial, dial], { ...dragging(el.held, o, TRAVEL), ...menu(o) })
    el.oncontextmenu = o.onMenu ? () => o.onMenu!() : null
    dom.cursor(panel, `${key}:dial`, 'ns-resize')
    return el
  }

  const pick = (panel: string, key: string, o: SwitchOptions): HTMLDivElement => {
    const el = dom.show(panel, key, () => {
      const s = div(dom, 'rd-switch') as Switch
      s.label = div(dom, 'rd-label', s)
      s.row = div(dom, 'rd-segments', s)
      s.made = ''
      return s
    })
    const least = switchWidth(o.options)
    if (o.width < least) throw new Error(`switch ${panel}/${key} is ${o.width} wide: its labels ${o.options.join(', ')} need ${least}`)
    put(el, o.at)
    if (el.style.width !== `${o.width}px`) el.style.width = `${o.width}px`
    text(el.label, o.label)
    const widths = segmentWidths(o.options, o.width)
    const made = JSON.stringify(o.options)
    if (el.made !== made) {
      el.made = made
      el.row.replaceChildren(...o.options.map(name => {
        const seg = div(dom, 'rd-segment')
        div(dom, 'rd-led', seg)
        const t = dom.root!.ownerDocument.createElement('span')
        t.textContent = name
        seg.appendChild(t)
        return seg
      }))
    }
    o.options.forEach((name, i) => {
      const seg = el.row.children[i] as HTMLDivElement
      if (seg.style.width !== `${widths[i]}px`) seg.style.width = `${widths[i]}px`
      toggle(seg, 'rd-on', name === o.on)
      toggle(seg.firstElementChild as HTMLDivElement, 'rd-on', name === o.on)
    })
    dom.surface(panel, `${key}:row`, [o.at[0], o.at[1] + LABEL_H, o.width, SWITCH_H], {
      down(x) {
        // The segment under the press, by where each one ends, past the row's left border.
        // The right border counts as the last segment.
        let end = 1
        const found = widths.findIndex(w => x < (end += w))
        const i = found < 0 ? widths.length - 1 : found
        if (o.options[i] === o.on) return
        o.gesture.begin()
        o.onPick(o.options[i])
        o.gesture.end()
      },
    })
    dom.cursor(panel, `${key}:row`, 'pointer')
    return el
  }

  const button = (panel: string, key: string, o: ButtonOptions): HTMLDivElement => {
    const el = dom.show(panel, key, () => {
      const b = div(dom, 'rd-button') as Button
      b.led = div(dom, 'rd-led', b)
      b.name = dom.root!.ownerDocument.createElement('span')
      b.appendChild(b.name)
      return b
    })
    put(el, o.at)
    sized(el, o.size)
    text(el.name, o.label)
    if (o.accent) prop(el, '--accent', o.accent)
    const lamp = o.lit !== undefined
    if (el.led.hidden === lamp) el.led.hidden = !lamp
    toggle(el.led, 'rd-on', o.lit === true)
    const [w, h] = o.size
    dom.surface(panel, `${key}:press`, [o.at[0], o.at[1], w, h], {
      down() { el.classList.add('rd-down') },
      up(x, y) {
        el.classList.remove('rd-down')
        if (x >= 0 && y >= 0 && x < w && y < h) o.onPress()
      },
    })
    dom.cursor(panel, `${key}:press`, 'pointer')
    return el
  }

  const led = (panel: string, key: string, o: LedOptions): HTMLDivElement => {
    const el = dom.show(panel, key, () => div(dom, 'rd-led rd-lamp'))
    put(el, o.at)
    prop(el, '--accent', o.accent)
    toggle(el, 'rd-on', o.on)
    return el
  }

  const lcd = (panel: string, key: string, o: LcdOptions): HTMLDivElement => {
    const el = dom.show(panel, key, () => div(dom, 'rd-lcd'))
    put(el, o.at)
    sized(el, o.size)
    text(el, o.lines.join('\n'))
    return el
  }

  const fader = (panel: string, key: string, o: FaderOptions): HTMLDivElement => {
    const travel = o.height - LABEL_H - CAP_H - VALUE_H
    const el = dom.show(panel, key, () => {
      const f = div(dom, 'rd-fader') as Fader
      f.held = {}
      f.label = div(dom, 'rd-label', f)
      f.track = div(dom, 'rd-track', f)
      f.handle = div(dom, 'rd-handle', f)
      f.shown = div(dom, 'rd-value', f)
      return f
    })
    put(el, o.at)
    if (el.style.height !== `${o.height}px`) el.style.height = `${o.height}px`
    prop(el, '--accent', o.accent)
    text(el.label, o.label)
    text(el.shown, o.shown(o.value))
    if (el.track.style.height !== `${travel}px`) el.track.style.height = `${travel}px`
    const top = `${LABEL_H + (1 - fraction(o, o.value)) * travel}px`
    if (el.handle.style.top !== top) el.handle.style.top = top
    const under = `${LABEL_H + travel + CAP_H}px`
    if (el.shown.style.top !== under) el.shown.style.top = under
    dom.surface(panel, `${key}:track`, [o.at[0], o.at[1] + LABEL_H, FADER_W, travel + CAP_H], { ...dragging(el.held, o, travel), ...menu(o) })
    el.oncontextmenu = o.onMenu ? () => o.onMenu!() : null
    dom.cursor(panel, `${key}:track`, 'ns-resize')
    return el
  }

  const meter = (panel: string, key: string, o: MeterOptions): HTMLDivElement => {
    const el = dom.show(panel, key, () => {
      const m = div(dom, 'rd-meter') as Meter
      m.fill = div(dom, 'rd-fill', m)
      m.peak = div(dom, 'rd-peak', m)
      m.held = -Infinity
      m.since = performance.now()
      return m
    })
    put(el, o.at)
    sized(el, o.size)
    const inner = o.size[1] - 2
    prop(el.fill, '--full', `${inner}px`)
    const part = (db: number) => clamp((db - FLOOR) / (CEIL - FLOOR))
    const fill = `${part(o.level) * inner}px`
    if (el.fill.style.height !== fill) el.fill.style.height = fill
    // The held peak: the highest level, held for `HOLD` seconds, then falling `FALL` dB a second.
    const now = performance.now()
    const since = (now - el.since) / 1000
    const fallen = since > HOLD ? el.held - FALL * (since - HOLD) : el.held
    if (o.level >= fallen) {
      el.held = o.level
      el.since = now
    }
    const peak = o.level >= fallen ? o.level : fallen
    const y = `${(1 - part(peak)) * inner}px`
    if (el.peak.style.top !== y) el.peak.style.top = y
    if (el.peak.hidden !== peak <= FLOOR) el.peak.hidden = peak <= FLOOR
    return el
  }

  const module = (panel: string, key: string, o: ModuleOptions): HTMLDivElement => {
    const el = dom.show(panel, key, () => {
      const m = div(dom, 'rd-module') as Module
      m.header = div(dom, 'rd-header', m)
      m.led = div(dom, 'rd-led', m.header)
      m.heading = dom.root!.ownerDocument.createElement('span')
      m.header.appendChild(m.heading)
      return m
    })
    put(el, [o.box[0], o.box[1]])
    sized(el, [o.box[2], o.box[3]])
    text(el.heading, o.title)
    if (o.accent) prop(el, '--accent', o.accent)
    const lamp = o.lit !== undefined
    if (el.led.hidden === lamp) el.led.hidden = !lamp
    toggle(el.led, 'rd-on', o.lit === true)
    return el
  }

  return { knob, switch: pick, button, led, lcd, fader, meter, module }
}
