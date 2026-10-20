// The UI: a PixiJS stage of its own, drawn by its own renderer on a transparent canvas the page lays
// over the game's canvas — the same grid cell, the same size: the game renderer's `size`, which is
// the `engine` prefab's, or the window's under render2d's `fit: "window"` — so a click on it carries
// the `offsetX` and `offsetY` a click on the game would. A canvas that changes size, the window
// resized under `fit: "window"`, takes the new size, and every panel is placed again by its anchor. The canvas takes pointer events
// the standard PixiJS way, and `plugins/player`, which listens on the page, asks `hit` before it
// turns a click or a mouse button into a game message. The renderer draws at the screen's pixel
// ratio, so the game may draw at any size under it and the UI stays sharp. When the game's canvas is
// fitted to the window (render2d's `fit`), each of its pixels drawn across the renderer's `scale` CSS
// pixels, the UI's canvas is sized on the page by the same `scale` each frame and drawn at the pixel
// ratio times it, so it still lies over the game's in the same box; its canvas points stay the
// game canvas's, and a page's pointer, in CSS pixels, is divided by `scale` to reach them. A
// scene with nothing but a UI, a menu, names no game renderer at all.
//
// Keys. A key is named as `plugins/player` names it, `keyOf` the event: by its place on the
// keyboard, `a`, `' '`, `Enter`, `Escape`, `ArrowUp`, so one released under Shift is released and
// a table's `m` is the key under the same finger on every layout. A gamepad's keys, `Pad0` and the
// rest, reach it the same way when `plugins/player` plays by actions (`control`), which hands each
// one going down to `keyDown`, and takes it as a game key only when that says the UI did not, and
// each coming up to `keyUp`; so `keys` and a panel's `key` may name them. While the player listens
// for a key to rebind an action to (`listening`), the UI takes none. Every key the UI acts on is named
// in `world.ui`: a panel's `key`, and `keys`, which names, each as one key or a list of them, the
// ones that move the focus `up`, `down`, `left` and `right`, `press` the focused thing, and go
// `back` out of a modal.
//
// Everything it draws is on a panel. A panel is a plain PIXI.Container named in the scene's
// `world.ui`, which places it: `anchor` names a point of the canvas — a corner, the middle of an edge,
// or `center` — and the same point of the panel, `at` moves it that many pixels, `size` is its box
// (its `boundsArea`, which an actor reads to fill it), `clip` hides whatever is drawn outside that
// box, and `layer` draws it over every panel with a lower one, whatever order the actors ran in; of
// two panels on one layer, the one `world.ui` lists later is drawn over the other. `scale` draws the
// panel that many canvas pixels to each of its own, 1 when left out: `size`, `clip` and every place
// an actor puts a thing on it are in the panel's own pixels, and `anchor` and `at` place the scaled
// box on the canvas, so art drawn for a smaller screen is laid out in its own pixels and shown as
// big as the canvas wants. `world.ui` is read off the scene, never sent, since the UI has no row,
// and a `world.ui` in `<game>.scene.json` is every scene's until a scene gives its own.
// `style(name)` hands back a copy of one of its `styles`, each an options object passed as it is to
// PixiJS or to `button`. A text style's `stroke` carries `"join": "round"`: the canvas mitres an
// outline's corners by default, and at a glyph's sharp points it runs out into spikes.
//
// An actor puts a thing on a panel with `show(panel, key, make)`, in its `tick`, every frame it
// wants the thing shown: `make` runs the first time, and the same object comes back every frame
// after that, for the actor to write this frame's values on. The thing is named by its key, PixiJS's
// `label`, so a test, or anything else that reads the panel, finds it without showing it. After a frame in which nobody showed
// it, it is destroyed, with its children and its Graphics contexts; a texture it draws is the
// loader's and stays. So a row that ends takes its UI with it, a thing drawn only sometimes is shown
// behind an `if`, and no `remove` tears anything down. `show` is the only way onto a panel: a panel
// that holds a child `show` did not hand out throws at the end of the frame. What an actor adds
// inside a thing it showed is its own, and goes when that thing goes. Something you cannot see was
// not shown this frame, or was shown somewhere off the canvas, under another panel, or pinned
// behind the camera.
//
// `project` turns a world point into a canvas point, `{ x, y, behind }`, by asking whichever renderer
// the scene names: render3d's `project`, through its camera, or render2d's, through its world and
// camera. `pin` puts a shown thing at a world point's canvas point, measured after every actor has
// ticked, so a nameplate is placed by the camera that frame is drawn with and not the one before
// it: the camera is moved by the seat's own actor, whose row comes after the rows of the level in
// every packet. A thing pinned where the camera draws nothing is not shown.
//
// Surfaces. `surface(name)`, asked in a frame, draws that panel on a surface for the frame instead of
// over the game: it leaves the stage, so it is neither drawn on the UI's canvas nor hit, and at the
// end of the frame it is drawn on the surfaces' canvas, one canvas every surface shares, by a second
// renderer of the UI's own that draws nothing else, so a 3D renderer reads that canvas as a picture,
// one upload a frame for every screen it feeds, straight from one GPU context to the other. The
// surfaces asked in a frame lie side by side along the canvas's top, in the order `world.ui` lists
// them, each its `size` times its `scale` across at the UI's pixel ratio, a pixel apart, on the
// panel's `screen`, a colour, black when left out; the canvas is as big as they need. `surface`
// hands back `{ canvas, box }`, the same object every frame, `box` [x, y, width, height] where the
// panel lies on the canvas in its pixels as the frame ends, or undefined where there is no page to
// draw on, as in node. A frame that does not ask for it puts the panel back on the stage in its
// place by its anchor, so a panel shown on a screen inside a cockpit is back in its corner of the
// canvas the frame the view leaves the cockpit. Everything shown on it is shown as on any panel,
// with `show`. A modal is never drawn on a surface.
//
// Modals. A panel `world.ui` calls `modal` has the input while it shows anything: a see-through
// backdrop the size of the canvas lies under what it shows (drawn in its `backdrop` fill, when
// `world.ui` gives one), so no click reaches anything under it, `hit` is true everywhere, every key goes
// to the UI but `back` on a screen the game put up (below), and `plugins/player`, which asks
// `modal()` each frame, lets go of every key the game held and of the pointer lock. Of two modals
// showing things, the one on the higher layer has the input and the other waits under it. What a
// modal shows decides whether it is up, so a screen the game puts up is a modal its actor shows
// behind the game's own `if`, on a row's `over` say, and it goes when the row says otherwise.
//
// Menus the player opens. `open(name)`, `dismiss(name)` and `opened(name)` are the one place a page
// holds which of its panels are open; a panel whose entry names a `key` is opened by that key when
// no modal has the input. Of the panels whose entries name one `group`, one is open at a time:
// opening one, by `open` or by its key, closes the others, so two panels drawn in one place never
// show together. The menu's actor shows it behind `if (ui.opened(name))`. `back` closes the
// modal that has the input when it is one the player opened, and so does that panel's own key.
// A screen the game put up was not opened, and only a row can take it down, so on it `back` is not
// the UI's: the UI does not take it, `plugins/player` hears it as a game key, and a game that binds
// that key to an act that clears the row's `if` — a pause the server holds, say — backs out of its
// screen with the key that backs out of a menu. Its own key still does nothing there. The open
// panels belong to the client, so a scene the seat moves to starts with none open.
//
// Focus. The focused thing is sent `focus`, and the one it left `blur`, which is how a button shows
// it. When a modal takes the input, the focus goes to the first interactive thing it shows, or,
// when it had the input before and a modal over it has closed, back to what it had focused then;
// and when the thing it has focused goes while it keeps the input, a list shown in place of another
// say, to the first interactive thing it shows then.
// While a modal has the input: `up`, `down`, `left` and `right` move the focus to the nearest
// interactive thing on it in that direction, and `press` sends the focused one `pointertap`, as a
// click on it does. It acts only on a key pressed after it came up: a key already held down when it
// took the input, and every repeat of a held key, is taken and does nothing until it is let go, so a
// game key held as a screen comes up, and bound to `press` too, cannot press a button nobody has
// seen, and `back` held down pauses a game once instead of flipping it with every repeat. The
// pointer over an interactive thing focuses it; the pointer over nothing takes the focus away when
// no modal has the input. `plugins/player` asks `took` before it treats a key as a game key; the UI
// hears every key first, because it listens in the capture phase.
//
// It listens once a page has given it a canvas, from its first tick: keys on the page, the pointer
// on its canvas. A client with no page — a test, a bot — shows, destroys, places and hit-tests the
// same things and draws and listens for nothing. It reads `world.ui` from its `tick`, so a local
// actor that shows things is listed after `ui` in the scene's `plugins`. `mount` hides the canvas
// and the first `afterTick` shows it, so a canvas with nothing drawn on it is never shown.
//
// Between steps. Each frame, just before it draws, every thing on the stage and on a panel drawn on a
// surface is put between where the last two steps left it, as far as the frame's wire says (`steps`,
// `engine/browser.ts`, Drawing between steps): its position in a straight line, its turn the short way
// round, its scale; and once the frame is drawn each is put back where it was set. So a dial's hand
// turned from a row turns as smoothly as the game's own things move under it.
//
// Node has no canvas to measure text on and no image to decode. So a test never reads a `Text`'s
// size, a button is hit by its `hitArea`, and a test whose scene loads a texture for the UI stands
// in for `PIXI.Assets.load`. No layout here or in an actor measures text: columns are numbers in the
// scene file.
//
// What an actor draws with. Actors write plain PixiJS — `Graphics`, `Text`, `Sprite`, `Container`
// and PixiJS's own pointer events — and `button`, `bar` and `iris` are the pieces added: a button
// every menu draws alike, a bar that fills to a fraction, and the circle a screen change closes on
// a point, cut a pixel row at a time as a SNES cut it. In Chrome, `pointertap` and `pointerover`
// fire on the canvas, and a page-level click over it carries the `offsetX` and `offsetY` of a click
// on the game's canvas in the same box (760, 40 and 100, 300 on both). `pin` holds a nameplate on a
// projected head at 0 px over 85 frames of turning while that point moves up to 48 px a frame.
// `show` is called every frame because every value arrives every frame anyway — a row's fields come
// in each packet whether they changed or not — so an actor writes them each frame either way, and
// PixiJS's `Text` skips a string equal to the one it has. Whether a thing exists is answered in the
// same line that writes its value. Ruled out:
// - Drawing into the game's WebGL context. PixiJS v8 can (init on three's context with
//   `clearBeforeRender: false` and `resetState()` on both sides each frame), and it saves the second
//   context and nothing else: three and PixiJS upload their own copy of a texture either way,
//   `render2d` and `render3d` would have to hand out their renderers, three would need
//   `stencil: true`, and PixiJS pointer events on a borrowed context were never proved.
// - A library of atoms (`box`, `text`, `image`, `group`) wrapping PixiJS. PixiJS is the atoms.
// - UI declared as JSON in the scene file and bound to row fields. Every condition and every
//   formatted string would need a binding language.
// - Build in `setup`, change in `tick`, destroy in `remove` as the only way. Every actor would have
//   to get its teardown right, and one that did not would leave its UI drawn.
// - One actor that brokers every other actor's UI. Every actor already has the whole packet each
//   frame, so the broker would be a second copy of it, a frame late whenever its row ticks before
//   the row that wrote.
// - Laying out around measured text. Node cannot measure PixiJS text, so every test of such a
//   layout would need a native canvas package.
//
// One of these per client. `close` removes every listener it added, destroys the renderer, which
// gives back its WebGL context, and takes the canvas off the page.
import * as PIXI from 'pixi.js'
// The hit test and the focus run on the stage whether or not a renderer exists, and need the
// event mixin a renderer would otherwise load.
import 'pixi.js/events'
import { mixing, steps, type Plugins } from '#engine/browser.ts'
import { keyOf, type Keys } from '#plugins/player/player.plugin.ts'

