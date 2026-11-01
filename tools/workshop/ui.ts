// The UI workshop's page: a game's title screen, HUD and messages drawn by the game's own looks on core's
// ui plugin over a frame of the game, with no game running, tuned live and saved into the game's files.
// It opens one game (`?game=<game>`, and `&screen=<screen>&state=<state>`), reads it as the server does
// (`/api/ui/<game>`), and imports the game's screens file (`games/<game>/<game>.screens.ts`), whose
// header says what each of its screens, states and things is. A game with no screens file is drawn
// from its config alone: a screen per scene, every style of its `world.ui` laid out as the ui draws
// it (`stylesFile`).
//
// The page makes the plugins a page of the game makes for the screens file's scene: core's own `loader`
// (its catalogue cut to its fonts, its `"for": "ui"` pictures and the definitions file, so every
// typeface the scene names is installed and the ui waits for it as in the game), `store`, `player`
// (the scene's actions, so the controls screen lists them as it does in play) and `ui`, mounted on a
// canvas of the scene's size over the screens file's `backdrop`; the screens file's `stand` adds what
// its looks read beyond those. Each frame they are ticked in the game's order and the chosen screen's
// `draw` is handed its state.
//
// The left column is every screen and its states, in the screens file's words. The right column is the
// screen's things, each by its name and what it is. A click on the canvas picks the smallest thing
// under it (the screens file's `shown`, matched against the keys the ui shows them by); the picked
// thing is outlined on the canvas and its card opens with its controls, and nothing else's:
//   Words   each word of it, by when it shows.
//   Type    a text style's typeface (the catalogue's fonts by their files' names, a clean sans, a
//           monospace), size, colour, bold, outline and its width, and letter spacing.
//   Button  a button style's colour, its colour while picked, its size and corners, and its label's type.
//   Bar     a bar style's size and its track's, fill's and ready colour.
//   Place   where it stands, across and down, in the canvas's pixels.
//   and any other colour or number the screens file names for it.
// Each change is put into the scene and the definitions the page draws from and the screen made again,
// so the next frame shows it; a changed control's name turns amber. Save to game writes every change in
// place, the files' layout kept (`/api/ui/<game>`); Revert drops them. A file of the game written on
// disk loads the page again on the same screen and state, unless there are changes not yet saved.
import { loader } from '#plugins/loader/loader.plugin.ts'
import { jsonAt } from '#plugins/loader/loader.sim.ts'
import { store } from '#plugins/store/store.plugin.ts'
import { player } from '#plugins/player/player.plugin.ts'
import { ui } from '#plugins/ui/ui.plugin.ts'

type Json = any
type Path = (string | number)[]
type Edit = { file: string; path: Path; value: Json }
type Thing = {
  name: string; about: string; shown: string[]; style?: string
  words?: { label: string; path: Path }[]
  place?: { path: Path } | { panel: string }
  colours?: { label: string; path: Path }[]
  numbers?: { label: string; path: Path; step?: number }[]
}
type Screen = { name: string; states: Record<string, string>; things: Thing[]; draw(plugins: Json, state: string): void }
type Scene = { name: string; ui: string; defs: string | null; world: Json; engine: Json; store?: Json }

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

