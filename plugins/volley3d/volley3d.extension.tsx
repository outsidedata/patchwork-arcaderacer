// volley3d's extension: the Patterns 3D panel, the Fire Pattern 3D tool, and the types of a patterns
// file's fields (`volley3d.sim.ts` says what the file holds and what every field of a pattern means;
// `volley3d.plugin.ts` how a page draws a round and fires one of its alone).
//
// The panel (`volley3d.components.tsx`) works on the patterns file of the scene selected, else of the
// one the game view shows, else of the first scene that names volley3d in its `plugins`: the json
// entry of that scene's catalogue its `world.volley3d.patterns` names, in the scene's file or else the
// game's, as a child's `world` is the manager's with its own over it. It lists every pattern, filtered
// by name, with its speed, its life, how far along the ground it flies fired level in that life,
// whether it seeks, its splash, and how many places name it; one is selected. The selected pattern's
// fields are shown by their meaning, its look's three effects among them, and a field it does not set
// is added with the value volley3d reads when it is left out; where that is no value a file can hold,
// no `max`, it is added at the value that changes nothing yet: its speed at the end of its life, or
// its speed as fired when that is more. A look's effect is added as the effect the file's patterns
// name there first, else the first of the scene's effects file (`world.particle3d.effects`); with no
// effect to name it is refused. `speed`, `life` and `look` are never removed, since a pattern without
// one throws. Every change is written into the file a value at a time, and is one undo:
//   - a field, added or removed: that one value;
//   - a pattern added: `{ speed: 40, life: 3, look }`, the look of the file's first pattern; removed:
//     its key, once the panel has said which data files name it; renamed: it set whole under the new
//     name, which goes to the end of `patterns`, and the old key removed. A name already taken is
//     refused.
// Where a pattern is named: every string value equal to its name in any other json entry of the
// scene's catalogue, each with its path from that file's top.
//
// The plot. The selected pattern's flight is drawn in the panel from the side: its height over the
// distance it has gone along the ground, fired at the preview's elevation, at every step of the
// scene's `dt` to the end of its life, as `flight` has it; with where it is when its life ends, its
// top and when, where it comes back down through the height it was fired from, and the fastest it
// goes. So how a pattern flies reads without firing it.
//
// The preview. While the game view shows the panel's scene and the panel is open, the selected
// pattern is fired through the view's client's volley3d as a round of the page's alone (`fire`),
// never a row, from `height` metres over the loop's point: the last point the Fire Pattern 3D
// tool was pressed at on that scene, else the ground under the middle of the view. It is fired along
// the preview's heading, from a dial, degrees from the world's +z toward its +x, as a walker's heading
// turns, raised `elevation` degrees over level. With Loop on it is fired again after the first frame
// of the editor's clock (`Session.onFrame`) that finds its last round no longer among the plugin's
// `volleys()`, so an edit to the file, which the datafiles
// extension refills the plugin's copy of, shows on the next round. Fire Once fires it once more. A
// pattern that would throw as the page draws it (a field volley3d does not know, no speed, life or
// look, a scene that names no particle3d effects file, or a look naming an effect that file has none
// of) is not fired, and the panel says why; one whose effects file has not been read yet waits for
// it. The way the round would fly is marked on the stage, from the ground point up to the muzzle and
// on along its flight to the end of its life. The heading, the elevation, the height and the
// selection are this viewer's own, kept in localStorage.
//
// The Fire Pattern 3D tool (N) fires the selected pattern over the ground point pressed on, and makes
// that point the loop's.
//
// The types, wherever the file is shown (every patterns file a `world.volley3d` of the open game
// names, `bindFile`): a look's `body`, `trail` and `burst` particle3d's effect (`particle3d.effect`),
// and `seek` an angle, so a second's turn shows in degrees. `volley3d.pattern` is a pattern of the
// file, which a game binds whatever of its own names one to, a launcher's `pattern` say.
import type { Editor, FieldProps, Pointer } from '#editor/editor.ts'
import type { Session } from '#editor/session.ts'
import type { At } from '#editor/files.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Entry as Asset } from '#plugins/loader/loader.sim.ts'
import { whereIn as effectsIn } from '#plugins/particle2d/particle2d.extension.tsx'
import { SPACE as EFFECTS } from '#plugins/particle3d/particle3d.extension.tsx'
import type { Key, Volley } from './volley3d.plugin.ts'
import { LOOK, check, flight, velocity, type Look, type Numbers, type Pattern, type Patterns } from './volley3d.sim.ts'
import { PatternName, Patterns as Panel } from './volley3d.components.tsx'

