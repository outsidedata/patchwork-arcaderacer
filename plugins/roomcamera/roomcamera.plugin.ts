// roomcamera: render2d's camera in a world of rooms: a top-down adventure's, cut into rooms, or any
// world whose whole map is its one room. It has no row, no numbers and no server half, and knows
// only what it is handed. Each frame an actor hands `look` the point to look at and the room it
// stands in, a rectangle [x, y, w, h] of the world, its corner of least x and y and its size in steps
// of the world's x and y, and it hands render2d the point the view is held at: the point itself,
// held in far enough that the view shows nothing past the room's edges, or, along an axis on which
// the room is no bigger than the view, the room's middle. While the point walks out of one room into
// the next, the actor also hands it the room it left and how far through the walk it is, 0 to 1,
// and the view is that far along from where it was held in the room it left to where it is held in
// the one it walked into: the view scrolls from room to room.
//
// The view's size in the world is the canvas's (render2d's `size`) over the zoom, over the stage
// pixels a step of the world's x and a step of its y are drawn across, whichever way along the stage
// each goes: for a world whose ground lays x across the stage and y down or up it, as a flat one
// does. `look` is asked in an actor's `tick`, after render2d's first, as render2d's `place` is.
import type { Plugins } from '#engine/browser.ts'

export type Rect = [number, number, number, number]

export function roomcamera() {
  // Where the view is held looking at `at` in a room, the view `half` its size across and down.
  const held = (at: number[], [x, y, w, h]: Rect, half: number[]) => [0, 1].map(a => {
    const lo = [x, y][a], size = [w, h][a]
    return size <= half[a] * 2 ? lo + size / 2 : Math.min(Math.max(at[a], lo + half[a]), lo + size - half[a])
  })
  return {
    look(plugins: Plugins, at: number[], room: Rect, from?: Rect, through = 1) {
      const r2 = plugins.render2d
      const [o, one] = [r2.place([0, 0]), r2.place([1, 1])], { zoom } = r2.camera(), [width, height] = r2.size
      const half = [width / 2 / zoom / Math.abs(one[0] - o[0]), height / 2 / zoom / Math.abs(one[1] - o[1])]
      const to = held(at, room, half)
      if (!from) return r2.look(to)
      const was = held(at, from, half)
      r2.look([was[0] + (to[0] - was[0]) * through, was[1] + (to[1] - was[1]) * through])
    },
  }
}
