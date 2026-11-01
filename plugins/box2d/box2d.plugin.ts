// The browser half of box2d. An actor hands it an object to follow its row; after every frame the
// object stands where the row's `pos` is and turns as its `rot` does. How a body is drawn is the
// actor's; where it is, is the row's.
// Where the scene gives render2d a world, a row's point is put where render2d's `place` puts it on
// the world, and the object turns the way the body's own x axis goes there, so a world whose y grows
// up the screen draws a body's turn counter-clockwise, as Box2D's angle goes. Without one, a point is
// the canvas's pixels and the object turns by the body's angle, from x toward y.
// One of these per client: the table of followed objects is this scene's.
import type { Plugins } from '#engine/browser.ts'

type Followed = { position: { set(x: number, y: number): void }; rotation: number }

export function box2d() {
  const followed = new Map<number, Followed>()
  return {
    follow(id: number, obj: Followed) { followed.set(id, obj) },
    drop(id: number) { followed.delete(id) },
    afterTick(plugins: Plugins) {
      const place: ((p: number[]) => number[]) | undefined = plugins.render2d?.world ? plugins.render2d.place : undefined
      for (const row of plugins.wire.rows) {
        const obj = followed.get(row.id)
        if (!obj) continue
        const [c, s] = row.data.rot
        const [x, y] = place ? place(row.data.pos) : row.data.pos
        const [ax, ay] = place ? place([c, s]) : [c, s]
        obj.position.set(x, y)
        obj.rotation = Math.atan2(ay, ax)
      }
    },
  }
}
