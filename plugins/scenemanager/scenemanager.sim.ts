import type { Kind } from '#engine/engine.ts'

// The row is how a scene file carries the table of scenes, the step size and the name of the
// entry scene. The addon does the stepping, because stepping a truth is engine work.
//
// A child scene carries this row too, with an `out` of its own, and `names`, the names of the
// manager's table, which the addon writes into the child's prefab as it loads it. `out` is a table
// from seat number to the scene that seat goes to next and the arguments that travel with it.
// `go` is in `open`, so `answer()` runs its check like it does for every other message: a seat
// sends `go` at that row, the engine decides, and the act runs in game space. A seat's message
// arrives from outside the program, so `go` refuses a name that is not one of `names`, writing
// nothing, and the seat stays where it is. The addon reads the slot off the row once that child's
// step is over, moves the seat, and hands the arguments to the new scene's `player` row as an
// `arrive` act; or, where every seat of the scene named is taken, clears the slot and leaves the
// seat where it is, and the child may send it again.
//
// A child calls it as `w.call(w.find('scenemanager'), 'go', seat, name, ...args)`. `seat` is the
// seat's number on this truth, which is what `out` is keyed by, not the slot on its `player` row:
// an act passes the `seat` it was handed. A hook has no seat, so a `player` row keeps the number its
// `arrive` act was handed for a hook to pass.
export const scenemanager: Kind = {
  acts: {
    go: (me, _w, seat, name: string, ...args) => {
      if (!(me.data.names as string[] | undefined)?.includes(name)) return
      me.data.out[seat] = { scene: name, args }
    },
  },
  open: ['go'],
}