const get = (obj: Json, path: Path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj)
function put(obj: Json, path: Path, value: Json) {
  let o = obj
  for (const k of path.slice(0, -1)) o = o[k] ??= {}
  o[path[path.length - 1]] = structuredClone(value)
}
const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`
const SANS = 'system-ui, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

// A game with no screens file is drawn from its config alone: a screen per scene with a world.ui, each
// laying out every one of that scene's styles as the ui draws it, a button style as a `button` (its
// label a BitmapText when its typeface is one of the catalogue's bitmap fonts, as a game's looks pass
// it), a bar style as a `bar`, a text style as words, and any other style, a fill or a line a look
// hands to a Graphics, as a box drawn with it. The page draws one scene, so the screen asked for
// (`?screen=`) picks it, and choosing another scene's screen loads the page on it.
const PANEL = 'workshop.styles'

// A thing the definitions place on a panel: where its numbers are in the definitions (`at`, and
// `size` for a button or a box), the path of its words, the style it is drawn in, and its card.
// A kind's entry says its panel with `panel`, or a part of an entry is named after the panel it draws
// on (`hud.menu` on the `menu` panel). Inside it, a thing is an object with an `at`: a button when it
// has a `size`, in its own `style` or else the first button style named anywhere in that entry, and
// words when it has none, in its own `style` or else the first text style the entry names. Its words
// are its `text`, or its `words`' first word. A pair of numbers beside a `words` that has a word of
// the same name is that word's place, drawn in the entry's text style.
type Placed = { at: Path; size?: Path; style?: string; text?: Path; label: string; thing: Thing }
function placements(defs: Json, panels: Record<string, Json>, styles: Record<string, Json>): Record<string, Placed[]> {
  const out: Record<string, Placed[]> = {}
  const pair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number')
  const named = (o: Json, kind: string): string | undefined => {
    if (!o || typeof o !== 'object') return undefined
    if (typeof o.style === 'string' && styles[o.style] && kindOf(styles[o.style]) === kind) return o.style
    for (const v of Object.values(o)) { const s = named(v, kind); if (s) return s }
    return undefined
  }
  const firstWord = (w: Json, path: Path): Path | undefined => {
    if (typeof w === 'string') return path
    if (w && typeof w === 'object') for (const [k, v] of Object.entries(w)) { const p = firstWord(v, [...path, k]); if (p) return p }
    return undefined
  }
  const walk = (o: Json, path: Path, panel: string, button: string | undefined, text: string | undefined) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return
    const list = (out[panel] ??= [])
    const at = (p: Path, label: string, size?: Path, style?: string, words?: Path) => {
      const shown = `${panel}/${p.join('.')}`
      list.push({
        at: p, size, style, text: words, label,
        thing: {
          name: (p[p.length - 1] === 'at' ? p.slice(0, -1) : p).join('.'),
          about: `${size ? 'a button' : 'words'} on the ${panel} panel`,
          shown: [shown], style,
          ...(words ? { words: [{ label: 'Words', path: words }] } : {}),
          place: { path: p },
        },
      })
    }
    if (pair(o.at)) {
      const size = pair(o.size) ? [...path, 'size'] : undefined
      const style = typeof o.style === 'string' && styles[o.style] ? o.style : size ? button : text
      const words = typeof o.text === 'string' ? [...path, 'text'] : o.words ? firstWord(o.words, [...path, 'words']) : undefined
      at([...path, 'at'], String(path[path.length - 1]), size, style, words)
    }
    if (o.words && typeof o.words === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'at' || k === 'size' || !pair(v) || typeof o.words[k] !== 'string') continue
        at([...path, k], k, undefined, text, [...path, 'words', k])
      }
    }
    for (const [k, v] of Object.entries(o)) if (k !== 'words') walk(v, [...path, k], panel, button, text)
  }
  for (const [kind, entry] of Object.entries(defs ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Json
    if (typeof e.panel === 'string' && panels[e.panel]) walk(e, [kind], e.panel, named(e, 'button'), named(e, 'text'))
    const parts = (o: Json, path: Path) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return
      for (const [k, v] of Object.entries(o)) {
        if (panels[k] && v && typeof v === 'object' && !Array.isArray(v) && path.length) walk(v, [...path, k], k, named(e, 'button'), named(e, 'text'))
        else if (path.length < 3) parts(v, [...path, k])
      }
    }
    parts(e, [kind])
  }
  for (const k of Object.keys(out)) if (!out[k].length) delete out[k]
  return out
}

// One panel's things, each where the definitions put it, on the panel placed as `world.ui` places
// it. A thing in no style the scene has is drawn in the workshop's own small type, so it is seen.
function drawPanel(plugins: Json, panel: string, things: Placed[], defs: Json, bitmap: (f: unknown) => boolean) {
  const { ui } = plugins
  const PIXI = ui.PIXI
  const get = (p: Path) => p.reduce((o: Json, k) => (o == null ? undefined : o[k]), defs)
  // The panel's own box, so where it lies on the canvas is seen with nothing on it.
  const size = plugins.wire.scene.world.ui.panels[panel].size
  if (size) ui.show(panel, 'workshop.box', () => new PIXI.Graphics().rect(0, 0, size[0], size[1]).stroke({ color: 0x5ab0ff, width: 1, alpha: 0.6 }))
  const keys = new Set<string>()
  for (const t of things) {
    const key = t.at.join('.')
    if (keys.has(key)) continue
    keys.add(key)
    const [x, y] = get(t.at)
    const words = t.text ? String(get(t.text)) : t.label.toUpperCase()
    const s = t.style ? ui.style(t.style) : undefined
    let it
    if (t.size) {
      const [w, h] = get(t.size)
      it = s && kindOf(s) === 'button'
        ? ui.show(panel, key, () => ui.button({ ...s, size: [w, h], label: words, bitmap: bitmap(s.text.fontFamily) }))
        : ui.show(panel, key, () => new PIXI.Graphics().rect(0, 0, w, h).stroke({ color: 0x5ab0ff, width: 1 }))
    } else if (s && kindOf(s) === 'text') {
      it = ui.show(panel, key, () => (bitmap(s.fontFamily) ? new PIXI.BitmapText({ text: words, style: s }) : new PIXI.Text({ text: words, style: s })))
    } else {
      it = ui.show(panel, key, () => new PIXI.Text({ text: words, style: { fontFamily: MONO, fontSize: 12, fill: 0x9aa0a6 } }))
    }
    it.position.set(x, y)
  }
}
const kindOf = (s: Json) => (s.track !== undefined ? 'bar' : s.text !== undefined ? 'button' : s.fontFamily !== undefined || s.fontSize !== undefined ? 'text' : 'paint')
function stylesFile(scenes: Scene[], asked: string | null) {
  const scene = scenes.find(s => s.name === asked) ?? scenes[0]
  const styles: Record<string, Json> = scene.world.ui.styles ?? {}
  const assets: Record<string, Json> = scene.world.loader?.assets ?? {}
  const bitmap = (family: unknown) => typeof family === 'string' && assets[family]?.type === 'bitmapfont'
  const names = Object.keys(styles).sort()
  const ABOUT = { bar: 'a bar style', button: 'a button style', text: 'a text style', paint: 'a fill or line style' }
  const panels: Record<string, Json> = scene.world.ui.panels ?? {}
  const sheet = names.map(n => ({ name: n, about: ABOUT[kindOf(styles[n]) as keyof typeof ABOUT], shown: [`${PANEL}/${n}`], style: n }))
  // The things the definitions place on each panel, read once the definitions have landed.
  let placed: Record<string, Placed[]> | undefined, defsOf: Json = {}
  const screen = (name: string): Screen & { scene: string } => ({
    name, scene: name,
    get states() {
      return { all: 'Every style', ...Object.fromEntries(Object.keys(placed ?? {}).map(p => [p, `Panel ${p}`])) }
    },
    get things() {
      if (name !== scene.name) return []
      return [...sheet, ...Object.values(placed ?? {}).flat().map(p => p.thing)]
    },
    draw(plugins: Json, state: string) {
      const { ui } = plugins
      const PIXI = ui.PIXI
      if (Object.entries(assets).some(([k, a]) => a.type === 'bitmapfont' && plugins.loader.get(k) === undefined)) return
      if (state !== 'all') return drawPanel(plugins, state, placed?.[state] ?? [], defsOf, bitmap)
      const height = scene.engine.height
      const GAP = 14, LEFT = 24, SAMPLE = 130, SPACE = 32
      let x = LEFT, y = 24, right = 0
      for (const n of names) {
        const s = ui.style(n), kind = kindOf(s)
        const tall = kind === 'button' ? (s.size?.[1] ?? 32) : kind === 'bar' ? (s.size?.[1] ?? 12) + 2 * (s.edge ?? 0) : kind === 'text' ? Math.ceil((s.fontSize ?? 26) * 1.3) : 24
        if (y + tall > height - 24 && y > 24) { x = right + SPACE; y = 24; right = 0 }
        const caption = ui.show(PANEL, `${n}.name`, () => new PIXI.Text({ text: n, style: { fontFamily: MONO, fontSize: 12, fill: 0x9aa0a6 } }))
        caption.position.set(x, y + tall / 2 - 8)
        let it
        if (kind === 'button') {
          const words = n.split('.').pop()!.toUpperCase()
          it = ui.show(PANEL, n, () => ui.button({ ...s, size: s.size ?? [160, 32], label: words, bitmap: bitmap(s.text.fontFamily) }))
        } else if (kind === 'bar') {
          it = ui.show(PANEL, n, () => ui.bar({ ...s, size: s.size ?? [160, 12] }))
          it.set(0.6, s.fill ?? { color: 0xffffff })
        } else if (kind === 'text') {
          const words = `${n.split('.').pop()!.toUpperCase()} 12`
          it = ui.show(PANEL, n, () => (bitmap(s.fontFamily) ? new PIXI.BitmapText({ text: words, style: s }) : new PIXI.Text({ text: words, style: s })))
        } else {
          it = ui.show(PANEL, n, () => {
            const g = new PIXI.Graphics().rect(0, 0, 160, 24)
            return s.width !== undefined ? g.stroke(s) : g.fill(s)
          })
        }
        it.position.set(x + SAMPLE, y)
        right = Math.max(right, x + SAMPLE + it.width)
        y += tall + GAP
      }
    },
  })
  return {
    scene: scene.name,
    backdrop: null,
    // Called with the definitions once they have landed, and the same object every edit writes into.
    place(defs: Json) {
      defsOf = defs
      placed = placements(defs, panels, styles)
    },
    panel: { anchor: 'top-left', at: [0, 0], size: [scene.engine.width, scene.engine.height] },
    stand() {},
    screens: Object.fromEntries(scenes.map(s => [s.name, screen(s.name)])),
  }
}

async function main() {
  const games: string[] = await (await fetch('/api/games')).json()
  const pick = $<HTMLSelectElement>('#game')
  for (const g of games) pick.append(new Option(g, g, false, g === game))
  pick.onchange = () => { location.search = `?game=${pick.value}` }
  if (!game) return fail('Choose a game.')

  const sum = await (await fetch(`/api/ui/${game}`)).json()
  if (sum.error) return fail(sum.error)
  if (!sum.scenes.length) return fail(`${game} has no scene with a world.ui`)
  const file = sum.screens ? await import(sum.screens) : stylesFile(sum.scenes, query.get('screen'))
  const screens: Record<string, Screen> = file.screens
  const found: Scene | undefined = sum.scenes.find((s: Scene) => s.name === file.scene)
  if (!found) return fail(`${game}'s screens file draws in ${file.scene}, which gives no world.ui`)
  const scene: Scene = found
  if (file.backdrop) $('#back').style.backgroundImage = `url("${file.backdrop}")`

  // The scene the page draws from: its world as the game loads it, its catalogue cut to the fonts, the
  // ui's pictures and the definitions file.
  const world = structuredClone(scene.world)
  // The panel a game drawn from its config alone lays its styles on, the page's own, never saved.
  if (file.panel) world.ui.panels = { ...world.ui.panels, [PANEL]: file.panel }
  const assets: Record<string, Json> = world.loader?.assets ?? {}
  world.loader = { ...world.loader, assets: Object.fromEntries(Object.entries(assets).filter(([k, e]) => e.type === 'font' || e.for === 'ui' || k === world.defs)) }
  const defsUrl = assets[world.defs]?.url
  const defs = defsUrl ? await jsonAt(world.defs, defsUrl) : {}
  const pristine = { world: structuredClone(world), defs: structuredClone(defs) }
  file.place?.(defs)
  // The typefaces offered: each font of the catalogue by its file's name, a clean sans and a monospace.
  const faces: [string, string][] = [
    ...Object.entries(world.loader.assets).filter(([, e]: [string, Json]) => e.type === 'font')
      .map(([k, e]: [string, Json]): [string, string] => [k, String(e.url).split('/').pop()!.replace(/\.\w+$/, '').replace(/-.*$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')]),
    [SANS, 'Clean sans'],
    [MONO, 'Monospace'],
  ]

  const names = Object.keys(screens)
  let screen = names.includes(query.get('screen') ?? '') ? query.get('screen')! : names[0]
  const statesOf = (s: string) => Object.keys(screens[s].states)
  let state = statesOf(screen).includes(query.get('state') ?? '') ? query.get('state')! : statesOf(screen)[0]
  let picked: Thing | undefined
  const edits = new Map<string, Edit>()
  const keyOf = (file: string, path: Path) => `${file} ${JSON.stringify(path)}`

  // A value of the ui file (its path starts at `world`) or of the definitions, as the page draws it.
  const uiFile = scene.ui, defsFile = scene.defs ?? ''
  const read = (f: string, path: Path) => (f === uiFile ? get({ world }, path) : get(defs, path))
  const changed = (f: string, path: Path) => [...edits.values()].some(e => e.file === f && JSON.stringify(e.path.slice(0, path.length)) === JSON.stringify(path))
  const apply = () => {
    for (const e of edits.values()) {
      if (e.file === uiFile) put({ world }, e.path, e.value)
      else put(defs, e.path, e.value)
    }
  }

  // ---- the page's plugins ----

  const frame = $('#frame'), marks = $('#marks')
  const link = { store: {} as Record<string, Json> }
  let plugins: Json
  let built = false
  function build() {
    if (plugins) {
      plugins.ui.close()
      plugins.player.close()
    }
    apply()
    const engine = { ...scene.engine }
    const wire = { scene: { world, prefabs: { engine, store: scene.store ?? {} } }, rows: [], n: 1, between: undefined, send() {} }
    plugins = { wire, scenemanager: { link }, loader: loader(), store: store(), player: player(), ui: ui() }
    file.stand(plugins)
    const canvas = document.createElement('canvas')
    canvas.width = engine.width
    canvas.height = engine.height
    frame.style.width = `${engine.width}px`
    frame.style.height = `${engine.height}px`
    frame.insertBefore(canvas, marks)
    plugins.ui.mount(canvas)
    built = true
    fit()
    history.replaceState(null, '', `?game=${game}&screen=${screen}&state=${encodeURIComponent(state)}`)
  }

  // Every thing on the canvas that is `t`, with its box in the canvas's pixels.
  function shownOf(t: Thing): { x: number; y: number; width: number; height: number }[] {
    const out = []
    for (const s of t.shown) {
      const [panel, key] = s.split('/')
      let box
      try { box = plugins.ui.panel(panel) } catch { continue }
      for (const c of box.children) {
        const label = String(c.label ?? '')
        if (!(key.endsWith('*') ? label.startsWith(key.slice(0, -1)) : label === key) || !c.visible) continue
        const b = c.getBounds()
        if (b.width > 0 && b.height > 0) out.push({ x: b.x, y: b.y, width: b.width, height: b.height })
      }
    }
    return out
  }

  function step() {
    requestAnimationFrame(step)
    if (!built) return
    try {
      plugins.loader.tick(plugins)
      plugins.store.tick(plugins)
      plugins.player.tick(plugins)
      plugins.ui.tick(plugins)
      screens[screen].draw(plugins, state)
      plugins.ui.afterTick()
      plugins.player.afterTick()
      clearFail()
    } catch (e) {
      fail(e)
      built = false
      return
    }
    // The picked thing outlined where it is drawn this frame.
    const boxes = picked ? shownOf(picked) : []
    while (marks.children.length > boxes.length) marks.lastChild!.remove()
    while (marks.children.length < boxes.length) marks.append(make('div'))
    boxes.forEach((b, i) => {
      const m = marks.children[i] as HTMLElement
      m.style.left = `${b.x - 4}px`; m.style.top = `${b.y - 4}px`
      m.style.width = `${b.width + 8}px`; m.style.height = `${b.height + 8}px`
    })
  }

  // The canvas as big as the view lets it be, never past its own pixels.
  let shown = 1
  function fit() {
    const view = $('#view')
    const w = frame.offsetWidth, h = frame.offsetHeight
    shown = Math.min(1, (view.clientWidth - 48) / w, (view.clientHeight - 64) / h)
    frame.style.transform = `translate(-50%, -50%) scale(${shown})`
  }
  addEventListener('resize', fit)

  // A click picks the smallest thing under it.
  frame.addEventListener('click', e => {
    const r = frame.getBoundingClientRect()
    const x = (e.clientX - r.left) / shown, y = (e.clientY - r.top) / shown
    let best: Thing | undefined, area = Infinity
    for (const t of screens[screen].things) {
      for (const b of shownOf(t)) {
        if (x < b.x || y < b.y || x > b.x + b.width || y > b.y + b.height) continue
        if (b.width * b.height < area) { area = b.width * b.height; best = t }
      }
    }
    picked = best
    editor()
    if (best) document.querySelector('.thing.on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  // ---- the left column and the header ----

  function nav() {
    const host = $('#nav')
    host.replaceChildren()
    for (const s of names) {
      host.append(make('div', 'screen', screens[s].name))
      for (const [st, words] of Object.entries(screens[s].states)) {
        const b = make('button', 'state', words)
        b.classList.toggle('on', s === screen && st === state)
        b.onclick = () => {
          // A screen of another scene is drawn by a page loaded on that scene.
          const of = (screens[s] as Screen & { scene?: string }).scene
          if (of && of !== scene.name) { location.search = `?game=${game}&screen=${encodeURIComponent(s)}`; return }
          const other = s !== screen
          screen = s; state = st
          if (other) picked = undefined
          nav(); build(); editor()
        }
        host.append(b)
      }
    }
  }
  function status() {
    const dirty = edits.size > 0
    const st = $('#status')
    st.textContent = dirty ? `${edits.size} change${edits.size === 1 ? '' : 's'} not saved` : 'Everything saved'
    st.classList.toggle('dirty', dirty)
    $<HTMLButtonElement>('#save').disabled = !dirty
    $<HTMLButtonElement>('#revert').disabled = !dirty
  }

  $('#revert').onclick = () => {
    edits.clear()
    for (const k of Object.keys(world)) delete world[k]
    Object.assign(world, structuredClone(pristine.world))
    for (const k of Object.keys(defs)) delete defs[k]
    Object.assign(defs, structuredClone(pristine.defs))
    status(); build(); editor()
  }
  $('#save').onclick = async () => {
    const r = await fetch(`/api/ui/${game}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ edits: [...edits.values()] }) })
    const out = await r.json()
    if (!r.ok) return fail(out.error)
    edits.clear()
    location.reload()
  }

  // ---- the right column ----

  // A change to a value, drawn on the next frame.
  const change = (f: string, path: Path, value: Json, row: HTMLElement) => {
    edits.set(keyOf(f, path), { file: f, path, value })
    // An outline begun on a style that had none is drawn with round corners, as every outline is.
    const at = path.lastIndexOf('stroke')
    if (at >= 0 && read(f, [...path.slice(0, at + 1), 'join']) === undefined) {
      const join = [...path.slice(0, at + 1), 'join']
      edits.set(keyOf(f, join), { file: f, path: join, value: 'round' })
    }
    row.classList.add('changed')
    status(); build()
  }
  const line = (host: HTMLElement, label: string, f: string, path: Path) => {
    const row = make('div', 'row')
    row.classList.toggle('changed', changed(f, path))
    const val = make('span', 'val')
    row.append(make('label', '', label), val)
    host.append(row)
    return { row, val }
  }
  const colour = (host: HTMLElement, label: string, f: string, path: Path) => {
    const { row, val } = line(host, label, f, path)
    const v = read(f, path)
    const inp = make('input')
    inp.type = 'color'
    inp.value = typeof v === 'string' ? v : hex(v ?? 0)
    inp.oninput = () => change(f, path, typeof v === 'string' ? inp.value : parseInt(inp.value.slice(1), 16), row)
    val.append(inp)
  }
  const number = (host: HTMLElement, label: string, f: string, path: Path, d: { min?: number; max?: number; step?: number; fallback?: number } = {}) => {
    const { row, val } = line(host, label, f, path)
    const inp = make('input')
    inp.type = d.max !== undefined ? 'range' : 'number'
    if (d.min !== undefined) inp.min = String(d.min)
    if (d.max !== undefined) inp.max = String(d.max)
    inp.step = String(d.step ?? 1)
    inp.value = String(read(f, path) ?? d.fallback ?? 0)
    const n = make('span', 'n', inp.value)
    inp.oninput = () => { if (inp.value === '') return; n.textContent = inp.value; change(f, path, Number(inp.value), row) }
    val.append(inp)
    if (inp.type === 'range') val.append(n)
  }
  const pair = (host: HTMLElement, labels: [string, string], f: string, path: Path) => {
    const v: number[] = read(f, path) ?? [0, 0]
    labels.forEach((label, i) => number(host, label, f, [...path, i], { fallback: v[i] }))
  }

  // A text style's type: typeface, size, colour, bold, outline, letter spacing.
  function type(host: HTMLElement, path: Path) {
    const s = read(uiFile, path) ?? {}
    {
      const { row, val } = line(host, 'Typeface', uiFile, [...path, 'fontFamily'])
      const sel = make('select')
      const known = faces.some(([v]) => v === s.fontFamily)
      for (const [v, label] of faces) sel.append(new Option(label, v, false, v === s.fontFamily))
      if (!known && s.fontFamily) sel.append(new Option(s.fontFamily, s.fontFamily, false, true))
      sel.onchange = () => change(uiFile, [...path, 'fontFamily'], sel.value, row)
      val.append(sel)
    }
    number(host, 'Size', uiFile, [...path, 'fontSize'], { min: 8, max: 200, fallback: 26 })
    colour(host, 'Colour', uiFile, [...path, 'fill'])
    {
      const { row, val } = line(host, 'Bold', uiFile, [...path, 'fontWeight'])
      const box = make('input')
      box.type = 'checkbox'
      box.checked = s.fontWeight === 'bold' || Number(s.fontWeight) >= 600
      box.onchange = () => change(uiFile, [...path, 'fontWeight'], box.checked ? '700' : 'normal', row)
      val.append(box)
    }
    colour(host, 'Outline', uiFile, [...path, 'stroke', 'color'])
    number(host, 'Outline width', uiFile, [...path, 'stroke', 'width'], { min: 0, max: 16, fallback: 0 })
    number(host, 'Letter spacing', uiFile, [...path, 'letterSpacing'], { min: -4, max: 20, step: 0.5, fallback: 0 })
  }

  function card(t: Thing) {
    const c = make('div', 'thing')
    c.classList.toggle('on', t === picked)
    const head = make('div', 'head')
    head.append(make('b', '', t.name), make('span', '', t.about))
    head.onclick = () => { picked = picked === t ? undefined : t; editor() }
    const body = make('div', 'body')
    c.append(head, body)
    if (t !== picked) return c

    if (t.words?.length) {
      body.append(make('div', 'part', 'Words'))
      for (const w of t.words) {
        const box = make('div', 'word')
        box.classList.toggle('changed', changed(defsFile, w.path))
        const inp = make('input')
        inp.type = 'text'
        inp.value = String(read(defsFile, w.path) ?? '')
        inp.oninput = () => change(defsFile, w.path, inp.value, box)
        box.append(make('label', '', w.label), inp)
        body.append(box)
      }
    }
    if (t.style) {
      const path = ['world', 'ui', 'styles', t.style]
      const s = read(uiFile, path) ?? {}
      if (s.track !== undefined) {
        body.append(make('div', 'part', 'Bar'))
        pair(body, ['Width', 'Height'], uiFile, [...path, 'size'])
        colour(body, 'Empty', uiFile, [...path, 'track', 'color'])
        colour(body, 'Filling', uiFile, [...path, 'fill', 'color'])
        if (s.ready !== undefined) colour(body, 'Ready', uiFile, [...path, 'ready', 'color'])
        if (s.frame !== undefined) colour(body, 'Edge', uiFile, [...path, 'frame', 'color'])
      } else if (s.text !== undefined) {
        body.append(make('div', 'part', 'Button'))
        colour(body, 'Colour', uiFile, [...path, 'fill', 'color'])
        colour(body, 'Picked colour', uiFile, [...path, 'focus', 'color'])
        if (s.size) pair(body, ['Width', 'Height'], uiFile, [...path, 'size'])
        number(body, 'Corners', uiFile, [...path, 'radius'], { min: 0, max: 30, fallback: 0 })
        body.append(make('div', 'part', 'Label'))
        number(body, 'Baseline offset', uiFile, [...path, 'baselineOffset'], { min: -20, max: 20, fallback: 0 })
        type(body, [...path, 'text'])
      } else if (kindOf(s) === 'paint') {
        body.append(make('div', 'part', 'Paint'))
        colour(body, 'Colour', uiFile, [...path, 'color'])
        if (s.alpha !== undefined) number(body, 'Alpha', uiFile, [...path, 'alpha'], { min: 0, max: 1, step: 0.05, fallback: 1 })
        if (s.width !== undefined) number(body, 'Width', uiFile, [...path, 'width'], { min: 0, max: 16, fallback: 1 })
      } else {
        body.append(make('div', 'part', 'Type'))
        type(body, path)
      }
    }
    if (t.colours?.length || t.numbers?.length) {
      body.append(make('div', 'part', 'Look'))
      for (const k of t.colours ?? []) colour(body, k.label, defsFile, k.path)
      for (const k of t.numbers ?? []) number(body, k.label, defsFile, k.path, { step: k.step })
    }
    if (t.place) {
      body.append(make('div', 'part', 'Place'))
      if ('panel' in t.place) pair(body, ['Across', 'Down'], uiFile, ['world', 'ui', 'panels', t.place.panel, 'at'])
      else pair(body, ['Across', 'Down'], defsFile, t.place.path)
    }
    return c
  }

  function editor() {
    const host = $('#edit')
    host.replaceChildren(...screens[screen].things.map(card))
  }

  // ---- files written on disk ----

  const events = new EventSource('/api/events')
  events.onmessage = e => {
    const what = String(e.data).replace(/^changed /, '')
    if (!what.startsWith(`games/${game}/`)) return
    if (edits.size === 0) location.reload()
    else $('#status').textContent = `${what.split('/').pop()} changed on disk: save or revert to load it`
  }

  status()
  nav()
  build()
  editor()
  step()
}

main().catch(fail)