// The point of the canvas, and of the panel, that each anchor names, as fractions of the width and
// the height.
const ANCHORS: Record<string, [number, number]> = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0],
  left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
}

// The way each of `world.ui`'s focus keys moves the focus across the canvas.
const WAYS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const

export type Spec = {
  anchor: string
  at?: [number, number]
  size?: [number, number]
  clip?: boolean
  layer?: number
  modal?: boolean
  backdrop?: PIXI.FillInput
  key?: string
  scale?: number
  group?: string
  screen?: PIXI.ColorSource
}
export type Table = {
  panels: Record<string, Spec>
  styles: Record<string, Record<string, any>>
  keys: Record<keyof typeof WAYS | 'press' | 'back', Keys>
}
export type Button = {
  size: [number, number]
  radius?: number
  fill: PIXI.FillInput
  focus: PIXI.FillInput
  text: Partial<PIXI.TextStyleOptions>
  label: string
  bitmap?: boolean
}

// A button: a plain PIXI.Container of a background and a label centred on it, which the pointer
// hits as one thing — its label is never hit apart from it — drawn with `focus` while the UI has it
// focused and `fill` otherwise. With `bitmap` its label is a `BitmapText`, so a style whose
// `fontFamily` is a loaded bitmap font's name draws it in that font. What it does is the actor's:
// `on('pointertap', ...)`, which hands the button back, so a button that does something is one
// expression.
export function button(o: Button): PIXI.Container {
  const [w, h] = o.size
  const b = new PIXI.Container()
  b.eventMode = 'static'
  b.cursor = 'pointer'
  b.interactiveChildren = false
  b.hitArea = new PIXI.Rectangle(0, 0, w, h)
  const back = new PIXI.Graphics()
  const paint = (fill: PIXI.FillInput) => back.clear().roundRect(0, 0, w, h, o.radius ?? 0).fill(fill)
  paint(o.fill)
  const label = o.bitmap ? new PIXI.BitmapText({ text: o.label, style: o.text, anchor: 0.5 }) : new PIXI.Text({ text: o.label, style: o.text, anchor: 0.5 })
  label.position.set(w / 2, h / 2)
  b.addChild(back, label)
  b.on('focus', () => paint(o.focus))
  b.on('blur', () => paint(o.fill))
  return b
}

