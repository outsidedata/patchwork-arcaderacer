// Scores a particle effect against the rules of how an effect is designed (the `tuning-particles` skill, How
// an effect is designed), by looking at it. The particle workshop's Score effect (`particles.ts`) runs it on a
// hidden stage of its own, on the effect as it is edited; `yarn particle-score` (`scripts/particle-score.ts`)
// runs it on the views page (`views.ts`) in a headless Chrome.
//
// `scoreEffect(look, effects, base, hooks)` plays the effect `base.effect` of `effects` through `look`
// (`shoot.ts`), each view of it `base` with its moment and its layers, and hands back what it found
// (`Scored`); `report(scored)` writes it as lines of text. Every picture is laid against the same view with
// every layer of the effect off, the stage alone, and only the pixels the effect changed are measured: what
// it covers. `hooks.progress` is told what it is doing as it goes, `hooks.cancelled` is asked before every
// picture and stops it when true, and `hooks.keep` is handed every picture it measured, by name:
// `<moment>`, `<moment>-bright`, `off-<effect>-<layer>` at the peak.
//
// How long a burst lives is found by playing it until nothing of it is in the air; one still in the air at
// 16 s is a stream. A burst is looked at on the step it is thrown and at 12 moments across its life, a stream
// at 7 moments from 1 s to 4 s. Every moment is looked at over the stage and over a bright sky (`BRIGHT`),
// and at every moment each layer is muted in turn. Its peak is the moment it changes the picture most.
//
// A rule about how it looks is judged at every moment it shows in the first half of a burst's life (the hit
// and the body; the fading tail is judged by `blown after`), every moment of a stream, and its number is the
// middle of theirs, so one flash frame neither passes nor fails a whole effect; the moment that does worst is
// named beside it. The rules, each passed or failed with the number measured and its line (`LINES`):
//
//   blown at peak    of what it covers, the part clipped white, at the moment most is, at most `blownPeak`.
//                    The flash of a hit may clip; a whole effect clipped is the wash-out (rules 3 and 4).
//   blown after      a burst, after the first quarter of its life, and a stream at every moment: the part
//                    clipped white, at most `blownBody`. White is the instant of the hit, not the body.
//   one focus        of what it covers, the part within 15% of its brightest, at most `focus`. Everything
//                    as bright as the brightest is "everything is important" (rules 1 and 2).
//   darks            over the bright sky, at the moments it covers at least `darksFrom` of the picture, the
//                    part of it darker than the sky behind it, at least `darks`. Added light only ever
//                    brightens; an effect with no darks has no laid-over body (rule 3). It is judged over
//                    the sky, since over a dark stage a dark body has little to be darker than.
//   value range      the brightness of its brightest 5% less its darkest 5%, at least `range`. A flat range
//                    is mud (rules 2 and 5).
//   saturation       the middle saturation of its light, the parts it makes at least 0.15 brighter than the
//                    stage, does not clip, and does not darken the bright sky, at least `saturation`. Light
//                    washed to grey is light stacked too high (rules 4 and 5). Smoke and dust laid over the
//                    stage darken the sky, so they are not light.
//   one hue          of its coloured parts, the share within 45° of its leading hue at least `lead`, and
//                    within 45° of the hue across the wheel from it at most `opposite` (rule 5). Judged at
//                    the moments it has 200 coloured pixels or more.
//   on bright        how much it changes the picture over the bright sky against over the stage, at least
//                    `bright`. An effect that is all added light is gone on a bright sky.
//   peak early       a burst's peak within the first quarter of its life (rule 6).
//   every layer      each layer, and each layer of every effect it carries or names, muted: how much the
//                    picture changes, against how much the effect changes it, at the moment it changes it
//                    most, at least `layer`. One that changes less is not earning its place (rule 7). A
//                    lamp is not muted: nothing on the stage is lit (the grid is lines, the stick and the
//                    bomb unlit), so a lamp changes no picture of it.
//
// Brightness is the sRGB luma of the picture, 0 to 1; saturation and hue are HSV's. A pixel the effect
// covers is one whose red, green or blue moved at least 8 of 255 from the stage's; one clipped white has
// red, green and blue each 235 or more, no colour left in it. The lines are where the rules' words are
// drawn, set once here; an effect that breaks one is looked at, never the line moved to pass it.
import type { View } from './shoot.ts'

