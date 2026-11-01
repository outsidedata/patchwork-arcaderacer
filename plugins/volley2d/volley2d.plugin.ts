// The browser half of volley2d: every bullet in the air drawn in render2d's world, from the ledger
// row the packet carries, and the page's own volleys, which no row holds. Each frame each entry's
// bullets are found where their volley's age puts them (`points` in `volley2d.sim.ts`, which says
// what a pattern holds and what every field means) and each is drawn as frame 0 of its pattern's
// `clip` of its `sheet`, turned along its heading when the pattern `orient`s it, on the render2d
// layer its pattern names, else `world.volley2d.layer`. A bullet whose pattern names no sheet is not
// drawn, and one whose sheet the loader has not handed over yet is hidden while the sheet is asked
// for.
//
// It keeps no ledger of the row's entries: a bullet drawn from the row is a bullet the last packet's
// row has in the air, so one the server has taken out, by a hit or a bomb, is gone from the page the
// frame the packet says so.
//
// The page's own volleys are `preview`, fired by `fire(pattern, at, dir)`, which hands back the
// entry: a volley of the pattern from the world point `at` toward `dir`, radians from the world's x
// toward its y, drawn exactly as an entry of the row, on no row and sent to no seat, what an editor
// previews a pattern with. It flies in the frame as the row's entries do, its point taken off the
// row's `frame` the first frame it is drawn, so a view that scrolls carries it along. Its age is 0
// the first frame it is drawn and grows by the scene's `dt` each frame after; each frame, as the
// server does in `before`, every bullet of it that has flown out of `world.volley2d.bounds` or past
// its life is gone, and once every bullet is gone it leaves `preview`. One whose pattern the file does
// not have, or no longer builds, as a file the editor has written may say, draws nothing and leaves
// `preview` that frame; a row's entry of such a pattern throws, as the server's step does.
//
// Each bullet has a sprite of its own for its whole life, keyed by its volley (the row's or the
// page's) and entry id and its number in the pattern: made the first frame the bullet is drawn,
// destroyed the first frame it is not. render2d draws each thing between where the last two steps
// put it, and knows a thing by its sprite, so a sprite handed from one bullet to another would be
// drawn part way between the two, a bullet for a frame where none is. A new sprite is a thing that
// came with the newest step, which render2d holds back until the clock reaches it. They are placed in
// `afterTick`, after render2d's `tick` has read the world, and so this plugin is listed before
// `render2d`, whose `afterTick` draws; `close` frees every sprite and empties `preview`, and the
// sheets are the loader's.
import type { Plugins } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { ahead, points, shots, type Entry, type Patterns, type Point, type Shot } from './volley2d.sim.ts'

export function volley2d() {
  // Each bullet's sprite, by `<volley>:<entry id>:<number in the pattern>`.
  let sprites = new Map<string, any>()
  let preview: Entry[] = []
  // The page's volleys fired since the last frame, whose point is still a point of the world.
  let fresh = new Set<Entry>()
  let fired = 0
  return {
    // A volley of the page's own, from the next frame on.
    fire(pattern: string, at: number[], dir: number): Entry {
      const e: Entry = { id: ++fired, pattern, side: '', at: [at[0], at[1]], dir, age: 0, gone: [], grazed: [] }
      preview.push(e)
      fresh.add(e)
      return e
    },
    // Every volley of the page's own in the air.
    get preview(): readonly Entry[] { return preview },
    afterTick(plugins: Plugins) {
      const cfg = plugins.wire.scene.world?.volley2d
      if (!cfg) throw new Error('the scene names volley2d but gives no world.volley2d')
      const { render2d, loader } = plugins
      const row = plugins.wire.rows.find(r => r.kind === 'volley2d')
      const frame: number[] = row?.data.frame ?? [0, 0]
      const [ox, oy] = render2d.place([0, 0])
      const drawn = new Map<string, any>()
      const draw = (volley: string, e: Entry, p: Point) => {
        const { sheet: name, clip, orient } = p.shot
        if (!name || !clip) return
        const sheet = loader.get(name)
        if (!sheet) return void loader.load(name)
        const key = `${volley}:${e.id}:${p.k}`
        const s = sprites.get(key) ?? new render2d.PIXI.Sprite()
        drawn.set(key, s)
        const layer = render2d.layer(p.shot.layer ?? cfg.layer)
        if (s.parent !== layer) layer.addChild(s)
        const f = sheet.frameOf(clip, 0, 0)
        s.texture = sheet.texture(f.id)
        s.anchor.set(f.anchor[0] / f.size[0], f.anchor[1] / f.size[1])
        const [x, y] = render2d.place(p.pos)
        const nearest = sheet.data.nearest
        s.roundPixels = nearest
        s.position.set(nearest ? Math.round(x) : x, nearest ? Math.round(y) : y)
        if (orient) {
          const [hx, hy] = render2d.place([Math.cos(p.heading), Math.sin(p.heading)])
          s.rotation = Math.atan2(hy - oy, hx - ox) - Math.PI / 2
        } else s.rotation = 0
        s.visible = true
      }
      if (row || preview.length) {
        const file: Patterns = json(plugins.wire, cfg.patterns)
        if (row) for (const e of row.data.live as Entry[]) for (const p of points(shots(file, e.pattern), e, frame)) draw('row', e, p)
        if (preview.length) {
          const dt = plugins.wire.scene.prefabs.engine?.dt
          if (!dt) throw new Error('scene has no engine prefab with dt')
          const [l, t, r, b] = cfg.bounds as number[]
          preview = preview.filter(e => {
            let list: Shot[]
            try {
              list = shots(file, e.pattern)
            } catch {
              return false
            }
            if (fresh.has(e)) e.at = [e.at[0] - frame[0], e.at[1] - frame[1]]
            else e.age += dt
            const gone = new Set(e.gone)
            list.forEach((shot, k) => {
              if (gone.has(k) || e.age < shot.t0) return
              const p = ahead(shot, e, [0, 0], e.age)
              if (!p || p.pos[0] < l || p.pos[0] > r || p.pos[1] < t || p.pos[1] > b) gone.add(k)
            })
            e.gone = [...gone].sort((x, y) => x - y)
            return e.gone.length < list.length
          })
          for (const e of preview) for (const p of points(shots(file, e.pattern), e, frame)) draw('preview', e, p)
        }
      }
      fresh = new Set()
      for (const [key, s] of sprites) if (!drawn.has(key)) s.destroy()
      sprites = drawn
    },
    close() {
      for (const s of sprites.values()) s.destroy()
      sprites = new Map()
      preview = []
      fresh = new Set()
    },
  }
}