export type Bar = { size: [number, number]; edge?: number; frame?: PIXI.FillInput; track: PIXI.FillInput }

// A bar: a plain PIXI.Container of a `track` `size` pixels across, with a frame `edge` pixels thick
// all round it in `frame`, and `set(k, fill)` fills the part `k` of the track, 0 to 1, from its
// left, in `fill`, to a whole pixel. Its top left is the track's, so the frame lies outside it.
export function bar(o: Bar): PIXI.Container & { set(k: number, fill: PIXI.FillInput): void } {
  const [w, h] = o.size, e = o.edge ?? 0
  const b = new PIXI.Container() as PIXI.Container & { set(k: number, fill: PIXI.FillInput): void }
  const back = new PIXI.Graphics()
  if (e) back.rect(-e, -e, w + 2 * e, h + 2 * e).fill(o.frame ?? { color: 0 })
  back.rect(0, 0, w, h).fill(o.track)
  const full = new PIXI.Graphics()
  b.addChild(back, full)
  b.set = (k, fill) => {
    const across = Math.max(0, Math.min(w, Math.round(w * k)))
    full.clear()
    if (across) full.rect(0, 0, across, h).fill(fill)
  }
  return b
}

export type Iris = { size: [number, number]; fill?: PIXI.FillInput }

