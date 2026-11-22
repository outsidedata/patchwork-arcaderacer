// The particle workshop's page: an effects file played by core's own particle3d on a stage, with no game
// running, each layer tuned live and saved into the file. It opens one game (`?game=<game>`, and
// `&file=<repo path>` of one of its effects files, `&effect=<name>`), read as the server does
// (`/api/particles/<game>`), on a stage of the game's own render3d (its tone, exposure and bloom); or,
// with no game named, the one effects file the server was started on (`--effects <path>`, read as
// `/api/particles`, `?effect=<name>`), on the stage of a game that names it, else the workshop's own
// (`particles.stage.json`). It draws from the file as it is on disk, with every change made since laid
// over it.
//
// The stage (`stage.ts`): the loader (its catalogue the scene's sheets), particle3d, lights3d when the scene lists it,
// and render3d with the scene's own prefab, ticked in the scene's order, particle3d moved each frame by the
// seconds the frame took times the speed below, in steps no longer than the scene's `dt`; a grid of 1 m squares on the ground and a stick of 1.8 m,
// a person, beside the point; the camera turned round the point by the mouse (OrbitControls), and kept
// across a reload. particle3d is handed the page's own copy of the effects file in place of the loader's,
// and told it was written (the loader's `onWritten`) each time a number changes, so every particle in the
// air takes the new number from the next step, as it does when the file is written while the game runs.
//
// The bar under the stage: how the effect is thrown. First, where from: still, from the point in the
// middle; or thrown, riding a bomb box3d throws across the stage, bouncing, put back and thrown again
// every so many seconds (`thrown.ts`, its numbers the stage file's `thrown`), the effect thrown afresh
// with it each time and its `at` the bomb's every step, as a game writes a moving effect's. An effect any of whose layers bursts again `every`
// so many seconds (its named effects' layers too) is a stream, played without end, as the game plays it
// while it is on. Any other is one burst: thrown by the Throw button, and again every so many whole
// seconds (2 to start) while its toggle is on, which it is to start. Then, as a rule's `emit` gives them
// (particle3d's header): `scale`; `dir`, which a layer with no `dir` throws along and swirls about; `to`,
// a second point, where a beam ends; and how fast time runs, so a quick burst can be watched slowly.
// Last, the light it is seen in: the background's colour, the stage's sky light and sun, and the exposure,
// each starting as the stage starts it, kept in this browser across reloads, never saved into a file, and
// put back by Stage light. A scene that lists skydome3d is seen under its sky (the workshop's own stage has
// one, and the particles are dimmed by it as the scene's `world.particle3d.mods.light` says): the sky is the
// light then, and in place of the sky light, the sun and the exposure the stage's bottom right corner has
// three buttons, each a time of day (5, 14 and 18 to start). The one pressed sets the sky to its time, and
// a panel over the buttons sets that time's hour, the day of the year, the moon's phase and the strength of
// the sun and of the moon.
//
// A number field takes a number, or an expression of the file's drivers (particle3d's header, Drivers),
// which is set once it reads as one. Under the effects, the left column has the file's drivers, each its
// name and its number or expression, a new one made by its name, × taking one out; and the file's force
// generators, a new one made by its name: one chosen shows in the right column, in place of the layers,
// its entries, each a card of every field an entry has (particle3d's `FORCE`), copied, removed or
// added, and the generator itself removed once no layer is in it. A layer's Forces folder lists every
// force generator of the file with how hard it acts on the layer: one strength, or with a second after
// `to`, a range each particle is rolled in. A field of stops (a layer's `grows`, `tints` and `alphas`, an
// entry's `overLife` and `overAge`) is a line for each stop, where it is and its value, a colour picked
// for `tints`, with Add a stop after the last and × taking one out. The drivers and the force generators
// are played from the page's working copy as the effects are, and saved with them.
//
// The left column is every effect of the file, a new one made by its name. The right column is the chosen
// effect's layers, each a card, every one shut on load, its title saying what it throws, how many and how
// often: mute it or play it alone (on this page only, never saved), move it up or down, copy it, remove
// it, or add a new one. A layer that names another effect (`{ effect, at }`) is, opened, that name and
// where it is thrown from. A lamp layer (`{ lamp }`) is, opened, its strength, reach, fall off, flicker,
// colour, offset, whether it casts shadows and whether it is a spot, with the spot's angle and penumbra;
// Add a lamp makes one. Every other layer is an emitter: opened, it shows its headline fields (how
// many, how often, how long, size, colour, brightness, speed, swirl), and under them folders, each shut
// until it is opened and saying how many of its fields are set: Timing, Colour and fade, Picture, Where
// it starts and Forces. Each field is one line, its name, its control and ×; a number is typed, or
// dragged across the field's name; a field left out shows greyed in its control what particle3d does
// without it; a value set turns its name white, a value changed since the file was read amber, and ×
// takes the field out of the layer. `life` and `lasts` are one or the other: setting one takes the other out.
// `pace` and `flips` are lists of lists, written as JSON. Every field particle3d reads (its `FIELDS`) has a
// control here, and the page throws on load when one has none.
//
// A file that lists others (`files`) is played with every effect, force generator and driver of them laid
// over its own (`stage.ts`'s `gather`), as particle3d plays it, and the left column shows each effect
// under the name of the file it is in.
//
// Save to game (Save, for a file given) writes each effect changed, whole, into the file it is in (`POST
// /api/particles/<game>`, or `/api/particles`, once a file), and a file's drivers or force generators
// whole when any of its own changed, the rest of each file and its layout kept; an effect, driver or
// force generator made on this page goes into the file the workshop opened. Revert drops every change. The file written on disk loads the
// page again on the same effect, unless there are changes not yet saved.
//
// ui3d mode. A game's scene that plays this effects file and lists ui3d with a looks file
// (`world.ui3d.looks`) is found by the server as the effects file is (`ui3d` of its summary): the left
// column lists every look of each such file under its scene. One chosen is shown on the stage by ui3d,
// in place of the effect thrown, every frame, with that scene's ui3d world and words (the game's own
// `<a>.ui3d.ts` among them) and its `particles` played from the working effects, so a change to an effect
// it plays shows on it from the next step. The pointer over a look that can be selected selects it, so
// a driver held at its `selected` is seen moving. Replay, and any change that throws the effect again,
// shows it again from its first frame. Chosen again, it is put away.
//
// Score effect scores the chosen effect as it is edited, saved or not, against the rules of how an effect
// is designed (`score.ts`), on a hidden stage of its own, from the camera as it stands and thrown as the bar
// throws it: a modal says what it is looking at while it scores, and then shows each rule passed or failed,
// the lines `yarn particle-score` prints.
//
// The address: every control of the page is a key of it, read on load ahead of what this browser kept
// (the camera, the light, the drawer), and written back as the control is turned, so a copied address
// opens the page as it was. A value a key cannot take is named on the page and left out.
//   game, file       the game and its effects file (with no game, the file the server was started on)
//   effect           the effect shown
//   drawer           particle3d or gpuparticle3d
//   from             still or thrown
//   scale            the effect's scale
//   dir, to          x,y,z: its dir, and its to, where a beam ends
//   time             how fast time runs, 0.05 to 2
//   auto, every      a burst: thrown again (1 or 0), every so many whole seconds
//   grid             the grid and the stick shown, 1 or 0
//   background       rrggbb, the stage's background
//   sky, sun, exposure   the stage's light (a stage with a sky has none of them)
//   skyat            a stage with a sky: which of its three times is pressed, 1 to 3
//   skyhour, skyday, skyphase, skysun, skymoon   that time's hour (0 to 24), day of the year (1 to 365),
//                    moon phase (0 to 1), sun strength and moon strength, where they differ from its start
//   camera, look     x,y,z: where the camera stands and the point it turns round
//   mute, solo, open layers by the number on their cards, from 1: muted (a list), played alone (one),
//                    opened (a list)
//   generator        the force generator shown in the right column
//   ui3d             <scene>/<look>: a look of the scene's ui3d looks file shown on the stage (ui3d mode)
//   d.<driver>       a driver's number or expression, changed and not yet saved
import { Color } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import Stats from 'three/addons/libs/stats.module.js'
import { ANCHORS, FIELDS, FORCE, type Driven, type Force, type Layer, type Emitter } from '#plugins/particle3d/particle3d.plugin.ts'
import { driven } from '#plugins/particle3d/drivers.ts'
import { SHAPES } from '#plugins/particle3d/shapes.ts'
import { gather, stage, streams as isStream, type Found, type Owner } from './stage.ts'
import { shooter, type Stage } from './shoot.ts'
import { report, scoreEffect } from './score.ts'

