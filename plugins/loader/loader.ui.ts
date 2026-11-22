// The loader's mod of the ui: the loading screen. It delivers the ui one word, `loading`, so a panel
// of `world.ui` that gives `loading` is drawn as the screen a player looks at while the scene's art
// comes down, and goes once it has: a scene names it in `world.ui.mods.behaviors: ['loader']`, and
// lists `loader` before `ui` in its `plugins` (the ui checks).
//
//   "panels": {
//     "loading": {
//       "anchor": "center", "size": [1280, 720], "layer": 100, "modal": true,
//       "loading": {
//         "fill": { "color": 0 },
//         "pictures": [{ "picture": "splash", "at": [0, 0], "size": [1280, 720] },
//                      { "picture": "logo", "at": [440, 80], "size": [400, 200] }],
//         "bar": { "at": [340, 620], "size": [600, 12], "edge": 2, "frame": { "color": 16777215 },
//                  "track": { "color": 2105376 }, "fill": { "color": 16765440 } },
//         "lines": { "style": "tip", "at": [640, 670], "every": 4, "text": ["Hold shift to run.", "..."] },
//         "shaders": { "style": "tip", "at": [640, 670], "text": "Compiling shaders" },
//         "fade": 0.6
//       }
//     }
//   }
//
// Every field is the scene's, and every place and size is in the panel's own pixels, as an actor's
// are:
//
//   fill      what covers the whole canvas under everything else, a PixiJS fill; black when left out.
//   pictures  drawn in their order over the fill, each `picture` a `texture` entry of the loader's
//             catalogue `for: "ui"` not marked `preload: false`, so it starts on the first tick, its top left at
//             `at`, stretched to `size`. Each is drawn once it has landed, the fill alone showing where
//             it has not. A picture that is no such entry throws the first frame.
//   bar       the ui's `bar` (`size`, `edge`, `frame`, `track`), its top left at `at`, filled in `fill`
//             to how much of what the loader's first tick started has landed or failed
//             (`plugins.loader.preloads()`), every entry not marked `preload: false` and every font,
//             never less than the page's loading cover had shown (below); then, while shaders are
//             compiling, to how many of the most it has seen compiling at once have finished; left
//             out, no bar.
//   lines     one line of `text` at a time in the ui's style `style`, its middle at `at`, the next
//             every `every` seconds from the first frame, round again after the last; left out, none.
//             An entry of `text` is a string, or `{ "text": "...", "picture": "ar1" }`: while that line's turn
//             lasts, its `picture` (a `texture` entry for `ui`, preloaded) is drawn with its top left at
//             the panel's top left, at the size the file was made, once it has landed, under the bar and
//             the words, and still while `shaders` says its words in place of the line. A line with no
//             picture shows none.
//   shaders   `{ style, at, text }`: the line shown in place of `lines` once every file is in and while
//             shaders are still compiling (`plugins.loader.shaders()`, which counts them through the
//             scene's `world.loader.mods.shaders`, render3d's); left out, nothing is said, and the screen
//             still waits for them.
//   fade      seconds the screen takes to fade out, from the frame everything the first tick started
//             has landed or failed, no shader is compiling, and every plugin the scene's
//             `world.loader.mods.ready` names says the world it draws is whole
//             (`plugins.loader.settled()`; terrain3d's land and lod3d's tiles where the camera stands,
//             through `terrain3d.loader.ts`); 0 takes it away that frame. The bar stays full and the
//             tips go round while the world is still being made.
//
// The screen is shown from the first frame the ui ticks until it has faded, and never again for that
// client: a page makes a client per scene, so each scene shows its own while its own art comes down.
// Give its panel `modal`, so while it is up no click or key reaches the game and the player's keys are
// let go, and a `layer` over every other panel. A scene with nothing to preload shows it for one frame
// and fades it.
//
// The entry scene's screen is drawn before this one: the page's loading cover (`loader.cover.ts`),
// the same screen in the DOM in the page's first bytes, fetching the files while the game's code comes
// down. This takes it off the page the frame after the frame it drew every one of its pictures, so
// the screen never blinks between the two, or once it has faded, whichever comes first.
import type { Plugins } from '#engine/browser.ts'
import type { Bar, Behaviors, Ui } from '../ui/ui.plugin.ts'

// One of `lines.text`: the words alone, or the words and the picture shown while they are.
export type Line = string | { text: string; picture?: string }
export const wordsOf = (line: Line): string => (typeof line === 'string' ? line : line.text)
export const pictureOf = (line: Line): string | undefined => (typeof line === 'string' ? undefined : line.picture)

export type Loading = {
  fill?: unknown
  pictures?: { picture: string; at: [number, number]; size: [number, number] }[]
  bar?: Bar & { at: [number, number]; fill: unknown }
  lines?: { style: string; at: [number, number]; every: number; text: Line[] }
  shaders?: { style: string; at: [number, number]; text: string }
  fade: number
}

// What one client's loading screen on one panel has come to: when it was first drawn and when what it
// waits on was all in, in seconds, the most shaders it has seen compiling at once, and whether it has
// gone.
type Screen = { began: number; over?: number; peak: number; gone: boolean; drawn: boolean }

// The page's loading cover, which drew this screen in the page's first bytes (`loader.cover.ts`): taken
// off the page once this screen is drawn under it. A page has one when the cover has put its fetches
// where the loader reads them.
const COVER = Symbol.for('loader: cover')
export const uncover = () => {
  if (!(globalThis as Record<symbol, unknown>)[COVER]) return
  document.getElementById('loader-cover')?.remove()
}