// An iris: a plain PIXI.Graphics covering a box `size` pixels across in `fill`, black when left
// out, but for a circle, `set(x, y, r)`: the circle of radius `r` pixels about the point (x, y) of
// the box shows through, cut a row of pixels at a time as a SNES's window cuts a line of the screen,
// each row open across the whole pixels whose middles are inside the circle at the row's middle. So
// its edge steps a whole pixel, as the circle a SNES game closes on its hero does. `r` 0 covers the
// box, and one past its far corner from (x, y) covers none of it. Rows cut alike are one rectangle.
export function iris(o: Iris): PIXI.Graphics & { set(x: number, y: number, r: number): void } {
  const [w, h] = o.size, fill = o.fill ?? { color: 0 }
  const g = new PIXI.Graphics() as PIXI.Graphics & { set(x: number, y: number, r: number): void }
  g.set = (x, y, r) => {
    g.clear()
    // Each row's open span, [from, to) in pixels, empty when from is to.
    const open = Array.from({ length: h }, (_, j): [number, number] => {
      const dy = j + 0.5 - y
      if (Math.abs(dy) >= r) return [0, 0]
      const half = Math.sqrt(r * r - dy * dy)
      const from = Math.max(0, Math.ceil(x - half - 0.5)), to = Math.min(w, Math.floor(x + half - 0.5) + 1)
      return from < to ? [from, to] : [0, 0]
    })
    for (let j = 0; j < h;) {
      const [from, to] = open[j]
      let k = j + 1
      while (k < h && open[k][0] === from && open[k][1] === to) k++
      if (from === to) g.rect(0, j, w, k - j).fill(fill)
      else {
        if (from > 0) g.rect(0, j, from, k - j).fill(fill)
        if (to < w) g.rect(to, j, w - to, k - j).fill(fill)
      }
      j = k
    }
  }
  return g
}

// `backdrop` is a modal's see-through cover of the canvas, on the stage just under the modal's own
// panel and over every panel under that, so a panel's children are only what actors showed on it
// and the clip's `mask`.
type Panel = {
  name: string
  box: PIXI.Container
  spec: Spec
  mask?: PIXI.Graphics
  backdrop?: PIXI.Graphics
  shown: Map<string, PIXI.Container>
  asked: Set<string>
  // Drawn on a surface, asked to be this frame, and where on the surfaces' canvas.
  surfaced?: boolean
  wanted?: boolean
  surface?: Surface
}

// Where a panel drawn on a surface lies: the surfaces' canvas and its box on it, in the canvas's
// pixels.
export type Surface = { canvas: HTMLCanvasElement; box: [number, number, number, number] }

