// vision: the fog of war over render2d's world, the page's half of team vision. The server half is
// `addons/vision`, which sends a seat only the rows its team sees; this draws, over the map, what
// the seat's team sees now clear, what it has seen before and sees no more dimmed, and what it has
// never seen dark. It has no row: its numbers are the scene's `world.vision`, the block the addon
// reads (its header), and these of its own:
//   layer       the render2d layer the fog is drawn on, one over the things it covers;
//   unexplored  the fog's opacity, 0 to 1, over a cell the team has never seen;
//   explored    its opacity over a cell the team has seen before and sees no more.
//
// What the team sees is worked out here from the rows the seat is sent, as the addon works it out
// on the server (`sight`): every seer of the seat's team is sent to it, its own rows always, so the
// two agree. The seat's team is the team of the slot its `player` row holds in `seat`
// (`addons/player`). What it has seen is the page's own memory, kept for as long as this client is,
// so a seat that leaves the scene and comes back has seen nothing. Before the seat's `player` row
// arrives, the whole map is dark.
//
// The fog is one texture a pixel a cell, drawn across the map through render2d's ground, so it
// follows the camera as the ground does; drawn smooth, a cell's edge fades into the next over a
// cell. It is placed in `afterTick`, after render2d's `tick` has read the world, and so this plugin
// is listed before `render2d`, whose `afterTick` draws.
//
// `cells()` is what the fog was last drawn from, for a map of the page's own (a minimap): a byte a
// cell, c = y × across + x, 0 where the team has never seen, 1 where it has seen before and sees no
// more, 2 where it sees now; undefined before the fog is first drawn. It is this client's, written
// in place each `afterTick`, so what reads it in a `tick` reads the frame before's.
// `shade(plugins, state)` is the fog's opacity over a cell in that state, 0 where the team sees now,
// so a map of the page's own darkens each cell as the fog does.
import type { Plugins } from '#engine/browser.ts'
import { sight, teamOf, type Block } from '#addons/vision/vision.addon.ts'
import { possessed } from '#addons/player/player.addon.ts'

type Fog = Block & { layer: string; unexplored: number; explored: number }

export function vision() {
  let drawn: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData; texture: any; sprite: any } | undefined
  let explored: Uint8Array | undefined
  let cells: Uint8Array | undefined

  return {
    cells: () => cells,
    shade(plugins: Plugins, state: number): number {
      const fog = plugins.wire.scene.world?.vision as Fog | undefined
      if (!fog) throw new Error('the scene names vision but gives no world.vision')
      return state === 2 ? 0 : state === 1 ? fog.explored : fog.unexplored
    },
    afterTick(plugins: Plugins) {
      const { render2d, wire } = plugins
      if (!render2d.canvas) return
      const fog = wire.scene.world?.vision as Fog | undefined
      if (!fog) throw new Error('the scene names vision but gives no world.vision')
      const { PIXI } = render2d
      const [w, h] = fog.size
      if (!drawn) {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        const texture = PIXI.Texture.from(canvas)
        const sprite = new PIXI.Sprite(texture)
        const [ax, ay] = render2d.place([fog.cell, 0]), [bx, by] = render2d.place([0, fog.cell])
        sprite.setFromMatrix(new PIXI.Matrix(ax, ay, bx, by, 0, 0))
        render2d.layer(fog.layer).addChild(sprite)
        drawn = { canvas, ctx, image: ctx.createImageData(w, h), texture, sprite }
        explored = new Uint8Array(w * h)
        cells = new Uint8Array(w * h)
      }
      const me = possessed(wire.rows)
      const team = teamOf(fog, me?.data.seat)
      const now = team === undefined ? undefined : sight(fog, wire.rows.filter(r => teamOf(fog, r.data[fog.slot]) === team)).get(team)
      const px = drawn.image.data
      for (let c = 0; c < w * h; c++) {
        if (now?.[c]) explored![c] = 1
        cells![c] = now?.[c] ? 2 : explored![c]
        px[c * 4 + 3] = now?.[c] ? 0 : Math.round(255 * (explored![c] ? fog.explored : fog.unexplored))
      }
      drawn.ctx.putImageData(drawn.image, 0, 0)
      drawn.texture.source.update()
    },
    close() {
      drawn?.sprite.destroy()
      drawn?.texture.destroy(true)
      drawn = undefined
      cells = undefined
    },
  }
}