// How much of its files the page's cover had in, 0 to 1, and 0 on a page with none: the ui's bar never
// shows less while the files come, so taking over from the cover never moves it back. The cover counts
// a file in once fetched, the loader once it has landed, which is later.
const covered = (): number => ((globalThis as Record<symbol, { progress?: () => number } | undefined>)[COVER]?.progress?.() ?? 0)

// The look's numbers, which come from the scene file, checked once.
function check(look: Loading, panel: string, loader: Plugins['loader']) {
  const where = `ui panel ${panel}'s loading`
  if (!(typeof look.fade === 'number' && look.fade >= 0)) throw new Error(`${where} fade ${look.fade} is not a number of seconds from 0`)
  for (const p of look.pictures ?? []) {
    const it = loader.catalogued(p.picture)
    if (!it || it.type !== 'texture' || it.for !== 'ui' || it.preload === false) throw new Error(`${where} picture ${p.picture} is no preloaded texture entry for ui in world.loader.assets`)
  }
  const l = look.lines
  if (l && !(typeof l.every === 'number' && l.every > 0)) throw new Error(`${where} lines every ${l.every} is not a number of seconds above 0`)
  if (l && !(Array.isArray(l.text) && l.text.length > 0)) throw new Error(`${where} lines has no text`)
  for (const line of l?.text ?? []) {
    const name = pictureOf(line)
    if (name === undefined) continue
    const it = loader.catalogued(name)
    if (!it || it.type !== 'texture' || it.for !== 'ui' || it.preload === false) throw new Error(`${where} lines picture ${name} is no preloaded texture entry for ui in world.loader.assets`)
  }
}

export const behaviors = (): Behaviors => {
  const screens = new Map<string, Screen>()
  return {
    loading(look: Loading, { panel, ui, plugins }: { panel: string; ui: Ui; plugins: Plugins }) {
      const loader = plugins.loader
      const now = performance.now() / 1000
      let s = screens.get(panel)
      if (!s) {
        check(look, panel, loader)
        s = { began: now, peak: 0, gone: false, drawn: false }
        screens.set(panel, s)
      }
      if (s.gone) return
      // the frame after one that drew every picture, the cover over it comes off
      if (s.drawn) uncover()
      const { done, of } = loader.preloads()
      const files = of ? done / of : 1
      const pending = loader.shaders()
      s.peak = Math.max(s.peak, pending)
      // the files first, then the shaders still compiling once every file is in
      const compiling = files >= 1 && pending > 0
      const k = compiling ? 1 - pending / s.peak : Math.max(files, covered())
      // and the world the game is played in whole, as every plugin `world.loader.mods.ready` names says
      const whole = loader.settled()
      if (files >= 1 && !pending && whole && s.over === undefined) s.over = now
      const alpha = s.over === undefined ? 1 : look.fade > 0 ? 1 - (now - s.over) / look.fade : 0
      if (alpha <= 0) {
        s.gone = true
        uncover()
        return
      }
      const { PIXI } = ui
      const box = ui.panel(panel)
      const shown: { alpha: number }[] = []

      // The whole canvas, in the panel's own pixels.
      const { width, height } = ui.area()
      const sx = box.scale.x, sy = box.scale.y
      const cover = ui.show(panel, 'cover', () => new PIXI.Graphics())
      cover.clear().rect(-box.position.x / sx, -box.position.y / sy, width / sx, height / sy).fill((look.fill ?? { color: 0 }) as any)
      shown.push(cover)

      ;(look.pictures ?? []).forEach((p, i) => {
        const sprite = ui.show(panel, `picture ${i}`, () => new PIXI.Sprite())
        const tex = loader.get(p.picture)
        sprite.visible = !!tex
        if (tex && sprite.texture !== tex) sprite.texture = tex
        sprite.position.set(p.at[0], p.at[1])
        sprite.width = p.size[0]
        sprite.height = p.size[1]
        shown.push(sprite)
      })

      // The picture of the line whose turn it is, at the panel's top left corner at the size it was made,
      // once it has landed: under the bar and the words, which stay drawn over it, the shaders line too.
      // It is made on the first frame, before the bar and the words, so they stay over it whenever it lands.
      if (look.lines?.text.some(line => pictureOf(line) !== undefined)) {
        const l = look.lines
        const name = pictureOf(l.text[Math.floor((now - s.began) / l.every) % l.text.length])
        const tex = name === undefined ? undefined : loader.get(name)
        const sprite = ui.show(panel, 'line picture', () => new PIXI.Sprite())
        sprite.visible = !!tex
        if (tex && sprite.texture !== tex) sprite.texture = tex
        shown.push(sprite)
      }

      if (look.bar) {
        const b = look.bar
        const bar = ui.show(panel, 'bar', () => ui.bar(b))
        bar.position.set(b.at[0], b.at[1])
        bar.set(k, b.fill as any)
        shown.push(bar)
      }

      if (compiling && look.shaders) {
        const c = look.shaders
        const line = ui.show(panel, 'shaders', () => new PIXI.Text({ text: c.text, style: ui.style(c.style), anchor: 0.5 }))
        line.position.set(c.at[0], c.at[1])
        shown.push(line)
      } else if (look.lines) {
        const l = look.lines
        const current = l.text[Math.floor((now - s.began) / l.every) % l.text.length]
        const line = ui.show(panel, 'line', () => new PIXI.Text({ text: '', style: ui.style(l.style), anchor: 0.5 }))
        line.text = wordsOf(current)
        line.position.set(l.at[0], l.at[1])
        shown.push(line)
      }

      for (const it of shown) it.alpha = alpha
      const named = [...(look.pictures ?? []).map(p => p.picture), ...(look.lines?.text ?? []).map(pictureOf).filter(n => n !== undefined)]
      if (named.every(n => !!loader.get(n))) s.drawn = true
    },
  }
}
