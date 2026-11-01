// The browser half of box3d. An actor hands it an object to follow its row; after every frame
// the object takes the row's `pos` and `rot`. How a body is drawn is the actor's; where it is, is
// the row's. The `rot` a page that runs ahead eases (`addons/predict`, Easing a jump) is a blend of
// two turns number by number, so it is made a unit turn again before it is drawn.
// One of these per client: the table of followed objects is this scene's.
import type { Plugins } from '#engine/browser.ts'

// A followed object is tagged with the row it follows, `userData.row`, so whatever reports where things
// were drawn names each by its row (`drew` in render3d).
type Followed = { position: { fromArray(a: number[]): void }; quaternion: { fromArray(a: number[]): { normalize(): unknown } }; userData?: Record<string, unknown> }

export function box3d() {
  const followed = new Map<number, Followed>()
  return {
    follow(id: number, obj: Followed) {
      if (obj.userData) obj.userData.row = id
      followed.set(id, obj)
    },
    drop(id: number) { followed.delete(id) },
    afterTick(plugins: Plugins) {
      for (const row of plugins.wire.rows) {
        const obj = followed.get(row.id)
        if (!obj) continue
        obj.position.fromArray(row.data.pos)
        obj.quaternion.fromArray(row.data.rot).normalize()
      }
    },
  }
}