type Json = any
export type Picture = { width: number; height: number; data: Uint8ClampedArray }

// The lines each rule is drawn at (above).
export const LINES = {
  blownPeak: 0.15, blownBody: 0.01, focus: 0.25, darksFrom: 0.01, darks: 0.1, range: 0.35,
  saturation: 0.3, lead: 0.6, opposite: 0.15, bright: 0.4, layer: 0.03,
}
// The bright sky an effect is also looked at over: a pale daylight blue-grey.
export const BRIGHT = 0xbfc8d2
const COVER = 8
// A pixel washed to white: red, green and blue each at least this, so no colour is left in it.
const WHITE = 235

// What one picture of an effect shows, laid against the stage alone in the same view.
export type Measure = {
  cover: number      // the part of the picture it covers
  blown: number      // of what it covers, the part clipped white
  darker: number     // of what it covers, the part darker than what is behind it
  focus: number      // of what it covers, the part within 15% of its brightest
  range: number      // brightness of its brightest 5% less its darkest 5%
  saturation: number // the middle saturation of its light: what it makes 0.15 brighter and does not clip
  lit: number        // how many pixels of light that is
  coloured: number   // pixels coloured enough to have a hue
  lead: number       // of those, the share within 45° of the leading hue
  opposite: number   // of those, the share within 45° of the hue across from it
  energy: number     // how much it changes the picture: the mean of |brightness - the stage's|
}

const luma = (d: Uint8ClampedArray, i: number) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255