export function ui() {
  const stage = new PIXI.Container({ isRenderGroup: true })
  const grounds = new PIXI.Graphics() // each surface's colour, under it on the surfaces' canvas
  stage.sortableChildren = true
  const boundary = new PIXI.EventBoundary(stage)
  const panels = new Map<string, Panel>()
  const pins = new Map<PIXI.Container, number[]>()
  const open = new Set<string>()
  const had = new Map<Panel, PIXI.Container>() // the focus a modal had when a modal over it took the input
  let renderer: PIXI.Renderer | undefined
  let surfacer: PIXI.Renderer | undefined // the renderer of the surfaces' canvas
  let plugins: Plugins | undefined
  let closed = false
  let listening = false
  let focus: PIXI.Container | undefined
  let owner: Panel | undefined // the modal that had the input at the end of the last frame
  let taken: Event | undefined
  const down = new Set<string>() // the keys held on the page, each by its place on the keyboard (`keyOf`)
  let stale = new Set<string>() // the keys that were held when the modal that has the input took it
  // Every thing's position, turn and scale after the last two steps (Between steps).
  const between = steps<PIXI.Container>(
    c => [c.position.x, c.position.y, c.rotation, c.scale.x, c.scale.y],
    (c, p) => { c.position.set(p[0], p[1]); c.rotation = p[2]; c.scale.set(p[3], p[4]) },
    mixing([2]),
    (c, on) => { if (on !== undefined) c.visible = on; return c.visible },
  )
  // A container and everything on it, after what `out` holds.
  const all = (c: PIXI.Container, out: PIXI.Container[] = []) => {
    out.push(c)
    for (const child of c.children) all(child, out)
    return out
  }

  const table = (): Table => {
    if (!plugins) throw new Error('ui has not ticked yet')
    const p = plugins.wire.scene.world?.ui
    if (!p) throw new Error('scene lists ui but has no world.ui')
    return p
  }

  const spec = (name: string): Spec => {
    const s = table().panels?.[name]
    if (!s) throw new Error(`ui has no panel ${name}`)
    return s
  }

  // The CSS pixels one canvas pixel of the game's is drawn across on the page: the `scale` of the
  // renderer the scene names, which render2d's `fit` sets, or 1.
  const scale = (): number => (plugins?.render3d ?? plugins?.render2d)?.scale ?? 1

  const engine = (): { width: number; height: number } => {
    const e = plugins!.wire.scene.prefabs.engine
    if (typeof e?.width !== 'number' || typeof e?.height !== 'number') throw new Error('ui needs width and height in the engine prefab')
    return e
  }

  // The canvas's size in its own pixels: the game renderer's `size` where it has one, the window's
  // under render2d's `fit: "window"`, else the `engine` prefab's.
  const area = (): { width: number; height: number } => {
    const size: [number, number] | undefined = (plugins?.render3d ?? plugins?.render2d)?.size
    return size && size[0] > 0 ? { width: size[0], height: size[1] } : engine()
  }

  // A panel placed on the canvas as it is now, and its backdrop as big as the canvas.
  const lay = (panel: Panel) => {
    if (panel.surfaced) return
    const s = panel.spec, f = ANCHORS[s.anchor], [w, h] = s.size ?? [0, 0], [x, y] = s.at ?? [0, 0], k = s.scale ?? 1
    const { width, height } = area()
    panel.box.position.set(f[0] * (width - w * k) + x, f[1] * (height - h * k) + y)
    if (panel.backdrop) {
      panel.backdrop.clear().rect(0, 0, width, height).fill(s.backdrop ?? { color: 0, alpha: 0 })
      panel.backdrop.hitArea = new PIXI.Rectangle(0, 0, width, height)
    }
  }

  const made = (name: string): Panel => {
    const had = panels.get(name)
    if (had) return had
    const s = spec(name)
    const f = ANCHORS[s.anchor]
    if (!f) throw new Error(`ui panel ${name} has anchor ${s.anchor}, which is none of ${Object.keys(ANCHORS).join(', ')}`)
    if (s.clip && !s.size) throw new Error(`ui panel ${name} clips but has no size`)
    const [w, h] = s.size ?? [0, 0]
    const k = s.scale ?? 1
    const box = new PIXI.Container({ label: name })
    box.scale.set(k)
    // Its place among every panel `world.ui` lists, by layer and, within a layer, by the list.
    const all = Object.entries(table().panels)
    box.zIndex = all.map(([n, q], i) => ({ n, layer: q.layer ?? 0, i })).sort((a, b) => a.layer - b.layer || a.i - b.i).findIndex(q => q.n === name)
    const panel: Panel = { name, box, spec: s, shown: new Map(), asked: new Set() }
    if (s.size) box.boundsArea = new PIXI.Rectangle(0, 0, w, h)
    if (s.clip) {
      panel.mask = new PIXI.Graphics().rect(0, 0, w, h).fill()
      box.addChild(panel.mask)
      box.mask = panel.mask
    }
    if (s.modal) {
      panel.backdrop = new PIXI.Graphics()
      panel.backdrop.zIndex = box.zIndex - 0.5
      panel.backdrop.visible = false
      stage.addChild(panel.backdrop)
    }
    stage.addChild(box)
    lay(panel)
    panels.set(name, panel)
    return panel
  }

  // The renderer brings every transform up to date when it draws; a hit test or a move of the focus
  // between frames, or with no renderer, brings them up to date itself.
  const fresh = () => PIXI.updateRenderGroupTransforms(stage.renderGroup, true)

  const within = (c: PIXI.Container | null, of: PIXI.Container) => {
    for (; c; c = c.parent) if (c === of) return true
    return false
  }

  const focusOn = (to: PIXI.Container | undefined) => {
    if (to === focus) return
    const from = focus
    focus = to
    from?.emit('blur')
    to?.emit('focus')
  }

  // The interactive things on a panel, in the order it shows them: the ones a focus key can move the
  // focus to.
  const targets = (c: PIXI.Container, out: PIXI.Container[] = []) => {
    for (const k of c.children) {
      if (!k.visible || k.eventMode === 'none') continue
      if (k.isInteractive()) out.push(k)
      if (k.interactiveChildren) targets(k, out)
    }
    return out
  }

  // Where a thing is on the canvas: the middle of its hit area when it has a rectangle for one,
  // else its origin.
  const where = (c: PIXI.Container) => {
    const a = c.hitArea
    return c.toGlobal(a instanceof PIXI.Rectangle ? { x: a.x + a.width / 2, y: a.y + a.height / 2 } : { x: 0, y: 0 })
  }

  // The modal that has the input: of the modals showing anything, the one drawn over the others.
  const top = () => [...panels.values()]
    .filter(p => p.spec.modal && p.shown.size && p.box.visible)
    .sort((a, b) => b.box.zIndex - a.box.zIndex)[0]

  // Opens a panel, closing the others of its group.
  const opening = (name: string) => {
    const g = spec(name).group
    if (g !== undefined) for (const [n, q] of Object.entries(table().panels)) if (n !== name && q.group === g) open.delete(n)
    open.add(name)
  }

  // The nearest interactive thing inside the quarter of the plane the focus key points into; with none
  // there, the focus stays.
  const move = (on: Panel, [dx, dy]: readonly [number, number]) => {
    fresh()
    const all = targets(on.box)
    if (!all.length) return
    if (!focus || !all.includes(focus)) return focusOn(all[0])
    const from = where(focus)
    let best: PIXI.Container | undefined, near = Infinity
    for (const t of all) {
      if (t === focus) continue
      const p = where(t)
      const along = (p.x - from.x) * dx + (p.y - from.y) * dy
      const across = Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx)
      if (along <= 0 || across > along) continue
      const d = Math.hypot(p.x - from.x, p.y - from.y)
      if (d < near) { near = d; best = t }
    }
    if (best) focusOn(best)
  }

  // The focused thing's `pointertap`, sent the way PixiJS sends a click's: down the path from the
  // stage and back up it.
  const tap = (target: PIXI.Container) => {
    fresh()
    const e = new PIXI.FederatedPointerEvent(boundary)
    e.type = 'pointertap'
    e.target = target
    const p = where(target)
    e.global.set(p.x, p.y)
    boundary.dispatchEvent(e)
  }

  // Whether `world.ui`'s `keys` name this key for `what`.
  const is = (what: keyof Table['keys'], key: string) => {
    const k = table().keys?.[what]
    if (k === undefined) throw new Error(`world.ui has no keys.${what}`)
    return typeof k === 'string' ? k === key : k.includes(key)
  }

  // A key going down, from the keyboard or handed on by `plugins/player` from a gamepad: whether the
  // UI took it, and whether it acted on it, so a keyboard's event has its default cancelled.
  const pressKey = (key: string, repeat: boolean): 'no' | 'took' | 'acted' => {
    down.add(key)
    const up = top()
    if (!up) {
      const opens = Object.entries(table().panels ?? {}).find(([, s]) => s.key === key)
      if (!opens) return 'no'
      opening(opens[0])
      return 'acted'
    }
    // A key held from before the modal came up, or a repeat, is nobody's: not the modal's, and not
    // the game's either, so holding `back` pauses a game once.
    if (repeat || stale.has(key)) return 'took'
    // A screen the game put up goes when a row says so, so backing out of it is the game's.
    if (is('back', key) && !open.has(up.name)) return 'no'
    const way = (Object.keys(WAYS) as (keyof typeof WAYS)[]).find(w => is(w, key))
    if (way) move(up, WAYS[way])
    else if (is('press', key)) { if (focus && within(focus, up.box)) tap(focus) }
    else if (is('back', key) || key === up.spec.key) open.delete(up.name)
    else return 'took'
    return 'acted'
  }
  const liftKey = (key: string) => { down.delete(key); stale.delete(key) }

  // While `plugins/player` listens for a key to rebind an action to, every key is its.
  const onKey = (e: KeyboardEvent) => {
    if (plugins?.player?.listening) return
    const r = pressKey(keyOf(e), e.repeat)
    if (r !== 'no') taken = e
    if (r === 'acted') e.preventDefault()
  }

  const onUp = (e: KeyboardEvent) => liftKey(keyOf(e))

  // The backdrop of a modal is not a thing to focus: the pointer over it is the pointer over nothing.
  // The pointer's page pixels are the canvas's times the game's scale.

  const onPointer = (e: PointerEvent) => {
    const s = scale()
    const t = me.hit(e.offsetX / s, e.offsetY / s)
    if (t && ![...panels.values()].some(p => p.backdrop === t)) focusOn(t)
    else if (!owner) focusOn(undefined)
  }
  const onLeave = () => { if (!owner) focusOn(undefined) }

  const me = {
    PIXI,
    stage,
    button,
    bar,
    iris,
    canvas: undefined as HTMLCanvasElement | undefined,
    // The canvas is hidden until the first `afterTick`, which runs only once the client has been
    // sent a packet, so a canvas with nothing drawn on it is never shown.
    mount(canvas: HTMLCanvasElement) {
      me.canvas = canvas
      canvas.style.display = 'none'
      PIXI.autoDetectRenderer({ canvas, width: canvas.width, height: canvas.height, backgroundAlpha: 0, antialias: true, resolution: devicePixelRatio, autoDensity: true }).then(r => {
        if (closed) r.destroy()
        else renderer = r as PIXI.Renderer
      })
      if (typeof document === 'undefined') return
      PIXI.autoDetectRenderer({ canvas: document.createElement('canvas'), width: 1, height: 1, backgroundAlpha: 1, antialias: true, resolution: devicePixelRatio }).then(r => {
        if (closed) r.destroy()
        else surfacer = r as PIXI.Renderer
      })
    },
    tick(p: Plugins) {
      plugins = p
      if (!me.canvas || listening) return
      listening = true
      addEventListener('keydown', onKey, true)
      addEventListener('keyup', onUp, true)
      me.canvas.addEventListener('pointermove', onPointer)
      me.canvas.addEventListener('pointerleave', onLeave)
    },
    panel(name: string): PIXI.Container { return made(name).box },
    surface(name: string): Surface | undefined {
      const p = made(name)
      if (p.spec.modal) throw new Error(`ui panel ${name} is a modal, which is never drawn on a surface`)
      if (!p.spec.size) throw new Error(`ui panel ${name} is drawn on a surface but has no size`)
      if (!p.surfaced) {
        p.surfaced = true
        stage.removeChild(p.box)
      }
      p.wanted = true
      if (!surfacer) return undefined
      p.surface ??= { canvas: surfacer.canvas as HTMLCanvasElement, box: [0, 0, 0, 0] }
      return p.surface
    },
    show<T extends PIXI.Container>(panel: string, key: string, make: () => T): T {
      const p = made(panel)
      if (p.asked.has(key)) throw new Error(`ui showed ${panel} ${key} twice in one frame`)
      p.asked.add(key)
      let it = p.shown.get(key)
      if (!it) {
        it = make()
        it.label = key
        p.shown.set(key, it)
        p.box.addChild(it)
      }
      return it as T
    },
    style(name: string): Record<string, any> {
      const s = table().styles?.[name]
      if (!s) throw new Error(`ui has no style ${name}`)
      return structuredClone(s)
    },
    open(name: string) { opening(name) },
    dismiss(name: string) { spec(name); open.delete(name) },
    opened(name: string) { spec(name); return open.has(name) },
    // The name of the modal that has the input, or undefined.
    modal(): string | undefined { return owner?.name },
    // The thing under this canvas point that takes the pointer — while a modal is up, its backdrop
    // wherever nothing on it is — or null. `x` and `y` are the click's `offsetX` and `offsetY`.
    hit(x: number, y: number): PIXI.Container | null {
      fresh()
      return boundary.hitTest(x, y)
    },
    // Whether the UI took this key, so it is not a game key.
    took(e: Event) { return e === taken },
    // A gamepad's key going down, as `plugins/player` hands it on: whether the UI took it, so it is
    // not a game key. And the same key coming up.
    keyDown(key: string): boolean { return !plugins?.player?.listening && pressKey(key, false) !== 'no' },
    keyUp(key: string) { liftKey(key) },
    focused(c: PIXI.Container) { return focus === c },
    project(at: number[]): { x: number; y: number; behind: boolean } {
      const r = plugins?.render3d ?? plugins?.render2d
      if (!r) throw new Error('ui.project needs render3d or render2d, and this scene names neither')
      return r.project(at)
    },
    // Placed at the world point after every actor has ticked; not visible while it is behind the
    // camera. A thing pinned one frame and not the next stays where it was last put.
    pin(c: PIXI.Container, at: number[]) { pins.set(c, at) },
    afterTick() {
      for (const p of panels.values()) {
        // A panel no one asked to draw on a surface this frame goes back on the stage.
        if (p.surfaced && !p.wanted) {
          p.surfaced = false
          stage.addChild(p.box)
          lay(p)
        }
        p.wanted = false
        for (const [key, it] of p.shown) {
          if (p.asked.has(key)) continue
          if (focus && within(focus, it)) focusOn(undefined)
          pins.delete(it)
          it.destroy({ children: true, context: true })
          p.shown.delete(key)
        }
        p.asked.clear()
        const shown = new Set<PIXI.Container>(p.shown.values())
        for (const c of p.box.children) if (c !== p.mask && !shown.has(c)) throw new Error(`ui panel ${p.name} holds a child show did not hand out`)
        // A modal showing anything covers the canvas: its backdrop takes every point its things do
        // not.
        if (!p.backdrop) continue
        p.backdrop.visible = p.shown.size > 0
        p.backdrop.eventMode = p.backdrop.visible ? 'static' : 'none'
      }
      if (focus?.destroyed) focus = undefined
      const up = top()
      if (up !== owner) {
        if (owner && focus && within(focus, owner.box)) had.set(owner, focus)
        owner = up
        stale = new Set(down)
        if (up) {
          const back = had.get(up)
          had.delete(up)
          focusOn(back && !back.destroyed && within(back, up.box) ? back : targets(up.box)[0])
        }
      } else if (up && !focus) {
        // The thing the modal had focused has gone, and the modal still has the input.
        fresh()
        focusOn(targets(up.box)[0])
      }
      for (const [c, at] of pins) {
        if (c.destroyed) continue
        const s = c.parent ? me.project(at) : undefined
        const seen = !!s && !s.behind
        if (seen) c.position.copyFrom(c.parent!.toLocal(s!))
        c.visible = seen
      }
      pins.clear()
      if (!me.canvas) return
      // As big on the page as the game's canvas, drawn at the screen's pixel ratio times the game's
      // scale, so a pixel of the UI covers the physical pixels one of the game's does.
      const s = scale(), { width, height } = area()
      if (renderer && (renderer.resolution !== devicePixelRatio * s || renderer.screen.width !== width || renderer.screen.height !== height)) {
        renderer.resize(width, height, devicePixelRatio * s)
        for (const p of panels.values()) lay(p)
      }
      if (me.canvas.style.width !== `${width * s}px`) me.canvas.style.width = `${width * s}px`
      if (me.canvas.style.height !== `${height * s}px`) me.canvas.style.height = `${height * s}px`
      me.canvas.style.display = ''
      // The listed panels drawn on surfaces are off the stage, and are drawn between the steps too.
      const listed = Object.keys(table().panels)
      const on = [...panels.values()].filter(p => p.surfaced).sort((a, b) => listed.indexOf(a.name) - listed.indexOf(b.name))
      if (plugins) {
        const things = all(stage)
        for (const p of on) all(p.box, things)
        between.place(things, plugins.wire)
      }
      try {
        renderer?.render(stage)
        // The surfaces side by side along the top of their canvas, each on its own colour.
        if (!surfacer || !on.length) return
        const res = renderer?.resolution ?? devicePixelRatio
        let across = 0, tall = 0
        for (const p of on) {
          const [w, h] = p.spec.size!, k = p.spec.scale ?? 1
          p.surface ??= { canvas: surfacer.canvas as HTMLCanvasElement, box: [0, 0, 0, 0] }
          p.surface.box = [across, 0, Math.round(w * k * res), Math.round(h * k * res)]
          across += p.surface.box[2] + 1
          tall = Math.max(tall, p.surface.box[3])
        }
        if (surfacer.resolution !== res || surfacer.screen.width !== across / res || surfacer.screen.height !== tall / res) surfacer.resize(across / res, tall / res, res)
        grounds.clear()
        for (const p of on) {
          const [x, , w, h] = p.surface!.box
          grounds.rect(x / res, 0, w / res, h / res).fill({ color: p.spec.screen ?? 0 })
        }
        surfacer.render({ container: grounds, clearColor: [0, 0, 0, 1] })
        for (const p of on) {
          const k = p.spec.scale ?? 1
          surfacer.render({ container: p.box, clear: false, transform: new PIXI.Matrix().scale(k, k).translate(p.surface!.box[0] / res, 0) })
        }
      } finally {
        between.restore()
      }
    },
    close() {
      closed = true
      if (listening) {
        listening = false
        removeEventListener('keydown', onKey, true)
        removeEventListener('keyup', onUp, true)
        me.canvas?.removeEventListener('pointermove', onPointer)
        me.canvas?.removeEventListener('pointerleave', onLeave)
      }
      focus = undefined
      for (const p of panels.values()) {
        if (p.surfaced) p.box.destroy({ children: true, context: true })
      }
      renderer?.destroy()
      renderer = undefined
      surfacer?.destroy()
      surfacer = undefined
      grounds.destroy()
      stage.destroy({ children: true, context: true })
      me.canvas?.remove()
    },
  }
  return me
}