export type { Asset }

// ---------------------------------------------------------------- where the patterns are

// The scene a panel works on, the `world.volley3d` it reads, the file that names (by its path from the
// repo, and its name in the catalogue), the scene's catalogue, the seconds the game steps by, and the
// scene's effects file, by its path from the repo, when it names one.
export type Where = { scene: string; world: Numbers; name: string; path: string; assets: Record<string, Asset>; dt: number; effects: string | undefined }

const pathOf = (url: string) => url.replace(/^\//, '')

// Whether a scene fires rounds, and from which file.
export function whereIn(ed: Editor, scene: string): Where | undefined {
  const s = ed.session
  if (!s) return undefined
  const file = s.files.get(s.path(scene))
  if (!file?.plugins?.includes('volley3d')) return undefined
  const world = (file.world?.volley3d ?? s.game.file.world?.volley3d) as Numbers | undefined
  if (!world) return undefined
  const assets = ((file.world?.loader ?? s.game.file.world?.loader)?.assets ?? {}) as Record<string, Asset>
  const entry = assets[world.patterns]
  if (!entry || entry.type !== 'json') return undefined
  return { scene, world, name: world.patterns, path: pathOf(entry.url), assets, dt: s.rec.dt, effects: effectsIn(ed, scene, EFFECTS)?.path }
}

// The scenes of the open game that fire rounds, in the scene table's order.
export function drawing(ed: Editor): Where[] {
  const s = ed.session
  if (!s) return []
  return [...s.scenes().keys()].flatMap(n => whereIn(ed, n) ?? [])
}

// The patterns a panel works on: of the scene selected, else of the one the game view shows, else of
// the first that fires rounds.
export function focus(ed: Editor): Where | undefined {
  const all = drawing(ed)
  const sel = ed.selection && 'scene' in ed.selection ? ed.selection.scene : undefined
  return all.find(w => w.scene === sel) ?? all.find(w => w.scene === ed.session?.viewing) ?? all[0]
}

// The patterns a field of `owner` names from: the file itself when it is a patterns file, else the
// file of the owner's scene, else of the scene the panel works on.
export function whereFor(ed: Editor, owner: FieldProps['owner']): Where | undefined {
  const all = drawing(ed)
  return (owner.file ? all.find(w => w.path === owner.file) : undefined) ?? (owner.scene ? all.find(w => w.scene === owner.scene) : undefined) ?? focus(ed)
}

// ---------------------------------------------------------------- the fields

// A field of a pattern: where it is in the pattern, its label with its unit, what it is, the type it
// is bound to when its shape does not say, whether a pattern needs it, and the value adding it writes,
// the one volley3d reads when the pattern leaves it out.
export type Spec = { at: string[]; label: string; title: string; type?: string; needed?: boolean; absent(p: Pattern, c: Context): unknown }
// What a field's value when left out depends on: the effects of the scene's effects file, and the
// effect the file's patterns name first in each place of a look.
export type Context = { effects: string[] | undefined; firsts: Look }

// The speed a pattern reaches at the end of its life, or its speed as fired when that is more: a max
// that changes nothing.
export const topOf = (p: Pattern) => Math.max(p.speed, p.speed + (p.accel ?? 0) * p.life)

// Every field of a pattern but its look, in the order the sim's header gives them, then its look's.
export const SPECS: Spec[] = [
  { at: ['speed'], label: 'speed (m/s)', title: 'metres a second along its aim the moment it is fired', needed: true, absent: () => 40 },
  { at: ['accel'], label: 'accel (m/s²)', title: 'metres a second added to its speed every second, a negative one taking them away', absent: () => 0 },
  { at: ['max'], label: 'max (m/s)', title: 'the speed along its aim it never goes over; left out, none', absent: p => topOf(p) },
  { at: ['g'], label: 'g (m/s²)', title: 'metres a second² it falls, on its own, beside its speed along its aim', absent: () => 0 },
  { at: ['life'], label: 'life (s)', title: 'the seconds it flies before it ends where it is, having met nothing', needed: true, absent: () => 3 },
  { at: ['radius'], label: 'radius (m)', title: 'how far a body may be off its line and still be met', absent: () => 0 },
  { at: ['splash'], label: 'splash (m)', title: 'every body but the one it met nearer than this to where it met something is splashed', absent: () => 0 },
  { at: ['seek'], label: 'seek (°/s)', title: 'how fast its aim turns toward the target it was fired at; left out, it flies straight', type: 'angle', absent: () => 0 },
  ...LOOK.map((k): Spec => ({
    at: ['look', k],
    label: `look ${k}`,
    title: { body: 'the effect carried with it while it flies', trail: 'the effect thrown from it as it goes', burst: 'the effect thrown where it met something, back the way it came' }[k],
    type: 'particle3d.effect',
    absent: (_, c) => c.firsts[k] ?? c.effects?.[0],
  })),
]

// ---------------------------------------------------------------- reading the file

// The value at `at` inside `v`, or undefined.
export const valueAt = (v: unknown, at: At): unknown => at.reduce<unknown>((o, k) => (o !== null && typeof o === 'object' ? (o as Record<string | number, unknown>)[k] : undefined), v)

// The effect the file's patterns name first in each place of a look.
export function firsts(file: Patterns): Look {
  const out: Look = {}
  for (const p of Object.values(file.patterns)) for (const k of LOOK) if (out[k] === undefined && typeof p.look?.[k] === 'string') out[k] = p.look[k]
  return out
}

// Every reason the page would throw drawing a round of a pattern, and whether the scene's effects,
// `effects`, undefined until they have been read, are still to be read before it can be told.
export type Survey = { problems: string[]; waiting: boolean }

export function survey(file: Patterns, name: string, effects: string[] | undefined, from: string): Survey {
  const p = file.patterns[name]
  if (!p) return { problems: [`there is no pattern ${name}`], waiting: false }
  try {
    check({ patterns: { [name]: p } }, {})
  } catch (e) {
    return { problems: [(e as Error).message], waiting: false }
  }
  const problems: string[] = []
  let waiting = false
  for (const k of LOOK) {
    const fx = p.look[k]
    if (fx === undefined) continue
    if (!effects) waiting = true
    else if (!effects.includes(fx)) problems.push(`its look's ${k} ${fx} is no effect of ${from}`)
  }
  return { problems, waiting }
}

// A place a name is written: the file, by its path from the repo, and the value's path in it.
export type Naming = { file: string; at: At }

// Every place that names the pattern `name`: every string value equal to it in the other files, each a
// parsed json entry of the catalogue.
export function namings(path: string, name: string, others: { path: string; value: unknown }[]): Naming[] {
  const out: Naming[] = []
  const walk = (file: string, v: unknown, at: At) => {
    if (v === name) out.push({ file, at })
    else if (Array.isArray(v)) v.forEach((x, i) => walk(file, x, [...at, i]))
    else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(file, x, [...at, k])
  }
  for (const o of others) if (o.path !== path) walk(o.path, o.value, [])
  return out
}

// The edits that rename pattern `from` to `to`: it set whole under `to`, and `from` removed.
export function renaming(file: Patterns, path: string, from: string, to: string): { file: string; at: At; value: unknown }[] {
  return [
    { file: path, at: ['patterns', to], value: file.patterns[from] },
    { file: path, at: ['patterns', from], value: undefined },
  ]
}

// A new pattern: 40 metres a second for 3 seconds, drawn as the file's first pattern is.
export function fresh(file: Patterns): Pattern {
  const first = Object.values(file.patterns)[0]
  return { speed: 40, life: 3, look: { ...first?.look } }
}

// ---------------------------------------------------------------- the plot

// A round of a pattern seen from the side, fired `elevation` radians over level: at every step of `dt`
// to the end of its life, [the metres it has gone along the ground, its height]; where it is when its
// life ends; its top and the second it is there; where and when it first comes back down through the
// height it was fired from, when it does; and the fastest it goes.
export type Plot = {
  points: [number, number][]; end: [number, number]; top: { height: number; when: number }
  down: { along: number; when: number } | undefined; fastest: number
}

export function plot(p: Pattern, elevation: number, dt: number): Plot {
  const dir = [Math.cos(elevation), Math.sin(elevation), 0]
  const steps = Math.ceil(p.life / dt - 1e-9)
  const points: [number, number][] = []
  let top = { height: 0, when: 0 }, down: Plot['down'], fastest = 0
  for (let i = 0; i <= steps; i++) {
    const t = Math.min(i * dt, p.life)
    const [x, y] = flight(p, [0, 0, 0], dir, t)
    const v = velocity(p, dir, t)
    fastest = Math.max(fastest, Math.hypot(v[0], v[1], v[2]))
    if (y > top.height) top = { height: y, when: t }
    const last = points[points.length - 1]
    if (!down && last && y < 0 && last[1] >= 0) {
      const k = last[1] / (last[1] - y), was = Math.min((i - 1) * dt, p.life)
      down = { along: last[0] + (x - last[0]) * k, when: was + (t - was) * k }
    }
    points.push([x, y])
  }
  return { points, end: points[points.length - 1], top, down, fastest }
}

// How far along the ground a pattern's round goes fired level, in its life.
export const reach = (p: Pattern) => Math.abs(flight(p, [0, 0, 0], [1, 0, 0], p.life)[0])

// ---------------------------------------------------------------- the preview

// The preview's aim: `heading`, degrees from the world's +z toward its +x, `elevation`, degrees over
// level, and `height`, the metres over the loop's point it is fired from.
export type Spawn = { heading: number; elevation: number; height: number }
const SPAWN: Spawn = { heading: 0, elevation: 10, height: 2 }

// The way along a heading and an elevation in degrees, a nine-place figure each, so a right angle's
// cosine is 0, and never −0.
export function aimOf(sp: Pick<Spawn, 'heading' | 'elevation'>): number[] {
  const h = (sp.heading * Math.PI) / 180, e = (sp.elevation * Math.PI) / 180
  const r = (v: number) => Math.round(v * 1e9) / 1e9 + 0
  return [r(Math.sin(h) * Math.cos(e)), r(Math.sin(e)), r(Math.cos(h) * Math.cos(e))]
}

// Where the preview fires from over a point: `height` metres up.
export const muzzleOf = (at: number[], sp: Spawn) => [at[0], at[1] + sp.height, at[2]]

// The way a round would fly, as the stage marks it: from the ground point up to the muzzle, and on
// along its flight to the end of its life in `n` lengths.
export function marks(p: Pattern, at: number[], sp: Spawn, n = 16): number[][] {
  const from = muzzleOf(at, sp), dir = aimOf(sp)
  return [at, ...Array.from({ length: n + 1 }, (_, i) => flight(p, from, dir, (p.life * i) / n))]
}

// The panel's and the tool's shared state: the pattern selected, the loop, the aim, the loop's point,
// and what the last round found.
export type Studio = {
  subscribe(f: () => void): () => void
  version(): number
  pattern: string | undefined
  select(name: string | undefined): void
  loop: boolean
  setLoop(on: boolean): void
  spawn: Spawn
  setSpawn(patch: Partial<Spawn>): void
  // The last point the tool was pressed at, on the scene it was pressed on.
  point: { scene: string; at: number[] } | undefined
  setPoint(point: { scene: string; at: number[] } | undefined): void
  // Why the selected pattern is not being fired, when it is not.
  held: string | undefined
  // Fires the selected pattern once, and says why when it cannot.
  fire(): void
  // The panel is open while the call it hands back has not been made.
  open(): () => void
}

export function volley3d(ed: Editor) {
  const store = 'volley3d.preview'
  const listeners = new Set<() => void>()
  let version = 0
  const changed = () => {
    version++
    for (const f of listeners) f()
  }

  let kept: { pattern?: string; loop?: boolean; spawn?: Partial<Spawn> } = {}
  try {
    kept = JSON.parse(localStorage.getItem(store) ?? '{}')
  } catch {
    kept = {}
  }
  const keep = () => {
    try {
      localStorage.setItem(store, JSON.stringify({ pattern: studio.pattern, loop: studio.loop, spawn: studio.spawn }))
    } catch {
      // A page that keeps nothing previews all the same.
    }
  }

  // Each file's text read once; undefined until the editor has read it, or when it is not JSON.
  const parsed = new Map<string, { text: string; value: unknown }>()
  const reading = new Set<string>()
  const parse = (path: string): unknown => {
    const text = ed.texts.get(path)
    if (text === undefined) {
      if (!reading.has(path)) {
        reading.add(path)
        void ed.text(path).catch(e => ed.error(`${path}: ${(e as Error).message}`)).finally(() => reading.delete(path))
      }
      return undefined
    }
    const had = parsed.get(path)
    if (had?.text === text) return had.value
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      value = undefined
    }
    parsed.set(path, { text, value })
    return value
  }
  // The names of the effects of the scene's effects file, undefined until it has been read.
  const effectsOf = (path: string): string[] | undefined => {
    const file = parse(path) as { effects?: Record<string, unknown> } | undefined
    return file?.effects ? Object.keys(file.effects) : undefined
  }

  // The view's client's plugins, while the view shows the panel's scene.
  const target = () => {
    const w = focus(ed)
    const s = ed.session
    return w && s && s.viewing === w.scene && s.client ? { w, plugins: s.client.plugins } : undefined
  }
  // The point the preview fires over on the scene: the tool's last point there, else the ground under
  // the middle of the view.
  const pointOn = (scene: string, plugins: Plugins): number[] | undefined => {
    if (studio.point?.scene === scene) return studio.point.at
    const canvas = plugins.render3d?.canvas as HTMLCanvasElement | undefined
    return canvas && ed.staged?.ground(canvas.width / 2, canvas.height / 2)
  }

  let last: Key | undefined
  // The round the preview would fire now, or why there is none.
  const next = (): { go: () => Key } | { why: string } | undefined => {
    const t = target()
    const name = studio.pattern
    if (!t || !name) return undefined
    const file = parse(t.w.path) as Patterns | undefined
    if (!file?.patterns) return { why: `${t.w.path} has not been read` }
    if (!t.w.effects) return { why: `${t.w.scene} draws no particle3d effects file, which volley3d draws its rounds through` }
    const sv = survey(file, name, effectsOf(t.w.effects), t.w.effects)
    if (sv.problems.length) return { why: `${name} is not fired: ${sv.problems.join('; ')}` }
    if (sv.waiting) return { why: `${name} waits for ${t.w.effects} to be read` }
    const at = pointOn(t.w.scene, t.plugins)
    if (!at) return { why: 'the view has no ground to fire over yet' }
    const sp = studio.spawn
    return { go: () => t.plugins.volley3d.fire(name, muzzleOf(at, sp), aimOf(sp)) }
  }
  const hold = (why: string | undefined) => {
    if (studio.held === why) return
    studio.held = why
    changed()
  }

  // The way the round would fly marked on the stage the view has.
  let marked: { stage: unknown; key: string; off: () => void } | undefined
  const unmark = () => {
    marked?.off()
    marked = undefined
  }
  const mark = () => {
    const t = target()
    const stage = ed.staged
    const file = t && (parse(t.w.path) as Patterns | undefined)
    const p = t && studio.pattern ? file?.patterns?.[studio.pattern] : undefined
    const at = t && p ? pointOn(t.w.scene, t.plugins) : undefined
    if (!t || !stage || !p || !at || typeof p.speed !== 'number' || typeof p.life !== 'number') return unmark()
    const points = marks(p, at, studio.spawn)
    const key = JSON.stringify(points)
    if (marked?.stage === stage && marked.key === key) return
    unmark()
    const css = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    marked = { stage, key, off: stage.mark(points, /^#[0-9a-f]{6}$/i.test(css) ? parseInt(css.slice(1), 16) : 0x4c8dff) }
  }

  // After each frame of the editor's clock while the panel is open (`Session.onFrame`): the mark, and
  // the loop's next round once the last is gone.
  let opened = 0
  const frame = () => {
    try {
      mark()
      const plugins = target()?.plugins
      const flying = !!last && !!plugins && (plugins.volley3d.volleys() as Volley[]).some(v => v.key[0] === last![0] && v.key[1] === last![1])
      if (studio.loop && !flying) {
        const n = next()
        if (n && 'go' in n) {
          last = n.go()
          hold(undefined)
        } else hold(n?.why)
      }
    } catch (e) {
      ed.error(`volley3d preview: ${(e as Error).message}`, (e as Error).stack)
    }
  }
  // The session whose clock the preview follows, the open game's while the panel is open, and the
  // call that stops following it; followed anew as a game is opened or closed (`game`).
  let following: { session: Session; off: () => void } | undefined
  const follow = () => {
    const s = opened ? ed.session : undefined
    if (following?.session === s) return
    following?.off()
    following = s && { session: s, off: s.onFrame(frame) }
  }
  let unwatch: (() => void) | undefined

  const studio: Studio = {
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    version: () => version,
    pattern: kept.pattern,
    select(name) {
      if (studio.pattern === name) return
      studio.pattern = name
      studio.held = undefined
      last = undefined
      keep()
      changed()
    },
    loop: kept.loop ?? true,
    setLoop(on) {
      studio.loop = on
      studio.held = undefined
      keep()
      changed()
    },
    spawn: { ...SPAWN, ...kept.spawn },
    setSpawn(patch) {
      studio.spawn = { ...studio.spawn, ...patch }
      keep()
      changed()
    },
    point: undefined,
    setPoint(point) {
      studio.point = point
      changed()
    },
    held: undefined,
    fire() {
      const n = next()
      if (!n) {
        const w = focus(ed)
        const why = !studio.pattern ? 'no pattern is selected' : w ? `the game view does not show ${w.scene}` : 'no scene fires rounds'
        hold(why)
        return ed.info(`volley3d: ${why}`)
      }
      if ('why' in n) {
        hold(n.why)
        return ed.error(`volley3d: ${n.why}`)
      }
      last = n.go()
      hold(undefined)
    },
    open() {
      opened++
      if (opened === 1) unwatch = ed.subscribe(follow, ['game'])
      follow()
      return () => {
        opened--
        if (opened) return
        unwatch?.()
        unwatch = undefined
        follow()
        unmark()
      }
    },
  }

  function PatternsPanel() {
    return <Panel studio={studio} />
  }
  ed.panel({ id: 'volley3d', title: 'Patterns 3D', area: 'right', component: PatternsPanel })

  ed.tool({
    id: 'volley3d.fire',
    title: 'Fire Pattern 3D',
    key: 'N',
    cursor: 'crosshair',
    down(p: Pointer) {
      const at = p.stage.ground(p.x, p.y)
      if (!at) return
      const w = focus(ed)
      if (w?.scene !== p.scene) return ed.info(`volley3d: the patterns are ${w ? `${w.scene}'s` : 'no scene\'s'}, and the view shows ${p.scene}`)
      studio.setPoint({ scene: p.scene, at: at.map(v => Math.round(v * 1000) / 1000) })
      studio.fire()
    },
  })

  ed.field('volley3d.pattern', PatternName)
  ed.bindFile(path => drawing(ed).some(w => w.path === path), Object.fromEntries(SPECS.filter(s => s.type).map(s => [['patterns', '*', ...s.at].join('.'), s.type!])))
}
