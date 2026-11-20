// The browser half of volley2d: every bullet in the air drawn in render2d's world, from the ledger
// row the packet carries. Each frame each entry's
// bullets are found where their volley's age puts them (`points` in `volley2d.sim.ts`, which says
// what a pattern holds and what every field means) and each is drawn as frame 0 of its pattern's
// `clip` of its `sheet`, turned along its heading when the pattern `orient`s it, on the render2d
// layer its pattern names, else `world.volley2d.layer`. A bullet whose pattern names no sheet is not
// drawn, and one whose sheet the loader has not handed over yet is hidden while the sheet is asked
// for.
//
// It keeps no ledger of the row's entries: a bullet drawn from the row is a bullet the last packet's
// row has in the air, so one the server has taken out, by a hit or a bomb, is gone from the page the
// frame the packet says so. An entry whose pattern the file does not have, or no longer builds,
// throws, as the server's step does.
//
// Each bullet has a sprite of its own for its whole life, keyed by its entry id and its number in
// the pattern: made the first frame the bullet is drawn,
// destroyed the first frame it is not. render2d draws each thing between where the last two steps
// put it, and knows a thing by its sprite, so a sprite handed from one bullet to another would be
// drawn part way between the two, a bullet for a frame where none is. A new sprite is a thing that
// came with the newest step, which render2d holds back until the clock reaches it. They are placed in
// `afterTick`, after render2d's `tick` has read the world, and so this plugin is listed before
// `render2d`, whose `afterTick` draws; `close` frees every sprite, and the sheets are the loader's.
import type { Plugins } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { points, shots, type Entry, type Patterns, type Point } from './volley2d.sim.ts'

export function volley2d() {
  // Each bullet's sprite, by `<entry id>:<number in the pattern>`.
  let sprites = new Map<string, any>()
  return {
    afterTick(plugins: Plugins) {
      const cfg = plugins.wire.scene.world?.volley2d
      if (!cfg) throw new Error('the scene names volley2d but gives no world.volley2d')
      const { render2d, loader } = plugins
      const row = plugins.wire.rows.find(r => r.kind === 'volley2d')
      const frame: number[] = row?.data.frame ?? [0, 0]
      const [ox, oy] = render2d.place([0, 0])
      const drawn = new Map<string, any>()
      const draw = (e: Entry, p: Point) => {
        const { sheet: name, clip, orient } = p.shot
        if (!name || !clip) return
        const sheet = loader.get(name)
        if (!sheet) return void loader.load(name)
        const key = `${e.id}:${p.k}`
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
      if (row) {
        const file: Patterns = json(plugins.wire, cfg.patterns)
        for (const e of row.data.live as Entry[]) for (const p of points(shots(file, e.pattern), e, frame)) draw(e, p)
      }
      for (const [key, s] of sprites) if (!drawn.has(key)) s.destroy()
      sprites = drawn
    },
    close() {
      for (const s of sprites.values()) s.destroy()
      sprites = new Map()
    },
  }
}
