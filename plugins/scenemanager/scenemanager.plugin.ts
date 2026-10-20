// The browser side. A page makes one link — one seat — and `view` in the addon holds one client on
// it, for the scene the seat is on. That client's scenemanager is mounted on the link under the
// scene's name and handed that scene's packets; when the seat moves, the client is closed and a
// new one is made for the scene it moved to.
import type { Arg, Packet, Pipe } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Link } from '#addons/scenemanager/scenemanager.addon.ts'

// Naming the next scene is an ordinary send down the pipe this page already has. The engine routes
// it to this scene's own `scenemanager` row, the act writes the name and the arguments there, and
// the addon takes them off once this scene's step is over.
export function scenemanager() {
  let plugins: Plugins | undefined
  const inbox: Packet[] = []
  const me = {
    pipe: undefined as Pipe | undefined,
    // Whether the seat is still on this client's scene. False from the moment the link carries a
    // packet of another scene, so a key pressed before the page has closed this client sends
    // nothing to a scene the seat has left.
    here: false,
    // The page's link, which outlives this client and every other one the page makes.
    link: undefined as Link | undefined,
    // Mounted on the link for one visit: `seat` on scene `name`, which every message names.
    mount(wire: Link, name: string, seat: number) {
      me.link = wire
      me.here = true
      me.pipe = {
        send: msg => { if (!me.here) return false; wire.send({ scene: name, seat, msg }); return true },
        take: () => inbox.splice(0),
        // Closing the client shuts this client's door onto the link. The link is the page's.
        close: () => { me.here = false },
      }
    },
    // A packet of this client's scene, from the page's link.
    hand(packet: Packet) { inbox.push(packet) },
    tick(p: Plugins) { plugins = p },
    go(name: string, ...args: Arg[]) {
      if (!plugins) throw new Error('scenemanager has not ticked yet')
      const row = plugins.wire.rows.find(r => r.kind === 'scenemanager')
      if (!row) throw new Error('no scenemanager row in this packet')
      plugins.wire.send(row.id, 'go', name, ...args)
    },
  }
  return me
}