type Json = any

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const query = new URLSearchParams(location.search)
const game = query.get('game') ?? ''
const errorBox = $('#error')
const fail = (e: unknown) => {
  errorBox.style.display = 'block'
  errorBox.textContent = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
}
const clearFail = () => { errorBox.style.display = 'none' }
const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Each field of an emitter: its control, its name, what particle3d does when it is left out (shown greyed
// in the field), the step a drag moves it by a pixel, and its least, which a drag goes no lower than
// when it is 0 or more; `max` is no bound, typing past it is allowed.
type Spec =
  | { kind: 'number'; label: string; none: string; min: number; max: number; step: number }
  | { kind: 'range'; label: string; none: string; min: number; max: number; step: number }
  | { kind: 'vector'; label: string; none: string; count: number; min: number; max: number; step: number; names: string[] }
  | { kind: 'bool'; label: string; none: string }
  | { kind: 'colour'; label: string; none: string }
  | { kind: 'sheet'; label: string; none: string }
  | { kind: 'clip'; label: string; none: string }
  | { kind: 'json'; label: string; none: string; example: string }
  | { kind: 'effect'; label: string; none: string }
  | { kind: 'shape'; label: string; none: string }
  | { kind: 'forces'; label: string; none: string }
  | { kind: 'stops'; label: string; none: string; value: 'number' | 'colour'; at: string; step: number; fresh: number[][] }
const SPEC: Record<(typeof FIELDS)[number], Spec> = {
  n: { kind: 'range', label: 'Count', none: '1', min: 0, max: 400, step: 1 },
  every: { kind: 'number', label: 'Repeat every (s)', none: 'once', min: 0, max: 2, step: 0.005 },
  after: { kind: 'number', label: 'Delay (s)', none: '0', min: 0, max: 5, step: 0.01 },
  life: { kind: 'range', label: 'Lifetime (s)', none: '', min: 0, max: 10, step: 0.01 },
  lasts: { kind: 'bool', label: 'Lives with effect', none: '' },
  skip: { kind: 'number', label: 'Start offset (s)', none: '0', min: 0, max: 5, step: 0.01 },
  sheet: { kind: 'sheet', label: 'Sheet', none: 'squares' },
  clip: { kind: 'clip', label: 'Clip', none: '' },
  play: { kind: 'bool', label: 'Sheet timing', none: '' },
  start: { kind: 'range', label: 'Start in clip (0–1)', none: '0', min: 0, max: 1, step: 0.01 },
  blend: { kind: 'bool', label: 'Blend frames', none: '' },
  channels: { kind: 'json', label: 'Flipbook channels', none: 'colour', example: '{ "value": [0.55, 0.45, 0, 0], "alpha": [0, 0, 0, 1], "hot": [0, 0, 0, 0] }' },
  erode: { kind: 'stops', label: 'Erode over life', none: 'none', value: 'number', at: 'life', step: 0.01, fresh: [[0, 0], [1, 0.6]] },
  shape: { kind: 'shape', label: 'Shape', none: 'square' },
  size: { kind: 'range', label: 'Size (m)', none: '1', min: 0, max: 10, step: 0.005 },
  grow: { kind: 'number', label: 'Grow (×)', none: '1', min: 0, max: 40, step: 0.01 },
  grows: { kind: 'stops', label: 'Size over life (×)', none: 'as Grow', value: 'number', at: 'life', step: 0.01, fresh: [[0, 1], [1, 2]] },
  dir: { kind: 'vector', label: 'Direction', none: 'spawn', count: 3, min: -1, max: 1, step: 0.01, names: ['x', 'y', 'z'] },
  spread: { kind: 'number', label: 'Spread (rad)', none: 'all', min: 0, max: Math.PI, step: 0.01 },
  speed: { kind: 'range', label: 'Speed (m/s)', none: '0', min: 0, max: 60, step: 0.05 },
  outward: { kind: 'range', label: 'Speed outward (m/s)', none: '0', min: 0, max: 60, step: 0.05 },
  jitter: { kind: 'vector', label: 'Jitter (m)', none: '0', count: 3, min: 0, max: 5, step: 0.01, names: ['x', 'y', 'z'] },
  box: { kind: 'vector', label: 'Spawn box (m)', none: '', count: 6, min: -10, max: 10, step: 0.01, names: ['x', 'y', 'z', 'x', 'y', 'z'] },
  g: { kind: 'number', label: 'Gravity (m/s²)', none: '0', min: -40, max: 40, step: 0.1 },
  drag: { kind: 'number', label: 'Drag (/s)', none: '0', min: 0, max: 20, step: 0.05 },
  pull: { kind: 'number', label: 'Pull (m/s²)', none: '0', min: -100, max: 100, step: 0.1 },
  swirl: { kind: 'number', label: 'Swirl (rad/s)', none: '0', min: -30, max: 30, step: 0.05 },
  axis: { kind: 'vector', label: 'Swirl axis', none: 'dir', count: 3, min: -1, max: 1, step: 0.01, names: ['x', 'y', 'z'] },
  pace: { kind: 'json', label: 'Pace', none: '', example: '[[0.2, 0.5], [0.4, 0]]' },
  bounce: { kind: 'number', label: 'Bounce (0–1)', none: 'none', min: 0, max: 1, step: 0.01 },
  follow: { kind: 'bool', label: 'Follow point', none: '' },
  flips: { kind: 'json', label: 'Flips', none: '', example: '[[0.1, 1, 0]]' },
  tint: { kind: 'colour', label: 'Colour', none: 'white' },
  tint1: { kind: 'colour', label: 'End colour', none: 'same' },
  tints: { kind: 'stops', label: 'Colours over life', none: 'as Colour', value: 'colour', at: 'life', step: 1, fresh: [[0, 0xffffff], [1, 0x000000]] },
  gain: { kind: 'number', label: 'Brightness (×)', none: '1', min: 0, max: 40, step: 0.05 },
  a0: { kind: 'number', label: 'Start opacity', none: '1', min: 0, max: 1, step: 0.01 },
  a1: { kind: 'number', label: 'End opacity', none: '1', min: 0, max: 1, step: 0.01 },
  fade: { kind: 'number', label: 'Fade (s)', none: 'life', min: 0, max: 10, step: 0.01 },
  alphas: { kind: 'stops', label: 'Opacity over life', none: 'as opacity', value: 'number', at: 'life', step: 0.01, fresh: [[0, 0], [0.1, 1], [1, 0]] },
  spin: { kind: 'number', label: 'Spin (rad/s)', none: '0', min: 0, max: 30, step: 0.1 },
  origin: { kind: 'vector', label: 'Pivot', none: '0.5', count: 2, min: 0, max: 1, step: 0.01, names: ['x', 'y'] },
  add: { kind: 'bool', label: 'Additive', none: '' },
  stretch: { kind: 'bool', label: 'Stretch on path', none: '' },
  face: { kind: 'bool', label: 'Face direction', none: '' },
  beam: { kind: 'bool', label: 'Beam to target', none: '' },
  carry: { kind: 'effect', label: 'Each carries', none: 'nothing' },
  inherit: { kind: 'number', label: 'Inherit speed (×)', none: '0', min: 0, max: 2, step: 0.01 },
  forces: { kind: 'forces', label: 'Force generators', none: 'in none' },
}
// A force generator's entry's fields: each as the layer's field of its name is, where its point is and
// what it is off, the push along a direction, how far it reaches and how it falls off, the noise field
// that scales it and the one that pushes, the wind its drag is in, the shell or the line its pull draws
// toward, and how hard it acts over a particle's life and the effect's age. `anchor` is a word, picked
// from particle3d's `ANCHORS`.
const ENTRY: Record<Exclude<(typeof FORCE)[number], 'anchor'>, Spec> = {
  turbulence: { kind: 'number', label: 'Turbulence (m/s²)', none: '0', min: 0, max: 60, step: 0.05 },
  noiseScroll: { kind: 'vector', label: 'Noise scroll (m/s)', none: 'still', count: 3, min: -20, max: 20, step: 0.05, names: ['x', 'y', 'z'] },
  wind: { kind: 'vector', label: 'Wind (m/s)', none: 'still', count: 3, min: -40, max: 40, step: 0.05, names: ['x', 'y', 'z'] },
  dragBySpeed: { kind: 'number', label: 'Drag by speed', none: '0', min: 0, max: 5, step: 0.005 },
  shell: { kind: 'number', label: 'Pull to a shell (m)', none: 'the centre', min: 0, max: 50, step: 0.05 },
  toAxis: { kind: 'bool', label: 'Pull to the axis line', none: '' },
  overLife: { kind: 'stops', label: 'Strength over life', none: '1', value: 'number', at: 'life', step: 0.01, fresh: [[0, 1], [1, 0]] },
  overAge: { kind: 'stops', label: 'Strength over age', none: '1', value: 'number', at: 's', step: 0.01, fresh: [[0, 1], [0.1, 0]] },
  g: SPEC.g, drag: SPEC.drag, pull: SPEC.pull, swirl: SPEC.swirl, axis: { ...SPEC.axis, none: 'the layer\'s' } as Spec,
  at: { kind: 'vector', label: 'Offset (m)', none: '0', count: 3, min: -10, max: 10, step: 0.05, names: ['x', 'y', 'z'] },
  direction: { kind: 'vector', label: 'Push along (m/s²)', none: '0', count: 3, min: -40, max: 40, step: 0.1, names: ['x', 'y', 'z'] },
  range: { kind: 'number', label: 'Range (m)', none: 'everywhere', min: 0, max: 50, step: 0.05 },
  falloff: { kind: 'number', label: 'Falloff', none: '0', min: 0, max: 8, step: 0.05 },
  noiseFrequency: { kind: 'number', label: 'Noise frequency (/m)', none: '1', min: 0, max: 20, step: 0.01 },
  noiseAmplitude: { kind: 'number', label: 'Noise amplitude', none: '0', min: 0, max: 4, step: 0.01 },
}
for (const f of FIELDS) if (!SPEC[f]) throw new Error(`the particle workshop has no control for particle3d's field ${f}`)
// What an opened layer shows first, and the folders under it, each shut until it is opened.
const HEADLINE: (keyof Emitter)[] = ['n', 'every', 'life', 'shape', 'size', 'tint', 'gain', 'speed', 'swirl', 'carry']
const FOLDERS: [string, (keyof Emitter)[]][] = [
  ['Timing', ['after', 'lasts', 'skip']],
  ['Colour and fade', ['tint1', 'tints', 'a0', 'a1', 'fade', 'alphas', 'add']],
  ['Picture', ['sheet', 'clip', 'play', 'start', 'blend', 'channels', 'erode', 'grow', 'grows', 'spin', 'origin', 'stretch', 'face', 'beam', 'flips']],
  ['Where it starts', ['dir', 'spread', 'outward', 'inherit', 'jitter', 'box']],
  ['Forces', ['g', 'drag', 'pull', 'axis', 'forces', 'pace', 'bounce', 'follow']],
]
for (const f of FIELDS) if (!HEADLINE.includes(f) && !FOLDERS.some(([, fs]) => fs.includes(f))) throw new Error(`the particle workshop shows particle3d's field ${f} nowhere`)

const KEPT = 'particle-workshop-camera'
// The stage's light as last set on this page (the bar's Background, Sky light, Sun and Exposure).
const LIT = 'particle-workshop-light'
// Which plugin draws the effects, kept in this browser.
const DRAWER = 'particle-workshop-drawer'
// The seconds a still stream has run when it is shown: longer than any particle of it lives.
const PREFILL = 8

// A new layer's numbers (its picture is `freshLayer`'s): one burst of twenty small sparks of light, thrown out any way at a metre or two a second,
// fading over a second; no `every`, so a burst stays a burst. A starting point to turn, not a look.
const fresh = (): Driven<Emitter> => ({ n: [20, 20], life: [1, 1], size: [0.08, 0.15], speed: [1, 2], gain: 2, a1: 0, add: true })

async function main() {
  // With no game named, the effects file the server was started on (`--effects`), when it was.
  const givenAnswer = game ? undefined : await fetch('/api/particles')
  const given = !!givenAnswer?.ok
  const api = given ? '/api/particles' : `/api/particles/${game}`
  const pickGame = $<HTMLSelectElement>('#game')
  const pickFile = $<HTMLSelectElement>('#file')
  if (given) {
    pickGame.style.display = 'none'
    $('#save').textContent = 'Save'
  } else {
    const games: string[] = await (await fetch('/api/games')).json()
    for (const g of games) pickGame.append(new Option(g, g, false, g === game))
    pickGame.onchange = () => { location.search = `?game=${pickGame.value}` }
    if (!game) {
      const why = givenAnswer ? (await givenAnswer.json()).error : ''
      return fail(why && !/started on no effects file/.test(why) ? why : 'Choose a game, or start the workshop with --effects <path>.')
    }
  }

  const sum = given ? await givenAnswer!.json() : await (await fetch(api)).json()
  if (sum.error) return fail(sum.error)
  const files: Found[] = sum.files
  if (!files.length) return fail(`${game} has no scene that lists particle3d with a world.particle3d.`)
  const found = files.find(f => f.file === query.get('file')) ?? files[0]
  const where = (f: Found) => (f.scenes.length ? ` (${f.scenes.join(', ')})` : given ? ' (no game: the workshop\'s stage)' : '')
  for (const f of files) pickFile.append(new Option(`${given ? f.file : f.file.split('/').pop()}${where(f)}`, f.file, false, f === found))
  pickFile.onchange = () => { location.search = `?game=${game}&file=${encodeURIComponent(pickFile.value)}` }
  // The page's address holds every control of the page (the header's Drawn by, the bar's, the camera,
  // the drivers, the layers muted, played alone and opened, and the force generator shown), each read
  // from it on load ahead of what this browser kept, and written back into it as it is turned, so the
  // address opens the page as it was: `?effect=portal2&drawer=gpuparticle3d&time=0.25&mute=3,4`. Its
  // keys are in this file's header, The address.
  const shown = new URLSearchParams(location.search)
  if (!given) { shown.set('game', game); shown.set('file', found.file) }
  const round = (n: number) => Math.round(n * 1000) / 1000
  const put = (k: string, v: string | number | boolean | number[] | undefined) => {
    if (v === undefined || v === '') shown.delete(k)
    else shown.set(k, Array.isArray(v) ? v.map(round).join(',') : typeof v === 'boolean' ? (v ? '1' : '0') : typeof v === 'number' ? String(round(v)) : v)
    history.replaceState(null, '', `?${String(shown).replace(/%2C/g, ',').replace(/%2F/g, '/')}`)
  }
  // What the address says of a key, as the control wants it; a value it cannot be is named on the page.
  const wrong = (k: string, want: string) => { fail(`?${k}=${shown.get(k)} is not ${want}`); return undefined }
  const saidNumbers = (k: string, count: number) => {
    const v = shown.get(k)
    if (v === null) return undefined
    const ns = v.split(',').map(Number)
    return ns.length === count && ns.every(Number.isFinite) ? ns : wrong(k, `${count} number${count === 1 ? '' : 's'} split by commas`)
  }
  const saidNumber = (k: string) => saidNumbers(k, 1)?.[0]
  const saidBool = (k: string) => {
    const v = shown.get(k)
    return v === null ? undefined : v === '1' ? true : v === '0' ? false : wrong(k, '1 or 0')
  }
  const saidOne = <T extends string>(k: string, of: readonly T[]) => {
    const v = shown.get(k)
    return v === null ? undefined : (of as readonly string[]).includes(v) ? (v as T) : wrong(k, `one of ${of.join(', ')}`)
  }
  // Layers by the number each card shows, from 1.
  const saidLayers = (k: string) => {
    const v = shown.get(k)
    if (v === null) return undefined
    const ns = v.split(',').map(Number)
    return ns.every(n => Number.isInteger(n) && n >= 1) ? ns.map(n => n - 1) : wrong(k, 'layer numbers from 1, split by commas')
  }

  // The file as it is on disk with every file it lists laid over it (`stage.ts`'s `gather`), the file each
  // effect, force generator and driver of it is in, and the page's working copy of its effects. One made
  // on this page is in the file the workshop opened.
  const { whole: pristine, owner } = gather(found)
  const ownerOf = (kind: keyof Owner, name: string) => owner[kind][name] ?? found.file
  const working: Record<string, Layer[]> = structuredClone(pristine.effects)
  // And of its drivers and its force generators; `generator` is the one whose entries the right column
  // shows in place of the chosen effect's layers, when one is.
  const drivers: Record<string, number | string> = structuredClone(pristine.drivers ?? {})
  const generators: Record<string, Driven<Force>[]> = structuredClone(pristine.forceGenerators ?? {})
  let generator: string | undefined = shown.get('generator') ?? undefined
  if (generator !== undefined && !generators[generator]) { fail(`?generator=${generator}: ${found.file} has no force generator of that name`); generator = undefined }
  const driversChanged = () => !same(drivers, pristine.drivers ?? {})
  const generatorsChanged = () => !same(generators, pristine.forceGenerators ?? {})
  // Whether text is an expression of the working drivers.
  const reads = (text: string) => {
    try { driven(text, Object.keys(drivers), 'it'); return true } catch { return false }
  }
  if (shown.has('effect') && !working[shown.get('effect')!]) fail(`?effect=${shown.get('effect')}: ${found.file} has no effect of that name`)
  let effect = working[shown.get('effect') ?? ''] ? shown.get('effect')! : Object.keys(working)[0]
  // A driver the address gives (`d.<name>=<number or expression>`) set in the working copy, as typed into
  // its field: a change not yet saved.
  for (const [k, v] of shown) {
    if (!k.startsWith('d.')) continue
    const d = k.slice(2)
    if (!(d in drivers)) { fail(`?${k}: ${found.file} has no driver ${d}`); continue }
    const n = Number(v)
    if (v !== '' && Number.isFinite(n)) drivers[d] = n
    else if (reads(v)) drivers[d] = v
    else fail(`?${k}=${v} is not a number or an expression of the drivers`)
  }
  // The layers muted, and the one played alone, of the effect shown: the page's alone, never saved.
  const muted = new Set<number>(saidLayers('mute') ?? [])
  let solo: number | undefined = saidLayers('solo')?.[0]
  // The layers opened, by index, and the folders opened, `<layer> <folder>`: every one shut on load but
  // those the address opens.
  const opened = new Set<number>(saidLayers('open') ?? [])
  const folders = new Set<string>()
  // The address's account of the layers and the force generator shown, and of the drivers changed.
  const putLayers = () => {
    const list = (s: Iterable<number>) => [...s].sort((a, b) => a - b).map(i => i + 1).join(',')
    put('mute', list(muted)); put('solo', solo === undefined ? undefined : solo + 1); put('open', list(opened))
    put('generator', generator)
  }
  const putDrivers = () => {
    for (const k of [...shown.keys()]) if (k.startsWith('d.') && !(k.slice(2) in drivers && !same(drivers[k.slice(2)], pristine.drivers?.[k.slice(2)]))) shown.delete(k)
    for (const [d, v] of Object.entries(drivers)) if (!same(v, pristine.drivers?.[d])) put(`d.${d}`, typeof v === 'number' ? v : String(v))
    put('effect', effect)
  }
  // A new layer drawn with a picture the file's layers already draw with: a clip named for a glow when
  // one is, else the first a layer names; flat squares only for a file that draws none.
  const freshLayer = (): Driven<Emitter> => {
    const drawn = Object.values(working).flat().filter((l): l is Driven<Emitter> => !('effect' in l) && !('lamp' in l) && !!l.sheet && !!l.clip)
    const pick = drawn.find(l => /glow/i.test(l.clip!)) ?? drawn[0]
    return { ...fresh(), ...(pick ? { sheet: pick.sheet, clip: pick.clip } : {}) }
  }
  const changedEffects = () => Object.keys(working).filter(n => !same(working[n], pristine.effects[n]))

  // ---- the stage ----

  // The stage (`stage.ts`), playing the working effects with the chosen effect's muted layers out.
  const view = $('#view')
  // The ui3d mode: a look of a looks file a scene naming this effects file gives (`ui3d=<scene>/<look>`),
  // shown on the stage with ui3d and that scene's words, every frame, in place of the chosen effect
  // thrown; its particles played from the working effects. The stage is that scene's ui3d, or the first
  // such scene's when no look is shown.
  let look: { scene: string; name: string } | undefined
  {
    const said = shown.get('ui3d')
    if (said !== null) {
      const [scene, name] = said.split('/')
      const u = found.ui3d.find(x => x.scene === scene)
      if (!u || !(name in u.looks)) fail(`?ui3d=${said}: ${found.file} is played by no scene ${scene} with a look ${name}: ${found.ui3d.flatMap(x => Object.keys(x.looks).map(n => `${x.scene}/${n}`)).join(', ') || 'no scene of it gives ui3d looks'}`)
      else look = { scene, name }
    }
  }
  const uiScene = found.ui3d.find(x => x.scene === look?.scene) ?? found.ui3d[0]
  // Each Replay shows the look under a new key, so ui3d makes it again and its clock starts again.
  let replays = 0
  const st = await stage(found, view, uiScene, { sky: true })
  const { loader: real, camera, canvas, grid, stick, bomb, toss } = st
  const restage = () => st.show(Object.fromEntries(Object.entries(working).map(([n, layers]) =>
    [n, n !== effect ? layers : layers.filter((_, i) => (solo === undefined ? !muted.has(i) : i === solo))])), { drivers, forceGenerators: generators })
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.target.set(0, 1.2, 0)
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEPT) ?? 'null')
    if (kept) { camera.position.fromArray(kept.position); controls.target.fromArray(kept.target) }
  } catch { /* kept only where the browser keeps it */ }
  // where the address puts the camera (`camera=x,y,z`) and the point it turns round (`look=x,y,z`)
  const eye = saidNumbers('camera', 3), target = saidNumbers('look', 3)
  if (eye) camera.position.fromArray(eye)
  if (target) controls.target.fromArray(target)
  controls.update()
  // written into the address a moment after the camera stops moving, damping and all
  let still: ReturnType<typeof setTimeout> | undefined
  controls.addEventListener('change', () => {
    clearTimeout(still)
    still = setTimeout(() => { put('camera', camera.position.toArray()); put('look', controls.target.toArray()) }, 300)
  })
  addEventListener('beforeunload', () => {
    try { sessionStorage.setItem(KEPT, JSON.stringify({ position: camera.position.toArray(), target: controls.target.toArray() })) } catch { /* as above */ }
  })
  // The stage fitted to its box whenever the box changes size, in place: the working copy, the camera
  // and every open card stay as they are.
  new ResizeObserver(() => st.fit()).observe(view)

  // ---- how it is thrown ----

  // A stream is an effect any of whose layers, its named effects' too, bursts again `every` so many
  // seconds: it is played without end, as the game plays it while it is on. Any other is one burst: thrown
  // by the Throw button, and again every `auto.every` whole seconds while the toggle is on.
  const streams = (name: string) => isStream(working, name)
  const spawn = { at: [0, 1.2, 0], scale: saidNumber('scale') ?? 1, dir: saidNumbers('dir', 3) ?? [0, 1, 0], to: saidNumbers('to', 3) ?? [6, 1.2, 0], speed: saidNumber('time') ?? 1 }
  const every = saidNumber('every')
  const auto = { on: saidBool('auto') ?? true, every: every === undefined ? 2 : Number.isInteger(every) && every >= 1 ? every : wrong('every', 'a whole number of seconds, 1 or more') ?? 2 }
  let stream = false
  let since = 0
  // Where the effect is thrown from: `still`, the point in the middle; or `thrown`, riding the bomb
  // box3d throws across the stage (`thrown.ts`), its `at` the bomb's each step, the bomb put back and
  // thrown again every `thrown.every` seconds, the effect thrown afresh with it.
  let source: 'still' | 'thrown' = saidOne('from', ['still', 'thrown'] as const) ?? 'still'
  bomb.visible = source === 'thrown'
  let riding: ReturnType<typeof st.fx.emit> | undefined
  const throwIt = () => {
    since = 0
    if (source === 'thrown') toss.again()
    riding = undefined
    if (look || !working[effect]) return
    const from = source === 'thrown' ? [...toss.pos] : [...spawn.at]
    // the stage's ground is y 0: a layer that bounces bounces off it, any other rests on it
    // a stream standing still opens already full: particle3d rolls the bursts of the seconds it is
    // handed as already run and ages their particles to now
    const age = stream && source !== 'thrown' ? PREFILL : undefined
    const fired = st.fx.emit(effect, from, { life: stream ? Infinity : 0, scale: spawn.scale, dir: [...spawn.dir], to: [...spawn.to], floor: 0, age })
    if (source === 'thrown') riding = fired
  }
  // Every running effect stopped, its particles left to live out their lives, and the chosen one thrown
  // again at once.
  const restart = () => {
    for (const e of st.fx.effects) e.life = Math.min(e.life, e.age)
    // a look shown is shown again from its first frame, its effects thrown again
    if (look) replays++
    stream = streams(effect)
    throwIt()
    bursts()
  }

  const bar = $('#play')
  const field = (host: HTMLElement, label: string, input: HTMLInputElement) => {
    const l = make('label', '', label)
    l.append(input)
    host.append(l)
    return input
  }
  const num = (host: HTMLElement, label: string, value: number, step: number, set: (v: number) => void, min?: number) => {
    const i = make('input')
    i.type = 'number'; i.step = String(step); i.value = String(value)
    if (min !== undefined) i.min = String(min)
    i.oninput = () => { if (i.value !== '' && Number.isFinite(Number(i.value))) set(Number(i.value)) }
    return field(host, label, i)
  }
  // The start of the bar: what the chosen effect is, and for a burst, the Throw button and its toggle.
  const kind = make('span')
  kind.style.cssText = 'display:flex;gap:10px;align-items:center'
  bar.append(kind)
  function bursts() {
    kind.replaceChildren()
    if (look) {
      const again = make('button', 'go small', 'Replay')
      again.title = 'Show the look again from its first frame'
      again.onclick = () => { replays++ }
      kind.append(make('b', '', `ui3d: ${look.name} of ${look.scene}, its particles from this file; the pointer over it selects it`), again)
      return
    }
    if (source === 'thrown') {
      const go = make('button', 'go small', 'Throw')
      go.onclick = restart
      kind.append(make('b', '', stream ? 'A stream, riding the bomb' : 'A burst, thrown with the bomb'), go)
      return
    }
    if (stream) {
      kind.append(make('b', '', 'A stream: it runs without end, as it does in the game while it is on'))
      return
    }
    const go = make('button', 'go small', 'Throw')
    go.onclick = throwIt
    kind.append(make('b', '', 'A burst'), go)
    const box = make('input'); box.type = 'checkbox'; box.checked = auto.on
    box.onchange = () => { auto.on = box.checked; since = 0; put('auto', auto.on) }
    field(kind, 'Throw it every', box)
    const n = make('input'); n.type = 'number'; n.min = '1'; n.step = '1'; n.value = String(auto.every)
    n.oninput = () => { const v = Math.round(Number(n.value)); if (v >= 1) { auto.every = v; put('every', v) } }
    const l = make('label', '', '')
    l.append(n, ' seconds')
    kind.append(l)
  }
  // Which plugin draws the effects: particle3d, every particle on the CPU, or gpuparticle3d, every particle on
  // the GPU, from the same file. Switching closes the one left, its particles gone, and throws the effect
  // again on the other. Kept in this browser across reloads.
  {
    const sel = make('select')
    sel.append(new Option('particle3d (CPU)', 'particle3d'), new Option('gpuparticle3d (GPU)', 'gpuparticle3d'))
    try { const kept = localStorage.getItem(DRAWER); if (kept === 'particle3d' || kept === 'gpuparticle3d') st.use(kept) } catch { /* kept only where the browser keeps it */ }
    const said = saidOne('drawer', ['particle3d', 'gpuparticle3d'] as const)
    if (said) st.use(said)
    sel.value = st.drawer
    sel.onchange = () => {
      st.use(sel.value as typeof st.drawer)
      try { localStorage.setItem(DRAWER, st.drawer) } catch { /* as above */ }
      put('drawer', st.drawer)
      riding = undefined
      restart()
    }
    const l = make('label', '', 'Drawn by')
    l.append(sel)
    $('header').insertBefore(l, $('header .sp'))
  }
  {
    const sel = make('select')
    sel.append(new Option('Still, in the middle', 'still'), new Option(`Thrown, bouncing, again every ${found.thrown.every} s`, 'thrown'))
    sel.value = source
    sel.onchange = () => {
      source = sel.value as typeof source
      bomb.visible = source === 'thrown'
      put('from', source)
      restart()
    }
    const l = make('label', '', 'From')
    l.append(sel)
    bar.prepend(l)
  }
  num(bar, 'Scale', spawn.scale, 0.1, v => { spawn.scale = v; put('scale', v) }, 0)
  ;['x', 'y', 'z'].forEach((n, i) => num(bar, `Dir ${n}`, spawn.dir[i], 0.1, v => { spawn.dir[i] = v; put('dir', spawn.dir) }))
  ;['x', 'y', 'z'].forEach((n, i) => num(bar, `Target ${n}`, spawn.to[i], 0.5, v => { spawn.to[i] = v; put('to', spawn.to) }))
  {
    const r = make('input'); r.type = 'range'; r.min = '0.05'; r.max = '2'; r.step = '0.05'; r.value = String(spawn.speed)
    const shownSpeed = make('span', '', `${spawn.speed}×`)
    r.oninput = () => { spawn.speed = Number(r.value); shownSpeed.textContent = `${spawn.speed}×`; put('time', spawn.speed) }
    field(bar, 'Time', r).after(shownSpeed)
  }
  {
    const box = make('input'); box.type = 'checkbox'; box.checked = saidBool('grid') ?? true
    grid.visible = stick.visible = box.checked
    box.onchange = () => { grid.visible = stick.visible = box.checked; put('grid', box.checked) }
    field(bar, 'Grid and stick', box)
  }
  // The scene's dither3d, when it lists it: on as the scene starts it, or as the address says (`dither`).
  if (st.plugins.dither3d) {
    const d = st.plugins.dither3d as { on: boolean }
    const box = make('input'); box.type = 'checkbox'
    d.on = saidBool('dither') ?? d.on
    box.checked = d.on
    box.onchange = () => { d.on = box.checked; put('dither', box.checked) }
    field(bar, 'Dither', box)
  }
  // The light the stage is seen in: its background, its sky and sun (which light what a word draws, such
  // as instances3d's rocks), and the exposure the tone mapping is fed. The page's alone, never saved into
  // a file; kept in this browser across reloads. They start as the stage starts.
  {
    const renderer = st.plugins.render3d.renderer as { toneMappingExposure: number }
    const three = st.three
    const start = {
      background: three.background instanceof Color ? `#${three.background.getHexString()}` : '#0b0b0e',
      sky: st.sky.intensity, sun: st.sun.intensity, exposure: renderer.toneMappingExposure,
    }
    const lit = { ...start }
    try { Object.assign(lit, JSON.parse(localStorage.getItem(LIT) ?? '{}')) } catch { /* kept only where the browser keeps it */ }
    // the address's, ahead of this browser's: `background=<rrggbb>`, `sky`, `sun`, `exposure`
    const ground = shown.get('background')
    if (ground !== null) {
      if (/^[0-9a-f]{6}$/i.test(ground)) lit.background = `#${ground.toLowerCase()}`
      else wrong('background', 'a colour of six hex digits, rrggbb')
    }
    for (const key of ['sky', 'sun', 'exposure'] as const) {
      const v = saidNumber(key)
      if (v !== undefined) lit[key] = v
    }
    const apply = () => {
      three.background = new Color(lit.background)
      if (!st.clock) {
        st.sky.intensity = lit.sky
        st.sun.intensity = lit.sun
        renderer.toneMappingExposure = lit.exposure
      }
      try { localStorage.setItem(LIT, JSON.stringify(lit)) } catch { /* as above */ }
    }
    const inputs: { reset(): void }[] = []
    const slider = (label: string, key: 'sky' | 'sun' | 'exposure', max: number) => {
      const r = make('input'); r.type = 'range'; r.min = '0'; r.max = String(max); r.step = '0.05'; r.value = String(lit[key])
      const shown = make('span', '', lit[key].toFixed(2))
      r.oninput = () => { lit[key] = Number(r.value); shown.textContent = lit[key].toFixed(2); apply(); put(key, lit[key]) }
      field(bar, label, r).after(shown)
      inputs.push({ reset() { r.value = String(lit[key]); shown.textContent = lit[key].toFixed(2) } })
    }
    const colour = make('input'); colour.type = 'color'; colour.value = lit.background
    colour.oninput = () => { lit.background = colour.value; apply(); put('background', lit.background.slice(1)) }
    field(bar, 'Background', colour)
    inputs.push({ reset() { colour.value = lit.background } })
    // With a sky the sky is the light, and it sets the exposure itself every frame: its time of day, moon
    // and light are the three buttons over the stage's corner (The sky's times, below), not these.
    if (!st.clock) {
      slider('Sky light', 'sky', 3)
      slider('Sun', 'sun', 5)
      slider('Exposure', 'exposure', 3)
    }
    const back = make('button', 'small', 'Stage light')
    back.title = 'Put the background, the lights and the exposure back as the stage starts them'
    back.onclick = () => { Object.assign(lit, start); apply(); for (const i of inputs) i.reset(); for (const k of ['background', 'sky', 'sun', 'exposure']) put(k, undefined) }
    bar.append(back)
    apply()
  }

  // ---- the sky's times ----

  // A stage that has a sky: three buttons in the stage's bottom right corner, each a time of day, and one
  // panel above them that sets the one pressed: its hour, the day of the year, the moon's phase, the sun's
  // strength and the moon's. Each button keeps its own, so pressing one shows that time at once and the panel
  // is that button's. The page's alone, never saved into a file; kept in this browser across reloads, and in
  // the address as `skyat` (the button, from 1) and `skyhour`, `skyday`, `skyphase`, `skysun`, `skymoon` where
  // that button's differ from where it starts.
  if (st.clock) {
    const { data, day, look } = st.clock
    type Sky = { hour: number; day: number; phase: number; sun: number; moon: number }
    const SKY = 'particle-workshop-sky'
    const CONTROLS = [
      { key: 'hour', label: 'Hour', min: 0, max: 24, step: 0.05, address: 'skyhour', hint: 'hours into the sky\'s day: 0 is midnight, 12 noon' },
      { key: 'day', label: 'Day of the year', min: 1, max: 365, step: 1, address: 'skyday', hint: '1 is the first of January' },
      { key: 'phase', label: 'Moon phase', min: 0, max: 1, step: 0.01, address: 'skyphase', hint: '0 is a new moon, 0.5 a full one' },
      { key: 'sun', label: 'Sun strength', min: 0, max: 6, step: 0.05, address: 'skysun', hint: 'the key light the sun gives at its highest' },
      { key: 'moon', label: 'Moon strength', min: 0, max: 3, step: 0.05, address: 'skymoon', hint: 'the key light a full moon gives at its highest' },
    ] as const
    const ICONS = [
      '<svg viewBox="0 0 16 16"><path d="M2 12h12M5 12a3 3 0 0 1 6 0M8 2v4M6.5 3.5 8 2l1.5 1.5M2.5 8.5l1 1M13.5 8.5l-1 1"/></svg>',
      '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/></svg>',
      '<svg viewBox="0 0 16 16"><path d="M2 12h12M5 12a3 3 0 0 1 6 0M8 2v4M6.5 4.5 8 6l1.5-1.5M2.5 8.5l1 1M13.5 8.5l-1 1"/></svg>',
    ]
    const HOURS = [5, 14, 18]
    // each button starts at its hour, and at the stage's own day, phase and strengths
    const start = (i: number): Sky => ({ hour: HOURS[i], day: data.doy, phase: data.phase, sun: look.sunIntensity, moon: look.moonIntensity })
    const times = HOURS.map((_, i) => start(i))
    let at = 1
    try {
      const kept = JSON.parse(localStorage.getItem(SKY) ?? 'null')
      const whole = (t: Record<string, unknown> | undefined) => CONTROLS.every(c => Number.isFinite(t?.[c.key]))
      if (kept?.times?.length === HOURS.length && kept.times.every(whole)) {
        times.splice(0, times.length, ...kept.times)
        if (Number.isInteger(kept.at) && kept.at >= 0 && kept.at < HOURS.length) at = kept.at
      }
    } catch { /* kept only where the browser keeps it */ }
    // the address's, ahead of this browser's
    const pressed = saidNumber('skyat')
    if (pressed !== undefined) {
      if (Number.isInteger(pressed) && pressed >= 1 && pressed <= HOURS.length) at = pressed - 1
      else wrong('skyat', `a whole number from 1 to ${HOURS.length}`)
    }
    for (const c of CONTROLS) {
      const v = saidNumber(c.address)
      if (v === undefined) continue
      if (v < c.min || v > c.max) wrong(c.address, `a number from ${c.min} to ${c.max}`)
      else times[at][c.key] = v
    }
    const clock = (hour: number) => {
      const minutes = Math.round(hour * 60) % 1440
      return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
    }

    const box = make('div'); box.id = 'sky'
    const pop = make('div', 'pop')
    const head = make('div', 'head')
    const title = make('b')
    const reset = make('button', 'small', 'Reset')
    reset.title = 'Put this time back as the stage starts it'
    head.append(title, reset)
    pop.append(head)
    const inputs = CONTROLS.map(c => {
      const line = make('label', 'line')
      line.title = c.hint
      const range = make('input'); range.type = 'range'; range.min = String(c.min); range.max = String(c.max); range.step = String(c.step)
      const number = make('input'); number.type = 'number'; number.min = String(c.min); number.max = String(c.max); number.step = String(c.step)
      line.append(make('span', '', c.label), range, number)
      pop.append(line)
      return { c, range, number }
    })
    const row = make('div', 'times')
    const buttons = HOURS.map((_, i) => {
      const b = make('button'); b.innerHTML = ICONS[i]
      const label = make('span')
      b.append(label)
      b.onclick = () => { if (i === at && pop.classList.contains('open')) pop.classList.remove('open'); else { at = i; pop.classList.add('open') } apply() }
      row.append(b)
      return { b, label }
    })
    box.append(pop, row)
    view.append(box)

    // The sky as the pressed button has it, and every control showing it.
    function apply() {
      const t = times[at]
      data.t = (t.hour / 24) * day
      data.doy = t.day
      data.phase = t.phase
      look.sunIntensity = t.sun
      look.moonIntensity = t.moon
      title.textContent = clock(t.hour)
      buttons.forEach((b, i) => { b.label.textContent = clock(times[i].hour); b.b.classList.toggle('on', i === at) })
      for (const { c, range, number } of inputs) {
        range.value = String(t[c.key])
        if (document.activeElement !== number) number.value = String(+t[c.key].toFixed(2))
        number.classList.remove('bad')
        put(c.address, t[c.key] === start(at)[c.key] ? undefined : t[c.key])
      }
      put('skyat', at + 1)
      try { localStorage.setItem(SKY, JSON.stringify({ at, times })) } catch { /* as above */ }
    }
    for (const { c, range, number } of inputs) {
      range.oninput = () => { times[at][c.key] = Number(range.value); apply() }
      number.oninput = () => {
        const v = number.valueAsNumber
        if (!Number.isFinite(v) || v < c.min || v > c.max) { number.classList.add('bad'); return }
        times[at][c.key] = v
        apply()
      }
    }
    reset.onclick = () => { times[at] = start(at); apply() }
    apply()
  }

  // ---- the loop ----

  // Each frame, the seconds it took times the speed, in steps of the scene's `dt` and a last shorter one,
  // so a slowed effect still moves every frame and its quads face the camera as it turns.
  const count = $('#count')
  // three's own frame-rate panel, fixed at the top left of the window; a click on it shows the next graph.
  const meter = new Stats()
  document.body.appendChild(meter.dom)
  let last = performance.now()
  function step(now: number) {
    requestAnimationFrame(step)
    meter.update()
    let left = Math.max(1e-4, Math.min(0.25, (now - last) / 1000) * spawn.speed)
    last = now
    controls.update()
    try {
      st.tick()
      if (st.ui3d) {
        if (look) st.ui3d.show(`${look.name}.${replays}`, look.name)
        st.ui()
      }
      while (left > 1e-9) {
        const dt = Math.min(found.dt, left)
        left -= dt
        if (source === 'thrown') {
          toss.step(dt)
          if (toss.since >= toss.every - 1e-9) restart()
          if (riding) riding.at = [...toss.pos]
        }
        st.step(dt)
        if (source === 'still' && !stream && auto.on) {
          since += dt
          if (since >= auto.every - 1e-9) throwIt()
        }
      }
      st.draw()
      clearFail()
    } catch (e) {
      fail(e)
    }
    count.textContent = `${st.drawer}: ${st.fx.count} particles · ${st.fx.effects.length} effects running`
  }

  // ---- the left column and the header ----

  function nav() {
    const host = $('#nav')
    host.replaceChildren(make('div', 'head', 'Effects'))
    const changed = changedEffects()
    // under the name of each file they are in, when the file lists others: the file's own first, then
    // each it lists in its order
    const order = [found.file, ...found.listed.map(l => l.file)]
    const names = Object.keys(working).sort((a, b) => order.indexOf(ownerOf('effects', a)) - order.indexOf(ownerOf('effects', b)))
    let under: string | undefined
    for (const n of names) {
      const file = ownerOf('effects', n)
      if (found.listed.length && file !== under) {
        under = file
        const sub = make('div', 'sub', file.split('/').pop()!.replace(/\.json$/, ''))
        sub.title = file
        host.append(sub)
      }
      const b = make('button', 'effect', n)
      b.classList.toggle('on', n === effect)
      b.classList.toggle('changed', changed.includes(n))
      b.onclick = () => choose(n)
      host.append(b)
    }
    const add = make('div', 'new')
    const name = make('input')
    name.placeholder = 'new effect'
    const go = make('button', 'small', 'Add')
    go.onclick = () => {
      const n = name.value.trim()
      if (!n) return
      if (working[n]) return fail(`${found.file} already has an effect ${n}`)
      working[n] = [freshLayer()]
      choose(n)
      opened.add(0)
      editor()
    }
    add.append(name, go)
    host.append(add)

    // The file's drivers: each its name, dragged across to move its number, and its number or its
    // expression of the others; every number that names it moves with it as it is turned.
    host.append(make('div', `head${driversChanged() ? ' changed' : ''}`, 'Drivers'))
    for (const d of Object.keys(drivers)) {
      const line = make('div', 'driver')
      const label = make('span', 'name', d)
      label.title = d
      const was = pristine.drivers?.[d]
      line.classList.toggle('changed', !same(drivers[d], was))
      const n = numField(line, drivers[d], 0.01, '', v => { drivers[d] = v; line.classList.toggle('changed', !same(v, was)); fileChanged() })
      scrub(label, [n], 0.01, () => 0)
      const out = make('button', 'clear', '×')
      out.title = 'Take this driver out of the file'
      out.onclick = () => { delete drivers[d]; fileChanged(); nav() }
      line.prepend(label)
      line.append(out)
      host.append(line)
    }
    named(host, 'new driver', n => {
      if (n in drivers) return fail(`${found.file} already has a driver ${n}`)
      drivers[n] = 1
      fileChanged(); nav()
    })

    // The file's force generators: one chosen shows its entries in the right column.
    host.append(make('div', `head${generatorsChanged() ? ' changed' : ''}`, 'Force generators'))
    for (const g of Object.keys(generators)) {
      const b = make('button', 'effect', g)
      b.classList.toggle('on', g === generator)
      b.classList.toggle('changed', !same(generators[g], pristine.forceGenerators?.[g]))
      b.onclick = () => { generator = g; nav(); editor() }
      host.append(b)
    }
    named(host, 'new force generator', n => {
      if (n in generators) return fail(`${found.file} already has a force generator ${n}`)
      generators[n] = [{ pull: 1 }]
      generator = n
      fileChanged(); nav(); editor()
    })

    // ui3d: every look of the looks files of the scenes that play this effects file. One chosen is shown
    // on the stage in place of the effect; chosen again, it is put away. A look of another scene than
    // the stage's opens the page again on it, which a change not yet saved holds back.
    if (!found.ui3d.length) return
    host.append(make('div', 'head', 'ui3d'))
    for (const u of found.ui3d) {
      const sub = make('div', 'sub', `${u.scene} · ${u.file.split('/').pop()}`)
      sub.title = u.file
      host.append(sub)
      for (const n of Object.keys(u.looks)) {
        const b = make('button', 'effect', n)
        const on = look?.scene === u.scene && look.name === n
        b.classList.toggle('on', on)
        b.onclick = () => {
          if (u !== uiScene) {
            if (unsaved()) return fail(`Save or revert the changes before opening ${u.scene}'s look ${n}: the page opens again on that scene's stage`)
            shown.set('ui3d', `${u.scene}/${n}`)
            location.search = `?${String(shown).replace(/%2C/g, ',').replace(/%2F/g, '/')}`
            return
          }
          look = on ? undefined : { scene: u.scene, name: n }
          put('ui3d', look ? `${look.scene}/${look.name}` : undefined)
          restart(); nav()
        }
        host.append(b)
      }
    }
  }
  // A name typed and an Add button, at the foot of a list of the left column.
  function named(host: HTMLElement, hint: string, add: (name: string) => void) {
    const line = make('div', 'new')
    const name = make('input')
    name.placeholder = hint
    const go = make('button', 'small', 'Add')
    go.onclick = () => { const n = name.value.trim(); if (n) add(n) }
    name.onkeydown = e => { if (e.key === 'Enter') go.click() }
    line.append(name, go)
    host.append(line)
  }
  // A change to the file's drivers or force generators: played from the next step.
  function fileChanged() {
    restage()
    status()
    for (const h of document.querySelectorAll('#nav .head')) {
      if (h.textContent === 'Drivers') h.classList.toggle('changed', driversChanged())
      if (h.textContent === 'Force generators') h.classList.toggle('changed', generatorsChanged())
    }
  }
  function choose(n: string) {
    effect = n
    generator = undefined
    muted.clear(); solo = undefined; opened.clear(); folders.clear()
    put('effect', n)
    restage(); restart(); nav(); editor(); status()
  }
  // What is changed and not saved: each effect, the drivers and the force generators.
  const unsaved = () => changedEffects().length + (driversChanged() ? 1 : 0) + (generatorsChanged() ? 1 : 0)
  function status() {
    const n = changedEffects().length
    const parts = [n ? `${n} effect${n === 1 ? '' : 's'}` : '', driversChanged() ? 'the drivers' : '', generatorsChanged() ? 'the force generators' : ''].filter(Boolean)
    const st = $('#status')
    st.textContent = parts.length ? `${parts.join(', ')} changed, not saved` : 'Everything saved'
    st.classList.toggle('dirty', parts.length > 0)
    $<HTMLButtonElement>('#save').disabled = !parts.length
    $<HTMLButtonElement>('#revert').disabled = !parts.length
    putDrivers()
  }
  // The working copy of a record put back to the file's, in place.
  const putBack = <T,>(mine: Record<string, T>, files: Record<string, T> | undefined) => {
    for (const k of Object.keys(mine)) delete mine[k]
    Object.assign(mine, structuredClone(files ?? {}))
  }
  $('#revert').onclick = () => {
    putBack(working, pristine.effects)
    putBack(drivers, pristine.drivers)
    putBack(generators, pristine.forceGenerators)
    if (!working[effect]) effect = Object.keys(working)[0]
    choose(effect)
  }
  // Of a record of the whole set (the drivers or the force generators), the names in `file`.
  const inFile = <T,>(kind: 'drivers' | 'forceGenerators', all: Record<string, T> | undefined, file: string) =>
    Object.fromEntries(Object.entries(all ?? {}).filter(([n]) => ownerOf(kind, n) === file))
  // Each change saved into the file it is in: one save a file, each effect changed whole, and the file's
  // drivers or force generators whole when any of that file's changed, came or went.
  $('#save').onclick = async () => {
    for (const file of [found.file, ...found.listed.map(l => l.file)]) {
      const effects = Object.fromEntries(changedEffects().filter(n => ownerOf('effects', n) === file).map(n => [n, working[n]]))
      const mine = { drivers: inFile('drivers', drivers, file), forceGenerators: inFile('forceGenerators', generators, file) }
      const was = { drivers: inFile('drivers', pristine.drivers, file), forceGenerators: inFile('forceGenerators', pristine.forceGenerators, file) }
      const saved = {
        file, effects,
        ...(!same(mine.drivers, was.drivers) ? { drivers: mine.drivers } : {}),
        ...(!same(mine.forceGenerators, was.forceGenerators) ? { forceGenerators: mine.forceGenerators } : {}),
      }
      if (!Object.keys(effects).length && !saved.drivers && !saved.forceGenerators) continue
      const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(saved) })
      const out = await r.json()
      if (!r.ok) return fail(out.error)
      for (const n of Object.keys(effects)) {
        pristine.effects[n] = structuredClone(working[n])
        owner.effects[n] = file
      }
      for (const kind of ['drivers', 'forceGenerators'] as const) {
        if (!saved[kind]) continue
        const now: Record<string, Json> = { ...(pristine[kind] ?? {}) }
        for (const n of Object.keys(was[kind])) delete now[n]
        for (const [n, v] of Object.entries(mine[kind])) {
          now[n] = structuredClone(v)
          owner[kind][n] = file
        }
        ;(pristine as Json)[kind] = now
      }
    }
    nav(); editor(); status()
  }

  // ---- scoring ----

  // Score effect: the chosen effect as it is edited, saved or not, every layer of it played (muted ones
  // too: the effect as it would be saved), scored by the scorer (`score.ts`) on a hidden stage of its own,
  // from the camera as it stands and thrown as the bar throws it. A modal over the page says what it is
  // looking at and how far it has got, Cancel stopping it before its next picture; then it shows what was
  // found, the lines `yarn particle-score` prints, each rule's verdict coloured.
  let hidden: Stage | undefined
  const modal = $('#scoring')
  $('#score').onclick = async () => {
    const name = effect
    let cancel = false, over = false
    const box = make('div', 'box')
    const what = make('div', 'what', 'Building the stage it is scored on')
    const bar = make('progress')
    const out = make('pre')
    const end = make('div', 'end')
    const button = make('button', '', 'Cancel')
    button.onclick = () => {
      if (over) modal.style.display = 'none'
      else { cancel = true; what.textContent = 'Stopping after this picture' }
    }
    end.append(button)
    box.append(make('b', '', `Scoring ${name}`),
      make('div', 'note', `As it is edited, every layer played, from the camera as it stands, thrown ${source === 'thrown' ? 'riding the bomb' : 'from the middle'}. The rules are in tools/workshop/score.ts.`),
      what, bar, out, end)
    modal.replaceChildren(box)
    modal.style.display = 'flex'
    try {
      if (!hidden) hidden = await stage(found, $('#scorestage'))
      const effects = structuredClone(working)
      const { look } = shooter(hidden, found, effects, { drivers: structuredClone(drivers), forceGenerators: structuredClone(generators) })
      const base = {
        effect: name, camera: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov,
        at: [...spawn.at], dir: [...spawn.dir], to: [...spawn.to], scale: spawn.scale, seed: 1, from: source, stage: true, drawer: st.drawer,
      }
      // each picture a task of its own, so the modal and the stage go on drawing while it is scored
      const scored = await scoreEffect(async v => { await new Promise(r => setTimeout(r, 0)); return look(v) }, effects, base, {
        progress: (doing, done, of) => {
          what.textContent = doing === 'done' ? 'Done' : `Picture ${done + 1} of ${of}: ${doing}`
          bar.max = of
          bar.value = done
        },
        cancelled: () => cancel,
      })
      what.textContent = `Scored: ${scored.passed} of ${scored.of} rules passed`
      for (const line of report(scored).split('\n')) {
        const verdict = /^\s+(pass|FAIL)\s/.exec(line)?.[1]
        const l = make('span', verdict === 'FAIL' ? 'fail' : verdict === 'pass' ? 'pass' : '', `${line}\n`)
        out.append(l)
      }
    } catch (e) {
      what.textContent = e instanceof Error ? e.message : String(e)
    }
    over = true
    bar.remove()
    button.textContent = 'Close'
  }

  // ---- the right column ----

  // A change to the chosen effect's layers: drawn from the next step. `again` throws it afresh, for a
  // change of how many layers there are or which, where the particles in the air no longer match a layer.
  const changed = (again = false) => {
    restage()
    if (again || streams(effect) !== stream) restart()
    nav(); status()
  }
  const layers = () => working[effect]

  // A field's row, one line: its name (dragged across, it moves the row's numbers), its control, and × to
  // take it out, which a field left out has none of. A field left out shows greyed in its control what
  // particle3d does without it.
  // `under` names the object of the layer the field is in, as a lamp's are in its `lamp`, so the field
  // is set against the file's own there.
  function row(host: HTMLElement, label: string, l: Json, k: string, i: number, under?: string) {
    const on = pristine.effects[effect]?.[i] as Json
    return line(host, label, l, k, (under ? on?.[under] : on)?.[k])
  }
  // The same, for a field of anything: `was` is what the file has there.
  function line(host: HTMLElement, label: string, l: Json, k: string, was: unknown) {
    const r = make('div', 'row')
    r.classList.toggle('set', l[k] !== undefined)
    r.classList.toggle('changed', !same(l[k], was))
    const val = make('span', 'val')
    const clear = make('button', 'clear', '×')
    clear.disabled = l[k] === undefined
    clear.onclick = () => { delete l[k]; changed(); editor() }
    const name = make('span', 'name', label)
    r.append(name, val, clear)
    host.append(r)
    const mark = () => {
      r.classList.add('set')
      r.classList.toggle('changed', !same(l[k], was))
      clear.disabled = false
    }
    return { val, mark, name }
  }

  // Number fields. Each is typed into, or dragged: a drag across the row's name moves every number field
  // of the row by its step a pixel (Shift ten times, Alt a tenth), as a DCC's inspector does. What is
  // typed that is no number is an expression of the file's drivers (`drivers.ts`), set once it reads as
  // one and outlined red until it does; a field holding one is left as it is by a drag.
  type N = number | string
  type Num = { input: HTMLInputElement; get: () => number | undefined; put: (n: number) => void; driven: () => boolean }
  const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step)))
  function numField(host: HTMLElement, v: N | undefined, step: number, shown: string, set: (n: N) => void, axis?: string): Num {
    const wrap = make('span', 'num')
    if (axis) wrap.append(make('span', `axis ${axis}`, axis))
    const input = make('input')
    input.type = 'text'; input.spellcheck = false
    input.value = v === undefined ? '' : String(v)
    input.placeholder = shown
    const text = () => input.value.trim()
    const driven = () => text() !== '' && !Number.isFinite(Number(text()))
    wrap.classList.toggle('driven', driven())
    input.title = driven() ? text() : ''
    input.oninput = () => {
      wrap.classList.toggle('driven', driven())
      wrap.classList.toggle('bad', driven() && !reads(text()))
      input.title = driven() ? text() : ''
      if (text() === '') return
      if (!driven()) set(Number(text()))
      else if (reads(text())) set(text())
    }
    input.onkeydown = e => { if (e.key === 'Enter') input.blur() }
    wrap.append(input)
    host.append(wrap)
    const get = () => (text() === '' || driven() ? undefined : Number(text()))
    const put = (n: number) => { input.value = String(+n.toFixed(decimals(step))); set(+n.toFixed(decimals(step))) }
    return { input, get, put, driven }
  }
  function scrub(name: HTMLElement, nums: Num[], step: number, from: (i: number) => number, least = -Infinity) {
    name.classList.add('scrub')
    name.onpointerdown = e => {
      e.preventDefault()
      name.setPointerCapture(e.pointerId)
      const x0 = e.clientX
      const base = nums.map((n, i) => n.get() ?? from(i))
      name.onpointermove = m => {
        const k = m.shiftKey ? 10 : m.altKey ? 0.1 : 1
        const d = (m.clientX - x0) * step * k
        nums.forEach((n, i) => { if (!n.driven()) n.put(Math.max(least, base[i] + d)) })
      }
      name.onpointerup = () => { name.onpointermove = null; name.onpointerup = null }
    }
  }

  // The fields of a number, a range or a point, of a layer or of a force generator's entry, in its line:
  // whether the field is one of those. Each number of it is a number or an expression.
  function numbers(s: Spec, l: Json, k: string, val: HTMLElement, name: HTMLElement, write: (v: unknown) => void): boolean {
    const shown = s.none
    const plain = (...v: unknown[]) => v.every(n => typeof n === 'number')
    if (s.kind === 'number') {
      const n = numField(val, l[k], s.step, shown, v => write(v))
      scrub(name, [n], s.step, () => Number(shown) || 0, s.min >= 0 ? s.min : -Infinity)
      return true
    }
    if (s.kind === 'range') {
      // Two fields, the least and the most a particle is rolled between; two numbers are kept in order.
      const v: N[] = l[k] ?? []
      const lo = numField(val, v[0], s.step, shown, n => { const hi: N = (l[k] ?? [n, n])[1]; write([n, plain(n, hi) ? Math.max(n as number, hi as number) : hi]) })
      val.append(make('span', 'to', 'to'))
      const hi = numField(val, v[1], s.step, shown, n => { const least: N = (l[k] ?? [n, n])[0]; write([plain(n, least) ? Math.min(n as number, least as number) : least, n]) })
      scrub(name, [lo, hi], s.step, () => Number(shown) || 0, s.min >= 0 ? s.min : -Infinity)
      return true
    }
    if (s.kind === 'vector') {
      const v: N[] = l[k] ?? []
      const nums = s.names.map((axis, j) =>
        numField(val, v[j], s.step, s.count === 6 ? '' : shown, n => {
          const now: N[] = [...(l[k] ?? Array(s.count).fill(0))]
          now[j] = n
          if (k === 'axis' && plain(...now) && Math.hypot(...(now as number[])) === 0) return
          write(now)
        }, axis))
      if (s.count === 6) val.classList.add('six')
      scrub(name, nums, s.step, () => 0)
      return true
    }
    return false
  }

  // A field of stops (a layer's `grows`, `tints` and `alphas`, an entry's `overLife` and `overAge`): its
  // line says how many it has and adds one after the last, and under it each stop is a line of where it
  // is and its value, a number or a colour, × taking that stop out. `write` is handed the list as it now
  // is, or nothing once its last stop is gone.
  function stopsField(host: HTMLElement, s: Extract<Spec, { kind: 'stops' }>, l: Json, k: string, val: HTMLElement, was: Json, write: (v: N[][] | undefined) => void) {
    const list: N[][] | undefined = l[k]
    val.append(make('span', 'note', list ? `${list.length} stop${list.length === 1 ? '' : 's'}` : s.none))
    const add = make('button', 'small', 'Add a stop')
    add.onclick = () => { write(list ? [...list, [...list[list.length - 1]]] : structuredClone(s.fresh)); editor() }
    val.append(add)
    list?.forEach((stop, j) => {
      const sub = line(host, String(j + 1), list as Json, String(j), was?.[j])
      sub.name.parentElement!.classList.add('sub')
      numField(sub.val, stop[0], 0.01, '', v => { stop[0] = v; sub.mark(); write(list) }, s.at)
      if (s.value === 'colour' && typeof stop[1] === 'number') {
        const c = make('input'); c.type = 'color'; c.value = hex(stop[1])
        const code = make('span', 'hex', hex(stop[1]))
        c.oninput = () => { code.textContent = c.value; stop[1] = parseInt(c.value.slice(1), 16); sub.mark(); write(list) }
        sub.val.append(c, code)
      } else {
        const n = numField(sub.val, stop[1], s.step, '', v => { stop[1] = v; sub.mark(); write(list) })
        scrub(sub.name, [n], s.step, () => 0)
      }
      const out = sub.name.parentElement!.querySelector<HTMLButtonElement>('.clear')!
      out.onclick = () => { write(list.length === 1 ? undefined : list.filter((_, x) => x !== j)); editor() }
    })
  }

  function control(host: HTMLElement, l: Json, k: keyof Emitter, i: number) {
    const s = SPEC[k as (typeof FIELDS)[number]]
    if (k === 'life' && l.lasts) return
    if (k === 'clip' && !l.sheet) return
    const { val, mark, name } = row(host, s.label, l, k, i)
    const write = (v: unknown, again = false) => {
      l[k] = v
      if (k === 'life') delete l.lasts
      if (k === 'lasts') delete l.life
      mark(); changed(again)
    }
    const shown = s.none
    if (numbers(s, l, k, val, name, write)) return
    if (s.kind === 'stops') {
      stopsField(host, s, l, k, val, (pristine.effects[effect]?.[i] as Json)?.[k], v => {
        if (v === undefined) delete l[k]
        else l[k] = v
        mark(); changed()
      })
    } else if (s.kind === 'forces') {
      // The force generators of the file, each with how hard it acts on this layer's particles: a
      // number, or an expression, and with a second after `to`, a range each particle is rolled in; ×
      // takes the layer out of it.
      const names = Object.keys(generators)
      const mine = Object.keys(l.forces ?? {}).length
      val.append(make('span', 'note', names.length ? (mine ? `in ${mine} of ${names.length}` : shown) : 'the file has none'))
      const on = pristine.effects[effect]?.[i] as Json
      for (const g of names) {
        const sub = line(host, g, l.forces ?? {}, g, on?.forces?.[g])
        sub.name.parentElement!.classList.add('sub')
        const now: N | N[] | undefined = l.forces?.[g]
        let [least, most]: (N | undefined)[] = Array.isArray(now) ? now : [now, undefined]
        const put = () => { l.forces = { ...l.forces, [g]: most === undefined ? least : [least, most] }; sub.mark(); changed() }
        const n = numField(sub.val, least, 0.01, 'not in it', v => { least = v; put() })
        sub.val.append(make('span', 'to', 'to'))
        const m = numField(sub.val, most, 0.01, 'the same', v => { most = v; least ??= v; put() })
        // the second field emptied: one strength again
        m.input.addEventListener('input', () => { if (m.input.value.trim() === '' && most !== undefined) { most = undefined; if (least !== undefined) put() } })
        scrub(sub.name, most === undefined ? [n] : [n, m], 0.01, () => 0)
        const out = sub.name.parentElement!.querySelector<HTMLButtonElement>('.clear')!
        out.onclick = () => {
          const { [g]: _gone, ...rest } = l.forces ?? {}
          if (Object.keys(rest).length) l.forces = rest
          else delete l.forces
          changed(); editor()
        }
      }
    } else if (s.kind === 'bool') {
      const box = make('input'); box.type = 'checkbox'; box.checked = !!l[k]
      box.onchange = () => {
        if (box.checked) write(true, k === 'lasts')
        else {
          delete l[k]
          if (k === 'lasts') l.life = [1, 1]
          changed(k === 'lasts'); editor()
        }
      }
      val.append(box)
    } else if (s.kind === 'colour' && typeof l[k] === 'string') {
      // a colour the file drives: its expression
      numField(val, l[k], 1, shown, v => write(v))
    } else if (s.kind === 'colour') {
      const c = make('input'); c.type = 'color'; c.value = hex(l[k] ?? 0xffffff)
      const code = make('span', 'hex', l[k] === undefined ? shown : hex(l[k]))
      c.oninput = () => { code.textContent = c.value; write(parseInt(c.value.slice(1), 16)) }
      val.append(c, code)
    } else if (s.kind === 'sheet') {
      const sel = make('select')
      sel.append(new Option(s.none, ''))
      for (const [name, e] of Object.entries(found.world.loader.assets as Record<string, Json>)) if (e.type === 'sheet') sel.append(new Option(name, name, false, name === l.sheet))
      sel.onchange = () => {
        if (!sel.value) { delete l.sheet; delete l.clip; delete l.play; changed(true); editor(); return }
        const sheet = real.get(sel.value)
        const first = sheet ? Object.keys(sheet.data.clips)[0] : undefined
        delete l.shape
        l.sheet = sel.value
        if (first) l.clip = first
        else real.load(sel.value)
        changed(true); editor()
      }
      val.append(sel)
    } else if (s.kind === 'clip') {
      const sheet = real.get(l.sheet)
      if (!sheet) {
        real.load(l.sheet)
        val.append(make('span', '', `${l.clip ?? ''} (the sheet is loading)`))
        const tryAgain = setInterval(() => { if (real.get(l.sheet)) { clearInterval(tryAgain); editor() } }, 200)
        return
      }
      const sel = make('select')
      for (const name of Object.keys(sheet.data.clips)) sel.append(new Option(name, name, false, name === l.clip))
      sel.onchange = () => write(sel.value, true)
      val.append(sel)
    } else if (s.kind === 'json') {
      const t = make('input')
      t.type = 'text'; t.spellcheck = false; t.className = 'code'
      t.value = l[k] === undefined ? '' : JSON.stringify(l[k])
      t.placeholder = s.example
      t.oninput = () => {
        try {
          const v = JSON.parse(t.value)
          if (!Array.isArray(v) || !v.every(e => Array.isArray(e) && e.every(n => typeof n === 'number' || (typeof n === 'string' && reads(n))))) return
          t.style.borderColor = ''
          write(v)
        } catch { t.style.borderColor = '#a33' }
      }
      val.append(t)
    } else if (s.kind === 'shape') {
      // particle3d's own soft shapes; one picked takes the place of a sheet.
      const sel = make('select')
      sel.append(new Option(s.none, ''))
      for (const n of SHAPES) sel.append(new Option(n, n, false, n === l[k]))
      sel.onchange = () => {
        if (!sel.value) { delete l[k]; changed(true); editor(); return }
        delete l.sheet; delete l.clip; delete l.play
        write(sel.value, true)
        editor()
      }
      val.append(sel)
    } else if (s.kind === 'effect') {
      // Every effect of the file but this one; one that would come back round to itself throws on the
      // stage, as particle3d's own check says, and shows in the error.
      const sel = make('select')
      sel.append(new Option(s.none, ''))
      for (const n of Object.keys(working)) if (n !== effect) sel.append(new Option(n, n, false, n === l[k]))
      sel.onchange = () => {
        if (!sel.value) { delete l[k]; changed(true); editor(); return }
        write(sel.value, true)
      }
      val.append(sel)
    }
  }

  function card(l: Layer, i: number) {
    const c = make('div', 'layer')
    c.classList.toggle('muted', solo === undefined ? muted.has(i) : solo !== i)
    c.classList.toggle('shut', !opened.has(i))
    const top = make('div', 'top')
    // Its title: what it draws, and how many how often, dimmer.
    const what = 'lamp' in l ? (l.lamp.spot ? 'spot lamp' : 'lamp') : 'effect' in l ? l.effect : Object.keys(l).find(k => !(FIELDS as readonly string[]).includes(k)) ?? l.shape ?? l.clip ?? 'squares'
    const often = 'lamp' in l ? `${l.lamp.intensity} strong, ${l.lamp.distance} m${l.lamp.shadow ? ', shadows' : ''}` : 'effect' in l ? 'every layer of it' : `${l.n ? (l.n[0] === l.n[1] ? l.n[0] : `${l.n[0]}–${l.n[1]}`) : 1} ${l.every ? `every ${l.every} s` : 'once'}${l.carry ? `, each carrying ${l.carry}` : ''}`
    const title = make('span', 'title')
    title.append(make('span', 'chev', opened.has(i) ? '▾' : '▸'), make('span', 'index', String(i + 1)), make('span', 'what', what), make('span', 'often', often))
    title.onclick = () => { if (opened.has(i)) opened.delete(i); else opened.add(i); editor() }
    const tools = make('span', 'tools')
    const button = (text: string, on: boolean, f: () => void) => {
      const b = make('button', `tool${on ? ' on' : ''}`, text)
      b.onclick = f
      tools.append(b)
    }
    top.append(title, tools)
    button('Mute', muted.has(i), () => { if (muted.has(i)) muted.delete(i); else muted.add(i); restage(); restart(); editor() })
    button('Solo', solo === i, () => { solo = solo === i ? undefined : i; restage(); restart(); editor() })
    // What is opened, muted and played alone follows each layer to where it now stands: `to(j)` is
    // where the layer at `j` went, or undefined for one taken out.
    const follow = (to: (j: number) => number | undefined) => {
      const map = (s: Set<number>) => { const was = [...s]; s.clear(); for (const j of was) { const k = to(j); if (k !== undefined) s.add(k) } }
      map(opened); map(muted)
      const was = [...folders]
      folders.clear()
      for (const f of was) {
        const [j, ...name] = f.split(' ')
        const k = to(Number(j))
        if (k !== undefined) folders.add(`${k} ${name.join(' ')}`)
      }
      solo = solo === undefined ? undefined : to(solo)
    }
    const move = (to: number) => {
      const list = layers()
      if (to < 0 || to >= list.length) return
      ;[list[i], list[to]] = [list[to], list[i]]
      follow(j => (j === i ? to : j === to ? i : j))
      changed(true); editor()
    }
    button('↑', false, () => move(i - 1))
    button('↓', false, () => move(i + 1))
    button('Copy', false, () => {
      layers().splice(i + 1, 0, structuredClone(l))
      follow(j => (j > i ? j + 1 : j))
      changed(true); editor()
    })
    button('Delete', false, () => {
      layers().splice(i, 1)
      follow(j => (j === i ? undefined : j > i ? j - 1 : j))
      changed(true); editor()
    })
    const body = make('div', 'body')
    c.append(top, body)
    if (!opened.has(i)) return c
    if ('lamp' in l) {
      lampCard(body, l.lamp, i)
      return c
    }
    if ('effect' in l) {
      const which = row(body, 'Effect', l, 'effect', i)
      const sel = make('select')
      for (const n of Object.keys(working)) if (n !== effect) sel.append(new Option(n, n, false, n === l.effect))
      sel.onchange = () => { (l as Json).effect = sel.value; changed(true); editor() }
      which.val.append(sel)
      // A layer that names an effect always names one: nothing to take out.
      which.name.parentElement!.classList.add('fixed')
      const at = row(body, 'Offset (m)', l, 'at', i)
      const v: N[] = l.at ?? []
      const nums = ['x', 'y', 'z'].map((axis, j) => numField(at.val, v[j], 0.05, '0', n => {
        const now = [...((l as Json).at ?? [0, 0, 0])]
        now[j] = n
        ;(l as Json).at = now
        at.mark(); changed(true)
      }, axis))
      scrub(at.name, nums, 0.05, () => 0)
      return c
    }
    for (const k of HEADLINE) control(body, l, k, i)
    // Each word the layer gives (a field that is none of particle3d's own, drawn by what a mod delivers:
    // instances3d's `mesh`), its numbers written as JSON.
    for (const w of Object.keys(l).filter(k => !(FIELDS as readonly string[]).includes(k))) {
      const { val, mark } = row(body, w, l, w as keyof Emitter, i)
      const t = make('input')
      t.type = 'text'; t.spellcheck = false; t.className = 'code'
      t.value = JSON.stringify((l as Json)[w])
      t.oninput = () => {
        try {
          const v = JSON.parse(t.value)
          if (typeof v !== 'object' || v === null || Array.isArray(v)) return
          t.style.borderColor = ''
          ;(l as Json)[w] = v
          mark(); changed(true)
        } catch { t.style.borderColor = '#a33' }
      }
      val.append(t)
    }
    for (const [name, keys] of FOLDERS) {
      const key = `${i} ${name}`
      const open = folders.has(key)
      const set = keys.filter(k => (l as Json)[k] !== undefined).length
      const head = make('button', `folder${open ? ' open' : ''}`)
      head.append(make('span', 'chev', open ? '▾' : '▸'), make('span', '', name), make('span', 'count', set ? `${set} set` : ''))
      head.onclick = () => { if (open) folders.delete(key); else folders.add(key); editor() }
      body.append(head)
      if (open) {
        const inner = make('div', 'inner')
        for (const k of keys) control(inner, l, k, i)
        body.append(inner)
      }
    }
    return c
  }

  // A lamp layer opened: its strength, reach and fall off, which it always has; its colour, place off
  // the point, flicker and shadow; and whether it is a spot, with the spot's angle and penumbra. With no
  // lights3d in the scene particle3d draws no lamp, and the card says so.
  function lampCard(body: HTMLElement, lamp: Json, i: number) {
    if (!found.plugins.includes('lights3d')) body.append(make('div', 'note', 'The scene has no lights3d, so this lamp is not drawn.'))
    const number = (label: string, k: string, step: number, none: string, fixed = false) => {
      const r = row(body, label, lamp, k, i, 'lamp')
      if (fixed) r.name.parentElement!.classList.add('fixed')
      const n = numField(r.val, lamp[k], step, none, v => { lamp[k] = v; r.mark(); changed() })
      scrub(r.name, [n], step, () => Number(none) || 0, 0)
    }
    number('Intensity', 'intensity', 0.05, '', true)
    number('Reach (m)', 'distance', 0.05, '', true)
    number('Falloff', 'decay', 0.05, '', true)
    number('Flicker', 'flicker', 0.01, '0')
    const colour = row(body, 'Colour', lamp, 'tint', i, 'lamp')
    if (typeof lamp.tint === 'string') numField(colour.val, lamp.tint, 1, 'spawn', v => { lamp.tint = v; colour.mark(); changed() })
    else {
      const c = make('input'); c.type = 'color'; c.value = hex(lamp.tint ?? 0xffffff)
      const code = make('span', 'hex', lamp.tint === undefined ? 'spawn' : hex(lamp.tint))
      c.oninput = () => { code.textContent = c.value; lamp.tint = parseInt(c.value.slice(1), 16); colour.mark(); changed() }
      colour.val.append(c, code)
    }
    const at = row(body, 'Offset (m)', lamp, 'at', i, 'lamp')
    const nums = ['x', 'y', 'z'].map((axis, j) => numField(at.val, (lamp.at ?? [])[j], 0.05, '0', n => {
      const now = [...(lamp.at ?? [0, 0, 0])]
      now[j] = n
      lamp.at = now
      at.mark(); changed()
    }, axis))
    scrub(at.name, nums, 0.05, () => 0)
    const shadow = row(body, 'Casts shadows', lamp, 'shadow', i, 'lamp')
    const sb = make('input'); sb.type = 'checkbox'; sb.checked = !!lamp.shadow
    sb.onchange = () => { if (sb.checked) lamp.shadow = true; else delete lamp.shadow; shadow.mark(); changed() }
    shadow.val.append(sb)
    const spot = row(body, 'Spot', lamp, 'spot', i, 'lamp')
    const kb = make('input'); kb.type = 'checkbox'; kb.checked = !!lamp.spot
    kb.onchange = () => {
      if (kb.checked) lamp.spot = { angle: 0.5, penumbra: 0.3 }
      else delete lamp.spot
      changed(true); editor()
    }
    spot.val.append(kb)
    if (lamp.spot) {
      for (const [part, label, step] of [['angle', 'Angle (rad)', 0.01], ['penumbra', 'Penumbra', 0.01]] as const) {
        const sub = row(body, label, lamp.spot, part, -1)
        sub.name.parentElement!.classList.add('sub')
        const n = numField(sub.val, lamp.spot[part], step, '', v => { lamp.spot = { ...lamp.spot, [part]: v }; sub.mark(); changed() })
        scrub(sub.name, [n], step, () => 0, 0)
      }
    }
  }

  // A force generator in the right column: its name, how many layers of the file are in it, and its
  // entries, each a card of its forces (`g`, `drag`, `pull`, `swirl` and `axis`, as a layer's are) and
  // `at`, where its pull draws toward and its swirl turns about, off the point a particle was thrown
  // from. A generator no layer is in can be taken out of the file.
  function generatorEditor(host: HTMLElement, g: string) {
    const entries = generators[g]
    const users = Object.values(working).flat().filter(l => !('effect' in l) && !('lamp' in l) && l.forces && g in l.forces).length
    const head = make('div', 'gen')
    const back = make('button', 'small', `Back to ${effect}`)
    back.onclick = () => { generator = undefined; nav(); editor() }
    const gone = make('button', 'small', 'Delete')
    gone.disabled = users > 0
    gone.title = users ? 'Layers are in it: take each out of it first' : 'Take this force generator out of the file'
    gone.onclick = () => { delete generators[g]; generator = undefined; fileChanged(); nav(); editor() }
    head.append(make('b', '', g), make('span', 'note', `force generator · ${users} layer${users === 1 ? '' : 's'} in it`), back, gone)
    host.append(head)
    entries.forEach((f: Json, i) => {
      const c = make('div', 'layer')
      const top = make('div', 'top')
      const said = FORCE.filter(k => f[k] !== undefined && k !== 'axis' && k !== 'at').map(k => `${k} ${f[k]}`).join(', ')
      const title = make('span', 'title')
      title.append(make('span', 'index', String(i + 1)), make('span', 'what', 'entry'), make('span', 'often', said || 'no force'))
      const tools = make('span', 'tools')
      const button = (text: string, act: () => void) => {
        const b = make('button', 'tool', text)
        b.onclick = act
        tools.append(b)
      }
      button('Copy', () => { entries.splice(i + 1, 0, structuredClone(f)); fileChanged(); nav(); editor() })
      button('Delete', () => { entries.splice(i, 1); fileChanged(); nav(); editor() })
      top.append(title, tools)
      const body = make('div', 'body')
      for (const k of FORCE) {
        const was = (pristine.forceGenerators?.[g]?.[i] as Json)?.[k]
        if (k === 'anchor') {
          const { val, mark, name } = line(body, 'Anchored to', f, k, was)
          const clear = name.parentElement!.querySelector<HTMLButtonElement>('.clear')!
          clear.onclick = () => { delete f[k]; fileChanged(); nav(); editor() }
          const sel = make('select')
          for (const a of ANCHORS) sel.append(new Option(a === 'particle' ? 'each particle (where it was thrown)' : 'the effect (one point for all, carried too)', a, false, (f[k] ?? 'particle') === a))
          sel.onchange = () => { f[k] = sel.value; mark(); fileChanged() }
          val.append(sel)
          continue
        }
        const s = ENTRY[k]
        const { val, mark, name } = line(body, s.label, f, k, was)
        const clear = name.parentElement!.querySelector<HTMLButtonElement>('.clear')!
        clear.onclick = () => { delete f[k]; fileChanged(); nav(); editor() }
        if (s.kind === 'bool') {
          const box = make('input'); box.type = 'checkbox'; box.checked = !!f[k]
          box.onchange = () => {
            if (box.checked) f[k] = true
            else delete f[k]
            fileChanged(); nav(); editor()
          }
          val.append(box)
          continue
        }
        if (s.kind === 'stops') {
          stopsField(body, s, f, k, val, was, v => {
            if (v === undefined) delete f[k]
            else f[k] = v
            mark(); fileChanged()
          })
          continue
        }
        numbers(s, f, k, val, name, v => { f[k] = v; mark(); fileChanged(); title.lastElementChild!.textContent = FORCE.filter(x => f[x] !== undefined && x !== 'axis' && x !== 'at').map(x => `${x} ${f[x]}`).join(', ') || 'no force' })
      }
      c.append(top, body)
      host.append(c)
    })
    if (!entries.length) host.append(make('div', 'empty', 'This force generator has no entries.'))
    const add = make('div', 'add')
    const entry = make('button', 'small', 'Add an entry')
    entry.onclick = () => { entries.push({ pull: 1 }); fileChanged(); nav(); editor() }
    add.append(entry)
    host.append(add)
  }

  function editor() {
    putLayers()
    const host = $('#edit')
    if (generator !== undefined && generators[generator]) {
      host.replaceChildren()
      generatorEditor(host, generator)
      return
    }
    const list = layers() ?? []
    host.replaceChildren(...list.map(card))
    if (!list.length) host.append(make('div', 'empty', 'This effect has no layers.'))
    const add = make('div', 'add')
    const emitter = make('button', 'small', 'Add a layer')
    emitter.onclick = () => { list.push(freshLayer()); opened.add(list.length - 1); changed(true); editor() }
    const ref = make('button', 'small', 'Add another effect as a layer')
    const other = Object.keys(working).find(n => n !== effect)
    ref.disabled = !other
    ref.onclick = () => { list.push({ effect: other! }); opened.add(list.length - 1); changed(true); editor() }
    const lampButton = make('button', 'small', 'Add a lamp')
    lampButton.onclick = () => { list.push({ lamp: { intensity: 4, distance: 6, decay: 2 } }); opened.add(list.length - 1); changed(true); editor() }
    add.append(emitter, ref, lampButton)
    host.append(add)
  }

  // ---- files written on disk ----

  const events = new EventSource('/api/events')
  events.onmessage = e => {
    const what = String(e.data).replace(/^changed /, '')
    if (what !== found.file && !found.listed.some(l => l.file === what)) return
    if (!unsaved()) location.reload()
    else $('#status').textContent = `${what.split('/').pop()} changed on disk: save or revert to load it`
  }

  restage()
  nav()
  editor()
  status()
  restart()
  requestAnimationFrame(step)
}

main().catch(fail)