// A picture of an effect measured against `stage`, the same view with the effect off. `sky` is the same
// moment over the bright sky and the sky alone: a pixel is light only where the effect does not darken the
// sky there, so pale smoke laid over the stage is not taken for light.
export function measure(pic: Picture, stage: Picture, sky?: { pic: Picture; stage: Picture }): Measure {
  for (const other of [stage, sky?.pic, sky?.stage]) if (other && (other.width !== pic.width || other.height !== pic.height)) throw new Error(`a picture of ${pic.width}×${pic.height} against one of ${other.width}×${other.height}`)
  const p = pic.data, s = stage.data
  const total = pic.width * pic.height
  const ys: number[] = []
  const sats: number[] = []
  const hues = new Array(12).fill(0)
  let cover = 0, blown = 0, darker = 0, energy = 0, coloured = 0, top = 0
  for (let i = 0; i < p.length; i += 4) {
    const moved = Math.max(Math.abs(p[i] - s[i]), Math.abs(p[i + 1] - s[i + 1]), Math.abs(p[i + 2] - s[i + 2]))
    if (moved < COVER) continue
    cover++
    const y = luma(p, i), ys0 = luma(s, i)
    ys.push(y)
    if (y > top) top = y
    energy += Math.abs(y - ys0)
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const clipped = p[i] >= WHITE && p[i + 1] >= WHITE && p[i + 2] >= WHITE
    if (clipped) blown++
    if (y < ys0 - 0.04) darker++
    if (y > ys0 + 0.15 && !clipped && (!sky || luma(sky.pic.data, i) >= luma(sky.stage.data, i) - 0.02)) sats.push(sat)
    if (sat >= 0.25 && max >= 0.15) {
      let h = 0
      const c = max - min
      if (max === r) h = ((g - b) / c + 6) % 6
      else if (max === g) h = (b - r) / c + 2
      else h = (r - g) / c + 4
      hues[Math.floor(h * 2) % 12]++
      coloured++
    }
  }
  const sorted = ys.sort((a, b) => a - b)
  const at = (q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0
  const focus = sorted.length ? sorted.filter(y => y >= top * 0.85).length / sorted.length : 0
  sats.sort((a, b) => a - b)
  // the leading hue: the 30° bin that, with its two neighbours, holds the most
  let lead = 0, centre = 0
  for (let b = 0; b < 12; b++) {
    const near = hues[(b + 11) % 12] + hues[b] + hues[(b + 1) % 12]
    if (near > lead) { lead = near; centre = b }
  }
  const opposite = hues[(centre + 5) % 12] + hues[(centre + 6) % 12] + hues[(centre + 7) % 12]
  return {
    cover: cover / total,
    blown: cover ? blown / cover : 0,
    darker: cover ? darker / cover : 0,
    focus,
    range: at(0.95) - at(0.05),
    saturation: sats.length ? sats[Math.floor(sats.length / 2)] : 0,
    lit: sats.length,
    coloured,
    lead: coloured ? lead / coloured : 0,
    opposite: coloured ? opposite / coloured : 0,
    energy: energy / total,
  }
}

// How much a picture with a layer muted differs from the whole effect's, against how much the whole effect
// changes the stage: 0 when muting it changes nothing, 1 when it changes as much as the effect does.
export function change(whole: Picture, muted: Picture, stage: Picture): number {
  const w = whole.data, m = muted.data, s = stage.data
  let moved = 0, made = 0
  for (let i = 0; i < w.length; i += 4) {
    moved += Math.abs(luma(w, i) - luma(m, i))
    made += Math.abs(luma(w, i) - luma(s, i))
  }
  return made ? moved / made : 0
}

// One moment looked at: its seconds into the effect, and what it shows over the stage (`m`) and over the
// bright sky (`b`).
export type Moment = { t: number; m: Measure; b: Measure }
// One layer muted: its name, and the most it changed the picture at any moment it was muted at.
export type Muted = { layer: string; change: number }
export type Rule = { rule: string; pass: boolean | null; got: string; line: string }

const pct = (x: number) => `${(100 * x).toFixed(1)}%`
const num = (x: number) => x.toFixed(2)
const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

// A rule about how it looks, judged at the `at` moments: the middle of their numbers against the line, and
// the moment that does worst named. `of` is a moment's number, `ok` whether a number meets the line, `say`
// how a number is written.
function across(rule: string, at: Moment[], of: (x: Moment) => number, ok: (v: number) => boolean, say: (v: number) => string, line: string, none: string): Rule {
  if (!at.length) return { rule, pass: null, got: none, line }
  const v = middle(at.map(of))
  const failing = at.filter(x => !ok(of(x)))
  const worst = failing.length ? failing.reduce((a, b) => (Math.abs(of(b) - v) > Math.abs(of(a) - v) ? b : a)) : undefined
  return { rule, pass: ok(v), got: `${say(v)}${worst ? `, worst ${say(of(worst))} at ${num(worst.t)} s` : ''}`, line }
}

// One hue leads: the middle of the moments' shares near the leading hue and across from it, each against its
// line.
function hue(at: Moment[], L: typeof LINES): Rule {
  const line = `at least ${pct(L.lead)} near its leading hue, at most ${pct(L.opposite)} across from it`
  if (!at.length) return { rule: 'one hue', pass: null, got: 'never 200 coloured pixels', line }
  const lead = middle(at.map(x => x.m.lead)), opposite = middle(at.map(x => x.m.opposite))
  return { rule: 'one hue', pass: lead >= L.lead && opposite <= L.opposite, got: `${pct(lead)} near its leading hue, ${pct(opposite)} across from it`, line }
}

// Every rule judged for one effect: its moments, its life (null for a stream), and each layer muted.
export function judge(moments: Moment[], life: number | null, muted: Muted[], L = LINES): Rule[] {
  const peak = moments.reduce((a, b) => (b.m.energy > a.m.energy ? b : a))
  const looked = moments.filter(x => life === null || x.t <= life / 2)
  const shows = looked.filter(x => x.m.energy > 0)
  const body = moments.filter(x => life === null || x.t > life / 4)
  const brightest = moments.reduce((a, b) => (b.m.blown > a.m.blown ? b : a))
  const worst = body.length ? body.reduce((a, b) => (b.m.blown > a.m.blown ? b : a)) : undefined
  const rules: Rule[] = [
    { rule: 'blown at peak', pass: brightest.m.blown <= L.blownPeak, got: `${pct(brightest.m.blown)} clipped white at ${num(brightest.t)} s`, line: `at most ${pct(L.blownPeak)}` },
    worst
      ? { rule: 'blown after', pass: worst.m.blown <= L.blownBody, got: `${pct(worst.m.blown)} clipped white at ${num(worst.t)} s`, line: `at most ${pct(L.blownBody)}` }
      : { rule: 'blown after', pass: null, got: 'no moment after the first quarter', line: `at most ${pct(L.blownBody)}` },
    across('one focus', shows, x => x.m.focus, v => v <= L.focus, v => `${pct(v)} within 15% of its brightest`, `at most ${pct(L.focus)}`, 'never shows'),
    across('darks', looked.filter(x => x.b.cover >= L.darksFrom), x => x.b.darker, v => v >= L.darks, v => `${pct(v)} darker than the sky`, `at least ${pct(L.darks)}`,
      `never covers ${pct(L.darksFrom)} of the picture`),
    across('value range', shows, x => x.m.range, v => v >= L.range, num, `at least ${num(L.range)}`, 'never shows'),
    across('saturation', looked.filter(x => x.m.lit > 0), x => x.m.saturation, v => v >= L.saturation, num, `at least ${num(L.saturation)}`, 'no light'),
    hue(looked.filter(x => x.m.coloured >= 200), L),
    across('on bright', shows, x => x.b.energy / x.m.energy, v => v >= L.bright, pct, `at least ${pct(L.bright)} of it over the stage`, 'never shows'),
    life === null
      ? { rule: 'peak early', pass: null, got: 'a stream', line: 'a burst only' }
      : { rule: 'peak early', pass: peak.t <= life / 4, got: `${num(peak.t)} s of ${num(life)} s`, line: `by ${num(life / 4)} s` },
  ]
  const idle = muted.filter(x => x.change < L.layer)
  rules.push(muted.length
    ? { rule: 'every layer', pass: idle.length === 0, got: idle.length ? idle.map(x => `${x.layer} ${pct(x.change)}`).join(', ') : `the least is ${pct(Math.min(...muted.map(x => x.change)))}`, line: `each at least ${pct(L.layer)}` }
    : { rule: 'every layer', pass: null, got: 'no layers', line: '' })
  return rules
}

export const score = (rules: Rule[]) => {
  const judged = rules.filter(r => r.pass !== null)
  return { passed: judged.filter(r => r.pass).length, of: judged.length }
}

// The effects an effect throws: itself, and every effect its layers carry or name, as deep as they go.
export function reached(all: Record<string, Json[]>, name: string, seen = new Set<string>()): string[] {
  if (seen.has(name) || !all[name]) return []
  seen.add(name)
  const out = [name]
  for (const l of all[name]) {
    if (typeof l?.carry === 'string') out.push(...reached(all, l.carry, seen))
    if (typeof l?.effect === 'string') out.push(...reached(all, l.effect, seen))
  }
  return out
}

// A layer's name in a report: `<effect>[<n>]`, its number from 1 as the workshop's cards show it, and what
// it is.
function named(effect: string, i: number, l: Json) {
  if ('effect' in l) return `${effect}[${i + 1}] throws ${l.effect}`
  const what = [l.shape ?? (l.sheet ? `sheet ${l.sheet}` : 'square'), l.add ? 'add' : 'over', ...(typeof l.gain === 'number' && l.gain !== 1 ? [`gain ${l.gain}`] : [])]
  return `${effect}[${i + 1}] ${what.join(' ')}`
}

// What a score found: the effect, its life (null for a stream), its peak, every rule, and the score.
export type Scored = { effect: string; life: number | null; peak: { t: number; cover: number }; rules: Rule[]; passed: number; of: number; seconds: number }
export type Look = (v: View) => Promise<{ pic: Picture; particles: number; effects: number }>
export type Hooks = {
  progress?: (what: string, done: number, of: number) => void
  cancelled?: () => boolean
  keep?: (name: string, pic: Picture) => void
}

// One effect scored: `base` is every view of it but its moment, its layers and its sky.
export async function scoreEffect(look: Look, all: Record<string, Json[]>, base: Omit<View, 'preroll' | 'off' | 'only' | 'sky'>, hooks: Hooks = {}): Promise<Scored> {
  const began = Date.now()
  const name = base.effect
  if (!all[name]) throw new Error(`there is no effect ${name}`)
  const view = (preroll: number, more: Partial<View> = {}): View => ({ ...base, preroll, off: {}, only: {}, ...more })
  const layers = reached(all, name).flatMap(e => all[e].map((l, i) => ({ e, i, l }))).filter(x => !('lamp' in x.l))
  // how many pictures, for `progress`: two of the stage, at most 12 to find its life, two at each moment,
  // and each layer muted at each moment
  let done = 0, of = 2 + 12 + 2 * 13 + layers.length * 13
  const shot = async (what: string, v: View, keep?: string) => {
    if (hooks.cancelled?.()) throw new Error('scoring cancelled')
    hooks.progress?.(what, done, of)
    const got = await look(v)
    done++
    if (keep) hooks.keep?.(keep, got.pic)
    return got
  }

  const own = all[name].map((_, i) => i)
  const stage = (await shot('the stage alone', view(0, { off: { [name]: own } }))).pic
  const brightStage = (await shot('the bright sky alone', view(0, { off: { [name]: own }, sky: BRIGHT }))).pic
  // how long it lives: doubled until nothing of it is in the air, then halved down to a 32nd of that
  const gone = async (t: number) => { const s = await shot(`how long it lives: at ${t.toFixed(2)} s`, view(t)); return s.particles === 0 && s.effects === 0 }
  let hi: number | undefined
  let lo = 0
  for (const t of [0.25, 0.5, 1, 2, 4, 8, 16]) {
    if (await gone(t)) { hi = t; break }
    lo = t
  }
  if (hi !== undefined) for (let i = 0; i < 5; i++) {
    const mid: number = (lo + hi) / 2
    if (await gone(mid)) hi = mid
    else lo = mid
  }
  const life: number | null = hi ?? null
  const times = life === null ? [1, 1.5, 2, 2.5, 3, 3.5, 4] : [0, ...Array.from({ length: 12 }, (_, k) => (life * (k + 0.5)) / 12)]
  of = done + 2 * times.length + layers.length * times.length
  const moments: (Moment & { pic: Picture })[] = []
  for (const [k, t] of times.entries()) {
    const { pic } = await shot(`the moment at ${t.toFixed(2)} s`, view(t), String(k))
    const bright = (await shot(`the moment at ${t.toFixed(2)} s over the bright sky`, view(t, { sky: BRIGHT }), `${k}-bright`)).pic
    moments.push({ t, m: measure(pic, stage, { pic: bright, stage: brightStage }), b: measure(bright, brightStage), pic })
  }
  const peak = moments.reduce((a, b) => (b.m.energy > a.m.energy ? b : a))
  // each layer muted at every moment the effect shows, its change the most of those
  const looks = moments.filter(x => x.m.energy > 0)
  of = done + layers.length * looks.length
  const muted: Muted[] = []
  for (const { e, i, l } of layers) {
    let most = 0
    for (const x of looks) {
      const { pic } = await shot(`${named(e, i, l)} muted at ${x.t.toFixed(2)} s`, view(x.t, { off: { [e]: [i] } }), x === peak ? `off-${e}-${i + 1}` : undefined)
      most = Math.max(most, change(x.pic, pic, stage))
    }
    muted.push({ layer: named(e, i, l), change: most })
  }
  hooks.progress?.('done', of, of)
  const rules = judge(moments, life, muted)
  return { effect: name, life, peak: { t: peak.t, cover: peak.m.cover }, rules, ...score(rules), seconds: (Date.now() - began) / 1000 }
}

// A score written as lines of text: the effect, its score, and each rule.
export function report(s: Scored): string {
  const head = `${s.effect}: ${s.passed} of ${s.of}  (${s.life === null ? 'a stream' : `a burst of ${s.life.toFixed(2)} s`}, peak at ${s.peak.t.toFixed(2)} s covering ${pct(s.peak.cover)}, ${s.seconds.toFixed(1)} s to score)`
  return [head, ...s.rules.map(r => `  ${r.pass === null ? '  -  ' : r.pass ? ' pass' : ' FAIL'}  ${r.rule.padEnd(13)} ${r.got}${r.line ? `   (${r.line})` : ''}`)].join('\n')
}
