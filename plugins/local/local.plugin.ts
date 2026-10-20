// Local actors: setup, tick, remove like every actor, no row on truth, nothing on the wire.
// Each one is its own instance of `<name>.client.ts` next to the page. The plugin keeps the table, ticks
// each one, and removes the one whose tick returns false.
// `spawn(name, data)` is `w.spawn` for the page: the row's `data` is a copy of the scene's
// `prefabs[name]` with `data` written over it, and a name with no prefab throws `no prefab for
// <name>`. The row comes back at once, with a negative id no truth row has, and the actor is imported
// and set up in this plugin's `afterTick`, where the prefab goes under `data`. So a spawn from
// anywhere — a row actor's `setup` on the first packet, before any plugin has ticked, an actor's
// `tick`, a click between frames — is set up by the next `afterTick`, and one asked for during an
// actor's `tick` is set up that frame, before the plugins listed after this one draw it, and ticked
// from the next.
// One of these per client, so the table is this scene's: a local actor a menu makes is not in the
// game's table and stops being ticked the moment the menu's client stops framing.
// Every spawn imports a module instance of its own, as every truth row does, and a browser keeps
// every module a page has imported until the page is reloaded, so the top-level variables of a
// removed local actor are kept with it.
import type { Row } from '#engine/engine.ts'
import type { Actor, Plugins } from '#engine/browser.ts'

export function local() {
  let live: { actor: Actor; row: Row }[] = []
  let asked: Row[] = []
  let n = 0
  let closed = false
  return {
    spawn(name: string, data: Record<string, any> = {}): Row {
      const row = { id: --n, kind: name, data }
      asked.push(row)
      return row
    },
    get rows(): Row[] { return live.map(l => l.row) },
    tick(p: Plugins) {
      live = live.filter(({ actor, row }) => {
        if (actor.tick(row, p) !== false) return true
        actor.remove(p)
        return false
      })
    },
    // Every actor asked for since the last one is set up, in the order asked for, before the plugins
    // after this one draw.
    async afterTick(p: Plugins) {
      const now = asked
      asked = []
      const { prefabs = {} } = p.wire.scene
      for (const row of now) {
        if (!(row.kind in prefabs)) throw new Error(`no prefab for ${row.kind}`)
        row.data = { ...structuredClone(prefabs[row.kind]), ...row.data }
      }
      const actors: Actor[] = await Promise.all(now.map(row =>
        import(/* @vite-ignore */ new URL(`${row.kind}.client.ts?local=${row.id}`, p.wire.home).href)))
      if (closed) return
      now.forEach((row, i) => {
        actors[i].setup(row, p)
        live.push({ actor: actors[i], row })
      })
    },
    // Closing the client removes every local actor. One asked for and not yet set up never is.
    close(p: Plugins) {
      closed = true
      for (const { actor } of live) actor.remove(p)
      live = []
      asked = []
    },
  }
}
